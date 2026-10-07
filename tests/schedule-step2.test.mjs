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

test('isOfferedStart is bookingSlots.js expand(), row by row: every minute of every weekday answers the same', () => {
  // ⚠ CONTAINMENT IS NOT THE OFFER (Codex, the review of #2228). Inside a 9:00–11:00 row the page
  // offers 9:00 and 10:00; fitsOpenHours alone also took a crafted 9:15. So the member routes ask
  // this too, and this has to be EXACTLY the page's expansion — stricter would refuse a time the
  // member was shown. Checked against expand() itself, over every minute, not a few examples.
  const pattern = [
    { weekday: 1, start_minute: 360, duration_min: 240 }, { weekday: 1, start_minute: 615, duration_min: 90 },
    { weekday: 3, start_minute: 1020, duration_min: 30 }, { weekday: 4, start_minute: 540, duration_min: 180 },
    { weekday: 5, start_minute: 1410, duration_min: 120 }, { weekday: 6, start_minute: 45, duration_min: 61 },
  ];
  let offered = 0;
  for (const sessionMin of [15, 60]) {
    for (let wd = 0; wd < 7; wd++) {
      const starts = new Set(pattern.filter((s) => s.weekday === wd).flatMap((s) => B._internals.expand(s, sessionMin)));
      for (let m = 0; m < 1440; m++) {
        assert.equal(R.isOfferedStart(pattern, wd, m, sessionMin), starts.has(m), `weekday ${wd} minute ${m} (${sessionMin} min)`);
        if (starts.has(m)) offered++;
      }
    }
  }
  assert.ok(offered > 20, 'the sweep found too few offered starts: ' + offered);
  assert.equal(R.isOfferedStart(pattern, 4, 555, 60), false, 'the 9:15 Codex named');
  assert.equal(R.isOfferedStart(pattern, 4, 600, 60), true);
  assert.equal(R.isOfferedStart(pattern, null, 540, 60), false);
  assert.equal(R.isOfferedStart(pattern, 4, 540, 0), false);
});

test('the request route books only the Team page\'s own length', () => {
  const page = readFileSync(join(ROOT, 'public/newdesign/clientTeam.jsx'), 'utf8').match(/const CT_SESSION_MIN = (\d+);/);
  const route = readFileSync(join(ROOT, 'src/app/api/sessions/request/route.ts'), 'utf8').match(/const SESSION_MIN = (\d+);/);
  assert.ok(page && route, 'a constant moved');
  assert.equal(route[1], page[1], 'the route refuses the length the Team page sends');
});

test('sessions_no_overlap: the database refuses an overlap between active bookings, by the same rule the routes read', async () => {
  // ⚠ THE READ IS NOT THE GUARD AGAINST A RACE (Codex, P1 on #2228): two overlapping writes sent
  // together both pass findSessionClash. Exercised against Postgres 16 when written (a second
  // concurrent overlapping insert waited for the first, then failed with 23P01); pinned here by
  // what it says, because the suite has no database.
  const sql = readFileSync(join(ROOT, 'supabase-migrations/2026-10-07-sessions-no-overlap.sql'), 'utf8');
  const body = sql.replace(/--.*$/gm, '');
  assert.match(body, /create extension if not exists btree_gist/);
  assert.match(body, /add constraint sessions_no_overlap\s+exclude using gist \(\s*provider_role with =,\s*provider_id with =,\s*public\.session_span\(scheduled_at, duration_min\) with &&\s*\)/);
  assert.match(body, /'\[\)'/, 'half-open, so back to back is not a clash (clashIn\'s rule)');
  assert.match(body, /\bimmutable\b/);
  const where = body.match(/where \(status in \(([^)]*)\)\)/);
  assert.ok(where, 'the constraint covers only bookings that hold time');
  assert.deepEqual(where[1].split(',').map((x) => x.trim().replace(/'/g, '')), R.ACTIVE_STATUSES);
  assert.match(body, /if not exists \(\s*select 1 from pg_constraint\s+where conname = 'sessions_no_overlap'/, 'safe to re-run');

  const { loadRealModule } = await import('./helpers/load-real-module.mjs');
  const booking = await loadRealModule(join(ROOT, 'src/lib/session-booking.ts'), { typescript: true, registry: new Map([['@supabase/supabase-js', {}], ['@/lib/owned-provider', { isMissingRelation: () => false }]]) });
  assert.equal(booking.isDoubleBookError({ code: '23P01' }), true, 'the overlap constraint');
  assert.equal(booking.isDoubleBookError({ code: '23505' }), true, 'the identical-start index');
  for (const e of [{ code: '42501' }, { code: '23503' }, null, undefined, 'x', {}]) assert.equal(booking.isDoubleBookError(e), false, JSON.stringify(e));
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
function db(tables, { label, insertError = null, updateError = null, fail = [], rlsUser = null } = {}) {
  // ⚠ THE REQUEST CLIENT READS `sessions` THROUGH ITS POLICY (read_own_sessions: your own, or
  // ones booked against a provider row you own). Without it a member's client would see the
  // coach's whole calendar here, and a route that checked a clash through the wrong client
  // would pass.
  const owns = (r) => [...(tables.trainers || []), ...(tables.nutritionists || [])]
    .some((p) => p.owner_id === rlsUser && p.id === r.provider_id);
  const view = rlsUser == null ? tables : new Proxy(tables, {
    get: (t, k) => (k === 'sessions' ? (t.sessions || []).filter((r) => r.client_id === rlsUser || owns(r)) : t[k]),
  });
  const base = fakeSupabase({
    tables: view, fail,
    rpcs: {
      get_display_names: ({ p_ids }) => p_ids.map((id) => ({ user_id: id, full_name: (tables.names || {})[id] || null })),
      // provider_busy_blocks as the migration writes it: time off, and active sessions, in the window.
      provider_busy_blocks: ({ p_role, p_provider_id, p_from, p_to }) => {
        const [from, to] = [Date.parse(p_from), Date.parse(p_to)];
        const mine = (r) => r.provider_role === p_role && r.provider_id === p_provider_id;
        const off = (tables.provider_time_off || []).filter((o) => mine(o) && Date.parse(o.starts_at) < to && Date.parse(o.ends_at) > from)
          .map((o) => ({ starts_at: o.starts_at, ends_at: o.ends_at, kind: 'time_off' }));
        const ses = (tables.sessions || []).filter((r) => mine(r) && ['requested', 'confirmed'].includes(r.status))
          .map((r) => ({ starts_at: r.scheduled_at, ends_at: new Date(Date.parse(r.scheduled_at) + (r.duration_min || 15) * 60000).toISOString(), kind: 'session' }))
          .filter((b) => Date.parse(b.starts_at) < to && Date.parse(b.ends_at) > from);
        return [...off, ...ses];
      },
    },
  });
  let n = 0;
  const writes = tables.__writes || (tables.__writes = []);
  return {
    ...base,
    auth: { admin: { getUserById: async (id) => ({ data: { user: { id, email: (tables.emails || {})[id] || null } } }) } },
    // move_session_run as 2026-10-07-session-series.sql writes it: the moves in the order given,
    // in ONE transaction, so any refusal (`updateError`, asked per move as a single update is, or
    // a row that is gone or not active) rolls back every move before it.
    async rpc(name, args) {
      if (name !== 'move_session_run') return base.rpc(name, args);
      const done = [];
      for (const m of args.p_moves) {
        const rows = ((rlsUser == null ? tables : view).sessions || []).filter((r) => r.id === m.id && ['requested', 'confirmed'].includes(r.status));
        const refused = (typeof updateError === 'function' ? updateError({ scheduled_at: m.at }, rows) : updateError)
          || (rows.length !== 1 ? { code: 'P0002', message: `session ${m.id} could not be moved` } : null);
        if (refused) {
          for (const [r, at] of done.reverse()) r.scheduled_at = at;
          return { data: null, error: refused };
        }
        done.push([rows[0], rows[0].scheduled_at]);
        rows[0].scheduled_at = m.at;
      }
      writes.push({ by: label, table: 'sessions', op: 'rpc', rpc: name, moves: args.p_moves });
      return { data: args.p_moves.length, error: null };
    },
    from(table) {
      const chain = base.from(table);
      // A run is one insert of many rows (recurring sessions): an array writes all or nothing, as
      // PostgREST's does. `insertError` may be a function of what is being written, so a test can
      // refuse the run's bulk write and one of its single ones.
      chain.insert = (row) => {
        const many = Array.isArray(row);
        const ins = {
          select() { return ins; }, single() { return ins; },
          then(res, rej) {
            const refused = typeof insertError === 'function' ? insertError(row) : insertError;
            if (refused) return Promise.resolve({ data: null, error: refused }).then(res, rej);
            const stored = (many ? row : [row]).map((r) => ({ id: r.id || 'gen-' + (++n), ...r }));
            for (const st of stored) {
              (tables[table] = tables[table] || []).push(st);
              writes.push({ by: label, table, op: 'insert', row: st });
            }
            return Promise.resolve({ data: many ? stored : stored[0], error: null }).then(res, rej);
          },
        };
        return ins;
      };
      chain.update = (patch) => {
        const filters = [];
        const upd = {
          eq(col, v) { filters.push((r) => r[col] === v); return upd; },
          in(col, vs) { filters.push((r) => vs.includes(r[col])); return upd; },
          select() { return upd; }, maybeSingle() { return upd; },
          then(res, rej) {
            const rows = (tables[table] || []).filter((r) => filters.every((f) => f(r)));
            // The database refusing the write (the overlap constraint): nothing changes. A function
            // decides per write (a run's move refused part-way).
            const refused = typeof updateError === 'function' ? updateError(patch, rows) : updateError;
            if (refused) return Promise.resolve({ data: null, error: refused }).then(res, rej);
            for (const r of rows) Object.assign(r, patch);
            writes.push({ by: label, table, op: 'update', patch, ids: rows.map((r) => r.id) });
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
  const owned = await lib('owned-provider.ts', [['@/lib/time', time], ['@supabase/supabase-js', {}]]);
  const booking = await lib('session-booking.ts', [['@supabase/supabase-js', {}], ['@/lib/owned-provider', owned]]);
  const series = await lib('session-series.ts', [['@supabase/supabase-js', {}], ['@/lib/time', time]]);
  const guards = await import(pathToFileURL(join(ROOT, 'src/lib/access-guards.mjs')).href);
  const state = { client: null, admin: null, user: null, notices: [], mails: [] };
  const registry = () => new Map([
    ['next/server', nextServer],
    ['@/lib/time', time],
    ['@/lib/request-utils', requestUtils],
    ['@/lib/access-guards.mjs', guards],
    ['@/lib/session-booking', booking],
    ['@/lib/session-series', series],
    ['@/lib/request-auth', { clientForRequest: async () => state.client, currentUser: async () => state.user }],
    ['@/lib/supabase/admin', { createAdminClient: () => state.admin }],
    ['@/lib/video', { videoRoomUrl: (id) => 'https://meet.shape.test/' + id }],
    ['@/lib/notify', { createNotification: async (_c, n) => { state.notices.push(n); return true; } }],
    ['@/lib/capacity', { isEffectivelyAtCapacity: () => false }],
    ['@/lib/email', { buildIcs: () => 'ICS', sendEmail: async (m) => { state.mails.push(m); return { ok: true }; } }],
    // The captcha passes unless a test turns it off (`captcha: false`), the website form's
    // case with no token once TURNSTILE_SECRET_KEY is set.
    ['@/lib/turnstile', { verifyTurnstile: async () => state.captcha !== false }],
    ['@/lib/require-membership', { requireMembership: async () => null }],
    ['@supabase/supabase-js', {}],
  ]);
  const load = (p) => loadRealModule(join(ROOT, 'src/app/api', p), { typescript: true, registry: registry() });
  const [manage, request, consult, calendar] = await Promise.all([load('sessions/manage/route.ts'), load('sessions/request/route.ts'), load('consultation/route.ts'), load('calendar/route.ts')]);
  loaded = { manage, request, consult, calendar, state, series };
  return loaded;
}
async function post(mod, path, body, { tables, user, insertError, updateError, fail, headers = {}, captcha = true } = {}) {
  const m = await routes();
  m.state.captcha = captcha;
  // ⚠ BOTH CLIENTS REFUSE THE INSERT: a member's request is written through their own client.
  m.state.client = db(tables, { label: 'request', insertError, updateError, fail, rlsUser: user ? user.id : null });
  m.state.admin = db(tables, { label: 'service', insertError, fail });
  m.state.user = user;
  m.state.notices.length = 0;
  const res = await atNow(() => m[mod].POST(new Request('https://shape.test' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
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
  // ⚠ THE RACE THE READ CANNOT SEE: an overlapping booking committed between the clash read and
  // this write, and sessions_no_overlap refused it (23P01). The same sentence, not a 500.
  const raced = await create({}, { tables: world(), insertError: { code: '23P01', message: 'conflicting key value violates exclusion constraint "sessions_no_overlap"' } });
  assert.equal(raced.status, 409, JSON.stringify(raced.body));
  assert.equal(raced.body.code, 'taken');
  assert.equal(raced.notices.length, 0);
});

test('a reschedule that loses the race to the overlap constraint moves nothing and tells nobody', async () => {
  const tables = world({ sessions: [sess('s-1', '2026-10-08T14:00:00+00:00', { client_id: 'member-1' })] });
  const r = await post('manage', '/api/sessions/manage', { action: 'reschedule', sessionId: 's-1', tz: NY, date: '2026-10-09', time: '10:00' },
    { tables, user: COACH, updateError: { code: '23P01', message: 'conflicting key value violates exclusion constraint "sessions_no_overlap"' } });
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal(r.body.code, 'taken');
  assert.match(r.body.error, /Nothing was moved/);
  assert.equal(r.notices.length, 0, 'a move that was not written was announced');
  const other = await post('manage', '/api/sessions/manage', { action: 'reschedule', sessionId: 's-1', tz: NY, date: '2026-10-09', time: '10:00' },
    { tables, user: COACH, updateError: { code: '42501', message: 'permission denied' } });
  assert.equal(other.status, 500, 'any other write failure is still a failure, not "taken"');
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
  // ⚠ ONLY WHAT THE TEAM PAGE OFFERED (Codex, the review of #2228): its hour, at one of the
  // starts it lays out. 90 minutes and a 9:15 start both sit inside Thursday's 9–12 hours.
  const longer = await ask({ durationMin: 90 }, { tables: world() });
  assert.equal(longer.status, 400, 'a length the page never offers');
  const offGrid = await ask({ scheduledAt: '2026-10-08T13:15:00.000Z' }, { tables: world() });  // 9:15 New York
  assert.equal(offGrid.status, 409, 'a 9:15 start the page never offered');
  assert.equal(offGrid.body.code, 'outside_hours');
  const past = await ask({ scheduledAt: '2026-10-07T13:00:00.000Z' }, { tables: world() });
  assert.equal(past.status, 400);
  for (const r of [outside, overrun, taken, notMine, noZone, unread, anon, len, longer, offGrid, past]) {
    assert.equal(r.writes.filter((w) => w.op === 'insert').length, 0, 'a refused request wrote a row');
    assert.equal(r.notices.length, 0, 'a refused request told the coach');
  }
});

// ── Step 3: the coach's own rules ─────────────────────────────────────────────
// Thursday Oct 8, open 9a–12p New York (13:00Z–16:00Z); the clock reads Wed Oct 7, 11:00 AM.
const rulesRow = (r) => ({ provider_role: 'trainer', provider_id: 7, buffer_min: 0, max_per_day: null, min_notice_hours: 0, ...r });
test('step 3: a member\'s request keeps the coach\'s time off, buffer, daily limit and notice — refused with the reason, and nothing written', async () => {
  const cases = [
    ['time_off', { provider_time_off: [{ provider_role: 'trainer', provider_id: 7, starts_at: '2026-10-08T13:00:00Z', ends_at: '2026-10-08T16:00:00Z' }] }, {}, /away then/],
    // A session 11:00–12:00; the 10:00 hour ends where it starts, so only the 30-minute buffer refuses it.
    ['buffer', { sessions: [sess('s-9', '2026-10-08T15:00:00+00:00')], provider_booking_rules: [rulesRow({ buffer_min: 30 })] }, {}, /too close/],
    ['daily_limit', { sessions: [sess('s-9', '2026-10-08T13:00:00+00:00')], provider_booking_rules: [rulesRow({ max_per_day: 1 })] }, { scheduledAt: '2026-10-08T15:00:00.000Z' }, /fully booked/],
    ['notice', { provider_booking_rules: [rulesRow({ min_notice_hours: 48 })] }, {}, /at least 2 days/],
  ];
  for (const [reason, extra, body, said] of cases) {
    const r = await ask(body, { tables: world(extra) });
    assert.equal(r.status, 409, reason + ': ' + JSON.stringify(r.body));
    assert.equal(r.body.code, reason);
    assert.match(r.body.error, said, reason);
    assert.doesNotMatch(r.body.error, /Marcus/, 'another member\'s name reached the member');
    assert.equal(r.writes.filter((w) => w.op === 'insert').length, 0, reason + ' wrote a row');
    assert.equal(r.notices.length, 0, reason + ' told the coach');
  }
  // The same calendar with no rules and no time off books.
  const fine = await ask({}, { tables: world({ sessions: [sess('s-9', '2026-10-08T15:00:00+00:00')], provider_booking_rules: [rulesRow({ buffer_min: 0 })] }) });
  assert.equal(fine.status, 200, JSON.stringify(fine.body));
});

test('the database\'s refusal of a racing request reaches the member as the rule, not a 500', async () => {
  // Two requests sent together both pass checkBookingRules; the trigger refuses the second.
  const r = await ask({}, { tables: world(), insertError: { code: 'P0001', message: 'booking_rule:daily_limit' } });
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal(r.body.code, 'daily_limit');
  assert.equal(r.body.error, 'This coach is fully booked that day.');
  assert.equal(r.notices.length, 0, 'a request that was not written told the coach');
  const c = await consult({ time: '10:00 AM' }, { tables: world(), insertError: { code: 'P0001', message: 'booking_rule:buffer' } });
  assert.equal(c.status, 409, JSON.stringify(c.body));
  assert.equal(c.body.code, 'buffer');
});

test('step 3: a calendar whose rules or busy time cannot be read books nothing', async () => {
  for (const fail of [['provider_booking_rules'], ['rpc:provider_busy_blocks']]) {
    const r = await ask({}, { tables: world(), fail });
    assert.equal(r.status, 503, fail + ': ' + JSON.stringify(r.body));
    assert.equal(r.writes.filter((w) => w.op === 'insert').length, 0);
  }
});

// ── Step 4 · recurring sessions ─────────────────────────────────────────────
// A run: every Tue and Thu at 7:00 AM New York for two weeks, from Tue Oct 27. The clocks change
// on Sun Nov 1, so the first two are 11:00Z and the last two 12:00Z: the wall time holds.
const RUN = { date: '2026-10-27', time: '07:00', repeat: { weeks: 2, weekdays: [2, 4] }, durationMin: 60 };
const runRows = (tables) => (tables.sessions || []).filter((r) => r.series_id).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

test('a run books every date on the coach\'s clock across the clock change, and skips and names a taken one', async () => {
  const tables = world({ sessions: [sess('s-taken', '2026-11-03T12:00:00.000Z', { client_name: 'Marcus T.' })] });
  const r = await create(RUN, { tables });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const rows = runRows(tables);
  assert.deepEqual(rows.map((x) => x.scheduled_at), ['2026-10-27T11:00:00.000Z', '2026-10-29T11:00:00.000Z', '2026-11-05T12:00:00.000Z'],
    '7:00 AM on the coach\'s clock on both sides of the change, and the taken Tuesday left out');
  assert.equal(new Set(rows.map((x) => x.series_id)).size, 1, 'one run, one id');
  assert.ok(rows.every((x) => x.status === 'confirmed' && x.client_id === 'member-1' && x.duration_min === 60));
  assert.equal(r.writes.filter((w) => w.op === 'insert').every((w) => w.by === 'service'), true);
  assert.equal(r.body.series.booked, 3);
  assert.equal(r.body.series.id, rows[0].series_id);
  assert.deepEqual(r.body.series.skipped.map((x) => [x.date, x.reason]), [['2026-11-03', 'overlap']]);
  assert.match(r.body.series.skipped[0].message, /^Tue, Nov 3 overlaps Marcus T\. at 7:00 AM\.$/);
  assert.equal(r.notices.length, 1, 'one notice for the run, not one per session');
  assert.match(r.notices[0].body, /^Your coach booked 3 sessions with you, starting /);
  // Every booking of a video run has its own room, and the reply names each one, so the Schedule
  // can offer Join on all of them without a reload (Codex, #2234).
  assert.deepEqual(r.body.series.sessions.map((x) => x.meetingUrl), rows.map((x) => 'https://meet.shape.test/' + x.id));
  // Without weekdays the run repeats on the first date's own weekday.
  const t2 = world();
  const weekly = await create({ date: '2026-10-08', time: '10:00', repeat: { weeks: 3 } }, { tables: t2 });
  assert.equal(weekly.status, 200, JSON.stringify(weekly.body));
  assert.deepEqual(runRows(t2).map((x) => x.scheduled_at.slice(0, 10)), ['2026-10-08', '2026-10-15', '2026-10-22']);
});

test('a run is refused whole when it cannot be one: its shape, the client, or every date taken', async () => {
  for (const [repeat, re] of [[{ weeks: 1 }, /2 to 26 weeks/], [{ weeks: 27 }, /2 to 26 weeks/], [{ weeks: 4, weekdays: [7] }, /days the session repeats/],
    [{ weeks: 4, weekdays: [] }, /days the session repeats/], [{ weeks: 26, weekdays: [0, 1, 2, 3, 4, 5, 6] }, /at most 60 sessions/], ['every week', /2 to 26 weeks/]]) {
    const tables = world();
    const r = await create({ ...RUN, repeat }, { tables });
    assert.equal(r.status, 400, JSON.stringify(repeat));
    assert.match(r.body.error, re);
    assert.equal(r.writes.filter((w) => w.op === 'insert').length, 0);
  }
  const notMine = await create({ ...RUN, clientId: 'member-2' }, { tables: world() });
  assert.equal(notMine.status, 403, 'a run is for the coach\'s own active client, as a booking is');
  const full = world({ sessions: ['2026-10-27T11:00:00.000Z', '2026-10-29T11:00:00.000Z', '2026-11-03T12:00:00.000Z', '2026-11-05T12:00:00.000Z'].map((at, i) => sess('s' + i, at)) });
  const none = await create(RUN, { tables: full });
  assert.equal(none.status, 409);
  assert.equal(none.body.skipped.length, 4);
  assert.equal(none.writes.filter((w) => w.op === 'insert').length, 0);
  assert.equal(none.notices.length, 0);
});

test('a run whose bulk write is refused is written booking by booking, and a date taken meanwhile is skipped', async () => {
  const tables = world();
  const raced = '2026-10-29T11:00:00.000Z';
  const r = await create(RUN, {
    tables,
    insertError: (rows) => (Array.isArray(rows) || rows.scheduled_at === raced ? { code: '23P01', message: 'conflicting key value violates exclusion constraint "sessions_no_overlap"' } : null),
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(runRows(tables).map((x) => x.scheduled_at), ['2026-10-27T11:00:00.000Z', '2026-11-03T12:00:00.000Z', '2026-11-05T12:00:00.000Z']);
  assert.deepEqual(r.body.series.skipped.map((x) => [x.date, x.reason]), [['2026-10-29', 'taken']]);
  // A database without the series column says so, and books nothing.
  const old = await create(RUN, { tables: world(), insertError: { code: 'PGRST204', message: "Could not find the 'series_id' column of 'sessions' in the schema cache" } });
  assert.equal(old.status, 503);
  assert.match(old.body.error, /aren't set up yet/);
});

test('a run date whose wall time the zone skips is named, never moved to an hour nobody asked for', async () => {
  const { series } = await routes();
  // Sundays at 2:30 AM New York from Mar 7, 2027: on Mar 14 the clocks jump from 2:00 to 3:00.
  const o = series.seriesOccurrences({ date: '2027-03-07', time: '2:30', zone: NY, weeks: 3 });
  assert.equal(o.ok, true);
  assert.deepEqual(o.list.map((x) => [x.date, x.time, new Date(x.at).toISOString()]), [
    ['2027-03-07', '02:30', '2027-03-07T07:30:00.000Z'], ['2027-03-21', '02:30', '2027-03-21T06:30:00.000Z'],
  ]);
  assert.deepEqual(o.missing, [{ date: '2027-03-14', time: '02:30' }]);
  assert.equal(series.seriesOccurrences({ date: '2027-02-30', time: '07:00', zone: NY, weeks: 2 }).ok, false, 'Feb 30 is not a date');
  assert.equal(series.seriesOccurrences({ date: '2027-03-07', time: '24:00', zone: NY, weeks: 2 }).ok, false);
});

const runOf = (n, extra = {}) => Array.from({ length: n }, (_, i) => {
  // Tuesdays at 7:00 AM New York from Oct 27: 11:00Z, then 12:00Z after the change.
  const day = 27 + 7 * i;
  const date = day <= 31 ? `2026-10-${day}` : `2026-11-${String(day - 31).padStart(2, '0')}`;
  return sess('r' + (i + 1), `${date}T${day <= 31 ? '11' : '12'}:00:00.000Z`, { client_id: 'member-1', series_id: 'run-1', ...extra });
});

test('cancel "this and following" cancels this booking and every later one of its run, and tells the member once', async () => {
  const tables = world({ sessions: runOf(4) });
  const r = await post('manage', '/api/sessions/manage', { action: 'cancel', sessionId: 'r2', scope: 'following' }, { tables, user: COACH });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(tables.sessions.map((x) => [x.id, x.status]), [['r1', 'confirmed'], ['r2', 'cancelled'], ['r3', 'cancelled'], ['r4', 'cancelled']]);
  assert.equal(r.body.series.count, 3);
  assert.equal(r.notices.length, 1);
  assert.match(r.notices[0].body, /^Your coach cancelled 3 sessions, from .+ on\.$/);
  // The member may cancel the rest of their own run too, and is not told about their own act.
  const t2 = world({ sessions: runOf(3) });
  const mine = await post('manage', '/api/sessions/manage', { action: 'cancel', sessionId: 'r1', scope: 'following' }, { tables: t2, user: MEMBER });
  assert.equal(mine.status, 200, JSON.stringify(mine.body));
  assert.ok(t2.sessions.every((x) => x.status === 'cancelled'));
  assert.equal(mine.notices.length, 0);
  // A single booking has no "following".
  const single = await post('manage', '/api/sessions/manage', { action: 'cancel', sessionId: 's-1', scope: 'following' }, { tables: world({ sessions: [sess('s-1', '2026-10-08T14:00:00.000Z')] }), user: COACH });
  assert.equal(single.status, 400);
  assert.match(single.body.error, /isn't part of a repeating run/);
});

test('move "this and following": every later booking shifts by the same days to the new wall time, all or nothing', async () => {
  const tables = world({ sessions: runOf(4) });
  // r2 (Tue Nov 3, 7:00) to Wed Nov 4 at 8:00: r2..r4 land on Wednesdays at 8:00 AM New York.
  const r = await post('manage', '/api/sessions/manage', { action: 'reschedule', sessionId: 'r2', scope: 'following', date: '2026-11-04', time: '08:00', tz: NY }, { tables, user: COACH });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(tables.sessions.map((x) => [x.id, x.scheduled_at]), [
    ['r1', '2026-10-27T11:00:00.000Z'], ['r2', '2026-11-04T13:00:00.000Z'], ['r3', '2026-11-11T13:00:00.000Z'], ['r4', '2026-11-18T13:00:00.000Z'],
  ]);
  assert.equal(r.notices.length, 1);
  assert.match(r.notices[0].body, /^Your coach moved 3 sessions; the next is on /);

  // A move from before the clock change to after it keeps the wall time too.
  const t1 = world({ sessions: runOf(3) });
  const early = await post('manage', '/api/sessions/manage', { action: 'reschedule', sessionId: 'r1', scope: 'following', date: '2026-10-28', time: '07:30', tz: NY }, { tables: t1, user: COACH });
  assert.equal(early.status, 200, JSON.stringify(early.body));
  assert.deepEqual(t1.sessions.map((x) => x.scheduled_at), ['2026-10-28T11:30:00.000Z', '2026-11-04T12:30:00.000Z', '2026-11-11T12:30:00.000Z']);

  // One clash refuses the whole move, names the date, and moves nothing. The run's own bookings
  // are not clashes (they are the ones moving).
  const t2 = world({ sessions: [...runOf(4), sess('s-x', '2026-11-11T13:00:00.000Z', { client_name: 'Marcus T.' })] });
  const before = JSON.stringify(t2.sessions);
  const clash = await post('manage', '/api/sessions/manage', { action: 'reschedule', sessionId: 'r2', scope: 'following', date: '2026-11-04', time: '08:00', tz: NY }, { tables: t2, user: COACH });
  assert.equal(clash.status, 409);
  assert.match(clash.body.error, /^Wed, Nov 11 overlaps Marcus T\. at 8:00 AM\. Nothing was moved\.$/);
  assert.equal(JSON.stringify(t2.sessions), before);
  assert.equal(clash.notices.length, 0);

  // The database refusing one write part-way moves nothing: the whole move is ONE call to
  // move_session_run, one transaction. ⚠ It used to move row by row from the route and put back
  // the moved ones with more updates, which can themselves be refused (Codex, #2234), so the
  // route must write no row of the run itself.
  const t3 = world({ sessions: runOf(4) });
  const before3 = JSON.stringify(t3.sessions);
  let writesSeen = 0;
  const raced = await post('manage', '/api/sessions/manage', { action: 'reschedule', sessionId: 'r1', scope: 'following', date: '2026-10-28', time: '07:00', tz: NY }, {
    tables: t3, user: COACH,
    updateError: (patch) => (patch.scheduled_at && ++writesSeen === 3 ? { code: '23P01', message: 'conflicting key value violates exclusion constraint "sessions_no_overlap"' } : null),
  });
  assert.equal(raced.status, 409, JSON.stringify(raced.body));
  assert.equal(raced.body.code, 'taken');
  assert.match(raced.body.error, /Nothing was moved/);
  assert.equal(JSON.stringify(t3.sessions), before3, 'a half-moved run was left behind');
  assert.equal(raced.writes.filter((w) => w.op === 'update' && w.table === 'sessions').length, 0, 'the route moved a row itself');
  assert.equal(raced.notices.length, 0);
  // A booking of the run cancelled since it was read (r1, cancelled while r3 moves first): the
  // function refuses at r1, and the moves before it roll back.
  const t6 = world({ sessions: runOf(3) });
  const changed = await post('manage', '/api/sessions/manage', { action: 'reschedule', sessionId: 'r1', scope: 'following', date: '2026-10-28', time: '07:00', tz: NY }, {
    tables: t6, user: COACH, updateError: (patch, rows) => { if (rows[0] && rows[0].id === 'r3') t6.sessions[0].status = 'cancelled'; return null; },
  });
  assert.equal(changed.status, 409, JSON.stringify(changed.body));
  assert.equal(changed.body.code, 'changed');
  assert.deepEqual(t6.sessions.map((x) => x.scheduled_at), runOf(3).map((x) => x.scheduled_at));
  // A database without the function says so, and moves nothing.
  const t7 = world({ sessions: runOf(2) });
  const old = await post('manage', '/api/sessions/manage', { action: 'reschedule', sessionId: 'r1', scope: 'following', date: '2026-10-28', time: '07:00', tz: NY }, {
    tables: t7, user: COACH, updateError: () => ({ code: 'PGRST202', message: 'Could not find the function public.move_session_run(p_moves) in the schema cache' }),
  });
  assert.equal(old.status, 503);
  assert.match(old.body.error, /isn't set up yet\. Nothing was moved/);
  // Moving later, the latest booking moves first, so the run never lands on itself.
  const t4 = world({ sessions: runOf(3) });
  const order = [];
  await post('manage', '/api/sessions/manage', { action: 'reschedule', sessionId: 'r1', scope: 'following', date: '2026-11-03', time: '07:00', tz: NY }, {
    tables: t4, user: COACH, updateError: (patch, rows) => { order.push(rows[0] && rows[0].id); return null; },
  });
  assert.deepEqual(order, ['r3', 'r2', 'r1']);
  // Only the coach moves a run.
  const t5 = world({ sessions: runOf(2) });
  const member = await post('manage', '/api/sessions/manage', { action: 'reschedule', sessionId: 'r1', scope: 'following', date: '2026-10-28', time: '07:00', tz: NY }, { tables: t5, user: MEMBER });
  assert.equal(member.status, 403);
});

test('the calendar hands the Schedule each booking\'s run', async () => {
  const tables = world({ sessions: [...runOf(2), sess('s-one', '2026-10-08T14:00:00.000Z')], calendar_events: [], client_workouts: [], client_meal_plans: [] });
  const m = await routes();
  m.state.client = db(tables, { label: 'request', rlsUser: 'coach-1' });
  m.state.user = COACH;
  const res = await atNow(() => m.calendar.GET(new Request('https://shape.test/api/calendar?from=2026-10-01&to=2026-11-30&tz=' + NY + '&role=trainer')));
  const byId = Object.fromEntries((await res.json()).events.filter((e) => e.source === 'session').map((e) => [e.sessionId, e]));
  assert.equal(byId.r1.seriesId, 'run-1');
  assert.equal(byId.r2.seriesId, 'run-1');
  assert.equal(byId['s-one'].seriesId, null);
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
  // ⚠ THE PAGE OFFERS THE HOURS' STARTS, NOT EVERY QUARTER (bookingSlots.js steps by the hour):
  // 11:00 is offered; a crafted 11:45 sits inside the hours and is still refused (Codex, #2228).
  const lastHour = await consult({ time: '11:00 AM' }, { tables: world() });
  assert.equal(lastHour.status, 200, 'the last offered start before close');
  const lastQuarter = await consult({ time: '11:45 AM' }, { tables: world() });
  assert.equal(lastQuarter.status, 409, 'an 11:45 the page never offered');
  assert.equal(lastQuarter.body.code, 'outside_hours');
  // Step 3: the coach's time off closes the consult too.
  const away = await consult({ time: '10:00 AM' }, { tables: world({ provider_time_off: [{ provider_role: 'trainer', provider_id: 7, starts_at: '2026-10-08T13:00:00Z', ends_at: '2026-10-08T16:00:00Z' }] }) });
  assert.equal(away.status, 409, JSON.stringify(away.body));
  assert.equal(away.body.code, 'time_off');
  assert.equal(away.writes.filter((w) => w.op === 'insert').length, 0);
  const raced = await consult({ time: '10:00 AM' }, { tables: world(), insertError: { code: '23P01', message: 'conflicting key value violates exclusion constraint "sessions_no_overlap"' } });
  assert.equal(raced.status, 409, 'an overlap the database refused is "taken", not a 500');
  assert.match(raced.body.error, /just taken/);
  const atClose = await consult({ time: '12:00 PM' }, { tables: world() });
  assert.equal(atClose.status, 409, 'noon is when Thursday closes');
  const wrongDay = await consult({ date: '2026-10-10', time: '9:00 AM' }, { tables: world() });
  assert.equal(wrongDay.status, 409, 'Saturday has no hours');
  const unread = await consult({}, { tables: world(), fail: ['provider_availability'] });
  assert.equal(unread.status, 503, 'an unreadable pattern vouches for nothing');
  for (const r of [threeAm, lastQuarter, atClose, wrongDay, unread]) assert.equal(r.writes.filter((w) => w.op === 'insert').length, 0);
});

test('/api/consultation: the app books with its Bearer token and no captcha; the website form still needs one', async () => {
  // Step 4: the app's intro booking comes here instead of inserting straight into `sessions`.
  // It cannot earn a Turnstile token (the widget is keyed to the website's domain), and it
  // signs in with a Bearer token the website's cookie-riding form never sends.
  const web = await consult({}, { tables: world(), captcha: false });
  assert.equal(web.status, 400, JSON.stringify(web.body));
  assert.match(web.body.error, /Captcha/);
  assert.equal(web.writes.filter((w) => w.op === 'insert').length, 0);
  const app = await consult({}, { tables: world(), captcha: false, headers: { Authorization: 'Bearer member-token' } });
  assert.equal(app.status, 200, JSON.stringify(app.body));
  assert.equal(app.writes.filter((w) => w.op === 'insert').length, 1);
  assert.equal(app.notices.length, 1, 'the coach is told about an app booking, as about a website one');
  // The same checks as the website: a time outside the hours is refused for the app too.
  const late = await consult({ time: '3:00 AM' }, { tables: world(), captcha: false, headers: { Authorization: 'Bearer member-token' } });
  assert.equal(late.status, 409);
  assert.equal(late.body.code, 'outside_hours');
  // A Bearer header is not an account: no user behind it is still a 401, and nothing is written.
  const nobody = await consult({}, { tables: world(), captcha: false, headers: { Authorization: 'Bearer junk' }, user: null });
  assert.equal(nobody.status, 401);
  assert.equal(nobody.writes.filter((w) => w.op === 'insert').length, 0);
  // An empty "Bearer" is not a token, so it is the website's case.
  const blank = await consult({}, { tables: world(), captcha: false, headers: { Authorization: 'Bearer ' } });
  assert.equal(blank.status, 400);
});

test('the calendar marks a session the caller booked AS A CLIENT, so the Schedule does not answer it', async () => {
  // RLS hands a session to its client as well as its coach: coach-1 is also a member of
  // trainer 8, and that request of theirs comes back in their own calendar.
  const tables = world({
    trainers: [{ id: 7, owner_id: 'coach-1', name: 'Coach', timezone: NY }, { id: 8, owner_id: 'coach-9', name: 'Other coach', timezone: NY }],
    sessions: [
      sess('s-mine', '2026-10-08T14:00:00+00:00', { client_id: 'member-1' }),
      sess('s-asked', '2026-10-09T14:00:00+00:00', { client_id: 'coach-1', provider_id: 8, status: 'requested' }),
      sess('s-other', '2026-10-09T15:00:00+00:00', { client_id: 'member-5', provider_id: 8 }),
    ],
    calendar_events: [], client_workouts: [], client_meal_plans: [],
  });
  const m = await routes();
  m.state.client = db(tables, { label: 'request', rlsUser: 'coach-1' });
  m.state.user = COACH;
  const res = await m.calendar.GET(new Request('https://shape.test/api/calendar?from=2026-10-01&to=2026-10-31&tz=' + NY + '&role=trainer'));
  const byId = Object.fromEntries((await res.json()).events.filter((e) => e.source === 'session').map((e) => [e.sessionId, e]));
  assert.deepEqual(Object.keys(byId).sort(), ['s-asked', 's-mine'], 'RLS: another coach\'s booking with another member is not read');
  assert.equal(byId['s-asked'].asClient, true);
  assert.equal(byId['s-mine'].asClient, false);
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
    // bookingRules.mjs (window.ShapeBookingRules) places time off on the coach's clock (step 3).
    const mod = html.search(/import \* as SR from "\/newdesign\/scheduleRules\.mjs[^"]*"; import \* as BR from "\/newdesign\/bookingRules\.mjs[^"]*"; window\.ShapeScheduleRules = SR; window\.ShapeBookingRules = BR;/);
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
  ev('s-sat', '2026-10-10', '08:00', { title: 'Long run' }),
  { id: 'plan:w1', source: 'plan', kind: 'WORKOUT', title: 'Lower A', sub: 'Assigned workout', date: '2026-10-06', time: null, durationMin: null, with: '', status: 'planned', editable: false },
];
// Mon–Fri 8a–12p, saved in New York.
const HOURS = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start_minute: 480, duration_min: 240 }));
const ROSTER = [
  { client: { profile: { id: 'member-1', name: 'Priya S.' }, program: { name: 'Strength Block 3', week: 6, weeks: 12, status: 'active' }, checkIn: { lastWeekOf: '2026-09-28' }, coachNotes: [{ on: '2026-10-01', text: 'Left knee: no deep lunges' }], trainingAdherence: { done: 9, planned: 12, pct: 75 }, payments: {} } },
  { client: { profile: { id: 'member-2', name: 'Marcus T.' }, payments: {} } },
];

function server({ events = WEEK(), slots = HOURS, zone = NY, answers = {}, plans = null, plansReadable = true } = {}) {
  const posts = [];
  const calendarUrls = [];
  const handler = async (u, init) => {
    if (u.pathname === '/api/my-availability') return json(200, { slots, timezone: zone });
    if (u.pathname === '/api/calendar') {
      calendarUrls.push(u.search);
      const from = u.searchParams.get('from'), to = u.searchParams.get('to');
      const asked = u.searchParams.get('clientPlans') === '1';
      return json(200, { events: events.filter((e) => e.date >= from && e.date <= to), zone,
        ...(asked && plans ? { clientPlans: plans.filter((p) => p.date >= from && p.date <= to), clientPlansReadable: plansReadable } : {}) });
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
  return { posts, handler, calendarUrls };
}
async function open(opts = {}) {
  const srv = server(opts);
  const page = await mountSchedule({ fetch: srv.handler, triage: opts.triage ?? ROSTER, params: opts.params, role: opts.role, narrow: opts.narrow, drawer: opts.drawer, live: opts.live });
  return { page, posts: srv.posts, calendarUrls: srv.calendarUrls };
}
const block = (page, id) => page.doc.querySelector('[data-dsc-block="session:' + id + '"]');
const colOf = (page, el) => el && el.closest('[data-col-date]').getAttribute('data-col-date');
const px = (v) => Number(String(v).replace('px', ''));
const yOf = (min, startHour = 6) => ((min - startHour * 60) / 60) * 44;

test('the week is a time axis: blocks sized by length, open hours shaded, a now line, requests dashed, untimed on top', async () => {
  const { page } = await open();
  try {
    assert.equal(page.doc.querySelectorAll('[data-col-date]').length, 7, 'the week grid has seven columns');
    // ⚠ pageShell's ≤900px stylesheet collapses any inline `grid-template-columns: repeat(7…`
    // to ONE column; the grid's own templates must never be caught by it.
    for (const el of page.doc.querySelectorAll('[style*="grid-template-columns"]')) {
      assert.doesNotMatch(el.getAttribute('style'), /grid-template-columns: repeat\(7/, 'a seven-column template the phone stylesheet collapses');
    }
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
    assert.ok(!page.doc.querySelector('[data-dsc-block="plan:w1"]'));
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
    // A nudge inside its own hour is not a clash with itself: Thu 9:00 → Thu 9:30.
    await page.drag(block(page, 's-thu'), [[450, yOf(540) + 10], [452, yOf(540) + 30], [450, 164]], { release: false });
    assert.equal(page.doc.querySelector('[data-drop-target]').getAttribute('data-drop-target'), 'ok', 'the booking clashed with itself');
    await page.act(async () => page.dom.window.dispatchEvent(Object.assign(new page.dom.window.MouseEvent('pointerup', { bubbles: true }), { pointerId: 1 })));
    await page.settle();
    assert.deepEqual(posts, [{ action: 'reschedule', sessionId: 's-thu', date: '2026-10-08', time: '09:30', tz: NY }]);
    // Thu 9:30 (column 3), taken 10px below its top → Fri (column 4) with its top at 11:00.
    await page.drag(block(page, 's-thu'), [[450, yOf(570) + 10], [452, yOf(570) + 30], [550, 230]]);
    assert.deepEqual(posts.slice(-1), [{ action: 'reschedule', sessionId: 's-thu', date: '2026-10-09', time: '11:00', tz: NY }]);
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
    assert.ok(!page.doc.querySelector('[data-drop-target]'), 'the target outlived the drag');
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
    assert.ok(!page.doc.querySelector('[role=dialog]'));
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
    assert.ok(!page.doc.querySelector('[data-drop-target]'));
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
    assert.ok(!page.doc.querySelector('[aria-label="Requests to confirm"]'), 'the accepted request is still in the strip');
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
    assert.ok(!block(second.page, 's-req'), 'a declined request is still on the grid');
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
    // "Last session" is one that has HAPPENED: Saturday's sheet skips Thursday's, still ahead.
    // ⚠ CHECKED WHILE THURSDAY'S IS STILL BOOKED. This sat after the cancel below, which removes
    // Thursday's — so with the has-it-happened check deleted there was no future session left to
    // pick wrongly, and the mutation that deletes it survived (2026-10-07 round).
    await page.click(block(page, 's-sat'));
    assert.match(dlg().textContent, /Last session.*Wed, Oct 7 · Tempo run/);
    await page.click(page.button('Close'));
    // Cancel asks, then cancels.
    await page.click(block(page, 's-thu'));
    await page.click(page.buttonMatching(/^Cancel$/, dlg()));
    assert.match(dlg().textContent, /Cancel this session\? Priya is told\./);
    await page.click(page.buttonMatching(/Yes, cancel it/, dlg()));
    assert.deepEqual(posts, [{ action: 'cancel', sessionId: 's-thu' }]);
    assert.ok(!block(page, 's-thu'));
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
    assert.ok(!page.doc.querySelector('[role=dialog]'));
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
    assert.ok(!page.doc.querySelector('[data-dsc-ghost]'));
  } finally { await page.unmount(); }
});

// ── Step 4 · weekly runs on the page ────────────────────────────────────────
const setSel = async (page, sel, v) => { sel.value = String(v); await page.act(async () => sel.dispatchEvent(new page.dom.window.Event('change', { bubbles: true }))); };
const RUN_EVENTS = () => [...WEEK(),
  ev('r-a', '2026-10-08', '11:00', { seriesId: 'run-1', with: 'Marcus T.', clientId: 'member-2' }),
  ev('r-b', '2026-10-10', '11:00', { seriesId: 'run-1', with: 'Marcus T.', clientId: 'member-2' }),
  ev('r-c', '2026-10-11', '11:00', { seriesId: 'run-1', with: 'Marcus T.', clientId: 'member-2' }),
];

test('the book sheet books a weekly run: its first day is always in it, and the dates it skipped are named before it closes', async () => {
  const series = {
    id: 'run-9', booked: 3,
    sessions: ['n-1', 'n-2', 'n-3'].map((id, i) => ({ id, scheduledAt: ['2026-10-08T15:00:00.000Z', '2026-10-09T15:00:00.000Z', '2026-10-15T15:00:00.000Z'][i], meetingUrl: 'https://meet.shape.test/' + id })),
    skipped: [{ date: '2026-10-16', time: '11:00', reason: 'overlap', message: 'Fri, Oct 16 overlaps Sam R. at 11:00 AM.' }],
  };
  const { page, posts } = await open({ answers: { create: () => json(200, { ok: true, session: { id: 'n-1', scheduled_at: series.sessions[0].scheduledAt }, meetingUrl: null, clientName: 'Marcus T.', series }) } });
  try {
    page.layout();
    await page.clickAt(page.doc.querySelector('[data-col-date="2026-10-08"]'), 350, yOf(660) + 5);
    await page.click(page.doc.querySelector('[data-dsc-ghost]'));
    const dlg = () => page.doc.querySelector('[role=dialog]');
    await setSel(page, dlg().querySelector('select[aria-label=Client]'), 'member-2');
    await page.click(page.buttonMatching(/^Weekly$/, dlg()));
    const day = (name) => dlg().querySelector('[aria-label="' + name + '"]');
    assert.equal(day('Thu').getAttribute('aria-pressed'), 'true');
    assert.equal(day('Thu').disabled, true, 'the run starts with this booking, so its day cannot be taken out');
    await page.click(day('Fri'));
    await setSel(page, dlg().querySelector('select[aria-label=Weeks]'), 2);
    assert.match(dlg().textContent, /4 sessions · last on Fri, Oct 16/);
    await page.click(page.buttonMatching(/^Book 4 sessions · Marcus is told$/, dlg()));
    assert.deepEqual(posts, [{ action: 'create', role: 'trainer', clientId: 'member-2', date: '2026-10-08', time: '11:00', tz: NY, durationMin: 60, type: 'video', repeat: { weeks: 2, weekdays: [4, 5] } }]);
    // It stays to say what it could not book.
    assert.match(dlg().textContent, /Booked 3 of 4\. Marcus is told\./);
    assert.match(dlg().textContent, /Fri, Oct 16 overlaps Sam R\. at 11:00 AM\./);
    assert.equal(colOf(page, block(page, 'n-1')), '2026-10-08');
    assert.equal(colOf(page, block(page, 'n-2')), '2026-10-09');
    await page.click(page.buttonMatching(/^Done$/, dlg()));
    assert.ok(!dlg());
    // Each placed booking has its own room straight away, not "no room yet" until a reload.
    await page.click(block(page, 'n-2'));
    assert.equal(dlg().querySelector('a[href="https://meet.shape.test/n-2"]')?.textContent, 'Join ↗');
    await page.key('Escape');
    // A run of more than 60 sessions is refused before it is sent.
    page.layout();
    await page.clickAt(page.doc.querySelector('[data-col-date="2026-10-08"]'), 350, yOf(600) + 5);
    await page.click(page.doc.querySelector('[data-dsc-ghost]'));
    await setSel(page, dlg().querySelector('select[aria-label=Client]'), 'member-2');
    await page.click(page.buttonMatching(/^Weekly$/, dlg()));
    for (const d of ['Mon', 'Tue', 'Wed', 'Fri']) await page.click(day(d));
    await setSel(page, dlg().querySelector('select[aria-label=Weeks]'), 26);
    assert.match(dlg().textContent, /more than one run can book \(60\)/);
    assert.equal(page.buttonMatching(/^Book/, dlg()).disabled, true);
  } finally { await page.unmount(); }
});

test('a run\'s booking cancels alone or with the rest of its run', async () => {
  const { page, posts } = await open({ events: RUN_EVENTS(), answers: { cancel: (b) => json(200, { ok: true, ...(b.scope ? { series: { id: 'run-1', count: 3 } } : {}) }) } });
  try {
    const dlg = () => page.doc.querySelector('[role=dialog]');
    await page.click(block(page, 'r-b'));
    assert.match(dlg().textContent, /RepeatsPart of a weekly run/);
    await page.click(page.buttonMatching(/^Cancel$/, dlg()));
    await page.click(page.buttonMatching(/^This session$/, dlg()));
    assert.deepEqual(posts.at(-1), { action: 'cancel', sessionId: 'r-b' });
    assert.ok(!block(page, 'r-b'));
    assert.ok(block(page, 'r-a') && block(page, 'r-c'), 'one cancel took the others with it');
    await page.click(block(page, 'r-a'));
    await page.click(page.buttonMatching(/^Cancel$/, dlg()));
    await page.click(page.buttonMatching(/^This and following$/, dlg()));
    assert.deepEqual(posts.at(-1), { action: 'cancel', sessionId: 'r-a', scope: 'following' });
    assert.ok(!block(page, 'r-a') && !block(page, 'r-c'));
    assert.ok(block(page, 's-thu'), 'a booking outside the run went too');
    assert.match(page.toast(), /^Cancelled · 3 sessions with Marcus T\. · Marcus is told$/);
    // A single booking asks nothing about a run.
    await page.click(block(page, 's-thu'));
    await page.click(page.buttonMatching(/^Cancel$/, dlg()));
    assert.ok(page.buttonMatching(/^Yes, cancel it$/, dlg()));
    assert.ok(!page.buttonMatching(/^This and following$/, dlg()));
  } finally { await page.unmount(); }
});

test('moving a run\'s booking asks: just this one, or this and following, which keep their weekly rhythm', async () => {
  const { page, posts } = await open({ events: RUN_EVENTS() });
  try {
    const dlg = () => page.doc.querySelector('[role=dialog]');
    // r-a (Thu 11:00) to Fri 11:00, with the rest of its run.
    await page.click(block(page, 'r-a'));
    await page.click(page.buttonMatching(/^Reschedule$/, dlg()));
    const input = dlg().querySelector('input[type=date]');
    const proto = Object.getOwnPropertyDescriptor(page.dom.window.HTMLInputElement.prototype, 'value');
    proto.set.call(input, '2026-10-09');
    await page.act(async () => input.dispatchEvent(new page.dom.window.Event('input', { bubbles: true })));
    await page.click(page.buttonMatching(/^Move/, dlg()));
    assert.equal(posts.length, 0, 'it moved before asking');
    assert.match(dlg().textContent, /Just this session, or this one and the rest of the run\?/);
    await page.click(page.buttonMatching(/^This and following$/, dlg()));
    assert.deepEqual(posts, [{ action: 'reschedule', sessionId: 'r-a', date: '2026-10-09', time: '11:00', tz: NY, scope: 'following' }]);
    assert.equal(colOf(page, block(page, 'r-a')), '2026-10-09');
    assert.equal(colOf(page, block(page, 'r-b')), '2026-10-11', 'Saturday moved a day with it');
    assert.ok(!block(page, 'r-c'), 'Sunday\'s moved on to Monday, off this week');
    assert.match(page.toast(), /^Moved 3 sessions with Marcus T\./);
    // "Just this one" sends no scope, and the rest stay.
    await page.click(block(page, 'r-b'));
    await page.click(page.buttonMatching(/^Reschedule$/, dlg()));
    await setSel(page, dlg().querySelector('select[aria-label="New time"]'), 720);
    await page.click(page.buttonMatching(/^Move/, dlg()));
    // Sunday has no open hours: that is asked first, then which bookings.
    await page.click(page.buttonMatching(/^Move anyway$/, dlg()));
    await page.click(page.buttonMatching(/^Just this one$/, dlg()));
    assert.deepEqual(posts.at(-1), { action: 'reschedule', sessionId: 'r-b', date: '2026-10-11', time: '12:00', tz: NY });
  } finally { await page.unmount(); }
  // A refused run move puts every booking back where it was.
  const refused = await open({ events: RUN_EVENTS(), answers: { reschedule: () => json(409, { error: 'Sat, Oct 17 overlaps Sam R. at 11:00 AM. Nothing was moved.', code: 'overlap' }) } });
  try {
    const p2 = refused.page;
    const dlg = () => p2.doc.querySelector('[role=dialog]');
    await p2.click(block(p2, 'r-a'));
    await p2.click(p2.buttonMatching(/^Reschedule$/, dlg()));
    await setSel(p2, dlg().querySelector('select[aria-label="New time"]'), 600);
    await p2.click(p2.buttonMatching(/^Move/, dlg()));
    await p2.click(p2.buttonMatching(/^This and following$/, dlg()));
    assert.match(p2.toast(), /Sat, Oct 17 overlaps Sam R\. at 11:00 AM\. Nothing was moved\./);
    assert.equal(px(block(p2, 'r-a').style.top), yOf(660) + 1);
    assert.equal(px(block(p2, 'r-b').style.top), yOf(660) + 1);
    assert.equal(colOf(p2, block(p2, 'r-c')), '2026-10-11');
  } finally { await refused.page.unmount(); }
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

test('a coach\'s own booking with another coach shows read-only: not in the strip, not draggable, not a clash', async () => {
  const own = ev('s-own', '2026-10-08', '11:00', { status: 'requested', asClient: true, with: 'Coach', clientId: 'coach-1', title: 'Coaching session' });
  const { page, posts } = await open({ events: [...WEEK(), own] });
  try {
    assert.match(page.doc.querySelector('[aria-label="Requests to confirm"]').textContent, /^1 to confirm/, 'the coach is asked to answer their own request');
    const el = page.doc.querySelector('[data-dsc-block="session:s-own"]');
    assert.ok(el, 'the coach\'s own booking is not on their calendar');
    assert.match(el.textContent, /your booking/);
    assert.ok(![...page.doc.querySelectorAll('[aria-label="Show clients"] button')].some((b) => /^Coach$/.test(b.textContent)), 'the coach is a client chip');
    page.layout();
    await page.drag(el, [[450, yOf(660) + 10], [452, yOf(660) + 30], [550, 230]]);
    assert.deepEqual(posts, [], 'it moved');
    await page.click(el);
    assert.match(page.text(), /YOUR OWN BOOKING WITH ANOTHER COACH/);
    assert.ok(!page.doc.querySelector('[role=dialog]'), 'it opened the booking sheet with its actions');
    // Its hour is not one of the coach's bookings: booking a client at 11:00 is not a clash
    // here, exactly as the routes see it.
    await page.click(page.button('Close'));
    await page.clickAt(page.doc.querySelector('[data-col-date="2026-10-08"]'), 450, yOf(660) + 5);
    await page.click(page.doc.querySelector('[data-dsc-ghost]'));
    assert.doesNotMatch(page.doc.querySelector('[role=dialog]').textContent, /Overlaps/);
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

// ── Step 4 · the plans row ──────────────────────────────────────────────────
const PLANS = [
  { id: 'cplan:w1', date: '2026-10-05', clientId: 'member-1', with: 'Priya S.', title: 'Lower A' },
  { id: 'cplan:w2', date: '2026-10-08', clientId: 'member-1', with: 'Priya S.', title: 'Upper A' },
  { id: 'cplan:w3', date: '2026-10-08', clientId: 'member-2', with: 'Marcus T.', title: 'Push' },
];
const plansIn = (page, iso) => [...page.doc.querySelectorAll('[data-plans-day="' + iso + '"] [data-plan]')].map((n) => n.textContent);

test('the plans row shows what each client\'s program puts on the day, follows the client chips, and turns off', async () => {
  const opened = [];
  const Drawer = ({ row }) => { opened.push(row.client.profile.id); return null; };
  const { page, calendarUrls } = await open({ plans: PLANS, drawer: Drawer });
  try {
    assert.ok(calendarUrls.every((q) => /[?&]clientPlans=1(&|$)/.test(q)), 'a trainer\'s calendar read does not ask for the plans');
    assert.ok(page.doc.querySelector('[data-plans-row]'));
    assert.deepEqual(plansIn(page, '2026-10-05'), ['Priya · Lower A']);
    assert.deepEqual(plansIn(page, '2026-10-08'), ['Priya · Upper A', 'Marcus · Push']);
    assert.deepEqual(plansIn(page, '2026-10-06'), []);
    // A chip opens that client's file.
    await page.click(page.doc.querySelector('[data-plan="cplan:w3"]'));
    assert.deepEqual(opened, ['member-2']);
    // The client chips narrow it with the bookings.
    await page.click(page.buttonMatching(/Marcus T\./, page.doc.querySelector('[aria-label="Show clients"]')));
    assert.deepEqual(plansIn(page, '2026-10-08'), ['Marcus · Push']);
    assert.deepEqual(plansIn(page, '2026-10-05'), []);
    await page.click(page.button('Show all'));
    // Off, and remembered.
    const toggle = page.button('Client plans');
    assert.equal(toggle.getAttribute('aria-pressed'), 'true');
    await page.click(toggle);
    assert.ok(!page.doc.querySelector('[data-plans-row]'));
    assert.deepEqual(page.remembered.filter(([k]) => k === 'schedulePlans').map(([, v]) => v), ['off']);
  } finally { await page.unmount(); }
});

test('the plans row says when it could not load, and a nutritionist has none', async () => {
  const unread = await open({ plans: [], plansReadable: false });
  try {
    assert.match(unread.page.text(), /Client plans couldn't load — the row is incomplete\./);
  } finally { await unread.page.unmount(); }
  const nutri = await open({ role: 'nutritionist', plans: PLANS });
  try {
    assert.ok(nutri.calendarUrls.every((q) => !/clientPlans/.test(q)), 'a nutritionist asks for training days');
    assert.ok(!nutri.page.doc.querySelector('[data-plans-row]'));
    assert.ok(!nutri.page.button('Client plans'));
  } finally { await nutri.page.unmount(); }
});

test('/api/calendar serves a trainer\'s clients\' dated training days, only when asked, and says when it cannot', async () => {
  const cw = (id, client_id, scheduled_date, extra = {}) => ({ id, trainer_id: 7, client_id, title: 'Lower A', status: 'published', scheduled_date, payload: {}, description: null, ...extra });
  const tables = world({
    calendar_events: [], client_meal_plans: [], names: { 'member-1': 'Priya Shah', 'member-2': 'Marcus Tate' },
    client_workouts: [
      cw('w1', 'member-1', '2026-10-08'),
      cw('w2', 'member-2', '2026-10-09', { title: 'Push' }),
      cw('w3', 'member-1', null),                                // undated: the member's own week decides
      cw('w4', 'member-1', '2026-10-10', { status: 'archived' }),
      cw('w5', 'member-1', '2026-11-20'),                        // outside the window
      cw('w6', 'member-9', '2026-10-08', { trainer_id: 99 }),    // another trainer's
    ],
  });
  const m = await routes();
  m.state.client = db(tables, { label: 'request', rlsUser: 'coach-1' });
  m.state.user = COACH;
  const get = async (q) => (await atNow(() => m.calendar.GET(new Request('https://shape.test/api/calendar?from=2026-10-01&to=2026-10-31&tz=' + NY + q)))).json();
  const asked = await get('&role=trainer&clientPlans=1');
  assert.equal(asked.clientPlansReadable, true);
  assert.deepEqual(asked.clientPlans, [
    { id: 'cplan:w1', date: '2026-10-08', clientId: 'member-1', with: 'Priya Shah', title: 'Lower A' },
    { id: 'cplan:w2', date: '2026-10-09', clientId: 'member-2', with: 'Marcus Tate', title: 'Push' },
  ]);
  const notAsked = await get('&role=trainer');
  assert.equal('clientPlans' in notAsked, false, 'every calendar read pays for the plans');
  assert.equal('clientPlans' in (await get('&role=nutritionist&clientPlans=1')), false);
  m.state.client = db(tables, { label: 'request', rlsUser: 'coach-1', fail: ['client_workouts'] });
  const failed = await get('&role=trainer&clientPlans=1');
  assert.equal(failed.clientPlansReadable, false, 'a failed read was drawn as a week with no training');
  assert.deepEqual(failed.clientPlans, []);
});

test('client chips filter the grid, ?client= lands filtered, and clashes still see every booking', async () => {
  const { page } = await open();
  try {
    const chips = page.doc.querySelector('[aria-label="Show clients"]');
    assert.ok(chips);
    await page.click(page.buttonMatching(/Marcus T\./, chips));
    assert.ok(block(page, 's-fri'));
    assert.ok(!block(page, 's-thu'), 'the chip did not filter');
    await page.click(page.button('Show all'));
    assert.ok(block(page, 's-thu'));
  } finally { await page.unmount(); }
  const linked = await open({ params: { client: 'member-2' } });
  try {
    assert.ok(block(linked.page, 's-fri'));
    assert.ok(!block(linked.page, 's-thu'), '?client= no longer filters');
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
    assert.ok(!page.doc.querySelector('[data-load]'), 'a load against unplaced hours');
  } finally { await page.unmount(); }
});

test('the grid draws only with its rules, and the week toggle is derived from them', () => {
  // The page reads every rule from the module; a copy inlined here would be a second rule.
  for (const fn of ['clashIn', 'fitsOpenHours', 'openBlocks', 'layoutLanes', 'hourRange', 'pointToSlot', 'dayLoad']) {
    assert.ok(new RegExp('\\b(R|rules)\\.' + fn + '\\(').test(SCHEDULE_SRC), 'the page no longer uses the shared ' + fn);
    assert.doesNotMatch(SCHEDULE_SRC, new RegExp('function ' + fn + '\\('), 'the page carries its own ' + fn);
  }
});
