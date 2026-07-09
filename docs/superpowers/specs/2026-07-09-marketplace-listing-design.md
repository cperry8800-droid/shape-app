# The Listing — the marketplace coach page (design spec)

**Date:** 2026-07-09 · **Owner-approved direction:** "do the listing" — the Listing look
(concept A of the 2026-07-09 round, artifact `afc4dd43`), with three owner additions:
a full scheduling calendar reachable from the visible slots, individually buyable
single workouts on the rate card, and a coach-authored "what's included" behind the
monthly offer.

## 0 · Decision record

- **The Marketplace tap opens THE LISTING, not the profile.** Today
  `BSMarketplaceScreen`'s `open` branch prefers the Signal living profile
  (`window.BSPublicProfile` with a commerce payload) and `BSCoachDetailPublic` is a
  never-shown fallback. That flips: the marketplace routes to the rebuilt
  `BSCoachDetailPublic` (= The Listing), which carries all the commerce wiring already.
- **The Signal coach profile is UNTOUCHED** (sigil, head, stations, follow graph — the
  owner's standing call). It stays reachable from the Listing via a
  **`THE FULL PROFILE →`** leader that opens `window.BSPublicProfile` with the same
  `person` payload the marketplace builds today (that construction moves out of the
  routing branch into the Listing's handler).
- Presentation + additive features; every commerce handler carries over verbatim (§7).
- Heat = **the coach's role** (trainer rust `#c0533b` / nutritionist gold `#a07a2e`),
  line-only, matching the Classifieds list it opens from. **Teal = the commerce
  action only.** Tier is NAMED in the meta line (tier-colored text, never a pill).

## 1 · The Listing head (kills the gradient hero)

Top to bottom, all at `t.padX`:

1. **Back** `← The Classifieds` (mono text-action, existing `onBack`).
2. **Eyebrow** `LISTING Nº {n} · {TRAINER|NUTRITIONIST}` in role heat — `{n}` = the
   coach's 1-based index in the current marketplace result list, passed as a new
   optional `no` prop from the rows/cards; omitted when absent (never fabricated).
   Append ` · ✓ VETTED` **only** when the provider row carries the real `verified`
   flag (signed-out demo cast keeps its curated tags).
3. **Duotone portrait** — full-width block (~180px): the coach photo
   (`coachPhoto(c)`/card `avatar`) under a role-tinted duotone wash + grain, 1px RULE
   frame, **3px role spine** (the Classifieds FEATURE grammar). **No photo → a
   typographic block** (large serif initials on a role-alpha wash) — never a stock
   stand-in face.
4. **Name** — serif split (`First` / italic `Last` + role-heat period), the current h1
   moved below the portrait.
5. **Meta line** — mono uppercase: `{credential} · {shortLoc} · {TIER} TIER` with the
   tier word in its tier color.
6. **Register** — bare 4-up (eyebrow-above-figure, tabular): `SCORE · SESSIONS ·
   YEARS · RATING` (rating = live-review average when present, else the directory
   rating). The `{match}% match` chip **dies** (fabricated precision); `clients` moves
   into the reviews station head.
7. **Ink→role ledger rule**, then the italic tagline pull-quote (kept).
8. **CTAs** — clipped solid-teal **`BOOK THE INTRO · $0`** (existing `openIntro`),
   then an underline text-action row: `✉ MESSAGE {first}` (existing `openMessage`).

**Kills:** the radius-20 gradient hero card, tier pill, stat pills row, the boxed
3-col stat strip, both pill CTA buttons, the 4 pill tabs (§2), `BSProfileCard` boxes,
the bottom `Start with {first} →` pill (replaced by a clipped-teal repeat of the
intro CTA).

## 2 · Structure — one continuous ledger (tabs die)

The 4 pill tabs (`profile/packages/sample/reviews`) collapse into a single scroll of
role-tick **stations** ordered for hiring:

1. `OPEN THIS WEEK` (§3) — slots + the full-calendar door.
2. `THE RATE CARD` (§4) — coupon · packages · programs · single workouts.
3. `THE APPROACH` — philosophy paragraph (bare serif), specialties as a mono
   uppercase run-in list (pills die), credentials as the ledger rows they already
   nearly are.
4. `SAMPLE {SESSION|PLAN}` — the block list re-set as dot-leader rows
   (`A · move ···· scheme`), preview tag → mono text.
5. `FROM THEIR CLIENTS · {avg}/10 · {clients} coached` — reviews as press clippings
   (3px role spine + italic quote + mono byline). The write-a-review form stays a
   **quiet form** (two-tier rule) with the existing 1–10 stars + in-flight lock.
6. `GOOD QUESTIONS` — FAQ as bare serif Q/A rows.
7. `THE FULL PROFILE →` — dot-leader leader opening the Signal living profile (§0).
8. Bottom clipped-teal `BOOK THE INTRO · $0`.

## 3 · Availability — real slots + the full calendar (owner addition 1)

- **The station** shows the next **3 genuinely open slots** as dot-leader rows
  (`WED · 7:00 PM ···· Hold it →`) wired to the existing `selectSlot` → action-panel
  confirm. Below them: **`SEE THE FULL CALENDAR →`** underline leader.
- **New full-screen `BSCoachAvailabilityCalendar`** (same early-return page pattern as
  other sub-views): month grid in the house square-cell grammar (from
  `BSCalendarMonth`), each day marked with its open-slot count (role-heat tick);
  month nav ‹ ›; tapping a day lists its open slots as dot-leader rows; tapping a
  slot runs the SAME booking confirm. Booked/full days render quiet; past days
  disabled.
- **Data — real:** `GET /api/availability?role={role}&id={provider_id}` already
  returns the coach's weekly `provider_availability` slots plus booked `sessions`;
  the calendar projects the weekly pattern over the next **6 weeks**, subtracts
  booked/held times, and renders REAL dates (the hardcoded `month: 'May'` in
  `openIntro`/`selectSlot` **dies** — slot payloads carry a computed ISO date).
  New `window.ShapeCoachAvailability.get(role, id)` helper (60s cache) in
  `shapeBackend.js`.
- **Demo coaches** (no `provider_id`) keep a generated preview week labeled
  `Preview · typical availability` — signed-out/browse only, never on a live row.

## 4 · The rate card (owner additions 2 + 3)

Order: the coupon → packages → programs → single workouts.

1. **The coupon** — the monthly subscription as the double-ruled, scissor-dashed
   standing-offer box (Kitchen-Card cousin): `Coached by {first}, monthly.` · a mono
   inclusions line · the price · clipped teal **`SUBSCRIBE →`** (existing
   subscription checkout).
   - **Tap the coupon (or its `WHAT'S INCLUDED →` underline) → the offer sheet**
     (quiet bottom sheet, portaled): the coach's OWN description of what monthly
     coaching includes (§5) — blurb paragraph + inclusion rows (dot-leader ticks) +
     price + Subscribe. When the coach hasn't written one, the sheet shows the
     package's generic perks labeled plainly (`Standard monthly coaching`) — never
     fabricated specifics.
   - **At capacity:** port the Signal storefront's gate verbatim —
     `at_capacity`/`capacity_resume_at` (mirrors `isEffectivelyAtCapacity`) flips the
     coupon CTA to the waiting-room states (`Join the waiting room` / position /
     invited-with-first-dibs) via the existing `window.ShapeWaitlist`.
2. **Packages** — remaining `p.packages` (single session, bundles) as dot-leader rows
   (`name ···· $price` + underline `Book →`/`Buy →` → existing `openCheckout`).
3. **Programs** — `salePlans` program/plan categories as dot-leader Buy rows
   (media thumbs kept, squared corners, `bs-hide-scroll` strip).
4. **`SINGLE WORKOUTS` station** — `salePlans` workout-category items listed
   individually (`name · meta ···· $price` + `Buy · yours to keep →`), so one-off
   sessions are first-class merchandise. Empty → the station hides. The demo
   profiles' package sets gain **3–4 priced single workouts** (e.g. `Upper pull ·
   single session file · $18`) so browse/preview demonstrates the shelf.

## 5 · Coach-authored monthly offer (owner addition: "coaches customize themselves")

- **MIGRATION `2026-07-09-provider-monthly-offer.sql`** (idempotent, owner runs):
  `alter table trainers add column if not exists monthly_offer jsonb;` + the same on
  `nutritionists`. Shape: `{ blurb: text, includes: text[] (≤8, each ≤80 chars),
  updatedAt }`. Both tables are already public-read for the marketplace, so the
  Listing reads it with zero new endpoints; writes go through the coach's existing
  provider-row update path (owner-scoped).
- **Coach editor** — a `Monthly coaching · what's included` block on the coach's
  existing Marketplace-listing/Rates screen (`BSProMe` path): blurb textarea +
  add/remove inclusion rows (quiet form). Sanitized lengths; plain text only.
- Client render: §4.1's offer sheet. Absent → honest generic fallback.

## 6 · Honesty fixes (riding along)

- `{match}% match` chip dies everywhere on the Listing.
- Seeded/demo reviews **stop rendering a fabricated `10.0/10`** — curated
  testimonials render as unrated quotes; only real submitted ratings show numbers.
- Hardcoded `May` slot dates die (§3); every slot carries a real computed date.
- `✓ VETTED` only from the real `verified` flag on live rows (§1.2).

## 7 · Behavior verbatim (the contract)

`openIntro` · `openMessage` · `openCheckout` (+ `planId` ride-along) ·
`confirmAction` (Stripe checkout via `ShapePayments.startCheckout`, booking via
`ShapeBookings.submitConsultationBooking`, `writeShapeCoachThread`) · `sendMessage` ·
the `bsRequireAccount` browse gate · `BSPublicActionPanel` (unchanged component) ·
sale-plans fetch (`ShapeCoachPlans.salePlans`) · live reviews GET/POST + in-flight
lock · `buildPublicProfile`. The Signal profile component: byte-identical.

## 9 · The Habits page — "The Habit Ledger" (owner addition, screenshot 2026-07-09)

`BSHabitsPage` (`iosAppBroadsheetHabits.jsx`) is still plate-era: the teal EARNED
TODAY `BSPlate` (big +pts, % ring, DO/DON'T split bars), THE GRID plate, rounded
tinted habit cards, a back pill, a pill `＋ ADD`. Serialize into the Open Ledger
grammar its siblings (Score "The Standing", Library "The Catalogue") already carry —
presentation-only, every handler verbatim (toggle → `/api/client/habits`, +pts flash,
reminders, demo gating, the add sheet):

- **Head:** back pill → the standard mono text-action; serif `Daily habits.` kept.
- **EARNED TODAY plate → verdict + register.** A serif verdict lead (`+3 banked
  today — 6 more on the table.`) over a bare register row: `TODAY +3/9 · TO DO 3/6 ·
  TO DON'T 0/3 · THIS WK +4` (eyebrow-above-figure, tabular) + the ink→teal ledger
  rule. The % ring and split mini-bars die (the register carries them); adherence
  stays as a register column; `Tap to see your Shape Score` → a dot-leader
  `THE SHAPE SCORE →` leader.
- **THE GRID plate → unboxed station.** `LAST 7 DAYS` station head; the 7-col matrix
  keeps its squared completion cells (solid teal done-today · teal-alpha past ·
  outline pending) on bare hairline row rules — the plate chrome, notch and bracket
  die.
- **Habit cards → tick-divider rows.** Squared 24px checkbox (teal when done) ·
  serif name · mono `DO · +3 PTS` / `✓ KEPT` meta · the bell + × as quiet text
  glyphs, ≥44px targets. Do = teal, Don't = rust — line-only (checkbox border /
  meta), always NAMED in the meta. Section heads: `TO DO · 1/2 DONE` + underline
  `＋ Add` text-action (the pill dies).
- The add bottom-sheet stays a **quiet form** (two-tier rule).

## 10 · Rollout

- **PR A (docs):** this spec.
- **PR B:** the Listing rebuild (§1, §2, §4.2-4.4, §6) + the marketplace routing flip
  + the `THE FULL PROFILE →` leader + demo single-workout content.
- **PR C:** the availability calendar (§3) + the coupon offer sheet + coach editor +
  migration (§4.1, §5).
- **PR D:** the Habits page serialization (§9).
- Each PR: JSX parse · `VITE_BASE=/m/` build · `npm test` · LF · CI + CodeRabbit
  gate. Owner verifies visually (no browser drives). Website marketplace parity is a
  tracked follow-up (mobile-first).
