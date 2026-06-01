// Session management for coaches + clients.
//
// GET  -> the signed-in user's sessions (as client OR as the owning coach),
//         soonest first, with provider/client display fields. RLS already
//         scopes rows to the caller; we just shape them.
// POST { sessionId, action } where action is:
//   confirm  (coach) -> status='confirmed'; for a video session, mint the
//                       in-app Jitsi room URL and store it in meeting_url.
//   decline  (coach) -> status='declined'
//   complete (coach) -> status='completed'
//   cancel   (client or coach) -> status='cancelled'
//
// Auth: cookie session OR Bearer token (the mobile app bridges either).

import { NextResponse } from 'next/server';
import { type SupabaseClient } from '@supabase/supabase-js';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { videoRoomUrl } from '@/lib/video';
import { createNotification } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SessionRow = {
  id: string;
  client_id: string | null;
  client_name: string | null;
  provider_id: number;
  provider_role: string;
  type: string;
  scheduled_at: string;
  duration_min: number;
  status: string;
  meeting_url: string | null;
  topic: string | null;
};

async function ownedProviderIds(supabase: SupabaseClient, userId: string) {
  const [t, n] = await Promise.all([
    supabase.from('trainers').select('id').eq('owner_id', userId),
    supabase.from('nutritionists').select('id').eq('owner_id', userId),
  ]);
  return {
    trainer: new Set((t.data ?? []).map((r: { id: number }) => r.id)),
    nutritionist: new Set((n.data ?? []).map((r: { id: number }) => r.id)),
  };
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  // RLS returns sessions where the caller is the client OR the owning coach.
  const { data, error } = await supabase
    .from('sessions')
    .select('id, client_id, client_name, provider_id, provider_role, type, scheduled_at, duration_min, status, meeting_url, topic')
    .order('scheduled_at', { ascending: true })
    .limit(200);
  if (error) return NextResponse.json({ sessions: [] });

  const rows = (data ?? []) as SessionRow[];
  const owned = await ownedProviderIds(supabase, user.id);

  const trainerIds = [...new Set(rows.filter(r => r.provider_role === 'trainer').map(r => r.provider_id))];
  const nutriIds = [...new Set(rows.filter(r => r.provider_role === 'nutritionist').map(r => r.provider_id))];
  const [tr, nr] = await Promise.all([
    trainerIds.length ? supabase.from('trainers').select('id, name').in('id', trainerIds) : Promise.resolve({ data: [] }),
    nutriIds.length ? supabase.from('nutritionists').select('id, name').in('id', nutriIds) : Promise.resolve({ data: [] }),
  ]);
  const nameOf = new Map<string, string>();
  for (const r of (tr.data ?? []) as { id: number; name: string }[]) nameOf.set(`trainer:${r.id}`, r.name);
  for (const r of (nr.data ?? []) as { id: number; name: string }[]) nameOf.set(`nutritionist:${r.id}`, r.name);

  const sessions = rows.map(r => {
    const isCoach = (r.provider_role === 'trainer' ? owned.trainer : owned.nutritionist).has(r.provider_id);
    return {
      id: r.id,
      role: isCoach ? 'coach' : 'client', // the caller's relationship to this session
      status: r.status,
      type: r.type,
      scheduledAt: r.scheduled_at,
      durationMin: r.duration_min,
      topic: r.topic ?? '',
      meetingUrl: r.meeting_url,
      clientName: r.client_name ?? 'Client',
      providerName: nameOf.get(`${r.provider_role}:${r.provider_id}`) ?? 'Coach',
      providerRole: r.provider_role,
    };
  });
  return NextResponse.json({ sessions });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  const sessionId = String(body.sessionId ?? '');
  const action = String(body.action ?? '').toLowerCase();
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId.' }, { status: 400 });
  if (!['confirm', 'decline', 'complete', 'cancel'].includes(action)) {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }

  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const { data: sessionRow, error: readErr } = await supabase
    .from('sessions')
    .select('id, client_id, provider_id, provider_role, type, scheduled_at, duration_min, status, meeting_url')
    .eq('id', sessionId)
    .maybeSingle();
  if (readErr || !sessionRow) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  const session = sessionRow as SessionRow;

  const owned = await ownedProviderIds(supabase, user.id);
  const isCoach = (session.provider_role === 'trainer' ? owned.trainer : owned.nutritionist).has(session.provider_id);
  const isClient = session.client_id === user.id;

  if ((action === 'confirm' || action === 'decline' || action === 'complete') && !isCoach) {
    return NextResponse.json({ error: 'Only the coach can do that.' }, { status: 403 });
  }
  if (action === 'cancel' && !isCoach && !isClient) {
    return NextResponse.json({ error: 'Not your session.' }, { status: 403 });
  }

  const patch: Record<string, unknown> = {};
  if (action === 'confirm') patch.status = 'confirmed';
  if (action === 'decline') patch.status = 'declined';
  if (action === 'complete') patch.status = 'completed';
  if (action === 'cancel') patch.status = 'cancelled';

  // On confirm of a video session with no link yet, attach the in-app room.
  if (action === 'confirm' && session.type === 'video' && !session.meeting_url) {
    patch.meeting_url = videoRoomUrl(session.id);
  }

  const { data: updated, error: updErr } = await supabase
    .from('sessions')
    .update(patch)
    .eq('id', sessionId)
    .select('id, status, type, scheduled_at, duration_min, meeting_url, topic')
    .maybeSingle();
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Notify the client when the coach confirms or declines (best-effort). The
  // recipient is a different user than the actor, so use the service role.
  if ((action === 'confirm' || action === 'decline') && session.client_id) {
    try {
      const when = new Date(session.scheduled_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC',
      });
      await createNotification(createAdminClient(), {
        userId: session.client_id,
        type: action === 'confirm' ? 'session_confirmed' : 'session_declined',
        title: action === 'confirm' ? 'Session confirmed' : 'Session declined',
        body: action === 'confirm'
          ? `Your coach confirmed your session on ${when}.`
          : `Your coach couldn’t take the session on ${when}.`,
        route: 'sessions',
        data: { sessionId: session.id },
      });
    } catch {
      /* best-effort */
    }
  }

  return NextResponse.json({
    ok: true,
    session: updated,
    meetingUrl: (updated as { meeting_url?: string } | null)?.meeting_url ?? null,
  });
}
