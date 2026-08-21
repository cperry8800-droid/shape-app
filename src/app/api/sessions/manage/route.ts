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
import { isSessionReschedulable } from '@/lib/access-guards.mjs';
import { readJson, dbError } from '@/lib/request-utils';

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
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const sessionId = String(body.sessionId ?? '');
  const action = String(body.action ?? '').toLowerCase();
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId.' }, { status: 400 });
  if (!['confirm', 'decline', 'complete', 'cancel', 'reschedule'].includes(action)) {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }
  // Reschedule carries the new wall-clock: { date: 'YYYY-MM-DD', time?: 'HH:MM' }.
  // Stored UTC (the calendar reads/writes UTC wall-clock consistently).
  let newScheduledAt: string | null = null;
  if (action === 'reschedule') {
    const date = String(body.date ?? '');
    const time = /^\d{1,2}:\d{2}$/.test(String(body.time ?? '')) ? String(body.time) : null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'reschedule needs a valid date.' }, { status: 400 });
    }
    newScheduledAt = `${date}T${time ? time.padStart(5, '0') : '00:00'}:00Z`;
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

  if ((action === 'confirm' || action === 'decline' || action === 'complete' || action === 'reschedule') && !isCoach) {
    return NextResponse.json({ error: 'Only the coach can do that.' }, { status: 403 });
  }
  if (action === 'cancel' && !isCoach && !isClient) {
    return NextResponse.json({ error: 'Not your session.' }, { status: 403 });
  }
  // Only an active/upcoming session can be rescheduled. Reject completed (or
  // declined/cancelled) bookings server-side so a stale UI or crafted request
  // can't rewrite a past session's time — and no "moved" notification fires.
  if (action === 'reschedule' && !isSessionReschedulable(session.status)) {
    return NextResponse.json({ error: `Can't reschedule a ${session.status} session.` }, { status: 409 });
  }

  const patch: Record<string, unknown> = {};
  if (action === 'confirm') patch.status = 'confirmed';
  if (action === 'decline') patch.status = 'declined';
  if (action === 'complete') patch.status = 'completed';
  if (action === 'cancel') patch.status = 'cancelled';
  if (action === 'reschedule' && newScheduledAt) patch.scheduled_at = newScheduledAt;

  // On confirm of a video session with no link yet, attach the in-app room.
  // ⚠ videoRoomUrl RETURNS NULL WHEN NO JITSI DOMAIN IS CONFIGURED — it no longer
  // falls back to the public meet.jit.si instance. Leave meeting_url unset rather
  // than writing null over an existing value, and let the confirm succeed: the
  // session is still confirmed, it simply has no video room, and every surface
  // that offers one already gates on a truthy meetingUrl.
  if (action === 'confirm' && session.type === 'video' && !session.meeting_url) {
    const room = videoRoomUrl(session.id);
    if (room) patch.meeting_url = room;
  }

  const { data: updated, error: updErr } = await supabase
    .from('sessions')
    .update(patch)
    .eq('id', sessionId)
    .select('id, status, type, scheduled_at, duration_min, meeting_url, topic')
    .maybeSingle();
  if (updErr) return dbError(updErr, 'session update', 500);

  // Notify the client when the coach confirms, declines, or reschedules
  // (best-effort). The recipient is a different user than the actor, so use
  // the service role.
  if ((action === 'confirm' || action === 'decline' || action === 'reschedule') && session.client_id) {
    try {
      // For a reschedule, the meaningful time is the NEW slot, not the old.
      const whenSource = action === 'reschedule' && newScheduledAt ? newScheduledAt : session.scheduled_at;
      const when = new Date(whenSource).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC',
      });
      const copy = {
        confirm: { type: 'session_confirmed', title: 'Session confirmed', body: `Your coach confirmed your session on ${when}.` },
        decline: { type: 'session_declined', title: 'Session declined', body: `Your coach couldn’t take the session on ${when}.` },
        reschedule: { type: 'session_rescheduled', title: 'Session moved', body: `Your coach moved your session to ${when}.` },
      }[action]!;
      await createNotification(createAdminClient(), {
        userId: session.client_id,
        type: copy.type,
        title: copy.title,
        body: copy.body,
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
