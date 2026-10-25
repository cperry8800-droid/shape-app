// Train's Burned this week (owner, 2026-10-24; made a compact card with a line, "smaller, different
// chart type"), MOUNTED in jsdom with the shipping module: the week's total and daily average from
// the member's rows, "—" and a way to connect when nothing is
// tracked, a failed read that can be tried again, and the preview's sample week marked as one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { bsHwIso, bsHwWeekDays, bsHwShift } from '../mobile-app/src/services/homeWeek.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { JSDOM } = require_('jsdom');
const { IntlMessageFormat } = require_('intl-messageformat');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
const W = dom.window;
globalThis.window = W;
globalThis.document = W.document;
globalThis.CustomEvent = W.CustomEvent;
Object.defineProperty(globalThis, 'navigator', { value: W.navigator, configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require_('react');
const ReactDOMClient = require_('react-dom/client');

const cat = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/session.json'), 'utf8'));
W.ShapeI18n = {
  t: (key, opts = {}) => { const [ns, k] = key.split(':'); const msg = ns === 'session' ? cat[k] : undefined; return msg == null ? undefined : new IntlMessageFormat(msg, 'en').format(opts); },
  intlLocale: () => 'en-US',
};
W.useBS = () => ({ MONO: 'mono', DISPLAY: 'display', BODY: 'body', PAPER: '#fff', PAPER2: '#eee', INK: '#111', INK70: '#555', INK50: '#777', HAIR: '#ddd', RULE: '#ccc', ACCENT: '#0a8f87', padX: 18, sectGap: 22, isLight: true });

const M = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSTrainBurn.jsx'), {
  registry: new Map([['react', React], ['react-dom', { createPortal: (n) => n }]]),
});

const flush = () => React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount(Comp = M.BSTrainBurn, props = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => { root.render(React.createElement(Comp, props)); });
  await flush();
  const btn = (re) => [...host.querySelectorAll('button')].find((b) => re.test(b.textContent));
  return { host, text: () => host.textContent, btn, close: () => React.act(async () => { root.unmount(); host.remove(); }) };
}
const signIn = () => { W.ShapeAuth = { getCachedState: () => ({ user: { id: 'u1' } }) }; };
const monday = bsHwWeekDays(bsHwIso(new Date()))[0];

test('signed in: the week’s total, its daily average, and where it came from', async () => {
  signIn();
  const asked = [];
  W.ShapeBurn = { week: async (wk) => { asked.push(wk); return { ok: true, snaps: [{ snapshot_date: monday, calories: 1200, sources: { calories: 'apple_health' } }], acts: [] }; } };
  const m = await mount();
  assert.deepEqual(asked, [monday], 'reads the strip’s own week, Monday first');
  assert.match(m.text(), /Burned this week/);
  assert.match(m.text(), /1,200kcal/);
  assert.match(m.text(), /1,200\/day · Apple Health/);
  // The line's points: one per day with a reading (the seven baseline ticks are r 1.2).
  const points = [...m.host.querySelectorAll('svg circle')].filter((c) => c.getAttribute('r') !== '1.2');
  assert.equal(points.length, 1, 'a point a day with a reading');
  assert.equal(m.host.querySelectorAll('svg circle').length, 8, 'and a tick for each of the seven days');
  await m.close();
});

test('nothing tracked reads "—" and offers to connect, never 0', async () => {
  signIn();
  W.ShapeBurn = { week: async () => ({ ok: true, snaps: [], acts: [] }) };
  let opened = 0;
  W.addEventListener('shape:openIntegrations', () => { opened += 1; });
  const m = await mount();
  assert.match(m.text(), /—kcal/);
  assert.doesNotMatch(m.text(), /\b0 ?kcal/);
  assert.match(m.text(), /Nothing tracked yet this week\./);
  assert.equal(m.host.querySelectorAll('svg path').length, 0, 'no line through days with nothing tracked');
  await React.act(async () => { m.btn(/Connect/).click(); });
  assert.equal(opened, 1, 'Connect opens the integrations');
  await m.close();
});

test('a failed read says so and can be tried again', async () => {
  signIn();
  let calls = 0;
  W.ShapeBurn = { week: async () => { calls += 1; return calls === 1 ? { ok: false } : { ok: true, snaps: [], acts: [{ started_at: new Date().toISOString(), calories: 450, source: 'strava' }] }; } };
  const m = await mount();
  assert.match(m.text(), /Couldn’t read your activity/);
  await React.act(async () => { m.btn(/Retry/).click(); });
  await flush();
  assert.equal(calls, 2);
  assert.match(m.text(), /450kcal/);
  assert.match(m.text(), /· Strava/);
  await m.close();
});

test('signed out shows the preview’s sample week, marked as one', async () => {
  W.ShapeAuth = { getCachedState: () => ({ user: null }) };
  W.ShapeBurn = { week: async () => { throw new Error('signed-out preview must not read'); } };
  const m = await mount();
  assert.match(m.text(), /\/day · Sample week/);
  assert.doesNotMatch(m.text(), /Apple Health/, 'the sample names no source it did not come from');
  assert.doesNotMatch(m.text(), /—kcal/);
  assert.ok(m.host.querySelectorAll('svg path').length >= 2, 'the sample week draws its line');
  await m.close();
});

// Codex P2 on #2437: Train left open across Sunday night moves to the new week on its own.
test('the card moves to the new week past Sunday midnight with nothing else redrawing it', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: new Date(2026, 9, 25, 23, 59, 30).getTime() });
  signIn();
  const asked = [];
  W.ShapeBurn = { week: async (wk) => { asked.push(wk); return { ok: true, snaps: [], acts: [] }; } };
  const m = await mount();
  assert.deepEqual(asked, ['2026-10-19'], 'Sunday the 25th is in the week of the 19th');
  await React.act(async () => { t.mock.timers.tick(60000); });
  await flush();
  assert.deepEqual(asked, ['2026-10-19', '2026-10-26'], 'a minute later it reads the new week');
  await m.close();
});

// Codex P2 on #2437: Connect opens Integrations over Train, so the card is still mounted when a
// sync lands; the backend's shape:activitiesChanged reads the week again.
test('a sync or a logged workout reads the week again, keeping the last read meanwhile', async () => {
  signIn();
  let calls = 0;
  let release;
  W.ShapeBurn = { week: async () => { calls += 1; if (calls === 1) return { ok: true, snaps: [], acts: [] }; await new Promise((r) => { release = r; }); return { ok: true, snaps: [], acts: [{ started_at: new Date().toISOString(), calories: 450, source: 'whoop' }] }; } };
  const m = await mount();
  assert.match(m.text(), /Nothing tracked yet this week\./);
  await React.act(async () => { W.dispatchEvent(new W.CustomEvent('shape:activitiesChanged')); });
  assert.equal(calls, 2);
  assert.match(m.text(), /Nothing tracked yet this week\./, 'no flash to loading while it reads');
  await React.act(async () => { release(); });
  await flush();
  assert.match(m.text(), /450kcal/);
  assert.match(m.text(), /· WHOOP/);
  await m.close();
});

// Owner, 2026-10-24: "i should be able to click on this, also this box doesnt match look of page". The row
// sits on Train's paper between two rules (no tinted, rounded card), and the whole of it opens the week;
// Retry and Connect stay their own buttons, outside it.
test('the row is in Train\'s look and the whole of it opens the week', async () => {
  signIn();
  W.ShapeBurn = { week: async () => ({ ok: true, snaps: [], acts: [] }) };
  let opened = 0;
  const m = await mount(M.BSTrainBurn, { onOpen: () => { opened += 1; } });
  try {
    const row = m.host.querySelector('[data-train-burn]');
    assert.equal(row.style.borderRadius, '', 'the row is a rounded card again');
    assert.equal(row.style.background, '', 'the row is a tinted card again');
    assert.equal(row.style.borderTop, '1px solid rgb(204, 204, 204)');
    assert.equal(row.style.borderBottom, '1px solid rgb(204, 204, 204)');
    const open = row.querySelector('[data-train-burn-open]');
    assert.ok(open && open.tagName === 'BUTTON');
    assert.match(open.textContent, /Burned this week/);
    assert.ok(open.querySelector('svg'), 'the line is part of the door');
    assert.equal(open.style.minHeight, '44px');
    assert.ok(!open.contains(m.btn(/Connect/)), 'Connect sits inside the door');
    await React.act(async () => { open.click(); });
    assert.equal(opened, 1);
  } finally { await m.close(); }
  // Mounted with nothing to open, the row is no door.
  const n = await mount();
  assert.equal(n.host.querySelector('[data-train-burn-open]').disabled, true);
  await n.close();
});

test('the week page: the total, the daily average over the days it counts, and each day with where it came from', async () => {
  signIn();
  W.BSPage = ({ children }) => React.createElement('div', { 'data-page': '' }, children);
  W.BSDetailHeader = ({ eyebrow, title, onBack }) => React.createElement('header', null, React.createElement('button', { onClick: onBack }, '← Back'), eyebrow, '|', title);
  W.BSFooter = () => null;
  const today = bsHwIso(new Date());
  const days = Array.from({ length: 7 }, (_, i) => bsHwShift(bsHwWeekDays(today)[0], i));
  const idx = days.indexOf(today);
  const snaps = [{ snapshot_date: days[0], calories: idx === 0 ? 900 : 700, sources: { calories: 'garmin' } }];
  const acts = idx > 0 ? [{ started_at: new Date(Number(days[idx].slice(0, 4)), Number(days[idx].slice(5, 7)) - 1, Number(days[idx].slice(8, 10)), 0, 5).toISOString(), calories: 300, source: 'strava' }] : [];
  W.ShapeBurn = { week: async () => ({ ok: true, snaps, acts }) };
  let back = 0;
  const m = await mount(M.BSTrainBurnPage, { onBack: () => { back += 1; } });
  try {
    const text = m.text();
    assert.match(text, /\|Burned this week/);
    const rows = [...m.host.querySelectorAll('[data-train-burn-day]')];
    assert.equal(rows.length, 7, 'a row a day, Monday to Sunday');
    assert.deepEqual(rows.map((r) => r.getAttribute('data-train-burn-day')), days);
    const weekday = (iso) => new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))));
    rows.forEach((r, i) => assert.match(r.textContent, new RegExp(`^${weekday(days[i])}`)));
    assert.match(rows[0].textContent, /Garmin$/, 'Monday credits its watch');
    assert.match(rows[idx].textContent, /Today/);
    if (idx > 0) {
      assert.match(rows[idx].textContent, /300.*Strava$/);
      assert.match(text, /1,000kcal/);
      assert.match(text, /500\/day · 2 of 7 days tracked/);
      assert.match(text, /From Garmin · Strava/);
      if (idx > 1) assert.match(rows[1].textContent, /—Not tracked$/, 'a day with nothing tracked says so, never 0');
    }
    if (idx < 6) assert.match(rows[6].textContent, /—To come$/, 'a day ahead is to come');
    assert.match(text, /A day counts once/);
    await React.act(async () => { m.btn(/Back/).click(); });
    assert.equal(back, 1);
  } finally { await m.close(); }
});

test('the week page with nothing tracked offers to connect, and a failed read can be tried again', async () => {
  signIn();
  let calls = 0;
  W.ShapeBurn = { week: async () => { calls += 1; return calls === 1 ? { ok: false } : { ok: true, snaps: [], acts: [] }; } };
  let opened = 0;
  const onOpen = () => { opened += 1; };
  W.addEventListener('shape:openIntegrations', onOpen);
  const m = await mount(M.BSTrainBurnPage, { onBack() {} });
  try {
    assert.match(m.text(), /Couldn’t read your activity/);
    await React.act(async () => { m.btn(/Retry/).click(); });
    await flush();
    assert.equal(calls, 2);
    assert.match(m.text(), /Nothing tracked yet this week\./);
    assert.doesNotMatch(m.text(), /\b0 ?kcal/);
    const c = m.btn(/Connect/);
    assert.equal(c.style.minHeight, '44px');
    assert.equal(parseFloat(c.style.borderRadius), 0);
    await React.act(async () => { c.click(); });
    assert.equal(opened, 1);
  } finally { W.removeEventListener('shape:openIntegrations', onOpen); await m.close(); }
});
