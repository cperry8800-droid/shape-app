# Shape — changelog archive: 2026-08

Dated changelog entries for **August 2026**, split out of `docs/WORKLOG.md` on
2026-09-03 so the live working memory stops carrying ~400k tokens of history into
every session. **Nothing was edited** — these entries are byte-identical to what
they were in the root log.

⚠ **This is history, not guidance.** The live conventions — build/deploy steps,
the review stack, the stale-base rule, the architecture map — are in
[`docs/WORKLOG.md`](WORKLOG.md) and are the ONLY ones that bind. Where an entry
here describes a convention, a reviewer, a gate or a command, assume it is
superseded and check the live file. Several entries carry their own ⚠ CORRECTED
markers; those corrections are part of the record and were carried forward.

**Newest first**, same as the live log. Sibling archives:
[`WORKLOG-ARCHIVE-2026-06-07.md`](WORKLOG-ARCHIVE-2026-06-07.md) ·
[`WORKLOG-ARCHIVE-2026-06-cycles-2-5.md`](WORKLOG-ARCHIVE-2026-06-cycles-2-5.md)

## Changelog — 2026-08

### 2026-08-31 — The marketing wave reaches the go-live board, and registering it found two gaps

- **The consumer marketing wave was registered NOWHERE.** `marketing/social-brand-awareness-plan.md`
  (#1988) and `marketing/shape-radio-video-scripts.md` (#1990) both merged, and the 08-31b
  handoff's own follow-up says *"marketing is written, not shot"* — but the War Room carried
  **no marketing section at all**, so the owner production steps and the two constraints that
  bind anything filmed were invisible to `/console`. New checklist section
  **Marketing — consumer social launch (Radio-as-channel)**, 10 items. Records only.
- ⚠ **THE TWO BINDING CONSTRAINTS ARE THE POINT OF REGISTERING IT, not the calendar.** The
  licensing guardrail (**never** bake commercial music into brand video — idents + Nora's
  shipped `sage` TTS + link-outs, the app's own Peloton-lesson architecture applied to camera)
  and the **code-derived capture rules**: `connectMonitor()` fabricates a **114 bpm demo
  reading** whenever no strap is present and the card still reads connected, and the status
  chip goes **blind at exactly the money shot** (it reads *Matching… / In sync* for demo and
  live alike). The on-camera tell that works is the readout **LABEL — "You · live"** — gated on
  `liveHr != null` at every stage.
- ⚠ **AND THE SHAPE SETS CONSTRAINT WAS RE-PROVEN LIVE RATHER THAN READ OFF THE MIGRATION —
  which turned out to be the stronger fact.** The scripts justify the *"first broadcast lands
  when we do"* framing on `radio_station.provider` defaulting to `'mock'`. Measured against
  production: **`public.radio_station` does not exist at all**, so both `/api/radio/station`
  and `/api/radio/now-playing` fall through to `provider: 'mock'` with `configured: false` and
  the app hides its own LIVE banner. The framing is right; its stated reason was weaker than
  the truth. *A because-clause is a claim.*
- ⚠ **GAP 1 — THERE IS NO ATTRIBUTION FOR THE PLAN'S OWN NORTH STAR, and my first count of it
  was stale.** The plan names *"profile-tap → GetApp clicks"* among the numbers that matter and
  schedules a Day-15 *"read the data"* checkpoint. Measured: `GetApp.html` and
  `newdesign/index.html` carry **ZERO** `utm_` or `ShapeAnalytics` references, so a TikTok
  arrival is indistinguishable from any other visitor. ⚠ I first recorded the `track_event`
  whitelist as **5 events** from the 2026-06-23 migration — **three later migrations widen it**
  (`session-rpe`, `guardrail-week-publish`, `week-publish-precondition`), and the **live**
  function carries **8**: `onboarding_started · app_opened · workout_started · paywall_viewed ·
  checkout_started · session_rpe_prompted · session_rpe_dropped · guardrail_evaluated`. None is
  a landing visit, so the gap holds — but **reading the oldest migration file and stopping is
  how a stale figure gets quoted forward**, which is this file's own recurring lesson.
  **Registered `pending`, deliberately NOT built:** a tracked landing event touches
  `docs/legal/ropa.md`, the retention schedule and the region-aware consent banner, so shipping
  it inside a records pass would create the stale-record class the wave exists to close.
- ⚠ **GAP 2 — THE TWO FUNNELS PRESCRIBE CONFLICTING ACCOUNT STRATEGIES, AND NEITHER DOC
  REFERENCES THE OTHER.** The consumer plan says **one brand account per platform** with Radio
  as the flagship show (*"splitting audiences pre-launch halves both"*);
  `coach-marketing-campaign-plan.md` independently prescribes **IG 4×/wk + LinkedIn 2×/wk +
  TikTok 3×/wk** of COACH-facing content on those same handles. Related and separately
  unregistered: the consumer plan makes **coach residencies simultaneously content AND
  recruiting (BYO · 0% commission)**, but *"residenc"* appears **ZERO times across all five**
  `marketing/coach-*.md` files and `coach-recruiting-campaign-plan.md` mentions Shape Radio
  exactly once — *"a nice-to-have, not the hook"*. Both are **owner rulings, not
  implementations**, and are registered as such.
- Verified: `tsc --noEmit` exit 0 · `warroom.ts` LF with zero CR/NUL · docs/config-only diff
  (the two lockfiles the SessionStart dep install touched were restored, not committed).

### 2026-08-31 — Session handoff: `docs/HANDOFF-2026-08-31b.md`

- **Three PRs since the day's first handoff — #1988 → #1990 — and two of them had no
  changelog entry.** [`HANDOFF-2026-08-31.md`](HANDOFF-2026-08-31.md) (#1987) closed at
  #1986; this one covers everything after it. Same calendar day, hence the `b` suffix
  (the `-08-16b` / `-07-10b` / `-07-14b` precedent).
- **Handoff: [`docs/HANDOFF-2026-08-31b.md`](HANDOFF-2026-08-31b.md)** — state snapshot,
  the three PRs, the architecture a next session needs (the SECURITY INVOKER freeze · the
  store's single authority · where the profile hero's numbers are derived from), and the
  open follow-ups. §4–§6 of the first handoff are unchanged by these three PRs and remain
  the authority for the ranked next work.
- **State, all re-measured rather than carried forward:** suite **2630/2630** · `tsc` 0 ·
  ratchet 9/9 (359 rendering JSX · 115 fully covered · 34 partial / 168 strings · 96
  uncovered / 818 strings) · **no open PRs** (the authoritative nothing-in-flight proof) ·
  13 locales × 18 namespaces × 4,162 `en` keys = **54,106 values**.
- ⚠ **AND MIGRATIONS OWED IS ZERO — PROVEN AGAINST THE LIVE DATABASE, NOT READ OFF THIS
  PAGE.** All four `2026-08-31-*` files are applied: the review-notes day columns are
  present; `store_catalogue` is down to 14 rows with merch = exactly the two caps and
  `tier_reward_defs()` no longer offering a deleted pick; `store_redemptions_cost_points_check`
  now reads `cost_points >= 0`; and the subject-freeze trigger is installed with
  **`prosecdef` = false**. That last column is the one to re-check — a freeze whose trigger
  is installed and whose function is SECURITY DEFINER is *installed, green, and enforcing
  nothing*, which is exactly what its own first cut shipped.
- ⚠ **THE RECORDS GAP THIS CLOSES IS THE FINDING, NOT AN ASIDE.** #1988's title names
  three things — *"Store merch removal, the nutrition review queue, and the full-bleed
  profile cover"* — and its WORKLOG commit recorded only the middle one. The store work
  (three migrations, five test files, the charging authority, both website store surfaces)
  and the full-bleed cover went in with **no entry at all**, and #1990 had none either.
  Both are written below. **A PR whose title lists three things and whose changelog lists
  one is the stale-record class this file keeps post-morteming** — and it happened inside
  the same PR I merged without reading its reviews.

### 2026-08-31 — Profile hero: smaller follow/message pills + a cover photo that reaches the sigil

- Two owner screenshot calls, one file (`iosAppBroadsheetClient.jsx`), presentation only.
- **The ＋ FOLLOW / ✉ MESSAGE pills came down 44 → 38 high**, with type (10 → 9) and
  padding reduced *with* the height so the pill keeps its proportions rather than just
  getting shorter; the gap between them tightens 10 → 8.
- ⚠ **THE COMMENT ABOVE THEM HAD TO BE REWRITTEN, NOT LEFT.** It asserted *"minHeight 34
  → 44, which is also the platform tap target"* — a description of the **previous** size
  that a future reader would take as a constraint forbidding this change. 38 clears this
  repo's documented floor — **WCAG 2.5.8 AA is 24px**, not Apple's 44pt HIG suggestion —
  with room to spare, and matches the other quiet controls on the page. *A because-clause
  is a claim with a shelf life.*
- **`bsInjectFollowChipCss` was checked BEFORE the size change and is size-agnostic** —
  the breathing glow is a `box-shadow` (which follows `border-radius`) and the press is a
  transform, so neither affordance depends on the pill's height. A size change that
  silently broke the only two affordances on the control would have looked fine in the
  diff.
- ⚠ **THE COACH HERO'S COVER PHOTO WAS A GEOMETRY PROBLEM, NOT AN OPACITY ONE.** A 320px
  strip whose gradient reached full paper at its own bottom edge was **structurally
  incapable** of appearing behind a sigil that runs to ~370px — raising opacity alone
  could never have fixed it. Measured rather than guessed: the mast inset (~44) + mast row
  (~34) + 12 + back row (~24) + 18 puts the sigil top at ~132px and its bottom at ~372px.
  Height 320 → **460**, opacity 0.5 → **0.72**, and the gradient re-stopped to reach full
  paper only at **76%** — below the hexagon rather than above it.
- ⚠ **BOTH NUMBERS ARE DERIVED FROM `BSSignalSigil`'s `size={240}`** and are wrong the
  moment it changes; the comment at the site says so, so the next reader re-derives instead
  of nudging the opacity again.
- **The member (Terrain) profile was checked and deliberately NOT touched** — its cover is
  a bounded band the ridge draws over at full opacity with its own four-stop scrim, so it
  never had this failure. The coach Signal hero was the one outlier; sweeping both would
  have changed a surface nobody complained about.
- **Verified in the emitted bundle behind positive controls, not just in source** — the new
  values present AND the superseded values absent, so a saturated-zero grep could not read
  as success. Suite **2630/2630** · `tsc` 0 · JSX parse · mobile build 0.
- ⚠ **Reviews were read BEFORE the merge this time** — all three surfaces (`get_reviews`,
  `get_review_comments`, `get_comments`) — and Codex's completed review named **`e3419fc`,
  the merged head**. That is the compliant shape, and the direct correction of #1988.

### 2026-08-31 — The Radio marketing plan gets its shoot script, and the app's own honesty rules bind the camera

- **New [`marketing/shape-radio-video-scripts.md`](../marketing/shape-radio-video-scripts.md)** —
  the production half of the 08-31 brand plan: a ~$60 kit list, the app-footage capture recipe,
  four recurring segment templates (Morning Dispatch · Request Line · Sign-off · Guest DJ),
  **the first 12 videos scripted shot-by-shot** with VO, on-screen text, captions and tags, and
  a day-by-day 30-day calendar. Docs only.
- ⚠ **THE CAPTURE RULES ARE READ OUT OF THE SHIPPED CODE, NOT INVENTED** — because the flagship
  demo has a demo fallback that looks exactly like a live one. `connectMonitor()`
  (`iosAppBroadsheetRadio.jsx`) sets `hrmConnected: true` and a **114 bpm demo reading** whenever
  `ShapeHRM.available()` is false or the picker is cancelled, so a phone with no strap films a
  perfectly convincing "live" HR-sync that is fabricated. **The tell that works is the readout
  LABEL, not the status chip.** The chip does read `radio:hr.live` ("Live") vs `radio:hr.free`
  ("Free") on a genuine reading — but only at the `free` stage; once matching starts it reads
  "Matching…" / "In sync" for demo and live alike, i.e. it goes blind exactly where the money
  shot lives. The label above the HR number is gated on `liveHr != null` at **every** stage
  ("You · live" vs bare "You"), so that is what the doc tells the shooter to keep in frame — the honest-data doctrine extended to camera, which is the whole point of the
  brand plan's no-faked-community line.
- ⚠ **AND TWO MORE FACTS THE SCRIPT HAD TO NOT OVERSTATE.** The HR target is
  **`r.LIVE.bpm` — the STATION's nominal BPM**, labelled as such in the app because the
  now-playing payload carries no per-track tempo; a script saying "the song matches your heart
  rate" would claim a per-track match the code does not make. And the beat-matching ease is
  **demo-only** (`if (!matching || liveHr != null) return`), so a real strap always wins — the
  genuine demo is the better one, which is the happy case.
- **The station is not broadcasting yet**, so nothing may say "tune in now": `station().configured`
  is false on the mock provider, which is exactly why the app hides its own LIVE banner. The
  Shape Sets scripts frame the countdown as *"first broadcast lands when we do."*

### 2026-08-31 — I merged #1988 without reading its reviews; Codex had found three real defects

- ⚠ **THE PROCESS FAILURE IS THE HEADLINE, NOT THE THREE FIXES.** I squash-merged
  #1988 on the documented gate — CI green on the final head, not a draft — and did **not
  open the review threads first.** Codex had completed a review carrying **one P1 security
  finding and two P2s**, all sitting unread. Every one of them is real; I confirmed each
  against the code rather than taking it on faith. **This file already post-mortems the
  identical mistake from 2026-08-30** — *"Codex auto-fired on the first commit and its
  finding was sitting on the PR, unread, while I merged the second … I checked CI and not
  the thread."* A rule written down after the first occurrence did not survive contact with
  the second. ⚠ **AND THE REVIEWED HEAD WAS NOT THE MERGED HEAD** — Codex read `9ce34a6`;
  the branch ended at `c3a180f`, so the marketing plan and the full-bleed cover commits
  went in reviewed by nobody. *A verdict is only about the head it names* — this file's own
  doctrine, and it cuts the other way too: **check WHICH head the review you are reading
  actually judged.** (CodeRabbit did not review at all; it posted its standard
  fewer-than-10-stars skip notice.)
- ⚠ **P1 — A COACH COULD REPOINT ANY REVIEW NOTE AT ANY MEMBER, AND MY OWN MIGRATION IS
  WHAT OPENED IT.** `coach_workout_review_notes`'s UPDATE policy is
  `using (reviewer_id = auth.uid()) with check (reviewer_id = auth.uid())` — author-only,
  **no subject predicate**. That was safe while the only subject was `session_id`: NOT NULL,
  FK'd to `workout_sessions`, an unguessable uuid. **`2026-08-31-nutrition-day-review-notes.sql`
  added `client_id`** — a uuid pointing straight at `auth.users`, and member uuids are
  ordinary knowledge (`community_posts.author_id`, `get_public_profile`, a coach's own
  roster). So any coach could UPDATE their own note's `client_id`/`snapshot_date` to a
  member they have no relationship with and have it render on that person's day.
- ⚠ **AND MY OWN COMMENT ARGUED FOR THE HOLE, WITH AN ACCURATE CLAUSE AND A BACKWARDS
  CONCLUSION.** It read *"UPDATE/DELETE are deliberately untouched (already
  `reviewer_id = auth.uid()` with no subject dependency, so a day note inherits edit +
  delete for free)"*. **"No subject dependency" was true and was the DEFECT** — I wrote it
  as the reason not to look. *A because-clause is a claim*, this file's own recurring
  lesson, and this one talked me out of the audit it should have triggered.
- ⚠ **OWNER MIGRATION — `2026-08-31-review-note-subject-freeze.sql`.** A BEFORE UPDATE
  trigger makes `session_id` · `client_id` · `snapshot_date` · `reviewer_id` **immutable**:
  editing a note's WORDS stays legitimate, repointing it at a different person never is.
  **A freeze, not a re-policy** — re-stating the INSERT policy's access checks in the
  UPDATE policy would put ONE security rule at a **third** site to keep in sync (INSERT
  policy, `can_access_review_note`, UPDATE policy), which is exactly the drift this
  migration set already warns about. ⚠ **`is distinct from`, never `<>`:** each subject
  column is NULL on the other's rows, and `NULL <> NULL` is NULL, which PL/pgSQL's `IF`
  reads as **false** — a plain `<>` would let a subject swap through the guard entirely.
  Privileged callers (service_role / supabase_admin / postgres, and a `service_role` JWT)
  are exempt so an ops repair or a later migration still works — the idiom lifted verbatim
  from `2026-08-16-created-at-freeze-and-application-dob.sql`. A structural `DO` guard
  asserts the trigger is installed and all four named columns still exist, so a rename
  cannot silently un-freeze one.
- ⚠ **AND THE FIRST CUT OF THAT FIX WAS A COMPLETE NO-OP — Codex found a P1 inside my
  P1, and it was right.** I copied the `is_privileged` idiom from the 08-16 migration and
  added **`security definer`**, which the original deliberately does not have. Under
  SECURITY DEFINER PostgreSQL sets `current_user` to the function **OWNER**, so
  `current_user in (…,'postgres')` is true for **every** caller: the early return fired
  unconditionally and the trigger enforced nothing while being installed, green, and
  guard-passing. **Measured, not argued** — one temp function each way called after
  `set local role authenticated`: **definer sees `postgres`, invoker sees
  `authenticated`.** The 08-16 file carries a comment saying exactly why it is invoker
  (*"this only mutates NEW and reads session-scoped request GUCs, which the security
  context does not affect"*); **I copied the guard and left its rationale behind** — the
  class this file already names. Fixed by dropping `security definer`, and the structural
  guard now **fails the apply on `prosecdef`**, so the no-op cannot return silently.
- ⚠ **AND THE PROBE THAT "PROVED" THE BROKEN VERSION WAS A THIRD INSTRUMENT FAILURE, OF A
  NEW KIND: it mirrored the function's BODY into a temp function and not its
  DECLARATION.** The shipped file said `security definer`; the probe's copy did not — so
  it exercised invoker semantics and reported `BLOCKED` for a function that, as shipped,
  could not have blocked anything. A body-only mirror is a different function. **Mirror
  the whole declaration — language, security context, `set` clauses — or the probe is
  testing something you are not shipping.** Re-run with the full declaration mirrored and
  the privilege trap removed: `body-edit=ALLOWED · retarget-client=BLOCKED ·
  retarget-day=BLOCKED · reattribute=BLOCKED · day-to-session=BLOCKED`, plus both
  privileged paths still open (`ops-repair=ALLOWED · service-jwt=ALLOWED`). Every probe
  rolled back by raising.
- ⚠ **VALIDATED BEHAVIOURALLY ON THROWAWAY TEMP CONSTRUCTS — and the first probe was the
  broken instrument, not the code.** Using `set_config('role','authenticated', true)`
  performs a real SET ROLE, which stripped `authenticated`'s privileges on the
  postgres-owned temp table; every UPDATE failed with a genuine **42501
  insufficient_privilege** that my `when sqlstate '42501'` handlers mislabelled as the
  freeze firing — including the legitimate body edit, which must be ALLOWED. **The
  saturated identical result across all five arms was the tell**, the same rule this file
  records for a saturated bundle grep. Re-run without the role switch, the trigger's own
  logic under test: `day-body-edit=ALLOWED · session-body-edit=ALLOWED ·
  retarget-client=BLOCKED · retarget-day=BLOCKED · day-to-session=BLOCKED ·
  reattribute=BLOCKED · session-to-day=BLOCKED`. The whole probe rolled back by raising.
  **Nothing shipped is broken by the freeze**: `addCoachWorkoutReviewNote` is the only
  writer and it is INSERT-only.
- ⚠ **P2 — `.limit()` IS APPLIED BEFORE THE CLIENT FILTER, so a wearable-only roster hid
  every real nutrition day.** `listClientNutritionDays` read 40 rows newest-first and THEN
  dropped the ones with no `calories`/`protein_g` in JS. PostgREST applies the limit
  server-side, so a roster whose recent snapshots are sleep/steps rows fills the window and
  the queue renders **empty** for a nutritionist whose clients genuinely logged meals — the
  honest-empty state, arrived at dishonestly. The predicate now travels with the query
  (`.or('calories.not.is.null,protein_g.not.is.null')`, **before** the limit); the strict JS
  predicate stays the authority, because `not.is.null` admits `''` and non-finite strings
  and this file has paid for `Number(null)`-class fabrications more than once.
- ⚠ **P2 — THE CATCH TURNED A FAILED INSERT INTO "SAVED", AND MY OWN COMMENT SAID SO.**
  `saveNote`'s catch appended a fabricated `localNote` and cleared the composer, so a live
  insert that **threw** rendered in the list, vanished on the next load, and the coach never
  knew. The comment three lines above it read *"refuse here too, because the catch below
  turns a failed insert into a plausible 'saved' message"* — I had **named the defect and
  then guarded only the `notesBlocked` case instead of fixing the catch.** Now: nothing is
  appended, the draft stays in the textarea, and the failure is stated
  (`coach:review.noteFailed` ×13). ⚠ **The two honest local paths are untouched and that
  distinction is the whole fix** — a demo row (no live subject) and the data layer's own
  `{stored:'local'}` return both genuinely persist; **a THROW is the one shape where the
  words exist nowhere but the textarea.**
- **5/5 mutations killed**, sanity green at both ends and the tree restored with `cp`
  backups: the catch appending again · the catch clearing the draft · the query predicate
  dropped · the predicate moved AFTER the limit · a locale authoring a whitespace-only
  failure line (which renders the **raw key** under `returnEmptyString: false`, on the one
  line telling a coach their words were not saved).
- **Verified:** `npm test` **2630/2630** · `tsc --noEmit` 0 · JSX parse · `node --check` on
  the data layer · catalog parity 6/6 ×13 (a pure append — 2 insertions / 1 deletion per
  file, LF, zero CR) · mobile build 0 with **the query predicate and both the call site and
  all 13 translated values confirmed in the emitted bundle** behind a **positive control**
  (`coach:review.mealLog`) **and a negative control** (a key that does not exist), and the
  minified catch confirmed to close immediately after the failure line — no append survives
  minification.

### 2026-08-31 — Five merch items leave the store, and every tier reward was unclaimable

- ⚠ **THIS SHIPPED IN #1988 WITH NO CHANGELOG ENTRY AT ALL** — three migrations, five test
  files, the charging authority and both website store surfaces, recorded nowhere. Written
  up here on 2026-08-31 while composing the second handoff. **A PR whose title names three
  things and whose changelog records one is the stale-record class this file keeps
  post-morteming**, and it happened inside the same PR that also merged past three unread
  Codex findings.
- **The removal (owner call).** Five merch items leave the Shape Store — Training Tee ·
  Crewneck · Training Bottle · Canteen · Gym Towel. **Shape Merch is now the two caps.**
- ⚠ **A UI/TS REMOVAL WOULD HAVE BEEN HALF THE CHANGE, BECAUSE THE TABLE DOES TWO JOBS.**
  `public.store_catalogue` is the **CHARGING AUTHORITY** — the redeem RPCs ignore the
  client-supplied cost and look the price up — *and separately* it is the set
  `claim_tier_reward()` validates a free tier pick against. So
  **`2026-08-31-store-merch-removal.sql`** deletes the live rows **and repairs the two tier
  rewards that pointed at them**: `tempo_drinkware` is removed outright (BOTH its options
  were gone, so nothing could fulfil it) and `legend_merch` loses the tee and crewneck,
  keeps the caps, and is renamed off "Premium Shape merch" — which no longer described what
  ships. **Deleting the rows without touching the defs would have left a member choosing a
  tee, entering a shipping address, and only then getting `bad_choice` — a dead choice,
  which is worse than a missing one.**
- **Measured read-only against production before writing it**, so nothing below is
  destructive to existing member data: `store_redemptions` **0 rows** · `tier_rewards`
  **0** · `score_ledger` **0** · **zero** foreign keys into `store_catalogue`. This is the
  removal landing before anyone can hit it.
- ⚠ **AND UNDERNEATH IT, A LIVE P1: EVERY TIER REWARD WAS UNCLAIMABLE.**
  `claim_tier_reward` writes the member's free unlock as a redemption at **`cost_points =
  0`**, while `store_redemptions` has carried `check (cost_points > 0)` since
  `2026-06-08-store-redemptions.sql`. So **merch and voucher alike raised 23514**, which
  falls past every named branch in `/api/store/tier-rewards` and surfaces as a generic 500
  **"Claim failed."** — a member who earned a free cap taps claim, types their shipping
  address, and is told nothing at all about why it failed. The whole
  ladder-unlocks-real-things feature was dead on arrival.
- **PROVEN BEHAVIOURALLY AGAINST PRODUCTION, not read off the source.** Impersonating a
  real member with a seeded `legend_merch` unlock, inside a transaction ended by a
  deliberate raise so nothing persisted: a **removed tee → refused `22023 bad_choice`**
  (the merch removal working correctly) and a **surviving cap → `23514
  store_redemptions_cost_points_check`** (this bug).
- ⚠ **LATENT, NOT DORMANT BY DESIGN.** `score_ledger` is empty, so no member holds points,
  so `award_tier_bonuses` has never minted an unlock and `not_unlocked` fires first. It
  goes live the moment the first member crosses **Tempo (750)** — i.e. the feature would
  have broken for the first person who ever earned it.
- **`2026-08-31-tier-reward-claim-cost.sql` is bounded, and BOTH halves of the boundary are
  pinned** (`tests/store-redemption-zero-cost.test.mjs`): `store_redemptions` must **admit
  0** — or a free claim cannot be written at all — while `store_catalogue` must stay
  **> 0**, or a PAID item could price at nothing. Widening only the first half would have
  traded an unclaimable reward for a free-shop hole.
- ⚠ **A MIGRATION IS REPLAYABLE, SO THREE OLDER FILES HAD TO BE CORRECTED TOO.**
  `2026-06-30-store-server-authoritative-pricing.sql`, `2026-07-20-store-reprice-150.sql`
  and `2026-07-20-tier-rewards.sql` each still seeded a since-deleted item or still offered
  it as a tier-reward choice. **Proven, not assumed:** replaying the 07-20 function body
  against production (rolled back) **restored `tempo_drinkware`** — whose both options were
  deleted — and put the tee and crewneck back into `legend_merch`: **4 dead choices**.
- **This repo has paid for that exact class once already** — three migrations
  `create or replace`d `set_over_18()`, so replaying an older one reverted the column
  freezes (2026-08-16 round 14). The remedy is the same **both halves**: correct the older
  files **AND** scan the whole directory, because *a rule written down in a comment is not
  a rule anything checks*. `tests/store-migration-replay.test.mjs` does the scan, and its
  allowed set is **DERIVED from `src/lib/store-catalogue.ts`** — never hand-listed — so the
  next removal is covered with nobody remembering the file exists.
- **The four-layer parity gate still holds** (`tests/store-catalogue-sync.test.mjs`): the
  TS authority · the migration · the mobile list · the website list must agree on
  id/retail/cost/credit-rate, so a removal cannot land on three surfaces and miss the
  fourth.
- ✅ **BOTH MIGRATIONS APPLIED + VERIFIED LIVE 2026-08-31** (owner ran them; re-verified
  against production while writing this entry): `store_catalogue` is **14 rows** with merch
  = exactly `merch_cap_black` + `merch_cap_white`, the five removed ids are **gone**,
  `tier_reward_defs()` returns no `tempo_drinkware` and `legend_merch` reads "Shape Cap"
  over the two caps, and `store_redemptions_cost_points_check` now reads
  **`cost_points >= 0`**.
- **Also in #1988 and equally unrecorded — the member profile's full-bleed hero cover.**
  With a cover image set, the Terrain hero's photo now fills the **whole** ascent band and
  the ridge draws over it in fixed cream under a four-stop scrim (the house
  dark-overlays-over-cover-photos pattern); the phase eyebrow rides the cover when both
  exist. **With no cover the ridge inks straight on the paper, exactly as before** — the
  no-cover path is byte-identical, so nothing changed for the accounts that have not set
  one.

### 2026-08-31 — Consumer social brand-awareness plan: run the brand AS the radio station

- **New [`marketing/social-brand-awareness-plan.md`](../marketing/social-brand-awareness-plan.md)** —
  the first CONSUMER-facing marketing doc (the five existing files in `marketing/` are the
  coach funnel). TikTok + Instagram, organic-only (the market-research doc's own math forbids
  paid), with **Shape Radio as the master concept**: don't market the radio feature — run the
  socials as the station. Segments (Morning Dispatch · Request Line · HR→BPM demo · coach
  Guest-DJ residencies · Shape Sets countdown · nightly Sign-off), Nora as host, the founder
  as the human resident, 12 scripted first videos, platform playbooks, flywheels (the shipped
  share card · the ident as public audio · residencies-as-recruiting), and a 30-day runway.
- ⚠ **The licensing guardrail is stated up front**: no commercial music baked into brand
  video, ever — idents + Nora's voice + link-outs, the app's own Peloton-lesson architecture
  applied to marketing. And **no faked community** — the honest-data doctrine extends to
  camera.
- Docs-only; rode the open PR #1988 as a records commit.

### 2026-08-31 — A nutrition day can carry a coach's note (the app half) — the composer is PROBED, not asserted

- **The registered follow-up, built.** The owner applied
  `2026-08-31-nutrition-day-review-notes.sql`, so a nutritionist can now write a review note
  on a client's nutrition day and read it back: `listClientNutritionDays` attaches that day's
  existing notes, `addCoachWorkoutReviewNote` gained a **day-subject** path, and the composer
  is un-gated the moment the schema can take the note. No new route, no new i18n key.
- ⚠ **`notesBlocked` IS PROBED, NEVER ASSERTED — and that is the whole shape of the cut.**
  The schema half can be applied either side of a deploy, so the flag comes from **asking the
  schema** (`select client_id, snapshot_date … limit 1` on the notes table) rather than from a
  literal that describes whatever was true the day it was typed. It **fails CLOSED**: anything
  but a clean read hides the composer, because that is the only direction that cannot lie —
  an insert against missing columns fails, and the caller's catch reports **"saved locally"**
  for a write that saved nowhere, which is the exact shape this whole wave exists to end.
- ⚠ **ONLY THE SETTLED ANSWER IS CACHED.** `42703` / `PGRST204` means the migration has not
  run — a fact, cached for the session. **Anything else is transient and deliberately NOT
  cached**, so one network blip cannot hide a shipped feature for the rest of the session. A
  probe that memoised every failure would be a worse defect than the one it replaced.
- ⚠ **THE NATURAL KEY HOLDS AT THE RENDER TOO, NOT JUST IN THE SCHEMA.** The note is addressed
  by **(clientId, loggedOn)** — never `selected.id`, the `daily_health_snapshot` row id, which
  is a ROW identity: that table is UPSERTed on `(user_id, snapshot_date)` by the member's own
  logging, so a note keyed to the row would be cascaded away by any writer that replaced
  rather than updated. The day's notes are re-paired from the two `in` filters on that same
  key. Pinned in both directions — the guard **bans** `selected.id` as a day key.
- **The XOR is refused client-side as well as CHECK'd server-side**: a note carries a session
  **or** a client's day, never both, never neither — so the app can never send a row the DB
  constraint will reject, and no caller can quietly write an ambiguous one.
- ⚠ **THE DEMO PATH STOPPED FIRING A DOOMED REQUEST.** A demo row carries no live subject, so
  it used to reach the writer, throw, and land in the catch — which set the **raw error string**
  as the status line. It now resolves to `null` up front and appends locally with the demo
  message. Same outcome, stated rather than arrived at by failure.
- ⚠ **AND THE GUARD THAT PINNED THE OLD TRUTH WENT STALE WITH THE SCHEMA IT DESCRIBED.**
  `tests/coach-review-source.test.mjs` asserted `notesBlocked: true` — a **limitation** pinned
  as a fact — so the guard would have kept the composer hidden after the migration made it
  wrong. It now **bans a hardcoded value in EITHER direction** and requires the derivation +
  the probe + the `42703` distinction. *A guard that pins a limitation outlives the
  limitation* — the same class as the cut-54 spelling pin, one layer up.
- **The notes read is best-effort like names + targets**: a failed lookup degrades to a
  note-less day, never drops the day itself.
- ⚠ **THE POSTGREST SCHEMA CACHE IS THE ONE DEPLOY RISK, AND IT WAS CHECKED RATHER THAN
  ASSUMED.** A stale cache would answer `42703` after a correct apply and settle the probe to
  `false` for the session. Verified live: **2 `pgrst%` event triggers** (`pgrst_ddl_watch`) are
  installed, so the cache reloaded with the migration — and both day columns are present with
  **0 notes rows**, so the feature starts empty rather than mid-state.
- **The honest redaction line is unchanged and now effectively unreachable in production** —
  it renders only where the schema lacks the columns, which is exactly the deploy-ahead-of-
  migration case it was written for. No catalog change, so no parity risk.
- **6/6 mutations killed**, sanity green at both ends and the tree restored with `cp` backups:
  `notesBlocked` hardcoded back to `true` · the day payload dropping `session_id: null` · the
  writer allowing two subjects · the probe renamed away · the day keyed by the snapshot row id
  · `saveNote` dropping its refusal.
- **Verified:** `npm test` **2627/2627** · `tsc --noEmit` 0 · JSX parse · `node --check` on the
  data layer · mobile build 0 with **the probe select, both settled error codes, both XOR
  refusals, the notes read and `notesBlocked:!s` (derived, not literal) confirmed in the
  emitted bundle** behind a **positive control** (`coach_workout_review_notes`, present in 2
  chunks) **and a negative control** (a string that does not exist) — a saturated zero is the
  instrument until proven otherwise.

### 2026-08-31 — A nutrition day can carry a coach's note (the schema half)

- **The registered follow-up from the review-queue fix, built.** `coach_workout_review_notes`
  was structurally a WORKOUT path: `session_id` NOT NULL with an FK to `workout_sessions`,
  and every policy routing through `can_access_workout_session(session_id)`. There was no
  row shape that says *"this note is about the client's Tuesday"*, so the source fix had to
  hide the composer and refuse the write — the insert would have failed **23502** and the
  existing catch would have reported **"saved locally"** for a write that saved nowhere.
- ⚠ **OWNER MIGRATION — `2026-08-31-nutrition-day-review-notes.sql`.** `session_id` goes
  nullable (FK kept), the table gains `client_id` + `snapshot_date`, and a CHECK enforces
  **exactly one subject** — a session or a day, never both, never neither, so no row can be
  ambiguous about what it is a note on.
- ⚠ **THE DAY IS KEYED BY `(client_id, snapshot_date)`, NOT BY THE SNAPSHOT ROW'S `id`.**
  `daily_health_snapshot` is UPSERTED on `(user_id, snapshot_date)` by the member's own
  logging, so its surrogate id is a ROW identity, not a DAY identity — any writer that ever
  replaced rather than updated would silently cascade a coach's note away. The natural key
  is the thing the note is actually about, and it survives a rewrite of the snapshot.
- ⚠ **THE ACCESS STORY IS THE HALF THAT CANNOT BE COPIED FROM THE SESSION PATH.**
  `can_access_workout_session` gates on the SESSION's own provider — a session names the
  coach who owns it. **A day names nobody**, so the day branch gates on the coaching
  RELATIONSHIP instead: read = the member themself or any active coach on them
  (`is_coach_on_client`, the predicate the coach-side snapshot reads already run on); write
  = the reviewer must own the provider row they declare AND that declaration must be a live
  coaching link of the **same discipline** (`is_discipline_coach_on_client`). So a
  nutritionist writes as a nutritionist, a trainer as a trainer, and a coach with no active
  subscription to that client writes nothing at all.
- **One predicate, not three re-statements.** A policy cannot branch on a nullable FK without
  re-stating the security rule at every site, and three sites re-stating one rule is how the
  halves drift apart — `can_access_review_note(session_id, client_id)` is the single answer,
  and its `else false` fails **closed** if the CHECK were ever removed. The session branch is
  preserved byte-for-byte; UPDATE/DELETE are deliberately **untouched** (already
  `reviewer_id = auth.uid()` with no subject dependency, so a day note inherits edit + delete
  for free, and touching them would be a widening nobody asked for).
- ⚠ **VALIDATED AS AN ARTIFACT, NOT AS PIECES** (the #1853 lesson): the whole file applied
  inside a transaction against production and **rolled back**, its own structural guard
  passing, prod confirmed untouched afterwards. A behavioural probe in the same transaction
  drove the CHECK over five shapes — subject-less, two-subject and dateless-day all
  **REJECTED (23514)**; a day note and a session note both insert. ⚠ The first probe was the
  broken instrument, not the code: `like … including constraints` **without `including
  defaults`** left `id` null, so a NOT NULL fired before the CHECK it was testing. And the
  guard's `search_path=public, pg_temp` literal was **read off two live pinned functions**
  rather than assumed — a wrong literal there fails a CORRECT apply, which is the worst way
  for a guard to be wrong.
- **Measured before writing:** `coach_workout_review_notes` **0 rows** (the CHECK validates
  against nothing; no backfill owed) · `workout_sessions` 0 · `daily_health_snapshot` 1 ·
  not in the realtime publication.
- ⚠ **SHIPPED THE SAME DAY — see the entry above; the design named here is what was built.**
  ⚠ **THE APP HALF IS THE NEXT CUT, AND UNTIL IT LANDS THIS CHANGES NOTHING A COACH SEES.**
  `shapeBackend.js` still stamps `notesBlocked: true` on every nutrition day, the composer is
  still gated on it and `saveNote` still refuses — which is the safe direction, because a
  composer that renders before the owner has applied the migration is exactly the
  "saved locally" lie this closes. The honest wiring is a **feature probe on read** (ask the
  schema whether the day columns exist, set `notesBlocked` from the answer) so the composer
  appears exactly when the schema can accept the note, in either deploy order.

### 2026-08-31 — The nutritionist's review queue was serving the trainer's workouts

- **A live nutritionist's whole "Client review." feature read `workout_sessions`.**
  `BSWorkoutReviewPage` called `window.ShapeWorkoutLogs.listSessions()`
  **unconditionally**, so the queue a nutritionist opens to review meal logs listed
  their clients' *sets and rest times* under a nutrition title. Each coach role now
  reads its own source: a nutritionist reads meal-log days
  (`ShapeNutritionLogs.listClientDays` → `daily_health_snapshot`), a trainer reads
  workout sessions. **No migration** — nutritionists can already read their
  subscribed clients' snapshots (`providers_read_subscriber_snapshots`).
- ⚠ **THE REASON IT SURVIVED IS THE PART WORTH KEEPING: the demo rows were the only
  thing that ever looked like nutrition.** `demoWorkoutReviewSessions('nutritionist')`
  returns kcal/protein/meal rows, so signed out the page reads correctly and every
  screenshot of it is right. The defect existed **only on a live account**, which is
  the state nobody demos. A demo that models the shape you WANT hides the fact that
  the live path never produces it.
- ⚠ **THREE HONESTY RULES ARE IN THE DATA LAYER, NOT THE RENDER**, because a caller
  that gets any of them wrong fabricates a client's nutrition. **(1)** Own rows are
  EXCLUDED — that policy ORs with `user_rw_own_snapshots`, so an unfiltered select
  hands the coach their own days back as a client. **(2)** A day counts only when it
  carries a REAL nutrition log (`calories` or `protein_g` present) — a snapshot row
  can exist for sleep or steps alone, and treating one as a nutrition day renders
  "0 kcal", which reads as a client who ate nothing. **(3)** Targets come from the
  coach's OWN prescription (`client_programs.detail.nutrition`) and are **null when
  unset, never a default** — the validation mirrors `/api/client/plan`'s `asTarget`
  exactly, so the coach queue and the client's own Eat hero cannot disagree about
  what the target is.
- ⚠ **TWO THINGS THE LIVE DAY GENUINELY CANNOT DO ARE STATED, NOT FAKED.**
  **(a) There is no per-meal detail to show** — meal logging accumulates into day
  totals through `add_meal_macros` and no per-meal row is kept anywhere
  (`client_planned_meals` is planned-only, owner-RLS, 0 rows). So the day renders a
  `BSTRedact` line saying totals-only, and the queue row **leads with kcal** rather
  than a fabricated `0/0 MEALS`. **(b) A nutrition day cannot carry a review note** —
  `coach_workout_review_notes.session_id` is NOT NULL with an FK to
  `workout_sessions.id` and every policy on it routes through
  `can_access_workout_session(session_id)`, so the insert would fail and the existing
  catch would report **"saved locally"** for a write that saved nowhere. The composer
  is hidden with an honest line and `saveNote` refuses; the row declares
  `notesBlocked` in the data layer so the render never has to infer it.
- ⚠ **AND THE SWEEP FORCED OUT THE TOKEN/LABEL CLASS AT A SIXTH SITE.** Read from
  the LIVE catalog rather than a migration file: `workout_sessions.status` is
  `text NOT NULL DEFAULT 'completed'` with a CHECK pinning it to
  **planned|active|completed|abandoned|reviewed** — a STORED TOKEN the queue was
  printing straight to screen, so a Russian trainer read the English word
  *completed* on their own queue. Worse, **two sites each spelled the fallback
  themselves** (`selected.status || 'completed'`), which is one fact with two
  spellings. Both now resolve through one label map; the token is untouched, and an
  unrecognised value renders as **ITSELF** — never a raw key, never blank (the
  grocery-aisle precedent), so the demo rows' free-text statuses read as themselves.
- **A pre-existing unit bug went with it:** the protein target welded a hardcoded
  Latin **`G`** onto the figure, which is wrong in ru/uk (`г`) — it reads from
  `coach:review.unitGram` now, like every other unit on the page. The queue row's
  aria-label also stopped running a locale-insensitive `.toLowerCase()` over
  translated text (`.toLocaleLowerCase(coachLocale())`).
- ⚠ **`snapshot_date` IS PARSED PART-BY-PART.** It is the member's OWN `YYYY-MM-DD`,
  and `new Date('2026-08-31')` is UTC midnight — it renders as the **30th** anywhere
  west of UTC, so a coach in Los Angeles would read every client's day off by one.
- **15 new `coach:review.*` keys ×13** (5 status labels + 10 chrome/unit/redaction),
  every per-locale term read out of that catalog's own shipped vocabulary rather than
  invented — `id` writes `KKAL`, ru/uk write `ККАЛ` / `Г` / `Л`, ha is genuine Hausa
  orthography, pcm is real Naija grammar.
- ⚠ **THE RATCHET DEFENDS ALMOST NONE OF THIS, WHICH IS WHY THE GUARD IS THE REAL
  DELIVERABLE.** A source swap moves the measurement by **ZERO strings** — reverting
  the role branch leaves the inventory, `tsc`, the build and all 2,620 other tests
  **green**. `tests/coach-review-source.test.mjs` pins what the code ANSWERS: each
  role reaches its own source *as the two arms of one `isNutri` branch*, the note
  block holds in **both** directions (composer hidden AND writer refusing — half of
  that passing is the dangerous state), the status token is never rendered raw, and
  the label set is **DERIVED from the resolver in the shipped source** so a sixth
  CHECK'd token added later fails here rather than rendering as itself forever.
- ⚠ **AND MUTATION-TESTING CAUGHT THE GUARD BEING WRONG, NOT THE CODE.** A key match
  without a closing-quote boundary let a **RENAME** survive — `mealsNotStoredX` still
  contains `mealsNotStored`. Anchored, then re-run against both a rename **and** a
  deletion. **8/8 mutations killed** (role branch reverted · `saveNote` guard dropped
  · composer gate dropped · resolver renamed away · redaction key renamed · redaction
  deleted · nutrition day claiming 'completed' · an `en` status key deleted), sanity
  green at both ends and the tree restored with `cp` backups, never `git checkout --`.
- **The ratchet moved on the partial columns only, and that is the certification.**
  `BSWorkoutReviewPage` leaves PARTIAL for **fully covered**: `partStrings`
  **170 → 168** · `part.length` **35 → 34** · fully covered **114 → 115**, while
  `noneStrings` **818** and `none.length` **96** are UNCHANGED — nothing left the
  untranslated bucket, because the surface already carried 53 `tr()` calls. It held
  exactly TWO walk-visible strings and both were leaks rather than prose.
- **Verified:** `npm test` **2626/2626** · `tsc --noEmit` 0 · JSX parse · `node --check`
  on the data layer · catalog parity ×13 (a pure append — 940 → 955 per file, identical
  key order in every locale, LF, zero CR, zero empty values) · mobile build 0 with **all
  15 keys and both sources confirmed in the emitted bundle** (`ShapeNutritionLogs` +
  `listClientDays` in the data-layer AND pros chunks, so the branch survives
  minification) behind a **positive control** (`coach:review.mealLog`, present) **and a
  negative control** (a key that does not exist, absent) — a saturated zero is the
  instrument until proven otherwise.
- ⚠ **REGISTERED, NOT BUILT — a nutrition day still cannot take a coach's note.** The
  honest line is the stopgap; the fix is an owner migration relaxing
  `coach_workout_review_notes` off its `workout_sessions` FK (or a parallel
  nutrition-note path), which is a schema change with its own RLS story and belongs in
  its own cut rather than bolted onto a source fix.

### 2026-08-31 — Session handoff: `docs/HANDOFF-2026-08-31.md`

- **Thirty PRs since the last handoff — #1957 → #1986 — had none.** The 08-29 handoff
  (#1956) covered through #1955; everything after it is the **i18n wave** (cuts 1–17),
  **five token/label splits** (Train tag · grocery aisle · primary goal · Settings pref
  options · profile pin kinds and prompts), **two widenings of the measurement itself**
  (`TEXT_PROPS` 7 → 15 plus attribute expressions; `export` unwrapping + `ClassDeclaration`),
  the comment-stripper consolidation, and a long run of register corrections.
- **Handoff: [`docs/HANDOFF-2026-08-31.md`](HANDOFF-2026-08-31.md)** — state snapshot, the
  30-PR table, **the cut machinery** (the eight-step order, the nine blind shapes, the traps
  now gated), the next work **ranked and measured** rather than recalled, the seven owner
  rulings outstanding, and every registered-not-built follow-up.
- **State, all re-measured rather than carried forward:** suite **2614/2614** · `tsc` 0 ·
  ratchet 9/9 (359 rendering JSX · 114 fully covered · 35 partial / 170 strings · 96
  uncovered / 818 strings) · **no open PRs** (the authoritative nothing-in-flight proof) ·
  **no migrations owed** · 13 locales × 18 namespaces × 4,146 `en` keys = **53,898 values**.
- ⚠ **AND THE HANDOFF'S OWN CITATION FORCED A RECORDS CORRECTION — the toast figure was a
  MENTION count wearing an invocation count's name, and its own breakdown proved it.** The
  records carried **275** `window.__bsToast` call sites with the breakdown *"197 client · 28
  pros · 16 calendar · 10 main · **8 chrome** · 6 habits · 6 marketplace · 4 data layer"* —
  but the chrome (`iosAppBroadsheet.jsx`) contains **ZERO invocations**: 6 comment lines
  quoting the call shape, the no-op definition, and the `delete`. The 2026-08-30 correction
  claimed it re-measured `window.__bsToast?.(` invocations *"matching the per-file breakdown
  above exactly"* — a method that **cannot** reproduce that breakdown, i.e. a method asserted
  rather than run. **Re-measured: 266 real call sites** (client 196 · pros 28 · calendar 16 ·
  main 10 · habits 6 · marketplace 6 · data layer 4), with the method written down so the
  next reader can re-derive it.
- ⚠ **AND THE RE-MEASUREMENT FOUND A SECOND CALL IDIOM THE RECORD NEVER MENTIONED.** Eleven
  sites use the guard form `window.__bsToast && window.__bsToast(…)` rather than the optional
  chain — so a `?.(`-only sweep **undercounts by 11** while a raw-mention sweep **overcounts
  by the chrome's 8**, and the old figure happened to land near the truth by cancelling one
  error against the other. Corrected at all four sites that quote it (the canonical cut-3
  entry, cut 17's two restatements, and the War Room item). *A figure nobody re-derived,
  quoted forward* — this file's own recurring lesson, paid for again.

### 2026-08-31 — i18n cut 17: the weekly stake, and a 50-point bet that failed in silence

- **The card a member puts points at risk on is localized.** `BSCommitmentCard` — the Score
  page's weekly commitment (stake 5–50 points on a target, hit it for a bonus, miss it and
  lose the stake) — carried **zero `tr()` calls**. **42 new `score:commit.*` keys ×13**
  (546 values); it leaves UNCOVERED for **fully covered**. No migration, no route change.
- ⚠ **AND THE CUT'S REAL FINDING IS NOT THE COPY — BOTH WRITES REPORTED FAILURE INTO A
  VOID.** `window.__bsToast` is a live **no-op** (`iosAppBroadsheet.jsx:1364` keeps the
  global as `() => {}` so the ~266 imperative callers stay safe — toasts were switched off
  app-wide by #938), while **`setCommitment` and `acceptCommitment` are BOTH fully
  try/caught in the data layer**, so every failure — no session, an RPC error, a
  pre-migration PGRST202, a thrown fetch — resolves to `{ok:false}` / `{accepted:false}`
  rather than rejecting. So a member staked points, tapped **Lock it in**, watched the
  button flip back from *Setting…*, and was told **nothing at all**. ⚠ **And `accept()` had
  no failure branch whatsoever** — the coach-proposed path could not report even if the
  toast worked. Failures now route through **`bsAskConfirm` notice mode**, the sanctioned
  replacement built precisely because the sink is dead.
- ⚠ **THE TWO SUCCESSES DELIBERATELY STAY TOASTS, AND THAT IS THE RULE, NOT A SHORTCUT.**
  Notice mode's own comment reserves it for *a transient failure the member needs to know
  about* and forbids it for a **success confirmation** — that is exactly the popup noise
  #938 removed. The sheet closing and the card re-rendering with the commitment IS the
  confirmation. Pinned in both directions: the success path must use the toast and must
  **not** call `notice()`.
- **This is the toast-sink question answered one site at a time**, which is what the
  register asked for: not *revive the sink* (a product decision about 266 call sites) but
  *which of those carry a failure a member must see*. A staking action is the clearest yes
  in the app.
- ⚠ **FOUR STATUS KEYS, NEVER ONE FRAME WITH `{status}`.** `c.status` is the **STORED
  token** the row is keyed by (`met` / `missed` / `proposed` / active) and is compared with
  `===` three lines down; interpolating it renders the raw English id as copy in twelve
  locales. **Cut 11 made the same refusal three times** over the goal doc's `kind` — this is
  the fourth site, and the first where the token also drives the row's colour.
- ⚠ **AND THE PLURALS FORCED OUT A HAZARD IN THE SHIPPED PARITY GATE ITSELF.** It compares
  ICU **argument names** via `/\{\s*([A-Za-z_][\w-]*)\s*[,}]/g`, so a plural branch whose
  whole body is one bare word — `one {workout}` — is **indistinguishable from a
  placeholder**. It survives pt-BR's `{mais # no plano}` only because that branch leads with
  a word **followed by more text**; a lone noun has no such tail. Worse, the gate compares
  the lists **with duplicates**, so ru/uk (four categories) can never balance en (two) once
  a placeholder repeats inside branches: folding `{done}/` into each branch gave en **2**
  `done` and ru **4**, and the pair could not be made to agree at all.
- **The fix is always in the DATA, never in the matcher** — shared prefix stays in the
  frame, every branch leads with the `#` the rest of the house already uses
  (`{done}/{target, plural, one {# workout} other {# workouts}}`). Closed forward with a
  derived guard over every locale × namespace, **measured at ZERO offenders when it
  landed**, so it starts clean rather than documenting a gap.
- ⚠ **AND THAT GUARD IS DERIVED FROM THE GATE, NOT RESTATING IT — the second cut, after
  mutation-testing.** Asking *"does this look like a bare word?"* with its own regex is a
  second matcher free to drift from the one it protects; the only question that matters is
  *"would `placeholders()` read it as an argument?"*, so the branch is handed to
  `placeholders()` wrapped in braces and the answer must be empty. That gets the script
  boundary right **for free**: the identifier class is ASCII (`\w` is ASCII without the `u`
  flag), so a Cyrillic `one {привычка}`, a Vietnamese `one {tuần}` or a Hausa
  `one {ɗabi'a}` **cannot** be misread and are correctly not flagged. Recorded at the site
  as a **documented equivalent mutant** (the Cyrillic case survives, the Latin one is
  killed) so the next reader does not "fix" it into a Unicode-aware test that would fail
  correct catalogs for a gate reason that does not exist.
- ⚠ **28 IS A FLOOR FOR TWO BLIND SHAPES AT ONCE.** The two stepper labels sit in a **LOCAL
  array literal** the walk never attributes (cut 9's shape), and the three failure sentences
  are **plain JS that never reaches JSX** (cut 2's). So the ratchet can only ever move by
  the strings it can see, and the 42 authored keys are the honest count of the work.
- **The ratchet moved on the two axes it should and not on the others.** `noneStrings`
  **846 → 818** · `none.length` **97 → 96** · fully covered **113 → 114** — while
  **`partStrings` 170 and `part.length` 35 are UNCHANGED**, the assertion that says the cut
  is finished rather than half-done.
- **Every per-locale term was READ OUT OF THE SHIPPED CATALOGS rather than invented** —
  ha `alkawari` (⚠ never `caca`: the literal word for a bet reads as *gambling*, the ruling
  this file already recorded for the Score page) · `motsa jiki` · `ɗabi'a` · `Na gane`;
  pcm *"I don hear"*; ru `обязательство` / `ставка`; uk `зобов'язання` with the **straight
  apostrophe** its own catalogs use; tr `taahhüt` with the **colon construction**
  (`Azalt: {field}`) so no case suffix is ever glued to a `{placeholder}` — while `0'ın` on
  a literal numeral stays, because that one is correct Turkish.
- **14/14 mutations killed** — ⚠ **and 3 of them survived the first pass, all three being
  the instrument rather than the code.** (1) The no-targets assertion used a lazy
  `[\s\S]*?` span that **ran on past its own branch** into the `} else {` and matched the
  GENERIC branch's `notice(` — so it passed with the notice it exists to prove **deleted**;
  each branch is sliced to its own block now. (2) The bare-word check flagged nothing for
  the Cyrillic mutant, which turned out to be **correct** (above) and is now recorded rather
  than "fixed". (3) `noneStrings left at 846` replaced the first literal `818` in the file —
  **the rationale comment nine lines above the assertion**; it landed in the file and not in
  the region under test. **Landing in the file is not landing where the guard looks** —
  this file's own rule, paid for again.
- **Verified:** `npm test` **2614/2614** · `tsc --noEmit` 0 · JSX parse · the ratchet 9/9 ·
  catalog parity **6/6** ×13 (a pure append — 42 insertions per file, LF, zero CR/NUL) ·
  mobile build 0 with **all 42 keys and all 546 translated values confirmed in the emitted
  bundle** behind a positive **and** a negative control plus an empty-haystack assertion,
  and `bsAskConfirm` present in that bundle · the ICU plurals driven through the **real
  i18next + i18next-icu runtime** over 8 locales × 14 cases (ru 25 → `ОЧКОВ` many, uk 25 →
  `ОЧОК` many, 2/3 → the few forms, ha `3/22 ɗabi'u`) with no leftover braces or `#`.

### 2026-08-31 — i18n cut 16: the profile customizer, and two deliberate non-keys

- **The sheet a member edits their own public profile in is localized.** `BSProfileCustomizer`
  — cover · headline stats · prompts · social links · the wall · the shelf · the pin · the intro
  film · the business card — carried **zero `tr()` calls**; it now carries **99 translator
  references** (95 of them direct `tr('profile:…')` calls), against **105 new `profile:` keys
  ×13**. The stored side already had its split — cut 54 gave the pin kinds and prompts tokens —
  so this is the string sweep on top of it, plus the two option tables the sweep had to reach.
  No migration, no route change.
- ⚠ **TWO TABLES ARE DELIBERATELY NOT FULLY KEYED, AND THAT IS THE CUT'S ONE JUDGEMENT CALL.**
  `'Shape Score'` in `BS_STAT_OPTIONS` and the five brand nouns in `BS_PROFILE_LINKS`
  (Instagram · X · TikTok · YouTube · Substack) are **byte-identical in all thirteen**, so keying
  them would ship thirteen copies of a string a translator must not touch — the same exemption as
  `BSAboutPage`'s founder signature and `BSSettings`' `AB` initials placeholder. Only **Website**,
  the one word a locale renames, carries a `tKey`. The guard pins **both directions**: a later
  sweep that "completes" the tables fails, and so does one that lets the exemption widen into
  *nothing is keyed*.
- ⚠ **THE PICKER AND THE PROFILE HERO NOW NAME EACH STAT THROUGH THE SAME KEY, AND THAT IS THE
  ASSERTION WORTH HAVING.** The hero resolves a stored stat key against **its own `stats` map**,
  built at two call sites — a pre-existing split this cut did not invent. Had the picker minted
  its own keys, a member would read one name **choosing** a stat and another **seeing** it, one
  tap apart. Pinned as an invariant over the shipped source rather than as a spelling.
- ⚠ **78 IS THIS WALK'S FLOOR, NOT THE SURFACE'S TRUTH — SO THE RATCHET DEFENDS ALMOST NONE OF
  IT.** **11 toast sentences** are plain JS the walk never enters (cut 2's lesson) and **13 more
  member-facing labels** sit in the two **module-scope array literals** it cannot attribute (cut
  8's). All 24 are keyed; **none of them ever counted**. Reverting any one leaves the ratchet, the
  parity gate and the whole suite green — which is why `tests/profile-editor-i18n.test.mjs`
  **evaluates the extracted tables and resolver** rather than grepping for spellings.
- ⚠ **A CUT-54 GUARD PINNED A SPELLING AND THIS CUT BROKE IT — CORRECTLY.** It asserted
  `bsPinKindLabel(k.id)`, the **one-argument** form, and threading the translator into the picker
  chips is exactly what makes them translatable. Re-pointed to assert what the code **answers**:
  the chip renders a **translated** label. Same lesson this file already records for the
  age-derive mirror — *a guard that pins an expression pins whatever that expression is wrong
  about.*
- ⚠ **AND THE NEW GUARD'S OWN FIRST CUT FAILED ON CORRECT CODE, TWICE — both times the guard, not
  the code.** A `[^\]]*` class **cannot cross the `]` inside `links[l.key]`**, so the save-path
  matcher missed a line that was right (the cut-6 aisle-ban trap, one file over); and a file-wide
  `>{x.label}<` ban fired on the **profile HERO**, which legitimately renders a `label` its caller
  **already translated**. Both were replaced with the key-parity invariant above. *A guard that
  fails is evidence about the guard until the code is read.*
- **The comment stripper is IMPORTED, never re-derived** — the canonical
  `tests/helpers/strip-comments.mjs`, whose own header records that the lazy
  `/\*[\s\S]*?\*\//` span opens a FALSE block on **`accept="image/*"` in this exact file** and
  swallowed 567,895 characters of it in an earlier guard.
- **The ratchet moves on three axes, and the fourth is the certification.** `noneStrings`
  **924 → 846** · `none.length` **98 → 97** · `part.length` **34 → 35** · `partStrings`
  **169 → 170** · fully covered **113**. ⚠ **`partStrings` RISING is the honest direction here**:
  the one literal `https://open.spotify.com/track/…` example was already on screen and already
  counted — in `noneStrings`, where the whole component sat. 77 became keys and **one changed
  column**. The component stays **PARTIAL by design** over that address, which no locale changes.
- **13/13 mutations killed**, sanity green at both ends and the tree restored byte-identically:
  the brand noun keyed · a real `tKey` dropped · a `tKey` typo'd · a label drifted from its
  catalog value · the member's record storing the **label** · the picker rendering the raw English
  label · the literal URL example keyed · the hero naming a stat through a **different** key ·
  selection comparing the rendered string · the resolver dropping its raw-key guard · dropping its
  try/catch · the editor unbinding the translator · a local shadowing it. ⚠ One first reported
  nothing because its anchor never landed (`count=0`) — re-anchored and killed. *A mutation is a
  broken instrument until it is proven to have landed.*
- **Verified:** `npm test` **2606/2606** · `tsc --noEmit` 0 · JSX parse · catalog parity ×13 (a
  pure append — **106 insertions / 1 deletion per file**, 244 → 349 keys, LF, zero CR/NUL, **zero
  empty values**) · mobile build 0 with **all 105 keys and all 1,365 translated values confirmed
  in the emitted bundle** behind a **positive control** (`profile:role.trainer`, a key that
  certainly ships) **and a negative control** (a key that does not exist), and with the minifier's
  `\xA0` escape normalized first — the cut-10 saturated-miss trap.

### 2026-08-31 — Three source guards were scanning source that had been deleted, and the fix already existed

- **`tests/helpers/strip-comments.mjs` has said "ONE implementation on purpose" since the day it
  was written**, because its own lazy `/* … */` predecessor "ran to the next `*/` hundreds of lines
  later and ate the function the caller asserts about". **Two guards written AFTER that warning kept
  their own copy of exactly that regex.** All three local copies are deleted; every source guard in
  the repo (15 files) now imports the one helper.
- ⚠ **THE BIG ONE WAS LIVE-SIZED AND MUTATION-PROVEN DISABLE-ABLE.** `pref-options-token`'s stripper
  opened a **FALSE block on `accept="image/*"`** — the `/*` inside a MIME-type string literal — and
  ran to the next `*/`. Measured on the shipped client file: **7 such blocks, 567,895 of 2,462,234
  characters swallowed** (the largest 36,221 chars, lines 11959–12467). Its two file-wide bans
  (*no reader keeps a local cut/build regex*) were therefore scanning a file with a quarter of itself
  removed. **Proven, not inferred:** a local `/fat ?loss|cut|lean/` planted inside a swallowed span
  **PASSED 13/13** with the old stripper and **FAILS** with the helper.
- ⚠ **AND THE GUARD-THE-GUARD IS THE PART WORTH KEEPING.** Reverting the *helper's* body to the lazy
  span — with the same regex still planted — makes the mutation **survive 13/13** again. So the
  helper's line-orientation is the load-bearing property, not the import; a future "tidy-up" that
  re-derives a spanning regex silently re-opens every one of these bans.
- **The second copy was smaller and in a worse place.** `signup-dob-persisted` guards the **18+
  signup surfaces**, and its lazy strip removed **78 characters of `shapeBackend`'s phone path and
  305 of `newdesign/signup.jsx`** from the bodies its *instant-comparison ban* reads — the ban whose
  own comment calls it "THE ANTI-REGRESSION THAT MATTERS MOST". ⚠ The huge spans in `supabase.js`
  (34,778) and `shapeBackend.js` (41,818) sit **outside** the sliced bodies, so they never mattered
  there — **which is why measuring the asserted bodies, not the files, is the honest instrument.**
  My first measurement compared whole-file slices and reported a marker as MISSING; that was the
  measurement being wrong, not the guard. *Check the check before believing the finding.*
- **Two because-clauses went stale in the same edit and were rewritten rather than left.**
  `profile-token-sync`'s comment still explained a line-only local copy that no longer exists, and
  `signup-dob-persisted`'s still credited a `:` lookbehind "keeping `https://` out of the
  line-comment rule" — a mechanism the helper does not have and does not need (a `//` line is a
  comment; `https://` mid-line is untouched). **A comment that explains a deleted implementation is
  a false claim about the code under it.**
- **The helper now records that its own warning came true**, with the measurement, so the next reader
  meets the evidence rather than the prediction.
- Verified: `npm test` **2598/2598** · `tsc --noEmit` 0 · the three affected guards 38/38 with
  **sanity green at both ends of the mutation batch** and the tree restored byte-identically ·
  tests-only diff (4 files), no product code touched.

### 2026-08-31 — The profile pin kind + prompt question split, and the first two-writer instance of the class

- **The pin KIND and the prompt QUESTION stop being the copy they render.** Both are STORED in the
  member's own `profile_custom` doc, COMPARED against the picker's chip/option list on every render,
  and RENDERED back as copy — the token/label class at a **fourth site**. A `tr()` on either picker
  would freeze one language into their own saved profile, exactly as a translated aisle name did.
- ⚠ **AND THE REGISTER WAS WRONG THREE WAYS, ALL FOUND BY READING THE CODE RATHER THAN THE REGISTER.**
  It reads *"`BS_PIN_KINDS` is bare strings"* — **1 array, 5 strings**. The real surface is **THREE
  arrays and 19 stored strings**: the 8 member prompt questions and the 6 coach ones are stored on the
  same record (`prompts: [{q, a}]`, where `q` IS the picked question) and rendered straight back off
  it, so they are the same class. It names **ONE** writer; there are **TWO live writers of one
  record** — the mobile customizer and the **website `livingDesktop.jsx` editor** — so a split on one
  surface alone would have left the other storing English into the same doc. And it never mentions the
  read path: **`get_public_profile` returns `profile_custom` as a WHOLE-DOC jsonb passthrough**, so
  unlike the primary-goal split there is **no server-side classifier** and no display mirror is needed.
- **The ideal home already existed, which is why this cut needed no new module and no new loader tag.**
  `public/newdesign/profileCustom.mjs` is already the canonical per-key normalizer for this exact doc
  and is already loaded on **all 7 profile pages** as `window.ShapeProfileLib`; the tables
  (`BS_PIN_KINDS`, `BS_PROFILE_PROMPTS`, `BS_COACH_PROMPTS`) and the four helpers land there, and the
  mobile shim re-exports them. The `?v=` on the module tag was bumped by hand on all 7 pages — the
  precompile rewrites **`text/babel`** tags only, so a `<script type="module" src>`'s hand-written
  `?v=` IS the live cache key.
- ⚠ **THE LABEL RESOLVES LEGACY ENGLISH TOO, WHICH IS WHERE THIS DIVERGES FROM CUT 14.** The pref rows
  had free-text neighbours; here the **only writer is a fixed picker**, so every value on disk is one
  of the 19 shipped strings — resolving them means every existing doc reads the translated label
  **without a re-save**. Free text still passes through unchanged, so the demo profiles' own questions
  (*"Why I train"*, *"The lift I love"*, …) render as **themselves**: never blank, never a raw key.
- ⚠ **ONE PROMPT LOOKUP SERVES BOTH ROLE LISTS, AND THAT IS PINNED RATHER THAN ASSUMED.** The render
  does not know whether it is showing a member or a coach profile, so a single `bsPromptLabel` walks
  the union — which is only safe while the **14 ids are unique across both lists**. A collision would
  silently resolve a coach question to a member label, so the guard asserts uniqueness directly.
- ⚠ **ZERO CATALOG KEYS, DELIBERATELY — AND THAT IS THE `BSIntentStep` RULING, NOT AN OVERSIGHT.**
  `BSProfileCustomizer` holds **no `tr()` calls at all** (the ratchet's UNCOVERED set), so a translated
  chip beside an untranslated editor would read as a defect. Both helpers take an **optional**
  translator and fall back to the table's own English; the profile **renders** do pass `tr`, so the cut
  is a pure data-shape change with no visible difference today. The translator lands with the sweep.
- **The website carries local `[{id, en}]` fallbacks** for the module's loading race, in its established
  `(plib && plib.X) || fallback` style — ⚠ **and pinning the TABLES alone would not have been enough**,
  because the fallback path has its own `fold`/`find`. The guard extracts those three functions from
  the shipped file and drives **both** implementations over the same vectors, so a divergence fails
  there rather than in a member's record.
- ⚠ **A GUARD BUG WORTH MORE THAN THE CUT: THE COPIED COMMENT-STRIPPER SWALLOWED 568k CHARACTERS.**
  The house `stripComments` runs a non-greedy `/\*[\s\S]*?\*\//g` first — which **opens a false block
  on the first regex literal containing a slash-star** and eats most of a 2.4 MB file, after which
  every assertion passes **vacuously over source that is not there**. Caught because the render
  assertion read `0 !== 2` on code that was demonstrably correct. It strips **LINE comments only** now,
  which is sufficient (every rationale comment in both files is a `//` line) as well as safe.
  ⚠ **REGISTERED, NOT SWEPT:** `tests/pref-options-token.test.mjs` carries the same helper, and its
  `doesNotMatch`-style bans are exactly the shape that can pass vacuously on mangled source — worth a
  re-check in its own cut rather than a drive-by here.
- ⚠ **AND A STRAY `tr` REFERENCE TRIPPED TWO INDEPENDENT GUARDS AT ONCE — ONE ROOT CAUSE, BOTH
  CORRECT.** The first cut passed `tr` into the customizer's two label calls, where **`tr` is not
  declared**. The **identifier gate** named both lines (a `ReferenceError` the moment that path
  renders), and the **ratchet** failed three assertions — because the detector counts references to the
  translator **binding**, so a bare reference moved the component out of the UNCOVERED set. Dropping
  `tr` fixed all four failures. *A component that renders no translated copy must not even mention the
  translator.*
- **14/14 mutations killed**, sanity green at both ends and the tree restored byte-identically: either
  writer storing the label · either picker comparing the rendered string again · a render leaking the
  raw token · the seed dropping its normalise (a legacy doc would silently reset the member's pin) ·
  the website fallback table drifting by one word · its fallback fold dropping the case fold · the
  legacy-English fallback removed · an empty catalog value reaching the screen · a throwing catalog
  uncaught · free text swallowed instead of passed through · a prompt id colliding across the lists.
  ⚠ **Three of them first reported a kill they had not earned** — hand-typed anchors that matched
  nothing, so the run measured an **unmutated tree**. Re-anchored from the file's own bytes, all three
  were killed. *A mutation that reports anything is a broken instrument until the edit is proven to
  have landed*, and the same trap ate the first mobile rewrite attempt (an anchor copied from `grep`
  output rather than from the file).
- **Verified:** `npm test` **2598/2598** · `tsc --noEmit` 0 · newdesign precompile `--check` 0 · JSX
  parse on both surfaces · mobile build 0 with all 14 prompt ids and **both token writers confirmed in
  the emitted bundle** behind a positive and a negative control (`kind:or(…)` returns `n.id`;
  `q:cr(e.q)`) · the ratchet **9/9 unchanged**, which is the certification: a data-shape change must
  move the measurement by **nothing**.
- ⚠ **REGISTERED, NOT SWEPT — the string sweep is its own cut.** `BSProfileCustomizer` is still **100%
  English** (~104 member-facing strings against a walk-visible 78 — the four module-scope arrays it
  renders are invisible to the measurement). This cut unblocks it; the **#1966 → #1967 grocery
  two-step** applied a fifth time.

### 2026-08-31 — i18n cut 14: the 42 pref options, and a fold that was wrong in Turkish

- **The eight Settings pref rows now render translated labels.** The token/label split from the
  entry below unblocked a straight sweep: **42 keys ×13**, against the shared table in
  `prefOptions.mjs`. The store, the equality comparison and the classifier all still read **ids**,
  so **nothing on disk changes** and no migration is owed — this is the second half of the
  **#1966 → #1967 grocery two-step**, applied a fifth time.
- ⚠ **THE TRANSLATOR IS INJECTED, NEVER IMPORTED — and that is a property of the module, not a
  preference.** `prefOptions.mjs` is imported by a **Next server route**
  (`src/app/api/client/analytics`), so it cannot hold a hook and cannot import the i18n singleton.
  `tr` is the **last argument** on all three display helpers and falls back to the table's English
  at every seam: a catalog that **throws**, **returns the key**, is **empty**, is **null**, or
  returns a **non-string** all read English rather than the `returnEmptyString: false` raw key.
  Same shape as cut 1's `bsWireLines` and cut 11's `bsGoalVerdict`.
- ⚠ **THE REVERSE MAP IS THE HALF THAT IS EASY TO MISS, AND WITHOUT IT THE ROUND-TRIP BREAKS IN
  TWELVE LOCALES.** The pref editor is a **picker AND a text field bound to one value** — it SHOWS
  the translated label, so a member who retypes what is on screen would store that sentence as
  **free text** and drop out of every comparison, silently. `bsPrefOptionToken` now maps the
  **current locale's labels** back to their ids, checked **after** English so a locale can never
  shadow the legacy path. Driven through the **real** function over all 13 locales — **zero
  ambiguity**, so no locale's label can resolve to two ids.
- ⚠ **AND THE FOLD WAS WRONG IN TURKISH, IN MY OWN REVERSE MAP — THE FIFTH RECORDED INSTANCE OF
  THIS CLASS.** `'Sıkı'.toUpperCase()` is **`SIKI`**, and JS `toLowerCase()` is
  **locale-INSENSITIVE**, so `siki` never matched `sıkı`: a Turkish member who typed their option
  in caps fell out of the match and their pick stored as **free text**. Fixed **at the FOLD, not
  the call site** — one locale-free fold mapping the whole **i-family** (İ ı I i) to a single
  letter before lowercasing, applied to **both** folds in the token reader **and both** in
  `bsGoalKind`. Threading a locale through was never available: **the module runs on the server
  too**. Pinned by a test that asserts the JS behaviour directly (`'Sıkı'.toUpperCase()
  .toLowerCase() === 'siki'`) and then drives four spellings, so the reason survives the code.
- ⚠ **THE 5 CALORIE RANGES ARE KEYED; `sessions_per_week` IS NOT — and the DEFAULT is the
  interesting half.** Four-digit numbers **group differently by locale** (de `1.600`, fr/ru
  `1 600`), so regrouping is a translator's call; single digits never group and those ids **ARE**
  their English. A row added later is keyed **by default** (`BS_PREF_UNKEYED_ROWS` is an explicit
  opt-out), so the guard **fails on a missing key** rather than shipping English in twelve
  locales — the safe direction.
- **Every per-locale term was READ OUT OF THE SHIPPED CATALOGS rather than invented** — 11 of the
  42 already had house terms (*Vegetarian · None · Strength · Hypertrophy · Endurance · General
  health · Beginner · Intermediate · Advanced*, plus the Weekly/Daily concepts), reused verbatim.
  ⚠ **Two tempting reuses were REFUSED on the rename test** (*share only where a rename SHOULD
  move both*): **`score:cap.weekly`/`.daily`** are **cap** labels (ru «В неделю» = *per week*),
  the wrong register for an alcohol-**frequency** answer; and **`goal:primary.goal.fat_loss`** is
  the verb phrase *"Lose fat"* where ours is the noun *"Fat loss"*. Gender agreement was checked
  too — the romance *None* takes `coach:case.none`'s **masculine** forms (*Ninguno · Nenhum ·
  Aucun · Nessuno*), because the noun it modifies is *alcohol*, not `settings:texture.none`'s
  feminine ones.
- **The `experience` row is authored as a legible 5-rung ladder** with genuinely distinct terms
  per rung rather than four synonyms for *intermediate* (de Anfänger → Geübt → Mittel →
  Fortgeschritten → Elite; ru Новичок → Любитель → Средний → Продвинутый → Элита; id Pemula →
  Pemula lanjut → Menengah → Mahir → Elite). Collision-checked per locale **before** anything was
  written: label vs sibling label, vs English, vs id — **0 collisions across all 13**.
- **THE RATCHET IS UNMOVED, AND THAT IS THE CERTIFICATION.** This cut adds `tr()` to a **MODULE**,
  not a component, so a translation cut here must move it by **nothing** — and the options stay
  invisible to the walk either way (module-scope array literals). The floor the split recorded is
  unchanged: `BSSettings` still reads **PARTIAL on 388 `tr()` calls and exactly ONE string** while
  the component carried **42 more** member-facing English strings. **That gap is what this closes**
  — in the product, not in the measurement.
- **`tests/pref-options-i18n.test.mjs` is DERIVED from the table + the unkeyed list**, so a new
  option is covered with nobody remembering: every keyed option authored in `en` **byte-identical
  to the table**; all 42 present and **non-empty** in all 13 (the raw-key trap); the unkeyed row
  carrying **no dead catalog entries**; the label moving under a **renaming translator** while the
  **token does not**; five broken-catalog shapes still reading English; the reverse map
  round-tripping in every locale **with case and padding**; **no locale making it ambiguous**
  (driven through the real function, not a duplicated fold — a guard that re-implements the
  comparison it guards can drift from it); the Turkish fold pinned as load-bearing; `bsGoalKind`
  proven to take **no** translator; and **every** client call site handing `tr` down (comments
  stripped first).
- **10/10 mutations killed**, sanity green at both ends and the tree restored **byte-identically**:
  the label ignoring the translator · the reverse map dropped · the fold reverted to a plain
  lowercase · a locale authoring an empty value · a locale dropping one of the 42 · `en` drifting
  from the table · the unkeyed row keyed · a call site dropping `tr` · `bsGoalKind` taking a
  translator · a key-echoing catalog rendering the raw key.
- **Verified:** `npm test` **2580/2580** · `tsc --noEmit` 0 · `next build` 0 with
  `ƒ Proxy (Middleware)` · mobile build 0 · JSX parse · the ratchet 9/9 · the four i18n gates
  24/24 · a **pure append** (44 insertions / 1 deletion per catalog, LF, zero CR/NUL, every prior
  key proven byte-identical by a round-trip parse) · **all 546 translated values confirmed in the
  emitted bundle**.
  ⚠ **The bundle check needed its control replaced first.** `goal:primary.goal.fat_loss` reads
  **absent** because it is **template-built** — only the prefix ships — exactly as the entry below
  records. A literal key (`settings:section.preferences` + its ru value) is present, the negative
  control absent, and the builder survives minification as **`settings:pref.${e}.${t}`**.
  *A control that cannot be present proves nothing about a miss.*
- ⚠ **REGISTERED, NOT SWEPT — the 12 `IDENTITY` sentences are still English.** They render as
  `BSIntentStep`'s *"You're becoming {identity}."* H1 on a screen that carries no translator at
  all, so localizing them is the first-run-screen cut, not this one.

### 2026-08-31 — i18n cut 15: the first-run intent screen, and the sentence it renders

- **The screen a new member meets BEFORE the app is localized.** `BSIntentStep` — twelve
  goal chips, then **"You're becoming {identity}."** — carried **zero `tr()` calls** and sat
  in the ratchet's UNCOVERED set. **25 new `onboarding:intent.*` keys ×13**; the surface
  leaves UNCOVERED for **fully covered**. No migration, no route change.
- ⚠ **THE TWO `bsPrimaryGoalLabel` CALLS STOP PASSING `null`, AND THAT HALF IS NOT
  COSMETIC.** Cut 11 passed `null` here deliberately — a translated chip beside twelve
  untranslated sentences reads as a defect — and that reason expires the moment the screen
  is localized. But this is the **SECOND WRITER of the `client_identity.goal` DISPLAY
  MIRROR**, and it wrote **ENGLISH** while `BSGoalsContract`'s picker wrote the
  **TRANSLATED** label. `get_public_profile` serves that field to **other members** on the
  public profile card, mobile **and** website — so the same member's card read a different
  language depending on which screen they set the goal from. Both writers speak the
  member's own language now, which is what the mirror is for.
- ⚠ **THE IDENTITY SENTENCE IS TWELVE KEYS AND A FRAME, AUTHORED TOGETHER PER LOCALE.**
  `IDENTITY` stays keyed on the twelve stable goal tokens (cut 11's split untouched) and a
  resolver renders it. **Turkish is verb-final AND governs the dative**, so it fronts the
  frame and inflects every phrase — *"Sen daha yağsız birine dönüşüyorsun."*; **ru/uk take
  the instrumental**. A translator who moves the frame has to re-read the phrases, so they
  ship as **one unit** rather than a frame with twelve interchangeable nouns — and the
  comment says so at the site, because the next reader will be tempted to treat the twelve
  as a plain noun list.
- ⚠ **BOTH SPLIT-ACCENT HEROES BECAME `pre`/`accent`/`post` TRIPLES** — the house pattern
  since the Score intro. **The period left the italic span and the `?` left the accent
  word**, so a verb-final locale can put a **VERB** in the post: de reads *"Was bringt dich
  heute **hierher**?"* with the accent mid-sentence. **NO SLOT IS AUTHORED EMPTY IN ANY OF
  THE THIRTEEN** — i18n runs `returnEmptyString: false`, so an empty value renders the
  **RAW KEY** on the screen a member sees *first*; English carries a bare `.` and `?`
  rather than `""`.
- ⚠ **AN UNKNOWN PICK TAKES A FALLBACK, NEVER A RAW KEY — AND THAT KEY IS INVISIBLE TO
  BOTH KEY-RESOLUTION GUARDS.** The identity key is built from the token, so
  `i18n-default-resolution` (which collects only **StringLiteral** keys) and
  `i18n-key-resolution` (scoped to calls with **no** defaultValue) can both see nothing.
  That is exactly how **15 `marketplace:preview.*` keys** once shipped unauthored, so the
  new guard **DERIVES** the wanted `en` set from the AST and asserts it rather than trusting
  either existing gate.
- ⚠ **THE RATCHET MOVES BY 11 AND THE CUT AUTHORED 25 — A TENTH BLIND SHAPE, AND THE WIDEST
  GAP THIS WAVE HAS RECORDED** between a component's counted strings and its real surface.
  The twelve IDENTITY sentences live in a **local OBJECT literal rendered by reference**,
  which the walk never attributes. Cut 7 found copy in an array literal, cut 8 in a
  module-scope array, cut 9 in a local array, cut 11 inside a state setter, cut 12 as a call
  argument; this is the same absence in an object. **`noneStrings` 935 → 924 ·
  `none.length` 99 → 98 · fully covered 112 → 113** — while **`partStrings` 169 and
  `part.length` 34 are UNCHANGED**, which is the certification that the cut is finished
  rather than half-done.
- **Registers measured, not assumed.** `onboarding` is genuinely split, and this screen's
  neighbour — `tour.*` — is the **informal** half: **ru/uk informal here** while
  `lang.*`/`dob.*` stay formal; **fr and id formal** throughout; **ha masculine**; **uk the
  straight apostrophe** (`м'язи`, `здоров'я`); **pcm** real Naija grammar. Every
  *"Welcome to Shape"* was read out of that locale's own `tour.welcome.title` rather than
  invented — the rule that separates a house convention from a guess.
- **9/9 mutations killed** (a label call back to `null` · the translator binding dropped ·
  the fallback dropped so an unknown pick renders a raw key · `IDENTITY` re-keyed on an
  English word · a split slot authored empty · a locale losing an identity key · two
  identity phrases collapsed to one · `en` drifting from the source `defaultValue` · a stale
  UNCOVERED baseline entry), sanity green at both ends and the tree restored
  byte-identically.
  ⚠ **ONE FIRST REPORTED A SURVIVOR IT HAD NEVER LANDED FOR** — the anchor
  `bsPrimaryGoalLabel(g.id, tr)` matches **TWICE** (this screen and the Goals picker), so
  the edit threw and the run measured an **unmutated tree**. Re-anchored inside the
  component's own region, it was killed. *A mutation that reports a survivor is a broken
  instrument until the mutation is proven to have landed* — this file's own rule, paid for
  again.
- **Verified:** `npm test` **2589/2589** · `tsc --noEmit` 0 · `next build` 0 with
  `ƒ Proxy (Middleware)` · mobile build 0 · JSX parse · catalog parity 5/5 ×13 (a pure
  append) · key resolution 10/10 · the ratchet 9/9 · tr-shadow clean on **both** grep forms
  · the emitted bundle carrying **all 25 keys and all 325 translated values** behind a
  **positive AND a negative control**, the template prefix present at the call site, and
  **all five call sites of the minified label helper passing a real translator** (zero pass
  `null`).
  ⚠ The last of those was a **saturated zero on the first attempt** — grepping the minified
  chunk for `bsPrimaryGoalLabel(…, null)` could never match, because the helper is minified.
  It was re-done by locating the helper through its own unique `goal:primary.goal.` prefix
  and reading every call site's second argument. *A control that cannot be present proves
  nothing about a miss.*

### 2026-08-31 — The fourth token/label instance, split — and it was live, not latent

- **The eight Settings pref rows stop storing the copy they render.** `Settings → Nutrition` and
  `Settings → Training` carry **8 `options:` rows / 47 option strings** that were raw English array
  literals: rendered by the shared pref-edit picker, selected by an **equality comparison over the
  rendered copy**, and **stored raw** into `client_nutrition_prefs` / `client_training_prefs`. One of
  them — **`primary_goal`** — was then **regex-matched over lowercased English at THREE sites, one a
  server route**. This is the split; the 42-string translation sweep it unblocks is its own cut (the
  **#1966 → #1967 grocery two-step**, applied a fourth time).
- ⚠ **AND THE REGISTER WAS WRONG ABOUT THE SEVERITY, IN THE MEMBER'S FAVOUR — MEASURED, NOT ASSUMED.**
  It read *"latent only because nobody has translated it yet"*. **`client_nutrition_prefs.primary_goal`
  has NO WRITER ANYWHERE**: `persistPref` is the only writer, and the nutrition row list has no
  `primary_goal` — the picker is a **TRAINING** row. So the Eat **"Your plan"** header read a field
  nothing writes, and across all six shipped picks it had **exactly ONE distinct output: `maintain`**.
  **Every member read "Maintaining" whatever they chose.** That reader now reads both blobs, so the
  header is truthful for the first time. *A register that under-states a defect is as wrong as one
  that over-states it — the check is what the writers do, not what the readers look like.*
- **One table, three functions, one classifier.** `mobile-app/src/services/prefOptions.mjs` holds
  `BS_PREF_OPTIONS` (8 rows / 47 `{id, en}`), plus **`bsPrefOptionLabel`** (token → copy, free text
  through, `''` for blank), **`bsPrefOptionToken`** (id stays; legacy English maps case- and
  whitespace-insensitively; free text through — every row on disk today carries English, so that read
  is the load-bearing half), and **`bsGoalKind`**, imported by **all three** readers including the
  Next route (`iosAppBroadsheetClient.jsx` already imports ES modules; Next routes already import
  `mobile-app/src/services/*.mjs` — no new plumbing, no `.d.ts`).
- ⚠ **THE REGEX FALLBACK CANNOT BE DROPPED AND A TOKEN CANNOT BE FED TO IT.** **`fat_loss` does not
  match `/fat ?loss/`** — the underscore is not a space — so a reader that kept only the regex would
  silently reclassify **every** member the moment the picker started storing tokens. Tokens decide
  first through an explicit map; free text falls through to the English patterns. Pinned as a test
  that asserts the non-match directly, so the reason survives the code.
- ⚠ **THE MERGED FALLBACK IS THE UNION OF THE THREE READERS' OWN, AND PARITY WAS MEASURED AGAINST
  THEIR VERBATIM CLASSIFIERS.** Two tested `hypertroph|strength`; the third tested `deficit|surplus`
  — merging keeps every phrase any of them ever honoured and loses none. **0 mismatches** across all
  six legacy English values on both the token and the legacy path. Cut is tested **before** build,
  per value and then across the pair, because that is the order all three used on their combined
  string; the **combined pass is kept** so a phrase split across the two fields (`"fat"` + `"loss"`)
  still reads `cut`, as it always did.
- ⚠ **A REGRESSION I CAUGHT BEFORE SHIPPING, IN MY OWN FIX.** Binding the editor's `<input>` to
  `bsPrefOptionLabel` would **trim on every keystroke**, so a member could never type a trailing
  space. **`bsPrefOptionDisplay`** exists for exactly that seam: exact-id match, otherwise
  byte-identical passthrough, **no trim, no coercion**. *The editor is a picker AND a text field;
  a normalizer on the render path is a normalizer on the typing path.*
- **Swept for render sites rather than patching the ones the register named**, which found **two it
  never mentioned** — the Settings **hub-card summaries** (`Nutrition` / `Training`), which showed the
  stored value directly. Every surface that displays a stored pref now renders the label; the store,
  the equality comparison and the classifier all read ids.
- **ZERO catalog keys, deliberately.** A computed `tr()` carrying a `defaultValue` with no `en` key is
  invisible to **both** key-resolution guards (`i18n-default-resolution` collects only
  **StringLiteral** keys; `i18n-key-resolution` on the client file is scoped to calls with **no**
  defaultValue) — which is exactly how **15 `marketplace:preview.*` keys** once shipped unauthored.
  The translator lands with the sweep, when a translator is actually in scope.
- **The ratchet 9/9 UNCHANGED**, which is the certification: a data-shape change must move it by
  **nothing**. ⚠ And the options stay invisible to the walk either way — they were **local const
  arrays inside a component**, they are module-scope arrays now, and the walk attributes neither. The
  ratchet still reads `BSSettings` as **PARTIAL on 388 `tr()` calls and exactly ONE string** while the
  component carries **42 more** member-facing English strings. **The floor is unchanged, and the
  sweep is what closes it.**
- **11/11 mutations killed across two batches**, sanity green at both ends of each and the tree
  restored clean: the Eat header back to a constant · the token map dropped (regex only) · the chip
  comparing the rendered string again · the save storing raw copy · one row back to a literal array ·
  the display trimming mid-keystroke · the token refusing free text · a reader keeping a local regex ·
  a hub card rendering the raw value · the combined-raw fallback dropped · the route dropping the
  shared classifier. ⚠ The source assertions **strip comments first** — the rationale written at each
  site quotes the very expressions they ban.
- **Verified:** `npm test` **2569/2569** · `tsc --noEmit` 0 · `next build` 0 with
  `ƒ Proxy (Middleware)` · mobile build 0 · JSX parse · the ratchet 9/9 · the i18n gates 15/15 ·
  bundle read behind a **positive control** with **exactly ONE** copy of each classifier regex and
  **ZERO** copies of both old reader regexes. ⚠ The first bundle check used a bad control
  (`goal:primary.goal.fat_loss`, a key built by template interpolation — only the prefix ships); a
  control that cannot be present proves nothing about a miss.

### 2026-08-31 — The primary-goal split: a token, a label, and a server-side reader that decided the design

- **The primary goal stops being a string that does two jobs.** It is STORED in the member's own
  goal doc (`client_goals.primaryGoal`), COMPARED against the picker's chip list on every render,
  rendered as the Goals page H1, **and** keyed into `BSIntentStep`'s `IDENTITY` map. A `tr()` on
  the chip's VALUE would freeze one language into the member's own record: pick *"Lose fat"* in
  Spanish and a later English session matches no chip and shows an untranslated H1. That is **cut
  5's Train tag and cut 6's grocery aisle at a third site**, and it takes the same answer — one
  module-scope `BS_PRIMARY_GOALS = [{ id, en }]` (12 stable ids), and `bsPrimaryGoalLabel` is the
  only thing a member ever reads. **12 `goal:primary.goal.*` keys ×13. No migration, no route
  change, no website change.**
- ⚠ **BUT THE LABEL DOES NOT GO WHERE THE TOKEN GOES, AND THAT IS WHAT SEPARATES THIS SPLIT FROM
  THE AISLE'S.** Both writers ALSO mirror the choice to **`client_identity.goal`**, and
  `get_public_profile` returns **`d->>'goal'` from that document**
  (`supabase-migrations/2026-06-07-public-profile-avatar-ungated.sql:82`) — so the stored string is
  served to **OTHER MEMBERS** on the public profile card, **mobile AND the website**. A token
  written there renders `fat_loss` to every viewer on both surfaces. So `client_goals.primaryGoal`
  carries the **token** and `client_identity.goal` stays a **DISPLAY MIRROR** carrying the
  **label** — the author's own words, the same contract the bio already has. **A server-side
  reader nobody had registered is what decided the design**; had the split been built from the
  register alone it would have shipped a raw id onto every viewer's screen.
- **The back-compat read is the load-bearing half, not a nicety.** Every row on disk today stores
  the English WORD, so a token-only reader would match no chip **for every existing member**.
  `bsPrimaryGoalToken` maps a legacy English value to its id (case- and whitespace-insensitive),
  passes an already-stored id through, and passes **anything unrecognised through unchanged** — so
  a member's own free text survives to their goal page rather than vanishing from it. An
  unrecognised token renders as **ITSELF**: never a raw key, never blank (the aisle precedent).
- ⚠ **`BSIntentStep` PASSES `null` FOR THE TRANSLATOR, ON PURPOSE.** That screen holds no `tr()`
  and sits in the ratchet's UNCOVERED set — it is **100% English today** — so a translated chip
  beside twelve untranslated sentences would read as a defect, not a feature. It becomes `tr` the
  day the screen is localized; the helper takes it as one argument. The same reasoning leaves the
  Settings identity default an English **label**: `client_identity.goal` is the label mirror, so
  an English default there is correct rather than an oversight.
- ⚠ **THE RATCHET IS UNMOVED, AND THAT IS THE CERTIFICATION.** `noneStrings` **935**,
  `none.length` **99**, `partStrings` **169**, `part.length` **34** — all four unchanged, because
  array literals and `CallExpression` arguments are both invisible to the walk. A data-shape
  change should move the ratchet by nothing; one that moved it would be a copy change wearing a
  split's name.
- **Every per-locale term was READ OUT OF THE SHIPPED CATALOGS rather than invented** — the house
  words for *endurance* (de `Ausdauer` · ru `Выносливость` · vi `Sức bền` · ha `Juriya`),
  *mobility*, *strength*, *maintain* and *recomp* all already existed under `adjust.focus*` /
  `terrain.disc.*`; uk keeps the **straight apostrophe** its own catalogs use (`Загальне здоров'я`).
  Reading the shipped catalog is what separates a house convention from a guess.
- **`tests/primary-goal-token.test.mjs` pins BOTH directions, because half of this passing is the
  dangerous state**: the token survives a renaming translator while the label moves; every writer
  stores the **id** in `client_goals` and the **label** in `client_identity`; the picker compares
  `g.id` and renders the helper; the reader normalises; `IDENTITY` is keyed on tokens (keyed on
  labels it would silently fall through to the generic line for every pick); and a catalog that
  returns the raw key, an authored empty value, or **throws** still reads English — the
  `returnEmptyString: false` trap, which would otherwise put `goal:primary.goal.fat_loss` on the
  member's own headline.
- ⚠ **AND THE GUARD'S OWN FIRST CUT HAD TWO DEFECTS, BOTH FOUND BY RUNNING IT.** `extractFn`
  brace-matches from the first `{` it finds, and for `function BSIntentStep({ onDone })` that is
  the **DESTRUCTURED PARAMETER** — so a bare-name marker extracted a two-word fragment and every
  assertion after it was about the wrong text (the trap the grocery guard's own comment warns
  about, paid for anyway). And a file-wide `const label =` scan matched unrelated bindings and
  **failed on a correct tree** (the radio bar's `` `${show} · ${bpm} BPM` ``); it is scoped to the
  binding each `client_identity` mirror actually reads. *A guard that fails is evidence about the
  guard until the code is read.*
- **9/9 mutations killed** (a writer storing the label in `client_goals` · a `client_identity`
  mirror storing the token · the picker comparing a label · the reader dropping the back-compat
  normalise · the H1 rendering the raw token · `IDENTITY` re-keyed on an English word · the label
  helper returning a raw key on an empty catalog value · the legacy-English fallback removed · a
  locale losing one of the 12 keys), sanity green at both ends and the tree restored
  byte-identically.
- **Verified:** `npm test` **2556/2556** · `tsc --noEmit` 0 · JSX parse · the ratchet 9/9 ·
  catalog parity + ICU 5/5 ×13 · key resolution 10/10 · tr-shadow clean on **both** grep forms ·
  a pure append (13 insertions / 1 deletion per catalog, LF, zero CR/NUL) · mobile build 0 with
  **all 12 keys and all 156 translated values confirmed in the emitted bundle** behind a positive
  **and** a negative control, and **zero `primaryGoal` writes carrying a label call** in that
  bundle — the split survives minification.
- ⚠ **REGISTERED, NOT SWEPT — the 12 IDENTITY sentences are still English.** They render as
  `BSIntentStep`'s *"You're becoming {identity}."* H1 on a screen that carries no translator at
  all, so localizing them is the first-run-screen cut, not this one. The **fourth instance of the
  class** — Settings' 8 `options:` pref rows / 47 raw English strings, one of them regex-matched
  over lowercased English at three sites incl. a server route — stays its own cut.

### 2026-08-31 — The primary-goal split, scoped: the register was wrong about it three ways, and it names a FOURTH instance of the class

- **Scoping the registered "primary-goal token/label split" rather than building it**, because the
  register's own note at the site says it is *"its own cut, registered, not half-done here"* — and
  reading it out found the register wrong about the writer count, blind to a server-side reader, and
  short by three literal sites. Records only; nothing built.
- ⚠ **TWO LIVE WRITERS, NOT THREE — and the third was never this vocabulary at all.** Both the
  register and cut 11's changelog line name `shapeBackend.js:899` as the third writer. That line is
  inside **`clientIntakeToPayload`**, which builds a **`client_intakes`** row from the coach-application
  intake form — a **different table** whose `primary_goal` is free text — and its only consumer,
  `saveClientIntake`, is exposed on `window.ShapeIntakes` and **called from nowhere in the tree**
  (`git grep` over `mobile-app/src`, `src`, `public/newdesign`). The two real writers are
  `BSGoalsContract`'s picker (`:23894`) and `BSIntentStep`'s first-run step (`:24210`), and **each
  writes the value TWICE** — `client_goals.primaryGoal` **and** `client_identity.goal`.
- ⚠ **A FIFTH READER NOBODY REGISTERED, AND IT IS SERVER-SIDE — WHICH DECIDES THE DESIGN.**
  `get_public_profile` returns **`d->>'goal'` from `client_identity`**
  (`supabase-migrations/2026-06-07-public-profile-avatar-ungated.sql:82`), so the stored string is
  served to **other members** on the public profile card — mobile (`:14047`, `:15042`) **and** the
  website. Write a token there and every viewer on both surfaces reads `fat_loss`. So the token
  belongs in **`client_goals`**, and **`client_identity.goal` stays a display mirror** — the author's
  own words, the same contract the bio already has, and no website change needed.
- ⚠ **FIVE LITERAL SITES, NOT TWO.** `:20934` (the demo default), `:23890` (the picker array),
  `:24191` (`GOALS`), **`:24193` (the `IDENTITY` map — keyed on the same 12 strings**, so a token
  split re-keys it too, and its 12 identity sentences are themselves untranslated member-facing copy:
  they render as `BSIntentStep`'s *"You're becoming {identity}."* H1), and `:29389` (the Settings
  identity default).
- **The design, so the next session inherits it rather than re-deriving it.** ONE module-scope
  `BS_PRIMARY_GOALS = [{ id, en }]` (12 stable ids) · `bsPrimaryGoalLabel(id, tr)` falling back to the
  **token itself** — never a raw key, never blank (the aisle precedent) · `bsPrimaryGoalToken(stored)`
  mapping an already-stored English string to its id and **passing anything unrecognised through
  unchanged** (every row on disk today carries English, so that read is the load-bearing half). Writers
  store the token in `client_goals` + the translated label in `client_identity`; the equality at
  `:23891` compares tokens; the H1 at `:23804` and the `IDENTITY` lookup resolve through one. Cost:
  12 label keys ×13, plus the 12 identity sentences ×13 if that H1 is localized in the same cut.
- ⚠ **AND THE SCOPING FOUND A FOURTH INSTANCE OF THE CLASS, ONE FIELD OVER, UNREGISTERED — LATENT
  ONLY BECAUSE NOBODY HAS TRANSLATED IT YET.** Settings → Nutrition/Training carries **8 `options:`
  pref rows / 47 option strings** that are **raw English array literals**: rendered by the shared
  pref-edit picker, selected by an **equality comparison** (`String(editField.value) === String(opt)`,
  `:30740`), and **stored raw** into `client_nutrition_prefs` / `client_training_prefs`. One of them —
  **`primary_goal`** (`Strength · Hypertrophy · Strength + hypertrophy · Endurance · Fat loss ·
  General health`) — is then **regex-matched over lowercased English at THREE sites**, one of them a
  **server route**: `src/app/api/client/analytics/route.ts:94`, plus `:3339` (the energy-goal
  derivation) and `:9056` (the Eat *"Your plan"* header). Translating that dropdown without splitting
  it first silently breaks the cut/build/maintain classification in twelve locales, on a member surface
  and a server route at once — the exact trap the register exists to prevent, in a field the register
  never mentions.
- ⚠ **IT IS ALSO THE NINTH BLIND SHAPE, AND THE SHARPEST FLOOR THIS WAVE HAS MEASURED.** Those 47
  strings are **local const array literals inside a component**, so the walk never attributes them: the
  ratchet reads **`BSSettings` as PARTIAL on 388 `tr()` calls and exactly ONE string** (the `'AB'`
  initials placeholder) while the component carries **42 more member-facing English strings** (47 minus
  the five bare numerals `'2'`–`'6'`, which no locale changes). Every cut since 7 has written *"the
  honest reading of any component's `hard` count is a FLOOR"*; this is the largest concrete gap yet —
  a component the records call fully covered apart from one placeholder, off by 42. ⚠ **And it refutes a
  because-clause the ratchet itself asserts:** the baseline comment reads *"BSSettings IS PARTIAL OVER A
  FORMAT EXAMPLE, NOT OVER COPY — 388 tr() calls and exactly one hardcoded string"*. The first half is what
  the walk can see; the second is a claim about the component, and it is wrong by 42. Corrected at the
  baseline so the next reader is not told the surface is clean.

### 2026-08-31 — Cut 13's first ruling is SETTLED BY THE CODE: the goal template's text IS stored

- **Cut 11 registered `BS_GOAL_TEMPLATES` (74 strings) as needing TWO rulings before it
  can be swept.** One of them — *"is a chosen template's text STORED in the member's goal
  doc?"* — is not a product question at all; it is a fact the source answers, and it is
  now answered: **YES.** `pick(tpl)` writes `t: tpl.t` and `sub: tpl.sub` into the edit
  sheet's draft, `save()` spreads that whole draft into `onSave(...)`, and the goal lands
  in `user_goals('client_goals')` — where `BSGoalsContract` renders `t`/`sub` straight
  back off the record. So the register's *"in which case"* is the live case, not a
  hypothetical, and the remaining question is a real ruling rather than an investigation.
- ⚠ **BUT IT IS NOT THE GROCERY-AISLE CLASS, AND CONFLATING THE TWO WOULD PICK THE WRONG
  REMEDY.** The aisle was stored **AND** used as a grouping key compared against a
  freshly-classified value, so a translated write broke matching — a correctness bug with
  one answer (token/label split). A goal title is compared against nothing: it is a
  **prefill for a field the member can immediately type over**, which makes it the
  **`'My workout'` / `'New list'` class** (cut 8's record-name ruling), where the house
  already decided the default stays English at the write precisely because translating at
  the write freezes one language into the member's own data.
- **So the ruling is a genuine product choice between two defensible answers**, and it is
  stated here so it can be decided in a line rather than re-derived: **(a)** translate the
  picker rows and let the member's saved goal carry the language they picked it in —
  natural to read, and it freezes that language into their record forever, including
  across a later language switch; or **(b)** keep the written `t`/`sub` canonical English
  and translate only what the picker DISPLAYS — consistent, and it means a Spanish member's
  own saved goal reads back in English, which is the worse of the two on screen.
  ⚠ **There is no third option that avoids the trade**: any scheme that re-translates the
  record at render has to stop being the member's editable text, and the sheet's Title
  field is editable by design.
- **The SECOND ruling is untouched and still needed** — whether an imperial member sees
  converted targets (`Bench press 225 lbs`, `Bike 100 miles`, `Deadlift 405 lbs` are all
  authored in imperial with the unit inside the string). Cut 13 stays blocked on it either
  way, so nothing is unblocked here; what changes is that one of the two blockers is now a
  decision instead of a question, and the precedent that governs it is named.

### 2026-08-31 — i18n cut 12: the four goal sheets, and the walk's eighth blind spot

- **The sheets a member edits their own contract in are localized.**
  `BSGoalEditSheet`, `BSOverallEditSheet`, `BSHeadlineEditSheet` and
  `BSWeighInSheet` carried **zero `tr()` calls** between them — the add/edit-target
  form, the body-comp goal editor, the station-headline editor and the weigh-in
  logger. **42 new keys ×13**, and all four leave UNCOVERED for **fully covered**.
  No migration, no route change.
- ⚠ **FOUR OF THE STRINGS WERE OUTSIDE THE MEASUREMENT, IN AN EIGHTH SHAPE.**
  `containerStrings()` steps over **`CallExpression`** — the rule that keeps a
  `tr('k', { defaultValue: 'v' })` argument from being counted as hardcoded copy —
  so **copy passed as an ARGUMENT to a local render helper is invisible to the
  walk**: `num('cur', 'Current')` and `num('tgt', 'Target')` are two of the edit
  sheet's four field labels. Two more sat in **template literals split at their
  placeholders** (the timeline line, the weigh-in note), which the walk reads as
  fragments rather than sentences. Cut 7 found copy hidden in an array literal,
  cut 8 in a module-scope array, cut 9 in a local array, cut 11 inside a state
  setter; this is the same absence one call frame further in. **The honest reading
  of any component's `hard` count is a FLOOR.**
- ⚠ **AND THE SWEEP FORCED OUT A DEVICE-LOCALE BUG.** The weigh-in note's two
  figures were formatted with a bare **`toLocaleString()` — the DEVICE locale** —
  inside a sentence the member reads in their **SELECTED UI language**, so
  Spanish-in-Shape on an English phone read English grouping in a Spanish
  sentence. Both now format through **`bsDateLocale()`**. Same class as cut 1's
  telegram date, and it was only visible because localizing the sentence forced
  someone to read where its numbers came from.
- ⚠ **TWO INDEPENDENT `pre`/`accent` PAIRS ON THE EDIT SHEET, BECAUSE GERMAN AND
  TURKISH ARE VERB-FINAL.** The house split-accent hero is `titlePre` + an italic
  `titleAccent`; the New and Edit variants cannot share one frame with a swapped
  word — de reads **„Neue *Vorgabe.*"** but **„Vorgabe *bearbeiten.*"**, tr
  **"Yeni *hedef.*"** but **"Hedefi *düzenle.*"**. Four keys, not two plus a
  placeholder.
- **`goal:primary.closeAria` was RENAMED to `goal:sheet.closeAria`** and is now
  shared by the three sheets that carry a ✕ plus its original call site — *a
  rename SHOULD move all four*. Four more chrome labels (`cancel`, `fieldTitle`,
  `fieldTarget`, `fieldTargetDate`) join it under `sheet.*` for the same reason;
  everything a single sheet owns stays under its own prefix.
- ⚠ **TWO TEMPLATE LITERALS BECAME ICU PLURALS.** The timeline line and the
  template-picker chip appended a bare `wks`; **no language forms a plural that
  way** and ru/uk need four categories. `edit.tplWeeks` is ICU **even though the
  shipped `BS_GOAL_TEMPLATES` never passes `weeksOut: 1`** — ru/uk inflect
  differently at 2–4 vs 5+, so the non-plural form was wrong for reasons the
  English minimum never reveals.
- **The `en` catalog is DERIVED from the source's own `defaultValue`s** (an AST
  walk over the four components plus the renamed call site), so the catalog and
  the call sites cannot disagree at authoring time.
- ⚠ **EVERY PER-LOCALE TERM WAS READ OUT OF THE SHIPPED CATALOGS RATHER THAN
  INVENTED** — the house word for *target* (es `Objetivo` · fr `Cible` · de
  `Vorgabe` · id `Sasaran` · ha `Manufa` · ru `Задача`), for *Close*, for *Your
  why*. Register was **measured, not assumed**: ru/uk are formal but write the
  possessive **lowercase mid-sentence** (ru 91 lowercase vs 3 capital; uk 99 vs
  52), uk uses the **straight apostrophe** (78 vs 27), and fr keeps a **regular
  space before `?`** (zero narrow-no-break-spaces in the fr catalogs). Reading the
  shipped catalog is what separates a house convention from a guess.
- ⚠ **AND MUTATION-TESTING FOUND A REPO-WIDE HOLE IN THE PARITY GATE THAT IS WORTH
  MORE THAN THE CUT: AN EMPTY CATALOG VALUE PASSED EVERY CHECK.** Under the
  runtime's deliberate **`returnEmptyString: false`** an empty value renders the
  **RAW KEY** on screen — `goal:overall.save` on the button the member is trying to
  press. Key parity cannot see it (a key whose value is `""` **is** present, so the
  locale reads complete) and ICU validity cannot either (the empty string is a
  valid ICU message). Closed with a **derived** non-empty assertion over every
  locale × every namespace — **measured at ZERO offenders when it landed**, so it
  starts clean rather than documenting a gap. ⚠ **Guard-the-guard:** the `trim()`
  is mutation-proven load-bearing — a whitespace-only value escapes without it.
- ⚠ **REGISTERED, NOT SWEPT — THE DEVICE-LOCALE CLASS IS 64 SITES WIDE.** Measured
  with the method stated so the next reader can re-derive it rather than trust the
  page: `/toLocale(String|DateString|TimeString)\(\)/` over
  `mobile-app/src/broadsheet/*.jsx` + `src/services/*.mjs` returns **64 bare calls**
  (client 55 · pros 6 · widgets 2 · radio 1) against **76 that DO pass a locale** —
  so the house convention exists and half the tree does not follow it. This cut
  fixed **2**. A blanket source ban would be a 64-site false-alarm generator, and
  separating member-facing copy from internal/number formatting is a per-site read,
  i.e. its own cut.
- **The ratchet moved on three axes, and the two that did NOT move are the
  certification.** `noneStrings` **984 → 935** · `none.length` **103 → 99** ·
  fully covered **108 → 112** — while **`partStrings` 169 and `part.length` 34 are
  UNCHANGED**. Four surfaces leaving the untranslated bucket with the partial
  columns flat is what a finished cut looks like; one landing in PARTIAL would be
  half-done.
- **8 mutations run, 6 killed on the first pass and BOTH survivors were real
  findings** (the device-locale revert, which is now the registered 64-site class;
  and the empty value, which is now a guard) — plus 3 more on the new guard, all
  killed. Sanity green at both ends of every batch and the tree restored clean.
- **Verified:** `npm test` **2541/2541** · `tsc --noEmit` 0 · JSX parse · tr-shadow
  clean on **both** grep forms · catalog parity + ICU ×13 (a pure append — 43
  insertions / 2 deletions per file, LF, zero CR/NUL) · the ratchet 9/9 · mobile
  build 0 with **all 42 keys and all 504 translated values confirmed in the emitted
  bundle** under a **positive control** (`goal:cover.eyebrow`, a key that certainly
  ships) and a **negative control** (a key that does not exist), because a
  saturated zero is the instrument until proven otherwise.

### 2026-08-31 — i18n cut 10: the About page, and a prefix that was already taken

- **The letter a member reads when they tap Settings → About is localized.** `BSAboutPage`
  carried **38 walk-visible strings and zero `tr()` calls**; it now carries **45**, against
  **44 new `settings:aboutPage.*` keys ×13** plus one reuse of `common:action.back`. No
  migration, no route change.
- ⚠ **THE OBVIOUS PREFIX WAS ALREADY TAKEN, AND THE ANSWER IS A RENAME RATHER THAN A MERGE.**
  Deriving the `en` catalog from the source's own `defaultValue`s returned **59**
  `settings:about.*` keys where 44 were expected — **fifteen already exist** for the Settings
  About **section rows** (`about.aboutShape` · `about.pricing` · `about.terms` …). Sharing the
  prefix would have coupled a page's hero to a settings row: the house rule is *share only
  where a rename SHOULD move both*, and a rename of a Settings row must not move this page's
  headline. The 44 became **`settings:aboutPage.*`**. **A prefix collision is only visible if
  the catalog is DERIVED from the source; a hand-copied key list would have overwritten
  fifteen shipped rows silently.**
- ⚠ **38 UNDERSTATES THE CUT BY SIX — A SIXTH SHAPE THE WALK CANNOT SEE.** The two `idea`
  cards live in an **inline anonymous array literal written straight into JSX** —
  `{[[…]].map(…)}` — which the walk never enters. So six member-facing strings were part of
  the work and outside the measurement, and the cut authored **44 keys against a ratchet that
  can only move by 38**. Joins the module-scope array literal, the local arrow function, the
  local const ternary, the plain-JS string and the un-allowlisted prop: **the honest reading
  of any component's count is a FLOOR**, six cuts running.
- ⚠ **THE DROP CAP WAS ONE `charAt(0)` AWAY FROM A BROKEN GLYPH IN TWELVE LOCALES.** The
  letter opens with a drop cap sliced off the front of its first paragraph. `charAt(0)` returns
  a UTF-16 code UNIT, so any astral first letter splits into two lone surrogates — invisible
  while the value is a hardcoded English `S`, a mojibake pair the moment a locale supplies the
  string. It walks codepoints now (`[...s][0]` / `[...s].slice(1).join('')`) and takes the cap
  **from the translated value**, never a literal. **Translating a string can make a correct
  slice wrong — the transform did not change, its input did** (the cut-6 `toLowerCase()`
  finding at a second site).
- ⚠ **NO SPLIT-ACCENT SLOT IS AUTHORED EMPTY, IN ANY OF THE THIRTEEN — AND THAT IS A HARD
  CONSTRAINT, NOT A STYLE.** i18n runs with **`returnEmptyString: false`**, so an empty catalog
  value renders the **RAW KEY** on screen. Indonesian has no article for `idea.h2Pre`, and
  tr/ru/uk front their predicates past `letter.h2Post` — those slots carry a real word or a
  bare period (the Score-intro `titlePost` precedent), never `""`. Pinned across all 44 keys ×
  13, not just the split ones: a blank anywhere on this page is the same failure.
- ⚠ **AND THE GUARD'S OWN FIRST CUT ASSERTED A COUPLING THAT IS NOT REAL — the catalogs were
  right and the test was wrong.** It required the About CTA to equal
  `onboarding:login.titleJoin*` in every locale, because both read *"Join the community."* in
  English. It failed on **eight** locales whose translators had independently chosen different
  natural wording (de *"Komm in die"* vs *"Werde Teil der"*). Reading the call site settles it:
  the login headline is read by someone **creating an account**; the About closer is read by a
  member already inside, and its button fires `shape:goCommunity` to **open the feed**. Same
  words today, two rhetorical moments — so a rename of one must not move the other. The
  assertion was replaced with one that is true (the hero's two non-breaking pairs, the CTA's
  arrow, and the brand nouns survive translation) and **the ruling is written where the wrong
  assertion was**, so the next reader does not re-add it. **A guard that fails is evidence
  about the guard until the code is read.**
- ⚠ **THE `— Chris Perry` SIGNATURE IS DELIBERATELY NOT KEYED**, which is why the cut lands
  PARTIAL rather than fully covered. It is a person's name: no locale changes it, for the same
  reason none changes the shipped `+1 555 123 4567` phone example or `BSSettings`' `AB` initials
  placeholder. Keying it would ship **thirteen identical values for a string a translator must
  not touch**. Recorded in the ratchet's PARTIAL baseline rather than special-cased inside
  `usable()` — **a false exclusion there hides real copy**, which is the direction that makes
  the guard lie.
- **Register measured per locale, never guessed** (occurrence counts in this namespace):
  **fr · ru · uk formal**, **id formal `Anda`** (the settings half of the house's Indonesian
  split), es/pt-BR/de/it/vi informal, **tr informal** (7 `sen*` / 2 `siz*`) carrying the
  apostrophe-before-a-case-suffix form its own catalog already ships (`Shape'in`), **ha
  masculine** (14 `ka` / 0 `ki` — the house default; the cycle surface is the one deliberate
  feminine exception and this is not it), **pcm** real Naija grammar (*"Na di whole idea be
  dat."*) with short nouns matching English as the legitimate creole pattern.
- **The ratchet moved on all four axes.** `noneStrings` **1063 → 1025** · `none.length`
  **106 → 105** · `part.length` **32 → 33** · `partStrings` **164 → 165**. Fully covered stays
  **107** — the cut lands PARTIAL by design, over the one name above.
- **9/9 mutations killed** (the drop cap back to `charAt(0)` · the cap hardcoded to `'S'` · a
  locale's split slot emptied · a hero NBSP dropped · the CTA arrow dropped · a brand noun
  translated · the founder name keyed · the baseline entry left stale in UNCOVERED · a total
  left un-repointed), sanity green at both ends and the tree restored clean.
- **Verified:** `npm test` **2530/2530** · `tsc --noEmit` 0 · JSX parse · tr-shadow clean on
  **both** grep forms · catalog parity + ICU 3/3 ×13 (a pure append — 45 insertions / 1
  deletion per file, LF, zero CR/NUL) · mobile build 0 with **all 44 keys and all 572
  translated values confirmed in the emitted bundle** behind a positive control.
  ⚠ **The first bundle read said 546/572 — and the 26 were the instrument.** The minifier emits
  **U+00A0 as the escape sequence `\xA0`** inside the string literal, so a literal-codepoint
  grep cannot match the two hero keys in any locale. Same class as the backtick rewrite this
  file already records: **a saturated, evenly-distributed miss is the measurement, not the
  finding.**

### 2026-08-31 — i18n cut 9: the integrations page, and a third site where copy was doing an identifier's job

- **The screen a member uses to connect their devices is localized.** `BSIntegrationsPage`
  — WHOOP · Strava · Spotify · Apple Music · Instacart · Garmin · Oura · Apple Health —
  carried **40 walk-visible strings and zero `tr()` calls**; it now carries **62**, against
  **57 new `settings:integrations.*` keys ×13**, appended to the existing namespace. No
  migration, no route change.
- ⚠ **A TOKEN/LABEL DEFECT AT A THIRD SITE, AND THIS ONE HID INSIDE A REGEX.** `runAction()`
  recovered the provider's **name** by stripping the English word out of its own toast
  label — `label.replace(/\bdisconnected\b/i, '')` — so the confirm dialog's **subject was
  derived from rendered copy**. A `tr()` on that label stops the regex matching in all
  twelve non-English locales and the dialog degrades to **"this app"**, silently, with
  parse, `tsc`, the suite and the build all green. Same class as cut 5's Train tag and
  cut 6's grocery aisle — *a value doing double duty as copy AND as an identifier something
  parses* — but the first where the parser was a **regex over a sentence** rather than a
  comparison against a stored token. The name is **data** now: it comes from the provider
  row and is passed explicitly, so no locale can break the dialog.
- ⚠ **AND THE ENGLISH WAS ALREADY BROKEN BEFORE ANY LOCALE SAW IT.** The failure fallback
  was `` `${label} failed.` `` over a label that is itself a sentence, so a failed WHOOP
  sync rendered **"WHOOP synced failed."** It names the provider now. *A string that is
  wrong in English is not an i18n bug, but localizing it would have translated the mistake
  thirteen times.*
- ⚠ **A SECOND HONESTY DEFECT, IN THE SETTINGS DOOR THAT OPENS THIS PAGE.** The
  Health-integrations section rendered a hardcoded **"2 connected"** meta and a hardcoded
  status per provider — WHOOP always *Connected*, Garmin/Strava/Spotify always *Connect* —
  so a member with **nothing connected** read a fabricated count in their own settings. It
  now reads the same `getStatus()` the Integrations page reads, **derives** its rows from
  the response (a provider added later appears with nobody remembering to list it), and
  renders **no meta at all** when the status cannot be read — honest absence, never an
  invented number.
- ⚠ **40 IS THE WORST FLOOR THIS WAVE HAS RECORDED: the real surface is ≈74, hidden by FOUR
  shapes at once.** **17 toast sentences** plus **3 confirm/error strings** are plain JS the
  walk never enters (cut 2's lesson). **8 provider eyebrows** rode an **`id=` prop that is
  not on `TEXT_PROPS`**. **3 `statCards` labels** sit in a local array literal (cut 7's first
  invisible shape). So four of the five known blind spots met on one screen.
- ⚠ **AND `id` MUST NEVER JOIN `TEXT_PROPS` — the prop was RENAMED INSTEAD.** `id` is an
  HTML identifier tree-wide; admitting it would demand a translation for every element
  identifier in the codebase, which is the fabrication direction #1968 already refused for
  `kind`/`variant`/`role`. `IntegrationCard`'s `id` became **`eyebrow`** at its receiving
  component — the `l` → `label` move of #1968 at a second site, and the same rule: **a prop
  earns a place on a copy allowlist at its receiving component, never from its name.**
- **Seventeen toast sentences collapse to SIX ICU builders** carrying the provider name
  (`toastSynced` · `toastWorkouts` · `toastRoutes` · `toastConnected` · `toastReconnected` ·
  `toastDisconnected`); the two import summaries are **nested ICU plurals** over both
  `{imported}` and `{errors}`. The status vocabulary (`Connected` · `Connect` · `Reconnect` ·
  `Disconnect` · `Ready` · `Syncing` …) is **resolved once** rather than at each call site —
  `connectedLabel` also drives the accent colour, so a second copy would silently stop
  matching.
- ⚠ **`BRAND` GAINS `WHOOP` AND `Apple Health` — the same nouns the set already carried,
  missed on a CASE and a SIBLING.** `BRAND.has()` is exact, so the all-caps spelling the
  company actually uses never matched `Whoop`, and `Apple Health` never matched its sibling
  `Apple Music`. That is the **`hr`/`HR` artifact** this file records one set up.
  **Measured before widening, all four combinations of old/new ratchet × old/new source:**
  on the **pre-cut** tree the widening moves **2 strings and NO component** (noneStrings
  1103 → 1101); on the post-cut tree it is what lets the cut land **fully covered** instead
  of PARTIAL over two nouns no locale translates. **Zero blast radius elsewhere** — which is
  why it ships here rather than as its own PR, and the measurement is written at the set so
  the next reader can re-derive it instead of trusting the sentence.
- **The ratchet moved on three axes, and the two that did NOT move are the certification.**
  noneStrings **1103 → 1063** · none.length **107 → 106** · fully covered **106 → 107**.
  **`partStrings` 164 and `part.length` 32 are UNCHANGED for the THIRD cut running** — the
  assertion that says the cut is finished rather than half-done.
- **`tests/integrations-name-token.test.mjs` pins both defects in both directions**, because
  half of either passing is the dangerous state: the name must be a **declared parameter**
  and must not be recovered from `label` by `replace`/`match`/`split`/`slice`; **every one of
  the 15 call sites** must pass the provider's own label as that name; the settings meta must
  be **gated on a real read** and fall back to `''` rather than a number; and the provider
  rows must be **derived** from the response, with WHOOP/Garmin/Strava/Spotify banned as
  hand-listed literals. ⚠ It **strips comments first** — the rationale written at each site
  quotes the very expression being banned, and this repo has burned that trap more than once.
- ⚠ **AND THE GUARD'S OWN FIRST CUT EXTRACTED A TWO-LINE FRAGMENT.** A non-greedy
  `/window\.bsAskConfirm\(\{[\s\S]*?\}\)/` stops at the **first** `})`, which is the inner
  `tr()` call's — so the assertion would have been about a fragment that does not contain the
  line under test. It **brace-matches** now. It failed on correct code rather than passing on
  broken code, which is the safe direction, but it still proved nothing until fixed.
- **11/11 mutations killed** (the regex restored on the label · the `name` parameter dropped ·
  one call site passing a literal instead of the provider's label · the `${label} failed.`
  sentence restored · the meta inventing a count · the provider rows hand-listed again · an
  unread status falling back to a number · the door no longer reading the real status · a
  stale baseline entry · the `BRAND` widening reverted · a locale losing one of the 57 keys),
  sanity green at both ends of every batch and the tree restored byte-identically.
  ⚠ **One first reported a survivor it had never landed for** — a hand-written anchor with the
  wrong leading whitespace, so the edit threw before writing and the run measured an
  **unmutated tree**. Re-anchored, it was killed. *A mutation that reports a survivor is a
  broken instrument until the mutation is proven to have landed*, for the third time in this
  wave.
- ⚠ **THIS CUT ALSO CORRECTS ITS OWN SCOUTING REPORT.** PR #1972 recorded *"BSIntegrationsPage
  40 and BSAboutPage 38 hold up — checked, not assumed: neither renders a module-scope or
  local array of copy."* The **conclusion** stands (both are ordinary cuts, no ruling) and
  only the **sizes** were wrong — but the scan enumerated module-scope `BS_*` arrays and local
  `const X = [` and missed two other shapes: an **inline anonymous array literal written
  straight into JSX** (`{[[…]].map(…)}`, where BSAboutPage hides 6 strings) and a **prop not on
  `TEXT_PROPS`**. Measured: BSIntegrationsPage ≈**74**, BSAboutPage ≈**44**. Corrected in place
  on the War Room rather than shipped as a third records-only PR — *the cut itself is the
  correction, which is real work plus an honest record in one.*
- **Per-locale calls worth keeping.** The six `{name}` toast keys take the **colon
  construction** in ru/uk (`Синхронизировано: {name}` · `Підключено: {name}`) — a proper noun
  arrives in **one** case, so no verb or preposition may govern another; the same rule cut 7
  paid a round to learn. `id` uses formal **`Anda`** because these keys land in `settings`,
  which is one of the two namespaces on that side of the house's Indonesian split. `pcm` matches
  English on the brand-noun eyebrows and short verbs, which is the legitimate creole pattern,
  while its prose is real Naija grammar (*"Dis go stop di app data from syncing until you
  connect am back"*). Every provider name, `MusicKit`, `Garmin Health API`, `HR` and `HRV`
  stay literal in all thirteen — verified programmatically, not by eye.
- ⚠ **AND SWEEPING THE CLASS FOUND A SECOND FABRICATED META THREE LINES ABOVE THE ONE THIS
  CUT FIXED.** The **Account** section's meta was a hardcoded **`'Pro · annual'`** — a plan
  claim shown to every member regardless of their real subscription, and **wrong even for a
  paying one**: Shape's membership is **$5/MONTH**, so nothing about it is annual. The honest
  source was already loaded three hundred lines up (`plan`, from `/api/stripe/subscription`,
  which the *Your plan* card below it renders from correctly). It now reads **Member / Free**
  from that, and — the same rule as the integrations count — **renders no meta at all while
  the plan is unread**. Two keys ×13. **Fixing where the defect was reported would have left
  the sibling shipping**, and this PR's own record claims to have swept the Settings door,
  so the claim had to be made true rather than narrowed. **3/3 mutations killed** (the
  fabricated meta restored · an unread plan guessing *Free* · a locale losing one of the two
  keys), sanity green at both ends, tree restored byte-identically.
- ⚠ **THE TOKEN/LABEL CLASS ITSELF WAS SWEPT TREE-WIDE, AND CAME BACK CLEAN — WHICH IS THE
  FINDING, NOT AN ABSENCE OF ONE.** Every `.replace/.match/.split/.includes` on a variable
  named for copy (`label · title · text · msg · message · heading · caption`) across
  `mobile-app/src`, `public/newdesign` and `src` was read at its site. The other hits are
  **not** the class and are correct as they stand: parsing a **URL** for a playlist id;
  matching a **Postgres/PostgREST error message** for a code (English regardless of UI
  locale, and paired with a code check anyway); truncating a **member's own note** for
  display; and `bsmFilterCategory`, which classifies a **coach's own free-text specialty**
  against English keywords — where the plain `.toLowerCase()` is the *correct* fold precisely
  because the keyword list is English, and `toLocaleLowerCase` would break it under `tr`.
  `publicProfile.jsx`'s `title.split(' — ')` is website-only, and the website is English.
  **So cut 9's site was the only live instance in the localized surface** — the class is
  closed, not merely patched.
- ⚠ **TWO ASCII HYPHENS BECAME MIDDOTS, AND THAT IS AN ENGLISH COPY CHANGE IN AN i18n PR —
  SO IT IS RECORDED RATHER THAN SLIPPED IN.** The Strava card's eyebrow read
  `Runs - rides - routes` and its import summary `private activities - N errors`, while
  every sibling eyebrow on the same screen already used the house middot
  (`Recovery · Sleep · Strain` · `Music · Playlists` · `Sleep · Readiness · HR`). Freezing
  the odd one out into thirteen catalogs would have made the inconsistency permanent, so
  both were normalized at authoring time. **The rule an i18n cut runs under is still
  *preserve the copy* — this is the exception it allows for a separator that disagrees
  with its own row, and the exception is only honest written down.**
- **Verified:** `npm test` **2525/2525** · `tsc --noEmit` 0 · JSX parse · tr-shadow clean on
  **both** grep forms · catalog parity + ICU ×13 (a pure append — 58 insertions / 1 deletion
  per file, LF, zero CR/NUL) · mobile build 0 with **all 57 keys and all 684 translated values
  confirmed in the emitted bundle** behind a positive control, and **the banned regex confirmed
  absent from that bundle** · the ratchet 9/9.

### 2026-08-31 — The provider application is registered as needing a RULING, not a cut

- **Measured while scoping the next i18n cut, and it is the one surface in the queue that
  should not simply be swept.** `BSProviderApplicationScreen` carries **91 hardcoded strings
  and zero `tr()` calls** — the largest uncovered surface left — and it is the door a coach
  walks through to join the marketplace. On volume alone it is the obvious next cut. It is
  registered instead, because **four of those strings are legal consent affirmations**:
  - *"I agree to the {Trainer|Nutritionist} Agreement and Terms of Service."*
  - *"I agree to Shape's code of conduct."*
  - *"I consent to a required background check through Shape's screening partner before my
    provider profile can go live."*
  - *"I understand my credentials may be verified by Shape's trust team."*
- ⚠ **THE PROBLEM IS NOT THE TRANSLATION, IT IS WHAT THE TRANSLATION WOULD RECORD.** A
  checkbox is not copy — it is the evidence that a specific person agreed to a specific
  document. **Measured, not assumed:** `public/terms.html` and `public/code-of-conduct.html`
  are `lang="en"` and **there is exactly one copy of each — no translated version exists**;
  the in-app summaries are English too (`BSTermsPage` 11 strings / `BSCodeOfConductPage` 8 /
  `BSPrivacyPage` 10, all `tr: 0`). So translating the affirmation would present a coach with
  a Spanish sentence saying they agree to a document **that only exists in English** — and
  file that consent as though they had read it. That is a fabrication of exactly the class
  this wave keeps closing, one layer up from copy.
- **The two honest options, and both are the owner's call, not an implementer's.** (a)
  Localize the whole application **except** the four affirmations, which stay English with a
  visible note that the linked documents are English-only — ugly, and defensible. (b)
  Localize nothing until the documents themselves are translated and counsel has ruled on
  which language governs. **Every legal document in `docs/legal/` is already marked "DRAFT —
  for privacy counsel"**, so the question is already in that queue rather than a new one.
- ⚠ **AND THE REST OF THE SURFACE NEEDS A RESTRUCTURE, NOT A SWEEP — so it is not "the easy
  87 strings" either.** The screen is built from sentence FRAGMENTS that no locale can
  reorder, and the walk counts each fragment as its own string, which is why 91 overstates
  the sentences and understates the work: *"I agree to the"* + *"Trainer"* + *"Agreement and
  Terms of Service."* is one sentence in three pieces; *"Shape requires a minimum of 5 years
  of professional"* + *"training or coaching"* + *"experience before a provider profile can
  go live."* is one in four; *"Your"* + *"trainer"* + *"application is ready for review."*
  and *"Step"* + *"of"* are two more. Each becomes ONE ICU key with the role as a placeholder
  — the same restructure cut 7 made for the possessive and cut 8 for the session count.
- **Placeholder examples split two ways, and the house has already ruled on both.** The
  credential and platform lists (`NASM, ACE, CSCS` · `RD, RDN, CNS` · `Trainerize,
  MyFitnessPal Pro`) are **terms of art and brand nouns — literal in every locale**, like
  kcal/RPE/HRV. The format examples (`Brooklyn, NY` · `America/New_York` · `BS Kinesiology`)
  are the **`+1 555 123 4567` class** — a locale's own city and zone read better than a New
  York one, and that is a translator's call per locale, not a constant.
- **Registered with its measurement so the next session inherits the reasoning rather than
  re-deriving it.** The other scouted candidates are ordinary cuts and carry no ruling:
  `BSProfileCustomizer` **78** · `BSIntegrationsPage` **40** · `BSAboutPage` **38** ·
  `BSHealthIntake` **31** (all `tr: 0`).
  ⚠ **CORRECTED THE SAME DAY — `BSHealthIntake` IS NEITHER 31 NOR AN ORDINARY CUT, AND BOTH
  HALVES WERE WRONG.** Checking my own line rather than shipping it forward: the **7 PAR-Q
  questions** (`BS_PARQ`) and the **9 condition tags** (`BS_CONDITION_TAGS`) are module-scope
  **ARRAY LITERALS** mapped to elements — the exact shape cut 7 registered as invisible — so
  the walk attributes **none** of them and the real member-facing count is **47**, not 31.
  And they are not house copy: they are near-verbatim the standard **seven-item PAR-Q**, a
  published clinical screening instrument, asking about a **heart condition**, **chest pain
  at rest**, and **losing consciousness**. Machine-translating a validated instrument
  produces an unvalidated one, and a member who misreads a heart-condition question answers
  it wrongly — so the honest path is to **source the instrument's own published translations
  where they exist**, never to hand it to a translator with the UI chrome. **An owner /
  counsel ruling, in the same queue as the provider application.**
- ⚠ **AND THE TWO CONSENT AFFIRMATIONS TAKE OPPOSITE RULINGS, WHICH IS THE PART THAT
  GENERALISES.** The health intake carries one too — *"I confirm these answers are accurate,
  and I understand they're shared with coaches I hire on Shape for my safety."* — and it is
  **NOT** the provider application's class. That one points at an **EXTERNAL document**
  (Terms of Service, code of conduct) that exists **only in English**, so translating the
  sentence would record consent to something the member cannot read. This one points at
  **the form it sits on**, which the same cut would translate — there is nothing external for
  the translation to misrepresent. So translating it is not merely safe, it is **required for
  it to mean anything**: today a Spanish-speaking member attests **in English** that answers
  they gave on a Spanish-labelled form are accurate, which is the worse state. **The test is
  not “is it a consent checkbox” — it is WHAT THE AFFIRMATION POINTS AT.**
- ⚠ **AND `BSProfileCustomizer`'S 78 IS A FLOOR FOR THE SAME REASON — SO THE ONE MEASUREMENT
  WAS WORTH RUNNING ACROSS THE WHOLE LIST RATHER THAN DISCOVERING IT A CUT AT A TIME.** It
  renders four more module-scope array literals the walk cannot attribute: **8** member
  prompt questions (`BS_PROFILE_PROMPTS` — *Never skip · Pre-workout fuel · Currently
  chasing …*), **6** coach ones (`BS_COACH_PROMPTS`), **5** pin kinds (`BS_PIN_KINDS`) and
  **7** headline-stat labels (`BS_STAT_OPTIONS`). Real member-facing count ≈ **104**, not 78.
- ⚠ **AND IT CARRIES A TOKEN/LABEL SPLIT — THE GROCERY-AISLE CLASS, AT A THIRD SITE.**
  `BS_PIN_KINDS` is **bare strings**, so the token and the label are the same string, and the
  chosen value is **written into the member's `profile_custom` record and rendered straight
  back off it** — `{pinned.kind || …}` at two render sites. A `tr()` on the picker would
  freeze whatever language was active when they pinned it into their own saved profile,
  exactly as a translated aisle name did. **The split must come first, as it did for the
  Train tag and the aisle.** The two neighbouring arrays are already `{ key, label }`, so
  their split exists and only `label` needs authoring — and those labels are **brand nouns**
  (`Instagram · X · TikTok · YouTube · Substack`) that stay literal in every locale.
- **The other two figures hold up, and that is stated because it was checked rather than
  assumed.** `BSIntegrationsPage` **40** and `BSAboutPage` **38** render no module-scope or
  local array of copy, so those counts are honest and both are genuinely ordinary cuts.
- ⚠ **AND THE MEASUREMENT THAT FOUND IT WAS ITSELF BROKEN FIRST — THE SIXTH TIME IN THIS
  WAVE.** The first two `DUMP=BSHealthIntake` runs returned **nothing at all**, which reads
  exactly like “this component has no strings.” A `cd` into `catalogs/en` for an unrelated
  reuse sweep had persisted, so the runner could not find the test file. **A saturated-zero
  result is the instrument until proven otherwise**; the re-run carried a positive control
  (a component that certainly has strings, which returned 246 lines) so an empty haystack
  could not read as an empty answer.

### 2026-08-31 — i18n cut 8: the self-serve builder, and a token that is about the WIRE

- **`BSWorkoutBuilder` is localized** — the screen a **coach-less** member uses to author
  their own training (the self-serve wave's whole point: before it, a member with no coach
  had no workout to log and no way to write one). It carried **50 hardcoded strings and no
  translator**; it now carries **62 `tr()` calls and none**, against **60 new
  `session:build.*` keys ×13**. No migration, no route change.
- ⚠ **THE DISCIPLINE IS A TOKEN, NOT A LABEL — the same split as cut 5's Train tag and cut
  6's grocery aisle, for a REASON THAT IS NEITHER OF THEIRS.** Both of those were about a
  **record**: a translated value written to disk freezes a language into the member's own
  data. This one is not persisted at all — `bsRepeatSpec` and `bsMaterializeProgram` both
  destructure `discipline` and never use it. What it does is **cross the wire**: the builder
  posts it to `/api/ai/draft-program` as the model's prompt input. So a `tr()` on the chip's
  VALUE would send a **translated word to the model in twelve locales**, and the drafted
  program would come back shaped by a word the prompt never meant. The token stays canonical
  English; `bsDisciplineLabel` is the only thing a member reads. **A value can need the split
  because of where it GOES, not only because of where it is stored.**
- ⚠ **THE DAY LETTERS WERE HARDCODED ENGLISH — cut 5's `BSWeekStrip` defect at a second
  site**, and it had been sitting one screen away from the fix. `['M','T','W'…]` is now
  `bsWeekdayName(i, 'short')`, **memoised on `tr`** so a language switch re-derives them; a
  module-scope array would freeze whatever language was active when the module loaded (the
  live-plan lesson from 2026-08-30, applied at authoring time rather than after). It is a
  **REUSE of a shipped formatter, not seven new keys**.
- ⚠ **THE RATCHET DEFENDS ALMOST NONE OF THIS, WHICH IS WHY THE GUARD IS THE REAL DELIVERABLE.**
  The walk counted **46** strings here and cannot see **seventeen more**: the **eleven chip
  tokens** (module-scope ARRAY LITERALS mapped to elements — cut 7's first invisible shape),
  the **six plain-JS toast and status strings** (they never appear in JSX — cut 2's lesson),
  and the weekday letters. Reverting any of them leaves the ratchet, the parity gate, `tsc`,
  the build and the whole suite **green**. So the honest reading of the 46 is a **floor**, and
  the 60 authored keys are the honest count of the work.
- **`tests/broadsheet-builder-render.test.mjs` closes that, and it DRIVES rather than greps.**
  It mounts the real component under **a translator that renames every key** and asserts the
  markup carries the renamed keys and **not** the English words — so an equivalent rewrite
  passes and a hardcoded literal fails, which a spelling pin could not distinguish (the #1936
  lesson). A second mount against the **real `en` catalogs** proves the member still reads
  English, making every assertion a live check that its key resolves.
  ⚠ **Guard-the-guard first**: the mount is asserted to render the form, because on an empty
  screen most of the assertions pass vacuously.
- ⚠ **ITS SHARPEST ASSERTION IS NOT ABOUT COPY AT ALL.** The split has to hold in **both
  directions at once** — the member reads a translated LABEL while the writer receives the
  canonical English TOKEN — and half of that passing is the dangerous state, so both halves
  are pinned in **one** test: click the chip **by the word a member can see**, type a move,
  save, and assert `saveSession` received `discipline: 'run'` **and** that the renamed label
  was on screen. That is a claim about behaviour, so it is driven by a real jsdom mount, a
  real click and a real save.
- ⚠ **AND THE HARNESS ITSELF WAS THE BROKEN INSTRUMENT FIRST — three tests failed for a
  reason that had nothing to do with the component.** `react-dom` decides **at module init**
  whether it is in a DOM environment; required **before** the jsdom globals it never attaches
  its event listeners, so every click and keystroke landed on the DOM and **nothing reached
  React**. The component rendered, the assertions read a plausible screen, and the whole
  interactive half of the file tested nothing. Diagnosed with a **two-line probe** — a
  controlled `<input>` whose `onChange` never fired — rather than by re-reading the component,
  which is what kept it to one round. *Check the instrument before the finding*; the ordering
  is now written at the `require` so the next mount test inherits it.
- ⚠ **AND TWO OF THE EIGHT MUTATIONS FIRST REPORTED SURVIVORS THEY HAD NEVER LANDED FOR.**
  Both anchors were written from memory with the wrong whitespace (`['strength','run'…]`
  against the file's `['strength', 'run', …]`), so the edit threw before writing and the run
  measured an **unmutated tree**. Re-applied with the edit **proven present by a grep** first,
  both were killed. **A mutation that reports a survivor is a broken instrument until the
  mutation is proven to have landed** — this file's own rule, paid for again.
- **Three keys are REUSED rather than minted**, each checked byte-identical to the value it
  replaces: **`session:train.door.draft`** (the same ✦ CTA the Train door launches this very
  component with — a rename must move both), **`common:unit.weekN`** (minted as `common:` in
  cut 4 precisely so the next surface counting a week inherits it), and
  **`session:train.restChip`**. The short chrome vocabulary is minted locally on cut 5's
  precedent: the house carries several per-namespace copies of Close/Cancel/Rest **by
  design**, and collapsing them would couple screens that have no reason to move together.
- ⚠ **RECORD NAME DEFAULTS STAY ENGLISH, and the comment says why at the site.** `'My
  workout'` and `'My program'` are written **into** the member's own saved records, so
  translating them at the write is exactly the fault the grocery record-shape cut closed. The
  guard pins it: a save with an empty name must reach the writer as `'My workout'`.
- **The ratchet moved on the axes it should and not on the others.** `noneStrings`
  **1149 → 1103** · `none.length` **108 → 107** · fully covered **105 → 106**.
  **`partStrings` 164 and `part.length` 32 are UNCHANGED for the second cut running** — the
  assertion that says the cut is finished rather than half-done.
- **8/8 mutations killed** (the session discipline chips hardcoded · the experience chips
  hardcoded · **a translated token crossing the wire** · the record NAME translated at the
  write · the save toast back to a literal · the empty-form status back to a literal · the
  weekday letters back to a hardcoded array · an unkeyed discipline token added), sanity green
  at both ends and the tree restored clean.
- **Verified:** `npm test` **2522/2522** · `tsc --noEmit` 0 · JSX parse · tr-shadow clean on
  **both** grep forms · catalog parity + ICU ×13 (a pure append — 60 keys per `session.json`,
  224 → 284, LF, zero CR/NUL) · mobile build 0 with **all 60 keys and all 780 translated
  values confirmed in the emitted bundle**, the weekday derivation surviving minification
  (`[0,1,2,3,4,5,6].map(e=>wa(e,\`short\`))`, and **no** `"Mon","Tue","Wed"` literal in any
  chunk), and every `discipline:` in the emitted payload reading a bare identifier — never a
  label call. The bundle grep carries a **positive control** and an empty-haystack assertion,
  so a broken `cd` cannot read as a clean result (the trap this wave hit five times).

### 2026-08-31 — i18n cut 11: The Contract, and the namespace gate that had been blind

- **The Goals page is localized** — the surface a member opens to read what they committed
  to. `BSGoalsContract` carried **88 `tr()` calls where it had 0**; `BSClientGoals` (the page
  shell) went from zero to fully covered. **115 new `goal:` keys ×13**, one key reused
  cross-namespace. No migration, no route change.
- ⚠ **THE CUT REFUSED A `{kind}` PLACEHOLDER THREE TIMES, AND THAT IS THE HEADLINE.** The
  station label, the add-a-target action and the record link are each **three keys**, never
  one frame with `{kind}` interpolated — because `kind` is the **STORED discipline token**
  (`'training' | 'nutrition' | 'work'`), the value the goal doc is keyed by and the edit
  sheet writes back. Interpolating it renders the raw English id as copy in twelve locales.
  That is **cut 5's Train tag and cut 6's aisle arriving as a naming decision instead of a
  defect** — the first time in this wave the token/label rule was applied before it cost a
  round. The plan `role` is the same class and is pinned in both directions: compared with
  `.find()`, never rendered; the words come from `station.creditTrainer` /
  `creditNutritionist` while the coach-authored detail rides in as data.
- ⚠ **AND THE STRONGEST FINDING WAS NOT IN THE CUT — IT WAS THE GATE.** A namespace must be
  registered in **BOTH** the runtime `NS` array (`mobile-app/src/i18n/index.js`, what the app
  LOADS) and the parity gate's `NS` array (what gets VALIDATED). This file's own doctrine has
  said "or it ships ungated" since cut 3, and **nothing enforced it**. Measured, not assumed:
  with `'goal'` removed from the runtime array the **entire 2,539-test suite stayed green** —
  the catalogs kept being validated while the app never loaded them, so every `tr('goal:…')`
  fell back to its English `defaultValue` and **the whole cut silently reverted to English in
  twelve locales with every gate passing**. That is the worst shape a gate can have: present,
  green, and blind. Closed by **deriving both lists and asserting they agree in both
  directions**, plus a third direction nobody had considered — an `en` catalog on disk that
  neither list registers (authored and unreachable). **A rule written down in a comment is
  not a rule anything checks.**
- ⚠ **THE `unit` FOLD IS DELETED RATHER THAN TRANSLATED, and the reason is that `unit` is
  member-typed free text.** `String(unit).toUpperCase()` ran over a **six-character input**
  (`BSOverallEditSheet` renders it as a text field, not a two-value picker), and
  `toUpperCase()` is **locale-INSENSITIVE** — the Turkish dotted-i class this file has now
  paid for four times. The one render site already carries CSS `text-transform: uppercase`,
  which **IS** locale-aware through `<html lang>`, so deleting the JS fold **loses nothing on
  screen and fixes the fold**. Same for `BSOLCredit`'s credit line and the week door's
  `.toLowerCase()`. The authored words (BUILD/CUT/OF/THERE) keep their shipped casing: those
  are copy, and an i18n cut preserves copy rather than rewriting it.
- **The verdict module takes an INJECTED translator**, because it is module-scope and cannot
  hold a hook: `bsGoalVerdict({ …, tr })` routes all 15 strings through `goal:verdict.*` with
  the caller's **already-interpolated English** as the fallback, so **no ICU is ever evaluated
  on the path that exists precisely because the catalog failed to load** — the cut-1
  `bsWireLines` / cut-5 `bsTrainT` shape. **Two keys for up and down**, not one with `{dir}`:
  "up"/"down" is the verb of the sentence, and a locale that inflects around it cannot be
  served by swapping one word into a fixed frame.
- ⚠ **45 WALK-VISIBLE STRINGS AGAINST 115 AUTHORED, AND THE GAP IS A SEVENTH BLIND SHAPE.**
  The live plan rows (`setLivePlans`), the four weekly-target rows (`setLiveWeek`) and the
  five milestone objects are all built **inside local state setters** as arrays of
  `{ t, sub }`, so their ~30 member-facing strings sat outside the measurement while being
  most of the surface. Cut 7 recorded the array literal, cut 8 the module-scope array, cut 9
  the local array in a component; **this is the same absence one level further in.** The
  honest reading of any component's count stays a **floor**.
- ⚠ **THE ACCENT SPLIT IS DEFENSIVE, NOT LOAD-BEARING — and the mutation run is what settled
  it.** Swapping the codepoint pair back for the naive `slice(-1)`/`slice(0,-1)` **SURVIVES**:
  proven across every input including a terminal astral character, because the punctuation set
  holds **no astral mark**, so a lone low surrogate can never satisfy `leadDot` and the
  character-eating branch is unreachable. So this is **NOT** the About page's drop-cap defect
  (`charAt(0)` on a *leading* astral genuinely broke). Recorded as an equivalent mutant at both
  the site and the test, so the next reader neither deletes the codepoint form as dead nor
  spends a round writing the kill that cannot exist. **What the test DOES kill** is the
  load-bearing half: peeling unconditionally (eats a member-visible final character in every
  locale that does not end the sentence in a full stop) and dropping the `.join('')`.
- ⚠ **AND THE GUARD'S FIRST CUT READ THE WRONG 2,300 LINES.** Its slice ended at
  `function BSClientGoals(` — the page shell, far below — so it swallowed **twenty other
  components** and "found" three defects belonging to `BSCycleCalendarPage` and friends. All
  three were the guard, not the code. **Check the check before believing the finding**, for
  the sixth time in this wave; the end marker is now the next function.
- **`tests/goal-contract-i18n.test.mjs` DRIVES rather than greps** — a spelling pin survives
  any equivalent rewrite. It evaluates the three shipped discipline maps under a **renaming
  translator** and fails if two disciplines resolve to one key; evaluates the four accent lines
  against an astral final character; runs the **real** `bsGoalVerdict` under a **RECORDING**
  translator (several strings **nest** — `verdict.onPace` takes the already-translated
  `verdict.movedUp` as its `{moved}` — so a sentinel that ignores vars swallows the inner key
  and a naive output check reads it as "never reached the render"; asking-set is the honest
  instrument) and under **five** broken ones (throws · returns the key · empty · null · not a
  function); and checks **no locale authored an empty value**, which renders the **RAW KEY**
  under `returnEmptyString: false` — invisible to the parity gate, which only checks the key
  exists.
- ⚠ **THE ru/uk PLURALS ARE PINNED AT FOUR CATEGORIES, because an ICU message with only
  one/other PARSES FINE** — so the validity gate is happy while 2–4 renders the wrong form.
- **The ratchet moved in two directions at once**: `noneStrings` **1025 → 984** ·
  `none.length` **105 → 103** · fully covered **107 → 108** · `part.length` **33 → 34** ·
  `partStrings` **165 → 169**. ⚠ **`partStrings` RISING IS THE HONEST DIRECTION here, not a
  regression**: those four strings were already on screen and already counted — in
  `noneStrings`, where `BSGoalsContract` sat with all 45 of its walk-visible strings. 41 became
  keyed and 4 changed column. `BSGoalsContract` stays **PARTIAL by design** over the
  signed-out demo plan cards (two fabricated coach credits and their plan titles) — the same
  shape `BSClientEat` and `BSClientTrain` ended in; its **signed-in** branches are fully keyed.
- ⚠ **ONE KEY REUSED CROSS-NAMESPACE, THE REST MINTED, AND THE SWEEP WAS BY MEASUREMENT.**
  ~20 values matched a shipped `en` string byte-for-byte; each was put to the house test —
  *share only where a rename SHOULD move both*. Exactly one passed (`home:goal.eyebrow`, the
  same "Your goal" object Home already labels). The rest stay local on the cut-5 precedent
  that this house deliberately carries **nine** separate per-namespace `Close` keys, ten
  `Done` keys and 8–11 `Training`/`Nutrition` keys: collapsing them couples screens that have
  no reason to move together.
- **11 mutations — 10 killed, 1 documented equivalent**, sanity green at both ends of every
  batch and the tree restored clean. Killed: a `{kind}` frame · a door drifting off the shared
  map · the role compared against translated copy · peel-unconditionally · drop the `.join('')`
  · the `unit` fold restored · a verdict string un-keyed · ru dropping few/many · a locale
  authoring an empty value · a stale PARTIAL baseline entry · the device locale · a namespace
  unregistered at runtime · one dropped from the gate · the new guard's own matcher broken.
- **Verified:** `npm test` **2541/2541** · `tsc --noEmit` 0 · JSX parse · catalog parity **4/4**
  ×13 · the ratchet 9/9 · the new guard 9/9 · mobile build 0 with **all 115 keys and all 1,380
  translated values confirmed in the emitted bundle**, behind a positive control
  (`profile:role.trainer`) so an empty haystack could not read as an empty result.
- ⚠ **REGISTERED, NOT BUILT — the four goal SHEETS are still English** (`BSGoalEditSheet` ≈20
  chrome strings · `BSOverallEditSheet` 14 · `BSHeadlineEditSheet` 7 · `BSWeighInSheet` 8),
  and so is `BS_GOAL_TEMPLATES` (74) + `BS_GOAL_CATS` (9). The template cut needs **two
  rulings first**: whether an imperial member sees converted targets, and whether a chosen
  template's text is **stored** in the member's goal doc (in which case translating at the
  write freezes one language into their data — the record-shape fault this wave already paid
  for). The **primary-goal token/label split** is its own item: 12 stored values with **three
  writers** (`BSClientGoals`, `BSIntentStep`, `shapeBackend.js:899`).

### 2026-08-30 — The inventory walk stops missing this codebase's own chrome props

- **The blind spot cut 6 registered is closed.** `TEXT_PROPS` — the walk's JSX-attribute
  allowlist — held **seven** names (`placeholder · title · alt · aria-label · ariaLabel ·
  label · aria-valuetext`), all of them generic HTML/ARIA. This codebase's own chrome takes
  copy through props that were on none of them, so a string moved out of a `tr()` call and
  into `kicker={'…'}` passed the ratchet. Widened to **fifteen**, adding the eight this
  tree actually routes member-facing copy through: `kicker · eyebrow · meta · sub · note ·
  credit · helper · action`.
- ⚠ **EVERY ADDITION WAS VERIFIED AT ITS RECEIVING COMPONENT, NOT GUESSED FROM ITS NAME.**
  A prop earns a place only when the component renders it as text — so `kind · variant ·
  active · style · tone · role · pattern · idKey` stay out (they are tokens, and counting
  them would demand a translation for a string no member reads, which is the fabrication
  direction).
- ⚠ **AND `left`/`right` ARE EXCLUDED FOR A REASON WORTH MORE THAN THE EXCLUSION.** All
  **37** of their string literals go to **`<BSFooter>`** — and `BSFooter`'s entire body is
  `return null`. The page footnote was removed from every page and the component was kept
  as a no-op so its call sites still compile; its own comment says so. Admitting those props
  would have added 37 phantom untranslated strings for copy that cannot render.
- ⚠ **WHICH SURFACED A REAL COST: 364 AUTHORED TRANSLATION VALUES THAT RENDER NOWHERE.**
  Measured, not estimated: **64** `<BSFooter>` render sites, **zero** of them bare — every
  one passes props, and **39** of those props are `tr()` calls across **34 distinct keys**,
  of which **28 are footer-ONLY** (their every `tr()` call sits on a footer line). 28 × 13
  locales = **364 values** authored, reviewed and shipped for a component that returns null.
  The other six keys are shared with a live site and are fine. **Registered, not swept** —
  deleting a key is a catalog change across 13 files and belongs in its own cut; and the
  no-op is a shipped product decision, not a defect.
- ⚠ **AND THE FIRST CUT OF THE WIDENING WAS BLIND TO ITS OWN HEADLINE MUTATION — Codex
  caught it on the PR, and it was right.** The allowlist only fired when the literal's
  **immediate parent** was the `JSXAttribute` — true of `kicker="…"`, which is how the tree
  writes it, and **false of `kicker={'…'}`**, where the parent is the expression container.
  So the exact edit the widening exists to catch **still passed the ratchet**, along with
  every ternary and template value (`meta={live ? 'a' : 'b'}` and `` eyebrow={`Week of
  ${n}`} `` are ordinary shapes here). **Reproduced on a fixture before fixing: 1 of 5
  shapes counted.** My own mutation M1 had only proven the double-quoted form — *a mutation
  that passes is only evidence about the shape you mutated.*
- **The fix reuses `containerStrings()` rather than re-deriving the pruning**, because its
  rules are already right for an attribute value: it steps over nested JSX and over
  **`CallExpression`**, so a `kicker={tr('k', { defaultValue: 'v' })}` value stays
  **coverage** and is never counted as a hardcoded string.
- **The ratchet rose in TWO legs, and the second one is worth more than its numbers.**
  `partStrings` **134 → 138 → 164** · `noneStrings` **1026 → 1109 → 1181**. **Leg 1** (the
  allowlist) moved **no component between buckets** — +83 from the props (+4 partial, +79
  uncovered) plus +4 from the rename below; what was wrong was the volume, attributed by
  measuring all four combinations of old/new test × old/new source. **Leg 2** (walking
  attribute expressions) added 26 partial / 72 uncovered **and moved two surfaces**, so
  `part.length` **31 → 32**, `none.length` **109 → 110**, fully covered **103 → 102** and
  no-copy **116 → 115**. **A total that rises is only honest beside the change that raised
  it** — the mirror of this file's own rule about never lowering one to make a red run pass.
- ⚠ **AND MEASURING LEG 2 PROPERLY REFRAMED THE WHOLE PR: THE CONTAINER GAP PREDATES IT.**
  It is tempting to read leg 2 as *my widening had a bug*. Measured against the eight props
  held out — the container branch applied to the **ORIGINAL SEVEN** names alone — it is
  **+18 partial / +50 uncovered, and BOTH bucket moves**. So `title`, `label`,
  `placeholder`, `alt` and `aria-label` have been blind to their own braced, ternary and
  template values **since the allowlist was written**, and both surfaces that changed class
  did so on original-seven props (`placeholder={… || 'AB'}` and `` aria-label={`Message
  ${name}`} ``) — nothing to do with `kicker` or `eyebrow`. Four states, each measured
  directly rather than inferred: original-7/no-container **134 · 1030**, 15-props/
  no-container **138 · 1109**, original-7/container **152 · 1080**, shipped **164 · 1181**.
  ⚠ The four are **not additive** — props and container interact — which is why each is
  measured rather than subtracted, the same discipline this file demanded of the +4/+83
  split in leg 1.
- ⚠ **THE TWO SURFACES LEG 2 MOVED ARE OPPOSITE CASES, AND BOTH ARE REGISTERED WITH THEIR
  REASON RATHER THAN SMOOTHED.** **`BSSettings`** fell fully-covered → **PARTIAL** on
  **388 `tr()` calls and one string** — `placeholder={bsInitials(draft.name) || 'AB'}`, the
  two-letter stand-in on the avatar-initials field. No locale changes it, for the same
  reason none changes the shipped `+1 555 123 4567` phone example; it is recorded in the
  baseline rather than special-cased inside `usable()`, because **excluding a single
  spelling is the pin this file keeps paying for, and a false exclusion HIDES real copy.**
  **`BSSearchMsgBtn`** rose from *no user copy* → **UNCOVERED** on `` aria-label={`Message
  ${name}`} `` — a real gap (a Spanish screen-reader user hears the English verb) that was
  invisible while the walk read direct attribute literals only. **Registered, not patched:**
  the honest fix is an ICU key carrying the name (`Message {name}`) authored ×13, which is a
  translation cut — and concatenating a reused verb onto a name is the construction this
  repo already refused for ru/uk, so it is not the cheap fix it looks like.
- ⚠ **AND THE WIDENING IMMEDIATELY COLLIDED WITH A ONE-LETTER PROP NAME.** `BSNotifyPrefs`
  declared a local row component as `({ l, sub, right })` — so `sub` was now a copy prop on
  a component whose sibling `l` carried the actual label. Renamed `l` → `label` at the
  declaration, the render and all four call sites (*Mute everything · From · To · Daily
  limit*), which is why the rename contributes its own +4. **The alternative — adding a
  single letter to a tree-wide copy allowlist — would have made every `l=` in the codebase
  a candidate string.**
- **7/7 mutations killed across the two legs** — leg 1: drop the eight new props · re-admit
  `left`/`right` (fails two assertions) · leave the row component on `l`; leg 2: drop the
  container branch · restrict it to a braced literal so ternaries and templates escape ·
  stop pruning `CallExpression` so `tr()` defaultValues count as hardcoded · quietly drop
  the two new baseline entries. Sanity green at both ends of each batch, files restored
  byte-identically.
- Verified: `npm test` **2503/2503** · `tsc --noEmit` 0 · the ratchet 9/9 · JSX parse.

### 2026-08-30 — i18n cut 7: the universal search surface, and the three shapes one screen hid at once

- **Search Shape is localized** — the screen every header's ⌕ opens, on **all three role
  apps** (`BSUniversalSearch` is window-exposed and both coach shells render it). It carried
  **31 hardcoded strings**; `BSSearchMsgBtn` carried 1; `BSSearchFollowBtn` carried, by the
  walk's reckoning, **none**. **30 new keys ×13** (28 `common:search.*` + two that complete
  existing `profile:` families), **11 reused**. No migration, no route change.
- ⚠ **ALL THREE SHAPES THE WALK CANNOT SEE LANDED ON ONE SCREEN, WHICH IS WHY THIS CUT IS
  WORTH MORE THAN ITS NUMBERS.** The inventory reads JSX text and an attribute allowlist, so
  it is blind to copy in **an ARRAY LITERAL** (`[['all','All'], ['members','Members'], …].map`
  — the four filter chips), **a LOCAL ARROW FUNCTION's return**
  (`const roleLabel = (r) => … 'Trainer' … 'Nutritionist' … 'Member'`), and **a LOCAL CONST
  TERNARY rendered as `{label}`** (`st.following ? 'Following' : … : 'Follow'`). **Ten
  member-facing words, invisible.** Cut 4 found copy hidden in an array literal, the
  record-shape cut found it in stored data, cut 6 found it behind a prop name; this is the
  first screen to carry three at once.
- ⚠ **`BSSearchFollowBtn` READ `tr: 0, hard: 0` — "renders no user copy" — WHILE SHOWING AN
  ENGLISH VERB IN THIRTEEN LOCALES.** Localizing it moves **no string count at all**; it only
  leaves the no-copy bucket. That is cut 5's `BSWeekStrip` lesson at a third site: **a
  component sitting at zero/zero is not evidence that it renders nothing.**
- ⚠ **SO THE RATCHET DEFENDS NONE OF IT, AND THAT WAS MEASURED RATHER THAN ASSUMED.** With
  the Follow verb reverted to a hardcoded English literal: the **ratchet 9/9 green**, the
  **catalog parity gate 3/3 green**, the **key-resolution gate 8/8 green**, **`tsc` 0
  errors** — and only the new guard red. A revert of any of the three shapes ships silently.
- **`tests/broadsheet-search-render.test.mjs` closes that, and it DRIVES rather than greps.**
  It mounts the real surface under **a translator that renames every key** and asserts the
  markup carries the renamed keys and **not** the English words — so an equivalent rewrite
  passes and a hardcoded literal fails, which a spelling pin could not distinguish (the
  #1936 lesson). A second render against the **real `en` catalogs** proves the member still
  reads English, making every assertion a live check that its key resolves.
  ⚠ **Guard-the-guard first**: the seeded people rows are asserted present, because with no
  rows on screen seven of the nine assertions pass vacuously — proven by emptying the seed
  and watching them all fail.
- ⚠ **`${n} mutual` NEVER PLURALISED, EVEN IN ENGLISH** — and no language forms a plural by
  appending a letter; ru/uk need **four** categories. Now ICU, with the four-category forms
  pinned in the guard.
- ⚠ **AND THE POSSESSIVE WAS TWO STRINGS FOR ONE SENTENCE.** `Open ${p.name}'s profile` came
  out of the dump as **"Open"** and **"'s profile"**, because a template literal splits at its
  placeholder — so the walk's count is not a count of sentences either. One ICU key now, so
  each locale moves the words: de `Profil von {name} öffnen`, tr `{name} kişisinin profilini
  aç` (the suffix rides the Turkish noun, never the placeholder), **ru `Открыть профиль:
  {name}` / uk `Відкрити профіль: {name}` — a colon, because a name arrives in exactly ONE
  case and a governing preposition would demand another.** The same rule the Slavic
  weekday/coach-name pair cost cut 4 a round to learn.
- ⚠ **ELEVEN OF THE 41 CALL SITES REUSE A SHIPPED KEY RATHER THAN MINTING ONE**, each checked
  byte-identical to the value it replaces (**0 drift**). Five were found by sweeping the new
  values against every shipped `en` value rather than by memory: `feed:channels.count`,
  `feed:thread.memberCount`, `feed:channels.noneMatch` (the channels list already owns that
  exact sentence — the call site took its `{q}` and dropped a period to match),
  `coach:addClient.searchFailed`, and `session:splits.sessionFallback`. The sweep also
  **refused** five near-matches on the cut-3 test — *a rename should move both*: the house
  carries four separate `All` keys and two `Searching…` keys by design, and renaming the
  feed's filter chip must not rename search's.
- **The two minted `profile:` keys complete families rather than starting one.**
  `role.member` joins `role.trainer`/`role.nutritionist` (a rename of what Shape calls a
  trainer has to move every surface at once); `follow.followShort` exists because
  `follow.follow` carries a fullwidth ＋ this pill does not — **derived per locale by
  stripping that glyph from each catalog's own value**, so it can never drift from the verb
  it shortens.
- ⚠ **THE `noChannelsYet` SENTENCE NAMES TWO REAL TABS, SO THE WORDS COME FROM THE SHIPPED TAB
  CATALOGS AT AUTHORING TIME** — `common:nav.chat` + `feed:tab.channels` — rather than being
  retyped. tr reads *Sohbet → Kanallar*, ha *Hira → Tashoshi*, ru *Чат → Каналы*. A sentence
  that points at a label the tab does not carry is a small lie the parity gate cannot see.
- ⚠ **TWO SAME-AS-ENGLISH SETS, BOTH VERIFIED AGAINST THE SHIPPED CATALOGS RATHER THAN WAVED
  THROUGH.** de `Coaches` and `Workouts` are the house German loanwords — confirmed in the
  tree (`de/feed.json` `team.coaches` = `Coaches`, `de/profile.json` `coach.cat.workouts` =
  `Workouts`). pcm matches English on 12 single nouns and field labels, which is the
  legitimate creole pattern this file already records; its **prose** is real Naija Pidgin
  (*"You dey search too fast — wait small, den try again."*, *"People wey you fit know"*,
  *"Nothing for Shape match “{query}”."*). **Reading the shipped catalog is what separates a
  loanword from a leftover.**
- **The ratchet moved on two axes, and the two that did NOT move are the certification.**
  noneStrings **1181 → 1149** · none.length **110 → 108** · fully covered **102 → 105** ·
  no-copy **115 → 114**. **`partStrings` 164 and `part.length` 32 are UNCHANGED** — the
  assertion that says the cut is finished rather than half-done. The 32-string delta is a
  **floor**: ten of the words this cut localized were never in it.
- **10/10 mutations killed** (each of the three invisible shapes reverted to a hardcoded
  literal · the message verb concatenated onto the name · the possessive back as a template
  literal · the mutual count back to a ternary-appended `s` · a stale baseline entry kept ·
  the totals left un-repointed · a locale losing one of the new keys · the guard's own row
  seed emptied), sanity green at both ends of every batch and the tree restored clean.
- **Verified:** `npm test` **2503/2503** · `tsc --noEmit` 0 · JSX parse · tr-shadow clean on
  **both** grep forms · catalog parity + ICU ×13 (a pure append — 29/1 per `common.json`,
  3/1 per `profile.json` — LF, zero CR/NUL) · mobile build 0 with **all 30 keys and all 390
  translated values confirmed in the emitted bundle**.
  ⚠ **The first bundle grep read 30/30 missing** — a failed `cd` left it grepping a directory
  with no `.js` in it. **Saturated zero, broken instrument, for the fifth time in this wave**;
  the re-run carries a **positive control** (`profile:role.trainer`, a key that certainly
  ships) so an empty haystack cannot read as an empty result.
- ⚠ **REGISTERED, NOT WIDENED — the walk still cannot see those three shapes anywhere else.**
  Teaching it array literals, local arrow functions and local const ternaries would surface
  strings tree-wide and move every total, which is precisely why cut 4's widening and #1968's
  were each their own PR. Until then the honest reading of any component's `hard` count is
  **a floor**, and a `tr: 0, hard: 0` row means *the walk found nothing*, not *there is
  nothing*.

### 2026-08-30 — i18n cut 6 step 2: the grocery sweep, and two guards that were wrong about their own subject

- **The 366-string grocery surface cut 4 registered is closed.** Step 1 (#1966) split
  the aisle taxonomy into a stable token + a translated label — the design phase that
  register demanded. This is the string sweep on top of it: **93 keys ×13**, and all
  **four** grocery components land **fully covered**. `BSGroceryLibrary` (21 keys) and
  `BSCoachGroceryReview` (8) leave UNCOVERED; `BSGroceryBuilder` (18) and `BSGrocery`
  (~45 sites) leave PARTIAL. **No migration, no route change.**
- **It also closes the five `nutrition:eat.lib*` keys the record-shape cut deliberately
  left unauthored** — "they render English today and get authored ×13 by the grocery
  cut, when a translator is actually in scope." That is exactly what happened; a
  registered follow-up closed by the cut it was registered against, not by a sweep that
  forgot it.
- ⚠ **THE SWEEP FORCED OUT A LOCALE-INSENSITIVE FOLD, AND IT IS THE TURKISH DOTTED-I
  CLASS AT ITS SHARPEST.** The library search lowercased the query and the haystack with
  `.toLowerCase()` — correct while the eyebrow was an English literal, **wrong the moment
  this cut translated it**. `'I'.toLowerCase()` is `'i'` in every locale; Turkish
  lowercases `I` to `'ı'`. So a Turkish member could type the word they can **see on the
  row** and match nothing. Both sides now go through one locale-aware `fold()`. **A
  correct rule can be made wrong by translating the data it runs over** — the transform
  did not change, its input did.
- ⚠ **AND THE COACH REVIEW GROUPED ITEMS BY A TRANSLATED AISLE NAME**, so the grouping
  key moved with the reader's language: two coaches on the same list would bucket it
  differently, and a coach who switched language mid-review would see the groups
  re-shuffle. The key is de-translated back to the token and the fallback name is made at
  render — the token/label split step 1 shipped, applied to the one reader that had
  quietly picked the wrong side of it.
- ⚠ **AND I APPLIED THAT SPLIT TO ONLY ONE OF ITS TWO HALVES — Codex caught it on the
  PR.** De-translating the grouping key was right; what it missed is that `onAdd` writes
  the group onto every added grocery item as its **provenance subtitle**, so an unnamed
  coach list went from stamping `'Coach list'` to stamping `''` and those items silently
  lost the source line they carried before the cut. **The heading still read correctly,
  which is exactly what made it invisible**: a right heading over provenance-less items
  looks finished. The record now keeps the canonical **English token** while the heading
  renders the **translated label** — and writing the translated label into the record
  instead would have been the record-shape fault two bullets down, so there was no
  one-sided fix here. Both halves are pinned, because half of it passing is the dangerous
  state: the real mapping line is **driven** over a real grouping map, and the add path is
  asserted to write the token. **3/3 mutations killed** (revert the add path to the raw
  key · drop the `|| SOURCE_UNNAMED` fallback · translate the record token), sanity green
  at both ends and the file restored byte-identically.
- ⚠ **`groceryItem.meta` IS DELIBERATELY LEFT ENGLISH, AND THE REASON IS THE RECORD-SHAPE
  RULE THIS WAVE ALREADY PAID FOR.** It is **written into** the saved-library record, not
  rendered from it, so translating at the write freezes one language into the member's own
  data — the exact fault the grocery-eyebrow cut closed. It is a **library** field with
  **four writers** (workout · meal · plan · grocery) and **three readers** (the detail
  render, the search filter, the row), so fixing it at this one writer would split one
  column into two conventions. Registered as its own cut with the reason at the site.
- ⚠ **A GUARD WRITTEN IN THIS CUT HAD THE EXACT HOLE ITS OWN COMMENT WARNS ABOUT, ONE
  LAYER DEEPER.** Step 1's aisle-record ban was scoped by shape to avoid cut 5's
  vars-object trap — and matched the value with `[^,]+`, **which cannot cross the comma
  inside `bsAisleLabel(x, TG)`**. So the one mutation it exists to catch made the record
  **stop matching at all**, and an invisible record is not a caught one. Proven both ways
  on one real writer: the same mutation **survives** the old matcher and **fails** the
  widened `[^{}]*?` form, which still refuses a vars object (no `items:` sibling,
  unreachable across a `}`). **Scoping a ban by shape means the banned edit must not be
  able to destroy the shape.**
- ⚠ **AND THE FOLD FIX HAD NO GUARD AT ALL** — reverting it to `.toLowerCase()` passed
  every test. The new one **drives** it rather than grepping it (a spelling pin survives
  any equivalent rewrite): the fold is extracted from the shipped file and evaluated under
  a stubbed locale, and must answer `'I' → 'ı'` under **tr**, `'i'` under **en**, and
  **degrade rather than throw** on a locale the runtime rejects.
- **11 mutations — 9 killed, 1 invalid, 1 registered**, sanity green at both ends and the
  file restored byte-identically.
  ⚠ **The invalid one is worth more than the nine kills.** The first aisle-record match in
  the file sits **inside a comment**, which the guard strips before scanning — so the
  mutation landed in the file and **not in the region under test**. It reported as a
  survivor and was a **no-op**. This file already records "a mutation that reports a
  survivor is a broken instrument until the mutation is proven to have landed"; the
  correction is that landing in the **file** is not landing **where the guard looks**.
- ⚠ **THE REGISTERED SURVIVOR IS A THIRD FACE OF THE MEASUREMENT'S BLIND SPOT, AND IT IS
  BIGGER THAN SEVERAL SHIPPED CUTS.** Moving a string from a `tr()` call into
  `kicker={'…'}` passes the ratchet, because the walk's `TEXT_PROPS` allowlist holds
  **seven** attribute names (`placeholder · title · alt · aria-label · ariaLabel · label ·
  aria-valuetext`) and this codebase's own chrome takes copy through **`kicker` ·
  `eyebrow` · `right` · `left` · `sub`**. Measured: **91 such literals across the
  broadsheet** — page kickers, footer labels, section eyebrows, all member-facing, all
  outside the measurement. Cut 4 found copy hidden in an **array literal**; the grocery
  record-shape cut found it hidden in **stored data**; this is the same absence hidden in
  a **prop name**. **Registered, not widened** — widening `TEXT_PROPS` adds components and
  strings tree-wide and moves every total, which is precisely why cut 4's widening was its
  own PR.
  ⚠ **SHIPPED 2026-08-30 (entry above) — AND THE REGISTER WAS WRONG ABOUT TWO OF THE FIVE
  PROPS IT NAMED.** `right` and `left` are **not** member-facing: all 37 of their string
  literals go to `<BSFooter>`, whose body is `return null`. So the honest gap was **83**
  strings across eight props, not 91 across five — and the two the register got wrong were
  the ones it described as *"footer labels"*, which was the clue. The correction cost
  nothing (they were excluded) and bought a bigger finding: **28 footer-only i18n keys ×
  13 locales = 364 authored values that render nowhere.** **A prop earns a place on a copy
  allowlist at its receiving component, never from its name.**
  ⚠ **And the first attempt to size it read ZERO on all seven arms** — the pattern allowed
  only single quotes while the tree writes `kicker="…"`. A saturated result across every
  arm is the instrument, not the finding; the positive control (`title=`, which IS on the
  allowlist) is what separated the two.
- **The ratchet moved on all four axes**: partStrings **182 → 134** · part.length
  **33 → 31** · noneStrings **1045 → 1026** · none.length **111 → 109** · fully covered
  **99 → 103**.
  ⚠ **`BSGrocery`'s `tr` count did NOT move — it reads 2 before and after — while its
  hardcoded count went 31 → 0.** The detector counts references to the translator
  **binding**, and this sweep calls through the injected wrapper `TG = bsTrainT(trG)`,
  which is a derived local it does not recognise. `hard` is the honest signal there, not
  `tr`: **the two numbers answer different questions**, and a flat `tr` is not evidence a
  component was skipped.
- **Verified:** `npm test` **2503/2503** · `tsc --noEmit` 0 · JSX parse · mobile build 0
  with **all 93 keys and all 1,209 translated values confirmed in the emitted bundle** ·
  catalog parity ×13 (a pure append, LF, zero CR/NUL).
  ⚠ **The first bundle grep reported all 88 keys missing** — it read the largest chunk
  rather than the client one. Saturated zero, broken instrument, **for the fourth time in
  this wave**; the fix each time is a positive control, not a re-read of the source.

### 2026-08-30 — The grocery aisle becomes a token and a label, because it was already logic

- **`aisle` is not a heading.** It is stored on every item of every saved grocery list,
  it is the grouping key, **and** it is compared against a freshly-classified aisle on
  every add — `aisles.findIndex(a => a.aisle === bsGroceryAisleFor(name))`. So a `tr()`
  on the classifier's output does not rename a header: **a list saved in English and
  reopened in Spanish stops matching its own groups, and every added item forks a
  duplicate aisle** — silently, in twelve locales, with parse, `tsc`, the suite and the
  build all green. This is **cut 5's Train-tag lesson at a second place where the id and
  the word were the same string**, and it needed the same answer: the token stays
  canonical English, **`bsAisleLabel(aisle, T)`** is the only thing a member reads.
  **11 `nutrition:aisle.*` keys ×13.** No migration — every stored token is unchanged.
  ⚠ **It shipped as TEN and the eleventh is the Codex bullet below** — `'Items'`, the one
  token this file said was unreachable. The figure is corrected here rather than left to be
  reconciled four bullets down, because a summary line is what a skim takes away.
- **Routed at the four READ sites and at none of the others.** The checklist header + its
  `aria-label`, the builder's aisle pills, the builder's per-item line, and the Eat tab's
  shop-list door meta. The comparisons, the `openAisles` set, `filledAisleNames`, the
  grouping filters and `bsNormalizeGroceryList`'s store all keep the raw token — pinned
  in both directions, because half of this passing is the dangerous state.
- ⚠ **THE COVERAGE CHECK IS DERIVED FROM THE SOURCE, NEVER HAND-LISTED.**
  `tests/grocery-aisle-token.test.mjs` reads the two classifier tables, the classifier's
  own `return` statements, the builder's pill list and the normalizer, and fails if any
  token it finds has no catalog key. **An enumeration is not a proof that the enumeration
  is complete** — this file has now recorded that for CSS, for a logic token, and for a
  stored record; deriving it is the only version that survives the next aisle.
- ⚠ **AND IT HAD TO LEARN TO IGNORE A DISCRIMINANT.** The normalizer picks its aisle with
  a ternary — `list.kind === 'recipe' ? 'Recipe ingredients' : 'Library items'` — so
  collecting every quoted string on that line demanded a catalog key for **`recipe`** and
  **failed on a correct tree**. A false alarm is the safe direction for a scan like this,
  but it is still wrong: what separates a discriminant from a value is the comparison, so
  the scan strips the right-hand side of `===`/`!==` first and keeps what is assigned.
- ⚠ **TWO CASE TRANSFORMS NOW RUN OVER TRANSLATED TEXT, AND BOTH WERE CORRECTED IN THE
  SAME EDIT.** `toUpperCase()`/`toLowerCase()` are **locale-insensitive** — the Turkish
  dotted/dotless-i class this file already records twice — and these were the only two
  places a case transform ever touched an aisle name, which is exactly why they were
  harmless until the name became translatable. The share text upper-cases through
  `toLocaleUpperCase(bsDateLocale())`; the Eat door **dropped its `.toLowerCase()`
  entirely**, because how an aisle name sits in a meta line is the catalog's call rather
  than a transform's — the ruling cut 4 made for the swap-day token. Both bans are pinned.
- ⚠ **THE RATCHET MOVED BY EXACTLY ONE COMPONENT, AND THAT IS THE TELL THAT THIS IS A DATA
  CHANGE RATHER THAN A COPY CHANGE.** `BSGroceryBuilder` gained a translator and moves
  **UNCOVERED → PARTIAL** carrying its own 17 hardcoded strings (`noneStrings`
  **1062 → 1045**, `none.length` **112 → 111**, `part.length` **32 → 33**, `partStrings`
  **165 → 182**). **`BSGrocery`'s count does NOT move** — its aisle headers were never JSX
  literals, they came out of the list record, so the walk could not see them before and
  cannot see them now. What changed is that they are translatable at all.
- ⚠ **AN UNKNOWN TOKEN RENDERS AS ITSELF — never a raw key, never blank.** A
  nutritionist's hand-authored aisle arrives as free text and has no key by construction.
- ⚠ **AND CODEX FOUND THE ONE TOKEN I HAD EXCLUDED, WHICH IS THE ONLY ONE THAT WAS LIVE.**
  I left `'Items'` unkeyed AND deleted it from the coverage guard's own set, on this file's
  standing claim that it is *"unreachable behind `BSGrocery`'s empty-aisle early return"*.
  That is true of an EMPTY list and false the moment a member types into one: **two facts
  meet, and neither is visible from the other's site** — `confirmCreateGroceryList` seeds a
  member-made list with `aisles: [{ aisle: 'Items', items: [] }]`, and `BSGrocery`'s
  `addItem` **does not classify** — it pushes into `aisles[0]`. So the first item typed into
  your own list lands in `'Items'`, the aisle stops being empty, its header renders, and
  twelve locales read English. **The exclusion hid the one live path the scan exists to
  find.** Keyed ×13 (11 keys now), the exclusion deleted, and a regression test pins BOTH
  facts so a change to either says which one moved. **A token that genuinely cannot render
  should be deleted from the SOURCE, never from the guard.**
- ⚠ **AND THE ADD PATH ITSELF IS INCONSISTENT — REGISTERED, NOT WIDENED.** `addItem` files
  into `aisles[0]` whatever the item is, while the **voice** path one function down calls
  `bsGroceryAisleFor` and `BSGroceryBuilder`'s own add auto-sorts. So on any multi-aisle
  list, typing *chicken breast* files it under whatever aisle happens to be first. That is
  a product defect, it predates this cut, and fixing it would move where members' typed
  items land — its own change, not a drive-by at merge time. It does **not** retire the key:
  lists already saved with items under `'Items'` still render it.
- ⚠ **THE ARIA-LABEL IS HALF-TRANSLATED ON PURPOSE, FOR ONE PR.** The checklist header's
  announced sentence is still `"{aisle}, N of M got"` — the aisle name is translated, the
  frame is not. The alternative was leaving the **token** in the sentence, so a screen-
  reader user would hear the English id while a sighted member read the translated label,
  which is worse. The frame is part of the component sweep below.
- ⚠ **AND THE STALE COMMENT SURVIVED INTO MY OWN DIFF — the pre-merge review caught it.**
  `bsAisleLabel`'s comment argued the fallback's case using `'Items'` as *"a string no
  member sees"*, **two lines under the map that now keys it**. The map was corrected; the
  because-clause under it was not. That is worse in a comment than in prose: the next
  reader is deciding whether a new aisle belongs in the map or can be left to the fallback,
  and the comment was arguing for the fallback **with the one example that had just been
  proven reachable**. The fallback's real job is the case it cannot enumerate — a
  nutritionist's hand-authored aisle; every aisle our own code emits belongs in the map,
  and the guard derives that set so a new one fails there.
- ⚠ **AND SCOPING THE SWEEP MEASURED IT — ~70 KEYS, NOT ~356.** Enumerated per component
  (JSX text, template strings, `aria-label`/`placeholder`, single-quoted literals, minus
  style values): **BSGroceryBuilder ~13 · BSCoachGroceryReview ~7 · BSGrocery ~35 ·
  BSGroceryLibrary ~13**, plus the five `nutrition:eat.lib*` keys. **The gap between 356
  and 70 is not error, it is category:** the residue is ingredient names and quantities
  (the cut-3 ruling — one data column must not go bilingual), the built-in list NAMES
  (`Sunday staples` · `Travel week` · `7-day Mediterranean` · `High-protein cut` ·
  `Plant-forward build`), and the `'New list'` default a member edits — all of which the
  house has already ruled stay. **Five sites are concatenated English plurals** and become
  ICU: `{n} items`, `{n} items · {n} aisles`, `Added {n} item(s) from voice`, `{n} lists`,
  and the aria frame above.
- **The sweep is the NEXT PR, deliberately.** The split is a design change with real
  breakage risk and deserves its own review; the string sweep is mechanical. It carries the
  five `nutrition:eat.lib*` keys the record-shape cut left deliberately unauthored, because
  a key with no reader is a key nobody can check.
- ⚠ **SHIPPED 2026-08-30 as step 2 (entry above) — AND THE ~70 ESTIMATE UNDERCOUNTED BY
  ~30%.** The sweep authored **93 keys** (88 `nutrition:grocery.*` + the five
  `nutrition:eat.lib*`) against the ~73 this register projected. The category reasoning
  above held — every residue it named stayed out — but **an enumeration by eye is not a
  measurement**: the per-component counts missed aria frames, toasts and share-text lines
  that only surface once you are editing the call site. The direction to take from it is
  the one this file already applies to caller lists and CSS families: *an enumeration is
  not a proof that the enumeration is complete*, and it undercounts as readily as it
  overcounts.
- ⚠ **AND SCOPING IT CORRECTED THE FIGURE THE RECORD-SHAPE CUT LEFT BEHIND — "366 strings"
  IS A COUNT OF CSS VALUES.** That register read *"the real size is a 366-string cut, not a
  seven-string item (`BSGrocery` 186 · `BSGroceryBuilder` 102 · `BSGroceryLibrary` 78)"*, and
  the direction was right — seven was far too small — but the magnitude is a count of
  **literals**, not of user copy. Counted with the method stated so the next reader can
  re-derive it (region = each function's body from its `function X(` line to the next
  column-0 `function`; pattern = a single-quoted `'…'`): the three components hold **684**
  literals, **284** of them style values, units, colors or empty strings. `BSGrocery` alone
  is **427 / 168**, and its most frequent literals of any kind are `'flex'` ×15,
  `'uppercase'` ×15, `'pointer'` ×14, `'center'` ×14, with the state tokens `'rec'` ×12 and
  `'busy'` ×7 close behind. No locale changes any of them. **The ratchet's own walk is the
  honest instrument** — `BSGrocery` **31** · `BSGroceryBuilder` **17** ·
  `BSGroceryLibrary` **14** · `BSCoachGroceryReview` **5** = **67** attributed strings.
- ⚠ **AND MY OWN FIRST CORRECTION CARRIED A NUMBER I COULD NOT RE-DERIVE AN HOUR LATER.**
  It read *"276 such literals, of which at least 112 match a narrow CSS/logic allowlist"* —
  figures that reproduce under no region boundary or pattern I tried (the stated method gives
  427/168; 222 is the unique-literal count). **That is the same failure this entry is about,
  committed inside the correction**: a number quoted without the method that produced it.
  Neither is 366 reproducible, so the claim here is about KIND, not provenance — the register
  counted literals rather than copy. Every figure above now names how to get it back.
- ⚠ **AND THE HONEST NUMBER IS A FLOOR, NOT A CEILING — cut 4's headline, which is why 67 is
  not simply "the answer" either.** The walk does not attribute object-literal properties,
  template strings or array literals, and `BSGrocery` renders most of its copy from the list
  record and from `${…}` metas. So the sweep is scoped by READING the render path, with 67 as
  the part a guard can see. **A figure that inflates the work fivefold and a figure that
  undercounts it are the same failure** — a number nobody re-derived, quoted forward.
- **7/7 mutations killed** (translate the comparison · a header renders the raw token ·
  a new aisle token with no catalog key · the bare `toUpperCase()` returns · the door
  lower-cases again · a locale loses one of the ten keys · a saved record stores the
  label), sanity green at both ends and the tree restored clean after each.
- Verified: `npm test` **2500/2500** · `tsc --noEmit` 0 · JSX parse · catalog parity ×13
  (a pure append, 10 keys each, LF, zero CR/NUL) · mobile build 0 with **all 10 keys, five
  locales' values and both `findAisle` comparisons still reading the raw token confirmed
  in the emitted bundle** (`findIndex(e=>e.aisle===n)` ×2, zero labels in a comparison).

### 2026-08-30 — The live Train week and Eat menu stop freezing the language they were built in

- **A member who switches language in-app kept reading the old one on both primary
  tabs.** `bsBuildTrainProgram` and `buildMealProgram` bake `tr()` output — kicker,
  titles, tags, headline, meta, the rest-day copy — into every day of the week they
  return, and **both loaders run ONCE in a `[]`-dep effect**, so holding the built
  week in React state pinned it to whatever language was active at mount. State now
  keeps the **RAW** plan data (`p.training.workouts` / `p.meals.days`) and the week is
  derived in a `useMemo` keyed on `[…, t, tr]`.
- ⚠ **THIS IS THE RECORD-SHAPE DEFECT ONE LAYER IN, AND IT SHIPPED IN THE SAME WAVE
  AS THE FIX FOR IT.** A saved grocery list that stores a rendered sentence freezes a
  language into the member's own data (entry above); a built week held in state freezes
  one into the session. Same rule either way — **keep the raw data, make the sentence at
  render** — and the state case is exactly as invisible, because nothing in the app
  re-renders wrong: it renders *stale*.
- ⚠ **TRAIN WAS THE LOUDER HALF, AND THE REASON IS THE INTERESTING PART: HALF OF IT
  ALREADY WORKED.** `bsApplyTrainAdjust` **does** re-run on `[t, tr]`, so after a
  language switch the coach-adjust copy moved to the new language **over a frozen
  English week** — a half-translated screen rather than an honestly stale one. A
  partially-correct dependency graph reads as a rendering bug, not a data-shape one.
- ⚠ **AND THE EAT TWIN WAS FOUND BY LOOKING, NOT BY BEING TOLD.** Codex flagged the
  Train site on #1962; the identical defect sat one tab over at the meal loader, which
  it never saw because it reviewed the Train PR. **One instance reported is a class to
  sweep** — this file's own recurring lesson, and the second time in two days that
  fixing where a finding was reported would have left the twin shipping.
- ⚠ **THE TRAIN LOADER'S OWN DEPS WERE CORRECTED WITH IT.** `loadPlan` was a
  `useCallback` on `[t, tr]` **because it used to translate**; it stores raw data now,
  so those deps are a stale signal that it still does — the exact thing the next reader
  checks. It declares `[]`, which is also what it actually has.
- **`tests/live-plan-locale.test.mjs`** pins both sites in both directions: the loader
  stores raw data and **must not** wrap the builder in the setter, and the memo's real
  dependency array is **read and asserted to contain `tr`** (a memo keyed on the raw
  data alone would freeze exactly as badly). ⚠ Guard-the-guard first — it asserts **two**
  derived memos exist, so a rename cannot make every later assertion pass vacuously.
  ⚠ And it **strips comments before asserting**, because the rationale written at each
  site quotes the very calls it bans; this repo has now paid for that trap twice in one
  wave.
- **4/4 mutations killed** (store the built week on Train · store the built menu on Eat ·
  key a memo on the raw data alone · restore the loader's stale `[t, tr]`), sanity green
  at both ends and the file restored byte-identically after each.
- **Verified in the EMITTED BUNDLE, not the source** — Train
  `K.useMemo(()=>y?Ta(y,o,s):null,[y,o,s])` and Eat
  `K.useMemo(()=>R?ae(R):null,[R,a,s])`, both loaders storing the raw property
  (`b(e.training.workouts)` · `z(t.meals.days)`) with no builder call inside the setter.
- Verified: `npm test` **2490/2490** · `tsc --noEmit` 0 · JSX parse · mobile build 0.

### 2026-08-30 — A saved grocery list stops storing an English sentence (the record-shape change cut 4 registered)

- **Cut 4 registered seven grocery strings as a class `tr()` cannot close**, because they
  are **written into the member's saved list record**, not rendered from it: translating at
  the moment of the write freezes one language into their own data forever. This is that
  change — the **data shape**, not the sweep. A record now stores a **token**
  (`provenance` + `createdAt`); **the render makes the sentence.** No migration; the stored
  string is the back-compat path.
- ⚠ **AND THE FROZEN LANGUAGE WAS THE SMALLER HALF — THE STORED SENTENCE WAS ALSO A LIE
  IN ENGLISH.** The eyebrow was persisted as the literal `'Custom · Created today'`, so a
  list created in June still read **"Created today"** in August, on every open, forever.
  Nothing could correct it: the word `today` was in the member's data. It now renders
  `Created today` only when `createdAt` **is** today and dates itself otherwise
  (`Custom · Created 14 Jul`), in the member's **selected UI language** via `bsDateLocale()`
  — not the device's. **A record that stores a rendered sentence cannot stay true**, and the
  i18n argument found it only because it forced someone to read where the string came from.
- ⚠ **`'You'` IS NOT A NAME EITHER, AND THAT ONE WAS ON SCREEN.** The custom-list store
  writes `author: 'You'`, and the Eat-tab byline runs its author through a **first-name
  extractor** (`.replace(/^Dr\.?\s+/i,'').split(' ')[0]`) — so a member opening their own
  saved list read **"From You · this week"**, and in the other twelve locales an
  untranslated English pronoun sitting inside a translated sentence (*"De You · esta
  semana"*). **This is the exact defect cut 4 closed for the role noun**, still live one
  store over: *a value that feeds a name-parser may only ever be a name*. A member's own
  list is now credited to **nobody** — `nutrition:eat.fromYourList` ×13 — and
  `bsGroceryIsSelfAuthored` gates the extractor at the one call site.
- ⚠ **THE EMPTY STATE MOVED OUT OF THE RECORD AND INTO THE RENDER, WHICH RAISED THE
  RATCHET.** `'Empty list'` was baked into `preview` by four writers — and a fifth wrote
  **`'Empty'`**, a different word for the same state, which is precisely what a single
  render site prevents. Moving it makes it **visible to the inventory walk for the first
  time**: `noneStrings` **1061 → 1062**. **This is the `BSWeekStrip` blind spot in
  reverse** — that component read `tr: 0, hard: 0` while drawing English on two primary
  tabs; here a string was invisible because it lived in a member's record rather than in
  JSX. **A number that goes UP is only honest beside the change that raised it**, and the
  reason is written at the assertion.
- ⚠ **AND THE PRE-MERGE DIFF REVIEW FOUND THE ONE PLACE THE TWO COPIES CAN NOW
  DISAGREE.** The library's search filter matched `l.eyebrow` — the **stored**
  string — and the moment a record carries a token rather than a sentence those two
  part company: a dated list stores *"Created today"* and renders *"Created 14 Jul"*,
  so searching matched text the member **cannot see** and missed text they **can**.
  It reads `bsGroceryListEyebrow(l)` now, which is the same principle as the change
  itself: **the render is the truth.** ⚠ And the assertion banning the stored read
  **fired on its own explanation** until it stripped comments first — the rationale
  above that line names the very thing it bans. This file has recorded that trap
  before and it re-appeared the moment the assertion was written.
- ⚠ **AND CODEX FOUND A P2 I MERGED PAST — the same defect, wearing my own fix.**
  `persistGroceryList` is the **UPDATE** path (`BSGrocery`'s `onUpdate` is its only
  caller), so it cannot know when a record was created — and it stamped
  `provenance: 'created'` + `Date.now()` anyway. So editing one item on a legacy row,
  or on a built-in like **"Sunday staples"** (`Custom · Updated last Sun`) or the
  **"Meal plan · Cutting"** seed, **relabelled it "Custom · Created today"** and synced
  that fabricated date across devices — a stored sentence turned into a *worse* lie by
  the change that existed to stop it. An edit now carries provenance through and invents
  nothing; a record without one keeps its stored eyebrow, which **is** the back-compat
  path. ⚠ **The process failure is mine, not the reviewer's:** Codex auto-fired on the
  first commit and its finding was sitting on the PR, unread, while I merged the second.
  **A reviewer's already-posted record is free to read and this house's own rule says
  read it** — I checked CI and not the thread.
- ⚠ **THE `Number(null)` TRAP IS GUARDED AT THE STAMP READ, NOT ASSUMED AWAY.**
  `Number(null)` and `Number('')` are a finite **0**, so a legacy row with no `createdAt`
  would date itself to **1 Jan 1970** — the coercion class this file has now paid for four
  times. The read is type-strict (`typeof === 'number' && Number.isFinite`), and the test
  drives all six shapes (`undefined · null · '' · 'today' · NaN · {}`) through the **real**
  function.
- **The translator is INJECTED and optional** (`bsGroceryListEyebrow(list, tr)` over
  `bsTrainT`), with the shipped English carried at every call — the cut-1 shape. So the
  five `nutrition:eat.lib*` keys are **deliberately left unauthored**: they render English
  today and get authored ×13 by the grocery cut, when a translator is actually in scope.
  **A key with no reader is a key nobody can check.** ⚠ **AUTHORED ×13 on 2026-08-30 by cut 6
  step 2, exactly as registered — a follow-up closed by the cut it was registered against.**
- ⚠ **AND THE REGISTER WAS SHORT — the same failure as the Train-tag register, one entry
  later.** One of its seven strings is **dead** — `note` has had no render site since the
  quote box was removed 2026-06-04. (⚠ **This said TWO, counting `'Items'` as unreachable
  behind an empty-aisle early return. Codex refuted that on 2026-08-30: a member's first
  typed item lands there, because `addItem` files into `aisles[0]` and a new custom list is
  seeded with exactly one — `'Items'`. Corrected at the cut-6 entry above.**), and it omitted the `(copy)` suffix and **the whole aisle taxonomy** — ten
  strings that are stored on every item, used as grouping keys, rendered as headers **and**
  exported into the share text, i.e. the Train token/label split again. It is a
  cut of its own, not a line item. Corrected in place above. ⚠ **CORRECTED 2026-08-30 — THAT FIGURE IS A COUNT OF CSS VALUES.** It is a raw
  LITERAL count, not user copy: under a stated method (each function's body to the next
  column-0 `function`; pattern `'…'`) the three components hold **684** literals, **284** of
  them style values, units, colors or empty strings — `BSGrocery` alone 427/168, its most
  frequent being `'flex'` ×15, `'uppercase'` ×15, `'pointer'` ×14. The ratchet's own
  walk attributes **67** strings across the four grocery components (`BSGrocery` 31 ·
  `BSGroceryBuilder` 17 · `BSGroceryLibrary` 14 · `BSCoachGroceryReview` 5) — **and that
  is a FLOOR**, because it cannot see the record-driven and template-string copy
  `BSGrocery` mostly renders. A figure that inflates the work fivefold and one that
  undercounts it are the same failure: a number nobody re-derived, quoted forward.
- **12/12 mutations killed**, sanity green at both ends — and **two of them survived their
  first assertion**, which is the part worth keeping. (1) A ban on the baked empty state
  used `[^,\n]*`, a character class that **cannot cross the commas in `slice(0, 3)`** — so
  it was structurally incapable of matching the line it banned. (2) A stamp check compared
  **counts** (`stamps.length >= provs.length`), which is satisfiable by a stamp on a
  *different* writer: dropping one left `6 >= 6` and passed. It walks the enclosing object
  per match now, with a guard-the-guard floor. *Check the check before believing it.*
- ⚠ **AND A BUNDLE GREP READ ZERO FOR THE THIRD TIME IN THIS WAVE, FOR A THIRD REASON.**
  `trim()==="You"` is absent from the emitted bundle because **minification rewrites string
  literals to backticks** — the real form is `` String(e.author||``).trim()===`You` ``. A
  saturated zero is the instrument until proven otherwise.
- Verified: `npm test` **2483/2483** · `tsc --noEmit` 0 · JSX parse · mobile build 0 with
  all 13 new values, all five English fallbacks and the full byline chain confirmed **in the
  emitted bundle** · catalog parity + ICU + placeholder gates ×13 (a pure append, 1 key each,
  LF, zero CR/NUL) · the ratchet 9/9 · the new guard 9/9.

### 2026-08-30 — i18n cut 5: the Train tab, and the string that could not be translated where it stood

- **The Train deck is localized** — the tab a member opens to do the work.
  `BSClientTrain` carried **42 `tr()` calls where it had 0**; `BSWorkoutPreview` and
  `BSBuildDoor` went from zero to fully covered. **90 new `session:train.*` keys ×13**,
  appended as this wave's own run. **No migration, no route change.**
- ⚠ **THE REGISTERED BLOCKER WAS REAL, AND IT WAS THE WHOLE DESIGN OF THE CUT.** The
  2026-08-30 entry recorded `bsBuildTrainProgram` as *"registered, not swept"* because
  its tags **cannot be translated where they are**: `tag` is **both a rendered chip and
  a live logic token**, and four readers key off the English word — `cur.tag === 'REST'`
  (the deck's rest state), the week strip's `restFlags` on **two** primary tabs, the
  on-deck rows, and `BSWorkoutPreview`'s own rest branch. A `tr()` on that value stops
  the app recognising a rest day **in all twelve non-English locales**, silently, with
  parse, `tsc`, the build and the whole suite green.
- **So the fix is a token/label split, not a `tr()` sweep.** `tag` stays the canonical
  English token; **`tagLabel`** is the string a member reads; **one** function
  (`bsTrainTagLabel`) maps between them through `BS_TRAIN_TAG_KEY`, and every writer
  sets both while every reader picks its side deliberately. **This is cut 2's vibe-label
  lesson** (key off a stable id, never the English word) **at a place where the id and
  the word were the same string** — which is why it needed a design change rather than
  a careful hand.
- ⚠ **THE SPLIT IS GUARDED IN BOTH DIRECTIONS, because half of it passing is the
  dangerous state.** `tests/train-tag-token.test.mjs` drives the **real builders** under
  a translator that renames every key, and asserts the token survives while the label
  moves; then pins the readers — rest detection compares `.tag` and never `tagLabel`,
  the register renders `tagLabel`, and every Train writer sets both.
  ⚠ **The writer scan is scoped to the VALUE, not the key, and that correction is the
  interesting part**: a bare `/tag:/` also matches a `tr()` **vars object**
  (`tag: meal.tag` on the meal logger) and the **Eat demo week**, which carries
  `tag: 'COND'` purely to drive its own rest flags and renders it nowhere. The token
  vocabulary is **shared across two unrelated shapes** — demanding a label there would
  be demanding a translation for a string no member ever reads.
  **4/4 mutations killed** (translate the token · rest detection reads the label · the
  register renders the raw token · a writer drops its label), sanity green at both ends.
- ⚠ **AND THE GUARD IMMEDIATELY FOUND A THIRD WRITER I HAD MISSED.**
  `bsBuildDemoTrainProgram` also emits `tag: 'REST'` — the signed-out demo week, which
  takes **no translator at all**. Exempted rather than "fixed": its whole day shape is
  demo copy the house deliberately does not translate, so no `tagLabel` and an English
  fallback is **coherent, not half-applied**. The exemption is pinned to that one
  function **and asserts it is still the demo path** (`bsBuildDemoTrainProgram(t)`, one
  argument), so it cannot silently widen over a live writer later.
- ⚠ **AND THE WEEK STRIP WAS RENDERING HARDCODED ENGLISH DAY LETTERS ON TWO PRIMARY
  TABS, INVISIBLY.** `BSWeekStrip` built `['M','T','W','T','F','S','S']` and a full
  weekday name list as **array literals** — which the inventory walk does not attribute
  to a component — so it read **`tr: 0, hard: 0`**, i.e. *renders no user copy*, while
  Train **and** Eat drew English initials above every day in all thirteen locales.
  `bsWeekdayName` was widened to take a width (`narrow`/`short`/`long`) and both lists
  now format in the **selected UI language**.
  ⚠ **This is the same blind spot cut 4 recorded, showing up in the COVERED column for
  the first time**: the component moved no-copy → fully covered with **every string
  count unchanged**, because the measurement can only see the translator it gained. **A
  component sitting at zero/zero is not evidence that it renders nothing.**
- ⚠ **THREE FABRICATED COACH CREDITS ON THE LIVE PATH, ALL CLOSED FIRST** — localizing
  them would have translated a fabrication into thirteen languages. The deck's coach
  credit, the workout preview's byline, and the **outbound swap note** all fell through
  to the literal **`'Jordan Chen'`** for a signed-in member. `/api/client/plan` already
  returns `training.coach` from the real trainer row, so the fix needed no route change:
  a live plan credits its real trainer, a signed-in member with no coach reads the
  honest role noun, and **only the signed-out preview keeps the demo name**. The credit
  is also gated on `coachDay` — a **self-authored** week is never attributed to a
  trainer, the same rule #1947 set for role-spined credits.
- **The builder takes an INJECTED translator, so the pure modules stay pure.**
  `bsEmptyTrainProgram(t, tr)`, `bsApplyTrainAdjust(program, training, t, tr)` and
  `bsBuildTrainProgram(workouts, t, tr)` are module-scope functions that **cannot hold a
  hook**; `bsTrainT(tr)` wraps an optional translator with the shipped English carried at
  every call site. ⚠ **The fallback is PRE-INTERPOLATED English, never ICU** — cut 1's
  rule — so plural call sites pass the already-correct English (`3 moves`) and let the
  catalog own the plural forms; **no ICU is ever evaluated on the path that exists
  because the catalog failed to load.**
- ⚠ **FOUR KEYS REUSED RATHER THAN MINTED**, on the cut-3 rule, each verified
  byte-identical to the `defaultValue` being replaced. And **`common:action.close` does
  NOT exist** — an assumed reuse the check caught: the house carries **nine** separate
  per-namespace Close keys, so this one stays local rather than becoming a tenth
  half-shared one.
- ⚠ **THE `SAME-AS-EN` FLAGS WERE CHECKED AGAINST THE SHIPPED CATALOGS, NOT WAVED
  THROUGH.** Nine values match English across es/pt-BR/fr/de/it/id/vi — every one is the
  locale's own house term, confirmed in the tree: `coach:common.coach` and
  `home:tag.coach` are already literally `Coach` in five of them, and `home:role.trainer`
  is `Trainer` in **de** and **it**, which is exactly what `train.coachRole` renders
  there. Reading the shipped catalog is what separates a loanword from a leftover.
- **The ratchet moved on three axes, and the fourth is the one worth reading.**
  Uncovered **115 → 112** (**1,104 → 1,061 strings**); partial **31 → 32**
  (**164 → 165**); fully covered **96 → 99**. `BSClientTrain` stays **PARTIAL by
  design** over its one remaining string — `"Playlists"`, a signed-out demo header —
  the same shape `BSClientEat` ended in. The **fourth** mover is `BSWeekStrip` above,
  which changed no string count at all. **6/6 mutations killed** across the two guards.
- ⚠ **AND THE PRE-MERGE DIFF REVIEW CAUGHT AN INCONSISTENCY I HAD INTRODUCED IN THE
  SAME DIFF.** `bsEmptyTrainProgram` — the **live** signed-in no-coach week — had four
  of its five strings localized and `kicker: 'No program'` left English, while the *other
  two* builders had their kicker translated. Measured, no Train surface renders a day's
  own `kicker` at all (every kicker on the page is a section header this cut localized),
  so nothing was on screen either way — **which is exactly why it had to be fixed rather
  than excused**: arbitrary per-string selection is the habit the wave exists to end, and
  cut 2 already paid for it once. **90 keys**, all three writers now behave alike.
  ⚠ **`total: '0 sessions'` is the mirror case and STAYS English, with the reason written
  at the site**: no Train surface renders a day's `total` either (the `.total` reads in
  the client module are the leaderboard and the score profile), and **a key with no render
  site is a key nobody can check**. The difference is consistency — `kicker` was already
  translated in two of three writers; `total` is untranslated in all three.
- **Verified:** `npm test` **2474/2474** · `tsc --noEmit` 0 · both touched files parse ·
  catalog parity + ICU + placeholder gates ×13 · a pure append (90 insertions / 1
  deletion per catalog, 13 files, LF, zero CR/NUL) · mobile build 0 with **all 1,157
  train values from all thirteen locales confirmed in the emitted bundle** and all ten
  tag keys surviving minification.
  ⚠ **Two of my own bundle greps read as zero and both were the instrument**: a guessed
  Hausa string that is actually `Ranar hutu.`, and a quoted `"session:train.tag.rest"`
  that minification had already rewritten to an unquoted key. *Check the check before
  believing the finding* — this file has now paid for that four times.

### 2026-08-30 — The dead code cut 1 orphaned is swept, and the register of it was wrong twice

- **Cut 1 deleted the cosmos splash branch and left its scenery behind**, registered as
  a follow-up rather than swept because touching the shared chrome would have widened a
  localization diff. That reason expired with the diff; this is the sweep. **7.2k chars
  of CSS and one component**, no behaviour change.
- ⚠ **THE REGISTER WAS WRONG IN TWO WAYS, AND BOTH WOULD HAVE MISLED THE SWEEP.**
  (1) It said the four CSS families live in **the SHARED chrome**. Only **one** did —
  `.bs-splash-title` in `iosAppBroadsheet.jsx`; the other three sat in
  `iosAppBroadsheetMain.jsx` beside the component that used them. A sweep trusting the
  register would have opened the wrong file and found three families missing.
  (2) It called `.bs-sky-tw/.bs-aurora/.bs-shoot` unreferenced — but **`BSNightSky`
  itself rendered all three** (`iosAppBroadsheetMain.jsx:273-285`). They were dead only
  **once it went**, not before. Deleting them first would have stripped the styling off
  a component still in the tree.
- ⚠ **AND IT MISSED A FIFTH FAMILY.** `.bs-daily-title/-the/-shape/-daily` is the
  **paired** display-weight override sitting in the same rule blocks as
  `.bs-splash-title` — the old "Shape Daily" telegram title, equally orphaned since cut 1
  re-set that surface. It was invisible to a register that enumerated the splash half
  and stopped. **An enumeration is not a proof that the enumeration is complete** — the
  rule this file already records for caller lists, applied to CSS.
- ⚠ **AND ONE PATTERN THAT LOOKS DEAD IS LIVE.** `bs-aurora` matches
  **`bs-aurora-drift`**, a keyframes name in `iosAppBroadsheetRadio.jsx` that has nothing
  to do with the deleted `.bs-aurora` class. A substring sweep would have taken the radio
  screen's drift animation with it. Verified by matching `bs-aurora[a-z-]*` and reading
  what came back, not by trusting the shorter pattern.
- **What went:** `BSNightSky` + its `window` export · the sky/aurora/shooting-star CSS ·
  the splash zoom/burst/beam CSS (the cosmos splash's fire-into-login transition, zero
  className consumers) · both title families. The reduced-motion rule keeps only the
  selectors that still exist. Three comments naming a background this file no longer has
  were corrected in place — including one on the **live** wire beat still describing "a
  hardcoded dark cosmos gradient", which is the stale-prose class this file keeps paying
  for.
- ⚠ **THE FLOOR FELL 360 → 359, AND THAT IS THE ONLY HONEST WAY TO LOWER ONE.**
  BSNightSky rendered `aria-hidden` decoration only, so it sat in the **no-copy** bucket
  (118 → 117): `partStrings` 165, `noneStrings` 1104, `part.length` 32, `none.length` 115
  and `full.length` 95 are **all unchanged**. The reason is written at the assertion, next
  to the deletion that caused it — a floor is never lowered to make a failing run pass.
- **Verified against the EMITTED BUNDLE, not the source**: all twelve dead patterns absent,
  all six live ones (`bs-shape-mark` 6 · `bs-mark-edge` 5 · `bsMarkPulse` 3 ·
  `bs-hide-scroll` 42 · `bs-uline` 45 · `prefers-reduced-motion` 14) intact.
  ⚠ **The first run of that check reported ZERO on BOTH arms** — a `cd` had failed and it
  was grepping a directory with no `.js` in it. A saturated result across both arms of a
  check is a broken instrument until proven otherwise; this file has now paid for that
  lesson three times.
- Verified: `npm test` **2466/2466** · `tsc --noEmit` 0 · both broadsheet files parse ·
  mobile build 0 · the inventory 9/9.

### 2026-08-30 — Two module-scope builders stop fabricating, and the third turns out to need a data change

- **The two fabrications cut 4 registered are closed**, both in module-scope
  builders that **cannot hold a hook** — so the translator is injected, optional,
  and every call carries the English as its `defaultValue`.
- **`bsHomeLiveWeek`** — `title: w.title || 'Workout'` and `meal.title || 'Meal'`
  (×2) are on the **live** path: a signed-in member whose assigned session or meal
  carried no title read an English word **on their own Home screen**, in every
  locale. Now `common:fallback.{workout,meal}` ×13.
- **`bsBuildPlanGrocery` no longer falls back to a NAME.** It read
  `author || 'Dr. Maya Patel'`, and the caller passes **null for author in exactly
  the signed-in-with-no-plan case** — so that member read a shopping list credited
  to a nutritionist they do not have. **The caller now resolves the credit**,
  because only it knows whether this is a real account: a live plan credits its real
  nutritionist (or the honest role noun), a signed-in member with no plan gets the
  role noun, and **only the signed-out preview keeps the demo name**. Its own chrome
  — list name, eyebrow, note — was English in all 13 and is authored too.
- ⚠ **AND A THIRD BUILDER OF THE SAME CLASS TURNED UP, WHICH IS WHY THE CLASS WAS
  SWEPT RATHER THAN THE TWO INSTANCES PATCHED.** `bsBuildTrainProgram`
  (`iosAppBroadsheetClient.jsx:4403`) hardcodes **nine** English strings on the live
  Train path — `Workout` · `Your program` · `Programmed by you` · `The Training` ·
  `The Recovery` · `Rest\nday.` · and the tags `YOURS` / `CUSTOM` / `FEATURE` /
  `REST`.
- ⚠ **CLOSED 2026-08-30 by i18n cut 5 (the Train tab, entry above) — the split was
  done FIRST, exactly as this register demanded, and the guard that pins it then found
  a THIRD writer this paragraph never named (`bsBuildDemoTrainProgram`). The original
  register is kept below because its reasoning is the reason the cut had a design phase
  at all.**
- ⚠ **IT IS REGISTERED, NOT SWEPT, AND THE REASON IS THE INTERESTING PART: ITS TAGS
  CANNOT BE TRANSLATED WHERE THEY ARE.** `tag` is **both a rendered chip and a live
  logic token** — `iosAppBroadsheetClient.jsx:5177` reads
  `const isRestDay = cur.tag === 'REST'` — so a `tr()` on that value would stop the
  app recognising a rest day **in all twelve non-English locales**, silently, with
  every gate green. This is **cut 2's vibe-label lesson exactly** (key off a stable
  id, never the English word), and the fix is a **token/label split** in the builder
  plus every reader: a design change, not a housekeeping line. **Anyone opening a
  Train cut must do the split FIRST** — a naive `tr()` sweep there breaks rest days.
  ⚠ **AND THE ENUMERATION WAS SHORT, WHICH IS THIS FILE'S OWN RECURRING LESSON.** It
  named `iosAppBroadsheetClient.jsx:5177` as *the* reader; there are **four** (the deck's
  rest state, the week strip's `restFlags` on **two** tabs, and `BSWorkoutPreview`'s own
  rest branch), and **three** writers rather than the one it describes. **An enumeration
  is not a proof that the enumeration is complete** — recorded here for CSS on the same
  day, and true again for a logic token.
- **2/2 mutations killed** (an `en` key deleted · a `de` key dropped), sanity green
  at both ends. Verified: mobile build 0 with all five new keys confirmed in the
  emitted bundle and **zero fallback-to-a-name left in it** · catalog parity ×13 ·
  all four i18n guards 22/22 · the ratchet unchanged (these are module-scope
  functions, not components — by design the walk does not attribute them).

### 2026-08-30 — The measured gap closes: 15 marketplace:preview keys, authored

- **The plan-preview sheet — the surface a member reads before they BUY — was
  English in all 13 locales**, and nothing could see it. All fifteen
  `marketplace:preview.*` keys were asked for with a `defaultValue` and absent from
  `en`, which is the **silent** half of that pattern: **the parity gate compares the
  twelve locales AGAINST `en`, so a key missing from `en` is missing everywhere and
  parity is satisfied.** Cut 3 recorded them as a ratchet rather than translating
  them in the wrong cut; this authors them, **15 keys ×13**.
- **`en` is DERIVED from the source's own `defaultValue`s** (an AST walk, not a
  hand-copy), so the catalog and the call sites cannot disagree at authoring time.
- ⚠ **THE RATCHET FIRED ON PROGRESS, EXACTLY AS WRITTEN.** Its comment said
  *"authoring them fails here until the line is deleted"* — and it did, before the
  line was touched. The array is **left in place, empty**: a sixteenth unauthored
  key still fails the day it lands, and anyone tempted to park one has to add it
  deliberately and say why. **A ratchet that is deleted when it empties stops being
  a ratchet.**
- ⚠ **AND THE GLYPH CHECK CAUGHT MY OWN DRIFT.** `preview.locked` is
  `＋{count} more`, and my first ru/uk values rendered it as «Ещё {count}» / «Ще
  {count}» — natural Slavic, and **the only two of thirteen without the `＋`**, so
  that one row would have looked different in exactly those locales. The fullwidth
  `＋` is UI grammar, not prose: the fix keeps it and drops the redundant word
  (`＋{count} · откроются после покупки`), because the glyph already carries *more*.
  Same class as the ICU and placeholder validators — **a per-locale check earns its
  keep on the author's own output, not on someone else's.**
- **1/1 mutation killed** (a sixteenth key goes unauthored), sanity green at both
  ends. Placeholders (`{name}` `{count}` `{price}`) and every `→ · ＋` glyph verified
  identical to `en` across all 13.

### 2026-08-30 — The screen a member reads AFTER the app fails now speaks their language

- **`BSErrorBoundary` was English in all 13 locales**, and it is the app's fallback
  of last resort: a member whose app has just crashed read *"Something went wrong ·
  The app hit an error and recovered · Copy · Reload · Restart app"* in a language
  they may not have. **6 keys ×13** in `common:error.*` (5 rendered + the copy
  toast). Invisible until the day before — the detector never collected
  `ClassDeclaration` (entry above).
- ⚠ **IT CANNOT HOLD A HOOK, AND IT MUST NOT DEPEND ON ONE.** The boundary is
  mounted OUTSIDE `I18nextProvider` by construction — one rendered inside the tree
  it catches could not render when that tree throws — so `useShapeTr()` is
  unavailable. It reads the **window bridge, optional-chained, with the English
  literal carried at every call**: if the i18n bundle is exactly what failed to
  load, the member still gets a readable screen rather than a blank one or a second
  throw. Same shape as the `requireAccount` toast; **the reason is stronger here**,
  because nothing catches a boundary that throws.
- ⚠ **THE DIAGNOSTIC PAYLOAD STAYS ENGLISH ON PURPOSE.** The `<pre>` block is copied
  and sent to us — its reader is whoever triages the report, not the member.
  Translating `Component stack:` or the unknown-error fallback would make a pasted
  report harder to search against the source, and it is the one string here no
  locale improves. The **chrome around it** — what happened, what to do — is
  translated. The line is drawn at *who reads it*, not at *where it renders*.
- ⚠ **TEACHING THE DETECTOR WAS PART OF THE FIX, NOT A CONVENIENCE.** With the
  strings routed through a module-scope helper the walk did not know, the component
  read `tr: 0` **and** `hard: 0` → "renders no user copy", so it fell out of the
  baseline entirely. **That is the worse of the two wrong answers**: a component
  sitting in the baseline is at least measured, while one that renders no copy is
  outside the ratchet again — the exact failure the widening had just closed.
  `bsBoundaryT` joins `coachTr` in `MODULE_SCOPE_TRANSLATORS`, both there for one
  reason: their callers cannot hold a hook.
- **The ratchet:** fully covered **94 → 95**; uncovered back to **115 (1,104)** —
  where it stood before the widening, because the component the widening surfaced
  is the one this closes. `partStrings` 165 and `part.length` 32 unchanged.
- **3/3 mutations killed** (the detector forgets `bsBoundaryT` · the title
  un-localized · a `ru` key dropped), sanity green at both ends.
- Verified: `npm test` · `tsc` 0 · JSX parse · mobile build 0 with **all six
  `common:error.*` keys and the ru copy confirmed in the emitted bundle** · catalog
  parity ×13 · the ratchet 9/9.

### 2026-08-30 — The measurement stops walking past three components

- **A component the walk never sees is outside the measurement, not miscounted** —
  and that is the one failure a two-way ratchet structurally cannot report. Absent
  from BOTH baselines, such a component can be neither *new* (nothing to flag) nor
  *stale* (nothing to expire), so it is not a wrong number: it is no number at all.
  `tests/i18n-surface-inventory.test.mjs` collected `FunctionDeclaration` and
  `VariableDeclaration` off `ast.program.body` and matched on the BODY node's type,
  so **an `export` wrapper was a hiding place** and **a class was not a component**.
- **Three components became visible. NOTHING WAS BUILT** — all three have rendered
  JSX the whole time:
  - **`BSDobGate`** (`export default function`) — fully localized already.
  - **`BSLanguagePicker`** (`export default function`) — genuinely **PARTIAL**: it
    holds a translator and still hardcodes one string, on the screen that **asks a
    member which language they want**.
  - **`BSErrorBoundary`** (`ClassDeclaration`) — **5 strings, no translator**, in
    all 13 locales. It sits OUTSIDE the i18n provider by construction (a boundary
    mounted inside the tree it catches could not render when that tree throws), so
    it needs the provider-free `window.ShapeI18n.t` bridge rather than
    `useShapeTr()` — **its own PR**. It is exactly the component whose copy a member
    reads when the app has already failed them.
- **The totals moved by the widening alone**, which is why this is not folded into a
  localization cut: **357 → 360** rendering JSX · **93 → 94** fully covered ·
  **31 → 32** partial (**164 → 165** strings) · **115 → 116** with no translator
  (**1,104 → 1,109** strings) · 118 no user copy, unchanged.
- ⚠ **THE FLOOR ROSE 357 → 360, and that is the mirror of this file's own rule about
  lowering one.** A floor is honest only alongside the change that caused it — the
  reason is written at the assertion, so the next reader can tell a widening from a
  number nobody re-measured.
- ⚠ **THE RULE IS PINNED ON A FIXTURE, NOT ON THE TREE — the same lesson as the
  parameter-shadow prune, applied before it could bite.** The tree carries exactly
  three of these shapes, so pinning through them would retire the rule the moment
  someone rewrote one. The fixture covers the shapes the tree does **not** contain
  (`export function`, `export const`, `export default class`) plus the case that
  must stay uncollectable: **`export default () => …` carries no name**, so there is
  nothing to attribute copy to and nothing a baseline could pin. A component that
  wants to be measured has to be nameable.
  ⚠ Its first cut put three `export default`s in one fixture string and died on a
  **parse error** — which at least failed loudly rather than passing over source
  that is not JavaScript.
- **5/5 mutations killed** (drop the export unwrap · drop the ClassDeclaration
  branch · collect anonymous defaults · raise the floor past the truth · leave
  BSErrorBoundary out of the baseline), unmutated sanity green at both ends and the
  file restored byte-identically after each.
- Verified: `npm test` **2465/2465** · `tsc --noEmit` 0 · the ratchet **9/9**.

### 2026-08-29 — i18n cut 4: the Eat tab, and the strings the measurement could not see

- **The primary Eat tab is localized.** `BSClientEat` carried **2 `tr()` calls**; it
  now carries **79**, against **60 new `nutrition:eat.*` keys ×13** plus one new
  shared `common:` key and **14 keys reused, not minted**. The day menu, the macro
  register, the swap flow, the grocery door, the prep stamp, the coach byline and
  every empty state now speak the member's language. **No migration, no route change.**
- ⚠ **THE HIGHEST-VALUE STRINGS WERE INVISIBLE TO THE GUARD, AND THAT IS THIS CUT'S
  HEADLINE.** The inventory detector attributes a string to a component only when it
  is rendered JSX text or a walked expression container — **object-literal
  properties, template strings and array-literal strings are not attributed**. Every
  string on `BSClientEat`'s **live** path is built exactly that way (row objects,
  ``` `${…}` ``` metas, a weekday array), while the **31** strings the ratchet DID
  count are all signed-out `MOCK_PROGRAM` demo copy. So a member with a real menu read
  `Open day` · `No menu` · `No meals planned` in English on every locale, and
  localizing only what the guard could see would have moved the number and left that
  English on screen. **A measurement's blind spot is where the untranslated product
  lives** — the same rule this file already records for per-file vs per-component
  counting, one layer deeper.
- ⚠ **THREE ENGLISH PLURALS BUILT BY STRING CONCATENATION, ALL ON THE LIVE PATH.**
  ``meal${n === 1 ? '' : 's'}`` (the day's meal count), ``item${n === 1 ? '' : 's'} to
  get.`` (the grocery door) and the playlist ``track${…}`` meta. **No language forms a
  plural that way**, and ru/uk need **four** categories rather than two — so an `s`
  appended by a ternary is not a translation gap, it is a sentence no locale can
  repair. All three are ICU `plural` now, and the parity gate's ICU validity check
  covers them in all 13.
- ⚠ **AN ENGLISH POSSESSIVE OVER A HARDCODED WEEKDAY ARRAY.** The menu header read
  ``${['Monday','Tuesday',…][day]}'s meals`` — **not even the device locale, a literal
  English list**. Home has formatted its weekday through `bsDateLocale()` since the
  July rollout; this was its unlocalized twin, one tab over. New **`bsWeekdayName(idx)`**
  formats the weekday in the **selected UI language**.
  ⚠ **It formats a FIXED REFERENCE MONDAY (2024-01-01), and the reason is written at
  the function**: the question is what a weekday is **called**, not what date it is, so
  no real week is needed and the answer cannot drift with the clock; `timeZone: 'UTC'`
  so the reference day can never shift a slot west of the line.
  ⚠ **And the possessive is the CATALOG's to form, not a placeholder's** — es reads
  *"Comidas del lunes"*, de *"Mahlzeiten am Montag"*. A `{day}'s meals` template with
  the apostrophe baked in would be wrong in most of the thirteen, which is why the
  whole phrase is one key.
- ⚠ **TWO UNGATED-DEMO SECTIONS — AND THE SECOND ONE IS WHY THE CLASS GOT SWEPT.**
  `BS_COACH_PLAYLISTS` is a static constant **nothing writes to**, and the Eat
  section's header was the literal **"From Maya"** — so a signed-in member with a real
  nutritionist, **or none at all**, read a section attributed to a coach they do not
  have, listing a playlist that does not exist. Found on Eat; the **identical defect
  was live on Train**. Both are gated now (signed-out keeps the demo, signed-in renders
  **nothing** until a real feed exists). **Patching the instance would have left the
  twin shipping** — the rule this file keeps paying for, applied on the first pass this
  time.
- ⚠ **A FABRICATED COACH NAME ON THE LIVE PATH.** The nutritionist byline fell through
  to **`'Dr. Maya Patel'`** for every signed-in member whose coach had not resolved —
  a real member reading a real screen under a fictional person's name. Now
  `liveMealCoach || (signedIn ? tr('…yourNutritionist') : 'Dr. Maya Patel')`: the demo
  name is the **signed-out fallback only**, and a signed-in member with no coach reads
  the honest role noun.
- **THE P/C/F OWNER CALL IS SETTLED — and the premise cut 3 registered it on was
  false.** Cut 3 deferred the macro-letter row on the grounds that *"every other macro
  row is still English."* Measured: **`cook:plated.protein/carbs/fat` are live and
  translated on member surfaces in all 13**, so translating the letters **closes** a
  split rather than opening one. The compact row is **ONE key with the letters inside
  the string** (`{kcal} kcal · {p}P · {c}C · {f}F`), so each locale picks its own
  initials — ru **`Б · У · Ж`**, tr **`P · K · Y`** — which a `{letter}` placeholder
  could never express. (`home:card.protein` turned out to be an **orphan** with no call
  site, which is part of why the earlier reading looked worse than it was.)
- **14 KEYS REUSED RATHER THAN MINTED**, on the cut-3 rule (share only where the two
  uses are the same UI concept, such that a rename **should** move both):
  `coach:adjust.{protein,carbs,fat}` for the full-word macro register,
  `cook:prep.{door,stamp}`, `home:{phase.cut,role.nutritionist,section.thisWeek,when.today}`,
  `nutrition:log.{cancelPlain,kcalUnit,mealFallback}`, `profile:action.open`,
  `profile:playlists.playlists`.
  ⚠ **The macro labels live under `coach:` while the reader is a member surface** — a
  namespace oddity worth **leaving alone** rather than "fixing" with a seventh copy of
  PROTEIN/CARBS/FAT: the concept is identical and a rename should move both.
- **One new shared key — `common:unit.weekN`** (`"Week {n}"` · `"Semana {n}"` ·
  `"Неделя {n}"` · `"{n}. hafta"`), because the Eat header's week counter is the same
  object Home already counts. It is `common:` on purpose: the next surface that counts
  a week inherits it.
- ⚠ **THE RATCHET MOVED ON ONE AXIS ONLY, AND THAT IS THE HONEST SHAPE — NOT A
  HALF-FINISHED CUT.** **`partStrings` 193 → 164**; **`part.length` 31, `none.length`
  115, `noneStrings` 1104 and `full.length` 93 are ALL UNCHANGED**. `BSClientEat` stays
  **PARTIAL by design**: its signed-out demo menu is authored as JSX fragments the
  detector counts, and **demo copy is deliberately not translated**. Every one of the
  **33** strings the detector still sees is demo — **31** from `MOCK_PROGRAM`, plus the
  signed-out byline and plan label.
  ⚠ **This is the opposite of what the plan predicted** (*"a PARTIAL moves out of the
  PARTIAL baseline, so `part.length` moves this time"*). Cuts 1–3 each moved a
  component out of the **UNCOVERED** baseline; a PARTIAL that legitimately keeps demo
  copy moves **neither count**, only the string volume. **Predicting a ratchet's shape
  is not measuring it** — read the guard's output, then write the record.
- ⚠ **REGISTERED, NOT WIDENED — `bsHomeLiveWeek` fabricates the same `'Meal'`
  fallback.** `title: meal.title || 'Meal'` at `iosAppBroadsheetClient.jsx:3135` is
  **Home's live builder**, a module-scope function with **no translator in scope**, so
  closing it means injecting a translator into its caller — its own change, not a
  drive-by on this diff. BSClientEat's copy of that literal is fixed; **the assertion
  that found it matched BOTH sites**, which is the only reason the twin surfaced at all.
- ⚠ **AND THE PRE-MERGE DIFF REVIEW CAUGHT A LOCALE-INSENSITIVE CASE TRANSFORM IN MY
  OWN PORT.** The outbound swap note's day token read
  `tr('home:when.today').toLowerCase()` — because the original English literal was a
  bare lowercase `'today'` sitting beside a **capitalized** weekday array, an
  inconsistency I faithfully carried into thirteen locales. `toLowerCase()` is
  **locale-insensitive** — the Turkish dotted-i class this file already records for
  `toUpperCase()` — and it was safe across the current thirteen values **only by
  luck**: none of them happens to contain a capital `I`. **A wrong rule that produces
  the right answer on today's data is not evidence it is right.** The token is its own
  key now (`eat.swapDayToday`), so **no case transform runs over translated text at
  all** and how the word sits beside a weekday name is the catalog's call — es `hoy`
  and de `heute` are lowercase because that is correct in those languages, not because
  a transform lowered them.
- ⚠ **AND THE SAME REVIEW FOUND A CLASS THAT CANNOT BE CLOSED WITH A `tr()` AT ALL —
  registered rather than widened.** Seven strings in the grocery-list library
  (`Custom · Created today` · `Custom · Saved today` · `Custom · Duplicated` · `You` ·
  `Empty list` · `Saved list` · `Items`) are **written into the member's saved list
  record**, not rendered from it. **Translating at the moment of the write freezes one
  language into their data** — a member who later switches language would read their own
  saved lists in the language they created them in, forever. Closing it properly means
  storing a stable **token** and translating at **render**, with a back-compat path for
  rows already on disk: a data-shape change, not a `tr()` sprinkle. The seeded save name
  (`Week of {date}`) is deliberately excluded — the member edits it before saving, so it
  becomes their own text and must never be retranslated afterwards.
  ⚠ **THE DATA-SHAPE HALF IS CLOSED 2026-08-30 (entry above) — and the register was
  SHORT, in the same way the Train-tag register was.** Of its seven named strings,
  **`note` is written but rendered nowhere** (the note quote box was removed 2026-06-04)
  — so ONE of seven was dead. (⚠ **This claimed `'Items'` was dead too, on the empty-aisle
  early return. REFUTED 2026-08-30 — `addItem` files into `aisles[0]`, and a member-created
  list is seeded with `'Items'` as its only aisle, so the first typed item makes it render.
  It is keyed now; see the cut-6 entry above.**) It also omitted the `(copy)`
  name suffix and the **entire aisle taxonomy** (`Produce` · `Protein` · `Dairy & cold` ·
  `Pantry` · `Other` · `Frozen` · `Bakery` · `Household` · `Recipe ingredients` ·
  `Library items`), which is the same token/label shape as the Train tags: stored on
  every item, used as a grouping key, rendered as a header, AND exported into the share
  text. **An enumeration is not a proof that the enumeration is complete** — recorded here
  for a logic token, for CSS, and now for a stored record. And the real size is much larger than a
  seven-string item. ⚠ **CORRECTED 2026-08-30 — THAT FIGURE IS A COUNT OF CSS VALUES.** It is a raw
  LITERAL count, not user copy: under a stated method (each function's body to the next
  column-0 `function`; pattern `'…'`) the three components hold **684** literals, **284** of
  them style values, units, colors or empty strings — `BSGrocery` alone 427/168, its most
  frequent being `'flex'` ×15, `'uppercase'` ×15, `'pointer'` ×14. The ratchet's own
  walk attributes **67** strings across the four grocery components (`BSGrocery` 31 ·
  `BSGroceryBuilder` 17 · `BSGroceryLibrary` 14 · `BSCoachGroceryReview` 5) — **and that
  is a FLOOR**, because it cannot see the record-driven and template-string copy
  `BSGrocery` mostly renders. A figure that inflates the work fivefold and one that
  undercounts it are the same failure: a number nobody re-derived, quoted forward. `'Saved list'` stays open with it — it is a NAME, and deriving it
  at render threads an empty `name` through the share text, the library title and three
  toasts.
  ⚠ **`bsBuildPlanGrocery` is the `bsHomeLiveWeek` shape again** — a module-scope builder
  with no translator in scope, whose `author || 'Dr. Maya Patel'` fallback fabricates a
  coach name for a signed-in member with no plan. Same fix, same reason it is its own
  change.
- ⚠ **THREE MORE LIVE-PATH STRINGS WERE FIXED IN THE REVIEW ITSELF**, because `tr` was
  already in scope and the key already existed: the two grocery toasts, and
  `'Your nutritionist'` passed to the grocery builder on the **live** branch — two lines
  from the `eat.yourNutritionist` key minted for exactly that string. ⚠ **And `'Apr plan'`
  was the coach-name defect wearing a date**: a MOCK_PROGRAM-era demo label that a
  signed-in member with no plan read as a fabricated month. Live reads *This week*,
  signed-out keeps the demo, and **no-plan renders nothing** rather than inventing a
  period.
- ⚠ **AND THE TRANSLATION REVIEW FOUND THE SLAVIC ANALOGUE OF THE TURKISH-SUFFIX
  RULE — six values across ru and uk.** This repo's translator brief already forbids
  gluing a Turkish case suffix onto a `{placeholder}`, because the placeholder's runtime
  value decides vowel harmony. **The same argument forbids putting a case-governing
  PREPOSITION in front of one**: `Intl` hands back a weekday in the **nominative**, so
  ru `Питание на {day}` renders *"Питание на **среда**"* (accusative `среду` is
  required) and is wrong on **three of seven days**; uk `Харчування на {day}` is wrong
  on **four of seven**. The same defect sat on the coach-name placeholder — ru
  `От {who}` and uk `Від {who}` govern the genitive over a name arriving in the
  nominative. All six rephrased to constructions that keep the placeholder in the
  nominative (`Питание: {day}` · `{who} · на этой неделе` · `Автор: {who}`).
  ⚠ **Turkish had already solved both by instinct** — `{day} öğünleri` puts the suffix
  on *öğün*, and `{who} listeleri` drops the preposition entirely — which is what made
  the Slavic pair visible by contrast. **The general rule, worth carrying into the
  brief: a `{placeholder}` filled by a proper noun arrives in ONE case, so no
  surrounding word may govern another.**
- ⚠ **AND THE PRE-MERGE DIFF REVIEW CAUGHT MY OWN FIX TRADING A FABRICATION FOR
  BROKEN ENGLISH.** The grocery byline runs a **first-name extractor** over the
  author — `.replace(/^Dr\.?\s+/i,'').split(' ')[0]`, so *"Dr. Maya Patel"* renders
  *"From Maya · this week"*. Removing the fabricated name routed a signed-in member
  with no coach into that extractor holding the **role noun**, which renders
  **"FROM YOUR · THIS WEEK"**. The block is **ungated**, so it is on screen for any
  such member.
  ⚠ **It was already broken on an adjacent path** — a live plan whose coach had not
  resolved hit the same line and read the same thing, shipped in cut 4. So the fix
  closes two paths, not one. **A value that feeds a name-parser may only ever be a
  name**: the caller now passes a real coach or **nothing**, and the byline has its
  own phrasing (`eat.fromYourPlan`, ×13) for the no-name case. Proven by replaying
  both versions over the four reachable states — the two broken ones now read *"From
  your plan · this week"*, and the real-name and signed-out demo paths are
  byte-identical.
- ⚠ **AND THE WIDENING IMMEDIATELY EARNED ITS KEEP — the newly visible
  `BSLanguagePicker` was PARTIAL, and its one hardcoded string was `Language`, the
  topbar label on THE SCREEN THAT ASKS A MEMBER WHICH LANGUAGE THEY READ.** Four
  `tr()` calls around it and that one word English in all thirteen. `lang.topbar`
  ×13 closes it; the picker moves PARTIAL → fully covered, so **`part.length`
  32 → 31, `partStrings` 165 → 164, `full.length` 95 → 96** in the same change.
  **A measurement that surfaces a one-key fix and then registers it instead of
  making it has not been used** — that is the register-don't-fix habit applied
  where it is not warranted.
- **Verified:** `npm test` **2465/2465** · `tsc --noEmit` 0 · JSX parse · mobile build 0
  with **56 literal `nutrition:eat.*` keys** (60 authored − 5 computed `quick.q*` + the
  `nutrition:eat.quick.` prefix), `common:unit.weekN`, and sample translations
  (`Comidas del` · `Воскресный набор` · `{c}K · {f}Y` · `Б · `) all confirmed **in the
  emitted bundle** · **no weekday array left in source or bundle** · catalog parity ×13
  · both key-resolution guards 13/13 · the ratchet 8/8.

### 2026-08-29 — i18n cut 3: the meal logger, and the silent half of a defaultValue

- **The one screen that files what a member ate stops being English-only.**
  `BSLogMealFlow` carried **66 hardcoded strings and no translator**; it now
  carries **112 keys ×13** in a new **`nutrition`** namespace — the confirmation,
  the one-tap plate, the live tally, CORRECT THE RECORD, DISPATCH TO your coach
  (photo + voice), the sticky ledger bar, the add-food sheet, the barcode flow,
  the ingredient editor, and all ten toasts. **No migration, no route change.**
- **The namespace is NEW rather than `session:log.*` or `cook:log.*`**, chosen on
  what a translator reads in the file name and on where cut 4 lands: `BSClientEat`
  is unambiguously nutrition and appends to the same namespace, so the key prefix
  is `log.*` and `eat.*` is left free.
- **The CTA label takes an INJECTED translator, so the pure module stays pure.**
  `bsMealCtaLabel(state, { tr })` — optional, with the shipped English carried as
  the fallback, so its **six existing vectors pass with no second argument**.
  `T()` returns the **pre-interpolated English** when no translator is supplied,
  so no ICU is ever evaluated on the fallback path, and it try/catches: a broken
  catalog degrades to English rather than blanking the one control that files the
  meal. Same shape as cut 1's `bsWireLines`.
- ⚠ **SIX KEYS ARE REUSED RATHER THAN MINTED — and the sweep is the reason.**
  All 113 derived keys were checked against every shipped `en` catalog: **21
  exact-value matches**, of which only the six where the two uses are the SAME UI
  concept are shared (`common:action.back`, `cook:plated.{kcal,protein,carbs,fat}`,
  `feed:thread.yourCoach`) — a change to one of those *should* change the other.
  The other fifteen stay local, because the house already carries Cancel / Save /
  Edit / Remove per surface and collapsing them would couple screens that have no
  reason to move together. Cut 1 paid for this lesson in the other direction
  (`login.dobAria` was a byte-for-byte copy of a shipped key).
- **The `en` catalog is DERIVED from the source's own `defaultValue`s**, so
  catalog and code cannot drift at authoring time. Nothing kept that true
  afterwards — which is what the guard below is for.
- ⚠ **AND THE `defaultValue` THAT MAKES THIS CUT SAFE IS WHAT MAKES IT SILENT.**
  Cut 2 passes **no** defaultValue, so a key `en` lacks renders the **raw key** and
  the mount test sees it. Every call site here passes one — the better render
  (English, not `nutrition:log.cta`) and the **worse failure**: the key is absent
  from `en`, so the **parity gate, which only compares the twelve locales AGAINST
  `en`, stays green while the string is English in all thirteen.** That is exactly
  how three `home:lead.*` families shipped unauthored, recorded one entry above.
- **`tests/i18n-default-resolution.test.mjs` closes both directions of that seam**
  across the broadsheet **and** the services wrappers: every literal key resolves
  in `en`, and every literal English fallback still **equals** the catalog value —
  because the catalog is what renders, so a forked call site is the **stale copy**,
  not the source of truth.
- ⚠ **IT FOUND THE CLASS ALREADY LIVE IN THREE PLACES, NONE OF THEM THIS CUT'S.**
  - **Six unauthored `home:` keys** — `slate.now`, `slate.habitsHead`, `tag.work`,
    `lead.railHeader`, `aria.selected`, `aria.today` — English on the **HOME
    screen**, the app's landing surface, in all thirteen locales. (`tag.work` was
    even *recorded* as a known gap on 2026-07-13 and never closed.) **Authored here
    ×13 rather than exempted**: a guard whose first act is a six-entry allowlist
    documents a gap instead of closing one. `slate.now` reuses cut 2's
    `session:player.now` words and `slate.habitsHead` the shipped
    `onboarding:tour.habits.title` term, so one concept cannot say two things.
  - **Two drifted fallbacks** — a straight-vs-curly apostrophe in
    `coach:listing.loadError`, and *"it"* vs *"the date"* in `dob.body` (the 18+
    gate). Both fixed **at the source**: twelve locales translated the catalog
    value, so the catalog is canonical and the call site had forked from it.
  - **A fifteen-key `marketplace:preview.*` family**, recorded as a **ratchet**
    rather than translated in the wrong cut — asserted exactly both ways, so a
    sixteenth unauthored key fails the day it lands and authoring the fifteen fails
    until the line is deleted. **The gap is now measured instead of unknown.**
- ⚠ **AND THE GUARD PASSED ITS FIRST MUTATION FOR THE WRONG REASON.** Deleting
  `nutrition:log.ctaAsPlanned` from `en` changed nothing, because that key's only
  caller is **`mealLoggerState.mjs`** and the walk read only `broadsheet/*.jsx` —
  and the pure modules are exactly where the injected-translator wrappers live (the
  wire's telegram body, the logger's CTA). Widened to `services/*.mjs`, handling
  both wrapper shapes **by position** (the key is the first string literal, the
  English is whatever follows it) so `T('ns:key', 'en')` and the
  translator-injected `T(tr, 'ns:key', 'en')` read identically. **5/5 mutations
  killed** afterwards, with unmutated sanity green at both ends. *Check the check
  before believing it — including when the check is yours.*
- ⚠ **THE PARAMETER-SHADOW PRUNE HAD STOPPED TESTING ITSELF, and re-pointing the
  ratchet is what surfaced it.** It was pinned through the two real shadows — a
  MediaStreamTrack and a playlist track — and **both were renamed while localizing
  these two surfaces**, so `tr === 0` on those components now holds because they
  hold no translator at all, and would hold with the prune deleted. Re-pinned on a
  **fixture with a positive control** (a sibling component that genuinely binds the
  hook, so `tr` reaches the detector's name set at all — without it both rows read
  0 for the uninteresting reason), and `componentsOfSource` is split out of the
  file read to make that possible. **Both mutations killed** (drop the prune; break
  the control). **A rule only tested while the tree happens to contain a violation
  is a rule that retires itself the moment someone fixes the violation.**
- **The ratchet moved, and the unchanged numbers are the assertion that matters.**
  **1,170 → 1,104 strings** and **116 → 115** uncovered components; fully covered
  **92 → 93**. **`partStrings` 193 and `part.length` 31 are UNCHANGED** — the
  assertion that certifies the cut is *finished* rather than half-done.
- ⚠ **REGISTERED, NOT DONE — three residuals, each named rather than smoothed.**
  (1) The **demo food names stay English** — they stand in for real
  member-authored ingredient names, which are never translated, so localizing the
  placeholders would make the demo read *less* like the live screen.
  (2) The **ingredient `qty` column stays English** — `100 g` / `250 g` / `1 serving`
  come from the food provider through a pure module with no translator
  (`foodSearch.mjs`), so translating only *our* fallback would make ONE data column
  bilingual. ⚠ **Caught in the pre-merge diff review of this cut, after the key was
  already authored ×13** — the key is deleted rather than left orphaned, so 113
  became 112. The NAME fallback DOES translate: it stands in for the same missing
  `meal.title` the band heading shows, and the two must not disagree on one screen.
  (3) The **`{p}P · {c}C · {f}F` macro letters stay Latin** — a width-critical mono
  row, and every other macro row in the app is still English, so translating here
  alone would split one data row into two conventions. **An owner call for cut 4**,
  where `BSClientEat` carries the same row.
  (4) The **fifteen `marketplace:preview.*` keys** above.
- ⚠ **AND ONE FINDING THIS CUT SURFACED THAT IS BIGGER THAN IT:
  `window.__bsToast` IS A NO-OP** (`iosAppBroadsheet.jsx:1364`), so the
  **275 toast call sites across the app report into a void** (counted 2026-08-29:
  197 client · 28 pros · 16 calendar · 10 main · 8 chrome · 6 habits · 6
  marketplace · 4 data layer) — including the ten this cut just translated into
  thirteen languages. Translating them was still correct
  (they are the copy that ships the day the sink is wired), but nothing a member
  is told through a toast reaches them today. **Registered on the War Room, not
  fixed here**: reviving the sink is a product decision about 275 call sites, not
  a line in an i18n cut.
  ⚠ **CORRECTED 2026-08-30 — this read "a PERMANENT no-op" and gave the count as
  "263" in its last sentence, two lines after correctly saying 275.** The count is
  **275** (re-measured: `window.__bsToast?.(` invocations, matching the per-file
  breakdown above exactly; 295 raw mentions, the extra 20 being the definition and
  its comments). And **"permanent" frames a shipped product decision as a defect**:
  the host's own comment says *"Toast popups are disabled app-wide"*, and the
  notice-mode comment at `:1413` dates it — *"switched off app-wide on 2026-06-03
  (#938) … the popup noise #938 deliberately removed"*. Off by decision, not by
  fault.
  ⚠ **CORRECTED AGAIN 2026-08-31 — THE 275 IS A MENTION COUNT WEARING AN INVOCATION
  COUNT'S NAME, AND ITS OWN BREAKDOWN PROVES IT.** The 08-30 correction says it
  re-measured `window.__bsToast?.(` invocations "matching the per-file breakdown above
  exactly" — but that breakdown carries **8 chrome**, and the chrome
  (`iosAppBroadsheet.jsx`) contains **ZERO invocations**: 6 comment lines quoting the
  call shape, the no-op definition `window.__bsToast = () => {}`, and the `delete`.
  So the stated method cannot reproduce the stated number; a method was asserted, not
  run. **Measured 2026-08-31 with the method written down so the next reader can
  re-derive it rather than trust the page: 266 real call sites** across `mobile-app/src`
  — client **196** · pros **28** · calendar **16** · main **10** · habits **6** ·
  marketplace **6** · data layer **4** — counting **BOTH idioms** and excluding comment
  lines. ⚠ **And the second idiom is the other thing the record never mentioned:**
  11 sites use the guard form `window.__bsToast && window.__bsToast(…)` rather than the
  optional chain, so a `?.(`-only sweep undercounts by 11 and a raw-mention sweep
  overcounts by the chrome's 8. (Client reads 196 rather than 197 because **cut 17
  converted one** — `setCommitment`'s failure path — to a `bsAskConfirm` notice, which
  is the register's own answer being applied one site at a time.)
  ⚠ **AND THE RECORD OMITTED THE ONE FACT AN AUTHOR ACTING ON IT NEEDS: A SANCTIONED
  REPLACEMENT ALREADY EXISTS.** `bsAskConfirm` **notice mode** (`o.notice === true`)
  was built *because* the toast is a no-op, and its comment carries the rule — use it
  for **a transient failure the member needs to know about**, never for a success
  confirmation, which is exactly the noise #938 removed. So the open question is not
  "revive the sink"; it is **which of the 266 sites carry a failure a member must see,
  and should those become notices** — a much narrower call, already answerable one
  site at a time. **A finding that names a gap without naming the existing remedy
  reads as unactionable when it isn't.**
- Verified: `npm test` **2465/2465** · `tsc --noEmit` 0 · mobile build 0 with all
  **112 nutrition keys and the six new home keys confirmed in the emitted bundle**
  (plus spot-checked translations: `ru` habits head, `tr` work tag, `vi` now) ·
  catalog parity **3/3** ×13 · every touched source file parses.

### 2026-08-29 — i18n cut 2: the live session player

- **The screen a member holds while they lift is no longer English-only.**
  `BSSession` — the workout player and its completion step — carried **zero
  `tr()` calls**; it now carries **79 keys ×13**. Cut 2 of the wave the
  2026-08-29 inventory scoped. **No migration, no route change.**
- ⚠ **FOUR HONESTY DEFECTS WERE RENDERING UNCONDITIONALLY, AND THEY HAD TO GO
  FIRST — localizing them would have translated fabrications into thirteen
  languages.** None was reported; all four came out of reading the file to
  extract its strings.
  1. **The form cue was position-indexed off a hardcoded PULL-UP list.**
     `CUES[moveIdx]` meant move #1 always read *"Dead hang every rep. Chest to
     bar or it doesn't count."* — on a leg press. A form instruction for the
     wrong exercise, shown mid-set, is worse than none. Every move already
     carries its real one (`bsClientWeekDemo.js` maps `cue: m.cue || ''` onto
     all of them); an unauthored move now renders **nothing** rather than the
     old *"Move with intent."* filler.
  2. **A fabricated live-coach press credit**, rust role-spined, reading
     *"Jordan · live · coaching · 2 min"* under the current move — with no
     signed-in gate and no coach check. ⚠ **It could not be fixed in place:**
     `BSSession` receives only `{ moves, onBack, title }`, so there was never a
     path to a real name. A member with no coach read a named trainer coaching
     them live two minutes ago; a member WITH one read the wrong name — while
     the quoted line was not a message at all but the move's authored form cue,
     which the ledger above already shows in its proper place. Per this repo's
     own #1947 rule (a role-spined credit IS the claim "a coach authored this")
     it is **deleted rather than gated** — restoring it means passing a real
     coach into the player first.
  3. **The queue appended a rest interval nobody wrote.** It re-derived
     `{sets} × {reps} · 90s rest` from the parsed numbers, so a move authored
     *"3 × 10 · 3 min rest"* read **90s** one screen from the coach's own words.
     `mv.s` IS the authored line; the parsed pair is the fallback for
     outline-delivered days that ship no scheme.
  4. The `title` prop defaulted to the literal `'Live session'`, which is now a
     key — an English default would have shipped past every locale.
- ⚠ **THIRTEEN STRINGS WERE INVISIBLE TO THE RATCHET, AND THEY ARE THE ONES A
  MEMBER READS WHEN SOMETHING GOES WRONG.** The inventory walks JSX; these live
  in plain JS — three HR toasts, three `bsAskConfirm` fields (the *"Remove this
  set?"* dialog), three save toasts — plus the three **vibe labels**, which sit
  in a data table rendered by reference (`[['loved','Loved it',…]].map`), the
  detector's own stated limit. So the surface's real count was **~87**, not the
  **74** the ratchet moved by. The vibe labels are now keyed off their **stable
  id**, never the English word.
- ⚠ **THREE LOCALES INDEPENDENTLY OVERRODE THE SAME RULE IN MY BRIEF, AND ALL
  THREE WERE RIGHT.** It listed `min` among the must-stay-literal tokens beside
  RPE/bpm/lb. **vi**, **tr** and **ru** each pushed back with their own shipped
  catalogs as evidence — `coach.schedule.minUnit` is already `"{n} phút"`,
  `calendar.unit.min` is `"{min} DK"` and `"{min} МИН"`, 19 occurrences in ru
  alone. `min` is an English **abbreviation of a translatable word**, not a
  symbol; keeping it would have made one screen call the same unit two names,
  since `player.minutes` must render the full word anyway. This is the **DOB
  case from cut 1, exactly**: a rule of mine, wrong for the same reason, caught
  by the translators. The applier's literal set is narrowed to `lb`/`bpm` — the
  symbols actually rendered — and the reason is written at the constant. The
  `{min}` **placeholder** is still pinned by name.
- ⚠ **AND MY BRIEF'S REGISTER PREMISE WAS WRONG FOR ru AND uk — refuted with
  counts, by two agents who never saw each other's work.** I told them the deep
  in-app surfaces are informal. Measured: `ru/home.json` **12 formal / 0
  informal**, `ru/feed.json` 12/0, `settings` 25/0; `uk/home.json` 12/0,
  `uk/feed.json` 12/0. The real split in both is narrower than I stated — the
  **Score page and the first-run tour** are the informal islands, everything
  else is formal — which is also what cut 1 ratified. Both chose formal and
  showed their work. **A premise stated in a brief is a claim, and a translator
  with the catalog open is better placed to check it than I am.**
- ⚠ **THE SET TABLE WAS SIZED TO ENGLISH — THE SAME MAGIC NUMBER AS THE WIRE
  FORM'S 84px LABEL COLUMN, ONE CUT LATER.** `gridTemplateColumns: '26px 1fr
  1fr 1fr 30px'` at mono 9px with 0.16em tracking costs ~**6.84px/char**, so the
  first column held **3.8** characters and the last **4.4**. English never
  revealed it (`Set` 3, `Done` 4). Translated it breaks at once: ru/uk
  «Подход»/«Підхід» are 6 (41.0px) and id `Selesai` is 7 (47.9px). Widened to
  **48px / 56px** — the measured longest plus one character of slack — with the
  metric written at the site so the next reader recomputes rather than guesses;
  the three `1fr` columns give up the difference and still hold the widest
  header (ha `Maimaici`, 54.7px) at every density.
- ⚠ **AND THE SAME GRID ALREADY SHIPS ON THE COACH SIDE, WHERE IT HAS BEEN
  CLIPPING IN SIX LOCALES.** `iosAppBroadsheetPros.jsx` renders the live-watch
  console through a **byte-identical** `26px 1fr 1fr 1fr 30px` off the same
  `coach:live.col*` values — which is where eleven of the twelve translators
  sourced their words, so the client and the coach read the same row in the same
  language. Found because **fr said so in its return and I checked it against
  the file** rather than taking it. Widened there too — first column only; its
  last column is an empty spacer.
- **The translators reused rather than reinvented, and that is the wave's real
  find.** Every locale independently identified `coach.json`'s `live.*` block as
  the coach-side mirror of this exact screen and copied its column headers
  verbatim. So a member and the coach watching them now read **one word per
  concept**, not two. **de** caught a false friend nobody briefed: English
  *Last · {load}* means *previously*, German *Last* means *load*, and
  `profile.json` already uses "Die Last" for weight — a literal rendering would
  have read *"Load · 80 lb"*. It ships as **"Zuletzt"**.
- ⚠ **THE MOUNT HARNESS NOW RUNS A REAL TRANSLATOR, AND THAT IS A STRENGTHENING
  RATHER THAN A REPAIR.** `tests/broadsheet-session-render.test.mjs` drives 21
  behavioural cases through the shipping component (the finish CTA opens the
  completion step, the save runs at most once across every exit path, skip-rate
  telemetry fires exactly once) and every one asserted on **English literals**.
  With `useShapeTr` falling back to `opts.defaultValue ?? key` and these 79 call
  sites passing no defaultValue, they all rendered the raw key. Re-pointing 22
  assertions at key strings would have been the easy fix and the wrong one — the
  tests exist to prove what a MEMBER sees. The harness now resolves against the
  real `en` catalogs, so the assertions keep reading like the product **and each
  one became a live check that its key resolves**: a typo now fails on the screen
  it would break.
- ⚠ **THE KEY-RESOLUTION GUARD DID NOT COVER THIS FILE AT ALL, so its green run
  said nothing about the cut.** Extended to `iosAppBroadsheetClient.jsx` as its
  own walk — folding it into the launch flow's `FILES` would make `DEFAULT_NS`
  mean two things at once, since the shell binds `useTr('onboarding')` while this
  file binds `useShapeTr()` and qualifies every key. **Scoped to the fatal
  class**: measured, the file carries **1,300** keys that pass a `defaultValue`
  (a miss degrades to English, invisible and recoverable) and **79** that pass
  none (a miss renders the RAW KEY, mid-session) — and the 79 are exactly this
  cut's. Six pre-existing `home:*` misses in the defaultValue-bearing set are
  **registered, not gated**: pulling them in would make a guard about raw-key
  rendering fail for strings that render perfectly.
- ⚠ **AND THE COMPUTED VIBE FAMILY NEEDED ITS OWN GUARD — mutation-testing said
  so, reading it did not.** `tr('session:player.vibe.' + key)` is pinned by its
  **prefix** in both directions, so deleting `player.vibe.ok` leaves the prefix
  satisfied by its two siblings and every assertion green while the middle button
  renders the raw key. Same shape as the paywall feature list one surface over,
  same fix: read the ids out of the array itself. ⚠ Its own first cut then passed
  for the wrong reason — a `[^'#]` first-character class **rejects** `'#4fd18b'`
  at its opening quote, and the engine pairs that quote with the next one,
  capturing the `], [` between two entries as an id.
- **The ratchet moved.** **1,244 → 1,170 strings** and **117 → 116 uncovered
  components**; fully covered **91 → 92**; `partStrings` 193 and `part.length`
  31 **unchanged**, which is the assertion that certifies the cut is finished
  rather than half-done.
- **Both validators were mutation-tested against the REAL returns, not a
  synthetic echo** — the cut-1 lesson, where the harness built its locale out of
  the English values and so tested the check against itself. **8/8 refused** (a
  renamed placeholder · a dropped glyph · a dropped `lb` · a straight apostrophe
  beside a brace · a deleted key · an unknown key · an empty value · an added
  glyph) with the clean set proven to write a pure append; **7/7 killed** on the
  guards (a typo'd key in the JSX · an `en` key deleted · an orphan authored · the
  walk stopped matching · a family member deleted · the vibe array truncated · the
  family prefix renamed), unmutated sanity green at both ends of every batch.
- **Registered, NOT built.** (1) The **six `home:*` keys** absent from `en` that
  fall back to their `defaultValue` — real, invisible, and outside a guard about
  raw-key rendering. (2) **`pcm` carries 26 values identical to English**, every
  one cited to shipped `pcm` precedent (`cook.json` `"back": "← Back"`,
  `"plated.done": "Done"`, `common.upNext`); the prose is real Naija grammar
  (*"Di timer no run for dis one."*), which is the legitimate pattern this file
  already records — but it goes to the standing human review with the enumerated
  list, not with my assurance. (3) **`it` flagged `player.now` as "ADESSO"** (6 to
  English's 3) in an inline badge, following `cook:prep.now` rather than the
  shorter "ORA" — a house-consistency call worth an owner's eye if it reads long.
  (4) The band eyebrows run 4–8 characters longer in de/id/it/ru/tr/uk; they sit
  beside an ellipsis-truncating title with `minWidth: 0`, so the counter wins and
  the title shortens — graceful, but device-only to confirm.
- ⚠ **AND THE DIFF REVIEW FOUND THE CUT HALF-DONE ON ITS OWN TERMS — three gaps,
  all in code this cut wrote.** The merge gate was green; these came out of the
  standing pre-merge diff pass, not a reviewer. (1) The band's **visible LOAD /
  REPS eyebrows render from a data table** (`[['load','load'],…].map`), which is
  precisely the residual the inventory documents — *copy declared in a data table
  and rendered by reference is not attributed to the component* — so they were
  never in its count and stayed English under a `text-transform: uppercase` on
  an otherwise-Spanish screen. (2) **Seven `aria-label` template literals stayed
  English**, and the set table's announced **the RAW INTERNAL FIELD KEY**
  (`Set 3 load` — the code's own identifier read aloud). (3) Worst of the three,
  **two of those were the same control class as ones this cut DID translate**:
  the band's ✓ button got `logSetAria`, the table's ✓ button one row down kept
  `` `Mark set ${i+1} done` ``. That is not a residual, it is an inconsistency
  introduced in the same diff — arbitrary per-string selection, the exact habit
  the wave exists to end. **8 more keys ×13**, all three sites now reading ONE
  `fieldLabel(f)` helper so a field can never be named two ways.
- ⚠ **AND `reps` READS THE SHIPPED COLUMN KEY RATHER THAN A SECOND KEY HOLDING
  THE SAME WORD IN ALL 13** — cut 1's duplicate-key trap, avoided this time by
  checking first. `load` genuinely needs its own: the band deliberately reads
  **LOAD** where the table header reads **WEIGHT**, because a band value carries
  its own unit ("165 lb"), and that distinction is per-locale (es *Carga* vs
  *Peso*, fr *Charge* vs *Poids*, ru *Нагрузка* vs *Вес*).
- ⚠ **THE NEW KEYS SHIPPED AS `{n, number}` AND THE HOUSE CONVENTION IS BARE
  `{n}` — MEASURED, NOT ASSUMED.** `session/en` carried **30 bare placeholders
  and zero `, number`** before these five; `onboarding` and `coach` carry zero
  across 150 keys. Normalized to the convention. The five were only *noticed*
  because the render harness interpolates the bare form only and the assertions
  failed — but the harness is the symptom, not the reason: a namespace where one
  wave writes `{n}` and the next writes `{n, number}` for the same set index is
  drift whether or not a test can see it.
- ⚠ **AND THAT HARNESS GAP IS ITSELF A TRAP FOR THE NEXT CUT, so it is closed
  rather than worked around.** A `{n, number}` key rendered its RAW text, so the
  failure read *"no button with aria-label …"* — a broken-component message for
  a harness limitation. It fails loudly rather than passing silently, which is
  the safe direction, but it costs a debugging round; the interpolator now
  handles both forms.
- **The guards were mutation-checked against the NEW call shapes**, because a
  ternary-of-two-literals as the key argument is a shape that could pass
  vacuously: **4/4 killed** (a typo in the ternary's first branch · in its second
  branch · on a plain bare key · an `en` key deleted), sanity green at both ends
  and both files restored **byte-identically**. The applier was re-mutated
  against the **real returns** — **7/7 refused** (renamed placeholder · dropped
  placeholder · emptied value · unknown key · a key missing from one locale · a
  straight apostrophe adjacent to a brace · a renamed plural argument). ⚠ Its
  **glyph-count check is NOT exercised by this batch** — none of the 8 values
  carries a character from the set — so it is recorded as untested here rather
  than counted as a pass.
- **The ratchet did not move, which is the confirmation and not an oversight**:
  every string in this follow-up is one its walk cannot see (a data table, or a
  template literal), so `noneStrings` and `partStrings` are unchanged by design.
- Verified: `npm test` **2461/2461** · `tsc` 0 · both broadsheet files parse ·
  mobile build 0 with all twelve locales' strings, **both widened grids** and all
  eight new keys confirmed in the emitted bundle, and **zero English aria
  template literals left in the component** · catalog parity 3/3 ×13 · a pure
  append (80 then 9 insertions / 1 deletion per file, 13 files) · LF, zero CR,
  zero NUL.

### 2026-08-29 — i18n cut 1: the launch flow stops being English-only

- **The wave's first cut, and the measurement's own headline case.** The 2026-08-29
  inventory found the **language picker was the ONLY localized screen in the entire
  launch flow** — a member picks Spanish and the very next screen, and every screen
  until the app itself, is English. That flow is now localized end to end: the wire
  beat, the **Shape Daily telegram**, the invite edition, the members wall, the
  preview banner, the app shell, and the whole **sign-in / create-account** form.
  **No migration, no route change.**
- ⚠ **THE CUT AS SCOPED WAS WRONG IN BOTH DIRECTIONS, AND THAT IS THE ENTRY.** The
  handoff scoped it as *"~107 strings all in `iosAppBroadsheetMain.jsx`"*. Measured
  against the code: **~26 of those 107 were unreachable dead code**, while the
  launch's **most-read screen was not in the file at all**.
- ⚠ **DEAD BRANCHES COUNTED AS WORK.** `BSSplash` carried **seven** style branches
  and exactly **two** are reachable — both call sites hardcode `style` (`wire-beat`
  at the beat, `classified` at the telegram), and `tweaks.splashStyle` is read only
  by the Tweaks panel's own button state and **never passed to the component**. So
  `cosmos · masthead · dropcap · frontpage · vault · ticker` (~23 strings) were
  translation work for screens nobody can reach. **`BSCosmicWordmark` was worse** —
  no render site, not window-exported, fully orphaned: **3 of the published "1,355
  uncovered strings" were in a component nothing mounts.** All deleted, with the
  inert Tweaks *Splash* section (its `splashStyle`/`splashBg`/`splashBgColor` tweaks
  reached nothing) and three dead `bsDigest*` helpers. **229 lines.**
- ⚠ **AND THE LAUNCH'S MOST-READ SCREEN IS OUTSIDE THE WALKED DIRECTORY.** The
  telegram BODY — the member's actual day — is assembled in
  `mobile-app/src/services/dailyWire.mjs`, which the inventory does not walk. So
  **localizing `BSSplash` alone takes it to `hard === 0` while the member still
  reads their day in English**: the measurement would have certified a screen that
  is still English. It is in this cut for that reason.
- **The telegram takes an INJECTED translator, so the module stays pure.**
  `bsWireLines(digest, directive, { tr, locale })` — both optional, with the shipped
  English carried as the fallback, so the module remains dependency-free and its 21
  existing vectors pass **unchanged**. `T(key, en, vars)` returns the pre-interpolated
  English when no translator is supplied, so **no ICU is ever evaluated on the
  fallback path**, and it try/catches, so a broken catalog degrades to English
  rather than blanking the screen.
- ⚠ **THE DIRECTIVE LINE READS THE SAME CATALOG KEY HOME LEADS WITH.**
  `BS_LEVER_HEADS` already existed so the splash and the Home lead could not say a
  different move — but only in **English**: Home reads `home:lead.<lever>.head` with
  those strings as `tr()` defaults, and the telegram read the raw constant. The wire
  now reads the same key, so the two surfaces cannot diverge in **any** locale.
- ⚠ **AND THREE OF THOSE KEYS HAD NO CATALOG ENTRY IN ANY LOCALE — INCLUDING `en`.**
  `lead.{energy,hunger,hydration}.head` and their `.cta` siblings (the check-in
  vitals levers) were never authored, so they fell through to the English
  `defaultValue` on every surface in every language. **Missing from `en` too, which
  is why the parity gate was satisfied while the string was English everywhere** —
  a gap only a key-family audit can see. Authored ×13.
- ⚠ **THE CLOCK WAS TWO SEPARATE LOCALE BUGS.** The telegram's editorial date used
  `toLocaleDateString([], …)` — the **device** locale, not the selected UI language,
  so Spanish-in-Shape on an English phone read `Thu · May 21`. And the session time
  was hand-built with a baked `'AM'`/`'PM'`, which is not merely untranslated but
  **the wrong convention**: de/fr/ru read 17:45, never 5:45 PM. Both now follow the
  selected language (`Intl` decides the convention); with no locale supplied the
  original ASCII formatter is preserved byte-for-byte, so the unit vectors still pin.
- ⚠ **`toUpperCase()` IS LOCALE-INSENSITIVE AND IT RUNS OVER MEMBER DATA.** The wire
  upper-cases session titles and coach names; Turkish dotted/dotless i is the classic
  break. Now `toLocaleUpperCase(locale)` when a locale is present, and byte-identical
  to the previous behaviour when it is not.
- ⚠ **THE PRICE IS INTERPOLATED, NOT BAKED.** `Join · $5/mo →` became
  `Join · {price}/mo →` off ONE `BS_PRICE` constant. Two surfaces quoted the same
  price with **opposite instructions** in the plan (one said keep it inside the
  value, the other said interpolate it *because* baking it in invites a translator
  writing `5 €` — a false statement about what the member is charged). Interpolation
  wins: Shape charges USD, and a reprice is now a single edit.
- ⚠ **THREE PROPOSED KEYS WOULD HAVE BEEN THE SEVENTH COPY OF A SHIPPED STRING.**
  The plan minted `paywall.signOut` and `login.role.{client,trainer,nutritionist}` —
  but `settings:action.signOut` and `coach:role.*` are already translated in 13
  locales (and the role names exist in **six** namespaces). They are reused. The
  `roleLabel` map also stopped deriving its short form by **stripping a translated
  suffix** (`.replace(' (RD/RDN)', '')` only ever worked in English) — it branches on
  the key now.
  ⚠ **A FOURTH duplicate got past the first pass and was caught by the translators.**
  `login.dobAria` was a byte-for-byte copy of the shipped `dob.label` — the DOB gate's
  own label, already translated in all 13 — so the login form's aria now reads that
  key and the duplicate is deleted. The same review surfaced a rule of mine that was
  simply **wrong**: the brief listed `DOB` as a must-stay-literal token beside
  kcal/RPE/HRV/RD-RDN, and **two locales independently flagged it and then answered
  DIFFERENTLY** (one kept `DOB`, one wrote `Nasc.`) — which is the drift a shared
  catalog exists to prevent. `DOB` is an English **abbreviation**, not a term of art,
  and this repo had already ruled the concept translates. ⚠ **But the abbreviation
  constraint is real and is not style**: the label sits in a **fixed 84px mono
  column**, so the full noun ("Fecha de nacimiento · 18+") overflows — the rule is
  *short enough for 84px*, per locale, not *literal*.
- ⚠ **THE CATALOGS ARE FEATURE-GROUPED IN INSERTION ORDER, NOT SORTED — and I sorted
  them.** Every catalog is a sequence of runs, one per shipped wave (`lang` 2 · `tour`
  37 · `score` 25 · `dob` 15); a wave appends its own run at the end. Sorting `en` on
  write turned a 6-key addition into **88 changed lines** in `home.json` and reshuffled
  nearly all of `onboarding.json` — and it would have done the same to all **24** locale
  files, for nothing, while leaving `en` structurally unlike every other locale. Order
  restored, the wave appended as its own run, and the writer now **preserves order by
  construction** with the reason at the function. Same class as the 69-file `?v` sweep
  this file already records: **churn a reviewer has to read past is a cost, not a
  neutral.**
- **Both validators were mutation-tested before the translations existed.** The applier
  refuses on a missing key, an unknown key, an empty value, a dropped placeholder, a
  **renamed** placeholder, a straight apostrophe adjacent to a brace, a dropped brand
  noun, and a changed arrow count — **8/8 refused**, with the clean set proven to write
  a pure append into a scratch tree. ⚠ The first run of that harness **found nothing
  because it aimed at a string the block does not contain** (`Shape Score`; the only
  brand noun here is `Shape Wire`) — *check the check before believing it*, which this
  file has now paid for twice.
- **Guards, because the seam is invisible to the inventory.** Every `bsWireLines`
  test supplies its own translator, so they all pass with the **real call site
  unwired** — the "an unwired caller looks perfectly plausible" trap this file keeps
  paying for. Four new behavioural tests drive the translated path (every line routes
  through the catalog · the directive reads Home's key · a throwing or empty-returning
  translator falls back to English · the clock follows the locale), plus a **source**
  guard that `BSSplash` actually passes `{ tr, locale }` and that `useTr` is genuinely
  **imported** — a bare `useTr` reads as a global to a static walk and throws
  `ReferenceError` on the first frame of the cold open, which parse, `tsc`, the suite
  and the build all pass on.
- ⚠ **AND NOTHING CHECKED THAT A REQUESTED KEY EXISTS.** These call sites pass no
  `defaultValue` — the ESM modules import `useTr` and call `tr('login.fieldName')`
  bare — so a typo does not fall back to English, it renders the **raw key**, on the
  cold open, on the sign-up form. `tsc` sees a string; the parse-check sees a string;
  and the **catalog parity gate only compares the twelve locales AGAINST `en`**, so a
  key absent from `en` is absent everywhere and parity is satisfied — which is exactly
  how the three `home:lead.*` families shipped unauthored in all thirteen.
  `tests/i18n-key-resolution.test.mjs` closes it with an **AST walk**, because the real
  call sites are a ternary (`tr(isCreate ? 'login.eyebrowJoin' : …)`) and two computed
  families (`tr('paywall.feat.' + k)`, `T('home:lead.' + lever + '.head')`) that a text
  scan reads as unresolvable. A computed key is pinned by its **literal ends** — the
  `lead.` + X + `.head` family must match a real key, not merely something starting
  with `lead.` — and any shape the walk genuinely cannot resolve is **counted and
  asserted at zero**, so it can never pass by seeing nothing.
  ⚠ **A `+` chain nests to the LEFT**, so reading `a.left` alone sees another
  `BinaryExpression` and resolves nothing — the first cut did exactly that and left the
  telegram's directive key unpinned. **6/6 mutations killed** (a typo'd key · a typo
  inside a ternary branch · an `en` key deleted · the paywall family truncated · the
  prefix+suffix family broken · every call site renamed so the walk sees nothing), with
  unmutated sanity green at both ends and all three files restored byte-identically.
- ⚠ **AND A KEY THAT EXISTS IS NOT A KEY THAT RESOLVES.** This cut newly leans on the
  **`ns:key` form** nineteen times — three shipped keys read out of other namespaces
  instead of minting a seventh copy, and all sixteen of the wire's own — and that form
  works only because `nsSeparator` is left at its i18next default of `':'`. Set it to
  `false` and every one of those nineteen calls renders the **raw key** on the cold
  open, with the catalogs still perfectly valid, the parity gate still green, the
  key-resolution walk still green (it reads the catalog, not the runtime) and `tsc`,
  the parse-check and the build all clean. So the guard also **drives the real
  i18next + ICU runtime** with the app's own options: the cross-namespace forms
  resolve, interpolation runs, `wire.streak` genuinely selects a plural branch, and an
  unknown key MUST come back raw — or "not raw" proves nothing. A companion assertion
  pins the init block to the option values the harness mirrors, so the two cannot
  drift apart silently. **2/2 mutations killed** (`nsSeparator: false` introduced ·
  `returnEmptyString` flipped), with `index.js` restored byte-identically.
- ⚠ **TWO SITES USE THE WINDOW BRIDGE, NOT `tr` — and one of them degraded to
  SILENCE.** `window.bsRequireAccount` and the bundle-error setter are installed in
  `[]`-dep effects, so a captured `tr` would be pinned to whatever language was
  active at mount; both read `window.ShapeI18n.t` instead. But the whole toast call
  sits in a `try/catch`, and a bare `ShapeI18n.t` on a surface where the bridge has
  not landed yet **throws and swallows the toast entirely** — dropping the one line
  that explains why the screen just changed. It now optional-chains to an English
  literal matching the catalog value, the same shape the bundle-error line already
  used. **Degrading to English beats degrading to silence.**
- ⚠ **AND THE WIRE FORM'S LABEL COLUMN WAS SIZED TO ENGLISH — the i18n anti-pattern
  in one magic number.** `rowLabel` was a fixed `84px`, and JetBrains Mono advances
  0.6em, so at 8.5px with 0.18em tracking a character costs ~6.63px: the column fits
  **12.6 of them**. English never needed more than **9** (`DOB · 18+`), so nothing in
  the shipped form ever revealed the ceiling. Translated it does immediately — the
  birth-date label runs to **15 characters in fr, id and vi**, which wraps the label
  to two lines against a one-line input and breaks the dotted-underline alignment the
  whole wire grammar rests on. Widened to **112px** (~16.9 characters), sized to the
  longest real translation with a character of slack, with the metric written at the
  constant so the next person recomputes rather than guesses; the input is
  `flex:1 1 auto; min-width:0` so it simply gives up the 28px.
  ⚠ **This is what a per-locale render bound looks like when it is real rather than
  stylistic**, and it is why the brief's "keep DOB literal" rule was wrong twice over:
  `DOB` is an English abbreviation rather than a term of art like kcal/RPE/HRV, the
  repo already translates the concept in all thirteen — and the constraint that
  actually bites is **pixels**, which the rule never mentioned. Measured, 7 of the
  first 8 locales translated it and only `es` kept the literal; the applier now bounds
  that one key on length instead of on literalness.
- ⚠ **AND THE APPLIER ITSELF SHIPPED A BUG THAT ONLY REAL DATA REVEALS — the 8/8
  mutation run could not have caught it.** Its placeholder check matched a bare
  `{ident`, which also matches the **literal text inside an ICU plural sub-message**:
  `one {STREAK # DAY}` yields `STREAK`. That text is translated, so comparing English
  against a locale reported a placeholder mismatch on **every plural key** and would
  have refused the entire apply. It survived the harness because the harness built its
  synthetic locale out of the **English values**, so both sides carried the same
  sub-messages and matched by construction — *the check was tested against an echo of
  itself*. Corrected to require the `,` or `}` delimiter, which is the exact form
  `tests/i18n-catalog-complete.test.mjs` had already proved out and which I should have
  reused rather than re-derived. Re-run against the **real** returns: the unmutated set
  writes, and 5/5 real-data mutations are refused (a renamed placeholder · a renamed
  **plural argument** · a dropped brand noun · a `login.fieldDob` that overflows the
  column · a key missing from one locale). **A validator exercised only against data it
  generated itself has been tested for self-consistency, not for correctness.**
- ⚠ **MY OWN BRIEF CARRIED A WRONG RULE, AND NINE OF TWELVE TRANSLATORS CAUGHT IT
  INDEPENDENTLY.** It listed **DOB** among the must-stay-literal tokens beside
  kcal/RPE/HRV — but DOB is an **English abbreviation, not a term of art**, and the
  brief's own first rule says reuse the locale's shipped term, which for this concept
  is already `dob.label` in all 13 (`Fecha de nacimiento` · `Дата народження` ·
  `Ranar haihuwa`). Nine returns flagged the rule-1-vs-rule-2 tension by name; ten
  resolved it toward the reader and translated. **`es` obeyed the rule against its own
  recommendation** — it shipped the literal and wrote *"Spanish readers do NOT parse
  'DOB' … I recommend the reviewer change it to Nacimiento · 18+. Please rule on this
  one."* Taken verbatim: that is **following the translator, not overriding one**, and
  the defect was mine. `ha` kept the literal with no shorter honest form offered
  (`Ranar haihuwa · 18+` is 19 chars against a ~17-char column) — **left as-is and
  registered rather than papered over with an invented Hausa abbreviation**; `pcm`
  keeps it legitimately (English-lexifier creole).
- ⚠ **THE COLUMN WIDENING WAS MEASURED AGAINST THE WRONG WORST CASE AND STILL HELD.**
  It was sized to fr/id/vi at 15 characters; the returns landed **uk `Ім'я користувача`
  and ru/es at 16** — 106px against the 112px column, six pixels of slack. Verified
  across all 8 field labels × 13 locales: **zero overflow**. A label column sized to
  English is the i18n anti-pattern in one magic number, and the honest form of the fix
  is a measured bound with the metric written at the site, not a bigger guess.
- ⚠ **`pcm` IS REGISTERED WITH ITS EXACT LIST RATHER THAN CERTIFIED BY ME.** 49 of 139
  values are byte-identical to English — **13 with shipped `pcm` precedent** (`Member`
  ← `coach:addClient.member`, `Password` ← `settings:account.password`, …) and **35
  without**. This file's own precedent says plain everyday lexicon in an
  English-lexifier creole is genuinely correct and only formal English **register**
  (the #1757 defect — *"redemption value"*, *"priority booking"*) is a fault; measured
  against that test the residue is field labels, format examples (`+1 555 123 4567`),
  pure placeholder templates (`{who}: {text}`) and UI chrome, while the **prose is real
  Naija Pidgin** (*"Di Shape Wire dey land every morning"* · *"Take am easy today."*).
  That reads as the legitimate pattern — but **I do not speak Naija Pidgin**, so it
  goes to the standing human review with the enumerated list, not with my assurance.
- ⚠ **AND MY OWN QUALITY DETECTOR WAS THE BROKEN INSTRUMENT ON `ha`.** A crude
  ASCII-match sweep flagged **65** Hausa values as possible untranslated English —
  Hausa is **Latin-script**, so the sweep was measuring the alphabet. The exact-equality
  count is **5**, matching that agent's own self-report line for line, and every one is
  legitimate (the DOB literal · a phone format example · the brand noun `Radio` · two
  pure-placeholder wire templates). *Check the check before believing the finding* —
  a detector that cannot distinguish a language from an encoding reports the encoding.
- ⚠ **THE INDONESIAN REGISTER SPLIT IS NARROWER AND WORSE THAN RECORDED.** This file
  already carries it as a cross-**namespace** owner call (`onboarding`/`settings` formal
  `Anda`, nine others informal `kamu`). Measured here it is **inside one namespace and
  one flow**: the shipped `dob.*` block uses `kamu`, these launch/auth keys use `Anda`,
  and the stage machine puts them **one screen apart** (`beat → lang → gate → daily`).
  So a member reads `Anda` on the wire and `kamu` on the age gate seconds later. The cut
  did not create the split; it made it visible in a single sitting. Still an owner ruling.
- **ru and uk both chose FORMAL, and both showed their work** — each measured its own
  catalog (`ru` settings 22 formal / 0 informal, coach 70/3) and noted that
  `onboarding` is internally split, with the informal half being the in-app `tour.*`
  and the formal half being `lang.*`/`dob.*` — *the launch flow's own neighbours*. Two
  independent agents reaching the same register by the same evidence is the strongest
  signal in the round, and it keeps the whole chain paywall → picker → sign-in → gate →
  home in one voice.
- **The ratchet moved, in the direction it is supposed to move.**
  **1,355 → 1,244 strings** and **125 → 117 uncovered components**; fully covered
  **84 → 91**; **`partStrings` 193 and `part.length` 31 are UNCHANGED**, which is the
  assertion that certifies the cut is *finished* rather than half-done — `noneStrings`
  falls either way, because a component's whole hard count migrates the instant
  `tr > 0`.
  ⚠ **The JSX floor dropped 358 → 357 and that is the deletion, not a loosened gate**
  — `BSCosmicWordmark` no longer exists. **A floor is only ever lowered alongside the
  deletion that caused it**, never to make a failing run pass; the reason is written
  at the assertion.
- ⚠ **`'Shape Wire'` joined BRAND; `'The Shape Community'` did NOT.** The first is the
  daily dispatch's product **name**, a sibling of Shape Radio / Store / Kitchen /
  Steps already in the set. The second is a descriptive phrase, and `feed:chip.community`
  translates *Community* in every locale — so leaving it literal would have been drift
  dressed as brand. Resolving a stubborn string by widening BRAND is the
  dishonest-recording move, and the two cases are distinguished on that test.
- **Registered, NOT built — three items this cut surfaced and deliberately left.**
  (1) **Two detector blind spots**: `ExportDefaultDeclaration` is never unwrapped, so
  `BSDobGate.jsx` and `BSLanguagePicker.jsx` appear in **none** of the 357 rows; and
  `ClassDeclaration` is never collected, so `BSErrorBoundary`'s 7 live strings are
  invisible. Widening the walk **adds** components and strings to the measurement, so
  it is its own PR — doing it here would have muddied every number above.
  (2) **`BSErrorBoundary` is still English** — a class component outside the provider,
  so it needs the provider-free `window.ShapeI18n.t` path.
  (3) **Dead code this deletion orphaned but did not remove**: `BSNightSky` (its only
  consumer was the cosmos branch; still window-exported, zero readers) and four CSS
  class families in the shared chrome (`.bs-splash-title/-the/-shape/-daily`,
  `.bs-splash-zoom/-burst/-beam`, `.bs-sky-tw/.bs-aurora/.bs-shoot`). None carries
  copy, so none of it is an i18n concern — and touching the shared chrome to sweep it
  would widen this diff for nothing.

### 2026-08-29 — Session handoff: `docs/HANDOFF-2026-08-29.md`

- **The session's seven PRs** — #1949 Sentry user context on both web surfaces · #1950/#1951/#1952
  the §C weekly readout (evidence layer → server-side weekly claim → the member-facing station)
  · #1953 the search ceiling + the honesty pass that had to come first · #1954 the i18n surface
  measurement · #1955 both migrations verified live. `main` at **`decbf53ca`**, suite
  **2449/2449**, `tsc` clean, **no migration owed**, nothing in flight.
- **Handoff: [`docs/HANDOFF-2026-08-29.md`](HANDOFF-2026-08-29.md)** — the newest handoff on disk
  was 2026-08-19, so this closes a ten-day gap. It carries the state snapshot, the four scoped
  i18n cuts (launch shell · `BSSession` · the meal logger · the `BSClientEat` partial) with their
  measured string counts and file/line anchors, the second search window, the outstanding owner
  rulings, and the working notes that cost time this session.
- ⚠ **The one mechanic a diff cannot show you:** the ratchet in
  `tests/i18n-surface-inventory.test.mjs` **fails on progress by design**. Localizing a surface
  means deleting its baseline line AND lowering the exact asserted totals in the same PR — a
  green suite after localizing a component means the job is half done. `BSLogMealFlow` also
  carries a guard-the-guard pinned at `tr === 0` that must be re-pointed, not deleted.

### 2026-08-29 — The i18n "COMPLETE" claim finally gets a measurement

- **The claim has been corrected FOUR times, and every correction was a
  per-omission repair.** Shape Score, then "The Record", then the whole Progress
  hub, then the readout wave finding the section still declaring itself complete —
  each found by a **reader**, never by a gate. The reason is structural and this file already named it: the 2026-07-16
  rollout shipped per **NAMED surface**, and **nothing ever audited what was
  absent from the list**, so *"every surface"* was never a measured claim. The
  registered next step was to *enumerate the surfaces and check them*; this is
  that, and it is deliberately the enumeration rather than a **fifth** repair.
- ⚠ **MEASURED, AND IT IS NOT CLOSE.** `tests/i18n-surface-inventory.test.mjs`
  walks `mobile-app/src/broadsheet/*.jsx` with the AST: **358** components render
  JSX — **84 fully localized · 31 partial** (193 strings still hardcoded) ·
  **125 with NO translator in scope at all** (1,355 strings) · 118 render no user
  copy. Of the **240** that render copy, **35% are localized.**
  ⚠ **SUPERSEDED BY CUTS 1–3 (same day, entries above) — these are the figures as
  first measured, kept because the entry is dated.** After the launch/auth shell:
  **357** render JSX (BSCosmicWordmark, an orphan, was deleted) — **91 fully
  localized · 31 partial** (193, unchanged) · **117 with no translator** (1,244) ·
  118 no copy. After the live session player (cut 2): **92 · 116 (1,170)**. After
  the meal logger (cut 3): **93 · 115 (1,104)** — `partStrings` 193 and
  `part.length` 31 unchanged throughout, which is what certifies each cut is
  finished rather than half-done. **Read the guard's MEASUREMENT output, never a
  figure on this page** — including this one.
- ⚠ **AND THE UNCOVERED SET IS NOT THE TAIL — IT IS THE PRODUCT.** The **profile
  customizer** (76 strings), the **live session player** (`BSSession`, 74), the
  **coach application** (67), the **meal logger** (`BSLogMealFlow`, 66), the
  **sign-in / create-account form** (`BSLogin`, 51) and the **workout builder**
  (44) all carry **zero `tr()`**.
- ⚠ **AND THE LANGUAGE PICKER IS THE ONLY LOCALIZED SCREEN IN THE ENTIRE LAUNCH
  FLOW.** `BSLanguagePicker` has 3 `tr()` calls; every screen on either side of it
  carries none — the wire beat and the "Shape Daily" telegram (both `BSSplash`,
  35), the paywall (`BSPaywall`, 8), the sign-in / create-account form (`BSLogin`,
  51), the preview banner (4), `BSWireHold`, `BSWireLoading` and `BSAppShell`.
  Verified against the stage machine (`beat → lang → gate → … → daily`), not
  assumed. So a member picks Spanish and the very next screen — and every screen
  until the app itself — is English.
- ⚠ **COVERAGE IS A PROPERTY OF A COMPONENT, NOT A FILE — the same mistake #1953
  had just been rewritten to stop making, applied here up front.**
  `iosAppBroadsheetClient.jsx` carries **~1,600 `tr()` calls** *and* four of those
  six surfaces; a per-file count reads the file as covered and hides every one of
  them. That is exactly how three of the four corrections got missed.
- ⚠ **THE WORST NUMBER IS A PARTIAL, NOT A ZERO.** `BSClientEat` — a **primary
  tab** — has **3 `tr()` calls against 62 hardcoded strings**. A per-file count
  can't see it; a per-component *zero* check can't either. It is only visible
  because the walk reports partials as their own class.
- ⚠ **AND THE FIRST PUBLISHED NUMBER WAS WRONG — COPY IS NOT ONLY A DIRECT CHILD
  OF ITS CONTAINER** (Codex P1 on #1954, verified against the source and taken).
  The detector counted a string only when its **immediate parent** was a JSX
  expression container or one of seven attributes — so copy routed through a
  conditional or a local data object was invisible: `{isAdded ? '✓ ADDED' : '+
  ADD'}` puts the literals under a `ConditionalExpression`, `{a || 'Untitled'}`
  under a `LogicalExpression`. **Whole components were classified as rendering no
  user copy at all** — `BSConfirmSheet` (*"Are you sure?" · "Cancel" · "Confirm"* —
  the shared confirm dialog), the **Find-a-coach bar**, the **Save button**, the
  **widget picker**, the GPS preview — so they sat in **neither** baseline, and a
  new component using that everyday shape would have walked straight past the
  ratchet. The measurement had the exact blind spot the PR was written about.
- **A rendered expression container is walked whole now**, stopping at nested JSX
  (visited on its own terms — descending double-counts), **calls** (a
  `tr('key', {defaultValue})` argument is a key, not copy), **comparison
  operands** (`typeof x === 'string'` is a token, and counting them read four
  animation components plus three shells as carrying untranslated copy) and
  **`<style>`/`<script>` children** (`@keyframes` is not copy).
  ⚠ **`walk()`'s return value became load-bearing in the same edit and was being
  ignored** — the first cut of the container walk pruned nothing, collected every
  `tr()` defaultValue and style-object literal, and reported **4,094** strings:
  wrong in the *other* direction, and it would have read as a bigger, scarier gap
  rather than as a broken instrument.
- ⚠ **AND ONE TEMPTING WIDENING WAS REJECTED ON ITS NUMBERS.** Attributing
  copy-keyed object properties (`title`/`label`/`hint`) to their component looked
  like the natural companion fix — it is how `BSWidgetPicker`'s group titles are
  declared. Measured, it added **ZERO components** and only inflated the string
  count with **demo fixtures** (community-feed posts, demo client names, sample
  meal titles). So it is out, and the residual is stated instead: **copy declared
  in a data table and rendered by reference (`{W.label}`) is not attributed to the
  component** — a limit of a lexical walk, which means **the real gap is larger
  than reported**, never smaller.
- **The guard is a two-way ratchet, not a target list.** A **new** uncovered
  surface fails; a baseline entry that is **now covered, or no longer exists**,
  also fails — so the set can never silently vouch for code that moved on.
  Localizing a surface means **deleting its line**, which is how progress gets
  recorded instead of asserted. Partials are pinned both ways too, so a localized
  surface that starts hardcoding copy again fails on the way back down.
- ⚠ **AND THE DETECTOR ASKED HOW A TRANSLATOR IS *SPELLED*, NOT WHAT IT IS *BOUND
  TO*** (CodeRabbit on #1954). It matched `/^(tr|[a-z]\w*Tr)$/` — a guess at a
  naming convention wearing a pattern — and `BSGrocery` binds `const trG =
  useShapeTr()`, which the regex misses. Reading the **bindings** instead
  (`useShapeTr()` / `useTr()` results, plus the pros module's module-scope
  non-hook **`coachTr`** — the roster helpers cannot hold a hook, #1746) surfaced
  **three more defects in the same line of code**, each one the regex was hiding:
  the **hook call itself** matched, so a component that took `useShapeTr()` and
  never used it read as covered; counting only **calls** read the two marketplace
  cards as having no translator (they *inject* `tr` into a module-scope helper —
  the sanctioned pattern here — so they route copy through it without ever calling
  it); and counting **references** then caught the **parameter shadows this file
  has already recorded once** — `getTracks().forEach(tr => tr.stop())` is a
  MediaStreamTrack, `list.map((tr, i) => …)` in `BSPlaylistCard` a playlist track,
  and both live in components with **no translator at all**, so the shadow read
  them as covered.
- ⚠ **THE FINDING WAS REAL ABOUT THE RULE AND INVISIBLE IN THE NUMBERS — which is
  the part worth keeping.** `BSGrocery`'s classification was right *by accident*:
  the regex wrongly matched the **hook name** in exactly the component whose
  **binding** it wrongly missed, and the two errors cancelled. Only tightening the
  test to an exact count (`MktCoachCard` must read **1** reference, not 2 — the
  binding and the hook are not uses) makes the wrong rule fail. **A rule can be
  wrong and still produce the right answer on today's tree; that is not evidence
  it is right, and it is exactly how a detector rots silently.**
- ⚠ **UNITS ARE NOT COPY, AND THE FIRST CUT OF THAT EXCLUSION LIED.** `lb`, `min`,
  `kg`, `ms` clear the two-letter test and land in running text, so they read as
  untranslated strings on every stat surface. But case-folding `hr` collided with
  **`HR`** (heart rate) and silently dropped the only string `BSSplitsPage`
  hardcodes. Heart rate is a term of art and now sits in the brand set beside
  RPE/HRV/BPM; the rule is written at the set: **a token is excluded only when it
  cannot also be an English word in running copy** — so `in`, `am` and `pm` are
  deliberately *not* excluded, because a false exclusion hides real copy, which is
  the direction that makes the guard lie.
- ⚠ **AND MY OWN WALKER SHIPPED BROKEN — CAUGHT BY ITS OWN GUARD-THE-GUARD.** The
  first cut walked the `Program` root with a range test, and the root's own
  `start` is **0**, so `n.start < component.start` pruned the entire tree and the
  inventory came back **empty** — every ratchet assertion would have passed
  vacuously, forever, on a file that reported nothing. The *only* reason it
  surfaced is the assertion that the walk must resolve >300 components and >80
  covered ones. **An inventory guard needs a floor, or its silence is
  indistinguishable from a clean tree.**
- **Brand nouns and terms of art are excluded** (Shape · Shape Score · Nora ·
  Spotify · `Vol. 1 · No. 1` · RPE · e1RM · kcal · HRV …) — the house rule the
  13-locale translator brief already follows. Counting them would inflate the gap
  with strings no locale should change; the 1,548 figure is net of them.
- **Registered, NOT built — and deliberately not started here.** Localizing 125
  components is a multi-PR wave (≈1,355 strings × 13 locales), and the highest-
  value first cuts are the ones a member hits in a session: **`BSSession`**, the
  **meal logger**, the **auth/splash shell**, and the **`BSClientEat` partial**.
  ⚠ **The auth/splash shell SHIPPED as cut 1** (entry above); `BSSession`, the meal
  logger and the `BSClientEat` partial are still open, in that order.
  Firing that unattended would be the opposite of what the measurement is for.
- ⚠ **THE MEASUREMENT TEST NOW ASSERTS ITS TOTALS, because the ratchet cannot see
  them.** Membership is pinned both ways — but a partial surface that hardcodes
  ten MORE strings keeps its membership and passes. The string volumes are
  asserted exactly, so a change there is either progress (lower the number and the
  record with it) or a regression, and both have to be a deliberate edit. The
  component counts that move on unrelated additions stay floors, and say so.
- ⚠ **AND A BASELINE ENTRY THAT STOPS RENDERING COPY IS AS STALE AS ONE THAT GAINS
  A TRANSLATOR.** Without that branch an entry whose strings all moved out keeps
  asserting a gap that no longer exists — the ratchet vouching for code that moved,
  which is the class this whole file exists to end.
- **17 mutations, all caught, and one documented equivalent** — the ratchet (a new
  uncovered component · copy ONLY in a conditional · a baseline entry that gained a
  translator · a stale entry · a no-copy entry parked in the baseline · a covered
  component regressing) and the detector (revert to the spelling regex · drop the
  parameter-shadow prune · count calls instead of references · drop the `coachTr`
  widening · drop the destructured `useTr()` binding · immediate-parent-only ·
  `<style>` children · comparison operands · `walk()` ignoring the prune signal ·
  the walker returning nothing · empty the unit set · un-except `HR`) —
  unmutated sanity green at both ends and the tree restored clean after each.
  ⚠ The equivalent is *swapping the derived binding set back for the old regex on
  the reference count alone*: on today's tree its two errors cancel (above), so it
  is killed only by the exact-count assertion, not by the classification.
  Verified: `npm test` · `tsc` 0 · all broadsheet files parse.

### 2026-08-29 — Search gets a ceiling, and stops fabricating answers when it cannot give one

- **The two universal-search RPCs have never been rate-limited**, and the proxy could
  never have covered them: all **five** callers reach `search_shape_people` /
  `search_members` **directly from the browser with the publishable key** — the app's
  universal search, the site header search, the standalone-page search, the DM send
  picker and the post tag picker — so nothing passes through `/api/*`. The 2026-07-30
  hardening pass escaped the LIKE wildcards and clamped the term, and its own note
  named what it left open: *"the real fix is having them call the existing HMAC bucket
  RPC."* This is that fix, plus the half of it that turned out to matter more.
- ⚠ **THE LIMITER ALONE WOULD HAVE BEEN WORSE THAN THE PROBLEM.** Every caller turned
  an RPC error into an **empty result list**, so a refusal would have told a member
  that a real person **is not on Shape** — a lie the surface had no way to distinguish
  from an honest miss. And the app's legacy fallback sat under a **bare catch**, so a
  refused search immediately fired a **second RPC**: the limiter would have *doubled*
  the load it exists to halve. So the callers come first — the fallback now fires only
  on the codes that mean *that function is not deployed*, and every surface tells a
  refusal apart from an empty answer in its own words.
- ⚠ **MATCHED ON THE SQLSTATE, NEVER THE MESSAGE.** `PT429` is the PostgREST
  convention that yields a real 429 where honoured and always surfaces as
  `code: 'PT429'`; a sentence is a **spelling to pin**, which is exactly what #1936
  cost. The app does not re-type the code at all — the predicate
  (`ShapeSearch.isRateLimited`) lives once in the data layer and the UI asks it. The
  three web bundles carry the literal because they are classic scripts that cannot
  import it, and a guard pins **that asymmetry** rather than the string.
- ⚠ **AND A LIVE FABRICATION, FOUND IN THE SAME SURFACE.** The app typeahead read
  `r.length ? r : local`, so a signed-in member whose search matched nobody — or whose
  search **failed** — was shown the **DEMO CAST**: fictional people with `userId` null,
  stock faces, and nothing on the row telling them apart from real accounts; tapping
  one opened a derived profile. The honest empty state (*"Nothing on Shape matches…"*
  plus the marketplace door) **was already written in all three surfaces** — the
  substitution is the only reason it could never render for a signed-in member.
- **THE MIGRATION — and why it has to touch `check_rate_limit`.** Both search functions
  become **plpgsql and VOLATILE**, and they must: a counter is a write, Postgres
  refuses one inside a non-volatile function (*"INSERT is not allowed in a
  non-volatile function"*), and `LANGUAGE sql` **cannot RAISE a refusal at all**. Each
  SELECT is carried over **verbatim** — ranking, escaping, clamp, visibility rules and
  limits unchanged.
  ⚠ **The bucket name has to be unforgeable.** `check_rate_limit` is granted to `anon`
  **and** `authenticated` by design (the Edge proxy's anon client must reach it), so
  any signed-in caller can bump any bucket it can **NAME** — and `self:search:<uuid>`
  is trivially guessable. A limiter keyed on the caller's uid would otherwise have
  handed every member a way to **lock a chosen victim out of search**. So the `self:`
  namespace is **reserved**, the public entry point refuses it (`42501`), and only
  `check_rate_limit_self` can write there — it takes a **SCOPE, never an identity**,
  and derives the key from `auth.uid()`. Both writers are revoked from every client
  role, and the fixed-window arithmetic moves into **one** private helper both entry
  points call, so it exists once.
- ⚠ **BOTH SEARCHES SHARE ONE BUCKET, ON PURPOSE** — so a refused search cannot spend a
  second allowance through the legacy fallback.
- **VALIDATED AS AN ARTIFACT, NOT AS PIECES** (the #1853 lesson — a migration that
  compiles in parts can still fail to apply as a whole). The complete file was applied
  **inside a transaction against production and rolled back**, its own structural guard
  passing, with **seven behavioural checks in the same transaction**: the `self:`
  namespace refused `42501`, an ordinary api key still allowed, the self limiter
  counting and refusing past its max, both searches returning unchanged rows, the
  wildcard escaping intact, and — past the ceiling — **both** functions raising `PT429`
  from the one shared bucket. The rollback mechanism itself was verified first, and the
  rollback re-verified after (helpers absent, `search_shape_people` back to `s`/STABLE).
- ⚠ **THE MIGRATION FILE MERGED ONE PR EARLY, AND THE ORDERING IS THE WHOLE POINT.** It
  was swept into **#1952** (the readout surface) by an over-broad `git add` — a PR whose
  body never mentioned it — so it reached `main` **ahead of its own callers**. Harmless
  only because it sat **unapplied** through that window; had it been applied there, every
  refusal would have rendered as *"this person is not on Shape."* **Stage the paths you
  mean, not the tree** — and when a change is split across a migration and its callers,
  the migration is the half that must never lead.
  ✅ **THE ORDERING HELD, AND THE MIGRATION IS APPLIED + VERIFIED LIVE 2026-08-29** (owner
  ran it, callers deployed first). Structure: `_rate_limit_bump` + `check_rate_limit_self`
  exist, SECURITY DEFINER with `search_path` pinned and revoked from **anon AND
  authenticated** (service_role only), so no client role can write the `self:` namespace;
  `check_rate_limit` stays anon+authenticated for the Edge proxy; both searches are now
  **`plpgsql`/VOLATILE** — the change that lets a counter write and a refusal RAISE at all
  — still anon-revoked, authenticated-granted. **Behaviour probed on production inside a
  transaction the probe rolled back by raising**: a `self:search:<uuid>` key **REFUSED
  42501**, an ordinary key still allowed and counting, and `check_rate_limit_self`
  **DENIED** to `authenticated`. Security advisors after: **0 ERROR**, neither helper in
  any WARN.
- ⚠ **AND THE CEILING FORCED A LOOK AT WHAT THE CALLERS ACTUALLY EMIT — WHICH FOUND THE
  ONE THAT WOULD HAVE BEEN REFUSED FIRST.** Four of the five debounce (220–250ms); the
  **post tag picker fired one RPC per keystroke**, deps `[tagOpen, tagQuery]` and no
  timer at all — a dozen requests to type one name, four names to a post. So the caller
  generating the most search load was the only one spending it a character at a time,
  and a per-member ceiling would have refused a member **tagging their training
  partners**, which is entirely legitimate use. Debounced to **220ms, matching its own
  sibling in the same file** (`SendPostModal`) — the inconsistency was internal to one
  component family. This **reduces the load the limiter exists to bound**, which is the
  right order: fix the source, then cap it.
- ⚠ **THAT IS ALSO WHY 60/min IS SAFE, AND THE GUARD SAYS SO.** The rate is only far
  above human use *because* every surface waits for the typing to settle, so a caller
  added later without a debounce silently re-tunes the ceiling for everybody. A test
  pins the debounce **at each call site** — looking backwards from the RPC for the timer
  and forwards for the delay, since a `setTimeout` elsewhere in the file proves nothing.
- ⚠ **ONE WINDOW ONLY, AND THE SECOND IS REGISTERED RATHER THAN GUESSED.** A longer
  window (e.g. 600/hour) would bound a patient scraper that the per-minute ceiling lets
  through; it needs its own measurement, so it is on the board, not in this file.
- ⚠ **AND MY OWN NARROWED FALLBACK STILL MATCHED TOO MUCH — found by re-reading the
  diff, not by a gate.** The missing-function safety net kept a bare
  `/does not exist/i` beside the codes, and Postgres words **every** undefined object
  that way: `relation "x" does not exist` (42P01), a missing column (42703). So a
  schema or permission fault would have fallen through to the legacy RPC and spent a
  **second allowance** — precisely the failure the narrowing exists to prevent. The
  message check now requires the word **function**, and the guard **drives the real
  predicate** over eight error shapes (the two codes, both real missing-function
  messages, and the four that must not fall through, the refusal among them) rather
  than pinning its spelling.
- ⚠ **AND THE REVIEW FOUND TWO MORE IN MY OWN REFUSAL BRANCHES — BOTH REAL, BOTH
  VERIFIED AGAINST THE CODE BEFORE ACTING.** (1) The site header search shipped
  `fontFamily: SANS` where **nothing in scope defines it**, so the branch threw a
  ReferenceError and **blanked the whole search overlay exactly when a member was
  rate-limited** — the one state it exists to render. Valid syntax, so the
  parse-check passed and `tsc` does not cover these browser-babel files.
  (2) The tag picker's refusal set the flag but **left the previous query's people
  on screen**, and the notice was gated behind `tagResults.length === 0` — so stale
  rows rendered under the new query text and the member **tags the wrong account on
  a public post**. That is worse than the empty list this change set out to fix: an
  empty list says *nobody*, stale rows say *this person*. Fixed at the **state and
  the render**, since either alone leaves the other as a trap.
- ⚠ **AND THE SECOND ONE WAS ENUMERATED, NOT PATCHED WHERE IT WAS REPORTED.** The
  tag picker's refusal was invisible because the notice sat **behind** the
  empty-state test — the same ordering mistake on any other surface hides a refusal
  the same way. Swept every caller: the app typeahead, the site header search
  and `pageShell` all clear their rows and test the refusal **first**;
  `siteSearch.js` rebuilds its markup each render so it has no stale state at all.
  **Only the tag picker had it.** The ordering is now pinned on every surface, so it
  cannot return on one nobody was looking at.
- ⚠ **AND THAT SWEEP WAS OF THE WRONG PROPERTY — ONE STEP TOO NARROW, FOUND ON THE
  NEXT HEAD.** It swept for *a refusal rendering as an empty list* and pinned the
  ordering everywhere. But a refusal is only one of the ways rows stop being an
  answer: **a NEW QUERY is another**, and no surface was clearing for it. Typing
  `Alex` → `Alicia` left Alex on screen — and **actionable** — for the whole
  debounce plus the round trip, on pickers whose row does not display a person but
  **sends to, tags, or adds** that person. On the tag picker that is the exact
  tag-the-wrong-account defect fixed one round earlier, reached by typing instead
  of by being refused.
- ⚠ **SO THE RULE IS WIDER THAN THE ONE THIS ENTRY SHIPPED: the rows on screen must
  always be an answer to the query on screen.** Refused, failed, closed, or simply
  **superseded by a newer query** — in every case they must go **before the next
  search starts**, not after it returns; clearing inside the debounce leaves them
  live for exactly the window a member types in. That needs a **fourth** outcome
  beside refused · failed · empty: **pending**, the gap between a query and its
  answer, which was unmodelled and therefore wore the previous answer's state.
  Only a **settled successful** search may say nobody matched.
- ⚠ **TWO SURFACES ALREADY HAD IT, BY TWO DIFFERENT MECHANISMS, AND ARE NOW THE
  REFERENCE RATHER THAN REWRITTEN** — the coach roster gates every row on
  `!searching`, and `siteSearch.js` overwrites its list with *Searching…* markup
  synchronously (which is what "rebuilds its markup each render" above is actually
  describing). Five did not. **And two of the five already HAD a pending render
  that could never re-fire**: the app typeahead's `busy && !rows` and the header
  search's `rows === null` only ever ran on the FIRST search, because `busy`
  flipped while `rows` still held the last answer. **The pending state existed;
  the clear that reaches it did not.**
- ⚠ **THE SEND SHEET WAS RE-TYPING THE REFUSAL COPY INLINE** — the drift the shared
  notice component's own comment says it prevents — and with a pending state its
  `!== 'ok'` branch would have printed *"couldn't search just now"* mid-debounce,
  i.e. this file's fabrication class in the other direction: reporting a fault that
  has not happened. Folded onto the component. Every branch is now a **value gate
  naming the states it answers for**, so a reorder cannot make one state wear
  another's copy, and the two empty states held back only by branch order require a
  settled search explicitly.
- ⚠ **AND THREE GUARDS PINNED `state !== 'ok'`, WHICH WAS TRUE OF THE CODE AND FALSE
  OF THE RULE.** A negation admits *every* non-ok state into the refusal branch — so
  the shape they pinned is precisely the shape that lies during a debounce. They
  assert the states a branch answers for now. ⚠ **And the first cut of the new guard
  carried the trap it was written to catch**: two of its five regions began at an
  early return that already contains `setRows(null)` (for the empty query), so the
  needle matched inside its own marker and the assertion passed with the real clear
  deleted — caught by mutation-testing, not by reading it.
- ⚠ **SCOPE HERE IS CROSS-BUNDLE, AND CHECKING THAT IS WHAT SEPARATED THE BUG FROM A
  FALSE ALARM.** The first guard I wrote flagged `dashboardCommunity`'s
  `fontFamily: serif` too — but babel-standalone evaluates these scripts through
  **global eval**, so a **top-level** `const` in one bundle is visible to every
  other bundle on the same page, and `serif` is declared at column 0 in
  `pageShell.jsx`, which co-loads on every consuming page. Correct, not a bug. The
  same mechanism is why `SANS` genuinely was one: `siteSearch.js` declares it
  **inside an IIFE**, and a declaration in a closure never escapes. So the guard
  resolves each surface against the **union of the top-level declarations of every
  bundle its pages co-load**, counting column-0 declarations only — and refuses to
  pass vacuously if it resolves no tokens at all.
- ⚠ **AND THE REVIEW'S SHARPEST FINDING WAS THAT MY OWN HONESTY RULE STOPPED ONE
  STEP SHORT.** Every surface turned a **non-refusal failure** — a dropped
  connection, an RLS fault — into an **empty list**, which renders *"Nothing on
  Shape matches."* That is the same fabrication as the demo cast, one step quieter:
  telling a member a real person is not on Shape on evidence we never had. My own
  comment even called it *"the honest floor"* while doing it. There are **three**
  outcomes, not two — **refused · failed · genuinely empty** — and only the last is
  evidence about who exists. Every caller now says which.
- ⚠ **AND A FOURTH DOOR ONTO THE DEMO CAST — A MISSING DATA LAYER, NOT A SIGNED-OUT
  MEMBER.** The typeahead branched on ONE condition, `signedIn && window.ShapeSearch`,
  so its `else` covered **two cases**: signed out (demo, correct) and **signed in with
  the wrapper absent** (demo, a fabrication). Not hypothetical —
  **`window.ShapeAuth` is assigned at `shapeBackend.js:3929` and `window.ShapeSearch`
  at `:6233`, 2,300 lines apart in ONE module**, so anything throwing between them
  leaves a readable cached session and no search wrapper, permanently; the `?.`
  already on that catch's `isRateLimited` says the author expected exactly this.
  **Only `!signedIn` reaches the demo cast now**, and an absent wrapper is a
  **FAILURE** — not a refusal and not an empty result, because we never asked. ⚠ The
  **suggestion rail one function above was already right** (`if (!dead && !signedIn)`),
  which is what made the typeahead's shape visible as the outlier.
- ⚠ **THE DEMO CAST HAD A SECOND DOOR, THROUGH A STALE CLOSURE.** `signedIn` is
  recomputed from the auth cache on every render, but the typeahead effect depended
  on `[q]` alone — so a timer scheduled **before a session resolved** fired with the
  stale `false` and rendered the **demo people to a signed-in member**, which is the
  precise fabrication this change set out to delete. `signedIn` is now a dependency.
  ⚠ **Pinned by a SOURCE guard, and the reason is a property of the harness, not a
  shortcut:** the mount harness ignores dependency arrays, so no behavioural test can
  reach it — the guard says so, to keep the next reader from mistaking it for laziness.
- ⚠ **AND THE FALLBACK STILL FIRED ON THE WRONG MISSING FUNCTION.** `42883` is
  Postgres saying **some** function does not exist — including a **helper called from
  inside `search_shape_people`** — so a genuine execution fault could masquerade as a
  stale schema and quietly return names-only results while hiding the real error. It
  now keys on the RPC actually called: `PGRST202` stands alone (PostgREST raises it
  about the function you called), everything else must **name** it.
- ⚠ **TWO RECORDS CORRECTIONS THE REVIEW WAS RIGHT ABOUT.** The ceiling is **60 per
  FIXED window**, not "per rolling minute" — a fixed window admits 60 at the end of
  one and 60 at the start of the next, a 120 burst across the boundary, and calling
  that rolling promises a guarantee the counter does not make. And the *"a session is
  ~5–10 requests"* figure **did not follow from the debounce**: a debounce bounds
  requests **per pause**, not per session. Both corrected; the rate is now recorded as
  a headroom judgement, with a measured per-caller request trace named as the honest
  way to tighten it.
- ⚠ **A MARKER THAT SELECTED SOMEONE ELSE'S CODE — the `extractFn` trap again, in a
  guard this time.** Anchoring on `.catch(` found `siteSearch.js`'s **Supabase bundle
  loader**, several hundred lines above the search, so the assertion passed while
  saying nothing about the code it named. Anchored on the RPC instead.
- ⚠ **AND THE DEBOUNCE GUARD PROVED THE ARGUMENT LIST, NOT THE CALLBACK.** The
  round-4 version brace-matched the `setTimeout(…)` **parens**, so `close > call`
  established only that the marker sat somewhere among its **arguments** —
  `setTimeout(cb, directSearch(), 250)` satisfies that while searching on every
  keystroke, which is the precise regression the guard exists to catch. It now
  parses the callback **head** (`() =>` · `async () =>` · `function () `), brace-
  matches the `{` that opens ITS body, and requires the call inside; the delay is
  read after the body closes, so a literal elsewhere in the file can't stand in.
  Mutation-checked with the reviewer's own counterexample.
- ⚠ **THE CALLER LIST WAS WRONG, AND THAT IS THE FINDING — NOT THE TWO SURFACES IT
  MISSED.** This entry said *"all five callers"*. ⚠ **AND THE CORRECTION BELOW SAID
  SIX, WHICH IS ALSO WRONG — see the next round: four mobile member pickers reach the
  same RPC through a second wrapper. The number has been restated three times and been
  wrong three times, which is the whole reason this record now points at a derived
  guard instead of a count.** The **coach
  roster** search (`iosAppBroadsheetPros.jsx`) swallowed every error into `[]` and
  rendered *"No members match — share your listing link instead."* to a coach whose
  search was **refused or failed** — the exact claim this whole change exists to stop
  making, on the one surface where the row's action **invites a named person**, so a
  stale match invites the wrong account. And the app's **suggestion rail** — three
  lines above the typeahead I had just fixed — fell through to the **demo cast** for a
  signed-in member on **all three** of empty, refused and failed, with the same
  `[]`-dep stale-closure trap underneath it (a mount before auth resolved wrote
  fictional accounts, and the flip could not un-write them, so the re-run now clears
  first).
- ⚠ **AND THE GUARD NO LONGER TAKES MY WORD FOR THE INVENTORY, WHICH IS THE ONLY PART
  THAT GENERALISES.** Every surface table here was populated by enumerating the
  callers I remembered — which is precisely why a suite of sixteen assertions passed,
  twice, over a caller that was never in it. **A list of callers cannot prove it is
  the list of callers.** A new test WALKS THE TREE and fails on a call site that
  searches without being
  covered — and fails the other way too, if a listed file stops searching, so the set
  cannot silently vouch for behaviour that has moved. The next caller is caught at the
  gate instead of by the next reviewer.
- ⚠ **AND THAT GUARD WAS STILL WRONG TWICE, BOTH FOUND ON THE NEXT HEAD — the count
  was never the finding.** It was **per-FILE**, so `iosAppBroadsheetClient.jsx` counted
  as covered for its `ShapeSearch.people` use while **four other call sites in that same
  file** searched uncovered: **coverage is a property of a CALL SITE, not a filename.**
  And it knew only the wrapper I remembered — the four **member pickers** (send-a-post ·
  new message · add-to-channel · tag-in-a-post) reach `search_members` through a
  **SECOND data-layer wrapper**, `ShapeChannels.searchMembers`, which no list had ever
  mentioned. Every one collapsed a refusal into an empty list and **three had no
  debounce at all** — so the pickers were simultaneously the least protected callers and
  a way to spend the allowance a keystroke at a time.
- ⚠ **AND THE MOBILE TAG PICKER WAS THE SAME DEFECT I HAD ALREADY FIXED ON THE WEBSITE,
  STILL LIVE.** A refusal left the previous query's people on screen under the new query,
  and that row **tags a named person on a public post** — an empty list says *nobody*,
  stale rows say *this person*. All four now share **one hook**: debounced, rows cleared
  on refusal, on failure **and on close** (so reopening cannot paint the previous
  session's people), with the notice **gated ahead of** the empty branch rather than
  merely placed before it — a gate survives a JSX reorder, an ordering does not.
- ⚠ **THE GUARD IS NOW AST-BASED, PER-CALL-SITE, AND DERIVES THE WRAPPERS.** It reads
  the data layer for the functions whose bodies call a search RPC, then for the public
  aliases those are exported under — so a third wrapper is picked up with nobody
  remembering to. It also accepts **`OptionalCallExpression`**: the coach roster uses
  `?.()`, and a `CallExpression`-only walk had been stepping straight past it. Proven by
  planting an optional-form uncovered caller — **caught with the widening, invisible
  without it**.
- ⚠ **A ROLLOUT NOTE THIS CHANGED, AND THEN CHANGED AGAIN — WHICH IS WHY IT NO LONGER
  CARRIES A NUMBER.** The pre-apply check said five bundles, then six, and was wrong both
  times; the four mobile pickers made it wrong a third. It now names the **surfaces** and
  points at the derived guard as the authority. The migration header stopped listing
  callers for the same reason. The coach app and the pickers all ship in the same
  deploy-built `public/m`, so a stale deploy is the realistic way to apply the ceiling
  over surfaces that still read a refusal as *"No members match"*.
- Verified: **2441/2441** · `tsc` 0 · newdesign precompile `--check` 0 · mobile build 0
  with the two new coach keys and the picker refusal copy confirmed in the emitted bundle · both mobile + newdesign
  parse · catalog parity ×13 · **36 mutations, all caught** (drop the ceiling from either search · make the ceiling non-VOLATILE ·
  un-reserve the `self:` namespace · grant the private limiter to a client role ·
  restore the bare-catch fallback · match the refusal message instead of the code ·
  re-type `PT429` in the app · restore the demo substitution · drop a surface's refusal
  notice · un-debounce the tag picker · loosen a debounce under the floor · un-debounce
  the standalone-page search · widen the fallback back to a bare `does not exist` ·
  drop the code set and match on the message alone · reintroduce the exact `SANS`
  reference · stop clearing the tag rows on a refusal · re-gate the refusal notice
  behind an empty list · swap a surface's branch order so the empty state is tested
  first · delete a surface's refusal branch outright · collapse a failure into the
  empty state on three separate surfaces · drop `signedIn` from the effect deps ·
  widen the fallback back to any missing function · unwire the function name at the
  call site · render a thrown search as an empty result again · un-debounce the tag
  picker after the refactor · restore the coach roster's swallow-into-empty · put its
  refusal notice behind the empty state · restore the suggestion rail's demo fallback ·
  drop `signedIn` from the suggestion effect's deps · drop a real caller from the
  inventory's covered set · leave a stale entry in it · break the call pattern so it
  matches nothing · move a search call out of its timer callback into the timer's
  argument list), unmutated sanity green at both ends and the tree restored clean
  after each. The inventory guard was additionally driven by **planting a genuinely new
  uncovered caller** in the walked tree — the question it exists to answer is what it
  does with a real file, not what a comment claims about it, and it failed on the plant.
- ⚠ **AND ONE OF THOSE MUTATIONS "SURVIVED" UNTIL THE MEASUREMENT WAS CHECKED.** The
  break-the-pattern case reported a pass — because the `sed` anchor was `rpc(` while the
  source reads `rpc\(`, so nothing was edited and the run measured an **unmutated tree**.
  Re-applied with the edit verified present, it was caught. *Check the check before
  believing the finding* — a mutation that reports a survivor is a broken instrument
  until the mutation is proven to have landed.

### 2026-08-29 — The weekly readout reaches the member (§C closes)

- **A route with no reader is a route nobody has.** Steps 1 (#1950) and 2 (#1951)
  built the evidence layer and the claimed, cached server; `/api/ai/weekly-readout`
  has been correct and **orphaned** since — a member has never seen a word of it.
  `BSWeeklyReadoutCard` now leads the **Progress hub Overall tab** in that hub's own
  Field Ledger language (station head on the member's tier heat, serif summary lead,
  dot-leader insight rows). **No migration, no route change.**
- ⚠ **THE SIGNED-OUT PREVIEW RENDERS NOTHING, AGAINST THIS HUB'S OWN CONVENTION.**
  Every other station here shows a demo of a live account when signed out — that is
  the established pattern and the reason `BSPROG_DEMO` exists. A **readout** is a
  different kind of object: it is a claim about a specific person's body, in
  sentences, so a demo one is a **fabricated health insight presented as a finding**.
  The convention is the wrong one to follow here and the card says so at the gate.
- ⚠ **AND THE SIGNED-IN BOOLEAN IS NOT AN IDENTITY — CodeRabbit's finding, and it
  was right.** `isSelf` stays **true straight through an account switch**, so a card
  keyed on that flag alone keeps painting the previous member's readout until a
  refetch happens to land: one person's health insights under another person's
  session. The held readout now **carries its subject** and the render filters on it
  (the remedy #1929 applied to the member-age hook), with the uid in the effect deps
  so a switch genuinely refetches rather than merely blanking. A vanished identity
  falls out of the same comparison — the effect only ever holds a readout under a
  truthy uid, so `held.uid === null` is never true and no separate clause is needed.
  ⚠ **The dep list is pinned by a SOURCE guard, and that is the honest instrument
  here**: the mount harness runs every effect and ignores dependency arrays, so no
  behavioural test written against it can tell `[isSelf]` from `[isSelf, uid]`.
- ⚠ **AND THE `isSelf` RENDER GUARD IS *ALSO* FOR THE STALE FRAME, WHICH THE FIRST
  MUTATION BATCH MISSED.** React runs effects **after** the commit, so a sign-out leaves
  exactly one render where `isSelf` is already false and `data` still holds the
  previous session's readout — the same cross-account class as the `_followCache`
  leak (2026-06-29) and the profile that painted **one frame of B's name beside A's
  age** (#1929). Dropping the guard **survived** the first pass, because the mount
  harness runs effects synchronously during render and the clearing effect masked
  it; the test now **mutates the props object and re-renders**, which reproduces the
  frame exactly (the effect's `setData(null)` writes the cell, but that render
  already read `data` above it). **A guard whose failure mode is one frame needs a
  test that can produce one frame.**
- ⚠ **THE STAMP IS THE RESPONSE'S, NOT THE REQUEST'S.** On a cache hit the route
  deliberately reports the window and sample the readout **actually saw**, not the
  ones this request asked for; rendering a request default here would undo that at
  the last step. An absent window or sample is **omitted**, never rendered as a zero
  — the `Number(null)`-is-a-finite-0 class this file keeps paying for.
- ⚠ **THE DETERMINISTIC READOUT SAYS SO** — the fallback carries **"Computed, not
  written"**. It is real evidence honestly rendered, but it is not the AI reading of
  it, and a member who cannot tell the two apart has been told something untrue
  about where the words came from.
- **Every degraded shape renders nothing or a redaction line**: a failed fetch, a
  response with no `readout`, and a malformed `insights` field (an honest
  `BSTRedact` "No pattern on record yet" — the output of a member below the data
  floor, not a failure).
- ⚠ **`window.ShapeReadout.get` IS DELIBERATELY OUTSIDE THE SHARED METRICS CACHE.**
  That cache exists so several surfaces can share ONE rollup response; this route
  **mutates** — it claims a lease and may spend a model call — so a cached second
  reader would be a **second claim**, not a free read. Plain authed POST (native
  base + Bearer), resolving **null** on every failure, since the card has no error
  state by design and a rejection would surface as an unhandled promise instead.
- **The card is DRIVEN, not grepped.** It mounts through the shared broadsheet
  harness with a react impl whose `useEffect` actually runs, so the
  fetch → state → render path is production's. The data-layer half cannot be
  imported (`shapeBackend.js` is a classic browser script), so `getWeeklyReadout` is
  **brace-matched out of the shipped file** and evaluated against stubs — the
  technique `tests/online-visible-pref.test.mjs` already uses for `public/supabase.js`.
  ⚠ **Its `extractFn` needed the FULL signature as the marker**: the body scan starts
  at the first `{` after the marker, which for a destructured parameter is the
  **param object**, so a bare-name marker silently extracted `async function
  getWeeklyReadout({ windowDays }` and every assertion after it would have been about
  a fragment. ⚠ And the redaction line is asserted on the **node**, not the text —
  `BSTRedact`'s words ride on a `label` prop and `textOf` walks children only, so a
  text match would have passed on a station that dropped the component entirely.
- ⚠ **NO i18n, AND THE GAP IS THE SURFACE'S RATHER THAN THIS CARD'S.**
  `BSClientProgress` carries **ZERO `tr()` calls** — the Progress hub was never one
  of the ten surfaces in the 2026-07-16 rollout that this file's own changelog calls
  **COMPLETE**. That claim has now been corrected **three times** for the same reason
  (Shape Score, then The Record, now the whole Progress hub): the rollout shipped per
  **named surface**, and anything absent from the list was never audited, so the
  completeness claim was never true. Localizing one card on an English page would
  read as a bug, so the station ships in English **matching its surface**; closing it
  is a whole-surface PR, registered.
- ⚠ **AND THE BOARD WAS CLAIMING TWO THINGS THAT ARE NOT TRUE — both CodeRabbit's,
  both taken.** The §C row read **COMPLETE** while its own headline claim (step 2's
  once-a-week bound) was **not running in production**: the migration was unapplied, so
  the route still computed and generated on every request. It went back to `pending`
  with that stated, because a board reading COMPLETE over an enforcement that is not
  live is exactly the stale-record class this file keeps paying for. ✅ **The owner
  applied it on 2026-08-29 and it is verified live** (see the migration entry below),
  so §C is `done` now — on the enforcement running, not on the code existing. And the whole
  **i18n section still declared itself "COMPLETE (2026-07-16)"** with a line saying
  *"the claim holds NOW"* — for the **fourth** time it does not. The section heading
  and that line are corrected, and the fix is no longer another per-omission repair:
  the rollout shipped per **named surface** and nothing ever audited what was absent
  from the list, so *"every surface"* was never a measured claim. It should not be
  restated as true until something enumerates the surfaces and checks them.
- Verified: JSX parse · `node --check` · `tsc` 0 · `npm test` **2414** (+19) ·
  mobile build 0 with the station confirmed in the **emitted bundle** ·
  **12 mutations, all caught** (drop the `isSelf` render guard · stamp a request
  default · unlabel the fallback · render an empty insight list · trust a malformed
  `insights` · resolve a non-ok body · drop the native base + Bearer · throw instead
  of resolving null · unmount the card · store the readout without its subject · drop
  the uid from the effect deps · hold a readout with no identity), with unmutated
  sanity green at both ends and the tree restored clean after each.

### 2026-08-29 — The weekly readout gets a claim: one model call per member per week (#1951 → `9463713e7`)

- **Step 2 of §C.** #1950 made the readout's *evidence* honest; this makes its *cost*
  bounded, the way §C requires — *"one model call per member per week, enforced
  SERVER-SIDE under an atomic per-member claim — never in the UI."* The route is still
  unreachable from any surface; that is step 3 (the mobile Progress-hub entry point +
  i18n ×13), and a route that regenerates on every open is not something to point a UI at.
- **⚠ OWNER MIGRATION — `2026-08-29-ai-weekly-readouts.sql`.** `ai_weekly_readouts`
  (RLS on, **SELECT-only policies** — every write goes through the SECURITY DEFINER RPCs,
  so a caller cannot forge a `ready` row or hand itself a claim it did not win) plus
  `claim_weekly_readout` / `finalize_weekly_readout` / `release_weekly_readout`, all
  **anon-revoked by name** (`revoke … from public` does NOT remove Supabase's explicit
  anon grant — the `2026-06-30-rpc-authz-hardening.sql` bug class).
  ✅ **APPLIED + VERIFIED LIVE 2026-08-29** (owner ran it): table present, RLS on, exactly
  two policies and **both SELECT** (`own weekly readouts`, `coach reads client weekly
  readouts`); `claim_weekly_readout` anon=f/authd=**t**/svc=t while `finalize_` and
  `release_` are anon=f/authd=**f**/svc=t — the split that stops a member, or a coach on a
  linked member, planting arbitrary text under `p_source: 'openai'`; all three SECURITY
  DEFINER with `search_path = public, pg_temp`. Security advisors: **0 ERROR**. ⚠ The one
  WARN naming these objects is `claim_weekly_readout` being authenticated-executable as
  SECURITY DEFINER, which is **by design** — the self-or-coach decision belongs in the
  database under the caller's own identity rather than a TypeScript re-implementation of
  `is_coach_on_client`, and its token is only spendable by a `finalize` the caller cannot
  reach, so the worst a member can do is hold their OWN week for one lease. **So step 2's
  headline claim — one model call per member per week — is enforced in production now;
  before this it computed and generated on every request.**
- **The claim.** An atomic `insert … on conflict do nothing returning claim_token`;
  finalize and release are guarded on that token, which **rotates on every claim AND every
  reclaim**, so a claimer whose lease was taken writes nothing and its older readout is
  discarded. The reclaim is a guarded `UPDATE … where claimed_at < now() - lease` reporting
  `FOUND` — of any number of concurrent reclaimers exactly one wins.
- ⚠ **A STALE CLAIM IS RECLAIMED HERE, AND IS DELIBERATELY NOT RECLAIMED BY
  `claim_ai_action_undo`, WHICH THIS OTHERWISE MIRRORS.** That one refuses, because its two
  crash windows are indistinguishable server-side and re-running would **double-apply a data
  reversal**. Copying the rule would have been the copied-guard-loses-its-rationale trap: the
  work between claim and finalize here is a model call and a write of TEXT — a generator that
  died before its call did nothing, one that died after it spent money and mutated nothing —
  so re-running is harmless in **both** windows, while refusing would strand the member on
  the deterministic path for the **rest of the week** with no way back. **The reason it is
  safe here is exactly the reason it was unsafe there**, and both are written at the site.
- **Only a real model readout is stored; everything else releases the claim.** The
  deterministic fallback recomputes from live correlations for free, so caching it would buy
  nothing and would spend the member's whole week on one transient OpenAI blip — they would
  be told "no AI readout this week" because of a hiccup. The row means exactly *"the AI
  readout for this week"*, which is the thing the bound exists to conserve.
- **Honest stamping.** The stored correlations travel with the readout (every insight names
  a `correlation_key` the UI plots; serving a cached readout beside correlations recomputed
  from today's rows would leave it citing evidence the response no longer contains), and a
  cache hit reports the **window and sample size the readout actually saw**, never the ones
  this request asked for. An uncomputable week reports `null`, not `''`.
- ⚠ **`body.user_id` STOPS BEING AN UNCHECKED DEFAULT — a claim-consumption denial the
  RLS-scoped read did not close.** It read `body.user_id || user.id` with no check of its
  own. The snapshot read is RLS-scoped, so a stranger passing another member's id already got
  an empty readout rather than a leak — but they **also** got that member's weekly claim:
  generate over zero rows, and the member's own request is served that empty result for the
  rest of the week. A denial of the feature dressed as an answer. The RPC's self-or-coach
  check raises and the route answers **403** rather than falling through.
- **The week key is the Monday date (UTC), not `YYYY-Www`.** `bsWeekStartOf` already answers
  "which week is this" in this repo, with a round-trip calendar guard (`Date.UTC` rolls Feb 30
  into March 2 rather than failing). A week-numbering string needs the ISO week-**year**, where
  Jan 1 can belong to week 52 of the previous year — a second implementation of the same
  question and a class of off-by-one this store has no reason to own. ⚠ **UTC on purpose, and
  narrower than it sounds:** the key only bounds how often the readout REGENERATES, and a
  per-member zone resolves one instant to two different weeks for a member who travels,
  re-issuing a readout they already read (the same reasoning the notification dedup recorded
  for its own UTC week, 2026-08-21). Where a member's own day gates what they **earn**, the
  per-member zone is required and is used; caching is not that.
- ⚠ **MY OWN TEST CAUGHT A `Number(null)` IN THE WEEK KEY.** It read `Number(nowMs)` and
  checked the result was finite — but `Number(null)` is a finite **0**, so a null instant
  produced `1969-12-29`, the Monday of the Unix epoch's week, and every week would have
  collapsed into one cached row that never regenerates. Latent, because the route passes
  `Date.now()` — a property of today's one caller, not of the function. Same coercion class
  this repo has paid for twice (a `Number(null)` fabricating an observation in the cycle read;
  a `value: null` nutrient fabricating a 0-kcal food row).
- ⚠ **AND THE SAME SPLIT-PREDICATE DEFECT AS #1950, IN THE SAME FEATURE, ONE PR LATER —
  found by tracing my own fix through its caller, not by a test.** Requiring a stored row to
  carry BOTH a readout and the correlations its insights cite is correct: a null readout under
  `cached: true` is at least conspicuous, while a readout served beside an EMPTY correlation
  list renders fine and is a lie. But tightening it inside `buildReadoutResponse` **alone**
  left the route deciding its cache branch on a looser condition of its own — so a half-row
  passed the route's check, skipped the snapshot read, then failed the assembler's, which
  rendered its placeholder `live` values: **an empty readout over a sample size of zero.**
  Worse than the state it replaced. **Sharing a threshold is not sharing a predicate**, and
  two readers of one fact must read one function; extracted as `isCachedReadout`, with a guard
  that fails if either site re-derives it.
- ⚠ **A REVIEW FINDING THAT WAS REAL AND WENT TO THE HEART OF IT: THE INVARIANT WAS
  FORGEABLE.** The first cut granted all three RPCs to `authenticated` — and a member's
  browser holds the anon key and their own JWT, so it could call `claim_weekly_readout` for
  itself, take the `claim_token`, and call `finalize_weekly_readout` with any `p_readout` it
  liked and `p_source: 'openai'`. The token proves the caller won the claim; it proves
  **nothing** about a model having produced the JSON. Worse, the same was available to a
  **COACH for a linked member** — arbitrary content planted in someone else's readout and
  read there as AI output. So the capability is split by who may hold it: the **claim** stays
  `authenticated`, because the self-or-coach decision belongs in the database under the
  caller's own identity rather than in a TypeScript re-implementation of `is_coach_on_client`;
  **finalize and release are `service_role` only** and go through the admin client. They no
  longer read `auth.uid()` at all — there is no caller identity under the service role, and a
  check that always saw null would refuse every legitimate call. ⚠ **`authenticated` is
  REVOKED by name, not merely ungranted**: `create or replace` preserves the grants an earlier
  version of the file made, so a database that already ran the first cut would keep the hole.
  A member calling the claim directly still gains nothing — the token is only spendable by a
  finalize they cannot reach, so the worst they can do is hold their OWN week for one lease.
- ⚠ **AND THE OTHER BLOCKING FINDING WAS REFUTED ON THE CODE — BUT ITS PREMISE WAS ONLY
  ACCIDENTALLY FALSE.** The reading was that the lease permits two paid model calls: A claims,
  A's call runs past the lease, B reclaims and calls again. That needs a generation still in
  flight after 300 s, which `callAI` structurally forbids — it aborts at its timeout and the
  route finalizes or releases within milliseconds. A dead generator is the case the reclaim
  exists for, and a dead generator has no call in flight to duplicate. **But the safety was
  resting on two numbers in two files agreeing by accident**, and nothing would have caught a
  `timeoutMs` raised past the lease. So the lease and the generation timeout now live together
  in the pure module, the route passes the timeout **explicitly** rather than inheriting the
  shared default, and `weeklyReadoutBoundHolds()` states the relationship a test pins: the
  lease must be at least twice the longest attempt. **Refuting a finding is not the same as
  leaving the code as it was** — the reviewer was wrong about the behaviour and right that
  nothing defended it.
- **Degradation is the rule, with one exception.** Every claim failure falls back to the
  pre-migration behaviour — an absent RPC computes and generates exactly as this route did
  before, and a failed *store* is not a failed readout. The **permission refusal is the
  exception**: falling through would answer a request the database just refused.
- ⚠ **The migration was validated as an ARTIFACT, not as pieces** — the #1853 lesson, where
  a migration that could not compile reached review because only its parts had been checked.
  The whole file applied inside a transaction against production and **rolled back**, its own
  structural guard passing; table and functions confirmed absent afterwards. The claim state
  machine was additionally driven end to end on temp constructs: fresh claim wins · a live
  lease refuses · a stale lease reclaims **exactly once** · a superseded claimer's finalize
  returns **false** so its older readout is discarded · the winner's returns **true** · the
  token rotated.
  ⚠ **A probe artifact worth remembering:** `now()` is TRANSACTION time, so a lease test run
  inside one statement can never see it expire — the reclaim reads as broken when it is the
  probe that is. Backdate `claimed_at` explicitly instead of waiting.
- Verified: **2391/2391** · `tsc` 0 · `next build` 0 with `ƒ Proxy (Middleware)` ·
  **27 mutations, all caught** (generate without the claim · store the fallback · swallow the
  403 · restore the unchecked `body.user_id` · decide the hit after the snapshot read · stamp
  the requested window · fresh correlations beside a stored readout · a readout-less `ready`
  row as a hit · revert the `Number(null)` · report `''` for an uncomputable week · add a
  write policy · drop finalize's token guard · drop the reclaim's lease predicate · leave
  anon's grant · unpin `search_path` · drop the claim RPC's coach gate · either site
  re-deriving the cache predicate · truthiness instead of a non-empty array · a drifted
  `.d.ts` · the write RPCs reachable by `authenticated` · a write taken as the caller ·
  the model call left on the shared default timeout · a timeout outlasting the lease · the
  bound predicate stubbed true · finalize reading `auth.uid()` under the service role), with
  unmutated sanity runs green at both ends of every batch and a clean `git status` after each
  restore (`cp` backups, never `git checkout --`).

### 2026-08-29 — The readout's evidence layer stops ignoring what members actually log (#1950 → `1a35c830b`)

- **Step 1 of §C (the client weekly readout).** `POST /api/ai/weekly-readout` is still
  orphaned — this wave does not wire an entry point — but its **evidence** was wrong in
  ways that would have made the readout dishonest the moment it had one, so the evidence
  goes first. The entry point (a per-member-per-ISO-week atomic claim + the mobile
  surface + i18n ×13) is the next PR.
- ⚠ **THE GAUGES A MEMBER LOGS EVERY DAY WERE INVISIBLE TO THE ENGINE.** `energy`,
  `hunger`, `sleep_quality` and `steps` have existed on `daily_health_snapshot` since the
  check-in wave, and for a member with **no wearable they are the only reliably populated
  columns on the table** — yet they appeared in neither the `SnapshotPoint` type, nor
  `CORRELATION_PAIRS`, nor either route's column list. Not one correlation over them
  could ever be computed. This is the same omission #1946 fixed one layer up ("a member
  logged them daily and could see none of it"), still standing in the layer underneath.
- ⚠ **AND THE COLUMN LIST WAS HAND-TYPED TWICE**, which is what let the catalog and the
  query drift apart silently: a pair naming a column the select never fetched fails
  **loudly nowhere** — every value reads `undefined`, the pair contributes nothing, and
  the route returns **200 with one fewer finding than it claims to compute**. The select
  is now **derived** from a single `SNAPSHOT_METRICS` list (`SNAPSHOT_SELECT`), both
  routes import it, and a test asserts every pair names a selected column. The class is
  closed by construction rather than by remembering.
- ⚠ **HALF THE SHIPPED CATALOG WAS ALREADY DEAD IN PRODUCTION, AND MUTATION-TESTING IS
  WHAT FOUND IT.** The pairing test was `typeof v === 'number'` — but **PostgREST returns
  `numeric` columns as STRINGS**, a gap this repo browser-verified once already (#1769,
  the roster variance band: *"the unit tests only cover the JS-number shape, so this was a
  real production gap"*). **TWELVE** of the 23 metrics are `numeric` —
  `sleep_hours` · `sleep_performance_pct` · `recovery_score` · `hrv_ms` · `resting_hr` ·
  `strain` · `protein_g` · `carbs_g` · `fat_g` · `hydration_l` · `weight_lb` ·
  `body_fat_pct`; the other eleven are `integer` or `smallint` and do arrive as JSON
  numbers. So **8 of the original 10 pairs** — every one naming a `numeric` column on
  either side — silently computed over zero rows on the already-shipped
  `/api/insights/correlations`; only `calories × workout_minutes` and
  `workout_minutes × soreness` were ever alive.
  ⚠ **THE COUNT ITSELF WAS WRONG TWICE, WHICH IS THE POINT.** It first read *fourteen*
  above a list of eleven names; the correction re-counted by hand and produced a
  different fourteen, wrongly including the two `integer` columns `avg_heart_rate` and
  `calories` and omitting the `numeric` `resting_hr`. Twelve is what
  `information_schema.columns` says on the live database. **A figure nobody can audit
  from the page is a figure that will be wrong** — read the schema, don't recall it.
  Values are now coerced to accept both shapes, which is correct whichever way the driver
  serialises them.
  ⚠ **And NOT with `Number(v)`**: `Number(null)`, `Number('')` and `Number(false)` are all
  a finite **0** — the fabrication class this repo has paid for repeatedly (the cycle read
  invented a "significant" gap out of eight missing rows exactly that way). A missing
  reading is **absence** and drops the day; it is never a zero on the member's own chart.
- ⚠ **THE NEW PAIRS CAME WITH THEIR OWN MULTIPLE-COMPARISON CORRECTION, and shipping them
  without it would have knowingly made the output less honest.** Every pair is a separate
  test, so a bigger catalog finds more on noise alone: at a 28-day window an |r| of 0.3 —
  the "moderate" floor — is roughly **p = 0.12**, so a 16-pair catalog expects about **two
  spurious "moderate" findings per readout**. A readout that always has something to say
  is a horoscope. `computeCorrelations` now annotates a **Benjamini–Hochberg `qValue`**
  across the pairs in that response, **both** readout paths gate on **q rather than raw
  p** — at least as strict, not *strictly* stricter: BH guarantees q ≥ p, and the
  largest-p finding always takes q = p exactly.
  ⚠ **AND THE GATE IS ENFORCED, NOT ASKED FOR** — the first cut filtered the model's
  catalog on sample size alone and told the model in the prompt to prefer low q, which is
  advisory: the catalog is the only set an insight may reference, so **filtering it is the
  gate**, and a model that ignored the line could have surfaced a finding the
  deterministic fallback would have refused. One `Q_THRESHOLD` now feeds both paths, and
  a test fails if either stops reading it or a second literal appears. When nothing survives, the
  honest empty summary is the correct output, not a failure.
  ⚠ **The correction was NOT registered for later**, deliberately: this wave enlarged the
  family, so this wave carries the cost of it. Six pairs were added, each with a
  physiological story, rather than every pairing the columns allow — the family size is
  itself a design decision.
- ⚠ **AND THE p-VALUE THE WHOLE GATE RESTS ON WAS A NORMAL TAIL WEARING A
  t-DISTRIBUTION'S COMMENT** (review, on the first head). The `t` statistic was formed
  correctly with `n-2` degrees of freedom and then pushed through **Abramowitz & Stegun
  26.2.17 — the standard NORMAL survival approximation**, i.e. the `df → ∞` limit. These
  windows are small *by construction* (`MIN_DAYS` is 4; the readout gates at n ≥ 7), which
  is exactly where a normal tail is far too thin: at n = 4, r = 0.9 the true two-sided p
  is **0.10** and the old code returned **~0.004**. Replaced with the exact expression —
  `P(|T| ≥ t) = I_{df/(df+t²)}(df/2, ½)` via a Lanczos log-gamma and a Lentz continued
  fraction — which reproduces **every published α = .05 critical correlation to four
  decimals**.
  ⚠ **This is not a precision nicety, because it invalidated the numbers the correction
  above was calibrated with.** `q` is a monotone transform of the p **ordering and
  threshold**, so the FDR gate shipped in this same wave was gating on values that were
  not the p-values they claimed to be — and the *"|r| = 0.3 at 28 days ≈ p = 0.12"*
  arithmetic this entry's own rationale rests on is a number the old code **could not
  produce** (it would have said ~0.10). The exact tail returns **0.121**.
  ⚠ **Pinned two ways, NEITHER against the implementation's own output** — a table
  generated from the code only pins the code, and would have passed just as happily on the
  normal approximation it replaced. (a) The **published** α = .05 critical correlations at
  df 6/8/14. (b) An **independent oracle**: the elementary closed forms of the t survival
  function at df 2 and 4 — `1 − t/√(2+t²)` and `1 − x(1.5 − 0.5x²)` — which share not one
  line with the implementation and sit at n = 4 and 6, i.e. from `MIN_DAYS` up, the exact
  region where the normal tail was worst and a continued fraction is likeliest to
  misbehave. Agreement is exact to the 4dp the field is reported at. A sweep over 398
  sample sizes × 1001 correlations separately confirms the result is finite, in [0, 1],
  monotone in |r| and symmetric — the continued fraction never diverges or hits its
  iteration cap anywhere on the real domain.
- ⚠ **A SLEEP COLUMN ON DAY D IS THE NIGHT THAT *ENDED* ON THE MORNING OF D — and five
  pairs had it backwards, two of them added by this wave** (review, and correct).
  Established by reading the writers rather than reasoning from the metric names:
  `/api/client/checkin` puts `sleepHours`, `sleepQuality` **and** `energy` into the **same
  snapshot row** keyed on one member-local day, and the mobile card submits all four in a
  single `doLog()`; WHOOP sleeps and Oura `daily_sleep` both merge on the provider's own
  **wake** day; and the neighbouring `sleep_hours × recovery_score` pair already encoded
  the convention *in its own words* — *"for the same morning"*, at lag 0. So the sleep that
  fuelled day D's training sits on row **D**, not D-1: `sleep → strain`,
  `sleep_performance → workout_minutes` and both new `sleep → energy` pairs move to
  **lag 0**, while `stress → sleep_hours` moves to **lag 1** — its label always read *"that
  night"*; only the lag disagreed.
  ⚠ **A wrong lag fails loudly NOWHERE.** It yields a perfectly well-formed correlation
  with a real r, a real n and a real q — of a relationship the member never logged. Three
  of the five were pre-existing, so the fix is the whole class rather than the two this
  wave introduced, and the convention is now written **at the pair table** with the file
  and line of each writer that establishes it. Guarded two ways: a **cross-file** test that
  fails if the check-in ever stops writing sleep and energy onto one day (the fact the lags
  rest on), and a per-pair lag map with guard-the-guard, so a silent flip back to the
  intuitive-but-wrong *"sleep → next day"* fails with its reason attached.
- ⚠ **AND THE CORRECT LAG STILL CARRIES A CONFOUND — found by auditing my own fix, not
  reported.** Moving the two check-in pairs to lag 0 puts `x` and `y` in the **same tap
  sequence on the same card, seconds apart** (`sleep_quality × energy` most of all). Not a
  tautology — they rate different things — and not a reason to drop the pair, since *"the
  nights you rate as rested are the mornings you have energy"* is a real and usable
  observation. But it is **shared-method variance**: a member having a good morning rates
  both high, which inflates r relative to an independent measurement. Said in the pair's
  own `explanation`, because **the explanations are what the model is handed as evidence**
  — and a readout reporting a self-report agreeing with itself as a *discovery* is the
  same over-claim as a wrong lag, just arrived at honestly. The `sleep_hours` twin is the
  objective check (a duration, device-synced or entered, with no shared method), and its
  explanation now says to trust it where the two disagree.
- ⚠ **THE q GATE WAS ENFORCED ON ONE PATH AND *ASKED FOR* ON THE OTHER** (review). The
  fallback filtered on q; the catalog handed to the model filtered on **sample size alone**
  and the prompt merely told the model to prefer low q. The catalog is the only set an
  insight may reference (post-parse validation checks membership), so **filtering it IS the
  gate** — a model that ignored the line could surface a finding the deterministic path
  would have refused, which is the two halves of one feature disagreeing about what counts
  as evidence.
  ⚠ **AND SHARING THE *THRESHOLD* WAS NOT ENOUGH — my fix for that finding was itself
  incomplete, caught on the next round.** With `Q_THRESHOLD` unified the two filters still
  disagreed on the other two terms: the fallback took any **non-weak** pair at any `n`,
  the model catalog took any **n ≥ 7** pair at any strength. So a strong pair at n = 5 was
  reportable by the deterministic path and invisible to the model, a weak pair at n = 10
  was offered to the model and refused by the fallback — and **which path a member gets is
  decided by whether OpenAI happens to be reachable.** Two renderings of the same evidence
  must not disagree about what the evidence *is*; a member switching between them because
  of an outage would read a different set of facts about their own body. One
  `isReportable()` predicate now, both paths, with a guard that fails if either
  hand-rolls the terms at a call site again.
- ⚠ **AND THE HONEST EMPTY STATE WAS QUOTING A THRESHOLD THE CODE CONTRADICTS** — found
  by auditing my own diff after two consecutive rounds landed inside my own fixes, which
  is this file's own signal to stop patching and sweep. The line a member reads when
  nothing survives said *"unlock the readout once we have ~14 days of overlap"* while the
  gate is **7**, and it conflated **overlap** with **window length**: what actually counts
  is days where BOTH sides of a pair carry a value, so a 28-day window with sleep logged
  and training missing clears nothing. It now interpolates `MIN_REPORTABLE_DAYS` and says
  *both sides*, with a guard that fails on any hardcoded day count in that string. **The
  empty state is the output most members will see first** — it is the one line in this
  module that is definitely member-facing, and it was the one making an unverifiable
  claim.
- ⚠ **AND BOTH PATHS TURNED A CORRELATION INTO A LEVER — the same self-sweep, and the
  worst of what it found.** The fallback's recommendation read *"Protect the {x} input —
  when it dips, {y} dips with it"* and *"gains there **cost** {y}"*, and the system prompt
  asked the model for the *"most **actionable**"* findings and to *"**recommend an
  action**"*. Both assert a **causal direction an observational r cannot support**, in a
  module that computes a false-discovery rate *precisely because* it takes over-claiming
  seriously — telling a member to pull a lever the evidence never showed is a lever undoes
  the whole correction in the one place they actually read. It is unfalsifiable advice
  too: the pair may run the other way, or both may follow something unmeasured. Both now
  **describe and name what is worth watching**, the prompt forbids causal claims outright
  and carries the shared-method caution into the wording, and guards pin both — because
  **the two renderings must not disagree about what the evidence SUPPORTS any more than
  about which evidence qualifies**. Also: *"1 cross-domain pattern stand out"*, a verb the
  pluralisation forgot.
- ⚠ **REGISTERED, NOT FIXED — the fallback prints RAW COLUMN NAMES to the member**
  (`protein g`, `hydration l`, `sleep performance pct`). Each pair already carries a
  human `label`; a display-name map belongs with the surface that renders it, and step 2
  translates that surface into 13 locales — hardcoding English names now is work that
  round would have to redo.
- ⚠ **A `.d.ts` IS NOT CHECKED AGAINST ITS `.mjs`, so `MetricKey` could drift in silence**
  (review). It is a hand-typed copy of `SNAPSHOT_METRICS`, and neither `tsc` nor the
  pair-vs-select test can see a divergence — that test compares two things that **both**
  come from the module. A metric added to the runtime only is unnameable from TypeScript;
  a name left in the union only is a type admitting a column the query never fetches, which
  is the *exact* class this wave's derived select was introduced to close, one layer up.
  Both directions are now asserted by parsing the union out of the declaration.
- **`correlations.ts` → `correlations.mjs` + `.d.ts`, and that is why any of this is
  testable.** As TypeScript it could not be imported by `node --test`, so the entire
  evidence layer under two routes — the thing that decides which "insights" a member is
  shown about their own body — **had zero tests** and was gated by a typecheck alone. This
  is the shape the repo already uses for exactly that reason (`console-triage`, `funnel`,
  `guardrail-health`, `age-derive`, `sentry-context`). `tests/correlations.test.mjs` pins
  the lag semantics (a lagged pair reads Y from the *following* date and must not pair
  across a gap in the window), zero-variance yielding nothing rather than `r = 0`, and
  that the module produces every field the `.d.ts` promises — a shape the declaration
  claims but the module omits is an `any` at the call site, not a compile error.
- **26 mutations caught, 1 documented equivalent** (drop a gauge from the select · a pair
  naming an unselected column · lag collapsing to same-day · `q` losing monotonicity ·
  reject numeric strings, i.e. the shipped bug · naive `Number()` coercion · empty string
  becoming 0 · NaN/Infinity admitted · **restore the normal tail** · flip `rested → energy`
  back to lag 1 · flip `stress → sleep` back to lag 0 · split the check-in's sleep onto a
  second local day · delete a pinned sleep pair · add an **unpinned** sleep pair · the
  model catalog stops gating on q · a literal q threshold back at a call site · **df off
  by one** · the incomplete-beta arguments swapped · either path hand-rolling its
  eligibility filter · a metric added to the `.mjs` only · a name added to the union
  only · a literal day count back in the member-facing empty state · the causal
  recommendation back in the fallback · the prompt asking for an action again · the
  no-causation instruction dropped), sanity green at both ends and the file restored **byte-identically** after each. ⚠ The equivalent is the `qValue: 1` seed — the
  annotator assigns every index and its only early return is the empty case, so nothing
  can observe the seed. **Kept and labelled rather than deleted**, so the next reader
  neither removes it as dead nor spends a round writing the test that cannot exist.
- ⚠ **Not fixed, and named rather than left implicit:** `body.user_id` is still accepted
  by both routes. RLS is what actually authorises the read (a non-permitted id returns
  zero rows), and a zero-row window produces no correlations and therefore **no model
  call** — so it is not a leak and not a cost, but it is looser than it needs to be, and
  the entry-point PR should bind it.
- Verified: `tsc` 0 · `next build` 0 with `ƒ Proxy (Middleware)` present ·
  `npm test` **2367/2367** (+22) · the `numeric` column list read from
  `information_schema` on the live database.

### 2026-08-29 — Website + Next dashboard errors stop arriving anonymous (#1949 → `d80e49680`)

- **Closes the Layer-1 follow-up registered on 2026-08-01**: *"user context is attached
  on `/m/` ONLY … once a DSN exists, dashboard errors on both web surfaces arrive with
  no id, no roles and no `is_coach`."* Both surfaces now attach it. `src/lib/
  sentry-context.mjs` remains the single definition of what may ever be said about a
  person — id · roles · is_coach, never email/name/phone/date_of_birth/location/
  stripe_customer_id, all of which #1851 restricted **at the database** precisely
  because they were over-readable; shipping them to a third party would undo that at a
  different layer.
- ⚠ **THE TWO SURFACES ARE NOT SYMMETRIC, and treating them alike would have produced a
  dead feature on the bigger one.** The **Next** app resolves its user **server-side** on
  every signed-in route, so identity is passed **down** — no round-trip, and it cannot
  disagree with the gate that let the page render. The **static site** has no bundler and
  no server component, so it reads the **cookie session** through one `/api/me` fetch.
- ⚠ **AND `window.shapeDb` WOULD HAVE BEEN DEAD CODE ON MOST OF THE STATIC SITE** — only
  **21 of 76** newdesign pages load `/supabase.js`. That is a lesson this repo has already
  paid for once, on the DOB gate, which is why `dobGate.js` is dependency-free and reads
  the cookie. This follows it exactly: `/api/me` is not behind the membership gate and
  answers `{user:null}` signed out, so one same-origin fetch works on all 76.
- ⚠ **THE STATIC SITE CARRIES A MIRROR OF THE DERIVATION, UNDER A DRIFT TEST** — the
  shape this repo already uses for exactly this problem (`public/age-derive.js` ⇄
  `src/lib/age-derive.mjs`). `tests/sentry-user-mirror.test.mjs` evaluates the **real
  shipped `sentryInit.js`** in a `vm` and runs both implementations over a vector table
  plus a **4,000-case seeded fuzz sweep**, failing on the first disagreement. The file's
  own comment had named this option and called it out of scope for *that* task's two-file
  limit — not permanently.
- ⚠ **THE GUARD IS BEHAVIOURAL, NOT TEXTUAL, and that is not a preference.** The previous
  guard for the age rule asserted a **regex over source text**, which passed on a file that
  merely contained the expression elsewhere and — worse — **pinned every surface to the
  spelling the canonical rule had already been rewritten to abandon**. Assert what the code
  ANSWERS. **4 mutations, all caught** (drop the `.sort()` so a dual-role account's string
  becomes order-dependent · drop the legacy singular `role` fallback · drop `dietitian`
  from the coach set · return a partial object instead of `null` when there is no id),
  unmutated sanity green at both ends and the file restored after each.
- ⚠ **A CROSS-REALM TRAP THE FIRST RUN HIT, worth recording because the failure reads as a
  real defect.** `assert/strict`'s `deepEqual` compares **prototypes**, and the mirror's
  result is built inside the `vm` context — so two **structurally identical** objects
  failed. Normalised by spreading into a host literal, which changes the prototype and
  **nothing else**; a JSON round-trip would have been the tempting fix and would silently
  drop an `undefined` value, hiding a genuine difference.
- ⚠ **AND THE FIRST CUT PRE-PICKED THE ARRAY, WHICH IS THE MAJORITY-OF-ROWS CASE TODAY —
  found in my own self-review, not by a reviewer.** The layout derived
  `Array.isArray(profile.roles) ? profile.roles : [profile.role]` — **no `.length`
  check** — and then passed only the array on. Measured against the live database rather
  than assumed: `profiles.roles` is **`NOT NULL DEFAULT '{}'::text[]`**, so an **empty
  array is the column's default**, and **2 of the 4 live accounts** sit in exactly that
  state with a real singular `role`. `rolesOf` falls back on `arr && arr.length` — handed
  only the empty array it had **nothing to fall back to**, so a trainer in that state
  would have reported `roles: ''` and **`is_coach: false`: a coach recorded as not a
  coach**, which is the fabrication class this module exists to prevent.
  ⚠ **The cause is the one this file keeps recording — I duplicated a derivation the
  canonical module already owns**, and the comment I wrote directly above the bug stated
  the correct principle (*"the derivation lives in `bsSentryUser`; this only hands it the
  inputs"*) while the code collapsed the choice anyway. **The fix is deleting my copy,
  not patching it**: the component takes both raw fields and the one definition decides.
  ⚠ **The static site was never affected** — `/api/me` does the `.length` fallback itself
  and returns **both** fields — so this was a defect in one caller, not in the rule.
- **A CALL-SITE INVARIANT NOW PINS IT**, and it asserts what the call sites *answer*
  rather than how anything is spelled: the guard parses the three TSX pages and fails if
  any `<SentryUser>` passes `roles` **without** `role`. Passing the id alone stays legal
  and deliberate (an admin board has no profile row); passing a pre-picked array is the
  shape that silently drops the fallback. **Guard-the-guard included** — renaming the
  element so the walk matches nothing fails rather than passing vacuously. **2 further
  mutations, both caught** (reintroduce the exact defect · rename the element), sanity
  green at both ends.
- **Roles are honestly absent where they are not known.** `/dashboard` has the full
  profile row, so it passes the `roles` **array** *and* the legacy singular `role`
  (a dual-role account is real and must not collapse to one value; choosing between the
  two is the canonical module's job, not the caller's). `/console`
  and `/warroom` resolve through `requireAdminUser()`, which returns `{id, email}` and no
  profile, so they pass the id alone and the context reads `roles: ''` — the canonical
  module's own behaviour for an unresolved profile, not a shortcut invented here.
- ⚠ **REVIEW ROUND — THE STARTUP RACE, and it undercut the stated goal.** The identity
  read is async while the deferred `nd/*.js` bundles that **boot the app** execute
  immediately after this file — so on a cold load a startup crash happens with the fetch
  still in flight and went out **anonymous**, which is precisely the class this change
  exists to fix. **The same ordering failure this file has already been fixed for once:**
  the Sentry CDN tag used to be `appendChild`'d (async by default) and raced the very
  scripts it existed to watch, until it was made a real deferred tag ahead of them —
  *"the most valuable error this surface can report was the one it was least likely to
  catch."* Closed with a **`beforeSend` that awaits the identity and stamps the event**,
  so the scope is no longer the only carrier. **Two consumers, deliberately different
  bounds:** `setUser` is **unbounded** (whenever the answer lands, every later event gets
  it with no promise at all), `beforeSend` is bounded at **3s** — because an event still
  held when the tab closes is an event **LOST**, which is worse than an anonymous one.
  It returns the event on **every** path and never `null`: dropping the error being
  reported is the one outcome worse than reporting it without a name.
- ⚠ **AND THE NEXT SIDE HAD THE MIRROR OF IT — an effect runs after COMMIT.** A sibling
  that throws during the initial render or hydration is caught by `error.tsx` **before**
  the component has ever run, so initial-render crashes stayed anonymous. `setUser` now
  runs **during render** as well (React renders depth-first in order, so it lands before
  the siblings below it), with the effect kept for genuine identity changes and unmount
  cleanup. ⚠ **The `typeof window !== 'undefined'` guard on that line is load-bearing,
  not ceremony:** a client component's body also executes during **SSR**, where the
  Sentry scope is a **server global shared across concurrent requests** — setting a user
  there would attribute one member's errors to another. That is the cross-account leak
  class this repo has fixed before (the mobile `_followCache`), and the guard is the only
  thing standing between this component and it.
- **The module-scope block is total, like every other block in the file.** It runs
  *outside* the init `try/catch`, so an environment missing `fetch`/`Promise`/`setTimeout`
  degrades to "no identity" instead of throwing at load and taking the host page down —
  a gap the vm harness surfaced by not stubbing `setTimeout`. On that path `beforeSend`
  returns the event untouched and the surface behaves exactly as it did before.
- **4 further mutations, all caught** (drop the `beforeSend` wiring, restoring the
  original race · drop an unidentified event instead of sending it · overwrite a user the
  scope already carries · never put the identity on the scope), sanity green at both ends
  and the file restored **byte-identically** after each.
- ⚠ **AND THE WAR ROOM LABEL LED WITH ITS OWN SUPERSEDED HEADLINE** — `status: 'done'`
  while the text opened *"⚠ REGISTERED, NOT BUILT … Only /m/ attaches it"*, so an
  operator skimming the board read the opposite of the truth. That is the failure this
  file records twice under its own reviewer post-mortems: **a heading is what a skim and
  a grep land on, so it has to carry its own expiry.** Restructured to lead with the
  built state; the old text is kept, marked as history, because its two constraints
  (the Next browser init runs before hydration, the static site has no bundler) still
  bind anyone touching this.
- ⚠ **THE CHEAP OPTIMISATION WAS REJECTED ON PURPOSE, and the reason is in the code so it
  is not "fixed" later.** Skipping the `/api/me` request when `localStorage['shape.auth']`
  is absent would spare anonymous marketing traffic a round-trip — but that key is written
  by `public/supabase.js`'s client while the **Next `/login` server action sets the cookie
  server-side**. A member who arrived that way is signed in with **no such key**, so the
  guard would report their errors anonymously: a false negative in exactly the case this
  change exists to fix, and the same "keyed on a client-side signal that is not universally
  present" mistake as the 21-of-76 trap.
- **Both sides clear on sign-out** rather than leaving the previous account's tags standing
  — the cross-account leak class this repo fixed once already (the mobile `_followCache`).
  Static-site sign-out ends in a hard reload, so the next load lands on the `{user:null}`
  branch; the Next component clears on unmount.
- ⚠ **STILL INERT UNTIL A DSN EXISTS, and the build says so in its own words** —
  *"SHAPE_SITE_SENTRY_DSN unset — no DSN injected, static-site error tracking inert on all
  76 pages"*. `sentryInit.js` returns before registering or fetching anything, so with no
  DSN this change makes **zero** additional requests. Do not read "wired" as "live".
- Verified: `tsc` 0 · `next build` 0 with `ƒ Proxy (Middleware)` present · `node --check`
  on the classic script · newdesign precompile `--check` 0 · `npm test` **2345/2345** (+9).

### 2026-08-28 — The Contract becomes a cover page over full-screen stations (#1947 → `b2b9476e6`)

- **Owner, on density:** *"we also need to update design of the goals page, or just
  simplify it. There is a ton of information and seems very overwhelming"* — then, off
  a three-concept board, **"i like concept B"**. The complaint is measurable: the
  one-ledger layout rendered **27 always-visible blocks** (verdict · register · five
  milestones · three full stations with motto + coach credit + targets + key lifts +
  add + record link each · four week rows · the why), plus a five-item anchor index
  that existed **only** because the page was long. The cover renders **12** sites,
  several of them mutually exclusive branches.
- **The cover holds the page's one job and nothing else** — the verdict lead, the
  register (Log weigh-in / Edit targets), the **next term only**, and five station
  **doors**. Each door carries an honest one-line inventory built from real data
  (target counts, the coach plan, this week's first two figures, the milestone tally),
  so the cover says what is inside **without opening it**. Each door opens a
  full-screen page carrying that station's former body with **one** deliberate
  subtraction — the 3-row target cap and its *"N more targets · Show ＋"* expander die
  with the pick, because a station page has room for all of them, so **every** target
  now renders. The header and the share-with-coaches strip
  render on the **cover only** — a station page is one station's detail, not the whole
  record. Presentation + routing only; every computation, handler, sheet and
  honest-empty state carries over unchanged.
- ⚠ **THE WORK DOOR'S SPINE WAS A HARDCODED NON-TOKEN.** `#7aa7dc` appeared **exactly
  once** in the whole mobile broadsheet — that new line. It is the **website's** slate
  accent (`dashProgress.jsx`), not a mobile token, so it would have been the one spine
  on the page that ignores the paper across all 14. Mobile tags Work with **`t.BLUE`**
  everywhere else — the Home slate's Work tag, and **this file's own headline sheet**,
  which already reads `editHeadline === 'work' ? t.BLUE : '#d8a23a'`. Now `t.BLUE`,
  which makes the door row match the pairing the file used one screen over. **A color
  that appears once in a 30k-line file is a drift, not a decision.**
- ⚠ **THE NAV ANNOUNCE WAS INERT ON HOME AND HARMFUL UNDER SETTINGS — deleted, along
  with the claim it made.** The first cut announced the open station to the nav stack
  and said that made a jump-out-and-back land on the same page. It did not.
  **(1) Inert:** this page is `BSClientHome`'s `goalsPage` overlay, and the shell does
  not model Home's overlays — `navLoc()` returns a bare `{tab:'home'}` and
  `navResolve()` has branches for store/market/chat/eat/me but **none for home** — so
  `bsNavCompose` produced `{tab:'home', sub:'training'}` and the replay dropped `sub`
  on the floor. It could not have worked even in principle: the shell renders the tab
  body under **`<div key={tab}>`**, so a tab jump **remounts `BSClientHome` fresh** and
  `goalsPage` resets to `false` — the member lands on plain Home with the Goals page
  closed, never mind the station. **(2) Harmful:** `BSClientGoals` has a **second** call site inside
  **`BSSettings`**, which *is* modelled and announces its own sub, and `bsNavAnnounce`
  writes **one module-level slot**, last write wins.
- ⚠ **AND THE HARM WAS REPRODUCED AGAINST THE REAL REGISTER, not reasoned.** Driving
  `navHistory.mjs` directly with Settings deep-linked at `edit-profile` and the member
  walked back to its root (`navSub` `''`): **before**, the composed descriptor read
  `sub:''` — correct. **With** the announce, opening the Goals **cover** announced
  `null`, so `bsNavCompose` fell back to the shell's stale open-time `settingsStart`
  and composed **`sub:'edit-profile'`** — a pane the member had already left. Opening a
  station composed `sub:'training'`, which matches **no** Settings pane at all.
- ⚠ **AND THE ADVERSARIAL PASS FOUND TWO LIVE HONESTY VIOLATIONS THIS PAGE HAS BEEN
  SHIPPING — both pre-existing, both fixed here because the cover-page rebuild puts
  them where a member sees them FIRST.** (1) **Fabricated PRs.** `liftRows` gated on
  `trainEmpty = signedIn && !train`, which goes false the moment the train rollup
  resolves — and it always resolves — so the ternary fell to a hardcoded array and
  showed **every signed-in member** a 90 kg bench and a 150 kg deadlift as their own
  PRs. `livePrs` could never rescue it: it needs `train.prs`, and
  `/api/client/train` returns exactly `{ok, assignedWorkouts, stats, recentSessions}`
  — **PRs are served by `/api/client/progress`, a different route** — so that branch
  is dead for everyone. (2) **A fabricated coach.** `setLivePlans([...])` fired
  unconditionally for any signed-in member (all four legs `.catch(() => null)`, so it
  always resolves), and every field has a literal fallback — `|| 'Build'`,
  `|| 'Cut'`, `|| 4`, `` `${nphase} plan` ``. So a member with **no coach at all**
  read a role-spined **"TRAINER · 4×/WK"** credit under a "Build block", and both
  honest branches beneath it — the `No training plan yet` redaction and its
  `Find a coach →` action — were **permanently dead code**. A plan row now requires
  real evidence a coach authored something. ⚠ **And for TRAINING that is not merely
  "a plan exists"** — since the self-serve wave a member can author their own week
  (`client_workouts` with a NULL `trainer_id`), and `hasPlan` is true for those too,
  so gating on it would credit a **TRAINER for a plan the member wrote themselves**.
  `/api/client/plan` hands over both signals — `training.coach` (resolved from the
  first row with a real `trainer_id`) and per-workout `selfAuthored` — and the gate
  uses them. **Nutrition has no self-serve authoring path** (a `client_meal_plans`
  row always carries a nutritionist), so a menu is evidence enough there. **The
  rebuild is what made these matter** — a fabricated plan title is now the door's
  inventory subline, the first line on the page.
- ⚠ **AND THE COVER'S SCROLL RESET WAS AIMING AT THE WRONG SCROLLER.**
  `document.querySelector('.bs-scroll')` returns the FIRST match in document order,
  and this page has a **second mount inside `BSSettings`** where the shell renders
  `screens[tab]` *before* the settings overlay — so from there it scrolled a hidden
  tab page and left the station opening at the cover's old offset. Now resolved from
  the page's own subtree via a ref + `closest('.bs-scroll')`, in a **layout effect**
  rather than a line in the handler: a reset issued in the same tick as `setGoalView`
  runs against the *outgoing* view's height.
- **And the switch carries FOCUS and the reading position, not just the scroll.**
  Opening a station moves focus to its heading (`tabIndex -1`, out of the tab order) —
  the door that was pressed unmounts with the cover, so a keyboard/screen-reader user
  was landing on `document.body` with no announcement that the page changed. ← Back
  restores the cover offset they were reading at and returns focus to **the door they
  opened** (the standard return-focus pattern), both with `preventScroll` so the focus
  call cannot undo the restore. ⚠ The offset is captured in the **handler**, not the
  layout effect: by then the scroller already holds the station's content and the
  browser has clamped `scrollTop` to the shorter page, so the position would be gone
  before it could be saved.
- ⚠ **AND A THIRD FABRICATED FIGURE, ONE LAYER UNDER THE COACH CREDIT — caught by the
  round after, and sharpened by my own gate.** `sessTarget` ended in `|| 4` and
  `proteinTgt` in `|| 170`, so the **live** week path invented exactly what its own
  **honest-empty** path five lines above refuses (`Sessions 0/—` · *"set a plan"*;
  `Protein days 0/7` · *"days tracked"*). Two consequences, the second worse: the
  cover's "This week" door quotes the first two figures as its inventory subline, and
  `sessTarget` also fed the **TRAINER credit row** — which the fix above had just
  restricted to plans a coach genuinely authored — so a member with a *real* coach read
  **"4×/wk"** as that coach's prescription. Both derivations now yield **null** when
  unknown and every reader renders `—` with the empty set's own words. ⚠ **This
  RESOLVES the item registered one round earlier as needing a product ruling** ("what
  should a default weekly session/protein target be?"). No ruling is needed: the file
  had already answered it for the empty case — *don't show a number you don't have* —
  so the fix was to make the live path obey the rule the empty path already followed,
  not to choose a default.
- ⚠ **AND A FOURTH, IN THE SAME TWO ROWS — because I swept the class with the wrong
  test.** Having fixed `sessTarget`, I swept the live effect for sibling `|| <literal>`
  fallbacks, found `tphase = …trainingPhase || 'Build'` / `nphase = …|| 'Cut'`, and
  cleared them on the grounds that they are **app-wide house defaults used at five
  other sites**. That is true and it is not the test. The other five are **page
  kickers** (Home/Train/Eat: *"Cut · W35"*) — the member's own program context under
  **no byline**. These two feed **nothing but the role-spined credit rows** (their only
  readers), so the same string there is a training block **attributed to a coach who
  never set one** — and, since the rebuild, the Training door quotes that title as the
  cover's first line. **The right test was never "is this literal used elsewhere?" but
  "does this literal appear under a byline?"** — the very distinction that made
  `sessTarget` a defect one line above, applied by me and then not re-applied.
- ⚠ **AND THE FILE HAD ALREADY RULED ON IT.** `BSTerrainProfile` gates its whole
  coached-by band on `prog.trainingPhase || prog.nutritionPhase` being real
  (`hasRealProgram`) — i.e. this codebase had already decided that **an unset phase is
  not evidence of a coach's programming**, and hides the band rather than name a phase.
  Unknown now yields a neutral **"Training plan" / "Nutrition plan"**; the five kickers
  keep their defaults, deliberately.
- ⚠ **THE GATE OUTLIVES THE FALLBACKS IT WAS WRITTEN FOR**, and the comment now says
  so. With every literal gone an unauthored row would read *honestly* — which is not
  the same as the row being honest. A role-spined credit **is** the claim "a coach
  authored this", so it still may only exist on real evidence; a later reader must not
  retire the gate as redundant now that the strings beneath it are clean.
- ⚠ **REFUTED WITH THE SOURCE — "the week page renders blank when `weekTargets` is
  empty".** It cannot be empty: the derivation uses `liveWeekTargets` **only** when it
  is a non-empty array and otherwise supplies four rows either way — signed-in gets the
  honest zeroed set (`Sessions 0/—`, `Protein days 0/7`, `Steps —`, `Sleep —`),
  signed-out the demo four. The proposed `length === 0` guard is unreachable, and the
  door's subline is non-empty for the same reason — dead code in a page whose whole
  point was removing surplus.
- ⚠ **REFUTED WITH THE REPO — "re-sync the tracked `public/m` bundle".** `public/m` has
  been **gitignored and deploy-built since #1470** (`.gitignore:26`; `git ls-files
  public/m` returns **zero**), so there is no tracked artifact to sync and none can
  appear in a diff. The review's own script printed *"no public/m changes in this PR"*
  and then reported that absence as the defect.
  ⚠ **BUT MY REFUTATION CARRIED A FALSE SUPPORTING CLAIM, AND THE NEXT ROUND CAUGHT
  IT.** I wrote that "CI still guards the real invariant — the Mobile job rebuilds and
  **diffs** against `public/m`". It does not: `ci.yml` says so in its own words —
  *"public/m itself is generated at deploy time (`scripts/build-m.sh`), not committed,
  so there's no byte-diff against a committed copy anymore — a failed build fails
  here."* The job only proves the bundle **builds**; its name (`Mobile (build +
  public/m sync)`) is a legacy misnomer kept so the branch-protection required check
  keeps matching, which the file also flags. So the **conclusion** was right and the
  **reason** was wrong — the exact "a because-clause is a claim" trap this file keeps
  recording. The local `rm -rf public/m && cp -r` step is likewise vestigial for a PR
  (git ignores it, CI never reads it, deploy regenerates it), so it has been dropped
  from the verification list rather than left there implying a check that does not run.
- ⚠ **REFUTED — "a station is a full-screen route with no nav-stack entry".** True
  that `openGoalView` never calls `navPush()`, but **no nested view in this shell
  does**: `navPush` is a shell-level concern (`goSettings`/`goMarket`/`goRadio`/…),
  and `BSClientEat`'s grocery/library views, `BSSettings`' panes and `BSClientMe`'s
  score/store all switch without one. Adding a push for Goals stations alone would
  make this page inconsistent with every sibling **and** would need `navResolve` to
  reopen the station — which is the registered gap below, not a separate defect.
- ⚠ **REGISTERED, NOT BUILT — the parent must own the announcement.** A one-slot
  register cannot host a child overlay rendered under **two** parents, so no child can
  announce for itself. Making it real means teaching `navLoc`/`navResolve` about Home's
  overlays (goals · progress · habits · today · check-in) and giving `BSClientHome` the
  `initialPage`/`onStartConsumed` pair `BSClientEat` and `BSClientMe` already have,
  plus an `initialView` on `BSClientGoals`. **Pre-existing** — Home's overlays have
  never been replayable; this wave neither fixed nor worsened it, and half-building it
  behind a false comment would have been worse than leaving it named.
- ⚠ **AND IT IS THE SAME GAP THAT KEEPS NATIVE BACK FROM STEPPING THROUGH A STATION** —
  raised as its own finding, verified as one item. The shell's `onNavGesture('back')`
  tries `navBack()` then falls through to closing `showSearch`/`showSettings`/
  `showCalendar`/`showCycle`; there is **no `goalsPage` branch, and main's copy is
  byte-identical** — an edge swipe has never respected the Goals overlay at *any*
  depth. From Home the overlay is never pushed, so a swipe finds an empty stack,
  matches no takeover and does nothing (the on-screen ← Back works at both depths);
  from Settings it pops the Settings entry and exits everything — true of the cover
  before this change, and now of a station too. A Goals-local interception cannot fix
  it honestly: **both listeners receive the same window event with no "handled"
  protocol**, so from Settings the station would return to the cover *and* the shell
  would pop Settings in one gesture. Adding that protocol changes the shared gesture
  contract in `bsNavShell.js` and all three shells, and would still leave cover→out
  broken in both parents. Once Goals-from-Home is a modelled location with a `sub`,
  `navBack()` steps station → cover → out for free — which is why this is the **same**
  follow-up, not a second one.
- Verified: parse 0 · mobile build 0 with the cover doors confirmed in the **emitted
  bundle** (`"No targets yet"` 0 → 2 against main) · `tsc` 0 ·
  `npm test` **2336/2336**.

### 2026-08-28 — A member can finally SEE the gauges they log every day (#1946 → 3f27a8276)

- **Energy · Hunger · Rested join the Progress trend tabs, both surfaces.** The daily
  check-in has asked for all three (1–10) since the check-in engine wave, and
  `/api/client/progress` has SERVED `series.energy` / `series.hunger` /
  `series.sleepQuality` the whole time — but neither Progress surface listed them, so
  a member logged them daily and could see none of it. Mobile `BSPROG_TREND_TABS` (+
  the empty/demo series keys) and web `DPR_TREND_TABS` (+ `DPR_DEMO`) now carry them.
  **No backend change** — this was two tab lists, nothing upstream. Closes the open
  half of the registered `avgHydrationL` item (the hydration half had been resolved by
  deletion in #1905).
- ⚠ **AND IT MADE A PRE-EXISTING WEB DEFECT ORDINARY, WHICH IS WHY IT IS FIXED HERE.**
  The trend state defaults to the hardcoded `weight`, while only **available** tabs
  (a series with ≥2 points) render as buttons. A new account that checks in daily but
  has never weighed in therefore had NO lit button over an empty Weight chart — a
  state that was previously exotic and is now the normal new-member shape. The active
  tab is **resolved against `availableTabs`** (falling back to the first tab with real
  data), and the button lights off **that resolved tab, not the raw state** — the
  second half matters on its own: lighting the raw state would leave the fallback
  chart and the lit button naming different metrics.
- **The demo series use DAILY spacing** (CodeRabbit): the surrounding body-composition
  demo series are biweekly, and copying that cadence would have drawn the *daily*
  check-in gauges as fortnightly samples.
- Mobile deliberately keeps rendering **every** tab (its honest empty chart tells a
  member with no data to log some), so it never had the web's no-lit-button state.
- Verified: both files parse · newdesign precompile `--check` 0 · mobile build 0 ·
  `npm test` 2336/2336.

### 2026-08-28 — The founder portrait sits on the page, and the card closes it (#1945 → 21e2a9b47)

- **Owner, three asks in one look:** *"update my look in this photo"* · *"looks out of
  place"* · *"move my picture to the bottom of that page"*.
- **The portrait is re-cut, not re-graded.** The office background is **removed
  entirely** (the person cut out), the cutout graded down to the dark editorial ground,
  its edge softened, and the torso **faded to transparent at the bottom** so the
  portrait dissolves into the page instead of ending in a frame. Both copies replaced
  (`public/newdesign/founder.webp` + `mobile-app/public/founder.webp`, 640×640 WebP
  with alpha, 54 KB → 40 KB). ⚠ **Judge a portrait treatment composited on the page's
  own ground, at its real render size** — the first attempt (a feather + vignette over
  the existing image) read fine in isolation and still left a bright office on a
  near-black page.
- **The card moved to the PAGE BOTTOM on both surfaces** — directly under the letter's
  last line, before the CTA — reversing the 2026-07-21 moved-up call, and it now **IS
  the sign-off**: it carries the signed name, so the separate sign-off block
  (`AboutSignoff` on web, the sign-off div on mobile) is **deleted** rather than left
  as a second signature. Website order: Hero → Vision → Letter → Founder → CTA.
- ⚠ **`public/newdesign/about.jsx` IS THE REPO'S CRLF-TRACKED FILE and three guarded
  patch attempts refused to write before this landed.** Two lessons, both cheap next
  time: LF-literal replacements match **nothing** on it (`cat -A` shows every line
  ending `^M$`), and a guard asserting `count("AboutSignoff") == 0` fails when the
  **replacement comment you are writing** contains that word. The asserts did their
  job — the file was never left half-patched.

### 2026-08-28 — The hidden rail gets its way back in place, and the chat header gets air (#1943 → 5cffcff36)

- **Owner asks, same message thread:** (1) once the online rail is hidden, a **SHOW button**
  appears on the chat page itself; (2) more spacing between the Community headline and the tab
  strip; (3) the tabs a little smaller.
- **The SHOW row** stands exactly where the rail was: the muted `{count} online now` eyebrow +
  a teal **SHOW ＋** text-action (monochrome-glyph rule). It renders on
  `!railOn && railPeople.length > 0` — the rail's own gate inverted, so it can never offer to
  show a rail that would render nothing. **It retires the one-shot "Restore in Settings" note**
  (state, timer, and the `rail.restoreNote` key ×13 all removed): a persistent affordance in
  place supersedes a 3-second pointer at another screen.
- ⚠ **SAME REACHABILITY RULE AS THE × (owner call 2026-08-27): no `loggedIn` gate.** The preview
  is where the rail is reachable at all, so a rail hidden in preview must be restorable in
  preview — a demo tap writes the demo mirror key only, and `bsOnlineRailPersist` still declines
  without a real uid. Pinned the same way the ×'s gate is pinned: the identifier searched in the
  window before the button, never a spelling regex (the #1936 lesson).
- ⚠ **`showRail` IS APPLY-THEN-PERSIST — the ×'s own order** — so the rail is back on THIS render
  whatever the network does, and applying removes the per-uid mirror record, which **cancels a
  pending re-issued hide at the source**. ⚠ **The ON persist deliberately has NO pending retry**
  (`markPending` stays hide-only): a pending-On re-issued by the hydrate could resurrect an older
  intent over a doc that says `Off` — the exact cross-device resurrection shape round 2 of #1933
  refuted for the hide direction. The doc wins; a failed On save stays device-local until the
  next hydrate reverts it, the SHOW row reappears, and one more tap retries.
- **Header air + smaller tabs:** the tab strip's top padding goes 6 → 14px under the Community
  title row, and the tab pills go `8px/9pt → 6px/8.5pt` with an explicit `minHeight: 26` so the
  shrink can never fall through the 24px tap floor the house already holds (2026-06-26).
- **i18n:** `rail.show` + `rail.showAria` ×13; `rail.restoreNote` removed ×13 (its only consumer
  died with the note — parity holds by removing everywhere, not by leaving a dead key).
- New source guards in `tests/broadsheet-online-rail-pref.test.mjs`: the gate, the button, the
  no-sign-in window check, apply-before-persist, markPending hide-only, and the retired note
  staying retired (state, timer AND key). **5 mutations, all caught** (gate SHOW on sign-in ·
  persist before apply · drop the railPeople gate · markPending fires for On · revive the note
  state), unmutated sanity green at both ends, tree restored clean.
- Verified: hook-run mobile build clean with the SHOW markup **confirmed in the emitted bundle**
  · full suite green · catalog parity 3/3 · JSX parse.

### 2026-08-28 — An unproven read may no longer close an open alert episode (#1942 → 03514b24c)

- **Registered since the Layer 2 review rounds and left there as "none load-bearing"; it is
  load-bearing.** Every guardrail-health check except `rpe_dropped` is computed on the 7d
  evaluation read, and a read cut short at its 5000-row ceiling still produced a plain **`ok`**.
  `ok` is the ONLY status allowed to clear an alert stamp — so a fault that was still running had
  its episode **closed by a run that had not seen the whole window**, and the next COMPLETE run
  announced the same fault as **brand new**. That is exactly the flapping `shouldNotify` exists to
  prevent, arriving through the READ instead of through the SAMPLE.
- ⚠ **THE FIX IS THIS MODULE'S OWN DOCTRINE, ONE CASE WIDER — not a new rule.** `rate()` already
  carried the stamp through `insufficient_sample`, with the reason written at the site: *"could not
  check" is not the same claim as "checked, and fine"*. An `ok` over a truncated read is the same
  claim, and `bsReadStateNote` already says that sentence to the human — *"none in what we saw, not
  proof of absence"*. So it carries the stamp too. It never notifies and never re-arms: **a
  transition in neither direction**. Only a PROVEN `ok` closes an episode.
- ⚠ **AN ABSENT `readState` READS AS UNPROVEN, and that default is the whole design.** A caller
  that does not describe its read has not told us the read was complete, and treating silence as
  proof is the fabrication class this module has **already paid for once** (`Number(null)` is a
  finite 0 — the `count_shifted` comment). Unproven fails toward keeping an episode OPEN, which
  over-reports; proven-by-default fails toward silently closing one that may still be running,
  which is the defect itself. **Over-reporting is recoverable; a silently-closed episode is not.**
  A guard asserts the REAL call site passes it, because every unit test supplies its own and an
  unwired route would look perfectly plausible (the `candidatesFor`/`now` lesson from #1917).
- ⚠ **`rpe_dropped` IS EXEMPT, AND THAT IS THE OVER-CORRECTION THIS AVOIDS.** Its count comes from
  its own `head:true` exact query — the route's own comment says *"nothing here can truncate"* — so
  its `ok` really does mean checked-and-fine even on a run whose evaluation read was cut short.
  Gating it would suppress a genuine recovery on complete data, and **a monitor that cannot record
  a recovery is as useless as one that cannot record a fault.** `fromEvaluationRead` defaults to
  **true** so a check added later inherits the protection and only a demonstrably-independent one
  opts out.
- ⚠ **THE TEST FOR THE PROVING VALUE, NOT A LIST OF FAILURES.** `readProved` is
  `readState === 'complete'` — `bsReadState` is the single source of that vocabulary and `complete`
  is its one proving value, so a failure state added there is covered here for free, in the safe
  direction. Pinned across all five existing states plus an invented future one.
- ⚠ **AND `complete` IS THE STRONGEST CLAIM THIS READ CAN MAKE, NOT AN ABSOLUTE PROOF** — the
  comment says so rather than implying otherwise. The read can still miss a row backfilled
  behind its cursor with an old `ts`, and that row was never counted either, so
  `rows === matched` agrees while a row is gone. That is the **backfilled-row** residual left
  open below; `complete` rules out the failure this guard is about — a read that demonstrably
  stopped early.
- ⚠ **IT IS THE STATE THAT IS PASSED, NOT THE ROUTE'S `truncated` BOOLEAN, and they disagree on a
  real case.** With no usable exact count and the budget unspent, `truncated` is **false** while the
  state is `count_unknown` — so gating on the boolean would have treated that run as proven and let
  it close an episode. The route already alerts on `truncated || matched === null`, so the state is
  what matches the route's own reading of its own read. Caught in the self-review after the first
  push, not by a reviewer.
- **Nothing is duplicated into the verdict itself, deliberately.** The route already persists
  `_read` (state included) in the same row, so the history already says WHY an `ok` could not close
  an episode; stamping every verdict with the same fact would be a second copy to keep in step.
- **The 46 existing vectors describe a COMPLETE read and now say so once**, through a local helper;
  the new block drives the raw function directly, since the default is half of what it pins.
- ⚠ **PARTIALLY closes the registered item — the other two residuals are NOT fixed and the board
  says so.** Still open: the **backfilled-row** residual (a row inserted with an old `ts` behind a
  cursor that only ever moves older is missed while the counts still agree — which is precisely why
  `rows.length === matched` is not treated as proof), and a backwards clock correction re-announcing
  an open episode once (accepted: the alternative is permanent silence). Flipping the whole item to
  done would have been the false record this wave keeps fixing.
- ⚠ **THAT RESIDUAL WAS MIS-NAMED HERE AS "offset-vs-keyset", AND THE NAME WAS THE DANGEROUS
  PART — corrected 2026-08-29.** The route does **not** page by offset and has not since this wave:
  `.order('ts', desc).order('id', desc)` with a `(ts, id)` cursor, under a load-bearing comment
  headed *"KEYSET PAGING, NOT `range()`"*. So the name told the next session the pending fix was
  *convert to keyset* — work already done — and they would either re-do a no-op and close the item
  or find keyset in place and conclude the residual was fixed. **Either path closes a live residual
  on a false record**, which is the class this file keeps correcting.
- ⚠ **AND KEYSET IS NOT WHAT WOULD CLOSE IT.** A cursor removes the *shifting window*, not
  backfills: the route says so itself — a row written with an old `ts` into a region the cursor has
  already paged past *"is never fetched (the cursor only ever moves older, and the row was not there
  when that page was read) and was never counted in `matched` either"*. Closing it costs a design
  change, which is why it stays registered rather than reading as a chore: **insertion-ordered
  paging** (order by `id` alone, if monotonic) would see backfills but trades away the deliberate
  **newest-first** property — load-bearing point 1, where newest-first exists so a capped read loses
  the OLDEST rows, *"which is the survivable direction"*, and reversing it reinstates the original
  defect (yesterday's malformed row vanishes and `malformed` never fires again); a **second pass**
  over the window would catch them at the cost of doubling the read against the same ceiling.
- Verified: **2335/2335** (+9) · `tsc` 0 · **7 mutations, all caught** (revert the carry · absent
  `readState` reads as proven · gate `rpe_dropped` too · unwire the route · suppress alerts on an
  unproven read · unprotect the rate checks alone · carry ALWAYS so a proven `ok` can never close),
  unmutated sanity green at both ends and the tree restored clean after each.
- ⚠ **AND THE SWEEP THAT FOLLOWED FOUND THE BOARD STALE TWICE** — both corrected in the same pass,
  because a `pending` item describing shipped work is the same false record as an unstamped
  heading. **The Sentry upload-credential gate on the debug-APK job** read *"REGISTERED, NOT BUILT
  … one-line change when they land"*, but it **shipped in #1886** (`632557060`) and the workflow
  carries it verbatim — verified in the file, not inferred. And **`avgHydrationL`** was registered
  as *"render it or delete the compute"*; **#1905 deleted it** (`4f58a512d` — that route now holds
  zero hydration references), so only the energy/hunger trend-tab half is open. ⚠ Worth naming:
  `/api/client/progress` **already serves** `series.energy`, `series.hunger` and
  `series.sleepQuality`, so a member logs all three daily through the check-in and can see none of
  them — the gap is the two tab lists, nothing upstream.

### 2026-08-28 — One recency window for both member-engine legs, with the ceiling it lacked (#1940 → 80d807469)

- **Two registered defects, same class and same module, fixed together** because the fix
  is one shared window rather than two — `signalsMap.mjs` now derives `{cutoff, ceiling}`
  once and both legs read it, so they cannot disagree about what "this week" means.
- ⚠ **`.slice(-7)` TOOK THE LAST 7 OBSERVATIONS, NOT THE LAST 7 DAYS.**
  `/api/client/progress` returns up to **400** chronological snapshots with no recency
  filter, so `sleepRecoveryFromProgress` let readings from **months** ago feed `avg7` —
  and presented the newest observation as **`lastNight`** however old it was. The
  identical staleness was fixed in `vitalsFromProgress` during the check-in wave and
  registered here rather than fixed, because it changes shipped `sleep_low` firing.
- ⚠ **AND THAT BEHAVIOUR CHANGE CAN GO EITHER WAY — claiming it only under-fires would
  be wrong.** Narrowing to recent data can **raise** `avg7` (dropping old bad nights) or
  **lower** it (dropping old good ones), so `sleep_low` may newly fire where it did not.
  What is true, and all that is claimed: every fire is now based on data from the week it
  claims to describe.
- ⚠ **THE FUTURE-DATE CEILING WAS COACH-ONLY.** `/api/client/checkin` takes the day from
  the **REQUEST**, so `2099-01-01` is writable; `vitalsFromProgress` compared
  `date >= cutoff` with **no upper bound**, so such a row passed and — being newest —
  survived every trailing slice, becoming the member's RESTED rating and a readiness
  input **permanently**. The ceiling shipped on the coach chokepoint (#1897); this is the
  member path it was registered as missing.
- ⚠ **THE CEILING IS TOMORROW, NOT TODAY.** `snapshot_date` is the member's **LOCAL** day,
  so a member ahead of the clock this code runs on legitimately writes one — the same
  one-day tolerance `bsVitalsLeg` already carries. Beyond that is not a timezone artifact.
- **The sleep fixtures had to be rewritten around an injected clock**, and that is
  evidence rather than churn: they carried hardcoded 2026-06 dates and **non-date strings**
  (`'a'`, `'d0'`) *precisely because the function ignored dates*. The old "last 7 of a
  longer series" test is now a **duplicated-date** test, which is what that cap actually
  exists for once the window bounds the days.
- Verified: **2326/2326** (+6) · `tsc` 0 · **5 mutations, all caught** (drop the ceiling ·
  drop the cutoff · skip the window on the sleep leg · make the ceiling today · drop the
  duplicated-date cap), unmutated sanity green at both ends.

### 2026-08-28 — The legal-claim sweep stops scanning the build output (#1939 → c445ef85f)

- **Half (b) of the item #1929 registered**, and the same class as half (a) inverted:
  that guard skipped directories by **NAME** and reported clean about files it never
  opened; this one had **no skip-list at all** and so opened files it should not have.
- `tests/legal-transfer-claims.test.mjs` enumerated pages by reading the **filesystem**,
  so once a build had run it also scanned generated output — `public/m` (the mobile
  bundle) and `public/newdesign/nd` (the precompile), **both gitignored**.
  ⚠ **Reproduced rather than assumed:** dropping a single generated
  `public/m/index.html` carrying *"bound by contract"* turned the suite **red on a file
  that is not source, does not appear in `git status`, and nobody edited** — the worst
  kind of red, because there is no local change to explain it. Latent in this container
  only because no build had run; `find` and `git ls-files` both returned 181.
- **Now derived from `git ls-files`**, the technique its two sibling guards already use
  (`provider-apply-dob`, `source-no-control-bytes`): ignored output cannot appear, no
  tracked page can be missed, and nothing has to be remembered when the next generated
  directory lands. An unreadable index **REFUSES** rather than reporting every ban as
  passing — the loudest possible false pass, since the suite would go green while
  scanning no legal surface at all.
- ⚠ **A MUTATION SURVIVED AND THE FIX WAS TO MAKE THE GUARD REACHABLE, NOT TO DOCUMENT
  IT.** Removing the empty-index refusal changed nothing, because a live repo never
  returns an empty index — the shape a later reader deletes as dead. One parameter makes
  the branch reachable from a test. **Documenting an unpinnable guard is right only when
  it genuinely cannot be pinned; here it could be, for one parameter.**
- The tracked-only rule is pinned by a probe that **genuinely creates an untracked page
  on disk** and asserts the derivation ignores it — the question is what the derivation
  does with a real file, not what a comment claims about it.
- Verified: **2320/2320** · `tsc` 0 · **2 mutations, both caught** (restore the
  filesystem walk · drop the empty-index refusal), unmutated sanity green at both ends.

### 2026-08-28 — The online-visibility toggle stops announcing a save it never checked (#1938 → f6252294f)

- **Registered by #1929 and deliberately left there; read against the code, it was worse
  than registered on BOTH halves.** The web Settings row **"Show when I'm online"**
  reported success unconditionally, and the write behind it could destroy the document it
  was editing.
- ⚠ **THE CALLER COULD NOT HAVE CHECKED.** `ShapeWebPresence.setVisible` was
  **synchronous** with a floating persistence promise whose result was discarded — so
  `await setVisible(next)` resolved *before the write had even started* — and the row then
  said **"Saved."** unconditionally, through a bare `catch` that swallowed throws too. A
  landed save, a refused save and a thrown one were indistinguishable on screen. The
  registered note called this "an error-only check"; there was no check, and nothing to
  check against.
- ⚠ **AND THE WRITE COULD WIPE EVERY OTHER PREFERENCE.** `getUserGoals` returns **null**
  for BOTH *not signed in* and *the read failed*, `saveUserGoals` **REPLACES** the whole
  `client_settings` jsonb, and the persist read `Object.assign({}, d || {}, …)`. So one
  blipped read while a member toggled this row would blind-upsert a **ONE-KEY document**
  over their units, privacy, meal times, program phases, check-in and online-rail
  preferences. Same conflation #1933 round 1 hit on mobile, same remedy: **an unreadable
  doc is declined, never published over.**
- **`setVisible` is now async and returns `{ok}` / `{ok:false, reason}`.** The **runtime**
  half — the local flag, the presence event, track/untrack on the channel — still flips
  immediately, because that is what the member asked for and it cannot meaningfully fail;
  only the **durable** half reports.
- ⚠ **A FAILED SAVE DOES NOT ROLL THE ROW BACK, deliberately.** The runtime flip already
  took effect, so restoring the old value would assert the OPPOSITE of what the session is
  doing — and reverting an **OFF** is the bad direction: it would put a member back on the
  rail after they asked to leave it. The line says the **save** failed, which is the thing
  that failed. (Same reasoning as the age toggle's `unconfirmed` branch.)
- **The guard drives the REAL shipped source, not a copy of it.** Both surfaces are classic
  browser scripts that cannot be imported — `public/supabase.js` is an IIFE,
  `clientMeSettings.jsx` is a babel component — so `tests/online-visible-pref.test.mjs`
  extracts each function from the live file by **brace-matching** and evaluates it against
  stubs. A text guard would pin a spelling, which is exactly what #1936 paid for.
- ⚠ **AND THE WRITE IS SERIALIZED, BECAUSE ORDERING IT BY LATENCY IS NOT ORDERING IT BY
  INTENT** (CodeRabbit round 1, verified before acting). Each tap ran its own
  read-merge-write with nothing between them, so toggling Off then On fast enough could
  land the slow Off *after* the fast On — stored `Off`, runtime `On`, and **both calls
  honestly returning ok while the row said "Saved." twice**. Narrower than reported and
  worth recording: on the **web** this document has exactly **ONE** writer (every other
  `saveUserGoals` call writes a different kind), so the only value a race can lose is
  `onlineVisible` itself — this is not the cross-writer clobber mobile hit. The remedy is
  the same either way and is the **house pattern, not a new invention**: mirror
  `bsSettingsWriteChain`, the `client_settings` serial lane #1933 already paid a round to
  learn. Queued behind, the second tap's READ sees the first tap's write, so its merge is
  over a current document.
- ⚠ **THE TWO HALVES ARE SCOPED DIFFERENTLY ON PURPOSE.** The runtime flip stays OUTSIDE
  the lane — it is what the member just asked for, it cannot meaningfully fail, and
  queueing it behind a stalled network write would leave them **broadcasting after they
  asked to stop**. Only the durable half is serialized. The guard now checks that flip
  **synchronously**, before the await: the old assertion sat after it and passed either way.
- ⚠ **THE LANE'S TWO FAILURE HANDLERS ARE A REDUNDANT PAIR — MEASURED, NOT ASSUMED.**
  Dropping the second `step` passes (the swallowing tail covers it); dropping the tail's
  swallow passes (the second `step` covers it); dropping **both** wedges the lane for
  everyone behind a rejected step. So the invariant is *a failure never wedges the lane*,
  not either spelling of it — which is what the test pins, and why neither half may be
  deleted as dead. **The step is unreachable from `setVisible`** (its body is fully
  try/caught, so it never rejects today), so the guard drives `_settingsSerial`
  **directly**: the invariant belongs at the lane, where the next caller inherits it.
- ⚠ **AND THE QUEUED WRITE IS BOUND TO THE ACCOUNT THAT TAPPED** (CodeRabbit round 2, and
  the one place the lane made something *worse*). `getUserGoals` and `saveUserGoals` each
  resolve `getUser()` **independently at their own call time**, and the save REPLACES that
  user's whole document — so a session that becomes account B while the step is queued
  would read A's document and upsert it into **B's row**, destroying B's units, privacy,
  meal times and the rest. The lane lengthens that window by design, since a stalled
  predecessor holds the step back. Remedy is the one the mobile twin already paid a round
  for in **#1933** — capture the initiating uid, re-resolve through the **same `getUser()`
  the save uses**, discard on mismatch — checked on **both sides of the read**, because
  checking only after it still lets a switch to B **and back to A** write B's document into
  A's row. The row names that case distinctly rather than folding it into "that didn't
  save": the write was refused on purpose, and the preference is still unsaved on an
  account they are no longer signed in to.
- ⚠ **A MUTATION SURVIVED AND THE FIXTURE WAS WHY, NOT THE CODE.** Dropping the **pre-read**
  identity check passed, because a one-way switch is caught by the post-read check too —
  the two differ only on a switch **away and back**. That case is now a vector rather than
  an assumption, and it kills the mutation. **When two guards look redundant, find the
  input that separates them before deleting either.**
- ⚠ **AND THE SELF-REVIEW OF THAT LANE FOUND THE SAME CLASS ONE SEAM OVER — A STALE READ
  OVERWRITING A FRESH INTENT.** `setVisible` calls `startWebPresence` whenever no channel
  exists yet, and that is **ordinary rather than exotic**: the module-load call races auth
  hydration and returns early with no uid on a cold load. Toggling ON in that state fired
  a hydrate read that still saw the **stored `Off`** — our write is queued behind the lane
  — and silently flipped the member back to invisible: **stored On against a runtime
  false**, the rail showing them offline while storage says visible. `_wp.touched` marks an
  explicit in-session choice the hydrate may no longer override. The hydrate only ever sets
  `false`, so an OFF choice was never at risk; this closes the ON direction, which is the
  one that silently undoes the member. The guard drives **both** real functions —
  `startWebPresence` is extracted alongside `setVisible` and injected as the real callee,
  because the defect is an INTERACTION and stubbing either half would test the stub.
- ⚠ **AND `git checkout --` DESTROYED THE UNCOMMITTED FIX MID-MUTATION, ON A RULE THIS FILE
  ALREADY CARRIES.** The restore between two mutations reverted the not-yet-committed
  hydrate guard, so the following case ran against a tree with no fix at all and its
  "kill" proved nothing about the line it was aimed at. **The sanity case at the END is
  what caught it** — it failed on a supposedly-restored tree. Re-applied, committed FIRST,
  then re-run with `cp` backups: both mutations killed, both sanity runs green, and
  `git diff` empty at the end. Commit before mutation-testing; back up with `cp`, never git.
- **The guard drives the SHIPPED serializer, not a re-typed one** — `_settingsSerial` and
  its seed line are extracted from the real file alongside `setVisible`, and one built
  instance shares one lane, which is the real shape (one `setVisible`, two taps).
  `extractFn` now also **refuses an ambiguous marker**: a marker that stopped being unique
  would silently extract the wrong function while every assertion went on passing about
  someone else's code.
- **No `?v=` bump**: newdesign is content-hashed by the deploy precompile, and
  `/supabase.js` has never carried a query on any of its **57** references — adding one
  would be a 57-file sweep for nothing. **CRLF preserved** on `clientMeSettings.jsx`, the
  repo's one CRLF-tracked file.
- Verified: **2318/2318** (+16) · `tsc` 0 · both files parse · **16 mutations across the
  wave** (restore the `d || {}` data-loss shape · fire-and-forget the save again · say
  "Saved." unconditionally · roll the row back on failure · collapse both failure messages
  · drop the signed-out early return · remove the lane · stop it chaining · move the flip
  inside it · drop both failure handlers · ignore the in-session choice on hydrate · never
  stamp it · drop either identity check · let a signed-out initiator through · fold the
  declined message into the generic one) — **all caught**, plus the two documented
  equivalents above, each covered by its redundant partner. Unmutated sanity green at both
  ends of every batch.

### 2026-08-27 — The rail's HIDE × reaches the preview, where it is the only place it is reachable (#1936 → 17f71d966)

- **Owner call: the signed-out preview now shows the inline HIDE ×.** #1933 gated it
  `{loggedIn && …}` so the demo cast's rail stayed byte-identical — and the consequence,
  found when the owner went looking for the shipped feature and could not find it, is that
  **the affordance was unreachable in every state on the live app**. The rail renders only
  when `railPeople.length > 0`; for a signed-in member that is live presence, which is
  empty (4 accounts, none active since June), so a signed-in member sees no rail and has
  nothing to hide, while the preview — the one surface that always has a rail, because it
  falls back to `TRAINING_NOW` — was the half deliberately denied the button.
- ⚠ **THE FIX IS A DEMO-SCOPED MIRROR KEY, NOT A LOOSENED CLOUD PATH.** Three gates had to
  move together or the button would render and do nothing: the render gate, the mirror
  (`bsOnlineRailMirrorRead/Write` returned early on a null uid), and the hook's
  `return uid ? on : true`, which pinned signed-out ON. The mirror now resolves
  `bsOnlineRailUid() = bsCheckinPrefUid() || '__demo__'`. **Every CLOUD path still resolves
  the REAL uid and declines without one** — a demo tap can never bind a `saveUserGoals` to
  an account, which is the Codex P1 this wave already paid for once. Per-uid keys mean a
  member who hides it in preview and then signs in still hydrates their own value; the
  sentinel is not uuid-shaped, so it cannot collide with a real account.
- ⚠ **A GUARD THAT PINNED A SPELLING INSTEAD OF A FACT, CAUGHT BY MUTATION-TESTING MY OWN
  TEST.** The source assertion was `doesNotMatch(/\{loggedIn && \(\s*<button onClick=\{hideRail\}/)`
  — so re-gating the button as `{loggedIn && <button`, one space and a paren different,
  left all 18 tests green. It now searches the 500 characters BEFORE the button for the
  identifier at all, so every spelling of the gate fails. Same lesson as the #1916 drift
  guard: **assert what the code ANSWERS, not how it is written.**
- Verified: **2302/2302** · `tsc` 0 · mobile build 0 with `__demo__` confirmed in the
  emitted bundle · **4 mutations, all caught** (re-gate the button in its paren-less
  spelling · re-pin the hook ON · drop the demo sentinel · and the over-correction, letting
  a demo hide reach the cloud), unmutated sanity green at both ends.

### 2026-08-26 — The online rail becomes a choice (#1933 → ed263722c)

- **A member choice to hide the “online now” avatar strip on Community.** Default ON.
  Inline **HIDE ×** on the rail header (⚠ **CORRECTED 2026-08-27 — this read
  “signed-in only — the demo cast's rail is byte-identical” and that is no longer
  true**: the owner ruled the preview must show the ability, so the × renders
  signed-out too; see the 2026-08-27 entry) + Settings → Preferences → **“Online members”** as the way back,
  directly under Check-ins. OFF renders NOTHING — the exact state the empty-rail branch
  already produces. Hiding changes **your view only**; appearing in others' rails stays
  `onlineVisible`, a different setting on purpose. The check-in pref's shape helper for
  helper: canonical predicate, per-uid mirror, `apply()` → `shape:onlineRailPref`,
  seed label, read hook with the edit-generation guard. i18n: 5 keys × 13 locales.
- ⚠ **CODERABBIT WAS RE-ENGAGED FOR THIS PR ON THE OWNER'S WORD** (“run coderabbit on
  spec” → “or the PR”, 2026-08-26) — the 2026-08-24 retirement is a default, not a ban;
  a trigger is per-task on the owner's ask. Two rounds ran; Codex also auto-fired free.
  Round-cadence note: the fair-usage window is real — one re-trigger landed **one minute
  early** and was refused (“next included review available in 1 minute”); the recovery was
  a fresh trigger after the window opened, confirmed by the bot's own “Full review
  triggered” reply, never by assuming.
- ⚠ **ROUND 1, ALL FIVE REAL — INCLUDING A P1 IN MY OWN NEW CODE.** `saveUserGoals`
  resolves `getUser()` AT SAVE TIME, so the inline ×'s read-then-write could carry account
  A's whole `client_settings` blob into account B's row across a sign-out. The persist now
  captures the initiating uid, re-resolves through the same `getUser()` the save uses, and
  DISCARDS on mismatch (marking the choice pending under the initiator's key). Plus: a
  client-wide **serial lane** for local client_settings writers (reads join it — read-your-own-writes), the pane's save **folds in** an unedited inline hide, a declined
  hide is marked **pending** and re-issued by the hydrate — which also caught my comment
  overclaiming (“the pane's next save persists it” was FALSE: persistPrefs merges only
  editedRef). ru grammar + the sibling calques in ru/uk swept.
- ⚠ **ROUND 2 FOUND THE SAME CLASS ONE BRANCH OVER** — a save returning `res.error`
  (or throwing) marked nothing pending. Fixed, both arms mutation-checked. **Its second
  remedy half was REFUTED with a pinned test**: retrying a pending hide over an EXPLICIT
  `onlineRail: 'On'` could resurrect an older intent across devices (the `visOverride`
  resurrection shape); the doc wins, retry stays scoped to ABSENT keys. pcm wording taken
  verbatim from the reviewer.
- **Merged after two rounds, all findings worked or refuted, without a third-round verdict**
  — a third round existed to bless the bot's own suggested wording, which is the
  round-dragging rule by its plainest case. Gate on the final head: **2301/2301** · tsc 0 ·
  mobile build 0 · next build 0 · CI green on 4 checks · 16 feature tests, **11 mutations
  across the wave, all caught**, unmutated sanity at both ends every time.

### 2026-08-26 — The merge gate stopped naming a reviewer, and the board caught up (#1930 → eec328a55)

- ⚠ **`/console` had been calling EVERY PR not-mergeable since 2026-08-24, regardless of
  CI.** `prAllGreen` required `coderabbit === 'approved' || 'clean'`, and a retired
  reviewer never posts again — so its verdict pins at `none`, which is the blocking case.
  The gate is now `ci === 'green' && !draft`, matching the owner ruling.
- ⚠ **THE SAME DEFECT SHIPPED TWICE, FOUR DAYS APART, AND THE SECOND TIME WAS INSIDE THE
  FIX FOR THE FIRST.** #1914 pinned the gate to a clean **Codex** verdict days before Codex
  was retired; #1916 caught that and repinned it to a **CodeRabbit** pass three days before
  CodeRabbit was retired. Correcting the reviewer's *name* preserves the trap: **naming a
  reviewer at all** gives the gate an expiry date nobody writes down. It now reads only
  properties the house controls.
- **Fixed as a type, not just a value.** Both reviewer fields are gone from `prAllGreen`'s
  declaration in `console-flight.d.ts`, so a caller that feeds a verdict back in fails to
  compile. ⚠ **And the absence is asserted at the REAL CALL SITE** — `prAllGreen` is pure,
  so every unit test builds its own argument and none of them can see what the route
  passes. The wiring guard that used to require the verdict now forbids it. Mutation-checked
  four ways (reviewer re-wired · draft term dropped · stuck open · stuck closed), all caught,
  with unmutated sanity runs at both ends.
- ⚠ **AND THE FIX WAS INCOMPLETE UNTIL THE SIBLING ONE FUNCTION OVER WAS SWEPT.**
  `gateTag` in `ConsoleClient.tsx` — the headline the owner actually reads — branched on
  `p.coderabbit === 'commented' || 'none'` and printed **CR RE-TRIGGER**. A retired reviewer
  answers `none` forever, so **every PR whose CI had not finished displayed an instruction
  nobody could carry out**. Fixing `prAllGreen` alone would have left that standing, and it is
  the more visible of the two. Each remaining CI state is now named as itself: `CI RUNNING`
  for a run in progress, `CI INCOMPLETE` for no success record — which is also what a
  degraded per-PR fetch leaves behind, so it must not claim the checks are merely running.
- **`coderabbitVerdict` and `codexVerdict` are kept and still correct** — head-pinning,
  `commented` not being a pass, a rate-limit notice not being a cap. That is knowledge about
  how to *read* a review and it outlives the reviewer; only the gating was removed.
- **War Room: the age-visibility wave (#1929) registered**, plus its read-path invariants
  and the two bug-class siblings it deliberately left open. The two reviewer items are
  corrected in place — one flipped to done as **dissolved** (there is no reviewer half for
  GitHub to enforce), and a new pending item records what actually changed: the pre-push
  class sweep is now the **only** layer that reads a diff for intent, which needs an owner
  ruling before launch.
- ⚠ **FOUR API ROUTES EXISTED ON DISK AND WERE NEVER IN `RAW_ROUTES`** — `/api/me/age-public`
  and `/api/members/ages` (#1929), `/api/me/date-of-birth` (#1925, whose behaviour the board
  already described in prose without ever registering the route), and
  `/api/cron/guardrail-health`. The inventory is a count the board reports as fact, so a
  missing row is a wrong number, not a missing convenience. All four added; `/api/members`
  now classifies as Community & social rather than falling through to marketplace plumbing.
- **How we work: the reviewer stack corrected in place, nothing deleted.** A banner at the
  head of the stack states the current gate; every superseded claim below carries its own
  ⚠ CORRECTED marker. The history is kept because two of its rules were never about
  CodeRabbit: a verdict is only about the head it names, and absence of a record is never a
  pass.

### 2026-08-26 — Age visibility: a member opt-in that never hands over the date behind it (#1929)

- **A member-controlled toggle shows their AGE; the DATE OF BIRTH it is derived from never
  leaves the server.** Default OFF. Coaches always see their own clients' ages regardless of
  the toggle, because it changes how they program. Not on community posts.
- ⚠ **THE DEFECT WAS MINE AND IT DEFEATED THE FEATURE'S PREMISE.** The first cut granted
  EXECUTE on a function returning raw `date_of_birth` to **`authenticated`**. PostgREST
  exposes every function in `public`, so **the grant WAS the door**: a member who opted in to
  showing their AGE was handing every signed-in member their exact BIRTHDATE. They consented
  to the derived integer, not the PII behind it. Only the `age_public = true` branch actually
  leaked — self already reads its own date through RLS and a coach already reads a client's
  through `providers_read_subscriber_profiles_base` — which is why it survived review.
- ⚠ **AND IT TOOK THREE ROUNDS TO CLOSE BECAUSE I FIXED INSTANCES, NOT THE CLASS.** The
  scalar door went in round 3; the **array door was one file over**, in a file I had open at
  the time, and one `grep "grant execute"` would have returned it. **Filename order is not the
  order migrations ran** (`-` 0x2D sorts before `.` 0x2E), which is what made the replay
  hazard invisible — and production was correct throughout, which is what kept it hidden.
- **The outcome is now ORDER-INDEPENDENT rather than correct-by-ordering:** ONE file creates
  the read path (the viewer-parameter form), ONE grant exists (**service_role**), and BOTH
  dangerous signatures are dropped in TWO files — so no sequence of the three migrations can
  produce a browser-callable date door. `-server-only.sql` is also wrapped in one transaction:
  Postgres grants EXECUTE to PUBLIC by default on a new signature, so a create-then-revoke file
  has a real open window when run statement-by-statement.
- **The read path.** `member_dobs_for_viewer(viewer uuid, targets uuid[])` — SECURITY
  DEFINER, `search_path = public, pg_temp`, service_role only. ⚠ **`viewer is not null` is
  load-bearing**: `age_public = true` does not depend on the viewer, so a NULL viewer would
  otherwise return every opted-in member's date. `/api/members/ages` authenticates FIRST,
  passes the **verified session id** as `viewer` (never caller input — mutation-checked), and
  reduces to an integer server-side. ⚠ **REFUSE, never truncate, over the 500 cap** —
  silently answering the first 500 renders as "these members have no age", a claim the
  function never checked.
- ⚠ **THE AGE IS NOT COMPUTED IN SQL, DELIBERATELY.** Genuinely attractive (a direct call
  becomes harmless *by construction*) and rejected: **CI has no database**, so SQL cannot be
  behaviourally tested here, and it would be a **THIRD** implementation of arithmetic whose
  failure mode is Feb 29 **clamping in Postgres and rolling in JS**. `ageFromDob()` in Node
  stays the single derivation. The service-role client is the one documented exception to
  "RLS stays authoritative at the endpoint", and the rationale now lives at the call site.
- **Honesty rules the surfaces enforce:** a failed read is `null` ("could not tell"), never
  `false` (which would read as a deliberate choice to stay private) · `typeof x === 'number'`,
  never truthiness, since 0 is a real age and every roster row composes its meta through
  `.filter(Boolean)` · **the stored row is the authority, not the absence of an error** —
  PostgREST does not call a zero-row UPDATE an error, so an error-only check reports "saved"
  while nothing was written.
- ⚠ **AN AMBIGUOUS WRITE IS NOT A ROLLBACK, AND THE TWINS RESOLVE IT DIFFERENTLY ON
  PURPOSE.** The route answers 503 `unconfirmed` when the UPDATE reported no error but the
  read-back failed; a dropped connection after a commit is the same shape. The **web** row
  already treats `null` as UNKNOWN and refuses to guess from it, so it shows unknown and
  re-reads. The **mobile** row is a segmented control whose options are only `['Off','On']` —
  a null there hits `Math.max(0, indexOf(...))` and silently renders **'Off'**, asserting
  "private" over an age that may be public — so it re-reads and **resolves** the doubt instead
  of displaying it. Ask what each twin can honestly draw before copying a fix across.
- **Late findings worth naming.** A stale `prefsRef` — synced by a **passive** effect, so it
  lags a committed render — could keep a member PUBLIC two ways: two taps from Off each
  computed 'On' so the row could not be tapped back off, and an explicit "Off" compared a stale
  value, hit an equality guard, and **wrote nothing, with no error and no toast**. Every
  transition now goes through one setter that moves the ref and the state together. A guard
  that skipped any directory **named** `nd`/`m`/`dist`/`ios`/`android` reported clean about
  files it never opened — the file list now derives from `git ls-files` (proven both ways with
  a planted caller the old walk could not see). And `useBSMemberAge` reset its cache **inside an
  effect**, which runs AFTER the render commits, so switching profiles painted one frame with
  B's name beside A's age; the age now carries its subject and the render filters on it.
- ⚠ **PRODUCTION IS UNAFFECTED BY THE MIGRATION EDITS — nothing is owed to the owner.** The
  live catalog already carries only `member_dobs_for_viewer(viewer, targets)` granted to
  postgres + service_role; the file changes make a **replay** safe, they do not change deployed
  state.
- ⚠ **CODERABBIT WAS RETIRED MID-WAVE** (owner, 2026-08-24: *"no more coderabbit"*), after
  five rounds on this PR — rounds 4 and 5 were **8 findings, essentially all self-catchable**.
  See the reviewer note in "How we work": there is now **no reviewer**, the merge gate is **CI
  green + not a draft**, and the pre-push class sweep is the only remaining layer.
- Gate on the final head: `tsc` 0 · **2285/2285** · `next build` 0 with `ƒ Proxy
  (Middleware)` · mobile build 0 · newdesign precompile `--check` 0 · CI green on 8 checks.
  Every guard added in this wave was mutation-checked with unmutated sanity cases at both ends.
- **Registered, deliberately NOT fixed here:** the web `toggleOnlineVisible` toggle carries the
  same false-"Saved." shape this wave fixed for age (pre-existing, different feature), and
  `tests/legal-transfer-claims.test.mjs` recurses with **no** skip-list at all, so it can scan
  generated build output — the same class inverted.

### 2026-08-21 — The member-facing date-of-birth prompt, and a route that stopped lying about saving it

The owner ruled every account must supply a birthdate. The collect endpoint shipped in #1925;
this is the prompt that makes it usable — mobile + web — plus the defect that would have made
it lie to exactly the members it exists to serve.

- ⚠ **THE ROUTE REPORTED SUCCESS ON A WRITE THAT MATCHED NOTHING, AND IT WAS MINE.** For an
  account with no `profiles` row, `.update()` affects zero rows and **PostgREST does not call
  that an error** — so `writeErr` stayed null and the route answered `ok: true` with a null
  date, telling a member their birthday was recorded while the gate went on refusing them,
  permanently, with nothing on screen to say so. Proven against the **live** database by
  running that exact statement under the caller's own RLS identity: **0 rows** written for a
  profile-less account, **1** for an account with a row. ⚠ **Both arms measured on purpose** —
  an equal result would only have meant the test was broken, which is what the first attempt
  produced (one `set local request.jwt.claims` applied to both statements, so the control arm
  ran as the wrong user and RLS blocked it). The read-back is now the **authority**; its
  comment already claimed as much while the code reported whatever came back and answered `ok`
  either way.
- ⚠ **AND IT IS THE REACHABLE CASE.** Measured live: **4 confirmed accounts, 2 profile rows, 0
  birthdates.** There is no trigger on `auth.users` — provisioning is application-level and
  only self-heals on the email-confirm callback, which those two will not revisit.
  `mustRefuseForAge(null)` refuses outright, so they are already locked out. Registered as an
  **owner** item rather than papered over: creating the rows means choosing each account's
  role, which is a ruling, not a patch.
- ⚠ **THE ROUTE DELIBERATELY DOES NOT CREATE THE MISSING ROW.** `profiles.role` is NOT NULL
  with no default, and `guard_profile_role_elevation` rewrites any coach role to `client` on a
  non-privileged INSERT — so a coach whose row went missing would silently self-provision as a
  client and lose their coach surfaces. **Worse than the bug being fixed.** Provisioning
  belongs to the sign-in path that already owns it.
- **The prompt, both surfaces.** Mobile `BSDobGate.jsx` — in its own file **so it can be
  MOUNTED**, because `Main.jsx` calls `createRoot` at module scope and cannot be imported by a
  test. Web `public/newdesign/dobGate.js` — dependency-free, because **only 21 of 73 portal
  pages load `/supabase.js`**, so anything keyed on `window.shapeDb` is dead code across most
  of the surface.
- ⚠ **BOTH BLOCK ONLY ON AN EXPLICIT `needed: true`.** A 401 mid token-refresh, a 5xx, an HTML
  error page from a proxy, a shape we do not recognise — every one falls through. That is the
  **opposite** of the gate, which is the authority on access and fails closed; this only
  decides whether to **ask**, and blocking on our own uncertainty would shut members out of a
  product they are entitled to, over a question we could not even establish needed asking.
- ⚠ **NO CLIENT-SIDE AGE ARITHMETIC.** Two implementations of the 18+ rule already exist, held
  in step by `tests/age-derive-mirror.test.mjs`. A third would be a third thing to keep
  aligned, and the bug it introduces — a client that disagrees with the server about one
  person's birthday — is precisely what that mirror test exists to prevent.
- ⚠ **THE WEB GATE SHIPPED A STUCK SCROLL LOCK, CAUGHT BY ITS OWN TEST.** `start()` was not
  idempotent, so a second `DOMContentLoaded` captured the `'hidden'` this file had just
  written, and releasing it then restored `'hidden'` — overlay closed, portal unscrollable for
  the rest of the session. Fixed at the **script**, not the test.
- ⚠ **INJECTED BY THE PRECOMPILE, NOT HAND-ADDED TO 73 PAGES.** That is the rail
  `sentryInit.js` already rides. A per-page list was rejected for **two** reasons and the
  second is the one that bites: it is a list the next page silently fails to join, **and** it
  turns a one-line change into a 73-file diff — past the 50-file threshold where the review
  gate skips the PR entirely, so the change would ship **unreviewed**. Coverage is now a
  property of the build, and the build prints its own number: **73/76** (the three without the
  chat-button anchor are the two redirect stubs and the chat popout, each a NAMED exemption).
- Sign-out **DELEGATES** to the canonical portal path (newly exposed from `pageShell`, held in
  a ref so an empty-dep effect cannot pin the first render's copy). That path clears the
  cookie, the persisted session AND runs the shared-device scrub in an order that took a whole
  wave to settle; a second copy here would be a copied guard with its rationale left behind.
- ⚠ **`age-gate.ts`'s HEADER CONTRADICTED ITS OWN LINE 70**, and the stale half is the one that
  got quoted into a launch document. Corrected in place, with a standing instruction to read
  `mustRefuseForAge()` rather than any prose copy — that one included.

**⚠ MUTATION-TESTING FOUND TWO GUARDS THE TESTS WERE NOT MEASURING — and both were gaps in the
TESTS, not the code.** First pass killed 7 of 9.

- **The status was enforced by coincidence.** Deleting `if (!res.ok) return null` changed no
  test outcome, because every non-OK case the suite enumerated happens to carry a body without
  `needed`, so the **second** guard caught them all. Nothing pinned the rule the file's own
  header states. Two vectors now do — a 500 and a 401 that both say `needed: true` must fall
  through. Not contrived: the route already answers 409 carrying a `no_profile` code, and the
  read path's 200 body is exactly `{needed, blocked}`.
- **The stuck scroll lock was covered by OUTCOME, not by mechanism.** Removing `started` alone,
  or `locked` alone, left the suite green; removing **both** was caught. So the shipped bug was
  pinned and neither guard was. The test now drives the path they exist for — jsdom hands back
  a parsed document, so `readyState` is shadowed to reach the `DOMContentLoaded` branch at all
  — and asserts the probe fires **exactly once** across two events.
- ⚠ **`locked` SURVIVES AND CANNOT BE PINNED, which is a fact about the code, not a hole.**
  `lockScroll()` has one caller, inside an idempotent `start()`, so a second capture is
  unreachable while `started` stands. **Kept** — the invariant belongs at the capture, where a
  second caller added later inherits it — and the guard now says so, so the next reader neither
  deletes it as dead nor spends a round writing the test that cannot exist. **Deleting a
  correct guard to make a number read 10/10 is the over-correction, not the fix.** Final batch:
  **9 killed / 1 equivalent**, unmutated sanity green at **both** ends.

Copy lands in all 13 wired locales; parity is enforced, so en-only would fail the build. Suite
**2248/2248** · `tsc` clean · `next build` with `ƒ Proxy (Middleware)` · mobile build with the
gate confirmed present in the emitted bundle · precompile `--check` writes nothing.

### 2026-08-21 — The go-live wave: a checklist that cannot rot, and a compliance audit against the live product

Seven PRs. The thread running through them: **records that were true when written and had
since gone false**, and the habit that produces them.

- **Records-only diffs get no review round (#1919 → `ba0045469`)** and **two records that
  existed only on this machine (#1920 → `b3f1b6521`)** — `docs/HANDOFF-2026-08-19.md` and the
  §C weekly-readout spec were written, referenced, and never committed. The spec matters
  more than an ordinary orphan: §C is **not built** and `/api/ai/weekly-readout` is orphaned,
  so that file was the only explanation of what the route was for.
- **An owner migration the board still called open (#1922 → `8b6c808ca`)** —
  `2026-07-31-coach-insert-lockout.sql` had already run. Proved from the live catalog, not
  inferred: `2026-06-17-coach-write-scope.sql` **creates** the policy and the catalog no
  longer has it, so it was created and dropped. ⚠ The `status` field was load-bearing —
  at `manual` the board reported a finished migration as an outstanding **owner action**,
  and it was being carried on the go-live list as a launch blocker.
- **The go-live checklist stops copying facts it cannot keep current (#1921 → `d72144399`)**
  — untouched since 2026-05-30 and wrong three ways: it told you to open `/api/health`
  (**admin-only since 2026-07-30, returns 404**), it said run migrations oldest-first as
  no-ops (**13 carry ordering constraints in their own headers**; one breaks the publish
  button if run early), and it called Eat/Train "editorial demo content (no data model)".
  ⚠ **The fix is the contract at the top, not the three corrections** — the file now holds
  ORDER and VERIFICATION METHOD only; anything with a status, a count or a membership list
  is a link, never a copy. Four review rounds, 18 fixes.
- **Removed an endorsement Shape has not earned (#1923 → `acd5bf9ef`)** — a band reading
  "Trusted by coaches at" above six real trademarks, whose own code comment called it a
  "press substitute". ⚠ It was in **two** trees; the sweep that found the first searched
  only `public/newdesign/`.
- **Erase what deletion missed, and stop advertising what does not exist (#1924 →
  `c80442272`)** — three tables kept a deleted member's uuid indefinitely, and live pages
  advertised Cronometer, Google Fit and MyFitnessPal, none of which has **any**
  implementation.
- **A door that stays open when the age gate starts refusing (#1925 → `b61097ba9`)** —
  `POST/GET /api/me/date-of-birth`, the collect half of the owner's ruling below.

**⚠ OWNER RULING 2026-08-21 — EVERY ACCOUNT MUST SUPPLY A BIRTHDATE.** This ends the
grandfathering in `mustRefuseForAge()`. ⚠ **It cannot be applied as one line**: deleting the
clause 403s every pre-cutoff account across all seven gated prefixes **including the screens
they need to comply**. Collect first, enforce second — the same shape as the profiles PII
lockdown. The prompt is not built and the clause is untouched; War Room carries both.

**⚠ THE AGE GATE IS NOT INERT, AND THIS FILE'S OWN SOURCE SAID OTHERWISE.**
`src/lib/age-gate.ts`'s file header still claims absence "is not treated as a claim either
way", while line ~70 of that same file says **ABSENCE NO LONGER ADMITS**. Two comments in
one file, disagreeing — and the stale one was quoted into a launch document before anyone
read the code. **Read `mustRefuseForAge()` in `src/lib/age-derive.mjs`, never a prose copy.**

**Compliance audit, against the live product rather than the drafts.** Findings are on the
War Room; the full write-up went to counsel **privately** and deliberately not into this
repo. Headlines: **four live sub-processors appear in none of the ten `docs/legal/`
documents** — Jitsi is the architectural one, since `src/lib/video.ts` defaults every
coaching video call to the **free public** `meet.jit.si` with no DPA — and the retention
schedule **promises sub-processor deletion that nothing performs**.

⚠ **The repository is public**, and three files in `docs/legal/` carry confidentiality
markers; one says "PRIVATE, not published" and has been readable since 2026-06-16. Deleting
them does not undo it — they are in history. Registered as an **owner** item.

⚠ **Method caution worth carrying:** the two most significant register omissions (Jitsi,
Twilio) are the two **least visible to a source-based review** — one is a console setting,
the other a bare hostname default. Remaining gaps likely resemble those two, and only a
vendor-invoice reconciliation would find them.

### 2026-08-21 — CodeRabbit became the gating reviewer (#1916 → `a81b74d8a`) — ⚠ SUPERSEDED 2026-08-24

- ⚠ **THIS HEADING IS HISTORY: CodeRabbit was retired three days later** (owner, 2026-08-24:
  *"no more coderabbit"*), and the gate has been **CI green + not a draft** ever since
  (#1930 → `eec328a55`). The heading is marked rather than rewritten because a dated entry
  should keep saying what was true on its date — but a *heading* is what a skim and a grep
  land on, so it has to carry its own expiry.
- ⚠ **AND READ THE NEXT BULLET AS THE SHARPEST VERSION OF THE LESSON.** It diagnoses the
  trap precisely — retiring the named reviewer made `/console` report every PR as
  not-mergeable regardless of CI — and then, in the very next sentence, **re-enters it with a
  different name**. Fixing which reviewer is named is not fixing the defect; **naming one at
  all** is the defect. It cost the same outage a second time, 2026-08-24 to 2026-08-26.
- **Owner ruling, mid-turn:** *"stop using codex for now, only coderabbit"*. #1914 had made
  `prAllGreen` require a clean **Codex** verdict on the head one day earlier, so with Codex
  retired `/console` would have reported **every** PR as not-mergeable regardless of CI. The
  gate now reads CodeRabbit: CI green **AND** `approved`-or-`clean` on this head **AND** not
  a draft. ⚠ **Amended twice more the same day, and this is where it landed:** Codex is
  out entirely — *"no more codex, out of credits, only coderabbit"* — so CodeRabbit is not
  merely the gate, it is the only reviewer. The intermediate *"one round after CodeRabbit
  clears"* rule lasted a few hours and is dead.
- ⚠ **THE CONTRADICTION DISSOLVED RATHER THAN BEING OVERRIDDEN.** CodeRabbit left the gate in
  #1914 because `coderabbitVerdict` is head-pinned while the house ran it **once** as a
  breadth sweep — so the sweep stopped counting the moment a fix for its own findings was
  pushed. It is now re-triggered **every round**, which is exactly what makes head-pinning
  the right property for a gate: it says *this head* was reviewed and passed.
- ⚠ **WHAT COUNTS AS A PASS IS MEASURED, NOT ASSUMED.** Run over the last 18 merged PRs:
  `approved` 2 · `clean` 1 · `commented` **15**. **TWO things are a pass**: an APPROVED
  review whose `commit_id` is the head, or a summary **comment** carrying a zero marker
  that names the head (the `clean` verdict). Approval is the common one — but `clean` is
  not decorative, and a poller watching the reviews API alone **hangs forever** on a PR
  whose pass arrives as a comment. **`Actionable comments posted: N` is NOT head-pinned**
  — that summary is edited in place, and #1915 merged with it still reading **2** while the
  head review was APPROVED with **zero** inline findings. So `commented` is not a pass.
  ⚠ **This line read *"it means the head is unreviewed"*, which is too strong.** It means
  **no settled verdict on this head yet** — measured on this PR: head `2618862d3` read
  `COMMENTED, COMMENTED` for three minutes (reply containers) before the real
  `CHANGES_REQUESTED` landed. ⚠ And it never conceals findings: `openFindings` is checked
  **before** any review state, so a head carrying head-pinned inline comments returns
  `changes`, never `commented`.
- ⚠ **A REVIEW STATE IS NOT THE WHOLE VERDICT.** CodeRabbit files findings as **inline review
  comments** and the containing review is often `COMMENTED`, not `CHANGES_REQUESTED` — a
  state-only read returned `commented` for a head with open findings on it. `coderabbitVerdict`
  now takes `reviewComments`, anchored on `original_commit_id` and never `commit_id`, which
  GitHub re-anchors forward. **The route had not been fetching them at all** — it does now,
  in the same `Promise.all` as the reviews — so a guard asserts the real call site: every verdict test hands them in by hand and would stay green with the route
  unwired.
- ⚠ **CODERABBIT DOES NOT AUTO-REVIEW THIS REPO** — *"fewer than 10 stars"*. Both #1916 and
  #1917 sat with **no review at all** while CI went green. A new head is unreviewed until you
  post `@coderabbitai full review`; the recovery is always to trigger, never to wait.
- ⚠ **AND A FAIR-USAGE NOTICE IS NOT A CAP.** When the included-review quota is spent
  CodeRabbit appends a note about usage-based billing to its ordinary reply. It reads exactly
  like a rate limit. The **same** comment said the full review had finished, and a real
  CHANGES_REQUESTED followed — matching it would report CAPPED for heads that were genuinely
  reviewed. I mis-diagnosed it as a block first, and the code now says why not to.
- Swept: `/console`'s headline keyed on `p.codex` for BLOCKED and CDX RE-TRIGGER, rendering a
  verdict from a reviewer the house no longer runs; and **the JSDoc types in the `.mjs` govern
  over the `.d.ts`**, so updating only the declaration file left `tsc` reporting the old
  shapes.

### 2026-08-21 — The dedup layer stopped keeping two records of the same fact (#1917 → `d2f63bb9d`)

- ⚠ **THE QUEUE IS THE RECORD FOR A QUEUED ITEM.** `notify_state.types` holds **one slot**
  per `(type,key)` while `pendingDigest` can hold several items mapping to it, so a stamp
  written at queue time could be orphaned or misattributed by anything that later removed
  the item it stood for — the shape behind **two of the five Codex review rounds on #1915**. A
  deferred item is no longer stamped: the duplicate check asks the queue, and **delivery**
  is what stamps. The class is pinned as impossible in both queue orderings rather than
  handled case by case. Measured before it was built — 6 lines, 37 of 38 tests untouched.
- ⚠ **TWO NOTIFICATIONS FIRED AT MOST ONCE PER MEMBER, EVER.** `checkin_due` signed itself
  the constant `'due'` and `streak_broken` `'broken'`, while `score_drop` / `goal_slip`
  signed with a reason **string** — once per distinct reason, forever, in a map with no TTL.
  Every self-keyed client candidate now signs with its content **and the week**, so it
  recurs at most weekly, still bounded by the daily cap, quiet hours and the digest.
  `habit_reminder` already day-scoped its signature, which is what made the others read as
  an oversight rather than a policy. The week is **UTC on purpose**: it only bounds how
  often a nudge may recur, and a per-member zone would resolve the same week two ways for
  someone who travels — and re-fire a nudge they already had.
- ⚠ **AND THE MAP GREW WITHOUT BOUND.** `coach_message` / `coach_cosign` key on the **event
  id**, so every message a member ever received left a permanent entry in a `user_goals`
  blob read and rewritten on every cron pass. `at` was written and never read; it now bounds
  the map at 30 days. Dropping an entry can only cost a duplicate, never a silent loss.
  ⚠ **AND AGE ALONE IS NOT A BOUND**, which took a further round to see. Three structural
  caps sit beside the TTL: **24** signatures per `(type,key)` (a key written daily never
  ages out, so its list grew freely), **200** entries in the map, and **50** items in the
  digest queue. The sharp edge is that `writeUserGoal` **swallows its upsert error**, so an
  oversized blob does not fail loudly — it loses the dedup state entirely, which is worse
  than any eviction.
- ⚠ **`candidatesFor` NEVER PASSED `now`.** The weekly signature would have keyed off the
  wall clock while the rest of the pipeline used the caller's instant — silently, because a
  default parameter makes an unwired caller look plausible and every unit test supplies its
  own. A guard asserts the real call site.
- ⚠ **ONE PREF, ALL CHECK-INS (owner ruling).** `BSTodayNudge` self-gated, but Home's
  **lead** and the **weekly bulletin** never consulted the pref — and when the lead IS the
  check-in, Home deliberately suppresses both bulletins to avoid duplication, so an
  opted-out member had the quiet surfaces hidden by their pref and *"I'll check in →"* left
  standing. A suppressed lead falls through to the next move; it never empties the rail.
  The label is now **Check-ins** — *Daily check-in* named the smallest surface it governs.
- ⚠ **WHAT THIS COULD NOT PROVE.** `BSClientHome` cannot be mounted in the jsdom harness — a
  child resolves undefined at render, a **pre-existing** gap unrelated to this change. The
  lead rule is therefore a **named function** (`bsCheckinLeadSuppressed`) unit-tested in
  both directions, plus source guards on both call sites, rather than an end-to-end mount.
  Registered, because Home is where engineFlag, the pref hooks and the bulletins all meet
  and none of it is mount-covered.
- ✅ **ALL 12 NON-ENGLISH CATALOGS NOW DESCRIBE THE WIDER SCOPE.** Each dropped the "daily"
  modifier and now names **both** surfaces — Home prompts and notifications — in the
  register and loanword choice it already used. The i18n **key** was deliberately not
  renamed: a key 13 catalogs share buys nothing by moving and risks a missed catalog, so
  the key stayed and the copy moved. ⚠ The translations are **machine-authored** and want
  a native pass before launch — the standing caveat on this rollout.
  ⚠ This bullet said the opposite for one round, after the war room item had already been
  flipped to `done` — the same claim fixed in one record and left standing in the other,
  which is the failure this file keeps repeating.

### 2026-08-20 — The check-in opt-out reached the Home screen and nothing else

- **A member who opted out kept being nudged.** Turning Settings → Preferences → *Daily
  check-in* off stops the Home bulletin, but the stored `notify_snapshot` keeps its
  check-in state and **both** notify paths recompute from it — so someone who opted out
  and never reopened the app kept receiving check-in nudges from the cron. Codex P1 on
  #1899, verified against the code before fixing: `/api/ai/notify/cron` consulted
  `client_settings.dailyCheckin` **zero** times.
- ⚠ **THE CHECK-IN NUDGE HAS MORE DOORS THAN ANY FIX HAS FOUND.** No number here on
  purpose: every count put on this has been low — two, then four, then five.
  1. an explicit `checkinDueThisWeek` signal, and
  2. the engine's own `checkin_overdue` flag — both feed `checkin_due`, so gating the
  *call site* would have left the flag firing; the suppression sits at the candidate.
  3. ⚠ **the DIRECTIVE, and it is the loudest.** `checkin_overdue` carries directive
  priority **100** in `dashSignals` (escalating with `missedWeeks`), so for an overdue
  member the ONE move IS *"Send your weekly check-in"* — a HIGH-priority notification the
  `checkin_due` gate never touched. Suppressed on the **lever**, so unrelated directives
  survive. (It was first suppressed on the action *kind*, described here as mapping 1:1
  to the checkin lever — **that claim was false**, and it cost two rounds: the fifth door
  below, then its mirror.)
  4. ⚠ **a STORED one.** An item deferred by quiet hours or the daily cap lives in
  `notify_state.pendingDigest` and is re-emitted at the next non-quiet run **without being
  rebuilt** — so suppressing the candidate stopped the rebuild and did nothing about the
  copy already queued. `decideNotifications` now purges held check-in items, keyed on the
  type and a stamped `data.move`, **never on copy** (wording is translated).
- ⚠ **AND THE PURGE BROKE THE DEFERRAL UNTIL IT WAS CAUGHT.** `hadPending` read the
  *unfiltered* queue, so when every held item was a purged check-in and the same call
  deferred a new low-priority or over-cap candidate, the digest fired **immediately** with
  that new item — defeating the documented next-evaluation deferral and, for an over-cap
  item, bypassing the daily cap. It now reads the filtered queue before this call's
  candidates are added.
- ⚠ **A LEGACY QUEUED DIRECTIVE CANNOT CARRY THE STAMP.** Anything finalized before it
  shipped has `data: {}`, so the first evaluation after rollout would still have nudged an
  opted-out member. A directive with no usable move kind is treated as unidentifiable and
  purged **while opted out** — the under-deliver direction this layer already chooses, and
  self-limiting, since every directive built from now on carries its kind.
- ⚠ **AND THE PURGE CONSUMED THE NUDGE IT REMOVED.** A deferred candidate records its
  signature in `notify_state.types` so the same nudge is not rebuilt twice; the purge took
  the queued copy and left the stamp. `checkin_due` signs itself with the **constant**
  `'due'`, and that map has no TTL and is never pruned — so a member who opted out while
  one was queued and later opted back in was deduped, **permanently**, against a
  notification that never went out. A stamp means *handled*; purging un-handles the item,
  so the stamp is released with it — but only when nothing of that type is **still held**,
  since a queued item carries no key and a surviving non-check-in directive shares the
  purged one's entry.
- ⚠ **AND A FIFTH DOOR: THE COACH OVERRIDE, WHICH THE ACTION KIND CANNOT SEE.**
  `sanitizeOverride` validates `lever` against a fixed set that includes `checkin` but takes
  **any** 40-char string as the action kind, defaulting an omitted one to `message`, and
  `buildDirective` keeps that action beside the checkin lever — so a coach who overrode the
  check-in in their own words emitted a directive the kind-only gate read as unrelated, on
  **every** evaluation. The kind can never separate them: `DIRECTIVE_MOVES` gives the
  **contact** lever kind `message` too, so *"send me your check-in"* and *"reach out today"*
  are kind-identical and differ only by lever. The **lever is the identity**; the kind is its
  engine-built alias. Pinned by a test that asserts the two kinds are **equal** before
  asserting one is suppressed and the other survives, with both directives built through the
  real `buildDirective` rather than a fixture that assumes the shape.
- ⚠ **RESIDUAL, ACKNOWLEDGED.** A held directive stamped with a move but **no lever** (queued
  before the lever stamp shipped) cannot be proven not to be a coach check-in override, since
  a coach may set any kind against the checkin lever and `message` is a legitimate engine
  kind. Purging every lever-less directive would cost **every** opted-out member their one
  move at rollout to spare a rare one, so the kind is trusted there. Bounded to a single
  evaluation per member.
- ⚠ **AND THE STAMP'S OWNER IS WHOEVER WROTE IT LAST.** The release above keyed on "is
  anything of this type still held?" — but `types` is **one slot** per (type,key) and two
  directives can be held at once, so when the check-in was queued **second** the stored
  signature is the check-in's and the survivor check preserved it anyway. The queued copy
  now carries its signature and the release matches on it. Items queued before that stamp
  keep the coarse rule, which is right in the ordinary single-item case and no worse than
  the bug it replaces in the rare one.
- ⚠ **THE PATTERN, NOT JUST THE INSTANCES.** Two of the last three review rounds found a
  defect *inside the preceding fix*, and both were the same shape: **the queue and the dedup
  map disagree about cardinality**, so a stamp written at queue time can be orphaned or
  misattributed by anything that later removes an item. The class-level fix is to let the
  **queue be the record** for a queued item — consult `pendingDigest` in the duplicate check,
  drop the stamp from the defer branch, stamp what the digest actually emits. Measured on a
  scratch copy rather than asserted: **6 lines, 37 of 38 tests pass untouched**. Not taken
  here, because it changes dedup behaviour for **every** notification type inside a PR about
  a check-in opt-out. Registered.
- ⚠ **AND THE MIRROR OF THE FIFTH DOOR, IN THE OVER-SUPPRESSING DIRECTION.** Having made
  the lever the identity, the kind was left in as a belt-and-braces `||` — which lets the
  **derived alias override the authoritative field**. `sanitizeOverride` takes any 40-char
  kind, so a coach can set lever `contact` with kind `check_in`, and that member lost their
  coach's actual move to a check-in opt-out. When a lever is present it now decides **alone**;
  the kind speaks only for directives stamped before the lever existed. Found by CodeRabbit,
  reproduced through the real engine before fixing.
- ⚠ **BOTH routes were wired, not only the cron.** `/api/ai/notify` recomputes from the
  same snapshot and had the identical hole — fixing the reported one would have left the
  live path nudging.
- ⚠ **It suppresses ONLY the check-in.** They opted out of a daily check-in nag, not out
  of coach messages, streaks or the one move; over-correction here would be its own
  defect, and a test pins that those three still arrive.
- **`dailyCheckinOn` mirrors mobile's `bsDailyCheckinOn`: ON is the DEFAULT and absence
  means ON.** An account predating the pref, or a settings read that simply failed, can
  never read as silently opted out. ⚠ The two are TWINS in separate bundles — change one,
  change both.
- ⚠ **THE MOBILE COMMENT WAS OVERCLAIMING AND IS CORRECTED IN PLACE.** It said the engine
  gates its vitals leg *"the moment a member opts out"*; that was true of the **in-app**
  engine only, and the server paths cannot see the per-uid mirror it describes.
- ⚠ **REGISTERED, NOT FIXED — an opt-out that never reaches the server.** `persistPrefs`
  DECLINES to write when there is no real `client_settings` document yet (offline, query
  error, or a member who has never had a successful settings read). Until that write
  lands the server sees no `dailyCheckin` key, which correctly reads as opted IN — so the
  device goes quiet and the cron does not. This is a property of the **writer** and cannot
  be fixed from the notify side, which is why it is split into its own `pending` item
  rather than left inside the completed one.

### 2026-08-20 — The gate trusted the wrong reviewer with the wrong strictness

- **The house process and the shipping gate encoded opposite priorities.** The process
  calls Codex **the gate** and CodeRabbit a one-time breadth sweep; `prAllGreen` had
  CodeRabbit **head-pinned and blocking** and Codex **presence-only**, so each reviewer
  was treated as the opposite of its role. ⚠ **They were not merely different, they were
  unsatisfiable together**: `coderabbitVerdict` is head-pinned, so the ratified
  *"CodeRabbit ONCE"* sweep stops counting the moment a fix for its own findings is
  pushed, after which the gate could never open without the re-review the process
  forbids. Raised independently by Codex on #1912.
- ⚠ **THE RULING THAT JUSTIFIED THE ASYMMETRY RESTED ON A PREMISE MEASUREMENT REFUTES.**
  `codexPresent` was presence-not-freshness (owner, 2026-07-27) because *"Codex leaves no
  record at all when it is clean — it reacts with a thumbs-up on the triggering
  comment"*, so head-pinning it *"would jam every clean pass at `none`"*. Across **every**
  PR from #1840 (2026-07-26) through #1912: **every** clean Codex verdict posts an issue
  comment carrying `Reviewed commit: <sha>`, and **no** trigger comment carries a
  thumbs-up. #1846, opened **on the ruling's own date**, carries two. The record the
  ruling says does not exist is the one Codex has always left, and it names the commit.
- **`codexPresent` → `codexVerdict`**, head-pinned: `clean` · `findings` · `stale` ·
  `none`. It reads the commit from the body in both shapes Codex reports in, by prefix
  with a **7-character floor**. Anything that cannot be pinned to this head is `stale` —
  **fail closed and loud**, because the board can then ask for a re-trigger, where the
  old behaviour merged silently.
- **LATEST WINS for a head, and "findings always outrank clean" was a trap.** Refuting a
  finding and re-triggering *without a new commit* is a routine round, and then the
  findings review and the clean comment that cleared it name the **same** head. Treating
  any past finding on a SHA as permanent jams the gate forever on a head Codex has
  explicitly passed — fail-closed becoming **fail-closed-forever**. Same-head records are
  ordered by timestamp and the newest decides. ⚠ Findings still win where order **cannot**
  be established (equal stamps, or records carrying none): the conservative reading is the
  **fallback**, not the rule.
- ⚠ **A RECORD CAP ON A LATEST-WINS GATE IS A CORRECTNESS BUG, NOT A LATENCY TRADE.** These
  endpoints paginate **oldest-first** and take no direction parameter, so the newest record
  is on the LAST page. The first version of this change capped at five pages and asserted
  in its own comment that missing records could only read `stale` — **that claim was false,
  and Codex refuted it**: reviews and comments are fetched separately, so a clean COMMENT
  inside the window can outlive a later findings REVIEW outside it and report a **false
  pass**. Pagination now runs to exhaustion via the `Link` header, and hitting the safety
  bound **throws** rather than returning a short list, so truncation can never be silent.
- ⚠ **THE NET EFFECT IS STRICTER, NOT LOOSER — verified on the LIVE CORPUS, not
  fixtures.** Replaying real GitHub records through the shipped function returns `clean`
  for six PRs and **`stale` for #1910 and #1911**. #1910 is the case the records already
  flag: it merged on `f5d2ef80c`, one of **nine** Codex reviews on that PR, *every one a
  findings round*, and **none on its final head**. Both arms exercised, so the result is
  not saturated.
- ⚠ **A GUARD THAT SURVIVED MUTATION UNTIL ITS CASE WAS PINNED.** Dropping the 7-char
  floor changed no test outcome, because the body path is already guarded by the regex's
  own `{7,40}` — the floor only bites on the `commit_id` fallback, which comes straight
  from GitHub and never passes through that regex. Rather than delete a line that reads
  dead, the case it exists for is now a test: a 3-character `commit_id` that prefixes the
  head must not pin a verdict. Seven mutations, all caught.

### 2026-08-20 — A dead option, a vanished timer, a false superlative — and two defects inside the fixes for them (#1913 → `5972b786e`)

⚠ **#1913's MERGE MESSAGE IS IMMUTABLE AND WRONG ON TWO COUNTS.** (1) Its heading *"THE
THREE AGAINST MERGED MAIN"* stands above **four** bullets — the ENG-routing defect makes it
four, and the handoff it was written from had the same mismatch. (2) It says the copy fix
left *"five"* locales already saying "earlier". Counted off the merged diff it is **seven**
— the message repeated the figure this handoff carried instead of measuring it, which is
the same way #1910's merge message went stale. **Quote the bullet below, not the merge
message.** (This is the third merge message in three days to be superseded by its own
records; the ones here were re-measured, the ones written at merge time were not.)

- **Two options ran the same plan.** With no window to weave into, TOGETHER falls back to
  serial — so *"cook at the same time"* produced the **same timeline** as *"cook
  separately"* and printed the same minutes, while its row promised simultaneous cooking.
  The engine had always NAMED the reason (`BS_SERIAL_REASON.NO_WINDOW`); nothing read it.
  Now unavailable-with-reason, minutes suppressed. ⚠ **A dead choice is worse than a
  missing one** — it spends the cook's decision on nothing.
- **A carried timer vanished, and the expiry filter lived at THREE sites** — display,
  handoff, wrap. Round one fixed *one*; round two found the other two. ⚠ **A hold that
  finished between the last dish and the wrap is precisely the one the cook must be told
  about**, so filtering expired holds out re-created the very defect the carry exists to
  fix, one stage later.
- **"Out of the kitchen soonest" was unsupported.** TOGETHER is order-sensitive and the
  order search that would justify a superlative runs on the SERVE path only. Copy changed
  in the **six** locales that actually claimed an optimum — `de` *am schnellsten*, `en`
  *soonest*, `es` *lo antes posible*, `id` *paling cepat*, `tr` *en erken*, `vi` *sớm
  nhất*. ⚠ **The other SEVEN, not five**, already said *earlier/faster* and are
  supportable (`fr` `ha` `it` `pcm` `pt-BR` `ru` `uk`) — 6 + 7 = **13**, the whole set.
  Counted off the merged diff; the handoff and the earlier records both said five, which
  left two locales unaccounted for. ⚠ **A superlative is a claim about a search you either
  ran or did not.**
- **An owner ruling routed to the ENG lane.** `OWNER RULING NEEDED —` matched no pattern
  in `console-triage.mjs`, so a decision needing the owner was filed as engineering work.
  Fixed **at the classifier**, not at the string — and ⚠ the neighbouring ruling routed
  correctly only *by accident*, because it happens to contain the word "unruled".

**AND TWO DEFECTS INSIDE THOSE FIXES — the fourth and fifth round of five.**

- ⚠ **The carried hold reached the wrap screen and stopped dead there** (Codex **P1**).
  `BSPrepSession` has **no `useEffect` and no `setInterval` anywhere**; `if (stage ===
  'cook')` returns early into `BSCookMode`/`BSPrepCook`, which own the only per-second
  heartbeats in this flow — so by the time `stage === 'wrap'` renders, **both are
  unmounted and nothing in the subtree ticks.** `sessionNow` froze at the instant the cook
  arrived: the countdown never reached "Time's up" and never offered the acknowledgement,
  which is the one thing the carry exists to deliver, missing from the last screen that
  can deliver it. The heartbeat added is scoped to the wrap **and** to holds still
  running, because this component RETURNS the board during the cook stage and a
  session-wide tick would re-render it every second on top of its own.
- ⚠ **The debit was computed by a component with no clock** — found by the self-review the
  P1 required, **one prop away from it**. `carriedDebit` came off the same render-time
  `sessionNow` and was handed down as a finished number, but the parent does not re-render
  during a dish, so the debit computed at the handoff was the debit the whole next dish
  saw. The session figure therefore **under-read by the carried hold's entire remaining
  duration** for as long as that hold ran. The component's own comment stated the intent it
  failed to deliver: *"the debit shrinks with the clock and expires by itself."* Moved to
  the chokepoint — `BSCookMode` already ticks and already receives `prep.carried`.

⚠ **WHY THESE TESTS LOOK UNUSUAL, AND THE RULE WORTH CARRYING.** **No assertion on
rendered text can catch the wrap defect.** Re-rendering is what the mount harness *does*,
so a test that calls `render()` supplies the very thing production fails to schedule and
passes either way — the bug is the WIRING, not the arithmetic. Those tests instead capture
what a render **registers** and run it against a recording timer. The debit needed **two**
tests for the same reason: mounting `BSCookMode` supplies `priorMins` itself, so it passes
whether or not the parent *also* subtracts — and subtracting on both sides charges a
carried hold **twice**, worse than the frozen figure it replaced. The second walks two
dishes of a real sequential session and pins that the credit handed down does not move.
**Seven mutations** across the two fixes, each caught by the intended test.

### 2026-08-20 — Cook together: three options, three schedulers, and a serve time the plan keeps (#1910 → `056cd0279`)

- **The prep sheet asks WHY before it starts, and the answer now changes the schedule.**
  **Owner ruling:** the three options are three DIFFERENT questions — *cook at the same
  time* · *cook separately* · *cook to serve* (every dish completing at one moment).
  "Cook at the same time" had been running the SERVE scheduler with **no serve time**, so
  two of the three doors led to the same room and the option meant to get the cook OUT of
  the kitchen was optimising the wrong thing. MEASURED over **4,950 catalog pairs** —
  every pair of the merged 100-recipe catalog — TOGETHER finishes sooner than SERVE in
  **29.5%** and later in **7.7%** (mean session **51.9 min** vs **53.9**; SEQUENCE
  **64.4**). It is the faster plan on balance — but the reason it is CORRECT is that it is
  a different question.
  ⚠ **THESE SUPERSEDE THE FIGURES IN #1910's MERGE MESSAGE** (3,570 pairs · 16.0% · 4.2% ·
  38.6/39.9/44.4). 3,570 is exactly **C(85, 2)**, so that measurement predated #1911 and
  omitted all 1,380 pairs involving the 15 new recipes. The merge message is immutable and
  now WRONG on this point; these are the numbers to quote.
- ⚠ **"Cook to serve" is DISCLOSED, not promised.** It lands every dish at one moment in
  only **7.4%** of pairs, mean gap **13.5 min** — and it is **overwhelmingly not the
  kitchen**: an unlimited-station kitchen reaches only **8.6%**. It is the one cook, who
  cannot finish two hands-on dishes at the same instant.
  ⚠ **THE EARLIER CLAIM THAT UNLIMITED STATIONS MEASURE *IDENTICALLY* IS WITHDRAWN.** On
  the 85-recipe catalog both arms read 2.2% and I called them identical; re-measured over
  all 4,950 pairs they are **7.4% against 8.6%**, so the kitchen accounts for about **1.2
  points** and the cook for the remaining ~91%. The conclusion holds and the word does
  not — a saturated pair of equal numbers was hiding a real, if small, difference
  (see the check-your-check note in the review section). The gap is stated beside the start time
  the cook sets an alarm by. **A true single-moment finish is a scheduler design change —
  registered, not claimed.**
- **The engine.** ONE placement now answers for the timeline, the serve time AND the
  issues, so the sheet cannot report a schedule it is not showing. A pull **names the
  resource that caused it** — MEASURED, an unlimited kitchen still reported `stations` on
  **3,492 of 3,570** plans, so the reason code was wrong in **97.8%** of them and every one
  of those was the COOK. ⚠ That pair of numbers is over the **85-recipe** catalog and is
  deliberately NOT restated: it measures a defect that is now fixed, so re-running it today
  would measure the corrected engine and find nothing. A historical measurement gets its
  denominator named, never a fresh number pasted over it. ⚠ It has **no UI consumer yet** — a contract fixed ahead of its
  first reader.
- ⚠ **A DISCLOSURE THAT MOVED HOUSE AND STOPPED DESCRIBING ITS NEIGHBOUR.** The landing gap
  was rendered beside "You start cooking at {t}" but read from `orchServe` — the
  *earliest-reachable* plan — while the start time came from the plan the cook actually
  picked. Before the rewire those were the same plan; **my own fix moved the disclosure and
  split them.** MEASURED over 89,100 pair/kitchen/serve-time comparisons: they disagree in
  **5.7%**, **one-directionally** — the shown gap **understates**, never overstates, by up
  to **101 minutes**. It never falsely promised a single moment (0 cases of shown-0 against
  a real gap), which is exactly why nothing on screen contradicted it.
- ⚠ **AND THE FALLBACK I ADDED CLAIMED TO BE A PROOF.** The earliest-serve search is bounded
  by ITERATIONS, not minutes; past the bound it fell out infeasible and everything
  downstream read a placement whose `placed` is undefined — an **empty timeline beside an
  unreachable serve time**, silent. The serial bound fixes that, but it is an UPPER bound,
  and `exact` — the flag the sheet reads to choose between *"this is the earliest"* and
  *"the earliest of the orders we searched"* — stayed **true**. Fixed, and **mutation-tested
  in both directions** so an over-correction (always-false) fails too.
  ⚠ Reachable only far outside real data: it needs a recipe past `BS_ORCH.serveSearchMax`
  steps where the catalog's largest is **8**, and the search is already ~17s at 320.
- ⚠ **THREE OF MY OWN TESTS WERE HOLLOW, and only mutation-testing caught them.** The
  options test asserted **row badges** rather than the plan actually run (rewiring SOONEST
  back to SERVE left it green); the harness-isolation guard used **identically-shaped**
  components, which share a cell array quite happily; and a hold fixture had **stopped
  reaching the case it exists for** after the catalog merge. None were caught by review or
  by a passing suite. **A green test is not a working test.**
- **Two findings REFUTED with evidence rather than complied with.** The serial fallback
  "can itself fail" — the named case (100 one-minute steps against 1) returns a complete
  101-event timeline, and 11 shapes converge including 7- and 8-dish sets past the
  exhaustive permutation bound. And the Pidgin subtitle "is a fragment" — so are **all 13
  locales**, the English source included (*"On the table at a time you choose"*); it sits
  under the option title, not as a sentence. ⚠ The adjacent Pidgin finding **was** taken:
  `by {t}` for a clock time contradicts the locale's **own** convention (`for {time}`,
  three instances across coach + marketplace), and mine were the only two `by`s in it.
- **Review curve 27 → 6 → 5 → 3 → 0** over five rounds; three of the last four rounds found
  a defect **inside my own preceding fix**. Suite **2100**; `tsc` clean; CI green and
  CodeRabbit clean on `1177823ac`. Branch kept.
- **Registered, NOT built:** the single-moment serve objective · the pull reason code's
  first UI consumer · **71 of 85 recipes still schedule short against their own
  annotations** (a DATA pass, not an engine one). ⚠ **THAT 71/85 IS AGAINST THE OLD
  CATALOG.** It was measured before #1911 took the catalog to **100**, so the **15 recipes
  imported via `USDA2_KITCHEN_RECIPES` are UNAUDITED** — resolving the 71 does **not**
  close this residual. Re-measure across all 100 before calling it done; a stale
  denominator is how a residual gets closed while a sixth of the catalog was never
  checked.

### 2026-08-19 — Shape Kitchen reaches 100, and a Prep Session can finally interleave (#1911 → `3c4ee6e9b`)

- Fifteen more USDA MyPlate recipes take the catalog **85 → 100**, and a passive-window
  overlay takes the recipes that can **HOST** an interleave window from **22 → 53**
  (two-dish interleave **40.5% → 50.8%**).
- ⚠ **THOSE NUMBERS WERE CORRECTED DOWNWARD REPEATEDLY, and that is this entry's point.**
  The overlay first claimed 76 hosts / 69.3%; each round removed windows a cook **cannot
  actually leave** — terminal windows (a leftover hold is a make-ahead, true of a fridge
  rest and false of a live oven), windows whose parts exceed the whole, attended aromatics,
  and ranged durations. 76 → 73 → 67 → 61 → 57 → 56 → 55 → **53**. **Every correction made
  the product worse on paper and more honest in the kitchen.**
- ⚠ **DO NOT QUOTE #1911's SQUASH MESSAGE for these figures — it is itself superseded.**
  Its last recorded cost line reads 55 hosts / 52.2%, because the final corrections landed
  after that text was written. **53 was re-measured against merged `main`** by the engine's
  own rule (pair each recipe with a stationless hands-on partner and ask whether
  `bsOrchestrate` actually interleaves), not by a hand-rolled window predicate.
- **Nothing fabricates parallelism.** Every `min` is a duration the step text itself states;
  four recipes that spelled an hour in words ("for one hour") have it written as 60 so the
  parser can see what the cook could always read. No time, method or meaning changed.
- ⚠ **A ranged window is its LOW end.** "12–15 minutes" is 12 — the cook must be back when
  the window *could* end, not when it might.
- ⚠ **Round 5's P1 was MINE** (oyster sauce), and the round-6 claim that **"no gate can
  catch attended aromatics" was REFUTED** — a gate keyed on a different property (the
  uncovered pan) caught three. **"Ungateable" is a claim about ONE gate, not about the
  class.**
- ⚠ **No BACKGROUND hold exists:** a hold blocks its own recipe *and* the one modelled
  burner. **Tuna macros remain an OWNER RULING**, still unresolved.

### 2026-08-18 — A claim is kept by SPECIFYING the ingredient, never by hiding the recipe

**Owner ruling, and it reversed my rounds 3-4 classifications.** Two questions had been
registered as needing a ruling; both came back the other way:

1. *"margarine usually does not contain dairy. So make sure its a brand that does not
   contain dairy."* Margarine is vegetable-oil based; the has-dairy classification was
   over-cautious.
2. *"if someone is cooking a gluten free recipe, just make sure it is stated to use gluten
   free brand/ingredients. maybe offer suggestions on certain brands."* Plus **yes on
   oats**: specify certified gluten-free oats and restore the claim on all four.

So a recipe using an **ambiguous** ingredient — one whose certified or labelled form
genuinely is free of the allergen — **keeps its claim and carries a note**. Four classes:
oats, soy sauce, broth/stock/bouillon, margarine.

- **9 set removals, 14 notes.** ⚠ The scope was first recorded as "~17 recipes" and that
  was wrong: the five broth recipes were **never classified** (they had always claimed
  gluten-free — that is why they were the open question), so they need a note and no set
  change; and three soy-sauce recipes are **held**. Measured off the catalog, not counted
  from the earlier note.
- **`Herbed baked salmon with lemon` reads Pescatarian + Gluten-free + Dairy-free again**,
  which is what the original brief expected before round 4 over-classified it.
- **THE SEQUENCING IS THE WHOLE RISK.** `recipeNeeds` reads a title's ABSENCE from
  `_RECIPE_NOT_GF` as a POSITIVE claim, so a removal landing before the gate understands
  notes re-creates the shipped P1 — telling a coeliac member a recipe is safe — with the
  suite green, because a claim made by omission is invisible to a one-way check. Gate,
  removals and website mirror land in ONE commit.
- **The gate learned the note path.** `GLUTEN` gained `broths?|stocks?|bouillon` — that
  class had **no marker at all**, so the five recipes claiming gluten-free over a generic
  broth were invisible to it. A claim over an ambiguous ingredient now passes only when the
  recipe carries a note for that allergen **and** striking the ambiguous phrase leaves
  nothing still matching — so a note can never wave through `soy sauce and wheat flour`.
  ⚠ The ambiguous classes are deliberately **not** in `SAFE_FORMS`: that list is keyed on
  the phrase alone and would exempt oats catalog-wide, forever, note or no note.
- ⚠ **THREE RECIPES HELD BACK, against the literal ruling.** `Miso-glazed cod with
  greens`, `Beef and broccoli stir-fry` and `Tempeh and broccoli teriyaki` all use soy
  sauce, but each carries a SECOND gluten source no marker sees — white miso, oyster
  sauce, teriyaki sauce, all commonly wheat-fermented. Restoring them would publish a
  gluten-free claim over an ingredient with no note and no gate. Under-claiming costs a
  filter hit; over-claiming is the harm. **Registered for a ruling, not decided.**
- ⚠ **No brands named for broth or margarine.** Oats and soy sauce carry real certified
  products; for the other two the safe form is the LABEL, not a brand, and a wrong brand on
  a coeliac-facing note is a real-world harm. Those degrade to the certification sentence
  alone, which is always correct. Shape is `[[name, region]]`, fillable per market.
- **The old render test would have shipped a crash green.** It sampled two recipes via
  `find(r => !r.by && r.source)` and `find(r => r.by)` — which return
  `Slow-simmered beef pot roast` and `One-pan chicken and rice`, **both note-bearing**. With
  the `|| []` guard removed both sampled recipes render fine while 71 crash. The detail
  render now loops all 85.
- **Never behind a byline.** `tip` renders attributed, so a brand recommendation there would
  come out of a named nutritionist or the USDA. The note is its own unattributed block on
  every surface, and the field is `allergenNotes` for exactly that reason.

### 2026-08-18 — Shape Kitchen 35 → 85: the USDA recipes, credited to their source (#1907 → `f7b9f69ec`)

- **The 50 USDA MyPlate Kitchen recipes are merged.** US federal works, public domain under
  17 USC § 105, every step already rewritten in the catalog's voice. Authored recipes stay
  first so the existing order never shifts. **No migration** — the catalog is a source module.
- **Attribution has ONE definition per surface.** `bsRecipeAttribution` (mobile) /
  `recipeAttribution` (web): an authored recipe carries `by + byRole` and reads "from the
  kitchen of X"; a federal work has **no author** — crediting one to a nutritionist would be a
  fabricated byline — so it carries `source`/`sourceUrl`/`license` and is credited to the
  **source**, linked on web; an uncredited recipe returns `null` and **no surface invents a
  name** — the note/pull-quote renderers and the mobile card render
  **nothing**. `recipes.jsx` is a babel browser script and cannot import, so it carries a
  parity copy and publishes the helper on `window` for the two route files.
- ⚠ **THE CRASH WAS REAL, AND I FIXED THE WRONG FILES FIRST.** A sourced recipe has
  `by: null`, and `recipe.by.toUpperCase()` throws. I fixed three renderers inside
  `recipes.jsx` and reported the crash closed — but `recipes.jsx` holds the data and some
  modal/widget renderers; the components the routes actually **mount** are separate script
  files reading the same global catalog. `recipesPage.jsx:83` took down the All view on the
  first USDA card and `recipeDetailPage.jsx:208` took down every `/recipes/<usda-slug>` page.
  Codex caught it.
- ⚠ **THE LIVE FILTERS MADE A FALSE ALLERGEN CLAIM.** `recipeNeeds` treats **absence** from
  `_RECIPE_NOT_GF` / `_RECIPE_HAS_DAIRY` as a positive claim, so beef stroganoff, cheddar
  macaroni and turkey tetrazzini advertised as gluten-free **and** dairy-free. Not a missing
  tag — the site telling a coeliac member a wheat-noodle casserole is safe. The
  classifications are ported from the catalog module rather than re-derived — 16/16/11 at
  this round; ⚠ **17/17/11 is what actually shipped**, once rounds 3 and 4 below added the
  oats and the margarine.
- **Two more, same root cause:** all 50 website copies ended after `steps` and lost the Pro
  Tip section the detail page promises; and `by || 'Coach'` stamped **`COACH:`** on all 50
  public-domain Kitchen Cards. **Two adjacent sites had that second defect and were not
  reported** — the library record credited the catalog name, and the Shape Kitchen list
  eyebrow rendered a dangling `·` on every USDA row — so the class was swept rather than the
  named site patched.
- ⚠ **THE GUARD I ADDED FOR ALL THAT WAS HOLLOW, AND MY OWN MUTATION TESTING SAID IT WAS
  FINE.** It banned three byline shapes by regex, keyed on identifiers literally named `r` or
  `recipe`; a renderer spelled `item.by.toUpperCase()` recreated the crash with every
  assertion green. Bracket notation, destructuring and a chain split across lines were equally
  invisible. **5/5 mutations killed — all of them shapes the guard was written for.**
- **Widening the regex was not the fix, and that was measured.** Across every file touching
  the catalog, `.by` appears **8 times in the mobile client module and 7 are correct
  non-recipe uses** (a goal's target date, a playlist's author). A wider text rule fires on
  all of them; an exemption list goes stale the first time a new domain lands in that file.
- **So the gate no longer reads source.** `tests/recipe-render.test.mjs` compiles the real
  website pages with the **same transform the deploy uses** (`@babel/preset-react`, classic
  runtime — `scripts/build-newdesign.mjs`) and renders all 85 records through the card plus
  the detail page for a sourced and an authored recipe.
  `tests/kitchen-card-render.test.mjs` does the same for the mobile `BSKitchenCard`, asserting
  a public-domain recipe credits its source and is **never stamped COACH**. A renderer that
  dies on `by: null` now fails however it is spelled **inside a component a test actually
  renders**. ⚠ **That is not every byline.** `kitchen-card-render.test.mjs` renders exactly
  ONE mobile component (`BSKitchenCard`), and the AST byline walk deliberately excludes the
  mobile module — so `bsRecipeLibItem`, `BSRecipeBox` and `BSShapeKitchenRecipe` are gated by
  nothing. Re-introducing the shipped P1 in `BSShapeKitchenRecipe` in its most obvious
  spelling leaves the full suite green. The code is correct today; the **guard** is not
  wall-to-wall, and saying otherwise is the same over-claim this wave was about.
  What remains of the source scan is an
  **AST walk** over the newdesign recipe pages, where `.by` outside the helper is provably
  zero; the mobile module is deliberately **not** text-scanned and says why.
- ⚠ **A COUNT IS NOT A VALUE.** The parity test first compared ingredient *counts* — two lists
  of eight can disagree on every line, and swapping an ingredient for marshmallows passed. It
  now compares the flattened ingredient strings plus `time`, `diet`, `hero`, `macros` and
  `tags`, all rendered and none previously checked. The flattener reproduces all 85 website
  ingredient lists **exactly**, which is confirmation of the rule rather than an assumption.
- **Two authoring rules narrowed + one step split** (the one-timer-per-step rule and the
  scheduling-note rule both over-triggered on legitimate rests/holds), and
  `tests/cook-steps.test.mjs`'s hardcoded three-file source list was widened — putting the 50
  in a new module had hidden all 273 of their steps on mobile while the website copy reported
  them, which reads like a pass.
- ⚠ **THE 50 CANNOT INTERLEAVE IN A PREP SESSION** and that is deliberate: they ship with no
  `_KITCHEN_STEP_META` passive-window overlays, so "cook together" reads unavailable for any
  pair of them. An overlay's `min` must be a duration the step text itself states; the
  generator gets 273 steps to 22 candidates but **~30% get hands-off-ness or station wrong**,
  so it must be a human-confirmation queue, never auto-applied. **Registered, not started.**
- ⚠ **ROUND 3 — THE DATA ITSELF MADE A FALSE ALLERGEN CLAIM, AND MY OWN SET WAS INTERNALLY
  INCONSISTENT.** Four recipes contain oats; **two were classified not-gluten-free and two
  advertised gluten-free** — one ingredient, two answers, and the split ran through *both*
  sets (USDA `Blueberry baked oats` correct, `Maple banana oatmeal` not; authored
  `Overnight oats` correct, `Date and almond energy bites` not). Oats are not gluten-free
  unless certified — standard milling shares a line with wheat. ⚠ The authored one is
  **PRE-EXISTING**, not introduced by this merge; fixed here anyway, because an allergen
  claim is not something to leave live once found.
- **So the rule is gated, not the instance.** `tests/recipe-allergen-consistency.test.mjs`
  reads the **ingredients** and requires every allergen-bearing recipe to be either classified
  or listed as a known-safe form **with a reason**. ⚠ **It fails closed only INSIDE its own
  vocabulary** — two fixed marker lists (**28** gluten words, 13 dairy). A match that is not on
  the safe-form list breaks the build; an allergen-bearing ingredient the markers do not name
  is never seen at all, which is fail-OPEN. Injected one at a time into a recipe advertising
  both claims, `wheat flour` is caught, while `semolina`, `spelt`, `ghee`, `kefir` and
  `mascarpone` each pass with the full suite green. Since absence from the sets IS the
  positive claim, an unrecognised allergen still ships as a safety claim. **Widening the
  vocabulary is open work, not done work.** It earned its keep while being written: it flagged
  `no-salt-added pasta sauce` in the noodle-free lasagna, a tomato sauce *for* pasta rather
  than pasta, recorded as a safe form with that reasoning rather than by loosening the marker.
  It correctly stayed quiet on corn tortillas, **butter** lettuce, **coconut** milk and
  **peanut** butter — the four safe forms the audit actually reaches; deleting any one of
  them fails the suite with a named recipe. ⚠ **Two further entries are exercised by nothing**:
  `vegan parmesan` and `cocoa butter` match no ingredient in the catalog (the only
  `vegan parmesan` in the repo is in a *step* of `Lentil bolognese`, and this gate reads
  ingredients). An earlier draft listed `vegan parmesan` as a case the guard got right — it
  never saw it. Crediting a guard with a decision it never made is the same class of
  over-claim as the ones above.
- **Round 3 also caught the copy and the role.** The Recipes hero still told visitors *"Every
  recipe is built by a Shape professional"*, false for 50 of 85 the moment this landed; and
  the parity gate compared `by` but not `byRole`, which both surfaces render beside it — so a
  nutritionist could be labelled a dietician with every gate green.
- ⚠ **ROUND 4 — GENERIC MARGARINE IS NOT RELIABLY DAIRY-FREE**, same class as the oats
  (milk solids and whey are common), so `Herbed baked salmon with lemon` is classified.
  ⚠ **This CONTRADICTS the incoming brief**, which named that recipe as a spot-check expected
  to read *"Pescatarian + Gluten-free + Dairy-free"*. Taken in the **safe direction** —
  under-claiming costs a member a filter hit, over-claiming is the harm — and **flagged for
  the owner** rather than silently overriding a stated expectation.
- ⚠ **AND ROUND 4'S SECOND FINDING WAS A DEFECT IN THE GUARD ROUND 3 ADDED.** The safe-form
  exemption was **whole-line**: one safe phrase anywhere in an ingredient waved the entire line
  through **both** audits, so `corn tortillas with wheat flour` cleared gluten and
  `butter lettuce with milk dressing` cleared dairy. Each form is now tagged with the allergen
  it exempts and neutralises **only the phrase it matches**; the audit re-reads the residue.
- ⚠ **REGISTERED, NOT CHANGED — NEEDS AN OWNER RULING.** **Five** recipes advertise
  gluten-free over a generic **broth, stock or bouillon** (`One-pan chicken and rice`,
  `Red lentil and spinach dahl`, `Turkey chili verde`, `Slow-simmered beef pot roast`,
  `Black skillet beef with kale and red potatoes`). ⚠ **An earlier draft said FOUR and omitted
  `Turkey chili verde`**, which advertises gluten-free over `1 cup chicken stock` — the same
  commercial product class the rationale below targets. The enumeration was the defect, not
  the class boundary, and it matters because this list is the only place the class is tracked:
  the allergen guard has **no broth/stock/bouillon marker at all**, so ruling on four would
  leave the fifth still making the claim.
  Commercial bouillon frequently contains wheat, so it is arguably the oats class — but unlike
  oats there is no universal rule, it would hide five recipes from the filter, and three are
  pre-existing authored recipes. That is a nutrition call, not an implementation one. Soy
  sauce, by contrast, is already handled correctly: all eight recipes using it are not-GF.
- ⚠ **A METHOD NOTE THAT NEARLY FOOLED ME.** The first attempt to prove the whole-line bug used
  a stale anchor, injected nothing, and printed `0` for **both** arms — which reads exactly
  like *"the bug is not real"*. **An identical or saturated result across both arms of a
  mutation test is a broken method until proven otherwise.** Re-run properly, the poisoned
  ingredient **fails** the shipped guard and **passes silently** on the reverted one.
- Mutation-tested throughout (9/9 on the render/parity guards; the allergen audit killed by
  removing the oats classification), with unmutated sanity cases reading `fail 0` at both ends
  of every batch. **The parity gate also caught the website drifting on its own**, the moment
  the mobile classification changed and before `recipes.jsx` was touched — real drift, not an
  invented mutation. Suite **1997/1997**; `tsc` clean; CI green and **Codex clean on
  `75961ce64`** (👍 + *"Didn't find any major issues"*, reviewed-commit stamp matching the
  head). Four Codex rounds; branch `claude/usda-recipes` kept.

### 2026-08-18 — Cook Mode labels every timer (#1906 → `7c4e49ecb`)

- **A step with two waits rendered two identical chips.** Each timer now carries the step's own
  words — "Step 6 · bake" beside "Step 6 · rest" — so a cook can tell mid-recipe which timer
  is which.
- **`bsStepGists(text, ingredients)` is the set-level chokepoint.** Uniqueness across a step's
  timers cannot be guaranteed one timer at a time, so the per-timer `bsStepGist` is only ever
  called through it, with the labels already emitted passed in as `avoid`.
- **The parser anchors the action on BOTH sides.** A label is derived from the span between
  the previous timer's end and the next timer's start, so a later action can never supply the
  words for an earlier wait.
- ⚠ **"198 STEPS, 0 REGRESSIONS" WAS CITED FOR FIVE ROUNDS ON A CORPUS WITH ZERO MULTI-TIMER
  STEPS.** The catalog could not exhibit the defect being fixed, so the number measured
  nothing. `tests/cook-multi-timer-sweep.test.mjs` now *generates* the surface and asserts the
  invariants (correct food · ≤2 words · no digits/punctuation · never empty · no two identical
  rows on one step · **reorder-invariance**). ⚠ And reorder-invariance proves a label is not
  list-driven — **not that it is right**; it passed on a wrong answer during the wave.
- ⚠ **A HOLDOUT IS WORTH MORE THAN A TUNED CORPUS.** The 50 USDA recipes were measured blind
  before merge: 0 blank, 0 over-2-words, 0 duplicate rows. Strongest evidence of the wave,
  precisely because nothing was tuned against it.
- **Rejected along the way, with evidence:** distance-to-the-number ranking (plausible, broke
  4 catalog labels — `chicken breast` → `olive oil`; ranking is earliest-in-text, unified with
  admission); and dropping comma-splitting entirely (passed all 13 adversarial cases *and* the
  marquee turkey case, but moved **32 of 96** catalog labels with real regressions — scoped to
  widen-only-when-empty, 4 of 96, all improvements).
- ⚠ **REGEX ESCAPES COLLAPSE THROUGH HEREDOC LAYERS — EIGHT OCCURRENCES IN ONE DAY.** `\b`
  becomes a BACKSPACE byte, `\s` becomes the letter `s`; the result parses, typechecks and
  passes the full suite while matching nothing. It had already silently disabled a live
  assertion in `tests/local-scrub-sync.test.mjs` (a BACKSPACE inside a negated match made it
  always true). Build with `chr(92)` or raw strings and **verify with `cat -v`**;
  `tests/source-no-control-bytes.test.mjs` now catches the class, with its file list derived
  from `git ls-files` after Codex called the first hand-listed version hollow.
- ⚠ **`git checkout --` DESTROYED UNCOMMITTED WORK TWICE IN ONE DAY**, on a rule already
  written down — the second time wiping both round-10 fixes. Mutation-test with
  `cp file file.bak`, never git, and **commit before mutation-testing**.
- 13 Codex rounds, 12 of which found something. Branch kept. Suite **1983/1983** — the figure
  this PR's own merge commit already carries (`git show 7c4e49ecb` ends *"Suite 1983. Codex
  clean on ac3fcd099."*), and `ac3fcd099` is tree-identical to the merge and sits on
  `claude/cook-timer-labels`. ⚠ **An earlier draft of this bullet RETRACTED that number**,
  claiming it was measured on the USDA branch and would be a carried-forward figure. Both
  halves were false: it is this PR's own head, and #1907 then added exactly 14 tests in four
  new files, which is why the entry above reads **1997** for `f7b9f69ec`. **Over-correction is
  its own defect** — deleting a correctly-scoped number does not play safe, it destroys a
  measurement and sends the next reader off to re-derive what was already recorded.

### 2026-08-17 — deps: both high Dependabot alerts (nanoid) + a stale override floor Dependabot never raised (#1903 → `2fd1c1474`)

- **Alerts #19 and #20 were the SAME advisory, counted once per lockfile** —
  `GHSA-2v37-7h3g-55p8`, **`nanoid < 3.3.18`**, **runtime** scope, arriving transitively via
  `postcss` (itself already overridden) in both trees at `3.3.16`. Pinned `^3.3.18` in both
  `package.json` overrides blocks; **exactly one package changed per tree.**
- ⚠ **RE-CHECK THE WHOLE `overrides` BLOCK WHENEVER YOU TOUCH DEPS — an override pins a FLOOR,
  and floors go stale.** The rule was already written down here (2026-07-26); this is the run
  that proves it pays. Doing it surfaced a **second high that Dependabot never alerted on**:
  `brace-expansion` was pinned `^5.0.8`, but `GHSA-rgw5-rvv9-x895` covers **`4.0.0 - 5.0.8`** —
  **the pin itself had aged into the vulnerable range.** Bumped to `^5.0.9`.
  ⚠ **That package has now needed re-pinning TWICE** (2026-07-21 for CVE-2026-13149, then
  this), which is the concrete evidence for the rule rather than a hypothetical.
- ⚠ **A dev-scope high never appears in the Dependabot alert list.** The alerts were
  runtime-only, so `npm audit --omit=dev` reporting clean would have hidden the
  `brace-expansion` one entirely. **Run `npm audit` BOTH ways.** Final state: **0
  vulnerabilities in both trees, runtime and dev**, with every remaining override verified to
  resolve at or above its pin (`postcss` 8.5.23 · `sharp` 0.35.3 · `qs` 6.15.2 · `tar` 7.5.22).
- **Verified past the lockfiles, because a dep patch can compile and then misbehave:**
  `tsc --noEmit` exit 0 · `next build` exit 0 **with `ƒ Proxy (Middleware)` present** (the
  standing proof the edge/membership-gate chain still bundles) · mobile Vite build exit 0.
  No source changed; same-major patch bumps only. CI green (Web · Mobile · gitleaks · Tests);
  Codex clean. ⚠ Dependabot's alert list lags the fix — confirm against the **lockfile on
  `main`**, not the alert count.

### 2026-08-17 — Five defects in the day's own records, and a cell that could never be right (#1901 → `7ffec75d6f`)

- A review of `docs/HANDOFF-2026-08-17.md` **against the code** rather than as prose.
  Records-only; no behaviour change. Nine load-bearing claims verified accurate — the
  `.slice(-7)` residual, the floor-only vitals window, the orphaned `/api/ai/weekly-readout`,
  the notify cron ignoring the opt-out, `GATED_API_PREFIXES` at seven, `refuseKnownMinor`'s
  single caller. Five were wrong.
- ⚠ **THE ONE THAT COSTS THE NEXT SESSION A ROUND: the `avgHydrationL` residual named the
  wrong file.** It read *"`dashBusiness.jsx`'s `DbzOutcomesZone` computes `avgHydrationL`"* —
  but that file contains **zero** hydration references. The compute is **server-side** at
  `src/app/api/nutritionist/analytics/route.ts:196` (typed at `:147`); `DbzOutcomesZone`
  (`:338`) is the consumer that *drops* it. As written, a session greps `dashBusiness.jsx`,
  finds nothing, and concludes it is already fixed. The identical wording was duplicated in
  `src/lib/warroom.ts`, so it was wrong in both places.
- ⚠ **A CELL THAT CANNOT EVER BE RIGHT, AND THREE ROUNDS PROVING IT.** The snapshot's `main`
  SHA was stale. The correction pinned `7b087c203` — wrong the instant the PR squashed,
  because **a handoff is committed before its own squash**. The fix for *that* said
  `git rev-parse --short HEAD` — wrong because a handoff is read from a `claude/*` checkout,
  so `HEAD` reports the branch (measured: `HEAD` `0687a6f90` vs `main` `7b087c203`). Codex
  caught all three. A flat findings curve on ONE location is this repo's own change-approach
  signal, so the cell now records **no SHA at all** — only how to read it
  (`git fetch origin main && git rev-parse --short origin/main`) and anchors that do not move.
- ⚠ **"NOTHING IN FLIGHT" HAD NO SOUND PROOF, IN EITHER VERSION.** The original prescribed
  `git diff --stat origin/main <branch>` — a two-dot diff reports the NET difference in both
  directions, so it cannot tell *behind `main`* from *carrying unmerged work*. The replacement
  ("the merged SHA is the proof") was unsound differently: a merged SHA proves the PR landed,
  not that its **kept** branch stayed quiet, and the shipped list was not exhaustive (#1900 was
  missing). **Measured, and now recorded as the reason branch state is useless here:**
  `claude/radio-legal-gates` is **45** commits-not-on-`main` while `claude/checkin-optional` is
  **0** — same wave, both fully landed; the count tracks only **merge style** (#1895 was a real
  merge, the rest squashes). The row now cites the **open-PR list**, the only authoritative
  inventory. Also corrected: the branch list omitted #1900's branch and silently mixed in three
  branches that exist **locally only**.
- ⚠ **THE RECORDED SUITE COUNT OF 1855 WAS NEVER A MEASUREMENT OF THIS TREE — it matches no
  head in the wave.** Measured **1927/1927**, and the archaeology is arithmetic, not assertion:
  `tests/` is byte-identical between `ba0449c2b` and now (so the wave close was also **1927**),
  and the only `tests/` change between #1897 and that merge was one added file worth **17**
  subtests (so #1897's head was **1910**). Neither is 1855 — it was carried forward from
  somewhere else and re-stated three times (#1896, #1897, the snapshot) without a re-run.
  ⚠ **A trap that made this hard to audit: the shipped list is in PR-NUMBER order, not MERGE
  order** — `git merge-base --is-ancestor` confirms #1895's merge landed *after* #1897, so
  "since `ba0449c2b`" is a later cut-off than the PR numbering implies. **Re-run `npm test`;
  never carry a suite figure forward.**
- **Both #1888 migrations RE-PROVEN behaviourally** (the records claimed it; this confirmed it
  independently). Live catalog carries `provider_applications.dob` and a `set_over_18()` whose
  body freezes both columns; then, in a rolled-back transaction impersonating the row's own
  signed-in member (RLS admitted the write), a backdate of `created_at` **and** a rewrite of
  `date_of_birth` to a minor were **both reverted**, `over_18` unpoisoned, nothing persisted.
- **The durable lesson: a records PR is not exempt from the rules its own subject matter
  teaches.** Every defect here is one this WORKLOG already warns about — a stale claim, an
  unsound verification method, a location that is not where the code lives, and a summary
  figure nobody re-measured. Suite **1927/1927**; CI green (Web · Mobile · gitleaks · Tests);
  Codex clean on the final head after three rounds. Branch kept.

### 2026-08-17 — Legal pages, Radio licensing, privacy mechanisms and the 18+ age gate — MERGED (#1888 → `2f6c38b6c`)

- **The wave that ran from round 9 to round 22 is on `main`.** Everything the two 2026-08-16
  entries below describe shipped with it; the round-by-round state, the honest limits, and
  every owner/counsel item live in **[`docs/HANDOFF-2026-08-16b.md`](HANDOFF-2026-08-16b.md)**
  (note the `b`) and are **unchanged by the merge**. Legal copy remains **DRAFT pending
  counsel**; `privacy@` / `safety@theshapecommunity.com` must exist before ship.

- ⚠ **ROUND 19 — THE GUARD I WROTE IN ROUND 18 TO STOP ENUMERATION WAS ITSELF AN
  ENUMERATION.** It hand-listed four legal surfaces and omitted `health-data-privacy.html`,
  whose SS05 still said processors operate "under contract" — while naming connected
  wearables among them, which the spec lists as "per provider terms", i.e. not our
  processors at all. Fixed structurally rather than by adding the missing entry: the ban runs
  over a **DERIVED** set — every page that actually makes a transfer/subprocessor claim,
  discovered by reading the directory — so a new or renamed page is covered the moment it
  makes such a claim, with nobody remembering to register it. Coverage **4 → 11 surfaces**,
  and a guard-the-guard test fails if discovery ever matches nothing, so the bans cannot pass
  vacuously. The same round stopped the table presenting eight vendors' safeguards as held
  when they are intended.

- ⚠ **ROUND 20 — A SCOPE PREDICATE NARROWER THAN THE BAN IT GATED.** A page could carry a
  banned claim, fail the predicate, and never be checked. Removed the predicate outright
  rather than widening it (verified free of false positives across all 128 files), and the
  pending-mark check went from an **aggregate count** — which enforces nothing per row, so
  one unmarked vendor hides behind seven marked ones — to **row-scoped**, with an explicit
  empty `VERIFIED_HELD` allowlist to add a vendor to only with evidence. Same round, found by
  auditing **egress** rather than by review: **SoundHelix** serves sample audio on the legacy
  coach preview pages, so a visitor's browser sends its IP to a third party we never listed —
  the same class as Google Fonts and unpkg, which are disclosed for exactly that reason. All
  28 third-party hosts the code reaches are now disclosed.

- ⚠ **AND ROUND 20'S FIX WAS LOST BEFORE IT REACHED THE COMMIT.** Mutation-testing with
  `git checkout --` while the guard rewrite was still **uncommitted** reverted it to the old
  version; the commit then had nothing to include and reported *"1 file changed, 1
  insertion(+)"* — a line I produced and did not question — while its message described guard
  changes that were not in the diff. **Both rules this repo already carries were broken in one
  step**: commit before mutation-testing, and read the diff back. Re-applied in `fab8af860`;
  the suite going 1654 → 1771 is the evidence the widening was real that time.

- ⚠ **ROUND 21 — `/auth/callback` IS NOT SIGNUP-ONLY.** Password resets, magic links and
  email-change confirmations all exchange a code there carrying **SIGNUP metadata**, and round
  12's unconditional upsert wrote it back on every visit — **reverting a renamed member and
  collapsing a dual-role coach's `roles` to their single signup role.** Each field is now
  seeded only when the row lacks it (as `date_of_birth` already was), the select widened so
  the upsert preserves what it reads, and the no-row case still writes, so round 12's fix
  stands. Same round: the page walk **recurses** instead of reading a hand-written
  two-directory list that omitted the **54 live pages in `public/mobile`** — latent (a scan of
  all 182 files finds zero banned claims there), but a typed list goes blind the moment a page
  lands outside it.

- ⚠ **ROUND 22 — A FAILED PROVISIONING WRITE IS A LOCKOUT, AND THE REQUIRED COLUMN WAS NOT
  THE ONE REVIEW NAMED.** Codex named `email`; read from the **LIVE catalog** rather than the
  migration files, that column is **nullable** and the required one is **`role` — NOT NULL
  with no default**. So an INSERT omitting it fails **23502**, no `profiles` row is created,
  and the round-12 absence-refuses policy then refuses that member at **every** gated surface.
  Conditioning the role write on signup metadata left us one missing `meta.role` from that.
  The create path now always writes a role, which **simplifies** the guard rather than adding
  to it — NOT NULL means any existing row already has one, so `!existing` is the whole
  condition. ⚠ The identical hazard lived at a **second** provisioning site Codex did not
  name — `public/supabase.js`'s legacy sign-in path — and was fixed there too.

- ⚠ **THE LAST DEFECT WAS FOUND BY SELF-REVIEW RATHER THAN A ROUND, AND IT WAS MINE.**
  `maybeSingle()` **RESOLVES** `{data:null,error}` on a transient failure or an RLS refusal —
  it does not throw — and the callback discarded the error; `getProfile()` likewise returns
  null for **both** "no row" and "the read errored". So an unreadable read looked identical to
  an absent row, took the create path, and — the write being an upsert on `id` — **UPDATEd the
  existing row**: a coach demoted to `client` with `roles` collapsed to one. That is round
  21's overwrite defect re-entering through the **error path**, and round 22 had *widened* it,
  since the create path no longer needed `meta.role` present to do damage. Both surfaces now
  provision only when the row's state is actually known; an unreadable read writes nothing,
  the next visit tries again, and the gates refuse an unproven row meanwhile — the safe
  direction to fail.

- **The compliance spec was corrected in the same wave.** It still described the 18+ gate as
  future work done by **self-declaration**. It is shipped: DOB collected and 18+-validated at
  every signup and application surface, `mustRefuseForAge()` as the read-time chokepoint that
  refuses on **absence** of proof, anywhere-on-Earth day derivation, server-side re-validation
  in `/api/apply`, and the `date_of_birth` / `created_at` freeze applied and **behaviourally**
  verified against production. **A stale spec row is a real gap when counsel reads the spec as
  the current state.** The self-assertion residual is stated, not dropped.

- Both migrations were applied + verified live before the merge. Suite **1834/1834** on the
  final head (`21c22e084`); `tsc` exit 0; CI green. Branch `claude/radio-legal-gates` **kept**
  — its worktree `C:/Users/cperr/shape-legalgate-wt` is now behind `main`.

### 2026-08-17 — The check-in engine: the spec, an optional check-in, and vitals as engine input (#1893 → `520630e33` · #1894 → `5268ef80c` · #1895 → `ba0449c2b` · #1896 → `915c20a0a`)

- **The daily gauges stop being a screen and become engine input.** Spec
  `docs/superpowers/specs/2026-08-17-checkin-engine-design.md` (#1893, one Codex round folded
  in — correlation catalog, precise opt-out semantics, a server-side readout cache, the
  hydration-target source): **§A** engine flags · **§B** the coach case file (shipped as
  #1897, entry below) · **§C** the client weekly readout · **§D** the optional check-in.
  ⚠ **§C IS NOT BUILT.** `POST /api/ai/weekly-readout` is still orphaned — it has no entry
  point — and wiring it needs `SNAPSHOT_FIELDS` **and** `CORRELATION_PAIRS` / `SnapshotPoint`
  extended in the **same** PR, or both the model evidence and the deterministic fallback
  silently omit the new fields.

- **§D — THE CHECK-IN IS OPTIONAL (#1895).** Settings → Preferences → **Daily check-in**,
  default ON. OFF: the home CHECK-IN DUE bulletin and the logged-residue row render nothing,
  and a quiet **Check-in** index row — never "due", no done-tick — keeps the check-in page and
  the hydration quick-add reachable. ON is byte-identical to before. Stored in the existing
  `user_goals('client_settings')` doc through its read-merge-write chokepoint (**no
  migration**), mirrored **per-uid** in localStorage so Home's first paint never flashes, and
  re-rendered live via a window event because Settings overlays a still-mounted Home. Two
  settings keys ×13 locales.

- ⚠ **THREE CODEX ROUNDS ON #1895, AND EVERY ONE WAS THE SAME CLASS: A READ RACING A WRITE.**
  - **Round 1 — a can't-know read was coerced into a fact.** `getUserGoals` resolves **NULL**
    for every can't-know case (no backend, not signed in, query error — it never rejects) and
    `{}` for a genuinely absent row. The hydrate's `(s && …) ? s : {}` flattened the two, so a
    **failed** read converged a valid OFF mirror back to ON. Same round: the mirror moved to
    **per-uid keys**, because on a shared device account B's default-ON hydrate deleted
    account A's OFF record.
  - **Round 2 — the guard could not reach the second reader.** `BSSettings` runs its **own**
    `getUserGoals('client_settings')` read, separate from the hook's, so the hook's generation
    guard could not protect it: a read that started before the member toggled applied its
    stale value and undid the fresh choice on a still-mounted Home. The pane now carries its
    own edit generation, and a stale response has the edited key **removed from the patch**
    while every other pref still converges.
  - **Round 3 — the blast radius was the whole pane, not the row review named.**
    `saveUserGoals` **UPSERTS the whole `client_settings` blob**, so a whole-doc save issued
    before the pane's hydrate landed published `PREF_DEFAULTS` over the member's stored units,
    privacy, meal times and phases. Every row is interactive from the first frame, so **the
    guard went at the writer**: with no real document known the pane **DECLINES to write**
    rather than publishing defaults, and `editedRef` generalises the round-2 stale-hydrate
    guard to every key.

- **§A — VITALS JOIN THE ENGINE (#1896).** The record gains a vitals leg
  (energy / hunger / hydration / rested) from the **same cached progress response** sleep
  already uses; three **absence-gated** rules ride below `sleep_low` — `energy_low` (34),
  `hunger_high` (33), `hydration_low` (32) — client-only by owner ruling, and **no target
  means the rule can never fire**. The roster read widens to energy/hunger/hydration, the
  notify snapshot carries the leg **verbatim** so the hourly cron re-evaluates it, and Home +
  the telegram gain lever heads for the three new levers. **`selfRecord` drops the whole leg
  the moment the check-in pref is off** — tolerant of the pref module being absent, so either
  merge order stood alone.
  ⚠ **THE OPT-OUT IS IMMEDIATE ON THE CLIENT ONLY, AND THE CODE COMMENT OVER-CLAIMS IT.**
  `selfRecord`'s own comment says the persisted `notify_snapshot` goes quiet "at once"; it
  does not. `bsDailyCheckinApply` writes the per-uid mirror and dispatches `shape:checkinPref`
  — that is all. Nothing rewrites or deletes the stored snapshot, and
  `/api/ai/notify/cron` reads `user_goals` rows of kind `notify_snapshot` **without consulting
  `client_settings.dailyCheckin`**. So a member who opts out and never reopens the app keeps a
  vitals-bearing snapshot the cron will keep acting on. **Registered, not fixed** — the honest
  fix is either rewriting the snapshot on toggle or teaching the cron the pref, and neither
  belongs in a records PR.

- ⚠ **`.slice(-7)` TOOK THE LAST 7 OBSERVATIONS, NOT THE LAST 7 DAYS.**
  `/api/client/progress` returns up to 400 chronological snapshots with **no recency filter**,
  so three low-energy readings from **months** ago kept satisfying `n >= 3` and fired a "this
  week" directive — and a persisted `notify_snapshot` — **indefinitely**. Now filtered on a
  lexicographic `YYYY-MM-DD` cutoff built from **LOCAL** date parts (matching how
  `snapshot_date` is written), and **a point whose date cannot be proven is DROPPED**: recency
  we cannot prove is absence, which under-fires rather than over-fires. The 7-cap stays so a
  duplicated date cannot widen the average it claims to be.
  ⚠ **The coach half was missed on the first pass** and fixed in round 2: the roster route
  queried 14 days and averaged the last 7 **LOGGED** values, so readings 8–14 days old raised
  a coach flag the member's own engine already treated as stale. The UTC-vs-member-timezone
  residual (one boundary day, under-firing west of UTC) is documented at the seam.
  ⚠ **The identical staleness in `sleepRecoveryFromProgress` is REGISTERED, NOT FIXED** — it
  predates this wave and changing it would alter shipped `sleep_low` firing behaviour.

- ⚠ **A COMMENT CLAIMED A MECHANISM THE CODE DID NOT HAVE.** `/api/client/hydration`
  substituted `DEFAULT_TARGET_L` (3.0) for an unset target, so the engine's absence gate could
  **never** engage — while the comment at the call site said "a failed read means no target".
  The route now returns `targetStoredL` (null when unset) alongside the display-defaulted
  `targetL`, and the engine passes the stored one.

- ⚠ **`hunger_high` ESCALATED THE WRONG COACH.** It is nutrition-owned but was pushed for
  every role, and severity (`flags.length >= 2` → red) is computed **BEFORE** `readOnlyFlags`
  tags a non-owner's flag — so a **trainer turned red on a nutritionist's flag**. It now skips
  the training discipline in `evaluateClient` and joins its nutrition siblings in
  `readOnlyFlags`: the trainer still **sees** it as routed context, it just no longer counts
  toward their severity. The member's own view keeps it, or its client lever would be
  unreachable.

- **#1894 — the Terrain ridge's next-tier label collided with the summit flag** (owner
  screenshot: cream ink at 0.55 alpha over the heat-colored flag, unreadable — the `F` visible
  and the rest blocked). ⚠ **The first fix was a fixed 34px inset**, which only cleared the
  flag while the ridge was ≤510px wide — landscape is enabled in `Info.plist` and native
  `BSPhone` is `100vw`, so wider layouts re-overlapped. The flag's left edge always sits
  **6.67% from the right** (`preserveAspectRatio='none'` stretches x with width), so the label
  pins at `calc(6.67% + 6px)` — clear at any width.

- **Registered, not built:** §C the weekly readout (above) · **the member-path future-date
  ceiling** — `vitalsFromProgress` has a floor only, so the coach chokepoint does not cover
  the member engine · **the opt-out's persisted-snapshot residual** (above) · the
  `sleepRecoveryFromProgress` window (above) · `dashBusiness.jsx`'s `DbzOutcomesZone` computes
  `avgHydrationL` per client and never renders it (render it or delete the compute) ·
  energy/hunger joining the client Progress trend tabs.

- **No migration anywhere in this wave** — every field already existed on
  `daily_health_snapshot` and `user_goals`. Suite **1855** by the end of the day.

### 2026-08-17 — The coach reads a member's daily vitals on the Case File (#1897 → `249c6c6f3`)

- **PR B of the check-in engine** (spec `docs/superpowers/specs/2026-08-17-checkin-engine-design.md`
  §3B, merged in #1893; the client-side engine is the sibling PR #1896). `daily_health_snapshot`
  reaches the Case File through `/api/clients/[id]/shared-overview`: energy, hunger, hydration,
  sleep quality/hours/efficiency, resting HR, HRV and stage minutes.

- ⚠ **HONEST-ABSENT IS THE WHOLE CONTRACT, and the fabrication class is specific.** `Number(null)`
  and `Number('')` are both finite **0**, so an averaging leg that coerces without checking
  manufactures a 0/10 gauge out of data that does not exist. A metric renders only when it carries
  a real finite average — never a zero, never a dash standing in for a reading.

- ⚠ **DAILY vitals and the WEEKLY CHECK-IN are different tables on different cadences**
  (`daily_health_snapshot` vs `client_checkins.ratings`). Every label reads **`DAILY … 7D`**
  specifically so a coach can never conflate the two. The 7D window is seven **CALENDAR** days
  (today−6 … today, UTC, inclusive), compared **lexicographically** against ISO `YYYY-MM-DD` —
  exact, and needs no date maths.

- ⚠ **A FUTURE-DATED SNAPSHOT WAS SERVED FOREVER, AND THE WINDOW WAS ONLY ONE OF FOUR VICTIMS.**
  `/api/client/checkin` takes the day from the **REQUEST**, so a row can carry any syntactically
  valid `YYYY-MM-DD` — including `2099-01-01`. The vitals window had a **floor only**, so such a
  row cleared it indefinitely. But the route fetches newest-first with `limit 30`, so the same row
  was **also** the member's `latest` sleep, their current **RESTED** rating, and a readiness input,
  and it crowded real days out of the fetch. Review named the window; the rule was wider.
  **Fixed at the CHOKEPOINT** — the route drops future-dated rows once, right after the fetch,
  before any leg reads them; `bsVitalsLeg` keeps its own ceiling because that module is exported
  and tested independently.
  ⚠ **The ceiling is TOMORROW, not today**: `snapshot_date` is the member's **LOCAL** day, so a
  member ahead of UTC legitimately writes one — the same one-day boundary tolerance the window
  already documents. Beyond that is not a timezone artifact.

- ⚠ **THE TWO REDACTION FINDINGS WERE ONE DEFECT.** A **vitals-only** member kept the
  `SLEEP · RECOVERY` heading and got a device-sync failure printed **above their real daily
  gauges**; a **rating-only** member got `DAILY CHECK-IN · NOT ON RECORD` directly under a RESTED
  value the card had *just rendered*. The cause was structural, not two bugs: the heading, the
  measured cells and both redact lines each decided **independently** whether they had anything to
  say, so every combination of (device, RESTED, vitals) had to be patched in three places. The
  presence model is now derived **ONCE** and all three blocks read it. **The distinction it
  encodes: only MEASURED data may claim a sync; only ENTERED data may be called a check-in.**
  The web surface (`coachClientDetail.jsx:679`) already behaved this way — this brings mobile in
  line rather than inventing a second rule.

- Also corrected a stale comment on the route's vitals block still describing the pre-round-1
  "7 most recent populated rows" window.

- ⚠ **MERGE-GATE DEVIATION, OWNER-RULED 2026-08-17: the Codex gate was WAIVED on this PR.**
  Three review rounds had landed; CI was green on the final head and all three round-3 threads
  were answered, but Codex had not verdicted on `34fd83dfd` when the owner called it. **PR-scoped**
  — the standing gate (CI green **and** Codex clean on the final head) is unchanged on every other
  PR. The cost lesson is the durable one, and it is the same one #1845 recorded: rounds 1→3 each
  found defects **adjacent to the previous fix** rather than new ground, which is the flat-curve
  signal to change approach instead of patching again. Round 3 did — two of its three fixes moved
  the rule to the chokepoint rather than patching the site that was named — but a waived gate means
  that change was never independently confirmed.

- Suite **1855/1855** · `tsc --noEmit` clean · CI green on the final head (Web · Mobile · gitleaks ·
  Tests · debug APK) · all four touched files LF with zero NUL bytes. Branch `claude/checkin-casefile`
  **kept** and re-synced to `main`. **Open:** the OWNER on-device pass — a coach opening the Case
  File for a device-synced member, a vitals-only member, and a rating-only member, confirming no
  fabricated 0/10 gauge and no contradictory redaction line in any of the three.

### 2026-08-16 — Cross-tab sign-out + an owner-scoped career award: the two shared-device residuals close (#1891 → `17752b901`)

- Closes the two residuals the 2026-08-15 sign-out wave **documented but did not fix**. Neither
  is new scope — both are that wave's own review findings, written down at the time as unbuilt.
- **Cross-tab sign-out.** `sessionStorage` is per tab and in-memory state is per document, so
  signing out scrubbed and reloaded only the tab it ran in; a sibling tab kept
  `shapeLiveWorkout`/`shapeLiveWorkoutResult` and a signed-in session's worth of state until
  someone closed it. There was **no** `onAuthStateChange`, `storage` or `SIGNED_OUT` handler
  anywhere in source. The scrub is already the chokepoint every sign-out path calls, so it
  stamps **`shape.signedOutAt` LAST** — after the sweeps that would otherwise remove the
  signal — **with a nonce**, because `storage` fires only on a *changed* value and two
  sign-outs in the same millisecond would be silent with a bare `Date.now()`. All four
  surfaces listen: `pageShell.jsx` + `supabase.js` (classic scripts sharing ONE install guard,
  so a page loading both cannot scrub and reload twice), `iosAppBroadsheetMain.jsx`, and
  `SignOutButton.tsx` for the Next dashboard. ⚠ **Listeners scrub with `broadcast:false`, and
  that suppression is load-bearing** — a sibling that re-stamped would echo the event back and
  the tabs would scrub each other in a loop.
- ⚠ **`shape.careerAwardPending` was a cross-account defect, not a durability feature.** It held
  a **bare post id** replayed for whoever was signed in; `award_work_milestone` matches
  `author_id = auth.uid()`, so a different account got `{granted:false,'not_a_milestone'}` — a
  **successful** response, not an error — and the catch-up removed the key on any non-error. So
  A signs out, B signs in, and **B's session submitted A's post id under B's identity and then
  silently destroyed A's retry**. Keeping the key did not preserve A's award; it guaranteed its
  loss. Now `{uid, postId}`, replayed only on a uid match; an unattributable legacy record is
  **dropped** rather than replayed under an arbitrary account. Deletion is fixed too: only
  `'unauthenticated'` is transient, and the clear matches **both** uid and postId, so a success
  for post Y cannot delete a pending retry for post X.
- ⚠ **The web twin in `dashboardCommunity.jsx` carried the same defect and had no signed-in
  check at all** — review named only the mobile copy. **The contrast with the sibling queue is
  why this was a defect and not an accepted trade-off:** `drainAssignmentQueue()` drops
  client-side owner partitioning *on purpose* and is safe because `publish_client_week`
  re-verifies server-side **and the refusal surfaces**. This path had neither property.
- 15 files, +1453/−62. Suite green; CI green on the final head.

### 2026-08-16 — The 18+ cutoff clamps like Postgres; the gate's own coverage claims corrected (#1888 → `2f6c38b6c`)

- CI is green on the head (Web · Mobile · gitleaks · Tests) and the DOB freeze migration is
  applied + behaviourally verified on production. **Codex round 9 returned a P1, it was
  real** (reproduced, not taken on faith), **and it is fixed** — see the two bullets below.
  Full round-by-round state: **[`docs/HANDOFF-2026-08-16b.md`](HANDOFF-2026-08-16b.md)**.
- ⚠ **THE UTC COMPARISON ADMITTED A MINOR EARLY WEST OF UTC — the header claimed it could
  not.** The UTC day runs ahead of every zone west of UTC, so `isMinorFromDob` declared
  adulthood **before the member's local eighteenth birthday** — up to ~11h early
  (Pacific/Niue, UTC−11). Verified: DOB `2008-08-17` at `2026-08-17T00:30:00Z` returned
  adult while it was still Aug 16 in Los Angeles and New York. So the comment asserting the
  asymmetry "only ever refuses for one extra day rather than admitting a minor early" ruled
  out the exact thing the code was doing — **the ninth consecutive round in which a
  because-clause was the defect.**
- **THE FIX: adulthood is asserted only once it is true in EVERY timezone.** The calendar
  day is now read at **UTC−12** (`ADULT_REFERENCE_OFFSET_MS`, the "anywhere on Earth"
  convention) instead of UTC — no tz database, no extra query, one subtraction. The cost
  runs in the SAFE direction and is bounded: a member is refused for up to 12h after local
  midnight at UTC (26h at UTC+14) on the day they turn 18. **Refusing an adult briefly is a
  nuisance; admitting a minor is the failure this gate exists to prevent.**
  ⚠ **This deliberately no longer matches `set_over_18()`** (`current_date` is UTC, so up to
  a day less conservative) — **and that cannot put two gates into disagreement about a
  person.** `over_18` is never the decider when a usable DOB exists: both consumers read
  `fromDob !== null ? fromDob : over_18 === false` (`age-gate.ts`, `membership-core.ts`), and
  when the DOB is null the trigger writes NULL too, so neither side has an opinion.
  ⚠ **Confirmed against the LIVE catalog rather than the migration files** (this database has
  twice failed to match them): **no policy, view, constraint or other function reads
  `over_18`** — `set_over_18()` is the only object that mentions it, and it only writes it.
  The column is a denormalised snapshot, not a second gate.
  ⚠ **The member's own calendar day was NOT chosen, and the reason is data, not preference:**
  it needs `client_profiles.timezone` (read by `shape_user_tz(uid)`), and that table holds
  **ZERO rows** — every account would fall through to this margin anyway, at the cost of a
  second table read on the middleware hot path. Revisit when the column is populated; the
  margin is correct in the meantime, not a placeholder.
- ⚠ **AND THE FIX ITSELF SHIPPED A FABRICATED ADULT FOR ~20 MINUTES — caught by reviewing my
  own diff, not by any gate.** Shifting the reference instant moved the clock-validity check
  from the resulting **Date** (`Number.isFinite(ref.getTime())`) to the input **number**
  (`Number.isFinite(raw)`). A finite input can still be outside the Date range
  (`|t| > 8.64e15`), and every field read then yields NaN — which falls through the
  comparison as `born > NaN` = **false**, i.e. **ADULT from a clock we could not read**. The
  guard is back on the Date; two vectors pin it (`9e15`, `-9e15`). **The general rule:
  validate the value you are about to READ, not the one you were handed** — and the
  adjacent-miss rule held again, the next defect being inside the fix for the last one.
  Every guard is mutation-tested: reverting the offset to UTC fails 2 vectors, the wrong
  sign fails 5, a half offset fails 1, and either weakening of the clock guard fails 1.
- ⚠ **ROUND 10 — THE LEGACY SIGNUP COLLECTED A DATE OF BIRTH AND NEVER PERSISTED IT, SO
  THE GATE HAD NOTHING TO READ.** `public/signup-client.html` sent its DOB to the intake
  email and `client_intakes` — **not a table any age check reads** — and called
  `shapeDb.signUp()` without it, which upserted `profiles` with no `date_of_birth`. Every
  account from that flow therefore carried `date_of_birth` NULL and (by the trigger)
  `over_18` NULL, and all three gates treat NULL as "says nothing", which **admits**. So a
  minor who answered the question honestly was let straight through. **Worse than the
  finding stated, two ways:** the page had **no 18+ validation at all** (the other two
  signup surfaces validate and throw), and it is **not vestigial** — ~20 pages link it,
  including `login.html`'s "Sign up". The DOB freeze migration's own header enumerates the
  legitimate DOB writers and this path is absent from the list, because it never wrote one.
- **THE FIX, at the helper that owns the profiles upsert — not only at the page.**
  `signUp()` now requires a valid 18+ date and writes it to the row **and** to auth
  metadata; validating in the page alone would leave the row-writing code still able to
  create an ungated account. ⚠ **The metadata copy is not redundant:** with email
  confirmation on, `signUp` returns a user and NO session, the upsert cannot authenticate,
  and `newdesign/login.jsx:140` claims the date at first sign-in — without it the
  confirm-by-email half still produces ungated rows, which is the harder half to notice.
  ⚠ **AND THE 18+ CHECK HAD TO MOVE ABOVE `sendIntakeEmail()`, WHICH IS A SEPARATE
  DEFECT:** that call relays the whole questionnaire — injuries, medications, dietary
  restrictions, emergency contact — to the Shape inbox and localStorage **before** the
  account is created, so refusing a minor only inside `signUp()` would have collected and
  transmitted a child's health data and only then declined them. **A gate that runs after
  the side effect is not a gate.**
- **No migration and no backfill, and that was measured rather than assumed:**
  `client_intakes` holds **0 rows** and `profiles` holds **2**, both DOB-null. The defect
  is about every account this path will create, not damage already done.
- **The rule now has FOUR copies and they cannot share a module** — `public/supabase.js`
  is a browser IIFE loaded by `<script>` and the page's copy is inline, neither of which
  can import. Drift is the realistic failure, so drift is what is gated:
  `tests/signup-dob-persisted.test.mjs` pins the profiles write, the metadata write, both
  refusals running **before** account creation, the page passing its `dob`, the check
  preceding `sendIntakeEmail()`, one shared threshold expression, and that no surface sets
  `over_18` directly. ⚠ **Mutation-testing it caught a hole in the guard itself:** the
  passed-dob assertion lacked a word boundary, so `xdob: data.dob` — a renamed, ignored
  key — satisfied it. Fixed; all seven mutations now killed.
- ⚠ **The honest limit, stated so nobody reads more into it:** a client-side check stops
  the ordinary member who enters a real date, which is who an age gate is for. It cannot
  stop a hostile caller who skips the helper and drives `supabase.auth` directly — that
  needs the read-time gate to **refuse a NULL `date_of_birth`**, which would also lock out
  any pre-DOB account. With two rows in the table that is as cheap as it will ever be, but
  it is an owner ruling, not a patch.
- ⚠ **ROUND 11 — MY ROUND-10 FIX SHIPPED A REGRESSION OF MY OWN ROUND-9 FIX, AND THE
  GUARD I WROTE PINNED IT.** Copying the sibling surfaces' 18+ check verbatim carried
  their **instant-based** comparison — `new Date(dob) > now − 18y`. `new Date('2008-08-17')`
  is midnight **UTC**, so at `2026-08-17T00:30:00Z` it reads **ADULT** while it is still
  Aug 16 in Los Angeles: the *exact* counterexample round 9 rewrote the read-time gate to
  close. Reproduced before fixing. Worse, `tests/signup-dob-persisted.test.mjs` asserted
  that expression as "the shared rule" across all four copies — **a drift guard cementing
  the bug it was written to prevent.** The lesson generalizes past this file: *a guard that
  pins an expression pins whatever that expression is wrong about; assert what the code
  ANSWERS, not how it is spelled.*
- **THE FIX — ONE RULE, REACHED FROM EVERY SURFACE, instead of a fifth hand-copy.** The
  canonical `src/lib/age-derive.mjs` must stay import-free (it rides the Edge proxy
  bundle) and the write surfaces are classic scripts that cannot import ESM — the same
  constraint `public/newdesign/localScrub.mjs` already solves, so the same remedy:
  **`public/age-derive.js`**, a classic-script mirror registering `window.ShapeAgeDerive`,
  with **`tests/age-derive-mirror.test.mjs`** running BOTH implementations over a named
  boundary table **plus a 4,000-case deterministic fuzz sweep** (seeded LCG, never
  `Math.random`) and failing on the first disagreement. Now: `public/supabase.js`,
  `signup-client.html` and `newdesign/signup.jsx` call the mirror; `shapeBackend.js`
  (both creation paths) and the Next action **import the canonical module directly**.
  ⚠ Every classic-script surface **fails CLOSED** when the module is absent — a page that
  cannot verify an age must refuse, never admit.
- ⚠ **ROUND 11 ALSO ANSWERED THE TWO QUESTIONS I HAD ASKED BECAUSE I WAS UNSURE — both
  came back "yes, you missed something".** (1) **The metadata claim I described was dead
  on the path that uses it.** `signup-client.html` redirects to **`login.html`**, not
  `newdesign/Login.html`; `login.html` REJECTS a missing profile ("No profile found.
  Please sign up.") and `shapeDb.signIn` only *read* the profile — so a confirmed account
  kept a usable session, **no profiles row and no DOB**. `signIn` now provisions the row
  from the signup metadata; that is the legacy confirm flow's only provisioning point.
  (2) **`/signup` (Next) was a complete bypass** — linked from `Nav.tsx` "Get started",
  `Footer.tsx` and `CinematicNav.tsx`, it called `auth.signUp()` with role metadata only
  and wrote no profile at all. It now collects a DOB, validates with the canonical module
  **before** account creation, carries it in metadata, and persists the row on the
  auto-confirm branch — surfacing a failed write rather than landing on the dashboard
  ungated.
- **The drift guard was rebuilt to check DELEGATION, not spelling** — every creation path
  routes to the shared rule, each classic surface fails closed, every page that needs the
  mirror loads it, and a dedicated anti-regression test fails if the instant comparison
  ever returns. ⚠ Two lessons paid for twice: the mobile paths are now **sliced per
  function** (the old whole-file search passed while one of `signUp`/`signInWithPhone`
  drifted — the exact reported defect), and assertions **strip comments first**, because
  the rationale comments quote the banned expression and name `auth.signUp()`, so the
  first version fired on its own explanation. **9/9 mutations killed**, including
  drifting only the phone path.
- Verified on this head: suite **1595/1595**, `tsc` clean, `next build` exit 0 with
  `ƒ Proxy (Middleware)`, mobile Vite build clean with the AoE derivation confirmed
  **in the emitted bundle** (both creation paths call it), newdesign precompile check
  exit 0, CRLF preserved on the three tracked-CRLF signup pages (2-line diffs), zero NUL
  bytes.

### 2026-08-16 — ABSENCE NO LONGER ADMITS: the age gate keys on proof, not on null (#1888)

- ⚠ **THE PATCH CYCLE WAS THE PROBLEM, AND THE CURVE SAID SO.** Rounds 9→12 ran
  1 → 1 → 4 → 4 findings, each round finding defects **in the previous round's fix**.
  Round 12's four P1s all ended in one sentence: *a session exists, `date_of_birth` is
  null, and the gates treat null as not-a-minor, so the account is admitted.* Four
  different routes into that state — a failed profile upsert on auto-confirm, an
  email-confirmation callback that never provisioned, an approved-coach invitation, and
  a legacy sign-in whose provisioning failure left the session usable. **Patching write
  surfaces could not converge, because each patch added a new failure mode and the hole
  was the read-time default.** The repo's own rule (a flat findings curve means change
  approach, not patch again) applied doubly to a rising one.
- **THE FIX — one line of policy at the chokepoint, `mustRefuseForAge()` in
  `src/lib/age-derive.mjs`.** Every gate used to read
  `isKnownMinor = fromDob !== null ? fromDob : over_18 === false` — only proof of
  MINORITY refused. Now a usable DOB decides in **both** directions, the trigger-written
  `over_18` is the fallback, and a row that proves **nothing** is refused unless the
  account predates **`ADULT_PROOF_REQUIRED_FROM`**. ⚠ **A null/absent profile REFUSES** —
  that is precisely the state a failed provisioning write leaves behind. Consumed by
  `computeMembership` (which the Edge proxy AND `requireMembership` both route through)
  and `refuseKnownMinor`, so two call sites cover all three gates.
- ⚠ **THE CUTOFF IS A ONE-WAY RATCHET AND IS PINNED BY A TEST.** Moving it FORWARD
  re-opens the hole for every account created in the widened window. Chosen against
  production on 2026-08-16: exactly **2 profiles, both DOB-null, newest created
  2026-06-13** — so it grandfathers two pre-launch accounts and requires proof of
  everything after. **Owner-ruled** (the alternative, no grandfather, would have locked
  the owner out of their own coach account).
- ⚠ **A FORGOTTEN COLUMN IS NOW A TOTAL LOCKOUT, SO THE SELECTS ARE GATED.** Both gates
  must `select('… created_at')`; without it every account reads as unplaceable and is
  refused. `tests/age-gate-null-policy.test.mjs` asserts every age-column select carries
  `created_at` — the mistake fails the build rather than the login. **7/7 mutations
  killed**, including both dropped-select cases and a forward cutoff move.
- **COACHES SUBMIT A DOB NOW (owner-directed), end to end.** Approval provisions an auth
  user **and** a coach profile, and **coach roles satisfy membership automatically** — so
  under the new policy an approved coach with no date of birth would be entitled *and*
  refused. The field is collected on both application forms (website `ProPersonal`,
  mobile `BSProviderApplicationScreen`), validated with the shared derivation on submit,
  **re-validated server-side in `/api/apply`** (18+ enforced there, not just in the UI),
  persisted to the `provider_applications.dob` column that already existed and was never
  written, and carried into the profile on approval — **never overwriting an existing
  date**, since the DOB freeze makes the first write permanent and a service-role upsert
  would otherwise be a way around it.
- **`/auth/callback` now provisions the profile**, which the new policy makes *required*
  rather than optional: it is the destination email confirmation actually lands on, it
  previously only exchanged the code and redirected, and the signup action cannot write
  the row (confirmation returns no session). Best-effort by design — a failed provision
  must not strand the user on an error page, and the gates fail **closed** on the
  resulting unproven row, so the failure mode is a refusal to enter, never a silent
  admission.
- Verified: suite **1605/1605**, `tsc` clean, `next build` exit 0 with
  `ƒ Proxy (Middleware)`, mobile Vite build clean, newdesign precompile exit 0, CRLF
  preserved on the two tracked-CRLF files, zero NUL bytes.
- ⚠ **ROUND 13 — THE CURVE TURNED (4 → 2), AND BOTH FINDINGS WERE IN THE NEW POLICY
  ITSELF, NOT A NEW CLASS.** Both answered questions raised on the previous head.
  - **THE GRANDFATHER WAS FORGEABLE.** The cutoff keys on `profiles.created_at`, and
    verified live: `users update own profile` is UPDATE to `authenticated` with
    `USING = WITH CHECK = (auth.uid() = id)` and **no column restriction** — the exact
    shape of the hole `2026-08-15-profiles-dob-immutable.sql` closed for
    `date_of_birth`. So an authenticated caller with a null DOB could **backdate their
    own row** (or INSERT one already backdated) and be grandfathered straight past the
    gate. *A timestamp used as proof of legacy status must be server-controlled.*
  - **APPROVING A LEGACY APPLICATION WOULD HAVE LOCKED OUT A REAL COACH.** Collection
    protects only new submissions; `approveApplication()` still accepted rows whose
    `dob` is null, then created the auth user and a **post-cutoff** coach profile — which
    the new read-time policy refuses at every gated surface, with nothing on screen
    explaining why. Approval now **refuses** rather than provisioning around it.
- ⚠ **AND THE COLUMN THE COACH FIX WRITES DOES NOT EXIST IN PRODUCTION.**
  `2026-04-17-provider-applications.sql` declares `dob date`; the LIVE table has 18
  columns and none is `dob` (read from `information_schema`, not the file — the schema
  drift this repo has now hit repeatedly). The round-12 insert naming that column would
  have failed **42703 on every provider application**. The route now retries without it
  on the stable unknown-column codes only, so deploy order is free and a genuine failure
  still surfaces.
- ⚠ **OWNER MIGRATION —
  [`2026-08-16-created-at-freeze-and-application-dob.sql`](https://raw.githubusercontent.com/cperry8800-droid/shape-app/claude/radio-legal-gates/supabase-migrations/2026-08-16-created-at-freeze-and-application-dob.sql).**
  Adds the missing `provider_applications.dob`, and makes `created_at` server-controlled
  for non-privileged callers (stamped on INSERT, immutable on UPDATE; service_role /
  migrations / dashboard exempt so a genuine backfill still works). ⚠ **Folded into
  `set_over_18()`, NOT a sibling trigger** — BEFORE ROW triggers fire in **alphabetical**
  order, so a separate guard could sort after the derivation and leave `over_18` computed
  from a value the freeze then reverted, which is worse than the bug. **Until it is
  applied the grandfather remains forgeable** — no regression (that state was admitted
  before this wave), but the fix is not complete without it.
- **Guards + mutation results:** the migration's freeze is pinned by a test that slices
  the **function body** — asserting over the whole file matched the migration's own
  structural-guard literals and passed while the trigger no longer froze anything
  (caught by mutation-testing the test). Approval-refuses, no-overwrite, the
  unknown-column retry and the validate-before-store ordering are all pinned. **11/11
  mutations killed** across the two files. ⚠ One ordering assertion first matched
  `resolveOrInviteProviderUser`'s **declaration** instead of its call — the third time
  this exact trap has appeared in this wave; ordering assertions anchor on the
  invocation.
- Verified: suite **1610/1610**, `tsc` clean, `next build` exit 0 with
  `ƒ Proxy (Middleware)`, mobile Vite build clean, newdesign precompile exit 0, CRLF
  preserved, zero NUL bytes.
- ✅ **MIGRATION APPLIED + VERIFIED LIVE 2026-08-16 (owner ran it).** `provider_applications.dob`
  present; `set_over_18()` freezes `created_at` on UPDATE, stamps it on INSERT, and still
  freezes `date_of_birth`. ⚠ **Proven BEHAVIOURALLY, not from `prosrc` text** — the source
  guard is the weaker instrument. Impersonating a signed-in member owning the row
  (`request.jwt.claims` + `set local role authenticated`), an UPDATE backdating
  `created_at` to 2020-01-01 came back **unchanged** (`created_at_frozen=t`); the whole
  probe was wrapped in a `raise exception` so it rolled back and left no trace.
  ⚠ The same probe set `date_of_birth` on a row that had none, which is **correct, not a
  leak** — the freeze deliberately allows the FIRST write (every legitimate provisioning
  path is a first write). It does mean a self-asserted DOB is exactly that: the gate
  protects the honest member, and real assurance would need identity verification.
- ⚠ **ROUND 14 — flat at 2, and both were again answers to questions raised on the
  previous head.** Both are now fixed.
  - **THE PRE-MIGRATION FALLBACK DROPPED THE VALIDATED DATE.** An applicant would pass the
    18+ check, be told their application was ready for review, and then be **permanently
    unapprovable** — approval refuses a row it cannot age-place, and the dashboard has no
    way to restore the value. Every application submitted between deploy and migration
    would have needed manual database repair. The fallback now carries the
    **server-validated** date in the jsonb `details` (never from client input, so it
    cannot smuggle an unvalidated date past the check), and approval recovers it.
    ⚠ It reassigns the OUTER `details`, because the file-upload step below does
    `details = { ...details, documents }` and UPDATEs the row — writing the date straight
    back out otherwise.
  - **AN OLDER MIGRATION COULD SILENTLY REVERT THE FREEZE.** Three migrations
    `create or replace` `set_over_18()` and all three are marked safe to re-run, so
    replaying an older one reinstates a body without the freezes — and a `DO` guard inside
    a migration only runs while THAT file is applied, so it cannot catch a later
    replacement. **Every replayable definition now carries the FULL body**, and a test
    scans the whole migrations directory and fails the build if any definition drops
    either freeze.
- ⚠ **THAT FORWARD GUARD IMMEDIATELY FOUND A THIRD DEFINITION NOBODY HAD CONSIDERED** —
  `2026-06-22-age-verification.sql`, the original, with **no freeze of any kind**.
  Replaying it would have reverted both the DOB freeze and the `created_at` freeze at
  once. It is the clearest argument for the guard being a directory-wide scan rather than
  a note in two files. **5/5 mutations killed**, including dropping either freeze from
  either older migration.
- Verified: suite **1611/1611**, `tsc` clean, `next build` exit 0 with `ƒ Proxy (Middleware)`,
  CRLF preserved, zero NUL bytes.
- ⚠ **ROUND 15 — STILL FLAT AT 2, AND IN THE SAME TWO SEAMS AS 13 AND 14.** The curve is the
  finding: three rounds running, two per round, and every one of the six landed in either
  *a validated DOB not reaching the surface that enforces it* or *the `set_over_18` forward
  guard*. The repo's own rule (a flat curve means change approach, not patch again) applied,
  so neither was fixed where it was reported.
  - **THE ROUTE'S 18+ CHECK WAS ENFORCED WITHOUT UPDATING THE PRODUCERS, AND IT BROKE EVERY
    COACH-APPLICATION DOOR BUT ONE.** `/api/apply` now refuses an application it cannot
    age-place — correct, and the reason approved coaches keep working — but **four of the
    five surfaces that POST to it never forwarded a date of birth**, so the route answered
    400 to all of them. The two failure modes are opposite, which is why only one was
    reported: the **mobile app fails OPEN and silently** (`submitProviderApplication` catches
    any failed route call and falls back to a direct Supabase insert, so the server-side
    re-check, the reviewer email and the file uploads were all bypassed with nothing on
    screen), while `public/mobile/signup.jsx` and the two legacy `signup-{trainer,
    nutritionist}.html` pages fail **CLOSED and loudly** — the applicant simply could not
    apply. ⚠ Those legacy pages are **not vestigial**: 28 pages link them, they are in
    `sitemap.xml`, and `next.config.ts` rewrites to them — the round-10 lesson repeating.
    Fixed at all four, and the two legacy pages gained the DOB field they never had, loading
    the shared `/age-derive.js` mirror and **failing closed when it is absent**.
  - ⚠ **FORWARDING THE DATE FIXES THE TRIGGER, NOT THE MECHANISM.** Rewriting a **4xx** into
    a direct insert is wrong whatever caused it: a refusal is not a transport failure, and a
    genuinely under-18 mobile applicant would still have taken that path with the date
    forwarded. `submitProviderApplicationToApi` now marks a 4xx `rejected` and the caller
    re-throws instead of storing the application around the check that refused it. The
    fallback still covers real outages, which is what it was for.
  - ⚠ **THE MIGRATION GUARD REPORTED CLEAN ABOUT A DEFINITION IT COULD NOT SEE.** It keyed on
    the exact lowercase `create or replace function public.set_over_18()`; Postgres does not
    care about case or the space before the parens. **Verified rather than assumed** —
    reformatting one header to `CREATE OR REPLACE FUNCTION public.set_over_18 ()` and deleting
    `new.created_at := old.created_at` left every assertion green, because the three known
    definitions kept the count satisfied. Deliberately **not** fixed by widening the literal
    (the `pg_temp` scanner burned six rounds proving a hand-rolled matcher keeps differing
    from Postgres's): the statement is now matched tolerantly, the freeze is asserted **per
    file** so the fragile part — finding where a `$$`/`$tag$` body ends — is gone, and the
    guard **fails closed** on ambiguity (a file defining it twice, or a known definer that
    stops matching, is an error rather than a skip). **6/6 mutations killed.**
  - ⚠ **AND MY OWN NEW GUARD PASSED FOR THE WRONG REASON — caught only by mutation-testing
    it.** The assertion that a rejection is not swallowed matched `response.json().catch(() =>
    ({}))` and the *other* function's `throw`, so deleting the re-throw left it green. It is
    now anchored on the real `catch (apiError` block. The comment-stripper in the same file
    hit the identical class: the obvious `/\/\*[\s\S]*?\*\//g` ran from a `/*` sitting inside
    a `//` line to a `*/` hundreds of lines later and **deleted the function under test**.
    Both are the same lesson as the guard above — *check the check before believing it*.
  - Verified: suite **1616/1616** (+5), `tsc` clean, `next build` exit 0 with
    `ƒ Proxy (Middleware)`, mobile Vite build clean **with `dob:e.dob` confirmed in the
    emitted bundle**, newdesign precompile exit 0, every touched file LF with zero NUL bytes.
- ⚠ **ROUND 16 — THE SAME RULE, A DIFFERENT FIELD: so the MATRIX became the fix.**
  Both findings real, neither fixed where it was reported.
  - **`/api/apply` refuses a NUTRITIONIST application without the four NC1
    `details.compliance_attestations`, and only ONE of the five surfaces supplied
    them** — so every nutritionist applying from the mobile app, from `/mobile`, or from
    the legacy page was answered 400 (and, before round 15's rethrow, the mobile one
    fell back to a direct insert that skipped the route's own re-check). This is the
    **second instance of one rule**: a server-side requirement added to the route
    without updating its producers — round 15 was the identical shape with `dob`.
    Patching the reported surface cannot converge, so the fix is the rule:
    **`tests/provider-apply-requirements.test.mjs`** asserts a REQUIREMENTS × SURFACES
    matrix — it counts the route's `status: 400` gates and fails if that count ≠ the
    registered gates (a **new** gate breaks the build until every producer is updated),
    fails if a registered gate vanished (a stale entry cannot mask a real one), and
    asserts per-surface evidence for every gate that surface can reach (`types` exempts
    the trainer page from nutritionist gates). **When a route requirement is the
    recurring defect, gate the MATRIX, not the field.**
    While auditing the rest: years-of-experience (floor **5**) and background-check
    consent ARE satisfied on all five — the legacy pages carry `agreeBgCheck` and their
    experience options all clear the floor — so attestations were the only real blocker.
    The mobile app now **imports `REQUIRED_ATTESTATIONS` from
    `src/lib/compliance/nutrition.mjs`** rather than re-typing it; the two classic
    scripts that cannot import mirror it under the drift test.
  - ⚠ **THE LEGACY PAGE NEEDED A STRICT-BOOLEAN MAP, NOT A COERCION — and I nearly
    shipped the coercion.** `gatherApplicationData()` records a checkbox as the STRING
    `'Yes'` or `'No'`, and **`'No'` is truthy**, so `Boolean(data['att_x'])` marks every
    attestation affirmed regardless of what the applicant ticked. That is not a 400 the
    applicant sees — it is a **fabricated compliance attestation** reaching the
    reviewer, invisible to every other gate. Caught by reading the gather instead of
    assuming unchecked ⇒ falsy; the rule (affirmed by value, never coerced) is pinned.
  - ⚠ **THE FREEZE GUARD REPORTED CLEAN ABOUT A BODY IT COULD NOT SEE — the exact
    trade-off round 15's own comment defended.** It asserted the three freezes over the
    whole FILE, and these migrations carry a structural `DO` block that quotes them, so
    a replacement `set_over_18()` freezing **nothing** passed. **Reproduced before
    fixing (12 pass / 0 fail).** The guard now extracts the function **body** by
    dollar-quote matching — tractable because a body cannot nest the same tag, which is
    a delimiter match rather than the SQL lexing the `pg_temp` scanner kept losing on —
    and **fails closed** on anything it cannot read.
  - **One shared comment-stripper** (`tests/helpers/strip-comments.mjs`): that stripper
    shipped a real defect only mutation-testing caught, and a second copy is a second
    chance to reintroduce it.
  - ⚠ **A PROCESS LESSON THAT COST REAL WORK:** mutation-testing with `git checkout --`
    while the fix was **uncommitted** reverted four source fixes and **contaminated every
    later case** (failure counts climbed for reasons unrelated to the mutation, and it
    read as a healthy kill sequence). Commit the fix first, and run an unmutated **sanity
    case at both ends** of the batch — that one line catches a wiped fix, a contaminated
    tree, and a broken measurement at once. Which mattered: an earlier batch reported
    **8/8 "survived"** purely because **`grep -oP` is unsupported in this shell**; the
    saturated ratio was the tell.
  - Verified: suite **1621/1621** (+5), `tsc` clean, `next build` exit 0 with
    `ƒ Proxy (Middleware)`, mobile Vite build clean **with the four attestation keys
    confirmed in the emitted apply chunk** and `compliance_attestations` in the
    request-body chunk, newdesign precompile exit 0, every touched file LF with zero NUL
    bytes, **10/10 mutations killed**. ⚠ The legacy pages remain verified **statically
    only** — no browser click-through (house rule), so a live nutritionist application
    through that page is still unproven.
- ⚠ **ROUND 17 — TWO FINDINGS, BOTH IN SEAMS THE EARLIER ROUNDS HAD NOT TOUCHED.**
  Nothing came back in the apply-requirements or `set_over_18` seams, which is the
  evidence rounds 15–16's structural answers held. Both real, both fixed.
  ⚠ **CORRECTED after round 18 — this heading read "AND FOR THE FIRST TIME IN FIVE
  ROUNDS BOTH LANDED IN NEW SEAMS", and the celebration was the error.** Round 17 did
  not close a seam; it **opened** one, and round 18 found a P1 inside this round's own
  playback fix plus the transfer over-claim still live on **six** other surfaces. Both
  fixes below were incomplete when this entry was written. See ROUND 18. *Two rounds
  running, a summary line here claimed more than the work had earned — a quantifier in
  a heading outlives the paragraph that refutes it, so it is deleted rather than
  softened.*
  - ⚠ **SIGNED-OUT RADIO PLAYBACK — a licensing exposure, not polish.**
    `ShapeRadioLive.play()` spans **two** awaits (the authenticated station read, then
    `audio.play()`) and carried **no guard**, while the sibling poll **in the same IIFE**
    has had a generation + abort guard since Codex's P1 on #1467. **Worse than
    reported:** the sign-out path calls `pause()`, which is `if (el) el.pause()` — a
    complete **no-op before the first play** — so the late resolution *creates* an
    element and starts the stream. That is exactly the non-subscription rate
    classification the signed-out path was removed to avoid.
    Fixed with a generation gate that re-checks the generation **and the live identity
    after EVERY await**, and stops audio it started in a losing window rather than
    reporting success. The decision lives in a pure, unit-tested
    **`mobile-app/src/services/playbackGate.mjs`** with the identity **INJECTED, never
    captured** — a captured snapshot *is* the bug. 8 vectors drive the real gate
    (including the no-op-pause case, last-wins overlap, a throwing identity source, and
    a sign-out landing inside `audio.play()`); **5/5 mutations killed**.
  - ⚠ **`privacy.html` ASSERTED TRANSFER SAFEGUARDS THE REPO DOES NOT HAVE — in a
    published policy, for the subjects with the strongest rights.** The paragraph
    claimed every EEA/UK recipient is covered by DPF **or** SCCs + UK Addendum + a TIA,
    and that SCCs are maintained as a fallback *even for DPF-certified recipients*.
    Checked against the evidence rather than taken on faith: the canonical spec carries
    **seven `[VERIFY]`** markers, and the subprocessors table the paragraph *points at*
    lists **~11 recipients under bare "per provider terms"** — including the two
    highest-risk ones, **Jitsi** (audio + video of coaching consultations) and
    **FormSubmit** (injuries, medications, allergies, emergency contact). The claim was
    materially broader than anything verified.
    Rewritten to state the *intended* safeguard, say plainly the work is unfinished,
    point at the per-recipient basis, and offer to answer for a named recipient. **The
    unverifiable fallback sentence is DELETED, not softened** (a quantifier claim is
    removed, never swapped). This matches the register the **sibling paragraph already
    set** about the Article 27 representatives — *"neither is in place yet; we would
    rather tell you that than imply otherwise"* — which is what made the over-claim
    obviously wrong in its own voice. Legal copy: still **DRAFT pending counsel**.
  - Verified: suite **1629/1629** (+8), `tsc` clean, `next build` exit 0 with
    `ƒ Proxy (Middleware)`, mobile build clean with the gate in the emitted bundle,
    newdesign precompile exit 0, `privacy.html` tag-balanced, all LF / zero NUL.
- ⚠ **ROUND 18 — THREE FINDINGS, ALL THREE IN MY OWN ROUND-17 WORK, ALL THREE THE
  SAME RULE AT A SURFACE THE PREVIOUS ROUND DID NOT SWEEP.** Round 17 was celebrated
  here as "the first round to land outside both seams." That reading was wrong: it
  opened a THIRD seam and round 18 found every place I had failed to close it. The
  count (2 → 3) is the least interesting part; that all three were **regressions of
  the fix itself** is the finding.
  - ⚠ **P1 — READING LIVE IDENTITY IS NOT ENOUGH, because the identity is stale for
    the whole sign-out.** `signOut()` bumps the sign-out generation as its FIRST
    statement, but does not clear the cached user until **after** push teardown,
    local-habit cleanup, the Supabase sign-out, the cookie DELETE and MusicKit
    cleanup — every one of which awaits on a network. Through that entire window
    `state.user` still returns the signed-out account, so the round-17 gate's
    `identityFn` reported *live* while the session was being revoked: a pending
    station read or `audio.play()` could pass every `live()` check, and audio already
    playing simply kept playing until a late identity event finally called `pause()`.
    **The round-17 fix was correct about the mechanism and wrong about the clock.**
  - **THE FIX, at both ends, because neither half covers the other.** The gate now
    takes **`signOutGen` as an epoch source** — the counter that moves FIRST — so any
    pending attempt is refused the instant sign-out begins; and `signOut()` **stops
    playback in the same breath as the bump, before its first `await`**, which is the
    only thing that can stop audio ALREADY running. ⚠ **The file already had this
    exact mechanism** (`bumpSignOutGen`, whose own header says it exists so parked
    coroutines "cannot resume after the sweep") — I built a parallel generation
    counter beside it instead of consulting it. *A new guard should first ask what the
    file already guards with.*
  - ⚠ **P2 ×2 — THE TRANSFER OVER-CLAIM HAD SEVEN SURFACES AND ROUND 17 FIXED ONE.**
    The unverifiable fallback sentence deleted from `privacy.html` was still published
    **verbatim** on `subprocessors.html` — the page `privacy.html` points at as
    authoritative — so the two contradicted each other and the *canonical* one carried
    the false claim. `data-compliance.html` carried a blanket "each is bound by
    contract" claim, and **my own generalization edit had added video calling
    underneath it**, bringing public `meet.jit.si` under a contractual guarantee its
    own canonical page refutes.
  - **A sweep then found FOUR MORE surfaces neither round named** — `privacy.html`'s
    own subprocessor paragraph (same file, different section) and **three in the
    mobile app** (in-app privacy, data-compliance, and subprocessors, one of them
    stating SCCs as settled fact). All seven now state the per-recipient basis and
    admit that several recipients currently rest on the provider's own published
    terms. **This is the registered rule (fix the RULE, not the surface) failing twice
    in a row: round 17 fixed where it was reported, and it was live in six other
    places.**
  - **`tests/legal-transfer-claims.test.mjs` gates the RULE, not the wording:** every
    legal surface × every banned claim shape, plus a required honest qualifier, tied
    to the **`[VERIFY]` markers still in the compliance spec** so the guard cannot be
    switched off while the underlying facts are unchanged. A new legal surface must be
    registered there — which is the point, since the failure mode being closed is
    "fixed where it was reported, still live everywhere else."
  - ⚠ **AND MY OWN VERIFICATION WAS THE BROKEN THING THREE TIMES IN ONE SESSION** —
    a generic `function \w(a,b){let n=0` regex matched a coincidental function and
    "confirmed" a gate that was in a different chunk; a 3000-char window around an
    arbitrary anchor put an unrelated `await` at offset 3 and reported the stop as
    happening *after* the awaits; and a bare `gs=` search matched `gs=this` elsewhere
    in the bundle. Each looked like a finding. The honest confirmation needed
    **brace-matching the real `signOut` body out of the minified bundle** — which then
    showed `async function _s(){so();try{gs?.()}catch{}try{await _o()}...}`, i.e. bump
    → stop → first await, with `gs = function(){ c.supersede(), e&&e.pause() }`.
    *Check the check before believing it — including when the check is yours.*
  - Verified: suite **1644/1644** (+15), `tsc` exit 0, `next build` exit 0 with
    `ƒ Proxy (Middleware)`, mobile build exit 0 with **the epoch wiring AND the
    pre-await stop confirmed in the emitted bundle** (not just in source), newdesign
    precompile exit 0, all three legal pages tag-balanced, every touched file LF with
    zero NUL bytes, **9/9 mutations killed** with unmutated sanity cases reading
    `fail 0` at both ends of the batch.
- **P1 — the age gate admitted a real minor for one day, and the two gates disagreed
  about them.** `isMinorFromDob` derived its adult cutoff with
  `Date.UTC(year - 18, month, day)`, which **ROLLS** an impossible anniversary forward
  (Feb 29 → Mar 1), while Postgres `date - interval '18 years'` **CLAMPS** it back
  (Feb 29 → Feb 28). So on **Feb 29 of a leap year** a member born exactly 18 years
  earlier on **Mar 1** — 17 years and 364 days old — read as an **ADULT** in JS and a
  **MINOR** to the `set_over_18()` trigger: the unsafe direction, and the two
  derivations disagreeing about one person, which is the entire reason the shared module
  exists. Both cutoffs verified against **production Postgres**
  (`2028-02-29 - interval '18 years'` = `2010-02-28`); recurs 2028, 2032, 2036…
  The clamp takes day 0 of the following month; only February can roll, but the guard is
  general. ⚠ **The 11 original vectors varied the BIRTHDAY and never the REFERENCE
  DATE**, so the one boundary the file existed to protect was the direction it did not
  test. New vector **mutation-tested**: 12 pass with the clamp, 11 pass / 1 fail without.
- ⚠ **A re-typed list is what goes stale.** `age-gate.ts` copied the gated-prefix list as
  **five** prefixes; `GATED_API_PREFIXES` holds **seven** — `/api/conversations` and
  `/api/messages` are gated in reality, so a reader auditing coverage from that header
  concluded **chat was ungated when it is gated**. The header now points at the constant
  instead of copying it. `warroom.ts` carried counts derived from the same stale list
  (46/111); **re-measured: 157 `/api` routes, 48 inside, 109 outside**, with the
  authenticated-outside figure marked **DERIVED, not re-measured** (~75, was 77) so the
  next reader does not quote a number nobody checked.
- **`middleware.ts` — the line that actually refuses the request** — claimed `over_18`
  "cannot be self-asserted, so an explicit false is a proven minor" **unqualified**: the
  one site of five that failed to name the freeze migration its guarantee depends on, and
  it described the `over_18`-only mechanism that no longer matches the code.
- ⚠ **`src/lib/supabase/middleware.ts` IS CRLF AT REST** (11 of 238 `.ts` files are; no
  `.gitattributes`). A whole-file LF normalisation had turned a 7-line change into a
  **596-line diff** — reviewers read 596 lines of churn to find seven, and it guaranteed
  a conflict with any branch touching the file. Restored to CRLF: **14+/1−**; whole PR
  1359/488 → **1106/194**. Verify with `tr -cd '\r' < f | wc -c` — **`grep -c $'\r'` is
  unreliable in this shell** and reported 0 CR on a file holding 295.
- **The pattern, eight rounds in:** every round from 5 onward found a defect adjacent to
  or caused by the preceding fix, and round 8 is the sharpest — severity went *up*
  (P2s → a P1) because round 7 added a **new file** whose only review was mine. A flat
  findings curve says change approach; a curve that **rises after a late addition** says
  the addition is the unreviewed surface.
- Suite **1579/1579** on the merged head (branch alone 1542, +3 this round); `tsc` clean; `next build` exit 0 with `ƒ Proxy (Middleware)`
  present (the proof the pure `.mjs` still bundles into the edge chain). Design hook: all
  22 findings **net zero** vs `origin/main` (radio.html's font count went 9 → 8 — the
  branch *removed* one), classified per the standing no-suppression ruling.

### 2026-08-15 — The shared-device sign-out wave: user content, PWA caches, and gyms off the nav chrome (#1883 → `f91a6dfa8` · #1885 → `17f3fb2c7` · #1889 → `f85ea4531`)

- **The problem, in one line: signing out left the previous person's data on the device.**
  Content in localStorage/sessionStorage, signed media in CacheStorage, a live push
  registration, and in-memory caches that no navigation ever cleared. Three merged PRs,
  **28 review rounds** between them; suite **1528**. Siblings merged earlier in the wave:
  #1881, #1884 → `34b7010f2d`, #1886 → `6325570605`, #1887 → `c5b5ebfda`.

- **#1883 — the content scrub + a structural reload.** `handleLogout` now ends in a hard
  `location.reload()`, which retires an entire leak class rather than one instance: every
  module-scoped cache in the bundle (e.g. shapeSignals' role-keyed triage promise, which
  would otherwise serve account A's roster to account B) dies with the JS context. Wiring
  each cache to `shape:signedOut` individually is a list the next cache silently fails to
  join. `signOutGen.mjs` closes both resume-after-sweep races (the push callback and an
  unawaited `scheduleLocalHabit`).

- ⚠ **THE `scope:'local'` RETRY IS LOAD-BEARING ON THE WEBSITE, AND ONLY THERE.** The site
  pins auth-js **2.108.2** (`public/vendor/supabase-js-2.108.2.umd.js`, SRI-locked), whose
  `_signOut` returns a failed global revocation **before reaching `_removeSession()`** — so
  after an offline sign-out the persisted session survives and `getSession()` restores the
  previous account, past a scrub that clears content but not `shape.auth`. **Mobile ships
  2.111.0, which does remove the session on that path.** The two bundles genuinely differ:
  do not "harmonize" them, and re-read `_signOut` before bumping the vendored bundle.

- ⚠ **ONE ORIGIN, ONE SCRUB INVENTORY.** `scripts/build-m.sh` publishes the mobile app at
  `/m/` **under the website's origin**, so both surfaces share one localStorage. Separate
  per-surface lists left holes in *both* directions (a `/m/` sign-out kept the website's
  `shapeClientIntake_v1` health details; a website sign-out kept `shape.clientIntakes`).
  The canonical union now lives in **`public/newdesign/localScrub.mjs`**; mobile *imports*
  it, and the two website classic scripts (which cannot import ESM) carry inline copies
  gated by **`tests/local-scrub-sync.test.mjs`**, which fails on one-key drift in either
  direction. **Any future key change must touch all three copies — that is the design.**
  One sanctioned divergence: `shape.storeCart` (website keeps it, mobile clears it).

- **Push teardown: bound the WAIT, never the WORK.** Serialize-then-delete runs as ONE
  detached chain (the DELETE is never dispatched before the registration POST settles, so
  ordering is airtight), and `teardownPush()` awaits that chain under a single outer 4s
  race so sign-out always completes. The DELETE carries **`keepalive: true`** — the reload
  fires milliseconds later and would otherwise abort even a dispatched DELETE; the POST is
  deliberately **non**-keepalive, because the reload aborting a stale POST is the
  kill-switch. Residual, documented at the call site: a POST fully received server-side
  that commits after page death has no post-reload auth for an ordered DELETE — the next
  registration's admin re-point cleans it.

- **#1885 — the service worker stopped caching other people's media.** The old fetch
  handler had **no origin check**, so authenticated **signed** media (progress photos,
  meal-note voice memos, credential files — token and all) was written into CacheStorage
  and outlived sign-out. `sw.js` **v133** narrows runtime caching to same-origin assets,
  and sign-out purges the `shape-*` caches on every browser path.

- ⚠ **THE NEXT.JS DASHBOARD SIGN-OUT RUNS NO BROWSER CODE.** It is a **server action**, so
  no scrub could ever have fired there. A client `SignOutButton` now runs the canonical
  scrub + purge before invoking it, replacing the bare `<form action={logout}>` in
  `dashboard/layout.tsx` and `Nav.tsx`.

- ⚠ **ASYNC CLEANUP FIRED IMMEDIATELY BEFORE A NAVIGATION IS DEAD CODE.** Two review
  rounds were spent on this one class. A fire-and-forget purge never dispatches its
  `caches.delete` calls when the document is discarded microseconds later — which is
  exactly what pageShell-only pages (About, Pricing) and the mobile hard reload do. The
  scrub now **returns** its purge promise and every navigating caller awaits it under a 2s
  bound. And `signOut()` runs the **synchronous scrub FIRST**: it previously awaited the
  purge *ahead* of the scrub with no timeout, so a stalled CacheStorage would strand the
  sensitive at-rest content on the device while callers waited to navigate.

- ⚠ **A PAGE CANNOT RETIRE ITS OWN CONTROLLER — so the purge is not the last word.** On a
  device still running the pre-v133 worker, that worker's handler ends in
  `caches.open('shape-v132')` + put, and `caches.open` **re-creates a deleted cache**, so
  an in-flight signed-media GET can repopulate after the purge. Nothing callable from the
  document prevents it: `unregister()` does not stop a live page's controller, and neither
  `skipWaiting` nor `clients.claim` can preempt a running fetch handler. **What reduces it**
  is v133's install, which deletes EVERY cache unconditionally (no filter) and is triggered
  by the navigation sign-out performs. ⚠ **That is a mitigation, NOT a guarantee, and this
  record should not claim otherwise:** the worker update runs **asynchronously** alongside
  the navigation, so the next page can be usable before v133 installs, and an in-flight
  fetch from the discarded document can still land after the install-time delete. The
  residual is therefore **wider than the offline case** — it is any window before v133
  takes control (widest with no network, where it never installs, and on that device v132
  caches signed media on every page load regardless). **If it is ever worth closing, the
  remedy is a purge on first load UNDER v133 — cleanup after the new worker controls — not
  coordination ahead of the navigation, which the page cannot do.**

- ⚠ **SECOND RESIDUAL: THE SCRUB IS TAB-LOCAL, AND CROSS-TAB CLEANUP IS UNBUILT.**
  `sessionStorage` is per tab by spec, and sign-out only clears the tab it runs in and then
  reloads/redirects **that** document. There is **no** `onAuthStateChange`, `storage`-event
  or `SIGNED_OUT` handler anywhere in source (verified by grep over `public/newdesign`,
  `public/supabase.js`, `src` and `mobile-app/src` — zero hits for all three), so nothing
  propagates a sign-out to sibling tabs. A second open tab therefore keeps
  `shapeLiveWorkout`/`shapeLiveWorkoutResult` **and all of its in-memory user state** until
  someone closes it — on a shared device, exactly the inheritance this wave set out to stop.
  The remedy, if it is wanted, is a `storage`-event or `onAuthStateChange('SIGNED_OUT')`
  listener that runs the same scrub and reloads the sibling tab. **Not built here.**

- ⚠ **THE FLAT CURVE, AND WHAT ENDING IT LOOKED LIKE.** #1885 ran three rounds of exactly
  one P1 each, all in the same purge seam, rounds 2 and 3 being defects in the previous
  round's own fix. On round 3 the rule ([[the-miss-is-next-to-the-fix]]) was applied
  literally: stop patching and **check whether the finding's own remedy already exists one
  layer out**. Something was there — the review asked for "another purge after the
  controlled document is replaced", and v133's install delete-all is the nearest existing
  thing to it. ⚠ **But it is NOT that purge, and round 3's conclusion overstated it:**
  install runs *before* activation and control, so the old handler can still repopulate the
  cache afterwards. That correction came from review **on this very entry** (see the
  residual above); the actual remedy is still a purge on first load UNDER v133. The
  mechanism was conceded (verified from git history), the **consequence narrowed with
  evidence**, and a cheap-looking `registration.update()` was declined because the
  navigation runs the same check anyway. ⚠ So the honest lesson is not "the remedy already
  existed one layer out" — it is **"stop patching the seam and go look one layer out",
  which here found a mitigation that was then misread as a closure.**

- **#1889 — Gyms off the canonical nav chrome.** A reachability
  sweep of all 51 root `public/*.html` files found the canonical `public/newdesign/**`
  surface carries **zero** links to any gym page — but `Nav.tsx`/`Footer.tsx` render on
  every Next route via `layout.tsx`, and `gyms.html` / `for-gyms.html` carry their own
  legacy navs into `marketplace.html`, `trainers.html`, `nutritionists.html`,
  `pricing.html`, `home.html`, `clients.html` and the rest. Removing four links takes gyms
  off the **canonical site chrome** — the Next `Nav`/`Footer` that render on every route.
  ⚠ **This entry deliberately makes NO reachability claim, and no cleanup may read one into
  it.** Two review rounds each found another live door right after one was written down:
  `public/sitemap.xml` still advertises `/gyms.html` and `/for-gyms.html` to search engines;
  `next.config.ts` still rewrites `/gyms` to the legacy page; and `public/404.html`'s
  "Popular destinations" links `gyms.html`, reached from **every unmatched Next route** via
  `src/app/not-found.tsx`. The general lesson is the one that cost three rounds: **an
  enumeration of entry points is never a proof that no others exist.** Deleting any of these
  pages requires its own fresh sweep at that time — not this paragraph.
  ⚠ **NO legacy page was deleted, deliberately.** The sweep's own "safe to delete" list was
  refuted by its own transitive analysis: five of its eight files are linked from
  `gyms.html`'s nav, `workout.html` from `trainer-dashboard.html` (which coaches are
  **redirected** to after claiming a profile), and `reset-password.html` from the live
  `login.html`. Deleting them would have produced real 404s. `next.config.ts`, `sitemap.xml`,
  `robots.txt`, `manifest.json` and `sw.js` are all untouched; the pages still answer by
  direct URL. ⚠ Also checked and **refuted**: a claim that `sw.js` precaches a non-existent
  `styles.css` (which would silently disable the worker, since `cache.addAll` rejects
  wholesale on one 404) — the file exists and all 29 precache entries resolve on disk.

- **Owner ruling carried — but review REFUTED half its rationale.** Both offline durability
  queues (`shape.pendingAssignments`, `shape.careerAwardPending`) are still deliberately
  **kept**. For the assignment queue the reasoning holds: `drainAssignmentQueue()` records
  that client-side owner partitioning was removed on purpose, `publish_client_week`
  re-verifies the coach server-side, and — the property that makes that safe — **a refusal
  SURFACES** (house event + `console.error`) instead of vanishing.
  ⚠ **`shape.careerAwardPending` copied the no-partitioning stance without EITHER property
  that makes it safe** ([[copied-guard-loses-its-rationale]]):
  it stores a bare post ID with **no owner**, and session init replays it for whoever is
  signed in (`shapeBackend.js:507` → `ShapeCareerAward.catchUp()`); `award_work_milestone`
  matches `author_id = v_uid`, so for a different account it returns
  `{granted:false, 'not_a_milestone'}` **with no error**; and `careerAwardCatchUp()` removes
  the key on any non-error response (`shapeBackend.js:5335-5338`).
  So in exactly the shared-device scenario this wave is about — A signs out, B signs in —
  B's session **submits A's post ID under B's identity and then silently destroys A's
  retry**. Keeping the key does not preserve A's award; it guarantees its loss. **Both
  halves of the carve-out's stated premise ("content at rest only", "wiping loses the
  award") are false for this key.**
  ⚠ **NOT fixed here** — this is the records PR and the fix changes behavior on the points
  path. The fix is to owner-partition the key (store `{uid, postId}`, replay only on a uid
  match), which keeps the durability intent that scrubbing would lose; surfacing the refusal
  the way the assignment drain does is the second half. **Owner call, and it should not sit
  long.**
  Registered, untouched: the `/api/auth/session` GET-bridge redesign.

### 2026-08-14 — The security sweep: a live privilege-escalation P1, the booking account gate, the roster dedup, an open-redirect sweep (#1880 → `e3de8790c`)

- **Four items off the standing audit list in one PR**, plus a P1 the review found in this PR's
  own work. Four migrations, all applied and re-verified live. Handoff:
  **[`docs/HANDOFF-2026-08-14b.md`](HANDOFF-2026-08-14b.md)**.

- ⚠ **THE P1 WAS LIVE ON PRODUCTION, AND ITS COMMENT NAMED THE WRONG DIRECTION.** The
  cancel-only trigger's provider exemption checked the **NEW** row's provider, with a comment
  saying that stopped "a repoint away from their own row". True, and the mirror image of what
  matters: it let a caller repoint a booking **TO** their own listing and be exempted for it.
  Not exotic — **coaches are members**, so anyone with an approved listing who books another
  coach is simultaneously the client and a provider owner. As that caller, one PostgREST UPDATE
  moved `provider_id` to their own listing, set `status='confirmed'`, reassigned `client_id` to
  a **different member**, and set an attacker-controlled `meeting_url` — attaching a confirmed
  session, with a link they control, to someone who never booked it. Fixed by keying the
  exemption on the **OLD** row and freezing `provider_id`, `provider_role` and `client_id` even
  for the coach: *owning a booking is not the same as owning who it is with.* Nothing was
  exploited — `sessions` holds 0 rows.

- **Booking requires a signed-in account, and the route check is only half of it.** Anonymous
  booking was a denial-of-availability vector: the row is written `status='requested'`,
  `/api/availability` treats `requested` as booked, and a partial unique index denies the slot a
  second way — so anyone with no account could fill a coach's calendar until real prospects saw
  no availability. ⚠ **On its own the route-level check would have been decorative:** RLS carried
  an `anon_insert_sessions` policy granted to BOTH anon and authenticated whose only test was
  `status = 'requested'`, so a caller could write the row **straight to PostgREST with the
  publishable key that ships in every page**, bypassing this route, its captcha and the proxy rate
  limiter. `2026-08-11-consultation-requires-account.sql` replaces that policy. Identity is taken
  from the **account**, never the request body — the old shape let a caller put anyone's address
  in `clientEmail` and have Shape mail them a calendar invite.

- **RLS on `sessions`.** `client_cancel_sessions` is `requested|confirmed → cancelled` only, and
  a `BEFORE UPDATE` trigger freezes the booking **wholesale** via an allowlist
  (`to_jsonb(new) - 'status' - 'updated_at'`), so a column added later is frozen by default.
  ⚠ **The provider policy it depends on had to converge too:** permissive policies OR-combine
  **per phase**, so an UPDATE passes if ANY policy's USING admits the old row and ANY policy's
  WITH CHECK admits the new one — *not necessarily the same policy*. `2026-04-18` declared
  `provider_update_sessions` with `with check (true)`, which would have OR-ed past the whole fix
  on a rebuild-from-files.

- **Open-redirect sweep, 7 sites.** `/\evil.example` clears a `startsWith('/')` check and
  browsers normalise the backslash into a protocol-relative jump. Four server sites now call
  `safeReturnPath` (`src/lib/safe-redirect.mjs`, from #1471 — it already existed, and its own
  comment falsely claimed to "mirror" the inline guards); three client copies that cannot import
  it restate the rule.

- ⚠ **ONE COACH COUNTED TWICE.** `get_my_shared_clients` emitted one row per **subscription**, not
  per counterpart. Neither `owner_id` column is unique and `subscriptions` has no uniqueness on
  `(client_id, provider_role)` (both re-verified live), so one coach holding two listings of the
  counterpart role — with the client subscribed to both — came back twice. Every consumer keys the
  pair by **owner** (`shared_client_acks` is `(coach_user_id, client_id, counterpart_user_id)`, the
  thread RPC takes `p_other_user_id`, the React `rowKey` is `clientId|counterpart.userId`), so that
  lands as duplicate keys, a **doubled badge for one person**, a shared busy state, and one
  acknowledgment dismissing both rows. Deduped per owner, ordered so the surviving listing is stable
  between reads. Collapsing cannot hide a second discipline: the caller covers at least one role for
  that client and every covered role is excluded for everyone, so all surviving rows share the one
  role the caller does not cover.

- ⚠ **THE `pg_temp` CI GUARD IS SPLIT OUT OF THIS PR AND IS NOT MERGED.** It lives on
  **`parked/definer-pg-temp-guard` (`64fef55ed`)** with all 20 vectors and 8 mutation-checked
  properties intact. **Until it merges nothing enforces the forward rule** — the
  `2026-08-09` sweep still pins the live database (0 of 134 definers missing `pg_temp`), but a
  replayed pre-sweep migration is caught by nothing. Do not read the sweep as covering the forward
  case. The registered replacement is **a real parse, or applying the migrations to a throwaway
  Postgres and reading `pg_proc.proconfig`** — the authoritative check that ends the class instead
  of closing it one corner per round.

- ⚠ **WHY IT WAS SPLIT, BECAUSE THE SHAPE OF THE LOOP IS THE LESSON.** Six consecutive review
  rounds (8–13) landed on that one 746-line SQL scanner, and **every finding was a genuine false
  negative** — the guard reporting *clean* about an unpinned `SECURITY DEFINER`, which is strictly
  worse than a false alarm. They were also **every one latent**: measured, not assumed, the guard's
  live scope is **4 post-sweep migrations and 2 definer declarations**, with **0** occurrences of
  the exotic constructs across all 198 migrations. Round 13 was round 12 one character class wider
  (Postgres treats **any non-ASCII byte** as an identifier character, so an ASCII-only token
  boundary closed `foo$tag$` and left `é$tag$` open — reachable only because the rule existed in
  **two copies**, one per scanner). The repo's own rule (`the-miss-is-next-to-the-fix`) says a flat
  findings curve means *change approach, not patch again*. A hand-rolled lexer will keep differing
  from Postgres's in ways no backstop catches, because **"I mis-recognised a token" cannot be
  self-detected** — the `unverifiable` refusal added in round 12 catches what the scan cannot
  *finish*, not what it mis-reads and then finishes cleanly. Meanwhile the security work had not
  moved since `c95373fbe`. Separating them let verified fixes ship and ended the loop in one step.

- **The four migrations, all applied + verified live 2026-08-14:**
  `2026-08-09-definer-pg-temp-sweep` (**0 of 134** definers missing `pg_temp`) ·
  `2026-08-10-shared-clients-roster` (definer, `search_path=public, pg_temp`, anon denied) ·
  `2026-08-11-consultation-requires-account` (exactly one INSERT policy on `sessions`;
  `anon_insert_sessions` gone) · `2026-08-14-client-session-cancel-only` (trigger live in the
  **fixed** old-row shape).
  ⚠ **`2026-08-14` was applied TWICE** — the first application shipped the P1 above. A database
  whose `sessions_guard_client_update` matches `new.provider_id and t.owner_id` is the
  **vulnerable** version and must be re-run.
  ⚠ **`2026-08-10` was RE-RUN by the owner for the dedup and verified live 2026-08-14** — the live
  `get_my_shared_clients` carries `distinct on`, the `coalesce(t.owner_id, n.owner_id)` key, an
  `order by` leading with `s.client_id` (which `DISTINCT ON` requires) and the deterministic
  `s.provider_id` tiebreak, i.e. the **current file** rather than an older copy replaying over it.
  Its guard now fails loudly if an older copy is ever replayed.

- **Behavioural proof on production** (rolled back; `sessions` holds 0 rows):
  `ATTACK repoint + self-confirm + reassign : BLOCKED` · `client self-confirm : BLOCKED` ·
  `client cancels own booking : works` · `coach confirms own booking : works` ·
  `coach reschedules own booking : works`. The roster dedup was proven the same way on temp
  mirrors: **2 rows before, 1 after, one distinct human throughout.**

- ⚠ **A because-clause is a claim, and it can be backwards.** The P1's comment described one
  direction correctly and missed its mirror. Two comments in this PR asserted mechanisms that were
  false; both were corrected rather than softened. **Enumerating fields is a losing game** — the
  field freeze named five columns and left six writable, including the coach's own `notes`; the
  allowlist is the shape that survives a new column. And **the repo cannot reproduce production's
  security posture**: `provider_update_sessions` is owner-scoped live but was `with check (true)`
  in the migration file — the same class as the already-registered `trainers`/`nutritionists`
  anon-read policies. **Verify live; do not read the file and conclude.**

- ⚠ **THE FINAL ROUND'S P1 WAS A FALSE ALARM, AND VERIFYING IT BEAT COMPLYING WITH IT.** Review
  reported that booking would 401 for existing users: `/login` redirects to `/login.html`, whose
  plain client persists the session to **localStorage** (`shape.auth`), not the SSR cookies
  `currentUser` reads. Both of those clauses are **true** — `src/app/login/page.tsx` is literally
  `redirect('/login.html')`. The consequence is not: `login.jsx`'s `finishLogin` POSTs the tokens to
  **`/api/auth/session`**, which calls `setSession` on the SSR client and sets the cookies, on both
  the password and phone-OTP paths; the bridge is present in the precompiled `nd/login.js` that
  production actually serves. Refuted with the file-by-file chain rather than patched. The residual
  it does point at — the bridge swallows failures (`.catch(() => {})`) — is already handled
  deliberately: the booking path honours a server 401 over its own local check, with a comment
  naming exactly that divergence. **Forwarding a Bearer on the booking fetch would close it and is
  registered with the auth-return-path follow-up**, not bolted onto a security PR at merge time.

- Suite **1514** (the 5 guard tests moved to the parked branch); `tsc` clean; CI green on the final
  head (Web · Mobile · gitleaks · Tests). Branch **kept**.
  **Open:** the `pg_temp` guard follow-up (from `parked/definer-pg-temp-guard`, which cannot base
  on pre-merge `main` — its `SWEEP` cutoff references `2026-08-09-definer-pg-temp-sweep.sql`, which
  this PR introduces) · the auth-return-path follow-up (recovery point `7e7c3f044`;
  `git diff 39b4c3a26 7e7c3f044` is the patch to re-apply, plus the **unwritten** legacy signup
  email-confirm leg — `signup-client.html` bounces to a bare `login.html` and `public/supabase.js`
  sets no `emailRedirectTo`, so `next` survives only auto-confirm).

### 2026-08-14 — The direct-conversation RPC restored + the meal note stops asserting what it never checked (#1876 → `ed3582a1f`)

- **The bug:** `public.get_or_create_direct_conversation` is declared by
  `2026-05-02-conversations-messages.sql` but was **never created in production**.
  Found by the 2026-08-05 schema-drift audit (174 live functions and 218 live policies
  diffed against `supabase-migrations/`); it is one of **eight** declared-but-absent
  functions and **the only one live product code calls**.

- ⚠ **THREE live callers, three different failure modes, and the worst one failed
  silently.** ⚠ *The first published version of this entry — and the migration header
  it was drawn from — said **two**. Codex caught the omission on the changelog PR;
  both are corrected, and the miss is left on the record because an inventory that
  undercounts is worse than no inventory.*
  1. `api/nutrition/meal-note/route.ts:135` — the mobile meal logger's "dispatch to
     coach". Uploaded the voice memo and photo to storage **successfully**, looped the
     member's coaches, called the missing function, and hit
     `if (convErr || !conversationId) continue;`. Returned **HTTP 200 with
     `delivered:false`**, and the client only toasted on success — **silent**.
  2. `api/messages/direct/route.ts:84` — the "message this provider" button on
     `/trainers/[id]` and `/nutritionists/[id]`. **Loud** (400).
  3. `mobile-app/src/services/shapeBackend.js:1990` — `supabase.rpc(…)` called
     **directly from the client**, through no API route at all, via
     `sendProviderMessage` (`:2022`). ⚠ **Reached from the marketplace listing panel
     (`iosAppBroadsheetMarketplace.jsx:2119`) and ONLY for a REAL listing.**
     `resolveCoachProvider` (`:1886`) requires `provider_id`/`db_id`, so demo coaches
     (`bsmIsDemoCoach`, `:540`) — **and the meal/exercise-swap flows, which pass
     `{ name, provider_role }` with no id at all** (`iosAppBroadsheetClient.jsx:5212`,
     `:9235`) — resolve to null and save locally **without ever calling the RPC**.
     When it does call, it is **semi-loud**: the catch writes the thread locally and
     shows "Message saved locally" with the error text — copy that already anticipates
     this exact migration being unrun.

- ⚠ **ALL THREE CALLERS EXECUTE AS `authenticated`. NOTHING CALLS THIS RPC AS
  `service_role` — DO NOT NARROW THE GRANT.** Both API routes use the anon key with the
  caller's own session, not a service key: `messages/direct` via `createClient()`
  (`lib/supabase/server.ts:13`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`), and `meal-note` via
  `clientForRequest` (`lib/request-auth.ts:14-24`), which forwards a Bearer token when
  the native app sends one and otherwise falls back to the same cookie client. So a
  narrowing would break **all three** callers — and the mobile one **silently**, since
  it swallows the error into a local-save notice.

- **No in-app path can send a null role, so the RPC's null guard is a backstop rather
  than a hot path.** `normalizeProviderRoleForMessages` (`:1879`) falls through to
  `normalizeRole`, which returns `'client'` for anything unrecognised and **can never
  return null**. For a role outside trainer/nutritionist, `resolveCoachProvider` returns
  null and `sendProviderMessage` saves locally — **it never calls the RPC, so it never
  surfaces `Invalid provider role.`**. That raise is reachable only by calling
  `window.ShapeMessages.getOrCreateDirectConversation` directly (exported raw at
  `:5456`, with no membership gate), and a genuine **null** requires a hand-made
  PostgREST call, because no JS path can produce one.

- **Nobody has been affected, and that was verified rather than assumed.**
  `conversations` and `messages` are both **empty (0 rows)** in production, so no
  member has ever sent a meal note or a direct message. This is a defect that would
  fire on first real use, not damage already done. Nothing to backfill.

- **The restore is the 2026-05-02 original verbatim, with four deliberate changes**,
  each documented at its site: `search_path` pinned to `pg_temp`, the lost-race
  `unique_violation` handled, the grant narrowed to `authenticated`, and — the one
  that is a **behaviour fix rather than hardening** — the NULL-role bypass closed.

- ⚠ **`null not in (…)` IS NOT TRUE, AND THAT BYPASSED THE GUARD.** The original
  validated with a bare `p_provider_role not in ('trainer','nutritionist')`. Three-valued
  logic makes that **NULL** for a null role, and PL/pgSQL's `IF` treats NULL as false —
  so the one value the check most needed to reject walked straight through. Verified
  against production, a NULL role then did **all three** of these:
  - `p_provider_role = 'trainer'` is also NULL, so execution fell to the `ELSE` branch
    and looked the id up in `nutritionists` regardless of intent.
  - The existing-conversation lookup compares `provider_role = p_provider_role`, and
    `null = null` is null — so it could never match, and every call inserted a new row.
  - `conversations.provider_role` is **nullable** and its CHECK is
    `provider_role = any(array['trainer','nutritionist'])`. **A CHECK passes when it
    evaluates to TRUE *or NULL***, so the role-less row inserted cleanly — and
    `conversations_direct_unique_idx`'s predicate requires `provider_role is not null`,
    so the row was **not indexed** and uniqueness never applied. Repeated calls
    accumulate unbounded duplicates.

  For a **claimed** provider it is louder but not safer: the participants insert fails
  the NOT NULL on `conversation_participants.role` and the transaction rolls back.
  **41 of the 43 live listings are unclaimed**, so the silent-junk path is the common
  one. Reachability: `/api/messages/direct` rejects an unknown role before calling and
  the meal-note fan-out passes literals — but the function is granted to
  `authenticated`, so any signed-in member can call it directly through PostgREST and
  skip both.

- **The sibling sweep was closed by measurement, not by assertion.** The deciding
  question is the *target column's nullability*: nullable means silent junk, NOT NULL
  means a loud 23502. Of the five comparable `x not in (…)` guards,
  `conversations.provider_role` was the **only nullable one** —
  `coach_referrals.provider_role`, `ai_audit_log.source`, `analytics_events.event` and
  `consent_log.kind` are all NOT NULL. **Nothing out-of-scope was owed.**

- ⚠ **AND THIS PR'S OWN FIX ASSERTED SOMETHING IT NEVER CHECKED.** The honest failure
  notice added here told the member *"Your meal log is saved — only the note didn't
  send"*, which is exactly backwards in the state that reaches it most: `doLog()` fires
  the note dispatch and the macro write as **two independent unawaited requests**, and
  `logMealMacros` resolves to null on **every** failure with no queue and no retry
  (`shapeBackend.js:4979-5005`), so one offline moment — or one **402** from the
  `requireMembership` gate fronting **both** routes — takes down both legs. Worse, the
  wording was chosen to stop the member re-logging, and the affordance is *removed*
  either way (`mealTick` swaps the log button for a static `✓`).

- ⚠ **The remedy the review proposed would have regressed three ways, so it was not
  implemented as written.** (1) Keying on the log result uses a `null` that **cannot
  distinguish *failed* from *never attempted*** — `logMealMacros` returns null *before
  issuing a request* when signed out, so the warning would fire on the signed-out
  preview, the same never-attempted class as the `no_coach` branch. (2) Awaiting the
  sibling promise to find out is worse: its fetch has no AbortController and no
  timeout, so a hung socket would leave the notice unrendered — the void-reporting bug
  the notice exists to end. (3) `add_meal_macros` is an **accumulating upsert with no
  idempotency key**, so copy nudging a re-log permanently double-counts the day.
  **The notice now speaks only for the note, in both directions** — it claims neither
  that the log saved nor that it failed. **Two sites carried the claim; review named
  one.**

- **Scope, split honestly:** the *assertion* was added by this PR (64/2 inside
  `sendMealNote`); the *mechanism* — discarded result, unconditional `setLogged(true)` —
  is byte-identical on `main`. This PR did not break persistence reporting; it turned a
  silent wrong state into a confidently mis-stated one.

- **Tests:** `tests/meal-note-copy.test.mjs` guards the rule **in both directions**
  plus the two deliberately-silent paths (`no_coach`, nothing-attached). It is an
  honest **source-text** guard — the copy is inline literals in a ~9.7k-line component
  with no seam to mount — so it is **mutation-tested against the real file**:
  reintroducing the shipped sentence fails it, restoring the fix passes. It strips
  comments before asserting, or it would fire on its own rationale.
  `tests/broadsheet-confirm-notice.test.mjs` drives the confirm sheet. Suite **1514**.

- ✅ **MIGRATION APPLIED AND VERIFIED LIVE (2026-08-14).**
  `2026-08-08-restore-direct-conversation.sql` was first applied mid-review in an
  earlier form; the owner re-ran the final revision, and nine invariants were then
  checked against production directly: function exists · `SECURITY DEFINER` ·
  `search_path=public, pg_temp` · rejects a null role · handles `unique_violation` ·
  `anon` holds **no** EXECUTE · `authenticated` **does** · the orphaned
  `conversations_direct_pair_uniq` is **dropped** · `conversations_direct_unique_idx`
  is present.

- **The null-role rejection was confirmed BEHAVIOURALLY, not just by source shape** —
  worth recording because the migration's own guard is a `prosrc` text match, which is
  the weaker instrument. The function gates on `auth.uid()` before the role check, so a
  plain call can only ever raise the authentication error; impersonating a signed-in
  member with `set_config('request.jwt.claims', …, true)` gets past that, and a
  null-role call then returns **`Invalid provider role.`** with the `conversations`
  count unchanged at 0. The probe was wrapped in a `raise exception` so the whole block
  rolls back regardless of outcome — reusable for any `SECURITY DEFINER` function whose
  guard needs testing live without leaving rows behind.

- **Registered, not fixed here:** the pre-existing unconditional `MEAL · FILED` /
  `Logged ✓` stamp with a client-computed `dayCal = dayBaseCal + kcal` that never
  consults the server — strictly wider than the notice fixed here, and gating it on a
  server result breaks the signed-out preview and offline logging, so it is a design
  change; a **routing asymmetry flagged UNVERIFIED** (`sendMealNote` uses a bare
  root-relative fetch with no `apiBaseUrl` and no Bearer while `logMealMacros` uses
  both, which on a native Capacitor build would fail the note leg while the macro write
  succeeds — **no native build was run**); abuse-volume rate limiting on the RPC; and
  the open product call that an unclaimed provider listing is hidden from the
  marketplace list but its detail page is not.

- **Found while tracing caller 3, registered not fixed — `resolveCoachProvider` never
  applies `providerDiscipline()`.** `shapeBackend.js:1890` gates on
  `['trainer','nutritionist'].includes(providerRole)`, but
  `normalizeProviderRoleForMessages` can return `'dietitian'` — a role the file's own
  comment at `:79-83` says must be mapped onto the nutritionist rails "anywhere we pick
  a discipline". So a dietitian coach fails the gate, `resolveCoachProvider` returns
  null, and `sendProviderMessage` **silently saves the member's message to
  localStorage** instead of sending it. ⚠ **Currently dormant, and only for one
  reason:** the DB CHECK forbids `dietitian` as a stored `provider_role`, so no live
  provider row carries it. It becomes reachable the moment that ruling changes — which
  is the open question already tracked for the dietitian role. Not fixed here because
  this is a docs PR and the correct fix depends on that ruling.

### 2026-08-05 — The ✦ AI DRAFT is real: the six-mode contract (#1873 → `98a46340f`)

- **The bug, as the records had it since 2026-07-26:** both coach plan builders in
  `iosAppBroadsheetPros.jsx` `await window.ShapeAI?.generatePlanDraft?.({…})` **with no
  assignment**, render a "Generating…" state and an **✦ AI DRAFT** eyebrow, then build
  the outline from a hardcoded array. Every coach who tapped it got the same template,
  and the model call cost money to produce nothing.

- ⚠ **It was never "stop discarding the result", and that is the durable part.** The
  builders send buildType `mealplan|program|diet` (nutritionist) and
  `plan|workout|program` (trainer); `/api/ai/generate-plan` accepted **three** modes and
  **normalized anything unrecognized to `workout`**. So a nutritionist asking for a meal
  plan got **exercises back** — invisible only because the answer was thrown away — and
  the two `program` modes **collided without resolving wrongly**, so a rename could not
  fix it. The **six-mode contract** is the prerequisite; consuming the draft is the easy
  half. **No migration, no new route.**

- ⚠ **THE SHARED WEEK GRAMMAR FORCES `title` TO THE LITERAL "Week N".**
  `bsAssignWeekLine` (`planOutline.mjs:50`) requires a line to start `Week N`; one bad
  line makes `bsDraftOutline` return null (`:290`) and the **whole draft is refused** —
  which is this same bug arriving by a different route. So the server cannot put the
  phase in the title, and `newProgram.jsx` reads the phase out of **`detail`** instead,
  keeping `title` in `ref` so nothing is dropped. Review proposed the literal opposite
  fix; it was declined with the parser evidence and the equivalent effect implemented
  client-side.

- ⚠ **THE COUNT WE EMIT OWNS THE `duration` STRING — on BOTH paths.** `newProgram.jsx`
  sizes its week `<select>` from `duration` (`:172`) and reads each row's week from
  `label` (`:176`), so a six-block arc answering a "4 weeks" request produced `W5`/`W6`
  — values that range has no option for. A `<select>` whose value is not among its
  options **paints the first one**, so the page showed W1 while state held 5 and 6, and
  touching the row committed the wrong week. Fixed on the fallback branches
  (`arcWeeks`), then found **still live on the MODEL path** (`withServerLabels` stamped
  labels without reconciling duration) and fixed there too. `arcWeeks` only trusts a
  caller's number when it actually says **weeks** — the mobile trainer sends its
  session-length chip ("45 min") in that same field, and reading 45 out of it would
  answer a one-hour request with a 45-week arc. Rewriting `duration` rather than
  truncating `blocks` is deliberate: dropping surplus weeks discards authored content
  with nothing on screen to say so.

- ⚠ **CANCEL MUST RELEASE THE BUSY/STATUS PAIR ITSELF, AND THE RELEASE IS RUN-SCOPED.**
  Cancel bumped the run id but left `draftBusyRef`/`draftStatus` set; the only other
  writer is the `finally`, which cannot run until the abandoned fetch settles — up to
  `GENERATE_TIMEOUT_MS` (45s). So a coach who cancelled and reopened found the button
  reading "Generating…" and dead, for a run they had walked away from — **blank mode
  too, which never touches the network**. And once CANCEL frees the pair, a second
  generation can already be in flight when an abandoned one settles, so an
  unconditional release would clear the **current** run's flag mid-flight and let two
  live runs both reach `setEditDraft`. The release is scoped to the run that acquired it.

- ⚠ **`fetch` RESOLVES ON HEADERS, so racing it bounds the CONNECTION, not the answer.**
  A 200 followed by a stalled JSON body left `response.json()` unwatched. With an
  `AbortController` the timer's `abort()` still rejects the read; the **no-controller
  fallback — the older WebViews the whole branch exists for — had no second bound at
  all**, and the draft sheet sat on "Generating…" indefinitely. The body read now races
  the **same** `deadline`, keeping the budget a total rather than giving each phase its
  own 45s.

- ⚠ **A 200 IS NOT PROOF AN AI DRAFT EXISTS.** The route answers OK carrying
  `source: 'template'` when it has no `OPENAI_API_KEY` or the model call throws, and
  that payload would **shadow the builder's own floor**, which is strictly more specific
  on both surfaces (the workout floor names the coach's chosen FOCUS; the nutrition
  floor carries a `Grocery + prep guide` line the server's blocks drop). Mobile now
  asserts positively on `source === 'openai'` and falls to its documented floor. This is
  **MOBILE-only** — the website calls the route directly and WANTS the server template.

- **Longer arcs cycle rather than clamp.** `arcWeeks` accepts up to twelve weeks;
  `WEEK_ARC` holds six and `NUTRITION_ARC` only **four**, so clamping to the final index
  answered a long request with seven consecutive "Retest" rows — **nine "Lock it in"** on
  the nutrition side, which review did not flag. Both arcs now cycle with the last week
  reserved for the terminal phase; at each arc's own length the output is unchanged.

- **Seven review rounds, and the shape of them is the lesson:** every round after the
  first found a defect **adjacent to the previous fix** — fallback path → model path,
  training arc → nutrition arc, connection bound → body bound. Round 7 was the first
  that surfaced nothing new. ⚠ **A guard is only trustworthy if it fails via the RIGHT
  test:** every guard here was mutation-checked, and one nearly shipped weak — the
  arc-cycling test first hardcoded `length - 1`, which would have tested the rule typed
  into the test rather than the one the route runs (a change to `.length` would have
  stayed green). It now reads **both** the arcs and the divisor out of the source.
  ⚠ **Scope a source guard to the function, not the file:** an unraced
  `await response.json().catch(() => ({}))` is the ordinary shape everywhere else in
  `shapeBackend.js`, so a file-wide `doesNotMatch` fails on code that is not the defect.

- Suite **1505/1505** · `tsc --noEmit` clean · mobile build exit 0 · newdesign
  precompile check exit 0 · CI green (Web · Mobile · gitleaks · Tests) · **Codex clean**
  on the final head and **CodeRabbit confirmed** every finding with none outstanding.
  Branch `claude/ai-draft-real` kept. **Open:** the OWNER on-device pass — tap ✦ AI DRAFT
  in both builders across all six modes, cancel mid-generation and reopen (the button
  must be live), and confirm a website program's week rows match their labels.

### 2026-08-04 — The gates actually gate: CI runs the suite, the hook stops lying (#1869 → `77a064895`)

- **`npm test` now RUNS in CI on every PR — it is NOT yet a merge gate.** The whole
  suite — every mount test included — was enforced ONLY by the local pre-commit hook,
  which is bypassable (`SKIP_VERIFY=1`) and only armed on a machine that ran the
  SessionStart hook. New **`Tests (unit + mount)`** job in `ci.yml`. ⚠ **OWNER: add it to
  `main` branch protection (Settings → Branches)** — a job in `ci.yml` is **advisory**
  until it is in the required list, so until then a PR can merge with the suite RED and
  the hook is still the only thing standing between a broken test and `main`. Verified
  live 2026-08-04: the required contexts are **three** — `Web (typecheck + build)`,
  `Mobile (build + public/m sync)`, `Secret scan (gitleaks)`. Re-check before ever
  writing that the suite is enforced.
- **The hook's classifier was wrong three ways, each producing a false "all checks
  passed" on unverified code:**
  - **The mobile arm judged 321 of 791 tracked `mobile-app/` files**, while the deletion
    arm skipped **all** of them on the stated grounds that the mobile arm had already
    judged them. It had not. And the skip pattern `mobile-app/*` matches all 791 (`*`
    crosses `/` in a `case`), so it contributed a mobile build for **exactly zero**
    paths while reading like a decision.
  - **`--diff-filter=ACM` made deletions invisible**: a deletion-only commit ran
    NOTHING — no parse, no tsc, no suite, no build — and exited 0. Deletions are now
    collected (`--diff-filter=D --no-renames`, so a rename shows its OLD path) with a
    both-lists-empty early exit.
  - **The deletion arm enumerated what counts as code, and the list went stale twice in
    one PR.** First it inherited the parse arm's path exclusions, so deleting
    `public/vendor/supabase-js` (loaded by **67** pages) reported a clean pass; the fix
    left a JS/TS **extension** list, so deleting `gridstack.min.css` (**8** pages) did
    the same. It now enumerates **nothing**: both flags, every deleted path. Measured
    cost — 5 of the last 300 commits delete anything at all.
- ⚠ **A `mobile-app/public/` asset deletion is UNGATED end to end, deliberately, and it
  is written down at the deletion arm rather than dropped.** Measured, not assumed: with
  `shape-logo.png` moved out, `VITE_BASE=/m/ npm run build` **exits 0** without naming
  it, the emitted bundle still requests `shape-logo.png?v=2` **three times**, and `dist/`
  does not contain it. `tsc`, `next build`, gitleaks and the suite are equally blind —
  the only referenced-file-exists check in the repo is `build-newdesign.mjs:110`, which
  covers website `.jsx` script tags. **The first sign is a broken image in the app.**
- **A checker for exactly that was built here and CUT before merge.** It worked — it
  caught the deletion by file and line. But it decided code-vs-comment with a line-local
  regex, and that is a **lexing** problem a regex cannot solve: seven review rounds all
  landed on that one seam, and an adversarial reproduction pass found **seven defects
  across four mechanisms** still open, **two of them false ALARMS** (red CI on a correct
  tree — a commented-out `${BASE_URL}x.png`, and a commented-out URL composition sitting
  above a live one). A check a developer cannot fix except by editing the checker teaches
  `--no-verify`, which also disables the mount tests. **Registered, not solved:** an
  AST-based version. ⚠ **`90f92f743` — tag **`parked/asset-refs-checker`** — is a
  STARTING POINT, not something to re-land as-is** — it is the file with the seven open
  defects above, and its `isCommented` regex IS the defect. Replace the lexing with a
  real parse before any of it returns; re-landing it verbatim revives every false alarm
  listed here. The forward/reverse pass structure and the three declared maps are the
  parts worth keeping. It needs
  `@babel/parser` declared (it is in NEITHER manifest today — root resolves **8.0.4**,
  mobile-app **7.29.7**), which regenerates `mobile-app/package-lock.json` — the lockfile
  **`codemagic.yaml` consumes to build the iOS TestFlight IPA on every push to `main`**.
- **12 Codex rounds.** ⚠ **The durable lesson, logged because it recurred six times: a
  because-clause is a claim.** Six comments in this PR asserted a mechanism that was
  false — including one written to fix the previous false one, and one that named a
  "step 5" the file does not have (there are four). Two guards written to ban
  enumeration **were themselves enumerations**. Rounds 9–11 found the same defect from
  three sides: *derive* a rule and it switches itself off when its subject appears;
  *declare* it and it stays on after its subject leaves; read the declaration from raw
  text and a comment keeps it alive with no subject at all.
- Suite **1458/1458** · tsc clean · CI green (Web · Mobile · gitleaks · Tests). Branch
  kept.
- **Session handoff: [`docs/HANDOFF-2026-08-04.md`](HANDOFF-2026-08-04.md)** — covers
  2026-07-31 → 2026-08-04 (four sessions shipped in that window without one), the
  outstanding owner actions, and the records sweep that flipped six false "not yet
  merged" claims in this file.

### 2026-08-02 — Boundary-caught React crashes now reach Sentry, on BOTH app surfaces (`d3e014e58` · `8d34612b2` · `f757fe07b` · `76817a46a` · `9d59de1ca` · `d2a99def8`, branch `claude/sentry-boundary-crashes` — **MERGED as #1868 → `5e16898b6`**)

- **Five build tasks, spec at `docs/superpowers/specs/2026-08-02-boundary-crashes-sentry-design.md`,
  plan at `docs/superpowers/plans/2026-08-02-boundary-crashes-sentry.md`.** Layer 1 wired the
  SDKs into all three runtimes; this closes the hole Layer 1 could not: **an error boundary
  that catches a crash prevents that crash from ever reaching `window.onerror`**, so Sentry's
  global handlers are structurally blind to it. Boundary-caught render crashes — the TDZ /
  hook-order class this repo has actually shipped (#1781) — were going to `localStorage` and
  nowhere else.

- ⚠ **Still nothing is being captured anywhere.** No Sentry organisation, no DSN; every
  surface stays in the documented inert state. This is the same pre-account scaffolding
  posture as Layer 1, and the same caveat applies verbatim: do not read "wired" as "live."

- **Mobile (`/m/`): one new seam, one line of wiring.** `bsCaptureBoundaryError(err, info)` in
  `mobile-app/src/sentry.mjs` — the only mobile module allowed to touch the SDK, every export
  wrapped in its own `try/catch` so reporting can never take the app down. Called from
  `BSErrorBoundary.componentDidCatch` (`iosAppBroadsheetMain.jsx`) and **nowhere else**.
  ⚠ **The capture deliberately does NOT live in `bsRecordError`**, even though that is the
  shared recorder and would have looked tidier: the `window` `error`/`unhandledrejection`
  listeners call `bsRecordError` too, and the SDK's own global handlers already capture those
  — so wiring it there would double-report **every** uncaught error the moment a DSN exists.
  The fallback card (Copy / Reload / Restart) is untouched.

- **Web (Next App Router): the two error components that did not exist at all.** Before this,
  `src/app` had **no `error.tsx` and no `global-error.tsx`** — a client render crash on
  `/dashboard` or `/console` showed Next's unbranded default page and reported nothing,
  permanently. Both now exist, sharing `src/components/ErrorCard.tsx`.
  ⚠ **`ErrorCard` uses inline styles, not Tailwind, and that is load-bearing, not a style
  lapse** — `global-error.tsx` mounts only when the **root layout itself** crashed, i.e. with
  no stylesheet loaded, so a Tailwind class there is dead markup. It also uses a plain
  `<a href="/">` rather than `next/link`, which would want router context that may not exist
  at that point.

- **`crash_type: 'boundary'` on every capture, and the tradeoff behind it (owner call).**
  `mechanism.handled` stays `true` because the boundary shows a recovery card and the session
  continues. ⚠ **The consequence, recorded so it is not rediscovered later: handled events do
  NOT count against Sentry's crash-free session rate**, so a recurring render crash that
  white-cards a feature would stay invisible in release health. The tag is the compensating
  control — it keeps boundary crashes filterable and alertable (an issue alert on
  `crash_type = boundary` is an owner-side option once the org exists). **Do not "fix" this by
  flipping to `handled: false`** without revisiting the decision. The tag is set in an
  isolated scope; a test asserts it does not leak onto unrelated events.

- **Sentry's dedupe was VERIFIED, not assumed** (owner requirement — a render loop on the free
  tier burns the monthly quota in minutes). A test fires the identical capture twice and
  asserts exactly **one** envelope leaves. It does, so **no local guard was added**. ⚠ That
  test initializes `@sentry/react` directly against a mock transport and never touches
  `@sentry/capacitor`, so it evidences the shared **core** dedupe — not the Capacitor init
  path the app actually boots through. Two honest limits: Sentry's dedupe only suppresses
  **consecutive identical** events (an A-B-A alternation passes through), and the premise the
  app's own path rests on — that `bsInitSentry()` never disables the SDK's default
  integrations — is still **not test-guarded**, but it is now **VERIFIED AT SOURCE**
  (2026-08-02): `@sentry/capacitor`'s `getDefaultIntegrations`
  (`dist/esm/integrations/default.js`) explicitly pushes `dedupeIntegration()`, `sdk.js`
  applies those defaults whenever `passedOptions.defaultIntegrations === undefined`, and
  `bsInitSentry` passes neither a `defaultIntegrations` nor an `integrations` key. A test
  pinning it: registered, not built.

- **Two deliberate crash triggers ship with this, because the end-to-end gate needs something
  to pull.** `/m/?crash=1` (same URL-param pattern as the `?mem=1` HUD) and
  `/dashboard/crash-test`.
  ⚠ **The web one is inside the gated `/dashboard` segment on purpose** — the layout redirects
  anonymous visitors to `/login` server-side, so crawlers cannot reach it and manufacture
  Sentry noise once a DSN exists. Its throw is armed **after hydration** (a state flip in an
  effect), never during render: a render-time throw would fire during SSR and be captured as a
  **server** error, which is not the path being tested.
  ⚠ **`?crash=1` strips itself from the URL (`history.replaceState`) before throwing, and that
  is not cosmetic.** Review caught that without it the crash card's own buttons cannot escape
  it: "Reload" is a soft `setState` reset that re-reads the same unchanged `location.search`,
  and "Restart app" reloads the same URL query-string included — so both re-fire the crash
  instantly and anyone who opened the link is stranded until they hand-edit the address bar.
  The strip persists nothing (history entry only) and touches no card code.
  ⚠ **`?crash=1` is SIGNED-IN ONLY too** (Codex round 4). It shipped reachable by any
  anonymous visitor, so once a DSN exists someone could load `/m/?crash=1` on a loop and
  inject deliberate exceptions until the monthly quota was gone — the web trigger had
  `/dashboard` in front of it, this one had nothing. ⚠ **And the gate had to move to
  `BSAppShell`, which is the non-obvious half:** auth hydrates asynchronously
  (`getCachedState()` is empty on the first render and fills in when `getCurrentSession()`
  resolves), and `BSApp` — where the probe used to render — never re-renders on auth. A
  signed-in check there would have read false at mount and never re-fired: a permanently
  dead trigger that looks correct in review and only fails during the owner's live gate.
  `BSAppShell` holds `authState` and re-renders when the session lands, and it is still
  inside `BSErrorBoundary` (which wraps the whole app at the module root), so a triggered
  crash still takes the exact `componentDidCatch` → Sentry path a real fault takes.
  `bsCrashTestRequested` stays pure and total — the auth read is at the call site, never in
  the helper. `tests/broadsheet-identifiers.test.mjs` pins BOTH facts against the AST (armed,
  and still session-gated), because nothing executes that line: the mount test stubs
  `react-dom/client`, so neither component ever renders.

- **Mount-tested for real, which is the whole point.** `componentDidCatch` never runs under
  `renderToString`, so the existing server-render harness could not have caught any of this:
  the new tests use `jsdom` + `react-dom/client` + `React.act` to actually mount. New files:
  `tests/helpers/load-real-module.mjs` (compiles the REAL shipping module in memory, JSX/TSX →
  CJS, imports resolved from a registry — generalizes the `broadsheet-render.test.mjs`
  pattern without touching it), `tests/error-boundary-mount.test.mjs`,
  `tests/web-error-boundary.test.mjs`, `tests/sentry-boundary-seam.test.mjs`.
  ⚠ **`jsdom` had to be added as an explicit root devDependency** — it was present only
  transitively, so these tests would have passed locally and failed on any fresh checkout.

- ⚠ **A finding worth more than this PR: `.github/workflows/ci.yml` NEVER RUNS `npm test`.**
  No workflow in the repo contains `npm test`, `npm run test`, or `node --test` (verified
  directly). The web job runs `npm ci` → `tsc --noEmit` → the newdesign precompile check →
  `next build`; mobile runs its Vite build; plus gitleaks. So the entire **1439-test** suite,
  including every mount test above, is enforced **only** by the local pre-commit hook — which
  is bypassable (`SKIP_VERIFY=1`) and only armed on a machine that ran the SessionStart hook.
  A mount test CI never executes is not a gate. **Not fixed here** (adding a required check
  changes every future PR — owner's call), but it is the single most load-bearing gap this
  work surfaced.

- **The end-to-end gate is DEFERRED, not skipped, and this work is not DONE until it runs.**
  Every gate this PR passes — 1439/1439 tests, `tsc` clean, `next build` clean, mobile Vite
  build clean, CI green — would pass **identically against a broken DSN, a wrong project slug,
  or an org that does not exist**. A mock transport proves the seam, not the delivery (the
  same rule set for Layer 2's alert routing). **Owner steps once the Sentry org exists:** open
  `/m/?crash=1` and `/dashboard/crash-test`. ⚠ **For the web one, sign in as an ADMIN, a
  TRAINER, a NUTRITIONIST, or an ACTIVE subscriber — those are the only four that pass** —
  because `src/app/dashboard/layout.tsx` renders the members-only paywall *instead of*
  `children` for anyone else, so the page never mounts, throws nothing, and the gate fails
  silently while looking like a Sentry problem.
  ⚠ **"Coach" is NOT a safe shorthand here, and the reason is a real pre-existing bug**
  (found by Codex on #1868, NOT introduced by it and deliberately NOT fixed in it):
  `src/lib/roles.mjs:13` defines the canonical `COACH_ROLES` as trainer + nutritionist +
  **dietitian**, and `src/lib/membership-core.ts:56` mirrors all three by explicit comment —
  but `dashboard/layout.tsx:28` grants coach access to `trainer` and `nutritionist` only. So
  **an approved dietitian with no active subscription is shown the paywall on `/dashboard`**,
  contradicting both the canonical role model and membership-core's own stated rule. That is a
  live access bug for real dietitian coaches, far wider than this crash-test page; it needs its
  own PR, because changing a `/dashboard` auth gate is not a drive-by edit in a Sentry PR.
  Confirm **one** event each arrives in
  `shape-mobile` and `shape-web` respectively, with a **symbolicated, readable stack** and the
  distinctive messages `Deliberate crash test (mobile boundary)` / `Deliberate crash test (web
  boundary)`. Honest limit: the React component-stack context is a client-generated string, so
  component names within it may be minified in production bundles — the symbolicated exception
  stack is the readability guarantee, the distinctive message is the arrival guarantee.

- **Out of scope by design** (spec, owner-approved): per-surface boundaries inside the `/m/`
  role apps (a product/UX change — a crash in one tab still white-cards the whole app);
  static-website boundaries (it has none, so its crashes rethrow to `window.onerror`, which the
  shipped `sentryInit.js` global handlers already cover); user context on the two web surfaces
  (already a registered Layer 1 follow-up).

### 2026-08-01 — Error tracking Layer 1: Sentry wired into all three runtimes, completely inert (`924520d3b` · `1f8257fa8` · `c9b53e039` · `df750998b` · `175ef5b1a` · `212df6df4` · `80863f847` · `7415764ce` · `78fbdbaab`, branch `claude/error-tracking-layer-1-sentry` — **MERGED as #1866 → `9d0bf52c5`**)

- **Six tasks, plan at `docs/superpowers/plans/2026-08-01-error-tracking-layer-1-sentry.md`.**
  Governing constraint: no Sentry DSN exists anywhere, so every surface must build and run
  correctly with the env vars absent — this ships to production before the Sentry account
  is created. The plan itself recorded two corrections against the original request before
  a line of code was written: the mobile app is **Capacitor**, not React Native (so a
  `reactNative` setup wizard matches nothing here — this repo is `@sentry/capacitor` +
  `@sentry/react`), and `roles` is an **array** with `dietitian` as an alias for
  `nutritionist` — a boolean `is_coach` alone would erase real dual-role accounts.

- ⚠ **Do not read this as "error tracking is live." It is not — nothing is being captured
  anywhere yet.** There is no Sentry organisation and no DSN, so all three SDKs sit in the
  supported pre-account state (`Sentry.init({dsn:''})` and its Capacitor/classic-script
  equivalents construct no transport at all; every `capture*` call is a documented no-op).
  This is scaffolding, wired to switch on the moment a DSN exists and switched off until
  then — the single most important framing constraint on this whole entry.

- **Task 1 — the shared tagging module, `src/lib/sentry-context.mjs`** (`924520d3b`, hardened
  `1f8257fa8`). One pure module defining the only three fields Sentry may ever see about a
  person: user id, `roles` (the array, not a derived string), and `is_coach`.
  ⚠ **It is APPLIED on the `/m/` mobile app only** — `bsSetSentryUser` is called from
  `getCurrentSession()` on every session resolve and cleared on sign-out. The Next.js
  browser surface and the static website attach **no user context at all** (see the
  follow-ups at the end of this entry). Review flagged `BS_SENTRY_DENIED_KEYS` as looking
  decorative; adjudicated NOT a defect — the function hand-builds an object literal and
  never spreads from a `profile`, so it's an allow-list, and a real denylist would rot as
  new PII columns land. Fixed round 1: both tagging functions were hardened to be **total**
  — a throwing getter on hostile input used to propagate an uncaught exception out of the
  very function meant to make error reporting safer.

- **Task 2 — Next.js: pages + all 156 API routes, one install** (`c9b53e039`). Server, edge,
  and client init (`sentry.server.config.ts`, `sentry.edge.config.ts`,
  `src/instrumentation.ts`, `src/instrumentation-client.ts`), `withSentryConfig` wrapping
  `next.config.ts` without touching any existing redirect/rewrite, and
  `sourcemaps.disable` following the presence of `SENTRY_AUTH_TOKEN` so the upload step
  never blocks a build before the Sentry org exists. Verified with every `SENTRY_*`/
  `VERCEL_*` var unset: `tsc --noEmit` clean, `next build` succeeds under this repo's
  Turbopack bundler, with Sentry's `runAfterProductionCompile` hook confirmed running and
  skipping the release/sourcemap upload with a warning, not a failure.

- **Task 3 — the `/m/` mobile app** (`df750998b`, hardened `175ef5b1a`).
  `mobile-app/src/sentry.mjs` (`bsInitSentry`/`bsSetSentryUser`) pairs `@sentry/capacitor`
  with `@sentry/react`'s init as its second argument — the documented Capacitor pattern, not
  React Native — called as the first statement in `mobile-app/src/main.jsx`, before the
  dynamic import that mounts React. Two build-time corrections against the plan: (1)
  `@sentry/capacitor@4.2.0` pins `@sentry/react` to **exactly** `10.60.0`, not a range — a
  plain `npm i @sentry/react` would have resolved `10.69.0` and reintroduced the peer
  conflict; installed clean, 0 vulnerabilities, and the root web app's own `@sentry/react`
  install stays on `10.69.0` untouched (separate dependency tree). (2) `bsInitSentry()`
  shipped with no `try/catch` around a bare `Sentry.init()` — since this runs before React
  mounts, a throw here would be a white screen on every device with nothing initialized to
  say why; fixed to be total.
  **`bsSetSentryUser` is wired here and nowhere else** — called from
  `getCurrentSession()` (`shapeBackend.js`) beside `startPresence()`/`registerPush()`, the
  established "a session just became known" hook, and **unconditionally rather than
  `if (user)`**: a session resolving to nobody must CLEAR the previous account's tags, not
  leave them standing (the `_followCache` cross-account leak of 2026-06-29 is the precedent).
  `signOut()` clears it alongside the other viewer-relative caches. Total by construction —
  the setter swallows, and the call site is wrapped again — so it can neither throw nor
  delay session resolution.
  ⚠ **The init-ordering comment in `main.jsx` was WRONG and is corrected.** It claimed a
  crash during mount is captured because init runs first. `@sentry/capacitor`'s `sdkInit()`
  is `NATIVE.initNativeSdk(...).then(() => originalInit(browserOptions))` — the browser SDK
  is created inside a **promise callback**, so `bsInitSentry()` returns before any client
  exists and on native the bridge round-trip can lose the race against the dynamic import;
  the surrounding `try/catch` cannot catch a native-bridge failure either, since that lives
  in the SDK's own floating promise chain. What is true: init BEGINS before the mount and
  the native SDK completes asynchronously, so the very earliest mount-time errors may not be
  captured. Deliberately not restructured — forcing synchronous init risks the mount path
  for a marginal gain.
  ⚠ **Mobile is also the one surface where a broken init and a correctly-inert build are
  byte-identical in observable behaviour**, so the catch now `console.warn`s (matching the
  website loader, which warns at all three of its failure points for the same reason;
  `callRpc` and `reportAlerts` each have a second sink, mobile had none).

- **Task 4 — the static website** (`212df6df4`, review rounds `80863f847` + the Codex round
  below). `public/newdesign/sentryInit.js` is a dependency-free classic script that no-ops
  when `window.SHAPE_SENTRY_DSN` is unset.
  ⚠ **The DSN is injected by `scripts/build-newdesign.mjs` (the deploy precompile), NOT by
  `pageShell.jsx` — and the correction matters more than the mechanism.** As first shipped,
  `pageShell.jsx` carried `window.SHAPE_SENTRY_DSN = window.SHAPE_SENTRY_DSN || ""` and a
  long comment calling itself "the ONLY place that global can be assigned." That was true
  and useless: **nothing in the repo ever assigned it**, and this surface has no bundler, so
  there was no `process.env` any runtime file could read. The static site would have stayed
  **permanently unmonitored** after the owner set every documented env var and redeployed —
  the runbook promising activation-by-env-var while the code silently required a source
  edit. Caught by Codex as a P1 on the PR. The precompile runs at deploy, where the env DOES
  exist, so it now injects the DSN plus a deferred `sentryInit.js` tag; unset =>
  **nothing is injected at all**, so an unconfigured build is byte-identical to one without
  the feature. ⚠ **It needs its own `SHAPE_SITE_SENTRY_DSN`** — this surface is a fourth
  release stream, and quietly reusing `NEXT_PUBLIC_SENTRY_DSN` would file static-site errors
  into the Next.js project without anyone choosing that.
  ⚠ **And "every page" was 69 of 76.** Hooking `pageShell.jsx` missed **GetApp.html**
  (linked from the landing page), **consultation.html** (the `/consultation` redirect
  target) and **ClientPlaylists.html** (linked from `dashClient.jsx`) — all live, linked
  flows, all with no error tracking whatsoever. Injecting at the precompile covers **74 of
  76**; the two still excluded are `TrainerPublic.html` / `NutritionistPublic.html`, whose
  entire body is a `location.replace` — fetching a ~90 KB CDN bundle on a page that
  navigates away immediately would cost every visitor bandwidth for nothing. The build
  **logs its own coverage** (`injected on N/76 pages`), because a coverage number nobody
  prints reads as "everything is covered" the moment someone adds a page the script skips.
  The earlier review round caught a real framing error in the original brief: it called
  these pages "the
  signed-out marketing surface," but most of `pageShell.jsx`'s consumers are actually
  **signed-in dashboard SPAs** (`ClientApp`/`TrainerApp`/`NutritionistApp` and their
  sub-pages) — so once a DSN exists, dashboard errors would arrive with zero identity/role
  context. Full user context isn't reachable here (no bundler), but a coarse, strictly
  path-derived `shape_surface` tag is — set via `Sentry.init`'s `initialScope`, read only
  from `window.location.pathname`, never from any user/session object. Also added:
  `console.warn` at the three points that previously failed silently.

- **Task 5 — the RPC error wrapper + the Layer 2 alert seam** (`7415764ce`, doc round
  `78fbdbaab`). `callRpc` (`src/lib/supabase/call-rpc.mjs` + hand-written `call-rpc.d.ts`)
  inspects the **resolved** `{ error }` from `client.rpc(name, args)` explicitly instead of
  trusting a `try/catch` — which never fires for the failure that matters, since a revoked
  grant, an absent function, or an unwhitelisted event all *resolve*, they don't reject
  (documented at `week-publish-server.ts:201-206`). Wired at the one call site that comment
  describes — `src/lib/week-publish-server.ts`'s `track_event` write. `reportAlerts` in the
  guardrail-health cron route now fires both sinks: `console.error` unconditionally first,
  then a tagged `Sentry.captureMessage` inside its own `try/catch`, so Sentry stays inert
  with no DSN (a disabled SDK's `captureMessage` is a documented no-op) without ever costing
  an alert its log line. Build-time correction against the plan: the brief specified
  `call-rpc.ts`, but `node --test` cannot import TypeScript and no existing test in this
  repo does — shipped as `.mjs` + `.d.ts` instead (the `console-triage.mjs` pattern).

- ⚠ **THE SCOPE GAP the owner most needs to see.** The original request was to wrap "the
  publish route and **all** Supabase RPC callers." What shipped wraps **one call site**. There
  are **~210 other `.rpc(` call sites** across the repo: 96 server-side across 57 files
  (`src/lib` + `src/app/api`), 70 in mobile `shapeBackend.js`, 44 across 19 website files
  under `public/newdesign`. This was never a simple sweep — the three surfaces run three
  different Sentry SDKs, so a shared wrapper can't be imported unchanged everywhere. **Stated
  plainly as an open follow-up, not done** — do not read the one wrapped call site as
  coverage of the original ask.

- ⚠ **A landmine worth recording because it is invisible.** `import * as Sentry from
  '@sentry/nextjs'` returns `captureException`/`captureMessage` as **`undefined`** under
  Node's native ESM loader — the SDK ships as CJS, and `cjs-module-lexer` resolves only a
  subset of its exports as named bindings (verified empirically on Node v24.14.1).
  `src/lib/supabase/call-rpc.mjs` therefore uses a **default** import
  (`import Sentry from '@sentry/nextjs'`), while the cron route
  (`src/app/api/cron/guardrail-health/route.ts`) legitimately keeps the namespace form,
  because it only ever runs through Next's bundler, never `node --test`. "Harmonizing" the
  two forms to look consistent would silently break `call-rpc.mjs`'s reporting: the capture
  call would throw inside its own swallowing `try/catch`, so the wrapper would keep
  returning correct results while reporting nothing at all — no error, and no failing test
  to catch it.

- **The exact owner steps, in order, because the order matters.** (1) Create the Sentry
  organisation and **THREE projects** — `shape-web` (Next.js), `shape-mobile` (Capacitor),
  `shape-site` (static website). ⚠ **CORRECTED 2026-08-01 — this said "four projects", my
  error.** Four DSN *values*, three projects: `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` are
  the **same** project's DSN. Splitting them leaves one Next runtime unsymbolicated, because
  `next.config.ts` uploads every Next artifact to the single `SENTRY_PROJECT`. See the
  2026-08-01 entry. (2) Supply **eight** env vars: `SENTRY_DSN`,
  `NEXT_PUBLIC_SENTRY_DSN`, `VITE_SENTRY_DSN`, `SHAPE_SITE_SENTRY_DSN`, `SENTRY_ORG`,
  `SENTRY_PROJECT`, `SENTRY_PROJECT_MOBILE`, `SENTRY_AUTH_TOKEN`. ⚠ Without
  `SHAPE_SITE_SENTRY_DSN` the static website stays inert; without `SENTRY_PROJECT_MOBILE`
  every mobile stack trace arrives **minified**.
  ⚠ **(2b) Add four of them as GitHub repo secrets too** — `VITE_SENTRY_DSN`,
  `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT_MOBILE`. The Android APK is built by
  GitHub Actions (`android-build.yml`), which cannot read Vercel env vars, and **a shipped
  binary can never be fixed by redeploying** — skip this and the distributed app reports
  nothing, permanently, no matter what the hosted surfaces do.
  ⚠ **(2c) AND THE SAME AGAIN FOR iOS — "Layer 1 mobile" means ANDROID ONLY until this is
  done.** `codemagic.yaml` builds the **iOS TestFlight IPA on every push to `main`** and
  passes no Sentry DSN, so every shipped iOS build bakes in `dsn:''` and can never be
  switched on — the same trap (2b) closes for Android, on the surface that actually ships
  to users today. Create a Codemagic environment-variable group carrying `VITE_SENTRY_DSN`
  / `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT_MOBILE`, then reference it from
  `codemagic.yaml`. Not wired in advance: referencing a group that does not exist yet would
  break the iOS build. ⚠ `VITE_SHAPE_RELEASE` is **not** in that group and must not be — it
  is a commit SHA, not a secret, and is already exported directly in `codemagic.yaml` from
  `CM_COMMIT` (with a `git rev-parse HEAD` fallback).
  (3) **Redeploy.** Vercel injects environment variables at BUILD time,
  not request time — an already-running deployment never picks the new values up no matter
  how long it stays live.

- ⚠ **The alert rules are a SEPARATE owner step, and skipping them means this notifies
  nobody.** `captureMessage`/`captureException` file an issue in the Sentry UI; neither
  pages, emails, nor Slacks a human. Two rules are needed: an **issue rule** filtered on the
  tag `alert` = `guardrail-health`, and a **cron-monitor rule** on a missed check-in. **The
  issue rule does not cover the second case** — a cron that stops firing entirely never sends
  a message for an issue rule to match, so a silently-dead job and an honestly-quiet one look
  identical without the separate monitor.

- ⚠ **Verification is required, not optional, before anyone calls this working.** Fire a real
  test event on **EACH OF THE FOUR independently-wired event paths** — Next server/edge, the
  Next browser bundle, `/m/` mobile (and separately BOTH shipped binaries — the Android APK **and** the iOS TestFlight IPA, which is built independently with its own variable group and its own upload, so a pass on `/m/` or Android proves nothing about it), and the static website —
  and confirm each arrives **symbolicated** (a readable stack, not a minified blob) carrying
  the right **release**; then **separately** confirm a notification actually reaches a human
  inbox. An issue showing up in the Sentry dashboard is not evidence anyone was told; that
  only happens once the alert rules above exist and have been proven to fire.
  ⚠ **CORRECTED 2026-08-01 — this said "three surfaces … release and role tags" and was
  unfollowable:** four separate inits exist, and **role tags are on `/m/` ONLY** (the two web
  paths and the static site attach no user context). Release on all four; role tags on mobile.

- **The `/m/` mobile build now emits hidden source maps** (`mobile-app/vite.config.ts`,
  `sourcemap: 'hidden'`), reversing the earlier `sourcemap: false` decision — safe now for a
  reason that didn't hold before. The original comment gave two reasons to disable maps:
  byte-matching a **committed** `public/m` (obsolete — `public/m` has been gitignored and
  built fresh on Vercel's Linux host since #1470, so there's no cross-platform byte-diff left
  to protect), and not shipping ~5 MB of source to a public URL (**still true**, and now
  handled structurally — `scripts/build-m.sh` deletes every `.map` file from `public/m` as
  its last build step, after the wholesale `cp -r mobile-app/dist public/m`).
  ⚠ **`sourcemap: 'hidden'` ALONE would NOT have been safe** — it only omits the
  `//# sourceMappingURL=` comment from the bundle; the `.map` files are still written to
  `dist/` and would still ship at the public `/m/` URL untouched. The strip step in
  `build-m.sh` is what actually makes this safe, not the Vite flag by itself.
  ⚠ **AND THE MAPS WERE NEVER UPLOADED ANYWHERE** — corrected after Codex flagged it as a
  P1. `build-m.sh` carried a comment saying an upload "goes here", and nothing did: maps
  were generated, copied, and deleted, so every mobile stack trace would have arrived
  **minified** and the runbook's own symbolication check could never have passed. The
  upload now runs inside the Vite build via **`@sentry/vite-plugin`**
  (`mobile-app/vite.config.ts`), reading `dist/` **before** the copy into `public/m`, gated
  on `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT_MOBILE` and simply absent when any
  is unset. ⚠ **An `errorHandler` is load-bearing, not defensive dressing:** by its own
  documentation the plugin THROWS and stops the bundle on an upload failure, so a Sentry
  outage or a stale token would have broken the deploy. Verified locally with deliberately
  invalid credentials — the upload failed, a warning printed, and the build still exited 0.

- ⚠ **AND THAT ONLY EVER COVERED THE HOSTED `/m/` BUNDLE — the DISTRIBUTED ANDROID APK had
  no Sentry at all.** Corrected after Codex flagged it as a P1. Both APK jobs in
  `.github/workflows/android-build.yml` ran a bare `npm run build` with **no `env:` block**:
  Vite inlines `import.meta.env.*` at BUILD time, GitHub secrets are not exposed to a step
  implicitly, and Vercel env vars do not exist in that runner at all (`scripts/build-m.sh`
  is a Vercel-only path). So the signed APK baked in `dsn: ''` and skipped the sourcemap
  upload **even after the owner completed every documented setup step** — and unlike the
  hosted surfaces, **a shipped binary can never be fixed by redeploying**. Both jobs now
  pass `VITE_SENTRY_DSN`, `VITE_SHAPE_RELEASE` (`github.sha`, matching `build-m.sh`'s
  full-SHA format) and the three upload vars; every one is optional, so with the secrets
  unset the SDK stays inert and nothing uploads. ⚠ **This means the Android secrets are a
  SEPARATE owner step from the Vercel env vars** — see the owner steps above.
  ⚠ **Corrected: "byte-unchanged" was wrong.** `VITE_SHAPE_RELEASE: ${{ github.sha }}` is a
  context expression, not a secret — always set — and `sentry.mjs` reads it through
  `import.meta.env.VITE_SHAPE_RELEASE`, which Vite inlines at build time. The bundle
  therefore carries the commit SHA even with no Sentry configured. Functionally inert,
  different bytes.

- ⚠ **THE SAME FLAG THAT MADE MOBILE TRACES READABLE PUT 13.85 MB OF DEAD WEIGHT IN THE
  SHIPPED APP — fixed here.** Flipping `sourcemap: false` → `'hidden'` left **26 `.map`
  files / 13,850,410 bytes in a 33.5 MB `mobile-app/dist/`** (41% of it). `webDir: 'dist'`
  means `npx cap sync android` copies that verbatim into
  `android/app/src/main/assets/public`, and `npx cap sync ios` into `ios/App/App/public` —
  which Xcode carries into the `.app` as a **folder reference**
  (`lastKnownFileType = folder`), recursively and unfiltered. Nothing downstream filters
  maps out: Android's `aaptOptions.ignoreAssetsPattern` lists only dotfiles/VCS junk and has
  no `*.map` entry. ⚠ **And the record's own rule was applied to only half the paths** — this
  file already said *"`sourcemap: 'hidden'` ALONE would NOT have been safe … the strip step
  in `build-m.sh` is what actually makes this safe"*, but `build-m.sh` is the **Vercel
  buildCommand only**: it never runs in the Android CI job, never in Codemagic's iOS build,
  never in a local Xcode/Android Studio build. Fixed at `dist/` — the one chokepoint all four
  consumers copy from — via a `stripSourcemaps` vite plugin in `closeBundle`, plus a CI
  assertion in **both** Android jobs that fails the build if any `.map` reaches the native
  assets. `KEEP_SOURCEMAPS=1` retains them locally.
  ⚠ **Ordering is safe by construction, not by luck:** `@sentry/vite-plugin` uploads inside
  `writeBundle` (`@sentry/bundler-plugins build/cjs/rollup/index.js:186`) and Rollup fires
  `closeBundle` only after every `writeBundle` resolves — so the upload always reads the maps
  before the strip deletes them. If that ever inverted, the upload would send nothing and
  every mobile stack trace would arrive minified, **with no error and exit code 0**.
  ⚠ **This is a SIZE regression, not a disclosure** — two review passes called it source-code
  leakage and that framing is wrong: the repo is public, and all 84 first-party `sources`
  entries in those maps are tracked files in it. Nothing was exposed that isn't already on
  github.com. It blocks a merge on weight in a shipping binary, not on secrecy.

- ⚠ **SIGNING IN MID-SESSION LEFT EVERY ERROR ANONYMOUS — the user-context feature was
  broken on its most common path.** `bsSetSentryUser` was called from `getCurrentSession()`
  alone, and that runs at **mount**. So: open the app (anonymous → context set to null),
  sign in → `signIn`/`signUp`/`verifyPhoneOtp` update the cache and the UI, fire
  `shape:identity` so the avatars refresh, and **never touch Sentry** — leaving the whole
  rest of that session reporting with no id, no roles, no `is_coach`. `updateProfileRoles`
  had the same hole for role changes. That is exactly what `src/lib/sentry-context.mjs`
  exists to deliver, so the feature would have looked wired and delivered nothing.
  **Fixed structurally, at the chokepoint** — `setCached()` is the one function every
  identity transition already passes through (verified: `signIn`, `signUp`,
  `verifyPhoneOtp`, `getCurrentSession`, `signOut`, `updateProfileRoles`, `updateProfileName`
  and `claimUsername` all land there), so syncing once inside it covers every path *by
  construction*; adding a call per auth path would be a list the next auth path silently
  fails to join. ⚠ **Unconditional, NOT gated on the identity changing** — a partial update
  like `setCached({ profile })` keeps the same uid while changing roles, so an
  identity-change guard would miss precisely what `updateProfileRoles` produces.
  `bsSetSentryUser` now has exactly ONE call site. Pinned by
  `tests/sentry-user-context.test.mjs`, which was **mutation-tested**: it passes on the fix
  and fails both on the original (`getCurrentSession`-only) shape and on the subtly-wrong
  gated-on-uid-change variant.

- ⚠ **AND THAT FIX STILL LOST THE ID IN THE ONE STATE WHERE IT MATTERS MOST** — the
  signed-in member with **no profile row**. `getCurrentSession()` deliberately swallows a
  failed `upsertProfile()` (`if (user && !profile) { try { … } catch (e) {} }`) and carries
  on with `profile === null`, so this is a real state, not a hypothetical: a broken account.
  Deriving the id from the profile alone therefore reported **every error in that degraded
  state as anonymous** — and a broken-account state is precisely when knowing who hit it
  matters. Fixed by giving the pure module an optional id fallback,
  `bsSentryUser(profile, fallbackId)`, with `setCached()` passing the `uid` it already
  computes: **the id comes from the AUTHENTICATED user, the roles from the profile only** —
  so roles stay honestly absent rather than guessed until the row resolves. ⚠ The fallback
  lives in `src/lib/sentry-context.mjs` rather than at the call site **because that module is
  already the one place the derivation rules live, and putting it there makes the rule
  behaviourally testable** instead of asserted by grepping source text. Sign-out passes null
  for both arguments, so the previous account's tags are still cleared. Three new vectors in
  `tests/sentry-context.test.mjs`, **mutation-tested**: removing the fallback fails
  *the-authenticated-id-is-the-fallback*, and dropping its string guard fails
  *an-unusable-fallback-yields-no-context* — each mutation killed by exactly one test.
  **The general rule: derive identity from the authoritative source, not from data derived
  off it.** `state.user` is the authenticated identity; `state.profile` is a DB row that may
  not exist yet — the same shape as the bug above it.

- ⚠ **THE ORDERING GUARANTEE IN TWO FILES WAS OVERSTATED — corrected.**
  `scripts/build-newdesign.mjs` and `public/newdesign/sentryInit.js` both claimed that
  because every compiled script sits after `</head>`, injecting the pair there "guarantees:
  CDN bundle → init → application code". The guarantee holds **for `nd/*.js` only**. A
  DEFERRED script cannot precede a SYNCHRONOUS one regardless of tag position, so these still
  run first: synchronous external `<script src>` in `<head>` on **26** pages (React/ReactDOM/
  Babel UMD everywhere, plus `/vendor/supabase-js` + `/supabase.js` on index, ClientProfile,
  Login and the three Signup pages), and **17 classic inline `<script>` blocks across 10
  pages** (index alone has 7). Moving the injection earlier in `<head>` would NOT close it —
  still deferred. Closing it needs an early-error queue; that is registered, not built, and
  deliberately not bundled into a comment correction. **This is the second time a
  because-clause in a comment was asserted as doctrine and turned out false** — verify the
  mechanism before writing the reason, and delete the claim rather than soften it.

- ⚠ **STATIC-SITE STACK TRACES COULD NEVER BE SYMBOLICATED EITHER** (Codex P1, same round).
  `scripts/build-newdesign.mjs` emits every compiled file with `compact: true` — one line,
  nothing mangled — with no source map and no release, so a frame read
  `nd/pageShell.js:1:45231`: function names survived, the location was useless, and the
  runbook's "arrives symbolicated, not minified" check could not have passed on this
  surface. Maps are now emitted (v3, `sourcesContent` inlined, `sourceMappingURL` appended
  before hashing so the `?v=` cache key stays correct), gated on the DSN so an unconfigured
  build stays byte-identical and `--check` stays honest. ⚠ **Hosted, not uploaded — and the
  reason is specific to this surface:** it already serves its **75 `.jsx` sources as plain
  public files** under `/newdesign/`, so `sourcesContent` exposes nothing that isn't one
  fetch away. That is exactly why the same choice would be **wrong** on `/m/`, where
  `build-m.sh` strips every `.map`. An authenticated upload for the static project stays
  available if artifact-based resolution is ever preferred — a deliberate call, not an
  oversight.

- ⚠ **PAGE-STARTUP CRASHES WERE LOST ON EVERY COLD LOAD** (Codex P2, same round).
  `sentryInit.js` built the CDN `<script>` and `appendChild`'d it — and a dynamically
  inserted script is **async by default**, so it raced the page's own deferred `nd/*.js`,
  which are what mount the app. The most valuable error this surface can report was the one
  it was least likely to catch. The pinned CDN tag is now injected by the precompile as a
  real `<script defer crossorigin integrity>` **ahead of** the initializer, and
  `sentryInit.js` no longer loads anything — it guards on `window.Sentry` and inits.
  Deferred scripts execute in document order; verified structurally (all 76 pages use a
  plain `<head>`, every `text/babel` block sits after `</head>`, and a fake-DSN build puts
  the Sentry tags at **line 11** with the first `nd/` script at **line 55**).
  ⚠ **Found while rewriting that file, not by review:** it was the **only one of the four
  inits missing `sendDefaultPii: false`** (and `tracesSampleRate: 0`). The SDK defaults that
  flag to false so nothing leaked, but this repo treats it as load-bearing on every init and
  the other three carry it explicitly — now added, with a comment saying never to flip it.

- **Layer 2's heartbeat is now live** — `HEARTBEAT_PING_URL` is **set**, and the redeploy
  carrying it is verified **READY in production** (2026-08-01). The guardrail-health cron's
  dead-man's switch arms at the next 09:00 UTC run; this corrects the 2026-07-31 entry below,
  which said the switch was unset and inert (that line is now struck through and pointed
  here).

- **Follow-ups registered, none built here.** `scripts/verify-staged.sh` still runs a
  `public/m` sync diff that can now only ever fail — `public/m` has been gitignored and
  deploy-built since #1470, so the check compares a fresh build against stale local
  leftovers; remove the step or teach it the new reality.
  ⚠ **And USER CONTEXT ON THE OTHER TWO SURFACES.** Only `/m/` attaches it. The **Next.js
  browser client** attaches none — init runs before hydration, so no session exists at that
  point and no natural later hook was added (inventing one at the end of a wave was judged
  the wrong risk). The **static website** attaches none either, only the coarse,
  path-derived `shape_surface` tag, because that surface has no bundler and can't reach the
  shared PII-free `sentry-context.mjs` module. **Most of those 69 `pageShell.jsx` pages are
  the signed-in dashboards**, not signed-out marketing, so once a DSN exists, dashboard
  errors on BOTH web surfaces arrive with no id, no roles and no `is_coach` — beyond the
  URL-path hint on the static side. The owner runbook's own verification step ("carrying
  the right release and **role tags**") can therefore only pass on `/m/` today.

- **The release story, end to end** — three of four surfaces stamp a real git SHA on a
  Vercel deploy; one is honestly absent. **Server + edge:** `bsSentryRelease(process.env)`
  reads `VERCEL_GIT_COMMIT_SHA` ✓. **Next browser:** no explicit `release` key —
  `withSentryConfig` resolves it at build time (`getSentryRelease()` →
  `VERCEL_GIT_COMMIT_SHA`, else `git rev-parse HEAD`) and injects
  `process.env._sentryRelease`, which `@sentry/nextjs`'s `init()` reads as its default ✓.
  ⚠ **It used to pass `release: bsSentryRelease({ SHAPE_RELEASE: NEXT_PUBLIC_SHAPE_RELEASE })`
  — a var set NOWHERE, so it evaluated to `undefined`; and because the SDK spreads user
  options LAST over its own defaults, an own key holding `undefined` CLOBBERS the injected
  SHA.** The browser surface was therefore the one surface actively destroying its own
  release. Deleting the key was the fix (never add a new env var — omitting it lets the
  plugin's SHA apply for free), and the file now carries a comment saying never to add it
  back. **Mobile `/m/`:** `scripts/build-m.sh` exports `VITE_SHAPE_RELEASE` from
  `VERCEL_GIT_COMMIT_SHA` ✓. **Static website:** ⚠ **CORRECTED 2026-08-01 — this said nothing
  stamps `window.SHAPE_RELEASE`, and that is no longer true.** `scripts/build-newdesign.mjs`
  now injects it from `VERCEL_GIT_COMMIT_SHA` beside the DSN ✓. So the design's claim that
  one deploy's errors correlate across surfaces now **holds for all four surfaces.**

- ⚠ **FIXED after CodeRabbit review — a partial-configuration source-map edge case that had
  been recorded as "deliberately not changed."** The reasoning below was that the
  half-configured state is one the runbook never asks anyone to stop in. CodeRabbit pushed
  back and was right: gating on the full triple costs nothing in the fully-configured state,
  removes a public-URL source exposure in the half-configured one, and — decisively — the
  MOBILE side wired in this same PR already requires all three
  (`SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT_MOBILE`), so leaving the web side on
  the token alone made the two surfaces disagree about what "configured" means.
  `next.config.ts` now gates `sourcemaps.disable` on all three. Original note, kept for the
  reasoning trail:
  `next.config.ts:75` uses `sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN }`. With a
  token set but `SENTRY_ORG`/`SENTRY_PROJECT` absent, the plugin **enables** browser source
  maps and then relies on its own post-upload auto-delete, which may not run if the upload
  is skipped — leaving `.map` files served from `.next/static`. Unlike the mobile side,
  which strips every `.map` from `public/m` unconditionally in `build-m.sh`, there is no
  belt-and-braces delete here. **Today's build is clean** (0 `.map` files in `.next/static`
  with every `SENTRY_*` var absent). Mitigation: the runbook already tells the owner to set
  all six variables together, so the half-configured state is a transient nobody is asked to
  stop in. Left as-is rather than "fixed", because each alternative (gating on org+project
  too, or an unconditional strip) changes build behaviour for a state the runbook never
  produces.

- Verified per task: `npx tsc --noEmit` clean · full suite **1427/1427** (was 1407 at the
  branch base, +20 new, 0 dropped) · every touched file LF, zero NUL bytes · CI-equivalent
  builds green (`next build`, the mobile Vite build) with every Sentry env var absent ·
  the mobile build's source-map strip verified end to end (26 stripped, **0** left in
  `dist/`, **0** in `public/m`).

### 2026-08-01 — Dependency sweep: 4 Dependabot PRs merged (#1860–#1863)

Recorded 2026-08-04 — these merged without a changelog entry and are listed here so
the lockfile churn is attributable.

- **#1863 → `7e95b9ee5`** — mobile-deps group, **15 updates**. Touched
  `mobile-app/package.json` + `mobile-app/package-lock.json`. ⚠ That lockfile is what
  **`codemagic.yaml` consumes to build the iOS TestFlight IPA on every push to
  `main`** — a mobile dependency bump is an iOS-build-input change, not a chore.
- **#1862 → `a46078475`** — web-deps group, **9 updates** (root `package.json` +
  `package-lock.json`).
- **#1861 → `997f1a84f`** — `actions/upload-artifact` **4 → 7** in
  `.github/workflows/android-build.yml`.
- **#1860 → `f7916ca8e`** — `actions/setup-node` **6 → 7** in `android-build.yml`
  **and `ci.yml`**. In `ci.yml` it hit the two **Node-based** jobs — `Web (typecheck +
  build)` and `Mobile (build + public/m sync)`, 2 of the 3 required checks at the time.
  `Secret scan (gitleaks)` runs no Node and was untouched.

### 2026-08-01 — The masthead contract: one row, one inset, every page

- **Owner ruling** (with a screenshot of the chat page's masthead): *"please make sure this
  exact top masthead is on very single page on app. same format, same size, no deviation."*
  The row is the SHAPE triangles + `VOL. 1 · NO. 1` on the left, the circled search + the
  member's own avatar on the right. It was on most pages, at nine different top insets, with
  two logo sizes and two avatar sizes.

- **The contract now lives in ONE place.** `iosAppBroadsheet.jsx` (the chrome) gained
  **`BS_MAST_TOP = 44`** plus **`BS_MAST_TOP_CSS`**, both window-exported so the role modules
  read them instead of re-typing a literal. `BSMasthead`, `BSPageHeader` and `BSDetailHeader`
  all consume it, so the pages on the shared headers moved together; the hand-rolled rows
  follow via `window.BS_MAST_TOP_CSS`. The old per-page insets
  (14/42/44/46/48/50/54/58/60/62/64) are gone.

- ⚠ **44 is not an arbitrary pick — it is the reference page's own value.** The owner's
  screenshot was the chat page, and `BSClientFeed` already sat at `44px`. The contract was set
  to match the page the ruling pointed at; the pages that move are the ones that had drifted
  off it.

- ⚠ **THE INSET IS AN EXPRESSION, AND MY FIRST TWO ANSWERS ABOUT IT WERE BOTH WRONG.**
  Shipped value:
  `BS_MAST_TOP_CSS = max(44px, calc(env(safe-area-inset-top, 0px) + 12px), var(--bs-notch-floor, 0px))`.
  - **Wrong once:** the first cut was a flat `44px`. It silently deleted two
    `env(safe-area-inset-top) + 13px` declarations the PR's own diff removed from
    `BSActivityDetail`, leaving two pages one tap apart disagreeing by up to 28px.
  - **Wrong twice:** challenged on that, I claimed Capacitor's `ios: { contentInset: 'automatic' }`
    insets the WebView so `env()` reads 0 and a flat 44 is correct. **It does not.**
    `CAPBridgeViewController` does `view = webView` — the WebView **is** the root view, spanning
    edge-to-edge under the notch — and `contentInset` only sets
    `scrollView.contentInsetAdjustmentBehavior`, which under this app's `overflow:hidden` shell
    degenerates to `.scrollableAxes` and applies no vertical inset at all. `index.html` ships
    **`viewport-fit=cover`**, which is the decisive precondition: `env()` is live. Six broadsheet
    files already depend on `env(safe-area-inset-top)`, including the pinned condensing masthead
    on every page. A flat 44 starts the row's 34px circles at y=44 — **inside the Dynamic Island
    pill (≈y 11–48)** on iPhone 14 Pro/15/16.
  - **`N = 12` is borrowed, not invented:** the pinned condensing strip renders the same row in
    the same slot at `12px + env(...)`, so matching N makes both clear the hardware by the same
    margin. ⚠ They are *not* equal in total — the strip carries no 44px floor by design — and the
    comment now says so, because the first draft of that comment claimed they "land identically",
    which is only true once `env() ≥ 32px`.
  - **The three terms:** `44px` is the floor for cutout-less Android (where `env()` reports the
    display cutout, i.e. 0); the `env()` arm is device truth; `--bs-notch-floor` is set **only**
    by the desktop phone-frame mock (46px) and native never sets it.
  **Both reviewers flagged this independently, and both were right.** Two confident wrong answers
  in a row on the same question is the durable lesson here, not the CSS.

- **The row itself is normalized:** logo `size 16` everywhere (`BSMasthead` was 18), the corner
  cluster gap is one constant (`BS_CORNER_GAP = 9`), and every self-avatar reads
  `BS_HEADER_AVATAR` (34) — the calendar's was 32, Settings carried a duplicate 32 beside its
  own row, and the follow-list sheet's was 30.

- **Pages that had no row now have one** — sleep and strength history, the Settings hub *and
  all ten of its drill-in panes*, Goals "The Contract", About, the profile customizer, the
  marketplace **Listing** (the primary conversion page, which opened with no chrome), the coach
  availability calendar, the coach live-watch console, The Splits, the Nora concierge profile,
  the "Logged." confirmation, both coach AI-draft review pages, coach grocery lists, the widget
  queue and coach notifications.

- ⚠ **THE FINDING THAT MATTERED MOST — my own stated rationale was false, and the review
  caught it.** Four stateful editors (the coach draft editor, the practice-goal editor, the
  grocery builder, the PAR-Q intake) initially shipped the row **without** the trailing corners,
  each with a long comment asserting that *"the search corner opens a takeover that unmounts
  this page, discarding the unsaved draft"* — written as binding doctrine for future
  maintainers. **It does not unmount.** `BSUniversalSearch` renders as a **sibling** of the tab
  content (`{showSearch && <BSUniversalSearch/>}` — `iosAppBroadsheetClient.jsx:863`,
  `iosAppBroadsheetPros.jsx:1373`), painting `position:absolute; inset:0` over a page that
  stays mounted; local draft state survives. All four now carry the **full** row, the false
  comments are deleted, and `bsProMastRow` **lost its `withCorners` parameter entirely** so the
  corner-less variant cannot be reintroduced. The same review found the exception had already
  been applied inconsistently — `BSWorkoutReviewPage` holds an unsaved coach note in a textarea
  and had been given corners in the same PR. **A comment that states a mechanism is a claim,
  and an unverified claim propagates further than the code it sits next to.**

- ⚠ **`BS_DARK_GUTTER` was a second false premise, and it broke the density setting.** It was
  introduced as "the fixed-dark surfaces never receive the theme, so they cannot read
  `t.padX`" — but both profiles bind the theme, just under a different local name (`tTheme`).
  Hardcoding 18 meant the profile masthead ignored Compact/Standard/Comfortable and sat 4px off
  every other page on the default density, *and* off its own hero one line below it. Replaced
  with a `bsGutter(theme)` helper reading the live value. The follow-list sheet genuinely had
  no theme binding; it now takes one (it portals into the phone surface, and a portal keeps
  React context).

- ⚠ **One real behavioural change, called out rather than buried.** The Settings identity
  avatar used to open the **edit-details form**; it is now the standard corner avatar and opens
  the **profile page**, like every other page's. The `Edit` text button still opens the form,
  so nothing is lost — but this PR is otherwise presentation-only and that one control changed
  meaning.

- ⚠ **The doing-surfaces keep `mast={false}`, and that is a prior ruling, not an oversight.**
  The live session player, the meal logger, Cook Mode, the Prep board, the Prep session and the
  video call are instruments — the chrome is deliberately absent while you are mid-set or
  mid-cook (the Cockpit wave, #1719/#1720/#1721, and #1605). The pre-app gates (first-run
  intent, language picker, the Shape Radio opt-in) and the launch/auth/application flow have
  their own wire grammar. **These are the only surfaces in the app without the row.**

- **Two render-crash bugs the gates caught before the first commit**, both mine, both from
  reaching for `t.padX` inside a component that never receives the theme under that name: the
  follow-list sheet and both Terrain-profile mastheads would have thrown `ReferenceError` on
  render. Parse, `tsc`, the build and the suite were all green;
  `tests/broadsheet-identifiers.test.mjs` named the three lines.

- **A blind constant sweep coupled three unrelated layouts to the masthead.** `gap: 9` →
  `gap: BS_CORNER_GAP` also caught the Train deck's program-meta row, the Score card's category
  rows and the session's duration input — tuning the masthead corner gap would have moved all
  three. Reverted to a literal; the six genuine corner clusters keep the constant.

- **Review round (4 CodeRabbit + 2 Codex = 5 distinct findings, all real, all fixed).** Beyond
  the safe-area correction above: **`BSDetailHeader`** — the shared sticky header behind ~31
  pages — was still on a *numeric* inset, so the single biggest cohort in the app bypassed the
  notch-aware contract entirely (flagged by **both** reviewers, and the one I most regret
  missing); the **follow-list sheet** rendered the *profile owner's* avatar instead of yours;
  the **profile customizer** inherited a frozen 18px gutter; and a **Major** on the corner gap
  and corner-cluster markup being re-typed at six sites across four files — *the exact drift
  class this PR exists to kill*, so the chrome now owns `BS_CORNER_GAP` and every module reads
  it.

- ⚠ **The fix for one finding introduced a worse bug, caught before it shipped.** Giving the
  follow-list sheet the standard ⌕ corner produced a **dead control**: that sheet is portaled at
  `zIndex 100000` while `BSUniversalSearch` roots at `230`, so the search takeover would have
  opened **underneath it** — invisible, while still pushing a nav entry, so the next back would
  silently eat the search instead of closing the sheet. It is documented in place with the
  z-index reason so nobody "restores" it. **A contract applied without checking the stacking
  context is a contract applied to a button that does nothing.**

- ⚠ **That exception was applied to ONE of THREE qualifying surfaces, and review caught the
  other two.** The same stacking trap holds for **`BSNoraProfile`** (zIndex 100000) and
  **`BSSplitsPage`** (99992) — both got a search-bearing row in this sweep. Rather than patch
  only the two that were named, the whole class was enumerated: of the **18** mast rows this PR
  adds, exactly **three** sit above `BSUniversalSearch`'s 230 (the profile customizer, at 220,
  is safely below it, and every other row renders in normal page flow). All three now omit the
  ⌕: the two that render the shared corner take a new `search={false}` flag on `BSMeCorner`
  (whose declaration carries the reason), and the follow-list sheet — which hand-rolls its own
  row — keeps the omission it already had.
  **Finding a defect twice in one PR means the fix was a patch, not a sweep — enumerate the
  class the second time.**

- ⚠ **A later round found the OTHER half of that same fix was inert.** Giving the follow-list
  title an `aria-label` naming the profile owner was reported as shipped — but the label sat on a
  plain `<span>`, whose implicit role is `generic`, and **a generic element is prohibited from
  carrying an accessible name**, so the attribute is invalid and most assistive tech ignores it.
  The accessibility fix did nothing. It also hard-coded "Followers", so on the **requests** sheet
  it contradicted the visible "Follow requests". Replaced with screen-reader-only TEXT appended to
  the real visible string, which fixes both at once — the label can no longer drift from what is
  on screen, because it *is* what is on screen. **An ARIA attribute the platform is required to
  ignore is not an accessibility fix; it is a comment that reads like one.**

- ⚠ **THE COACH DRAFT EDITORS SHIPPED A SILENT DATA-LOSS PATH, AND THE CAUSE WAS A DOCTRINE
  COMMENT I WROTE IN THIS PR.** After the dead-search round, `bsProMastRow` lost its
  `withCorners` parameter behind a comment stating the corners are always safe *"(Search opens a
  SIBLING overlay — the page under it stays mounted — so an editor's unsaved draft survives a
  search and back.)"* Every clause of that is true, and the conclusion does not follow: it
  reasons about **⌕** and then generalises to a cluster that also contains the **self avatar**,
  which behaves in the opposite way. ⌕ paints a sibling; the avatar dispatches
  `shape:openProSettings`, and the shell answers by **early-returning `<BSSettings>`** — the tab
  tree unmounts, `useStateBSP` is plain `React.useState` with no persistence, and back only
  restores `{tab: 'programs'}`. So the same sweep that gave three stateful editors a masthead
  gave them a one-tap way to discard an unwritten plan, with nothing erroring. **A control
  cluster is not one mechanism — clearing one control says nothing about the one beside it.**

- **Enumerated the class instead of patching the three that were named.** `bsProMastRow` now
  takes `{ corners }` — an options object, not a positional flag, so a stray `.map()` index can
  never strip the cluster by accident — and **seven** surfaces omit it: the shared draft editor,
  both AI-draft views, the shared `BSProActionHead` (which covers **Adjust · Schedule · Assign**
  — three forms that commit on an explicit action), the workout-review page (its note lands only
  on *Save review note*), the practice-goal edit sheet, and the soundtracks shell. Kept
  everywhere else, including the roster (its only input is a search box) and the Case File (the
  coach note there is read-only). The rule is now written at the helper: omit the corners where
  the page holds input the avatar would discard, or where the controls cannot render at all.

- ⚠ **On the soundtracks page BOTH corner controls were already dead, and that is structural.**
  Each coach shell early-returns `<BSProSoundtracks>` **above** the `showSettings` return *and*
  above the main return that hosts `{showSearch && <BSUniversalSearch/>}` — so from that page a
  settings dispatch is always shadowed and search has nothing to paint into, while each tap still
  pushes a nav entry the next back silently eats. The page also had **five** branches (library,
  two pickers, an import form, an assign view) of which only the library drew a row, so the other
  four reserved the masthead inset and opened on a blank gap. `BSStShell` now renders the row
  once for every non-embedded branch, corner-less, with the precedence recorded in place.
  **A row that reserves space for chrome it never draws is a layout bug; corners on a page that
  cannot render their destinations are a dead control — this page had both.**

- ⚠ **THIRD ROUND OF ONE CLASS — I enumerated it for the avatar and never for ⌕.** Having just
  written that the two corner controls fail differently, I swept every page whose **avatar**
  could eat unsaved work and did not sweep the pages whose **⌕** could not open. Review found
  the calendar; the audit behind it found **~16**: `BSSettings` **and its ten drill-in panes**
  (Contact · About · Pricing · Terms · Privacy · Data compliance · Code of conduct · Consumer
  health · Subprocessors · Help), the shared calendar, the habits page, the coach action queue
  and the live-watch console. Every one of them is reached through a shell **early return**,
  and `{showSearch && <BSUniversalSearch/>}` lived only in the **main** return — so ⌕ set a
  flag, painted nothing, and still pushed a nav entry the next back silently ate.
  **A rule you have just written down is not a rule you have applied.**

- **The fix makes the contract true instead of shrinking it.** Deleting ⌕ from sixteen
  surfaces — effectively the entire Settings section — would have satisfied "no dead controls"
  by defeating the ruling this PR exists to implement (*the same row on every page, no
  deviation*). Instead each shell resolves **one** `searchOverlay` and every takeover renders
  it (`takeover(el)` in the two coach shells; explicit in the client's three), so ⌕ now works
  from all of them. The two **pre-app gates** deliberately do not get it — they carry no
  masthead, so there is no ⌕ to press, and they must not be escapable before they are done.
  **When a contract and an implementation disagree, check which one is wrong before deleting
  from the contract.**

- ⚠ **And it made one of this PR's own comments stale within the hour.** `BSStShell` justified
  its corner-less row partly on ⌕ having nothing to paint into — true when written, false one
  commit later. Corrected in place: the row stays corner-less because the coach shells
  early-return Soundtracks **above** their `showSettings` return, so the **avatar** is still
  dead there; ⌕ is dropped with the rest of the cluster rather than splitting the row into a
  third variant for one page. Same lesson as the inert `aria-label` and the false search
  doctrine, now three times in one PR: **a because-clause is a claim with a shelf life.**

- ⚠ **ROUND FOUR — the sentence that carved out the exception was itself unchecked.** The
  fix above exempted the two pre-app gates *"they carry no masthead, so there is no ⌕ to
  press."* True of `BSIntentStep`. **False of `BSHealthIntake`**, which renders the row — so
  the required PAR-Q gate shipped two inert controls that each still pushed a nav entry.
  `BSHealthIntake` is dual-mode (the gate with no `onBack`, and Settings → Health profile with
  one), so the corners now key off the discriminator the component already used for its own
  eyebrow one line below. **Four rounds, four because-clauses that were wrong: the inert
  `aria-label`, the search doctrine that cost a P1, the `BSStShell` note that went stale in an
  hour, and this one. Writing the exception is where the error goes — the code gets reviewed,
  the justification does not.**

- **The class is now closed by construction rather than by enumeration**, which is the only
  reason to believe round five is not coming. `searchOverlay` is resolved **above every early
  return** in all three shells, so ⌕ cannot be dead on any takeover; the avatar can only be
  dead on a page returned **above** `showSettings`, which is exactly two places — the client's
  two gates (one has no corner, the other now omits it) and coach Soundtracks (already
  corner-less). Both invariants are stated at the helper, so the next surface inherits them.
  The separate round-2 case still stands on its own terms: three portalled surfaces sit above
  `BSUniversalSearch`'s z-index 230, where search *renders* but paints underneath — a
  stacking failure, not a routing one, and they keep `search={false}`.

- ⚠ **THE WORST ONE: `corners` SHIPPED IGNORED, AND I REPORTED IT FIXED TWICE.**
  `bsProMastRow({ corners = true } = {})` destructured the flag and its body returned
  `<MastRow trailing={bsProCorner()} />` **unconditionally**. So the entire corner-less sweep —
  seven surfaces, including the coach draft editors whose *whole reason* for asking is that the
  self avatar unmounts them and discards an unsaved plan — **did nothing**, through two rounds
  of review, a table in the PR body, and a WORKLOG entry describing it as done. I had "read the
  diff back" as the rule says, and read the **call sites**: seven `{ corners: false }`, all
  present, all correct. I never read the function they call. **Verifying a fix means verifying
  the mechanism, not the invocation — a flag is two halves and the half you wrote last is not
  the half that fails.**

- **Nothing could have caught it, which is the second half of the lesson.** `BSMastRow` is a
  window global the mount harness never stubbed, so `bsProMastRow` hit its
  `if (!MastRow) return null` guard in *every* existing test and the trailing cluster was never
  in the markup to assert on. A green suite was evidence about the harness, not the code.
  `tests/broadsheet-render.test.mjs` now asserts both directions on the returned **element**
  (`props.trailing` null vs not) — chosen over rendered markup because it is the invariant
  itself and does not depend on `BSProAvatarButton`'s hooks resolving in-harness. **Mutation-
  checked: reintroducing `trailing={bsProCorner()}` fails it, restoring the fix passes.** Suite
  **1395**.

- **Audited the class the bug belongs to — "flag accepted, never read" — across the whole PR.**
  Every other conditional this work relies on genuinely consumes its flag: `BSMeCorner`'s
  `search`, `BSDetailHeader`'s `noCorner` *and* its `trailing`, and `bsRadioCorner`'s `bg`.
  `corners` was the only one. The two marketplace drill-ins fixed in the same commit
  (`BSCoachDetailPublic`, `BSCoachAvailabilityCalendar` — the selected coach and calendar are
  local state, the nav descriptor keeps only `marketRole`, so the avatar's Settings hop returns
  the member to a fresh directory) therefore pass `trailing: null` **literally rather than
  behind a flag**: on this row, a flag has already shipped ignored once.

- ⚠ **SETTINGS IS AN OVERLAY, NOT AN EARLY RETURN — the fix that closed the class rather than
  its instances.** Nine rounds of "the avatar discarded my work" all came from ONE line: the
  shell answered `shape:openProfile` with `if (showSettings) return <BSSettings/>`, which
  unmounts the entire tab tree; `useStateBSC`/`useStateBSP` are plain `React.useState` with no
  persistence, and the nav descriptor records only `{tab}`, so nothing could restore what the
  unmount destroyed. Settings now renders **over** a still-mounted tree at `zIndex 210` in all
  three shells (above the tab bar 55 and pinned masthead 60, below the profile customizer 220
  and `BSUniversalSearch` 230, so search opened *from* Settings still paints over it; the
  wrapper is its own stacking context, so Settings' own sheets stack inside it unchanged).
  The calendar and cycle takeovers render it too — they return before the main return, so a
  main-return-only overlay would never paint. **This is why the per-component audits kept
  missing instances: the destroyed state usually lives in a DESCENDANT of the component
  drawing the corner, so an audit keyed on that component cannot see it.**

- ⚠ **A CORNER THAT FIRES CORRECTLY AND LANDS NOWHERE IS STILL A DEAD CONTROL** — three of
  these, all found after the overlay shipped. (1) Three portalled surfaces (follow-list sheet
  and Nora's profile at z 100000, The Splits at 99992) float above BOTH overlays, so the
  avatar opened Settings *underneath* them — a regression from the overlay change, since the
  early return used to unmount the portal's owner. `search={false}` already encoded that fact
  for the ⌕ half; it became **`close`**, one prop for one fact: drop the ⌕ AND dismiss the
  portal before handing off. (2) The follow-list masthead computed `calc(46px + env())` instead
  of `BS_MAST_TOP_CSS`, carrying neither the 44px floor nor `--bs-notch-floor` — on a 59px
  inset it sat at 105px against everyone else's 71px, so the one masthead visibly breaking the
  uniform inset was the one that did not read the constant. (3) The Settings avatar was dead on
  **25 of 26 panes**: routing to the root means clearing every selector above it, and the reset
  cleared `detail` while all 26 flags stood. The identifier gate now parses the source and fails
  if a pane early-returns without being reset (mutation-checked). `editing` is deliberately NOT
  reset — it holds the unsaved identity draft ON the root, the exact thing this work exists to
  protect.

- ⚠ **THE SIXTH ROUND OF ONE CLASS, AND THE REASON ENUMERATION BEAT PATCHING.** `BSPage`'s
  pinned condensed masthead injects `window.BSMastCorner` once the scroller passes 64px — so
  every page that removed its corners got them **back** the moment the reader scrolled. Codex
  named two; the class was **twelve**, including a *required* PAR-Q health gate that
  necessarily scrolls. A mechanical sweep proved itself untrustworthy twice (it missed
  `BSHealthIntake`, a ternary rather than a literal `null`, and then `BSProGroceryLists` —
  another ternary, and on `BSMasthead` rather than `BSMastRow`), so the list came from 13
  independent adversarial verifiers plus a completeness critic; two candidates were correctly
  refuted as unreachable dead code and one as portalling outside any `BSPage`.
  **The fix is a CONTEXT, not a prop, and that distinction is the whole lesson:** a prop states
  the fact twice — once by omitting the corner, again by remembering to tell `BSPage` — and
  those two drifting is what produced twelve defects. The page now states it **once**, by
  rendering a trailing-less row, and the pinned strip honours it. All three row components
  report (the twelfth instance lived on the one that would otherwise have been missed), a
  conditional is correct in BOTH its modes for free, and **zero per-surface edits were needed**.
  Reference-counted rather than boolean, since a boolean is order-dependent the moment a page
  renders two rows. Deliberately NOT `mast={false}`: besides deleting the pinned strip it stamps
  `data-bs-noswipe` and would have silently killed nav swipe.

- **Two guards added so none of this can silently return**, both mutation-checked:
  `tests/broadsheet-identifiers.test.mjs` fails if a Settings pane is gated but not reset, and
  the new **`tests/broadsheet-pinned-corner.test.mjs`** drives the REAL `BSPage` — the repo has
  neither jsdom nor react-test-renderer, and the existing broadsheet shim no-ops `useEffect`,
  which is the mechanism under test, so it carries a small purpose-built driver that flushes
  effects.

- ⚠ **Two of my own verification methods were wrong, not the code** — recorded because both
  read as findings at first. `grep -c "zIndex:210"` returned 1 on a bundle that is one line
  (`grep -c` counts LINES); and a regression check that reported five live pages losing their
  pinned corner — including client Home — was a broken span parser truncating at the `/>` inside
  a `title` prop. The real answer was two, both dead components. **Check the check before
  believing the finding.**

- Verified on the final head: JSX parse · LF (CR=0) · NUL scan clean · one declaration per
  constant per module · the identifier gate · the mount harness
  (`tests/broadsheet-render.test.mjs`) + a BSSettings mount across its root and three takeover
  branches · `npm test` **1400/1400** · PowerShell `VITE_BASE=/m/` build clean, with the `env()`
  term confirmed present in the emitted bundle and the hand-rolled inset confirmed absent.
  **Squash-merged `3fe6e386e` (#1865)** — CI green (Web · Mobile · gitleaks), Codex clean on
  `43323868d`; branch kept. Open: the OWNER on-device pass — the row's inset under a real notch,
  across papers, on both roles, plus a scroll past 64px on a corner-less page (the live monitor
  or the health gate) to confirm the pinned corner stays away.

