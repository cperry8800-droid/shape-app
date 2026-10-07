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
//   cancel   (client or coach) -> status='cancelled'; a coach's cancel tells the member
//   reschedule (coach) -> a new wall clock; refused when it overlaps another booking
// POST { action: 'create', role, clientId, date, time, tz, durationMin, type?, topic?, repeat? }
//   (coach) -> a CONFIRMED session with one of the coach's own active clients, booked from an
//   empty slot on the Schedule grid. No sessionId: there is no row yet. See createSession.
//   `repeat: { weeks, weekdays? }` books a run instead (see createRun).
// cancel and reschedule take `scope: 'following'` on a booking that is part of a run: this one
//   and every later active booking of the run (see runFollowing).
//
// Auth: cookie session OR Bearer token (the mobile app bridges either).

import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { type SupabaseClient } from '@supabase/supabase-js';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { videoRoomUrl } from '@/lib/video';
import { createNotification } from '@/lib/notify';
import { isSessionReschedulable, unauthorizedAssignTargets } from '@/lib/access-guards.mjs';
import { readJson, dbError } from '@/lib/request-utils';
import { findSessionClash, isDoubleBookError } from '@/lib/session-booking';
import { clashInWindow, readCalendarWindow, seriesOccurrences, shiftedRun } from '@/lib/session-series';

import { instantInZone, normalizeZone, wallClockInZone } from '@/lib/time';
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
  // Read with `*`, so a database without 2026-10-07-session-series.sql reads it as absent.
  series_id?: string | null;
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

// How many session rows the manage screen reads, newest first.
const MANAGE_CAP = 200;

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  // RLS returns sessions where the caller is the client OR the owning coach.
  const { data, error } = await supabase
    .from('sessions')
    .select('id, client_id, client_name, provider_id, provider_role, type, scheduled_at, duration_min, status, meeting_url, topic')
    // ⚠ NEWEST FIRST, RE-SORTED ASCENDING ONCE BELOW. This is the screen where a session
    // is confirmed, rescheduled or cancelled — always an upcoming one — and ordering the
    // read ascending made the cap keep the OLDEST 200, so a coach or a member past that
    // saw only sessions from years ago and could not reach anything they still had to act
    // on. The response contract is unchanged: callers still receive them ascending.
    .order('scheduled_at', { ascending: false })
    .limit(MANAGE_CAP);
  if (error) return NextResponse.json({ sessions: [] });

  const rows = ((data ?? []) as SessionRow[])
    .slice()
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
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

// ── The member's own clock, for a notice about their session ─────────────────
// ⚠ THIS NOTICE GOES TO THE MEMBER, SO IT HAS TO BE THE MEMBER'S CLOCK — and it used to be an
// UNLABELLED UTC time, so a member in New York was told 1:00 PM for a 9:00 AM session with
// nothing on screen saying which zone that was. Same defect class as the booking chain this
// shipped with (2026-09-11): a wall clock with no zone attached.
//
// Their captured zone is preferred; with none on file the zone is NAMED rather than guessed,
// because a labelled time a member has to convert is honest and a bare wrong number is not.
// (client_profiles.timezone is captured opportunistically on app open, so an account that has
// only ever used the website may not have one yet.)
//
// ⚠ READ THROUGH THE REQUEST-SCOPED CLIENT, NEVER THE SERVICE ROLE. An earlier cut used
// createAdminClient() here, which bypasses RLS to read another user's profile row inside a
// user-initiated request — flagged by CodeRabbit's security review on #2053, and correctly:
// this route uses the request client for everything else, so the admin client was the one
// place where RLS stopped being authoritative.
//
// ⚠ AND THE RLS OUTCOME IS EXACTLY THE RIGHT BEHAVIOUR, not a limitation to work around.
// `providers_read_subscriber_profiles` lets a coach read the profile of a client with an active
// or trialing subscription, and `client_profiles_read_own` covers nobody else. So a coach
// confirming a session for a paying client gets their real zone, and a coach confirming a FREE
// INTRO CONSULT for someone who is not their subscriber gets nothing — which is the correct
// answer, because we have no business reading a non-client's profile to format a sentence. That
// case falls to the named-zone branch below.
//
// Shared by every notice this route sends (2026-10-07: the coach's create and cancel joined
// confirm, decline and reschedule), so there is one reading of the member's clock, not five.
async function memberClock(supabase: SupabaseClient, clientId: string, whenSource: string): Promise<string> {
  let memberZone: string | null = null;
  try {
    const { data: prof } = await supabase
      .from('client_profiles')
      .select('timezone')
      .eq('user_id', clientId)
      .maybeSingle();
    memberZone = normalizeZone((prof as { timezone?: unknown } | null)?.timezone);
  } catch {
    memberZone = null; // a refused or failed read must not stop the notification
  }
  return new Date(whenSource).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: memberZone || 'UTC',
    // Named whichever zone it lands in: the member's own needs no explanation, and a
    // fallback that does not say "UTC" is exactly the unlabelled claim being removed.
    ...(memberZone ? {} : { timeZoneName: 'short' as const }),
  });
}

// "Priya S. at 9:00 AM" — the booking a move or a new booking would land on, on the COACH's
// clock (the zone the request was made in). Names the client: the coach owns both bookings.
function clashLabel(clash: { startMs: number; clientName: string | null }, zone: string): string {
  const at = new Date(clash.startMs).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: zone });
  return `${clash.clientName || 'another booking'} at ${at}`;
}

// ── create: a coach books one of their own clients from an empty slot ────────
//
// ⚠ A COACH CANNOT INSERT INTO `sessions` THROUGH RLS, AND THAT IS WHY THE ROW IS WRITTEN WITH
// THE SERVICE ROLE — AFTER EVERY CHECK BELOW HAS PASSED ON THE CALLER'S OWN CLIENT. The only
// insert policy (`client_insert_own_sessions`) pins `client_id = auth.uid()` and `status =
// 'requested'`: it exists so a member can ask, and it would refuse a coach writing a booking
// for somebody else. So the authority here is this route, not the policy, and it checks the
// same things the coach routes that assign work check: the caller owns a provider row in
// `role`, and the client holds an ACTIVE or TRIALING subscription to THAT row
// (unauthorizedAssignTargets, the meal-plan and program-assign gate). A former client, a
// prospect, or another coach's client is refused before the service role is touched.
//
// ⚠ `tz` IS REQUIRED HERE, UNLIKE RESCHEDULE. The reschedule's "no tz means UTC" is a contract
// older app builds and Nora's undo depend on; a create has no installed caller to keep, so a
// wall clock with no zone is refused rather than read as UTC.
const CREATE_TYPES = ['video', 'inperson', 'phone'];
async function createSession(request: Request, body: Record<string, unknown>) {
  const role = body.role === 'trainer' || body.role === 'nutritionist' ? body.role : null;
  if (!role) return NextResponse.json({ error: 'create needs a role.' }, { status: 400 });
  const clientId = String(body.clientId ?? '').trim();
  if (!clientId) return NextResponse.json({ error: 'Pick a client to book.' }, { status: 400 });
  const date = String(body.date ?? '');
  const time = String(body.time ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: 'create needs a date and a time.' }, { status: 400 });
  }
  const zone = normalizeZone(body.tz);
  if (!zone) return NextResponse.json({ error: 'create needs a valid time zone.' }, { status: 400 });
  const durationMin = Number(body.durationMin);
  if (!Number.isInteger(durationMin) || durationMin < 15 || durationMin > 240 || durationMin % 5 !== 0) {
    return NextResponse.json({ error: 'A session runs 15 minutes to 4 hours.' }, { status: 400 });
  }
  const type = body.type == null || body.type === '' ? 'video' : String(body.type);
  if (!CREATE_TYPES.includes(type)) return NextResponse.json({ error: 'Unknown session type.' }, { status: 400 });
  const topic = String(body.topic ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || null;
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const at = instantInZone(y, mo, d, h, mi, zone);
  if (!Number.isFinite(at)) {
    return NextResponse.json({ error: `${date} ${time} is not a time that exists in ${zone}. Pick another time.` }, { status: 400 });
  }
  // A minute's grace for the click that left the page as the clock turned.
  if (at < Date.now() - 60_000) {
    return NextResponse.json({ error: 'That time has passed. Pick a time ahead.' }, { status: 400 });
  }

  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const { data: pro } = await supabase
    .from(role === 'trainer' ? 'trainers' : 'nutritionists')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (!pro) return NextResponse.json({ error: 'Only a coach can book a session here.' }, { status: 403 });
  const providerId = (pro as { id: number }).id;

  const { data: subs, error: subsError } = await supabase
    .from('subscriptions')
    .select('client_id')
    .eq('provider_id', providerId)
    .eq('provider_role', role)
    .in('status', ['active', 'trialing']);
  if (subsError) return NextResponse.json({ error: 'Could not verify your active clients. Please retry.' }, { status: 500 });
  const activeClientIds = (subs ?? []).map((s) => String((s as { client_id: unknown }).client_id));
  if (unauthorizedAssignTargets([clientId], activeClientIds).length) {
    return NextResponse.json({ error: 'You can only book a session with your own active client.' }, { status: 403 });
  }

  // A run ("every Tue and Thu for 8 weeks") is the same booking on each of its dates, past the
  // same checks above; it is written by createRun.
  if (body.repeat != null) {
    return createRun({ supabase, role, providerId, clientId, date, time, zone, durationMin, type, topic, repeat: body.repeat });
  }

  const clash = await findSessionClash(supabase, { role, providerId, startMs: at, durationMin });
  if (!clash.ok) return NextResponse.json({ error: "Couldn't check your calendar for clashes. Nothing was booked — try again." }, { status: 503 });
  if (clash.clash) {
    return NextResponse.json({ error: `That overlaps ${clashLabel(clash.clash, zone)}. Pick another time.`, code: 'overlap' }, { status: 409 });
  }

  const admin = createAdminClient();
  const { clientName, clientEmail } = await bookingIdentity(supabase, admin, clientId);

  // The id is minted here so a video session's room can be named after it in the same write.
  // ⚠ videoRoomUrl RETURNS NULL WHEN NO JITSI DOMAIN IS CONFIGURED; the session is still booked,
  // it simply has no room, exactly as a confirm without one.
  const id = randomUUID();
  const room = type === 'video' ? videoRoomUrl(id) : null;
  const { data: inserted, error: insErr } = await admin
    .from('sessions')
    .insert({
      id,
      client_id: clientId,
      client_name: clientName,
      client_email: clientEmail,
      provider_id: providerId,
      provider_role: role,
      type,
      scheduled_at: new Date(at).toISOString(),
      duration_min: durationMin,
      // The coach is the one who confirms, and the coach is the one booking.
      status: 'confirmed',
      topic,
      ...(room ? { meeting_url: room } : {}),
    })
    .select('id, status, type, scheduled_at, duration_min, meeting_url, topic')
    .single();
  if (insErr) {
    // ⚠ THE DATABASE REFUSED A DOUBLE BOOKING: somebody took this start (23505) or an
    // overlapping time (23P01, sessions_no_overlap) between the clash read and the write. Its
    // own sentence, because "something went wrong" sends the coach back to the same dead time.
    if (isDoubleBookError(insErr)) {
      return NextResponse.json({ error: 'That time was just taken. Pick another.', code: 'taken' }, { status: 409 });
    }
    return dbError(insErr, 'session create', 500);
  }

  try {
    const when = await memberClock(supabase, clientId, new Date(at).toISOString());
    await createNotification(createAdminClient(), {
      userId: clientId,
      type: 'session_booked',
      title: 'Session booked',
      body: `Your coach booked a session with you on ${when}.`,
      route: 'sessions',
      data: { sessionId: id },
    });
  } catch {
    /* best-effort: the booking stands without its notice */
  }

  const row = inserted as { meeting_url?: string | null } | null;
  return NextResponse.json({ ok: true, session: inserted, meetingUrl: row?.meeting_url ?? null, clientName });
}

// The row's NOT NULL display fields. The name comes the way the calendar reads it
// (get_display_names: display fields only); the address from auth, because the member's own
// invite mail and the sessions list key on it — an account with none (phone sign-up) stores an
// empty string rather than failing the booking.
async function bookingIdentity(supabase: SupabaseClient, admin: SupabaseClient, clientId: string) {
  let clientName = 'Client';
  try {
    const { data: names } = await supabase.rpc('get_display_names', { p_ids: [clientId] });
    const n = ((names ?? []) as { full_name: string | null }[])[0];
    if (n && String(n.full_name ?? '').trim()) clientName = String(n.full_name).trim();
  } catch { /* the booking does not depend on a display name */ }
  let clientEmail = '';
  try {
    const { data: authUser } = await admin.auth.admin.getUserById(clientId);
    clientEmail = authUser?.user?.email ?? '';
  } catch { /* nor on an address */ }
  return { clientName, clientEmail };
}

// "Tue, Oct 20", on the coach's clock — which date of a run a sentence is about.
const dayLabel = (at: number, zone: string) => new Date(at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: zone });

// A database without 2026-10-07-session-series.sql: the column is unknown to PostgREST (PGRST204)
// or to Postgres (42703). A run cannot be written or read there, and saying so beats a 500.
const isMissingSeriesColumn = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST204' || e.code === '42703') && /series_id/.test(String(e.message ?? ''));

// ── create with `repeat`: a run of bookings ──────────────────────────────────
//
// Every date of the run (seriesOccurrences: the coach's own calendar and clock, so a run that
// crosses a clock change keeps its wall time) is checked against the coach's calendar, read ONCE
// for the whole run. A date that would overlap another booking is SKIPPED and named, never
// moved: a coach who asked for Tuesdays at 7 gets Tuesdays at 7, minus the ones that are taken,
// and is told which. Nothing is booked when every date is taken.
//
// ⚠ ONE INSERT FOR THE RUN, THEN ONE PER BOOKING ONLY IF THE DATABASE REFUSED IT. The calendar
// read can lose the same race a single booking can (sessions_no_overlap); a refused bulk insert
// writes nothing, so the run is retried booking by booking and a date taken in the meantime is
// skipped like the others.
async function createRun(o: {
  supabase: SupabaseClient; role: string; providerId: number; clientId: string; date: string; time: string; zone: string;
  durationMin: number; type: string; topic: string | null; repeat: unknown;
}) {
  const repeat = (o.repeat && typeof o.repeat === 'object' ? o.repeat : {}) as Record<string, unknown>;
  const weekdays = repeat.weekdays == null ? null : Array.isArray(repeat.weekdays) ? repeat.weekdays.map(Number) : [NaN];
  const occ = seriesOccurrences({ date: o.date, time: o.time, zone: o.zone, weeks: Number(repeat.weeks), weekdays });
  if (!occ.ok) return NextResponse.json({ error: occ.error }, { status: 400 });

  type Skip = { date: string; time: string; reason: 'past' | 'overlap' | 'taken' | 'no_such_time'; message: string };
  const skipped: Skip[] = occ.missing.map((m) => ({ ...m, reason: 'no_such_time' as const, message: `${m.date} ${m.time} doesn't exist in ${o.zone}.` }));
  const now = Date.now();
  for (const x of occ.list) if (x.at < now - 60_000) skipped.push({ date: x.date, time: x.time, reason: 'past', message: `${dayLabel(x.at, o.zone)} has passed.` });
  const ahead = occ.list.filter((x) => x.at >= now - 60_000);
  if (!ahead.length) return NextResponse.json({ error: 'None of those dates are ahead of now. Nothing was booked.' }, { status: 400 });

  const cal = await readCalendarWindow(o.supabase, { role: o.role, providerId: o.providerId, fromMs: ahead[0].at, toMs: ahead[ahead.length - 1].at + o.durationMin * 60_000 });
  if (!cal.ok) return NextResponse.json({ error: "Couldn't check your calendar for clashes. Nothing was booked — try again." }, { status: 503 });
  const free = [];
  for (const x of ahead) {
    const c = clashInWindow(cal.items, x.at, o.durationMin);
    if (c) skipped.push({ date: x.date, time: x.time, reason: 'overlap', message: `${dayLabel(x.at, o.zone)} overlaps ${clashLabel({ startMs: c.start, clientName: c.name }, o.zone)}.` });
    else free.push(x);
  }
  if (!free.length) {
    return NextResponse.json({ error: 'Every one of those dates overlaps another booking. Nothing was booked.', code: 'overlap', skipped }, { status: 409 });
  }

  const admin = createAdminClient();
  const { clientName, clientEmail } = await bookingIdentity(o.supabase, admin, o.clientId);
  const seriesId = randomUUID();
  const rowFor = (x: { at: number }) => {
    const id = randomUUID();
    const room = o.type === 'video' ? videoRoomUrl(id) : null;
    return {
      id, series_id: seriesId, client_id: o.clientId, client_name: clientName, client_email: clientEmail,
      provider_id: o.providerId, provider_role: o.role, type: o.type, scheduled_at: new Date(x.at).toISOString(),
      duration_min: o.durationMin, status: 'confirmed', topic: o.topic, ...(room ? { meeting_url: room } : {}),
    };
  };
  const SELECT = 'id, status, type, scheduled_at, duration_min, meeting_url, topic, series_id';
  type Booked = { id: string; scheduled_at: string; meeting_url?: string | null };
  let booked: Booked[] = [];
  const bulk = await admin.from('sessions').insert(free.map(rowFor)).select(SELECT);
  if (!bulk.error) booked = (bulk.data ?? []) as Booked[];
  else if (isMissingSeriesColumn(bulk.error)) {
    return NextResponse.json({ error: "Repeating sessions aren't set up yet. Book them one at a time for now." }, { status: 503 });
  } else if (isDoubleBookError(bulk.error)) {
    for (const x of free) {
      const one = await admin.from('sessions').insert(rowFor(x)).select(SELECT).single();
      if (!one.error) booked.push(one.data as Booked);
      else if (isDoubleBookError(one.error)) skipped.push({ date: x.date, time: x.time, reason: 'taken', message: `${dayLabel(x.at, o.zone)} was just taken.` });
      else if (!booked.length) return dbError(one.error, 'session series create', 500);
      else skipped.push({ date: x.date, time: x.time, reason: 'taken', message: `${dayLabel(x.at, o.zone)} couldn't be saved.` });
    }
    if (!booked.length) return NextResponse.json({ error: 'Those times were just taken. Nothing was booked.', code: 'taken', skipped }, { status: 409 });
  } else {
    return dbError(bulk.error, 'session series create', 500);
  }
  booked.sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));

  try {
    const when = await memberClock(o.supabase, o.clientId, booked[0].scheduled_at);
    await createNotification(createAdminClient(), {
      userId: o.clientId,
      type: 'session_booked',
      title: booked.length === 1 ? 'Session booked' : 'Sessions booked',
      body: booked.length === 1
        ? `Your coach booked a session with you on ${when}.`
        : `Your coach booked ${booked.length} sessions with you, starting ${when}.`,
      route: 'sessions',
      data: { sessionId: booked[0].id, seriesId },
    });
  } catch {
    /* best-effort: the run stands without its notice */
  }
  skipped.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return NextResponse.json({
    ok: true,
    session: booked[0],
    meetingUrl: booked[0].meeting_url ?? null,
    clientName,
    series: { id: seriesId, booked: booked.length, sessions: booked.map((b) => ({ id: b.id, scheduledAt: b.scheduled_at })), skipped },
  });
}

// ── cancel / reschedule with `scope: 'following'` ───────────────────────────
//
// This booking and every later ACTIVE booking of its run. A cancel cancels them together. A move
// shifts each by the same number of calendar days on the coach's clock and gives it the new wall
// time (shiftedRun), so a Tuesday 7:00 run moved to Wednesday 8:00 stays on Wednesdays at 8:00.
//
// ⚠ A MOVE IS ALL OR NOTHING. Every new time is checked before any row moves, against the
// calendar with the run's own bookings left out (they are the ones moving), and one clash refuses
// the whole move and names the date. The writes then go in the order that cannot collide with a
// booking of the same run still waiting to move (latest first when moving later, earliest first
// when moving earlier), and a write the database refuses puts back the ones already moved.
async function runFollowing(o: {
  supabase: SupabaseClient; userId: string; session: SessionRow; isCoach: boolean;
  action: 'cancel' | 'reschedule'; date: string; time: string | null; zone: string;
}) {
  const sid = o.session.series_id;
  if (!sid) return NextResponse.json({ error: "This session isn't part of a repeating run." }, { status: 400 });
  // A run is at most 60 bookings, so the read needs no cap.
  const { data, error } = await o.supabase
    .from('sessions')
    .select('id, scheduled_at, duration_min, status, client_id')
    .eq('series_id', sid)
    .gte('scheduled_at', o.session.scheduled_at)
    .in('status', ['requested', 'confirmed'])
    .order('scheduled_at', { ascending: true });
  if (error) return NextResponse.json({ error: "Couldn't read the rest of this run. Nothing was changed — try again." }, { status: 503 });
  const run = (data ?? []) as Array<{ id: string; scheduled_at: string; duration_min: number | null; status: string; client_id: string | null }>;
  if (!run.length) return NextResponse.json({ error: 'Nothing in this run is left to change.' }, { status: 409 });
  const ids = run.map((r) => r.id);
  const notify = async (title: string, type: string, body: (when: string) => string, whenSource: string) => {
    if (!o.session.client_id || !o.isCoach || o.session.client_id === o.userId) return;
    try {
      const when = await memberClock(o.supabase, o.session.client_id, whenSource);
      await createNotification(createAdminClient(), { userId: o.session.client_id, type, title, body: body(when), route: 'sessions', data: { sessionId: o.session.id, seriesId: sid } });
    } catch { /* best-effort */ }
  };

  if (o.action === 'cancel') {
    const { error: updErr } = await o.supabase.from('sessions').update({ status: 'cancelled' }).in('id', ids);
    if (updErr) return dbError(updErr, 'session run cancel', 500);
    await notify(run.length === 1 ? 'Session cancelled' : 'Sessions cancelled', 'session_cancelled',
      (when) => run.length === 1 ? `Your coach cancelled your session on ${when}.` : `Your coach cancelled ${run.length} sessions, from ${when} on.`, run[0].scheduled_at);
    return NextResponse.json({ ok: true, series: { id: sid, count: run.length } });
  }

  // reschedule
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date) || !o.time) {
    return NextResponse.json({ error: 'Moving the rest of a run needs a date and a time.' }, { status: 400 });
  }
  const from = wallClockInZone(Date.parse(o.session.scheduled_at), o.zone);
  if (!from) return NextResponse.json({ error: 'reschedule needs a valid time zone.' }, { status: 400 });
  const shifted = shiftedRun(run, { zone: o.zone, fromDate: from.date, toDate: o.date, time: o.time });
  const gone = shifted.find((x) => x.at == null);
  if (gone) return NextResponse.json({ error: `${gone.date} ${o.time} is not a time that exists in ${o.zone}. Nothing was moved.` }, { status: 400 });
  const ats = shifted.map((x) => x.at as number);
  const span = Math.max(...run.map((r) => r.duration_min ?? 15));
  const cal = await readCalendarWindow(o.supabase, { role: o.session.provider_role, providerId: o.session.provider_id, fromMs: Math.min(...ats), toMs: Math.max(...ats) + span * 60_000 });
  if (!cal.ok) return NextResponse.json({ error: "Couldn't check the calendar for clashes. Nothing was moved — try again." }, { status: 503 });
  const exclude = new Set(ids);
  for (let i = 0; i < run.length; i++) {
    const c = clashInWindow(cal.items, ats[i], run[i].duration_min ?? 15, exclude);
    if (c) {
      return NextResponse.json({ error: `${dayLabel(ats[i], o.zone)} overlaps ${clashLabel({ startMs: c.start, clientName: c.name }, o.zone)}. Nothing was moved.`, code: 'overlap' }, { status: 409 });
    }
  }
  const later = ats[0] > Date.parse(run[0].scheduled_at);
  const order = run.map((_, i) => i);
  if (later) order.reverse();
  const moved: number[] = [];
  for (const i of order) {
    const { error: updErr } = await o.supabase.from('sessions').update({ scheduled_at: new Date(ats[i]).toISOString() }).eq('id', run[i].id);
    if (updErr) {
      // Put back what moved, newest move first, so the run is as it was.
      for (const j of moved.reverse()) {
        try { await o.supabase.from('sessions').update({ scheduled_at: run[j].scheduled_at }).eq('id', run[j].id); } catch { /* best-effort */ }
      }
      if (isDoubleBookError(updErr)) {
        return NextResponse.json({ error: `${dayLabel(ats[i], o.zone)} was just taken. Nothing was moved — pick another time.`, code: 'taken' }, { status: 409 });
      }
      return dbError(updErr, 'session run reschedule', 500);
    }
    moved.push(i);
  }
  await notify(run.length === 1 ? 'Session moved' : 'Sessions moved', 'session_rescheduled',
    (when) => run.length === 1 ? `Your coach moved your session to ${when}.` : `Your coach moved ${run.length} sessions; the next is on ${when}.`, new Date(ats[0]).toISOString());
  return NextResponse.json({ ok: true, series: { id: sid, count: run.length, sessions: run.map((r, i) => ({ id: r.id, scheduledAt: new Date(ats[i]).toISOString() })) } });
}

export async function POST(request: Request) {
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const sessionId = String(body.sessionId ?? '');
  const action = String(body.action ?? '').toLowerCase();
  if (action === 'create') return createSession(request, body);
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId.' }, { status: 400 });
  if (!['confirm', 'decline', 'complete', 'cancel', 'reschedule'].includes(action)) {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }
  // Reschedule carries the new wall-clock: { date: 'YYYY-MM-DD', time?: 'HH:MM', tz?: IANA }.
  //
  // ⚠ THE WALL CLOCK IS READ IN `tz`, THE ZONE /api/calendar PLACED IT IN — and the calendar
  // names that zone in its response so a caller can hand it straight back. This read every
  // wall clock as UTC ("Stored UTC") while the calendar now shows bookings in the coach's own
  // zone, so the two halves of a drag would disagree by the offset. And a wall clock is the
  // right thing to keep across a move: a 9:00 AM New York session dragged from Oct 30 to
  // Nov 2 stays at 9:00 AM, which is 13:00Z before the clocks change and 14:00Z after. Keeping
  // the INSTANT's UTC hour instead would land it at 8:00 AM.
  //
  // ⚠ NO `tz` MEANS UTC, ON PURPOSE: it is what an installed app build from before this change
  // and Nora's undo (which slices `scheduled_at`) both mean, and /api/calendar answers a caller
  // who sends no `tz` in UTC to match. A `tz` that is SENT but is not a zone is refused rather
  // than read as UTC, because that would move the booking by the offset and report success.
  let newScheduledAt: string | null = null;
  // The zone the reschedule's wall clock was read in — kept for the clash sentence below, so a
  // refusal names the other booking on the same clock the coach was looking at.
  let rescheduleZone = 'UTC';
  if (action === 'reschedule') {
    const date = String(body.date ?? '');
    const time = /^\d{1,2}:\d{2}$/.test(String(body.time ?? '')) ? String(body.time) : null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'reschedule needs a valid date.' }, { status: 400 });
    }
    const sentZone = body.tz;
    const zone = sentZone == null || sentZone === '' ? 'UTC' : normalizeZone(sentZone);
    if (!zone) return NextResponse.json({ error: 'reschedule needs a valid time zone.' }, { status: 400 });
    rescheduleZone = zone;
    const [y, mo, d] = date.split('-').map(Number);
    const [h, mi] = time ? time.split(':').map(Number) : [0, 0];
    // NaN for a wall clock the zone never shows (the spring-forward hour) and for an
    // impossible one ("25:00", Feb 30): instantInZone round-trips its answer.
    const at = instantInZone(y, mo, d, h, mi, zone);
    if (!Number.isFinite(at)) {
      return NextResponse.json({ error: `${date} ${time ?? '00:00'} is not a time that exists in ${zone}. Pick another time.` }, { status: 400 });
    }
    newScheduledAt = new Date(at).toISOString();
  }

  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  // ⚠ `*`, SO A DATABASE WITHOUT 2026-10-07-session-series.sql STILL READS THE ROW: naming
  // `series_id` would fail every confirm, cancel and move there, not only the run's.
  const { data: sessionRow, error: readErr } = await supabase
    .from('sessions')
    .select('*')
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
  // "This and following" on a booking that is part of a run (recurring sessions, step 4).
  if (body.scope === 'following' && (action === 'cancel' || action === 'reschedule')) {
    return runFollowing({
      supabase, userId: user.id, session, isCoach, action,
      date: String(body.date ?? ''), time: /^\d{1,2}:\d{2}$/.test(String(body.time ?? '')) ? String(body.time) : null,
      zone: rescheduleZone,
    });
  }
  // ⚠ A MOVE ONTO ANOTHER BOOKING IS REFUSED HERE, NOT ONLY ON THE GRID. The Schedule grid turns
  // its drop target red over a clash, but the app's sheet, Nora and any stale page post here
  // too, and nothing stopped two sessions overlapping before (the double-book index only
  // catches an IDENTICAL start). The session's own row is excluded, so nudging a booking by
  // fifteen minutes inside its own hour is not a clash with itself.
  if (action === 'reschedule' && newScheduledAt) {
    const clash = await findSessionClash(supabase, {
      role: session.provider_role,
      providerId: session.provider_id,
      startMs: Date.parse(newScheduledAt),
      durationMin: session.duration_min ?? 15,
      excludeId: session.id,
    });
    if (!clash.ok) return NextResponse.json({ error: "Couldn't check the calendar for clashes. Nothing was moved — try again." }, { status: 503 });
    if (clash.clash) {
      return NextResponse.json({ error: `That overlaps ${clashLabel(clash.clash, rescheduleZone)}. Nothing was moved.`, code: 'overlap' }, { status: 409 });
    }
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
  // ⚠ A MOVE CAN LOSE THE SAME RACE A NEW BOOKING CAN: the clash read above passed, and another
  // write took the time before this one landed. The database refuses it (sessions_no_overlap);
  // the coach is told the time was taken, and nothing moved, so nobody is notified.
  if (updErr && isDoubleBookError(updErr)) {
    return NextResponse.json({ error: 'That time was just taken. Nothing was moved — pick another.', code: 'taken' }, { status: 409 });
  }
  if (updErr) return dbError(updErr, 'session update', 500);

  // Notify the client when the coach confirms, declines, reschedules or cancels (best-effort).
  // The recipient is a different user than the actor, so the WRITE uses the service role; the
  // member's clock is read through RLS (memberClock, above).
  // ⚠ A COACH'S CANCEL USED TO TELL NOBODY: the member found out by the session vanishing from
  // their list. The Schedule's booking sheet now offers Cancel beside Reschedule, so it says
  // what a reschedule says. A member cancelling their own booking is not told about it.
  const coachCancel = action === 'cancel' && isCoach && session.client_id !== user.id;
  if ((action === 'confirm' || action === 'decline' || action === 'reschedule' || coachCancel) && session.client_id) {
    try {
      // For a reschedule, the meaningful time is the NEW slot, not the old.
      const whenSource = action === 'reschedule' && newScheduledAt ? newScheduledAt : session.scheduled_at;
      const when = await memberClock(supabase, session.client_id, whenSource);
      const copy = {
        confirm: { type: 'session_confirmed', title: 'Session confirmed', body: `Your coach confirmed your session on ${when}.` },
        decline: { type: 'session_declined', title: 'Session declined', body: `Your coach couldn’t take the session on ${when}.` },
        reschedule: { type: 'session_rescheduled', title: 'Session moved', body: `Your coach moved your session to ${when}.` },
        cancel: { type: 'session_cancelled', title: 'Session cancelled', body: `Your coach cancelled your session on ${when}.` },
      }[action as 'confirm' | 'decline' | 'reschedule' | 'cancel'];
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
