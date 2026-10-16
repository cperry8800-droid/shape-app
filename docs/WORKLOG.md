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
  Room (`src/lib/warroom.ts`). The War Room update goes last.
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
- **Next.js app (`src/`):** API routes, the gated `/dashboard` and `/admin`. Typecheck
  with `npx tsc --noEmit`. This Next version has breaking changes, so read
  `node_modules/next/dist/docs/` before writing Next code. When you add a route,
  register it in the War Room's `RAW_ROUTES`.
- **Mobile app: `mobile-app/`** (Capacitor/Vite SPA, served at `/m/`).
  - Build: from `mobile-app/`, run `VITE_BASE=/m/ npm run build`.
  - Publish: from the repo root, run `rm -rf public/m && cp -r mobile-app/dist public/m`.
    CI fails if `public/m` is stale.
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
- Set up Firebase and APNs for push (0 push devices in production), then a device
  pass of a native build. That pass includes MusicKit sign-in inside
  SFSafariViewController and Chrome Custom Tabs.
- Run `supabase-migrations/2026-10-16-client-coaches.sql` (#2384: a member's coaches,
  for the care team and the shared week-one target).
- Decide what happens when a buyer pays an open checkout from another tab
  (closing it means refunds).
- In-app purchase outside the US (Phase 2) is on hold.
- Open `/admin` and set up the authenticator; staff two-factor hasn't been tried live.
- Decide how a suspended coach appeals.
- Have counsel read the 2026-10-13 privacy policy text.
- Decide whether the coach leaderboard should keep showing every coach each other's
  active-client count and sessions-kept rate.
- Check `NORA_TTS_VOICE` and `NORA_TTS_INSTRUCTIONS` in Vercel.
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

**Known gaps**
- `get_display_names` returns a full name and photo for any id, whoever asks.
- A member may pay two coaches of one role, sharing one section per discipline (#2384).
  Nora's member read, the calendar and the prep-reminder cron still read only the
  newest published meal plan, and the coach Shared clients roster is trainer to
  nutritionist only.
- A subscription to a coach who is later suspended keeps renewing.
- The `?error=` redirects from `/purchase` and `/subscribe` are never shown.
- `checkin_submitted` is a switch nothing writes.
- The app's coach Score page reads the member ledger, and `/api/coach/score` returns
  401 to the app's Bearer token.
- The nutritionist analytics route has the defects that were fixed in the trainer
  route. The trainer route's name lookups still fall back silently.
- Apple Music playlists in the installed app still run MusicKit in the WebView.
- Staff two-factor has no recovery codes. The Radio page can ask for the code again.
- The website's usage stats don't wait for the consent banner in the EEA and UK.
- Nothing opens the chat panel from a URL. `TrainerNewProgram.html` and
  `get-started.html` aren't linked from anywhere.
- No signed-in pass has been done in a browser or on a phone for client onboarding,
  the dashboard frame, `/admin` or the coach application uploads.
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
