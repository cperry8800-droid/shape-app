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
export type ArchLayer = { layer: string; serves: string; purpose: string; pieces: string[] };
export type ArchMatrixRow = { area: string; member: string; trainer: string; nutritionist: string };
export type ShapeArchitecture = {
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
    { layer: 'Surfaces', serves: 'Everyone', purpose: 'Where Shape is used.', pieces: ['Mobile broadsheet (/m, Capacitor)', 'Website (marketing + /newdesign)', 'Coach apps (trainer + nutritionist shells)', 'Web dashboard'] },
    { layer: 'The Loop (member value)', serves: 'Member', purpose: 'The daily reason to open the app.', pieces: ['Train', 'Eat', 'Habits', 'Goals', 'Shape Score', 'Progress hub', 'Library', 'Store'] },
    { layer: 'Coach tools', serves: 'Trainer / Nutritionist', purpose: 'Program the work + run the business.', pieces: ['Roster', 'Programs / Meal plans', 'Adjust program/plan', 'Grocery lists', 'Soundtracks', 'Schedule', 'Client analytics', 'Care Team (co-coach chat)'] },
    { layer: 'Social graph', serves: 'Member + Coach', purpose: 'Connection + accountability.', pieces: ['Public profiles (Terrain / Signal)', 'Followers / following (+ requests)', 'Community feed (posts, photos, @tags)', 'Channels', 'DMs', 'Shape Radio'] },
    { layer: 'Platform services', serves: 'All', purpose: 'The cross-cutting spine.', pieces: ['Membership & billing (Stripe $5/mo + coach subs)', 'Notifications → system push', 'Integrations (Whoop/Garmin/Strava/Oura/Spotify/Apple Health)', 'Nora AI support'] },
    { layer: 'Data & infra', serves: 'System', purpose: 'Source of truth + enforcement.', pieces: ['Supabase (Auth, Postgres, RLS, SECURITY DEFINER RPCs, Storage)', 'Next.js API routes', 'Edge proxy membership gate', 'War Room'] },
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
  ['/api/client/progress', 'GET'],
  ['/api/client/score', 'GET'],
  ['/api/client/team', 'GET'],
  ['/api/client/train', 'GET'],
  ['/api/clients/[id]/shared-overview', 'GET'],
  ['/api/coach/grocery-lists', 'GET,POST,PATCH,DELETE'],
  ['/api/coach/score', 'GET'],
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
      section: 'Payments (Stripe)',
      items: [
        { label: 'Live secret key set', status: auto(stripeMode(process.env.STRIPE_SECRET_KEY) === 'live') },
        { label: 'Webhook secret set', status: auto(present(process.env.STRIPE_WEBHOOK_SECRET)) },
        { label: 'Platform price ID set', status: auto(present(process.env.STRIPE_PLATFORM_PRICE_ID)) },
        { label: 'Connect activated for coach payouts', status: 'manual' },
        { label: 'Shape Store gated to members (mobile + website): upgrade prompt unless active subscription (coaches allowed); Me-row 🔒 hint; checked via /api/stripe/subscription', status: 'done' },
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
        { label: 'Migrations applied on Supabase: 2026-06-13-client-goals-coach-read.sql + 2026-06-13-client-weigh-ins.sql', status: 'manual' },
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
      ],
    },
    {
      section: 'Code health (behavior-preserving)',
      items: [
        { label: 'Dead code removed (~860 lines mobile + website orphans), verified zero call-sites', status: 'done' },
        { label: 'Dead-code audit: removed 8 orphaned components + addPlanToGrocery + unused state (~660 lines, tree-shaken so bundle unchanged); consolidated meal-note uploads into one helper', status: 'done' },
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
      ],
    },
    {
      section: 'Marketplace & coach profiles',
      items: [
        { label: 'Marketplace rebuilt as editorial discovery (Find your coach · All/Trainers/Nutritionists · Coach of the Week · Featured · Programs)', status: 'done' },
        { label: 'Coach profile page (BSCoachDetailPublic) redesigned: gradient hero, circular avatar, pill tabs, rounded CTAs', status: 'done' },
        { label: 'Two side-by-side coach-apply CTAs (trainer + nutritionist) on the discovery view', status: 'done' },
        { label: "Client 'Library': save trainers' workouts & paid plans + nutritionists' meals/plans to profile (model + screen + sell/checkout path)", status: 'pending' },
        { label: 'Sweep now-dead marketplace constants + ListingRow; confirm $rate/mo pricing semantics', status: 'pending' },
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
        { label: "'Show when I'm online' opt-out toggle on mobile Settings + website Me — shared client_settings.onlineVisible", status: 'done' },
        { label: 'Website chat popup uses the facet avatar incl. your own avatar next to your messages; support tab (Nora) shows an avatar', status: 'done' },
        { label: "Member photos carry into feed/chat/profile avatars app-wide; avatar always visible (even private) — picture or initials", status: 'done' },
        { label: 'Preview mode: demo/seed people show stock faces (app + website) so prospects see avatars on bubbles + profiles', status: 'done' },
        { label: 'Client Terrain profile ported from design handoff: ascent-card hero (facet you-are-here) + THE CLIMB section (start→now→summit)', status: 'done' },
        { label: "THE CLIMB Start/Now/Target + % wired to your real body-comp goal + weigh-ins on your own profile (demo arc for others)", status: 'done' },
        { label: 'Migrations applied in Supabase: public-profile friends-visibility + public-profile avatar + avatar-ungated', status: 'manual' },
        { label: 'Wire remaining profile sub-data (disciplines, lifts, certs, reviews, field-notes) to real workout/PR/marketplace data', status: 'pending' },
      ],
    },
    {
      section: 'Shape Score ladders (client + coach)',
      items: [
        { label: 'Coach tier ladder (Certified · Pro · Elite · Master · Icon) separate from clients — mobile + website', status: 'done' },
        { label: 'Website Shape Score page: Members / Coaches tab swaps the ladder; logged-in coaches see the coach ladder', status: 'done' },
        { label: 'Score tier nodes: progress connector bar layered behind the opaque tier discs (no line cutting across circles)', status: 'done' },
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
