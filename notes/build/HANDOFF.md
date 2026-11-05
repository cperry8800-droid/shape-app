# Coach dashboard build — handoff (2026-11-05)

Start here. This file, the plan (`notes/build/PLAN.md`) and the wiring audits (`notes/wiring/*.md`) are on
branch `claude/backup-plan-notes`: `git fetch origin claude/backup-plan-notes && git show origin/claude/backup-plan-notes:notes/build/HANDOFF.md`.

## Where things stand
- **Merged and live, for all coaches:**
  - #2620 (P1, correctness fixes; Score past sessions);
  - #2621 (P2, the one signal engine, coach actions, dismiss and snooze).
- **#2622 (dual-role coach follow-up):** merges at the end of the previous session if the owner OKs it. Check its state first.
- **Migrations the owner has run (checked live):**
  - `2026-11-05-coach-score-past-sessions.sql`;
  - `2026-11-05-coach-signal-dismissals.sql`.
- **Migration still to run, AFTER #2622 merges:** `2026-11-05-coach-signal-dismissals-by-role.sql`. Give the owner the raw link on `main`, then check it live with read-only queries: the key is `(coach_id, client_id, reason_key, provider_role)`, plus the role check and 4 policies.
- The only account that is both trainer and nutritionist is the owner's. No `dietitian` profiles exist.

## How the owner works (follow these)
- **Plain language.** Short answers that say what changed for coaches and members, not code.
- **Conserve usage.**
  - No full-suite runs: CI runs it, about 15 minutes. Run only targeted tests.
  - No polling or wait loops, and no self-scheduled check-ins. The owner says "check reviews".
  - Use fresh, small agents for big builds, one or two at a time.
- **Nothing merges without the owner's OK.** They often choose "merge now, fix the rest next" after one Codex round. Answer every finding on its thread and resolve it.
- **Migrations:** the owner runs them. Give the raw.githubusercontent link, then verify live, read-only, with the Supabase MCP (project `zznufekgjngecelwxndw`).
- **The session branch can't be force-pushed.** After a squash merge, reset to main and `git merge -s ours origin/<branch>` the old tip, then push normally.
- **House rules:** AGENTS.md and docs/WORKLOG.md. Commits use `SKIP_VERIFY=1` with the tests run named, and the attribution trailers.

## Work left, in order (owner, 2026-11-05: "the time zone build, then the dashboard")
1. **P9, time zones.** Owner: "all time zones should be set by user", and other people's times "should automatically update to their own timezone".
   - **Phase 1:**
     - one zone per account: a `profiles.timezone` migration, backfilled and mirrored to `trainers`/`nutritionists`/`client_profiles.timezone`;
     - an API the app can call (Bearer);
     - a picker in Settings, website and app, 13 locales;
     - defaults to the device's zone; on travel, prompt to switch and never switch silently;
     - one shared formatter (`public/newdesign/*.mjs`, re-exported in `mobile-app/src/services/`).
   - **Apply it first to:** the coach dashboard routes' `dayZone`; coach Today/Week/Schedule, including the week-ahead panel (`dashCalDate`/`dashCalTime`); booking slots in the member's zone; session lists in the app.
   - **Phase 2:** the rest of the ~360 device-zone call sites in 74 files.
   - The full brief is P9 in PLAN.md.
2. **The new coach dashboard front-end, for all coaches.** No owner-only switch. Build it in the review's order, printing times through P9's formatter. The review artifacts are in the owner's claude.ai artifacts ("coach review").
   - **Fold in #2622's small follow-ups:**
     - The app posts every coach role it holds. `mobile-app/src/services/shapeBackend.js` around lines 10070–10104 builds one roster from `state.profile.role` with one shared throttle. Post each held role (dietitian counts as nutritionist), with a throttle per role. (Codex on #2622.)
     - The roster's PROGRAM column per role. `dashProgramLabel` in `public/newdesign/dashRoster.jsx` should read `programs[role]`.
     - The P2 mutation spec's stale anchors: `ruleMissedSessions(c)` and `v > 5` in `tests/mutations/coach-signals-p2-2026-11-05.mutations.mjs`.
   - **P3–P7 are already built, on backup branches.** Land each as the dashboard's widgets need it: rebase onto main, one PR at a time, each with its own migration if it has one.
     - `claude/backup-p3-money` (money records, Stripe; a mutation round is required);
     - `claude/backup-p4-goals-programs`;
     - `claude/backup-p5-programs-messaging`;
     - `claude/backup-p6-builders-nora`;
     - `claude/backup-p7-parity`.
3. **Later:** P8, member profile privacy. Accepted followers see everything; withhold points from `get_public_profile` for viewers the profile isn't open to. See PLAN.md.
4. **The War Room (`src/lib/warroom.ts`) and `docs/WORKLOG.md` updates** for #2620–#2622 and everything after, as the last commit of the last PR in flight (house rule). They were NOT done for #2620–#2622.

## Worth proposing
- **Split CI's test job across 4 machines** (`node --test --test-shard=N/4` in a matrix, plus a gate job named "Tests (unit + mount)"). It would cut each wait from about 15 minutes to about 5. The owner hasn't answered this yet.
