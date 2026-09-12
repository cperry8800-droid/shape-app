// tests/homepage-climb.test.mjs
//
// The homepage is Concept E · The Climb. These pin the properties that are
// cheapest to reintroduce by accident and most expensive to ship: a liveness
// claim the station cannot back, an illustrative figure with no label, and the
// redirect that used to keep phones off this page entirely.
//
// Every assertion reads the SHIPPED file. None of them pins a spelling of the
// design — they pin claims.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const SRC = readFileSync(new URL('../public/newdesign/index.html', import.meta.url), 'utf8');

/** Everything outside <script>, <style> and HTML comments — i.e. what a
 *  visitor actually reads. A word inside a comment explaining why it is absent
 *  must not count as the page making the claim. */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');
}

/** The Radio section, markup only — so a chip in the nav or anywhere else on the
 *  page cannot satisfy an assertion about the CARD. */
function radioSection(html) {
  const m = /<section[^>]*id="radio"[\s\S]*?<\/section>/.exec(html);
  return m ? m[0] : '';
}

/** The `.air` card itself, matched by walking div depth from its opening tag.
 *
 *  ⚠ THE SECTION IS TOO WIDE A SCOPE FOR THIS — CodeRabbit, #2045. The section
 *  holds a text column as well as the card, so asserting "somewhere in #radio
 *  there is an exlabel" is satisfied by a label sitting beside the headline
 *  while `.air` carries an unlabelled ON AIR chip. The label has to be bound to
 *  the thing it labels, which means matching the card, which means counting
 *  nested divs rather than reaching for a lazy `[\s\S]*?</div>`. */
function airCard(html) {
  // ⚠ READS THE TAG NAME rather than assuming a div. The card became an <a> when
  // the whole box was made a link to Radio, and a matcher hard-coded to <div>
  // returns '' for it — which this file's own assertion would report as "no .air
  // card found", i.e. the guard failing for a reason that is about the guard.
  const open = /<(\w+)[^>]*class="[^"]*\bair\b[^"]*"[^>]*>/.exec(html);
  if (!open) return '';
  const el = open[1];
  const start = open.index;
  let i = start + open[0].length;
  let depth = 1;
  const tag = new RegExp(`<(/?)${el}\\b[^>]*>`, 'g');
  tag.lastIndex = i;
  let m;
  while ((m = tag.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  return '';
}

test('an ON AIR chip on the homepage is labelled as an example', () => {
  // ⚠ THE RULE IS NOT "NEVER SAY ON AIR" — IT IS "NEVER CLAIM IT UNLABELLED".
  // /api/radio/now-playing falls through to the mock provider (public.radio_station
  // does not exist, re-measured against production before this change), and
  // /api/radio/station is 401 for anonymous callers and deliberately hides
  // `configured`, so nothing on a signed-out page can check a liveness claim.
  // The card may still SHOW the chip, because this page's own convention is to
  // label illustrative content — the same `.exlabel` the marketplace cards and the
  // phone captures carry. What is forbidden is the chip without the label.
  const section = radioSection(SRC);
  assert.ok(section, 'no #radio section found — the scan is broken, not the page');
  const card = airCard(section);
  assert.ok(card, 'no .air card found inside #radio — the scan is broken, not the page');
  assert.ok(
    card.length < section.length,
    'the .air matcher swallowed the whole section — the div walk is broken, so a label ' +
      'anywhere in #radio would satisfy a card-level assertion',
  );

  // The chip and its label must live in the SAME card, or the label is not
  // labelling the claim.
  if (/\bON\s*AIR\b/i.test(card)) {
    assert.match(
      card,
      /class="exlabel"/,
      'the Radio card shows ON AIR with no example label of its own — that is an ' +
        'unlabelled liveness claim, and the station is not broadcasting',
    );
    assert.match(
      visibleText(card),
      /\bExample\b/i,
      "the card's exlabel does not say Example",
    );
  }

  // The chip is the CARD's alone. The nav is a standing claim with nowhere to put
  // a label, so ON AIR must not appear outside the Radio section.
  const outside = visibleText(SRC.replace(radioSection(SRC), ' '));
  assert.equal(/\bON\s*AIR\b/i.test(outside), false, 'ON AIR appears outside the Radio card');
  assert.equal(/\bLIVE\b/.test(outside), false, 'a LIVE badge appears outside the Radio card');
});

test('the shared header does not claim the station is live either', () => {
  // ⚠ Fixing the homepage alone would have left the same claim on every OTHER
  // newdesign page: pageShell's RadioWordmark carried a permanent "ON AIR" tag
  // with a pulsing dot, and ~70 pages render that header. One page disagreeing
  // with the rest of the site about whether the radio is broadcasting is worse
  // than either answer on its own.
  const shell = readFileSync(new URL('../public/newdesign/pageShell.jsx', import.meta.url), 'utf8');
  const code = shell.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  assert.equal(/ON\s*AIR/i.test(code), false, 'the shared header claims ON AIR again');
  // the wordmark itself must survive — this is about the claim, not the link
  assert.match(code, /RadioWordmark/);
  assert.match(code, /\/newdesign\/Radio\.html/);
});

test('the shared radio wordmark RENDERS, and what it renders claims nothing', async () => {
  // ⚠ A source scan for "ON AIR" is satisfied by the component being deleted,
  // broken, or never mounted — all three read as a pass. This compiles the
  // shipped component out of pageShell.jsx and renders it, so the assertions
  // are about markup that exists.
  const { transformSync } = await import('@babel/core');
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');

  const src = readFileSync(new URL('../public/newdesign/pageShell.jsx', import.meta.url), 'utf8');
  const i = src.indexOf('function RadioWordmark(');
  assert.ok(i > 0, 'RadioWordmark is gone from pageShell');
  let depth = 0, started = false, end = -1;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') { depth++; started = true; }
    else if (src[k] === '}') { depth--; if (started && depth === 0) { end = k + 1; break; } }
  }
  assert.ok(end > i, 'could not brace-match RadioWordmark');
  const consts = (src.match(/^const (TEAL_BRIGHT|RUST|mono|sans)\s*=.*$/gm) || []).join('\n');
  // ⚠ guard the guard: without the constants the component throws a
  // ReferenceError and the failure reads as "the component is broken".
  assert.match(consts, /TEAL_BRIGHT/, 'the constants were not lifted');

  // the `return` is appended AFTER transpiling — a bare top-level return is a
  // parse error in module scope and would fail before any JSX is compiled
  const js = transformSync(consts + '\n' + src.slice(i, end), {
    presets: [['@babel/preset-react', { runtime: 'classic' }]],
    filename: 'wordmark.jsx', configFile: false, babelrc: false,
  }).code;
  const Cmp = new Function('React', js + '\nreturn RadioWordmark;')(React);
  const html = renderToStaticMarkup(React.createElement(Cmp));
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  assert.ok(html.length > 200, 'the wordmark rendered almost nothing: ' + html.length + ' chars');
  assert.match(html, /href="\/newdesign\/Radio\.html"/);
  assert.equal(text, 'Shape Radio', 'the wordmark says something else now: ' + JSON.stringify(text));
  assert.equal((html.match(/<polygon/g) || []).length, 2, 'the two-triangle mark changed');
  assert.equal(/ON\s*AIR/i.test(text), false, 'the rendered wordmark claims ON AIR');
});

test('phones get the homepage — no width redirect', () => {
  assert.equal(
    /matchMedia\([^)]*max-width\s*:\s*7\d\dpx[^)]*\)[\s\S]{0,200}?location\.replace/.test(SRC),
    false,
    'a narrow-viewport redirect is back on the homepage'
  );
  assert.equal(/GetApp\.html['"]\s*\)\s*;?\s*\}/.test(SRC.slice(0, 2000)), false,
    'the head still redirects to GetApp.html');
});

test('every illustrative figure carries an example label', () => {
  // The score is a picture of the idea, not a reading. It appears in the fold
  // eyebrow, at the summit and in the journey dial. The other labels mark the
  // captured screens and the demo coach cast as examples.
  const labels = SRC.match(/class="exlabel"/g) || [];
  assert.ok(labels.length >= 4, `expected >= 4 example labels, found ${labels.length}`);

  // the demo coach cast says what it is
  assert.match(visibleText(SRC), /Example profiles until real ones render/);
  // the summit names itself
  assert.match(visibleText(SRC), /Shape Score\s*·\s*example/i);
  // and the canvas figure does too, in the one place a label cannot be markup
  assert.match(SRC, /SHAPE SCORE · EXAMPLE/);
});

test('the marketplace count treats an unreadable read as unknown, never as none', () => {
  // /api/marketplace-stats answers `count ?? 0`, so a failed query is a zero.
  // Writing "0 coaches" because a query timed out is the exact claim this page
  // exists to stop making.
  const wire = SRC.slice(SRC.indexOf('THE WIRE + THE MARKETPLACE COUNT'));
  assert.ok(wire.length > 0, 'the wire block is gone');
  assert.match(wire, /if\(!t&&!n\)\s*return/, 'a zero count is no longer treated as unknown');
});

test('the fold degrades without script: no phantom score, a painted ridge', () => {
  // With JS off the canvas never draws and the climb never runs, so the summit
  // block would otherwise render a literal 0 under "Shape Score · example".
  assert.match(SRC, /\.summit\{[^}]*opacity:0/, 'the summit no longer starts hidden');
  // and the fold still has a ground rather than an empty black box
  assert.match(SRC, /\.hero \.paint\{position:absolute/, 'the painted fallback is gone');
  assert.match(SRC, /\.no-js \.jn p\{max-height/, 'journey stages stay collapsed without script');
});

test('the footer links go somewhere other than this page', () => {
  // H19: "About" used to link to index.html and "Payouts" to a gated dashboard.
  const foot = SRC.slice(SRC.indexOf('<footer'), SRC.indexOf('</footer>'));
  assert.ok(foot.length > 0, 'no footer');
  assert.equal(/<a href="\/newdesign\/index\.html">About<\/a>/.test(foot), false,
    'the footer About link points back at the homepage');
  assert.equal(/TrainerDashboard\.html/.test(foot), false,
    'the footer links a gated dashboard as a public page');
  // relative links among absolute ones (H19's third case)
  const rel = foot.match(/href="(?!https?:|\/|#|mailto:)[^"]+"/g) || [];
  assert.deepEqual(rel, [], `footer has relative links: ${rel.join(', ')}`);
});

test('one teal, and it is the app pair', () => {
  // H20: the site ran #0ac5a8/#2ee0c4 while the app runs #0a8f87/#34d6c5. E's
  // thesis is that the phone and the website are one product.
  //
  // ⚠ Comments are stripped FIRST. The first version of this failed on the
  // sentence above the CSS variable that explains which teal was retired —
  // a guard that trips on the prose describing the fix is measuring the
  // wrong thing, and it would push the next reader to delete the explanation.
  const code = SRC
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
  assert.equal(/#0ac5a8/i.test(code), false, 'the old site teal is back');
  assert.equal(/#2ee0c4/i.test(code), false, 'the old bright site teal is back');
  assert.match(code, /--teal:#34d6c5/);
  // and the guard must be able to see the colours at all
  assert.ok(/#34d6c5/i.test(code), 'comment stripping ate the stylesheet');
});

// ⚠ THE TWO DEGRADATIONS OWE THE JOURNEY ITS OWN HEIGHT, NOT JUST ITS COPY.
// The stages open by script, so reduced motion and no-JS both leave the rail
// static — and .jtrack stayed 320vh with .jpin sticky, so those visitors
// scrolled ~3.2 viewports past a screen that could not change. Measured in
// Chromium before the fix and after: 2880px → 686px on both paths, and no-JS
// went from 0/5 to 5/5 stages showing body text. (Codex, #2045.)
//
// These pin the INVARIANT — each degradation releases both the track height and
// the sticky pin — rather than the spelling of the rule, because either one
// alone leaves the defect: an un-pinned 320vh track is still three viewports of
// blank, and a sticky auto-height one still traps the screen.
function blockAfter(src, marker) {
  const at = src.indexOf(marker);
  assert.notEqual(at, -1, `not found: ${marker}`);
  const open = src.indexOf('{', at);
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}' && --d === 0) return src.slice(at, i + 1);
  }
  throw new Error(`unbalanced block for ${marker}`);
}

for (const [label, marker] of [
  ['reduced motion', '@media (prefers-reduced-motion: reduce)'],
  ['no JavaScript', '<noscript><style>'],
]) {
  test(`${label} releases the journey's pin and its height`, () => {
    const block = label === 'no JavaScript'
      ? SRC.slice(SRC.indexOf(marker), SRC.indexOf('</style></noscript>'))
      : blockAfter(SRC, marker);
    assert.ok(block.length > 80, `${label} block looks truncated (${block.length} chars)`);
    assert.match(block, /\.jtrack\s*\{[^}]*height\s*:\s*auto/,
      `${label} leaves .jtrack at its scripted height — the visitor scrolls viewports of an unchanging screen`);
    assert.match(block, /\.jpin\s*\{[^}]*position\s*:\s*static/,
      `${label} leaves .jpin sticky, so the screen is still trapped`);
    // and the copy has to be readable, or the released height shows five headings
    assert.match(block, /\.jn\s*\{[^}]*opacity\s*:\s*1/, `${label} leaves the stages dimmed`);
    assert.match(block, /\.jn p\s*\{[^}]*max-height\s*:\s*90px/, `${label} leaves the stage bodies collapsed`);
  });
}

test('the closed mobile drawer is out of the tab order, not merely invisible', () => {
  // ⚠ `opacity:0; pointer-events:none` hides a thing from the eye and the
  // pointer and leaves it FOCUSABLE — eight invisible links in the tab order
  // and a duplicate menu in the accessibility tree. Measured at 390px: 8
  // keyboard-reachable before, 0 after. (Codex, #2045.)
  const closed = /\.ndrawer\{display:block;[\s\S]*?\}/.exec(SRC);
  assert.ok(closed, 'the mobile drawer rule is gone');
  assert.match(closed[0], /visibility\s*:\s*hidden/,
    'the closed drawer is only transparent — its links stay focusable');
  const open = /\.ndrawer\.open\{[^}]*\}/.exec(SRC);
  assert.ok(open, 'the open-drawer rule is gone');
  assert.match(open[0], /visibility\s*:\s*visible/,
    'the drawer is hidden when closed and never made visible when open');
});

// ⚠ A SHORT VIEWPORT CANNOT HOLD THE PINNED RAIL. .jpin is a fixed
// calc(100vh - 66px) with overflow:hidden, so on a landscape phone it is ~324px
// against ~492px of rail — measured at 844x390 and 740x360, THREE OF FIVE stages
// sat outside the box for the whole pinned scroll, unreachable rather than
// scrollable. Portrait and desktop measured 0 clipped, before and after.
// (Codex, #2045.)
test('a short viewport releases the journey instead of clipping it', () => {
  const m = /@media\s*\(max-height:\s*(\d+)px\)\s*\{([\s\S]*?)\n  \}/.exec(SRC);
  assert.ok(m, 'no short-viewport rule — a landscape phone clips the journey rail');
  const px = Number(m[1]);
  assert.ok(px >= 560, `the short-viewport breakpoint is ${px}px, below the ~492px rail plus its header`);
  const block = m[2];
  assert.match(block, /\.jtrack\s*\{[^}]*height\s*:\s*auto/, 'the track keeps its scripted height on a short viewport');
  assert.match(block, /\.jpin\s*\{[^}]*position\s*:\s*static/, 'the pin survives on a short viewport');
  // releasing the pin alone shows five dimmed headings: the stages open by script
  assert.match(block, /\.jn\s*\{[^}]*opacity\s*:\s*1/, 'the released stages stay dimmed');
  assert.match(block, /\.jn p\s*\{[^}]*max-height\s*:\s*90px/, 'the released stage bodies stay collapsed');
});

// ⚠ THE TWO MARKETPLACE COUNTS FAIL INDEPENDENTLY, AND THE GUARD USED TO ASK
// ONE QUESTION ABOUT BOTH. `count ?? 0` per query against a `!t && !n` guard
// suppressed the line only when BOTH were zero — so a failed trainers read
// beside a healthy nutritionists one published "0 trainers · 1 nutritionist":
// a read that never happened, printed as a count. Driven in Chromium across six
// states; the two half-failures went from advertising to silent. (Codex, #2045.)
test('the marketplace wire is silent unless BOTH counts were actually read', () => {
  const at = SRC.indexOf("fetch('/api/marketplace-stats')");
  assert.notEqual(at, -1, 'the marketplace count fetch is gone');
  const block = SRC.slice(at, SRC.indexOf('})();', at));
  assert.ok(block.length > 200, `the fetch block looks truncated (${block.length} chars)`);
  // the type check must exist AND run before the falsy-zero check, or an
  // unreadable null is judged by a test that cannot tell it from a measured 0
  const typed = block.search(/typeof\s+t\s*!==\s*'number'\s*\|\|\s*typeof\s+n\s*!==\s*'number'/);
  const zero = block.search(/if\s*\(\s*!t\s*&&\s*!n\s*\)/);
  assert.notEqual(typed, -1, 'nothing separates an unreadable count from a measured zero');
  assert.notEqual(zero, -1, 'the measured-zero-on-both rule is gone');
  assert.ok(typed < zero, 'the zero check runs before the readability check');
  // and the counts must not be coerced on the way in, which would erase null
  assert.equal(/var t=d\.trainers\s*\|\|/.test(block), false,
    'the trainers count is coerced with ||, which turns an unreadable null into 0');
  assert.equal(/var n=d\.nutritionists\s*\|\|/.test(block), false,
    'the nutritionists count is coerced with ||, which turns an unreadable null into 0');
});

test('the marketplace route reports an unreadable count as null, never 0', async () => {
  const { readFileSync } = await import('node:fs');
  const raw = readFileSync(new URL('../src/app/api/marketplace-stats/route.ts', import.meta.url), 'utf8');
  // ⚠ COMMENTS ARE STRIPPED FIRST — the comment above the fix QUOTES the defect
  // it replaced (`count ?? 0`), so the first version of this failed on the prose
  // explaining the fix. That is the same trap the teal guard above records, walked
  // into again three tests later, which is why it is written here too: a guard that
  // trips on the sentence describing the change pushes the next reader to delete
  // the explanation.
  const route = raw
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
  assert.ok(/NextResponse\.json/.test(route), 'comment stripping ate the route body');
  assert.equal(/count\s*\?\?\s*0/.test(route), false,
    'the route still collapses a failed count to 0 — the consumer cannot tell none from not-read');
  assert.match(route, /trainers\.error\s*\?\s*null/, 'a failed trainers query is not reported as unreadable');
  assert.match(route, /nutritionists\.error\s*\?\s*null/, 'a failed nutritionists query is not reported as unreadable');
  // a partial sum is a smaller claim wearing the same name
  assert.match(route, /total:\s*bothKnown\s*\?/, 'total is summed even when one half is unknown');
});

/** A ring's position expressed in the CAPTURE's own pixels — the only frame in
 *  which it is stable. `--y` offsets the image by a % of the IMAGE's height while
 *  a ring's top/height are a % of the WINDOW, so the two only agree at one aspect
 *  ratio. Returns null for a shot with no ring. */
function ringInImagePx(shotHtml, windowRatio) {
  const IMG_W = 600, IMG_H = 1387;              // every capture on this page
  const y = /style="--y:([\d.]+)%"/.exec(shotHtml);
  const hl = /class="hl" style="top:([\d.]+)%;height:([\d.]+)%"/.exec(shotHtml);
  if (!y) return null;
  const visibleTop = (Number(y[1]) / 100) * IMG_H;
  const visibleH = windowRatio * IMG_W;          // window height, in image px
  if (!hl) return { visibleTop, visibleH, ring: null };
  return {
    visibleTop, visibleH,
    ring: {
      top: visibleTop + (Number(hl[1]) / 100) * visibleH,
      height: (Number(hl[2]) / 100) * visibleH,
    },
  };
}

test('a moments ring points at the same pixels of the capture, whatever the window shape', () => {
  // ⚠ THE ASPECT RATIO AND THE RINGS ARE ONE NUMBER IN TWO PLACES, and nothing
  // else can report them disagreeing: change `aspect-ratio` alone and every ring
  // slides off the content it was aimed at while still drawing a perfectly good
  // teal box over whatever is now underneath it. Both values stay legal CSS, the
  // page renders, the suite goes green, and the only symptom is a ring around the
  // wrong row. So this asserts the one frame that cannot drift: where each ring
  // sits in the CAPTURE's own 600x1387 pixels.
  const ar = /\.mo \.shot\{[^}]*aspect-ratio:(\d+)\/(\d+)/.exec(SRC);
  assert.ok(ar, 'could not read the moments shot aspect-ratio');
  const ratio = Number(ar[2]) / Number(ar[1]);   // window height as a multiple of its width

  const shots = [...SRC.matchAll(/<div class="shot">[\s\S]*?<\/div>/g)].map((m) => m[0]);
  assert.equal(shots.length, 4, `expected the four moments shots, found ${shots.length}`);

  // Measured on the shipped page when the window went from 1/1 to 3/4. A ring
  // that moves in this frame is a ring pointing somewhere new.
  const EXPECTED = [
    { file: 'home-eat-v1.jpg', top: 524.5, height: 144 },
    { file: 'home-grocery-v1.jpg', top: 651.8, height: 180 },
    { file: 'home-session-v1.jpg', top: 310.05, height: 114 },
    { file: 'home-feed-v1.jpg', top: 665.3, height: 174 },
  ];

  for (const [i, shot] of shots.entries()) {
    const want = EXPECTED[i];
    assert.ok(shot.includes(want.file), `moments shot ${i + 1} should be ${want.file}`);
    const got = ringInImagePx(shot, ratio);
    assert.ok(got && got.ring, `moments shot ${i + 1} lost its ring`);
    assert.ok(Math.abs(got.ring.top - want.top) < 1.5,
      `${want.file}: the ring moved to image px ${got.ring.top.toFixed(1)}, was ${want.top}`);
    assert.ok(Math.abs(got.ring.height - want.height) < 1.5,
      `${want.file}: the ring is now ${got.ring.height.toFixed(1)} image px tall, was ${want.height}`);

    // And the window may never run off the bottom of the capture, or the card
    // shows a strip of card background pretending to be part of the screen.
    assert.ok(got.visibleTop + got.visibleH <= 1387,
      `${want.file}: the window reaches image px ${(got.visibleTop + got.visibleH).toFixed(0)} of 1387`);
  }
});

test('the journey phone has one capture per stage, and ships showing the first', () => {
  // The rail advances five stages and the phone follows it. Under reduced motion
  // and with no JavaScript the script never runs, so whatever the MARKUP holds is
  // the finished render — it has to be a real stage, not a blank frame.
  const stages = [...SRC.matchAll(/<div class="jn(?: on)?"><div class="n">/g)].length;
  assert.equal(stages, 5, `expected five journey stages, found ${stages}`);

  const table = /var PH=\[([\s\S]*?)\n  \];/.exec(SRC);
  assert.ok(table, 'could not find the journey phone table');
  const files = [...table[1].matchAll(/'(\/newdesign\/[\w.-]+\.jpg)'/g)].map((m) => m[1]);
  assert.equal(files.length, stages,
    `the phone has ${files.length} captures for ${stages} stages — a stage would keep the previous screen`);
  assert.equal(new Set(files).size, files.length, 'two stages share a capture');

  for (const f of files) {
    assert.ok(existsSync(new URL('../public' + f, import.meta.url)), `${f} is referenced but not in the repo`);
  }

  // Entry 0 and the seeded markup must be the same screen, or the first thing a
  // reduced-motion visitor sees is a stage the rail is not on.
  const seeded = /<img id="jph-img" src="([^"]+)"/.exec(SRC);
  assert.ok(seeded, 'the journey phone image lost its id');
  assert.equal(seeded[1], files[0],
    `the markup ships ${seeded[1]} but stage 1 is ${files[0]}`);

  // A superseded swap must be a no-op — the rail can cross three stages in one
  // flick of the wheel and the last callback to fire would otherwise win.
  assert.match(SRC, /im\.onload=function\(\)\{ if\(phIdx!==mine\) return;/,
    'the phone swap must drop a result whose stage is no longer current');
});

test('the price phone is not a screen the journey rail already showed', () => {
  // ⚠ IT WAS. The price section carried home-score-v1.jpg under the headline
  // "The Shape Score" and the sentence "One number over everything you log,
  // with the ladder it climbs." — byte-for-byte the journey rail's stage 04.
  // So a reader scrolled past the same frame twice and learned nothing the
  // second time, on the one screen where they are deciding what $5 buys.
  //
  // ⚠ AND "NO CAPTURE TWICE ON THE PAGE" WOULD FAIL CORRECT CODE, which is why
  // this is scoped to these two blocks. The moments strip and the rail SHARE
  // home-session-v1.jpg and home-feed-v1.jpg deliberately, under different
  // headlines, and the rail's stage 0 is the seeded markup by design — the test
  // above asserts that sameness. What must not repeat is the standing phone
  // beside the price showing a stage the rail has already walked the reader
  // through.
  const price = /<section class="s" id="price">[\s\S]*?<\/section>/.exec(SRC);
  assert.ok(price, 'the price section is gone — this guard is moot');

  const img = /<img src="([^"?]+)[^"]*"/.exec(price[0]);
  assert.ok(img, 'the price section has no capture — nothing to compare');
  const shot = img[1];
  assert.ok(existsSync(new URL('../public' + shot, import.meta.url)),
    `${shot} is referenced but not in the repo`);

  const cap = /<div class="phcap"><b>([^<]+)<\/b>/.exec(price[0]);
  assert.ok(cap, 'the price caption lost its headline');
  const headline = cap[1].trim();

  const table = /var PH=\[([\s\S]*?)\n  \];/.exec(SRC);
  assert.ok(table, 'could not find the journey phone table');
  const railFiles = [...table[1].matchAll(/'(\/newdesign\/[\w.-]+\.(?:jpg|png))'/g)].map((m) => m[1]);
  const railHeads = [...table[1].matchAll(/,\s*'([^']+)',\n/g)].map((m) => m[1].trim());
  assert.ok(railFiles.length >= 5, `read ${railFiles.length} rail captures — the parse stopped matching`);
  assert.ok(railHeads.length >= 5, `read ${railHeads.length} rail headlines — the parse stopped matching`);

  assert.ok(!railFiles.includes(shot),
    `the price phone shows ${shot}, which the journey rail already walked the reader through`);
  assert.ok(!railHeads.includes(headline),
    `the price caption says "${headline}", which is already a journey stage's headline`);
});
