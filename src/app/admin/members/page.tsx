// Each member's progress: one row per account holding the member role, from
// admin_member_stats() (service role only). Support level and up.
//
// COUNTS ONLY. The function returns how much a member does (workouts, meal days, check-ins,
// points), never a health value (weight, sleep, heart rate), so this page cannot show one.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/admin-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { countOf, formatCount, tierName } from '@/lib/admin-overview.mjs';
import { formatWhen, MIGRATION_FILE, Notice } from '../ui';

export const metadata = { title: 'Members — Shape Admin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type MemberRow = {
  id: string;
  email: string | null;
  name: string | null;
  coach_roles: boolean;
  joined: string | null;
  last_sign_in_at: string | null;
  last_active: string | null;
  membership: string | null;
  coaches: number;
  workouts_7d: number;
  workouts_30d: number;
  workouts_all: number;
  meal_days_30d: number;
  checkins_30d: number;
  consults_30d: number;
  points_30d: number;
  rank_points: number;
};

const SORTS = [
  { key: 'active', label: 'Most recently active' },
  { key: 'joined', label: 'Newest' },
  { key: 'points', label: 'Most Score points' },
  { key: 'workouts', label: 'Most workouts, 30 days' },
] as const;
const LIMIT = 200;
const MISSING_FUNCTION = new Set(['PGRST202', '42883']);

const MEMBERSHIP: Record<string, string> = {
  active: 'Paying',
  trialing: 'Free trial',
  past_due: 'Payment failing',
  unpaid: 'Payment failing',
  canceled: 'Canceled',
  incomplete: 'Not finished',
  pending: 'Not finished',
};

export default async function MembersPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; sort?: string }>;
}) {
  try {
    await requireStaff('support');
  } catch {
    redirect('/admin');
  }

  const params = await searchParams;
  const q = String(params?.q ?? '').trim().slice(0, 100);
  const sort = SORTS.find((s) => s.key === params?.sort)?.key ?? 'active';
  const { data, error } = await createAdminClient().rpc('admin_member_stats', { p_search: q || null, p_sort: sort, p_limit: LIMIT });
  const missing = Boolean(error && MISSING_FUNCTION.has(String(error.code)));
  if (error && !missing) throw error;
  const result = (data ?? { total: 0, rows: [] }) as { total: number; rows: MemberRow[] };
  const rows = Array.isArray(result.rows) ? result.rows : [];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-light tracking-tight">Members</h2>
        <p className="text-sm text-neutral-400 max-w-3xl">
          Each member&apos;s progress: their membership and coaches, how much they log, and their Shape Score tier. Counts only;
          no health values. &ldquo;7 days&rdquo; and &ldquo;30 days&rdquo; are the last 7 and 30 days to now.
        </p>
      </section>

      <form method="get" action="/admin/members" className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <label className="flex flex-col gap-1.5 flex-1 min-w-0">
          <span className="text-xs uppercase tracking-[0.14em] text-neutral-500">Search by name or email</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            maxLength={100}
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-teal-400"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-[0.14em] text-neutral-500">Sort</span>
          <select
            name="sort"
            defaultValue={sort}
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-teal-400"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-full border border-teal-400 bg-teal-400 text-neutral-950 px-5 py-2 text-sm hover:bg-teal-300 transition-colors">
          Show
        </button>
        {q && (
          <Link href="/admin/members" className="text-sm text-neutral-400 hover:text-neutral-200 py-2">
            Clear
          </Link>
        )}
      </form>

      {missing && <Notice tone="amber">Not set up yet: run {MIGRATION_FILE}.</Notice>}

      {!missing && (
        <p className="text-sm text-neutral-400">
          {result.total > rows.length
            ? `The first ${formatCount(rows.length)} of ${formatCount(result.total)} members${q ? ' matching' : ''}. Search to narrow it.`
            : `${formatCount(result.total)} ${result.total === 1 ? 'member' : 'members'}${q ? ' matching' : ''}.`}
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-950">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-xs text-neutral-500 border-b border-neutral-800">
                <th className="px-3 py-2 font-normal">Member</th>
                <th className="px-3 py-2 font-normal">Membership</th>
                <th className="px-3 py-2 font-normal">Tier</th>
                <th className="px-3 py-2 font-normal text-right">Workouts</th>
                <th className="px-3 py-2 font-normal text-right">Meal days, 30 days</th>
                <th className="px-3 py-2 font-normal text-right">Check-ins, 30 days</th>
                <th className="px-3 py-2 font-normal text-right">Consultations, 30 days</th>
                <th className="px-3 py-2 font-normal text-right">Points, 30 days</th>
                <th className="px-3 py-2 font-normal">Last active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-neutral-900 align-top">
                  <td className="px-3 py-2 min-w-[12rem]">
                    <div className="text-neutral-100">{r.name || '—'}</div>
                    <div className="text-xs text-neutral-500 break-all">{r.email || 'no email'}</div>
                    <div className="text-xs text-neutral-600">
                      Joined {formatWhen(r.joined)}
                      {r.coach_roles ? ' · also coaches' : ''}
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className={r.membership === 'active' ? 'text-teal-300' : 'text-neutral-300'}>
                      {r.membership ? MEMBERSHIP[r.membership] ?? r.membership : 'None'}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {countOf(r.coaches, 'coach', 'coaches')}
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="text-neutral-200">{tierName(r.rank_points)}</div>
                    <div className="text-xs text-neutral-500">{formatCount(r.rank_points)} points</div>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="text-neutral-200">{formatCount(r.workouts_7d)} in 7 days</div>
                    <div className="text-xs text-neutral-500">
                      {formatCount(r.workouts_30d)} in 30 · {formatCount(r.workouts_all)} ever
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">{formatCount(r.meal_days_30d)}</td>
                  <td className="px-3 py-2 text-right">{formatCount(r.checkins_30d)}</td>
                  <td className="px-3 py-2 text-right">{formatCount(r.consults_30d)}</td>
                  <td className="px-3 py-2 text-right">{formatCount(r.points_30d)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-neutral-400">
                    <div>{formatWhen(r.last_active)}</div>
                    <div className="text-xs text-neutral-600">signed in {formatWhen(r.last_sign_in_at)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
