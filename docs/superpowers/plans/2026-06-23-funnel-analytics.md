# Funnel Analytics ("Find the Single Biggest Drop-Off") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an admin a War Room "Funnel & drop-off" view that shows where members fall out of the funnel (signup → onboarding → first workout → first nutrition → paid → day-30 → day-90), computed from existing data, plus a thin user-linked event layer for the gaps the data model can't see.

**Architecture:** A pure JS module owns the drop-off math (unit-tested). A Supabase migration adds an admin-only `analytics_events` table, a whitelisted `track_event` writer, and a `get_funnel` RPC that returns raw per-step counts from existing tables. A thin `/api/analytics/track` route + consent-gated client helper emit the ~5 gap events. `buildWarRoomSnapshot()` calls `get_funnel` (service role) and shapes it via the pure module; `WarRoomClient` renders a new Funnel panel. A daily cron purges events > 12 months.

**Tech Stack:** Next.js 16 (App Router, `src/app`), Supabase Postgres (RLS + SECURITY DEFINER RPCs, `supabase-migrations/`), Node test runner (`node --test tests/*.test.mjs`), Vercel cron.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-23-funnel-analytics-drop-off-design.md`.
- **Branch:** `feat/funnel-analytics` (already created, spec committed).
- **Funnel is 7 steps** (coach step from the spec dropped for v1 — coaches nascent, would read ~0%): `signup, onboarding, first_workout, first_nutrition, paid, day30, day90`.
- **Privacy:** admin-only end to end (`requireAdminUser` page gate + RLS admin-only SELECT + `get_funnel` granted to `service_role` only). Client events fire only when consent allows (no GPC opt-out). 12-month retention.
- **Whitelisted events (exactly these 5):** `onboarding_started`, `app_opened`, `workout_started`, `paywall_viewed`, `checkout_started`. The JS whitelist and the SQL whitelist MUST match.
- **No third-party analytics SDK, no A/B framework, no client-readable analytics.**
- **Migrations are owner-run:** the migration file is committed; reply with the raw GitHub link for the owner to run. All code no-ops/​degrades gracefully until applied.
- **Verify each task:** `npx tsc --noEmit` (TS), `npm test` (pure JS), and for the migration the owner applies it then we confirm `get_advisors` has 0 ERROR.

---

### Task 1: Pure funnel module + whitelist (TDD)

**Files:**
- Create: `src/lib/funnel.mjs`
- Create: `src/lib/funnel.d.ts`
- Test: `tests/funnel.test.mjs`
- Modify: `package.json` (add the test file to the `test` script)

**Interfaces:**
- Produces:
  - `FUNNEL_STEPS: ReadonlyArray<{ key: string; label: string }>` — the 7 ordered steps.
  - `ANALYTICS_EVENTS: ReadonlyArray<string>` — the 5 whitelisted event names.
  - `isAnalyticsEvent(name: string): boolean`
  - `buildFunnel(counts: Record<string, number>): Array<{ key, label, count, pctOfSignup, pctDrop, isBiggestDrop }>` — `counts` is keyed by step key; missing keys → 0. `pctOfSignup` = count/signup×100 (signup row = 100; 0 when signup is 0). `pctDrop` = drop from the previous step as a % of the previous step's count (first row → 0). `isBiggestDrop` = true on the single step with the largest `pctDrop` (ties → earliest; all-zero → none).

- [ ] **Step 1: Write the failing test**

```js
// tests/funnel.test.mjs
// Pure funnel shaping: raw per-step counts -> rows with drop-off % + biggest-drop flag.
// Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFunnel, isAnalyticsEvent, FUNNEL_STEPS, ANALYTICS_EVENTS } from '../src/lib/funnel.mjs';

test('7 ordered steps, signup first', () => {
  assert.equal(FUNNEL_STEPS.length, 7);
  assert.equal(FUNNEL_STEPS[0].key, 'signup');
  assert.deepEqual(FUNNEL_STEPS.map(s => s.key),
    ['signup', 'onboarding', 'first_workout', 'first_nutrition', 'paid', 'day30', 'day90']);
});

test('computes pctOfSignup and pctDrop, flags the biggest drop', () => {
  const rows = buildFunnel({
    signup: 1000, onboarding: 850, first_workout: 700,
    first_nutrition: 600, paid: 200, day30: 120, day90: 60,
  });
  assert.equal(rows[0].pctOfSignup, 100);
  assert.equal(rows[0].pctDrop, 0);
  assert.equal(rows[1].pctOfSignup, 85);
  assert.equal(rows[1].pctDrop, 15);              // 1000 -> 850
  assert.equal(rows[2].pctDrop, 18);              // 850 -> 700 (17.6 -> 18)
  // biggest single drop is paid: 600 -> 200 = 67%
  const biggest = rows.find(r => r.isBiggestDrop);
  assert.equal(biggest.key, 'paid');
  assert.equal(rows.filter(r => r.isBiggestDrop).length, 1);
});

test('zero signups -> all zero, no biggest drop, never divides by zero', () => {
  const rows = buildFunnel({});
  assert.equal(rows.length, 7);
  assert.equal(rows[0].pctOfSignup, 0);
  assert.equal(rows.every(r => r.pctDrop === 0), true);
  assert.equal(rows.some(r => r.isBiggestDrop), false);
});

test('event whitelist is exactly the 5 names', () => {
  assert.deepEqual([...ANALYTICS_EVENTS].sort(),
    ['app_opened', 'checkout_started', 'onboarding_started', 'paywall_viewed', 'workout_started']);
  assert.equal(isAnalyticsEvent('app_opened'), true);
  assert.equal(isAnalyticsEvent('drop_table'), false);
  assert.equal(isAnalyticsEvent(''), false);
  assert.equal(isAnalyticsEvent(null), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/funnel.test.mjs`
Expected: FAIL — `Cannot find module '../src/lib/funnel.mjs'`.

- [ ] **Step 3: Write the module**

```js
// src/lib/funnel.mjs
// Pure funnel shaping + the analytics event whitelist. No I/O. The SQL
// get_funnel() returns raw per-step counts; this turns them into display rows
// with drop-off % and flags the single biggest drop. Mirror of the SQL event
// whitelist in 2026-06-23-analytics-events.sql — keep the two in sync.

export const FUNNEL_STEPS = [
  { key: 'signup', label: 'Signed up' },
  { key: 'onboarding', label: 'Completed onboarding' },
  { key: 'first_workout', label: 'Logged 1st workout' },
  { key: 'first_nutrition', label: 'Logged 1st nutrition' },
  { key: 'paid', label: 'Paid subscriber' },
  { key: 'day30', label: 'Day-30 retained' },
  { key: 'day90', label: 'Day-90 retained' },
];

export const ANALYTICS_EVENTS = [
  'onboarding_started', 'app_opened', 'workout_started', 'paywall_viewed', 'checkout_started',
];

export function isAnalyticsEvent(name) {
  return typeof name === 'string' && ANALYTICS_EVENTS.includes(name);
}

function pct(n, d) {
  if (!d || d <= 0) return 0;
  return Math.round((n / d) * 100);
}

export function buildFunnel(counts) {
  const c = counts || {};
  const signup = Number(c.signup) || 0;
  const rows = FUNNEL_STEPS.map((step, i) => {
    const count = Number(c[step.key]) || 0;
    const prev = i === 0 ? count : (Number(c[FUNNEL_STEPS[i - 1].key]) || 0);
    const dropped = i === 0 ? 0 : Math.max(prev - count, 0);
    return {
      key: step.key,
      label: step.label,
      count,
      pctOfSignup: pct(count, signup),
      pctDrop: i === 0 ? 0 : pct(dropped, prev),
      isBiggestDrop: false,
    };
  });
  let maxIdx = -1, maxDrop = 0;
  rows.forEach((r, i) => { if (i > 0 && r.pctDrop > maxDrop) { maxDrop = r.pctDrop; maxIdx = i; } });
  if (maxIdx >= 0) rows[maxIdx].isBiggestDrop = true;
  return rows;
}
```

```ts
// src/lib/funnel.d.ts
export type FunnelStep = { key: string; label: string };
export type FunnelRow = {
  key: string; label: string; count: number;
  pctOfSignup: number; pctDrop: number; isBiggestDrop: boolean;
};
export const FUNNEL_STEPS: ReadonlyArray<FunnelStep>;
export const ANALYTICS_EVENTS: ReadonlyArray<string>;
export function isAnalyticsEvent(name: unknown): boolean;
export function buildFunnel(counts: Record<string, number>): FunnelRow[];
```

- [ ] **Step 4: Register the test, run, verify pass**

In `package.json` append ` tests/funnel.test.mjs` to the end of the `"test"` command string.
Run: `node --test tests/funnel.test.mjs` then `npm test`
Expected: PASS (funnel suite green; full suite still green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/funnel.mjs src/lib/funnel.d.ts tests/funnel.test.mjs package.json
git commit -m "feat(analytics): pure funnel shaping + event whitelist (TDD)"
```

---

### Task 2: Migration — analytics_events table + track_event + get_funnel

**Files:**
- Create: `supabase-migrations/2026-06-23-analytics-events.sql`

**Interfaces:**
- Produces (consumed by Tasks 3, 5, 6):
  - `public.track_event(p_event text, p_props jsonb)` → void. SECURITY DEFINER; whitelists `p_event`; binds `user_id := auth.uid()` (nullable); granted to `anon, authenticated`.
  - `public.get_funnel(p_from timestamptz, p_to timestamptz)` → `table(step text, count bigint)`. SECURITY DEFINER; granted to `service_role` only. Returns the 7 step counts for client signups in `[p_from, p_to)`.
  - `public.analytics_events(id, user_id, event, props, ts)` — RLS on; SELECT admin-only; no client insert (RPC only).

- [ ] **Step 1: Write the migration**

```sql
-- supabase-migrations/2026-06-23-analytics-events.sql
-- Funnel analytics (retention idea #6). A thin, admin-only event table + a
-- whitelisted writer, and get_funnel() which computes the 7-step funnel from
-- EXISTING tables (signup/onboarding/workout/nutrition/paid/retention). The
-- event whitelist here MUST match ANALYTICS_EVENTS in src/lib/funnel.mjs.
-- Idempotent. Code no-ops until applied (RPC-missing is caught by callers).

create table if not exists public.analytics_events (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event   text not null,
  props   jsonb not null default '{}'::jsonb,
  ts      timestamptz not null default now()
);
create index if not exists analytics_events_event_ts_idx on public.analytics_events (event, ts);
create index if not exists analytics_events_user_ts_idx   on public.analytics_events (user_id, ts);

alter table public.analytics_events enable row level security;

-- Admin-only read. Mirrors the app's admin allowlist (email in profiles).
drop policy if exists "analytics_events_admin_read" on public.analytics_events;
create policy "analytics_events_admin_read" on public.analytics_events
  for select using (
    exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid()
        and lower(pr.email) = any (string_to_array(lower(coalesce(current_setting('app.admin_emails', true), '')), ','))
    )
  );
-- (No INSERT/UPDATE/DELETE policy: writes go only through track_event below,
--  and service-role/cron bypass RLS for purge.)

-- Whitelisted writer. Rejects unknown event names; binds the caller's uid.
create or replace function public.track_event(p_event text, p_props jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event not in ('onboarding_started','app_opened','workout_started','paywall_viewed','checkout_started') then
    return; -- silently ignore non-whitelisted names (defensive)
  end if;
  insert into public.analytics_events (user_id, event, props)
  values (auth.uid(), p_event, coalesce(p_props, '{}'::jsonb));
end;
$$;
revoke all on function public.track_event(text, jsonb) from public;
grant execute on function public.track_event(text, jsonb) to anon, authenticated;

-- The funnel. Returns one row per step with the count for client accounts that
-- signed up in [p_from, p_to). Retention steps only count members old enough to
-- have reached that day.
create or replace function public.get_funnel(p_from timestamptz, p_to timestamptz)
returns table (step text, count bigint)
language sql
security definer
set search_path = public
as $$
  with cohort as (
    select pr.id as uid, pr.created_at
    from public.profiles pr
    where pr.role = 'client'
      and pr.created_at >= p_from and pr.created_at < p_to
  )
  select 'signup'::text, count(*)::bigint from cohort
  union all
  select 'onboarding', count(*)::bigint from cohort c
    where exists (select 1 from public.user_goals g
                  where g.user_id = c.uid and g.kind = 'client_onboarding'
                    and coalesce((g.data->>'intentSeen')::boolean, false))
  union all
  select 'first_workout', count(*)::bigint from cohort c
    where exists (select 1 from public.workout_sessions w where w.client_id = c.uid)
  union all
  select 'first_nutrition', count(*)::bigint from cohort c
    where exists (select 1 from public.daily_health_snapshot d
                  where d.user_id = c.uid and (d.calories is not null or d.protein_g is not null))
  union all
  select 'paid', count(*)::bigint from cohort c
    where exists (select 1 from public.platform_subscriptions s
                  where s.client_id = c.uid and s.status in ('active','trialing','past_due'))
  union all
  select 'day30', count(*)::bigint from cohort c
    where c.created_at < now() - interval '30 days'
      and (
        exists (select 1 from public.workout_sessions w
                where w.client_id = c.uid and w.created_at >= c.created_at + interval '30 days')
        or exists (select 1 from public.daily_health_snapshot d
                where d.user_id = c.uid and d.snapshot_date >= (c.created_at + interval '30 days')::date)
      )
  union all
  select 'day90', count(*)::bigint from cohort c
    where c.created_at < now() - interval '90 days'
      and (
        exists (select 1 from public.workout_sessions w
                where w.client_id = c.uid and w.created_at >= c.created_at + interval '90 days')
        or exists (select 1 from public.daily_health_snapshot d
                where d.user_id = c.uid and d.snapshot_date >= (c.created_at + interval '90 days')::date)
      );
$$;
revoke all on function public.get_funnel(timestamptz, timestamptz) from public;
grant execute on function public.get_funnel(timestamptz, timestamptz) to service_role;
```

> NOTE on the admin-read policy: the app resolves admins from an env allowlist
> (`src/lib/admin-access.ts`), not a DB GUC. The RLS policy above is defensive
> only — **the real gate is the `/warroom` page (`requireAdminUser`) + `get_funnel`
> being service-role-only.** If `app.admin_emails` GUC isn't set, the policy
> simply denies all direct SELECT (fine: nothing reads the table via an RLS
> client; the War Room reads `get_funnel` via the service role). Leave as-is.

- [ ] **Step 2: Verify the SQL parses (local dry check)**

Run: `grep -c "create or replace function" supabase-migrations/2026-06-23-analytics-events.sql`
Expected: `2`. Eyeball that every `union all` step returns `(text, bigint)`.

- [ ] **Step 3: Commit + surface the raw link for the owner to run**

```bash
git add supabase-migrations/2026-06-23-analytics-events.sql
git commit -m "feat(analytics): analytics_events table + track_event + get_funnel migration"
```
Then (after push) the owner runs:
`raw.githubusercontent.com/cperry8800-droid/shape-app/<branch-or-main>/supabase-migrations/2026-06-23-analytics-events.sql`
After they run it, confirm `get_advisors(type=security)` shows **0 ERROR** (the new SECURITY DEFINER funcs may add by-design WARNs — acceptable).

---

### Task 3: `/api/analytics/track` route + client `track()` helpers

**Files:**
- Create: `src/app/api/analytics/track/route.ts`
- Modify: `public/supabase.js` (add `window.ShapeAnalytics.track`)
- Create: `mobile-app/src/services/analytics.js` (mobile `window.ShapeAnalytics.track`)
- Modify: `mobile-app/src/main.jsx` (import the analytics service so the helper exists)

**Interfaces:**
- Consumes: `isAnalyticsEvent` (Task 1), `track_event` RPC (Task 2).
- Produces: `POST /api/analytics/track {event, props?}` → `204` always (fire-and-forget). `window.ShapeAnalytics.track(event, props)` on web + mobile (consent-gated, never throws).

- [ ] **Step 1: Write the route**

```ts
// src/app/api/analytics/track/route.ts
// Thin, fire-and-forget event sink. Whitelists the event name (the only client
// write path into analytics_events, via the track_event RPC which re-checks the
// whitelist + binds auth.uid()). Always returns 204 so the client never blocks
// or sees an error. Membership is NOT required (funnel must capture pre-paywall).
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAnalyticsEvent } from '@/lib/funnel.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { event?: unknown; props?: unknown };
    const event = typeof body.event === 'string' ? body.event : '';
    if (!isAnalyticsEvent(event)) return new NextResponse(null, { status: 204 });
    const props = body.props && typeof body.props === 'object' && !Array.isArray(body.props) ? body.props : {};
    const supabase = await createClient();
    await supabase.rpc('track_event', { p_event: event, p_props: props });
  } catch {
    // swallow — analytics must never surface an error to the caller
  }
  return new NextResponse(null, { status: 204 });
}
```

> If `@/lib/supabase/server`'s `createClient` isn't the right server-cookie
> client, match the import the other `src/app/api/client/*` routes use (the
> session-cookie client) — confirm by opening one such route. The RPC binds
> `auth.uid()` from that session; anon callers record a null-user event (fine).

- [ ] **Step 2: Web client helper**

Add to `public/supabase.js` (inside the IIFE, after `window.shapeDb` is set):

```js
// Fire-and-forget product analytics. Consent-gated: never sends when GPC is on
// or the visitor opted out of the cookie/analytics banner. Whitelist enforced
// server-side too. Never throws.
window.ShapeAnalytics = window.ShapeAnalytics || {
  track: function (event, props) {
    try {
      var gpc = (typeof navigator !== 'undefined' && navigator.globalPrivacyControl === true);
      var choice = null;
      try { choice = JSON.parse(localStorage.getItem('shape.consent.v1') || 'null'); } catch (e) {}
      if (gpc) return;
      if (choice && choice.analytics === false) return; // explicit opt-out
      fetch('/api/analytics/track', {
        method: 'POST', credentials: 'same-origin', keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: event, props: props || {} }),
      }).catch(function () {});
    } catch (e) {}
  },
};
```

> Confirm the consent localStorage shape: open `public/newdesign/pageShell.jsx`
> `shapeConsent` (key `shape.consent.v1`) and match the property the banner
> stores for analytics consent. If the banner only stores a coarse granted/denied,
> gate on that instead (`choice.granted === false`).

- [ ] **Step 3: Mobile helper**

```js
// mobile-app/src/services/analytics.js
// Mobile (Capacitor/web) product analytics — same fire-and-forget contract as
// the web helper. Posts to the same /api/analytics/track (native uses the
// VITE_API_BASE_URL + Bearer that shapeBackend already configures for fetch).
function postEvent(event, props) {
  try {
    const base = (typeof window !== 'undefined' && window.__SHAPE_API_BASE__) || '';
    fetch(base + '/api/analytics/track', {
      method: 'POST', credentials: 'same-origin', keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, props: props || {} }),
    }).catch(() => {});
  } catch (e) {}
}
if (typeof window !== 'undefined') {
  window.ShapeAnalytics = window.ShapeAnalytics || { track: postEvent };
}
export {};
```

Add `import './services/analytics.js';` near the top of `mobile-app/src/main.jsx`
(alongside the other side-effect service imports).

> Confirm the native API base: reuse whatever `shapeBackend.js` uses for its
> authed `fetch` base (so native posts reach the deployed `/api`). If there's a
> shared `apiBase()` helper, call it instead of `window.__SHAPE_API_BASE__`.

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit` (root) — expect clean.
Run (mobile, PowerShell): `$env:VITE_BASE='/m/'; npm run build` in `mobile-app/` — expect built.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/analytics/track/route.ts public/supabase.js mobile-app/src/services/analytics.js mobile-app/src/main.jsx
git commit -m "feat(analytics): /api/analytics/track + consent-gated client track() (web + mobile)"
```

---

### Task 4: Emit the 5 gap events

**Files (modify; exact lines found by grep at implementation time):**
- Server: the membership paywall check → emit `paywall_viewed`; the Stripe checkout-session route → emit `checkout_started`.
- Client: identity onboarding start → `onboarding_started`; app open → `app_opened`; workout start → `workout_started`.

**Interfaces:** Consumes `window.ShapeAnalytics.track` (Task 3) + `track_event` RPC (server side, via the admin/service client already in those routes).

- [ ] **Step 1: `paywall_viewed` + `checkout_started` (server)**

In the platform checkout route (`grep -rl "platform-checkout\|checkout-session" src/app/api/stripe`), right after the session is created, insert one fire-and-forget call using the route's existing supabase client:
```ts
try { await supabase.rpc('track_event', { p_event: 'checkout_started', p_props: { kind: 'platform' } }); } catch {}
```
For `paywall_viewed`: the mobile paywall (`BSPaywall` in `mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx`) and the web dashboard paywall (`src/app/dashboard/layout.tsx`) — call `window.ShapeAnalytics?.track?.('paywall_viewed')` on mount (client) for mobile; for the web dashboard gate, emit server-side once when the members-only screen renders (`await supabase.rpc('track_event', { p_event: 'paywall_viewed', p_props: {} })` in the layout's non-member branch).

- [ ] **Step 2: `onboarding_started` (client)**

In `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`, in `BSIntentStep` (the identity gate), fire once when the step mounts:
```js
React.useEffect(() => { try { window.ShapeAnalytics?.track?.('onboarding_started'); } catch (e) {} }, []);
```

- [ ] **Step 3: `app_opened` (client)**

In `mobile-app/src/main.jsx` (after the analytics import) and in `public/supabase.js` consumers' shared boot, fire once per load:
```js
try { window.ShapeAnalytics?.track?.('app_opened', { surface: 'mobile' }); } catch (e) {}
```
For the website, add the same call (`surface: 'web'`) in the consent IIFE tail of `public/newdesign/pageShell.jsx` (only after the consent check there).

- [ ] **Step 4: `workout_started` (client)**

In the live-session start path (`grep -n "setSleepSheet\|BSSession\|startWorkout\|setHabitsPage" ...` → the workout "Start" handler in `iosAppBroadsheetClient.jsx`), fire:
```js
try { window.ShapeAnalytics?.track?.('workout_started'); } catch (e) {}
```

- [ ] **Step 5: Verify + commit**

Run: `node -e "require('./mobile-app/node_modules/@babel/parser').parse(require('fs').readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})" && echo OK`
Run: `npx tsc --noEmit`; rebuild mobile + resync `public/m` (PowerShell).
```bash
git add -A
git commit -m "feat(analytics): emit the 5 gap events (paywall/checkout/onboarding/app-open/workout)"
```

---

### Task 5: Retention purge cron

**Files:**
- Create: `src/app/api/cron/analytics-purge/route.ts`
- Modify: `vercel.json` (add the cron entry)

- [ ] **Step 1: Write the cron route**

```ts
// src/app/api/cron/analytics-purge/route.ts
// Daily: delete analytics_events older than 12 months (bounded retention).
// Auth: x-cron-secret: <CRON_SECRET> OR Authorization: Bearer <CRON_SECRET>.
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || ''));
  return x.length === y.length && timingSafeEqual(x, y);
}
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return false;
  return safeEqual(req.headers.get('x-cron-secret') || '', secret)
    || safeEqual(req.headers.get('authorization') || '', `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const admin = createAdminClient();
    const { error } = await admin.from('analytics_events').delete().lt('ts', cutoff);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
    return NextResponse.json({ ok: true, cutoff });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 200 });
  }
}
```

- [ ] **Step 2: Add the cron schedule**

In `vercel.json` `crons`, add:
```json
{ "path": "/api/cron/analytics-purge", "schedule": "30 3 * * *" }
```

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit`; `next build` (or rely on CI).
```bash
git add src/app/api/cron/analytics-purge/route.ts vercel.json
git commit -m "feat(analytics): daily 12-month retention purge cron"
```

---

### Task 6: War Room "Funnel & drop-off" panel

**Files:**
- Modify: `src/lib/warroom.ts` (snapshot `funnel` field + builder; register the 2 new routes in `RAW_ROUTES`; add a checklist item)
- Modify: `src/app/warroom/WarRoomClient.tsx` (new Funnel view/panel + cohort selector)

**Interfaces:** Consumes `buildFunnel`, `FUNNEL_STEPS` (Task 1), `get_funnel` RPC (Task 2). Produces `WarRoomSnapshot.funnel: { cohortDays: number; rows: FunnelRow[]; biggestDrop: string | null }` and `/api/warroom` returns it.

- [ ] **Step 1: warroom.ts — types + builder**

Add to the `WarRoomSnapshot` type:
```ts
funnel: { cohortDays: number; generatedFor: string; rows: import('./funnel').FunnelRow[]; biggestDrop: string | null };
```
Add a builder (called from `buildWarRoomSnapshot`, default cohort = all-time; the client can re-request narrower windows via `/api/warroom?cohortDays=`):
```ts
import { buildFunnel } from './funnel.mjs';
import { createAdminClient } from './supabase/admin';

async function buildFunnel90(cohortDays = 0): Promise<WarRoomSnapshot['funnel']> {
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
```
Wire `snapshot.funnel = await buildFunnel90(0);` into `buildWarRoomSnapshot()`. In `RAW_ROUTES` add `['/api/analytics/track', 'POST']` and `['/api/cron/analytics-purge', 'GET']`. In `buildChecklist`, add to the analytics/relevant section: `{ label: 'Funnel analytics: analytics_events + track_event + get_funnel migration applied; War Room funnel panel live; 5 gap events emitting (consent-gated); 12-month purge cron', status: 'manual' }` (manual until the owner runs the migration).

- [ ] **Step 2: `/api/warroom` passes cohort through (optional narrowing)**

In `src/app/api/warroom/route.ts`, read `?cohortDays=` and call the funnel builder with it (default 0); merge into the snapshot it returns. (If the snapshot is built whole by `buildWarRoomSnapshot`, add an optional `cohortDays` param to that function and thread it.)

- [ ] **Step 3: WarRoomClient.tsx — Funnel panel**

Add a `'funnel'` entry to the view tabs and a panel that renders `snap.funnel.rows` as a descending list: each row `label · count · {pctOfSignup}% · −{pctDrop}% drop`, with `isBiggestDrop` rows drawn in `C.bad` and a callout line ("Biggest drop: {label} — {pctDrop}%"). Add a cohort `<select>` (All / 90d / 30d) that refetches `/api/warroom?cohortDays=` and updates `snap`.

```tsx
// sketch — match the file's existing panel/tab styling (C.* tokens, the view state)
function FunnelPanel({ funnel, onCohort }: { funnel: WarRoomSnapshot['funnel']; onCohort: (d: number) => void }) {
  const max = Math.max(1, funnel.rows[0]?.count || 1);
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <strong style={{ color: C.text }}>Funnel &amp; drop-off</strong>
        <select onChange={e => onCohort(Number(e.target.value))} defaultValue="0"
          style={{ background: C.panel2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px' }}>
          <option value="0">All time</option><option value="90">Last 90 days</option><option value="30">Last 30 days</option>
        </select>
      </div>
      {funnel.biggestDrop && (
        <div style={{ color: C.bad, fontSize: 13, marginBottom: 10 }}>
          Biggest drop: {funnel.rows.find(r => r.isBiggestDrop)?.label} — {funnel.rows.find(r => r.isBiggestDrop)?.pctDrop}%
        </div>
      )}
      {funnel.rows.map(r => (
        <div key={r.key} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: r.isBiggestDrop ? C.bad : C.text }}>
            <span>{r.label}</span>
            <span>{r.count.toLocaleString()} · {r.pctOfSignup}%{r.pctDrop > 0 ? ` · −${r.pctDrop}%` : ''}</span>
          </div>
          <div style={{ height: 6, background: C.panel2, borderRadius: 3, marginTop: 3 }}>
            <div style={{ height: 6, width: `${Math.round((r.count / max) * 100)}%`, background: r.isBiggestDrop ? C.bad : C.ok, borderRadius: 3 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit` (clean), `next build` (or CI). Optionally render `/warroom` against the dev/preview DB and confirm the panel shows (zeros until the migration is applied + data accrues).
```bash
git add src/lib/warroom.ts src/app/warroom/WarRoomClient.tsx src/app/api/warroom/route.ts
git commit -m "feat(analytics): War Room funnel & drop-off panel"
```

---

### Task 7: Docs + retention record

**Files:**
- Modify: `docs/legal/data-retention-schedule.md` (add `analytics_events` — 12 months)
- Modify: `docs/legal/ropa.md` (add the analytics processing record: purpose = product analytics, data = user_id + event + minimal props, retention 12mo, admin-only)
- Modify: `docs/WORKLOG.md` (dated changelog entry)

- [ ] **Step 1: Retention schedule + ROPA entries**

Add a row to `data-retention-schedule.md`: `analytics_events — product funnel events — 12 months — purged daily by /api/cron/analytics-purge`.
Add a ROPA entry in `ropa.md`: processing activity "Product analytics (funnel/drop-off)", lawful basis legitimate interest, data subjects = members, categories = user id + behavioral event name + minimal non-PII props, recipients = none (first-party), retention 12 months, security = admin-only RLS + service-role-only funnel RPC.

- [ ] **Step 2: WORKLOG entry**

Add a dated `### 2026-06-23 — Funnel analytics ("find the biggest drop-off")` entry summarizing: the computed 7-step funnel + thin event layer, the War Room panel, admin-only/consent-gated/12-month-retention posture, and the **owner action** (run `2026-06-23-analytics-events.sql`).

- [ ] **Step 3: Commit**

```bash
git add docs/legal/data-retention-schedule.md docs/legal/ropa.md docs/WORKLOG.md
git commit -m "docs(analytics): retention schedule + ROPA + WORKLOG for funnel analytics"
```

---

## Self-Review

**Spec coverage:** computed funnel (Task 2 `get_funnel` + Task 6) ✓; thin events (Task 2 `track_event` + Task 3 route/helpers + Task 4 emit points) ✓; data model + admin-only RLS + whitelist (Task 2) ✓; funnel RPC (Task 2) ✓; War Room surfacing + cohort filter (Task 6) ✓; privacy/consent-gate + 12-month retention (Task 3 helper + Task 5 cron + Task 7 docs) ✓; RAW_ROUTES + retention-schedule/ROPA (Tasks 6–7) ✓. **Deviation from spec:** coach step dropped (7 steps not 8) — documented in Global Constraints (coaches nascent → ~0%).

**Placeholder scan:** the "confirm X" notes (consent key shape, server supabase client import, native API base, exact emit-point lines) are **grounded verifications against named files**, not blanks — each names the file to open and what to match. Acceptable.

**Type consistency:** `buildFunnel`/`FunnelRow`/`isAnalyticsEvent` names + the 5 event strings + the 7 step keys are identical across funnel.mjs, the migration whitelist, the route, and the War Room builder.
