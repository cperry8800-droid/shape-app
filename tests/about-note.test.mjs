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

/** Longest common substring length, case-insensitive. Used to check a translated
 *  sentence against a word the product already owns, which survives inflection
 *  where an equality or `includes` check would fail correct translations
 *  (uk "\u041f\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043d\u0456" against the badge's "\u041f\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043d\u043e"). */
function lcsLen(a, b) {
  const x = String(a).toLowerCase()
  const y = String(b).toLowerCase()
  let best = 0
  let prev = new Array(y.length + 1).fill(0)
  for (let i = 1; i <= x.length; i += 1) {
    const cur = new Array(y.length + 1).fill(0)
    for (let j = 1; j <= y.length; j += 1) {
      if (x[i - 1] === y[j - 1]) {
        cur[j] = prev[j - 1] + 1
        if (cur[j] > best) best = cur[j]
      }
    }
    prev = cur
  }
  return best
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

  // And the locale count is a MEASUREMENT, not a number somebody typed: it must
  // equal the catalogs actually shipped.
  assert.match(en['aboutPage.factLangs'], new RegExp(`\\b${LOCALES.length}\\b`),
    `the languages fact does not state the ${LOCALES.length} catalogs that ship`)
})

test('the credentials fact is scoped to the badge, in every locale', () => {
  // ⚠ THIS ASSERTION USED TO REQUIRE THE OPPOSITE, AND IT WAS WRONG. It read
  // `doesNotMatch(checked, /\bverified\b/i)` under a comment reasoning that the
  // ✓ Verified badge renders PER COACH, so a blanket "every coach verified"
  // would be contradicted by the first listing a reader opens. That reasoning is
  // right and it refutes the WEAKER blanket claim ("Coach credentials checked")
  // for exactly the same reason: a conditional badge IS the evidence that not
  // every coach was checked. Banning the word "verified" then pinned a spelling
  // and forbade the only honest wording there is.
  //
  // The product's own Terms are the operative document, so they are the guard's
  // guard: if that sentence ever goes, this claim has to be re-derived rather
  // than left standing.
  const termsClause = /Unless a coach shows a Verified badge, the credentials on their profile are self-reported and not independently verified by Shape/
  assert.match(readFileSync(APP, 'utf8'), termsClause,
    'the Terms no longer say credentials are self-reported — re-derive the About facts against whatever replaced it')

  // en names the badge outright; the other twelve are checked against a word the
  // PRODUCT owns rather than one this test types, so an inflected translation
  // still passes and a translation that drops the concept fails.
  assert.match(cat('en')['aboutPage.factChecked'], /badge/i,
    'the en credentials fact no longer names the badge that scopes it')

  for (const loc of LOCALES) {
    const badge = JSON.parse(readFileSync(`${CAT}/${loc}/profile.json`, 'utf8'))['coach.verified']
    assert.ok(badge, `${loc}: profile:coach.verified is missing — the derivation has nothing to compare against`)
    const word = badge.replace(/\u2713/g, '').trim()
    assert.ok(word.length >= 6, `${loc}: the badge name is too short to derive from`)
    // ⚠ THE FLOOR IS PROVEN LOAD-BEARING, NOT ASSUMED. Dropping it to 1 on its
    // own is a no-op — every shipped locale shares 7–13 characters with its badge
    // word, so a lower floor changes no answer and the mutation survives. What
    // proves it is the COMBINED run: floor 1 AND ru's fact rewritten without the
    // badge word goes green, where floor 6 catches it. A floor is proven by a read
    // that has stopped matching, never by its own deletion.
    const n = lcsLen(cat(loc)['aboutPage.factChecked'], word)
    assert.ok(n >= 6,
      `${loc}: the credentials fact does not carry the badge word from profile:coach.verified (${word}) — longest shared run was ${n}`)
  }

  // ⚠ THE RESIDUAL, STATED RATHER THAN PAPERED OVER: this proves the fact is
  // ABOUT verification-by-badge; it cannot prove the claim is SCOPED. A locale
  // could still read "coach credentials verified" — a universal claim carrying
  // the same word — and pass. Scoping is authored, and the thing that catches a
  // regression there is reading the Terms above, not this loop. Measured while
  // writing it: the retired fr value, "Diplômes des coachs vérifiés", survives
  // this check, which is why it is named here.
})

test('the coach price fact says what is free', () => {
  // ⚠ "Free for coaches" beside "$5 a month for members" reads as a price
  // comparison and states the wrong half of it: coaches pay a platform fee on
  // everything clients pay them. The owner's 2026-09-14 ruling is "free to JOIN
  // for coaches", and coaches.jsx keeps that qualifier ("$0 to join and list")
  // directly beside the fee. Guard the guard first — if Shape ever stops taking
  // a fee, the unqualified claim becomes true and this test should be the thing
  // that says so.
  const fee = readFileSync('src/lib/platform-fee.mjs', 'utf8')
  const m = fee.match(/PLATFORM_FEE_RATE\s*=\s*([0-9.]+)/)
  assert.ok(m, 'PLATFORM_FEE_RATE is gone — re-derive the About coach fact')
  assert.ok(Number(m[1]) > 0,
    'the platform fee is zero, so "free for coaches" may be unqualified again — revisit this fact')
  // ⚠ THE PAIR SPANS TWO ARRAY ELEMENTS, so this pattern may not be written to
  // stop at a quote. A first cut used `[^"]*` between them and failed on correct
  // code, reporting "the Coaches page no longer states what is free" about a page
  // that says it in the very next literal: `["$0", false, "to join and list"]`.
  assert.match(readFileSync('public/newdesign/coaches.jsx', 'utf8'), /"\$0"[\s\S]{0,60}?to join/,
    'the Coaches page no longer states what is free — the About fact is derived from its wording')

  assert.match(cat('en')['aboutPage.factCoach'], /\bjoin/i,
    'the en coach fact no longer names the act that is free, so it reads as "coaches pay nothing"')
  // ⚠ The other twelve are authored from each locale's own joining verb and are
  // NOT asserted here, deliberately: those verbs share no stem with anything the
  // product already keys (es "se unen" against "\u00danete", en "join" against
  // "Join Shape" — four characters), so a cross-locale derivation would be a
  // spelling pin dressed as a measurement. Parity and non-emptiness cover them.
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

test('both surfaces close on the same two doors', () => {
  // ⚠ THE APP SHIPPED WITH ONE DOOR AND THE REASON WAS FALSE. It read "this app
  // has nowhere to send it", which is true only of an IN-APP route — not what the
  // door needs. Coach signup lives on the website, and this module already opens
  // external web destinations. So a signed-out visitor who wanted to become a
  // coach lost the page's only route to it, for want of a mechanism that was
  // already there. Both surfaces carry both doors now, and each half of that is
  // asserted separately because they fail independently.
  const web = stripped(WEB)
  const app = appBody()
  const en = cat('en')

  // The website's coach door points at a page that EXISTS — a href nobody
  // resolves is the dead control this page is supposed to be the opposite of.
  const href = web.match(/href="(\/newdesign\/Coaches\.html)"/)
  assert.ok(href, 'the website lost its coach door')
  assert.ok(existsSync(`public${href[1]}`), `the website coach door points at a missing page (${href[1]})`)
  assert.match(web, /href="\/newdesign\/GetApp\.html"/, 'the website lost its member door')

  // The app's coach door leaves for that same page. ⚠ ABSOLUTE, because on
  // native the WebView's origin is the Capacitor scheme and a root-relative path
  // resolves to nothing there; and through `bsOpenCheckout`, because a bare
  // `location.href` takes the WebView ITSELF to a marketing page with no way back
  // into the app. Both are invisible on the web build, which is where this would
  // be tested by hand.
  const url = app.match(/BS_ABOUT_COACH_URL/) && readFileSync(APP, 'utf8').match(/const BS_ABOUT_COACH_URL = '([^']+)'/)
  assert.ok(url, 'the app lost its coach door URL')
  assert.match(url[1], /^https:\/\//, 'the app coach door is not an absolute URL — it resolves to nothing on native')
  assert.ok(url[1].endsWith(href[1]),
    `the two surfaces point at different coach pages (app ${url[1]}, website ${href[1]})`)
  assert.match(app, /bsOpenCheckout\(BS_ABOUT_COACH_URL\)/,
    'the app coach door does not go through the Capacitor-aware opener')
  assert.doesNotMatch(app, /location\.href\s*=/,
    'the app page navigates the WebView itself — on native that strands the member outside the app')
  assert.match(app, /shape:goCommunity/, 'the app lost its member door')

  // The two labels are the same sentence, or the surfaces offer what reads as
  // two different things.
  assert.ok(en['aboutPage.ctaCoach'], 'the coach door label is not keyed')
  // ⚠ NO `|| 'Become a coach'` FALLBACK HERE, and that is the point. A first
  // cut carried one, so a regex that stopped matching would have compared the
  // catalog against this test's own typed copy and passed forever. It has to
  // fail loudly instead.
  const webLabel = web.match(/>([^<>{}]*?)\s*\u2192<\/a>\s*<\/div>/)
  assert.ok(webLabel, 'could not read the website coach door label — this guard is measuring nothing')
  assert.equal(en['aboutPage.ctaCoach'].replace(/\s*\u2192\s*$/, '').trim(), webLabel[1].trim(),
    'the app and website coach doors say different things')
  for (const loc of LOCALES) {
    const v = cat(loc)['aboutPage.ctaCoach']
    assert.ok(v && v.trim(), `${loc} is missing aboutPage.ctaCoach`)
    assert.ok(v.includes('\u2192'), `${loc}: the coach door lost its arrow`)
  }

  // And the pair WRAPS rather than clipping a label — at 320px two 13/22 buttons
  // do not fit one row. ⚠ THE TWO SURFACES DO IT DIFFERENTLY AND ARE ASSERTED
  // SEPARATELY: the website drops its flex row to a one-column grid in a media
  // query, the app wraps the flex row itself (a React Native-style inline style
  // has no media query to reach for). A first cut OR'd three patterns together,
  // which passes when ANY surface happens to carry ANY of them.
  assert.match(web, /className="about-doors"/, 'the website doors lost the class its media query targets')
  assert.match(readFileSync(WEB, 'utf8'),
    /\.about-doors\s*\{[^}]*grid-template-columns:\s*1fr/,
    'the website doors no longer stack on a narrow screen')
  const appAt = app.indexOf('shape:goCommunity')
  const appHead = app.slice(Math.max(0, appAt - 700), appAt)
  const appOpen = appHead.lastIndexOf('<div style={{')
  assert.ok(appOpen >= 0, 'the app doors container is not a styled div')
  assert.match(appHead.slice(appOpen), /flexWrap:\s*['"]wrap['"]/, 'the app doors do not wrap')
})
