// Remembered dashboard choices (review 2026-09-09, R16): the roster tab and filter,
// the Progress trend, and the Schedule view survive a visit.
//
// ⚠ THE SHIPPED HOOKS ARE EXECUTED, NOT RESTATED. `useCoachDoc` is nine review rounds
// of account binding, serial writes, optimistic paint and rollback, and the whole
// question this suite exists to answer is how the new reconciliation effect behaves
// AGAINST that — a stub store would answer a question nobody asked. So the real
// helpers, the real store and the real choice hook are lifted out of the source and
// run together on a re-rendering React host, and every assertion is about what the
// member ends up with. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

const DATA = readFileSync(new URL('../public/newdesign/dashData.jsx', import.meta.url), 'utf8');
const SRC = stripComments(DATA);

// ── lift the shipped source ──────────────────────────────────────────────────
function region(from, to) {
  const a = SRC.indexOf(from);
  const b = SRC.indexOf(to, a + from.length);
  assert.ok(a >= 0, 'region start not found: ' + from);
  assert.ok(b > a, 'region end not found: ' + to);
  return SRC.slice(a, b);
}
const HELPERS = region('async function dashDocBridge', 'function useCoachDoc(');
const STORE = region('function useCoachDoc(', 'function goalMetricUnit(');
const CHOICE = region('function useRememberedChoices(', 'Object.assign(window,');

// The three regions really are the shipped ones, and the lift really lifted something.
test('the suite is running the shipped hooks, not an empty string', () => {
  assert.match(HELPERS, /function dashDocSerial\(fn\)/);
  assert.match(STORE, /pendingRef/);
  assert.match(CHOICE, /function useRememberedChoice\(store, key, allowed, fallback\)/);
  assert.ok(CHOICE.length > 400, 'the choice hook lifted as a stub');
});

// ── a re-rendering React host ────────────────────────────────────────────────
// Enough of React to run these hooks honestly: state that re-renders, refs that
// survive, effects that re-run only when their deps move.
function makeHost(body) {
  const cells = { state: [], ref: [], effect: [] };
  let si = 0, ri = 0, ei = 0, dirty = false, renders = 0;
  const React = {
    useState(init) {
      const i = si++;
      if (cells.state.length <= i) cells.state.push(typeof init === 'function' ? init() : init);
      return [cells.state[i], (v) => {
        const cur = cells.state[i];
        const next = typeof v === 'function' ? v(cur) : v;
        if (!Object.is(next, cur)) { cells.state[i] = next; dirty = true; }
      }];
    },
    useRef(v) { const i = ri++; if (cells.ref.length <= i) cells.ref.push({ current: v }); return cells.ref[i]; },
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useEffect(fn, deps) {
      const i = ei++;
      const prev = cells.effect[i];
      const same = prev && prev.deps && deps && prev.deps.length === deps.length
        && deps.every((d, k) => Object.is(d, prev.deps[k]));
      cells.effect[i] = { deps, pending: same ? null : fn, cleanup: prev ? prev.cleanup : null };
    },
  };
  let out = null;
  const render = () => {
    renders += 1; si = 0; ri = 0; ei = 0;
    out = body(React);
    for (const e of cells.effect) {
      if (e && e.pending) { const f = e.pending; e.pending = null; if (typeof e.cleanup === 'function') e.cleanup(); e.cleanup = f() || null; }
    }
    return out;
  };
  // A fixed number of rounds, always: a bounded driver is what lets a runaway
  // write loop show up as a COUNT rather than as a hung test.
  const flush = async (rounds = 25) => {
    render();
    for (let i = 0; i < rounds; i++) {
      for (let k = 0; k < 8; k++) await Promise.resolve();
      if (dirty) { dirty = false; render(); }
    }
    return out;
  };
  return { flush, get renders() { return renders; }, get out() { return out; } };
}

function makeDb(doc, opts) {
  const o = opts || {};
  const state = { doc: { ...doc }, gets: 0, saves: 0, written: [] };
  const db = {
    getSession: async () => ({}),
    getUser: async () => (o.uid === null ? null : { id: o.uid || 'coach-a' }),
    getUserGoals: async () => { state.gets += 1; return o.readFails ? null : { ...state.doc }; },
    saveUserGoals: async (kind, val) => {
      state.saves += 1; state.written.push({ kind, val });
      if (o.saveFails) return { error: 'nope' };
      state.doc = val; return { data: val };
    },
  };
  return { db, state };
}

// One page: a store and one or two choices off it, driven exactly as a page does.
function drivePage(dbState, opts) {
  const o = opts || {};
  const keys = o.keys || [{ key: 'rosterFilter', allowed: ['all', 'eyes', 'new', 'ontrack'], fallback: 'all' }];
  const ctl = { live: o.live !== false, chose: null };
  const hooks = new Function('React', 'window', HELPERS + '\n' + STORE + '\n' + CHOICE +
    '\nreturn { useRememberedChoices, useRememberedChoice };');
  const host = makeHost((React) => {
    const api = hooks(React, { shapeDb: dbState.db });
    const prefs = api.useRememberedChoices(ctl.live);
    const out = { kind: prefs.kind, doc: prefs.doc, values: {}, choose: {} };
    for (const k of keys) {
      const [v, choose] = api.useRememberedChoice(prefs, k.key, k.allowed, k.fallback);
      out.values[k.key] = v; out.choose[k.key] = choose;
    }
    return out;
  });
  return { host, ctl };
}

// ── what the member ends up with ─────────────────────────────────────────────
test('a stored choice is applied on the next visit', async () => {
  const db = makeDb({ rosterFilter: 'eyes' });
  const { host } = drivePage(db);
  const out = await host.flush();
  assert.equal(out.values.rosterFilter, 'eyes', 'the roster did not come back filtered');
  assert.equal(db.state.saves, 0, 'reading a preference wrote to the document');
});

test('a stored value this build does not recognise is IGNORED, never applied', async () => {
  // ⚠ THE FAILURE MODE IS AN EMPTY ROSTER WITH NO EXPLANATION. A filter retired since
  // the coach chose it would select nothing, and the page would look broken rather
  // than defaulted.
  const db = makeDb({ rosterFilter: 'retired-filter' });
  const { host } = drivePage(db);
  const out = await host.flush();
  assert.equal(out.values.rosterFilter, 'all', 'an unknown stored filter was applied anyway');
  // and it is left alone rather than tidied away: it may belong to a build that has it
  assert.equal(db.state.saves, 0, 'an unrecognised key was deleted on sight');
  assert.equal(db.state.doc.rosterFilter, 'retired-filter');
});

test('a choice already made is not yanked away by the document arriving late', async () => {
  const db = makeDb({ rosterFilter: 'eyes' });
  const { host } = drivePage(db);
  // choose on the very first paint, before the hydrate has resolved
  host.flush(0);
  const first = host.out;
  first.choose.rosterFilter('new');
  const out = await host.flush();
  assert.equal(out.values.rosterFilter, 'new', 'the stored value moved a control out from under the coach');

  // ⚠ AND THE PRECEDENCE HAS TO BE PINNED WHERE THE WRITE CANNOT REPAIR IT. With a
  // healthy store the reconciliation writes the choice into the document, so reading
  // the document first LOOKS correct one tick later — measured: reversing the
  // precedence survived this test until the save was made to fail. When the write
  // cannot land, precedence is the only thing holding the coach's choice on screen.
  const db2 = makeDb({ rosterFilter: 'eyes' }, { saveFails: true });
  const p2 = drivePage(db2);
  p2.host.flush(0);
  p2.host.out.choose.rosterFilter('new');
  const out2 = await p2.host.flush();
  assert.equal(out2.doc.rosterFilter, 'eyes', 'setup: the failed write did not roll back');
  assert.equal(out2.values.rosterFilter, 'new',
    'a document that could not be updated pulled the control back off the coach\'s choice');
});

test('choosing what is already stored writes nothing', async () => {
  // A coach clicking the filter they are already on is not a change, and a preference
  // store that upserts an identical document on every click is a round trip per click.
  const db = makeDb({ rosterFilter: 'eyes' });
  const { host } = drivePage(db);
  const out = await host.flush();
  assert.equal(out.values.rosterFilter, 'eyes');
  out.choose.rosterFilter('eyes');
  await host.flush();
  assert.equal(db.state.saves, 0, 'clicking the current filter wrote it back to the document');
  // and the same for the default when there is nothing stored
  const db3 = makeDb({});
  const p3 = drivePage(db3);
  const o3 = await p3.host.flush();
  o3.choose.rosterFilter('all');
  await p3.host.flush();
  assert.equal(db3.state.saves, 0, 'choosing the default with nothing stored wrote an empty change');
});

test('choosing the default DELETES the key rather than storing it', async () => {
  // ⚠ STORING TODAY'S DEFAULT PINS IT. A member who explicitly chose the default would
  // never receive a changed default, and the row would say "preference: whatever we
  // happened to ship in September".
  const db = makeDb({ rosterFilter: 'eyes', clientsTab: 'shared' });
  const { host } = drivePage(db, { keys: [
    { key: 'rosterFilter', allowed: ['all', 'eyes', 'new', 'ontrack'], fallback: 'all' },
  ] });
  const out = await host.flush();
  out.choose.rosterFilter('all');
  await host.flush();
  assert.equal(db.state.saves, 1);
  const written = db.state.written[0].val;
  assert.ok(!('rosterFilter' in written), 'the default was stored as a preference');
  assert.equal(written.clientsTab, 'shared', 'the merge dropped a key it was not asked about');
});

test('a choice made before the store is writable is saved once it becomes writable', async () => {
  // ⚠ THIS IS WHY THE WRITE IS AN EFFECT AND NOT A CLICK HANDLER. `useDashboard` reads
  // demo until its fetch resolves, so a coach who clicks Week in the first moment of a
  // page load had nowhere to put it — a handler would have dropped it in silence.
  const db = makeDb({});
  const { host, ctl } = drivePage(db, { live: false });
  const out = await host.flush(2);
  assert.equal(out.kind, 'demo');
  out.choose.rosterFilter('eyes');
  await host.flush(2);
  assert.equal(db.state.saves, 0, 'a preview visitor wrote to a document');
  assert.equal(host.out.values.rosterFilter, 'eyes', 'the choice did not take effect in the session');
  ctl.live = true;                       // the roster resolves live
  await host.flush();
  assert.equal(db.state.saves, 1, 'the choice was never retried once the store could take it');
  assert.equal(db.state.written[0].val.rosterFilter, 'eyes');
  assert.equal(host.out.values.rosterFilter, 'eyes');
});

test('a FAILED write is attempted once — never retried in a loop', async () => {
  // ⚠ THE LOOP IS REAL AND THE ROLLBACK IS WHAT CAUSES IT. `apply` paints optimistically
  // and rolls the paint back when the save fails, so the stored value moves to the
  // wanted value and then back — a dependency change, which re-runs the effect, which
  // writes again. Keying the attempt on the CHOICE rather than on the document is the
  // only thing standing between this and an infinite write loop against Supabase.
  const db = makeDb({}, { saveFails: true });
  const { host } = drivePage(db);
  const out = await host.flush();
  out.choose.rosterFilter('eyes');
  await host.flush(25);
  assert.equal(db.state.saves, 1, 'a failed preference write retried in a loop: ' + db.state.saves + ' saves');
  assert.ok(host.renders < 25, 'the page re-rendered on every round — a render loop');
  // and the choice still governs the session; it is simply not kept
  assert.equal(host.out.values.rosterFilter, 'eyes', 'a failed save also discarded the choice');
});

test('a second choice after a failure is still attempted', async () => {
  const db = makeDb({}, { saveFails: true });
  const { host } = drivePage(db);
  const out = await host.flush();
  out.choose.rosterFilter('eyes');
  await host.flush(6);
  host.out.choose.rosterFilter('new');
  await host.flush(10);
  assert.equal(db.state.saves, 2, 'one failure disabled saving for the rest of the session');
  assert.equal(db.state.written[1].val.rosterFilter, 'new');
});

test('two controls share ONE document read, and neither write loses the other key', async () => {
  const db = makeDb({});
  const { host } = drivePage(db, { keys: [
    { key: 'clientsTab', allowed: ['all', 'shared'], fallback: 'all' },
    { key: 'rosterFilter', allowed: ['all', 'eyes', 'new', 'ontrack'], fallback: 'all' },
  ] });
  const out = await host.flush();
  assert.equal(db.state.gets, 1, 'the page read the same document ' + db.state.gets + ' times');
  out.choose.clientsTab('shared');
  await host.flush();
  host.out.choose.rosterFilter('eyes');
  await host.flush();
  assert.deepEqual(db.state.doc, { clientsTab: 'shared', rosterFilter: 'eyes' });
  assert.equal(host.out.values.clientsTab, 'shared');
  assert.equal(host.out.values.rosterFilter, 'eyes');
});

test('a value outside the allowlist governs the session but is never written', async () => {
  const db = makeDb({});
  const { host } = drivePage(db);
  const out = await host.flush();
  out.choose.rosterFilter('something-else');
  await host.flush();
  assert.equal(db.state.saves, 0, 'a value we would refuse to read back was written anyway');
});

test('the store is bound to the account, and an unresolvable one refuses the write', async () => {
  // Inherited from useCoachDoc rather than re-implemented — but inheritance is a claim,
  // so it is driven: `getUser` answering null must not upsert into someone's row.
  const db = makeDb({}, { uid: null });
  const { host } = drivePage(db);
  const out = await host.flush();
  out.choose.rosterFilter('eyes');
  await host.flush();
  assert.equal(db.state.saves, 0, 'a write went out with no account behind it');
});

// ── the wiring ───────────────────────────────────────────────────────────────
const page = (f) => stripComments(readFileSync(new URL('../public/newdesign/' + f, import.meta.url), 'utf8'));

test('the four controls are wired, and the search box deliberately is not', () => {
  for (const [f, pre] of [['trainerClientsPage.jsx', 'TCP'], ['nutritionistClientsPage.jsx', 'NCP']]) {
    const s = page(f);
    assert.match(s, /useRememberedChoice\(prefs, "clientsTab", \["all", "shared"\], "all"\)/, f);
    // \u26a0 THE ALLOWLIST IS DERIVED FROM THE FILTER SET, NOT TYPED OUT BESIDE IT. A guard
    // that pinned the literal would have FAILED this very fix, which is the trap the
    // house records post-mortem three times over.
    assert.match(s, new RegExp('useRememberedChoice\\(prefs, "rosterFilter", ' + pre + '_FILTER_KEYS, "all"\\)'), f);
    assert.match(s, new RegExp('const ' + pre + '_FILTER_KEYS = ' + pre + '_FILTERS\\(0\\)\\.map\\(\\(f\\) => f\\[0\\]\\)'), f);
    assert.match(s, new RegExp('const FILTERS = ' + pre + '_FILTERS\\(eyesCount\\)'), f + ': the rendered filters stopped coming from the hoisted set');
    // ⚠ A HALF-TYPED NAME IS A MOMENT, NOT A PREFERENCE. Restoring it would show a coach
    // a roster mysteriously narrowed to "pri" a week later.
    assert.match(s, /const \[q, setQ\] = React\.useState\(""\)/, f + ': the search box became sticky');
    assert.equal((s.match(/useRememberedChoices\(/g) || []).length, 1, f + ': more than one store per page');
  }
  const prog = page('dashProgress.jsx');
  assert.match(prog, /useRememberedChoice\(prefs, "progressTrend", DPR_TREND_KEYS, "weight"\)/);
  // ⚠ THE ALLOWLIST IS DERIVED FROM THE TAB LIST, so a tab added later is remembered
  // without anyone noticing a second list exists.
  assert.match(prog, /const DPR_TREND_KEYS = DPR_TREND_TABS\.map\(\(t\) => t\.k\)/);
  assert.ok(!/React\.useState\("weight"\)/.test(prog), 'the trend tab went back to plain state');
  const sched = page('dashSchedule.jsx');
  assert.match(sched, /useRememberedChoice\(prefs, "scheduleView", \["month", "week"\], "month"\)/);
  assert.ok(!/React\.useState\("month"\)/.test(sched), 'the schedule view went back to plain state');
});

test('every host page loads dashData.jsx before the module that now needs it', () => {
  // ⚠ CLASSIC SCRIPTS, SO THIS IS A REAL FAILURE MODE. `dashProgress.jsx` referenced
  // nothing from `dashData.jsx` before this change, and `ClientProgress.html` did not
  // load it — the reference would have been a ReferenceError on any page that rendered.
  const html = (f) => readFileSync(new URL('../public/newdesign/' + f, import.meta.url), 'utf8');
  const pages = {
    'ClientApp.html': 'dashProgress.jsx', 'ClientProgress.html': 'dashProgress.jsx',
    'TrainerApp.html': 'dashSchedule.jsx', 'NutritionistApp.html': 'dashSchedule.jsx',
    'TrainerSchedule.html': 'dashSchedule.jsx', 'NutritionistSchedule.html': 'dashSchedule.jsx',
    'TrainerClients.html': 'trainerClientsPage.jsx', 'NutritionistClients.html': 'nutritionistClientsPage.jsx',
  };
  let checked = 0;
  for (const [f, mod] of Object.entries(pages)) {
    const s = html(f);
    const need = s.indexOf(mod);
    const have = s.indexOf('dashData.jsx');
    assert.ok(need >= 0, f + ' no longer loads ' + mod + ' — update this map');
    assert.ok(have >= 0, f + ' loads ' + mod + ' but not dashData.jsx');
    assert.ok(have < need, f + ' loads dashData.jsx after ' + mod);
    checked += 1;
  }
  assert.equal(checked, 8, 'the sweep scanned nothing');
});

test('the preference document is one named kind, not a new store per control', () => {
  assert.match(CHOICE, /useCoachDoc\("dashboard_prefs", live\)/);
  // and it is the shared store, not a fourth copy of it — the thing the file
  // post-mortems having three of already
  assert.ok(!/getUserGoals|saveUserGoals|dashDocSerial/.test(CHOICE),
    'the choice hook grew its own write path instead of using useCoachDoc');
});
