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
import { buildFunnel } from './funnel.mjs';
import { createAdminClient } from './supabase/admin';

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
  funnel: { cohortDays: number; generatedFor: string; rows: import('./funnel').FunnelRow[]; biggestDrop: string | null };
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
    ] },
    { layer: 'Coach tools', serves: 'Trainer / Nutritionist', purpose: 'Program the work + run the business.', pieces: ['Roster', 'Programs / Meal plans', 'Assign to client (catalogue → client Train/Eat)', 'Adjust program/plan', 'Grocery lists', 'Soundtracks', 'Schedule', 'Client analytics', 'Care Team (co-coach chat)'], gaps: [
      { task: 'Trainer "sell a plan" paid-checkout path — built on the Connect checkout: coach publishes a priced plan → "Plans for sale" + Buy on the coach profile → plan_id rides through checkout/webhook → unlocks in the buyer\'s Library. Needs live Stripe to verify the charge', status: 'in-progress', priority: 'P1' },
      { task: 'Coach credential verification — BUILT (web): coach uploads COI + certs (dashProfileExtras card → /api/coach/credentials/document) → submit → admin review queue (/dashboard/credentials) → Approve mirrors verified onto the trainers/nutritionists row → ✓ Verified badge on marketplace + living profile; weekly /api/cron/credential-expiry nudges 60-day insurance/license expirations via the notifications spine. Migration APPLIED 2026-06-19. Remaining: mobile marketplace/profile badge + richer apply-time COI capture', status: 'in-progress', priority: 'P2' },
      { task: 'Adjust → full program/plan regeneration', status: 'not-started', priority: 'P2' },
      { task: 'Website soundtrack attach for demo-seed rows still local', status: 'not-started', priority: 'P3' },
    ] },
    { layer: 'Social graph', serves: 'Member + Coach', purpose: 'Connection + accountability.', pieces: ['Public profiles (Terrain / Signal)', 'Followers / following (+ requests)', 'Community feed (posts, photos, @tags)', 'Channels', 'DMs', 'Shape Radio'], gaps: [
      { task: 'Feed activity "proof cards" now LIVE: the COMMUNITY feed builds Strava-style cards from real community posts that are workouts/runs (bsActivityFromPost — composer workoutStats + sensor statA/B/C + GPS route), with the author\'s live tier + avatar; demo cards are the signed-out / no-activity-yet fallback. Tapping a card opens the redesigned Session-details page with per-activity, axis-labeled graphs (Pace/Speed · HR+zones · Cadence · Elevation · Power · Splits) driven by REAL Strava streams, resampled by distance — on BOTH mobile (BSActivityDetail) and the website dashboard Community feed (dashboardCommunity.jsx Session-details modal)', status: 'in-progress', priority: 'P3' },
      { task: 'Follow suggestions need real account volume', status: 'not-started', priority: 'P3' },
      { task: 'GPS routes on feed cards — REAL polylines now render when a post carries normalized points (Strava imports do; privacyZonesApplied=true since Strava trims via the athlete\'s privacy zones). TO DO: (1) Garmin route extraction once their API access is approved — Activity Details GPS samples → downsample(80) → normalize, and apply OUR OWN start/end privacy-zone trimming (raw Garmin GPS has none — required before those routes go public); (2) Whoop has NO GPS hardware/API — routes will never come from Whoop, only strain/HR stats (already on cards)', status: 'in-progress', priority: 'P2' },
    ] },
    { layer: 'Platform services', serves: 'All', purpose: 'The cross-cutting spine.', pieces: ['Membership & billing (Stripe $5/mo + coach subs)', 'Notifications → system push', 'Integrations (Whoop/Garmin/Strava/Oura/Spotify/Apple Health)', 'Nora AI support'], gaps: [
      { task: 'Activate system push — CLOUD PIPELINE LIVE + verified (2026-06-21): FCM_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY + PUSH_WEBHOOK_SECRET set in Vercel, and the Supabase DB Webhook (notifications INSERT → POST /api/push/dispatch, header x-push-secret) fires correctly — verified end-to-end with a test notification (webhook → dispatch returned 200, FCM creds recognized). The aps-environment (Push/APNs) entitlement is now committed (App.entitlements, #1484) + a full Mac-side owner checklist (docs/native-ios-build-checklist.md). Remaining (Mac-only): APNs .p8 upload into Firebase (Cloud Messaging → Apple app config) + the native iOS App Store build (GoogleService-Info.plist) so a device can actually receive it', status: 'in-progress', priority: 'P1' },
      { task: 'User-set reminder notifications — BUILT: members add their own reminders (weigh-in / check-in / water / photo / custom) with time + days in Settings → Notifications (BSReminderManager); user_scheduled_reminders table + /api/client/reminders CRUD; hourly /api/cron/reminders fires due reminders (tz-aware, once/local-day) via the notifications→push spine. Migration APPLIED 2026-06-19 (user-reminders). Desktop-website Settings parity SHIPPED (#1483 — ReminderCard on the client Settings page, same /api/client/reminders CRUD) + a web notification-preferences dashboard (NotificationDashboard, mobile BSNotifyPrefs parity). Remaining sliver: web habit-reminder time/days authoring (web surfaces + toggles habit_reminders; setting the schedule is still mobile-only)', status: 'in-progress', priority: 'P3' },
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
  ['/api/ai/audit', 'GET'],
  ['/api/ai/audit/undo', 'POST'],
  ['/api/ai/directive', 'POST'],
  ['/api/ai/directive/override', 'POST'],
  ['/api/ai/draft-message', 'POST'],
  ['/api/ai/draft-message/sent', 'POST'],
  ['/api/ai/generate-plan', 'POST'],
  ['/api/ai/notify', 'POST'],
  ['/api/ai/notify/cron', 'GET,POST'],
  ['/api/cron/score-accountability', 'GET,POST'],
  ['/api/cron/credential-expiry', 'GET,POST'],
  ['/api/cron/reminders', 'GET,POST'],
  ['/api/analytics/track', 'POST'],
  ['/api/auth/resolve-username', 'POST'],
  ['/api/cron/analytics-purge', 'GET'],
  ['/api/client/reminders', 'GET,POST,DELETE'],
  ['/api/ai/proposals', 'POST'],
  ['/api/ai/proposals/confirm', 'POST'],
  ['/api/ai/speak', 'POST'],
  ['/api/ai/transcribe', 'POST'],
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
  ['/api/account/export', 'GET'],
  ['/api/account/delete', 'POST'],
  ['/api/privacy-request', 'POST'],
  ['/api/client/commitment', 'GET,POST'],
  ['/api/client/compliance', 'GET,POST'],
  ['/api/client/dashboard', 'GET'],
  ['/api/client/grocery', 'GET'],
  ['/api/client/habits', 'GET,POST'],
  ['/api/client/hydration', 'GET,POST'],
  ['/api/client/nutrition', 'GET'],
  ['/api/client/profile-stats', 'GET'],
  ['/api/client/plan', 'GET'],
  ['/api/client/planned-meals', 'GET,POST,DELETE'],
  ['/api/client/progress', 'GET'],
  ['/api/client/score', 'GET'],
  ['/api/client/team', 'GET'],
  ['/api/client/strength', 'GET'],
  ['/api/client/timezone', 'POST'],
  ['/api/client/train', 'GET'],
  ['/api/clients/[id]/shared-overview', 'GET'],
  ['/api/clients/[id]/goals', 'GET,POST'],
  ['/api/coach/grocery-lists', 'GET,POST,PATCH,DELETE'],
  ['/api/coach/plans', 'GET,POST,PATCH,DELETE'],
  ['/api/coach/credentials', 'GET,POST'],
  ['/api/coach/credentials/document', 'POST'],
  ['/api/coach/review-note', 'POST'],
  ['/api/coach/rings', 'GET'],
  ['/api/coach/roster-sleep', 'POST'],
  ['/api/coach/roster-weekend', 'POST'],
  ['/api/coach/score', 'GET'],
  ['/api/coach/soundtracks', 'GET,POST,PATCH,DELETE'],
  ['/api/coaches/reviews', 'GET,POST'],
  ['/api/community/feed/[postId]/comments', 'POST'],
  ['/api/community/feed/[postId]/like', 'POST'],
  ['/api/community/feed', 'GET,POST'],
  ['/api/community/pr-wall', 'POST'],
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
  ['/api/integrations/reconcile', 'GET,POST'],
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
  ['/api/nutrition/meal-log', 'POST'],
  ['/api/nutrition/voice', 'POST'],
  ['/api/client/progress-photos', 'GET,POST'],
  ['/api/client/checkin-kit', 'GET,POST'],
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
  ['/api/radio/now-playing', 'GET'],
  ['/api/radio/rooms', 'GET,POST'],
  ['/api/radio/station', 'GET'],
  ['/api/recipes/reviews', 'GET,POST'],
  ['/api/sessions/manage', 'GET,POST'],
  ['/api/store/redeem', 'GET,POST'],
  ['/api/store/checkout', 'POST'],
  ['/api/stripe/billing-portal', 'POST'],
  ['/api/stripe/checkout-session', 'POST'],
  ['/api/stripe/connect-account', 'POST'],
  ['/api/stripe/connect/onboard', 'POST'],
  ['/api/stripe/connect/refresh', 'GET'],
  ['/api/stripe/payment-method', 'GET'],
  ['/api/stripe/platform-checkout', 'POST'],
  ['/api/stripe/webhook', 'POST'],
  ['/api/trainer/analytics', 'GET'],
  ['/api/trainer/clients', 'GET'],
  ['/api/trainer/console', 'GET,POST'],
  ['/api/trainer/dashboard', 'GET'],
  ['/api/trainer/messages', 'GET,POST'],
  ['/api/trainer/programs', 'GET'],
  ['/api/trainer/workout', 'POST'],
  ['/api/waitlist/join', 'POST'],
  ['/api/waitlist/mine', 'GET'],
  ['/api/waitlist/withdraw', 'POST'],
  ['/api/waitlist/room', 'GET'],
  ['/api/waitlist/invite', 'POST'],
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
  if (p.startsWith('/api/waitlist')) return 'Coach waiting room';
  if (p.startsWith('/api/coach')) return 'Coach';
  if (p.startsWith('/api/push') || p === '/api/notifications' || p === '/api/notify-app') return 'Push & notifications';
  if (p.startsWith('/api/community') || p.startsWith('/api/messages') || p.startsWith('/api/conversations') ||
      p.startsWith('/api/radio') || p === '/api/league' || p === '/api/leaderboard') return 'Community & social';
  if (p.startsWith('/api/auth') || p.startsWith('/api/me') || p.startsWith('/api/account')) return 'Auth & account';
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
  const fallback = { apiRoutes: 139, migrations: 138, mobileBuild: true, mobileAssets: 0 };
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
        { label: 'Migrations applied (notifications, push_tokens, activities)', status: 'done' },
        { label: 'Auth Site URL + redirect URLs set', status: 'manual' },
        { label: 'Phone (Twilio) login configured', status: 'manual' },
        { label: 'Leaked-password protection (HaveIBeenPwned) — ENABLED 2026-06-23 (Auth → Attack Protection, on Supabase Pro). Verified: the auth_leaked_password_protection security advisor cleared', status: 'done' },
        { label: 'Supabase Auth rate limits — DONE (owner set the dashboard values 2026-06-25: otp 60 / verify 100 / email_sent 30 / anonymous_users 5; token_refresh ~1800). The app /api/* limiter (check_rate_limit + rate_limits table) covers our own routes; these Auth dashboard limits are the real brute-force gate for the native credential endpoints the SDK calls directly', status: 'done' },
        { label: 'Auth CAPTCHA (Cloudflare Turnstile) — DONE (owner enabled it in Auth → Settings with the secret, 2026-06-25). Wired on every surface: consultation + login/signup across web (login.jsx), mobile (turnstile.js + BSLogin), and Next (Turnstile.tsx + login actions). The old "login/signup wiring is a follow-up" note was stale — that client wiring shipped in #1347-#1352', status: 'done' },
        { label: 'Secret scan (gitleaks) — DONE. Now a REQUIRED check on main (classic branch protection enabled 2026-06-25, enforce_admins on), alongside Web + Mobile, so merging on red is impossible. Runs on every PR via ci.yml + .gitleaks.toml (0 leaks)', status: 'done' },
      ],
    },
    {
      section: 'Security audit & remediation (2026-07-01)',
      items: [
        { label: 'Full read-only audit (docs/SECURITY-AUDIT-2026-06-30.md): API authz (141 routes), RLS + SECURITY DEFINER RPCs (deployed-state cross-checked), secrets, payments/integrations, dead code, deps. Strong posture; 2 P1s + P2/P3. No exposed secrets, no XSS, npm audit clean', status: 'done' },
        { label: 'P1 store credit-minting (#1475): redeem_store_item/order trusted client cost/credit; new store_catalogue table makes pricing server-authoritative. Migration APPLIED + verified (19 rows)', status: 'done' },
        { label: 'P1 fulfillment-PII + 4x P2 (#1474): revoked admin_list_store_fulfillment / admin_mark_store_fulfilled / consume_store_credit from anon+authenticated; anon-reject on set_metric_source / set_program_detail. APPLIED + verified (anon=f/authd=f/svc=t)', status: 'done' },
        { label: 'P2 OAuth open-redirect + console/program write-IDOR + claim-jack (#1471/#1472/#1473/#1476): safeReturnPath guard; route gates + RLS splits (is_discipline_coach_on_client INSERT); claim_provider_row -> service-role. Merged; migrations APPLIED + verified', status: 'done' },
        { label: 'P2 email-enumeration (#1481): get_email_for_username revoked to service_role; username login -> rate-limited POST /api/auth/resolve-username (login.jsx + shapeBackend.js). Merged; migration APPLIED + verified live (anon=f/authd=f/svc=t)', status: 'done' },
        { label: 'Dependabot swept: #1477/#1478 (Actions) + #1479 (mobile deps) merged; #1480 (web deps: stripe 22.3, @supabase/ssr 0.12) tsc-compat fixed + merged', status: 'done' },
      ],
    },
    {
      section: 'Reliability — Today plate · CLS sweep · race hardening (2026-06-29)',
      items: [
        { label: 'TODAY instrument plate (#1451): the mobile home\'s two cards (BSDailyCheckinCard + BSHydrationCard) consolidated into ONE teal BSTodayCard — Energy/Hunger/Rested as tap-to-set 1–10 gauges over 44px zones, device-first sleep, hydration folds in as dot-progress + quick-add (stays live), collapses to a one-line summary when logged. Web parity: DashTodayCard (dash-plate at the top of the client home) posts to the SAME /api/client/checkin + /api/client/hydration. No schema change', status: 'done' },
        { label: 'CUMULATIVE LAYOUT SHIFT sweep (#1452/#1453, website + mobile): preconnect on 18 marketing pages + a metrics-matched fallback @font-face for all three tiers (Fraunces→Times, Space Grotesk→Arial, JetBrains Mono→Courier; size-adjust/ascent/descent from @capsizecss/metrics) wired into the shared serif/sans/mono stacks — kills the swap reflow on headers/sub-heads/body; community media → aspect-ratio 4/3; nav/splash/radio logos get aspect-ratio from real PNG dims; GridStack dashboard → min-height 60vh', status: 'done' },
        { label: 'RACE-CONDITION hardening (#1454–#1459): a multi-agent audit found 10 read-then-write / check-then-act races; fixed across 5 PRs, each with a route fallback so deploy-vs-migration order doesn\'t matter. Atomic-write RPCs add_hydration + add_meal_macros (INSERT…ON CONFLICT DO UPDATE col=col+delta, clamp INSIDE the RPC); merge_program_detail + set_program_detail (atomic || merge of only the patched keys — no whole-doc clobber between co-coaches); league_assign_cohort (per-(week,tier) advisory lock, fills cohorts under the 24 cap); device-sync upsert + coach/recipe-review + lead-boost unique indexes; client-side stale-response + cache + busy-lock guards', status: 'done' },
        { label: 'CodeRabbit caught 2 real Critical auth vulns I introduced + I fixed them: league self-promote (RPC now service-role-ONLY, route-mediated via the admin client + a currentUser gate) and program-detail subfield forge (the client_programs_discipline_guard trigger now enforces directive+goals = coach-only on EVERY write path, before the self-bypass). On re-review CodeRabbit resolved every thread', status: 'done' },
        { label: 'Apply-time fixes (#1459) + LIVE security gap closed: write-idempotency.sql is now to_regclass-guarded (it 42P01\'d on a DB lacking the coach_lead_boosts feature table); and league_assign_cohort was STILL executable by authenticated because Supabase default privileges auto-grant EXECUTE and `revoke … from public` alone leaves the authenticated/anon grants — the self-promote vuln was open in prod. Revoked live (verified service_role-only) + corrected the migration to `revoke … from public, authenticated, anon`', status: 'done' },
        { label: 'MIGRATIONS — all 4 APPLIED + verified live on Supabase (2026-06-29): atomic-daily-snapshot-accumulators, atomic-program-detail-merge, league-cohort-atomic, write-idempotency. Plus the deferred lead-boost step closed — owner ran 2026-05-08-lead-boosts.sql then re-ran write-idempotency.sql; the coach_lead_boosts_active_uniq partial unique index ((provider_id) WHERE status=\'active\') is verified live. CI green + CodeRabbit clean on every PR; branches kept', status: 'done' },
      ],
    },
    {
      section: 'Core-loop flow review (2026-06-11)',
      items: [
        { label: 'Assign to client — coach catalogue plans land on the client Train/Eat (BSProAssignPage: ASSIGN pill on every Plans-tab row + client profile Manage tab; outline→plan conversion; writes client_workouts/client_meal_plans, no migration; 1:1 note on assign; roster routes now Bearer-capable for native)', status: 'done' },
        { label: 'Coach client profile de-dup: Profile/Analysis merged into one tab on the app (summary + trendline folded in) and the fully-redundant Analysis tab removed on the website (cache tags added to TrainerClient/NutritionistClient.html, which had none)', status: 'done' },
        { label: 'One Progress home: Me→Stats no longer embeds a second Progress hub (KPI grid + link); Goal Overall slimmed to goal framing on app + website — trend chart/heatmap live only on Progress, Log weigh-in kept', status: 'done' },
        { label: 'Home tab live wiring — day log, week-strip dots, up-next workout + meal cards now build from the REAL assigned plan (bsHomeLiveWeek over /api/client/plan; habits + score chip + ticker were already live); demo week only when no plan exists. Calendar still demo (tracked)', status: 'done' },
        { label: 'Unified client-metrics data layer — the 5 client rollup endpoints (analytics/progress/train/nutrition/plan) now share ONE cached response per endpoint (60s TTL, uid-scoped, shared in-flight promise); weigh-in/check-in/workout-save/sign-out invalidate. The ticker and Progress hub literally consume the same response now', status: 'done' },
      ],
    },
    {
      section: 'App ↔ website parity — directive-led UI + shared engine (2026-06-14)',
      items: [
        { label: 'Shared signal engine in the app — main.jsx side-effect-imports public/newdesign/dashSignals.js (window.DashSignals, the SAME engine the website dashboards run); new services/signalsMap.mjs (pure ESM mappers) + services/shapeSignals.js expose window.ShapeSignals (selfRecord/coachRecords/triage(role)/goalProjection/goalSlipDays). One engine, three consumers (website script, Node tests, app Vite import); vite fs.allow:[".."] for the cross-root import. tests/mobile-signals.test.mjs (8)', status: 'done' },
        { label: 'Coach Today leads with "Who needs you" — the triage feed moved to the TOP (above the schedule), trimmed to a top-3 glance with "See all N →" / "+N more" into the Clients tab (de-dup so Today=shortlist, Clients=full list). Schedule rows + Habits card got the instrument-plate design (habits = the client-home "Daily habits." plate)', status: 'done' },
        { label: 'Coach Clients roster = triage surface — a verdict lead ("3 need you · …"), sorted at-risk→on-track with group headers, each row a severity spine + one-line directive (what to do) + pill; program/streak detail moved to the client page. bsRosterSeverity(client, role) (derives from status today; live ShapeSignals.triage match is a follow-up once rosters carry userIds)', status: 'done' },
        { label: 'Coach client detail leads with "Your move" — severity + directive + 30-day read + CTA at the top; KPI grid cut 4→2; the redundant "Analysis · last 30 days" trendline removed (duplicated the body chart)', status: 'done' },
        { label: 'Client Home/Eat lead with a "Today · your move" directive (Home: workout→meal→habits→done with per-item CTA; Eat: next meal to log above the quiet calorie strip); Home "Weekly totals" trimmed 4→2. Train already led with its session hero + Start', status: 'done' },
        { label: 'Client meal logger / "Logged." / home week strip onto instrument plates (clipped one-tap action, squared mode tabs, BSPlate summaries, ink→accent ledger)', status: 'done' },
        { label: 'Client Goals (Overall + Nutrition) carry the real engine pace-projection ETA — least-squares projectGoal over 8 weeks + week-over-week slip → an "ETA" stat (projected date / Stalled / 1y+ / Refresh) replacing the demo "On track"/"Adherence", + an ETA chip in the hero; honest "—" when history is too sparse', status: 'done' },
      ],
    },
    {
      section: 'Data privacy & global compliance — GDPR/UK · CCPA/CPRA · ~19 US state laws · WA MHMDA · age gate (2026-06-22, Waves 1–4)',
      items: [
        { label: 'PUBLIC LEGAL DOCS (web): privacy.html (15 sections incl. Your privacy choices/GPC · Categories & retention · Notice of financial incentive), terms.html, data-compliance.html, subprocessors.html (versioned table), health-data-privacy.html (WA My Health My Data Act Consumer Health Data Privacy Policy). Mirrored in-app: BSPrivacyPage + BSDataCompliancePage (iosAppBroadsheetClient). compliance-spec.md is the canonical source of truth. ALL marked counsel-review-before-launch', status: 'done' },
        { label: 'Data EXPORT — GET /api/account/export (#1380): RLS-scoped, recursive scrub() stripping *token/*secret/*key/*credential/^password at all nesting; OWNED-table list (client_workouts uses client_id) + sent_messages; profile-fetch error surfaced. Wired: client Settings (clientMeSettings exportData) + coach Danger-zone (dashProfileExtras "Export my data") + mobile (BSDataCompliancePage). Hardened over 4 CodeRabbit/Codex rounds → APPROVED', status: 'done' },
        { label: 'Data DELETION — POST /api/account/delete: currentUser + createAdminClient. Purges owned rows (user_goals/weigh_ins/measurements/checkins/progress_photos/daily_health_snapshot/score_ledger/playlists/reminders/client_workouts[client_id]/meal_plans/programs/integrations/push_tokens/consent_log/account_action_requests/community_posts+likes+comments/messages[sender_id]/user_activity) + storage buckets (progress-photos/community-photos/meal-notes/coach-media), writes account_deletions audit, calls auth.admin.deleteUser. Preserves Stripe/tax (authoritative in Stripe). Type-DELETE confirm on web (client + coach) + mobile', status: 'done' },
        { label: 'Privacy RIGHTS intake — public webform public/privacy-request.html (access/delete/correct/portability/opt-out/limit-sensitive/withdraw-consent/appeal) → POST /api/privacy-request → emails PRIVACY_EMAIL (default privacy@theshapecommunity.com) via sendEmail; validates email/type; authorized-agent path. Linked from privacy.html', status: 'done' },
        { label: 'GPC (Global Privacy Control): src/lib/gpc.ts gpcOptOut(request) reads sec-gpc==1; middleware forwards x-gpc-optout; client-side pageShell consent IIFE honors navigator.globalPrivacyControl. Shape does not sell/share so functionally a no-op, but detected server + client + recorded', status: 'done' },
        { label: 'Region-aware consent banner — pageShell.jsx shapeConsent() IIFE: region via Europe/* timezone, GPC honor, consent_log insert, safe DOM (no innerHTML). ?v=20260622b across 69 loaders', status: 'done' },
        { label: '18+ AGE GATE at signup: mobile BSLogin DOB field ("Shape is 18+") + 18+ validation (throws under_18); shapeBackend signUp validates + writes date_of_birth metadata; 2026-06-22-age-verification.sql adds date_of_birth/over_18 cols + set_over_18() trigger before insert/update', status: 'done' },
        { label: 'MIGRATIONS APPLIED + verified on Supabase (idempotent + RLS): 2026-06-22-consent-log.sql (append-only owner-RLS, 2 policies), 2026-06-22-age-verification.sql (date_of_birth/over_18 cols + set_over_18 trigger), 2026-06-22-account-deletions.sql (service-role only, no RLS policy = deny-all). Security advisors after: 0 ERROR (account_deletions no-policy + set_over_18 search-path WARN both by-design). PR #1381 squash-merged to main', status: 'done' },
        { label: 'COUNSEL-REVIEW DOCS (docs/legal/, all DRAFT): ropa.md (Art.30 ROPA), dpia.md (Art.35), transfer-impact-assessment.md (SCCs/DPF), dpa-subprocessor-checklist.md, incident-response-plan.md, data-retention-schedule.md, legitimate-interests-assessment.md, accessibility-and-pci-notes.md (WCAG/SAQ A)', status: 'manual' },
        { label: 'Contact email standardized to info@theshapecommunity.com on contact + all public pages; privacy/rights routed to privacy@theshapecommunity.com', status: 'done' },
        { label: 'OWNER / COUNSEL before launch: attorney review of all public + counsel docs; appoint EU/UK Art.27 representative; sign DPAs/SCCs with sub-processors; confirm breach-notification contacts; decide MD MODPA (strictest) data-minimization posture', status: 'manual' },
        { label: 'DONE — ToS strict BAN rules + Code of Conduct: new standalone public/code-of-conduct.html (everyone + coach + client conduct, safety, reporting/moderation, ban tiers, no ban-evasion, appeals); terms.html Sec 12 strengthened with enforcement tiers (warning → temp suspension → permanent), a zero-tolerance immediate-removal list, a coach higher-bar clause, a re-registration/ban-evasion ban, and a CoC link; Sec 5 incorporates the CoC; CoC linked in all legal-page footers; app BSTermsPage parity (Termination summary + Code of Conduct entry). Drafted via workflow + adversarial legal-consistency review. Merged as PR #1385 (CodeRabbit review fix: legal-page nav dropdowns now keyboard-accessible via :focus-within). Still DRAFT pending counsel review before launch', status: 'done' },
        { label: 'DONE — grocery-list WEB port of the 2026-06-22 mobile redesign (ClientGrocery.html): list is the hero (dropped the TO BUY/HAVE/ALL view filter — all aisles inline, checked items dim), added the slim one-line progress strip (got/total · ~$ to go · % + fill), and a unified Instacart/Save-a-copy/Share action bar', status: 'done' },
      ],
    },
    {
      section: 'AI features — Nora actions · proactive notifications · source reconciliation · dietitian + NC1 compliance (2026-06-17, #1326)',
      items: [
        { label: 'Nora takes actions (AI1–AI6): preview→confirm→ai_audit_log→undo. 7 tools (Tier 1 log_meal; Tier 2 set_client_goal / assign_workout / assign_meal_plan / set_program_detail / add_review_note / reschedule_session). Coach writes gated by is_coach_on_client / is_discipline_coach_on_client at the ENDPOINT + RLS. Single-use signed tokens (nonce reserved before execute, released on failure) — no double-apply. Confirm card wired in both chat UIs (web CwProposalCard + mobile BSNoraProposal)', status: 'done' },
        { label: 'Proactive notifications (AI8/AI9): fire only on real engine events; per-type×per-channel preference center, quiet hours, daily cap, dedupe, never-shaming copy + sanitize guard; per-habit reminders. /api/ai/notify (app-driven) + /api/ai/notify/cron (time-based re-eval over the persisted snapshot)', status: 'done' },
        { label: 'AI directive engine + coach triage routing (one lead per page, discipline-routed); coach can override a client directive (/api/ai/directive/override, audited + reversible; the audited engine baseline is NOT taken from client input)', status: 'done' },
        { label: 'Nora voice: server STT (/api/ai/transcribe, falls back to text) + server TTS (/api/ai/speak, verbatim + X-Spoken-Text parity); tone/voice synced to account; voice opt-out honored inside speakVoice (explicit "Listen" forces)', status: 'done' },
        { label: 'Source reconciliation (INT2): per-source observations, authoritative source per metric (manual override else device rank — never a blended average); /api/integrations/reconcile. Apple Health stays a mobile→server ingest', status: 'done' },
        { label: 'Dietitian (RD/RDN) — first-class nutrition-discipline provider riding the nutritionist rails (providerDiscipline maps it across roster/booking/availability/console + membership) + self-serve signup; NOT self-assertable client-side (addRole excludes it — reviewer-assigned after credential review)', status: 'done' },
        { label: 'NC1 nutrition compliance: credential capture, licensure-to-client-state matching, scope gating (general vs individualized/MNT), consent + audit, attestations enforced SERVER-SIDE in /api/apply. Engineering controls only — HARD enforcement (NUTRITION_COMPLIANCE_ENFORCE) needs healthcare-regulatory counsel sign-off (see shape-ai-nutrition-compliance-brief.md)', status: 'manual' },
        { label: 'CodeRabbit review pass (commit 54ff99b): server-authoritative AI grounding (draft-message builds from get_client_stats, not caller input); audit-write failure after execute no longer throws (returns audited:false + logs); notify parallelized + dedup state persisted BEFORE delivery; UPDATE-policy cross-client reassignment locked via the coach-write-scope-update-guard freeze_*_keys triggers (the PR already shipped this; the duplicate triggers briefly added to coach-write-scope.sql were removed); self-written detail.directive stripped; mic-stream cleanup; no raw DB-error leaks. 225/225 tests · tsc · next build · public/m in sync', status: 'done' },
        { label: 'Migrations — ALL applied to Supabase (idempotent, via MCP): ai-audit-log, ai-proposal-nonces, notification-center, nutrition-compliance, program-detail-discipline, source-reconcile, dietitian-role, coach-write-scope (+ -update-guard freeze_*_keys assignment-key-immutability triggers), replace-provider-licenses, review-note-delete (author DELETE policy). Security advisors after: 0 ERROR (WARNs pre-existing / by-design)', status: 'done' },
      ],
    },
    {
      section: 'Security & hardening (2026-06-09 review)',
      items: [
        { label: 'RLS ON for every public table — verified 66/66 enabled AND each has ≥1 policy (0 RLS-off, 0 deny-all)', status: 'done' },
        { label: 'Fixed deny-all tables: messages / conversation_participants / community_likes / community_comments had RLS on but 0 policies (broke DMs + like/comment writes); conversations was missing insert+update. Restored via 2026-06-09-restore-missing-rls-policies.sql (applied live + in repo)', status: 'done' },
        { label: 'Next.js 16.2.3 → 16.2.9 — clears the high-severity advisories (middleware/proxy bypass, cache poisoning, SSRF, image DoS, RSC XSS). Smoke-tested: tsc + next build clean both versions', status: 'done' },
        { label: 'Transitive dep advisories cleared via npm overrides (postcss 8.5.15, ws 8.21.0, qs 6.15.2) — `npm audit --omit=dev` = 0 vulns on both root + mobile-app', status: 'done' },
        { label: 'Rate limiting on ALL /api routes (web cookie + app Bearer, single proxy chokepoint): auth writes 5/15min by IP; general 100/min keyed per-user (cookie user.id or Bearer sub) → IP fallback. Postgres-backed (check_rate_limit RPC; 2026-06-15-rate-limits.sql run on Supabase), fails open, 429 + Retry-After, skips webhooks/health/OPTIONS; bucket keys are hashed (HMAC) with a server secret so the public RPC cannot be called directly with a guessed key', status: 'done' },
        { label: 'Supabase Auth → Rate Limits: cap sign-in / sign-up / OTP / token at the Auth layer — the real login brute-force surface (client → Supabase directly, bypasses the Next app + its /api limiter)', status: 'manual' },
        { label: 'Input hardening: proxy rejects oversized bodies on ALL /api routes (413 by Content-Length; 1MB JSON / 30MB upload); shared readJson() (413 oversized + 400 malformed) now on EVERY JSON-body /api route — public + all authenticated (allowEmpty preserves empty-body routes; garmin/push webhooks excluded); fields already clamped (cleanText/isEmail/isISODate); no dangerouslySetInnerHTML so all output is escaped', status: 'done' },
        { label: 'Leaked-password protection (HaveIBeenPwned) — ENABLED 2026-06-23 (Auth → Attack Protection; Pro-gated). Security advisor warning cleared', status: 'done' },
        { label: 'Advisor warnings noted, low-priority/by-design: SECURITY DEFINER RPCs callable by anon/authenticated (intentional gated-RPC pattern), function_search_path_mutable on ~18 older functions (new ones set search_path=public), 4 anon-insert "always true" policies on public intake tables (contact/applications — write-only by design), 2 public buckets allow listing (coach-media/community-photos); rate_limits has RLS on + no policies and check_rate_limit is anon/authenticated SECURITY DEFINER — both by design (lockbox limiter table only the fn touches; the proxy anon client must call the RPC; search_path pinned). the direct-RPC griefing vector (guessable api:u:<uuid> bucket) is CLOSED — bucket keys are hashed (HMAC) with RATE_LIMIT_SECRET (falls back to SUPABASE_SERVICE_ROLE_KEY, hardened in prod by default)', status: 'pending' },
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
        { label: 'Migration 2026-06-08-store-redemptions.sql + 2026-06-08-store-fulfillment.sql applied on Supabase (store_redemptions, store_credits, RPCs)', status: 'done' },
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
        { label: 'In-app notifications (needs migrations)', status: 'done' },
        { label: 'System push (FCM keys + webhook secret)', status: auto(pushReady) },
        { label: 'APNs key uploaded to Firebase (iOS)', status: 'manual' },
        { label: 'Device registers its push token at sign-in (registerPush wired into getCurrentSession)', status: 'done' },
        { label: 'Supabase Database Webhook: notifications INSERT → POST /api/push/dispatch (header x-push-secret)', status: 'done' },
        { label: 'Native build: npm i @capacitor/push-notifications + cap sync + Firebase config (google-services.json / GoogleService-Info.plist) + Push capability', status: 'manual' },
        { label: 'User-set reminder notifications — members add weigh-in/check-in/water/photo/custom reminders (time + days) in mobile Settings → Notifications; hourly tz-aware cron fires them via the notifications→push spine. Migration APPLIED (2026-06-19-user-reminders.sql). Desktop-website Settings parity SHIPPED (#1483 — ReminderCard on the client Settings page)', status: 'done' },
        { label: 'Web notification dashboard (#1483) — NotificationDashboard on the client Settings page ports the mobile BSNotifyPrefs: master mute + quiet hours + daily cap + the per-type × per-channel matrix (8 types × App/Push/Email) + habit reminders (enable toggles), wired to the live notification-center tables (notification_settings / notification_preferences / habit_reminders) via the get_notification_center() RPC + RLS-scoped upserts through window.shapeDb.client — the same tables notify-core.ts reads. No new route/migration (tables already live from the 2026-06-17 batch). "Privacy & notifications" card trimmed to "Privacy"', status: 'done' },
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
        { label: 'Shape Radio Phase 1 — live licensed-stream player + Nora avatar-DJ SHIPPED (#1467, 2026-06-30): window.ShapeRadioLive (station + now-playing fetch + self-scheduling cancellable poll + crossOrigin audio analyser) over /api/radio/{station,now-playing}; BSNowPlaying / BSNowPlayingMuted / BSRadioScreen render live now-playing with honest "—" empty states (no synthetic track) + Station BPM labeling; a three + @pixiv/three-vrm Nora VRM avatar (noraStage.mjs) reacts to the audio analyser, assets resolved via import.meta.env.BASE_URL. STILL PENDING: a real provider stream + real per-track BPM (compute at ingest once Shape streams audio it controls)', status: 'done' },
        { label: 'Website chat bubble role-aware (only filters once logged in) + single close', status: 'done' },
        { label: 'Feed activity cards open the redesigned full-screen Session-details page (stats only) + a separate Comments page', status: 'done' },
      ],
    },
    {
      section: 'Activity session-details graphs (2026-06-15)',
      items: [
        { label: 'GRAPH-TYPE RULE (per activity, documented in WORKLOG): primary velocity = Pace (run/walk/hike) · Pace/100m (swim) · Speed mph (ride); Power (W) is its own chart when a power meter is present', status: 'done' },
        { label: 'Strava-style axis-labeled AREA charts (y-axis ticks + mile markers + gridlines) for Pace/Speed · Heart rate · Cadence · Elevation · Power — each renders ONLY when its real series exists (honest-absent)', status: 'done' },
        { label: 'Heart rate = bpm area chart + time-in-zone labeled bars (Z1–Z5); applies to ANY activity incl. strength/lifting', status: 'done' },
        { label: 'Splits = column chart (mile splits / ride intervals / working sets); Summary = mains (hero Distance · Time · Avg pace/speed · Avg HR · Calories); leftover scalars → Output grid', status: 'done' },
        { label: 'LIVE DATA: Strava sync pulls heartrate+cadence+altitude+velocity_smooth+watts+distance in ONE streams call/new activity → metrics.{hrTrace,cadenceTrace,elevTrace,paceTrace,powerTrace}; velocity converted per sport (mph / sec-per-100m / sec-per-mile)', status: 'done' },
        { label: 'Charts resampled EVENLY BY DISTANCE (cumulative distance stream) → x-axis mile markers are exact; time-uniform fallback for indoor/no-distance activities', status: 'done' },
        { label: 'Stream fetch capped per sync (STREAM_CAP=24) + NEW posts only — stays under Strava rate limit', status: 'done' },
        { label: 'WHOOP activities show zones + stats only (no per-second streams — honestly trace-less); demo cards are the signed-out fallback only', status: 'done' },
        { label: 'Website parity: dashboard Community feed activity posts open a Session-details modal (dashboardCommunity.jsx — same axis-labeled charts + GRAPH-TYPE RULE, driven by community_posts.metrics; demo run card included)', status: 'done' },
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
        { label: 'Daily steps / NEAT (#1415): device-synced (Apple Health ALLOWED_FIELDS + Garmin dailies → daily_health_snapshot.steps, non-negative-int validated) + progress stepsLatest/stepsAvg KPIs + steps in reconcile METRICS. Mobile: BSStepsCard + ring-instrument history (hero gauge + Week bars / Month / 3-Month) with a typeable editable goal (user_goals client_step_goal). Migration 2026-06-25-daily-steps.sql APPLIED', status: 'done' },
        { label: 'DONE (#1439, 2026-06-27) — Shape Steps → Shape Score points: every 5,000 steps = 1 Shape Step = +1 pt; hitting the daily goal = +3 bonus (20k/day ANTI-FARM cap → max +7/day). Pure tested shapeSteps.mjs + MIGRATION 2026-06-26-step-points.sql award_step_points() (SECURITY DEFINER, auth.uid()-scoped, hardcoded rates, credits COMPLETED days idempotently) APPLIED; fired on session resolve via window.ShapeStepPoints.check; live "N Shape Steps · +N pts" on the card + a real legend row. Also shipped the CRITICAL 2026-06-26-score-ledger-dedupe-fix.sql (the partial dedupe index rejected every award RPC\'s bare ON CONFLICT with 42P10 → no points ever credited)', status: 'done' },
        { label: 'DONE (#1438, 2026-06-27) — Shape Score legend is now ACCURATE + COMPLETE: replaced the hardcoded/partly-fictional "how you earn" list (mobile BSShapeScorePage Points tab + public/newdesign/score.jsx + clientScore.jsx) with the REAL score_ledger catalog — every EARN (PR Wall +12, weekly check-in +15, workout +10, community post +5, session kept +12, goal milestone +50/75/100/200, tier bonus, momentum bonus +25→+100, commitment +stake, Shape Steps), a never-shaming "Protect your points" LOSSES section (missed check-in −7 / workout −5 / habit streak −2 / commitment −stake, "a coach can waive"), the spend link, and the RULES (0-pt floor · −30/wk cap · tier never demotes · spending never lowers rank). Fixed a dark-on-dark contrast bug on score.jsx; Score.html ?v=15', status: 'done' },
        { label: 'DONE (#1440, 2026-06-27) — Onboarding Shape Score explainer: new accounts get a one-time BSScoreIntro full-screen panel on first open (before the app tour) — the one-number idea, the tier ladder (never demotes), the main ways to earn, that consistency/momentum compounds, spendable points, and a gentle "protect your points." Gated on a new-account window + a client_score_intro seen-flag; the app tour waits until the intro is seen so the two never stack', status: 'done' },
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
        { label: 'Apple Music: coach imports a soundtrack by picking from their library (mobile BSProSoundtracks + website "Pick from your Apple Music") + paste-a-link', status: 'done' },
        { label: 'Apple Music: client opens/saves a coach playlist — provider-aware cards (mobile BSPlaylistCard + web), save gated to catalog (pl.) URLs via MusicKit', status: 'done' },
        { label: 'Apple Music developer-token route tolerant of any .p8 paste format (multi-line / \\n-escaped / flattened / bare base64) — immune to Vercel env line-stripping', status: 'done' },
        { label: 'Apple Music LIVE end-to-end (token mints ES256, kid 252AT36GZM; full Spotify parity, web + mobile)', status: 'done' },
        { label: 'Apple Music limit: library playlists with no catalog equivalent are not member-shareable (Apple constraint) — coaches paste a shared/catalog link for those', status: 'done' },
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
        { label: 'Migration 2026-06-05-client-program-detail.sql applied on Supabase (client_programs.detail jsonb)', status: 'done' },
      ],
    },
    {
      section: 'Mobile ↔ website sync',
      items: [
        { label: 'window.shapeDb wired on mobile to the shared user_goals table', status: 'done' },
        { label: 'Swaps/prefs keyed consistently (meal/exercise name) across surfaces', status: 'done' },
        { label: '/m/ preview falls back to the shared Supabase project URL + publishable key', status: 'done' },
        { label: 'user_goals migration applied to the live project (PK user_id,kind + RLS)', status: 'done' },
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
        { label: 'Goals Training/Nutrition tabs wired to live account data (demo fallback): Training lifts/stats/milestones from ShapeProgress.train PRs; Nutrition milestones from the real weigh-in trajectory', status: 'done' },
        { label: 'Shape points for completed goal milestones: award_my_goal_milestones() RPC credits +50/75/100/200 into score_ledger (idempotent, md5-uuid dedupe) on weigh-in log + Goals-page open — MIGRATION 2026-06-12-goal-milestone-points.sql (run on Supabase)', status: 'done' },
        { label: 'Stats accuracy pass: Progress weight + body-fat series now read client_weigh_ins (the snapshot columns had no writer); weigh-in sheet gained an optional Body fat % field — MIGRATION 2026-06-12-weigh-in-body-fat.sql (run on Supabase)', status: 'done' },
        { label: 'Meal logs write real macros: POST /api/nutrition/meal-log accumulates kcal/protein/carbs/fat onto today\'s daily_health_snapshot (one-tap "ate as planned" + the full logger call it) — Nutrition tab / macro adherence now track actual logging', status: 'done' },
        { label: 'In-app live sessions roll duration into daily_health_snapshot.workout_minutes (accumulating) — the Progress volume series counts app workouts, not just device-synced ones', status: 'done' },
        { label: 'Migrations applied on Supabase: 2026-06-13-client-goals-coach-read.sql + 2026-06-13-client-weigh-ins.sql', status: 'done' },
      ],
    },
    {
      section: 'Check-in kit & coach-metrics gaps (research 2026-06-12)',
      items: [
        { label: 'Weekly check-in (coaching-standard ritual): BSWeeklyCheckin — 6 ratings (training/nutrition adherence · sleep · energy · stress · hunger 1–10) + wins/struggles/question + optional weight/measurements/photos; one per week (upsert on Monday); home due-plate + Settings row; coach sees the latest on the client profile', status: 'done' },
        { label: 'Girth measurements (ACE core sites: waist·hips·chest·arm·thigh·calf) logged from the check-in; latest+Δ on the client Progress page; latest-per-site on the coach client profile (client_measurements, coach read via RPC)', status: 'done' },
        { label: 'Structured progress photos (front/side/back, date-stamped): PRIVATE progress-photos bucket via POST /api/client/progress-photos (service-role upload, 1-yr signed URL); timeline on client Progress; coach read via get_client_progress_photos', status: 'done' },
        { label: 'Health profile / intake (PAR-Q+ 7-question screening + injuries + medications + emergency contact + consent): REQUIRED one-time gate for signed-in clients entering the app; editable in Settings; ALWAYS visible to linked coaches via get_client_health_profile (not share-gated — liability)', status: 'done' },
        { label: 'MIGRATION 2026-06-12-checkin-kit.sql (client_measurements + client_progress_photos + progress-photos bucket + client_checkins + 4 coach RPCs) — run on Supabase', status: 'done' },
        { label: 'Website parity for the check-in kit: ClientProgress gains the weekly check-in form + measurements + photo timeline (via /api/client/checkin-kit + progress-photos); ClientMe gains the Health-profile (PAR-Q) editor; coachClientDetail renders latest check-in + health screening + measurements/photos (shared-overview extended)', status: 'done' },
        { label: 'Daily steps / NEAT — BUILT (#1415): daily_health_snapshot.steps column (migration 2026-06-25-daily-steps.sql, applied) + Apple Health/Garmin sync allowlist (non-negative int) + BSStepsCard/BSStepsHistory ring instrument with an editable 6k–15k goal + progress series/KPIs; Shape Steps → Shape Score points (#1439)', status: 'done' },
        { label: 'e1RM (Epley) + tonnage from logged sets — BUILT (#1420/#1421): pure tested e1rm.mjs (+ e1rm.ts twin) folds Epley over workout_set_logs (payload-first), drives a Progressing/Holding/Stalled verdict + suggestNextLoad autoregulation; surfaced via /api/client/strength + the mobile Strength page (see the two Strength items below)', status: 'done' },
        { label: 'Strength / e1RM progression (#2) — client side: estimated 1RM + Progressing/Holding/Stalled engine, dedicated Strength page, PR-row e1RM, /api/client/strength endpoint (CI-green)', status: 'done' },
        { label: 'Strength / e1RM progression (#2) — coach lift e1RM: get_client_lifts widened with e1rm (mobile + web), APPLIED + verified live (#1420)', status: 'done' },
        { label: 'Migration: 2026-06-25-client-lifts-e1rm.sql (widens get_client_lifts with e1rm) — APPLIED + verified live (advisors 0 ERROR)', status: 'done' },
        { label: 'Daily energy/hunger check-in card (BSDailyCheckinCard, 1–10) + dedicated hydration logger (BSHydrationCard, +250/500 ml quick-add + undo) — GET/POST /api/client/hydration + migration 2026-06-25-daily-energy-hunger.sql (APPLIED + verified live); shipped #1422', status: 'done' },
        { label: 'Weekend-vs-weekday adherence split (differentiator A) — BUILT (#1449, v1 nutrition + habits): pure tz-free weekendSplit.mjs (+ src/lib/weekendSplit.ts twin, 16 tests) computes a per-dimension weekday-vs-weekend gap with a STATISTICAL flag gate (gap ≥15pp AND ≥1.65·SE AND positive in ≥60% of weeks — kills small-sample false alarms), display-only composite, lower-CI worstDimension. MEMBER: a Weekends card in the Progress Overall tab, computed client-side over cached endpoints (no new self endpoint). COACH: SECURITY DEFINER get_roster_weekend_split RPC (owner-gated; bucketed per member tz; excludes archived habits) + POST /api/coach/roster-weekend → a roster WKND −N chip + a client-detail "Weekend pattern" plate with a directive. MIGRATIONS 2026-06-27-client-timezone.sql + 2026-06-27-roster-weekend-split.sql — APPLIED + verified live (tz col, RPC SECURITY DEFINER, smoke-tested). Folded in: Progress-hub simplification (deleted dead BSMeKpis; removed the bare-adherence Insights grid → matches the web "no bare adherence %" rule; weekly points kept). TRAINING DIMENSION SHIPPED (#1462, 2026-06-30): the weekendSplit .mjs/.ts twin + get_roster_weekend_split gained a third "training" dimension over published client_workouts.scheduled_date (MIN_DIM_DAYS.training=6); migration 2026-06-30-roster-weekend-split-training.sql APPLIED + on main. Remaining fast-follows: per-member change-from-baseline guard (v2) · threshold calibration on the live gap distribution', status: 'done' },
        { label: 'RESEARCH GAP (remaining differentiators) — menstrual-cycle awareness (wearables have it; NO coaching platform surfaces it; privacy-first, sensitive reproductive-health data) · coach-set compliance variance band (Trainerize-style)', status: 'manual' },
        { label: 'Sleep-logging redesign (Tier 1, #1430): daily sleep folded into the check-in card — device-first (read-only hours + efficiency/RHR/HRV when a wearable synced today, else editable manual-hour chips) + an always-on 1–10 Rested rating → daily_health_snapshot.sleep_quality; persists via /api/client/checkin (await+rollback); BSSleepSheet retired. MIGRATION 2026-06-26-sleep-quality.sql — APPLIED + verified live', status: 'done' },
        { label: 'Sleep → engine: pure tested sleepRecoveryFromProgress wired into selfRecord so the (previously dead) recovery directive fires for real signed-in members', status: 'done' },
        { label: 'Coach objective sleep: /api/clients/[id]/shared-overview returns sleep (latest hours + 7d trend + efficiency/RHR/HRV, RLS-scoped via providers_read_subscriber_snapshots) → web coachClientDetail + mobile coach profile (#1430)', status: 'done' },
        { label: 'Sleep fast-follow (#1433, deferred from #1430) — BUILT + LIVE: sleep STAGES (deep/REM/light/awake) · bed/wake + LATENCY · RESPIRATORY rate captured from Oura v2 sync into daily_health_snapshot (MIGRATION 2026-06-26-sleep-detail.sql — APPLIED + verified live; other providers leave them null → honest "—"). Canonical recovery-READINESS score (pure recoveryReadiness.mjs + recovery-readiness.ts twin, tested) on the check-in card + the mobile BSSleepHistory detail page (stages bar, bed/wake, latency, respiratory, readiness ring, sparklines) + the coach view (shared-overview + web/mobile). Coach SLEEP-TRIAGE rule: dashSignals ruleSleepRecovery flags sleep_low (7d avg >1.5h under target) → directive + the coach "who needs you" feed (roster sleep batched via /api/coach/roster-sleep). Inherent provider limits (not Shape work): Apple HealthKit stages need a native iOS build; Garmin respiratory is not in its webhook schema', status: 'done' },
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
        { label: 'Migration applied on Supabase: 2026-06-09-universal-search.sql (search_shape_people v2 — names + @handles + bio/goal keywords)', status: 'done' },
        { label: 'Website-nav search parity: ⌕ in the pageShell header on every page (+ a mounted copy on the static index nav) — same RPC, role tags, tier-ringed avatars, rows → public profiles, Nora row → chat Help tab', status: 'done' },
      ],
    },
    {
      section: 'Member playlists (profile Music tab)',
      items: [
        { label: 'Music tab on both profiles: own library (add / public-private toggle / ✉ send / ↗ share / remove) + others\' public playlists (▶ open / ＋ save-to-library)', status: 'done' },
        { label: 'Add flow imports straight from the connected Spotify library (reuses /api/integrations/spotify/playlists); paste-a-link fallback covers Apple Music + unconnected', status: 'done' },
        { label: 'Migration applied on Supabase: 2026-06-09-member-playlists.sql (member_playlists + get_member_playlists)', status: 'done' },
        { label: 'Website profile Music tab — the desktop living profile (member + coach) renders the owner\'s playlist library via get_member_playlists (own → all, others → public). Display on web; owner adds/manages from the app (web add is a follow-up)', status: 'done' },
      ],
    },
    {
      section: 'Usernames (Shape handles)',
      items: [
        { label: 'profiles.username (unique, case-insensitive) + is_username_available / set_my_username / get_email_for_username RPCs; search_shape_people matches usernames; get_public_profile returns username', status: 'done' },
        { label: 'Login accepts email OR username (mobile BSLogin + website login.jsx) — username resolves to the login email via RPC, friendly miss message', status: 'done' },
        { label: 'Signup username step with debounced live availability (mobile create-account covers client + coach roles; website signup forms client/trainer/nutritionist); choice rides user_metadata and is claimed at signup or first confirmed login', status: 'done' },
        { label: 'Profile @handles prefer the real username (Settings identity seed + Terrain/Signal heroes)', status: 'done' },
        { label: 'Migration applied on Supabase: 2026-06-09-usernames.sql', status: 'done' },
        { label: 'Website client signup creates a REAL Supabase auth account (signup.jsx submitApplication client path: validates name/email/password + 18+ DOB gate + Terms + Turnstile, calls auth.signUp with username/dob/role metadata, then check-inbox or provisions profile + set_my_username → dashboard) — username goes live there; coach roles stay applications', status: 'done' },
      ],
    },
    {
      section: 'Client surfaces & library',
      items: [
        { label: 'First-run app tour (skippable, replayable from Me → App tour): 7-step guided walkthrough that switches the underlying tab; persists to localStorage + user_goals(client_onboarding)', status: 'done' },
        { label: 'App tour coach variant (trainer + nutritionist) + new-accounts-only trigger (auto-shows only for accounts <24h old; existing users replay from Me → App tour)', status: 'done' },
        { label: 'Interactive spotlight tour (mobile, Phase A): client + coach guided spotlight walkthroughs (engine + data-tour hooks), Radio finale on the client tour — spotlightGeom.mjs (TDD) + spotlightTour.js engine, BSOnboardingTour + BSProOnboardingTour replaced to call engine; reuses existing trigger/persistence', status: 'done' },
        { label: 'Spotlight tour — website dashboard tours (Phase B): shared engine loaded on the 3 dashboard SPAs (Client/Trainer/Nutritionist) + dashTour.js adapter (hash-route navigation, shapeDb persistence, new-account auto-show + "Take a tour" replay); data-tour hooks on the web nav + per-route mastheads; client tour ends on the Shape Radio finale, coach tours end on Profile', status: 'done' },
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
        { label: 'Web dashboard widgets are draggable + resizable (GridStack 11.x, vendored): every card-style tab renders cards as grid widgets — drag to reorder (⠿ handle), resize (flush corner triangle), layout persisted per role+tab to user_goals(dashboard_layout). Engine = public/newdesign/dashGrid.jsx (React createPortal into grid items; direct height-fit + ResizeObserver for async cards; atomic grid.load order; 1-col mobile breakpoint). Live across all 3 profiles: client Today/Score/Habits/Progress/Workouts/Nutrition/Goal + trainer & nutritionist Today/Score/Goal. Single-purpose pages (builders, calendars, feeds, rosters, profiles) deliberately excluded. No new API route (front-end + user_goals key). Verified on preview at desktop + 430px mobile', status: 'done' },
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
        { label: 'Channel migrations applied in Supabase (channels, visibility, realtime publication, unread RPCs)', status: 'done' },
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
        { label: "Grocery list redesigned (mobile): slim 'List name ▾' selector + one-line progress strip + every aisle inline (checklist is the hero) + one bottom action bar (Instacart/Save/Share); a Home 'Shop list' card deep-links straight to it. Website port pending", status: 'done' },
        { label: 'Swap meal: pick which meal first, then the coach-approved alternate', status: 'done' },
        { label: 'Meal-search recents add to the meal + filter as you type', status: 'done' },
        { label: 'meal-notes storage bucket migration applied (audio + image mime types, 15 MB)', status: 'done' },
        { label: 'community-photos storage bucket + community_posts.photo_url migration applied (public read, owner-folder write) — photo posts on feed + profiles, mobile + website', status: 'done' },
        { label: 'user_follows table + get_follow_stats/toggle_follow/get_follow_list RPCs migration applied — follower/following on public profiles, mobile + website', status: 'done' },
        { label: 'follow requests migration applied (user_follows.status + shape_profile_visibility + list/respond_follow_request RPCs) — private profiles require approval, public follow instantly; toggle_follow + respond_follow_request emit notifications (follow / follow_request / follow_accept)', status: 'done' },
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
        { label: 'Dead-code sweep re-audited (2026-06-19): nothing safe to remove — BSCoachDetailPublic is still the mobile marketplace coach-detail page, the BSM_MARKETPLACE_* constants are each referenced, ListingRow was already removed, and publicProfile.jsx is actively loaded by TrainerPublic/NutritionistPublic.html + coachDirectory.js. No action.', status: 'done' },
        { label: 'Stored-XSS fix (2026-06-19): the profile Music tab rendered the user-supplied member_playlists.url into an anchor href — a javascript:/data: URL would execute on click. Fixed in livingDesktop.jsx (safeMusicUrl: http(s) + Spotify/Apple hosts only) + a NOT VALID CHECK on member_playlists.url (2026-06-19-member-playlists-url-guard.sql APPLIED) as DB-level defense-in-depth covering the mobile open path', status: 'done' },
        { label: 'Coach credential verification (web) — coach uploads COI + certs + submits (coach dashboard profile card); admin verifies at /dashboard/credentials; ✓ Verified badge on marketplace + living profile; weekly expiry-reminder cron. Migration APPLIED (2026-06-19-coach-credential-verification.sql: private coach-credentials bucket + review columns + public verified flag). Mobile badge is a follow-up', status: 'done' },
      ],
    },
    {
      section: 'Coach waiting room',
      items: [
        { label: 'Per-coach waiting list (#1495): when a coach is at capacity, signed-in members join to be first in line; the coach invites with a 7-day first-dibs window; a paid checkout/subscription flips the spot to booked (Stripe webhook); clients can withdraw (waiting→left / invited→declined). Coach discretion on who to invite (positions shown, not a locked FIFO). Surfaced in the mobile client CTA + coach room panel (ShapeWaitlist bridge) + both website profiles. Squash-merged 4f1805fa', status: 'done' },
        { label: 'First-dibs enforcement: an at-capacity coach is only purchasable/subscribable with a LIVE invite (hasActiveWaitlistInvite, 7-day expiry) — checked in checkout-session + purchase + subscribe; a lookup failure surfaces as a retryable state, never a silent "at capacity"', status: 'done' },
        { label: 'RLS-authoritative backend: client join/withdraw run on the caller-scoped client under own-row RLS policies + a guard_cols trigger (freezes created_at / provider ids / client_id + invite timestamps); INSERT gated on room-EXISTS AND at-capacity; UPDATE can\'t revert a live invite. FIFO position, coach room roster (+ names), and invites go through SECURITY DEFINER RPCs (get_my_waitlists / get_coach_waitroom / invite_from_waitlist, auth.uid()-ownership-checked). Admin only for notifications + the webhook booked-flip. Migration 2026-07-01-coach-waitlist.sql APPLIED', status: 'done' },
        { label: 'Register waitlist_join / waitlist_invite in the notification-center matrix — types listed in the web + mobile settings matrices and enforced at send time (createPreferredNotification resolves the recipient\'s prefs, stamps data.channels; mute / all-channels-off skip the write; the bell filters inapp-off rows)', status: 'done' },
        { label: 'Website invited "Book now" routes to the per-role one-time purchase (trainer → /purchase kind=booking, nutritionist → /purchase kind=meal_plan) instead of the subscribe link, with Subscribe monthly kept alongside; the webhook booked-flip covers both payment and subscription modes', status: 'done' },
        { label: 'Mobile parity: the app\'s invited waitlist "Book now" (iosAppBroadsheetClient) still starts the monthly subscription via doSubscribe — route it to the per-role one-time purchase (or offer both) to match the website first-dibs path', status: 'pending' },
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
        { label: 'LIVE BOOST: tap a mid-workout/mid-cook person on the presence rail → BSLiveBoostSheet — one-tap motivational phrases (or free text) sent as a real 1:1 DM stamped metadata {kind:live_boost, activity} while they train (thread renders a "Live boost" eyebrow); shows "N min in" from user_activity.started_at (ShapePresence.activityDetail)', status: 'done' },
        { label: 'Live workout-progress view: let a boost sender SEE the workout in progress (current exercise / set count live, not just the activity kind + elapsed) — needs the live session player to broadcast set-level state (realtime channel or a user_activity detail column) + a privacy toggle', status: 'pending' },
        { label: "'Show when I'm online' opt-out toggle on mobile Settings + website Me — shared client_settings.onlineVisible", status: 'done' },
        { label: 'Website chat popup uses the facet avatar incl. your own avatar next to your messages; support tab (Nora) shows an avatar', status: 'done' },
        { label: "Member photos carry into feed/chat/profile avatars app-wide; avatar always visible (even private) — picture or initials", status: 'done' },
        { label: 'Followers / following lists are a shared sheet on every profile type (mobile BSFollowListSheet + website MemberProfile.html): each row shows the person\'s real profile photo (batched via get_public_profile.avatar / ShapeProfiles.getUserAvatars; demo faces for accountless people) AND is a live link to their public profile (BSPublicProfile / MemberProfile.html?u=). Settings identity counts open the same sheet directly (parity with the profile)', status: 'done' },
        { label: 'Preview mode: demo/seed people show stock faces (app + website) so prospects see avatars on bubbles + profiles', status: 'done' },
        { label: 'Client Terrain profile ported from design handoff: ascent-card hero (facet you-are-here) + THE CLIMB section (start→now→summit)', status: 'done' },
        { label: "THE CLIMB Start/Now/Target + % wired to your real body-comp goal + weigh-ins on your own profile (demo arc for others)", status: 'done' },
        { label: 'Migrations applied in Supabase: public-profile friends-visibility + public-profile avatar + avatar-ungated', status: 'done' },
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
        { label: 'Illustrative profile sub-data, resolved (2026-06-19): a verified coach\'s Certifications now render their REAL submitted cert types via get_coach_certs (2026-06-19-coach-certs-public.sql APPLIED, paths withheld, verified-only). The Signal sigil rings stay illustrative by design (practice focus, not a workout/PR metric); field-notes already load the author\'s real community posts', status: 'done' },
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
    {
      section: 'Shape Radio — real licensed player (Phase 1)',
      items: [
        { label: 'radio_station singleton config table (provider / stream_url / now_playing_url, public-read RLS) — migration 2026-06-19-radio-station.sql', status: 'done' },
        { label: 'GET /api/radio/station — public, returns {name, streamUrl, provider, configured}', status: 'done' },
        { label: 'GET /api/radio/now-playing — public, returns {title, artist, isNora}; degrades to nulls on any provider error', status: 'done' },
        { label: 'RadioProvider adapter (provider.ts interface + NowPlaying type, now-playing.mjs pure normalizer, mock.ts, http.ts, index.ts getProvider selector); unit-tested (tests/radio-now-playing.test.mjs)', status: 'done' },
        { label: 'Web player (public/radio.html) streams the live provider URL + polls /api/radio/now-playing; off-air / coming-soon / auto-retry states', status: 'done' },
        { label: 'Mobile player (iosAppBroadsheetRadio.jsx + window.ShapeRadioLive) streams + polls; pause stops the stream', status: 'done' },
        { label: 'Native background-audio config declared (iOS UIBackgroundModes:audio, Android FOREGROUND_SERVICE prep)', status: 'done' },
        { label: 'OWNER — apply migration + set station row: UPDATE public.radio_station SET provider=\'http\', stream_url=\'<Radio.co stream URL>\', now_playing_url=\'<Radio.co now-playing URL>\' WHERE id=1; (station defaults to mock until applied)', status: 'manual' },
        { label: 'OWNER — Radio.co account signup + station creation (royalties + broadcast managed by provider)', status: 'manual' },
        { label: 'OWNER — native build required for background audio: npx cap sync in mobile-app/ + Xcode/Android Studio build (see mobile-app/RADIO-BACKGROUND-AUDIO.md)', status: 'manual' },
        { label: 'Shape Radio — Nora avatar engine (Phase A): real-time audio-reactive VRM stage + watch-screen preview (web + mobile), placeholder model, manual toggle', status: 'done' },
        { label: 'Procure the real Nora VRM and swap out the placeholder (Phase C)', status: 'manual' },
        { label: 'nora_sets schedule + watch-screen auto-show wiring (Phase B)', status: 'pending' },
        { label: 'On-device WebGL verification (iOS/Android native build)', status: 'pending' },
      ],
    },
    {
      section: 'Shape Score · Momentum, Accountability & Commitments — LIVE',
      items: [
        { label: 'Two-number model: RANK (Σ delta excl. store_redeem, high-water-marked tier) vs SPENDABLE balance (Σ all). Spending never demotes; lapsing/penalties dent the number; "at-risk" line when rank < displayed tier. deriveScore (mobile mjs + src/lib ts) + /api/client/score', status: 'done' },
        { label: 'Momentum meter (0–100: +7 per active day, −12 per miss) + escalating weekly bonus at ≥80 (+15 per consecutive week → +100 cap, 25→40→55→70→85→100). RPCs compute_momentum / award_momentum_bonus; momentum.mjs source of truth; bar on Score page (mobile + web)', status: 'done' },
        { label: 'Accountability clawback (daily cron): missed check-in −7 · skipped assigned workout −5 · broken daily-habit streak −2. (Session-attendance penalty intentionally DROPPED — completion is coach-bookkeeping, would false-penalize.) Guards: recency (no launch back-charge), pause exemption, −30/week cap, 0 balance floor, advisory-locked, idempotent. apply_obligation_penalty (service-role only)', status: 'done' },
        { label: 'Positive earns: kept coach session +12 (award_session_kept, cron) · completed workout +10/day (award_workout_session, un-farmable). Coach waive_penalty + get_client_penalties (coach-gated); "Recent penalties + WAIVE" on the client Manage tab; never-shaming directive stakes copy', status: 'done' },
        { label: 'Weekly commitments + stake: score_commitments RLS table + set_commitment / accept_commitment / settle_commitment RPCs. Coach- or self-set targets (workouts/check-in/habits), 5–50 two-sided stake (hit +S / miss −S floored at 0). Coach proposals need client consent. Anti-farm: locks once active + must be set by Wednesday. Client card (mobile + web /api/client/commitment) + coach propose affordance. Settled by the cron', status: 'done' },
        { label: 'Daily evaluator /api/cron/score-accountability (vercel.json 07:00 UTC, CRON_SECRET-gated, service-role, fail-open per user). ALL migrations applied; CRON_SECRET set + deployed; cron auth verified live (200). The full A–E system is active', status: 'done' },
      ],
    },
    {
      section: 'Funnel analytics',
      items: [
        { label: 'Funnel analytics — DONE. Migration applied live (analytics_events + track_event + get_funnel, service-role-only); War Room funnel panel live; 12-month purge cron (daily 03:30 UTC). The mobile track() wiring bug (events silently no-op\'d) was fixed in #1407 — the 5 events now emit + are consent-gated (region-aware, fail-closed)', status: 'done' },
      ],
    },
  ];
}

async function buildFunnelSnapshot(cohortDays = 0): Promise<WarRoomSnapshot['funnel']> {
  const to = new Date();
  const from = cohortDays > 0 ? new Date(Date.now() - cohortDays * 86400000) : new Date('2020-01-01');
  const empty = { cohortDays, generatedFor: 'all', rows: buildFunnel({}), biggestDrop: null };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('get_funnel', { p_from: from.toISOString(), p_to: to.toISOString() });
    if (error || !Array.isArray(data)) return empty; // migration not applied yet → graceful empty
    const counts: Record<string, number> = {};
    for (const r of data as Array<{ step: string; count: number }>) counts[r.step] = Number(r.count) || 0;
    const rows = buildFunnel(counts);
    return { cohortDays, generatedFor: cohortDays ? `last ${cohortDays}d` : 'all', rows, biggestDrop: rows.find(r => r.isBiggestDrop)?.key ?? null };
  } catch { return empty; }
}

export async function buildWarRoomSnapshot(cohortDays = 0): Promise<WarRoomSnapshot> {
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

  const funnel = await buildFunnelSnapshot(cohortDays);

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
    funnel,
  };
}
