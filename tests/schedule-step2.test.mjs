// The coach Schedule, step 2 of the owner-approved upgrade (2026-10-07: "I like everything that
// is proposed for schedule … proceed with upgrades/improvements"): the week grid.
//
// Three layers, each driven as it ships:
//   1. scheduleRules.mjs, the pure rules the grid AND the booking routes import — open-hours
//      fit, clash, lanes, the hour range, the drop point and the load figure;
//   2. the routes that write a booking — /api/sessions/manage (`create`, and a reschedule that
//      refuses an overlap), /api/sessions/request (a member's request, which now notifies the
//      coach) and /api/consultation (which now refuses a time outside the coach's hours) —
//      compiled from the shipped files and run against a Supabase stand-in that applies its
//      filters;
//   3. the page itself, mounted in JSDOM with the real rules module and a recorded fetch:
//      blocks on a time axis, open hours shaded, the requests strip, the booking sheet, booking
//      from an empty slot, and a POINTER drag to a new time with its verdicts.
process.env.TZ = 'America/New_York'; // the grid is browser-local; pin the browser

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fakeSupabase } from './helpers/fake-supabase.mjs';
import { mountSchedule, json, SCHEDULE_SRC } from './helpers/schedule-page.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const R = await import(pathToFileURL(join(ROOT, 'public/newdesign/scheduleRules.mjs')).href);
const B = require(join(ROOT, 'public/newdesign/bookingSlots.js'));
const NY = 'America/New_York';
// Wed 7 Oct 2026, 11:00 AM in New York.
const NOW = Date.parse('2026-10-07T15:00:00Z');

// ── 1 · the rules ────────────────────────────────────────────────────────────

test('open hours merge per weekday, skip malformed rows, and are not clamped at midnight', () => {
  const blocks = R.openBlocks([
    { weekday: 1, start_minute: 360, duration_min: 60 },
    { weekday: 1, start_minute: 420, duration_min: 60 },   // touches → one 6a–8a block
    { weekday: 1, start_minute: 450, duration_min: 90 },   // overlaps → 6a–9a
    { weekday: 1, start_minute: 1020, duration_min: 120 },
    { weekday: 6, start_minute: 1380, duration_min: 120 }, // 11p for two hours: kept as 1380–1500
    { weekday: null, start_minute: 540, duration_min: 60 },
    { weekday: 2, start_minute: null, duration_min: 60 },
    { weekday: 2, start_minute: 540, duration_min: 0 },
    { weekday: 7, start_minute: 540, duration_min: 60 },
  ]);
  assert.equal(blocks.length, 7);
  assert.deepEqual(blocks[1], [{ start: 360, end: 540 }, { start: 1020, end: 1140 }]);
  assert.deepEqual(blocks[2], [], 'a row with no start or no length is not an hour');
  assert.deepEqual(blocks[0], [], 'a null weekday is not Sunday');
  assert.deepEqual(blocks[6], [{ start: 1380, end: 1500 }]);
});

test('fitsOpenHours accepts exactly what bookingSlots.js offers a member, and nothing past the hours', () => {
  const slots = [
    { weekday: 4, start_minute: 540, duration_min: 180 },  // Thu 9a–12p
    { weekday: 4, start_minute: 900, duration_min: 30 },   // Thu 3p for 30 minutes — shorter than a session
  ];
  assert.equal(R.fitsOpenHours(slots, 4, 540, 60), true);
  assert.equal(R.fitsOpenHours(slots, 4, 660, 60), true, 'an hour ending exactly at close fits');
  assert.equal(R.fitsOpenHours(slots, 4, 690, 60), false, 'a session running past close does not');
  assert.equal(R.fitsOpenHours(slots, 4, 480, 60), false, 'before opening');
  assert.equal(R.fitsOpenHours(slots, 3, 540, 60), false, 'another weekday');
  assert.equal(R.fitsOpenHours(slots, 4, 900, 60), true, 'the start of a short row, as bookingSlots offers it');
  assert.equal(R.fitsOpenHours(slots, 4, 915, 15), true);
  assert.equal(R.fitsOpenHours(slots, 4, 915, 60), false, 'not the start of the short row');
  assert.equal(R.fitsOpenHours(slots, 4, 180, 60), false, 'the 3 AM booking this exists to stop');
  assert.equal(R.fitsOpenHours(slots, null, 540, 60), false);
  // ⚠ THE PARITY THAT MATTERS: every time bookingSlots.js offers a member, for the Team page's
  // hour and the consult's 15 minutes, in a zone with a DST change inside the window, fits.
  const pattern = [
    { weekday: 1, start_minute: 360, duration_min: 240 }, { weekday: 3, start_minute: 1020, duration_min: 30 },
    { weekday: 5, start_minute: 540, duration_min: 90 }, { weekday: 0, start_minute: 60, duration_min: 120 },
  ];
  let checked = 0;
  for (const sessionMin of [15, 60]) {
    for (const s of B.buildSlots({ slots: pattern, booked: [], zone: NY, now: new Date('2026-10-20T12:00:00Z'), days: 28, sessionMin })) {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: NY, hourCycle: 'h23', weekday: 'short', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(s.iso)).map((x) => [x.type, x.value]));
      const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
      assert.equal(R.fitsOpenHours(pattern, wd, Number(p.hour) * 60 + Number(p.minute), sessionMin), true, `offered ${s.iso} (${sessionMin} min) is refused`);
      checked++;
    }
  }
  assert.ok(checked > 40, 'the offer sweep checked too little: ' + checked);
});

test('a clash is an overlap with an ACTIVE booking: back to back is not, the booking itself is not', () => {
  const items = [
    { id: 'a', start: 540, end: 600, status: 'confirmed' },
    { id: 'b', start: 660, end: 720, status: 'requested' },
    { id: 'c', start: 780, end: 840, status: 'completed' },
    { id: 'd', start: 900, end: 960, status: 'cancelled' },
  ];
  assert.equal(R.clashIn(items, 600, 660, null), null, '10–11 between two bookings is free');
  assert.equal(R.clashIn(items, 570, 630, null).id, 'a');
  assert.equal(R.clashIn(items, 690, 700, null).id, 'b', 'a request holds its time');
  assert.equal(R.clashIn(items, 780, 840, null), null, 'a completed session holds nothing');
  assert.equal(R.clashIn(items, 900, 960, null), null, 'nor a cancelled one');
  assert.equal(R.clashIn(items, 555, 615, 'a'), null, 'nudging a booking within its own hour is not a clash with itself');
  assert.deepEqual(R.ACTIVE_STATUSES, ['requested', 'confirmed']);
});

test('lanes put overlapping blocks side by side and leave the rest full width', () => {
  const lanes = R.layoutLanes([
    { id: 'a', start: 540, end: 600 }, { id: 'b', start: 570, end: 630 }, { id: 'c', start: 580, end: 600 },
    { id: 'd', start: 700, end: 760 },
  ]);
  assert.deepEqual([lanes.get('a'), lanes.get('b'), lanes.get('c')].map((l) => [l.lane, l.lanes]), [[0, 3], [1, 3], [2, 3]]);
  assert.deepEqual(lanes.get('d'), { lane: 0, lanes: 1 });
  const reuse = R.layoutLanes([{ id: 'a', start: 540, end: 600 }, { id: 'b', start: 550, end: 700 }, { id: 'c', start: 610, end: 640 }]);
  assert.deepEqual([reuse.get('c').lane, reuse.get('c').lanes], [0, 2], 'a lane freed inside a cluster is reused');
});

test('the drawn hours default to 6a–9p and widen to whatever is on screen', () => {
  assert.deepEqual(R.hourRange([]), { startHour: 6, endHour: 21 });
  assert.deepEqual(R.hourRange([{ start: 330, end: 390 }, { start: 1260, end: 1290 }]), { startHour: 5, endHour: 22 });
  assert.deepEqual(R.hourRange([{ start: 0, end: 1500 }]), { startHour: 0, endHour: 24 });
});

test('a pointer lands on a column and a snapped minute, held where the hand took the block', () => {
  const rect = { left: 100, top: 0, width: 700 };
  assert.deepEqual(R.pointToSlot({ x: 450, y: 230, rect, columns: 7, startHour: 6, hourPx: 44, grabMin: 13.6, durationMin: 60 }), { col: 3, minute: 660 });
  assert.deepEqual(R.pointToSlot({ x: 50, y: 0, rect, columns: 7, startHour: 6, hourPx: 44 }), { col: 0, minute: 360 });
  assert.deepEqual(R.pointToSlot({ x: 9000, y: 99999, rect, columns: 7, startHour: 6, hourPx: 44, durationMin: 90 }), { col: 6, minute: 1350 }, 'a block never leaves its day');
  assert.equal(R.snapMinutes(667), 660);
  assert.equal(R.snapMinutes(668), 675);
});

test('the load counts open hours used — confirmed and done only, inside the hours, never twice', () => {
  const day = [{ start: 480, end: 720 }];
  const l = R.dayLoad(day, [
    { start: 420, end: 540, status: 'confirmed' },   // 7–9: one hour of it is open time
    { start: 600, end: 660, status: 'completed' },
    { start: 630, end: 690, status: 'confirmed' },   // overlaps the one above: 10:30–11 counted once
    { start: 690, end: 720, status: 'requested' },   // not booked until accepted
  ]);
  assert.deepEqual(l, { openMin: 240, bookedMin: 150, freeMin: 90 });
  assert.equal(R.hoursLabel(150), '2.5');
  assert.equal(R.hoursLabel(1200), '20');
  assert.deepEqual(R.dayLoad([], [{ start: 0, end: 60, status: 'confirmed' }]), { openMin: 0, bookedMin: 0, freeMin: 0 });
});

// ── 2 · the routes ───────────────────────────────────────────────────────────

// fakeSupabase answers reads by APPLYING the filters; this adds the writes the booking routes
// make, against the same rows, and the auth admin read. `label` says which client wrote, so a
// test can tell a request-client insert (RLS applies) from a service-role one.
function db(tables, { label, insertError = null, fail = [] } = {}) {
  const base = fakeSupabase({
    tables, fail,
    rpcs: { get_display_names: ({ p_ids }) => p_ids.map((id) => ({ user_id: id, full_name: (tables.names || {})[id] || null })) },
  });
  let n = 0;
  const writes = tables.__writes || (tables.__writes = []);
  return {
    ...base,
    auth: { admin: { getUserById: async (id) => ({ data: { user: { id, email: (tables.emails || {})[id] || null } } }) } },
    from(table) {
      const chain = base.from(table);
      chain.insert = (row) => {
        const ins = {
          select() { return ins; }, single() { return ins; },
          then(res, rej) {
            if (insertError) return Promise.resolve({ data: null, error: insertError }).then(res, rej);
            const stored = { id: row.id || 'gen-' + (++n), ...row };
            (tables[table] = tables[table] || []).push(stored);
            writes.push({ by: label, table, op: 'insert', row: stored });
            return Promise.resolve({ data: stored, error: null }).then(res, rej);
          },
        };
        return ins;
      };
      chain.update = (patch) => {
        const filters = [];
        const upd = {
          eq(col, v) { filters.push((r) => r[col] === v); return upd; },
          select() { return upd; }, maybeSingle() { return upd; },
          then(res, rej) {
            const rows = (tables[table] || []).filter((r) => filters.every((f) => f(r)));
            for (const r of rows) Object.assign(r, patch);
            writes.push({ by: label, table, op: 'update', patch });
            return Promise.resolve({ data: rows[0] ?? null, error: null }).then(res, rej);
          },
        };
        return upd;
      };
      return chain;
    },
  };
}

// The clock the routes read is pinned for the call: they all refuse a time in the past.
async function atNow(fn) {
  const Real = globalThis.Date;
  class Pinned extends Real { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
  globalThis.Date = Pinned;
  try { return await fn(); } finally { globalThis.Date = Real; }
}

let loaded = null;
async function routes() {
  if (loaded) return loaded;
  const { loadRealModule } = await import('./helpers/load-real-module.mjs');
  const nextServer = require('next/server');
  const lib = (f, reg = []) => loadRealModule(join(ROOT, 'src/lib', f), { typescript: true, registry: new Map([['next/server', nextServer], ...reg]) });
  const [time, requestUtils] = await Promise.all([lib('time.ts'), lib('request-utils.ts')]);
  const booking = await lib('session-booking.ts', [['@supabase/supabase-js', {}]]);
  const guards = await import(pathToFileURL(join(ROOT, 'src/lib/access-guards.mjs')).href);
  const state = { client: null, admin: null, user: null, notices: [], mails: [] };
  const registry = () => new Map([
    ['next/server', nextServer],
    ['@/lib/time', time],
    ['@/lib/request-utils', requestUtils],
    ['@/lib/access-guards.mjs', guards],
    ['@/lib/session-booking', booking],
    ['@/lib/request-auth', { clientForRequest: async () => state.client, currentUser: async () => state.user }],
    ['@/lib/supabase/admin', { createAdminClient: () => state.admin }],
    ['@/lib/video', { videoRoomUrl: (id) => 'https://meet.shape.test/' + id }],
    ['@/lib/notify', { createNotification: async (_c, n) => { state.notices.push(n); return true; } }],
    ['@/lib/capacity', { isEffectivelyAtCapacity: () => false }],
    ['@/lib/email', { buildIcs: () => 'ICS', sendEmail: async (m) => { state.mails.push(m); return { ok: true }; } }],
    ['@/lib/turnstile', { verifyTurnstile: async () => true }],
    ['@supabase/supabase-js', {}],
  ]);
  const load = (p) => loadRealModule(join(ROOT, 'src/app/api', p), { typescript: true, registry: registry() });
  const [manage, request, consult] = await Promise.all([load('sessions/manage/route.ts'), load('sessions/request/route.ts'), load('consultation/route.ts')]);
  loaded = { manage, request, consult, state };
  return loaded;
}
async function post(mod, path, body, { tables, user, insertError, fail } = {}) {
  const m = await routes();
  m.state.client = db(tables, { label: 'request', fail });
  m.state.admin = db(tables, { label: 'service', insertError, fail });
  m.state.user = user;
  m.state.notices.length = 0;
  const res = await atNow(() => m[mod].POST(new Request('https://shape.test' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })));
  return { status: res.status, body: await res.json(), notices: m.state.notices.slice(), writes: tables.__writes || [] };
}

const COACH = { id: 'coach-1', email: 'coach@shape.test' };
const MEMBER = { id: 'member-1', email: 'priya@shape.test', user_metadata: { full_name: 'Priya Shah' } };
const sess = (id, at, extra = {}) => ({
  id, client_id: 'member-9', client_name: 'Marcus T.', provider_id: 7, provider_role: 'trainer', type: 'video',
  scheduled_at: at, duration_min: 60, status: 'confirmed', topic: null, meeting_url: null, ...extra,
});
const world = (extra = {}) => ({
  trainers: [{ id: 7, owner_id: 'coach-1', name: 'Coach', timezone: NY }],
  nutritionists: [],
  subscriptions: [
    { client_id: 'member-1', provider_id: 7, provider_role: 'trainer', status: 'active' },
    { client_id: 'member-2', provider_id: 7, provider_role: 'trainer', status: 'past_due' },
  ],
  // Thu 9a–12p and Fri 9a–12p, New York.
  provider_availability: [
    { provider_id: 7, provider_role: 'trainer', weekday: 4, start_minute: 540, duration_min: 180 },
    { provider_id: 7, provider_role: 'trainer', weekday: 5, start_minute: 540, duration_min: 180 },
  ],
  sessions: [],
  client_profiles: [{ user_id: 'member-1', timezone: 'America/Los_Angeles' }],
  names: { 'member-1': 'Priya Shah' },
  emails: { 'member-1': 'priya@shape.test' },
  ...extra,
});
const create = (body, opts) => post('manage', '/api/sessions/manage', { action: 'create', role: 'trainer', clientId: 'member-1', date: '2026-10-08', time: '10:00', tz: NY, durationMin: 60, type: 'video', ...body }, { user: COACH, ...opts });

test('create: a coach books their own active client, confirmed, on their own clock, and the client is told', async () => {
  const tables = world();
  const r = await create({ topic: 'Lower A' }, { tables });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const ins = r.writes.find((w) => w.op === 'insert');
  assert.equal(ins.by, 'service', 'a coach cannot insert through RLS — the checked write is the service role');
  assert.equal(ins.row.status, 'confirmed');
  assert.equal(ins.row.scheduled_at, '2026-10-08T14:00:00.000Z', '10:00 AM in New York (EDT) is 14:00Z');
  assert.deepEqual([ins.row.client_id, ins.row.provider_id, ins.row.provider_role, ins.row.duration_min, ins.row.type, ins.row.topic],
    ['member-1', 7, 'trainer', 60, 'video', 'Lower A']);
  assert.deepEqual([ins.row.client_name, ins.row.client_email], ['Priya Shah', 'priya@shape.test']);
  assert.equal(ins.row.meeting_url, 'https://meet.shape.test/' + ins.row.id, 'a video session gets its room in the same write');
  assert.equal(r.body.session.id, ins.row.id);
  assert.equal(r.notices.length, 1);
  assert.equal(r.notices[0].userId, 'member-1');
  assert.equal(r.notices[0].type, 'session_booked');
  assert.match(r.notices[0].body, /Oct 8, 7:00 AM/, 'the member reads it on THEIR clock (Los Angeles)');
});

test('create refuses a client who is not the coach\'s, a caller who is not a coach, and a time it cannot place', async () => {
  const notMine = await create({ clientId: 'member-2' }, { tables: world() });
  assert.equal(notMine.status, 403, 'a past_due subscription is not an active client');
  const stranger = await create({ clientId: 'member-7' }, { tables: world() });
  assert.equal(stranger.status, 403);
  const member = await create({}, { tables: world(), user: { id: 'member-1' } });
  assert.equal(member.status, 403, 'a member cannot book as a coach');
  for (const [body, why] of [
    [{ tz: undefined }, 'no zone'], [{ tz: 'Mars/Olympus' }, 'not a zone'], [{ date: '2026-10-06' }, 'the past'],
    [{ durationMin: 10 }, 'too short'], [{ durationMin: 300 }, 'too long'], [{ durationMin: 62 }, 'off the five-minute grid'],
    [{ type: 'carrier pigeon' }, 'an unknown type'], [{ date: '2027-03-14', time: '02:30' }, 'a wall clock New York skips'],
    [{ time: undefined }, 'no time'],
  ]) {
    const tables = world();
    const r = await create(body, { tables });
    assert.equal(r.status, 400, why + ': ' + JSON.stringify(r.body));
    assert.equal(r.writes.filter((w) => w.op === 'insert').length, 0, why + ' wrote a row');
  }
});

test('create refuses an overlap with an active booking, names it on the coach\'s clock, and allows back to back', async () => {
  const over = await create({ time: '10:30' }, { tables: world({ sessions: [sess('s-9', '2026-10-08T14:00:00+00:00')] }) });
  assert.equal(over.status, 409);
  assert.equal(over.body.code, 'overlap');
  assert.match(over.body.error, /Marcus T\. at 10:00 AM/);
  assert.equal(over.writes.filter((w) => w.op === 'insert').length, 0);
  const req = await create({}, { tables: world({ sessions: [sess('s-9', '2026-10-08T14:30:00+00:00', { status: 'requested', duration_min: 15 })] }) });
  assert.equal(req.status, 409, 'a request holds its time');
  const done = await create({}, { tables: world({ sessions: [sess('s-9', '2026-10-08T14:00:00+00:00', { status: 'cancelled' })] }) });
  assert.equal(done.status, 200, 'a cancelled booking holds nothing');
  const after = await create({ time: '11:00' }, { tables: world({ sessions: [sess('s-9', '2026-10-08T14:00:00+00:00')] }) });
  assert.equal(after.status, 200, 'back to back is not a clash');
  // An earlier long session reaching into this one is found, however early it started.
  const long = await create({ time: '11:00' }, { tables: world({ sessions: [sess('s-9', '2026-10-08T12:00:00+00:00', { duration_min: 240 })] }) });
  assert.equal(long.status, 409);
});

test('create fails closed: an unreadable calendar books nothing, and a taken start has its own sentence', async () => {
  const unread = await create({}, { tables: world(), fail: ['sessions'] });
  assert.equal(unread.status, 503);
  assert.equal(unread.writes.filter((w) => w.op === 'insert').length, 0);
  const taken = await create({}, { tables: world(), insertError: { code: '23505', message: 'dup' } });
  assert.equal(taken.status, 409);
  assert.equal(taken.body.code, 'taken');
  assert.equal(taken.notices.length, 0, 'a booking that was not written was announced');
});

test('a reschedule onto another booking is refused server-side, and nudging within its own hour is not', async () => {
  const tables = world({ sessions: [sess('s-1', '2026-10-08T14:00:00+00:00', { client_id: 'member-1' }), sess('s-2', '2026-10-09T14:00:00+00:00')] });
  const move = (body) => post('manage', '/api/sessions/manage', { action: 'reschedule', sessionId: 's-1', tz: NY, ...body }, { tables, user: COACH });
  const clash = await move({ date: '2026-10-09', time: '09:30' });
  assert.equal(clash.status, 409);
  assert.equal(clash.body.code, 'overlap');
  assert.match(clash.body.error, /Marcus T\. at 10:00 AM/);
  assert.equal(tables.sessions[0].scheduled_at, '2026-10-08T14:00:00+00:00', 'the refused move was stored');
  const nudge = await move({ date: '2026-10-08', time: '10:15' });
  assert.equal(nudge.status, 200, 'a booking does not clash with itself');
  assert.equal(new Date(tables.sessions[0].scheduled_at).toISOString(), '2026-10-08T14:15:00.000Z');
});

test('a coach\'s cancel tells the member; a member\'s own cancel tells nobody', async () => {
  const tables = world({ sessions: [sess('s-1', '2026-10-08T14:00:00+00:00', { client_id: 'member-1' })] });
  const byCoach = await post('manage', '/api/sessions/manage', { action: 'cancel', sessionId: 's-1' }, { tables, user: COACH });
  assert.equal(byCoach.status, 200);
  assert.equal(byCoach.notices.length, 1);
  assert.deepEqual([byCoach.notices[0].userId, byCoach.notices[0].type], ['member-1', 'session_cancelled']);
  const tables2 = world({ sessions: [sess('s-1', '2026-10-08T14:00:00+00:00', { client_id: 'member-1' })] });
  const byMember = await post('manage', '/api/sessions/manage', { action: 'cancel', sessionId: 's-1' }, { tables: tables2, user: MEMBER });
  assert.equal(byMember.status, 200);
  assert.equal(byMember.notices.length, 0);
});

const ask = (body, opts) => post('request', '/api/sessions/request', { providerRole: 'trainer', providerId: 7, scheduledAt: '2026-10-08T14:00:00.000Z', durationMin: 60, ...body }, { user: MEMBER, ...opts });

test('a member\'s request is checked against the coach\'s hours and calendar, written as theirs, and the coach is told', async () => {
  const tables = world();
  const r = await ask({}, { tables });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const ins = r.writes.find((w) => w.op === 'insert');
  assert.equal(ins.by, 'request', 'the row is written through the member\'s own client, so RLS still pins it');
  assert.deepEqual([ins.row.client_id, ins.row.status, ins.row.provider_id, ins.row.scheduled_at, ins.row.duration_min, ins.row.client_name],
    ['member-1', 'requested', 7, '2026-10-08T14:00:00.000Z', 60, 'Priya Shah']);
  assert.equal(r.notices.length, 1, 'the coach was not told');
  assert.deepEqual([r.notices[0].userId, r.notices[0].type], ['coach-1', 'booking_request']);
  assert.match(r.notices[0].body, /Priya Shah requested a session on Thu, Oct 8, 10:00 AM/, 'the coach reads it on THEIR clock');
});

test('a member\'s request outside the hours, across a booking, to someone else\'s coach or unplaceable is refused', async () => {
  const outside = await ask({ scheduledAt: '2026-10-08T07:00:00.000Z' }, { tables: world() });  // 3 AM New York
  assert.equal(outside.status, 409);
  assert.equal(outside.body.code, 'outside_hours');
  const overrun = await ask({ scheduledAt: '2026-10-08T15:30:00.000Z' }, { tables: world() });  // 11:30–12:30
  assert.equal(overrun.body.code, 'outside_hours', 'a session running past close');
  const taken = await ask({}, { tables: world({ sessions: [sess('s-9', '2026-10-08T14:30:00+00:00')] }) });
  assert.equal(taken.status, 409);
  assert.equal(taken.body.code, 'taken');
  assert.doesNotMatch(taken.body.error, /Marcus/, 'another member\'s name reached the member');
  const notMine = await ask({}, { tables: world({ subscriptions: [] }) });
  assert.equal(notMine.status, 403);
  const noZone = await ask({}, { tables: world({ trainers: [{ id: 7, owner_id: 'coach-1', name: 'Coach', timezone: null }] }) });
  assert.equal(noZone.status, 409);
  assert.equal(noZone.body.code, 'nozone');
  const unread = await ask({}, { tables: world(), fail: ['provider_availability'] });
  assert.equal(unread.status, 503);
  const anon = await ask({}, { tables: world(), user: null });
  assert.equal(anon.status, 401);
  const len = await ask({ durationMin: 50 }, { tables: world() });
  assert.equal(len.status, 400);
  const past = await ask({ scheduledAt: '2026-10-07T13:00:00.000Z' }, { tables: world() });
  assert.equal(past.status, 400);
  for (const r of [outside, overrun, taken, notMine, noZone, unread, anon, len, past]) {
    assert.equal(r.writes.filter((w) => w.op === 'insert').length, 0, 'a refused request wrote a row');
    assert.equal(r.notices.length, 0, 'a refused request told the coach');
  }
});

const consult = (body, opts) => post('consult', '/api/consultation', { providerId: 7, professionalType: 'trainer', date: '2026-10-08', time: '9:00 AM', ...body }, { user: MEMBER, ...opts });

test('/api/consultation refuses a time outside the coach\'s open hours — and books one inside them', async () => {
  const inside = await consult({}, { tables: world() });
  assert.equal(inside.status, 200, JSON.stringify(inside.body));
  assert.equal(inside.writes.filter((w) => w.op === 'insert').length, 1);
  const threeAm = await consult({ time: '3:00 AM' }, { tables: world() });
  assert.equal(threeAm.status, 409);
  assert.equal(threeAm.body.code, 'outside_hours');
  assert.match(threeAm.body.error, /outside this coach's open hours/);
  const lastQuarter = await consult({ time: '11:45 AM' }, { tables: world() });
  assert.equal(lastQuarter.status, 200, 'the last quarter-hour before close is inside');
  const atClose = await consult({ time: '12:00 PM' }, { tables: world() });
  assert.equal(atClose.status, 409, 'noon is when Thursday closes');
  const wrongDay = await consult({ date: '2026-10-10', time: '9:00 AM' }, { tables: world() });
  assert.equal(wrongDay.status, 409, 'Saturday has no hours');
  const unread = await consult({}, { tables: world(), fail: ['provider_availability'] });
  assert.equal(unread.status, 503, 'an unreadable pattern vouches for nothing');
  for (const r of [threeAm, atClose, wrongDay, unread]) assert.equal(r.writes.filter((w) => w.op === 'insert').length, 0);
});

test('the new route is on the War Room board', async () => {
  const { loadRealModule } = await import('./helpers/load-real-module.mjs');
  const warroom = await loadRealModule(join(ROOT, 'src/lib/warroom.ts'), {
    typescript: true,
    appendExports: 'export const __RAW_ROUTES = RAW_ROUTES;',
    registry: new Map([
      ['fs/promises', { readdir: async () => [], stat: async () => ({}) }],
      ['fs', { existsSync: () => false }],
      ['path', require('path')],
      ['./funnel.mjs', { buildFunnel: () => ({}) }],
      ['./supabase/admin', { createAdminClient: () => null }],
    ]),
  });
  const hit = warroom.__RAW_ROUTES.filter(([p]) => p === '/api/sessions/request');
  assert.deepEqual(hit, [['/api/sessions/request', 'POST']]);
});

test('every page that runs the Schedule loads the rules module before it', () => {
  // ⚠ THE PAGE READS window.ShapeScheduleRules, and without it the week grid cannot draw —
  // so a host added later without the module would show the "couldn't load" note. Derived from
  // the pages that load dashSchedule.jsx, and asserted non-empty.
  const dir = join(ROOT, 'public/newdesign');
  const hosts = readdirSync(dir).filter((f) => f.endsWith('.html')).map((f) => [f, readFileSync(join(dir, f), 'utf8')]).filter(([, h]) => /src="dashSchedule\.jsx/.test(h));
  assert.ok(hosts.length >= 4, 'the Schedule hosts vanished');
  for (const [f, html] of hosts) {
    const mod = html.search(/import \* as SR from "\/newdesign\/scheduleRules\.mjs[^"]*"; window\.ShapeScheduleRules = SR;/);
    assert.ok(mod >= 0, f + ' runs the Schedule without its rules');
    assert.ok(mod < html.search(/src="dashSchedule\.jsx/), f + ' loads the rules after the page');
  }
});

// ── 3 · the page ─────────────────────────────────────────────────────────────
// Week of Mon Oct 5 – Sun Oct 11 2026; the clock reads Wed Oct 7, 11:00 AM New York.

const ev = (id, date, time, extra = {}) => ({
  id: 'session:' + id, sessionId: id, source: 'session', kind: 'SESSION', title: 'Strength', sub: 'video',
  date, time, durationMin: 60, with: 'Priya S.', clientId: 'member-1', status: 'confirmed', reschedulable: true, editable: false, ...extra,
});
const WEEK = () => [
  ev('s-mon', '2026-10-05', '07:00', { status: 'completed', reschedulable: false, title: 'Lower A' }),
  ev('s-old', '2026-10-05', '09:00', { status: 'requested', with: 'Sam R.', clientId: 'member-4' }),
  ev('s-wed', '2026-10-07', '09:00', { title: 'Tempo run' }),
  ev('s-thu', '2026-10-08', '09:00', { title: 'Upper A' }),
  ev('s-fri', '2026-10-09', '10:00', { with: 'Marcus T.', clientId: 'member-2', meetingUrl: 'https://meet.shape.test/s-fri' }),
  ev('s-req', '2026-10-09', '14:00', { status: 'requested', with: 'Jordan M.', clientId: 'member-3', title: 'Intro session' }),
  { id: 'plan:w1', source: 'plan', kind: 'WORKOUT', title: 'Lower A', sub: 'Assigned workout', date: '2026-10-06', time: null, durationMin: null, with: '', status: 'planned', editable: false },
];
// Mon–Fri 8a–12p, saved in New York.
const HOURS = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start_minute: 480, duration_min: 240 }));
const ROSTER = [
  { client: { profile: { id: 'member-1', name: 'Priya S.' }, program: { name: 'Strength Block 3', week: 6, weeks: 12, status: 'active' }, checkIn: { lastWeekOf: '2026-09-28' }, coachNotes: [{ on: '2026-10-01', text: 'Left knee: no deep lunges' }], trainingAdherence: { done: 9, planned: 12, pct: 75 }, payments: {} } },
  { client: { profile: { id: 'member-2', name: 'Marcus T.' }, payments: {} } },
];

function server({ events = WEEK(), slots = HOURS, zone = NY, answers = {} } = {}) {
  const posts = [];
  const handler = async (u, init) => {
    if (u.pathname === '/api/my-availability') return json(200, { slots, timezone: zone });
    if (u.pathname === '/api/calendar') {
      const from = u.searchParams.get('from'), to = u.searchParams.get('to');
      return json(200, { events: events.filter((e) => e.date >= from && e.date <= to), zone });
    }
    if (u.pathname === '/api/sessions/manage') {
      const body = JSON.parse(init.body);
      posts.push(body);
      const a = answers[body.action];
      if (a) return typeof a === 'function' ? a(body) : a;
      return json(200, { ok: true, meetingUrl: body.action === 'confirm' ? 'https://meet.shape.test/' + body.sessionId : null });
    }
    return json(404, {});
  };
  return { posts, handler };
}
async function open(opts = {}) {
  const srv = server(opts);
  const page = await mountSchedule({ fetch: srv.handler, triage: opts.triage ?? ROSTER, params: opts.params, role: opts.role, narrow: opts.narrow, drawer: opts.drawer, live: opts.live });
  return { page, posts: srv.posts };
}
const block = (page, id) => page.doc.querySelector('[data-dsc-block="session:' + id + '"]');
const colOf = (page, el) => el && el.closest('[data-col-date]').getAttribute('data-col-date');
const px = (v) => Number(String(v).replace('px', ''));
const yOf = (min, startHour = 6) => ((min - startHour * 60) / 60) * 44;

test('the week is a time axis: blocks sized by length, open hours shaded, a now line, requests dashed, untimed on top', async () => {
  const { page } = await open();
  try {
    assert.equal(page.doc.querySelectorAll('[data-col-date]').length, 7, 'the week grid has seven columns');
    const thu = block(page, 's-thu');
    assert.equal(colOf(page, thu), '2026-10-08');
    assert.equal(px(thu.style.top), yOf(540) + 1, 'a 9:00 booking sits at 9:00 on the axis');
    assert.equal(px(thu.style.height), 44 - 2, 'an hour is an hour tall');
    // The gutter runs 6a to 9p.
    const gutter = [...page.doc.querySelectorAll('[data-gutter] span')].filter((s) => /^\d+[ap]$/.test(s.textContent)).map((s) => s.textContent);
    assert.equal(gutter[0], '6a'); assert.equal(gutter[gutter.length - 1], '9p');
    // Open hours: one band per weekday, 8a–12p, none at the weekend.
    const bands = (iso) => [...page.doc.querySelectorAll('[data-col-date="' + iso + '"] [data-open-band]')];
    assert.deepEqual(bands('2026-10-08').map((b) => [px(b.style.top), px(b.style.height)]), [[yOf(480), yOf(720) - yOf(480)]]);
    assert.equal(bands('2026-10-10').length, 0);
    // Now: Wednesday, 11:00 AM on the route's clock.
    const now = page.doc.querySelectorAll('[data-now-line]');
    assert.equal(now.length, 1);
    assert.equal(now[0].closest('[data-col-date]').getAttribute('data-col-date'), '2026-10-07');
    assert.equal(px(now[0].style.top), yOf(660));
    // A request is dashed; a confirmed booking is not.
    assert.match(block(page, 's-req').style.borderTop, /dashed/);
    assert.doesNotMatch(block(page, 's-fri').style.borderTop, /dashed/);
    // The untimed workout rides the all-day row, not the axis.
    assert.match(page.text(), /All day/);
    assert.equal(page.doc.querySelector('[data-dsc-block="plan:w1"]'), null);
    // Load at a glance: Wed, Thu, Fri — one hour each inside 20 open hours; the completed 7:00
    // Monday session is outside the hours and the requests are not booked.
    assert.match(page.doc.querySelector('[data-load]').textContent, /^3 of 20 open hrs booked/);
  } finally { await page.unmount(); }
});

test('the drawn hours widen to an early booking, so nothing is cut off', async () => {
  const { page } = await open({ events: [ev('s-early', '2026-10-08', '05:30')] });
  try {
    const gutter = [...page.doc.querySelectorAll('[data-gutter] span')].filter((s) => /^\d+[ap]$/.test(s.textContent)).map((s) => s.textContent);
    assert.equal(gutter[0], '5a');
    assert.equal(px(block(page, 's-early').style.top), yOf(330, 5) + 1);
  } finally { await page.unmount(); }
});

test('a pointer drag moves a booking to a new TIME on another day, in the route\'s zone', async () => {
  const { page, posts } = await open();
  try {
    page.layout();
    // Thu 9:00 (column 3), taken 10px below its top → Fri (column 4) with its top at 11:00.
    await page.drag(block(page, 's-thu'), [[450, yOf(540) + 10], [452, yOf(540) + 30], [550, 230]]);
    assert.deepEqual(posts, [{ action: 'reschedule', sessionId: 's-thu', date: '2026-10-09', time: '11:00', tz: NY }]);
    assert.equal(colOf(page, block(page, 's-thu')), '2026-10-09', 'the block did not move');
    assert.equal(px(block(page, 's-thu').style.top), yOf(660) + 1);
    assert.match(page.toast(), /Moved Priya S\. to .*11:00 AM · Priya notified/);
  } finally { await page.unmount(); }
});

test('over a clash the drop target is red and says why, and letting go moves nothing', async () => {
  const { page, posts } = await open();
  try {
    page.layout();
    // Thu 9:00 → Fri 10:00, where Marcus is.
    await page.drag(block(page, 's-thu'), [[450, yOf(540) + 10], [452, yOf(540) + 30], [550, 186]], { release: false });
    const target = page.doc.querySelector('[data-drop-target]');
    assert.equal(target.getAttribute('data-drop-target'), 'refused');
    assert.equal(colOf(page, target), '2026-10-09');
    assert.match(page.doc.querySelector('[aria-live="polite"]').textContent, /Overlaps Marcus T\. at 10:00 AM/);
    await page.act(async () => page.dom.window.dispatchEvent(Object.assign(new page.dom.window.MouseEvent('pointerup', { bubbles: true }), { pointerId: 1 })));
    await page.settle();
    assert.deepEqual(posts, []);
    assert.equal(colOf(page, block(page, 's-thu')), '2026-10-08');
    assert.match(page.toast(), /Not moved — that overlaps Marcus T\. at 10:00 AM/);
    assert.equal(page.doc.querySelector('[data-drop-target]'), null, 'the target outlived the drag');
  } finally { await page.unmount(); }
});

test('outside open hours the coach is asked, and only "Move anyway" moves it', async () => {
  const { page, posts } = await open();
  try {
    page.layout();
    // Thu 9:00 → Thu 2:00 PM, after Thursday's hours close at noon.
    await page.drag(block(page, 's-thu'), [[450, yOf(540) + 10], [452, yOf(540) + 30], [450, 362]], { release: false });
    assert.equal(page.doc.querySelector('[data-drop-target]').getAttribute('data-drop-target'), 'outside');
    await page.act(async () => page.dom.window.dispatchEvent(Object.assign(new page.dom.window.MouseEvent('pointerup', { bubbles: true }), { pointerId: 1 })));
    await page.settle();
    assert.deepEqual(posts, [], 'it moved before asking');
    assert.match(page.doc.querySelector('[role=dialog]').textContent, /isn't in the hours you've opened/);
    await page.click(page.button('Keep it'));
    assert.deepEqual(posts, []);
    assert.equal(page.doc.querySelector('[role=dialog]'), null);
    await page.drag(block(page, 's-thu'), [[450, yOf(540) + 10], [452, yOf(540) + 30], [450, 362]]);
    await page.click(page.button('Move anyway'));
    assert.deepEqual(posts, [{ action: 'reschedule', sessionId: 's-thu', date: '2026-10-08', time: '14:00', tz: NY }]);
  } finally { await page.unmount(); }
});

test('the past is refused on the grid, and a refusal from the server is said in its own words', async () => {
  const { page, posts } = await open({ answers: { reschedule: json(409, { error: 'That overlaps Dana K. at 11:00 AM. Nothing was moved.', code: 'overlap' }) } });
  try {
    page.layout();
    // Thu 9:00 → Wed 8:00, three hours ago.
    await page.drag(block(page, 's-thu'), [[450, yOf(540) + 10], [452, yOf(540) + 30], [350, yOf(480) + 10]], { release: false });
    assert.equal(page.doc.querySelector('[data-drop-target]').getAttribute('data-drop-target'), 'refused');
    assert.match(page.doc.querySelector('[aria-live="polite"]').textContent, /passed/);
    await page.act(async () => page.dom.window.dispatchEvent(Object.assign(new page.dom.window.MouseEvent('pointerup', { bubbles: true }), { pointerId: 1 })));
    await page.settle();
    assert.deepEqual(posts, []);
    // A clash the grid cannot see (a booking in a month not loaded): the server's 409 decides,
    // the block goes back, and its sentence is what the coach reads.
    await page.drag(block(page, 's-thu'), [[450, yOf(540) + 10], [452, yOf(540) + 30], [450, 230]]);
    assert.equal(posts.length, 1);
    assert.match(page.toast(), /That overlaps Dana K\. at 11:00 AM/);
    assert.equal(px(block(page, 's-thu').style.top), yOf(540) + 1, 'the refused move was not reverted');
  } finally { await page.unmount(); }
});

test('a click (no drag) on a booking opens its sheet; Escape mid-drag drops nothing', async () => {
  const { page, posts } = await open();
  try {
    page.layout();
    await page.drag(block(page, 's-thu'), [[450, yOf(540) + 10], [452, yOf(540) + 30], [450, 230]], { release: false });
    await page.key('Escape');
    assert.equal(page.doc.querySelector('[data-drop-target]'), null);
    await page.act(async () => page.dom.window.dispatchEvent(Object.assign(new page.dom.window.MouseEvent('pointerup', { bubbles: true }), { pointerId: 1 })));
    assert.deepEqual(posts, [], 'a cancelled drag still moved');
    await page.click(block(page, 's-thu'));
    assert.match(page.doc.querySelector('[role=dialog]').textContent, /Upper A/);
  } finally { await page.unmount(); }
});

test('requests wait in a strip — upcoming only — and Accept, Decline and Other time answer them', async () => {
  const { page, posts } = await open();
  try {
    const strip = page.doc.querySelector('[aria-label="Requests to confirm"]');
    assert.ok(strip);
    assert.match(strip.textContent, /^1 to confirm/, 'a request in the past is still asking');
    assert.match(strip.textContent, /Jordan M\..*2:00 PM/);
    await page.click(page.buttonMatching(/^Accept$/, strip));
    assert.deepEqual(posts, [{ action: 'confirm', sessionId: 's-req' }]);
    assert.equal(page.doc.querySelector('[aria-label="Requests to confirm"]'), null, 'the accepted request is still in the strip');
    assert.doesNotMatch(block(page, 's-req').style.borderTop, /dashed/, 'an accepted booking still reads as a request');
  } finally { await page.unmount(); }
  const second = await open();
  try {
    const strip = second.page.doc.querySelector('[aria-label="Requests to confirm"]');
    await second.page.click(second.page.buttonMatching(/^Other time$/, strip));
    assert.match(second.page.doc.querySelector('[role=dialog]').textContent, /Offer another time/);
    await second.page.click(second.page.button('Close'));
    await second.page.click(second.page.buttonMatching(/^Decline$/, second.page.doc.querySelector('[aria-label="Requests to confirm"]')));
    assert.deepEqual(second.posts, [{ action: 'decline', sessionId: 's-req' }]);
    assert.equal(block(second.page, 's-req'), null, 'a declined request is still on the grid');
  } finally { await second.page.unmount(); }
});

test('the booking sheet: status, where, real actions, and the client\'s prep from data on the page', async () => {
  const opened = [];
  const Drawer = ({ row }) => { opened.push(row.client.profile.id); return null; };
  const { page, posts } = await open({ drawer: Drawer });
  try {
    await page.click(block(page, 's-thu'));
    const dlg = () => page.doc.querySelector('[role=dialog]');
    const t = dlg().textContent;
    assert.match(t, /Thu, Oct 8 · 9:00 AM–10:00 AM/);
    assert.match(t, /Video · no room yet/);
    assert.match(t, /Confirmed/);
    // Prep — the last session from the loaded calendar (Wednesday's, which has started), never
    // the roster's newest booking; then the roster record's own fields.
    assert.match(t, /Last session.*Wed, Oct 7 · Tempo run/);
    assert.match(t, /Attendance9 of 12 sessions done · 42 days/);
    assert.match(t, /ProgramStrength Block 3 · week 6 of 12/);
    assert.match(t, /Check-inDue this week · last was week of Mon, Sep 28/);
    assert.match(t, /Your noteLeft knee: no deep lunges/);
    assert.doesNotMatch(t, /No-show/, 'no-show has no status to be stored in');
    // Done is offered once a session has started — Thursday's has not.
    assert.equal(page.buttonMatching(/Mark done/, dlg()).disabled, true);
    await page.click(page.buttonMatching(/Open client file/, dlg()));
    assert.deepEqual(opened.slice(-1), ['member-1']);
    // Cancel asks, then cancels.
    await page.click(block(page, 's-thu'));
    await page.click(page.buttonMatching(/^Cancel$/, dlg()));
    assert.match(dlg().textContent, /Cancel this session\? Priya is told\./);
    await page.click(page.buttonMatching(/Yes, cancel it/, dlg()));
    assert.deepEqual(posts, [{ action: 'cancel', sessionId: 's-thu' }]);
    assert.equal(block(page, 's-thu'), null);
    // Wednesday's has started: Mark done is live.
    await page.click(block(page, 's-wed'));
    await page.click(page.buttonMatching(/Mark done/, dlg()));
    assert.deepEqual(posts.slice(-1), [{ action: 'complete', sessionId: 's-wed' }]);
    assert.match(block(page, 's-wed').textContent, /^✓ /);
    // A room is Join.
    await page.click(block(page, 's-fri'));
    assert.equal(page.doc.querySelector('[role=dialog] a').getAttribute('href'), 'https://meet.shape.test/s-fri');
  } finally { await page.unmount(); }
});

test('the sheet reschedules with a date and a time, judged before it is sent', async () => {
  const { page, posts } = await open();
  try {
    await page.click(block(page, 's-thu'));
    const dlg = () => page.doc.querySelector('[role=dialog]');
    await page.click(page.buttonMatching(/^Reschedule$/, dlg()));
    const setSelect = async (sel, v) => { sel.value = String(v); await page.act(async () => sel.dispatchEvent(new page.dom.window.Event('change', { bubbles: true }))); };
    const setDate = async (input, v) => {
      const proto = Object.getOwnPropertyDescriptor(page.dom.window.HTMLInputElement.prototype, 'value');
      proto.set.call(input, v);
      await page.act(async () => input.dispatchEvent(new page.dom.window.Event('input', { bubbles: true })));
    };
    await setDate(dlg().querySelector('input[type=date]'), '2026-10-09');
    await setSelect(dlg().querySelector('select[aria-label="New time"]'), 600);
    assert.match(dlg().textContent, /Overlaps Marcus T\. at 10:00 AM\./);
    assert.equal(page.buttonMatching(/^Move/, dlg()).disabled, true, 'a clash can be sent');
    await setSelect(dlg().querySelector('select[aria-label="New time"]'), 660);
    await page.click(page.buttonMatching(/^Move/, dlg()));
    assert.deepEqual(posts, [{ action: 'reschedule', sessionId: 's-thu', date: '2026-10-09', time: '11:00', tz: NY }]);
  } finally { await page.unmount(); }
});

test('a click on empty time offers "+ Book", and the sheet books a roster client through create', async () => {
  const { page, posts } = await open({ answers: { create: (b) => json(200, { ok: true, session: { id: 's-new', scheduled_at: '2026-10-08T15:00:00Z' }, meetingUrl: null, clientName: 'Marcus T.' }) } });
  try {
    page.layout();
    const thu = page.doc.querySelector('[data-col-date="2026-10-08"]');
    await page.clickAt(thu, 350, yOf(660) + 5);   // 7 minutes into the 11:00 quarter-hour
    const ghost = page.doc.querySelector('[data-dsc-ghost]');
    assert.equal(ghost.textContent, '+ Book 11:00 AM');
    assert.equal(colOf(page, ghost), '2026-10-08');
    await page.click(ghost);
    const dlg = () => page.doc.querySelector('[role=dialog]');
    assert.match(dlg().textContent, /Thursday, Oct 8 · 11:00 AM/);
    assert.equal(page.buttonMatching(/^Book/, dlg()).disabled, true, 'it books with no client picked');
    // The trainer's default is the hour; video unless told otherwise.
    assert.equal(page.buttonMatching(/^60 min$/, dlg()).getAttribute('aria-pressed'), 'true');
    const sel = dlg().querySelector('select[aria-label=Client]');
    sel.value = 'member-2';
    await page.act(async () => sel.dispatchEvent(new page.dom.window.Event('change', { bubbles: true })));
    await page.click(page.buttonMatching(/^In person$/, dlg()));
    await page.click(page.buttonMatching(/^Book · Marcus is told$/, dlg()));
    assert.deepEqual(posts, [{ action: 'create', role: 'trainer', clientId: 'member-2', date: '2026-10-08', time: '11:00', tz: NY, durationMin: 60, type: 'inperson' }]);
    assert.equal(page.doc.querySelector('[role=dialog]'), null);
    assert.equal(colOf(page, block(page, 's-new')), '2026-10-08');
    assert.equal(px(block(page, 's-new').style.top), yOf(660) + 1);
    assert.match(page.toast(), /Booked Marcus T\./);
  } finally { await page.unmount(); }
});

test('the book sheet refuses a clash before sending, and shows the server\'s refusal in place', async () => {
  const { page, posts } = await open({ answers: { create: json(409, { error: 'That overlaps Dana K. at 11:00 AM. Pick another time.', code: 'overlap' }) } });
  try {
    page.layout();
    const thu = page.doc.querySelector('[data-col-date="2026-10-08"]');
    await page.clickAt(thu, 350, yOf(570) + 5);   // 9:30, inside Priya's 9:00 session
    await page.click(page.doc.querySelector('[data-dsc-ghost]'));
    const dlg = () => page.doc.querySelector('[role=dialog]');
    const sel = dlg().querySelector('select[aria-label=Client]');
    sel.value = 'member-2';
    await page.act(async () => sel.dispatchEvent(new page.dom.window.Event('change', { bubbles: true })));
    assert.match(dlg().textContent, /Overlaps Priya S\. at 9:00 AM\./);
    assert.equal(page.buttonMatching(/^Book/, dlg()).disabled, true);
    const t = dlg().querySelector('select[aria-label=Start]');
    t.value = '660';
    await page.act(async () => t.dispatchEvent(new page.dom.window.Event('change', { bubbles: true })));
    await page.click(page.buttonMatching(/^Book/, dlg()));
    assert.equal(posts.length, 1);
    assert.match(dlg().textContent, /That overlaps Dana K\. at 11:00 AM/, 'the refusal closed the sheet or went unsaid');
    // A past slot is not offered at all.
    await page.click(page.button('Cancel'));
    await page.clickAt(page.doc.querySelector('[data-col-date="2026-10-06"]'), 150, yOf(600));
    assert.equal(page.doc.querySelector('[data-dsc-ghost]'), null);
  } finally { await page.unmount(); }
});

test('a manual calendar note is the coach\'s own: no verdict over a session, and it moves by PATCH with its time', async () => {
  const note = { id: 'e-1', source: 'event', kind: 'ADMIN', title: 'Admin block', sub: '', date: '2026-10-08', time: '13:00', durationMin: 60, with: '', status: 'planned', editable: true };
  const patches = [];
  const srv = server({ events: [...WEEK(), note] });
  const page = await mountSchedule({ triage: ROSTER, fetch: async (u, init) => {
    if (u.pathname === '/api/calendar' && init.method === 'PATCH') { patches.push(JSON.parse(init.body)); return json(200, { event: {} }); }
    return srv.handler(u, init);
  } });
  try {
    page.layout();
    const el = page.doc.querySelector('[data-dsc-block="e-1"]');
    // Thu 1:00 PM → Fri 10:00, on top of Marcus's session.
    await page.drag(el, [[450, yOf(780) + 10], [452, yOf(780) + 30], [550, 186]], { release: false });
    assert.equal(page.doc.querySelector('[data-drop-target]').getAttribute('data-drop-target'), 'ok', 'a note over a session read as a clash');
    await page.act(async () => page.dom.window.dispatchEvent(Object.assign(new page.dom.window.MouseEvent('pointerup', { bubbles: true }), { pointerId: 1 })));
    await page.settle();
    assert.deepEqual(patches, [{ id: 'e-1', date: '2026-10-09', time: '10:00' }]);
    assert.deepEqual(srv.posts, [], 'a note went through the session route');
  } finally { await page.unmount(); }
});

test('the toolbar\'s "+ Book" opens the book sheet at the next open time — the keyboard\'s way in', async () => {
  const { page } = await open();
  try {
    // Wednesday, 11:00 AM: the next quarter-hour after now, inside the day's hours.
    await page.click(page.button('+ Book'));
    assert.match(page.doc.querySelector('[role=dialog]').textContent, /Wednesday, Oct 7 · 11:15 AM/);
    await page.click(page.button('Cancel'));
    // On a later day it starts at that day's first open hour.
    await page.click(page.button('Next'));
    await page.click(page.button('+ Book'));
    assert.match(page.doc.querySelector('[role=dialog]').textContent, /Wednesday, Oct 14 · 8:00 AM/);
  } finally { await page.unmount(); }
});

test('a nutritionist books the 15-minute consult by default', async () => {
  const { page } = await open({ role: 'nutritionist' });
  try {
    page.layout();
    await page.clickAt(page.doc.querySelector('[data-col-date="2026-10-08"]'), 350, yOf(660) + 5);
    await page.click(page.doc.querySelector('[data-dsc-ghost]'));
    assert.equal(page.buttonMatching(/^15 min$/, page.doc.querySelector('[role=dialog]')).getAttribute('aria-pressed'), 'true');
  } finally { await page.unmount(); }
});

test('client chips filter the grid, ?client= lands filtered, and clashes still see every booking', async () => {
  const { page } = await open();
  try {
    const chips = page.doc.querySelector('[aria-label="Show clients"]');
    assert.ok(chips);
    await page.click(page.buttonMatching(/Marcus T\./, chips));
    assert.ok(block(page, 's-fri'));
    assert.equal(block(page, 's-thu'), null, 'the chip did not filter');
    await page.click(page.button('Show all'));
    assert.ok(block(page, 's-thu'));
  } finally { await page.unmount(); }
  const linked = await open({ params: { client: 'member-2' } });
  try {
    assert.ok(block(linked.page, 's-fri'));
    assert.equal(block(linked.page, 's-thu'), null, '?client= no longer filters');
    // Priya is hidden, but her Thursday hour is still taken.
    linked.page.layout();
    await linked.page.clickAt(linked.page.doc.querySelector('[data-col-date="2026-10-08"]'), 350, yOf(570) + 5);
    await linked.page.click(linked.page.doc.querySelector('[data-dsc-ghost]'));
    assert.match(linked.page.doc.querySelector('[role=dialog]').textContent, /Overlaps Priya S\. at 9:00 AM/);
  } finally { await linked.page.unmount(); }
});

test('Day view is one column plus the day\'s agenda; a ?date= link opens it without changing the remembered view', async () => {
  const { page } = await open({ params: { date: '2026-10-09' } });
  try {
    assert.equal(page.button('Day').getAttribute('aria-pressed'), 'true');
    assert.deepEqual([...page.doc.querySelectorAll('[data-col-date]')].map((c) => c.getAttribute('data-col-date')), ['2026-10-09']);
    // Friday: Marcus (confirmed, 10–11) inside 4 open hours; Jordan's request is listed but not booked.
    assert.match(page.text(), /2 sessions · 3 h free/);
    const agenda = [...page.doc.querySelectorAll('[data-agenda]')].map((a) => a.getAttribute('data-agenda'));
    assert.deepEqual(agenda, ['session:s-fri', 'session:s-req']);
    assert.deepEqual(page.remembered, [], 'a linked day wrote a remembered view');
    await page.click(page.button('›'));
    assert.deepEqual([...page.doc.querySelectorAll('[data-col-date]')].map((c) => c.getAttribute('data-col-date')), ['2026-10-10'], 'the day view steps a day');
    await page.click(page.button('Week'));
    assert.deepEqual(page.remembered.map(([k, v]) => [k, v]), [['scheduleView', 'week']]);
    assert.deepEqual(page.remembered[0][2], ['day', 'week', 'month'], 'the remembered choice does not allow the views it renders');
    assert.equal(page.doc.querySelectorAll('[data-col-date]').length, 7);
  } finally { await page.unmount(); }
});

test('under 760px the week is the day view with a strip of the week\'s days', async () => {
  const { page } = await open({ narrow: true });
  try {
    assert.equal(page.button('Week').getAttribute('aria-pressed'), 'true');
    assert.deepEqual([...page.doc.querySelectorAll('[data-col-date]')].map((c) => c.getAttribute('data-col-date')), ['2026-10-07']);
    const strip = page.doc.querySelector('[data-day-strip]');
    assert.equal(strip.querySelectorAll('button').length, 7);
    assert.equal(strip.style.display, 'flex', 'a seven-column grid here is collapsed by the phone stylesheet');
    await page.click([...strip.querySelectorAll('button')][4]);
    assert.deepEqual([...page.doc.querySelectorAll('[data-col-date]')].map((c) => c.getAttribute('data-col-date')), ['2026-10-09']);
    assert.ok(block(page, 's-fri'));
  } finally { await page.unmount(); }
});

test('open hours saved in another zone are not shaded, and the page says so', async () => {
  const srv = server({ zone: NY });
  const page = await mountSchedule({
    triage: ROSTER,
    fetch: async (u, init) => (u.pathname === '/api/my-availability' ? json(200, { slots: HOURS, timezone: 'Europe/London' }) : srv.handler(u, init)),
  });
  try {
    assert.equal(page.doc.querySelectorAll('[data-open-band]').length, 0);
    assert.match(page.text(), /Open hours aren't shaded — they're saved in Europe\/London/);
    assert.equal(page.doc.querySelector('[data-load]'), null, 'a load against unplaced hours');
  } finally { await page.unmount(); }
});

test('the grid draws only with its rules, and the week toggle is derived from them', () => {
  // The page reads every rule from the module; a copy inlined here would be a second rule.
  for (const fn of ['clashIn', 'fitsOpenHours', 'openBlocks', 'layoutLanes', 'hourRange', 'pointToSlot', 'dayLoad']) {
    assert.ok(new RegExp('\\b(R|rules)\\.' + fn + '\\(').test(SCHEDULE_SRC), 'the page no longer uses the shared ' + fn);
    assert.doesNotMatch(SCHEDULE_SRC, new RegExp('function ' + fn + '\\('), 'the page carries its own ' + fn);
  }
});
