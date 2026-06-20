# Interactive spotlight tour — app + website (design)

**Date:** 2026-06-20
**Status:** Approved (design); pending implementation plan
**Scope:** Replace the current "float-a-card-over-the-screen" onboarding tour with an
**interactive guided spotlight tour** — dim the screen, highlight the *real* UI element,
show a coachmark, advance on Next — across the **mobile app** (client + both coach roles,
reworking the existing tours) and the **website dashboards** (client + coach, where no tour
exists today). One shared vanilla engine drives both.

## 1. Goal & principles

- **Walk the user through where everything is.** On first run (and on replay), the tour
  steps through each screen, spotlighting the nav destination + the one hero element on it,
  so a new member/coach learns the layout by being shown it.
- **Guided spotlight, not action-gated.** The tour dims the screen, cuts a spotlight around
  the target, and shows a coachmark with Back / Next / Skip + progress dots. It does NOT
  require the user to perform the action (chosen for reliability over an empty new account).
- **One engine, both surfaces.** A single framework-agnostic vanilla module runs in the
  mobile Capacitor WebView and on the website — no new dependency, house-styled.
- **Reuse what exists.** Keep the current trigger + persistence (new-account auto-show,
  `shape:startTour` replay, `user_goals` flags, the "Me → App tour" entry); the website
  gets the same.
- **Degrade, never stall.** A missing anchor (empty account / absent feature) → the step
  skips or falls back to the always-present nav item; the tour never gets stuck. Respect
  reduced-motion.

## 2. Locked decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Interactivity | **Guided spotlight** (highlight + coachmark + Next) — not action-gated |
| Depth | **Orientation+**: one stop per page (nav item + one hero element), ~7–10 steps |
| Engine | **One shared vanilla `spotlightTour.js`** (approach B) — no new dependency |
| Surfaces | Mobile app (client + trainer + nutritionist) **and** website (client + coach) |
| Client finale | **Shape Radio** as the last content step (intro coachmark + "Open Shape Radio →") |
| Trigger/persistence | Reuse the existing new-account/`shape:startTour`/`user_goals` pattern |

## 3. Architecture

**The engine (shared, vanilla):** `spotlightTour.js` — `startTour(steps, { onDone })`.
For each step it: runs `step.navigate()` (switch tab/route), waits for `step.anchor()` to
resolve to an element, draws a **dim overlay with a cutout** around that element's rect, and
positions a **coachmark** (eyebrow/title/body + Back / Next / Skip + progress dots) beside
it. It repositions on resize, handles a missing anchor (falls back to the step's nav
item, then to a centered cutout-less card — the step still shows, it isn't skipped),
tears down cleanly on finish/skip, and respects `prefers-reduced-motion`. Pure DOM, so
it runs identically in the mobile WebView and the website.

**Per-surface adapters** supply two things — a **step list** and a **navigate** function:
- **Mobile adapter** (in the broadsheet): replaces `BSOnboardingTour` /
  `BSProOnboardingTour` (`iosAppBroadsheetClient.jsx` ~238–299 / `iosAppBroadsheetPros.jsx`
  ~909–996) with calls into the engine. `navigate` fires the existing React `setTab`; anchors
  are `data-tour` hooks on the nav tabs + hero elements. Keeps `bsMarkTourSeen` /
  `user_goals('client_onboarding'|'coach_onboarding')`, the `<24h` new-account auto-show, the
  `shape:startTour` replay, and the "Me → App tour" entry.
- **Website adapter** (net-new): a small script loaded by the dashboard SPAs
  (`ClientApp.html` / `TrainerApp.html` / `NutritionistApp.html`). `navigate` sets the hash
  route; anchors are `data-tour` hooks on the nav items + a hero per route. Persists to
  `user_goals` (same keys) + a "Take a tour" entry in the nav/profile.

**Step model:** `{ navigate: () => void, anchor: () => Element | null, eyebrow, title, body, final? }`.
`final: true` marks the Shape-Radio finale (renders an "Open Shape Radio →" CTA instead of
"Next" and ends the tour by navigating to `Radio.html`).

## 4. The pages each tour covers

**📱 Mobile — Client:** Welcome → Home → Train → Eat → **Grocery list** (within Eat) →
**Habits** → Chat → Me → **🎵 Shape Radio** (finale) → Done.

**📱 Mobile — Coach (trainer & nutritionist):** Welcome → Today → Clients → Plans
(Programs for trainers) → Chat → Me → Done.

**💻 Website — Client dashboard:** Welcome → Today → Workouts → Nutrition →
**Grocery list** (within Nutrition) → **Habits** → Score → Community → Profile →
**🎵 Shape Radio** (finale) → Done.

**💻 Website — Coach dashboard:** Welcome → Today → Clients → Programs/Plans → Business →
Community → Profile → Done.

On each stop the spotlight highlights the **nav item** plus the **one hero element** on that
screen (e.g. Home's "today's move," Eat's Log button, the grocery-list entry, the Habits
score card, the Shape Score card, the Profile header). **Grocery list** is a sub-feature
step: the tour navigates to Eat/Nutrition and spotlights the grocery-list entry/element (it
is not a top-level tab). **Habits** is its own tab (web `#habits`; the mobile habits page).

## 5. Anchoring

Each target element gets a stable `data-tour="<key>"` attribute (nav items + the one hero per
screen + the grocery entry). The engine resolves `step.anchor()` by querying that attribute
(within the current surface's DOM). If the element is absent or not yet mounted, the engine
polls briefly, then **falls back to the nav item** for that screen (always present), so the
step still has something to spotlight. Adding the `data-tour` hooks is part of the build.

## 6. The Shape Radio finale

Shape Radio is a **separate page** (`Radio.html`), not a dashboard tab. So the final client
step is an **intro coachmark** ("Last stop — Shape Radio: ad-free workout mixes…") whose
primary button is **"Open Shape Radio →"** (navigates to `Radio.html`) and whose secondary is
"Finish." This ends the tour cleanly without needing tour state to survive a full-page
navigation. (When the Nora-avatar Radio ships, the URL is unchanged, so the step stays valid.)

## 7. Trigger & persistence (reused)

- **Auto-show** once for accounts created in the last 24h that haven't seen the tour
  (localStorage fast-path + `user_goals('client_onboarding'|'coach_onboarding')`), exactly as
  today on mobile; the website mirrors it.
- **Replay** anytime via the existing `shape:startTour` event + the "App tour" / "Take a tour"
  entry (mobile Me; website nav/profile).
- Marking seen on finish OR skip.

## 8. Error handling / degradation

- **Missing anchor** → poll, then fall back to the nav item; never stall.
- **Route/tab not switchable** (an error in `navigate`) → skip the step, continue.
- **Reduced-motion** → no dim animation/transitions, instant cutout moves.
- **Empty/new account** → heroes may be absent; the nav-item fallback keeps every step valid.
- **Resize** → recompute the cutout + coachmark position.

## 9. Testing

- **Unit (`tests/*.mjs`):** the engine's pure logic — step sequencing/back-next bounds, the
  anchor-resolve-then-fallback decision, and the coachmark placement math (which side of the
  target, clamped to viewport).
- **Headless (Playwright):** the website tour end-to-end on the dashboard SPAs (each step
  navigates, an element gets the spotlight, Next advances, the Radio finale links out).
- **On-device:** the mobile tour (WebView) — spotlight renders over the right tab, Next walks
  through, Skip/replay work.

## 10. Phased rollout

- **Phase A — engine + mobile rework:** build `spotlightTour.js` + the mobile adapter; replace
  the two existing card tours; add the mobile `data-tour` hooks. Ships an upgraded mobile tour
  on its own.
- **Phase B — website tours:** the website adapter + step lists + `data-tour` hooks on the
  client and coach dashboard SPAs (the net-new surface).

## 11. Out of scope

- **Action-gated steps** (waiting for the user to actually tap) — explicitly rejected for v1.
- **Deep feature walkthroughs** (multiple steps per screen) — orientation depth only.
- **A cross-page tour that continues *on* `Radio.html`** — the finale links out instead.
- **Per-step analytics** — a possible follow-up.

## 12. Files (indicative)

- Create: `public/newdesign/spotlightTour.js` (the shared engine).
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (`BSOnboardingTour` → engine
  + client step list + `data-tour` hooks) and `iosAppBroadsheetPros.jsx` (`BSProOnboardingTour`).
- Modify: `public/newdesign/ClientApp.html`, `TrainerApp.html`, `NutritionistApp.html` (load
  the engine + website adapter + step lists), plus `clientNav.jsx`/`coachNav.jsx` and the per-
  route hero elements (add `data-tour` hooks + a "Take a tour" entry).
- Reuse: the existing `user_goals` onboarding flags + `shape:startTour` event.
