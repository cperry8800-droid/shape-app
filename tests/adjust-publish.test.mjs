// Adjust regeneration → the weeks the guardrail must judge.
//
// SPEC-guardrails.md §9.4: "The gate evaluates the regenerated week as a FRESH
// proposal against the client's history, never a delta." §3.2b: a regenerated
// week is scored on its own captured pairs, exactly like an authored one.
//
// These fixtures pin the COMPOSITION rules — which rows make up the week the
// client will actually train once a regeneration lands. Every one of them fails
// silently if it is wrong: a week assembled from the wrong rows produces a
// verdict about a week nobody will train.

import test from 'node:test';
import assert from 'node:assert/strict';
import { bsAdjustProposedWeeks, bsAdjustOutcome } from '../src/lib/adjust-publish.mjs';

// 2026-07-29 is a WEDNESDAY, so this week's Monday is 2026-07-27.
const TODAY = '2026-07-29';
const THIS_MON = '2026-07-27';
const NEXT_MON = '2026-08-03';

/** A stored coach row. `pair` present → the payload carries the captured pair. */
function row(id, date, title, pair = { plannedMinutes: 60, plannedRpe: 7 }) {
  return {
    id,
    title,
    description: '',
    kind: 'custom',
    scheduled_date: date,
    payload: { ...(pair || {}), exercises: [] },
  };
}

/** An insert as `bsAdjustRegen` emits it — snake_case `scheduled_date`. */
function insert(date, title, pair = { plannedMinutes: 60, plannedRpe: 7 }) {
  return {
    title,
    description: '',
    kind: 'custom',
    scheduled_date: date,
    playlist_id: null,
    payload: { ...(pair || {}), exercises: [], adjustGen: 2 },
  };
}

test('a fully-future week is exactly its inserts — a re-emitted survivor is never double-counted', () => {
  // bsAdjustRegen deletes every survivor and re-emits it. If the deleted row
  // were still counted, the week would read as twice its real load and flag on
  // work that does not exist.
  const rows = [row('r1', '2026-08-04', 'Upper'), row('r2', '2026-08-06', 'Lower')];
  const plan = {
    deleteIds: ['r1', 'r2'],
    inserts: [insert('2026-08-04', 'Upper'), insert('2026-08-06', 'Lower')],
    repeatPatches: [],
  };
  const weeks = bsAdjustProposedWeeks({ rows, plan, todayISO: TODAY });
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].weekStartISO, NEXT_MON);
  assert.equal(weeks[0].sessions.length, 2);
  assert.deepEqual(weeks[0].sessions.map((s) => s.title), ['Upper', 'Lower']);
});

test('a PAST row in the current week is excluded — it is already in the history the core reads', () => {
  // Counting it in the proposal too would score it TWICE: once as baseline
  // history, once as proposed load. It is also not ours to rewrite (the
  // regeneration's scope is the strict future), so it cannot be republished.
  const rows = [row('past', THIS_MON, 'Monday'), row('fut', '2026-07-31', 'Friday')];
  const plan = { deleteIds: ['fut'], inserts: [insert('2026-07-31', 'Friday')], repeatPatches: [] };
  const weeks = bsAdjustProposedWeeks({ rows, plan, todayISO: TODAY });
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].weekStartISO, THIS_MON);
  assert.deepEqual(weeks[0].sessions.map((s) => s.title), ['Friday']);
  assert.equal(weeks[0].skippedPast, 1);
});

test('a future row the planner did NOT touch is carried into the week', () => {
  // The whole reason the week is assembled rather than taken from the inserts:
  // a session the regeneration leaves alone is still load the client will train,
  // and a week missing it is not the week being judged.
  const rows = [row('keep', '2026-08-05', 'Untouched'), row('moved', '2026-08-04', 'Moved')];
  const plan = { deleteIds: ['moved'], inserts: [insert('2026-08-06', 'Moved')], repeatPatches: [] };
  const weeks = bsAdjustProposedWeeks({ rows, plan, todayISO: TODAY });
  assert.equal(weeks.length, 1);
  assert.deepEqual(weeks[0].sessions.map((s) => s.title).sort(), ['Moved', 'Untouched']);
  assert.equal(weeks[0].carried, 1);
});

test('today is not past — a session dated today is carried', () => {
  const rows = [row('today', TODAY, 'Today')];
  const plan = { deleteIds: [], inserts: [insert('2026-07-31', 'Friday')], repeatPatches: [] };
  const weeks = bsAdjustProposedWeeks({ rows, plan, todayISO: TODAY });
  assert.deepEqual(weeks[0].sessions.map((s) => s.title), ['Today', 'Friday']);
});

test('capture is per_session ONLY when every session in the merged week carries the pair', () => {
  // §3.2a: a partial stamp is the malformed case that switches the guardrail
  // OFF, so a week with one unstamped session must declare itself incomplete,
  // never complete.
  const stamped = bsAdjustProposedWeeks({
    rows: [],
    plan: { deleteIds: [], inserts: [insert('2026-08-04', 'A'), insert('2026-08-06', 'B')], repeatPatches: [] },
    todayISO: TODAY,
  });
  assert.equal(stamped[0].capture, 'per_session');
  assert.ok(stamped[0].sessions.every((s) => s.loadCapture === 'per_session'));

  const partial = bsAdjustProposedWeeks({
    rows: [],
    plan: { deleteIds: [], inserts: [insert('2026-08-04', 'A'), insert('2026-08-06', 'B', null)], repeatPatches: [] },
    todayISO: TODAY,
  });
  assert.equal(partial[0].capture, undefined);
  assert.ok(partial[0].sessions.every((s) => s.loadCapture === undefined));
});

test('a carried session with no pair makes the whole week incomplete', () => {
  // The carried row is real load. If it is unmeasured, the week is unmeasured —
  // claiming per_session would put a hole in a week that declared itself whole.
  const rows = [row('bare', '2026-08-05', 'Bare', null)];
  const plan = { deleteIds: [], inserts: [insert('2026-08-04', 'A')], repeatPatches: [] };
  const weeks = bsAdjustProposedWeeks({ rows, plan, todayISO: TODAY });
  assert.equal(weeks[0].capture, undefined);
});

test('weeks with no inserts produce no proposed week — nothing there changed', () => {
  // A week the regeneration does not write is a week whose load it does not
  // move. Evaluating it would flag a coach for a week they did not just author.
  const rows = [row('far', '2026-08-20', 'Far')];
  const plan = { deleteIds: [], inserts: [insert('2026-08-04', 'A')], repeatPatches: [] };
  const weeks = bsAdjustProposedWeeks({ rows, plan, todayISO: TODAY });
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].weekStartISO, NEXT_MON);
});

test('a delete-only week IS evaluated — removing sessions changes the week the client trains', () => {
  // §9.4's corrected premise: regeneration is gated because it changes week
  // COMPOSITION. A week trimmed from 5 sessions to 3 crosses regime boundaries
  // (BS_COMPOUND_MIN_SESSIONS = 3), which changes which axes are evaluable —
  // invisible in the total, and exactly what an ungated regeneration hides.
  const rows = [row('a', '2026-08-04', 'A'), row('b', '2026-08-06', 'B')];
  const plan = { deleteIds: ['b'], inserts: [], repeatPatches: [] };
  const weeks = bsAdjustProposedWeeks({ rows, plan, todayISO: TODAY });
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].weekStartISO, NEXT_MON);
  assert.deepEqual(weeks[0].sessions.map((s) => s.title), ['A']);
});

test('a week emptied entirely is still reported, with zero sessions', () => {
  const rows = [row('a', '2026-08-04', 'A')];
  const plan = { deleteIds: ['a'], inserts: [], repeatPatches: [] };
  const weeks = bsAdjustProposedWeeks({ rows, plan, todayISO: TODAY });
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].sessions.length, 0);
});

test('weeks come back in calendar order, deterministically', () => {
  const plan = {
    deleteIds: [],
    inserts: [insert('2026-08-12', 'C'), insert('2026-07-31', 'A'), insert('2026-08-04', 'B')],
    repeatPatches: [],
  };
  const weeks = bsAdjustProposedWeeks({ rows: [], plan, todayISO: TODAY });
  assert.deepEqual(weeks.map((w) => w.weekStartISO), [THIS_MON, NEXT_MON, '2026-08-10']);
});

test('repeat patches alone never produce a week — they can only NARROW a repeat', () => {
  // bsAdjustRegen builds `kept` as a filtered subset of the stored repeatDow, so
  // a patch can only remove weekdays or delete the row. A strict reduction has
  // no load to flag, and an undated repeat source belongs to no week at all.
  const patches = [{ id: 'r', repeatDow: [0, 2] }];
  const weeks = bsAdjustProposedWeeks({
    rows: [],
    plan: { deleteIds: [], inserts: [], repeatPatches: patches },
    todayISO: TODAY,
  });
  assert.equal(weeks.length, 0);

  // POSITIVE CONTROL — without it this passes against a function that always
  // returns []. The same patches alongside a real insert must still yield
  // exactly the insert's week, proving the patches are what is ignored.
  const withInsert = bsAdjustProposedWeeks({
    rows: [],
    plan: { deleteIds: [], inserts: [insert('2026-08-04', 'A')], repeatPatches: patches },
    todayISO: TODAY,
  });
  assert.deepEqual(withInsert.map((w) => w.weekStartISO), [NEXT_MON]);
});

test('a garbage plan yields no weeks rather than throwing', () => {
  assert.deepEqual(bsAdjustProposedWeeks({ rows: null, plan: null, todayISO: TODAY }), []);

  // POSITIVE CONTROL — the same well-formed call DOES produce a week, so this
  // cannot pass against a function that returns [] unconditionally.
  const good = bsAdjustProposedWeeks({
    rows: [],
    plan: { deleteIds: [], inserts: [insert('2026-08-04', 'A')], repeatPatches: [] },
    todayISO: TODAY,
  });
  assert.equal(good.length, 1);
});

test('a missing todayISO REFUSES rather than proposing zero weeks (CWE-863)', () => {
  // ⚠ THE FAIL DIRECTION IS THE WHOLE POINT. `todayISO` cannot be defaulted to a
  // clock read — the caller owns the clock so every pure module in one
  // regeneration judges against the SAME day. But the previous contract answered
  // that by returning `[]`, and `[]` is indistinguishable from "this plan
  // affects no week": the guardrail evaluates nothing, `bsAdjustOutcome` sees no
  // red, and the regeneration publishes UNEVALUATED. A gate handed zero
  // evaluations does not hold — it opens.
  //
  // So an absent window is a REFUSAL, not an empty answer. It is also a caller
  // bug by construction (the route derives `todayISO` itself), which is exactly
  // the class the house rule reserves a hard failure for: a shape no legitimate
  // writer can emit.
  assert.throws(
    () => bsAdjustProposedWeeks({ rows: [], plan: { inserts: [insert('2026-08-04', 'A')] } }),
    /todayISO/,
  );
  // Even with nothing to propose — a caller that cannot name the day cannot be
  // told "no weeks are affected", because that reads as an evaluated all-clear.
  assert.throws(() => bsAdjustProposedWeeks({}), /todayISO/);
  assert.throws(
    () => bsAdjustProposedWeeks({ rows: [], plan: null, todayISO: '   ' }),
    /todayISO/,
  );
});

// ── The outcome across weeks ────────────────────────────────────────────────

const evalOf = (weekStartISO, publish, extra = {}) => ({
  weekStartISO,
  decision: { publish, displayState: publish ? 'green' : 'red', requiresAck: !publish, ...extra },
  result: { state: publish ? 'green' : 'red', reason: null },
  copy: { headline: `${weekStartISO} copy` },
});

test('one blocking week blocks the whole regeneration', () => {
  // Atomicity: the regeneration commits as ONE transaction, so it cannot
  // partially apply. A week that would be refused on its own must refuse the
  // set — publishing the rest would write a plan the coach never agreed to.
  const out = bsAdjustOutcome([evalOf(THIS_MON, true), evalOf(NEXT_MON, false), evalOf('2026-08-10', true)]);
  assert.equal(out.publish, false);
  assert.equal(out.blocking.weekStartISO, NEXT_MON);
  assert.equal(out.blocking.copy.headline, `${NEXT_MON} copy`);
});

test('the EARLIEST blocking week is the one reported', () => {
  // The coach fixes the first problem first; naming a later week would send
  // them to the wrong place.
  const out = bsAdjustOutcome([evalOf('2026-08-10', false), evalOf(NEXT_MON, false)]);
  assert.equal(out.blocking.weekStartISO, NEXT_MON);
});

test('all weeks passing publishes, and every week is reported', () => {
  const out = bsAdjustOutcome([evalOf(THIS_MON, true), evalOf(NEXT_MON, true)]);
  assert.equal(out.publish, true);
  assert.equal(out.blocking, null);
  assert.equal(out.weeks.length, 2);
});

test('no weeks at all publishes — a regeneration that writes nothing is not blocked', () => {
  const out = bsAdjustOutcome([]);
  assert.equal(out.publish, true);
  assert.equal(out.blocking, null);
  assert.deepEqual(out.weeks, []);

  // POSITIVE CONTROL — an always-permissive stub passes the three assertions
  // above. A single blocking week must flip it, or this proves nothing.
  const blocked = bsAdjustOutcome([evalOf(NEXT_MON, false)]);
  assert.equal(blocked.publish, false);
  assert.equal(blocked.blocking.weekStartISO, NEXT_MON);
});

test('an evaluation missing its decision blocks rather than passing', () => {
  // Fail CLOSED on a shape the evaluator did not produce. A missing decision is
  // an evaluation that did not happen, and treating absence as consent is how a
  // gate silently stops gating.
  const out = bsAdjustOutcome([{ weekStartISO: NEXT_MON }, { weekStartISO: THIS_MON, decision: null }]);
  assert.equal(out.publish, false);
  assert.equal(out.blocking.weekStartISO, THIS_MON);
});

test('bsAdjustProposedWeeks: a malformed todayISO is refused, not merely a missing one', () => {
  // Presence was checked; SHAPE was not. A non-empty but unusable value made
  // `dayDelta` return null inside the merge, so every surviving row was classed
  // as past and dropped and the week was judged on inserts alone — a systematic
  // under-count of load, the same fail-open direction the guard exists to close.
  const plan = { changed: true, inserts: [], deleteIds: [], repeatPatches: [] };
  for (const bad of ['today', '2026-7-1', '2026-02-30', '2026/08/03', 'xx']) {
    assert.throws(
      () => bsAdjustProposedWeeks({ rows: [], plan, todayISO: bad }),
      /calendar-valid/,
      `todayISO ${bad} should be refused`,
    );
  }
  // Still refuses the absent case it already refused.
  assert.throws(() => bsAdjustProposedWeeks({ rows: [], plan, todayISO: '' }), /calendar-valid/);
  assert.throws(() => bsAdjustProposedWeeks({ rows: [], plan }), /calendar-valid/);
});

test('bsAdjustProposedWeeks: a changed plan that proposes no week fails CLOSED', () => {
  // `bsAdjustRegen` returns changed:true carrying only `repeatPatches` when the
  // client's rows are all undated weekly-repeat sources and a weekday is trimmed.
  // Neither leg of the proposal reads repeatPatches, so the set came out empty,
  // `bsAdjustOutcome([])` found no blocking week and answered publish:true, and
  // the regeneration ran with ZERO evaluations. A gate handed nothing to judge
  // does not hold — it opens.
  const weekless = { changed: true, inserts: [], deleteIds: [], repeatPatches: [] };
  assert.throws(
    () => bsAdjustProposedWeeks({ rows: [], plan: weekless, todayISO: TODAY }),
    /refusing to regenerate unevaluated/,
  );
  // And the shape that made it dangerous is still exactly what it was: an empty
  // evaluation list reads as "publish".
  assert.equal(bsAdjustOutcome([]).publish, true);
  // An UNCHANGED plan proposing nothing is legitimate and must not throw.
  assert.deepEqual(
    bsAdjustProposedWeeks({ rows: [], plan: { changed: false, inserts: [], deleteIds: [] }, todayISO: TODAY }),
    [],
  );
});

test('bsAdjustProposedWeeks: a repeat-only NARROWING is allowed through weekless', () => {
  // The one legitimate weekless shape, and the reason a blanket refusal was the
  // wrong fix: trimming a weekday from an undated weekly-repeat source inserts
  // nothing and deletes nothing, the RPC applies it through `p_repeat_patches`,
  // and NOTHING catches a throw here — so refusing it turned a supported
  // adjustment into a 500 with no other path for the coach.
  //
  // Safe unjudged by construction: `bsAdjustRegen` builds `repeatDow` as a
  // filtered subset of the row's current days, so a patch only ever REMOVES a
  // training day. No load is proposed, only load withdrawn.
  const narrowing = {
    changed: true,
    inserts: [],
    deleteIds: [],
    repeatPatches: [{ id: 'r1', repeatDow: [1, 3] }],
  };
  assert.deepEqual(bsAdjustProposedWeeks({ rows: [], plan: narrowing, todayISO: TODAY }), []);

  // The exemption is NARROW: a plan that also carries inserts or deletes but
  // still proposed no week is the fail-open case and must keep refusing. (Both
  // dates below are undated/unparseable, so neither leg contributes a week.)
  assert.throws(
    () => bsAdjustProposedWeeks({
      rows: [],
      plan: { ...narrowing, inserts: [{ title: 'X', scheduled_date: null }] },
      todayISO: TODAY,
    }),
    /refusing to regenerate unevaluated/,
  );
  assert.throws(
    () => bsAdjustProposedWeeks({
      rows: [{ id: 'gone', scheduled_date: null }],
      plan: { ...narrowing, deleteIds: ['gone'] },
      todayISO: TODAY,
    }),
    /refusing to regenerate unevaluated/,
  );
});
