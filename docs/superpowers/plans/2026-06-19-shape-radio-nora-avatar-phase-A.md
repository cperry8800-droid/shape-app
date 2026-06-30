# Shape Radio — Nora avatar, Phase A: real-time engine + watch screen (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the client-side real-time engine that renders a 3D Nora avatar reacting live to Shape Radio's audio, shown in a watch screen on both the web and mobile players — against a placeholder VRM, behind a manual "preview" toggle.

**Architecture:** A pure audio-reactive driver (`noraReactive.mjs`, unit-tested) maps frequency data → rig parameters; a `NoraStage` module (`noraStage.mjs`, Three.js + `@pixiv/three-vrm`) loads a VRM, attaches to an existing `AnalyserNode`, and runs a 30 fps render loop applying those params. The web player (`radio.html`) reuses its existing Web Audio analyser; the mobile player builds one from `ShapeRadioLive.audio()`. Both gate the stage behind a preview toggle.

**Tech Stack:** Three.js + `@pixiv/three-vrm` (WebGL), Web Audio API, vanilla JS (`radio.html`, ESM import map), Vite mobile app (Capacitor WebView), `node --test` (`tests/*.mjs`).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-19-shape-radio-nora-avatar-dj-design.md`. This plan is **Phase A only** — the engine + watch screen on a **placeholder VRM**, behind a **manual preview toggle**. Phase B (the `nora_sets` schedule + `/api/radio/nora-sets`) and Phase C (the real Nora model) are separate later plans.
- **Builds on Phase 1:** the audio source is the existing Phase 1 stream player — web `<audio id="radioAudio">` + its analyser; mobile `window.ShapeRadioLive.audio()`. Do not add a second audio element.
- **One `MediaElementSourceNode` per `<audio>`:** creating a second `createMediaElementSource` on the same element throws. On web, **reuse** `radio.html`'s existing analyser; on mobile, create the source/analyser **once** and cache it.
- **Enhancement layer, never a dependency:** if WebGL is unavailable or the VRM fails to load, the watch screen falls back to a featured image; the audio radio keeps working.
- **Pure logic in `.mjs`** imported by both `noraStage.mjs` and the test; register new test files in `package.json`'s `test` script (pattern: `src/lib/compliance/nutrition.mjs`).
- **Pin dependency versions** (Three + three-vrm) — same version on web (import map) and mobile (npm).
- **Placeholder VRM** is a CC0 sample, vendored, to be swapped in Phase C.
- **On-device verification is deferred** (no WebGL/device in this environment): tasks verify via build success + import/parse resolution + the unit tests; the visual render is checked on a device later.
- **House style:** the watch-screen UI (badge, controls, fallback) follows the worktree's `ui-ux-pro-max` skill + Shape's instrument-plate house style.
- **Branch:** all work on `claude/shape-radio-nora-dj` (worktree `C:/Users/cperr/shape-radio-wt`).

## File Structure

- `mobile-app/package.json` — **modify** (Task 1): add `three` + `@pixiv/three-vrm` deps.
- `public/nora/placeholder.vrm` + `mobile-app/public/nora/placeholder.vrm` — **create** (Task 1): the CC0 placeholder model (served at `/nora/placeholder.vrm` and `/m/nora/placeholder.vrm`).
- `public/newdesign/noraReactive.mjs` — **create** (Task 2): the pure driver (`computeBands`, `computeRigParams`).
- `tests/nora-reactive.test.mjs` — **create** (Task 2): unit tests.
- `public/newdesign/noraStage.mjs` — **create** (Task 3): the `NoraStage` Three.js/VRM renderer.
- `public/radio.html` — **modify** (Task 4): the web watch screen (canvas + preview toggle + import map), reusing the existing analyser.
- `mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx` + `mobile-app/src/services/shapeBackend.js` — **modify** (Task 5): the mobile watch screen + a cached analyser on `ShapeRadioLive`.
- `docs/WORKLOG.md`, `src/lib/warroom.ts` — **modify** (Task 6).

---

### Task 1: Dependencies + placeholder VRM

**Files:**
- Modify: `mobile-app/package.json` (dependencies)
- Create: `public/nora/placeholder.vrm`, `mobile-app/public/nora/placeholder.vrm`

**Interfaces:**
- Produces: the npm deps `three` + `@pixiv/three-vrm` (mobile build) and a placeholder VRM served at `/nora/placeholder.vrm` (web) and `/m/nora/placeholder.vrm` (mobile).

- [ ] **Step 1: Add the mobile deps.** In `mobile-app/package.json`, add to `dependencies` (pin these exact versions): `"three": "0.169.0"` and `"@pixiv/three-vrm": "3.1.6"`. Then install: `cd /c/Users/cperr/shape-radio-wt/mobile-app && npm install three@0.169.0 @pixiv/three-vrm@3.1.6`. Expected: installs without peer-dep errors (three-vrm 3.x supports three 0.169).

- [ ] **Step 2: Vendor a CC0 placeholder VRM.** Download a permissively-licensed sample humanoid VRM and save it to BOTH `public/nora/placeholder.vrm` and `mobile-app/public/nora/placeholder.vrm`. Source: the official three-vrm sample `https://raw.githubusercontent.com/pixiv/three-vrm/v3.1.6/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm` (a VRM 1.0 sample model). Command:
```bash
mkdir -p /c/Users/cperr/shape-radio-wt/public/nora /c/Users/cperr/shape-radio-wt/mobile-app/public/nora
curl -L -o /c/Users/cperr/shape-radio-wt/public/nora/placeholder.vrm "https://raw.githubusercontent.com/pixiv/three-vrm/v3.1.6/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm"
cp /c/Users/cperr/shape-radio-wt/public/nora/placeholder.vrm /c/Users/cperr/shape-radio-wt/mobile-app/public/nora/placeholder.vrm
```
Verify both files exist and are non-trivial (`ls -l` shows > 1 MB). If the download fails (network), use any other CC0/VRM-1.0 sample and note the source in the commit.

- [ ] **Step 3: Commit.**
```bash
git -C /c/Users/cperr/shape-radio-wt add mobile-app/package.json mobile-app/package-lock.json public/nora/placeholder.vrm mobile-app/public/nora/placeholder.vrm
git -C /c/Users/cperr/shape-radio-wt commit -m "feat(nora): add three + three-vrm deps and a placeholder VRM"
```

---

### Task 2: The pure audio-reactive driver (TDD)

**Files:**
- Create: `public/newdesign/noraReactive.mjs`
- Create: `tests/nora-reactive.test.mjs`
- Modify: `package.json` (register the test)

**Interfaces:**
- Produces:
  - `computeBands(freq: Uint8Array): { low, mid, high, level }` — each `0..1`.
  - `computeRigParams(bands, tMs: number): { headBob, spineSway, armRaise, handBounce, expression, blink }` — bounded targets.

- [ ] **Step 1: Write the failing test** (`tests/nora-reactive.test.mjs`):
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeBands, computeRigParams } from '../public/newdesign/noraReactive.mjs';

test('computeBands: silence → all zero', () => {
  assert.deepEqual(computeBands(new Uint8Array(64)), { low: 0, mid: 0, high: 0, level: 0 });
});

test('computeBands: bass-only → high low-band, zero high-band', () => {
  const f = new Uint8Array(100);
  for (let i = 0; i < 10; i++) f[i] = 255;   // bottom 10% = low band
  const b = computeBands(f);
  assert.ok(b.low > 0.9, 'low near 1');
  assert.equal(b.high, 0, 'high is 0');
  assert.ok(b.level > 0 && b.level < 0.2, 'overall level small');
});

test('computeBands: empty input is safe', () => {
  assert.deepEqual(computeBands(new Uint8Array(0)), { low: 0, mid: 0, high: 0, level: 0 });
});

test('computeRigParams: outputs are bounded', () => {
  const p = computeRigParams({ low: 1, mid: 1, high: 1, level: 1 }, 0);
  assert.ok(p.headBob >= -0.5 && p.headBob <= 0.5);
  assert.ok(p.spineSway >= -0.4 && p.spineSway <= 0.4);
  assert.ok(p.armRaise >= 0 && p.armRaise <= 1);
  assert.ok(p.handBounce >= 0 && p.handBounce <= 1);
  assert.ok(p.expression >= 0 && p.expression <= 1);
});

test('computeRigParams: blink fires early in the 4s cycle, not mid-cycle', () => {
  assert.equal(computeRigParams({}, 50).blink, 1);
  assert.equal(computeRigParams({}, 500).blink, 0);
});

test('computeRigParams: null bands is safe', () => {
  assert.equal(typeof computeRigParams(null, 0).headBob, 'number');
});
```

- [ ] **Step 2: Register + run to verify it fails.** Append `tests/nora-reactive.test.mjs` to the `node --test ...` file list in `package.json`'s `test` script. Run `cd /c/Users/cperr/shape-radio-wt && npm test`. Expected: FAIL — cannot find `../public/newdesign/noraReactive.mjs`.

- [ ] **Step 3: Write the driver** (`public/newdesign/noraReactive.mjs`):
```js
// Pure audio-reactive driver for the Nora avatar. Imported by noraStage.mjs (the render
// loop) AND tests/nora-reactive.test.mjs. No DOM / Three / Web-Audio here — just math,
// so it is fully unit-testable. The render loop smooths toward these target params.

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// Split an AnalyserNode byte-frequency array (0..255 per bin) into low/mid/high band
// energies + an overall level, each normalized to 0..1.
export function computeBands(freq) {
  const n = freq ? freq.length : 0;
  if (!n) return { low: 0, mid: 0, high: 0, level: 0 };
  const lowEnd = Math.floor(n * 0.10);
  const midEnd = Math.floor(n * 0.40);
  let ls = 0, ms = 0, hs = 0, all = 0;
  for (let i = 0; i < n; i++) {
    const v = freq[i] / 255;
    all += v;
    if (i < lowEnd) ls += v;
    else if (i < midEnd) ms += v;
    else hs += v;
  }
  const lowN = lowEnd || 1, midN = (midEnd - lowEnd) || 1, highN = (n - midEnd) || 1;
  return { low: ls / lowN, mid: ms / midN, high: hs / highN, level: all / n };
}

// Map bands + a time (ms) to bounded rig parameter TARGETS. tMs drives idle motion (sway,
// blink) so Nora still feels alive in near-silence.
export function computeRigParams(bands, tMs) {
  const { low = 0, mid = 0, high = 0, level = 0 } = bands || {};
  const t = (tMs || 0) / 1000;
  const sway = Math.sin(t * 1.2);
  const bob = Math.sin(t * 2.0);
  const blink = ((tMs || 0) % 4000) < 120 ? 1 : 0;   // ~120ms blink every 4s
  return {
    headBob: clamp(low * 0.6 + bob * 0.05, -0.5, 0.5),     // head pitch (rad-ish target)
    spineSway: clamp(sway * 0.08 + mid * 0.15, -0.4, 0.4), // spine roll
    armRaise: clamp(mid * 0.7 + high * 0.3, 0, 1),         // 0..1 arms/hands up
    handBounce: clamp(high * 0.8 + low * 0.2, 0, 1),
    expression: clamp(level * 1.2, 0, 1),                  // joy intensity 0..1
    blink,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes.** `cd /c/Users/cperr/shape-radio-wt && npm test`. Expected: PASS (6 new tests green, all pre-existing tests still green).

- [ ] **Step 5: Commit.**
```bash
git -C /c/Users/cperr/shape-radio-wt add public/newdesign/noraReactive.mjs tests/nora-reactive.test.mjs package.json
git -C /c/Users/cperr/shape-radio-wt commit -m "feat(nora): pure audio-reactive driver (computeBands + computeRigParams) + tests"
```

---

### Task 3: The `NoraStage` renderer

**Files:**
- Create: `public/newdesign/noraStage.mjs`

**Interfaces:**
- Consumes: `computeBands`, `computeRigParams` (Task 2); the deps `three`, `three/addons/loaders/GLTFLoader.js`, `@pixiv/three-vrm` (Task 1).
- Produces: `class NoraStage { constructor({canvas, analyser, modelUrl}); async load(); start(); stop(); dispose() }`.

This is the untestable Three.js shell — on-device visual verification is deferred. The gate here is that it imports/parses cleanly and the API is exactly as specified (Tasks 4–5 depend on it).

- [ ] **Step 1: Write the renderer** (`public/newdesign/noraStage.mjs`):
```js
// Real-time Nora avatar stage. Loads a VRM, attaches to an existing AnalyserNode, and runs
// a 30 fps render loop driving the rig from the pure driver. Framework-agnostic ESM so both
// the web page (import map) and the mobile Vite app can load it. WebGL — verified on-device.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { computeBands, computeRigParams } from './noraReactive.mjs';

const FRAME_MS = 1000 / 30;

export class NoraStage {
  constructor({ canvas, analyser, modelUrl }) {
    this.canvas = canvas;
    this.analyser = analyser;                 // an existing AnalyserNode (caller owns the audio graph)
    this.modelUrl = modelUrl;
    this.vrm = null;
    this._raf = 0;
    this._last = 0;
    this._clock = new THREE.Clock();
    this._freq = new Uint8Array(analyser ? analyser.frequencyBinCount : 256);

    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    this._resize();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, this._aspect(), 0.1, 20);
    this.camera.position.set(0, 1.3, 2.2);     // framed bust-to-decks
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(1, 2, 2);
    const fill = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(key, fill);
  }

  _aspect() { return (this.canvas.clientWidth || 1) / (this.canvas.clientHeight || 1); }
  _resize() {
    const w = this.canvas.clientWidth || 300, h = this.canvas.clientHeight || 400;
    this.renderer.setSize(w, h, false);
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  }

  async load() {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(this.modelUrl);
    const vrm = gltf.userData.vrm;
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    vrm.scene.rotation.y = Math.PI;            // face the camera
    this.scene.add(vrm.scene);
    this.vrm = vrm;
    return vrm;
  }

  start() {
    if (this._raf) return;
    const loop = (now) => {
      this._raf = requestAnimationFrame(loop);
      if (now - this._last < FRAME_MS) return; // 30 fps cap
      this._last = now;
      const dt = this._clock.getDelta();
      if (this.analyser) this.analyser.getByteFrequencyData(this._freq);
      const params = computeRigParams(computeBands(this._freq), now);
      this._apply(params);
      if (this.vrm) this.vrm.update(dt);
      this.renderer.render(this.scene, this.camera);
    };
    this._raf = requestAnimationFrame(loop);
  }

  _apply(p) {
    const vrm = this.vrm; if (!vrm) return;
    const h = vrm.humanoid;
    const head = h && h.getNormalizedBoneNode('head');
    const spine = h && h.getNormalizedBoneNode('spine');
    const lUpper = h && h.getNormalizedBoneNode('leftUpperArm');
    const rUpper = h && h.getNormalizedBoneNode('rightUpperArm');
    if (head) head.rotation.x = p.headBob * 0.4;
    if (spine) spine.rotation.z = p.spineSway;
    // Arms rest down at ~|1.2| rad on Z; raise toward the decks as armRaise→1.
    if (lUpper) lUpper.rotation.z = 1.2 - p.armRaise * 0.5;
    if (rUpper) rUpper.rotation.z = -1.2 + p.armRaise * 0.5;
    const em = vrm.expressionManager;
    if (em) {
      em.setValue('happy', p.expression);
      em.setValue('blink', p.blink);
    }
  }

  stop() { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; } }

  dispose() {
    this.stop();
    if (this.vrm) { VRMUtils.deepDispose(this.vrm.scene); this.vrm = null; }
    this.renderer.dispose();
  }
}
```

- [ ] **Step 2: Verify it parses + resolves imports.** Syntax-check (Bash): `cd /c/Users/cperr/shape-radio-wt && node -e "require('@babel/parser').parse(require('fs').readFileSync('public/newdesign/noraStage.mjs','utf8'),{sourceType:'module',plugins:[]}); console.log('parses')"`. Expected: `parses`. (Full import resolution is verified when Task 5's Vite build bundles it.)

- [ ] **Step 3: Commit.**
```bash
git -C /c/Users/cperr/shape-radio-wt add public/newdesign/noraStage.mjs
git -C /c/Users/cperr/shape-radio-wt commit -m "feat(nora): NoraStage renderer (Three.js + three-vrm, 30fps audio-reactive loop)"
```

---

### Task 4: Web watch screen (`public/radio.html`)

**Files:**
- Modify: `public/radio.html`

**Interfaces:**
- Consumes: `NoraStage` (Task 3); `radio.html`'s existing `analyser` (module-scope, created in `ensureAudioGraph` at ~line 435–451); the placeholder VRM at `/nora/placeholder.vrm`.

The Phase-1 page already builds a Web Audio graph: `ensureAudioGraph()` (~line 435) creates `audioCtx` + `analyser` from `createMediaElementSource(audio)`. **Reuse that `analyser`** — do NOT create a second source (it throws). Follow the `ui-ux-pro-max` house style for the badge/controls/fallback.

- [ ] **Step 1: Add the ESM import map** in `<head>` (so the module's bare `three`/`@pixiv/three-vrm` specifiers resolve to a pinned CDN ESM build):
```html
<script type="importmap">
{ "imports": {
  "three": "https://esm.sh/three@0.169.0",
  "three/addons/": "https://esm.sh/three@0.169.0/examples/jsm/",
  "@pixiv/three-vrm": "https://esm.sh/@pixiv/three-vrm@3.1.6?deps=three@0.169.0"
} }
</script>
```

- [ ] **Step 2: Add the stage canvas + a preview toggle** to the radio markup (inside the radio content area, above the now-playing block). Style per house style (full-bleed canvas, a "● LIVE · NORA (preview)" badge, hidden by default):
```html
<div id="noraWrap" style="display:none;position:relative;width:100%;aspect-ratio:3/4;max-height:60vh;border-radius:14px;overflow:hidden;background:#0b0d10;">
  <canvas id="noraStage" style="width:100%;height:100%;display:block;"></canvas>
  <div style="position:absolute;top:10px;left:10px;font:600 11px/1 system-ui;letter-spacing:.12em;color:#2ee0c4;">● LIVE · NORA <span style="opacity:.6">(preview)</span></div>
  <img id="noraFallback" src="/nora-avatar.png" alt="Nora" style="display:none;position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" />
</div>
<button id="noraToggle" type="button" style="margin:10px auto;display:block;">Watch Nora live (preview)</button>
```

- [ ] **Step 3: Wire the toggle** in the page script (near the end of the main `<script type="module">` — convert the main script to `type="module"` if it isn't, or add a new module script). Reuse the existing `analyser`; build the stage lazily; fall back to the image on any failure:
```js
import { NoraStage } from '/newdesign/noraStage.mjs';
let noraStage = null;
const noraWrap = document.getElementById('noraWrap');
const noraToggle = document.getElementById('noraToggle');
const noraFallback = document.getElementById('noraFallback');

async function openNora() {
  noraWrap.style.display = 'block';
  noraToggle.textContent = 'Hide Nora';
  ensureAudioGraph();                 // existing Phase-1 fn: creates audioCtx + analyser
  if (audioCtx && audioCtx.state === 'suspended') { try { await audioCtx.resume(); } catch (e) {} }
  if (!window.WebGLRenderingContext) { noraFallback.style.display = 'block'; return; }
  try {
    noraStage = new NoraStage({ canvas: document.getElementById('noraStage'), analyser, modelUrl: '/nora/placeholder.vrm' });
    await noraStage.load();
    noraStage.start();
  } catch (e) {
    console.warn('[nora] stage failed, showing fallback', e);
    if (noraStage) { noraStage.dispose(); noraStage = null; }
    noraFallback.style.display = 'block';
  }
}
function closeNora() {
  noraToggle.textContent = 'Watch Nora live (preview)';
  noraWrap.style.display = 'none';
  noraFallback.style.display = 'none';
  if (noraStage) { noraStage.dispose(); noraStage = null; }
}
noraToggle.addEventListener('click', () => (noraStage || noraFallback.style.display === 'block') ? closeNora() : openNora());
```
(If the page's main script is a classic `<script>`, keep `ensureAudioGraph`/`analyser`/`audioCtx` reachable — they are already module-scope `var`s — and place this in a `<script type="module">` that references them via `window`, OR migrate the main script to a module. Pick whichever keeps `analyser` reachable; document the choice in the commit.)

- [ ] **Step 4: Verify.** Extract the page's module script(s) and `node --check` them for syntax (browser globals are fine). Confirm the import map + the `/newdesign/noraStage.mjs` + `/nora/placeholder.vrm` paths are correct relative to the served root. Live WebGL render is verified on-device later (deferred).

- [ ] **Step 5: Commit.**
```bash
git -C /c/Users/cperr/shape-radio-wt add public/radio.html
git -C /c/Users/cperr/shape-radio-wt commit -m "feat(nora): web watch screen — NoraStage preview toggle reusing the radio analyser"
```

---

### Task 5: Mobile watch screen

**Files:**
- Modify: `mobile-app/src/services/shapeBackend.js` (a cached analyser on `ShapeRadioLive`)
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx` (the watch UI in `BSRadioScreen`)

**Interfaces:**
- Consumes: `NoraStage` (Task 3); `window.ShapeRadioLive.audio()` (Phase 1); the placeholder at `/m/nora/placeholder.vrm`.
- Produces: `window.ShapeRadioLive.analyser()` — returns a cached `AnalyserNode` built once from the radio audio element.

- [ ] **Step 1: Add a cached analyser to `ShapeRadioLive`** in `shapeBackend.js` (inside the existing `ShapeRadioLive` IIFE). Create the `AudioContext` + `MediaElementSource` + `AnalyserNode` ONCE (a second source on the same element throws), cache them:
```js
let _ac = null, _analyser = null, _srcWired = false;
function analyser() {
  const a = audio();                       // the existing cached <audio> element
  if (!_ac) { const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return null; _ac = new Ctx(); }
  if (_ac.state === 'suspended') { _ac.resume().catch(() => {}); }
  if (!_analyser) { _analyser = _ac.createAnalyser(); _analyser.fftSize = 512; }
  if (!_srcWired) { try { const s = _ac.createMediaElementSource(a); s.connect(_analyser); _analyser.connect(_ac.destination); _srcWired = true; } catch (e) {} }
  return _analyser;
}
```
Add `analyser` to the returned `window.ShapeRadioLive = { ... , analyser }`.

- [ ] **Step 2: Add the watch UI to `BSRadioScreen`** in `iosAppBroadsheetRadio.jsx`. Import the stage + add a canvas + a "Watch Nora (preview)" toggle (house style). At the top of the module, add the import: `import { NoraStage } from '../../../public/newdesign/noraStage.mjs';` (Vite resolves cross-root via the existing `server.fs.allow:['..']`; it bundles `three`/`three-vrm` from npm). In `BSRadioScreen`, add state + a `<canvas ref>` + the toggle handler:
```jsx
const [noraOn, setNoraOn] = useStateBR(false);
const noraCanvasRef = useRefBR(null);
const noraStageRef = useRefBR(null);
const toggleNora = async () => {
  if (noraOn) { if (noraStageRef.current) { noraStageRef.current.dispose(); noraStageRef.current = null; } setNoraOn(false); return; }
  setNoraOn(true);
  try {
    const an = window.ShapeRadioLive?.analyser?.();
    const st = new NoraStage({ canvas: noraCanvasRef.current, analyser: an, modelUrl: '/m/nora/placeholder.vrm' });
    await st.load(); st.start(); noraStageRef.current = st;
  } catch (e) { console.warn('[nora] stage failed', e); }
};
useEffectBR(() => () => { if (noraStageRef.current) noraStageRef.current.dispose(); }, []);
```
Render the canvas (shown when `noraOn`) + the toggle button, styled to the house style; keep the existing now-playing + controls. Use the file's real hook aliases (`useStateBR`, `useRefBR`, `useEffectBR` — confirm the ref/effect alias names by reading the imports).

- [ ] **Step 3: Build + verify.** Parse-check both files (`node -e` babel parse, jsx plugin for the `.jsx`). Then (PowerShell tool — Git Bash mangles VITE_BASE): `Set-Location C:\Users\cperr\shape-radio-wt\mobile-app; $env:VITE_BASE='/m/'; npm run build` (allow ~5 min — this is the real check that `three`/`three-vrm`/`noraStage.mjs` bundle). Then `Set-Location C:\Users\cperr\shape-radio-wt; Remove-Item -Recurse -Force public/m; Copy-Item -Recurse mobile-app/dist public/m`. Expected: build succeeds (note bundle-size warnings — acceptable; the stage is heavy).

- [ ] **Step 4: Commit.**
```bash
git -C /c/Users/cperr/shape-radio-wt add mobile-app/src/services/shapeBackend.js mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx public/m
git -C /c/Users/cperr/shape-radio-wt commit -m "feat(nora): mobile watch screen — NoraStage preview off the radio analyser"
```

---

### Task 6: WORKLOG + War Room

**Files:**
- Modify: `docs/WORKLOG.md`, `src/lib/warroom.ts`

- [ ] **Step 1: WORKLOG entry** (top of `## Changelog`, 2026-06-19): Shape Radio Nora avatar **Phase A** — the `noraReactive.mjs` pure driver (tested), the `NoraStage` Three.js/`three-vrm` renderer, and the watch-screen **preview toggle** in the web + mobile players, on a **placeholder VRM** reacting to the Phase 1 stream. Note: behind a manual preview toggle (Phase B adds the `nora_sets` schedule); on-device WebGL render not yet verified; the real Nora model is Phase C. Monochrome emoji only.

- [ ] **Step 2: War Room** (`src/lib/warroom.ts`): add a checklist item under the radio section — "Shape Radio — Nora avatar engine (Phase A): real-time audio-reactive VRM stage + watch-screen preview (web + mobile), placeholder model" status `done`; plus `manual`/`pending` items for "procure the real Nora VRM (Phase C)" and "on-device WebGL verification". No new API route (Phase A adds none).

- [ ] **Step 3: Typecheck + commit.** `cd /c/Users/cperr/shape-radio-wt && npx tsc --noEmit` (clean). Then:
```bash
git -C /c/Users/cperr/shape-radio-wt add docs/WORKLOG.md src/lib/warroom.ts
git -C /c/Users/cperr/shape-radio-wt commit -m "docs(nora): WORKLOG + War Room — Nora avatar Phase A (engine + watch preview)"
```

---

## Self-review notes (done while writing)

- **Spec coverage:** Phase A = subsystem #2 (runtime: Tasks 2–3) + the watch-screen slice of #3 (Tasks 4–5) on a placeholder VRM behind a manual toggle, per the spec's Phase A. Subsystem #1 (real VRM) is Phase C; the `nora_sets` schedule/route is Phase B — both correctly excluded. The degradation (featured image on WebGL failure / load failure) is in Tasks 4–5. The 30 fps cap + teardown are in Task 3 + the toggle handlers.
- **Audio-source gotcha handled:** web reuses the existing analyser (Task 4); mobile builds + caches one (Task 5 Step 1) — neither creates a second `MediaElementSource`.
- **Type consistency:** `NoraStage({canvas, analyser, modelUrl})` + `load()/start()/stop()/dispose()` and `computeBands`/`computeRigParams` signatures are identical across Tasks 2–5.
- **Deferred honestly:** on-device WebGL render is not verifiable here; the gates are the unit tests (driver), parse/import resolution, and the Vite build (which proves three/three-vrm/noraStage bundle). Flagged in Global Constraints + Task 6.
