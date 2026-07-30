// Adjust regeneration through the guardrail — SPEC-guardrails.md §9.4.
//
// The third and last coach training writer. `regenerate_client_workouts` was
// the one path still reaching `client_workouts` ungated: the mobile Adjust page
// read the coach's rows, planned the transform client-side, and called the RPC
// directly. §9.4 gates it because a regeneration changes week COMPOSITION — it
// caps training weekdays, deletes rows outside the new map, and replicates the
// last adjusted week to the horizon, any of which can move a week across a
// regime boundary without a human looking at the result.
//
// ⚠ THIS DOES NOT LOOP WEEK-PUBLISHES, and that is deliberate. The RPC's single
// transaction is a real safety property — "never both plans, never zero" — and N
// week-publishes would forfeit it, leaving a client stranded between two
// programs when the third call fails. The shape is instead:
//
//     plan → evaluate EVERY affected week → all pass (or acknowledged)? → ONE atomic write
//
// ⚠ THE PLAN IS BUILT SERVER-SIDE, from rows read under the caller's own RLS.
// Accepting a client-supplied `inserts` array would hand any signed-in coach a
// way to post arbitrary rows and have the guardrail bless them — the planner is
// the only thing that guarantees a regenerated week is a transform of content
// the coach actually authored.
//
// POST { clientId, adjustment: {intensity, sessions, weeks, days}, acknowledgment? }
//   -> { ok, changed, gen?, capped?, audited?, weeks: [...], blocking?: {...} }

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { readJson } from '@/lib/request-utils';
import { toProposedWeek, BS_ADJUST_MODES } from '@/lib/week-publish.mjs';
import { bsGateDecision, bsExcludedSessionRate, bsTelemetryProps } from '@/lib/guardrail-gate.mjs';
import { bsAdjustProposedWeeks, bsAdjustOutcome } from '@/lib/adjust-publish.mjs';
import { bsAdjustRegen } from '../../../../../mobile-app/src/services/adjustRegen.mjs';
import { bsProgressionGuardrail, bsGuardrailCopy } from '../../../../../public/newdesign/progressionGuardrail.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const parsed = await readJson<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const clientId = String(body.clientId == null ? '' : body.clientId).trim();
  if (!UUID.test(clientId)) {
    return NextResponse.json({ error: 'That client could not be read.' }, { status: 400 });
  }
  const adjustment = body.adjustment && typeof body.adjustment === 'object' && !Array.isArray(body.adjustment)
    ? (body.adjustment as Record<string, unknown>)
    : null;
  if (!adjustment) {
    return NextResponse.json({ error: 'That adjustment could not be read.' }, { status: 400 });
  }

  // `todayISO` is an INPUT to every pure module below. The clock is read exactly
  // once, here, at the I/O boundary — nowhere downstream. UTC matches the RPC's
  // own `current_date` basis for the strictly-future validation.
  const todayISO = new Date().toISOString().slice(0, 10);

  // Trainer row + on-client scope. RLS enforces it again at the DB and the RPC
  // re-checks `is_discipline_coach_on_client` in-body; this is for a clean error.
  const { data: trainerRow } = await supabase.from('trainers').select('id').eq('owner_id', user.id).maybeSingle();
  if (!trainerRow) return NextResponse.json({ error: 'Not a trainer.' }, { status: 403 });

  const { data: subs, error: subsError } = await supabase
    .from('subscriptions').select('client_id')
    .eq('provider_id', (trainerRow as { id: unknown }).id)
    .eq('provider_role', 'trainer')
    .in('status', ['active', 'trialing']);
  if (subsError) {
    return NextResponse.json({ error: 'Could not verify client assignment scope. Please retry.' }, { status: 500 });
  }
  const activeIds = new Set((subs ?? []).map((s) => String((s as { client_id: unknown }).client_id)));
  if (!activeIds.has(clientId)) {
    return NextResponse.json({ error: 'You can only adjust your own active clients.' }, { status: 403 });
  }

  // The generation stamp the regenerated rows carry (row-scoped, so the display
  // path can tell a regenerated row from one assigned afterwards).
  let gen = 1;
  try {
    const { data } = await supabase.from('client_programs').select('detail').eq('user_id', clientId).maybeSingle();
    gen = (Number((data as any)?.detail?.training?.gen) || 0) + 1;
  } catch { /* first generation */ }

  // RLS scopes this to the caller's OWN authored rows for this client.
  //
  // ⚠ THE CAP MUST ONLY EVER TRIM THE FAR TAIL. An unordered `.limit(400)` gets
  // an ARBITRARY 400 rows — Postgres guarantees no order without ORDER BY — so a
  // client with a long history could have their CURRENT and upcoming weeks
  // truncated away, and the regeneration would then rewrite and delete against a
  // partial view of the plan. 400 rows is reachable: three saved 26-week programs
  // at 5 days each is 390. This is the same defect the self-plans RPC shipped and
  // fixed by windowing to relevance.
  //
  // The window is the PLANNER'S OWN SCOPE, not a new rule: `bsAdjustRegen`
  // operates on the strict future (`scheduled_date > todayISO`) plus undated
  // weekly-repeat sources, and `bsAdjustProposedWeeks` excludes past rows too. So
  // reading exactly that set removes nothing either module would have looked at.
  // Undated repeats sort FIRST (they are never trimmed), then the nearest dated
  // sessions — so the cap can only drop the far end of a long program.
  const { data: rows, error: readErr } = await supabase
    .from('client_workouts')
    .select('id, title, description, kind, payload, playlist_id, scheduled_date')
    .eq('client_id', clientId)
    .not('trainer_id', 'is', null)
    .eq('status', 'published')
    .or(`scheduled_date.is.null,scheduled_date.gt.${todayISO}`)
    .order('scheduled_date', { ascending: true, nullsFirst: true })
    .limit(400);
  if (readErr) {
    return NextResponse.json({ error: "Could not read this client's plan. Please retry." }, { status: 500 });
  }

  const plan = bsAdjustRegen({ rows: rows || [], adjustment, todayISO, gen });
  if (!plan.changed) {
    // Nothing material changed — applying the same adjustment twice re-derives
    // identical loads from `baseL`, so this is the idempotent no-op by
    // construction. No write, no evaluation, no telemetry row.
    return NextResponse.json({ ok: true, changed: false, gen: gen - 1 }, { status: 200 });
  }

  const weeks = bsAdjustProposedWeeks({ rows: rows || [], plan, todayISO });

  // History AND the kill switch ride on ONE call, fetched ONCE for the whole
  // regeneration — §7.4 puts the flag on the load-history response so the
  // builder and the server cannot disagree. Re-reading per week would also let
  // the flag change mid-decision.
  const { data: historyRaw, error: histErr } = await supabase.rpc('get_client_load_history', { p_client_id: clientId });
  if (histErr) {
    console.error('[shape-api] adjust load history:', (histErr as { message?: string }).message);
    return NextResponse.json({ error: "Could not read this client's history." }, { status: 500 });
  }
  const history = (historyRaw ?? {}) as { sessions?: unknown[]; redEnabled?: boolean | null };
  const sessions = (history.sessions ?? []) as unknown[];
  const redEnabled = (history.redEnabled ?? null) as boolean | null;

  const acknowledgment = body.acknowledgment && typeof body.acknowledgment === 'object' && !Array.isArray(body.acknowledgment)
    ? {
        reasonCode: String((body.acknowledgment as any).reasonCode ?? '').trim().slice(0, 64) || null,
        reasonText: String((body.acknowledgment as any).reasonText ?? '').trim().slice(0, 1000) || null,
      }
    : null;

  const adjustMode = BS_ADJUST_MODES.includes(adjustment.intensity as string)
    ? (adjustment.intensity as string)
    : null;

  // Every affected week is judged as a FRESH proposal against the client's
  // history — never a delta (§9.4). An already-oversized week reissued through
  // Adjust is examined, not waved through.
  const evaluations = weeks.map((w) => {
    const proposed = toProposedWeek({
      weekStartISO: w.weekStartISO,
      capture: w.capture,
      sessions: w.sessions.map((s: any, i: number) => ({ ...s, id: `s${i}` })),
    } as any);
    const result = bsProgressionGuardrail({ todayISO, sessions }, proposed);
    const decision = bsGateDecision({ result, redEnabled, acknowledgment });
    return {
      weekStartISO: w.weekStartISO,
      decision,
      result,
      // The copy is rendered AT THE STATE THE COACH SEES — under an advisory
      // switch a red is shown as amber, and passing displayState is what makes
      // the wording follow.
      copy: bsGuardrailCopy({ ...result, state: decision.displayState }),
    };
  });

  const outcome = bsAdjustOutcome(evaluations);

  if (!outcome.publish) {
    // A rejection is NEVER absorbed and carries the reason the coach can act on.
    // No telemetry: nothing was written, and §10.2's denominator is publishes.
    const b: any = outcome.blocking;
    return NextResponse.json({
      ok: false,
      changed: false,
      blocking: {
        weekStartISO: b.weekStartISO,
        state: b.decision.displayState,
        trueState: b.decision.trueState,
        reason: b.result?.reason ?? null,
        redPath: b.result?.redPath ?? null,
        requiresAck: true,
        copy: b.copy,
      },
      weeks: evaluations.map((e) => ({ weekStartISO: e.weekStartISO, state: e.decision.displayState })),
    }, { status: 409 });
  }

  // ONE acknowledgment row for ONE act of acknowledgment, carried INTO the
  // transaction (§10.1). It names the week the interstitial actually showed the
  // coach — the earliest that required it — while `weeks` records the full scope
  // the override let through.
  const acked = evaluations.find((e) => e.decision.writeAck);
  const ack = acked
    ? {
        weekStartISO: acked.weekStartISO,
        suggestion: acked.result,
        acknowledgment: acknowledgment ?? {},
        weeks: evaluations.map((e) => e.weekStartISO),
        adjustMode,
      }
    : null;

  // The ONE atomic write. `regenerate_client_workouts` is SERVICE-ROLE ONLY and
  // takes the coach as an explicit argument (see the migration's note): the
  // grant was the whole gate, because SECURITY DEFINER bypasses RLS and a
  // signed-in trainer calling the RPC directly would skip this entire
  // evaluation. Every read above ran on the CALLER's client under RLS; the
  // admin client reaches exactly one call, and the RPC re-verifies `user.id`
  // against an active trainer subscription to this client.
  const admin = createAdminClient();
  const { data: applied, error: rpcErr } = await admin.rpc('regenerate_client_workouts', {
    p_coach_user_id: user.id,
    p_client_id: clientId,
    p_delete_ids: plan.deleteIds,
    p_inserts: plan.inserts,
    p_repeat_patches: plan.repeatPatches,
    p_ack: ack,
  });
  if (rpcErr) {
    const code = (rpcErr as { code?: string }).code;
    // Pre-migration: the 5-argument signature is not deployed yet (or PostgREST's
    // schema cache has not reloaded after the DDL). Reported honestly so the
    // caller degrades rather than claiming a regeneration that did not happen.
    if (code === 'PGRST202' || code === '42883') {
      return NextResponse.json({ ok: false, changed: false, degraded: true }, { status: 503 });
    }
    console.error('[shape-api] adjust regenerate:', (rpcErr as { message?: string }).message);
    return NextResponse.json({ error: 'Could not apply the adjustment. Please retry.' }, { status: 500 });
  }

  // ONE telemetry row PER WEEK EVALUATED. §10.2's denominator is weeks the
  // guardrail judged, and the retune's question — do regenerated weeks flag
  // differently from authored ones — needs the green weeks in it too, or the
  // flag rate is computed against a denominator that omits its own successes.
  const excludedSessionRate = bsExcludedSessionRate(sessions);
  for (const e of evaluations) {
    // ⚠ A DENIED OR MISSING `track_event` RESOLVES, IT DOES NOT REJECT.
    // PostgREST errors come back as `{ error }` on a resolved promise, so a
    // bare try/catch here would never fire and the row would vanish in silence
    // — corrupting exactly the flag-rate data §10.2 needs to retune and enable
    // enforcement. The resolved error is inspected explicitly.
    try {
      const { error: trackErr } = await supabase.rpc('track_event', {
        p_event: 'guardrail_evaluated',
        p_props: bsTelemetryProps({ result: e.result, decision: e.decision, excludedSessionRate, adjustMode }),
      });
      if (trackErr) {
        console.error('[shape-api] guardrail_evaluated write failed:', trackErr.message);
      }
    } catch (err) {
      console.error('[shape-api] guardrail_evaluated threw:', err);
    }
  }

  return NextResponse.json({
    ok: true,
    changed: true,
    gen,
    capped: !!plan.capped,
    audited: (applied as any)?.audited === true,
    applied: applied ?? null,
    weeks: evaluations.map((e) => ({
      weekStartISO: e.weekStartISO,
      state: e.decision.displayState,
      trueState: e.decision.trueState,
      redSuppressed: e.decision.redSuppressed,
      overridden: e.decision.overridden,
      copy: e.copy,
    })),
  }, { status: 200 });
}
