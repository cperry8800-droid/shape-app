// Today, the Week and the Schedule re-read when the coach comes back to the tab (2026-11-05).
//
// They read once per visit, so a booking, a check-in or a cancellation that arrived while the
// coach was in another tab stayed off the page until a reload. useDashboard({ refreshOnFocus })
// re-reads on focus or visibility, at most once a minute, quietly (no "loading" flash), and a
// re-read that fails keeps the live page rather than dropping it to the preview. The real
// dashData.jsx is compiled and its hook mounted in a DOM, with the clock held.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require_('react');
const { createRoot } = require_('react-dom/client');
const babel = require_('next/dist/compiled/babel/core');
const presetReact = require_('next/dist/compiled/babel/preset-react');
const source = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const compiled = babel.transformSync(source('public/newdesign/dashData.jsx'), { presets: [presetReact], babelrc: false, configFile: false, sourceType: 'script' }).code;
const DashSignals = require_(join(ROOT, 'public/newdesign/dashSignals.js'));
const web = new Function('React', 'DashSignals', 'window', 'document', `${compiled}\n;return { useDashboard, dashFocusGate };`)(React, DashSignals, dom.window, dom.window.document);

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let clock = Date.UTC(2026, 10, 5, 15, 0, 0);
const realNow = Date.now;
Date.now = () => clock;
test.after(() => { Date.now = realNow; });

// The server, as the page reads it: the roster, the dashboard and the overviews.
let up = true;
let version = 'v1';
const asked = [];
globalThis.fetch = async (url, init) => {
  asked.push(String(url));
  if (!up) throw new TypeError('Failed to fetch');
  const json = (body) => ({ ok: true, status: 200, json: async () => body });
  if (String(url).startsWith('/api/trainer/clients')) return json({ isTrainer: true, clients: [{ id: A, name: 'Ada' }], totals: { onPlan: 1 } });
  if (String(url).startsWith('/api/trainer/dashboard')) return json({ isTrainer: true, user: { firstName: 'Maya' }, kpis: { activeClients: 1 }, today: [{ scheduledAt: '2026-11-05T23:00:00Z', clientName: version }] });
  if (String(url) === '/api/clients/shared-overview' && init && init.method === 'POST') return json({ results: { [A]: { client: { id: A, name: 'Ada' }, stats: { sessionsPlanned: 4, sessionsCompleted: 3 } } }, failed: [] });
  return { ok: false, status: 404, json: async () => ({}) };
};

const seen = [];
function Probe() {
  seen.push(web.useDashboard('trainer', { refreshOnFocus: true }));
  return null;
}
const flush = async () => { for (let i = 0; i < 6; i++) await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const last = () => seen[seen.length - 1];
const back = async (event) => {
  await React.act(async () => {
    if (event === 'focus') dom.window.dispatchEvent(new dom.window.Event('focus'));
    else dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));
  });
  await flush();
};

test('the gate: one re-read a minute, never while hidden', () => {
  const pass = web.dashFocusGate(60_000, 0);
  assert.equal(pass(30_000, false), false, 'inside the first minute');
  assert.equal(pass(61_000, true), false, 'a hidden tab');
  assert.equal(pass(61_000, false), true);
  assert.equal(pass(61_500, false), false, 'the visibilitychange that comes with the focus');
  assert.equal(pass(122_000, false), true);
});

test('a live page re-reads on the coach\'s return, quietly, and a failed re-read keeps it live', async () => {
  const root = createRoot(dom.window.document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(Probe)));
  await flush();
  assert.equal(last().source, 'live');
  assert.equal(last().today.today[0].clientName, 'v1');
  assert.equal(last().clients[0].progressRead.state, 'ready');
  assert.ok(asked.some((u) => /^\/api\/trainer\/dashboard\?tz=/.test(u)), 'the dashboard is asked with the browser zone');

  // Back within the minute: nothing is asked.
  const before = asked.length;
  clock += 30_000;
  await back('focus');
  assert.equal(asked.length, before, 'no re-read inside a minute');

  // Back after the laptop slept with no network: the page stays as it was, live.
  clock += 31_000;
  up = false;
  const rendersBefore = seen.length;
  await back('focus');
  assert.ok(asked.length > before, 'it tried');
  assert.equal(last().source, 'live', 'never back to the preview');
  assert.equal(last().today.today[0].clientName, 'v1');
  assert.equal(last().clients.length, 1);
  assert.equal(last().clients[0].progressRead.state, 'ready');
  assert.ok(seen.slice(rendersBefore).every((d) => d.source === 'live'), 'no render showed the preview');

  // Back again, online, with a new booking on the server: it shows, with no "loading" in between.
  clock += 61_000;
  up = true;
  version = 'v2';
  const from = seen.length;
  await back('visibilitychange');
  assert.equal(last().today.today[0].clientName, 'v2');
  assert.ok(seen.slice(from).every((d) => d.clients.every((c) => c.progressRead.state !== 'loading')), 'the columns never flashed loading');
  await React.act(async () => root.unmount());
});

test('Today, the Week and the Schedule ask for it; the Schedule\'s months re-read too', () => {
  assert.match(source('public/newdesign/dashToday.jsx'), /useDashboard\(role, \{ refreshOnFocus: true \}\)/);
  assert.match(source('public/newdesign/dashWeek.jsx'), /useDashboard\(role, \{ refreshOnFocus: true \}\)/);
  const sched = source('public/newdesign/dashSchedule.jsx');
  assert.match(sched, /useDashboard\(role, \{ refreshOnFocus: true \}\)/);
  assert.match(sched, /useDashFocusRefresh\(\(\) => \{\s*if \(dragRef\.current \|\| busyRef\.current != null \|\| !calRef\.current\) return;/);
  assert.match(sched, /setCal\(\(prev\) => dscReplaceRange\(prev, res, run\)\)/);
});

test('the Schedule on screen re-reads its months on the coach\'s return: a cancellation goes, a new booking comes', async () => {
  const { mountSchedule, json } = await import('./helpers/schedule-page.mjs');
  const ev = (id, date, time, extra = {}) => ({ id: 'session:' + id, sessionId: id, source: 'session', kind: 'SESSION', title: 'Strength', sub: 'video', date, time, durationMin: 60, with: 'Priya S.', clientId: 'member-1', status: 'confirmed', reschedulable: true, editable: false, ...extra });
  let events = [ev('s-thu', '2026-10-08', '09:00'), ev('s-fri', '2026-10-09', '10:00')];
  let calendarDown = false;
  const asks = [];
  const handler = async (u) => {
    if (u.pathname === '/api/my-availability') return json(200, { slots: [], timezone: 'America/New_York' });
    if (u.pathname === '/api/coach/to-schedule') return json(200, { items: [] });
    if (u.pathname === '/api/calendar') {
      asks.push(u.search);
      if (calendarDown) return json(503, { error: 'down' });
      const from = u.searchParams.get('from'), to = u.searchParams.get('to');
      return json(200, { events: events.filter((e) => e.date >= from && e.date <= to), zone: 'America/New_York' });
    }
    return json(404, {});
  };
  const page = await mountSchedule({ fetch: handler, triage: [] });
  try {
    const shown = (id) => !!page.doc.querySelector('[data-dsc-block="session:' + id + '"]');
    assert.ok(shown('s-thu') && shown('s-fri'));
    const first = asks.length;
    // Friday's client cancels and a new request arrives while the coach is in another tab.
    events = [ev('s-thu', '2026-10-08', '09:00'), ev('s-new', '2026-10-08', '14:00', { status: 'requested' })];
    assert.equal(await page.returnToTab(), true, 'the live page re-reads on return');
    assert.ok(asks.length > first, 'the months on screen were asked again');
    assert.ok(/[?&]tz=/.test(asks[asks.length - 1]), 'with the zone, as the first read');
    assert.equal(shown('s-fri'), false, 'the cancelled booking is gone, not kept by a merge');
    assert.equal(shown('s-new'), true);
    // A re-read that fails keeps the bookings on screen.
    calendarDown = true;
    await page.returnToTab();
    assert.equal(shown('s-thu'), true);
    assert.equal(shown('s-new'), true);
  } finally { await page.unmount(); }
});

test('a re-read month replaces what it held: a cancelled booking goes, other months stay', () => {
  const text = source('public/newdesign/dashSchedule.jsx');
  const lift = (name) => { const at = text.indexOf('function ' + name + '('); const rest = text.slice(at); return rest.slice(0, rest.search(/\n(?:function |const |\/\/ )/)); };
  const { dscReplaceRange } = new Function(lift('dscMergeRange') + '\n' + lift('dscReplaceRange') + '\nreturn { dscReplaceRange };')();
  const prev = {
    zone: 'America/New_York', months: new Set(['2026-10', '2026-11']), plansOk: true,
    events: [{ id: 'oct', date: '2026-10-20' }, { id: 'kept', date: '2026-11-04' }, { id: 'cancelled', date: '2026-11-06' }, { id: 'undated' }],
    clientPlans: [{ id: 'p-oct', date: '2026-10-21' }, { id: 'p-gone', date: '2026-11-09' }],
  };
  const res = { zone: 'America/New_York', events: [{ id: 'kept', date: '2026-11-04', title: 'moved' }, { id: 'new', date: '2026-11-12' }], clientPlans: [{ id: 'p-new', date: '2026-11-10' }] };
  const next = dscReplaceRange(prev, res, ['2026-11']);
  assert.deepEqual(next.events.map((e) => e.id).sort(), ['kept', 'new', 'oct', 'undated']);
  assert.equal(next.events.find((e) => e.id === 'kept').title, 'moved');
  assert.deepEqual(next.clientPlans.map((x) => x.id).sort(), ['p-new', 'p-oct']);
  assert.deepEqual([...next.months].sort(), ['2026-10', '2026-11']);
  // Another zone: the answer stands alone, as a first read does.
  assert.deepEqual(dscReplaceRange(prev, { ...res, zone: 'UTC' }, ['2026-11']).events.map((e) => e.id).sort(), ['kept', 'new']);
});
