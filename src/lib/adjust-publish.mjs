// Adjust regeneration → the weeks the guardrail judges. Pure: no I/O, no clock.
//
// SPEC-guardrails.md §9.4 gates `regenerate_client_workouts` because a
// regeneration changes week COMPOSITION — it caps training weekdays, deletes
// rows falling outside the new map, and replicates the last adjusted week to the
// horizon. A week trimmed from 5 sessions to 3 crosses a regime boundary
// (`BS_COMPOUND_MIN_SESSIONS = 3`), changing which axes are evaluable and which
// red paths can fire, and none of that is visible in the total. §3.2b then rules
// how it is scored: **a regenerated week is scored on its own captured pairs,
// exactly like an authored one** — as a FRESH proposal, never a delta.
//
// ⚠ THIS MODULE DOES NOT LOOP WEEK-PUBLISHES. `regenerate_client_workouts` is
// ONE transaction, and that atomicity is a real safety property ("never both
// plans, never zero"): N publishes would forfeit it, and a half-applied
// regeneration strands a client between two programs. So the shape is
// evaluate-all-then-write-once — every affected week is judged first, and the
// single atomic RPC runs only if all of them pass or are acknowledged.
//
// The composition rules live here rather than in the route for the same reason
// the core does: a rule that only exists inside a request handler is a rule
// nothing can pin, and every rule below fails SILENTLY when it is wrong — a week
// assembled from the wrong rows yields a confident verdict about a week nobody
// will train.

import { bsMergeWeekSessions, bsWeekStartOf } from './week-merge.mjs';

/**
 * The weeks a regeneration changes, each assembled as the week the client will
 * actually train once it lands.
 *
 * A week is AFFECTED when the plan writes into it — an insert or a delete.
 * Deletes count: removing sessions is precisely the composition change §9.4
 * gates, and a delete-only week that slipped through unevaluated would be the
 * hole the gate exists to close.
 *
 * Composition, per affected week:
 *   surviving stored rows (NOT in `deleteIds`) + this week's inserts
 *
 * ⚠ Every survivor is deleted AND re-emitted by `bsAdjustRegen`, so dropping the
 * deleted rows first is what stops a re-emitted session being counted twice —
 * which would read as double the real load and flag work that does not exist.
 *
 * ⚠ PAST ROWS ARE EXCLUDED, and for a stronger reason than on the session path.
 * A past-dated session has very likely already been performed, which puts it in
 * the LOGGED HISTORY the core reads as its baseline; counting it in the proposal
 * as well would score the same session twice, once on each side of the
 * comparison. It is also outside the regeneration's own scope (strict future),
 * so it is not ours to rewrite. `bsMergeWeekSessions` owns that window rule —
 * one implementation, shared with the session-shaped path.
 *
 * @param {{rows?: Array, plan?: {inserts?: Array, deleteIds?: Array}, todayISO?: string}} args
 *   `rows` are the coach's OWN stored rows for this client (DB shape);
 *   `plan` is a `bsAdjustRegen` result.
 * @returns {Array<{weekStartISO: string, sessions: Array, capture: string|undefined,
 *                  carried: number, skippedPast: number}>} calendar order.
 */
export function bsAdjustProposedWeeks({ rows, plan, todayISO } = {}) {
  const all = Array.isArray(rows) ? rows.filter((r) => r && typeof r === 'object') : [];
  const p = plan && typeof plan === 'object' && !Array.isArray(plan) ? plan : {};
  const inserts = Array.isArray(p.inserts) ? p.inserts : [];
  const deleteIds = Array.isArray(p.deleteIds) ? p.deleteIds : [];
  if (!todayISO) return [];

  const deleted = new Set(deleteIds.map((id) => String(id)));
  const surviving = all.filter((r) => !deleted.has(String(r.id)));

  // Affected weeks, from BOTH legs of the plan.
  const weeks = new Set();
  const incomingByWeek = new Map();
  for (const ins of inserts) {
    if (!ins || typeof ins !== 'object') continue;
    const iso = String(ins.scheduled_date == null ? '' : ins.scheduled_date).slice(0, 10);
    const wk = bsWeekStartOf(iso);
    if (!wk) continue;
    weeks.add(wk);
    if (!incomingByWeek.has(wk)) incomingByWeek.set(wk, []);
    // Into publish shape — `bsMergeWeekSessions` speaks camelCase `scheduledDate`
    // on the incoming side and snake_case on the stored side.
    incomingByWeek.get(wk).push({
      title: ins.title,
      description: ins.description,
      kind: ins.kind,
      scheduledDate: iso,
      payload: ins.payload,
    });
  }
  for (const r of all) {
    if (!deleted.has(String(r.id))) continue;
    // An emptied weekly-repeat SOURCE row is also deleted here and is undated —
    // it belongs to no week, so it contributes none. Its materialized
    // occurrences are dated rows and are handled on their own dates.
    const wk = bsWeekStartOf(String(r.scheduled_date == null ? '' : r.scheduled_date).slice(0, 10));
    if (wk) weeks.add(wk);
  }

  return [...weeks].sort().map((weekStartISO) => {
    const merged = bsMergeWeekSessions(surviving, incomingByWeek.get(weekStartISO) || [], {
      weekStartISO,
      todayISO,
    });
    return { weekStartISO, ...merged };
  });
}

/**
 * The verdict across every affected week.
 *
 * ⚠ ONE BLOCKING WEEK BLOCKS THE SET. The regeneration commits as a single
 * transaction, so it cannot partially apply: publishing "the weeks that passed"
 * is not an option the write path can express, and pretending otherwise would
 * write a plan the coach never agreed to. The EARLIEST blocking week is the one
 * reported, because that is the one the coach fixes first.
 *
 * @param {Array<{weekStartISO: string, decision: {publish?: boolean}}>} evaluations
 * @returns {{publish: boolean, blocking: object|null, weeks: Array}}
 */
export function bsAdjustOutcome(evaluations) {
  const weeks = (Array.isArray(evaluations) ? evaluations : [])
    .filter((e) => e && typeof e === 'object')
    .slice()
    .sort((a, b) => (String(a.weekStartISO) < String(b.weekStartISO) ? -1 : String(a.weekStartISO) > String(b.weekStartISO) ? 1 : 0));

  const blocking = weeks.find((e) => !(e.decision && e.decision.publish === true)) || null;
  return { publish: !blocking, blocking, weeks };
}
