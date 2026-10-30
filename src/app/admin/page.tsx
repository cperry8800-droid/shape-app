// The admin console's Overview: Shape's numbers, analyst level and up, in views so no page is a
// wall of numbers. The summary leads with what is waiting on the team, then the key numbers and the
// last 30 days; Growth, Money, Coaching and Engagement hold the rest (OVERVIEW_VIEWS, ?view=), and
// Clicks shows where people tap on the website and in the app (./ClicksView.tsx), and Radio how Shape
// Radio is listened to (./RadioView.tsx).
//
// One database call (admin_overview_stats, service role only) returns every number, and the
// funnel comes from get_funnel, as on the War Room. src/lib/admin-overview.mjs turns both into
// what this page draws, so the page itself only renders. The Clicks and Radio views make their own
// calls instead (admin_click_stats and admin_radio_stats, also service role only): daily totals of
// taps and of listening, never who tapped or listened.
//
// Page views are Vercel Analytics' and payouts, disputes and tax are Stripe's: both are linked,
// not copied, so the console never holds either service's keys.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/admin-access';
import { canOpen, type StaffLevel } from '@/lib/staff-levels.mjs';
import { createAdminClient } from '@/lib/supabase/admin';
import { waitingCount } from '@/lib/admin-waiting';
import { buildFunnel } from '@/lib/funnel.mjs';
import type { FunnelRow } from '@/lib/funnel';
import { clickFilters, clickStatsArgs, type ClickFilters } from '@/lib/admin-clicks.mjs';
import { radioFilters, radioStatsArgs, type RadioFilters } from '@/lib/admin-radio.mjs';
import {
  celebrationCounts,
  DAILY_CHARTS,
  dailyColumns,
  formatCount,
  keyNumbers,
  OVERVIEW_VIEWS,
  overviewSections,
  overviewView,
  sourceRows,
  surfaceLine,
  tierBreakdown,
  viewHref,
  waitingLine,
  type AdminOverviewStats,
  type CelebrationCounts,
  type TierRow,
  type DailyRow,
  type OverviewSection,
  type OverviewTile,
} from '@/lib/admin-overview.mjs';
import ClicksView, { type ClicksResult } from './ClicksView';
import RadioView, { type RadioResult } from './RadioView';
import { ADMIN_TIMEZONE, DISPLAY, EYEBROW, MONO, PAGE_TITLE, PANEL, Period, SectionHead } from './ui';

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

// This week's birthdays and anniversaries, as counts only (the names are on the Members page,
// Support and up).
async function loadCelebrations(): Promise<CelebrationCounts | null> {
  try {
    const { data, error } = await createAdminClient().rpc('admin_upcoming_celebrations', { p_tz: TIMEZONE, p_days: 7 });
    return error || !data ? null : celebrationCounts(data);
  } catch {
    return null;
  }
}

async function loadClicks(filters: ClickFilters): Promise<ClicksResult> {
  try {
    const { data, error } = await createAdminClient().rpc('admin_click_stats', clickStatsArgs(filters, TIMEZONE));
    const missing = Boolean(error && MISSING_FUNCTION.has(String(error.code)));
    return { data: error ? null : data, missing, failed: Boolean(error && !missing) };
  } catch {
    return { data: null, missing: false, failed: true };
  }
}

async function loadRadio(filters: RadioFilters): Promise<RadioResult> {
  try {
    const { data, error } = await createAdminClient().rpc('admin_radio_stats', radioStatsArgs(filters, TIMEZONE));
    const missing = Boolean(error && MISSING_FUNCTION.has(String(error.code)));
    return { data: error ? null : data, missing, failed: Boolean(error && !missing) };
  } catch {
    return { data: null, missing: false, failed: true };
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

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string; days?: string; surface?: string; who?: string }>;
}) {
  let level: StaffLevel = 'analyst';
  try {
    level = (await requireStaff('analyst')).level;
  } catch {
    redirect('/login?next=/admin');
  }
  const params = await searchParams;
  const view = overviewView(params?.view);
  const growth = view.key === 'growth';
  const clicks = view.key === 'clicks';
  const clickView = clickFilters(params);
  const radio = view.key === 'radio';
  const radioView = radioFilters(params);

  // The funnel and this week's birthdays are Growth's alone; the open account requests, the
  // summary's (the same count as the sidebar's badge). Clicks and Radio read only their own counts.
  const [{ stats, missing, failed }, funnel, celebrations, accountRequests, clickResult, radioResult] = await Promise.all([
    clicks || radio ? Promise.resolve({ stats: null, missing: false, failed: false }) : loadStats(),
    growth ? loadFunnel() : Promise.resolve(null),
    growth ? loadCelebrations() : Promise.resolve(null),
    view.key === 'summary' ? waitingCount('/admin/requests') : Promise.resolve(null),
    clicks ? loadClicks(clickView) : Promise.resolve(null),
    radio ? loadRadio(radioView) : Promise.resolve(null),
  ]);
  // A tile links only to a page this level opens ('/admin/members#birthdays' is the Members page).
  const openable = (t: OverviewTile) => (t.href && !canOpen(level, t.href.split(/[?#]/)[0]) ? { ...t, href: '' } : t);
  const sections = (stats ? overviewSections(stats, { celebrations, accountRequests }) : []).map((s) => ({ ...s, tiles: s.tiles.map(openable) }));
  const section = (key: string) => sections.find((s) => s.key === key);
  const daily = (stats?.daily ?? []) as DailyRow[];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-border-hairline pb-5">
        <div className="flex flex-col gap-2 min-w-0">
          <h2 className={PAGE_TITLE}>
            Overview<Period />
          </h2>
          <p className={`${MONO} flex flex-wrap gap-x-3 gap-y-1 text-[11px] uppercase tracking-[0.14em] text-neutral-500`}>
            {stats?.generated_at && (
              <span>
                As of {new Date(stats.generated_at).toLocaleString('en-US', { timeZone: TIMEZONE, dateStyle: 'medium', timeStyle: 'short' })}
                {stats.timezone ? ` · days in ${stats.timezone}` : ''}
              </span>
            )}
            <ExternalLink href={VERCEL_ANALYTICS}>Page views (Vercel)</ExternalLink>
            <ExternalLink href={STRIPE_DASHBOARD}>Payments (Stripe)</ExternalLink>
          </p>
        </div>
        <nav aria-label="Overview views" className="flex overflow-x-auto [scrollbar-width:none] border border-border-hairline max-w-full">
          {OVERVIEW_VIEWS.map((v) => {
            const open = v.key === view.key;
            return (
              <Link
                key={v.key}
                href={viewHref(v.key)}
                aria-current={open ? 'page' : undefined}
                className={`${MONO} ${FOCUS} shrink-0 inline-flex items-center min-h-[40px] px-4 text-[11px] uppercase tracking-[0.14em] transition-colors ${
                  open ? 'bg-neutral-100 text-neutral-950' : 'text-neutral-400 hover:text-neutral-50 hover:bg-white/5'
                }`}
              >
                {v.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {missing && (
        <div className="border border-amber-400/30 bg-amber-400/10 text-amber-200 text-sm px-4 py-3">
          Not set up yet: run supabase-migrations/2026-10-13-staff-access-and-admin-stats.sql.
        </div>
      )}
      {failed && (
        <div className="border border-red-400/30 bg-red-400/10 text-red-200 text-sm px-4 py-3">
          The numbers could not be loaded. Reload the page; if it keeps failing, check the Supabase logs.
        </div>
      )}

      {stats && view.key === 'summary' && (
        // On a wide screen the key numbers ride beside the inbox and the 30 days; narrower, they
        // follow the inbox, before the charts.
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:grid-rows-[auto_1fr] items-start">
          <div className="xl:col-start-1 xl:row-start-1 min-w-0">
            <Inbox tiles={section('queues')?.tiles ?? []} />
          </div>
          <div className="xl:col-start-2 xl:row-start-1 xl:row-span-2 min-w-0">
            <KeyNumbers tiles={keyNumbers(sections).map(openable)} />
          </div>
          {daily.length > 0 && (
            <div className="xl:col-start-1 xl:row-start-2 min-w-0">
              <LastThirtyDays daily={daily} />
            </div>
          )}
          <div className="xl:col-span-2 min-w-0">
            <ViewCards sections={sections} />
          </div>
        </div>
      )}

      {view.sections.map((key) => {
        const s = section(key);
        return s ? <Section key={key} section={s} /> : null;
      })}

      {stats && growth && <SignupSources sources={stats.signup_sources as SignupSourceStats | undefined} />}

      {funnel && growth && (
        <section className="flex flex-col gap-4">
          <SectionHead
            title="Sign-up funnel, last 30 days"
            note="Of the accounts that signed up in the last 30 days, how many reached each step. The app records these steps only where its analytics consent allows."
          />
          <Funnel rows={funnel} />
        </section>
      )}

      {stats && view.key === 'engagement' && <ScoreTiers tiers={tierBreakdown(stats)} />}

      {clickResult && <ClicksView filters={clickView} result={clickResult} />}

      {radioResult && <RadioView filters={radioView} result={radioResult} />}
    </div>
  );
}

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2';

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`${FOCUS} text-neutral-300 hover:text-accent transition-colors`}>
      {children} <span aria-hidden="true">↗</span>
    </a>
  );
}

// What is waiting on the team, first: the queues' total as a sentence, then a row for each,
// opening where it is handled. The spine is the accent while anything waits.
function Inbox({ tiles }: { tiles: OverviewTile[] }) {
  const { total, line } = waitingLine(tiles);
  return (
    <section aria-labelledby="waiting" className={`${PANEL} relative`}>
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-[3px] ${total ? 'bg-accent' : 'bg-white/15'}`} />
      <div className="px-5 sm:px-6 pt-5 pb-4">
        <h3 id="waiting" className={EYEBROW}>
          Waiting on the team
        </h3>
        <p className={`${DISPLAY} text-2xl sm:text-[28px] font-light tracking-tight text-neutral-50 mt-2`}>{line}</p>
      </div>
      <ul>
        {tiles.map((t) => {
          const waiting = (t.count ?? 0) > 0;
          const body = (
            <>
              <span className={`text-2xl font-light tabular-nums w-10 shrink-0 ${waiting ? 'text-neutral-50' : 'text-neutral-600'}`}>{t.value}</span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm ${waiting ? 'text-neutral-100' : 'text-neutral-400'}`}>{t.label}</span>
                {t.sub && <span className="block text-xs text-neutral-500 mt-0.5">{t.sub}</span>}
              </span>
              {t.href && (
                <span className={`${MONO} shrink-0 border border-white/15 px-3 py-2 text-[10.5px] uppercase tracking-[0.14em] text-neutral-300 group-hover:border-accent/60 group-hover:text-neutral-50 transition-colors`}>
                  Open <span aria-hidden="true">→</span>
                </span>
              )}
            </>
          );
          const cls = 'flex items-center gap-4 px-5 sm:px-6 py-3.5 border-t border-border-hairline';
          return (
            <li key={t.label}>
              {t.href ? (
                <Link href={t.href} className={`${cls} ${FOCUS} group hover:bg-white/[0.02] transition-colors`}>
                  {body}
                </Link>
              ) : (
                <div className={cls}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// The summary's key numbers as a column of rows: each opens the view that has the rest.
function KeyNumbers({ tiles }: { tiles: OverviewTile[] }) {
  return (
    <section aria-labelledby="key-numbers" className={PANEL}>
      <h3 id="key-numbers" className={`${EYEBROW} px-5 pt-5 pb-3`}>
        Key numbers
      </h3>
      <ul>
        {tiles.map((t) => {
          const body = (
            <>
              <span className="min-w-0">
                <span className="block text-[13px] text-neutral-200">{t.label}</span>
                {t.sub && <span className="block text-xs text-neutral-500 mt-0.5">{t.sub}</span>}
              </span>
              <span className="text-2xl font-light tabular-nums text-neutral-50 shrink-0">{t.value}</span>
            </>
          );
          const cls = 'flex items-baseline justify-between gap-4 px-5 py-3 border-t border-border-hairline';
          return (
            <li key={t.label}>
              {t.href ? (
                <Link href={t.href} className={`${cls} ${FOCUS} hover:bg-white/[0.02] transition-colors`}>
                  {body}
                </Link>
              ) : (
                <div className={cls}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// The rest of the numbers, one card per view, each naming what it holds.
function ViewCards({ sections }: { sections: OverviewSection[] }) {
  const titles = (keys: ReadonlyArray<string>) =>
    keys.map((k) => sections.find((s) => s.key === k)?.title).filter(Boolean).join(' · ');
  return (
    <nav aria-label="The views" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {OVERVIEW_VIEWS.filter((v) => v.key !== 'summary').map((v) => (
        <Link key={v.key} href={viewHref(v.key)} className={`${PANEL} ${FOCUS} group flex flex-col gap-1.5 p-4 hover:border-accent/50 transition-colors`}>
          <span className={EYEBROW}>View</span>
          <span className={`${DISPLAY} text-xl font-light text-neutral-50`}>
            {v.label} <span aria-hidden="true" className="text-neutral-600 group-hover:text-accent transition-colors">→</span>
          </span>
          <span className="text-xs text-neutral-500">{v.blurb ?? titles(v.sections)}</span>
        </Link>
      ))}
    </nav>
  );
}

function Section({ section }: { section: OverviewSection }) {
  return (
    <section className="flex flex-col gap-4">
      <SectionHead title={section.title} note={section.note} />
      <TileGrid tiles={section.tiles} />
    </section>
  );
}

function TileGrid({ tiles }: { tiles: OverviewTile[] }) {
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      {tiles.map((t) => (
        <StatTile key={t.label} tile={t} />
      ))}
    </div>
  );
}

// A number with its label above and what it counts below. A tile that opens a page says so with
// an arrow, and its edge takes the accent on hover.
function StatTile({ tile: t }: { tile: OverviewTile }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className={`${EYEBROW} leading-snug`}>{t.label}</span>
        {t.href && (
          <span aria-hidden="true" className="text-neutral-600 group-hover:text-accent transition-colors">
            →
          </span>
        )}
      </div>
      <div className="text-3xl font-light tracking-tight tabular-nums text-neutral-50 mt-3 break-words">{t.value}</div>
      {t.sub && <div className="text-xs text-neutral-500 mt-1.5 leading-relaxed">{t.sub}</div>}
    </>
  );
  const cls = `${PANEL} flex flex-col p-4 min-w-0`;
  return t.href ? (
    <Link href={t.href} className={`${cls} ${FOCUS} group hover:border-accent/50 transition-colors`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function LastThirtyDays({ daily }: { daily: DailyRow[] }) {
  return (
    <section aria-labelledby="last-30" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="last-30" className={EYEBROW}>
          Last 30 days
        </h3>
        <span className="text-xs text-neutral-500">Hover a column for its day. Each chart has its own scale.</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {DAILY_CHARTS.map((c) => (
          <DailyChart key={c.key} title={c.title} daily={daily} field={c.key} />
        ))}
      </div>
      <details className={`${PANEL} p-4`}>
        <summary className={`${EYEBROW} cursor-pointer`}>The 30 days as a table</summary>
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
                <tr key={d.day} className="border-t border-border-hairline text-neutral-300">
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
  );
}

function ScoreTiers({ tiers }: { tiers: { members: TierRow[]; coaches: TierRow[] } }) {
  return (
    <section className="flex flex-col gap-4">
      <SectionHead
        title="Shape Score tiers"
        note="How many accounts sit at each tier, on the points that set it (everything earned, without Store purchases or tier bonuses; a tier never drops). Coaches climb the same rungs under their own names."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Tiers title="Members" rows={tiers.members} />
        <Tiers title="Coaches" rows={tiers.coaches} />
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
    <figure className={`${PANEL} p-4 min-w-0`}>
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className={EYEBROW}>{title}</span>
        <span className="text-xs text-neutral-500 tabular-nums">{formatCount(total)} in 30 days</span>
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
          <line x1="0" y1={CHART_H - 0.5} x2={CHART_W} y2={CHART_H - 0.5} stroke="var(--border-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {cols.map((c) => (
            <g key={c.day}>
              {/* The hit target is the whole day's slot, taller than the column. */}
              <rect x={c.x - 1} y={0} width={c.w + 2} height={CHART_H} fill="transparent">
                <title>{`${c.day}: ${formatCount(c.value)}`}</title>
              </rect>
              {c.h > 0 && (
                <path d={columnPath(c.x, c.y, c.w, c.h)} fill="var(--accent)" pointerEvents="none" />
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

// A column with a softened top (up to 2 units) and a square foot on the baseline.
function columnPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(2, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

type SignupSourceStats = {
  sources_30d?: unknown;
  sources_all?: unknown;
  surface_30d?: Record<string, number>;
  surface_all?: Record<string, number>;
  campaigns_30d?: Array<{ campaign: string; count: number }>;
};

function SignupSources({ sources }: { sources?: SignupSourceStats }) {
  const last30 = sourceRows(sources?.sources_30d);
  const all = sourceRows(sources?.sources_all);
  const campaigns = Array.isArray(sources?.campaigns_30d) ? sources.campaigns_30d : [];
  return (
    <section className="flex flex-col gap-4">
      <SectionHead
        title="Sign-ups by source"
        note="Where new accounts came from: a coach’s referral link, the link’s utm_source tag, the site that sent them, or the app. “Direct” came with neither a tag nor another site. “Not recorded” is every account made before sources were recorded."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Bars title="Last 30 days" note={surfaceLine(sources?.surface_30d)} rows={last30.map((r) => ({ name: r.source, count: r.count }))} />
        <Bars title="All time" note={surfaceLine(sources?.surface_all)} rows={all.map((r) => ({ name: r.source, count: r.count }))} />
      </div>
      {campaigns.length > 0 && (
        <p className="text-sm text-neutral-400">
          Campaigns, last 30 days: {campaigns.map((c) => `${c.campaign} ${formatCount(c.count)}`).join(' · ')}
        </p>
      )}
    </section>
  );
}

// A single-hue bar list on one scale (a count is a magnitude).
function Bars({ title, note, rows }: { title: string; note: string; rows: Array<{ name: string; count: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className={`${PANEL} p-4 flex flex-col gap-3`}>
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className={EYEBROW}>{title}</span>
        <span className="text-xs text-neutral-500">{note}</span>
      </div>
      {rows.length === 0 && <div className="text-sm text-neutral-500">No sign-ups.</div>}
      {rows.map((r) => (
        <div key={r.name} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="text-neutral-300 truncate" title={r.name}>{r.name}</span>
          <div className="h-2 bg-white/[0.06] overflow-hidden" aria-hidden="true">
            <div className="h-full bg-accent" style={{ width: `${Math.round((r.count / max) * 100)}%` }} />
          </div>
          <span className="text-neutral-400 tabular-nums text-right">{formatCount(r.count)}</span>
        </div>
      ))}
    </div>
  );
}

// One bar per tier, on one scale for the panel: the count is a magnitude, so one hue.
function Tiers({ title, rows }: { title: string; rows: TierRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((t, r) => t + r.count, 0);
  return (
    <div className={`${PANEL} p-4 flex flex-col gap-3`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={EYEBROW}>{title}</span>
        <span className="text-xs text-neutral-500 tabular-nums">{formatCount(total)} accounts</span>
      </div>
      {rows.map((r) => (
        <div key={r.name} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="text-neutral-300 truncate">
            {r.name} <span className="text-neutral-500 text-xs">{formatCount(r.from)}+</span>
          </span>
          <div className="h-2 bg-white/[0.06] overflow-hidden" aria-hidden="true">
            <div className="h-full bg-accent" style={{ width: `${Math.round((r.count / max) * 100)}%` }} />
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
    <div className={`${PANEL} p-4 flex flex-col gap-3`}>
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="text-neutral-300 truncate">{r.label}</span>
          <div className="h-2 bg-white/[0.06] overflow-hidden" aria-hidden="true">
            <div className="h-full bg-accent" style={{ width: `${Math.round((r.count / max) * 100)}%` }} />
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
