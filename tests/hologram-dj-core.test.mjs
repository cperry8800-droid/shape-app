// THE HOLOGRAM DJ'S PURE CORE: THE BEAT, THE GLITCH SCHEDULE, THE PALETTE, THE RIG.
//
// WHY THIS FILE EXISTS: the hologram DJ (Settings → Light effects → Hologram)
// draws over EVERY screen for as long as Shape Radio plays. Three things about it
// cannot be seen on a screenshot and are pinned here instead:
//   - it never flashes faster than the music allows (the glitch schedule);
//   - its lines stay readable as light on dark paper and stay LIGHTER than the
//     text they cross on light paper, for every tint the picker offers;
//   - nothing it draws lands below the floor it stands on (the tab bar's top
//     edge), and it stays right of the screen's text column.
// The redesign (2026-10-06) is in mobile-app/src/broadsheet/iosAppHologramDJ.jsx;
// these rules live in mobile-app/src/services/hologramDj.mjs so Node can drive them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORE = join(ROOT, 'mobile-app', 'src', 'services', 'hologramDj.mjs');
const C = await import(CORE);
const SRC = readFileSync(CORE, 'utf8');

// Every colour the Settings picker offers (iosAppBroadsheetClient.jsx, the fx
// Color grid), plus the extremes a theme accent could hand over.
const PICKER = ['#0ac5a8', '#e37a5a', '#d9b26a', '#8c6fa8', '#5b8df9', '#f2749f', '#f2ede4'];
const EXTREMES = ['#ffffff', '#000000', '#808080', '#14181c'];
const contrasts = (hex, grounds) => grounds.map((g) => C.holoContrast(C.holoRgb(hex), C.holoRgb(g)));

test('the core is pure: no window, no DOM, no clock, no randomness', () => {
  const code = SRC.replace(/\/\/.*$/gm, '');
  for (const bad of [/\bwindow\b/, /\bdocument\b/, /Math\.random/, /\bDate\b/, /performance\./]) {
    assert.ok(!bad.test(code), `hologramDj.mjs uses ${bad}`);
  }
});

test('every top-level name is holo-prefixed, so nothing collides with iosAppReactive.jsx', () => {
  // iosAppReactive.jsx declares BPM, BEAT_MS, FX_COLORS, mixHex, cycleColor, useBeat ...
  // The old in-file hologram lived beside them; the prefix keeps the new one from
  // ever shadowing one of them if it is inlined again.
  const top = [...SRC.matchAll(/^(?:export )?(?:const|let|var|function|class) ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  assert.ok(top.length > 20, 'the declaration scan found almost nothing — it is no longer reading this file');
  assert.deepEqual(top.filter((n) => !/^(holo|HOLO_)/.test(n)), []);
  assert.deepEqual(Object.keys(C).filter((n) => !/^(holo|HOLO_)/.test(n)), []);
});

test('the beat clock is the app reactive clock: 132 BPM, pulse = (1 - phase)^3', () => {
  assert.equal(C.HOLO_BEAT_MS, 60000 / 132);
  const b0 = C.holoBeat(0);
  assert.equal(b0.pulse, 1);
  assert.equal(b0.beatN, 0);
  const mid = C.holoBeat(C.HOLO_BEAT_MS * 2.5);
  assert.equal(mid.beatN, 2);
  assert.ok(Math.abs(mid.phase - 0.5) < 1e-9);
  assert.ok(Math.abs(mid.pulse - 0.125) < 1e-9);
  for (const bad of [-5, NaN, Infinity, undefined]) assert.equal(C.holoBeat(bad).ms, 0, `holoBeat(${bad})`);
});

test('the glitch never strobes: one 140 ms band at most, bursts at least 3.5 beats apart', () => {
  // WCAG 2.3.1: nothing may flash more than three times a second. A burst is a
  // band of the figure slipping sideways for 140 ms; the schedule keeps every
  // burst ~1.6 s from the next, measured here over ~2 hours of play.
  assert.equal(C.holoGlitchAt(1000), null, 'a burst in the first two bars: the preview would open on a glitch');
  let prev = -Infinity, bursts = 0;
  for (let n = 0; n < 2000; n++) {
    const w = C.holoGlitchWindow(n);
    assert.deepEqual(C.holoGlitchWindow(n), w, `window ${n} is not deterministic`);
    if (!w) continue;
    bursts += 1;
    assert.equal(w.end - w.start, C.HOLO_GLITCH_MS);
    assert.ok(w.start >= n * C.HOLO_GLITCH_WINDOW_MS && w.end <= (n + 1) * C.HOLO_GLITCH_WINDOW_MS, `burst ${n} leaves its window`);
    assert.ok(w.start - prev >= C.HOLO_BEAT_MS * 3.5 - 1e-6, `bursts ${(w.start - prev).toFixed(0)} ms apart at window ${n}`);
    assert.ok(w.h >= 8 && w.h <= 24, `band height ${w.h}`);
    assert.ok(w.y >= C.HOLO_FIG_SPAN[0] && w.y + w.h <= C.HOLO_FIG_SPAN[1], `band ${w.y}+${w.h} outside the figure`);
    assert.ok(Math.abs(w.dx) >= 3 && Math.abs(w.dx) <= 6, `displacement ${w.dx}`);
    prev = w.start;
  }
  // ...and the schedule is not vacuous: bursts do happen, a few times a minute.
  assert.ok(bursts > 800 && bursts < 1600, `${bursts} bursts in 2000 windows`);
  const first = C.holoGlitchFirstMs();
  assert.ok(C.holoGlitchAt(first + 1), 'holoGlitchAt misses the first burst');
  assert.equal(C.holoGlitchAt(first + C.HOLO_GLITCH_MS + 1), null, 'the first burst outlives 140 ms');
});

test('a tint that is not #rrggbb falls back to teal instead of reaching the colour maths', () => {
  for (const bad of [undefined, null, '', 'red', '#abc', '#0ac5a8ff', 42, 'var(--accent)', 'rgb(1,2,3)']) {
    assert.equal(C.holoNormTint(bad), C.HOLO_TEAL, String(bad));
  }
  assert.equal(C.holoNormTint('#0AC5A8'), '#0ac5a8');
});

test('dark paper: every tint prints as light, without glaring', () => {
  const T = C.HOLO_TARGETS.dark;
  for (const tint of [...PICKER, ...EXTREMES]) {
    const p = C.holoPalette(tint, false);
    for (const role of ['rim', 'line']) {
      const c = contrasts(p[role], C.HOLO_GROUNDS_DARK);
      assert.ok(Math.min(...c) >= T[role] - 0.05, `${tint} ${role} only ${Math.min(...c).toFixed(2)}:1 on dark paper`);
      assert.ok(Math.max(...c) <= T[`${role}Max`] + 0.05, `${tint} ${role} glares at ${Math.max(...c).toFixed(2)}:1`);
    }
  }
});

test('light paper: every tint is visible AND lighter than the text it crosses', () => {
  // The owner's cream on light paper used to vanish (the old hologram drew the
  // tint itself, ~1.1:1). The new one walks each tint toward ink until it reads,
  // and stops short of the grey meta text (~6:1) and the body ink (~16:1), so a
  // line that crosses a word never reads as one of its strokes.
  const T = C.HOLO_TARGETS.light;
  assert.ok(T.rimMax < 6, `the rim cap ${T.rimMax}:1 is as dark as the meta text it crosses`);
  for (const tint of [...PICKER, ...EXTREMES]) {
    const p = C.holoPalette(tint, true);
    for (const role of ['rim', 'line']) {
      const c = contrasts(p[role], C.HOLO_GROUNDS_LIGHT);
      assert.ok(Math.min(...c) >= T[role] - 0.05, `${tint} ${role} only ${Math.min(...c).toFixed(2)}:1 on light paper`);
      assert.ok(Math.max(...c) <= T[`${role}Max`] + 0.05, `${tint} ${role} at ${Math.max(...c).toFixed(2)}:1 reads as ink`);
    }
  }
  // cream is neutral, so its line borrows a cool cast: it still reads as light, not as pencil
  const line = C.holoRgb(C.holoPalette('#f2ede4', true).line);
  assert.ok(line[2] > line[0] + 10, `cream's line has no cool cast: ${line}`);
});

test('a drifting tint never makes the palette jump', () => {
  // The Cycle colour moves every frame; the component samples it ~3 times a
  // second. A one-level input change must stay a small output change, or the
  // rim would visibly tick against the edge glow, which drifts smoothly.
  for (const light of [false, true]) {
    for (let r = 0; r < 255; r += 3) {
      const a = C.holoPalette(C.holoHex([r, 120, 160]), light);
      const b = C.holoPalette(C.holoHex([r + 1, 120, 160]), light);
      for (const role of ['rim', 'line']) {
        const da = C.holoRgb(a[role]), db = C.holoRgb(b[role]);
        assert.ok(Math.max(...da.map((v, i) => Math.abs(v - db[i]))) <= 3, `${role} jumps at r=${r} (${light ? 'light' : 'dark'})`);
      }
    }
  }
});

test('the rig is built once, on first use, and draws nothing below its floor', () => {
  const G = C.holoGeometry();
  assert.equal(C.holoGeometry(), G, 'the geometry is rebuilt on every call');
  const ys = (d) => [...d.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => +m[2]);
  const paths = [G.desk.edge, G.desk.fine, G.desk.faint, G.desk.base, G.desk.face, G.desk.glass, G.desk.lip,
    G.torso.sil, G.deckArm.sil, G.cueArm.sil, G.head.sil, G.deckHand.sil, G.cueHand.sil];
  for (const d of paths) {
    const y = ys(d);
    assert.ok(y.length > 0, 'a path with no coordinates: the scan is no longer reading it');
    assert.ok(Math.max(...y) <= C.HOLO_RIG.h, `a path reaches y=${Math.max(...y)} below the floor (${C.HOLO_RIG.h})`);
  }
  for (const k of ['body', 'head', 'deck']) {
    const [x, y, w, h] = G.box[k];
    assert.ok(x >= 0 && x + w <= C.HOLO_RIG.w && y >= 0 && y + h <= C.HOLO_RIG.h, `${k} box leaves the rig`);
  }
  // the glitch band's span is the figure's: head box top to the console's back edge
  assert.ok(C.HOLO_FIG_SPAN[0] >= G.box.head[1] && C.HOLO_FIG_SPAN[0] <= G.box.head[1] + 4);
  assert.ok(Math.abs(C.HOLO_FIG_SPAN[1] - G.desk.top) <= 4);
});

test('the booth stands right of the text column on a 350px screen', () => {
  // The old figure was centred and filled the lower 60% of the screen, behind
  // the member's content. The redrawn one is right-aligned: its console starts
  // past x = 125, so headlines and row names on the left are never crossed.
  const G = C.holoGeometry();
  const left = C.HOLO_RIG.ref - C.HOLO_RIG.right - C.HOLO_RIG.w + G.desk.x[0];
  assert.ok(left >= 125, `the console starts at x=${left.toFixed(0)}`);
  assert.ok(Math.abs((G.desk.x[0] + G.desk.x[1]) / 2 - C.HOLO_CAM.cx) < 1, 'the console is not centred under the DJ');
});
