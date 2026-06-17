// Trainer workout assignment — persist a built workout to client_workouts,
// one row per selected client, with an optional scheduled_date so it lands on
// a specific day in the client's weekly plan.
//
// POST { clientIds:[uuid], title, description?, kind?, scheduledDate?, payload }
//   -> { ok, count }
//
// Auth: cookie session OR Bearer token. RLS also enforces trainer ownership;
// this route resolves the caller's trainer row up front for a clean error.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson, dbError } from '@/lib/request-utils';
import { unauthorizedAssignTargets } from '@/lib/access-guards.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const clientIds = Array.isArray(body.clientIds) ? body.clientIds.map(String).filter(Boolean) : [];
  const title = String(body.title ?? '').trim().slice(0, 200);
  const description = body.description ? String(body.description).slice(0, 2000) : null;
  const kind = body.kind === 'custom' ? 'custom' : 'template';
  const scheduledDate = body.scheduledDate ? String(body.scheduledDate) : null;
  const payload = (body.payload && typeof body.payload === 'object') ? body.payload : {};

  if (!clientIds.length) return NextResponse.json({ error: 'Pick at least one client.' }, { status: 400 });
  if (!title) return NextResponse.json({ error: 'Workout title is required.' }, { status: 400 });

  // Resolve the caller's trainer row.
  const { data: trainerRow } = await supabase
    .from('trainers')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (!trainerRow) return NextResponse.json({ error: 'Not a trainer.' }, { status: 403 });

  // On-client + discipline gate: a trainer may assign only to clients they
  // actively coach AS A TRAINER. We read the caller's active/trialing
  // subscriptions for THIS trainer row (RLS lets a provider read their own) and
  // reject if any requested client isn't among them. (The 2026-06-17 INSERT RLS
  // policy enforces the same rule at the DB for the direct-Supabase path.)
  const { data: subs, error: subsError } = await supabase
    .from('subscriptions')
    .select('client_id')
    .eq('provider_id', trainerRow.id)
    .eq('provider_role', 'trainer')
    .in('status', ['active', 'trialing']);
  if (subsError) return NextResponse.json({ error: 'Could not verify client assignment scope. Please retry.' }, { status: 500 });
  const activeClientIds = (subs ?? []).map((s) => String((s as { client_id: unknown }).client_id));
  const rejected = unauthorizedAssignTargets(clientIds, activeClientIds);
  if (rejected.length) {
    return NextResponse.json(
      { error: 'You can only assign workouts to your own active clients.' },
      { status: 403 },
    );
  }

  const rows = clientIds.map((clientId: string) => ({
    trainer_id: trainerRow.id,
    client_id: clientId,
    title,
    description,
    kind,
    payload,
    scheduled_date: scheduledDate,
    status: 'published',
  }));

  const { data: inserted, error } = await supabase
    .from('client_workouts')
    .insert(rows)
    .select('id');

  if (error) return dbError(error, 'trainer workout write', 500);
  return NextResponse.json({ ok: true, count: inserted?.length ?? 0 });
}
