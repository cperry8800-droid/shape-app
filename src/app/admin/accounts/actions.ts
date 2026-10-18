'use server';

// The account page's changes (src/app/admin/accounts/[id]/page.tsx) and the requests queue's
// (src/app/admin/requests/page.tsx). Who may do each is ACCOUNT_ACTION_LEVELS
// (src/lib/admin-account-actions.mjs): freezing and requests from Support, suspending a listing
// and removing an account from Admin. Nobody acts on their own account or an owner's, and only
// an owner acts on another staff member's (accountRefusal).
//
// Every change is logged BEFORE it runs (src/lib/admin-activity.mjs): a change whose log row
// cannot be written does not run, and the row is then marked done or failed.
//
// FREEZING IS TWO SYSTEMS, SO THE ORDER IS CHOSEN FOR THE FAILURE:
//   freeze    the Supabase Auth ban first (no device can sign in or renew a session from then
//             on), then admin_freeze_account (the record, the listings, the sessions; one
//             transaction). If that fails, the ban is lifted again, so an account is never
//             locked out with no record of why.
//   unfreeze  the ban lifted first, then admin_unfreeze_account. If that fails, the ban is put
//             back, so the records and the account still agree: frozen.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEnvAdminEmails, getOwnerEmails, requireStaff, type StaffMember } from '@/lib/admin-access';
import { resolveStaffLevel } from '@/lib/staff-levels.mjs';
import { finishActivity, startActivity } from '@/lib/admin-activity.mjs';
import {
  accountRefusal,
  cancelSubscriptions,
  cleanNote,
  cleanReason,
  confirmsRemoval,
  parseRequestOutcome,
  subscriptionsToCancel,
} from '@/lib/admin-account-actions.mjs';
import { eraseAccount } from '@/lib/account-erasure';
import { stripe } from '@/lib/stripe';

type Db = ReturnType<typeof createAdminClient>;
type Target = { id: string; email: string | null; email_confirmed_at: string | null; banned: boolean };
type Role = 'trainer' | 'nutritionist';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MISSING = new Set(['42P01', 'PGRST205', 'PGRST202', '42883']);
// A freeze lasts until someone unfreezes it: Supabase takes a duration, so it is a hundred years.
const FREEZE_BAN = '876000h';
const MEMBERS = '/admin/members';
const REQUESTS = '/admin/requests';

function accountPage(id: string): string {
  return `/admin/accounts/${id}`;
}

function uuidFrom(formData: FormData, key = 'user_id'): string {
  const v = String(formData.get(key) ?? '').trim();
  return UUID_RE.test(v) ? v.toLowerCase() : '';
}

function roleFrom(formData: FormData): Role | '' {
  const v = String(formData.get('role') ?? '');
  return v === 'trainer' || v === 'nutritionist' ? v : '';
}

function failure(error: { code?: string | null } | null | undefined, fallback: string): string {
  return error && MISSING.has(String(error.code)) ? 'missing_migration' : fallback;
}

/**
 * The account being acted on, after the refusals: redirects back with an error for an unknown
 * account, a failed lookup, or one this staff member may not act on.
 */
async function loadTarget(db: Db, staff: StaffMember, id: string, back: string): Promise<Target> {
  const { data, error } = await db.auth.admin.getUserById(id);
  if (error || !data?.user) {
    redirect(`${back}?error=${(error as { status?: number } | null)?.status === 404 || !error ? 'no_account' : 'lookup_failed'}`);
  }
  const user = data.user;
  // Their own staff level decides whether anyone but an owner may act on them. A failed read is
  // not "no level": it refuses.
  const { data: row, error: staffError } = await db
    .from('staff_members')
    .select('level')
    .eq('user_id', id)
    .maybeSingle<{ level: string }>();
  if (staffError && !MISSING.has(String(staffError.code))) redirect(`${back}?error=lookup_failed`);
  const targetStaffLevel = resolveStaffLevel({
    email: user.email,
    confirmed: true,
    ownerEmails: getOwnerEmails(),
    adminEmails: getEnvAdminEmails(),
    tableLevel: row?.level ?? null,
  });
  const refusal = accountRefusal({
    actorId: staff.id,
    actorLevel: staff.level,
    targetId: user.id,
    targetEmail: user.email,
    ownerEmails: getOwnerEmails(),
    targetStaffLevel,
  });
  if (refusal) redirect(`${back}?error=refused_${refusal}`);
  const bannedUntil = Date.parse(String((user as { banned_until?: string | null }).banned_until ?? ''));
  return {
    id: user.id,
    email: user.email ?? null,
    email_confirmed_at: user.email_confirmed_at ?? null,
    banned: Number.isFinite(bannedUntil) && bannedUntil > Date.now(),
  };
}

async function openFreeze(db: Db, id: string, back: string): Promise<boolean> {
  const { data, error } = await db.from('account_freezes').select('id').eq('user_id', id).is('unfrozen_at', null).maybeSingle();
  if (error) redirect(`${back}?error=${failure(error, 'lookup_failed')}`);
  return Boolean(data);
}

export async function freezeAccount(formData: FormData): Promise<void> {
  const staff = await requireStaff('support');
  const id = uuidFrom(formData);
  if (!id) redirect(`${MEMBERS}?error=missing_account`);
  const back = accountPage(id);
  const reason = cleanReason(formData.get('reason'));
  if (!reason) redirect(`${back}?error=reason`);

  const db = createAdminClient();
  const target = await loadTarget(db, staff, id, back);
  if (await openFreeze(db, id, back)) redirect(`${back}?updated=already_frozen`);

  const log = await startActivity(db, staff, {
    action: 'account.freeze',
    targetUserId: id,
    targetEmail: target.email,
    details: { reason },
  });
  if (log.error) redirect(`${back}?error=${log.error}`);

  const ban = await db.auth.admin.updateUserById(id, { ban_duration: FREEZE_BAN });
  if (ban.error) {
    await finishActivity(db, log.id, 'failed');
    redirect(`${back}?error=freeze_failed`);
  }
  const { data, error } = await db.rpc('admin_freeze_account', {
    p_user: id,
    p_reason: reason,
    p_by: staff.id,
    p_by_email: staff.email,
  });
  const status = (data as { status?: string } | null)?.status;
  if (error || (status !== 'frozen' && status !== 'already')) {
    const undo = await db.auth.admin.updateUserById(id, { ban_duration: 'none' });
    await finishActivity(db, log.id, 'failed');
    // ⚠ Codex, #2326: a rollback that fails too leaves the account banned with no freeze on
    // record. Say so; the account page offers both ways out (freeze again to record it, or lift
    // the ban), since it reads the ban from Auth, not from the record.
    if (undo.error) redirect(`${back}?error=freeze_split`);
    redirect(`${back}?error=${failure(error, 'freeze_failed')}`);
  }
  // 'already': another staff member froze it a moment earlier; theirs is the freeze on record.
  await finishActivity(db, log.id, status === 'frozen' ? 'done' : 'failed');

  revalidatePath(back);
  redirect(`${back}?updated=${status === 'frozen' ? 'frozen' : 'already_frozen'}`);
}

export async function unfreezeAccount(formData: FormData): Promise<void> {
  const staff = await requireStaff('support');
  const id = uuidFrom(formData);
  if (!id) redirect(`${MEMBERS}?error=missing_account`);
  const back = accountPage(id);

  const db = createAdminClient();
  const target = await loadTarget(db, staff, id, back);
  // A ban with no freeze on record (a freeze whose rollback failed, or a ban set outside the
  // console) is lifted here too; the records then have nothing to close ('not_frozen').
  if (!(await openFreeze(db, id, back)) && !target.banned) redirect(`${back}?updated=not_frozen`);

  const log = await startActivity(db, staff, { action: 'account.unfreeze', targetUserId: id, targetEmail: target.email });
  if (log.error) redirect(`${back}?error=${log.error}`);

  const unban = await db.auth.admin.updateUserById(id, { ban_duration: 'none' });
  if (unban.error) {
    await finishActivity(db, log.id, 'failed');
    redirect(`${back}?error=unfreeze_failed`);
  }
  const { data, error } = await db.rpc('admin_unfreeze_account', { p_user: id, p_by_email: staff.email });
  const status = (data as { status?: string } | null)?.status;
  if (error || (status !== 'unfrozen' && status !== 'not_frozen')) {
    const reban = await db.auth.admin.updateUserById(id, { ban_duration: FREEZE_BAN });
    await finishActivity(db, log.id, 'failed');
    // The records still say frozen; Unfreeze again finishes it.
    redirect(`${back}?error=${reban.error ? 'unfreeze_split' : 'unfreeze_failed'}`);
  }
  // 'not_frozen' after a ban with no record: the ban is lifted, which is the change asked for.
  const lifted = status === 'unfrozen' || target.banned;
  await finishActivity(db, log.id, lifted ? 'done' : 'failed');

  revalidatePath(back);
  redirect(`${back}?updated=${status === 'unfrozen' ? 'unfrozen' : target.banned ? 'ban_lifted' : 'not_frozen'}`);
}

/** The listing named by the form, checked to belong to the account the form names. */
async function loadListing(db: Db, formData: FormData, back: string, userId: string) {
  const role = roleFrom(formData);
  const listingId = Number(formData.get('listing_id'));
  if (!role || !Number.isSafeInteger(listingId) || listingId < 1) redirect(`${back}?error=no_listing`);
  const { data, error } = await db
    .from(role === 'trainer' ? 'trainers' : 'nutritionists')
    .select('id, name, owner_id')
    .eq('id', listingId)
    .maybeSingle<{ id: number; name: string | null; owner_id: string | null }>();
  if (error) redirect(`${back}?error=lookup_failed`);
  if (!data || data.owner_id !== userId) redirect(`${back}?error=no_listing`);
  return { role, id: data.id, name: data.name };
}

export async function suspendListing(formData: FormData): Promise<void> {
  const staff = await requireStaff('admin');
  const id = uuidFrom(formData);
  if (!id) redirect(`${MEMBERS}?error=missing_account`);
  const back = accountPage(id);
  const reason = cleanReason(formData.get('reason'));
  if (!reason) redirect(`${back}?error=reason`);

  const db = createAdminClient();
  const target = await loadTarget(db, staff, id, back);
  const listing = await loadListing(db, formData, back, id);

  const log = await startActivity(db, staff, {
    action: 'listing.suspend',
    targetUserId: id,
    targetEmail: target.email,
    details: { role: listing.role, listing_id: listing.id, name: listing.name, reason },
  });
  if (log.error) redirect(`${back}?error=${log.error}`);

  const { data, error } = await db.rpc('admin_suspend_listing', {
    p_role: listing.role,
    p_id: listing.id,
    p_reason: reason,
    p_source: 'admin',
    p_by: staff.id,
    p_by_email: staff.email,
  });
  await finishActivity(db, log.id, !error && data === 'suspended' ? 'done' : 'failed');
  if (error) redirect(`${back}?error=${failure(error, 'suspend_failed')}`);
  if (data === 'already') redirect(`${back}?updated=already_suspended`);
  if (data !== 'suspended') redirect(`${back}?error=no_listing`);

  revalidatePath(back);
  redirect(`${back}?updated=suspended`);
}

export async function liftListing(formData: FormData): Promise<void> {
  const staff = await requireStaff('admin');
  const id = uuidFrom(formData);
  if (!id) redirect(`${MEMBERS}?error=missing_account`);
  const back = accountPage(id);

  const db = createAdminClient();
  const target = await loadTarget(db, staff, id, back);
  const listing = await loadListing(db, formData, back, id);

  const log = await startActivity(db, staff, {
    action: 'listing.lift',
    targetUserId: id,
    targetEmail: target.email,
    details: { role: listing.role, listing_id: listing.id, name: listing.name },
  });
  if (log.error) redirect(`${back}?error=${log.error}`);

  const { data, error } = await db.rpc('admin_lift_listing', {
    p_role: listing.role,
    p_id: listing.id,
    p_by_email: staff.email,
    p_source: 'admin',
  });
  await finishActivity(db, log.id, !error && data === 'lifted' ? 'done' : 'failed');
  if (error) redirect(`${back}?error=${failure(error, 'lift_failed')}`);
  // A freeze's suspension ends when the account is unfrozen, not here.
  if (data === 'other_source') redirect(`${back}?error=lift_frozen`);
  if (data === 'not_suspended') redirect(`${back}?updated=not_suspended`);
  if (data !== 'lifted') redirect(`${back}?error=no_listing`);

  revalidatePath(back);
  redirect(`${back}?updated=lifted`);
}

type BillingRow = { stripe_subscription_id: string | null; status: string | null; stripe_account_id?: string | null };
type BillingRead = PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;

/**
 * Coaching subscriptions, each with the account it lives on (stripe_account_id: a coach's own
 * account for a direct charge, null for the platform), so a removal cancels each where it is. A
 * database before the 2026-10-18 migration has no such column: the rows are read without it and
 * carry no account at all, which cancelSubscriptions reads as "not known" and treats strictly.
 */
async function coachingBilling(read: (cols: string) => BillingRead): Promise<{ data: BillingRow[] | null; error: unknown }> {
  const withAccount = await read('stripe_subscription_id, status, stripe_account_id');
  if (!withAccount.error) {
    return { data: ((withAccount.data ?? []) as BillingRow[]).map((r) => ({ ...r, stripe_account_id: r.stripe_account_id ?? null })), error: null };
  }
  if (withAccount.error.code !== '42703' && withAccount.error.code !== 'PGRST204') return { data: null, error: withAccount.error };
  const before = await read('stripe_subscription_id, status');
  if (before.error) return { data: null, error: before.error };
  return { data: ((before.data ?? []) as BillingRow[]).map((r) => ({ stripe_subscription_id: r.stripe_subscription_id, status: r.status })), error: null };
}

/**
 * Removes an account: every Stripe subscription that can still charge on it is cancelled first
 * (their Shape membership, their coaches, and their own clients' subscriptions to their
 * listings), and only when all of them are does the erasure run, the same one a member's own
 * deletion runs (src/lib/account-erasure.ts).
 */
export async function removeAccount(formData: FormData): Promise<void> {
  const staff = await requireStaff('admin');
  const id = uuidFrom(formData);
  if (!id) redirect(`${MEMBERS}?error=missing_account`);
  const back = accountPage(id);

  const db = createAdminClient();
  const target = await loadTarget(db, staff, id, back);
  if (!confirmsRemoval(formData.get('confirm'), target)) redirect(`${back}?error=confirm`);

  const [membership, coaching, trainers, nutritionists] = await Promise.all([
    db.from('platform_subscriptions').select('stripe_subscription_id, status').eq('client_id', id),
    coachingBilling((cols) => db.from('subscriptions').select(cols).eq('client_id', id)),
    db.from('trainers').select('id').eq('owner_id', id),
    db.from('nutritionists').select('id').eq('owner_id', id),
  ]);
  if (membership.error || coaching.error || trainers.error || nutritionists.error) redirect(`${back}?error=billing_read_failed`);
  // The membership is sold on Shape's own account only: its account is known, the platform.
  const billing: BillingRow[] = [
    ...((membership.data ?? []) as BillingRow[]).map((r) => ({ ...r, stripe_account_id: null })),
    ...(coaching.data ?? []),
  ];
  for (const [role, rows] of [
    ['trainer', trainers.data ?? []],
    ['nutritionist', nutritionists.data ?? []],
  ] as const) {
    const ids = rows.map((r) => r.id);
    if (!ids.length) continue;
    const { data, error } = await coachingBilling((cols) => db
      .from('subscriptions')
      .select(cols)
      .eq('provider_role', role)
      .in('provider_id', ids));
    if (error) redirect(`${back}?error=billing_read_failed`);
    billing.push(...(data ?? []));
  }
  const toCancel = subscriptionsToCancel(billing);

  const log = await startActivity(db, staff, {
    action: 'account.remove',
    targetUserId: id,
    targetEmail: target.email,
    details: { subscriptions: toCancel.length },
  });
  if (log.error) redirect(`${back}?error=${log.error}`);

  const cancelled = await cancelSubscriptions(stripe, toCancel);
  if (cancelled.failed.length) {
    await finishActivity(db, log.id, 'failed');
    redirect(`${back}?error=billing_not_cancelled`);
  }

  const result = await eraseAccount(db, target, { by: staff.email });
  await finishActivity(db, log.id, result.ok ? 'done' : 'failed');
  if (!result.ok) redirect(`${back}?error=erase_${result.stage ?? 'failed'}`);

  revalidatePath(MEMBERS);
  revalidatePath('/admin/coaches');
  redirect(`${MEMBERS}?updated=removed`);
}

/** Marks a member's Pause / Export / Delete request done or declined, with an optional note. */
export async function handleRequest(formData: FormData): Promise<void> {
  const staff = await requireStaff('support');
  const requestId = uuidFrom(formData, 'request_id');
  const outcome = parseRequestOutcome(formData.get('outcome'));
  const back = String(formData.get('back') ?? '') === 'account' && uuidFrom(formData) ? accountPage(uuidFrom(formData)) : REQUESTS;
  if (!requestId || !outcome) redirect(`${back}?error=no_request`);
  const note = cleanNote(formData.get('note'));

  const db = createAdminClient();
  const { data: row, error: readError } = await db
    .from('account_action_requests')
    .select('id, user_id, action, status')
    .eq('id', requestId)
    .maybeSingle<{ id: string; user_id: string | null; action: string; status: string }>();
  if (readError) redirect(`${back}?error=${failure(readError, 'lookup_failed')}`);
  if (!row) redirect(`${back}?error=no_request`);
  if (row.status !== 'open') redirect(`${back}?updated=already_handled`);

  let email: string | null = null;
  if (row.user_id) {
    const { data } = await db.auth.admin.getUserById(row.user_id);
    email = data?.user?.email ?? null;
  }
  const log = await startActivity(db, staff, {
    action: `request.${outcome}`,
    targetUserId: row.user_id,
    targetEmail: email,
    details: { action: row.action, request_id: row.id, ...(note ? { note } : {}) },
  });
  if (log.error) redirect(`${back}?error=${log.error}`);

  // Only while still open: two staff working the queue at once cannot both close one request.
  const { data: closed, error } = await db
    .from('account_action_requests')
    .update({ status: outcome, note: note || null, handled_by_email: staff.email, handled_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('status', 'open')
    .select('id');
  const changed = !error && Array.isArray(closed) && closed.length === 1;
  await finishActivity(db, log.id, changed ? 'done' : 'failed');
  if (error) redirect(`${back}?error=save_failed`);
  if (!changed) redirect(`${back}?updated=already_handled`);

  revalidatePath(REQUESTS);
  if (row.user_id) revalidatePath(accountPage(row.user_id));
  redirect(`${back}?updated=${outcome}`);
}
