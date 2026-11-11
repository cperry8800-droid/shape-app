# Shape — working notes

The rules and the code map. Every session loads it: when a rule changes, replace its line.
**No changelog**: the PR description is the record.
`tests/worklog-rules.test.mjs` fails on a dated entry or past 16 KB.

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
  answer, what was verified, what is left open, which goes to the War Room (its Waiting on the
  owner section if it needs the owner). ⚠ **The War Room entry goes in the PR's first push,
  with the code**; a review fix edits it with the fix. No War-Room-only commit
  (owner, 2026-11-10).
- **Review.**
  - Read your own diff, and a helper's whole diff, adversarially before pushing (owner,
    2026-11-06): unread vs empty, partial loads, sample data, old keys, zones, nested buttons.
  - Codex reviews a PR when it opens and on `@codex review`: post one after every fix (owner,
    2026-11-06). Fix or answer each finding; at its limit, retry once. Its `commit_id` is the
    head it read.
  - Copilot is not a step (owner, 2026-11-10).
  - CodeRabbit only when the owner asks on that PR: brief in the PR description, wait for
    its notice, post just `@coderabbitai full review`, one round, never re-trigger (billed
    per file).
  - A head no reviewer covered merges only on the owner's word. Docs-only diffs merge on
    green CI without a review round.
  - ⚠ **Codex never reviews a War Room PR** (owner, 2026-10-16), and it can't skip a PR by
    its files: the War Room entry rides in the PR it records. Never open a War-Room-only PR.
- **Let CI run the suite** (owner, 2026-11-11). Once, before the PR opens: the changed files'
  tests and, for money, data or a migration, `node scripts/mutate.mjs --spec
  tests/mutations/<subject>.mutations.mjs --fail-on-skipped` (a survivor is a missing guard, or a
  proven no-op: `expectSurvive`). A fix, rebase or red job reruns only its tests. Never the
  suite, `tsc` or a build for what CI checks, nor while it runs; commit with `SKIP_VERIFY=1`
  (the hook runs the suite).
- ⚠ **One run at a time:** `pgrep -af 'mutate.mjs|node --test'` first. A mutation round breaks
  files in place: until it ends, nothing else in that checkout runs, edits or commits (a helper
  takes a worktree); then `git status` clean (`kill -9` can't restore), never `--allow-dirty`.
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
  `living*.jsx`, `chatWidget.jsx`. Never bump a script's `?v=` (`scripts/build-newdesign.mjs`
  hashes it at deploy), but an image replaced under its own name takes a new `?v=` by hand;
  check a legacy `*.jsx` is still loaded before editing it. `coachForecast.js` holds the coach
  Business figures for the app too, and `splitGlassMark.js` the 3D mark. A coach's public page
  is `coachProfileWeb.jsx` (kit `coachProfileKit.mjs`): the app profile for the web, selling
  through `livingShared.jsx`'s `useLvCoachCommerce`. Its colours and its Coaches card's
  (`marketplace.jsx`) are the coach's look through the kit's `bsCoachPagePalette` (null: the Climb).
- **Next.js (`src/`):** API routes, `/dashboard`, `/admin`. Read the Next docs first;
  CI typechecks (`npx tsc --noEmit`). A new route goes in the War Room's `RAW_ROUTES`. A
  route the app calls reads the caller with `clientForRequest`/`currentUser`
  (`src/lib/request-auth.ts`): the installed app sends a Bearer token, no cookie
  (`tests/app-routes-bearer.test.mjs`). Fonts: `src/app/fonts`, `next/font/local`, Latin only
  (`next/font/google` fetched at build).
- **Mobile app: `mobile-app/`** (Capacitor/Vite, served at `/m/`).
  - Build from `mobile-app/`: `VITE_BASE=/m/ npm run build`. `public/m` isn't committed;
    `scripts/build-m.sh` builds it at deploy, and CI's Mobile job only checks it builds.
  - Parse-check a JSX file:
    `node -e "require('@babel/parser').parse(require('fs').readFileSync('<file>','utf8'),{sourceType:'module',plugins:['jsx']})"`
  - Native builds get `VITE_API_BASE_URL` (`android-build.yml`, `codemagic.yaml`); `/m/` calls
    its own origin.
  - Raise `mobile-app/package.json`'s version per store release (CI sets build numbers).
    `src/lib/app-version.mjs` holds each store's minimum for `BSUpdateGate.jsx`: raise it
    only in the PR that breaks older builds, once that store has the new version live.
- **`iosAppBroadsheetClient.jsx`** is the member app. A PR that touches a
  self-contained screen moves it into its own module, as `BSIntegrationsPage.jsx` and
  `BSLeaderboard.jsx` do: window globals read at call time, its own `useShapeTr()`, never an
  import back into the client.
- **Other modules:** `iosAppBroadsheetPros.jsx` (coach apps), `iosAppBroadsheet.jsx` (chrome:
  `BSPage`, `BSFooter`, `BSPlate`, `BSSwapSheet`), `iosAppBroadsheetRadio.jsx`,
  `services/shapeBackend.js` (Supabase data layer). Coach profiles: `BSTrainerProfile.jsx`
  (editor `BSMakeItYours.jsx`; Studio `BSCoachStudio.jsx` on `coachWork.mjs`; a nutritionist's
  kitchen is `studio` kind `kitchen`; samples in `trainerDemo` and the like). `coachWork`,
  `studioKit`, `planPreview`, `planOutline`, `coachPronoun` and the demos live in
  `public/newdesign/`; `mobile-app/src/services/` only re-exports.
  Night-before prep: `services/prepAhead.mjs` (Eat and the cron), `services/mealDays.mjs`
  (account-bound, compare-and-set), `BSPlanDay.jsx`. Check-ins: one on Home, the Morning check-in
  (`BSCheckinCard.jsx`); the coach's Weekly check-in is a line on Team (`BSHomeTeam.jsx`), its page
  `BSWeeklyCheckin.jsx`. A profile photo is placed before it is saved (`BSAvatarPositioner.jsx`,
  `services/avatarCrop.mjs`): the 256px square in `client_identity.photo`, the photo as picked in
  `client_photo_source` for Reposition.
- ⚠ **Window globals** (`Object.assign(window, …)`): read one before its module defines it
  and React throws #130. `iosAppBroadsheetMain.jsx` loads feature modules before role
  modules, `loadProsBundle` the client bundle first.
- **Sheets** portal into `#bs-phone-surface`, a dialog with `bsDialogRef`. No visible scrollbars.
  ⚠ Toasts are a no-op (`BSToastHost`): a failure or a wait is said on the page itself.
- **Pages** render in `BSPage`: a condensed masthead pins once its own scrolls away,
  reading ← and the title past a `BSDetailHeader`'s. A sticky row takes `top: useBSPinnedMastTop()`.
  ⚠ **One place for Back:** a ← ahead of the logo, in the row's `BSMastBackSlot`, which `BSBackRow`
  fills (`BSDetailHeader`, `BSMasthead`/`BSPageHeader` `onBack`); never hand-drawn
  (`tests/back-placement.test.mjs`). A swipe right does what that ← does (`BS_SWIPE`), and a Back
  returns the page at the scroll it left (`services/scrollMemory.mjs`).
- **Theme:** `useBS()` → `t`. Teal `t.isLight ? '#0a8f87' : '#34d6c5'`, nutritionists gold
  `#a07a2e`, trainers rust `#c0533b`; the Wall, chat and chrome take `bsMagazine.mjs`'s
  teal. Saira; Geist/Inter Tight (`useBSProClean`) on coach Today/Clients/Programs and the client
  review pages, and member Home/Train/Eat; catalog labels written in capitals stay capitals.
- **App copy** goes through `useShapeTr()` in all 13 locales
  (`tests/i18n-surface-inventory.test.mjs` counts the untranslated).
- **Backend:** a new notification kind needs a switch in `PREFERENCE_OF`
  (`notificationSurfaces.mjs`) and on both settings screens; quiet hours hold a notice for
  `/api/cron/push-held`; a writer stores `data.copy` for `noticeCopy.mjs`. Reviews' words
  go to signed-in accounts (`/api/coaches/reviews`). Also: `src/lib/calendar-activities.ts`,
  `api/nutrition/meal-note` (private `meal-notes` bucket), `api/nutrition/voice` (Whisper),
  and the War Room board (`/warroom`). Nora's account setup: `src/lib/ai/accountSetup.mjs`.
- **Free account, paid membership:** routes take `requireAccount` (free) or `requireMembership`
  (paid; assistant Nora included, with no free week); past due is free (`paidRefusal`).
- **Own radio station:** `services/station`, the engine's `NORA_MODE=station`, `radio/rotation.mjs`.
- **Time zones:** one per account (`profiles.timezone`, `/api/me/timezone`); print through `shapeZone.mjs`;
  the server runs the engine inside `DashSignals.inZone(zone, now, fn)`, or its days are UTC's.
- ⚠ **A screen holding a copy of a `user_goals` doc** reads it again when something else writes
  it: `services/userGoalsRefresh.mjs`'s hook in its read's deps (`tests/user-goals-refresh.test.mjs`
  holds every broadsheet reader to it); website pages listen for `shape:accountSetup`.

## Open items

Known gaps: the War Room's pending items (`src/lib/warroom.ts`). What waits on the owner is
its first section, **Waiting on the owner**: add to it there, not here.

**Planned next**
- Nora as a Shape Radio DJ, Phase 2 on
  ([`REVIEW-2026-09-29-nora-dj.md`](REVIEW-2026-09-29-nora-dj.md)), once Shape's station is up.

## History

- Changelog to 2026-10-16: [`-2026-10`](WORKLOG-ARCHIVE-2026-10.md),
  [`-2026-09`](WORKLOG-ARCHIVE-2026-09.md), [`-2026-08`](WORKLOG-ARCHIVE-2026-08.md),
  [`-2026-06-07`](WORKLOG-ARCHIVE-2026-06-07.md),
  [`-2026-06-cycles-2-5`](WORKLOG-ARCHIVE-2026-06-cycles-2-5.md).
- The old rules and each ruling's why:
  [`-conventions-2026-10-16`](WORKLOG-ARCHIVE-conventions-2026-10-16.md).
- Handoffs (`docs/HANDOFF-*.md`) are history.
