# The Cycle — PR C: Coach Share Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A share-gated CYCLE station on the coach's mobile Case File, plus the `cycle` leg on `/api/clients/[id]/shared-overview` (which PR D's web page consumes). Absence, not a locked state: `share:false` → no station exists, ever.

**Architecture:** `get_client_cycle` (PR A, live) is the ONLY read path — coach link AND optIn AND share enforced in the definer. Mobile reads it via `ShapeCycle.forClient(userId)`; the web route adds one `Promise.all` leg. Phase derivation happens CLIENT-side via the same canonical `cyclePhase.mjs` (raw starts over the wire — SQL and JS can never drift).

**Spec:** `docs/superpowers/specs/2026-07-19-cycle-awareness-design.md` (Coach surface section). **Ordering:** after PR B merges (owner has run the migration by then — verify before starting; if not applied, everything degrades to absence, which is safe but unverifiable).

## Global Constraints

- **Absence, not a padlock (doctrine):** `null` (not my client) and `{share:false}` and pre-migration all render IDENTICALLY: no station, no placeholder, no lock glyph.
- **Phase + timing only** — no symptom inference, no check-in cross-reads on the coach side (`bsCycleRead` is the MEMBER'S own; the coach never gets it).
- Copy is professional + directive-useful; never-shaming; i18n in the `coach` namespace (registered — no NS edit).
- Verify per task: JSX parse · `tsc --noEmit` (route edit) · `npm test` · PowerShell `/m/` build · LF.

---

### Task 1: Mobile Case File — the CYCLE station

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx` — `BSProClientFullProfilePage` Profile tab, insert the station after SLEEP · RECOVERY (grep `case.adherenceWeek` for the region; the SLEEP station follows it).

**Interfaces:**
- Consumes: `window.ShapeCycle.forClient(userId)` (PR A) + `bsDeriveCycle` (import the services shim at the top of the pros module, beside its existing imports).

- [ ] **Step 1: Fetch** — in the page's per-client effect block (the care-team pattern: reset on client change + stale-response guard), `const r = await window.ShapeCycle.forClient(clientId)`; store `cycle` state ONLY when `r && r.share === true` (everything else → state stays null → no station). Demo roster rows (no real `clientId`) never fetch.
- [ ] **Step 2: The station** — rendered ONLY when `cycle` state exists; derive `const c = bsDeriveCycle(cycle.starts, new Date())`:

```jsx
{cycleShared && (() => {
  const c = bsDeriveCycle(cycleShared.starts, new Date());
  if (!c || c.phase === null) return null;
  const phaseLabel = tr(`coach:cycle.phase.${c.phase}`, { defaultValue: { menstrual: 'Menstrual', follicular: 'Follicular', ovulatory: 'Ovulatory', luteal: 'Luteal', paused: 'Predictions paused', late: 'Awaiting next log' }[c.phase] });
  return (
    <div style={station}>
      {window.BSTStationHead && <window.BSTStationHead heat={heat} INK={t.INK} label={tr('coach:cycle.head', { defaultValue: 'CYCLE · SHARED BY THE MEMBER' })} />}
      <div style={{ fontFamily: t.DISPLAY, fontSize: 17, color: t.INK }}>
        {c.phase === 'paused' || c.phase === 'late' ? phaseLabel : tr('coach:cycle.phaseDay', { defaultValue: '{phase} · day {day}', phase: phaseLabel, day: c.day })}
      </div>
      {c.predictedStart && (
        <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.06em', color: t.INK50 }}>
          {tr('coach:cycle.window', { defaultValue: 'Next period window · {from} – {to}', from: bsShortDate(c.predictedStart.from), to: bsShortDate(c.predictedStart.to) })}
        </div>
      )}
      <BSCycleMonthStrip starts={cycleShared.starts} heat={heat} />
      {c.phase === 'luteal' && c.predictedStart && (
        <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 12, fontStyle: 'italic', color: t.INK70 }}>
          {tr('coach:cycle.deload', { defaultValue: 'Week of the {d} is a natural deload window.', d: bsShortDate(c.predictedStart.from) })}
        </div>
      )}
    </div>
  );
})()}
```

⚠ `station`/`heat`/`bsShortDate` are the page's existing locals — match the neighboring stations' exact style objects and date helper (grep the SLEEP station's; reuse, don't invent). ⚠ The ONE dynamic key `coach:cycle.phase.${c.phase}` violates the literal-key rule — **enumerate instead**: six literal `tr` calls behind a small `switch` (the #1759 lesson; the resolve-check can't see template keys). **Write the switch.**

- [ ] **Step 3: `BSCycleMonthStrip`** — a small pure presentational row: the current month's days as 3px ticks, logged start-days as filled discs in `heat` — ~15 lines, no state.
- [ ] **Step 4: i18n** — the new `coach:cycle.*` keys ×13 (small set, ~10 keys; same per-locale rules; direct per-locale agents if batched with other work, else hand-translate this small set consistently with each catalog's register).
- [ ] **Step 5: Verify + commit** — JSX parse · `/m/` build · catalog parity · tr-shadow.

---

### Task 2: Shared-overview `cycle` leg (server)

**Files:**
- Modify: `src/app/api/clients/[id]/shared-overview/route.ts` — the `Promise.all` at lines 183–196.

**Interfaces:**
- Produces: `data.cycle` = `null | { share:false } | { share:true, starts:[iso] }` — the RPC's return, passed through raw (PR D derives client-side).

- [ ] **Step 1:** add `supabase.rpc('get_client_cycle', { p_user_id: clientId })` to the `Promise.all` + `cycle` to the destructuring + `cycle: cycle ?? null` to the response JSON. The route runs on the COACH'S session → the definer gates internally; no extra guard needed (the `get_client_goals` precedent at line 187).
- [ ] **Step 2:** `tsc --noEmit` · commit.

---

### Task 3: Gates + PR

- [ ] Full gates. Dev-server proof with two accounts once the migration is live: share ON → station appears with phase/window/strip; share OFF → the station does not exist in the DOM; a non-linked coach's `forClient` → null → nothing. The paused/late states render their honest lines, never a fabricated day.
- [ ] PR: `cycle C: coach Case File CYCLE station + shared-overview leg (spec 2026-07-19)`; note the absence-not-padlock proof. CI + CodeRabbit; squash-merge; re-sync. War Room: the owner on-device item "share toggle → coach station appears/vanishes."

---

## Self-review notes

- **Spec coverage:** Case File station (phase + day, window, month strip, deload line) · phase-and-timing-only rule · absence semantics · the shared-overview leg for PR D.
- **Type consistency:** `forClient`'s three return shapes handled exhaustively; `data.cycle` passthrough shape matches what PR D's plan consumes.
- **Literal-key discipline:** the phase-label switch replaces the tempting dynamic key — called out inline.
