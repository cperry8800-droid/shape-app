# Funnel Analytics — "Find the Single Biggest Drop-Off" (design)

**Date:** 2026-06-23
**Status:** Design approved; pending spec review → implementation plan
**Retention idea:** #6 of `PRODUCT-STRATEGY.md` (CRITICAL). Ideas #1 (promise CTAs)
and #7 (identity onboarding) already shipped (#1395).

## Goal

Stand up Shape's first analytics capability so we can **see where members fall out
of the funnel** and fix the single worst step. Shape has **no event tracking today**.

Success = an admin can open the War Room and read the funnel —
`signup → onboarding → first workout → first nutrition → coach → paid → day‑30 → day‑90`
— with each step's **count · % retained · % drop**, and the **biggest drop highlighted**.
That answer drives the next iteration (a targeted fix on the worst step, measured on the
same funnel).

## Approach (decided)

**Hybrid**, **first-party / user-linked / bounded** (the two brainstorming decisions):

1. **Computed funnel** — most steps are derivable from tables Shape already has, so the
   funnel works on *historical* members with **no new tracking**.
2. **Thin event layer** — a small `analytics_events` table for the ~5 steps the data
   model can't see (abandonment *within* a step), tied to `user_id`, admin-only,
   bounded retention.
3. **War Room panel** — the surfacing.

Non-goals (YAGNI): no third-party analytics SDK (Segment/Mixpanel), no A/B-test
framework, no per-event exploration UI beyond the funnel, no client-visible analytics.

## The funnel (8 steps) and their sources

| # | Step | Source | Type |
|---|------|--------|------|
| 1 | Signed up | `profiles.created_at` (role = client) | computed |
| 2 | Completed onboarding | `user_goals('client_onboarding').intentSeen = true` (the identity gate from #7) | computed |
| 3 | Logged 1st workout | earliest `workout_sessions` (fallback `workout_set_logs`) for the user | computed |
| 4 | Logged 1st nutrition | earliest `daily_health_snapshot` row with macros (protein/kcal) | computed |
| 5 | Connected with a coach | a `conversations` row with a coach participant, or a coach↔client link | computed |
| 6 | Paid subscriber | active `platform_subscriptions` (status active/trialing/past_due) | computed |
| 7 | Day‑30 retained | latest activity ≥ 30 days after signup (max ts across snapshots / sessions / check-ins) | computed |
| 8 | Day‑90 retained | same, ≥ 90 days | computed |

The funnel is **cohort-filterable** by signup date (last 30 / 90 / all). Retention steps
(7–8) only count members whose signup is old enough to have reached that day (so day‑90
isn't artificially deflated by recent signups).

## Thin events (only the gaps — ~5)

These capture abandonment the tables can't show (the tables only record *completions*):

| Event | Why (the gap it fills) | Emitted |
|-------|------------------------|---------|
| `onboarding_started` | catch drop-off *inside* onboarding (we only see completions today) | client (consent-gated) |
| `app_opened` | "opened but did nothing" + DAU/retention signal | client (consent-gated) |
| `workout_started` | started a workout but never logged it | client (consent-gated) |
| `paywall_viewed` | top of the payment funnel (vs. `paid`) | server (paywall route) |
| `checkout_started` | started checkout but didn't complete | server (checkout route) |

Server-emitted events are preferred (no client write surface). Client-emitted events
fire only after the existing consent/GPC gate says it's allowed.

## Data model

```
analytics_events
  id          uuid pk default gen_random_uuid()
  user_id     uuid null  references auth.users (null for pre-auth events)
  event       text not null            -- whitelisted name
  props       jsonb not null default '{}'
  ts          timestamptz not null default now()
  -- index on (event, ts), (user_id, ts)
```

- **RLS:** `SELECT` is **admin-only** (via the existing admin check). No client SELECT.
- **Writes go through one guarded path**, never a raw client insert:
  - `track_event(p_event text, p_props jsonb)` — `SECURITY DEFINER`, **whitelists the
    event name** (rejects anything not in the known set), binds `user_id := auth.uid()`
    (or null when anon), and is the only writer. Same lockbox spirit as `check_rate_limit`.
  - Thin route **`POST /api/analytics/track`** — validates the name against the whitelist,
    resolves `user_id` from the session, calls the RPC. Used by client-emitted events.
  - Server-emitted events (`paywall_viewed`, `checkout_started`) call the RPC / insert
    directly from their existing API routes (service role).
- **Retention:** a daily cron (`/api/cron/analytics-purge`, `CRON_SECRET`) deletes rows
  older than **12 months**. Documented in `docs/legal/data-retention-schedule.md`.

## The funnel RPC

`get_funnel(p_from date, p_to date)` — `SECURITY DEFINER`, **admin-only** (raises if the
caller isn't admin). Returns an ordered array of `{ step, label, count, pct_of_signup,
pct_drop_from_prev }` computed from the existing tables (+ the events table for
event-derived steps). One round trip; no per-user data leaves the function (aggregate
counts only).

## Surfacing — War Room

New **"Funnel & drop-off"** panel in `/warroom` (admin). For the selected cohort:

- the 8 steps as a descending list/bar: `label · count · {pct}% retained · −{drop}% drop`
- the **single biggest drop** row highlighted (red), with a one-line callout
  ("Biggest drop: First workout — 18%").
- a cohort selector (signups in last 30 / 90 / all).

Reads `get_funnel` server-side (the War Room is already a server component with admin
gating). No new client analytics surface.

## Privacy / compliance

- Admin-only end to end (`requireAdminUser` on the route/RPC; RLS SELECT admin-only).
- First-party, user-linked, **no new PII** beyond `user_id` + event name + minimal props.
- Client-emitted events honor the existing consent/GPC IIFE (don't fire when opted out).
- 12-month bounded retention (auto-purge cron).
- Add the table to the counsel docs (`ropa.md` processing record +
  `data-retention-schedule.md`).

## Files (high-level — detailed in the plan)

- **Migration** `supabase-migrations/2026-06-23-analytics-events.sql` — table, RLS,
  `track_event`, `get_funnel`, indexes.
- **API** `src/app/api/analytics/track/route.ts` (client events) + emit calls in the
  paywall + checkout routes; `src/app/api/cron/analytics-purge/route.ts` + `vercel.json`.
- **Client** a tiny `track()` helper (web `public/supabase.js` / `public/newdesign`, and
  mobile `mobile-app/src/services`) that POSTs to the route, consent-gated; wired at the
  ~5 emit points.
- **War Room** `src/lib/warroom.ts` (funnel data builder) + the `/warroom` panel
  component; register the new routes in `RAW_ROUTES`.
- **Docs** retention-schedule + ROPA entries; War Room checklist item.

## Success criteria

- Admin opens `/warroom` → sees the 8-step funnel with counts + drop % for a chosen
  cohort, biggest drop highlighted, computed from real data.
- The ~5 thin events record (consent-gated) and feed steps 2/“app opened”/payment funnel.
- No client can read analytics; no raw client insert path; retention purge runs.
- Verified: migration applies cleanly (advisors 0 ERROR), `tsc` + build green,
  funnel renders against real/seed data.
