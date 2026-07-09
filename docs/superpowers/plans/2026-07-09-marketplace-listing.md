# The Listing wave — implementation plan

> **For agentic workers:** executed inline task-by-task (superpowers:executing-plans),
> per-task gates: JSX parse · `VITE_BASE=/m/` build · `npm test` · LF · commit.
> Spec: `docs/superpowers/specs/2026-07-09-marketplace-listing-design.md` (merged #1632).
> Owner gave the build go 2026-07-09 ("after that good to go").

**Goal:** the Marketplace tap opens The Listing (rebuilt `BSCoachDetailPublic`);
full scheduling calendar; buyable single workouts; coach-authored monthly offer;
Habits page → Open Ledger. Signal profile byte-identical.

**Global constraints:** teal = the one commerce action; role heat (rust `#c0533b` /
gold `#a07a2e`) line-only; tier NAMED, never a pill; honest data (no fabricated
match %, ratings, or dates); every commerce handler verbatim (spec §7); quiet-form
two-tier rule for the review composer + add sheets.

## PR B — The Listing (`mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx`)

- [ ] **Task 1 — head.** Replace the gradient hero (~1353–1398): `← The Classifieds`
  back · `LISTING Nº {no} · ROLE (· ✓ VETTED when coach.verified)` eyebrow · duotone
  portrait block (photo + role wash + grain + 3px role spine; no photo → serif
  initials on role-alpha wash) · serif split name + role period · mono meta
  (credential · loc · TIER in tier color) · bare 4-up register SCORE/SESSIONS/YEARS/
  RATING (live avg wins) · ink→role ledger · tagline quote · clipped teal
  `BOOK THE INTRO · $0` + underline `✉ MESSAGE`. Thread `no` (1-based list index)
  from `MktRow`/`MktCoachCard`/cotw callers via a new optional prop. `{match}%` dies.
- [ ] **Task 2 — stations.** Kill the 4 pill tabs; one scroll: THE APPROACH
  (philosophy serif · specialties mono run-in · credentials ledger rows) · SAMPLE
  (dot-leader `A · move ···· scheme`) · FROM THEIR CLIENTS (press-clipping reviews,
  quiet composer kept, seeded `10.0/10` dies — unrated quotes) · GOOD QUESTIONS ·
  `THE FULL PROFILE →` leader (opens `window.BSPublicProfile` with the person payload
  moved from the marketplace routing branch) · bottom clipped CTA.
- [ ] **Task 3 — rate card.** Coupon (Subscription package; scissor-dashed standing
  offer; Subscribe → existing checkout) **with the at-capacity port** (mirror the
  Signal gate: `at_capacity`/`capacity_resume_at` + `ShapeWaitlist` join/withdraw/
  invited states) · packages → dot-leader Book/Buy rows · PROGRAMS station
  (salePlans, squared media thumbs) · **SINGLE WORKOUTS** station (workout-category
  salePlans, `Buy · yours to keep →`) · demo packages gain 3–4 priced single
  workouts (in `buildPublicProfile`'s demo package builder).
- [ ] **Task 4 — routing.** Marketplace `open` branch (~1545–1565): route to
  `BSCoachDetailPublic` always; delete the Living-preference block (the payload
  moves into the Listing's full-profile handler). Availability grid stays on the
  demo generator this PR (real slots land in PR C) but the hardcoded `month: 'May'`
  dies now — slots carry computed real dates.
- [ ] **Task 5 — PR B gate** (CI + CodeRabbit findings → merge → resync).

## PR C — the calendar + the coach-authored offer

- [ ] **Task 6 — data.** `window.ShapeCoachAvailability.get(role, id)` in
  `shapeBackend.js` → `GET /api/availability?role&id` (60s cache); pure projection
  helper (weekly slots − booked → dated open slots, 6 weeks) + unit test; OPEN THIS
  WEEK station consumes it on live rows (demo rows keep the labeled preview week).
- [ ] **Task 7 — `BSCoachAvailabilityCalendar`.** Full-screen month grid (square
  cells, open-count tick, ‹ › month nav, past/full quiet) → day slot rows →
  existing `selectSlot` confirm. `SEE THE FULL CALENDAR →` leader wires it.
- [ ] **Task 8 — the offer.** Migration `2026-07-09-provider-monthly-offer.sql`
  (idempotent `add column if not exists monthly_offer jsonb` ×2, owner runs);
  coach editor block (blurb + ≤8 inclusion rows, quiet form) on the coach listing
  settings; the coupon's `WHAT'S INCLUDED →` sheet (coach doc, honest generic
  fallback).
- [ ] **Task 9 — PR C gate.**

## PR D — the Habits page (`iosAppBroadsheetHabits.jsx`, spec §9)

- [ ] **Task 10 — serialize `BSHabitsPage`.** Back pill → text-action; EARNED TODAY
  plate + % ring + split bars → serif verdict + bare register + ledger rule +
  `THE SHAPE SCORE →` dot-leader; THE GRID plate → unboxed station (cells keep the
  fill grammar); habit cards → tick-divider rows (24px squared checkbox, mono meta,
  quiet bell/×, ≥44px); `＋ ADD` → underline text-action; add sheet untouched.
- [ ] **Task 11 — PR D gate.**

## Wrap

- [ ] **Task 12 — docs.** WORKLOG dated entry + Latest pointer; War Room items
  (wave done · on-device pass pending · migration owner-run pending · website
  marketplace parity follow-up); memory wave file + MEMORY.md; merge on green.

## PR E — website coach-page parity (owner addition 2026-07-09)

- [ ] **Task 13 — website port.** The website coach living profile
  (`livingShared.jsx` `LvServices` rate card + `livingDesktop.jsx`) gains the wave's
  commerce pieces: the standing-offer **coupon** as the rate card's lead offer, a
  **single workouts/meals** shelf from the same `coach_plans` buckets, and the
  coach-authored **`monthly_offer`** what's-included (same column PR C adds — the
  provider rows are already public-read on the website). Honesty riders where they
  apply. `?v=` bumps on all consumer pages. Design language: the site's existing
  #1537 ledger grammar (dStation/DLeader) — content parity, not a redesign.
