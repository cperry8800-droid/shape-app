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
import { readFileSync, readdirSync } from 'node:fs';
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
const AUTH = region('function useSignedIn(', '\nfunction ');
const HELPERS = region('async function dashDocBridge', 'function useCoachDoc(');
const STORE = region('function useCoachDoc(', 'function goalMetricUnit(');
const CHOICE = region('function useRememberedChoices(', 'Object.assign(window,');

// The three regions really are the shipped ones, and the lift really lifted something.
test('the suite is running the shipped hooks, not an empty string', () => {
  assert.match(HELPERS, /function dashDocSerial\(fn\)/);
  assert.match(STORE, /pendingRef/);
  assert.match(CHOICE, /function useRememberedChoice\(store, key, allowed, fallback\)/);
  assert.ok(CHOICE.length > 400, 'the choice hook lifted as a stub');
  assert.match(AUTH, /onAuthStateChange/, 'the account hook lifted as a stub');
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
      // ⚠ AN ALREADY-PENDING EFFECT IS CARRIED FORWARD, not cleared. The body can run
      // several passes before any effect commits (see `render`), and every pass after the
      // first sees unchanged deps — so clearing on `same` would let pass 2 cancel the
      // effect pass 1 scheduled, and a re-hydrate would silently never run.
      cells.effect[i] = { deps, pending: same ? (prev ? prev.pending : null) : fn, cleanup: prev ? prev.cleanup : null };
    },
  };
  let out = null;
  // ⚠ A SET DURING THE BODY RE-RUNS THE BODY BEFORE ANY EFFECT COMMITS, which is what
  // React does and is load-bearing here: two of these hooks adjust state during render
  // (the account clean-slate, and the set hook's rebase). A host that committed the
  // discarded render's effects would let a value the component never returned reach the
  // document — and would then report that as the code's behaviour.
  const render = () => {
    for (let pass = 0; ; pass++) {
      renders += 1; si = 0; ri = 0; ei = 0;
      dirty = false;
      out = body(React);
      if (!dirty) break;
      assert.ok(pass < 10, 'the body set state during render on ten passes running — it does not converge');
    }
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
  const state = { doc: { ...doc }, gets: 0, saves: 0, written: [], uid: o.uid === undefined ? 'coach-a' : o.uid, auth: null };
  const db = {
    getSession: async () => ({}),
    getUser: async () => (state.uid == null ? null : { id: state.uid }),
    client: { auth: { onAuthStateChange: (fn) => { state.auth = fn; return { data: { subscription: { unsubscribe() {} } } }; } } },
    // Keyed BY ACCOUNT, so a switch genuinely reads a different row rather than the
    // same object under a new name — a shared document would let the A→B test pass
    // on a store that never re-hydrated.
    getUserGoals: async () => {
      state.gets += 1;
      if (o.readFails) return null;
      return { ...(state.uid === 'coach-a' ? state.doc : (state.docB || {})) };
    },
    saveUserGoals: async (kind, val) => {
      state.saves += 1; state.written.push({ kind, val, uid: state.uid });
      if (o.saveFails) return { error: 'nope' };
      if (state.uid === 'coach-a') state.doc = val; else state.docB = val;
      return { data: val };
    },
  };
  return { db, state };
}

// One page: a store and one or two choices off it, driven exactly as a page does.
function drivePage(dbState, opts) {
  const o = opts || {};
  const keys = o.keys || [{ key: 'rosterFilter', allowed: ['all', 'eyes', 'new', 'ontrack'], fallback: 'all' }];
  const ctl = { live: o.live !== false, chose: null };
  const hooks = new Function('React', 'window', AUTH + '\n' + HELPERS + '\n' + STORE + '\n' + CHOICE +
    '\nreturn { useRememberedChoices, useRememberedChoice };');
  const host = makeHost((React) => {
    const api = hooks(React, { shapeDb: dbState.db });
    const prefs = api.useRememberedChoices(ctl.live);
    const out = { kind: prefs.kind, doc: prefs.doc, accountId: prefs.accountId, values: {}, choose: {} };
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

// ── a different account gets a different answer (CodeRabbit, #2029) ────────
test('an A→B switch with `live` still true gives B their OWN document, not A\'s', async () => {
  // ⚠ THE HOLE WAS BIGGER THAN A STALE READ, AND THE SECOND HALF IS THE WORSE ONE.
  // `useCoachDoc`'s hydrate deps are [goalKind, live, accountId]; without the account,
  // a switch that leaves `live` true never re-runs it. B then reads A's document — and
  // because the same hydrate sets `uidRef`, every write B makes resolves `startUid` as
  // A, fails the identity comparison inside `apply`, and is REFUSED. B's own
  // preferences become silently unsaveable until a reload.
  const db = makeDb({ rosterFilter: 'eyes' });
  db.state.docB = { rosterFilter: 'ontrack' };
  const { host } = drivePage(db);
  const out = await host.flush();
  assert.equal(out.values.rosterFilter, 'eyes', 'setup: A does not see A\'s document');
  assert.equal(out.accountId, 'coach-a');

  // B signs in from another tab. `live` never moves.
  db.state.uid = 'coach-b';
  db.state.auth('SIGNED_IN', { user: { id: 'coach-b' } });
  await host.flush();
  assert.equal(host.out.accountId, 'coach-b', 'the store never noticed the switch');
  assert.equal(host.out.values.rosterFilter, 'ontrack', "B is being shown A's remembered filter");

  // and B can actually save
  const before = db.state.saves;
  host.out.choose.rosterFilter('new');
  await host.flush();
  assert.equal(db.state.saves, before + 1, "B's write was refused — the identity guard is reading A");
  assert.equal(db.state.written[db.state.written.length - 1].uid, 'coach-b');
  assert.deepEqual(db.state.docB, { rosterFilter: 'new' });
  assert.deepEqual(db.state.doc, { rosterFilter: 'eyes' }, "A's document was written to");
});

test("A's un-saved session choice does not follow them to B", async () => {
  // ⚠ RE-HYDRATING THE STORE IS NOT ENOUGH ON ITS OWN: `chosen` outranks the document
  // by design, so A's session choice would go on governing B's screen. And `askedRef`
  // would suppress B's first write of that same value.
  const db = makeDb({}, { saveFails: true });
  db.state.docB = {};
  const { host } = drivePage(db);
  const out = await host.flush();
  out.choose.rosterFilter('eyes');
  await host.flush();
  assert.equal(host.out.values.rosterFilter, 'eyes', "setup: A's choice did not take");

  db.state.uid = 'coach-b';
  db.state.auth('SIGNED_IN', { user: { id: 'coach-b' } });
  await host.flush();
  assert.equal(host.out.values.rosterFilter, 'all', "A's session choice governs B's screen");
});

test('the store stays SHUT until the account is known, so nothing is read for nobody', async () => {
  // ⚠ AND IT IS ONE READ RATHER THAN TWO. Opening on `live` alone hydrated once for an
  // unresolved account and again for the real one — a wasted round trip, and a read of
  // a per-account document before knowing whose it is, which is the defect itself.
  const db = makeDb({ rosterFilter: 'eyes' }, { uid: null });   // confirmed signed out
  const { host } = drivePage(db);
  const out = await host.flush();
  assert.equal(db.state.gets, 0, 'a per-account document was read with no account');
  assert.notEqual(out.kind, 'ready');
  assert.equal(out.values.rosterFilter, 'all');
  // a choice made while it is shut still takes effect, and is written when it opens
  out.choose.rosterFilter('new');
  await host.flush();
  assert.equal(db.state.saves, 0);
  assert.equal(host.out.values.rosterFilter, 'new');
  db.state.uid = 'coach-a';
  db.state.auth('SIGNED_IN', { user: { id: 'coach-a' } });
  await host.flush();
  assert.equal(db.state.saves, 1, 'the choice was never written once the account resolved');
  // ⚠ TWO READS HERE, AND ONLY ONE OF THEM IS A HYDRATE. `apply` re-reads the server
  // document inside the serial lane before writing — that is how concurrent writes
  // merge and it is deliberate. My first cut of this assertion counted them together
  // and failed a correct fix. A regression to two hydrates reads 3.
  assert.equal(db.state.gets, 2, 'the store read ' + db.state.gets + ' times: one hydrate + one merge read');

  // and a fresh load with nothing pending reads exactly once
  const db2 = makeDb({ rosterFilter: 'eyes' });
  const p2 = drivePage(db2);
  await p2.host.flush();
  assert.equal(db2.state.gets, 1, 'a plain load read the document ' + db2.state.gets + ' times');
  assert.equal(p2.host.out.values.rosterFilter, 'eyes');
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

test('every host page loads dashData.jsx before any module that reads it', () => {
  // ⚠ CLASSIC SCRIPTS, SO THIS IS A REAL FAILURE MODE. `dashProgress.jsx` referenced
  // nothing from `dashData.jsx` before R16, and `ClientProgress.html` did not load it —
  // the reference would have been a ReferenceError on any page that rendered.
  //
  // ⚠ AND THE FIRST VERSION OF THIS GUARD WAS A HAND-LISTED MAP OF EIGHT PAGES, which is
  // the enumeration-is-not-a-proof pattern this repo keeps paying for: adding a
  // `useRememberedSet` call to `dashToday.jsx` made THREE pages wrong (ClientGoal,
  // ClientNutri, ClientTrain all load dashToday.jsx and none loaded dashData.jsx) and the
  // map said nothing, because none of the three was in it. It DERIVES both halves now —
  // which modules read dashData, and which pages load them — so a new page or a new
  // cross-module reference is covered with nobody remembering this test exists.
  const dir = new URL('../public/newdesign/', import.meta.url);
  const read = (f) => readFileSync(new URL(f, dir), 'utf8');
  const files = readdirSync(dir);

  // The names dashData.jsx publishes as bare globals — derived from its own export line,
  // never listed here, so a new export is covered the day it is added.
  const exportLine = /Object\.assign\(window, \{([^}]*)\}\);/.exec(DATA);
  assert.ok(exportLine, 'dashData.jsx stopped exposing its globals in one Object.assign');
  const exported = exportLine[1].split(',').map((p) => p.split(':')[0].trim()).filter(Boolean);
  assert.ok(exported.length >= 10, 'the dashData export list looks truncated: ' + exported.length);

  // Which sibling modules actually reference one of those names.
  const readers = files.filter((f) => /\.jsx$/.test(f) && f !== 'dashData.jsx')
    .filter((f) => {
      const src = stripComments(read(f));
      return exported.some((n) => new RegExp('(^|[^\\w.$])' + n + '\\s*\\(').test(src));
    });
  assert.ok(readers.length >= 3, 'no module reads dashData — the derivation broke: ' + readers.length);

  let checked = 0;
  for (const f of files.filter((x) => /\.html$/.test(x))) {
    const html = read(f);
    for (const mod of readers) {
      const need = html.indexOf('src="' + mod);
      if (need < 0) continue;
      const have = html.indexOf('src="dashData.jsx');
      assert.ok(have >= 0, f + ' loads ' + mod + ', which reads dashData.jsx, but never loads it');
      assert.ok(have < need, f + ' loads dashData.jsx after ' + mod);
      checked += 1;
    }
  }
  assert.ok(checked >= 8, 'the sweep scanned almost nothing: ' + checked);
});

test('the preference document is one named kind, not a new store per control', () => {
  assert.match(CHOICE, /useCoachDoc\("dashboard_prefs", !!live && accountId != null, accountId\)/);
  // and it is the shared store, not a fourth copy of it — the thing the file
  // post-mortems having three of already
  assert.ok(!/getUserGoals|saveUserGoals|dashDocSerial/.test(CHOICE),
    'the choice hook grew its own write path instead of using useCoachDoc');
});

// ── the SET hook, and the rebase a set needs and a single value does not ─────
// One page: a store and one remembered SET off it, driven exactly as the drawer does.
function driveSet(dbState, opts) {
  const o = opts || {};
  const ctl = { live: o.live !== false };
  const hooks = new Function('React', 'window', AUTH + '\n' + HELPERS + '\n' + STORE + '\n' + CHOICE +
    '\nreturn { useRememberedChoices, useRememberedSet };');
  const key = o.key || 'drawerHidden:trainer';
  const host = makeHost((React) => {
    const api = hooks(React, { shapeDb: dbState.db });
    const prefs = api.useRememberedChoices(ctl.live);
    const [value, toggle, clear] = api.useRememberedSet(prefs, key, o.max || 12);
    return { kind: prefs.kind, doc: prefs.doc, accountId: prefs.accountId, value, toggle, clear };
  });
  return { host, ctl, key };
}

// Hold the document read open so a choice can be made while it is genuinely in flight.
function holdRead(db) {
  let release;
  const gate = new Promise((r) => { release = r; });
  const inner = db.getUserGoals;
  db.getUserGoals = async () => { await gate; return inner(); };
  return release;
}

test('a set toggled before the document arrives keeps what the document turns out to hold', async () => {
  // ⚠ THE DEFECT THIS PINS IS SILENT DATA LOSS. `chosen` outranks the document by design,
  // and for a SET that rule derives the coach's new list from an EMPTY base — so hiding
  // one section during the read would write that one-item list over the two they hid last
  // week, with nothing on screen saying so.
  const { db, state } = makeDb({ 'drawerHidden:trainer': ['milestones', 'notes'] });
  const release = holdRead(db);
  const { host, key } = driveSet({ db, state });
  await host.flush(3);
  assert.equal(host.out.kind, 'loading', 'the read resolved before the choice could be made');
  assert.deepEqual(host.out.value, [], 'a store that has not resolved cannot claim anything is hidden');

  host.out.toggle('score');          // the coach hides a third section, mid-read
  release();
  const out = await host.flush(25);

  assert.deepEqual([...out.value].sort(), ['milestones', 'notes', 'score']);
  assert.equal(state.saves, 1, 'the rebase settled in one write');
  assert.deepEqual([...state.written[0].val[key]].sort(), ['milestones', 'notes', 'score']);
});

test('the rebase settles — it does not flip the choice back off once the write lands', async () => {
  // A rebase that re-applied itself to its own result would toggle `score` straight back
  // out the moment the optimistic paint arrived, and then back in, forever.
  const { db, state } = makeDb({ 'drawerHidden:trainer': ['milestones'] });
  const release = holdRead(db);
  const { host } = driveSet({ db, state });
  await host.flush(3);
  host.out.toggle('score');
  release();
  const out = await host.flush(25);
  assert.deepEqual([...out.value].sort(), ['milestones', 'score']);
  assert.equal(state.saves, 1, 'the rebase wrote more than once — it is chasing its own result');
  assert.ok(host.renders < 40, 'the page re-rendered on every round — a rebase loop');
});

test('a toggle made AFTER the document arrives behaves exactly as it always did', async () => {
  const { db, state } = makeDb({ 'drawerHidden:trainer': ['milestones', 'notes'] });
  const { host, key } = driveSet({ db, state });
  await host.flush(10);
  assert.deepEqual([...host.out.value].sort(), ['milestones', 'notes']);
  host.out.toggle('notes');                      // un-hide one
  const out = await host.flush(20);
  assert.deepEqual(out.value, ['milestones']);
  assert.deepEqual(state.written[0].val[key], ['milestones']);
});

test("A's mid-read set choice is discarded on a switch, not folded into B's document", async () => {
  // ⚠ THE ONE RENDER THAT MAKES `acctReset` LOAD-BEARING, built deliberately: React can
  // batch the auth event and the document's arrival together, so B's very first settled
  // frame can carry A's session ids. Without the clean-slate guard the fold would run on
  // that frame — after the block that is busy discarding exactly those ids, so it wins.
  const { db, state } = makeDb({});
  let release;
  const gate = new Promise((r) => { release = r; });
  let first = true;
  db.getUserGoals = async () => {
    state.gets += 1;
    if (first) { first = false; await gate; return { 'drawerHidden:trainer': ['milestones'] }; }
    return { 'drawerHidden:trainer': ['macros'] };
  };
  const { host } = driveSet({ db, state });
  await host.flush(3);
  assert.equal(host.out.kind, 'loading', 'setup: the read resolved too early');
  host.out.toggle('score');
  await host.flush(2);

  // The switch and the document land TOGETHER, and the drain before the flush is what
  // makes that true: `flush` renders on entry, so releasing the read and then rendering
  // immediately would give the auth event its own frame and the fold nothing to land on.
  state.uid = 'coach-b';
  state.auth('SIGNED_IN', { user: { id: 'coach-b' } });
  release();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  const out = await host.flush(25);

  assert.equal(out.accountId, 'coach-b', 'setup: the switch did not take');
  assert.deepEqual(out.value, ['macros'], "B was shown A's sections");
  const forB = state.written.filter((w) => w.uid === 'coach-b');
  assert.equal(forB.length, 0, "A's session choice was written into B's row");
});

// ── useRememberedSlots — a strip of choices, written in ONE operation ─────────
//
// ⚠ THE DEFECT THIS PINS IS A DUPLICATE THE SWAP EXISTS TO PREVENT (Codex, #2046).
// The KPI picker swaps when a coach chooses a metric already in another slot, which
// changes TWO entries; four independent `useRememberedChoice`s take that to the
// document as two separate whole-document writes, and a first that lands beside a
// second that fails leaves the same metric in both slots on the next reload.
function driveSlots(dbState, opts) {
  const o = opts || {};
  const ctl = { live: o.live !== false };
  const hooks = new Function('React', 'window', AUTH + '\n' + HELPERS + '\n' + STORE + '\n' + CHOICE +
    '\nreturn { useRememberedChoices, useRememberedSlots };');
  const keys = o.keys || ['s:0', 's:1', 's:2', 's:3'];
  const allowed = o.allowed || ['a', 'b', 'c', 'd', 'e'];
  const defaults = o.defaults || ['a', 'b', 'c', 'd'];
  const host = makeHost((React) => {
    const api = hooks(React, { shapeDb: dbState.db });
    const prefs = api.useRememberedChoices(ctl.live);
    const [values, choose] = api.useRememberedSlots(prefs, keys, allowed, defaults);
    return { kind: prefs.kind, doc: prefs.doc, accountId: prefs.accountId, values, choose };
  });
  return { host, ctl, keys, defaults };
}

test('a swap moves two slots in ONE document write', async () => {
  const { db, state } = makeDb({});
  const { host } = driveSlots({ db, state });
  await host.flush();
  assert.deepEqual(host.out.values, ['a', 'b', 'c', 'd']);
  state.saves = 0;
  // Put 'c' (slot 2) into slot 0 — a swap: slot 0 becomes 'c', slot 2 becomes 'a'.
  host.out.choose(['c', 'b', 'a', 'd']);
  await host.flush();
  assert.equal(state.saves, 1, 'a swap must not take two writes');
  assert.deepEqual(state.written[0].val, { 's:0': 'c', 's:2': 'a' });
  assert.deepEqual(host.out.values, ['c', 'b', 'a', 'd']);
});

test('a slot equal to its default is stored as an ABSENT key, not as a value', async () => {
  const { db, state } = makeDb({ 's:1': 'e' });
  const { host } = driveSlots({ db, state });
  await host.flush();
  assert.deepEqual(host.out.values, ['a', 'e', 'c', 'd']);
  host.out.choose(['a', 'b', 'c', 'd']);   // slot 1 back to its default
  await host.flush();
  assert.deepEqual(state.doc, {}, 'the default must delete the key, not pin today\'s default into the member\'s data');
});

test('a stored slot value this build does not recognise costs THAT slot only', async () => {
  const { db, state } = makeDb({ 's:0': 'retired', 's:2': 'e' });
  const { host } = driveSlots({ db, state });
  await host.flush();
  // slot 0 falls back to its own default; slot 2's stored value still stands.
  assert.deepEqual(host.out.values, ['a', 'b', 'e', 'd']);
  assert.equal(state.saves, 0, 'reading an unknown value must not write');
  assert.deepEqual(state.doc, { 's:0': 'retired', 's:2': 'e' }, 'an unknown key is left for the build that knows it');
});

test('an arrangement carrying a value we would refuse to read back writes NOTHING', async () => {
  // ⚠ NOT "writes the other three". A strip is ONE arrangement, and a partial write is
  // exactly how a swap leaves a duplicate behind.
  const { db, state } = makeDb({});
  const { host } = driveSlots({ db, state });
  await host.flush();
  host.out.choose(['e', 'b', 'nonsense', 'd']);
  await host.flush();
  assert.equal(state.saves, 0);
  assert.deepEqual(state.doc, {});
});

test('choosing what the document already says writes nothing', async () => {
  const { db, state } = makeDb({ 's:0': 'e' });
  const { host } = driveSlots({ db, state });
  await host.flush();
  state.saves = 0;
  host.out.choose(['e', 'b', 'c', 'd']);
  await host.flush();
  assert.equal(state.saves, 0);
});

test('a failed strip write is attempted once, never retried in a loop', async () => {
  const { db, state } = makeDb({}, { saveFails: true });
  const { host } = driveSlots({ db, state });
  await host.flush();
  host.out.choose(['e', 'b', 'c', 'd']);
  await host.flush();
  await host.flush();
  assert.equal(state.saves, 1);
  assert.deepEqual(host.out.values, ['e', 'b', 'c', 'd'], 'the choice still governs the session');
});

test('a strip chosen before the store is writable is saved once it becomes writable', async () => {
  const { db, state } = makeDb({});
  const d = driveSlots({ db, state }, { live: false });
  await d.host.flush();
  d.host.out.choose(['e', 'b', 'c', 'd']);
  await d.host.flush();
  assert.equal(state.saves, 0, 'nothing to write to yet');
  d.ctl.live = true;
  await d.host.flush();
  assert.equal(state.saves, 1);
  assert.deepEqual(state.written[0].val, { 's:0': 'e' });
});

test("A's strip does not follow them to B", async () => {
  // ⚠ A's CHOICE HAS TO BE MADE, or this test cannot see the clean slate at all. With
  // `chosen` still null the values come from the document either way, so re-hydrating
  // B's row produces the defaults on its own and a mutation deleting the reset SURVIVES
  // — which is what it did on the first round. `chosen` outranks the document, and that
  // is the whole thing being reset.
  const { db, state } = makeDb({});
  state.docB = {};
  const { host } = driveSlots({ db, state });
  await host.flush();
  host.out.choose(['e', 'b', 'c', 'd']);
  await host.flush();
  assert.deepEqual(host.out.values, ['e', 'b', 'c', 'd']);
  assert.deepEqual(state.doc, { 's:0': 'e' });
  state.uid = 'coach-b';
  state.auth && state.auth('SIGNED_IN', { user: { id: 'coach-b' } });
  await host.flush();
  assert.deepEqual(host.out.values, ['a', 'b', 'c', 'd'], "B must not inherit A's arrangement");
  assert.deepEqual(state.docB, {}, "A's arrangement was written into B's row");
});
