// A coach with an account is rated by its real 1–10 reviews or not at all. Owner,
// 2026-10-12: "the demo ratings are fine, but make sure the review system and star
// rating system is in place for live accounts. 1-10 stars".
//
// What was wrong, measured before the fix:
//   - every live coach card read the `rating` column's `|| 4.8` fallback, doubled
//     (9.6/10), on the website and in the app; nothing writes that column;
//   - a live coach profile inherited the demo persona's 9.94 · 284 reviews, two 10/10
//     testimonials and a "Rating 9.94" track record (website), and the app's coach
//     profile hardcoded the same numbers even when real reviews existed;
//   - the app listing showed the house's example quotes under every coach;
//   - the website had no way to leave a review (the only form was in an orphan);
//   - every app review read and post was a root-relative fetch, which reaches nothing
//     on the native build.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { stripComments } from './helpers/strip-comments.mjs'
import { loadRealModule } from './helpers/load-real-module.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const APP_MKT = 'mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx'
const APP = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'

function fn(src, name) {
  const at = src.indexOf(`function ${name}(`)
  assert.ok(at >= 0, `function ${name} is not declared`)
  let depth = 0
  for (let i = src.indexOf(') {', at) + 2; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1
    else if (src[i] === '}') { depth -= 1; if (depth === 0) return src.slice(at, i + 1) }
  }
  throw new Error(`could not find the end of ${name}`)
}

// The real sign-in classifier: nobody measured is a guest; an outage is not.
const authLookup = await loadRealModule(join(ROOT, 'src/lib/auth-lookup.ts'), { typescript: true, registry: new Map([['@supabase/supabase-js', createRequire(join(ROOT, 'package.json'))('@supabase/supabase-js')]]) })

/** A coach_reviews fake that applies eq / order / range / limit and, like the API,
 *  never returns more than 1,000 rows from one read. Its coach_review_ratings(p_owner, p_slug) is
 *  the migration's (2026-10-28-coach-reviews-members.sql): each slug and account's total and count,
 *  for one coach when either argument is given; `ratingsFn: false` is a database before that
 *  migration (the function is missing); `'error'` is the function failing some other way (a timeout).
 *  `canReadRows: false` is a reader the migration's policy shows no row (a guest, a non-member).
 *  `log` collects what each read asked for: the function's arguments and the rows' filters. */
function reviewsClient(rows, { ratingsFn = true, canReadRows = true, log = null } = {}) {
  return {
    rpc: async (name, args = {}) => {
      if (log) log.push(['rpc', args])
      if (name !== 'coach_review_ratings' || !ratingsFn) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
      if (ratingsFn === 'error') return { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }
      const groups = new Map()
      for (const r of rows) {
        if (args.p_owner != null && r.owner_id !== args.p_owner) continue
        if (args.p_slug != null && r.coach_slug !== args.p_slug) continue
        const k = `${r.coach_slug}|${r.owner_id ?? ''}`
        const g = groups.get(k) || { coach_slug: r.coach_slug, owner_id: r.owner_id ?? null, total: 0, count: 0 }
        g.total += r.rating || 0; g.count += 1; groups.set(k, g)
      }
      return { data: [...groups.values()], error: null }
    },
    from: () => {
      const st = { filters: [], limit: null, range: null }
      const q = {
        select: () => q,
        eq: (c, v) => { if (log) log.push(['eq', c, v]); st.filters.push((r) => r[c] === v); return q },
        in: (c, vals) => { st.filters.push((r) => vals.includes(r[c])); return q },
        order: () => q,
        range: (a, b) => { st.range = [a, b]; return q },
        limit: (n) => { st.limit = n; return q },
        then: (res, rej) => {
          let out = canReadRows ? rows.filter((r) => st.filters.every((f) => f(r))) : []
          if (st.range) out = out.slice(st.range[0], st.range[1] + 1)
          if (st.limit != null) out = out.slice(0, st.limit)
          return Promise.resolve({ data: out.slice(0, 1000), error: null }).then(res, rej)
        },
      }
      return q
    },
  }
}
// `member`: the reader is a signed-in member (computeMembership's answer for them); `signedIn`
// alone is a signed-in reader who isn't one; neither is a guest. `admin`: a member by the e-mail
// allow-list, whose lists the route reads with `adminClient` (the service role). `membershipFails`:
// the membership read errs, which computeMembership throws only when asked to be strict.
// `authOutage`: the sign-in check itself fails (getUser answers a null user with a 5xx error).
async function loadRoute(client, { member = false, admin = false, signedIn = member || admin, adminClient = null, membershipFails = false, authOutage = false, seen = {} } = {}) {
  const require_ = createRequire(join(ROOT, 'package.json'))
  return loadRealModule(join(ROOT, 'src/app/api/coaches/reviews/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', require_('next/server')],
      ['@/lib/request-auth', {
        currentUser: async () => (signedIn ? { id: 'u-reader', email: 'r@example.invalid', email_confirmed_at: 'x' } : null),
        userLookupForRequest: async () => (authOutage ? { user: null, error: { name: 'AuthRetryableFetchError', status: 503, message: 'auth down' } }
          : { user: signedIn ? { id: 'u-reader', email: 'r@example.invalid', email_confirmed_at: 'x' } : null, error: null }),
        clientForRequest: async () => client,
      }],
      ['@/lib/auth-lookup', authLookup],
      ['@/lib/request-utils', { readJson: async () => ({ ok: true, data: {} }) }],
      ['@/lib/membership-core', { computeMembership: async (sb, id, email, opts = {}) => {
        seen.strict = opts.strict === true
        if (membershipFails) { if (opts.strict) throw new Error('profiles read failed'); return { isMember: false, isCoach: false, isAdmin: false, isKnownMinor: false } }
        return { isMember: (member || admin) && id === 'u-reader', isCoach: false, isAdmin: admin && id === 'u-reader', isKnownMinor: false }
      } }],
      ['@/lib/supabase/admin', { createAdminClient: () => { if (!adminClient) throw new Error('no service key'); seen.adminReads = (seen.adminReads || 0) + 1; return adminClient } }],
    ]),
  })
}

test('the API averages each coach by ACCOUNT as well as by slug, from the ratings function or, before it, the rows', async () => {
  const rows = [
    { id: 1, coach_slug: 'ada-coach', rating: 9, owner_id: 'u-ada' },
    { id: 2, coach_slug: 'ada-coach', rating: 6, owner_id: 'u-ada' },
    // the same account under an older listing name still counts for the account
    { id: 3, coach_slug: 'ada-old-name', rating: 3, owner_id: 'u-ada' },
    { id: 4, coach_slug: 'seeded-coach', rating: 10, owner_id: null },
  ]
  // A guest asks. Once the migration has run, the policy shows them no row, so the averages come
  // from the ratings function alone; before it, from the rows anyone could read.
  for (const ratingsFn of [true, false]) {
    const route = await loadRoute(reviewsClient(rows, { ratingsFn, canReadRows: !ratingsFn }))
    const body = await (await route.GET(new Request('https://shape.test/api/coaches/reviews'))).json()
    assert.deepEqual(body.owners, { 'u-ada': { avg: 6, count: 3 } }, `ratings function: ${ratingsFn}`)
    assert.deepEqual(body.summaries['ada-coach'], { avg: 7.5, count: 2 })
    assert.deepEqual(body.summaries['seeded-coach'], { avg: 10, count: 1 })
  }
})

test('members read the reviews; everyone else gets the rating and no words (owner, 2026-10-28)', async () => {
  const OWNER = '22222222-2222-4222-8222-222222222222'
  const REVIEW = '33333333-3333-4333-8333-333333333333'
  const rows = [
    { id: REVIEW, coach_slug: 'ada-coach', rating: 9, owner_id: OWNER, body: 'Clear plans.', author_name: 'Sam R.', created_at: '2026-10-01' },
    { id: '44444444-4444-4444-8444-444444444444', coach_slug: 'ada-coach', rating: 7, owner_id: OWNER, body: 'Good.', author_name: 'Ana P.', created_at: '2026-10-02' },
  ]
  for (const ratingsFn of [true, false]) {
    // A guest, and a signed-in reader who isn't a member. After the migration neither reads a row.
    for (const signedIn of [false, true]) {
      const reader = await loadRoute(reviewsClient(rows, { ratingsFn, canReadRows: !ratingsFn }), { signedIn })
      const who = `${signedIn ? 'signed-in non-member' : 'guest'}, ratings function ${ratingsFn}`
      for (const q of [`?owner=${OWNER}`, '?coach=ada-coach']) {
        const body = await (await reader.GET(new Request(`https://shape.test/api/coaches/reviews${q}`))).json()
        assert.deepEqual(body, { reviews: [], locked: true, avg: 8, count: 2 }, `${q}, ${who}: the rating, no words or authors`)
      }
      const pins = await (await reader.GET(new Request(`https://shape.test/api/coaches/reviews?ids=${REVIEW}`))).json()
      assert.deepEqual(pins, { reviews: [], locked: true }, `${who}: a pinned review is a review, members only`)
    }
    const member = await loadRoute(reviewsClient(rows, { ratingsFn }), { member: true })
    for (const q of [`?owner=${OWNER}`, '?coach=ada-coach']) {
      const body = await (await member.GET(new Request(`https://shape.test/api/coaches/reviews${q}`))).json()
      assert.equal(body.locked, undefined, q)
      assert.deepEqual(body.reviews.map((r) => [r.author, r.text]).sort(), [['Ana P.', 'Good.'], ['Sam R.', 'Clear plans.']], q)
      assert.equal(body.avg, 8)
      assert.equal(body.count, 2)
    }
    const memberPins = await (await member.GET(new Request(`https://shape.test/api/coaches/reviews?ids=${REVIEW}`))).json()
    assert.equal(memberPins.reviews.length, 1)
  }
})

test('a failed membership read is unknown, never "not a member" (Codex P2 on #2492)', async () => {
  const OWNER = '22222222-2222-4222-8222-222222222222'
  const REVIEW = '33333333-3333-4333-8333-333333333333'
  const rows = [{ id: REVIEW, coach_slug: 'ada-coach', rating: 9, owner_id: OWNER, body: 'Clear plans.', author_name: 'Sam R.', created_at: '2026-10-01' }]
  const seen = {}
  const route = await loadRoute(reviewsClient(rows), { signedIn: true, membershipFails: true, seen })
  for (const q of [`?owner=${OWNER}`, '?coach=ada-coach', `?ids=${REVIEW}`]) {
    const res = await route.GET(new Request(`https://shape.test/api/coaches/reviews${q}`))
    assert.equal(res.status, 503, `${q}: unknown, not the paywall`)
    const body = await res.json()
    assert.equal(body.locked, undefined, q)
    assert.equal(body.reviews, undefined, q)
  }
  assert.equal(seen.strict, true, 'the membership read is strict')
  // The sign-in check failing (an auth outage) is unknown too, never a guest (Codex P2 on #2492).
  const outage = await loadRoute(reviewsClient(rows), { authOutage: true })
  for (const q of [`?owner=${OWNER}`, '?coach=ada-coach', `?ids=${REVIEW}`]) {
    const res = await outage.GET(new Request(`https://shape.test/api/coaches/reviews${q}`))
    assert.equal(res.status, 503, `${q}: an auth outage is not a guest`)
  }
})

test('an admin on the allow-list reads every review, through the service role (Codex P2 on #2492)', async () => {
  const OWNER = '22222222-2222-4222-8222-222222222222'
  const REVIEW = '33333333-3333-4333-8333-333333333333'
  const rows = [
    { id: REVIEW, coach_slug: 'ada-coach', rating: 9, owner_id: OWNER, body: 'Clear plans.', author_name: 'Sam R.', created_at: '2026-10-01' },
    { id: '44444444-4444-4444-8444-444444444444', coach_slug: 'ada-coach', rating: 7, owner_id: OWNER, body: 'Good.', author_name: 'Ana P.', created_at: '2026-10-02' },
  ]
  // After the migration the admin's own session reads no row (the policy can't see the allow-list).
  const seen = {}
  const route = await loadRoute(reviewsClient(rows, { canReadRows: false }), { admin: true, adminClient: reviewsClient(rows), seen })
  for (const q of [`?owner=${OWNER}`, '?coach=ada-coach']) {
    const body = await (await route.GET(new Request(`https://shape.test/api/coaches/reviews${q}`))).json()
    assert.equal(body.locked, undefined, q)
    assert.deepEqual(body.reviews.map((r) => r.author).sort(), ['Ana P.', 'Sam R.'], q)
    assert.equal(body.count, 2)
  }
  const pins = await (await route.GET(new Request(`https://shape.test/api/coaches/reviews?ids=${REVIEW}`))).json()
  assert.equal(pins.reviews.length, 1)
  assert.equal(seen.adminReads, 3, 'each list through the service role')
  // A member who isn't an admin reads with their own session.
  const memberSeen = {}
  const member = await loadRoute(reviewsClient(rows), { member: true, adminClient: reviewsClient([]), seen: memberSeen })
  await member.GET(new Request('https://shape.test/api/coaches/reviews?coach=ada-coach'))
  assert.equal(memberSeen.adminReads, undefined, 'never the service role for anyone else')
})

test('a ratings function that fails, rather than is missing, gives no rating, never a partial one from the rows (Codex P2 on #2492)', async () => {
  const OWNER = '22222222-2222-4222-8222-222222222222'
  // Rows the reader can read, so a fallback to them would show: one review of two.
  const rows = [
    { id: 1, coach_slug: 'ada-coach', rating: 9, owner_id: OWNER },
    { id: 2, coach_slug: 'ada-coach', rating: 3, owner_id: OWNER },
  ]
  const route = await loadRoute(reviewsClient(rows, { ratingsFn: 'error' }))
  for (const q of [`?owner=${OWNER}`, '?coach=ada-coach']) {
    // A non-member's answer is the rating, and a locked answer without a count reads as "No reviews
    // yet" on every screen: unknown, not empty (Codex P2 on #2492).
    const res = await route.GET(new Request(`https://shape.test/api/coaches/reviews${q}`))
    assert.equal(res.status, 503, `${q}: the ratings unread is unknown`)
    const body = await res.json()
    assert.equal(body.locked, undefined, q)
    assert.equal(body.count, undefined, q)
  }
  const all = await (await route.GET(new Request('https://shape.test/api/coaches/reviews'))).json()
  assert.deepEqual(all, { summaries: {}, owners: {} })
  // A member's list is the newest 200, so it gives no rating either (Codex P2 on #2492).
  const member = await loadRoute(reviewsClient(rows, { ratingsFn: 'error' }), { member: true })
  for (const q of [`?owner=${OWNER}`, '?coach=ada-coach']) {
    const body = await (await member.GET(new Request(`https://shape.test/api/coaches/reviews${q}`))).json()
    assert.equal(body.reviews.length, 2, q)
    assert.equal(body.avg, undefined, `${q}: no average of the capped page`)
    assert.equal(body.count, undefined, q)
  }
})

test('a profile\'s rating is read for its one coach, never the whole table (Codex P2 on #2492)', async () => {
  const OWNER = '22222222-2222-4222-8222-222222222222'
  const rows = [
    { id: 1, coach_slug: 'ada-coach', rating: 9, owner_id: OWNER },
    { id: 2, coach_slug: 'ada-coach', rating: 7, owner_id: OWNER },
    { id: 3, coach_slug: 'bo-coach', rating: 2, owner_id: null },
  ]
  for (const ratingsFn of [true, false]) {
    const log = []
    const route = await loadRoute(reviewsClient(rows, { ratingsFn, log }))
    const byOwner = await (await route.GET(new Request(`https://shape.test/api/coaches/reviews?owner=${OWNER}`))).json()
    assert.deepEqual([byOwner.avg, byOwner.count], [8, 2])
    assert.deepEqual(log[0], ['rpc', { p_owner: OWNER }], `ratings function ${ratingsFn}: asked for the one account`)
    if (!ratingsFn) assert.ok(log.some((e) => e[0] === 'eq' && e[1] === 'owner_id' && e[2] === OWNER), 'the rows before the migration, for the one account')
    log.length = 0
    const bySlug = await (await route.GET(new Request('https://shape.test/api/coaches/reviews?coach=bo-coach'))).json()
    assert.deepEqual([bySlug.avg, bySlug.count], [2, 1])
    assert.deepEqual(log[0], ['rpc', { p_slug: 'bo-coach' }], `ratings function ${ratingsFn}: asked for the one slug`)
    if (!ratingsFn) assert.ok(log.some((e) => e[0] === 'eq' && e[1] === 'coach_slug' && e[2] === 'bo-coach'))
    log.length = 0
    await route.GET(new Request('https://shape.test/api/coaches/reviews'))
    assert.deepEqual(log[0], ['rpc', {}], 'the marketplace\'s summaries ask for every coach')
  }
})

test('the averages cover every review, not one read\'s worth (Codex, #2313)', async () => {
  // 2,500 reviews of one coach: 1,000 rated 2 and 1,500 rated 10. One capped read
  // would have seen only the 2s.
  const rows = Array.from({ length: 2500 }, (_, i) => ({ id: i + 1, coach_slug: 'busy', rating: i < 1000 ? 2 : 10, owner_id: 'u-busy', created_at: String(i) }))
  // Before the ratings function, from the rows, paged; after it, from its totals. Read as a member.
  for (const ratingsFn of [false, true]) {
  const route = await loadRoute(reviewsClient(rows, { ratingsFn }), { member: true })
  const sum = await (await route.GET(new Request('https://shape.test/api/coaches/reviews'))).json()
  assert.deepEqual(sum.owners['u-busy'], { avg: 6.8, count: 2500 })
  const owner = await (await route.GET(new Request('https://shape.test/api/coaches/reviews?owner=11111111-1111-4111-8111-111111111111'))).json()
  assert.deepEqual(owner, { reviews: [], avg: 0, count: 0 }, 'an unknown account has none')
  const busyRows = rows.map((r) => ({ ...r, owner_id: '11111111-1111-4111-8111-111111111111' }))
  const route2 = await loadRoute(reviewsClient(busyRows, { ratingsFn }), { member: true })
  const owned = await (await route2.GET(new Request('https://shape.test/api/coaches/reviews?owner=11111111-1111-4111-8111-111111111111'))).json()
  assert.equal(owned.reviews.length, 200, 'the list stays the newest 200')
  assert.equal(owned.count, 2500, 'the count is every review')
  assert.equal(owned.avg, 6.8)
  const bySlug = await (await route2.GET(new Request('https://shape.test/api/coaches/reviews?coach=busy'))).json()
  assert.equal(bySlug.count, 2500)
  assert.equal(bySlug.avg, 6.8)
  }
})

test('the app: a live coach is its reviews, on the ten-point scale, never doubled', () => {
  const src = read(APP_MKT)
  const ctx = vm.createContext({})
  vm.runInContext(`${fn(src, 'getCoachRating10')}\n${fn(src, 'formatCoachRating10')}\n${fn(src, 'bsmRankRating')}\n${fn(src, 'bsmMergeReviewSummaries')}`, ctx)
  const { getCoachRating10, formatCoachRating10, bsmRankRating, bsmMergeReviewSummaries } = ctx
  const tr = (_k, o) => o.defaultValue
  // demo rows keep the authored five-point number, doubled
  assert.equal(formatCoachRating10({ rating: 4.8 }, tr), '★ 9.6/10')
  // a live coach with no reviews is New and ranks last
  assert.equal(getCoachRating10({ ratingLive: true, rating: null }), null)
  assert.equal(formatCoachRating10({ ratingLive: true, rating: null }, tr), 'New')
  assert.equal(bsmRankRating({ ratingLive: true, rating: null }), 0)
  // a live 4.5/10 stays 4.5 — the old helper doubled anything ≤ 5 to 9.0
  assert.equal(formatCoachRating10({ ratingLive: true, rating: 4.5 }, tr), '★ 4.5/10')

  const coaches = [
    { ratingLive: true, provider_user_id: 'u-ada', rating: null },
    { ratingLive: true, provider_user_id: 'u-new', rating: null },
    { ratingLive: false, rating: 4.9 },
  ]
  bsmMergeReviewSummaries(coaches, { owners: { 'u-ada': { avg: 8.4, count: 5 } } })
  assert.equal(coaches[0].rating, 8.4)
  assert.equal(coaches[0].reviewCount, 5)
  assert.equal(coaches[1].rating, null, 'no reviews = no rating')
  assert.equal(coaches[2].rating, 4.9, 'a demo row is left alone')
  // a failed summary read never invents a rating
  const c2 = [{ ratingLive: true, provider_user_id: 'u-ada', rating: null }]
  bsmMergeReviewSummaries(c2, null)
  assert.equal(c2[0].rating, null)

  const code = stripComments(src)
  assert.match(code, /const ratingLive = !!row\.owner_id;\n\s+const rating = ratingLive \? null : Number\(row\.rating \|\| 4\.8\);/)
  assert.match(code, /\{!coach\.ratingLive && p\.reviews\.map/, 'the house quotes stay off a live coach')
  assert.match(code, /\{!ownListing && <div/, 'a coach cannot review their own listing')
  assert.match(code, /const coachKind = getPublicProfileKind\(coach\);/, 'the review is filed under the listing\'s role, not its tag (Codex P1)')
  assert.match(code, /setRevAgg\(Number\.isFinite\(Number\(d\.count\)\)/, 'the listing reads the server\'s full count')
})

test('the app reaches the reviews API through apiBaseUrl + Bearer, never a root-relative fetch', () => {
  for (const f of [APP_MKT, APP]) {
    assert.doesNotMatch(stripComments(read(f)), /fetch\(\s*[`'"]\/api\/coaches\/reviews/, `${f} still fetches /api/coaches/reviews root-relative`)
  }
  const backend = stripComments(read('mobile-app/src/services/shapeBackend.js'))
  assert.match(backend, /fetch\(`\$\{apiBaseUrl \|\| ''\}\/api\/coaches\/reviews\$\{query\}`, \{ headers: sessionsAuthHeaders\(\)/)
  assert.match(backend, /window\.ShapeCoachReviews = \{/)
})

test('the app coach profile: real reviews or "New", never the persona\'s 9.94', () => {
  const code = stripComments(read(APP))
  assert.match(code, /const rating = liveCoach \? \(liveAvgAll != null \? liveAvgAll\.toFixed\(1\) : null\) : \(isNutri \? '9\.9' : '9\.94'\);/)
  assert.match(code, /const reviewCount = liveCoach \? \(liveAgg \? liveAgg\.count : \(liveReviews \? liveReviews\.length : 0\)\) : \(isNutri \? 198 : 284\);/, 'the server\'s full count, not the 200 listed')
  assert.match(code, /const liveAvgAll = \(liveAgg && liveAgg\.count > 0\) \? liveAgg\.avg/)
  assert.match(code, /const reviews = liveCoach \? \[\] : isNutri/)
  assert.match(code, /\(liveCoach \? api\.forOwner\(person\.userId\) : api\.forCoach\(slug\)\)/)
  assert.match(code, /\{ratingLabel\} · <span onClick/, 'the hero stat reads the live label')
})

test('the website: cards, profile and the review form', () => {
  const mkt = read('public/newdesign/marketplace.jsx')
  const ctx = vm.createContext({})
  vm.runInContext(`${fn(mkt, 'mkRating10')}\n${fn(mkt, 'mkRatingLabel')}`, ctx)
  assert.equal(ctx.mkRatingLabel({ rating: 4.8 }), '★ 9.6/10', 'a demo card is unchanged')
  assert.equal(ctx.mkRatingLabel({ ratingLive: true, rating10: null }), 'New')
  assert.equal(ctx.mkRatingLabel({ ratingLive: true, rating10: 7.25 }), '★ 7.3/10')
  assert.equal(ctx.mkRating10({ ratingLive: true, rating10: null }), 0, 'an unreviewed coach ranks last')
  assert.match(stripComments(mkt), /rate, rating: row\.owner_id \? null : Number\(row\.rating \|\| 4\.8\),/)

  const page = stripComments(read('public/newdesign/livingProfilePage.jsx'))
  assert.match(page, /if \(coach && !isDerived\) \{\n\s+person\.rating = null;\n\s+person\.reviewCount = 0;\n\s+person\.reviews = \[\];\n\s+person\.lifts = \(person\.lifts \|\| \[\]\)\.filter\(\(l\) => l && l\[0\] !== "Rating"\);/)

  const shared = stripComments(read('public/newdesign/livingShared.jsx'))
  assert.match(shared, /const q = d\.uid \? `owner=\$\{encodeURIComponent\(d\.uid\)\}` : `coach=\$\{encodeURIComponent\(slug\)\}`;/)
  assert.match(shared, /if \(d\.uid \|\| j\.reviews\.length\) setLiveReviews\(j\.reviews\);/, 'a live coach keeps an empty list')
  assert.match(shared, /\{d\.uid && !owner && \(/, 'the form shows on a real coach, not your own profile')
  assert.match(shared, /fetch\("\/api\/coaches\/reviews", \{ method: "POST"/)
  assert.match(shared, /j\.code === "relationship_required"/)
  assert.match(shared, /select\("id, name, monthly_offer, listing_media, at_capacity, capacity_resume_at"\)/, 'the review is filed under the LISTING name')
  assert.match(shared, /shownRating == null\n\s+\? <span[^>]*>New ·/)
  assert.match(shared, /if \(!\(prow && prow\.name\)\) \{ setRevMsg\(/, 'no post before the listing name is known (Codex)')
  assert.match(shared, /disabled=\{!revRating \|\| revBusy \|\| !\(prow && prow\.name\)\}/)
  assert.match(shared, /const reviewsCount = revAgg \? revAgg\.count :/, 'the profile shows the server\'s full count')
})

test('the database holds the same line: members read coach_reviews, everyone reads ratings only', () => {
  const sql = read('supabase-migrations/2026-10-28-coach-reviews-members.sql')
  assert.match(sql, /drop policy if exists "read coach reviews" on public\.coach_reviews;/, 'the open read goes')
  assert.match(sql, /create policy "members read coach reviews" on public\.coach_reviews\s+for select to authenticated\s+using \(user_id = auth\.uid\(\) or owner_id = auth\.uid\(\) or public\.shape_viewer_is_member\(\)\);/)
  assert.doesNotMatch(sql, /for select to anon/, 'anon reads no rows')
  // The member check answers for the caller only, as computeMembership does, and anon cannot run it.
  assert.match(sql, /select auth\.uid\(\) is not null/)
  assert.match(sql, /p\.role in \('trainer', 'nutritionist', 'dietitian'\)/)
  assert.match(sql, /newest\.status in \('active', 'trialing', 'past_due'\)/)
  assert.match(sql, /revoke all on function public\.shape_viewer_is_member\(\) from anon;\ngrant execute on function public\.shape_viewer_is_member\(\) to authenticated;/)
  // The ratings: totals and counts, never a review's words, author or id.
  const ratings = sql.slice(sql.indexOf('create or replace function public.coach_review_ratings('), sql.indexOf('revoke all on function public.coach_review_ratings('))
  assert.match(ratings, /coach_review_ratings\(p_owner uuid default null, p_slug text default null\)\nreturns table \(coach_slug text, owner_id uuid, total bigint, count bigint\)/)
  assert.match(ratings, /where \(p_owner is null or r\.owner_id = p_owner\)\n\s+and \(p_slug is null or r\.coach_slug = p_slug\)/, 'one coach when asked for one')
  assert.doesNotMatch(ratings, /\bbody\b|author_name|user_id|r\.id\b/)
  assert.match(sql, /drop function if exists public\.coach_review_ratings\(\);\ncreate or replace function public\.coach_review_ratings\(/, 'no overload of an earlier draft')
  assert.match(sql, /grant execute on function public\.coach_review_ratings\(uuid, text\) to anon, authenticated;/)
  assert.match(sql, /^begin;[\s\S]*\ncommit;\n$/m)
})

test('locked: each reviews list says members read them, with the rating, and offers the way in', () => {
  // The app's listing and the Signal profile: the answer's `locked`, then a line and a button that
  // asks a guest for an account and a signed-in non-member for the membership checkout.
  for (const [file, set] of [[APP_MKT, 'setRevLocked(d.locked === true);'], [APP, 'setRevLocked(d.locked === true);']]) {
    const src = read(file)
    assert.ok(src.includes(set), `${file} keeps the answer's locked`)
    const at = src.indexOf('data-reviews-locked=""')
    assert.ok(at > 0, `${file} draws the locked line`)
    const block = src.slice(src.lastIndexOf('revLocked &&', at), at + 1200)
    assert.match(block, /revLocked && (revAgg|liveAgg) && (revAgg|liveAgg)\.count > 0/, `${file}: only when there are reviews to read`)
    assert.match(block, /tr\('marketplace:listing\.reviewsMembers'/)
    assert.match(block, /if \(window\.bsRequireAccount && !window\.bsRequireAccount\(tr\('marketplace:listing\.reviewsJoin'[^)]*\)\)\) return; (window\.)?bsStartPlatformCheckout(\?\.)?\(\);/)
  }
  // The app's one membership checkout (its errors, an existing member, a lost session), on window
  // for the marketplace and trainer-profile modules.
  assert.match(read(APP), /Object\.assign\(window, \{[^}]*\bbsStartPlatformCheckout \}\);/)
  // A list that wasn't read (a failed load, or the API's 503 when it can't check a membership or the
  // ratings) is no list: none of them says "No reviews yet" over it (Codex P2 on #2492).
  const mkt = read(APP_MKT)
  assert.ok(mkt.includes('setLiveReviews(d.reviews);\n        setRevRead(true);'), 'the listing marks a read list')
  assert.ok(mkt.includes('{coach.ratingLive && revRead && !liveReviews.length && (revLocked'), 'the listing says nothing over an unread list')
  assert.ok(read(APP).includes('{!liveList.length && !(liveCoach && liveReviews === null) && (revLocked'), 'the Signal profile says nothing over an unread list')
  assert.ok(read('public/newdesign/livingShared.jsx').includes('{!reviewItems.length && !(d.uid && liveReviews === null) && (revLocked'), 'the website says nothing over an unread list')
  // The website's living profile: the same line, and the membership page.
  const web = read('public/newdesign/livingShared.jsx')
  assert.ok(web.includes('setRevLocked(j.locked === true);'))
  assert.match(web, /revLocked && revAgg && revAgg\.count > 0 \? \(\s+<div data-reviews-locked=""[\s\S]{0,300}Members read the reviews\.[\s\S]{0,300}href="Pricing\.html"/)
})
