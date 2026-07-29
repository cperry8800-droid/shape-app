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
import { normalizeWeekRequest } from '@/lib/week-publish.mjs';
import { bsMergeWeekSessions, bsWeekStartOf } from '@/lib/week-merge.mjs';
import { publishWeekForClient, type PublishResult } from '@/lib/week-publish-server';

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
  const title = String(body.title ?? '').trim().slice(0, 200);
  const description = body.description ? String(body.description).slice(0, 2000) : '';
  const kind = body.kind === 'custom' ? 'custom' : 'template';
  const scheduledDate = body.scheduledDate ? String(body.scheduledDate).slice(0, 10) : '';
  const payload = (body.payload && typeof body.payload === 'object') ? body.payload as Record<string, unknown> : {};

  if (!clientIds.length) return NextResponse.json({ error: 'Pick at least one client.' }, { status: 400 });
  if (!title) return NextResponse.json({ error: 'Workout title is required.' }, { status: 400 });

  // ⚠ A DATE IS NOW REQUIRED, and this is a deliberate behaviour change. An
  // undated row has no week, so there is no load for the guardrail to judge and
  // no week to publish it into — it is the one shape that cannot pass through
  // the boundary at all. Leaving it ungated would keep exactly the hole §9.4
  // exists to close, so it is refused, by name, rather than waved through.
  const weekStartISO = bsWeekStartOf(scheduledDate);
  if (!weekStartISO) {
    return NextResponse.json(
      { error: 'Give the workout a date — a session has to land in a week to be assigned.', reason: 'date_required' },
      { status: 400 },
    );
  }

  // The clock is read exactly once, here at the I/O boundary.
  const todayISO = new Date().toISOString().slice(0, 10);

  const { data: trainerRow } = await supabase.from('trainers').select('id').eq('owner_id', user.id).maybeSingle();
  if (!trainerRow) return NextResponse.json({ error: 'Not a trainer.' }, { status: 403 });

  // On-client + discipline gate: a trainer may assign only to clients they
  // actively coach AS A TRAINER. RLS enforces the same rule at the DB; this is
  // for a clean error rather than a policy denial.
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

  const admin = createAdminClient();
  const results: PublishResult[] = [];
  const weekEndISO = addDays(weekStartISO, 6);

  for (const clientId of clientIds) {
    // The coach's OWN rows for this client-week. Scoped to the caller's trainer
    // row because the boundary only ever replaces the coach's own work — another
    // provider's rows are not ours to carry or to clear.
    const { data: existing, error: readErr } = await supabase
      .from('client_workouts')
      .select('title, description, kind, scheduled_date, payload')
      .eq('trainer_id', trainerRow.id)
      .eq('client_id', clientId)
      .eq('status', 'published')
      .gte('scheduled_date', weekStartISO)
      .lte('scheduled_date', weekEndISO);
    if (readErr) {
      // Publishing without knowing the rest of the week would DELETE it. A read
      // failure therefore has to stop this client, not fall through.
      console.error('[shape-api] existing week read:', readErr.message);
      results.push({ clientId, status: 'error', error: 'Could not read this client\'s week. Please retry.' });
      continue;
    }

    const merged = bsMergeWeekSessions(
      existing ?? [],
      [{ title, description, kind, scheduledDate, payload }],
      { weekStartISO, todayISO },
    );

    // Content-derived, so a retry of the same assignment REPLAYS rather than
    // publishing twice: the first call merges [] + A into [A]; the retry merges
    // the now-stored [A] + A back into [A] (same day, same title replaces), so
    // both hash the same. Adding a genuinely different session changes the
    // content and correctly mints a new key.
    const idempotencyKey = keyFor([
      user.id, clientId, weekStartISO, JSON.stringify(merged.sessions),
    ].join('\u0000'));

    const norm = normalizeWeekRequest(
      { clientId, weekStartISO, idempotencyKey, capture: merged.capture, sessions: merged.sessions },
      { todayISO },
    );
    if (!norm.ok) {
      results.push({ clientId, status: 'error', error: 'That week could not be read.', reason: norm.error, detail: norm.detail });
      continue;
    }

    const out = await publishWeekForClient({
      supabase, admin, coachUserId: user.id, clientId, week: norm.week, todayISO,
    });
    // Report what the merge carried, so a caller can tell "your one session" from
    // "your session plus the four already there" without guessing.
    results.push({ ...out, carried: merged.carried, skippedPast: merged.skippedPast });
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
