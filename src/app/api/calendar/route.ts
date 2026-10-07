// Shared calendar for the website (newdesign CalendarOverlay) + mobile app
// (BSCalendarScreen). Both front-ends read/write here so they stay in sync.
//
// GET  ?from=YYYY-MM-DD&to=YYYY-MM-DD[&clientId=<uuid>][&tz=<IANA>][&role=trainer|nutritionist]
//      -> { events: [...], zone } merging:
//         * calendar_events rows (planned workouts/meals/check-ins/etc.)
//         * the sessions table (coaching bookings) as read-only events
//         * DERIVED read-only plan events — assigned workouts
//           (client_workouts.scheduled_date) and the active weekly menu
//           (client_meal_plans, expanded by day-of-week from this week
//           forward) — so a coach "push to client" shows up on the client's
//           calendar automatically, no duplicate event rows to drift.
//      RLS scopes all of it: a coach may pass ?clientId to view a client's
//      calendar (and sees only the plan rows they authored).
//
//      ⚠ A BOOKING'S `date` AND `time` ARE A WALL CLOCK IN `zone`, AND THE RESPONSE NAMES IT.
//      Sessions are stored as real instants; until 2026-10-07 this route read them back with
//      `toISOString()` and `getUTCHours()`, so every surface that reads it (the coach Schedule,
//      the member calendar overlay, the app's calendar) showed a 9:00 AM New York consult at
//      "1:00p" and an evening session on the next day's cell. One rule, `calendarZone` below:
//        1. a caller who sends `tz` is placing bookings on a clock, so: the caller's OWN
//           provider zone when they are a coach (the zone their open hours are stored in, so
//           a booking and the hour it was booked into read the same) — `role` picks which
//           row for an account that owns both — else the `tz` they sent (their browser);
//        2. a caller who sends no `tz` gets UTC, exactly as before. ⚠ THAT IS DELIBERATE, NOT
//           A FALLBACK NOBODY THOUGHT ABOUT: /api/sessions/manage reads a reschedule's wall
//           clock as UTC when it carries no `tz`, and an installed app build from before
//           this change (and Nora's undo, which slices `scheduled_at`) sends none. Zoning
//           their reads without zoning their writes would move every booking they drag by
//           the coach's offset.
//      calendar_events rows are ALREADY a wall clock (event_date + event_time columns, no
//      zone) and plan rows are bare dates, so neither is converted.
//      `scheduledAt` (the real instant) still rides on every session for callers that do
//      their own arithmetic (the capacity panel on Today).
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
import { isSessionReschedulable } from '@/lib/access-guards.mjs';
import { readJson, dbError } from '@/lib/request-utils';
import { requireMembership } from '@/lib/require-membership';
import { DAY_MS, normalizeZone, wallClockInZone } from '@/lib/time';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// How many published plan rows the calendar reads, newest first with the undated ones
// kept — see the note on that query.
const PLAN_CAP = 200;

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

type Supa = Awaited<ReturnType<typeof clientForRequest>>;

// The zone this response places bookings in — the rule is in the header comment.
// ⚠ `select('*')` FOR THE SAME REASON AS /api/my-availability: naming `timezone` would error
// the whole read on a database without 2026-09-11-provider-timezone.sql, and a calendar that
// fails to load is worse than one that reads in the browser's zone.
async function calendarZone(supabase: Supa, userId: string, sentTz: string | null, role: string | null): Promise<string> {
  if (sentTz == null) return 'UTC';
  const tables = role === 'trainer' ? ['trainers'] : role === 'nutritionist' ? ['nutritionists'] : ['trainers', 'nutritionists'];
  const rows = await Promise.all(tables.map((t) => supabase.from(t).select('*').eq('owner_id', userId).maybeSingle()));
  for (const r of rows) {
    const zone = normalizeZone((r.data as { timezone?: unknown } | null)?.timezone);
    if (zone) return zone;
  }
  return normalizeZone(sentTz) ?? 'UTC';
}

// A calendar date `days` away, by the calendar rather than by 24-hour steps.
function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

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
  const denied = await requireMembership(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const url = new URL(request.url);
  const capacityRole = url.searchParams.get('capacityRole');
  if (capacityRole !== null && !['trainer', 'nutritionist'].includes(capacityRole)) return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
  const from = clean(url.searchParams.get('from'), 10);
  const to = clean(url.searchParams.get('to'), 10);
  const clientId = clean(url.searchParams.get('clientId'), 64);
  const targetUserId = clientId || user.id;

  // Wide default window if not provided: ±60 days around today.
  const today = new Date();
  const dFrom = isDate(from) ? from : new Date(today.getTime() - 60 * 86400000).toISOString().slice(0, 10);
  const dTo = isDate(to) ? to : new Date(today.getTime() + 60 * 86400000).toISOString().slice(0, 10);

  // 1) calendar_events (RLS allows owner + active coach).
  const { data: evRows } = capacityRole ? { data: [] } : await supabase
    .from('calendar_events')
    .select('id, user_id, created_by, created_by_role, kind, title, sub, event_date, event_time, duration_min, with_name, location, accent, status')
    .eq('user_id', targetUserId)
    .gte('event_date', dFrom)
    .lte('event_date', dTo)
    .order('event_date', { ascending: true });

  const events = ((evRows ?? []) as EventRow[]).map(shape);

  // 2) sessions (coaching bookings) merged read-only.
  // ⚠ THE WINDOW IS A RANGE OF THE ZONE'S DATES, NOT OF UTC ONES. A UTC-bounded read drops a
  // New York session at 9:00 PM on the window's last day (01:00Z the day after) and keeps one
  // from the evening before it. So for any other zone the read is widened by a day each side
  // (every zone's offset fits inside that) and the rows are cut back to [dFrom, dTo] by their
  // LOCAL date below. Under UTC the bounds are exactly the old ones — the capacity panel's
  // 1,000-row ceiling is measured on this read, so a UTC caller's must not grow.
  const zone = await calendarZone(supabase, user.id, url.searchParams.get('tz'), url.searchParams.get('role'));
  const widen = zone === 'UTC' ? 0 : 1;
  const fromIso = `${widen ? shiftDate(dFrom, -widen) : dFrom}T00:00:00Z`;
  const toIso = `${widen ? shiftDate(dTo, widen) : dTo}T23:59:59Z`;
  let sessionQuery = supabase
    .from('sessions')
    .select('id, client_id, provider_role, type, scheduled_at, duration_min, status, topic, meeting_url')
    .gte('scheduled_at', fromIso)
    .lte('scheduled_at', toIso)
    .in('status', ['requested', 'confirmed', 'completed'])
    .order('scheduled_at', { ascending: true });
  if (capacityRole) {
    const { data: provider, error: providerError } = await supabase.from(capacityRole === 'trainer' ? 'trainers' : 'nutritionists').select('id').eq('owner_id', user.id).maybeSingle();
    if (providerError || !provider) return NextResponse.json({ error: 'Working hours unavailable.' }, { status: 503 });
    sessionQuery = sessionQuery.eq('provider_role', capacityRole).eq('provider_id', provider.id).limit(1000);
  }
  const { data: sessRows, error: sessionsError } = await sessionQuery;
  if (capacityRole && sessionsError) return NextResponse.json({ error: 'Bookings could not be read.' }, { status: 503 });
  if (capacityRole && sessRows && sessRows.length >= 1000) return NextResponse.json({ error: 'Booking window is too large to measure capacity.' }, { status: 503 });

  type SessRow = {
    id: string; client_id: string | null; provider_role: string; type: string; scheduled_at: string;
    duration_min: number | null; status: string; topic: string | null; meeting_url: string | null;
  };
  // Each booking on the zone's own date and clock (`wallClockInZone`), cut back to the
  // window by that LOCAL date — the widened read above is only a superset.
  const placed = ((sessRows ?? []) as SessRow[])
    .map((s) => ({ s, wall: wallClockInZone(new Date(s.scheduled_at).getTime(), zone) }))
    .filter((p): p is { s: SessRow; wall: { date: string; time: string } } => !!p.wall && p.wall.date >= dFrom && p.wall.date <= dTo);

  // Resolve client names for the coach Schedule view (color-coding + the
  // click-through client drawer). RLS already scoped these to the caller.
  const sessClientIds = [...new Set(placed.map(({ s }) => s.client_id).filter(Boolean) as string[])];
  const sessNameById = new Map<string, string>();
  if (!capacityRole && sessClientIds.length) {
    // ⚠ A status='requested' booking is a PROSPECT — no subscription yet, so the
    // coach read policy on `profiles` does not cover them. get_display_names
    // returns display fields only and is not scoped to the roster.
    const { data: profs, error: profsError } = await supabase.rpc('get_display_names', { p_ids: sessClientIds });
    if (profsError) {
      // A silent fall-through here renders plausible copy — the exact failure
      // this PR exists to stop. The likeliest cause is a deploy-order mismatch:
      // 2026-08-04 applied before this code shipped, or 2026-08-03 not applied.
      console.warn("[shape-app] calendar: get_display_names failed — every client renders as 'Client':", profsError.message);
    }
    for (const p of (profs ?? []) as { user_id: string; full_name: string | null }[]) {
      sessNameById.set(String(p.user_id), String((p.full_name ?? '').trim()) || 'Client');
    }
  }

  const sessions = placed.map(({ s, wall: { date, time } }) => {
    return {
      id: `session:${s.id}`,
      sessionId: s.id,
      scheduledAt: s.scheduled_at,
      source: 'session' as const,
      kind: s.provider_role === 'nutritionist' ? 'CONSULT' : 'SESSION',
      title: s.topic || (s.provider_role === 'nutritionist' ? 'Nutrition consult' : 'Coaching session'),
      sub: s.type,
      date,
      time,
      durationMin: s.duration_min,
      with: s.client_id ? (sessNameById.get(s.client_id) || 'Client') : '',
      clientId: s.client_id || null,
      location: '',
      accent: '',
      status: s.status,
      meetingUrl: s.meeting_url,
      createdByRole: 'coach',
      // Reschedulable by the coach via /api/sessions/manage (drag-to-move) —
      // ONLY while the session is still active/upcoming. A completed (or
      // declined/cancelled) booking is never draggable.
      editable: false,
      reschedulable: isSessionReschedulable(s.status),
      // ⚠ THE CALLER IS THE CLIENT ON THIS ONE. RLS returns a session to its client as well as
      // to its coach, so a coach who is also somebody else's member gets their own bookings in
      // this list. The Schedule answers requests and moves bookings from here (2026-10-07), and
      // it must not offer Accept on a request the coach made themselves — the manage route would
      // refuse it (403) after the coach had pressed it. Marked rather than dropped: the member
      // calendar overlay reads this route for exactly these rows.
      asClient: !!s.client_id && s.client_id === user.id,
    };
  });

  if (capacityRole) return NextResponse.json({ bookingsReadable: true, events: sessions, zone });

  // 3) Assigned workouts (trainer "push to client"). Mirrors the Home tab
  //    (/api/client/plan → bsHomeLiveWeek): DATED workouts land on their date;
  //    UNDATED published workouts are slotted onto the CURRENT week's empty days
  //    so they show on the calendar exactly as they do on Home. (The old
  //    `scheduled_date IS NOT NULL` filter hid every undated workout — the cause
  //    of "Home shows my plan but the calendar is empty".) Read-only here.
  type CwRow = { id: string; title: string; description: string | null; payload: Record<string, unknown> | null; scheduled_date: string | null };
  const { data: cwRows } = await supabase
    .from('client_workouts')
    .select('id, title, description, payload, scheduled_date')
    .eq('client_id', targetUserId)
    .eq('status', 'published')
    // ⚠ NEWEST FIRST WITH THE UNDATED ROWS KEPT, RE-SORTED BELOW. This read has no date
    // filter, so ordering it ascending made the cap keep a member's OLDEST 200 published
    // workouts — the calendar then showed nothing current — and `nullsFirst: false` put
    // the UNDATED ones last, so on a long plan they fell off the end entirely: exactly the
    // "Home shows my plan but the calendar is empty" defect the note above says was fixed,
    // arriving again through the cap. Undated rows are never trimmed now.
    .order('scheduled_date', { ascending: false, nullsFirst: true })
    .limit(PLAN_CAP);

  const mkWorkout = (w: CwRow, dateStr: string) => {
    const payload = (w.payload && typeof w.payload === 'object') ? w.payload : null;
    const exCount = Array.isArray(payload?.exercises) ? (payload!.exercises as unknown[]).length : 0;
    const durMatch = payload?.duration != null ? String(payload.duration).match(/\d+/) : null;
    const timeRaw = payload?.time != null ? String(payload.time) : '';
    return {
      id: `plan:${w.id}`,
      source: 'plan' as const,
      kind: 'WORKOUT',
      title: w.title,
      sub: w.description || (exCount ? `${exCount} move${exCount === 1 ? '' : 's'}` : 'Assigned workout'),
      date: dateStr,
      time: /^\d{1,2}:\d{2}$/.test(timeRaw) ? timeRaw : null,
      durationMin: durMatch ? Number(durMatch[0]) : null,
      with: '', location: '', accent: '',
      status: 'planned',
      createdByRole: 'trainer',
      editable: false,
    };
  };

  // Current week (Mon..Sun) ISO dates — undated workouts slot here, matching Home.
  const wkMon = new Date(today); wkMon.setHours(0, 0, 0, 0);
  wkMon.setDate(wkMon.getDate() - ((wkMon.getDay() + 6) % 7));
  const weekISO = Array.from({ length: 7 }, (_, i) => { const d = new Date(wkMon); d.setDate(wkMon.getDate() + i); return d.toISOString().slice(0, 10); });
  const inWin = (iso: string) => iso >= dFrom && iso <= dTo;

  const planWorkouts: Array<Record<string, unknown>> = [];
  const weekTaken = new Set<string>();
  const undatedW: CwRow[] = [];
  // Back to the order the slotting below was written for: dated ascending, undated last
  // in read order (the sort is stable, so equal keys keep it).
  const planRows = ((cwRows ?? []) as CwRow[]).slice().sort((a, b) => {
    if (!a.scheduled_date && !b.scheduled_date) return 0;
    if (!a.scheduled_date) return 1;
    if (!b.scheduled_date) return -1;
    return a.scheduled_date < b.scheduled_date ? -1 : a.scheduled_date > b.scheduled_date ? 1 : 0;
  });
  for (const w of planRows) {
    if (w.scheduled_date) {
      if (inWin(w.scheduled_date)) planWorkouts.push(mkWorkout(w, w.scheduled_date));
      if (weekISO.includes(w.scheduled_date)) weekTaken.add(w.scheduled_date);
    } else {
      undatedW.push(w);
    }
  }
  let wslot = 0;
  for (const w of undatedW) {
    while (wslot < 7 && (weekTaken.has(weekISO[wslot]) || !inWin(weekISO[wslot]))) wslot += 1;
    if (wslot >= 7) break;
    planWorkouts.push(mkWorkout(w, weekISO[wslot]));
    weekTaken.add(weekISO[wslot]); wslot += 1;
  }

  // 4) The active weekly menu (nutritionist "push to client"), expanded onto
  //    real dates by day-of-week — from this week forward only (the current
  //    menu says nothing about what past weeks were).
  const { data: mpRows } = await supabase
    .from('client_meal_plans')
    .select('id, title, week_start, payload')
    .eq('client_id', targetUserId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(1);

  type MenuMeal = { slot?: unknown; title?: unknown; time?: unknown; kcal?: unknown };
  type MenuDay = { dow?: unknown; meals?: MenuMeal[] };
  const mp = (mpRows ?? [])[0] ?? null;
  const menuDays: MenuDay[] = mp && mp.payload && Array.isArray((mp.payload as Record<string, unknown>).days)
    ? ((mp.payload as Record<string, unknown>).days as MenuDay[])
    : [];
  const byDow: (MenuDay | null)[] = [null, null, null, null, null, null, null];
  const seq: MenuDay[] = [];
  for (const d of menuDays) {
    const dow = Number(d?.dow);
    if (Number.isInteger(dow) && dow >= 0 && dow <= 6 && !byDow[dow]) byDow[dow] = d;
    else if (d) seq.push(d);
  }
  for (let i = 0; i < 7 && seq.length; i++) if (!byDow[i]) byDow[i] = seq.shift()!;

  const planMeals: Array<Record<string, unknown>> = [];
  if (menuDays.length) {
    const monday = new Date(today); monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const startISO = monday.toISOString().slice(0, 10);
    const cursor = new Date(`${dFrom < startISO ? startISO : dFrom}T00:00:00Z`);
    const end = new Date(`${dTo}T00:00:00Z`);
    while (cursor <= end && planMeals.length < 250) {
      const date = cursor.toISOString().slice(0, 10);
      const dow = (cursor.getUTCDay() + 6) % 7; // Mon=0..Sun=6
      const day = byDow[dow];
      (day?.meals ?? []).forEach((meal, j) => {
        if (!meal || meal.title == null) return;
        const slot = meal.slot != null ? String(meal.slot) : 'Meal';
        const kcal = Number(meal.kcal);
        planMeals.push({
          id: `meal:${mp!.id}:${date}:${j}`,
          source: 'meal' as const,
          kind: 'MEAL',
          title: String(meal.title),
          sub: `${slot.charAt(0).toUpperCase()}${slot.slice(1).toLowerCase()}${Number.isFinite(kcal) && kcal > 0 ? ` · ${kcal} kcal` : ''}`,
          date,
          time: meal.time != null && /^\d{1,2}:\d{2}$/.test(String(meal.time)) ? String(meal.time) : null,
          durationMin: null,
          with: '', location: '', accent: '',
          status: 'planned',
          createdByRole: 'nutritionist',
          editable: false,
        });
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  return NextResponse.json({ events: [...events, ...sessions, ...planWorkouts, ...planMeals], zone });
}

// ── POST ─────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
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
  if (error) return dbError(error, 'calendar write', 500);
  return NextResponse.json({ event: shape(data as EventRow) });
}

// ── PATCH ────────────────────────────────────────────────────────────────────
export async function PATCH(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
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
  if (error) return dbError(error, 'calendar write', 500);
  if (!data) return NextResponse.json({ error: 'Not found or not allowed.' }, { status: 404 });
  return NextResponse.json({ event: shape(data as EventRow) });
}

// ── DELETE ───────────────────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const id = clean((body as Record<string, unknown>).id, 64);
  if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 });

  // Authorization is RLS (a user manages their own calendar; a coach manages an
  // active client's — matching the `editable` flag GET returns). Request the
  // deleted row so a delete that matches nothing (missing event, or RLS-denied)
  // returns an honest 404 instead of a false success — mirrors the PATCH handler.
  const { data, error } = await supabase
    .from('calendar_events')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) return dbError(error, 'calendar write', 500);
  if (!data) return NextResponse.json({ error: 'Not found or not allowed.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
