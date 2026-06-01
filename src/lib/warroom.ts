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
    ], false, 'ai', 'AI (plans / readouts)'),

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
      { key: 'GARMIN', label: 'Garmin', present: present(env.GARMIN_CLIENT_ID) && present(env.GARMIN_CLIENT_SECRET) },
      { key: 'SPOTIFY', label: 'Spotify', present: present(env.SPOTIFY_CLIENT_ID) && present(env.SPOTIFY_CLIENT_SECRET) },
      { key: 'APPLE_MUSIC', label: 'Apple Music', present: present(env.APPLE_MUSIC_KEY_ID) && present(env.APPLE_MUSIC_TEAM_ID) },
    ], false, 'integrations', 'Integrations'),
  ];
}

// ── Go-live checklist (config-derived where possible) ───────────────────────

function buildChecklist(config: ConfigGroup[]): ChecklistSection[] {
  const group = (k: string) => config.find((g) => g.key === k);
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
        { label: 'Full payments stack live', status: auto(stripeReady) },
      ],
    },
    {
      section: 'Notifications',
      items: [
        { label: 'In-app notifications (needs migrations)', status: 'manual' },
        { label: 'System push (FCM keys + webhook secret)', status: auto(pushReady) },
        { label: 'APNs key uploaded to Firebase (iOS)', status: 'manual' },
      ],
    },
    {
      section: 'Apps & Release',
      items: [
        { label: 'Mobile web build present (/m)', status: 'manual' },
        { label: 'Android signed release secrets', status: 'manual' },
        { label: 'End-to-end smoke test passed', status: 'manual' },
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
  const checklist = buildChecklist(config);

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
  };
}
