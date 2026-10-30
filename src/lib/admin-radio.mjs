// The Overview's Radio view (/admin?view=radio, src/app/admin/RadioView.tsx): how Shape Radio is
// listened to. Its period, and what it draws from admin_radio_stats
// (supabase-migrations/2026-10-30-radio-listening.sql). Pure, so tests/radio-listening.test.mjs runs
// it directly and the view only renders.
//
// What a tune-in and a second listened are is in public/newdesign/radioListening.mjs (the players'
// beats) and record_radio_listen (what the server credits).

export const RADIO_PERIODS = [7, 30, 90];

const DEFAULT_DAYS = 30;

function one(v) {
  return Array.isArray(v) ? v[0] : v;
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
}

/** The view's period from its query (?days=7); anything unknown is 30 days. */
export function radioFilters(params) {
  const p = params && typeof params === 'object' ? params : {};
  const days = Number(one(p.days));
  return { days: RADIO_PERIODS.includes(days) ? days : DEFAULT_DAYS };
}

/** The view's link for this period; the default is left out of the query. */
export function radioHref(filters, patch = {}) {
  const f = { ...filters, ...patch };
  const q = new URLSearchParams({ view: 'radio' });
  if (f.days !== DEFAULT_DAYS) q.set('days', String(f.days));
  return `/admin?${q.toString()}`;
}

/** What admin_radio_stats is asked for this period. */
export function radioStatsArgs(filters, timezone) {
  return { p_days: filters.days, p_tz: timezone };
}

/** Seconds as people say a listen's length: "45 min", "3 h 05 min", "under a minute", "none". */
export function listenTime(seconds) {
  const s = n(seconds);
  if (s === 0) return 'none';
  if (s < 60) return 'under a minute';
  const minutes = Math.round(s / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  return `${h.toLocaleString('en-US')} h ${String(minutes % 60).padStart(2, '0')} min`;
}

function split(v) {
  const o = v && typeof v === 'object' ? v : {};
  return { tuneIns: n(o.tune_ins), seconds: n(o.seconds) };
}

/** Everything the page draws, from admin_radio_stats's answer (missing parts read as none). */
export function radioSummary(stats) {
  const s = stats && typeof stats === 'object' ? stats : {};
  const bySurface = s.by_surface && typeof s.by_surface === 'object' ? s.by_surface : {};
  const byAudience = s.by_audience && typeof s.by_audience === 'object' ? s.by_audience : {};
  const now = s.now && typeof s.now === 'object' ? s.now : {};
  const peak = s.peak && typeof s.peak === 'object' && n(s.peak.listeners) > 0 ? s.peak : null;
  const tuneIns = n(s.tune_ins);
  const seconds = n(s.seconds);
  return {
    from: String(s.from ?? ''),
    to: String(s.to ?? ''),
    tuneIns,
    seconds,
    // Time per tune-in: the seconds over the tune-ins (none without a tune-in). Not a listen's average
    // length: a listen begun before the period brings its seconds but not its tune-in.
    average: tuneIns > 0 ? seconds / tuneIns : 0,
    surfaces: { web: split(bySurface.web), app: split(bySurface.app) },
    audiences: { member: split(byAudience.member), coach: split(byAudience.coach) },
    daily: (Array.isArray(s.daily) ? s.daily.filter((d) => d && typeof d === 'object') : []).map((d) => ({
      day: String(d.day ?? ''),
      tune_ins: n(d.tune_ins),
      // Not rounded here: the chart adds the days up, and rounding each first would make 30 seconds
      // on each of seven days read as seven minutes (Codex P2 on #2527). The chart rounds what it shows.
      minutes: n(d.seconds) / 60,
      peak: n(d.peak),
    })),
    peak: peak ? { listeners: n(peak.listeners), at: String(peak.at ?? ''), day: String(peak.day ?? '') } : null,
    now: { listeners: n(now.listeners), web: n(now.web), app: n(now.app) },
  };
}

/** A part's share of the listening, as a whole percent ('' with none). */
export function listenShare(seconds, total) {
  return total > 0 ? `${Math.round((n(seconds) / total) * 100)}%` : '';
}
