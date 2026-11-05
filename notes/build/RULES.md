# Rules for every build package

You are building one package of /tmp/claude-0/-home-user-shape-app/7174c142-9643-5e05-a172-df53668bd76d/scratchpad/build/PLAN.md
in the Shape repo, inside your own git worktree. Other packages are being built in parallel in
other worktrees, so touch only the files your package needs. If you must touch a shared file
(e.g. dashToday.jsx), keep the change small and say so in your report.

1. **Read first.** Read AGENTS.md and docs/WORKLOG.md in full; they are the house rules.
   This version of Next.js has breaking changes: read the relevant guide in
   node_modules/next/dist/docs/ before writing Next code. Never cat docs/WORKLOG-ARCHIVE-*; grep them.
2. **Git.**
   - Commit locally in your worktree with clear messages. Each commit message ends with these two lines:
     Co-Authored-By: Claude <noreply@anthropic.com>
     Claude-Session: https://claude.ai/code/session_01BhoNr4R4pdPuhcbzFiYQHR
   - Do NOT push, open a PR or touch any remote branch.
   - Don't put model names in commits or code.
3. **Migrations.**
   - Idempotent SQL in supabase-migrations/2026-11-05-<name>.sql.
   - The owner runs migrations by hand, so code must not break if a migration hasn't run yet:
     degrade gracefully, or say clearly in your report that it's required first.
   - Don't run anything against the live database.
4. **Mutation rounds.** Required for money, data or a migration:
   node scripts/mutate.mjs --spec tests/mutations/<subject>.mutations.mjs --fail-on-skipped
   Write the spec like the existing ones in tests/mutations/. A survivor means a missing guard
   (fix the test) or a proven no-op (expectSurvive, with the proof).
5. **Tests and checks.**
   - Add or extend tests in tests/ (node --test) for every behaviour you change.
   - Run the tests you touch plus the related ones, and `npx tsc --noEmit` if you touched src/.
   - Parse-check every JSX file you touch:
     node -e "require('@babel/parser').parse(require('fs').readFileSync('<file>','utf8'),{sourceType:'module',plugins:['jsx']})"
   - The pre-commit hook may run (scripts/verify-staged.sh). If a commit is small and you've run the
     relevant tests, SKIP_VERIFY=1 is allowed; list what you ran.
6. **House rules from AGENTS.md / WORKLOG.md that bite most often:**
   - A new route goes in the War Room's RAW_ROUTES (src/lib/warroom.ts). Do NOT write War Room
     section updates; the main session does that in the last PR.
   - A route the app calls reads the caller with clientForRequest/currentUser (Bearer token).
   - A new notification kind needs a switch in PREFERENCE_OF (notificationSurfaces.mjs) and on both
     settings screens; quiet hours hold it for /api/cron/push-held; the writer stores data.copy for
     noticeCopy.mjs.
   - App copy goes through useShapeTr() in all 13 locales.
   - Website: never bump a script's ?v=.
   - No coloured emoji in new work.
7. **Scope.** Don't redesign UI here; the new dashboard front-end comes later. Fix data and logic,
   and make minimal UI changes only where needed to show a fix (a label, a confirm step, a list).
8. **Report.**
   - Commits (hash and subject), files changed, migrations and whether code tolerates them not
     having run yet.
   - Tests and mutation results.
   - Decisions you made, anything left open, and anything the owner must do.
   - Your worktree path and branch name.
