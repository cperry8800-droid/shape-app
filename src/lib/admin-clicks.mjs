// The Overview's Clicks view (/admin?view=clicks, src/app/admin/ClicksView.tsx): where people tap
// on the website and in the app. Its filters, and what it draws from admin_click_stats
// (supabase-migrations/2026-10-28-click-counts.sql). Pure, so tests/click-capture.test.mjs runs it
// directly and the view only renders.
//
// What a count is, and how a control gets its label, is in src/lib/click-capture.mjs.

import { UNNAMED } from './click-capture.mjs';

export const CLICK_PERIODS = [7, 30, 90];
export const CLICK_SURFACES = [
  { key: 'all', label: 'Website and app' },
  { key: 'web', label: 'Website' },
  { key: 'app', label: 'App' },
];
export const CLICK_AUDIENCES = [
  { key: 'all', label: 'Everyone' },
  { key: 'visitor', label: 'Visitors' },
  { key: 'member', label: 'Members' },
  { key: 'coach', label: 'Coaches' },
];
export const SURFACE_LABELS = { web: 'Website', app: 'App' };

const DEFAULT_DAYS = 30;

function one(v) {
  return Array.isArray(v) ? v[0] : v;
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
}

/** The view's filters from its query (?days=7&surface=web&who=member); anything unknown is the default. */
export function clickFilters(params) {
  const p = params && typeof params === 'object' ? params : {};
  const days = Number(one(p.days));
  const surface = String(one(p.surface) ?? '');
  const who = String(one(p.who) ?? '');
  return {
    days: CLICK_PERIODS.includes(days) ? days : DEFAULT_DAYS,
    surface: CLICK_SURFACES.some((s) => s.key === surface) ? surface : 'all',
    who: CLICK_AUDIENCES.some((a) => a.key === who) ? who : 'all',
  };
}

/** The view's link for these filters with `patch` applied; a default is left out of the query. */
export function clicksHref(filters, patch = {}) {
  const f = { ...filters, ...patch };
  const q = new URLSearchParams({ view: 'clicks' });
  if (f.days !== DEFAULT_DAYS) q.set('days', String(f.days));
  if (f.surface !== 'all') q.set('surface', f.surface);
  if (f.who !== 'all') q.set('who', f.who);
  return `/admin?${q.toString()}`;
}

/** What admin_click_stats is asked for these filters. */
export function clickStatsArgs(filters, timezone) {
  return {
    p_days: filters.days,
    p_surface: filters.surface === 'all' ? null : filters.surface,
    p_audience: filters.who === 'all' ? null : filters.who,
    p_tz: timezone,
  };
}

/** A page as the console names it: a website page by its file, an app screen by its name. */
export function pageName(surface, page) {
  const p = String(page ?? '');
  if (surface !== 'web') return p || 'App';
  if (p === '/' || /^\/newdesign\/?(?:index\.html)?$/i.test(p)) return 'Home page';
  return p.replace(/^\/newdesign\//, '/').replace(/\.html$/i, '').replace(/^\//, '') || 'Home page';
}

const UNNAMED_NAMES = {
  [UNNAMED.button]: 'A button with no name',
  [UNNAMED.link]: 'A link with no name',
  [UNNAMED.tab]: 'A tab with no name',
  [UNNAMED.row]: 'A row or card',
};

/** A control as the console names it; one counted by its kind alone says so. */
export function targetName(target) {
  const t = String(target ?? '');
  return UNNAMED_NAMES[t] ? { text: UNNAMED_NAMES[t], unnamed: true } : { text: t, unnamed: false };
}

/** Everything the page draws, from admin_click_stats's answer (missing parts read as none). */
export function clickSummary(stats) {
  const s = stats && typeof stats === 'object' ? stats : {};
  const bySurface = s.by_surface && typeof s.by_surface === 'object' ? s.by_surface : {};
  const byAudience = s.by_audience && typeof s.by_audience === 'object' ? s.by_audience : {};
  const list = (v) => (Array.isArray(v) ? v.filter((r) => r && typeof r === 'object') : []);
  return {
    from: String(s.from ?? ''),
    to: String(s.to ?? ''),
    total: n(s.total),
    surfaces: { web: n(bySurface.web), app: n(bySurface.app) },
    audiences: { visitor: n(byAudience.visitor), member: n(byAudience.member), coach: n(byAudience.coach) },
    daily: list(s.daily).map((d) => ({ day: String(d.day ?? ''), clicks: n(d.clicks) })),
    pages: list(s.pages).map((r) => ({
      surface: r.surface === 'app' ? 'app' : 'web',
      page: String(r.page ?? ''),
      name: pageName(r.surface, r.page),
      clicks: n(r.clicks),
    })),
    targets: list(s.targets).map((r) => {
      const { text, unnamed } = targetName(r.target);
      return {
        surface: r.surface === 'app' ? 'app' : 'web',
        page: pageName(r.surface, r.page),
        target: text,
        unnamed,
        clicks: n(r.clicks),
      };
    }),
  };
}

/** A count's share of a total, as a whole percent ('' with no total). */
export function shareOf(count, total) {
  return total > 0 ? `${Math.round((n(count) / total) * 100)}%` : '';
}
