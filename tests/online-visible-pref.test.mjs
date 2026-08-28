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

const setVisibleSrc = extractFn(SUPABASE, 'async function (v)', 'setVisible');
const toggleSrc = extractFn(SETTINGS, 'async function toggleOnlineVisible', 'toggleOnlineVisible');

const buildSetVisible = (shapeDb, _wp) => new Function(
  'shapeDb', '_wp', 'window', 'startWebPresence',
  `return (${setVisibleSrc});`,
)(shapeDb, _wp, { dispatchEvent() {} }, () => {});

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
  await setVisible(false);
  // A member who asks to leave the rail leaves it NOW, whatever the storage says.
  assert.equal(_wp.visible, false);
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
