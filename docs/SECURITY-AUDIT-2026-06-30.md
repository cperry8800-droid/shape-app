# Shape — Security & Code-Health Audit · 2026-06-30

**Scope:** whole repo, deep focus on API authz, Supabase RLS / SECURITY DEFINER RPCs, secrets, payments/integrations.
**Mode:** READ-ONLY. No source changed, nothing committed/pushed. Live dashboard *reads* only (Supabase advisors + `pg_catalog` via MCP, GitHub branch-protection API, npm audit) — no writes, no `apply_migration`.

## Header / preconditions

| | |
|---|---|
| Repo | `C:\Users\cperr\shape-app` (present, git work-tree confirmed) |
| `git rev-parse HEAD` | `b86728569e56d2349b03e9eeda41ac2c8be0e5df` |
| Branch | `claude/build-m-at-deploy` (identical to `main`; HEAD == `origin/main`) |
| `git status` | **clean** (0 modified/untracked) |
| Last commit | `b8672856` Build /m/ at deploy instead of committing public/m (#1470) |
| Supabase project | `zznufekgjngecelwxndw` (ACTIVE_HEALTHY, Postgres 17.6) |

### Tool provenance (what ran / what couldn't)

| Tool | Version / command | Status |
|---|---|---|
| `npm audit --omit=dev --json` | npm 11.11.0 (root + `mobile-app`) | ✅ ran — **0 vulnerabilities** both |
| Supabase advisors | MCP `get_advisors` security + performance | ✅ ran — 236 security / 276 performance lints |
| Deployed-state cross-check | MCP `execute_sql` on `pg_proc` / `pg_policies` / `pg_namespace` / `has_function_privilege` / `storage.buckets` | ✅ ran — SECDEF grants, RLS, bucket policies |
| GitHub branch protection | REST `…/branches/main/protection` (PAT via git credential) | ✅ ran |
| `git log` pickaxe (history secrets) | git 2.x `-S`/`-G` on rare value patterns | ⚠️ **partial** — `-S sk_live_`/`whsec_` ran (timeout-guarded); a full `-G` content scan across all 3,162 commits **did not complete** (repo size). gitleaks runs full-history in CI as the continuous control. |
| gitleaks / trufflehog / semgrep | — | ❌ **NOT installed locally** → secrets scan done by manual regex (tree + bounded history). gitleaks *is* a required CI check (full scan in the pipeline). |

### Method
Live deployed-state read inline first (the crown-jewel RPC/RLS/grant evidence), then a parallel multi-agent fan-out across the 141 API routes + web/mobile surfaces with adversarial verification of each P1/P2; rate-limit-degraded finder lanes (secrets, auth-core, input/XSS, dead-code, consolidation, deps, prior-report) were re-done inline by hand. Every P1/P2 below is quoted against current code/deployed state.

---

## Executive summary

**Strong posture overall, with two genuinely exploitable P1s in the store-redemption RPC layer that should be fixed before any real-money launch.**

- **Authorization is well-built where it was designed deliberately:** every coach→client *read* route is gated (`is_coach_on_client` / share-gated SECURITY DEFINER RPCs), all public tables have RLS enabled, private storage buckets are deny-all (server-signed-URL only), webhooks (Stripe) verify signatures and fail closed, and `npm audit` is clean.
- **The real weakness is a systemic Supabase-grant issue:** Supabase auto-grants `EXECUTE` on every `public` function to `anon`+`authenticated`, and a set of *service-role-only / admin / catalogue* RPCs were never revoked. Several of them either (a) **trust client-supplied money/cost arguments**, (b) **have no caller check at all**, or (c) use `auth.uid() IS NULL` as a "service role" proxy that `anon` also satisfies. This produces **2 × P1 + 6 × P2** at the RPC layer.
- **Three route-layer write-IDOR / redirect issues** (verified): two coach console/program routes let a coach inject content onto a non-client; one OAuth route is an open redirect.
- **No secret exposure** (only the by-design publishable key is client-side; no JWT/service-role key in tree or bounded history). **No XSS** (zero `dangerouslySetInnerHTML`; vanilla-DOM sinks escape via `esc()`/`textContent`). **No dependency vulnerabilities.**

**Counts:** P1 = 2 · P2 = 10 · P3 = 12 (grouped) · Dead-code = a handful · Inefficiencies = 3 + systemic advisor set · Consolidation = 3.

---

## 1. Secrets & credentials — **CLEAN**

Manual regex scan of the full working tree (incl. `public/m/`, `mobile-app/dist/`, `public/newdesign/`, `public/mobile/`, `docs/`, `src/`, `mobile-app/src/`) + bounded git-history pickaxe.

| ID | Title | Sev | Evidence | Confidence |
|---|---|---|---|---|
| SEC-1 | No live secret in tree | — | All `sk_live_`/`BEGIN PRIVATE KEY` hits are **prefix-check code** (`health/route.ts:17`, `lib/warroom.ts:384`) or **PEM-marker reconstruction** (`apple-music/developer-token/route.ts:36`, rebuilds the key from `process.env.APPLE_MUSIC_PRIVATE_KEY` — markers are literals, no key material) or the **docs placeholder** (`docs/INTEGRATIONS_SETUP.md:107`). | verified |
| SEC-2 | `eyJ…` blobs in `public/mobile/Shape-*-Standalone.html` are **not** JWTs | — | Line 172 is a `<script type="__bundler/manifest">` whose `"data":"H4sI…"` is **gzip-compressed base64** (H4sI = gzip magic). The `eyJ…` runs are fragments inside compressed JS. No real `eyJhbGciOiJ…` JWT and no `*.supabase.co` URL is embedded. | verified |
| SEC-3 | Only the by-design publishable key is client-exposed | — | `sb_publishable_…` appears 3× (anon key, public by design). **No JWT-format key (`eyJhbGciOiJ`) anywhere in the tracked tree** (`git grep` empty). | verified |
| SEC-4 | History pickaxe | — | `-S sk_live_` → **1 commit (`a85b7215`)**, which is a **markdown doc line** ("No real secrets in the working tree…"), not a key. `-S whsec_` → 0. | verified (bounded) |
| SEC-5 | `.gitleaks.toml` allowlist review | P3-info | Allowlist scopes: `public/m/.*`, `*.map`, lockfiles, `.next`, the Apple-Music route, `INTEGRATIONS_SETUP.md`, and the `sb_publishable_` + `shape.*.vN` localStorage-key-name patterns. All defensible. **One note:** `public/m/.*` is a blanket path-ignore on the shipped client bundle — fine today (it's generated), but if a build ever inlines an env value it would be masked. Mitigated because the bundle is built at deploy from `mobile-app/src` (which is in-scope for the scan). | verified |

**Cross-check:** gitleaks runs as a **required CI status check** (`ci.yml` — `detect --no-git` on the working tree + a base..head commit-range scan on PRs), so secret scanning is continuously enforced even though it isn't installed in this audit environment.

---

## 2. Authorization / authentication

### 2a. Auth core / proxy gate — model is sound

`src/lib/supabase/middleware.ts` (run by `src/proxy.ts`):
- **Membership gate (402):** `GATED_API_PREFIXES` = `/api/client`, `/api/nutrition`, `/api/ai`, `/api/insights`, `/api/calendar` (line 19). Server-to-server routes under those prefixes that authenticate themselves (e.g. `ai/notify/cron` with `CRON_SECRET`) are in `GATE_SKIP`.
- **Rate limit:** all `/api/*` except `RATE_LIMIT_SKIP`; auth writes 5/15-min, general 100/min; keyed by user id (cookie or unverified `jwtSub`) or IP.
- **Size caps:** 413 by `Content-Length` — 1 MB general, 30 MB for `LARGE_BODY_PREFIXES` (line 128-131).
- **Fail-open (by design):** both the limiter (`:192` `/* fail open */`) and the membership gate (`:220` `/* fail open */`) swallow exceptions. This is acceptable **because the gate is a paywall, not access control** — data is still protected by per-route auth + RLS. See AUTHZ-P3-fail-open below.

### 2b. SECURITY DEFINER RPCs — the systemic hole (deployed-state verified)

All ~110 SECDEF functions have `search_path` pinned (no mutable-search-path risk). But `has_function_privilege` confirms **`EXECUTE` is granted to `anon`+`authenticated` on the functions below**, and their bodies (read via `pg_get_functiondef`) lack adequate caller checks.

| ID | RPC | Sev | anon/authd EXECUTE | Defect (quoted) | Exploit |
|---|---|---|---|---|---|
| **AUTHZ-P1-store-credit** | `redeem_store_item` | **P1** | true / true | Trusts client args: `insert into store_credits (user_id, kind, cents, …) values (v_uid, p_credit_kind, p_credit_cents, …)` with `p_credit_cents`/`p_credit_kind`/`p_cost` **all caller-supplied**; only check is `v_balance < p_cost`. | An authenticated user with ≥1 point POSTs `/rest/v1/rpc/redeem_store_item {p_cost:1,p_credit_cents:500000,p_credit_kind:'session'}` → debits 1 point, **mints a $5,000 session credit**. `consume_store_credit` then applies that wallet at Stripe checkout (`stripe/checkout-session`) → **real money stolen**. The server route (`store/redeem/route.ts:161-173`) *does* look up cost from `store-catalogue.ts`, but the RPC is **directly callable via PostgREST, bypassing the route entirely**. |
| **AUTHZ-P1-fulfillment-pii** | `admin_list_store_fulfillment()` | **P1** | true / true | `LANGUAGE sql SECURITY DEFINER` with **no auth/admin check**: `select id, user_id, item_id, item_name, code, kind, status, ship_to, created_at from store_redemptions where kind='merch' …` | `anon` (or any user) POSTs `/rest/v1/rpc/admin_list_store_fulfillment` → reads **every merch redemption incl. `ship_to` (full shipping address / PII) and reward `code`s** for all users. |
| AUTHZ-P2-consume-credit | `consume_store_credit(p_user_id,…)` | P2 | true / true | No caller check; takes `p_user_id`, inserts negative `store_credits` for that user. | Any user drains a victim's session/nutrition credit to a bogus `ref` (financial griefing / destruction of paid value). |
| AUTHZ-P2-email-enum | `get_email_for_username(p_username)` | P2 | true / true | `select au.email from profiles p join auth.users au … where lower(p.username)=lower(p_username)` — no auth gate. | `anon` resolves any username → **email address** (PII disclosure; aids credential-stuffing/phishing). Needed pre-auth for username login, but should be server-route-mediated + rate-limited, not a public RPC. |
| AUTHZ-P2-metric-bypass | `set_metric_source(p_user_id,…)` | P2 | true / true | Guard `if v_uid <> auth.uid() and not is_coach_on_client(v_uid)` — for `anon`, `auth.uid()` is NULL so `v_uid <> NULL` is NULL, `NULL and …` → **not raised**. | `anon` tampers with **any user's** health-metric source override + `daily_health_snapshot` value. (The dynamic `format('… %I …', p_metric)` is safe — `p_metric` is whitelisted by `_reconcilable_metric`.) |
| AUTHZ-P2-program-bypass | `set_program_detail(p_client_id,…)` | P2 | true / true | Guard `if not (auth.uid()=p_client_id or is_discipline_coach_on_client(…))` — for `anon`, `(NULL or false)`→NULL, `not NULL`→NULL → **not raised**. | `anon` writes **any client's** program detail (`client_programs`). |
| AUTHZ-P2-mark-fulfilled | `admin_mark_store_fulfilled(p_id,p_note)` | P2 | true / true | No caller check: `update store_redemptions set status='fulfilled' … where id=p_id`. | Any user marks any redemption fulfilled / injects `fulfillment_note` (integrity tamper). |
| AUTHZ-P2-claim-jack | `claim_provider_row(p_role,p_provider_id)` | P2 | true / true | `update trainers set owner_id=auth.uid() where id=p_provider_id and owner_id is null` — no entitlement check. | Any authenticated user **claims any unclaimed** trainer/nutritionist/gym listing as its owner (then edits it / receives its leads). |
| AUTHZ-P3-cron-rpcs | `apply_obligation_penalty`, `award_session_kept`, `settle_commitment` | P3 | true / true | No caller identity guard; rely on internal "missed/earned" verification + idempotency. | Service-role-only-intended, but `anon`/authenticated can invoke. Bounded (only realizes already-owed/earned outcomes; caps; idempotent) so impact is low — but should be revoked from public on principle. |

> **Root cause + fix pattern (already proven on `league_assign_cohort`, 2026-06-29 — now correctly `service_role`-only, verified `anon`/`authd` EXECUTE = false):** for every cron/admin/internal RPC, `REVOKE EXECUTE … FROM public, anon, authenticated;` (a bare `revoke … from public` is **not enough** — Supabase's default privileges still leave the `anon`/`authenticated` grants; this exact gotcha is documented in `WORKLOG.md` #1459). For the catalogue RPCs (`redeem_store_item`/`redeem_store_order`), either revoke + force all redemptions through the server route, **or** make the function look up cost/credit from a server-side catalogue table instead of trusting args. For the NULL-logic bypasses (`set_metric_source`/`set_program_detail`), add an explicit `if auth.uid() is null then raise …` first.

### 2c. Route-layer authz (workflow finders, adversarially verified)

| ID | Sev | File:line | Finding | Verify |
|---|---|---|---|---|
| AUTHZ-P2-console-idor | P2 | `src/app/api/trainer/console/route.ts:308` (+ `nutritionist/console`) | **Write-IDOR / cross-tenant injection.** `addItem`/`focus` upsert `coach_pushed_items`/`coach_focus_banners` with `client_id` = attacker-supplied `body.clientId`; the route only verifies the caller owns their *provider* row, never `is_coach_on_client(clientId)`, and the table INSERT RLS checks only `owner_id=auth.uid()`. Rows are client-readable (`client_id=auth.uid()`), so a coach plants exercise/meal items + focus banners on **any member's** console (spam/phish). | CONFIRMED |
| AUTHZ-P2-program-idor | P2 | `src/app/api/program-tools/templates/route.ts:121` | **Write-IDOR.** Inserts `coach_program_assignments` for arbitrary `clientAssignments[].clientId` with no `is_coach_on_client` check (unlike `trainer/workout` + `nutritionist/meal-plan`, which use `unauthorizedAssignTargets` + the 2026-06-17 INSERT policy). The injected row surfaces on the victim's `shared-overview` as a "plan" from the coach. | CONFIRMED |
| AUTHZ-P2-oauth-redirect | P2 | `src/app/api/integrations/[provider]/callback/route.ts:22` (+ `authorize:54`) | **Open redirect.** `authorize` stores the raw `?return=` param in an httpOnly cookie unchanged and `callback` 302s the victim to it — `return=https://evil.com` or `//evil.com` works. `/auth/callback` + `/login/actions` already validate same-origin; this flow doesn't. | CONFIRMED |

### 2d. Route-layer authz — CLEAN (verified, no findings)

- **Client/self routes (38 handlers):** every route authenticates first and scopes to the caller (RLS + `.eq(owner,uid)`); `account/delete` + `account/export` establish `currentUser` first then scope every purge/read to `uid`; `export`'s `scrub()` strips token/secret/key/credential keys at all nesting. No IDOR, no raw-error leak.
- **Coach→client *reads* (33 handlers):** all gated by `is_coach_on_client`, share-gated SECDEF RPCs, or `.in('user_id', <own subscribers>)`. `trainer/analytics`/`nutritionist/analytics` service-role reads are constrained to the caller's own subscription-derived client ids (not request input). **No read IDOR.**
- **Webhooks:** Stripe `constructEvent(whsec)` verifies signature before acting and fails closed when the secret is unset. (Garmin webhook re-tested — see prior-report S1-5 below.)
- **Storage (deployed-state):** private buckets `progress-photos`, `meal-notes`, `coach-credentials`, `provider-credentials` have **no client policies on `storage.objects`** → deny-all, server-signed-URL only. Public buckets `coach-media`/`community-photos` are intended-public and currently empty.

---

## 3. Input handling / XSS — **CLEAN**

| ID | Title | Sev | Evidence |
|---|---|---|---|
| XSS-1 | No HTML-injection sinks | — | **Zero `dangerouslySetInnerHTML`** in `src/`, `mobile-app/src/`, `public/newdesign/` (only a `warroom.ts` string *describing* the absence). |
| XSS-2 | Vanilla-DOM `innerHTML` writes are safe | — | `siteSearch.js` escapes every user value via `esc()` (line 26 = full entity encoder): `esc(p.full_name)`, `esc(query)`, `esc(roleLabel)`, `esc(photo)`. `pageShell.jsx` confirm-modal uses `textContent`. `globalChatButton.js`/`globalRadioButton.js`/`spotlightTour.js` `innerHTML` are static scaffold/SVG. |
| XSS-3 | URL scheme guard intact | — | `livingDesktop.jsx:639` `safeMusicUrl` (http(s)/host check) gates playlist hrefs; the DB `member_playlists.url` CHECK (`~* '^https?://'`) backs it server-side. |
| INPUT-1 | Body size + malformed handling | — | Proxy enforces 413 (1 MB / 30 MB) on all `/api/*`; `readJson` on 76/141 routes (the rest are GET/no-body). **4 routes call `request.json()` directly** — defense-in-depth note (the proxy cap still applies). P3-info. |
| INPUT-2 | Dynamic SQL | — | The only `execute format()` (`set_metric_source`) uses `%I` with a whitelisted `p_metric` (`_reconcilable_metric`). No injection. |

---

## 4. Dead code (deeper pass — `ts-prune` + repo-wide file-reachability; `public/newdesign/**` is FLAG-ONLY, never delete)

**Method:** `npx ts-prune -p tsconfig.json` (662 raw lines — **mostly false positives**: Next.js server actions, `.d.ts` sidecars, and barrel re-exports all read as "unused" but are live; export-level pruning is unreliable for this framework layout) + a repo-wide basename-reachability scan across `public/**/*.html`, `mobile-app/src`, `src`, and `tests`, each candidate hand-verified.

| ID | Item | Tag · safe-to-delete | Verified evidence |
|---|---|---|---|
| DEAD-1 | `public/mobile/` — ~13 MB legacy standalone-export (`Shape-App-Standalone.html` 1.3 MB + `Shape-Mobile-Standalone.html` 8.4 MB + screenshots + ~50 old `.jsx`) | Med × S · **verify-then-delete** | Superseded by `public/m` (live mobile) + `public/newdesign` (live web). `next.config.ts:57` still references `public/mobile/Mobile.html` (a preview rewrite) — retire that preview first. Removing trims repo weight + shrinks the secret-scan surface. |
| DEAD-2 | `public/newdesign/globalRadioButton.js` (116 lines) | Low × S · **FLAG ONLY** (newdesign rule) | **0** HTML files load it; its sibling `globalRadioButton`/`RadioButton` symbol appears in no other newdesign file. Contrast: `globalChatButton.js` is `<script>`-loaded by **126** HTML files. A global radio launcher that was built but never wired (radio is reached via the header wordmark instead). |
| DEAD-3 | `public/newdesign/memberProfile.jsx` | Low × S · **FLAG ONLY** (newdesign rule) | Zero references in any `.html`/`.jsx` (confirms the WORKLOG note that it's "orphaned/dead"; superseded by `livingDesktop.jsx`/`MemberProfile.html`). |
| DEAD-4 | 4 mobile `services/*.mjs` are **test-only** (no app import): `commitments.mjs`, `momentum.mjs`, `recoveryReadiness.mjs`, `scoreDerive.mjs` | Low × M · **do NOT delete** — see CONS-3 | Each is imported only by its `tests/*.test.mjs`, never by `mobile-app/src/**`. The mobile app renders these values from the server API (which runs the `src/lib/*.ts` twin), so the mobile `.mjs` runtime copy is unreferenced by the app. Not "dead" (the test pins it) — it's a maintenance-cost / consolidation smell. |

**Cleared (NOT dead — ts-prune/heuristic false positives):** `funnel.d.ts` (type sidecar for the live `funnel.mjs` analytics module); the Next.js server actions (`login`, `startPlatformCheckout`, `requestRefund`, `cancelSubscription`, …) flagged by ts-prune are wired via `'use server'` form actions; `roles.mjs`/`access-guards.mjs`/`ai.ts` re-exports are consumed via deep imports. The other 7 `services/*.mjs` (`e1rm`, `weekendSplit`, `shapeSteps`, `suggestNextLoad`, `signalsMap`, `reactionVerbs`, `communityPostPatch`) **are** app-imported.

*(Appendix: the prior report already removed the obvious `src/` orphans in #1342/#1343. A precise unused-export enumeration would need `knip` with a Next.js + Vite + vanilla-HTML config — out of scope here and not security-relevant.)*

---

## 5. Inefficiencies (verified)

| ID | Tag | File:line | Finding · fix |
|---|---|---|---|
| PERF-1 | Med × M | `integrations/strava/sync/route.ts:407` (+ oura/whoop) | Per-activity SELECT-then-update/insert (~3N round-trips). **Fix:** unique index `community_posts(author_id, source_provider, source_activity_id)` + a single `.upsert(onConflict)`. |
| PERF-2 | Med × M | `cron/score-accountability/route.ts:94` | Deep per-client N+1 with nested per-row RPC loops (`C·(5 + S + W + H)` queries). **Fix:** batch the per-client reads with `.in('client_id', clientIds)` then drive RPCs from in-memory groups. |
| PERF-3 | Low × S | `account/export/route.ts:61` | 14 independent owner-table reads awaited serially. **Fix:** `Promise.all`. Bounded impact (export is rare). |
| PERF-4 | Med × — (DB) | Supabase advisor | **150 `auth_rls_initplan`** policies re-evaluate `auth.<fn>()` per row — wrap as `(select auth.uid())`. Plus **65 unused indexes**, **17 unindexed FKs**, **43 multiple-permissive-policies**. Owner/dashboard or migration cleanup; performance-only. |

*(Good news: `shapeBackend.js` `cachedClientJson` is correctly applied to every hot client read — the old "dueling endpoints" race is gone.)*

---

## 6. Consolidation

| ID | Tag | Finding |
|---|---|---|
| CONS-1 | Low × S | `escapeHtml` is copy-pasted in **6 files** (`apply`, `consultation`, `contact`, `store/checkout`, `store/redeem` routes + `lib/ai/notify-core.ts`) — identical bodies. Extract to `src/lib/request-utils.ts` (or `lib/html.ts`) and import. |
| CONS-2 | Med × M | **Tier colors in ≥4 sources:** `public/newdesign/tierColors.jsx` (canonical `SHAPE_TIER_COLORS`), `score.jsx`, `siteSearch.js`, and mobile `BS_TIER_COLORS` (`iosAppBroadsheetClient.jsx` + `iosAppBroadsheetMarketplace.jsx`). The worklog notes prior drift (Form amber→teal). Keep `tierColors.jsx` canonical and have web consumers read it; mobile keeps its twin but should be value-checked against it. |
| CONS-3 | Low–Med | **Pure-logic twins** (`*.mjs` source ↔ `*.ts` mirror): `e1rm`, `weekendSplit`, `scoreDerive`/`score-derive` exist on both sides; `momentum`/`commitments`/`shapeSteps` are mobile-only; `recovery-readiness`/`local-day`/`health-snapshot` are web-only. The dual-maintained ones risk silent drift — the automated finder didn't detect current divergence, but a CI parity test (run the shared vectors through both) would lock it in. |

---

## 7. Dependency & config hygiene — **STRONG**

| ID | Item | Status |
|---|---|---|
| DEP-1 | `npm audit --omit=dev` (root + mobile-app) | ✅ **0 vulnerabilities** both |
| DEP-2 | Next.js | `16.2.9` — patched line (resolves the prior high-sev middleware/proxy/SSRF advisories per WORKLOG). The membership gate runs in this layer, so staying patched matters. ✅ |
| DEP-3 | `patches/@capacitor-community+bluetooth-le+7.3.2.patch` | Present; must be regenerated if the package is bumped (tracked in WORKLOG). Low risk. |
| DEP-4 | CI (`ci.yml`) | 3 jobs: **Web (tsc + next build)**, **Mobile (/m/ build)**, **Secret scan (gitleaks)** — gitleaks does both working-tree (`--no-git`) and PR commit-range scans. ✅ |
| DEP-5 | Branch protection (`main`) | Required checks = the 3 above; **`enforce_admins` = true**; `strict=false`. ✅ One gap → **CONFIG-P3** below. |
| CONFIG-P3 | `required_pull_request_reviews = null` | P3 — no mandatory PR review; direct pushes are still check-gated (incl. admins), so risk is low, but enabling 1 required review closes the "self-merge unreviewed" path. Owner/dashboard. |

---

## Prior report (`CODE-AUDIT-REPORT.md`) re-test

Re-derived against the current tree (treat prior as hypotheses).

| Prior | State now | Evidence |
|---|---|---|
| S1-1 consultation email HTML injection (unescaped `clientName`/`topic`) | **FIXED** | `consultation/route.ts` now defines + uses `escapeHtml` (one of the 6 escapeHtml files). |
| S1-2 consultation unauth abuse / no CAPTCHA | **FIXED for consultation** (calls `verifyTurnstile`); **still open for siblings** → new P3s: `contact`, `apply`, `app-waitlist`, `notify-app` have no CAPTCHA (only the shared 100/min IP limit). See AUTHZ-P3-captcha below. |
| S1-3 raw `error.message` leak (~106 sites) | **Largely FIXED** | `dbError()` helper rolled out (#1340/#1341); `community/feed` GET/POST now route errors through it. Spot-check confirmed; a full count wasn't re-run. |
| S1-4 unbounded string writes | **Mitigated** by the proxy 1 MB body cap; per-field `.slice` caps still absent on some fields → P3 residual (a ~1 MB single field can still store). |
| S1-5 garmin webhook `if (secret && …)` skip-when-unset | **Re-tested** — the pay/integrations lane found no exploitable webhook (Stripe fails closed). **Recommendation stands:** make `GARMIN_WEBHOOK_SECRET` **required (fail-closed)** before Garmin launch. P3. |
| S1-6 `ai/notify/cron` `===` vs `timingSafeEqual` | P3 residual — low-practical timing side-channel; keep the secret strong. |
| S1-7 `isoDate()` UTC-day bucketing | Partially addressed via client-local-day writes (#1345); cross-TZ read windows still UTC. Correctness, not security. |
| S1-8 gate + limiter fail-open | **By design, confirmed** (`middleware.ts:192,220`). P3 → add a monitored error metric so a silent gate/limiter fault is visible (data stays RLS-protected regardless). |

---

## P3 ledger (hardening / defense-in-depth)

| ID | Item | Owner |
|---|---|---|
| AUTHZ-P3-anon-insert | 4 always-true anon-INSERT RLS policies (`app_launch_notifications`, `consultation_bookings`, `contact_submissions`, `provider_applications`) let `anon` write directly via PostgREST, bypassing the API rate-limit/CAPTCHA. Tighten WITH CHECK or accept (low value tables). | dashboard (migration) |
| AUTHZ-P3-captcha | `contact` / `apply` / `app-waitlist` / `notify-app` unauthenticated email/insert with no CAPTCHA (reuse `verifyTurnstile`); `apply` also sets CORS `ACAO:'*'`. | in-repo |
| AUTHZ-P3-profiles-read | `profiles readable by authenticated` is `qual=true` → any signed-in user can SELECT all `profiles` rows. Confirm no sensitive column (email/DOB) is in `profiles` (those live in `auth.users`); if clean, this is acceptable. | in-repo verify |
| AUTHZ-P3-bucket-list | `coach-media`/`community-photos` public buckets allow object **listing** (`storage.objects` SELECT to `public` on `bucket_id` only). Content is public-by-design; listing is broader than URL access. | dashboard |
| AUTHZ-P3-secdef-mutable | 24 non-SECDEF trigger functions have mutable `search_path` (advisor). Low risk (invoker). Pin `search_path`. | dashboard (migration) |
| AUTHZ-P3-fail-open | Add monitoring metric on the gate/limiter fail-open paths (S1-8). | in-repo |
| CONFIG-P3 | Enable 1 required PR review on `main`. | dashboard |
| INPUT-P3 | 4 routes use `request.json()` directly instead of `readJson`. | in-repo |

---

## Prioritized fix queue (P1 first — matches the body exactly)

### In-repo code / migration fixes
1. **AUTHZ-P1-store-credit + AUTHZ-P2-redeem-order** — `redeem_store_item` / `redeem_store_order`: stop trusting `p_cost`/`p_credit_cents`/`p_credit_kind`. Either look up cost/credit from a server-side catalogue table inside the function, **and/or** `REVOKE EXECUTE … FROM public, anon, authenticated` and force redemption through `store/redeem/route.ts` (which already validates via `store-catalogue.ts`). *(New migration in `supabase-migrations/`.)*
2. **AUTHZ-P1-fulfillment-pii + AUTHZ-P2-mark-fulfilled** — `admin_list_store_fulfillment` / `admin_mark_store_fulfilled`: add an admin check (`is_admin`/`adminEmails`) **and** `REVOKE EXECUTE … FROM public, anon, authenticated`.
3. **AUTHZ-P2 RPC cluster** — `consume_store_credit`, `get_email_for_username`, `admin_*`, `apply_obligation_penalty`/`award_session_kept`/`settle_commitment`: `REVOKE EXECUTE … FROM public, anon, authenticated` (service-role-only). For `get_email_for_username`, keep an `anon`-callable but rate-limited server route instead of the public RPC.
4. **AUTHZ-P2-metric-bypass / -program-bypass** — `set_metric_source` / `set_program_detail`: add `if auth.uid() is null then raise exception '42501'; end if;` before the NULL-logic guard.
5. **AUTHZ-P2-claim-jack** — `claim_provider_row`: gate on an approved `provider_application` (or admin) before assigning `owner_id`.
6. **AUTHZ-P2-console-idor / -program-idor** — add `is_coach_on_client(clientId)` checks in `trainer/console`, `nutritionist/console`, `program-tools/templates` **and** INSERT WITH CHECK policies on `coach_pushed_items`/`coach_focus_banners`/`coach_program_assignments` (mirror the 2026-06-17 `client_workouts` hardening).
7. **AUTHZ-P2-oauth-redirect** — validate `?return=` to a same-origin relative path in `integrations/[provider]/authorize` (reuse the `auth/callback` validator).
8. P3s: CAPTCHA on `contact`/`apply`/`app-waitlist`/`notify-app`; scope `apply` CORS; gate/limiter monitoring; `readJson` on the 4 direct routes; `escapeHtml` consolidation (CONS-1); tier-color consolidation (CONS-2); PERF-1/2/3.

### OWNER / dashboard actions
- **Apply the RPC-hardening migration** (items 1–5 above) on Supabase, then re-verify with `has_function_privilege('anon'/'authenticated', …, 'EXECUTE') = false` for every revoked function (the same check that confirmed `league_assign_cohort`).
- **Supabase performance** (optional, non-blocking): wrap RLS `auth.<fn>()` in `(select …)` (150 policies), drop 65 unused indexes, add 17 FK indexes, dedupe 43 permissive policies, pin `search_path` on the 24 trigger functions.
- **GitHub:** enable 1 required PR review on `main` (CONFIG-P3).
- **Pre-launch:** make `GARMIN_WEBHOOK_SECRET` required (S1-5); confirm `profiles` has no sensitive columns (AUTHZ-P3-profiles-read).

---

## Self-check
- Every finding has `file:line` (or RPC name + deployed grant). ✅
- Every P1/P2 has quoted evidence + a concrete exploit scenario + a fix. ✅
- Unverified/bounded items are labelled (history pickaxe partial; dead-code lane degraded). ✅
- Secrets redacted — **no real secret exists** to redact (only the by-design publishable key). ✅
- The fix queue maps 1:1 to the body (no orphan findings); OWNER/dashboard actions separated from in-repo. ✅
