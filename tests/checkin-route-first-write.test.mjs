// The check-in route writes today's snapshot row: the member's answers as given, and the
// night's hours only where no watch wrote the night (owner, 2026-10-18: "Use the data from
// smart device priority of the member has one, if not manual entry"). Two writes can land
// between its read and its write: another save that makes the day's row first (a glass of
// water on its own line from the Home card, a meal log), and a watch sync that writes the
// night. Neither may lose the answer, and the second must keep the watch's hours.
// Run as written: the real route on a one-row table that evaluates the route's filters.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');

// `column.op.value` and `column->>key.op.value` terms, the only kinds the route sends in `.or()`.
function matchesOr(row, expr) {
  return expr.split(',').some((term) => {
    const m = /^(\w+)(?:->>(\w+))?\.(is|eq)\.(.+)$/.exec(term);
    if (!m) throw new Error(`the fake table cannot read the filter ${term}`);
    const [, col, key, op, value] = m;
    const v = key == null ? row[col] : row[col] && typeof row[col] === 'object' ? row[col][key] : undefined;
    const text = v == null ? null : String(v);
    if (op === 'is') { if (value !== 'null') throw new Error(`is.${value}`); return text == null; }
    return text === value;
  });
}

// Today's row for one member. `row` is what is there before the route reads; `afterRead` is
// another write landing between the read and the route's own writes.
function fakeTable({ row = null, afterRead = null, insertError = null, updateError = null } = {}) {
  const db = { row: row ? structuredClone(row) : null };
  const writes = [];
  let reads = 0;
  const from = (table) => {
    const filters = {};
    const q = {
      select: () => q,
      eq: (k, v) => { filters[k] = v; return q; },
      maybeSingle: async () => {
        const data = db.row ? structuredClone(db.row) : null;
        if (++reads === 1 && afterRead) afterRead(db);
        return { data, error: null };
      },
      insert: async (r) => {
        writes.push({ op: 'insert', table, row: r });
        if (insertError) return { error: insertError };
        if (db.row) return { error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
        db.row = { id: 'row-new', ...r };
        return { error: null };
      },
      update: (patch) => {
        const w = { op: 'update', table, row: patch, filters: {}, or: null };
        writes.push(w);
        let wantRows = false;
        const u = {
          eq: (k, v) => { w.filters[k] = v; return u; },
          or: (expr) => { w.or = expr; return u; },
          select: () => { wantRows = true; return u; },
          then: (ok, ko) => {
            if (updateError) return Promise.resolve({ data: null, error: updateError }).then(ok, ko);
            const r = db.row;
            const hit = !!r
              && (w.filters.id == null || w.filters.id === r.id)
              && (w.or == null || matchesOr(r, w.or));
            if (hit) Object.assign(r, patch);
            return Promise.resolve({ data: wantRows ? (hit ? [{ id: r.id }] : []) : null, error: null }).then(ok, ko);
          },
        };
        return u;
      },
    };
    return q;
  };
  return { client: { from }, writes, db };
}

async function post(fake, body) {
  const mod = await loadRealModule(join(ROOT, 'src/app/api/client/checkin/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { clientForRequest: async () => fake.client, currentUser: async () => ({ id: 'member-1' }) }],
      ['@/lib/request-utils', await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) })],
      ['@/lib/local-day', { clientLocalDay: (d) => d }],
      ['@/lib/require-membership', { requireMembership: async () => null }],
    ]),
  });
  const res = await mod.POST(new Request('https://x/api/client/checkin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
}

const DAY = '2026-10-18';
const WATER = (db) => { db.row = { id: 'row-w', hydration_l: 0.24, sources: {} }; };
const WATCH = (db) => { db.row = { id: 'row-d', sleep_hours: 6.9, sources: { sleep_hours: 'apple_health' } }; };

test("a check-in that loses the day's first write to a glass of water is still saved", async () => {
  const fake = fakeTable({ afterRead: WATER });
  const { status, body } = await post(fake, { energy: 6, hunger: 4, date: DAY });
  assert.equal(status, 200, 'the answer came back as a failure and the card took it back');
  assert.equal(body.ok, true);
  const update = fake.writes.find((w) => w.op === 'update');
  assert.ok(update, 'the answer was never written to the row the other write made');
  assert.deepEqual(update.row, { energy: 6, hunger: 4 }, 'the retry wrote more than the answer, over the other write');
  assert.deepEqual(update.filters, { user_id: 'member-1', snapshot_date: DAY }, "the retry was not aimed at this member's day");
  assert.equal(fake.db.row.energy, 6);
  assert.equal(fake.db.row.hydration_l, 0.24, 'the glass of water was written over');
});

test('any other insert failure is still a failure, and a failed retry is too', async () => {
  let fake = fakeTable({ insertError: { code: '42501', message: 'permission denied' } });
  let res = await post(fake, { energy: 6, date: DAY });
  assert.equal(res.status, 500);
  assert.ok(!fake.writes.some((w) => w.op === 'update'), 'a failure that is not the unique key was retried as an update');

  fake = fakeTable({ afterRead: WATER, updateError: { message: 'gone' } });
  res = await post(fake, { energy: 6, date: DAY });
  assert.equal(res.status, 500, 'a retry that failed was reported as saved');
});

test('the first write of the day inserts, and a later one updates the row by id', async () => {
  let fake = fakeTable();
  let res = await post(fake, { sleepHours: 7.5, date: DAY });
  assert.equal(res.status, 200);
  assert.deepEqual(fake.writes, [{ op: 'insert', table: 'daily_health_snapshot', row: { user_id: 'member-1', snapshot_date: DAY, sleep_hours: 7.5 } }]);
  assert.equal(res.body.sleepHours, 7.5);
  assert.equal(res.body.sleepFromDevice, false);

  fake = fakeTable({ row: { id: 'row-1', sources: {} } });
  res = await post(fake, { sleepQuality: 8, date: DAY });
  assert.equal(res.status, 200);
  assert.equal(fake.writes.length, 1, 'a check-in with no hours wrote the night');
  assert.deepEqual(fake.writes[0].row, { sleep_quality: 8 });
  assert.deepEqual(fake.writes[0].filters, { id: 'row-1' });
  assert.equal(res.body.sleepHours, null);
  assert.equal(res.body.sleepFromDevice, false);
});

// ── A watch's night comes first ───────────────────────────────────────────────
test("hours typed on a day a watch wrote the night are not written, and the watch's hours come back", async () => {
  const fake = fakeTable({ row: { id: 'row-1', sleep_hours: 6.5, sources: { sleep_hours: 'oura', hrv_ms: 'oura' } } });
  const { status, body } = await post(fake, { energy: 6, sleepHours: 7.5, date: DAY });
  assert.equal(status, 200);
  assert.equal(fake.db.row.sleep_hours, 6.5, "the typed hours replaced the watch's night");
  assert.equal(fake.db.row.energy, 6, 'the answers sent with the hours were dropped');
  assert.ok(!fake.writes.some((w) => w.row && 'sleep_hours' in w.row), "the typed hours were sent at the watch's night");
  assert.equal(body.sleepFromDevice, true, "the answer did not say the watch's night stands");
  assert.equal(body.sleepHours, 6.5, "the answer gave back the typed hours, not the watch's");
});

test('typed hours are written to a night no watch wrote: a day-only watch, a typed night, an empty row, a stamp with no hours', async () => {
  for (const [sources, hours] of [[{ resting_hr: 'apple_health' }, null], [{ sleep_hours: 'manual' }, 6], [{}, null], [null, null], [{ sleep_hours: 'whoop' }, null]]) {
    const fake = fakeTable({ row: { id: 'row-1', sleep_hours: hours, sources } });
    const { status, body } = await post(fake, { sleepHours: 7.5, date: DAY });
    const label = JSON.stringify(sources);
    assert.equal(status, 200, label);
    assert.equal(fake.db.row.sleep_hours, 7.5, `the member's hours were not written (${label})`);
    assert.equal(body.sleepFromDevice, false, label);
    assert.equal(body.sleepHours, 7.5, label);
    assert.ok(!fake.writes.some((w) => w.op === 'update' && Object.keys(w.row).length === 0), `an empty write was sent (${label})`);
    const night = fake.writes.find((w) => w.op === 'update' && 'sleep_hours' in w.row);
    assert.deepEqual(night.filters, { user_id: 'member-1', snapshot_date: DAY }, `the night was not aimed at this member's day (${label})`);
  }
});

test("a watch sync landing between the read and the write keeps the watch's night", async () => {
  const fake = fakeTable({
    row: { id: 'row-1', sleep_hours: null, sources: { resting_hr: 'garmin' } },
    afterRead: (db) => Object.assign(db.row, { sleep_hours: 6.5, sources: { resting_hr: 'garmin', sleep_hours: 'garmin' } }),
  });
  const { status, body } = await post(fake, { energy: 6, sleepHours: 7.5, date: DAY });
  assert.equal(status, 200);
  assert.equal(fake.db.row.sleep_hours, 6.5, "the typed hours were written over the watch's night");
  assert.equal(fake.db.row.energy, 6);
  assert.equal(body.sleepFromDevice, true);
  assert.equal(body.sleepHours, 6.5);
});

test("the day's first check-in that loses the row to a watch sync keeps the watch's night", async () => {
  let fake = fakeTable({ afterRead: WATCH });
  let res = await post(fake, { energy: 6, sleepHours: 7.5, date: DAY });
  assert.equal(res.status, 200);
  assert.equal(fake.db.row.sleep_hours, 6.9, "the typed hours were written over the watch's night");
  assert.equal(fake.db.row.energy, 6, 'the answers were not written to the row the sync made');
  assert.equal(res.body.sleepFromDevice, true);
  assert.equal(res.body.sleepHours, 6.9);

  // The row a glass of water made has no night: the member's hours are written to it.
  fake = fakeTable({ afterRead: WATER });
  res = await post(fake, { sleepHours: 7.5, date: DAY });
  assert.equal(res.status, 200);
  assert.equal(fake.db.row.sleep_hours, 7.5, 'the hours were lost to a glass of water');
  assert.equal(res.body.sleepFromDevice, false);
  assert.ok(!fake.writes.some((w) => w.op === 'update' && Object.keys(w.row).length === 0), 'an empty write was sent to the row the other write made');
});

test('a failed write of the night is a failure, and so is a night that went nowhere', async () => {
  let fake = fakeTable({ row: { id: 'row-1', sources: {} }, updateError: { message: 'gone' } });
  let res = await post(fake, { sleepHours: 7.5, date: DAY });
  assert.equal(res.status, 500, 'a failed write of the night was reported as saved');
  // …even when a watch's night has landed meanwhile: the write failed, and the answer says so.
  fake = fakeTable({ row: { id: 'row-1', sources: {} }, afterRead: WATCH, updateError: { message: 'gone' } });
  res = await post(fake, { sleepHours: 7.5, date: DAY });
  assert.equal(res.status, 500, 'a failed write of the night was read as a watch winning it');

  // The row was gone by the write: nothing was saved, and no watch's night stands.
  fake = fakeTable({ row: { id: 'row-1', sources: {} }, afterRead: (db) => { db.row = null; } });
  res = await post(fake, { sleepHours: 7.5, date: DAY });
  assert.equal(res.status, 500, 'hours that were never written were reported as saved');
});

// A night skipped in the Morning check-in is saved on the day's row, so the reminder can tell it
// from an unanswered one (owner, 2026-10-19: "yes fix"). Only a JSON true counts, and a skip alone
// is something to log.
test('a skipped night is saved on its own, and only a true skips it', async () => {
  let fake = fakeTable();
  let res = await post(fake, { sleepSkipped: true, date: DAY });
  assert.equal(res.status, 200, 'a skip alone was refused as nothing to log');
  assert.equal(res.body.sleepSkipped, true);
  assert.deepEqual(fake.writes, [{ op: 'insert', table: 'daily_health_snapshot', row: { user_id: 'member-1', snapshot_date: DAY, sleep_skipped: true } }]);

  fake = fakeTable({ row: { id: 'row-1', sleep_hours: 6.9, sources: { sleep_hours: 'apple_health' } } });
  res = await post(fake, { sleepSkipped: true, date: DAY });
  assert.equal(res.status, 200);
  assert.deepEqual(fake.writes.map((w) => w.row), [{ sleep_skipped: true }], 'the skip wrote over the night or another answer');
  assert.equal(fake.db.row.sleep_hours, 6.9);

  for (const v of ['true', 1, {}, null]) {
    fake = fakeTable();
    res = await post(fake, { sleepSkipped: v, date: DAY });
    assert.equal(res.status, 400, `sleepSkipped ${JSON.stringify(v)} was read as a skip`);
    assert.equal(fake.writes.length, 0);
  }
  fake = fakeTable({ row: { id: 'row-1', sources: {} } });
  res = await post(fake, { energy: 6, sleepSkipped: 'yes', date: DAY });
  assert.deepEqual(fake.writes.map((w) => w.row), [{ energy: 6 }], 'a skip that is not true was written with an answer');
  assert.equal(res.body.sleepSkipped, false);
});
