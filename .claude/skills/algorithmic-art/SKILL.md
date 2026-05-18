---
name: algorithmic-art
description: >-
  Use when generating procedural / generative visuals — canvas or SVG
  artwork, animated backgrounds, data-driven graphics, audio/biometric
  reactive visualizers, noise fields, particle systems, generative
  patterns or logos. Applies to anything that produces imagery from
  code rather than a static asset.
---

# Algorithmic Art

Toolkit and judgement for code-generated visuals.

## Pick the right surface

- **SVG** — crisp at any scale, few hundred elements, static or lightly
  animated, needs to live in markup / be themeable by CSS. Best for logos,
  generative marks, line work, charts-as-art.
- **Canvas 2D** — thousands of elements, per-frame animation, pixel
  effects, particle systems, flow fields. Default for reactive visualizers.
- **WebGL/shaders** — 10k+ particles, fragment-shader fields, real-time
  post-processing. Only when Canvas 2D drops frames.

This repo's radio visualizer is a good reference for the reactive-bars
idiom; match its token palette (`TEAL`, `TEAL_BRIGHT`, paper/ink) when art
lives inside the product.

## Core building blocks

- **Pseudo-randomness**: seed it (mulberry32 / xmur3) so output is
  reproducible. Never ship art whose layout changes every reload unless
  motion is the point.
- **Value/Perlin/simplex noise**: organic variation — terrain, flow fields,
  blob deformation, subtle drift. Layer octaves (fBm) for richness.
- **Flow fields**: sample an angle field with noise, advect particles along
  it, fade the canvas with a low-alpha rect for trails.
- **Distribution**: Poisson-disc / blue-noise for natural spacing; jittered
  grids for controlled-but-organic; golden-angle (137.5°) for phyllotaxis.
- **Tiling/structure**: Voronoi/Delaunay, recursive subdivision, Wang tiles,
  L-systems for branching, cellular automata for emergent texture.
- **Easing & motion**: time-based (`dt`), not frame-count; ease with
  cubic/expo; loop seamlessly with `sin(t)` phase or modular time.

## Reactive / data-driven art

- Map an input signal (audio FFT, BPM, heart rate, scroll, a dataset) to
  visual params: amplitude→height, frequency band→hue, tempo→speed.
- Smooth inputs (EMA / lerp toward target) so visuals don't jitter on noisy
  data.
- Decouple simulation from render where possible; clamp `dt` to avoid
  spiral-of-death on tab refocus.

## Composition & aesthetics

- Constrain the palette (2–4 hues + neutrals); derive variation from
  value/saturation, not many hues. Pull from the product's tokens when
  embedded.
- Contrast of scale, density, and orientation creates focal points — pure
  uniform randomness reads as noise, not art.
- Negative space matters as much in generative work as in layout.
- Add one deliberate asymmetry / rule-breaker; perfect symmetry feels dead.

## Performance & hygiene

- `requestAnimationFrame`; never `setInterval` for animation.
- Respect `prefers-reduced-motion` — offer a still composition.
- Size canvas to `devicePixelRatio` for sharpness; cap at 2x.
- Offscreen-canvas or cache static layers; only redraw what changes.
- Clean up RAF/listeners on unmount; pause when offscreen
  (`IntersectionObserver`) or tab hidden (`visibilitychange`).
- Keep it deterministic enough to test: same seed + same inputs ⇒ same frame.

## Output expectations

- Self-contained: a function/component that takes a seed + params and
  renders, no hidden globals.
- Document the parameter knobs (seed, density, palette, speed) at the top.
- If it's a logo/mark, also export a static SVG snapshot for use where a
  live canvas is overkill.
