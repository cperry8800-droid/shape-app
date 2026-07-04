# Coach Ledger — trainer/nutritionist Today + Clients roster + client Case File — design spec

**Date:** 2026-07-04 · **Status:** owner-approved (concept boards: Today = the
**T3 "Assignment Rail" combo** the owner assembled from T1 + T2; Roster = **R
"Client Index"** approved as boarded; Case File = **C** approved with **heat =
the client's tier** and the standing constraint that **the signals engine
leads** — "make sure the shape engine is still doing its best to help guide the
coach on next actions", scoped by the owner to the Case File and honored across
all three surfaces). · **The coach wave** — these are the app's last
pre-redesign surfaces, after Session Details #1523 · Home #1527 · Feed #1528 ·
Terrain #1532 · Progress #1535 · Marketplace #1536 · website profiles #1537.

All four components serialize into the shipped **Open Ledger / Wire Dispatch**
language: zero-box stations on a 2px heat rail, eyebrow-above-figure ledger
registers, dot-leader rows, honest-absent redaction lines, typographic indexes,
one-shot in-view motion, reduced-motion = finished state. Concept board (owner
reference): `claude.ai/code/artifact/531a81a8-edde-4da2-bd2f-5305e1fc5fb6`.

---

## Global disciplines (all three surfaces)

### Heat declarations

| Surface | Heat | Notes |
|---|---|---|
| Coach Today (both) | **the coach's ROLE** — trainer rust `#c0533b` (one literal, both papers, per the feed spec) · nutritionist gold `t.isLight ? '#a07a2e' : '#d8b25a'` | the edition's identity color, same declaration the feed + Marketplace made |
| Clients roster | role (same pair) | severity is separate + semantic (below) |
| Case File | **the CLIENT's member tier** (`bsTierForPoints(points)` → `bsTierColor`) via the existing `get_user_points` batch RPC; **fallback = role heat** when the row has no `userId` or points are unresolved (demo roster) | each file reads as *that member's* ledger — the Terrain/Progress "member surface = tier" rule. The tier ring stays on the avatar in both cases. `bsTierForPoints` is client-module-local today — add it to the client module's `Object.assign(window, …)` export block so the pros bundle reads it off `window` (the established load-order pattern) |

**Line-only, closed placement lists:**

- **Today:** the rail · station-head ticks + ink→heat rules · register rules +
  count-up underline draws · the NOW line/tick · the `↑ NEXT` marker + the next
  entry's type-tag underline · week-strip selected underline · verdict serif
  period · the dateline's edition word.
- **Roster:** station ticks + rules · verdict period · the serif "clients."
  accent word · filter-index active underline stays **teal** (page chrome, the
  Classifieds precedent).
- **Case File:** the rail · station ticks + rules · register rules · action-line
  underlines (MESSAGE · ADJUST · SCHEDULE · ✦ DRAFT) · tab underline · name
  serif period · status tick · weight-trace stroke + end dot · week-bar best
  fill (`BSSdBars`) · YOUR-MOVE action underline.

**Teal** stays reserved for **live/action**: the LIVE bulletin (spine + tick +
WATCH/OPEN verbs), the radio bar, page chrome (search corner). **Semantic
colors** (state, never identity): severity **rust FLAG · amber `#d8a23a` WATCH
· green `#5fa96e` NEW** on wire/roster spines + the demoted **⚑ + severity
word** on rail entries — always **NAMED** in mono text, never color-only.
Case-File rust = the weekend flag + accountability penalties only. Everything
else demotes to ink-alphas; the old schedule tag palette (`t.RUST/BLUE/GREEN/
AMBER` per booking type) **dies** — type reads as named mono text.

### The three rules (owner-ratified)

1. **Loop rule** — ONE breathing tick per page: the teal LIVE bulletin dot when
   a client is mid-workout/mid-cook; otherwise the NOW tick on the rail.
   Roster + Case File carry **zero** loops.
2. **Anchor rule** — a flagged client **with a session today** threads inline
   under their rail entry (a wire block: severity spine · bold lead-in ·
   one-line directive); a flag with **nothing booked** lands in THE WIRE
   section below, with `SCHEDULE →` as its action. No client is ever listed
   twice on the page.
3. **Attention budget** — the page shows **ONE lead + at most THREE wires
   total** (inline + below combined), picked by the engine's existing ranking.
   Flagged clients beyond the budget demote to a small `⚑ FLAG` mark on their
   rail entry and the roster leader's count ("SEE THE FULL ROSTER ···· 12
   CLIENTS · 5 FLAGGED →"). The NEED-YOU register always shows the TRUE total,
   not the budgeted subset.

The same budget philosophy governs the Case File: the LEAD is **one
directive, one action, at most three evidence lines**; each station below
leads with at most one register **row-group** plus one visual (a row-group
may hold several registers — the CHECK-IN 6-mini-register grid and the SLEEP
register pair each count as their station's single row-group/visual);
full history lives one tap deeper (HISTORY → / LOG → / the check-in page).

### Motion contract

One-shot entrances gated on per-station `useBSSdInView` + a per-tab/page seen
map (the Terrain pattern — a revisit renders the finished state): rails grow
(`bsSdGrowY`), registers count up (`BSSdCountUp`) + rule draws, rows stagger
30–70ms, week bars draw rightward (`BSSdBars` with `still`), the weight trace
self-draws (`bsSdDrawLine`). Everything spreads
`...(reduced ? null : seen ? {animation} : {hidden-initial})` off `bsSdReduced()`.
**No new keyframes** — the shipped `bsInjectSessionDetailCss` set covers all of
it. The two Today loops (bulletin dot / NOW tick) are the only infinite
animations across the three surfaces.

### Honesty rules (carried verbatim)

Signed-in coaches never see demo narrative, demo bookings, demo rosters, or
demo figures — every current `bsProSignedIn()` / `coachSignedIn` gate carries.
Absent data renders a one-line redaction (`─── RESPIRATORY · NOT SYNCED ───`)
or drops the figure, never an empty chart or a fabricated number. Signed-out
preview keeps the full rich demo day in the new grammar.

---

## Surface A — Coach Today (`BSTrainerToday` + `BSNutriToday` → one `BSProToday`)

The two pages are near-twins; this wave **consolidates them into one
`BSProToday({ role, ... })`** driven by a role config (heat pair, edition
label, analytics endpoint, demo datasets, INSIDE doors, live-bulletin verb).
`BSTrainerToday` / `BSNutriToday` remain as thin wrappers so the shells and
tour anchors don't move. All current props (`goCalendar`, `goRadio`,
`onOpenReviews`, `onWidgetOpen`, `onWatchLive`, `onProfile`, …) keep working.

### Structure (top → bottom)

1. **Masthead** — unchanged (`compact thinRule noTopRule`, wordmark, corners).
2. **Dateline** — one hairline mono line replacing the PAPER2 "Coaches
   Edition" band: `COACHES EDITION · TUE · JUL 7` (trainer) / `NUTRI EDITION ·
   …` left — the edition word in heat — and the live clock right
   (`bsNowHHMM()`, non-today selection shows the date). Zero-box.
3. **Bulletins (0–2)** — slim 3px-spine rows, only when TRUE:
   - **LIVE** (teal spine + breathing dot — the page's loop): a roster client
     with a real `userId` whose `ShapePresence.activityOf` = `workout`
     (trainer → `WATCH →`, the existing `onWatchLive` path) or `cooking`
     (nutritionist → `OPEN →`, the existing `shape:proMessageClient` 1:1
     thread path — `BSLiveBoostSheet` is client-module-local; reusing it here
     is an optional follow-up, not this wave). Multiple live → `{name} · +N
     MORE`. Signed-out keeps the demo bulletin.
   - **REVIEW** (heat spine, no loop): the review queue when it has items due
     (today: demo-only signed-out, same honesty as the current Queue).
4. **THE LEAD** — station head + **serif verdict** (1–2 sentences, heat
   period): the engine's #1 move for the day, composed from the ranked triage
   top item + the day shape (first booking time, open block). Signed-in with
   no flags + no bookings: "Nothing booked, nobody flagged — a clear day."
   Signed-out keeps the authored demo narratives (reworded into verdict
   grammar). Below it, a **register row** (count-ups + heat rule draws):
   `SESSIONS n` (nutri: `CONSULTS`) · `NEED YOU n` (true total) · `OPEN HRS n`
   (whole free hours in ≥60-min gaps between consecutive bookings inside the
   booked span; hidden when the day has <2 bookings).
5. **Week strip** — `BSProWeekStrip` restyled typographic: mono day letters,
   selected day = ink + heat underline, booking density = up to 3 ink-alpha
   ticks (the colored-dot API becomes a count). Same `selDay`/`onSelectDay`/
   `goCalendar` behavior.
6. **THE RAIL** (station head `“{DOW} · THE RAIL”` + `CALENDAR →`) — the
   selected day's entries stacked in time order on the 2px heat rail, hour
   marks in a mono left gutter:
   - **Entry:** hour mark (struck + ink-30 when done) · serif client/title ·
     mono meta `TYPE · duration[ · state]` — type always NAMED (LIVE / ASYNC /
     F/U / INTAKE / CHK / PRGM / ADM), no tag colors. Done entries dim + mark
     `DONE`; the next entry carries `↑ NEXT` (heat) + a heat underline on its
     type word. Tap any entry → `goCalendar` (current behavior).
   - **NOW line** (today only): heat tick + `NOW h:mm — {X}H {Y}M UNTIL
     {first name}` (`<60min → {M}M`; after the last entry → `DAY CLEAR`),
     placed between the last past and first future entry. Breathes only when
     no LIVE bulletin is present (loop rule).
   - **Open gaps:** a dashed zero-box row `12 – 2 · OPEN` for gaps ≥90 min
     inside the booked span. Demo keeps flavored suggestions ("— WRITE
     SOFIA'S BLOCK"); signed-in stays plain `OPEN` (no fabricated tasks).
   - **Inline wires (anchor rule):** under the flagged client's entry —
     severity spine, bold lead-in (`Before this` / `In this session` / `Read
     first`), one-line engine directive. Budget-capped.
   - **Density guards:** ≥10 entries → done entries fold into one line
     (`3 DONE ✓`); a signed-in empty day renders ONE dashed row
     `NOTHING BOOKED — OPEN HOURS` (the verdict already said it honestly).
   - Data: real `ShapeCalendar.list` week fetch + `realByDate` keying carries
     verbatim; the demo `TRAINER_BOOKINGS`/`NUTRI_SCHEDULE` datasets + the
     `dataFor` today-offset mapping carry verbatim, re-rendered in rail grammar.
7. **THE WIRE** (station head `THE WIRE · NO SESSION BOOKED`, rust tick) —
   only unbooked flags from the budget remainder: severity-spined rows (name ·
   severity word · one-line directive · `SCHEDULE →` opens
   `BSProScheduleSession` for that client, or `OPEN THE FILE →`). The station
   head + rows render only when unbooked budgeted flags exist. The **roster
   leader row renders ALWAYS**, independent of the station:
   `SEE THE FULL ROSTER ····· {N} CLIENTS[ · {k} FLAGGED] →`
   (→ `onWidgetOpen('clients')`).
8. **INSIDE.** — serif index + 44px dot-leader doors (figures only when
   known; the door always renders):
   - trainer: `CLIENTS` (n active · k flagged) · `PROGRAMS` (drafts n →
     `onWidgetOpen('programs')`) · `REVIEW QUEUE` (→ `onOpenReviews()`) ·
     `PLAYLISTS` (→ `onWidgetOpen('playlists')`).
   - nutritionist: `CLIENTS` · `PLANS` (→ `onWidgetOpen('plans')`) · `REVIEW
     QUEUE` · `GROCERY LISTS` (→ `onWidgetOpen('grocery')`).
   - (The board showed a BUSINESS door; mobile has no business tab — the
     doors above replace it. Board deviation, flagged for the owner here.)
9. **Radio** — `BSNowPlaying` + `BSFooter` unchanged.

### Engine wiring (Today)

`useBSProRoster(role)` already consumes `window.ShapeSignals.triageLive` — the
ranked, scored roster. A new **pure module** (below) turns that + the day's
bookings into the budget split `{ lead, leadAnchor, inline, wires, demoted }`
(one canonical shape — see the module contract, which is authoritative) plus
the day-shape values the registers read, under the three rules. The verdict template and severity naming reuse
`bsRosterSeverity` / the triage directive strings — **no new intelligence,
wiring only.**

### Kills (Today)

The PAPER2 edition band ×2 · `BSProScheduleRows` (both call sites die with it)
· `BSProTriageFeed` (absorbed into lead + wire; delete) · the demo "Queue"
sections ×2 (replaced by the REVIEW bulletin + INSIDE doors) · the LIVE
`BSPlate` banner (replaced by the bulletin) · the `BSHeadlineNumber` day-shape
hero (fused into the lead) · the booking tag-color maps. Also swept (already
dead, zero call sites, verified): **`BSReviewQueueCard`**, **`BSProHabits`**.

---

## Surface B — Clients roster (`BSProRosterView`) · "The Client Index"

Shared by both roles (`BSTrainerClients` / `BSNutriClients` wrappers keep their
seams). The Classifieds grammar turned inward:

1. **Header** — mast row + `THE ROSTER` eyebrow + serif **"Your clients."**
   (heat italic accent word) + mono right meta `{N} ACTIVE[ · +3 THIS MO]`
   (the +3 is demo-only; signed-in shows it only when computable) + the
   existing add-client affordance as mono `＋ ADD` (≥44px).
2. **Underline search** (Classifieds pattern) — same `query` filtering.
3. **Typographic filter index** — the role's phase filters
   (`BS_ROSTER_FILTERS`) + **`⚑ NEEDS YOU`** as a rust index item (replaces
   the toggle); active = ink + teal underline (chrome). Same
   `bsClientMatchesFilter`/`bsClientMatchesQuery` logic.
4. **Verdict line** (engine, serif, heat period) — from severity counts:
   `"{k} need you — the other {m} are holding."` / all-clear:
   `"All {m} holding — nobody needs you today."`
5. **NEEDS YOU station** (rust tick + `· {k}`) — full rows: severity spine
   (rust/amber/green) · serif name · one-line ink directive (the triage
   string) · mono meta `{SEVERITY WORD} · {PHASE} W{n}` (severity always
   named). ≥52px rows, 30ms stagger, tap → the Case File (current `onOpen`).
6. **ON TRACK station** — compact quiet rows (ink-12 spine, name + mono meta
   `PHASE · STREAK`); first 5 shown, then a dot-leader expander
   `{n} MORE ON TRACK ····· SHOW ›`.
7. **PAST** — a redaction-style row `─── PAST CLIENTS · {n} › ───` toggling
   the past list (replaces the Active/Past pill toggle).
8. Empty signed-in roster → redaction line + an underlined action to the
   marketplace listing ("Grow your roster →", existing destination).

**Kills:** rounded client cards + `BSProStatusPill` (severity moves into the
named mono meta) · filter pills · the boxed search field · the Active/Past
toggle buttons.

---

## Surface C — client Case File (`BSProClientFullProfilePage`)

Both roles, one component (as today). **Heat = the client's tier** (global
table above). The engine opens the page; the data stands behind it.

### Header

- Mast row + `← BACK`; eyebrow `CASE FILE · {PHASE} · WK X OF Y` (trainer) /
  `CASE FILE · {PHASE} · {KCAL} KCAL` (nutri) — phase from the live
  `ShapeProgramApi` store; the week/kcal figure only when a real program
  detail carries it (demo keeps demo). Status as mono text + heat tick
  (`● ON TRACK`), replacing the status pill.
- Serif name (last word heat period) · 56px facet avatar (tier ring, always) ·
  mono id line `CLIENT SINCE {mo} · {n}-DAY STREAK`.
- **Action line** — `MESSAGE · ADJUST · SCHEDULE · ✦ DRAFT` as one typographic
  mono row, heat underlines, four ≥44px cells (kills the 4 pills). Same
  wiring: `shape:proMessageClient` · `BSProAdjustProgram` ·
  `BSProScheduleSession` · `BSProCheckinDraft`.
- **Tabs** — `PROFILE / MANAGE` typographic index, drawn heat underline
  (kills the pill tabs).

### PROFILE tab (rail-threaded stations)

1. **YOUR MOVE · FROM THE ENGINE** — serif verdict (1–2 sentences, heat
   period) + **ONE underlined action** + **THE EVIDENCE**: ≤3 dot-leader
   lines (only the numbers behind the call) closing with
   `EVERYTHING ELSE ····· HOLDING ✓` when true. Engine source: the page's
   existing directive-lead computation (dashSignals coach records — already
   on the page), now given the lead position + an action map: nutrition-slip
   → MESSAGE (opens the 1:1; ✦ DRAFT prefills) · missed-sessions → SCHEDULE ·
   program-stall → ADJUST · check-in-due → ✦ DRAFT CHECK-IN. **All-clear
   state:** `"Everything holding — next check-in {weekday} ✓."` + ✦ DRAFT as
   the light action.
2. **The flagged dimension's station floats to slot #2** (engine-ordered) —
   e.g. the WEEKEND station when the weekend split fired (semantic rust
   spine, the split figures, the one concrete move — `ProWeekendPlate` data
   verbatim, zero-box).
3. **Standing stations** (each = one register row + one visual, all data
   sources verbatim):
   - `ATTENDANCE · THIS BLOCK` (trainer) / `ADHERENCE · THIS WEEK` (nutri) —
     register pair (`{pct}%` count-up + `{done}/{planned}`) + horizontal
     `BSSdBars still` week bars (kills the 64px bordered card).
   - `KEY LIFTS` (trainer; dot-leaders `move ····· best ▲Δ` + `HISTORY →`) /
     `MACROS VS TARGET` (nutri; ledger rows with heat fills).
   - `BODY` — registers (`{now} LB` · `{Δ} this block`) + the self-drawing
     line-only weight trace + `LOG →`.
   - `CHECK-IN · WK OF {date}` — six mini registers (3-col grid) + the
     client's wins/struggles as a serif pull-quote ("her words") + the
     asked-you line when present.
   - `SLEEP · RECOVERY` — readiness + 7-day registers; redactions for
     unsynced fields.
   - `ACTIVITY` — recent sessions/logs as dot-leader rows.
   - `COACH NOTE · ONLY YOU SEE THIS` — quiet spined block (ink spine).
4. Every absent source → a one-line redaction; no empty charts, no demo leak
   into signed-in views (current gates carry).

### MANAGE tab

Phase → typographic index (live `ShapeProgramApi.set`) · **ASSIGN** →
amber-spined notice row → `BSProAssignPage` · shared goals → dot-leaders +
tier-bar (private → redaction) · **ACCOUNTABILITY** → penalty rows (semantic
rust `−{n}`) + `WAIVE` underline action (existing RPC) · **CARE TEAM** →
press-credit rows (counterpart's ROLE-color spine + name + `CO-MANAGING` +
`MESSAGE` action — the Wire-Dispatch co-sign grammar; existing
`shape:proMessageCoach` wiring) · notes editor stays a quiet form (two-tier
rule).

**Kills (Case File):** the 4 action pills + `✦ DRAFT` full-width pill · pill
tabs · phase chips · the big bordered metric card + `StatCard` boxes ·
`BSProStatusPill` usage here · the boxed note · the old `Section` rules
(→ station heads).

---

## New pure module — `mobile-app/src/services/proLedger.mjs` (+ tests)

Pure, tz-free, unit-tested (house pattern: `homeSlate.mjs`, `sessionLedger.mjs`).
**This contract is canonical** — the implementation plan's tests pin these
exact shapes (post-review unification; earlier drafts drifted):

- `bsProAttentionBudget(triage, bookings, max = 3)` →
  `{ lead, leadAnchor, inline[], wires[], demoted[] }` — implements the
  anchor + budget rules; the lead (rank #1) is never re-listed; anchoring is
  clientId-first, else EXACT lowercase name equality (never substring);
  `inline` rows carry `bookingIdx`.
- `bsProDayShape(bookings, now?)` → `{ sessions, gaps[], openHours|null,
  nowSlot, countdown }` — gap (≥90 min) + open-hour (≥60 min, whole hours,
  null under 2 bookings) computation, NOW placement, `{X}H {Y}M UNTIL {NAME}`
  / `{M}M UNTIL {NAME}` / `DAY CLEAR` labels.
- `bsProLeadVerdict({ signedIn, sessions, firstLabel, top })` → the verdict
  string (templates above); returns `null` signed-out (demo narratives are
  authored at the call site).
- `bsProMin` / `bsProHourLabel` / `bsProGapLabel` /
  `bsProDurationFromSub(sub)` — time parsing + ledger labels; durations are
  parsed from the booking `sub` strings (`'· 60m'`) because no `durationMin`
  field exists upstream on demo or calendar rows.

Tests: budget caps + no-double-listing, demotion beyond max, gap/open-hour
edges (0/1 bookings, back-to-back, overnight guard), countdown labels,
all-clear verdicts.

---

## Out of scope

The coach **Signal public profile** (sigil design is owner-shelved — untouched)
· the Plans/Chat/Me tabs + all action pages' internals (Adjust / Schedule /
Assign / Draft / live-watch are reached unchanged) · the roster CONSOLE and
ANALYSIS legacy components · website coach dashboards · any migration or API
change (this wave is presentation + one pure module; every RPC/route call
carries verbatim).

## Verification & gates

Per commit: JSX parse-check · PowerShell mobile build exit 0 · full `npm test`
(382 + the new proLedger vectors) · LF normalize. PR: CI green (Web · Mobile ·
gitleaks) + CodeRabbit findings addressed (standard wait — no skip agreed for
this wave). **On-device pass (owner, recommended):** Black/Sage/Cream papers —
rust + gold rails and the gold light-paper variant `#a07a2e`; the NOW/live
loop rule; inline-wire density on a busy demo day; 320px rail + roster
density; Case File tier heat across sage/gold/teal/violet/rose-tier clients
(and the role-heat fallback on a demo row); reduced-motion renders every
surface finished.
