# Nora's Booth — module contract (prototype, 2026-09-29)

Everything is plain ES modules that import `three` and nothing app-specific. Every module is
FRAMEWORK-AGNOSTIC, and since Phase 1 (2026-10-09) the runtime modules live in
`public/newdesign/booth/`, where the app bundles them against `mobile-app/node_modules` (three
0.186.1) and the website resolves them through `Radio.html`'s import map (the same pins,
`tests/nora-stage-version-parity.test.mjs`). So: no DOM globals at import time, no `Math.random()` (use a seeded PRNG
passed in or derived from an integer seed), no `Date.now()` in pure modules (the caller
passes `t` in seconds). Dispose everything you allocate (geometries, materials, textures,
canvas textures) in `dispose()`.

## World frame (the "DJ frame") — metres, +Y up
- The DJ (Nora) stands at about z = +0.30, FACING −Z (toward the crowd).
- The DJ's RIGHT is +X, LEFT is −X.
- The crowd is at −Z (z from −2 to −12). The LED wall is BEHIND the DJ at z ≈ +2.2.
- Booth table top at y = 0.92. Gear sits on the table top.
- Deck 1 (DJ's left)  center x = −0.391. Mixer center x = 0. Deck 2 (DJ's right) x = +0.391.
- All gear front edges (the edge nearest the DJ, where CUE/PLAY / faders are) align at
  z = +0.20; gear extends toward −Z.

## Gear LOCAL frame (for cdj3000.mjs and djmMixer.mjs)
- Origin at the bottom-center of the unit. +Y up. The player-facing FRONT edge is at +Z,
  the BACK (cables) at −Z. +X is the player's right. Units: metres, REAL dimensions.
- So the booth just does `unit.group.position.set(x, 0.92, 0.20 - depth/2)` — no rotation.

## Brand rule
Model the INDUSTRIAL DESIGN of a Pioneer DJ CDJ-3000 / DJM-A9 (layout, proportions, control
shapes, screen UI style). NEVER render the words "Pioneer", "Pioneer DJ", "CDJ", "DJM",
"rekordbox" or any logo on the gear or screens — trademark. Unbranded, or "SHAPE" in a small
engraved label is fine. Screen UI may use the same *style* (dark UI, 3-band colored
waveform, beat grid, BPM/key readouts) with generic labels.

## Visual bar
It must read as real pro gear from 0.35 m away on a phone: bevels (RoundedBoxGeometry from
three/addons/geometries/RoundedBoxGeometry.js), a two-tone chassis (near-black body,
dark-gunmetal top plate), matte black knobs with a white indicator line, rubberised pads with
emissive colored LEDs, emissive screens (MeshBasicMaterial or emissive map so they glow in a
dark club), small silkscreened labels via a CanvasTexture decal on the top plate (tiny white
mono text: "LOOP", "CUE", "TEMPO", "HOT CUE", "BEAT FX", "HI MID LOW", "TRIM" …). Prefer
MeshStandardMaterial / MeshPhysicalMaterial with sensible roughness/metalness so it responds
to club lighting (coloured spots, rim light). Keep total draw calls modest: merge static
decoration where you can (BufferGeometryUtils.mergeGeometries), keep each unit under ~60
draw calls and ~25k triangles.

## Interfaces

### cdj3000.mjs
```js
export const CDJ_DIMS = { w: 0.329, d: 0.453, h: 0.1185 };
export function createCDJ({ THREE, deckNumber, accent = '#34d6c5', textureScale = 1 }) → deck
deck.group            // THREE.Group, local frame above
deck.anchors          // THREE.Object3D children of group; read world pos with getWorldPosition
  .jog     // top-centre of the jog platter surface
  .jogEdge // a point on the platter's near (player-side) rim, top surface — where a palm rests
  .play .cue           // top of the PLAY / CUE buttons
  .tempo               // top of the tempo fader knob (moves with the fader)
  .browse              // top of the browse/rotary knob
  .pads[0..7]          // top of each hot-cue pad
  .screen              // centre of the screen surface
deck.set(state)        // any subset; persists between calls
  state = {
    playing: bool,            // PLAY LED green steady when playing, blinking when cued/paused
    jogAngle: radians,        // platter rotation (caller integrates; ~33.3 rpm × tempo when playing)
    jogTouch: bool,           // platter ring lights brighter when touched
    tempo: -1..1,             // tempo fader position (0 = centre)
    padsLit: [8 hex|null],    // hot cue LED colours
    onAir: bool,              // red ON AIR ring around the jog when the channel is live on the mixer
    screen: {
      deckLabel: 'DECK 1', title, artist, bpm (number|null), key: '8A',
      elapsed: s, remaining: s, beatInBar: 0..3,
      waveColumns: Array of {low,mid,high} (0..1) — the scrolling zoomed waveform, newest last,
      overview: Array of {low,mid,high} — whole-track overview (optional),
      playhead: 0..1 (overview position), loaded: bool, color: '#hex' (deck colour)
    }
  }
deck.update(dt, t)     // redraws the screen canvas at ≤ 20 fps, animates LED blink etc.
deck.dispose()
```
Screen canvas: 1024×640 (scale by textureScale). Waveform in the style of a 3-band
display: low = deep blue/navy, mid = amber/orange, high = white, stacked/overlaid, centre
playhead line, beat-grid ticks, BPM big, key, elapsed/remaining with a progress bar,
title/artist, deck number, a colored deck-badge. If `loaded` is false, show an empty
"LOAD TRACK" state.

### djmMixer.mjs
```js
export const DJM_DIMS = { w: 0.413, d: 0.444, h: 0.108 };
export function createMixer({ THREE, accent = '#34d6c5' }) → mixer
mixer.group, mixer.anchors = {
  ch: [4 × { fader, trim, hi, mid, low, color, cue }],  // tops of controls; fader moves with value
  xfader, masterLevel, fxOn, fxKnob, fxScreen
}
mixer.set({
  ch: [4 × { fader: 0..1, trim: -1..1, hi: -1..1, mid: -1..1, low: -1..1, color: -1..1,
             cue: bool, level: 0..1 /*VU*/ }],
  xfader: -1..1, master: { l: 0..1, r: 0..1 }, fx: { on: bool, name: 'ECHO', beat: '1/2', level: 0..1 },
  bpm: number|null
})
mixer.update(dt, t); mixer.dispose()
```
Knob mapping: −1..1 → −150°..+150° rotation of the indicator. Channel faders ~60 mm travel,
crossfader ~45 mm travel. Per-channel vertical LED level meters (15 segments: green/amber/red)
next to each channel, master meters in the centre-right. Layout like a 4-channel club mixer:
per channel column top→bottom TRIM, HI, MID, LOW, COLOR, CUE, fader; right-hand BEAT FX
section with a small screen, FX knob, ON/OFF button; crossfader bottom centre.

### club.mjs (environment)
```js
export function createClub({ THREE, renderer, seed = 7, accent = '#34d6c5', quality = 'high'|'low' }) → club
club.group; club.set({ bands:{low,mid,high,level}, kick: 0..1, beat: 0..3, bar: int, drop: 0..1, accent })
club.update(dt, t); club.dispose()
```
Contains: booth table (flight-case style, black, aluminium edge trim, front fascia facing the
crowd at −Z with a subtle SHAPE mark), a riser, a dark glossy floor, an LED WALL behind the DJ
(z≈+2.2, ~6×3.4 m) rendered as a DOT MATRIX (Shape's Signal Field identity: round dots on a
14-px-like pitch) driven by bands (spectrum columns, kick flashes, accent colour), truss with
4–6 moving-head beams (additive cone meshes with gradient falloff, sweeping on the beat),
light fog (scene.fog), crowd silhouettes (instanced low-poly figures, bobbing on the beat,
hands up when `drop` > 0.5) filling z −2..−10, and practical booth lights (a warm/teal key
from the truss, deck-screen underglow is the caller's). Must look like a real dark club, not a
void. `quality: 'low'` halves beams/crowd for phones.

### noraMix.mjs (PURE — no three, no DOM)
A beat clock + the mix choreography. Exports:
```js
export function beatClock({ bpm, t0 }) → { beatAt(t) → float beats, barAt(t), phase(t) 0..1, kick(t) 0..1 }
export function planTransition({ fromDeck, toDeck, startBar, lengthBars = 16 }) → plan
export function mixState(plan, bar /*float*/) → {
  ch: { [deck]: { fader, low, mid, hi } }, xfader, cueOn: {deck: bool},
  phase: 'idle'|'load'|'cue'|'blend'|'swap'|'out'|'done',
  hands: { left: {target:'jog1'|'jog2'|'fader2'|'fader3'|'low2'|'low3'|'hi2'|'hi3'|'xfader'|'ear'|'browse1'|'browse2'|'play1'|'play2'|'rest'|'air', grip:0..1}, right: {...} },
  camHint: 'screen'|'jog'|'mixer'|'wide'|null
}
```
Deck 1 → mixer channel index 1 (CH2), Deck 2 → channel index 2 (CH3).
