// Evaluate and publish ONE client-week — the shared server half of the boundary.
//
// SPEC-guardrails.md §9.4 makes this the only place a coach training write can
// land, so it must be the only place this sequence exists. It was written inside
// `/api/trainer/week`; the session-shaped route needs the identical sequence
// after widening its one session into a week, and a second copy of a guardrail
// decision is how two doors start disagreeing about the same client's load.
//
// Everything policy-shaped stays in the pure modules it already lives in
// (`week-publish.mjs`, `guardrail-gate.mjs`, the core). What is here is the
// order of operations: read history, judge, gate, write atomically, record.

import { weekRequestHash, toProposedWeek, toWorkoutRows } from '@/lib/week-publish.mjs';
import type { PublishWeek } from '@/lib/week-publish.mjs';
import { bsGateDecision, bsExcludedSessionRate, bsTelemetryProps } from '@/lib/guardrail-gate.mjs';
import { bsProgressionGuardrail, bsGuardrailCopy } from '../../public/newdesign/progressionGuardrail.mjs';

// Structural shape of the bits of a Supabase client used here. `rpc()` returns
// a PostgrestFilterBuilder, which is thenable but NOT a Promise — typing it as
// one rejects the real client, so the contract is PromiseLike.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Rpc = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: any; error: any }> };

export type PublishResult = Record<string, unknown> & { clientId: string; status: string };

export type PublishWeekArgs = {
  /** The CALLER's RLS-scoped client — history read and telemetry. */
  supabase: Rpc;
  /** Service-role client — the publish RPC only (see the migration's §2 note). */
  admin: Rpc;
  coachUserId: string;
  clientId: string;
  /**
   * A normalized week from `normalizeWeekRequest` — the contract's OWN type,
   * imported rather than mirrored. A hand-copied shape here would drift from
   * the normalizer and quietly widen `capture` (an enum §3.2a branches on) or
   * the session shape the core reads.
   */
  week: PublishWeek;
  todayISO: string;
  /**
   * The ids of the coach's own published rows in this client-week AT THE MOMENT
   * THE CALLER READ THEM — the optimistic-concurrency precondition.
   *
   * ⚠ REQUIRED BY ANY CALLER THAT READ-MERGES. The boundary REPLACES a week, so
   * a caller that reads the week, folds a session in, and publishes the result
   * has a lost-update race with another caller doing the same: both read the
   * same week, both publish a different merge, and the later replace deletes the
   * earlier one's session. Declaring what was read lets the RPC refuse a week
   * that moved, and the caller re-reads, RE-EVALUATES and retries.
   *
   * `null`/absent = no precondition, which is the whole-week route's contract:
   * an explicitly authored week replaces by design and read nothing to merge.
   */
  expectedRowIds?: readonly string[] | null;
};

export async function publishWeekForClient(args: PublishWeekArgs): Promise<PublishResult> {
  const { supabase, admin, coachUserId, clientId, week, todayISO, expectedRowIds } = args;
  const hash = weekRequestHash(clientId, week);

  // History AND the kill switch ride on ONE call (§7.4: the flag rides on the
  // load-history response, so the builder and the route cannot disagree — a
  // coach is never shown a red the server will not enforce, or an amber the
  // server will block).
  // ⚠ The argument name is `p_client_id`, matching the migration's declared
  // parameter. PostgREST resolves RPC arguments BY NAME, so a wrong name is not
  // a wrong value — the function simply does not resolve, every publish falls
  // into the error branch below, and no week can ever be written.
  // tests/guardrail-rpc-args.test.mjs pins this against the migration.
  const { data: historyRaw, error: histErr } = await supabase.rpc('get_client_load_history', { p_client_id: clientId });
  if (histErr) {
    console.error('[shape-api] guardrail load history:', (histErr as { message?: string }).message);
    return { clientId, status: 'error', error: "Could not read this client's history." };
  }
  const history = (historyRaw ?? {}) as { sessions?: unknown[]; redEnabled?: boolean | null };

  const sessions = (history.sessions ?? []) as unknown[];
  // NULL is reported honestly by the RPC and the CALLER applies §7.4's
  // fails-enforced rule — bsGateDecision owns that decision, not this line.
  const redEnabled = (history.redEnabled ?? null) as boolean | null;

  const result = bsProgressionGuardrail({ todayISO, sessions }, toProposedWeek(week));
  const decision = bsGateDecision({ result, redEnabled, acknowledgment: week.acknowledgment });

  // ⚠ THE COPY IS RENDERED AT THE STATE THE COACH SEES. Under an advisory switch
  // a red is shown as amber, and passing displayState is what makes the wording
  // follow: verified against progressionGuardrail.mjs — redPath is only ever
  // consulted inside a `state === 'red'` branch, so overriding state alone drops
  // the compound-red phrasing and flips the chip. The core is NOT edited to
  // accommodate this.
  const copy = bsGuardrailCopy({ ...result, state: decision.displayState });

  if (!decision.publish) {
    // A rejection is NEVER absorbed, and it carries the reason a coach can act
    // on. No telemetry row: nothing was published, and §10.2's denominator is
    // publishes.
    return {
      clientId,
      status: 'rejected',
      state: decision.displayState,
      trueState: decision.trueState,
      reason: result.reason,
      redPath: result.redPath,
      requiresAck: true,
      copy,
    };
  }

  const outcome: Record<string, unknown> = {
    state: decision.displayState,
    trueState: decision.trueState,
    reason: result.reason,
    redPath: result.redPath,
    redSuppressed: decision.redSuppressed,
    overridden: decision.overridden,
    copy,
  };

  // §10.1 — the acknowledgment rides INSIDE the publish transaction, so an
  // overridden red can never be written without the record of who overrode it.
  // Sent only for a genuine acknowledged override; a suppressed red has nothing
  // to acknowledge, so `writeAck` is false and no ack row is written.
  const ack = decision.writeAck
    ? { suggestion: result, acknowledgment: week.acknowledgment ?? {} }
    : null;

  const { data: pubRaw, error: pubErr } = await admin.rpc('publish_client_week', {
    p_coach_user_id: coachUserId,
    p_idempotency_key: week.idempotencyKey,
    p_client_id: clientId,
    p_week_start: week.weekStartISO,
    p_request_hash: hash,
    p_outcome: outcome,
    p_rows: toWorkoutRows(week),
    p_ack: ack,
    p_expected_row_ids: expectedRowIds ?? null,
  });
  if (pubErr) {
    // 40001 = the week moved between the caller's read and this publish. Nothing
    // is wrong with the request and NOTHING WAS WRITTEN — the RPC raises before
    // it claims the key, so the whole transaction rolled back. Reported as its
    // own status rather than an error so the caller can re-read, re-merge and
    // RE-EVALUATE. It never reaches telemetry: no week was published, and §10.2's
    // denominator is publishes.
    if ((pubErr as { code?: string }).code === '40001') {
      return { clientId, status: 'week_changed' };
    }
    // 23505 = the same key with DIFFERENT content. A caller bug, not a replay,
    // and it must never be served the first week's outcome.
    const conflict = (pubErr as { code?: string }).code === '23505';
    console.error('[shape-api] week publish:', (pubErr as { message?: string }).message);
    return {
      clientId,
      status: conflict ? 'key_reused' : 'error',
      error: conflict
        ? 'That publish key was already used for a different week.'
        : 'Could not publish the week. Please retry.',
    };
  }
  const pub = (pubRaw ?? {}) as { status?: string; outcome?: unknown; inserted?: number; replaced?: number; audited?: boolean };

  if (pub.status === 'already_delivered') {
    // A replay reports honestly — no second set of rows, no second telemetry
    // row, no second audit entry, no second notification.
    return { clientId, status: 'already_delivered', ...(pub.outcome as Record<string, unknown>) };
  }

  // The ack was written inside the transaction above, so there is no "published
  // but unaudited" state to report — an ack that could not be written took the
  // whole publish down with it. `audited` is echoed for the caller rather than
  // asserted here.
  if (decision.writeAck) outcome.audited = pub.audited === true;

  // ONE telemetry row per publish, regardless of session count (§9.4). Never
  // from a builder — per-keystroke evaluations would destroy the flag-rate
  // denominators (§10.2).
  //
  // ⚠ A DENIED OR MISSING `track_event` RESOLVES, IT DOES NOT REJECT. PostgREST
  // errors arrive as `{ error }` on a resolved promise, so the catch below never
  // fires for the most likely failure (grant revoked, function absent, event not
  // whitelisted) and the row would disappear without even the intended log —
  // silently corrupting the flag-rate data §10.2 needs to retune and enable
  // enforcement. The resolved error is therefore inspected explicitly.
  try {
    const { error: trackErr } = await supabase.rpc('track_event', {
      p_event: 'guardrail_evaluated',
      p_props: bsTelemetryProps({
        result,
        decision,
        excludedSessionRate: bsExcludedSessionRate(sessions),
        adjustMode: week.adjustMode,
      }),
    });
    if (trackErr) console.error('[shape-api] guardrail_evaluated write failed:', trackErr.message);
  } catch (e) {
    console.error('[shape-api] guardrail_evaluated threw:', e);
  }

  return {
    clientId,
    status: 'accepted',
    inserted: pub.inserted ?? 0,
    replaced: pub.replaced ?? 0,
    ...outcome,
  };
}
