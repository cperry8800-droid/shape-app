// The About page's two i18n-specific failure modes, pinned in both directions.
// Both are silent: parse, tsc, the suite, the parity gate and the build all pass
// while a member reads a broken glyph or a raw translation key on screen.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { stripComments } from './helpers/strip-comments.mjs'

const SRC = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'
const CAT = 'mobile-app/src/i18n/catalogs'

/** The component body, comments stripped — the rationale at each site quotes the
 *  very expressions these tests ban, so a raw-text assertion would fire on its
 *  own explanation. (The trap this repo has now paid for four times.)
 *
 *  ⚠ THE SHARED STRIPPER, NOT THE LOCAL LINE FORM THIS USED TO CARRY. That form
 *  (`l.replace(/(^|[^:])\/\/.*$/, '$1')`) is a silent NO-OP on any CRLF source,
 *  because `\r` is a line terminator in JS regex: `.` cannot cross it and `$`
 *  sits past it. It happens to be safe here — this file is LF — and it was not
 *  safe in the sibling guard that reads the CRLF-tracked website page, where it
 *  let the ban fire on the comment explaining the ban. One implementation. */
function aboutBody() {
  const src = readFileSync(SRC, 'utf8')
  const start = src.indexOf('function BSAboutPage(')
  assert.ok(start > 0, 'BSAboutPage is gone — this guard is about a component that must exist')
  const next = src.indexOf('\nfunction BSPricingPage(', start)
  assert.ok(next > start, 'could not find the end of BSAboutPage')
  return stripComments(src.slice(start, next))
}

/** Every `settings:aboutPage.*` key the component actually asks for, read off
 *  the comment-stripped body so a key quoted in a rationale is not counted. */
function aboutKeysUsed() {
  const body = aboutBody()
  return new Set([...body.matchAll(/'settings:(aboutPage\.[A-Za-z0-9_.]+)'/g)].map(m => m[1]))
}

test('the drop cap is taken codepoint-safely from the TRANSLATED value', () => {
  const body = aboutBody()

  // Guard the guard: the three lines under test must actually be in the slice,
  // or every assertion below passes vacuously about code that is not there.
  assert.match(body, /const p1Chars\s*=/, 'the drop-cap derivation is not in the slice')

  // Drive it, do not grep it. A spelling pin survives any equivalent rewrite;
  // this evaluates the SHIPPED expressions against an astral first character.
  const lines = body
    .split('\n')
    .filter(l => /const (p1Chars|p1Cap|p1Rest)\s*=/.test(l))
    .map(l => l.trim())
  assert.equal(lines.length, 3, 'expected exactly the three drop-cap derivation lines')

  const derive = new Function('letterP1', `${lines.join('\n')}\nreturn { p1Cap, p1Rest }`)

  // U+1D5E6 MATHEMATICAL SANS-SERIF CAPITAL S — one codepoint, two UTF-16 units.
  const astral = '\u{1D5E6}hape is about exactly what its name suggests.'
  const got = derive(astral)
  assert.equal(got.p1Cap, '\u{1D5E6}', 'the cap split a surrogate pair — charAt(0) is back')
  assert.equal(got.p1Cap + got.p1Rest, astral, 'cap + rest must reconstruct the value exactly')

  // And the ordinary BMP case still behaves.
  const plain = derive('Shape is about exactly what its name suggests.')
  assert.equal(plain.p1Cap, 'S')
  assert.equal(plain.p1Cap + plain.p1Rest, 'Shape is about exactly what its name suggests.')

  // The cap must come from the translated value, never a hardcoded English letter.
  assert.match(body, /const letterP1\s*=\s*tr\(\s*'settings:aboutPage\.letter\.p1'/,
    'the drop cap must be derived from the translated p1, not a literal')
  assert.doesNotMatch(body, /p1Cap\s*=\s*'/, 'the drop cap is hardcoded again')
})

test('no split-accent slot is authored empty in any locale', () => {
  // i18n runs with `returnEmptyString: false`, so an empty catalog value renders
  // the RAW KEY on screen. Every aboutPage key is checked, not just the split
  // ones — a blank anywhere on this page is the same failure.
  const locales = readdirSync(CAT).filter(d => !d.startsWith('.'))
  assert.ok(locales.length >= 13, `expected the full locale set, saw ${locales.length}`)

  const en = JSON.parse(readFileSync(`${CAT}/en/settings.json`, 'utf8'))
  const keys = Object.keys(en).filter(k => k.startsWith('aboutPage.'))
  // ⚠ THE FLOOR IS DERIVED, NOT A NUMBER. It read `>= 40` and went stale the day
  // The Note retired the hero and the two-audience block — a literal floor is a
  // claim about the page's length, which is exactly the thing a redesign moves.
  // What it is actually guarding is that the parse found the family at all, so
  // it is compared against what the component renders.
  assert.ok(keys.length >= aboutKeysUsed().size,
    `the aboutPage family (${keys.length}) is smaller than what the page renders`)

  for (const loc of locales) {
    const d = JSON.parse(readFileSync(`${CAT}/${loc}/settings.json`, 'utf8'))
    for (const k of keys) {
      assert.ok(k in d, `${loc} is missing ${k}`)
      assert.ok(String(d[k]).trim() !== '',
        `${loc}.${k} is empty — it would render the raw key, not a blank`)
    }
  }
})

// ⚠ THE ABOUT CTA IS DELIBERATELY *NOT* COUPLED TO `onboarding:login.titleJoin*`,
// and this note is here because the obvious guard is the wrong one. Both say
// "Join the community." in English, so a first cut of this file asserted they
// must match in every locale — and eight translators had independently reached
// for different natural wording (de "Komm in die" vs "Werde Teil der"). They were
// right. The login headline is read by someone CREATING an account; the About
// closer is read by a member already inside, and its button fires
// `shape:goCommunity` to open the feed. Same words today, two rhetorical moments:
// renaming the login screen's headline must not move the About page's closer.
// The house rule is "share only where a rename SHOULD move both" — it does not.

test('the door keeps its arrow and the brand nouns survive translation', () => {
  // ⚠ THE HERO'S NON-BREAKING PAIRS ARE NOT CHECKED HERE ANY MORE, AND THAT IS A
  // RETIREMENT RATHER THAN A GAP. `aboutPage.heroPre`/`heroPost` carried an NBSP
  // because the 46px hero broke mid-phrase on a narrow screen; The Note has no
  // hero and those keys are out of all thirteen catalogs, so the assertion would
  // now be about nothing. The arrow is UI grammar (the cut-7 rule for the
  // fullwidth ＋) that no locale may drop, and it is still on screen.
  const locales = readdirSync(CAT).filter(d => !d.startsWith('.'))
  const en = JSON.parse(readFileSync(`${CAT}/en/settings.json`, 'utf8'))

  // Guard the guard: the English itself must carry it, or every locale below is
  // being compared against nothing.
  assert.ok(en['aboutPage.ctaAction'].includes('\u2192'), 'the en door lost its arrow')

  for (const loc of locales) {
    const d = JSON.parse(readFileSync(`${CAT}/${loc}/settings.json`, 'utf8'))
    assert.ok(d['aboutPage.ctaAction'].includes('\u2192'), `${loc}: the door lost its arrow`)
    for (const noun of ['Shape Score', 'Ironman']) {
      for (const k of Object.keys(en).filter(x => x.startsWith('aboutPage.'))) {
        if (en[k].includes(noun)) {
          assert.ok(d[k].includes(noun), `${loc}.${k}: the brand noun "${noun}" was translated`)
        }
      }
    }
  }
})

test('the About page holds no hardcoded copy but the founder\'s name', () => {
  const body = aboutBody()
  // The signed name is deliberately unkeyed (a proper name, recorded in the
  // ratchet's PARTIAL baseline). Everything else on the page must route
  // through tr() — including the drop-cap paragraph the letter opens with.
  assert.match(body, /— Christopher Perry/, 'the founder signature is gone')
  assert.doesNotMatch(body, /tr\(\s*'settings:aboutPage\.founderName/,
    'the founder name was keyed — thirteen identical values for a proper noun')
  // ⚠ NOT A CALL-COUNT FLOOR. It read `>= 40` and was made false by a redesign
  // that removed copy rather than by anything going wrong — a number that tracks
  // how long the page happens to be cannot tell a regression from an edit. The
  // invariant that survives a redesign is that the page and the catalog agree in
  // BOTH directions: every key the page asks for exists, and every key the
  // catalog holds is asked for. A hardcoded string shows up as an orphaned key.
  const used = aboutKeysUsed()
  assert.ok(used.size >= 20, `the tr() parse found only ${used.size} aboutPage keys`)
  const en = JSON.parse(readFileSync(`${CAT}/en/settings.json`, 'utf8'))
  const family = Object.keys(en).filter(k => k.startsWith('aboutPage.'))
  const missing = [...used].filter(k => !(k in en))
  assert.deepEqual(missing, [], 'the page asks for aboutPage keys the catalog does not have')
  const orphans = family.filter(k => !used.has(k))
  assert.deepEqual(orphans, [], 'the catalog holds aboutPage keys the page no longer renders')
})
