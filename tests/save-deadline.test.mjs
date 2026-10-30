// The check-in and water saves end after a deadline (shapeBackend.js, postWithDeadline).
//
// They go through Home's one-at-a-time lines (bsCiEnqueue, BSCheckinCard.jsx), so a request the
// network held kept every later answer and glass waiting for good. Past the deadline the save rejects
// with `timedOut`: it may still have landed, which the card and the water line handle (their tests:
// checkin-card.test.mjs, water-line.test.mjs). These run the shipped data layer on fake timers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../mobile-app/src/services/shapeBackend.js', import.meta.url), 'utf8');
const slice = (from, to) => {
  const a = SRC.indexOf(from);
  const b = SRC.indexOf(to, a);
  assert.ok(a > 0 && b > a, `${from} moved in shapeBackend.js`);
  return SRC.slice(a, b);
};
const HELPER = slice('const SAVE_DEADLINE_MS', '// Daily check-in (mood)');
const LOG = slice('async function logCheckin(', 'window.ShapeCheckin = ');
const ADD = slice('async function addHydration(', 'window.ShapeHydration = ');
const DEADLINE = Number(/const SAVE_DEADLINE_MS = (\d+);/.exec(HELPER)[1]);

// The data layer with `fetch` (and optionally AbortController) supplied.
function layer(fetch, { abort = true } = {}) {
  const AC = abort ? AbortController : undefined;
  return new Function('fetch', 'AbortController', 'apiBaseUrl', 'sessionsAuthHeaders', '_localDate', 'invalidateClientMetrics',
    HELPER + LOG + ADD + '\nreturn { logCheckin, addHydration };')(
    fetch, AC, 'https://theshapecommunity.com', (h) => ({ Authorization: 'Bearer t', ...h }), () => '2026-10-30', () => {});
}
const never = () => new Promise(() => {});
const ok = (body) => ({ ok: true, json: async () => body });

// Settles `p` (or reports it pending) after the fake clock has moved `ms`.
async function after(timers, p, ms) {
  let out = { pending: true };
  p.then((v) => { out = { value: v }; }, (e) => { out = { error: e }; });
  timers.tick(ms);
  // setImmediate is not on the fake clock: two turns let every promise chain behind the tick run.
  for (let i = 0; i < 2; i++) await new Promise((r) => setImmediate(r));
  return out;
}

test('the deadline is a bound a person waits through, not a hair trigger', () => {
  assert.ok(DEADLINE >= 8000 && DEADLINE <= 30000, 'SAVE_DEADLINE_MS is ' + DEADLINE);
});

test('a save the network holds rejects at the deadline, flagged as one that may have landed', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const [name, run] of [['check-in', (L) => L.logCheckin({ energy: 7 })], ['water', (L) => L.addHydration(0.25)]]) {
    let signal = null;
    const L = layer(async (url, init) => { signal = init.signal; return never(); });
    const p = run(L);
    const early = await after(t.mock.timers, p, DEADLINE - 1);
    assert.equal(early.pending, true, `${name}: gave up before the deadline`);
    const late = await after(t.mock.timers, p, 1);
    assert.ok(late.error, `${name}: still waiting past the deadline`);
    assert.equal(late.error.timedOut, true, `${name}: a held save was not flagged timedOut`);
    assert.equal(signal && signal.aborted, true, `${name}: the held request was never aborted`);
  }
});

test('an answer whose body never arrives ends at the deadline too', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const L = layer(async () => ({ ok: true, json: never }));
  const out = await after(t.mock.timers, L.addHydration(0.25), DEADLINE);
  assert.equal(out.error && out.error.timedOut, true, 'a held body kept the save waiting');
});

test('without AbortController (an older WebView) the deadline still holds', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const L = layer(async () => never(), { abort: false });
  const out = await after(t.mock.timers, L.logCheckin({ energy: 7 }), DEADLINE);
  assert.equal(out.error && out.error.timedOut, true);
});

test('a save that answers in time is the answer, and a refusal is a failure, never a late one', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  let answer = ok({ ok: true, hydrationL: 1.25 });
  const L = layer(async (url, init) => { calls.push([url, init]); return answer; });
  const saved = await after(t.mock.timers, L.addHydration(0.25), 0);
  assert.deepEqual(saved.value, { ok: true, hydrationL: 1.25 });
  assert.equal(calls[0][0], 'https://theshapecommunity.com/api/client/hydration');
  assert.deepEqual(JSON.parse(calls[0][1].body), { deltaL: 0.25, date: '2026-10-30' });
  assert.equal(calls[0][1].headers.Authorization, 'Bearer t', 'the installed app saves without its token');
  // Once answered, the deadline is cleared: nothing fires later.
  assert.equal((await after(t.mock.timers, Promise.resolve(), DEADLINE * 2)).value, undefined);

  answer = { ok: false, json: async () => ({ error: 'Could not save check-in.' }) };
  const refused = await after(t.mock.timers, L.logCheckin({ energy: 7 }), 0);
  assert.equal(refused.error && refused.error.message, 'Could not save check-in.');
  assert.notEqual(refused.error.timedOut, true, 'a refusal read as a save that may have landed');

  const L2 = layer(async () => { throw new Error('offline'); });
  const offline = await after(t.mock.timers, L2.addHydration(0.25), 0);
  assert.equal(offline.error && offline.error.message, 'offline');
  assert.notEqual(offline.error.timedOut, true);
});
