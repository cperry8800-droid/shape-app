---
name: theme-factory
description: >-
  Use when creating, editing, or systematizing visual themes — color
  palettes, design tokens, dark/light modes, theme switching, CSS custom
  properties, Tailwind theme config, or turning a one-off color into a
  reusable token. Applies whenever the task is about a *system* of colors
  rather than a single element's color.
---

# Theme Factory

Build themes as token systems, not scattered hex values.

## First: find the existing token system

This repo already defines themes — never invent a parallel one:

- **Next app** (`src/`) — Tailwind v4 with the `neutral-*` ramp +
  `teal-400` accent on dark surfaces. Theme lives in CSS/Tailwind config.
- **newdesign / mobile prototypes** — JS constants `PAPER` `INK` `TEAL`
  `TEAL_BRIGHT` plus the cream `--paper / --paper-2 / --paper-3`,
  `--ink / --ink-2 / --ink-3`, `--teal / --teal-bright`, `--orange`
  scale in `:root`. Reuse these; new colors must enter the scale, not
  bypass it.

Read a representative file and extract the current token names before
adding anything.

## Token architecture (3 tiers)

1. **Primitive** — raw scale: `cream-50…900`, `teal-400…700`. No meaning.
2. **Semantic** — role-based aliases mapping to primitives:
   `--bg`, `--surface`, `--border`, `--text`, `--text-muted`,
   `--accent`, `--accent-strong`, `--danger`. Components reference *these*.
3. **Component** — only when a component needs a value not expressible
   semantically (rare). Resist this tier.

Components must never reference primitives directly — that's what makes a
theme swappable.

## Building a palette

- Pick one accent hue; derive a 9-step ramp by varying lightness/chroma,
  not by eyeballing hexes. Keep hue roughly constant per ramp.
- Neutrals: a tinted grey ramp (warm here — cream/ink), not pure `#000/#fff`.
- Enforce contrast: body text ≥ 4.5:1 on its surface, large text/UI ≥ 3:1.
  State the measured ratio when introducing a text/bg pair.
- Limit to: 1 accent, 1 neutral ramp, ≤2 supporting hues (status colors).
- Translucent surfaces over imagery: define them as tokens too
  (`--glass: rgba(...)` + a blur token) so they stay consistent.

## Dark / light / multi-theme

- Same semantic token names, different primitive values per theme.
  Toggle by swapping the value set on `:root` / a `data-theme` attribute
  or `.theme-x` class — never by conditionals scattered in components.
- Define every semantic token in every theme; a missing token is a bug,
  not a fallback.
- Test both/all themes after any change — a tweak that looks right in one
  often breaks contrast in another.

## Delivery

- Output the token set as CSS custom properties (and Tailwind theme
  extension if the Next app). One source of truth; don't duplicate the
  ramp in JS and CSS.
- Provide a tiny preview (swatches + a sample card) so the theme can be
  eyeballed without hunting through the app.
- Document each semantic token's intent in a comment.
- When converting existing one-off colors: map each to the nearest
  semantic token, list any that don't fit (those reveal missing tokens),
  then add tokens — don't force-fit.

## Guardrails

- Don't ship a theme that only works on one screen — verify the
  busiest and the emptiest views.
- Keep the diff a token change, not a component rewrite, wherever possible.
- Respect `prefers-color-scheme` for the default theme unless the product
  explicitly overrides it.
