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

import { weekRequestHash, toProposedWeek, toWorkoutRows, normalizeWeekRequest } from '@/lib/week-publish.mjs';
import type { PublishWeek } from '@/lib/week-publish.mjs';
import { bsMergeWeekSessions } from '@/lib/week-merge.mjs';
import { bsGateDecision, bsExcludedSessionRate, bsTelemetryProps } from '@/lib/guardrail-gate.mjs';
import { bsProgressionGuardrail, bsGuardrailCopy } from '../../public/newdesign/progressionGuardrail.mjs';
import { callRpc } from '@/lib/supabase/call-rpc.mjs';

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
  // ⚠ A NULL HASH WOULD DEFEAT THE LEDGER'S REUSE CHECK. The RPC compares
  // `v_existing.request_hash <> p_request_hash`, and in SQL that yields NULL —
  // not true — when either side is NULL, so the `raise` is skipped and the FIRST
  // request's outcome is served for a DIFFERENT body. The stored side is
  // `not null` by schema (2026-07-29-guardrail-week-publish.sql:28) and this is
  // the RPC's only caller, so the hole is unreachable today; this assertion is
  // what keeps it that way. Raised by review (CodeRabbit); the SQL-side
  // hardening (`is distinct from` plus the argument guard) needs a migration
  // against a live function and is registered rather than folded in here.
  if (typeof hash !== 'string' || !hash) {
    throw new Error('publishWeekForClient: refusing to publish without a request hash.');
  }

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
    const code = (pubErr as { code?: string }).code;
    if (code === '40001') {
      return { clientId, status: 'week_changed' };
    }
    // 23505 = the same key with DIFFERENT content. A caller bug, not a replay,
    // and it must never be served the first week's outcome.
    const conflict = code === '23505';
    // 42501 = the RPC refused on identity: either this coach does not train this
    // client, or the key belongs to ANOTHER coach. Retrying cannot change either,
    // so it must not carry retry copy — the route's ledger pre-check deliberately
    // leaves this refusal to the RPC, and telling the coach to retry would send
    // them round a loop that can only fail the same way.
    const denied = code === '42501';
    console.error('[shape-api] week publish:', (pubErr as { message?: string }).message);
    return {
      clientId,
      status: conflict ? 'key_reused' : 'error',
      error: conflict
        ? 'That publish key was already used for a different week.'
        : denied
          ? 'That week could not be published under your coach account.'
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
  // errors arrive as `{ error }` on a resolved promise, so a bare try/catch never
  // fires for the most likely failure (grant revoked, function absent, event not
  // whitelisted) and the row would disappear without even the intended log —
  // silently corrupting the flag-rate data §10.2 needs to retune and enable
  // enforcement. `callRpc` inspects the resolved error explicitly (and reports it
  // to Sentry, tagged with the RPC name) instead of trusting a catch block that
  // this exact failure never reaches.
  try {
    const { error: trackErr } = await callRpc(supabase, 'track_event', {
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

/** `YYYY-MM-DD` + n days, calendar arithmetic only. */
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The bits of a Supabase client used for the existing-week read. */
type Db = { from: (table: string) => any };

export type MergePublishArgs = {
  /** The CALLER's RLS-scoped client — the week read, history and telemetry. */
  supabase: Rpc & Db;
  /** Service-role client — the publish RPC only. */
  admin: Rpc;
  coachUserId: string;
  /** The caller's own trainer row. The merge only ever carries THIS coach's work. */
  trainerId: unknown;
  clientId: string;
  weekStartISO: string;
  /** Publish-shaped sessions the caller wants added to the week. */
  incoming: readonly unknown[];
  todayISO: string;
  /**
   * The request's idempotency key. Called PER ATTEMPT with that attempt's merged
   * sessions, so a caller can either return its own authoring-time key unchanged
   * or derive one from the resolved content — the two routes want different
   * things and neither should be guessed at here.
   */
  mintKey: (mergedSessions: unknown[]) => string;
  acknowledgment?: unknown;
  adjustMode?: unknown;
};

/**
 * Read the client-week, fold `incoming` into it, and publish the whole thing —
 * retrying from the read if the week moves underneath.
 *
 * ⚠ WHY EVERY CALLER MUST COME THROUGH HERE. The boundary REPLACES a client-week
 * (§9.4), so handing it only the sessions being assigned DELETES every other
 * session the coach had scheduled that week — silent data loss on the most
 * ordinary action in the product. It also hands the guardrail a week missing
 * most of its load, so the verdict comes out wrong in the PERMISSIVE direction.
 * Both surfaces made that mistake independently; this function exists so there
 * is one merge, one precondition and one retry policy rather than two that
 * drift.
 *
 * The retry is not a nicety. Two assignments into one client-week both read the
 * same week and both publish a different merge; the later replace deletes the
 * earlier one's session, and no authz, key or ledger check can see it. The RPC's
 * precondition rejects the stale write, and the loop restarts FROM THE READ so
 * the guardrail is re-evaluated against the week actually about to be written.
 */
export async function publishMergedWeekForClient(args: MergePublishArgs): Promise<PublishResult> {
  const {
    supabase, admin, coachUserId, trainerId, clientId,
    weekStartISO, incoming, todayISO, mintKey, acknowledgment, adjustMode,
  } = args;
  const weekEndISO = addDays(weekStartISO, 6);
  const MAX_ATTEMPTS = 3;

  // ⚠ AN ABSENT TRAINER ROW MUST NEVER REACH THE READ. `.eq('trainer_id',
  // undefined)` does not scope to nothing — PostgREST drops the filter, and the
  // merge would then carry (and the replace would then clear) ANOTHER provider's
  // rows. Both callers resolve this per client from the subscription and cannot
  // hand over a miss while their scope gate holds; this is the floor that makes a
  // future reorder fail loudly instead of silently widening the read.
  if (trainerId == null) {
    console.error('[shape-api] merged publish called with no trainer row for client', clientId);
    return { clientId, status: 'error', error: 'Could not resolve your coach account. Please retry.' };
  }

  let merged: ReturnType<typeof bsMergeWeekSessions> | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    // The coach's OWN rows for this client-week. Scoped to the caller's trainer
    // row because the boundary only ever replaces the coach's own work — another
    // provider's rows are not ours to carry or to clear.
    const { data: existing, error: readErr } = await supabase
      .from('client_workouts')
      .select('id, title, description, kind, scheduled_date, payload')
      .eq('trainer_id', trainerId)
      .eq('client_id', clientId)
      .eq('status', 'published')
      .gte('scheduled_date', weekStartISO)
      .lte('scheduled_date', weekEndISO);
    if (readErr) {
      // Publishing without knowing the rest of the week would DELETE it. A read
      // failure has to stop this client, never fall through to a publish.
      console.error('[shape-api] existing week read:', (readErr as { message?: string }).message);
      return { clientId, status: 'error', error: "Could not read this client's week. Please retry." };
    }

    const rows = (existing ?? []) as Array<Record<string, unknown>>;
    // The precondition covers the WHOLE week the read returned, not just the
    // rows the merge keeps — the RPC compares against the same unfiltered set,
    // so a past-dated row the merge drops still counts as part of "the week I
    // read". Filtering either side would put the two on different clocks.
    const expectedRowIds = rows.map((r) => String(r.id));
    // Copied because the merge's declared signature takes a mutable array; the
    // argument stays readonly here so a caller's own list can never be mutated.
    merged = bsMergeWeekSessions(rows, [...incoming], { weekStartISO, todayISO });

    const norm = normalizeWeekRequest(
      {
        clientId,
        weekStartISO,
        idempotencyKey: mintKey(merged.sessions),
        // ⚠ THE MERGE OWNS THE CAPTURE STAMP, not the caller. A carried session
        // with no captured pair makes the whole week honestly `incomplete_week`;
        // letting a caller's "per_session" claim ride over the merged week would
        // declare a hole-free week that has a hole — F158, the malformed case
        // that switches the guardrail off.
        capture: merged.capture,
        sessions: merged.sessions,
        ...(acknowledgment ? { acknowledgment } : {}),
        ...(adjustMode ? { adjustMode } : {}),
      },
      { todayISO },
    );
    if (!norm.ok) {
      return { clientId, status: 'error', error: 'That week could not be read.', reason: norm.error, detail: norm.detail };
    }

    const out = await publishWeekForClient({
      supabase, admin, coachUserId, clientId, week: norm.week, todayISO, expectedRowIds,
    });
    if (out.status !== 'week_changed') {
      // Report what the merge carried, so a caller can tell "your one session"
      // from "your session plus the four already there" without guessing.
      return { ...out, carried: merged.carried, skippedPast: merged.skippedPast };
    }
    // The week moved under us. Re-read, re-merge, re-evaluate.
  }

  // Every attempt lost the race. Reported honestly rather than retried forever —
  // nothing was written, and the coach can simply tap again.
  return {
    clientId,
    status: 'error',
    error: 'That week kept changing while we saved it. Please retry.',
    reason: 'week_contended',
    ...(merged ? { carried: merged.carried, skippedPast: merged.skippedPast } : {}),
  };
}
