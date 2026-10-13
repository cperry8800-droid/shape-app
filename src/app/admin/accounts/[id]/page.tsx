// One account, everything the console knows about it, and what staff can do to it: freeze or
// unfreeze it (Support and up), suspend or put back one of its coach listings, remove it (Admin
// and up), and close its Pause / Export / Delete requests. Reached from the Members and Coaches
// pages. The changes are ./../actions.ts; the rules are src/lib/admin-account-actions.mjs.
//
// OPENING THE PAGE IS LOGGED ('account.view'), BEFORE ANYTHING IS READ: one person's record is
// shown only once the log row naming the staff member is written. Counts only for activity:
// admin_account_detail() returns no health value.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getEnvAdminEmails, getOwnerEmails, requireStaff, type StaffMember } from '@/lib/admin-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { finishActivity, startActivity } from '@/lib/admin-activity.mjs';
import { formatCount, formatMoney, tierName } from '@/lib/admin-overview.mjs';
import { LEVEL_LABELS, resolveStaffLevel, type StaffLevel } from '@/lib/staff-levels.mjs';
import { accountRefusal, canDoAccountAction, REASON_MAX, REASON_MIN } from '@/lib/admin-account-actions.mjs';
import { freezeAccount, handleRequest, liftListing, removeAccount, suspendListing, unfreezeAccount } from '../actions';
import { ACCOUNT_MIGRATION_FILE, formatWhen, MIGRATION_FILE, Notice } from '../../ui';

export const metadata = { title: 'Account — Shape Admin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MISSING_FUNCTION = new Set(['PGRST202', '42883']);

type Listing = {
  role: 'trainer' | 'nutritionist';
  id: number;
  name: string | null;
  live: boolean;
  verified: boolean;
  suspended_at: string | null;
  clients_active: number;
};
type Suspension = {
  provider_role: string;
  provider_id: number;
  listing_name: string | null;
  reason: string;
  source: 'admin' | 'freeze';
  suspended_by_email: string;
  suspended_at: string;
  lifted_at: string | null;
  lifted_by_email: string | null;
};
type Freeze = { reason: string; frozen_by_email: string; frozen_at: string; unfrozen_at: string | null; unfrozen_by_email: string | null };
type AccountRequest = {
  id: string;
  action: string;
  status: 'open' | 'done' | 'declined';
  note: string | null;
  handled_by_email: string | null;
  handled_at: string | null;
  created_at: string;
};
type Detail = {
  id: string;
  email: string | null;
  created_at: string | null;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  banned_until: string | null;
  source: string | null;
  profile: { full_name: string | null; username: string | null; role: string | null; roles: string[] | null } | null;
  staff_level: string | null;
  memberships: { status: string; price_cents: number | null; current_period_end: string | null; created_at: string }[];
  coach_subscriptions: { provider_role: string; status: string; price_cents: number | null; created_at: string; coach: string | null }[];
  listings: Listing[];
  freezes: Freeze[];
  suspensions: Suspension[];
  requests: AccountRequest[];
  activity: {
    workouts_30d: number;
    workouts_all: number;
    meal_days_30d: number;
    checkins_30d: number;
    consults_30d: number;
    points_30d: number;
    rank_points: number;
  };
};

const UPDATED: Record<string, string> = {
  frozen: 'Frozen. They are signed out everywhere and cannot sign in; their listings are off the marketplace.',
  already_frozen: 'This account was already frozen.',
  unfrozen: 'Unfrozen. They can sign in again, and listings suspended by the freeze are back.',
  not_frozen: 'This account is not frozen.',
  suspended: 'Suspended. The listing is off the marketplace.',
  already_suspended: 'That listing was already suspended.',
  lifted: 'The listing is back. It shows on the marketplace once it is ready (price, payouts and a photo).',
  not_suspended: 'That listing is not suspended.',
  done: 'Marked done.',
  declined: 'Declined.',
  already_handled: 'That request was already closed.',
};

const ERRORS: Record<string, string> = {
  reason: `Give a reason (${REASON_MIN} to ${REASON_MAX} characters). It is kept with the record.`,
  confirm: 'Type the account’s email exactly to remove it. Nothing was removed.',
  no_account: 'That account does not exist (it may have been removed).',
  lookup_failed: 'The lookup failed, so nothing was changed. Try again.',
  refused_self: 'You cannot do that to your own account.',
  refused_owner: 'An owner’s account cannot be changed from the console.',
  refused_staff: 'This account is on the Shape team. Only an owner can do that; or remove them from staff first.',
  not_logged: 'The change could not be logged, so nothing was changed. Try again.',
  missing_migration: `Not set up yet: run ${ACCOUNT_MIGRATION_FILE}.`,
  freeze_failed: 'The account could not be frozen. Nothing was changed.',
  unfreeze_failed: 'The account could not be unfrozen. It is still frozen.',
  no_listing: 'That listing could not be found on this account.',
  suspend_failed: 'The listing could not be suspended. Nothing was changed.',
  lift_failed: 'The listing could not be put back. It is still suspended.',
  lift_frozen: 'The freeze suspended that listing. Unfreeze the account to put it back.',
  billing_read_failed: 'Their subscriptions could not be read, so nothing was cancelled or removed. Try again.',
  billing_not_cancelled:
    'At least one Stripe subscription could not be cancelled, so the account was NOT removed. Check Stripe, then try again.',
  erase_storage: 'Their files could not all be removed, so nothing was deleted. Their billing is cancelled. Try again.',
  erase_applications: 'Their coach application could not be removed, so the account was kept. Their billing is cancelled. Try again.',
  erase_auth: 'Their data was removed but the sign-in account remains. Try again to finish.',
  erase_failed: 'The removal did not finish. Try again.',
  no_request: 'That request could not be found.',
  save_failed: 'The change could not be saved. Try again.',
};

const MEMBERSHIP: Record<string, string> = {
  active: 'Paying',
  trialing: 'Free trial',
  past_due: 'Payment failing',
  unpaid: 'Payment failing',
  canceled: 'Canceled',
  incomplete: 'Not finished',
  incomplete_expired: 'Not finished',
  pending: 'Not finished',
};

const REQUEST_LABEL: Record<string, string> = {
  Pause: 'Pause their membership',
  Export: 'Export their data',
  Delete: 'Delete their account',
};

const card = 'rounded-xl border border-neutral-800 bg-neutral-950 p-4 sm:p-5 flex flex-col gap-3';
const field = 'rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-teal-400';

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ updated?: string; error?: string }>;
}) {
  let staff: StaffMember;
  try {
    staff = await requireStaff('support');
  } catch {
    redirect('/admin');
  }
  const { id: rawId } = await params;
  const query = await searchParams;
  const id = String(rawId || '').toLowerCase();
  if (!UUID_RE.test(id)) redirect('/admin/members');

  const db = createAdminClient();
  const log = await startActivity(db, staff, { action: 'account.view', targetUserId: id });
  if (log.error) {
    return (
      <Notice tone={log.error === 'missing_migration' ? 'amber' : 'red'}>
        {log.error === 'missing_migration'
          ? `Not set up yet: run ${MIGRATION_FILE}.`
          : 'Opening this account could not be logged, so it is not shown. Reload to try again.'}
      </Notice>
    );
  }
  const { data, error } = await db.rpc('admin_account_detail', { p_user: id });
  // The email too, so the log still names the account after it is removed.
  await finishActivity(db, log.id, error ? 'failed' : 'done', { targetEmail: (data as Detail | null)?.email });
  if (error && MISSING_FUNCTION.has(String(error.code))) {
    return <Notice tone="amber">Not set up yet: run {ACCOUNT_MIGRATION_FILE}.</Notice>;
  }
  if (error) throw error;
  const a = data as Detail | null;
  if (!a) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="amber">No account with that id. It may have been removed.</Notice>
        <Link href="/admin/members" className="text-sm text-teal-300 hover:text-teal-200">
          ← Members
        </Link>
      </div>
    );
  }

  const owners = getOwnerEmails();
  const targetStaffLevel = resolveStaffLevel({
    email: a.email,
    confirmed: true,
    ownerEmails: owners,
    adminEmails: getEnvAdminEmails(),
    tableLevel: a.staff_level,
  });
  const refusal = accountRefusal({
    actorId: staff.id,
    actorLevel: staff.level,
    targetId: a.id,
    targetEmail: a.email,
    ownerEmails: owners,
    targetStaffLevel,
  });
  const can = (action: Parameters<typeof canDoAccountAction>[1]) => !refusal && canDoAccountAction(staff.level, action);
  const freeze = a.freezes.find((f) => !f.unfrozen_at) ?? null;
  const bannedElsewhere = !freeze && a.banned_until && Date.parse(a.banned_until) > Date.now();
  const openSuspension = (l: Listing) =>
    a.suspensions.find((s) => s.provider_role === l.role && s.provider_id === l.id && !s.lifted_at) ?? null;
  const name = a.profile?.full_name || a.profile?.username || a.email || 'No name';
  const roles = Array.from(new Set([...(a.profile?.roles ?? []), a.profile?.role].filter(Boolean))) as string[];
  const openRequests = a.requests.filter((r) => r.status === 'open');

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/members" className="text-sm text-neutral-400 hover:text-neutral-200 w-fit">
        ← Members
      </Link>

      {query?.updated && <Notice tone="teal">{UPDATED[query.updated] ?? 'Updated.'}</Notice>}
      {query?.error && <Notice tone="red">{ERRORS[query.error] ?? 'That could not be done.'}</Notice>}

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h2 className="text-2xl font-light tracking-tight break-all">{name}</h2>
          {freeze ? (
            <span className="text-xs uppercase tracking-[0.14em] rounded-full border border-red-400/40 text-red-200 px-2.5 py-0.5">Frozen</span>
          ) : (
            <span className="text-xs uppercase tracking-[0.14em] rounded-full border border-teal-400/40 text-teal-200 px-2.5 py-0.5">Active</span>
          )}
          {targetStaffLevel && (
            <span className="text-xs uppercase tracking-[0.14em] rounded-full border border-neutral-700 text-neutral-300 px-2.5 py-0.5">
              Staff · {LEVEL_LABELS[targetStaffLevel as StaffLevel]}
            </span>
          )}
        </div>
        <p className="text-sm text-neutral-400 break-all">
          {a.email || 'no email'}
          {a.email && !a.email_confirmed_at ? ' (not confirmed)' : ''}
          {a.profile?.username ? ` · @${a.profile.username}` : ''}
          {roles.length ? ` · ${roles.join(', ')}` : ''}
        </p>
        <p className="text-sm text-neutral-500">
          Joined {formatWhen(a.created_at)}
          {a.source && a.source !== 'not recorded' ? ` from ${a.source}` : ''} · last signed in {formatWhen(a.last_sign_in_at, true)}
        </p>
        {a.email && (
          <a
            href={`https://dashboard.stripe.com/search?query=${encodeURIComponent(a.email)}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-teal-300 hover:text-teal-200 w-fit"
          >
            Find them in Stripe ↗
          </a>
        )}
        {bannedElsewhere && (
          <Notice tone="amber">
            Supabase shows this account banned until {formatWhen(a.banned_until, true)}, but no freeze is on record. It was banned outside
            the console.
          </Notice>
        )}
      </section>

      <section className={card} aria-labelledby="activity">
        <h3 id="activity" className="text-lg font-medium">
          Activity
        </h3>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm tabular-nums">
          <Stat label="Workouts, 30 days" value={formatCount(a.activity.workouts_30d)} sub={`${formatCount(a.activity.workouts_all)} ever`} />
          <Stat label="Meal days, 30 days" value={formatCount(a.activity.meal_days_30d)} />
          <Stat label="Check-ins, 30 days" value={formatCount(a.activity.checkins_30d)} />
          <Stat label="Consultations, 30 days" value={formatCount(a.activity.consults_30d)} />
          <Stat label="Points, 30 days" value={formatCount(a.activity.points_30d)} />
          <Stat
            label="Shape Score tier"
            value={tierName(a.activity.rank_points, a.listings.length > 0)}
            sub={`${formatCount(a.activity.rank_points)} points`}
          />
        </dl>
      </section>

      <section className={card} aria-labelledby="billing">
        <h3 id="billing" className="text-lg font-medium">
          Membership and coaches
        </h3>
        {a.memberships.length === 0 && a.coach_subscriptions.length === 0 ? (
          <p className="text-sm text-neutral-500">No Shape membership and no coaches.</p>
        ) : (
          <ul className="divide-y divide-neutral-900 text-sm">
            {a.memberships.map((m, i) => (
              <li key={`m${i}`} className="py-2 flex justify-between gap-3 flex-wrap">
                <span>Shape membership · {MEMBERSHIP[m.status] ?? m.status}</span>
                <span className="text-neutral-400 tabular-nums">
                  {m.price_cents != null ? `${formatMoney(m.price_cents)}/mo · ` : ''}since {formatWhen(m.created_at)}
                  {m.current_period_end ? ` · renews ${formatWhen(m.current_period_end)}` : ''}
                </span>
              </li>
            ))}
            {a.coach_subscriptions.map((c, i) => (
              <li key={`c${i}`} className="py-2 flex justify-between gap-3 flex-wrap">
                <span>
                  {c.provider_role === 'nutritionist' ? 'Nutritionist' : 'Trainer'}: {c.coach || 'a removed listing'} ·{' '}
                  {MEMBERSHIP[c.status] ?? c.status}
                </span>
                <span className="text-neutral-400 tabular-nums">
                  {c.price_cents != null ? `${formatMoney(c.price_cents)}/mo · ` : ''}since {formatWhen(c.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {a.listings.length > 0 && (
        <section className={card} aria-labelledby="listings">
          <div>
            <h3 id="listings" className="text-lg font-medium">
              Coach listings
            </h3>
            <p className="text-sm text-neutral-500">A suspended listing is off the marketplace until it is put back. The coach keeps it.</p>
          </div>
          <ul className="flex flex-col gap-3">
            {a.listings.map((l) => {
              const s = openSuspension(l);
              return (
                <li key={`${l.role}-${l.id}`} className="rounded-lg border border-neutral-900 p-3 flex flex-col gap-2">
                  <div className="flex justify-between gap-3 flex-wrap text-sm">
                    <span className="text-neutral-100">
                      {l.name || 'Unnamed'} · {l.role === 'nutritionist' ? 'Nutritionist' : 'Trainer'}
                    </span>
                    <span className={s ? 'text-red-300' : l.live ? 'text-teal-300' : 'text-amber-300'}>
                      {s ? 'Suspended' : l.live ? 'Live' : 'Not live yet'} · {l.verified ? 'Verified' : 'Not verified'} ·{' '}
                      {formatCount(l.clients_active)} paying {l.clients_active === 1 ? 'client' : 'clients'}
                    </span>
                  </div>
                  {s && (
                    <p className="text-sm text-neutral-400">
                      Suspended {formatWhen(s.suspended_at, true)} by {s.suspended_by_email}: &ldquo;{s.reason}&rdquo;
                      {s.source === 'freeze' ? ' It comes back when the account is unfrozen.' : ''}
                    </p>
                  )}
                  {s && s.source === 'admin' && can('lift_listing') && (
                    <form action={liftListing}>
                      <input type="hidden" name="user_id" value={a.id} />
                      <input type="hidden" name="role" value={l.role} />
                      <input type="hidden" name="listing_id" value={l.id} />
                      <button type="submit" className="rounded-full border border-teal-400 text-teal-200 px-4 py-1.5 text-sm hover:bg-teal-400/10">
                        Put it back
                      </button>
                    </form>
                  )}
                  {!s && can('suspend_listing') && (
                    <form action={suspendListing} className="flex flex-col sm:flex-row gap-2 sm:items-end">
                      <input type="hidden" name="user_id" value={a.id} />
                      <input type="hidden" name="role" value={l.role} />
                      <input type="hidden" name="listing_id" value={l.id} />
                      <label className="flex flex-col gap-1 flex-1 min-w-0">
                        <span className="text-xs text-neutral-500">Why (kept with the record)</span>
                        <input name="reason" required minLength={REASON_MIN} maxLength={REASON_MAX} className={field} />
                      </label>
                      <button type="submit" className="rounded-full border border-red-400/60 text-red-200 px-4 py-2 text-sm hover:bg-red-400/10">
                        Suspend listing
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className={card} aria-labelledby="freeze">
        <div>
          <h3 id="freeze" className="text-lg font-medium">
            {freeze ? 'Frozen' : 'Freeze'}
          </h3>
          <p className="text-sm text-neutral-500">
            A frozen account is signed out everywhere and cannot sign in. Its coach listings come off the marketplace. Nothing is deleted,
            and its billing carries on; unfreezing undoes it.
          </p>
        </div>
        {freeze && (
          <p className="text-sm text-neutral-300">
            Frozen {formatWhen(freeze.frozen_at, true)} by {freeze.frozen_by_email}: &ldquo;{freeze.reason}&rdquo;
          </p>
        )}
        {refusal ? (
          <p className="text-sm text-neutral-500">{ERRORS[`refused_${refusal}`]}</p>
        ) : freeze ? (
          can('unfreeze') && (
            <form action={unfreezeAccount}>
              <input type="hidden" name="user_id" value={a.id} />
              <button type="submit" className="rounded-full border border-teal-400 bg-teal-400 text-neutral-950 px-5 py-2 text-sm hover:bg-teal-300">
                Unfreeze
              </button>
            </form>
          )
        ) : (
          can('freeze') && (
            <form action={freezeAccount} className="flex flex-col sm:flex-row gap-2 sm:items-end">
              <input type="hidden" name="user_id" value={a.id} />
              <label className="flex flex-col gap-1 flex-1 min-w-0">
                <span className="text-xs text-neutral-500">Why (kept with the record)</span>
                <input name="reason" required minLength={REASON_MIN} maxLength={REASON_MAX} className={field} />
              </label>
              <button type="submit" className="rounded-full border border-red-400/60 text-red-200 px-5 py-2 text-sm hover:bg-red-400/10">
                Freeze account
              </button>
            </form>
          )
        )}
      </section>

      <section className={card} aria-labelledby="requests">
        <div>
          <h3 id="requests" className="text-lg font-medium">
            Requests from Settings
          </h3>
          <p className="text-sm text-neutral-500">
            {openRequests.length ? `${openRequests.length} open.` : 'None open.'} Close one once it is handled; the member is not emailed.
          </p>
        </div>
        {a.requests.length > 0 && (
          <ul className="divide-y divide-neutral-900">
            {a.requests.map((r) => (
              <RequestRow key={r.id} r={r} accountId={a.id} canHandle={canDoAccountAction(staff.level, 'handle_request')} />
            ))}
          </ul>
        )}
      </section>

      {(a.freezes.length > 0 || a.suspensions.length > 0) && (
        <section className={card} aria-labelledby="history">
          <h3 id="history" className="text-lg font-medium">
            History
          </h3>
          <ul className="flex flex-col gap-1.5 text-sm text-neutral-400">
            {a.freezes.map((f, i) => (
              <li key={`f${i}`}>
                Frozen {formatWhen(f.frozen_at, true)} by {f.frozen_by_email} (&ldquo;{f.reason}&rdquo;)
                {f.unfrozen_at ? `; unfrozen ${formatWhen(f.unfrozen_at, true)} by ${f.unfrozen_by_email ?? 'staff'}` : ''}
              </li>
            ))}
            {a.suspensions.map((s, i) => (
              <li key={`s${i}`}>
                {s.listing_name || 'A listing'} suspended {formatWhen(s.suspended_at, true)} by {s.suspended_by_email} (&ldquo;{s.reason}
                &rdquo;)
                {s.lifted_at ? `; back ${formatWhen(s.lifted_at, true)} by ${s.lifted_by_email ?? 'staff'}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      {can('remove') && (
        <section className="rounded-xl border border-red-400/30 bg-red-400/5 p-4 sm:p-5 flex flex-col gap-3" aria-labelledby="remove">
          <div>
            <h3 id="remove" className="text-lg font-medium text-red-100">
              Remove this account
            </h3>
            <p className="text-sm text-neutral-400">
              Cancels every Stripe subscription that can still charge on it first (their membership, their coaches, and their own
              clients&apos; subscriptions to their listings), then erases the account the way a member&apos;s own deletion does. Stripe
              keeps its payment records. This cannot be undone.
            </p>
          </div>
          <form action={removeAccount} className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <input type="hidden" name="user_id" value={a.id} />
            <label className="flex flex-col gap-1 flex-1 min-w-0">
              <span className="text-xs text-neutral-500">Type {a.email ? 'their email' : 'the account id'} to confirm</span>
              <input name="confirm" required autoComplete="off" className={field} />
            </label>
            <button type="submit" className="rounded-full border border-red-400 bg-red-500/80 text-white px-5 py-2 text-sm hover:bg-red-500">
              Remove account
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="text-neutral-100">{value}</dd>
      {sub && <dd className="text-xs text-neutral-500">{sub}</dd>}
    </div>
  );
}

function RequestRow({ r, accountId, canHandle }: { r: AccountRequest; accountId: string; canHandle: boolean }) {
  return (
    <li className="py-2 flex flex-col gap-2 text-sm">
      <div className="flex justify-between gap-3 flex-wrap">
        <span className="text-neutral-100">{REQUEST_LABEL[r.action] ?? r.action}</span>
        <span className="text-neutral-400">
          asked {formatWhen(r.created_at, true)}
          {r.status !== 'open' ? ` · ${r.status === 'done' ? 'done' : 'declined'} ${formatWhen(r.handled_at)} by ${r.handled_by_email ?? 'staff'}` : ''}
        </span>
      </div>
      {r.note && <p className="text-neutral-500">&ldquo;{r.note}&rdquo;</p>}
      {r.status === 'open' && canHandle && (
        <form action={handleRequest} className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <input type="hidden" name="request_id" value={r.id} />
          <input type="hidden" name="user_id" value={accountId} />
          <input type="hidden" name="back" value="account" />
          <label className="flex flex-col gap-1 flex-1 min-w-0">
            <span className="text-xs text-neutral-500">Note (optional)</span>
            <input name="note" maxLength={REASON_MAX} className={field} />
          </label>
          <div className="flex gap-2">
            <button type="submit" name="outcome" value="done" className="rounded-full border border-teal-400 text-teal-200 px-4 py-2 text-sm hover:bg-teal-400/10">
              Done
            </button>
            <button type="submit" name="outcome" value="declined" className="rounded-full border border-neutral-700 text-neutral-300 px-4 py-2 text-sm hover:bg-neutral-900">
              Decline
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
