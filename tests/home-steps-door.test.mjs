// tests/home-steps-door.test.mjs
//
// This week's Steps opens the Shape Steps page (owner, 2026-11-04: "yes put it back on this week steps"),
// or Integrations once the steps read says nothing has ever synced. Codex P2 on #2601: while the read was
// still pending, hasData was false for a member whose steps do sync, so a tap in that first second sent
// them to Integrations. useBSStepsToday now says when its read has answered (`known`), and Home opens the
// page until it has (the page reads the steps itself).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadBroadsheet, SHIM, SRC } from './helpers/broadsheet-mount.mjs';

// A small React for one hook: state kept across calls, effects collected and run by the test.
const cells = [];
let idx = 0;
let effects = [];
const R = {
  ...SHIM,
  useState(init) {
    const i = idx++;
    if (!(i in cells)) cells[i] = typeof init === 'function' ? init() : init;
    return [cells[i], (next) => { cells[i] = typeof next === 'function' ? next(cells[i]) : next; }];
  },
  useEffect(fn) { effects.push(fn); },
};
const { useBSStepsToday } = await loadBroadsheet(['useBSStepsToday'], R);
const CLIENT = readFileSync(SRC, 'utf8');

const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const settle = () => new Promise((r) => setTimeout(r, 0));
// Mount the hook once (running its effects; the step goal's listens on a window the harness lacks), then
// read it again once the steps read has had its turn.
async function read(progress, signedIn = true) {
  cells.length = 0; idx = 0; effects = [];
  globalThis.window.ShapeAuth = { getCachedState: () => ({ user: signedIn ? { id: 'member-1' } : null }) };
  globalThis.window.ShapeProgress = progress ? { progress } : undefined;
  const first = useBSStepsToday();
  for (const fx of effects) { try { fx(); } catch (e) { /* the step goal's window listener */ } }
  await settle();
  idx = 0; effects = [];
  return { first, after: useBSStepsToday() };
}

test('the steps read: unknown until it answers, then whether anything ever synced', async () => {
  // Pending: nothing known, so nothing may read as "never synced".
  const pending = await read(() => new Promise(() => {}));
  assert.equal(pending.after.known, false);
  assert.equal(pending.after.hasData, false);
  // Answered with history: known, has data.
  const synced = await read(() => Promise.resolve({ series: { steps: [{ date: todayIso(), value: 6400 }] } }));
  assert.equal(synced.first.known, false, 'unknown before the read answers');
  assert.equal(synced.after.known, true);
  assert.equal(synced.after.hasData, true);
  assert.equal(synced.after.val, 6400);
  // Answered with nothing ever synced: known, no data (Integrations is right).
  const never = await read(() => Promise.resolve({ series: { steps: [] } }));
  assert.equal(never.after.known, true);
  assert.equal(never.after.hasData, false);
  // A failed read stays unknown: the page reads for itself.
  const failed = await read(() => Promise.reject(new Error('offline')));
  assert.equal(failed.after.known, false);
  // Signed out (the preview): its sample, known.
  const preview = await read(null, false);
  assert.equal(preview.after.known, true);
  assert.equal(preview.after.hasData, true);
});

test('Home opens the Shape Steps page until the read says nothing has synced, then Integrations', () => {
  const mount = CLIENT.slice(CLIENT.indexOf('<BSHomeWeekBars'), CLIENT.indexOf('</BSHomeDeck>'));
  assert.match(mount, /onSteps=\{\(\) => \{\s*if \(stepsToday\.hasData \|\| !stepsToday\.known\) \{ setStepsHistory\(true\); return; \}\s*try \{ window\.dispatchEvent\(new CustomEvent\('shape:openIntegrations'\)\); \} catch \(e\) \{\}\s*\}\}/);
});
