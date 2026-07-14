# Shape — working notes & changelog

Running memory for ongoing work on the Shape app. Skim this before starting
mobile/website work so context carries across sessions. Add a dated entry to the
changelog whenever something ships.

## How we work

- **No colored emoji for NEW additions going forward.** Any emoji you *add* from
  now on should be monochrome — use typographic symbols (⚙ ↗ ✓ → × ♡ ＋ #) or
  theme-tinted inline SVG/icons, matching the editorial aesthetic. **Do NOT
  retroactively change existing emoji or colors** already in the app/website
  (especially on profiles) — leave current ones as-is. Rule applies to new emoji
  only.
- **Migrations: just post the raw GitHub SQL link.** When a migration is
  created, reply with only the `raw.githubusercontent.com/.../supabase-migrations/<file>.sql`
  link — the user runs it on Supabase. Don't paste the SQL body or long explanations.
- ⛔️ **NEVER edit on a stale base — verify FIRST, every session/turn.** The web
  container periodically re-clones/resets the working tree to an *older* commit
  while `origin/main` holds the real latest. Editing on that stale base creates
  duplicate commits, rebase conflicts, and lost work — it has cost real tokens
  multiple times. **Before making ANY edit:** run
  `git fetch origin main && git rev-parse --short HEAD origin/main` — if HEAD ≠
  origin/main, run `git reset --hard origin/main` first. `main` and the session's
  dev branch (the current `claude/*` working branch — it differs per session) are
  always kept identical (push both to the same commit); treat `origin/main` as the
  single source of truth.
- **Session handoffs → `docs/HANDOFF-<YYYY-MM-DD>.md`.** Longer-form end-of-session
  handoffs (state snapshot · what shipped · architecture you'll need · open
  follow-ups) live as their own dated file in `docs/`, separate from this
  changelog. **At session start, read the newest `docs/HANDOFF-*.md`** (`ls -t
  docs/HANDOFF-*.md | head -1`) alongside this WORKLOG — standalone docs are NOT
  auto-loaded into context, so this pointer is how they get found. When you write
  one, keep the short shipped-summary as a dated entry in this file's changelog too,
  and name the handoff file so it sorts by date.
- **Older history → `docs/WORKLOG-ARCHIVE-2026-06-cycles-2-5.md`.** The early-June
  root `WORKLOG.md` (Cycles 2–5, PRs #712–#807) is archived there; the root file is
  now just a pointer to THIS file. The archive's conventions (branch names, merge
  rules, `public/m` publish steps) are superseded — never work from them.
- **Mobile app** lives in `mobile-app/` (Capacitor/Vite SPA, the `/m/` broadsheet).
  - Build: from `mobile-app/`, `VITE_BASE=/m/ npm run build`.
  - Publish into the website: from the **repo root**, `rm -rf public/m && cp -r mobile-app/dist public/m`.
  - Parse-check a JSX file before building:
    `node -e "require('@babel/parser').parse(require('fs').readFileSync('<file>','utf8'),{sourceType:'module',plugins:['jsx']})"`
- **Website = `public/newdesign/`.** This is the canonical, live website surface
  we build on — **always edit the pages here** (`*.html` + their `*.jsx` babel
  blocks/companions), not anywhere else. Each `*.html` is the live page; many are
  **self-contained** (inline `<script type="text/babel">`) and pull in shared
  `living*.jsx` / `chatWidget.jsx` / `pageShell.jsx` via `?v=N` tags — **bump the
  `?v=` when you change a referenced `.jsx`** so the cache busts. A few legacy
  `*.jsx` files (e.g. `memberProfile.jsx`) are **orphaned/dead** (nothing loads
  them) — confirm a file is actually referenced before relying on an edit there.
  The Next.js app at the repo root (`src/`) is **API routes + the gated
  `/dashboard`** (typecheck: `npx tsc --noEmit`); the public/marketing/profile/
  store/coach pages all live in `public/newdesign/`.
- **Git / deploy:** develop on the session's `claude/*` branch. Per change: commit →
  push → open PR → **wait for the CI checks to go green** (`.github/workflows/ci.yml`:
  Web typecheck+build, Mobile build + public/m sync) → **review the PR diff** →
  squash-merge → re-sync the branch to `main`
  (`git fetch origin main && checkout main && reset --hard origin/main && checkout <branch> && reset --hard origin/main && push --force-with-lease`).
  Don't merge on red — a failed check is exactly the broken-main it exists to stop.
  CI also fails when `public/m` is stale (mobile source edited without republishing).
- **Diff review before merge (standard practice).** For any non-trivial change
  (logic, data flow, theming, anything touching shared components), give the PR
  diff a dedicated review pass before squash-merging — hunting specifically for:
  logic bugs/regressions, missed `?v=` cache-bust bumps on edited referenced
  `.jsx`, theme-token violations (hardcoded ink/paper on themed surfaces, theme
  tokens on fixed-background screens), demo-vs-live data leaks, and changes to
  shared code that other profiles/pages also render. Docs/copy-only tweaks can
  skip it. Riskier changes additionally go to `staging` for a click-through
  before merging.
- **Review stack before shipping (required).** Layers that gate every
  non-trivial change: **(0) CodeRabbit IDE — pre-push.** The CodeRabbit VS Code
  extension (`coderabbit.coderabbit-vscode`, installed locally; sign in to its
  sidebar panel once) reviews the LOCAL diff in-editor **before** pushing, so the
  obvious stuff is fixed before a PR exists. It's **opportunistic, not a hard
  gate** — run it on non-trivial/risky diffs to save PR round-trips, skip it on
  one-liners. Same engine as layer 2, just earlier + with less context; there's no
  CLI, so it's editor-triggered (the agent can't invoke it). **(1) `/code-review`**
  — run the skill on the diff before merging (Claude reviews for logic bugs + the
  regressions listed above); **(2) CodeRabbit GitHub App — the AUTHORITATIVE
  review.** Auto-reviews every PR into `main`/`staging` with full PR context +
  `.coderabbit.yaml` config (assertive profile, path rules). This is the source of
  truth — **never treat the layer-0 IDE pass as a substitute for it.** **(3)
  required checks** — `main` branch protection requires the CI checks
  (`Web (typecheck + build)` + `Mobile (build + public/m sync)`) green before a
  merge (GitHub → Settings → Branches; once on, merging on red is impossible).
  Docs/config-only commits may skip layers 0-1.
- **CI checks on every PR (current set).** What runs on a PR into `main`:
  - **`ci.yml`** (every PR + push to `main`/`staging`) — **Web (typecheck +
    build)**, **Mobile (build + public/m sync)**, and **Secret scan (gitleaks)**
    (added #1342 — scans the working tree against `.gitleaks.toml`; advisory until
    added to branch protection). Web + Mobile are the **required** checks for
    branch protection on `main`.
  - **`android-build.yml`** (only when `mobile-app/**` changes) — **Build debug
    APK** (debug-signed, no secrets). A **release APK** job is opt-in and runs
    only once the `ANDROID_KEYSTORE_*` repo secrets are added.
  - **Vercel** — preview deploy + **Vercel Agent Review** (AI, non-blocking,
    reports `neutral`) + Preview Comments.
  - **CodeRabbit** — assertive AI review (`.coderabbit.yaml`); comments on every
    PR but is advisory, not a blocking status check.
- **Test branch = `staging`** (long-lived, Vercel preview). Pushing any commit to
  `staging` auto-deploys to the stable preview URL
  **https://shape-app-git-staging-cperry8800-droids-projects.vercel.app** — production
  (`theshapecommunity.com`) is untouched. Use it for riskier changes you want to
  click through before merging: `git push origin <branch-or-sha>:staging --force`
  (it's a scratch pointer — force-resetting it is fine; merging to main still goes
  through the normal PR flow). Every dev-branch push also gets its own preview at
  `shape-app-git-claude-<branch>-….vercel.app`. **Caveats:** previews share the
  PRODUCTION Supabase DB + env vars (no isolated test data; don't test destructive
  migrations here — though **Supabase branch DBs are now available** (org upgraded to
  Pro 2026-06-23), so a branch can run against an isolated branch DB if set up), and
  if a preview URL asks you to log in, that's Vercel Deployment Protection
  (Project Settings → Deployment Protection to relax it).
- **Verify before committing:** parse-check changed JS, `tsc --noEmit` for TS, build, copy `public/m`.
  This is now **automated** by a tracked **pre-commit hook** (`.githooks/pre-commit`
  → `scripts/verify-staged.sh`): on `git commit` it runs only the checks the *staged*
  change can break (JSX parse-check · `tsc --noEmit` · mobile build + `public/m` diff ·
  `npm test`), skips docs/config-only commits, and **blocks the commit on failure**.
  Bypass once with `SKIP_VERIFY=1 git commit …`. It's armed via `git config
  core.hooksPath .githooks` — web sessions re-arm it + install deps automatically via
  the **SessionStart hook** (`.claude/hooks/session-start.sh`, registered in
  `.claude/settings.json`); **on your own machine run `git config core.hooksPath
  .githooks` once** to enable it locally. CI (`ci.yml`) still runs the full builds on
  PRs into `main` / pushes to `main`+`staging` as the hard gate.

## Architecture map (mobile broadsheet)

- `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — client app (home, eat,
  train, logger, chat, settings). Biggest file (~9.7k lines).
  - `BSLogMealFlow` — the meal logger (Adjust / Photo / Search / Voice tabs +
    ingredient editor). Delivers a note/memo/photo via `sendMealNote()`.
  - `BSClientEat` — eat/calendar page (meals, swap, grocery views).
  - `BSChatThread` / `BSClientFeed` — shared chat (coaches + clients use the same code).
- `iosAppBroadsheetPros.jsx` — trainer & nutritionist apps (`BSProMe`, console).
- `iosAppBroadsheet.jsx` — shared chrome (`BSPage`, `BSFooter`, `BSSwapSheet`).
- `iosAppBroadsheetRadio.jsx` — Shape Radio (`BSNowPlaying`).
- `mobile-app/src/services/shapeBackend.js` — Supabase data layer (`conversationToThread`, etc.).
- **Theme:** `useBS()` → `t`. Teal accent literal: `t.isLight ? '#0a8f87' : '#34d6c5'`.
  Role colors: nutritionist gold `#a07a2e`, trainer rust `#c0533b`.
- **Window-globals load order:** modules expose components via
  `Object.assign(window, {...})` and consume them via top-level
  `const {...} = window`. If a role module reads a global before a feature module
  defines it, you get React error #130 (undefined component). The shell loaders in
  `iosAppBroadsheetMain.jsx` load feature modules *first*, then the role module;
  pros reuse client-module globals (e.g. `BSClientChat`) off `window`.
- **Sheets** must `createPortal` into `#bs-phone-surface` (position:absolute) so they
  don't overhang the phone frame in desktop preview.

## Backend touchpoints

- `src/app/api/nutrition/meal-note/route.ts` — delivers a meal log's note + voice
  memo + photo to every linked coach. Uploads to the private `meal-notes` storage
  bucket (audio + image mime types); links ride in `messages.metadata.audio/photo`.
- `src/app/api/nutrition/voice/route.ts` — Whisper transcription (returns `{ transcript }`).
- Storage bucket: `supabase-migrations/2026-06-03-meal-notes-bucket.sql` (idempotent;
  re-run after widening mime types). **War Room** (`/warroom`, `src/lib/warroom.ts`) is
  the go-live status board — register new routes in `RAW_ROUTES` and add checklist items there.

## Changelog

> **Latest (2026-07-13): THE WORK DOMAIN WAVE — COMPLETE** (brainstorm →
> shipped in one day; owner adds: work goal area · milestone Shape Score
> points · website parity on every PR). **Spec #1694 + PR A #1696 + PR B
> #1697 + PR C #1698 all merged**; BOTH migrations (`habit-domain` ·
> `work-milestone-points` incl. the month-bucket revision) **APPLIED +
> verified live**; 20 review findings addressed across 4 CodeRabbit/Codex
> rounds; suite **620**. Work habits (domain stamp + WORK tags) · THE WORK
> station in The Contract · THE APPOINTMENTS milestones (+25 · CAREER,
> once/month, never-lost claim) · THE CROSSOVER (training × work reads,
> statistically gated) — all on BOTH surfaces. Session handoff:
> **[`docs/HANDOFF-2026-07-13.md`](HANDOFF-2026-07-13.md)** (also covers
> the share card #1692/#1693). Open: the OWNER on-device pass.
>
> **Prior (2026-07-13): THE SHARE CARD** — #1692 spec + #1693 build: a
> member's OWN activity renders as a canvas-drawn 1080×1920 brand PNG
> (workout/run w/ real route polyline · PR delta · meal THE PLATE) fired
> through the OS share sheet AS A FILE → Instagram offers Stories (the
> Strava pattern). Own-only v1; honest-absent stats; desktop → PNG
> download. Also 2026-07-13: **#1691** freehand-logger share + plan-true
> coach attribution + the stale calendar War Room gap removed. Open: the
> on-device share pass (IG Stories flow) · PR B later (web parity + native
> IG deep-link once the iOS build exists).
>
> **Prior (2026-07-12b): MEALS ON THE WIRE — COMPLETE both surfaces** —
> #1686 spec (3 review rounds) · #1687 PR A (share-by-choice on BSMealLogged
> + THE PLATE card + Nutrition chip + the no-award migration) · #1688 PR B
> (web NUTRITION tab + MealPlate). **Migration APPLIED + verified live**
> (meal shares can never earn the +5 — either path). Honest-absent contract
> everywhere (no fabricated "0 g" / "Adjusted"). Suite 601. Open: on-device
> pass (share → both feeds · Undo retracts · LOCKED IN · score unchanged).
>
> **Prior (2026-07-11 → 12): launch rounds + feed filters** —
> **#1679** the wire beat drops its static INCOMING line (owner call): the
> first splash is now just the Shape mark centered on the dash-ticker ground,
> LOADING low, footer rule. **#1680** the marketing site finally advertises
> self-serve training ("build your own workouts, coach optional"): index.html
> journey Stage 03 + the 01 — Train loop beat · GetApp.html TRAIN walkthrough
> step · Pricing WHAT'S INCLUDED bullet + coach-optional FAQ (+ `pricing.jsx`
> `?v` cache-bust — it had none) — closes the marketing half of War Room
> #1666 (item flipped done; the app wall line shipped with #1668). **#1681**
> kudos dies — the website speaks the app's reaction grammar (verb chip ·
> count on the marketing feed footer, "reactions" wording on the Score page)
> + the **feed-parity backend audit** (same table/privacy/counts both
> surfaces; two asymmetries noted in the dated entry). Note: **Pricing.html
> AND Community.html are tracked with CRLF** (repo exceptions) — don't
> LF-normalize them. **#1682** the owner picked off the board: the beat goes
> **ON AIR** (BSWireDial ruler + needle + whisper, plate moved to the TOP,
> the mark floats in a breathing halo; hold mirrors it). **#1683** owner pick
> "K": the **waveform bed** (BSWireWaveform seeded tape behind the mark, beat
> + hold). **#1684 (2026-07-12)**: **activity-type filters on the community
> feed, both surfaces** — web mapPost derives a real filter bucket (the audit
> fix: a logged run files under RUNS) + the app stream gains All/Workouts/
> Runs/PRs chips. Open: optional further beat layers (L signal-lock ·
> M static-calm, on the board) · the standing OWNER on-device launch pass.
>
> **Prior (2026-07-10f): THE LAUNCH ON THE WIRE — COMPLETE** (six rounds in
> one day, each from the owner's live on-device look): #1667/#1668 wire beat +
> "The telegram" Daily + warm-skip + wire wall · #1670–#1673 polish (plain dim
> grounds, 3.5s dwell, clean invite, LOADING, picker + auth on the wire) ·
> #1674 STOP/END removal + the **dietitian RD/RDN wiring fix** · #1675 beat
> structure + **"The wire form"** sign-in/create (2-step IDENTITY →
> CREDENTIALS, TRANSMIT CTAs, autofill/DOB/Turnstile fixes) · #1676 topbars
> off + **0→100% loading fill** · #1677 the **provider application** (both
> roles) in the launch grammar. `main` at **`b34d8a35`**. Full session
> handoff: **[`docs/HANDOFF-2026-07-10b.md`](HANDOFF-2026-07-10b.md)**.
> Open: the OWNER on-device pass across the whole flow (launch × auth ×
> application × reduced motion × papers).
>
> **Prior (2026-07-10e): THE NORA WAVE — COMPLETE** (#1652 spec · #1653/#1654
> voice · #1655 grounding+memory · #1656 member tools · #1657 voice-default
> env), `main` at `51828ddb`. Full session handoff:
> **[`docs/HANDOFF-2026-07-10.md`](HANDOFF-2026-07-10.md)** (also covers the
> food search #1648/#1649 + the website screenshots #1650/#1651 from earlier
> in the day). **Owner's voice pick: `sage` + a fitness-instructor style** —
> ⚠ OWNER: paste `NORA_TTS_VOICE=sage` + the `NORA_TTS_INSTRUCTIONS` block
> (verbatim in the handoff) into Vercel, redeploy, then the Settings →
> Preview-voice ear check. Open: the on-device Nora pass · deferred items in
> the handoff.
>
> **Prior (2026-07-10d): Nora member action tools — PR C closes the Nora
> wave** — members DO things through Nora: **log_weigh_in / log_water /
> check_habit / set_reminder** ride the exact `log_meal` proposal rails
> (preview → confirm → `ai_audit_log` → undo), self-scoped, exposed ONLY in a
> verified member's tool list + re-gated in every `buildPreview`;
> **`find_food`** looks up REAL macros through a shared
> **`searchFoodsServer`** (extracted from the #1648 route — one fan-out) so
> "log the Chipotle bowl" proposes real numbers. **Every undo now enforces
> its predicate IN the atomic statement** (zero rows = the honest "changed
> since" conflict) — including the `log_meal` parity fix for its old blind
> restore; `check_habit` fuzzy-matches fail closed (pure tested
> `memberTools.mjs`). Suite 559. Dated entry below. Wave A+B+C complete —
> open: owner voice pick (`NORA_TTS_INSTRUCTIONS`) · on-device pass · the
> splash-pages rearrangement (parked).
>
> **Prior (2026-07-10c): Nora grounded answers + memory — PR B of the Nora
> wave** — support chat now answers a member's personal questions with their
> REAL numbers: a server-built, caller-RLS **member-context block** (pure
> tested `memberContext.mjs`; fail-soft fetchers over snapshot/momentum/
> ledger/weigh-ins/goal; fetch failure → an explicit honest-unavailable note,
> never a guess) injected only for **verified members** (`computeMembership`,
> fail-closed) — signed-out/prospect chat is byte-identical. And she
> **remembers**: `user_goals('nora_memory')` `{rev, notes}` mutated under
> **CAS** by every writer; `remember`/`forget` direct-with-audit tools whose
> schemas non-members never see; Settings → **"What Nora remembers"** (per-
> note forget + clear-all behind `bsAskConfirm`). Suite 551. Dated entry
> below. Open: PR C member tools · owner voice pick.
>
> **Prior (2026-07-10b): Nora voice overhaul — PR A of the Nora wave** — the
> robot is dead: `speakVoice` is server-only and returns an honest
> `{ok, reason}` (explicit Listen taps toast "Nora's voice is a member
> feature" / "Voice is unavailable right now"; auto-speak failures stay
> silent); the server TTS (`gpt-4o-mini-tts`) now takes **style
> `instructions`** — pure `voiceStyleForTone(tone)` in `tone.mjs` (tested),
> overridable by the optional **`NORA_TTS_INSTRUCTIONS`** env (owner
> auditioning at openai.fm) — with the verbatim `X-Spoken-Text` contract
> untouched; and the mobile Nora support chat gains **Voice chat** mode
> (header chip, off by default): hold-to-talk mic → transcript sends as a
> message → her reply auto-plays. Spec #1652 (5 review rounds); dated entry
> below. Open: PR B grounding+memory · PR C member tools · owner voice pick.
>
> **Prior (2026-07-10): Real food-database search in the meal logger (#1648)** —
> the add-food sheet's "search coming" placeholder is dead: signed-in members
> search a **hybrid USDA FoodData Central + Open Food Facts** database (pure
> `foodSearch.mjs` normalize/merge/rank shared by route + tests · `GET
> /api/nutrition/food-search` with auth BEFORE provider fan-out, 2.5 s per-leg
> timeouts, either-side degrade, honest unavailable state · debounced/aborted
> sheet UI — ＋ adds the default serving, row-tap opens the editor prefilled ·
> **recents real** via `user_goals('food_recents')`, no migration). Runs
> OFF-only until the owner sets the free **`FDC_API_KEY`**. Spec #1643; dated
> entry below. Open: on-device pass + barcode scan (v2).
>
> **Prior (2026-07-09b): The navigation wave, complete (PRs A + B + C)** — back
> returns to the TRUE previous page across **all three shells** (pure
> `navHistory.mjs` descriptor stack + announce register + smart-backs + the
> single-guard-entry hardware/browser-back bridge, one shared `useBSNavHistory`
> hook), and **swipe navigation shipped**: left-edge swipe = back, content swipe
> = adjacent root tab (`swipeIntent.mjs` + the chrome's `BSNavGestures`,
> per-axis scroller guards, sheets/inputs/full-screen flows opt out, `BS_SWIPE`
> = the one tuning surface). Spec #1642. Same day: **HOTFIX #1646** — universal
> search had been CRASHING the app on open since 2026-07-07 (found live during
> gesture verification) — and **Book now parity** (#1640). Open: the owner
> on-device pass for the whole wave. Dated entries below.
>
> **Prior (2026-07-09): The Marketplace Listing wave** — tapping a marketplace coach
> now opens **"THE LISTING"** (spec #1632), a purpose-built conversion page (the Signal
> living profile stays untouched behind one THE FULL PROFILE → door): eyebrow/portrait/
> register head, a **real scheduling calendar** (weekly `provider_availability` minus
> booked sessions, projected by a new tested `coachAvailability.mjs`), the
> **standing-offer coupon** with the at-capacity waitlist gate + a **coach-authored
> monthly offer** (WHAT'S INCLUDED sheet · coaches edit it from their practice
> shortcuts · migration `2026-07-09-provider-monthly-offer.sql` **APPLIED + verified**),
> PROGRAMS + role-aware SINGLE WORKOUTS/MEALS shelves, and honesty fixes (the synthetic
> match% chip + seeded 10.0/10 ratings die). Habits page → **"The Habit Ledger"**
> (#1635); the **website coach profile brought to parity** (#1637 — coupon + monthly
> offer + singles on the site's rate card). Six PRs: #1631 meal-preview/radio polish ·
> #1633 slate habits head · #1634 the Listing · #1635 Habits · #1636 calendar + offer ·
> #1637 website. See the dated entry below + **[`docs/HANDOFF-2026-07-09.md`](HANDOFF-2026-07-09.md)**
> (this wave's full handoff). Open: the on-device pass.
> *(Prior 2026-07-08: Kitchen Card & Catalogue — #1627/#1628/#1629 — and Train "The
> Program" + Eat "The Menu" — #1622/#1623.)*
>
> **Prior session handoff: [`docs/HANDOFF-2026-07-08.md`](HANDOFF-2026-07-08.md)** —
> **Self-serve training for coach-less members** (spec #1616 → build #1618, on `main`):
> the coach-less member had no workout to log and no way to author one — now a
> **Build-your-week door**, a full **`BSWorkoutBuilder`** (any discipline — strength
> sessions that repeat weekly, or multi-week programs incl. marathon/half/10K/tri/Hyrox
> with a member-chosen length or a race date), **✦ Draft it for me** (`/api/ai/draft-program`,
> human-in-the-loop), an **open log-as-you-go session**, and **Start-this-plan** for
> purchased plans. Foundation = one migration (`client_workouts.trainer_id` nullable +
> client self-CRUD RLS + notify guard) so the deck/home/calendar/live-session/+10/auto-share
> all read self rows unchanged; 3 pure tested modules; atomic plan re-start; windowed plan
> route. All 6 review findings fixed. Also this session: the Nora Support-chat avatar
> (#1617 — face on every message, text-only masthead). Open: on-device pass; coach read of
> self plans; website builder parity.
>
> (Prior: [`docs/HANDOFF-2026-07-06b.md`](HANDOFF-2026-07-06b.md) —
> **The Shape Score wave** (7 PRs, all on `main`): session-details **pace bars + "The
> Splits" page + zoomed THIS-TIER ladder** (#1557); **meal logging → +10/day** + habit
> points reconciled to **+3** (#1558, migration); **"THE RECORD"** — a full Shape Score
> **history + report** page (mobile + website): header register, cumulative trend with a
> **1W/1M/3M/All** toggle, by-source bars + penalties, day-grouped filterable history —
> new `scoreHistory.mjs`+`.ts` twin + `GET /api/client/score-record`, no migration (#1560);
> a **day + timezone award clamp** pinning `award_workout_session`/`award_meal_log` to
> *today in the member's own IANA zone* — closes the backfill farm, and **closed a live
> `shape_user_tz` timezone-leak** (revoke from public+anon+authenticated, verified live)
> (#1561, migration); uniform **24px home slate boxes** (#1562); and **Record chart fixes**
> (trend-gap → plain line, wrapping history filters, demo spans months) (#1563). Open: the
> on-device pass + product photography.
>
> (Prior: [`docs/HANDOFF-2026-07-06.md`](HANDOFF-2026-07-06.md) —
> **The July Open Ledger sweep completed**: Shape Score **"The Standing"** + Shape Store
> **"The Shop/Drop" (S8)**; spec #1549 + build #1552 (`6c9ba588`), new `scoreStanding.mjs`
> + tests, presentation-only; CodeRabbit caught 2 real bugs pre-merge.)
>
> (Prior: [`docs/HANDOFF-2026-07-04.md`](HANDOFF-2026-07-04.md) —
> **The redesign wave, all shipped live**: Session Details "Open Ledger" (#1523 + #1525 gutter),
> the Home **"Front Page" hybrid** (#1527), the feed **"Wire Dispatch"** rebuild (#1528, spec
> #1526), and a four-fix **polish batch** from owner screenshots (#1529 — aligned ledger stat
> columns · Splits + Cadence → horizontal Strava-style bars · Home slate right-edge clip fix ·
> demo coach-notes removed). Full review gauntlet each time (adversarially-verified plans,
> per-task gates, whole-branch reviews, CodeRabbit on the feature PRs). Open: on-device passes
> (Black/Sage/Cream) + the feed/Home chrome follow-up lists — see the handoff.
>
> (Prior: [`docs/HANDOFF-2026-07-03.md`](HANDOFF-2026-07-03.md) —
> **Quick read-only security pass** over the delta since the last full audit (0 P1 / 0 P2 / 1 P3)
> plus two UI fixes: the Score ladder's first-tier "Start" label takes the tier color
> (`score.jsx?v=17`) and the month-calendar masthead avatar shows the real self avatar. Merged
> without review per the owner's call; local mobile build was blocked by Windows Application
> Control on the oxide native binary — CI's Linux build unaffected.
>
> (Prior: [`docs/HANDOFF-2026-07-02.md`](HANDOFF-2026-07-02.md) —
> Per-coach **waiting room** (#1495) — members join an at-capacity coach's list, the coach
> invites with a 7-day first-dibs window, a paid checkout claims the spot. Built then reworked
> **RLS-authoritative** (caller-scoped writes + own-row policies + a `guard_cols` trigger;
> auth-checked `SECURITY DEFINER` RPCs for position/room/invite; admin only for notify + the
> Stripe webhook) across **four CodeRabbit review rounds** (incl. a Postgres reserved-word fix
> and an at-capacity INSERT gate); coach discretion on invites (CodeRabbit accepted). Squash-
> merged `4f1805fa`, CI green, 0 unresolved threads, branch kept, migration applied.
>
> (Prior: [`docs/HANDOFF-2026-07-01.md`](HANDOFF-2026-07-01.md) —
> Two 2026-07-01 sessions. **Latest:** web **notifications dashboard + reminders parity** in the
> client Settings page (#1483 — mobile `BSNotifyPrefs`/`BSReminderManager` ported, wired to the
> live notification-center tables via `get_notification_center()`; no new route/migration),
> **iOS push-entitlement prep** + Mac-side build checklist (#1484), and the **coach-marketing
> funnel docs** (#1485). All 3 squash-merged, CI green, branches kept. **Earlier same day:** the
> full **security audit + P1/P2 remediation** (#1471–#1481 + docs #1482) — reports
> `docs/SECURITY-AUDIT-2026-06-30.md` + `docs/REMEDIATION-2026-06-30.md`; all 6+1 migrations applied.
>
> (Prior: [`docs/HANDOFF-2026-06-30.md`](HANDOFF-2026-06-30.md) —
> Review + merge session: the **6 open PRs (#1462–#1467) are all squash-merged to `main`**,
> CI green, branches kept — weekend-split **training dimension** (#1462), atomic sources-merge
> (#1463), drop race-route fallbacks (#1464), CLS font fallbacks (#1465), dead-`mktHue` removal
> (#1466), and the long-paused **Shape Radio live player + Nora avatar-DJ** (#1467). Every
> CodeRabbit finding addressed (CodeRabbit auto-resolved #1467's 7 on re-review; #1464's Critical
> is intentional service-role-by-design — replied + resolved). **Root-caused + fixed the #1467
> `public/m` sync failure**: a Windows-built mobile bundle can't byte-match CI's Linux build
> (Rolldown sourcemaps embed the build path + an `index.html` CRLF/LF drift + 3D-bundle
> nondeterminism) → `build.sourcemap:false` + an LF-normalizing Vite plugin, and commit **CI's
> own Linux build** of `public/m` for every bundle PR. #1462/#1463 migrations applied + on `main`.
>
> (Prior: [`docs/HANDOFF-2026-06-29.md`](HANDOFF-2026-06-29.md) —
> Big session, all shipped to `main` + verified live: the consolidated **"Today"** home
> card (check-in + hydration, mobile + web, #1451), a **Cumulative Layout Shift** sweep
> (preconnect + metrics-matched fallback fonts + reserved media dims, #1452/#1453), and a
> **race-condition hardening** sweep (10 races, 4 atomic-write migrations, #1454–#1459) —
> including an apply-time **live security fix** (`league_assign_cohort` was still
> `authenticated`-callable → self-promote vuln; revoked to `service_role` only + verified).
> All 4 migrations APPLIED + verified live.
>
> (Prior: [`docs/HANDOFF-2026-06-27.md`](HANDOFF-2026-06-27.md) —
> Big session, all shipped to `main` + verified live: sleep fast-follow (#1433 —
> stages/latency/respiratory from Oura, a tested recovery-READINESS score, a mobile
> sleep-detail page, coach surfacing + a dashSignals sleep-triage rule; also folded in
> the dead-sleep-log removal + the workout_set_logs `actual_*` write-time fix +
> backfill), supabase-js **SRI** (#1434), Steps/Progress **card redesign** + "Shape steps"
> rename (#1435), an **accurate + complete Shape Score legend** (#1438), **Shape Steps →
> points** (#1439) + a **CRITICAL** repair of the award-RPC dedupe (a partial-index bug
> that blocked ALL point-awarding), and a first-launch **"How Shape Score works"
> explainer** (#1440). **All migrations APPLIED + verified live** (sleep-detail,
> backfill-workout-set-log-columns, step-points, score-ledger-dedupe-fix). `main` clean;
> branches kept.
> (Prior: [`docs/HANDOFF-2026-06-26.md`](HANDOFF-2026-06-26.md) — sleep-logging redesign #1430;
> [`docs/HANDOFF-2026-06-25.md`](HANDOFF-2026-06-25.md) — daily steps/NEAT #1415.)
>
> **All four 2026-06-19 migrations are APPLIED on Supabase** (owner ran them):
> `coach-credential-verification` · `user-reminders` · `coach-certs-public` ·
> `member-playlists-url-guard`. Every 2026-06-19 feature below is live end-to-end.
>
> **Supabase Pro is active (org upgraded 2026-06-23).** **Leaked-password protection
> (HaveIBeenPwned) is now ENABLED** (Auth → Attack Protection) — verified via the
> cleared security advisor. Pro also unblocks branch databases (isolated staging test
> data). War Room checklist refreshed — applied migrations + shipped features checked
> off (255 done / 10 pending / 24 manual).

### 2026-07-13 — Home + Today polish batch (owner screenshots ×4)

- **Habit rows sit flush left** (`BSSlateRow`): untimed rows (the DAILY HABITS
  block) drop the 44px time column entirely — the DO/AVOID tag + name start at
  the page gutter instead of hanging on a blank time gutter. Timed rows
  unchanged.
- **The lead's CTA row is ONE text-action** (`_leadBlock`): the boxed tinted
  "I'll train today →" button and the "Preview →" link both opened the SAME
  workout preview (`setShowWorkoutPreview`) — the box look dies (plain mono
  text-action in the lead's accent, 44px hit area) and the redundant Preview
  link dies with it.
- **The Today check-in page joins the Open Ledger** (`BSTodayCard` — the
  "How are you." page): the tinted clipped plates die for zero-box stations on
  hairline rules — accent ticks ride the ENERGY/HUNGER/SLEEP/RESTED/HYDRATION
  eyebrows, the gauges become bare squared hairline tracks with heat fills
  (segment ticks + end-knob kept, 34px tap rows kept), the sleep hour chips +
  hydration undo go underline-style, LOG TODAY keeps the clipped teal CTA (the
  page's one action). Data flow, optimistic writes, and honest gating verbatim.
- **The INSIDE. doors join the index** (`BSShelfDoor`): the boxed 2×2 tile
  shelf (STEPS · GOAL · PROGRESS · SHOP LIST) becomes stacked **dot-leader
  index rows** in the same grammar as the SESSIONS/AVG KCAL rows above — 86px
  mono label · dotted leader · figure + status · accent chevron; the old
  bottom progress sliver now fills the row's own hairline (`pct`). One
  component, all four doors (BSMeGoalCard + BSProgressDoor inherit).
- Verified: JSX parse · PowerShell `/m/` build exit 0 · LF.

### 2026-07-13 — Saira is the app's display face (owner call: "lets do saira")

- **`DISPLAY_BS` → `'Saira', 'Space Grotesk', …`** — every page/card title now
  speaks the wordmark's face (the splash logotype the owner picked), Space
  Grotesk kept as the fallback. The 12 per-component `SERIF`/`SANS` aliases of
  the same literal in the client module follow the swap (one sed, same stack).
- **The bundled Saira was already a VARIABLE font (wght 100–900)** — the
  original `fonts.css` declared its three subset files (font-22/23/24.woff2)
  at static weights 100–400 only, so 600–800 titles would have rendered
  browser-faux-bold. The 12 static blocks are replaced by **3 variable-weight
  blocks** (`font-weight: 100 900`, same files, same unicode-ranges) — real
  bold, zero new assets, no bundle-size change. (Verified via fontTools: fvar
  wght 100–900; the woff2 flag-encodes known table tags, so a naive byte-scan
  for 'fvar' false-negatives — recorded so the next font check doesn't repeat
  it.)
- JetBrains Mono (instrument voice), Newsreader (editorial serif), and the
  system body stack deliberately untouched. Cyrillic (ru/uk) falls back the
  same as before (neither Saira nor Space Grotesk carry it).

### 2026-07-13 — Splash clean ground (#1709) + Home clean-up pass (owner on-device looks)

- **Splash (#1709):** the wire beat + `BSWireHold` drop the whole texture field
  behind the triangles (owner: "remove the background image/pattern behind the
  triangles") — the drifting dash ticker, the K waveform bed, and the M static
  flecks are gone from the splash; the floating haloed mark now sits on the
  clean dark gradient. Kept: the community plate, the ON AIR dial (incl. the L
  lock bars), the loading readout. `BSWireWaveform`/`BSWireStatic` + their
  keyframes died with their last callers; `BSWireGround` stays on the
  wall/invite/auth/provider-application pages (splash-only change).
- **Home — Concept B, "The Rail" (this PR; owner picked B off the home concept
  board, "but still want the week calendar view"):** the lead + slate become
  ONE rail-threaded run-sheet — a 2px teal rail runs the slate's left gutter;
  **the lead threads INLINE at its time slot** (a workout/meal lead renders the
  full lead block — serif head, compact moves, macros, CTAs, the hero-home tour
  anchor — in sequence at its time; the old "↑ lead" echo row is gone); untimed
  leads (engine / habits / the done-state) sit at the rail's head; a **breathing
  NOW tick** (reduced-motion → static) marks the current time between passed
  and upcoming timed rows, today only. The lead's `BSPlate` chrome died with
  the pick — Home now carries zero plates.
  Plus the strip the owner kept: the THIS-WEEK boxed day tiles die for the
  **#1622 calendar-rule grammar** (typographic day columns + activity dots
  under the section rule, accent needle over the selected day, localized aria
  states), and the two section-head chips (**Month view →** · **Eat →**) quiet
  to plain accent text-actions (44px hit areas). Door shelf untouched.
- Verified per PR: JSX parse · PowerShell `/m/` build exit 0 · LF; CodeRabbit
  round 1 (hit areas + localized aria) fixed in-PR.
- **Back buttons app-wide (#1711):** every back control is the plain mono
  **← BACK** text-action now (owner call) — the shared `BSBackButton` (behind
  `BSDetailHeader`'s 26 pages + ~20 direct sites) drops its bordered chip, and
  the ad-hoc bubbles (calendar month, Shape Sets, Nora sheet pill, day-brief
  boxed CTA, meal-logger serif back, Session-details circled `‹` pair) strip
  to the same grammar. Month-nav `‹ APR` controls untouched (not back buttons).
- **Calendar month view unboxed (this PR; owner approved the before/after
  preview):** the 31 bordered day cells die for **hairline week rows** of bare
  numerals + kind dots (selected day = a filled accent disc, today = an accent
  numeral, min 44px targets, aria carries the per-day item count); the
  per-cell **count numeral is gone** (the dots already carry it); the dot
  colors move onto the **house tokens** via the ONE `_BS_CAL_ACCENTS` map —
  training rust · meals teal · check-in blue · consult/plan gold (the old
  private workout-amber/meals-blue/check-in-green palette died) — resolved at
  render (`accentOf`) so the grid dots, legend, AND the day-list spines can
  never disagree (live server events + demo arrays alike); and the month
  tally line becomes a **figure-over-label register** (This month · Done ·
  Ahead, done in teal). Event data, taps, and the event sheets unchanged.

- **Closes the War Room P2** ("Adjust → full program/plan regeneration"). The
  coach Adjust page's Apply used to write `detail.training` + the note while
  the mobile deck applied it at DISPLAY time only — the calendar, website, and
  coach views all showed the unadjusted plan, and the *sessions/week* +
  *weeks remaining* steppers were decorative. Now Apply **regenerates the
  client's real upcoming coach-authored `client_workouts` rows**, so every
  surface reads the same adjusted plan from the same rows.
- **Migration `2026-07-13-adjust-regeneration.sql` — ⚠ OWNER applies** (raw
  link on the PR): **`regenerate_client_workouts`** — transactional SECURITY
  DEFINER RPC (deletes + inserts + repeat patches commit atomically; caller
  must be the client's active training coach; every id re-validated in-body
  as the caller's own, strictly-future row; inserts FORCED onto the caller's
  trainer row; 200/200/50 bounds) + `notify_on_client_workout` amended to
  skip while the transaction-local `shape.adjust_regen` flag is set — ONE
  note per Apply, never a per-row notification storm. EXECUTE revoked from
  public/anon (the #1459 grant lesson). **Pre-migration Apply degrades to
  today's detail+note behavior** (PGRST202 detected).
- **Pure `mobile-app/src/services/adjustRegen.mjs`** (+
  `tests/adjust-regen.test.mjs`, 10 vectors — suite **632**): the planner
  emits `{inserts, deleteIds, repeatPatches}` under the spec's invariants —
  **base-load scaling** (`baseL` preserved on first regeneration; deload →
  progress re-derives from base, repeated identical Applies are a no-op by
  construction), **stable deterministic weekday remapping** (a weekday still
  in the new split STAYS PUT; displaced days map onto unused split days
  ascending; overflow deletes), **strict-future scope** (today's row — maybe
  in progress/logged — never touched), **rest days patch weekly-repeat
  sources too** (an emptied repeat deletes — nothing resurrects), **weeks
  horizon** trims/extends (182-row cap, `program.week` bumps on extension).
  The scaling constants moved HERE as the one source of truth —
  `bsClientWeekDemo` imports them (its local copy died).
- **Row-scoped double-scale guard**: regenerated rows carry
  `payload.adjustGen`; the plan route + deck thread it and
  `bsApplyTrainAdjust` skips display scaling only for rows matching
  `detail.training.gen` — a row Assigned after the regeneration keeps
  today's display behavior. `detail.training` gains `gen` only when the RPC
  actually committed.
- **Wiring**: new `window.ShapeAdjustRegen.apply` (shapeBackend — reads the
  coach's own authored rows under RLS, runs the planner, calls the RPC,
  UTC-date basis matching the RPC's validation); `BSProAdjustProgram.apply()`
  regenerates BEFORE writing detail/note, aborts honestly on failure, and
  toasts when the extension hits the row cap.
- **Website nutrition-targets parity** (the spec's companion fix): the plan
  route now exposes `meals.coachTargets` from the same `detail.nutrition`
  the mobile Eat hero reads; `dashNutri.jsx` prefers it over the menu's
  authored day targets (`?v=20260713` on ClientApp + ClientNutri). Nutrition
  stays the target-override model by design — menu regeneration would
  fabricate food the nutritionist never wrote.
- Verified: `npm test` **632** · `tsc --noEmit` 0 · JSX/module parses ×5 ·
  PowerShell `/m/` build exit 0 · migration column/guard shapes validated
  read-only against prod (client_workouts types · trainer RLS policies ·
  is_discipline_coach_on_client contract). War Room: P2 flipped done + the
  OWNER migration item registered.

### 2026-07-13 — Coach roster ＋ADD → the real add-client flow (invite with your listing attached)

- **Closes the Coach Ledger wave follow-up**: the roster's ＋ADD (and the
  empty-roster CTA) dispatched `shape:openProSettings` — a placeholder that
  dumped the coach on the settings hub. Now it opens **`BSProAddClientSheet`**
  (both roles, role-heat, the monthly-offer sheet shell + portal).
- **Honest model** — a client joins a roster by SUBSCRIBING; a coach can't
  unilaterally link someone. So the sheet offers the two real growth moves:
  **(1) Invite a member on Shape** — debounced live member search
  (`search_shape_people`, clients only, self excluded) → a real 1:1 DM
  (`getOrCreateMemberConversation` + `sendMessage`) stamped
  `metadata {kind:'coach_invite', role, providerId, name}`; **(2) Share your
  listing link** (native share / clipboard). The invite needs the coach's own
  provider row — new **`ShapeCoachLookup.mine()`** (owner→provider) — and the
  sheet says so honestly when the account has no listing yet (application
  pending) instead of sending a card that opens nothing.
- **The member's chat renders a tappable invitation card** ("{Coach} ·
  Trainer/Nutritionist · Invitation · View listing →", role-heat frame) that
  deep-opens the coach's marketplace **Listing** (the #1634 conversion page):
  `shape:openMarket` now carries `{role, coachId}` → the shell's new
  `marketCoach` → `BSMarketplaceScreen initialCoach` → once live providers
  load, the matching coach's Listing opens directly (an unknown/unpublished
  id honestly stays on the directory). Card mapped on **all thread paths**
  (both shapeBackend mappers, the coach-thread remap passthrough, and the
  open-thread realtime append — the #1514 live-boost lesson).
- Verified: JSX parse ×3 + `node --check` (shapeBackend) · `npm test` 622 ·
  PowerShell `/m/` build exit 0 · LF. No migration, no new route (rides the
  existing conversations/messages rails + RLS). War Room: registered done
  under Marketplace & coach profiles.

### 2026-07-13 — Audit PERF-2: the accountability cron's per-client N+1 batched

- **Closes audit finding PERF-2** (`docs/SECURITY-AUDIT-2026-06-30.md` §5):
  `/api/cron/score-accountability` ran **3 SELECTs per client** (kept
  sessions · recent assigned workouts · active daily habits) — ~3N read
  round-trips per daily run. Now the candidate reads are **batched per chunk
  of 50 clients** (`.in('client_id', ids)` ×3, `Promise.all`, grouped in
  memory) and the per-user loop drives off the groups — ~50× fewer read
  round-trips, bounded per query so PostgREST's row cap can't truncate a
  batch.
- **Semantics unchanged where they matter**: every per-row SECURITY DEFINER
  RPC call (`award_session_kept` / `apply_obligation_penalty` /
  `settle_commitment`) is untouched — the fairness guards (recency · pause ·
  −30/wk cap · 0 floor · idempotency) all live in the RPCs, which were never
  the N+1. Same windows, same never-shaming notification. Fail-open is now
  **per chunk** for the batched reads and stays **per user** for the RPC loop.
- Verified: `tsc --noEmit` 0 errors · `npm test` 622. War Room: PERF-2
  registered done in the audit checklist.

### 2026-07-13 — Per-endpoint paid-feature enforcement: requireMembership() in every gated route (security P2)

- **Closes the War Room P2** ("Per-endpoint paid-feature enforcement beyond
  the proxy gate"). The edge proxy's membership gate deliberately FAILS OPEN
  (a gate fault must never take down the API) — which made it a paywall, not
  access control: a fail-open exception, matcher drift, or a route moved
  outside the gated prefixes would serve paid features to a signed-in
  non-member with no second line of defense.
- **New `src/lib/require-membership.ts`** — `requireMembership(request)` runs
  at the TOP of **every handler under the gated prefixes** (65 handlers /
  47 route files: client · nutrition · ai · insights · calendar ·
  conversations · messages; `ai/notify/cron` excluded — CRON_SECRET-authed,
  no user session). Returns null (proceed) or the 401/402 the route returns.
- **Zero steady-state cost — the proxy stamp.** After the edge gate verifies
  a gated request it stamps **`x-shape-gate: member`** onto the forwarded
  request headers (refreshed auth cookies carried over); the middleware
  **strips any incoming value on every request** (the matcher covers all
  gated paths), so the header is proxy-issued only — never caller-spoofable.
  The route helper trusts the stamp as its fast path (a header read); the
  full `computeMembership` re-check runs exactly when the stamp is absent —
  i.e. when the proxy didn't do its job. Constants live in the edge-safe
  `membership-core.ts`.
- **Failure semantics mirror the proxy's availability call**: an enforcement
  FAULT fails open with a loud log — two independent layers must now fault
  simultaneously before a non-member reaches a paid feature, and a DB blip
  still can't 500 the paid API. A verified non-member gets the same 402
  `membership_required` either way.
- **Gotcha caught in-diff:** `client/train/route.ts`, `nutrition/meal-log/
  route.ts`, and `src/lib/supabase/middleware.ts` are **CRLF-tracked** (like
  Pricing.html/Community.html) — the sweep initially LF-normalized them into
  whole-file diffs; restored to CRLF so the diff is only the insertions.
- Verified: `tsc --noEmit` 0 errors · `npm test` 622 · every gated route
  imports the helper (grep-audited) · War Room gap flipped to the security
  checklist as done.

### 2026-07-13 — Coach calendar "Mark complete" is real (sessions status write) + honest booking reschedule

- **Closes the goals-flow wave follow-up**: the coach calendar event sheet's
  "Mark complete" only fired a fake `Logged ✓` toast — nothing was written, so
  the accountability cron's kept-session read (`sessions.status='completed'` →
  `award_session_kept` +12) could never fire from the calendar. Now a live
  coaching booking viewed by its coach carries a real **Mark complete** →
  `POST /api/sessions/manage {action:'complete'}` (the route re-checks coach
  ownership server-side), honest success/failure toasts, and a month reload;
  an already-completed booking reads **Completed ✓** and maps to the calendar's
  `done` row state.
- **Wiring**: `_bsMapServerCalEvent` now carries `sessionId` / `status` /
  `reschedulable` (the calendar GET always sent them; the mobile map dropped
  them); `manageSession` (shapeBackend) forwards `date`/`time` for the
  reschedule action.
- **Honest reschedule**: the sheet's date picker used to toast a fake
  "Rescheduled" on ANY live non-editable row. Now a coach's still-active
  booking really moves (`action:'reschedule'`, same wall-clock slot on the new
  date — server-validated + the client is notified via the route's existing
  `session_rescheduled` notification), a video booking keeps a **Join →**
  secondary, and rows that can't be moved (a client's live booking, completed
  sessions, derived plan events) hide the Reschedule button instead of lying.
  Signed-out demo behavior unchanged.
- Verified: JSX parse + `node --check` · `npm test` 0 fail · LF.

### 2026-07-13 — Beat layers L + M: signal lock + static calm (owner picks off the backgrounds board)

- **The last two optional beat layers ship** (backgrounds board frames L + M —
  the "K" waveform bed shipped #1683): **L · signal lock** — four tiny teal
  bars beside the tuning dial's ruler (heights 5/7/9/11, staggered 0.22s) that
  light exactly while the needle sits on the station (`bsWireLockOn` shares
  the dial's 13s `bsWireTune` timeline, lit 44–58%); **M · static calm** —
  34 sparse static flecks (`BSWireStatic`, seeded-LCG positions — same field
  every launch, no Math.random) that shimmer while the needle hunts and
  settle to near-nothing once it locks (`bsWireFlick`, settled from 42%).
- Both layers ride the beat AND `BSWireHold` (the mirror contract from
  #1682); the lock lives inside `BSWireDial` so both surfaces inherit it.
  **Timing note (by construction):** the ~3.5s beat shows a slice of the
  shared 13s cycle — the lock/settle payoff lands on the HOLD and slow
  boots, same as the needle's station landing.
- **Reduced motion**: bars LIT (locked) + static settled (0.05) — both
  browser-verified via `emulateMedia` on the built bundle, along with the
  live composition (34 dots + 4 bars beside the dial, x 334–348 @ 390w — no
  edge clipping).
- Decorative only (aria-hidden, pointer-events none); stage machinery
  untouched. No route/migration.

### 2026-07-13 — The share card PR B: web dashboard parity (#1700 spec · #1701 build)

- **Closes the share-card wave's web half** (parent spec #1692's "PR B (later)"
  candidate): members on the website dashboard fire their own activity as the
  same story-ready **1080×1920 fixed-dark PNG** the app renders — desktop's
  outcome is the **PNG download** (the renderer's existing fallback is the
  web's primary path); share-capable browsers get the OS sheet.
- **One renderer, one implementation** — `shareCard.mjs` + `mealShare.mjs`
  MOVED to `public/newdesign/` as the canonical copies (the `dashSignals.js`
  pattern): the six feed shells load them as **native ES modules** via a
  one-line loader (`window.ShapeShareCard`, absolute `/newdesign/…` URL,
  assigned before DOMContentLoaded — i.e. before babel runs the page code),
  the mobile app imports them from `../../../public/newdesign/`, and the Node
  tests import them directly. Mobile behavior unchanged (imports re-pointed
  only).
- **`bsHeroStatIndex`** — the mobile feed card's `_primIdx` hero-promotion
  rule extracted into the canonical module (runs promote distance, lifts
  load, digits+unit fallback); the mobile card refactors onto it and the web
  feeds it the post's `workoutStats` with `isRun` from the #1684 bucket
  (+2 test blocks, suite **622**).
- **Web entry points** (`dashboardCommunity.jsx?v=20260713c` ×6 shells):
  SHARE on an **OWN real post** (the `isMe && isLive && id` gate EDIT/DELETE
  use) opens a link/image **chooser**; the **Session details modal** header
  gains the same share (the mobile detail page's twin, chooser above the
  modal at z 130). Everyone else's cards, demo cards, and signed-out preview
  keep the direct link share byte-identically. `mapPost` passes through
  `createdAt` · normalized `route.points` · stamped `metrics.delta`
  (honest-absent).
- **Tier line** — `TIER · ROLE` resolved lazily from my own score endpoint
  (client vs coach ladder by role, dietitian → nutritionist), cache **keyed
  by the authenticated user id** (spec review round — no cross-account
  reuse), honest role-only fallback. A stale-cached shell (no module loader)
  degrades to link-share-only.
- **Spec review round (#1700, both fixed pre-merge):** the loader imports the
  canonical absolute URL (a shell-relative path could silently 404 into the
  degrade) + readiness by construction; the tier cache keyed by user id.
  **Build review round (#1701, CodeRabbit Major — fixed):** awaiting the tier
  FETCH inside the image tap could exhaust WebKit's **transient activation**
  (navigator.share then falls through to the download path on share-capable
  browsers) → the chooser **prefetches the tier on open**, the cache holds
  the in-flight PROMISE (dedupe + microtask resolve on tap), and the uid
  comes from the LOCAL session (`getSession`, no network on the tap path).
- Verified: JSX parse ×2 · `npm test` 622 · PowerShell `/m/` build exit 0
  (the re-pointed imports bundle) · LF · **branch-preview browser proof**
  (the .mjs serves `application/javascript`, `window.ShapeShareCard` exposes
  all six exports, and a full canvas draw produced a real 1 MB PNG with the
  route polyline — screenshot-checked). Open: the native
  `instagram-stories://` deep-link stays shelved until the iOS build.

### 2026-07-13 — The Work domain PR C: THE CROSSOVER — training × work reads, both surfaces (the wave closes)

- **PR C of the work-domain wave** (spec #1694) — the differentiator: Shape
  holds both halves of the data, so the engine can say what no one else can:
  *does work-habit completion move with training and sleep?*
- **One implementation, three consumers** (spec deviation, noted): the spec
  named a `crossover.mjs`; the computation lives in **`dashSignals.js` →
  `crossoverRead(days)`** instead — the shared engine the website loads as a
  script, the mobile app imports via `window.DashSignals`, and Node tests
  require directly — so the surfaces can never drift.
- **The exact statistic** (deterministic per spec): only days with ≥1
  scheduled work habit enter; completion rate `p = Σdone/Σscheduled` per
  side; training day = a real workout signal; sleep bands short <6.5h /
  long ≥7h with **[6.5, 7) EXCLUDED** and missing sleep excluded from the
  sleep comparison only; `gap = pA−pB` in pp with the two-proportion SE
  (n = scheduled days per side); **fires only at |gap| ≥ 12pp AND ≥
  1.65·SE**; floors span ≥ 21d + ≥ 8 scheduled days per side — below any of
  it the read is null and the card renders NOTHING.
  `tests/crossover.test.mjs` (6 vectors: floors · the gate · the exclusion
  band · missing values · both directions · garbage input; suite **619**).
- **Mobile — `BSCrossoverCard`** on the Progress hub Overall tab (the
  weekends card's sibling): assembles pre-bucketed days CLIENT-SIDE from the
  cached progress series (volume → trained; sleep hours) + the member's
  `domain:'work'` habits (scheduled from creation day, done from the
  completion history, LOCAL en-CA day keys), then renders never-shaming
  observation + move copy binding the COMPUTED gap (*"Your work habits land
  {gap} pts more often on days you train — protect the session."*) with an
  honest mono register underneath. Signed-in only.
- **Website — a conditional THE CROSSOVER widget** on the Progress dashboard
  (`dashProgress.jsx?v=20260713`, slate `#7aa7dc` accent): same assembly,
  same shared read, exists ONLY when the read fired (live only, never a demo
  figure). `dashSignals.js?v=20260713b` across all referencing pages.
- **Review round (5 findings, all fixed pre-merge — `f63426d7` +
  `91fd73e7`; merged `a52d75ff`):** Codex P2 — the card's raw same-origin
  habits fetch dies on a NATIVE build → a new native-safe
  **`window.ShapeHabitsData.list()`** (shapeBackend `getJsonOrDefault`,
  Bearer on native); CodeRabbit — the observation copy moved into
  **`crossoverCopy`** in dashSignals (words AND numbers share the no-drift
  guarantee; +1 binding test) which also fixed the garbled negative-sleep
  sentence once for both surfaces; a sleep-only read spells out its subject
  ("Your work habits…" — no dangling "They"); loop-based span min/max (no
  `Math.max.apply` RangeError on unbounded input); `npm test` switched to
  glob discovery (`node --test "tests/**/*.test.mjs"` — the bare `tests/`
  form fails on Windows). Suite **620**.
- **The work-domain wave is COMPLETE**: #1694 spec · #1696 PR A (habits
  + THE WORK station) · #1697 PR B (THE APPOINTMENTS + the +25/mo career
  award) · #1698 PR C (this) — all merged; both migrations applied +
  verified live (incl. the PR B month-bucket re-run). Open: the owner
  on-device pass (work chips → WORK tags · THE WORK station · a milestone
  post → "Onward" + the +25 chip · the crossover card once ~3 weeks of
  work-habit data accrues).

### 2026-07-13 — The Work domain PR B: THE APPOINTMENTS — milestones on the wire + the +25 career award, both surfaces

- **PR B of the work-domain wave** (spec #1694). Old broadsheets ran an
  *Appointments* column — who was promoted, who joined which firm; Shape's
  wire gets one. Work milestones are share-by-choice posts with their own
  card grammar, verb, filter, and a rarity-capped Shape Score earn.
- **Composer (mobile)**: the Log-activity sheet gains a **Milestone** type —
  stamp picker (*PROMOTED · SHIPPED · CERTIFIED · NEW ROLE · LAUNCHED ·
  MILESTONE*, canonical tokens in `BS_MILESTONE_STAMPS`), required headline
  (≤80), optional detail (≤140, OMITTED when blank). Stores
  `metrics {kind:'milestone', stamp, detail}` + `activity_type 'milestone'`
  + `skipAward` (the +5 never fires client-side; the RPC guard covers the
  web path). **No organization field and no compensation fields exist at
  all** — money is this domain's calories.
- **Migration `2026-07-13-work-milestone-points.sql` — ⚠ OWNER applies**:
  `career` joins the score_ledger category CHECK; **`award_work_milestone
  (p_post_id)`** (SECURITY DEFINER, self-scoped, returns `granted`) validates
  the FULL milestone shape server-side (caller-owned post · kind · canonical
  stamp · real bounded title), grants **+25** with a per-month deterministic
  source_id (member tz via shape_user_tz) — `ON CONFLICT DO NOTHING`, so a
  same-month duplicate is a successful no-op returning `granted=false`;
  EXECUTE revoked from PUBLIC/anon, granted to authenticated;
  `award_community_post` excludes milestones (the meal-guard pattern — no
  +5 double-dip).
- **Award wiring**: the claim is **AWAITED** at post time
  (`window.ShapeCareerAward.claim` — the toast "+25 · Career · Shape Score"
  shows ONLY on `granted=true`); a failed call queues the post id in
  localStorage and the **open-time catch-up** re-fires it on session resolve
  (the goal-milestone precedent) — the award can never be permanently lost.
- **Card**: **THE APPOINTMENTS** block on BSActivityCard (flanked mono rule ·
  the stamp as a squared heat chip · the detail line only when stored — the
  headline IS the card title, never repeated); milestones carry NO stat row
  (no fabricated "Activity" stat); "Programmed by" suppressed (training
  grammar). New **`career` reaction bucket → "Onward"** keyed off the exact
  `activity_type 'milestone'` token (never name regex — "milestone madness"
  the workout still reads Props; a training PR still reads Beast; +1 test,
  suite 613). **Milestones chip** joins the feed type row; `bsFeedTypeMatch`
  files milestones under MILESTONES only (never workouts/PRs); demo set
  gains one milestone card.
- **Website parity** (`dashboardCommunity.jsx?v=20260713b` ×6 shells):
  composer Milestone kind (headline + stamp chips + detail), `bucketsFor`
  milestone branch, MILESTONE tag pinned by `metrics.kind`, career
  milestones join the existing **MILESTONES** tab, `MilestoneStamp` block on
  the card, and the **awaited award on the real post id** with a
  granted-only toast.
- **Legend/Record**: `career: 'Career milestones'` in the score API labels;
  "Career milestone +25 · Monthly" joins the mobile earn list + the website
  Score legend (`score.jsx?v=22`); `Career` added to both Record label twins
  (`scoreHistory.mjs` + `.ts`) so the by-source bars pick it up.
- **Review round (4 findings, all fixed — `ef7f4bd3`; merged `5822c065`):**
  Codex **P1** — the award bucketed its month from `now()`, so a catch-up
  claim retried after month rollover credited the NEW month and consumed its
  slot → the RPC now selects the post's `created_at` during shape validation
  and buckets from THAT timestamp in the member's tz (**migration revised —
  owner RE-RAN it; verified live ×5 checks** incl. buckets-from-post-date +
  anon=f/authd=t). Codex P2 + CodeRabbit Major (same gap) — the WEB claim had
  no retry: it now mirrors mobile (a failed `award_work_milestone` queues the
  post id in `localStorage` and a Community-page-load catch-up re-fires it —
  the never-lost guarantee holds on both surfaces). CodeRabbit nit — the
  three canonical stamp lists (SQL · `BS_MILESTONE_STAMPS` ·
  `DC_MILESTONE_STAMPS`) carry KEEP-IN-SYNC cross-references.
- Verified: JSX parse ×4 · `node --check` ×3 · `tsc --noEmit` clean ·
  `npm test` 613 · PowerShell `/m/` build exit 0 · LF.

### 2026-07-13 — The Work domain PR A: work habits + THE WORK station, both surfaces (#1694 spec)

- **PR A of the work-domain wave** (spec
  `docs/superpowers/specs/2026-07-13-work-domain-design.md`, #1694 — merged
  after a CodeRabbit round of 8 findings, all fixed; owner additions during
  the brainstorm: the work goal area, milestone Shape Score points, and
  **website parity on every PR** of the wave — the spec's build plan is
  amended accordingly in this PR).
- **Work habits (mobile)**: the add-habit sheet gains a **WORK chip row**
  (t.BLUE — *Deep work block · Read 20 min · Plan tomorrow's top 3 · Applied
  to one job · Inbox zero by 5* / *No doom-scrolling at the desk · No email
  after 8pm · No phone the first hour*) + a **Work habit toggle** for
  hand-typed ones. Picking a work chip STAMPS `domain: 'work'` — never
  inferred from the name; a plain chip clears it. The stamp rides the habit
  encode/decode + server map; rows read a **Work ·** marker on the Habit
  Ledger and the home slate tags **Work** in `t.BLUE` (the checkbox keeps
  the do/avoid color). Same +3 as every habit — zero scoring change.
- **Migration `2026-07-13-habit-domain.sql` — ⚠ OWNER applies**: nullable
  `user_habits.domain` (CHECK `in ('work')`), additive + idempotent. Code
  degrades cleanly pre-migration: the habits GET now reads `select('*')`
  (migration-safe pattern) and the create route **retries without the
  column** on an unknown-column error.
- **THE WORK station (mobile Goals)**: a third station beside
  Training/Nutrition — headline (`workMeta`, edited in the headline sheet
  with a `t.BLUE` accent) over supporting targets (`work[]`), work templates
  in the picker (*Promotion case · New role · Network · Certification ·
  Deep work · Books · Ship the launch · Side project* under Career/Skills/
  Projects), a Work anchor in the index, honest empty state. Rides the
  existing `user_goals('client_goals')` doc + the same share-with-coaches
  toggle; `saveGoal`/`deleteGoal` were already tab-generic.
- **Website parity**: `goalsFromDoc` (dashSignals.js — the shared engine the
  app imports too) folds `doc.work` targets through the SAME self-set
  custom-goal path as training/nutrition, so the Goals dashboard renders
  them with projections; the demo doc gains a work sample. The Habits page
  (`clientHabits.jsx`) gains the work stamp on add (confirm-prompt, matching
  its prompt-based flow), maps `domain` from the server, and tags **WORK**
  (slate) on rows. Cache-busts: `dashSignals.js` + `dashGoals.jsx` +
  `clientHabits.jsx` → `?v=20260713` across all 19 referencing pages
  (byte-safe replace). *i18n note:* the new `home:tag.work` key falls back
  to its English defaultValue pending the paused i18n rollout.
- **Review round (2 findings, both fixed — `965961c6`; merged `404986d5`;
  migration APPLIED + verified live):** Codex P2 — a member sharing ONLY
  work goals read as "no goals shared yet" to their coach → the shared-goals
  block renders the WORK headline + counts `workMeta` toward the emptiness
  check on BOTH surfaces (the mobile Case File + the website client page,
  `coachClientDetail.jsx?v=20260713`); CodeRabbit — the pre-migration create
  retry branches on stable error codes (`42703`/`PGRST204`), not message
  text.

### 2026-07-13 — The share card: activities as story-ready images (#1692 spec · #1693 build)

- **Why**: the Share button sent text+URL — Instagram takes that only as a
  DM; Stories/feed are image-only. The Strava pattern: every PR screenshot
  is an ad. Spec `docs/superpowers/specs/2026-07-13-share-card-image-design.md`
  (owner pick, "lets do 1"; CodeRabbit was rate-limited on the spec PR —
  merged on the owner's review).
- **#1693 — shareCard.mjs**: canvas-drawn **1080×1920** brand card (never a
  DOM screenshot), fixed-dark wire grammar on every paper. Pure tested
  helpers: `bsShareCardModel` (honest-absent: empty rows drop, hero never
  repeats, delta null when blank, routes need 2+ finite points),
  `bsWrapText`, `bsFitRoute` (zero-spread → null — never a fake line from
  one GPS spot). Types: workout/run (hero + registers + the REAL route
  polyline, teal glow), PR (stamped delta), meal (THE PLATE via
  bsMealMenuLines — meal-wave guardrails verbatim).
- **bsShareCardImage**: fonts best-effort → toBlob → File →
  `navigator.canShare({files})` → OS sheet (Instagram offers Stories);
  desktop → PNG download; abort silent; failure honest toast. No uploads,
  no analytics — nothing leaves the device beyond the share sheet's file.
- **Entry**: OWN real cards' Share → a link/image chooser
  (BSPostSheetShell); lands on community feed + profile activities
  automatically (both render BSActivityCard). Other members' cards keep
  the direct link share (own-only per spec). **Review round (both fixed
  pre-merge, `bdb04872`)**: the Session details page gained the share
  action too (Codex P2 — the spec named it as an entry point; the chooser
  extracted to ONE shared `BSShareChooser` for card + detail, and
  `BSPostSheetShell` took a `z` override to clear the detail's z-99990
  layer), and `bsWrapText` now ellipsizes a token wider than the column at
  placement (CodeRabbit — no emitted line can overflow the card; regression
  test). Suite 612.
- **PR B candidates (later)**: web dashboard parity · native IG Stories
  deep-link once the iOS build exists.

### 2026-07-12 — Meals on the wire: share-by-choice meal posts (#1686 spec · #1687 PR A)

- **Spec #1686** (owner-approved direction + 3 review rounds): share by
  CHOICE per meal (default off, never auto — no #1613-style auto-share for
  meals, ever), the plate not the ledger, no +5 on meal shares, no calorie
  leaderboards/lightest-plate framing anywhere ever, attribution only when
  true, THE PLATE card distinct-but-in-grammar, the filter says NUTRITION on
  both surfaces. `docs/superpowers/specs/2026-07-12-meal-share-feed-design.md`.
- **#1687 (PR A, mobile + migration)**: `Post to the wire →` on BSMealLogged
  (pending-guarded; Undo retracts the post by persisted id, failed delete
  toasts honestly; signed-in only) · pure `mealShare.mjs` payload builder
  (meal macros only, honest-absent recipeId/coach, skipAward always true;
  9 tests, suite 601) · `createCommunityPost` gains non-persisted `skipAward`
  (gate `!autoShare && !skipAward` — NOT autoShare, whose auto-post semantics
  never touch a deliberate share) · **migration
  `2026-07-12-meal-share-no-award.sql` — ⚠ OWNER applies** (the RPC returns
  without inserting for meal posts; covers the web route path) ·
  bsActivityFromPost meal branch (kcal = the card hero) · **THE PLATE** on
  BSActivityCard (Menu grammar: flanked rule, dot-leader P/C/F, AS
  PLANNED/ADJUSTED stamp, "From {coach}'s plan"/Kitchen Card attribution;
  "Programmed by" suppressed on meals) · **Nutrition** chip joins the #1684
  row (meals file under Nutrition ONLY). Verb = LOCKED IN via the existing
  nutrition bucket — zero verb-system changes.
- **#1688 (PR B, web) — MERGED**: bucketsFor meal branch (`['meal']`, files
  under NUTRITION only) + **MealPlate** on the real-post card (kcal headline
  · dot-leader P/C/F · stamp + attribution) + **MEALS tab renamed
  NUTRITION** + the tag pill pinned by `metrics.kind` (activity_type
  defaults to 'workout' on this API — can't be trusted alone).
- **Migration APPLIED + verified live** (owner ran it 2026-07-12; RPC
  carries the meal guard on BOTH checks — `activity_type` and
  `metrics->>'kind'` — grants unchanged). The wave is COMPLETE both
  surfaces: #1686 spec (3 review rounds) → #1687 PR A (merged `765ca056`,
  4 findings fixed — the `{ postId }` shape bug meant Undo could never
  delete; the `stored:'local'` false-✓; the Undo/share race; honest-absent
  macros) → #1688 PR B (merged `2c57d7a7`, 2 findings fixed). Suite 601.
  **Honest-absent contract everywhere**: missing macros are OMITTED (never
  "0 g"), unknown planning state shows no stamp (never a default
  "Adjusted"), attribution only when true. Open: on-device pass (share a
  real meal → both feeds · Undo retracts · LOCKED IN verb · Nutrition
  chip/tab · score unchanged by the share).
- **#1691 (2026-07-13) — the freehand logger inherits the share**:
  BSLogMealFlow's "Logged." screen gains the same `Post to the wire →`
  (spec parity: default off · real-success gate · honest toasts; planned =
  hasPlanned && !dirty; coach attribution only for plan meals; post-portion
  macros). No un-log on this screen → no Undo coupling (the post stays
  owner-deletable from its feed card). Same PR: the War Room **"Calendar
  events still demo" Loop gap was STALE and is removed** — /api/calendar
  already synthesizes assigned workouts (dated + undated onto the current
  week, Home parity, `d41facca`) + the weekly menu on real dates, and
  BSCalendarScreen renders server events for every signed-in month (demo =
  signed-out only). Verified in code before removing.

### 2026-07-12 — The feed learns to file: activity-type filters, both surfaces (#1684)

- Closes the 2026-07-11 audit finding (real posts only appeared under
  ALL/POSTS on the web dashboard's tabs) and adds the filter the APP never
  had — owner: "yes lets build this, create a filter option on the feed".
- **Web (dashboardCommunity.jsx)**: `mapPost` now derives a **filter
  bucket** — workout / run / pr / post — from the post's REAL activity
  evidence (`metrics.kind === 'workout'`, non-empty `workoutStats`,
  `source_provider`, route points). The API defaults `activity_type` to
  `'workout'` even on plain notes, so the type string alone can't be
  trusted; a stamped `metrics.delta` files under PRs. `kind` stays `'post'`
  (the pr/run/workout demo renderers need fields the API omits — renderer
  contract untouched); the tabs filter on `p.bucket || p.kind`.
- **App (iosAppBroadsheetClient.jsx)**: the COMMUNITY stream gains an
  **activity-type chip row — All / Workouts / Runs / PRs** — under the
  Universal/Following lens, same `bsSubTab` grammar. Pure
  `bsFeedTypeMatch(a, t)`: buckets **non-exclusive by design** (a deadlift
  PR is also a workout; a PR'd race also a run); real cards key off
  `typeLabel === 'Run'` (endurance incl. rides/swims per bsActivityFromPost)
  and the stamped `delta`; demo cards key off `kind`. Honest filtered-empty
  state ("No runs on the wire yet." + one-tap **Show all →**); the chip is
  session-only (a sticky filter reads as a broken feed next open).
- Cache-busts: `dashboardCommunity.jsx?v=20260712` across all six shells.
- **#1685 follow-up (CodeRabbit's late findings on #1684)**: the web
  evidence gate widens to everything `hasSession` trusts (hr/pace/power/
  cadence/elev traces + zone durations) **plus a stamped `metrics.delta`**,
  so delta-only PRs and trace-bearing sessions never file as plain `post`
  (`?v=20260712b`). The RUNS-regex-breadth finding was DECLINED: the breadth
  deliberately mirrors the app's `isRun` endurance semantics (typeLabel
  'Run' covers rides/swims/walks) so the SAME post files identically on
  both surfaces — narrowing only the web side would recreate the drift
  this wave closed.

### 2026-07-11 — The beat goes wordless + the marketing site says "coach optional" (#1679 · #1680)

- **#1679 — the wire beat drops its INCOMING line** (owner: "remove the
  incoming message on the first splash page, just have the logos appear").
  The static teal `— Incoming · The Shape Wire · {name} —` line is gone; the
  beat is now mark-only (BSShapeMark `calm`, centered on the dash ticker),
  LOADING readout low, footer rule. The unused name lookup in the wire-beat
  branch went with it; stage machinery/dwell/routing untouched.
- **#1680 — self-serve marketing copy (War Room #1666 closes its web half)**:
  the feature has been live since #1618 (app) / #1664 (web) but the public
  pages never said so. index.html journey Stage 03 ("written by your coach,
  or built by you right in the app") + 01 — Train loop beat ("No coach yet?
  Build your own week — starter templates and custom programs, coach
  optional") · GetApp.html TRAIN step (same line) · Pricing "Build your own
  workouts — coach optional" bullet + the FAQ answer names self-built weeks.
  `pricing.jsx` had NO `?v=` tag in Pricing.html — added `?v=20260711`.
  War Room marketing-copy item → done. Also in #1680 (owner, mid-review):
  the index loop beat **"04 — Coach" → "04 — Community"** ("The social side
  of strong.", GetApp's established community line) — the beat was already
  showing the community screenshot (getapp-community-v2.png) under coach
  copy. **Gotcha for next time: Pricing.html AND Community.html are tracked
  with CRLF endings** (unlike the rest of the repo) — a blanket
  `sed 's/\r$//'` rewrites every line; restore with `sed 's/$/\r/'`.
- **#1681 — "remove kudos everywhere" (owner)**: the app never says "kudos"
  (ONE unified reaction count, verb from `reactionVerbs.mjs` — Spot / Beast /
  Respect / Props…), so the website now matches. community.jsx marketing
  footer: heart+KUDOS/REPLY → the app grammar (upward-arrow verb chip
  `VERB · COUNT` + comment-plate glyph + count; per-kind verb map with a
  pointer comment); demo entries gain counts. clientScore.jsx: "kudos" →
  "reactions" ×3. Cache-busts: community.jsx first `?v` + clientScore bump.
  Strava's never-rendered `kudosCount` + app-internal variable names stay.
- **Feed-parity backend audit** (owner: "check on the backend that posted
  activities will be the same for both"): ✓ one source of truth —
  `community_posts` (+likes/comments) under caller RLS on BOTH surfaces
  (app = direct Supabase via shapeBackend.js; web = /api/community/feed); ✓
  identical privacy semantics (app `feedMode.mjs` bsFeedQuerySpec ≡ the
  route's GET filter: universal `public+community`, following adds
  `followers` scoped to accepted follows + self; both created_at desc,
  limit 50); ✓ auto-share (#1613) posts render on both (web = post card +
  Session modal); ✓ like/comment counts from the same rows; ✓ the +5 post
  award is idempotent per post id (no cross-surface double-award). Two
  asymmetries, both latent/minor: (1) app-side write enrichment (coach/
  program credit, PR delta vs pr_wall_posts, PR-Wall ledger) doesn't exist
  in the web POST path — moot today since the web composer can't author
  structured workouts; (2) the web dashboard's filter tabs bucket by demo
  `kind`, and every REAL post maps to kind `post` — real activities appear
  under ALL/POSTS but not WORKOUTS/PRs/RUNS filters (app filters correctly
  by real kinds). Fix candidate if wanted: map `activity_type` → filter
  bucket in dashboardCommunity's `mapPost`.
- **#1682 — the beat goes ON AIR** (owner picks off the background board
  <https://claude.ai/code/artifact/42fa60d8-954d-43f6-bd56-688cd908d24b>):
  the community plate (THE SHAPE COMMUNITY · VOL. 1 · NO. 1) moves footer →
  TOP (rule beneath, safe-area padded); new **`BSWireDial`** — frequency
  ruler low + teal needle gliding between stations (bsWireTune 13s) + an
  ON AIR whisper (Shape Radio on the launch, decorative/aria-hidden,
  reduced-motion parks the needle); the **mark floats** (bs-wire-mark-float
  6.5s bob) inside a **breathing teal halo** (bs-wire-mark-halo 4.5s) over
  its existing calm pulse/glow — compositor-only, reduced-motion pins both.
  BSWireHold mirrors the identical composition (no beat→hold jump).
  Browser-verified on the built bundle.
- **#1683 — the waveform bed (owner pick "K" off the board)**: the radio
  room completes — **`BSWireWaveform`**, an audio-amplitude tape behind the
  floating mark: seeded-deterministic bars (LCG, no Math.random — same tape
  every launch) mirrored around a center hairline, two identical 300-unit
  halves so the 16s `translateX(-50%)` loop is seamless, edge-fade masked,
  whisper volume (15% cream bars · ~1 in 10 teal). Rides the beat AND
  BSWireHold (mirror contract). Reduced motion holds the tape still.
  Decorative only — stage machinery untouched.

### 2026-07-10 — The application goes on the wire: provider apply (both roles) in the launch grammar

- **`BSProviderApplicationScreen` rebuilt in the wire grammar** (owner: "update
  design on the application process on app for both trainer and nutritionist")
  — it was the last paper-theme screen inside the launch flow (a cream 4-step
  boxed form right after the fixed-dark wire auth pages). Now fixed-dark on the
  shared drifting ticker ground (`BSWireGround` is window-exported for it):
  teal PROVIDER DESK eyebrow + serif "Apply to *Shape.*", the **role tag as the
  one role-heat placement** (trainer rust / nutritionist gold fill · dietitian
  reads `NUTRITIONIST APPLICATION · RD/RDN`), the auth pages' **step register**
  (STEP n OF 4 · SECTION over the 2px rule) + teal segment strip, **dot-leader
  entry fields** (label above, teal underline on focus, dark-pinned autofill +
  `color-scheme: dark` selects/date), squared teal specialty chips + checks,
  dashed-frame file drops, teal-spined notice lines, and a ghost BACK · clipped
  teal **CONTINUE → / TRANSMIT · SUBMIT →** action row. The submitted screen
  matches (serif "Submitted *for review.*" + FILED ✓ / honest SAVED LOCALLY).
- **Logic verbatim**: prefill from the cached auth profile, all field
  keys/validation (required set, 4 consents, 5-year experience minimum, 10MB
  file cap), the upload → `submitProviderApplication` chain, and the #1674
  dietitian `nutrition_role` declaration are untouched.
- Verified: JSX parse ×2 · PowerShell `/m/` build exit 0 · browser screenshots
  of all 4 steps (nutritionist) + step 1 (trainer) on the built bundle.

### 2026-07-10 — Launch round 3: STOPs die + dietitian wired (#1674) · the beat gets structure · sign-in/create = "The wire form"

- **#1674 (merged `f56d0ba1`):** STOP/END tokens removed from every launch page
  (telegram · invite · wall — house middle-dot separators carry the lines); the
  beat/hold **LOADING readout sits lower** under the mark; and the **dietitian
  (RD/RDN) signup toggle is now actually wired** — it was coercing the applicant
  onto the TRAINER application and never sent `nutrition_role`, so the apply
  route's isDietitian check could never fire from the app. Now: dietitian →
  the nutritionist application rails + `details.nutrition_role='dietitian'`
  (threaded through `applicationToPayload`) + a visible "Applying as a
  Registered Dietitian (RD/RDN)" confirmation line on the application's step 1.
  Reviewer contract unchanged (they assign `profiles.role='dietitian'` after
  credential review).
- **The beat page restructured** (owner: "off in a lot of areas … more
  professional, clearer, structured properly"): it now carries the wire
  masthead chrome — **SHAPE WIRE · LIVE over a 2px rule** + a footer rule
  (THE SHAPE COMMUNITY · Vol. 1 · No. 1) — like every other launch page; the
  teal **INCOMING · THE SHAPE WIRE line is STATIC and centered** under the mark
  (it was a drifting ticker row that clipped mid-word at the screen edge); the
  ticker ground distributes its dash rows **evenly over the full height** (no
  clump behind the mark), **fades at the screen edges** (CSS mask) instead of
  hard-clipping, and runs calmer (0.45 default · 0.22 dim); the mark's bloom is
  toned down (new `calm` variant, reduced-motion covered). `BSWireHold` matches
  the beat's structure (no INCOMING line — that stays beat-only, the #1670
  call). The ground's hot-row branch is deleted; the line lives in the beat
  composition where it can never clip.
- **Sign-in / create-account = "The wire form"** (owner-picked from the
  concept-board auth round): the boxed fields die for the dispatch grammar — a
  mono **label column + dot-leader entry lines** (`.bs-wire-frow`, solid teal
  underline on focus), the primary CTA reads **TRANSMIT · JOIN AS {ROLE} → /
  TRANSMIT · SIGN IN AS {ROLE} →**, and the six-field create wall splits into
  **two short steps** with a step register rule (STEP 1 · IDENTITY: role +
  RD/RDN toggle + name + DOB + handle → STEP 2 · CREDENTIALS: email + password,
  with a mono `FILED: name · @handle` recap + back link). Everything carried:
  live handle availability, the 18+ DOB gate (checked at the step AND
  re-checked at transmit — identity errors return you to step 1), the phone OTP
  flow (single-step, name+DOB intact), forgot password, Apply-as-coach routing,
  the verify-email screen, the checkout handoff, Turnstile.
- **Input fixes from the board:** Chrome **autofill can no longer flood the
  fields white** (`-webkit-box-shadow` inset pin + `-webkit-text-fill-color`);
  `color-scheme: dark` on the wire inputs so the native DOB control renders
  dark; **Turnstile goes `theme:'dark'` + `appearance:'interaction-only'`**
  (invisible unless Cloudflare actually needs a click — the white card dies);
  the captcha container now mounts per-slot, so it renders on create step 2
  where the auth request actually fires (the slot machinery tears down /
  re-renders the single-use widget on step transitions).
- Verified: JSX parse · PowerShell `/m/` build exit 0 · `npm test` **592** ·
  LF · browser screenshots of beat / wall / sign-in / create step 1 + 2 /
  phone. Deploy note stands: `public/m` builds at deploy — check the `/m/`
  asset hash before re-testing on device.
- **Round 4 (owner on-device notes, same day):** the mono topbars come OFF the
  **wall** (SHAPE WIRE · MEMBERS ONLY) and the **beat/hold** (SHAPE WIRE ·
  LIVE) — the footer rule stays, the invite keeps its dated topbar; the
  **loading bar loads 0→100%** (determinate `bs-wire-fill` paced to the ~3.5s
  dwell, parks full if the check runs long; the indeterminate sweep dies) and
  sits a little **higher** off the footer; the invite pitch adds **"your
  nutrition"** and its lines step up 11→12.5 (eyebrow 8.5→9.5). All four
  re-verified in-browser on the built bundle.

### 2026-07-10 — The launch on the wire: wire-ticker beat → the telegram Daily briefing (#1667 spec · #1668 build)

- **The member's three cold-open stops collapse into ONE self-advancing wire
  dispatch.** Was: cosmos 4s splash → membership gate (members saw a bare
  "Checking membership…" screen while auth restored) → the tap-gated "Shape
  Daily" (which demanded a "Step inside" tap every open, even a lunchtime
  relaunch). Now: a ~1s **wire-ticker beat** (drifting dispatch dashes, one lit
  teal) that **holds while the membership check resolves behind it** →
  **"The telegram"** (the member's real day as one wire message) that
  **self-advances into the app after 5s** (draining rule + tap-to-skip). Spec
  `docs/superpowers/specs/2026-07-10-splash-wire-briefing-design.md` (#1667, 3
  CodeRabbit Majors fixed in-spec); built inline on Opus, TDD on the pure
  module. Mobile-only.
- **Pure `mobile-app/src/services/dailyWire.mjs`** (+ `tests/daily-wire.test.mjs`,
  21 vectors, suite **592**): `bsLaunchRoute` (the warm-relaunch decision),
  `bsAfterBeat` (post-beat routing), `bsWireLines` (telegram line assembly —
  **signed-out sentinel** returns null when the digest isn't a signed-in
  member, and each absent leg **omits its line**, never a fabricated figure),
  and `bsWireDirective` + **`BS_LEVER_HEADS`** (the directive words).
- **Boot decision (synchronous):** a known member who already saw today's
  briefing skips **straight to the app** — a per-account, per-**local**-day
  `shape.dailySeen` stamp (rolls over at the member's own midnight). The auth
  state hydrates async, so the boot uid comes from a persisted **`shape.lastUid`**
  (written when membership resolves, cleared on logout with `shape.dailySeen`) —
  the CodeRabbit P2: without it the warm-skip never fired on a fresh JS context.
  Cross-account safe (a logout→different-member login no longer matches the
  stamp's uid, so the new member still gets their briefing).
- **The wire beat** (`BSSplash style="wire-beat"`) holds a ~1.1s minimum, then
  the shell routes on `!memberGateLoading` (the SAME membership signal the gate
  reads) — language picker on first run, else the telegram (members) or the
  gate/wall (non-members). **`BSPaywallLoading` ("Checking membership…") is
  retired** for `BSWireHold` (the wire ground, no copy) — no membership screen
  renders anywhere.
- **The telegram** (the classified member branch, re-set): `SHAPE WIRE · TO:
  {NAME}` + the digest lines (session · the **directive lit teal** · numbers ·
  coach note) with STOP/END separators, self-advancing. The **directive joins
  `bsBuildDailyDigest` as a `Promise.race`-bounded leg (~1.5s → null)** so a
  slow/hung `ShapeSignals` can never delay the render. It calls the **identical**
  `selfRecord()→directive()` path + gate Home's lead uses, and **Home's
  `engineMove` head defaultValues now read the shared `BS_LEVER_HEADS`** — the
  two surfaces can't drift. The signed-out **invite edition is unchanged**
  (tap-only "Step inside").
- **The members wall** (`BSPaywall`) restyled to the wire grammar — dim
  drifting ticker ground, the feature list as one STOP-separated line (incl.
  **"OR BUILD YOUR OWN WORKOUTS"** — the self-serve builder), a **clipped
  solid-teal JOIN** (the one commerce action) — **logic + the `paywall_viewed`
  analytics verbatim**, signed-out only.
- **A11y / motion:** the telegram root is a real keyboard control (`role=button`
  + `tabIndex` + Enter/Space + `:focus-visible`); the invite keeps its "Step
  inside" button as the keyboard control (no nested-interactive `role=button`).
  The drifting ticker is the launch's only loop (beat + wall grounds only);
  **`prefers-reduced-motion` renders assembled with an explicit ENTER — no
  auto-advance**. Launch surfaces are fixed-dark by design (don't follow the
  paper theme). Score formatter pinned `toLocaleString('en-US')` (deterministic).
- Verified: JSX parse ×2 · `tsc --noEmit` clean · `npm test` **592** · PowerShell
  `/m/` build exit 0 · LF. CI green (Web · Mobile · gitleaks); CodeRabbit
  APPROVED after the 2 fixes (warm-skip uid + en-US). `public/m` built at deploy
  (gitignored). **Open:** the owner on-device pass — cold/warm/next-day ×
  signed-out wall/preview × reduced motion × Black/Sage/Cream papers.
- **Owner-look follow-ups (same day, both merged):** **#1670** — the wall/hold
  wire ground goes `plain` (the beat's teal "INCOMING · THE SHAPE DAILY" row is
  BEAT-ONLY — behind the wall it was distracting + semantically wrong for a
  prospect) and the dim opacity drops 0.4 → 0.22 so the ground never competes
  with the copy. **#1671** — the **signed-out invite edition joins the wire
  too** (owner call): SHAPE WIRE topbar · `TO: YOU · INVITATION` · the pitch as
  three wire lines (teal hot line "STEP INSIDE TO MAKE IT YOURS") · the Inside
  Shape / In the world columns unchanged · a clipped solid-teal STEP INSIDE —
  still tap-gated, never stamps; and the **beat dwell 1.1s → 3.5s** (let the
  overture breathe). Browser-verified on the built bundle: the wall shows plain
  dashes only, the invite renders the wire set, the hold is copy-free.
  *Deploy note:* `public/m` builds at deploy — a just-merged launch fix isn't
  live until Vercel finishes (~5-10 min); check the `/m/` asset hash before
  re-testing on device.

### 2026-07-10 — Both sweep migrations APPLIED + verified live (owner ran them)

- **`2026-07-10-ai-audit-undo-claim.sql`** (#1659) and
  **`2026-07-10-client-self-plans-coach-read.sql`** (#1661) are live on
  Supabase. Verified read-only: the `ai_audit_log.undo_claimed_at` column +
  all three undo RPCs (`claim_/finalize_/release_ai_action_undo`) and
  `get_client_self_plans` present, **grants confirmed anon=false /
  authenticated=true** on every one (`has_function_privilege`), and the
  `client_workouts_self_by_date_idx` partial index exists. The one-shot undo
  claim order and the Case File SELF-PROGRAMMED station now run live end to
  end. War Room: both OWNER items flipped done.

### 2026-07-10 — Website workout-builder parity: "Build your week" on the dashboard Workouts tab

- **Closes the self-serve-training website follow-up** (#1618, "website
  builder parity — mobile-first"). Signed-in members build their own training
  on the WEBSITE now, not just the app.
- **New route `GET/POST /api/client/self-training`** (registered in the War
  Room; membership proxy prefix + own auth; **all writes on the caller's RLS
  client** — the self-CRUD policies pin `client_id = auth.uid()` +
  `trainer_id IS NULL`, so the route can't author coach rows). GET → the
  starter catalog (sessions full; programs METADATA only — `build` resolves
  server-side) + the member's own self rows. POST actions: `session` (one
  weekly-repeat row via `bsRepeatSpec`; Edit retires the prior row only AFTER
  the new one lands), `program` (validated via `bsValidProgramShape` +
  `bsValidMove`, capped honestly at 182 — BLOCKS, never truncates;
  `bsMaterializeProgram` → one batch insert), `starter_program`
  (`bsStarterProgram` resolved server-side), `remove` / `removeProgram`.
  **One implementation:** the route imports the SAME pure mobile modules the
  app writes with (the food-search-server pattern) — the two surfaces cannot
  drift on row shape. `bsValidMove` is now exported from
  `starterTemplates.mjs` (was internal) so every save path validates against
  the one move predicate.
- **`DtrBuilder`** (`dashTrain.jsx`, a full DashGrid widget on the Workouts
  tab, rendered only when the self-training GET authenticates): **Starters**
  (session templates prefill the form; race/block programs take weeks + a
  start date → Start this plan) · **Custom session** (name · Mon–Sun toggles
  · move rows that flip lift ↔ segment) · **Custom program** (the weekly
  pattern replicated across N weeks, live `N sessions / over-cap` gate — the
  per-week hand-editor stays a mobile strength; ✦ Draft covers varied weeks
  here) · **✦ Draft it for me** (`/api/ai/draft-program` → a week-by-week
  review, "nothing is saved until you approve" → save through the same
  `program` action; model-down reads an honest unavailable line) · **Yours**
  (programs/repeats/one-offs with Edit + `ShapeConfirm`-guarded Removes).
  Saves re-read the plan feed, so new rows land straight in the page's
  weeks view. Coaching stays the pitch (the Find-a-coach leader keeps its
  spot). `dashTrain.jsx?v=20260710` on ClientApp + ClientTrain (byte-safe
  replace — CRLF preserved).
- Verified: JSX parse · `npm test` 560 · `tsc --noEmit` clean · PowerShell
  `/m/` build exit 0 (the exported `bsValidMove` touches the mobile module) ·
  LF on the LF files. War Room: parity item flipped done; the on-device pass
  stays open.

### 2026-07-10 — Website Voice-chat parity: Nora's hold-to-talk + the web robot dies (chatWidget)

- **Closes the Nora-wave deferred item** ("website parity for Voice-chat
  mode"). The website chat widget's Help (Nora) tab now matches mobile
  #1653/#1654:
  - **VOICE CHAT chip** in the support toolbar (per-session, off by default,
    shown only where hold-to-talk is possible — MediaRecorder +
    getUserMedia): ON turns the composer mic into **hold-to-talk** — press
    records, release transcribes (`/api/ai/transcribe`) and the transcript
    **SENDS as a normal message** through the same `send()`; Nora's reply
    **auto-plays**. `voiceChatRef` is read **at reply time** (the #1654 race
    fix — the chip may flip while the model thinks). Hold machinery carries
    the mobile race guards: re-entrancy (`holding` + one capture at a time)
    and the **early-release hot-mic** guard (released before getUserMedia
    resolves → tracks stopped, nothing records); pointer leave/cancel count
    as releases; widget unmount stops everything.
  - **The web robot dies** (mobile #1653 parity): `speakNora`'s
    `speechSynthesis` fallback — the robot every non-member heard — is
    DELETED. Server-only voice returns honest
    `{ok, reason: 'signed_out'|'members'|'unavailable'}`; an **explicit**
    "Read this aloud" tap flashes the honest line ("Nora's voice is a member
    feature." / "Sign in to hear Nora's voice." / "Voice is unavailable right
    now."), **auto-speak failures stay silent**. Tap-to-dictate (the existing
    mic) is unchanged when Voice chat is off.
- `chatWidget.jsx?v=20260710` across all 35 versioned references
  (**byte-safe node replace** — the first `sed` pass silently normalized
  CRLF on every referencing HTML page and was reverted; the 2026-06-18
  lesson holds). Legacy `public/mobile/*` pages + the lazy-loader's
  un-versioned inject predate this and are unchanged (pending retirement).
- Verified: JSX parse clean · every page diff is the 1-line `?v` bump. No
  route/migration change (speak + transcribe already existed).

### 2026-07-10 — Barcode v2: scan or type a barcode in the add-food sheet (OFF product lookup)

- **Closes the #1648 v2 follow-up** ("OFF rows already carry the code"). The
  meal logger's add-food sheet gains a barcode path: **▥ Scan barcode** (live
  camera via the **BarcodeDetector** API — Chrome/Android WebView; ean_13 ·
  ean_8 · upc_a · upc_e) and **# Enter barcode** (manual digits — the honest
  fallback everywhere, since **iOS WebKit ships no BarcodeDetector**; the
  native scanner plugin joins the existing native mic/camera stub). A hit
  opens the **prefilled ingredient editor** (same contract as a search-row
  tap — the member confirms the portion before it lands; recents persist via
  the editor's existing fromSearch path).
- **Server**: `GET /api/nutrition/food-search?barcode=` → single-leg **OFF v2
  product endpoint** (`lookupBarcodeServer` in `food-search-server.ts`; same
  UA policy + whole-leg 2.5s timeout via `timedJson`, which gains an `on404`
  arg so an unknown code reads **notFound** — a real answer — instead of
  "unavailable"). A 200 with `status: 0` / no product / **no stateable kcal**
  (normalizeOffProduct → null) is also notFound — never a fabricated 0-kcal
  row. Invalid codes 400 before any provider fetch; auth still required
  before fan-out.
- **Pure `bsValidBarcode`** (`foodSearch.mjs`, +1 test block → suite **561**):
  strips spaces/hyphens, requires 8–14 digits (EAN-8 → GTIN-14), returns the
  cleaned string or null. Client + route validate through the ONE
  implementation.
- **Sheet UX**: scan/enter text-actions under the search input (44px targets,
  active = teal), a 190px camera block with a scan line + "Point at the
  barcode", camera-denied/detector-failure degrades to the digits entry, and
  honest mono status lines (Looking up… / not-a-barcode / no-match /
  can't-reach). Closing the sheet unmounts the camera (every track stopped)
  and clears the state; `ShapeFoodSearch.barcode(code)` on the data layer.
- Verified: JSX parse · `node --check` ×2 · `npm test` 561 · `tsc --noEmit`
  clean · PowerShell `/m/` build exit 0 · LF.

### 2026-07-10 — Coach read of self-authored plans: the Case File "SELF-PROGRAMMED" station

- **Closes the self-serve-training v1 gap** (#1618's registered follow-up): a
  coach could see a self-programming member's session LOGS but never the plan
  — self rows are `client_workouts` with `trainer_id NULL`, and the coach RLS
  policies scope to the coach's own authored rows.
- **Migration `2026-07-10-client-self-plans-coach-read.sql`** (⚠ **OWNER: run
  it** — raw link on the PR): SECURITY DEFINER **`get_client_self_plans
  (p_user_id)`**, gated on `is_coach_on_client` (the `get_client_lifts` /
  `get_client_stats` precedent — the active coach↔client subscription IS the
  permission), returning a **compact projection only** — title/kind/date +
  the payload's program stamp + `repeatDow` + a move count, capped 200. Never
  the full payload: no loads, cues, or notes — the member's authored detail
  stays theirs; the coach reads the shape of the plan.
- **Review round (Codex P2 — real, fixed):** oldest-first under the 200-row
  cap meant a long self-history (two saved 26-week programs already exceed
  200 rows) could evict the CURRENT run — the coach could miss an active
  program or read it as past. The RPC now **windows to relevance**: undated
  rows (repeats/drafts) + rows dated **last-week-forward**, nearest-first —
  the cap can only trim the far tail of a long program, never the
  current/upcoming sessions; a run that ended within the week still reads
  `PAST`, older history drops off the Case File. CodeRabbit's index nit
  folded in: a tiny **partial index** `(client_id, scheduled_date) where
  trainer_id is null` serves the self-row read directly.
- **Pure `mobile-app/src/services/selfPlansSummary.mjs`** (+ 7 test vectors,
  suite **567**): groups rows into **programs** (per-RUN — a re-started plan
  is its own line; the next dated session ≥ today carries the `W3 OF 16 ·
  JUL 12` readout, a just-ended run reads an honest `PAST`), **weekly
  repeats** (`Mo Th · WEEKLY` day letters on the builder's **0 = MONDAY**
  base — bsMaterializeProgram's, not the reminders table's 0 = Sunday —
  deduped), and **upcoming one-offs** (sorted, capped 5).
  `Number(null)`-as-day-zero guarded (the food-search lesson).
- **Case File** (`BSProClientFullProfilePage`, Profile tab, between KEY
  LIFTS/MACROS and BODY): a **SELF-PROGRAMMED** station of dot-leader rows +
  a `PROGRAMMED BY THE MEMBER` footnote — an **honest slot** (renders ONLY
  when the member actually self-programs; coached-only clients, demo roster
  rows, and pre-migration reads show nothing). Per-client reset +
  stale-response guard (the care-team pattern);
  `window.ShapeClientStats.getSelfPlans` on the data layer.
- Verified: JSX parse ×2 · `npm test` 567 · `tsc --noEmit` clean · PowerShell
  `/m/` build exit 0 · LF. War Room: follow-up flipped done + the OWNER
  migration item registered.

### 2026-07-10 — One-shot AI undo: guarded claim on ai_audit_log (the #1652 deferred follow-up)
- **Closes the Nora-wave deferred item** ("a transition-reporting guarded-claim
  RPC on `ai_audit_log` for a true one-shot water undo"). `undoChange` used to
  read the row's status → reverse the data → mark undone, so **two concurrent
  undo requests could both pass the status read and both apply the reversal** —
  `log_water`'s accumulator-inverse delta would subtract twice.
- **Migration `2026-07-10-ai-audit-undo-claim.sql`** (⚠ **OWNER: run it** —
  raw link posted on the PR): **`claim_ai_action_undo(p_id)`** — same
  permission model as `mark_ai_action_undone` (actor or coach-on-client), but
  the executed→undone transition is a **guarded UPDATE that REPORTS `found`**,
  so of any number of concurrent callers exactly one wins the claim; and
  **`release_ai_action_undo(p_id)`** — hands a claim back after a FAILED data
  reversal (`status='undone' and undone_by=me` only — a completed undo or
  someone else's claim can never be flipped back), mirroring the
  consume/release contract on `ai_proposal_nonces`.
- **`undoChange` (`proposals.mjs`) claims BEFORE reversing**: claim lost →
  honest `alreadyUndone`; reversal throws → the claim is released (best-effort,
  loud console error if even that fails) and the error propagates unchanged —
  the ledger never records an undo that didn't happen, and "Changed since"
  failures keep their exact semantics. **Pre-migration degrade**: the server
  sink's `claimUndo` returns `null` when the RPC isn't deployed (PGRST202 /
  42883) → the legacy read→reverse→mark order runs, so nothing breaks before
  the owner applies the SQL. `mark_ai_action_undone` untouched.
- **Review round (Codex P2 — real, fixed):** the RPCs are authenticated-
  callable, so the claimer of a **completed** undo could call
  `release_ai_action_undo` directly, flip the row back to `executed`, and
  undo again — double-applying the reversal. Fix: a new
  **`undo_claimed_at` in-flight marker** — claim sets it, a successful
  reversal **finalizes** (`finalize_ai_action_undo` clears it, claimer-only),
  and release works ONLY while it's still set — a finalized undo can never be
  re-opened. CodeRabbit's nit folded in: the in-memory release/finalize
  doubles now mirror the RPCs' `found` semantics (false on a no-op).
- Tests (suite **563**): concurrent double-undo applies the reversal **exactly
  once** (one `alreadyUndone`); a failed reversal leaves the row `executed`
  and a retry succeeds; release-after-finalize is a reported no-op and the
  reversal never re-runs. `tsc --noEmit` clean. War Room: guard registered
  done + the migration as the OWNER manual item.

### 2026-07-10 — Feed + Home chrome cleanups: the #1528/#1527 War Room leftovers close

- **Feed (`BSActivityCard`)** — the three registered leftovers: the
  **"Programmed by" chip** drops its 999px bordered pill for the card's own
  **press-credit grammar** (mono eyebrow + DISPLAY name + heat › chevron, 44px
  target from invisible height — handler + honest-absent gating verbatim); the
  **video-link + link tile glyph squares** drop their tier-color background
  tint (`${tc}2e` — outside the sanctioned line-only tc placements) for ink
  grammar (transparent + hairline border, muted glyph); the owner **edit ✎**
  gets a real **44px hit target** (negative-margin trick keeps the slim meta
  row height; the 22px visual circle is now an inner span).
- **Home (`BSClientHome` + friends)** — the registered cleanup list:
  **`BSMeGoalCard` + `BSProgressDoor` pruned to door-only** (their single
  callers pass the door shelf; the plate/compact and full-width branches had
  no caller — deleted, along with BSMeGoalCard's now-dead title-split/byline
  locals); **`stepPts` dropped** from `useBSStepsToday` (never consumed — the
  `shapeStepsPoints` import goes with it; `window.ShapeStepPoints` in the data
  layer is untouched); the **slate double-sort collapsed** — rows were
  pre-sorted by a parallel `_sortAt` minutes key and then re-sorted by
  `bsHomeSlateSort` parsing the same displayed times; the pure module is now
  the ONLY ordering (all `_sortAt` scaffolding + the `bsHomeTimeMinutes`
  import removed); the **`hero-habits` tour anchor narrowed** from the whole
  slate (the spotlight swallowed meals + training) to just the habits
  sub-block (head + rows + empty/all-done/flash states — the anchor still
  renders on habit-less days, and the tour's `tab-home` fallback covers the
  empty-slate case).
- Presentation/dead-code only — every handler, gate, and data path verbatim.
  Verified: JSX parse · PowerShell `/m/` build exit 0 · `npm test` 560 · LF.
  War Room: both follow-up items flipped done.

### 2026-07-10 — Nora's default voice pinned by env: NORA_TTS_VOICE + the owner's pick (#1657, `51828ddb`)

- The owner auditioned at openai.fm and landed on **`sage` with a
  fitness-instructor style**. `sage` is in the member picker, but the
  DEFAULT (no explicit pick) was hardwired to the tone map — new pure
  **`resolveVoiceWithDefault(voice, envVoice, tone)`** in `tone.mjs`
  (tested): a member's explicit picker choice → the **`NORA_TTS_VOICE`** env
  (validated against the FULL gpt-4o-mini-tts voice set, so the owner can pin
  any API voice incl. non-picker ones) → the tone default. The 6-voice member
  picker is unchanged. ⚠ **OWNER: set `NORA_TTS_VOICE=sage` +
  `NORA_TTS_INSTRUCTIONS=<the fitness-instructor block>` in Vercel** (verbatim
  in `docs/HANDOFF-2026-07-10.md`), redeploy, ear-check via Settings →
  Preview voice. Both env vars optional — unset, code defaults apply.
- **PR C review-round amendment** (the entry below was written pre-review;
  #1656 merged with these fixes, `aea4a624`): **member-LOCAL dates** — new
  `memberToday(ctx)`/`memberTz(ctx)` compute today in the member's stored
  IANA zone (`client_profiles.timezone`), so a 9 pm US log no longer lands on
  UTC-tomorrow (Codex P1), and `log_water` threads the date through
  execute + undo; **units never assumed or coerced** (a unit-less first
  weigh-in asks "lb or kg?", `'stone'` is rejected — never silently lb);
  **habit confirm is add-only** (an intervening completion can't be toggled
  OFF) and **undo calls `revoke_habit`** so the +3 leaves the score with the
  completion; **reminders carry the member tz** (were firing at UTC);
  preview read failures surface honestly (no fabricated 0 L); the
  food-search provider timeout now covers response BODIES (`timedJson`).
  Declined with receipts: a mandatory find_food provenance token (the human
  confirm card IS the gate). Deferred: a guarded-claim RPC for a true
  one-shot water undo (migration).

### 2026-07-10 — Nora member action tools: weigh-in/water/habit/reminder + find_food (Nora wave PR C — the wave closes)

- **PR C of the Nora wave** (spec #1652; plan
  `docs/superpowers/plans/2026-07-10-nora-member-tools.md`; built inline, TDD
  on the pure module). "Log my weight at 182", "add 500 ml of water", "check
  off my morning walk", "remind me to weigh in at 7:30", and "log the
  Chipotle bowl" all work — and every write still goes through the confirm
  card.
- **Four proposal tools** in `actions.mjs`, the exact `logMealAction` shape
  (self-scoped `ctx.actor.id`, preview → confirm → `ai_audit_log` → undo):
  **`log_weigh_in`** (today's `client_weigh_ins` upsert, unit explicit in the
  summary — never silently assumed; fires `award_my_goal_milestones`
  best-effort), **`log_water`** (the `/api/client/hydration` delta via
  `waterLiters` ml/oz conversion — null on unknown units, ±2 L route cap
  honored), **`check_habit`** (pure `matchHabit` over the member's own active
  habits — exactly one hit proceeds, no match lists their real names,
  several matches fail closed listing candidates; already-done days refuse),
  **`set_reminder`** (the reminders route's own validation mirrored; weekday
  default stated in the summary). Schemas ride `MEMBER_TOOLS` — **only a
  verified member's tool list carries them** + every `buildPreview` re-gates
  on `ctx.isMember` (threaded through `makePropose`).
- **`find_food`** — a member-only READ tool over the new shared
  **`src/lib/food-search-server.ts`** (`searchFoodsServer(q)`, extracted
  verbatim from the #1648 route — ONE fan-out implementation): top-5 real
  foods with kcal/P/C/F for a follow-up `log_meal` proposal; provider outage
  → an honest `food_search_unavailable` ("ask the member for their numbers").
- **Every undo enforces its predicate IN the atomic statement** (spec #1652
  round 4): zero affected rows = "Changed since — nothing undone."
  `log_weigh_in` conditions on the full value snapshot (no `updated_at` on
  that table); `check_habit` deletes today's completion row in-statement;
  `set_reminder` deletes only an UNEDITED reminder (id + kind + time);
  `log_water`'s undo is the **accumulator inverse** (a negative delta —
  preserves concurrent additions, strictly stronger than a restore; the
  documented deviation). **The `log_meal` parity fix ships**: its old blind
  snapshot restore now carries the same per-column in-statement guard —
  with a new stale-undo conflict test vector + a fully chainable
  guarded-write Supabase mock in `tests/ai-actions.test.mjs`.
- Verified per commit: `tsc --noEmit` clean · `npm test` **559** (new:
  `member-tools`; extended: `ai-actions`) · LF. No migration, no env, no new
  route. **The Nora wave (A voice · B grounding+memory · C tools) is
  code-complete** — open: owner voice audition → `NORA_TTS_INSTRUCTIONS` ·
  the on-device pass (voice chat round-trip · member chat real numbers ·
  each tool propose→confirm→undo) · the parked splash-pages rearrangement.

### 2026-07-10 — Nora grounded answers + memory: real numbers in chat · remember/forget · Settings list (Nora wave PR B)

- **PR B of the Nora wave** (spec #1652; plan
  `docs/superpowers/plans/2026-07-10-nora-grounding-memory.md`; built inline,
  TDD on the pure modules). "How am I doing this week?" finally gets the
  member's own numbers, and "remember I hate burpees" sticks.
- **Grounded answers.** `/api/support/chat` resolves the actor ONCE and runs
  `computeMembership` (fail-closed): **verified members** get a server-built
  **member-context block** injected as a system message — today's kcal/protein
  (snapshot), momentum (`compute_momentum`), Shape Score (ledger sum excl.
  redemptions), latest weigh-in, the Overall goal, and remembered notes — all
  read on the **caller's RLS client** via thin `Promise.allSettled` fetchers
  (a leg that resolves empty is honest absence; EVERY leg failing injects the
  explicit `UNAVAILABLE_NOTE` — "say the data isn't available, never estimate").
  Pure **`src/lib/ai/memberContext.mjs`** owns the words (tested: honest
  omission, no-fabrication, null-on-empty; the fallback-sentinel vector).
  Signed-out and signed-in-NON-member requests run the exact pre-PR-B path —
  same prompt, same tool list, no context — byte-identical.
- **Memory.** `user_goals('nora_memory')` = `{rev, notes:[{id,text,at}]}` —
  cap 30 notes × 280 chars (word-boundary truncation), ids = a stable text
  hash (retries dedupe + repair audits). **Every writer mutates under CAS**
  (`casWriteUserGoals` in `server.ts`: rev-conditioned update writing rev+1,
  zero rows → re-read + retry ×2, INSERT bootstrap treating the unique
  conflict as a CAS miss). Pure **`noraMemory.mjs`** (tested: dedupe, cap,
  forget selector arity/exact-match/ambiguity fail-closed).
- **remember / forget** — direct-with-audit tools (no confirm card, the spec
  decision): their schemas are appended to the function-calling tool list
  **only after the membership check** (non-members can't even discover them;
  `ctx.isMember` re-checks in-handler), executed inline by the route. Audit
  keyed on the note's own id — a dedupe-hit retry **reconciles a missing
  audit row**; audit failure returns `audited:false` + a safe-metadata-only
  server log (never note text); the chip reads "Noted ✓ / Noted — audit
  pending" honestly. **A forget's audit row records id + stamps only — never
  the forgotten text.**
- **Settings → "What Nora remembers"** (`BSNoraMemoryPage` + a Nora's-voice
  section row): the note list, per-note forget (confirmed), **Clear all
  behind `window.bsAskConfirm`** (cancel writes nothing). Writes ride
  `window.ShapeNoraMemory`'s client-side mirror of the SAME CAS contract.
- Verified per commit: JSX parse · `tsc --noEmit` clean · `npm test` **551**
  (2 new files: member-context, nora-memory) · PowerShell `/m/` build exit 0 ·
  LF. **Open:** PR C (member action tools + the log_meal undo guard parity
  fix) · owner voice audition · on-device pass (member chat real numbers ·
  remember → Settings round-trip · clear-all confirm).

### 2026-07-10 — Nora voice overhaul: style-steered TTS · the robot dies · Voice chat mode (Nora wave PR A)

- **PR A of the Nora-upgrades wave** (spec
  `docs/superpowers/specs/2026-07-10-nora-upgrades-design.md`, #1652 —
  merged after **5 CodeRabbit rounds** that hardened the wave's security/audit
  contracts: per-request tool registry, CAS'd `nora_memory`, in-statement undo
  guards, redacted audit logs, negative-path vectors; plan
  `docs/superpowers/plans/2026-07-10-nora-voice-overhaul.md`; built inline).
- **The robot is dead.** `speakVoice` (`shapeBackend.js`) is **server-only**:
  the `speechSynthesis` fallback — the "actual robot" every signed-out preview
  and non-member heard — is deleted. Failures return honest
  `{ ok:false, reason: 'signed_out' | 'members' | 'unavailable' }`; an
  explicit **Listen/Preview tap toasts** ("Nora's voice is a member feature" /
  "Voice is unavailable right now") while **auto-speak failures stay silent**.
  Silence over brand-damaging robot audio.
- **The real voice gets a coach's delivery.** `synthesizeSpeech` passes a new
  `instructions` field to `gpt-4o-mini-tts`; pure **`voiceStyleForTone(tone)`**
  in `tone.mjs` (unit-tested, suite 541) supplies the per-tone default
  (supportive = warm/conversational, direct = crisp/brisk, both
  "never announcer-like"), and the **optional `NORA_TTS_INSTRUCTIONS` env**
  overrides it — the owner auditions voices/styles at openai.fm and pins the
  winner with a one-line env change. The **verbatim contract is untouched**:
  instructions steer delivery, never words; `X-Spoken-Text` parity holds.
- **Voice chat mode** (mobile Nora support chat): a **VOICE CHAT on/off chip**
  in her thread header (off by default, per-session). On: the composer mic
  becomes **hold-to-talk** (press = record, release = transcribe → the text
  **sends as a normal message** via a shared `sendSupportText`) and her reply
  **auto-plays** (`speakReply(reply, { force:true })`). Off: the mic stays the
  existing tap-to-toggle dictation into the composer. Capture/transcribe
  failures degrade to the text composer with the existing error line. The
  header head became `role="button"` (a real `<button>` chip can't nest in a
  `<button>`).
- Verified: JSX parse · `tsc --noEmit` clean · `npm test` **541** · PowerShell
  `/m/` build exit 0 · LF. **Open:** PR B (grounding + memory) → PR C (member
  tools); owner voice audition → `NORA_TTS_INSTRUCTIONS` (+ default voice) in
  Vercel; on-device pass (Listen toast · voice-chat round-trip · hold-to-talk
  on real touch).

### 2026-07-10 — Website screenshots refreshed: all 9 phone captures now show the July app (#1650, `83a0c29e`)
- **Every phone capture on the marketing site was June-era** — pre-dating the
  entire July Open Ledger redesign, so `GetApp.html`'s 9-slide walkthrough and
  `index.html`'s 5 journey beats (which reuse the same files) showed an app
  that no longer exists. All 9 recaptured and swapped: Front Page home ·
  Train "The Program" table · Eat "The Menu" courses · the expanded aisle
  grocery checklist · the Habit Ledger ("+3 banked" verdict + grid) · Score
  "The Standing" ladder · the Terrain profile (ascent ridge) · Shape Radio
  live player · the community feed (presence rail + Wire Dispatch PR card +
  co-sign).
- **Capture recipe (reusable):** chrome-devtools MCP against the live
  production `/m/` signed-out demo, isolated context, viewport 375×867@2
  (750×1734 → Lanczos to **600×1387**, the `.scr` boxes' exact aspect).
  **Full-bleed fix:** the desktop-preview bezel keys off `isNativeBSApp()` —
  add the `is-native-app` class to `<html>` AND restyle the mounted frame DOM
  to the native branch's geometry (100vw/100dvh, no padding/radius/notch,
  body margins zeroed); the two converge on any re-render. Gates walked
  per boot (paywall Preview → Step inside → radio prompt); the
  **PREVIEW · DEMO DATA banner reappears per boot — dismiss before every
  capture** (one first-round set had to be retaken for it). Element clicking:
  parts of the chrome don't surface in `textContent` (only in the a11y
  tree) — click by snapshot uid, and verify tab switches via
  `window.__shapeActiveTab`, never by assuming the click landed.
- `habits.png` → `getapp-habits-v1.png` (joins the getapp-* naming); the 9
  replaced files deleted (repo-wide grep confirmed only these two pages
  referenced them); `?v=20260710` cache-bust on every slot. Content-only —
  no layout/JS changes. CI green; CodeRabbit APPROVED (0 findings); Codex's
  one P2 (this WORKLOG entry) shipped as this follow-up. War Room item
  flipped done.

### 2026-07-10 — Real food-database search: the add-food sheet goes live (#1648, `54e54625`)
- **Closes the #1601 "Correct the Record" follow-up** — signed-in members no
  longer see "Food search is coming. Enter what you ate manually": typing in
  the meal logger's add-food sheet searches a REAL hybrid food database and a
  result lands as a normal ingredient row (stable `bsIngId`, provider macros
  pre-filled). Spec `docs/superpowers/specs/2026-07-09-food-database-search-design.md`
  (#1643, owner decisions: **hybrid USDA FDC + Open Food Facts · text-only v1**);
  plan committed in-branch; built INLINE on Fable, one PR.
- **One pure module** — `mobile-app/src/services/foodSearch.mjs`
  (+ `tests/food-search.test.mjs`, 11 vectors, suite **540**): `normalizeFdcFood`
  (per-100 g nutrients × gram servingSize, honest `100 g` fallback),
  `normalizeOffProduct` (serving grams → per-serving nutriments → honest 100 g;
  barcode kept for the v2 scanner), `mergeAndRank` (**kcal-less rows dropped —
  never a fabricated 0**; name+brand dedupe; **token-coverage ranking** because
  FDC names are comma-inverted — 'Chicken, broilers or fryers, breast…' never
  prefix-matches 'chicken breast'; generic-above-branded unless the query looks
  like a brand; cap 12). The server route imports these directly — the
  `workoutShare.mjs` one-implementation pattern, no TS twin drift.
- **`GET /api/nutrition/food-search?q=`** — `currentUser(request)` (cookie or
  Bearer) required BEFORE any provider fetch (the proxy gate fails open by
  design, so the route owns its auth; a 401 never burns provider quota).
  Parallel FDC (Foundation + SR Legacy) + OFF legs, 2.5 s per-leg timeouts,
  either side failing degrades to the other, both down → `{ results: [],
  unavailable: true }` (the sheet reads an honest can't-reach line, never an
  error page). **No `FDC_API_KEY` → the FDC leg is quietly skipped** (OFF-only)
  — ⚠ **OWNER: create the free key (fdc.nal.usda.gov) → Vercel env** (War Room
  manual item). OFF requests carry the policy `User-Agent: Shape/1.0
  (privacy@theshapecommunity.com)`. No DB cache in v1 (client debounce + cap
  keep volume tiny; a keyed cache table is the known next step if OFF
  politeness ever matters).
- **The sheet** (`BSLogMealFlow`): search input ("Search foods & brands…" —
  barcodes leave the copy until v2), mono status line (`Searching…` / `N
  results` / rust failure copy), result rows (name · `brand · qty · kcal · P`).
  **Debounced 350 ms, in-flight aborted, min 2 chars**; ＋ adds the provider's
  default serving directly; **tapping the row body opens the existing
  ingredient editor prefilled** so the portion is adjustable before it lands.
  `Enter manually →` stays the floor on every state; signed-out demo
  byte-identical. **Recents become real**: adds persist to
  `user_goals('food_recents')` (cap 20, most-recent-first, name-deduped, **no
  migration**); the empty-query state shows them.
- **Review round (3 CodeRabbit findings, all real, fixed `0dd9cbef`):** an add
  racing the initial recents load saved a ONE-item list over the member's cloud
  recents + the editor path never persisted → one centralized async
  `rememberFood` (awaits the cloud list when state is unloaded, merges, then
  saves; the loader uses a functional setter so a late resolve can't clobber);
  the previous query's rows stayed clickable through the debounce → results
  clear the instant the query changes; `Number(null)` is `0` in JS, so a
  `value: null` nutrient could fabricate a 0-kcal row past the honest-data
  drop → `num()` nulls null/undefined/'' first (+ a test vector).
- Verified per commit: JSX parse · `tsc --noEmit` clean · PowerShell
  `VITE_BASE=/m/` build exit 0 · `npm test` 540 · LF (`tr -cd '\r'` = 0). CI
  green ×2 rounds; CodeRabbit re-review clean, all threads resolved.
  **Open:** the on-device pass (search → add → edit-prefill → recents replay ×
  papers) and v2 barcode scanning (OFF rows already carry the barcode).

### 2026-07-09 — Navigation history PR C: swipe navigation (edge-back + tab swipe, all three shells)
- **The wave's last piece** (spec #1642 §4; plan
  `docs/superpowers/plans/2026-07-09-nav-swipe-gestures.md`; built INLINE on
  Fable — gesture thresholds + DOM-context judgment + browser verification).
- **One pure classifier** — `mobile-app/src/services/swipeIntent.mjs`
  (+ `tests/swipe-intent.test.mjs`, 8 vectors, suite 529): edge-zone-wins rules
  (`x0 ≤ 24px && dx ≥ 60 && |dy| < 40` → back, no dt cap — a slow deliberate
  edge-drag still means back) and tab rules (`|dx| ≥ 70 && |dx| > 2·|dy| &&
  dt ≤ 600ms`). **`BS_SWIPE` is the single tuning surface** for the owner's
  on-device feel pass — no other threshold exists in the pipeline.
- **One chrome gesture layer** — `BSNavGestures` (`iosAppBroadsheet.jsx`,
  window-exported): capture-phase **always-passive** touch listeners on
  `#bs-phone-surface` (never preventDefault — cannot fight scrolling or the
  native scroll handlers), coordinates normalized to the SURFACE's left edge
  (the desktop-preview bezel would otherwise break the edge zone), dispatching
  `shape:navGesture { intent }`. **ONE ancestor walk** classifies a touch:
  true input controls block (input/textarea/select/contenteditable — a drag
  there means selection/cursor); **buttons/rows deliberately do NOT block**
  (dense pages — rosters, feeds, lists — are mostly tappable rows and would be
  swipe-dead; the platform never synthesizes a click after a real drag);
  horizontal scrollers that actually overflow block (per-axis — the `.bs-scroll`
  class marks MANY scrollers incl. the chat presence rail, so nothing is
  exempted by class); `pan-x`/`none` always block; **`pan-y` blocks only on
  non-vertically-scrolling elements** (chart scrubs) while declared vertical
  scrollers pass; sheets/overlays block via their portal signature —
  full-height coverage + explicit zIndex ≥ 10 (the z census spans 60→6000+,
  so no threshold separates sheets from the z-55/60 chrome strips; coverage
  does — review-hardened after Codex named two low-z composer sheets);
  the blocked-walk runs ONLY on geometrically-qualifying touches, never on
  taps (CodeRabbit perf finding); the shell judgment plumbing (step math ·
  listener · slide state) is extracted to `bsNavShell.js` helpers
  (`bsNavStepTab` · `useBSNavGestureHandler` · `useBSNavSlide` — kills the 3×
  fork + the render-body ref mutation);
  `[data-bs-noswipe]` opts out — **BSPage stamps it automatically for
  `mast={false}` flows** (meal logger) and a new `noSwipe` prop covers the
  **live session** (`BSSession` — an edge-back mid-workout would jump to a
  stale cross-context location).
- **Shell judgment ×3** (client + both coaches, live-ref pattern): `back` →
  `navBack()` falling back to closing the top takeover; `prev/next-tab` → only
  when no takeover is open, stepping each shell's OWN root order
  (client home·train·eat·chat·me; coaches today·clients·programs|plans·chat·me),
  **clamped at the ends** (no wrap); jump-destination screens (radio · market ·
  store) get edge-back only. A tab SWIPE plays a one-shot 24px slide on the
  incoming screen (`prefers-reduced-motion` kills it in CSS); a tab TAP renders
  instantly as before.
- **Browser-verified with synthesized touches** (client + trainer): tab order
  walks + clamps; swipes starting on the presence rail / horizontal scrollers
  do NOT switch tabs (this catch forced the per-axis guard rewrite); swipes
  starting on roster rows DO work (this catch removed the blanket interactive
  block); edge-back walks a jump chain and consumes the guard; empty-stack
  edge-swipe no-ops; slow pans and diagonals never classify; the live session
  blocks both gestures (`data-bs-noswipe` verified stamped); vertical scrolling
  never misfires.
- **Open:** the owner on-device feel pass (thresholds in `BS_SWIPE`) across
  Black/Sage/Cream × both roles × reduced-motion — the standing item for the
  whole nav wave.

### 2026-07-09 — HOTFIX: universal search crashed the app on open (live since #1591)
- **Opening universal search — the ⌕ in every header, all roles — crashed to
  the error boundary** ("Something went wrong · on is not defined") since the
  2026-07-07 grocery PR: its `aria-pressed` sweep referenced `on` in
  `BSUniversalSearch`'s filter-chip map, the ONE swept site (of 17 audited)
  whose callback never defines it → ReferenceError on first render. Unnoticed
  for two days because nothing opened search in verification; **found live**
  while browser-verifying the nav-gestures PR. One-token fix
  (`aria-pressed={filter === k}`, #1646), browser-proven before merge.
  *Lesson recorded: crash-class bugs in rarely-verified surfaces survive every
  static gate — parse, tsc, tests, and build all pass on an undefined
  identifier reference inside JSX.*

### 2026-07-09 — Navigation history PR B: the coach shells ride the same spine (one shared hook)
- **PR B of 3** (after PR A `a65a599e`). Plan `docs/superpowers/plans/2026-07-09-nav-history-coach-parity.md`;
  built subagent-driven on Opus, task-per-commit, browser-verified per shell.
- **One hook, three shells.** PR A's ~60-line shell block (armed ref · push ·
  back · popstate bridge · `window.ShapeNav` exposure) is extracted to
  **`mobile-app/src/broadsheet/bsNavShell.js` → `useBSNavHistory({ navLoc,
  navResolve })`**. The client shell refactors onto it with zero behavior change
  (re-verified in a browser); **`BSTrainerAppInner`** and
  **`BSNutritionistAppInner`** adopt it with their own `navLoc`/`navResolve`
  covering their **six takeovers** (soundtracks · settings · calendar · reviews ·
  habits · queue) plus tab/store/programs sub-state.
- **Coach cross-jumps instrumented:** `shape:openProSettings` / `openProfile` /
  `proAvailability` / `proSoundtracks` / `proMessageClient` / `proMessageCoach` /
  `openSearch` / `openConversation`, plus `goRadio` / `goSettings` /
  `openHomeWidget` (which now **early-returns on an unknown action before
  pushing**, so a no-op door can't leave a phantom entry). Tab-bar taps still
  never push; `shape:startTour` doesn't push (self-closing overlay).
- **Settings sub-page replay comes free for coaches:** `BSSettings` is the shared
  client component and already announces its sub-page, so threading the new
  `settingsStart` state into it makes `Settings → Integrations → jump → back`
  land back on **Integrations** in the coach apps too.
- **`liveWatch` is deliberately NOT replayable** — re-opening a stale live-watch
  would fabricate a session that may have ended (honest-data).
- **Two more guard-invariant bugs found and fixed** (both inherited from PR A,
  both browser-caught): (1) **`ShapeNav.clear()`** emptied the stack but left the
  guard armed — the next push skipped arming and the next hardware Back was
  swallowed; new pure `bsGuardAfterClear(armed)` keeps all four guard decisions
  in the tested module (suite **521**). (2) A subagent shipped the
  `useBSNavHistory` **call without its import** — parse, `tsc`, `npm test` and
  the Vite build ALL pass on a bare identifier (it reads as a global), so only
  rendering the trainer shell surfaces it. Both fixed before the PR.
- **Verification note (process):** the `grep -c $'\r'` LF gate used across this
  repo's sessions is **broken in Git Bash here** — it returns the line count for
  CRLF *and* LF files alike. Use `tr -cd '\r' < f | wc -c` (must print 0). Audited
  every file this session touched, working tree + committed blobs: all genuinely LF.
- Verified per commit: JSX parse · `tsc --noEmit` · `VITE_BASE=/m/` build exit 0 ·
  `npm test` 521 · LF (real check). Browser-driven on **all three shells** (role
  flipped through the supported Tweaks path — a forced `role` boot crashes with
  React #130 because `loadProsBundle` never loads the client module, which is why
  `role` sits in `BS_TWEAKS_NO_PERSIST`; reproduced identically on merged main, so
  it is a dev-path artifact, not a regression). **Open:** PR C (swipe gestures) +
  the owner on-device pass, which rides PR C.

### 2026-07-09 — Navigation history PR A: back returns to the TRUE previous page (client spine)
- **The app finally has navigation history.** Spec `docs/superpowers/specs/2026-07-09-navigation-history-swipe-design.md`
  (#1642) + plan `docs/superpowers/plans/2026-07-09-nav-history-client-spine.md`;
  built subagent-driven on Opus, task-per-commit. This is **PR A of 3** — PR B
  (coach-shell parity) and PR C (edge-swipe back + tab swipe) follow.
- **The spine:** pure **`mobile-app/src/services/navHistory.mjs`** (+
  `tests/nav-history.test.mjs`, 6 vectors, suite 517) — a cap-30 LIFO of
  replayable `{ tab, overlay?, sub?, detail? }` descriptors with deep-equal
  dedupe, the **announce register** for child-owned sub-state, and pure
  guard-entry decisions (`bsGuardAfterPush/Pop`).
- **The shell owns replay** (`BSClientAppInner`): `navLoc()` derives the
  shell-visible location; `navResolve(loc)` maps popped descriptors onto the
  EXISTING entry points (`setTab` · takeover setters · `chatRequest` ·
  `storeView` · new `eatStart`/`meStart` one-shot start props); exposed as
  **`window.ShapeNav`** ({push, back, canPop, announce, clear}) for the pros
  shells (PR B) and the gesture layer (PR C).
- **What pushes:** every cross-context jump — the seven `shape:*` event
  handlers, the `goX` helpers, calendar/search/settings takeover opens —
  records the pre-jump location. **Tab-bar taps never push** (Android back
  guidance). In-context "up" backs are untouched; **smart-backs**
  (`stack-first, legacy fallback`) land on the takeover closes + the
  whole-tab-jump backs (radio/market/store).
- **Announce register (wave-1 replayable set):** BSSettings sub-pages
  (edit-profile/integrations/about/pricing), Eat views (day/grocery/library),
  Me pages (score/store), and conversation-id/channel chat threads — so a jump
  from Eat-grocery or a Settings sub-page returns to exactly there, not the
  context root. Demo/sample threads deliberately announce nothing.
- **Hardware/browser back** rides a **single guard history entry** (arm on
  empty→non-empty, re-arm per consumed pop, disarm at empty — dedupe/evictions
  never touch browser history, so drift is impossible by construction).
- **Real bug caught by browser verification, fixed in-branch:** the seven
  once-registered (`[]`-dep) event effects captured the mount render's
  `navPush` — `navLoc()` computed from frozen state recorded `{tab:'home'}`
  forever and dedupe swallowed every later push. Fixed with the **`navJumpRef`**
  live-ref (same pattern as `navBackRef`); chains re-verified honestly:
  Settings@Integrations → market → back → **Integrations restored**;
  Eat-grocery → settings → back → **grocery restored**; hardware back consumes
  the guard then defers to the platform at empty; tab taps leave the stack
  alone.
- Verified per commit: JSX parse · `tsc --noEmit` · `VITE_BASE=/m/` build exit
  0 · `npm test` 517 · LF. **Open:** PR B (pros shells) · PR C (gestures) ·
  owner on-device pass rides PR C.

### 2026-07-09 — Book now parity: BOTH mobile invited "Book now" CTAs fire the one-time purchase (#1640, `67e8f092`)
- **Closed the wrong-charge path on the mobile first-dibs invite.** Both invited
  waitlist "Book now" buttons started the **monthly subscription** (`doSubscribe` /
  `openCheckout(monthlyPkg)`) under a one-time label. Now both fire the **per-role
  ONE-TIME purchase** — a non-Subscription `item.type` puts `/api/stripe/
  checkout-session` in payment mode; the charge is **server-authoritative**
  (trainer `session_price` / nutritionist `meal_plan_price`, the same fields
  `coach.rate` maps from) — matching the website first-dibs fix (#1498).
- **Two surfaces:** the Signal coach profile (`iosAppBroadsheetClient` — new
  `doBookOneTime`) and the **marketplace Listing** (`iosAppBroadsheetMarketplace`
  invited coupon branch) — the second was a **Codex P2** on the PR: the Listing is
  the PRIMARY conversion page since #1634 and my first commit missed it. Both
  invited states now carry the website's CTA trio — **Book now** (solid, one-time)
  · **Subscribe /mo** · **Decline** — because the normal Work-with/coupon CTA is
  hidden at capacity, so the subscription path must ride the invited state too.
  No route/migration change (the invite gate + webhook booked-flip already cover
  both modes).
- **War Room:** parity item flipped done (both surfaces named); registered new
  backlog items — nav-history back buttons, swipe navigation, website
  phone-screenshot refresh (owner will direct the captures).
- Verified: JSX parse ×2 · root `tsc --noEmit` clean · `npm test` 511 · LF. CI
  green ×2 rounds; CodeRabbit APPROVED + re-review clean; Codex thread fixed +
  resolved. *(Note: the merged branch `claude/booknow-parity` was NOT re-synced to
  main — the force-push was blocked by session permissions; branch kept as-is.)*

### 2026-07-09 — The Marketplace Listing wave: THE LISTING conversion page · real scheduling calendar · coach-authored monthly offer · Habit Ledger · website parity (#1631–#1637)
- **The routing discovery that redirected the wave** (owner prompted): tapping a
  marketplace coach opened the Signal living profile — `BSCoachDetailPublic` was a
  dead fallback. Owner call: build **"THE LISTING"** as the marketplace conversion
  page and keep the Signal profile untouched (reachable via a THE FULL PROFILE →
  leader). Spec `docs/superpowers/specs/2026-07-09-marketplace-listing-design.md`
  (#1632) + plan `docs/superpowers/plans/2026-07-09-marketplace-listing.md`; owner
  additions mid-spec: full calendar access, buyable single workouts, a coach-written
  monthly-offer description, the Habits page, and website parity.
- **PR B #1634 — THE LISTING (`55ad7ba0`).** `BSCoachDetailPublic` rebuilt as one
  continuous ledger (the tabs die): eyebrow `LISTING Nº n · ROLE · ✓ VETTED` (real
  verified flag), duotone portrait, serif split name, tier NAMED in tier color, a 4-up
  SCORE/SESSIONS/YEARS/RATING register, the clipped teal **BOOK THE INTRO · $0** CTA;
  the **standing-offer coupon** (scissor-dashed) carries the **at-capacity waiting-room
  gate** ported from the Signal storefront (join/waiting/invited states via
  `window.ShapeWaitlist`); PROGRAMS + SINGLE WORKOUTS stations bucket the real
  `coach_plans` by category; **honesty pass** — the synthesized match% chip and the
  hardcoded 10.0/10 seeded ratings die (unrated testimonials), `$NaN` rate + footer
  `coach.id` crash + unguarded `coach.spec` fixed on the plans-rail door path.
- **PR D #1635 — Habits "The Habit Ledger" (`c85c91b5`).** Score card → serif verdict
  ("+N banked today — N more on the table.") + a bare 5-col register + ink→teal ledger
  rule; the grid unboxes (cells kept); habit rows → tick-divider rows (24px squared
  checkbox); sections → station heads (accent tick + mono `TO DO · 1/2 DONE`) with an
  underline ＋ Add. One CodeRabbit motif flag declined with receipts (the gradient
  ledger rule is the documented house register, spec'd + pre-existing in-file).
- **PR C #1636 — the calendar + the coach-authored monthly offer (`3030ad31`).**
  New pure **`mobile-app/src/services/coachAvailability.mjs`** (+7 test vectors, suite
  511): projects the coach's weekly `provider_availability` minus booked `sessions`
  (public `GET /api/availability`) into dated open slots over 6 weeks — OPEN THIS WEEK
  shows genuinely-open dated slots, `SEE THE FULL CALENDAR →` opens a month-grid
  (`BSCoachAvailabilityCalendar`, role-heat ticks on bookable days, tap → dot-leader
  slot rows → the same booking confirm); live coaches with no pattern read honestly
  empty, demo/failed fetch falls to a labelled preview pattern. The coupon's
  **WHAT'S INCLUDED →** sheet renders the coach's own `monthly_offer` (blurb ≤600 +
  ≤8 teal-✓ lines, honest "Standard" fallback), and coaches write it from a new
  **Monthly offer** practice shortcut (`BSProMonthlyOfferSheet`, owner-scoped direct
  provider-row write — `monthly_offer` is deliberately NOT admin-pinned).
  **Review round (4 findings, all fixed `8b225896`):** a real **P1** — the route
  serializes `booked` as ISO **strings** but the projector read `.scheduled_at`, so a
  live coach's booked slots reappeared open (both shapes now normalize to one
  wall-time key + a string-shape test vector); DST spring-forward slots now key/display
  as the `setHours`-resolved wall time; the demo-expansion duplicated at two call
  sites → one `expandPreviewSlots`; the offer editor's deletable rows keyed by index →
  stable ids. CodeRabbit confirmed all four on re-review.
- **Migration `2026-07-09-provider-monthly-offer.sql` — APPLIED + verified live**
  (owner ran it same day; `monthly_offer jsonb` confirmed on both `trainers` and
  `nutritionists` via information_schema): shape
  `{blurb ≤600, includes text[] ≤8×≤80, updatedAt}`, limits enforced by the editor.
- **PR E #1637 — website coach-page parity.** All in `livingShared.jsx` (`?v=16`
  across the 7 consumer pages; `livingDesktop.jsx` untouched): the Work-with
  storefront becomes the **standing-offer coupon** (✂ dashed frame, Subscribe/Book
  handlers verbatim), rendering the coach's **`monthly_offer`** off the public
  provider row (fails quietly pre-migration — honest absence); `LvServices` buckets
  the real `coach_plans` with the mobile Listing's **exact** role-aware single
  matchers into a **Single workouts / Single meals** rate-card category. Content
  parity in the site's #1537 ledger grammar — no redesign. **Review round (3, all
  fixed `deedd74e`):** a real **P2** — `d.role` is lowercase in both the demo persona
  and live profiles, so the new `"Nutritionist"` checks never matched (the singles
  shelf would read trainer-labeled and the offer fetch would hit `trainers` for every
  nutritionist) → normalized case-insensitively, incl. the pre-existing price default
  carrying the same latent check; offer lines filter to trimmed strings (the mobile
  contract); the WHAT'S INCLUDED heading gates on lines existing. Merged `d8e55302`.
- **Also this wave:** #1631 — the meal preview serialized (bare 4-up register +
  Kitchen-Card two-column ingredients + lettered method steps) + the radio muted bar's
  clipped frame (dead `onPrompt` removed); #1633 — the Home slate gains a mono
  **DAILY HABITS** sub-head (i18n'd) separating habits from the day's agenda.
- **Verified per commit:** JSX parse · `VITE_BASE=/m/` build exit 0 · `npm test`
  (511) · LF normalization; every PR gated on CI green + CodeRabbit with all threads
  resolved. Session handoff: [`docs/HANDOFF-2026-07-09.md`](HANDOFF-2026-07-09.md).
  **Open:** on-device pass across Black/Sage/Cream × trainer/nutritionist Listings
  (coupon states incl. at-capacity × the calendar month grid × the offer editor) +
  the Habit Ledger + the website coupon.

### 2026-07-08 — Kitchen Card & Catalogue: recipe surfaces + Library rebuilt · catalog → 35 detailed recipes · app⇄web parity (#1627 · #1628 · #1629)
- **Owner-composed direction** (spec `docs/superpowers/specs/2026-07-08-kitchen-card-catalogue-design.md`
  #1625+#1626, plan `docs/superpowers/plans/2026-07-08-kitchen-card-catalogue.md`):
  the recipe surfaces become **"The Kitchen Card"** and the client Library becomes
  **"The Catalogue."** Three PRs, each gated (CI + CodeRabbit), squash-merged, branch kept.
- **The catalog — restructured, detailed, expanded, TDD'd (PR A #1627, `2391c52d`).**
  `mobile-app/src/broadsheet/shapeKitchenData.js` ingredients moved from strings to
  **structured `{n, m, k?}`** (qty · name · optional kcal) with a real quantity on every
  line; a **cookable detail pass** on all 26 (heat/vessel/time + doneness cues, storage
  notes, `time`/`prep`); **+9 new recipes → 35 total**. New
  **`tests/shape-kitchen-data.test.mjs`** gates it (≥35 recipes, ≥4 cue-rich steps,
  structured quantities, macro-consistent kcal ±15%, honest photo paths, and a
  diet-classification desync guard added in review). **`BSKitchenCard`** is one shared
  bounded card (typed Nº header · centered serif title · gold byline · 4-up register ·
  **conditional photo figure — only when a real `photo` exists, no gradient stand-in** ·
  two-column ruled ingredients w/ household-unit conversion · typed coach note) used by
  BOTH the Shape Kitchen detail and the Eat-day preview (kills their drift); recipe detail
  renders the **directions OUTSIDE the card** (lettered serif steps under THE METHOD); the
  day-view preview's fake local save became a **real `bsLibToggle`** library save; the
  Recipes tab got the slim Nº card stack.
- **Library "The Catalogue" (PR B #1628, `d29ad748`).** `BSClientLibrary`'s 4-up bordered
  stat-tile grid becomes a **typographic index that IS the filter** (count · mono label ·
  underline that thickens when active, `aria-pressed`); saved-item cards become
  **tick-divider rows** (kind-color tick · title · KIND · price · coach · meta · saved
  date); the empty state unboxes to an honest italic line. `BSLibraryDetail`'s preview card
  becomes a **kind-spine italic quote** and the save/remove button an **underline action**
  (Start-this-plan CTA + sheet byte-identical). Grocery drops purple `#8a5cf6` for
  `#3b74b8`, single-sourced from `BS_LIB_KINDS`.
- **Website content parity (PR C #1629, `bda5b9a2`).** `public/newdesign/recipes.jsx`
  regenerated from the mobile catalog — **`RECIPES_BY_WEEKDAY` (7, index 0=Sunday, the
  Today widget) + `RECIPES_EXTRA` (28)**, weekday order preserved; structured ingredients
  flattened to the site's **display strings** with the kcal annotation kept
  (`"6 oz chicken thigh, skin-on (330 kcal)"` — lossless); `note` = the mobile `blurb`; the
  `_RECIPE_NOT_GF`/`_RECIPE_HAS_DAIRY`/`_RECIPE_MED` title-sets synced so the site's diet
  filters classify the 9 new recipes; `recipeNeeds`/`recipeMatchesDiet` + all render code
  untouched; `?v=2` on Recipes.html + RecipeDetail.html (CRLF preserved). **Design untouched
  — content-only.**
- **Review rounds (all addressed).** PR A drew 5 CodeRabbit passes — several were real
  correctness/honesty bugs: the Eat-day preview rendered the `linear-gradient(…)` hero
  string as visible text (→ `r.blurb || r.brief`); a false "no saved recipes yet" empty
  state when a filter hid saved recipes; a divergent per-surface library record (→ one
  `bsRecipeLibItem` helper); star-rating a11y. PR C caught a stray **`GF` badge** on two
  non-gluten-free recipes (soy sauce/miso) — fixed at the **source catalog** (same
  contradiction was live post-PR-A) + re-ported, keeping app/web parity.
- **Verified** per commit: JSX parse · `VITE_BASE=/m/` build exit 0 · `npm test` **505**
  green (497 + the catalog data test's suite) · LF (CRLF preserved on the website HTML). No
  migration, no routes. **Open:** owner on-device pass (papers × the card figure/no-figure ×
  the Library index/rows) + **real recipe photography** for the card figure (joins the
  Store product-photo follow-up).

### 2026-07-08 — Train "The Program" + Eat "The Menu": the last two plate-era day surfaces → Open Ledger (#1622 + #1623)
- **Owner-picked Option C** from a 3-way visual concept round (spec #1620 → revised to C in #1621): the **Train deck** and the **Eat day view** — the last two half-serialized client surfaces — finish their serialization into the zero-box Open Ledger language, together with the shared chrome both carry. **Presentation-only** — no migration, no routes, no new modules, no behavior change. Two build PRs, both squash-merged, branch kept.
- **Shared chrome (both pages):** a single **`BSFindCoachBar`** role-leader row (3px spine · glyph · VETTED tag · dot-leader · →) replaces the tinted find-a-coach boxes AND kills the trainer-bar JSX that was duplicated verbatim in the Build-door branch; the **week strip** boxes die → a **calendar rule with a heat needle** over the active day (Session-Meter grammar), typographic day/date columns + rest-day dot beneath, aria-labelled; the **coach-adjust banner** sheds its `BSPlate` → a role-spine notice (squared chips).
- **Train — "The Program" (#1622):** the deck **h1 duplication is fixed** (the headline renders only when it differs from the page title — no more "Upper Pull — Peak" twice); the move list → a **columnar program table** (`N · MOVE · SCHEME · LOAD`, right-aligned tabular loads, display-only scheme abbreviation `3 min rest`→`3m` that never feeds the session parser); coach-adjust chips + Rest tag squared. `data-tour="hero-train"` + ▶ + rust press credit + swap flow unchanged.
- **Eat — "The Menu" (#1623):** top tabs → the **house underline index** (2px heat under the active view, same on Grocery/Library/Recipes); a **kcal register below the calendar** (owner-composed crop) — big figure · 3px heat fill · `52 kcal left` · a **one-line macro register** (`PROTEIN 142/140 · CARBS 178/180 · FAT 58/60`), the three bordered macro tiles dead, **FAT drops raw `#8a5cf6` for `t.BLUE`**, and the hardcoded **`· on pace`** honesty bug removed; the `TODAY · YOUR MOVE` **plate AND the numbered meal list both die** → **courses by time** (rule-header: mono time · hairline · ✓ done / breathing **NEXT** dot / blank), done rows dim with **no strikethrough**, the next course carries the page's one loop + `· 52 KCAL LEFT` + a heat-underlined **LOG IT →**; the nutritionist card → a **gold press credit** (spine, no avatar circle, quote guarded when empty) + **THE SHOP LIST →** closing leader. `data-tour="hero-eat"` moved to the menu container.
- **Consistency win (CodeRabbit Major):** the Eat day-total derivations are **hoisted once** (`bsEatCalTgt` etc., were duplicated across two IIFEs), so the coach-override-aware target now agrees across the register, the KCAL-LEFT sub-line, AND the "The plan" header (which previously re-derived the raw target → two different numbers under a coach override). CodeRabbit also nudged `type="button"` on the new buttons (addressed on both PRs).
- **Verified** per commit: JSX parse · `VITE_BASE=/m/` build exit 0 · `npm test` 497 green · LF-normalized. Browser-driven both pages (390px, demo data): needle follows day taps, program table + course entries open the swap/preview flows, NEXT dot breathes (locked under reduced motion), 0px horizontal overflow, console errors all pre-existing infra 404s. **Open:** owner on-device pass across Black/Sage/Cream × done/next/rest × reduced motion.

### 2026-07-08 — Self-serve training: build your own week, program & race schedule (coach-less members)
- **Closes the coach-less P0** the 2026-07-08 solo-member analysis surfaced: a
  member with no coach had **no workout to log and no way to author one** (Train
  showed a dead "No workout assigned" week). Now they get starter templates, a
  full custom builder (any discipline), an AI draft assist, an open log-as-you-go
  session, and Start-this-plan for purchased marketplace plans. Self-serve is the
  floor; the "Find a trainer" bar keeps its pinned spot — coaching stays the pitch.
  Spec `docs/superpowers/specs/2026-07-08-self-serve-training-design.md`, plan
  `docs/superpowers/plans/2026-07-08-self-serve-training.md`; built task-by-task,
  TDD on the pure modules.
- **Foundation — one migration, everything downstream lights up unchanged.**
  `2026-07-08-self-authored-workouts.sql` (**APPLIED live**): `client_workouts
  .trainer_id` → nullable; **client self-CRUD RLS** (`trainer_id IS NULL AND
  client_id = auth.uid()` pinned on every client write, so coach rows stay
  client-untouchable and self rows coach-untouchable, both ways); and the
  `notify_on_client_workout` trigger **guarded to coach rows** so a self-save (or
  a 100-row program materialization) never fires "New workout from your coach".
  Self rows are just `client_workouts` with a NULL trainer — the Train deck, home
  hero, calendar, live session, +10 award, and workout auto-share (#1613) all
  read them with **zero changes**.
- **Three pure, unit-tested modules** (the source-of-truth pattern):
  `starterTemplates.mjs` (10 sessions + 6 progressive programs — Marathon 16wk ·
  Half 12wk · 10K 8wk · Triathlon sprint 12wk · Hyrox 8wk · Strength block —
  real endurance build/cutback/taper, Hyrox mixing lift + segment rows, tri
  rotating swim/bike/run + a brick; 8 tests), `trainingBuilder.mjs` (cap
  validation `weeks × days ≤ 182`, program materialization onto real dates,
  weekly-repeat slotting; 9 tests), `planOutline.mjs` (the coach `bsAssign*`
  parsers **extracted from `iosAppBroadsheetPros.jsx`** + `bsMaterializeOutline` —
  one implementation, the pros app imports them back; 7 tests). **497 tests green.**
- **The four features.** (1) **Build-your-week door** replaces Train's empty state
  (signed-in, no plan): Sessions shelf · Programs shelf · BUILD YOUR OWN · ✦ Draft
  · Open session; signed-out keeps the demo deck behind a locked door. (2)
  **`BSWorkoutBuilder`** — quiet Open-Ledger full-page form: SESSION mode (name ·
  discipline chips · weekday toggles → `repeatDow`, ONE recurring row · move rows
  that toggle **lift** (sets×reps×load) ↔ **segment** (`seg`, e.g. "10 mi · Z2"),
  mixable) and PROGRAM mode (member-chosen **weeks 1–26 or a race date** · a
  week-by-week review any day is editable in · live `bsProgramFits` gate that
  BLOCKS an over-182 save, never truncates). (3) **✦ Draft it for me** — new
  `POST /api/ai/draft-program` (cloned from `generate-plan`'s structured-output
  plumbing, membership-gated by the `/api/ai` prefix + an auth check) returns a
  STRUCTURED program into the builder's review; **nothing persists until the
  member saves** (human-in-the-loop); model-down degrades to an honest
  "unavailable", never a blank program. (4) **Open session** — the live player
  starts empty with inline move-naming + ＋ Add move; saves through the identical
  `saveWorkoutSessionLog` path (+10, dedup, auto-share inherited). (5)
  **Start a purchased plan** — Library owned plans finally schedule; the shared
  outline parsers materialize dated self rows, and a **re-start is atomic-in-
  effect** (new block lands first under a fresh `runId`, the prior run deletes
  only after — no data-loss window, no duplicates).
- **Guardrails / honesty.** The plan route now **windows dated rows** to
  this-week-forward OR undated (`scheduled_date.gte.<weekStart>` / `is null`) so a
  long block's early weeks can't push the current week past the 60-row limit; a
  coach-assigned workout **wins the day slot**; self days read **"Programmed by
  you"** (or the program name · Wn) with a teal spine — never a fabricated coach
  name; signed-out preview is byte-identical except the locked builder door.
- **Server surface:** the one migration + one new route (`/api/ai/draft-program`,
  registered in the War Room) + the `/api/client/plan` window & passthrough
  (`repeatDow`/`seg`/`program`/`selfAuthored`). `ShapeSelfTraining` (save session/
  program, start plan, remove, list) + `ShapeTrainingAI.draft` on the mobile data
  layer. Verified per task: JSX parse · `tsc --noEmit` · `VITE_BASE=/m/` build
  exit 0 · `npm test` 497.
- **Review round (all 6 fixed before merge, #1618 → `10f2fa3f`).** Codex 3×P2 —
  (a) `draft-program` used the cookie-only server client, so the **native app's
  Bearer draft would always 401** → switched to `currentUser(request)` (cookie OR
  Bearer); (b) the plan route sorted **nulls LAST**, so a long program's future
  dated rows could crowd the undated weekly-repeat row out of the 60-row cap →
  `nullsFirst: true` (kept this-week-*forward*, not this-week-only, so a coach
  plan starting next week still reads `hasPlan` — no false Build door); (c)
  **Edit · Yours** didn't carry the row id, so editing a repeat inserted a
  duplicate → the seed now threads `workoutId` and `saveSession` retires the old
  row after the new lands. CodeRabbit 2×Major + 1×Trivial — (d) OpenAI strict
  Structured Outputs **rejects `minimum`/`maximum`**, which would have errored
  every draft call → dropped from the `dow` schema (the 0–6 clamp stays in
  `sanitize()`); (e) `bsValidProgramShape` skipped per-move validation → now runs
  the same `validMove` predicate; (f) `saveSelfProgram`/`startPurchasedPlan`
  batched from up to 182 serial inserts to one array insert. CodeRabbit APPROVED
  on re-review; CI green ×3.
- **Open follow-ups:** on-device pass across papers ×
  disciplines (strength/run/tri/Hyrox) × the share matrix; coach read of a
  member's self-authored plans (v1 shows it only via the session logs); website
  builder parity (mobile-first).

### 2026-07-08 — Workout auto-share: device + in-app workouts post by the member's own privacy (#1613 build)
- **Made the DEAD "Share workout data" toggle real** and closed the whole
  coach-less-solo social gap the analysis surfaced: a member's workouts now
  auto-post to their profile + community feed at the privacy their OWN settings
  resolve to, across every source. Builds on the Following feed (#1610) — this
  is what writes the `followers` tier. **No migration.**
- **One rule (pure, unit-tested):** `Share workout data` × `profileVisibility`
  → On+Public `public` (Universal feed + profile) · On+"Just friends"
  `followers` (only their followers' Following feeds) · On+Private or Off
  `private` (self; coach still sees it via the client view). Missing settings
  resolve to the defaults (On·Public) → sharing is automatic out of the box.
  `mobile-app/src/services/workoutShare.mjs` is the source of truth (+
  `tests/workout-share.test.mjs`, suite 473); the server `src/lib/
  workout-share.ts` **imports the pure fns from it** (one implementation, no
  twin drift — CodeRabbit Major) and adds the DB wrappers (resolver **fails
  CLOSED** to private on any read error, dedup query, first-share notice).
- **All six write sites obey it:** the 4 device syncs (Strava/Apple Health/
  Oura/Whoop) stop hardcoding `privacy:'private'`; **Garmin finally auto-posts**
  (it synced activities but never posted); **in-app logged sessions** auto-post
  — and that path was repaired: session-id-idempotent `source_activity_id`
  (was `Date.now()`), `created_at` stamped at session START (so the ±20-min
  cross-source dedup lines up with device posts), the **+5 community award
  gated off** for auto-shares (the workout already earns its +10), and the live
  session's share toggle now **seeds from the member's rule** (passes `null` =
  rule decides). **Every sync's UPDATE branch strips `privacy`** so a re-sync
  can never loosen a retro-tightened post.
- **Safeguards:** ±20-min cross-source dedup both directions (watch + phone
  can't double-post one workout); **retroactive tightening** — flipping Share
  off or profile → stricter pulls every past auto-post down
  (`ShapeCommunity.tightenAutoPosts`, one shared `bsMaybeRetightenAutoPosts`
  helper), loosening never republishes, manual composer posts untouched;
  one-time first-share notice (server notification + mobile toast) whose dedup
  stamp lives in its **own** `user_goals('auto_share_flag')` row — never merged
  into `client_settings`, so the best-effort write can't clobber a concurrent
  Settings change (CodeRabbit Major); sleep/recovery still never post.
- **Review round (all addressed before merge):** Codex P1 — the mobile
  resolver ignored Supabase's non-throwing `.error`, so a *failed* settings
  read defaulted to PUBLIC → now fails closed like the server. CodeRabbit
  (2 Major + 2 Trivial) — single-source pure logic, race-free dedicated-row
  stamp, extracted retro-tighten helper, dropped a redundant `client_settings`
  re-read. CodeRabbit re-reviewed + acknowledged; `tsc` clean, `next build` +
  mobile build green, 473 tests. **Open:** on-device pass across papers +
  the share matrix (Public/Friends/Private × On/Off) + the retro-tighten flip;
  composer "Followers" option for manual posts (deferred).

### 2026-07-08 — Community feed: Universal/Following toggle + `followers` tier (#1609 spec · #1610 build) · workout auto-share spec (#1611)
- **The community feed gains a two-mode viewing lens** (owner-designed round:
  no separate follow feed — ONE feed with a switch): **UNIVERSAL** (default —
  the whole community's public activity, byte-identical to the old feed) and
  **FOLLOWING** (your accepted follows + yourself, including their new
  **`followers`-tier** posts). House underline-index toggle on the mobile chat
  Community feed AND the website community page; choice persists per device
  (`localStorage('shape.feedMode')`).
- **New `followers` post privacy tier** — migration
  `2026-07-08-followers-post-visibility.sql` (**owner runs it**): CHECK +
  `can_view_community_post()` + the read RLS policy allow the author + their
  ACCEPTED followers (`user_follows.status='accepted'`), nowhere else;
  likes/comments/profile views inherit automatically (they gate through the
  function). This is how a Just-friends member's activity reaches only their
  friends' feeds. Nothing writes the tier yet (that's Spec 2), so everything
  degrades safely pre-migration.
- **One rule module**: pure `mobile-app/src/services/feedMode.mjs`
  (`bsFeedQuerySpec` — universal keeps `['public','community']` + no author
  filter; following adds `followers` + scopes to accepted follows + self),
  unit-tested (`tests/feed-mode.test.mjs`, suite 468). Mobile
  `listCommunityPosts(mode)` + a 60s-cached accepted-following reader; web
  `GET /api/community/feed?mode=following`. RLS is the authority — client
  filters only narrow.
- **Honest Following empty state** (mobile): follow suggestions
  (`BSFollowSuggestions`) + a one-tap `SEE EVERYONE — UNIVERSAL →` escape;
  website gets the text + escape. **Review round (both fixed + replied):**
  Codex P2 — escaping an empty Following into an empty Universal leaked the
  live-empty flags (now an explicit reset restores the legacy demo fallback;
  errors never downgrade); CodeRabbit Minor — signed-out Following on the web
  dead-ended on a generic empty (now the demo set shows in both modes,
  mobile-parity per spec AC6). CodeRabbit APPROVED; staging click-through
  verified the toggle both ways with zero new console errors.
- **Spec 2 merged (#1611, build next): workout auto-share.** Device +
  in-app workouts will post by the member's own privacy —
  `Share workout data` × profile visibility → public / followers / private
  (defaults On·Public = automatic), the 4 syncs stop hardcoding
  `privacy:'private'`, Garmin joins the pipeline, in-app sessions auto-post,
  ±20-min cross-source dedup, retroactive tightening, first-run notice. Makes
  the currently-DEAD Settings toggle real. Build requires #1610's migration
  applied first.

### 2026-07-07 — Chrome pass: side cushion · slimmer nav · condensing pinned masthead · followers-sheet fix (#1603 · #1605)
- **#1603 (owner screenshots):** app-wide **side cushion +2px** on all three density
  tiers (`padX` 24/20/16 → 26/22/18 — one token, every `t.padX` consumer moves
  together); the bottom **nav bar trimmed 72→64px** (tighter padding + page scroll
  reserve to match); the Nora **Support chat serialized into the Open Ledger
  language** (masthead + tinted bubbles); and the **followers/following sheet
  bleed-through fixed** — the header was `position:sticky` INSIDE the padded
  scroller, so on device rows rode up into the safe-area strip and painted through
  the masthead/tabs/search; restructured to an opaque static header layer + the
  list scrolling in its own pane (rows physically can't get behind the chrome).
  CodeRabbit APPROVED (0 findings, incl. the post-push followers commit).
- **#1605 — condensing pinned masthead (owner request: the top heading bar stays
  present on scroll, same spacing on every page).** Every page embeds its own
  masthead inside scrolled content at varying offsets, so per-page sticky would die
  with its parent block — instead **`BSPage` owns it**: scroll past ~64px and a
  pinned strip (logo + `Vol. 1 · No. 1` + the standard search/avatar corner) slides
  in, with uniform `t.padX` + safe-area cushion by construction. Mirrors the tab
  bar's paper treatment (gradient + blur + hairline + shadow, flipped) so top and
  bottom chrome read as one instrument; zIndex 60 (above the 55 tab bar, below all
  sheets); `prefers-reduced-motion` renders without the slide. The corner is
  window-bridged (`window.BSMastCorner`) since the chrome can't import client
  components — pros shells get it via the established client-globals load order.
  Full-screen flows opt out via `mast={false}` (applied to the meal logger, whose
  `× Cancel` chrome + sticky log bar must stay unobstructed).
- Housekeeping: closed the accidental **staging→main PR #1604** (the `staging`
  branch is the force-pushed scratch preview pointer — its content ships through
  each feature's own PR; #1604's diff had silently drifted to unreviewed work).
- **Open:** on-device pass for the masthead (papers × reduced-motion × safe-area on
  the notch); consider `mast={false}` for other full-screen flows if the strip
  reads wrong anywhere (calendar event sheets, live session).

### 2026-07-07 — Meal logger → "Correct the Record": Open Ledger restructure (#1597 spec · #1601 build)
- **The last plate-era client sheet, rebuilt.** `BSLogMealFlow` (mobile) restructured
  from a 4-way mode-tab sheet into the Open Ledger language, fixing four real defects:
  the stale top-only log CTA, the mixed taxonomy (meal edits vs coach messages in one
  control), hardcoded "Dr. Maya" + fabricated 2100/165 goals for signed-in users, and
  the discarded +10 award result.
- **Sticky ledger bar** (portaled into `#bs-phone-surface`) is now the always-reachable
  log action; its label is derived from state and **can never claim "as planned" over an
  adjusted meal** — `Log as planned →` when pristine, `Log · 210 kcal · 0.75× →` once
  anything diverges. The one-tap plate shows only for a pristine planned meal and
  **collapses to a `↺ Adjusted — reset to plan` row** when adjusted; a free log (no
  planned meal) shows neither and the CTA disables at 0 kcal. The pure dirty-predicate +
  CTA-label logic lives in `mobile-app/src/services/mealLoggerState.mjs` (+ `tests/
  meal-logger-state.test.mjs`, 6 cases).
- **Two honest registers:** CORRECT THE RECORD (portion · ingredients · one ADD action
  that opens a search/manual sheet — the SEARCH tab retired) and DISPATCH TO {coach}
  (note + photo/voice **disclosure chips**), which **hides entirely** when a signed-in
  member has no linked coach. THE TALLY reads **real day targets** from the home ticker
  (`cal_target`/`protein_target`) or `/ —` when absent; the real linked nutritionist name
  (nutritionist-gold accent) replaces "Dr. Maya" — demo 2100/165 + Maya are signed-out-only.
- **+10 Score moment:** `logMealMacros` now surfaces the `award_meal_log` result instead
  of discarding it; the confirmation shows `+10 · NUTRITION · SHAPE SCORE` **only when
  actually granted** (first log of the day). "Undo" (which never reversed the POST) →
  `← Back`.
- **Review round (all addressed before merge):** Codex P2 — home call site now passes
  `dayTargets` (was missed, so signed-in totals showed `/ —`); CodeRabbit 🟠 blocking
  (honest-data) — the demo FOODS catalog no longer renders as "Recents" for signed-in
  members (they get "search coming — enter manually"); CodeRabbit 🟡 — ingredients carry
  a stable `bsIngId()` so the React key can't collide on duplicate names. Staging
  click-through verified the pristine → adjust → reset → add-food flows end-to-end.
- **Open:** on-device pass across papers (Black/Sage/Cream, both chart toggles,
  reduced-motion); real food-database search (add sheet labels recents honestly today);
  real undo / macro reversal (deferred — flagged in the spec).

### 2026-07-07 — i18n rollout begun: the language switch works; Settings + Home localized ×13 (#1589 · #1590 · #1592 · #1595)
- **Diagnosed the "nothing changes when I change the language" report.** The
  language **switch itself works** (verified three ways: a headless `changeLanguage`
  repro flips `t()` synchronously with the eager-bundled catalogs; there's a **single**
  i18next instance shared via `window.ShapeI18n`, so no dual-instance bug; the only
  `changeLanguage` call lives in `BSAppShell`, which is mounted whenever the app —
  incl. Settings — is on screen). The real problem was **coverage**: only ~25 strings
  were ever wired (bottom nav + the Score page + a few labels), so ~99% of the app —
  including the Settings screen the user was testing on — is hardcoded English literals.
  The i18n foundation shipped a tiny pilot; the rollout was never done. **Not a bug —
  a ~2%-built feature.**
- **Rollout approach (owner-chosen):** full app, **LLM machine translations** (flagged
  for later human review), staged **one PR per surface**, all 13 active locales
  (`en es pt-BR fr de it id vi tr ha pcm ru uk`). Each surface: route its hardcoded
  strings through the existing `useShapeTr()` bridge (`const tr = useShapeTr(); tr('<ns>:<key>',
  {defaultValue})` — never shadow the theme `t`), register a new namespace in the i18n
  runtime's `NS` array, author the 13 catalogs (flat dotted keys, ICU-validated, brand
  nouns literal), verify (parse · catalog parity · `/m/` build · `npm test` 458 · LF).
  Built subagent-driven on **Opus**, CodeRabbit as the authoritative gate.
- **Settings — fully localized (#1589 + #1590).** `BSSettings` + every sub-component
  wired through `tr('settings:…')`; **325 keys × 13 locales**. CodeRabbit caught (all
  fixed): 11 brand-noun inconsistencies (Score/Store now literal everywhere), a
  device-locale renewal date (→ selected UI language), an untranslated "Pause" toast
  (→ dedicated translated sentences), a duplicated paper-mode list, and a raw accent
  key in the appearance subtitle (→ routed through `settings:accent.*`).
- **Language dropdown lists names in the selected language (#1592).** The Settings
  dropdown listed each language by its own endonym (English/Español/Italiano); now it
  lists them **in the currently selected language** — pick Spanish → Inglés/Español/…,
  pick Italian → Inglese/Spagnolo/…. Uses the built-in **`Intl.DisplayNames`** (CLDR)
  so there's no 13×13 name table to maintain; verified correct for all 13 incl. Hausa
  (Turanci/Faransanci) and Nigerian Pidgin, with an endonym fallback. *(UX note: this
  means a user who lands on a language they can't read sees every option in that
  language — the owner chose names-in-selected-language over each-in-its-own-name.)*
- **Home / "Front Page" — fully localized (#1595).** New `home` namespace registered;
  `BSClientHome` + `BSTodayNudge/Page/Card`, `BSSlateRow`, `BSProgressDoor`,
  `BSMeGoalCard`, `BSHomeWorkoutPreview` wired through `tr('home:…')`; **176 keys × 13**.
  Dates/numbers now follow the selected UI language via a new
  **`window.ShapeI18n.intlLocale()`** (maps catalog codes Intl doesn't know, e.g.
  `arz`→`ar`). CodeRabbit fixes: Hausa `one` plural forms added to 7 count strings,
  a casing typo, and the intl-locale routing.
- **PAUSED here at the owner's call** — the two highest-traffic surfaces (Settings,
  Home) plus the dropdown are live. **Remaining (each its own PR):** Profile → Session
  details → nav chrome → Feed → Marketplace → Radio → Calendar → Habits → Store → then
  the **coach app** (`iosAppBroadsheetPros.jsx` has zero i18n calls; needs its own
  `useShapeTr` bridge wired first). Carried-over CodeRabbit nit: extract a shared
  `bsDateLocale()` helper (fold into the next surface PR). State tracked in the SDD ledger.

### 2026-07-07 — Grocery wave: Open Ledger surfaces · role-true coach heat · trainer nav door (#1591)
- **Trainer coach-home nav gains a GROCERY LISTS door** (INSIDE. index) — the
  coach grocery page (`BSProGroceryLists`) was already fully trainer-aware
  ("Meal support" / "Coach Queue" copy, notify-only delivery) but only the
  nutritionist nav exposed it. Codex P2 caught the second half: the trainer
  `openHomeWidget` never routed `'grocery'` (a silent no-op door) — wired to
  `setQueueView('grocery')` like the nutri shell.
- **Coach Grocery Lists page → Open Ledger** (owner screenshots — it was the
  plate-era look: pill tabs, rounded cards, pill chips, rounded CTAs). Now:
  **role-true heat** via `bsProHeat` (trainer rust / nutritionist gold — the
  old accent was INVERTED: nutri=rust, trainer=green), a serif verdict lead +
  ink→heat rule, a typographic Clients/Mine index, a quiet underline create
  form (`.bs-uline`), zero-box heat-spine list blocks with dot-leader aisle
  rows, honest dashed-rule empty states; **teal = the one action** (Create /
  Send to client); Delete demoted to a rust text-action.
- **Client grocery color decision (owner-ratified): client surfaces lead
  TEAL; the nutritionist shows up as a GOLD tag** on what she sent — the
  "Nutri plan" source chip + list-picker rows tag gold (was teal/green), and
  the confusing `const rust = teal` alias in `BSGrocery` is renamed `accent`
  (CodeRabbit Major; `t.RUST` semantic uses untouched). New shared
  `bsGroceryHues(t)` helper = one teal/gold source for both grocery components.
- **"Saved carts" (`BSGroceryLibrary`) finished into the ledger grammar**: the
  filter pills → a typographic index (active = ink + teal underline,
  `aria-pressed`), the boxed PAPER2 list cards → zero-box kind-spine rows
  (mealplan gold · recipe amber · custom purple) with inline dot-rule item
  previews, and Edit/Duplicate/Delete → text-actions (Load keeps the clipped
  INK CTA).
- Presentation + wiring only; list/create/send/delete handlers verbatim. All
  4 review findings (1 Codex P2 + 3 CodeRabbit) fixed + replied in-PR
  (`6637c918`). Squash-merged `a44e50e6` (#1591); CI green ×2 rounds; built in
  a fresh worktree; CI was the build gate.

### 2026-07-07 — Chat left-rail: Friends/Team ledger parity (#1596) + presence rail live-vs-demo (#1599)
- **The Channels ledger language (#1593) extended to the rest of the chat
  left-rail** (owner: after the Channels tab, "how would you match the
  Friends/Team/Coaches" lists). Key call: those are *conversations*, not a
  *directory* — so match the LANGUAGE (color/type/motion/head), NOT the row
  shape (the tier-avatar + last-message + time + teal-badge row is the right
  DM archetype and was kept). Presentation only — every handler/predicate/
  signature intact. **#1596** (`8110c199`):
  - **One tab grammar across the whole chat.** `bsSubTab` (shared by the Team
    Coaches/Friends toggle AND the top-level feed role chips) drops the
    decorative bracket-frame chip for the **typographic underline index**
    (active = the tab's own color + a drawn underline). The off-palette pink
    `#ff5a5f` unread pill dies → a bare colored count. Owner chose the unify
    option (touches the feed chips too — the bracket-frame was the last analog
    holdout).
  - **The DM rows breathe.** The off-palette green `#3ddc97` online dot → a
    **breathing teal dot** (`bsSdPrBreath`, reduced-motion gated) — the same
    live signal Channels' LIVE rooms carry.
  - **`ThreadHead`** gains a section label (Friends / Coaches) + a register
    (`N threads · N new`, new in teal) over the ink→teal gradient rule; `＋ New`
    kept. `BSFollowSuggestions` cards + Follow pill squared to house radii.
  - CodeRabbit Trivial (teal ternary dup) addressed by aliasing the component's
    `tealSig` to the `teal` const declared above it (one source in this
    component; the literal is a documented repo-wide convention). Owner
    previewed the branch deploy; squash-merged after CI green ×2.
- **Presence rail is LIVE when signed in, demo only in preview (#1599,
  `1098f070`).** Owner: "Training now should be demo when previewing but live
  when logged in." The live source was **already wired** (`ShapePresence.activeNow`
  → `realActive` with real tier/avatar/name); only the fallback was wrong —
  `realActive.length ? realActive : TRAINING_NOW` showed the demo cast to a
  signed-in member with nobody active (fabricated people to a real user).
  - Fixed to auth-gate FIRST: **`railPeople = loggedIn ? realActive : TRAINING_NOW`**
    — signed-in shows only real active members (or none), signed-out preview
    shows only the demo. Codex P2 + CodeRabbit **Major** caught the first cut
    (`realActive.length ?…` still prioritized `realActive`, which `activeNow`
    can populate on mount regardless of auth → a preview could leak real
    people); the auth-first gate closes it. Both fixed + replied (`d61398ff`).
  - The rail now **hides entirely** when nobody's active (a signed-in member
    with an empty roster sees no rail, not an empty strip); `liftingNow` uses
    the real online count, the `2104` demo number is signed-out only.
- Open follow-up (unchanged): the presence rail's per-person set still depends
  on `activeNow` returning members mid-activity (the War Room v2 "see the
  workout in progress live" spine) — the gating is honest now; the density is
  data-dependent. Plus the standing on-device pass across the papers.

### 2026-07-07 — Chat Channels directory → "The Channels" Open Ledger index (#1593)
- **The Channels tab loses its plate-era chrome** (owner: "analog, out of
  date, static" — pill search, rounded ＋ box, pink LIVE/NEW capsules, per-row
  icon soup). Rebuilt as a ledger index, owner-previewed on the branch deploy
  before merge:
  - **Ledger head**: `THE CHANNELS` eyebrow + an honest register (`N channels
    · N live · N new`, live/new in teal) over the ink→teal gradient rule.
  - **Underline search** (`.bs-uline`, teal focus, CLEAR text-action) + a
    **＋ NEW text-action**; the boxed create form goes quiet zero-box —
    underline name field, typographic Public/Private toggle (`aria-pressed`),
    Cancel text-action + the clipped teal CREATE CTA.
  - **Rows → a dot-leader index**: serif `#name` · **LIVE = teal text + a
    breathing teal dot** (`bsSdPrBreath`, reduced-motion gated — the page's
    life signal; the pink `#e0518a` capsules die), unread = bare teal
    `N NEW` text (the red `#ff5a5f` pill dies), mono member/online meta with
    the online count in teal, pin STATE kept, joined rows open on tap (quiet
    chevron), unjoined get the one clipped teal JOIN CTA. Rows fade up once
    (`bsSdFadeUp`, staggered, reduced-motion gated).
  - **Send/share move OFF every row into the channel THREAD header** (new
    `onSendChannel` prop on `BSChatThread` + the send sheet rendered in the
    open-thread branch; share is self-contained) — the index keeps only the
    pin. Codex P2 caught the demo hole: the header send is **gated off
    sample channels** (mirrors the old row gate) so the send sheet can never
    target a channel that doesn't exist.
- **Dead code swept**: `_chPalette` (never referenced) + `unreadBadge` (the
  red pill — its only caller was the old channels row). CodeRabbit Minor:
  `openChannelNow` derives one `mc = memberCount || 0` for both the label and
  the field. Handlers (list/create/join/pin/send/unread) verbatim.
- Squash-merged `4ddafab0` (#1593) after the owner previewed + called it done;
  CI green ×2 rounds; both review findings fixed + replied (`fb1ca06b`).

### 2026-07-07 — Coach pass: live-bulletin OPEN fix · honest ledgered event sheets · live-watch console (#1587)
- **Dead OPEN → on the nutritionist Today live bulletin fixed.** Root cause: the
  demo path fired `onWatchLive` with a trainer workout payload at a handler the
  nutri shell never wires — a silent no-op. OPEN → now opens **`BSLiveBoostSheet`**
  (#1514 — a cheer that lands mid-cook) for BOTH real live clients and the demo
  bulletin (the sheet self-labels previews). The sheet is window-exposed from the
  client bundle, and — CodeRabbit's **P2**, a real catch — the bulletin
  **dynamic-imports the client module on demand** first, because a cold coach
  session loads the pros bundle WITHOUT the client module (`loadProsBundle`
  imports only the 5 feature modules + pros), so the global wouldn't exist on
  exactly the path being fixed.
- **Coach calendar client-event sheets (SES/CON/MEAL) — data honesty.** RPE no
  longer fabricates `8` (and cardio ZONE no longer defaults Z2) on events with no
  authored detail; the hardcoded consult **agenda + last-consult notes were
  shown on REAL bookings** → now demo-gated (`event.source !== 'event'`), with an
  honest "No agenda attached · set one when booking" line on live consults; the
  no-detail session copy is role-aware (coach copy instead of the client's "open
  the Train tab" line).
- **Event-sheet serialization (Open Ledger).** Boxed stat/macro plates → a shared
  **`BSEventStatRegister`** (bare eyebrow-above-figure columns + ink→accent rule;
  extracted per CodeRabbit's dedup Major); boxed move/plate lists → dot-leader
  ledger rows; tinted cue/notes boxes → accent-spine italic blocks; station
  eyebrows carry accent ticks.
- **Live watch console (`BSProLiveWatch`) design pass** (owner-reviewed): rust
  retired from the chrome — LIVE chip, WATCHING LIVE eyebrow, and the exercise
  period go **teal** (live = teal; rust stays severity-only); SEND A CUE / UP
  NEXT red eyebrows → station heads; the set grid drops its box-field look (it's
  a **read-only mirror** of the client's inputs) for bare tabular figures with a
  teal underline on the live set; SEND → the clipped solid-teal CTA; the queue's
  filled active box → a teal **NOW spine**; the header counter reads `SETS 6/20`.
- Squash-merged `d8c4eeac` (#1587); CI green; all 3 CodeRabbit findings fixed +
  replied in-PR (`1a13c08f`). Merge-on-green per the owner's flow; parse-check ×3
  + LF; CI was the build gate.

### 2026-07-07 — Goals flow: Open Ledger sheets + "one goal, many terms" hierarchy (#1585)
- **The four goal-flow sheets re-clothed in the Open Ledger form grammar** (owner
  screenshots flagged them as the last boxed-form stragglers). New **`.bs-uline`**
  utility (shared chrome CSS): zero-box **underline field** with an accent focus
  underline via `--bs-accent`/`--bs-uline-ink` (+ a `.bs-uline-row:focus-within`
  variant for rows whose inputs share one underline). Behavior/handlers verbatim:
  - **`BSWeighInSheet`** — boxed PAPER2 inputs die for a bare 40px underline
    weight register (tabular, unit as a mono eyebrow) + a quiet underline
    body-fat row; ink→teal gradient rule under "Today's *weight*."; Cancel →
    ink text-action; Save → the clipped solid-teal ledger CTA.
  - **`BSOverallEditSheet`** — all fields → underline grammar (numbers tabular);
    YOUR WHY → hairline transparent box; Cancel → text-action.
  - **`BSHeadlineEditSheet`** (rust/gold) — gradient head rule, underline fields,
    clipped solid-accent Save; eyebrow reads `EDIT · HEADLINE`.
  - **`BSGoalEditSheet`** — underline fields; the boxed template picker dies for a
    **typographic category index** (active = ink + teal underline) over
    **dot-leader template rows** (`name ···· ~N WKS`, mono sub); the tinted
    timeline box → a mono dot-leader line; DELETE/CANCEL → text-actions.
- **"One goal, many terms" (owner-approved de-confusion pass).** Four goal-shaped
  objects competed on the Contract page; now there is exactly ONE: a **THE GOAL ·
  BY {date}** eyebrow leads the verdict; the station mottos (`trainingMeta`/
  `nutritionMeta`) demote to one quoted italic byline; the station lists reframe
  as **SUPPORTING TARGETS · SERVE THE GOAL**, cap at 3 visible rows with an
  `N more target(s) · SHOW ＋` expander; the language sweeps through (add-buttons
  → "Add a training/nutrition target", the per-target sheet retitles **New/Edit
  target** + SAVE TARGET). Data model + handlers unchanged.
- **Contract-page tweaks (owner screenshots):** `BSOLHead` station eyebrows
  bolder (8.5/INK50 → 9.5/INK, 10px tick); the add-target rows are
  **dashed-border add-boxes** (obviously buttons, 48px targets).
- **CodeRabbit round (all fixed + replied, `864cdeb0`):** a real **Major** — the
  weigh-in zero-box pass had dropped the only keyboard-focus cue (fixed via
  `.bs-uline-row:focus-within`); "1 more targets" pluralization; the duplicated
  station furniture extracted to shared `stationMotto`/`tgtEyebrow`/`tgtExpander`
  helpers. Squash-merged `2d7fe066` (#1585); CI green; merged on green per the
  owner's call (no preview pass). Built in a worktree; local build stays
  App-Control-blocked — CI was the build gate.

### 2026-07-07 — Goal add/edit sheet → full-page title-page panel + hidden scrollbar (#1582)
- **`BSGoalEditSheet`** (the per-goal add/edit sheet with the categorized template
  picker, mounted from the Goals "Contract" page) was the last goal sheet still on
  the old bottom-sheet look — #1423 converted `BSOverallEditSheet` + the
  primary-goal picker to full-page title-page panels but left this one behind
  (owner screenshots flagged the mismatch + the visible scrollbar). Rebuilt on the
  `BSOverallEditSheet` pattern: full-page panel (masthead + ✕, `NEW/EDIT · GOAL`
  eyebrow, serif hero w/ the teal italic, ink→teal gradient rule, pinned footer),
  a `.bs-hide-scroll` scroll body (**scrollbar gone**), squared `.bs-field`
  fields + squared template chips/rows, squared footer CTAs w/ the clipped teal
  SAVE GOAL.
- **DELETE now renders only when editing an existing goal** (it was shown — and a
  no-op — on the New sheet). Numeric fields keep the raw string while typing and
  coerce on save; blanks normalize to the sheet defaults (0/100) so `goalMeta()`
  never renders an empty ratio (CodeRabbit's one finding, fixed in-PR). Behavior
  otherwise verbatim (templates + category chips, timeline line, percent toggle,
  `#bs-phone-surface` portal).
- Squash-merged `1b080431` (#1582); CI green (Web · Mobile · gitleaks). Built in
  a separate worktree off `origin/main` so the in-flight coach-actions WIP stayed
  untouched. Local mobile build remains blocked on this machine (App Control /
  oxide) — CI was the build gate; suggested on-device click-through: Goals →
  ＋ADD (templates render, pick prefills) + edit an existing goal.

### 2026-07-07 — Coach Adjust/Schedule ledger heads · Review "The Queue" · honest nutrition review (#1581)
- **PR B of the coach "Open Ledger" wave** (spec `docs/superpowers/specs/2026-07-07-coach-plans-actions-review-open-ledger.md`,
  plan `docs/superpowers/plans/2026-07-07-coach-plans-actions-review-ledger.md`).
  The last coach action + review surfaces serialized into the ledger grammar.
  Presentation-only; built subagent-driven on Opus. Three commits.
- **Adjust + Schedule — ledger heads over quiet forms.** New `useBSProClientHeat`
  hook: the two action pages now take **the client's own member tier** as their
  heat (same `getUserPoints → bsTierForPoints → bsTierColor` resolution the Case
  File uses, role-heat fallback). `BSProClientMini` → a press-credit spine row;
  `BSProActionSec` → a station head (heat tick + `eyebrow · title` + ink→heat
  rule); the Schedule booking summary → a bare **DAY · TIME · LENGTH** register.
  The one primary action per page stays **solid teal** (Apply & Send / Apply &
  Notify / Add to calendar — now teal on the nutritionist side too, was gold);
  every quiet form control (steppers, chips, day picker, slot grid, duration
  segment, split editor) is untouched.
- **Client/Workout Review — "The Queue".** `BSWorkoutReviewPage` loses its tinted
  cards: a ledger header (`THE QUEUE · N ITEMS`, serif "Workout review." /
  "Client review." heat-italic, honest uppercase status line), a **dot-leader
  queue** whose selected row carries a heat spine + `aria-current` (never
  color-only), `BSTStationHead` section heads, bare eyebrow-above-figure
  registers, dot-leader set rows, and honest-absent redaction. The coach-notes
  composer stays a quiet form (ink Save button — this page's primary action).
- **Nutritionist review demo — honest nutrition shape.** The nutritionist Review
  demo had been **relabeled workout sets** (245-LB "meal prep" loads); it's now
  real meal-log days (`nutrition: true` with kcal/target/protein/meals). The
  detail body branches on `selected.nutrition`: a **KCAL · TARGET · PROTEIN ·
  LOGGED** register, a rust `t.RUST` flag line when a day is off-target (the text
  is the severity name), and per-meal dot-leader rows; queue rows read
  `{logged}/{planned} MEALS`. The workout body + both roles' live fetch are
  unchanged. Demo figures reconciled to sum from their meal rows.
- **CodeRabbit (authoritative gate) caught 3, all fixed before merge:** a
  **blocking honest-data** issue — `BSProClientMini` hardcoded "Week 6 of 12" for
  every *real* linked client (the plan's own sample code mandated it) → now shown
  only when the client record carries the week, else just the program name;
  demo-data internal consistency (day-2 kcal/protein didn't sum from its meals);
  and a raw `#c0533b` → the `t.RUST` token. Re-review returned **APPROVED**.
- Per commit: JSX parse-check · PowerShell `/m/` build exit 0 · full `npm test`
  (458) · LF. **Open follow-up (owner):** on-device pass across Black/Sage/Cream
  × both roles (tier-heat Adjust/Schedule, The Queue, nutrition detail) × reduced
  motion. *(This closes the coach Open Ledger redesign — every plate-era coach
  surface is now serialized.)*

### 2026-07-07 — Coach Plans "The Catalogue" both roles + exercise videos (#1577) · owner-tweaks batch (#1578 · #1579)
- **The plate-era coach Plans pages serialized into the Open Ledger language**
  (spec `docs/superpowers/specs/2026-07-07-coach-plans-actions-review-open-ledger.md`,
  plan `docs/superpowers/plans/2026-07-07-coach-plans-actions-review-ledger.md`,
  docs #1576; concept round → owner picked **Concept A**). Presentation-only —
  `ShapeCoachPlans`, `updateCoachPlan`, the assign/enroll flows, and every
  demo-vs-live gate carry over verbatim. Built subagent-driven, **all agents on
  Opus** per owner directive.
- **Trainer — "The Catalogue" (#1577, `66b12333` in-branch).** `BSTrainerPrograms`
  restyled to a zero-box typographic index: station eyebrows with rust
  (`#c0533b`) heat ticks, dot-leader `BSProCatRow` rows (index · name · meta ·
  price), text-action verbs (＋NEW / ASSIGN / SORT) replacing pill CTAs. Owner
  add: the Workouts demo now carries **classic day-type sessions** (Upper Body,
  Lower Body, Push Day, Pull Day) alongside the programs.
- **Nutritionist — "The Catalogue" (#1577, `5472a293`).** 1:1 **gold** (`bsProHeat`)
  mirror of the trainer page (`BSNutriPlans`), plus — per owner — the Diet tab now
  shows **two stations: DIETS and MEALS·SINGLE DISHES** (`singleMeals`: salmon
  dinner plate, high-protein breakfast bowl, chicken + rice lunch, recovery
  smoothie), so individual dinner meals show alongside full diet plans.
- **Exercise videos (#1577, `1a52dfdc`) — new capability.** Trainers can attach a
  clip to any exercise block: per-block **＋CLIP / ▶CLIP / ×** in `BSCoachDraftEditor`
  (stores `block.video` via `ShapeCoachPlans.update({id,detail})`,
  `ShapeCoachMedia.upload` → `{url,type,name}`, `window.open(…, 'noopener')`), and a
  real **WORKOUT VIDEOS** station that aggregates both `detail.media[type==='video']`
  and per-block clips into a browsable library.
- **Honesty pass (CodeRabbit, 2 rounds → `a1070a34` · `0415fe88`).** CodeRabbit
  caught what the per-task + whole-branch reviews missed: every fabricated-stat
  demo array (48-enrolled / 4.9★ social proof, hardcoded catalogue totals) now
  **gated to `!signedIn`** — signed-in coaches see `serverPlans`-only + `BSTRedact`
  empty-states, never invented numbers; a `buildType` leak on paid-plans closed;
  teal→role-heat on the note flash; clip-sheet Escape/close + `noopener` a11y.
  Four ledger helpers (`stationHead` / `monoTrail` / `featureLead` / `enrolledRow`)
  extracted to module-level `bsPro*`. Reaffirms CodeRabbit as the authoritative
  honesty gate. **Squash-merged `41db1ae9`.**
- **Owner-tweaks batch.** #1578 (`693fd250`): **Shape Radio bar moved to the top**
  of coach home, directly under the edition band (both roles); the dateline reads
  **"TRAINERS EDITION" / "NUTRI EDITION"** (was "COACHES EDITION" / "NUTRI"); the
  calendar serif page-titles removed on all three roles ("The schedule." / "The
  diary." / "Month's plan."). #1579 (`d00c4dad`): a **very small feed side-gap
  increase** (`BSActivityCard` content gutter 8→12px, full-bleed route strip
  matched) on the activity + both profile feeds. *(#1578's merge took only its
  first commit; the feed-gap change was re-landed on fresh main as #1579.)*
- Per PR: JSX parse-check · PowerShell `/m/` build exit 0 · full `npm test` (458)
  · LF. **Open follow-ups (owner):** on-device pass across Black/Sage/Cream ×
  both roles (trainer rust / nutritionist gold, signed-in redaction states, the
  video library, clip attach sheet); the deferred product question of whether
  nutritionist **meal blocks** should expose ＋CLIP (no nutri video library yet —
  default kept).

### 2026-07-07 — Goals "The Contract" + Live Session "The Meter" — Open Ledger redesign (#1573 · #1575)
- **The last two plate-era client surfaces serialized into the Open Ledger
  language** (spec `docs/superpowers/specs/2026-07-07-goals-workout-open-ledger-design.md`,
  plan `docs/superpowers/plans/2026-07-07-goals-workout-open-ledger.md`; owner-picked
  G1 + W2 from a concept round). Presentation-only — `client_weigh_ins`, the
  `ShapeSignals.goalProjection` ETA engine, `ShapeGoalAwards`, set logging, HR
  capture, `suggestNextLoad`, swap sheets, and every demo/live gate carry over
  verbatim. Two build PRs.
- **Goals — "The Contract" (#1573, `faf30181`).** The three tab-views die for one
  continuous ledger (`BSClientGoals`): a serif **verdict lead** from the ETA engine
  (new pure `mobile-app/src/services/goalContract.mjs` — `bsGoalVerdict`, 10 vectors)
  plus an eyebrow-above-figure **register row** (CURRENT · TO GO · PACE · ETA); an
  **anchor index** replacing the segmented tab rail (scrolls to each station, nothing
  hidden); **THE TERMS** milestones as dot-leaders (the next milestone's breathing
  dot = the page's one loop); **Training / Nutrition** stations with rust/gold
  press-credit plan rows + **revived per-goal add/edit** (`BSGoalEditSheet` had been
  unmounted/dead); **THIS WEEK** targets + **YOUR WHY**; the share-with-coaches toggle
  borderless. Heat = the member's tier (`bsMyTierColor`), line-only; four reusable OL
  primitives (`BSOLHead/Act/Row/Credit`). **Kills:** `BSGoalsOverall/Training/Nutrition`,
  the dead `BSGoalsTrend`/`bsGoalSeries`, the tab machinery.
- **Live session — "The Meter" (#1575).** `BSSession` page heat now **tracks live
  effort** — new pure `mobile-app/src/services/liveEffort.mjs` (`bsLiveEffort` → a
  5-zone read on the **same ramp Session Details replays with**: HR zone → last-set
  RPE → neutral teal), damped (5s re-eval, 1.2s transition; reduced-motion locks to
  the accent). A worn HR strap adds a **Z1→Z5 zone strip + needle**; the breathing
  LIVE dot is the page's one loop. Zero-box serialization throughout: underline set
  inputs, the suggested-load + plate-math cards → dot-leader lines, the pill progress
  bars → drawn heat rules, the rest instrument-plate → a register whose rule **drains**,
  the queue → a dot-leader index with a heat **NOW** spine, the gradient coach card →
  a **Wire press credit**. **Solid teal CTAs untouched**; the feel/effort review +
  share-to-community block stays a quiet form (two-tier rule). The **Train deck hero**
  and both **workout previews** (`BSWorkoutPreview`, `BSHomeWorkoutPreview`) follow the
  same grammar on the neutral accent (serif verdict heads, dot-leader move ledgers,
  rust press-credit coach notes, solid Begin CTAs kept).
- **Browser-verified** both surfaces on a preview build: the Goals page renders as
  one scroll with working anchors (THIS WEEK jumped 1544px→238px) + correct verdict
  copy/registers/milestones; the session heat **shifts teal↔ember** as synthetic
  `shape:hrm` events fire (Z4 165bpm → `#e8843c`, back to teal at Z1) with the zone
  strip appearing/clearing, and previews + deck read correctly — zero React errors.
- Per commit: JSX parse-check · PowerShell `/m/` build exit 0 · full `npm test`
  (458, two new files registered) · LF. **On-device pass recommended** (owner):
  Black/Sage/Cream papers × tier heats (sage/gold/teal/violet/rose) on Goals ×
  session with and without an HR strap × reduced motion. *(Mid-build the web
  container reset the tree to another session's branch; the session-meter branch +
  its B1 commit were recovered intact — no work lost.)*

### 2026-07-06 — Profile social handles: X + Substack + host-prefix normalization · bolder boost-sheet Profile button (#1565)
- **Two platforms added to the profile social-links picker on BOTH surfaces** — **X**
  (`x.com/`) and **Substack** (`substack.com/@`) join Instagram / TikTok / YouTube / Website
  in the mobile `BS_PROFILE_LINKS` (`iosAppBroadsheetClient.jsx`) and the website `DK_LINKS`
  (`livingDesktop.jsx`), so a member or coach can add either handle to their living profile.
- **Host-prefix normalization** (`bsLinkHref` / `dkLinkHref`): a value that already carries
  the platform host (e.g. a member pastes the placeholder form `x.com/alice`) is now used
  as-is instead of being doubled into `https://x.com/x.com/alice`; a bare handle still gets
  the full prefix, a leading `@` is stripped, and a full `http(s)://` URL passes through
  untouched. (Codex P2, fixed in-PR.)
- **Boldened the live-boost sheet "Profile →" button** (`BSLiveBoostSheet`): color INK50→INK,
  size 8.5→9.5 — it read too faint beside the sheet header.
- Presentation-only; no migration, no new route. `livingDesktop.jsx?v=20260706` bumped across
  the 7 consumer pages (ClientApp · ClientMe · MemberProfile · Trainer/Nutritionist App +
  Profile). Squash-merged (`1cb323fd`); CI green.

### 2026-07-06 — The Record chart fixes: trend gap · wrapping history filters · demo spans months (#1563)
- Three owner-reported fixes on **The Record** (Shape Score → points ledger → detailed view):
  - **Trend "gap" fixed.** The "Score over time" line rendered a blank break. Root cause
    (reproduced in a real browser): the self-draw `strokeDasharray="1 1"` + `pathLength` under
    `vector-effect="non-scaling-stroke"` renders the line with a gap **even in its resting
    state** — never fully drawn. `BSRecordTrace` is now a plain continuous stroke. Data was
    never missing; it was a rendering bug.
  - **History filter chips no longer clip.** `ALL / WORKOUTS / HABITS / NUTRITION / CHECK-INS /
    PRS / PENALTIES` were on a horizontal scroll strip → `PRS`/`PENALTIES` cut off at the edge.
    They now **wrap** (no horizontal scroll), with slightly more compact chips.
  - **Range toggle visibly changes the numbers.** The by-source/register/trend wiring was
    always per-range (`win = ranges[selected]`), but the signed-out demo ledger all sat within
    30 days, so 1M/3M/All were identical and it *looked* static. `BS_RECORD_DEMO_ROWS` now spans
    ~5 months via **relative `daysAgo()`** dates (self-correcting — the mobile demo recomputes
    against the real current date, so hardcoded dates would age out of the shorter windows).
    Website `RECORD_DEMO` regenerated (`score.jsx?v=21`) — stays baked/frozen (the browser can't
    import the ESM aggregator; it never recomputes so its windows can't go empty).
- Verified: mobile + website JSX parse · `VITE_BASE=/m/ npm run build` · `npm test` 419/419 ·
  in-browser repro of the gap + the plain-line fix. CI green; merged on green.

### 2026-07-06 — Home slate boxes: uniform 24px + tighter rows (#1562)
- Home **TODAY'S SLATE** polish from owner screenshots (`BSSlateRow` + the meal/habit controls):
  the meal ghost-tick (was **36px**) and habit checkbox (was **26px**) unify to one **24px** box
  so every row's right-edge control matches; the time column (50→44px, font 9.5→8.5) + tag column
  (58→50px, font 8→7.5) + grid gap (8→7) tighten so the kcal/duration meta stops clipping at the
  phone's right edge. Behavior/handlers unchanged — pure layout/size. JSX parse · mobile build exit 0.

### 2026-07-06 — Shape Score awards locked to the member's own calendar day (timezone-correct, anti-farm)
- **Closed the day-backfill farm on the two day-based awards.** `award_workout_session`
  and `award_meal_log` take a caller-supplied `p_day`, and `daily_health_snapshot` is
  owner-writable — so a caller could write a snapshot for any past/future date and call
  the RPC once per date to mint **+10 each** (the per-day dedup only caps ONE +10 *per*
  day, not *which* days). Codex flagged the meal twin as **P1**; the workout award shared
  the identical vector and was unclamped (its meal sibling had only a blunt UTC ±1 clamp).
- **Migration `2026-07-06-award-day-timezone-clamp.sql`** (**owner runs it**; idempotent):
  new `shape_user_tz(uid)` helper (joins `pg_timezone_names` so it can only ever return a
  name Postgres accepts → `now() at time zone …` can't raise on a bad stored value), and
  both awards now require `p_day` to be **TODAY in the member's own IANA timezone**
  (`client_profiles.timezone`, captured on app open) — no future, no history, no cross-tz
  slack. Until a member's zone is captured, a tz-agnostic **±1 UTC** window is the fallback
  (still un-farmable: the dedup + the real-workout/real-macro gate cap it to a single +10
  for a genuinely recent day). Fails **closed** (a wrong-day call earns nothing).
- **No client change** — the app already sends the device `_localDate()` and captures the
  device tz on open; the awards just validate against it now. Validated read-only against
  prod (every column + the `now() at time zone` math + both award signatures resolve; the
  `create or replace` matches the existing `(p_day date)` signature). Standalone PR.

### 2026-07-06 — "The Record": detailed Shape Score history + report (mobile + website)
- **A dedicated full-screen "Record" page** off the LEDGER tab (was capped at ~12
  recent rows): a header register (lifetime total · THIS WEEK / THIS MONTH / EARNED /
  LOST for the visible range), a **cumulative score-over-time line** with a
  **1W (default) / 1M / 3M / All** range toggle, a **by-source** breakdown (points per
  category as bars + a rust `− penalties` line with the top reasons), and the **full
  day-grouped, filterable history** (every ledger entry, per-day subtotals, newest
  first; All / Workouts / Habits / Nutrition / Check-ins / PRs / Penalties chips).
  Spec `docs/superpowers/specs/2026-07-06-score-record-history-report-design.md`,
  plan `docs/superpowers/plans/2026-07-06-score-record-the-record.md`.
- **One algorithm, two twins** (the `weekendSplit` pattern): pure
  `mobile-app/src/services/scoreHistory.mjs` (`bsScoreRecord(rows,{now})` →
  `{ ranges, history, lifetime }`, unit-tested in `tests/score-record.test.mjs`, 8
  vectors) + `src/lib/scoreHistory.ts` (the server twin). **Rank basis:** store
  redemptions are excluded everywhere (mirrors `deriveScore`), so the Record totals
  reconcile with the Standing; penalties = negative non-redeem deltas. Windows are UTC
  (1w/1m by day, 3m/all by ISO-week buckets).
- **New route `GET /api/client/score-record`** (membership-gated `/api/client` prefix;
  reads the caller's `score_ledger` newest-first, capped 1000, runs the TS twin). **No
  migration.** Registered in the War Room.
- **Mobile** (`iosAppBroadsheetClient.jsx`): `BSScoreRecordPage` (`BSPage` +
  `BSDetailHeader`, self-drawing `BSRecordTrace` line with `preserveAspectRatio="none"`
  plus a %-positioned end dot per the ladder-chart lesson), reached from a **SEE THE FULL
  RECORD →** leader at the end of the LEDGER tab. Live members fetch the endpoint;
  signed-out computes a labelled demo from `BS_RECORD_DEMO_ROWS` via the same module.
- **Website** (`public/newdesign/score.jsx`, `Score.html ?v=20`): a `ScoreRecordView`
  reached from the Ledger's SEE-THE-FULL-RECORD leader (swaps in over the page), same
  four blocks off the endpoint; signed-out reads a **baked `RECORD_DEMO`** fixture
  (generated from the same demo rows the mobile Record computes, so the two match —
  the browser can't run the ESM aggregation).
- Verified: `tests/score-record.test.mjs` (419/419 total) · `tsc --noEmit` clean ·
  mobile + website JSX parse-checks · `VITE_BASE=/m/ npm run build` exit 0 · LF.
  **On-device pass recommended** (Black/Sage/Cream papers × client tiers/at-risk × the
  four range windows × the history filters × reduced-motion) before the on-device sign-off.

### 2026-07-06 — Meal logging earns +10/day (real award) + habit points reconciled to +3 (#1558)
- **Logging a meal now grants a real +10 Shape Score.** New `award_meal_log(p_day)` SECURITY
  DEFINER RPC (+10 once/day, gated on a real `daily_health_snapshot` food-macros row — hydration
  alone doesn't count, dedup on `md5('meal_log:uid:day')`, category `nutrition` added to the
  `score_ledger` CHECK); the meal-log POST fires `supabase.rpc('award_meal_log')` fire-and-forget.
  `nutrition: 'Meals logged'` added to `CATEGORY_LABELS` (`/api/client/score`) so the breakdown
  reconciles. Migration `2026-07-06-meal-log-points.sql`.
- **Habit points reconciled to a real flat +3** (was a fabricated 4–8 in `_bsHabitPts`) across
  mobile (Home slate, Habits demo rows, score profiles) + website `score.jsx`/`Score.html` (`?v=19`);
  earn lists advertise "Log a meal +10" / "Complete a habit +3".
- **Codex P1 (backfill farm)** caught in-PR: `p_day` was caller-supplied + `daily_health_snapshot`
  is owner-writable → clamped to `current_date ± 1` (later superseded by the tz clamp, #1561).
  Codex P2: nutrition missing from the breakdown map (fixed). CodeRabbit APPROVED. Owner ran the migration.

### 2026-07-06 — Session-details pace bars · "The Splits" page · split zones · Score THIS-TIER zoomed ladder (#1556 spec · #1557 build `a7a04e8e`)
- **Session details**: per-split **zone-colored pace bar chart** (`BSSdPaceBars`, taller = faster)
  + a max-depth **"The Splits"** page (`BSSplitsPage` — raw uncapped provider splits + trace
  fallback, honest columns). **Score THIS TIER** redrawn as a **zoomed ladder** with a segmented
  **LADDER / THIS TIER** toggle. Session-relative pace zones in pure
  `mobile-app/src/services/paceSplits.mjs` (`bsPaceSplits`, format detected from the STRING not
  the sport; `cmp` = universal comparable, lower = faster) + `tests/pace-splits.test.mjs`. Strava
  sync `fetchActivitySplits` → `rawMetrics.splits`. Spec
  `docs/superpowers/specs/2026-07-06-pace-splits-tier-chart-design.md` +
  `docs/superpowers/plans/2026-07-06-pace-splits-tier-chart.md`.
- CodeRabbit/Codex fixes: ride mph parser (splits were dropped for rides), no fabricated-mile
  default, bucket cap. Also #1555 (profile stat line) merged in the same wave.

### 2026-07-05 — Shape Score "The Standing" + Shape Store "The Shop/Drop" — Open Ledger redesign (#1552)
- **The last two June-era client surfaces serialized into the Open Ledger
  language** (`BSShapeScorePage` + `BSShapeStorePage`, `iosAppBroadsheetClient.jsx`).
  Presentation-only rebuild — catalogue, RPCs, cart/checkout/shipping/confirm
  flows, membership gates, and coach-role variants are all invariant. Spec
  `docs/superpowers/specs/2026-07-05-store-score-ledger-design.md`, plan
  `docs/superpowers/plans/2026-07-05-store-score-ledger-redesign.md`. Direction
  owner-picked from a concept-board round (Score = "The Standing + the standing
  chart"; Store = S8, "a legit e-commerce / Nike-style page incl. Shape discounts
  on coaches + memberships").
- **Score — "The Standing."** The composite plate hero (ring + climb SVG + stats
  grid) dies for a serif **verdict lead** + honest sub-line (at-risk swaps to a
  rust line, top tier degrades), an eyebrow-above-figure **register row** (SCORE ·
  THIS WK heat · STREAK, count-up), and the owner's **THE STANDING chart** — a
  tappable **THE LADDER / THIS TIER** scale toggle. LADDER = the whole hierarchy
  as an equal-lane rising line (tier-colored threshold nodes, a self-drawing heat
  progress path, an **HTML breathing you-dot** = the page's ONE loop); TIER = the
  current lane zoomed (heat fill to `frac`). New pure
  `mobile-app/src/services/scoreStanding.mjs` (`bsScoreStanding` → placement
  facts, 8 vectors incl. the top-tier-below-floor clamp) registered in `npm test`.
  Momentum plate → a zero-box station (heat fill, 80 tick, same copy/gates, teal
  kept only on the signed-out sign-in line); `BSCommitmentCard` card → a station
  (heat-underlined actions, its sheet stays a quiet form but the steppers come up
  to 44px — closes the coach-wave note); the 4 solid-fill tabs → a typographic
  index (active = ink + heat underline), the `maxHeight:320` scroll box dies, all
  four bodies re-set as dot-leader rows (penalties named + waivable in rust).
- **Store — "The Shop, opened by The Drop" (S8).** Title "Gear & perks."; the dark
  plate hero → a **balance register chip** (count-up + teal ≈$); the boxed pill
  grid → a **typographic category index** (+ LOCKER + a Within-balance toggle);
  **THE DROP hero** (a full-bleed framed featured product, teal ADD, picked from
  the affordability-filtered set); a **2-col product grid** over `gridMerch` (hero
  excluded, no dupes); a **SHAPE DISCOUNTS / COACH TOOLS** big-dollar department
  (non-merch → the existing confirm-redeem flow); an **ON DEPOSIT** wallet line;
  a **LOCKER** view (lifetime/redeemed registers + code rows / redaction); an
  amber-spined notice; and a squared teal cart bar. New `BSStoreGlyph` (line-art
  product stand-ins) + `BSStoreImg` (loads `/m/store/<id>.png` with an `onError`
  glyph fallback — **real product photos drop in with zero code change**, tracked
  as an owner follow-up). **Teal = commerce action only; heat = viewer tier,
  line-only.**
- **Review stack:** the plan PR drew a CodeRabbit Major (top-tier standing clamp —
  a real `scoreStanding.mjs` bug: a below-floor last-rung member rendered full
  instead of empty; fixed + tested) + 2 Codex P2s (drop hero must honor
  Within-balance; product images must be reachable via a deterministic path — both
  built in). Per commit: JSX parse · PowerShell mobile build exit 0 · full
  `npm test` (400) · LF. **On-device pass recommended** (Black/Sage/Cream ×
  client Raw/Tempo/Legend+at-risk + coach ladder/Coach Tools · both chart views +
  toggle · signed-out demo/preview · non-member CTAs · reduced motion).

### 2026-07-05 — Search page: hide results scrollbar · remove the Recipes tab (#1550)

- **Hid the visible scrollbar on the universal-search results list**
  (`BSUniversalSearch`) — added the existing `.bs-hide-scroll` utility to the
  `overflowY:auto` results container, matching the scrollbar-free filter row
  right above it.
- **Removed the dedicated RECIPES filter chip.** Recipes stay searchable — they
  still surface as a "Recipes · Shape Kitchen" section under the **All** filter
  (recipe detail via `viewRecipe` unchanged); the now-unreachable
  `filter === 'recipes'` render branch was removed so no dead code is left.
- Verified: JSX parse · PowerShell mobile build exit 0 · `npm test` (392/392) · LF.

### 2026-07-05 — Text size → its own Settings section + text-scale formatting review (#1548)

- **Made the app-wide "Text size" control its own Settings section** (shared
  `BSSettings`, so client + coach). It was buried at the bottom of the
  collapsed-by-default "Appearance" block; now it's an always-visible section
  (`Accessibility` eyebrow · **Text size** · "Scales the whole app · {current}"
  + the Small/Medium/Large pills) between Appearance and Shape Radio. Display
  weight stays in Appearance.
- **Reviewed formatting at Small/Medium/Large across pages.** The scale is a
  single CSS `zoom` on the shared `#bs-phone-surface` (0.9 / 1.0 / 1.12), so the
  WHOLE UI scales proportionally — there is no per-page scaling logic that could
  let one page break. Verified live (Home, Eat, the Radio prompt) at all three
  sizes: proportional scaling, content fills the frame width exactly, no
  horizontal clipping; small fits more, large fits less (expected). Minor,
  non-breaking notes (left as-is): two hero numbers use `min(…px, Nvw)` so they
  don't track the zoom; sheet `maxHeight:Nvh` caps are viewport-relative (they
  just scroll a touch sooner at large).
- Verified: JSX parse · PowerShell mobile build exit 0 · `npm test` (392/392) · LF.

### 2026-07-05 — Client broadsheet polish: trend tabs wrap · profile Follow/Message below counts (#1547)

- Two owner-screenshot layout fixes in `iosAppBroadsheetClient.jsx` (no data/
  handlers touched):
  - **Progress → Overall "trend" strip no longer scrolls sideways.** The 9
    metric tabs (Weight · Body fat · Strength · Resting HR · Sleep · HRV ·
    Volume · Protein · Hydration) sat on a horizontal `overflowX:auto` strip, so
    everything past HRV scrolled off the right edge. Now the strip **wraps**
    (`flexWrap`, no horizontal scroll) so every metric is on one screen — no tab
    dropped. Each tab keeps the 44pt tap-target height (per this file's
    convention, per CodeRabbit); the wrap is the whole fix.
  - **Terrain profile identity head: Follow/Message moved below the counts.**
    `BSProfileIdentityHead` was passing a hidden dummy `title` into
    `BSFollowBlock`, which forced the "actions pinned right of the (empty) name
    row" layout — the buttons floated in the gap above the followers/following/
    posts counts. Dropped the dummy title and reordered `BSFollowBlock`'s
    `ledger` variant so Follow/Message render **below** the counts, as a footer
    of the block. The `chips` variant (coach Signal profile) + the follow-list
    sheets are unchanged.
- Verified: JSX parse · PowerShell mobile build exit 0 · full `npm test`
  (392/392) · LF normalized.

### 2026-07-05 — Coach Ledger wave: Today "Assignment Rail" · roster "Client Index" · Case File (#1544 · #1545 · #1546)

- **The coach surfaces — the app's last pre-redesign pages — serialized into the
  Open Ledger / Wire Dispatch language**, closing out the July redesign (after
  Session Details #1523, Home #1527, Feed #1528, Terrain #1532, Progress #1535,
  Marketplace #1536, website profiles #1537). Spec
  `docs/superpowers/specs/2026-07-04-coach-ledger-redesign-design.md`; three PRs,
  each behind its own gate run + CodeRabbit pass.
- **PR A #1544 — the proLedger module + the Open Ledger kit on `window`; Coach
  Today → "Assignment Rail."** The trainer/nutritionist Today pages consolidate
  into one engine-led `BSProToday` (role config, both editions): a dateline
  replaces the "Coaches Edition" band, a serif THE LEAD verdict + register row
  (SESSIONS/CONSULTS · NEED YOU · OPEN HRS) sits above a typographic week strip
  and THE RAIL — the day's bookings threaded on a 2px heat rail with hour marks,
  a NOW tick, open-gap rows, and inline flagged-client wires under the anchor
  rule. THE WIRE below carries only the unbooked flag remainder, always closing
  with a "SEE THE FULL ROSTER" leader. INSIDE. replaces the old widget grid with
  a dot-leader door index. New pure `mobile-app/src/services/proLedger.mjs`
  (`bsProAttentionBudget`, `bsProDayShape`, `bsProLeadVerdict`, time/label
  helpers) implements the wave's **three owner-ratified rules**: **one loop**
  (the LIVE bulletin dot else the NOW tick — nothing else breathes), **anchor**
  (a flagged client with a session today threads inline; unbooked flags land in
  THE WIRE; nobody is ever listed twice), and **attention budget** (one lead +
  at most three wires total, with the true flagged count always shown on the
  roster leader even when the page demotes the rest). Kills: both PAPER2 edition
  bands, `BSProScheduleRows`, `BSProTriageFeed`, the demo Queue sections, the
  LIVE `BSPlate` banner, the booking tag-color maps, and the already-dead
  `BSReviewQueueCard`/`BSProHabits`.
- **PR B #1545 — Clients roster → "The Client Index."** `BSProRosterView`
  (shared trainer/nutritionist) turns the Classifieds grammar inward: a mast +
  serif "Your clients." + `{N} ACTIVE` meta, an underline search, a typographic
  filter index (phases + a rust `⚑ NEEDS YOU` item replacing the toggle), an
  engine verdict line, a NEEDS YOU station (severity-spined rows, one-line
  directives, severity always NAMED in mono meta) over a quiet ON TRACK list
  (dot-leader "N more" expander), and a redaction-style PAST toggle. Kills: the
  rounded client cards, `BSProStatusPill`, the filter pills, the boxed search
  field, and the Active/Past button pair.
- **This PR — the client Case File, engine-led throughout.** Header: mast +
  `← BACK`, a phase/week-or-kcal eyebrow, status as mono text + a heat tick, the
  4-cell **MESSAGE · ADJUST · SCHEDULE · ✦ DRAFT** action line (heat
  underlines, kills the pill row), and a typographic **PROFILE / MANAGE** index
  with a drawn heat underline — **heat = the client's member tier**
  (`bsTierForPoints` → `bsTierColor`, role-heat fallback for demo/unresolved
  rows), so every Case File reads as *that member's* ledger. **PROFILE**: a
  **YOUR MOVE · FROM THE ENGINE** station leads — the page's existing
  directive-lead computation (verbatim, no new intelligence) rendered as a
  serif verdict + one underlined action + ≤3 dot-leader evidence lines, closing
  honestly with "EVERYTHING ELSE HOLDING ✓" when nothing else is flagged; the
  flagged dimension (e.g. a fired weekend split) floats to slot #2; then the
  standing stations — ATTENDANCE/ADHERENCE (register pair + `BSSdBars still`
  week bars), KEY LIFTS/MACROS, BODY (a self-drawing line-only weight trace),
  CHECK-IN, SLEEP · RECOVERY, ACTIVITY, and a private COACH NOTE — each one
  station-head + one register/visual, each with an honest `BSTRedact`
  redaction when its source is absent. **MANAGE** (this task): BLOCK & PHASE
  is now a typographic index (mono 9/800, active = ink + 2px heat underline,
  same `ShapeProgramApi`-backed `setPhaseKey` handler); **ASSIGN** is an
  amber-spined notice row (`ASSIGN FROM YOUR CATALOGUE… ›`) opening
  `BSProAssignPage` unchanged; **shared goals** render as dot-leader rows (a
  heat progress leader for the Overall body-comp goal, plain leaders for
  Training/Nutrition headline goals) with `BSTRedact` for private/loading/none;
  **DATA QUALITY** (reconcile sources) and **ACCOUNTABILITY** — recent penalty
  rows (mono description · rust `−{n}` · dotted leader · a heat-underlined
  `WAIVE` on the existing RPC) plus the weekly-commitment proposer — keep every
  handler; **CARE TEAM** renders as Wire-Dispatch press-credit rows (the
  counterpart's ROLE-colored spine, name, `CO-MANAGING`, a heat-underlined
  `MESSAGE` on the existing `shape:proMessageCoach` payload); SCREENING/health
  profile and BODY/measurements keep their data + gating, restyled to spine
  blocks and dot-leaders; the private coach-notes block stays the quiet form
  it always was (two-tier rule — forms don't go zero-box). Dead
  `Section`/`lineChart` helpers (fully unreferenced after the rewrite) removed.
- **Wave-wide**: teal reserved for live/action only (bulletins, radio, page
  chrome); severity stays semantic (rust FLAG · amber WATCH · green NEW),
  always named in mono text, never color-only; zero new infinite-loop
  animations anywhere in the wave — Today's bulletin dot / NOW tick are the
  only two loops across all three surfaces, and Roster + Case File carry none.
  Motion is one-shot `useBSSdInView` + per-station seen state throughout, no
  new keyframes (the shipped `bsInjectSessionDetailCss` set covers it all).
- Shipped as #1544 (Today) · #1545 (roster) · #1546 (Case File). Verified per
  task: JSX parse · PowerShell mobile build exit 0 · full
  `npm test` (392/392) · LF normalized. **On-device pass recommended** (owner) —
  Black/Sage/Cream papers: rust + gold rails and the gold light-paper variant,
  the NOW/live loop rule, inline-wire density on a busy demo day, Case File tier
  heat across sage/gold/teal/violet/rose-tier clients (+ the role-heat fallback
  on a demo row), reduced-motion renders every surface finished.

### 2026-07-04 — Website living profiles → Open Ledger language (#1537, web↔app parity)
- **The DESKTOP member (Terrain) + coach (Signal) profiles brought to the same
  zero-box ledger language as the mobile app** — the website was still on the
  pre-redesign boxed-card "living identity" design while the app shipped the Route
  Card / Field Ledger waves. Owner-approved from a desktop preview; **both**
  directions ledgered (the website coach leads the currently-unchanged mobile
  coach — the owner's call). Dashboard surfaces (Home/Progress/Marketplace/Feed) are
  a different grid paradigm and OUT of scope. Spec
  `docs/superpowers/specs/2026-07-04-website-profile-ledger-design.md`.
- **Heat = the profile's tier** (`tierOf(d).color` — member ladder / coach ladder),
  **line-only**: the content **rail**, station-head ticks + ink→heat rules, tab
  underline, ridge/sigil strokes (kept), bar fills, the identity tier chip. Tinted
  card fills + decorative teal removed; **teal reserved for live/action** (Message,
  "In training", Verified, follow-active).
- **New desktop ledger primitives** (`livingDesktop.jsx`): `dStation` ·
  `DStationHead` (heat tick + eyebrow + ink→heat rule) · `DLedgerStat`
  (eyebrow-above-figure register) · `DRedact` (honest-absent) · `DLeader` (dotted
  leader) · `DRail` (the 2px tier rail threading the tab content in the centered
  column, `padTop`/`padBottom`).
- **Blocks**: hero goal→zero-box heat-spine, score strip→3 ledger registers;
  SignalsBand→registers; Disciplines→heat bars / ledger rows; Records→dot-leader
  rows; Relation→zero-box; Climb→zero-box + a mono aspect index (the `TerrainRidge`
  kept); Feed→zero-box entries on the dashed trail + redaction for hidden/empty;
  Tabs→typographic index w/ a drawn heat underline; ProfileExtras→registers +
  heat-spine + zero-box prompts. **Coach** (`livingShared.jsx` `LvCoachBlocks` +
  `LvServices`): station heads, zero-box cert/review rows (press clippings), the
  storefront becomes a dot-leader **RATE CARD** (name · leader · price), filing-tabs
  → a mono index. **Kept**: the ascent ridge + heptagon sigil, the split hero
  (desktop uses its width), MusicBlock playlist tiles + the availability widget.
- **No data/behavior change** — every RPC (`get_public_profile`, `get_coach_certs`,
  `get_follow_stats`, `get_member_playlists`, the own-profile `/api/client/*`
  enrichment), the Subscribe/Book/Buy Stripe handlers, media, and the XSS-safe
  `safeMusicUrl` are verbatim; empty cases → redaction lines.
- **Render-verified on a local static server** (not just parse-check — these
  browser-babel files are NOT compiled by CI's tsc/next build): the member profile
  (Activity + Signals tabs) and the coach profile (Coaching rate card + certs) both
  rendered clean in the ledger language with zero babel/React errors (only expected
  backend 404s). **CodeRabbit** caught + I fixed: a rate-card rating that could drift
  from the live Reviews tab (now passes the live avg/count — honest data), a buyable
  service row that blocked keyboard/SR checkout (role=button + Enter/Space), the
  reviews-jump mouse-only span (→ real button), `DRail` shorthand-string fragility
  (→ numeric props), button `type`, and an index key.
- Cache-bust: `livingDesktop.jsx?v=20260704a`, `livingShared.jsx?v=15` across all
  **7 consumer pages** (3 profile pages + the 4 dashboard SPAs that embed the living
  profile). Squash-merged (#1537), CI green; branch kept.

### 2026-07-04 — Progress "Field Ledger" (#1535) · Marketplace "Classifieds" (#1536) · profile/boost polish (#1534)
- **Waves 6 + 7 of the July redesign** — owner-picked from animated concept boards
  (P1 "The Ledger" body + P2 "Field Report" verdict lead for Progress; M1
  "Classifieds" structure + M2 "Masthead" portraits for the Marketplace); one spec
  covers both: `docs/superpowers/specs/2026-07-04-progress-marketplace-ledger-design.md`.
- **Progress hub "Field Ledger" (#1535).** `BSClientProgress` serialized zero-box;
  **heat = the member's tier, line-only**. THE VERDICT — the old `BSClientNextPlate`
  plate becomes a serif verdict lead (engine data + honest gating verbatim); KPI
  grids → **eyebrow-above-figure ledger registers** (`BSTLedgerStat` count-ups;
  composites like `6/7` stay static — never fabricated mid-count values); the trend
  card → mono series toggles + a line-only **self-drawing** `BSProgChart` (the
  9-color series palette, macro colors, muscle palette, area gradient, and delta
  chips all died); PRs/measurements/foods → dot-leader rows (PR rows gain keyboard
  activation); weekly-focus + `BSWeekendsCard` → zero-box stations (the flagged
  weekend gap keeps semantic rust); volume/calorie/hydration bars → heat fills with
  one-shot grow entrances; `BSStrengthCard` chrome → a ledger station row (single
  consumer verified; data/hook verbatim); tabs → a typographic index (deliberately
  NOT sticky — `BSDetailHeader` owns the sticky top). Every empty case renders a
  `BSTRedact` redaction line; `BSPROG_EMPTY` signed-in zeroing unchanged; zero
  infinite loops; keyframes injected via `useInsertionEffect`. **Dead code:** the
  `embedded` (Me→Stats) mode removed — both remaining consumers are full-page.
- **Marketplace "Classifieds" (#1536).** `BSMarketplaceScreen` — **heat = each
  coach's ROLE** (trainer rust / nutritionist gold, the feed's declaration),
  line-only; page chrome keeps the teal brand accent. THE CLASSIFIEDS eyebrow +
  an **underline search** + a typographic role index (pill chrome died, incl. the
  `MktPill` component); **Coach of the Week → a role-spined FEATURE** with a
  duotone-framed portrait (M2 graft), serif byline + role-heat period, inline
  ledger stats, the tracklist, an underlined action; the featured 2-up gradient
  cards → **portrait cells** (framed photo w/ role spine + initials fallback);
  results → dense **classifieds rows** (role spine · mono index · serif name ·
  dot leader → rate; role always NAMED in the meta, never color-only; ≥44px rows);
  What's-hot pills → mono underline toggles; the apply CTAs → amber-spined
  notices (semantic recruiting accent, text demoted to ink). All commerce/search/
  filter/tap-through handlers verbatim — the Signal profile it opens is unchanged.
- **Owner calls this session:** the coach **Signal profile KEEPS its sigil design**
  — the Route Card parity ("Rate Card") concept is shelved with its preview parked;
  instead the follow row moved under the name block, the Terrain ridge avatar grew
  46→60px, and the live-boost sheet gained more workout quick-hits + cooking
  conversation starters (**#1534**).
- Verified per PR: JSX parse · PowerShell mobile build exit 0 · 382/382 tests · LF.
  War Room: waves 6-7 registered done; the wave 6-7 **on-device pass** (Black/Sage/
  Cream — tier-heat trace legibility, role spines, portrait frames, 320px listing
  density, reduced motion) registered as the standing manual item.

### 2026-07-04 — Terrain profile "Route Card" redesign (#1531 spec · #1532 build)
- **The mobile member profile (`BSTerrainProfile`) serialized into the Open Ledger /
  Wire Dispatch language** — wave 4 of the July redesign (after Session Details #1523,
  Home #1527, Feed #1528). Owner brief: "less static, more alive, less analog, more
  modern · not basic · unique but simple." Direction picked from a 2-concept adversarial
  round + an animated preview; spec `docs/superpowers/specs/2026-07-04-terrain-profile-route-card-design.md`.
- **Every box dies.** The page threads on a **2px tier-color rail** — tier is THIS
  surface's heat (declared per-surface like Session Details' intensity + the feed's
  author-role), **line-only on a closed placement list**; all tier-colored TEXT demotes
  to ink-alphas, and the constant-teal accent + rust `#e0644b`/`#c0533b` literals are
  deleted. Identity / coach / score / signals / lifts become **ledger typography**:
  - **Hero**: the instrument-plate + coached-by/score `BSPlate`s are gone → a railed zone
    with a **self-drawing ascent ridge** (heat stroke drawing start→heroPct via a
    dashoffset transition; the 64px facet avatar rides the you-are-here point and carries
    the page's **one** breathing loop — `bsSdPrBreath`), an ink-alpha tier eyebrow, a
    **Wire-Dispatch press-credit** coach line (3px ROLE-colored spine, heat ✓/›), and an
    eyebrow-above-figure **Shape Score** register (`BSSdCountUp` + horizontal `BSSdBars`,
    new `still` prop suppresses the best-row breath so there's no second loop).
  - **Tabs** → a typographic index with a drawn active underline (new `BSTerrainTabs`).
  - **SIGNALS / CLIMB / MUSIC / ACTIVITY** → zero-box registers: two-column living signals
    with staggered micro-bars, a self-drawing trajectory spark + climb route (new
    `bsSdDrawLine` keyframe), disciplines via `BSSdBars`, **dot-leader** key lifts, and
    honest **redaction lines** for every absent case (no lifts / no weigh-ins / empty week
    / no playlists / no activity). A per-tab `seen` map (marked on tab LEAVE) plays each
    station's entrance once — a revisit renders the finished state.
- **Shared components prop-gated so the coach Signal profile is byte-identical**:
  `BSFollowBlock variant='ledger'`, `BSProfileExtras`/`BSProfilePlaylists`/`BSActivityLogCta`
  `ledger`, `BSSdBars` `still`. `BSProfileIdentityHead` is Terrain-only (rewritten). Deleted
  the retired `climbBg` wash + its dead customizer picker (+ `BS_CLIMB_BGS`) and the dead
  `Kick`/`card`/`seed`/`TEAL`/`startLabel` locals.
- **Review gauntlet**: a whole-branch adversarial review before the PR (1 Major + 3 Minor,
  all fixed — dead customizer control, honest-zero week rendering floor ticks, entrance-replay
  seen-map, activity count-up) → CodeRabbit on the PR caught a **Critical** the branch review
  missed: `fs` (follow state) was read in the new ledger branch but declared as a `const`
  below it, so a VISITOR opening another member's profile hit a temporal-dead-zone
  ReferenceError (self/meMode short-circuited past it, so build + tests were green) — moved
  `fs` above the branch; also restored ≥44px hit targets on every zero-box ledger control.
  Both CodeRabbit threads auto-resolved + the Codex duplicate resolved.
- Squash-merged `3e625a1d` (#1532), CI green (Web · Mobile · gitleaks); branch kept.
  Verified per commit: JSX parse · PowerShell mobile build · 382/382 tests · LF. **On-device
  pass recommended** (Black/Sage/Cream papers; self / visitor / private / signed-out demo;
  reduced motion = finished state) — the dashoffset ridge draw + tier-line legibility on
  tinted stock are device-only proofs. **Follow-up**: the coach **Signal** profile
  (`BSSignalCoachProfile`) is the ready-made next wave — same rail/stations/ledger/redaction
  grammar with the coach-ladder tier as heat; the shared components already carry the variants.

### 2026-07-04 — Session-details + Home polish batch (#1529)
- Four owner-screenshot fixes in one pass:
  - **Summary ledger columns line up** — units sit in a fixed-width mono column per
    register (`ch`-sized to the widest unit; bare figures reserve the same gutter), so
    every numeral in the Open Ledger summary shares one right edge.
  - **Mile Splits → horizontal ledger bars** (Strava-style rows): fixed label column ·
    bar drawing rightward (faster = longer, `bsSdDrawX` staggered) · figure on the
    right edge; the best row keeps the heat fill + burst + breathing halo; RPE
    mini-dials ride the figure cell. Applies to every breakdown (mile splits / ride
    intervals / working sets) — replaces the vertical landing columns.
  - **Cadence → the same horizontal bars** — per-mile averages bucketed from the
    distance-uniform trace (`Seg n` labels when distance is unknown or 15+ mi), spread
    on the min→max range so tightly-clustered spm still shows variation. Replaces the
    cadence area chart; the GRAPH-TYPE RULE entry below is superseded on this point.
  - **Home**: slate rows no longer clip their right edge (the 36px meal/habit ticks sat
    in a fixed 20px grid track — now `auto`); the demo Jordan/Maya coach-notes block is
    removed entirely (real coach notes only, even in signed-out preview).
- Verified: JSX parse · PowerShell mobile build exit 0 · 382/382 tests · LF normalized.
  Merged on CI green per the owner's call (CodeRabbit wait skipped for this batch only).

### 2026-07-03 — Feed activity cards: "Wire Dispatch" redesign (#1528)
- **`BSActivityCard` rebuilt from a dark bordered rounded-rect into a zero-box
  "dispatch" on a per-author heat rail** (spec
  `docs/superpowers/specs/2026-07-03-feed-wire-dispatch-design.md`), serializing
  the shipped Session Details "Open Ledger" language (#1523) at feed density:
  card chrome (fill/border/radius/clip/top strip) deleted entirely; boundaries
  now come only from the per-post heat rail, the ink→heat separator rule
  between posts, and whitespace. Six critic grafts are binding overrides
  (zero feed-card motion loops · co-sign as a press credit, not a filled pill ·
  links/type-tag as ink text + heat underline only · GPS routes full-bleed ·
  a comments eyebrow that IS the view-all · five flex `≥44px` action cells).
- **Hero ledger**: title + trailing heat period, an eyebrow-above-figure hero
  stat via the Open Ledger's own `bsSdSplitUnit` + `BSSdCountUp` (honest-absent
  when a post carries no hero stat — never a fabricated figure), a heat rule
  drawn under the figure on first view.
- **Co-sign → press credit**: the solid rust/gold pill is gone; a coach
  co-sign now reads as a 3px role-colored spine + a heat check glyph + the
  name and "co-signed · role" label both in ink-alphas (never role-colored
  running text) — reads heavier than a peer reaction with zero fill.
  Eligibility/gating (`iAmAuthorsCoach`, honest-null absent a real coach↔client
  link) unchanged.
- **Route posts full-bleed**: `BSActivityRoutePreview` (component itself NOT
  modified) now runs true edge-to-edge — a new `pagePad` prop (community feed
  passes `t.padX`; the already-full-bleed profile rows pass 0) lets the card
  cancel the page gutter on top of its own rail gutter, and a clip-wrapper +
  shim push the component's own marginTop + 1px INK border outside the clip
  so the wrapper's 1px ink-alpha hairlines top/bottom are the only visible
  rules; the routeless fallback collapses from an 80px halftone tile to the
  Open Ledger's own redaction line (a dashed rule flexing both sides of
  centered mono `GPS · Not recorded`) — same honest-data gate as before
  (renders nothing at all when the post carries no route signal).
- **Motion**: one `useBSSdInView` observer per card (not per field) drives the
  whole first-view sequence — rail grows → hero counts → hero/separator rules
  draw → co-sign stamps — every animated style gated on BOTH `bsSdReduced()`
  AND the card's one-shot seen flag (nothing animates at mount while
  offscreen); audited zero infinite-loop animations anywhere in the card
  (the old live-pulse breathing tick was a detail-page-only signature and
  never shipped on the feed card).
- **Cleanup**: removed the action-row's old circular-pill style helper and
  the routeless halftone-tile gradient literal, both now fully unreferenced;
  `hideAuthor` (profile-feed) variant keeps the identical rail/rule treatment
  with no author block, verified in both the community feed and both profile
  contexts.
  Verified: JSX parse · PowerShell mobile build (exit 0) · full `npm test`
  (382/382) · LF normalized. **On-device pass recommended** (Black/Sage/Cream
  papers) before merge — a co-signed PR post, a run WITH a GPS route, a
  routeless run, a photo post, and a plain note, each viewed in BOTH the
  community feed and a profile feed (`hideAuthor`), confirming the rail/rule
  rhythm between same-role posts, the invisible 44px action-strip targets,
  and that reduced-motion renders every card in its finished state with zero
  residual transform/opacity.

### 2026-07-03 — Client Home "Front Page" hybrid restructure (#1527)
- **`BSClientHome` restructured from ~11 uniform bordered plates into the
  Front-Page hierarchy** (spec `docs/superpowers/specs/2026-07-03-home-front-page-hybrid-design.md`,
  structure map `docs/superpowers/plans/2026-07-03-home-structure-map.md`): 0–2 slim **BULLETINS**
  above the lead (daily check-in due · weekly check-in due, each suppressed
  once the lead already targets that lever) → exactly **ONE** engine-owned
  **LEAD** `BSPlate` (`todayDirective`'s #1 action — the page's only CTA
  button) → **THE SLATE**, a time-ordered run-sheet of 48px rows (one per meal
  · the day's training row · up to 3 open habit checkboxes · coach-pushed
  items · bylined coach notes) → **INSIDE.**, a serif-headed index of 44px
  rows (SESSIONS/AVG KCAL, signed-out-only · CHECK-IN residue once logged) plus
  a compact horizontal door shelf (STEPS · GOAL · PROGRESS · SHOP LIST,
  ~112×64). All 11 pre-existing pieces stay reachable — nothing deleted, only
  demoted to a row or a door.
- **Workout/meal double-feature fixed**: the lead's subject never gets a
  second interactive surface — lead=workout shows `↑ LEAD` on the TRAINING
  slate row (no second action); lead=meal (`heroMealId`) shows `↑ LEAD` on
  that MEAL row instead of its log tick.
- **Demo-notes leak fixed**: the "This week's notes" Jordan/Maya fallback
  (previously shown to any account with zero coach banners, live or not) is
  now signed-out-preview only — a real signed-in client with no coach notes
  yet sees nothing fabricated.
- **One-plate rule enforced by a code comment** at the top of `BSClientHome`'s
  return: *"Do not add a plate. If it can't be a row, it lives on a tab and
  gets at most a row-door."*
- **Motion**: slate rows stagger 30ms apart (opacity + 4px rise, 180ms,
  `bsInjectBsHomeCss` following the #1518 injected-keyframes pattern); the
  INSIDE. index block (weekly-totals rows + the CHECK-IN residue row) fades in
  as one quiet unit (220ms); door slivers draw 0→pct (400ms, plain CSS `width`
  transition — no new keyframe needed); only due-ticks pulse (reuses
  `BSPlate`'s existing `bsPlatePulse`, confirmed still the live pulse source —
  no second pulse keyframe added). Rows are plain functions with stable
  per-item keys (carried verbatim from Task 4), so entrances never replay on
  check-off. Every animated style is reduced-motion-gated via `bsSdReduced()`.
- **Dead code removed**: the unreferenced `homeCardsCtx`/`homeCardOpeners`
  block (fed a card-stack component, `BSHomeCards`, that was never mounted
  from Home's render path); `BSTodayNudge`'s legacy no-`variant` plate branch
  (both call sites already passed an explicit `variant` — `variant` is now a
  required prop, no silent fallback); the orphaned **`BSStepsCard`** component
  definition (its only mount was removed in Task 5 and its data effect had
  already been extracted to `useBSStepsToday` in Task 2 — verified zero
  remaining references anywhere in the repo, including the pros/coach modules
  and window-global exports, before deleting).
- New primitives `BSSlateRow` · `BSIndexRow` · `BSHomeBulletin` · `BSShelfDoor`;
  extracted hooks `useBSCheckinLogged` (from `BSTodayNudge`'s manual-signal
  predicate, carried verbatim) · `useBSStepsToday` (from `BSStepsCard`); pure
  sorted-slate module `mobile-app/src/services/homeSlate.mjs` (+ tests).
- **Review stack**: BSSlateRow's click handler carries the post-review
  nested-interactive `closest()` guard unchanged (motion is additive only,
  never regresses it); BSIndexRow/BSShelfDoor aria-labels still include the
  visible figure; BSMeGoalCard's door status stays a derived value — none of
  these post-brief hardenings were touched by this task's diff.
  Verified: JSX parse · PowerShell mobile build (exit 0) · full `npm test`
  (382/382) · LF normalized. **On-device pass recommended** (Black/Sage/Cream)
  to confirm the slate stagger, INSIDE. fade, and door-sliver draw read right
  under real touch/scroll, and that reduced-motion renders the finished state
  with no residual transform/opacity.

### 2026-07-03 — Quick security pass (clean) · Score "Start" label takes tier color · calendar avatar shows the real self avatar
- **Read-only security pass over the delta since the 2026-06-30 audit (b8672856 → HEAD).**
  Three parallel scans (secrets · authz/RLS · input/deps), each P1/P2 candidate
  adversarially re-checked. **Result: 0 P1 / 0 P2 / 1 P3.** No report file written (the
  quick-pass contract only writes `docs/SECURITY-AUDIT-*` on a P1/P2).
  - **Secrets — none.** Only the by-design Supabase publishable key is client-exposed;
    the `-----BEGIN` hits are a docs placeholder + the Apple-Music PEM-marker *reconstruction*
    literal (no key material); every `*_KEY/*_SECRET` is an env-var name or `.env.example`
    placeholder. `.gitleaks.toml` allowlist is correctly scoped (publishable key · localStorage
    key names · `public/m` · `.map` · lockfiles · the two documented PEM files).
  - **Authz/RLS — clean; every prior-audit P1/P2 stays remediated.** The 7 post-audit
    migrations hold: store pricing server-authoritative (`store_catalogue`), console +
    program-assignment INSERTs gated by `is_discipline_coach_on_client()`, `get_email_for_username`
    service-role-only (username login via the rate-limited resolve route), coach-waitlist RPCs
    ownership-checked with a column-freeze trigger. Stripe webhook verifies its signature before
    any work; OAuth callback routes go through `safe-redirect` (no open redirect). **No NEW
    routes/RPCs introduced an auth gap.**
  - **Input/deps — clean.** No `dangerouslySetInnerHTML`; user URLs scheme-checked
    (`safeMusicUrl` http/https + host allowlist); the proxy size cap + `readJson` still cover the
    newer routes; `.rpc()` args parameterized. **`npm audit --omit=dev` = 0 vulnerabilities**
    (root + mobile-app). next 16.2.9 · react 19.2.7 · stripe 22.3 · @supabase current.
  - **P3 (OWNER/dashboard):** the `Secret scan (gitleaks)` CI job runs on every PR but is
    **advisory, not a required check** on `main` — add it under GitHub → Settings → Branches to
    make it a hard gate. (Long-standing known item; unchanged.)
- **Website Shape Score — the first-tier "Start" label now reflects the tier color.** On the
  marketing Score ladder (`public/newdesign/score.jsx`) the Raw node's `Start` sat in a faded
  neutral (`rgba(242,237,228,0.3)`); it's now a tinted chip in the tier color (`t.color` →
  **sage** for Raw) matching the `+bonus pts` chips on the higher tiers. `score.jsx?v=17` on
  `Score.html`. (The dashboard `clientScore.jsx` renders the ladder as a plain list with no
  "Start" node — nothing to change there.)
- **Month calendar masthead shows the real self avatar** (`iosAppBroadsheetCalendar.jsx`). The
  avatar corner was gated `signedIn ? bsMy*() : roleInit`, so in signed-out/preview it showed a
  stale hardcoded **"A"** with a fixed teal instead of the demo persona's photo/initials/tier.
  Now it calls `bsMyInitials()` / `bsMyTierColor()` / `bsMyPhoto()` / `bsAmLive()` directly like
  every other page header — the helpers already resolve real-account vs demo-persona internally,
  so signed-out shows Quinn Harper's headshot + tier and signed-in shows the real user. Verified:
  both files parse; 363/363 tests. *(Local mobile Vite build could not run this session — Windows
  Application Control blocked the reinstalled `@tailwindcss/oxide` native `.node` after a
  dependency reinstall; CI builds `/m/` on Linux, unaffected, as the gate.)*

### 2026-07-03 — Session Details "Open Ledger" (#1523): unboxed hero + heat rail · self-drawing route · two-register summary ledger + pace needle
- **The session page's top section loses every box** (owner-picked from a 3-concept
  adversarial design round; spec `docs/superpowers/specs/2026-07-03-session-details-open-ledger-design.md`,
  plan `docs/superpowers/plans/2026-07-03-session-details-open-ledger.md`). The hero
  plate, the 120px halftone GPS box, and the 8-tile summary grid are replaced by:
  an **unboxed 50px hero figure** (value/unit split, ink-text PR readout w/ heat ↑ +
  underline) threaded on a **2px heat rail** that grows in and spans hero→route→summary
  (breathing needle tick beside the figure); a **self-drawing route** inked straight on
  the paper (`BSSdRoute` — heat stroke, hollow start square, popping end dot, honest
  provider/privacy caption; no-GPS collapses to a one-line `GPS · NOT RECORDED`
  redaction rule); and a **two-register ledger** — pace/time/HR primaries as 30px
  baseline rows (**AVG PACE carries a needle-on-tick-scale band** showing the average
  between the session's slowest/fastest; HR keeps its ghost sparkline) over an ink→heat
  divider and dot-leader secondaries. Charts below Summary + the comments page's own
  sections untouched; `BSActivityRoutePreview` (feed cards) untouched.
- **Bleed fix at the root:** the hero heat-wash (`inset:'-18px -16px -14px'`) that
  painted over the author row is DELETED; an author-row hairline hard-separates the
  byline. Dead code swept with the tiles: `statTile`, `sumCols`, `outputStats` + the
  Output section, the `clip` helper, and the pre-existing dead `card`/`hrStats` locals.
- **New pure module `mobile-app/src/services/sessionLedger.mjs`** (+ 11 tests):
  `bsSdRankStats` (primary/secondary split, promoted primaries for strength sessions),
  `bsSdSplitUnit` (only short trailing unit tokens split — times/composites stay whole),
  `bsSdNeedle` (honest null on short/flat/unparseable traces; speed mode rejects
  time-shaped values). Honesty gates are unit-tested; needle values are exposed to
  screen readers via an aria-label on the pace row.
- **Review stack:** per-task implementer+reviewer subagents (4 tasks Approved) → a
  whole-branch review (1 Important: a `%`-vs-`px` unit slip in the route markers,
  plan-originated — fixed in `9be44d54` + char-wise re-review) → CodeRabbit on the PR.
  Verified: 374/374 tests · parse clean · PowerShell mobile build exit 0 · LF clean.
  **On-device pass recommended** (Black/Sage/Cream; run/ride/strength) — dotted-leader
  DPR rendering + the 12.5vw hero clamp are device-only proofs.

### 2026-07-02 — Session Details v2 (#1518) · living-instrument sweep (#1519) · tier 1 goes SAGE (#1520) · chip/boost fixes (#1517)
- **Chip formatting + boost reachability (#1517).** The #1515 name-row chips wrapped
  under a long member name — the actions now pin top-right (`flex: 0 0 auto`, no wrap)
  while the serif name word-wraps beside them (27px, `overflowWrap`), correct for ANY
  name length. And the presence-rail boost sheet was unreachable for the demo rail
  people (the no-real-member fallback) — they now open `BSLiveBoostSheet` too, honestly
  labeled "Preview · demo member — boosts land in a real member's chat while they train."
- **Session Details v2 — the "living instrument" replay (#1518).** The activity detail
  page (all activity types) boots instead of rendering: the page's accent is
  **intensity-reactive** (`bsSdHeatColor` over time-in-zone — recovery reads cool teal,
  max effort reads ember/red; neutral accent when no zones), the hero number **counts
  up** (`BSSdCountUp` — times/non-numerics stay static, no fabricated mid-count values),
  a heat pulse-rule draws under the title, summary tiles stagger in with **ghost
  sparklines** (HR/pace series behind their scalar), every chart is a **`BSSdTrace`**
  (line draws itself in-view, zone-gradient HR stroke, live HTML end-dot, ▲ peak flag,
  **touch-scrub** scan line + readout), time-in-zone renders as **charging fuel cells**
  (`BSSdZoneCells`, sequential fills + shimmer + counting %), and splits land as
  **`BSSdBars`** (staggered rise, PR bar bursts then breathes, RPE mini-dials). One-shot
  IntersectionObserver triggers; `prefers-reduced-motion` renders the finished state.
  Old `AreaChart`/`ZC` removed. **Review round (3 CodeRabbit, all fixed):** per-mount
  SVG gradient ids (`React.useId` suffix — duplicate ids resolve to the first in DOM),
  CSS injection moved from the render body into `React.useInsertionEffect`, and the HR
  section requires a drawable trace (>1 point) or zones (no empty section head).
- **Living-instrument sweep — four more surfaces (#1519, from owner screenshots).**
  (1) The **post comments/reactions page** (same `BSActivityDetail`, comments focus):
  heat section ticks, count-up Reactions/Comments numbers, the un-reacted pill
  **breathes** an invite glow and its count **pops** on every new reaction, the
  who-reacted facepile staggers in, comments **cascade** (a `commentsAtOpen` ref scopes
  the cascade to what existed at open — fresh replies appear instantly), and the coach
  **co-sign chip stamps in** (`bsSdStamp`) after the hero lands. (2) Home's **Progress
  door → `BSProgressDoor`**: clipped instrument door (notch/spine/bracket,
  press-compress) with one colored tick per section (streak teal · trends blue ·
  training `t.RUST` · nutrition `t.AMBER` — tokens per CodeRabbit). (3) The **Boost
  sheet** boots: rises on open, the live dot breathes, an accent pulse-rule draws,
  phrase pills become clipped spine chips that stagger in. (4) The **Today check-in
  page is UN-BOXED** — the single plate becomes individually laid-out slim plates
  (Energy teal · Hunger amber · Sleep + Rested blue · clipped Log CTA · Hydration ·
  recovery footer), staggered; `plate()` is a plain function so DOM nodes stay stable
  and entrances never replay on a gauge tap; data flow, honest gating, and the
  optimistic hydration writes untouched. CodeRabbit nits fixed: stable keys on the
  animated facepile/comment rows (id/ts, index-only fallback).
- **First tier is now SAGE GREEN `#5fa96e` (#1520).** Owner picked sage over violet /
  bronze / slate (violet reads *premium* — an entry rank fancier than the gold above it
  inverts the climb). Client **Base/Raw** + coach **Certified** change in ONE sweep:
  mobile `BS_TIER_COLORS` (avatars, score cards, climb, chat tints, and the Shape-steps
  rings all flow from `bsTierColor`/`bsMyTierColor`), the canonical website
  `tierColors.jsx`, the 7 page-local maps (chatWidget · livingDesktop ·
  livingProfilePage · marketplace · memberProfile · pageShell · siteSearch · score),
  and the legacy static `shape-score*.html` labels — with `?v=` bumps across 77 pages.
  The two `#8a93a0` **elevation-chart** strokes are terrain slate, not tier colors —
  deliberately kept. Replacements were byte-safe (a first `sed` pass silently normalized
  CRLF on mixed-ending files and was reverted — line endings preserved in the shipped diff).
- All three squash-merged (`5962e999` #1518 · `cfa545d6` #1519 · `270c22a6` #1520 —
  #1517 earlier as `5f36a960`), CI green, every CodeRabbit thread resolved (#1520
  APPROVED clean); branches kept. Verified per PR: JSX parse · PowerShell mobile build ·
  363/363 tests · LF normalized. **On-device pass recommended** for the animation-heavy
  pages (session details, comments page, boost sheet, Today page).

### 2026-07-02 — LIVE BOOST (#1514) · Today nudge leads Home (#1513) · Follow/Message instrument chips beside the name (#1515)
- **LIVE BOOST — cheer someone on WHILE they're mid-workout/mid-cook (#1514).** Tapping
  a mid-activity member on the chat presence rail (teal/amber corner dot) now opens
  **`BSLiveBoostSheet`** instead of the profile: their avatar + an honest
  "In a workout now · N min in" line (elapsed from `user_activity.started_at` via the
  new **`ShapePresence.activityDetail`** — the table is authenticated-read, NO
  migration), four one-tap motivational phrases per activity kind + a free-text line.
  Sending fires a REAL 1:1 DM (`getOrCreateMemberConversation` + `sendMessage`)
  stamped `metadata {kind:'live_boost', activity}` — delivery/unread/push ride the
  existing message spine, so it lands mid-set instead of after the activity posts.
  Threads render a **"▲ Live boost · mid-workout/mid-cook"** eyebrow on EVERY path —
  both DM mappers, the coach-thread remap, and the open-thread realtime append
  (Codex P2: the time-sensitive case). Review round (Codex + 4 CodeRabbit Majors, all
  fixed): boost eligibility requires a REAL `userId` (demo rail people keep the
  profile tap — honest-data), unknown activity kinds map to `null` (never a
  fabricated "workout" label), and the sheet is a real modal (role=dialog +
  aria-modal, Escape closes, focus moves in; no autofocused input — mobile keyboard).
  **War Room v2 item:** the full "see the workout in progress live" view (set-level
  state broadcast from the session player + a privacy toggle).
- **Today check-in nudge leads Home (#1513).** The #1511 nudge moved to the TOP of the
  Home card list, directly under the THIS WEEK calendar strip (position-only).
- **Follow/Message → live instrument chips beside the name (#1515).** The static round
  pills are now clipped instrument chips (top-right notch, squared radius, 3px accent
  spine): **＋ Follow** solid-accent with a soft BREATHING glow until followed
  (`prefers-reduced-motion`-gated), **✓ Following** accent-tinted, **Requested**
  quiet, **✉ Message** ink-spined; both compress on press. On member profiles the
  chips ride the NAME row (new `title` slot on `BSFollowBlock` — the serif name left,
  chips right, counts on their own line below; long names wrap the chips down-right).
  Coach profiles keep the centered layout with the new chips. CodeRabbit nit fixed:
  the chip CSS injects ONCE (`bsInjectFollowChipCss`), not per instance.
- All three squash-merged (`b166b648` #1513 · `cdc12f68` #1514 · `576e8ed8` #1515),
  CI green, every review thread resolved; branches kept. Verified per PR: JSX parse ·
  `node --check` shapeBackend · tsc (warroom) · PowerShell mobile build · 363/363
  tests · LF normalized.

### 2026-07-02 — Today check-in box → a Home notification nudge + its own page (#1511)
- **The "Today · how are you" check-in + hydration plate leaves the Home flow.** Home
  now carries **`BSTodayNudge`** — a compact notification-style door in its slot
  (weekly-check-in nudge chrome): **status-aware** — "Quick check-in." with a live
  tick while today is unlogged, flipping to "Logged for today ✓ · tap to review · add
  water" once a MANUAL signal exists for today (same rule as the card: energy/hunger/
  rested/manually-entered sleep — a wearable syncing sleep alone never reads as
  logged). Keyboard-activatable.
- **Tapping it opens `BSTodayPage`** — the full box (energy · hunger · sleep-last-night
  chips · rested · Log today · hydration quick-adds + undo) on its own page under the
  standard `BSDetailHeader` masthead, via Home's early-return overlay pattern.
  `BSTodayCard` itself is UNCHANGED — data flow, honest gating, and the optimistic
  hydration writes carry over as-is.
- **CodeRabbit Critical addressed:** the new nudge (and 6 pre-existing components +
  one `BSPlateRef`) locally aliased `const BSPlate = window.BSPlate` even though
  `BSPlate` is already destructured from `window` at module scope — the shadowing
  aliases are all removed; every site uses the module binding directly.
- Squash-merged `f8c943f7` (#1511), CI green, thread resolved; branch kept. Verified:
  JSX parse · PowerShell mobile build · 363/363 tests · LF normalized.

### 2026-07-02 — Goal · Shape steps · Progress move from the profile to HOME (#1509)
- **The three private utility cards leave the profile page** (now a public-facing,
  full-bleed identity surface) and land on **Home**, the daily surface: the compact
  **`BSMeGoalCard`** renders above the day's agenda (opens the full Goals page via
  Home's existing `goalsPage` overlay; honest gating kept — a signed-in account with
  no goal renders nothing, the demo goal is signed-out preview only), **`BSStepsCard`**
  slots directly under the Today plate with the day's other living metrics, and
  **Progress** becomes a slim bordered door after the weekly totals (Home's existing
  `homeProgressPage` overlay). *(The old 2026-06-12 "goal card renders on HOME" note
  had gone stale — the card wasn't rendering there anymore; this restores it.)*
- Cleanup: `BSTerrainProfile` drops the three blocks + the now-unused
  `onOpenGoals`/`onOpenProgress` props; `BSClientMe` sheds its unreachable
  goals/progress overlay states (the Score → Store chain off the hero's score plate
  stays). The profile is purely identity + climb + activity.
- Squash-merged `b96de598` (#1509), CI green, CodeRabbit clean (0 findings). Verified:
  JSX parse · PowerShell mobile build · 363/363 tests · LF normalized.

### 2026-07-02 — Profile round 3: Message beside Follow · FULL-BLEED profiles · the masthead opens EVERY page (#1505 · #1506 · #1507)
- **Message pill rides the Follow row (#1505).** `BSFollowBlock` groups Follow + Message
  into ONE flex item so they always share a row (the pair wraps together, never apart);
  the stats gap tightened 14→11 so the whole line fits a phone width.
- **Both living profiles run FULL-BLEED (#1505)** — the #1502 activity-card treatment
  extended to every boxed surface. Rule: **boxes go edge-to-edge (side borders + radius
  dropped at the screen edges); typographic content keeps the page gutter.** Member
  (Terrain): the ascent hero card spans the screen — its ridge SVG gets
  `preserveAspectRatio="none"` so the %-positioned HTML overlays (you-are-here badge,
  level pills) stay aligned with the drawn geometry at any width (they drifted under the
  default letterboxing); the tab bar, signals cards, trajectory, lift tiles, Why card,
  extras, playlists, and empty/private states all bleed. Coach (Signal): same at its
  22px gutter (hero stat card, discipline grid, track record, certifications,
  waitlist/storefront cards, offerings, reviews). The shared pieces (`BSLivingTabs`,
  `BSProfileExtras`, `BSProfilePlaylists`) take `pad`/`bleed` props, so nothing else moves.
- **The standing masthead (SHAPE logo + Vol. 1 · No. 1 + search/avatar corners) now
  opens EVERY page (#1506 + the pushed profiles in #1505).** New shared
  **`window.BSMastRow`** (`iosAppBroadsheet.jsx`, exposed with the chrome); applied to
  every screen that still opened with a bare custom header: **`BSDetailHeader`** (the
  shared sticky detail header — 26 consumer pages incl. Habits; the corners move up
  beside the logo, top pad 64→46 so the sticky height holds), the client one-offs
  (Library, Library detail, workout Preview, meal preview, the chat-thread header), and
  the pros customs via **`bsProMastRow()`** (Adjust/Schedule action head, client full
  profile, Soundtracks; `BSProMe` + the draft editor take the logo-only variant — their
  headers already own the right corner). Pages on `BSMasthead`/`BSPageHeader` already
  carried the row.
- **Activity feed decluttered (#1507).** The "PERSONAL ACTIVITIES" label is gone on both
  profiles (the Activity tab already names the feed); the owner's ＋ Log activity CTA
  stays via a shared `BSActivityLogCta` (CodeRabbit's dedupe suggestion, applied); the
  profile tab strip compacted (bar margin 14→9, strip pad 6→5, control inset 4→3,
  buttons 8→6px vertical).
- **Process lesson (cost ~20 min): don't stack PRs.** A PR based on another feature
  branch gets NO CodeRabbit review (skips non-main/staging bases) AND no `ci.yml` run
  (its `pull_request` filter targets main) — and retargeting the base to main later
  does NOT retrigger workflows (needed an empty commit to fire the required checks).
  Open every PR against `main` directly.
- All three squash-merged (`b99f6047` #1505 · `e9f51407` #1506 · `7bce400c` #1507), CI
  green, the one CodeRabbit finding addressed + resolved; branches kept. Verified per
  PR: JSX parse · PowerShell mobile build · 363/363 tests · LF normalized.

### 2026-07-02 — Home + profile polish round 2 (#1502) · Message pill everywhere messageable (#1503)
- **Home "Daily habits" card → instrument plate (#1502).** It had drifted to a soft
  rounded card while the rest of the home page speaks BSPlate: now a green plate
  (notch/spine/bracket), mono `HABITS · n/m done` eyebrow + tabular `+pts/possible`,
  serif **"Daily habits."** title, squared Do/Avoid tags (accent left edge), squared
  checkboxes, mono `View all →` footer. Behavior kept (tap-anywhere opens Habits,
  inline check-off, flash chip, empty/all-done states); keyboard activation added —
  Codex P2: the plate's onKeyDown fires only when `e.target === e.currentTarget`, so
  Enter/Space on an inline checkbox checks the habit instead of opening the page.
- **`BSTodayCard` compacted (#1502)** ~25% shorter: gauge tap rows 44→34px (above the
  24px floor), tighter paddings/margins, smaller value type, slimmer sleep chips /
  log button / hydration quick-adds.
- **Profile "Personal activities" cards run FULL-BLEED (#1502)** — negative side
  margins break out of the tab body padding (member −20px / coach −22px), side
  borders + radius dropped at the screen edges. (Supersedes #1500's full-width step.)
- **Message pill on every messageable profile (#1503).** Two gaps left #1500's pill
  missing (user screenshots): the real-account `uid` gate is dropped from
  `BSFollowBlock` — the HOST handler decides real-vs-demo (the feed host opens a
  local thread for demo people, like the big Message CTA) — and the two HOSTLESS
  `BSPublicProfile` contexts (universal-search person view + Settings follow-list
  view) now wire `onMessage` through a shared module helper
  **`bsOpenMemberConversation(person, closeOverlay)`** (get-or-create → close the
  local overlay → `shape:openConversation`; the shell listener closes search + jumps
  to Chat). Review round (Codex P2 + 2 CodeRabbit Majors, all fixed): both hostless
  handlers use the exact search-row gate (`signedIn + userId + not-self`) so a
  self/signed-out profile never shows an erroring pill, and the search handler clears
  its local `viewPerson` BEFORE dispatching (no stale profile on a kept-mounted
  search); the duplicated handler boilerplate is collapsed into the shared helper.
- Both squash-merged (`bbf367a0` #1502, `da870999` #1503), CI green, CodeRabbit +
  Codex threads all resolved; branches kept. Verified per round: JSX parse · mobile
  Vite build (PowerShell) · 363/363 tests.

### 2026-07-02 — Profile polish: full-width activity cards + Message beside Follow (#1500)
- **Full-width activity cards.** The profile "Personal activities" feed's MM/DD **date
  gutter is removed** on BOTH profiles (member Terrain + coach Signal) so the rich
  activity cards span the full screen width — the card's own age chip ("6m"/"2d")
  already carries the timing. `bsCardDateLabel` + `bsAgoToDate` lost their only
  callers and were removed (dead-code discipline).
- **Message pill beside Follow.** `BSFollowBlock` (the shared followers/following/
  posts row on both profiles) gains a **Message** pill next to Follow — outline style
  matching the non-solid Follow states; the stats row now wraps (`flexWrap` +
  `rowGap`) so narrow screens can't overflow. **Codex P2 fixed before merge:** the
  pill routes through the profile HOST's `onMessage(person)` handoff (threaded
  `BSTerrainProfile`/`BSSignalCoachProfile` → `BSProfileIdentityHead` →
  `BSFollowBlock`) — the host dismisses the profile overlay BEFORE opening the real
  1:1 (`getOrCreateMemberConversation`), exactly like the profiles' big Message CTA;
  a direct `shape:openConversation` dispatch would have left the overlay rendered
  over the thread in child-hosted contexts (e.g. `BSClientFeed`). Rendered only
  where a live handler + a real account exist — hosts that never wired messaging
  (search/list overlays) get no dead button; hidden on your own profile.
- Squash-merged `055a588d` (#1500), CI green, CodeRabbit clean, Codex thread
  resolved; branch kept. Verified: JSX parse · mobile Vite build (PowerShell; the
  local `three`/`@pixiv/three-vrm` deps had gone missing from `node_modules` and
  were restored via `npm install` — environmental, not a repo change) · 363/363.

### 2026-07-02 — Waitlist follow-ups (#1497 notification matrix · #1498 Book-now one-time) + WORKLOG consolidation
- **Waitlist notification types registered + preference-enforced (#1497).** The #1495
  follow-up: `waitlist_join` / `waitlist_invite` delivered in-app + push with no
  per-channel toggles. New **`createPreferredNotification()`** (`src/lib/notify.ts`)
  resolves the RECIPIENT's `notification_settings` (master mute) +
  `notification_preferences` overrides via the AI layer's `channelsForType`
  (imported from `notifications.mjs` — one source of truth): muted or
  all-channels-off **skips the write**; otherwise the row carries `data.channels`
  (the push webhook already gates on `channels.push === false`) and email goes out
  when opted in (mirrors `notify-core.ts deliver()`) — capped at **one email per
  recipient per type per hour** (checked against the notifications ledger BEFORE the
  row insert) so an event loop (e.g. scripted join→withdraw→join) can't amplify into
  outbound email spam. Both waitlist routes send through it.
  **`GET /api/notifications` now filters `data.channels.inapp === false` rows** —
  the bell gate notify-core documented but never implemented (rows without channels
  metadata stay visible; the query over-fetches 200 before the 50-item cap so hidden
  rows can't starve the feed — Codex P2). Types registered in the web `NotificationDashboard`
  (`clientMeSettings.jsx` NP_TYPES, `?v=20260702a` on ClientApp + ClientMe — note this
  file is tracked **CRLF**, the repo's only one) and mobile `BSNotifyPrefs`
  (`waitlist_join` on the coach list, `waitlist_invite` on the client list). Defaults
  unchanged (in-app + push on, email off).
- **Website invited "Book now" → per-role one-time purchase (#1498).** The invited
  first-dibs CTA on both website coach profiles clicked `tpSubscribeLink` (monthly
  sub); now it clicks the page's one-time link — trainer `tpBookLink`
  (`/purchase?role=trainer&kind=booking`), nutritionist `tpBuyMealPlanLink`
  (`/purchase?role=nutritionist&kind=meal_plan`). Safe both sides:
  `hasActiveWaitlistInvite` allows purchase AND subscribe, and the Stripe webhook
  booked-flip covers both `payment` + `subscription` modes. The invited state carries
  BOTH paths (Book now · Subscribe monthly · Decline — Codex P2: the normal CTA block
  is hidden at capacity, so the invited block must offer the subscription too).
  **Follow-up (War Room):** the MOBILE invited "Book now" still starts the monthly
  subscription (`doSubscribe`) — bring it to parity with the website first-dibs path.
- **WORKLOG consolidation.** The stale early-June root `WORKLOG.md` (Cycles 2–5,
  PRs #712–#807, frozen at #808 — dead branch name, pre-PR-flow merge rule, pre-#1470
  publish steps) is archived to `docs/WORKLOG-ARCHIVE-2026-06-cycles-2-5.md`; the
  root file is now a pointer stub to THIS file. Its one live-guidance piece — the
  **window-globals load-order gotcha** (React error #130 when a role module reads a
  global before a feature module defines it) — is ported into the architecture map
  above. `AGENTS.md` already pointed only at `docs/WORKLOG.md`; nothing else
  references the root path as a source of truth.
- War Room: both waitlist follow-up checklist items flipped to done (in their PRs).
  Remaining #1495 follow-ups (optional expired-invite cron; withdraw optimistic-UI /
  bridge-header / alert()→toast polish) stay open.

### 2026-07-01 — Per-coach waiting room (#1495) + RLS-authoritative rework
- **New feature: per-coach waiting list.** When a coach is **at capacity**, signed-in
  members join a **waiting room** (`coach_waitlist` table, migration
  `2026-07-01-coach-waitlist.sql`) to be first in line; the coach invites a client back
  with a **7-day first-dibs** window (a live invite is the ONLY thing that lets an
  at-capacity coach be purchased/subscribed — checked in checkout-session + purchase +
  subscribe via `hasActiveWaitlistInvite`); a completed Stripe payment/subscription flips
  the row to `booked` (webhook). Clients can **withdraw** (waiting→left / invited→declined);
  **coach discretion** on who to invite (positions are shown but not a locked FIFO — per the
  owner's call). Surfaced in the mobile client CTA + coach room panel
  (`iosAppBroadsheetClient.jsx`, `ShapeWaitlist` bridge) and both website profiles.
- **RLS-authoritative rework (CodeRabbit's blocking security policy).** The first cut routed
  every user action through the service-role admin client; `.coderabbit.yaml` treats a
  service-role write for a USER action as a blocking security regression (admin is for
  system writes only). Reworked so:
  - **Client actions** (join / withdraw) run on the **caller-scoped** Supabase client
    (`resolveRequestClient`, cookie-or-Bearer) under RLS: `coach_waitlist` now has client
    **SELECT/INSERT/UPDATE own-row policies**. A **`coach_waitlist_guard_cols` BEFORE
    INSERT/UPDATE trigger** freezes `created_at` + `provider_role`/`provider_id`/`client_id`
    (and the invite timestamps unless transitioning to `invited`) so a client-scoped write
    can't jump the queue, move a spot to another coach, or spoof invite timing. The UPDATE
    policy's **USING pins the old status to `waiting|invited`** so a terminal/`booked` row
    can't be flipped back to `waiting` (re-queue / un-book).
  - **Cross-user reads/writes** (FIFO position, coach room roster + client names, invite)
    go through **`SECURITY DEFINER` RPCs** that verify `auth.uid()` ownership internally —
    the same pattern as `get_roster_weekend_split` / `get_client_stats`: `get_my_waitlists()`,
    `get_coach_waitroom(role,id)` (raises `42501` for a non-owner), `invite_from_waitlist(id)`
    (ownership-checked, atomic, raises `42501`/`P0002`/`P0001`; guards against a second active
    row → clean 409 instead of a 23505). Admin client is used ONLY for the coach/invite
    **notifications** and the webhook booked-flip (the documented system-write exception).
- **CodeRabbit findings addressed** (24 inline + 2 Codex): `entryId` UUID validation, reject
  unknown provider roles (no coerce-to-trainer), caller-scoped reads/writes, atomic withdraw
  (transition only the read status + confirm a row changed), webhook booked-flip result check,
  purchase/subscribe/checkout **surface waitlist-lookup failures as retryable** (not a silent
  "at capacity" — `hasActiveWaitlistInvite` now throws on error), **expired invites no longer
  occupy a FIFO slot / block re-join** (SQL + the `computePositions` twin mirror
  `status='invited' AND invite_expires_at > now()`), coach re-invite of an expired/declined
  entry, invite notification tap now opens the marketplace, mobile reads degrade to `{entries:[]}`
  on any failure, batched room name lookups (one definer join, no N+1), exact-set assertion test.
- **Adversarial review** (4-dimension workflow — security/RLS · CodeRabbit-resolution ·
  correctness/races · migration SQL — each finding independently refuted) + the automated
  security-review pass caught and fixed **two real MAJORs before commit**: the UPDATE-USING
  queue-jump/un-book, and a join↔invite reactivation race (reactivation now re-checks expiry +
  its rowcount so a concurrent coach invite isn't clobbered).
- **Post-open review rounds (all addressed).** CodeRabbit's incremental re-review + a
  migration-run error surfaced three more iterations: a Postgres **reserved-word** fix
  (`position` → `queue_position` in the RPC `returns table` + `#variable_conflict use_column`);
  and RLS hardening the re-review caught — the INSERT policy now verifies the target coach
  room **exists AND is at capacity** (mirrors `isEffectivelyAtCapacity`), the UPDATE policy
  blocks reverting a **live** invite back to `waiting`, deterministic FIFO tie-break
  `(created_at, id)`, strict canonical-UUID validation, join/withdraw error-surfacing (no
  false `already_processed`), and the invite-notification tap now opens the marketplace
  pre-filtered by role. CodeRabbit **accepted the coach-discretion (non-FIFO) decision** and
  withdrew those flags; **every review thread resolved** (webhook 200+log, subscribe, and the
  at-capacity gate all confirmed addressed by CodeRabbit).
- Verified each round: `tsc --noEmit` clean · **363/363** tests · JSX/JS parse · LF/no-BOM.
  **Squash-merged to `main` as `4f1805fa` (#1495)** — CI green (Web · Mobile · gitleaks), 0
  unresolved CodeRabbit threads; branch kept. **Migration APPLIED by the owner** (re-run
  across the RLS-hardening iterations; idempotent — final version carries the client RLS
  policies, the `guard_cols` trigger, and the 3 SECURITY DEFINER RPCs).

### 2026-07-01 — Profile activity feed shares the community dataset (#1490)
- **Profile "Personal activities" now match the chat/community feed (#1490).** The mobile
  profile feed was showing a different, hardcoded demo persona than the community/chat activity
  feed. Hoisted `COMMUNITY_ACTIVITIES` from inside `BSClientFeed` to module scope so **one
  shared dataset** backs both surfaces — every profile now renders ITS OWN owner's rich
  `BSActivityCard`s (same stats/zones/trace/session-details as the community feed), never a
  single frozen persona. Added rich per-owner entries (e.g. Quinn Harper PR/run/workout).
- **Honest-data gating.** Signed-in profiles show only real published posts + the owner's own
  logged activities; a real public profile (`feedAuthorId`/`sigFeedAuthorId` set) shows only
  its real posts; only a signed-out demo/preview persona shows activities pulled from the
  shared set (member → `role==='Client'`; coach → `Trainer`/`Nutritionist`, with the Tip/Win
  field-notes as fallback when a coach has no shared entry).
- **Tighter profile date gutter.** Reduced the oversized empty space between the date column
  and the activity card (`gap 3→2`, `flex 30px→24px`, `paddingTop 12→10`, `fontSize 9→8.5`) on
  both the member + coach profile feed rows.
- Squash-merged to `main` (branch kept); CI green. CodeRabbit's 2 Major (demo leaking to real
  profiles · coach not wired to the shared set) addressed in `16c2e6ac`; the re-review's
  re-flags were stale anchors against the pre-fix diff (verified resolved in current source).

### 2026-07-01 — Coach Today real date (#1487) · War Room #1481 → done (#1488)
- **Coach Today masthead shows the real date (#1487).** `dashToday.jsx` hardcoded the
  eyebrow to "WEDNESDAY APR 18" (a roadmap-1.2 placeholder), so every signed-in coach saw a
  frozen, fake date (honesty-rule violation). New `dashTodayDate()` formatter, computed **per
  render** — `date` is now a function called at `DashShell` like `cfg.greeting` (CodeRabbit's
  fix, so a tab left open past midnight stays fresh) — applied to both trainer + nutritionist
  role configs; display-only (untouched demo `mockCalendar`). `dashToday.jsx?v=20260701d`
  across all 18 consumer pages. CI green; CodeRabbit's one correctness nit addressed.
- **War Room: #1481 email-enum flipped pending → done (#1488).** Confirmed live via
  `has_function_privilege` — `get_email_for_username` is revoked to service_role
  (anon=f / authd=f / svc=t) and both login clients (`login.jsx` + `shapeBackend.js`) call
  the rate-limited `/api/auth/resolve-username`; dropped the stale "(in PR)" label. (The
  `REMEDIATION-2026-06-30.md` ledger still reads NEEDS-OWNER only because it's a pre-merge
  snapshot — all 6 hardening migrations are in fact applied + verified live.)
- Both squash-merged to `main` (branches kept); docs/config-only WORKLOG follow-up.

### 2026-07-01 — Web notifications dashboard + reminders parity · iOS push-entitlement prep · coach-marketing docs (PRs #1483–#1485)
- **Desktop-website reminders parity (#1483).** Ported the mobile `BSReminderManager` to the client
  Settings page as **`ReminderCard`** (`public/newdesign/clientMeSettings.jsx`): weigh-in / weekly
  check-in / water / progress-photo / custom nudges with a time + days, over the existing
  `/api/client/reminders` (`user_scheduled_reminders`, cookie auth). Closes the long-standing
  "desktop-website Settings parity" reminders follow-up.
- **Notifications dashboard (#1483).** New **`NotificationDashboard`** porting the mobile
  `BSNotifyPrefs`: master **mute**, **quiet hours** (from/to), **daily cap**, and the per-type ×
  per-channel **matrix** (8 client types × App/Push/Email; defaults App on / Push on / Email off) +
  **habit reminders** surfaced from `habit_reminders` with enable toggles. Wired to the REAL
  notification-center backend (`notification_settings` / `notification_preferences` /
  `habit_reminders`) via the **`get_notification_center()` RPC** + RLS-scoped upserts through
  `window.shapeDb.client` — the same tables `src/lib/ai/notify-core.ts` reads. **No new API route or
  migration** (those tables were already live from the 2026-06-17 notification-center batch).
  `notification_preferences` stays override-only: toggling a channel back to its default DELETEs the
  row. Renamed the "Privacy & notifications" card → **"Privacy"** (dropped the two decorative
  profile-doc rows now covered by the real matrix). `clientMeSettings.jsx?v=20260701b` on
  ClientApp.html + ClientMe.html.
- **CodeRabbit (#1483) — 4 findings, all fixed + resolved:** load-failure-vs-empty on both cards (a
  401/500/network load no longer reads as "No reminders yet"), stale custom-label clearing (`label`
  posted only when the kind is `custom`), write-error surfacing (a Supabase write that resolves
  `{error}` [RLS] or rejects [network] now re-syncs from the server + shows an inline alert instead of
  silently lying), and the override-only delete-on-default.
- **iOS native push prep (#1484).** Added the **`aps-environment`** (Push/APNs) entitlement to
  `mobile-app/ios/App/App/App.entitlements` — the last repo-side gap for the **system-push P1**
  (`UIBackgroundModes` left `[audio]` on purpose: user-facing pushes, not silent → avoids an
  unused-background-mode App Store review flag). New **`docs/native-ios-build-checklist.md`** documents
  the Mac-side owner sequence (cap sync, Apple App-ID capabilities, APNs `.p8` → Firebase,
  `GoogleService-Info.plist`, signing / production-entitlement nuance, submit) + the Stripe Connect /
  IAP caveat.
- **War Room cleanup (#1484).** Flipped 3 stale `pending` items to `done` — Shape Steps → points
  (#1439), accurate Shape Score legend (#1438), onboarding score explainer (#1440) — all shipped 06-27.
- **Coach-marketing funnel docs (#1485).** Updated the June-1 assets
  (`coach-acquisition-campaign-plan`, `coach-outreach-email-sequence`) to the **flat-15%-commission /
  members-pay-their-own-$5** messaging, and added 3 new campaign docs — `coach-marketing-campaign-plan`
  (top-of-funnel awareness), `coach-nurture-email-sequence` (opt-in → applicant),
  `coach-recruiting-campaign-plan` (bottom-of-funnel). Docs only.
- **All 3 squash-merged to `main`** (branches kept), CI green. #1483 CodeRabbit-reviewed clean after
  the fixes; **#1484/#1485 CI-green but CodeRabbit was cap-blocked** (org spending cap posted a
  rate-limit notice, NOT a review) → merged on green per the owner's "merge when green" call
  (low-risk chore + docs). *Detection lesson:* read CodeRabbit's **edited-in-place summary comment** +
  resolved-thread state to tell "reviewed" from "rate-limited/processing" — don't poll for the literal
  "Actionable comments posted:" string (misses in-place edits + clean 0-issue reviews).

### 2026-07-01 — Security & code-health audit + full P1/P2 remediation (11 PRs)
- **Read-only audit** (`docs/SECURITY-AUDIT-2026-06-30.md`): whole repo — API authz (141 routes),
  RLS + SECURITY DEFINER RPCs (deployed-state cross-checked via `pg_proc`/`pg_policies`/
  `has_function_privilege`), secrets, payments/integrations, dead code, inefficiencies,
  consolidation, deps. **Strong posture; 2 P1s** + P2/P3s. Root cause of the security findings:
  Supabase default-grants `EXECUTE` on public functions to anon+authenticated, and the admin/cron/
  catalogue SECDEF RPCs were never revoked (several used `auth.uid() IS NULL` as a service-role
  proxy that `anon` also satisfies). **No exposed secrets, no XSS, npm audit clean.**
- **Remediation** (`docs/REMEDIATION-2026-06-30.md`) — one PR per finding, all merged unless noted:
  - **#1475 (P1)** store credit-minting: `redeem_store_item`/`redeem_store_order` trusted client
    `p_cost`/`p_credit_cents` (mint spendable credit via a direct RPC call) → new `store_catalogue`
    table; functions now look up cost/credit/kind/locked and ignore the client money args.
  - **#1474 (P1 + 4×P2)**: `admin_list_store_fulfillment` was anon-readable (exposed `ship_to` PII) →
    REVOKE the admin/service RPCs (`admin_list`/`admin_mark`/`consume_store_credit`) from anon/
    authenticated (+ re-grant service_role); anon-reject prepended to `set_metric_source`/
    `set_program_detail` (the NULL-logic bypass).
  - **#1471** OAuth open-redirect (`safeReturnPath` guard + control-char case from CodeRabbit + test)
    · **#1472** console write-IDOR · **#1473** program-assign write-IDOR (both: route gate +
    RLS split, mirroring `2026-06-17-coach-write-scope.sql`) · **#1476** `claim_provider_row` →
    3-arg service-role-only + route via `createAdminClient`.
  - **#1481 (OPEN)** last P2 — `get_email_for_username` (anon username→email enumeration) revoked to
    service_role; username login now resolves via the rate-limited `POST /api/auth/resolve-username`
    (mobile `shapeBackend.js` + web `login.jsx`, `Login.html ?v` bumped). Login-path — staging test
    before merge; apply its migration WITH the deploy.
  - All 6 applied migrations **verified live** (grants → anon=f/authd=f/svc=t; RLS split policies;
    `store_catalogue`=19 rows; function bodies via `pg_get_functiondef`).
- **Dependabot swept**: #1477/#1478 (Actions bumps) + #1479 (mobile-deps group) merged clean;
  **#1480** (web-deps: `stripe 22.0→22.3`, `@supabase/ssr 0.10→0.12`, react patch) broke `tsc` →
  fixed the two compat errors (Stripe `apiVersion` → `2026-06-24.dahlia`; `basePayload:
  Record<string, unknown>` for `@supabase/ssr`'s tightened insert typing) + merged.

### 2026-06-30 — Review + merge: 6 open PRs (#1462–#1467) shipped to `main` + the public/m Linux-build fix
- **Cleared the open-PR backlog.** All six outstanding PRs squash-merged to `main` (CI green;
  branches kept): **#1462** weekend-split **training dimension**, **#1463** atomic
  snapshot-sources merge, **#1464** drop the now-dead race-route fallbacks, **#1465** CLS
  metrics-matched font fallbacks (consultation + ClientPlaylists), **#1466** dead `mktHue()` +
  `MKT_PALETTE` removal, **#1467** the long-paused **Shape Radio live player + Nora avatar-DJ**.
- **Every CodeRabbit finding addressed (verified against the code, not just resolved).**
  - **#1467 (7 Major CodeRabbit + 2 Codex):** clear `nowPlaying` on radio teardown (no stale
    track after radio is off); **honest `—` empty states** instead of a synthetic "Shape Radio /
    Live" track — the `/api/radio/now-playing` error payload `{title:null,artist:null}` is a
    truthy object, so each field is guarded via a new `radioNowPlayingDisplay()`; relabel the
    station tempo as **Station BPM** (don't present `r.LIVE.bpm` as the current track's BPM);
    resolve the Nora VRM + avatar via `import.meta.env.BASE_URL` (native build serves from `./`,
    not a hard-coded `/m/`); **self-scheduling poll with `AbortController`** cancellation in
    `ShapeRadioLive` (no overlapping fetches; late responses dropped after teardown) +
    `audio.crossOrigin='anonymous'` as part of the stream contract; plan-doc stream resolver
    (`getStreamUrl()` behind the provider adapter) + cross-origin notes. CodeRabbit
    **auto-resolved its 7 threads** on re-review; the 2 Codex threads resolved.
  - **#1463:** the `merge_snapshot_sources` `case when jsonb_typeof(p_sources)='object'` guard was
    already in place (replied + resolved); the Codex P1 (same-field provenance-vs-value atomicity
    under concurrent provider writes) is an accepted narrow, label-only trade-off — the split
    intentionally fixes the bigger whole-`sources` clobber; folding provenance into every metric
    write is a broader follow-up.
  - **#1464 (Critical — deliberately NOT changed):** `league_assign_cohort` is service-role-only
    **by design** (the 2026-06-29 self-promote fix). The route still authorizes the actor via
    `currentUser` before the admin client; RLS can't express the privileged cohort write safely.
    Replied with the rationale + resolved as intended-by-design (reverting re-opens the vuln).
- **Root-caused the #1467 `public/m` sync failure** (why the branch was stuck for weeks). It was
  the byte-diff step, NOT `npm ci`. Three stacked causes, each verified via the GitHub Actions API
  (read logs/artifacts with git's stored PAT): **(1)** Vite-8/Rolldown **sourcemaps embed the
  absolute build path** (`C:\Users\cperr\…` locally vs CI's `/home/runner/…`) into the `.map`
  files → never matched; **(2)** `mobile-app/index.html` was **CRLF** in the working tree while the
  committed blob is **LF** (what CI builds from) → an extra blank line; **(3)** Windows Rolldown
  builds of the `three`/`@pixiv/three-vrm` 3D bundle don't reproduce CI's Linux output (the JS
  chunks themselves diverge). **Fix:** `build.sourcemap:false` + a `transformIndexHtml(order:'post')`
  LF-normalizing plugin in `mobile-app/vite.config.ts`, and for each `public/m`-touching PR, commit
  **CI's own Linux build** of `public/m` (pulled from a one-shot build workflow's `dist` artifact),
  never a local Windows build.
- **Bundle-merge coordination.** Three PRs touch `public/m` (#1462, #1466, #1467). Merged
  sequentially: each later one had `main` merged into its branch, then `public/m` rebuilt fresh
  **on Linux** (via the temp `buildm` workflow → artifact) before merging, so `main` stayed green
  after every merge. #1467's `vite.config` (sourcemap:false + the LF plugin + the three aliases)
  is the one that lands the sourcemap change on `main`.
- **Migrations** (both already re-run + applied by the owner this session, now on `main`):
  `2026-06-30-roster-weekend-split-training.sql` (#1462) + `2026-06-30-atomic-snapshot-sources-merge.sql` (#1463).
- **Durable lesson (saved to agent memory):** `public/m` for the mobile bundle must be **built on
  Linux to match CI** — a Windows `npm run build` of the 3D-containing Nora bundle diverges
  (sourcemap build-path + Rolldown nondeterminism). Take CI's artifact or build on Linux; don't
  trust a local Windows rebuild for that bundle. (Simpler non-3D mobile PRs happen to match.)

### 2026-06-29 — Race-condition hardening sweep (#1454–#1459) + apply-time security fix
- **Audited the async write/read layer for race conditions** (multi-agent fan-out, two
  passes — the first rate-limited, the re-run fully sequential) and fixed **10 confirmed
  races** across 5 PRs. Each touched route keeps a **fallback** so deploy order vs the
  migrations doesn't matter; all migrations are idempotent.
- **#1454 — atomic snapshot accumulators.** `/api/client/hydration` + `/api/nutrition/meal-log`
  did SELECT→compute-in-JS→UPDATE, so two concurrent writers (phone + `/m/` web, or a tap
  racing a retry) could lose an increment. New `add_hydration` / `add_meal_macros` RPCs do the
  add inside one upsert (ON CONFLICT DO UPDATE under the row lock). Migration
  `2026-06-29-atomic-daily-snapshot-accumulators.sql`.
- **#1455 — atomic `client_programs.detail` merge.** Four writers (goals route, AI directive
  override, client self-write, `set_program_detail`) read-modify-wrote the whole `{training,
  nutrition, goals, directive}` JSONB doc → a care-team trainer + nutritionist could silently
  clobber each other's section. New `merge_program_detail` (atomic `||` merge of only the
  patched keys) + `set_program_detail` rewritten to merge inside its upsert. Migration
  `2026-06-29-atomic-program-detail-merge.sql`.
- **#1456 — atomic league cohort.** `assignCohort` read counts then picked "first cohort <24"
  then wrote separately → at a week boundary, concurrent joins all piled into cohort 0
  (overflow, corrupting promote/relegate). New `league_assign_cohort` under a per-(week,tier)
  advisory lock. Migration `2026-06-29-league-cohort-atomic.sql`.
- **#1457 — server idempotency.** Device-sync `upsertSnapshot` → `.upsert(onConflict)`; coach +
  recipe reviews get unique `(user, slug)` indexes + upsert (no more duplicate reviews skewing
  the public average); lead-boost gets a partial unique index (one active boost/provider).
  Migration `2026-06-29-write-idempotency.sql`.
- **#1458 — client-side guards.** `BSTerrainProfile` + `BSSignalCoachProfile` getPublicProfile
  effects now reset `live` + use an `on` cleanup flag (tapping profile A then B no longer lets a
  slow A response overwrite B); MusicKit promise cleared on rejection; `_followCache`/`_avatarCache`
  cleared on sign-out (no cross-user leak); coach-review submit gets an in-flight lock.
- **CodeRabbit caught 2 real Critical auth vulns I'd introduced + I fixed them:** the league RPC
  let a user self-promote to any tier (now **service-role-only**, route-mediated); the
  `merge_program_detail` RPC let a client patch coach-only `directive`/`goals` (the
  `client_programs_discipline_guard` trigger now enforces directive+goals = coach-only on EVERY
  write path, before the self-bypass). Plus fallback read-error guards + a goals-GET owner/coach
  check + DB-boundary macro clamps. On re-review CodeRabbit **resolved every thread**.
- **⚠ Apply-time fixes (#1459).** Running the migrations surfaced two real issues, both fixed:
  (1) `write-idempotency.sql` hard-referenced optional feature tables → **42P01** on a DB without
  `coach_lead_boosts` (the lead-boosts table wasn't created); each block is now `to_regclass`-guarded.
  (2) **Live security gap:** `create or replace function` + Supabase's default privileges meant
  `league_assign_cohort` was STILL executable by `authenticated` after `revoke … from public` — the
  self-promote vuln was open in prod. Fixed live (revoked from `authenticated`+`anon`; verified only
  `service_role` can call it) and corrected the migration file.
- **All migrations APPLIED + verified live (2026-06-29)** — every RPC/index present, the
  discipline trigger enforces directive/goals coach-only, and `league_assign_cohort` is callable by
  `service_role` only (authenticated=false, anon=false). CI green + CodeRabbit clean on every PR;
  branches kept.
- **Lead-boost index — deferred follow-up now closed (2026-06-29):** the `coach_lead_boosts` block of
  `write-idempotency.sql` was skipped at apply time because that feature table didn't exist. The owner
  later ran `2026-05-08-lead-boosts.sql` (creates `coach_lead_boosts`) then re-ran `write-idempotency.sql`;
  the `coach_lead_boosts_active_uniq` partial unique index (`(provider_id) WHERE status='active'`) is now
  verified live. Every `write-idempotency` block is active.

### 2026-06-29 — Cumulative Layout Shift sweep (website + mobile, #1452)
- **Audited + fixed CLS** (content moving after first paint) across both surfaces via a
  fan-out + adversarial refute-verify pass (mobile + web-async finished by hand after the
  workflow hit server-side rate limits). Where shifts were → what stabilized them:
- **Fonts (the headline cause, website):** the big Fraunces serif heroes reflow when the
  web font swaps in, and **18 marketing pages had no `preconnect`** (the font fetch waited
  on DNS+TLS to gstatic, widening the swap window). Added `preconnect` (googleapis +
  gstatic) to all 18, **plus a metrics-matched fallback `@font-face` for all three tiers**
  so the local fallback occupies the SAME space as the web font → no swap reflow on
  **headers / sub-heads / body**: Fraunces → Times (`size-adjust:115.45%`), Space Grotesk
  → Arial (`109.69%`), JetBrains Mono → Courier (`99.98%`) — `size-adjust` + ascent/descent
  overrides computed from `@capsizecss/metrics` via the next/font formula. Wired into the
  shared `serif`/`sans`/`mono` stacks in `pageShell.jsx` (69 React pages) + the static-hero
  pages `index.html` + `GetApp.html`.
- **Media (website):** community-feed photos/videos had no reserved height (img box ~0px →
  up to ~420px on decode, shoving posts below) → `aspect-ratio:4/3` + `object-fit:cover`;
  the nav / splash-wordmark / radio-nav logos (`width/height:auto`) → `aspect-ratio` from
  each PNG's real dimensions. Feed photos also got real `alt` text (CodeRabbit a11y nit).
- **Dashboard (website):** the GridStack container collapsed to 0px then jumped when it
  measured + positioned cards in JS → `min-height:60vh`.
- **Mobile `/m/`** is otherwise low-CLS (self-hosted `font-display:swap` fonts, fixed phone
  frame, `background-image` doesn't reflow, meal photos in fixed boxes) — only the
  splash/auth/paywall SHAPE logos + the radio wordmark `<img height:auto>` needed
  `aspect-ratio`.
- **Audited but left alone (verified non-shifts):** consent banner / demo band (fixed, out
  of flow), header spacer (correct height), landing phone mockups (already aspect-ratio'd),
  facet-gem avatars (sized boxes). Residual: dashboard demo→live card height swap (behind
  auth, lower priority).
- `?v` bumped on `pageShell.jsx` / `dashGrid.jsx` / `dashboardCommunity.jsx`. Verified:
  both surfaces parse · `tsc --noEmit` · mobile build + `public/m` synced · 342/342 tests.
  **PR #1452** — CI green (Web · Mobile · gitleaks), CodeRabbit clean (its 1 a11y nit
  fixed). *Validation note:* the metric fallback fully matches on Windows/Mac (Times/Arial/
  Courier present) and degrades cleanly elsewhere; a Lighthouse CLS before/after on the
  preview deploy is the recommended confirmation.

### 2026-06-29 — "Today" instrument plate: daily check-in + hydration consolidated (mobile + web, #1451)
- **One plate replaces two home cards.** The mobile home's separate **`BSDailyCheckinCard`**
  (energy/hunger/sleep/rested) + **`BSHydrationCard`** are now a single teal **`BSTodayCard`**
  `BSPlate` (clipped notch · spine · live tick · bracket). Energy / Hunger / Rested are tap-to-set
  1–10 **gauges** (filled bar + end-anchor knob over 10 invisible tap zones — same 1–10 values,
  **no migration**); Sleep stays device-first (read-only recovery snapshot when a wearable synced,
  else manual hour chips); Hydration folds in as **dot-progress + quick-add** that **stays live**
  even after the check-in collapses to its one-line summary; recovery readiness + the sleep-detail
  door sit in the footer. Data flow (`/api/client/checkin`, `/api/client/hydration`,
  `window.ShapeProgress`) unchanged.
- **Web parity — first time on the website.** New **`DashTodayCard`** (`dashClient.jsx`) — a
  `dash-plate` widget at the top of the client home `DashGrid`, after the Score card — mirrors the
  mobile plate, posting to the same `/api/client/checkin` + `/api/client/hydration` (cookie session)
  and seeding today's values from `/api/client/progress`. `dashClient.jsx?v=20260629a` across the 8
  loader pages. (Web is metric-only ml; mobile honors the unit pref.)
- **Built brainstorm-approved → adversarial multi-agent review** (sequential 5-dimension pass —
  correctness · house-style · parity · states/a11y · honesty — each finding independently
  refute-verified). Caught + fixed: **(1)** a demo-vs-live leak — the web `live` flag flips
  false→true after the dashboard resolves, so a reset-on-live effect now drops the demo seeds (no
  fabricated "logged ✓" for a real member); **(2)** the web hydration GET omitted `?date=`, so it
  read the **server UTC day** near local midnight while the POST + mobile use the local day — now
  sends `?date=localDay()`; **(3)** `aria-pressed`/`aria-label` added to gauge tap zones + sleep
  chips; **(4)** the hydration readout no longer fabricates "· 0%" when the value is unknown (honest
  "—"); **(5)** the small text buttons (Edit / Sleep detail / Trends) bumped to the ≥24px tap floor.
- Verified: both JSX parse-check · `tsc --noEmit` · mobile build + `public/m` synced (diff clean) ·
  342/342 tests. **PR #1451**.

### 2026-06-28 — Weekend-vs-weekday adherence split (differentiator A, #1449) + Progress-hub simplification
- **First community differentiator, v1 (nutrition + habits).** Surfaces how a member's
  adherence drops on weekends vs weekdays — descriptive + never-shaming for the member,
  one concrete move for the coach. Built **brainstorm → spec → plan → subagent-driven
  execution** (spec `docs/superpowers/specs/2026-06-27-weekend-adherence-split-design.md`,
  plan `docs/superpowers/plans/2026-06-27-weekend-adherence-split.md`); a multi-agent
  hardening + anchor-mapping + plan-verification pass ran before any code, and an Opus
  whole-branch review after.
- **Pure tz-free module** `mobile-app/src/services/weekendSplit.mjs` (+ `src/lib/weekendSplit.ts`
  hand-mirrored twin, 16 tests). Takes PRE-BUCKETED weekly counts (no `Intl`/DST inside — all
  tz resolution is upstream) and applies a **statistical flag gate**: `gap ≥ 15pp AND ≥ 1.65·SE
  AND positive in ≥ 60% of weeks` — so a one-off bad weekend at the 3-weekend floor can't fire a
  false "you're slipping." Per-dimension flagging only; **composite is display-only**;
  `worstDimension` is ranked by **lower-CI bound** (not raw gap). Absent dimensions render
  nothing (never a fabricated 0%). 8-week window clamped to first activity (a brand-new account
  doesn't read empty days as a cliff). Nutrition "logged" needs a real-food signal (protein ≥ 10g,
  not a hydration-only snapshot row); habits = daily-cadence, non-archived only.
- **Member**: a **Weekends card** in the Progress hub Overall tab, computed CLIENT-SIDE over the
  already-cached `/api/client/progress` + `/api/client/habits` (`window.ShapeProgress.weekendSplit`
  in `shapeBackend.js`) — no bespoke self endpoint.
- **Coach**: **MIGRATION `2026-06-27-roster-weekend-split.sql`** — `SECURITY DEFINER`
  `get_roster_weekend_split(uuid[])` that gates EVERY client through the
  is-coach-on-client subscription check (a coach only ever sees their own roster), buckets Sat/Sun
  in each member's tz, day-based nutrition denominators, EXCLUDES archived habits (twin parity
  with `/api/client/habits`). `POST /api/coach/roster-weekend` runs the twin per client → a quiet
  **`WKND −N` roster chip** (`iosAppBroadsheetPros.jsx`) on flagged clients + a client-detail
  **"Weekend pattern" plate** with a directive keyed off the worst dimension.
- **Per-user timezone**: **MIGRATION `2026-06-27-client-timezone.sql`** — `client_profiles.timezone`
  (IANA) + a backfill from `user_scheduled_reminders.tz`; `POST /api/client/timezone` captures it
  opportunistically on app open (`BSClientAppInner`). Where unknown, the coach chip is suppressed
  (no UTC mislabeling); the member card uses the device zone.
- **Progress-hub simplification (folded in)**: deleted the **dead `BSMeKpis`** component (zero
  refs); removed the bare-adherence **Insights grid** from the Overall tab (matches the website
  `dashProgress.jsx` "no bare adherence % to clients" rule) — **weekly points preserved** as a KPI
  tile; both PR cards kept (they're not duplicates — Overall carries the e1RM line).
- **Review caught + fixed** (Opus whole-branch): the RPC originally counted archived habits, so a
  coach's habits number could differ from the member's own — added `archived_at is null` to all
  three `user_habits` joins. Self↔coach number parity + the SECURITY DEFINER owner gate both
  verified against the source.
- **⚠ Migrations APPLIED + verified live (2026-06-28)** — `client_profiles.timezone` column present,
  `get_roster_weekend_split` is SECURITY DEFINER, RPC smoke-tested (full CTE chain runs; returns 0
  to an unauthorized caller). Apply order matters: **timezone first, then the RPC** (the RPC reads
  the tz column). **PR #1449** — CI green (Web · Mobile · gitleaks); awaiting squash-merge.
  *(Windows note re-confirmed: rebuild `public/m` from PowerShell — the Git Bash build mangles
  `VITE_BASE=/m/` → `/`, which failed the Mobile sync check until rebuilt correctly.)*
- **Fast-follows**: training dimension (needs a `client_workouts.scheduled_date` column + backfill);
  a per-member change-from-baseline guard (v2 alarm-fatigue mitigation); calibrate `FLAG_GAP_PP`
  against the live weekend-gap distribution. Remaining differentiators (War Room): menstrual-cycle
  awareness, coach-set compliance variance band.

### 2026-06-27 — Sleep fast-follow (#1433) · supabase-js SRI (#1434) · Steps/Progress redesign (#1435) · accurate Shape Score legend (#1438) · Shape Steps → points + award-RPC dedupe fix (#1439) · onboarding score explainer (#1440)
- **Sleep fast-follow (#1433).** The deferred #1430 follow-up, end-to-end (honest "—"
  where a provider doesn't expose a field). MIGRATION `2026-06-26-sleep-detail.sql`
  (**APPLIED + verified live**) adds `sleep_deep/rem/light/awake_min`,
  `sleep_latency_min`, `respiratory_rate`, `sleep_start/end` to `daily_health_snapshot`;
  Oura v2 sync captures them (main nightly sleep only, so naps don't pollute stages);
  `SnapshotPatch` widened (+ `sleep_quality`). **Recovery-readiness score** — pure tested
  `mobile-app/src/services/recoveryReadiness.mjs` (+ `src/lib/recovery-readiness.ts` twin):
  0-100 blend of duration-vs-target / efficiency / RHR & HRV vs a trailing baseline /
  device recovery score, null when nothing to score. Progress + `clients/[id]/shared-overview`
  routes expose the series + a computed `readiness` KPI (both `select('*')` for
  migration-safety). UI: a recovery snippet on the home check-in card + a new mobile
  **`BSSleepHistory`** detail page (readiness ring, stage bar, bed/wake, latency,
  respiratory, sparklines, honest empty states); coach readiness lead + detail on web
  `coachClientDetail.jsx` (`?v=20260626b`) + mobile coach card. **Coach sleep-triage** —
  `dashSignals ruleSleepRecovery` flags `sleep_low` when 7d-avg sleep is >1.5h under
  target (severe; milder shortfalls keep the gentle cross-domain narrative) → directive +
  the coach "who needs you" feed, fed by a one-query RLS-scoped `/api/coach/roster-sleep`.
  Tests: `recovery-readiness` (11) + `dash-sleep-triage` (5). Title later trimmed
  "Your Shape steps." → "Shape steps." Also folded into this branch:
  - **Removed the dead manual sleep-log path** (`POST /api/client/sleep-log` +
    `window.ShapeSleep.log`, retired with BSSleepSheet in #1430).
  - **Fixed `workout_set_logs.actual_*`**: the live-session writer only filled the
    `payload` jsonb, never the `actual_load/actual_reps/rpe/load_unit` COLUMNS the
    train-volume + strength readers read. `normalizeWorkoutSetLog` now populates them at
    write time (free-text/kg-lb parse; `load_unit` NOT NULL → 'lb'); `BSSession` now
    persists the captured RPE + unit; train-route gains a payload fallback; MIGRATION
    `2026-06-26-backfill-workout-set-log-columns.sql` (**APPLIED**) fills historical rows
    (rpe kept NULL when unparseable — a `greatest(0,NULL)=0` fabrication bug was caught + fixed).
- **supabase-js SRI (#1434).** Added `integrity` (sha384) + `crossorigin` to the
  self-hosted `vendor/supabase-js-2.108.2.umd.js` across 54 static tags + the 2 dynamic
  loaders (`pageShell.jsx` SiteSearch + `siteSearch.js`); `?v=` bumped on the referencing
  pages. Closes the #1413 SRI deferral. (Mobile is npm-bundled — out of scope.)
- **Steps / Progress card redesign (#1435).** The Me-page **Shape Steps** card is now a
  `BSPlate` instrument (clipped notch, accent spine, live tick, bigger tabular number,
  goal-hit glow); the **Progress** card is a polished quiet nav card (accent spine, chip
  breadcrumb, padded chevron). Renamed "Steps" → **Shape Steps** on the card + history.
- **Accurate + complete Shape Score legend (#1438).** The "how you earn" legend was
  hardcoded + partly fictional (listed unimplemented earns; no penalties). Replaced with
  the real `score_ledger` catalog on mobile (Points tab) + website `score.jsx` — every
  EARN, a **"Protect your points"** losses section (missed check-in -7 / workout -5 /
  habit streak -2 / commitment -stake, never-shaming, "a coach can waive"), the spend
  link, and the rules (0-floor, -30/wk cap, tier never demotes, spending doesn't lower
  rank). Fixed a dark-on-dark contrast bug on `score.jsx`; `Score.html ?v=15`.
- **Shape Steps → points (#1439).** 5,000 steps = 1 Shape Step = +1 pt; daily goal hit =
  +3 (20k/day anti-farm cap → max +7/day). Pure tested `shapeSteps.mjs` + MIGRATION
  `2026-06-26-step-points.sql` `award_step_points()` (SECURITY DEFINER, auth.uid()-scoped,
  hardcoded rates, credits COMPLETED days idempotently); fired on session resolve via
  `window.ShapeStepPoints.check`; live "N Shape Steps · +N pts" on the card + a real legend row.
  - **CRITICAL FIX — MIGRATION `2026-06-26-score-ledger-dedupe-fix.sql` (APPLIED + verified).**
    `score_ledger_dedupe_idx` was PARTIAL, but every award RPC (goal milestone, momentum,
    tier bonus, PR wall, check-in, community, accountability penalties, commitments, store
    redeem) uses `ON CONFLICT (user_id, source_kind, source_id) DO NOTHING` WITHOUT the
    predicate — Postgres rejects that against a partial index (42P10), so EVERY award would
    error + never credit. Unsurfaced only because no award had fired on real data yet.
    Recreated the index as a PLAIN unique index (NULLs distinct → null-source rows still
    never conflict) so the existing inference works; verified live (42P10 → expected FK).
    `award_step_points` uses the bare `ON CONFLICT DO NOTHING` so it's correct either way.
- **First-launch Shape Score explainer (#1440).** New accounts get a one-time
  **`BSScoreIntro`** full-screen panel on first open (before the app tour): the one-number
  idea, the tier ladder (tier never demotes), the main ways to earn, that consistency/
  momentum compounds, spendable points, and a gentle "protect your points." Gated on a
  new-account window + its own `client_score_intro` seen-flag; the app tour waits until
  the intro is seen so the two never stack.
- Each squash-merged to `main` (branches kept), CI-green (Web · Mobile · gitleaks). The
  sleep branch was reconciled onto main (steps redesign landed first) by rebuilding
  `public/m` from the merged source. War Room: registered `/api/coach/roster-sleep`,
  flipped the sleep fast-follow + backlog tasks (Shape Steps points, legend completeness,
  onboarding explainer) — note the legend/onboarding tasks are now BUILT.

### 2026-06-26 — Sleep-logging redesign (#1430) · uniform header avatars (#1431) · all-time-PR RPC (#1429) · e1RM web parity (#1427) · check-in & grocery polish (#1428)
- **Sleep-logging redesign (#1430, Tier 1).** Daily sleep folded into the home
  **"How are you · today"** check-in card, **device-first**: when a wearable synced sleep
  today the card shows a read-only `Xh Ym · NN% efficient · RHR · HRV` snapshot; otherwise
  **editable** manual-hour chips (reversible, tap-again-to-clear, never falsely labeled
  "Synced from your device"). Always a 1–10 **Rested** tap-row → new
  **`daily_health_snapshot.sleep_quality`** column (migration `2026-06-26-sleep-quality.sql`,
  **APPLIED + verified live**). Saved with energy/hunger via `/api/client/checkin`
  (await + rollback; `sleepHoursOrNull` 0<h≤24 validator). **The dead engine sleep directive
  is revived** — pure, TDD'd `sleepRecoveryFromProgress` (in `signalsMap.mjs`) feeds real
  sleep into `selfRecord`, so signed-in members finally get the recovery lever (it was
  hardcoded `null`). **Coaches see objective sleep** — `/api/clients/[id]/shared-overview`
  returns `sleep` (latest hours + 7-day trend + efficiency/RHR/HRV, RLS-scoped via the
  existing `providers_read_subscriber_snapshots` policy — no extra migration), rendered on
  the web client page (`coachClientDetail.jsx`, reuses `CKTrend`) + the mobile coach profile
  (`iosAppBroadsheetPros.jsx`). **`BSSleepSheet` retired**; the home sleep directive scrolls
  to the card. Built **subagent-driven** (7 TDD tasks, per-task spec+quality reviews + an
  opus whole-branch review). **CodeRabbit/Codex caught + I fixed 3 real bugs** before merge:
  the coach query returned the *oldest* 30 snapshots (now newest-30 then reversed), manual
  sleep was mislabeled "Synced" + locked after reload (now `sleepSynced` is gated on TODAY's
  device-only metrics read per-day from `series.sleepEfficiency`/`restingHr`/`hrv`), and the
  coach overview effect leaked one client's sleep onto the next (now resets + ignores stale
  responses). CodeRabbit **APPROVED**. **Fast-follow (out of scope):** sleep stages
  (deep/REM/light), bed/wake + latency, respiratory rate, a recovery-readiness score, a
  coach sleep-triage rule. *(Note: `window.ShapeSleep.log` + `/api/client/sleep-log` are now
  an uncalled dead path — a follow-up cleanup.)*
- **Uniform top-header avatars (#1431).** The "your own" avatar in each page's top-header
  corner rendered at inconsistent sizes (34 on the 5 main tabs + both coach mastheads, but
  28 on detail/Store pages, 26/30 elsewhere). New single **`BS_HEADER_AVATAR = 34`** constant
  drives `BSSearchCorner`/`BSHeaderTools`/`BSMeCorner` defaults + every per-call override is
  removed; the Terrain/Signal + coach mastheads have their **whole corner cluster** (search ·
  edit pencil · settings gear · self avatar) normalized to 34 so each row stays balanced — so
  the Store + all detail/sub pages now match the main tabs. Every touched avatar still uses
  the self helpers (`bsMyTierColor`/`bsMyInitials`/`bsMyPhoto`) + opens `shape:openProfile`;
  **untouched:** feed/chat/list/facepile avatars, the big profile HERO portraits, the Settings
  identity-card avatar.
- **All-time strength PRs via aggregate RPC (#1429).** `get_my_lift_prs(p_limit)` (migration
  `2026-06-26-my-lift-prs.sql`, applied) so the client Progress PR rows reflect the **all-time**
  best per lift instead of the newest-3000-sets window; kg normalized to lb before ranking;
  PUBLIC execute revoked (`auth.uid()`-scoped, security definer).
- **e1RM web parity (#1427).** Progress-route set cap fixed to keep the **newest** sets (was
  oldest) + e1RM on the client Progress **PR rows** + a **website client Strength page**
  (`DprSpark` sparkline + status pills) — the website now matches the mobile e1RM engine.
- **Check-in & grocery polish (#1428).** Compacted the home check-in card (tap targets kept
  ≥ the WCAG 2.5.8 AA 24px floor) and lightened/modernized the collapsible grocery aisle
  headers (lighter weight, hairline rule, calmer chevron/count).
- All squash-merged to `main` (branches kept); each CI-green (Web · Mobile · gitleaks) +
  CodeRabbit-reviewed; #1430 + #1431 overlapped the two broadsheet files + `public/m`, so the
  second (#1430) was merged into main + its bundle rebuilt fresh before merge.

### 2026-06-26 — Daily check-in + hydration (#1422) · title-font unify + full-page goal sheets (#1423) · home compaction + bigger steps numbers (#1424) · collapsible grocery aisles (#1425)
- **Daily wellness cards (#1422).** Two home cards: **`BSDailyCheckinCard`**
  ("How are you · today" — Energy + Hunger 1–10 tap-rows, once/day →
  `daily_health_snapshot.energy`/`hunger` via `/api/client/checkin`, now
  energy/hunger-aware) and **`BSHydrationCard`** ("Hydration · today" — bar toward
  `hydration_target_l` + **+250 / +500 ml** (or +8/+16 oz) quick-add + undo) via the
  **new `GET/POST /api/client/hydration`** (signed delta clamped ≥0). **Migration
  `2026-06-25-daily-energy-hunger.sql`** (energy/hunger smallint, 1–10 CHECK) —
  **APPLIED + verified live.** Review-hardened (Codex P1+P2 + 6 CodeRabbit Major):
  checkin route now ignores null fields (was coercing `null`→1, writing a rating
  never set); hydration `deltaL` validated (JSON number within ±2 L); snapshot
  read-errors surfaced (no fabricated `0`); `addHydration` throws on failure +
  invalidates only after success; both cards await the write, roll back on failure,
  ignore stale responses, and lock taps in-flight (closes the single-user
  lost-update window); check-in flips to "logged" only after the write; signed-out
  preview nudges to join instead of faking "logged ✓". CodeRabbit **APPROVED**.
- **Title font unified to Space Grotesk (#1423).** Every page/card **title** now
  uses `t.DISPLAY` (Space Grotesk — the chat "Community" header font) instead of the
  hardcoded `'Newsreader'` serif: the 12 client `SERIF` consts + the 7 coach
  mastheads. **Left serif on purpose:** the **home page**, the splash/auth branding,
  the rotated SHAPE watermark, and the official-chat italic bubble. Both **goal edit
  sheets** (`BSOverallEditSheet` + the primary-goal picker) became **full-page**
  title-page panels — masthead + hero title, hidden scrollbars (`.bs-hide-scroll`),
  hidden number steppers (`.bs-no-spin`), accent focus rings (`.bs-field` +
  `--bs-accent`), squared fields/chips, clipped Save CTA. Review fixes: raw-string
  decimal entry (coerce on save) + a NaN guard before `onSave`.
- **Home compaction + bigger steps numbers (#1424).** Tightened the home agenda
  plates (Today/Meals/Workout), the Habits plate, and the check-in + hydration cards
  (less padding/margins/row-height; title 21→19, directive 24→22) — denser, hierarchy
  unchanged. Enlarged the steps-history ring-calendar numbers (month value 7→9.5,
  in-ring day 8→10, 3-month avg 13→15). Review fix: the 1–10 selectors keep a slim
  16px look but a comfortable 30px tap area (transparent button wrapping the bar).
- **Collapsible grocery aisles (#1425).** `BSGrocery` aisles are now dropdowns —
  multi-aisle lists start as a compact index (chevron + aisle + `done/total`), tap a
  header to expand; single-aisle lists (recipe lists) open by default; **Expand /
  Collapse all** + auto-expand the aisle an item lands in (typed or voice). An
  87-item weekly plan collapses to ~5 header rows with Send-to-Instacart in view.
  CodeRabbit **APPROVED**.
- All four squash-merged to `main` (branches kept); each CI-green (Web · Mobile ·
  gitleaks) + CodeRabbit-reviewed; previewed in a headless browser before shipping.

### 2026-06-25 — e1RM (estimated 1-rep max) + strength progression engine (#1420 · #1421 merged)
- **Roadmap #2.** Turns logged sets into an estimated 1-rep max (Epley `load×(1+reps/30)`)
  per lift + a **Progressing / Holding / Stalled / Building** verdict.
- **Phase 1 — analytics engine (#1420, MERGED to `main`).**
  - Pure tested **`mobile-app/src/services/e1rm.mjs`** (source of truth) + TS twin
    `src/lib/e1rm.ts` (`epleyE1rm`, `buildLiftSeries`, `progressionStatus`, `summarizeLift`;
    reps-cap 12, ±2% deadband, 3-week stall). Vectors in `tests/e1rm.test.mjs`.
  - New RLS-scoped **`GET /api/client/strength`** (session-only, membership-gated by the
    `/api/client` proxy prefix) → per-lift e1RM + status + trend; `window.ShapeStrength`
    client helper (shared 60s cache).
  - e1RM threaded onto the **Overall-tab PR rows** (`/api/client/progress`).
  - **Mobile Strength instrument page** (`BSStrengthHistory` + `BSStrengthCard` in
    `iosAppBroadsheetClient.jsx`) — status pills, e1RM trend sparkline, top-set readout,
    honest empty/"building" states; tappable PR rows.
  - **Coach e1RM** on key-lift rows (mobile `iosAppBroadsheetPros.jsx` + web
    `coachClientDetail.jsx`) via **migration `2026-06-25-client-lifts-e1rm.sql`**
    (widens the `SECURITY DEFINER` `get_client_lifts` with `e1rm`; gate + search_path
    preserved). **APPLIED to prod** (re-run twice for the review fixes below).
  - ⚠️ **Key data learning:** the in-app live-session writer (`normalizeWorkoutSetLog`)
    stores the athlete's actual load/reps/rpe inside **`workout_set_logs.payload`**
    (`actualLoad`/`actualReps`/`rpe`) and **never populates the `actual_load`/`actual_reps`/
    `rpe` columns**. So the route + SQL read **payload first, column fallback** (treating a
    `0` column as missing), and mirror the same payload aliases on both sides for
    coach⇄client parity. Review also fixed: newest-first set cap (was keeping the oldest
    5000), auth outside the fail-soft `try`, SQL excludes incomplete sets.
  - Reviewed subagent-driven (per-task + whole-branch + `/security-review` clean bill);
    **CodeRabbit-approved**; CI green; squash-merged as `dc9510a4`.
- **Phase 2 — prescriptive next-load (#1421, IN PR).** Pure tested
  **`suggestNextLoad.mjs`** (autoregulate off the last session by RPE → bump/hold, e1RM
  sanity-bound at 1.05×, %-of-e1RM + repeat fallbacks) surfaced as a **tap-to-fill chip in
  the live session player** (`BSSession`), consuming `window.ShapeStrength`. Client-only —
  **no endpoint, no migration.** Reviewed per-task + whole-branch (Ready to merge).
- **Pre-existing bug flagged (separate follow-up):** because the app never writes the
  `actual_*` columns, **train-volume + the progress strength-series read empty columns at
  the source** (the e1RM routes now read payload, but the older readers don't). Root fix =
  populate `actual_load`/`actual_reps`/`rpe`/`load_unit` columns in `normalizeWorkoutSetLog`
  at write time.

### 2026-06-25 — Daily steps / NEAT: device-synced steps + ring-instrument history (#1415)
- **New display-only daily-steps feature** (NEAT). Steps come from a connected watch
  (Apple Health / Garmin sync) — never manual entry, since a person can't know their own
  count. **Migration `2026-06-25-daily-steps.sql`** (`daily_health_snapshot.steps integer`,
  idempotent) — **APPLIED to prod**.
- **Backend wiring**: `steps` → `SnapshotPatch` (`health-snapshot.ts`); Apple Health sync
  `ALLOWED_FIELDS` (normalized to a **non-negative integer** in `cleanPatch`); Garmin
  webhook dailies mapping (**rejects negative** totals); progress route `series.steps` +
  `stepsLatest`/`stepsAvg` KPIs. `steps` registered in the source-reconcile `METRICS`
  (`reconcile.mjs`) so INT2 can reconcile multi-source conflicts. The progress snapshot
  query uses `select('*')` (migration-safe — PostgREST 400s an unknown explicit column).
- **Mobile (`iosAppBroadsheetClient.jsx`)**:
  - **`BSStepsCard`** (Me page) — today's count vs goal (honest `—` until today syncs;
    "Connect a watch" only when nothing's ever synced); taps into history (keyboard-activatable).
  - **`BSStepsHistory`** — a tier-colored **ring instrument**: hero gauge (today) + **Week**
    (vertical day-list: ring + a bar filling toward goal + an `actual / goal` readout) +
    **Month** & **3-Month** ring calendars. Rings fill to the user's Shape Score tier color
    only at goal. **Calendar-correct windows** — the stat row matches the rendered rows,
    missed-sync days are honest gaps, and "today" is today's date (not the last sample).
  - **Editable custom goal** — a typeable editor (stepper + 6k–15k presets), persisted to
    localStorage + `user_goals('client_step_goal')` (cross-device, dedicated key — no clobber;
    a session edit wins over a late cloud hydrate). Card + history read one shared value;
    ring fills, %, "to go", and goal-hits all recompute against it.
  - **"Alive" ring treatment** (designed via a multi-agent design+review pass): staggered
    one-shot draw-in; a tier-colored **breathing glow on every completed ring** (a circular
    CSS `box-shadow` — follows the border-radius so **no square filter-region clip**;
    GPU-composited transform/opacity only, so the 30-ring month grid stays smooth); the hero
    gets an **avatar-style pulsing outer ring** + a **glow when filled**. Honors
    `prefers-reduced-motion`.
  - Standard page nav bar on the steps page (SHAPE logo + `Vol. 1 · No. 1` + search + tier
    avatar, wired) + centered range tabs.
- **Review stack** (CodeRabbit + Codex, two rounds): fixed every Critical/Major — honest `—`
  vs fabricated 0, non-negative-int step validation (Apple + Garmin), migration-safe query,
  Week stats matching the rendered Mon–Sun rows, the goal-hydrate race, history-button
  keyboard a11y, reconcile METRICS. Verified: JSX parse · `tsc` · mobile build + `public/m`
  sync · all 3 required CI checks green; iterated on `staging` (~12 previews) before merge.
- Shipped as **#1415** (squash-merged to `main`, branch kept). Separately, **#1416**
  added the product-strategy analysis + coach-acquisition marketing docs (`PRODUCT-STRATEGY.md`,
  `marketing/coach-acquisition-campaign-plan.md`, `marketing/coach-outreach-email-sequence.md`;
  review fixes: per-track signup URLs, conditional founding-perk copy, send-day calendar
  alignment, illustrative-projection disclaimer).

### 2026-06-25 — Profile activity cards: full engagement parity (detail · send · likers · comments wired)
- The profile **"Personal activities"** cards (member Terrain + coach Signal) were visual-only for
  the deep interactions — **Session details / Full activity / Comment / Send / the liker list** all
  toasted "open in the community feed for the full view" (the deferred slim-fallback from #1406).
  Now they're fully wired and behave EXACTLY like the community feed: tapping opens the real
  **`BSActivityDetail`** page, the **send-to-DM** picker (`BSPostSendSheet`), and the **"who reacted"**
  sheet, and inline comments persist. (Reactions/SPOT · Share · Repost already worked.)
- New shared **`BSCardSheetHost`** component + **`useBSCardSheets`** hook host the three sheets +
  comment state in ONE place; both profiles call the hook (placed with the other hooks, before the
  sub-view early returns → rules-of-hooks safe) and render via
  `renderSheets({ applyReaction, setOpenProfile, actLikes, actExpr })`, spreading the rest into the
  card ctx. The `slimOpen` toast stubs are removed (verified absent from the shipped `public/m` bundle).
- Verified: JSX parse-check + mobile build clean; slim-fallback toast gone from bundle + source; no JS
  errors. The community feed (`BSClientFeed`) keeps its own inline sheet blocks unchanged (no regression).
- **Merged as #1408.** CodeRabbit caught + I fixed a **Critical**: `sendActComment` inherited the feed's
  "treat `key` as a fallback `postId`" heuristic, but the profile's demo cards carry synthetic keys
  (`it-*`/`act-*`) → a comment on a demo card would `addComment({ postId: 'it-0' })` against a
  non-existent id. Dropped the fallback — profile persists only on a real explicit `postId`; demo-card
  comments stay local-only. CodeRabbit **APPROVED** after the fix; CI green.

### 2026-06-24 — War Room audit: 4 "looks done" items verified — 2 are genuinely incomplete
Verified four unchecked War Room items (multi-agent: repo code + **live Supabase** + GitHub API).
**Do not check these off as-is** — accurate status below.
- **Funnel analytics — NOT done (mobile event wiring is broken).** The migration **IS applied
  live** (`analytics_events` + `track_event` + `get_funnel` confirmed on prod, service-role-only
  grants — **no owner DB action needed**); the panel + purge cron are real. BUT the "5
  consent-gated events" claim is **false**: `mobile-app/src/services/analytics.js:18` does
  `window.ShapeAnalytics = window.ShapeAnalytics || { track }`, and `shapeBackend.js:3336` already
  set `window.ShapeAnalytics = { get, getProgress }`, so the `||` short-circuits and **`.track`
  never attaches** — the 4 mobile events (workout_started / onboarding_started / paywall_viewed /
  app_opened) silently no-op (confirmed in the built bundle); only the server-side
  `checkout_started` lands, and nothing client-side is consent-gated. Doc bugs: purge cron is
  **daily 03:30 UTC** (entry below says hourly); the cohort breakout is **day-range only** (not
  acquisition-source/coach-role). **✅ FIXED (this change):** `services/analytics.js` now MERGES
  `track` onto `window.ShapeAnalytics` (and `shapeBackend.js:3336` merges instead of replacing —
  order-independent), so the 4 mobile events emit; the mobile carrier is now **consent-gated,
  region-aware** — GPC + an explicit `shape.consent.v1` opt-out always block; with no choice yet it
  **opt-INs for EEA/UK** (blocked until `accept` — the app has no mobile consent banner, so EEA
  first-run is never tracked) and opt-OUTs elsewhere, mirroring the web shell's `Europe/*` EEA
  detection (addresses a Codex review finding). Mobile rebuilt + `public/m` resynced. Remaining
  (optional): the migration is live but unrecorded in `schema_migrations` — backfill if you want
  the ledger clean; a proper mobile consent banner would let EEA opt in.
- **Secret scan (gitleaks) required check — NOT done; `main` has NO branch protection at all.**
  Classic protection is off; the 2 active rulesets ("Required Checks", "Updated Security") have
  **empty branch targeting** (`include: []` → match nothing) and **neither contains a
  `required_status_checks` rule** — `GET /repos/.../rules/branches/main` returns 0 rules. So
  gitleaks AND Web + Mobile run on PRs but are **advisory, not required**. ⚠ The "required checks
  gate `main`" claim in "How we work → Review stack" is therefore **inaccurate** — merges are not
  check-gated today. **✅ FIXED (this change):** enabled **classic branch protection** on `main`
  requiring `Web (typecheck + build)` · `Mobile (build + public/m sync)` · `Secret scan (gitleaks)`
  (strict=false, **enforce_admins=true** — genuinely gates everyone incl. admins, since it's a
  solo-admin repo). Merging on red is now actually impossible; emergency override = toggle off
  "Include administrators" in Settings → Branches. (The two empty-targeted rulesets are left as-is.)
- **Supabase Auth rate limits — app side DONE, dashboard owner-only.** The `/api/*` limiter +
  `rate_limits` table + `check_rate_limit` RPC are live (RPC probe OK). But that guards only OUR
  `/api/*` routes — NOT Supabase's native auth endpoints (signup/OTP/token) the SDK calls
  directly. The real GoTrue limits (otp 60 / verify 100 / email_sent 30 / anonymous_users 5 /
  token_refresh ~1800) are Management-API/dashboard config, **not readable via the MCP tools** —
  owner must confirm/set in Auth → Rate Limits (`zznufekgjngecelwxndw`). **✅ RESOLVED — owner set
  the dashboard values 2026-06-25.**
- **Auth CAPTCHA — app side DONE (checklist text is STALE), dashboard owner-only.** The
  login/signup Turnstile wiring IS complete across web (`login.jsx`), mobile (`turnstile.js` +
  BSLogin), Next (`Turnstile.tsx` + login actions), and consultation — contradicting the
  `src/lib/warroom.ts` "login/signup client wiring is a follow-up" note (should be updated).
  Remaining: owner enables CAPTCHA in Auth → Settings + pastes the Turnstile secret + sets
  `TURNSTILE_SECRET_KEY` env (else `verifyTurnstile` no-ops). Native caveat: add
  `capacitor://localhost` to the Turnstile widget's allowed hostnames or native logins get rejected.
  **✅ RESOLVED — owner enabled CAPTCHA 2026-06-25; the stale warroom.ts label corrected in #1409.**
- **Net (RESOLVED 2026-06-25):** all four done — funnel mobile fix shipped (**#1407**), `main` branch
  protection enabled (**gitleaks + Web + Mobile required**, enforce_admins on), and the owner set the
  Auth rate-limit values + enabled CAPTCHA. All four flipped to `done` in `src/lib/warroom.ts` (**#1409**).

### 2026-06-24 — Mobile: profile ⇄ community activity cards unified (#1406) + profile & chat redesigns (#1404, #1405)
- **Activity cards unified (#1406).** The profile **"Personal activities"** feed now renders the
  SAME rich card as the community chat feed. Extracted the community `ActivityCard` to a
  module-level **`BSActivityCard({ a, ctx, hideAuthor })`** (community render verified
  behavior-identical: author header · tier pill · co-sign · session-details · reaction verb).
  The profile feeds it via `bsProfileCardFromPost` + the `itToCard`/`tupleToCard` demo adapters,
  with **slim fallbacks** for the deep interaction surfaces (session-details / liker / send sheets
  defer to the community feed via a toast). Per-card author header dropped on the profile (the
  hero already identifies the person).
  - **Review-stack fixes folded in** (CodeRabbit + Codex, 4 rounds; CodeRabbit **APPROVED**, CI
    green): persist the long-press reaction word on both profiles (`actExpr` state + handler);
    **gate demo activity for ALL signed-in profile views** — own *and* others' — so fabricated
    field-notes are the signed-out preview only (honest-data; a signed-in view of any real profile
    shows only that person's real `listByAuthor` posts, a demo persona shows "No activity yet.");
    filter plain community/chat posts to `null` (no junk Note cards on the profile); preserve +
    render media (photo / video / link); restore the owner **✎ edit** via `ctx.onEdit`; normalize
    the comment count (`text || body`, body-only comments preserved).
  - Also fixed: the **Team sub-tab nav-gap** (7px to match Feed) and the profile **PR-card title**
    ("Back squat — new PR" — `itToCard` now extracts the lift from the demo tuple).
- **#1404 — profile instrument-plate redesign** (hero redesign; removed the "Today's move" box;
  thinned the profile name font). **#1405 — chat sub-tab auto-hide-on-scroll + bracket-frame
  sub-tab chips + thinner tier hairline.**
- Branch `feat/unify-activity-cards` **kept** (not deleted) per the new keep-branches convention
  (post-merge cleanup is now: squash-merge → fast-forward `main` non-destructively; no branch delete).

### 2026-06-23 — Funnel analytics ("find the biggest drop-off")
- **Computed 7-step funnel** — signup → onboarding → first workout → first nutrition → paid → day 30 / 90 retention — sourced from event patterns in the product (milestone tables + milestones on `score_ledger`).
- **Thin `analytics_events` table** — user_id + event name + minimal context properties, consent/GPC-gated at `/api/analytics/track` (client route). The 5 gap events from the funnel are consent-gated on the mobile app (same carrier as other telemetry).
- **War Room "Funnel & drop-off" admin panel** — real-time computed 7-step funnel with biggest-drop highlighted (red severity badge), per-cohort breakout (acquisition source/coach role/day-range), and drill-down to per-user cohorts. Admin-only read via `get_funnel` RPC (service-role compute).
- **12-month retention + daily purge** — `/api/cron/analytics-purge` (CRON_SECRET-gated) runs hourly, purges events >12 months; backups age out in 90 days. No alerts; silent no-op when events are absent.
- **⚠ OWNER ACTION: run `supabase-migrations/2026-06-23-analytics-events.sql`** (the table + RPC + cron schedule); code degrades to an empty funnel (no crash) until applied. Docs: `docs/legal/data-retention-schedule.md` row, `docs/legal/ropa.md` section 3.9 (legitimate interests, admin-only, GPC-honored), `docs/WORKLOG.md` (this entry).

### 2026-06-23 — Supabase Pro upgrade · War Room refresh · legal/standalone pages → canonical nav + footer + live search
- **Supabase Pro** (org "Shape", upgraded 2026-06-23) unblocked two previously Free-gated,
  deferred items. **Leaked-password protection** (HaveIBeenPwned) is now **ENABLED** (Auth →
  Attack Protection) — verified by the `auth_leaked_password_protection` security advisor
  clearing. **Supabase branch databases** (an isolated DB per staging/preview branch instead
  of sharing production) are now available. Both War Room items updated; the staging caveat updated.
- **War Room checklist refresh** (`src/lib/warroom.ts`): audited every `manual`/`pending`
  item against this changelog + the repo and **checked off ~19 that were actually done** —
  the migrations the WORKLOG records as APPLIED (notifications/push_tokens/activities,
  store-redemptions+fulfillment, client-program-detail, user_goals, goal-milestone-points,
  weigh-in-body-fat, client-goals-coach-read + client-weigh-ins, checkin-kit, universal-search,
  member-playlists, usernames, channels, meal-notes bucket, community-photos, user_follows,
  follow-requests, public-profile visibility/avatar) + the notifications→push DB webhook
  (verified 200 end-to-end), and leaked-password protection once enabled. **255 done /
  10 pending / 24 manual.** The rest are genuine
  externals: native iOS/Android builds, Garmin/Spotify approvals, owner dashboard toggles
  (Auth rate limits, CAPTCHA enable, leaked-password, Connect activation, gitleaks required
  check), and counsel reviews.
- **Legal + standalone pages now match the canonical site.** Every footer carries the new
  legal pages (Code of conduct · Data & compliance · Consumer health data · Subprocessors);
  the 6 legal pages + `contact` + `help` use the **canonical nav** (teal logo, lowercase tabs,
  search circle, outlined Get-started, SHAPE▸Radio wordmark) and a **dark footer matching the
  page** (single rule — the earlier double-line removed). Merged as **#1396** (footers) +
  **#1397** (legal nav).
- **Live site search works everywhere + facet avatars** (PR **#1398**). pageShell's `SiteSearch`
  now **lazy-loads the Supabase client** — only 15/76 newdesign pages loaded `supabase.js`, so
  search was dead on the rest — and results render the **facet gem avatar** (tier gradient,
  photo/initials) instead of a circle. New `public/newdesign/siteSearch.js` brings the same
  overlay (`search_shape_people` RPC + Nora concierge hit, XSS-escaped, lazy-loads Supabase) to
  the standalone legal/contact/help pages. Legacy pre-`newdesign` root pages left alone (pending
  retirement). `pageShell.jsx?v=20260623b`.

### 2026-06-22 — Code of Conduct + strengthened ToS ban/enforcement rules (web + app)
- Closes the **ToS-ban-rules follow-up** (raised during compliance Wave 3). Shape's Terms
  Sec 12 already granted removal rights for 14 enumerated violations but referenced a
  "code of conduct" that didn't exist; this builds the enforcement framework around it.
- **New standalone `public/code-of-conduct.html`** (house style, 8 sections): who it applies
  to + how it's incorporated into the Terms · community standards for everyone · coaches'
  professional conduct (higher bar — credentials, scope, client safety/boundaries, deliver
  what you sell, no off-platform fee-dodging, protect client data, no medical claims) ·
  clients' conduct · safety (not an emergency service; no dangerous/illegal advice; 18+) ·
  reporting & moderation (how to report, how we review — evidence + proportionality, possible
  outcomes) · enforcement & ban tiers · a living-document/counsel closer.
- **terms.html Sec 12 strengthened**: replaced the one-line "Process" para with a tiered
  enforcement model — **warning → temporary suspension/restriction → permanent removal**
  (proportionate) — plus a **zero-tolerance immediate-removal list** (threats/violence, sexual
  misconduct/minors, fraud, illegal/controlled substances, endangering safety, credential
  fraud, serious security abuse), a **coach higher-bar** clause, and a **no-ban-evasion /
  re-registration** clause. **Sec 5** now incorporates the Code of Conduct by reference.
- **Web↔app parity**: app `BSTermsPage` (shared by client + coach apps) gets a new "Code of
  Conduct" summary entry + a rewritten Termination summary (tiers, immediate bans, no
  re-registration, appeals). CoC linked from all legal-page footers (terms/privacy/
  data-compliance/health-data-privacy/subprocessors) + Sec 5 + Sec 12.
- **Drafted via a multi-agent workflow** (3 parallel drafters + an adversarial legal-consistency
  reviewer). Applied the review fixes: single canonical Termination block, **softened the
  ban-evasion language** (dropped a device-fingerprinting claim the Privacy Policy doesn't
  disclose — limited to email/payment), merged out the redundant old "Process" paragraph, and
  added the Sec 5 incorporation. All copy is **DRAFT pending legal/privacy counsel** before launch.
- Verified: HTML tag-balance on the new + edited pages; mobile JSX parse-check; tsc (warroom).
  Standalone legal pages have no `?v=` companion; the app change rebuilds `public/m`.
- **MERGED as PR #1385** (CI + gitleaks + CodeRabbit + Codex green). CodeRabbit's one
  substantive finding — the legal-page nav dropdowns were mouse-only — was fixed by opening
  them on `:focus-within` as well as `:hover` (keyboard-accessible) across code-of-conduct /
  terms / privacy / data-compliance. (Skipped its WORKLOG MD022 nit — the changelog uses tight
  heading→bullet formatting by design.) Still DRAFT pending counsel before launch.

### 2026-06-22 — Landing journey: Score counter climbs slower with scroll (follow-up)
- Follow-up to the editorial-landing Score count-up: even with the ease-in (#1382), the number
  rose too fast because an ease only redistributes the climb within a fixed scroll budget.
  Increased the pinned journey track height **`1000vh → 1500vh`** (`index.html` `.jtrack`) so each
  stage — including the Score count-up — spans ~50% more scroll; the number now climbs noticeably
  slower as you scroll. Desktop only (the mobile journey is static `height:auto`); the quadratic
  ease-in is kept. Merged as PR #1386. *(If only the Score stage should slow while the other
  beats keep pace, that's a non-uniform stage-weighting change — a follow-up if wanted.)*

### 2026-06-22 — Grocery list: web redesign ported from the app (ClientGrocery.html)
- Brought the **mobile grocery redesign** (#1372) to the **website** grocery page so the two
  match — the list is the hero, slimmer chrome:
  - **Dropped the `TO BUY / HAVE / ALL` view filter** — every aisle now renders inline in one
    scroll (checked items just dim + strike through), so the checklist is the primary surface
    instead of being gated behind a buy/have toggle. Kept the search box (slimmed, full-width).
  - **Slim one-line progress strip** — `{got}/{total} got · ~$X to go · {pct}%` + a thin fill
    bar, above the list (replaces the heavy filter-pill row).
  - **Unified action bar** — the Send-to-Instacart card now also carries **Save a copy**
    (turns a read-only nutritionist plan into your own editable list, or duplicates a custom
    one) + **Share** (native share sheet / clipboard), matching the app's one-bar layout. The
    web-only "combine multiple lists into one Instacart batch" feature is preserved.
- ClientGrocery.html renders `ClientGroceryPage` inline (it's a standalone page reached via
  the Nutrition→Grocery tab; `ClientApp.html` has no grocery tab), so no `?v=` bump needed.
  Removed the now-dead `FilterPill` component + `filter`/`toBuyCount` state. Inline-babel
  parse-check clean. Closes the grocery-web-port follow-up.

### 2026-06-22 — Compliance Waves 3+4 MERGED + migrations applied · review pass · logo cleanup
- **PR #1381 (Waves 3 + 4) squash-merged to `main`** (`651af508`). The **three migrations
  are APPLIED + verified on Supabase** (`consent_log` table w/ 2 owner policies ·
  `account_deletions` table RLS-on/0-policies = service-role-only deny-all ·
  `profiles.date_of_birth`/`over_18` + `set_over_18()` trigger). Security advisors after:
  **0 ERROR** (the `account_deletions` no-policy + `set_over_18` search-path WARN are both
  by-design). So Waves 3+4 are live end-to-end (legal docs are still DRAFT pending counsel).
- **Full review stack ran** (CodeRabbit + Codex). Substantive findings addressed across 3
  fix commits before merge: deletion now also purges the `coach-credentials` bucket + the
  coach's `owner_id` rows (verified safe — none cascade from `auth.users`, none have inbound
  FKs); deletion paginates the storage purge + requires the auth-user delete for an `ok:true`
  (no "deleted" on a data-only purge); **18+ age gate hardened** (email `signUp` now *requires*
  a valid DOB; phone account-creation tied to create-mode via `shouldCreateUser:isCreate`,
  so creation always carries a DOB); GPC opt-out logged **per-user, only after a confirmed
  insert**; export fetched with `cache:"no-store"` + double-submit guards; `privacy-request`
  now 500s when the rights email can't be delivered (was a silent false-success);
  privacy-request `<noscript>` + ARIA live region. Deliberately **kept service-role for the
  deletion route** (7 purged tables incl. `user_goals`/health profile have no user DELETE
  policy → an RLS client would silently fail to erase the most sensitive data) — documented.
- **Logo case-collision resolved.** The repo tracked `public/SHAPE-logo-white.png` (the real
  203 KB wordmark, referenced by nothing) AND `public/shape-logo-white.png` (a ~4 KB blank
  placeholder, referenced by `radio.jsx`'s footer CTA) — two paths differing only by case, so
  Windows showed a perpetual phantom "modified". Consolidated to one canonical
  `public/shape-logo-white.png` holding the real wordmark + removed the uppercase duplicate.
  Fixes the collision **and** the previously-blank radio-footer CTA logo.

### 2026-06-22 — Global data-privacy compliance: Waves 3 + 4 (mechanisms + counsel docs)
- **Makes Shape operable globally + in California** end-to-end. Built on Waves 1–2 (the
  public + in-app legal docs: privacy.html · terms.html · data-compliance.html ·
  subprocessors.html · health-data-privacy.html [WA My Health My Data Act] + the in-app
  BSPrivacyPage/BSDataCompliancePage; canonical spec `docs/legal/compliance-spec.md`).
  Waves 3 + 4 add the **working rights mechanisms** + the **counsel-review document set**,
  shipped together as **ONE PR** (`compliance/wave3-mechanisms`) through the full review
  stack. **⚠ Attorney + privacy-counsel review required before launch** — every legal doc
  is marked DRAFT/illustrative.
- **Data EXPORT** — `GET /api/account/export` (#1380, merged earlier; hardened over 4
  CodeRabbit/Codex rounds): RLS-scoped, recursive `scrub()` strips `*token/*secret/*key/
  *credential/^password` at every nesting level; correct owned-table list + chat history;
  blob download. Wired everywhere: client Settings (`clientMeSettings.exportData`), **coach
  Danger-zone** (`dashProfileExtras` → "Export my data", new this PR), and mobile
  BSDataCompliancePage.
- **Data DELETION** — `POST /api/account/delete`: `currentUser` + `createAdminClient`,
  purges the user's owned rows across ~20 tables + 4 storage buckets
  (progress-photos/community-photos/meal-notes/coach-media), writes an `account_deletions`
  audit row, then `auth.admin.deleteUser`. **Preserves Stripe/tax records** (authoritative
  in Stripe). Type-`DELETE` confirm on web (client + **coach**, new this PR) + mobile.
- **Privacy RIGHTS intake** — public webform `public/privacy-request.html` (access · delete ·
  correct · portability · opt-out · limit-sensitive · withdraw-consent · appeal · authorized
  agent) → `POST /api/privacy-request` → emails `PRIVACY_EMAIL` (default
  privacy@theshapecommunity.com) via `sendEmail`. Linked from privacy.html +
  health-data-privacy.html.
- **GPC** — `src/lib/gpc.ts` `gpcOptOut(request)` reads `sec-gpc:1`; middleware forwards
  `x-gpc-optout`; `pageShell.jsx` consent IIFE honors `navigator.globalPrivacyControl`.
  Shape doesn't sell/share so functionally a no-op, but detected server + client + recorded.
- **Region-aware consent banner** — `pageShell.jsx` `shapeConsent()` IIFE (EEA via `Europe/*`
  timezone, GPC honor, `consent_log` insert, safe DOM — no innerHTML). `?v=20260622b` across
  69 loaders.
- **18+ age gate** at signup — mobile `BSLogin` DOB field ("Shape is 18+") + 18+ validation
  (throws `under_18`); `shapeBackend.signUp` writes `date_of_birth` metadata;
  `2026-06-22-age-verification.sql` adds `date_of_birth`/`over_18` cols + `set_over_18()`
  trigger.
- **Migrations** (idempotent, RLS) — ⚠ **OWNER: run on Supabase**:
  `2026-06-22-consent-log.sql` (append-only owner-RLS), `2026-06-22-age-verification.sql`,
  `2026-06-22-account-deletions.sql` (service-role only). Code no-ops until applied.
- **Wave 4 counsel docs** (`docs/legal/`, all "DRAFT — for privacy counsel"): `ropa.md`
  (Art.30) · `dpia.md` (Art.35) · `transfer-impact-assessment.md` (SCCs/DPF) ·
  `dpa-subprocessor-checklist.md` · `incident-response-plan.md` · `data-retention-schedule.md`
  · `legitimate-interests-assessment.md` · `accessibility-and-pci-notes.md` (WCAG/SAQ A).
- **Doc wording flipped live** (the previously hedged "rolling out" lines): privacy.html ×3
  (export/delete in Settings, rights form link, consent banner), health-data-privacy.html ×2
  (withdraw-consent + rights form), app BSPrivacyPage item '08' (export/delete in Settings →
  Privacy & data; recognizes GPC) — removing the over-claims CodeRabbit flagged on #1379.
- **War Room**: registered `/api/account/delete` + `/api/privacy-request`; added a full
  "Data privacy & global compliance" checklist section (incl. OWNER/counsel launch gates) +
  the two deferred follow-ups: **ToS strict ban rules + Code of Conduct** (terms.html Sec 12
  has the base Termination clause) and the **grocery-list web port** of the 06-22 mobile
  redesign.
- `dashProfileExtras.jsx?v=20260622a` (4 loaders). privacy.html / health-data-privacy.html
  are standalone root pages (no `?v=` companion). Verified: tsc · web + mobile JSX
  parse-checks · mobile build + `public/m` resync.

### 2026-06-22 — Dashboard pages: top gap + masthead aligns with the sidebar "Today" tab
- The dashboard mains had **zero top padding** (`padding: "0 …px 80px"`), so the page
  masthead (date eyebrow + greeting/title) butted right up under the fixed header while the
  sidebar's first nav item ("Today") sat ~23px lower (aside 12px + link 11px). The content
  read as cramped and misaligned with the nav.
- Gave every dashboard `<main>` a **24px top padding** so the masthead's first line lines up
  with the "Today" tab and there's a comfortable gap below the header. Applied to all three
  shared shells, so it's uniform across **all profiles and all dashboard pages**:
  `dashClient.jsx` (client Today) + `trainerDashboard.jsx` `DashPage` (every tab page —
  Progress/Workouts/Nutrition/Library/Team/Community/Score/Habits/Goal · coach
  Schedule/Clients/Programs/Business) + `DashShell` (coach Today). The Profile/Me page
  (`livingProfilePage.jsx`) is intentionally left edge-to-edge — it renders the immersive
  living profile with its own full-bleed `LV_BG` background (a top gap there would show a
  seam of dashboard paper above the hero).
- Verified in a headless browser (client Today at 1440px): the "MONDAY, JUN 22" eyebrow now
  aligns with the "Today" tab. `trainerDashboard.jsx?v=20260622a` (44 loaders) +
  `dashClient.jsx?v=20260622a` (8 loaders) bumped.

### 2026-06-22 — Remove the redundant signed-in "Radio" nav link
- The signed-in top nav (`pageShell.jsx` `PORTAL_NAV`) carried a left-nav **Radio**
  tab (`Radio.html`) that duplicated the **SHAPE ▸ RADIO** wordmark link already in the
  header on the right (rendered for both signed-in and signed-out states). Removed the
  `Radio` item from all three role navs (client / trainer / nutritionist) — the right-side
  wordmark is the single radio entry point now; signed-out marketing nav is unchanged, and
  the footer Product "Radio" link stays.
- `pageShell.jsx?v=20260622` bumped across the 69 loader pages.

### 2026-06-22 — Mobile grocery redesign: checklist is the hero (less cluttered, more prominent) (#1372)
- Reworked the mobile **grocery list** (`BSGrocery`, `iosAppBroadsheetClient.jsx`) per the
  approved direction — the list itself is now the hero, the chrome is slimmed:
  - **Source chip → a slim "List name ▾" selector** (colored dot + list name + item count
    + ▾ on a hairline). Same list picker on tap; the big kind-label box is gone.
  - **Heavy progress plate → a slim one-line strip** — dropped the SVG ring + 3 stacked
    buttons for `{done}/{total} got · ~$X to go` + a thin fill line + `%`.
  - **Aisle-tab filter → inline all-aisle checklist** — instead of one aisle at a time
    behind a scrollable pill row, every aisle renders inline as a section header in one
    scroll (struck-through + dimmed when its items are all checked). The checklist fills
    the screen as the primary surface.
  - **One bottom action bar** — Send to Instacart (primary) + Save to library + Share,
    consolidated from the old progress card (the actions moved, none were lost).
  - **Add-item form kept** (type one, or speak the whole list via `/api/nutrition/voice`).
  - Removed the now-dead `activeAisle`/`setActiveAisle`/`resetAisle` state + the `RR`/`RC`
    progress-ring constants.
- **Home — a compact "Shop list" card** (teal `BSPlate`, under the habits plate) deep-links
  straight to the grocery list: it sets a `window.__bsPendingGrocery` flag then opens the
  Eat tab, and `BSClientEat` switches to the grocery view on mount (covers the unmounted-tab
  case; the Eat tab isn't kept mounted). So the grocery list no longer "gets lost" inside Eat.
- **Website port** of the same simplification is a follow-up (mobile first, as approved).
- Verified: JSX parse-check (`sourceType: module`); mobile build + `public/m` resynced from
  PowerShell (asset base `/m/`); CI green (Web + Mobile) on #1372.

### 2026-06-21 — Push notifications activated (cloud pipeline) + dashboard role guard + more demo zero-out
- **System push — cloud pipeline LIVE + verified end-to-end** (the code + native-plugin
  side was already built). The owner set `FCM_PROJECT_ID` / `FCM_CLIENT_EMAIL` /
  `FCM_PRIVATE_KEY` + `PUSH_WEBHOOK_SECRET` in Vercel (Firebase project `shape-84d22`) and
  created the **Supabase Database Webhook** (`notifications` INSERT → POST
  `/api/push/dispatch`, header `x-push-secret`). **Verified with a test notification:** the
  webhook fired → `/api/push/dispatch` returned **200** with the FCM creds recognized
  (the route 401s on a bad/missing secret and returns `skipped:'fcm_not_configured'` when the
  FCM env is absent — both confirmed during setup). So every notification Shape writes now
  fans out to the dispatch route automatically.
  - `src/lib/push.ts` already tolerates the multi-line FCM key (`.replace(/\\n/g,'\n')`), so
    the service-account `private_key` pastes cleanly (no Apple-key-style DECODER headache).
  - **Remaining (native, separate project):** upload the **APNs `.p8`** into Firebase
    (Cloud Messaging → Apple app config) + ship the **native iOS App Store build** (Push
    capability + `GoogleService-Info.plist`). Push only reaches a locked/unlocked iPhone from
    that native build; until then there are no device tokens, so dispatch correctly no-ops
    the send.
- **Dashboard role guard (#1367)** — a trainer/nutritionist could land on the **client**
  dashboard (root cause: the login "LOG IN AS" selector routes by the *selection*, not the
  user's real role, and the SPAs had no guard). Each dashboard SPA
  (`ClientApp`/`TrainerApp`/`NutritionistApp`) now runs an early `/api/me` check and
  **redirects to the dashboard matching the active role**; signed-out preview + matching
  roles are a no-op, and the hash is preserved (unknown hashes default to the SPA's home tab).
- **Coach Schedule scrollbar (#1367)** — hid the horizontal scrollbar on the availability
  grid (scroll still works) via a `.dash-hide-scroll` class + injected CSS.
- **More demo-data zero-out (#1368)** — continuing the signed-in zero-out: the **community
  feed** (`dashboardCommunity.jsx`, client + coach) shows only the real feed when signed in
  (clean empty state when none; demo sample is signed-out preview only); the **client
  Library** (`clientLibrary.jsx`) shows an empty library when signed in (web library-sync is
  a follow-up); the **coach Goal pages** (`trainerGoalPage` + `nutritionistGoalPage`) render
  a clean empty state (no demo goals/calculator/momentum) when signed in with no saved goals.

### 2026-06-21 — Apple Music integration (web + mobile parity) + tolerant key parser; login & nav polish
- **Apple Music is now a second music integration at full parity with Spotify — live
  end-to-end** (#1360). Coaches import Apple Music playlists; members open/save them,
  exactly like Spotify.
  - **Web** (`trainerPlaylistsPage.jsx`, shared trainer+nutritionist; `clientPlaylist.jsx`):
    the "New playlist" import offers **Pick from your Apple Music** (client-side MusicKit:
    developer-token → `MK.configure` → authorize → POST `/apple-music/connect` → list the
    coach's library playlists) alongside Spotify + paste-a-link; member **Connect Apple
    Music** card. `importSoundtrack` infers the provider from the URL.
  - **Mobile** (`iosAppBroadsheetClient.jsx`, `iosAppBroadsheetPros.jsx`, `shapeBackend.js`):
    `BSPlaylistCard` is **provider-aware** (Apple glyph + red accent + "Open in Apple Music"
    + save via MusicKit; Spotify unchanged via back-compat `spotifyUrl`); `BSProSoundtracks`
    gains a **"Pick from your Apple Music"** library picker; `saveAppleMusicPlaylist` +
    `listAppleMusicPlaylists` helpers (client-side MusicKit — Apple has **no** server
    playlists route). `listAppleMusicPlaylists` requests `include=catalog` so library
    playlists resolve to their shareable catalog URL; `canSave` only offers Save for a
    catalog (`pl.`) URL.
  - **Server** routes (`/api/integrations/apple-music/{developer-token,connect,disconnect}`)
    + the `coach_soundtracks.provider='apple'` allowance already existed.
  - **Activated:** owner created a MusicKit key (Key ID `252AT36GZM`, Team `6KA47K2J29`) and
    set `APPLE_MUSIC_TEAM_ID/KEY_ID/PRIVATE_KEY` in Vercel. Token mints (ES256, HTTP 200),
    verified live.
- **Tolerant `.p8` key parser (#1365)** — the developer-token route threw OpenSSL
  `1E08010C:DECODER` errors because Vercel's env field flattened the multi-line key
  (stripped the line breaks). `privateKeyFromEnv` now rebuilds a valid PEM from **any** form
  — proper multi-line, single-line `\n`-escaped, flattened, or bare base64 — by stripping the
  markers/whitespace and re-wrapping the base64 at 64 cols. `.gitleaks.toml` allowlists the
  route for its PEM-marker literals. The route is now immune to the notorious multi-line-env
  pitfall; the existing (flattened) env value started working on deploy with no re-paste.
- **Login degrade-open (#1361)** — the website login (`login.jsx`) hard-blocked on
  "confirming you're human…" forever when Cloudflare Turnstile couldn't load (outage, a
  network/VPN, or an extension blocking `challenges.cloudflare.com`). It now detects the
  failure (render resolves null, or a 7s grace timer elapses with no token) and **degrades
  open** — ungates submit, **omits** the token (so server-side Turnstile enforcement stays
  authoritative), hides the broken widget, shows a calm "you can still sign in" notice.
- **Login cleanup (#1362)** — removed the non-functional Google/Apple social buttons (no
  OAuth wiring) + their dead `GoogleIcon`/`AppleIcon`/`SocialButton` components; compacted
  the login card.
- **Coach Playlists demo zero-out (#1363)** — the coach Playlists page always stacked the
  demo seed ("Heavy Squat Day"/"Tempo Run" with fabricated listen counts) over real
  soundtracks. Now signed-in coaches see only their own saved playlists (a clean zeroed empty
  state when none); the demo shows for signed-out preview only (auth detected from the
  `/api/coach/soundtracks` 200; one gate at the context-provided list covers Library/Matrix/
  Builder).
- **Removed redundant "More" nav dropdown (#1364)** — the signed-in top portal nav's "More ▾"
  duplicated dashboard-sidebar tabs; removed from all three role navs (`pageShell.jsx`,
  `?v=20260621` across 69 loaders). Orphaned items (client Playlists, coach Public-profile)
  remain reachable by direct URL.
- **Known Apple limit:** library playlists with no catalog equivalent aren't member-shareable
  (Apple platform constraint) — coaches paste a shared/catalog link for those; the picker
  resolves catalog-backed ones automatically.

### 2026-06-20 — Interactive spotlight tour (website dashboards, Phase B)
- The **website dashboards now have the same guided spotlight walkthrough** as the mobile
  app (Phase A), reusing the identical engine — the page dims, a cutout spotlights a real
  element, and a coachmark with Back/Next/Skip + progress dots walks the user through.
- **Engine reuse, no new dependency:** `spotlightTour.js` (`window.SpotlightTour`) +
  `spotlightGeom.mjs` are loaded as-is on the three dashboard SPAs
  (`ClientApp.html` / `TrainerApp.html` / `NutritionistApp.html`); the website root is
  `document.body`. The engine file is untouched from Phase A.
- **Adapter — `public/newdesign/dashTour.js`** (`window.ShapeDashTour.{init,start}`): supplies
  the website step lists and wiring. `navigate` sets the hash route (`#today` … `#profile`),
  `anchor` queries `[data-tour="hero-<slug>"]`, and each step **falls back** to its nav item
  `[data-tour="webtab-<slug>"]` so a missing/unmounted hero never stalls the tour. Role accents:
  client `#2ee0c4`, trainer `#0a8f87`, nutritionist `#a07a2e`.
- **Client tour:** Welcome → Today → Workouts → Nutrition → Grocery → Habits → Score →
  Community → Profile → **Shape Radio finale** (CTA → `/newdesign/Radio.html`).
  **Coach tours** (trainer/nutritionist): Welcome → Today → Clients → Programs/Plans →
  Business → Community → Profile (no Radio finale; ends on Profile).
- **`data-tour` hooks:** the shared sidebar nav items carry `webtab-<slug>`; one hero per
  route. Client heroes sit on each page's lead element; coach heroes thread an optional
  `tourHero` prop into the shared `DashPage`/`DashShell` mastheads so each coach route
  anchors a **tight spotlight on its page title** (not a whole-page cutout). The community +
  profile pages are shared components, so one hook covers both client and coach.
- **Trigger & persistence (net-new on the website):** the pure predicate
  `tourTrigger.mjs` `shouldAutoShowTour(createdAt, seen, now, maxAgeHours=24)` (TDD'd in
  `tests/tour-trigger.test.mjs`) drives a **new-account auto-show** (<24h, once), mirrored in
  `dashTour.js`. Persists `seen` to `localStorage('shape.webTourSeen')` +
  `saveUserGoals('client_onboarding'|'coach_onboarding')`. **"Take a tour" replay** entries
  added to the client Me settings (`clientMeSettings.jsx`) and coach profile extras
  (`dashProfileExtras.jsx`) — both dispatch the `shape:startTour` event the adapter listens for.
- Verified headlessly (Playwright, all three SPAs): the engine + adapter load, `shape:startTour`
  fires the overlay, Next advances, the hash navigates per step, the cutout repositions, role
  accents are correct (client teal / trainer teal / nutritionist gold), coach tours end on
  Profile (no Radio). Phase A's known limitation stands: the engine doesn't auto-`scrollIntoView`
  — fine here since the orientation anchors are top-of-route (post `scrollTo(0,0)`) or always-in-view nav.

### 2026-06-20 — Interactive spotlight tour (mobile, Phase A): engine + mobile rework
- The mobile onboarding tour is now an **interactive guided spotlight walkthrough** — the
  screen dims, a cutout spotlights the real UI element, and a coachmark with Back/Next/Skip +
  progress dots walks the user through the app.
- **Engine:** `public/newdesign/spotlightGeom.mjs` (pure geometry — `cutoutRect`, `coachmarkPos`,
  `stepBounds`; unit-tested in `tests/spotlight-geom.test.mjs`) +
  `public/newdesign/spotlightTour.js` (`startTour(steps, opts)` → dim overlay + spotlight cutout
  + coachmark + controls; configurable `root` container; degrades to a centered card when an
  anchor is missing). Registered as `window.SpotlightTour`. No new dependency.
- **Client tour** (`BSOnboardingTour` in `iosAppBroadsheetClient.jsx`): replaces the old
  float-a-card implementation. Steps: Welcome → Home → Train → Eat → Grocery → Habits → Chat
  → Me → **Shape Radio finale** (opens the in-app radio tab via `onNavigate('radio')`). Adds grocery + habits
  steps that the original tour lacked. `data-tour` hooks on the shared tab bar (`BSTabBar`) +
  one hero element per screen anchor the spotlight to real UI.
- **Coach tour** (`BSProOnboardingTour` in `iosAppBroadsheetPros.jsx`): same engine, role-aware
  accent (trainer teal / nutritionist gold). Steps: Welcome → Today → Clients → Plans → Chat → Me.
  `data-tour` hooks on the coach tab bars + one hero per screen.
- Reuses the existing trigger + persistence: new-account auto-show (<24h), `shape:startTour`
  replay, `user_goals('client_onboarding'|'coach_onboarding')`, Me → App tour entry.
- **Phase B** (website dashboard tours) is a separate later plan.

### 2026-06-20 — Landing-page coach cards show real face photos (not initials)
- The `index.html` coach grid (first 8 trainers, rendered from `coachDirectory.js`) showed
  **initials gradient circles** instead of faces. Added a `photo: face(unsplashId)` to each
  of the 8 directory entries — reusing the **same curated Unsplash portraits the marketplace
  uses** (Maya/Leo/Diego/Jordan/Priya) plus three verified, visually-checked additions
  (Anya/Kenji/Hana, which had no marketplace photo). The card render overlays the photo on the
  initials (`<img onerror="this.remove()">` → graceful initials fallback) with a new
  `.c .av img` rule (circle, `object-fit:cover`). **Cache-bust:** the `coachDirectory.js`
  script tag had no `?v=` (so returning visitors would keep the old, photo-less version) —
  now `?v=20260620`. Verified headless: all 8 avatars load (natW 200), none error-removed.
- **Coach profile avatar too:** the index coach cards linked to `TrainerPublic.html?coach=…`,
  which redirects to `MemberProfile.html?name=…&role=trainer` — **dropping the photo**, so the
  Signal sigil derived initials ("JP"). The cards now link straight to
  `MemberProfile.html?name=…&role=trainer&avatar=<photo>` (the same `&avatar=` the marketplace
  passes), so a clicked coach's profile shows the real photo in the `LvPortrait` sigil. Verified
  on the live preview (the photo loads in the sigil, not initials).
- **Facet (gem) avatar shape:** the directory card avatars were plain **circles**; rebuilt them
  as the app's **rounded-diamond facet gem** (matching `LvPortrait`) — a 45°-rotated rounded
  square (`border-radius:27%`) with a per-card gradient frame + highlight, and an inset window
  (`inset:4px`, `border-radius:23%`, `overflow:hidden`) holding the photo at 152% counter-rotated
  (`rotate(-45deg)`) so the face is upright. Initials fall back inside the gem. Verified headless
  (8 gems, `rotate(45deg)`, photo upright).

### 2026-06-19 — Landing-page phone screenshots fit the frame (no crop, no gap)
- The `index.html` "beat" phone mockups (`.vis`) used `aspect-ratio:320/716` on the frame
  with `object-fit:cover`, so the screen aspect didn't match the screenshots — the
  Community/chat shot (a 408×861 outlier vs the others' 600×1387) got its left/right edges
  cropped ("Deadlift" → "eadlift"). **Fixed:** pinned the screen (`.vis .scr`) to the
  screenshots' real `aspect-ratio:600/1387` (frame height now content-driven), and
  normalized the odd chat capture to that aspect by padding it to **408×943** with a
  background-matched off-white (`getapp-chat-v3.png`). All five phones now render their
  screenshot edge-to-edge with **0% crop** (verified via headless geometry: every screen
  aspect == its image's natural aspect).

### 2026-06-19 — Security: sanitize the Music-tab playlist URL (stored XSS) + DB url guard
- The new profile **Music tab** rendered the user-supplied `member_playlists.url`
  straight into an anchor `href`, so a `javascript:`/`data:` URL would execute on click
  (stored XSS — flagged by the automated commit security review). **Fixed:**
  `livingDesktop.jsx` (`MusicBlock`) now only turns a URL into a link when it's `http(s)`
  to a Spotify/Apple host (`safeMusicUrl`); anything else renders as a non-navigating row.
  `livingDesktop.jsx?v=31`.
- ✅ **Migration APPLIED (2026-06-19)** — defense-in-depth that covers the mobile open
  path too:
  `raw.githubusercontent.com/cperry8800-droid/shape-app/main/supabase-migrations/2026-06-19-member-playlists-url-guard.sql`
  — a `NOT VALID` CHECK on `member_playlists.url` (`~* '^https?://'`) rejecting non-http(s)
  schemes at the DB for all writers, without scanning existing rows.

### 2026-06-19 — Verified coaches show their REAL certs on the profile (closes illustrative sub-data)
- The living coach profile's **Certifications** list now renders a verified coach's
  **actual submitted cert types** (from the credential-verification `cert_files`) instead
  of demo certs. ✅ **Migration APPLIED (2026-06-19):**
  `raw.githubusercontent.com/cperry8800-droid/shape-app/main/supabase-migrations/2026-06-19-coach-certs-public.sql`
  — SECURITY DEFINER `get_coach_certs(p_user_id)` exposes ONLY cert type + number (never
  the file paths), and ONLY for coaches whose credentials an admin approved + who carry the
  public verified flag. `livingProfilePage.jsx` fetches it for verified coaches → `person.certs`
  (`?v=20260619b`). Self-reported certs stay the profile default until verification (per Terms).
- **Assessed the rest of the "illustrative sub-data" item:** the Signal **sigil competency
  rings** are intentionally illustrative (practice focus, not a workout/PR metric — no real
  source by design) and the **field-notes** feed already loads the author's real community
  posts. So certs were the remaining wireable piece — now done.

### 2026-06-19 — Website profile Music tab (parity with the mobile Music tab)
- The desktop living profile (member Terrain + coach Signal, `livingDesktop.jsx`) gains a
  **Music** tab — the profile owner's playlist library, fed by the existing
  `get_member_playlists(p_user_id)` RPC (own → all incl. private with a lock label; others →
  public only). Cards are provider-tinted (Spotify green / Apple red) with a ▶ Open link +
  track count. Closes the "Website profile Music-tab parity" follow-up from the 2026-06-09
  mobile Music tab. Display on web; the owner adds/manages from the app (web add is a
  follow-up). `livingDesktop.jsx?v=30`; parse-check clean.

### 2026-06-19 — User-set reminders: members schedule their own nudges (push spine)
- **Members can now set their own reminders** to DO & LOG things — weigh-in, weekly
  check-in, water, progress photo, or a custom label — each with a time + days of week.
  Distinct from per-habit reminders (those stay on the Habits page). They ride the
  existing notifications→push spine, so once push is activated they hit the lock screen.
- ✅ **Migration APPLIED (2026-06-19):**
  `raw.githubusercontent.com/cperry8800-droid/shape-app/main/supabase-migrations/2026-06-19-user-reminders.sql`
  — `user_scheduled_reminders` (owner-RLS; `kind`, `label`, `at_time` HH:MM, `days int[]`
  0=Sun…6=Sat, `tz`, `enabled`, `last_fired_on` for dedupe). Idempotent. **Code no-ops
  until applied.**
- **Backend:** `GET/POST/DELETE /api/client/reminders` (owner-scoped CRUD; validates
  kind/HH:MM/days). **Hourly cron** `/api/cron/reminders` (`vercel.json` `0 * * * *`,
  `CRON_SECRET`): for each enabled reminder computes the member's LOCAL hour/weekday/date
  in its tz (via `Intl`), and when the local hour matches `at_time` and today is in `days`,
  fires ONE notification per local day (deduped via `last_fired_on`) through
  `createNotification` → push webhook.
- **UI:** a **"Your reminders"** manager in mobile Settings → Notifications (clients only,
  `BSReminderManager` in `iosAppBroadsheetClient.jsx`) — add/edit/delete, kind chips,
  `<input type=time>`, day toggles, per-reminder enable switch; `window.ShapeReminders`
  (`shapeBackend.js`) CRUD helper (Bearer native / cookie `/m/` web, sends the device tz).
- Verified: `tsc --noEmit` clean · mobile JSX + shapeBackend parse-check clean · mobile
  build + `public/m` resynced. *Follow-up:* desktop-website Settings parity
  (`clientMeSettings.jsx`); the per-reminder push still needs the global push activation
  (FCM env + webhook) to leave the in-app bell.

### 2026-06-19 — Coach credential verification: COI + certs → admin review → ✓ Verified badge
- **Makes "vetted coaches" literally true.** A coach uploads proof of certification +
  a Certificate of Insurance (COI), submits for review; an admin verifies in a queue;
  on approval a **✓ Verified** badge shows on their marketplace card + living profile,
  and a weekly cron nudges them before insurance/licenses expire. The badge concept was
  already designed into the app (Terms clause + hero render slot) — this builds the
  pipeline behind it.
- ✅ **Migration APPLIED (2026-06-19):**
  `raw.githubusercontent.com/cperry8800-droid/shape-app/main/supabase-migrations/2026-06-19-coach-credential-verification.sql`
  — extends `provider_credentials` (NC1) with a document + review workflow
  (`insurance_coi_path`, `cert_files jsonb`, `review_status`, `submitted_at`,
  `reviewed_by/at`, `review_notes`); a PRIVATE **`coach-credentials`** bucket (PDF/DOC/
  image, 10 MB, service-role upload + signed-URL read); a PUBLIC **`verified` + `verified_at`**
  flag on `trainers`/`nutritionists` (the marketplace rows already public-read, so the
  badge renders without exposing the private credential row); and a
  `coach_credential_expiry_reminders` dedupe ledger. Idempotent. **All code no-ops until
  applied.**
- **Backend:** `POST /api/coach/credentials/document` (multipart COI/cert upload → bucket,
  path recorded on the owner's credential row); extended `POST /api/coach/credentials`
  with an `action:'submit'` branch (→ `review_status:'pending'`) and `GET` now returns
  the review + verified state. **Admin queue** `/dashboard/credentials` (+ `actions.ts`,
  mirrors the applications queue, `requireAdminUser` + service-role): pending/approved/
  rejected/changes tabs, signed COI + cert links, license expiry flags; **Approve →**
  sets `verified=true` on the coach's marketplace row(s) (a coach can hold both) + notifies
  them; Reject revokes; Request-changes notifies with the note. **Weekly cron**
  `/api/cron/credential-expiry` (Mon 08:00 UTC, `CRON_SECRET`): scans insurance + license
  expirations inside 60 days, writes ONE never-shaming reminder per coach per credential
  per month (deduped), riding the existing notifications→push spine.
- **Verified flag is intentionally SEPARATE from application approval** (approval makes a
  coach live; credential review grants the badge) — `publishProviderRow`'s update doesn't
  touch `verified`/`verified_at`, so re-publishing preserves it.
- **Coach-facing UI:** a new **Credentials & verification** card on the coach dashboard
  profile (`dashProfileExtras.jsx`, rendered below the living profile on Trainer/
  Nutritionist Profile) — status chip, COI upload, add-certification (type/number/file),
  and Submit-for-review (gated on a COI being on file). **Badge render:** marketplace coach
  cards (`marketplace.jsx`, reads `row.verified`) + the living coach-profile hero
  (`livingProfilePage.jsx` fetches the coach's `verified` flag → `person.verified`; the
  `livingDesktop.jsx` hero already had the `d.verified && <SpVerifiedDot/> Verified` slot).
- Verified per change: `tsc --noEmit` clean · all 4 edited JSX parse-check clean · `?v=`
  bumped (`dashProfileExtras 20260619`, `marketplace 6`, `livingProfilePage 20260619`,
  `livingDesktop 29`). *Follow-up:* mobile marketplace/profile verified badge (web is the
  primary discovery surface); a richer apply-time COI capture.

### 2026-06-19 — Draggable + resizable dashboard widgets (GridStack) across all card tabs, all profiles
- **The dashboard is now a movable, resizable grid.** Every card-style dashboard tab
  renders its cards as GridStack widgets the user can **drag to reorder** (via a ⠿
  handle in each card's chrome) and **resize** (via a flush corner triangle), with the
  layout **persisted per role+tab** to `user_goals('dashboard_layout')`. Applies to all
  three profiles (client · trainer · nutritionist); single-purpose pages (meal-plan
  builders, workout lists, calendars, feeds, rosters, profiles) are deliberately left
  alone.
- **Engine — `public/newdesign/dashGrid.jsx`** (the `DashGrid` interop, vendored
  GridStack 11.x at `/vendor/gridstack/`): GridStack owns layout (x/y/w/h); React
  `createPortal`s each card's content into the grid-item node. Config `cellHeight:2 ·
  margin:8 · float:true · handle:'.dash-drag-handle' · resizable se · column:12` with a
  `breakpoints:[{w:768,c:1}]` 1-column mobile breakpoint. API:
  `<DashGrid role tab widgets={[{key,title,size:'full'|'half',render}]} />`.
  - **Tight content-fit:** GridStack's auto `sizeToContent` can't see React portals, so
    heights are computed directly from the measured card height
    (`h = ceil((cardH + 18) / cell)`, +18 = 16px item-content inset + 2px buffer) and the
    whole ordered layout is applied atomically via `grid.load(layout, false)` (incremental
    `grid.update` got re-cascaded by the float engine and scrambled card order). A
    debounced **ResizeObserver** per card refits async content (fetch-rendered cards that
    start null).
  - **Flush resize triangle:** the card renders its own `.dash-rs` filled triangle inset
    7px in the corner, while GridStack's `.ui-resizable-se` is made a transparent 28px
    hit-area — so the affordance is pixel-flush and consistent on every card (the
    decorative `.dash-plate--bracket::after` corner is hidden), with no scrollbars
    (`overflow:hidden`).
- **Tabs gridded** (each refactored to build a `widgets` list + render through `DashGrid`):
  client **Today · Score · Habits · Progress · Workouts · Nutrition · Goal**; trainer &
  nutritionist **Today · Score · Goal**. The two coach apps also gained the GridStack
  vendor `<link>`/`<script>` (they loaded `dashGrid.jsx` but not the engine → empty grid).
- **Verified on the preview** (Playwright, both 1280px desktop + 430px mobile) across all
  9 newly-gridded tabs: correct widget count + order, no collapsed cards, resize triangle
  flush (7px inset), and clean 1-column stacking (maxGap 0) at mobile width. Conditional
  widgets (e.g. Progress check-in/photo-timeline, Workouts tonight) correctly hide when
  signed-out. Console errors limited to benign demo-mode 401s.
- All touched `.jsx` bumped to `?v=20260619a` across referencing HTML; on branch
  `claude/dashboard-widgets` (PR #1353), ready to squash-merge to production.

### 2026-06-18 — Shape Score v2: momentum streak escalation (D) + weekly commitments (E)
- **✅ FULLY LIVE (end of session):** the owner ran ALL migrations (Phase C accountability,
  D escalation, E commitments — Phase B momentum already applied), set **`CRON_SECRET`** in
  Vercel env, and deployed. Verified live: all 9 RPCs + `score_commitments` exist; the daily
  cron `/api/cron/score-accountability` authenticates + runs (`{ok:true, evaluated:0, …}`,
  HTTP 200). The entire **A–E** Shape Score system (two-number model · momentum + escalating
  bonus · accountability clawback + earns + waive · weekly commitments) is now active end to
  end; it self-runs daily at 07:00 UTC as real members come on.
- Two enhancements on the shipped Momentum/Accountability system (spec
  `docs/superpowers/specs/2026-06-18-shape-score-streak-escalation-and-commitments-design.md`,
  plan `…/plans/2026-06-18-shape-score-streak-escalation-and-commitments.md`).
- **D — Momentum streak escalation (shipped to main):** the weekly bonus now **grows +15
  per consecutive prior week** held ≥80, capped at **+100** — a six-rung ramp
  `25 → 40 → 55 → 70 → 85 → 100`. `momentum.mjs` `momentumBonus(streakWeeks)` (tested) is the
  single source of truth, mirrored by the replaced `award_momentum_bonus()`. The score route
  returns `momentum.streakWeeks` + `points`; the Momentum bar shows "🔥 N-week streak ·
  +X banked" (mobile + web). ⚠ **OWNER — run after the Phase B momentum migration:**
  `raw.githubusercontent.com/cperry8800-droid/shape-app/main/supabase-migrations/2026-06-18-score-momentum-escalation.sql`
- **E — Weekly commitment + stake (built; pending owner migration):** a coach (for a client)
  or a member (solo) sets a one-ISO-week commitment on auto-tracked counts (N workouts ·
  check-in · K habits) and stakes **5–50 pts**, two-sided: hit ALL → **+stake**, miss →
  **−stake** (floored at 0). Coach-set = a **proposal the client must accept** before points
  are at risk. New `score_commitments` RLS table + `set_commitment` / `accept_commitment` /
  `settle_commitment` (service-role) RPCs (`commitment_win`/`commitment_loss`, category
  `adherence`, outside the −30 penalty cap). Settled by the daily accountability cron.
  `commitments.mjs` `commitmentMet` (tested). UI: a "This week's commitment" card on the
  Score page (mobile `BSCommitmentCard` + web via new **`/api/client/commitment`**) and a
  coach "Set a commitment" affordance on the client Manage tab.
  - **Adversarial review → anti-farm guardrails:** a self-set commitment now **locks once
    active** (no mid-week target/stake swap to dodge a loss) and must be **set by end of
    Wednesday** (a forward bet, not a retroactive grab). The signed-out card shows the honest
    "Sign in to commit" empty state (no fake-live demo). *Residual:* the payout is symmetric
    (+stake/−stake) per the approved design — an asymmetric win (e.g. +½ stake) is a 1-line
    follow-up if reward-farming on easy self-set targets becomes a concern.
  - ⚠ **OWNER — run:** `raw.githubusercontent.com/cperry8800-droid/shape-app/main/supabase-migrations/2026-06-18-score-commitments.sql`
- Verified per task: `tsc` · 251/251 tests · mobile build + `public/m` synced · JSX parse-check ·
  migration logic validated read-only against prod. War Room: `/api/client/commitment` registered.

### 2026-06-18 — Shape Score: accountability clawback + cron + positive earns (Momentum/Accountability Phase C)
- **The "stick" — lose points for not doing committed things** — plus the deferred
  positive earns. Built on Phase A/B's two-number ledger; the tier never demotes (only the
  NUMBER dips), and the tone stays never-shaming.
- ⚠ **OWNER ACTION (1) — run the migration:** `supabase-migrations/2026-06-18-score-accountability.sql`
  — `raw.githubusercontent.com/cperry8800-droid/shape-app/main/supabase-migrations/2026-06-18-score-accountability.sql`
  — five RPCs on `score_ledger` (no new table, no CHECK change):
  - **`apply_obligation_penalty(uid,kind,ref,day)`** — SERVICE-ROLE ONLY (the cron). Bounded
    −½ penalty for a MISSED **client-controllable** obligation: **check-in −7** (ISO week
    fully over, no row), **assigned workout −5** (published, day past, no logged workout in
    a ±1-day window), **habit-streak −2** (active daily DO-habit, clean ≥3-day streak then
    missed). Guards: recency (no launch back-charge), pause (`user_goals('client_settings')
    .paused_until`), **−30/week cap**, **0 balance floor**, per-user advisory lock, idempotent.
  - **`award_session_kept` +12** (cron) · **`award_workout_session` +10** (client, once/day,
    gated on a real `workout_minutes` snapshot — un-farmable) · **`waive_penalty`** (coach-gated)
    · **`get_client_penalties`** (coach read).
  - **Session ATTENDANCE is deliberately NOT penalized** (review finding): a session's only
    "kept" signal is the coach manually marking it `completed`, so a stale `confirmed` is coach
    bookkeeping, not a client miss — penalizing it would be a false debit. The +12 reward stays.
- ⚠ **OWNER ACTION (2) — set `CRON_SECRET`** (Vercel env) so the daily evaluator authenticates.
- **Daily cron** `/api/cron/score-accountability` (`vercel.json`, 07:00 UTC) — the authoritative
  evaluator (fires for ghosters too): per active member, applies past-grace penalties, credits
  kept sessions, sends ONE never-shaming heads-up summarizing any dip. Service-role, fail-open
  per user. **Workout earn** wired into `saveWorkoutSessionLog`.
- **Surfacing:** the home "Today · your move" directive's check-in/training/nutrition levers
  gain never-shaming **stakes** copy ("keep your momentum + protect 15 pts"); the coach client
  profile **Manage** tab gets a **Recent penalties + WAIVE** affordance.
- **Adversarial review** (3-dimension fan-out; the cron/UI dimensions hit transient rate limits
  and were self-reviewed) confirmed + fixed the session false-penalty (dropped), widened the
  workout exoneration to ±1 day, widened the kept-session reward window, added cron
  `maxDuration` + a per-insertion-week cap note. Every obligation predicate + guard validated
  read-only against prod. tsc clean · mobile build + `public/m` synced.
- War Room: `/api/cron/score-accountability` registered in `RAW_ROUTES`.

### 2026-06-18 — Shape Score: Momentum meter + weekly bonus (Momentum/Accountability Phase B)
- **The consistency carrot.** A 0–100 **Momentum** meter — "don't break the streak" —
  folded over the trailing 30 days: **+7** per active day, **−12** per miss (a notch,
  not a reset), clamped. Hold **≥80** and bank a **+25** weekly bonus. Built on Phase A's
  ledger. Shipped in 4 commits + a review-fix pass:
  - **`mobile-app/src/services/momentum.mjs`** (+ `tests/momentum.test.mjs`, 5 tests):
    the pure `computeMomentum(activeDays)` fold + constants (STEP_UP=7 · STEP_DOWN=12 ·
    BONUS_THRESHOLD=80 · BONUS_POINTS=25) — the single source of truth the SQL mirrors.
  - ⚠ **OWNER ACTION — run the migration:** `supabase-migrations/2026-06-18-score-momentum.sql`
    — `raw.githubusercontent.com/cperry8800-droid/shape-app/main/supabase-migrations/2026-06-18-score-momentum.sql`
    — two SECURITY DEFINER, **auth.uid()-scoped** RPCs (no user_id param — a caller only
    ever reads/earns for themselves): **`compute_momentum()`** (a day is active when the
    caller logged a real `daily_health_snapshot` metric, a `user_habit_completions` row,
    or has a `client_checkins` week covering it) and **`award_momentum_bonus()`** (+25 once
    per ISO week at ≥80, idempotent via md5-uuid `source_id` on the dedupe index, reuses
    category `'adherence'` / `source_kind 'momentum_bonus'` — **no CHECK change**).
    Fire-and-forget: callers no-op until applied.
  - **`/api/client/score`** returns `momentum:{value,bonusThisWeek}` (value via
    `compute_momentum`; bonusThisWeek = a `momentum_bonus` row earned since this ISO-week
    Monday). **`window.ShapeMomentum.check`** (shapeBackend) calls `award_momentum_bonus`
    on session resolve (next to `award_tier_bonuses`, idempotent).
  - **Momentum bar UI**: mobile `BSShapeScorePage` (teal `BSPlate`), web dashboard
    `clientScore.jsx` (live), and an illustrative strip on the marketing `score.jsx`
    consistency card. Signed-out = demo; signed-in = real (or hidden pre-migration).
- **Adversarial review (3-dimension fan-out, each finding independently verified)** caught,
  and this pass fixed: (HIGH) `clientScore.jsx` changed but its `?v=` wasn't bumped →
  `?v=20260618b` on ClientApp/ClientScore; (MED) demo momentum (72) leaked onto a signed-in
  no-data account → demo now signed-out only, signed-in-no-data shows nothing; (NIT)
  `ON CONFLICT` now spells out the partial-index predicate; (LOW) documented the
  UTC-day window basis (can only undercount, never farm).
- Validated read-only against prod (schema refs resolve; the fold reproduces the `.mjs`
  vectors 98/65/100/0). Verified per change: `tsc` · 241/241 tests · mobile build +
  `public/m` synced (PowerShell) · JSX parse-check. Also fixed the dead marketing **Score
  hero buttons** ("Redeem points →" → Store; "How points work" → scroll to the earn table).
- **Next:** Phase C (clawback penalties + daily cron + the deferred positive earns —
  `2026-06-18-score-penalties.sql` + `CRON_SECRET`).

### 2026-06-18 — Shape Score: two-number split + high-water tier + at-risk (Momentum/Accountability Phase A)
- **Phase A of the Momentum + Accountability system** (spec
  `docs/superpowers/specs/2026-06-18-shape-score-momentum-accountability-design.md`,
  plan `…/plans/2026-06-18-shape-score-momentum-accountability.md`). Lays the scoring
  foundation the penalties/momentum phases build on — **no migration, no behavior change
  until points exist** (the ledger is still empty). Shipped in 4 commits:
  - **A1 — `mobile-app/src/services/scoreDerive.mjs`** (+ `tests/score-derive.test.mjs`,
    4 tests, registered in `package.json`): the ONE pure derivation of three numbers from
    raw ledger rows — **shapeScore** (the RANK: Σ delta EXCLUDING `store_redeem`, so
    spending never demotes; penalties DO count, so lapsing dents it), **spendableBalance**
    (Σ ALL delta — what you redeem), **highWaterScore** (running max of the rank → the
    DISPLAYED tier is high-water-marked, never demotes). Folds in `earned_at` order.
  - **A2 — `src/lib/score-derive.ts`**: the TS twin (kept in sync with the mjs).
  - **A3 — `/api/client/score`**: `points_total` is now the rank (excl. redemptions),
    the breakdown excludes redemptions, the tier resolves from `highWaterScore`, and the
    response adds **`spendable_balance`** + **`at_risk`** (`rank < current_tier.threshold`).
  - **A4 — consumers (mobile + web):** mobile `_bsUseLiveScore` — `available` is now the
    **spendable** balance (headline/tier keep the rank), adds `atRisk`; the Score-page hero
    shows an at-risk line ("N below {tier} — earn it back to hold"); the Rewards-tab
    affordability draws on the spendable balance, not the rank. Web `clientScore.jsx` —
    tier resolves from the API's high-water `current_tier` (penalties don't demote it), the
    subtitle surfaces the at-risk state; `?v=20260618` on ClientApp.html + ClientScore.html.
- Verified: `tsc --noEmit` clean · 236/236 tests · mobile build + `public/m` synced
  (PowerShell) · JSX parse-check. Shipped to `main` (4 commits, HEAD `53f3f1a1`).
- **Next:** Phase B (Momentum meter — needs `2026-06-18-score-momentum.sql`), Phase C
  (clawback penalties + daily cron + the deferred positive earns — needs
  `2026-06-18-score-penalties.sql` + `CRON_SECRET`). Both no-op until their migrations run.

### 2026-06-18 — Shape Score buildout: dead categories wired · real composite · coach reconcile · color unify
- **Wired the dead earning categories** (`prs`/`adherence`/`community` were
  schema-permitted but never written) to the amounts the score page advertises —
  **migration `2026-06-18-score-ledger-awards.sql`** (no CHECK change; categories
  already allowed):
  - PR Wall post → **+12 `prs`** (inside `post_my_pr_to_wall`'s DEFINER tx).
  - Weekly check-in → **+15 `adherence`** (`award_checkin_points`, once/week),
    called from the web checkin-kit route + mobile `checkinSubmit`.
  - Community post → **+5 `community`** (`award_community_post`), web feed route +
    mobile `createPost`.
  - **Security-hardened** after the automated review: amounts/categories are
    hard-coded in the RPCs (no generic "insert any delta" helper), `user_id` is
    always `auth.uid()`, awards require the **real originating row to exist + be
    caller-owned** (community post ownership + feed-visibility; a real
    `client_checkins` row for the week), and PR awards bucket **per-lift-per-month**
    so ratcheting can't farm. Likes earn nothing (un-farmable). All idempotent via
    the `(user_id, source_kind, source_id)` dedupe index.
  - *Pre-existing latent risk (not introduced here):* the `score_ledger` RLS INSERT
    policy still lets a user self-insert arbitrary rows directly — worth tightening,
    but it would require reworking `award_my_goal_milestones` (INVOKER).
- **Real composite bars** (Train/Nutrition/Recovery/Consistency): were hardcoded
  88/74/62/92 signed-out and flat 0/0/0/0 live. Now computed in
  `/api/client/score` (`computeComposite`) from the user's own
  `daily_health_snapshot` — Recovery = 7d avg sleep (8h=100), Nutrition = 14d
  meal-logging days, Train = 14d training days (~8/2wk target), Consistency = 14d
  active days — with **honest `—`** (null, never a fake 0) when sparse. Threaded
  via `_bsUseLiveScore` into `BSScoreCardDark` + the Me-page Terrain inline bars.
  Mobile-only (the website score pages render no composite bars).
- **Reconciled the two coach scoring systems:** `/api/coach/score` was a 4-rung
  `Raw/Tempo/Peak/Legend` (0/1000/5000/15000) ladder while every coach surface
  shows the 5-rung `Certified/Pro/Elite/Master/Icon` (0/750/2000/5000/15000). The
  API now uses the 5-rung ladder; mobile `_bsHydrateProScore` was fetching the
  WRONG endpoint (`/api/client/score`) + reading `.name` off a string — now hits
  `/api/coach/score?role=…` (dietitian→nutritionist). Website pages already carried
  the 5-rung `STATIC_TIERS`.
- **Unified the tier-color palettes:** new canonical `public/newdesign/tierColors.jsx`
  (`window.SHAPE_TIER_COLORS` / `window.tierColor`, matching mobile `BS_TIER_COLORS`).
  `chatWidget.jsx` + `marketplace.jsx` were already canonical; corrected the drift —
  `score.jsx` member ladder (INTENTIONAL marketing change: Form amber `#e89740`→teal
  `#34d6c5`, Peak→violet, Legend→rose) and `livingProfilePage`/`livingDesktop` Form
  `#1ec0a8`→`#34d6c5`. `?v=` bumped on Score.html + the 7 profile pages.
- ⚠ **OWNER ACTION — run the awards migration on Supabase** (raw link):
  `raw.githubusercontent.com/cperry8800-droid/shape-app/main/supabase-migrations/2026-06-18-score-ledger-awards.sql`
  — the award calls fire-and-forget and **no-op until it's applied**.
- Verified per PR: `tsc --noEmit` · 232/232 tests · mobile build + `public/m` synced
  · website JSX parse-check. Shipped to `main` (5 commits).

### 2026-06-17 — Fix: home "Log last night's sleep" directive now opens a real sleep logger
- The home **"Today · your move"** sleep directive's **"Log sleep →"** button was
  mis-wired: it opened the weekly check-in (`setCheckinPage(true)`,
  `iosAppBroadsheetClient.jsx:2335`), which has no sleep field — and **no manual
  sleep logger existed anywhere** (`daily_health_snapshot.sleep_hours` was only
  ever written by device sync: HealthKit/Whoop/Oura/Garmin). So the button could
  never satisfy its own request and the directive re-fired daily. The engine /
  gating / copy were all correct (directive only fires on a real synced sleep
  deficit; no demo-copy leak) — only the action + the missing capability were wrong.
- **Built the real path** (no migration — `sleep_hours` already exists): new
  **`POST /api/client/sleep-log`** (mirrors `/api/nutrition/meal-log`; **SETs**
  `sleep_hours` on today's snapshot, merging with device metrics, not accumulating),
  **`window.ShapeSleep.log({hours})`** in `shapeBackend.js` (invalidates the metrics
  cache on save), and a focused one-tap **`BSSleepSheet`** (hours input + quick-pick
  chips 6–8.5, modeled on `BSWeighInSheet`, portaled into `#bs-phone-surface`). The
  CTA now opens the sheet; on save the recovery readiness + the directive refresh.
- The recovery-ticker caption ("…or log sleep to see readiness", `:596`) is now
  truthful. *Follow-up:* a no-data account can't reach the logger except via the
  directive (which needs existing sleep data) — add a standalone entry point (e.g.
  tap the recovery ticker) so first-time manual sleep logging is reachable.
- Verified: `tsc --noEmit` · 232/232 tests · mobile build + `public/m` synced.

### 2026-06-17 — Auth CAPTCHA review fixes (single-use token resets + load-failure degrade) + mobile /m/ rebuild
- **Mobile `/m/` blank-page fix (urgent, was live):** the prior Auth-CAPTCHA commit
  rebuilt `public/m` with root-absolute `/assets/...` paths instead of `/m/assets/...`,
  so the hosted mobile web app 404'd its entry script. Root cause: building in **Git
  Bash on Windows path-mangles `VITE_BASE=/m/` to `/`** — rebuild from **PowerShell**
  (`$env:VITE_BASE='/m/'; npm run build`), which doesn't do MSYS path conversion. Always
  republish `public/m` from PowerShell on this machine.
- **CodeRabbit + Codex review of the CAPTCHA work (PR #1352)** — fixed the real findings,
  all about single-use Turnstile tokens not being refreshed:
  - **Critical (`src/components/Turnstile.tsx`):** a script-load failure used to leave the
    form stuck on a disabled "Confirming you're human…" button forever. Now it surfaces a
    "Couldn't load the human-check · Reload" notice and calls a new **`onUnavailable`** prop
    so the parent **degrades open** (`SignupForm` / `ForgotPasswordForm` drop the gate). Also
    **destroys the widget on unmount** (was a leak).
  - **Stale-token resets (all surfaces):** after a failed signup / returning from the phone
    OTP step / switching auth method, the consumed token was re-submitted and no fresh widget
    rendered. Web `login.jsx` + mobile `BSLogin` now track which container the widget is
    mounted in (a `captchaVisible` / `captchaSlot` value) and **tear down + re-render a fresh
    challenge** when it returns; the Next.js forms remount `<Turnstile key=…>` and clear the
    token on `state.error`.
  - **Mobile `useEffect` dep array:** the render effect had none (ran every render) — now keyed
    on `captchaSlot`.
  - **Resend-confirmation wired:** the mobile verify-email screen now renders its own widget and
    **passes a fresh `captchaToken`** to `resendConfirmation` (the backend already forwarded it),
    so Resend works once Auth CAPTCHA is enabled.
  - Helpers gained a **`remove(id)`** (proper widget teardown): `public/supabase.js` +
    `mobile-app/src/services/turnstile.js`. `login.jsx?v=20260617e`.
- *(The web forgot-password flow already had a Turnstile widget; that part of the prior
  "known minor gaps" note was stale and is removed.)* Verified: `tsc --noEmit` · `next build`
  · mobile build + `public/m` synced (PowerShell) · JSX parse-check.

### 2026-06-17 — Auth CAPTCHA: Turnstile wired into login/signup across ALL surfaces (S1-2 follow-up)
- Closes the deferred **"Auth login/signup CAPTCHA — client wiring"** follow-up
  (the dashboard half — Auth → Attack Protection — is still a manual owner step,
  below). The consultation form already had Turnstile; this extends it to the
  **Supabase Auth** requests (sign-in · sign-up · phone OTP · resend · password
  reset). **Why all surfaces at once:** enabling Auth CAPTCHA in the Supabase
  dashboard is **global** — every tokenless auth request is rejected the moment
  it's flipped — so all session-creating clients must send a token first.
- **Shared pattern:** render a Turnstile widget (lazy-loaded
  `challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`), **block
  submit until a token exists** (shows "confirming you're human…"), pass it as
  Supabase's `options.captchaToken`, and **reset on a failed attempt** (tokens
  are single-use). **No-op until a site key is present** (same graceful pattern
  as the consultation verify) so nothing breaks pre-activation. The public SITE
  key is the one already committed (`0x4AAAAAADmrGKVw7Ghzs1gQ`).
- **Website** (`public/newdesign/login.jsx`, `?v=20260617d`): new
  **`window.ShapeTurnstile`** helper in `public/supabase.js` (load/render/reset);
  wired into the password sign-in + the phone-OTP **send** (verify needs no
  token). Website *signup* is an application stub (no `auth.signUp`) — nothing to
  wire there.
- **Mobile** (`BSLogin` in `iosAppBroadsheetMain.jsx`): new
  `mobile-app/src/services/turnstile.js` (`window.ShapeTurnstile`, imported in
  `main.jsx`); `ShapeAuth.signIn/signUp/signInWithPhone/resendConfirmation` now
  accept + forward `captchaToken` (`shapeBackend.js`). Widget renders in the auth
  form, hidden at the phone code-entry step.
- **Next.js** (legacy `/signup` + `/forgot-password`, still live): new reusable
  **`src/components/Turnstile.tsx`** client component (mirrors the token into a
  hidden `captchaToken` input + gates the submit button); the `login`, `signup`,
  and `requestPasswordReset` server actions (`src/app/login/actions.ts`) read
  `formData.captchaToken` and pass it through.
- **⚠ Before enabling the dashboard toggle — two owner steps:**
  (1) **Enable** CAPTCHA in Supabase → Auth → Attack Protection with provider
  **Cloudflare Turnstile** + the **`TURNSTILE_SECRET_KEY`** already set in Vercel.
  (2) **Native app caveat:** Turnstile validates the page hostname against the
  widget's allowed hostnames. The website domains are configured; the Capacitor
  **native** origin (`capacitor://localhost` / `https://localhost`) must be ADDED
  to the widget's hostnames (or a separate key used, `VITE_TURNSTILE_SITEKEY`)
  or native logins get rejected server-side. The `/m/` web build is fine.
- **Known minor gaps** (don't block the toggle but degrade if hit): the mobile
  **resend-confirmation** button and any web **forgot-password** flow that lack a
  visible widget will need a fresh challenge — wire a widget on those screens if
  the toggle surfaces failures. Verified: `tsc --noEmit` clean · mobile build +
  `public/m` synced · all edited JS/JSX parse-check clean.

### 2026-06-17 — Turnstile CAPTCHA (live) + consultation → newdesign (PRs #1347–#1350)
- **Consultation CAPTCHA (audit S1-2; built #1347, activated #1349) — LIVE.**
  Cloudflare Turnstile bot challenge on the public consultation form.
  `src/lib/turnstile.ts` (`verifyTurnstile` — graceful **no-op until
  `TURNSTILE_SECRET_KEY` is set**; rejects a missing/invalid token; fails OPEN on
  a Cloudflare network blip so an outage can't block real bookings).
  `/api/consultation` verifies `body.captchaToken` before any DB/email work. The
  **public** SITE key lives in `public/supabase.js`
  (`window.SHAPE_TURNSTILE_SITEKEY = '0x4AAAAAADmrGKVw7Ghzs1gQ'`); the secret is
  set in **Vercel env**, so the widget renders AND the server enforces.
- **Consultation is now a NEWDESIGN page (#1350).** New
  **`public/newdesign/consultation.html`** — self-contained, house-style
  (mono eyebrows · serif display · role-accented trainer-rust/nutritionist-gold ·
  squared cards · ledger rules), same booking logic (`GET /api/availability` +
  `POST /api/consultation`) + the Turnstile captcha + an **inline success state**
  (no bounce to a legacy page). Fixed the coach-profile **"Book a consult" 404**
  (`livingDesktop.jsx` `bookHref` → `/newdesign/consultation.html`, `?v=26` on the
  7 loader pages). **Legacy `public/consultation.html` deleted**; `next.config.ts`
  permanent-redirects `/consultation`(.html) → the newdesign page; `sw.js`
  precache repointed. *(Note: a full legacy-website retirement is still a separate
  pending pass — only the consultation page moved.)*
- **War Room (#1348)** Database & Auth checklist now tracks the deferred manual
  auth-hardening items (below).
- **Still manual — only the account owner can do these (tracked in War Room):**
  (1) **Auth rate limits** — Dashboard → Auth → Rate Limits, or the `config/auth`
  Management-API PATCH (OTP 60 · verify 100 · email_sent 30 · anonymous_users 5;
  keep `token_refresh` ~1800). The app's own `/api/*` limiter is already live.
  (2) Make **`Secret scan (gitleaks)`** a required check on `main` (Settings →
  Branches) — runs on every PR now, advisory until added. (3) **Pro upgrade →
  leaked-password protection** (HaveIBeenPwned is Pro-gated; org "Shape" is on
  Free). (4) **Supabase Auth login/signup CAPTCHA** — enable in Dashboard → Auth
  with the same Turnstile secret; client wiring on login/signup is a follow-up.
- All squash-merged to `main`, CI green (Web · Mobile · gitleaks); dev branch
  re-synced. `docs/HANDOFF-2026-06-17.md` written.

### 2026-06-17 — Code-audit fix sweep (PRs #1337–#1343) + legacy dashboard retired
- Worked the read-only **`CODE-AUDIT-REPORT.md`** (S1–S5, landed #1339) into fixes,
  one **PR-per-concern**, all merged to `main` with CI green:
  - **P1s (the two real security/money holes):** **#1337** — one-time Stripe
    checkout price is now **server-authoritative** (plan price by `planId` from
    `coach_plans` / provider row; `body.item.price` no longer trusted → no more
    $1-for-$180). **#1338** — `claimProviderRow` is **admin-gated**
    (`requireAdminUser()`), closing the self-service coach-role/revenue takeover.
  - **#1340 quick wins:** `auth/callback` `next` open-redirect guard (same-origin
    only); refund actions add an explicit `.eq('client_id', user.id)` to both
    branches; `store/redeem` fulfillment emails **escape** the member-supplied
    shipping fields (new local `escapeHtml`, matching consultation/contact/apply).
  - **#1341 engine** (`public/newdesign/dashSignals.js`): **unit-reconcile** the
    goal projection (`goalsFromDoc` converts the weigh-in series into the goal's
    unit — a kg series no longer "achieves" an lb goal); **sort** the weigh-in
    series before the first-vs-last delta in `buildDirectiveRead` +
    `buildEvidencePack` (no more sign-inverted weight read on the coach surface /
    AI evidence pack); `buildDirective` **leads by an urgency ranking**
    (`DIRECTIVE_PRIORITY` + `topFlag`), not rule push-order; **+7 unit tests**
    (projectGoal/goalsFromDoc/buildDirective/buildEvidencePack) → 232/232.
  - **#1342 hygiene:** new **gitleaks secret-scan CI job** (`ci.yml` +
    `.gitleaks.toml` — allowlists the by-design publishable key, client-side
    localStorage key names, and generated bundles; verified 0 leaks, passes in
    CI). Removed 5 zero-import orphan src files (`SubscribeButton`/`PageHero`/
    `Section`/`LegalSection`/`LoginForm`). **Kept `public/newdesign/memberProfile.jsx`**
    — it's a newdesign file and the rule is *don't delete anything under newdesign*,
    even orphans.
  - **#1343 legacy dashboard retirement:** removed the user-facing legacy Next.js
    dashboards (`/dashboard/{client,trainer,nutritionist}`, program-tools,
    workout-reviews, settings + `_components` + `src/lib/analytics-data.ts`) —
    superseded by the newdesign portal. **Kept the live admin tooling**
    (`/dashboard/applications` — the coach-approval pipeline that inserts
    `trainers`/`nutritionists` rows on approval — and `/dashboard/claim`); no
    newdesign equivalent exists, so retiring them would break onboarding.
    `/dashboard` root is now a thin redirect to the role's newdesign dashboard;
    deleted-subpage links/redirects (Nav, subscribe/purchase success, refunds,
    the coach-approval invite) re-pointed to newdesign. **newdesign untouched.**
- **Timezone (#1345, follow-up):** shipped the **S5-3** fix — chosen strategy is
  **client-sends-local-date**. New `src/lib/local-day.ts` (`clientLocalDay` +
  `weekMondayOf`); `nutrition/meal-log` · `client/checkin` · `client/checkin-kit`
  honor a client `date` (UTC fallback); mobile `_localDate()` + web
  `toLocaleDateString('en-CA')` on the day-scoped writers (weigh-in, meal log,
  habit toggle, weekly check-in, measurements, workout minutes). Day-scoped
  *writes* now bucket on the user's calendar day; coach *read* windows still
  aggregate in UTC (display ranges). `?v=20260617` on the touched client pages.
- **Rate limits (answered):** the app's own `/api/*` limiter is live (verified
  `check_rate_limit` + `rate_limits` in the DB). The real login/signup
  brute-force limits are **Supabase Auth → Rate Limits** (dashboard / Management
  API — can't be set from the repo); strongest login defense is enabling
  **Auth CAPTCHA** + leaked-password protection.
- **Still open — need an external decision/input, not engineering** (tracked in
  the report): **S4-6** Supabase Auth rate limits (dashboard); **S1-2**
  consultation + Auth **CAPTCHA** needs a Turnstile/hCaptcha provider + keys
  (`TURNSTILE_SECRET_KEY`); plus S3-4 (latent) + the gym dead-code path + P3s.
- **Manual (can't be done via the available MCP tools):** add **`Secret scan
  (gitleaks)`** to `main` branch protection to make it a hard gate (Settings →
  Branches → required status checks).
- **Manual follow-up:** add **Secret scan (gitleaks)** to `main` branch protection
  if you want it to be a hard gate (it's advisory until then, same as the existing
  Web + Mobile checks).

### 2026-06-17 — AI features shipped (#1326) + CodeRabbit review pass
- **#1326 merged to `main`** (squash `d341198`) — the accumulated **AI-features**
  work, all server-side, human-in-the-loop on every write, RLS/endpoint
  authoritative, audited + reversible:
  - **Nora takes actions (AI1–AI6)** — preview→confirm→`ai_audit_log`→undo; 7 tools
    (Tier 1 `log_meal`; Tier 2 `set_client_goal` / `assign_workout` /
    `assign_meal_plan` / `set_program_detail` / `add_review_note` /
    `reschedule_session`). Coach writes gated by `is_coach_on_client` /
    `is_discipline_coach_on_client` at the **endpoint + RLS**. Single-use signed
    tokens (nonce reserved before execute, released on failure). Confirm card in
    both chat UIs (web `CwProposalCard` + mobile `BSNoraProposal`).
  - **Proactive notifications (AI8/AI9)** — fire only on real engine events;
    per-type×per-channel preference center, quiet hours, daily cap, dedupe,
    never-shaming copy + sanitize guard; per-habit reminders.
  - **AI directive engine + coach triage routing** (one lead per page,
    discipline-routed); coach directive override (audited, reversible).
  - **Nora voice** — server STT (`/api/ai/transcribe`) + server TTS
    (`/api/ai/speak`, verbatim + `X-Spoken-Text` parity); tone/voice synced.
  - **Source reconciliation (INT2)** — per-source observations, authoritative
    source per metric (override else device rank, never blended).
  - **Dietitian (RD/RDN)** as a first-class nutrition-discipline provider (rides
    the nutritionist rails) + self-serve signup; **NC1 nutrition compliance**
    (credential capture, licensure↔client-state match, scope gating, consent +
    audit, attestations). **Hard enforcement (`NUTRITION_COMPLIANCE_ENFORCE`)
    needs healthcare-regulatory counsel sign-off** — engineering controls only.
- **CodeRabbit review pass (commit `54ff99b`, this session)** — addressed the
  full review on the open PR before merge (verified each against the code, fixed
  every valid finding, skipped 3 verified false-positives):
  - **Critical** — assignment keys (`client_id`, provider id) are **immutable on
    UPDATE** so a coach can't reassign a row to an un-coached client (which would
    bypass the on-client INSERT guard). This is enforced by the `freeze_*_keys`
    triggers the PR already shipped in `2026-06-17-coach-write-scope-update-guard.sql`
    — I'd briefly added duplicate triggers to `coach-write-scope.sql` before
    spotting the companion migration; those were removed (DB only ever got the
    `freeze_*_keys` set). `apply/route.ts`: nutrition attestations enforced
    **server-side** (`attestationsComplete`), not just in the signup UI.
  - **Major** — `draft-message` builds its AI grounding record **server-side**
    from `get_client_stats` (never caller input — also fixes a client stats
    race); `proposals.mjs` audit-write failure after a successful execute no
    longer throws (returns `audited:false` + logs; confirm route surfaces it so
    the UI hides Undo); `notify` parallelizes the per-client scope checks +
    persists dedup state **before** delivery (so a delivery failure can't resend);
    dietitians routed through the nutrition rails (`providerDiscipline`) for
    roster + notification eval; voice opt-out honored in `speakVoice` (explicit
    Listen forces); self-written `detail.directive` stripped (coach-only); habit
    reminder writes scoped by `user_id`; notify throttle stamped only after a real
    payload; `chatWidget` mic stream released on recorder failure; self-service
    `addRole('dietitian')` blocked.
  - **Minor** — audit `?limit` defaults to 50 not 1; no raw DB-error leaks
    (`client/compliance`, `coach/review-note` → 500 not a misleading 403);
    `DashPill` gets a hex (not `rgba`) color; `index-explorations` `?v=` aligned.
  - **Skipped (verified):** the `/v1/responses` + `gpt-5.4-mini` note in `ai.ts`
    (intentional, documented), the `chatWidget.jsx` `?v=` bump (the file *was*
    edited), and the `BSTerrainProfile` "theme token" flag (`INK/BG/TEAL` are
    theme-derived locals).
- **War Room:** registered the new AI/compliance routes in `RAW_ROUTES`
  (`/api/ai/{audit,audit/undo,directive,directive/override,draft-message,
  draft-message/sent,notify,notify/cron,proposals,proposals/confirm,speak,
  transcribe}` · `/api/coach/review-note` · `/api/integrations/reconcile`) and
  added the AI-features checklist section.
- **Migrations — ALL applied to Supabase this session** (idempotent; via the
  MCP). Verified the AI-features batch live (`ai-audit-log`, `ai-proposal-nonces`,
  `notification-center`, `nutrition-compliance`, `program-detail-discipline`,
  `source-reconcile`, `dietitian-role`, `coach-write-scope` + its
  `…-update-guard` `freeze_*_keys` triggers, `replace-provider-licenses`) and
  applied the two that were still missing — **`review-note-delete`** (author
  DELETE policy on `coach_workout_review_notes`) and the **`coach-write-scope`
  base** (the discipline predicate + split owner/INSERT policies). Security
  advisors after: **0 ERROR**; remaining WARNs are pre-existing / by-design
  (gated SECURITY DEFINER RPCs, `function_search_path_mutable` on older funcs,
  write-only intake policies, public media buckets, leaked-password toggle
  deferred to Pro).
- Verified: 225/225 tests · `tsc --noEmit` · `next build` · mobile build +
  `public/m` in sync. CI green on `54ff99b`; CodeRabbit marked every thread
  addressed.

### 2026-06-16 — Habits Grid card → instrument plate · sentence-cased habit names (#1324)
- **Grid card redesign (mobile, `iosAppBroadsheetHabits.jsx` `BSHabitGrid`):** the
  "Grid · Last 7 days" card was the odd one out — a soft `radius:12` card with gray
  pill dots and a plain "Grid" label, while its sibling `BSHabitScoreCard` is a teal
  `BSPlate`. Rebuilt it onto a **teal `window.BSPlate`** (left spine · clipped
  top-right notch · corner bracket; **no** pulsing live tick — it's a 7-day
  retrospective, not a live surface). Mono `LAST 7 DAYS` eyebrow + serif **"The
  grid."** (accent period) + the ink→accent ledger. The soft pills became **squared
  completion tiles** (new `Cell`: solid teal + glow = done-today `v===2`; `${teal}b3`
  = done-past `v===1`; teal outline = pending today; hairline outline = empty past).
  **Today's column** (always the rightmost) is accent-marked (teal day label + cell
  treatment). Theme-token only; visual-only (same `_bsHabitGridModel(habits)` path).
- **Sentence-cased habit names:** new **`_bsCapHabitName()`** capitalizes the first
  letter **only** when it's a lowercase `a–z` (leaves `10k steps`, symbols, and
  already-capitalized/brand names untouched), applied at the two data-load
  boundaries (**`_bsDecodeHabits`** + **`_bsMapServerHabits`**) — one place fixes
  every surface (Grid, To-do/To-don't rows, home tracker) for demo, local, and live
  signed-in habits. So "drink 3 glasses of water" / "smoking" now read "Drink 3
  glasses of water" / "Smoking".
- Verified headless (rebuilt the `/tmp` puppeteer pipeline per HANDOFF §3d); CI green
  (Web + Mobile required); 104/104 tests; `public/m` in sync. On **main** (dev synced).

### 2026-06-16 — Grocery polish · GetApp COMMUNITY slide · habits weekly stat + grid · web screenshots fit the phone (#1319–#1322)
- **Grocery (mobile, `BSGrocery` / `BSGroceryBuilder`):** compacted the Progress
  card; dropped the redundant "This week's plan" name from the list source-chip and
  un-boxed + enlarged its "Nutri plan · this week" label (8→12px). **The custom-list
  builder now auto-sorts a typed item into its aisle** — new `bsBuilderAisleFor()`
  (extends `bsGroceryAisleFor` to cover Frozen/Bakery/Household, Pantry fallback);
  the matching AISLE pill auto-selects live as you type ("· auto-sorted — tap to
  change"), a manual tap locks it ("· custom"), and it resets on add.
- **Get-the-App walkthrough (`public/newdesign/GetApp.html`):** last slide
  **CHAT → COMMUNITY** ("The social side of strong." — feed, channels, coach
  co-signs; its image is the community-feed capture `getapp-chat-v2.png`). Slide 4
  grocery now uses a clean **screen-only crop** of the dropped white capture
  (`getapp-grocery-v1.png` — device frame, white margins, and notch removed so it
  matches the other captures). **Screenshots now fill the phone:** `object-fit:
  contain → cover` + frame aspect `393/852 → 320/716` (matches the 600×1387
  captures). Removed two raw `Screenshot …png` uploads.
- **Habits page (mobile, `iosAppBroadsheetHabits.jsx`):** the top **"Earned today"
  card now also shows a "This week · from habits" line** — the week's Shape Score
  from habits (`+N`) + adherence %, from the existing `_bsHabitInsightStats()`.
  Added a **"Grid · Last 7 days"** card below it (DO/DON'T × 7 days, teal completion
  pills, today highlighted) from `_bsHabitGridModel()` + new `_bsDow3()`. Both
  reflect real habits; hidden on a fresh empty account (demo set shows signed-out).
- **Website `index.html`:** same screenshot fit fix (`.vis` → `object-fit: cover` +
  aspect `320/716`) so the landing-page phone shots sit edge-to-edge.
- All on **main** (dev synced); CI green per PR; 104/104 tests. Verified the habits
  layout with a headless render (see HANDOFF-2026-06-16 for the reusable
  screenshot pipeline).

### 2026-06-16 — Coach home polish: instrument-plate live banner · Coaches Edition band · thinner mastheads (#1303)
- **Live-now banner → instrument plate.** The trainer Today "LIVE · TRAINING"
  box was a rounded gradient card; restyled to a `BSPlate` matching the
  schedule/triage tiles — clipped top-right corner, rust accent spine, corner
  bracket, and a pulsing live dot in the eyebrow (new `bsLivePulse` keyframe,
  local to the block). Same content + tap-to-watch.
- **"Coaches Edition" band restored to the TOP** of both coach homes (trainer +
  nutritionist Today), under the day hero, mirroring the client home's "Clients
  Edition" placement. Removed the demoted bottom copy (no duplication); the
  `BSFooter` "The Coach/Nutri Edition" line stays.
- **Thinner mastheads.** Switched the coach-home mastheads (both Today) and the
  Workout/Client Review page masthead from the heavy `3px solid INK` rule (+ the
  double-rule strip) to the existing `thinRule` 1px hairline, matching the rest
  of the app's rules. Theme-token only; 104/104 tests, `public/m` in sync.

### 2026-06-15 — Fix: coach Today "Needs you today" matches by client id / name (review follow-up)
- Addressed the code-review finding (below) immediately: `BSProTriageFeed` no
  longer decides "has a session today" by a raw title substring. The live
  schedule builders now thread the event's **client identity** (`ev.with` →
  `client`, `ev.clientId`) onto each schedule row, and `onSchedule(c)` matches by
  **clientId** (live session events) or a **word-set name** match (covers the
  demo title + the live `with` field; "Drew" no longer matches "Andrew Park").
  So the "session/due item today" branch now works on LIVE accounts, not just
  demo. Mobile build + `public/m` resynced; 104 tests green; layer-1 review clean.

### 2026-06-15 — Code review (step 1) of coach-Today / client-profile changes + Vercel Agent Review note
- Ran the **`/code-review` skill (layer 1)** on this session's shipped mobile
  diff (commits `8d02b6f1`→`30dfe69c`: coach Today triage scoping + client
  Terrain facet-avatar size 44→64 + matched tier pills) — finder angles + one
  independent reviewer pass. Findings:
  - **(follow-up) `BSProTriageFeed` `onSchedule` is a substring match**
    (`subjects.some(s => s.includes(name))`): (a) false-positive on substring
    name collisions (e.g. "Drew" ⊂ "Andrew Park"); (b) on LIVE accounts calendar
    titles are session names (or the `'Consult'` fallback), not client names, so
    the "session/due item today" branch rarely fires and live "Needs you today"
    collapses to RED-only. Demo works (titles are client names). Graceful (red
    always shows; matches the existing best-effort live-wiring pattern) — not a
    crash. Fix later: match on the event's client id/field (or word-boundary
    name). Logged under "Known stubs / next".
  - Cosmetic / pre-existing (no action): the hero "%" badge vs `curLevel` pill
    can overlap at very low progress — PRE-EXISTING (the avatar bottom stayed at
    `here.y - 10`; only the top moved up with the size bump, and the top at max
    progress lands at `0` with no clipping); the `moreOnRoster` "+N more on your
    roster" phrasing is intentionally loose; the `SEVCOL.red` literal is pre-existing.
- **Vercel Agent Review:** confirmed it RUNS on every PR (it is NOT skipped) —
  it posts a **`neutral`** conclusion, i.e. advisory (like CodeRabbit), not a
  blocking status check. Making it *required* in branch protection would block
  merges (a `neutral` result doesn't count as `success`), so keep it advisory.
  It's a Vercel-side setting — not configurable from the repo.

### 2026-06-15 — Review stack: /code-review + CodeRabbit + required checks
- Three review layers now gate non-trivial changes (documented under "How we
  work"): **(1)** the `/code-review` skill run on the diff before merge;
  **(2)** **CodeRabbit** auto-review on every PR into `main`/`staging` — config
  added in **`.coderabbit.yaml`** (assertive profile; skips the generated `public/m`
  bundle + lockfiles; path-instructions for `mobile-app/src/broadsheet`,
  `public/newdesign`, and `src/app/api`); **(3)** **required status checks** on
  `main` (Web + Mobile must be green to merge).
- **Manual one-time setup (can't be done from the repo):** install the
  **CodeRabbit GitHub App** on `cperry8800-droid/shape-app` (coderabbit.ai →
  add repo), and enable **branch protection** (Settings → Branches → rule on
  `main`) requiring "Require a PR before merging" + the two CI status checks.
  Until both are done, CodeRabbit won't comment and red checks won't block.
- **Now live:** CodeRabbit App installed + reviewing PRs (profile **assertive**
  in `.coderabbit.yaml` — repo config overrides the dashboard; it reviewed
  PR #1290). The full per-PR check set is documented under "How we work →
  CI checks on every PR". Branch protection (required Web + Mobile) still pending.

### 2026-06-15 — Input hardening: reject oversized/malformed payloads + size guard
- **Centralized request-size guard in the proxy** (`src/lib/supabase/
  middleware.ts`): every `/api/*` body request is capped by Content-Length —
  **1 MB** general, **30 MB** for upload/batch routes (apply · progress-photos ·
  meal-note · voice · garmin webhook) — returning **413** before the handler runs
  (App Router has no default cap). Covers all 106 routes, web + app.
- **Shared `readJson()`** (`src/lib/request-utils.ts`): a size-bounded (413),
  empty/malformed-safe (400) JSON reader returning a typed `{ok,data} |
  {ok,response}`. Applied to the unauthenticated/public write routes (the
  attacker-reachable surface): contact · app-waitlist · intake · consultation ·
  apply (JSON branch) · community/feed · support/chat. These already
  clamp/validate every field (`cleanText`/`isEmail`/`isISODate`); this adds the
  missing byte cap + consistent malformed rejection.
- **XSS:** there is **no `dangerouslySetInnerHTML`** anywhere (app/web/mobile) —
  output is React/JSX-escaped, so input "sanitization" here is size/shape/type
  bounding, not HTML-stripping (which would corrupt legit content for no gain).
- *Scope:* the size cap is global; the readJson malformed/parse guard now covers
  **every** JSON-body `/api` route — the public write routes PLUS all authenticated
  routes (full rollout, `commit 720832c`), with `allowEmpty:true` preserving
  empty-body-tolerant routes (e.g. billing-portal). The two server-to-server
  webhooks (garmin, push/dispatch) are excluded (large/external payloads, already
  size-tiered). No migration; tsc + next build + 104 tests green.

### 2026-06-15 — API rate limiting (all routes · web + app) + 5/15min on auth
- **Every `/api/*` route is now rate-limited in the proxy** (`src/lib/supabase/
  middleware.ts`) — one chokepoint covering BOTH surfaces, since the website
  (cookie, 96 same-origin `fetch('/api/...')`) and the mobile app (native →
  `VITE_API_BASE_URL` with Bearer; `/m/` web → same-origin) both hit the same
  Next deployment. Two tiers: **auth writes** (`/api/auth/*` non-GET) =
  **5 / 15 min by IP** (the brute-force tier); **general** = **100 / min** per
  caller. Signed-in callers are keyed by **user id** (cookie `user.id`, or the
  Bearer token's `sub` via unverified parse) so shared NAT IPs aren't
  collectively throttled; anonymous + auth callers key by IP.
- **Backed by Postgres** (no new infra, matches the existing DB-in-middleware
  pattern): migration **`2026-06-15-rate-limits.sql`** (**run on Supabase**) —
  RLS-locked `rate_limits` table + atomic SECURITY DEFINER `check_rate_limit(key,
  max, window_seconds)` (fixed-window counter, opportunistic GC, granted to
  anon+authenticated). Helper `src/lib/rate-limit.ts` (edge-safe).
- **Fails OPEN** (and is a silent no-op until the migration is applied) so the
  limiter can never take the API down. On limit: **429** + `Retry-After` +
  `X-RateLimit-*`. **Skips** server-to-server / monitoring routes (stripe +
  garmin webhooks, push/dispatch, health) and `OPTIONS` preflight.
- *Scope:* covers all of OUR `/api/*` endpoints (shared by web + app). Calls the
  app/website make **directly to Supabase** (data RPCs/reads via the publishable
  key) are governed by Supabase's own limits + RLS, not this. **The real
  login/signup/OTP brute-force protection must be set in Supabase Auth → Rate
  Limits** — those credential requests go straight to Supabase, bypassing the
  Next app (the app's `/api/auth/*` are only session-bridge/signout helpers).
  The legacy `mobile-app/server` Express app isn't part of the deployed surface.

### 2026-06-15 — Session-details graphs: Strava-style charts + per-activity GRAPH-TYPE RULE (all activities, live data)
- **The activity **Session details** page now renders pro-grade, axis-labeled
  area charts** (modeled on Strava/Garmin), driven by the post's REAL device
  data and applied to **every activity type** (runs, rides, swims, strength,
  recovery, …). The page is sectioned (Summary → primary velocity → Power → HR
  → Splits → Cadence → Elevation → Output); each chart renders **only when its
  series is present** (honest-absent otherwise) — demo cards are the signed-out
  fallback.
- **GRAPH-TYPE RULE (activity → charts)** — the canonical mapping. The primary
  velocity chart is **sport-specific**; everything else is data-gated:
  - **Pace** (M:SS, y-axis inverted so faster reads higher) → run · walk · hike.
  - **Pace /100m** (M:SS, inverted) → swim.
  - **Speed** (mph, not inverted) → ride/cycle. **Power** (W) is its own chart
    when a power meter is present (rides).
  - **Heart rate** = bpm area chart + **time-in-zone** labeled bars (Z1–Z5) →
    ANY activity with HR (incl. strength/lifting).
  - **Cadence** (spm runs / rpm rides), **Elevation** (ft terrain profile) →
    whenever the stream exists; **Splits** = a column chart (mile splits for
    runs, intervals for rides/swims, working **sets** for strength).
  - **Summary** = the mains (hero distance + Time · Avg pace/speed · Avg HR ·
    Calories); leftover scalars fall to **Output**. Mile x-axis markers appear
    only when distance is in **miles** (runs/rides), skipped for metric swims.
  - Implemented in `iosAppBroadsheetClient.jsx` (`AreaChart` primitive + the
    `paceCfg` per-sport switch in `BSActivityDetail`); the rule is mirrored
    **server-side** in `fetchStreams` (sport → which velocity unit).
- **Live data wiring (applies to real accounts, not just demo):** Strava sync
  now pulls `heartrate, cadence, altitude, velocity_smooth, watts, distance` in
  ONE streams call per new activity → `metrics.{hrTrace,cadenceTrace,elevTrace,
  paceTrace,powerTrace}` (velocity converted per sport: mph / sec-per-100m /
  sec-per-mile; altitude→ft; run cadence→spm; watts→power). **Each series is
  resampled EVENLY BY DISTANCE** (via the cumulative distance stream) — so the
  chart x-axis is true distance and the mile markers line up exactly (no
  even-pacing assumption); falls back to time-uniform downsampling when there's
  no distance stream (indoor/treadmill). These flow through
  `communityPostFromRow.rawMetrics` → `bsActivityFromPost` → the detail. WHOOP
  posts (no per-second streams) still get **zones + stats**, honestly trace-less.
  Stream fetch is capped per sync (rate limit) and only for NEW posts.

### 2026-06-14 — Feed reactions: activity-mapped verb (one unified count) + coach co-sign
- **The single fixed "Spot" is now a DISPLAY-ONLY verb mapped from the post's
  activity type**, over **ONE unified reaction count** (the verb never forks the
  tally — it stays the portable social currency for profile totals + a weekly
  most-reacted view). New pure module **`mobile-app/src/services/reactionVerbs.mjs`**
  (`BS_REACTION_VERBS` + `bsActivityBucket` + `bsReactionType/Verb`):
  strength→**Spot**, pr/milestone→**Beast**, run/endurance→**Respect**,
  swim→**Gliding**, cycle→**Watts**, recovery/rest→**Smart**, nutrition→**Locked
  in**, sleep→**Recharged**, mobility/yoga→**Centered**, sport/anything-else→**Props**
  (the fallback — never blank, never a strength-only word on a non-strength post).
  `tests/reaction-verbs.test.mjs` (7 tests; in `npm test`).
- **Wiring:** `bsActivityFromPost` now carries `activityType` (from the
  `activity_type` column the composer already stamps) + `cosign`; the shared
  **`ActivityCard`** resolves the verb (PR — a real new-best `delta` — reads Beast
  over the base type) and shows `'{verb} · {count}'` in the **exact existing
  Spot-pill style** (unchanged look).
- **Coach co-sign** (layered on any activity): when the reactor is the athlete's
  **own coach**, it's the same unified like but **badged distinctly** (solid
  role-colored "{name} co-signed", heavier than peer reactions) and **eligible to
  notify** the athlete. Gated on a real coach↔client link — `ShapeAssign` roster
  client-side, **server re-checked** in the RPC. `communityPostFromRow` exposes
  `metrics.cosign`; `toggleLike` forwards a `cosign` flag to
  **`post_coach_cosign`** (migration `2026-06-14-coach-cosign.sql` — SECURITY
  DEFINER: re-checks `is_coach_on_client`, records the like, stamps
  `metrics.cosign` so every viewer sees the badge, notifies the athlete), degrading
  to a plain like until deployed.
- **Applies to ALL profiles** — the card lives in the shared `BSClientFeed`
  rendered by the client + trainer + nutritionist apps (`BSClientChat`,
  window-exposed). Added swim/cycle/rest demo cards; preview generator
  `scripts/feed-reaction-preview.mjs` renders the real mapping. 101/101 tests,
  `public/m` in sync.
- **Phase 2 SHIPPED (same day) — long-press expressive palette.** A press-and-hold
  (~420ms) on the reaction opens a small inline chip row of alternate reaction
  **words** (no emoji): the post's contextual verb leads, then the universal set
  **Fire · Props · Crushing it · Don't stop**. Picking one **re-labels MY reaction
  but stays the SAME unified like** (count never forks — 41→42; persists only when
  the like state flips, a relabel is local). The button then shows my chosen word.
  Default + fallback verb stays **Props**. `bsReactionPalette(defaultVerb)` (+3
  tests, 104/104). Co-sign composes unchanged; applies to all profiles.

### 2026-06-14 — Mobile Home restructure (one today, no duplication) + dashboard header gap
- **Client Home (`BSClientHome`) restructured** — layout/hierarchy only, the
  existing look preserved (merged from the `mobile-redesign` branch, applied
  cleanly over main's later feed-card work):
  - **Leads with one `Today · your move` directive.** It takes the engine's top
    priority when there is one (`window.ShapeSignals → evaluateClient`, mapped to a
    move: checkin_overdue / streak_broken / food_gap / goal_slip / score_drop), else
    the next-thing-to-do. The up-next agenda only renders its own
    `Today/Tomorrow/Yesterday` label when the **selected** day isn't today, so a
    glanced "today" never appears twice (`upNextLabel` gated on `selIdx !== todayIdx`).
  - **Home glances; tabs own the lists.** The meals block collapses to a single
    next-meal glance + `N more · Open Eat →` (new `goEat` hook → `setTab('eat')`,
    with a `Next ↑` badge when that meal is the hero target); habits trim to 3 rows
    + `+N more`. The full lists live on Eat / Habits.
  - **Hierarchy sharpened**: the `Your goal` card (`BSMeGoalCard compact`) moved
    below the weekly check-in; agenda titles stepped 25→21; `Avg kcal` reframed as
    `In your deficit · on track` (goal-framed, not a bare number).
- **Dashboard header gap tightened (website, all three dashboards).** The shared
  fixed header is ~81px (logo 60 + 10px×2 pad + 1px rule) but `pageShell`'s spacer
  reserved 96px → a ~15px dead band above every dashboard's content (client/trainer/
  nutritionist all share `Header`). Spacer → **84** desktop / **88** mobile (band
  ~3px), and `DashSidebar` sticky offset 96→84 to match on scroll. Cache-busts:
  `pageShell.jsx?v→20260614` (67 pages), `trainerDashboard.jsx?v→20260614b` (44).
- Shipped on **main** (dev kept identical) — `b940c4fe` (gap) → `8056c204` (home);
  94/94 tests, `public/m` in sync, dash render-review 113/114 (the 1 fail
  pre-exists). *Note:* the `mobile-redesign` feature branch is now fully on main
  and can be deleted.

### 2026-06-14 — PR Wall: auto-posts every public member's new PR (all roles)
- **New community channel "#PR Wall"** — pinned to the TOP of the chat Channels
  list for **every** profile (client + both coach roles; shared `BSClientFeed`),
  right under Shape HQ (mirrors the existing always-pinned HQ pattern). Real
  channel when it exists, canonical seed otherwise.
- **Auto-post pipeline (public profiles only):**
  - **Migration `2026-06-14-pr-wall.sql`** (**run on Supabase**): seeds the
    system "PR Wall" channel (`created_by null`), a `pr_wall_posts` dedupe ledger
    (best value already posted per user+lift), and `post_my_pr_to_wall(lift,
    value, unit, reps)` — a SECURITY DEFINER RPC that **re-checks the caller is
    PUBLIC** (`shape_profile_visibility = 'public'`), confirms the value beats
    their last posted best, posts the message as them, advances the ledger, and
    auto-joins them to the channel. Non-public members + non-PRs post nothing.
  - **Route `POST /api/community/pr-wall`** (auth Bearer/cookie) → the RPC.
  - **Client**: `window.ShapePRWall.post/announce`; `saveWorkoutSessionLog` fires
    `announcePRsFromSetLogs(setLogs)` after a save (best-effort, non-blocking) —
    the heaviest completed set per move (capped 6) → the route. The RPC is the
    authoritative public + new-best gate, so over-calling is safe.
- War Room: `/api/community/pr-wall` registered in `RAW_ROUTES`. *Note:* PR
  detection is the session's best-per-move with the RPC ledger as the dedupe; a
  user's very first logged session seeds their current bests (one-time).

### 2026-06-14 — Coach dashboards are now single-page apps (trainer + nutritionist)
- Same instant-tab treatment as the client SPA, for both coach roles. New shells
  **`TrainerApp.html`** + **`NutritionistApp.html`** load every tab module ONCE and
  hash-route client-side (`#today/#schedule/#clients/#programs|plans/#business/
  #playlists/#community/#goal/#score/#profile`) — no reload, no Babel recompile per
  tab.
  - Extracted the heavy inline page components into modules: `trainerClientsPage.jsx ·
    nutritionistClientsPage.jsx · trainerGoalPage.jsx · nutritionistGoalPage.jsx ·
    trainerScorePage.jsx · nutritionistScorePage.jsx` + the shared
    **`dashProfileExtras.jsx`** (identical across both profile pages). The legacy pages
    load these + a thin mount, so they still render standalone.
  - The role-shared components (`CoachDashboardPage`/`CoachSchedulePage`/
    `CoachBusinessPage`/`CommunityPage`/`LiveProfilePage`) take their role/demoRole prop
    per route; the Playlists `TRAINER_CTX`/`NUTRI_CTX` (previously inline) live in each
    shell. `coachNav.jsx` items point at `TrainerApp.html#<slug>` /
    `NutritionistApp.html#<slug>`.
  - The 20 legacy `Trainer*.html` / `Nutritionist*.html` nav pages **redirect** into
    their shell at the top of `<head>`. Sub-pages (client detail, live console, new
    program/workout, messages) stay standalone.
  - Verified offline: all 20 routes render via ReactDOMServer with zero React warnings;
    render-review updated to load the extracted roster modules (113/114, the 1 fail
    pre-exists). Preview-tested before merging.

### 2026-06-14 — Client dashboard is now a single-page app (instant tab switching)
- **The 11 standalone client dashboard pages were each a full reload that
  re-downloaded Babel and recompiled ~430 KB of JSX in the browser** — multi-second
  blanks + slow tab switches (also read as "page won't load"). Replaced with one
  shell, **`public/newdesign/ClientApp.html`**, that loads every tab module ONCE and
  **hash-routes client-side** (`#today/#progress/#workouts/#nutrition/#library/#team/
  #community/#score/#habits/#goal/#profile`) — switching tabs is instant (no reload,
  no recompile). Each route renders exactly what its old page mounted (ChatWidget
  included).
  - Extracted the 5 heavy inline page components into reusable modules:
    `clientLibrary.jsx · clientTeam.jsx · clientScore.jsx · clientHabits.jsx ·
    clientMeSettings.jsx` (the thin pages already used shared `dash*.jsx` modules).
  - **`clientNav.jsx`** items now point at `ClientApp.html#<slug>` — a same-document
    hash change inside the shell (instant), a normal nav into it from elsewhere. Also
    fixed the long-standing cache-buster gap: `clientNav.jsx` now carries `?v=` on all
    17 pages (it had none, so edits never reached returning users).
  - The 11 legacy `Client*.html` pages **redirect** to `ClientApp.html#<slug>` at the
    top of `<head>`, so every entry (login · signup · marketing nav · `/api/me/role` ·
    bookmarks) lands directly in the SPA. Their bodies remain as the SPA's module
    source.
  - Verified offline: all 25 modules load + all 11 routes render via ReactDOMServer
    with zero React warnings; dash render-review unchanged (113/114, the 1 fail
    pre-exists). Preview-tested on the dev-branch Vercel URL before merging.
- *Follow-up:* the coach dashboards (trainer/nutritionist) are still multi-page — same
  treatment pending.

### 2026-06-14 — Demo-data zero-out for signed-in accounts (habits · goals · progress · profile)
- **A fresh signed-in account no longer shows demo data** across the personal
  surfaces (the broader "everything zeroes out once you log in, since we have no
  coaches yet" pass). Signed-OUT preview is unchanged everywhere — the demo
  persona is the preview-only fallback. Gate pattern throughout:
  `signedIn = !!window.ShapeAuth?.getCachedState?.()?.user?.id`.
  - **Habits** (`iosAppBroadsheetHabits.jsx` `_bsHabitGridModel`): signed-in with
    no habits → empty grid (`rows: []`) instead of the 14 demo rows; the page
    shows its add-first state.
  - **Goals** (`BSClientGoals` + the three tab dashboards): seeds from a new
    zeroed `BS_GOALS_EMPTY` (not the demo "Lean by August" `BS_GOALS_DEFAULT`).
    Training → stats 0, lifts/milestones empty-state, 0/0 "Strength held" plate +
    flat heatmap, demo coach-program card hidden. Nutrition → macros/milestones
    empty-state, weekly targets zeroed, demo nutritionist plan card hidden.
    Overall → no demo "Jordan / Dr. Maya" plan flash (empty → "find a coach"),
    weekly targets zeroed, "Your why" only when written.
  - **Progress hub** (`BSClientProgress`) + **Me "Your progress" grid**
    (`BSMeKpis`): both merged live data over a DEMO base — added a same-shaped
    zeroed `BSPROG_EMPTY` and switch the merge base to it when signed in (KPIs
    `—`, charts "Not enough data yet.", empty PR/session/food lists). The
    "what's next" plate no longer pulls the demo persona for a signed-in account.
  - **Terrain profile** (`BSTerrainProfile`) + Me score card (`BSScoreCardDark`):
    hid the demo "Coached by Maya Okafor · Hypertrophy Block II" band unless a
    real coach OR real program phase exists; the activity feed shows only real
    posts/PRs (empty-state when none, no demo field-notes); zeroed the Shape
    Score composite bars + the 1284-pt fallback. (Climb/disciplines/lifts/signals
    were already live-or-zeroed from the prior session.)
- Shipped across commits `68e600ba`→`2849a710` on **main** (dev branch kept
  identical); 94/94 tests + `public/m` in sync on each. *Remaining demo (social,
  not personal):* the chat Community feed's `SigActivity` proof cards + the
  "N lifting now" presence rail are still illustrative (wire to a real presence/
  activity feed later).

### 2026-06-14 — App↔website parity: directive-led sweep + shared signal engine
- **The website dashboard's intelligence layer now runs in the mobile app.**
  `mobile-app/src/main.jsx` side-effect-imports the canonical engine
  (`public/newdesign/dashSignals.js` → `window.DashSignals`); new
  `services/signalsMap.mjs` (pure ESM mappers) + `services/shapeSignals.js`
  (`window.ShapeSignals`: `selfRecord`, `coachRecords`, `triage(role)`,
  `goalProjection`, `goalSlipDays`, …) feed the app's existing `window.Shape*`
  data into it. One engine, three consumers (website `<script>`, Node tests,
  app Vite import). `vite.config.ts` `server.fs.allow:['..']` for the cross-root
  dev import. Tests: `tests/mobile-signals.test.mjs` (8 — mapped records flow
  through the real engine; the `{d,kg}` goal shape projects an on-pace ETA).
- **Every primary surface now LEADS with one directive, in the instrument-plate
  (`BSPlate`) language, with the dense stat grids trimmed:**
  - **Coach Today** — "Who needs you" triage feed moved to the TOP (above the
    schedule), now a tight **top-3** glance with **"See all N →"** + a "+N more"
    row that opens the Clients tab. Schedule rows + the Habits card got the new
    design (the habits card is the client-home "Daily habits." plate).
  - **Coach Clients roster** — triage-led: a verdict lead ("3 need you · …"),
    sorted at-risk→on-track with group headers, each row a severity spine + a
    one-line **directive** (what to do) + pill; program/streak detail dropped to
    the client page. New `bsRosterSeverity(client, role)`.
  - **Coach client detail** — opens with a **"Your move"** plate (severity +
    directive + read + CTA); KPI grid cut 4→2; the redundant "Analysis · last 30
    days" trendline removed.
  - **Client Home** — new **"Today · your move"** plate (next workout → meal →
    habits → done, each with its CTA); "Weekly totals" trimmed 4→2.
  - **Client Eat** — new **"Today"** next-meal directive above the (quiet)
    calorie strip. **Train** already led with its session hero + Start.
  - **Client meal logger / "Logged." / home week strip** — onto instrument
    plates (clipped one-tap action, squared mode tabs, BSPlate summaries, the
    ink→accent ledger).
  - **Client Goals (Overall + Nutrition)** — real engine **pace-projection ETA**
    (least-squares `projectGoal` over 8 wks + week-over-week slip): an "ETA"
    stat (projected date / Stalled / 1y+ / Refresh) replacing the demo
    "On track"/"Adherence", plus an ETA chip in the hero. Honest "—" when the
    history is too sparse to project.
- Shipped across commits `f5587dd1`→`98dda474` on **main** (dev branch kept
  identical); CI green on each (web typecheck+build, mobile build + public/m
  sync); 94/94 tests throughout. *Follow-ups:* wire the coach roster severity to
  live `ShapeSignals.triage` once rosters carry `userId`s; port milestones /
  joint-attention coach nudges into the app.

### 2026-06-12 — Dashboard side nav stays on Profile/Me + client "Me" → "Profile" (#1285)
- **`LiveProfilePage` gains `shell`** (`{ navItems, payoutCard }`): the living
  profile renders INSIDE the dashboard chrome (site Header + `DashSidebar` +
  main) so the side nav + Shape Score card stay present on TrainerProfile /
  NutritionistProfile / ClientMe. `DesktopProfile` gains a `chrome` flag
  (drops its own header/footer when embedded — exactly one Header). All
  states wrap (loading/sign-in/demo/live); in-page "Back to dashboard"
  links removed. MemberProfile (public page) keeps standalone chrome.
- **Client dashboard nav renamed "Me" → "Profile"** (`clientNav.jsx`);
  ClientMe passes the `"profile"` active key.
- Tags: `livingDesktop.jsx?v=23` · `livingProfilePage.jsx?v=20260612c`.

### 2026-06-12 — Living profile everywhere + signed-out demo mode (#1283)
- **`LiveProfilePage` gains `demoRole`** — signed out, the page renders the
  LV_PEOPLE demo persona on the real living layout under a "Preview · demo
  profile — an example of a live account · Sign in →" band (the app's
  preview concept), never a bare sign-in wall. Demo follow counts; Follow →
  /login; Message → chat widget.
- **`ClientMe.html` (dashboard Me) is profile-first**: the living Terrain
  profile leads (own when signed in, demo when out); the full Account &
  settings section (all rows/modals/health profile/danger zone, + back link,
  Log out, Edit details) rides below via the `extras` slot. The redundant
  `LivingProfileCustomizer` card removed and **`profileCustomizer.jsx`
  deleted** (the profile's ✎ Customize modal edits the same doc).
- **TrainerProfile / NutritionistProfile / MemberProfile** pass `demoRole`
  (trainer/nutritionist/client) → signed-out shows the demo Signal/Terrain.
- **Marketplace verified already-living**: real coaches → `MemberProfile
  ?u=…`, demo coaches → `?name=…&role=…` derived profiles. No change.
- `livingProfilePage.jsx?v=20260612b` on all 4 consumer pages.

### 2026-06-12 — Assign-time + hero-plate compaction (#1281) · dashboard Profile = the living profile itself (#1280)
- **Trainer Assign page: optional "Session time"** chip row ("No set time"
  default) — a time agreed with the client rides in
  `client_workouts.payload.time` on every scheduled workout. Surfaces
  everywhere: calendar derived events, `/api/client/plan` (`time` field),
  the home up-next card (label + agenda sort) + workout preview, and the
  Train deck hero (live builder now sets `time`/`timeLabel` like the demo).
- **Compaction (per screenshots)**: the Goals "Down so far" plates (teal
  Overall + gold Nutrition — number 44→32, % 34→24, tighter slider/pads)
  and the Train deck hero plate (headline 26→21, smaller coach row + ▶).
- **#1280 — the dashboard Profile pages now RENDER the living profile**
  (the #1276 editor form wasn't what was wanted): MemberProfile.html's live
  wiring extracted into shared **`livingProfilePage.jsx`** (`LiveProfilePage`,
  `extras` slot → `DesktopProfile.belowContent`); TrainerProfile/
  NutritionistProfile are now the coach's actual Signal page (own variant,
  "✎ Customize profile" modal) + back-to-dashboard link + Danger zone below.
  The living Customize modal gained the **climb-background picker**
  (`DK_CLIMB_BGS`, mobile parity). MemberProfile slimmed to 57 lines;
  `livingDesktop.jsx?v=22`. ClientMe keeps the form editor.
- **Scope-sharing correction**: babel-standalone executes via global eval —
  top-level consts DO cross script files (that's how livingShared's
  LV_* reach livingDesktop with no export). `Object.assign(window, …)` is
  belt-and-braces convention, not a requirement; the #1276 gotcha note
  overstated it.

### 2026-06-12 — "Nutri plan" chip + push-to-client auto-sync (calendar · grocery · real coach names) (#1278)
- **Grocery source chip + list-picker plan row renamed "Nutri plan"** (was
  "Coach plan"); the home meals card's corner tag matches. The picker's plan
  row shows the real assigned plan title when one exists.
- **Push-to-client now lands on the client CALENDAR automatically** — closes
  the "calendar events remain demo" gap (War Room, 2026-06-11). `/api/calendar`
  GET gains two **derived read-only sources** (no duplicate rows to drift):
  `client_workouts` with a `scheduled_date` in range → WORKOUT events
  (trainer pushes), and the active `client_meal_plans` menu expanded by
  day-of-week from **this week forward** → MEAL events ("Lunch · 620 kcal"
  subs — the event sheet's kcal parser reads them). Mobile month view +
  website CalendarOverlay both already gate editing on `source === 'event'`,
  so plan events are view-only everywhere with zero front-end changes. RLS
  scopes the coach `?clientId` view to plan rows they authored.
- **Real coach attribution when logged in** — `/api/client/plan` returns
  `training.coach` + `meals.coach` (resolved from the public-read trainers/
  nutritionists rows; no migration). Mobile threads them through: home meals
  card footer, Eat "Your plan" card (+ "This week" replaces the fake "Apr
  plan"), the swap-note recipient, and the auto-built grocery list's
  author + name (the nutritionist's real name + plan title). Demo names stay
  strictly the signed-out / no-plan fallback.
- **Grocery already synced** (verified, no change needed): the default shop
  list is `bsBuildPlanGrocery(liveProgram || demo)` — a nutritionist push
  flows menu → meals → grocery items on the next plan fetch (≤60s cache).

### 2026-06-12 — Dashboard Profile pages = living-profile editors (all account types) (#1276)
- **The dashboard Profile pages were static mocks** (`TrainerProfile.html` /
  `NutritionistProfile.html` — Maya/Rae demo data, fake pricing/payout/insurance
  rows, a dead Edit button, a fictional "1-hour review window") in the old
  design. Both rewritten: DashPage shell kept (nav · payout card · "Preview
  public page →" to MemberProfile.html · Danger zone), body = the new
  **`LivingProfileCustomizer`** (`public/newdesign/profileCustomizer.jsx`).
- **The customizer reads/writes the SAME `user_goals('profile_custom')` doc**
  as the mobile Profile Customizer and the MemberProfile edit modal — bio ·
  cover upload (community-photos bucket) · accent · climb background ·
  headline stats (≤3) · pinned highlight · profile song · prompts (≤4) ·
  social links — so edits sync web ⇄ app. Saves spread over the loaded doc,
  preserving fields other surfaces own. Signed-out renders a sign-in card.
- **`ClientMe.html`** gains the same editor (`role="client"`, above the Health
  profile card) — covers all three account types.
- **Gotcha re-learned:** babel-standalone scripts do NOT share top-level
  scope — every shared `newdesign/*.jsx` must `Object.assign(window, {…})`
  its exports (pageShell/trainerDashboard/coachNav all do; the new file
  initially didn't and the pages would have thrown).

### 2026-06-12 — Ticker + settings/customizer instrument passes · in-place goal edit · real GPS routes (PRs #1267–#1271)
- **War Room**: coach credential verification (cert + insurance COI, expiry
  tracking, Verified badge, admin queue) registered as the liability-backing
  to-build (P2 Coach tools + Marketplace checklist).
- **Ticker** (`BSTicker`, shared client + coach Today): instrument plate —
  clipped corner, accent spine, fixed pulsing live tick under the marquee.
  New **HAB metric** (today's habits done/total + pts, live; green when all
  done); saved ticker prefs auto-append new metrics (load + render + editor).
- **Goals page**: the Overall card's Edit now opens an **in-place primary-goal
  chip sheet** (saves `client_goals.primaryGoal` + mirrors
  `client_identity.goal` + `shape:identity`) — it used to deep-link into the
  Settings takeover, which unmounted Goals so back couldn't return. Audited:
  that was the only context-losing Edit.
- **Settings**: section heads get the accent ledger rule; hub rows carry 3px
  spines (rust on Account actions); segmented prefs use accent-tint chips;
  Sign out squared w/ rust tint. **Profile Customizer is now a FULL-PAGE
  takeover** (was a 90% sheet) with the instrument pass throughout (clipped
  cover plate, squared tiles/chips/save).
- **Polish**: radio now-playing bar ~12px thinner; `BSFollowBlock` row aligns
  center so the Follow pill sits on the counts line.
- **Real GPS routes on feed cards**: posts carrying normalized points render
  `BSActivityRoutePreview` (true polyline + start/end + provider/elevation/
  privacy chip); halftone tile only when flagged routeless. Strava points
  arrive privacy-zoned. War Room: Garmin route extraction once approved
  (needs OUR OWN start/end privacy trimming — raw Garmin GPS has none);
  **Whoop has no GPS** — strain/HR only, never routes.

### 2026-06-12 — Check-in kit website parity (client pages + coach client page)
- **New `GET/POST /api/client/checkin-kit`** (cookie/Bearer, RLS-scoped): GET →
  my check-ins + measurements + health profile; POST `action:'checkin'`
  (upsert this week's row + measurement entries) or `action:'health'` (upsert
  user_goals 'health_profile'). Exists so the self-contained newdesign pages
  don't need a supabase client; mobile stays direct.
- **`ClientProgress.html`**: new `CheckinKitSection` under the Trends tab —
  the full weekly check-in form (6× 1–10 ratings, weight + 6 girths,
  front/side/back photo attach via `/api/client/progress-photos`,
  wins/struggles/question, prefills this week's row) + **Measurements**
  (latest per site + Δ) + **Progress photos** timeline cards. Renders nothing
  signed-out / pre-migration.
- **`ClientMe.html`**: new **Health profile** card (PAR-Q 7×Yes/No + injuries +
  medications + emergency contact; all-clear/flagged status chip) saving via
  the kit API.
- **`coachClientDetail.jsx`** (`?v=20260612` on TrainerClient + Nutritionist
  Client): `/api/clients/:id/shared-overview` now also returns `checkins`,
  `measurements`, `progressPhotos`, `healthProfile` (the coach-gated RPCs);
  the page renders **Latest check-in** (6 ratings + wins/struggles/asked-you),
  **Health profile · screening** (liability card), and **Body · measurements &
  photos**.

### 2026-06-12 — The check-in kit: weekly check-in · measurements · progress photos · health intake (research-driven)
- **Coach-metrics research** (5-agent web pass — Trainerize/Everfit/TrueCoach/
  TeamBuildr/MyPTHub/PT Distinction/PN/WAG + ACE/NASM): full gap analysis
  registered in the War Room ("Check-in kit & coach-metrics gaps"). Built the
  three standard-of-care gaps now; steps/e1RM/energy·hunger/hydration UI and
  the differentiators (cycle awareness, weekend-split adherence) tracked as
  to-builds.
- **Migration `2026-06-12-checkin-kit.sql`** (**run on Supabase**):
  `client_measurements` (ACE sites, one row/user/day/site), `client_checkins`
  (one/user/week, ratings jsonb + wins/struggles/question + weight),
  `client_progress_photos` + PRIVATE `progress-photos` bucket, and 4 coach
  RPCs (`get_client_checkins/measurements/progress_photos/health_profile`) —
  all owner-RLS'd, coach read gated on `is_coach_on_client`. The health
  profile is deliberately NOT share-gated (liability screening).
- **`BSWeeklyCheckin`** (client): the weekly ritual — 6× 1–10 ratings
  (training/nutrition adherence · sleep · energy · stress · hunger), optional
  weight (also writes a weigh-in) + 6 girth measurements + front/side/back
  photo uploads + wins/struggles/question. Upserts this week's row. Entries:
  **home due-plate** ("Weekly check-in · due") when no row this week +
  Settings → Weekly check-in.
- **`BSHealthIntake`** (client): REQUIRED one-time gate after sign-in (PAR-Q+
  7 yes/no + injuries + medications + emergency contact + consent; yes-answer
  warning). Gates in `BSClientAppInner` (never flashes for completed accounts,
  fails open on fetch errors); editable later via Settings → Health profile.
- **Progress hub (Overall)**: live-only **Measurements** card (latest per site
  + Δ since first) and **Progress photos** timeline (date rows of front/side/
  back thumbs → tap to open).
- **Coach client profile** (both roles): Profile tab gains **"Check-in · Week
  of …"** (ratings grid + wins/struggles/asked-you); Manage tab gains **Health
  profile** (PAR-Q all-clear/flagged + injuries/meds/emergency) and **Latest
  measurements**. All live-only via `window.ShapeClientKit`.
- **Backend**: `ShapeCheckins` / `ShapeMeasurements` / `ShapeProgressPhotos`
  (private-bucket upload via **`/api/client/progress-photos`**, service-role +
  1-yr signed URLs) / `ShapeHealthProfile` (user_goals 'health_profile') /
  `ShapeClientKit` (coach reads). Website parity tracked as the next PR.

### 2026-06-12 — Stats accuracy: weight/body-fat/macros/volume get REAL sources (+ demo-data preview banner)
- **Audit finding**: the Progress page read everything from `daily_health_snapshot`,
  but `weight_lb`, `body_fat_pct`, `protein_g`, `hydration_l` had **no writer** —
  the per-field demo fallback silently showed example numbers that looked live.
  Demo data stays (it's the intended signed-out example); the fix is real sources
  for signed-in accounts:
- **(1) Weight**: `/api/client/progress` now builds the weight series from
  **`client_weigh_ins`** (what Log-weigh-in writes), normalized to lb; snapshot
  rows remain the fallback. Fixes the split-brain where Goals showed real
  weigh-ins and Progress showed demo weight.
- **(2) Body fat**: **migration `2026-06-12-weigh-in-body-fat.sql`** (**run on
  Supabase**) adds `client_weigh_ins.body_fat_pct`; the weigh-in sheet gains an
  optional **Body fat %** field (`ShapeWeighIns.log({ bodyFat })`, pre-migration
  retry guard); the progress body-fat series reads it (select('*') so the route
  works pre-migration).
- **(3) Meal macros**: new **`POST /api/nutrition/meal-log`** accumulates
  kcal/protein/carbs/fat (+ optional hydration) onto today's snapshot row —
  called from the one-tap "Ate as planned" and the full logger's Log action
  (`window.ShapeMealLog.log`). Nutrition "today vs target" + macro adherence now
  track actual logging.
- **(4) Volume**: in-app live-session saves roll `durationSeconds` into
  `daily_health_snapshot.workout_minutes` (accumulating, best-effort) — the
  Progress volume series counts app workouts alongside device-synced ones.
- **Preview banner re-added** (was removed 2026-06-11): preview mode again shows
  the dismissible bottom banner, reworded to "**Preview · demo data** — These
  numbers are an example of a live account — not real tracking." with the $5/mo
  Join CTA. Still hides under the Radio prompt.

### 2026-06-12 — Grocery page: source chip · Lists tab · small ＋ box (clutter removed)
- **"+ NEW LIBRARY" and the "AUTO-BUILT FROM YOUR MEALS" eyebrow removed** from
  the grocery header. In their place: a **source chip** under the title that says
  exactly which list is loaded — **"Coach plan · this week"** (teal, the default
  plan-built list), **"Your library · custom"** (purple, a list from Saved carts),
  or **"Recipe list"** (amber, sent from a recipe) — plus the list's name.
- **`Lists` is now a first-class tab** in the eat-section rail (Day · Grocery ·
  Lists · Recipes — `BSNutritionTopTabs` is 4-up): the grocery-list library
  (Saved carts) opens from any eat view, and the library page itself renders the
  rail (active = Lists) so navigation reads the same everywhere. Recipes already
  had its tab.
- **Small ＋ box** (squared, spine) top-right of the grocery header opens the
  Build-a-list page for a new custom grocery list; the library's "＋ New grocery
  list" CTA is squared/clipped to match.

### 2026-06-12 — Milestone Shape points · goals tabs live-wired · habits demo lock + more demo habits
- **Migration `2026-06-12-goal-milestone-points.sql`** (**run on Supabase**):
  `award_my_goal_milestones()` — SECURITY INVOKER, self-scoped. Reads the Overall
  goal (user_goals client_goals) + latest `client_weigh_ins` row, computes the
  25/50/75/goal thresholds (cut or build), and credits **+50/+75/+100/+200 pts**
  into `score_ledger` (category other, source_kind `goal_milestone`, deterministic
  md5-uuid source_id → the existing dedupe index makes it idempotent). Returns
  only newly credited milestones.
- **Client wiring**: `window.ShapeGoalAwards.check` (shapeBackend) runs after every
  weigh-in log AND on Goals-page open (catch-up) — each new credit toasts
  "+N pts · {milestone}" and invalidates the metrics cache.
- **Goals Training/Nutrition tabs wired to the real account** (demo stays the
  fallback, per request): Training hero/stats/lifts/milestones derive from
  `ShapeProgress.train` (PRs → done milestones + next target, avg RPE, streak);
  Nutrition milestones use the live weigh-in trajectory (same auto-✓ math as
  Overall). Overall milestones were already live.
- **Home habits card**: demo-gated checkboxes now show a 🔒 (matching the app's
  other gates) and route to the habits page; live accounts keep the working
  check-off. **Demo habit set +5 rows** (vitamins · morning sunlight · journal ·
  no smoking · no added sugar) and the add-sheet suggestion chips expanded
  (10 do / 9 avoid).

### 2026-06-12 — Home: one meals card · live habit check-off (+pts flash, rows leave) · compact goal card above the day
- **All meals of the day are now ONE agenda card** (same chrome as the workout
  card): "{Today/Weekday}'s meals." with each meal sectioned off inside — slot ·
  time eyebrow, tappable title → its preview, macro subline, per-meal **Log → /
  ✓ Logged** pill — plus a logged-count eyebrow and the nutritionist footer.
  `mealCardFor` (one card per meal) is gone; the agenda sorts the meals card by
  the earliest meal time vs the workout.
- **Home habits card check-off is live**: each row's box toggles the habit right
  on the card (stopPropagation — card tap still opens the habits page). Toggle
  flips the selected day in the habit's history, mirrors into tweaks (instant
  re-render) and POSTs the same `/api/client/habits` toggle the habits page uses.
  On completion a **"✓ +N pts → Shape Score" chip flashes** (~2s) and the
  **completed habit leaves the card** (rows = not-done only; "All done — +N pts
  banked" state when everything's checked). Demo habits (signed-out) route to the
  habits page. `_bsEncodeHabits` now window-exposed from the habits module.
- **Featured goal card moved + compacted**: now sits right above the day's
  agenda section (was below habits), with a `compact` mode on `BSMeGoalCard`
  (tighter padding, 16px title, slimmer bar) — Me-page usage unchanged.

### 2026-06-12 — Goals: one Edit per tab (nav Edit removed) · per-tab goal cards · home goal link
- **Goals header**: the nav-bar Edit button is GONE (it duplicated/confused with the
  goal card's Edit); the eyebrow ("Your goal · By …") is compacted (smaller, tighter
  tracking) so it doesn't truncate.
- **Per-tab goal cards** (replacing the single "Primary goal" card): **Overall =
  the primary goal** (profile-synced text, Edit → profile editor — per request
  "overall can be primary goal"); **Training** and **Nutrition** show their own
  headline goals (Edit → the headline sheet). Card is accent-spined per tab.
- **Overall body-comp targets stay editable**: a mono **"Edit targets →"** action
  inside the "Down so far" hero plate opens the old overall sheet
  (title/start/now/target/date/why) — the record the nav Edit used to open.
- **Home → Goals link**: the Me page's featured goal card (`BSMeGoalCard`, now
  squared w/ teal spine — shared, so Me matches) renders on HOME under the habits
  card and opens the full Goals page (goals/progress early-return overlays added
  to `BSClientHome`).

### 2026-06-12 — Home habits → one agenda card · habits page + goals page instrument pass
- **Home HABITS section is now ONE agenda-style plate** (same `BSPlate` chrome as
  the workout/meal cards — green spine, tick, bracket): eyebrow `HABITS · n/m
  done` + `+pts / possible`, serif "Daily habits." title, compact numbered rows
  (DO/AVOID chip · name · status · +pts · ✓ state), footer rule + View →.
  **Tapping anywhere on the card opens the habits page** — check-off now lives
  there (the per-row home checkboxes are display-only state). The old BSSection
  ledger + numbered-row list is gone.
- **Daily habits page instrument pass** (`iosAppBroadsheetHabits.jsx`): the
  Earned-today card is a `BSPlate` (tick + bracket, squared bars), habit rows are
  squared cards w/ a do/avoid accent spine (squared checkbox), empty-state add
  row squared. Add-sheet stays a quiet rounded form by the two-tier rule.
- **Goals page instrument pass** (Overall / Training / Nutrition): all three tab
  heroes are `BSPlate`s (teal/rust/gold — squared sliders + heatmap tiles), stat
  mini-cards are squared tiles w/ per-stat spines (Me-grid recipe), the tab rail
  is the instrument segment (per-tab accent tint + top tick, solid-fill INKON
  dropped), trend/plans/program/plan/why/primary-goal cards squared w/ accent
  spines, Open → buttons squared. Edit/weigh-in sheets stay quiet forms.

### 2026-06-12 — Instrument pass: progress · store · meal preview · live session · calendar (+ polish batch)
- **Design rollout extended to the remaining client pages** (screenshot-driven):
  **Progress hub** (squared KPI tiles + section cards w/ teal spines, instrument
  segment tab rail w/ top tick, squared per-series trend chips), **Shape Store**
  (balance hero = clipped dark plate w/ accent spine; category/“Within balance”
  pills = squared spine chips), **Meal preview** + recipe macro bar (clipped
  hero-photo plate, plated macro stats, squared split bar/cards, clipped Log-now),
  **Live session player** (clipped rest plate, squared set inputs/checks, clipped
  Start/Next CTAs, queue current-row spine, squared review chips), **Calendar
  month** (squared day cells w/ selected top tick, squared dots/legend; event-sheet
  stat plates carry the event accent; sheet CTAs squared/clipped), **Home workout
  preview** (squared action chips, clipped Begin-session, coach-note spine;
  `BSSaveButton` squared app-wide).
- **Live-session starting sets default to 3 for EVERY move** (duration/cardio
  segments included — was 1; authored “N × reps” schemes still win).
- **Terrain profile**: “In training” status bubble removed entirely; the climb’s
  current-level label reads just the tier name (was “Tempo · now”).
- **Notifications page emoji icon tiles removed** (#1255) — rows carry a 3px
  accent spine instead; `_bsNotifStyle` returns just the accent color. Same PR:
  profile tab rail fits one line, Cards ▾ trigger restyled to the accent chip,
  status-chip dot dropped (chip then fully removed in this batch).

### 2026-06-11 — Instrument design run (home + dock + radio) · day-log → meal cards · store math
- **Instrument plate look** (boxy · futuristic · less analog, per request) shipped
  across: the home **up-next cards** (`AgendaCard` — clipped top-right corner via
  two stacked clip-path layers, 3px accent spine, pulsing status tick, corner
  bracket, squared buttons), the **weekly-totals tiles**, the **day/habit tag
  badges** (angular, accent left edge) + habit checkbox, the section ledger rules
  (2px ink → accent gradient fade), the **THIS WEEK strip** (angular day tiles,
  active = accent plate w/ top tick, Month-view chip), the **tab bar** (instrument
  dock: gradient hairline + gliding glow tick above the active tab, active tab on
  a clipped plate, inactive = bare glyphs, squared badge), and the **radio
  now-playing bar** (frame-layer clipped plate + spine; fx intact). A full
  design-system rollout (`BSPlate` + two-tier rule) is **parked in Next up**.
- **Home Day Log + quick-confirm sheet REMOVED** (by request): every meal of the
  selected day now renders as its own agenda card (same anatomy as the workout
  card — slot+time eyebrow, serif title, macros, byline, Log now → marks that
  meal via the logger callback), time-sorted with the workout card. Live =
  assigned plan (`bsHomeLiveWeek.mealsByIdx`); demo only with no plan. Habits
  stays. `HOME_LUNCH` + day-log plumbing deleted (−360 lines). Preview banner in
  demo mode also removed.
- **Score page Rewards tab live-wired**: featured rows from the shared
  `BS_STORE_PRODUCTS` catalogue (module scope; ids match the server's
  `store-catalogue.ts`) with real-balance affordability ("✓ Redeemable" / "N to
  go"), tap → the Shape Store (the one redemption flow).
- **Annual membership credit math fixed**: a Shape year is $5/mo × 12 = **$60**,
  not $200 → retail 60 / **1,200 pts** in all three catalogues (server + mobile +
  website). The mobile retail→cost derivation (20 pts = $1) now runs ONCE at
  module scope — the Store page used to mutate the shared list on mount, so the
  Rewards tab disagreed until the Store was opened.
- **Theme contrast guards** (Black-paper unreadable on phone): `makePalette`
  ignores a saved ink override that can't read on the chosen paper (contrast < 3)
  and flips the mono black/white accents to the readable side (contrast < 1.6).
- **War Room**: North Star / mission panel restored to the default Status view
  (it had moved to the Architecture tab in the split). "— for $5/month." removed
  from the paywall intro + index meta description. Marketplace got the standard
  masthead band; live-session sets default to 3 for schemeless strength moves
  (duration lines stay 1) with a **＋ Add set** button mid-workout.

### 2026-06-11 — One data layer: shared client-metrics cache (no more dueling endpoints)
- **`cachedClientJson(path)`** in `shapeBackend.js`: the 5 client rollup
  endpoints — `/api/client/analytics · progress · train · nutrition · plan` —
  now share **one in-flight promise + cached RAW response per endpoint**
  (60s TTL, uid-scoped keys so account switches never see stale data). Callers
  keep their own transforms (`ok`/`has_data` filters) on top, so every existing
  call site works unchanged: `ShapeAnalytics.get/getProgress`, all four
  `ShapeProgress.*`, and `ShapePlan.get` (Home + Train + Eat + Goal previously
  fetched the plan 4×) all read through the cache.
- **The ticker and the Progress hub now literally consume the same response** —
  the audit's "RHR/sleep can differ between screens" race is gone, and the
  duplicate per-surface fetch storm is collapsed to one request per endpoint
  per minute.
- **Invalidation**: weigh-in log, check-in log, workout-session save, and
  sign-out clear the cache (`window.ShapeMetrics.invalidate()` exposed for
  future writes). War Room gap closed.

### 2026-06-11 — War Room de-cluttered: 4 top-level views + collapsible checklist
- **`/warroom` is now tabbed** (`WarRoomClient.tsx` only — data untouched):
  **Status** (stat row · P1 queue · live services · next steps · config) ·
  **Checklist** (sections are collapsible accordions with per-section `n/m`
  progress, ✓-green when complete) · **Architecture** (North Star · flow map ·
  diagram) · **API routes** (the browsable/probeable list). The stat cards +
  view tabs stay pinned on every view — no more one endless scroll.

### 2026-06-11 — Home tab wired to the real assigned plan (day log · dots · up-next)
- **New `bsHomeLiveWeek(plan, t)`**: builds the home week from the REAL assigned
  plan (`/api/client/plan` — the same source Train + Eat read). Workouts slot by
  `scheduledDate` (Train-deck rules), meal-plan days by `dow`; produces per-day
  day-log rows, week-strip dot colors, the up-next workout model
  (`{title, sub, detail:{moves, meta, note}}` — same shape the card/preview
  already consume), and a per-day lunch record in the `BSMealPreview` shape.
- **Wiring (live wins, demo only when NO plan exists):** `dayLog`,
  the week-strip `dots`, `selWorkout` (up-next workout card + preview — falls
  to the "Active recovery" card on uncovered days), and `selLunch` (meal card
  hides on live days with no assigned meal — `mealCard` now null-guarded).
  Habits, the score chip, the ticker, and the coach feed were already live.
  Dead `todayWorkout` const removed.
- **Assignments now complete the loop end-to-end**: coach assigns from the
  catalogue → the client's HOME day log + week dots + up-next cards show it,
  same as Train/Eat. Calendar events remain demo (tracked in War Room).

### 2026-06-11 — De-duplication pass: coach Profile⇄Analysis merged + one Progress home
- **Coach client profile is now 2 tabs (Profile / Manage).** The Analysis tab's
  KPI grid duplicated the Profile tab's cards, so the tab is gone; its unique
  pieces — the 30-day summary line + trendline chart — folded into Profile as an
  "ANALYSIS · LAST 30 DAYS · The read" section (between Macros/Body and Recent
  sessions). Same data, one tab. (`BSProClientFullProfilePage`; the dead
  `analysisView`/`aKpis` block removed.)
- **Me → Stats no longer embeds a second copy of the Progress hub.** It keeps
  the compact `BSMeKpis` grid (now tappable → Progress via the existing
  `onOpenProgress`) + a "Full progress & trends →" link card. The 3-tab
  `BSClientProgress` renders ONLY on the Progress page now — no more two
  instances racing the same fetches.
- **Goal page Overall slimmed to goal-framing.** The weight trend chart (the
  most-duplicated visual in the app) and the consistency heatmap moved out —
  the Trend section is now a compact row (latest weight + so-far + log count,
  keeps the **Log weigh-in** action) that links through to Progress
  (`onOpenProgress` threaded from both Me containers: Goal closes → Progress
  opens). Kept: goal hero card, 4-up goal stats, milestones, Your plans, This
  week targets, Your why. Dead `consist` loader removed.
- **Website parity (same pass, follow-up PR):** `coachClientDetail.jsx` — the
  Analysis tab was FULLY redundant on the web (its 6-up grid + trendline both
  duplicated Overview's own KPI grid + weight chart), so the tab bar is gone
  and the page is single-view (`?v=20260611` added on TrainerClient.html +
  NutritionistClient.html, which had no cache tag). `ClientGoal.html` Overall —
  same treatment as mobile: trend chart → compact row (latest weight + so-far +
  log count, keeps Log weigh-in) linking to `ClientProgress.html`; consistency
  heatmap removed; dead `TrendChart`/`consist` code deleted.

### 2026-06-11 — Assign to client: coach catalogue plans → the client's Train/Eat
- **The missing middle of the core loop** (flagged in the flow review): a coach
  could only sell a plan (marketplace) or hand-tune a client (Adjust) — there
  was no "put this client on my saved program." Now there is, with **no
  migration**: assignments write the SAME tables the client's `/api/client/plan`
  already reads — `client_workouts` (extended the existing direct-Supabase
  `assignClientWorkout` with `scheduled_date`) and `client_meal_plans` (the
  existing `POST /api/nutritionist/meal-plan`, which archives the prior menu).
- **New `BSProAssignPage`** (pros app, role-accented): entered from **(a)** an
  **ASSIGN** pill on every Plans-tab library row (trainer Plans/Workouts/
  Programs + nutritionist Plans/Programs/Diet — catalogue rows now carry
  `detail` through) or **(b)** the client profile's **Manage tab → "Assign from
  your catalogue"** card. Whichever half is missing gets an inline picker:
  saved `coach_plans` of the right kind, or the coach's REAL linked clients
  (`/api/trainer|nutritionist/clients` — now accepts **Bearer** auth too, was
  cookie-only, so the native coach app works).
- **Outline → plan conversion** (`bsAssign*` parsers): a weekday split
  ("Mon — Upper (push)" × 3+) schedules one titled workout per day across N
  weeks (rest lines skipped); an exercise outline ("Secondary compound · 4×8")
  becomes one weekly session with parsed sets/reps; meal-plan blocks
  ("Lunch — bowl · 600 kcal") become a 7-day menu with slot/kcal + day targets
  from the plan's authored calories. Trainer flow has a start-day picker +
  weeks stepper (defaults from the plan's "N weeks"); nutritionist replaces
  this week's menu. On assign the client gets a 1:1 note
  (`metadata.kind:'plan_assigned'`) — demo clients show "assigns once linked".
- `shapeBackend.js`: **`window.ShapeAssign`** `{ clients, workout, mealPlan }`.

### 2026-06-11 — Dependabot (monthly grouped minor/patch) + API security audit clean
- **`.github/dependabot.yml`**: monthly **grouped** version updates for root npm,
  mobile-app npm, and github-actions — **minor/patch only** (majors are deliberate
  projects; alerts still fire). Dependabot PRs run through the CI gate; mobile-dep
  bumps will fail the `public/m` sync check until republished (by design — handle
  in session, don't auto-merge). *Manual:* enable **Dependabot security updates**
  in GitHub Settings → Advanced Security (alerts are on by default for public
  repos). Note: the bluetooth-le patch-package patch must be regenerated if that
  package is ever bumped.
- **Full API security audit (all 99 routes): zero vulnerabilities.** Verified:
  proxy membership gate (28 routes), per-route auth + RLS scoping (41), the 18
  service-role routes all webhook-gated or auth-checked first, 3 webhooks verify
  signatures, 14 public-by-design routes leak nothing. No IDOR on any dynamic-ID
  route. Secrets scan clean — only the by-design `sb_publishable_` key is
  committed; no service-role/Stripe/webhook secret values in the repo.

### 2026-06-11 — Live heart-rate monitor (Bluetooth LE) + Radio HR-sync wired real
- **New `mobile-app/src/services/hrm.js`** (`window.ShapeHRM`): connects to any
  standard Bluetooth Heart Rate profile device (service 0x180D — Polar/Garmin/
  Wahoo straps, watches in broadcast mode) via `@capacitor-community/bluetooth-le`
  (^7.3.2, matches Capacitor 7). One codepath covers the native build AND Web
  Bluetooth (Chrome desktop/Android — testable today); readings broadcast as
  `shape:hrm` window events.
- **Radio "Heart-rate sync" card now uses real data**: Connect monitor opens the
  system device picker when Bluetooth is available; the YOU number shows the live
  reading ("You · live" teal label) and the free/matching/in-sync stages compute
  from the real delta. Falls back to the existing demo simulation when Bluetooth
  is absent (iOS WebView pre-native-build, Safari) or the picker is cancelled —
  demo easing never runs over a live reading.
- **Native prep done**: Android manifest (BLUETOOTH_SCAN neverForLocation +
  CONNECT, legacy pair ≤ API 30, bluetooth_le feature optional) + iOS
  `NSBluetoothAlwaysUsageDescription`. Activates on the native build via
  `npx cap sync` (same pattern as push notifications).
- **Song BPM remains authored/demo** — real BPM is blocked until Shape Radio
  streams audio we control (compute at ingest then; Spotify's tempo API is
  deprecated for new apps). Tracked in War Room with the HRM activation steps.

### 2026-06-11 — CI gate on main: typecheck + builds + public/m sync check
- New **`.github/workflows/ci.yml`** runs on every PR into main (+ pushes to
  main/staging): **Web** (root `npm ci` → `tsc --noEmit` → `next build`) and
  **Mobile** (`mobile-app npm ci` → `VITE_BASE=/m/` build → **`diff` the fresh
  dist against the committed `public/m`** — fails with republish instructions
  when the mobile source was edited without copying the bundle, a recurring
  break-main mistake). All four checks verified green at current HEAD before
  shipping. Merge discipline updated in "How we work": open PR → **wait for CI
  green** → **review the diff** (standard pre-merge pass for non-trivial changes:
  logic bugs, missed `?v=` bumps, theme-token violations, shared-component blast
  radius) → squash-merge. *Manual (optional, GitHub Settings → Branches):* add a
  protection rule on `main` requiring the two checks, which makes the gate hard
  even for manual merges.

### 2026-06-11 — Test branch: long-lived `staging` → stable Vercel preview URL
- Created the **`staging`** branch (from `main` @ 831ca84). Vercel preview
  deployments were already enabled for the project, so no config was needed —
  every push to `staging` now auto-builds at the permanent URL
  **shape-app-git-staging-cperry8800-droids-projects.vercel.app** without touching
  production. Workflow + caveats documented in "How we work" above (shared
  production Supabase DB; treat `staging` as a force-pushable scratch pointer;
  main merges still go through PRs).

### 2026-06-09 — Security: clear remaining transitive dep advisories (npm overrides)
- Pinned the patched same-major versions of the transitive moderate-severity
  deps via `overrides` (no breaking bumps): root → `postcss ^8.5.15`,
  `ws ^8.21.0`, `qs ^6.15.2`; mobile-app → `ws ^8.21.0`, `qs ^6.15.2`.
- Result: **both packages now report 0 vulnerabilities** (`npm audit --omit=dev`).
  Smoke-tested: root `tsc --noEmit` + `next build` clean, mobile `npm run build`
  clean. No source changed (deps only); `public/m` bundle unchanged.
- **RLS confirmed fully on**: all 66 public tables have RLS enabled AND ≥1 policy
  (0 tables RLS-off, 0 deny-all). Clean bill of health.
- *Still manual (no MCP tool / Pro-plan dashboard toggle):* enable **Leaked
  password protection** at Auth → Providers → Email (HaveIBeenPwned check).

### 2026-06-09 — Security: Next.js 16.2.3 → 16.2.9 (patch bump, smoke-tested)
- Resolves the **high-severity** Next.js advisories (middleware/proxy bypass,
  cache poisoning, SSRF on WS upgrades, image-API DoS, RSC XSS, …) — relevant
  because the membership paywall is enforced in the proxy/middleware layer.
- Same-major **patch** bump (not the 16.x major jump), so low risk. Smoke test:
  `tsc --noEmit` clean and `next build` succeeds on BOTH 16.2.3 (baseline) and
  16.2.9 — identical route output, proxy/middleware compiles. After the bump the
  only remaining prod-dep advisories are moderate transitive (ws/qs/postcss).
- Pinned exact (`"next": "16.2.9"`) to match the repo's existing style; lockfile
  changes scoped to `next` + its `@next/*` sub-packages.

### 2026-06-09 — Fix: restored missing RLS policies (DMs + engagement were deny-all)
- Supabase security advisors flagged `messages`, `conversation_participants`,
  `community_likes`, `community_comments` as **RLS enabled but 0 policies** —
  deny-all for normal roles. This was silently breaking real 1:1 DM sends/reads
  and the like/comment engagement writes (the optimistic UI showed them; the DB
  insert was denied). `conversations` was also down to 1 of its 3 policies
  (missing insert + update).
- **Migration `2026-06-09-restore-missing-rls-policies.sql`** (**applied via MCP +
  in repo**): recreates the missing policies verbatim from their originals
  (`2026-05-02-conversations-messages.sql`, `2026-05-02-community-feed.sql`).
  Deliberately surgical — does NOT touch `community_posts` (preserves the
  2026-06-09 'profile' visibility read policy) and redefines no functions.
  Verified after apply: messages 2, conversation_participants 2, conversations 3,
  community_likes 3, community_comments 3 — and **zero** public tables remain in
  the RLS-on/no-policy (deny-all) state.

### 2026-06-09 — Profile Music tab: personal playlist library (public/share) — Spotify & Apple Music
- **Migration `2026-06-09-member-playlists.sql`** (**run on Supabase**): `member_playlists`
  table (owner-scoped; provider spotify|apple|other, url, cover, track_count, is_public,
  saved_from) + RLS (public rows readable by anyone, owner full control) + SECURITY DEFINER
  `get_member_playlists(p_user_id)` (own → all; else only public, gated on profile visibility).
- **`ShapePlaylists`** backend (`mine`/`listFor`/`add`/`update`/`remove`/`parseUrl`): paste a
  Spotify or Apple Music playlist link, name it, mark public/private. `parseUrl` classifies
  the provider.
- **New "Music" tab** on both profiles (member Terrain + coach Signal, via `BSLivingTabs`):
  `BSProfilePlaylists`. **Own profile** = "Your library" — add (`BSAddPlaylistSheet`),
  per-row Public/Private toggle, ✉ Send (DM the playlist to a member via the generalized
  send sheet — `kind:'shared_playlist'`), ↗ share, × remove. **Others' profile** = their
  public playlists, each with ▶ Open (Spotify/Apple) + ＋ Save-to-my-library (copies the row,
  `saved_from`). Provider-colored tiles (Spotify green / Apple red).

### 2026-06-09 — Post & channel engagement: like · comment · send · share · repost (app + website)
- **No migration** — `community_likes`/`community_comments` (+ RLS gated on
  `can_view_community_post`) existed since 2026-05-02; this wires them everywhere.
- **`BSPostActions`** under every profile activity card (member Terrain + coach
  Signal): ♥ live like toggle, ↳ comments bottom-sheet (list + composer),
  **✉ Send** (member picker → real 1:1 DM with `shared_post` metadata), ↗ system
  share (clipboard fallback), **⇄ Repost** (new public post quoting the original
  via `metrics.repostOf`). Engagement fields plumbed through `bsMapActivityPosts`
  + `communityPostFromRow` (which now also maps `repostOf`).
- **Chat feed**: bubble posts gained ✉ ↗ ⇄ next to the existing live ♥/↳; the
  Strava-style **activity cards** now persist cheers as real likes (seeded, no
  double count), persist comments with the CORRECT post id (fixed: the card key's
  `post-` prefix was being sent as the id, so comments never landed), and carry
  ✉ ↗ ⇄. **VERIFIED badge removed** from activity cards; the action row is
  uniform 27px pills.
- **Channels shareable**: every channel row has ✉ (DM the channel — the message
  carries `metadata.channel`, rendering as a tappable "# name · Open →" card in
  the recipient's thread that deep-links into the channel) and ↗ share. The send
  sheet is generalized for channel payloads; both DM thread mappers map
  `sharedChannel`.
- **Website** (`dashboardCommunity.jsx`): likes + replies now PERSIST for live
  posts (direct `community_likes`/`community_comments` writes), and the action
  row is complete — ✉ SEND (member picker → `get_or_create_member_conversation`
  → `messages` insert), ↗ SHARE, ⇄ REPOST (`/api/community/feed`). Demo cards
  self-explain. (Site has no real-channels UI — a shared channel shows as text
  in the site widget, the tappable card in the app.)

### 2026-06-09 — Usernames: every account gets a Shape handle (@username)
- **Migration `2026-06-09-usernames.sql`** (**run on Supabase**): `profiles.username`
  (unique, case-insensitive) + RPCs — `is_username_available` (anon, signup
  typeahead), `set_my_username` (validates `^[a-z0-9][a-z0-9._]{2,19}$`),
  `get_email_for_username` (anon — lets the login form accept either; note:
  username→email is enumerable by design, standard trade-off). Also recreates
  **`search_shape_people`** (matches usernames, prefix-ranked) and
  **`get_public_profile`** (returns `username` as a new LAST column).
- **Login accepts email OR username** — mobile (`BSLogin`: "Email or username"
  label, type/text + autocomplete swap) and website (`login.jsx`): a value with
  no `@` (or a leading `@handle`) resolves via the RPC first; friendly "no
  account with that username" error.
- **Signup picks a username** (client + coach roles share the mobile screen):
  lowercase-sanitized field with **debounced live availability** ("@you is
  yours" / taken), required before submit. Rides in `user_metadata.username`
  and is claimed via `set_my_username` — immediately when a session exists,
  else **on first (confirmed) login** (`ensureUsernameClaimed` in signIn +
  getCurrentSession). Website `signup.jsx` gains the same `UsernameField` on
  the client + pro personal steps; coach applications carry `details.username`
  (note: the website client signup remains an application stub — it collects
  but doesn't create the auth account; real accounts come from the app).
- **Handle display prefers the real username**: Settings identity seed and the
  Terrain/Signal profile `@handle` read `profile.username` / `get_public_profile
  .username` first (saved client_identity handle still overrides own card).
- `ShapeAuth.checkUsername` / `claimUsername` exposed; `?v=20260609` stamps on
  `login.jsx` + `signup.jsx` script tags.

### 2026-06-09 — Search v3: beyond people (channels · recipes · workouts · coach plans) + chat-script cache stamp
- **Universal search now matches more than people** (All filter only; Members/
  Coaches chips stay people-only): **Channels** (live `ShapeChannels.list`,
  tap → opens the channel thread directly via a `channel` payload on
  `shape:openConversation` + a new deep-link branch in the chat `openRequest`
  effect), **Recipes** (`SHAPE_KITCHEN_RECIPES`, tap → the kitchen recipe detail
  in-place), **Workouts** (`BS_CLIENT_WORKOUTS`, tap → the workout preview;
  Start hands off to `shape:startWorkout`), and **Coach plans**
  (`ShapeMarketPlans.list`, tap → the coach's Signal profile). Mono glyph tiles
  (# ◇ ▣ ✦), max 4 rows per section; "no results" only when every section is empty.
- **Website chat cache fix**: ~82 pages loaded `chatWidget.jsx` /
  `clientChatThreads.jsx` / `globalChatButton.js` with **no `?v=` tag**, so prior
  copy changes (e.g. Nora's "Shape's Concierge" line) stuck on the browser-cached
  version. Every reference now carries `?v=20260609` (newdesign + root marketing
  pages) — bump these on future chat-script edits.

### 2026-06-09 — Search v2: handles/goals, inline Follow+Message, people-you-may-know, coached-by link
- **Migration `2026-06-09-universal-search.sql` updated** (idempotent — **re-run on
  Supabase**): `search_shape_people` now also matches **@handle** (leading `@`
  stripped) and **bio + goal keywords** (skipped for private-visibility profiles).
- **Inline row actions** (`BSSearchFollowBtn`/`BSSearchMsgBtn`): every real-account
  result row carries a **Follow / Requested / Following** pill (live `ShapeFollows`
  state + toggle) and a **✉ Message** button — creates/finds the real 1:1
  (`get_or_create_member_conversation`) and jumps straight to the thread via a new
  **`shape:openConversation`** event (handled in the client shell + both coach
  shells → `chatRequest.conversationId`). Demo people keep the plain chevron.
- **"People you may know"** — the empty state's suggestions now come from the
  follow graph (`get_follow_suggestions`: mutuals + follows-you, avatar-enriched),
  with "N mutual / Follows you" sublines; falls back to "On Shape" (any accounts)
  then the demo cast.
- **Recents = recently *viewed***: `BSPublicProfile` records every non-self profile
  view (from chat, feed, follows, search) into `shape.recentSearch`; the section is
  now labeled "Recent" and live-syncs via a `shape:recentSearch` event.
- **"Coached by" chip → live link** (member Terrain hero): tapping the coach opens
  their **Signal public profile** — resolved to the coach's real account when
  possible (new `ShapeCoachLookup.ownerOf` provider→owner lookup), derived profile
  otherwise. Also fixed a dormant bug: the live-coach capture treated the
  `{stored,data}` thread response as an array, so the real coach name never
  replaced the demo "Maya Okafor".

### 2026-06-09 — Universal search: find anyone on Shape (⌕ in every header)
- **Migration `2026-06-09-universal-search.sql`** (**run on Supabase**): SECURITY
  DEFINER `search_shape_people(p_q, p_limit)` — name search over every `profiles`
  row, returning role (client/trainer/nutritionist), profile photo
  (`user_goals('client_identity').photo`, withheld for private-visibility
  accounts), and all-time points (→ tier color). Prefix matches rank first.
- **`BSSearchCorner`** (monochrome ⌕, dispatches `shape:openSearch`) now sits
  **left of the avatar** in every header: the 5 client tab headers (via new
  `BSHeaderTools`), the chat masthead, the Terrain/Signal me-mastheads,
  `BSMeCorner` sub-pages, and both coach Today headers. Both coach shells +
  `BSClientAppInner` listen for the event and overlay the search screen.
- **`BSUniversalSearch`** (client module, window-exposed for the pros bundle):
  serif "Find anyone." screen with an autofocused underline input, **debounced
  live typeahead** (`ShapeSearch.people` → the RPC; falls back to `search_members`
  pre-migration, demo cast when signed out), **All / Members / Coaches** filter
  chips, **recent searches** (localStorage `shape.recentSearch`, cap 8, Clear),
  an **"On Shape" suggested list** on the empty state, and a no-results state
  that deep-links to the Marketplace. Rows = tier-colored facet avatar + role
  eyebrow + name; tap → the person's living public profile (Terrain/Signal),
  back returns to the results.

### 2026-06-09 — Tighter "Vol. 1 · No. 1" header row (every page)
- The logo + Vol·No masthead row is condensed app-wide: letter-spacing
  `0.22em → 0.12em`, logo↔text gap `8 → 6` (gate screen `10 → 6`). Applied to the
  shared `BSMasthead` + `BSPageHeader` and every custom copy (profile/chat
  mastheads in the client module, the membership gate, both Radio headers).
  Splash/loading/footer Vol·No lines untouched (not page headers).

### 2026-06-09 — Quinn Harper demo headshot wired
- The uploaded demo headshot (`public/Demo account headshot AI.png`) is now
  **`public/demo-avatar.png`** + **`mobile-app/public/demo-avatar.png`** (served at
  `/m/demo-avatar.png`). `bsMyPhoto()`'s signed-out branch returns it directly
  (was a hash-picked Unsplash stock face), so every "you" avatar in the demo/
  preview — headers, Me page, settings, follow sheet — shows Quinn's real photo.
  Signed-in accounts unchanged (own photo, else initials).

### 2026-06-09 — Nora website parity (concierge profile) + demo "you" renamed to Quinn Harper
- **Website Nora now matches mobile** (`chatWidget.jsx`): tapping her avatar in the
  Help tab opens a **staff concierge card** instead of the generic member preview —
  teal "ALWAYS ONLINE · SHAPE'S CONCIERGE" eyebrow, live dot, concierge bio,
  Status/Replies/Escalates stats (no tier/score), a "Helps with / Can't sort it?"
  details card, and no "Full profile →" (she has no member page). Thread copy updated
  to the concierge wording in `clientChatThreads.jsx` **and** the `globalChatButton.js`
  fallback (was "Shape Support"). `?v=` bumps on `MemberProfile.html` +
  `index-explorations.html`.
- **Demo "you" renamed: Alex Rivera → Quinn Harper** (signed-out preview identity
  only — `bsMyName`/profile fallbacks, `@quinn.harper` handle, demo email; the
  stock demo face follows the new name automatically). The "Alex Rivera" demo
  *client* in the coach rosters/calendars is intentionally untouched.

### 2026-06-09 — Nora has a real avatar (mobile + website)
- The uploaded Nora photo (`public/NORA 1.png`, the android-concierge render) is now
  **`public/nora-avatar.png`** (web-safe name) + a copy at
  **`mobile-app/public/nora-avatar.png`** (served at `/m/nora-avatar.png`).
- **Mobile**: nothing to wire — `BS_NORA_AVATAR` already pointed at
  `${BASE_URL}nora-avatar.png`, so her Support-chat bubbles + staff profile light up
  with the photo (was the "N" initial fallback).
- **Website** (`chatWidget.jsx`): `cwDemoFace('Nora')` now returns `/nora-avatar.png`
  instead of a hash-picked Unsplash stock face — covers the Help-tab bubbles, the
  thread row, and the tap-through profile preview. Bumped the two versioned
  `chatWidget.jsx?v=` refs (`MemberProfile.html`, `index-explorations.html`).

### 2026-06-09 — Eat meal-list header: real weekday + "Meal list" kicker
- The Eat tab's meals section header (`BSTrackHeader`) now reads **"Meal list"**
  (was "Tracklist") with the title **"Today's meals" / "{Weekday}'s meals"**
  (e.g. "Tuesday's meals" — was the cryptic "T 18 meals").
- Fixed the stale **`day === 4`** "today" check (left over from when the demo
  hardcoded today) → `day === bsWeekdayIdx()`, matching the Train page's pattern,
  so "Today's meals" follows the real current weekday. The swap-meal coach
  message uses the same label ("· Tuesday" instead of "· T 18").

### 2026-06-09 — Home "Weekly totals" label + lockfile sync
- Home page running-tally section eyebrow renamed **"Week totals" → "Weekly totals"**
  (`iosAppBroadsheetClient.jsx`).
- `mobile-app/package-lock.json` synced with the `@capacitor/browser` +
  `@capacitor/push-notifications` deps declared in `package.json` on 06-08 (lockfile
  had never been regenerated).

### 2026-06-09 — Followers/following lists: tap-through profiles + photos (all profile types)
- **Mobile** (`iosAppBroadsheetClient.jsx`): the followers/following list rows are now
  **live links to each person's public profile** on every profile surface.
  - `BSTerrainProfile` (client Me / member) got a `followProfile` sub-view state +
    early return → `BSPublicProfile`; `BSSignalCoachProfile` (coach) reuses its existing
    `reviewerProfile`. Both pass `onOpenProfile` into `BSFollowBlock`.
  - `BSFollowMini` (Settings identity card): the **Followers / Following counts now open
    the same live `BSFollowListSheet` directly** (full parity with the profile), and
    tapping a person opens their public profile (portaled over `#bs-phone-surface`).
  - `BSFollowListSheet` (shared) batches **profile photos** via
    `ShapeProfiles.getUserAvatars` (demo Unsplash faces for accountless people) and renders
    each row as a button → `onOpenProfile`. Accept/decline kept for the requests kind.
- **Website** (`MemberProfile.html`, + dead-but-consistent `memberProfile.jsx`): the
  followers/following/requests list rows now show **real profile photos**, batched via
  `get_public_profile.avatar` (initials fallback). Rows already deep-linked to
  `MemberProfile.html?u=<userId>`.

### 2026-06-09 — Shape Sets page (mobile) + Train deck follows coach Adjust + Goal plans/targets live + feed proof cards
- **Shape Sets (mobile Radio → editorial "about Shape Radio" page).** New `BSShapeSetsScreen`
  in `iosAppBroadsheetRadio.jsx`, reached from a **"Shape Sets · About →"** row at the top of
  the Radio screen's below-fold panel (`showSets` state → early return). Mirrors the website
  Shape Radio page copy (Club Shape concert series · "Residents who train. Sets that land." ·
  "Your coach picks the soundtrack" + the Maya/Rae/Diego example cards · the social-loop note)
  and sits on the **Club Shape venue background** — copied the website's `radio background
  upscale.jpg` into `mobile-app/public/club-shape-bg.jpg` (served at `/m/club-shape-bg.jpg`),
  fixed + scrimmed under glassy cards. Mobile-only.
- **Train deck follows coach Adjust** (`bsApplyTrainAdjust` in `bsClientWeekDemo.js`): applies
  `client_programs.detail.training` onto the per-day deck — intensity scales loads + shown RPE,
  the weekly split re-themes days + sets coach rest days, the note rides onto the day; the live
  session + preview inherit the scaled moves. A coach focus/intensity chip shows on the Train hero.
- **Goal Overall "Your plans" + "This week targets" wired** (mobile + website): plans from the
  assigned plan + coach detail + program phase; weekly targets (Sessions/Protein days/Sleep/7d
  volume) from the ShapeProgress rollups. Demo fallback when signed-out.
- **Community feed activity "proof cards" wired** (`bsActivityFromPost`): the COMMUNITY feed
  builds Strava-style cards from real workout/run posts (composer workoutStats + sensor stats +
  GPS route) with live tier + avatar; demo cards are the signed-out / no-activity-yet fallback.

### 2026-06-09 — Website goal page ⇄ mobile parity (Overall dashboard ported) + storage unified
- **Mobile redesign ported to the website** (`public/newdesign/ClientGoal.html`). The site
  goal page was a flat goal-card list (Training/Nutrition tabs only); mobile had the richer,
  more motivating **Overall body-comp dashboard**. Brought the web up to match, leading with
  one clear progress story then progressively revealing the rest:
  - **New Overall tab** (first, teal): body-comp **hero** (down-so-far + % there +
    start→now→target line), a **4-up stat grid** (Current / To go / Weekly pace / On track —
    derived from the real weigh-in series), a **weight trend** chart, **Milestones** (real
    trajectory start→25/50/75%→target, auto-✓ as you reach each), the **Driving it · Your
    plans** section, **This week · Targets that move it**, a **consistency heatmap** (live
    `ShapeProgress.train.volumeByDay` when present, demo fallback), and **Your why**.
  - **Training (rust) / Nutrition (gold)** tabs keep the goal cards + score calculator +
    momentum, now tinted to the tab accent. Removed the now-redundant standalone "Log
    weigh-in" CTA on mobile (the Trend-section inline action remains).
  - **Storage unified to `user_goals('client_goals')`** — the same key mobile uses and the
    one `get_client_goals` reads for **coach visibility**. Reads `client_goals` first, falls
    back to the legacy `client` doc, and migrates a legacy flat `goals[]` into Training. So a
    goal set on either surface now shows on both *and* to the client's coaches. No migration.

### 2026-06-09 — Coach Me page is profile-first (parity with client) + consolidated coach settings
- **Coach Me tab = the living Signal profile** (profile-first), mirroring the client's
  Terrain Me page. `BSSignalCoachProfile` gained `meMode` + `onOpenSettings`: a "ME /
  Profile." masthead (logo + Vol·No, edit pencil + settings gear, no back) and the real
  self name (`bsMyName`) / tier (live via the signed-in `userId`). `BSPublicProfile`
  forwards `meMode`/`onOpenSettings`. Both coach shells now render the profile in the Me
  tab instead of the old `BSProMe` hub; a `meMode` bottom-pad clears the tab bar.
- **Consolidated coach settings** (per the chosen option — practice shortcuts live in
  Settings): the gear opens the existing `BSProMe` hub as the settings screen (back →
  profile), which already holds every practice shortcut (Marketplace listing · Public
  profile · Payouts · Availability · Rates · Soundtracks · Radio · Store) + account rows
  (Notifications · Certifications · App tour · Help · Terms · Sign out). Added an
  **Appearance & display** row → the shared `BSSettings` (paper · accent · units · text
  weight), so nothing was lost. `shape:openProSettings` + the chat/home avatar still open
  the settings hub.

### 2026-06-09 — Appearance settings persist per account (survive reload + login) + Steel bolder + 4 papers
- **Appearance tweaks now persist** (`iosAppBroadsheetMain.jsx` `BSApp`, the live root —
  applies to **all** profiles: client/coach/radio). Before, `paperMode/accentKey/texture/
  weight/border/fx/splash…` lived in React state seeded from a static defaults file and
  `setTweak` only posted to the desktop-preview bridge, so every reload/login reset them.
  Now: seed from **localStorage** (`shape.tweaks`) over defaults (no flash-back on reload);
  every change writes localStorage **and** (debounced) to the account via
  **`user_goals('app_tweaks')`**; on login (polled `ShapeAuth` uid) the account's saved
  appearance loads and applies — so it restores on every login, on any device, and an
  account switch loads that account's look. `role` is excluded (derived from the profile).
  *No migration* — reuses `user_goals`. The mobile BSSettings preferences (units, meal-times,
  visibility, nutrition/training prefs) already persisted via `client_settings`/`user_goals`.
  **Website:** functional settings already persist via the same shared tables; the site uses a
  fixed editorial design (no paper themes), so there's no appearance state to sync there.
- **Steel paper reads bolder:** lightened the stock (`#a9aeb4`→`#c2c7cd` + paper2/3) so dark
  ink, deep accents, and tier colors all gain contrast on the metal — uniform fix (also affects
  hardcoded literals + tier hexes) without retargeting ~58 teal literals.
- **4 new papers** in the Appearance picker (client Settings + Tweaks panel) + label map +
  tinted phone bezels: **Sage** (light green), **Forest** (dark green), **Slate** (blue-grey),
  **Plum** (aubergine). 14 papers total.

### 2026-06-09 — Third post visibility ('profile') + settings icon-boxes removed
- **New "Profile" visibility** on the Log-activity composer (both member + coach
  profiles): **Public** (profile + feed) · **Profile** (visible to everyone on your
  profile, but NOT in the community feed) · **Just me** (private).
  - **Migration `2026-06-09-community-profile-visibility.sql`** (**run on Supabase**):
    widens the `community_posts.privacy` CHECK to allow `'profile'`, and updates the
    read RLS policy + `can_view_community_post()` so `'profile'` reads like `'public'`
    (anyone can view → renders on the profile). The feed exclusion is done in code.
  - **Feed queries exclude `profile` + `private`**: mobile `listCommunityPosts` and the
    website `GET /api/community/feed` now `.in('privacy', ['public','community'])`.
  - `privacyToDb` / website `normalizePrivacy` accept `'profile'`; `communityPostFromRow`
    labels it `Profile`. The 3-state toggle in `BSLogActivitySheet` is shared, so it
    applies to every profile type.
- **Settings icon boxes removed** (client `BSSettings` `HubCard`): the rounded-square
  icon chips next to each row are gone — rows are now title + summary + chevron (the
  accent color moved onto the title so "Account actions" stays rust). Removed the now-
  dead `Icon` component. Coach settings (`BSProMe`) already used numbered rows (no boxes).

### 2026-06-09 — Log activity on ALL profiles + visibility toggle + goal-header cleanup
- **Goal page eyebrow:** removed the coach-name suffix (`· Jordan C…` / `· Dr. May…`)
  from the Training / Nutrition goal headers — now just "Training goal" / "Nutrition goal".
- **"Log activity" now on the coach (Signal) profile too**, not just the member
  (Terrain) profile. Extracted shared `bsMapActivityPosts` + a `BSActivityBody`
  component so both profile feeds load the coach/member's real posts and render every
  rich type identically (note · photo · inline video / video+link cards · workout stats).
  The coach's Personal-activities section gained the **＋ Log activity** button + the
  composer; the demo field-notes remain as a fallback tail.
- **Visibility toggle on the composer** (`BSLogActivitySheet`): **Public** (profile +
  community feed) vs **Just me** (profile only — `privacy:'private'`, kept out of the
  shared feed). Defaults to Public.

### 2026-06-09 — Profile "Log activity" composer (Substack-style multi-type publishing)
- The member Terrain profile's **Personal activities** button changed from **+ Photo**
  to **＋ Log activity**, opening a new **`BSLogActivitySheet`** composer (portal into
  `#bs-phone-surface`, tier-accented). Pick a type and publish to your public feed +
  profile:
  - **Note / article** — headline + multi-line body.
  - **Photo** — image upload (community-photos bucket) + caption.
  - **Video** — file upload (`ShapeCoachMedia` → public `coach-media/<uid>/`, video mimes)
    *or* paste a watch link (YouTube/Vimeo). Direct files render inline `<video>`; links
    render a play-card.
  - **Workout** — type chips (Strength/Run/Ride/Conditioning/Mobility) + Duration / Dist·Vol /
    Effort stat fields → a 3-up stat row on the card.
  - **Link** — website/article URL (+ optional title/desc) → a tappable link card (host ↗).
- **Wiring:** each type maps to `ShapeCommunity.createPost` with the rich payload stashed in
  `community_posts.metrics` (`kind`, `video_url`, `link`, `workoutStats`) — **no migration**.
  `communityPostFromRow` now exposes `kind/video/link/workoutStats`; the profile feed loads
  **all** of the author's posts (was photo-only) and renders each type (photo, inline video,
  video/link cards, workout stats, notes). Posting refreshes the feed.

### 2026-06-09 — App-wide paper-theme sweep (all 11 papers read correctly)
- Audited every broadsheet file for colors that don't follow the paper theme
  (`t.INK/PAPER*/RULE/ACCENT`). The app overwhelmingly already adapts; the
  remaining offenders were dark-designed pieces. Fixed:
  - **`BSMeKpis`** (Me → Stats "Your progress" grid): hardcoded cream `#f2ede4`
    for the label, card border/fill, and stat values → cream-on-cream on light
    papers. Now `t.INK`.
  - **`BSFacetAvatar`**: `BG`/`INK` no longer default to fixed dark/cream — they
    fall back to `t.PAPER`/`t.INK`, so header avatars (which don't pass them) get
    the right dot-ring + rank-shadow surface on every paper. (Inner gem window +
    initials were already made theme-aware in the prior commit.)
- **Verified intentional / no change:** the `PAPERS` palette definitions (source
  of truth); the Main auth screens (deliberately on `BSNightSky`), splash, and
  error screen; Tweaks color-picker swatch values; dark overlays *over cover
  photos*; the rust/gold "Find a trainer/nutritionist" bars and other `#fff`-on-
  colored-chip text; the intentional black channel header. Pros / Marketplace /
  Calendar / Habits / Widgets carry no dark-designed literals (all theme tokens).

### 2026-06-09 — Light-paper sweep: radio two-tone logo + Me-page reads on cream
- **Shape Radio wordmark, light papers** (`iosAppBroadsheetRadio.jsx`): baked a
  recolored **`shape-radio-logo-lt.png`** (white parts → ink/black: SHAPE + the
  second play-triangle; teal stays: the play triangle + RADIO) — the two-tone
  treatment from the uploaded `black and teal triangles.png`. New `BSRadioWordmark`
  helper picks the dark (white) or light (recolored) PNG by `t.isLight`; used by the
  radio screen header **and** the prompt header (was a bare white PNG, invisible on a
  light-paper prompt). Vote-button text-shadow dropped on light papers.
- **Me page (Terrain profile) on cream paper** (`iosAppBroadsheetClient.jsx`) — text
  + avatar were disappearing because dark-designed pieces hardcoded cream/black:
  - **`BSFacetAvatar`**: the gem's inner window was a fixed near-black (`#0f0c0a`) with
    `INK` initials → a black blob with invisible initials on light paper. Now on light
    papers the window fills with a **darkened tier tint** + **light initials** (a tier
    jewel that reads on any paper); dark papers keep the original look untouched.
  - **`BSScoreCardDark`** + **`BSMeGoalCard`**: both hardcoded `INK = '#f2ede4'`, so the
    score number/labels and the goal headline were cream-on-cream. Now read `t.INK` +
    a light/dark-aware teal. The rest of the profile already used theme `INK/BG/TEAL`.

### 2026-06-09 — Calendar month view: divider-row day list + cleaner grid + real preview data
- **`iosAppBroadsheetCalendar.jsx`** — three fixes to the month view + its event
  preview sheets (`BSEventSheet` bodies):
  - **Box view removed:** the per-day event list under the month grid is now clean
    **divider rows** (thin accent bar · time/min · kind tag + serif title + sub ·
    chevron, hairline between) instead of bordered `PAPER2` cards.
  - **Grid fits cleanly:** tighter day cells (gap 5→4, smaller number/count, a
    single non-wrapping dot row, `boxSizing:border-box`) and a **teal ring on
    today** so the weeks sit clean without crowding.
  - **Preview data is now real (no more contradictions):** the workout body looks
    up the actual session by title from **`BS_CLIENT_WORKOUTS`** (now imported from
    `bsClientWeekDemo.js`), so a **Z2 run** shows run **segments** + cardio stats
    (DUR/DIST/ZONE/KCAL) — not barbell rows; strength shows real moves + loads +
    RPE. The meal body **parses kcal/protein from the event's own `sub`** and
    derives carbs/fat (internally consistent), draws a **macro-split bar**, and
    lists **"On the plate"** components from the title — so "Yogurt parfait · 380
    kcal" never renders a chicken-bowl ingredient list again. Both bodies modernized
    (rounded cards + a coach's-cue callout); live server events fall back gracefully.

### 2026-06-09 — Coach media: upload photos & videos for plans/programs/workouts
- **Migration `2026-06-09-coach-media.sql`** (**run on Supabase**): public
  **`coach-media`** storage bucket (200 MB; image + video mime types — jpeg/png/webp/
  heic/gif + mp4/quicktime/webm/m4v). Storage RLS: public read (clients view the demo
  media), owner can write/update/delete only their own `<uid>/…` folder. Idempotent.
- **Migration `2026-06-09-coach-sale-plans-detail.sql`** (**run on Supabase**): the
  public sale-plan RPCs **`get_coach_sale_plans`** + **`get_coach_sale_plans_by_user`**
  now also return **`detail jsonb`** (DROP+recreate to widen the return type), so a buyer
  can preview the coach-uploaded media before buying.
- **Coach draft editor** (`BSCoachDraftEditor`, mobile pros app — trainer *and*
  nutritionist plan/program/workout/meal-plan builders): new **MEDIA · PHOTOS & VIDEOS**
  section — `+ UPLOAD` (multi-file `image/*,video/*`) uploads to `coach-media/<uid>/…` via
  `window.ShapeCoachMedia.upload(file)` → `{url,type:'image'|'video',name}`, shown as a
  3-up thumbnail grid (video badge + remove ×). Rides through `onPublish({…, media})` into
  both `publishDraft`s → **`coach_plans.detail.media`**.
- **Client preview**: the coach profile's sale-plan rows render a horizontal media
  thumbnail strip (photo thumbs + a play glyph on videos) on **mobile**
  (`iosAppBroadsheetMarketplace.jsx`, salePlans now carry `detail`) and **website**
  (`livingShared.jsx` `LvServices`, `?v=10`).
- `shapeBackend.js`: `window.ShapeCoachMedia.upload`; `listSalePlans` /
  `listSalePlansByUser` map `detail`.
- War Room: registered under "Marketplace & coach profiles".

### 2026-06-09 — Mobile Me page restructure + Settings merge + dead-code sweep
- **Me tab is PROFILE-FIRST.** Opens as your living **Terrain profile** (standard
  masthead: SHAPE logo + `Vol. 1 · No. 1` + **ME / Profile.**), no back button (root
  tab). Header carries a tappable **goal card** (→ Goal page) above the **Shape Score
  card**; edit pencil → customizer, **gear** → Settings.
- **Stats tab = the full progress page** — embeds `BSClientProgress` (Overall/Training/
  Nutrition) via a new `embedded` mode (no chrome) that **forces a dark palette through
  `BSContext.Provider`** so it reads right on the dark profile even in light app theme.
  A "Your progress" KPI grid (live `ShapeProgress` + demo merge) sits on top.
- **Living Signals + Climb wired live** (self): day streak, bodyweight trajectory +
  delta, weekly momentum, disciplines, key lifts, and the Climb's Shape-Score aspect.
- **Tier unified everywhere** — avatars, profile, score card, climb, Settings read ONE
  client-score source (`_bsUseLiveScore(SHAPE_SCORE_PROFILES.client)` + `bsMyTier()`
  same fallback): live signed-in, **Tempo/1284** in preview. Fixes the Base-vs-Tempo split.
- **Settings is ONE screen** (`BSSettings`): folded the old Me-page hub in (Account ·
  Preferences · Nutrition · Training · Integrations · Notifications · Privacy ·
  Membership & billing · More links · Appearance/Radio/Light-fx/Ticker · About · Account
  actions). Section cards are **divider rows** (no boxes); identity card = the summary.
- **Chat masthead** gained the logo + `Vol. 1 · No. 1` line. Follow-list + Cards
  dropdown scrollbars hidden.
- **Dead-code sweep:** removed **~1,070 unreferenced lines** from
  `iosAppBroadsheetClient.jsx` (`BSMeSettingsHub`, `BSClientProgressLegacy`,
  `BSEditSheet`, `BSFeedActivityCard`, `BSProfilePrivacy`, `BSTerrainContours`,
  `BSTerrainRidge`) — verified zero non-def references repo-wide. Parse + build + tsc clean.

### 2026-06-09 — Live "doing now" activity dot, home re-layout, photos & avatars
- **Live activity dot (persistent).** Migration **`2026-06-09-user-activity.sql`**
  (**run on Supabase**): `user_activity` table (owner-write, authenticated-read,
  realtime, 6h `expires_at` safety) + `get_active_activities()`. `ShapePresence`
  gained `setActivity`/`activityOf`/`myActivity`; the workout player broadcasts
  `'workout'` and the meal logger `'cooking'`. The avatar **corner dot** is now
  decoupled from the online ring: **teal = in a workout, amber = cooking**. The
  workout dot is set on session start and **persists across screen changes / app
  backgrounding**, clearing only when she ends it (✕ End / Finish). Reads on real
  avatars (self header/me, chat messages, profiles); chat thread refreshes live.
  Cooking stays logger-open-scoped (per request).
- **Chat presence rail:** "lifting now" → **"online now"**; more avatars marked
  live (pulsing ring) + a dot legend.
- **Home re-layout.** Removed the **Log/Activity**, **Habits**, and **Score** quick
  chips. The **Day Log** header now shows the selected day's **`+N pts`** (live
  per-date ledger, demo fallback, future days = 0). New **Habits** section directly
  under the Day Log — same numbered row format (DO/AVOID pill, name, done state,
  points), a per-day **check-mark box**, header **`+N pts`** + a **View →** link to
  the full habits page. Me-page Shape Score card leads with **`+N today`**.
- **Day-log detail sheet redesign:** tag-tinted header + the new rounded badge,
  3 rounded metric tiles, tag-tinted note, fully-rounded pill buttons, frosted
  backdrop blur. **Workout items now show an Exercises preview** (numbered moves +
  scheme + load chip from the day's workout).
- **Tag pills modernized** (Day Log + Habits): flat solid blocks → soft tinted,
  fully-rounded badges with colored text + hairline border.
- **Meal preview photos:** `bsMealPhoto(meal)` shows the meal's own `photo`, then a
  coach-uploaded `media` image (coach-media), then an inferred stock food photo
  (halftone fallback) — replacing the halftone placeholder.
- **Find-a-coach bars** (Train/Eat): filled in role color (trainer rust /
  nutritionist gold), compacted, thicker 2.5px lighter border.
- **Facet avatar = photo OR initials, always.** Initials now render underneath the
  photo and a missing/broken image (`onError`) falls back to them — never a blank/
  placeholder gem. Mobile `BSFacetAvatar` + website `LvPortrait` (`livingShared ?v=11`).
- **Website marketplace polish:** marketing face photos on the signed-out directory
  (spotlight + grid), a coach-customizable **cover image** band behind the avatar
  (darkened/tinted; demo covers + real `profile_custom.cover.image`), filter
  dropdowns. Migration **`2026-06-09-coach-sale-plans-detail.sql`** already covers
  the plan-media preview.
- **Real coach accounts resolve on BOTH surfaces.** App already fetched live
  providers + photos (`get_public_profile.avatar`). Website now does too: fetches
  live coaches from `trainers`/`nutritionists`, resolves each real photo via
  `get_public_profile`, merges them ahead of the demo directory (deduped), and links
  real coaches to their live profile (`?u=<owner>`). Marketplace links also pass
  `&avatar=` so derived (demo) coach profiles show the card photo (`marketplace.jsx ?v=5`).
- **Settings:** removed the tier name under the identity avatar.
- **Cards dropdown** ("Show on home"): scrollbar hidden + no longer closes when you
  scroll *inside* it (only on page scroll).

### 2026-06-08 — Store fulfillment: redeemed rewards actually DO something
- **Migration `2026-06-08-store-fulfillment.sql`** (**run on Supabase**): adds fulfillment
  columns to `store_redemptions` (`kind`, `ship_to` jsonb, `fulfilled_at`, `fulfillment_note`),
  a **`store_credits`** dollar-wallet ledger (RLS owner-read; `kind` session|nutrition, signed
  `cents`), and RPCs: `get_my_store_credit` / `get_store_credit_for(uid)`, an extended
  **`redeem_store_item(... p_kind, p_credit_cents, p_credit_kind, p_ship_to)`** (also writes the
  ship-to + funds the wallet for credit items, atomically), **`consume_store_credit(uid,kind,
  session_id,cents)`** (service-role, advisory-locked, idempotent per checkout), and admin
  `admin_list_store_fulfillment` / `admin_mark_store_fulfilled`.
- **Three fulfillment paths**, by item kind (server-authoritative catalogue
  `src/lib/store-catalogue.ts`):
  - **Merch → ships.** Redeeming merch now requires a **shipping address** (422 `needs_shipping`
    → a shipping sheet on mobile, a modal on the website). The address rides on the redemption;
    **ops is emailed** to ship it (Resend, `STORE_OPS_EMAIL` or first admin) + the member gets a
    confirmation.
  - **Credit → auto-applies at coach checkout.** A `$25/$50 session credit` funds a **session**
    wallet; a `$25 nutrition credit` funds a **nutrition** wallet. `/api/stripe/checkout-session`
    reads the wallet and **discounts the charge** (trainer booking ← session, meal plan ←
    nutrition), leaving ≥ $0.50 payable; the webhook **debits the wallet** on a completed payment
    (idempotent — abandoned checkouts don't burn credit). The applied credit shows in the Stripe
    line-item name.
  - **Service → recorded + emailed** (coach follows up).
- **Emails** via the existing Resend wrapper (`src/lib/email.ts`): member reward confirmation
  (code + next steps) on every redeem; ops ship notice for merch. No-ops cleanly without
  `RESEND_API_KEY`.
- **Frontend**: both stores show a **Coach credit wallet** card (session/nutrition $) when funded;
  merch redeem opens a shipping form. `ShapeStore.get` now returns `credit`; `redeem(itemId,
  shipping)`.
- War Room: registered the flows + the two migrations + RESEND/STORE_OPS env in the checklist;
  flipped the "live redemption API" P2 gap to **done**.

### 2026-06-08 — Store redemption is real: points become spendable (mobile + website)
- **Migration `2026-06-08-store-redemptions.sql`** (**run on Supabase**): `store_redemptions`
  table (owner-read RLS) + 3 SECURITY DEFINER RPCs — `get_my_points_balance()` (live balance =
  Σ `score_ledger.delta`), `get_my_redemptions()` (the locker), and **`redeem_store_item(item_id,
  name, cost)`** which **atomically** (per-user `pg_advisory_xact_lock`) checks the balance,
  writes a **negative ledger row** (category `other`, `source_kind 'store_redeem'`) so the spend
  shows on the score page + lowers the balance, and issues a one-time `CODE-XXXXXXXX`. Raises
  `insufficient_points` when short — no double-spend.
- **API `/api/store/redeem`** (GET locker+balance / POST redeem). Auth Bearer-or-cookie; looks up
  the **authoritative cost server-side** from new **`src/lib/store-catalogue.ts`** (never trusts the
  client), gates on membership (`computeMembership` — points earn for all, spend for members/coaches/
  admin), and blocks tier-locked + lead-boost items. Registered in War Room `RAW_ROUTES`.
- **Mobile** (`shapeBackend.js` `ShapeStore = { get, redeem }`): `BSShapeStorePage` now loads the
  **live balance + locker**, every catalogue row is a **tappable Redeem →** (deducts + issues a code,
  shows an inline notice, refreshes the balance + Unlocked codes). Demo values remain the signed-out
  fallback. Each product carries a stable `id` matching the server catalogue.
- **Website** (`store.jsx`): `StorePage` fetches the same endpoint → live hero balance, real Redeem
  buttons (busy state + notice), and the **Your locker** section renders real redemption codes.
  Products carry server item ids via a name→id map.
- Builds on the 20 pts = $1 rate — points are now genuine purchasing power end-to-end.

### 2026-06-08 — Up-next #4: native push/browser plugin prep (code side complete)
- Declared **`@capacitor/push-notifications`** + **`@capacitor/browser`** in
  `mobile-app/package.json` and added a `PushNotifications.presentationOptions`
  (`badge/sound/alert`) block to `capacitor.config.ts` so a `npm i && npx cap sync`
  native build picks them up (registerPush + the system-browser Apple Pay opener already
  feature-detect them). The push pipeline (token register → notifications DB Webhook →
  `/api/push/dispatch` → FCM sender in `@/lib/push`) is otherwise complete.
- **Remaining to activate (external):** (1) set `FCM_PROJECT_ID` / `FCM_CLIENT_EMAIL` /
  `FCM_PRIVATE_KEY` + `PUSH_WEBHOOK_SECRET` env; (2) Supabase → Database → Webhooks:
  table `notifications`, INSERT → POST `https://theshapecommunity.com/api/push/dispatch`,
  header `x-push-secret: <PUSH_WEBHOOK_SECRET>`; (3) Firebase config (google-services.json /
  GoogleService-Info.plist) + APNs key uploaded to Firebase + the native build with Push
  capability.

### 2026-06-08 — Up-next #3 done: profile sub-data wired to real rollups
- The member **Terrain** profile's living-identity sub-data now reads from the real self
  rollups (demo fallback per field): **climb** (weigh-ins), **personal activities** (logged
  activities), **key lifts** (`/api/client/train` PRs), and now the **disciplines strata** —
  Strength = strength-trend gain (`/api/client/progress`), Endurance = recent training
  volume, Consistency = workout adherence (`/api/client/analytics`), Recovery = sleep.
- Coach **Signal** competency rings stay illustrative by design (they're practice focus,
  not workout/PR data). Removes the P1 "rich profile sub-data" gap from the build queue.

### 2026-06-08 — Sell-a-plan (Up-next #2): buy a coach's published plan
- **Migration `2026-06-08-coach-plans-sale.sql`** (**run on Supabase**): `get_coach_sale_plans(role,id)`
  (a coach's published, priced plans — public read, maps provider row → owner), a `plan_id`
  column on `one_time_purchases`, and `get_my_purchased_plans()` (the buyer's paid plans).
- **Checkout**: `/api/stripe/checkout-session` passes `item.planId` → `metadata.plan_id`;
  the **webhook** stores it on the `one_time_purchases` row. Reuses the existing Stripe
  Connect destination-charge + 15% fee.
- **Mobile**: `ShapeCoachPlans.salePlans / purchased / buy`. The coach profile's Packages
  tab now shows a **"Plans for sale"** section (real `coach_plans`) with a **Buy · $X** button
  → the existing checkout flow (plan_id rides along). Purchased plans auto-merge into the
  client **Library** (`owned`) via `get_my_purchased_plans`.
- Coach already sets price + publishes at plan-create time. Needs **live Stripe** to verify
  the actual charge.
- **Catalogue tabs on the coach profile** (Packages tab): role-aware sub-tabs — trainers
  **Programs / Workouts / Plans**, nutritionists **Meals / Diets / Plans** — populated from
  the coach's published `coach_plans` (categorised by `detail.buildType`, else the kind).
  Priced → **Buy**, otherwise **Listed**. `get_coach_sale_plans` now returns all published
  plans (+ a `category`), not just priced ones.
- **Apple Pay / Google Pay on checkout:** native checkout (the $5/mo membership + coach/plan
  buys) now opens in the **system browser (SFSafariViewController)** via the Capacitor Browser
  plugin so Stripe Checkout can present the **Apple Pay sheet** (the in-app WebView can't).
  Falls back to the WebView when the plugin/native isn't present. Needs `@capacitor/browser`
  + Apple Pay enabled in Stripe to go live.
- *Tracked follow-up (wanted):* a **full in-app Stripe PaymentSheet** — native Apple Pay /
  Google Pay sheet with no browser hop. Needs a Stripe mobile/Capacitor SDK
  (`@capacitor-community/stripe`), a PaymentIntent/SetupIntent + customer ephemeral-key
  endpoint for the $5/mo sub + coach/plan buys, and the native build. Logged in the War Room
  (Platform services · P3).

### 2026-06-08 — War Room: North Star + Up-next P1 queue + build-order gaps
- **North Star panel** (top of `/warroom`): the positioning — Shape as a **coach
  marketplace with a social presence**, fusing the three camps (social fitness · coaching
  software · creator marketplace), the coach-first **wedge**, the **moats**, and a 4-phase
  **cold-start sequence**. Data in `SHAPE_ARCHITECTURE.northStar`.
- **Up next** panel: every **P1** gap across all layers rolled into one ranked queue
  (layer + status), so the single most important build order is glanceable.
- Each layer's **"Still to do"** is now `{task, status, priority}` — sorted P1→P3 with a
  priority chip + `● in progress` / `○ not started`; the diagram bands show `N to do · k×P1`.
- **Flow diagram → company hierarchy**: a root **SHAPE** node branches top→down into the
  sections, each branching into its pieces (org-chart / site-map look); the member-journey
  ribbon sits below as the sequential view.
- **"Next steps to go live"** is now **tabbed by section** (chips with per-area counts) so
  only the active area's items show — short + scannable instead of one 38-item list.

### 2026-06-08 — War Room: "Architecture & flow" map (how Shape works / who it serves)
- New top panel on `/warroom` summarizing the whole product so direction stays organized:
  **personas** (prospect / member / trainer / nutritionist / admin), the **10-step member
  journey** (Discover → Join → Onboard → Find a coach → Daily loop → Shape Score →
  Community → Rewards → Retain, + the parallel coach side), the **6 layers of the stack**
  (Surfaces · The Loop · Coach tools · Social graph · Platform services · Data & infra,
  each with who-it-serves + the pieces), and an **Area × persona matrix** (Train / Eat /
  Score / Coaching / Community / Billing / Profile). Curated static data in
  `SHAPE_ARCHITECTURE` (`src/lib/warroom.ts`) — edit it as the product evolves.

### 2026-06-08 — System push: register device tokens at sign-in (close the wiring gap)
- The push pipeline already existed end-to-end — `push_tokens` table, `/api/push/register`,
  `/api/push/dispatch` (Supabase **Database Webhook** on `notifications` INSERT →
  `sendPushToUser` via FCM in `src/lib/push.ts`), and `mobile-app/src/services/push.js`
  `registerPush()` (Capacitor PushNotifications → `/api/push/register`). The one gap:
  **`registerPush()` was never called**, so no device ever stored a token.
- Wired `registerPush()` into `getCurrentSession()` (fires on every session resolve,
  alongside `startPresence()`). No-op on web / until the native plugin + build exist.
- **So every in-app notification we already write** (follow / messages / coach content /
  grocery / bookings …) **fans out to a phone's lock-screen + banner once activated** —
  no per-event wiring needed (the webhook is the single chokepoint).
- **Activation checklist** (nothing testable in the web container):
  1. Run the `push_tokens` migration (`2026-05-30-push-tokens.sql`) if not already.
  2. Set env: `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` (Firebase
     service account) + `PUSH_WEBHOOK_SECRET`.
  3. Supabase → Database → Webhooks: `notifications` · Insert · HTTP POST →
     `https://theshapecommunity.com/api/push/dispatch`, header `x-push-secret: <PUSH_WEBHOOK_SECRET>`.
  4. iOS: upload an APNs key to Firebase (FCM relays to APNs).
  5. Native build: `cd mobile-app && npm i @capacitor/push-notifications && npx cap sync`,
     add `google-services.json` (Android) + `GoogleService-Info.plist` (iOS) + enable the
     Push Notifications capability/entitlement. Users toggle it from iOS/Android settings.

### 2026-06-08 — Follow requests for private profiles (approve to follow) — app + website
- **Migration `2026-06-08-follow-requests.sql`** (**run on Supabase**): adds
  `user_follows.status` ('accepted'|'pending') + `shape_profile_visibility(uid)`. Reworks
  the RPCs: **public profile → Follow is instant** (accepted); **friends/private → Follow
  creates a request** (pending) the owner must accept. `get_follow_stats` now counts only
  accepted + returns **`is_pending`**; `toggle_follow` requests/cancels by privacy;
  `get_follow_list` lists only accepted; new **`list_follow_requests()`** +
  **`respond_follow_request(follower, accept)`**.
- **Mobile** (`BSFollowBlock`, both client Terrain + coach Signal): Follow button is now
  3-state — **Follow / Requested / Following ✓**. On your own profile a **"N requests"**
  button opens a sheet to **Accept / Decline** each pending follower. `ShapeFollows`
  gained `requests()` + `respond()`; cache/`shape:follows` sync extended.
- **Website** (`MemberProfile.html` + `livingDesktop.jsx`): same — Follow/Requested/
  Following on the hero + locked card, an owner **"N requests"** chip → accept/decline
  modal. Applies to **client and coach** profiles.
- **Notifications** (in the same migration): `toggle_follow` notifies the owner —
  `follow_request` ("X requested to follow you") on a private/friends request, or
  `follow` ("X started following you") on a public follow; `respond_follow_request`
  accept notifies the requester (`follow_accept`, "X accepted your follow request").
  Written into the existing `notifications` table from the SECURITY DEFINER RPCs (no app
  change — the existing notifications surface renders them).

### 2026-06-08 — Website public profile = desktop Terrain/Signal (same direction as mobile)
- Dropped the **desktop** living-identity designs (`chat-design-v2/Shape (13).zip` =
  Terrain/member, `(14).zip` = Signal/coach) into `public/newdesign/`: **`livingShared.jsx`**
  (design system), **`livingTerrain.jsx`** / **`livingSignal.jsx`** (signature visuals),
  **`livingDesktop.jsx`** (`DesktopProfile` layout — nav, split hero, signals band,
  2-col grid, feed, footer, locked card).
- **`MemberProfile.html` rebuilt** to render `<DesktopProfile>` wired to real data:
  role → **terrain (member)** / **signal (coach)**; name / tier (member or coach ladder
  colors) / Shape Score / avatar (real photo via `lvPortraitURL` pass-through, else
  initials) / goal / pronouns / privacy are live (`get_public_profile`); rich sub-data
  stays illustrative (same as mobile). **Message** → site chat (`window.__openChat`),
  **Edit profile** on your own, **Follow** → `toggle_follow`, **Coaching** → Marketplace.
- **Followers / Following** counts in the hero are **public + live links** → a people
  sheet (`get_follow_list`); kept visible on the **locked** (private) card too.
- Patched `livingDesktop.jsx` `DesktopProfile`/`DesktopHero`/`DesktopLocked` to accept a
  `person` override + `onMessage`/`onFollow`/`follow`/`coachingHref`; `lvPortraitURL` now
  passes through full `http(s)`/`data:` avatar URLs.
- **`chatWidget.jsx`**: the chat profile-preview "View full profile →" now points **any
  real account (member OR coach)** to `MemberProfile.html?u=` (Signal for coaches);
  accountless coaches still link to Marketplace. The old `memberProfile.jsx` card view is
  superseded (left in place, unreferenced).

### 2026-06-08 — Tag members in posts/workouts on the feed (mobile + website)
- **Mobile** (`BSClientFeed`): the feed composer gained an **@ Tag people** button (next
  to the photo button) → a member-search sheet (`search_members` RPC); tagged people show
  as removable chips and ride on the post. Both text posts and photo/workout posts carry
  the tags. `renderPost` shows a tappable **"with @Name, @Name"** line (opens each member's
  profile). `BSMessageComposer` got `onTag` / `tags` / `onRemoveTag` props + a chip row.
- **Website** (`dashboardCommunity.jsx`): `PostComposer` gained **@ TAG PEOPLE** with an
  inline member search (chips + toggle); `onSubmit` POSTs `metrics.mentions`; `FeedItem`
  renders the **"with @Name"** line (links to each member's profile).
- **Backend** (`shapeBackend.js`): `createCommunityPost({ …, mentions })` stores
  `metrics.mentions` (`[{userId,name}]`, capped 12); `communityPostFromRow` exposes
  `mentions`. No migration (rides in the existing `community_posts.metrics` jsonb).

### 2026-06-08 — Progress hub on app (Overall / Training / Nutrition) — website data → app
- **Mobile `BSClientProgress` rebuilt as a 3-tab hub** mirroring the website's
  Progress / Train / Nutrition pages, reached from **Me → "Progress & PRs"** (and the
  score card). Tabs:
  - **Overall** — KPI grid (bodyweight Δ, body fat, resting HR, sleep), an Insights
    block (adherence + weekly points), a **trend chart** with 9 series pills (weight /
    body fat / strength / resting HR / sleep / HRV / volume / protein / hydration), and
    **personal records**. From `/api/client/progress` + `/api/client/analytics`.
  - **Training** — KPIs (logged, this week, 7d volume, avg RPE), weekly-focus banner,
    14-day volume bars, PRs with Δ%, muscle-group split, recent sessions. From
    `/api/client/train`.
  - **Nutrition** — today vs target macro bars, days-logged/adherent KPIs, weekly
    calorie bars, hydration, most-logged foods. From `/api/client/nutrition`.
- `shapeBackend.js`: `ShapeProgress = { progress, analytics, train, nutrition }`
  (auth'd `getJsonOrDefault` fetches; null on no-data → demo fallback).
- No migration (read-only rollup routes already existed for the website). The old
  Overall-only progress page is retained as `BSClientProgressLegacy` (unreferenced).

### 2026-06-08 — Chat bubbles carry the sender's tier color (mobile + website)
- **Mobile** (`BSChatThread`): DM/channel message bubbles are now tinted to the
  sender's **tier color** — incoming = their tier, mine = my tier — for both members
  and coaches (coaches use the coach ladder colors). Replaced the neutral incoming /
  cream-inverted outgoing bubbles with a tier tint + matching hairline border.
- **Website** (`chatWidget.jsx`): same — bubble background/border derive from
  `cwTierColor` of the sender (live tier when known, else the stable name-hash tier),
  mine from my tier. Text stays `INK` for legibility.

### 2026-06-08 — Follower / following system (mobile + website public profiles)
- **Migration `2026-06-08-user-follows.sql`** (**run on Supabase**): `user_follows`
  directed graph (RLS: public read, self insert/delete) + SECURITY DEFINER RPCs
  `get_follow_stats(uid)` (followers/following counts + the caller's `is_following`),
  `toggle_follow(uid)` (follow/unfollow → fresh counts+state), `get_follow_list(uid,
  kind)` (names list for the followers/following sheet). Idempotent.
- **Mobile** (`shapeBackend.js`): `ShapeFollows = { stats, toggle, list }`. New shared
  **`BSFollowBlock`** (counts → tappable names sheet + Follow/Following toggle) on
  **both** profile types — Terrain (member, under the hero) and Signal (coach, under the
  back row). Counts are public; the button only shows when viewing someone else.
- **Website** (`memberProfile.jsx`): new **`MPFollow`** — Followers/Following counts +
  a Follow/Following toggle (hidden on your own profile), wired to the same RPCs via
  `window.shapeDb.client.rpc`.

### 2026-06-08 — Photo posts on community feed + profile feeds (mobile + website)
- **Migration `2026-06-08-community-photos.sql`** (**run on Supabase**): public
  **`community-photos`** storage bucket (15 MB, image mimes; public read, owner can
  write/update/delete their own `<uid>/…` folder via storage RLS) + a **`photo_url`**
  column on `community_posts`. Idempotent.
- **Shared backend:** `POST /api/community/feed` accepts `photoUrl` → `photo_url`
  (title defaults to "Photo" for photo-only posts). Uploads go **browser → Supabase
  storage** directly on both surfaces (gated by the owner-folder RLS), returning a
  public URL that rides on the post.
- **Mobile** (`shapeBackend.js`): `ShapeCommunity.uploadPhoto(file)` (own folder →
  public URL), `listByAuthor(id,{withPhotoOnly})`, `createPost({…, photoUrl})`;
  `communityPostFromRow` exposes `photo`. **Feed composer** (`BSMessageComposer`)
  gained a 📷 attach button (`onPhoto`) → upload + post; `renderPost` renders the
  image in the bubble. **Profile "Personal activities"** (`BSTerrainProfile`) loads
  the member's photo posts and renders them; your own profile has a **+ Photo**
  button (uploads → public community post → shows on your feed + profile).
- **Website** (`dashboardCommunity.jsx`): `PostComposer` gained **ADD PHOTO** (uploads
  via `window.shapeDb.client.storage`), the composer now actually **POSTs to
  `/api/community/feed`** (was local-only), and `FeedItem` renders the photo. Live
  feed mapper reads `photo_url`.

### 2026-06-08 — Care Team on mobile (coach ↔ co-coach messaging)
- **Mobile coach client profile** (`BSProClientFullProfilePage`, Manage tab) now shows
  a **Care Team** section listing the *other* coach(es) on the same client (trainer ↔
  nutritionist). Each row: facet avatar + name + role eyebrow + **MESSAGE** button.
- **MESSAGE** dispatches `shape:proMessageCoach` `{clientId, counterpartUserId, name,
  role}`; both coach shells listen → `window.ShapeCareTeam.openThread(clientId,
  counterpartUserId)` (POST `/api/me/shared-clients/[id]/thread` →
  `get_or_create_coach_coach_conversation` → conversationId) → jump to **Chat** on that
  exact 1:1 (same `openRequest`/`chatRequest` path as MESSAGE-client).
- `shapeBackend.js`: `window.ShapeCareTeam = { overview, openThread }` —
  `overview(clientId)` reads `/api/clients/[id]/shared-overview` (`careTeam`, filtered to
  `!isMe` members with a `userId`). No migration (RPC + routes already existed; web
  surfaced this — mobile was the gap).

### 2026-06-07 — Web online-visibility toggle + score tier-bar overlap fix
- **Website Me** (`public/newdesign/ClientMe.html`): added a **"Show when I'm
  online"** toggle under Privacy & notifications, wired to
  `window.ShapeWebPresence.setVisible()` — persists to the shared
  `client_settings.onlineVisible` so web + mobile agree, and seeds from the live
  presence state on load. Completes the opt-out loop on the website (mobile already
  had it).
- **Shape Score page** (`public/newdesign/score.jsx`): the teal progress connector
  bar was painting **across** the tier circles. Layered the bar behind the node row
  (`zIndex`) so each opaque tier disc covers the line — it now connects node-to-node
  cleanly. Cache-bust `Score.html` → `score.jsx?v=4`. (Coach ladder uses the same
  component, so the fix covers both Members/Coaches tabs.)

### 2026-06-07 — Public profiles: Terrain (client) + Signal (coach) + privacy
- Member/coach public profiles are now immersive "living identity" pages
  (`iosAppBroadsheetClient.jsx`): **clients → Terrain** (topographic contour hero,
  ridgeline climb, living signals, discipline strata, field-notes) and **coaches →
  Signal** (sigil instrument of discipline rings + cardiac week-trace + portrait
  core, certs/offerings/reviews). Tier is the atmosphere color (client/coach ladder).
  `BSPublicProfile` routes coach→`BSSignalCoachProfile`, member→`BSTerrainProfile`;
  the old card body was removed.
- **Me → Public profile** opens your own profile on every role (client already did;
  coach Me now opens the Signal self-view via the window-exposed `BSPublicProfile`,
  Edit → `shape:openProSettings`).
- **Privacy selector** (Public / Friends / Private) on your own profile, persisted
  to `client_settings.profileVisibility` (same field Settings uses).
- **Migration `2026-06-07-public-profile-friends-visibility.sql`** (**run on
  Supabase**): `get_public_profile` now returns `visibility` + `can_view` and
  enforces all three states — friends = a viewer who shares a member 1:1
  conversation (`conversations.dm_key`) with the owner; details (bio/pronouns/goal/
  link) return only when `can_view`. `is_public` kept for back-compat.
- *Still illustrative:* the rich profile sub-data (the climb, disciplines, lifts,
  certs, offerings, reviews, field-notes) is demo/role-aware — wire to real
  workout/PR/marketplace data later.

### 2026-06-06 — Signal chat redesign (mobile, Chat tab) — shipped in 5 steps
- Ported the **"Signal" v2 chat design** (presence-forward, tier-colored, Strava-style)
  into the live `BSClientFeed` (Chat tab only). The standalone prototypes live in
  **`mobile-app/design/signal-chat/`** (v1) and **`mobile-app/design/signal-chat-v2/`**
  (v2 — the source of truth; de-rotated filenames, runnable host). *Note:* the v1
  upload had clobbered `mobile-app/index.html` (the Vite entry) — restored + the
  prototype moved out of the build path.
- **Step 1 — presence rail:** Feed tab now leads with a live "N lifting now · near you"
  rail of tier-colored avatars (`TRAINING_NOW`, demo data via `bsTierColor`; wire to a
  real presence feed later).
- **Step 2a — 4 tabs:** tab bar is now **Feed · Channels · Friends · Team**. Channels
  promoted to its own top-level tab (lifted out of Team → Channels, all create/search/
  join/pin wiring intact); Team keeps Coaches + Support. Per-tab unread split (channel /
  member-DM / coach-DM).
- **Step 2b — Strava feed blend:** `ActivityCard` restyled to `SigActivity` (tier
  hairline, type chip, location, run splits, 3-up stat row, Verified + cheer/reply pills)
  and **interleaved with the live community posts** in the COMMUNITY feed for everyone
  (blend — posts + role channels stay fully wired; activity data illustrative for now).
- **Step 3 + formatting — Channels cards:** full `SigChannel` look (teal `#` tile, serif
  name + LIVE/private/host badges, members·online meta, blurb line, Open/Join pill).
- **Step 4 — thread:** header avatar matches (tier avatar for people, teal `#` tile for
  channels); bubbles + iMessage composer were already aligned; avatar tap → full
  `BSPublicProfile` (kept over the prototype's peek sheet).
- **Step 5 — rows:** Friends/Team list rows use larger 46px avatars + 2-letter initials.
- Decisions taken: **blend** (don't drop role-channel posting) + **4 tabs**; signature
  data-dependent bits (presence rail, proof cards) are **demo-now / wire-later**.
- **Refinement pass:** all chat avatars are now **rounded squares** (tier-colored;
  coaches carry a role pip on the presence rail). The **header is tab-aware** — a
  "CHAT" eyebrow over a serif title that follows the tab (Community / Channels /
  Friends / Your team) with a square tier avatar top-right. **Thread bubbles** match
  the prototype: incoming bubbles are neutral (tier shown via a name + tier-chip +
  role-chip byline on channels, no per-message avatar), my bubbles are the cream/ink
  inverted bubble, chat-tail corners, and a "Program tweak · applied" clip card when a
  message carries one.

### 2026-06-05 — Coach Shape Score tier ladder (scheme J) — separate from clients
- Coaches now climb a **separate, renamed Shape Score tier ladder** (same 5 rungs /
  thresholds as clients): **Certified · Pro · Elite · Master · Icon**. No new page —
  the shared `BSShapeScorePage` is already role-driven; this is a thin tier-name layer.
- **Colors** diverge from the client ramp so teal (the logo color) **crowns** the coach
  ladder: Certified `#8a93a0` · Pro `#d8a23a` · Elite `#e0463c` (crimson) · Master
  `#8fe3e6` (ice/diamond) · Icon `#34d6c5` (teal). Added these keys to `BS_TIER_COLORS`.
- New `SHAPE_SCORE_TIERS_COACH`, `bsCoachTier()` (client-tier → coach name), and
  `bsIsCoachRole()` (client module, window-exposed). `_bsUseLiveScore` + the coach
  startup score-cache (`_bsHydrateProScore`, pros) translate live tier/next-tier to
  coach names, so the coach **Me card, score page, avatar tint, and public profile**
  read the coach ladder. The score page swaps in `SHAPE_SCORE_TIERS_COACH` when
  `profile.roleLabel` is a coach. Trainer/nutritionist demo profiles updated (Elite ·
  ELT · → Master). Client tiers untouched.

### 2026-06-05 — Website member public profile page + profile-link wiring
- **New `public/newdesign/MemberProfile.html` + `memberProfile.jsx`** — a member's
  public profile on the website, mirroring the coach page anatomy (tier-gradient
  hero, tier chip, 3-up stats [Shape Score / Tier / Role], About + Details rows for
  goal/pronouns/link) with the **private** state (🔒, name+tier only). Reads
  `get_public_profile(?u=<userId>)`; with **no `u`** it loads the signed-in user's
  own profile (owner sees **Edit profile →** to `ClientMe.html`; everyone else gets a
  **Message →** CTA wired to the site chat via `window.__openChat`, falling back to
  the global chat launcher). Coaches also get a **Coaching →** link.
- **Wiring:** the website chat profile preview's **View full profile →** now points
  members with a real account to `MemberProfile.html?u=<userId>` (coaches still link
  to Marketplace; demo people with no `userId` show nothing). **`ClientMe.html`** Me
  page gained a **View public profile** header action → opens your own
  `MemberProfile.html`.
- **Mobile paywall/radio polish:** the paywall **Sign in / Sign out** and **Step
  inside** buttons + the Radio **Continue** button are now smaller, faded pills
  (fit-content, `borderRadius:999`, faded teal/ink fills) instead of full-width bars.

### 2026-06-05 — Me-tab "Public profile" (view/edit) + Nora branding
- **Mobile Me → Public profile:** new shortcut row opens **your own**
  `BSPublicProfile` (`isSelf`) — the coach-style card showing how others see you,
  with **Edit profile →** (fires `shape:openProfile` → Settings) and a "this is
  how others see you · private" hint.
- **Nora branding:**
  - Mobile support bubble label "Nora · Shape AI" → **"Nora · Shape's Assistant"**.
  - **Website Help chat is now Nora** (was "Shape Support"): the thread + greeting
    ("Hi, I'm Nora — Shape's assistant…"), the reply author, and the typing
    indicator all use **Nora** (`clientChatThreads.jsx` + `chatWidget.jsx`).

### 2026-06-05 — Mobile member profile = coach design + every avatar opens it
- Rebuilt **`BSPublicProfile`** (mobile) to share the **coach detail page anatomy**:
  back + serif name (last word tier-italic), a tier-gradient **hero card** (avatar
  + tier chip + role·locale eyebrow + goal headline + stat pills), a **3-up stats
  row** (Shape Score / Tier / Role), a **Message** CTA (+ Coaching for coaches),
  and an **About** section (Their why / Details: goal·pronouns·link). Live
  tier/bio/details + the **🔒 private** state come from `get_public_profile`
  (`is_public`); demo/community people stay derived.
- **Wired the avatar taps that were dead:**
  - Community **demo activity cards** (PR/run/workout) — avatar + name now open
    the profile (this is what non-members tap while browsing the feed).
  - **DM threads** (`BSChatThread`) — the header (1:1) + each incoming message
    avatar/name now open the sender's profile (`onOpenProfile` threaded from
    `BSClientFeed`; channels don't open a "profile" for the channel itself).
  - The real community feed (`renderPost`) was already wired.
- *Note:* DM/demo people have no user id, so their profile is derived (tier from
  name-hash, generic bio) until a real account backs the message — same model as
  the website.
- Expanded the website chat `chatWidget.jsx` profile preview (the card that opens
  when you tap an avatar):
  - **Avatar fixed:** dropped the conic-gradient ring (which read as a "weird"
    dark wedge top-left) for a clean solid tier disc + soft ring.
  - **Full initials:** avatars + the preview now use the fullest name available
    (the 1:1 thread name, not the message's first-name-only) → 2-letter initials.
  - **More info:** a 3-up stat row (Tier / Shape Score pts / Role) plus, for real
    members, **pronouns / goal / link** rows from `get_public_profile`.
  - **Privacy:** when a member set their profile to non-Public, the preview shows
    a **🔒 "keeps their profile private — only their name and tier are shown"**
    notice instead of the bio/details. Backed by a new `is_public` flag.
  - **View full profile →** link for coaches (→ Marketplace). (No member full-
    profile page on the website yet — the preview holds all their public info,
    matching mobile.)
- **Migration `2026-06-05-public-profile-visibility.sql`** (**run on Supabase**):
  drops + recreates `get_public_profile` adding an `is_public boolean` column
  (Public visibility). Body otherwise identical to the 2026-06-04 version.

### 2026-06-05 — Paywall: SHAPE logo + moved before the editorial splash
- **Logo:** added the SHAPE wordmark (`/m/shape-logo.png`, the high-res PNG) to the
  **top-left** of `BSPaywall`; the membership copy now centers in the space below
  it (logo top-left, content vertically centered) so everything still fits.
- **Order:** the membership wall now appears **before** the "Shape Daily" editorial
  splash. New launch flow: **cosmos splash → membership gate → (non-member) paywall
  → Preview → Shape Daily splash → app**; members auto-advance through the gate
  (`stage === 'gate'` + a member-resolved effect) straight to the editorial splash
  and the app, so they never see the paywall.

### 2026-06-05 — Website chat bubbles: avatars + tap-to-profile (mobile parity)
- Ported the mobile chat-bubble avatar/profile features into the website
  `chatWidget.jsx` **message bubbles** (the chat box chrome — tabs/sidebar/header/
  composer — is unchanged):
  - **Tier-colored avatars** (2-letter initials) next to each incoming message,
    using the same tier palette (Base steel / Tempo gold / Form teal / Peak violet
    / Legend rose). Helpers `cwInitials/cwTierColor/cwHashTier/cwTierForPoints`.
  - **Tap an avatar or sender name → a public-profile view** (overlay inside the
    pane, with ← Back): tier-ringed avatar (conic ring + filled disc), `tier · role`
    eyebrow, name, "Member of the Shape community", bio, **Message →**, and
    **Coaching →** (coaches → Marketplace).
  - **Derived vs live:** demo/seeded threads have no real user ids, so tier color
    is a stable name-hash and the bio is generic (mobile's exact fallback). When a
    message carries a real `userId`, it fetches the live card via
    `get_public_profile` (`window.shapeDb.client.rpc`) — so live tiers/bios light
    up once there's an actual signed-in account behind the message.
- *Note:* on group/demo threads, **Message →** just returns to the current thread
  (no 1:1 spin-up for fictional members).

### 2026-06-05 — Website Help tab → real AI support (Nora / OpenAI)
- The website chat widget's **Help** tab now talks to the same **OpenAI-backed
  assistant** the mobile app uses (`POST /api/support/chat`, model Nora). It was
  previously a hard-coded `supportReply()` script. `send()` posts the thread
  history (`{messages:[{role,content}]}`) and renders `data.reply`; the server
  falls back to its rule-based responder if the model is down, and the client
  falls back to the local script on a network error. Other tabs keep their
  simulated peer replies.
- **Support is open to everyone:** the member-gate on the composer (PR for chat
  gating) is now **tab-aware** — it only locks the real-messaging tabs
  (Circle/Trainers/Friends/Community) for non-members; the **Help/Support tab
  composer stays available** so prospects can use AI support (matches the
  endpoint, which is intentionally not membership-gated).

### 2026-06-05 — One website chat bubble (consolidation)
- Standardized on the site-wide **`globalChatButton.js`** as the **single** chat
  launcher on every page. Removed **ChatWidget's own floating `.chw-bubble`** —
  ChatWidget now renders only the open panel (opened via `window.__openChat`).
- Fixes the regression where the bubble vanished on click (the prior
  hide-when-native-widget logic hid the global button the moment ChatWidget
  mounted) and removes the original double-bubble at the source. `syncVisibility`
  reverts to always-visible.
- Safe: every non-popout page that loads `chatWidget.jsx` also loads
  `globalChatButton.js` (verified); `chatPopout.html` is docked (never had a
  bubble). Marketing pages' `supportBubble.jsx` still pre-mounts ChatWidget so
  `__openChat` is ready — it just no longer paints a competing bubble.

### 2026-06-05 — Paywall polish + website chat-bubble de-dupe
- **Website chat bubble "double" look fixed:** the site-wide launcher
  (`globalChatButton.js`) was always visible — on pages that also mount the rich
  widget (`chatWidget.jsx` `.chw-bubble`), the two teal pills stacked at a 4px
  offset and read as one bubble behind another. `syncVisibility` now **hides the
  launcher whenever the native widget is present** (`.chw-bubble` closed or
  `[data-chat-panel]` open); the existing MutationObserver re-runs it as the
  widget mounts/opens/closes, so exactly one bubble ever shows.
- **Paywall feature list** (`BSPaywall`) gained two bullets — *Daily habits,
  streaks & check-ins* and *Recipes, meal logging & grocery lists*.
- **Removed the now-redundant "Browse the app" link** from the mobile login screen
  (the paywall's "Preview the app" is the single preview door now).

### 2026-06-05 — Paywall is the post-splash landing (members skip it)
- Mobile launch flow changed: **splash → membership wall** (was splash → login).
  The daily splash now routes to the `app` stage, whose gate shows **`BSPaywall`
  first** for non-members (it no longer waits on the role bundle), with
  Create-account / **Preview the app** / Sign-in. **Login is reached from the
  paywall**, not before it.
- **Members + approved coaches skip the wall** — they fall straight through to the
  app. New **`authReady`** flag holds the "Checking membership…" state until
  `getCurrentSession` resolves (it runs during the splash, so there's no added
  wait), and the membership effect waits on it — so a returning member/coach never
  flashes the paywall before their session + role restore.
- Sign-out now lands on the membership wall (the gate) instead of the bare login
  screen.

### 2026-06-05 — Chat gated to members (mobile + website) + preview-banner dismiss
- **Real messaging is members-only.** Added `/api/conversations` + `/api/messages`
  to the proxy gate (the website chat bubble sends via `/api/conversations`).
- **Mobile chat** = previewable but you can't type (same idea as the website
  community preview). `BSMessageComposer` now shows a 🔒 "Join Shape to send
  messages" bar instead of the input for non-members; tapping it exits preview to
  the paywall. Driven by `window.ShapeCanChat` (set by `BSAppShell` =
  `memberAllowed`, so **coaches** — members by role, not subscription — can still
  type) via a `shape:canchat` event + `useBSCanChat()` hook.
- **Preview banner** (`BSPreviewBanner`) got an **✕ dismiss** so it doesn't sit on
  screen the whole time; `shape:exitPreview` event returns the locked composer's
  Join CTA to the paywall.
- **Website chat bubble** (`chatWidget.jsx`): composer locked for non-members
  (signed-out or free) — shows "Become a Shape member to send messages" + a
  Pricing CTA; approved coaches + active subscribers type normally (resolved from
  `/api/me` role + `/api/stripe/subscription`).
- **Website community page** (`community.jsx`) is a **preview** (left open) — added
  a note under the hero: *the activity is a sample; use the chat bubble (bottom-
  right) to actually send messages (members only).*

### 2026-06-05 — Server-side member enforcement (proxy gate)
- Hardened the UI paywall with **real server-side enforcement** in the Next 16
  **proxy** (`src/lib/supabase/middleware.ts`, run by `src/proxy.ts`). The paid
  client API prefixes — **`/api/client`, `/api/nutrition`, `/api/ai`,
  `/api/insights`, `/api/calendar`** — now return **402 `membership_required`**
  (or 401) unless the requester is an approved coach, an admin, or a client with
  an **active platform subscription**. Honors both auth styles: **Bearer** (native)
  and **cookie** (web). **Fails open** on any unexpected error so a gate fault can
  never take down the paid routes.
- New edge-safe **`src/lib/membership-core.ts`** (`computeMembership`, `adminEmails`,
  `ACTIVE_SUB`) — no `next/headers`, so it's importable from the Edge proxy. Admin
  list mirrors `admin-access.ts` (which can't be imported into Edge).
- **Not gated** (deliberate, so flows keep working): billing/auth/webhook, public
  marketing + marketplace + leaderboard, coach routes (coaches are members; coach
  data is RLS-scoped), and integration connect/OAuth. The non-member client app
  already falls back to demo data on a non-200, so Preview mode degrades cleanly.
- *Note:* `computeMembership` runs ~2 lightweight queries per gated request; a
  SECURITY DEFINER `is_member()` RPC could collapse that to one if latency matters.

### 2026-06-05 — App-wide member gate (paywall) — mobile + website
- **Shape is now members-only.** Full access requires an **active $5/mo
  subscription** OR an **approved coach** account (authoritative `profile.role`,
  trainer/nutritionist). Admins exempt on the website.
- **Mobile** (`BSAppShell`, `iosAppBroadsheetMain.jsx`): a single gate wraps the
  role-dispatched app. Non-members get **`BSPaywall`** (Join → `/api/stripe/
  platform-checkout` when signed in, else create-account; Sign in; Sign out) with
  a **"Preview the app"** path → renders the real app behind a persistent
  **`BSPreviewBanner`** ("Join Shape · $5/mo") so prospects can see features +
  function. Coaches bypass by role.
  - **Fail mode:** fail-closed, but **never locks out a confirmed member** —
    membership is cached (`window.ShapeMembership` + `localStorage 'shape.member'`)
    and a failed/unreachable `/api/stripe/subscription` check falls back to the
    last-known status (so a transient/native API failure doesn't paywall a member).
    Seeded from cache → no paywall flash on reload.
  - No dev "unlock" bypass (per request) — preview the app via the paywall's
    Preview path or a real member/coach login.
- **Website** (`src/app/dashboard/layout.tsx`): the dashboard layout gates every
  `/dashboard/*` route — coaches/admins free; clients need an active
  `platform_subscriptions` row (status active/trialing/past_due), else the content
  is replaced with a **Members-only** paywall (🔒 + Pricing CTA). The public
  marketing / newdesign pages remain the website's "preview".
- *Scope:* UI/route gate on both surfaces. Real enforcement of paid features must
  still be server-side per endpoint; this gates access to the app shell.

### 2026-06-05 — Spotify "pick from your library" on the website too
- **`public/newdesign/trainerPlaylistsPage.jsx`** (`NewPlaylistCard`, shared by the
  trainer **and** nutritionist website Playlists pages): the import modal now offers
  **"Pick from your Spotify"** alongside paste-a-link — calls
  `/api/integrations/spotify/playlists` (cookie auth), lists the coach's playlists
  (cover/name/tracks/owner), and prefills the URL + name on pick. Same **BETA**
  gating as mobile: a not-connected response shows a **Connect Spotify →** link (to
  `/api/integrations/spotify/authorize?return=…`), and any other failure degrades
  gracefully to "Library import is still rolling out … paste a link instead."
- Backend reused as-is (the playlists route + `currentUser` already accept the
  website cookie session); the dropped `user-read-email` scope + Extended Quota prep
  are server-side, so they already applied to the website.

### 2026-06-05 — Shape Store gated to members (mobile + website)
- **`BSShapeStorePage`** now checks membership before rendering the catalogue. A
  signed-in account with an **active subscription** (`/api/stripe/subscription` →
  `active:true`) gets in; **coaches** (role trainer/nutritionist) are allowed too
  (providers). Free / signed-out users see a **"members only"** upgrade prompt
  (🔒 + "Activate membership · $5/mo" → `bsStartPlatformCheckout`, or "Join Shape"
  when signed out) instead of the store. Note: "You still earn points — redeem
  them once you're a member."
- Shared **`useBSMembership()`** hook drives the gate and the **Me-page "Shape
  Store" row**, which now reads **"Members only · tap to join"** with a 🔒 for
  non-members. Result cached on `window.ShapeMembership` so repeat opens don't
  flash the loading state. The gate lives inside the page, so every entry point
  (Me row, Settings, Score page, store tab) is covered.
- **Website** (`public/newdesign/store.jsx`): `StorePage` applies the same rule —
  resolves the signed-in user (Supabase), allows coaches (`profiles.role`) +
  active subscribers, else renders a **`StoreMembersOnly`** section (🔒 + Pricing
  CTA) in place of the catalogue.
- *Scope:* UI gate (the catalogue/redemption is still illustrative — no live
  redemption API to enforce server-side yet).

### 2026-06-05 — App tour: coach variant + new-accounts-only trigger
- **Coach tour** (`BSProOnboardingTour`, pros module): role-accented (teal trainer /
  gold nutritionist) walkthrough — Welcome → Today / Clients / Plans / Chat / Me →
  You're set. Wired into **both** coach shells (`BSTrainerAppInner`,
  `BSNutritionistAppInner`); the Plans step uses each shell's real tab key
  (`programs` trainer / `plans` nutritionist). Persists to `shape.coachTourSeen`
  + `user_goals('coach_onboarding')`. New **Me → App tour** row (in `BSProMe`
  settings) replays it via the shared `shape:startTour` event.
- **New-accounts-only trigger** (client + coach): the tour now auto-shows **only
  for accounts created in the last 24h** (`ShapeAuth…user.created_at`) that haven't
  seen it — existing users no longer get it on next load (still replayable from
  Me → App tour). Auth-resolve timing handled with an immediate check + a 1.2s
  retry; a guard prevents double-firing.

### 2026-06-05 — First-run app tour (client) — skippable + replayable
- New **`BSOnboardingTour`** (client module): a ~60-second, **skippable** guided
  walkthrough that auto-appears once when you first land in the app and can be
  **replayed anytime from Me → App tour** (`shape:startTour` event).
- 7 steps (Welcome → Home / Train / Eat / Chat / Me → You're set). Each step
  **switches the underlying tab** (`onNavigate={setTab}`) so the real screen shows
  behind a card with eyebrow/title/body, progress dots, Back/Next, and a ✕/Skip.
- **Trigger:** auto-shows unless already seen — localStorage fast-path
  (`shape.tourSeen`) + cloud `user_goals('client_onboarding')` so it doesn't
  re-appear across devices. Welcome step offers **Take a quick tour** / **Skip for
  now**; finishing or skipping marks it seen (`bsMarkTourSeen`).
- Mounted in `BSClientAppInner` (portals into `#bs-phone-surface`, above the tab
  bar). New **Me → App tour** shortcut row dispatches `shape:startTour`.
- *Follow-up:* a coach-app variant (trainer/nutritionist) reusing the same shell.


### 2026-06-05 — Coach "Adjust program/plan" actually adjusts (persists on Apply)
- The Adjust page (`BSProAdjustProgram`) controls used to be cosmetic — they only
  rewrote the auto-note. Now **Apply & Send / Apply & Notify** persist the full
  adjustment to the client's coach-writable program record, and the client app reads
  it back. Selections still take effect **only on Apply** (never on tap).
- **Migration `2026-06-05-client-program-detail.sql`** (**run on Supabase**): adds a
  `detail jsonb` column to `client_programs` (inherits the existing coach-writable RLS).
  Shape: `{ training:{intensity,sessions,weeks,focus[],days[],note,updatedAt},
  nutrition:{calories,protein,carbs,fat,meals,refeed,restrictions[],note,updatedAt} }`
  — trainer writes `training`, nutritionist writes `nutrition`; the two coexist.
- `shapeBackend.js`: `ShapeProgramApi.get/set` now read/write `detail` (set **merges**
  the incoming section over what's stored so a trainer's edit never clobbers a
  nutritionist's, and vice-versa).
- **Coach page** seeds its controls from the last-applied `detail` on reopen (so it
  shows what's currently in effect), and `apply()` writes `detail` via `ShapeProgramApi.set`
  before sending the note. Helper text now reads "On apply · updates {client}'s Train/Eat
  tab + sends this note" (live) / "applies once linked" (demo).
- **Client** (`useBSProgram` now carries `detail`): new **`BSCoachAdjustBanner`** ("FROM
  YOUR COACH · {date}" + chips + the note) renders atop **Train** (training) and **Eat**
  (nutrition). On **Eat**, coach-set **calories + P/C/F** override the hero's target
  numbers when present. Only appears once a coach has pressed Apply for a linked member.
- *Still illustrative:* the trainer split/sessions don't yet rewrite the Train deck's
  per-day workouts (banner + header reflect the intent); Eat target override is the
  hero card (other meal-plan views keep their plan targets). Follow-up if we want the
  adjustment to drive the full program/plan generation.


### 2026-06-13 — Coach plans persist + sync (coach_plans) — AI draft saves
- **Migration `2026-06-13-coach-plans.sql`** (**run on Supabase**): `coach_plans`
  (owner-scoped RLS; kind program|meal_plan; name/meta/price/published/detail jsonb).
- **API `/api/coach/plans`** (GET ?kind / POST / PATCH / DELETE, owner-scoped).
- `shapeBackend.js`: `ShapeCoachPlans.list/create/update/remove`.
- **Mobile** `BSTrainerPrograms` / `BSNutriPlans`: catalogue now loads the coach's saved
  plans from the API (merged ahead of the demo seeds). The **AI draft → Generate** saves a
  real `coach_plans` row (persists + syncs), and **Duplicate** persists a copy
  (localStorage fallback when signed out).

### 2026-06-13 — Soundtrack import resolves real Spotify metadata
- `/api/coach/soundtracks` POST now resolves a pasted **Spotify** playlist link via the
  client-credentials flow (`SPOTIFY_CLIENT_ID/SECRET`): pulls the playlist **name** (when
  the coach left it blank), **track count**, and **duration**, stored in existing columns.
  Graceful no-op when creds are absent or the link isn't a Spotify playlist. No schema change.

### 2026-06-13 — Coach soundtracks sync (web ↔ mobile) + Assign by-client tab
- **Migration `2026-06-13-coach-soundtracks.sql`** (**run on Supabase**): `coach_soundtracks`
  (owner-scoped, RLS; `attached` jsonb of `{id,kind,name}`) + updated_at trigger.
- **API `/api/coach/soundtracks`** (GET/POST/PATCH/DELETE, owner-scoped).
- `shapeBackend.js`: `ShapeSoundtracks.list/create/update/remove`.
- **Mobile `BSProSoundtracks`** now syncs: loads the coach's saved playlists from the API,
  Import creates server-side, Assign attaches via PATCH (falls back to localStorage when
  signed out). New **Assign tabs** — *Plans & workouts* and *By client* (search a client →
  attach the soundtrack to their assigned workouts).
- **Website Playlists page** (`trainerPlaylistsPage.jsx`) reads the same `coach_soundtracks`
  (server playlists merge into the library) and its Import modal saves to the API — so
  playlists created on either surface appear on both. (Attach-on-website still local for the
  demo seed rows; server rows carry their attachments.)

### 2026-06-13 — MESSAGE button wired + website coach client page redesigned
- **MESSAGE** button (mobile client profile) is wired: both coach shells listen for
  `shape:proMessageClient` → `getOrCreateMemberConversation` with the client + jump to the
  **Chat** tab (thread appears at the top of the coach's DMs).
- **`/api/clients/[id]/shared-overview`** now also returns **`stats`** (`get_client_stats`)
  and **`lifts`** (`get_client_lifts`) alongside `goals` (all share-gated).
- **Website coach client page** (`public/newdesign/coachClientDetail.jsx`) rebuilt in line
  with the mobile redesign: **Overview / Analysis** tabs, role-accented (teal trainer / gold
  nutritionist). Overview = KPI stat grid, **Key lifts** (trainer) / **Macros vs target**
  (nutri), a **bodyweight / weight-trend** chart, plus the existing Care team / Current plans
  / Goals / Upcoming+Recent. Analysis = a 6-up KPI grid + a trendline. Live values from the
  new rollups with per-field demo fallback.

### 2026-06-13 — Nutritionist Adjust Plan + Schedule (distinct bodies)
- **`BSProAdjustProgram`** now renders a **nutritionist-specific body** (gold) when
  `role==='nutritionist'`: ENERGY · Calorie target stepper (kcal, step 50), MACROS · Daily
  split (Protein/Carbs/Fat steppers with `g` unit + a **from-macros** summary card: kcal
  from macros, ± vs target, teal/gold/rust split bar, `NP·NC·NF`), STRUCTURE · Meals & refeeds
  (meals/day stepper + Weekend-refeed toggle), CONSTRAINTS · Restrictions chips. Auto-note
  reads "Updated your plan to {kcal} kcal — …". Trainer body unchanged.
- **`BSProScheduleSession`** nutritionist variant: session types CONSULT / PLAN DELIVERY /
  FOOD-LOG REVIEW / INTRO CALL, modes ZOOM / CALL / IN-PERSON (no GYM), default 30 min,
  "Book a consult." `PLAN` kind added to the calendar map.
- `BSProStepper` gained `step` + `unit` props.

### 2026-06-13 — Coach dashboard: Key lifts / PRs / AVG RPE wired (get_client_lifts)
- **Migration `2026-06-13-client-lifts.sql`** (idempotent, **run on Supabase**): SECURITY
  DEFINER `get_client_lifts(p_user_id)` gated on `is_coach_on_client`. Best-effort strength
  rollup from `workout_set_logs` / `workout_sessions`: **key lifts** (best parsed load per
  move over 90d + recent-vs-prior delta, top 5), **PR count** (moves improved in the last
  30d vs the 30–90d window), **avg RPE** (parsed from the set `payload.rpe` when present),
  and 42d logged-workout count. Loads/reps are free text so numbers are regex-parsed; null
  fields when there's nothing to read.
- `shapeBackend.js`: `ShapeClientStats.getLifts(userId)`.
- **`BSProClientFullProfilePage`** now threads the rollup in (per-field demo fallback):
  the **Key lifts** list (name · best · ▲delta · relative bar), the **AVG RPE** and **PRS**
  stat cards (Profile), and **AVG RPE / TOTAL PRS** on the Analysis tab.

### 2026-06-13 — Coach "Adjust program" + "Schedule" action pages (wired)
- The profile header's **ADJUST PROGRAM / ADJUST PLAN** and **SCHEDULE** buttons now open
  real full pages (`BSProAdjustProgram` / `BSProScheduleSession`, role-accented teal/gold)
  instead of firing no-op events.
- **Adjust program** ("Tune the program.") — Intensity segmented control (Deload/Maintain/
  Progress) with a live descriptor, Frequency & block steppers (sessions/week, weeks
  remaining), multi-select Focus chips, a tappable Weekly-split editor (⇄ cycles each day),
  and an auto-generated, editable **Note to {client}**. **Apply & Send / Apply & Notify**
  open/find the 1:1 conversation (`getOrCreateMemberConversation`) and **send the note to
  the client** (`sendMessage`, metadata `{kind:'program_update',notify}`); demo clients
  (no user id) show a "sends once linked" hint.
- **Schedule** ("Book a session.") — session type, day picker (next 7 days), open-slot grid,
  duration segmented control, mode chips, repeat-weekly toggle, a live booking summary, and
  **Add to calendar** → `ShapeCalendar.create({ userId: client, kind, title, date, time,
  durationMin, … })` (writes to the client's calendar via `/api/calendar`, coach role).
- Shared chrome helpers added: `BSProActionHead/ClientMini/ActionSec/Chips/Segment/Stepper`.

### 2026-06-13 — Coach client dashboard wired to live KPIs (get_client_stats)
- **Migration `2026-06-13-client-stats.sql`** (idempotent, **run on Supabase**): SECURITY
  DEFINER `get_client_stats(p_user_id)` gated on `is_coach_on_client`. Aggregates the
  coach-readable tables into one call: `sessions` attendance (completed/planned, last
  42d) + recent sessions, `daily_health_snapshot` nutrition (days logged 7/30d, avg
  calories/protein/carbs/fat over the last 7 logged days, workout minutes 30d), and
  `client_weigh_ins` (now/start/count). Null fields when there's no data.
- `shapeBackend.js`: **`ShapeClientStats.get(userId)`** → the RPC.
- **`BSProClientFullProfilePage`** now fetches the rollup for a linked client and threads
  live values into the dashboard with **per-field demo fallback**:
  - **Profile tab** — Attendance % + `done/planned sessions` (trainer); Adherence % +
    `N/7 days logged` (nutri); SESSIONS, WEIGHT Δ, LOGGED stat cards; **Macros vs target**
    rows (avg protein/carbs/fat); AVG INTAKE (avg calories); Recent sessions list (live
    `sessions`). Weight chart already lived off weigh-ins.
  - **Analysis tab** — ADHERENCE / SESSIONS / AVG INTAKE / PROTEIN / WEIGHT Δ / DAYS
    LOGGED KPIs pull from the same rollup.
  - Still demo (no clean source yet): bar sparklines, AVG RPE, PRs, Key lifts, streaks,
    the consult/cohort lines. Demo roster clients (no user id) stay fully demo.

### 2026-06-13 — Coach clients roster redesign (card list + header) — tab bar removed
- **`BSProRosterView`** (shared, `iosAppBroadsheetPros.jsx`) replaces the old divider-row
  roster on **both** coach client pages: editorial header (`{N} ACTIVE · +3 THIS MONTH`
  eyebrow + serif **"Your clients."** + a `+` add button), a search box, **scrollable
  filter pills** (scrollbar hidden via `.bs-hide-scroll`), the **Active / Past** toggle
  (kept), and tappable **rounded client cards** (avatar, serif name, `{program} · {N}d
  streak`, a status pill, chevron). Tapping a card opens the full profile directly.
- **`BSProStatusPill`** maps status → colored outline pill: ON TRACK / NEEDS EYES / NEW /
  MISSED / PR / DELOAD / PAST.
- **Removed the ROSTER / CONSOLE / ANALYSIS section sub-tab bar** (`BSProClientsTabBar`)
  from the clients page per request — the clients page is now just the roster. The
  section-level **Console** and **Analysis** screens are no longer linked from here
  (components left intact; per-client Analysis now lives inside each client profile).
- Demo rosters refreshed (name · program · streak · status) to match the new design;
  `bsClientMatchesFilter` extended (NEEDS EYES now includes `missed`).

### 2026-06-13 — Coach client-profile redesign (trainer + nutritionist) + roster filters
- **`BSProClientFullProfilePage`** (mobile coach apps, `iosAppBroadsheetPros.jsx`) fully
  rebuilt into a **role-aware, 3-tab dashboard** (teal for trainers, gold `#d8b25a` for
  nutritionists). Custom editorial header: `{phase} · WEEK 6 OF 12` / `{phase} · 2100
  KCAL` eyebrow + ← BACK, big serif name (last word accent-italic), avatar + since/streak
  + teal status pill (ON TRACK / STRONG / PAST), and **MESSAGE / ADJUST · PLAN / SCHEDULE**
  buttons.
  - **Profile tab** — big metric card (trainer ATTENDANCE 96% + 7-week bars / nutri
    ADHERENCE 92% + Mon–Sun bars), 4 stat cards, **Key lifts** (trainer) / **Macros vs
    target** (nutri), **Bodyweight / Weight trend** chart (driven by the client's **live
    shared weigh-ins** when available, else demo), **Recent sessions/logs**, **Inbox ·
    Needs your eyes**, and a private **Coach / Clinical note**.
  - **Analysis tab** — "ANALYSIS · LAST 30 DAYS" summary: a one-line readout + a 6-up KPI
    grid (role-specific) + a TRENDLINE chart (weekly volume / weight).
  - **Manage tab** — the previous coach controls, restyled: **program-phase** chips
    (live `ShapeProgramApi` setter), the client's **shared goals** (read-only, share-gated,
    with the live weight-trend mini-chart), and coach notes. (ADJUST jumps here.)
  - Nutritionist console now passes `role="nutritionist"`; trainer keeps the default.
- **Roster search + filters** on **both** coach client pages: new `BSProRosterFilter`
  (search box "Search N clients" + scrollable pills — ALL / ON TRACK / NEEDS EYES / NEW /
  CUT / BUILD [/ PEAK]) sits atop the roster under the tab bar. `bsClientMatchesFilter` /
  `bsClientMatchesQuery` filter the live roster (status/phase + name/meta search), role-aware.
- Dashboard stats/lifts/macros/recent/inbox are illustrative demo data; the bodyweight
  chart + shared-goals card are live when the client is a linked member who shares.

### 2026-06-13 — War Room: register client goals & weigh-ins
- New checklist section **"Client goals & weigh-ins"** in `src/lib/warroom.ts`: the
  3-tab Goal page, Me-page featured goal box, share-with-coaches toggle, coach read of
  shared goals (mobile + website + `/shared-overview`), live `client_weigh_ins` table +
  `ShapeWeighIns`, and the coach weight-trend chart — all `done`; the two migrations
  (`2026-06-13-client-goals-coach-read.sql`, `2026-06-13-client-weigh-ins.sql`) tracked
  as `manual` (applied on Supabase). No new API routes (`/shared-overview` already in
  `RAW_ROUTES`).

### 2026-06-13 — Client Goal page redesign: Overall / Training / Nutrition dashboards
- Rebuilt `BSClientGoals` into **three themed dashboards** (per the new designs):
  - **Overall** (teal): "down so far" weight card (start/now/target + draggable progress),
    current/to-go/weekly-pace/on-track stats, weight trend chart (`BSGoalsTrend`),
    milestones, your plans, this-week targets, consistency heatmap, "your why", log
    weigh-in CTA.
  - **Training** (rust): "strength held" card + 7-week heatmap, sessions/streak/RPE/PRs
    stats, lift targets, milestones, "your program" card.
  - **Nutrition** (gold): shared weight card + trend (gold), current/to-go/adherence/pace
    stats, **macros vs target** rows, milestones, "your plan" card, weekly nutrition targets.
- **Tab-aware header**: per-tab eyebrow + serif title (last word accent-italic) + subtitle,
  an **Edit** button (Overall → body-comp fields incl. start/now/target/why; Training/
  Nutrition → headline title+subtitle), and a per-tab accent on the 3-up tab pills.
- Persists `overall` + `trainingMeta`/`nutritionMeta` to `user_goals('client_goals')`;
  the **share-with-coaches** toggle moved to the page bottom (applies to all tabs). The
  dashboards' trend/milestones/targets are illustrative demo data for now.

### 2026-06-13 — Home quick-chips restyle (Today / Log / Habits / Score)
- The 4 home quick-action chips got a bolder, more modern look: rounder (15px), a
  soft **accent-tinted fill** + accent eyebrow, and a **bold display value** (15px/800,
  was tiny mono). The **Today** chip is now **hollow** (transparent fill, white `INK`
  border + text) instead of a solid black block.

### 2026-06-13 — Me-page featured goal box
- Client **Me** page: new **featured goal** card right below the Shape Score card —
  teal-tinted, taps through to the Goal page. Eyebrow `YOUR GOAL · BY {date} ›` +
  `{N}% THERE`, serif title (last word teal italic), teal progress bar, and the goal's
  subtext. Driven by the client's top goal (training[0] → nutrition[0], loaded from
  `user_goals('client_goals')`; demo default until loaded).

### 2026-06-13 — Weigh-ins are live (dedicated table) + coach sees the trend chart
- **Migration `2026-06-13-client-weigh-ins.sql`** (idempotent, **run on Supabase**):
  new `client_weigh_ins` table (user_id, logged_on date, weight, unit; one row/day via
  upsert), RLS (client owns; coach reads via `is_coach_on_client`). Also **extends
  `get_client_goals`** to merge the live series into `overall.weighIns` + set
  `overall.now` to the latest weigh-in (still share-gated).
- `shapeBackend.js`: **`ShapeWeighIns.list()` / `.log({weight,unit})`** (upsert today).
- **Client goal page**: when signed in, loads the series from the table (table wins for
  weighIns/now) and **Log weigh-in writes to the table**; signed-out/demo still uses the
  `user_goals` JSONB. The headline metas (training/nutrition) now load too.
- **Coach view** (mobile `BSProClientFullProfilePage` + website `coachClientDetail.jsx`):
  the Overall goal card now draws the client's **weight trend chart** from the live
  `overall.weighIns`.

### 2026-06-13 — Coach goal view follows the redesigned goal (Overall + headlines)
- The redesign moved client goals to `overall` + `trainingMeta`/`nutritionMeta`; the
  `get_client_goals` RPC already returns the whole doc, so just the coach UIs changed.
- **Mobile** (`BSProClientFullProfilePage`) + **website** (`coachClientDetail.jsx`):
  the Client-goals card now shows the client's **Overall** body-comp goal (title +
  progress bar + `down · to go · now · target`, with the target date), plus the
  **Training** and **Nutrition** headline goals (title + subtitle). Private / none /
  loading states unchanged.

### 2026-06-13 — Coach goal view on the website + goal-sheet polish
- **Website coach client page** (`coachClientDetail.jsx`): added a **GOALS** card showing
  the client's shared Training/Nutrition goals (progress + target), fed by the
  `shared-overview` API route which now calls `get_client_goals` (server-side, the coach's
  session → RLS-gated). Same states as mobile: private / none / list.
- **Mobile goal sheet**: per-goal **Edit** button now teal; removed the drag-handle bar
  at the top of the add/edit sheet.

### 2026-06-13 — Coach sees a client's shared goals (read-only)
- **Migration `2026-06-13-client-goals-coach-read.sql`** (idempotent): SECURITY DEFINER
  `get_client_goals(p_user_id)` — returns the client's `user_goals('client_goals')`
  document **only** to a coach linked via `is_coach_on_client`, and **only** when the
  client's `share` flag is on (else `{share:false}`; `null` when not their coach).
  **Run on Supabase.**
- `shapeBackend.js`: `ShapeGoalsApi.getForClient(userId)` → the RPC.
- **Coach app** (`BSProClientFullProfilePage`): new **Client goals** section under the
  program-phase chips — fetches via the RPC and renders the client's Training/Nutrition
  goal cards read-only (progress + target). States: private ("keeps their goals
  private"), none shared, or demo ("appears once linked to a live member").

### 2026-06-13 — Client Goal page (Training/Nutrition tabs + coach-visibility toggle)
- **Mobile**: new `BSClientGoals` (linked from the **Me** tab → "Goals"). Mirrors the
  website goal page (`public/newdesign/ClientGoal.html`): goal cards (eyebrow `GOAL ·
  N%`, title, current/target, progress bar, subtext, optional target-date countdown)
  and a bottom-sheet add/edit flow with a **categorized template picker** (the website's
  templates, filtered to the active tab's group). Persists to `user_goals('client_goals')`
  as `{ share, training:[], nutrition:[] }`.
  - **Training / Nutrition tabs** split the goal lists; **Share with your coaches**
    toggle controls coach visibility (stored on `share`).
- **Website** (`ClientGoal.html`): added the same **Training/Nutrition tabs** + **Share
  with coaches** toggle; split `DEFAULT_GOALS_STATE.goals` into `training`/`nutrition`
  (+ `share`), migrate the legacy flat `goals` array into Training on load, and
  save/delete/Archive now operate on the active tab.

### 2026-06-04 — Fix: logging in as a coach lands in their app (not client)
- Signing in as a trainer/nutritionist dropped you into the **client** app until you
  manually switched role in Settings — the role state wasn't reliably re-derived from
  the signed-in profile at login.
- `BSAppShell` now (1) has a reactive effect that **follows `authState.profile.role`**
  whenever a session resolves (login OR restore), and (2) `handleLogin` sets both
  `role` and the `role` tweak from the account's profile — so a coach lands in their
  own app, and a stale dev-override can't pull them back to client. The Tweaks-panel
  override still works after login.

### 2026-06-04 — Recover from stale-chunk "failed to fetch dynamically imported module"
- Switching profiles (role → `loadProsBundle`) could throw **"Failed to fetch
  dynamically imported module … iosApp…-<hash>.js"** — a stale chunk after a redeploy
  (the cached `index.html` points at a hash that no longer exists).
- `loadClientBundle` / `loadProsBundle` now `.catch` import failures via
  **`_bsChunkRecover`**: on a stale-chunk error it **reloads once** (sessionStorage
  guard → one auto-reload per tab session) so the fresh `index.html` pulls the new
  hashes; the cached bundle promise is reset so it isn't stuck rejected.
- The bundle-error screen is friendlier — **"A new version is available. Reload to
  continue."** + a **Reload →** button (clears the guard) — with the raw error kept
  small below. *(Takes effect once this build is live; an existing stale tab needs one
  manual refresh to pick it up.)*

### 2026-06-04 — Avatar color = your tier (app-wide); accent picker removed; instant save
- **Every "your own" avatar now fills with your Shape Score tier color** (Base/steel
  until you earn points): the 5 client header avatars, the **Settings** identity editor
  (edit + non-edit), and — via newly window-exposed `bsMyName/bsMyInitials/bsMyTierColor`
  — the coach home headers + `BSProMe`. Tier is cached on **`window.ShapeScore`**
  (`_bsUseLiveScore` + a startup `/api/client/score` fetch in both the client and the
  two coach shells).
- **Removed the avatar accent-color picker** in Settings → edit-profile; the swatch row
  is now a read-only "{tier} tier color" chip. (`accent` is no longer used for the
  avatar; the editor's focus/chip accent follows the tier color too.)
- **Instant update on save**: saving the profile fires a `shape:identity` event; the
  app shell bumps `identityVersion`, so the avatars on the **current** screen pick up
  new initials immediately — no navigation needed.

### 2026-06-04 — Feed avatars: 2-letter initials, tier-colored own bubble, custom initials
- **Full (2-letter) initials** in the feed + community-activity avatars (e.g. "CP"
  not "C"); the role-feed avatar grew 32→36px to fit them cleanly. New `bsInitials()`
  helper (DM threads already did this).
- **Own bubble matches my real tier**: in chat, my own posts now tint to my actual
  Shape Score tier (Base/steel until I earn points) instead of a name-hash — resolved
  the same for the optimistic + persisted copies so it never flips.
- **Custom avatar initials** — edit-profile gained an **"Avatar initials · max 2"**
  field (alphanumeric, auto-uppercased, clamped to 2). Stored in `client_identity`
  and cached on `window.ShapeIdentity`, hydrated at app startup, so the override shows
  on **every** avatar — header, feed, Me card, and the coach Me page (`BSProMe`) —
  not just the edit form. Blank = derive from the display name. `bsMyInitials()` reads
  the override first.

### 2026-06-04 — Fix self-identity in feed + coach Me page
- **Feed: own posts kept flipping color.** The optimistic **"You"** post derived its
  tier from a hash of the string `'You'` (→ one color) while the persisted copy hashed
  the real name (→ another), so a just-sent message changed color after navigating away
  and back. Now any post that's **mine** resolves its tier from my real account
  identity — my real tier when known, else a stable hash of `bsMyName()` — so the
  optimistic and persisted copies always match. Own posts also read **"You"**
  consistently (was "You" → real name on refetch), and `myUserId` is included in the
  feed's tier batch.
- **Coach Me page showed "Jordan Chen".** `BSProMe` (trainer/nutritionist Me tab) was
  hardcoded via a `name` prop, so the header didn't match the name in Settings. It now
  uses the signed-in account's `full_name` (same source as Settings + the client Me
  page), falling back to the demo prop when signed out; the public-profile link uses it
  too.

### 2026-06-04 — Habits: "To don't" rename + compact Earned-today header
- The avoid section + the Earned-today card breakdown now read **"To don't"** (was
  "Don't do it"); "To do" unchanged.
- **Earned-today card top compacted** to match the breakdown sizes below it: big
  number 38→22, eyebrow 8.5→8, pts 10→8.5, subline 9→8.5, ring 48→42 (inner 37→32,
  % 10→9).

### 2026-06-04 — Header avatars match the signed-in account + chat top-rule removed
- The five "your own" header avatars (home / train / eat / chat / me) were hardcoded
  to **"A"**. New `bsMyName()` / `bsMyInitials()` helpers read `profiles.full_name`
  from the auth cache (the same source the Me page uses; the edit-profile flow writes
  + mirrors it), so the avatars now show the account's **real initials** (e.g. "JD"),
  falling back to the demo identity when signed out.
- The **Me identity card** now seeds its name + handle from the signed-in account
  (was a hardcoded "Alex Rivera" / "@alex.rivera") before any edit; a saved
  `client_identity` still overrides.
- **Chat page top border removed**: `BSMasthead`'s top hairline is now suppressed when
  `noRule` is set. Only the feed/chat passes `noRule`, so other mastheads keep it.

### 2026-06-04 — Habits page copy/colors + score breakdown; About hero accents
- **Habits sections renamed**: "To-dos" → **"To do"**, "To-don'ts" → **"Don't do it"**.
- **Don't-do-it section is red**: its count eyebrow + **+ Add →** now use the section
  `accent` (rust) instead of teal. The avoid-eyebrow word **"Clean" → "Stop"**
  (`0/1 Stop`).
- **Earned-today card breakdown**: added a 2nd section splitting the day's points into
  **To do** (teal) vs **Don't do it** (rust) — each with `+earned / possible pts` and a
  mini progress bar.
- **About page**: "shape" in the **"A place to shape a life."** hero is now teal; the
  closing line **"Come shape with us." → "Join the community."** (accent on "community").

### 2026-06-04 — Train session wired to the shared week (end-to-end workout consistency)
- The Train tab's demo program (`MOCK_PROGRAM`) was a **different week** than the
  shared one — e.g. Thursday read "Lower Pull — Peak" on Train but "Z2 run · 45 min"
  on home/calendar. Now the Train **deck, live session, and preview** all build from
  the same source.
- New **`bsBuildDemoTrainProgram(t)`** (in `bsClientWeekDemo.js`) builds the 7-day
  Train program from `BS_CLIENT_WEEK_DEMO` + `BS_CLIENT_WORKOUTS`, mirroring the
  live-plan builder's day shape. `MOCK_PROGRAM` is now just `bsBuildDemoTrainProgram(t)`
  (~135 lines of hardcoded data removed). Real assigned plans still win (`liveProgram`).
- **Live session reflects the real scheme**: the player now parses `4 × 8 · …` →
  `{ sets:4, reps:'8' }` per move (was a hardcoded `sets:4, reps:'6-8'`); cardio
  segments fall back to one set.
- **Hero** eyebrow shows the day + the workout's real time (e.g. "Today · 5:45 PM"),
  and meta comes from the workout (no more hardcoded "52 min · … RPE 8 · ~420 kcal").
- **"On deck"** list is derived from the program (next 3 days, tap to jump) instead
  of a hardcoded list.
- **Preview** prefers each move's authored `cue`; added a distinct `brief` to each
  workout so the preview's brief + coach line differ.
- Net: a given weekday now shows the **same workout** on the home hero, the week
  strip, the calendar, the Train deck, the preview, and the live player.

### 2026-06-04 — Shape Kitchen polish: top buffer, clear Send button, one filter section
- **Top buffer**: the Shape Kitchen header sat too high (`14px` top) — bumped to
  `54px` to match the standard page buffer (`BSPageHeader`).
- **Send to grocery list** button de-emphasized: removed the solid teal fill →
  transparent with a hairline border (matches the Save button's outline).
- **Filters merged into one section**: the meal-type quick pills and the separate
  collapsible "FILTERS" bar are now a single block — the pills row gains an inline
  **Filters ▾** toggle (active-count + Clear) that expands the Diet / Protein /
  Free-from / Goals groups in place. Removed the standalone FILTERS disclosure bar.

### 2026-06-04 — Fix: Train "Plan" → calendar → back no longer auto-starts a workout
- The Train **"On deck · Plan →"** action opens the calendar overlay, which (early
  `return` in `BSClientAppInner`) **unmounts** `BSClientTrain`. The auto-launch was a
  **monotonic counter** (`trainAutoStart`) and the screen started a session whenever
  `autoStart > 0` on mount — so hitting **back** remounted Train and re-fired the live
  session if the counter had ever been bumped.
- Replaced the counter with a **one-shot `pendingTrainStart` flag**: the calendar's
  "Start session" sets it true; `BSClientTrain` consumes it (`onAutoStartConsumed` →
  back to false) the moment it launches, so a remount with no pending start does
  nothing. Plan → calendar → back now returns to the Train deck, as expected.

### 2026-06-04 — Home "Up next" workout reflects today's real session
- The home **"Up next" workout card** + its **preview** (`BSHomeWorkoutPreview`) were
  hardcoded to "Upper Pull — Peak", so the featured workout didn't match the day.
  Now both read **today's actual workout** from the shared week (`bsClientWorkoutForDay`).
- Added **`BS_CLIENT_WORKOUTS`** (in `bsClientWeekDemo.js`) — move lists + coach note +
  summary keyed by the week's TRN titles (4 strength days + 2 cardio days). The hero
  card shows the title, the day's scheduled time, a short meta, and the first 3 moves
  (+N more); the preview shows the full move list, coach note, and a "Today · …" date.
- **Cardio** workouts (Z2 / long run) render as segments (no load); the **rest day**
  (Sun) shows an "Active recovery." card instead of a session.
- *Note:* the Train-tab session itself isn't wired to this yet — only the home hero +
  preview. (Possible follow-up.)

### 2026-06-04 — Month-view day cells are square
- `BSCalendarMonth` day cells were a fixed `minHeight: 58` over a ~46px-wide track
  (portrait rectangles). Swapped to **`aspectRatio: '1 / 1'`** (padding/gap trimmed)
  so each day box is square.

### 2026-06-04 — Home week strip ⇄ month calendar now share one source
- The client **home week strip** (day-log + week dots) and the **month calendar**
  (logged-out demo) were two **independent hardcoded datasets**, so the same weekday
  showed different workouts; the calendar also had a **broken day-remap**
  (`sourceDayByDate` mapped 20→11, 21→**14**, …) that collided remapped events with
  the month-density events, double-stacking days.
- New shared **`bsClientWeekDemo.js`** (`BS_CLIENT_WEEK_DEMO`, Mon..Sun, color-agnostic
  by `kind`) is the single source of truth:
  - **Home** builds `DAY_LOGS` (keyed 20..26) + `WEEK_DOTS_BY_IDX` from it.
  - **Calendar** `clientEvents` builds from it — the authored week sits cleanly on
    **May 11–17 (Mon–Sun)**; workouts repeat on adjacent weeks for month density.
    The `sourceDayByDate` remap now applies **only to trainer/nutritionist** (still
    authored on 20–26); client skips it. Demo meals show their literal times (no
    `slot` flattening) so they match the strip exactly.
- **Header**: the client calendar masthead **"The calendar." → "Month's plan."**
  (trainer "The schedule." / nutritionist "The diary." unchanged).

### 2026-06-04 — Recipe box ⇒ merged into Shape Kitchen (one page)
- The Recipe box and the old `BSShapeKitchen` page showed the **same recipes**; the
  only thing Kitchen had extra was its **advanced filters**. Merged them into one:
  - `BSRecipeBox` is **rebranded "Shape Kitchen."** (eyebrow + serif hero) and now
    carries the advanced **Diet / Protein / Free-from / Goals** filters as a
    collapsible "Filters" disclosure (badge = active count, "Clear", live recipe
    count), folded in alongside the existing quick meal-type pills + search.
  - **Removed** the redundant "Browse Shape Kitchen →" link, the `showKitchen` route,
    and the now-dead `BSShapeKitchen` component (~90 lines). `BSShapeKitchenRecipe`
    (the detail page) is unchanged.
  - **Recipe-card actions shrunk** (Send to grocery / Save): padding 11→7px, font 9→8.
- One place for recipes now; nothing lost.

### 2026-06-04 — Unify recipe ⇄ meal detail "anatomy"
- The Shape Kitchen recipe detail (`BSShapeKitchenRecipe`) and the meal-plan meal
  detail (`BSMealPreview`) had drifted. Brought the recipe page up to the meal page's
  shared anatomy so both read the same: **4-up macro stats incl. KCAL** (was 3-up
  P/C/F with kcal only in the hero pill), a **macro-split bar** (% of kcal, computed
  from `r.macros`), and a **"The dish"** eyebrow over the coach blurb (matching the
  meal page's description treatment).
- **Context tails kept distinct** (by design): a *meal* keeps its schedule eyebrow +
  "Ate as planned" log CTA; a *recipe* keeps serves + Pro tip + Reviews + Add-to-grocery.

### 2026-06-04 — Recipe box (new Recipes tab) + Saved/liked recipes
- New **`BSRecipeBox`** is the Recipes sub-tab: serif "Recipe box." hero, underline
  search, **All / Saved / Breakfast / Lunch / Dinner / Snack / Plant-based** filter
  pills, and recipe cards (hero-gradient thumb, category·coach eyebrow, title, one-line
  macros). Each card has **Send to grocery list →** (one teal action → builds that
  recipe's OWN list and opens it) + **♥ Save** toggle (kind `recipe`, so liked recipes
  show under the **Saved** filter and in the main Library). No "send all" bulk action.
- **Shape Kitchen kept** — the full catalog is reachable via the "Browse Shape Kitchen →"
  card (`showKitchen` state); recipe detail (`BSShapeKitchenRecipe`) shared by both.

### 2026-06-04 — Feed bubble look applied to DM / channel threads
- `BSChatThread` (Friends DMs, Team coach DMs, Channels) now matches the feed bubbles:
  an avatar next to each incoming message (tier color for people, teal for channels), a
  tinted/bordered bubble with a chat-tail corner, name eyebrow, and the same reaction
  affordances. Your own messages stay right-aligned in teal.

### 2026-06-04 — Saved-carts redesign + removed coach note / How-it-works
- **Saved carts** (`BSGroceryLibrary`): filter tabs are rounded pills; each list is a
  rounded `PAPER2` card (eyebrow, title + chevron, preview, rounded Load/Edit/Delete
  pills); the open preview is a nested rounded card.
- Removed the amber **coach-note quote box** from the grocery list page.
- Removed the **"How it works"** box from the Shape Score page.

### 2026-06-04 — Rounded-card redesign: Recipe / Shape Score / Shape Store
- **Recipe detail** (`BSShapeKitchenRecipe`): macro grid, Ingredients, and Method are
  now rounded `PAPER2` cards (1px RULE, hairline dividers) — dropped the 2px-INK ledger
  tops, matching the meal preview.
- **Shape Score**: Reward tiers, Rewards, Point values, and Recent-points ledger wrapped
  in rounded cards; "How it works" is now a rounded card too (less full-bleed).
- **Shape Store**: Catalog + Unlocked-codes lists wrapped in rounded cards; removed the
  hard rule under the category filters.
- **Grocery food-group tabs** shrunk (smaller pill font/padding) with edge padding so
  they fit/scroll cleanly without the last tab clipping.

### 2026-06-04 — Live tier + real messaging from chat profiles
- **Migration `2026-06-04-public-profile-card.sql`**: `get_public_profile(user_id)`
  (name, role, all-time points → tier, + public bio/pronouns/goal/link gated on
  Public visibility) and `get_user_points(uuid[])` batch (feed tier coloring).
  SECURITY DEFINER (score_ledger is self-only). **Run on Supabase.**
- Feed posts now carry **`author_id`** (`mapPost` → `userId`). `BSClientFeed`
  batch-fetches authors' points → **real tier** tints avatars/bubbles
  (`bsTierForPoints`); falls back to the derived tier.
- **`BSPublicProfile`** fetches the live card (real tier + public bio) when a userId
  is present.
- **Message** from a profile now routes through `getOrCreateMemberConversation` when
  the author has a userId — a real, persisted conversation (front-end thread otherwise).
- Radio prompt: the EQ icon now sits in a sized, clipped box so it fits the green tile.

### 2026-06-04 — Chat role tag follows the author's real role
- `mapPost` now carries `authorKind` (the author's real role from `community_posts.
  author_role`) separately from `kind` (the channel/section, used for filtering).
- `renderPost` uses `authorKind` for the **role tag, tag color, and L/R alignment**, so a
  trainer/nutritionist posting in the general feed reads "Trainer"/"Nutritionist" — not
  the section label. Own posts tag with the signed-in role. Profile opens with the real
  role too.

### 2026-06-04 — Tier-colored chat + tappable avatars → public profile
- **Feed bubbles**: avatar fill **and** bubble tint now follow the author's **tier**
  (`bsPostTier` → `bsTierColor`; explicit `tier` wins, else stable per-name). Role tag
  keeps its role color.
- **Alignment**: in the mixed **Community** feed coaches sit left / members + you sit
  right (conversation feel, matches the mock); single-role sections keep "only your own
  on the right".
- **Tappable avatars** (and names) open a new **`BSPublicProfile`** page — works for
  **clients and coaches** — tier-ringed avatar, tier·role, bio, **Message →**, plus a
  **Coaching →** link for coaches. Gated on `p.public !== false` (privacy-aware).

### 2026-06-04 — Per-client program phase (coach-writable) + presence confirm
- **Presence at launch** confirmed live (`getCurrentSession` → `startPresence`), so
  "● N online" is app-wide.
- **Program phase is now a real per-client store**: migration
  `2026-06-04-client-program-phase.sql` adds `client_programs` (user_id PK,
  training_phase, nutrition_phase) with RLS — **client owns their row; a coach with an
  active sub can read AND set it** (via `is_coach_on_client`). **Run on Supabase.**
- `shapeBackend.js`: `ShapeProgramApi.get(userId?)` / `.set({ userId, trainingPhase,
  nutritionPhase })`.
- Client `useBSProgram` hydrates from the real store (client_settings fallback); the
  Settings phase dropdowns now also write to it.
- **Coach app**: the client **full-profile** page shows a `{nutrition} · {training}`
  phase eyebrow and **Training block / Nutrition phase chips the coach can set** —
  persists to the client's row when the roster entry has a real user id (demo roster is
  local-only, labeled as such).

### 2026-06-04 — Calendar Start session + real Reschedule; profile persistence
- **Start session** (calendar workout sheet, client): fires a `shape:startWorkout`
  window event → the app shell closes the calendar, jumps to **Train**, and
  auto-launches the live session (`BSClientTrain` `autoStart` prop → `BSSession`).
- **Reschedule** is now real: a native date picker → `ShapeCalendar.update({ id, date })`
  for live editable events (PATCH /api/calendar); demo events fall back to a toast.
  Delete kept for live editable events.
- **Edit-profile persists**: identity (name/handle/location/bio/accent/pronouns/link/goal)
  saved to `user_goals('client_identity')` + loaded on open, so it survives sessions/
  devices. Display name also mirrors to `profiles.full_name` via new
  `ShapeAuth.updateProfileName` (keeps chat/search/leaderboard names in sync).

### 2026-06-04 — Edit-profile redesign + more customizations
- Settings **edit profile** form modernized (less analog): rounded-14 fields with
  accent-colored focus, lighter labels, pill Change-photo + Cancel, teal Save.
- New customizations: **avatar accent color** swatches (reflected on the profile
  avatar), **Pronouns** chips, **Website / link**, **Primary goal** chips, and a Bio
  character counter. Non-edit view shows handle · goal + pronouns and the chosen accent.

### 2026-06-04 — Calendar event sheet fixes + app-wide presence + dynamic phase
- **Calendar event sheet** (tap a workout/consult from month/week view): now **fills
  the full screen** (top 36→0, no rounded gap), has a proper **← Back** button in the
  top bar (replaced the floating "Close ✕"), **coach-note removed** from the workout
  body, footer CTAs **lifted off the nav zone** (bottom padding), and **Join consult**
  now opens the real `meetingUrl` (toast when none yet). *Start session / Reschedule
  remain stubs — no live-session launch or reschedule backend from the calendar.*
- **Presence app-wide**: `startPresence()` now fires on session resolve
  (`getCurrentSession`), so the "● N online" count reflects everyone with the app open,
  not just feed viewers.
- **Dynamic program phase**: `window.ShapeProgram` cache + `useBSProgram()` hook;
  Home/Eat/Train eyebrows read `trainingPhase` / `nutritionPhase` (persisted in
  `client_settings`, editable in Settings → Preferences). Replaces the hardcoded
  Cut/Build. (Coach-app phase display TBD — depends on per-client selection.)

### 2026-06-04 — Contextual page eyebrows + live "online" count
- **Feed header** left-aligned ("The feed.") to match other pages.
- **Live presence**: `window.ShapePresence` (Supabase Realtime presence on an
  `online-users` channel keyed by user id) exposes a genuine live online count;
  `useBSOnline()` hook. The feed masthead right kicker now shows **"● N online"**
  (falls back to "Live" when 0 / signed out). No migration — presence is ephemeral.
- **Contextual week eyebrows**: `bsProgramWeek()` (weeks since program start) drives
  the **Eat** header (`Cut · Week N`, nutrition) and **Train** header (`Build · Week N`,
  training); home already showed `Cut · W{week}`.

### 2026-06-04 — Realtime DM thread refresh + smaller habit cards
- **Realtime member/coach DM lists**: `BSClientFeed` now subscribes to
  `ShapeMessages.subscribeMessages` and (debounced) reloads both member + coach thread
  lists on incoming messages, so new threads + latest-message previews appear live.
  Unread badges were already live app-wide (the `dm_unread` / `mark_conversation_read`
  RPCs + the generic `messages` realtime increment are participant-keyed, so they
  already covered member DMs).
- **Habit cards** (`BSHabitRow`) shrunk: padding 14→10/12, checkbox 30→25, title 17→15,
  meta/points/× tightened.

### 2026-06-03 — Member-to-member DM backend (Friends + New message)
- **Migration `2026-06-03-member-direct-conversations.sql`** (idempotent): adds a
  `dm_key` dedupe column to `conversations` + two SECURITY DEFINER RPCs —
  `get_or_create_member_conversation(other_user_id)` (creates/finds the 1:1, adds both
  as participants) and `list_member_dm_threads()` (returns my member DMs with the
  **counterpart's** name resolved from `profiles`). Reuses the existing
  conversations/messages RLS (participants read + send). **Must be run on Supabase.**
- `shapeBackend.js`: `ShapeMessages.getOrCreateMemberConversation` + `listMemberThreads`;
  `listDirectCoachThreads` now excludes member DMs (`dm_key is null`) so Coaches vs
  Friends stay separate.
- `BSClientFeed`: the **Friends** tab now lists real member DM threads; the **+ New**
  picker creates a real conversation on select, so messages persist + deliver (realtime).
  Applies to all profiles. (Coach DMs, channels, community feed, support already had
  backends — member DMs were the only gap.)
- **Filter pills**: Community/Client/Shape + Coaches/Channels/Support are now
  content-sized (flex, not full-width grid) — less dead space inside each pill.

### 2026-06-03 — Chat feed bubbles + New-message picker + header polish
- **Feed posts** (`renderPost`, role channels Client/Trainer/Nutritionist/Shape +
  live community) are now **chat bubbles**: coaches (trainer/nutri) align left, members
  + your own posts (client/shape/You) align right; role-tinted bubble with a chat-tail
  corner, role tag, time, and reactions (♥ / ↳). Support thread + Strava ActivityCards
  untouched.
- **"+ New"** on the thread lists now opens a **New-message people picker** (searches
  members via `ShapeChannels.searchMembers`, opens a thread on select). Lives in the
  shared `BSClientFeed`, so it applies to **all profiles** (client/trainer/nutritionist).
  Note: member-to-member DMs have no backend yet (coach DMs do) — the opened thread is
  currently front-end only.
- **Feed header**: removed the bottom border line (new `noRule` prop on `BSMasthead`);
  "The feed." title now uses `t.DISPLAY` at the standard header weight.

### 2026-06-03 — Chat thread list redesign (Friends + Coaches)
- The `BSClientFeed` DM list `Row` (shared by the **Friends** and **Coaches** tabs)
  is no longer a bordered card — it's a clean **divider-separated row**: circular
  avatar with a green **online dot**, bold name, role eyebrow (e.g. "Your coach"),
  last-message **preview**, **time** top-right, and a **teal unread badge**.
- Added a list header per section: **"X unread · Y threads"** + a **+ New** action.
- Coach thread role labels now read "Your coach" / "Your nutritionist".

### 2026-06-03 — Shape Score header + tier-synced hero color
- Shape Score page header changed to **Your standing / Shape _Score._** (current serif
  font). The italic **"Score." now takes the current tier's color** (`bsTierColor`), and
  the composite **hero box border** is tier-colored too — so the title, ring, gradient,
  and border all sync with the member's tier.

### 2026-06-03 — Schedule in sync app-wide (calendar + home follow meal-time pref)
- **Calendar** (`iosAppBroadsheetCalendar.jsx`, shared client + coach): all event
  times now render **12-hour** via `bsCalTimeLabel()`, matching the day-log. **MEAL
  events carry a `slot`** (BFAST/LUNCH/SNACK/DINNER) and read `window.ShapeMealTimes`,
  so changing a meal time in Settings moves the calendar meal too — no title-parsing.
- **Home "next up"**: the lunch card time + ordering (`MEAL_AT`) and the `HOME_LUNCH`
  preview now derive from the lunch preference, so home, day-log, calendar, and the
  meal-preview eyebrow all show the same scheduled time.

### 2026-06-03 — Meal-time schedule surfaced in day-log; auth polish; compact score hero
- **Day-log rows now show the scheduled meal time** (eat page list + day brief + swap
  sheet) via shared `bsMealSchedLabel()` — meal's own time, else the client's meal-time
  preference for that slot, rendered 12-hour. Consistent with the preview eyebrow.
  (Calendar keeps its own per-event times.)
- **Auth screen**: "No account? Browse the app →" is now plain teal text (bubble
  removed). SHAPE logo brightened + teal glow + slightly larger (more visible).
- **Shape Score hero** made more compact (ring 112→86, padding/fonts trimmed).

### 2026-06-03 — Library heading/search polish + client meal-time preference
- **Library**: new heading — teal "Your library" eyebrow, serif **Saved / _everything._**
  title, italic subtitle ("Every workout, meal, recipe and grocery list you keep — in
  one place."). Search bar is now an **underline** (no pill/bubble).
- **Client meal-time schedule preference**: Settings → Preferences now has Breakfast /
  Lunch / Snack / Dinner time dropdowns (30-min steps), persisted in `client_settings`.
  A `window.ShapeMealTimes` cache (loaded at settings open, seeded from defaults) feeds
  the meal-preview eyebrow's slot fallback, so a meal without an explicit plan time
  shows the client's own eating time. Defaults 8:00 / 12:30 / 4:00 / 7:00.

### 2026-06-03 — Shape Score composite hero + compact meal CTA
- **Shape Score page**: new **composite hero card** above the reward tiers — a
  tier-colored ring (% to goal), the tier name as an italic headline, `{total} pts ·
  {week} this week`, a "composite of training, nutrition, recovery & consistency"
  blurb, and a 3-up mini-stat row (This week / Streak / To next tier). Removed the
  header's trailing score number and the old THIS-WK/THIS-MO/TIER stats grid (now
  covered by the hero).
- **Meal preview CTA row** reformatted + shrunk: Close / ♡ Save / teal "One tap ·
  Ate as planned ✓" are now compact single-line pills (Save is an inline toggle so
  all three match height).

### 2026-06-03 — Meal ingredients in household units (tied to Imperial/Metric)
- Added `bsHouseholdQty(qty, name)` / `bsHouseholdStr(str)` in the client module: a
  display-only converter that turns gram/ml ingredient quantities into **cups / tbsp /
  oz / slices**, keyed by ingredient name (`_BS_HOUSEHOLD` map) with safe fallbacks
  (oz for unknown solids, cups/tbsp for liquids). Stored data stays metric.
- Gated on the existing **Imperial/Metric** setting (`t.isMetric` from `ShapeUnits`):
  metric users still see grams; imperial users see household measures. Applied to
  `BSMealPreview`, `BSRecipePreview` (two-column rows, qty column widened 56→78), and
  the Shape Kitchen recipe detail (string ingredients).
- Auth screen: "No account? Browse the app →" pill font weight 700 → 400 (thinner).

### 2026-06-03 — Habits page rebuilt: To-dos / To-don'ts + add sheet
- **Completely removed** the old full-page add/edit form (`BSHabitForm`) and the dead
  habit UI layer (`BSHabitTracker`, `BSHabitInsights`, `BSTimeChip`, all the legacy row
  variants + grid card).
- `BSHabitsPage` is now: a compact **"Earned today"** score card (big `+N pts`, "of N
  possible · to your Shape Score", progress bar, % ring, tap → Shape Score) +
  two card-list sections — **To-dos** (teal) and **To-don'ts** (rust) — each with a
  count eyebrow (`x/y done` · `x/y clean`), a `+ Add →` link, and rounded habit cards
  (check, title, status line, points, ×). Done cards tint to the section accent.
- **Add flow** is a bottom sheet (portaled into `#bs-phone-surface`), do/avoid variant:
  eyebrow + serif "Something to *do.* / *avoid.*", text field, suggestion chips, a
  **points stepper** (− +N +), and Cancel / Add habit (accent CTA).
- Page header changed to **Daily habits** ("habits" in teal). Habits now carry an
  optional `pts` field (threaded through encode/decode + `create`); display falls back
  to a stable derived value.

### 2026-06-03 — Grocery list: food-group tabs + single Reset
- `BSGrocery` aisles are no longer a long scroll. A horizontal **food-group tab row**
  (one pill per aisle, e.g. PRODUCE/DAIRY/…) sits at the top; tapping a tab shows just
  that group's items (completed groups show struck-through). A single **Reset ↺** pill
  is pinned top-right on the same line and clears the active group's checks (disabled
  when nothing's checked). Removed the old per-aisle headers + per-aisle reset buttons.

### 2026-06-03 — Habits add/edit form redesign + recipe/grocery library saves
- `BSHabitForm` (the "super analog" Add Habit page) rebuilt to the rounded-card
  system: name in a rounded `PAPER2` field (was a 2px-INK underline), **Do daily /
  Avoid** as rounded green/rust toggle cards, **Reminder** + **Visibility** each in
  their own rounded card, visibility as a 3-up rounded pill segmented control (teal
  when active), and rounded pill **Cancel / Add habit** actions (teal CTA). `BSTimeChip`
  rounded to a pill with a hairline border.
- **Library boxes now fill:** added `BSSaveButton` (kind `recipe`) to the Shape
  Kitchen recipe detail (beside "Add to grocery"), and a ♡/✓ **Save to library**
  toggle (kind `grocery`) to the `BSGrocery` action row. The **Recipes** and
  **Groceries** stat cards on the Library page now reflect real saves.

### 2026-06-03 — Library page: stat-card filters, search, item previews
- `BSClientLibrary` filter row is now a 4-up **stat-card grid** (big tabular count +
  colored label): **Workouts** (rust), **Meals** (green), **Recipes** (teal),
  **Groceries** (purple `#8a5cf6`). Tapping a card toggles that filter (tap again →
  all). Kind metadata centralized in `BS_LIB_KINDS` (workout/plan/meal/recipe/grocery).
- New **search field** below the cards ("Search your library…") filters saved items by
  title / meta / coach.
- Saved item rows are now **tappable cards** (chevron `›`, no more × remove button) that
  open a new **`BSLibraryDetail`** preview page (kind eyebrow, title, meta/coach, saved
  date, preview blurb) with a **Save / Remove from library** action at the bottom.
### 2026-06-13 — About + Pricing pages (mobile) & compact score card
- New **`BSAboutPage`** and **`BSPricingPage`** in the client module, adapting the
  website's `/newdesign/About` + `/Pricing` into the broadsheet (serif hero, letter,
  numbered pillars; $5/mo card with feature checklist, "coaches price themselves"
  rows, FAQ accordion). Reachable from **Settings → About** (new "About Shape" +
  "Pricing" rows). `bsStartPlatformCheckout()` helper (shared with the upgrade
  button) drives Get-started; "Browse all coaches" fires a `shape:openMarket` event
  that `BSClientAppInner` listens for (closes settings → opens marketplace).
- **Me-page Shape Score card compacted** (~20% tighter): padding 18→14, tier 28→23,
  number 46→37, ring 84→68px, slimmer metric bars (h5→4, gaps tightened).
- The playlist preview popup (`BSPlaylistCard`) now has a **♡ Save to my Spotify**
  button (shown only for genuine `spotify.com/playlist/...` links — not Apple Music)
  that *follows* the coach's playlist into the signed-in member's own Spotify
  library. Native goes through the `window.ShapeIntegrations.saveSpotifyPlaylist`
  bridge (Bearer token); the `/m/` web build falls back to a same-origin cookie
  POST to `/api/integrations/spotify/save-playlist`. Button shows saving / ✓ Saved /
  Try again, and surfaces "Connect Spotify…" when the account isn't linked.
- **Note:** in-app **Connect Spotify** already exists — Settings → Connected apps →
  Spotify → Connect (`BSIntegrationsPage`, wired to `connectSpotify` →
  `/api/integrations/spotify/authorize`). Both halves of the sync loop are now live.
- **Not-linked UX:** when the save fails because Spotify isn't connected (or the
  member isn't signed in), the popup now shows a tappable **"Connect Spotify to
  save → Settings · Connected apps"** CTA instead of the raw error. It closes the
  sheet and fires a `shape:openIntegrations` event that `BSClientAppInner` listens
  for → opens the integrations page (no prop-threading). The redundant error
  **toast is suppressed** for the not-linked case (the inline CTA covers it);
  toasts still fire for other failures (e.g. network).
- **War Room:** Spotify checklist now tracks redirect-URI registration (done) +
  a manual "out of Development mode" item; credentials row auto-reads live env.

### 2026-06-13 — playlist tracklist preview popup
- Tapping a `BSPlaylistCard` (coach/nutritionist Spotify cards on home/train/eat)
  now opens a bottom-sheet **tracklist preview** (portaled into `#bs-phone-surface`)
  so a client can see what's on a list before opening Spotify: Spotify-glyph header
  with the playlist title/meta, a numbered track list (title · artist · length), a
  "Preview · first N of M" label, and a green **Open in Spotify** CTA + Close. The
  card's ▶ button still jumps straight to Spotify (stops propagation).
- Data: added a short `songs` preview array to each `BS_COACH_PLAYLISTS` entry
  (radio module); the train/eat maps pass `tracks: p.songs`, and the home
  "Pull heavy." card carries an inline list. Extracted `bsSpotifyGlyph()` helper.

### 2026-06-13 — iMessage-style auto-growing chat composer
- `BSMessageComposer` (shared by DM threads + the feed) is now an auto-resizing
  `<textarea>` instead of a fixed 38px `<input>`: one line at rest, grows upward
  as you type, caps at ~6 lines (`COMPOSER_MAX_H = 132`) then scrolls internally.
  Re-measured on every `value` change via `useLayoutEffect`, so it also collapses
  back after a send clears the draft. Send button bottom-aligns (`alignItems:'end'`).
  Enter sends; Shift/⌘/Ctrl+Enter inserts a newline. `borderRadius:19` reads as a
  pill at one line and a rounded rect when expanded.

### 2026-06-13 — client Library (Phase 1)
- New **Library** screen (`BSClientLibrary` in the client module): clients save
  trainers' **workouts**, paid **programs/plans**, and nutritionists' **meals/plans**
  to their own profile. Serif "Your library." hero, All/Workouts/Programs/Meals
  filter pills, kind-colored rows (workout = rust, plan = amber, meal = teal) with
  remove (×), and an empty state that deep-links to the marketplace.
- Data model: `bsLibRead/bsLibWrite/bsLibToggle` over `localStorage` key `shape.library`
  + `shapeDb.saveUserGoals('client_library')` (cloud), broadcast on a `bs-library`
  event; `useBSLibrary()` hook merges the cloud copy by id-union once on mount.
- `BSSaveButton({item, full})` — reusable ♡ Save / ✓ Saved toggle (teal when saved).
  Wired into the **workout preview** footer and the **meal preview** CTA row so far.
- Me page: added a **Library** shortcut + `showLibrary` route in `BSClientMe`.
- **Follow-ups:** Save actions on coach/marketplace content (programs, coach meals);
  the trainer "sell a plan" paid-checkout path; a dedicated Supabase `client_library`
  table (today it piggybacks on `user_goals`).

### 2026-06-13 — Garmin push-webhook ingestion (ready for approval)
- Built `src/app/api/integrations/garmin/webhook/route.ts` — Garmin Health API is
  PUSH-based, so this receives Dailies/Sleeps/Activities POSTs, maps each item's
  Garmin `userId` → Shape user via `user_integrations.provider_user_id`, and upserts
  into `daily_health_snapshot` (resting HR, stress, calories, sleep hours, workout
  min/HR) + `activities` (same tables as Whoop/Oura/Strava). Optional
  `GARMIN_WEBHOOK_SECRET` (`?token=`) guard; GET returns 200 for URL validation.
- OAuth callback now fetches Garmin's `userId` (`/wellness-api/rest/user/id`) at
  connect time and stores it on `provider_user_id` (token response omits it).
- No migration — reuses existing tables. Registered the route in the War Room.
- **Blocked on Garmin:** their access-request form is down; apply via Developer
  Contact Us. Once approved: set `GARMIN_CLIENT_ID/SECRET`, then register the
  webhook URL + summary types (Dailies/Sleeps/Activities) in the Garmin portal.

### 2026-06-03 — tier color system + score-card focus
- Added `bsTierColor()` in the client module (Raw/Base = steel, Tempo = gold,
  Form = teal, Peak = violet, Legend = rose), exposed on `window` for the Pros app.
- Shape Score card (client `BSClientMe` + coach `BSProMe`): the **tier is now a big
  tier-colored line** on the card (no pill, no header chip) with a tier-colored ring;
  the coach card's TIER bar uses the tier color too.
- Full Shape Score page: the reward-tier list is color-coded (color dot + tier-colored
  name; the user's current tier is marked "· you").
- **Follow-up (next):** apply `bsTierColor` to the remaining tier displays — community
  feed tier tags and the marketplace coach tier label — for full app-wide coordination.

### 2026-06-03 — coach profile page redesign
- Rebuilt `BSCoachDetailPublic` to match the app: role-gradient hero card with a
  circular avatar, tier chip, headline, stat pills + a 3-up mini-stats row; rounded
  pill tabs (was hard-INK with an offset shadow); rounded teal action + bottom CTAs;
  rounded specialty pills. Removed the halftone "client view" wireframe banner. All
  handlers (book / message / checkout / reviews / availability) + the action panel kept.

### 2026-06-03 — circular avatars + upgrade button wiring
- `BSAvatar` is now **circular by default** (`round` default true) — all people
  avatars (client + coach headers, chat, feed, settings) are circles. Added an
  opt-in `glow` prop; the Settings identity avatar uses `round glow`.
- `BSHeadshot` (public coach profile pages) made circular too.
- **Upgrade button fix:** a free user's "Upgrade →" now starts a Stripe Checkout
  (`/api/stripe/platform-checkout`) instead of the billing portal (which only
  manages an existing sub). "Manage →" still opens the portal when subscribed.
  Free-plan subtitle reworded to "Become a Shape member to access the platform & features".

### 2026-06-03 — mobile marketplace redesign (first pass)
- Rebuilt `BSMarketplaceScreen` as an editorial discovery page matching the rest
  of the app (replaced the old hard-bordered "wireframe" look). New layout:
  - Serif hero **"Find your _coach._"** (teal italic accent).
  - Rounded pill search bar.
  - Filter tabs — **All · Trainers · Nutritionists** only (no specialty pills),
    wrap (no horizontal scroll). All = discovery view; a role/search = results list.
  - **Coach of the Week** card: italic pull-quote, circular avatar, arrow, and an
    embedded **Tracklist** of that coach's real packages (`buildPublicProfile`).
  - **Featured · This week** — 2-up grid of gradient coach cards (no scroller).
  - **Programs · Start a thing** — numbered tracklist from coach packages.
  - New helpers: `MktAvatar/MktPill/MktSectionHead/MktTrackRow/MktCoachCard/MktRow`.
  - Kept working: live Supabase providers, search, role filter, tap→`BSCoachDetailPublic`,
    coach-apply flow. `BSHeadshot` + the detail pages are untouched.
  - Follow-ups: `BSM_MARKETPLACE_CATEGORIES/CERTIFICATIONS/FORMATS/LOCATIONS` and
    `ListingRow` are now unused (dead) — sweep later; pricing shows `$rate/mo` (label
    only — confirm semantics); detail pages still use the older style.

### 2026-06-03 — dead-code audit (behavior-preserving)
- Removed 8 orphaned, never-referenced top-level components/helpers from
  `iosAppBroadsheetClient.jsx` (~639 lines): `BSHealthIntegrationsCard`,
  `BSConnectedDataSummary`, `BSAddWidgets`, `BSRecipeArchivePage`, `BSRxPlanWidget`,
  `readStoredCoachThreadsForChat`, `mergeChatThreads`, `BSCommunityLiveFeed`.
- Removed the dead `addPlanToGrocery` (never called) and an unused `[logged]`
  state in `BSMealPreview`.
- Consolidated the duplicated audio/photo upload blocks in
  `/api/nutrition/meal-note` into one `uploadAttachment()` helper.
- All verified zero-reference repo-wide; bundle size unchanged (already
  tree-shaken), so the shipped app is equivalent.

### 2026-06-03
- **#898** Meal logger Photo tab made real (capture/upload → inline preview →
  delivered to coach, rendered inline in their chat); `meal-notes` bucket widened to
  allow images (15 MB); Shape Score tier badge boldened (text-stroke + solid gold).
- **#897** Meal-preview "Log Now" centered to match the Close button's mono type.
- **#896** Shape Radio bar full-bleed (full screen width); tier badge solid gold;
  marketplace CTA outlines bolder.
- **#895** Grocery shop list auto-builds from the week's meal ingredients (deduped,
  aisle-grouped) so it matches the meals; "Find a coach" CTAs elevated (tint + icon).
- **#894** Swap meal: pick which meal first, then the coach-approved alternate.
- **#893** Meal note delivers to **all** linked coaches (trainer + nutritionist);
  coach chat renders the voice-memo audio player; "Log Now" on a meal preview opens
  the full logger.
- Also this session: meal-search recents now add to the meal + filter as you type;
  War Room updated to reflect the above (routes, config, checklist).

### Next up (planned)
- **Design-system pass — Phase 1 SHIPPED 2026-06-11** (`BSPlate` shared
  primitive in the chrome, window-exposed; AgendaCard + weekly-totals tiles
  refactored onto it; converted: Train hero, coach-adjust banner, home
  coach-feed pushed items, find-a-coach bars, Score composite hero). Kept
  quiet BY THE RULE: Eat hero (deliberately condensed strip), Eat/Train list
  rows, Store catalog rows. **Phase 2 SHIPPED same day** — coach apps (both
  roles, role-accented): client-profile StatCards + big attendance/adherence
  metric card (plate w/ tick) + Manage assign card; Plans-tab TOP feature
  cards + AI-generate CTAs squared with role spines. Coach Today lead stays
  typographic (masthead style); rosters/forms/action pages quiet by the rule.
  Two-tier rule: plates = live/actionable; quiet rounded cards =
  forms/sheets/lists; chat bubbles stay round.
- **Client "Library" — save coach content to your profile** (NEW · priority):
  let clients save to their own profile/library: trainers' **workouts** and **paid
  plans/programs** (purchasable — needs the sell/checkout flow), and nutritionists'
  **meals & meal plans**. Needs: a saved-library data model + a client Library screen,
  "Save" actions on coach/marketplace content, and the trainer "sell a plan" purchase path.
- **Marketplace follow-ups**: remove now-dead marketplace constants + `ListingRow`
  (unused after the rebuild); confirm pricing semantics (cards show `$rate/mo`).
  (Coach detail pages are now redesigned — see changelog.)

### Known stubs / next
- Native mic + camera plugins for the iOS App Store build (WebView fallback today;
  iOS barcode SCANNING also rides this — WebKit has no BarcodeDetector, so iOS uses
  the manual barcode entry until a native scanner plugin lands).
- On-device "Shape reads macros" from a meal photo (currently photo → coach review only).
