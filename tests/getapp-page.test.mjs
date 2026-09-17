// THE APP PAGE — ONE DAY, AND WHAT HAS TO STAY TRUE ABOUT IT.
//
// WHY THIS FILE EXISTS: `public/newdesign/GetApp.html` is the one page the site
// redirects every phone to, and until 2026-09-17 it was a ten-click carousel
// behind its own two-link bar — the single nav destination where the site's nav
// disappeared, writing ONE of its ten steps into the DOM at a time. It is now a
// static page: eight beats of a member's day, ten real captures, all of it in
// the markup at first paint, under the shared header and the canonical footer.
//
// The rules below are the ones that make it that page rather than a page that
// merely looks like it. Every one is DERIVED from the file (the captures, the
// font axes, the locale count) rather than typed here, so the day a screen is
// added, a capture is renamed, or a locale ships, the guard moves with it.
//
// Spec: docs/BUILD-2026-09-17-app-page-one-day.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';

const ND = new URL('../public/newdesign/', import.meta.url);
const PUB = new URL('../public/', import.meta.url);
const read = (f) => readFileSync(new URL(f, ND), 'utf8');

const HTML = read('GetApp.html');

const INDEX = read('index.html');
const SHELL = read('pageShell.jsx');

// ⚠ THE ABSENCE SWEEPS BELOW RUN OVER A COMMENT-STRIPPED COPY, AND THAT IS A FIX
// RATHER THAN A LOOSENING. This page documents the defects it replaced — the
// hardcoded "01 / 08" step total two steps stale, the cream palette whose teal
// computed to 1.75:1 — because that note is where the next reader learns not to
// bring them back. A raw scan reads those explanations as the page still carrying
// them: measured on the first run of this file, three checks failed on a page that
// carries none of what they name. The repo has paid for this exact shape before
// (the CfPill ban, 2026-09-15), and the lesson recorded there is to fix the guard,
// never to reword the comment to appease it.
//
// Only HTML and block comments are removed. A `//` stripper is deliberately NOT
// used: this file carries `https://` in eight script and link tags, and a naive
// one eats the rest of every line it touches.
function withoutComments(src) {
  return src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}
const BODY = withoutComments(HTML);

test('the comment stripper removes comments and nothing else', () => {
  // ⚠ GUARD THE GUARD. A stripper that ran away — a `/*` opened inside a future
  // JS string, say — would delete the rest of the file, and every absence check
  // below would then pass on a page it had never read.
  assert.ok(BODY.length > HTML.length * 0.55,
    'the stripper removed ' + Math.round((1 - BODY.length / HTML.length) * 100) + '% of the file — it has run away, and every absence check below is vacuous');
  assert.equal((BODY.match(/<div class="ph-scr"><img /g) || []).length, 10, 'the stripper ate the page\'s captures');
  assert.ok(BODY.includes('<main class="ga-main">'), 'the stripper ate the page body');
  assert.ok(BODY.includes('<section class="doors" id="notify">'), 'the stripper ate the doors');
  // and it really does remove a comment this page carries
  assert.ok(HTML.includes('01 / 08') && !BODY.includes('01 / 08'), 'the stripper left a CSS block comment behind');
  assert.ok(HTML.includes('React + Babel') && !BODY.includes('React + Babel'), 'the stripper left an HTML comment behind');
});

// ── the page's captures ──────────────────────────────────────────────────────
// Each `<img>` inside a `.ph` bezel, with its src, its query and whether it is
// eager. Derived, so a beat added or removed is covered with nobody remembering
// this file exists.
function captures() {
  const out = [];
  for (const m of HTML.matchAll(/<div class="ph-scr"><img ([^>]*)>/g)) {
    const attrs = m[1];
    const src = /src="([^"]+)"/.exec(attrs);
    assert.ok(src, 'a phone screen carries an <img> with no src');
    const [file, query] = src[1].split('?');
    out.push({
      attrs,
      file,
      query: query || '',
      lazy: /loading="lazy"/.test(attrs),
      alt: (/alt="([^"]*)"/.exec(attrs) || [, ''])[1],
      w: (/width="(\d+)"/.exec(attrs) || [])[1],
      h: (/height="(\d+)"/.exec(attrs) || [])[1],
    });
  }
  return out;
}
const SHOTS = captures();

/** A PNG's real pixel size, from the IHDR the first 24 bytes carry. */
function pngSize(absPath) {
  const b = readFileSync(absPath);
  assert.equal(b.readUInt32BE(0), 0x89504e47, absPath + ' is not a PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test('every one of the ten screens is in the markup, and each file is the site geometry', () => {
  // ⚠ EXACTLY TEN, NEVER `>= 1`. The page this replaced had all ten in the DOM
  // too — stacked at inset:0 inside one visible frame, nine of them invisible and
  // 1.82 MB of them loading at once. The count is the point: ten screens, laid
  // out down the page, and a guard that accepted "at least one" would pass on the
  // carousel coming back.
  assert.equal(SHOTS.length, 10, 'the page shows ' + SHOTS.length + ' screens, not ten');

  for (const s of SHOTS) {
    assert.match(s.file, /^\/newdesign\/getapp-[a-z0-9-]+\.png$/, 'a screen is not one of the app captures: ' + s.file);
    const abs = new URL('.' + s.file, PUB);
    assert.ok(existsSync(abs), s.file + ' is referenced but not in the repo');
    assert.ok(statSync(abs).size > 10000, s.file + ' is suspiciously small — a placeholder?');
    // The site's own capture geometry: 375x867 at 1.6. A file at another size is
    // a re-shoot taken the wrong way, and `object-fit: cover` would hide it.
    assert.deepEqual(pngSize(abs), [600, 1387], s.file + ' is not 600x1387');
    assert.equal(s.w, '600', s.file + ' declares the wrong width');
    assert.equal(s.h, '1387', s.file + ' declares the wrong height');
    assert.ok(s.query.startsWith('v='), s.file + ' carries no ?v= cache key');
    // ⚠ An <img> with no alt is a screen a screen reader cannot know is there,
    // and this page is ten screens.
    assert.ok(s.alt.length > 20, s.file + ' has no useful alt text');
  }

  // The first is eager and every other one is lazy. This works here and did NOT
  // on the carousel: there, `loading="lazy"` on images stacked inside the visible
  // frame does nothing at all, which is how the page came to load 1.82 MB at once.
  assert.equal(SHOTS[0].lazy, false, 'the first screen is lazy — it is above the fold');
  assert.deepEqual(SHOTS.slice(1).map((s) => s.lazy), new Array(9).fill(true),
    'a screen below the fold is not lazy-loaded');

  const files = SHOTS.map((s) => s.file);
  assert.equal(new Set(files).size, 10, 'the page shows the same capture twice: ' + files.join(', '));
});

test('the carousel is gone, and so is the cream bezel it flipped to', () => {
  // Every one of these is a piece of the retired page. A rewrite that left any of
  // them behind would be a page carrying two designs.
  for (const [pat, what] of [
    [/var STEPS = \[/, 'the ten-step carousel array'],
    [/id="stepTitle"|id="stepBody"|id="stepNum"/, 'the single-step DOM slots'],
    [/class="dot"/, 'the 9x9px carousel dots'],
    [/id="progressFill"/, 'the carousel progress rail'],
    [/phone\.dark|dark: (true|false)/, 'the per-step bezel flip — four of ten steps put a CREAM frame around a BLACK screen'],
    [/<header class="nav">/, "the page's own two-link bar"],
    [/class="ga-footer/, "the page's own hand-written footer"],
    [/Fraunces|Space Grotesk|JetBrains Mono/, 'the retired type system'],
    [/#efe5cd|#0ac5a8/, 'the cream palette — its teal on its paper computed to 1.75:1'],
  ]) {
    assert.doesNotMatch(BODY, pat, 'the App page still carries ' + what);
  }
  // ⚠ The hardcoded "01 / 08" total — two steps stale on the day it shipped — has
  // no entry of its own on purpose. Its invariant is that no step counter is
  // rendered, and `var STEPS`, `id="stepNum"` and `id="stepTotal"` above are that
  // question asked structurally. A separate string check for "/ 08" adds nothing
  // and fires on the note explaining it, which is a guard that reports on prose.
});

test('the page mounts the site chrome, in its own roots', () => {
  assert.match(HTML, /<script type="text\/babel"[^>]*src="pageShell\.jsx/, 'the page does not load pageShell.jsx');
  // ⚠ COUNT THE MOUNT, NOT THE MENTION. `<Header />` appears twice in this page's
  // own notes, explaining what rendering it brings with it; a bare `<Header `
  // count reported three headers on a page that mounts one.
  // ⚠ ANCHORED ON `.render(`, NOT ON `createRoot(...)`. The first cut wrote
  // `createRoot\([^)]*\)` — and the call is
  // `createRoot(document.getElementById("shape-chrome-header"))`, whose own inner
  // `)` the class cannot cross, so it matched nothing and reported zero mounts on
  // a page that has two. A guard that reports a failure is as broken as one that
  // reports a pass.
  const headers = [...HTML.matchAll(/\.render\(<Header([^>]*)\/>\)/g)];
  const footers = [...HTML.matchAll(/\.render\(<Footer([^>]*)\/>\)/g)];
  assert.equal(headers.length, 1, 'the page mounts ' + headers.length + ' headers, not one');
  assert.equal(footers.length, 1, 'the page mounts ' + footers.length + ' footers, not one');
  assert.match(headers[0][1], / active="App"/, 'the header is mounted without active="App", so the App tab is not lit');

  // ⚠ ORDER, NOT MERE PRESENCE. These are classic scripts: `Header` and `Footer`
  // are bare globals `pageShell.jsx` assigns, so a mount running before it throws
  // a ReferenceError and the page renders with no chrome at all.
  const iShell = HTML.indexOf('src="pageShell.jsx');
  const iMount = HTML.indexOf('<Header active="App"');
  assert.ok(iShell > 0 && iMount > iShell, 'the chrome is mounted before pageShell.jsx defines it');

  // The nav table is what lights the tab. If the label ever moves, `active="App"`
  // silently matches nothing and the bar shows no current page.
  assert.match(SHELL, /\{ kind: "link", label: "App", href: "GetApp\.html" \}/,
    'the nav no longer carries an "App" entry — Header active="App" now lights nothing');
});

test('the type request names every axis the page sets', () => {
  // ⚠ GOOGLE FONTS SERVES THE AXES YOU NAME AND PINS EVERY OTHER ONE AT ITS
  // DEFAULT. A page that asks for `Doto:wght@...` and then writes
  // `font-variation-settings: 'ROND' 100` renders the square-dot form, and an
  // ignored axis is not an error in any browser, linter or build — the homepage
  // shipped exactly that on 2026-09-11 with sixteen dead rules. The only thing
  // that finds it is comparing the axes USED against the axes REQUESTED.
  const link = /<link href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/.exec(HTML);
  assert.ok(link, 'the App page requests no web font — every family renders its fallback');

  const families = {};
  for (const m of link[1].matchAll(/family=([A-Za-z+]+)(?::([A-Za-z,]+)@([^&"]+))?/g)) {
    // Axis tags are case-SENSITIVE and `ROND` is upper: a `[a-z,]` class parses
    // `Doto:ROND,wght@...` as a family with no axes at all and then reports it as
    // requested without a weight range.
    families[m[1].replace(/\+/g, ' ')] = m[2] ? m[2].split(',') : [];
  }
  assert.ok(Object.keys(families).length >= 3, 'parsed only ' + Object.keys(families).length + ' families — the parse stopped matching');
  assert.ok(families.Doto, 'the page does not request Doto, which every figure on it is set in');
  assert.ok(families.Doto.includes('ROND'), "Doto is requested without ROND — every 'ROND' rule on this page is inert");
  assert.ok(families.Anybody, 'the page does not request Anybody');
  assert.ok(families.Anybody.includes('wdth'), "Anybody is requested without wdth — every 'wdth' rule is inert");

  // Every axis the stylesheet sets must be one the request names for the family
  // that uses it. Both are single-family axes on this page, which is what lets a
  // rule be attributed at all.
  const css = /<style>([\s\S]*?)<\/style>/.exec(BODY)[1];
  const used = new Set([...css.matchAll(/font-variation-settings:\s*'([A-Za-z]+)'/g)].map((m) => m[1]));
  assert.ok(used.has('ROND') && used.has('wdth'), 'the page stopped setting the axes this guard is about');
  for (const axis of used) {
    const owners = Object.entries(families).filter(([, ax]) => ax.includes(axis)).map(([f]) => f);
    assert.ok(owners.length === 1, `'${axis}' is set in the CSS but requested by ${owners.length} families — it cannot be attributed`);
  }

  // ⚠ BYTE-IDENTICAL TO THE HOMEPAGE'S, so the two share one cache entry. A page
  // that asks for the same three families with the axes spelled differently pays
  // for a second download of all three.
  const iLink = /<link href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/.exec(INDEX);
  assert.ok(iLink, 'index.html requests no web font — this comparison is moot');
  assert.equal(link[1], iLink[1], 'the App page and the homepage request the same families with different axes');
});

test('every capture is labelled an example, and the hero says what that means', () => {
  // ⚠ THE LABEL IS WHAT MAKES THE FIGURES ON THIS PAGE ALLOWED. Each screen is
  // the app's signed-out preview: a demo persona, invented numbers. The house
  // rule is not "never show it" but "never claim it unlabelled".
  const beats = [...HTML.matchAll(/<section class="beat"[\s\S]*?<\/section>/g)].map((m) => m[0]);
  assert.equal(beats.length, 8, 'the page has ' + beats.length + ' beats, not eight');
  for (const b of beats) {
    assert.match(b, /<span class="exlabel">/, 'a beat shows a capture with no example label:\n' + b.slice(0, 200));
  }
  // The hero carries the long form once, which is what the short ones mean.
  assert.match(HTML, /<span class="exlabel">Example member &#183; captured from the app&rsquo;s signed-out preview<\/span>/,
    'the hero lost the long example label, so the short ones on each beat name nothing');
});

test('every beat states one figure, and the page claims no more than it shows', () => {
  const beats = [...HTML.matchAll(/<section class="beat"[\s\S]*?<\/section>/g)].map((m) => m[0]);
  for (const b of beats) {
    const fig = /<div class="num"><b>&#9632;<\/b>([^<]+)<\/div>/.exec(b);
    assert.ok(fig, 'a beat states no figure at all');
    assert.ok(fig[1].trim().length > 3, 'a beat states an empty figure');
  }
  // ⚠ TWO CLAIMS WITH NO CODE BEHIND THEM, retired by the owner's ruling on the
  // review (§6.3) and named here so a copy edit cannot quietly bring them back.
  // "Pick friends to be notified when you miss" has no code path — only the
  // member's own OS reminders exist; "One live channel" describes a station that
  // is not broadcasting.
  assert.doesNotMatch(HTML, /friends to be notified|notified when you miss/i,
    'the page promises friend notifications, which have no code path');
  assert.doesNotMatch(HTML, /one live channel/i,
    'the page claims a live channel; the station is not broadcasting');
});

test('the hero clock states nothing it cannot back', () => {
  const clock = /<div class="clock">([\s\S]*?)<\/div>\s*<\/div>/.exec(HTML);
  assert.ok(clock, 'the hero clock is gone');
  const figs = [...clock[1].matchAll(/<span class="num">([^<]+)<\/span><span class="eb2">([^<]+)<\/span>/g)]
    .map((m) => [m[1], m[2]]);
  assert.equal(figs.length, 4, 'the clock shows ' + figs.length + ' figures, not four');

  const byLabel = Object.fromEntries(figs.map(([v, l]) => [l, v]));
  // The screen count is the page's own, so the two cannot disagree.
  assert.equal(byLabel.screens, String(SHOTS.length), 'the clock says ' + byLabel.screens + ' screens and the page shows ' + SHOTS.length);
  // ⚠ THE LOCALE COUNT IS DERIVED FROM THE CATALOGS THAT SHIP. A number typed
  // here goes stale the day a locale lands, on a page whose whole framing is that
  // every figure is measured or labelled.
  const locales = readdirSync(new URL('../mobile-app/src/i18n/catalogs/', import.meta.url), { withFileTypes: true })
    .filter((d) => d.isDirectory()).length;
  assert.ok(locales >= 5, 'found only ' + locales + ' catalogs — the sweep is looking in the wrong place');
  assert.equal(byLabel.languages, String(locales), 'the clock says ' + byLabel.languages + ' languages; ' + locales + ' catalogs ship');
  // The price the rest of the site states.
  assert.equal(byLabel['a month'], '$5', 'the clock disagrees with the $5 membership');
});

test('the doors go somewhere, and the browser door is real', () => {
  const doors = /<section class="doors" id="notify">[\s\S]*?<\/section>/.exec(HTML);
  assert.ok(doors, 'the doors section is gone');
  for (const href of ['/newdesign/Landing.html', '/newdesign/Pricing.html']) {
    assert.ok(HTML.includes('href="' + href + '"'), 'the page does not link ' + href);
    assert.ok(existsSync(new URL('.' + href, PUB)), href + ' is linked but does not exist');
  }
  // ⚠ THE BROWSER DOOR IS NOT AN existsSync QUESTION. `public/m` is gitignored
  // with zero tracked files: the app is built into it on every deploy, so what
  // makes the link real is the build step, not a directory in the repo.
  assert.match(HTML, /<a class="try" href="\/m\/">/, 'the browser door is gone');
  const vercel = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');
  assert.match(vercel, /build-m\.sh/, 'nothing builds /m/ any more, so the browser door leads nowhere');
});

test('the waitlist sends the store the member picked', () => {
  // ⚠ IT WAS THROWING THAT CHOICE AWAY. The retired form posted { email, source }
  // and src/app/api/app-waitlist/route.ts defaults a MISSING platform to 'ios' —
  // so every Google Play sign-up was filed, and mailed, as an App Store one.
  assert.match(HTML, /<input type="hidden" name="platform"/, 'the form carries no platform field');
  assert.match(HTML, /body: JSON\.stringify\(\{ email: addr, platform: platform\.value, source: 'GetApp\.html' \}\)/,
    'the waitlist POST does not carry the platform');
  for (const p of ['ios', 'android']) {
    assert.ok(HTML.includes('data-platform="' + p + '"'), 'no store chip sets platform ' + p);
  }
  assert.match(HTML, /platform\.value = chip\.getAttribute\('data-platform'\)/, 'the chips do not write the platform field');

  // The route's own default is what an empty value falls to, which is why leaving
  // it empty when nobody picked a store is honest rather than lossy. If that
  // default ever moves, this page's "no choice" case changes meaning with it.
  const route = readFileSync(new URL('../src/app/api/app-waitlist/route.ts', import.meta.url), 'utf8');
  assert.match(route, /clean\(body\.platform, 40\) === 'android' \? 'android' : 'ios'/,
    "the waitlist route's platform rule moved — re-read what an empty platform now means");
});

test('the page reconciles with the shared header stylesheet instead of fighting it', () => {
  // ⚠ THIS IS THE ONE THAT BREAKS SILENTLY. Rendering <Header /> also renders
  // pageShell.jsx's ShapeMobileStyles, which injects SITE-WIDE `!important` rules
  // at <=900px for `main`, `section`, `h1` and `h2` — written for marketing pages
  // that lay their sections out with inline padding. This page does not: ONE
  // .wrap owns the gutter. Left alone those rules STACK (main 18 + wrap 18 +
  // section 22 = 58px of inset on a 390px screen, against the 18 the layout was
  // measured at) and force a 52px beat heading where this page's scale says 28.
  //
  // That style block is injected into the BODY at runtime, so it comes after this
  // page's <head> stylesheet: with equal specificity and both !important, IT
  // wins. The reconciliation selectors are one class more specific on purpose.
  // Delete this block and the phone layout changes with nothing failing.
  assert.match(SHELL, /main \{ padding-left: 18px !important/, 'the shell no longer pads <main> — re-derive this page\'s gutter');
  assert.match(SHELL, /section \{ padding-left: 22px !important/, 'the shell no longer pads <section> — re-derive this page\'s gutter');
  assert.match(SHELL, /h2 \{ font-size: clamp\([^)]*\) !important/, 'the shell no longer forces h2 — re-derive this page\'s type scale');

  const css = /<style>([\s\S]*?)<\/style>/.exec(HTML)[1];
  assert.match(css, /main\.ga-main \{ padding-left: 0 !important; padding-right: 0 !important; \}/,
    "the page does not neutralise the shell's <main> padding: its phone gutter is doubled");
  assert.match(css, /\.ga-main section \{ padding-left: 0 !important; padding-right: 0 !important; \}/,
    "the page does not neutralise the shell's <section> padding: 58px of inset on a 390px screen");
  assert.match(css, /\.ga-main h1 \{ font-size: clamp\([^)]*\) !important/, "the page does not restate its own h1 scale");
  assert.match(css, /\.ga-main h2 \{ font-size: clamp\([^)]*\) !important/, "the page does not restate its own h2 scale");
  assert.match(HTML, /<main class="ga-main">/, 'the reconciliation block is scoped to .ga-main and nothing carries that class');

  // ⚠ ONE BREAKPOINT, AND IT IS THE SHELL'S. The board this page was built from
  // used 860; the shell changes at 900. Two numbers 40px apart leave an 861-900
  // band taking half of each layout — a two-column beat under a phone-sized
  // headline.
  const widths = new Set([...css.matchAll(/@media \(max-width: (\d+)px\)/g)].map((m) => m[1]));
  assert.deepEqual([...widths].sort(), ['900'], 'the page has breakpoints the shell does not share: ' + [...widths].join(', '));
});

test('the sticky copy is not disabled by an ancestor scroll container', () => {
  // ⚠ THE ONE THAT BREAKS SILENTLY AND LOOKS LIKE NOTHING. `overflow-x: hidden`
  // on html or body makes that element a SCROLL CONTAINER, and a `position:
  // sticky` descendant then sticks to a box that does not scroll — so it never
  // engages, with no error anywhere. Measured in Chromium before this was fixed:
  // 320px into beat 3 the copy sat at -272 instead of the 96 it asks for.
  // `pageShell.jsx` injects `html, body { overflow-x: hidden }` site-wide from the
  // BODY, later in document order than this page's stylesheet and at the same
  // specificity — so the override has to be !important or the shell wins.
  const css = /<style>([\s\S]*?)<\/style>/.exec(BODY)[1];
  assert.match(SHELL, /html, body \{ overflow-x: hidden; \}/,
    'the shell no longer forces overflow-x — re-derive whether this page still needs its override');
  assert.match(css, /html, body \{ overflow-x: clip !important; \}/,
    'the page lost its overflow-x override: every sticky on it is inert again');
  assert.doesNotMatch(css, /overflow-x: hidden/,
    'the page sets overflow-x: hidden, which makes its own sticky copy inert');
  assert.match(css, /\.beat-copy \{[^}]*position: sticky;[^}]*top: 96px/, 'the beat copy is no longer sticky');
  // ⚠ AND THE PHONE COLUMN MUST NOT CLAIM IT. Its travel is 1px on six of the
  // eight beats — the phone is what sets the beat's height — so a `position:
  // sticky` there is an effect that cannot happen, which the next reader reads as
  // working.
  assert.doesNotMatch(css, /\.beat-ph \{[^}]*position: sticky/,
    'the phone column claims sticky, and it has 1px of travel to do it in');
});

test('the gutter is owned by one element at every width', () => {
  // The layout rule this repo keeps paying for: a side gutter set once, on one
  // element, so nothing can add a second.
  const css = /<style>([\s\S]*?)<\/style>/.exec(HTML)[1];
  assert.match(css, /\.wrap \{ max-width: 1180px; margin: 0 auto; padding: 0 32px; width: 100%; \}/, 'the wrap lost its desktop gutter');
  assert.match(css, /\.wrap \{ padding: 0 18px; \}/, 'the wrap lost its phone gutter');
  // The doors sit outside .wrap and carry their own, which is the one exception.
  assert.match(css, /\.doors-in \{[^}]*padding: 64px 32px/, 'the doors lost their own gutter');
  assert.match(css, /\.doors-in \{ grid-template-columns: 1fr; gap: 36px; padding: 44px 18px; \}/, 'the doors lost their phone gutter');
});

test('the page still declares a viewport and its own canonical', () => {
  // The page a phone is redirected to. Without this it reports a 980px layout and
  // every rule above is dormant — which is exactly what the three dashboard
  // shells did until 2026-09-09.
  assert.match(HTML, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" \/>/,
    'the App page lost its viewport meta');
  assert.match(HTML, /<link rel="canonical" href="https:\/\/theshapecommunity\.com\/newdesign\/GetApp\.html">/,
    'the App page lost its canonical');
});
