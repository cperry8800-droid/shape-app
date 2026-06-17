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
