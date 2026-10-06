// tests/homepage-splash.test.mjs
//
// The website homepage's splash ("The Census"), restored 2026-10-06 on the owner's
// word ("make sure the splash page is present on shape website"), with a new line
// under the mark, "You don't climb alone." (the owner's pick the same day, over the
// old "Tonight, we train."). The homepage rebuild of 2026-09-11 had replaced it
// with the fold's own load-in.
//
// The splash script is lifted out of the shipped page and run inside a real DOM, so
// these pin what it DOES: when it plays, when it stays out of the way, how it ends,
// and what it tells the fold. The fold's half of that contract (hold while the
// splash runs, start when it ends) is driven through the shipped functions, the way
// homepage-climb-route drives the route.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { stripComments } from './helpers/strip-comments.mjs';

const SRC = readFileSync(new URL('../public/newdesign/index.html', import.meta.url), 'utf8');
const HOME = 'https://www.theshapecommunity.com/newdesign/index.html';

function cut(start, end, label) {
  const s = SRC.indexOf(start);
  assert.notEqual(s, -1, `${label}: start not found`);
  assert.equal(SRC.indexOf(start, s + start.length), -1, `${label}: start is not unique`);
  const e = SRC.indexOf(end, s + start.length);
  assert.notEqual(e, -1, `${label}: end not found`);
  return SRC.slice(s, e);
}

const MARKUP = cut('<div id="shape-intro"', '\n<script>\n/* ══ WHEN THE SPLASH PLAYS', 'splash markup');
const SCRIPT = cut('/* ══ WHEN THE SPLASH PLAYS', '</script>', 'splash script');

/** Arrive at the homepage: the shipped splash script runs in a fresh DOM. Timers
 *  are captured rather than run, so each test decides when 2.9 s has passed. */
function arrive({ url = HOME, referrer, seen = false, reduced = false, user = null, summit = true, rects } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body>${MARKUP}
<div id="summit" style="${summit ? 'left:900px;top:500px' : ''}"><svg class="flag"></svg></div></body></html>`,
    { url, ...(referrer ? { referrer } : {}), runScripts: 'outside-only', pretendToBeVisual: true });
  const win = dom.window;
  const timers = [];
  const events = [];
  const fetches = [];
  win.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  win.matchMedia = (q) => ({ matches: reduced && /prefers-reduced-motion:\s*reduce/.test(q) });
  win.scrollTo = () => {};
  win.fetch = (u) => {
    fetches.push(String(u));
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ user }) });
  };
  if (seen) win.sessionStorage.setItem('shape.introSeen', '1');
  if (rects) {
    win.Element.prototype.getBoundingClientRect = function () {
      for (const [sel, r] of Object.entries(rects)) {
        if (this.matches(sel)) return { ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height };
      }
      return { left: 0, top: 0, width: 0, height: 0, x: 0, y: 0, right: 0, bottom: 0 };
    };
  }
  win.addEventListener('shape:intro-start', () => events.push('start'));
  win.addEventListener('shape:intro-end', () => events.push('end'));
  win.eval(SCRIPT);
  /** run every captured timer of `ms` that has not run yet; returns how many ran */
  const fire = (ms) => {
    const due = timers.filter((t) => t.ms === ms && !t.ran);
    for (const t of due) { t.ran = true; t.fn(); }
    return due.length;
  };
  return { win, events, timers, fetches, fire, body: win.document.body, el: () => win.document.getElementById('shape-intro') };
}
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

test('a fresh arrival plays the splash, and it ends on its own at 2.9 s', () => {
  const a = arrive();
  assert.ok(a.el().classList.contains('run'), 'the overlay did not show');
  assert.equal(a.el().querySelectorAll('.istars circle').length, 70, 'the sky was not drawn');
  assert.equal(a.win.__shapeIntro, 'running');
  assert.deepEqual(a.events, ['start']);
  assert.ok(a.body.classList.contains('intro-lock'), 'the page scrolls under the splash');
  assert.ok(a.body.classList.contains('intro-active'), 'the chat launcher shows over the splash');
  assert.equal(a.win.sessionStorage.getItem('shape.introSeen'), '1', 'it would play again on the next arrival this session');

  assert.equal(a.fire(2900), 1, 'no 2.9 s end');
  assert.equal(a.win.__shapeIntro, 'done');
  assert.deepEqual(a.events, ['start', 'end']);
  assert.ok(a.el().classList.contains('go'), 'the overlay did not start fading');
  assert.equal(a.body.classList.contains('intro-lock'), false, 'the page is still scroll-locked after the splash');
  assert.ok(a.body.classList.contains('intro-active'), 'the chat launcher came back before the fade finished');

  assert.equal(a.fire(1050), 1, 'nothing cleans up after the fade');
  assert.equal(a.el(), null, 'the overlay was left in the page');
  assert.equal(a.body.classList.contains('intro-active'), false, 'the chat launcher stays hidden for good');
});

test('it stays out of the way of a visitor who should go straight to the page', () => {
  const cases = {
    'reduced motion': { reduced: true },
    '?home': { url: `${HOME}?home` },
    'a link from inside the site': { referrer: 'https://www.theshapecommunity.com/newdesign/About.html' },
    'a second arrival this session': { seen: true },
    'a deep link to a section': { url: `${HOME}#moments` },
  };
  for (const [label, opts] of Object.entries(cases)) {
    const a = arrive(opts);
    assert.equal(a.el(), null, `${label}: the overlay is still in the page`);
    assert.equal(a.win.__shapeIntro, undefined, `${label}: it told the fold it was running`);
    assert.deepEqual(a.events, [], `${label}: it announced itself`);
    assert.equal(a.body.className, '', `${label}: it locked the page`);
    assert.equal(a.timers.length, 0, `${label}: it scheduled an end`);
    assert.deepEqual(a.fetches, [], `${label}: it asked /api/me`);
  }
  // the positive control: a link from ANOTHER site is a fresh arrival
  assert.equal(arrive({ referrer: 'https://www.google.com/' }).win.__shapeIntro, 'running',
    'a visitor arriving from another site must still see the splash');
});

test('?splash plays it whatever the other rules say, and never asks /api/me', async () => {
  const a = arrive({
    url: `${HOME}?splash#moments`, reduced: true, seen: true, user: { id: 'u1' },
    referrer: 'https://www.theshapecommunity.com/newdesign/About.html',
  });
  assert.equal(a.win.__shapeIntro, 'running');
  await settle();
  assert.deepEqual(a.fetches, [], 'a forced splash asked /api/me');
  assert.equal(a.win.__shapeIntro, 'running', 'a signed-in owner checking ?splash had it cut short');
});

test('a signed-in visitor has it cut short once /api/me answers; a signed-out one does not', async () => {
  const member = arrive({ user: { id: 'u1' } });
  assert.deepEqual(member.fetches, ['/api/me']);
  await settle();
  assert.equal(member.win.__shapeIntro, 'done');

  const visitor = arrive();
  await settle();
  assert.equal(visitor.win.__shapeIntro, 'running', 'a signed-out visitor lost the splash');
});

test('a scroll, a swipe, a key or a tap ends it, and it ends once', () => {
  const inputs = {
    wheel: (a) => a.win.dispatchEvent(new a.win.Event('wheel')),
    touchmove: (a) => a.win.dispatchEvent(new a.win.Event('touchmove')),
    keydown: (a) => a.win.dispatchEvent(new a.win.Event('keydown')),
    click: (a) => a.el().dispatchEvent(new a.win.Event('click')),
  };
  for (const [label, go] of Object.entries(inputs)) {
    const a = arrive();
    go(a);
    assert.equal(a.win.__shapeIntro, 'done', `${label} did not end it`);
    a.fire(2900);
    a.win.dispatchEvent(new a.win.Event('keydown'));
    assert.deepEqual(a.events, ['start', 'end'], `${label}: it ended more than once`);
  }
});

test('the line under the mark is the owner\'s, and nothing rewrites it', () => {
  const line = arrive().el().querySelector('.iline');
  assert.ok(line, 'no line under the mark');
  assert.equal(line.textContent.replace(/\s+/g, ' ').trim(), 'You don’t climb alone.');
  assert.equal(line.querySelector('b')?.textContent, 'alone.', 'the teal word moved');
  // the old line followed the visitor's clock ("Tonight," / "Today,")
  assert.doesNotMatch(stripComments(SCRIPT), /getHours\(\)|shape-intro-word/, 'a clock rewrite of the line is back');
  assert.doesNotMatch(stripComments(MARKUP), /Tonight|we train/, 'the retired line is back');
});

test('the hand-off lands the mark on the summit flag, and only where the flag really is', () => {
  const rects = {
    '.imark': { left: 600, top: 300, width: 118, height: 146 },
    '.iw': { left: 560, top: 300, width: 200, height: 220 },
    '.flag': { left: 900, top: 480, width: 22, height: 26 },
  };
  const placed = arrive({ rects });
  placed.fire(2900);
  const iw = placed.el().querySelector('.iw');
  // the mark's centre (659, 373) to the flag's (911, 493), at the flag's size
  assert.equal(iw.style.transformOrigin, '99px 73px');
  assert.match(iw.style.transform, /^translate\(252px, ?120px\) scale\(0\.186/);

  // before the climb has drawn once the summit has no inline left: nowhere true to land
  const unplaced = arrive({ rects, summit: false });
  unplaced.fire(2900);
  assert.equal(unplaced.el().querySelector('.iw').style.transform, '', 'it glided to a summit that was never placed');

  // nor is a flag below the fold (jsdom's window is 768 tall)
  const low = arrive({ rects: { ...rects, '.flag': { left: 900, top: 900, width: 22, height: 26 } } });
  low.fire(2900);
  assert.equal(low.el().querySelector('.iw').style.transform, '', 'it glided off the screen');
});

test('without script nothing covers the page; with it the splash is up before anything paints', () => {
  const css = stripComments(SRC);
  assert.match(css, /#shape-intro\{display:none;/, 'the overlay renders by default: with JS off it would cover the page for good');
  assert.match(css, /#shape-intro\.run\{display:grid\}/, 'nothing shows the overlay when the script runs it');
  // first thing in <body>, so nothing under it is parsed before the script shows it
  const body = SRC.slice(SRC.indexOf('<body>') + '<body>'.length).replace(/<!--[\s\S]*?-->/g, '');
  assert.match(body, /^\s*<div id="shape-intro"/, 'the splash is no longer the first thing in <body>');
});

test('the chat launcher stays hidden through the whole intro, the fade included', () => {
  assert.match(stripComments(SRC), /body\.intro-active #shape-global-chat-button\{display:none!important\}/);
});

// ── The fold's half: hold while the splash runs, start when it ends ─────────────────

/** Lift a named function declaration whole (the same matcher as homepage-climb-route:
 *  it skips the parameter list before counting braces). */
function grab(name) {
  const m = new RegExp(`function\\s+${name}\\s*\\(`).exec(SRC);
  assert.ok(m, `grab: no function ${name} in the page`);
  let i = SRC.indexOf('(', m.index), depth = 0;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '(') depth++;
    else if (SRC[i] === ')' && --depth === 0) { i++; break; }
  }
  const open = SRC.indexOf('{', i);
  let d = 0;
  for (let j = open; j < SRC.length; j++) {
    if (SRC[j] === '{') d++;
    else if (SRC[j] === '}' && --d === 0) {
      const body = SRC.slice(m.index, j + 1);
      assert.ok(/;|return\b/.test(body.slice(body.indexOf('{'))), `grab: ${name} came back with no statements`);
      return body;
    }
  }
  throw new Error(`grab: unbalanced ${name}`);
}

/** The climb's boot / hold / start / reveal, shipped, over stubs for the canvas work. */
function fold({ still = false, intro } = {}) {
  const dom = new JSDOM('<!doctype html><html><head><style>:root{--w:90}</style></head><body>'
    + '<header class="hero"><h1><span class="w">Different</span> <span class="w">goals.</span></h1></header></body></html>');
  const win = dom.window;
  if (intro) win.__shapeIntro = intro;
  const timers = [], frames = [];
  const env = {
    win, still,
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    raf: (fn) => { frames.push(fn); return frames.length; },
  };
  const fns = ['headWidth', 'reveal', 'hold', 'start', 'boot'].map(grab).join('\n');
  const api = new Function('env', `
    var window = env.win, document = env.win.document, getComputedStyle = env.win.getComputedStyle.bind(env.win);
    var setTimeout = env.setTimeout, requestAnimationFrame = env.raf, cancelAnimationFrame = function () {};
    var setInterval = function () { return 7; }, clearInterval = function () {};
    var still = env.still, tw = null, iv = null, prog = .5, rv = 0, calls = [];
    function size() { calls.push('size'); }
    function buildProfile() { calls.push('buildProfile'); }
    function watchHero() { calls.push('watchHero'); }
    function climb() { calls.push('climb'); }
    function draw() { calls.push('draw'); }
    ${fns}
    return { boot: boot, hold: hold, start: start, headWidth: headWidth, calls: calls,
             prog: function () { return prog; }, iv: function () { return iv; } };`)(env);
  const hw = () => [...win.document.querySelectorAll('.hero h1 .w')].map((w) => w.style.getPropertyValue('--hw'));
  let now = 0;
  const runTimers = () => timers.splice(0).forEach((f) => f());
  const runFrames = (n = 20) => { for (let k = 0; k < n && frames.length; k++) frames.splice(0).forEach((f) => f(now += 450)); };
  return { api, hw, runTimers, runFrames };
}

test('while the splash runs the fold holds, and the end of the splash starts it', () => {
  const f = fold({ intro: 'running' });
  f.api.boot();
  assert.deepEqual(f.hw(), ['62', '62'], 'the words widened under the splash');
  assert.equal(f.api.calls.includes('climb'), false, 'the route climbed under the splash');
  assert.equal(f.api.iv(), null, 'the climb loop was armed under the splash');
  assert.equal(f.api.prog(), 0, 'the route was not held at the trailhead');

  f.api.start(); // what shape:intro-end calls
  assert.ok(f.api.calls.includes('climb'), 'the end of the splash did not start the climb');
  assert.notEqual(f.api.iv(), null, 'the climb does not repeat after the splash');
  f.runTimers();
  f.runFrames();
  const to = f.api.headWidth().toFixed(1);
  assert.deepEqual(f.hw(), [to, to], 'the words did not widen to the page width after the splash');
});

test('with no splash the load-in runs at boot, as it always did', () => {
  const f = fold();
  f.api.boot();
  assert.ok(f.api.calls.includes('climb'));
  assert.notEqual(f.api.iv(), null);
});

test('reduced motion draws the fold finished, and the splash events leave it alone', () => {
  const f = fold({ still: true, intro: 'running' });
  f.api.boot();
  assert.equal(f.api.prog(), 1);
  f.api.hold();
  f.api.start();
  assert.equal(f.api.calls.includes('climb'), false, 'a reduced-motion fold climbed');
  assert.equal(f.api.prog(), 1, 'hold() reset a finished fold');
});

test('a splash that starts again holds the words, before or during their widening', () => {
  // the stagger has not begun: the superseded reveal's timers must do nothing
  const early = fold();
  early.api.start();
  early.api.hold();
  early.runTimers();
  early.runFrames();
  assert.deepEqual(early.hw(), ['62', '62'], 'the superseded reveal widened the words under the splash');

  // mid-widening: the frames already in flight must stop
  const mid = fold();
  mid.api.start();
  mid.runTimers();
  mid.api.hold();
  mid.runFrames();
  assert.deepEqual(mid.hw(), ['62', '62'], 'a widening already in flight finished under the splash');
});

test('the page wires the splash events to the fold', () => {
  const code = stripComments(SRC);
  assert.match(code, /window\.addEventListener\('shape:intro-start',hold\);/);
  assert.match(code, /window\.addEventListener\('shape:intro-end',start\);/);
  assert.match(code, /if\(window\.__shapeIntro==='running'\) hold\(\); else start\(\);/);
});
