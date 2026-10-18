// A notice for every successful payment, to the member, the coach and the owner (owner,
// 2026-10-18: "all 3").
//
// What already existed, and stays where it is (src/lib/coach-thread.ts):
// - a coach subscription's first payment: the coach's "New client" alert and email, and the
//   member's thread welcome;
// - a one-time purchase: the coach's "Payment received" (a program or meal plan) or "Session to
//   schedule" alert, and the member's "Your session is paid";
// - the membership's first payment: the member's "Welcome to Shape".
//
// What this adds, through announcePayment():
// - THE OWNER: one notice per payment of any kind, the membership and coach sales alike, with what
//   was paid and Shape's fee. Owners are the addresses in admin-access.ts, each found by its
//   confirmed Supabase Auth account (ownerAccountIds), never by a profile's email.
// - THE MEMBER: a receipt for every payment but a paid session, whose "Your session is paid" is
//   its receipt already.
// - THE COACH: a monthly renewal of their client's plan. The first month is the "New client" alert.
//
// Each send is keyed on the Stripe object the payment is (the checkout session, or the renewal's
// invoice) in data.dedupe, so a redelivered event stores nothing twice (notifications_dedupe_uidx).
// In-app and push, like the coach's payment alerts: the push webhook honours mute and the type's
// push switch. Best-effort throughout: the payment is already recorded, and a failed read or send
// is logged, never thrown, so it cannot turn into a webhook failure and a Stripe retry.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notify';
import { getOwnerEmails } from '@/lib/admin-access';

export type CoachRole = 'trainer' | 'nutritionist';
export type PaidFor = 'membership' | 'coaching' | 'booking' | 'program' | 'meal_plan';

export type PaymentNotice = {
  /** The checkout session or invoice id: keys every send. */
  key: string;
  clientId: string;
  /** What the member paid, from the Stripe object (amount_total, amount_paid). */
  amountCents: number;
  paidFor: PaidFor;
  /** A subscription's later month, from invoice.paid; the first is the checkout. */
  renewal: boolean;
  provider?: { role: CoachRole; id: number } | null;
  /** Shape's fee on a coach sale; null where there is none to state (the membership). */
  shapeFeeCents?: number | null;
  /** What the coach is paid, for their renewal notice. */
  coachCents?: number | null;
  /** The plan's own name (coach_plans), never a checkout's caller-supplied text. */
  itemName?: string | null;
};

export type PaymentNotices = { owners: number; member: boolean; coach: boolean };

export function usd(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

/** The member's receipt: none for a paid session, whose own notice says it is paid. */
export function memberGetsReceipt(p: Pick<PaymentNotice, 'paidFor'>): boolean {
  return p.paidFor !== 'booking';
}

/** The coach hears of a renewal of their plan; every first payment already alerts them. */
export function coachGetsRenewal(p: Pick<PaymentNotice, 'paidFor' | 'renewal' | 'provider'>): boolean {
  return p.renewal && p.paidFor === 'coaching' && !!p.provider;
}

function product(p: Pick<PaymentNotice, 'paidFor' | 'itemName'>): string {
  const name = (p.itemName || '').trim();
  if (name) return name;
  return p.paidFor === 'program' ? 'a program' : 'a meal plan';
}

/** The owner's notice. `client` and `coach` are names as read, '' when there is none. */
export function ownerNotice(p: PaymentNotice, client: string, coach: string): { title: string; body: string } {
  const who = client || 'A member';
  const by = coach || 'a coach';
  const fee = p.shapeFeeCents == null
    ? ''
    : p.shapeFeeCents > 0 ? ` Shape's fee: ${usd(p.shapeFeeCents)}.` : ' No Shape fee on this one.';
  let what: string;
  switch (p.paidFor) {
    case 'membership':
      what = p.renewal ? 'Shape membership, a monthly renewal.' : 'Shape membership, the first month.';
      break;
    case 'coaching':
      what = `${coach ? `${coach}'s` : "A coach's"} monthly plan, ${p.renewal ? 'a monthly renewal' : 'the first month'}.`;
      break;
    case 'booking':
      what = `A session with ${by}.`;
      break;
    default:
      what = `${product(p).replace(/^a /, 'A ')} from ${by}.`;
  }
  return { title: `${usd(p.amountCents)} from ${who}`, body: `${what}${fee}` };
}

/** The member's receipt. `coach` is the coach's name as read, '' when there is none. */
export function memberReceipt(p: PaymentNotice, coach: string): { title: string; body: string } {
  const by = coach || 'your coach';
  let body: string;
  switch (p.paidFor) {
    case 'membership':
      body = p.renewal ? 'Your Shape membership renewed for another month.' : 'Your Shape membership is paid for its first month.';
      break;
    case 'coaching':
      body = p.renewal ? `Your monthly plan with ${by} renewed for another month.` : `Your monthly plan with ${by} is paid for its first month.`;
      break;
    default:
      body = `You bought ${product(p)} from ${by}.`;
  }
  return { title: `Payment received: ${usd(p.amountCents)}`, body };
}

/** The coach's renewal notice. `client` is the client's name as read, '' when there is none. */
export function coachRenewal(p: PaymentNotice, client: string): { title: string; body: string } {
  const who = client || 'A client';
  const pay = p.coachCents ? ` · ${usd(p.coachCents)} to you` : '';
  return { title: `Monthly payment: ${who}`, body: `${who}'s monthly plan renewed${pay}.` };
}

/**
 * The owners' accounts, found by their sign-in identity (admin_account_by_email reads auth.users;
 * the service role only), never by profiles.email: a profile is created best effort and can be
 * missing, and it keeps the first address after an email change (Codex on #2402). An account
 * counts once its address is confirmed. One owner that can't be read leaves the others told.
 */
export async function ownerAccountIds(admin: SupabaseClient): Promise<string[]> {
  const found = await Promise.all(getOwnerEmails().map(async (email) => {
    const { data, error } = await admin.rpc('admin_account_by_email', { p_email: email });
    if (error) {
      console.error('[payment-notices] owner account not read:', error.message);
      return null;
    }
    const account = (Array.isArray(data) ? data[0] : data) as { id?: string | null; email_confirmed_at?: string | null } | null;
    return account?.id && account.email_confirmed_at ? account.id : null;
  }));
  return found.filter((id): id is string => !!id);
}

async function nameOf(admin: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await admin.from('profiles').select('full_name').eq('id', userId).maybeSingle();
  if (error) console.warn('[payment-notices] client name read failed:', error.message);
  return String((data as { full_name?: string | null } | null)?.full_name || '').trim();
}

async function coachOf(admin: SupabaseClient, provider: PaymentNotice['provider']): Promise<{ name: string; ownerId: string | null }> {
  if (!provider) return { name: '', ownerId: null };
  const { data, error } = await admin
    .from(provider.role === 'nutritionist' ? 'nutritionists' : 'trainers')
    .select('name, owner_id')
    .eq('id', provider.id)
    .maybeSingle();
  if (error) console.warn('[payment-notices] coach read failed:', error.message);
  const row = data as { name?: string | null; owner_id?: string | null } | null;
  return { name: String(row?.name || '').trim(), ownerId: row?.owner_id || null };
}

/** A payment went through and is recorded: tell the owners, the member and (on a renewal) the coach. Never throws. */
export async function announcePayment(admin: SupabaseClient, p: PaymentNotice): Promise<PaymentNotices> {
  const out: PaymentNotices = { owners: 0, member: false, coach: false };
  // A $0 checkout (a trial, or credit that covered it all) moved no money; its first real charge
  // is a renewal invoice.
  if (!p.key || !p.clientId || !(p.amountCents > 0)) return out;
  try {
    const [client, coach, owners] = await Promise.all([nameOf(admin, p.clientId), coachOf(admin, p.provider), ownerAccountIds(admin)]);
    const role = p.provider?.role ?? null;

    const toOwner = ownerNotice(p, client, coach.name);
    for (const ownerId of owners) {
      const stored = await createNotification(admin, {
        userId: ownerId,
        type: 'platform_payment',
        ...toOwner,
        data: { dedupe: `pay:${p.key}`, clientId: p.clientId, paidFor: p.paidFor, renewal: p.renewal, amountCents: p.amountCents, providerRole: role, providerId: p.provider?.id ?? null, side: 'owner' },
      });
      if (stored) out.owners += 1;
    }

    if (memberGetsReceipt(p)) {
      out.member = await createNotification(admin, {
        userId: p.clientId,
        type: 'payment_receipt',
        ...memberReceipt(p, coach.name),
        data: { dedupe: `receipt:${p.key}`, paidFor: p.paidFor, renewal: p.renewal, amountCents: p.amountCents, providerRole: role, side: 'client' },
      });
    }

    if (coachGetsRenewal(p) && coach.ownerId) {
      out.coach = await createNotification(admin, {
        userId: coach.ownerId,
        type: 'payment',
        ...coachRenewal(p, client),
        data: { dedupe: `renewal:${p.key}`, clientId: p.clientId, providerRole: role, side: 'coach' },
      });
    }
  } catch (err) {
    console.error('[payment-notices] announcePayment failed:', err instanceof Error ? err.message : err);
  }
  return out;
}
