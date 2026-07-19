# The Cycle — PR B: Member Mobile Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The member's Cycle: Settings opt-in/share/opt-out, the cycle calendar page, the Today chip, THE CYCLE card on the Progress hub, and the neutral Home lever — all consuming PR A's `ShapeCycle` + `cyclePhase.mjs`. i18n ×13 (`cycle` namespace).

**Architecture:** One new full page (`BSCycleCalendarPage`, the #1712 unboxed month grammar), one Progress card (`BSCycleCard`, `BSCrossoverCard`'s sibling at `iosAppBroadsheetClient.jsx:25092`), one Settings section, one Today-page chip, one Home-directive lever. Everything renders ONLY when opted in; every write goes through `ShapeCycle` (RPC-gated).

**Tech Stack:** React (client broadsheet), `window.ShapeCycle`, `bsDeriveCycle`/`bsCycleRead`, i18n ×13.

**Spec:** `docs/superpowers/specs/2026-07-19-cycle-awareness-design.md` — the **Doctrine section governs every string in this PR**; the disclaimer is verbatim and legally material. **Ordering:** after PR A merges.

## Global Constraints

- **Discretion (doctrine):** plain cycle language ONLY on cycle surfaces (the calendar page, the Progress card, Settings → Cycle). The Home lever speaks neutrally — "Recovery emphasis today" — never naming the cycle. The Today chip is quiet and only inside the expected window.
- **Never-shaming; no points; the engine never modifies a plan.** Opt-out honesty: pre-migration `setSettings` returns `{ok:false, reason:'unavailable'}` → the UI says "Cycle setup isn't available yet" — never a silent success.
- i18n: NEW `cycle` namespace — register in **BOTH** `mobile-app/src/i18n/index.js:12` (the `NS` array) AND the NS list in `tests/i18n-catalog-complete.test.mjs`, or it ships ungated. Literal keys only (no concatenation — #1759). All 13 locales; the disclaimer key flagged PRIORITY for the standing human review. tr-shadow grep BOTH forms after wiring.
- Theme tokens; `bsAskConfirm` for destructive actions (un-log, opt-out); 44px targets; reduced-motion honored.
- Verify per task: JSX parse · `npm test` (catalog parity will FAIL until all 13 catalogs land — that failing gate is the proof it works) · PowerShell `/m/` build · LF · tr-shadow both greps.

---

### Task 1: Settings → Cycle (opt-in · share · open calendar · opt-out)

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — `BSSettings` (grep `Accessibility` / `Shape Radio` section heads to find the hub list; insert the Cycle section between Preferences and Nutrition).
- Create: `mobile-app/src/i18n/locales/en/cycle.json` (this task seeds `en`; Task 5 fills ×12).

**Interfaces:**
- Consumes: `ShapeCycle.settings/setSettings/optOut` (PR A's exact signatures).
- Produces: `cycleSettings` state other tasks read via a small shared hook `useBSCycleSettings()` (module scope, caches on `window.ShapeCycleState` with a `shape:cycleSettings` change event — the `useBSMembership` pattern), and the `openCyclePage` route state on `BSClientAppInner` (`shape:openCycle` event → early-return overlay, the calendar/search takeover pattern).

- [ ] **Step 1: The section** — rows: **Cycle tracking** (toggle; OFF→ON opens the opt-in sheet below; ON→OFF routes to the opt-out confirm) · **Share with your coach** (toggle, disabled until opted in; flips via `setSettings` with `consentKind:'cycle_share'` + the share consent text) · **Open cycle calendar →** (fires `shape:openCycle`) · **Stop tracking & delete** (rust text-action → `bsAskConfirm` with explicit copy → `ShapeCycle.optOut()`).
- [ ] **Step 2: The opt-in sheet** — full-page panel (the `BSOverallEditSheet` grammar): serif "The *Cycle.*" head, the doctrine paragraph, and the **verbatim disclaimer** (`tr('cycle:disclaimer', { defaultValue: 'The Cycle is for training and recovery context only. It is not medical advice, not a diagnostic tool, and must never be used for contraception or fertility planning. Predictions are estimates from the dates you log.' })`) above an **"I understand — start tracking"** CTA → `setSettings({ optIn:true, share:false, consentKind:'cycle_tracking', granted:true, consentText:<the rendered disclaimer string> })`. The consentText sent is the EXACT string rendered (read it from the same `tr` call — the receipt records what she saw, in her language).
- [ ] **Step 3: Honest failure states** — `{ok:false, reason:'unavailable'}` → an inline notice, toggle stays off. Verify + commit.

---

### Task 2: The cycle calendar page

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — new `BSCycleCalendarPage` + the `shape:openCycle` overlay wiring in `BSClientAppInner`.

**Interfaces:**
- Consumes: `ShapeCycle.list/log/unlog`, `bsDeriveCycle` (import via the services shim), `useBSCycleSettings`.
- Produces: the page PR D mirrors on the website.

- [ ] **Step 1: The grammar** — the #1712 unboxed month view (read `BSCalendarMonth` in `iosAppBroadsheetCalendar.jsx` for the hairline-week-row + bare-numeral recipe — BORROW the grammar, don't import the component): `BSPage` + `BSDetailHeader` ("The *Cycle.*"), month nav (`‹ JUL ›`), hairline week rows, day cells ≥44px with:
  - logged period day → filled accent disc (accent = the page's one color: `t.isLight ? '#0a8f87' : '#34d6c5'` teal? NO — cycle surfaces use a quiet rose `#c4667a`-family accent? **Decision: use the member's tier color, line-only, per the app's heat convention — the spec names no cycle color and inventing a pink genders the surface; tier heat is the house rule.** Use `bsMyTierColor()`.)
  - predicted window (`predictedStart.from…to`) → dotted-outline discs;
  - phase bands → quiet underlay tints (8–10% alpha of the heat) with a mono legend row under the grid (M · F · O · Lu, only the non-null windows).
- [ ] **Step 2: Logging** — tap an unlogged day → `ShapeCycle.log(date)` (optimistic disc + rollback on `{ok:false}`; `reason:'future'` → toast `tr('cycle:noFuture', { defaultValue: "Can't log a future date." })`); tap a logged day → `bsAskConfirm` → `unlog`. Refetch + re-derive after each write.
- [ ] **Step 3: The register** — above the grid: phase + day headline (serif, e.g. "Follicular · day 9"), confidence + L line (`MEDIUM CONFIDENCE · YOUR CYCLE ~29 DAYS · 6 LOGGED`), the predicted-window line, and for `paused` the FIXED doctrine copy (`tr('cycle:paused', { defaultValue: 'Cycle running long — predictions paused.' })`); for `late`: `tr('cycle:late', { defaultValue: 'Cycle day {d} — a new cycle starts when you log it.' })`. Setup state (no starts): "Log your last period's first day to begin."
- [ ] **Step 4: Verify + commit** — JSX parse · `/m/` build.

---

### Task 3: Today chip + THE CYCLE Progress card

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — the Today check-in page/card region (grep `BSTodayCard`) + the Progress hub Overall tab (`BSCrossoverCard` mount at ~25092).

**Interfaces:**
- Consumes: `useBSCycleSettings` + a shared `useBSCycleDerived()` hook (fetch `list()` once, derive, cache with the same event refresh).

- [ ] **Step 1: Today chip** — on the Today page (NOT the Home slate — doctrine), when opted-in AND **`derived.predictedStart` is non-null** (the engine returns null for no-starts and paused — the window arithmetic below must never run on it) AND today ∈ `[predictedStart.from − 2d, predictedStart.to + 7d]` and today isn't already logged: one quiet mono line `tr('cycle:todayChip', { defaultValue: 'Period started? Log it →' })` → fires `shape:openCycle`.
- [ ] **Step 2: THE CYCLE card** — sibling directly after `<BSCrossoverCard …/>` (~25092), `BSCycleCard`: renders ONLY when opted in. Station grammar (`BSOLHead`-style eyebrow + tick in tier heat): phase + day headline · confidence/L register line · predicted-window line · and, when `bsCycleRead` fires over the member's cached series (assemble `days` from the SAME sources `BSCrossoverCard` uses — read its assembly at ~24931+ and reuse the cached progress series + check-in data, labeling each day's phase via `bsDeriveCycle` windows over the logged starts), the read's `copy` line with an honest register (`{n} CYCLES OF DATA`). Below floors → the card renders the headline WITHOUT a read (never a fabricated insight). Tap → `shape:openCycle`.
- [ ] **Step 3: Verify + commit.**

---

### Task 4: Home lever (neutral)

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — the home "Today · your move" directive derivation (grep `todayDirective` / `BS_LEVER_HEADS`).

- [ ] **Step 1:** when opted-in AND phase ∈ {menstrual, luteal-with-a-fired-recovery-read}: the directive MAY lead with `tr('home:lever.recovery', { defaultValue: 'Recovery emphasis today' })` + a neutral sub ("Lighter load reads well today — detail on your cycle page."), priority BELOW check-in/streak levers (read the existing priority order and slot it last). **The word "cycle" never appears on Home** — the sub says "your cycle page" as navigation only? NO — even that names it. Sub copy: "Detail in Progress." **Use: 'Lighter load reads well today.' + tap → Progress hub.** Never on the slate, never a plan modification.
- [ ] **Step 2: Verify + commit.**

---

### Task 5: i18n ×13 + gates + PR

- [ ] **Catalog** — `en/cycle.json` complete (~30 keys: disclaimer · paused · late · phases ×4 · confidence ×3 · chip · card labels · settings rows · opt-in sheet · opt-out confirm · noFuture · setup/empty states). Register the namespace in BOTH places (Global Constraints). Translate ×12 via direct per-locale subagents (the #1746 lesson: direct from the main loop, never nested) with the house per-locale rules (tr placeholders never suffixed · ha explicit one-plurals no leftover English · ru/uk one/few/many/other · pcm real Naija · brand nouns literal). **The disclaimer key is flagged PRIORITY for human review in the PR body.**
- [ ] **Gates:** catalog parity 3/3 · tr-shadow BOTH greps · JSX parse · `npm test` · PowerShell `/m/` build · LF.
- [ ] Dev-server proof: opt-in flow end-to-end (sheet → toggle on) · log/unlog on the calendar · predicted window renders · Today chip inside the window only · THE CYCLE card renders opted-in only · Home lever neutral wording · opt-out wipes and the surfaces vanish.
- [ ] PR: `cycle B: member surfaces — settings + calendar + Today chip + Progress card + neutral lever (spec 2026-07-19)`; note the discretion sweep ("nothing cycle-named outside cycle surfaces" — grep the diff for the word Cycle/period outside the new page/card/settings). CI + CodeRabbit; squash-merge; re-sync. War Room: register the OWNER on-device items (log/un-log · share toggle round-trip in PR C · opt-out wipe · discretion check).

---

## Self-review notes

- **Spec coverage:** all 5 member surfaces + i18n + doctrine copy; the coach side and website are C/D by design.
- **Decisions made here (flag in PR body):** cycle-surface heat = member tier color (no invented pink — house heat rule); the Home lever's sub-copy avoids even naming the cycle page; lever priority slots LAST.
- **Type consistency:** `useBSCycleSettings`/`useBSCycleDerived` named once, consumed in T1–T4; every ShapeCycle call matches PR A's signatures.
