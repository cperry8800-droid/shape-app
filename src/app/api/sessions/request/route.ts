// A member asks their own coach for a session (2026-10-07, Schedule step 2).
//
// POST { providerRole, providerId, scheduledAt, durationMin?, topic? } -> { ok, sessionId }
//
// ⚠ THE TEAM PAGE USED TO INSERT STRAIGHT INTO `sessions`, AND THE COACH WAS NEVER TOLD. The
// RLS insert (`client_insert_own_sessions`) is a fine gate on WHO and WHAT STATUS, but a row
// written from the browser has no server to send anything, so a member's request landed on the
// coach's calendar with no notification — the coach found it only by opening the Schedule. It
// also landed anywhere: nothing checked the time against the coach's open hours or their other
// bookings, so a crafted insert could put a request at 3 AM or across a booked hour.
//
// This route is that insert with the missing halves:
//   1. the time must be one bookingSlots.js offered the member: inside the coach's open hours
//      (scheduleRules.fitsOpenHours) AND one of the starts it lays out (isOfferedStart), at the
//      Team page's own length — no more;
//   2. it must not overlap the coach's other active bookings (requested or confirmed);
//   3. it must keep the coach's own rules: time off, buffer, daily limit and notice
//      (bookingRules.checkSlot, Schedule step 3);
//   4. the coach is notified, on their own clock.
//
// ⚠ THE ROW IS STILL WRITTEN THROUGH THE MEMBER'S OWN CLIENT, so RLS keeps pinning
// `client_id = auth.uid()` and `status = 'requested'` exactly as before — this route adds
// checks, it does not widen what a member may write. The service role is used only to READ
// what a member cannot see (the coach's other bookings, for a yes/no) and to write the coach's
// notification.
//
// ⚠ ONLY YOUR OWN COACH. The Team page books the coaches a member subscribes to, and so does
// this: an active or trialing subscription to that provider row. A prospect books the free
// 15-minute consult (/api/consultation), which has its own captcha and rules.
//
// Auth: cookie session OR Bearer token.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notify';
import { readJson, dbError } from '@/lib/request-utils';
import { normalizeZone, wallClockInZone } from '@/lib/time';
import { bookingRuleRefusal, checkBookingRules, countOpenRequests, findSessionClash, isDoubleBookError, offeredInOpenHours, OPEN_REQUESTS_CAP, openRequestsMessage, readOpenHours } from '@/lib/session-booking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The one length a member can ask for: the Team page's CT_SESSION_MIN (clientTeam.jsx), which
// every slot it offers carries. ⚠ IT WAS FIVE LENGTHS (15–90), AND THE PAGE NEVER SENDS ANY BUT
// THIS ONE (Codex, the review of #2228): a crafted request could ask for 90 minutes the coach was
// never offered. tests/schedule-step2.test.mjs pins it to the page's constant.
const SESSION_MIN = 60;

export async function POST(request: Request) {
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in to book a session.', code: 'auth_required' }, { status: 401 });

  const role = body.providerRole === 'nutritionist' ? 'nutritionist' : body.providerRole === 'trainer' ? 'trainer' : null;
  const providerId = Number(body.providerId);
  if (!role || !Number.isInteger(providerId) || providerId <= 0) {
    return NextResponse.json({ error: 'Invalid coach.' }, { status: 400 });
  }
  const startMs = Date.parse(String(body.scheduledAt ?? ''));
  if (!Number.isFinite(startMs)) return NextResponse.json({ error: 'Invalid time.' }, { status: 400 });
  const durationMin = body.durationMin == null ? SESSION_MIN : Number(body.durationMin);
  if (durationMin !== SESSION_MIN) return NextResponse.json({ error: 'Invalid session length.' }, { status: 400 });
  if (startMs <= Date.now()) return NextResponse.json({ error: 'That time has passed. Pick another.' }, { status: 400 });
  const topic = String(body.topic ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Coaching session';

  const supabase = await clientForRequest(request);
  // Your own coach: the same subscription statuses the Team page lists them by.
  const { data: subs, error: subsError } = await supabase
    .from('subscriptions')
    .select('provider_id')
    .eq('client_id', user.id)
    .eq('provider_id', providerId)
    .eq('provider_role', role)
    .in('status', ['active', 'trialing']);
  if (subsError) return NextResponse.json({ error: "We couldn't check your coaching plan. Nothing was booked — try again." }, { status: 503 });
  if (!(subs ?? []).length) {
    return NextResponse.json({ error: 'You can book sessions with your own coaches. Book a consult to meet someone new.', code: 'not_your_coach' }, { status: 403 });
  }

  const admin = createAdminClient();
  // ⚠ `select('*')` IS MIGRATION-SAFE: naming `timezone` errors the WHOLE query on a database
  // without 2026-09-11-provider-timezone.sql (the /api/consultation and /api/availability rule).
  const { data: provider } = await admin.from(role === 'trainer' ? 'trainers' : 'nutritionists').select('*').eq('id', providerId).maybeSingle();
  if (!provider) return NextResponse.json({ error: 'Coach not found.' }, { status: 404 });
  const zone = normalizeZone((provider as { timezone?: unknown }).timezone);
  // Hours with no zone are hours nobody can place, so nothing is bookable against them — the
  // rule the Team page's own `nozone` state already shows the member.
  if (!zone) {
    return NextResponse.json({ error: "This coach's calendar isn't ready for bookings yet.", code: 'nozone' }, { status: 409 });
  }

  // 1 · One of the times the page offered, read on the coach's clock: inside their open hours
  // and on the start grid bookingSlots lays out (a 9:15 inside a 9:00–11:00 row is not offered).
  const wall = wallClockInZone(startMs, zone);
  const hours = await readOpenHours(admin, role, providerId);
  if (!hours.ok || !wall) return NextResponse.json({ error: "We couldn't read your coach's open hours. Nothing was booked — try again." }, { status: 503 });
  const [hh, mm] = wall.time.split(':').map(Number);
  if (!offeredInOpenHours(hours.slots, wall.date, hh * 60 + mm, durationMin)) {
    return NextResponse.json({ error: "That time is outside your coach's open hours. Pick one of the times shown.", code: 'outside_hours' }, { status: 409 });
  }

  // 2 · Not across another booking. The service role reads the coach's calendar; the member is
  // told only that the time is taken, never whose it is.
  const clash = await findSessionClash(admin, { role, providerId, startMs, durationMin });
  if (!clash.ok) return NextResponse.json({ error: "We couldn't check your coach's calendar. Nothing was booked — try again." }, { status: 503 });
  if (clash.clash) return NextResponse.json({ error: 'Somebody just took that time. Pick another and we’ll send the request.', code: 'taken' }, { status: 409 });

  // 3 · The coach's own rules: time off, the buffer, the daily limit and the notice they ask for
  // (Schedule step 3). The reason is the code, and the sentence never names another member.
  const rules = await checkBookingRules(admin, { role, providerId, zone, slots: hours.slots, startMs, durationMin, nowMs: Date.now() });
  if (!rules.ok && rules.unavailable) return NextResponse.json({ error: "We couldn't check your coach's calendar. Nothing was booked — try again." }, { status: 503 });
  if (!rules.ok) return NextResponse.json({ error: rules.message, code: rules.reason }, { status: 409 });

  // Identity comes from the ACCOUNT, never from the body — the same rule /api/consultation
  // records, and the RLS policy pins client_id = auth.uid() anyway.
  // M3 (2026-10-08 review): at most OPEN_REQUESTS_CAP open requests with one coach, read through
  // the member's own client (their rows), before the insert; the trigger refuses at the database too.
  const open = await countOpenRequests(supabase, { clientId: user.id, role, providerId });
  if (!open.ok) {
    return NextResponse.json({ error: "We couldn't check your open requests just now. Please try again.", code: 'unavailable' }, { status: 503 });
  }
  if (open.count >= OPEN_REQUESTS_CAP) {
    return NextResponse.json({ error: openRequestsMessage(OPEN_REQUESTS_CAP), code: 'open_requests' }, { status: 409 });
  }
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const clientName = String(meta.full_name ?? '').trim() || String(user.email ?? '').split('@')[0] || 'Shape client';
  const { data: inserted, error } = await supabase
    .from('sessions')
    .insert({
      client_id: user.id,
      client_name: clientName,
      // NOT NULL; a phone-only account has no address and stores an empty one.
      client_email: user.email ?? '',
      provider_id: providerId,
      provider_role: role,
      type: 'video',
      scheduled_at: new Date(startMs).toISOString(),
      duration_min: durationMin,
      // Pinned by RLS too: a member may only ever write 'requested', so the coach still decides.
      status: 'requested',
      topic,
    })
    .select('id')
    .single();
  if (error) {
    // ⚠ THE DATABASE KEEPS THE COACH'S RULES TOO (sessions_enforce_booking_rules): a request sent
    // at the same moment as another can pass the check above and still break the buffer or the
    // daily limit once both are written. The second one is refused here, with the same sentence.
    const refused = bookingRuleRefusal(error);
    if (refused) return NextResponse.json({ error: refused.message, code: refused.reason }, { status: 409 });
    // ⚠ THE DATABASE REFUSED A DOUBLE BOOKING: the same start (23505) or an overlapping one
    // (23P01, sessions_no_overlap) was written between the clash read and this write. It
    // deserves its own sentence, or the member goes back to the same dead time.
    if (isDoubleBookError(error)) {
      return NextResponse.json({ error: 'Somebody just took that time. Pick another and we’ll send the request.', code: 'taken' }, { status: 409 });
    }
    return dbError(error, 'session request', 500);
  }

  // 4 · The coach hears about it, on their own clock (the zone their hours are stored in).
  const ownerId = (provider as { owner_id?: string | null }).owner_id;
  if (ownerId) {
    try {
      const when = new Date(startMs).toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: zone,
      });
      await createNotification(admin, {
        userId: ownerId,
        type: 'booking_request',
        title: 'New session request',
        body: `${clientName} requested a session on ${when}.`,
        route: 'sessions',
        data: { sessionId: (inserted as { id: string }).id, providerRole: role },
      });
    } catch {
      /* best-effort: the request stands without its notice */
    }
  }

  return NextResponse.json({ ok: true, sessionId: (inserted as { id: string }).id });
}
