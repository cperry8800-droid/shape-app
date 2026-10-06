# Shape — changelog archive: 2026-10

Dated changelog entries for **October 2026**, moved out of `docs/WORKLOG.md` by
`scripts/worklog-archive.mjs`, which keeps only the newest entries live so the
auto-loaded working memory stays under the cap that `tests/worklog-size.test.mjs`
enforces. **Nothing is edited on the way** — each entry is byte-identical to what
it was in the live log.

⚠ **This is history, not guidance.** The live conventions — build/deploy steps,
the review stack, the stale-base rule, the architecture map — are in
[`docs/WORKLOG.md`](WORKLOG.md) and are the ONLY ones that bind. Where an entry
here describes a convention, a reviewer, a gate or a command, assume it is
superseded and check the live file. Entries carry their own ⚠ CORRECTED markers;
those corrections are part of the record.

⚠ **Read an entry, not the file** — `grep -n "<term>" docs/WORKLOG-ARCHIVE-*.md`
to find it, then `sed -n '<start>,<end>p'` to read only that entry. Reading a whole
archive re-pays the token tax the cap exists to remove.

**Newest first**, same as the live log. Sibling archives:
[`WORKLOG-ARCHIVE-2026-09.md`](WORKLOG-ARCHIVE-2026-09.md) ·
[`WORKLOG-ARCHIVE-2026-08.md`](WORKLOG-ARCHIVE-2026-08.md) ·
[`WORKLOG-ARCHIVE-2026-06-cycles-2-5.md`](WORKLOG-ARCHIVE-2026-06-cycles-2-5.md) ·
[`WORKLOG-ARCHIVE-2026-06-07.md`](WORKLOG-ARCHIVE-2026-06-07.md)

## Changelog — 2026-10

### 2026-10-05 — Nora is heard on the website cook page, her voice is a real switch, the cook page loses its box, and overnight oats stop running a 4-hour timer

- **Merged [#2200](https://github.com/cperry8800-droid/shape-app/pull/2200) as `a42519b`**, final head `2839b3e`; the merged tree is byte-identical to it (tree `faf44b8` on both, since `main` had not moved). 34 files, seven commits. **No migration, no new route.** Nine owner requests about the cook screens, in one PR as asked (*"do all of them in one PR"*). The website and the app share these screens, so each fix lands in both (*"make sure these issues are not on app cooking module as well"*).
- **The website cook page** (`cookPage.jsx`, `Cook.html`).
  - The `/m/?cooking=1` iframe fills the screen under the site header, with no box (*"just have it be on the screen"*). The page uses the cook layer's own bone paper (`#ece4d3`), and `main.jsx` paints the iframe bone before the cook layer mounts.
  - **← All recipes** is an ink link with a drawn arrow, a 44 px target and `:focus-visible`.
  - **Open cooking full screen ↗** is gone.
  - The floating chat launcher is hidden on this page, because it sat over the pinned Done button. Its `<script>` tag stays, since `dobGate.js` is injected against it.
- ⚠ **NORA WAS NEVER HEARD ON THE WEBSITE, BECAUSE THE COOK LAYER WAS SIGNED OUT.** The cook layer is the app inside the website's iframe. It read the app's own Supabase token (`sb-<ref>-auth-token`), and the website's is `shape.auth`, so a member signed in on the website was signed out inside the cook layer.
  - Production evidence: Vercel's runtime logs showed **zero `/api/ai/speak` requests in 7 days** while the cooking bundle was being served.
  - On `?cooking=1` (web only, never native) the app client now uses `storageKey: 'shape.auth'`, so the cook layer is one more client of the website session, like a second website tab. Both sides are on supabase-js ≥ 2.107, whose refresh coordination is lockless.
  - `state.session` was the boot copy and never followed a refresh. A `TOKEN_REFRESHED` listener keeps it current, and `liveAccessToken()` reads the token at call time for Nora's voice, ask and transcribe.
  - *"Nora is reading this step"* was drawn for `idle` too. `speakVoice` now returns an `ended` promise that settles on end, error, stop or supersession, and the line shows only while loading or playing. A sign-in refusal no longer offers a useless *Play voice*.
  - `cookingWeb.jsx` paints after at most 2.5 s instead of waiting on the session bridge and profile reads.
- **Nora's voice is one on/off switch** (*"make sure this is a toggle option"*). It is a single shared setting (`useSyncExternalStore` over `shape.cookReads`), so the one-dish screen, the board and the session setup cannot disagree. It is `role="switch"` with `aria-checked`. The website reads **Nora's voice · On/Off**; a phone shows the icon, dim when off and ringed in the accent when on (a fill dropped the icon under 3:1). Off means silent everywhere: her answers to the mic and to *repeat* show as text.
- **The cook sheets get a 44 px ×** (*"need a small x button"*), in `bsCkSheet`, so All steps and *Leave the cook?* both have one. It never takes first focus, and focus returns to the opener.
- **The board's primary button reads *Start now*** when a step is waiting only on the plan's clock (*"not letting me continue or press next"*). Before, it stood pale, and the only *Start now* was in a wait row a long card scrolled out of view. A real wait, a station still held, keeps the button shut.
- ⚠ **"BOTH DISHES NEED YOUR HANDS" WAS PARTLY THE PLANNER'S FAULT.** `bestPlacement` returned the first order that fit at the serve time, overlapping or not, so a *later* serve time could turn a plan that lands together into a refusal. **253 of the 1,928 catalog pairs** that land together at their earliest time were refused at some later time; now **0**, and the all-pairs sweep is a test (`tests/cook-serve-overlap.test.mjs`). `phaseSchedule` ranked by gap alone, so overlapping orders now come first. Three or more dishes get their own wording instead of *"Both"*.
  - Not changed, an owner call: pesto pasta + cauliflower steak is still refused, because the overlay costs the cauliflower's *"Roast 25 minutes"* as 3 minutes of hands-on work (its next step is the author's *"Meanwhile…"*).
- ⚠ **THE OVERNIGHT OATS RAN A 240-MINUTE HOLD.** *"Chill at least 4 hours or overnight"* drew a `239:37` countdown, scheduled the morning steps four hours into the session, and put every finish figure four hours out (*"About 248 min left"*).
  - A catalog overlay can now mark a step `{ makeAhead: true }`. `bsCookableFromRecipe` ends tonight's method there and keeps the rest as `laterSteps`. Only the overlay is read, so a coach's or member's inline step cannot carry the mark.
  - `bsOfferedTimers` offers no countdown on a make-ahead step; Serve makes such a dish first and lands dinner on time (`exact: false`); the last step reads **Done · finish**, the screen **Made ahead.**, and the morning steps follow under **When you're ready to eat**.
  - The batido's *"refrigerate up to 4 hours"*, a storage limit, is make-ahead too.
  - A catalog guard fails on any off-heat wait over an hour unless it is make-ahead or named as a tonight wait with its reason. The 60-minute waits a cook really sits through tonight are kept.
- **i18n:** six new `cook` keys × 13 locales (`ck.serveNeedsRoomMany`, `ck.serveNeedsHandsMany`, `ck.readsOnToast`, `ck.readsOffToast`, `ck.laterHead`, `plated.later`).
- **Review.** Codex refused on its usage limit when the PR opened, and Copilot declined on its quota on all three pushed heads (`9068f58`, `726ca05`, `2839b3e`). CodeRabbit's automatic notice came within seconds; the bare trigger was rate-limited, and the round then ran on `9068f58`: **five findings, four fixed in `726ca05` and one withdrawn by CodeRabbit** on measured runtime. Every thread was answered and resolved, and CodeRabbit confirmed each fix on its thread.
  - The voice switch could not turn on when `localStorage.setItem` threw. An in-memory value now holds it.
  - ⚠ **The wrap named the first dishes in plan order, not the ones that finished.** The board can finish a later dish first. `doneKeys` is recorded in `writeEntry` and restored on resume.
  - `finishCookable` now exempts a make-ahead step from its terminal rewrite, so the mark cannot be lost if the entry ever becomes passive.
  - A stopwatch assertion became a count: `serveTimeline` reports `placements`, 979 for the 7-dish set with the oats against 67,053 searched exhaustively, and the test holds `0 < placements < 10000`.
  - Withdrawn: sampling the all-pairs sweep. The file runs in about 3.7 s, and it is the guard that measured the defect.
- ⚠ **THE FIRST ROUND NEVER REVIEWED THE FINAL HEAD, AND THE OWNER ASKED FOR IT.** Its fixes were confirmed thread by thread, but CodeRabbit's status on `726ca05` read *"Review skipped"*. On the owner's *"make sure codereview is run on 2200"*, one more bare trigger went out a day later, inside the hour's included review: **2 findings on `726ca05`, both real, both reproduced by a failing test and fixed in `2839b3e`**.
  - A Serve plan made only of made-ahead dishes lost *"too soon"* once the offset was added: with no dish left for tonight there was no inner plan to carry it. It is judged on the whole plan now, and dinner's own flag is replaced rather than doubled.
  - The website cook layer read a session still loading at 2.5 s as signed out, because the user is cached only after the profile reads. A member on a slow connection was told to sign in until it finished. It reads as a member until the session settles.
  - Six mutations, all killed. ⚠ **One survived the first run, and it was the test's fault:** it read the flag after `await`, by which time the page's own catch-up write had replaced the first one. The test now records every write.
  - ⚠ **`2839b3e` itself had no full review.** CodeRabbit confirmed both fixes on their threads; the commit is otherwise covered by its tests, the mutations and my own reread. The owner ruled *"merge it when CI is green"*, and it merged with every required check green on that head.
- **My own adversarial round before the trigger** found five more, all fixed in `590682c`: the stale token; the blocking first paint; the make-ahead serve time claiming to be proven earliest; a 7-dish plan with the oats taking ~3.8 s instead of ~0.1 s; and a long French title running under the switch at 760 px. The on-state contrast was fixed too.
- **Verified:** `npm test` **5371/5371** on the final head, through the pre-commit gate on every commit; all required checks green on `2839b3e`. Mutation rounds through the shared runner (`tests/mutations/cook-owner-fixes-2026-10-04.mutations.mjs`, `--fail-on-skipped`): **57/57** on `617aeaf`, after eight first-run survivors were closed as real gaps; **67 of 68** on `590682c`, the one survivor a real gap (the wide layout's *Log what you ate* note) closed in `9068f58` and then killed; **5/5** on the first round's fixes in `726ca05`; and **6/6** on the second round's in `2839b3e`. Driven in Chromium, signed out: `Cook.html?mode=together` at 1440 / 1280 / 768 / 390 / 320 with no horizontal scroll; the switch at 1280 and 390; the × on both sheets with focus return; oats + shakshuka Together at 25 min with no `240` / `239:` anywhere; zero page errors.
- **Written after the merge**, per the 2026-09-11 rule.
- ⚠ **REGISTERED, NOT FIXED:**
  - The finished oats screen still offers *Log it* tonight for a breakfast eaten tomorrow. Owner call.
  - Coach-written *"chill 4 hours"* steps and member imports can still produce long holds, since the mark is read from the catalog overlay only.
  - `bsCkMmss` prints a timer over an hour as minutes (`119:59`).
  - The sheet scrim stops at the iframe edge, and the page's *← All recipes* and the cook bar's × are two exits to /recipes, one above the other.
  - The pesto + cauliflower pair above. ⚠ **Serve stays exact, by the owner's ruling** (*"serve is so dishes finish together"*): it will not offer *"ready within N minutes"*, which closes the call #2179 registered. Night-before prep is to become a reminder instead; the review is https://claude.ai/artifact/VeUyVhgjsuBDqm8v6XstYE, nothing built yet.
  - *"1 burners, 1 ovens"* should be singular. Pre-existing.
  - ⚠ **NO ON-ACCOUNT PASS.** Supabase is unreachable from the build box, so nobody has yet heard Nora on the website signed in. The honest check is the owner opening a recipe's cook page signed in, with the switch on.

### 2026-10-03 — The mutation runner can fail a round that skipped a mutation, and the booth's preview is re-measured

- **Merged [#2198](https://github.com/cperry8800-droid/shape-app/pull/2198) as `2067e07`**, final head `3fc21cf`; the merged tree is byte-identical to it (tree `afb0df6` on both). Seven files. **No migration, no route, no app code.**
- **The #2189 records.** Its changelog entry, written after its merge; the preview republished as version 6, byte-identical to a fresh build of `main`; the booth re-measured at 1280×720 (high 153, high `?cine=0` 143, low 123 draw calls, about one fewer each, which is the stairs' LED riser mesh); `glinfo.cjs` waiting up to 3 minutes for the cinematic tier's page load; and the #2189 review round checked in as `tests/mutations/nora-flash-gate.mutations.mjs`, 6/6.
- **`--fail-on-skipped`** (CodeRabbit asked; owner: *"Do this task here"*). `scripts/mutate.mjs` exits 1 when any mutation could not be applied. Before, a skip never changed the exit status, even under `--fail-on-survivor`, so a spec whose anchors had drifted could exit 0 having tested nothing.
  - `--fail-on-survivor` is unchanged, and the two flags combine.
  - A round with skips lists each one with `planMutation`'s own reason: an anchor that does not occur exactly once, an empty anchor, or a replacement identical to its anchor.
  - The runner convention at the head of this file now passes the flag.
- **Review.** Codex refused on its usage limit when the PR opened. CodeRabbit's automatic notice came 11 s after opening, and the bare trigger was read as a command: **one round on `8422a61`**, one trivial finding, the flag above. I first queued it as its own task; the owner asked for it here. Copilot reviewed each push on its own:
  - `8422a61`: one low, a mutation named the opposite of what it does. Renamed.
  - `5082060`: none.
  - `0a352c4`: two low, both right. My new note and the docs called every skip a drifted anchor. Fixed in `3fc21cf`.
  - `3fc21cf`: none. Every thread was answered and resolved, and CodeRabbit was not re-triggered.
  - ⚠ **My own re-read caught a false line in my own records before any reviewer did**: the "run the measurement panel alone" note named a phone check that never ran beside the measurement. Corrected in `5082060`.
- ⚠ **The web build failed once on `3fc21cf`**: `next build` could not download the Inter font from Google Fonts (56 identical module-not-found errors, nothing the diff touches). Its one re-run passed.
- **Verified:** `npm test` **4929/4929** through the pre-commit hook; the runner's own round under the flag **killed 30, survived 0, skipped 0**, with the one no-op and the one timeout its spec documents; all four required checks green on `3fc21cf`.
- **Written after the merge**, per the 2026-09-11 rule. Records-only, so no review round.
- **REGISTERED, NOT FIXED:** the three older specs' headers (`batched-overview`, `heavy-assets`, `integrations-page-module`) still show the run command without the flag; the convention above has it. The `worklog-archive.mjs` idempotency fix registered by #2186 is still open.

