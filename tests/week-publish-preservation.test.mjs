import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import * as publish from '../src/lib/week-publish.mjs';
import * as merge from '../src/lib/week-merge.mjs';
import * as gate from '../src/lib/guardrail-gate.mjs';

const clientId = '11111111-1111-4111-8111-111111111111';
const key = '22222222-2222-4222-8222-222222222222';
const upperId = '33333333-3333-4333-8333-333333333333';
const lowerId = '44444444-4444-4444-8444-444444444444';
const opts = { weekStartISO: '2026-08-03', todayISO: '2026-08-03' };
const existing = () => [
  { id: upperId, title: 'Upper', description: null, kind: 'template', scheduled_date: '2026-08-04', payload: { plannedMinutes: 45, plannedRpe: 7, loadCapture: 'per_plan', note: 'Original prescription' } },
  { id: lowerId, title: 'Lower', description: '', kind: 'template', scheduled_date: '2026-08-06', payload: { plannedMinutes: 45, plannedRpe: 7 } },
];
const incoming = () => [{ title: 'Lower', description: 'More rest', kind: 'template', scheduledDate: '2026-08-06', plannedMinutes: 50, plannedRpe: 7, payload: { note: 'Revised' } }];
function mergedRows(rows = existing(), add = incoming()) {
  const merged = merge.bsMergeWeekSessions(rows, add, opts);
  const norm = publish.normalizeWeekRequest({ clientId, idempotencyKey: key, ...opts, capture: merged.capture, sessions: merged.sessions }, opts);
  assert.equal(norm.ok, true);
  return publish.toWorkoutRows(norm.week, { existingRows: rows, bindings: merged.sessions });
}

test('merged publication preserves assignment identities and untouched prescription bytes', () => {
  const rows = mergedRows();
  assert.equal(rows[0].assignmentId, upperId);
  assert.equal(rows[0].description, null);
  assert.deepEqual(rows[0].payload, existing()[0].payload, 'carried plans must not be restamped');
  assert.equal(rows[1].assignmentId, lowerId);
  assert.equal(rows[1].description, 'More rest');
  assert.equal(rows[1].payload.plannedMinutes, 50);
  assert.deepEqual(rows[0].expectedAssignments, existing());
  assert.equal(rows[1].expectedAssignments, undefined);
});

test('request-supplied assignment bindings cannot select another assignment', () => {
  const forged = { ...incoming()[0], title: 'New workout', _assignmentId: upperId, _carryUnchanged: true, assignmentId: upperId, expectedAssignments: [] };
  const rows = mergedRows(existing(), [forged]);
  const added = rows.find(r => r.title === 'New workout');
  assert.equal(added.assignmentId, undefined);
  const norm = publish.normalizeWeekRequest({ clientId, idempotencyKey: key, ...opts, sessions: [forged] }, opts);
  assert.equal(norm.ok, true);
  assert.equal(publish.toWorkoutRows(norm.week)[0].assignmentId, undefined);
  assert.equal(publish.toWorkoutRows(norm.week)[0].expectedAssignments, undefined);
});

const { publishMergedWeekForClient } = await loadRealModule(fileURLToPath(new URL('../src/lib/week-publish-server.ts', import.meta.url)), {
  typescript: true,
  registry: new Map([
    ['@/lib/week-publish.mjs', publish], ['@/lib/week-merge.mjs', merge],
    ['@/lib/guardrail-gate.mjs', gate], ['@/lib/supabase/call-rpc.mjs', { callRpc: async () => ({ error: null }) }],
  ]),
});

test('a content conflict re-reads and re-evaluates the week even when assignment IDs stay the same', async () => {
  let reads = 0, evaluations = 0;
  const calls = [];
  const revised = existing(); revised[0].payload.note = 'Concurrent coach edit';
  const supabase = {
    from(table) {
      assert.equal(table, 'client_workouts');
      const query = { select() { return query; }, eq() { return query; }, gte() { return query; },
        lte() { return Promise.resolve({ data: reads++ ? revised : existing(), error: null }); } };
      return query;
    },
    async rpc(name) { assert.equal(name, 'get_client_load_history'); evaluations++; return { data: { sessions: [], redEnabled: false }, error: null }; },
  };
  const admin = { async rpc(name, body) {
    assert.equal(name, 'publish_client_week'); calls.push(body);
    return calls.length === 1 ? { error: { code: '40001' } } : { data: { status: 'accepted', inserted: 0, replaced: 1 }, error: null };
  } };
  const result = await publishMergedWeekForClient({ supabase, admin, coachUserId: 'coach-a', trainerId: 7,
    clientId, ...opts, incoming: incoming(), mintKey: () => key });
  assert.equal(result.status, 'accepted'); assert.equal(reads, 2); assert.equal(evaluations, 2);
  assert.deepEqual(calls[0].p_expected_row_ids, calls[1].p_expected_row_ids);
  assert.equal(calls[0].p_rows[0].expectedAssignments[0].payload.note, 'Original prescription');
  assert.equal(calls[1].p_rows[0].expectedAssignments[0].payload.note, 'Concurrent coach edit');
  assert.equal(calls[1].p_rows[0].payload.note, 'Concurrent coach edit');
  assert.equal(calls[1].p_rows[1].assignmentId, lowerId);
});

async function publishPreview(rowsByRead, expected, { conflictFirst = false } = {}) {
  let reads = 0, evaluations = 0;
  const writes = [], keys = [];
  const supabase = {
    from() { const query = { select() { return query; }, eq() { return query; }, gte() { return query; },
      lte() { return Promise.resolve({ data: rowsByRead[Math.min(reads++, rowsByRead.length - 1)], error: null }); } }; return query; },
    async rpc() { evaluations++; return { data: { sessions: [], redEnabled: false }, error: null }; },
  };
  const admin = { async rpc(_name, body) { writes.push(body); return conflictFirst && writes.length === 1
    ? { error: { code: '40001' } } : { data: { status: 'accepted' }, error: null }; } };
  const result = await publishMergedWeekForClient({ supabase, admin, coachUserId: 'coach-a', trainerId: 7,
    clientId, ...opts, incoming: incoming(), assignmentPreconditions: expected,
    mintKey: sessions => { keys.push(sessions); return key; } });
  return { result, writes, reads, evaluations, keys };
}

test('a preview refuses a changed or removed prescription and a new client override before any write', async () => {
  const expected = [publish.assignmentSnapshot(existing()[1])];
  for (const scenario of ['edited', 'removed', 'override']) {
    const rows = existing();
    if (scenario === 'edited') rows[1].payload.note = 'Coach changed this after preview';
    if (scenario === 'removed') rows.pop();
    if (scenario === 'override') rows[1].payload.overrides = { reps: 4 };
    const { result, writes, evaluations } = await publishPreview([rows], expected);
    assert.equal(result.status, 'stale_assignment', scenario);
    assert.match(result.error, /Reopen the preview/);
    assert.equal(writes.length, 0); assert.equal(evaluations, 0);
  }
});

test('a race after preview validation rechecks selected snapshots on retry rather than overwriting the winning edit', async () => {
  const revised = existing(); revised[1].description = 'New client-specific instructions';
  const out = await publishPreview([existing(), revised], [publish.assignmentSnapshot(existing()[1])], { conflictFirst: true });
  assert.equal(out.result.status, 'stale_assignment');
  assert.equal(out.reads, 2); assert.equal(out.writes.length, 1); assert.equal(out.evaluations, 1);
});

test('a current preview targets its selected ID and keeps transport metadata out of the replay key', async () => {
  const duplicate = { ...existing()[1], id: '55555555-5555-4555-8555-555555555555' };
  const rows = [existing()[0], duplicate, existing()[1]];
  const out = await publishPreview([rows], [publish.assignmentSnapshot(existing()[1])]);
  assert.equal(out.result.status, 'accepted');
  const changed = out.writes[0].p_rows.find(r => r.description === 'More rest');
  assert.equal(changed.assignmentId, lowerId, 'same-day/title duplicates cannot steal the selected identity');
  assert.ok(out.keys[0].every(row => !('_assignmentId' in row) && !('_carryUnchanged' in row)));
});

test('a future preview that reaches its workout date requires a new review', async () => {
  const rows = existing(); rows[1].scheduled_date = opts.todayISO;
  const result = await publishPreview([rows], [publish.assignmentSnapshot(rows[1])]);
  assert.equal(result.result.status, 'stale_assignment'); assert.equal(result.writes.length, 0);
});

const routeCalls = [];
let routePublish;
const routeDb = { from(table) {
  const query = { select() { return query; }, eq() { return query; }, in() { return query; },
    then(resolve, reject) { return Promise.resolve({ data: table === 'trainers' ? [{ id: 7 }] : [{ client_id: clientId, provider_id: 7 }] }).then(resolve, reject); } };
  return query;
} };
const route = await loadRealModule(fileURLToPath(new URL('../src/app/api/trainer/workout/route.ts', import.meta.url)), {
  typescript: true, registry: new Map([
    ['next/server', { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), { status: init?.status || 200 }) } }],
    ['@/lib/request-auth', { currentUser: async () => ({ id: 'coach-a' }), clientForRequest: async () => routeDb }],
    ['@/lib/supabase/admin', { createAdminClient: () => ({}) }],
    ['@/lib/request-utils', { readJson: async request => ({ ok: true, data: await request.json() }) }],
    ['@/lib/access-guards.mjs', await import('../src/lib/access-guards.mjs')],
    ['@/lib/week-publish.mjs', publish], ['@/lib/week-merge.mjs', merge],
    ['@/lib/week-publish-server', { publishMergedWeekForClient: async args => { routeCalls.push(args); return routePublish; } }],
  ]),
});
const routeRequest = body => new Request('https://shape.test/api/trainer/workout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('the workout route carries validated preview tokens and returns a useful409 for stale selection', async () => {
  routeCalls.length = 0;
  routePublish = { clientId, status: 'stale_assignment', error: 'A selected workout changed after this preview. Reopen the preview and review its latest changes.' };
  const expected = [publish.assignmentSnapshot(existing()[1])];
  const response = await route.POST(routeRequest({ clientIds: [clientId], sessions: incoming(), assignmentPreconditions: expected }));
  assert.equal(response.status, 409);
  const body = await response.json(); assert.equal(body.ok, false); assert.match(body.error, /Reopen the preview/);
  assert.deepEqual(routeCalls[0].assignmentPreconditions, expected);
  assert.equal(routeCalls[0].trainerId, 7);
});

test('malformed previews and foreign clients cannot reach the publisher', async () => {
  routeCalls.length = 0;
  const invalid = await route.POST(routeRequest({ clientIds: [clientId], sessions: incoming(), assignmentPreconditions: [] }));
  assert.equal(invalid.status, 400);
  const foreign = await route.POST(routeRequest({ clientIds: ['66666666-6666-4666-8666-666666666666'], sessions: incoming(), assignmentPreconditions: [publish.assignmentSnapshot(existing()[1])] }));
  assert.equal(foreign.status, 403);
  assert.equal(routeCalls.length, 0);
});
