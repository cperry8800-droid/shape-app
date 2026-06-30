# Interactive spotlight tour — Phase B: website dashboard tours (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the spotlight tour to the website dashboards (client + both coach roles) — the first tour the website has ever had — reusing the Phase A engine, with the dashboards' hash-route navigation and `shapeDb` persistence.

**Architecture:** Each dashboard SPA (`ClientApp.html`/`TrainerApp.html`/`NutritionistApp.html`) loads the Phase A engine (`spotlightTour.js`, `window.SpotlightTour`) via a module script, plus a shared vanilla `dashTour.js` adapter that holds the per-role step lists, the new-account auto-show + `shape:startTour` replay trigger, and calls `window.SpotlightTour.start(steps, { root: document.body, ... })`. Steps navigate by setting `location.hash` and anchor to `data-tour` hooks on the nav items + one hero per route.

**Tech Stack:** Vanilla JS (the engine + adapter), babel-standalone JSX dashboards (React UMD), `shapeDb` (`public/supabase.js`), `node --test` (`tests/*.mjs`), Playwright (headless integration check).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-20-interactive-spotlight-tour-design.md`. Phase A (the engine + mobile rework) is **done + merged on this branch**. This plan is **Phase B** — the website dashboards only.
- **Reuse the Phase A engine unchanged:** `public/newdesign/spotlightTour.js` (`window.SpotlightTour.start(steps, opts)`) + `spotlightGeom.mjs`. The step shape is `{ navigate, anchor, fallback, eyebrow, title, body, final, ctaLabel, onCta }`; `opts` is `{ root, accent, isLight, onDone }`. Do NOT modify the engine.
- **Engine root = `document.body`** on the website (the dashboard fills the viewport).
- **Navigate by hash:** a step's `navigate()` sets `window.location.hash = '#<slug>'`; the SPA's existing `hashchange` listener re-renders + `scrollTo(0,0)`. The engine polls `anchor()` (1.2s) so it catches the element after the route re-renders.
- **Client web tour:** Welcome → Today → Workouts → Nutrition → **Grocery** (within Nutrition) → **Habits** → Score → Community → Profile → **🎵 Shape Radio finale** → Done. Coach tour: Welcome → Today → Clients → **Programs/Plans** → Business → Community → Profile → Done.
- **Radio finale opens the website Radio page:** `onCta: () => { window.location.href = '/newdesign/Radio.html'; }` (the website Radio IS a page — unlike mobile's in-app tab).
- **Persistence:** reuse `user_goals` via `window.shapeDb` (same keys as mobile: `client_onboarding` / `coach_onboarding`) + a localStorage fast-path (`shape.webTourSeen`); auto-show once for accounts `<24h` old; replay via `shape:startTour` + a "Take a tour" entry.
- **`?v=` cache-bust:** bump the `?v=` on every edited `.jsx`/added script tag (the dashboards cache by `?v=`).
- **House style:** the spotlight visuals come from the engine; match the dashboard accents — client teal `#2ee0c4`, trainer `#0a8f87`, nutritionist `#a07a2e`.
- **Branch:** `claude/dashboard-widgets` (main repo `C:/Users/cperr/shape-app`).

## File Structure

- `public/newdesign/tourTrigger.mjs` — **create** (Task 1): pure `shouldAutoShowTour(createdAtISO, seen, nowMs, maxAgeHours)`.
- `tests/tour-trigger.test.mjs` — **create** (Task 1): unit tests.
- `public/newdesign/dashTour.js` — **create** (Task 2): the website adapter (`window.ShapeDashTour.init(role)`): step lists + trigger + `SpotlightTour.start`.
- `public/newdesign/ClientApp.html`, `TrainerApp.html`, `NutritionistApp.html` — **modify** (Task 2): load the engine (module) + `dashTour.js`; call `ShapeDashTour.init(role)`.
- `public/newdesign/clientNav.jsx` + the sidebar render in `pageShell.jsx` (+ `coachNav.jsx`/`trainerDashboard.jsx` for coach) — **modify** (Tasks 3/4): `data-tour="webtab-<slug>"` on nav items.
- The per-route page components (`dashToday.jsx`, `dashTrain.jsx`, `dashNutri.jsx`, `clientHabits.jsx`, `clientScore.jsx`, `community`/`dashboardCommunity.jsx`, `livingProfilePage.jsx`, coach equivalents) — **modify** (Tasks 3/4): `data-tour="hero-<slug>"` on one hero per page.
- `public/newdesign/clientMeSettings.jsx` + `dashProfileExtras.jsx` — **modify** (Task 5): "Take a tour" replay row.
- `docs/WORKLOG.md`, `src/lib/warroom.ts` — **modify** (Task 6).

---

### Task 1: Pure auto-show trigger helper (TDD)

**Files:**
- Create: `public/newdesign/tourTrigger.mjs`
- Create: `tests/tour-trigger.test.mjs`
- Modify: `package.json` (register the test)

**Interfaces:**
- Produces: `shouldAutoShowTour(createdAtISO: string|null, seen: boolean, nowMs: number, maxAgeHours=24): boolean` — true only when the account exists, is younger than `maxAgeHours`, and hasn't seen the tour.

- [ ] **Step 1: Write the failing test** (`tests/tour-trigger.test.mjs`):
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldAutoShowTour } from '../public/newdesign/tourTrigger.mjs';

const now = Date.UTC(2026, 5, 20, 12, 0, 0); // 2026-06-20T12:00:00Z
const hoursAgo = (h) => new Date(now - h * 3600e3).toISOString();

test('shows for a fresh account that has not seen it', () => {
  assert.equal(shouldAutoShowTour(hoursAgo(2), false, now), true);
});

test('does not show once seen', () => {
  assert.equal(shouldAutoShowTour(hoursAgo(2), true, now), false);
});

test('does not show for an account older than 24h', () => {
  assert.equal(shouldAutoShowTour(hoursAgo(30), false, now), false);
});

test('does not show with no createdAt (signed out / unknown)', () => {
  assert.equal(shouldAutoShowTour(null, false, now), false);
  assert.equal(shouldAutoShowTour('', false, now), false);
});

test('honors a custom maxAgeHours', () => {
  assert.equal(shouldAutoShowTour(hoursAgo(2), false, now, 1), false); // 2h > 1h
  assert.equal(shouldAutoShowTour(hoursAgo(0.5), false, now, 1), true);
});

test('does not throw on a garbage date (treats as no-show)', () => {
  assert.equal(shouldAutoShowTour('not-a-date', false, now), false);
});
```

- [ ] **Step 2: Register + run to verify it fails.** Append `tests/tour-trigger.test.mjs` to the `node --test ...` list in `package.json`'s `test` script. Run `cd /c/Users/cperr/shape-app && npm test`. Expected: FAIL — module not found.

- [ ] **Step 3: Write the helper** (`public/newdesign/tourTrigger.mjs`):
```js
// Pure trigger logic for the website spotlight tour's new-account auto-show.
// Imported by tests AND (as a plain script global, see dashTour.js) the dashboards.
// Show ONCE for an account younger than maxAgeHours that hasn't seen the tour.
export function shouldAutoShowTour(createdAtISO, seen, nowMs, maxAgeHours = 24) {
  if (seen) return false;
  if (!createdAtISO) return false;
  const t = Date.parse(createdAtISO);
  if (!Number.isFinite(t)) return false;
  const ageHours = (nowMs - t) / 3600000;
  return ageHours >= 0 && ageHours < maxAgeHours;
}
```

- [ ] **Step 4: Run the test to verify it passes.** `cd /c/Users/cperr/shape-app && npm test`. Expected: PASS (6 new tests; all pre-existing green).

- [ ] **Step 5: Commit.**
```bash
git add public/newdesign/tourTrigger.mjs tests/tour-trigger.test.mjs package.json
git commit -m "feat(tour): pure web-tour auto-show trigger helper + tests"
```

---

### Task 2: The website tour adapter + engine loading

**Files:**
- Create: `public/newdesign/dashTour.js`
- Modify: `public/newdesign/ClientApp.html`, `TrainerApp.html`, `NutritionistApp.html`

**Interfaces:**
- Consumes: `window.SpotlightTour.start` (Phase A engine); `shouldAutoShowTour` (Task 1, re-declared here as a plain global since this file is a non-module script — see Step 1); `window.shapeDb` (`getUser`, `getUserGoals`/`saveUserGoals`); the `data-tour` hooks (Tasks 3/4).
- Produces: `window.ShapeDashTour = { init(role), start(role) }`. `role` ∈ `'client'|'trainer'|'nutritionist'`.

- [ ] **Step 1: Write the adapter** (`public/newdesign/dashTour.js`). It is a plain (non-module) script. Because a non-module script can't `import`, inline the tiny trigger predicate here (kept identical to `tourTrigger.mjs` — the `.mjs` is the tested source of truth; this 4-line copy is the browser-global mirror, like the repo's `.mjs`↔SQL mirrors):
```js
/* Website spotlight tour adapter. Loads after spotlightTour.js (window.SpotlightTour)
   and supabase.js (window.shapeDb). Each dashboard shell calls ShapeDashTour.init(role). */
(function () {
  var ACCENT = { client: '#2ee0c4', trainer: '#0a8f87', nutritionist: '#a07a2e' };
  var GOAL_KEY = { client: 'client_onboarding', trainer: 'coach_onboarding', nutritionist: 'coach_onboarding' };

  // Mirror of tourTrigger.mjs shouldAutoShowTour (the .mjs is the tested source).
  function shouldAutoShow(createdAtISO, seen, nowMs, maxAgeHours) {
    if (seen) return false;
    if (!createdAtISO) return false;
    var t = Date.parse(createdAtISO);
    if (!isFinite(t)) return false;
    var ageHours = (nowMs - t) / 3600000;
    return ageHours >= 0 && ageHours < (maxAgeHours || 24);
  }

  function q(key) { return function () { return document.querySelector('[data-tour="' + key + '"]'); }; }
  function go(slug) { return function () { window.location.hash = '#' + slug; }; }

  function clientSteps() {
    return [
      { navigate: go('today'), anchor: q('hero-today'), fallback: q('webtab-today'), eyebrow: 'Welcome', title: 'Welcome to Shape.', body: 'A quick tour of your dashboard — about 30 seconds.' },
      { navigate: go('today'), anchor: q('hero-today'), fallback: q('webtab-today'), eyebrow: 'Today', title: 'Your day, at a glance.', body: 'Your next move and the day’s plan lead here.' },
      { navigate: go('workouts'), anchor: q('hero-workouts'), fallback: q('webtab-workouts'), eyebrow: 'Workouts', title: 'Your training.', body: 'Today’s session and your program live here.' },
      { navigate: go('nutrition'), anchor: q('hero-nutrition'), fallback: q('webtab-nutrition'), eyebrow: 'Nutrition', title: 'Meals & macros.', body: 'Your plan for the day, logged in a tap.' },
      { navigate: go('nutrition'), anchor: q('hero-grocery'), fallback: q('webtab-nutrition'), eyebrow: 'Grocery', title: 'Grocery lists.', body: 'Your week’s meals become a shopping list, sorted by aisle.' },
      { navigate: go('habits'), anchor: q('hero-habits'), fallback: q('webtab-habits'), eyebrow: 'Habits', title: 'Daily habits.', body: 'Small things that add up — each one feeds your Shape Score.' },
      { navigate: go('score'), anchor: q('hero-score'), fallback: q('webtab-score'), eyebrow: 'Score', title: 'Your Shape Score.', body: 'The one number that tells the truth, read every week.' },
      { navigate: go('community'), anchor: q('hero-community'), fallback: q('webtab-community'), eyebrow: 'Community', title: 'The feed.', body: 'See what the community is doing and cheer them on.' },
      { navigate: go('profile'), anchor: q('hero-profile'), fallback: q('webtab-profile'), eyebrow: 'You', title: 'Your profile.', body: 'Your living profile — climb, signals and standing.' },
      { navigate: go('today'), anchor: q('webtab-today'), fallback: q('webtab-today'), final: true, ctaLabel: 'Open Shape Radio →', eyebrow: 'Last stop', title: 'Shape Radio.', body: 'Ad-free workout mixes, curated by BPM. Free with your membership.', onCta: function () { window.location.href = '/newdesign/Radio.html'; } },
    ];
  }
  function coachSteps(role) {
    var plans = role === 'trainer' ? 'programs' : 'plans';
    var plansLabel = role === 'trainer' ? 'Programs' : 'Plans';
    return [
      { navigate: go('today'), anchor: q('hero-today'), fallback: q('webtab-today'), eyebrow: 'Welcome', title: 'Your coaching tools.', body: 'A quick tour of your dashboard — about 30 seconds.' },
      { navigate: go('today'), anchor: q('hero-today'), fallback: q('webtab-today'), eyebrow: 'Today', title: 'Who needs you.', body: 'Your day leads with the clients who need attention.' },
      { navigate: go('clients'), anchor: q('hero-clients'), fallback: q('webtab-clients'), eyebrow: 'Clients', title: 'Your roster.', body: 'Every client, sorted by who’s on track and who’s slipping.' },
      { navigate: go(plans), anchor: q('hero-' + plans), fallback: q('webtab-' + plans), eyebrow: plansLabel, title: 'Build & sell.', body: 'Create ' + plansLabel.toLowerCase() + ', assign them, and sell them in the marketplace.' },
      { navigate: go('business'), anchor: q('hero-business'), fallback: q('webtab-business'), eyebrow: 'Business', title: 'Your practice.', body: 'Revenue, payouts and clients at a glance.' },
      { navigate: go('community'), anchor: q('hero-community'), fallback: q('webtab-community'), eyebrow: 'Community', title: 'The feed.', body: 'Stay close to clients and the wider community.' },
      { navigate: go('profile'), anchor: q('hero-profile'), fallback: q('webtab-profile'), eyebrow: 'You', title: 'Your standing.', body: 'Your coach profile, payouts and Shape Score.' },
    ];
  }

  function stepsFor(role) { return role === 'client' ? clientSteps() : coachSteps(role); }

  function markSeen(role) {
    try { localStorage.setItem('shape.webTourSeen', '1'); } catch (e) {}
    try { window.shapeDb && window.shapeDb.saveUserGoals && window.shapeDb.saveUserGoals(GOAL_KEY[role], { tourSeen: true, at: new Date().toISOString() }); } catch (e) {}
  }

  function start(role) {
    if (!window.SpotlightTour) return;
    window.SpotlightTour.start(stepsFor(role), { root: document.body, accent: ACCENT[role] || ACCENT.client, isLight: false, onDone: function () { markSeen(role); } });
  }

  function init(role) {
    window.addEventListener('shape:startTour', function () { start(role); });
    // Auto-show once for new accounts.
    (function () {
      try {
        if (localStorage.getItem('shape.webTourSeen') === '1') return;
      } catch (e) {}
      Promise.resolve(window.shapeDb && window.shapeDb.getUser && window.shapeDb.getUser()).then(function (u) {
        if (!u || !u.created_at) return;
        if (shouldAutoShow(u.created_at, false, Date.now(), 24)) {
          markSeen(role);            // mark first so a reload can't re-trigger
          setTimeout(function () { start(role); }, 900); // let the first route render
        }
      }).catch(function () {});
    })();
  }

  window.ShapeDashTour = { init: init, start: start };
})();
```
(Confirm the exact `window.shapeDb` method names while implementing — `getUser`, `getUserGoals`/`saveUserGoals`. If a getter differs, adjust; the calls are guarded so a wrong name degrades to no-auto-show, never a crash.)

- [ ] **Step 2: Load the engine + adapter on the three shells + init.** In each of `ClientApp.html`, `TrainerApp.html`, `NutritionistApp.html`, after the `supabase.js` script tag add:
```html
<script type="module" src="/newdesign/spotlightTour.js?v=20260620"></script>
<script src="/newdesign/dashTour.js?v=20260620"></script>
```
Then, inside each shell's existing `type="text/babel"` app code (after the app mounts), call init with the role: `ClientApp.html` → `window.ShapeDashTour && window.ShapeDashTour.init('client')`; `TrainerApp.html` → `init('trainer')`; `NutritionistApp.html` → `init('nutritionist')`. Place the call after `ReactDOM` renders the app (e.g., at the end of the mount script) so the DOM + `window.shapeDb` exist.

- [ ] **Step 3: Parse-check** `dashTour.js`: `cd /c/Users/cperr/shape-app && node --check public/newdesign/dashTour.js` → no output. (The tour won't fully resolve anchors until Tasks 3/4 add the `data-tour` hooks — fallbacks keep it from stalling.)

- [ ] **Step 4: Commit.**
```bash
git add public/newdesign/dashTour.js public/newdesign/ClientApp.html public/newdesign/TrainerApp.html public/newdesign/NutritionistApp.html
git commit -m "feat(tour): website tour adapter (dashTour.js) + load the engine on the 3 dashboard SPAs"
```

---

### Task 3: Client web `data-tour` hooks + verify

**Files:**
- Modify: the client sidebar nav render (in `public/newdesign/pageShell.jsx` — the `DashSidebar` that maps `clientNavItems()`); the client page components for the heroes — `dashToday.jsx`, `dashTrain.jsx`, `dashNutri.jsx` (nutrition + grocery), `clientHabits.jsx`, `clientScore.jsx`, the community page, `livingProfilePage.jsx`.

**Interfaces:**
- Consumes: the `dashTour.js` client step keys — nav `webtab-{today,workouts,nutrition,habits,score,community,profile}`; heroes `hero-{today,workouts,nutrition,grocery,habits,score,community,profile}`.

- [ ] **Step 1: Tag the nav items.** Find where the client sidebar renders each nav item (the `clientNavItems()` consumer in `pageShell.jsx`'s `DashSidebar`). Add `data-tour={'webtab-' + item.slug}` to each nav `<a>`/`<button>`. Bump that file's `?v=` on `ClientApp.html`.

- [ ] **Step 2: Tag one hero per client route.** In each component, add `data-tour="hero-<slug>"` to the outermost hero/section element (READ each to pick the right node):
  - `dashToday.jsx` → `hero-today` (the "Today · your move" directive / day hero).
  - `dashTrain.jsx` → `hero-workouts` (the Train deck hero).
  - `dashNutri.jsx` → `hero-nutrition` (the day/next-meal hero) AND `hero-grocery` (the grocery-list entry/section).
  - `clientHabits.jsx` → `hero-habits` (the Earned-today/score card).
  - `clientScore.jsx` → `hero-score` (the Shape Score composite hero).
  - the community page component → `hero-community` (the feed masthead/presence rail).
  - `livingProfilePage.jsx` → `hero-profile` (the profile hero — avatar + tier).
  Bump each edited file's `?v=` on `ClientApp.html`.

- [ ] **Step 3: Verify headlessly.** Serve the repo (`cd public && python -m http.server 8801`), then with Playwright (or the available browser tool): load `http://localhost:8801/newdesign/ClientApp.html#today`, evaluate `window.dispatchEvent(new Event('shape:startTour'))`, wait ~1s, and assert: a `.​spotlight`/overlay layer exists (the engine appends a fixed `z-index:99999` div to `document.body`), a coachmark card is visible, and clicking the **Next** button advances (the hash changes to `#workouts` and a new hero gets spotlit). Confirm the final step's button reads "Open Shape Radio →". (The dashboard renders its signed-out/demo state, which still has the nav + heroes, so anchors resolve.) Capture nothing if it passes; fix anchors that don't resolve (the fallback should at least hit the nav item).

- [ ] **Step 4: Commit.**
```bash
git add public/newdesign/pageShell.jsx public/newdesign/dashToday.jsx public/newdesign/dashTrain.jsx public/newdesign/dashNutri.jsx public/newdesign/clientHabits.jsx public/newdesign/clientScore.jsx public/newdesign/livingProfilePage.jsx public/newdesign/ClientApp.html
# (include the community page file you tagged)
git commit -m "feat(tour): client web data-tour hooks (nav + per-route heroes)"
```

---

### Task 4: Coach web `data-tour` hooks

**Files:**
- Modify: the coach sidebar nav render (the `coachNav.jsx` consumer — likely `trainerDashboard.jsx`'s `DashSidebar`); the coach page components for heroes — coach Today (`dashToday.jsx` coach view), the roster/clients page, the programs/plans pages (`trainerPrograms`/`nutritionistPlans` or their dash equivalents), the business page (`dashBusiness.jsx`), the community page, the coach profile (`livingProfilePage.jsx` signal).

**Interfaces:**
- Consumes: `dashTour.js` coach keys — nav `webtab-{today,clients,programs|plans,business,community,profile}`; heroes `hero-{today,clients,programs|plans,business,community,profile}`.

- [ ] **Step 1: Tag the coach nav items.** Find the coach sidebar nav render (the `coachNavItems(role)` consumer). Add `data-tour={'webtab-' + item.slug}` to each nav element. Bump `?v=` on `TrainerApp.html` + `NutritionistApp.html`.

- [ ] **Step 2: Tag one hero per coach route** (READ each component): coach Today → `hero-today` (the triage/"who needs you" lead); the clients/roster page → `hero-clients`; the programs page → `hero-programs`; the plans page → `hero-plans`; `dashBusiness.jsx` → `hero-business` (the revenue/overview card); the community page → `hero-community` (shared with client — already tagged in Task 3 if it's the same component, in which case skip); the coach Signal profile → `hero-profile` (shared `livingProfilePage.jsx` — the Signal hero; if the same element as the client hero, one `hero-profile` covers both). Bump `?v=` on both coach HTMLs for edited files.

- [ ] **Step 3: Verify headlessly.** As Task 3 Step 3 but for `TrainerApp.html#today` and `NutritionistApp.html#today` — fire `shape:startTour`, confirm the role-accented spotlight walks the coach tabs (Today → Clients → Programs/Plans → Business → Community → Profile) and ends on Profile (no Radio finale).

- [ ] **Step 4: Commit.**
```bash
git add public/newdesign/trainerDashboard.jsx public/newdesign/dashToday.jsx public/newdesign/dashBusiness.jsx public/newdesign/livingProfilePage.jsx public/newdesign/TrainerApp.html public/newdesign/NutritionistApp.html
# (include the roster + programs/plans page files you tagged)
git commit -m "feat(tour): coach web data-tour hooks (nav + per-route heroes)"
```

---

### Task 5: "Take a tour" replay entries

**Files:**
- Modify: `public/newdesign/clientMeSettings.jsx` (client) + `public/newdesign/dashProfileExtras.jsx` (coach).

**Interfaces:**
- Consumes: the `shape:startTour` event that `dashTour.js`'s `init` listens for (Task 2).

- [ ] **Step 1: Add a client "Take a tour" row.** In `clientMeSettings.jsx`, find the settings/links rows section and add a row labeled "App tour" / "Take a tour" whose handler does `window.dispatchEvent(new Event('shape:startTour'))`. Match the existing row styling. Bump `clientMeSettings.jsx ?v=` on `ClientApp.html`.

- [ ] **Step 2: Add a coach "Take a tour" row.** In `dashProfileExtras.jsx` (the coach profile extras, rendered on both coach Me pages), add the same row → `shape:startTour`. Bump its `?v=` on `TrainerApp.html` + `NutritionistApp.html`.

- [ ] **Step 3: Verify.** Reload a dashboard, open Profile/settings, click "Take a tour" → the spotlight tour starts. (Headless: navigate to the profile route, click the row, assert the overlay appears.)

- [ ] **Step 4: Commit.**
```bash
git add public/newdesign/clientMeSettings.jsx public/newdesign/dashProfileExtras.jsx public/newdesign/ClientApp.html public/newdesign/TrainerApp.html public/newdesign/NutritionistApp.html
git commit -m "feat(tour): website 'Take a tour' replay entry (client + coach)"
```

---

### Task 6: Ship — WORKLOG + War Room

**Files:**
- Modify: `docs/WORKLOG.md`, `src/lib/warroom.ts`

- [ ] **Step 1: WORKLOG entry** (top of `## Changelog`, 2026-06-20): the website dashboards now have the spotlight tour (Phase B) — the shared engine loaded on the 3 SPAs + `dashTour.js` adapter (hash-route navigation, `shapeDb` persistence, new-account auto-show + "Take a tour" replay), `data-tour` hooks on the web nav + per-route heroes, client tour ending on the Shape Radio finale (→ `/newdesign/Radio.html`), coach tours ending on Profile. Monochrome emoji only.

- [ ] **Step 2: War Room** (`src/lib/warroom.ts`): flip the "spotlight tour — website dashboard tours (Phase B)" item from `pending` to `done` (added in Phase A's Task 5). No new API route.

- [ ] **Step 3: Typecheck + commit.** `cd /c/Users/cperr/shape-app && npx tsc --noEmit` (clean). Then:
```bash
git add docs/WORKLOG.md src/lib/warroom.ts
git commit -m "docs(tour): WORKLOG + War Room — website spotlight tour (Phase B)"
```

---

## Self-review notes (done while writing)

- **Spec coverage:** Phase B = the website adapter (Task 2) + the web step lists (client incl. grocery/habits + Radio finale; coach) + `data-tour` hooks (Tasks 3/4) + the same trigger/persistence + a replay entry (Task 5) + ship docs (Task 6). The pure trigger is TDD'd (Task 1). Matches the spec's §3 website adapter + §4 web page lists + §6 Radio finale + §7 trigger.
- **Engine reuse, not modified:** every task consumes `window.SpotlightTour.start` + the `data-tour`/`navigate(hash)`/`fallback` contract from Phase A; the engine file is untouched.
- **Degrade:** every step has a `fallback` to its nav item (always present), so an un-tagged or unmounted hero never stalls the tour. The auto-show is guarded (no user / no `shapeDb` / bad date → no-show, never a crash).
- **Type consistency:** the `data-tour` keys (`webtab-<slug>`, `hero-<slug>`) and the step shape are identical between `dashTour.js` (Task 2) and the hook tasks (3/4). The trigger predicate matches `tourTrigger.mjs` (Task 1) verbatim.
- **Testability:** Task 1 is unit-tested; Tasks 3/4/5 are headless-verifiable in a real browser (the dashboards run in-browser, unlike the mobile WebView) — the plan calls for a Playwright/headless check that fires `shape:startTour` and asserts the overlay + Next advance.
- **Known limitation (noted, not blocking):** the Phase A engine does not auto-`scrollIntoView` an anchor; the website heroes are top-of-route (post `scrollTo(0,0)`) and nav items are always in view, so orientation anchors are on-screen. If a future deeper step targets a below-the-fold element, add a `scrollIntoView` in the engine (a Phase A follow-up).
