// What a member hears when a coach confirms or completes a session (client-onboarding review,
// fix 3b: M18).
//
// ⚠ THE INTRO EMAIL PROMISED A SECOND EMAIL "WITH THE CALL LINK ONCE THEY ACCEPT", AND NOTHING
// SENT ONE. A coach's confirm wrote the room link onto the session and an in-app "Session
// confirmed"; the member who booked from the website, and reads email, never got the link. And
// after the intro nothing suggested working together.
//
// afterSessionStep(), called by /api/sessions/manage once the update is saved:
// - confirm (from any other status): emails the member the time, the call link when there is one,
//   and a calendar invite;
// - complete, for an intro (the free consultation /api/consultation books, at the length the coach
//   set): one follow-up, in the app and by email, pointing at the coach's profile, unless the
//   member already subscribes to them. The notification carries data.dedupe = intro:<session>, and the email goes
//   only when that row was stored, so a second complete sends nothing.
// Best-effort: the session update already happened, so a failure is logged and never thrown.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notify';
import { buildIcs, calendarOrganizerEmail, sendEmail } from '@/lib/email';
import { WRAP_OPEN, SIGN_OFF_HTML, SIGN_OFF_TEXT, button, escapeHtml, siteUrl } from '@/lib/coach-application-emails';

type BuiltEmail = { subject: string; html: string; text: string };
export type CoachRole = 'trainer' | 'nutritionist';

export type SessionForEmail = {
  id: string;
  client_id: string | null;
  client_email?: string | null;
  client_name?: string | null;
  provider_id: number;
  provider_role: string;
  type?: string | null;
  scheduled_at: string;
  duration_min?: number | null;
  meeting_url?: string | null;
  topic?: string | null;
  status?: string | null;
  intro?: boolean | null;
};

/**
 * A booking /api/consultation made: `sessions.intro` (2026-10-15-intro-length.sql). Its length is the
 * coach's own now, so it no longer tells an intro apart. ⚠ Only a row read from a database WITHOUT
 * the column (no `intro` key at all) falls back to the old mark, the 15-minute video session.
 */
export function isIntro(s: Pick<SessionForEmail, 'duration_min' | 'type' | 'intro'>): boolean {
  if (s.intro !== undefined && s.intro !== null) return s.intro === true;
  return Number(s.duration_min) === 15 && (s.type ?? 'video') === 'video';
}

/** A coach's public profile on the website. */
export function coachProfileLink(role: CoachRole, providerId: number, site = siteUrl()): string {
  return `${site}/${role === 'nutritionist' ? 'nutritionists' : 'trainers'}/${encodeURIComponent(String(providerId))}`;
}

export function sessionConfirmedEmail(a: { coachName: string; when: string; meetingUrl?: string | null; durationMin?: number | null; topic?: string | null }): BuiltEmail {
  const coach = a.coachName.trim() || 'Your coach';
  const length = a.durationMin ? `${a.durationMin}-minute ` : '';
  const callHtml = a.meetingUrl
    ? `<p style="margin:0 0 12px;line-height:1.55;">Join the call from this link at the time:</p>${button(a.meetingUrl, 'Join the call')}`
    : `<p style="margin:0 0 16px;line-height:1.55;">${escapeHtml(coach)} will share how you'll meet in your thread on Shape.</p>`;
  const callText = a.meetingUrl ? ['Join the call from this link at the time:', a.meetingUrl] : [`${coach} will share how you'll meet in your thread on Shape.`];
  const html = `
    ${WRAP_OPEN}
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:500;">${escapeHtml(coach)} confirmed your session</h2>
      <p style="margin:0 0 16px;line-height:1.55;"><strong>${escapeHtml(a.when)}</strong><br/>${escapeHtml(length)}video session</p>
      ${a.topic ? `<p style="margin:0 0 16px;line-height:1.55;"><em>Topic:</em> ${escapeHtml(a.topic)}</p>` : ''}
      ${callHtml}
      <p style="margin:0 0 16px;color:#666;font-size:13px;line-height:1.5;">The invite is attached for your calendar. Need to change it? Reply to this email.</p>
      ${SIGN_OFF_HTML}
    </div>
  `;
  const text = [
    `${coach} confirmed your session`,
    '',
    `${a.when} · ${length}video session`,
    ...(a.topic ? [`Topic: ${a.topic}`] : []),
    '',
    ...callText,
    '',
    'The invite is attached for your calendar. Need to change it? Reply to this email.',
    '',
    ...SIGN_OFF_TEXT,
  ].join('\n');
  return { subject: `Confirmed: your session with ${coach}`, html, text };
}

export function introFollowUpEmail(a: { coachName: string; role: CoachRole; providerId: number; site?: string }): BuiltEmail {
  const coach = a.coachName.trim() || 'your coach';
  const profile = coachProfileLink(a.role, a.providerId, a.site);
  const html = `
    ${WRAP_OPEN}
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:500;">How was your intro with ${escapeHtml(coach)}?</h2>
      <p style="margin:0 0 16px;line-height:1.55;">If it felt right, you can keep working together. Subscribing opens your thread with ${escapeHtml(coach)}, and your plan and check-ins follow from there.</p>
      ${button(profile, `See ${coach}'s coaching`)}
      <p style="margin:0 0 16px;color:#666;font-size:13px;line-height:1.5;">Not the right fit? Browse other coaches on Shape any time.</p>
      ${SIGN_OFF_HTML}
    </div>
  `;
  const text = [
    `How was your intro with ${coach}?`,
    '',
    `If it felt right, you can keep working together. Subscribing opens your thread with ${coach}, and your plan and check-ins follow from there.`,
    '',
    `See ${coach}'s coaching: ${profile}`,
    '',
    'Not the right fit? Browse other coaches on Shape any time.',
    '',
    ...SIGN_OFF_TEXT,
  ].join('\n');
  return { subject: `How was your intro with ${coach}?`, html, text };
}

async function memberEmail(admin: SupabaseClient, s: SessionForEmail): Promise<string> {
  if (s.client_id) {
    try {
      const { data } = await admin.auth.admin.getUserById(s.client_id);
      if (data?.user?.email) return data.user.email;
    } catch {
      /* fall back to the booking's address */
    }
  }
  return String(s.client_email || '').trim();
}

async function coachOf(admin: SupabaseClient, s: SessionForEmail): Promise<{ name: string }> {
  const table = s.provider_role === 'nutritionist' ? 'nutritionists' : 'trainers';
  const { data } = await admin.from(table).select('name').eq('id', s.provider_id).maybeSingle();
  return { name: String((data as { name?: string | null } | null)?.name || '').trim() };
}

/**
 * After a coach's confirm or complete is saved. `previousStatus` is the status the row had when
 * this request's write landed (the route claims a confirm in its write), so a repeated or
 * overlapping confirm sends nothing. `when` is the session's time on the member's clock.
 */
export async function afterSessionStep(
  admin: SupabaseClient,
  a: { action: string; session: SessionForEmail; previousStatus: string | null; when: string },
): Promise<{ emailed: boolean; followedUp: boolean }> {
  const out = { emailed: false, followedUp: false };
  try {
    const s = a.session;
    if (!s.client_id) return out;
    const role: CoachRole = s.provider_role === 'nutritionist' ? 'nutritionist' : 'trainer';

    if (a.action === 'confirm' && a.previousStatus !== 'confirmed') {
      const to = await memberEmail(admin, s);
      if (!to) return out;
      const coach = await coachOf(admin, s);
      const start = new Date(s.scheduled_at);
      const ics = Number.isFinite(start.getTime())
        ? buildIcs({
            // ⚠ THE BOOKING'S OWN UID, AS AN UPDATE (Codex on #2370). /api/consultation sent the
            // member an invite under the session id; a different uid here (and buildIcs adds the
            // domain itself) put a second event on their calendar for every confirmed intro.
            uid: s.id,
            sequence: 1,
            start,
            durationMin: Number(s.duration_min) || 15,
            summary: `Session with ${coach.name || 'your coach'}`,
            description: s.meeting_url ? `Join: ${s.meeting_url}` : 'Your coach will share how you will meet.',
            // The booking invite's organizer, so the calendar takes this as its update (Codex on
            // #2370); the coach's name, as the booking invite shows it.
            organizerEmail: calendarOrganizerEmail(),
            organizerName: coach.name || 'Shape',
            attendeeEmail: to,
            attendeeName: String(s.client_name || '').trim() || to,
            location: s.meeting_url || undefined,
          })
        : undefined;
      const sent = await sendEmail({
        to,
        ...sessionConfirmedEmail({ coachName: coach.name, when: a.when, meetingUrl: s.meeting_url, durationMin: s.duration_min, topic: s.topic }),
        ics,
        icsFilename: 'shape-session.ics',
      });
      out.emailed = sent.ok;
      return out;
    }

    if (a.action === 'complete' && isIntro(s)) {
      // Already working together: nothing to suggest.
      const { data: subs, error: subErr } = await admin
        .from('subscriptions')
        .select('id')
        .eq('client_id', s.client_id)
        .eq('provider_role', role)
        .eq('provider_id', s.provider_id)
        .in('status', ['active', 'trialing'])
        .limit(1);
      if (subErr || (subs && subs.length)) return out;
      const coach = await coachOf(admin, s);
      const coachName = coach.name || 'your coach';
      const stored = await createNotification(admin, {
        userId: s.client_id,
        type: 'intro_followup',
        title: `How was your intro with ${coachName}?`,
        body: `If it felt right, subscribe to keep working with ${coachName}: your thread, plan and check-ins in one place.`,
        route: `coach:${role}:${s.provider_id}`,
        data: { dedupe: `intro:${s.id}`, providerRole: role, providerId: s.provider_id },
      });
      out.followedUp = stored;
      if (stored) {
        const to = await memberEmail(admin, s);
        if (to) await sendEmail({ to, ...introFollowUpEmail({ coachName: coach.name, role, providerId: s.provider_id }) });
      }
    }
  } catch (err) {
    console.error('[session-emails] afterSessionStep failed:', err instanceof Error ? err.message : err);
  }
  return out;
}
