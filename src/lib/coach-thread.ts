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
// - emails the member once, when this call is the one that posted the welcome;
// - tells both sides when the client already has another coach (tellSharedCoaches).
//
// welcomeMember(), called when the $5 membership is saved: one welcome per member, ever (dedupe
// "membership-welcome"), in the app and by email.
//
// coachPaid(), called by the webhook once a one-time purchase is saved (fix 3c: M10). The coach's
// alert used to read "$X from a client for a booking": no name, nothing to do, sent again on every
// redelivery. A paid session now opens the thread, alerts and emails the coach with the client's
// name and a session to schedule, and tells the member what happens next. A program or meal plan
// tells the coach who bought it. Each send is keyed on the checkout (data.dedupe).
//
// Best-effort throughout: the payment is already recorded, and a failed alert or email is logged,
// never thrown, so it cannot turn into a webhook failure and a Stripe retry.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notify';
import { sendEmail } from '@/lib/email';
import { WRAP_OPEN, SIGN_OFF_HTML, SIGN_OFF_TEXT, button, escapeHtml, siteUrl } from '@/lib/coach-application-emails';
import { shapeFirstName, shapeWelcomeText } from '../../mobile-app/src/services/shapeWelcome.mjs';
import { np, phrase, usdOf } from '../../mobile-app/src/services/noticeCopy.mjs';
import { OPEN_SUB_STATUSES } from './coach-trajectory.mjs';

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
export function coachHireEmail(args: { clientName: string; role: CoachRole; clientId: string; monthlyCents?: number | null; site?: string; threadOpen?: boolean }): BuiltEmail {
  const links = coachLinks(args.role, args.clientId, args.site);
  const name = args.clientName.trim() || 'A new client';
  const pay = args.monthlyCents ? ` (${usd(args.monthlyCents)}/mo to you)` : '';
  // ⚠ ONLY WHEN IT OPENED (Codex on #2360). With no thread (open_coach_thread failed, or the database
  // is older than it) the link still opens one from Messages; nothing says a welcome is waiting.
  const lead = args.threadOpen === false
    ? 'Say hello from Messages:'
    : 'Your thread with them is open, with a welcome from Shape at the top. Say hello there:';
  const html = `
    ${WRAP_OPEN}
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:500;">New client: ${escapeHtml(name)}</h2>
      <p style="margin:0 0 16px;line-height:1.55;">${escapeHtml(name)} just subscribed to coaching with you${escapeHtml(pay)}.</p>
      <p style="margin:0 0 12px;line-height:1.55;">${escapeHtml(lead)}</p>
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
    lead,
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

/** The coach's Schedule on the website, where a paid session waits under To schedule. */
export function coachScheduleLink(role: CoachRole, site = siteUrl()): string {
  return `${site}/newdesign/${role === 'nutritionist' ? 'Nutritionist' : 'Trainer'}App.html#schedule`;
}

/** The coach's email when a client pays for a session (fix 3c: M10). */
export function coachPaidSessionEmail(args: { clientName: string; role: CoachRole; clientId: string; coachCents?: number | null; site?: string }): BuiltEmail {
  const links = coachLinks(args.role, args.clientId, args.site);
  const schedule = coachScheduleLink(args.role, args.site);
  const name = args.clientName.trim() || 'A client';
  const pay = args.coachCents ? ` (${usd(args.coachCents)} to you)` : '';
  const html = `
    ${WRAP_OPEN}
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:500;">Session to schedule: ${escapeHtml(name)}</h2>
      <p style="margin:0 0 16px;line-height:1.55;">${escapeHtml(name)} paid for a session with you${escapeHtml(pay)}. It waits on your Schedule, under To schedule, until you book a time with them.</p>
      ${button(schedule, 'Book the session')}
      <p style="margin:0 0 16px;line-height:1.55;">Agree the time in <a href="${escapeHtml(links.thread)}" style="color:#0ac5a8;">your thread with them</a>, and read their screening on <a href="${escapeHtml(links.client)}" style="color:#0ac5a8;">their client page</a> first.</p>
      ${SIGN_OFF_HTML}
    </div>
  `;
  const text = [
    `Session to schedule: ${name}`,
    '',
    `${name} paid for a session with you${pay}. It waits on your Schedule, under To schedule, until you book a time with them.`,
    '',
    `Book the session: ${schedule}`,
    '',
    `Agree the time in your thread with them: ${links.thread}`,
    `Read their screening on their client page first: ${links.client}`,
    '',
    ...SIGN_OFF_TEXT,
  ].join('\n');
  return { subject: `Session to schedule: ${name}`, html, text };
}

/** The member's email when their session is paid (fix 3c: M10). */
export function memberPaidSessionEmail(args: { coachName: string; firstName?: string; site?: string }): BuiltEmail {
  const coach = args.coachName.trim() || 'your coach';
  const first = (args.firstName || '').trim();
  const team = memberTeamLink(args.site);
  const html = `
    ${WRAP_OPEN}
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:500;">Your session with ${escapeHtml(coach)} is paid${first ? `, ${escapeHtml(first)}` : ''}.</h2>
      <p style="margin:0 0 16px;line-height:1.55;">${escapeHtml(coach)} books the time with you. Your thread with them is open in Messages: say when suits you, and you'll get the time and the call link by email once it is booked.</p>
      ${button(team, 'Open your team')}
      ${SIGN_OFF_HTML}
    </div>
  `;
  const text = [
    `Your session with ${coach} is paid${first ? `, ${first}` : ''}.`,
    '',
    `${coach} books the time with you. Your thread with them is open in Messages: say when suits you, and you'll get the time and the call link by email once it is booked.`,
    '',
    `Open your team: ${team}`,
    '',
    ...SIGN_OFF_TEXT,
  ].join('\n');
  return { subject: `Your session with ${coach} is paid`, html, text };
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
        body: out.conversationId
          ? `${shown} subscribed${pay}. Your thread with them is open in Messages; read their screening on their client page before you program.`
          : `${shown} subscribed${pay}. Read their screening on their client page before you program, and say hello from Messages.`,
        // "chat:<id>" opens the thread in the app and on the website (Codex on #2360: "messages"
        // opened nothing in either); with no thread, "client" opens the client's page.
        route: out.conversationId ? `chat:${out.conversationId}` : 'client',
        data: { dedupe: `hire:${a.subscriptionKey}`, clientId: a.clientId, conversationId: out.conversationId, providerRole: a.providerRole, side: 'coach' },
      }, {
        // How the bell and the push say it in the coach's language (noticeCopy.mjs).
        title: np('client.new.title', { client: clientName || phrase('word.aNewClient') }),
        body: np(`client.new.${out.conversationId ? 'bodyThread' : 'bodyNoThread'}${a.monthlyCents ? 'Pay' : ''}`, { client: clientName || phrase('word.aNewClient'), ...(a.monthlyCents ? { amount: usdOf(a.monthlyCents) } : {}) }),
      });
      // Only the call that stored the alert emails: a redelivered event finds the dedupe row.
      if (out.coachAlerted) {
        const to = await emailOf(admin, ownerId);
        if (to) await sendEmail({ to, ...coachHireEmail({ clientName: shown, role: a.providerRole, clientId: a.clientId, monthlyCents: a.monthlyCents, threadOpen: !!out.conversationId }) });
      }
    }

    // Only the call that posted the welcome emails the member: it is posted once per thread.
    if (out.welcomed) {
      const to = await emailOf(admin, a.clientId);
      if (to) await sendEmail({ to, ...memberHireEmail({ coachName, role: a.providerRole, firstName: first }) });
    }

    await tellSharedCoaches(admin, { clientId: a.clientId, clientName, providerRole: a.providerRole, providerId: a.providerId, coachName, ownerId, subscriptionKey: a.subscriptionKey });
  } catch (err) {
    console.error('[coach-thread] startCoaching failed:', err instanceof Error ? err.message : err);
  }
  return out;
}

type CoCoach = { role: CoachRole; name: string; ownerId: string };

/**
 * A client who already has a coach hired another (owner, 2026-10-29: "Both coaches should be
 * notified if they share a client"). Each side is told who the other is, in the bell and by push,
 * and the notice opens the client's page, where the care team and its private coach thread are.
 *
 * The other coaches are every listing with an open subscription from this member (OPEN_SUB_STATUSES,
 * as is_coach_on_client counts it for the care team), one per owner, never the coach just hired. A coach of the same role is told too: the care team
 * lists them since get_client_coaches (2026-10-16).
 *
 * One notice per pair and side, keyed on the new subscription, so a redelivered event sends none.
 * Never throws. Returns how many notices were stored.
 */
export async function tellSharedCoaches(
  admin: SupabaseClient,
  a: { clientId: string; clientName: string; providerRole: CoachRole; providerId: number; coachName: string; ownerId: string | null; subscriptionKey: string },
): Promise<number> {
  let told = 0;
  try {
    if (!a.ownerId) return 0;
    const { data: subs, error } = await admin
      .from('subscriptions')
      .select('provider_role, provider_id')
      .eq('client_id', a.clientId)
      .in('status', OPEN_SUB_STATUSES);
    if (error) {
      console.warn('[coach-thread] co-coach read failed:', error.message);
      return 0;
    }
    const ids: Record<CoachRole, Set<number>> = { trainer: new Set(), nutritionist: new Set() };
    for (const s of (subs ?? []) as { provider_role?: string | null; provider_id?: number | string | null }[]) {
      const role = s.provider_role;
      const id = Number(s.provider_id);
      if ((role !== 'trainer' && role !== 'nutritionist') || !Number.isFinite(id)) continue;
      if (role === a.providerRole && id === a.providerId) continue;
      ids[role].add(id);
    }
    const others: CoCoach[] = [];
    for (const role of ['trainer', 'nutritionist'] as const) {
      if (!ids[role].size) continue;
      const { data, error: listErr } = await admin
        .from(role === 'nutritionist' ? 'nutritionists' : 'trainers')
        .select('id, name, owner_id')
        .in('id', [...ids[role]]);
      if (listErr) {
        console.warn('[coach-thread] co-coach listing read failed:', listErr.message);
        continue;
      }
      for (const p of (data ?? []) as { name?: string | null; owner_id?: string | null }[]) {
        const ownerId = p.owner_id || null;
        // A coach with both listings is one person, and the coach just hired is never their own co-coach.
        if (!ownerId || ownerId === a.ownerId || others.some((o) => o.ownerId === ownerId)) continue;
        others.push({ role, name: String(p.name || '').trim(), ownerId });
      }
    }

    const shown = a.clientName || 'A client';
    const client = a.clientName || phrase('word.aClient');
    const tell = (to: { ownerId: string; role: CoachRole }, about: CoCoach) => {
      const kind = about.role === 'nutritionist' ? 'nutritionist' : 'trainer';
      const lead = about.name ? `${kind} ${about.name}` : `a ${kind}`;
      const key = `client.shared.body${kind === 'nutritionist' ? 'Nutritionist' : 'Trainer'}${about.name ? '' : 'Anon'}`;
      return createNotification(admin, {
        userId: to.ownerId,
        type: 'shared_client',
        title: `Shared client: ${shown}`,
        body: `${shown} now works with you and ${lead}. You can message each other in the care team on their client page.`,
        // "client" with the recipient's own role opens this client in the app they coach them from.
        route: 'client',
        data: { dedupe: `shared:${a.subscriptionKey}:${about.ownerId}`, clientId: a.clientId, providerRole: to.role, counterpartUserId: about.ownerId, counterpartRole: about.role },
      }, {
        title: np('client.shared.title', { client }),
        body: np(key, about.name ? { client, coach: about.name } : { client }),
      });
    };
    for (const other of others) {
      if (await tell({ ownerId: a.ownerId, role: a.providerRole }, other)) told++;
      if (await tell({ ownerId: other.ownerId, role: other.role }, { role: a.providerRole, name: a.coachName, ownerId: a.ownerId })) told++;
    }
  } catch (err) {
    console.error('[coach-thread] tellSharedCoaches failed:', err instanceof Error ? err.message : err);
  }
  return told;
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
    }, { title: np('welcome.title'), body: np('welcome.body') });
    if (!stored) return false;
    const to = await emailOf(admin, clientId);
    if (to) await sendEmail({ to, ...membershipWelcomeEmail({ firstName: first }) });
    return true;
  } catch (err) {
    console.error('[coach-thread] welcomeMember failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

export type PurchaseKind = 'booking' | 'meal_plan' | 'program';
export type CoachPaid = { conversationId: string | null; coachAlerted: boolean; memberTold: boolean };

/**
 * A one-time purchase was saved (fix 3c: M10). `checkoutId` keys every send, so a redelivered
 * event stores no second alert and sends no second email. `coachCents` is what the coach is paid.
 * Never throws.
 */
export async function coachPaid(
  admin: SupabaseClient,
  a: { clientId: string; providerRole: CoachRole; providerId: number; kind: PurchaseKind; checkoutId: string; coachCents?: number | null; itemName?: string | null },
): Promise<CoachPaid> {
  const out: CoachPaid = { conversationId: null, coachAlerted: false, memberTold: false };
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
    const shown = clientName || 'A client';
    const pay = a.coachCents ? ` · ${usd(a.coachCents)} to you` : '';

    if (a.kind !== 'booking') {
      // A product: the coach is told who bought what. No thread and no session: buying a program
      // or a meal plan does not start coaching (fix 2b's rule).
      if (ownerId) {
        const what = (a.itemName || '').trim() || (a.kind === 'program' ? 'a program' : 'a meal plan');
        out.coachAlerted = await createNotification(admin, {
          userId: ownerId,
          type: 'payment',
          title: `Payment received: ${shown}`,
          body: `${shown} bought ${what}${pay}.`,
          route: 'business', // the coach's Business page (data.providerRole names which)
          data: { dedupe: `paid:${a.checkoutId}`, clientId: a.clientId, providerRole: a.providerRole, kind: a.kind },
        }, {
          title: np('payment.product.title', { client: clientName || phrase('word.aClient') }),
          body: np(a.coachCents ? 'payment.product.bodyPay' : 'payment.product.body', {
            client: clientName || phrase('word.aClient'),
            what: (a.itemName || '').trim() || phrase(a.kind === 'program' ? 'payment.aProgram' : 'payment.aMealPlan'),
            ...(a.coachCents ? { amount: usdOf(a.coachCents) } : {}),
          }),
        });
      }
      return out;
    }

    // A paid session: the thread opens (with Shape's welcome, the first time), and the session
    // waits on the coach's Schedule under To schedule until they book it.
    const { data: opened, error: openErr } = await admin.rpc('open_coach_thread', {
      p_client_id: a.clientId,
      p_provider_role: a.providerRole,
      p_provider_id: a.providerId,
      p_welcome: shapeWelcomeText({ client: first, coach: coachName }),
      p_client_name: first || null,
    });
    if (openErr) console.error('[coach-thread] open_coach_thread failed:', openErr.message, (openErr as { code?: string }).code);
    else out.conversationId = ((Array.isArray(opened) ? opened[0] : opened) as { thread_id?: string } | null)?.thread_id ?? null;

    if (ownerId) {
      out.coachAlerted = await createNotification(admin, {
        userId: ownerId,
        type: 'session_paid',
        title: `Session to schedule: ${shown}`,
        body: `${shown} paid for a session${pay}. It waits on your Schedule under To schedule until you book a time with them.`,
        route: 'schedule',
        data: { dedupe: `paid:${a.checkoutId}`, clientId: a.clientId, conversationId: out.conversationId, providerRole: a.providerRole },
      }, {
        title: np('session.paidCoach.title', { client: clientName || phrase('word.aClient') }),
        body: np(a.coachCents ? 'session.paidCoach.bodyPay' : 'session.paidCoach.body', { client: clientName || phrase('word.aClient'), ...(a.coachCents ? { amount: usdOf(a.coachCents) } : {}) }),
      });
      if (out.coachAlerted) {
        const to = await emailOf(admin, ownerId);
        if (to) await sendEmail({ to, ...coachPaidSessionEmail({ clientName: shown, role: a.providerRole, clientId: a.clientId, coachCents: a.coachCents }) });
      }
    }

    out.memberTold = await createNotification(admin, {
      userId: a.clientId,
      type: 'session_paid',
      title: `Your session with ${coachName || 'your coach'} is paid`,
      body: `${coachName || 'Your coach'} books the time with you. Say when suits you in your thread.`,
      // The thread, by id, where they agree the time; with none, the chat.
      route: out.conversationId ? `chat:${out.conversationId}` : 'messages',
      data: { dedupe: `paid-member:${a.checkoutId}`, conversationId: out.conversationId, providerRole: a.providerRole, side: 'client' },
    }, coachName
      ? { title: np('session.paid.title', { coach: coachName }), body: np('session.paid.body', { coach: coachName }) }
      : { title: np('session.paid.titleAnon'), body: np('session.paid.bodyAnon') });
    if (out.memberTold) {
      const to = await emailOf(admin, a.clientId);
      if (to) await sendEmail({ to, ...memberPaidSessionEmail({ coachName, firstName: first }) });
    }
  } catch (err) {
    console.error('[coach-thread] coachPaid failed:', err instanceof Error ? err.message : err);
  }
  return out;
}
