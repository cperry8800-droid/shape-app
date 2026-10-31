// One Shape Score ladder, one palette, on every surface that colors a person by
// their tier. Owner, 2026-10-12, on a screenshot of the app profile's climb:
// "make sure the shape score tier colors relate to profile".
//
// What had drifted, measured before the fix:
//   - website search (pageShell.jsx, siteSearch.js) colored Form teal, Peak violet
//     and Legend pink, so a person's facet in search matched nothing on their profile;
//   - the website profile's climb (livingDesktop.jsx) colored Peak violet, drew the
//     summit flag a fixed rust and the climbed trace a fixed teal;
//   - the app profile's climb drew the summit flag in the member's OWN tier color,
//     so "→ FORM" flew Tempo's gold;
//   - the demo profiles ran a ladder of their own (Spark / Tempo / Surge / Apex,
//     Tempo cyan) that no score can produce;
//   - the first rung was "Raw" on the server, the Score page and the Store, and
//     "Base" on the profile climbs, search, chat and the app's fallbacks.
//
// The canonical palette is tierColors.jsx (website) and BS_TIER_COLORS (app); the
// first assertion holds those two equal, and every other table is held to them.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { stripComments } from './helpers/strip-comments.mjs'

const APP = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'
const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const hex = (c) => {
  const m = String(c).match(/#[0-9a-fA-F]{6}/)
  assert.ok(m, `no hex color in ${c}`)
  return m[0].toLowerCase()
}

const MEMBER_NAMES = ['Raw', 'Tempo', 'Form', 'Peak', 'Legend']
const COACH_NAMES = ['Certified', 'Pro', 'Elite', 'Master', 'Icon']
const THRESHOLDS = [0, 750, 2000, 5000, 15000]

/** The literal after `const NAME =` (or `var NAME =`), up to its matching bracket. */
function literal(src, name) {
  const at = src.search(new RegExp(`(?:const|var|let)\\s+${name}\\s*=`))
  assert.ok(at >= 0, `${name} is not declared`)
  const open = src.indexOf('=', at) + 1
  let depth = 0
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i]
    if (ch === '[' || ch === '{') depth += 1
    else if (ch === ']' || ch === '}') { depth -= 1; if (depth === 0) return src.slice(open, i + 1).trim() }
  }
  throw new Error(`could not find the end of ${name}`)
}
/** A top-level `function NAME(...) {...}`, by brace matching. */
function fn(src, name) {
  const at = src.indexOf(`function ${name}(`)
  assert.ok(at >= 0, `function ${name} is not declared`)
  // The body opens after the parameter list, which may itself hold a `{ d }`.
  let depth = 0
  for (let i = src.indexOf(') {', at) + 2; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1
    else if (src[i] === '}') { depth -= 1; if (depth === 0) return src.slice(at, i + 1) }
  }
  throw new Error(`could not find the end of ${name}`)
}
// Data out of another realm is copied in, or deepEqual trips over its prototypes.
const run = (code) => JSON.parse(JSON.stringify(vm.runInNewContext(`(${code})`)))

// The canonical tables, run rather than re-typed.
const canon = (() => {
  const ctx = { window: {} }
  vm.runInNewContext(read('public/newdesign/tierColors.jsx'), ctx)
  return ctx.window.SHAPE_TIER_COLORS
})()
const CANON_MEMBER = MEMBER_NAMES.map((n) => canon.member[n.toLowerCase()].toLowerCase())

test('the canonical palette is one palette on both surfaces', () => {
  const app = run(literal(read(APP), 'BS_TIER_COLORS'))
  for (const [k, v] of Object.entries(canon.member)) assert.equal(app[k].toLowerCase(), v.toLowerCase(), `app ${k}`)
  for (const [k, v] of Object.entries(canon.coach)) assert.equal(app[k].toLowerCase(), v.toLowerCase(), `app ${k}`)
  // The two ladders share colors rung for rung.
  COACH_NAMES.forEach((n, i) => assert.equal(canon.coach[n.toLowerCase()], canon.member[MEMBER_NAMES[i].toLowerCase()]))
})

test('website search colors a person by the same ladder as their profile', () => {
  for (const file of ['public/newdesign/pageShell.jsx', 'public/newdesign/siteSearch.js']) {
    const rows = run(literal(read(file), 'SS_TIERS'))
    // A literal, never a paper token: `var(--sh-gold, …)` is #86662a on the light paper
    // and `var(--sh-accent3, …)` #0a7a72, a different tier color from the profile's.
    for (const [min, c] of rows) assert.match(c, /^#[0-9a-fA-F]{6}$/, `${file}: the ${min}+ rung is ${c}, not a fixed color`)
    const byMin = new Map(rows.map(([min, c]) => [min, hex(c)]))
    THRESHOLDS.forEach((min, i) => assert.equal(byMin.get(min), CANON_MEMBER[i], `${file}: the ${MEMBER_NAMES[i]} rung (${min}+)`))
  }
})

test('the chat widget colors a person by the same fixed palette', () => {
  const src = read('public/newdesign/chatWidget.jsx')
  const map = run(literal(src, 'CW_TIER_COLORS'))
  for (const [k, v] of Object.entries(map)) {
    assert.match(v, /^#[0-9a-fA-F]{6}$/, `chat ${k} is ${v}, not a fixed color`)
    const want = canon.member[k] || canon.coach[k]
    assert.equal(v.toLowerCase(), want.toLowerCase(), `chat ${k}`)
  }
})

test('the website profile ladder is the canonical one, live and demo alike', () => {
  const shared = read('public/newdesign/livingShared.jsx')
  const ladder = run(literal(shared, 'LV_LADDER'))
  assert.deepEqual(ladder.member.map((r) => r[0]), THRESHOLDS)
  assert.deepEqual(ladder.member.map((r) => r[1]), MEMBER_NAMES)
  assert.deepEqual(ladder.coach.map((r) => r[1]), COACH_NAMES)
  assert.deepEqual(ladder.member.map((r) => r[2].toLowerCase()), CANON_MEMBER)
  assert.deepEqual(ladder.coach.map((r) => r[2].toLowerCase()), CANON_MEMBER)

  const lvTierFor = vm.runInNewContext(`const LV_LADDER = ${literal(shared, 'LV_LADDER')};\n${fn(shared, 'lvTierFor')}\nlvTierFor`)
  const tierOf = vm.runInNewContext(
    `const LV_LADDER = ${literal(shared, 'LV_LADDER')};\nconst LV_TIERS = {};\n${fn(shared, 'lvTierFor')}\n${fn(shared, 'tierOf')}\ntierOf`)
  assert.equal(lvTierFor(749, false).name, 'Raw')
  assert.equal(lvTierFor(750, false).name, 'Tempo')
  assert.equal(lvTierFor(4999, true).name, 'Elite')
  assert.equal(lvTierFor(15000, true).name, 'Icon')
  // A demo persona's tier IS its score's tier: Priya's 1,284 is Tempo, gold.
  const priya = tierOf({ role: 'client', score: 1284 })
  assert.equal(priya.name, 'Tempo')
  assert.equal(priya.color.toLowerCase(), canon.member.tempo.toLowerCase())
  assert.equal(tierOf({ role: 'trainer', score: 4970 }).name, 'Elite')
  // The demo personas name no ladder of their own any more.
  assert.doesNotMatch(stripComments(shared), /\btier:\s*"(spark|surge|apex|tempo)"/)
  // A real profile reads the same function.
  assert.match(stripComments(read('public/newdesign/livingProfilePage.jsx')), /function liveTier\(points, coach\) \{ return lvTierFor\(points, coach\); \}/)
})

test('the website profile climb colors each end by its own tier', () => {
  const src = read('public/newdesign/livingDesktop.jsx')
  const memberLevel = vm.runInNewContext(`${fn(src, 'memberLevel')}\nmemberLevel`)
  const tempo = memberLevel({ score: 1284 })
  assert.equal(tempo.cur, 'Tempo')
  assert.equal(tempo.next, 'Form')
  assert.equal(tempo.baseColor.toLowerCase(), canon.member.tempo.toLowerCase())
  assert.equal(tempo.nextColor.toLowerCase(), canon.member.form.toLowerCase())
  assert.equal(memberLevel({ score: 10 }).cur, 'Raw')
  assert.equal(memberLevel({ score: 6000 }).nextColor.toLowerCase(), canon.member.legend.toLowerCase())
  assert.equal(memberLevel({ score: 2500 }).nextColor.toLowerCase(), canon.member.peak.toLowerCase(), 'Peak is ice, not violet')
  const top = memberLevel({ score: 20000 })
  assert.equal(top.baseColor.toLowerCase(), canon.member.raw.toLowerCase(), 'at the top the base is the first rung')
  assert.equal(top.nextColor.toLowerCase(), canon.member.legend.toLowerCase())

  const visual = stripComments(fn(src, 'TerrainVisual'))
  assert.match(visual, /l 22 7 l -22 7 z`\} fill=\{lvl\.nextColor\}/, 'the summit flag flies the next tier')
  assert.match(visual, /<circle cx=\{base\[0\]\} cy=\{base\[1\]\} r="5" fill=\{lvl\.baseColor\}/, 'the base dot is the rung they stand on')
  assert.match(visual, /<path d=\{ridge\} fill="none" stroke=\{c\} strokeWidth="3\.5"/, 'the climbed trace is the member\'s own tier')
  assert.doesNotMatch(visual, /#e0644b/, 'a fixed rust flag is back')

  const climb = stripComments(fn(src, 'dkClimbCfg'))
  assert.match(climb, /NM = \["Raw", "Tempo", "Form", "Peak", "Legend"\]/)
})

test('the app profile climb flies the next tier on the tier ridge\'s target', () => {
  // The head's mountain and its summit flag went on 2026-10-31 (owner: the member profile in the coach
  // profile's look, "climb in its tab"); the Climb tab's tier ridge carries the next tier's colour now.
  const src = stripComments(read(APP))
  assert.match(src, /targetC: last \? c : bsTierColor\(nextName\) \}/, 'the tier ridge\'s target is the next tier\'s colour')
  assert.match(src, /<circle cx=\{xs\[2\]\} cy=\{ys\[2\]\} r="4\.5" fill="none" stroke=\{climbCfg\.targetC \|\| c\} /, 'the target ring flies the member\'s own tier again')
  // The ridge's own ladder for the Shape Score aspect.
  assert.match(src, /NM = \['Raw', 'Tempo', 'Form', 'Peak', 'Legend'\];/)
})

test('the first rung is Raw everywhere a tier is named, as the server names it', () => {
  const server = read('src/app/api/client/score/route.ts')
  assert.match(server, /\['Raw',\s+0,/, 'the server ladder starts at Raw')
  const app = stripComments(read(APP))
  const bsTierForPoints = vm.runInNewContext(`${fn(app, 'bsTierForPoints')}\nbsTierForPoints`)
  assert.equal(bsTierForPoints(0), 'Raw')
  assert.equal(bsTierForPoints(749), 'Raw')
  assert.equal(bsTierForPoints(750), 'Tempo')
  // No tier ladder in the app or the website still opens on Base. (Training
  // phases legitimately use "Base"; these patterns match only score ladders.)
  assert.doesNotMatch(app, /\[\['Base', 0\]/)
  assert.doesNotMatch(app, /NM = \['Base'/)
  assert.doesNotMatch(app, /_BS_FEED_TIERS = \[[^\]]*'Base'/)
  assert.doesNotMatch(app, /return 'Base';/)
  for (const f of ['public/newdesign/livingDesktop.jsx', 'public/newdesign/chatWidget.jsx', 'public/newdesign/dashClient.jsx']) {
    const s = stripComments(read(f))
    assert.doesNotMatch(s, /"Base", "Tempo"/, `${f} still opens a ladder on Base`)
    assert.doesNotMatch(s, /tier: "Base"/, `${f} still defaults a tier to Base`)
  }
})
