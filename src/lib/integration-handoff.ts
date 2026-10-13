// The installed app's way into an integration's sign-in (owner, 2026-10-13: "build the native
// handoff for whoop strava spotify", "make apple music is inlcuded").
//
// The OAuth routes (/api/integrations/{provider}/authorize) read the website's cookie session, and
// Apple Music's MusicKit authorize opens a pop-up; the app's WebView has neither (Capacitor hands
// a pop-up to Safari and returns nothing). So the app asks POST /api/integrations/handoff, with its
// Bearer token, for a link, and opens it in the in-app browser. The link carries a token bound to
// the member and the provider and good for ten minutes:
//   `<uid>.<provider>.<exp>.<mac>`, HMAC-SHA256 under a server secret that is never the raw
//   service key (the delete-confirm and upload-ticket secrets' derivation).
//
// ⚠ A LINK CAN BE FORWARDED, AND THE ONE WHO COMPLETES IT IS NOT ALWAYS THE ONE WHO MADE IT. A
// member who sent their link to someone else would get that person's WHOOP or Apple Music data in
// their own Shape account. So the link opens /connect/{provider}, which names the Shape account it
// connects to, and the provider is reached only by that page's Continue: a form POST to the
// authorize route, which refuses a post from any other site (handoffPostAllowed). A link to the
// authorize route itself goes nowhere; a GET there reads only the website's own session.
//
// ⚠ NOT A SERVER ACTION. Next 16 renders a server action's redirect by fetching the target on the
// server first (createRedirectRenderResult), so a one-time step the authorize route spends would
// be spent before the browser got there.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const HANDOFF_TTL_S = 10 * 60;

/** Where the app's browser lands when a connection finishes, or a link has run out. */
export const CONNECT_DONE_PATH = '/connect/done';

/** The providers the app can be handed off to: the OAuth registry's, and Apple Music. */
export const HANDOFF_PROVIDERS = ['whoop', 'strava', 'spotify', 'garmin', 'oura', 'apple_music'] as const;
export type HandoffProvider = (typeof HANDOFF_PROVIDERS)[number];

/** The name each provider goes by on the pages. */
export const HANDOFF_LABELS: Record<HandoffProvider, string> = {
  whoop: 'WHOOP', strava: 'Strava', spotify: 'Spotify', garmin: 'Garmin', oura: 'Oura', apple_music: 'Apple Music',
};

export function isHandoffProvider(value: unknown): value is HandoffProvider {
  return typeof value === 'string' && (HANDOFF_PROVIDERS as readonly string[]).includes(value);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function secret(): string {
  if (process.env.INTEGRATION_HANDOFF_SECRET) return process.env.INTEGRATION_HANDOFF_SECRET;
  if (process.env.RATE_LIMIT_SECRET) return process.env.RATE_LIMIT_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return serviceKey ? createHash('sha256').update(`shape-integration-handoff:${serviceKey}`).digest('hex') : '';
}

function mac(s: string, body: string): string {
  return createHmac('sha256', s).update(`integration-handoff:${body}`).digest('hex');
}

function sameHex(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** A link token for this member and provider, or null when the server has no secret (503). */
export function issueHandoff(userId: string, provider: string, now: number = Date.now()): { token: string; expiresAt: number } | null {
  const s = secret();
  if (!s || !UUID_RE.test(String(userId || '')) || !isHandoffProvider(provider)) return null;
  const exp = Math.floor(now / 1000) + HANDOFF_TTL_S;
  const body = `${userId}.${provider}.${exp}`;
  return { token: `${body}.${mac(s, body)}`, expiresAt: exp * 1000 };
}

/** The member a token was issued for, for this provider and still in date, or null. */
export function readHandoff(token: unknown, provider: string, now: number = Date.now()): string | null {
  const s = secret();
  if (!s || typeof token !== 'string' || !isHandoffProvider(provider)) return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [uid, prov, expRaw, sig] = parts;
  if (!UUID_RE.test(uid) || prov !== provider || !/^\d{1,12}$/.test(expRaw) || !/^[0-9a-f]{64}$/.test(sig)) return null;
  if (Number(expRaw) * 1000 < now) return null;
  return sameHex(mac(s, `${uid}.${prov}.${expRaw}`), sig) ? uid : null;
}

/**
 * True when a POST comes from a page on this site: the browser names the page's origin, or, when
 * it sends `Origin: null` (a no-referrer policy), says the request is same-origin. A page on
 * another site can set neither.
 */
export function handoffPostAllowed(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin && origin !== 'null') {
    const allowed = new Set<string>([new URL(request.url).origin]);
    const site = process.env.NEXT_PUBLIC_SITE_URL;
    if (site) { try { allowed.add(new URL(site).origin); } catch { /* a malformed site url allows nothing more */ } }
    return allowed.has(origin);
  }
  return request.headers.get('sec-fetch-site') === 'same-origin';
}

/** The member an Apple Music call on /connect/apple_music speaks for (its X-Shape-Handoff header). */
export function handoffUserFromRequest(request: Request, provider: HandoffProvider): { id: string } | null {
  const uid = readHandoff(request.headers.get('x-shape-handoff'), provider);
  return uid ? { id: uid } : null;
}

/** "c•••@gmail.com": enough for a member to recognise their own account, not to read someone else's. */
export function maskEmail(email: string | null | undefined): string {
  const e = String(email || '').trim();
  const at = e.lastIndexOf('@');
  if (at < 1) return '';
  return `${e[0]}•••${e.slice(at)}`;
}
