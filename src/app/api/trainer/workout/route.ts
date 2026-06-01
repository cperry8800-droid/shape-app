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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: inserted?.length ?? 0 });
}
