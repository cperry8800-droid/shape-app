// Train's day (BSTrainDay.jsx) in the owner's C for Train (2026-11-04: "C for tainer page but make these glow
// when day selected like in option b"), restored the same day ("no revert training to what i had prior"),
// MOUNTED in jsdom with the shipping module and real React: the week as lit tiles, Burned this week as a lit
// slot, the session on a lit glass lead hanging from it by a dotted line, Start as a glowing capsule; Start,
// Swap, a move, the soundtrack, the burn, a picked day, On deck, Plan, the links and the find-a-coach bar
// calling the page's own handlers; a rest day; the glow on dark paper only; every target 44px tall.
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
  dark: { MONO: 'mono', DISPLAY: 'display', BODY: 'body', HEAD: 'head', PAPER: '#141210', INK: '#f2ede4', INK70: 'rgba(242,237,228,0.7)', INK50: 'rgba(242,237,228,0.5)', HAIR: 'rgba(242,237,228,0.1)', RULE: 'rgba(242,237,228,0.2)', ACCENT: '#34d6c5', padX: 22, sectGap: 22, isLight: false, RUST: '#c0533b', GREEN: '#4fae5a', W: { display: 300 } },
  light: { MONO: 'mono', DISPLAY: 'display', BODY: 'body', HEAD: 'head', PAPER: '#f4efe4', INK: '#14120f', INK70: 'rgba(20,18,15,0.7)', INK50: 'rgba(20,18,15,0.5)', HAIR: 'rgba(20,18,15,0.08)', RULE: 'rgba(20,18,15,0.18)', ACCENT: '#0a8f87', padX: 22, sectGap: 22, isLight: true, RUST: '#c0533b', GREEN: '#4fae5a', W: { display: 300 } },
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
    program: PROGRAM, day: d, cur, moves: cur.moves, swapped: cur.moves.map((_, i) => i === 1),
    isRest: cur.tag === 'REST', when: 'Today · 8:00 AM', head: cur.headline, until: null, weekN: 31, coach: 'Jordan Chen',
    onDay: (i) => { calls.day.push(i); setD(i); }, onMonth: () => { calls.month += 1; }, onBurn: () => { calls.burn += 1; },
    onStart: () => { calls.start += 1; }, onSwap: () => { calls.swap += 1; }, onMove: (i) => calls.move.push(i), onRadio: () => { calls.radio += 1; },
    onEditYours: null, adjust: null,
    links: [
      { color: '#34d6c5', glyph: '♪', label: 'Music from Jordan', tag: 'For today', onOpen: () => { calls.link.push('music'); } },
      { color: 'rgba(0,0,0,0.7)', glyph: '▤', label: 'Full plan', tag: 'Build · Week 31', onOpen: () => { calls.link.push('plan'); } },
    ],
    // The page's own BSFindCoachBar, handed in only for a member who pays no trainer.
    findCoach: React.createElement('button', { type: 'button', 'data-test-find': '', onClick: () => calls.link.push('find'), style: { minHeight: 44 } }, 'Find a coach'),
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

const follows = (a, b) => !!(a.compareDocumentPosition(b) & W.Node.DOCUMENT_POSITION_FOLLOWING);

test('the module never imports the client, and draws the page in order: week, burn, lead, program, On deck, links', async () => {
  const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSTrainDay.jsx'), 'utf8');
  assert.doesNotMatch(src, /from '\.\/iosAppBroadsheetClient/, 'a feature module never imports back into the client');
  const m = await mount({ calls: freshCalls() });
  try {
    const order = ['[data-week-strip="lit"]', '[data-train-burn]', '[data-focus-link]', '[data-focus-lead="lit"]', '[data-train-program]', '[data-train-ondeck]', '[data-train-links]'].map((sel) => [sel, m.q(sel)]);
    for (const [sel, el] of order) assert.ok(el, `no ${sel}`);
    for (let i = 1; i < order.length; i += 1) assert.ok(follows(order[i - 1][1], order[i][1]), `${order[i][0]} is not after ${order[i - 1][0]}`);
    assert.ok(m.q('[data-test-find]') && follows(m.q('[data-train-links]').lastElementChild.previousElementSibling, m.q('[data-test-find]')), 'finding a coach is not at the foot of the links');
  } finally { await m.close(); }
});

test('the session on a lit lead: its kicker, title and coach, the glowing Start, and the page\'s own Start, Swap, move, soundtrack and burn', async () => {
  const calls = freshCalls();
  const m = await mount({ calls });
  try {
    const lead = m.q('[data-focus-lead="lit"]');
    assert.equal(lead.getAttribute('data-tour'), 'hero-train', 'the tour anchors on the session');
    assert.match(lead.textContent, /Today · 8:00 AM · Your move/);
    assert.match(lead.textContent, /Week 31 · D3/);
    assert.match(lead.textContent, /Upper Pull — Peak/);
    assert.match(lead.textContent, /Jordan Chen · Coach · Trainer/);
    // The capsule: a 999px radius, Start session and its arrow.
    const start = m.q('[data-focus-primary="lit"]');
    assert.equal(start.textContent, 'Start session →');
    assert.equal(start.querySelector('[data-focus-pill]').style.borderRadius, '999px', 'the capsule is drawn inside the 44px button');
    await m.click(start);
    assert.equal(calls.start, 1, 'Start calls the page\'s start');
    await m.click([...lead.querySelectorAll('button')].find((b) => /^Swap →$/.test(b.textContent)));
    assert.equal(calls.swap, 1, 'Swap calls the page\'s swap');
    await m.click(m.q('[data-train-soundtrack]'));
    assert.equal(calls.radio, 1, 'the day\'s soundtrack opens Shape Radio');
    await m.click(m.q('[data-train-burn-open]'));
    assert.equal(calls.burn, 1, 'Burned this week opens its page');
    const rows = [...m.q('[data-train-program]').querySelectorAll('button')];
    assert.equal(rows.length, 2, 'a row a move');
    assert.match(rows[1].textContent, /Barbell row/);
    assert.match(rows[1].textContent, /swapped/i, 'a swapped move says so');
    assert.match(rows[0].textContent, /4 × 6-8 · 3m/, 'the rest abbreviated in the table only');
    await m.click(rows[1]);
    assert.deepEqual(calls.move, [1], 'a row opens its move\'s swap');
  } finally { await m.close(); }
});

test('the week is seven lit tiles, the picked day framed in the accent; picking one moves the session', async () => {
  const calls = freshCalls();
  const m = await mount({ calls });
  try {
    const strip = m.q('[data-week-strip="lit"]');
    const tiles = [...strip.querySelectorAll('button[aria-pressed]')];
    assert.equal(tiles.length, 7);
    assert.deepEqual(tiles.map((b) => b.getAttribute('aria-pressed')), ['false', 'false', 'true', 'false', 'false', 'false', 'false']);
    assert.match(tiles[2].getAttribute('aria-label'), /, selected$/);
    assert.match(tiles[2].style.border, /1px solid (#34d6c5|rgb\(52, 214, 197\))/, 'the picked tile is framed in the accent');
    assert.match(tiles[0].style.background, /rgba\(0, 0, 0, 0\.42\)/, 'an unpicked tile is a dark slot');
    await m.click(tiles[0]);
    assert.deepEqual(calls.day, [0]);
    assert.match(m.q('[data-focus-lead="lit"]').textContent, /Lower Pull — Vol\./, 'the session follows the picked day');
    assert.equal([...strip.querySelectorAll('button[aria-pressed]')][0].getAttribute('aria-pressed'), 'true');
    await m.click(m.btn(/^Month view →$/));
    assert.equal(calls.month, 1, 'Month view opens the calendar');
  } finally { await m.close(); }
});

test('a rest day: a Rest chip for Start, no Swap, no program, and no soundtrack though the day keeps one', async () => {
  const m = await mount({ calls: freshCalls(), initial: 6 });
  try {
    const lead = m.q('[data-focus-lead="lit"]');
    assert.match(lead.textContent, /· Rest/);
    assert.equal(m.q('[data-train-rest]').textContent, 'Rest');
    assert.ok(!m.q('[data-focus-primary]'), 'no Start on a rest day');
    assert.ok(![...lead.querySelectorAll('button')].some((b) => /Swap/.test(b.textContent)), 'no Swap on a rest day');
    assert.ok(!m.q('[data-train-program]'), 'no program on a rest day');
    assert.ok(!m.q('[data-train-soundtrack]'), 'no soundtrack on a rest day');
  } finally { await m.close(); }
});

test('On deck: the next three days, each opening on the page; Plan, the links and the find-a-coach bar call the page', async () => {
  const calls = freshCalls();
  const m = await mount({ calls });
  try {
    const todayIdx = (new Date().getDay() + 6) % 7;
    const rows = [...m.q('[data-train-ondeck]').querySelectorAll('button')];
    assert.equal(rows.length, 3);
    const first = PROGRAM[(todayIdx + 1) % 7];
    assert.match(rows[0].textContent, new RegExp(first.tag === 'REST' ? 'Active rest' : first.headline.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await m.click(rows[0]);
    assert.deepEqual(calls.day, [(todayIdx + 1) % 7]);
    await m.click(m.btn(/^Plan →$/));
    assert.equal(calls.month, 1, 'Plan opens the calendar');
    await m.click(m.btn(/Music from Jordan/));
    await m.click(m.btn(/Full plan/));
    await m.click(m.q('[data-test-find]'));
    assert.deepEqual(calls.link, ['music', 'plan', 'find']);
  } finally { await m.close(); }
});

test('the glow is dark paper\'s: the picked tile, the burn total, the lead\'s spine and Start glow there, and none on light', async () => {
  for (const name of ['dark', 'light']) {
    paper = PAPERS[name];
    const m = await mount({ calls: freshCalls() });
    try {
      const picked = m.q('[data-week-strip="lit"] button[aria-pressed="true"]');
      const start = m.q('[data-focus-primary="lit"] [data-focus-pill]');
      const spine = m.q('[data-focus-lead="lit"]').querySelector('span[aria-hidden]');
      const total = m.q('[data-train-burn-total]');
      if (name === 'dark') {
        assert.match(picked.style.boxShadow, /0 0 16px -2px/);
        assert.match(start.style.boxShadow, /0 0 22px -6px/);
        assert.match(spine.style.boxShadow, /0 0 14px/);
        assert.match(total.style.textShadow, /0 0 12px/);
      } else {
        assert.equal(picked.style.boxShadow, 'none');
        assert.equal(start.style.boxShadow, 'none');
        assert.equal(spine.style.boxShadow, 'none');
        assert.equal(total.style.textShadow, 'none');
      }
    } finally { await m.close(); }
  }
  paper = PAPERS.dark;
});

test('every target is at least 44px tall, on a dark and a light paper, a session day and a rest day', async () => {
  for (const name of ['dark', 'light']) {
    paper = PAPERS[name];
    for (const initial of [2, 6]) {
      const m = await mount({ calls: freshCalls(), initial });
      try {
        const px = (v) => (/^\d+(\.\d+)?px$/.test(v) ? parseFloat(v) : null);
        const buttons = [...m.host.querySelectorAll('button')];
        assert.ok(buttons.length >= 14, `only ${buttons.length} targets drawn`);
        for (const b of buttons) {
          const h = Math.max(px(b.style.minHeight) || 0, px(b.style.height) || 0);
          assert.ok(h >= 44, `${name}/${initial}: ${(b.getAttribute('aria-label') || b.textContent).slice(0, 40)} is ${h}px tall`);
        }
      } finally { await m.close(); }
    }
  }
  paper = PAPERS.dark;
});
