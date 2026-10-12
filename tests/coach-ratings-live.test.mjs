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

test('the API averages each coach by ACCOUNT as well as by slug', async () => {
  const require_ = createRequire(join(ROOT, 'package.json'))
  const rows = [
    { coach_slug: 'ada-coach', rating: 9, owner_id: 'u-ada' },
    { coach_slug: 'ada-coach', rating: 6, owner_id: 'u-ada' },
    // the same account under an older listing name still counts for the account
    { coach_slug: 'ada-old-name', rating: 3, owner_id: 'u-ada' },
    { coach_slug: 'seeded-coach', rating: 10, owner_id: null },
  ]
  const client = { from: () => ({ select: () => ({ limit: async () => ({ data: rows, error: null }) }) }) }
  const route = await loadRealModule(join(ROOT, 'src/app/api/coaches/reviews/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', require_('next/server')],
      ['@/lib/request-auth', { currentUser: async () => null, clientForRequest: async () => client }],
      ['@/lib/request-utils', { readJson: async () => ({ ok: true, data: {} }) }],
    ]),
  })
  const res = await route.GET(new Request('https://shape.test/api/coaches/reviews'))
  const body = await res.json()
  assert.deepEqual(body.owners, { 'u-ada': { avg: 6, count: 3 } })
  assert.deepEqual(body.summaries['ada-coach'], { avg: 7.5, count: 2 })
  assert.deepEqual(body.summaries['seeded-coach'], { avg: 10, count: 1 })
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
  assert.match(code, /const reviewCount = liveCoach \? \(liveReviews \? liveReviews\.length : 0\) : \(isNutri \? 198 : 284\);/)
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
  assert.match(shared, /\(d\.uid \|\| j\.reviews\.length\)\) setLiveReviews/, 'a live coach keeps an empty list')
  assert.match(shared, /\{d\.uid && !owner && \(/, 'the form shows on a real coach, not your own profile')
  assert.match(shared, /fetch\("\/api\/coaches\/reviews", \{ method: "POST"/)
  assert.match(shared, /j\.code === "relationship_required"/)
  assert.match(shared, /select\("id, name, monthly_offer, listing_media, at_capacity, capacity_resume_at"\)/, 'the review is filed under the LISTING name')
  assert.match(shared, /shownRating == null\n\s+\? <span[^>]*>New ·/)
})
