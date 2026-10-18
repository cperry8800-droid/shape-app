// What a member is told on the page Stripe returns them to (client-onboarding review, fix 3c: M11).
//
// ⚠ BOTH RETURN PAGES SAID THE PAYMENT HAD GONE THROUGH WITHOUT LOOKING. /purchase/success read
// "your payment went through … the provider will reach out shortly" and /subscribe/success "Payment
// confirmed", whatever the checkout's state: a bank debit still clearing, a session that never
// completed, a link opened by someone else. This reads the checkout from Stripe and says only what
// it shows, for the signed-in member it belongs to.
//
// Read by src/app/purchase/success/page.tsx and src/app/subscribe/success/page.tsx.

import { stripe } from '@/lib/stripe';
import { acctOpts, isAccountId, madeByShape } from '@/lib/stripe-connect';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type ReturnKind = 'subscription' | 'membership' | 'booking' | 'meal_plan' | 'program';

export type CheckoutReturn =
  | { state: 'paid' | 'processing'; kind: ReturnKind; coachName: string; itemName: string | null }
  | { state: 'not_paid' }
  | { state: 'failed' }
  | { state: 'unconfirmed' };

/** A Checkout Session id as Stripe writes it into the return address. */
export function isCheckoutId(v: unknown): v is string {
  return typeof v === 'string' && /^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(v);
}

/** The kind of purchase a checkout was, from what our checkouts write on it. */
export function returnKind(s: { mode?: string | null; metadata?: Record<string, string> | null }): ReturnKind {
  const m = s.metadata || {};
  if (s.mode === 'subscription') return m.plan === 'shape_platform' ? 'membership' : 'subscription';
  return m.kind === 'meal_plan' || m.kind === 'program' ? m.kind : 'booking';
}

/**
 * A completed checkout whose bank debit was turned down. ⚠ STRIPE KEEPS IT "COMPLETE" AND "UNPAID",
 * exactly as while the debit is still clearing (Fable on #2373), so the page told someone whose
 * payment had bounced that it was processing and there was nothing more to do. Only the payment
 * itself tells them apart: a payment intent back at requires_payment_method or canceled, or (a
 * subscription's first invoice) a subscription that expired incomplete. Anything else, including
 * no expanded object, is still processing.
 */
export function debitFailed(s: { payment_intent?: unknown; subscription?: unknown }): boolean {
  const pi = s.payment_intent && typeof s.payment_intent === 'object' ? (s.payment_intent as { status?: string }) : null;
  if (pi) return pi.status === 'requires_payment_method' || pi.status === 'canceled';
  const sub = s.subscription && typeof s.subscription === 'object' ? (s.subscription as { status?: string }) : null;
  if (sub) return sub.status === 'incomplete_expired' || sub.status === 'canceled';
  return false;
}

type CoachOnAccount = { role: 'trainer' | 'nutritionist'; id: number };

/**
 * The coaches whose connected account `acct` is (none, or a trainer and a nutritionist listing of
 * one person). ⚠ The return address is the buyer's to edit: an `acct` is honoured only when it is
 * a coach's account on record, so the page never reads a checkout from an account Shape does not
 * pay coaches through.
 */
async function coachesOnAccount(acct: string): Promise<CoachOnAccount[]> {
  const admin = createAdminClient();
  const out: CoachOnAccount[] = [];
  for (const role of ['trainer', 'nutritionist'] as const) {
    const { data, error } = await admin
      .from(role === 'trainer' ? 'trainers' : 'nutritionists')
      .select('id')
      .eq('stripe_account_id', acct)
      .maybeSingle();
    if (error) throw error;
    const id = Number((data as { id?: unknown } | null)?.id);
    if (Number.isSafeInteger(id) && id > 0) out.push({ role, id });
  }
  return out;
}

/**
 * The checkout `sessionId`, as its buyer may see it. `unconfirmed` covers everything that is not a
 * clear answer (no id, someone else's, Stripe unreachable): the page then claims nothing.
 * ⚠ SIGNED OUT IS NOT "UNCONFIRMED". A member paying from the app returns here in a browser that is
 * often not signed in. They hold the checkout's id, which only its return address carries, so the
 * page says where the payment stands, without the coach's or the item's name.
 * `acct` (the return address's `&acct=`) is the coach's connected account a direct-charge checkout
 * was made on. It is read from there only when it is a coach's account on record, and only a
 * checkout naming that same coach is described; absent, the checkout is read from Shape's account.
 */
export async function readCheckoutReturn(sessionId: unknown, acct?: unknown): Promise<CheckoutReturn> {
  if (!isCheckoutId(sessionId)) return { state: 'unconfirmed' };
  let account: string | null = null;
  let accountCoaches: CoachOnAccount[] = [];
  if (acct !== undefined && acct !== null && acct !== '') {
    if (!isAccountId(acct)) return { state: 'unconfirmed' };
    try {
      accountCoaches = await coachesOnAccount(acct);
    } catch (err) {
      console.error('[checkout-return] coach account read failed', err instanceof Error ? err.message : err);
      return { state: 'unconfirmed' };
    }
    if (!accountCoaches.length) return { state: 'unconfirmed' };
    account = acct;
  }
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }

  let s: Awaited<ReturnType<typeof stripe.checkout.sessions.retrieve>>;
  try {
    s = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent', 'subscription'] }, acctOpts(account));
  } catch (err) {
    console.error('[checkout-return] session read failed', err instanceof Error ? err.message : err);
    return { state: 'unconfirmed' };
  }
  // A signed-in account that did not buy it is told nothing about it.
  const owner = s.client_reference_id || s.metadata?.client_id || null;
  if (userId && owner !== userId) return { state: 'unconfirmed' };
  // A checkout on a coach's account is described only when it names that coach: one the coach
  // made for themselves, naming someone else, is not Shape's to vouch for.
  if (account && !accountCoaches.some((c) => s.metadata?.provider_role === c.role && Number(s.metadata?.provider_id) === c.id)) {
    return { state: 'unconfirmed' };
  }
  // ⚠ AND ONLY WHEN SHAPE MADE IT (Codex on #2401). The coach can make and pay a checkout of their
  // own naming themselves; the webhook's origin guard refuses it, so the page must not call it
  // paid either. Its PaymentIntent or Subscription carries the application that made it.
  if (account) {
    const made = s.mode === 'subscription' ? s.subscription : s.payment_intent;
    const application = made && typeof made === 'object' ? (made as { application?: unknown }).application : undefined;
    if (!madeByShape(application)) return { state: 'unconfirmed' };
  }

  if (s.status !== 'complete') return { state: 'not_paid' };
  const paid = s.payment_status === 'paid' || s.payment_status === 'no_payment_required';
  if (!paid && debitFailed(s)) return { state: 'failed' };
  const kind = returnKind({ mode: s.mode, metadata: s.metadata as Record<string, string> | null });

  if (!userId) return { state: paid ? 'paid' : 'processing', kind, coachName: '', itemName: null };

  let coachName = '';
  const role = s.metadata?.provider_role;
  const providerId = Number(s.metadata?.provider_id);
  if ((role === 'trainer' || role === 'nutritionist') && Number.isInteger(providerId) && providerId > 0) {
    try {
      const { data } = await createAdminClient()
        .from(role === 'trainer' ? 'trainers' : 'nutritionists')
        .select('name')
        .eq('id', providerId)
        .maybeSingle();
      coachName = String((data as { name?: string | null } | null)?.name || '').trim();
    } catch {
      /* the page says "your coach" */
    }
  }
  const itemName = String(s.metadata?.item_name || '').trim() || null;
  return { state: paid ? 'paid' : 'processing', kind, coachName, itemName };
}

const TEAM = '/newdesign/ClientApp.html#team';
const LIBRARY = '/newdesign/ClientApp.html#library';
const HOME = '/newdesign/ClientApp.html';

/** What the page says for a result: its title, its line, and where its one button goes. */
export function checkoutReturnCopy(r: CheckoutReturn): { title: string; body: string; cta: { href: string; label: string } } {
  if (r.state === 'not_paid') {
    return {
      title: "This checkout wasn't completed",
      body: 'Nothing was charged. You can start again from the coach’s page whenever you like.',
      cta: { href: HOME, label: 'Back to Shape' },
    };
  }
  if (r.state === 'failed') {
    return {
      title: "Your payment didn't go through",
      body: 'Your bank turned it down, so nothing was charged and nothing has started. You can try again from the coach’s page.',
      cta: { href: HOME, label: 'Back to Shape' },
    };
  }
  if (r.state === 'unconfirmed') {
    return {
      title: "We couldn't confirm this payment here",
      body: 'If you paid, Stripe has emailed you a receipt, and it shows on your Team page within a few minutes.',
      cta: { href: TEAM, label: 'Open your team' },
    };
  }
  // Signed out, the page names no one (readCheckoutReturn), so a line that opens on the coach
  // opens on "Your coach".
  const coach = r.coachName || 'your coach';
  const Coach = r.coachName || 'Your coach';
  if (r.state === 'processing') {
    return {
      title: 'Your payment is processing',
      body: `Your bank is still confirming it. Nothing more to do: we'll let you know in the app and by email when it clears, and ${coach} hears about it then.`,
      cta: { href: HOME, label: 'Back to Shape' },
    };
  }
  switch (r.kind) {
    case 'subscription':
      return {
        title: `You're working with ${coach}`,
        body: `Your payment went through and your subscription is active. Your thread with ${coach} opens in Messages in a moment, with a welcome from Shape: say hello and tell them what you want from the first week.`,
        cta: { href: TEAM, label: 'Open your team' },
      };
    case 'booking':
      return {
        title: `Your session with ${coach} is paid`,
        body: `${Coach} books the time with you. Say when suits you in your thread; you'll get the time and the call link by email once it's booked.`,
        cta: { href: TEAM, label: `Message ${coach}` },
      };
    case 'membership':
      return {
        title: 'Your membership is active',
        body: 'Your plan, your log and the community are open to you now.',
        cta: { href: HOME, label: 'Open Shape' },
      };
    default:
      return {
        title: `${r.itemName || (r.kind === 'program' ? 'Your program' : 'Your meal plan')} is yours`,
        body: 'Your payment went through. It is in your Library now.',
        cta: { href: LIBRARY, label: 'Open your Library' },
      };
  }
}
