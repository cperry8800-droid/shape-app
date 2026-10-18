# Shape — working notes

The current rules, the code map and the open items. Every session loads this file,
so it stays short: when a rule changes, replace the old line instead of adding a
correction under it.

There is **no changelog**. The PR description records what shipped, and `git log`
covers the rest. Everything written here before 2026-10-16 is in the archives (see
History at the end). `tests/worklog-rules.test.mjs` fails if a dated entry comes
back or the file grows past 20 KB.

## How we work

- ⛔️ **Check for a stale base before any edit.** The web container sometimes resets
  to an older commit. Run `git fetch origin main && git rev-parse HEAD origin/main`;
  if the two differ, `git reset --hard origin/main` first. Don't add `--short` to
  that command, because with two refs it fails.
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
  - Copilot runs on push and can be requested with
    `mcp__github__request_copilot_review`, but it often declines on its quota.
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
  with `npx tsc --noEmit`. This Next version has breaking changes, so read
  `node_modules/next/dist/docs/` before writing Next code. When you add a route,
  register it in the War Room's `RAW_ROUTES`.
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
- **Sheets** use `createPortal` into `#bs-phone-surface`.
- **Pages** render inside `BSPage`, which pins a condensed masthead once the page's own
  masthead scrolls away; a page that is its own scroller gets none. A `position: sticky`
  row inside a `BSPage` sticks at `top: useBSPinnedMastTop()`, below that masthead.
- **Theme:** `useBS()` → `t`. The teal accent is
  `t.isLight ? '#0a8f87' : '#34d6c5'`; nutritionists are gold `#a07a2e` and trainers
  rust `#c0533b`.
- **App copy** goes through `useShapeTr()` in all 13 locales.
  `tests/i18n-surface-inventory.test.mjs` counts the strings that aren't translated
  yet.
- **Backend touchpoints:**
  - `src/app/api/nutrition/meal-note/route.ts` sends a meal note, memo or photo to
    linked coaches through the private `meal-notes` bucket.
  - `src/app/api/nutrition/voice/route.ts` does Whisper transcription.
  - The War Room (`/warroom`, `src/lib/warroom.ts`) is the go-live status board.

## Open items

The War Room has the full list. This section covers what needs the owner, plus the
planned builds.

**Waiting on the owner**
- Push keys (the app side is built, #2385; 0 push devices in production). For iPhone,
  set `APNS_KEY_ID`, `APNS_TEAM_ID` and `APNS_PRIVATE_KEY` in Vercel. For Android, add
  the app to Firebase `shape-84d22` and save its `google-services.json` as the repo
  secret `GOOGLE_SERVICES_JSON`. DEPLOY.md §10 has the steps. Then do a device pass of a
  native build, including MusicKit sign-in inside SFSafariViewController and Chrome
  Custom Tabs.
- Decide what happens when a buyer pays an open checkout from another tab
  (closing it means refunds).
- In-app purchase outside the US (Phase 2) is on hold.
- Finish setting up the authenticator at `/admin`. Scan the code from inside the
  authenticator app (the iPhone Camera sends it to Passwords, which also works), and
  scan again after a reload (#2388).
- Decide how a suspended coach appeals.
- Have counsel read the 2026-10-13 privacy policy text, and `terms.html`'s line that
  card-processing fees are deducted separately from a coach's net (Shape pays them;
  #2394).
- Decide the fee and payout copy in `coaches.jsx` and `pricing.jsx`: they still say
  card processing is separate and "15% on everything", and `coaches.jsx` promises
  weekly payouts (#2394).
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
- Night-before prep, Phase 2: a nutritionist's "prep the night before" tick, a
  reminder time the member chooses, planning tomorrow, and a morning swap.
- Nora as the account-setup assistant: she answers and fills forms today, but setting
  the account up is still to build.
- Nora as a Shape Radio DJ, Phase 2 onward
  ([`REVIEW-2026-09-29-nora-dj.md`](REVIEW-2026-09-29-nora-dj.md)). This waits on a
  signed station provider.
- A one-tap daily check-in on Home
  ([`REVIEW-2026-10-18-daily-checkin.md`](REVIEW-2026-10-18-daily-checkin.md)): a save
  per tap, five-word scales, "Same as yesterday", and sleep from a wearable. Rulings are
  made (§5), including no −7 for a missed weekly check-in while the switch is off.

**Known gaps**
- `get_display_names` returns a full name and photo for any id, whoever asks.
- The app's notification list reads a failed load as "You're all caught up" (Clear all
  is on both, #2386 and #2389). Email is offered only for coach messages, waitlist
  invites, tier-ups and a coach's waiting list (#2387); a coach's red and amber clients
  are app and push only, and a failed email is logged and dropped (no retry queue).
- A member may pay two coaches of one role, sharing one section per discipline (#2384).
  Nora's member read, the calendar and the prep-reminder cron still read only the
  newest published meal plan, and the coach Shared clients roster is trainer to
  nutritionist only.
- A subscription to a coach who is later suspended keeps renewing.
- The `?error=` redirects from `/purchase` and `/subscribe` are never shown.
- `checkin_submitted` is a switch nothing writes.
- The app's coach Score page reads the member ledger, and `/api/coach/score` returns
  401 to the app's Bearer token.
- Both analytics routes' name lookups fall back to "Client" and "Former client"
  without saying so. The nutritionist route's `newClients7d` prints a failed count as
  0 (nothing reads it), and its name read stops at 1,000 clients.
- Business (#2394, #2395): the plan's goal isn't remembered; renewals past 25 a load
  aren't checked with Stripe; the 90-day churn total is a floor once all 12 listed
  cancellations fall inside it; "who found whom" counts rows, not clients. The Clients
  badge can read one higher than the Clients list (a client whose payment is
  retrying), and the dashboard routes still read 1,000 subscriptions at most and send
  0 for a failed read.
- In the hosted `/m/` app signed out in its own client, a Nora load that starts as one
  cookie account and ends after another tab switched accounts still shows the first
  account's conversation (every write is refused). Not to be fixed (owner: "the m app
  website will not be in effect once the app is live on app store").
- Eleven mutations in older specs (ai-draft, builder-fixes, builder-step2,
  cook-owner-fixes, focus-layout, prep-reminders, talk-to-person) anchor on removed
  code, so `--fail-on-skipped` fails on those specs.
- Apple Music playlists in the installed app still run MusicKit in the WebView.
- Staff two-factor has no recovery codes, and reloading `/staff-verify` during set-up
  makes a new key (#2388). The Radio page can ask for the code again.
- The website's usage stats don't wait for the consent banner in the EEA and UK.
- Nothing opens the chat panel from a URL. `TrainerNewProgram.html` and
  `get-started.html` aren't linked from anywhere.
- The website's Kitchen (`recipesPage.jsx`) still runs its filter toggles and jump row
  off the right edge of a phone; the app's moved to a dropdown and in-place time tabs.
- No signed-in pass has been done in a browser or on a phone for client onboarding,
  the dashboard frame, `/admin`, Business (website and app) or the coach application
  uploads.
- Native mic and camera plugins (including iOS barcode scanning) and on-device macro
  reads from a meal photo aren't built yet.

## History

- Changelog entries up to 2026-10-16:
  - [`WORKLOG-ARCHIVE-2026-10.md`](WORKLOG-ARCHIVE-2026-10.md)
  - [`-2026-09`](WORKLOG-ARCHIVE-2026-09.md)
  - [`-2026-08`](WORKLOG-ARCHIVE-2026-08.md)
  - [`-2026-06-07`](WORKLOG-ARCHIVE-2026-06-07.md)
  - [`-2026-06-cycles-2-5`](WORKLOG-ARCHIVE-2026-06-cycles-2-5.md)
- The old version of this file, with every reviewer ruling and the reasoning behind
  each rule: [`WORKLOG-ARCHIVE-conventions-2026-10-16.md`](WORKLOG-ARCHIVE-conventions-2026-10-16.md).
- Session handoffs (`docs/HANDOFF-*.md`) are no longer written; the old ones are
  history too.
- These files are 0.2–1.1 MB each. To find something, run
  `grep -n "<term>" docs/WORKLOG-ARCHIVE-*.md`, then read only that entry with
  `sed -n '<start>,<end>p'`. Never `cat` or `@`-import an archive.
