// The admin console's Overview: Shape's numbers on one page, analyst level and up.
//
// One database call (admin_overview_stats, service role only) returns every number, and the
// funnel comes from get_funnel, as on the War Room. src/lib/admin-overview.mjs turns both into
// what this page draws, so the page itself only renders.
//
// Page views are Vercel Analytics' and payouts, disputes and tax are Stripe's: both are linked,
// not copied, so the console never holds either service's keys.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/admin-access';
import { canOpen, type StaffLevel } from '@/lib/staff-levels.mjs';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildFunnel } from '@/lib/funnel.mjs';
import type { FunnelRow } from '@/lib/funnel';
import {
  DAILY_CHARTS,
  dailyColumns,
  formatCount,
  overviewSections,
  tierBreakdown,
  type AdminOverviewStats,
  type TierRow,
  type DailyRow,
  type OverviewSection,
} from '@/lib/admin-overview.mjs';
import { ADMIN_TIMEZONE } from './ui';

export const metadata = { title: 'Overview — Shape Admin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

// The owner's days. Set ADMIN_TIMEZONE in Vercel to change it; an unknown zone is UTC.
const TIMEZONE = ADMIN_TIMEZONE;
const STRIPE_DASHBOARD = 'https://dashboard.stripe.com/';
const VERCEL_ANALYTICS = 'https://vercel.com/cperry8800-droids-projects/shape-app/analytics';
const MISSING_FUNCTION = new Set(['PGRST202', '42883']);

async function loadStats(): Promise<{ stats: AdminOverviewStats | null; missing: boolean; failed: boolean }> {
  try {
    const { data, error } = await createAdminClient().rpc('admin_overview_stats', { p_tz: TIMEZONE });
    if (error) return { stats: null, missing: MISSING_FUNCTION.has(String(error.code)), failed: !MISSING_FUNCTION.has(String(error.code)) };
    return { stats: (data ?? null) as AdminOverviewStats | null, missing: false, failed: !data };
  } catch {
    return { stats: null, missing: false, failed: true };
  }
}

async function loadFunnel(): Promise<FunnelRow[] | null> {
  try {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 86400000);
    const { data, error } = await createAdminClient().rpc('get_funnel', { p_from: from.toISOString(), p_to: to.toISOString() });
    if (error || !Array.isArray(data)) return null;
    const counts: Record<string, number> = {};
    for (const r of data as Array<{ step: string; count: number }>) counts[r.step] = Number(r.count) || 0;
    return buildFunnel(counts);
  } catch {
    return null;
  }
}

export default async function AdminOverviewPage() {
  let level: StaffLevel = 'analyst';
  try {
    level = (await requireStaff('analyst')).level;
  } catch {
    redirect('/login?next=/admin');
  }

  const [{ stats, missing, failed }, funnel] = await Promise.all([loadStats(), loadFunnel()]);
  // A tile links only to a page this level opens.
  const sections = (stats ? overviewSections(stats) : []).map((s) => ({
    ...s,
    tiles: s.tiles.map((t) => (t.href && !canOpen(level, t.href) ? { ...t, href: '' } : t)),
  }));
  const daily = (stats?.daily ?? []) as DailyRow[];
  const tiers = stats ? tierBreakdown(stats) : null;

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-light tracking-tight">Overview</h2>
        <p className="text-sm text-neutral-400 max-w-2xl">
          Shape&apos;s numbers across the website and the app
          {stats?.generated_at ? `, as of ${new Date(stats.generated_at).toLocaleString('en-US', { timeZone: TIMEZONE })}` : ''}
          {stats?.timezone ? ` (days in ${stats.timezone})` : ''}.
        </p>
        <div className="flex gap-2 flex-wrap mt-1">
          <a href={VERCEL_ANALYTICS} target="_blank" rel="noreferrer" className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:border-neutral-500 transition-colors">
            Page views (Vercel Analytics) ↗
          </a>
          <a href={STRIPE_DASHBOARD} target="_blank" rel="noreferrer" className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:border-neutral-500 transition-colors">
            Payouts and payments (Stripe) ↗
          </a>
        </div>
      </section>

      {missing && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 text-amber-200 text-sm px-4 py-3">
          Not set up yet: run supabase-migrations/2026-10-13-staff-access-and-admin-stats.sql.
        </div>
      )}
      {failed && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/10 text-red-200 text-sm px-4 py-3">
          The numbers could not be loaded. Reload the page; if it keeps failing, check the Supabase logs.
        </div>
      )}

      {sections.map((section) => (
        <Section key={section.key} section={section} />
      ))}

      {tiers && (
        <section className="flex flex-col gap-4">
          <div>
            <h3 className="text-lg font-medium">Shape Score tiers</h3>
            <p className="text-sm text-neutral-500 max-w-3xl">
              How many accounts sit at each tier, on the points that set it (everything earned, without Store purchases or tier
              bonuses; a tier never drops). Coaches climb the same rungs under their own names.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Tiers title="Members" rows={tiers.members} />
            <Tiers title="Coaches" rows={tiers.coaches} />
          </div>
        </section>
      )}

      {daily.length > 0 && (
        <section className="flex flex-col gap-4">
          <div>
            <h3 className="text-lg font-medium">Last 30 days</h3>
            <p className="text-sm text-neutral-500">Hover a column for its day. Each chart has its own scale.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DAILY_CHARTS.map((c) => (
              <DailyChart key={c.key} title={c.title} daily={daily} field={c.key} />
            ))}
          </div>
          <details className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
            <summary className="text-xs uppercase tracking-[0.14em] text-neutral-500 cursor-pointer">The 30 days as a table</summary>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="text-left text-neutral-500">
                    <th className="py-1 pr-4 font-normal">Day</th>
                    <th className="py-1 pr-4 font-normal text-right">New accounts</th>
                    <th className="py-1 pr-4 font-normal text-right">Active</th>
                    <th className="py-1 pr-4 font-normal text-right">Workouts</th>
                    <th className="py-1 font-normal text-right">Applications</th>
                  </tr>
                </thead>
                <tbody>
                  {[...daily].reverse().map((d) => (
                    <tr key={d.day} className="border-t border-neutral-900 text-neutral-300">
                      <td className="py-1 pr-4">{d.day}</td>
                      <td className="py-1 pr-4 text-right">{formatCount(d.signups)}</td>
                      <td className="py-1 pr-4 text-right">{formatCount(d.active)}</td>
                      <td className="py-1 pr-4 text-right">{formatCount(d.workouts)}</td>
                      <td className="py-1 text-right">{formatCount(d.applications)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      )}

      {funnel && (
        <section className="flex flex-col gap-4">
          <div>
            <h3 className="text-lg font-medium">Sign-up funnel, last 30 days</h3>
            <p className="text-sm text-neutral-500">
              Of the accounts that signed up in the last 30 days, how many reached each step. The app records these steps only
              where its analytics consent allows.
            </p>
          </div>
          <Funnel rows={funnel} />
        </section>
      )}
    </div>
  );
}

function Section({ section }: { section: OverviewSection }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-lg font-medium">{section.title}</h3>
        {section.note && <p className="text-sm text-neutral-500 max-w-3xl">{section.note}</p>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {section.tiles.map((t) => {
          const body = (
            <>
              <div className="text-xs text-neutral-400">{t.label}</div>
              <div className="text-2xl font-semibold tracking-tight text-neutral-100 mt-1 break-words">{t.value}</div>
              {t.sub && <div className="text-xs text-neutral-500 mt-1">{t.sub}</div>}
            </>
          );
          const cls = 'rounded-xl border border-neutral-800 bg-neutral-950 p-4 min-w-0';
          return t.href ? (
            <Link key={t.label} href={t.href} className={`${cls} hover:border-neutral-600 transition-colors`}>
              {body}
            </Link>
          ) : (
            <div key={t.label} className={cls}>
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}

const CHART_W = 600;
const CHART_H = 120;

function DailyChart({ title, daily, field }: { title: string; daily: DailyRow[]; field: string }) {
  const { top, total, cols } = dailyColumns(daily, field, { width: CHART_W, height: CHART_H });
  const first = cols[0]?.day ?? '';
  const last = cols[cols.length - 1]?.day ?? '';
  return (
    <figure className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 min-w-0">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-neutral-300">{title}</span>
        <span className="text-xs text-neutral-500">{formatCount(total)} in 30 days</span>
      </figcaption>
      <div className="flex gap-2 mt-3">
        <div className="flex flex-col justify-between text-[10px] text-neutral-500 tabular-nums" style={{ height: 96 }}>
          <span>{formatCount(top)}</span>
          <span>0</span>
        </div>
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height: 96 }}
          role="img"
          aria-label={`${title}: ${formatCount(total)} in the last 30 days`}
        >
          <line x1="0" y1={CHART_H - 0.5} x2={CHART_W} y2={CHART_H - 0.5} stroke="#262626" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {cols.map((c) => (
            <g key={c.day}>
              {/* The hit target is the whole day's slot, taller than the column. */}
              <rect x={c.x - 1} y={0} width={c.w + 2} height={CHART_H} fill="transparent">
                <title>{`${c.day}: ${formatCount(c.value)}`}</title>
              </rect>
              {c.h > 0 && (
                <path d={columnPath(c.x, c.y, c.w, c.h)} fill="#2dd4bf" pointerEvents="none" />
              )}
            </g>
          ))}
        </svg>
      </div>
      <div className="flex justify-between text-[10px] text-neutral-500 mt-1 pl-6">
        <span>{first}</span>
        <span>{last}</span>
      </div>
    </figure>
  );
}

// A column with a rounded top (up to 4 units) and a square foot on the baseline.
function columnPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

// One bar per tier, on one scale for the panel: the count is a magnitude, so one hue.
function Tiers({ title, rows }: { title: string; rows: TierRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((t, r) => t + r.count, 0);
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-neutral-300">{title}</span>
        <span className="text-xs text-neutral-500">{formatCount(total)} accounts</span>
      </div>
      {rows.map((r) => (
        <div key={r.name} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="text-neutral-300 truncate">
            {r.name} <span className="text-neutral-500 text-xs">{formatCount(r.from)}+</span>
          </span>
          <div className="h-3 rounded-full bg-neutral-900 overflow-hidden" aria-hidden="true">
            <div className="h-full rounded-full bg-teal-400" style={{ width: `${Math.round((r.count / max) * 100)}%` }} />
          </div>
          <span className="text-neutral-400 tabular-nums text-right">{formatCount(r.count)}</span>
        </div>
      ))}
    </div>
  );
}

function Funnel({ rows }: { rows: FunnelRow[] }) {
  const max = Math.max(1, rows[0]?.count ?? 0);
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 flex flex-col gap-3">
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="text-neutral-300 truncate">{r.label}</span>
          <div className="h-3 rounded-full bg-neutral-900 overflow-hidden" aria-hidden="true">
            <div className="h-full rounded-full bg-teal-400" style={{ width: `${Math.round((r.count / max) * 100)}%` }} />
          </div>
          <span className="text-neutral-400 tabular-nums text-right">
            {formatCount(r.count)}
            {r.key !== 'signup' ? ` · ${r.pctOfSignup}%` : ''}
            {r.isBiggestDrop ? ' · biggest drop' : ''}
          </span>
        </div>
      ))}
    </div>
  );
}
