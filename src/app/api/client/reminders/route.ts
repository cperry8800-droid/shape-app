// User-set reminders CRUD — a member's own standalone nudges (weigh-in, check-in,
// water, progress photo, custom). The hourly /api/cron/reminders evaluator fires
// them into the notifications table. Owner-scoped (RLS).
//
// GET    -> { reminders: [...] }
// POST   { id?, kind, label?, atTime, days[], tz?, enabled? }  -> upsert
// DELETE ?id=<uuid>
// Auth: cookie session OR Bearer token.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS = ['weigh_in', 'checkin', 'water', 'photo', 'custom'];
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);
  const { data, error } = await supabase
    .from('user_scheduled_reminders')
    .select('id, kind, label, at_time, days, tz, enabled')
    .eq('user_id', user.id)
    .order('at_time', { ascending: true });
  if (error) {
    console.error('[shape] reminders list failed:', error.message);
    return NextResponse.json({ reminders: [] });
  }
  return NextResponse.json({ reminders: data ?? [] });
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const parsed = await readJson<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const kind = String(body.kind ?? 'custom').toLowerCase();
  if (!KINDS.includes(kind)) return NextResponse.json({ error: 'Invalid reminder kind.' }, { status: 400 });
  const atTime = String(body.atTime ?? '');
  if (!HHMM.test(atTime)) return NextResponse.json({ error: 'Time must be HH:MM (24h).' }, { status: 400 });

  const days = Array.isArray(body.days)
    ? Array.from(new Set((body.days as unknown[]).map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))).sort()
    : [0, 1, 2, 3, 4, 5, 6];
  if (!days.length) return NextResponse.json({ error: 'Pick at least one day.' }, { status: 400 });

  const row: Record<string, unknown> = {
    user_id: user.id,
    kind,
    label: String(body.label ?? '').slice(0, 80),
    at_time: atTime,
    days,
    tz: String(body.tz ?? 'UTC').slice(0, 60),
    enabled: body.enabled === undefined ? true : !!body.enabled,
    updated_at: new Date().toISOString(),
  };
  if (body.id !== undefined && UUID.test(String(body.id))) row.id = String(body.id);

  const supabase = await clientForRequest(request);
  const { data, error } = await supabase
    .from('user_scheduled_reminders')
    .upsert(row, { onConflict: 'id' })
    .select('id, kind, label, at_time, days, tz, enabled')
    .single();
  if (error) {
    console.error('[shape] reminder upsert failed:', error.message);
    return NextResponse.json({ error: 'Could not save the reminder.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, reminder: data });
}

export async function DELETE(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!UUID.test(id)) return NextResponse.json({ error: 'Invalid reminder id.' }, { status: 400 });
  const supabase = await clientForRequest(request);
  // RLS scopes the delete to the owner; the explicit user_id filter is belt-and-braces.
  const { error } = await supabase.from('user_scheduled_reminders').delete().eq('id', id).eq('user_id', user.id);
  if (error) {
    console.error('[shape] reminder delete failed:', error.message);
    return NextResponse.json({ error: 'Could not delete the reminder.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
