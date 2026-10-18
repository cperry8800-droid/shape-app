// The day's first check-in reads for today's snapshot row, then inserts one. Another write
// can make that row in between: a glass of water saved on its own line from the Home card,
// a watch sync, a meal log. The insert then hits the unique (user_id, snapshot_date) key,
// and the answer used to come back as a 500 that the card took back on screen. It is now
// written to the row the other write made. Run as written: the real route on a fake client.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');

// A table of one: `insertError` is what the insert answers, as the unique key would.
function fakeClient({ existing = null, insertError = null, updateError = null, rpcError = null } = {}) {
  const writes = [];
  const rpcs = [];
  const from = (table) => {
    const filters = {};
    const q = {
      select: () => q,
      eq: (k, v) => { filters[k] = v; return q; },
      maybeSingle: async () => ({ data: existing, error: null }),
      insert: async (row) => { writes.push({ op: 'insert', table, row }); return { error: insertError }; },
      update: (row) => {
        const w = { op: 'update', table, row, filters };
        writes.push(w);
        const u = { eq: (k, v) => { filters[k] = v; return u; }, then: (ok, ko) => Promise.resolve({ error: updateError }).then(ok, ko) };
        return u;
      },
    };
    return q;
  };
  const rpc = async (name, args) => { rpcs.push({ name, args }); return { error: rpcError }; };
  return { client: { from, rpc }, writes, rpcs };
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

test("a check-in that loses the day's first write to a glass of water is still saved", async () => {
  const fake = fakeClient({ insertError: { code: '23505', message: 'duplicate key value violates unique constraint' } });
  const { status, body } = await post(fake, { energy: 6, hunger: 4, date: '2026-10-18' });
  assert.equal(status, 200, 'the answer came back as a failure and the card took it back');
  assert.equal(body.ok, true);
  const update = fake.writes.find((w) => w.op === 'update');
  assert.ok(update, 'the answer was never written to the row the other write made');
  assert.deepEqual(update.row, { energy: 6, hunger: 4 }, 'the retry wrote more than the answer, over the other write');
  assert.deepEqual(update.filters, { user_id: 'member-1', snapshot_date: '2026-10-18' }, "the retry was not aimed at this member's day");
});

test('any other insert failure is still a failure, and a failed retry is too', async () => {
  let fake = fakeClient({ insertError: { code: '42501', message: 'permission denied' } });
  let res = await post(fake, { energy: 6, date: '2026-10-18' });
  assert.equal(res.status, 500);
  assert.ok(!fake.writes.some((w) => w.op === 'update'), 'a failure that is not the unique key was retried as an update');

  fake = fakeClient({ insertError: { code: '23505' }, updateError: { message: 'gone' } });
  res = await post(fake, { energy: 6, date: '2026-10-18' });
  assert.equal(res.status, 500, 'a retry that failed was reported as saved');
});

test('the first write of the day inserts, and a later one updates the row by id', async () => {
  let fake = fakeClient();
  let res = await post(fake, { sleepHours: 7.5, date: '2026-10-18' });
  assert.equal(res.status, 200);
  assert.deepEqual(fake.writes, [{ op: 'insert', table: 'daily_health_snapshot', row: { user_id: 'member-1', snapshot_date: '2026-10-18', sleep_hours: 7.5 } }]);

  fake = fakeClient({ existing: { id: 'row-1' } });
  res = await post(fake, { sleepQuality: 8, date: '2026-10-18' });
  assert.equal(res.status, 200);
  assert.equal(fake.writes.length, 1);
  assert.deepEqual(fake.writes[0].row, { sleep_quality: 8 });
  assert.deepEqual(fake.writes[0].filters, { id: 'row-1' });
});

// ── Hours typed over a watch's night (Codex P2 on #2398) ──────────────────────
// A device sync stamps sources.sleep_hours; the Home check-in reads the stamp as "a watch's
// night", read-only and never copied. Hours the member types over it must lose the stamp.
const MANUAL = { name: 'merge_snapshot_sources', args: { p_user_id: 'member-1', p_date: '2026-10-18', p_sources: { sleep_hours: 'manual' } } };

test("different hours typed over a watch's night are stamped as the member's", async () => {
  const fake = fakeClient({ existing: { id: 'row-1', sleep_hours: 6.5 } });
  const { status } = await post(fake, { sleepHours: 7.5, date: '2026-10-18' });
  assert.equal(status, 200);
  assert.deepEqual(fake.rpcs, [MANUAL], "the typed hours keep the watch's stamp, so the card locks them as the watch's");
});

test("the Details page re-sending a watch's own hours keeps the watch's stamp", async () => {
  let fake = fakeClient({ existing: { id: 'row-1', sleep_hours: 7.5 } });
  await post(fake, { energy: 6, sleepHours: 7.5, date: '2026-10-18' });
  assert.deepEqual(fake.rpcs, [], "the watch's night was stamped as typed when its own hours were sent back");

  fake = fakeClient({ existing: { id: 'row-1', sleep_hours: 6.5 } });
  await post(fake, { energy: 6, date: '2026-10-18' });
  assert.deepEqual(fake.rpcs, [], 'an answer with no hours stamped the night');

  fake = fakeClient();
  await post(fake, { sleepHours: 7.5, date: '2026-10-18' });
  assert.deepEqual(fake.rpcs, [], 'a new row has no stamp to replace');
});

test('hours written to a row another write just made are stamped, and a failed stamp still saves', async () => {
  let fake = fakeClient({ insertError: { code: '23505' } });
  let res = await post(fake, { sleepHours: 7.5, date: '2026-10-18' });
  assert.equal(res.status, 200);
  assert.deepEqual(fake.rpcs, [MANUAL], "a watch sync that made the row first keeps its stamp over the typed hours");

  fake = fakeClient({ existing: { id: 'row-1', sleep_hours: 6.5 }, rpcError: { message: 'not applied' } });
  res = await post(fake, { sleepHours: 7.5, date: '2026-10-18' });
  assert.equal(res.status, 200, 'a failed stamp failed a check-in that was saved');
});
