// The Team view of a shared client (owner, 2026-11-05): both coaches' week side by side, the care-team
// thread, and "next, and whose". Everything is read on the caller's own session, through what a coach
// on the client may already read: get_client_coaches (the care team), the caller's own workouts and
// menu (RLS), the other coaches' through get_shared_client_workouts / get_shared_client_meal_plan
// (headers only: no sets, no recipes), sessions (shared_coach_reads_sessions), the latest check-in
// (get_client_checkins), and the care-team thread (participants only). The shaping is pure
// (src/lib/shared-team.mjs).
//
// GET ?week=YYYY-MM-DD&tz=<IANA>&with=<coach user id>
//   -> { shared, client: { id, name }, week, team, lanes, next, thread: { conversationId, with, messages } | null }
// A caller who does not coach the client: 403. A read that fails leaves its part empty and names it
// in `partial`, so the page says what it could not read rather than showing a quiet empty week.
// The thread is FOUND, never created, on a read: the page's "Message" opens it through the existing
// POST /api/me/shared-clients/[clientId]/thread.
//
// Auth: cookie session OR Bearer token (the app may call it).

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { buildTeamView, mondayOf, threadView, weekDays } from '../../../../../../lib/shared-team.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

function zoneOrNull(v: string | null): string | null {
  if (!v) return null;
  try { new Intl.DateTimeFormat('en-US', { timeZone: v }); return v; } catch { return null; }
}

type Row = Record<string, unknown>;

export async function GET(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  if (!UUID.test(clientId)) return NextResponse.json({ error: 'Unknown client.' }, { status: 404 });
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);
  const url = new URL(request.url);
  const weekParam = url.searchParams.get('week');
  const start = mondayOf(weekParam && YMD.test(weekParam) ? weekParam : new Date().toISOString().slice(0, 10));
  const days = weekDays(start);
  const end = days[6];
  const nextEnd = new Date(Date.parse(end + 'T12:00:00Z') + 7 * 86_400_000).toISOString().slice(0, 10);
  const tz = zoneOrNull(url.searchParams.get('tz'));
  const partial: string[] = [];

  const { data: teamRows, error: teamErr } = await supabase.rpc('get_client_coaches', { p_client_id: clientId });
  if (teamErr) return NextResponse.json({ error: "Couldn't read this client's care team." }, { status: 502 });
  const team = (Array.isArray(teamRows) ? teamRows : []) as Row[];
  if (!team.some((t) => t.owner_id === user.id)) return NextResponse.json({ error: 'You do not coach this client.' }, { status: 403 });
  const others = team.filter((t) => t.owner_id && t.owner_id !== user.id);

  const sinceIso = new Date(Date.parse(start + 'T00:00:00Z') - 86_400_000).toISOString();
  const untilIso = new Date(Date.parse(nextEnd + 'T23:59:59Z') + 86_400_000).toISOString();
  const [ownW, otherW, ownM, otherM, sess, checks, prof] = await Promise.all([
    supabase.from('client_workouts').select('id, trainer_id, title, scheduled_date, payload').eq('client_id', clientId).eq('status', 'published').gte('scheduled_date', start).lte('scheduled_date', nextEnd),
    supabase.rpc('get_shared_client_workouts', { p_client_id: clientId }),
    supabase.from('client_meal_plans').select('id, nutritionist_id, title, week_start, payload, created_at').eq('client_id', clientId).eq('status', 'published'),
    supabase.rpc('get_shared_client_meal_plan', { p_client_id: clientId }),
    // `*` so a database without the intro column still reads the rows.
    supabase.from('sessions').select('*').eq('client_id', clientId).gte('scheduled_at', sinceIso).lte('scheduled_at', untilIso),
    supabase.rpc('get_client_checkins', { p_user_id: clientId, p_limit: 2 }),
    supabase.from('profiles').select('full_name').eq('id', clientId).maybeSingle(),
  ]);
  if (ownW.error) partial.push('your workouts');
  if (otherW.error) partial.push("the other trainers' workouts");
  if (ownM.error) partial.push('your menu');
  if (otherM.error) partial.push("the other nutritionists' menus");
  if (sess.error) partial.push('sessions');
  if (checks.error) partial.push('check-ins');

  // The caller's own rows that are theirs (RLS can hand a coach more than their own on some tables).
  const myTrainerIds = new Set(team.filter((t) => t.owner_id === user.id && t.provider_role === 'trainer').map((t) => Number(t.provider_id)));
  const myNutriIds = new Set(team.filter((t) => t.owner_id === user.id && t.provider_role === 'nutritionist').map((t) => Number(t.provider_id)));
  const ownWorkouts = ((ownW.data ?? []) as Row[]).filter((w) => myTrainerIds.has(Number(w.trainer_id)));
  const ownMenus = ((ownM.data ?? []) as Row[])
    .filter((m) => myNutriIds.has(Number(m.nutritionist_id)))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .filter((m, i, all) => all.findIndex((x) => x.nutritionist_id === m.nutritionist_id) === i);
  const otherWorkouts = ((otherW.data ?? []) as Row[]).filter((w) => {
    const d = String(w.scheduled_date || '');
    return d >= start && d <= nextEnd;
  });

  const view = buildTeamView({
    me: user.id, team, weekStart: start, tz, now: new Date(),
    ownWorkouts: ownWorkouts.filter((w) => String(w.scheduled_date) <= end),
    ownWorkoutsNextWeek: ownWorkouts.filter((w) => String(w.scheduled_date) > end),
    otherWorkouts,
    ownMenus,
    otherMenus: (otherM.data ?? []) as Row[],
    sessions: (sess.data ?? []) as Row[],
    checkins: (checks.data ?? []) as Row[],
  });

  // The care-team thread with one co-coach (the one asked for, else the first): found, not created.
  let thread: { conversationId: string; with: string; messages: ReturnType<typeof threadView> } | null = null;
  const wanted = url.searchParams.get('with');
  const counterpart = others.find((t) => t.owner_id === wanted) || others[0];
  if (counterpart) {
    const { data: convs, error: convErr } = await supabase.from('conversations').select('id').eq('client_id', clientId).is('provider_role', null);
    const ids = ((convs ?? []) as Row[]).map((c) => String(c.id));
    if (convErr) partial.push('the care-team thread');
    else if (ids.length) {
      const { data: parts, error: partsErr } = await supabase.from('conversation_participants').select('conversation_id, user_id').in('conversation_id', ids);
      if (partsErr) partial.push('the care-team thread');
      const members = new Map<string, Set<string>>();
      for (const p of (parts ?? []) as Row[]) {
        const cid = String(p.conversation_id);
        if (!members.has(cid)) members.set(cid, new Set());
        members.get(cid)!.add(String(p.user_id));
      }
      const cid = ids.find((id) => members.get(id)?.has(user.id) && members.get(id)?.has(String(counterpart.owner_id)));
      if (cid) {
        const { data: msgs, error: msgErr } = await supabase.from('messages').select('id, sender_id, body, metadata, created_at').eq('conversation_id', cid).order('created_at', { ascending: false }).limit(40);
        if (msgErr) partial.push('the care-team thread');
        thread = { conversationId: cid, with: String(counterpart.owner_id), messages: threadView(msgs ?? [], user.id, team) };
      }
    }
  }

  return NextResponse.json({
    shared: others.length > 0,
    client: { id: clientId, name: String((prof.data as { full_name?: string | null } | null)?.full_name || '').trim() || 'Client' },
    ...view,
    thread,
    partial,
  });
}
