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
//
// ⚠ AND THIS FILE SHIPPED A LOCAL COPY THAT WAS A BROKEN INSTRUMENT — the FOURTH,
// written after tests/helpers/strip-comments.mjs had already post-mortemed the
// other three. Its lazy `/\*[\s\S]*?\*\//` span opened on `accept="image/*"` in
// dashProgress.jsx and ran to the next `*/` hundreds of lines later: measured, it
// deleted 4,038 characters of dashProgress.jsx and 1,271 of dashWeek.jsx before
// the assertions read them. A guard cannot report on source it has silently
// removed. Import the one implementation; never re-derive it.
import { stripComments } from './helpers/strip-comments.mjs';

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
  // ⚠ ANCHORED ON THE INVARIANT, NOT ON THE EXPORT LINE. This asserted the exact
  // tail of dashData's window export — so adding an UNRELATED export to that line
  // failed a test about stamp duplication, which is the "a guard that pins an
  // expression pins whatever that expression is wrong about" class this repo keeps
  // paying for. What it cares about is that both helpers are exported from the one
  // module and defined in no other.
  const exported = DATA.slice(DATA.indexOf('Object.assign(window, { useDashboard'));
  for (const name of ['readoutStamp', 'readoutWeekKey']) {
    assert.match(exported, new RegExp('\\b' + name + '\\b'), name + ' is no longer exported from dashData');
    assert.equal((DATA.match(new RegExp('function ' + name + '\\(', 'g')) || []).length, 1);
    for (const [label, src] of [['dashWeek', WEEK], ['dashProgress', PROG]]) {
      assert.ok(!new RegExp('function ' + name + '\\(').test(src), name + ' was re-defined in ' + label);
    }
  }
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
  const cells = [];
  let idx = 0;
  const React = {
    // Cell 0 belongs to useWeekReadouts' own `map`; useWeekClock takes the rest.
    useState: (init) => {
      const i = idx++;
      if (!(i in cells)) cells[i] = typeof init === 'function' ? init() : init;
      return [cells[i], (v) => { if (i === 0) value = v; }];
    },
    useRef: (init) => { const i = idx++; if (!(i in cells)) cells[i] = { current: init }; return cells[i]; },
    useCallback: (f) => f,
    useEffect: (f) => { pending.push(f); },
  };
  const db = stubDb(plan);
  // ⚠ THE REAL CLOCK, not a stub of it: the week key the query is scoped to now
  // comes THROUGH useWeekClock, so stubbing it here would leave the assertions
  // below testing a path production does not take.
  const useWeekClock = new Function('React', 'setInterval', 'clearInterval',
    fn(DATA, 'useWeekClock') + '\nreturn useWeekClock;')(React, () => 1, () => {});
  const hook = new Function('React', 'window', 'DWK_RPC_BATCH', 'dwkBridge', 'readoutWeekKey', 'useWeekClock',
    src + '\nreturn useWeekReadouts;')(React, { shapeDb: db }, 100, async () => {}, readoutWeekKey, useWeekClock);
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
test('the member’s widget declares emptiness — it is never omitted from the array', () => {
  // ⚠ MEASURED, AND IT MADE THE FEATURE DEAD. DashGrid's boot effect has deps
  // `[role, tab]`, so the widget array it resolves a layout from is the one
  // captured on the FIRST render — where `source` is null and `live` is false. A
  // `live ? {…} : null` entry is absent when the portal hosts are created, and the
  // card never mounts for anyone. The contract is `empty`, which keeps the entry in
  // the list and lets the grid add and remove its item as the flag flips.
  const m = PROG.match(/\{ key: "readout"[^\n]*\}/);
  assert.ok(m, 'the readout widget entry moved');
  assert.ok(!/live \?\s*\{ key: "readout"/.test(PROG), 'the entry is gated on a value that is false at boot');
  assert.match(m[0], /empty: !readout\.shown/, 'the entry does not declare its own emptiness');
});

test('the readout’s data is fetched by the PAGE, because an empty widget never mounts', () => {
  // ⚠ THIS IS A DEADLOCK, NOT A PREFERENCE. DashGrid creates no portal host for a
  // widget that declares `empty: true` — so a card that could only discover it has
  // something to show BY MOUNTING AND FETCHING would be skipped forever. Moving the
  // fetch back inside the card re-creates it silently: the card simply stops
  // appearing, with nothing failing.
  const page = fn(PROG, 'ClientProgressPage');
  assert.match(page, /useDprWeeklyReadout\(live\)/, 'the page no longer owns the readout fetch');
  const card = fn(PROG, 'DprWeeklyReadout');
  assert.ok(!/\bfetch\s*\(/.test(card), 'the card fetches again — the empty widget can never mount to do it');
  assert.ok(!/useState|useEffect/.test(card), 'the card holds state again, so the page cannot know if it is empty');
  // the card keeps its own guard for the frame the effect cannot cover: `empty`
  // reaches the grid through an effect, which runs AFTER the commit
  assert.match(card, /if \(!shown \|\| !held \|\| !held\.readout\) return null;/);
  // …and the hook is what decides `shown`, from the same render's `live`
  assert.match(fn(PROG, 'useDprWeeklyReadout'),
    /return \{ held, shown: !\(!live \|\| !held \|\| !held\.readout \|\| mismatched\) \};/);
});

test('the member’s card does not make a resolvable identity a precondition of the POST', () => {
  // ⚠ The route authenticates off the same cookie session that made `live` true,
  // while `shapeDb.getUser()` is a live round trip that returns null on any blip.
  // Gating the request on it meant one transient auth failure silently removed
  // this card while every other card on the page stayed live, with no message.
  const src = fn(PROG, 'useDprWeeklyReadout');
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
  const src = fn(PROG, 'useDprWeeklyReadout');
  assert.match(src, /onAuthStateChange/);
  assert.match(src, /\}, \[live, authTick\]\);/, 'the fetch does not re-run on an auth change');
  assert.match(src, /\}, \[authTick\]\);/, 'the subject is not re-resolved on an auth change');
  assert.match(src, /subscription\.unsubscribe\(\)/, 'the auth subscription outlives the card');
});

// ── The Codex round on this PR, DRIVEN ───────────────────────────────────────
// The auth callback is extracted and executed against a fake emitter, because
// both findings are about WHICH events it acts on and WHAT it clears before the
// next render — neither of which a source match can see.
function runAuthCallback(events) {
  const src = fn(PROG, 'useDprWeeklyReadout');
  // The callback body, lifted out of the effect that registers it.
  const at = src.indexOf('sub = db.client.auth.onAuthStateChange(');
  assert.notEqual(at, -1, 'the auth subscription moved');
  let depth = 0, i = src.indexOf('(', at + 'sub = db.client.auth.onAuthStateChange'.length);
  const start = i;
  for (; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) break;
  }
  const cb = src.slice(start + 1, i); // the arrow function source

  const calls = { held: [], who: [], tick: 0 };
  const ref = { current: undefined };
  const est = { current: false };
  const fnBody = new Function('lastAuthUidRef', 'authEstablishedRef', 'setHeld', 'setWhoNow', 'setAuthTick', 'return (' + cb + ');')(
    ref,
    est,
    (v) => calls.held.push(v),
    (v) => calls.who.push(v),
    () => { calls.tick += 1; },
  );
  for (const [event, session] of events) fnBody(event, session);
  return calls;
}
const sess = (id) => (id ? { user: { id } } : null);

test('a same-user auth event does not cancel the POST already in flight', () => {
  // ⚠ VERIFIED AGAINST THE INSTALLED LIBRARY, not assumed: supabase-js 2.112.4
  // emits INITIAL_SESSION the moment onAuthStateChange subscribes, plus SIGNED_IN
  // and TOKEN_REFRESHED for the SAME user. Ticking on those cancels the in-flight
  // request and starts a second — which then LOSES the weekly claim the first is
  // still holding, and the route's `mayGenerate = !claim || claim.outcome ===
  // 'claimed'` serves that caller the deterministic fallback. The member is shown
  // "Computed, not written" for a week whose AI readout was generated and thrown
  // away.
  const c = runAuthCallback([
    ['INITIAL_SESSION', sess('A')],
    ['SIGNED_IN', sess('A')],
    ['TOKEN_REFRESHED', sess('A')],
  ]);
  assert.equal(c.tick, 0, 'a same-user event re-fetched');
  assert.deepEqual(c.held, [], 'a same-user event discarded the held readout');
});

test('a real account switch clears the held readout BEFORE the re-fetch', () => {
  // ⚠ THE CROSS-ACCOUNT DEFECT. Bumping the tick alone leaves the next render
  // holding A's readout and A's `whoNow`, so `mismatched` is false and A's
  // private health summary commits under B's session until an async getUser()
  // round trip resolves.
  const c = runAuthCallback([['INITIAL_SESSION', sess('A')], ['SIGNED_IN', sess('B')]]);
  assert.equal(c.tick, 1);
  assert.deepEqual(c.held, [null], 'the previous account\u2019s readout was not cleared');
  assert.deepEqual(c.who, ['B'], 'the subject was not moved to the new account synchronously');
});

test('a sign-out clears the readout too, and does not carry the subject over', () => {
  const c = runAuthCallback([['INITIAL_SESSION', sess('A')], ['SIGNED_OUT', null]]);
  assert.equal(c.tick, 1);
  assert.deepEqual(c.held, [null]);
  assert.deepEqual(c.who, [null]);
});

test('the first event only registers the subject; it is not a switch', () => {
  // The card may mount already signed in — INITIAL_SESSION then reports the
  // account it is already showing, which is not a change.
  const c = runAuthCallback([['INITIAL_SESSION', sess('A')]]);
  assert.equal(c.tick, 0);
  assert.deepEqual(c.held, []);
});

test('insight rows are keyed uniquely, since the route does not dedupe them', () => {
  // `generateReadout` filters by `validKeys.has(correlation_key)` — membership
  // only — so two insights citing the same pair carry the same key and React
  // reconciles the two rows as one.
  assert.match(fn(PROG, 'DprWeeklyReadout'), /key=\{\(ins\.correlation_key \|\| "i"\) \+ "@" \+ i\}/);
});

// ── The SECOND Codex round, driven ───────────────────────────────────────────
test('the cookie bridge arriving late is initialization, not an account switch', () => {
  // ⚠ ON A COOKIE-ONLY LOAD supabase has nothing in localStorage, so INITIAL_SESSION
  // reports a NULL session; `shapeDb.getSession()` then bridges the cookie with
  // `setSession()` (public/supabase.js), which emits SIGNED_IN for the account that
  // was signed in all along. Reading that null as an established baseline makes the
  // bridge's arrival look like a switch: it cancels the POST already in flight and
  // starts a second, which loses the weekly claim the first still holds and is
  // served the deterministic fallback — the member sees "Computed, not written" for
  // a week whose AI readout was generated and discarded.
  const c = runAuthCallback([['INITIAL_SESSION', null], ['SIGNED_IN', sess('A')]]);
  assert.equal(c.tick, 0, 'the cookie bridge cancelled the in-flight POST');
  assert.deepEqual(c.held, [], 'the bridge discarded a readout for the same account');
});

test('…and a subject, once established, makes sign-out → sign-in a real switch', () => {
  // ⚠ THE FLAG IS ONE-WAY ON PURPOSE. Keying "still establishing" on the last value
  // being null instead would swallow the sign-in after a sign-out — B would never
  // get a fetch, and would sit looking at an empty card until a reload.
  const c = runAuthCallback([['INITIAL_SESSION', sess('A')], ['SIGNED_OUT', null], ['SIGNED_IN', sess('B')]]);
  assert.equal(c.tick, 2, 'a sign-out or the sign-in after it stopped counting');
  assert.deepEqual(c.held, [null, null]);
  assert.deepEqual(c.who, [null, 'B']);
});

test('a signed-out page that never resolves an account never ticks', () => {
  const c = runAuthCallback([['INITIAL_SESSION', null], ['TOKEN_REFRESHED', null]]);
  assert.equal(c.tick, 0);
});

// ── The UTC week can turn while this page's week does not ────────────────────
test('the UTC week key moves at an instant the local week key does not', () => {
  // The premise of the clock below, measured rather than argued: Sydney is UTC+10,
  // so its Monday starts ten hours before UTC's. Between those two instants the
  // coach's own week is unchanged and the row's key is not.
  const beforeUtcMonday = Date.UTC(2026, 8, 13, 23, 0);  // Sun 23:00Z = Mon 09:00 Sydney
  const afterUtcMonday = Date.UTC(2026, 8, 14, 1, 0);    // Mon 01:00Z = Mon 11:00 Sydney
  assert.notEqual(readoutWeekKey(0, beforeUtcMonday), readoutWeekKey(0, afterUtcMonday),
    'the two instants share a UTC week — the fixture does not test the boundary');
  const sydneyDay = (ms) => new Date(ms + 10 * 3600000).toISOString().slice(0, 10);
  assert.equal(sydneyDay(beforeUtcMonday), sydneyDay(afterUtcMonday),
    'the fixture crosses a Sydney day too, so it proves nothing about the local week');
});

test('the Week view resolves its key through the clock, not inside the effect', () => {
  // ⚠ COMPUTING IT DURING THE EFFECT DOES NOT CAUSE THE EFFECT TO RUN. With deps
  // [ids, weeksBack, live] none of them changes at the UTC boundary, so a page left
  // open goes on querying the previous week's key and misses every readout written
  // after it.
  const src = fn(stripComments(WEEK), 'useWeekReadouts');
  assert.match(src, /useWeekClock\(/, 'the week key is not on a clock');
  const deps = src.slice(src.lastIndexOf('}, ['));
  assert.match(deps, /weekKey/, 'the read does not depend on the clock-derived key');
  assert.ok(!/const weekKey = readoutWeekKey/.test(src.slice(src.indexOf('React.useEffect'))),
    'the key is still computed inside the effect it is supposed to trigger');
});

test('useWeekClock returns a fresh value every render and only forces one on a change', () => {
  // Driven against a stub React: the hook is the only thing standing between an idle
  // dashboard and a stale week, so its two properties are executed rather than read.
  const src = fn(readFileSync(new URL('../public/newdesign/dashData.jsx', import.meta.url), 'utf8'), 'useWeekClock');
  let effect = null; let forced = 0; let timer = null;
  const cells = [];
  let idx = 0;
  const React = {
    useState(init) {
      const i = idx++;
      if (!(i in cells)) cells[i] = typeof init === 'function' ? init() : init;
      return [cells[i], () => { forced += 1; }];
    },
    useRef(init) { const i = idx++; if (!(i in cells)) cells[i] = { current: init }; return cells[i]; },
    useEffect(f) { if (effect === null) effect = f; },
  };
  const useWeekClock = new Function('React', 'setInterval', 'clearInterval',
    src + '\nreturn useWeekClock;')(React, (f) => { timer = f; return 1; }, () => {});

  let now = 'W1';
  const render = () => { idx = 0; return useWeekClock(() => now); };
  assert.equal(render(), 'W1');
  effect();                       // mount
  timer(); assert.equal(forced, 0, 'an unchanged key forced a render');
  now = 'W2';
  timer(); assert.equal(forced, 1, 'the boundary did not force a render');
  // and the NEXT render reads the new value — the tick only causes the render,
  // it is not itself the source of truth
  assert.equal(render(), 'W2');
  // a compute that throws must not take the page down with it
  now = null;
  const boom = () => { idx = 0; return useWeekClock(() => { throw new Error('x'); }); };
  assert.throws(boom);            // during render it is the caller's problem…
  idx = 0; useWeekClock(() => 'W2');
  assert.doesNotThrow(() => timer());   // …but the timer swallows it
});
