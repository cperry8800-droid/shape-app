---
name: front-end-design
description: >-
  Use when building or refining UI in this repo — layout, typography, spacing,
  color, responsive behavior, component structure, visual polish. Apply for
  any task touching .tsx/.jsx/.css/.html that affects how something looks or
  feels, including the Next.js app (src/) and the newdesign / mobile
  prototypes (public/newdesign, public/mobile).
---

# Front-End Design

Practical rules for shipping clean, modern, consistent UI in this codebase.

## Know which system you're in

This repo has three UI surfaces — match the one you're editing:

1. **Next app** (`src/app`, `src/components`) — React 19 + Next 16 + Tailwind v4.
   Dark theme: `neutral-900/950` surfaces, `neutral-800` borders, `teal-400`
   accent, `text-neutral-100/400/500` hierarchy. Use Tailwind classes, not
   inline style, unless matching surrounding code.
2. **newdesign prototype** (`public/newdesign/*.jsx`) — Babel-in-browser React,
   inline-style objects, design tokens `PAPER` `INK` `TEAL` `TEAL_BRIGHT`,
   fonts `serif` (Fraunces), `sans` (Space Grotesk), JetBrains Mono. Cream
   "paper" palette on dark photo backgrounds.
3. **mobile prototype** (`public/mobile/*.jsx`) — same token system, phone
   viewport.

Before changing anything, read a sibling file to copy its exact tokens,
spacing scale, and component idioms. Never introduce a new color or font
that isn't already in the file/system.

## Layout & spacing

- Use one spacing scale consistently (4/8px rhythm in Tailwind; the prototype
  uses explicit px in multiples of 4–8). Don't mix arbitrary values.
- Constrain reading width: body copy `max-width` ~60–75ch (≈480–640px).
- Whitespace is a feature. When something looks off, the fix is usually more
  space, fewer borders, or tighter type — not another box.
- Prefer CSS grid/flex gaps over margins for sibling spacing.
- Vertical rhythm: section padding should be consistent within a page; pick
  one value and reuse it.

## Typography

- Two families max per surface (a display/serif + a sans), plus mono for
  labels/eyebrows. This repo already follows that — don't add more.
- Set a clear hierarchy: eyebrow (small, uppercase, tracked, accent color) →
  headline (large, tight letter-spacing, light/medium weight) → body
  (15–16px, line-height 1.5–1.6, muted color) → caption.
- Large headings: negative letter-spacing (−0.02 to −0.04em), line-height
  ~0.95–1.05. Body: never below 14px on mobile; 1.5+ line-height.
- Readability over style: minimum body contrast ~4.5:1. If text sits on a
  busy photo, raise opacity toward 0.9+ and/or weight to 500 rather than
  adding a heavy scrim.

## Color

- One accent, used sparingly (CTAs, active state, key numbers). Teal here.
- Build neutrals as a ramp; don't hand-pick one-off greys.
- Translucent panels over imagery: keep fill near-transparent and lean on a
  small `backdrop-filter: blur()` + 1px hairline border for definition rather
  than a heavy opaque fill.
- Match a frame/bezel/container to its contents' color so seams disappear.

## Responsive

- Mobile-first intent; verify the largest and smallest target widths.
- Size must scale *down* as the viewport shrinks. Audit nested media queries
  so a smaller breakpoint never sets a larger value than a wider one
  (a real bug class in this repo).
- Use `min(px, vw)` for fluid caps; `clamp()` for fluid type.
- Use `100dvh` (with `100vh` fallback) for full-height mobile sections.
- Tap targets ≥ 44px.

## Components

- One component, one job. Compose rather than configure with many flags.
- Build the empty / loading / error state, not just the happy path.
- Don't add abstraction until there are 3 real uses.
- Keep visual variants data-driven (a `tone`/`variant` prop), not copied
  blocks.

## Process / quality bar

- After a change, view the actual page (start the dev server / open the
  prototype) — type-checking proves correctness, not appearance. If you
  can't render it, say so.
- Check the golden path plus one narrow and one wide viewport.
- Bump a cache-buster query (`?v=N`) when swapping a referenced static asset
  (svg/png) so the browser refetches.
- Watch for encoding: this repo has recurring UTF-8 mojibake (`â€"`, `Â·`,
  `�`). When editing copy, keep files UTF-8 and use real `—` `·` `'` `"`.
