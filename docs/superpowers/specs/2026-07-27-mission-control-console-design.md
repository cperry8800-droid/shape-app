# Mission Control (`/console`) — the N.O.R.A. ops board (design)

**Date:** 2026-07-27
**Status:** Approved (owner: "build mission control now around the new NORA look")
**Scope:** A new admin-only page, `/console`, that answers three questions the
moment it opens: **what's left before launch · what's in flight · is anything
broken.** Piece 0 + Piece 3 of the unified-dashboard decomposition; the
business and member-activity panels ship as labeled dormant slots and get wired
at launch (pre-launch, their numbers would be zeros).

## 1. Decisions locked (brainstorm 2026-07-27)

- **Readiness-led.** The lead is the open-item countdown, not a stat wall.
  Owner's top-line picks: what's-left + in-flight + broken. Delta/changelog
  view explicitly not picked.
- **Approach B ("Mission Control").** A NEW page reading the existing War Room
  snapshot + one new flight route. `/warroom` stays untouched as the deep
  archive; the console is the glass on top. Zero computation is duplicated —
  the two surfaces cannot drift because one feeds the other.
- **The N.O.R.A. look.** The owner renamed their Obsidian ops dashboard to
  N.O.R.A. (Shape's own concierge persona) and directed Mission Control to be
  built "around the new NORA look": near-navy `#0a0a1a` ground, panel
  `#0d1117`, cyan `#00d4ff` glow accents, glowing letter-spaced masthead,
  left-bar section labels, status pills. Precedent for a self-contained palette
  on an admin surface: `WarRoomClient`'s own `C` object. This page is
  deliberately NOT on the member theme tokens — it is ops chrome, like
  `/warroom`.

## 2. The screen (top to bottom)

1. **Masthead** — `● SYSTEM ONLINE` · glowing `N.O.R.A.` wordmark ·
   `SHAPE MISSION CONTROL — Network Operations & Readiness Assistant` ·
   date + live clock.
2. **Alarm strip** — one green `ALL SYSTEMS NOMINAL` line when nothing is
   wrong. Red rows only for: CI red on main · a service down/degraded/missing
   · a REQUIRED config group not ready. Each segment claims only what is
   actually known (no CI claim while the flight feed is absent).
3. **THE COUNTDOWN** (the lead) — every open checklist item as a scannable
   row: a WHO chip (**YOU** cyan · **EXT** orange · **ENG** purple), a
   one-line summary, the section tag. Filter chips ALL/YOU/EXT/ENG with live
   counts; a row expands in place to the full item text VERBATIM (the
   200–800-word records stay intact — the console only makes them scannable).
   Hero: the open count + the readiness bar (`done/total · %`).
4. **IN FLIGHT** — open PRs with the three merge gates (CI on head ·
   CodeRabbit verdict · Codex presence) as chips; state tag per PR:
   `AWAITING YOUR WORD` (all gates genuinely green) · `BLOCKED` ·
   `IN REVIEW` · `DRAFT`. Honest empty state.
5. **Dormant slots** — `BUSINESS` and `MEMBER ACTIVITY`, dashed frames,
   "wired at launch."
6. Footer — refresh stamp + a link to `/warroom` (the deep archive).

## 3. Data

- **`/api/warroom` snapshot** (existing, unchanged): services, config,
  checklist (513 items), readiness. Server-rendered on first paint (same as
  WarRoom), re-polled every 60s client-side.
- **`src/lib/console-triage.mjs`** (new, pure, tested — the `funnel.mjs` +
  `.d.ts` pattern): classifies each OPEN checklist item —
  `who: 'you' | 'ext' | 'eng'` from the item's own words (EXT = named
  outsiders: Apple/APNs/iOS build, Garmin, Spotify quota, Stripe Connect,
  radio.co, counsel/attorney, photography, translation review; YOU = status
  `manual`, or `pending` items naming an OWNER act/on-device pass; ENG = the
  rest of `pending`) — plus `short`: a deterministic first-clause summary
  (cut at the first ` — ` / `. ` / ` · ` past 24 chars, else word-boundary
  truncate ≤160 + ellipsis). Misclassification is the feature's main risk, so
  the classifier is the tested surface.
- **`/api/console/flight`** (new, admin-gated like `/api/warroom`): GitHub
  REST — open PRs (cap 6), per PR the check-runs on the head SHA (the three
  required checks by name, falling back to all runs), CodeRabbit verdict from
  the reviews API (`approved`/`changes`/`commented`/`none`), Codex presence
  from reviews + issue comments. Plus CI state of `main` for the alarm strip.
  60s in-process cache. **Token:** `GITHUB_TOKEN` env (optional
  `GITHUB_REPO`, default `cperry8800-droid/shape-app`). No token → honest
  `{ok:false, reason:'no_token'}` and the panel explains exactly what to set —
  the FDC_API_KEY pattern: works without config, lights up with it.

## 4. Honesty rules (house doctrine, binding)

- A gate with no record renders `—`, never ✓ and never ✗ — absence of a
  review comment is not proof either way (clean-review-leaves-no-record).
- GitHub unreachable → "flight data unavailable" + retry; never stale-as-fresh
  (the cache is 60s and labeled by its refresh stamp).
- Loading = skeleton, never placeholder numbers. Unknown service state reads
  unknown, not green.
- `AWAITING YOUR WORD` requires ALL THREE gates green AND not draft.

## 5. Gating, registration, testing

- Page + route: `requireAdminUser()` → redirect `/login?next=/console` /
  403 (the exact `/warroom` pattern); `robots noindex`; `force-dynamic`.
- `/api/console/flight` registered in the War Room `RAW_ROUTES`.
- Tests: `tests/console-triage.test.mjs` (classification vectors incl. the
  EXT/YOU/ENG boundaries, truncation, counts). `tsc --noEmit` (3 pre-existing
  baseline errors — no new ones). CI is the build gate (local `next build` is
  known-broken by the stray parent lockfile).
- **No migration. No new env required** (`GITHUB_TOKEN` optional — OWNER item
  to light up In Flight).

## 6. Out of scope (registered, deliberate)

- Business + member-activity panels (dormant slots now; wire at launch).
- Approach C's live-ops extras (auto-deploy status, action deep-links beyond
  the PR URL) — phase 2 candidates.
- Editing/ticking items from the console (the War Room keeps its localStorage
  ticks; the console is read-glass in v1).
