// Train's day as instruments (BSTrainDay.jsx; owner, 2026-11-04, of three designs: "C for train but
// incorporate this button if you can", then "and then C for next part"), MOUNTED in jsdom with the
// shipping module and real React: the session's title and its round ignition Start, Start, Swap and a
// move calling the page's own handlers, a picked day moving the session, a rest day, On deck and the
// links, every target at least 44px, and no motion under prefers-reduced-motion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { JSDOM } = require_('jsdom');
const { IntlMessageFormat } = require_('intl-messageformat');
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://shape.test/m/' });
const W = dom.window;
globalThis.window = W;
globalThis.document = W.document;
globalThis.CustomEvent = W.CustomEvent;
Object.defineProperty(globalThis, 'navigator', { value: W.navigator, configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require_('react');
const ReactDOMClient = require_('react-dom/client');

const cats = Object.fromEntries(['session', 'home', 'common'].map((ns) => [ns, JSON.parse(readFileSync(join(ROOT, `mobile-app/src/i18n/catalogs/en/${ns}.json`), 'utf8'))]));
W.ShapeI18n = {
  t: (key, opts = {}) => { const [ns, k] = key.split(':'); const msg = cats[ns] ? cats[ns][k] : undefined; return msg == null ? undefined : new IntlMessageFormat(msg, 'en').format(opts); },
  intlLocale: () => 'en-US',
};
const PAPERS = {
  dark: { MONO: 'mono', DISPLAY: 'display', BODY: 'body', HEAD: 'head', PAPER: '#141210', INK: '#f2ede4', INK70: 'rgba(242,237,228,0.7)', INK50: 'rgba(242,237,228,0.5)', HAIR: 'rgba(242,237,228,0.1)', RULE: 'rgba(242,237,228,0.2)', ACCENT: '#34d6c5', padX: 22, sectGap: 22, isLight: false },
  light: { MONO: 'mono', DISPLAY: 'display', BODY: 'body', HEAD: 'head', PAPER: '#f4efe4', INK: '#14120f', INK70: 'rgba(20,18,15,0.7)', INK50: 'rgba(20,18,15,0.5)', HAIR: 'rgba(20,18,15,0.08)', RULE: 'rgba(20,18,15,0.18)', ACCENT: '#0a8f87', padX: 22, sectGap: 22, isLight: true },
};
let paper = PAPERS.dark;
W.useBS = () => paper;
// Signed out: the burn line draws the preview's sample week and reads nothing.
W.ShapeAuth = { getCachedState: () => ({ user: null }) };
W.ShapeBurn = { week: async () => { throw new Error('signed-out preview must not read'); } };

const D = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSTrainDay.jsx'), {
  registry: new Map([['react', React], ['react-dom', { createPortal: (n) => n }]]),
});

// A week as the page builds it (the day model of bsBuildTrainProgram / the demo week): strength, a
// zone run, a rest day the coach set (it keeps the day's playlist, as bsApplyTrainAdjust leaves it).
const moves = [
  { n: '01', m: 'Pull-up', s: '4 × 6-8 · 3 min rest', l: '42 lb', cue: 'Dead hang.' },
  { n: '02', m: 'Barbell row', s: '4 × 8 · 2 min rest', l: '155 lb', cue: 'Hinge 45°.' },
];
const day = (title, extra = {}) => ({ d: 'x', tag: 'FEATURE', title, headline: title, meta: '52 min · RPE 8', time: '08:00', timeLabel: '8:00 AM', copy: 'Brief.', moves, ...extra });
const PROGRAM = [
  day('Lower Pull — Vol.'), day('Upper Push — Peak'), day('Upper Pull — Peak', { playlist: { name: 'Pull heavy', meta: '14 tracks' } }),
  day('Z2 run · 45 min', { tag: 'COND', meta: '45 min · Zone 2', moves: [{ n: '01', m: 'Zone 2 main', s: '30 min · steady', l: '—' }] }),
  day('Lower Push — Peak'), day('Long run · 75 min', { tag: 'COND', meta: '75 min · easy' }),
  { d: 'x', tag: 'REST', title: 'Rest day.', headline: 'Full rest.', meta: 'No session · 0 min', copy: 'No training today.', moves: [], coachAdjust: true, playlist: { name: 'Pull heavy', meta: '14 tracks' } },
];

// The page's part, as BSClientTrain plays it: it holds the picked day and hands BSTrainDay the day and
// every door.
function Page({ calls, initial = 2 }) {
  const [d, setD] = React.useState(initial);
  const cur = PROGRAM[d];
  return React.createElement(D.BSTrainDay, {
    kicker: 'Build · Week 31', title: 'Your training', program: PROGRAM, day: d, cur, moves: cur.moves, swapped: cur.moves.map((_, i) => i === 1),
    isRest: cur.tag === 'REST', when: 'Today · 8:00 AM', head: cur.headline, until: null, weekN: 31, coach: 'Jordan Chen',
    onDay: (i) => { calls.day.push(i); setD(i); }, onMonth: () => { calls.month += 1; }, onBurn: () => { calls.burn += 1; },
    onStart: () => { calls.start += 1; }, onSwap: () => { calls.swap += 1; }, onMove: (i) => calls.move.push(i), onRadio: () => { calls.radio += 1; },
    onEditYours: null, adjust: null,
    links: [
      { color: '#34d6c5', glyph: '♪', label: 'Music from Jordan', tag: 'For today', onOpen: () => { calls.link.push('music'); } },
      { color: 'rgba(0,0,0,0.7)', glyph: '▤', label: 'Full plan', tag: 'Build · Week 31', onOpen: () => { calls.link.push('plan'); } },
    ],
  });
}
const freshCalls = () => ({ day: [], month: 0, burn: 0, start: 0, swap: 0, move: [], radio: 0, link: [] });
const flush = () => React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount(props) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => { root.render(React.createElement(Page, props)); });
  await flush();
  const q = (sel) => host.querySelector(sel);
  const click = (el) => React.act(async () => { el.click(); });
  const btn = (re) => [...host.querySelectorAll('button')].find((b) => re.test(b.textContent));
  return { host, q, click, btn, close: () => React.act(async () => { root.unmount(); host.remove(); }) };
}

test('the session panel: its title, the round ignition Start, and the page\'s own Start, Swap, move and Radio', async () => {
  const calls = freshCalls();
  const m = await mount({ calls });
  try {
    const hero = m.q('[data-train-day-hero]');
    assert.equal(hero.getAttribute('data-tour'), 'hero-train', 'the tour anchors on the session');
    assert.equal(m.q('[data-train-day-title]').textContent, 'Upper Pull — Peak.');
    assert.match(hero.textContent, /Today · 8:00 AM · Your move/);
    assert.match(hero.textContent, /Jordan Chen · Coach · Trainer/);
    // The ignition: a round button, named for a reader, with ▶ and its words in it.
    const start = m.q('[data-train-day-start]');
    assert.equal(start.tagName, 'BUTTON');
    assert.equal(start.getAttribute('aria-label'), 'Start session');
    assert.match(start.textContent, /Start session/);
    assert.equal(start.style.width, '92px');
    assert.equal(start.style.borderRadius, '999px');
    assert.ok(start.querySelector('svg'), 'the ▶');
    await m.click(start);
    assert.equal(calls.start, 1, 'Start calls the page\'s start');
    // Swap sits beside it, in the same console.
    const swap = m.q('[data-train-day-swap]');
    assert.ok(swap.parentElement.parentElement === start.parentElement, 'Swap beside the ignition');
    await m.click(swap);
    assert.equal(calls.swap, 1);
    // The program: a node a move, the swapped one marked; a move opens its swap.
    const rows = [...m.host.querySelectorAll('[data-train-day-move]')];
    assert.equal(rows.length, 2);
    assert.match(rows[0].textContent, /Pull-up.*4 × 6-8 · 3m.*42lb/);
    assert.match(rows[1].textContent, /SWAPPED/);
    await m.click(rows[1]);
    assert.deepEqual(calls.move, [1]);
    // The day's playlist, chipped, opens Shape Radio.
    const chip = m.q('[data-train-day-playlist]');
    assert.equal(chip.textContent, '♪ Pull heavy · 14 tracks');
    await m.click(chip);
    assert.equal(calls.radio, 1);
    // Month view, and the burn line's door.
    await m.click(m.btn(/^Month view →$/));
    assert.equal(calls.month, 1);
    await m.click(m.q('[data-train-burn-open]'));
    assert.equal(calls.burn, 1);
  } finally { await m.close(); }
});

test('picking a day moves the session, and the picked day is marked', async () => {
  const calls = freshCalls();
  const m = await mount({ calls });
  try {
    await m.click(m.q('[data-train-day-pick="4"]'));
    assert.deepEqual(calls.day, [4]);
    assert.equal(m.q('[data-train-day-title]').textContent, 'Lower Push — Peak.');
    assert.equal(m.q('[data-train-day-pick="4"]').getAttribute('aria-pressed'), 'true');
    assert.equal(m.q('[data-train-day-pick="2"]').getAttribute('aria-pressed'), 'false');
    // A conditioning day reads its minutes on the gauge when it names no RPE.
    await m.click(m.q('[data-train-day-pick="3"]'));
    assert.equal(m.q('[data-train-day-title]').textContent, 'Z2 run · 45 min.');
    assert.match(m.q('[data-train-day-hero]').textContent, /45Time/);
  } finally { await m.close(); }
});

test('a rest day: a resting disc for Start, no Swap, no program, and no soundtrack though the day keeps one', async () => {
  const calls = freshCalls();
  const m = await mount({ calls, initial: 6 });
  try {
    assert.equal(m.q('[data-train-day-title]').textContent, 'Full rest.');
    assert.ok(!m.q('[data-train-day-start]'), 'no Start on a rest day');
    assert.equal(m.q('[data-train-day-rest]').textContent, 'Rest');
    assert.ok(!m.q('[data-train-day-swap]'), 'no Swap on a rest day');
    assert.ok(!m.q('[data-train-day-program]'), 'no moves, no program');
    assert.ok(!m.q('[data-train-day-playlist]'), 'a rest day is no session, so it has no soundtrack');
    assert.match(m.q('[data-train-day-hero]').textContent, /No training today\./);
  } finally { await m.close(); }
});

test('On deck: the next three days as a lit timeline that opens a day, Plan, and the links', async () => {
  const calls = freshCalls();
  const m = await mount({ calls });
  try {
    const deck = m.q('[data-train-day-ondeck]');
    assert.match(deck.textContent, /This week/);
    assert.match(deck.textContent, /On deck/);
    const rows = [...deck.querySelectorAll('[data-train-day-next]')];
    const today = (new Date().getDay() + 6) % 7;
    const want = [1, 2, 3].map((o) => (today + o) % 7);
    assert.deepEqual(rows.map((r) => Number(r.getAttribute('data-train-day-next'))), want, 'the three days after today');
    want.forEach((idx, i) => {
      const p = PROGRAM[idx];
      if (p.tag === 'REST') assert.match(rows[i].textContent, /Active rest.*walk \+ mobility/);
      else assert.match(rows[i].textContent, new RegExp(`${p.headline.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*${p.meta.split(' · ')[0]}`));
    });
    await m.click(rows[0]);
    assert.deepEqual(calls.day, [want[0]], 'a day on deck opens on the page');
    await m.click([...deck.querySelectorAll('button')].find((b) => /^Plan →$/.test(b.textContent)));
    assert.equal(calls.month, 1, 'Plan opens the calendar');
    const links = [...m.host.querySelectorAll('[data-train-day-link]')];
    assert.deepEqual(links.map((l) => l.getAttribute('aria-label')), ['Music from Jordan, For today', 'Full plan, Build · Week 31']);
    await m.click(links[1]);
    assert.deepEqual(calls.link, ['plan']);
  } finally { await m.close(); }
});

// The harness has no layout, so this pins the sizes each target declares; the seven day columns share
// the pane's width (measured at 390px in the browser run) and are held to their height here.
test('every target is at least 44px, on a dark and a light paper', async () => {
  for (const name of ['dark', 'light']) {
    paper = PAPERS[name];
    for (const initial of [2, 6]) {
      const m = await mount({ calls: freshCalls(), initial });
      try {
        const px = (v) => (/^\d+(\.\d+)?px$/.test(v) ? parseFloat(v) : null);
        const buttons = [...m.host.querySelectorAll('button')];
        assert.ok(buttons.length >= 14, `only ${buttons.length} targets drawn`);
        for (const b of buttons) {
          const label = `${name}/${initial}: ${(b.getAttribute('aria-label') || b.textContent).slice(0, 40)}`;
          const h = Math.max(px(b.style.minHeight) || 0, px(b.style.height) || 0);
          assert.ok(h >= 44, `${label} is ${h}px tall`);
          if (b.hasAttribute('data-train-day-pick')) continue;
          const w = Math.max(px(b.style.minWidth) || 0, px(b.style.width) || 0);
          assert.ok(w >= 44 || b.style.width === '100%', `${label} is ${w}px wide`);
        }
      } finally { await m.close(); }
    }
  }
  paper = PAPERS.dark;
});

test('the motion stops under prefers-reduced-motion', async () => {
  const m = await mount({ calls: freshCalls() });
  try {
    const css = document.getElementById('bs-train-day-css');
    assert.ok(css, 'the motion is CSS the module adds once');
    assert.match(css.textContent, /@media \(prefers-reduced-motion: reduce\) \{ \[data-train-day\], \[data-train-day\] \* \{ animation: none !important; transition: none !important; \} \}/);
    // The ignition's ring turns and pulses; both are animations the rule stops.
    const rings = [...m.q('[data-train-day-start]').querySelectorAll('span')].map((s) => s.style.animation).filter(Boolean);
    assert.ok(rings.some((a) => /bstd-spin/.test(a)) && rings.some((a) => /bstd-ring/.test(a)));
    assert.ok(m.q('[data-train-day-start]').closest('[data-train-day]'), 'inside the rule\'s reach');
  } finally { await m.close(); }
});
