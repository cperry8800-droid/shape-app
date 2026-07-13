# The Work domain — habits, goals, milestones on the wire & the crossover

**Date:** 2026-07-13 · **Status:** Spec for owner review (build follows approval)

## The problem

Shape's thesis is shaping many elements of a life — but the app's domains stop
at the body: train, eat, sleep, recover. Work, where members spend most of
their waking hours, has no home. There's no work-habit vocabulary in the habit
sheet, no career intent in The Contract, no way to mark a professional win,
and none of the cross-domain reads that only Shape's data could power. The
one place work already leaks in is the weekly check-in's "wins & struggles"
free text — proof of demand with no structure behind it.

## Direction

One wave, three PRs, riding existing systems end to end. No new tables; two
small migrations (the career award RPC + ledger category, and the milestone
exclusion on the generic post award).

1. **PR A — the foundation:** work habits (suggestion chips + a `domain`
   stamp) + **THE WORK station** in The Contract.
2. **PR B — THE APPOINTMENTS:** work milestones as share-by-choice posts on
   the wire, with the **+25 CAREER award** (capped once a month).
3. **PR C — THE CROSSOVER:** engine-computed training × work reads on the
   Progress hub.

**Score integrity, stated up front:** the only new earn is the milestone +25,
and it is bounded by rarity (one per calendar month, member-tz), exactly the
way the PR-wall award is bounded per-lift-per-month. Habits keep their
existing +3 — work habits add vocabulary, not mechanics.

## PR A — work habits + THE WORK station

### Work habits

- The add-habit sheet gains **work-flavored suggestion chips** — do: *Deep
  work block · Read 20 min · Plan tomorrow's top 3 · Applied to one job*;
  don't: *No doom-scrolling at the desk · No email after 8pm · No phone the
  first hour*.
- A chip-added work habit carries a new **optional `domain: 'work'` field**
  through the habit encode/decode (and an unobtrusive domain toggle on the
  add sheet for hand-typed habits). Absent on everything else — honest-absent,
  never inferred from the name.
- Rows with the stamp show a small mono **WORK** tag in `t.BLUE` (slate — the
  domain's accent, distinct from trainer rust / nutritionist gold / brand
  teal), on the Habit Ledger and the home slate.
- Points: **the same +3 every habit earns.** No new award, no new cap, no new
  farm surface. Work habits flow into the coach roster adherence counts like
  any habit (a habit is a habit — deliberate, named here).

### THE WORK station (The Contract)

- The Goals page gains a third station — **WORK** — beside Training and
  Nutrition: a headline goal (*"Make the promotion case by Q4"*, `workMeta`)
  over supporting targets (`work[]`), same one-goal-many-terms grammar as
  #1585, accented `t.BLUE`.
- The template picker gains a Work category: *Ship the launch · Certification
  · New role search · Side project · Promotion case*.
- Storage rides the existing `user_goals('client_goals')` document (`work` +
  `workMeta` keys) — **no migration**; `get_client_goals` already returns the
  whole doc.
- **Coach visibility (named decision):** work goals ride the SAME
  share-with-coaches toggle as everything else. A trainer knowing a member
  has a launch week is real programming context; members who want privacy
  flip the one toggle they already know.

## PR B — THE APPOINTMENTS: milestones on the wire

Old broadsheets ran an *Appointments* column — who was promoted, who joined
which firm. That's the card's native grammar.

### Composer

- The Log-activity sheet (note / photo / video / workout / link) gains a
  **Milestone** type: a **stamp picker** (*PROMOTED · SHIPPED · CERTIFIED ·
  NEW ROLE · LAUNCHED*, or plain *MILESTONE*), a required headline (trimmed,
  ≤ 80 chars), an optional one-line detail (trimmed, ≤ 140 chars).
- **No organization field and no compensation fields exist at all.** Money is
  this domain's calories: no salary, comp, or revenue figures anywhere, ever —
  no field to put them in, and no comparison framing on any surface.
- The composer's existing visibility choice applies (Public / Profile /
  Just me). Share stays a choice.

### Storage & card

- Rides `community_posts.metrics` — `{ kind: 'milestone', stamp, detail }` —
  plus `activity_type: 'milestone'`. **No new table.**
- **The stamp contract (one behavior, both surfaces):** `stamp` is ALWAYS
  stored — one of the six canonical tokens `promoted · shipped · certified ·
  new_role · launched · milestone`. The composer defaults to `milestone`,
  and an unknown or missing value normalizes to `milestone` at write AND at
  read, so mobile and web can never diverge. (Honest-absent applies to the
  DETAIL line, not the stamp — every milestone carries a stamp.)
- **`detail` round-trips:** the optional one-liner persists in the payload —
  trimmed, capped at 140 chars, OMITTED entirely when blank — and the card
  reads it back from storage (covered by persistence tests).
- The card renders in the wire grammar: **THE APPOINTMENTS** eyebrow, the
  stamp as a squared chip (MILESTONE is the quiet default), serif headline,
  the detail line only when stored, the standard reaction row.
- **Reaction verb:** a new `career` bucket → **"Onward"**, keyed off
  `metrics.kind === 'milestone'` (never name regex); Props stays the
  fallback. One unified count, as always.
- **Feed filter:** a **MILESTONES** chip joins the type row on BOTH surfaces
  (app `bsFeedTypeMatch` + web `bucketsFor`/`mapPost`); milestones file under
  MILESTONES only.

### Scoring — the +25 CAREER award

- **Migration `2026-07-13-work-milestone-points.sql`:**
  - Widen the `score_ledger` category CHECK with **`career`**.
  - **`award_work_milestone(p_post_id)`** — SECURITY DEFINER (pinned
    `search_path = public`), self-scoped to `auth.uid()`, returning
    **`granted boolean`**:
    - **Validates the FULL milestone shape server-side** — the post exists,
      `author_id = auth.uid()`, `metrics->>'kind' = 'milestone'`, the stamp
      is one of the six canonical tokens, and the title is non-empty within
      the length caps. A malformed or non-milestone post earns nothing.
      (Stated honestly: every milestone is self-reported by nature — a forged
      milestone-shaped row can never mint MORE than the composer's own
      legitimate ceiling of one +25 per month; the cap is the economic
      defense, the shape check keeps garbage rows from qualifying.)
    - Grants **+25**, `source_kind 'work_milestone'`, deterministic
      `source_id = md5('work_milestone:' || uid || ':' || <YYYY-MM in the
      member's own tz via shape_user_tz>)`, inserted with
      **`ON CONFLICT (user_id, source_kind, source_id) DO NOTHING`** — a
      second milestone in the same month is a **successful no-op returning
      `granted = false`**, never a unique-violation error; the post itself
      always succeeds.
    - **Exact privileges:** `REVOKE EXECUTE ... FROM PUBLIC, anon;
      GRANT EXECUTE ... TO authenticated;` (members must be able to call it;
      anonymous must not) — verified live after apply.
  - **`award_community_post` excludes milestone posts** (both checks —
    `activity_type` and `metrics->>'kind'` — the exact meal-share pattern),
    so a public milestone never double-dips the +5.
- **The award call is AWAITED, never fire-and-forget** (it's the only award
  path): after the post insert succeeds the client awaits the RPC — safe to
  retry because the monthly dedupe makes it idempotent. If the call fails
  (network/backgrounded), a **catch-up pass on next app open** re-fires it
  for the member's own current-month milestone post (the
  `award_my_goal_milestones` open-time catch-up precedent), so the member
  can never permanently lose the award. The confirmation shows
  **"+25 · CAREER · SHAPE SCORE" only on `granted = true`** (the meal-logger
  +10 pattern). A second milestone in the same month posts fine and honestly
  shows no award chip.
- The award attaches to **logging**, not visibility — Public, Profile, and
  Just-me milestones all earn identically, so points never coerce sharing.
- Legend & Record: `career: 'Career milestones'` joins `CATEGORY_LABELS`;
  the score legend gains *"Log a career milestone +25 (max once a month)"*;
  The Record's by-source bars pick the category up automatically.
- Farm math, stated: the cap bounds a determined farmer at +300/year against
  tier thresholds of 750/2,000/5,000/15,000 — points that matter, a farm that
  can't.

## PR C — THE CROSSOVER

The differentiator: Shape holds both halves of the data. Once work habits
exist, the engine can compute what no one else can.

- **Pure tested module** (`crossover.mjs`, the weekend-split sibling): takes
  PRE-BUCKETED days — `{ workHabitScheduled, workHabitDone, trained,
  sleepHours }` — and reports two associations: work-habit completion on
  **training days vs rest days**, and across **sleep bands**.
- **The statistic, exactly** (so PR C's tests are deterministic):
  - Only days with **≥ 1 scheduled work habit** enter any comparison; the
    per-side **completion rate** `p = done / scheduled` uses **scheduled
    work-habit days as the denominator**.
  - **Training split:** a training day is a day with a real workout signal
    (`workout_minutes > 0` on the snapshot, or a logged session); all other
    qualifying days are rest days.
  - **Sleep split:** short = `sleepHours < 6.5`, long = `sleepHours ≥ 7`;
    days in **[6.5, 7) are EXCLUDED** (a deliberate separation band); days
    with **missing/invalid sleep data are excluded from the sleep
    comparison only** (they still count in the training split).
  - **Gap** = `pA − pB` in percentage points. **SE** is the two-proportion
    standard error `sqrt(pA(1−pA)/nA + pB(1−pB)/nB)` (n = scheduled days
    per side). **The insight fires only when |gap| ≥ 12 pp AND
    |gap| ≥ 1.65·SE.**
  - **Floors** (below which the module returns null and the card renders
    NOTHING): span ≥ 21 days AND ≥ 8 scheduled work-habit days on EACH side
    of the comparison.
- **Phrasing is never-shaming, observation + move — and the copy is a
  TEMPLATE:** the percentage and direction bind to the COMPUTED result
  (gap rounded to a whole number, direction from its sign), e.g. *"Your
  deep-work habit lands {gap}% more often on days you train — protect the
  morning session."* No result → the card renders nothing at all; a live
  surface never shows a fabricated figure (the values in this document are
  illustrative only). Either direction reports neutrally; noise reports
  nothing.
- **Surface:** a **THE CROSSOVER** card on the Progress hub's Overall tab.
  Ships honest-empty and lights up as data accrues. Member-only in v1 (no
  coach surface).

## Guardrails (carried whole from the meal/share waves)

- **Share by choice** — never auto, and the award never depends on
  visibility.
- **No comparison framing** — no compensation figures, no milestone
  leaderboards, no "who got promoted faster," ever.
- **Honest-absent** — missing detail/data renders nothing (every milestone
  carries a stamp by contract); the award chip shows only when granted.
- **Never-shaming** — the crossover reads are observations with a move, not
  verdicts.
- **Real-signal scoring** — the one new earn is rarity-capped; everything
  else keeps its existing gates.

## Acceptance criteria

1. A member adds a work habit from a chip → it earns the normal +3, shows the
   WORK tag, and carries `domain: 'work'`; a hand-typed habit without the
   toggle carries no domain.
2. THE WORK station renders on the Goals page with headline + targets +
   templates; saved goals round-trip through `user_goals('client_goals')`
   and appear to a coach only when the share toggle is on.
3. Logging a milestone (any visibility) grants +25 ONCE per calendar month in
   the member's tz; the AWAITED RPC returns `granted = false` (never an
   error) on a same-month duplicate, and a failed call is re-fired by the
   open-time catch-up; the chip renders only on `granted = true`; a public
   milestone earns no +5 post award; the ledger row reads category `career`;
   the RPC rejects malformed/non-milestone posts and is callable by
   `authenticated` only (not PUBLIC/anon — verified live).
4. Milestone cards render THE APPOINTMENTS grammar with the stored stamp
   (unknown/missing values normalize to MILESTONE identically on both
   surfaces), round-trip the optional detail line through storage, react
   with "Onward," and file under the MILESTONES chip on both surfaces — and
   under no other type chip.
5. No surface anywhere accepts or displays compensation figures.
6. THE CROSSOVER renders nothing until its floors are met; with sufficient
   data it reports the training-day and sleep-band associations per the
   exact statistic above (deterministic test vectors cover the floors, the
   12 pp + 1.65·SE gate, the [6.5, 7) sleep exclusion band, missing-value
   handling, and both directions); rendered copy binds the computed gap —
   never an illustrative figure.
7. Score legend + The Record show the career category accurately.

## Build plan

- **PR A (mobile):** habit chips + domain stamp + WORK tag · THE WORK
  station with templates. No migration.
- **PR B (mobile + web + migration):** Milestone composer type · THE
  APPOINTMENTS card · career verb bucket · MILESTONES chip both surfaces ·
  `work-milestone-points` migration (owner applies) · legend/Record wiring.
- **PR C (mobile):** `crossover.mjs` + tests · THE CROSSOVER Progress card.
  No migration.
- Out of scope (v1): career coaching as a provider discipline; work-goal
  coach surfaces beyond the shared-goals read; website Goals-page WORK parity
  (follows the established web-parity follow-up pattern); Nora awareness of
  work goals (rides the member-context block later if wanted).
