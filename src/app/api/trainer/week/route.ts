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
import { createAdminClient } from '@/lib/supabase/admin';
import { readJson } from '@/lib/request-utils';
import { unauthorizedAssignTargets } from '@/lib/access-guards.mjs';
import { normalizeWeekRequest } from '@/lib/week-publish.mjs';
import { publishMergedWeekForClient, type PublishResult } from '@/lib/week-publish-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  //
  // ⚠ RESOLVED THE WAY THE RPC RESOLVES IT: per CLIENT, through the subscription
  // that grants access — never `limit 1` over the coach's owned rows. Nothing
  // constrains `trainers.owner_id` to one row per owner (verified: only the `id`
  // primary key and a partial unique on `stripe_account_id`), and
  // `publish_client_week` picks the trainer row carrying THAT client's
  // subscription. The precondition set is READ with the id chosen here and
  // VERIFIED against the id chosen there, so a divergence would not fail
  // loudly — it would raise 40001, burn every retry, and tell the coach the week
  // kept changing when nothing had touched it. One resolution, per client, is
  // the only version that cannot drift. The old `.maybeSingle()` also DISCARDED
  // its error, and it errors on more than one row — so a second trainer row read
  // as "Not a trainer."
  const { data: trainerRows, error: trainerErr } = await supabase
    .from('trainers').select('id').eq('owner_id', user.id);
  if (trainerErr) {
    return NextResponse.json({ error: 'Could not verify your coach account. Please retry.' }, { status: 500 });
  }
  const trainerIds = (trainerRows ?? []).map((r) => (r as { id: unknown }).id);
  if (!trainerIds.length) return NextResponse.json({ error: 'Not a trainer.' }, { status: 403 });

  const { data: subs, error: subsError } = await supabase
    .from('subscriptions').select('client_id, provider_id')
    .in('provider_id', trainerIds)
    .eq('provider_role', 'trainer')
    .in('status', ['active', 'trialing']);
  if (subsError) {
    return NextResponse.json({ error: 'Could not verify client assignment scope. Please retry.' }, { status: 500 });
  }

  // client → the trainer row that carries that client's subscription.
  const trainerIdByClient = new Map<string, unknown>();
  for (const s of (subs ?? []) as Array<{ client_id: unknown; provider_id: unknown }>) {
    const cid = String(s.client_id);
    if (!trainerIdByClient.has(cid)) trainerIdByClient.set(cid, s.provider_id);
  }

  const activeIds = [...trainerIdByClient.keys()];
  if (unauthorizedAssignTargets(clientIds, activeIds).length) {
    return NextResponse.json({ error: 'You can only assign workouts to your own active clients.' }, { status: 403 });
  }

  // publish_client_week is service-role only and takes the coach as an argument
  // (see the migration's §2 note). Every read above ran on the CALLER's client
  // under RLS; the admin client reaches exactly one call, and the RPC
  // re-verifies `user.id` against an active trainer subscription to the client.
  const admin = createAdminClient();
  const results: PublishResult[] = [];

  // ⚠ THE WEEK IS MERGED INTO, NOT STAMPED OVER.
  //
  // This route publishes a PROGRAM: the mobile coach Assign page sends the
  // sessions that program puts in each week, never the client's whole week. The
  // RPC replaces the week, so publishing that payload directly deleted every
  // other session the coach had scheduled there — a coach adding a Saturday
  // conditioning day, then assigning a 3-day program, lost the Saturday with no
  // error and no warning. It also handed the guardrail a week missing that load,
  // so the verdict came out wrong in the PERMISSIVE direction.
  //
  // The same read-merge the session-shaped route uses now runs here, from the
  // one shared implementation — including the concurrency precondition, so two
  // assignments into one client-week cannot silently overwrite each other.
  for (const clientId of clientIds) {
    results.push(await publishMergedWeekForClient({
      supabase,
      admin,
      coachUserId: user.id,
      trainerId: trainerIdByClient.get(clientId),
      clientId,
      weekStartISO: week.weekStartISO,
      incoming: week.sessions,
      todayISO,
      // The key is minted at AUTHORING time and carried in the payload, so it
      // survives the device going offline and the app being killed. It is stable
      // across retries by construction: a rejected attempt raises BEFORE the RPC
      // claims the key, so nothing is recorded and the next attempt claims it
      // cleanly with the re-merged content.
      mintKey: () => week.idempotencyKey,
      acknowledgment: week.acknowledgment,
      adjustMode: week.adjustMode,
    }));
  }

  // Worst outcome wins the status line, so a single-client caller (every mobile
  // publish, and Nora) reads it directly.
  const errored = results.some((r) => r.status === 'error' || r.status === 'key_reused');
  const rejected = results.some((r) => r.status === 'rejected');
  const status = errored ? 500 : rejected ? 409 : 200;

  return NextResponse.json({ ok: !errored && !rejected, results }, { status });
}
