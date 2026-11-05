// How many people open a coach's public page (owner, 2026-11-05: "Profile-view counting: 4 = yes",
// aggregate counts only), for the Growth funnel's top bar. The rules the beacon route keeps
// (src/app/api/analytics/profile-view/route.ts) and the funnel's read of the counts.
//
// What is kept: one count per listing per UTC day (coach_profile_views,
// supabase-migrations/2026-11-05-coach-profile-views.sql). Nothing about the visitor is: not their
// account, not their address, not a cookie. Their address is used for one thing, to stop a reload
// or a script counting twice, and only as a keyed hash (viewBucket) that lives in the rate limiter's
// bucket name for 30 minutes.
//
// What is not a view: the coach looking at their own page (the database checks the account the
// route read against the listing's owner), an obvious bot (isLikelyBot), a browser sending Global
// Privacy Control, and a visitor whose consent does not allow counting (the pages check it before
// they send: public/newdesign/profileView.mjs and src/components/ProfileViewBeacon.tsx).
import { createHash, createHmac } from 'node:crypto';

export const PROFILE_VIEW_ROLES = Object.freeze(['trainer', 'nutritionist']);
export const PROFILE_VIEW_BODY_MAX = 256;
// The funnel's window, today included.
export const PROFILE_VIEW_DAYS = 90;

// The user agents of crawlers, link previews, test browsers, uptime checks and HTTP libraries. The
// beacon is sent by the page's script, so most crawlers never run it; the ones that run scripts say
// so here. `bot` alone is enough for most ("Googlebot", "bingbot", "Slackbot", "Twitterbot"), except
// in a phone's name (a Cubot), and a person's in-app browser (Instagram, Facebook) is never matched.
const BOT_RE = /(?<!cu)bot(?:\b|[\/_-])|crawl|spider|slurp|facebookexternalhit|facebookcatalog|embedly|preview|lighthouse|pagespeed|gtmetrix|headless|phantomjs|puppeteer|playwright|selenium|webdriver|python-|python\/|curl\/|wget\/|go-http-client|okhttp|java\/|httpclient|axios\/|node-fetch|undici|postmanruntime|insomnia|uptime|pingdom|statuscake|datadog|checkly|ahrefs|semrush|mj12|dataforseo|bytespider|petalsearch/i;

/** Whether a user agent is a bot, a script or a test browser: no agent, or a short one, is one too. */
export function isLikelyBot(ua) {
  const s = String(ua == null ? '' : ua).trim();
  if (s.length < 12) return true;
  return BOT_RE.test(s);
}

/** A beacon's body ({ role, id }) as the route keeps it, or null. `id` is the listing's id. */
export function cleanProfileView(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const role = raw.role;
  if (typeof role !== 'string' || !PROFILE_VIEW_ROLES.includes(role)) return null;
  const id = typeof raw.id === 'string' && /^\d{1,15}$/.test(raw.id) ? Number(raw.id) : raw.id;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return null;
  return { role, id };
}

/** The caller's address as the proxy reports it, or '' when there is none. */
export function callerAddress(headers) {
  const h = (name) => {
    try { return headers.get(name) || ''; } catch { return ''; }
  };
  return (h('cf-connecting-ip') || h('x-forwarded-for').split(',')[0] || h('x-real-ip')).trim();
}

/**
 * The two rate buckets for one view, as hex: `view` is this address and this listing (one view each
 * 30 minutes), `addr` is this address alone (60 views an hour). Keyed with a server-only secret, so
 * the bucket names the database sees can't be turned back into an address, nor forged by a caller.
 * With no secret (a local checkout) they are plain hashes.
 */
export function viewBuckets(secret, address, role, id) {
  const digest = (msg) => (secret
    ? createHmac('sha256', String(secret)).update(msg).digest('hex')
    : createHash('sha256').update(msg).digest('hex'));
  const addr = address || 'unknown';
  return {
    view: digest(`pview|${addr}|${role}|${id}`).slice(0, 40),
    addr: digest(`pview-addr|${addr}`).slice(0, 40),
  };
}

/** The first day (YYYY-MM-DD, UTC) the funnel's window counts from: `days` days, today included. */
export function viewsSinceDay(now = Date.now(), days = PROFILE_VIEW_DAYS) {
  return new Date(now - (days - 1) * 86400000).toISOString().slice(0, 10);
}

/** The views of one listing over the funnel's window, or null when they could not be read (the
 * migration not run yet, a failed read). Read with the coach's own session: the table's policy lets
 * a coach read their own listings and nobody else's. */
export async function coachProfileViews(supabase, role, providerId, { now = Date.now(), days = PROFILE_VIEW_DAYS } = {}) {
  try {
    const { data, error } = await supabase
      .from('coach_profile_views')
      .select('day, views')
      .eq('provider_role', role)
      .eq('provider_id', providerId)
      .gte('day', viewsSinceDay(now, days));
    if (error || !Array.isArray(data)) return null;
    return data.reduce((sum, r) => sum + (Number(r && r.views) || 0), 0);
  } catch {
    return null;
  }
}
