// War Room — single operational snapshot of where Shape stands.
//
// Aggregates three kinds of signal so the whole picture is glanceable:
//   1. Config       — which env vars / secrets are wired (booleans only, never
//                     the values). Mirrors /api/health but grouped + scored.
//   2. Live services — actually reaches Supabase + Stripe and times the call,
//                     so "configured" vs "actually working" are distinct.
//   3. Inventory    — counts of API routes, migrations, mobile build presence.
//   4. Go-live      — the GO-LIVE-CHECKLIST items, with the ones we can verify
//                     from config auto-derived (the rest are manual ticks).
//
// SECURITY: every value here is a boolean / count / status string. No secret
// is ever returned. Still, the API route + page are admin-gated.

import { readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export type ServiceStatus = 'ok' | 'degraded' | 'down' | 'missing' | 'unknown';

export type ConfigItem = { key: string; label: string; present: boolean; note?: string };
export type ConfigGroup = {
  key: string;
  label: string;
  required: boolean;
  items: ConfigItem[];
  ready: boolean;
};
export type ServiceCheck = {
  key: string;
  label: string;
  status: ServiceStatus;
  detail: string;
  latencyMs: number | null;
};
export type ChecklistItem = { label: string; status: 'done' | 'pending' | 'manual' };
export type ChecklistSection = { section: string; items: ChecklistItem[] };

// ── Architecture & flow (the "how Shape works" map) ─────────────────────────
// A curated, human snapshot (not config-derived) so the whole product can be
// read top-to-bottom: who it serves, the member journey, the stack of layers,
// and a persona × area matrix. Edit this as the product evolves.
export type ArchPersona = { key: string; label: string; tagline: string };
export type ArchFlowStep = { n: number; stage: string; persona: string; detail: string };
export type ArchGap = { task: string; status: 'in-progress' | 'not-started'; priority: 'P1' | 'P2' | 'P3' };
export type ArchLayer = { layer: string; serves: string; purpose: string; pieces: string[]; gaps: ArchGap[] };
export type ArchMatrixRow = { area: string; member: string; trainer: string; nutritionist: string };
export type NorthStarCamp = { camp: string; players: string; shapeDoes: string };
export type NorthStarPhase = { phase: string; focus: string };
export type NorthStar = {
  statement: string;
  positioning: string;
  combine: NorthStarCamp[];
  wedge: string;
  moats: string[];
  sequence: NorthStarPhase[];
};
export type ShapeArchitecture = {
  northStar: NorthStar;
  summary: string;
  personas: ArchPersona[];
  flow: ArchFlowStep[];
  layers: ArchLayer[];
  matrix: ArchMatrixRow[];
};

export type ApiRouteInfo = { path: string; methods: string[]; group: string; probeable: boolean };
export type ApiRouteGroup = { group: string; routes: ApiRouteInfo[] };

export type WarRoomSnapshot = {
  generatedAt: string;
  runtime: {
    vercelEnv: string | null;
    nodeEnv: string | null;
    nodeVersion: string;
    region: string | null;
    siteUrl: string | null;
  };
  config: ConfigGroup[];
  services: ServiceCheck[];
  inventory: {
    apiRoutes: number;
    migrations: number;
    mobileBuild: boolean;
    mobileAssets: number;
  };
  apiRoutes: ApiRouteGroup[];
  checklist: ChecklistSection[];
  readiness: { score: number; total: number; label: string };
  architecture: ShapeArchitecture;
};

// The product map. Keep this current — it's the "what Shape is becoming" outline.
const SHAPE_ARCHITECTURE: ShapeArchitecture = {
  northStar: {
    statement: 'The home base coaches build their entire practice on — audience, credibility, clients, and income — and where members live their training life socially.',
    positioning: 'The first platform to fuse social fitness + coaching software + a creator marketplace into one. Coach-first: coaches arrive with their own clients (instant members); the social loop compounds the network.',
    combine: [
      { camp: 'Social fitness', players: 'Strava · IG / TikTok fitness creators', shapeDoes: 'The daily Train → Eat → Score loop IS the feed — profiles, follows, channels, Radio. Not a separate app to post to.' },
      { camp: 'Coaching software', players: 'Trainerize · TrueCoach · Everfit', shapeDoes: 'Roster, programs / meal plans, adjust, scheduling, client analytics — but public + social, not a private B2B silo.' },
      { camp: 'Creator marketplace', players: 'Future · Playbook', shapeDoes: 'Discovery marketplace, coaches price themselves + are paid directly, and a coach Shape-Score ladder as earned, portable credibility.' },
    ],
    wedge: 'Lead with coaches. No incumbent owns a coach\'s full home base (audience + credibility + clients + payments). Coaches bring existing clients = built-in members; members become the retention engine once coaches seed density.',
    moats: [
      'Coach Shape-Score ladder = earned, portable credibility IG can\'t replicate',
      'Two-sided graph: coaches + their clients + the community around them',
      'One place for audience + tooling + payments (vs rented IG → exported coaching tool)',
      'Verified RDs / certs → trust vs social bro-science',
    ],
    sequence: [
      { phase: '1 · Seed coaches', focus: 'Onboard vetted trainers/RDs who import their existing clients (instant members).' },
      { phase: '2 · Activate the loop', focus: 'Those clients run Train/Eat/Score daily → real content velocity in the feed.' },
      { phase: '3 · Open discovery', focus: 'Marketplace + community feed pull in new members searching for a coach.' },
      { phase: '4 · Compound', focus: 'Follows, suggestions, and push retention turn it into a network with its own gravity.' },
    ],
  },
  summary:
    'Shape is a members-only ($5/mo) fitness-lifestyle platform. Members hire affordable, vetted coaches and run a daily Train → Eat → Habits loop that feeds a Shape Score and a social feed; coaches program the work, get paid directly, and price themselves. Everything funnels through one membership + one notifications spine.',
  personas: [
    { key: 'prospect', label: 'Prospect / Visitor', tagline: 'Browsing before joining — marketing site, app preview, Nora AI support.' },
    { key: 'member', label: 'Member (client)', tagline: 'The core user. $5/mo. Lives in the daily loop + community.' },
    { key: 'trainer', label: 'Trainer', tagline: 'Programs workouts, manages a roster, sells programs, paid directly.' },
    { key: 'nutritionist', label: 'Nutritionist / RD', tagline: 'Builds meal plans + grocery lists, sells plans, paid directly.' },
    { key: 'admin', label: 'Admin', tagline: 'Runs the platform — approvals, War Room, ops.' },
  ],
  flow: [
    { n: 1, stage: 'Discover', persona: 'Prospect', detail: 'Marketing site + /newdesign, app preview behind the paywall, Nora AI answers + recommends coaches.' },
    { n: 2, stage: 'Join (gate)', persona: 'Prospect → Member', detail: 'Members-only wall → $5/mo platform checkout (Stripe). Coaches & admins bypass by role.' },
    { n: 3, stage: 'Onboard', persona: 'Member', detail: 'First-run tour, set goals, edit profile (Terrain), connect integrations (Whoop/Garmin/Strava/Apple Health/Spotify).' },
    { n: 4, stage: 'Find a coach', persona: 'Member', detail: 'Marketplace → subscribe to a trainer and/or nutritionist; coach sets their own rate and is paid directly.' },
    { n: 5, stage: 'Daily loop', persona: 'Member', detail: 'Train (assigned workouts), Eat (meal plan → grocery list), Habits + Goals. Logging earns points.' },
    { n: 6, stage: 'Shape Score', persona: 'Member', detail: 'Consistency rolls up into a tier ladder — the mirror of the work. Coaches climb a parallel coach ladder.' },
    { n: 7, stage: 'Community', persona: 'Member + Coach', detail: 'Feed (posts/photos/tags), channels, DMs, follow graph (+requests on private), public profiles, Shape Radio.' },
    { n: 8, stage: 'Rewards', persona: 'Member', detail: 'Shape Store — browse open to all, redeem points (members-only). Points are the platform currency.' },
    { n: 9, stage: 'Retain', persona: 'All', detail: 'Every in-app notification fans out to a phone push when the app is closed; presence + streaks pull people back.' },
    { n: 10, stage: 'Coach side (parallel)', persona: 'Trainer / Nutritionist', detail: 'Apply → approved → roster → build/adjust programs & plans → message clients & co-coaches (Care Team) → payouts.' },
  ],
  layers: [
    { layer: 'Surfaces', serves: 'Everyone', purpose: 'Where Shape is used.', pieces: ['Mobile broadsheet (/m, Capacitor)', 'Website — public/newdesign/* (canonical pages: marketing · profiles · store · coaches)', 'Coach apps (trainer + nutritionist shells)', 'Web dashboard + API (src/ Next.js: /dashboard + /api/*)'], gaps: [
      { task: 'iOS App Store build (push plugin + APNs entitlements)', status: 'not-started', priority: 'P1' },
      { task: 'Android signed release', status: 'not-started', priority: 'P2' },
      { task: 'Native mic + camera plugins (WebView fallback today)', status: 'not-started', priority: 'P3' },
    ] },
    { layer: 'The Loop (member value)', serves: 'Member', purpose: 'The daily reason to open the app.', pieces: ['Train', 'Eat', 'Habits', 'Goals', 'Shape Score', 'Progress hub', 'Library', 'Store'], gaps: [
      { task: 'Train deck now reflects coach Adjust (bsApplyTrainAdjust over client_programs.detail.training): intensity scales loads + shown RPE, the weekly split re-themes days + sets coach rest days, the note rides onto the day — the live session/preview inherit the scaled moves. Banner still summarizes. Remaining: full per-day exercise authoring (coach can\'t yet write new moves, only tune)', status: 'in-progress', priority: 'P3' },
      { task: 'Food-database free-text search in the logger', status: 'not-started', priority: 'P2' },
      { task: 'On-device macro-read from a meal photo', status: 'not-started', priority: 'P3' },
      { task: 'Some Progress sub-data still illustrative', status: 'not-started', priority: 'P3' },
      { task: 'Calendar events still demo — home tab now builds day log / week dots / up-next cards from the real assigned plan; the month calendar should read the same source', status: 'not-started', priority: 'P2' },
      { task: 'One shared data layer for client metrics — ticker (/api/client/analytics) and the ShapeProgress rollups are fetched independently per surface, so the same metric (RHR, sleep) can show different values; single fetch/cache + standardized metric definitions', status: 'not-started', priority: 'P3' },
    ] },
    { layer: 'Coach tools', serves: 'Trainer / Nutritionist', purpose: 'Program the work + run the business.', pieces: ['Roster', 'Programs / Meal plans', 'Assign to client (catalogue → client Train/Eat)', 'Adjust program/plan', 'Grocery lists', 'Soundtracks', 'Schedule', 'Client analytics', 'Care Team (co-coach chat)'], gaps: [
      { task: 'Trainer "sell a plan" paid-checkout path — built on the Connect checkout: coach publishes a priced plan → "Plans for sale" + Buy on the coach profile → plan_id rides through checkout/webhook → unlocks in the buyer\'s Library. Needs live Stripe to verify the charge', status: 'in-progress', priority: 'P1' },
      { task: 'Adjust → full program/plan regeneration', status: 'not-started', priority: 'P2' },
      { task: 'Website soundtrack attach for demo-seed rows still local', status: 'not-started', priority: 'P3' },
    ] },
    { layer: 'Social graph', serves: 'Member + Coach', purpose: 'Connection + accountability.', pieces: ['Public profiles (Terrain / Signal)', 'Followers / following (+ requests)', 'Community feed (posts, photos, @tags)', 'Channels', 'DMs', 'Shape Radio'], gaps: [
      { task: 'Feed activity "proof cards" now LIVE: the COMMUNITY feed builds Strava-style cards from real community posts that are workouts/runs (bsActivityFromPost — composer workoutStats + sensor statA/B/C + GPS route), with the author\'s live tier + avatar; demo cards are the signed-out / no-activity-yet fallback (empty state when signed in with none). Remaining: richer per-discipline stat parsing + website parity if a demo stream is ever added', status: 'in-progress', priority: 'P3' },
      { task: 'Follow suggestions need real account volume', status: 'not-started', priority: 'P3' },
    ] },
    { layer: 'Platform services', serves: 'All', purpose: 'The cross-cutting spine.', pieces: ['Membership & billing (Stripe $5/mo + coach subs)', 'Notifications → system push', 'Integrations (Whoop/Garmin/Strava/Oura/Spotify/Apple Health)', 'Nora AI support'], gaps: [
      { task: 'Activate system push — code + native plugins done; remaining: (1) set FCM_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY + PUSH_WEBHOOK_SECRET env, (2) Supabase DB Webhook: notifications INSERT → POST /api/push/dispatch (header x-push-secret), (3) Firebase config + APNs key + native build', status: 'in-progress', priority: 'P1' },
      { task: 'Apple Pay / Google Pay on checkout — native opens Stripe Checkout in SFSafariViewController for the Apple Pay sheet; needs @capacitor/browser + Apple Pay enabled in Stripe', status: 'in-progress', priority: 'P2' },
      { task: 'Full in-app Stripe PaymentSheet (native Apple Pay / Google Pay sheet, NO browser hop) — wants @capacitor-community/stripe (or Stripe RN/iOS SDK), a PaymentIntent/SetupIntent + customer ephemeral-key endpoint for the $5/mo sub + coach/plan buys, and the native build', status: 'not-started', priority: 'P3' },
      { task: 'Per-endpoint paid-feature enforcement beyond the proxy gate', status: 'not-started', priority: 'P2' },
      { task: 'Garmin Health API approval (access-request form down)', status: 'not-started', priority: 'P3' },
    ] },
    { layer: 'Data & infra', serves: 'System', purpose: 'Source of truth + enforcement.', pieces: ['Supabase (Auth, Postgres, RLS, SECURITY DEFINER RPCs, Storage)', 'Next.js API routes', 'Edge proxy membership gate', 'War Room'], gaps: [
      { task: 'Per-person live presence done — get_active_now (SECURITY DEFINER) returns who is mid-workout/cooking now with name·role·points·avatar, powering the rail + the avatar activity dots; the historical activity-card feed is still demo', status: 'not-started', priority: 'P3' },
      { task: 'is_member() RPC to collapse membership checks', status: 'not-started', priority: 'P3' },
    ] },
  ],
  matrix: [
    { area: 'Train', member: 'Follows assigned workouts, swaps moves, logs sessions', trainer: 'Programs & adjusts the week; reviews logs', nutritionist: '—' },
    { area: 'Eat', member: 'Meal plan → grocery list, swaps + logs meals', trainer: '—', nutritionist: 'Builds plans, grocery lists, macro targets' },
    { area: 'Shape Score', member: 'Earns a tier from the loop', trainer: 'Coach ladder (Certified→Icon)', nutritionist: 'Coach ladder (Certified→Icon)' },
    { area: 'Coaching', member: 'Hires, messages, buys plans', trainer: 'Sells programs, sets rate, paid directly', nutritionist: 'Sells plans, sets rate, paid directly' },
    { area: 'Community', member: 'Posts, follows, channels, DMs', trainer: 'Posts + client/co-coach chat', nutritionist: 'Posts + client/co-coach chat' },
    { area: 'Billing', member: '$5/mo platform membership', trainer: 'Coach sub + payouts', nutritionist: 'Coach sub + payouts' },
    { area: 'Profile', member: 'Terrain (member identity page)', trainer: 'Signal (coach instrument page)', nutritionist: 'Signal (coach instrument page)' },
  ],
};

// ── Full API surface ────────────────────────────────────────────────────────
// Embedded so the War Room can list every route reliably in production (the
// src/app/api source tree isn't traced into the serverless bundle, so a runtime
// fs walk can't be trusted there). Keep in sync when routes are added/removed.
// [path, comma-separated HTTP methods]
const RAW_ROUTES: ReadonlyArray<readonly [string, string]> = [
  ['/api/ai/generate-plan', 'POST'],
  ['/api/ai/weekly-readout', 'POST'],
  ['/api/app-waitlist', 'POST'],
  ['/api/apply', 'POST,OPTIONS'],
  ['/api/auth/session', 'GET,POST,DELETE'],
  ['/api/auth/signout', 'POST'],
  ['/api/availability', 'GET'],
  ['/api/calendar', 'GET,POST,PATCH,DELETE'],
  ['/api/client/activities', 'GET,POST'],
  ['/api/client/analytics', 'GET'],
  ['/api/client/checkin', 'POST'],
  ['/api/client/dashboard', 'GET'],
  ['/api/client/grocery', 'GET'],
  ['/api/client/habits', 'GET,POST'],
  ['/api/client/nutrition', 'GET'],
  ['/api/client/plan', 'GET'],
  ['/api/client/planned-meals', 'GET,POST,DELETE'],
  ['/api/client/progress', 'GET'],
  ['/api/client/score', 'GET'],
  ['/api/client/team', 'GET'],
  ['/api/client/train', 'GET'],
  ['/api/clients/[id]/shared-overview', 'GET'],
  ['/api/coach/grocery-lists', 'GET,POST,PATCH,DELETE'],
  ['/api/coach/plans', 'GET,POST,PATCH,DELETE'],
  ['/api/coach/rings', 'GET'],
  ['/api/coach/score', 'GET'],
  ['/api/coach/soundtracks', 'GET,POST,PATCH,DELETE'],
  ['/api/coaches/reviews', 'GET,POST'],
  ['/api/community/feed/[postId]/comments', 'POST'],
  ['/api/community/feed/[postId]/like', 'POST'],
  ['/api/community/feed', 'GET,POST'],
  ['/api/consultation', 'POST'],
  ['/api/contact', 'POST'],
  ['/api/conversations/[id]/messages', 'GET,POST'],
  ['/api/health', 'GET'],
  ['/api/insights/correlations', 'GET'],
  ['/api/intake', 'POST'],
  ['/api/integrations/[provider]/authorize', 'GET'],
  ['/api/integrations/[provider]/callback', 'GET'],
  ['/api/integrations/[provider]/disconnect', 'POST'],
  ['/api/integrations/apple-music/developer-token', 'GET'],
  ['/api/integrations/apple-music/connect', 'POST'],
  ['/api/integrations/apple-music/disconnect', 'POST'],
  ['/api/integrations/garmin/webhook', 'GET,POST'],
  ['/api/integrations/instacart/shopping-list', 'POST'],
  ['/api/integrations/spotify/playlists', 'GET'],
  ['/api/integrations/spotify/save-playlist', 'POST'],
  ['/api/integrations/status', 'GET'],
  ['/api/integrations/strava/sync', 'GET'],
  ['/api/integrations/whoop/sync', 'GET'],
  ['/api/lead-boosts', 'GET,POST'],
  ['/api/leaderboard', 'GET'],
  ['/api/league', 'GET,POST'],
  ['/api/marketplace-stats', 'GET'],
  ['/api/me/account-action', 'POST'],
  ['/api/me/role', 'POST'],
  ['/api/me', 'GET'],
  ['/api/me/shared-clients/[clientId]/ack', 'POST,DELETE'],
  ['/api/me/shared-clients/[clientId]/thread', 'POST'],
  ['/api/me/shared-clients', 'GET'],
  ['/api/messages/direct', 'GET,POST'],
  ['/api/my-availability', 'GET,POST'],
  ['/api/notifications', 'GET,POST'],
  ['/api/notify-app', 'POST'],
  ['/api/nutrition/meal-note', 'POST'],
  ['/api/nutrition/voice', 'POST'],
  ['/api/nutritionist/analytics', 'GET'],
  ['/api/nutritionist/clients', 'GET'],
  ['/api/nutritionist/console', 'GET,POST'],
  ['/api/nutritionist/dashboard', 'GET'],
  ['/api/nutritionist/meal-plan', 'POST'],
  ['/api/nutritionist/messages', 'GET,POST'],
  ['/api/nutritionist/programs', 'GET'],
  ['/api/program-tools/templates', 'POST'],
  ['/api/push/dispatch', 'POST'],
  ['/api/push/register', 'POST,DELETE'],
  ['/api/radio/rooms', 'GET,POST'],
  ['/api/recipes/reviews', 'GET,POST'],
  ['/api/sessions/manage', 'GET,POST'],
  ['/api/store/redeem', 'GET,POST'],
  ['/api/stripe/billing-portal', 'POST'],
  ['/api/stripe/checkout-session', 'POST'],
  ['/api/stripe/connect-account', 'POST'],
  ['/api/stripe/connect/onboard', 'POST'],
  ['/api/stripe/connect/refresh', 'GET'],
  ['/api/stripe/platform-checkout', 'POST'],
  ['/api/stripe/webhook', 'POST'],
  ['/api/trainer/analytics', 'GET'],
  ['/api/trainer/clients', 'GET'],
  ['/api/trainer/console', 'GET,POST'],
  ['/api/trainer/dashboard', 'GET'],
  ['/api/trainer/messages', 'GET,POST'],
  ['/api/trainer/programs', 'GET'],
  ['/api/trainer/workout', 'POST'],
  ['/api/warroom', 'GET'],
];

function groupOf(p: string): string {
  if (p.startsWith('/api/stripe')) return 'Payments · Stripe';
  if (p.startsWith('/api/integrations')) return 'Integrations';
  if (p.startsWith('/api/ai') || p.startsWith('/api/insights')) return 'AI & Insights';
  if (p.startsWith('/api/client')) return 'Client app';
  if (p.startsWith('/api/trainer')) return 'Trainer';
  if (p.startsWith('/api/nutritionist')) return 'Nutritionist';
  if (p.startsWith('/api/nutrition')) return 'Nutrition & meals';
  if (p.startsWith('/api/coach')) return 'Coach';
  if (p.startsWith('/api/push') || p === '/api/notifications' || p === '/api/notify-app') return 'Push & notifications';
  if (p.startsWith('/api/community') || p.startsWith('/api/messages') || p.startsWith('/api/conversations') ||
      p.startsWith('/api/radio') || p === '/api/league' || p === '/api/leaderboard') return 'Community & social';
  if (p.startsWith('/api/auth') || p.startsWith('/api/me')) return 'Auth & account';
  if (p.startsWith('/api/recipes')) return 'Content';
  if (p === '/api/contact' || p === '/api/app-waitlist') return 'Marketing & forms';
  if (p === '/api/health' || p === '/api/warroom') return 'System';
  // Remaining provider/marketplace plumbing.
  return 'Marketplace & providers';
}

// GET routes we won't auto-probe from the browser: dynamic-param paths (need a
// real id), OAuth dances, syncs, and secret-gated webhooks (side effects).
function isProbeable(path: string, methods: string[]): boolean {
  if (!methods.includes('GET')) return false;
  if (path.includes('[')) return false;
  if (path.startsWith('/api/integrations/')) return false;
  if (path === '/api/auth/signout' || path === '/api/stripe/webhook' || path === '/api/push/dispatch') return false;
  return true;
}

function buildApiRoutes(): ApiRouteGroup[] {
  const byGroup = new Map<string, ApiRouteInfo[]>();
  for (const [path, methodsCsv] of RAW_ROUTES) {
    const methods = methodsCsv.split(',');
    const group = groupOf(path);
    const info: ApiRouteInfo = { path, methods, group, probeable: isProbeable(path, methods) };
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group)!.push(info);
  }
  return Array.from(byGroup.entries())
    .map(([group, routes]) => ({ group, routes: routes.sort((a, b) => a.path.localeCompare(b.path)) }))
    .sort((a, b) => b.routes.length - a.routes.length);
}

function present(v: string | undefined): boolean {
  return !!v && v.trim().length > 0;
}

function stripeMode(v: string | undefined): 'live' | 'test' | 'missing' | 'unknown' {
  if (!v) return 'missing';
  if (v.startsWith('sk_live_') || v.startsWith('pk_live_')) return 'live';
  if (v.startsWith('sk_test_') || v.startsWith('pk_test_')) return 'test';
  return 'unknown';
}

// ── Live service pings (timeout-guarded, parallel) ──────────────────────────

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

async function pingSupabase(): Promise<ServiceCheck> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { key: 'supabase', label: 'Supabase (Auth/DB)', status: 'missing', detail: 'URL or anon key not set', latencyMs: null };
  }
  const started = Date.now();
  try {
    // GoTrue health endpoint — schema-independent reachability probe.
    const res = await withTimeout(
      fetch(`${url.replace(/\/$/, '')}/auth/v1/health`, { headers: { apikey: anon }, cache: 'no-store' }),
      4000,
    );
    const latencyMs = Date.now() - started;
    if (res.ok) return { key: 'supabase', label: 'Supabase (Auth/DB)', status: 'ok', detail: `reachable · ${res.status}`, latencyMs };
    return { key: 'supabase', label: 'Supabase (Auth/DB)', status: 'degraded', detail: `HTTP ${res.status}`, latencyMs };
  } catch (e) {
    return { key: 'supabase', label: 'Supabase (Auth/DB)', status: 'down', detail: (e as Error).message, latencyMs: Date.now() - started };
  }
}

async function pingStripe(): Promise<ServiceCheck> {
  const key = process.env.STRIPE_SECRET_KEY;
  const mode = stripeMode(key);
  if (mode === 'missing') {
    return { key: 'stripe', label: 'Stripe (Payments)', status: 'missing', detail: 'secret key not set', latencyMs: null };
  }
  const started = Date.now();
  try {
    const { stripe } = await import('@/lib/stripe');
    const bal = await withTimeout(stripe.balance.retrieve(), 5000);
    const latencyMs = Date.now() - started;
    const live = bal.livemode ? 'live' : 'test';
    return {
      key: 'stripe',
      label: 'Stripe (Payments)',
      status: live === 'live' ? 'ok' : 'degraded',
      detail: `key ${mode} · account ${live}`,
      latencyMs,
    };
  } catch (e) {
    return { key: 'stripe', label: 'Stripe (Payments)', status: 'down', detail: (e as Error).message, latencyMs: Date.now() - started };
  }
}

// ── Filesystem inventory (best-effort; falls back if not traced on Vercel) ───

async function countRouteFiles(dir: string): Promise<number> {
  let n = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) n += await countRouteFiles(full);
    else if (e.name === 'route.ts' || e.name === 'route.tsx') n += 1;
  }
  return n;
}

async function buildInventory(): Promise<WarRoomSnapshot['inventory']> {
  const root = process.cwd();
  const fallback = { apiRoutes: 80, migrations: 45, mobileBuild: true, mobileAssets: 0 };
  try {
    const apiRoutes = (await countRouteFiles(path.join(root, 'src/app/api'))) || fallback.apiRoutes;
    let migrations = fallback.migrations;
    try {
      migrations = (await readdir(path.join(root, 'supabase-migrations'))).filter((f) => f.endsWith('.sql')).length || fallback.migrations;
    } catch { /* keep fallback */ }
    const mobileBuild = existsSync(path.join(root, 'public/m/index.html'));
    let mobileAssets = 0;
    try {
      mobileAssets = (await readdir(path.join(root, 'public/m/assets'))).length;
    } catch { /* none */ }
    return { apiRoutes, migrations, mobileBuild, mobileAssets };
  } catch {
    return fallback;
  }
}

// ── Config groups ───────────────────────────────────────────────────────────

function buildConfig(): ConfigGroup[] {
  const env = process.env;
  const mk = (items: ConfigItem[], required: boolean, key: string, label: string): ConfigGroup => ({
    key,
    label,
    required,
    items,
    ready: items.every((i) => i.present),
  });

  const stripeKeyMode = stripeMode(env.STRIPE_SECRET_KEY);

  return [
    mk([
      { key: 'NEXT_PUBLIC_SUPABASE_URL', label: 'Project URL', present: present(env.NEXT_PUBLIC_SUPABASE_URL) },
      { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', label: 'Anon key', present: present(env.NEXT_PUBLIC_SUPABASE_ANON_KEY) },
      { key: 'SUPABASE_SERVICE_ROLE_KEY', label: 'Service-role key', present: present(env.SUPABASE_SERVICE_ROLE_KEY) },
    ], true, 'supabase', 'Supabase'),

    mk([
      { key: 'STRIPE_SECRET_KEY', label: 'Secret key', present: present(env.STRIPE_SECRET_KEY), note: stripeKeyMode },
      { key: 'STRIPE_WEBHOOK_SECRET', label: 'Webhook secret', present: present(env.STRIPE_WEBHOOK_SECRET) },
      { key: 'STRIPE_PLATFORM_PRICE_ID', label: 'Platform price ID', present: present(env.STRIPE_PLATFORM_PRICE_ID) },
    ], true, 'stripe', 'Stripe (Payments)'),

    mk([
      { key: 'OPENAI_API_KEY', label: 'OpenAI key', present: present(env.OPENAI_API_KEY) },
      { key: 'OPENAI_MODEL', label: 'Model', present: present(env.OPENAI_MODEL), note: env.OPENAI_MODEL ?? undefined },
      { key: 'OPENAI_TRANSCRIBE_MODEL', label: 'Transcribe model', present: present(env.OPENAI_TRANSCRIBE_MODEL), note: env.OPENAI_TRANSCRIBE_MODEL ?? 'whisper-1' },
    ], false, 'ai', 'AI (plans / readouts / voice)'),

    mk([
      { key: 'RESEND_API_KEY', label: 'Resend key', present: present(env.RESEND_API_KEY) },
      { key: 'RESEND_FROM', label: 'From address', present: present(env.RESEND_FROM), note: env.RESEND_FROM ?? undefined },
    ], false, 'email', 'Email (Resend)'),

    mk([
      { key: 'FCM_PROJECT_ID', label: 'FCM project', present: present(env.FCM_PROJECT_ID) },
      { key: 'FCM_CLIENT_EMAIL', label: 'FCM client email', present: present(env.FCM_CLIENT_EMAIL) },
      { key: 'FCM_PRIVATE_KEY', label: 'FCM private key', present: present(env.FCM_PRIVATE_KEY) },
      { key: 'PUSH_WEBHOOK_SECRET', label: 'Push webhook secret', present: present(env.PUSH_WEBHOOK_SECRET) },
    ], false, 'push', 'Push notifications'),

    mk([
      { key: 'STRAVA', label: 'Strava', present: present(env.STRAVA_CLIENT_ID) && present(env.STRAVA_CLIENT_SECRET) },
      { key: 'WHOOP', label: 'Whoop', present: present(env.WHOOP_CLIENT_ID) && present(env.WHOOP_CLIENT_SECRET) },
      { key: 'OURA', label: 'Oura', present: present(env.OURA_CLIENT_ID) && present(env.OURA_CLIENT_SECRET) },
      { key: 'GARMIN', label: 'Garmin', present: present(env.GARMIN_CLIENT_ID) && present(env.GARMIN_CLIENT_SECRET) },
      { key: 'SPOTIFY', label: 'Spotify', present: present(env.SPOTIFY_CLIENT_ID) && present(env.SPOTIFY_CLIENT_SECRET) },
      { key: 'APPLE_MUSIC', label: 'Apple Music', present: present(env.APPLE_MUSIC_KEY_ID) && present(env.APPLE_MUSIC_TEAM_ID) && present(env.APPLE_MUSIC_PRIVATE_KEY) },
      { key: 'INSTACART', label: 'Instacart', present: present(env.INSTACART_API_KEY) },
    ], false, 'integrations', 'Integrations'),
  ];
}

// ── Go-live checklist (config-derived where possible) ───────────────────────

function buildChecklist(config: ConfigGroup[], mobileBuild = false): ChecklistSection[] {
  const group = (k: string) => config.find((g) => g.key === k);
  const itemPresent = (groupKey: string, itemKey: string) =>
    !!group(groupKey)?.items.find((it) => it.key === itemKey)?.present;
  const stripeReady = !!group('stripe')?.ready && stripeMode(process.env.STRIPE_SECRET_KEY) === 'live';
  const supabaseReady = !!group('supabase')?.ready;
  const pushReady = !!group('push')?.ready;

  const auto = (ok: boolean): 'done' | 'pending' => (ok ? 'done' : 'pending');

  return [
    {
      section: 'Database & Auth',
      items: [
        { label: 'Supabase env wired (URL + anon + service role)', status: auto(supabaseReady) },
        { label: 'Migrations applied (notifications, push_tokens, activities)', status: 'manual' },
        { label: 'Auth Site URL + redirect URLs set', status: 'manual' },
        { label: 'Phone (Twilio) login configured', status: 'manual' },
      ],
    },
    {
      section: 'Core-loop flow review (2026-06-11)',
      items: [
        { label: 'Assign to client — coach catalogue plans land on the client Train/Eat (BSProAssignPage: ASSIGN pill on every Plans-tab row + client profile Manage tab; outline→plan conversion; writes client_workouts/client_meal_plans, no migration; 1:1 note on assign; roster routes now Bearer-capable for native)', status: 'done' },
        { label: 'Coach client profile de-dup: Profile/Analysis merged into one tab on the app (summary + trendline folded in) and the fully-redundant Analysis tab removed on the website (cache tags added to TrainerClient/NutritionistClient.html, which had none)', status: 'done' },
        { label: 'One Progress home: Me→Stats no longer embeds a second Progress hub (KPI grid + link); Goal Overall slimmed to goal framing on app + website — trend chart/heatmap live only on Progress, Log weigh-in kept', status: 'done' },
        { label: 'Home tab live wiring — day log, week-strip dots, up-next workout + meal cards now build from the REAL assigned plan (bsHomeLiveWeek over /api/client/plan; habits + score chip + ticker were already live); demo week only when no plan exists. Calendar still demo (tracked)', status: 'done' },
        { label: 'Unified client-metrics data layer — tracked (see The Loop gaps)', status: 'pending' },
      ],
    },
    {
      section: 'Security & hardening (2026-06-09 review)',
      items: [
        { label: 'RLS ON for every public table — verified 66/66 enabled AND each has ≥1 policy (0 RLS-off, 0 deny-all)', status: 'done' },
        { label: 'Fixed deny-all tables: messages / conversation_participants / community_likes / community_comments had RLS on but 0 policies (broke DMs + like/comment writes); conversations was missing insert+update. Restored via 2026-06-09-restore-missing-rls-policies.sql (applied live + in repo)', status: 'done' },
        { label: 'Next.js 16.2.3 → 16.2.9 — clears the high-severity advisories (middleware/proxy bypass, cache poisoning, SSRF, image DoS, RSC XSS). Smoke-tested: tsc + next build clean both versions', status: 'done' },
        { label: 'Transitive dep advisories cleared via npm overrides (postcss 8.5.15, ws 8.21.0, qs 6.15.2) — `npm audit --omit=dev` = 0 vulns on both root + mobile-app', status: 'done' },
        { label: 'Leaked-password protection (HaveIBeenPwned) — Auth → Providers → Email. Pro-plan feature; DEFERRED until Supabase Pro upgrade', status: 'pending' },
        { label: 'Advisor warnings noted, low-priority/by-design: SECURITY DEFINER RPCs callable by anon/authenticated (intentional gated-RPC pattern), function_search_path_mutable on ~18 older functions (new ones set search_path=public), 4 anon-insert "always true" policies on public intake tables (contact/applications — write-only by design), 2 public buckets allow listing (coach-media/community-photos)', status: 'pending' },
      ],
    },
    {
      section: 'Payments (Stripe)',
      items: [
        { label: 'Live secret key set', status: auto(stripeMode(process.env.STRIPE_SECRET_KEY) === 'live') },
        { label: 'Webhook secret set', status: auto(present(process.env.STRIPE_WEBHOOK_SECRET)) },
        { label: 'Platform price ID set', status: auto(present(process.env.STRIPE_PLATFORM_PRICE_ID)) },
        { label: 'Connect activated for coach payouts', status: 'manual' },
        { label: 'Shape Store gated to members (mobile + website): upgrade prompt unless active subscription (coaches allowed); Me-row 🔒 hint; checked via /api/stripe/subscription', status: 'done' },
        { label: 'Store redemption is real: points spend via /api/store/redeem (atomic balance check + negative score_ledger row + one-time code); 20 pts = $1; live balance + locker on both surfaces', status: 'done' },
        { label: 'Store fulfillment wired: merch collects a shipping address (member + ops emailed via Resend), credits fund a coach-credit wallet that auto-applies at /api/stripe/checkout-session and is debited in the webhook on a completed payment', status: 'done' },
        { label: 'Migration 2026-06-08-store-redemptions.sql + 2026-06-08-store-fulfillment.sql applied on Supabase (store_redemptions, store_credits, RPCs)', status: 'manual' },
        { label: 'RESEND_API_KEY set (store reward + ops shipping emails); optional STORE_OPS_EMAIL for the ship-to inbox (falls back to first admin email)', status: auto(present(process.env.RESEND_API_KEY)) },
        { label: 'App-wide member gate (mobile BSAppShell + website /dashboard layout): paywall unless active $5/mo sub OR approved coach; mobile offers "Preview the app" + persistent Join banner; fail-closed but caches last-known membership so members are not locked out', status: 'done' },
        { label: 'Server-side member enforcement: Next proxy gates paid API prefixes (/api/client,/nutrition,/ai,/insights,/calendar,/conversations,/messages) → 402 unless active sub / coach / admin; Bearer + cookie; fails open on error (src/lib/supabase/middleware.ts + membership-core.ts)', status: 'done' },
        { label: 'Chat gated to members both surfaces: mobile composer + website chat bubble lock for non-members (preview-only, can read not send); community page is a labeled preview; preview banner has an ✕ dismiss', status: 'done' },
        { label: 'Full payments stack live', status: auto(stripeReady) },
      ],
    },
    {
      section: 'Notifications',
      items: [
        { label: 'In-app notifications (needs migrations)', status: 'manual' },
        { label: 'System push (FCM keys + webhook secret)', status: auto(pushReady) },
        { label: 'APNs key uploaded to Firebase (iOS)', status: 'manual' },
        { label: 'Device registers its push token at sign-in (registerPush wired into getCurrentSession)', status: 'done' },
        { label: 'Supabase Database Webhook: notifications INSERT → POST /api/push/dispatch (header x-push-secret)', status: 'manual' },
        { label: 'Native build: npm i @capacitor/push-notifications + cap sync + Firebase config (google-services.json / GoogleService-Info.plist) + Push capability', status: 'manual' },
      ],
    },
    {
      section: 'Apps & Release',
      items: [
        { label: 'Mobile web build present (/m)', status: auto(mobileBuild) },
        { label: 'CI gate on main (ci.yml): web typecheck+build, mobile build + public/m sync check — merge flow is PR → CI green → diff review → squash', status: 'done' },
        { label: 'Staging test branch → stable Vercel preview (shape-app-git-staging-…vercel.app); force-pushable scratch pointer, shares prod Supabase', status: 'done' },
        { label: 'Dependabot: monthly grouped minor/patch (root npm, mobile npm, actions); enable security updates in repo settings', status: 'pending' },
        { label: 'Android signed release secrets', status: 'manual' },
        { label: 'End-to-end smoke test passed', status: 'manual' },
      ],
    },
    {
      section: 'Mobile onboarding & auth',
      items: [
        { label: 'Login redesign + splash zoom/glow + compact UI', status: 'done' },
        { label: 'Eat tab crash fixed (PROGRAM TDZ)', status: 'done' },
        { label: 'Stripped 157MB of unused assets from /m', status: 'done' },
        { label: 'Account creation routes pros to the application', status: 'done' },
        { label: 'Login logo raised + browse section lowered/separated', status: 'done' },
        { label: 'Email verification flow (code) — enable "Confirm email" in Supabase', status: 'manual' },
        { label: 'Continue with Apple (code) — enable Apple provider in Supabase', status: 'manual' },
        { label: 'Native Sign in with Apple plugin (iOS App Store build)', status: 'pending' },
      ],
    },
    {
      section: 'Community feed & chat',
      items: [
        { label: 'Chat tab rebuilt as role-aware "The feed." (Shape / own role / Community)', status: 'done' },
        { label: 'Teams = Channels/Coaches selector; Friends = people list', status: 'done' },
        { label: 'Community filter shows Strava-style workout cards (PR/run/workout stats)', status: 'done' },
        { label: 'Trainer & nutritionist chat uses the shared role-aware feed', status: 'done' },
        { label: 'Radio intro: flowing sound-wave backdrop + compact/lowered hero', status: 'done' },
        { label: 'Website chat bubble role-aware (only filters once logged in) + single close', status: 'done' },
      ],
    },
    {
      section: 'Wearables & health integrations',
      items: [
        { label: 'Strava connect / sync / import (mobile + web)', status: 'done' },
        { label: 'Strava credentials set (STRAVA_CLIENT_ID/SECRET)', status: auto(itemPresent('integrations', 'STRAVA')) },
        { label: 'WHOOP connect / sync / import (recovery, sleep, workouts → daily_health_snapshot)', status: 'done' },
        { label: 'WHOOP credentials set (WHOOP_CLIENT_ID/SECRET)', status: auto(itemPresent('integrations', 'WHOOP')) },
        { label: 'Oura connect + full sync (readiness/sleep/HR/workouts → daily_health_snapshot)', status: 'done' },
        { label: 'Oura credentials set (OURA_CLIENT_ID/SECRET)', status: auto(itemPresent('integrations', 'OURA')) },
        { label: 'Garmin connect card live (OAuth2 + PKCE, shared provider flow)', status: 'done' },
        { label: 'Garmin push-webhook receiver (/api/integrations/garmin/webhook) → daily_health_snapshot + activities; callback captures Garmin userId', status: 'done' },
        { label: 'Garmin Health/Activity API access (request form down — apply via Developer Contact Us); then register webhook URL + summary types in portal', status: 'manual' },
        { label: 'Garmin credentials set (GARMIN_CLIENT_ID/SECRET) — also needs Garmin program approval', status: auto(itemPresent('integrations', 'GARMIN')) },
        { label: 'Apple Health / Apple Watch native HealthKit plugin + /api/integrations/apple-health/sync', status: 'done' },
        { label: 'Apple Health live: iOS device build w/ HealthKit entitlement (TestFlight/App Store)', status: 'pending' },
        { label: 'Live Bluetooth HRM (standard HR profile straps/watches): ShapeHRM service + Radio heart-rate-sync card wired (demo fallback); native permissions declared', status: 'done' },
        { label: 'Live HRM on device: native build w/ @capacitor-community/bluetooth-le (npx cap sync); works today in Chrome via Web Bluetooth', status: 'pending' },
        { label: 'Real song BPM on Shape Radio: blocked until radio streams real audio — compute BPM at ingest then (Spotify tempo API deprecated for new apps)', status: 'pending' },
      ],
    },
    {
      section: 'Music & grocery integrations',
      items: [
        { label: 'Spotify connect/disconnect surfaced (mobile + web)', status: 'done' },
        { label: 'Spotify: client saves a coach playlist to their own profile (follow; mobile + web)', status: 'done' },
        { label: 'Spotify: coach imports a soundtrack by picking from their connected library (mobile + website /api/integrations/spotify/playlists) — connect CTA when not linked', status: 'done' },
        { label: 'Spotify library picker is BETA-gated (graceful "rolling out" fallback to paste-a-link) on both surfaces until Extended Quota Mode; VITE_SPOTIFY_LIBRARY_PICKER=off hides it on mobile', status: 'done' },
        { label: 'Spotify Extended Quota Mode approved (lifts the 25-user dev-mode allowlist cap so any coach can pick from their library)', status: 'manual' },
        { label: 'Playlist cards: tracklist preview popup + ♡ Save to my Spotify + "connect Spotify" prompt on failure', status: 'done' },
        { label: 'Spotify credentials set (SPOTIFY_CLIENT_ID/SECRET)', status: auto(itemPresent('integrations', 'SPOTIFY')) },
        { label: 'Spotify redirect URIs registered (apex + www → /api/integrations/spotify/callback)', status: 'done' },
        { label: 'Spotify app out of Development mode (test accounts allowlisted, or production quota approved)', status: 'manual' },
        { label: 'Apple Music MusicKit auth flow (connect/disconnect, status)', status: 'done' },
        { label: 'Apple Music credentials set (TEAM_ID/KEY_ID/PRIVATE_KEY)', status: auto(itemPresent('integrations', 'APPLE_MUSIC')) },
        { label: 'Instacart grocery hand-off (products_link shopping list)', status: 'done' },
        { label: 'Grocery copy-to-clipboard fallback while Instacart access is pending', status: 'done' },
        { label: 'Instacart credentials set (INSTACART_API_KEY) — Developer Platform access requested; applications currently gated', status: auto(itemPresent('integrations', 'INSTACART')) },
      ],
    },
    {
      section: 'Eat/Train redesign & coach swaps',
      items: [
        { label: 'Eat/Train rebuilt to the "tracklist" look (hero + macros/moves + plan + shop + playlists)', status: 'done' },
        { label: 'Client one-tap swaps: coach-approved exercise + meal substitution', status: 'done' },
        { label: 'Coaches define alternatives in the workout + meal-plan builders', status: 'done' },
        { label: 'Alternatives round-trip builder → client (train/nutrition read endpoints return them)', status: 'done' },
        { label: 'Swaps persist to the shared store + notify the trainer/nutritionist', status: 'done' },
        { label: "Coach Adjust program/plan → Apply persists to client_programs.detail + reflects on the client's Train/Eat tabs (intensity/sessions/focus · calories/macros)", status: 'done' },
        { label: 'Migration 2026-06-05-client-program-detail.sql applied on Supabase (client_programs.detail jsonb)', status: 'manual' },
      ],
    },
    {
      section: 'Mobile ↔ website sync',
      items: [
        { label: 'window.shapeDb wired on mobile to the shared user_goals table', status: 'done' },
        { label: 'Swaps/prefs keyed consistently (meal/exercise name) across surfaces', status: 'done' },
        { label: '/m/ preview falls back to the shared Supabase project URL + publishable key', status: 'done' },
        { label: 'user_goals migration applied to the live project (PK user_id,kind + RLS)', status: 'manual' },
        { label: 'Native Capacitor build: VITE_SUPABASE_URL/ANON set at build time', status: 'manual' },
      ],
    },
    {
      section: 'Client goals & weigh-ins',
      items: [
        { label: 'Client Goal page rebuilt as 3 themed dashboards (Overall · Training · Nutrition) with a tab-aware header + Edit sheets', status: 'done' },
        { label: 'Me-page featured goal box (down-so-far / % there) taps through to the Goal page', status: 'done' },
        { label: 'Share-with-coaches toggle persists to user_goals(client_goals) (overall + training/nutrition metas + lists)', status: 'done' },
        { label: 'Coach reads a client’s shared goals (share-gated): mobile full-profile + website client page + /shared-overview', status: 'done' },
        { label: 'Live weigh-ins: client_weigh_ins table + ShapeWeighIns.list/log (one row/day upsert); Log weigh-in writes to the table when signed in', status: 'done' },
        { label: 'get_client_goals merges the live weigh-in series into overall.weighIns + latest into overall.now; coach sees the weight trend chart (mobile + website)', status: 'done' },
        { label: 'Overall dashboard data wired: stat grid (current/to-go/weekly pace/on-track) + milestones (start→25/50/75%→target, auto-✓) + the weight trend all derive from the real weigh-in series; consistency heatmap from live ShapeProgress.train.volumeByDay (demo fallback)', status: 'done' },
        { label: 'Website goal page ported to match mobile (Overall body-comp dashboard added) AND unified to user_goals(client_goals) — same key mobile uses + the one get_client_goals reads, so a goal set on either surface shows on both and to coaches (reads client_goals, falls back to legacy client, migrates flat goals[])', status: 'done' },
        { label: 'Overall tab "Your plans" + "This week · targets" now LIVE on both surfaces: plans from the assigned plan (ShapePlan/api/client/plan title + cadence) + coach detail (sessions/kcal) + program phase; weekly targets (Sessions done/target · Protein days · Sleep · 7d volume) from ShapeProgress train/nutrition/progress rollups. Demo fallback when signed-out / no data', status: 'done' },
        { label: 'Migrations applied on Supabase: 2026-06-13-client-goals-coach-read.sql + 2026-06-13-client-weigh-ins.sql', status: 'manual' },
      ],
    },
    {
      section: 'Universal search & discovery',
      items: [
        { label: 'Monochrome ⌕ in every header (left of the avatar): 5 client tabs, chat masthead, Terrain/Signal me-mastheads, sub-page corners, both coach Today headers — opens the search screen via shape:openSearch (client shell + both coach shells listen)', status: 'done' },
        { label: 'BSUniversalSearch screen: autofocused input, debounced live typeahead over every account (search_shape_people: role + photo + points→tier), All/Members/Coaches chips, demo cast as the signed-out fallback', status: 'done' },
        { label: 'Search matches names + @handles + bio/goal keywords (privacy-gated: private profiles match by name only, no photo)', status: 'done' },
        { label: 'Inline row actions: Follow/Requested/Following pill (live ShapeFollows state) + ✉ Message → real 1:1 (get_or_create_member_conversation) opened directly via shape:openConversation (all 3 shells)', status: 'done' },
        { label: '"People you may know" empty-state suggestions from the follow graph (get_follow_suggestions: mutuals + follows-you, avatar-enriched); Recent = recently VIEWED profiles (recorded centrally in BSPublicProfile, live-synced)', status: 'done' },
        { label: 'Beyond people (All filter): Channels (deep-links into the channel thread) · Shape Kitchen recipes (in-place detail) · Workouts (preview + Start) · Coach plans for sale (opens the coach profile)', status: 'done' },
        { label: '"Coached by" chip on the member Terrain hero links to the coach\'s live Signal profile (ShapeCoachLookup provider→owner; fixed the dormant {stored,data} unwrap bug that kept it on demo data)', status: 'done' },
        { label: 'Migration applied on Supabase: 2026-06-09-universal-search.sql (search_shape_people v2 — names + @handles + bio/goal keywords)', status: 'manual' },
        { label: 'Website-nav search parity: ⌕ in the pageShell header on every page (+ a mounted copy on the static index nav) — same RPC, role tags, tier-ringed avatars, rows → public profiles, Nora row → chat Help tab', status: 'done' },
      ],
    },
    {
      section: 'Member playlists (profile Music tab)',
      items: [
        { label: 'Music tab on both profiles: own library (add / public-private toggle / ✉ send / ↗ share / remove) + others\' public playlists (▶ open / ＋ save-to-library)', status: 'done' },
        { label: 'Add flow imports straight from the connected Spotify library (reuses /api/integrations/spotify/playlists); paste-a-link fallback covers Apple Music + unconnected', status: 'done' },
        { label: 'Migration applied on Supabase: 2026-06-09-member-playlists.sql (member_playlists + get_member_playlists)', status: 'manual' },
        { label: 'Website profile Music-tab parity', status: 'pending' },
      ],
    },
    {
      section: 'Usernames (Shape handles)',
      items: [
        { label: 'profiles.username (unique, case-insensitive) + is_username_available / set_my_username / get_email_for_username RPCs; search_shape_people matches usernames; get_public_profile returns username', status: 'done' },
        { label: 'Login accepts email OR username (mobile BSLogin + website login.jsx) — username resolves to the login email via RPC, friendly miss message', status: 'done' },
        { label: 'Signup username step with debounced live availability (mobile create-account covers client + coach roles; website signup forms client/trainer/nutritionist); choice rides user_metadata and is claimed at signup or first confirmed login', status: 'done' },
        { label: 'Profile @handles prefer the real username (Settings identity seed + Terrain/Signal heroes)', status: 'done' },
        { label: 'Migration applied on Supabase: 2026-06-09-usernames.sql', status: 'manual' },
        { label: 'Website client signup still an application stub (collects but does not create the auth account) — username goes live there when that flow does', status: 'pending' },
      ],
    },
    {
      section: 'Client surfaces & library',
      items: [
        { label: 'First-run app tour (skippable, replayable from Me → App tour): 7-step guided walkthrough that switches the underlying tab; persists to localStorage + user_goals(client_onboarding)', status: 'done' },
        { label: 'App tour coach variant (trainer + nutritionist) + new-accounts-only trigger (auto-shows only for accounts <24h old; existing users replay from Me → App tour)', status: 'done' },
        { label: 'Home ticker editor in Settings (client picks which metrics show)', status: 'done' },
        { label: 'Grocery coach-note split from the home Op-ed (two separate coach-editable messages)', status: 'done' },
        { label: 'Nutritionist Live Console pre-fills the existing grocery note per client', status: 'done' },
        { label: 'Grocery library: tap-to-preview, Load real contents, Edit, meal-plan Duplicate, Delete', status: 'done' },
        { label: '"Inside Shape" intro shows real recent community posts', status: 'done' },
        { label: 'Home re-layout: removed the Log/Activity + Habits + Score quick chips. Day Log header shows the selected day\'s +N pts (live per-date ledger, demo fallback). New Habits section under the Day Log — same numbered rows (DO/AVOID pill, name, done state, points), per-day check-mark box, header +N pts + View → to the full habits page. Me-page Score card leads with +N today', status: 'done' },
        { label: 'Day-log detail sheet redesign: tag-tinted header + rounded badge, 3 rounded metric tiles, frosted backdrop blur, rounded pill buttons; workout items show an Exercises preview (moves + scheme + load). Tag pills modernized to soft tinted rounded badges (Day Log + Habits)', status: 'done' },
        { label: 'Meal preview shows a real food photo: meal.photo → coach-uploaded media image → inferred stock food photo (halftone fallback). Cards "Show on home" dropdown: hidden scrollbar + no close on internal scroll', status: 'done' },
        { label: 'Find-a-coach bars (Train/Eat) filled in role color (trainer rust / nutritionist gold), compact, thicker border; tier name removed from the Settings identity avatar', status: 'done' },
        { label: 'Me tab is PROFILE-FIRST: opens as your living Terrain profile (masthead = logo + Vol·No + ME / Profile.) with the Shape Score card + tappable goal card in the header; Stats tab embeds the FULL progress page (Overall/Training/Nutrition, live ShapeProgress, forced-dark via BSContext); Signals + Climb wired live (streak, trajectory, momentum, disciplines, lifts, score). Tier unified across avatars/profile/score/Settings (one client-score source — live signed-in, Tempo/1284 preview)', status: 'done' },
        { label: 'Settings consolidated into ONE screen (BSSettings): merged the old Me-page hub in — Account · Preferences · Nutrition · Training · Health integrations · Notifications · Privacy · Membership & billing · More (Goals/Habits/Library/Progress/Score/Store/Leaderboard/Sessions) · Appearance/Radio/Light-fx/Ticker · About · Account actions. Cards are divider rows (no boxes); identity card kept as the summary', status: 'done' },
      ],
    },
    {
      section: 'Code health (behavior-preserving)',
      items: [
        { label: 'Dead code removed (~860 lines mobile + website orphans), verified zero call-sites', status: 'done' },
        { label: 'Me/Settings restructure sweep: removed ~1,070 dead lines from iosAppBroadsheetClient (BSMeSettingsHub superseded by merged BSSettings, BSClientProgressLegacy, BSEditSheet, BSFeedActivityCard, BSProfilePrivacy, BSTerrainContours/Ridge) — all verified zero non-def references repo-wide', status: 'done' },
        { label: 'Dead-code audit: removed 8 orphaned components + addPlanToGrocery + unused state (~660 lines, tree-shaken so bundle unchanged); consolidated meal-note uploads into one helper', status: 'done' },
        { label: 'Dead-code sweep: removed 4 unused Radio components (BSShapeRadioLogo/BSRadioFeedbackPanel/BSRadioInlineFeedback/ChannelRow, ~262 lines) + the now-unused Settings Icon component — all verified zero non-def references', status: 'done' },
        { label: 'Shared API helpers: request-auth (22 routes), time, stripe loadStripe, coach-roster clients twin', status: 'done' },
        { label: 'Mobile data-layer de-dup: getJsonOrDefault, providerTable, COMMUNITY_POST_SELECT', status: 'done' },
        { label: 'Train/Eat MOCK_PROGRAM memoized; t.RED palette bug fixed (error text now renders)', status: 'done' },
        { label: 'Deferred: useUserGoals hook + newdesign shared-includes (need a manual browser/device pass)', status: 'pending' },
      ],
    },
    {
      section: 'Community chat & channels',
      items: [
        { label: 'Feed scoped into channels (members / trainers-only / nutritionists-only) + live COMMUNITY feed', status: 'done' },
        { label: 'DMs, comments, and posts are live + persist; tapping a row opens a real thread', status: 'done' },
        { label: 'Member-created channels: create / discover / join / host add-members / channel chat', status: 'done' },
        { label: 'Public/private channels + per-user pin-to-top', status: 'done' },
        { label: 'Realtime messages + per-row unread badges + persisted unread + Chat-tab badge', status: 'done' },
        { label: 'Channel migrations applied in Supabase (channels, visibility, realtime publication, unread RPCs)', status: 'manual' },
      ],
    },
    {
      section: 'Meal logging & coach delivery',
      items: [
        { label: 'Meal logger rebuilt: Adjust / Photo / Search / Voice tabs', status: 'done' },
        { label: 'Live ingredient editor — add / edit / delete with macro fields', status: 'done' },
        { label: 'Voice note to coach: dictate (speech→text) + record an audio memo (/api/nutrition/voice · Whisper)', status: 'done' },
        { label: 'Meal photo: camera/upload capture, inline preview, delivered to the coach', status: 'done' },
        { label: 'Delivery route /api/nutrition/meal-note fans note + memo + photo to every linked coach (trainer + nutritionist)', status: 'done' },
        { label: 'Coach chat thread renders the voice-memo player + meal photo inline', status: 'done' },
        { label: "'Log Now' on a meal preview opens the full logger; calendar preview keeps one-tap 'Ate it as planned'", status: 'done' },
        { label: "Shop list auto-builds from the week's meal ingredients (deduped, aisle-grouped) — matches the meals", status: 'done' },
        { label: 'Swap meal: pick which meal first, then the coach-approved alternate', status: 'done' },
        { label: 'Meal-search recents add to the meal + filter as you type', status: 'done' },
        { label: 'meal-notes storage bucket migration applied (audio + image mime types, 15 MB)', status: 'manual' },
        { label: 'community-photos storage bucket + community_posts.photo_url migration applied (public read, owner-folder write) — photo posts on feed + profiles, mobile + website', status: 'manual' },
        { label: 'user_follows table + get_follow_stats/toggle_follow/get_follow_list RPCs migration applied — follower/following on public profiles, mobile + website', status: 'manual' },
        { label: 'follow requests migration applied (user_follows.status + shape_profile_visibility + list/respond_follow_request RPCs) — private profiles require approval, public follow instantly; toggle_follow + respond_follow_request emit notifications (follow / follow_request / follow_accept)', status: 'manual' },
        { label: 'Food-database free-text search in the logger (Search tab uses local recents today)', status: 'pending' },
        { label: 'Native mic + camera plugins for the iOS App Store build (WebView file/Media fallback today)', status: 'pending' },
      ],
    },
    {
      section: 'Mobile UI polish',
      items: [
        { label: 'Shape Radio now-playing bar spans the full screen width (full-bleed)', status: 'done' },
        { label: 'Shape Score tier badge → minimal chip above the Me-page header; simpler score card', status: 'done' },
        { label: 'Settings: Light effects is a collapsible "Customize" section (like Appearance); smaller section headers', status: 'done' },
        { label: 'Circular avatars app-wide; cursive initials monogram on Settings identity', status: 'done' },
        { label: 'Coach-playlist cards: Spotify logo + green, compact; play opens Spotify (not Apple Music)', status: 'done' },
        { label: 'App-wide paper-theme sweep — all 11 papers (light/white/manila/steel/bone · dark/teal/blueprint/carbon/oxblood) read correctly: bottom nav bar tracks t.PAPER_BG (matches the page incl. metallic Steel); fixed dark-designed bits (profile cards/avatar, Me KPIs). Intentional fixed-color surfaces verified (night-sky auth, splash, color-picker swatches, #fff on colored chips)', status: 'done' },
        { label: 'Shape Radio wordmark adapts on light papers: a recolored shape-radio-logo-lt.png (SHAPE + 2nd play-triangle → ink/black, play-triangle + RADIO stay teal) — the two-tone treatment; BSRadioWordmark picks the PNG by paper on the radio screen + prompt header', status: 'done' },
        { label: 'Calendar month view redesigned: per-day event list = clean divider rows (was bordered boxes); tighter grid cells (today ring) so weeks fit; event preview sheets read REAL data (workout looks up the session by title → cardio shows run segments not barbell rows; meal parses kcal/protein + derives carbs/fat + macro-split bar + "On the plate" from the title)', status: 'done' },
        { label: 'Settings rows: removed the rounded icon boxes (client BSSettings HubCard) — title + summary + chevron, accent on the title. Coach settings (BSProMe) already used numbered rows', status: 'done' },
      ],
    },
    {
      section: 'Marketplace & coach profiles',
      items: [
        { label: 'Marketplace rebuilt as editorial discovery (Find your coach · All/Trainers/Nutritionists · Coach of the Week · Featured · Programs)', status: 'done' },
        { label: 'Live filters match the website (category dropdown + format/location/sort) with live-provider backfill; compact dropdowns', status: 'done' },
        { label: "What's hot rail: live published, priced coach_plans across ALL coaches, tabbed Programs/Workouts/Meal plans + tap-to-buy (Stripe Connect); sample fallback in preview. Migration 2026-06-14-market-plans.sql (get_market_plans)", status: 'done' },
        { label: 'Marketplace cards + list rows + Coach of the Week now PREVIEW the living profile: facet gem avatar (real photo when present, else 2 initials), coach-ladder tier name/color, italic tagline, /10 rating', status: 'done' },
        { label: 'Tapping a coach opens the full living profile (Signal) — app (BSPublicProfile) + website (MemberProfile.html?name&role / ?u). Storefront consolidated INTO the living profile Coaching tab: Subscribe + Book intro + offerings/Buy (global ShapePayments/ShapeBookings) + sticky "Work with {first}" CTA', status: 'done' },
        { label: 'Reviews on their own profile tab (app + website); review authors link to their profile (authorId from /api/coaches/reviews); coach rating shown on a 1–10 scale everywhere', status: 'done' },
        { label: "Client 'Library': save trainers' workouts & paid plans + nutritionists' meals/plans to profile (model + screen + sell/checkout path)", status: 'done' },
        { label: 'Coach media: trainers/nutritionists upload demo PHOTOS & VIDEOS for each plan/program/workout in the draft editor (BSCoachDraftEditor) → public coach-media bucket (own <uid>/ folder, 200MB/img+video) → detail.media. Migration 2026-06-09-coach-media.sql + 2026-06-09-coach-sale-plans-detail.sql (sale-plan RPCs return detail). Clients preview the media strip on the coach profile sale-plan rows (mobile + website)', status: 'done' },
        { label: 'Real coach accounts resolve on BOTH surfaces: app fetches live trainers/nutritionists + each real saved photo (get_public_profile.avatar); website marketplace now does the same — merges live coaches ahead of the demo directory (deduped), real cards link to the live profile (?u=<owner>), demo links pass &avatar= so derived profiles show the card photo. marketplace.jsx ?v=5', status: 'done' },
        { label: 'Website signed-out marketing: real face photos on the spotlight + grid; coach-customizable COVER image band behind the avatar (darkened/tinted; demo covers + real profile_custom.cover.image); facet gem avatars; filter dropdowns', status: 'done' },
        { label: 'Sweep now-dead marketplace constants + BSCoachDetailPublic/publicProfile.jsx (superseded by the living profile as the coach destination)', status: 'pending' },
      ],
    },
    {
      section: 'Public profiles, presence & avatars',
      items: [
        { label: 'Living-identity public profiles: clients → Terrain (ridgeline ascent hero), coaches → Signal (pulsing sigil instrument)', status: 'done' },
        { label: 'Facet (gem) avatar system app-wide: headers, chat, feed, presence rail, settings (+ add/change photo)', status: 'done' },
        { label: "Me + Settings 'View public profile' link on every role; edit from your own profile; coach Signal self-view", status: 'done' },
        { label: 'Profile privacy selector Public / Friends / Private — enforced server-side (get_public_profile can_view; friends = shared DM)', status: 'done' },
        { label: 'Real per-user online presence (Supabase Realtime online-users) on mobile + website; pulsing live ring when online', status: 'done' },
        { label: "Live \"doing now\" activity dot: avatar corner dot = active right now — teal = in a workout, amber = cooking (decoupled from the online ring). DB-backed (user_activity table + realtime, 6h expiry) so the workout dot persists across screens / app backgrounding and clears only on End/Finish; ShapePresence.setActivity/activityOf. Migration 2026-06-09-user-activity.sql", status: 'done' },
        { label: 'Facet avatar guarantees photo OR 2 initials (never a blank/placeholder gem) — now a CENTRALIZED rule: BSFacetAvatar derives initials from a name prop when none passed; both surfaces ignore blank/stale photo values (bsValidPhoto / portraitOk: empty, "null", bodyless data: URIs → fall back to initials). Website LvPortrait derives initials from d.name when d.initials absent (was a generic crest). Holds for demo + live. Mobile BSFacetAvatar + website LvPortrait (?v=14)', status: 'done' },
        { label: 'Presence rail ("Training now") is LIVE: get_active_now (SECURITY DEFINER, granted anon+authenticated) returns real people mid-workout/cooking with name·role·points(→tier)·avatar; ShapePresence.activeNow powers the rail (excludes self, demo fallback in preview, refreshes on shape:presence + 45s poll). Migration 2026-06-09-get-active-now.sql', status: 'done' },
        { label: "'Show when I'm online' opt-out toggle on mobile Settings + website Me — shared client_settings.onlineVisible", status: 'done' },
        { label: 'Website chat popup uses the facet avatar incl. your own avatar next to your messages; support tab (Nora) shows an avatar', status: 'done' },
        { label: "Member photos carry into feed/chat/profile avatars app-wide; avatar always visible (even private) — picture or initials", status: 'done' },
        { label: 'Followers / following lists are a shared sheet on every profile type (mobile BSFollowListSheet + website MemberProfile.html): each row shows the person\'s real profile photo (batched via get_public_profile.avatar / ShapeProfiles.getUserAvatars; demo faces for accountless people) AND is a live link to their public profile (BSPublicProfile / MemberProfile.html?u=). Settings identity counts open the same sheet directly (parity with the profile)', status: 'done' },
        { label: 'Preview mode: demo/seed people show stock faces (app + website) so prospects see avatars on bubbles + profiles', status: 'done' },
        { label: 'Client Terrain profile ported from design handoff: ascent-card hero (facet you-are-here) + THE CLIMB section (start→now→summit)', status: 'done' },
        { label: "THE CLIMB Start/Now/Target + % wired to your real body-comp goal + weigh-ins on your own profile (demo arc for others)", status: 'done' },
        { label: 'Migrations applied in Supabase: public-profile friends-visibility + public-profile avatar + avatar-ungated', status: 'manual' },
        { label: 'Profile customization (app + website): bio + profile song (Spotify embed) + Hinge-style prompts + social links + cover image + personal accent + pinned highlight + headline stats — self-serve editor, surfaced to others via get_public_profile custom. Migration 2026-06-08-profile-custom.sql', status: 'done' },
        { label: 'THE CLIMB is aspect-customizable: in-box tabs (Body weight / Body fat / Strength / Shape Score / Day streak) + a customize picker; the ridgeline now-dot tracks the selected aspect (app + website)', status: 'done' },
        { label: 'Client ascent hero = progress to your next LEVEL (tier): next level labelled by the flag in the next-tier color; fixed avatar overlap + jump on tab switch (app + website)', status: 'done' },
        { label: 'Coach Signal sigil meaningful: outer heptagon = % to next tier (status bar), 3 inner rings = Habits / Client workouts / Own activity wired live via /api/coach/rings (self), tier-anchored fallback', status: 'done' },
        { label: 'Avatars show the tier NAME (not roman numerals); facet tier renders as a plain word; tier moved off the avatar into the hero (client) / under the name (coach)', status: 'done' },
        { label: 'Profile edit affordances: pencil icon top-right → Settings edit info; Customize button → rich customizer; privacy selector moved to Settings → Privacy & data (same client_settings.profileVisibility); dock = Message/Work-with for others only', status: 'done' },
        { label: 'Tier bonuses on the Shape Score ladder: +500/1000/2000/4000 awarded once at Tempo/Form/Peak/Legend (idempotent). Migration 2026-06-08-tier-bonuses.sql', status: 'done' },
        { label: 'Me-page "Your team / Coaches" is live (real linked coaches via coach DM threads + unread); Log Activity redesigned (custom activity + note + share-to-community sync to feed + profile)', status: 'done' },
        { label: 'Profile "Log activity" composer (Substack-style) on BOTH member (Terrain) + coach (Signal) profiles: publish Note / Photo / Video (upload via coach-media OR paste a watch link) / Workout (type + stat fields) / Link (website/article card). Rich payload rides in community_posts.metrics (kind/video_url/link/workoutStats) — no migration; shared BSActivityBody renders every type. Profile feed loads the author\'s real posts', status: 'done' },
        { label: 'Post visibility is 3-state on the composer (all profile types): Public (profile + feed) · Profile (visible to everyone on the profile, kept OUT of the feed) · Just me (private). Feed reads exclude profile/private (mobile listCommunityPosts + website /api/community/feed). Migration 2026-06-09-community-profile-visibility.sql (privacy CHECK + RLS so profile reads like public)', status: 'done' },
        { label: 'Profile reads on every paper: avatar gem inner + initials, Shape Score card, goal card, Me KPIs no longer hardcode cream/black — all follow the paper theme (light papers fixed)', status: 'done' },
        { label: 'Wire remaining illustrative sub-data (some sigil-ring inputs, certs, field-notes) to fully real rollups', status: 'pending' },
      ],
    },
    {
      section: 'Shape Score ladders (client + coach)',
      items: [
        { label: 'Coach tier ladder (Certified · Pro · Elite · Master · Icon) separate from clients — mobile + website', status: 'done' },
        { label: 'Website Shape Score page: Members / Coaches tab swaps the ladder; logged-in coaches see the coach ladder', status: 'done' },
        { label: 'Score tier nodes: progress connector bar layered behind the opaque tier discs (no line cutting across circles)', status: 'done' },
        { label: 'Mobile Shape Score hero unified to the tier thresholds: ring %, the in-hero climb graph (current tier → now → next tier), and "To {nextTier}" all derive from the same current/next thresholds + live scoreTotal (was score/goal, which diverged). Condensed; the Me-page climb dropped its Shape Score aspect (it lives here now)', status: 'done' },
        { label: 'Shape Score page tabbed: Tiers (default) / Rewards / Points / Ledger under the hero (flat rows); Store opens via a header "STORE" button mirroring the store page\'s "SCORE"', status: 'done' },
        { label: 'Point values are role-specific: client list (14 ways) vs coach lists (trainer & nutritionist share the same 12 point amounts, role-specific activity names). App (profile.activities via _bsUseLiveScore) + website (client score.jsx list + per-role coach earn-list on Trainer/NutritionistScore)', status: 'done' },
        { label: 'Recent-points ledger live across profiles: /api/client/score → recent (real score_ledger) on mobile (all roles via _bsUseLiveScore) + website client score.jsx; coach pages use a derived metric breakdown (no event ledger by design)', status: 'done' },
        { label: 'Store balance box fully live for all profiles: profile wrapped in _bsUseLiveScore so tier + available are live for coaches too; lifetime earned computed live (balance + Σ redemption cost_points) instead of static', status: 'done' },
        { label: 'Store catalogue role-correct (app + website): clients see Merch + Training + Nutrition + Perks; coaches see Merch + Coach Tools (Lead Boost). Was showing every product to every role. Mobile lead-boost redemption → /api/lead-boosts (ShapeStore.redeemLeadBoost)', status: 'done' },
      ],
    },
  ];
}

export async function buildWarRoomSnapshot(): Promise<WarRoomSnapshot> {
  const config = buildConfig();
  const apiRoutes = buildApiRoutes();
  const [services, inventory] = await Promise.all([
    Promise.all([pingSupabase(), pingStripe()]),
    buildInventory(),
  ]);
  // The embedded list is the source of truth for the count too.
  inventory.apiRoutes = RAW_ROUTES.length;
  const checklist = buildChecklist(config, inventory.mobileBuild);

  // Readiness = required config groups that are fully wired.
  const requiredGroups = config.filter((g) => g.required);
  const readyCount = requiredGroups.filter((g) => g.ready).length;
  const score = readyCount;
  const total = requiredGroups.length;
  const label = score === total ? 'Launch-ready config' : score === 0 ? 'Not configured' : 'Partially configured';

  return {
    generatedAt: new Date().toISOString(),
    runtime: {
      vercelEnv: process.env.VERCEL_ENV ?? null,
      nodeEnv: process.env.NODE_ENV ?? null,
      nodeVersion: process.version,
      region: process.env.VERCEL_REGION ?? null,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
    },
    config,
    services,
    inventory,
    apiRoutes,
    checklist,
    readiness: { score, total, label },
    architecture: SHAPE_ARCHITECTURE,
  };
}
