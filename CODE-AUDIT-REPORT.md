# Shape — Code Health Audit

Read-only triage, run as a sequence of per-area sessions. **No source code is changed
in any session** — this file is the only artifact. Fixes are approved separately.

- Base commit: `2b9a385` (`main` == dev branch, verified fresh at audit start).
- Severity: **P0** (breakage/active security hole) → **P1** (high) → **P2** (should fix)
  → **P3** (nit/hardening). Effort: **S** (≤30 min) / **M** (hours) / **L** (day+).
- Sessions: **S1** API routes & data access + secrets · S2 mobile-app/src · S3 engine &
  shared lib · S4 web UI · S5 cross-cutting + consolidation.

---

## S1 — API routes & data access + repo-wide secrets scan

**Scope:** `src/app/api/**` (122 route files), the shared auth/data infra
(`src/lib/supabase/middleware.ts`, `request-auth.ts`, `request-utils.ts`,
`supabase/admin.ts`, `ai/server.ts`, `membership-core.ts`), Supabase RLS/`is_coach_on_client`
gating, and a repo-wide + full-git-history secrets scan (item 7).

**Method:** read the shared gate/auth/admin infra directly; three parallel read-only
sub-audits (service-role usage · coach→client authz/IDOR · input-validation/errors),
every reported finding spot-verified against real code before listing here; manual
regex secrets scan of working tree + full history (no `gitleaks`/`trufflehog` available).

**Headline:** No **P0/P1 data-breach** finding. Authorization is strong — **19/19
coach→client routes correctly gated (zero IDOR)**, **20/21 service-role routes scoped to
the authenticated user**, OpenAI access is consolidated, and **secrets are clean in tree
and history**. The real issues are an **unauthenticated abuse/injection vector on
`consultation`** and two **systemic, mechanical** hygiene problems (raw DB-error leakage;
unbounded string writes), plus a few P3 hardening + correctness items.

### S1 triage table (worst-first)

| ID | Sev | Eff | Location | What's wrong | Why it matters |
|----|-----|-----|----------|--------------|----------------|
| S1-1 | P2 | S | `src/app/api/consultation/route.ts:188-217` | Outbound email HTML interpolates **attacker-supplied, unauthenticated** `clientName` / `topic` / `clientEmail` (and coach `provider.name`) with **no HTML-escaping** (`<h2>You're booked with ${provider.name}</h2>`, `<em>Topic:</em> ${topic}`). Sibling `apply/route.ts` has an `escapeHtml()` it doesn't reuse here. | HTML/link **injection into the coach's + admin's inboxes** from a public endpoint → phishing content sent from Shape's own domain. |
| S1-2 | P2 | M | `src/app/api/consultation/route.ts:38-128, 219-244` | Fully **unauthenticated** route does a **service-role** insert into `sessions` and fires 3 emails, all driven by request body. No CAPTCHA / proof-of-human / email confirmation. | Abuse: **email-bomb** a victim (attacker supplies their email as `clientEmail`), spam a coach's session requests, occupy slots. Mitigated only by the proxy 100/min/IP rate limit. |
| S1-3 | P2 | S→M | Systemic — see list below | **Raw DB error leakage**: ~106 sites across ~56 route files return `error.message` (or interpolate it) to the client, contrary to the documented convention (generic message + server-side log); most don't log. Public-reachable slice: `community/feed/route.ts:40` (anonymous GET). | Information disclosure (table/column/RLS-policy names) + convention drift. One shared `dbError()` helper collapses all of them. |
| S1-4 | P2 | S | Systemic — see list below | **Unbounded string writes**: chat / comment / community-post / habit bodies validated with `.trim()` only, no length cap. | Bounded only by the proxy's **1 MB** general body cap → a ~1 MB chat message/comment can still be stored. Storage/abuse. Add per-field `.slice(max)`. |
| S1-5 | P3 | S | `src/app/api/integrations/garmin/webhook/route.ts:65-67` | The `?token=` guard is `if (secret && …)` — **skipped entirely when `GARMIN_WEBHOOK_SECRET` is unset**, leaving the endpoint unauthenticated. | Health-data spoofing into `daily_health_snapshot`/`activities` for already-linked Garmin users. Make the secret **required (fail-closed)** before Garmin launch. |
| S1-6 | P3 | S | `src/app/api/ai/notify/cron/route.ts:27-33` | Shared-secret compared with plain `===` (not `crypto.timingSafeEqual`). Correctly **fail-closed** when unset. The route fans out **service-role notification delivery to the whole active user base** behind this single secret. | Low-practical-risk timing side-channel; the single-secret fan-out means the secret must be strong + the route kept off public exposure. |
| S1-7 | P3 | M | `src/lib/health-snapshot.ts:45-49` | `isoDate()` = `date.toISOString().slice(0,10)` — UTC day slice. Device activities/sleep near **local midnight bucket to the wrong calendar day** in the snapshot (used by garmin/whoop/oura/apple-health syncs). | Cross-timezone correctness for all device-data day attribution. Known v1 simplification (also flagged in `consultation/route.ts:74-77`); proper fix needs per-user TZ. |
| S1-8 | P3 | S | `src/lib/supabase/middleware.ts:217-219` & `:189-191` | The **membership gate** and the **rate limiter** both **fail OPEN** on exception (documented availability-over-security tradeoff). | On a membership-gate fault, non-members reach paid routes (DATA is still protected by per-route auth + RLS — the gate is a paywall, not access control). On a limiter fault, brute-force protection silently drops. Add a monitored error metric so a silent fault is visible. |

#### S1-3 raw `error.message` leak — representative occurrences (one `dbError()` fix)
- **Public/anon-reachable (do first):** `community/feed/route.ts:40` (GET), `:92` (POST).
- High-count authenticated routes: `client/habits/route.ts` (`:30,44,84,105,123,139,156,185`),
  `messages/direct/route.ts:32,47,87,106`, `conversations/[id]/messages/route.ts:42,68`,
  `calendar/route.ts:320,357,375`, `coach/plans` · `coach/soundtracks` · `coach/grocery-lists`
  (4× each), `trainer/console` / `nutritionist/console` (3-4× each),
  `store/redeem/route.ts:163-167` (raw RPC error on the non-`insufficient_points` branch),
  plus the bulk client routes (`nutrition/meal-log`, `client/checkin`, `client/checkin-kit`,
  `client/score`, `client/activities`, `client/team`, `client/grocery`, `client/planned-meals`,
  `client/progress-photos`) and `insights/correlations:64`, `ai/weekly-readout:244`,
  `ai/notify/cron:45`. Also raw-interpolated: `integrations/apple-music/connect:67`,
  `client/progress-photos:68`. (Full list in the sub-audit; ~106 total.)

#### S1-4 unbounded write — confirmed sites
- `conversations/[id]/messages/route.ts:60` (`body.body.trim()`, no `.slice`)
- `community/feed/[postId]/comments/route.ts:19` (`String(...).trim()`)
- `messages/direct/route.ts:69`
- `community/feed/route.ts:79-87` (`title`/`note`/`activity_type`/`source_*`, trim-only)
- `client/habits/route.ts` body fields

### Secrets & credentials (item 7) — verdict: **CLEAN**, one process gap

- **No real secrets in the working tree** (regex scan for `sk-…`/`sk_live_…`/`sb_secret_…`/
  `whsec_…`/`AIza…`/private-key blocks/`service_role` JWTs): only matches are placeholders
  in `.env.example` (`SUPABASE_SERVICE_ROLE_KEY=eyJ...`, `whsec_...`) and doc text.
- **No real secrets in git history** (manual `git log -G` over the full history for the
  same patterns): the 3 matching commits are all the `.env.example` placeholder / a
  `-----BEGIN PRIVATE KEY-----\n...` example in a docs table — no live secret ever committed.
- **No tracked `.env` files** beyond `.env.example` (×3, placeholders); `.gitignore` excludes
  `.env*` (allows `!.env.example`) and `*.pem`. ✓
- **Client/public exposure is by-design only:** `public/supabase.js:9` ships the **publishable**
  key `sb_publishable_…` (RLS-protected, meant to be public); `NEXT_PUBLIC_*` is limited to
  `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SITE_URL` — all appropriate. The service-role key is
  only read server-side (`src/lib/supabase/admin.ts`).
- **Gap (S1-SEC-1, P3/S):** `gitleaks`/`trufflehog` are **not installed**, so the
  verified/entropy deep scan the gate calls for couldn't be run, and GitHub
  secret-scanning/push-protection settings can't be confirmed from here. **Recommend:** add a
  `gitleaks detect` CI step + confirm GitHub Advanced Security push protection is enabled.
  (No evidence of any leaked secret — this is a missing safety-net, not an exposure.)

### Verified-clean / non-findings (coverage notes for S5)

- **IDOR / coach→client authz — ZERO findings.** 19 routes audited incl. all new AI routes,
  `clients/[id]/*`, `trainer/nutritionist console`, `meal-plan`, `workout`, `me/shared-clients/*`,
  `conversations/[id]/messages`, `community/feed/[postId]/*`. Each enforces explicit
  `is_coach_on_client` / `is_discipline_coach_on_client` / ownership, or verified-sufficient RLS.
  The `freeze_client_*_keys` triggers close the UPDATE-reassign bypass; `trainer/workout`
  validates the **full** `clientIds` batch.
- **Service-role usage — 20/21 gated-OK.** Every user-data admin write is bound to the
  authenticated `user.id` (storage paths, `.eq('owner_id'/'user_id', user.id)`, ownership →403,
  or signature/secret-verified webhook). The 2 cross-user service-role *reads*
  (`trainer/analytics`, `garmin/webhook`) are scoped through a prior trusted link. Only
  `consultation` (S1-1/S1-2) is the exception.
- **OpenAI consolidation (item 4) — done.** No inlined OpenAI fetch/key-check exists outside
  `src/lib/ai.ts`; AI routes import the shared helper. (The 3 grep hits are a health-check env
  flag, a comment, and the War Room env display.)
- **Input parsing is solid** where it counts: `availability:17`, `ai/audit:17-18`,
  `leaderboard:27` (clamped 1–200), `insights/correlations:31-35` (clamped 7–180). Public write
  routes (`apply`/`contact`/`intake`/`app-waitlist`/`notify-app`) uniformly use
  `readJson` + `cleanText` + `isEmail`. Only 2 `await request.json()` direct uses — both
  secret-gated webhooks (`push/dispatch`, `garmin/webhook`).
- No `console.log` / `TODO` / `FIXME` / `debugger` / `as any` found in route handlers.
- Proxy gate (`middleware.ts`) verifies Bearer via `getUser(token)` (not an unverified parse),
  enforces size + two-tier rate limits + the membership paywall; `apply/route.ts` already
  escapes its email HTML (the pattern `consultation` should copy for S1-1).

**S1 bottom line:** the single highest-value S1 fix is **`consultation` (S1-1 + S1-2)** —
the only unauthenticated, service-role, externally-abusable surface. After that, the two
**mechanical sweeps** (a shared `dbError()` helper for S1-3; `.slice()` caps for S1-4) clean
up the bulk of the convention drift in one pass each.
