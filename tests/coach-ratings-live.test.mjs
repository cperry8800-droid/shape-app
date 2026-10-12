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

/** A coach_reviews fake that applies eq / order / range / limit and, like the API,
 *  never returns more than 1,000 rows from one read. */
function reviewsClient(rows) {
  return {
    from: () => {
      const st = { filters: [], limit: null, range: null }
      const q = {
        select: () => q,
        eq: (c, v) => { st.filters.push((r) => r[c] === v); return q },
        in: () => q,
        order: () => q,
        range: (a, b) => { st.range = [a, b]; return q },
        limit: (n) => { st.limit = n; return q },
        then: (res, rej) => {
          let out = rows.filter((r) => st.filters.every((f) => f(r)))
          if (st.range) out = out.slice(st.range[0], st.range[1] + 1)
          if (st.limit != null) out = out.slice(0, st.limit)
          return Promise.resolve({ data: out.slice(0, 1000), error: null }).then(res, rej)
        },
      }
      return q
    },
  }
}
async function loadRoute(client) {
  const require_ = createRequire(join(ROOT, 'package.json'))
  return loadRealModule(join(ROOT, 'src/app/api/coaches/reviews/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', require_('next/server')],
      ['@/lib/request-auth', { currentUser: async () => null, clientForRequest: async () => client }],
      ['@/lib/request-utils', { readJson: async () => ({ ok: true, data: {} }) }],
    ]),
  })
}

test('the API averages each coach by ACCOUNT as well as by slug', async () => {
  const rows = [
    { id: 1, coach_slug: 'ada-coach', rating: 9, owner_id: 'u-ada' },
    { id: 2, coach_slug: 'ada-coach', rating: 6, owner_id: 'u-ada' },
    // the same account under an older listing name still counts for the account
    { id: 3, coach_slug: 'ada-old-name', rating: 3, owner_id: 'u-ada' },
    { id: 4, coach_slug: 'seeded-coach', rating: 10, owner_id: null },
  ]
  const route = await loadRoute(reviewsClient(rows))
  const body = await (await route.GET(new Request('https://shape.test/api/coaches/reviews'))).json()
  assert.deepEqual(body.owners, { 'u-ada': { avg: 6, count: 3 } })
  assert.deepEqual(body.summaries['ada-coach'], { avg: 7.5, count: 2 })
  assert.deepEqual(body.summaries['seeded-coach'], { avg: 10, count: 1 })
})

test('the averages cover every review, not one read\'s worth (Codex, #2313)', async () => {
  // 2,500 reviews of one coach: 1,000 rated 2 and 1,500 rated 10. One capped read
  // would have seen only the 2s.
  const rows = Array.from({ length: 2500 }, (_, i) => ({ id: i + 1, coach_slug: 'busy', rating: i < 1000 ? 2 : 10, owner_id: 'u-busy', created_at: String(i) }))
  const route = await loadRoute(reviewsClient(rows))
  const sum = await (await route.GET(new Request('https://shape.test/api/coaches/reviews'))).json()
  assert.deepEqual(sum.owners['u-busy'], { avg: 6.8, count: 2500 })
  const owner = await (await route.GET(new Request('https://shape.test/api/coaches/reviews?owner=11111111-1111-4111-8111-111111111111'))).json()
  assert.deepEqual(owner, { reviews: [], avg: 0, count: 0 }, 'an unknown account has none')
  const busyRows = rows.map((r) => ({ ...r, owner_id: '11111111-1111-4111-8111-111111111111' }))
  const route2 = await loadRoute(reviewsClient(busyRows))
  const owned = await (await route2.GET(new Request('https://shape.test/api/coaches/reviews?owner=11111111-1111-4111-8111-111111111111'))).json()
  assert.equal(owned.reviews.length, 200, 'the list stays the newest 200')
  assert.equal(owned.count, 2500, 'the count is every review')
  assert.equal(owned.avg, 6.8)
  const bySlug = await (await route2.GET(new Request('https://shape.test/api/coaches/reviews?coach=busy'))).json()
  assert.equal(bySlug.count, 2500)
  assert.equal(bySlug.avg, 6.8)
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
