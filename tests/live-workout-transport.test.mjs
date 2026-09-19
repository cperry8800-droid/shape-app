import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { watchLiveWorkout } from '../public/newdesign/liveWatch.mjs';
import { createLiveWorkoutPublisher } from '../mobile-app/src/services/liveWorkoutPublisher.mjs';
import { bsLiveProgressPayload, bsLiveCoachPayload, bsValidLiveCoachPayload } from '../public/newdesign/liveProgress.mjs';
import { bsLiveAudience } from '../mobile-app/src/services/liveProgress.mjs';

const UID = '12345678-1234-1234-1234-123456789abc';
const OTHER = 'abcdefab-1234-1234-1234-123456789abc';
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const abortable = promise => ({ abortSignal: signal => new Promise((resolve, reject) => {
  const abort = () => reject(new Error('Aborted'));
  if (signal.aborted) { abort(); return; }
  signal.addEventListener('abort', abort, { once: true });
  Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
}) });
const moves = [{ m: 'Squat', sets: 2 }];
const payload = bsLiveProgressPayload(moves, { '0-0': true }, 0, false);
const coachPayload = bsLiveCoachPayload(moves, { '0-0': true }, 0, false, { '0-0': { load: '80', reps: '5', rpe: '8' } });
const row = (p = payload) => ({ user_id: UID, payload: p, started_at: new Date(Date.now() - 5000).toISOString(), updated_at: new Date().toISOString(), expires_at: new Date(Date.now() + 600000).toISOString() });

function fakeDb() {
  const state = { rows: {}, requests: [], handlers: [], channels: [], removed: [], auth: null, read: null };
  const db = {
    from(table) {
      let signal;
      const query = { select: () => query, eq: () => query, gt: () => query, abortSignal: s => { signal = s; return query; }, maybeSingle: () => {
        state.requests.push(table);
        return abortable(state.read ? state.read(table, signal) : Promise.resolve({ data: state.rows[table] || null })).abortSignal(signal);
      } };
      return query;
    },
    channel(name) {
      const channel = { name, on: (_kind, filter, cb) => { state.handlers.push({ channel, filter, cb }); return channel; }, subscribe: cb => { channel.status = cb; state.channels.push(channel); return channel; } };
      return channel;
    },
    removeChannel: channel => state.removed.push(channel),
    auth: { onAuthStateChange: cb => { state.auth = cb; return { data: { subscription: { unsubscribe() {} } } }; } },
  };
  state.event = (table, eventType, r) => state.handlers.filter(h => h.filter.table === table).forEach(h => h.cb({ eventType, [eventType === 'DELETE' ? 'old' : 'new']: r }));
  return { db, state };
}

test('observer recovers a workout that starts while absent/disconnected and filters unrelated deletes', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 100000 });
  const { db, state } = fakeDb(); const changes = [];
  const stop = watchLiveWorkout({ db, clientId: UID.toUpperCase(), onChange: s => changes.push(s) });
  await flush(); assert.equal(changes.at(-1).status, 'idle');
  state.channels[0].status('CHANNEL_ERROR');
  assert.equal(changes.at(-1).status, 'reconnecting');
  state.rows.user_activity_live_coach = row(coachPayload);
  state.channels[0].status('SUBSCRIBED'); await flush();
  assert.equal(changes.at(-1).status, 'live');
  assert.equal(changes.at(-1).coachRow.payload.exercises[0].sets[0].load, '80');
  state.event('user_activity_live_coach', 'DELETE', { user_id: OTHER });
  assert.ok(changes.at(-1).coachRow);
  state.rows.user_activity_live_coach = null;
  t.mock.timers.tick(15000); await flush();
  assert.equal(changes.at(-1).coachRow, null, 'protected empty read must clear revoked access');
  state.rows.user_activity_live_coach = row(coachPayload);
  t.mock.timers.tick(15000); await flush();
  assert.equal(changes.at(-1).status, 'live', 'polling must continue while absent');
  stop(); assert.equal(state.removed.length, 1);
});

test('newer realtime updates and deletes win over slow reads; auth change clears snapshots', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 100000 });
  const { db, state } = fakeDb(); const pending = deferred(); const changes = [];
  state.read = () => pending.promise;
  const stop = watchLiveWorkout({ db, clientId: UID, onChange: s => changes.push(s) });
  state.auth('INITIAL_SESSION', { user: { id: OTHER } });
  state.event('user_activity_live_coach', 'UPDATE', row(coachPayload));
  state.event('user_activity_live_coach', 'DELETE', { user_id: UID });
  pending.resolve({ data: row(coachPayload) }); await flush();
  assert.equal(changes.at(-1).coachRow, null);
  state.event('user_activity_live_coach', 'UPDATE', row(coachPayload));
  state.auth('SIGNED_IN', { user: { id: UID } });
  assert.equal(changes.at(-1).coachRow, null);
  assert.equal(changes.at(-1).publicRow, null);
  const count = changes.length;
  state.event('user_activity_live_coach', 'UPDATE', row(coachPayload));
  t.mock.timers.tick(60000); await flush();
  assert.equal(changes.length, count, 'cleaned-up observers must ignore late work');
  stop();
});

test('source heartbeat age is stale after 45 seconds and expired rows are retired', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 100000 });
  const { db, state } = fakeDb(); const changes = [];
  state.rows.user_activity_live = { ...row(), expires_at: new Date(160000).toISOString() };
  const stop = watchLiveWorkout({ db, clientId: UID, onChange: s => changes.push(s) });
  await flush(); assert.equal(changes.at(-1).status, 'live');
  t.mock.timers.tick(45000); await flush(); assert.equal(changes.at(-1).status, 'stale');
  t.mock.timers.tick(15000); await flush(); assert.equal(changes.at(-1).status, 'idle');
  stop();
});

test('a read slower than the polling interval settles before the coalesced refresh', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now: 100000 });
  const { db, state } = fakeDb(); const changes = []; const pending = deferred();
  state.read = () => pending.promise;
  const stop = watchLiveWorkout({ db, clientId: UID, onChange: s => changes.push(s) });
  t.mock.timers.tick(18000); await flush();
  assert.equal(state.requests.length, 2, 'periodic refresh must not start overlapping reads');
  state.read = null; state.rows.user_activity_live_coach = row(coachPayload);
  pending.resolve({ data: row(coachPayload) }); await flush();
  assert.ok(changes.some(s => s.coachRow), 'the slow read was starved by a polling revision');
  assert.equal(state.requests.length, 4, 'missed refreshes should coalesce to one per table');
  stop();
});

test('stalled observer reads are aborted and queued refresh recovers; cleanup aborts pending reads', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now: 100000 });
  const { db, state } = fakeDb(); const changes = []; const signals = [];
  state.read = (_table, signal) => { signals.push(signal); return new Promise(() => {}); };
  const stop = watchLiveWorkout({ db, clientId: UID, onChange: s => changes.push(s) });
  t.mock.timers.tick(15000); await flush();
  state.read = null; state.rows.user_activity_live_coach = row(coachPayload);
  t.mock.timers.tick(5000); await flush();
  assert.ok(signals.every(s => s.aborted));
  assert.ok(changes.at(-1).coachRow, 'timed-out read must release the pending refresh');
  state.read = (_table, signal) => { signals.push(signal); return new Promise(() => {}); };
  state.channels[0].status('SUBSCRIBED'); await flush(); stop();
  assert.ok(signals.every(s => s.aborted), 'unmount must cancel its requests');
});

test('publisher sends corrected completed inputs, retries failure and sends unchanged heartbeats', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const calls = []; let failures = 1, clears = 0;
  const publisher = createLiveWorkoutPublisher({ startedAt: '2026-09-19T10:00:00Z', clear: () => clears++, push: async (...args) => { calls.push(args); return failures-- <= 0; } });
  publisher.update(payload, coachPayload); t.mock.timers.tick(0); await flush();
  assert.equal(calls.length, 1);
  t.mock.timers.tick(4000); await flush();
  assert.equal(calls.length, 2); assert.equal(calls[1][1], true, 'failed first write must retain session start stamp');
  const corrected = structuredClone(coachPayload); corrected.exercises[0].sets[0].load = '85';
  publisher.update(payload, corrected); t.mock.timers.tick(4000); await flush();
  assert.equal(calls[2][2].coachPayload.exercises[0].sets[0].load, '85');
  assert.equal(calls[2][2].startedAt, '2026-09-19T10:00:00Z');
  t.mock.timers.tick(15000); await flush(); assert.equal(calls.length, 4);
  publisher.update(payload, corrected, false); assert.equal(clears, 1);
  t.mock.timers.tick(60000); await flush(); assert.equal(calls.length, 4);
  publisher.stop();
});

test('publisher coalesces updates during a pending write and cannot restart after stop', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const pending = deferred(); const calls = [];
  const publisher = createLiveWorkoutPublisher({ clear() {}, push: (...args) => { calls.push(args); return calls.length === 1 ? pending.promise : Promise.resolve(true); } });
  publisher.update(payload, coachPayload); t.mock.timers.tick(0);
  const corrected = structuredClone(coachPayload); corrected.exercises[0].sets[0].reps = '6';
  publisher.update(payload, corrected); pending.resolve(true); await flush();
  t.mock.timers.tick(4000); await flush();
  assert.equal(calls.length, 2); assert.equal(calls[1][2].coachPayload.exercises[0].sets[0].reps, '6');
  publisher.stop(); publisher.update(payload, coachPayload); t.mock.timers.tick(60000); await flush();
  assert.equal(calls.length, 2);
});

function backend(db, user = UID) {
  const source = readFileSync(new URL('../mobile-app/src/services/shapeBackend.js', import.meta.url), 'utf8');
  const begin = source.indexOf('let _liveGen = 0;'); const end = source.indexOf('window.ShapeNutritionLogs =', begin);
  const state = { user: { id: user } }; let gen = 0;
  const context = vm.createContext({ window: {}, supabase: db, state, bsLiveAudience, watchLiveWorkout, signOutGen: () => gen, Date, Promise, AbortController, setTimeout, clearTimeout });
  vm.runInContext(source.slice(begin, end), context);
  return { api: context.window.ShapeLiveProgress, state, signOut: () => { gen++; } };
}

test('backend cannot publish an old account payload after identity changes during audience read', async () => {
  const pending = deferred(); const writes = [];
  const db = { from: table => {
    const query = { select: () => query, eq: () => query, maybeSingle: () => abortable(pending.promise), upsert: r => { writes.push({ table, r }); return abortable(Promise.resolve({})); } }; return query;
  } };
  const { api, state } = backend(db);
  const push = api.push(payload, true, { coachPayload }); await flush();
  state.user = { id: OTHER }; pending.resolve({ data: { data: {} } });
  assert.equal(await push, false); assert.equal(writes.length, 0);
});

test('backend retains originating uid and resume start while reporting failed writes for retry', async () => {
  const writes = [];
  const db = { from: table => ({ upsert: r => { writes.push({ table, r }); return abortable({ error: table.endsWith('_coach') ? new Error('Offline') : null }); } }) };
  const { api } = backend(db);
  assert.equal(await api.push(payload, true, { coachPayload, visOverride: 'public', startedAt: '2026-09-19T10:00:00Z' }), false);
  assert.equal(writes.length, 2);
  assert.ok(writes.every(w => w.r.user_id === UID && w.r.started_at === '2026-09-19T10:00:00Z'));
});

test('workout end waits for an in-flight write and prevents queued progress from resurrecting it', async () => {
  const pending = deferred(); const operations = [];
  const db = {
    from: table => ({ upsert: () => { operations.push(table); return abortable(pending.promise); } }),
    rpc: name => { operations.push(name); return abortable({}); },
  };
  const { api } = backend(db);
  const first = api.push(payload, true, { coachPayload, visOverride: 'public' }); await flush();
  const queued = api.push(payload, false, { coachPayload, visOverride: 'public' });
  const end = api.clear();
  assert.deepEqual(operations, ['user_activity_live']);
  pending.resolve({}); await Promise.all([first, queued, end]);
  assert.deepEqual(operations, ['user_activity_live', 'live_clear']);
});

test('sign-out generation invalidates queued writes even before cached identity clears', async () => {
  const pending = deferred(); const writes = [];
  const db = { from: table => {
    const query = { select: () => query, eq: () => query, maybeSingle: () => abortable(pending.promise), upsert: r => { writes.push({ table, r }); return abortable(Promise.resolve({})); } }; return query;
  } };
  const { api, signOut } = backend(db);
  const push = api.push(payload, true, { coachPayload }); await flush();
  signOut(); pending.resolve({ data: { data: {} } });
  assert.equal(await push, false); assert.equal(writes.length, 0);
});

test('an old workout cleanup cannot clear or cancel the new account workout', async () => {
  const operations = []; const pending = deferred(); let signal;
  const db = {
    from: table => ({ upsert: () => ({ abortSignal: s => { signal = s; operations.push(table); return abortable(pending.promise).abortSignal(s); } }) }),
    rpc: name => { operations.push(name); return abortable({}); },
  };
  const { api } = backend(db, OTHER);
  const push = api.push(payload, true, { coachPayload, visOverride: 'public' }); await flush();
  assert.equal(await api.clear(UID), false);
  assert.equal(signal.aborted, false);
  pending.resolve({}); await push;
  assert.deepEqual(operations, ['user_activity_live', 'user_activity_live_coach']);
});

test('a stalled write is actually aborted at its deadline and releases the serialized clear', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const operations = []; let signal;
  const db = {
    from: table => ({ upsert: () => ({ abortSignal: s => { signal = s; operations.push(table); return abortable(new Promise(() => {})).abortSignal(s); } }) }),
    rpc: name => { operations.push(name); return abortable({}); },
  };
  const { api } = backend(db);
  const push = api.push(payload, true, { coachPayload, visOverride: 'public' }); await flush();
  t.mock.timers.tick(15000); await flush();
  assert.equal(signal.aborted, true); assert.equal(await push, false);
  await api.clear(UID);
  assert.deepEqual(operations, ['user_activity_live', 'live_clear']);
});

test('a stalled clear RPC is aborted before bounded owner-scoped fallback deletes', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const operations = []; let signal;
  const db = {
    rpc: () => ({ abortSignal: s => { signal = s; return abortable(new Promise(() => {})).abortSignal(s); } }),
    from: table => ({ delete: () => ({ eq: (_key, uid) => { operations.push([table, uid]); return abortable({}); } }) }),
  };
  const { api } = backend(db);
  const cleared = api.clear(UID); await flush(); t.mock.timers.tick(15000); await flush(); await cleared;
  assert.equal(signal.aborted, true);
  assert.deepEqual(operations, [['user_activity_live', UID], ['user_activity_live_coach', UID]]);
});

test('BSSession cleanup delegates through the originating identity guard', () => {
  const source = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('  const clearLiveWorkout = () => {', source.indexOf('function BSSession('));
  const end = source.indexOf('  const liveRef =', start);
  const calls = []; let current = OTHER;
  const context = vm.createContext({ identity: { userId: UID }, bsSetMyActivity: value => calls.push(['activity', value]), window: {
    ShapeAuth: { getCachedState: () => ({ user: { id: current } }) },
    ShapeLiveProgress: { clear: uid => calls.push(['clear', uid]) },
  } });
  vm.runInContext(source.slice(start, end) + '\nclearLiveWorkout();', context);
  assert.deepEqual(calls, []);
  current = UID; vm.runInContext('clearLiveWorkout();', context);
  assert.deepEqual(calls, [['activity', null], ['clear', UID]]);
});

test('coach unit is preserved only when explicitly supplied and known', () => {
  assert.equal(bsValidLiveCoachPayload({ ...coachPayload, loadUnit: 'kg' }).loadUnit, 'kg');
  assert.equal(bsValidLiveCoachPayload(coachPayload).loadUnit, undefined);
  assert.equal(bsValidLiveCoachPayload({ ...coachPayload, loadUnit: 'stones' }).loadUnit, undefined);
});
