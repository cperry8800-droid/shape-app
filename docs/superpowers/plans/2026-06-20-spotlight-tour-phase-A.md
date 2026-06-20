# Interactive spotlight tour — Phase A: engine + mobile rework (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mobile app's float-a-card onboarding tour with an interactive guided spotlight tour — dim the screen, cut a spotlight around the real element, show a coachmark — driven by a shared vanilla engine, for the client and both coach roles.

**Architecture:** A pure geometry module (`spotlightGeom.mjs`, unit-tested) computes the cutout + coachmark placement; a framework-agnostic engine (`spotlightTour.js`) draws the dim overlay + cutout + coachmark into a configurable **root container** and walks an array of steps; the mobile broadsheet imports it and supplies client/coach step lists (navigate = the existing React `setTab`, anchor = `data-tour` hooks) while keeping today's trigger + persistence.

**Tech Stack:** Vanilla JS (ESM, no new dependency), Web DOM, the Vite/Capacitor mobile broadsheet (React via `useStateBSC`/`useStateBSP` aliases), `node --test` (`tests/*.mjs`).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-20-interactive-spotlight-tour-design.md`. This plan is **Phase A only** — the engine + the **mobile** rework. Phase B (website tours) is a separate later plan.
- **One engine, configurable root:** `spotlightTour.js` overlays into `opts.root` — **mobile passes `#bs-phone-surface`** (already `position:absolute`), website (Phase B) passes `document.body`. Never assume the viewport.
- **No new dependency**; house-styled (follow the `ui-ux-pro-max` skill for the dim/cutout/coachmark visuals — accent teal, mono eyebrow, serif title).
- **Guided spotlight, not action-gated:** the tour advances on Next; it never waits for the user to perform the action.
- **Degrade, never stall:** if a step's anchor is missing, fall back to the step's nav-tab element; if even that is missing, center the coachmark with no cutout. A `navigate()` error is swallowed — the step still resolves its anchor/fallback rather than being skipped.
- **Reuse trigger + persistence:** keep `bsMarkTourSeen` / `bsMarkCoachTourSeen`, `user_goals('client_onboarding'|'coach_onboarding')`, the `<24h` new-account auto-show, the `shape:startTour` replay, and the "Me → App tour" entry — only the *presentation* changes.
- **Pure logic in `.mjs`** imported by both the engine and the test; register new test files in `package.json`'s `test` script.
- **Mobile build is PowerShell-only:** `Set-Location …\mobile-app; $env:VITE_BASE='/m/'; npm run build`, then republish `public/m` from the repo root (Git Bash mangles `VITE_BASE`).
- **Branch:** `claude/dashboard-widgets` (main repo `C:/Users/cperr/shape-app`).

## File Structure

- `public/newdesign/spotlightGeom.mjs` — **create** (Task 1): pure geometry (`clamp`, `cutoutRect`, `coachmarkPos`, `stepBounds`).
- `tests/spotlight-geom.test.mjs` — **create** (Task 1): unit tests.
- `public/newdesign/spotlightTour.js` — **create** (Task 2): the engine (`startTour(steps, opts)` → dim overlay + cutout + coachmark + controls).
- `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — **modify** (Task 3): `BSOnboardingTour` → engine + the client step list + `data-tour` hooks.
- `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx` — **modify** (Task 4): `BSProOnboardingTour` → engine + coach step lists + `data-tour` hooks.
- `docs/WORKLOG.md`, `src/lib/warroom.ts` — **modify** (Task 5).

---

### Task 1: Geometry helpers (TDD)

**Files:**
- Create: `public/newdesign/spotlightGeom.mjs`
- Create: `tests/spotlight-geom.test.mjs`
- Modify: `package.json` (register the test)

**Interfaces:**
- Produces:
  - `clamp(v, lo, hi): number`
  - `cutoutRect(t: {x,y,w,h}, pad=8): {x,y,w,h}` — the spotlight hole (target inflated by `pad`).
  - `coachmarkPos(target, root, card, gap=14): {top, left, side}` — card placement in root-local coords (prefers below, else above, clamped inside root). `side` is `'below'|'above'`.
  - `stepBounds(i, total): {isFirst, isLast, canBack, canNext}`.

- [ ] **Step 1: Write the failing test** (`tests/spotlight-geom.test.mjs`):
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp, cutoutRect, coachmarkPos, stepBounds } from '../public/newdesign/spotlightGeom.mjs';

test('clamp bounds a value', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});

test('cutoutRect inflates the target by pad', () => {
  assert.deepEqual(cutoutRect({ x: 20, y: 30, w: 100, h: 40 }, 8), { x: 12, y: 22, w: 116, h: 56 });
});

test('cutoutRect never produces negative size', () => {
  const r = cutoutRect({ x: 0, y: 0, w: 0, h: 0 }, 8);
  assert.ok(r.w >= 0 && r.h >= 0);
});

test('coachmarkPos places the card below when there is room', () => {
  const target = { x: 100, y: 100, w: 80, h: 40 };
  const root = { x: 0, y: 0, w: 390, h: 800 };
  const p = coachmarkPos(target, root, { w: 280, h: 140 }, 14);
  assert.equal(p.side, 'below');
  assert.equal(p.top, 154);               // 100 + 40 + 14
  assert.equal(p.left, clamp(140 - 140, 8, 390 - 280 - 8)); // centered on target, clamped
});

test('coachmarkPos flips above when the target is near the bottom', () => {
  const target = { x: 100, y: 740, w: 80, h: 40 };
  const root = { x: 0, y: 0, w: 390, h: 800 };
  const p = coachmarkPos(target, root, { w: 280, h: 140 }, 14);
  assert.equal(p.side, 'above');
  assert.equal(p.top, clamp(740 - 14 - 140, 8, 800 - 140 - 8));
});

test('coachmarkPos clamps left edge into the root', () => {
  const target = { x: 0, y: 100, w: 30, h: 30 };
  const root = { x: 0, y: 0, w: 390, h: 800 };
  const p = coachmarkPos(target, root, { w: 280, h: 140 }, 14);
  assert.equal(p.left, 8);                // would be negative; clamped to 8
});

test('stepBounds reports first/last/back/next', () => {
  assert.deepEqual(stepBounds(0, 3), { isFirst: true, isLast: false, canBack: false, canNext: true });
  assert.deepEqual(stepBounds(1, 3), { isFirst: false, isLast: false, canBack: true, canNext: true });
  assert.deepEqual(stepBounds(2, 3), { isFirst: false, isLast: true, canBack: true, canNext: false });
});
```

- [ ] **Step 2: Register + run to verify it fails.** Append `tests/spotlight-geom.test.mjs` to the `node --test ...` list in `package.json`'s `test` script. Run `cd /c/Users/cperr/shape-app && npm test`. Expected: FAIL — cannot find `spotlightGeom.mjs`.

- [ ] **Step 3: Write the helpers** (`public/newdesign/spotlightGeom.mjs`):
```js
// Pure geometry for the spotlight tour. Imported by spotlightTour.js (the engine) AND
// tests/spotlight-geom.test.mjs. All rects are {x,y,w,h} in root-local coordinates.

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// The spotlight hole: the target inflated by `pad` on every side (size never negative).
export function cutoutRect(t, pad = 8) {
  return { x: t.x - pad, y: t.y - pad, w: Math.max(0, t.w + pad * 2), h: Math.max(0, t.h + pad * 2) };
}

// Place the coachmark card relative to the target — prefer below, flip above when there
// isn't room, and clamp inside the root.
export function coachmarkPos(target, root, card, gap = 14) {
  const below = target.y + target.h + gap;
  const above = target.y - gap - card.h;
  const fitsBelow = below + card.h <= root.h;
  const side = fitsBelow ? 'below' : (above >= 0 ? 'above' : 'below');
  const rawTop = side === 'below' ? below : above;
  const top = clamp(rawTop, 8, Math.max(8, root.h - card.h - 8));
  const left = clamp(target.x + target.w / 2 - card.w / 2, 8, Math.max(8, root.w - card.w - 8));
  return { top, left, side };
}

export function stepBounds(i, total) {
  return { isFirst: i <= 0, isLast: i >= total - 1, canBack: i > 0, canNext: i < total - 1 };
}
```

- [ ] **Step 4: Run the test to verify it passes.** `cd /c/Users/cperr/shape-app && npm test`. Expected: PASS (7 new tests; all pre-existing tests still green).

- [ ] **Step 5: Commit.**
```bash
git add public/newdesign/spotlightGeom.mjs tests/spotlight-geom.test.mjs package.json
git commit -m "feat(tour): spotlight geometry helpers (cutout + coachmark placement) + tests"
```

---

### Task 2: The spotlight engine

**Files:**
- Create: `public/newdesign/spotlightTour.js`

**Interfaces:**
- Consumes: `clamp`, `cutoutRect`, `coachmarkPos`, `stepBounds` (Task 1).
- Produces: `export function startTour(steps, opts)` and `window.SpotlightTour = { start: startTour }`.
  - `steps`: `Array<{ navigate?: () => void|Promise, anchor: () => Element|null, fallback?: () => Element|null, eyebrow?, title, body, final?: boolean, ctaLabel?: string, onCta?: () => void }>`.
  - `opts`: `{ root?: Element (default document.body), accent?: string, isLight?: boolean, onDone?: () => void }`.
  - Returns `{ destroy: () => void }`.

This is the DOM shell (verified by the mobile build + on-device, not unit tests — its math lives in Task 1).

- [ ] **Step 1: Write the engine** (`public/newdesign/spotlightTour.js`):
```js
// Interactive guided spotlight tour — framework-agnostic. Dims a root container, cuts a
// spotlight around each step's target element, and shows a coachmark with Back/Next/Skip +
// progress dots. Used by the mobile broadsheet (root = #bs-phone-surface) and the website
// (root = document.body, Phase B). Pure geometry lives in spotlightGeom.mjs.
import { cutoutRect, coachmarkPos, stepBounds } from './spotlightGeom.mjs';

const PAD = 8;

function el(tag, css, html) { const n = document.createElement(tag); if (css) n.style.cssText = css; if (html != null) n.innerHTML = html; return n; }
function waitFor(getter, ms = 1200) {
  return new Promise((res) => {
    const t0 = Date.now();
    (function tick() { let e = null; try { e = getter(); } catch (_) {} if (e) return res(e); if (Date.now() - t0 > ms) return res(null); requestAnimationFrame(tick); })();
  });
}

export function startTour(steps, opts = {}) {
  const root = opts.root || document.body;
  const accent = opts.accent || '#2ee0c4';
  const ink = opts.isLight ? '#14110d' : '#f4eedf';
  const paper = opts.isLight ? '#f4eedf' : '#1a1714';
  if (getComputedStyle(root).position === 'static') root.style.position = 'relative';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Layers: a dim box that uses a huge box-shadow as the "mask" around a transparent cutout.
  const layer = el('div', `position:absolute;inset:0;z-index:99999;`);
  const cut = el('div', `position:absolute;border-radius:12px;box-shadow:0 0 0 9999px rgba(8,10,12,0.66);transition:${reduce ? 'none' : 'all .28s cubic-bezier(.2,.7,.2,1)'};pointer-events:none`);
  const ring = el('div', `position:absolute;border-radius:14px;border:1.5px solid ${accent};box-shadow:0 0 22px -2px ${accent}88;transition:${reduce ? 'none' : 'all .28s cubic-bezier(.2,.7,.2,1)'};pointer-events:none`);
  const card = el('div', `position:absolute;width:280px;max-width:84%;background:${paper};color:${ink};border:1px solid ${accent}44;border-radius:16px;padding:18px 18px 14px;box-shadow:0 24px 60px -20px rgba(0,0,0,.7);font-family:system-ui,-apple-system,sans-serif;transition:${reduce ? 'none' : 'top .28s, left .28s'}`);
  layer.append(cut, ring, card);
  root.appendChild(layer);

  let i = 0, destroyed = false;
  const cardSize = () => ({ w: card.offsetWidth || 280, h: card.offsetHeight || 150 });

  function teardown() { if (destroyed) return; destroyed = true; layer.remove(); }
  function finish() { teardown(); if (opts.onDone) opts.onDone(); }

  async function show() {
    if (destroyed) return;
    const step = steps[i];
    try { if (step.navigate) await step.navigate(); } catch (_) {}
    if (destroyed) return;
    let target = await waitFor(step.anchor);
    if (!target && step.fallback) { try { target = step.fallback(); } catch (_) {} }
    if (destroyed) return;

    const rr = root.getBoundingClientRect();
    renderCard(step);
    if (target) {
      const b = target.getBoundingClientRect();
      const t = { x: b.left - rr.left, y: b.top - rr.top, w: b.width, h: b.height };
      const co = cutoutRect(t, PAD);
      Object.assign(cut.style, { left: co.x + 'px', top: co.y + 'px', width: co.w + 'px', height: co.h + 'px', display: 'block' });
      Object.assign(ring.style, { left: (co.x - 2) + 'px', top: (co.y - 2) + 'px', width: (co.w + 4) + 'px', height: (co.h + 4) + 'px', display: 'block' });
      const p = coachmarkPos(t, { x: 0, y: 0, w: rr.width, h: rr.height }, cardSize());
      Object.assign(card.style, { top: p.top + 'px', left: p.left + 'px' });
    } else {
      // No target → no cutout; full dim + centered card.
      cut.style.display = 'none'; ring.style.display = 'none';
      const s = cardSize();
      Object.assign(card.style, { top: Math.round(rr.height / 2 - s.h / 2) + 'px', left: Math.round(rr.width / 2 - s.w / 2) + 'px' });
    }
  }

  function renderCard(step) {
    const b = stepBounds(i, steps.length);
    const dots = steps.map((_, k) => `<span style="width:${k === i ? 18 : 6}px;height:6px;border-radius:3px;background:${k === i ? accent : ink + '40'};transition:width .2s;display:inline-block;margin-right:5px"></span>`).join('');
    const nextLabel = step.final ? (step.ctaLabel || 'Open →') : (b.isLast ? 'Done' : 'Next →');
    card.innerHTML =
      `${step.eyebrow ? `<div style="font:600 10px/1 ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase;color:${accent};margin-bottom:8px">${step.eyebrow}</div>` : ''}` +
      `<div style="font:600 19px/1.2 Georgia,serif;margin-bottom:7px">${step.title}</div>` +
      `<div style="font-size:13.5px;line-height:1.5;opacity:.82;margin-bottom:14px">${step.body}</div>` +
      `<div style="display:flex;align-items:center;justify-content:space-between">` +
        `<div>${dots}</div>` +
        `<div style="display:flex;gap:8px">` +
          `${b.canBack ? `<button data-st="back" style="background:none;border:1px solid ${ink}33;color:${ink};border-radius:999px;padding:7px 14px;font-size:12.5px;cursor:pointer">Back</button>` : ''}` +
          `<button data-st="next" style="background:${accent};border:none;color:#06231f;border-radius:999px;padding:7px 16px;font-size:12.5px;font-weight:600;cursor:pointer">${nextLabel}</button>` +
        `</div>` +
      `</div>` +
      `<button data-st="skip" aria-label="Skip" style="position:absolute;top:10px;right:12px;background:none;border:none;color:${ink};opacity:.5;font-size:18px;line-height:1;cursor:pointer">×</button>`;
    card.querySelector('[data-st="next"]').onclick = () => { if (step.final) { try { step.onCta && step.onCta(); } catch (_) {} finish(); } else if (b.isLast) finish(); else { i++; show(); } };
    const back = card.querySelector('[data-st="back"]'); if (back) back.onclick = () => { if (i > 0) { i--; show(); } };
    card.querySelector('[data-st="skip"]').onclick = finish;
  }

  const onResize = () => show();
  window.addEventListener('resize', onResize);
  const _td = teardown; teardown = () => { window.removeEventListener('resize', onResize); _td(); };

  show();
  return { destroy: teardown };
}

if (typeof window !== 'undefined') window.SpotlightTour = { start: startTour };
```

- [ ] **Step 2: Parse-check.** `cd /c/Users/cperr/shape-app && node --input-type=module --check < public/newdesign/spotlightTour.js`. Expected: no output (syntax OK). (Full behavior is verified by Task 3's mobile build + on-device.)

- [ ] **Step 3: Commit.**
```bash
git add public/newdesign/spotlightTour.js
git commit -m "feat(tour): spotlight engine (dim + cutout + coachmark + controls, configurable root)"
```

---

### Task 3: Mobile client tour → the engine

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — replace `BSOnboardingTour` (the component ~lines 253–299 + the `BS_TOUR_STEPS` data ~238–246); add `data-tour` hooks to the client tab bar (~515–521) + one hero element per screen.

**Interfaces:**
- Consumes: `startTour` from `public/newdesign/spotlightTour.js` (import cross-root via the existing Vite `server.fs.allow:['..']`, as `NoraStage`/`dashSignals` do); the existing `setTab`, `useBS()` theme `t`, `bsMarkTourSeen`, and the mount/trigger (`showTour`, `shape:startTour`) — all KEPT.

- [ ] **Step 1: Import the engine** at the top of `iosAppBroadsheetClient.jsx` (with the other cross-root imports): `import { startTour } from '../../../public/newdesign/spotlightTour.js';`

- [ ] **Step 2: Add `data-tour` hooks.** In the client **tab bar** render (~515–521), add `data-tour={'tab-' + tab.key}` to each tab button element (keys: `home`, `train`, `eat`, `chat`, `me`). Add `data-tour` to ONE hero element per screen (locate each, add the attribute to its outermost element):
  - Home: the "Today · your move" plate → `data-tour="hero-home"`.
  - Train: the session hero / Start card → `data-tour="hero-train"`.
  - Eat: the day's next-meal / Log card → `data-tour="hero-eat"`.
  - Eat → grocery: the **grocery-list entry** (the "Grocery"/"Lists" tab chip or the grocery card in the Eat section) → `data-tour="hero-grocery"`.
  - Habits page: the "Earned today" score card → `data-tour="hero-habits"`.
  - Me: the Shape Score card → `data-tour="hero-me"`.

- [ ] **Step 3: Replace `BSOnboardingTour`'s body** to call the engine. Keep the component's props (`{ onClose, onNavigate }`) and the mount site. Replace its render with a `useEffectBSC` that starts the tour once and tears it down on unmount:
```jsx
function BSOnboardingTour({ onClose, onNavigate }) {
  const t = useBS();
  useEffectBSC(() => {
    const root = document.getElementById('bs-phone-surface') || document.body;
    const q = (k) => () => root.querySelector('[data-tour="' + k + '"]');
    const go = (tab) => () => onNavigate && onNavigate(tab);
    const steps = [
      { navigate: go('home'), anchor: q('hero-home'), fallback: q('tab-home'), eyebrow: 'Welcome', title: 'Welcome to Shape.', body: "A quick tour of where everything lives — about 30 seconds." },
      { navigate: go('home'), anchor: q('hero-home'), fallback: q('tab-home'), eyebrow: 'Home', title: 'Your day, at a glance.', body: "Your next move, meals and habits — all on the home screen." },
      { navigate: go('train'), anchor: q('hero-train'), fallback: q('tab-train'), eyebrow: 'Train', title: 'Today’s session.', body: "Your workout, ready to start — coach-built, with the moves and loads." },
      { navigate: go('eat'), anchor: q('hero-eat'), fallback: q('tab-eat'), eyebrow: 'Eat', title: 'Meals & logging.', body: "Your plan for the day. Tap a meal to log it in one tap." },
      { navigate: go('eat'), anchor: q('hero-grocery'), fallback: q('tab-eat'), eyebrow: 'Grocery', title: 'Grocery lists.', body: "Your week’s meals become a shopping list, sorted by aisle — auto-built for you." },
      { navigate: go('habits'), anchor: q('hero-habits'), fallback: q('tab-me'), eyebrow: 'Habits', title: 'Daily habits.', body: "Check off the small things that add up — every one feeds your Shape Score." },
      { navigate: go('chat'), anchor: q('tab-chat'), fallback: q('tab-chat'), eyebrow: 'Chat', title: 'Coaches & community.', body: "Message your coaches and see the community feed." },
      { navigate: go('me'), anchor: q('hero-me'), fallback: q('tab-me'), eyebrow: 'You', title: 'Your Shape Score.', body: "Your profile, progress and the one number that tells the truth." },
      { navigate: go('home'), anchor: q('tab-home'), fallback: q('tab-home'), final: true, ctaLabel: 'Open Shape Radio →', eyebrow: 'Last stop', title: '🎵 Shape Radio.', body: "Ad-free workout mixes, curated by BPM. Free with your membership.", onCta: () => { window.location.href = '/m/Radio.html'; } },
    ];
    const tour = startTour(steps, { root, accent: t.ACCENT, isLight: t.isLight, onDone: () => { bsMarkTourSeen(); onClose && onClose(); } });
    return () => tour.destroy();
  }, []);
  return null;
}
```
(Use the file's real hook aliases — `useEffectBSC`/`useBS`. For the Habits step, `go('habits')` must hit whatever opens the habits page on this shell — if habits isn't a top-level `setTab` value, navigate to its real entry, e.g. the Me→Habits route or the home habits card handler; locate it and use the correct call. The Radio `onCta` href must match the real `/m/` Radio page filename — confirm it is `Radio.html`.)

- [ ] **Step 4: Build + verify.** Parse-check: `cd /c/Users/cperr/shape-app && node -e "require('@babel/parser').parse(require('fs').readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"` → no output. Then (PowerShell tool): `Set-Location C:\Users\cperr\shape-app\mobile-app; $env:VITE_BASE='/m/'; npm run build` (~3–5 min) and `Set-Location C:\Users\cperr\shape-app; Remove-Item -Recurse -Force public/m; Copy-Item -Recurse mobile-app/dist public/m`. Expected: build succeeds (proves the cross-root `spotlightTour.js` + `spotlightGeom.mjs` bundle). On-device/preview: launch the client app, trigger the tour (new account or fire `shape:startTour`) → the screen dims, each step spotlights the right tab/hero, Next walks through, the Radio finale opens Radio.

- [ ] **Step 5: Commit.**
```bash
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx public/m
git commit -m "feat(tour): mobile client spotlight tour (engine + steps + data-tour hooks + Radio finale)"
```

---

### Task 4: Mobile coach tours → the engine

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx` — replace `BSProOnboardingTour` (~949–996 + `bsProTourSteps` ~909–918); add `data-tour` hooks to the coach tab bars (trainer ~1133–1137, nutritionist ~4021–4025) + one hero per coach screen.

**Interfaces:**
- Consumes: `startTour` from `public/newdesign/spotlightTour.js`; the existing `onNavigate`/`setTab`, `bsProAccent(t, role)`, `bsMarkCoachTourSeen`, role/`plansKey` props, and the mount/trigger — all KEPT.

- [ ] **Step 1: Import the engine** at the top of `iosAppBroadsheetPros.jsx`: `import { startTour } from '../../../public/newdesign/spotlightTour.js';`

- [ ] **Step 2: Add `data-tour` hooks** to the coach tab bars: `data-tour={'tab-' + tab.key}` on each tab button (trainer keys: `today`,`clients`,`programs`,`chat`,`me`; nutritionist: `today`,`clients`,`plans`,`chat`,`me`). Add one hero hook per screen: Today → the triage/"who needs you" lead `data-tour="hero-today"`; Clients → the roster header `data-tour="hero-clients"`; Plans → the catalogue/"build & sell" card `data-tour="hero-plans"`; Me → the coach Shape Score card `data-tour="hero-me"`.

- [ ] **Step 3: Replace `BSProOnboardingTour`'s body** to call the engine (role-aware accent + `plansKey`), keeping props `{ onClose, onNavigate, role='trainer', plansKey='plans' }`:
```jsx
function BSProOnboardingTour({ onClose, onNavigate, role = 'trainer', plansKey = 'plans' }) {
  const t = useBS();
  useEffectBSP(() => {
    const root = document.getElementById('bs-phone-surface') || document.body;
    const q = (k) => () => root.querySelector('[data-tour="' + k + '"]');
    const go = (tab) => () => onNavigate && onNavigate(tab);
    const plansLabel = plansKey === 'programs' ? 'Programs' : 'Plans';
    const steps = [
      { navigate: go('today'), anchor: q('hero-today'), fallback: q('tab-today'), eyebrow: 'Welcome', title: 'Your coaching tools.', body: "A quick tour of your dashboard — about 30 seconds." },
      { navigate: go('today'), anchor: q('hero-today'), fallback: q('tab-today'), eyebrow: 'Today', title: 'Who needs you.', body: "Your day leads with the clients who need attention first." },
      { navigate: go('clients'), anchor: q('hero-clients'), fallback: q('tab-clients'), eyebrow: 'Clients', title: 'Your roster.', body: "Every client, sorted by who’s on track and who’s slipping." },
      { navigate: go(plansKey), anchor: q('hero-plans'), fallback: q('tab-' + plansKey), eyebrow: plansLabel, title: 'Build & sell.', body: "Create " + plansLabel.toLowerCase() + ", assign them to clients, and sell them in the marketplace." },
      { navigate: go('chat'), anchor: q('tab-chat'), fallback: q('tab-chat'), eyebrow: 'Chat', title: 'Stay in touch.', body: "Message clients and co-coaches; see the community." },
      { navigate: go('me'), anchor: q('hero-me'), fallback: q('tab-me'), eyebrow: 'You', title: 'Your standing.', body: "Your coach profile, payouts and Shape Score." },
    ];
    const tour = startTour(steps, { root, accent: bsProAccent(t, role), isLight: t.isLight, onDone: () => { bsMarkCoachTourSeen(); onClose && onClose(); } });
    return () => tour.destroy();
  }, [role, plansKey]);
  return null;
}
```
(Use the file's real `useEffectBSP`/`useBS` aliases. Confirm `bsProAccent` is in scope here.)

- [ ] **Step 4: Build + verify.** Parse-check `iosAppBroadsheetPros.jsx` (babel, jsx). PowerShell build + republish `public/m` (as Task 3 Step 4). On-device: trigger the trainer AND nutritionist tours → role-accented spotlight walks the coach tabs.

- [ ] **Step 5: Commit.**
```bash
git add mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx public/m
git commit -m "feat(tour): mobile coach spotlight tours (trainer + nutritionist, role-accented)"
```

---

### Task 5: Ship — WORKLOG + War Room

**Files:**
- Modify: `docs/WORKLOG.md`, `src/lib/warroom.ts`

- [ ] **Step 1: WORKLOG entry** (top of `## Changelog`, 2026-06-20): the mobile app tour is now an **interactive spotlight walkthrough** — `spotlightTour.js` engine (dim + cutout + coachmark, configurable root, TDD'd geometry) replacing the float-a-card `BSOnboardingTour`/`BSProOnboardingTour`; client tour adds grocery + habits steps and a **Shape Radio finale**; reuses the existing trigger/persistence; `data-tour` hooks on the tabs + heroes. Note Phase B (website tours) is next. Monochrome emoji only.

- [ ] **Step 2: War Room** (`src/lib/warroom.ts`): add a checklist item under the client-surfaces/onboarding section — "Interactive spotlight tour (mobile, Phase A): client + coach guided walkthroughs + Radio finale" status `done`; add "spotlight tour — website dashboards (Phase B)" as `pending`. No new API route.

- [ ] **Step 3: Typecheck + commit.** `cd /c/Users/cperr/shape-app && npx tsc --noEmit` (clean). Then:
```bash
git add docs/WORKLOG.md src/lib/warroom.ts
git commit -m "docs(tour): WORKLOG + War Room — interactive spotlight tour (mobile, Phase A)"
```

---

## Self-review notes (done while writing)

- **Spec coverage:** the engine (Tasks 1–2) + the mobile rework for client (Task 3) and coach (Task 4) with the exact page lists incl. grocery, habits, and the Radio finale; trigger/persistence reused; degradation via the `fallback` anchor; ship docs (Task 5). The website tours (spec §4 web lists, §3 website adapter) are correctly deferred to Phase B.
- **Configurable root:** the engine takes `opts.root`; the mobile adapters pass `#bs-phone-surface` — satisfying the "never assume the viewport" constraint.
- **Type consistency:** `startTour(steps, opts)`, the step shape (`navigate`/`anchor`/`fallback`/`final`/`ctaLabel`/`onCta`), and the geom signatures (`cutoutRect`/`coachmarkPos`/`stepBounds`) are used identically across the engine and both adapters.
- **Locator tasks, not placeholders:** the `data-tour` hero hooks are described by their real on-screen element + key; the implementer tags the exact node (the file is 17k+ lines, so a symbol/description is more durable than a line number). The two confirmations flagged inline (the Habits navigation call + the `/m/Radio.html` filename) are real lookups, not hand-waves.
