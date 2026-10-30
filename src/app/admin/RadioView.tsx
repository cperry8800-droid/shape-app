// The Overview's Radio view (/admin?view=radio; owner, 2026-10-30: "do we have any tracking for shape
// radio?", then "Yes build it"): who is listening now, tune-ins, time listened, the average listen and
// the most listening at once, split by website or app and by member or coach, as daily totals.
//
// The Overview (./page.tsx) makes the one call (admin_radio_stats, service role only) for the
// view's period (?days) and hands its answer here; src/lib/admin-radio.mjs turns it into what this
// draws. Not a route: Next only routes page and route files.

import { dailyColumns, formatCount } from '@/lib/admin-overview.mjs';
import { RADIO_PERIODS, listenShare, listenTime, radioHref, radioSummary, type RadioFilters, type RadioSplit, type RadioSummary } from '@/lib/admin-radio.mjs';
import { Segments } from './ClicksView';
import { ADMIN_TIMEZONE, EYEBROW, MONO, Notice, PANEL, SectionHead, formatDay, formatWhen } from './ui';

const MIGRATION = 'supabase-migrations/2026-10-30-radio-listening.sql';

export type RadioResult = { data: unknown; missing: boolean; failed: boolean };

export default function RadioView({ filters, result }: { filters: RadioFilters; result: RadioResult }) {
  const s = radioSummary(result.missing || result.failed ? null : result.data);
  const ok = !result.missing && !result.failed;
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <SectionHead
          title="How Shape Radio is listened to"
          note="Tune-ins and time listened on the website and in the app, as daily totals. The stream is for members, so every listener is a member or a coach; who listened is never kept with a count."
        />
        {ok && s.from && (
          <p className={`${MONO} text-[11px] uppercase tracking-[0.14em] text-neutral-500`}>
            {formatDay(s.from)} to {formatDay(s.to)} · days in {ADMIN_TIMEZONE}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Segments
            label="Period"
            items={RADIO_PERIODS.map((d) => ({ key: String(d), label: `${d} days`, href: radioHref(filters, { days: d }), on: d === filters.days }))}
          />
        </div>
      </section>

      {result.missing && <Notice tone="amber">Not set up yet: run {MIGRATION}. Until it runs, listening is not counted.</Notice>}
      {result.failed && (
        <Notice tone="red">The counts could not be loaded. Reload the page; if it keeps failing, check the Supabase logs.</Notice>
      )}

      {ok && (
        <>
          <Totals s={s} />
          <Splits s={s} />
          {s.tuneIns === 0 ? (
            <div className={`${PANEL} p-8 text-sm text-neutral-400`}>Nobody has listened in these days yet.</div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              <DailyChart daily={s.daily} valueKey="minutes" title="Minutes listened a day" unit="minutes" />
              <DailyChart daily={s.daily} valueKey="tune_ins" title="Tune-ins a day" unit="tune-ins" />
            </div>
          )}
          <HowCounted />
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={`${PANEL} flex flex-col p-4 min-w-0`}>
      <span className={`${EYEBROW} leading-snug`}>{label}</span>
      <span className="text-3xl font-light tracking-tight tabular-nums text-neutral-50 mt-3">{value}</span>
      {sub && <span className="text-xs text-neutral-500 mt-1.5">{sub}</span>}
    </div>
  );
}

function nowLine(now: RadioSummary['now']): string {
  if (!now.listeners) return 'Nobody right now';
  const parts = [now.app ? `${formatCount(now.app)} in the app` : '', now.web ? `${formatCount(now.web)} on the website` : ''];
  return parts.filter(Boolean).join(' · ');
}

function Totals({ s }: { s: RadioSummary }) {
  return (
    <section aria-label="Totals" className="grid grid-cols-2 xl:grid-cols-5 gap-3">
      <Tile label="Listening now" value={formatCount(s.now.listeners)} sub={nowLine(s.now)} />
      <Tile label="Tune-ins" value={formatCount(s.tuneIns)} sub="Each time the stream started" />
      <Tile label="Time listened" value={listenTime(s.seconds)} sub="All listeners together" />
      <Tile label="Average listen" value={listenTime(s.average)} sub="Per tune-in" />
      <Tile
        label="Most at once"
        value={formatCount(s.peak?.listeners ?? 0)}
        sub={s.peak ? formatWhen(s.peak.at, true) : 'No listening yet'}
      />
    </section>
  );
}

function Splits({ s }: { s: RadioSummary }) {
  const sub = (p: RadioSplit) =>
    s.seconds ? `${listenShare(p.seconds, s.seconds)} of the time · ${formatCount(p.tuneIns)} tune-in${p.tuneIns === 1 ? '' : 's'}` : `${formatCount(p.tuneIns)} tune-ins`;
  return (
    <section aria-label="Where and who" className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      <Tile label="In the app" value={listenTime(s.surfaces.app.seconds)} sub={sub(s.surfaces.app)} />
      <Tile label="On the website" value={listenTime(s.surfaces.web.seconds)} sub={sub(s.surfaces.web)} />
      <Tile label="Members" value={listenTime(s.audiences.member.seconds)} sub={sub(s.audiences.member)} />
      <Tile label="Coaches" value={listenTime(s.audiences.coach.seconds)} sub={sub(s.audiences.coach)} />
    </section>
  );
}

const CHART_W = 600;
const CHART_H = 120;

// One column a day, on the Overview's scale rules (dailyColumns): a count is a magnitude, so one hue.
// A column's title also gives the day's most listening at once.
function DailyChart({ daily, valueKey, title, unit }: { daily: RadioSummary['daily']; valueKey: 'minutes' | 'tune_ins'; title: string; unit: string }) {
  const { top, total, cols } = dailyColumns(daily, valueKey, { width: CHART_W, height: CHART_H });
  return (
    <figure className={`${PANEL} p-4 min-w-0`}>
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className={EYEBROW}>{title}</span>
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
          aria-label={`${title}: ${formatCount(total)} ${unit} in all`}
        >
          <line x1="0" y1={CHART_H - 0.5} x2={CHART_W} y2={CHART_H - 0.5} stroke="var(--border-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {cols.map((c, i) => (
            <g key={c.day}>
              <rect x={c.x - 1} y={0} width={c.w + 2} height={CHART_H} fill="transparent">
                <title>{`${c.day}: ${formatCount(c.value)} ${unit} · most at once ${formatCount(daily[i]?.peak ?? 0)}`}</title>
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

function HowCounted() {
  return (
    <details className={`${PANEL} p-4`}>
      <summary className={`${EYEBROW} cursor-pointer`}>How listening is counted</summary>
      <ul className="mt-3 flex flex-col gap-2 text-sm text-neutral-400 max-w-3xl list-disc pl-5">
        <li>
          The player on the website and in the app sends a beat as the stream starts playing, one a minute while it plays, and one as it
          stops. A tune-in is each time the stream starts; the time listened is what the beats say played, never more than has passed.
        </li>
        <li>
          An account is one listener: a second device on the same account adds its tune-in but no extra time, and counts once in
          listening now. A listen that stops without saying so (the app closed, the tab killed) loses at most its last minute.
        </li>
        <li>
          Listening now is every account whose last beat came in the last two and a half minutes; most at once is the highest that
          figure reached on a day. While someone listens, the server keeps a note that their account is listening, and deletes it when
          they stop, or within a day if a listen ends without saying so. The daily totals never hold an account.
        </li>
        <li>
          Only where consent allows: never with Global Privacy Control or after a Reject, and in the EEA and the UK not until the banner
          is accepted. The app has no banner yet, so in the EEA and the UK it counts nothing.
        </li>
        <li>Days are in {ADMIN_TIMEZONE}. Counts are kept 12 months.</li>
      </ul>
    </details>
  );
}
