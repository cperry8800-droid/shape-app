// Consultation booking endpoint.
// Writes a row to `sessions`, looks up the coach via provider_id + role,
// and emails both parties with a calendar invite attached.
//
// ⚠ BOOKING REQUIRES A SIGNED-IN SHAPE ACCOUNT (owner ruling, 2026-08-14).
// It used to be fully anonymous, and that was a denial-of-availability vector: the
// row is written with status 'requested', /api/availability treats 'requested' as
// booked, and a partial unique index denies the slot a second way — so anyone with
// no account could fill a coach's calendar with fakes until real prospects saw no
// availability.
//
// ⚠ THE ROUTE-LEVEL CHECK BELOW IS ONLY HALF THE FIX, and on its own it would be
// decorative. RLS carried an `anon_insert_sessions` policy granted to BOTH anon and
// authenticated whose only test was `status = 'requested'`, so a caller could write
// the row STRAIGHT TO POSTGREST with the publishable key that ships in every page —
// bypassing this route, its captcha and the proxy rate limiter entirely.
// 2026-08-11-consultation-requires-account.sql replaces that policy. Do not restore
// an anon INSERT path without also re-opening this hole.
//
// Identity is taken from the ACCOUNT, not from the request body. That is deliberate:
// the old shape let a caller put anyone's address in `clientEmail` and have Shape mail
// them a calendar invite. `client_id` is now stamped too, so a booking has an owner.
//
// Still uses the service-role client for the insert — it needs to read the coach's
// email and name, which are not in any public view.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isEffectivelyAtCapacity } from '@/lib/capacity';
import { createNotification } from '@/lib/notify';
import { buildIcs, sendEmail } from '@/lib/email';

// The calendar ORGANIZER shown to whoever requested the booking. A no-reply
// platform identity, never a person's private account address.
const ORGANIZER_EMAIL = process.env.CALENDAR_ORGANIZER_EMAIL || 'no-reply@theshapecommunity.com';
import { cleanText as clean, isEmail, readJson } from '@/lib/request-utils';
import { verifyTurnstile } from '@/lib/turnstile';
import { currentUser } from '@/lib/request-auth';

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = process.env.APPLICATIONS_EMAIL ?? 'chris.perry@shapecommunity.onmicrosoft.com';

function isISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

// Accepts "9:00 AM" / "2:30 PM" and returns { hour, minute } in 24h.
function parseTime(s: string): { hour: number; minute: number } | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  const mer = m[3].toUpperCase();
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  if (mer === 'PM' && hour !== 12) hour += 12;
  if (mer === 'AM' && hour === 12) hour = 0;
  return { hour, minute };
}

// Escape user/provider values before interpolating them into email HTML bodies
// (these are unauthenticated, attacker-supplied). Same approach as apply/route.ts.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(req: NextRequest) {
  const parsedBody = await readJson<Record<string, unknown>>(req);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;

  // Bot gate (Cloudflare Turnstile). No-op until TURNSTILE_SECRET_KEY is set;
  // once set, a public booking must carry a valid captcha token.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  if (!(await verifyTurnstile(body.captchaToken ?? body.turnstileToken, ip))) {
    return NextResponse.json({ error: 'Captcha check failed — please retry.' }, { status: 400 });
  }

  // ⚠ An account is required. Returned as 401 with a machine-readable code so the
  // booking page can show a sign-in prompt rather than a generic failure.
  const user = await currentUser(req);
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to your Shape account to book a consultation.', code: 'auth_required' },
      { status: 401 }
    );
  }

  const providerIdRaw = Number(body.providerId ?? body.provider_id ?? 0);
  const providerRoleRaw = clean(body.professionalType ?? body.provider_role, 20).toLowerCase();
  const providerRole: 'trainer' | 'nutritionist' =
    providerRoleRaw === 'nutritionist' ? 'nutritionist' : 'trainer';
  const date = clean(body.date, 20);
  const time = clean(body.time, 20);
  const topic = clean(body.topic, 2000);

  // Identity comes from the ACCOUNT, never the body — a caller must not be able to
  // point Shape's invite mail at an address they do not own.
  // ⚠ The one exception is deliberate: a phone-OTP account can legitimately have no
  // email at all, and refusing to let those members book would be a worse bug than the
  // one being fixed. In that case only, a submitted address is accepted — from a
  // signed-in, identified caller whose user id is stamped on the row.
  const accountEmail = clean(user.email ?? '', 200).toLowerCase();
  const submittedEmail = clean(body.clientEmail, 200).toLowerCase();
  const clientEmail = accountEmail || submittedEmail;
  const clientName =
    clean((user.user_metadata as Record<string, unknown> | null)?.full_name, 200) ||
    clean(body.clientName, 200) ||
    clientEmail.split('@')[0] ||
    'Shape member';

  if (!providerIdRaw || !Number.isFinite(providerIdRaw)) {
    return NextResponse.json({ error: 'Invalid provider.' }, { status: 400 });
  }
  if (!date || !time) {
    return NextResponse.json({ error: 'Date and time are required.' }, { status: 400 });
  }
  if (!clientEmail) {
    return NextResponse.json(
      { error: 'Add an email to your account before booking a consultation.' },
      { status: 400 }
    );
  }
  if (!isISODate(date)) {
    return NextResponse.json({ error: 'Invalid date.' }, { status: 400 });
  }
  if (!isEmail(clientEmail)) {
    return NextResponse.json({ error: 'Please enter a valid email.' }, { status: 400 });
  }

  const parsed = parseTime(time);
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid time.' }, { status: 400 });
  }

  // Treat the picker value as the local wall-clock time in the user's
  // browser. JS's Date(year, month, day, h, m) constructor uses the
  // server's local timezone, which on Vercel is UTC — close enough for a
  // v1. We'll upgrade to per-coach timezones later.
  const [y, m, d] = date.split('-').map((n) => parseInt(n, 10));
  const scheduled = new Date(Date.UTC(y, m - 1, d, parsed.hour, parsed.minute, 0));
  if (Number.isNaN(scheduled.getTime())) {
    return NextResponse.json({ error: 'Invalid datetime.' }, { status: 400 });
  }
  if (scheduled.getTime() < Date.now() - 60 * 60 * 1000) {
    return NextResponse.json({ error: 'Cannot book in the past.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const table = providerRole === 'trainer' ? 'trainers' : 'nutritionists';
  const { data: provider, error: providerError } = await admin
    .from(table)
    .select('id, name, owner_id, at_capacity, capacity_resume_at')
    .eq('id', providerIdRaw)
    .maybeSingle();

  if (providerError || !provider) {
    return NextResponse.json({ error: 'Provider not found.' }, { status: 404 });
  }
  if (isEffectivelyAtCapacity(provider)) {
    return NextResponse.json(
      { error: 'This coach is at capacity right now. Try again later.' },
      { status: 409 }
    );
  }

  // Look up the coach's email via auth.users (owner_id FK).
  let coachEmail: string | null = null;
  if (provider.owner_id) {
    const { data: authUser } = await admin.auth.admin.getUserById(provider.owner_id);
    coachEmail = authUser?.user?.email ?? null;
  }

  // Insert — the unique index on (role, provider_id, scheduled_at) will
  // reject a conflict with 23505.
  const { data: inserted, error: insertError } = await admin
    .from('sessions')
    .insert({
      // Stamped so a booking has an owner: it now shows up in the member's own
      // sessions list, and the RLS policy that replaced the anon insert pins
      // client_id = auth.uid() on every non-service-role write.
      client_id: user.id,
      provider_id: providerIdRaw,
      provider_role: providerRole,
      scheduled_at: scheduled.toISOString(),
      duration_min: 15,
      type: 'video',
      status: 'requested',
      client_name: clientName,
      client_email: clientEmail,
      topic: topic || null,
    })
    .select('id')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json(
        { error: 'That slot was just taken. Please pick another.' },
        { status: 409 }
      );
    }
    console.error('[shape-app] sessions insert failed', insertError);
    return NextResponse.json(
      { error: 'Could not save your booking. Please email info@theshapecommunity.com directly.' },
      { status: 500 }
    );
  }

  // In-app notification for the coach (best-effort — never blocks the booking).
  if (provider.owner_id) {
    await createNotification(admin, {
      userId: provider.owner_id,
      type: 'booking_request',
      title: 'New session request',
      body: `${clientName} requested a consultation${topic ? ` · ${topic}` : ''}.`,
      route: 'sessions',
      data: { sessionId: inserted.id, providerRole },
    });
  }

  // Build .ics + emails. Fire-and-forget — don't fail the booking if
  // email delivery fails.
  const niceDate = scheduled.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: 'UTC',
  });
  const summary = `Shape consultation with ${provider.name}`;
  const description = topic
    ? `15-minute consultation. Topic: ${topic}`
    : '15-minute consultation.';

  // ONE MEETING, TWO INVITATIONS.
  //
  // ⚠ The organizer is NOT the coach's private account email. This ICS travels
  // to `clientEmail` — an address the CALLER supplies, on a route with no
  // authentication — so putting the coach's auth.users email in ORGANIZER meant
  // anyone could POST a booking with their own address, receive the invite, and
  // read that coach's login email out of it. Iterate providerId and you harvest
  // every coach on the platform.
  //
  // But an invite where the recipient is neither ORGANIZER nor ATTENDEE is one
  // a calendar client has no RSVP to offer — and moving the organizer off the
  // coach took the coach off their own booking. So each side gets a copy naming
  // THEM as the attendee. Same UID, because it is the same meeting; same
  // no-reply organizer, so neither address ever reaches the other party.
  const inviteFor = (attendeeEmail: string, attendeeName: string) =>
    buildIcs({
      uid: inserted.id,
      start: scheduled,
      durationMin: 15,
      summary,
      description,
      organizerEmail: ORGANIZER_EMAIL,
      organizerName: provider.name,
      attendeeEmail,
      attendeeName,
      location: 'Video call',
    });

  // The client's invite is unconditional now. It used to be gated on coachEmail
  // only because the coach's address WAS the organizer — with a platform
  // organizer that dependency is gone, and a booking with a coach who has no
  // account email should still put the call on the client's calendar.
  const clientIcs = inviteFor(clientEmail, clientName);
  const coachIcs = coachEmail ? inviteFor(coachEmail, provider.name) : undefined;

  // Attacker-supplied (unauthenticated) values are HTML-escaped in every email body.
  const providerNameHtml = escapeHtml(provider.name);
  const clientNameHtml = escapeHtml(clientName);
  const clientEmailHtml = escapeHtml(clientEmail);
  const topicHtml = escapeHtml(topic);

  const clientHtml = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;">
      <h2 style="margin:0 0 16px;">You're booked with ${providerNameHtml}</h2>
      <p><strong>${niceDate} UTC</strong><br/>15-minute video consultation</p>
      ${topic ? `<p><em>Topic:</em> ${topicHtml}</p>` : ''}
      <p>${providerNameHtml} will confirm shortly. You'll get a second email with the call link once they accept.</p>
      <p style="color:#666;font-size:13px;margin-top:32px;">
        Need to cancel? Reply to this email.
      </p>
    </div>`.trim();

  const coachHtml = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;">
      <h2 style="margin:0 0 16px;">New consultation request</h2>
      <p><strong>${clientNameHtml}</strong> (${clientEmailHtml})<br/>
      <strong>${niceDate} UTC</strong> — 15 min video</p>
      ${topic ? `<p><em>Topic:</em> ${topicHtml}</p>` : ''}
      <p><a href="https://theshapecommunity.com/dashboard/${providerRole}">Open your dashboard →</a></p>
    </div>`.trim();

  const adminHtml = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;">
      <h2 style="margin:0 0 16px;">New consultation booking</h2>
      <p><strong>Coach:</strong> ${providerNameHtml} (${providerRole})<br/>
      <strong>Client:</strong> ${clientNameHtml} &lt;${clientEmailHtml}&gt;<br/>
      <strong>When:</strong> ${niceDate} UTC<br/>
      <strong>Duration:</strong> 15 min video</p>
      ${topic ? `<p><em>Topic:</em> ${topicHtml}</p>` : ''}
      <p style="color:#666;font-size:12px;">Session ID: ${inserted.id}</p>
    </div>`.trim();

  await Promise.all([
    sendEmail({
      to: clientEmail,
      subject: `Consultation booked with ${provider.name}`,
      html: clientHtml,
      text: `You're booked with ${provider.name} on ${niceDate} UTC. 15-min video consultation.`,
      ics: clientIcs,
      icsFilename: 'shape-consultation.ics',
    }),
    coachEmail
      ? sendEmail({
          to: coachEmail,
          subject: `New consultation request — ${clientName}`,
          html: coachHtml,
          text: `New consultation request from ${clientName} (${clientEmail}) on ${niceDate} UTC.`,
          ics: coachIcs,
          icsFilename: 'shape-consultation.ics',
        })
      : Promise.resolve({ ok: false }),
    sendEmail({
      to: ADMIN_EMAIL,
      subject: `Booking: ${clientName} → ${provider.name} (${niceDate} UTC)`,
      html: adminHtml,
      text: `New booking. Coach: ${provider.name} (${providerRole}). Client: ${clientName} <${clientEmail}>. When: ${niceDate} UTC. Session ID: ${inserted.id}.${topic ? ' Topic: ' + topic : ''}`,
    }).catch((e) => { console.error('[consultation] admin notify failed', e); return { ok: false as const }; }),
  ]);

  return NextResponse.json({ ok: true, session_id: inserted.id });
}
