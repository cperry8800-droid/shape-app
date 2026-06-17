// Pure authorization / validity predicates shared by API routes and unit tests.
// Kept dependency-free (plain ESM) so node:test can import the exact same logic
// the routes run.

// A coaching session may only be rescheduled while it is still active/upcoming.
// Once it is completed (or declined/cancelled) it must NOT be draggable AND the
// reschedule action must reject it server-side — otherwise a stale UI or a
// crafted request could rewrite a past booking's time and fire a bogus
// "Session moved" notification.
export const RESCHEDULABLE_SESSION_STATUSES = ['requested', 'confirmed'];

export function isSessionReschedulable(status) {
  return RESCHEDULABLE_SESSION_STATUSES.includes(String(status || '').toLowerCase());
}

// Per-client coach goals are coach-set, client-viewed. Only an active coach on
// the client may write them — a client must never be able to create a goal (and
// never a setBy:'coach' goal) on their own record, since those feed the coach
// triage feed. The route confirms `is_coach_on_client` server-side rather than
// relying on the client-self RLS policy; this captures that decision for tests.
export function canWriteClientGoals(isCoachOnClient) {
  return isCoachOnClient === true;
}

// A pro may assign a workout / meal plan ONLY to a client they actively coach in
// their own discipline. The route resolves which client ids the caller actively
// coaches (active/trialing subscription for their provider row) and compares
// against the requested ids. This is the server-side gate (mirrored by the
// 2026-06-17 INSERT RLS policies) — not a UI affordance. Returns the requested
// ids that are NOT in the active set (the rejected ones); empty ⇒ fully allowed.
export function unauthorizedAssignTargets(requestedClientIds, activeClientIds) {
  const active = new Set((activeClientIds || []).map((x) => String(x)));
  const requested = [...new Set((requestedClientIds || []).map((x) => String(x)).filter(Boolean))];
  return requested.filter((id) => !active.has(id));
}

// True only when every requested client is one the caller actively coaches (and
// at least one client was requested).
export function canAssignToClients(requestedClientIds, activeClientIds) {
  const requested = (requestedClientIds || []).map((x) => String(x)).filter(Boolean);
  if (requested.length === 0) return false;
  return unauthorizedAssignTargets(requested, activeClientIds).length === 0;
}
