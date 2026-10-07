// The coach Schedule, after the 2026-10-07 review (owner: "Apply all the fixes first").
//
// ⚠ TWO DEFECTS, BOTH INVISIBLE TO A COACH WHO LIVES ON UTC:
//   1. /api/calendar placed every booking with `toISOString().slice(0, 10)` and
//      `getUTCHours()`, so a 9:00 AM New York consult read "1:00p" and a session at
//      8:00 PM sat on the next day's cell — on the website Schedule, the member calendar
//      overlay and the app's calendar alike. And the drag that moved it wrote the shown
//      wall clock back as UTC, so fixing the display alone would have moved every dragged
//      booking by the coach's offset.
//   2. The page loaded /api/calendar once with no range, and the route's default is 60
//      days either side of today, so a coach paging three months ahead saw an empty
//      calendar that had never been asked for.
//
// These drive the SHIPPED route handlers (loadRealModule compiles the real files) against
// a Supabase stand-in that applies the filters it is given, and mount the SHIPPED page in
// JSDOM against a recorded fetch. Nothing about either is restated here.
process.env.TZ = 'America/New_York'; // the page's grid is browser-local; pin the browser

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fakeSupabase } from './helpers/fake-supabase.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const NY = 'America/New_York';

// ── the Supabase stand-in ─────────────────────────────────────────────────────
// fakeSupabase answers reads by APPLYING the filters (a window that drops a row drops it
// here too); `update` is added for the sessions write, against the same rows, so a GET
// after a reschedule reads what the reschedule stored.
function db(tables) {
  const base = fakeSupabase({
    tables,
    rpcs: { get_display_names: ({ p_ids }) => p_ids.map((id) => ({ user_id: id, full_name: 'Priya S.' })) },
  });
  const writes = [];
  return {
    ...base,
    writes,
    from(table) {
      const chain = base.from(table);
      chain.update = (patch) => {
        const filters = [];
        const upd = {
          eq(col, v) { filters.push((r) => r[col] === v); return upd; },
          select() { return upd; },
          maybeSingle() { return upd; },
          then(res, rej) {
            const rows = (tables[table] || []).filter((r) => filters.every((f) => f(r)));
            for (const r of rows) Object.assign(r, patch);
            writes.push({ table, patch });
            return Promise.resolve({ data: rows[0] ?? null, error: null }).then(res, rej);
          },
        };
        return upd;
      };
      return chain;
    },
  };
}

let mods = null;
async function routes() {
  if (mods) return mods;
  const { loadRealModule } = await import('./helpers/load-real-module.mjs');
  const nextServer = require('next/server');
  const lib = (f) => loadRealModule(join(ROOT, 'src/lib', f), { typescript: true, registry: new Map([['next/server', nextServer]]) });
  const [time, requestUtils] = await Promise.all([lib('time.ts'), lib('request-utils.ts')]);
  const guards = await import(pathToFileURL(join(ROOT, 'src/lib/access-guards.mjs')).href);
  // The shared booking rules (clash + open hours), compiled from the shipped file like the rest.
  const owned = await loadRealModule(join(ROOT, 'src/lib/owned-provider.ts'), { typescript: true, registry: new Map([['@/lib/time', time], ['@supabase/supabase-js', {}]]) });
  const booking = await loadRealModule(join(ROOT, 'src/lib/session-booking.ts'), { typescript: true, registry: new Map([['@supabase/supabase-js', {}], ['@/lib/owned-provider', owned]]) });
  const series = await loadRealModule(join(ROOT, 'src/lib/session-series.ts'), { typescript: true, registry: new Map([['@supabase/supabase-js', {}], ['@/lib/time', time]]) });
  let client = null, userId = 'coach-1';
  const notices = [];
  const registry = () => new Map([
    ['next/server', nextServer],
    ['@/lib/time', time],
    ['@/lib/request-utils', requestUtils],
    ['@/lib/access-guards.mjs', guards],
    ['@/lib/session-booking', booking],
    ['@/lib/session-series', series],
    ['@/lib/require-membership', { requireMembership: async () => null }],
    ['@/lib/request-auth', { clientForRequest: async () => client, currentUser: async () => ({ id: userId }) }],
    ['@/lib/supabase/admin', { createAdminClient: () => ({}) }],
    ['@/lib/video', { videoRoomUrl: () => null }],
    ['@/lib/notify', { createNotification: async (_c, n) => { notices.push(n); } }],
    ['@supabase/supabase-js', {}],
  ]);
  const calendar = await loadRealModule(join(ROOT, 'src/app/api/calendar/route.ts'), { typescript: true, registry: registry() });
  const manage = await loadRealModule(join(ROOT, 'src/app/api/sessions/manage/route.ts'), { typescript: true, registry: registry() });
  mods = { calendar, manage, time, notices, use: (c, id = 'coach-1') => { client = c; userId = id; } };
  return mods;
}
const getCalendar = async (c, qs, id) => {
  const m = await routes();
  m.use(c, id);
  const res = await m.calendar.GET(new Request('https://shape.test/api/calendar?' + qs));
  return { status: res.status, body: await res.json() };
};
const reschedule = async (c, body, id) => {
  const m = await routes();
  m.use(c, id);
  const res = await m.manage.POST(new Request('https://shape.test/api/sessions/manage', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reschedule', sessionId: 's-1', ...body }),
  }));
  return { status: res.status, body: await res.json() };
};

const session = (id, at, extra = {}) => ({
  id, client_id: 'member-1', provider_id: 7, provider_role: 'trainer', type: 'video',
  scheduled_at: at, duration_min: 60, status: 'confirmed', topic: null, meeting_url: null, ...extra,
});
const coachTables = (sessions, { trainerZone = NY, nutriZone = null, events = [] } = {}) => ({
  trainers: [{ id: 7, owner_id: 'coach-1', name: 'Coach', timezone: trainerZone }],
  nutritionists: nutriZone ? [{ id: 9, owner_id: 'coach-1', name: 'Coach', timezone: nutriZone }] : [],
  sessions,
  calendar_events: events,
  client_workouts: [],
  client_meal_plans: [],
  client_profiles: [{ user_id: 'member-1', timezone: NY }],
});
const sessionsOf = (body) => body.events.filter((e) => e.source === 'session');

// ── 1 · the wall clock, in the zone ──────────────────────────────────────────

test('wallClockInZone reads an instant on the zone\'s own date and clock, and inverts instantInZone', async () => {
  const { time } = await routes();
  assert.deepEqual(time.wallClockInZone(Date.parse('2026-10-07T13:00:00Z'), NY), { date: '2026-10-07', time: '09:00' });
  // 03:30Z is 11:30 PM the evening BEFORE in New York — the date comes from the zone, not UTC.
  assert.deepEqual(time.wallClockInZone(Date.parse('2026-10-08T03:30:00Z'), NY), { date: '2026-10-07', time: '23:30' });
  assert.deepEqual(time.wallClockInZone(Date.parse('2026-10-07T13:00:00Z'), 'Asia/Kolkata'), { date: '2026-10-07', time: '18:30' });
  assert.equal(time.wallClockInZone(Date.parse('2026-10-07T13:00:00Z'), 'Mars/Olympus'), null);
  assert.equal(time.wallClockInZone(NaN, NY), null);
  let checked = 0;
  for (const zone of [NY, 'Europe/London', 'Asia/Kolkata', 'Australia/Lord_Howe', 'Pacific/Kiritimati', 'UTC']) {
    for (const iso of ['2026-03-08T07:30:00Z', '2026-10-25T00:30:00Z', '2026-11-01T05:59:00Z', '2026-11-01T06:30:00Z', '2026-12-31T23:59:00Z']) {
      const t = Date.parse(iso);
      const w = time.wallClockInZone(t, zone);
      const [y, mo, d] = w.date.split('-').map(Number);
      const [h, mi] = w.time.split(':').map(Number);
      const back = time.instantInZone(y, mo, d, h, mi, zone);
      // Inside a fall-back repeat hour the wall clock names two instants; instantInZone may
      // pick either, and both read back to the same wall clock — which is what is asserted.
      assert.deepEqual(time.wallClockInZone(back, zone), w, `${zone} ${iso}`);
      checked++;
    }
  }
  assert.equal(checked, 30);
});

test('the calendar places a coach\'s bookings on the coach\'s own clock and names the zone', async () => {
  const c = db(coachTables([
    session('s-1', '2026-10-07T13:00:00+00:00'),        // 9:00 AM New York
    session('s-2', '2026-10-08T03:30:00+00:00'),        // 11:30 PM New York, Oct 7
    session('s-3', '2026-10-01T03:30:00+00:00'),        // 11:30 PM New York, Sep 30 — outside
    session('s-4', '2026-11-01T01:00:00+00:00'),        // 9:00 PM New York, Oct 31 — inside
  ]));
  // The browser says London; the coach's stored zone wins, because it is the zone their open
  // hours are in and a booking should read on the same clock as the hour it was booked into.
  const { body } = await getCalendar(c, 'from=2026-10-01&to=2026-10-31&tz=Europe/London&role=trainer');
  assert.equal(body.zone, NY);
  const byId = Object.fromEntries(sessionsOf(body).map((e) => [e.sessionId, e]));
  assert.deepEqual([byId['s-1'].date, byId['s-1'].time], ['2026-10-07', '09:00'], 'a 9:00 AM consult reads 9:00 AM');
  assert.deepEqual([byId['s-2'].date, byId['s-2'].time], ['2026-10-07', '23:30'], 'an evening session stays on its evening');
  assert.equal(byId['s-3'], undefined, 'Sep 30 in New York is outside an October window, whatever UTC says');
  assert.deepEqual([byId['s-4'].date, byId['s-4'].time], ['2026-10-31', '21:00'], 'Oct 31 in New York is inside it, whatever UTC says');
  assert.equal(byId['s-1'].scheduledAt, '2026-10-07T13:00:00+00:00', 'the real instant still rides along');
});

test('a caller who sends no tz is answered in UTC, exactly as before', async () => {
  // ⚠ THE CONTRACT OLDER APP BUILDS AND NORA'S UNDO DEPEND ON. They send a reschedule's wall
  // clock with no zone, which the manage route reads as UTC; zoning their reads alone would
  // move every booking they drag by the coach's offset.
  const c = db(coachTables([session('s-1', '2026-10-07T13:00:00+00:00'), session('s-2', '2026-10-08T03:30:00+00:00')]));
  const { body } = await getCalendar(c, 'from=2026-10-01&to=2026-10-31');
  assert.equal(body.zone, 'UTC');
  const byId = Object.fromEntries(sessionsOf(body).map((e) => [e.sessionId, e]));
  assert.deepEqual([byId['s-1'].date, byId['s-1'].time], ['2026-10-07', '13:00']);
  assert.deepEqual([byId['s-2'].date, byId['s-2'].time], ['2026-10-08', '03:30']);
});

test('a member is answered in the zone their device sends; a coach with no stored zone too', async () => {
  const member = db({ ...coachTables([
    session('s-1', '2026-10-07T13:00:00+00:00'),
    // 5:00 AM on Oct 1 in Tokyo is still Sep 30 in UTC: a window bounded by UTC dates
    // would never read it, though it is on the first day the member is looking at.
    session('s-2', '2026-09-30T20:00:00+00:00'),
  ]), trainers: [], nutritionists: [] });
  const tokyo = await getCalendar(member, 'from=2026-10-01&to=2026-10-31&tz=Asia/Tokyo', 'member-1');
  assert.equal(tokyo.body.zone, 'Asia/Tokyo');
  const byId = Object.fromEntries(sessionsOf(tokyo.body).map((e) => [e.sessionId, e]));
  assert.deepEqual([byId['s-1'].date, byId['s-1'].time], ['2026-10-07', '22:00']);
  assert.ok(byId['s-2'], 'a booking on the window\'s first local day, before it in UTC, was not read');
  assert.deepEqual([byId['s-2'].date, byId['s-2'].time], ['2026-10-01', '05:00']);
  // A zone the runtime does not know is not trusted — it falls to UTC and SAYS so.
  const junk = await getCalendar(member, 'from=2026-10-01&to=2026-10-31&tz=Mars/Olympus', 'member-1');
  assert.equal(junk.body.zone, 'UTC');
  const unstamped = db(coachTables([session('s-1', '2026-10-07T13:00:00+00:00')], { trainerZone: null }));
  assert.equal((await getCalendar(unstamped, 'from=2026-10-01&to=2026-10-31&tz=Europe/Berlin&role=trainer')).body.zone, 'Europe/Berlin');
});

test('role picks which stored zone an account that coaches both disciplines reads in', async () => {
  const c = db(coachTables([session('s-1', '2026-10-07T13:00:00+00:00')], { trainerZone: NY, nutriZone: 'Europe/London' }));
  assert.equal((await getCalendar(c, 'from=2026-10-01&to=2026-10-31&tz=UTC&role=nutritionist')).body.zone, 'Europe/London');
  assert.equal((await getCalendar(c, 'from=2026-10-01&to=2026-10-31&tz=UTC&role=trainer')).body.zone, NY);
  assert.equal((await getCalendar(c, 'from=2026-10-01&to=2026-10-31&tz=UTC')).body.zone, NY, 'no role: the trainer row first');
});

test('a manual calendar event is already a wall clock, and is not converted', async () => {
  const c = db(coachTables([], {
    events: [{ id: 'e-1', user_id: 'coach-1', created_by: 'coach-1', created_by_role: 'self', kind: 'ADMIN', title: 'Admin', sub: null, event_date: '2026-10-07', event_time: '09:00', duration_min: 30, with_name: null, location: null, accent: null, status: 'planned' }],
  }));
  const { body } = await getCalendar(c, 'from=2026-10-01&to=2026-10-31&tz=UTC&role=trainer');
  assert.equal(body.zone, NY);
  const ev = body.events.find((e) => e.id === 'e-1');
  assert.deepEqual([ev.date, ev.time], ['2026-10-07', '09:00']);
});

// ── 1 · the reschedule round trip ────────────────────────────────────────────

test('a drag keeps the WALL clock across a DST change: 9:00 AM Oct 30 moves to 9:00 AM Nov 2', async () => {
  const tables = coachTables([session('s-1', '2026-10-30T13:00:00+00:00')]);
  const c = db(tables);
  // What the page shows…
  const before = await getCalendar(c, 'from=2026-10-01&to=2026-11-30&tz=UTC&role=trainer');
  const shown = sessionsOf(before.body)[0];
  assert.deepEqual([shown.date, shown.time, before.body.zone], ['2026-10-30', '09:00', NY]);
  // …is what it sends back, with the zone it was shown in.
  const moved = await reschedule(c, { date: '2026-11-02', time: shown.time, tz: before.body.zone });
  assert.equal(moved.status, 200);
  assert.equal(new Date(tables.sessions[0].scheduled_at).toISOString(), '2026-11-02T14:00:00.000Z',
    'EST is UTC-5: 9:00 AM on Nov 2 is 14:00Z — keeping the UTC hour (13:00Z) would land it at 8:00 AM');
  const after = await getCalendar(c, 'from=2026-10-01&to=2026-11-30&tz=UTC&role=trainer');
  assert.deepEqual([sessionsOf(after.body)[0].date, sessionsOf(after.body)[0].time], ['2026-11-02', '09:00']);
});

test('a reschedule with no tz is read as UTC, as older builds and Nora\'s undo mean it', async () => {
  const tables = coachTables([session('s-1', '2026-10-30T13:00:00+00:00')]);
  const res = await reschedule(db(tables), { date: '2026-11-02', time: '13:00' });
  assert.equal(res.status, 200);
  assert.equal(new Date(tables.sessions[0].scheduled_at).toISOString(), '2026-11-02T13:00:00.000Z');
});

test('a reschedule refuses a zone it cannot read and a wall clock the zone never shows', async () => {
  const tables = coachTables([session('s-1', '2026-10-30T13:00:00+00:00')]);
  const c = db(tables);
  const junk = await reschedule(c, { date: '2026-11-02', time: '09:00', tz: 'Mars/Olympus' });
  assert.equal(junk.status, 400, 'a sent zone that is not one must not be read as UTC');
  // 2:30 AM on 2027-03-14 never happens in New York — the clocks jump from 2:00 to 3:00.
  const gap = await reschedule(c, { date: '2027-03-14', time: '02:30', tz: NY });
  assert.equal(gap.status, 400);
  const impossible = await reschedule(c, { date: '2026-11-02', time: '25:00', tz: NY });
  assert.equal(impossible.status, 400);
  assert.equal(c.writes.length, 0, 'nothing was stored');
  assert.equal(tables.sessions[0].scheduled_at, '2026-10-30T13:00:00+00:00');
});

// ── 1 · the app reads and writes on the same clock ──────────────────────────
// The app's calendar shares both routes, so it has the same round trip to keep: send `tz`
// on the read, keep the zone the answer names on every event, hand it back on a move.

const BACKEND = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');
const APP_CAL = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetCalendar.jsx'), 'utf8');
const between = (src, from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to, a + from.length);
  assert.ok(a >= 0 && b > a, 'could not lift ' + from);
  return src.slice(a, b);
};

test('the app sends its zone on every calendar read, and hands the named zone back on a reschedule', async () => {
  const lifted = between(BACKEND, 'function deviceTimeZone()', 'async function createCalendarEvent(');
  const asked = [];
  const { listCalendar } = new Function('getJsonOrDefault', 'apiBaseUrl',
    lifted + '\nreturn { listCalendar };')(async (url) => { asked.push(url); return { events: [{ id: 'x' }], zone: NY }; }, '');
  const out = await listCalendar({ from: '2026-10-01', to: '2026-10-31', role: 'trainer' });
  const qs = new URL(asked[0], 'https://shape.test').searchParams;
  assert.equal(qs.get('tz'), Intl.DateTimeFormat().resolvedOptions().timeZone);
  assert.equal(qs.get('role'), 'trainer');
  assert.equal(out.zone, NY, 'the zone the route answered in is handed to the screen');
  await listCalendar({ from: '2026-10-01', to: '2026-10-31', role: 'client' });
  assert.equal(new URL(asked[1], 'https://shape.test').searchParams.get('role'), null, 'a member sends no coach role');

  const manageSrc = between(BACKEND, 'async function manageSession(', '// ─── Notifications');
  const posted = [];
  const { manageSession } = new Function('sessionsApiUrl', 'sessionsAuthHeaders', 'fetch',
    manageSrc + '\nreturn { manageSession };')(() => '/api/sessions/manage', (h) => h, async (_u, init) => { posted.push(JSON.parse(init.body)); return { ok: true, json: async () => ({}) }; });
  await manageSession({ sessionId: 's-1', action: 'reschedule', date: '2026-11-02', time: '09:00', tz: NY });
  assert.deepEqual(posted[0], { sessionId: 's-1', action: 'reschedule', date: '2026-11-02', time: '09:00', tz: NY });

  // The screen keeps the answer's zone on each event, and the sheet's move sends it back.
  const mapSrc = between(APP_CAL, 'const bsCalTeal', 'function BSCalendarScreen(');
  const { _bsMapServerCalEvent } = new Function(mapSrc + '\nreturn { _bsMapServerCalEvent };')();
  const t = { isLight: false, RUST: '#c0533b', AMBER: '#d8a23a', BLUE: '#7ed4ff', INK50: '#999' };
  assert.equal(_bsMapServerCalEvent({ id: 'session:s-1', date: '2026-10-07', time: '09:00' }, t, NY).zone, NY);
  assert.match(APP_CAL, /window\.ShapeCalendar\.list\(\{ from, to, clientId, role \}\)/, 'the screen no longer sends its role');
  assert.match(APP_CAL, /_bsMapServerCalEvent\(e, t, d\.zone\)/, 'the screen drops the zone the route named');
  assert.match(APP_CAL, /action: 'reschedule', date: newDate, time, tz: event\.zone/, 'the app reschedule no longer sends the zone it was shown in');
});

test('the app calendar names the zone its bookings are read in, for a live account only', () => {
  // Registered on #2222 ("the app calendar doesn't label its zone"), done the same day.
  assert.match(APP_CAL, /setServerZone\(typeof d\.zone === 'string' && d\.zone \? d\.zone : null\)/, 'the screen no longer keeps the zone the route named');
  assert.match(APP_CAL, /zone=\{useServer \? serverZone : null\}/, 'the demo month would be given a zone, or a live one none');
  const month = between(APP_CAL, 'function BSCalendarMonth(', '{/* DOW header');
  assert.match(month, /\{zone && \(/, 'the label shows without a zone');
  assert.match(month, /tr\('calendar:zone\.timesIn', \{ defaultValue: 'Times in \{zone\}', zone \}\)/, 'the label is not the translated one');
  for (const loc of ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const cat = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs', loc, 'calendar.json'), 'utf8'));
    assert.match(cat['zone.timesIn'] || '', /\{zone\}/, loc + ' has no "Times in {zone}"');
  }
});

test('the website\'s member calendar overlay sends its zone too', () => {
  // The fourth reader of /api/calendar. It only displays, so the zone it sends is the whole fix.
  const shell = readFileSync(join(ROOT, 'public/newdesign/pageShell.jsx'), 'utf8');
  const overlay = between(shell, 'function CalendarOverlay(', 'React.useEffect(() => { reload(); }, [reload]);');
  assert.match(overlay, /fetch\(`\/api\/calendar\?from=\$\{from\}&to=\$\{to\}&tz=\$\{encodeURIComponent\(tz\)\}\$\{coachRole\}`/,
    'the overlay reads the calendar without a zone, so it gets UTC');
  assert.match(overlay, /tz = Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/, 'the overlay no longer sends the browser zone');
});

// ── 2 · the page asks for the range on screen, and keeps it ──────────────────

const SCHEDULE_SRC = readFileSync(join(ROOT, 'public/newdesign/dashSchedule.jsx'), 'utf8');

test('the page loads the visible months with tz + role, once each, and drags with the zone it was shown', async () => {
  // ⚠ RESTATED 2026-10-07 FOR THE WEEK GRID (step 2), CLAIM FOR CLAIM. A ?date= link now opens
  // the DAY view for that visit (it used to write "week" into the remembered choice), the week
  // is a time grid whose drag is pointer-driven (tests/schedule-step2.test.mjs drives that one),
  // and the HTML5 day-only drag this test drove lives on in the Month view — so the DST round
  // trip is driven there, with the same body asserted.
  const { mountSchedule, json } = await import('./helpers/schedule-page.mjs');
  // ⚠ THE ROUTE ANSWERS IN CHICAGO WHILE THIS BROWSER IS IN NEW YORK, so the label and the drag
  // can only be right by using the zone the answer NAMES, never this browser's own guess.
  const ROUTE_ZONE = 'America/Chicago';
  let calendarReads = 0;
  const page = await mountSchedule({
    // The 31st, on purpose: a month step that overflows from it skips November entirely.
    params: { date: '2026-10-31' },
    async fetch(u) {
      if (u.pathname === '/api/my-availability') return json(200, { slots: [], timezone: ROUTE_ZONE });
      if (u.pathname === '/api/sessions/manage') return json(200, { ok: true });
      if (u.pathname === '/api/calendar') {
        // A page that re-requests what it already holds loops on its own answers; past a dozen
        // reads the stand-in refuses, so such a page stops and the counts below catch it.
        if (++calendarReads > 12) return json(500, {});
        const from = u.searchParams.get('from'), to = u.searchParams.get('to');
        const all = [{ id: 'session:s-1', sessionId: 's-1', source: 'session', kind: 'SESSION', title: 'Lower pull', date: '2026-10-30', time: '09:00', durationMin: 60, with: 'Priya S.', clientId: 'member-1', status: 'confirmed', reschedulable: true, editable: false }];
        return json(200, { events: all.filter((e) => e.date >= from && e.date <= to), zone: ROUTE_ZONE });
      }
      return json(404, {});
    },
  });
  const calendarCalls = () => page.calls.filter((c) => c.url.startsWith('/api/calendar')).map((c) => new URL(c.url, 'https://shape.test').searchParams);
  const click = (name) => page.click(page.button(name));
  try {
    // The deep link opens the day view on Sat Oct 31; its range is that week (Oct 26 – Nov 1)
    // plus a week either side, so October and November in ONE request.
    let cal = calendarCalls();
    assert.equal(cal.length, 1, 'one request for the contiguous months on screen');
    assert.deepEqual([cal[0].get('from'), cal[0].get('to')], ['2026-10-01', '2026-11-30']);
    assert.equal(cal[0].get('role'), 'trainer');
    assert.equal(cal[0].get('tz'), Intl.DateTimeFormat().resolvedOptions().timeZone, 'the browser zone is sent, so the route answers on a clock');
    assert.equal(page.button('Day').getAttribute('aria-pressed'), 'true', 'a linked date no longer opens its day');
    // The week, read in the zone the route named.
    await click('Week');
    assert.equal(calendarCalls().length, 1, 'the week is already loaded');
    assert.match(page.text(), /Times in America\/Chicago/);
    assert.doesNotMatch(page.text(), /Times in America\/New_York/, 'the label is this browser\'s guess, not the route\'s answer');
    assert.match(page.text(), /9:00a/);

    // Month: grid Sep 28 – Nov 8, +/- a week → September joins.
    await click('Month');
    cal = calendarCalls();
    assert.equal(cal.length, 2);
    assert.deepEqual([cal[1].get('from'), cal[1].get('to')], ['2026-09-01', '2026-09-30'], 'only the month not yet loaded');

    // The drag hands back the zone the booking was SHOWN in, with the shown wall clock —
    // here across the night the clocks go back, Fri Oct 30 to Sun Nov 1.
    const chip = [...page.doc.querySelectorAll('[draggable="true"]')].find((el) => /Priya/.test(el.textContent));
    assert.ok(chip, 'the booking chip is on the month grid');
    const start = new page.dom.window.Event('dragstart', { bubbles: true });
    start.dataTransfer = { setData() {} };
    await page.act(async () => chip.dispatchEvent(start));
    const sun = page.doc.querySelector('[data-date="2026-11-01"]');
    assert.ok(sun, 'the Sunday cell');
    await page.act(async () => sun.dispatchEvent(Object.assign(new page.dom.window.Event('drop', { bubbles: true, cancelable: true }), { dataTransfer: {} })));
    await page.settle();
    const post = page.calls.find((c) => c.url === '/api/sessions/manage');
    assert.ok(post, 'the drop rescheduled the session');
    assert.deepEqual(JSON.parse(post.init.body), { action: 'reschedule', sessionId: 's-1', date: '2026-11-01', time: '09:00', tz: 'America/Chicago' });

    await click('›'); // November: grid Oct 26 – Dec 6, +/- a week → Oct, Nov, Dec
    cal = calendarCalls();
    assert.equal(cal.length, 3);
    assert.deepEqual([cal[2].get('from'), cal[2].get('to')], ['2026-12-01', '2026-12-31'], 'only the month not yet loaded — and November, not a skipped-to December');
    assert.match(page.text(), /November 2026/);
    // The November grid, cell by cell: the Sunday the clocks go back appears ONCE, and the
    // Monday after it sits under Monday.
    const days = [...page.doc.querySelectorAll('div')].filter((d) => d.style.minHeight === '92px').map((d) => d.firstChild.textContent);
    assert.equal(days.length, 42);
    assert.deepEqual(days.slice(0, 9), ['26', '27', '28', '29', '30', '31', '1', '2', '3']);
    assert.deepEqual(days.slice(-2), ['5', '6']);
    await click('›'); // December → adds January
    cal = calendarCalls();
    assert.equal(cal.length, 4);
    assert.deepEqual([cal[3].get('from'), cal[3].get('to')], ['2027-01-01', '2027-01-31']);
    await click('‹'); await click('‹'); // back to November, then October
    assert.equal(calendarCalls().length, 4, 'paging back costs nothing');
    await click('‹'); // September: grid Aug 31 – Oct 11, +/- a week → adds August
    cal = calendarCalls();
    assert.equal(cal.length, 5);
    assert.deepEqual([cal[4].get('from'), cal[4].get('to')], ['2026-08-01', '2026-08-31']);
    for (const q of cal) {
      assert.equal(q.get('role'), 'trainer');
      assert.equal(q.get('tz'), 'America/New_York');
    }
  } finally {
    await page.unmount();
  }
});

// The page's own range helpers, lifted from the shipped file.
const H = new Function(SCHEDULE_SRC.slice(SCHEDULE_SRC.indexOf('function dscIso('), SCHEDULE_SRC.indexOf('// ── Demo dataset'))
  + '\nreturn { dscIso, dscMonday, dscAddDays, dscVisibleRange, dscMonthsIn, dscMonthRuns, dscMonthEnd, dscMergeRange, dscTodayIn };')();

test('the month grid builds its cells by the calendar, so the day the clocks go back appears once', () => {
  // ⚠ `start + i * 24h` landed the cell after a 25-hour day at 23:00 the day before: November
  // 2026 in New York showed Sunday Nov 1 twice and every later cell under the wrong weekday.
  const start = H.dscMonday(new Date(2026, 10, 1));
  const cells = Array.from({ length: 42 }, (_, i) => H.dscIso(H.dscAddDays(start, i)));
  assert.equal(new Set(cells).size, 42, 'a date appears twice in the November grid');
  assert.equal(cells[0], '2026-10-26');
  assert.equal(cells[7], '2026-11-02', 'the Monday after the change sits under Monday');
  assert.equal(cells[41], '2026-12-06');
});

test('the range is the grid plus a week either side, as whole months, in contiguous runs', () => {
  // A mid-month week still reaches into the next month when that month is a week away, so
  // paging forward one week finds it already loaded.
  assert.deepEqual(H.dscMonthsIn(H.dscVisibleRange('week', new Date(2026, 9, 21))), ['2026-10', '2026-11']);
  assert.deepEqual(H.dscMonthsIn(H.dscVisibleRange('week', new Date(2026, 9, 14))), ['2026-10']);
  assert.deepEqual(H.dscMonthsIn(H.dscVisibleRange('month', new Date(2026, 9, 31))), ['2026-09', '2026-10', '2026-11']);
  assert.deepEqual(H.dscMonthsIn(H.dscVisibleRange('month', new Date(2026, 11, 15))), ['2026-11', '2026-12', '2027-01']);
  assert.deepEqual(H.dscMonthRuns(['2026-11', '2026-12', '2027-01', '2027-03']), [['2026-11', '2026-12', '2027-01'], ['2027-03']]);
  assert.equal(H.dscMonthEnd('2028-02'), '2028-02-29');
  assert.equal(H.dscMonthEnd('2026-02'), '2026-02-28');
  assert.equal(H.dscMonthEnd('2026-12'), '2026-12-31');
});

test('what is loaded is kept by id, and an answer on a different clock starts the cache over', () => {
  const a = { id: 'session:a', date: '2026-10-07', time: '09:00' };
  const one = H.dscMergeRange(null, { events: [a], zone: NY }, ['2026-10']);
  assert.deepEqual([one.zone, [...one.months], one.events.length], [NY, ['2026-10'], 1]);
  // The same booking arriving again (it was dragged into a month that loaded later) is ONE
  // booking, carrying the server's own date.
  const two = H.dscMergeRange(one, { events: [{ ...a, date: '2026-11-02' }], zone: NY }, ['2026-11']);
  assert.deepEqual([...two.months].sort(), ['2026-10', '2026-11']);
  assert.deepEqual(two.events.map((e) => e.date), ['2026-11-02']);
  // A coach who re-saves their hours from another zone mid-visit: months read on the old
  // clock are dropped rather than shown beside the new ones under one label.
  const moved = H.dscMergeRange(two, { events: [{ ...a, time: '08:00' }], zone: 'America/Chicago' }, ['2026-12']);
  assert.deepEqual([moved.zone, [...moved.months]], ['America/Chicago', ['2026-12']]);
  assert.equal(moved.events.length, 1);
});

test('"today" is the day in the zone the bookings are read in', () => {
  // Kiritimati (UTC+14) and Midway (UTC-11) are 25 hours apart: never the same date.
  const fmt = (zone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  assert.equal(H.dscTodayIn('Pacific/Kiritimati'), fmt('Pacific/Kiritimati'));
  assert.equal(H.dscTodayIn('Pacific/Midway'), fmt('Pacific/Midway'));
  assert.notEqual(H.dscTodayIn('Pacific/Kiritimati'), H.dscTodayIn('Pacific/Midway'));
  assert.equal(H.dscTodayIn('Mars/Olympus'), H.dscIso(new Date()), 'an unknown zone falls back to this browser');
  assert.equal(H.dscTodayIn(null), H.dscIso(new Date()));
  // And the grids are handed it: the highlight follows the route's zone, not this browser's.
  assert.match(SCHEDULE_SRC, /const todayIso = dscTodayIn\(calZone\);/);
  assert.equal((SCHEDULE_SRC.match(/todayIso=\{todayIso\}/g) || []).length, 2, 'both grids take the zone\'s today');
});
