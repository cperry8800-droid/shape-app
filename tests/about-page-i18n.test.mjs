// The About page's two i18n-specific failure modes, pinned in both directions.
// Both are silent: parse, tsc, the suite, the parity gate and the build all pass
// while a member reads a broken glyph or a raw translation key on screen.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const SRC = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'
const CAT = 'mobile-app/src/i18n/catalogs'

/** The component body, comments stripped — the rationale at each site quotes the
 *  very expressions these tests ban, so a raw-text assertion would fire on its
 *  own explanation. (The trap this repo has now paid for four times.) */
function aboutBody() {
  const src = readFileSync(SRC, 'utf8')
  const start = src.indexOf('function BSAboutPage(')
  assert.ok(start > 0, 'BSAboutPage is gone — this guard is about a component that must exist')
  const next = src.indexOf('\nfunction BSPricingPage(', start)
  assert.ok(next > start, 'could not find the end of BSAboutPage')
  return src
    .slice(start, next)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(l => l.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n')
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
  assert.ok(keys.length >= 40, `expected the aboutPage family, saw ${keys.length} keys`)

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

test('the hero keeps its non-breaking pairs and the CTA keeps its arrow', () => {
  // Both are invisible in a diff and both are real render regressions: losing an
  // NBSP breaks the 46px hero mid-phrase on a narrow screen, and the arrow is UI
  // grammar (the cut-7 rule for the fullwidth ＋) that no locale may drop.
  const NB = '\u00a0'
  const locales = readdirSync(CAT).filter(d => !d.startsWith('.'))
  const en = JSON.parse(readFileSync(`${CAT}/en/settings.json`, 'utf8'))

  // Guard the guard: the English itself must carry them, or every locale below
  // is being compared against nothing.
  assert.ok(en['aboutPage.heroPre'].includes(NB), 'the en hero lead lost its NBSP')
  assert.ok(en['aboutPage.heroPost'].includes(NB), 'the en hero tail lost its NBSP')
  assert.ok(en['aboutPage.ctaAction'].includes('\u2192'), 'the en CTA lost its arrow')

  for (const loc of locales) {
    const d = JSON.parse(readFileSync(`${CAT}/${loc}/settings.json`, 'utf8'))
    assert.ok(d['aboutPage.heroPre'].includes(NB), `${loc}: heroPre lost its non-breaking space`)
    assert.ok(d['aboutPage.heroPost'].includes(NB), `${loc}: heroPost lost its non-breaking space`)
    assert.ok(d['aboutPage.ctaAction'].includes('\u2192'), `${loc}: the CTA action lost its arrow`)
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
  const calls = body.match(/tr\(\s*'settings:aboutPage\./g) || []
  assert.ok(calls.length >= 40,
    `expected the page to route its copy through tr(), saw ${calls.length} calls`)
})
