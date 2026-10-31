# Shape — working notes

The current rules, the code map and what waits on the owner. Every session loads this file,
so it stays short: when a rule changes, replace its line. **No changelog**: the PR
description records what shipped. `tests/worklog-rules.test.mjs` fails on a dated entry
or past 12 KB.

## How we work

- ⛔️ **Stale base first.** The container can reset to an older commit: run
  `git fetch origin main && git rev-parse HEAD origin/main` (no `--short`: it fails with two
  refs); if they differ, `git reset --hard origin/main` before any edit.
- **Branch and merge.** Work on the session's `claude/*` branch: commit, push, open a PR,
  wait for CI green on the final head, squash-merge, reset the branch to `main`. All four
  `ci.yml` jobs must pass (Web, Tests, Mobile, Secret scan). Never merge on red or a draft.
- ⚠ **A stacked PR gets no CI** (`ci.yml` runs only on PRs into `main`; a base change starts
  no run). Stack only on a base that merges first, and run `workflow_dispatch` once it does.
- **The PR description is the record:** what changed and why, each review finding and its
  answer, what was verified, what is left open. What is left open goes to the War Room
  (`src/lib/warroom.ts`), and below if it waits on the owner. The War Room update is the
  last commit of the last PR in flight, once its CI and review are done (owner, 2026-10-16).
- **Review.**
  - Read your own diff adversarially before every push.
  - Codex reviews when a PR opens, a draft is marked ready, or on `@codex review` (never on
    a later push). Fix or answer every finding; at its usage limit, retry once. Its
    `commit_id` names the head it read: judge a finding against that, not the comment's head.
  - Copilot runs on push (or `mcp__github__request_copilot_review`) and often declines.
  - CodeRabbit only when the owner asks on that PR: brief in the PR description, wait for
    its notice, post just `@coderabbitai full review`, one round, never re-trigger ($0.25 a
    file past the included review each hour).
  - A head no reviewer covered merges only on the owner's word. Docs-only diffs merge on
    green CI without a review round.
  - ⚠ **Codex never reviews a War Room PR** (owner, 2026-10-16), and it can't skip a PR by
    its files: the War Room update rides in the PR it records, pushed after that PR opens.
    Never open a War-Room-only PR.
- **Pre-commit hook** (`.githooks/pre-commit` → `scripts/verify-staged.sh`; enable with
  `git config core.hooksPath .githooks`). For a small commit, run the tests it touches,
  commit with `SKIP_VERIFY=1` and say in the PR what ran; CI runs everything.
- **Mutation rounds** for money, data or a migration, always through
  `node scripts/mutate.mjs --spec tests/mutations/<subject>.mutations.mjs --fail-on-skipped`.
  A survivor is a missing guard (fix the test) or a proven no-op (`expectSurvive`, with proof).
- **Migrations:** idempotent. Reply with only the
  `raw.githubusercontent.com/.../supabase-migrations/<file>.sql` link (the owner runs it),
  then check it live with read-only queries.
- **Staging:** `git push origin <sha>:staging --force` →
  https://shape-app-git-staging-cperry8800-droids-projects.vercel.app. Previews share the
  production database: no destructive migrations there.
- **No colored emoji in new work:** typographic symbols (⚙ ↗ ✓ → × ♡ ＋ #) or theme-tinted
  SVG. Leave existing emoji.
- **Generated media (Higgsfield):** each clip and track in the Sources table of
  `marketing/shape-radio-launch-cut.md` (job id, file, verbatim prompt, settings). The
  container can't download it: use `sandbox_exec`.

## Where the code lives

- **Website: `public/newdesign/`**, one live page per `*.html`; shared `pageShell.jsx`,
  `living*.jsx`, `chatWidget.jsx`. Never bump `?v=` (`scripts/build-newdesign.mjs` hashes it
  at deploy); check a legacy `*.jsx` is still loaded before editing it. `coachForecast.js`
  holds the coach Business figures for the app too, and `splitGlassMark.js` the 3D mark.
- **Next.js (`src/`):** API routes, `/dashboard`, `/admin`. Read the Next docs first;
  typecheck with `npx tsc --noEmit`. A new route goes in the War Room's `RAW_ROUTES`. A
  route the app calls reads the caller with `clientForRequest`/`currentUser`
  (`src/lib/request-auth.ts`): the installed app sends a Bearer token, no cookie
  (`tests/app-routes-bearer.test.mjs`). Fonts: `src/app/fonts`, `next/font/local`, Latin only
  (`next/font/google` fetched at build).
- **Mobile app: `mobile-app/`** (Capacitor/Vite, served at `/m/`).
  - Build from `mobile-app/`: `VITE_BASE=/m/ npm run build`. `public/m` isn't committed;
    `scripts/build-m.sh` builds it at deploy, and CI's Mobile job only checks it builds.
  - Parse-check a JSX file:
    `node -e "require('@babel/parser').parse(require('fs').readFileSync('<file>','utf8'),{sourceType:'module',plugins:['jsx']})"`
  - Native builds get `VITE_API_BASE_URL` from `android-build.yml` and `codemagic.yaml`; the
    hosted `/m/` calls its own origin.
  - Raise `mobile-app/package.json`'s version per store release (CI sets build numbers).
    `src/lib/app-version.mjs` holds each store's minimum for `BSUpdateGate.jsx`: raise it
    only in the PR that breaks older builds, once that store has the new version live.
- **`iosAppBroadsheetClient.jsx`** is the member app (~38k lines). A PR that touches a
  self-contained screen moves it into its own module, as `BSIntegrationsPage.jsx` and
  `BSLeaderboard.jsx` do: window globals read at call time, its own `useShapeTr()`, never an
  import back into the client.
- **Other modules:** `iosAppBroadsheetPros.jsx` (coach apps), `iosAppBroadsheet.jsx` (chrome:
  `BSPage`, `BSFooter`, `BSPlate`, `BSSwapSheet`), `iosAppBroadsheetRadio.jsx`,
  `services/shapeBackend.js` (Supabase data layer). Coach profiles: `BSTrainerProfile.jsx`
  (editor `BSMakeItYours.jsx`; studio and replays in `coachWork.mjs`; a nutritionist's
  kitchen is `studio` kind `kitchen`; samples in `trainerDemo` and the like).
- ⚠ **Window globals** (`Object.assign(window, …)`): read one before its module defines it
  and React throws #130. `iosAppBroadsheetMain.jsx` loads feature modules before role
  modules, and `loadProsBundle` the whole client bundle first.
- **Sheets** portal into `#bs-phone-surface`. No visible scrollbars (`index.html`).
- **Pages** render in `BSPage`: a condensed masthead pins once the page's own scrolls away,
  reading ← and the title past a `BSDetailHeader`'s. A sticky row takes
  `top: useBSPinnedMastTop()`. A swipe right does what the page's ← does: use `BSBackButton`,
  or mark a hand-drawn Back `data-bs-back` (`tests/swipe-back.test.mjs`; `BS_SWIPE`).
- **Theme:** `useBS()` → `t`. Teal `t.isLight ? '#0a8f87' : '#34d6c5'`, nutritionists gold
  `#a07a2e`, trainers rust `#c0533b`; the Wall, chat and chrome take `bsMagazine.mjs`'s
  teal. Saira; Geist/Inter Tight (`useBSProClean`) on coach Today/Clients/Programs and the client
  review pages, and member Home/Train/Eat; catalog labels written in capitals stay capitals.
- **App copy** goes through `useShapeTr()` in all 13 locales
  (`tests/i18n-surface-inventory.test.mjs` counts the untranslated).
- **Backend:** a new notification kind needs a switch in `PREFERENCE_OF`
  (`notificationSurfaces.mjs`) and on both settings screens; quiet hours hold a notice for
  `/api/cron/push-held`; a writer stores `data.copy` for `noticeCopy.mjs`. Reviews' words
  go to members only (`/api/coaches/reviews`). Also: `src/lib/calendar-activities.ts`,
  `api/nutrition/meal-note` (private `meal-notes` bucket), `api/nutrition/voice` (Whisper),
  and the War Room board (`/warroom`).

## Open items

Known gaps live in the War Room (`src/lib/warroom.ts`), as each section's pending items.

**Waiting on the owner**
- The Exchange mail flow rule for the logo under Nora's support replies (#2479's Owner steps).
- Push keys (#2385): `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` in Vercel; Firebase
  `shape-84d22`'s `google-services.json` as secret `GOOGLE_SERVICES_JSON` (DEPLOY.md §10);
  then a native device pass, MusicKit sign-in included.
- Reconnect WHOOP on the account that connected it on 2 May (#2437: no refresh token).
- Decide: a buyer paying an open checkout from another tab (closing it means refunds).
- In-app purchase outside the US (Phase 2): on hold.
- Decide how a suspended coach appeals.
- Counsel reads the privacy policy (2026-10-13 text; §10's tap counts, 2026-10-29, and radio
  listening, 2026-10-30); the health-data page and the data export are incomplete (War Room).
- The direct-charges test purchase on staging (#2403's Owner steps).
- Decide how a seeded listing becomes its coach's (`listing_time_requests`, `/dashboard/claim`).
- Decide the perks "What Master unlocks" and `leaderboards.jsx` promise: nothing grants them.
- Decide whether coaches keep seeing each other's active clients and sessions-kept rate.
- Check `NORA_TTS_VOICE` (coral, nova, shimmer or sage) and `NORA_TTS_INSTRUCTIONS` in Vercel.
- Decide the bring-your-clients rules (the 15% cases, private profiles, the app's checkout).
- Add the `localhost` hostname to the Turnstile widget.
- A native speaker reads the PAR-Q, Nora hint, sample coach and Friends translations
  (Hausa and Pidgin first).

**Planned next**
- Coach payments, direct charges part C: the coach pages' copy and a labelled processing
  estimate (part A #2401, part B #2403).
- Night-before prep, Phase 2: a nutritionist's "prep the night before" tick, a reminder
  time the member chooses, planning tomorrow, a morning swap.
- The website's coach profile in the app profile's design.
- Nora as the account-setup assistant (she answers and fills forms; setting up is to build).
- Nora as a Shape Radio DJ, Phase 2 on
  ([`REVIEW-2026-09-29-nora-dj.md`](REVIEW-2026-09-29-nora-dj.md)), once a station provider signs.

## History

- Changelog entries up to 2026-10-16: [`WORKLOG-ARCHIVE-2026-10.md`](WORKLOG-ARCHIVE-2026-10.md),
  [`-2026-09`](WORKLOG-ARCHIVE-2026-09.md), [`-2026-08`](WORKLOG-ARCHIVE-2026-08.md),
  [`-2026-06-07`](WORKLOG-ARCHIVE-2026-06-07.md),
  [`-2026-06-cycles-2-5`](WORKLOG-ARCHIVE-2026-06-cycles-2-5.md).
- The old version of this file, with every reviewer ruling and why:
  [`-conventions-2026-10-16`](WORKLOG-ARCHIVE-conventions-2026-10-16.md).
- Handoffs (`docs/HANDOFF-*.md`) are history.
- Search them with `grep -n "<term>" docs/WORKLOG-ARCHIVE-*.md`, then read one entry
  with `sed -n` (AGENTS.md: never `cat` one).
