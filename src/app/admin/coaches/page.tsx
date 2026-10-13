// Each coach's progress: one row per coach listing on a real account, from admin_coach_stats()
// (service role only). Support level and up. Rolling 30-day windows. Each name opens its
// account's page (/admin/accounts/[id]), where an Admin suspends or puts back a listing.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/admin-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { countOf, formatCount, formatMoney, tierName } from '@/lib/admin-overview.mjs';
import { formatWhen, MIGRATION_FILE, Notice } from '../ui';

export const metadata = { title: 'Coaches — Shape Admin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type CoachRow = {
  role: 'trainer' | 'nutritionist';
  listing_id: number;
  name: string | null;
  email: string | null;
  listed_at: string | null;
  last_sign_in_at: string | null;
  live: boolean;
  verified: boolean;
  payouts: string | null;
  clients_active: number;
  clients_ever: number;
  gross_mrr_cents: number;
  shape_mrr_cents: number;
  purchases_paid: number;
  purchases_gross_cents: number;
  consults_open: number;
  consults_30d: number;
  sessions_done_30d: number;
  sessions_upcoming: number;
  reviews: number;
  rating: number | null;
  waitlist: number;
  assigned_30d: number;
  catalog: number;
  client_workouts_30d: number;
  messages_30d: number;
  rank_points: number;
};

const MISSING_FUNCTION = new Set(['PGRST202', '42883']);

export default async function CoachesPage() {
  try {
    await requireStaff('support');
  } catch {
    redirect('/admin');
  }

  const db = createAdminClient();
  const [{ data, error }, trainerOwners, nutritionistOwners] = await Promise.all([
    db.rpc('admin_coach_stats'),
    db.from('trainers').select('id, owner_id').not('owner_id', 'is', null),
    db.from('nutritionists').select('id, owner_id').not('owner_id', 'is', null),
  ]);
  const missing = Boolean(error && MISSING_FUNCTION.has(String(error.code)));
  if (error && !missing) throw error;
  const rows = (Array.isArray(data) ? data : []) as CoachRow[];
  // Each listing's account, for the link to its page. Best effort: a failed read leaves the
  // names unlinked, never the coaches unshown.
  const ownerOf = new Map<string, string>();
  for (const [role, res] of [
    ['trainer', trainerOwners],
    ['nutritionist', nutritionistOwners],
  ] as const) {
    if (res.error) continue;
    for (const l of (res.data ?? []) as { id: number; owner_id: string | null }[]) {
      if (l.owner_id) ownerOf.set(`${role}-${l.id}`, l.owner_id);
    }
  }
  const live = rows.filter((r) => r.live).length;
  const clients = rows.reduce((t, r) => t + Number(r.clients_active || 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-light tracking-tight">Coaches</h2>
        <p className="text-sm text-neutral-400 max-w-3xl">
          Each coach&apos;s progress: their listing, clients and income, consultations and sessions, reviews, the work they
          assign, and their Shape Score tier. A coach with both roles has a row for each. &ldquo;30 days&rdquo; is the last 30
          days to now.
        </p>
        {rows.length > 0 && (
          <p className="text-sm text-neutral-300">
            {countOf(rows.length, 'listing')} · {formatCount(live)} live · {countOf(clients, 'paying client')}
          </p>
        )}
      </section>

      {missing && <Notice tone="amber">Not set up yet: run {MIGRATION_FILE}.</Notice>}

      {rows.length === 0 && !missing ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-8 text-sm text-neutral-400">No coaches yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-950">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-xs text-neutral-500 border-b border-neutral-800">
                <th className="px-3 py-2 font-normal">Coach</th>
                <th className="px-3 py-2 font-normal">Listing</th>
                <th className="px-3 py-2 font-normal">Tier</th>
                <th className="px-3 py-2 font-normal text-right">Clients</th>
                <th className="px-3 py-2 font-normal text-right">Monthly</th>
                <th className="px-3 py-2 font-normal text-right">Consultations</th>
                <th className="px-3 py-2 font-normal text-right">Sessions</th>
                <th className="px-3 py-2 font-normal text-right">Reviews</th>
                <th className="px-3 py-2 font-normal text-right">Assigned, 30 days</th>
                <th className="px-3 py-2 font-normal text-right">Client workouts, 30 days</th>
                <th className="px-3 py-2 font-normal text-right">Messages, 30 days</th>
                <th className="px-3 py-2 font-normal">Last signed in</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.role}-${r.listing_id}`} className="border-t border-neutral-900 align-top">
                  <td className="px-3 py-2 min-w-[12rem]">
                    {ownerOf.has(`${r.role}-${r.listing_id}`) ? (
                      <Link
                        href={`/admin/accounts/${ownerOf.get(`${r.role}-${r.listing_id}`)}`}
                        prefetch={false}
                        className="text-neutral-100 hover:text-teal-200 underline-offset-4 hover:underline"
                      >
                        {r.name || r.email || 'No name'}
                      </Link>
                    ) : (
                      <div className="text-neutral-100">{r.name || '—'}</div>
                    )}
                    <div className="text-xs text-neutral-500 break-all">
                      {r.role === 'trainer' ? 'Trainer' : 'Nutritionist'} · {r.email || 'no email'}
                    </div>
                    <div className="text-xs text-neutral-600">Listed {formatWhen(r.listed_at)}</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className={r.live ? 'text-teal-300' : 'text-amber-300'}>{r.live ? 'Live' : 'Not live'}</div>
                    <div className="text-xs text-neutral-500">
                      {r.verified ? 'Verified' : 'Not verified'} · payouts {r.payouts || 'not set up'}
                    </div>
                    <div className="text-xs text-neutral-500">{formatCount(r.catalog)} in their catalog</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="text-neutral-200">{tierName(r.rank_points, true)}</div>
                    <div className="text-xs text-neutral-500">{formatCount(r.rank_points)} points</div>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="text-neutral-200">{formatCount(r.clients_active)}</div>
                    <div className="text-xs text-neutral-500">{formatCount(r.clients_ever)} ever</div>
                    {r.waitlist > 0 && <div className="text-xs text-neutral-500">{formatCount(r.waitlist)} waiting</div>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="text-neutral-200">{formatMoney(r.gross_mrr_cents)}</div>
                    <div className="text-xs text-neutral-500">Shape keeps {formatMoney(r.shape_mrr_cents)}</div>
                    {r.purchases_paid > 0 && (
                      <div className="text-xs text-neutral-500">
                        + {formatCount(r.purchases_paid)} sold, {formatMoney(r.purchases_gross_cents)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="text-neutral-200">{formatCount(r.consults_30d)}</div>
                    <div className={`text-xs ${r.consults_open > 0 ? 'text-amber-300' : 'text-neutral-500'}`}>
                      {formatCount(r.consults_open)} waiting on them
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="text-neutral-200">{formatCount(r.sessions_done_30d)} done</div>
                    <div className="text-xs text-neutral-500">{formatCount(r.sessions_upcoming)} coming up</div>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="text-neutral-200">{r.rating == null ? '—' : `${r.rating}/10`}</div>
                    <div className="text-xs text-neutral-500">{countOf(r.reviews, 'review')}</div>
                  </td>
                  <td className="px-3 py-2 text-right">{formatCount(r.assigned_30d)}</td>
                  <td className="px-3 py-2 text-right">{formatCount(r.client_workouts_30d)}</td>
                  <td className="px-3 py-2 text-right">{formatCount(r.messages_30d)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-neutral-400">{formatWhen(r.last_sign_in_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
