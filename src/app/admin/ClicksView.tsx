// The Overview's Clicks view (/admin?view=clicks; owner, 2026-10-28: "add to admin page where
// user/members click on website/app"): every button, link and tab on the website and in the app,
// counted per page as daily totals, split by website or app and by visitor, member or coach.
//
// The Overview (./page.tsx) makes the one call (admin_click_stats, service role only) for the
// view's filters (?days, ?surface, ?who) and hands its answer here; src/lib/admin-clicks.mjs turns
// it into what this draws. Not a route: Next only routes page and route files.

import Link from 'next/link';
import { dailyColumns, formatCount } from '@/lib/admin-overview.mjs';
import {
  CLICK_AUDIENCES,
  CLICK_PERIODS,
  CLICK_SURFACES,
  SURFACE_LABELS,
  clickSummary,
  clicksHref,
  shareOf,
  type ClickFilters,
  type ClickSummary,
} from '@/lib/admin-clicks.mjs';
import { ADMIN_TIMEZONE, EYEBROW, MONO, Notice, PANEL, SectionHead, formatDay } from './ui';

const MIGRATION = 'supabase-migrations/2026-10-28-click-counts.sql';
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2';

export type ClicksResult = { data: unknown; missing: boolean; failed: boolean };

export default function ClicksView({ filters, result }: { filters: ClickFilters; result: ClicksResult }) {
  const s = clickSummary(result.missing || result.failed ? null : result.data);
  const ok = !result.missing && !result.failed;
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <SectionHead
          title="Where people tap"
          note="Each button, link and tab on the website and in the app, counted per page as daily totals. Who tapped is never kept, only whether they were a visitor, a member or a coach."
        />
        {ok && s.from && (
          <p className={`${MONO} text-[11px] uppercase tracking-[0.14em] text-neutral-500`}>
            {formatDay(s.from)} to {formatDay(s.to)} · days in {ADMIN_TIMEZONE}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Segments
            label="Period"
            items={CLICK_PERIODS.map((d) => ({ key: String(d), label: `${d} days`, href: clicksHref(filters, { days: d }), on: d === filters.days }))}
          />
          <Segments
            label="Where"
            items={CLICK_SURFACES.map((v) => ({ key: v.key, label: v.label, href: clicksHref(filters, { surface: v.key }), on: v.key === filters.surface }))}
          />
          <Segments
            label="Who"
            items={CLICK_AUDIENCES.map((v) => ({ key: v.key, label: v.label, href: clicksHref(filters, { who: v.key }), on: v.key === filters.who }))}
          />
        </div>
      </section>

      {result.missing && <Notice tone="amber">Not set up yet: run {MIGRATION}. Until it runs, taps are not counted.</Notice>}
      {result.failed && (
        <Notice tone="red">The counts could not be loaded. Reload the page; if it keeps failing, check the Supabase logs.</Notice>
      )}

      {ok && (
        <>
          <Totals s={s} showSurfaces={filters.surface === 'all'} showAudiences={filters.who === 'all'} />
          {s.total === 0 ? (
            <div className={`${PANEL} p-8 text-sm text-neutral-400`}>No taps counted in these days yet.</div>
          ) : (
            <>
              <DailyChart daily={s.daily} />
              <TopPages s={s} />
              <TopTargets s={s} />
            </>
          )}
          <HowCounted />
        </>
      )}
    </div>
  );
}

type Segment = { key: string; label: string; href: string; on: boolean };

// The Radio view (./RadioView.tsx) draws its period with these too.
export function Segments({ label, items }: { label: string; items: Segment[] }) {
  return (
    <nav aria-label={label} className="flex overflow-x-auto [scrollbar-width:none] border border-border-hairline max-w-full">
      {items.map((v) => (
        <Link
          key={v.key}
          href={v.href}
          aria-current={v.on ? 'page' : undefined}
          className={`${MONO} ${FOCUS} shrink-0 inline-flex items-center min-h-[40px] px-4 text-[11px] uppercase tracking-[0.14em] transition-colors ${
            v.on ? 'bg-neutral-100 text-neutral-950' : 'text-neutral-400 hover:text-neutral-50 hover:bg-white/5'
          }`}
        >
          {v.label}
        </Link>
      ))}
    </nav>
  );
}

function Tile({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className={`${PANEL} flex flex-col p-4 min-w-0`}>
      <span className={`${EYEBROW} leading-snug`}>{label}</span>
      <span className="text-3xl font-light tracking-tight tabular-nums text-neutral-50 mt-3">{formatCount(value)}</span>
      {sub && <span className="text-xs text-neutral-500 mt-1.5">{sub}</span>}
    </div>
  );
}

function Totals({ s, showSurfaces, showAudiences }: { s: ClickSummary; showSurfaces: boolean; showAudiences: boolean }) {
  const share = (n: number) => (s.total ? `${shareOf(n, s.total)} of taps` : '');
  return (
    <section aria-label="Totals" className="grid grid-cols-2 xl:grid-cols-6 gap-3">
      <Tile label="Taps" value={s.total} sub="On the filters above" />
      {showSurfaces && <Tile label="Website" value={s.surfaces.web} sub={share(s.surfaces.web)} />}
      {showSurfaces && <Tile label="App" value={s.surfaces.app} sub={share(s.surfaces.app)} />}
      {showAudiences && <Tile label="Visitors" value={s.audiences.visitor} sub={share(s.audiences.visitor)} />}
      {showAudiences && <Tile label="Members" value={s.audiences.member} sub={share(s.audiences.member)} />}
      {showAudiences && <Tile label="Coaches" value={s.audiences.coach} sub={share(s.audiences.coach)} />}
    </section>
  );
}

const CHART_W = 600;
const CHART_H = 120;

// One column a day, on the Overview's scale rules (dailyColumns): a count is a magnitude, so one hue.
function DailyChart({ daily }: { daily: ClickSummary['daily'] }) {
  const { top, total, cols } = dailyColumns(daily, 'clicks', { width: CHART_W, height: CHART_H });
  return (
    <figure className={`${PANEL} p-4 min-w-0`}>
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className={EYEBROW}>Taps a day</span>
        <span className="text-xs text-neutral-500 tabular-nums">{formatCount(total)} in all · hover a column for its day</span>
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
          aria-label={`Taps a day: ${formatCount(total)} in all`}
        >
          <line x1="0" y1={CHART_H - 0.5} x2={CHART_W} y2={CHART_H - 0.5} stroke="var(--border-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {cols.map((c) => (
            <g key={c.day}>
              <rect x={c.x - 1} y={0} width={c.w + 2} height={CHART_H} fill="transparent">
                <title>{`${c.day}: ${formatCount(c.value)}`}</title>
              </rect>
              {c.h > 0 && <rect x={c.x} y={c.y} width={c.w} height={c.h} fill="var(--accent)" pointerEvents="none" />}
            </g>
          ))}
        </svg>
      </div>
      <div className="flex justify-between text-[10px] text-neutral-500 mt-1 pl-6">
        <span>{cols[0]?.day ?? ''}</span>
        <span>{cols[cols.length - 1]?.day ?? ''}</span>
      </div>
    </figure>
  );
}

function SurfaceTag({ surface }: { surface: 'web' | 'app' }) {
  return (
    <span className={`${MONO} shrink-0 border border-white/10 px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.14em] text-neutral-500`}>
      {SURFACE_LABELS[surface]}
    </span>
  );
}

// A single-hue bar list on one scale, as the Overview's sources are drawn.
function TopPages({ s }: { s: ClickSummary }) {
  const max = Math.max(1, ...s.pages.map((p) => p.clicks));
  return (
    <section className="flex flex-col gap-4">
      <SectionHead title="Pages with the most taps" note="A website page by its file, an app screen by its name. The top 25." />
      <div className={`${PANEL} p-4 flex flex-col gap-3`}>
        {s.pages.map((p) => (
          <div key={`${p.surface}:${p.page}`} className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3 text-sm">
            <span className="flex items-center gap-2 min-w-0">
              <span className="text-neutral-300 truncate" title={p.page}>
                {p.name}
              </span>
              <SurfaceTag surface={p.surface} />
            </span>
            <div className="h-2 bg-white/[0.06] overflow-hidden" aria-hidden="true">
              <div className="h-full bg-accent" style={{ width: `${Math.round((p.clicks / max) * 100)}%` }} />
            </div>
            <span className="text-neutral-400 tabular-nums text-right">{formatCount(p.clicks)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function TopTargets({ s }: { s: ClickSummary }) {
  return (
    <section className="flex flex-col gap-4">
      <SectionHead
        title="Buttons and links with the most taps"
        note="Each control on its page, the top 100. A control is named only by Shape’s own copy; one carrying a person’s words, and any row or card, is counted by its kind."
      />
      <div className={`${PANEL} overflow-x-auto`}>
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className={`${EYEBROW} text-left`}>
              <th scope="col" className="px-4 py-3 font-normal">Button or link</th>
              <th scope="col" className="px-4 py-3 font-normal">Page</th>
              <th scope="col" className="px-4 py-3 font-normal text-right">Taps</th>
            </tr>
          </thead>
          <tbody>
            {s.targets.map((t, i) => (
              <tr key={`${t.surface}:${t.page}:${t.target}:${i}`} className="border-t border-border-hairline align-top">
                <td className={`px-4 py-2.5 break-words ${t.unnamed ? 'italic text-neutral-500' : 'text-neutral-100'}`}>{t.target}</td>
                <td className="px-4 py-2.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-neutral-400">{t.page}</span>
                    <SurfaceTag surface={t.surface} />
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right text-neutral-300">
                  {formatCount(t.clicks)} <span className="text-neutral-600 text-xs">{shareOf(t.clicks, s.total)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HowCounted() {
  return (
    <details className={`${PANEL} p-4`}>
      <summary className={`${EYEBROW} cursor-pointer`}>How taps are counted</summary>
      <ul className="mt-3 flex flex-col gap-2 text-sm text-neutral-400 max-w-3xl list-disc pl-5">
        <li>A tap on a button, a link, a tab or anything drawn to be tapped adds one to that control on its page for the day. Nothing typed is read.</li>
        <li>
          A control is named only by Shape&apos;s own copy: its words as written in the site or the app (the app&apos;s in English, so every
          language adds up). A name, a habit or a message on a control is never a label; that control is counted as a button, link or
          tab without a fixed label, and a row or a card by its kind alone. Numbers read as #.
        </li>
        <li>
          Only where consent allows: never with Global Privacy Control or after a Reject, and in the EEA and the UK not until the banner
          is accepted. The app has no banner yet, so in the EEA and the UK it counts nothing.
        </li>
        <li>Who tapped comes from the session sending the count; a website page without a signed-in session counts as a visitor.</li>
        <li>Counts are kept 12 months. A control can be named with data-track, or left out with data-no-track.</li>
      </ul>
    </details>
  );
}
