# Shape — working notes

The current rules, the code map and the open items. Every session loads this file,
so it stays short: when a rule changes, replace the old line instead of adding a
correction under it. There is **no changelog**: the PR description records what
shipped, and History lists the archives. `tests/worklog-rules.test.mjs` fails on a
dated entry or past 20 KB.

## How we work

- ⛔️ **Check for a stale base before any edit.** The web container sometimes resets
  to an older commit. Run `git fetch origin main && git rev-parse HEAD origin/main`;
  if the two differ, `git reset --hard origin/main` first. Don't add `--short`:
  with two refs it fails.
- **Branch and merge.** Work on the session's `claude/*` branch. For each change:
  commit, push, open a PR, wait for CI to go green on the final head, squash-merge,
  then reset the branch to `main`. All four `ci.yml` jobs must pass: Web (typecheck +
  build), Tests (unit + mount), Mobile (build + public/m sync) and Secret scan
  (gitleaks). Never merge on red, and never merge a draft.
- ⚠ **A stacked PR gets no CI.** `ci.yml` runs only on PRs into `main`, and changing a
  PR's base doesn't start a run. Stack a PR only when its base will merge first, and
  run CI by hand (`workflow_dispatch`) as soon as the base changes.
- **The PR description is the record.** It covers what changed and why, what review
  found and how each finding was handled, what was verified, and what is left open.
  If the PR leaves something for later, add it to Open items below and to the War
  Room (`src/lib/warroom.ts`). The War Room update goes last: with several tasks in
  flight, it is the last step of all of them, one commit in the last PR once its CI
  and review are done (owner, 2026-10-16).
- **Review.**
  - Read your own diff adversarially before every push.
  - Codex reviews on its own when a PR opens; read what it posts and fix or answer
    every finding. When it is at its usage limit, retry once.
  - Copilot runs on push (or `mcp__github__request_copilot_review`); it often declines.
  - CodeRabbit runs only when the owner asks for it on that PR. When they do, put the
    brief in the PR description, wait for CodeRabbit's own notice, then post just
    `@coderabbitai full review`. Run one round per PR and don't re-trigger it. It
    bills $0.25 per file beyond the included review each hour.
  - A head that no reviewer covered is merged only on the owner's word.
  - A Codex review's `commit_id` names the head it read. Its inline comments all show
    the current head, so judge a finding against the review, not the comment.
  - Docs-only diffs merge on green CI without a review round.
  - ⚠ **Codex never reviews a War Room PR** (owner, 2026-10-16). Codex reviews a PR
    when it opens, when a draft is marked ready, or on `@codex review`. A later push
    doesn't trigger it, and it can't skip a PR by its files. So the War Room update
    rides in the PR it records, pushed after that PR opens. Never open a PR that only
    updates the War Room; if one would be needed, carry it in the next code PR instead.
- **Pre-commit hook** (`.githooks/pre-commit` → `scripts/verify-staged.sh`). It runs
  the checks a staged change can break. For a small commit, run the tests that touch
  the change and commit with `SKIP_VERIFY=1` (~4 min saved), then say in the PR what
  ran. CI still runs everything. On a local machine, enable the hook once with
  `git config core.hooksPath .githooks`.
- **Mutation rounds** are for changes involving money, data or a migration. Always use
  the one runner:
  `node scripts/mutate.mjs --spec tests/mutations/<subject>.mutations.mjs --fail-on-skipped`.
  A survivor means either a missing guard (fix the test) or a proven no-op (mark it
  `expectSurvive` with the proof).
- **Migrations.** Reply with only the
  `raw.githubusercontent.com/.../supabase-migrations/<file>.sql` link; the owner runs
  it on Supabase. Make migrations idempotent, and check them live with read-only
  queries once they've run.
- **Staging.** `git push origin <sha>:staging --force` deploys to
  https://shape-app-git-staging-cperry8800-droids-projects.vercel.app. Previews share
  the production Supabase database, so don't test destructive migrations there.
- **No colored emoji in new work.** Use typographic symbols (⚙ ↗ ✓ → × ♡ ＋ #) or
  theme-tinted SVG instead. Leave existing emoji as they are.
- **Generated media (Higgsfield).** Record every clip and track in the Sources table
  in `marketing/shape-radio-launch-cut.md`, with the job id, file name, verbatim prompt
  and settings. The container can't download that media, so work on it in
  `sandbox_exec`.

## Where the code lives

- **Website: `public/newdesign/`.** Each `*.html` file is a live page, and shared
  components live in `pageShell.jsx`, `living*.jsx` and `chatWidget.jsx`. Don't bump
  `?v=`: `scripts/build-newdesign.mjs` replaces it with a content hash at deploy.
  Before editing a legacy `*.jsx`, check that something still loads it.
  `coachForecast.js` holds the coach Business figures; the app imports it too, so
  change a figure there, not in a page.
- **Next.js app (`src/`):** API routes, the gated `/dashboard` and `/admin`. Typecheck
  with `npx tsc --noEmit` (read the Next docs first). When you add a route,
  register it in the War Room's `RAW_ROUTES`. A route the app calls reads the caller with
  `clientForRequest`/`currentUser` (`src/lib/request-auth.ts`): the installed app sends a
  Bearer token and no cookie. `tests/app-routes-bearer.test.mjs` enforces it. Fonts are
  in `src/app/fonts` (`next/font/local`, Latin only): `next/font/google` fetched at build.
- **Mobile app: `mobile-app/`** (Capacitor/Vite SPA, served at `/m/`).
  - Build: from `mobile-app/`, run `VITE_BASE=/m/ npm run build`.
  - `public/m` isn't committed: `scripts/build-m.sh` builds it at deploy (Vercel's
    `buildCommand`). CI's Mobile job checks only that the bundle builds and its assets
    resolve.
  - Parse-check a JSX file:
    `node -e "require('@babel/parser').parse(require('fs').readFileSync('<file>','utf8'),{sourceType:'module',plugins:['jsx']})"`
  - Native builds get `VITE_API_BASE_URL=https://theshapecommunity.com` from
    `android-build.yml` and `codemagic.yaml`. The hosted `/m/` build calls its own
    origin.
- **`iosAppBroadsheetClient.jsx`** is the member app (~38k lines): Home, Eat, Train,
  the logger, chat and settings. When a PR already touches a self-contained screen,
  move that screen into its own ES module. `BSIntegrationsPage.jsx` and
  `BSLeaderboard.jsx` show the pattern: read window globals at call time inside the
  component, keep its own `useShapeTr()`, and never import back into the client
  module.
- **Other app modules:** `iosAppBroadsheetPros.jsx` (trainer and nutritionist apps),
  `iosAppBroadsheet.jsx` (shared chrome: `BSPage`, `BSFooter`, `BSPlate`,
  `BSSwapSheet`), `iosAppBroadsheetRadio.jsx` (Shape Radio) and
  `services/shapeBackend.js` (the Supabase data layer).
- **Window globals.** Modules expose components with `Object.assign(window, {...})`.
  A role module that reads a global before the feature module defines it causes React
  error #130. `iosAppBroadsheetMain.jsx` loads feature modules before role modules.
  ⚠ `iosAppBroadsheetPros.jsx` reads the client module's globals at load, so
  `loadProsBundle` loads the whole client bundle first.
- **Sheets** use `createPortal` into `#bs-phone-surface`.
- **Pages** render inside `BSPage`, which pins a condensed masthead once the page's own
  scrolls away (none if the page scrolls itself); past a `BSDetailHeader`'s title it reads
  ← and the title. A sticky row in a `BSPage` takes `top: useBSPinnedMastTop()`.
- **Theme:** `useBS()` → `t`. Teal `t.isLight ? '#0a8f87' : '#34d6c5'`; nutritionists gold
  `#a07a2e`, trainers rust `#c0533b`. The Wall, chat and chrome take `bsMagazine.mjs`'s red.
  Headings are Saira; coach Today, Clients and Programs use Geist and Inter Tight.
- **App copy** goes through `useShapeTr()` in all 13 locales.
  `tests/i18n-surface-inventory.test.mjs` counts the strings that aren't translated
  yet.
- **Backend touchpoints:**
  - `src/app/api/nutrition/meal-note/route.ts` sends a meal note, memo or photo to
    linked coaches through the private `meal-notes` bucket.
  - `src/app/api/nutrition/voice/route.ts` does Whisper transcription.
  - The War Room (`/warroom`, `src/lib/warroom.ts`) is the go-live status board.
  - `/api/calendar?activities=1` (member calendar only) adds activities: providers' copies
    within 20 min are one; a logged workout's folds into it; one ticks an open planned
    workout of its day (undated: its week) and `workoutKind`, unless its title names no
    kind or two.

## Open items

The War Room has the full list; this covers what needs the owner and the planned builds.

**Waiting on the owner**
- Push keys (the app side is built, #2385; 0 push devices in production). For iPhone,
  set `APNS_KEY_ID`, `APNS_TEAM_ID` and `APNS_PRIVATE_KEY` in Vercel. For Android, add
  the app to Firebase `shape-84d22` and save its `google-services.json` as the repo
  secret `GOOGLE_SERVICES_JSON`. See DEPLOY.md §10. Then do a native build's
  device pass, with MusicKit sign-in in SFSafariViewController and Chrome Custom Tabs.
- Reconnect WHOOP on the account that connected it on 2 May (#2437): no refresh token.
- Decide what happens when a buyer pays an open checkout from another tab
  (closing it means refunds).
- In-app purchase outside the US (Phase 2) is on hold.
- Decide how a suspended coach appeals.
- Have counsel read the 2026-10-13 privacy policy text. The health-data page lists only the weekly
  check-in, not the Morning check-in, readiness or patterns, and the data export leaves out Nora's
  conversation and the stored readouts.
- Make the direct-charges test purchase (#2403's Owner steps): in Stripe test mode, add the
  Connected accounts destination with `invoice.paid`, set both Connect variables under
  Vercel's Preview (the test-mode `ca_…`), then buy from a test coach on staging.
- Decide the perks the website's "What Master unlocks" card and `leaderboards.jsx`
  promise (payout tier, ranking, a verified badge): nothing grants them.
- Decide whether the coach leaderboard should keep showing every coach each other's
  active-client count and sessions-kept rate.
- Check `NORA_TTS_VOICE` and `NORA_TTS_INSTRUCTIONS` in Vercel. Nora reads only in a
  woman's voice now (coral, nova, shimmer or sage), so any other `NORA_TTS_VOICE` is
  ignored, and her brisk-pace line is added to `NORA_TTS_INSTRUCTIONS`.
- Decide the bring-your-clients rules. A client brought to a coach at capacity comes
  through the waiting list and pays 15%. A purchase more than 30 days after the link
  was last opened pays 15%, though the card says brought clients pay no commission. A
  private profile can't be opened from the link, and the app's checkout sends no
  referral.
- Add the `localhost` hostname to the Turnstile widget.
- Get a native speaker to read the PAR-Q translations.

**Planned next**
- Coach payments, direct charges part C: the coach pages' copy and a labelled processing
  estimate. Part A is #2401 and part B (checkout on the coach's account, codes, records in
  `coach_checkouts`) is #2403.
- Night-before prep, Phase 2: a nutritionist's "prep the night before" tick, a
  reminder time the member chooses, planning tomorrow, and a morning swap.
- Nora as the account-setup assistant: she answers and fills forms today, but setting
  the account up is still to build.
- Nora as a Shape Radio DJ, Phase 2 onward
  ([`REVIEW-2026-09-29-nora-dj.md`](REVIEW-2026-09-29-nora-dj.md)). This waits on a
  signed station provider.

**Known gaps** (the War Room has the detail where a line says so)
- `get_display_names` gives any caller a full name and photo for any id.
- The app's notification list reads a failed load as "You're all caught up". Email covers only
  coach messages, waitlist invites, tier-ups and a coach's waiting list (#2387); red and amber
  client alerts are app and push only, and a failed email is dropped (no retry).
- A member may pay two coaches of one role, sharing one section per discipline (#2384), but
  Nora's member read, the calendar and the prep-reminder cron read only the newest published
  meal plan (War Room).
- A subscription to a coach who is later suspended keeps renewing.
- The `?error=` redirects from `/purchase` and `/subscribe` are never shown.
- A referral sign-up's confirmation email opens a bare `Login.html`, so confirming on another
  device loses the way back to the coach (War Room).
- `checkin_submitted` is a switch nothing writes.
- Payment notices (#2402) reach the owners in code (`admin-access.ts`), not Staff-page staff.
- Direct charges (#2403): the app profile's one-tap Subscribe and Book have no code box; a
  one-time percent code's fee can be a cent off Stripe's rounding; a member whose coach
  disconnected goes to Shape support, which handles it by hand (Shape can't cancel on that
  account); an unreadable recent checkout on a coach's former account holds a new plan up to 4
  days (`payment_pending`).
- Business: five read gaps, from the plan's goal not being remembered to the 25-renewal Stripe
  check (War Room).
- Home (`BSHomeSections.jsx`): Week so far counts days trained against the plan's sessions, and
  food days, not meals; a protein or steps square without a target takes any reading; the
  weekly notes, message doors and next session show only for a paid coach.
- Eat on a live meal plan reads what was eaten from the plan's day `totals` and meals' `state`,
  not the logs.
- Signed in, others' profiles show the demo signals and climb (owner: leave it).
- Shape Wire shows the coach's latest note however old; its morning protein line reads only
  today's row.
- Server notices: the bell, push and notice email say them in the reader's `app_locale` from
  `noticeCopy.mjs` (the row keeps its English for the website). A writer stores `data.copy`; a
  trigger's row is matched by its fixed English (`triggerCopy`), so changing that English needs
  its shape there too. Still English: the owners' payment notice, a coach alert's reason, the
  standalone emails (sessions with .ics, hire, welcome, intro), and any reader with no stored
  language.
- Habits: the charts read only 90 days and can't tick a past day; a friend stops hearing a
  shared habit (`habit_watchers`) only by turning Friends' habits off or unfollowing; sharing
  is set only in a habit's ⋯ options; the daily cap counts only notices stamped as pushed that
  day; the AI notify engine, failing to read the day's pushes, counts only its own; a failed
  `claim_push_slots` claim sends on the count as read.
- A goal in the member's own words is set in the app (the Goal picker, first run) and the
  website's sign-up; the website's Goals page only shows goals. Only the five weight goals read
  weight; any other reads in words until a weight target is set.
- A client whose payment is retrying keeps access until Stripe cancels; a Stripe setting that
  leaves it past_due keeps it open.
- Hosted `/m/`, signed out in its own client: a Nora load spanning an account switch in another
  tab shows the first account's conversation (every write is refused). Not to be fixed (owner).
- 52 mutations in 17 older specs anchor on removed code, so `--fail-on-skipped` fails on those
  specs.
- Apple Music playlists in the installed app still run MusicKit in the WebView.
- Staff two-factor has no recovery codes, and reloading `/staff-verify` during set-up makes a
  new key (#2388). The Radio page can ask for the code again.
- The website's usage stats don't wait for the consent banner in the EEA and UK.
- `next.config.ts` imports `withSentryConfig` from `@sentry/nextjs`, which stops working in Sentry
  v11 (`@sentry/nextjs/config`).
- Nothing opens the chat panel from a URL; `TrainerNewProgram.html` and `get-started.html` are
  linked from nowhere.
- The website's Kitchen (`recipesPage.jsx`) runs its filter toggles and jump row off a phone's
  right edge.
- No signed-in pass in a browser or on a phone yet: client onboarding, the dashboard frame,
  `/admin`, Business (website and app), coach application uploads, the Wall's live story with a
  real set, the coach Today, Clients and Programs redesign (#2458).
- The Wall's old card (`variant="wall"`) is unused in the app; the website chat bubble still
  draws its copy. Grocery lists are sent and saved in the app only; old builds' grocery writes
  go unmerged.
- Not built yet: native mic and camera plugins (including iOS barcode scanning) and on-device
  macro reads from a meal photo.
- Daily check-in (#2398): saves have no timeout, `hydration_l` rounds an 8 oz glass up, typed
  hours can be stamped as the watch's, and a clock set behind can date a change into a past
  week (War Room).
- Sleep points (`award_sleep_points`) trust `sources.sleep_hours` on a row the member can
  write: with a provider connected, a direct write could earn +5 a night for the last 14 days,
  and Apple Health nights and connection are whatever the app posts, so a member can post
  made-up nights (as for Shape Steps).
- Apple Health water double-counts a drink that two apps, or Health and Shape, both log, and
  the Daily check-in reminder fires on a day already done (War Room).
- Morning check-in: a failed water-target read offers "Set a daily target"; with Check-ins off,
  a target never brings "Water is behind"; pushes and bell rows from before part 2, and the
  website's coach Today draft, keep the "/10". The rest of parts 2 and 3 is in the War Room.
- Android back leaves the native app from any sheet (no `@capacitor/app`); in the hosted `/m/`,
  sheets add no history entry.

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
