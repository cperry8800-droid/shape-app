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
import { readFileSync } from 'node:fs';

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

test('the homepage does not claim the station is live', () => {
  // /api/radio/now-playing falls through to the mock provider (public.radio_station
  // does not exist), and /api/radio/station is 401 for anonymous callers and
  // deliberately hides `configured` — so nothing on a signed-out page can check a
  // liveness claim. The honest state is not to advertise.
  const text = visibleText(SRC);
  assert.equal(/\bON AIR\b/i.test(text), false, 'homepage renders an ON AIR chip');
  assert.equal(/\bLIVE\b/.test(text), false, 'homepage renders a LIVE badge');
  // and the equaliser that used to sit under it
  assert.equal(/@keyframes\s+eq\b/.test(SRC), false, 'the LIVE equaliser animation is back');
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
  // eyebrow, at the summit, in the journey dial and beside the Score capture.
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
