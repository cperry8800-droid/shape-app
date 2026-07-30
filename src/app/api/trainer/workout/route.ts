// Trainer workout assignment — session-shaped in, WEEK-shaped out.
//
// SPEC-guardrails.md §9.4 makes the week the unit, but three callers still speak
// a single session: both web builders (`dashBuilder.jsx`'s program loop and
// `newWorkout.jsx`'s one-off) and Nora's `assign_workout`. Rather than rewrite
// three surfaces at once and leave an ungated route live in between, the route
// itself moved onto the boundary. It reads the coach's existing week, folds the
// incoming session in, and publishes the whole week through the same
// evaluate-and-publish path as `/api/trainer/week`.
//
// ⚠ WHY THE MERGE IS NOT OPTIONAL. The boundary REPLACES a client-week. Handing
// it the one incoming session would delete every other session the coach had
// scheduled that week — silent data loss on the most ordinary action in the
// product. It would also hand the guardrail a week missing most of its load, so
// the verdict would be wrong in the permissive direction.
//
// POST { clientIds:[uuid], title, description?, kind?, scheduledDate, payload }
//   -> { ok, results: [...] }  — the week boundary's own result shape, so a
//      guardrail rejection reaches these callers with its reason intact.

import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { readJson } from '@/lib/request-utils';
import { unauthorizedAssignTargets } from '@/lib/access-guards.mjs';
import { BS_WEEK_SESSION_MAX } from '@/lib/week-publish.mjs';
import { bsWeekStartOf } from '@/lib/week-merge.mjs';
import { publishMergedWeekForClient, type PublishResult } from '@/lib/week-publish-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A deterministic, UUID-shaped publish key for a week's resolved content. */
function keyFor(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex');
  const variant = '89ab'[parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** `YYYY-MM-DD` + n days. */
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const clientIds = Array.isArray(body.clientIds) ? body.clientIds.map(String).filter(Boolean) : [];
  if (!clientIds.length) return NextResponse.json({ error: 'Pick at least one client.' }, { status: 400 });

  // ⚠ ONE SESSION OR A WHOLE WEEK. The array form exists so a program assignment
  // can send every session of a week in ONE call. Sending them one at a time is
  // CORRECT (each call re-merges and accumulates) but it publishes the same week
  // once per session — a 12-week × 3-day program does ~36 publishes and ~36
  // telemetry rows, which skews §10.2's flag-rate denominators by counting one
  // authoring act as 36. The single-session shape is kept because newWorkout.jsx
  // and Nora's assign_workout both speak it; both shapes take the same
  // merge-and-publish path below, so there is one gate, not two.
  const rawSessions = Array.isArray(body.sessions)
    ? body.sessions
    : [{ title: body.title, description: body.description, kind: body.kind, scheduledDate: body.scheduledDate, payload: body.payload }];

  if (!rawSessions.length) return NextResponse.json({ error: 'Nothing to assign.' }, { status: 400 });
  if (rawSessions.length > BS_WEEK_SESSION_MAX) {
    return NextResponse.json({ error: 'That is more sessions than one week can hold.', reason: 'too_many_sessions' }, { status: 400 });
  }

  const incoming: Array<{ title: string; description: string; kind: string; scheduledDate: string; payload: Record<string, unknown> }> = [];
  for (const raw of rawSessions) {
    const s = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw as Record<string, unknown> : {};
    const title = String(s.title ?? '').trim().slice(0, 200);
    if (!title) return NextResponse.json({ error: 'Workout title is required.' }, { status: 400 });
    incoming.push({
      title,
      description: s.description ? String(s.description).slice(0, 2000) : '',
      kind: s.kind === 'custom' ? 'custom' : 'template',
      scheduledDate: s.scheduledDate ? String(s.scheduledDate).slice(0, 10) : '',
      payload: (s.payload && typeof s.payload === 'object' && !Array.isArray(s.payload)) ? s.payload as Record<string, unknown> : {},
    });
  }

  // ⚠ A DATE IS NOW REQUIRED, and this is a deliberate behaviour change. An
  // undated row has no week, so there is no load for the guardrail to judge and
  // no week to publish it into — it is the one shape that cannot pass through
  // the boundary at all. Leaving it ungated would keep exactly the hole §9.4
  // exists to close, so it is refused, by name, rather than waved through.
  const weekStarts = incoming.map((s) => bsWeekStartOf(s.scheduledDate));
  if (weekStarts.some((w) => !w)) {
    return NextResponse.json(
      { error: 'Give the workout a date — a session has to land in a week to be assigned.', reason: 'date_required' },
      { status: 400 },
    );
  }
  // Every session must fall in the SAME week: this route publishes exactly one
  // client-week per call, and the boundary REPLACES that week. Sessions from two
  // weeks in one call would publish only the first and silently drop the rest —
  // so the caller groups by week and sends one call per week.
  const weekStartISO = weekStarts[0] as string;
  if (weekStarts.some((w) => w !== weekStartISO)) {
    return NextResponse.json(
      { error: 'Those sessions span more than one week — assign a week at a time.', reason: 'multi_week' },
      { status: 400 },
    );
  }

  // The clock is read exactly once, here at the I/O boundary.
  const todayISO = new Date().toISOString().slice(0, 10);

  // ⚠ Resolved per CLIENT through the subscription, exactly as
  // `publish_client_week` resolves it — see the note in `trainer/week/route.ts`.
  // The precondition set is read with the id chosen here and verified against
  // the id chosen in the RPC; a divergence raises 40001 and reads as contention.
  const { data: trainerRows, error: trainerErr } = await supabase
    .from('trainers').select('id').eq('owner_id', user.id);
  if (trainerErr) {
    return NextResponse.json({ error: 'Could not verify your coach account. Please retry.' }, { status: 500 });
  }
  const trainerIds = (trainerRows ?? []).map((r) => (r as { id: unknown }).id);
  if (!trainerIds.length) return NextResponse.json({ error: 'Not a trainer.' }, { status: 403 });

  // On-client + discipline gate: a trainer may assign only to clients they
  // actively coach AS A TRAINER. RLS enforces the same rule at the DB; this is
  // for a clean error rather than a policy denial.
  const { data: subs, error: subsError } = await supabase
    .from('subscriptions').select('client_id, provider_id')
    .in('provider_id', trainerIds)
    .eq('provider_role', 'trainer')
    .in('status', ['active', 'trialing']);
  if (subsError) {
    return NextResponse.json({ error: 'Could not verify client assignment scope. Please retry.' }, { status: 500 });
  }
  const trainerIdByClient = new Map<string, unknown>();
  for (const s of (subs ?? []) as Array<{ client_id: unknown; provider_id: unknown }>) {
    const cid = String(s.client_id);
    if (!trainerIdByClient.has(cid)) trainerIdByClient.set(cid, s.provider_id);
  }
  const activeIds = [...trainerIdByClient.keys()];
  if (unauthorizedAssignTargets(clientIds, activeIds).length) {
    return NextResponse.json({ error: 'You can only assign workouts to your own active clients.' }, { status: 403 });
  }

  const admin = createAdminClient();
  const results: PublishResult[] = [];
  const weekEndISO = addDays(weekStartISO, 6);

  // ⚠ NEVER HAND THE BOUNDARY ONLY THE INCOMING SESSIONS. It REPLACES a
  // client-week, so publishing just the assignment would delete every other
  // session the coach had scheduled that week. The read-merge, the concurrency
  // precondition and the retry all live in ONE place (week-publish-server.ts)
  // because both surfaces made that mistake independently.
  for (const clientId of clientIds) {
    results.push(await publishMergedWeekForClient({
      supabase,
      admin,
      coachUserId: user.id,
      trainerId: trainerIdByClient.get(clientId),
      clientId,
      weekStartISO,
      incoming,
      todayISO,
      // Content-derived, so a retry of the same assignment REPLAYS rather than
      // publishing twice: the first call merges [] + A into [A]; the retry merges
      // the now-stored [A] + A back into [A] (same day, same title replaces), so
      // both hash the same. Adding a genuinely different session changes the
      // content and correctly mints a new key.
      mintKey: (sessions) => keyFor([
        user.id, clientId, weekStartISO, JSON.stringify(sessions),
      ].join('\u0000')),
    }));
  }

  const errored = results.some((r) => r.status === 'error' || r.status === 'key_reused');
  const rejectedResults = results.filter((r) => r.status === 'rejected');
  const status = errored ? 500 : rejectedResults.length ? 409 : 200;

  // `count` is kept for the existing callers, which read it to say "assigned to
  // N clients". It counts clients whose week landed, not rows written.
  const count = results.filter((r) => r.status === 'accepted' || r.status === 'already_delivered').length;

  // ⚠ A REJECTION MUST ARRIVE AS WORDS, not as a status code. These callers
  // predate the guardrail and all of them surface `error` on a non-2xx, so the
  // reason is put there — otherwise a coach whose week was held reads a bare
  // failure and has nothing to act on, which is the one outcome §8 exists to
  // prevent. The full per-client detail still rides in `results`.
  const firstCopy = rejectedResults.length
    ? (rejectedResults[0].copy as { line?: string; detail?: string } | null)
    : null;
  const error = errored
    ? 'Could not assign the workout. Please retry.'
    : firstCopy
      ? [firstCopy.line, firstCopy.detail].filter(Boolean).join(' ')
      : rejectedResults.length ? 'That week was held for review.' : undefined;

  return NextResponse.json(
    { ok: !errored && !rejectedResults.length, count, results, ...(error ? { error } : {}) },
    { status },
  );
}
