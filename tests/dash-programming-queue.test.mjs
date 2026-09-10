// The programming queue's "done" state (review 2026-09-09, R6).
//
// It used to live in ONE browser's localStorage and conflated two different
// claims: "I ticked this" and "a week was actually delivered". The panel now
// reads the server ledger for the second and an account-level document for the
// first, and keeps them apart — a publish is a fact and cannot be undone from
// the queue; a mark is the coach's own note and can.
//
// The pure pieces are brace-matched out of the SHIPPED source and evaluated, so
// an equivalent rewrite passes and a real regression fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const TODAY = readFileSync(new URL('../public/newdesign/dashToday.jsx', import.meta.url), 'utf8');
const DATA = readFileSync(new URL('../public/newdesign/dashData.jsx', import.meta.url), 'utf8');
const ROUTE = readFileSync(new URL('../src/app/api/coach/week-publishes/route.ts', import.meta.url), 'utf8');

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

// The week key is derived from DashSignals' own Monday, so the queue's bucket
// and the engine's week cannot drift apart.
const monday = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const { dashQueueWeekKey, dashQueueWeekKeyAgo } = new Function(
  'DashSignals',
  [fn(TODAY, 'dashQueueMonday'), fn(TODAY, 'dashQueueKeyOf'), fn(TODAY, 'dashQueueWeekKey'), fn(TODAY, 'dashQueueWeekKeyAgo')].join('\n') +
  '\nreturn { dashQueueWeekKey, dashQueueWeekKeyAgo };'
)({ _internals: { mondayOf: monday } });

test('the week key is this local Monday, zero-padded so it sorts', () => {
  const key = dashQueueWeekKey();
  assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
  const m = monday(new Date());
  assert.equal(key, m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0') + '-' + String(m.getDate()).padStart(2, '0'));
  // ⚠ It is a MONDAY, not "today" — the queue is a week's work, not a day's.
  assert.equal(new Date(key + 'T00:00:00').getDay(), 1);
});

test('localStorage is gone from the queue entirely', () => {
  // ⚠ The whole point of R6: a queue that lives in one browser is not a queue.
  // Pinned across the panel's own span rather than the file, since other panels
  // in dashToday.jsx legitimately use it.
  const start = TODAY.indexOf('function ProgrammingQueuePanel(');
  const end = TODAY.indexOf('// Client-wins briefing');
  assert.ok(start !== -1 && end > start);
  const panel = TODAY.slice(start, end);
  // ⚠ A USE, NOT A MENTION. The panel's own comment explains what it replaced,
  // so a bare /localStorage/ match fails on the documentation of the fix.
  assert.ok(!/localStorage\s*[.[]/.test(panel), 'the queue still reaches for localStorage');
  assert.match(panel, /useCoachDoc\("coach_week_plans", live\)/);
});

// ── The row's state, DRIVEN ─────────────────────────────────────
// ⚠ THIS HALF USED TO BE A SET OF SOURCE MATCHES, and the review that caught it
// was right: `/if \(isPublished\(id\)\) return;/` passes on a `toggle` that calls
// the store BEFORE the bail, and fails on a correct rewrite that renames a
// variable. The row's state is a pure function precisely so it can be executed.
const { dashQueueRowState, dashQueueNotices, dashQueueMergeMarks } = new Function(
  [fn(TODAY, 'dashQueueRowState'), fn(TODAY, 'dashQueueNotices'), fn(TODAY, 'dashQueueMergeMarks')].join('\n') +
  '\nreturn { dashQueueRowState, dashQueueNotices, dashQueueMergeMarks };'
)();

const ctx = (o) => ({ published: {}, marked: {}, storeKind: 'ready', localMarks: new Set(), ...o });

test('a published week is a fact: done, and nothing here can undo it', () => {
  const st = dashQueueRowState('u1', ctx({ published: { u1: { weekStart: '2026-09-14' } } }));
  assert.equal(st.published, true);
  assert.equal(st.done, true);
  assert.equal(st.canToggle, false, 'a publish must not offer an Undo');
  assert.match(st.pill, /Week published/);
});

test('a stored mark is done and undoable, and reads differently from a publish', () => {
  const st = dashQueueRowState('u1', ctx({ marked: { u1: { markedAt: 'x' } } }));
  assert.equal(st.published, false);
  assert.equal(st.done, true);
  assert.equal(st.canToggle, true);
  assert.match(st.pill, /Marked written/);
  // ⚠ The two claims must not be spelled the same — collapsing "I ticked this"
  // into "a week was delivered" is the defect R6 exists to fix.
  const pub = dashQueueRowState('u1', ctx({ published: { u1: { weekStart: '2026-09-14' } } }));
  assert.notEqual(st.pill, pub.pill);
});

test('a publish outranks a mark, so the row cannot claim to be undoable', () => {
  const st = dashQueueRowState('u1', ctx({ published: { u1: { weekStart: '2026-09-14' } }, marked: { u1: {} } }));
  assert.equal(st.canToggle, false);
  assert.match(st.pill, /Week published/);
});

test('an untouched row is not done and offers the mark', () => {
  const st = dashQueueRowState('u1', ctx());
  assert.deepEqual([st.published, st.marked, st.done, st.canToggle, st.pill], [false, false, false, true, null]);
});

test('when the store cannot keep a mark, the row reads the LOCAL set instead', () => {
  // ⚠ Signed out or unreadable, `apply` refuses before any paint — so without
  // this the button did nothing at all, silently, where the localStorage this
  // change removed at least kept the week's work.
  for (const kind of ['signedout', 'unavailable', 'demo']) {
    const st = dashQueueRowState('u1', ctx({ storeKind: kind, localMarks: new Set(['u1']), marked: {} }));
    assert.equal(st.done, true, `${kind}: a local tick did not register`);
    assert.equal(st.canToggle, true);
  }
  // and a stored doc is NOT consulted in those states (it is another account's
  // or a stale render's)
  const st = dashQueueRowState('u1', ctx({ storeKind: 'signedout', marked: { u1: {} }, localMarks: new Set() }));
  assert.equal(st.done, false);
});

test('an error state still reads the stored doc, since the rollback restored it', () => {
  const st = dashQueueRowState('u1', ctx({ storeKind: 'error', marked: { u1: {} } }));
  assert.equal(st.done, true);
});

test('the notices name every unreadable state and never mask one another', () => {
  // ⚠ THE MASKING WAS THE DEFECT. An exclusive chain showed only the ledger's
  // failure when BOTH had failed, so a coach marking rows offline watched each
  // one paint and was never told the marks were not saving.
  const both = dashQueueNotices('error', 'error');
  assert.equal(both.length, 2, 'one failure hid the other');
  assert.ok(both.some((n) => /already been published/.test(n)));
  assert.ok(both.some((n) => /didn\u2019t save/.test(n)));

  assert.deepEqual(dashQueueNotices('ready', 'ready'), [], 'a healthy panel says nothing');
  assert.match(dashQueueNotices('loading', 'ready')[0], /Checking/);
  assert.match(dashQueueNotices('ready', 'loading')[0], /Checking/);

  // ⚠ "Sign in" must not be said to a coach who IS signed in. getUserGoals
  // returns null for "not signed in" AND "the read failed" alike, so the one
  // sentence has to be true of both.
  for (const kind of ['signedout', 'unavailable']) {
    const [msg] = dashQueueNotices('ready', kind);
    assert.match(msg, /this device only/);
  }
});

test('the ledger is trainer-only, and keyed on the week as well as on live', () => {
  const hook = fn(TODAY, 'useWeekPublishes');
  // ⚠ coach_week_publishes has no role column and only the trainer week route
  // writes it, so a nutritionist reading it would attribute a TRAINING publish
  // to meal-plan work for a dual-role coach.
  assert.match(hook, /if \(role !== "trainer"\)/);
  // ⚠ frozen `since` across a Monday boundary reads the new week's marks
  // against the old week's ledger.
  assert.match(hook, /\}, \[live, weekKey, role\]\);/);
});

test('the marks document is pruned, since saveUserGoals upserts the whole thing', () => {
  // ⚠ DRIVEN. Asserting that a cutoff is COMPUTED says nothing about whether it
  // is applied — measured: deleting the `k >= cutoff` comparison left every
  // source assertion green while the document grew without bound.
  const doc = {
    '2026-09-07': { u1: { markedAt: 'a' } },   // the current bucket
    '2026-08-31': { u2: { markedAt: 'b' } },   // inside the window
    '2026-07-27': { u3: { markedAt: 'c' } },   // exactly at the cutoff — kept
    '2026-07-20': { u4: { markedAt: 'd' } },   // older — dropped
    '2025-11-03': { u5: { markedAt: 'e' } },   // much older — dropped
  };
  const next = dashQueueMergeMarks(doc, '2026-09-07', 'u9', true, '2026-07-27', 'NOW');
  assert.deepEqual(Object.keys(next).sort(), ['2026-07-27', '2026-08-31', '2026-09-07']);
  assert.deepEqual(next['2026-09-07'], { u1: { markedAt: 'a' }, u9: { markedAt: 'NOW' } }, 'the tick landed beside the existing marks');
  assert.deepEqual(next['2026-08-31'], { u2: { markedAt: 'b' } }, 'an in-window bucket was rewritten');

  // Un-marking deletes the key rather than storing a falsey one.
  const off = dashQueueMergeMarks(next, '2026-09-07', 'u9', false, '2026-07-27', 'NOW');
  assert.ok(!('u9' in off['2026-09-07']));
  assert.ok('u1' in off['2026-09-07'], 'un-marking one client dropped another');

  // A null/absent document is a first mark, not a crash.
  assert.deepEqual(dashQueueMergeMarks(null, '2026-09-07', 'u1', true, '2026-07-27', 'NOW'),
    { '2026-09-07': { u1: { markedAt: 'NOW' } } });
});

test('the retention cutoff is a Monday N weeks back, so it compares with the keys', () => {
  const cutoff = dashQueueWeekKeyAgo(6);
  assert.match(cutoff, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(cutoff < dashQueueWeekKey(), 'the cutoff is in the past');
  assert.equal(new Date(cutoff + 'T00:00:00').getDay(), 1);
  assert.equal(Math.round((new Date(dashQueueWeekKey()) - new Date(cutoff)) / 86400000), 42);
});

test('the Template link goes through the shell router, not a full page load', () => {
  // TrainerPrograms.html / NutritionistPlans.html are redirect stubs; a raw href
  // from inside the shell costs two page loads and an SPA boot (R19).
  const panel = TODAY.slice(TODAY.indexOf('function ProgrammingQueuePanel('), TODAY.indexOf('// Client-wins briefing'));
  assert.match(panel, /href=\{dashShellHref\(/);
  assert.ok(!/href="(Trainer|Nutritionist)\w*\.html"/.test(panel), 'a raw legacy href survived');
});

test('useCoachDoc binds the write to the account that acted and declines an untrusted read', () => {
  const src = fn(DATA, 'useCoachDoc');
  assert.match(DATA, /async function dashDocBridge\(\)/);
  assert.match(src, /await dashDocBridge\(\);/);
  assert.match(src, /if \(doc == null\) \{ setState\(\(s\) => \(\{ \.\.\.s, kind: "error" \}\)\); return false; \}/);
  assert.match(src, /if \(!nowUid \|\| \(startUid && nowUid !== startUid\)\)/);
  assert.match(src, /return dashDocSerial\(async \(\) => \{/);
  // ⚠ A FAILED WRITE ROLLS THE PAINT BACK onto the server copy and does NOT
  // clear an existing error — the two together were a silent data loss: a
  // failed mark stayed on screen as saved, the next mark hid the notice, and
  // the lane re-read a server doc that had never received the first one.
  assert.ok(!/kind: s\.kind === "error" \? "ready" : s\.kind/.test(src), 'the optimistic paint clears the error again');
  assert.equal((src.match(/setState\(\(s\) => \(\{ \.\.\.s, doc, kind: "error" \}\)\)/g) || []).length, 2,
    'a failed save must restore the server copy');
  assert.match(src, /setState\(\(s\) => \(\{ \.\.\.s, kind: "ready" \}\)\);\n      return true;/);
});

// ── The read route, DRIVEN ───────────────────────────────────────────────────
// ⚠ RLS on coach_week_publishes is deliberately deny-all with no policies, so
// this route runs the SERVICE ROLE. The coach_user_id filter is therefore the
// entire security argument, and a source scan cannot tell a live filter from a
// short-circuited one — the first version of this test pinned the text of the
// `since` guard and passed happily with `if (false && …)` in front of it.
// Driving it is what makes the difference visible.
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
const ME = '11111111-1111-4111-8111-111111111111';

// Records every filter the route applies, so the scope can be asserted on what
// the query ASKED FOR rather than on how it was written.
function adminSpy(result) {
  const filters = [];
  const chain = {
    select: () => chain,
    eq: (col, val) => { filters.push([col, val]); return chain; },
    gte: (col, val) => { filters.push(['gte:' + col, val]); return chain; },
    order: () => Promise.resolve(result),
  };
  return { filters, client: { from: () => chain } };
}

async function loadRoute(spy, { user = { id: ME } } = {}) {
  return loadRealModule(join(ROOT, 'src/app/api/coach/week-publishes/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { currentUser: async () => user, clientForRequest: async () => spy.client }],
      ['@/lib/supabase/admin', { createAdminClient: () => spy.client }],
    ]),
  });
}
const req = (qs) => new Request('https://x/api/coach/week-publishes' + qs);

test('the query is scoped to the authenticated coach, whatever the caller asks for', async () => {
  const spy = adminSpy({ data: [], error: null });
  const mod = await loadRoute(spy);
  // A caller trying to name someone else's ledger — the scope must ignore it.
  const res = await mod.GET(req('?since=2026-09-07&coach=22222222-2222-4222-8222-222222222222&coach_user_id=nope'));
  assert.equal(res.status, 200);
  const scope = spy.filters.filter(([c]) => c === 'coach_user_id');
  assert.deepEqual(scope, [['coach_user_id', ME]], 'exactly one scope filter, and it is the signed-in user');
});

test('an anonymous caller gets 401 and the ledger is never queried', async () => {
  const spy = adminSpy({ data: [], error: null });
  const mod = await loadRoute(spy, { user: null });
  const res = await mod.GET(req('?since=2026-09-07'));
  assert.equal(res.status, 401);
  assert.deepEqual(spy.filters, [], 'the query ran anyway');
});

test('a malformed `since` is refused, so it cannot widen the window', async () => {
  const mod = await loadRoute(adminSpy({ data: [], error: null }));
  // ⚠ `+002026-09-07` IS THE ONE THAT MATTERS. Every other bad input here is
  // also rejected by the Date parse on the next line, so a test without it
  // passes with the SHAPE check disabled entirely — measured: `if (false && …)`
  // survived until this case was added. An expanded-year form parses fine and
  // is only caught by the shape.
  for (const bad of ['', 'yesterday', '2026-9-7', '2026-13-40', '+002026-09-07', "2026-09-07' or true--"]) {
    const res = await mod.GET(req('?since=' + encodeURIComponent(bad)));
    assert.equal(res.status, 400, `"${bad}" was accepted`);
  }
  const spy = adminSpy({ data: [], error: null });
  const ok = await loadRoute(spy);
  assert.equal((await ok.GET(req('?since=2026-09-07'))).status, 200);
  // ⚠ THE WINDOW IS `created_at`, NOT `week_start` — the queue asks who the
  // coach has PROGRAMMED this week, and a week published last Monday FOR this
  // week is last week's work. Filtering on week_start dropped that client from
  // "ready to program" while the coming week's plan did not exist.
  assert.deepEqual(spy.filters.find(([c]) => c === 'gte:created_at'), ['gte:created_at', '2026-09-07']);
  assert.equal(spy.filters.find(([c]) => c === 'gte:week_start'), undefined, 'the old window survived');
});

test('an unreadable ledger is an error, never an empty map', async () => {
  // ⚠ `{ published: {} }` is the positive claim "you have not programmed
  // anyone" — the one sentence a coach must not be shown when the truth is
  // that the read failed.
  const mod = await loadRoute(adminSpy({ data: null, error: { message: 'permission denied' } }));
  const res = await mod.GET(req('?since=2026-09-07'));
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.ok(!('published' in body), 'a failed read still answered with a map');
});

// ⚠ DRIVEN IN BOTH ARRIVAL ORDERS, because a route that keeps the first row it
// sees passes this in one order and fails in the other — and the order is a
// property of a query clause, not of this function. Measured: with only the
// descending case, flipping the ORDER BY survived.
for (const [label, rows] of [
  ['descending', [
    { client_id: 'u1', week_start: '2026-09-14', created_at: '2026-09-10T09:00:00Z' },
    { client_id: 'u1', week_start: '2026-09-07', created_at: '2026-09-03T09:00:00Z' },
    { client_id: 'u2', week_start: '2026-09-07', created_at: '2026-09-04T09:00:00Z' },
    { client_id: null, week_start: '2026-09-07', created_at: null },
  ]],
  ['ascending', [
    { client_id: 'u1', week_start: '2026-09-07', created_at: '2026-09-03T09:00:00Z' },
    { client_id: 'u2', week_start: '2026-09-07', created_at: '2026-09-04T09:00:00Z' },
    { client_id: 'u1', week_start: '2026-09-14', created_at: '2026-09-10T09:00:00Z' },
    { client_id: null, week_start: '2026-09-07', created_at: null },
  ]],
]) {
  test(`the newest week wins whatever order the rows arrive in (${label})`, async () => {
    const mod = await loadRoute(adminSpy({ data: rows, error: null }));
    const { published } = await (await mod.GET(req('?since=2026-09-07'))).json();
    assert.equal(published.u1.weekStart, '2026-09-14', 'an older publish overwrote a newer one');
    assert.equal(published.u1.at, '2026-09-10T09:00:00Z', 'and it carries that row\u2019s own timestamp');
    assert.equal(published.u2.weekStart, '2026-09-07');
    assert.equal(Object.keys(published).length, 2, 'a row with no client_id is skipped, not keyed as "null"');
  });
}
