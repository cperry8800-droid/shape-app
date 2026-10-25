// The Calendar's Weeks view (owner, 2026-10-25, with a running app's plan calendar: "Just want
// to have this be an available viewing option"), and the route change it needed: an assigned
// workout the member has finished reads done, with the time it took.
//
// These compile the SHIPPED files: the weeks module and the calendar screen through the mount
// harness, and the /api/calendar handler against a Supabase stand-in that applies its filters.
process.env.TZ = 'America/New_York';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { drive, textOf, SHIM, ROOT } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';

const require_ = createRequire(import.meta.url);
const React = require_('react');
const RDS = require_('react-dom/server');
const BROADSHEET = join(ROOT, 'mobile-app/src/broadsheet');

// The real translator over the shipped catalogs, so the copy asserted is the copy shown.
const appRequire = createRequire(join(ROOT, 'mobile-app/package.json'));
const i18next = appRequire('i18next');
const ICU = appRequire('i18next-icu');
const catalog = (loc) => JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs', loc, 'calendar.json'), 'utf8'));
const translator = async (lng) => {
  const i18n = i18next.createInstance();
  await i18n.use(ICU.default || ICU).init({
    lng, fallbackLng: 'en', ns: ['calendar'], defaultNS: 'calendar', keySeparator: false,
    interpolation: { escapeValue: false }, resources: { en: { calendar: catalog('en') }, [lng]: { calendar: catalog(lng) } },
  });
  return { t: (key, opts) => i18n.t(key, opts) };
};
globalThis.ShapeI18n = await translator('en');

// ── the weeks a month touches, and a week's total ────────────────────────────

const WEEKS = await loadRealModule(join(BROADSHEET, 'BSCalendarWeeks.jsx'), { registry: new Map([['react', React]]) });
const isoOf = (d) => WEEKS.bsCalIso(d);

test('a month lists the Monday-to-Sunday weeks it touches, on local dates', () => {
  // October 2026 opens on a Thursday and closes on a Saturday.
  const oct = WEEKS.bsCalWeeksOf(2026, 9);
  assert.deepEqual(oct.map((w) => isoOf(w[0])), ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
  assert.equal(isoOf(oct[4][6]), '2026-11-01');
  // February 2027 is exactly four weeks, Monday 1 to Sunday 28: no week either side.
  const feb = WEEKS.bsCalWeeksOf(2027, 1);
  assert.deepEqual([feb.length, isoOf(feb[0][0]), isoOf(feb[3][6])], [4, '2027-02-01', '2027-02-28']);
  // Across the clock change (8 March and 1 November in New York) every week is still seven
  // days from a Monday: dates are stepped, never added as 24-hour spans.
  for (const [y, m] of [[2026, 2], [2026, 10]]) {
    for (const w of WEEKS.bsCalWeeksOf(y, m)) {
      assert.equal(w[0].getDay(), 1, `${y}-${m + 1}: a week that does not start on Monday`);
      for (let i = 1; i < 7; i++) assert.equal(w[i].getDate(), new Date(w[0].getFullYear(), w[0].getMonth(), w[0].getDate() + i).getDate());
    }
  }
});

test('a week totals what was done of what was planned, leaving out meals and rest', () => {
  const tot = WEEKS.bsCalWeekTotals([
    { kind: 'WORKOUT', state: 'done', dur: 45 },
    { kind: 'WORKOUT', dur: 30 },
    { kind: 'SESSION', state: 'done', dur: '60' },
    { kind: 'MEAL', state: 'done', dur: 20 },
    { kind: 'REST' },
    { kind: 'CHECKIN', dur: null },
  ]);
  assert.deepEqual(tot, { done: 2, total: 4, minutes: 135 });
  assert.deepEqual(WEEKS.bsCalWeekTotals([]), { done: 0, total: 0, minutes: 0 });
});

// ── what the weeks list draws ────────────────────────────────────────────────

const render = (props) => RDS.renderToStaticMarkup(React.createElement(WEEKS.BSCalendarWeeks, {
  viewYear: 2026, viewMonth: 9, todayIso: '2026-10-25', focusIso: '2026-10-25', head: null,
  accentOf: () => '#c0533b', timeLabel: (e) => (e.time && e.time !== '—' ? e.time : '—'),
  onOpen() {}, onOpenDay() {}, onAdd: null, events: [], ...props,
}));
const strip = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('the weeks list tags this week, ticks what is done and reads a finished workout\'s time', () => {
  const html = render({
    onAdd() {},
    events: [
      { id: 'a', date: '2026-10-19', kind: 'WORKOUT', title: 'Over and Unders', state: 'done', doneSec: 1599, dur: 30, time: '—' },
      { id: 'b', date: '2026-10-21', kind: 'WORKOUT', title: 'Hill Repeats', state: 'done', doneSec: null, dur: 35, time: '07:00' },
      { id: 'c', date: '2026-10-25', kind: 'WORKOUT', title: 'Upper Body Strength', dur: 45, time: '—' },
      { id: 'm1', date: '2026-10-25', kind: 'MEAL', title: 'Oats' },
      { id: 'm2', date: '2026-10-25', kind: 'MEAL', title: 'Salad' },
      { id: 'n', date: '2026-10-27', kind: 'WORKOUT', title: 'Easy Run', dur: 40, time: '—' },
    ],
  });
  const text = strip(html);
  assert.equal((html.match(/<section/g) || []).length, 5, 'October touches five weeks');
  assert.match(text, /This week/);
  assert.match(text, /Last week/);
  assert.match(text, /Next week/);
  assert.match(text, /Total · 2 of 3 done · 1h 50m/, 'the week of the 19th: two of three done, 110 planned minutes');
  assert.match(text, /Over and Unders 26m 39s/, 'a finished workout reads the time it took');
  assert.match(text, /Hill Repeats 07:00 · 35m/, 'done without a logged time: when and how long');
  assert.equal((html.match(/>✓</g) || []).length, 2, 'one tick per done card');
  // The day's two meals fold into one card.
  assert.match(text, /Meal plan 2 meals/);
  assert.doesNotMatch(text, /Oats|Salad/);
  // ＋ Add from today on, never on a day gone: Oct 25 to Nov 1 is eight days.
  assert.equal((text.match(/＋ Add/g) || []).length, 8);
  assert.match(text, /Nothing planned/, 'a week with nothing in it says so');
});

test('signed out, the weeks list offers no ＋ Add', () => {
  assert.doesNotMatch(strip(render({ onAdd: null })), /＋ Add/);
});

test('the weeks list speaks the reader\'s language, plurals included', async () => {
  const en = globalThis.ShapeI18n;
  globalThis.ShapeI18n = await translator('ru');
  try {
    const meals = (n) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, date: '2026-10-21', kind: 'MEAL', title: `m${i}` }));
    const text = strip(render({ events: [...meals(3), { id: 'w', date: '2026-10-20', kind: 'WORKOUT', title: 'Бег', dur: 75, time: '—' }] }));
    assert.match(text, /Эта неделя/);
    assert.match(text, /Итого · Выполнено 0 из 1 · 1 ч 15 мин/);
    assert.match(text, /План питания 3 приёма пищи/, 'the few form');
    assert.match(text, /Ничего не запланировано/);
  } finally {
    globalThis.ShapeI18n = en;
  }
});

// ── the screen: the switch, the remembered view, the range each view reads ──

function storage(initial) {
  const map = new Map(initial ? [['shape.calendarView', initial]] : []);
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}
const sheet = { opened: [], open(n) { this.opened.push(n); }, close() {} };
// Effects run as each render calls them, so the screen's read starts the way it does on mount.
const EFFECTS = { ...SHIM, useEffect: (fn) => { fn(); }, useContext: () => sheet };
const CAL = await loadRealModule(join(BROADSHEET, 'iosAppBroadsheetCalendar.jsx'), {
  registry: new Map([['react', EFFECTS], ['react-dom', { createPortal: (n) => n }]]),
  appendExports: 'export { BSCalendarScreen, BSCalDaySheet };',
});
const named = (name) => (n) => typeof n.type === 'function' && n.type.name === name;

async function screen({ stored, signedIn = true, answer = () => ({ events: [], zone: 'America/New_York' }) } = {}) {
  const calls = [];
  globalThis.localStorage = storage(stored);
  if (signedIn) globalThis.ShapeAuth = { getCachedState: () => ({ user: { id: 'member-1' } }) };
  else delete globalThis.ShapeAuth;
  // Signed out, the screen listens for a sign-in (window is globalThis in this harness).
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  globalThis.ShapeCalendar = { list: (q) => { calls.push(q); return Promise.resolve(answer(q, calls.length)); } };
  const d = drive(CAL.BSCalendarScreen, { role: 'client', onBack() {}, initialDate: new Date(2026, 9, 3) });
  return { d, calls, settle: async () => { await new Promise((r) => setTimeout(r, 0)); d.render(); } };
}

test.afterEach(() => {
  for (const k of ['localStorage', 'ShapeAuth', 'ShapeCalendar', 'addEventListener', 'removeEventListener']) delete globalThis[k];
  sheet.opened.length = 0;
});

test('the calendar opens on the view this device last picked, and Month without one', async () => {
  const weeks = await screen({ stored: 'weeks' });
  assert.ok(weeks.d.nodes().some(named('BSCalendarWeeks')), 'a stored Weeks did not open Weeks');
  assert.equal(weeks.d.nodes().some(named('BSCalendarMonth')), false);
  const none = await screen({});
  assert.ok(none.d.nodes().some(named('BSCalendarMonth')), 'no choice stored: Month');
  const junk = await screen({ stored: 'agenda' });
  assert.ok(junk.d.nodes().some(named('BSCalendarMonth')), 'an unknown choice: Month');
  // No storage at all (private mode, a blocked store) reads Month and the switch still works.
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const blocked = drive(CAL.BSCalendarScreen, { role: 'client', onBack() {} });
  assert.ok(blocked.nodes().some(named('BSCalendarMonth')));
  blocked.clickKey('weeks');
  assert.ok(blocked.nodes().some(named('BSCalendarWeeks')), 'the switch fails when storage does');
});

test('the switch remembers the view, and each view reads its own range', async () => {
  const { d, calls } = await screen({});
  assert.deepEqual([calls.at(-1).from, calls.at(-1).to], ['2026-10-01', '2026-10-31'], 'Month reads the month');
  d.clickKey('weeks');
  assert.equal(globalThis.localStorage.map.get('shape.calendarView'), 'weeks');
  assert.ok(d.nodes().some(named('BSCalendarWeeks')));
  assert.deepEqual([calls.at(-1).from, calls.at(-1).to], ['2026-09-28', '2026-11-01'], 'Weeks reads whole weeks');
  const tabs = d.nodes().filter((n) => n.type === 'button' && n.props.role === 'tab');
  assert.deepEqual(tabs.map((b) => [textOf(b).trim(), b.props['aria-selected']]), [['Month', false], ['Weeks', true]]);
  d.clickKey('month');
  assert.equal(globalThis.localStorage.map.get('shape.calendarView'), 'month');
  assert.ok(d.nodes().some(named('BSCalendarMonth')));
});

test('Month keeps to its own dates when a weeks read carried the days either side', async () => {
  const ev = (id, date) => ({ id, source: 'event', kind: 'WORKOUT', title: id, date, time: '07:00', status: 'planned' });
  const { d, settle } = await screen({ stored: 'weeks', answer: () => ({ events: [ev('sep', '2026-09-29'), ev('oct', '2026-10-29'), ev('nov', '2026-11-01')], zone: 'UTC' }) });
  await settle();
  assert.deepEqual(d.nodes().find(named('BSCalendarWeeks')).props.events.map((e) => e.id), ['sep', 'oct', 'nov']);
  d.clickKey('month');
  // The month's own read has not answered yet: the grid must not put Sep 29 on Oct 29.
  assert.deepEqual(d.nodes().find(named('BSCalendarMonth')).props.events.map((e) => e.id), ['oct']);
});

test('only the latest read lands', async () => {
  const pending = [];
  const { d } = await screen({});
  globalThis.ShapeCalendar = { list: () => new Promise((res) => pending.push(res)) };
  d.clickKey('weeks');           // read 1 (weeks)
  d.clickKey('month');           // read 2 (month)
  const ev = (id) => ({ id, source: 'event', kind: 'WORKOUT', title: id, date: '2026-10-10', time: '07:00', status: 'planned' });
  pending.at(-1)({ events: [ev('latest')], zone: 'UTC' });
  await new Promise((r) => setTimeout(r, 0));
  pending[0]({ events: [ev('stale')], zone: 'UTC' });
  await new Promise((r) => setTimeout(r, 0));
  d.render();
  assert.deepEqual(d.nodes().find(named('BSCalendarMonth')).props.events.map((e) => e.id), ['latest'], 'an older read overwrote a newer one');
});

test('signed out, Weeks shows the demo month on its own dates and offers no ＋ Add', async () => {
  const { d } = await screen({ stored: 'weeks', signedIn: false });
  const w = d.nodes().find(named('BSCalendarWeeks'));
  assert.deepEqual([w.props.viewYear, w.props.viewMonth, w.props.todayIso, w.props.onAdd], [2026, 4, '2026-05-14', null]);
  assert.ok(w.props.events.length > 0 && w.props.events.every((e) => /^2026-05-\d\d$/.test(e.date)), 'the demo events have no May dates');
});

test('signed in, a day\'s ＋ Add opens the add sheet on that day, and a meal plan card opens the day', async () => {
  const meal = (id) => ({ id, source: 'meal', kind: 'MEAL', title: id, date: '2026-10-14', time: '12:00', status: 'planned' });
  const { d, settle } = await screen({ stored: 'weeks', answer: () => ({ events: [meal('lunch'), meal('dinner'), { ...meal('other'), date: '2026-10-15' }], zone: 'UTC' }) });
  await settle();
  const w = () => d.nodes().find(named('BSCalendarWeeks'));
  assert.equal(typeof w().props.onAdd, 'function');
  w().props.onAdd(new Date(2026, 10, 1));
  d.render();
  const add = d.nodes().find(named('BSCalAddSheet'));
  assert.deepEqual([add.props.year, add.props.month, add.props.day], [2026, 10, 1], 'the add sheet opened on another day');
  w().props.onOpenDay(new Date(2026, 9, 14));
  const day = sheet.opened.at(-1);
  assert.equal(day.type, CAL.BSCalDaySheet);
  assert.deepEqual(day.props.events.map((e) => e.id), ['lunch', 'dinner'], 'the day sheet holds another day\'s items');
});

// ── the route: a finished assigned workout reads done ────────────────────────

const nextServer = require_('next/server');
const ROUTE = await (async () => {
  const lib = (f) => loadRealModule(join(ROOT, 'src/lib', f), { typescript: true, registry: new Map([['next/server', nextServer]]) });
  const [time, requestUtils] = await Promise.all([lib('time.ts'), lib('request-utils.ts')]);
  const guards = await import(pathToFileURL(join(ROOT, 'src/lib/access-guards.mjs')).href);
  const owned = await loadRealModule(join(ROOT, 'src/lib/owned-provider.ts'), { typescript: true, registry: new Map([['@/lib/time', time], ['@supabase/supabase-js', {}]]) });
  const booking = await loadRealModule(join(ROOT, 'src/lib/session-booking.ts'), { typescript: true, registry: new Map([['@supabase/supabase-js', {}], ['@/lib/owned-provider', owned]]) });
  const series = await loadRealModule(join(ROOT, 'src/lib/session-series.ts'), { typescript: true, registry: new Map([['@supabase/supabase-js', {}], ['@/lib/time', time]]) });
  let client = null;
  const route = await loadRealModule(join(ROOT, 'src/app/api/calendar/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer], ['@/lib/time', time], ['@/lib/request-utils', requestUtils],
      ['@/lib/access-guards.mjs', guards], ['@/lib/session-booking', booking], ['@/lib/session-series', series],
      ['@/lib/paid-sessions', { openPaidSessions: async () => ({ ok: true, rows: [] }), linkPaidSession: async () => true }],
      ['@/lib/require-membership', { requireMembership: async () => null }],
      ['@/lib/request-auth', { clientForRequest: async () => client, currentUser: async () => ({ id: 'member-1' }) }],
      ['@/lib/supabase/admin', { createAdminClient: () => ({}) }],
      ['@/lib/video', { videoRoomUrl: () => null }],
      ['@/lib/notify', { createNotification: async () => {} }],
      ['@/lib/session-emails', { afterSessionStep: async () => ({ emailed: false, followedUp: false }) }],
      ['@supabase/supabase-js', {}],
    ]),
  });
  return async (tables, { fail = [], tz = 'UTC', range = '', maxRows = null } = {}) => {
    client = fakeSupabase({ tables: { trainers: [], nutritionists: [], sessions: [], calendar_events: [], client_meal_plans: [], client_profiles: [], workout_sessions: [], ...tables }, fail, maxRows });
    const res = await route.GET(new Request(`https://shape.test/api/calendar?tz=${encodeURIComponent(tz)}${range}`));
    return (await res.json()).events.filter((e) => e.source === 'plan');
  };
})();

const DAY = 86400000;
const now = new Date();
const monday = (() => { const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; })();
const dayIso = (ms) => new Date(ms).toISOString().slice(0, 10);
const workout = (id, scheduled_date) => ({ id, client_id: 'member-1', status: 'published', title: id, description: null, payload: { duration: '35 min' }, scheduled_date });
const ran = (client_workout_id, at, extra = {}) => ({ id: `ws-${client_workout_id}-${at}`, client_id: 'member-1', client_workout_id, status: 'completed', duration_seconds: 2098, started_at: new Date(at).toISOString(), created_at: new Date(at).toISOString(), ...extra });

test('an assigned workout the member finished reads completed, with the time it took', async () => {
  const plan = await ROUTE({
    client_workouts: [workout('w-done', dayIso(now.getTime() - 20 * DAY)), workout('w-open', dayIso(now.getTime() - 19 * DAY)), workout('w-quit', dayIso(now.getTime() - 18 * DAY))],
    workout_sessions: [ran('w-done', now.getTime() - 20 * DAY), ran('w-quit', now.getTime() - 18 * DAY, { status: 'abandoned' })],
  });
  const byId = Object.fromEntries(plan.map((e) => [e.id, e]));
  assert.deepEqual([byId['plan:w-done'].status, byId['plan:w-done'].doneSeconds], ['completed', 2098]);
  assert.equal(byId['plan:w-open'].status, 'planned');
  assert.equal(byId['plan:w-quit'].status, 'planned', 'an abandoned session finished it');
  assert.equal(byId['plan:w-open'].doneSeconds, undefined);
});

test('an undated workout, slotted onto this week, is ticked only by a run from this week', async () => {
  const plan = await ROUTE({
    client_workouts: [workout('w-last-week', null), workout('w-this-week', null)],
    workout_sessions: [ran('w-last-week', monday.getTime() - 3 * DAY), ran('w-this-week', now.getTime())],
  });
  const byId = Object.fromEntries(plan.map((e) => [e.id, e]));
  assert.ok(byId['plan:w-last-week'] && byId['plan:w-this-week'], 'the undated workouts were not slotted');
  assert.equal(byId['plan:w-last-week'].status, 'planned', 'last week\'s run ticked this week\'s slot');
  assert.equal(byId['plan:w-this-week'].status, 'completed');
});

test('this week is read on the member\'s clock: a Monday-morning run in Tokyo ticks the slot', async (t) => {
  // Wednesday the 21st. 08:00 on Monday the 19th in Tokyo is 23:00 on Sunday the 18th in UTC.
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-21T12:00:00Z') });
  const plan = await ROUTE({ client_workouts: [workout('w-tokyo', null)], workout_sessions: [ran('w-tokyo', Date.parse('2026-10-18T23:00:00Z'))] },
    { tz: 'Asia/Tokyo', range: '&from=2026-10-19&to=2026-10-25' });
  assert.equal(plan.find((e) => e.id === 'plan:w-tokyo').status, 'completed', 'read on the UTC date, it fell in last week');
});

test('this week is the member\'s: a Los Angeles Sunday-evening run ticks the week that is still Sunday there', async (t) => {
  // 05:30 UTC on Monday the 26th: Monday in New York (the server's clock in this suite) and in
  // UTC, still 10:30 PM on Sunday the 25th in Los Angeles.
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-26T05:30:00Z') });
  const plan = await ROUTE({
    client_workouts: [workout('w-undated', null)],
    workout_sessions: [ran('w-undated', Date.parse('2026-10-26T03:00:00Z'))], // 8:00 PM Sunday in LA
  }, { tz: 'America/Los_Angeles', range: '&from=2026-10-19&to=2026-11-01' });
  const w = plan.find((e) => e.id === 'plan:w-undated');
  assert.ok(w.date >= '2026-10-19' && w.date <= '2026-10-25', `slotted onto ${w.date}, the server's week, not the member's`);
  assert.equal(w.status, 'completed', 'the member\'s Sunday run fell in "last week"');
});

test('past the read\'s cap the oldest runs drop, never this week\'s', async () => {
  // The stand-in keeps one row per read, as a full cap would: it must be the newest.
  const old = ran('w-capped', monday.getTime() - 10 * DAY);
  const recent = ran('w-capped', now.getTime());
  const plan = await ROUTE({ client_workouts: [workout('w-capped', null)], workout_sessions: [old, recent] }, { maxRows: 1 });
  assert.equal(plan.find((e) => e.id === 'plan:w-capped').status, 'completed');
});

test('a failed read of the logged sessions leaves every workout planned', async () => {
  const day = dayIso(now.getTime() - DAY);
  const plan = await ROUTE({ client_workouts: [workout('w-1', day)], workout_sessions: [ran('w-1', now.getTime() - DAY)] }, { fail: ['workout_sessions'] });
  assert.deepEqual(plan.map((e) => [e.id, e.status]), [['plan:w-1', 'planned']], 'the workout went missing or read done');
});
