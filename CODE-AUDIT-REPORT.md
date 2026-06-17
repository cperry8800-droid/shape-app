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

---

## S2 — Mobile app (`mobile-app/src`)

**Scope:** the Capacitor/Vite SPA — `broadsheet/*` (client 19.5k lines, pros 6.2k, chrome/
calendar/habits/marketplace/radio/widgets/providerApply), `services/*` (`shapeBackend.js`
4.7k data layer, `shapeSignals.js`/`signalsMap.mjs`, `hrm.js`, `push.js`, `healthkit.js`),
`main.jsx`, demo data. **Method:** read shared infra + bundle-secrets scan directly; four
parallel read-only sub-audits (data layer · client UI · pros+services · remaining broadsheet);
every P1 and the key P2s spot-verified against real code.

**Headline:** **Mobile security is clean** — no secret literals, anon-key-only client, **no
service-role anywhere client-side**, `addChannelMember` is RLS-host-gated (verified), coach
write actions defer to server RPCs that gate on `is_coach_on_client`, and the signals mappers
correctly skip missing inputs (no fabricated signals). The real issues are **demo-data leaks
into signed-in views** (the roadmap's stated worst failure mode), one **broken coach feature**
(clobbered global), a **weigh-in unit inconsistency** that can corrupt goal projection, and a
large amount of **dead/unreachable code**. Demo-vs-live gating is otherwise disciplined and
effect/listener cleanup is consistently correct.

### S2 triage table (worst-first)

| ID | Sev | Eff | Location | What's wrong | Why it matters |
|----|-----|-----|----------|--------------|----------------|
| S2-1 | P1 | M | `broadsheet/iosAppBroadsheetClient.jsx` `DAY_MACROS` L2203-2211; caption L2255-2257; `BS_CARD_DEFAULTS` L534 | Home **Energy card** uses hardcoded demo macros; on any **non-today** day a signed-in user gets `energyCaption = ${macros.note} ${energy.tail}` → fabricated kcal balance + coach notes ("Refeed Friday. +100 over target…"). The sibling "Weekly totals" block guards `if (bsHomeSignedIn) return null` (L2747); Energy doesn't. | **Demo data shown as real to a signed-in user** — the roadmap's #1 failure mode ("no fake numbers for signed-in users"). |
| S2-2 | P1 | S→M | `…Client.jsx:1521-1523, 1535, 1604` (dup constants at `:3477-3479`) | Meal logger shows fabricated "day so far" totals (`DAY_BASE_CAL=1568, DAY_BASE_P=118; dayCal = DAY_BASE_CAL + kcal`) to every signed-in user, and sends a **hardcoded `mealTitle: 'Chicken bowl + rice'`** to the coach (L1535) + hardcoded header (L1604) regardless of the real meal. | Fabricated totals (demo-leak) **and a data-integrity bug**: the coach receives the wrong meal title for every logged note. |
| S2-3 | P1 | S | `services/shapeBackend.js:3232` then `:3447` | `window.ShapePlaylists` is assigned twice; the second (member playlists) **clobbers** the trainer-playlist methods (`listTrainerPlaylists`/`createTrainerPlaylist`). Pros calls them via `window.ShapePlaylists?.listTrainerPlaylists?.()` (`iosAppBroadsheetPros.jsx:3845`) / `?.createTrainerPlaylist?.()` (`:3919`) → the `?.` silently no-ops. | **Coach trainer-playlist load + create are broken** (fail silently). Fix: merge the two objects. |
| S2-4 | P2 | M | `services/shapeBackend.js:3679` vs `services/signalsMap.mjs:35` & `:121` | Weigh-in **unit inconsistency**: `ShapeWeighIns.list` maps `{ kg: Number(r.weight), unit: r.unit \|\| 'kg' }` (field misnamed `kg`; defaults **kg**) while `normalizeWeighIns` defaults **`'lb'`**, and the goal target also defaults `'lb'`. A null-unit series can disagree with the goal unit; weight is never converted. | Feeds the engine's `projectGoal`/`goalSlipDays` → **silently wrong to-go / pace / ETA**. Cross-cuts **S3**. |
| S2-5 | P2 | M | `services/shapeBackend.js:3907-3924` (`getUserAvatars`/`_avatarCache`) | Negative results cached permanently (`_avatarCache[id]=null`; `need = list.filter(id => !(id in cache))` treats `null` as known) → avatars never re-fetch until reload; **no in-flight dedupe** → duplicate `get_public_profile` RPC fan-out across concurrent feed renders. | Stale avatars + duplicate RPC load. Contrast the in-flight-promise cache used by `cachedClientJson`. |
| S2-6 | P2 | S | `…Client.jsx:11378-11388, 11049-11050` | A signed-in account with **zero** community posts/presence falls back to demo (`COMMUNITY_ACTIVITIES`, `TRAINING_NOW`, `liftingNow = … : 2104`) instead of an empty state. | Demo-leak on empty live accounts. *Partly intentional* per WORKLOG (social feed "still illustrative"), but the gating is inconsistent with the rest of the app. |
| S2-7 | P2 | M | `services/shapeBackend.js:~2989-2992` (`cachedClientJson`/`getJsonOrDefault`) | A failed/empty fetch resolves to `null` and is **cached for the full 60s TTL** — every reader gets `null` for a minute after the backend recovers. TTL/uid-keying are otherwise correct. | Transient backend blips persist as "no data" for 60s across all surfaces sharing the cache. |
| S2-8 | P2 | S | `broadsheet/iosAppBroadsheetProviderApply.jsx:350` | `color: t.INK60` — the palette (`iosAppBroadsheet.jsx:92-95,137`) defines only `INK85/70/50/30`, **no `INK60`** → `undefined` → inherited color on the application result screen. | Theme-token bug; misreads on dark papers. Fix: `t.INK50`/`t.INK70`. |
| S2-9 | P2 | S | `broadsheet/iosAppBroadsheetPros.jsx:~5904-5928` (`BSProConsoleScreen`) | Console `load()` falls back to `BS_CONSOLE_SAMPLE(role)` when a **signed-in** coach has 0 clients → demo roster cast. (Contrast `useBSProRoster` L1671-1674 which correctly returns `[]`.) | Demo-leak — **mitigated only because the Console screen is currently unreachable** (dead, see S2-DEAD). |
| S2-10 | P3 | S | client `:13987,:13099`; backend `:3680,:3687,:2054`; `signalsMap.mjs` | **UTC vs local date basis** is inconsistent: weigh-in/snapshot "today" uses `new Date().toISOString().slice(0,10)` (UTC) while week/check-in math uses local `getDay()/getDate()`. Near midnight / far from UTC they disagree. | Same class as **S1-7**; a weigh-in can land on a different calendar day than the check-in for the same moment. |
| S2-11 | P3 | S | `services/shapeBackend.js:~936` (`toBookingDate`) | Hardcoded year `return \`2026-${monthIndex}…\`` + month default `\|\| '04'`; `scheduledAtFromSlot` builds `T${time}:00` with no TZ offset. | Latent: consultation/session booking dates break (wrong year/month) after 2026; ambiguous timezone. |
| S2-12 | P3 | S | `…Habits.jsx:16` (`_bsHabitsToday='2026-05-14'`), used L277,313,342,346 + toggle | Habits page anchors "today"/streak/completion (and writes toggles) to a hardcoded date for signed-in users. | Latent live-tracking correctness landmine — confirm signed-in completion isn't persisted under the fake date (vs the real `/api/client/habits` toggle). |
| S2-13 | P3 | S | `services/shapeBackend.js:382` | `supabase.rpc('award_tier_bonuses')` is fire-and-forget with **no `.catch`** (the surrounding `try` can't catch the async rejection). | Unhandled promise rejection on a bonus-grant; sibling fire-and-forgets all catch internally. |
| S2-14 | P3 | S | `main.jsx`→`iosAppBroadsheetMain.jsx:1603-1625` | `setInterval(tryLoad, 1500)` in `BSApp` polls forever to detect login + load appearance; never cleared (cheap no-op after resolve, but perpetual). | An auth-change subscription would replace perpetual polling. |
| S2-15 | P3 | S | various | Misc: missing `t` in deps → stale accent on theme switch (`Calendar.jsx:264-272` `loadMonth`; `Pros.jsx:1661-1670` `useBSProRoster`); missing `setTimeout` cleanup (`Client.jsx:9753-9755`); `bsLongPress` double-trigger + no unmount clear (`Client.jsx:11906-11917`); `WSpark` divide-by-zero on a 1-point series (`Widgets.jsx:60`). | Low-impact correctness/robustness. |
| S2-16 | P3 | S | `…Marketplace.jsx:236,251`; `…Calendar.jsx` `_BS_CAL_KIND_ICON` | Marketplace fallback renders demo coaches badged `'YOUR COACH'`/`'YOUR NUTRITIONIST'` to a signed-in user when live providers fail to load; Calendar add-event picker introduces **new colored emoji** (🏋🍽✅💬) against the WORKLOG monochrome rule. | Minor demo-leak + house-style rule violation (new emoji only). |

### S2-DEAD — dead / unreachable code (P2 cleanup, effort S–M each)
- `iosAppBroadsheetPros.jsx`: `BSProHomeWidgets` (L117), `BSProClientsTabBar` (L1448), `BSProAnalyticsScreen` (L1472), `BSPlanGeneratorCard` (L3303) — zero references; `BSProConsoleScreen` (L5885) wired but `'console'` tab never set → unreachable. ~300+ lines (carries the S2-9 leak).
- `iosAppBroadsheetMarketplace.jsx`: `BSCoachDetail` (L1600, ~160 lines) superseded by `BSCoachDetailPublic` (window-aliased L1762) — unreachable; some dead `BSM_MARKETPLACE_*` constants (matches the WORKLOG "Next up" note).
- `iosAppBroadsheetCalendar.jsx`: `BSCalendarWeek` + `BSDayTimeline` (~90 lines) never rendered (only `BSCalendarMonth` is); reference hardcoded May-2026 demo days.
- `iosAppBroadsheetRadio.jsx`: large `{false && (…)}` branches, `DarkTrackRow` (L1076), unused `BS_COACH_PLAYLISTS` (L40-68), and a stranded context API (`requestRadioPrompt`/`saveTrackToLibrary`/`isTrackSaved`/`addTrackComment`/`musicLibraries` — no consumers).
- `iosAppBroadsheetClient.jsx`: `BSProgressSpark` (L12646-12667). `iosAppReactive.jsx`: confirm consumers — if `RadioEffects` et al. are unmounted everywhere the module is dead; if mounted, 3 independent `requestAnimationFrame` loops should share one beat clock (perf).
- `config/providerApplications.js`: `DEFAULT_BACKGROUND_CHECK_PROVIDER` exported but unused; providerApply copy says "minimum of **5 years**" while `PROVIDER_EXPERIENCE_OPTIONS` starts at **7-10 years** (copy/config mismatch, P3).

### S2 duplication / consistency (P3)
- `sheet.open` called two ways in `iosAppBroadsheetCalendar.jsx` — render-fn (L516) vs element (L671). **Not broken** (the provider L55 handles both: `typeof s.render==='function' ? s.render({close}) : s.render`), but the element form relies on `close()`-closes-top rather than by-id — fragile if sheets ever stack. Standardize on the render-fn form.
- 12-hour time formatting implemented 3× (`bsCalFmt12`, `bsClientWeekDemo.js` `fmt12`, Radio `fmt`); Monday-of-week computed in multiple places; `DAY_BASE_CAL`/`CAL_GOAL` logger constants duplicated (L1521 & L3477); `primaryBtn`/`secondaryBtn` style factories duplicated. Candidates for shared helpers.
- Double PR-wall post (`createCommunityPost` L2384 + `saveWorkoutSessionLog`→`announcePRsFromSetLogs`) — RPC dedupes server-side, so safe but a duplicate network call.

### Verified-clean / non-findings (coverage notes for S5)
- **Bundle secrets:** only `VITE_SUPABASE_URL`/`ANON_KEY` (public, RLS), `VITE_API_BASE_URL`, a Spotify flag — **no service-role/secret var**; no secret literals in `mobile-app/src`; anon-key-only client.
- **Authz:** `addChannelMember` is RLS-gated (`channel_members` INSERT `with check ((user_id=auth.uid() and is_public_channel) or is_channel_host)` — adding another user requires host). Coach write paths (`ShapeProgramApi.set`, `ShapeAssign.*`, `BSProCheckinDraft`→`/api/ai/draft-message`) all defer to server RPCs gating on `is_coach_on_client`; `setClientProgram` strips `detail.directive` from self-writes. No client-side role self-elevation (`updateProfileRoles` scoped to own id).
- **Signals mappers** (`signalsMap.mjs`/`shapeSignals.js`) never fabricate inputs — `num`/`firstNum` return null and fields are only set when present; the engine's "skip rules with missing inputs" contract is honored. Roster enrichment is concurrency-capped (4), not an N+1 storm.
- **Lifecycles clean:** realtime subscriptions, presence/activity managers, HRM (`shape:hrm` + interval), live-session stopwatch, `push.js` (registered-guard), `healthkit.js` all have correct cleanup/idempotency; `cachedClientJson` TTL + uid-keying + in-flight-promise dedupe are correct (except caching failures, S2-7).
- **Demo-vs-live gating is correct** in Eat / Train / Progress / Terrain+Signal profiles / Home weekly-totals / feed posts; theme-token discipline is strong (the `#34d6c5`/`#f2ede4` literals are all in deliberately-dark profile components or palette/tier maps, not themed-surface violations; the `t.isLight?'#0a8f87':'#34d6c5'` rule is followed). Calendar weekday math verified correct (May 2026 demo aligns). Only 10 `console.*`, 0 TODO/FIXME.

**S2 bottom line:** fix the **demo-leaks to signed-in users first** — S2-1 (Energy card), S2-2 (meal logger, which is also a coach-facing data-integrity bug), then S2-3 (broken coach playlists) and S2-4 (weigh-in unit → goal ETA). The dead-code sweep (S2-DEAD) is low-risk cleanup that also removes the S2-9 latent leak. No security exposure found in the mobile surface.

> **S2 fixes shipped** (PRs #1332–#1336, post-audit): S2-1/2/16 demo-leaks, S2-3 coach playlists, S2-4 weigh-in unit default, S2-DEAD (~814 lines), S2-8/11/13 P3s. Verification caught 3 over-claims (BS_COACH_PLAYLISTS, DEFAULT_BACKGROUND_CHECK_PROVIDER live; ConsoleScreen tab unreachable).

---

## S3 — Engine & shared lib

**Scope:** the canonical rule-engine `public/newdesign/dashSignals.js` (1093 lines —
`evaluateClient`/`getTriageFeed`, `projectGoal`/`goalSlipDays`/`goalsFromDoc`,
`buildMilestones`, `buildDirective`, `buildEvidencePack`/`buildCheckinDraft`,
`buildProgrammingQueue`, `findJointAttention`) + all of `src/lib/**` (auth/membership,
rate-limit, AI action/proposal/compliance core, data rollups, integrations, stripe lib,
email/notify/push, types/utils). **Method:** three parallel read-only passes (engine ·
security/AI libs · data/util libs); the engine pass verified findings by executing the
engine; every P1/P2 spot-verified by me against real code.

**Headline:** one **P1 money bug** outside the lib but surfaced here — the Stripe checkout
route trusts a **client-supplied price** for one-time coach purchases. The lib core is
otherwise strong: **auth / proposal-token / nonce / rate-limit-key / compliance-gating all
verified sound (no P0/P1 there)**. The rest is an **engine correctness cluster** (unit-blind
goal projection; rules that assume sorted input and silently invert weight deltas; directive
lead by push-order) plus the recurring **UTC-vs-local date** class and email-escaping parity.

### S3 triage table (worst-first)

| ID | Sev | Eff | Location | What's wrong | Why it matters |
|----|-----|-----|----------|--------------|----------------|
| S3-1 | **P1** | S | `src/app/api/stripe/checkout-session/route.ts:131` (`priceCentsFrom` L78) | One-time purchases charge `priceCentsFrom(body.item?.price) \|\| <DB fallback>` — the **client controls the amount**. `plan_id` is only stored as metadata (L191), never used to look up an authoritative price; `priceCentsFrom` does no clamping. | A buyer can POST `item.price: 1` and **pay $1 for a $180 session/plan**; the 15% platform fee is derived from the discounted amount too. The subscription branch (L130, `provider.price`) is safe. **Fix: price one-time buys server-side from the provider row / `coach_plans` by `plan_id`; ignore `body.item.price`.** (Route, not the `stripe.ts` lib — which is clean. Cross-refs S1 scope; the heaviest finding of the audit.) |
| S3-2 | P2 | M | `dashSignals.js` `goalsFromDoc` L248-264 + `projectGoal` L132-171; `signalsMap.mjs` `normalizeWeighIns` | **Unit-blind goal projection** — `projectGoal` compares raw weights with no unit reconciliation. Verified: target `165` (lb) vs a kg series `[84,78]` → returns `state:"achieved"`. The S2-4 fix aligned the null-unit *default* to `'kg'` (one divergence path), but the engine still never converts/asserts when goal-unit ≠ series-unit. | Silently-wrong to-go / pace / ETA / achieved when the goal and weigh-in series carry different units. **Fix: convert to a canonical unit (or assert equality) before the math.** |
| S3-3 | P2 | S | `dashSignals.js` `buildDirectiveRead` L900-901 + `buildEvidencePack` L1009-1010 | **Weight delta assumes the series is sorted ascending** — `w[len-1].weight - w[0].weight` with no sort. `normalizeWeighIns` doesn't sort and the coach `get_client_goals` / `overall.weighIns` JSONB path has no order guarantee. Verified: newest-first `[170,178]` reports **"+8 lb" (gained)** when the client lost 8. | **Sign-inverted** weight read on the coach surface **and in the AI evidence pack that grounds check-in drafts**. Self path is safe (`ShapeWeighIns.list` orders ascending). Fix: sort once in `normalizeWeighIns`. |
| S3-4 | P2 | S | `dashSignals.js` `ruleScoreDrop` L292-296 | `shapeScoreHistory` drop reads `h[len-2]` vs `h[len-1]` assuming ascending; never enforces. Verified: newest-first input → the drop is missed entirely. | Latent (no live mapper builds `shapeScoreHistory` yet — `dashData.jsx` leaves it null), but a correctness trap the moment it's wired. Sort or document the contract at the boundary. |
| S3-5 | P2 | M | `dashSignals.js` `buildDirective` L934-936 (`ev.flags[0]`) | The "one lead" directive = whichever rule fired **first in push order** (streak→score→food→checkin→contact→goal), not by severity/urgency. Verified: a client with `score_drop` + a months-late `checkin_overdue` leads with "Grab a win", not the check-in. | The single coach/client lead can systematically under-represent the most urgent issue. Fix: order the lead by an explicit severity/priority. |
| S3-6 | P2 | S | `src/app/api/store/redeem/route.ts:94, 102-107` (`parseShipping` L40-55) | Member-supplied shipping fields (`name/line1/city/region/postal`) are `.trim()`-only, then interpolated **raw into the ops + member email HTML** — the exact pattern the consultation route was hardened against (S1-1). | HTML/markup injection into staff-facing mail (authenticated/member-only → lower blast radius). **Fix: reuse `escapeHtml` on the address parts.** |
| S3-7 | P2 | M | `analytics-data.ts:120-131,168-174`; `health-snapshot.ts:45-49`; `coach-growth.ts:19-24`; engine `daysBetween`/`mondayOf` L70-71 vs `signalsMap.mjs` `mondayKey` L21 | **UTC-vs-local date basis** across rollups + a cross-module week-key drift (engine recomputes Monday in **local** time from a key the mapper built in **UTC**). Verified DST off-by-one in `daysBetween` (a real 3-day food gap reads "2 days" near the spring-forward midnight → `food_gap` fails to fire). | Off-by-one bucketing in "last 7d"/adherence and week math near local day/week edges. Consolidates **S1-7 / S2-10**. Acceptable for v1 but needs one timezone strategy. |
| S3-8 | P3 | S | `src/lib/ai/directive.ts:41,82-97` | Directive cache is a **module-global unbounded `Map`** (grows per `targetId`, never evicted); the `record` it hashes is client-supplied for a display-only directive. | Verified **correctly keyed** (per target; the fresh DB override is in the hash, so override changes bust it) — **not** an authz/cross-tenant issue. Residual: unbounded memory growth + server-deriving the record would be cleaner. |
| S3-9 | P3 | S | `src/lib/coach-growth.ts:55,67` | `signed90` counts **gross** `subscriptions` rows in 90d with no `status` filter (contrast `coach-roster.ts:53`); `weeklyAdds[].addedCents` sums `price_cents` of possibly-cancelled subs. | The "signings" funnel + MRR-added are inflated by since-churned subscriptions. |
| S3-10 | P3 | S | `src/lib/health-snapshot.ts:60-129` | `upsertSnapshot` is a non-atomic read-modify-write; two concurrent device syncs (Whoop + Strava webhook) can clobber each other's `sources` provenance merge. Also re-fetches `metric_source_overrides` per-day inside the sync loop (N queries / N-day sync). | Provenance drift under concurrency + avoidable query fan-out. |
| S3-11 | P3 | S | `src/lib/ai/proposals.mjs:189-198` + `server.ts:147-150` | `release(nonce)` on execute-failure swallows its error in `try{}catch{}`; if release fails the nonce stays reserved and the human **can't retry the same draft**. The DB `consume_ai_proposal` doesn't bind the nonce to the token's actor (the plan-HMAC already does, so low risk). | Stuck-nonce → "already confirmed" on a legit retry. |
| S3-12 | P3 | S | `analytics-data.ts:210-211` | `sessionLoad` does `Σ (strain*100) + workout_minutes` — additively blends both when present; the type comment says "strain … **or** minutes if no strain". | Days with both Whoop strain + manual minutes double-count; the comment misrepresents the math (cosmetic — relative indicator). |
| S3-13 | P3 | S | misc | `email.ts buildIcs` no RFC-5545 line folding (>75 octets → strict parsers may reject); `request-utils.ts:58` post-read size check uses `raw.length` (UTF-16 chars, not bytes — Content-Length pre-check is the real gate); `notify-core.ts` serial per-item delivery; `actions.mjs` RPC results not destructured for `error` (fails closed, masks logs); engine dead exports `flagDiscipline`/`disciplineOwner` (L1077-79); weight goal dropped at `MAX_GOALS` cap (`goalsFromDoc` L276 slices the appended weight goal). | Low-impact correctness/observability/cleanup. |
| S3-14 | P3 | M | `tests/dash-signals.test.mjs` | **Coverage gap:** zero direct tests for `projectGoal`, `goalSlipDays`, `goalsFromDoc`, `buildDirective`, `buildEvidencePack`, `buildCheckinDraft` — the whole projection/ETA + directive core is only exercised indirectly via one persona. None of S3-2/3/4/5 would be caught. | Add unit tests for the projection + directive paths (would have caught the unit/sort bugs). |

### Verified-clean / non-findings (coverage notes for S5)
- **Security core — no P0/P1.** Proposal **token** (HMAC-SHA256 + `timingSafeEqual` w/ length pre-check + TTL, no secret-in-token), `proposalSecret()` (one-way-derived if only the service key exists; `''`→503), single-use **nonce** (atomic `INSERT…ON CONFLICT DO NOTHING` before execute; audit-failure-after-execute returns `audited:false` without releasing → non-replayable), **actor binding** on confirm (`actor_mismatch`→403), **rate-limit key** (HMAC'd with `RATE_LIMIT_SECRET` so the public RPC can't be griefed; fails open), **access-guards** (`unauthorizedAssignTargets` rejects un-coached ids), **roles.mjs** (no self-elevation), **admin/membership** allow-lists (request-scoped client, RLS authoritative), **AI actions** (every write wraps an `/api/*` endpoint carrying the actor's session — never service-role; discipline derived from the actor's own role), **compliance** (scope gating + attestations enforced server-side; `NUTRITION_COMPLIANCE_ENFORCE` intentional). `ai.ts` never leaks the key. `dbError` returns only the caller's static `clientMessage` (no raw DB leak).
- **Algorithms correct:** least-squares slope (zero-variance guarded), `projectGoal` guards (<2 pts / short span → insufficient; wrong-direction/flat → stalled; duplicate same-day → no NaN; `pct` only when start≠target), cut-vs-build direction + crossing, the **skip-rule-when-input-null** contract (a sparse record can't false-flag — verified), severity mapping, `mondayOf`/check-in grace, `getTriageFeed` sort + read-only-flag non-escalation, `buildMilestones`.
- **Data/util sound:** `correlations.ts` (Pearson mean-centered, denom + sample-size<4 guards, t→p approximation guarded), `reconcile.mjs` (authoritative-source-per-metric, never blended; same-day-only compare), `stripe.ts` lib (no client amounts *in the lib*), `push.ts` (RS256 mint/cache, env-gated no-op), `tokens.ts`/`oauth.ts`/`providers.ts` (admin-only storage, PKCE, httpOnly state), `email.ts` (escaping is the caller's job — `escapeIcsText` correct), `coach-roster.ts` (status-filtered), `coach-catalog.ts` (bounded, documented mirror), `store-catalogue.ts` (server-authoritative cost), `types.ts`/`queries.ts` (no dead types; consistent empty-array error handling), `warroom.ts` (admin-gated, fixed cwd paths, no secrets).

**S3 bottom line:** **S3-1 (client-trusted checkout price) is the single most important fix in the whole audit** — it's a live money path. After that, the **engine correctness cluster** (S3-2 units, S3-3/S3-4 sorted-input assumptions, S3-5 directive priority) plus S3-6 (store email escaping) and the S3-7 timezone strategy. The security/auth/token/compliance core is genuinely well-built — defense-in-depth (front-check + endpoint + RLS) held up throughout.

> **S3-1 fixed** (PR #1337, post-audit): one-time checkout price is now server-authoritative (plan price by `planId` / provider row; `body.item.price` no longer trusted). Verified subscribe/purchase actions do **not** share the bug (server-derived + ownership-checked).

---

## S4 — Web UI (`src/app` non-API + `src/components`)

**Scope:** the Next.js gated dashboard + server actions + marketing/auth pages
(`src/app/**` excluding `/api`, audited in S1) and shared components (`src/components/**`).
**Method:** three parallel read-only passes (server actions/auth/payments · dashboard
pages+components · shared components/marketing); P0/P1s spot-verified by me.

**Surface note (affects severity):** on login, coaches are redirected to
**`/newdesign/TrainerDashboard.html`** (`login/actions.ts:19`) — the babel dashboards in
`public/newdesign/` are the **primary** coach surface. The `src/app/dashboard/*` pages
(where the fabricated panels below live) are **gated + reachable** (linked from the
`/dashboard` overview) but **secondary**, and appear to be an earlier generation being
superseded by `newdesign` (per `shape-dashboard-roadmap.md`). **Open question for S5: are
`src/app/dashboard/{trainer,nutritionist,client}` still live, or legacy to retire?** — that
decision flips S4-2/S4-3 between "P1 demo-leak to fix" and "dead surface to delete."

**Headline:** a second **P1 privilege-escalation** (self-service provider *claim*), plus
two **P1 fabricated-data-to-coaches** panels (the roadmap's worst-failure-mode) on the
secondary dashboard. Payments are otherwise clean (the S3-1 price bug does **not** recur in
the server actions — they're server-derived + ownership-checked). A lot of **dead code**.

### S4 triage table (worst-first)

| ID | Sev | Eff | Location | What's wrong | Why it matters |
|----|-----|-----|----------|--------------|----------------|
| S4-1 | **P1** | S | `src/app/dashboard/claim/actions.ts:15-40` (+ RPC `claim_provider_row`) | **Self-service provider claim — privilege escalation.** Any authenticated user can `claimProviderRow({role, provider_id})` for **any** unclaimed (`owner_id IS NULL`) trainer/nutritionist/gym row; the action validates only role∈set + positive int, then **grants the user that coach role**. The RPC only guards `owner_id is null`; the claim page lists *all* unclaimed rows. The migration's own comment says it "should be an admin-approved flow, not self-service." | A user can **take over a seeded coach listing** → coach UI + RLS privileges, that profile's subscribers, and (once Stripe-onboarded) its subscription revenue. Bypasses the admin-gated `applications/actions.ts` path. **Fix: gate claim behind admin approval / an invite token / an email-match to an approved application.** |
| S4-2 | **P1** | M | `src/app/dashboard/_components/CoachCompliancePanel.tsx:711-810, 212-328` | **Fabricated subscriber telemetry shown to coaches as real.** Even when `overlay.hasData`, dozens of fields are seeded from `hashString(client_id)` with **no real source**: `nutritionCompliance`, `noLoginDays`, `macroDropPct`, `macros`, `hydrationAvgLiters`, the 30-day heatmaps, per-day "detail" copy, `actionReason` ("No app login in 5+ days. Needs immediate outreach."), and `riskScore→status`. **No "sample" label** (unlike `ClientProgressAnalytics`). | A coach reads invented adherence/recovery telemetry about a **real, named** subscriber and may message/re-program them on it — the roadmap's explicit worst-failure-mode. **Severity hinges on the surface note above.** Fix: gate behind `overlay.hasData` per-field, or label "sample", or retire the page. |
| S4-3 | **P1** | M | `src/app/dashboard/_components/CoachClientCRM.tsx:512-547, 558, 607-611, 269` | **Fabricated money + business metrics + drafts.** `retentionMonths`/`macroAdherence`/`prCount`/`program` etc. invented from the client-id hash; **`lifetimeValue = monthlyValue * retentionMonths` is a fake LTV** surfaced as the "LTV" stat + per-row "Revenue". `buildTimeline` invents workouts/sleep/bodyweight; `buildCheckInDraft`/`buildHandoffDraft` **pre-fill coach→client messages with the invented stats**. (Header "MRR" from `price_cents` is real.) | Fabricated revenue (roadmap's named worst case) + a coach could **send invented stats to a client**. Same surface caveat as S4-2. |
| S4-4 | P2 | S | `src/app/dashboard/client/ClientProgressAnalytics.tsx:111,117-118` | `strainLoad={74}`, `restScore={86}`, `goalPct={67}` are **hardcoded constants** rendered to a signed-in **client** as their own "Intensity 74% / Rest 86% / 67% there" with **no sample flag**; strength chart is always `MOCK_STRENGTH` (this one does show "· sample"). | Client-facing fabrication (smaller surface than S4-2/3). Honest "—" or a sample label. |
| S4-5 | P2 | S | `src/app/refunds/actions.ts:33-47` | Subscription-refund branch confirms the row via `.eq('id', subscriptionId)` + RLS, but `subscriptions` SELECT RLS is OR'd with a **provider-read** policy — so a coach can pass a *subscriber's* `subscription_id` and file a `refund_requests` row referencing it (insert is pinned to the attacker's own `client_id`, so it can't refund another user, but it pollutes the admin queue). `cancelSubscription` (sibling) correctly checks `row.client_id === user.id`. | IDOR-lite / queue pollution. **Fix: add `.eq('client_id', user.id)`** (mirror `cancelSubscription`). |
| S4-6 | P2 | S | `src/app/login/actions.ts` · `signup` · `requestPasswordReset` | **No rate-limiting on the auth server actions** — they're **not** `/api/*`, so the proxy's 5/15-min limiter doesn't apply → credential brute-force + reset/enumeration spam. | Confirm **Supabase Auth → Rate Limits** is configured (the WORKLOG says that's where the real control lives), else these are unthrottled. |
| S4-7 | P2 | S | `src/app/auth/callback/route.ts:9-21` | **Open-redirect:** `next` is used as `NextResponse.redirect(`${origin}${next}`)` with no validation; `next=//evil.com` can escape host in some parsers. The `login` action already guards this (`startsWith('/') && !startsWith('//')`). | **Fix: apply the same guard the login action has** (a one-liner; inconsistency, not new logic). |
| S4-8 | P2 | S | `src/app/dashboard/_components/WeeklyReadout.tsx:193-197` | `load()` fires on every `selected` change with **no ignore/AbortController guard** — clicking through the subscriber `<select>` can resolve an earlier client's readout last and render it under the wrong client. | Wrong-client data race on a coach surface. Fix: capture `id=selected`, drop the result if `id !== selected` at resolve. |
| S4-9 | P2 | S | `src/app/dashboard/_components/RecentPayouts.tsx:64-107` | Sums `price_cents` by sign-up date and presents them as **"Recent payouts" under a "Stripe Connect" badge** — but no payout/transfer table is queried, so it's a plausible money figure that **isn't a real disbursement**; Tuesday dates computed in the **server's tz** then `en-US` formatted (off-by-a-day for other tz). | Money-facing mislabel (borderline P1). Label as "subscription revenue (not yet disbursed)" or wire real Stripe payouts. |
| S4-10 | P2 | M | `src/app/dashboard/trainer/page.tsx` ≈ `nutritionist/page.tsx` | **~95% duplicated** (~248 lines each): same data fetch, MRR calc, `Stat`/`StatusPill`, all sections + panel wiring. | Any fix (incl. S4-2/3) must be made twice. Collapse to one `CoachDashboard({role})`. |
| S4-11 | P2 | S | trainer/nutritionist/client/program-tools/settings pages | No `dynamic`/`revalidate` and **no `error.tsx`** on pages that read live per-user RLS-scoped data → full-route-cache staleness risk + raw Next error screen on a fetch throw. | Only `applications`/`warroom` set `force-dynamic`. Add `dynamic='force-dynamic'` + error boundaries. |
| S4-12 | P3 | S | dead code | **`LoginForm.tsx`** is unused (`/login` → `redirect('/login.html')`); the entire **`gym`** path (`ProviderCard` vertical variant, `ProviderFilter` gym branch, `queries.ts` `getGyms`/`getGymById`) has no `/gyms` route; **4 orphan components** (`SubscribeButton`, `PageHero`, `Section`, `LegalSection`) have no importers. | Prune. (`SubscribeButton` also duplicates the inline subscribe form.) |
| S4-13 | P3 | S | misc | Two parallel navs (`Nav` server-renders + auth round-trip on marketing pages then is CSS-hidden in favor of `CinematicNav`); `GlobalChatButton` is a hardcoded keyword echo + literal "24" unread (implies live support, does nothing); `subscribe`/`purchase` actions leak raw Stripe/DB error text into the redirect URL; `login` `role` select only picks a landing URL (trust-the-client UX, enforcement is elsewhere); duplicated `hashString`/`Avatar`-initials/`Subscriber` type across 2-3 files; `updatePassword` no recovery-context assertion; `applications` signed-URL loop is serial N×M. | Low-impact cleanup/consistency. |

### Verified-clean / non-findings (coverage notes for S5)
- **Payments — the S3-1 bug does NOT recur.** `subscribe/actions.ts` reads `provider.price` server-side; `purchase/actions.ts` derives `priceCents` from the provider/workout/plan DB row **and re-checks item ownership** (`wk.trainer_id === providerId`, `pl.nutritionist_id === providerId`); `purchase/page.tsx` carries only `item_name` (display), never the price; `pricing` uses a fixed env price id. No client-set amounts.
- **Authorization sound:** `applications/actions.ts` (every mutating action `requireAdminUser()`-gated before any service-role work; approval re-checks background-check clear), `workout-reviews/actions.ts` (provider-ownership + RLS `reviewer_id=auth.uid()` + `can_access_workout_session`), `cancelSubscription` (`client_id` check), `stripe-onboarding/success` (`owner_id===user.id`), `ProviderMessageButton`→`/api/messages/direct` (sender from session, not client), `warroom`+`applications` pages (`requireAdminUser()`, service-role server-side only, signed URLs short-lived, config panel shows presence-flags never secret values).
- **Correctness sound:** `[id]` pages `notFound()` on missing/NaN id; `subscribe`/`purchase` pages have explicit `ErrorShell` + role↔kind checks; `HealthMetricsPanel`/`IntegrationsPanel`/`ClientProgressAnalyticsClient` have honest loading/empty/error states + `'real'/'sample'` labels; `dashboard/layout.tsx` re-checks the subscription server-side (the member gate).

**S4 bottom line:** **S4-1 (provider-claim privilege escalation) is the actionable P1** (a clean auth gap, independent of any surface question). **S4-2/S4-3** (fabricated coach data) are P1 *if* `src/app/dashboard/*` is still a live surface — **resolve that surface question first** (they may instead be deleted as legacy). Payments + admin authorization are clean; the rest is dead-code pruning and the trainer/nutritionist de-dup.

> **S4-1 fixed** (PR #1338, post-audit): `claimProviderRow` now requires admin — closes the self-service escalation. **Surface decision (owner): `src/app/dashboard/{trainer,nutritionist,client}` is LEGACY, being retired** → S4-2/S4-3 (fabricated panels) become **delete the legacy surface**, not patch the fabrications.

---

## S5 — Cross-cutting + consolidation

**Scope:** dependencies, config, repo-wide dead code; then the merged, prioritized view
of S1–S4. **Method:** direct read-only pass on deps/config/orphans + synthesis.

### S5 cross-cutting findings
| ID | Sev | Eff | Finding |
|----|-----|-----|---------|
| S5-1 | P3 | S | **Dead code, repo-wide.** Confirmed orphan `public/newdesign/memberProfile.jsx` (referenced by 0 HTML; `profileCustomizer.jsx` already deleted). Plus the S4 web dead code (`LoginForm.tsx`, the entire `gym` path — `getGyms`/`getGymById`/`ProviderCard` vertical variant/`ProviderFilter` gym branch, no `/gyms` route — and 4 orphan components: `SubscribeButton`/`PageHero`/`Section`/`LegalSection`), the S3 engine dead exports (`flagDiscipline`/`disciplineOwner`), and the S2 mobile dead code (~814 lines already removed in #1334; the Radio `{false && …}` branches + stranded context API remain). |
| S5-2 | P3 | S | **Duplication, repo-wide.** trainer/nutritionist Next pages ~95% identical (S4-10); `hashString`/`Avatar`-initials/`Subscriber` type repeated 2-3× (S4); 12-hour time + Monday-of-week helpers repeated 3× in mobile (S2); UTC-vs-local date helpers reimplemented per module (S3-7). Candidates for shared helpers. |
| S5-3 | P2 | — | **Timezone strategy (cross-cutting, consolidates S1-7 / S2-10 / S3-7).** `toISOString().slice(0,10)` (UTC) is used for "today"/day-bucketing in `health-snapshot`, `analytics-data`, `coach-growth`, the mobile weigh-in/snapshot writers, and the engine's `daysBetween`/`mondayOf` (local) vs the mapper's `mondayKey` (UTC). All internally consistent but **off-by-one near a user's local midnight / week edge** and DST. One project-wide timezone decision (a per-user TZ or a documented canonical) would close ~5 findings at once. |
| — | — | — | **Clean:** `npm audit` = 0 (root + mobile-app); deps lean (Next 16.2.9 / React 19.2.4); CI (`ci.yml` web+mobile required) + `android-build.yml` + Dependabot + CodeRabbit + `.coderabbit.yaml` all present; 0 TODO/FIXME repo-wide; no committed secrets (S1). |

---

## Consolidated triage — all sessions (S1–S5)

### Status legend: ✅ fixed this engagement · ⬜ open · 🔵 decision made

| ID | Sev | Area | Finding (one-liner) | Status |
|----|-----|------|---------------------|--------|
| S3-1 | **P1** | API/Stripe | Client-trusted one-time checkout price ($1 for a $180 session) | ✅ #1337 |
| S4-1 | **P1** | Dashboard | Self-service provider claim → coach-role + revenue takeover | ✅ #1338 |
| S4-2 | P1\* | Dashboard | `CoachCompliancePanel` fabricated subscriber telemetry as real | ✅ #1343 (retired) |
| S4-3 | P1\* | Dashboard | `CoachClientCRM` fabricated LTV/revenue + drafts | ✅ #1343 (retired) |
| S2-1 | P1 | Mobile | Home Energy card demo leak (signed-in, non-today) | ✅ #1332 |
| S2-2 | P1 | Mobile | Meal logger fake totals + hardcoded title to coach | ✅ #1332 |
| S2-3 | P1 | Mobile | `ShapePlaylists` clobbered → coach playlists broken | ✅ #1333 |
| S1-1/2 | P2 | API | `consultation` unescaped emails + unauth abuse | ✅ esc. #1336 · ⬜ CAPTCHA |
| S1-3 | P2 | API | Raw `error.message` leaks (94 sites) | ✅ #1336 |
| S1-4 | P2 | API | Unbounded string writes | ✅ #1336 |
| S1-5/6 | P3 | API | cron constant-time · garmin secret required | ✅ #1336 |
| S2-4 | P2 | Mobile/engine | Weigh-in unit default mismatch | ✅ #1333 (default) · ✅ #1341 (reconcile) |
| S3-2 | P2 | Engine | Unit-blind goal projection (no conversion) | ✅ #1341 |
| S3-3 | P2 | Engine | Weigh-in series unsorted → inverted coach/AI weight delta | ✅ #1341 |
| S3-4 | P2 | Engine | `ruleScoreDrop` assumes sorted history (latent) | ⬜ (latent; not yet hit) |
| S3-5 | P2 | Engine | Directive lead by push-order, not severity | ✅ #1341 |
| S3-6 | P2 | API | `store/redeem` fulfillment emails unescaped | ✅ #1340 |
| S4-5 | P2 | Actions | Refund IDOR-lite (missing `client_id` check) | ✅ #1340 |
| S4-6 | P2 | Auth | No rate-limit on login/signup/reset server actions | ⬜ (Supabase Auth dashboard) |
| S4-7 | P2 | Auth | `auth/callback` open-redirect (`next` unvalidated) | ✅ #1340 |
| S4-8 | P2 | Dashboard | `WeeklyReadout` fetch race on client switch | ✅ #1343 (retired) |
| S4-9 | P2 | Dashboard | `RecentPayouts` "payouts" mislabel on un-disbursed sums | ✅ #1343 (retired) |
| S1-7/S2-10/S3-7 | P2 | Cross | UTC-vs-local date basis (one strategy) | ✅ #1345 (writes) · ⬜ coach read windows |
| S5-3 | P2 | Cross | Timezone strategy (client-sends-local-date) | ✅ #1345 |
| S2-8/13/16, S2-DEAD | P3 | Mobile | INK60, booking year, award catch · ~814 dead lines | ✅ #1334/#1335 |
| S1-SEC-1 | P3 | CI | No gitleaks in CI; confirm push-protection | ✅ #1342 (gitleaks gate) |
| S3-14 | P3 | Engine | No tests for projection/directive core | ✅ #1341 (+7 tests) |
| S5-1 | P3 | Various | Dead code (orphan components, gym path) | ✅ #1342 (5 files) · ⬜ gym path (live components) |
| S3-8..13, S4-12/13, S5-2 | P3 | Various | directive cache, signed90, duplication, etc. | ⬜ |

\* P1 only if the surface is live; the owner has marked it **legacy → retire**.

### Quick wins (small, high-value, mostly independent)
1. **S4-7** — apply the login action's `next`-guard to `auth/callback` (open-redirect; ~1 line).
2. **S4-5** — add `.eq('client_id', user.id)` to the refund subscription branch (mirror `cancelSubscription`).
3. **S3-6** — reuse `escapeHtml` on `store/redeem` shipping fields (the consultation pattern).
4. **S3-3** — sort the weigh-in series once in `normalizeWeighIns` (fixes inverted coach/AI weight deltas).
5. **S1-SEC-1** — add a `gitleaks` CI step + confirm GitHub push-protection.
6. **Dead-code prune** — `memberProfile.jsx`, `LoginForm`, the `gym` path, 4 orphan components (S5-1).

### Structural (bigger, sequence deliberately)
1. **Retire the legacy `src/app/dashboard/{trainer,nutritionist,client}` surface** (owner decision) — deletes S4-2/S4-3/S4-8/S4-9/S4-10 wholesale instead of patching fabricated panels.
2. **One timezone strategy** (S5-3) — a per-user TZ (or documented canonical) closes S1-7/S2-10/S3-7 together.
3. **Engine unit reconciliation** (S3-2) — convert/assert units in `projectGoal`/`goalsFromDoc`; add the missing projection/directive unit tests (S3-14).
4. **Directive priority** (S3-5) — order the "one lead" by severity, not rule push-order.
5. **`consultation` abuse hardening** (S1-2) — add CAPTCHA/Turnstile (needs a provider + keys).

### The single highest-impact thing to do first
**Both P1s are already fixed** (S3-1 checkout price, S4-1 claim escalation — the two genuine
security/money holes). With those closed, **the highest-impact *remaining* item was the owner's
decision to retire the legacy `src/app/dashboard/*` surface** — it erased the two P1-class
fabricated-data panels (S4-2/3) plus S4-8/9 in one move.

### Resolution (this engagement — all merged to `main`)
Everything actionable was shipped as one PR-per-concern series:
- **P1s:** S3-1 (#1337), S4-1 (#1338).
- **Quick wins (#1340):** S4-7 open-redirect guard · S4-5 refund ownership · S3-6 email escaping.
- **Engine (#1341):** S3-2 unit reconciliation · S3-3 sorted weigh-in delta · S3-5 urgency-ranked
  directive · S3-14 (+7 projection/directive tests).
- **Hygiene (#1342):** gitleaks secret-scan CI gate (S1-SEC-1) · removed 5 orphan src files (S5-1).
  Kept `public/newdesign/memberProfile.jsx` (owner: don't delete newdesign).
- **Legacy retirement (#1343):** deleted the user-facing legacy dashboards (closes S4-2/3/8/9);
  **kept** the live admin coach-approval pipeline (`/dashboard/applications`) + `/dashboard/claim`
  (no newdesign equivalent — retiring them would break onboarding). newdesign untouched.

**Done since (this follow-up):**
- **S5-3 — timezone (#1345).** Chosen strategy: the **client sends its local date**; the server
  uses it (UTC fallback). Day-scoped writes (meal log, weigh-in, habit check-off, daily check-in,
  measurements) now bucket on the user's calendar day. Coach-facing *read* windows still aggregate
  in UTC (display ranges, not user-day writes) — left as the only remaining slice.

**Still open (need an external decision or input — not engineering-blocked):**
- **S4-6** — login/signup/reset brute-force limits live in **Supabase Auth → Rate Limits** (those
  requests bypass the Next app); set in the dashboard / Management API, not in code. The app's own
  `/api/*` limiter is already live. Strongest login defense = enabling **CAPTCHA** + leaked-password
  protection.
- **S1-2** — `consultation` CAPTCHA/Turnstile needs a provider + keys (`TURNSTILE_SECRET_KEY`).
- **S3-4** (latent — `ruleScoreDrop` sorted-history assumption), the **gym** dead-code path
  (threads through live `ProviderCard`/`ProviderFilter`), and the remaining P3 cleanups.

---

## Audit complete (S1–S5)
- **Coverage:** API/data-access + secrets (S1) · mobile app (S2) · engine & shared lib (S3) ·
  web UI (S4) · cross-cutting + consolidation (S5). All findings cite real code; severities
  calibrated by verification (which **corrected 6 agent over-claims** across the run — 3 in S2
  dead-code, the directive-cache in S3, and two P0→P1 recalibrations in S4).
- **Shipped during the engagement** (separately approved): both P1s + the full S1/S2 fix set
  (PRs #1332–#1338).
- **Posture:** no committed secrets, no IDOR on the coach→client surface, the AI/auth/token/
  compliance core is well-built (defense-in-depth). The residue is correctness (engine
  units/sorting/timezone), the legacy-dashboard fabrications (to retire), and cleanup.
