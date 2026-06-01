// Shared calendar for the website (newdesign CalendarOverlay) + mobile app
// (BSCalendarScreen). Both front-ends read/write here so they stay in sync.
//
// GET  ?from=YYYY-MM-DD&to=YYYY-MM-DD[&clientId=<uuid>]
//      -> { events: [...] } merging:
//         * calendar_events rows (planned workouts/meals/check-ins/etc.)
//         * the sessions table (coaching bookings) as read-only events
//      RLS scopes both: a coach may pass ?clientId to view a client's calendar.
//
// POST   { userId?, kind, title, sub?, date, time?, durationMin?, with?,
//          location?, accent?, metadata? }  -> create (userId defaults to self;
//          a coach may target an active client). Returns { event }.
// PATCH  { id, ...fields } -> update. Returns { event }.
// DELETE { id }            -> remove.
//
// Auth: cookie session OR Bearer token (mobile bridges either).

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clean(v: unknown, max: number): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}
function isDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}
const KINDS = ['WORKOUT', 'MEAL', 'CHECKIN', 'SESSION', 'CONSULT', 'REVIEW', 'PLAN', 'ADMIN', 'REST'];

type EventRow = {
  id: string; user_id: string; created_by: string | null; created_by_role: string;
  kind: string; title: string; sub: string | null; event_date: string;
  event_time: string | null; duration_min: number | null; with_name: string | null;
  location: string | null; accent: string | null; status: string;
};

function shape(r: EventRow) {
  return {
    id: r.id,
    source: 'event' as const,
    kind: r.kind,
    title: r.title,
    sub: r.sub ?? '',
    date: r.event_date,
    time: r.event_time,
    durationMin: r.duration_min,
    with: r.with_name ?? '',
    location: r.location ?? '',
    accent: r.accent ?? '',
    status: r.status,
    createdByRole: r.created_by_role,
    editable: true,
  };
}

// ── GET ──────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const url = new URL(request.url);
  const from = clean(url.searchParams.get('from'), 10);
  const to = clean(url.searchParams.get('to'), 10);
  const clientId = clean(url.searchParams.get('clientId'), 64);
  const targetUserId = clientId || user.id;

  // Wide default window if not provided: ±60 days around today.
  const today = new Date();
  const dFrom = isDate(from) ? from : new Date(today.getTime() - 60 * 86400000).toISOString().slice(0, 10);
  const dTo = isDate(to) ? to : new Date(today.getTime() + 60 * 86400000).toISOString().slice(0, 10);

  // 1) calendar_events (RLS allows owner + active coach).
  const { data: evRows } = await supabase
    .from('calendar_events')
    .select('id, user_id, created_by, created_by_role, kind, title, sub, event_date, event_time, duration_min, with_name, location, accent, status')
    .eq('user_id', targetUserId)
    .gte('event_date', dFrom)
    .lte('event_date', dTo)
    .order('event_date', { ascending: true });

  const events = ((evRows ?? []) as EventRow[]).map(shape);

  // 2) sessions (coaching bookings) merged read-only.
  const fromIso = `${dFrom}T00:00:00Z`;
  const toIso = `${dTo}T23:59:59Z`;
  const { data: sessRows } = await supabase
    .from('sessions')
    .select('id, client_id, provider_role, type, scheduled_at, duration_min, status, topic, meeting_url')
    .gte('scheduled_at', fromIso)
    .lte('scheduled_at', toIso)
    .in('status', ['requested', 'confirmed', 'completed'])
    .order('scheduled_at', { ascending: true });

  const sessions = (sessRows ?? []).map((s: {
    id: string; provider_role: string; type: string; scheduled_at: string;
    duration_min: number | null; status: string; topic: string | null; meeting_url: string | null;
  }) => {
    const dt = new Date(s.scheduled_at);
    const date = dt.toISOString().slice(0, 10);
    const time = `${String(dt.getUTCHours()).padStart(2, '0')}:${String(dt.getUTCMinutes()).padStart(2, '0')}`;
    return {
      id: `session:${s.id}`,
      source: 'session' as const,
      kind: s.provider_role === 'nutritionist' ? 'CONSULT' : 'SESSION',
      title: s.topic || (s.provider_role === 'nutritionist' ? 'Nutrition consult' : 'Coaching session'),
      sub: s.type,
      date,
      time,
      durationMin: s.duration_min,
      with: '',
      location: '',
      accent: '',
      status: s.status,
      meetingUrl: s.meeting_url,
      createdByRole: 'coach',
      editable: false, // managed via /api/sessions/manage, not here
    };
  });

  return NextResponse.json({ events: [...events, ...sessions] });
}

// ── POST ─────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const title = clean((body as Record<string, unknown>).title, 200);
  const date = clean((body as Record<string, unknown>).date, 10);
  if (!title) return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
  if (!isDate(date)) return NextResponse.json({ error: 'A valid date (YYYY-MM-DD) is required.' }, { status: 400 });

  const kindRaw = clean((body as Record<string, unknown>).kind, 20).toUpperCase();
  const kind = KINDS.includes(kindRaw) ? kindRaw : 'ADMIN';
  const targetUserId = clean((body as Record<string, unknown>).userId, 64) || user.id;

  // created_by_role: 'self' if it's my own calendar, else the coach role.
  let createdByRole: 'self' | 'trainer' | 'nutritionist' = 'self';
  if (targetUserId !== user.id) {
    const [{ data: tr }, { data: nu }] = await Promise.all([
      supabase.from('trainers').select('id').eq('owner_id', user.id).maybeSingle(),
      supabase.from('nutritionists').select('id').eq('owner_id', user.id).maybeSingle(),
    ]);
    createdByRole = tr ? 'trainer' : nu ? 'nutritionist' : 'self';
  }

  const timeRaw = clean((body as Record<string, unknown>).time, 5);
  const durationMin = Number((body as Record<string, unknown>).durationMin);
  const insert = {
    user_id: targetUserId,
    created_by: user.id,
    created_by_role: createdByRole,
    kind,
    title,
    sub: clean((body as Record<string, unknown>).sub, 300) || null,
    event_date: date,
    event_time: /^\d{1,2}:\d{2}$/.test(timeRaw) ? timeRaw : null,
    duration_min: Number.isFinite(durationMin) && durationMin > 0 ? Math.round(durationMin) : null,
    with_name: clean((body as Record<string, unknown>).with, 120) || null,
    location: clean((body as Record<string, unknown>).location, 160) || null,
    accent: clean((body as Record<string, unknown>).accent, 24) || null,
  };

  const { data, error } = await supabase
    .from('calendar_events')
    .insert(insert)
    .select('id, user_id, created_by, created_by_role, kind, title, sub, event_date, event_time, duration_min, with_name, location, accent, status')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: shape(data as EventRow) });
}

// ── PATCH ────────────────────────────────────────────────────────────────────
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const id = clean((body as Record<string, unknown>).id, 64);
  if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 });

  const b = body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (typeof b.title === 'string') patch.title = clean(b.title, 200);
  if (typeof b.sub === 'string') patch.sub = clean(b.sub, 300) || null;
  if (typeof b.date === 'string' && isDate(b.date)) patch.event_date = b.date;
  if (typeof b.time === 'string') patch.event_time = /^\d{1,2}:\d{2}$/.test(b.time) ? b.time : null;
  if (typeof b.kind === 'string' && KINDS.includes(b.kind.toUpperCase())) patch.kind = b.kind.toUpperCase();
  if (typeof b.with === 'string') patch.with_name = clean(b.with, 120) || null;
  if (typeof b.location === 'string') patch.location = clean(b.location, 160) || null;
  if (typeof b.status === 'string' && ['planned', 'done', 'skipped', 'cancelled'].includes(b.status)) patch.status = b.status;
  if (b.durationMin != null) {
    const n = Number(b.durationMin);
    patch.duration_min = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }

  const { data, error } = await supabase
    .from('calendar_events')
    .update(patch)
    .eq('id', id)
    .select('id, user_id, created_by, created_by_role, kind, title, sub, event_date, event_time, duration_min, with_name, location, accent, status')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found or not allowed.' }, { status: 404 });
  return NextResponse.json({ event: shape(data as EventRow) });
}

// ── DELETE ───────────────────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const id = clean((body as Record<string, unknown>).id, 64);
  if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 });

  const { error } = await supabase.from('calendar_events').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
