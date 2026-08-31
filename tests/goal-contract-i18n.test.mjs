// The Goals surface's i18n failure modes, pinned by DRIVING the shipped code.
// Every one of these is silent: parse, tsc, the suite, the parity gate and the
// build all pass while a member reads a raw discipline token, a broken glyph, or
// English in twelve locales.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { bsGoalVerdict } from '../mobile-app/src/services/goalContract.mjs'

const SRC = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'
const CAT = 'mobile-app/src/i18n/catalogs'
const EN = JSON.parse(readFileSync(`${CAT}/en/goal.json`, 'utf8'))

/** A component body, comments stripped — the rationale at each site quotes the
 *  very expressions these tests ban, so a raw-text assertion would fire on its
 *  own explanation. (The trap this repo has now paid for five times.) */
function body(fnName, endMarker) {
  const src = readFileSync(SRC, 'utf8')
  const start = src.indexOf(`function ${fnName}(`)
  assert.ok(start > 0, `${fnName} is gone — this guard is about a component that must exist`)
  const next = src.indexOf(endMarker, start)
  assert.ok(next > start, `could not find the end of ${fnName}`)
  return src
    .slice(start, next)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n')
}

// ⚠ THE END MARKER IS THE NEXT FUNCTION, NOT THE PAGE SHELL. A first cut of this
// file sliced to `function BSClientGoals(` — 2,300 lines further down — and
// swallowed twenty other components, so three assertions "found" defects that
// belonged to BSCycleCalendarPage and friends. Check the check before believing
// the finding: a guard that reads the wrong region reports about the wrong code.
const contractBody = () => body('BSGoalsContract', '\nfunction BSOverallEditSheet(')

test('the discipline maps are THREE keys each, never one frame with {kind}', () => {
  // ⚠ THIS IS THE CUT'S CENTRAL RULE, AND IT IS A NAMING DECISION, NOT A TYPO.
  // `kind` is the STORED discipline token ('training' | 'nutrition' | 'work') —
  // the same value the goal doc is keyed by and the edit sheet writes back. A
  // single key with `{kind}` interpolated would render that raw English id as
  // copy in twelve locales, which is exactly what cut 5's Train tag and cut 6's
  // aisle each cost a design phase to avoid. So: drive the maps, don't grep them.
  const src = contractBody()

  const blocks = ['STATION_LABEL', 'ADD_TARGET', 'RECORD_LINK'].map((name) => {
    const i = src.indexOf(`const ${name} = {`)
    assert.ok(i > 0, `${name} is gone — the station furniture was rewritten`)
    const j = src.indexOf('\n  };', i)
    assert.ok(j > i, `could not find the end of ${name}`)
    return { name, code: src.slice(i, j + 5) }
  })

  // Evaluate the SHIPPED object literals under a translator that renames every
  // key, so an equivalent rewrite passes and a {kind} frame fails.
  const tr = (k, o) => `«${k}»`
  for (const { name, code } of blocks) {
    const out = new Function('tr', `${code}\nreturn ${name}`)(tr)
    const vals = Object.values(out)
    assert.ok(vals.length >= 2, `${name} collapsed to one entry`)
    assert.equal(new Set(vals).size, vals.length,
      `${name}: two disciplines resolve to the SAME key — a {kind} frame is back`)
    for (const [k, v] of Object.entries(out)) {
      assert.match(v, /^«goal:/, `${name}.${k} is not routed through tr()`)
      assert.doesNotMatch(v, /\{/, `${name}.${k} carries a placeholder — the raw token would render as copy`)
    }
  }

  // And the map is the ONE source, read by BOTH the door titles and the station
  // page titles — which is the invariant its comment claims ("a rename can never
  // move one and leave the other"). Assert the wiring, not the absence of a word:
  // banning the literal "Training" would fire on `role: 'Training'` below, which
  // is a STORED TOKEN compared with `.find()`, never rendered.
  for (const kind of ['training', 'nutrition', 'work', 'week']) {
    assert.match(src, new RegExp(`door\\([^)]*STATION_LABEL\\.${kind}`),
      `the ${kind} door does not read STATION_LABEL — a second literal can drift from the station title`)
  }
  assert.match(src, /pageHead\(STATION_LABEL\[view\]/,
    'the station page title does not read STATION_LABEL')
  assert.match(src, /label=\{STATION_LABEL\.terms\}/,
    'the terms station head does not read STATION_LABEL')
})

test("a plan's discipline is a compared TOKEN, never rendered copy", () => {
  // `role` on a plan row is the same class as cut 5's Train tag and cut 6's
  // aisle: it is matched with .find(), so a tr() on it stops the match in twelve
  // locales — silently, with every gate green. It must stay canonical English,
  // and the words a member reads must come from the catalog instead.
  const src = contractBody()
  for (const role of ['Training', 'Nutrition']) {
    assert.match(src, new RegExp(`p\\.role === '${role}'`),
      `the ${role} plan is no longer selected by its token`)
    assert.doesNotMatch(src, new RegExp(`tr\\([^)]*\\)\\s*===\\s*'${role}'`),
      `the ${role} plan role is compared against TRANSLATED copy`)
  }
  // The rendered credit comes from a key, and the coach-authored detail rides in
  // as data — so the words move per locale while the token never does.
  assert.match(src, /goal:station\.creditTrainer/, 'the trainer credit is not keyed')
  assert.match(src, /goal:station\.creditNutritionist/, 'the nutritionist credit is not keyed')
})

test('the verdict accent is peeled codepoint-safely, and only when terminal', () => {
  // Same class as the About page's drop cap: slice(0,-1) splits a surrogate pair
  // and eats half a character. Drive the shipped expressions, do not grep them.
  const src = contractBody()
  assert.match(src, /const leadChars\s*=/, 'the accent derivation is not in the slice')
  const lines = src.split('\n')
    .filter((l) => /const (leadChars|leadLast|leadDot|leadBody)\s*=/.test(l))
    .map((l) => l.trim())
  assert.equal(lines.length, 4, 'expected exactly the four accent-derivation lines')
  const derive = new Function('verdict', `${lines.join('\n')}\nreturn { leadDot, leadBody }`)

  // U+1D7DA MATHEMATICAL DOUBLE-STRUCK DIGIT — one codepoint, two UTF-16 units.
  const astral = { lead: 'Down \u{1D7DA} kg' }
  const a = derive(astral)
  assert.equal(a.leadDot, '', 'an astral final character was mistaken for punctuation')
  assert.equal(a.leadBody, astral.lead, 'the lead lost a character — slice(0,-1) is back')

  // A real terminal stop is still peeled, in both an ASCII and a CJK locale form.
  assert.deepEqual(derive({ lead: '4.2 kg down.' }), { leadDot: '.', leadBody: '4.2 kg down' })
  assert.deepEqual(derive({ lead: '4.2 kg 下降。' }), { leadDot: '。', leadBody: '4.2 kg 下降' })
  // A mid-word final character is never peeled.
  assert.deepEqual(derive({ lead: '4,2 kg abajo' }), { leadDot: '', leadBody: '4,2 kg abajo' })
  // And an empty verdict does not throw or invent a mark.
  assert.deepEqual(derive({ lead: '' }), { leadDot: '', leadBody: '' })
})

test('bsGoalVerdict routes EVERY string through the injected translator', () => {
  // The module is pure and hook-free, so the translator is an argument. Drive it
  // under a translator that renames every key: a hardcoded English fallback that
  // survives the rename is a string that ships English in twelve locales.
  // ⚠ RECORD WHAT THE TRANSLATOR IS ASKED FOR, not only what comes back. Several
  // of these strings NEST — `verdict.onPace` takes the already-translated
  // `verdict.movedUp` as its {moved} variable — so a sentinel translator that
  // ignores vars swallows the inner key and a naive output check reads it as
  // "never reached the render". Asking-set is the honest instrument here.
  const asked = []
  const tr = (k) => { asked.push(k); return `«${k}»` }
  const cases = [
    { args: { start: 0, now: 0, target: 0, unit: 'kg', proj: null }, keys: ['verdict.setTerms', 'verdict.setTermsSub'] },
    { args: { start: 86, now: 81.8, target: 78, unit: 'kg', proj: { state: 'on-pace', projectedLabel: 'Aug 12', slip: null } }, keys: ['verdict.onPace', 'verdict.sub'] },
    { args: { start: 86, now: 81.8, target: 78, unit: 'kg', proj: { state: 'on-pace', projectedLabel: 'Aug 19', slip: 9 } }, keys: ['verdict.subSlip'] },
    { args: { start: 86, now: 81.8, target: 78, unit: 'kg', proj: { state: 'stalled' } }, keys: ['verdict.stalled'] },
    { args: { start: 86, now: 81.8, target: 78, unit: 'kg', proj: { state: 'far' } }, keys: ['verdict.far'] },
    { args: { start: 86, now: 81.8, target: 78, unit: 'kg', proj: { state: 'stale' } }, keys: ['verdict.stale'] },
    { args: { start: 86, now: 77.8, target: 78, unit: 'kg', proj: { state: 'achieved' } }, keys: ['verdict.achieved'] },
    { args: { start: 86, now: 81.8, target: 78, unit: 'kg', proj: null }, keys: ['verdict.toGo'] },
    { args: { start: 86, now: 86, target: 78, unit: 'kg', proj: null }, keys: ['verdict.termsSet'] },
    { args: { start: 70, now: 72.5, target: 76, unit: 'kg', proj: { state: 'on-pace', projectedLabel: 'Sep 3', slip: null } }, keys: ['verdict.movedUp', 'verdict.dirBuild'] },
  ]
  for (const { args, keys } of cases) {
    asked.length = 0
    const v = bsGoalVerdict({ ...args, tr })
    const seen = `${v.lead} ${v.sub}`
    for (const k of keys) assert.ok(asked.includes(`goal:${k}`), `${k} did not reach the catalog for ${JSON.stringify(args.proj)}`)
    // Strip the renamed segments first — «goal:verdict.setTerms» is letters too.
    // (The first cut of this assertion fired on its own sentinel.)
    const residue = seen.replace(/«[^»]*»/g, ' ')
    assert.doesNotMatch(residue, /[A-Za-z]{3,}/, `English survived the rename: ${seen}`)
  }
})

test('a broken or throwing translator degrades to English, never to a raw key', () => {
  // The fallback path exists precisely because the catalog failed to load, so no
  // ICU may be evaluated on it — T() returns the caller's ALREADY-interpolated
  // English. Each of these is a way the runtime can hand back nothing usable.
  const english = bsGoalVerdict({ start: 86, now: 81.8, target: 78, unit: 'kg', proj: { state: 'stalled' } })
  assert.equal(english.lead, '4.2 kg down. Pace has flattened.')
  for (const [name, tr] of [
    ['throws', () => { throw new Error('catalog gone') }],
    ['returns the key', (k) => k],
    ['returns empty', () => ''],
    ['returns null', () => null],
    ['is not a function', 'nope'],
  ]) {
    const v = bsGoalVerdict({ start: 86, now: 81.8, target: 78, unit: 'kg', proj: { state: 'stalled' }, tr })
    assert.equal(v.lead, english.lead, `a translator that ${name} broke the verdict`)
    assert.doesNotMatch(`${v.lead} ${v.sub}`, /goal:/, `a translator that ${name} leaked a raw key on screen`)
  }
})

test('no locale-insensitive case fold runs over translated goal copy', () => {
  // toUpperCase()/toLowerCase() ignore <html lang> (the Turkish dotted-i class
  // this repo has now paid for four times); CSS text-transform does not. `unit`
  // is member-typed free text, so folding it in JS folded a member's own word by
  // English rules. Comments stripped, or this fires on its own rationale.
  const src = contractBody()
  for (const bad of [/\.toUpperCase\(\)/, /\.toLowerCase\(\)/]) {
    assert.doesNotMatch(src, bad, `a locale-insensitive case fold is back in BSGoalsContract`)
  }
  const pure = readFileSync('mobile-app/src/services/goalContract.mjs', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n')
  assert.doesNotMatch(pure, /\.toUpperCase\(\)|\.toLowerCase\(\)/, 'goalContract.mjs folds case again')
  // Guard the guard: the fold ban means nothing if the slices are empty.
  assert.ok(src.length > 5000 && pure.length > 800, 'a slice came back empty — the ban passes vacuously')
})

test('dates and numbers format in the SELECTED language, not the device', () => {
  // The whole point of a language picker is that it moves the app, not just its
  // words. bsDateLocale() is the app's resolved UI locale; a bare toLocaleString
  // or an empty [] follows the DEVICE.
  const src = contractBody()
  const calls = src.match(/toLocale(?:Date)?String\([^)]*\)/g) || []
  assert.ok(calls.length >= 1, `expected the date/number formatters, saw ${calls.length}`)
  for (const c of calls) {
    // A bare call, or an empty [] first argument, follows the DEVICE. A bound
    // local is fine as long as it came from bsDateLocale() — checked below.
    assert.doesNotMatch(c, /String\(\s*\)/, `a formatter follows the device locale: ${c}`)
    assert.doesNotMatch(c, /String\(\s*\[\s*\]/, `a formatter passes [] — that is the device locale: ${c}`)
    const arg = c.replace(/^toLocale(?:Date)?String\(/, '').split(',')[0].trim()
    const bound = new RegExp(`(const|let)\\s+${arg.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&')}\\s*=\\s*bsDateLocale\\(\\)`)
    assert.ok(/bsDateLocale\(\)/.test(arg) || bound.test(src),
      `a formatter's locale argument (${arg}) does not come from bsDateLocale(): ${c}`)
  }
})

test('every goal key is authored non-empty in all thirteen locales', () => {
  // i18n runs with `returnEmptyString: false`, so an empty catalog value renders
  // the RAW KEY on screen — worse than English, and invisible to the parity gate,
  // which only checks that the key EXISTS.
  const locales = readdirSync(CAT).filter((d) => !d.startsWith('.'))
  assert.ok(locales.length >= 13, `expected the full locale set, saw ${locales.length}`)
  const keys = Object.keys(EN)
  assert.ok(keys.length >= 100, `expected the goal namespace, saw ${keys.length} keys`)
  for (const loc of locales) {
    const d = JSON.parse(readFileSync(`${CAT}/${loc}/goal.json`, 'utf8'))
    for (const k of keys) {
      assert.ok(k in d, `${loc} is missing ${k}`)
      assert.ok(String(d[k]).trim() !== '', `${loc}.${k} is empty — it would render the raw key, not a blank`)
    }
  }
})

test('the Slavic plurals carry all four categories, and the glyphs survive', () => {
  // ru/uk need one/few/many/other — an ICU message with only one/other PARSES
  // fine (so the parity gate is happy) and then renders the wrong form for 2-4.
  for (const loc of ['ru', 'uk']) {
    const d = JSON.parse(readFileSync(`${CAT}/${loc}/goal.json`, 'utf8'))
    const v = d['door.targets']
    for (const cat of ['one', 'few', 'many', 'other']) {
      assert.match(v, new RegExp(`\\b${cat}\\s*\\{`), `${loc}.door.targets is missing the "${cat}" plural category`)
    }
  }
  // Arrows are UI grammar (the cut-7 rule for the fullwidth ＋) — no locale drops one.
  const arrowKeys = Object.keys(EN).filter((k) => EN[k].includes('→'))
  assert.ok(arrowKeys.length >= 2, `expected arrow-bearing keys, saw ${arrowKeys.length}`)
  const locales = readdirSync(CAT).filter((d) => !d.startsWith('.'))
  for (const loc of locales) {
    const d = JSON.parse(readFileSync(`${CAT}/${loc}/goal.json`, 'utf8'))
    for (const k of arrowKeys) assert.ok(d[k].includes('→'), `${loc}.${k} lost its arrow`)
  }
})
