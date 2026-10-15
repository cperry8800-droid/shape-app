// What happens when a client hires a coach, and when a member's membership starts
// (client-onboarding review, fix 3a: H7, M9).
//
// ⚠ BEFORE THIS, A SAVED COACH SUBSCRIPTION WROTE ONE ROW AND ONE BELL: "New subscriber — A new
// client just subscribed". No name, no link, no email, no thread, nothing to the member, and the
// bell was sent even when saving the subscription had failed (review M9).
//
// startCoaching(), called by the Stripe webhook only after the subscription row is saved:
// - opens the coach thread and posts Shape's welcome into it, once (open_coach_thread,
//   2026-10-15-coach-thread.sql). The welcome reaches the member as an in-app "New message" by the
//   messages trigger, like any other message in the thread;
// - alerts the coach with the client's name and links to the thread and the client page, and
//   emails them the same. The alert carries data.dedupe = hire:<subscription>, so a redelivered
//   event stores no second row and sends no second email;
// - emails the member once, when this call is the one that posted the welcome.
//
// welcomeMember(), called when the $5 membership is saved: one welcome per member, ever (dedupe
// "membership-welcome"), in the app and by email.
//
// Best-effort throughout: the payment is already recorded, and a failed alert or email is logged,
// never thrown, so it cannot turn into a webhook failure and a Stripe retry.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notify';
import { sendEmail } from '@/lib/email';
import { WRAP_OPEN, SIGN_OFF_HTML, SIGN_OFF_TEXT, button, escapeHtml, siteUrl } from '@/lib/coach-application-emails';
import { shapeFirstName, shapeWelcomeText } from '../../mobile-app/src/services/shapeWelcome.mjs';

export type CoachRole = 'trainer' | 'nutritionist';
type BuiltEmail = { subject: string; html: string; text: string };

/** The website pages a coach's alert links to. */
export function coachLinks(role: CoachRole, clientId: string, site = siteUrl()) {
  const prefix = role === 'nutritionist' ? 'Nutritionist' : 'Trainer';
  const id = encodeURIComponent(clientId);
  return {
    thread: `${site}/newdesign/${prefix}Messages.html?client=${id}`,
    client: `${site}/newdesign/${prefix}App.html#client/${id}`,
  };
}

/** The member's Team page, where their coaches and the way into each thread live. */
export function memberTeamLink(site = siteUrl()): string {
  return `${site}/newdesign/ClientApp.html#team`;
}

function usd(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

/** The coach's email when a client subscribes. */
export function coachHireEmail(args: { clientName: string; role: CoachRole; clientId: string; monthlyCents?: number | null; site?: string }): BuiltEmail {
  const links = coachLinks(args.role, args.clientId, args.site);
  const name = args.clientName.trim() || 'A new client';
  const pay = args.monthlyCents ? ` (${usd(args.monthlyCents)}/mo to you)` : '';
  const html = `
    ${WRAP_OPEN}
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:500;">New client: ${escapeHtml(name)}</h2>
      <p style="margin:0 0 16px;line-height:1.55;">${escapeHtml(name)} just subscribed to coaching with you${escapeHtml(pay)}.</p>
      <p style="margin:0 0 12px;line-height:1.55;">Your thread with them is open, with a welcome from Shape at the top. Say hello there:</p>
      ${button(links.thread, `Message ${shapeFirstName(name) || 'them'}`)}
      <p style="margin:0 0 16px;line-height:1.55;">Their health screening, goals and preferences are on <a href="${escapeHtml(links.client)}" style="color:#0ac5a8;">their client page</a>. Read the screening before you program.</p>
      ${SIGN_OFF_HTML}
    </div>
  `;
  const text = [
    `New client: ${name}`,
    '',
    `${name} just subscribed to coaching with you${pay}.`,
    '',
    'Your thread with them is open, with a welcome from Shape at the top. Say hello there:',
    links.thread,
    '',
    `Their health screening, goals and preferences are on their client page: ${links.client}`,
    'Read the screening before you program.',
    '',
    ...SIGN_OFF_TEXT,
  ].join('\n');
  return { subject: `New client: ${name}`, html, text };
}

/** The member's email when their coaching starts. */
export function memberHireEmail(args: { coachName: string; role: CoachRole; firstName?: string; site?: string }): BuiltEmail {
  const coach = args.coachName.trim() || 'your coach';
  const first = (args.firstName || '').trim();
  const team = memberTeamLink(args.site);
  const kind = args.role === 'nutritionist' ? 'nutritionist' : 'trainer';
  const html = `
    ${WRAP_OPEN}
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:500;">You're working with ${escapeHtml(coach)}${first ? `, ${escapeHtml(first)}` : ''}.</h2>
      <p style="margin:0 0 16px;line-height:1.55;">Your subscription is active, and your thread with your ${escapeHtml(kind)} is open in Messages. Say hello and tell them what you want from the first week.</p>
      ${button(team, 'Open your team')}
      <p style="margin:0 0 16px;line-height:1.55;">${escapeHtml(coach)} can see your health screening and the goals you chose to share. You can change what you share in Settings.</p>
      ${SIGN_OFF_HTML}
    </div>
  `;
  const text = [
    `You're working with ${coach}${first ? `, ${first}` : ''}.`,
    '',
    `Your subscription is active, and your thread with your ${kind} is open in Messages. Say hello and tell them what you want from the first week.`,
    '',
    `Open your team: ${team}`,
    '',
    `${coach} can see your health screening and the goals you chose to share. You can change what you share in Settings.`,
    '',
    ...SIGN_OFF_TEXT,
  ].join('\n');
  return { subject: `You're working with ${coach} on Shape`, html, text };
}

/** The member's email when the $5 membership starts. */
export function membershipWelcomeEmail(args: { firstName?: string; site?: string }): BuiltEmail {
  const site = args.site ?? siteUrl();
  const first = (args.firstName || '').trim();
  const home = `${site}/newdesign/ClientApp.html`;
  const coaches = `${site}/trainers`;
  const html = `
    ${WRAP_OPEN}
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:500;">Welcome to Shape${first ? `, ${escapeHtml(first)}` : ''}.</h2>
      <p style="margin:0 0 16px;line-height:1.55;">Your membership is active. Your plan, your log and the community are all open to you now.</p>
      ${button(home, 'Open Shape')}
      <p style="margin:0 0 16px;line-height:1.55;">Looking for a coach? <a href="${escapeHtml(coaches)}" style="color:#0ac5a8;">Browse trainers and nutritionists</a>; when you hire one, your thread with them opens on its own.</p>
      <p style="margin:0 0 16px;line-height:1.55;">Questions? Just reply to this email.</p>
      ${SIGN_OFF_HTML}
    </div>
  `;
  const text = [
    `Welcome to Shape${first ? `, ${first}` : ''}.`,
    '',
    'Your membership is active. Your plan, your log and the community are all open to you now.',
    '',
    `Open Shape: ${home}`,
    '',
    `Looking for a coach? Browse trainers and nutritionists: ${coaches}`,
    'When you hire one, your thread with them opens on its own.',
    '',
    'Questions? Just reply to this email.',
    '',
    ...SIGN_OFF_TEXT,
  ].join('\n');
  return { subject: 'Welcome to Shape', html, text };
}

async function emailOf(admin: SupabaseClient, userId: string): Promise<string> {
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    return data?.user?.email || '';
  } catch {
    return '';
  }
}

async function fullNameOf(admin: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await admin.from('profiles').select('full_name').eq('id', userId).maybeSingle();
  if (error) console.warn('[coach-thread] client name read failed:', error.message);
  return String((data as { full_name?: string | null } | null)?.full_name || '').trim();
}

export type CoachingStart = { conversationId: string | null; welcomed: boolean; coachAlerted: boolean };

/**
 * A coach subscription was saved: open the thread with Shape's welcome, alert and email the coach,
 * email the member. Never throws.
 */
export async function startCoaching(
  admin: SupabaseClient,
  a: { clientId: string; providerRole: CoachRole; providerId: number; subscriptionKey: string; monthlyCents?: number | null },
): Promise<CoachingStart> {
  const out: CoachingStart = { conversationId: null, welcomed: false, coachAlerted: false };
  try {
    const table = a.providerRole === 'nutritionist' ? 'nutritionists' : 'trainers';
    const [{ data: provider, error: providerErr }, clientName] = await Promise.all([
      admin.from(table).select('name, owner_id').eq('id', a.providerId).maybeSingle(),
      fullNameOf(admin, a.clientId),
    ]);
    if (providerErr) console.warn('[coach-thread] provider read failed:', providerErr.message);
    const coachName = String((provider as { name?: string | null } | null)?.name || '').trim();
    const ownerId = (provider as { owner_id?: string | null } | null)?.owner_id || null;
    const first = shapeFirstName(clientName);

    const { data: opened, error: openErr } = await admin.rpc('open_coach_thread', {
      p_client_id: a.clientId,
      p_provider_role: a.providerRole,
      p_provider_id: a.providerId,
      p_welcome: shapeWelcomeText({ client: first, coach: coachName }),
      p_client_name: first || null,
    });
    if (openErr) {
      // Before 2026-10-15-coach-thread.sql runs the function is missing (PGRST202); the alert
      // below still goes, and the thread opens the first time either side writes.
      console.error('[coach-thread] open_coach_thread failed:', openErr.message, (openErr as { code?: string }).code);
    } else {
      const row = (Array.isArray(opened) ? opened[0] : opened) as { thread_id?: string; welcomed?: boolean } | null;
      out.conversationId = row?.thread_id ?? null;
      out.welcomed = row?.welcomed === true;
    }

    if (ownerId) {
      const shown = clientName || 'A new client';
      const pay = a.monthlyCents ? ` · ${usd(a.monthlyCents)}/mo to you` : '';
      out.coachAlerted = await createNotification(admin, {
        userId: ownerId,
        type: 'new_client',
        title: `New client: ${shown}`,
        body: `${shown} subscribed${pay}. Your thread with them is open in Messages; read their screening on their client page before you program.`,
        // "chat:<id>" opens the thread in the app and on the website (Codex on #2360: "messages"
        // opened nothing in either); with no thread, "client" opens the client's page.
        route: out.conversationId ? `chat:${out.conversationId}` : 'client',
        data: { dedupe: `hire:${a.subscriptionKey}`, clientId: a.clientId, conversationId: out.conversationId, providerRole: a.providerRole },
      });
      // Only the call that stored the alert emails: a redelivered event finds the dedupe row.
      if (out.coachAlerted) {
        const to = await emailOf(admin, ownerId);
        if (to) await sendEmail({ to, ...coachHireEmail({ clientName: shown, role: a.providerRole, clientId: a.clientId, monthlyCents: a.monthlyCents }) });
      }
    }

    // Only the call that posted the welcome emails the member: it is posted once per thread.
    if (out.welcomed) {
      const to = await emailOf(admin, a.clientId);
      if (to) await sendEmail({ to, ...memberHireEmail({ coachName, role: a.providerRole, firstName: first }) });
    }
  } catch (err) {
    console.error('[coach-thread] startCoaching failed:', err instanceof Error ? err.message : err);
  }
  return out;
}

/** The $5 membership was saved: welcome the member once, in the app and by email. Never throws. */
export async function welcomeMember(admin: SupabaseClient, clientId: string): Promise<boolean> {
  try {
    const first = shapeFirstName(await fullNameOf(admin, clientId));
    const stored = await createNotification(admin, {
      userId: clientId,
      type: 'membership_welcome',
      title: 'Welcome to Shape',
      body: 'Your membership is active. Your plan, your log and the community are open to you now.',
      route: 'home',
      data: { dedupe: 'membership-welcome' },
    });
    if (!stored) return false;
    const to = await emailOf(admin, clientId);
    if (to) await sendEmail({ to, ...membershipWelcomeEmail({ firstName: first }) });
    return true;
  } catch (err) {
    console.error('[coach-thread] welcomeMember failed:', err instanceof Error ? err.message : err);
    return false;
  }
}
