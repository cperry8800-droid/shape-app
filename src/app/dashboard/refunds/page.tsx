import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminUser } from '@/lib/admin-access';
import { approveRefund, denyRefund } from './actions';

export const metadata = { title: 'Refunds - Shape' };
export const dynamic = 'force-dynamic';

type RefundStatus = 'pending' | 'approved' | 'denied' | 'refunded';

type RefundRow = {
  id: string;
  created_at: string;
  client_id: string;
  subscription_id: string | null;
  one_time_purchase_id: string | null;
  reason: string | null;
  status: RefundStatus;
  processed_at: string | null;
  admin_notes: string | null;
};

type TargetInfo = {
  label: string;
  priceCents: number | null;
  applicationFeeCents: number | null;
  coachName: string | null;
  targetStatus: string | null;
};

function usd(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

function statusClass(status: RefundStatus): string {
  if (status === 'refunded') return 'border-teal-400/40 bg-teal-400/10 text-teal-200';
  if (status === 'denied') return 'border-red-400/40 bg-red-400/10 text-red-200';
  if (status === 'approved') return 'border-blue-400/40 bg-blue-400/10 text-blue-200';
  return 'border-amber-400/40 bg-amber-400/10 text-amber-200';
}

async function coachName(
  admin: ReturnType<typeof createAdminClient>,
  role: string | null,
  id: number | null
): Promise<string | null> {
  if (!role || !id) return null;
  const table = role === 'nutritionist' ? 'nutritionists' : 'trainers';
  const { data } = await admin.from(table).select('name').eq('id', id).maybeSingle<{ name: string }>();
  return data?.name ?? null;
}

async function loadTargetInfo(
  admin: ReturnType<typeof createAdminClient>,
  row: RefundRow
): Promise<TargetInfo> {
  if (row.one_time_purchase_id) {
    const { data } = await admin
      .from('one_time_purchases')
      .select('price_cents, application_fee_cents, provider_role, provider_id, kind, status')
      .eq('id', row.one_time_purchase_id)
      .maybeSingle<{
        price_cents: number | null;
        application_fee_cents: number | null;
        provider_role: string | null;
        provider_id: number | null;
        kind: string | null;
        status: string | null;
      }>();
    return {
      label: data?.kind === 'meal_plan' ? 'Meal plan' : data?.kind === 'booking' ? 'Booking' : 'One-time purchase',
      priceCents: data?.price_cents ?? null,
      applicationFeeCents: data?.application_fee_cents ?? null,
      coachName: await coachName(admin, data?.provider_role ?? null, data?.provider_id ?? null),
      targetStatus: data?.status ?? null,
    };
  }
  if (row.subscription_id) {
    const { data } = await admin
      .from('subscriptions')
      .select('price_cents, provider_role, provider_id, status')
      .eq('id', row.subscription_id)
      .maybeSingle<{
        price_cents: number | null;
        provider_role: string | null;
        provider_id: number | null;
        status: string | null;
      }>();
    const price = data?.price_cents ?? null;
    return {
      label: 'Coach subscription',
      priceCents: price,
      // Coach subs charge a flat 15% application fee (application_fee_percent).
      applicationFeeCents: price != null ? Math.round(price * 0.15) : null,
      coachName: await coachName(admin, data?.provider_role ?? null, data?.provider_id ?? null),
      targetStatus: data?.status ?? null,
    };
  }
  return { label: 'Unknown', priceCents: null, applicationFeeCents: null, coachName: null, targetStatus: null };
}

async function clientEmail(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<string | null> {
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

export default async function RefundsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; updated?: string; error?: string }>;
}) {
  try {
    await requireAdminUser();
  } catch {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const status = params?.status;
  const validStatus = ['pending', 'approved', 'denied', 'refunded'].includes(status ?? '') ? status : null;

  const admin = createAdminClient();
  let query = admin
    .from('refund_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (validStatus) query = query.eq('status', validStatus);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as RefundRow[];
  const view = await Promise.all(
    rows.map(async (row) => ({
      row,
      target: await loadTargetInfo(admin, row),
      email: await clientEmail(admin, row.client_id),
    }))
  );
  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="text-xs uppercase tracking-[0.16em] text-teal-400">Admin</div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-light tracking-tight">Refund requests</h2>
            <p className="text-sm text-neutral-400 mt-1 max-w-2xl">
              Approving a request refunds the client and unwinds the Connect payout — the coach&apos;s
              85% transfer is reversed and Shape&apos;s 15% fee is returned, so the platform nets zero.
              Coach subscriptions are also canceled on refund.
            </p>
          </div>
        </div>
      </section>

      {params?.updated && (
        <div className="rounded-lg border border-teal-400/30 bg-teal-400/10 text-teal-200 text-sm px-4 py-3">
          Refund request updated: {params.updated.replace(/_/g, ' ')}.
        </div>
      )}
      {params?.error && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/10 text-red-200 text-sm px-4 py-3">
          Could not process: {params.error.replace(/_/g, ' ')}.
        </div>
      )}

      <nav className="flex gap-2 flex-wrap">
        {[
          ['all', 'All'],
          ['pending', 'Pending'],
          ['refunded', 'Refunded'],
          ['denied', 'Denied'],
        ].map(([key, label]) => {
          const active = (!validStatus && key === 'all') || validStatus === key;
          return (
            <Link
              key={key}
              href={key === 'all' ? '/dashboard/refunds' : `/dashboard/refunds?status=${key}`}
              className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                active
                  ? 'border-teal-400 bg-teal-400 text-neutral-950'
                  : 'border-neutral-800 text-neutral-300 hover:border-neutral-600'
              }`}
            >
              {label} {key !== 'all' && counts[key] ? `(${counts[key]})` : ''}
            </Link>
          );
        })}
      </nav>

      {view.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-8 text-sm text-neutral-400">
          No refund requests for this filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {view.map(({ row, target, email }) => (
            <RefundCard key={row.id} row={row} target={target} email={email} />
          ))}
        </div>
      )}
    </div>
  );
}

function RefundCard({ row, target, email }: { row: RefundRow; target: TargetInfo; email: string | null }) {
  const created = new Date(row.created_at).toLocaleString();
  const transferCents =
    target.priceCents != null && target.applicationFeeCents != null
      ? target.priceCents - target.applicationFeeCents
      : null;
  const decided = row.status === 'refunded' || row.status === 'denied';

  return (
    <article className="rounded-xl border border-neutral-800 bg-neutral-950 p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-medium">{target.label}</h3>
            <span className={`text-xs uppercase tracking-[0.12em] border rounded-full px-2 py-1 ${statusClass(row.status)}`}>
              {row.status}
            </span>
            {target.coachName && (
              <span className="text-xs uppercase tracking-[0.12em] text-neutral-500">{target.coachName}</span>
            )}
          </div>
          <p className="text-sm text-neutral-400 mt-1">{email ?? row.client_id}</p>
          <p className="text-xs text-neutral-500 mt-1">Requested {created}</p>
        </div>
        <div className="text-right text-sm">
          <div className="text-neutral-200 tabular-nums">{usd(target.priceCents)}</div>
          <div className="text-neutral-500 text-xs">client refund</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Coach transfer reversed</div>
          <div className="text-neutral-200 mt-1 tabular-nums">{transferCents != null ? `−${usd(transferCents)}` : '—'}</div>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">15% fee returned to coach</div>
          <div className="text-neutral-200 mt-1 tabular-nums">{usd(target.applicationFeeCents)}</div>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Target status</div>
          <div className="text-neutral-200 mt-1">{target.targetStatus ?? '—'}</div>
        </div>
      </div>

      {row.reason && (
        <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">Client reason</div>
          <div className="text-sm text-neutral-200 mt-1 break-words">{row.reason}</div>
        </div>
      )}

      {decided ? (
        <div className="mt-4 text-xs text-neutral-500">
          {row.processed_at ? `Processed ${new Date(row.processed_at).toLocaleString()}` : 'Processed'}
          {row.admin_notes ? ` · ${row.admin_notes}` : ''}
        </div>
      ) : (
        <form className="mt-5 flex flex-col gap-3">
          <input type="hidden" name="request_id" value={row.id} />
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-[0.14em] text-neutral-500">Admin notes</span>
            <textarea
              name="admin_notes"
              defaultValue={row.admin_notes ?? ''}
              rows={2}
              className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-teal-400"
              placeholder="Internal note for this decision"
            />
          </label>
          <div className="flex gap-2 flex-wrap">
            <button
              type="submit"
              formAction={approveRefund}
              className="rounded-full border border-teal-400 bg-teal-400 text-neutral-950 px-4 py-2 text-sm hover:bg-teal-300 transition-colors"
            >
              Approve + refund (reverse payout)
            </button>
            <button
              type="submit"
              formAction={denyRefund}
              className="rounded-full border border-red-400/60 text-red-200 px-4 py-2 text-sm hover:bg-red-400 hover:text-neutral-950 transition-colors"
            >
              Deny
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
