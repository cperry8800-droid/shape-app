// The About page is "The Note" on two surfaces — the website renders hardcoded
// English out of `public/newdesign/about.jsx`, the app renders thirteen locales
// out of `settings:aboutPage.*` — and nothing but this file makes the two say
// the same thing. That is not hypothetical: the letter and the bio were copied
// between the two by hand for months, which is why they were keyed at all.
//
// It also holds the one thing the owner asked for by name: no photograph, on
// either surface. A removal is the easiest change in the world to undo by
// accident, so it is asserted as an ABSENCE rather than trusted to stay gone.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { stripComments } from './helpers/strip-comments.mjs'

const WEB = 'public/newdesign/about.jsx'
const APP = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'
const CAT = 'mobile-app/src/i18n/catalogs'
const LOCALES = readdirSync(CAT).filter((d) => !d.startsWith('.'))

const cat = (loc) => JSON.parse(readFileSync(`${CAT}/${loc}/settings.json`, 'utf8'))

/** Source with comments stripped. Every ban below is quoted by the rationale it
 *  is written next to, so a raw-text assertion would fire on its own explanation
 *  — the trap this repo has now paid for five times.
 *
 *  ⚠ THE SHARED STRIPPER, NEVER A LOCAL ONE, AND HERE THAT IS NOT A STYLE RULE.
 *  The house's old line form — `l.replace(/(^|[^:])\/\/.*$/, '$1')` — is a
 *  SILENT NO-OP on a CRLF file: `\r` is a line terminator in JS regex, so `.`
 *  cannot cross it and `$` sits past it, and every comment survives. That is
 *  exactly this file's case, because `public/newdesign/about.jsx` is the repo's
 *  one CRLF-tracked page. Measured while writing this guard: with the local
 *  stripper the portrait ban fired on the comment EXPLAINING that the portrait
 *  was removed. */
function stripped(path) {
  return stripComments(readFileSync(path, 'utf8'))
}

function appBody() {
  const src = readFileSync(APP, 'utf8')
  const start = src.indexOf('function BSAboutPage(')
  assert.ok(start > 0, 'BSAboutPage is gone — this guard is about a component that must exist')
  const next = src.indexOf('\nfunction BSPricingPage(', start)
  assert.ok(next > start, 'could not find the end of BSAboutPage')
  return stripComments(src.slice(start, next))
}

/** Lift a top-level `const NAME = <literal>;` out of the website page and RUN
 *  it. Evaluating the shipped declaration beats re-typing the copy here: a test
 *  carrying its own copy of the sentences is comparing itself to itself. */
function webConst(name) {
  const src = readFileSync(WEB, 'utf8').replace(/\r\n/g, '\n')
  const at = src.indexOf(`const ${name} = `)
  assert.ok(at >= 0, `${name} is not declared in ${WEB}`)
  const open = src.indexOf('=', at) + 1
  let depth = 0
  let end = -1
  for (let i = open; i < src.length; i += 1) {
    const c = src[i]
    if (c === '[' || c === '{') depth += 1
    else if (c === ']' || c === '}') { depth -= 1; if (depth === 0) { end = i + 1; break } }
  }
  assert.ok(end > open, `could not find the end of ${name}`)
  // eslint-disable-next-line no-new-func
  return new Function(`return (${src.slice(open, end)})`)()
}

test('neither surface carries a portrait, and the asset is gone', () => {
  // Owner, 2026-09-16: "remove my picture from the about pages on both website
  // and app". Three independent ways it could come back, all closed.
  assert.ok(!existsSync('public/newdesign/founder.webp'), 'the website portrait file is back')
  assert.ok(!existsSync('mobile-app/public/founder.webp'), 'the app portrait file is back')

  const web = stripped(WEB)
  const app = appBody()
  for (const [label, body] of [['the website page', web], ['the app page', app]]) {
    assert.doesNotMatch(body, /founder\.webp/, `${label} references the portrait file again`)
    assert.doesNotMatch(body, /<img\b/, `${label} renders an image again`)
    assert.doesNotMatch(body, /founderAlt/, `${label} reaches for the retired portrait alt text`)
  }
  // And the alt-text key is out of every catalog, or a translator keeps
  // maintaining a string for a picture nobody renders.
  for (const loc of LOCALES) {
    assert.ok(!('aboutPage.founderAlt' in cat(loc)), `${loc} still carries aboutPage.founderAlt`)
  }

  // Guard the guard: the stripper must not have eaten the body. Without this,
  // every assertion above passes on an empty string.
  assert.ok(web.length > 3000 && app.length > 3000, 'the source slices came back empty')
})

test('the note says the same thing on both surfaces', () => {
  const note = webConst('AN_NOTE')
  const en = cat('en')
  const pairs = [
    ['eyebrow', 'aboutPage.noteEyebrow'],
    ['head', 'aboutPage.noteHead'],
    ['sigRole', 'aboutPage.founderRole'],
    ['letterOpen', 'aboutPage.letterOpen'],
    ['letterMins', 'aboutPage.letterMins'],
    ['bioLabel', 'aboutPage.bioLabel'],
    ['bio', 'aboutPage.founderBio'],
  ]
  for (const [field, key] of pairs) {
    assert.equal(note[field], en[key], `the website's ${field} has drifted from ${key}`)
  }
  assert.deepEqual(note.lines, [en['aboutPage.noteL1'], en['aboutPage.noteL2'], en['aboutPage.noteL3']],
    "the website's three lines have drifted from the catalog")

  // The signed name is the one string on this page that is deliberately neither
  // keyed nor translated — a real person's name. Both surfaces must still carry
  // it, or the note is unsigned.
  assert.match(note.sigName, /Christopher Perry/, 'the website signature is gone')
  assert.match(appBody(), /— Christopher Perry/, 'the app signature is gone')
})

test('the four facts are the same four on both surfaces', () => {
  const facts = webConst('AN_FACTS')
  const en = cat('en')
  assert.deepEqual(facts, [
    en['aboutPage.factFee'],
    en['aboutPage.factCoach'],
    en['aboutPage.factChecked'],
    en['aboutPage.factLangs'],
  ], 'the website facts strip has drifted from the catalog')

  // ⚠ THE COACH FACT MAY NOT PROMISE WHAT THE MARKETPLACE WITHHOLDS. Its ✓
  // Verified badge renders PER COACH (`c.verified &&` in marketplace.jsx), so a
  // blanket "every coach verified" would be contradicted by the first listing a
  // reader opens. Intake credential-checking is the claim coaches.jsx makes for
  // all of them, and it is the claim repeated here.
  const checked = en['aboutPage.factChecked']
  assert.doesNotMatch(checked, /\bverified\b/i,
    'the coach fact claims verification, which the marketplace grants per coach')

  // And the locale count is a MEASUREMENT, not a number somebody typed: it must
  // equal the catalogs actually shipped.
  assert.match(en['aboutPage.factLangs'], new RegExp(`\\b${LOCALES.length}\\b`),
    `the languages fact does not state the ${LOCALES.length} catalogs that ship`)
})

test('the facts strip wraps on both surfaces rather than pushing the page sideways', () => {
  // ⚠ THIS SHIPPED BROKEN ONCE, IN THE HOUR BEFORE THIS GUARD WAS WRITTEN. JSX
  // strips the newline between two adjacent elements, so rendering four facts and
  // their separators as inline spans made the whole strip ONE unbreakable line:
  // measured at 715px of content inside a 280px box at 320px wide. It read clean
  // because `document.documentElement.scrollWidth` does not report it — only the
  // strip's own scrollWidth and `document.body.scrollWidth` did.
  //
  // The property is checkable from source: the container that renders the facts
  // must wrap, and nothing inside it may be `nowrap`. A locale whose fact is
  // longer than the column has to wrap INSIDE the fact; the alternative is a page
  // that scrolls sideways, which is strictly worse.
  for (const [label, body, marker] of [
    ['the website page', stripped(WEB), 'AN_FACTS.map'],
    ['the app page', appBody(), 'facts.map'],
  ]) {
    const at = body.indexOf(marker)
    assert.ok(at > 0, `${label}: the facts strip is not where this guard looks (${marker})`)
    // The container's style object is the JSX attribute immediately before it.
    const head = body.slice(Math.max(0, at - 1200), at)
    const open = head.lastIndexOf('<div style={{')
    assert.ok(open >= 0, `${label}: the facts container is not a styled div`)
    const container = head.slice(open)
    assert.match(container, /flexWrap:\s*['"]wrap['"]/, `${label}: the facts strip does not wrap`)
    assert.doesNotMatch(container, /whiteSpace:\s*['"]nowrap['"]/, `${label}: the facts container forbids wrapping`)
    // ⚠ AND NO FACT INSIDE IT MAY PIN ITSELF — scoped to the map's own body, not
    // a fixed window. A first cut took 700 characters and ran into the DOORS
    // component below, whose button labels are legitimately `nowrap`: a guard
    // whose window contains an unrelated use of the same token is measuring that
    // use, which is how it failed on correct code.
    const mapBody = body.slice(at, at + body.slice(at).indexOf('))}') + 3)
    assert.ok(mapBody.length > 40 && mapBody.length < 700, `${label}: the facts map body did not delimit`)
    assert.doesNotMatch(mapBody, /whiteSpace:\s*['"]nowrap['"]/, `${label}: a fact is nowrap — it will overflow a narrow column`)
  }
})

test("the note's first and last lines are this locale's own letter, split", () => {
  // noteL1 and noteL3 are the two sentences of `letter.p7` in every locale —
  // authored once into the catalog rather than split at runtime, because a
  // runtime split on "." is a guess about punctuation in thirteen languages.
  // Re-joining them must reproduce the paragraph EXACTLY, or the note and the
  // letter one tap below it are quoting different sentences.
  for (const loc of LOCALES) {
    const d = cat(loc)
    const joined = `${d['aboutPage.noteL1']} ${d['aboutPage.noteL3']}`
    assert.equal(joined, d['aboutPage.letter.p7'],
      `${loc}: the note's two lines no longer rejoin into letter.p7`)
    assert.ok(d['aboutPage.noteL2'].trim().length > 0, `${loc}: noteL2 is empty`)
  }
})

test('the letter is whole and identical on both surfaces', () => {
  // The website's copy is hardcoded English; the app's is the `en` catalog. They
  // are the same letter, so the same words, in the same order, or the page a
  // member reads on their phone is not the page a visitor reads on the web.
  const head = webConst('AN_LETTER_HEAD')
  const blocks = webConst('AN_LETTER')
  const en = cat('en')

  assert.equal(head.join(''),
    `${en['aboutPage.letter.h1Accent']}${en['aboutPage.letter.h1Post']} ${en['aboutPage.letter.h2Pre']} ${en['aboutPage.letter.h2Accent']}${en['aboutPage.letter.h2Post']}`,
    "the website's letter heading has drifted from the catalog")

  const expected = [
    en['aboutPage.letter.p1'],
    en['aboutPage.letter.p2'],
    en['aboutPage.letter.p3'],
    en['aboutPage.letter.p4'],
    `${en['aboutPage.letter.pull1Pre']} ${en['aboutPage.letter.pull1Accent']}`,
    en['aboutPage.letter.p5'],
    `${en['aboutPage.letter.p6Pre']} ${en['aboutPage.letter.p6Accent']}${en['aboutPage.letter.p6Post']}`,
    en['aboutPage.letter.pull2'],
    en['aboutPage.letter.p7'],
  ]
  const got = blocks.map((b) => `${b.text}${b.accent || ''}`)
  assert.deepEqual(got, expected, 'the website letter has drifted from the catalog')

  // Exactly one drop cap, and it is the letter's opening paragraph on both.
  assert.equal(blocks.filter((b) => b.drop).length, 1, 'the letter has lost (or gained) a drop cap')
  assert.equal(blocks[0].drop, true, 'the drop cap is not on the letter\'s first paragraph')
})
