// The weekly readout on the web (review 2026-09-09, R5).
//
// `/api/ai/weekly-readout` was consumed by NO website surface. It now has two,
// and they are DELIBERATELY ASYMMETRIC — which is the whole design:
//
//   the member's own Progress page  POSTs  (their one model call per week, and
//                                           they are who should spend it)
//   the coach's Week view           READS  (`ai_weekly_readouts` under the coach
//                                           SELECT policy — never generates)
//
// A coach opening the Week tab on a 30-client roster must not spend thirty
// members' weekly AI calls on their behalf.
//
// ⚠ THIS SUITE DRIVES THE SHIPPED CODE. Its first cut was regexes over source
// text, and the review that caught it was right: those pass on a broken rewrite
// and fail on a correct one — the fifth time in this wave. The pure pieces are
// brace-matched and executed; the hook is executed against a stubbed supabase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PROG = readFileSync(new URL('../public/newdesign/dashProgress.jsx', import.meta.url), 'utf8');
const WEEK = readFileSync(new URL('../public/newdesign/dashWeek.jsx', import.meta.url), 'utf8');
const DATA = readFileSync(new URL('../public/newdesign/dashData.jsx', import.meta.url), 'utf8');

function fn(src, name) {
  const at = src.indexOf('function ' + name + '(');
  assert.notEqual(at, -1, name + ' not found');
  let depth = 0;
  for (let j = src.indexOf('{', src.indexOf(')', at)); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(at, j + 1);
  }
  throw new Error('unbalanced braces around ' + name);
}
// ⚠ The assertions that must look at CODE strip the comments first. This file's
// own prose names the route it forbids, in backticks — which a naive "is this
// string absent" check reads as a URL literal. Twice in this wave a guard failed
// on the documentation of the rule it was written to enforce.
const stripComments = (src) => src.replace(/^[ \t]*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

const { readoutStamp, readoutWeekKey } = new Function(
  fn(DATA, 'readoutStamp') + '\n' + fn(DATA, 'readoutWeekKey') + '\nreturn { readoutStamp, readoutWeekKey };'
)();

// ── The stamp, shared by both surfaces ───────────────────────────────────────
test('the stamp is the ROW’s window and sample, not the caller’s', () => {
  // ⚠ On a cache hit the route reports the window and sample the readout was
  // ACTUALLY computed from. Rendering the request's numbers would undo that at
  // the last step — a 28-day stamp on a readout taken over 14.
  const s = readoutStamp({ window_days: 14, sample_size: 9, source: 'openai' }, false);
  assert.match(s, /14-day window/);
  assert.match(s, /9 days logged/);
  assert.ok(!/28/.test(s), 'the request window leaked into the stamp');
});

test('a deterministic readout says so, in both registers', () => {
  // ⚠ The fallback is real evidence, honestly rendered — but it is NOT the AI
  // reading of it, and a reader who cannot tell the two apart has been told
  // something untrue about where the words came from.
  const r = { window_days: 28, sample_size: 20, source: 'fallback' };
  assert.match(readoutStamp(r, false), /Computed, not written/);
  assert.match(readoutStamp(r, true), /computed, not written/);
  const ai = { ...r, source: 'openai' };
  assert.ok(!/computed/i.test(readoutStamp(ai, false)));
  assert.ok(!/computed/i.test(readoutStamp(ai, true)));
});

test('a missing field is omitted; a measured zero still renders', () => {
  assert.equal(readoutStamp({ source: 'openai' }, false), '');
  assert.equal(readoutStamp(null, false), '');
  assert.match(readoutStamp({ sample_size: 0, source: 'openai' }, false), /^0 days logged$/,
    'a measured zero sample is a real answer');
});

test('one stamp, not two — the duplication P1-C already removed once', () => {
  // Both surfaces read the same payload shape; a change to what the stamp may
  // claim has to land once or they disagree about the same row.
  assert.ok(!/function dwkReadoutStamp/.test(WEEK));
  assert.ok(!/function dprReadoutStamp/.test(PROG));
  assert.match(DATA, /readoutStamp, readoutWeekKey \}\);/);
});

// ── The week key matches the ROUTE's, not the browser's calendar ─────────────
test('the week key is the UTC Monday the route files rows under', () => {
  // ⚠ `weeklyReadoutWeekStart` floors `new Date(ts).toISOString().slice(0,10)`,
  // so a member at UTC+10 generating on their local Monday 08:00 files the row
  // under the PREVIOUS Monday. A surface querying a LOCAL Monday misses it on the
  // week it belongs to and finds it on the week before — a readout attributed to
  // a week it was not run in.
  const k0 = readoutWeekKey(0);
  assert.match(k0, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(new Date(k0 + 'T00:00:00Z').getUTCDay(), 1, 'not a UTC Monday');
  // it is derived from the UTC date, so it never runs ahead of it
  const utcToday = new Date().toISOString().slice(0, 10);
  assert.ok(k0 <= utcToday);
  assert.ok((Date.parse(utcToday) - Date.parse(k0)) / 86400000 < 7);
  // and stepping back is whole weeks, the only unit both calendars agree on
  for (const n of [1, 2, 5]) {
    assert.equal((Date.parse(k0) - Date.parse(readoutWeekKey(n))) / 86400000, n * 7);
    assert.equal(new Date(readoutWeekKey(n) + 'T00:00:00Z').getUTCDay(), 1);
  }
  assert.equal(readoutWeekKey(undefined), k0, 'a missing offset is this week, not NaN');
});

test('the week key agrees with the ROUTE at instants where the calendars disagree', async () => {
  // ⚠ DRIVEN AT A CHOSEN INSTANT, because this container runs UTC — where a
  // LOCAL-calendar rewrite of readoutWeekKey is indistinguishable from a correct
  // one, and exactly that mutation survived a suite that looked right.
  const { weeklyReadoutWeekStart } = await import('../src/lib/weekly-readout.mjs');
  // Sunday 2026-09-06 22:00Z — which is Monday 08:00 for a member at UTC+10, the
  // case the route files under the PREVIOUS Monday.
  const boundary = Date.parse('2026-09-06T22:00:00Z');
  assert.equal(readoutWeekKey(0, boundary), weeklyReadoutWeekStart(boundary));
  assert.equal(readoutWeekKey(0, boundary), '2026-08-31', 'the UTC week, not the +10 local one');

  // …and on the other side of midnight it moves with the route, not with a local
  // calendar west of UTC.
  const after = Date.parse('2026-09-07T01:00:00Z'); // Sunday 18:00 at UTC-7
  assert.equal(readoutWeekKey(0, after), weeklyReadoutWeekStart(after));
  assert.equal(readoutWeekKey(0, after), '2026-09-07');

  // agreement holds across a full week of instants, not just the two picked
  for (let h = 0; h < 24 * 7; h += 5) {
    const t = boundary + h * 3600000;
    assert.equal(readoutWeekKey(0, t), weeklyReadoutWeekStart(t), 'diverged at ' + new Date(t).toISOString());
  }
});

test('the week key is the UTC one even when the RUNNER is not in UTC', () => {
  // ⚠ THIS CONTAINER RUNS UTC, WHICH IS WHY THE TEST ABOVE IS NOT ENOUGH. Where
  // the local and UTC calendars coincide, `setHours` IS `setUTCHours` and
  // `getDay()` IS `getUTCDay()` — so a local-calendar rewrite of readoutWeekKey is
  // literally indistinguishable from the correct one, driven instant or not.
  // Measured: that mutation survived two rounds of this suite. Moving the runner's
  // own timezone is the only thing that separates them.
  const original = process.env.TZ;
  try {
    // A member at UTC+10 on their local Monday morning: 2026-09-06T22:00Z is
    // Monday 08:00 in Sydney, and the route files that under the PREVIOUS Monday.
    process.env.TZ = 'Australia/Sydney';
    const boundary = Date.parse('2026-09-06T22:00:00Z');
    assert.equal(new Date(boundary).getDay(), 1, 'the runner did not adopt the timezone');
    assert.notEqual(new Date(boundary).getDay(), new Date(boundary).getUTCDay(), 'the calendars must differ here');
    assert.equal(readoutWeekKey(0, boundary), '2026-08-31',
      'the key followed the LOCAL Monday instead of the UTC one the route files under');

    // And west of UTC, where the local calendar runs behind.
    process.env.TZ = 'America/Los_Angeles';
    const after = Date.parse('2026-09-07T01:00:00Z'); // Sunday 18:00 in LA
    assert.equal(new Date(after).getDay(), 0, 'the runner did not adopt the timezone');
    assert.equal(readoutWeekKey(0, after), '2026-09-07',
      'the key followed the LOCAL Sunday instead of the UTC Monday');
  } finally {
    if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
  }
});

// ── The coach side, DRIVEN against a stubbed supabase ────────────────────────
// A recording query builder: every filter is captured, and the rows come back
// from the fixture the test set up.
function stubDb(plan) {
  const calls = [];
  const chain = (rec) => ({
    select: (cols) => { rec.select = cols; return chain(rec); },
    in: (col, vals) => { rec.in = [col, vals]; return chain(rec); },
    eq: (col, val) => { (rec.eq = rec.eq || []).push([col, val]); return chain(rec); },
    then: (res, rej) => Promise.resolve(plan(rec)).then(res, rej),
  });
  return {
    calls,
    client: { from: (table) => { const rec = { table }; calls.push(rec); return chain(rec); } },
    getSession: async () => ({}),
  };
}

async function runHook({ ids, weeksBack = 0, live = true, plan }) {
  const src = fn(WEEK, 'useWeekReadouts');
  // Minimal React: one state cell, effects run immediately, deps ignored.
  let value = undefined;
  const pending = [];
  const React = {
    useState: (init) => [typeof init === 'function' ? init() : init, (v) => { value = v; }],
    useEffect: (f) => { pending.push(f); },
  };
  const db = stubDb(plan);
  const g = { React, window: { shapeDb: db }, DWK_RPC_BATCH: 100, dwkBridge: async () => {}, readoutWeekKey };
  const hook = new Function('React', 'window', 'DWK_RPC_BATCH', 'dwkBridge', 'readoutWeekKey',
    src + '\nreturn useWeekReadouts;')(g.React, g.window, g.DWK_RPC_BATCH, g.dwkBridge, g.readoutWeekKey);
  hook(ids, weeksBack, live);
  for (const f of pending) { const c = f(); if (typeof c === 'function') { /* keep mounted */ } }
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  return { published: value, db };
}

const ROW = (id, extra = {}) => ({ user_id: id, summary: 'You slept better on training days.', source: 'openai', window_days: 28, sample_size: 20, ...extra });

test('the coach query is scoped to the week, the roster, and the summary alone', async () => {
  const { db } = await runHook({ ids: ['u1', 'u2'], plan: () => ({ data: [], error: null }) });
  assert.equal(db.calls.length, 1);
  const q = db.calls[0];
  assert.equal(q.table, 'ai_weekly_readouts');
  assert.deepEqual(q.in, ['user_id', ['u1', 'u2']]);
  assert.deepEqual(q.eq, [['week_start', readoutWeekKey(0)]]);
  // ⚠ THE SUMMARY ONLY. The full readout JSONB carries 3–5 insights with their
  // headline, detail and recommendation — a member's private reading of their own
  // body, none of which this page renders.
  assert.match(q.select, /summary:readout->>summary/);
  assert.ok(!/\breadout\b(?!->)/.test(q.select), 'the whole readout document is still selected');
});

test('a row with no summary is not a readout', async () => {
  // A row still `generating` carries a null readout, so the projection returns a
  // null summary; rendering it would paint an empty finding.
  const { published } = await runHook({
    ids: ['u1', 'u2', 'u3'],
    plan: () => ({ data: [ROW('u1'), ROW('u2', { summary: null }), { user_id: null, summary: 'orphan' }], error: null }),
  });
  assert.deepEqual(Object.keys(published), ['u1']);
});

test('a failed read publishes nothing for those ids rather than a claim', async () => {
  const { published } = await runHook({ ids: ['u1'], plan: () => ({ data: null, error: { message: 'permission denied' } }) });
  assert.deepEqual(published, {}, 'the map is empty, and the row renders nothing for an absent id');
});

test('the roster is batched, and a later failed batch does not erase an earlier one', async () => {
  const ids = Array.from({ length: 150 }, (_, i) => 'u' + i);
  let n = 0;
  const { published, db } = await runHook({
    ids,
    plan: () => (++n === 1 ? { data: [ROW('u0')], error: null } : { data: null, error: { message: 'boom' } }),
  });
  assert.equal(db.calls.length, 2, 'the 100-id RPC cap is not respected');
  assert.deepEqual(Object.keys(published), ['u0']);
});

test('the Week view READS and never generates', () => {
  // ⚠ THE LOAD-BEARING ASSERTION OF THIS WHOLE CHANGE. The route's first act is
  // to CLAIM the week, which is the database's own one-call-per-member-per-week
  // enforcement — so a coach scrolling their Week would spend a member's call.
  const code = stripComments(WEEK);
  assert.ok(!/weekly-readout/.test(code), 'the Week view reaches the generate route in CODE');
  assert.ok(!/\bfetch\s*\(/.test(code), 'the Week view issues an HTTP request of its own');
});

test('the coach row is silent about an absence, because it cannot explain one', () => {
  // ⚠ `is_coach_on_client` requires an active/trialing subscription while the
  // roster also carries session-only clients — so a readout the coach may not
  // SELECT arrives identically to one that was never run. "No read on record"
  // would tell a coach a member has not done something they may be looking at on
  // their own Progress page.
  const code = stripComments(WEEK);
  assert.ok(!/No read on record/.test(code));
  assert.ok(!/generated/i.test(code.slice(code.indexOf('THE READ') > 0 ? code.indexOf('THE READ') : 0)));
  assert.match(WEEK, /\{live && readout && readout\.summary && \(/);
});

// ── The member's card ────────────────────────────────────────────────────────
test('the member’s widget is registered UNCONDITIONALLY, or it never mounts', () => {
  // ⚠ MEASURED, AND IT MADE THE FEATURE DEAD. DashGrid's boot effect has deps
  // `[role, tab]`, so the widget array it resolves a layout from is the one
  // captured on the FIRST render — where `source` is null and `live` is false. A
  // `live ? {…} : null` entry is absent when the portal hosts are created, and the
  // card never mounts for anyone.
  const m = PROG.match(/\{ key: "readout"[^\n]*\}/);
  assert.ok(m, 'the readout widget entry moved');
  assert.ok(!/live \?\s*\{ key: "readout"/.test(PROG), 'the entry is gated on a value that is false at boot');
  // the gate belongs in the component, which chrome() honours by skipping a
  // widget whose render() returns null
  assert.match(fn(PROG, 'DprWeeklyReadout'), /if \(!live \|\| !held \|\| !held\.readout \|\| mismatched\) return null;/);
});

test('the member’s card does not make a resolvable identity a precondition of the POST', () => {
  // ⚠ The route authenticates off the same cookie session that made `live` true,
  // while `shapeDb.getUser()` is a live round trip that returns null on any blip.
  // Gating the request on it meant one transient auth failure silently removed
  // this card while every other card on the page stayed live, with no message.
  const src = fn(PROG, 'DprWeeklyReadout');
  const post = src.slice(src.indexOf('const res = await fetch'));
  assert.ok(src.indexOf('await fetch') !== -1);
  assert.ok(!/if \(!live \|\| !uid\)/.test(src), 'the POST is still gated on a supabase-js uid');
  // the subject comes from the ANSWER
  assert.match(src, /setHeld\(d && d\.readout && d\.user_id \? d : null\)/);
  assert.match(src, /held\.user_id !== whoNow/);
  // …and only a positive MISMATCH hides the card; an unresolved id does not
  assert.match(src, /whoNow != null && held && held\.user_id && held\.user_id !== whoNow/);
  assert.ok(post.length > 0);
});

test('the account-switch guard can actually fire', () => {
  // ⚠ `live` is a one-way latch — `source` is set once by the mount fetch and
  // never returns to "demo" — so keying the fetch on it alone resolves the
  // subject once and the comparison can never fire.
  const src = fn(PROG, 'DprWeeklyReadout');
  assert.match(src, /onAuthStateChange/);
  assert.match(src, /\}, \[live, authTick\]\);/, 'the fetch does not re-run on an auth change');
  assert.match(src, /\}, \[authTick\]\);/, 'the subject is not re-resolved on an auth change');
  assert.match(src, /subscription\.unsubscribe\(\)/, 'the auth subscription outlives the card');
});

test('insight rows are keyed uniquely, since the route does not dedupe them', () => {
  // `generateReadout` filters by `validKeys.has(correlation_key)` — membership
  // only — so two insights citing the same pair carry the same key and React
  // reconciles the two rows as one.
  assert.match(fn(PROG, 'DprWeeklyReadout'), /key=\{\(ins\.correlation_key \|\| "i"\) \+ "@" \+ i\}/);
});
