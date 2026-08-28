// The web "Show when I'm online" preference: what the two halves ANSWER.
//
// ⚠ THESE TESTS DRIVE THE SHIPPED SOURCE, NOT A COPY OF IT. Both surfaces are classic
// browser scripts that cannot be imported here — public/supabase.js is an IIFE and
// clientMeSettings.jsx is a babel-compiled component — so each function is extracted
// from the real file by brace-matching and evaluated against stubs. A guard that
// matched the source TEXT would pin a spelling; this pins the behaviour, which is the
// lesson #1936 paid for (a regex keyed on `{loggedIn && (` passed happily against
// `{loggedIn && <button`, one paren different, and the whole guard went blind).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function extractFn(src, marker, label) {
  const i = src.indexOf(marker);
  assert.ok(i >= 0, `${label}: marker not found — ${marker}`);
  // ⚠ A marker that stops being unique would silently start extracting the WRONG
  // function and every assertion below would go on passing about someone else's code.
  assert.equal(src.indexOf(marker, i + 1), -1, `${label}: marker is ambiguous — ${marker}`);
  const open = src.indexOf('{', i + marker.length - 1);
  assert.ok(open > 0, `${label}: no body`);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(i, j + 1); }
  }
  throw new Error(`${label}: unbalanced body`);
}

const SUPABASE = fs.readFileSync('public/supabase.js', 'utf8');
const SETTINGS = fs.readFileSync('public/newdesign/clientMeSettings.jsx', 'utf8');

const setVisibleSrc = extractFn(SUPABASE, 'function (v)', 'setVisible');
const toggleSrc = extractFn(SETTINGS, 'async function toggleOnlineVisible', 'toggleOnlineVisible');

// The lane is extracted too, so the overlapping-toggle test drives the SHIPPED
// serializer rather than a re-typed one that could quietly diverge from it.
const serialSrc = extractFn(SUPABASE, 'function _settingsSerial', '_settingsSerial');
const chainSeed = SUPABASE.match(/var _settingsChain = [^;]+;/);
assert.ok(chainSeed, 'the lane seed line is gone — the serializer is not wired');

// ONE built instance = one lane, which is the real shape: a single
// window.ShapeWebPresence.setVisible that a member can tap twice.
const buildSetVisible = (shapeDb, _wp) => new Function(
  'shapeDb', '_wp', 'window', 'startWebPresence',
  `${chainSeed[0]}\n${serialSrc}\nreturn (${setVisibleSrc});`,
)(
  // The durable half resolves identity through getUser; a stable one unless overridden.
  { getUser: async () => ({ id: 'u1' }), ...shapeDb },
  _wp,
  { dispatchEvent() {} },
  () => {},
);

// The lane on its own, for the invariant setVisible cannot reach: its step body is
// fully try/caught, so it never rejects today and a wedged lane would be invisible
// through it. The guard belongs at the lane, where the NEXT caller inherits it.
const buildSerial = () => new Function(
  `${chainSeed[0]}\n${serialSrc}\nreturn _settingsSerial;`,
)();

// The startup hydrate, built from source too — the ON-clobber below is an interaction
// between these two functions, so stubbing either one would test the stub.
const hydrateSrc = extractFn(SUPABASE, 'async function startWebPresence', 'startWebPresence');
const buildHydrate = (shapeDb, _wp, client) => new Function(
  'shapeDb', '_wp', 'client', 'window',
  `${hydrateSrc}\nreturn startWebPresence;`,
)(shapeDb, _wp, client, { dispatchEvent() {} });

const buildToggle = (ctx) => new Function(
  'onlineVisible', 'setOnlineVisible', 'signedIn', 'showToast', 'window',
  `return (${toggleSrc});`,
)(ctx.onlineVisible, ctx.setOnlineVisible, ctx.signedIn, ctx.showToast, ctx.window);

// ---------- setVisible: the durable half reports, and declines what it cannot read ----

test('a landed save reports ok AND preserves every other client_settings key', async () => {
  const saved = [];
  const doc = { units: 'imperial', onlineRail: 'Off', dailyCheckin: 'On', mealTimes: { lunch: '12:30' } };
  const _wp = { visible: true, channel: null };
  const setVisible = buildSetVisible({
    getUserGoals: async () => doc,
    saveUserGoals: async (kind, data) => { saved.push([kind, data]); return { ok: true }; },
  }, _wp);

  assert.deepEqual(await setVisible(false), { ok: true });
  assert.equal(saved.length, 1);
  const [kind, written] = saved[0];
  assert.equal(kind, 'client_settings');
  assert.equal(written.onlineVisible, 'Off');
  // ⚠ THE WHOLE-DOC UPSERT IS WHY THIS MATTERS: saveUserGoals REPLACES data, so every
  // untouched preference has to be carried forward by the caller or it is destroyed.
  assert.equal(written.units, 'imperial');
  assert.equal(written.onlineRail, 'Off');
  assert.equal(written.dailyCheckin, 'On');
  assert.deepEqual(written.mealTimes, { lunch: '12:30' });
});

test('an UNREADABLE doc declines the write — it never publishes a one-key document over a real one', async () => {
  for (const read of [async () => null, async () => { throw new Error('network'); }]) {
    const saved = [];
    const setVisible = buildSetVisible({
      getUserGoals: read,
      saveUserGoals: async (...a) => { saved.push(a); return { ok: true }; },
    }, { visible: true, channel: null });

    assert.deepEqual(await setVisible(false), { ok: false, reason: 'unreadable' });
    // The point of the whole fix: nothing was written, so nothing was destroyed.
    assert.equal(saved.length, 0, 'a failed read must not trigger a whole-doc upsert');
  }
});

test('a save that reports an error, or throws, is reported — never as success', async () => {
  for (const write of [
    async () => ({ error: { message: 'RLS' } }),
    async () => { throw new Error('offline'); },
    async () => null,
  ]) {
    const setVisible = buildSetVisible({
      getUserGoals: async () => ({ units: 'metric' }),
      saveUserGoals: write,
    }, { visible: true, channel: null });
    assert.deepEqual(await setVisible(true), { ok: false, reason: 'save_failed' });
  }
});

test('the RUNTIME flip happens even when the durable write declines', async () => {
  const _wp = { visible: true, channel: null };
  const setVisible = buildSetVisible({
    getUserGoals: async () => null,
    saveUserGoals: async () => ({ ok: true }),
  }, _wp);
  const pending = setVisible(false);
  // ⚠ SYNCHRONOUSLY, before the durable half is even queued. A member who asks to
  // leave the rail leaves it NOW — moving the flip inside the serial lane would
  // make it wait on a stalled network write, i.e. keep broadcasting them after
  // they asked to stop.
  assert.equal(_wp.visible, false);
  await pending;
  assert.equal(_wp.visible, false, 'and it is not undone by the durable half');
});

test('extractFn refuses an ambiguous marker instead of guarding the wrong function', () => {
  assert.throws(
    () => extractFn('function a() {}\nfunction a() {}', 'function a', 'dupe'),
    /ambiguous/,
  );
});

test('overlapping taps land in the order they were made, and the later one reads the earlier one', async () => {
  // ⚠ WITHOUT THE LANE THIS IS A LOST UPDATE THAT REPORTS SUCCESS TWICE. Each tap ran
  // its own read-merge-write, so a slow Off could arrive after a fast On and the stored
  // value would be decided by network timing rather than by what the member last asked
  // for — with both calls honestly returning ok and the row saying "Saved." for each.
  let store = { units: 'imperial', onlineVisible: 'On' };
  const order = [];
  const delays = [20, 0]; // the FIRST tap's save is the slow one — the losing race
  const setVisible = buildSetVisible({
    getUserGoals: async () => ({ ...store }),
    saveUserGoals: async (kind, data) => {
      const wait = delays.length > 1 ? delays.shift() : delays[0];
      await new Promise((r) => setTimeout(r, wait));
      store = data;
      order.push(data.onlineVisible);
      return { ok: true };
    },
  }, { visible: true, channel: null });

  const [a, b] = await Promise.all([setVisible(false), setVisible(true)]);
  assert.deepEqual(a, { ok: true });
  assert.deepEqual(b, { ok: true });
  assert.deepEqual(order, ['Off', 'On'], 'writes must land in tap order, not in save-latency order');
  assert.equal(store.onlineVisible, 'On', 'the last tap decides the stored value');
  assert.equal(store.units, 'imperial', 'siblings survive a merge over a freshly-written doc');
});

test('a rejected step does not wedge the lane for everyone behind it', async () => {
  const serial = buildSerial();
  const ran = [];
  const boom = serial(async () => { throw new Error('offline'); });
  const after = serial(async () => { ran.push('after'); return 'ok'; });
  // ⚠ This pins the INVARIANT, not a spelling: the lane carries two redundant failure
  // handlers and either one alone satisfies this test — only removing BOTH wedges it.
  // Pinning one of them individually would be guarding how the code is written.
  await assert.rejects(boom, /offline/, 'the failing caller still sees its own failure');
  assert.equal(await after, 'ok');
  assert.deepEqual(ran, ['after'], 'work queued behind a failure must still run');
});

test('the startup hydrate never overrides a choice the member just made', async () => {
  // ⚠ THE SAME CLASS AS THE LANE, ONE DIRECTION OVER — a stale READ overwriting a fresh
  // intent. setVisible calls startWebPresence whenever no channel exists yet, which is
  // ordinary: the module-load call races auth hydration and returns early with no uid on
  // a cold load. Toggling ON there fires a read that still sees the STORED 'Off' — the
  // write is queued behind the lane — and silently flips the member back to invisible,
  // leaving stored On against a runtime false.
  let store = { units: 'metric', onlineVisible: 'Off' };
  const _wp = { channel: null, ids: {}, visible: false, touched: false };
  const shapeDb = {
    getSession: async () => ({ user: { id: 'u1' } }),
    getUser: async () => ({ id: 'u1' }),
    getUserGoals: async () => ({ ...store }),
    saveUserGoals: async (kind, data) => {
      await new Promise((r) => setTimeout(r, 20)); // the write lands AFTER the hydrate reads
      store = data;
      return { ok: true };
    },
  };
  const chan = { on() { return chan; }, subscribe() { return chan; }, track() {}, untrack() {} };
  const hydrate = buildHydrate(shapeDb, _wp, { channel: () => chan });

  const setVisible = new Function(
    'shapeDb', '_wp', 'window', 'startWebPresence',
    `${chainSeed[0]}\n${serialSrc}\nreturn (${setVisibleSrc});`,
  )(shapeDb, _wp, { dispatchEvent() {} }, hydrate);

  assert.deepEqual(await setVisible(true), { ok: true });
  await new Promise((r) => setTimeout(r, 30)); // let the hydrate finish too
  assert.equal(_wp.visible, true, 'an explicit ON must survive the startup hydrate');
  assert.equal(store.onlineVisible, 'On', 'and the write still lands');
});

test('a durable write is DISCARDED when the account changed while it was queued', async () => {
  // ⚠ getUserGoals and saveUserGoals each resolve getUser() independently at their own
  // call time, and the save REPLACES that user's whole client_settings document — so a
  // session that becomes account B mid-flight would upsert A's document into B's row and
  // destroy B's units, privacy, meal times and the rest. The lane makes that window
  // LONGER by design, since a stalled predecessor holds this step back.
  for (const switchAt of ['before the read', 'before the save']) {
    const saved = [];
    let calls = 0;
    const setVisible = buildSetVisible({
      // u1 taps; the session becomes u2 at the named point.
      getUser: async () => {
        calls += 1;
        if (switchAt === 'before the read') return calls <= 1 ? { id: 'u1' } : { id: 'u2' };
        return calls <= 2 ? { id: 'u1' } : { id: 'u2' };
      },
      getUserGoals: async () => ({ units: 'imperial', privacy: 'friends' }),
      saveUserGoals: async (...a) => { saved.push(a); return { ok: true }; },
    }, { visible: true, channel: null });

    assert.deepEqual(await setVisible(false), { ok: false, reason: 'account_changed' }, switchAt);
    assert.equal(saved.length, 0, `no whole-doc upsert may run after the account changed (${switchAt})`);
  }
});

test('a switch AWAY and BACK still declines — the read belongs to the other account', async () => {
  // ⚠ THE CASE ONLY THE PRE-READ CHECK CATCHES. Checking identity after the read alone
  // would pass here (u1 tapped, u1 is current at save time) while `doc` is the document
  // that was read as u2 — so u2's settings would be written into u1's row. Contrived, but
  // it is the difference between the two checks, and the harm is the same destruction.
  const saved = [];
  const docs = { u1: { units: 'imperial', privacy: 'friends' }, u2: { units: 'metric' } };
  const seq = ['u1', 'u2', 'u1']; // initiator · before the read · before the save
  let calls = 0;
  let current = 'u1';
  const setVisible = buildSetVisible({
    getUser: async () => { current = seq[Math.min(calls, seq.length - 1)]; calls += 1; return { id: current }; },
    getUserGoals: async () => ({ ...docs[current] }),
    saveUserGoals: async (...a) => { saved.push(a); return { ok: true }; },
  }, { visible: true, channel: null });

  assert.deepEqual(await setVisible(false), { ok: false, reason: 'account_changed' });
  assert.equal(saved.length, 0, "another account's document must never be written back");
});

test('a signed-out initiator declines rather than writing to whoever signs in next', async () => {
  const saved = [];
  const setVisible = buildSetVisible({
    getUser: async () => null,
    getUserGoals: async () => ({ units: 'metric' }),
    saveUserGoals: async (...a) => { saved.push(a); return { ok: true }; },
  }, { visible: true, channel: null });
  assert.deepEqual(await setVisible(true), { ok: false, reason: 'unreadable' });
  assert.equal(saved.length, 0);
});

// ---------- the settings row: what it tells the member --------------------------------

function toggleCtx({ signedIn = true, out = { ok: true }, throws = false, absent = false } = {}) {
  const toasts = [];
  const states = [];
  const win = absent ? {} : { ShapeWebPresence: { setVisible: async () => { if (throws) throw new Error('x'); return out; } } };
  return {
    toasts,
    states,
    run: buildToggle({
      onlineVisible: false,
      setOnlineVisible: (v) => states.push(v),
      signedIn,
      showToast: (t) => toasts.push(t),
      window: win,
    }),
  };
}

test('signed out says sample view and never touches the durable write', async () => {
  let called = false;
  const toasts = [];
  const run = buildToggle({
    onlineVisible: false,
    setOnlineVisible: () => {},
    signedIn: false,
    showToast: (t) => toasts.push(t),
    window: { ShapeWebPresence: { setVisible: async () => { called = true; return { ok: true }; } } },
  });
  await run();
  assert.equal(called, false);
  assert.match(toasts.join(' '), /Sample view/);
});

test('"Saved." is reachable ONLY when the write actually landed', async () => {
  const ok = toggleCtx({ out: { ok: true } });
  await ok.run();
  assert.deepEqual(ok.toasts, ['Saved.']);

  for (const bad of [
    toggleCtx({ out: { ok: false, reason: 'unreadable' } }),
    toggleCtx({ out: { ok: false, reason: 'save_failed' } }),
    toggleCtx({ throws: true }),
    toggleCtx({ absent: true }),          // page never loaded supabase.js
  ]) {
    await bad.run();
    assert.equal(bad.toasts.length, 1);
    assert.notEqual(bad.toasts[0], 'Saved.', 'a write that did not land must not report success');
    assert.match(bad.toasts[0], /didn't save|couldn't load/);
  }
});

test('a declined account switch is its own message, not "that didn\'t save"', async () => {
  const c = toggleCtx({ out: { ok: false, reason: 'account_changed' } });
  await c.run();
  assert.equal(c.toasts.length, 1);
  assert.notEqual(c.toasts[0], 'Saved.');
  assert.match(c.toasts[0], /signed in as someone else/);
});

test('an unreadable failure and a save failure say different things', async () => {
  const unread = toggleCtx({ out: { ok: false, reason: 'unreadable' } });
  const failed = toggleCtx({ out: { ok: false, reason: 'save_failed' } });
  await unread.run();
  await failed.run();
  assert.match(unread.toasts[0], /couldn't load/);
  assert.match(failed.toasts[0], /didn't save/);
  assert.notEqual(unread.toasts[0], failed.toasts[0]);
});

test('a failed save does NOT roll the row back — the session is doing what was asked', async () => {
  const c = toggleCtx({ out: { ok: false, reason: 'save_failed' } });
  await c.run();
  // One state write, to the NEW value. Restoring the old one would assert the opposite
  // of what the runtime flip is actually doing — and for an OFF, would put the member
  // back on the rail after they asked to leave it.
  assert.deepEqual(c.states, [true]);
});
