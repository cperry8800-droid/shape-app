# Client Home "Front Page" hybrid restructure — design spec

**Date:** 2026-07-03 · **Status:** approved by owner (direction pick + mockup review)
**Surface:** `BSClientHome` (`mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`,
~lines 2080–3010) — a **render-section refactor**. All state, hooks, effects, and
overlay early-returns survive untouched.

## Problem

Home stacks ~11 full-weight bordered instrument cards, each with its own eyebrow +
CTA (check-in nudge · directive · goal · meals · workout · coach feed · habits ·
steps · shop list · weekly totals · progress door). The uniform plate loudness IS
the busyness — 5+ CTAs shout equally, and the day's workout appears at full weight
twice. Constraint: **keep everything reachable** — consolidate and demote, don't
delete.

## Direction (owner-picked)

**Hybrid: "Front Page" skeleton + "One Voice" door shelf.** One engine-owned lead
plate, a time-ordered slate of quiet rows, a typographic "Inside." index, and a
compact horizontal shelf of square-ish utility doors. Owner decisions baked in:

1. **Check-in bulletin rides ABOVE the lead** — preserves the #1513 nudge-on-top
   call as a slim 40px line, not a plate. Decays to an index row once logged.
2. **Nutritionist byline + FULL PLAN move to the Eat tab** (which already renders
   plan + nutritionist). Home keeps schedule rows only.
3. **Compact shelf doors** — short rectangles (~112×64), not squares.
4. **Habits keep 3 working checkbox rows** inside the slate (graft from "Four
   Chapters" — not the single next-habit row).

## The Front-Page Rule (the page's constitution)

- **THE LEAD** — exactly ONE `BSPlate` on the page, engine-owned: only
  `todayDirective`'s #1 action fills it. The page has exactly **one CTA button**,
  ever.
- **BULLETINS** — max 2 slim one-liners for DUE, time-sensitive items, ABOVE the
  lead. Urgency earns height; completion demotes back to an index row.
- **THE SLATE** — one time-ordered run-sheet. Admission test: "is this scheduled to
  happen TODAY?" Rows, not cards.
- **INSIDE.** — everything else: index rows (live figure + door) and shelf doors.
  Zero borders on rows, zero buttons, zero serif headlines besides "Inside."
- **Anti-accretion:** every future feature lands as an index row or shelf door by
  default; it may never mint a plate, and claims a slate row only by passing the
  scheduled-today test. Enforced by a code-comment contract at the top of the
  render: *"Do not add a plate. If it can't be a row, it lives on a tab and gets at
  most a row-door."*

## Structure (top → bottom)

Chrome unchanged: masthead · BSTicker · Clients Edition band · BSNowPlaying ·
THIS WEEK strip + Month chip (selIdx still drives the day).

1. **BULLETINS (0–2, above the lead):**
   - Daily check-in when due: `● CHECK-IN DUE · energy · sleep · 30 sec ›` →
     `todayPage`. (#1 nudge absorbed; status logic extracted to
     `useBSCheckinLogged` from `BSTodayNudge`'s manual-signal effect — predicate
     carried verbatim.)
   - Weekly check-in when `checkinDue`: `● WEEKLY CHECK-IN · 2 min ›` → `checkinPage`.
   - Each suppressed when the lead already targets that lever.
2. **★ THE LEAD** — the `TODAY · YOUR MOVE` plate (#2 directive + the featured half
   of #5). Same engine priority chain. Lead=workout carries the compact 3-move list
   + `I'LL TRAIN TODAY →` + quiet `PREVIEW →` mono link; lead=meal carries title +
   macros + `I'LL LOG IT →`; done-state "You kept your word today." still renders
   (the fold is never empty). Non-today selIdx: no lead (as now).
3. **▤ TODAY'S SLATE** — head `TODAY'S SLATE · {upNextLabel}` + right `EAT →` +
   the 2px ink→accent ledger. Time-ordered `BSSlateRow`s:
   - One row **per meal** (#4): time · MEAL tag · title · kcal · 36px ghost
     log-tick □ / `✓ LOGGED` (heroMealId suppression kept — the lead's meal shows
     `↑ LEAD` instead of its tick). Tap title → `BSMealPreview`.
   - The **workout** row (#5): time · TRAINING · title · `54 MIN` · → workout
     preview. Shows **`↑ LEAD`** (no second action) when it IS the lead; gains a
     quiet mono **`Start →`** link when it is NOT (training stays one tap). Rest
     day → the Active-recovery row. The numbered move list leaves Home (preview +
     Train own it).
   - **Up to 3 open habit rows** (#7) with the existing 26–28px checkboxes wired to
     `toggleHomeHabit` (stopPropagation + the #1502 keyboard guard), DO/AVOID
     micro-tags, `+pts`, the inline `✓ +N pts` flash chip, demo-lock 🔒 routing,
     all-done/add-first states. Footer `+N more · View all →` → habits page.
   - **Coach-pushed items** (#6a) as COACH-tagged rows (same payload taps).
   - **Coach weekly notes** (#6b): BOTH notes as italic op-ed lines **with
     bylines** ("— Jordan Chen · Trainer"), after the rows. While here, **fix the
     pre-existing demo-notes leak** (~line 3085): demo Jordan/Maya notes render
     signed-out only.
4. **§ INSIDE.** — serif "Inside." head + ledger, then:
   - **Index rows** (`BSIndexRow`, 44px, hairline-ruled, dot leaders): SESSIONS
     `4/5 ›` and AVG KCAL `1,890/2,100 ›` (#10, both → the existing weekStat sheet,
     **signed-out-only gate preserved**); CHECK-IN `Logged ✓ · add water ›` (the
     bulletin's residue once logged).
   - **The door shelf** (`BSShelfDoor`, from "One Voice", compacted): horizontal
     snap-scroll, 3 visible + a 12px peek — **STEPS** `7,240 · 760 to go ›` →
     `BSStepsHistory` (connect-a-watch empty state → `shape:openIntegrations`);
     **GOAL** `27% · on track ›` → `goalsPage` (no goal signed-in = no door);
     **PROGRESS** (the 4 colored section ticks) → `homeProgressPage`; **SHOP LIST**
     `by aisle ›` → `__bsPendingGrocery` + `goEat()`.
5. **Your widgets** grid — kept unchanged (user-added, exempt from the rule).
6. Footer unchanged. All early-return overlays untouched.

## New surfaces

- **`BSSlateRow`** (~60 lines): min-height 48px, grid `50px 58px 1fr auto 20px`,
  1px `t.HAIR` bottom rule. Time mono 9.5/700 tabular INK50 · 2px domain bar + mono
  8/800 tag (MEAL teal · TRAINING t.RUST · HABIT t.GREEN · COACH per kind) · title
  `t.DISPLAY` 14.5/600 ellipsis · status mono 9 · chevron OR inline control (36px
  meal ghost-tick / 26px habit checkbox). Whole row a button ≥48px, Enter/Space,
  press-flash `t.PAPER2` 120ms.
- **`BSIndexRow`** (~50 lines): 44px, grid `86px 1fr auto 18px` — mono domain label,
  dot leader, `t.DISPLAY` 13.5/600 tabular figure, 5px status tick (pulses only
  when due, ✓ when done), chevron. No background/border/radius.
- **`BSHomeBulletin`**: 40px, hairline top+bottom, pulsing 6px tick + mono label +
  detail + ›. Button, keyboard-activatable. Renders only while due AND not the
  lead's lever.
- **`BSShelfDoor`** (owner-compacted): ~112w × 64h, `bsTHexA(t.INK,.03)` fill, 1px
  `t.HAIR` border, radius 6, 2px domain corner tick top-right; mono 7.5 eyebrow ·
  `t.DISPLAY` 17/800 tabular figure · mono 7 status + ›. STEPS/GOAL may carry a 2px
  bottom progress sliver at pct. Container: flex, gap 8, `overflowX:auto`,
  `scrollSnapType:'x mandatory'`, `.bs-hide-scroll`; doors are native buttons (DOM
  order = VoiceOver order). Press scale(0.97) 120ms.
- **Modified variants:** `BSTodayNudge` → `variant="bulletin"|"row"` (keeps its
  logged-detection effect, extracted as `useBSCheckinLogged`); `BSStepsCard`'s data
  effect → `useBSStepsToday` feeding the door + keeping the `BSStepsHistory`
  overlay mount; `BSMeGoalCard` → door variant (same loader + honest gate);
  `BSProgressDoor` → door variant (presentational).
- **Deleted:** the AgendaCard workout/meals plates, the standalone habits plate,
  the goal card slot, the steps card slot, the shop-list card, the weekly-totals
  tile grid + "So far" head (data feeds the two index rows → same sheets), the
  standalone nudge plate.

## Workout double-feature fix

The lead's subject never gets a second interactive surface. Lead=workout → the
slate's TRAINING row is a 48px schedule echo with `↑ LEAD` in place of its chevron
and no action. Lead=something else → the workout is only the slate row + quiet
`Start →`. Meals mirror via `heroMealId`.

## Honest-data gating (line-for-line carryover — review the diff for exactly this)

Every row/door inherits its card's exact gate: weekly totals signed-out-only ·
goal hide-when-none · steps hide-or-connect-prompt · habits demo-lock 🔒 ·
ticker-empty · coach feed live-first. Plus the one fix: demo coach notes become
signed-out-only (pre-existing leak). A missed gate here is a demo-leak regression.

## Motion

Slate rows stagger in 30ms apart (opacity + 4px rise, 180ms) via the #1518
insertion-effect CSS pattern; rows are plain functions so DOM nodes stay stable and
entrances never replay on check-off. The index fades in as one quiet block (220ms).
Micro-bars/slivers draw 0→pct over 400ms. Only due-ticks pulse. Bulletins mount
above the slate so late data never shoves the lead. `bsSdReduced()` → final state.
No count-ups on Home (glance state, not replay).

## Nothing-lost check (all 11 pieces)

1 Check-in → bulletin (due) / index row (logged) → todayPage. 2 Directive → the
lead. 3 Goal → GOAL door → goalsPage. 4 Meals → slate rows + `EAT →`; byline/full
plan → Eat tab (owner call). 5 Workout → lead or slate row + `Start →`; move list →
preview/Train. 6 Coach → COACH slate rows + bylined op-ed notes. 7 Habits → 3
slate checkbox rows + View all. 8 Steps → STEPS door → history. 9 Shop → SHOP door
→ grocery deep-link. 10 Weekly totals → 2 index rows → weekStat sheets. 11
Progress → PROGRESS door → homeProgressPage. Widgets grid + all chrome + all
overlays unchanged.

## Risks / notes

- Discoverability of demoted doors: watch SHOP/PROGRESS tap-through post-ship; if
  they crater, promote figures to micro-bars — not plates.
- Habit checkbox inside tappable rows: keep stopPropagation + the
  `e.target === e.currentTarget` keyboard guard.
- 4th shelf door off-screen: the 12px peek + snap is the cue; verify VoiceOver
  traversal.
- The file is 16k+ lines: parse-check, PowerShell mobile build, 363 tests, LF
  normalization, `public/m` via CI's Linux build (#1470), staging click-through +
  on-device pass before merge.

## Out of scope

The coach homes, the website dashboard, the engine (`todayDirective` logic is
reused as-is — no time-of-day slots), tab pages.
