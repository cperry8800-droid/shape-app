---
name: framer-motion
description: >-
  Build production-grade animation and gesture UI with Framer Motion (the
  `motion` library for React). Use when adding or reviewing motion — enter/exit
  transitions, variants/orchestration, drag/gesture interactions, layout &
  shared-element (layoutId) animations, scroll-linked effects, springs — or
  deciding whether Framer Motion is the right tool vs plain CSS. Trigger on:
  "animate", "animation", "transition", "motion", "framer", "gesture", "drag",
  "spring", "parallax", "shared element", "AnimatePresence".
---

# Framer Motion

`motion` (Framer Motion) is a declarative animation library for React: animate
by setting props, orchestrate with variants, get exit animations, layout
animations, gestures, and springs with minimal code. Reach for it when CSS
keyframes/transitions get awkward — exit animations, list reordering,
shared-element transitions, drag, and coordinated sequences.

## Install / setup

```bash
npm i motion          # modern package (import from "motion/react")
# legacy alias: npm i framer-motion  (import from "framer-motion")
```

```jsx
import { motion, AnimatePresence } from "motion/react";
```

No provider needed. SSR-safe. Tree-shakeable; for bundle-critical paths use the
`m` component + `LazyMotion`/`domAnimation`.

## Core API

- **`motion.<tag>`** — drop-in animated element. Animate via props:
  ```jsx
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.22, ease: "easeOut" }} />
  ```
- **Variants** — named states + orchestration (stagger children):
  ```jsx
  const list = { show: { transition: { staggerChildren: 0.05 } } };
  const item = { hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } };
  <motion.ul variants={list} initial="hidden" animate="show">
    {rows.map(r => <motion.li key={r.id} variants={item} />)}
  </motion.ul>
  ```
- **`AnimatePresence`** — enables `exit` when a child unmounts. Children need a
  stable `key`. Use `mode="popLayout"` or `"wait"` for lists/swaps.
- **Gestures** — `whileHover`, `whileTap`, `whileFocus`, `whileInView`,
  `drag`/`dragConstraints`/`dragElastic`, `onPan`. Great for tactile buttons,
  swipe sheets, sliders.
- **Layout animations** — `layout` animates size/position changes (reflow) for
  free; `layoutId="x"` does **shared-element** transitions between two mounted
  elements (e.g. list card → detail hero). Wrap reordering lists in their own
  layout root; pair with `AnimatePresence` for add/remove.
- **Springs & values** — `transition={{ type: "spring", stiffness, damping }}`;
  `useMotionValue`, `useTransform`, `useSpring` for derived/interpolated values
  without React re-renders.
- **Scroll** — `useScroll()` + `useTransform` for parallax/progress;
  `whileInView` + `viewport={{ once: true }}` for reveal-on-scroll.

## Performance (non-negotiable)

- **Animate only `transform` and `opacity`** on the hot path — they're
  GPU-composited and skip layout/paint. Avoid animating `width/height/top/left/
  box-shadow` in loops or per-frame; use `layout` (FLIP) or `scale` instead.
- Keep animated nodes off giant subtrees; promote with `will-change` sparingly
  (Framer manages this) and remove it after.
- Prefer `useMotionValue`/`useTransform` over React state for continuous values
  (drag, scroll) so you don't re-render every frame.
- `LazyMotion` + `m.*` to cut bundle when motion is widespread.

## Accessibility

- Respect the OS setting: `const reduce = useReducedMotion();` and gate
  distance/scale/parallax (fall back to a simple opacity fade or none). Never
  block input or hijack scroll. Keep durations short (≈0.15–0.3s); motion should
  clarify, not perform. Ensure focus order and visible focus survive animation.

## When NOT to use it

A one-off hover, fade, or pulse is fine in plain CSS — don't add a dependency for
it. Reach for Framer Motion when you need **exit** animations, **orchestrated**
sequences, **gesture/drag**, **layout/shared-element** transitions, or
**spring/scroll-linked** values.

## In this repo (important)

- **Framer Motion is NOT currently a dependency.** The broadsheet
  (`mobile-app/src/broadsheet/*`) animates with **inline CSS keyframes**
  (e.g. `bsPlatePulse`, `bs-blink`) injected via `<style>`, and the website
  (`public/newdesign/`) runs **babel-standalone React with no build/bundler** —
  npm imports don't resolve there. So:
  - To use it in the **mobile app**: `cd mobile-app && npm i motion`, import from
    `motion/react`, then rebuild + republish `public/m` (`VITE_BASE=/m/ npm run
    build` → `rm -rf public/m && cp -r mobile-app/dist public/m`, keep CI's
    `public/m` diff clean). Watch bundle size (the client chunk is already large
    — prefer `LazyMotion`/`m`).
  - On the **website** (`public/newdesign`), Framer Motion won't load without a
    build step — keep using CSS keyframes there unless the page is migrated off
    babel-standalone.
- Match the house style: motion should reinforce the instrument-plate language
  (the live **tick** pulse, plate enter), not add flourish. Honor the two-tier
  rule and `useReducedMotion`.
- Verify after any motion change: parse-check the JSX, build, republish
  `public/m`, run `npm test`, CI green.
