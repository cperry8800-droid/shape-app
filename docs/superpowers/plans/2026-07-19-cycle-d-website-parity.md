# The Cycle — PR D: Website Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web parity for The Cycle: the member's cycle calendar + THE CYCLE card on the dashboard Progress page, and the coach's CYCLE station on `coachClientDetail.jsx` — all off the SAME canonical `cyclePhase.mjs` and PR C's `cycle` leg.

**Architecture:** A module loader assigns `window.ShapeCycleLib` (`bsDeriveCycle`/`bsCycleRead`) on the pages that need it; the member surfaces read/write `cycle_events` + the RPCs via `window.shapeDb.client` (owner RLS; the same GUC-gated RPCs — direct settings writes would raise, correctly); the coach station reads `data.cycle` from shared-overview (PR C).

**Spec:** `docs/superpowers/specs/2026-07-19-cycle-awareness-design.md` (Website parity section). **Ordering:** after PR C.

## Global Constraints

- Doctrine travels: verbatim disclaimer on the web opt-in too (the same string, rendered from one constant in the file); discretion (cycle language on cycle surfaces only); absence-not-padlock on the coach page; no points; honest degrade everywhere (signed-out/pre-migration → the surfaces simply don't render).
- newdesign fixed-dark literals + the dashboard's card grammar (`Card`, `CKSecHead`, Fraunces/JetBrains) — NOT mobile `t.*`.
- `?v=` bumps on every touched babel file's referencing pages; CRLF check before HTML edits (`git ls-files --eol`).
- Verify per task: babel parse · LF/CRLF audit · headless render proof.

---

### Task 1: Loaders

**Files:**
- Modify: `public/newdesign/ClientApp.html` + `ClientProgress.html` (member surfaces) and `TrainerClient.html` + `NutritionistClient.html` (coach station): add

```html
<script type="module">import * as CY from "/newdesign/cyclePhase.mjs?v=20260719"; window.ShapeCycleLib = CY;</script>
```

after each page's existing module/supabase tags (the client pages already load supabase; the coach pages gained it in the live-web PR — verify with `grep -n supabase <page>` and insert the vendor + `/supabase.js` pair if absent, byte-copying the SRI tag from `ClientApp.html:34`).

- [ ] **Step 1: Insert + verify + commit.**

---

### Task 2: Member — THE CYCLE card + calendar on the Progress dashboard

**Files:**
- Modify: `public/newdesign/dashProgress.jsx` (the Progress page module — grep `THE CROSSOVER` for the conditional-widget precedent from #1698) + `?v=` bump on its referencing pages (grep `dashProgress.jsx?v=`).

**Interfaces:**
- Consumes: `window.shapeDb.client` (`from('cycle_events')` owner reads/writes under RLS; `rpc('cycle_set_settings', …)` / `rpc('cycle_opt_out')` for flips) + `window.ShapeCycleLib.bsDeriveCycle`.

- [ ] **Step 1: The card** — `DprCycleCard`, the CROSSOVER widget's conditional pattern: fetch own `cycle_settings` (`from('user_goals').select('data').eq('kind','cycle_settings')` — own-row RLS) + own `cycle_events`; renders ONLY when `optIn`. Phase + day headline, confidence/L register, predicted-window line — same strings as mobile's card, English-only here (the website is not localized — parity of content, not catalogs).
- [ ] **Step 2: The calendar** — expanding from the card (an "Open calendar" toggle swaps the card body for a month grid — the web Progress page has room; no separate route): month nav, logged discs, dotted predicted window, phase-band underlay + legend, click-to-log/unlog via `from('cycle_events').upsert/delete` with the same optimistic + `future_event_date` rollback handling (the trigger raises → surface "Can't log a future date."). Un-log confirms via `window.ShapeConfirm.open` (the house confirm primitive).
- [ ] **Step 3: Opt-in/opt-out on web** — a small settings row on the card's empty state: the verbatim disclaimer + "Start tracking" → `rpc('cycle_set_settings', { p_opt_in: true, p_share: false, p_consent_kind: 'cycle_tracking', p_granted: true, p_consent_text: <the disclaimer constant> })`; share toggle + "Stop & delete" (→ `rpc('cycle_opt_out')`, confirm-gated) mirror mobile. RPC absent (pre-migration) → the row says setup isn't available yet.
- [ ] **Step 4: Verify + commit** — babel parse · `?v=` sweep · headless render (signed-out → nothing; the widget's conditional render proven).

---

### Task 3: Coach — CYCLE station on `coachClientDetail.jsx`

**Files:**
- Modify: `public/newdesign/coachClientDetail.jsx` + `?v=` bump on TrainerClient/NutritionistClient.

**Interfaces:**
- Consumes: `data.cycle` (PR C's leg — `null | {share:false} | {share:true, starts}`) + `window.ShapeCycleLib.bsDeriveCycle`.

- [ ] **Step 1:** a `CKCycleStation({ cycle, accent })` rendered between the SLEEP card and HEALTH PROFILE (match the page's Card grammar): ONLY when `cycle && cycle.share === true` — `null`/`share:false`/absent leg are IDENTICAL non-renders (absence, no padlock). Body: phase + day (via `bsDeriveCycle(cycle.starts, new Date())`), next-period window line, a month tick-strip of logged days, and the luteal deload line ("Week of the {date} is a natural deload window.") — the same content as mobile's station, `CKSecHead` label `CYCLE · SHARED BY THE MEMBER`.
- [ ] **Step 2: Verify + commit** — babel parse · headless: with a stubbed `data.cycle` share:true the station renders; share:false → absent from the DOM.

---

### Task 4: Gates + PR

- [ ] Babel parses · LF/CRLF audit · `?v=` bumps verified · headless proofs (member card conditional · calendar log/unlog round-trip on a test account · coach station absence semantics).
- [ ] PR: `cycle D: website parity — member calendar + card, coach CYCLE station (spec 2026-07-19)`; body: "same canonical engine, no twin; web is content-parity (English)". CI + CodeRabbit; squash-merge; re-sync. **This closes the Cycle wave's build plan** — remaining opens are OWNER items (migration already run at PR A/B; on-device passes; the standing human translation review with the disclaimer PRIORITY flag).

---

## Self-review notes

- **Spec coverage:** member web calendar + card (T2) · coach web station via shared-overview (T3) · canonical-module consumption (T1) · doctrine carried (disclaimer constant, absence semantics, confirm-gated deletes).
- **Type consistency:** `window.ShapeCycleLib` is the one web namespace (distinct from mobile's `window.ShapeCycle` data layer — different objects, deliberately different names); `data.cycle`'s three shapes handled exhaustively in T3.
- **Scope cut:** web share-toggle lives on the member card's settings row (no separate settings page on web — the dashboard has no Settings→Cycle equivalent); flagged in the PR body.
