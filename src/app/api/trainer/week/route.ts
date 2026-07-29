// The week-shaped publish boundary — SPEC-guardrails.md §9.4.
//
// The ONE door every coach training write passes through. Deliberately thin: the
// contract lives in week-publish.mjs, the judgement in the core, the decision in
// guardrail-gate.mjs, and atomicity in publish_client_week. What is here is
// authentication, scope, and orchestration.
//
// POST { clientIds[] | clientId, weekStartISO, idempotencyKey, capture,
//        sessions[], acknowledgment?, adjustMode? }
//   -> { ok, results: [{ clientId, status, state, displayState, copy, ... }] }
//
// ⚠ ONE CALL, PER-CLIENT EVALUATION. §9.4 quotes clientIds[] in one call; a
// single evaluation across N clients is not expressible, because the verdict is
// a function of ONE client's history — N clients means N verdicts, N possible
// acknowledgments, and no coherent answer when A is red and B is green. So the
// fan-out is internal: one evaluation, one atomic write, one telemetry row and
// one idempotency record PER CLIENT. "Written atomically" holds at the
// client-week, which is the only unit that can be atomic.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { unauthorizedAssignTargets } from '@/lib/access-guards.mjs';
import { normalizeWeekRequest, weekRequestHash, toProposedWeek, toWorkoutRows } from '@/lib/week-publish.mjs';
import { bsGateDecision, bsExcludedSessionRate, bsTelemetryProps } from '@/lib/guardrail-gate.mjs';
import { bsProgressionGuardrail, bsGuardrailCopy } from '../../../../../public/newdesign/progressionGuardrail.mjs';
import { auditSink } from '@/lib/ai/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PublishResult = Record<string, unknown> & { clientId: string; status: string };

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const parsed = await readJson<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;

  // `todayISO` is an INPUT to every pure module below. The clock is read exactly
  // once, here, at the I/O boundary — nowhere downstream.
  const todayISO = new Date().toISOString().slice(0, 10);
  const norm = normalizeWeekRequest(parsed.data, { todayISO });
  if (!norm.ok) {
    return NextResponse.json(
      { error: 'That week could not be read.', reason: norm.error, detail: norm.detail },
      { status: 400 },
    );
  }
  const { clientIds, week } = norm;

  // Trainer row + on-client scope — the same gate as the session-shaped route
  // this replaces. RLS enforces it again at the DB; this is for a clean error.
  const { data: trainerRow } = await supabase.from('trainers').select('id').eq('owner_id', user.id).maybeSingle();
  if (!trainerRow) return NextResponse.json({ error: 'Not a trainer.' }, { status: 403 });

  const { data: subs, error: subsError } = await supabase
    .from('subscriptions').select('client_id')
    .eq('provider_id', trainerRow.id)
    .eq('provider_role', 'trainer')
    .in('status', ['active', 'trialing']);
  if (subsError) {
    return NextResponse.json({ error: 'Could not verify client assignment scope. Please retry.' }, { status: 500 });
  }

  const activeIds = (subs ?? []).map((s) => String((s as { client_id: unknown }).client_id));
  if (unauthorizedAssignTargets(clientIds, activeIds).length) {
    return NextResponse.json({ error: 'You can only assign workouts to your own active clients.' }, { status: 403 });
  }

  const proposedWeek = toProposedWeek(week);
  const rows = toWorkoutRows(week);
  const audit = auditSink(supabase);
  const results: PublishResult[] = [];

  for (const clientId of clientIds) {
    const hash = weekRequestHash(clientId, week);

    // History AND the kill switch ride on ONE call (§7.4: the flag rides on the
    // load-history response, so the builder and the route cannot disagree — a
    // coach is never shown a red the server will not enforce, or an amber the
    // server will block).
    const { data: history, error: histErr } = await supabase.rpc('get_client_load_history', { p_user_id: clientId });
    if (histErr) {
      console.error('[shape-api] guardrail load history:', histErr.message);
      results.push({ clientId, status: 'error', error: 'Could not read this client\'s history.' });
      continue;
    }

    const sessions = (history?.sessions ?? []) as unknown[];
    // NULL is reported honestly by the RPC and the CALLER applies §7.4's
    // fails-enforced rule — bsGateDecision owns that decision, not this line.
    const redEnabled = (history?.redEnabled ?? null) as boolean | null;

    const result = bsProgressionGuardrail({ todayISO, sessions }, proposedWeek);
    const decision = bsGateDecision({ result, redEnabled, acknowledgment: week.acknowledgment });

    // ⚠ THE COPY IS RENDERED AT THE STATE THE COACH SEES. Under an advisory
    // switch a red is shown as amber, and passing displayState is what makes the
    // wording follow: verified against progressionGuardrail.mjs — redPath is
    // only ever consulted inside a `state === 'red'` branch, so overriding state
    // alone drops the compound-red phrasing and flips the chip. The core is NOT
    // edited to accommodate this.
    const copy = bsGuardrailCopy({ ...result, state: decision.displayState });

    if (!decision.publish) {
      // A rejection is NEVER absorbed, and it carries the reason a coach can act
      // on. No telemetry row: nothing was published, and §10.2's denominator is
      // publishes.
      results.push({
        clientId,
        status: 'rejected',
        state: decision.displayState,
        trueState: decision.trueState,
        reason: result.reason,
        redPath: result.redPath,
        requiresAck: true,
        copy,
      });
      continue;
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

    const { data: pub, error: pubErr } = await supabase.rpc('publish_client_week', {
      p_idempotency_key: week.idempotencyKey,
      p_client_id: clientId,
      p_week_start: week.weekStartISO,
      p_request_hash: hash,
      p_outcome: outcome,
      p_rows: rows,
    });
    if (pubErr) {
      // 23505 = the same key with DIFFERENT content. A caller bug, not a replay,
      // and it must never be served the first week's outcome.
      const conflict = (pubErr as { code?: string }).code === '23505';
      console.error('[shape-api] week publish:', pubErr.message);
      results.push({
        clientId,
        status: conflict ? 'key_reused' : 'error',
        error: conflict
          ? 'That publish key was already used for a different week.'
          : 'Could not publish the week. Please retry.',
      });
      continue;
    }

    if (pub?.status === 'already_delivered') {
      // (3) A replay reports honestly — no second set of rows, no second
      // telemetry row, no second audit entry, no second notification.
      results.push({ clientId, status: 'already_delivered', ...(pub.outcome as Record<string, unknown>) });
      continue;
    }

    // §10.1 — ai_audit_log is authoritative for anything coach-facing or legal.
    // Written ONLY for a genuine acknowledged override, never for a suppressed
    // red, where there is nothing to acknowledge.
    if (decision.writeAck) {
      try {
        await audit.log({
          actorUserId: user.id,
          source: 'engine',
          action: 'guardrail_red_ack',
          actorRole: 'trainer',
          target: { userId: clientId, kind: 'training_week', id: week.weekStartISO },
          suggestion: result,
          confirmedPayload: { acknowledged: true, ...week.acknowledgment },
          beforeState: { weekStartISO: week.weekStartISO, replaced: pub?.replaced ?? null },
          afterState: { weekStartISO: week.weekStartISO, sessions: rows.length },
        });
      } catch (e) {
        // The week IS written. An audit failure is loud but not a rollback — and
        // the response says so rather than reporting a clean, audited publish.
        console.error('[shape-api] guardrail_red_ack write failed:', e);
        outcome.audited = false;
      }
    }

    // ONE telemetry row per publish, regardless of session count (§9.4). Never
    // from a builder — per-keystroke evaluations would destroy the flag-rate
    // denominators (§10.2).
    try {
      await supabase.rpc('track_event', {
        p_event: 'guardrail_evaluated',
        p_props: bsTelemetryProps({
          result,
          decision,
          excludedSessionRate: bsExcludedSessionRate(sessions),
          adjustMode: week.adjustMode,
        }),
      });
    } catch (e) {
      console.error('[shape-api] guardrail_evaluated write failed:', e);
    }

    results.push({
      clientId,
      status: 'accepted',
      inserted: pub?.inserted ?? 0,
      replaced: pub?.replaced ?? 0,
      ...outcome,
    });
  }

  // Worst outcome wins the status line, so a single-client caller (every mobile
  // publish, and Nora) reads it directly.
  const errored = results.some((r) => r.status === 'error' || r.status === 'key_reused');
  const rejected = results.some((r) => r.status === 'rejected');
  const status = errored ? 500 : rejected ? 409 : 200;

  return NextResponse.json({ ok: !errored && !rejected, results }, { status });
}
