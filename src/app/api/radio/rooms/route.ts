import { NextResponse } from 'next/server';
import { type SupabaseClient } from '@supabase/supabase-js';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { cleanText, readJson, dbError } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RadioRoomRow = {
  id: string;
  created_at: string;
  updated_at: string;
  host_user_id: string | null;
  host_role: string;
  host_name: string;
  topic: string;
  description: string | null;
  scheduled_at: string;
  audience: string;
  status: string;
  room_url: string | null;
  metadata: Record<string, unknown>;
};

function normalizeRole(input: unknown): 'trainer' | 'nutritionist' | 'client' | 'admin' {
  const value = String(input ?? '').toLowerCase();
  if (value === 'nutritionist' || value === 'client' || value === 'admin') return value;
  return 'trainer';
}

function normalizeAudience(input: unknown): 'clients_coaches' | 'clients_only' | 'coaches_only' | 'public_shape' {
  const value = String(input ?? '').toLowerCase().replace(/[\s+]+/g, '_');
  if (value === 'clients_only') return 'clients_only';
  if (value === 'coaches_only') return 'coaches_only';
  if (value === 'public_shape' || value === 'public_shape_members') return 'public_shape';
  return 'clients_coaches';
}

function roomToApi(room: RadioRoomRow) {
  const scheduled = new Date(room.scheduled_at);
  const date = Number.isNaN(scheduled.getTime()) ? '' : scheduled.toISOString().slice(0, 10);
  const time = Number.isNaN(scheduled.getTime()) ? '' : scheduled.toISOString().slice(11, 16);

  return {
    id: room.id,
    role: room.host_role,
    host: room.host_name,
    topic: room.topic,
    description: room.description ?? '',
    scheduledAt: room.scheduled_at,
    date,
    time,
    audience: room.audience,
    status: room.status,
    roomUrl: room.room_url ?? 'Radio.html',
    createdAt: room.created_at,
    updatedAt: room.updated_at,
    metadata: room.metadata ?? {},
  };
}

async function profileForUser(client: SupabaseClient, userId: string) {
  const { data } = await client
    .from('profiles')
    .select('full_name, role')
    .eq('id', userId)
    .maybeSingle();
  return data as { full_name?: string | null; role?: string | null } | null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const role = url.searchParams.get('role');
  const normalizedRole = role ? normalizeRole(role) : null;
  const client = await clientForRequest(request);
  const minDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  let query = client
    .from('radio_rooms')
    .select('*')
    .in('status', ['scheduled', 'live'])
    .gte('scheduled_at', minDate)
    .order('scheduled_at', { ascending: true })
    .limit(24);

  if (normalizedRole) {
    query = query.eq('host_role', normalizedRole);
  }

  const { data, error } = await query;
  if (error) return dbError(error, 'radio room write', 400);
  const rows = (data ?? []) as RadioRoomRow[];
  return NextResponse.json({ rooms: rows.map(roomToApi) });
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in before scheduling a radio room.' }, { status: 401 });

  const client = await clientForRequest(request);
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const payload = body as {
    role?: unknown;
    topic?: unknown;
    description?: unknown;
    scheduledAt?: unknown;
    date?: unknown;
    time?: unknown;
    audience?: unknown;
  } | null;

  const topic = cleanText(payload?.topic, 140);
  if (!topic) return NextResponse.json({ error: 'Room topic is required.' }, { status: 400 });

  const scheduledRaw =
    typeof payload?.scheduledAt === 'string' && payload.scheduledAt
      ? payload.scheduledAt
      : `${cleanText(payload?.date, 20)}T${cleanText(payload?.time, 10) || '19:00'}`;
  const scheduledAt = new Date(scheduledRaw);
  if (Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: 'Valid date and time are required.' }, { status: 400 });
  }

  const profile = await profileForUser(client, user.id);
  const hostName = profile?.full_name || user.email?.split('@')[0] || 'Shape coach';
  const hostRole = normalizeRole(payload?.role ?? profile?.role);

  const { data, error } = await client
    .from('radio_rooms')
    .insert({
      host_user_id: user.id,
      host_role: hostRole,
      host_name: hostName,
      topic,
      description: cleanText(payload?.description, 2000) || null,
      scheduled_at: scheduledAt.toISOString(),
      audience: normalizeAudience(payload?.audience),
      status: 'scheduled',
      room_url: 'Radio.html',
      metadata: { source: 'newdesign' },
    })
    .select()
    .single();

  if (error) return dbError(error, 'radio room write', 400);
  return NextResponse.json({ room: roomToApi(data as RadioRoomRow) });
}
