---
name: ui-ux-pro-max
description: >-
  Maxed-out UI/UX craft for any visual or interaction work. Use when designing,
  building, reviewing, redesigning, or polishing UI — screens, components,
  layouts, flows, theming, motion, responsive, accessibility — and especially
  for the Shape app's broadsheet/instrument-plate house style. Trigger on:
  "design", "UI", "UX", "layout", "component", "redesign", "polish", "make it
  look better", "lead with a directive", "tighten/declutter", "match the design".
---

# UI/UX Pro Max

Approach every UI task like a senior product designer **and** a senior frontend
engineer: opinionated about hierarchy and restraint, ruthless about polish,
honest about data, and disciplined about verifying before shipping. Default to
*less but better* — one clear job per screen, then earn every added element.

## The process (don't skip)

1. **Find the one job.** What is the user here to do/decide? The screen must
   answer it in the first viewport. Everything else is secondary or cut.
2. **Lead with a directive, not a dashboard.** Tell the user (or coach) *what to
   do next*, then show the supporting detail. A wall of stats is a failure mode —
   synthesize first, enumerate second.
3. **Establish hierarchy** with size → weight → color → space, in that order.
   One primary action per view. Demote or remove anything competing with it.
4. **Lay out on a system**, not by eye: a consistent spacing scale, a type scale,
   an aligned grid. Tighten until it's clean, then add breathing room back.
5. **Design every state**: default · hover · active/pressed · focus (visible
   ring) · disabled · loading (skeleton, never demo numbers) · empty (sell the
   first action) · error (recoverable). Missing states are the usual bug.
6. **Polish pass** — optical alignment, consistent radii, hairline rules,
   tabular numbers for figures, motion that clarifies (150–280ms ease), no
   layout shift.
7. **Verify, then ship** (see the loop below). Never claim "done" on an unbuilt,
   untested change.

## Universal craft checklist

- **Spacing**: one scale (e.g. 4/8/12/16/22…). No magic one-offs.
- **Type**: a small scale; pair a display/serif headline with a mono/sans label
  eyebrow; cap line length ~66ch for prose; tabular-nums for stats.
- **Color & contrast**: meet WCAG AA (≥4.5:1 body, ≥3:1 large/UI). Color is a
  signal, not decoration — reserve accents for meaning (state, role, action).
- **Touch targets** ≥ 44×44px; generous, padded hit areas (don't ship bare "→").
- **Motion**: purposeful and short; respect reduced-motion; never block input.
- **Responsive**: design the narrow case first; verify 0px horizontal overflow.
- **A11y**: semantic roles/labels, keyboard reachable (Enter/Space/focus), alt
  text, `aria-hidden` on decorative layers.
- **Honesty**: a number is live or it reads "—" with a sub-label. Never show
  fabricated/demo data inside a signed-in view; demo is a labelled preview only.
- **Anti-repetition**: the same content shouldn't appear as two near-identical
  feeds. Use progressive disclosure (glance → list → detail), not duplication.

## Shape house style (this repo)

Editorial **broadsheet** aesthetic + **instrument plates**. Read
`AGENTS.md` and `docs/WORKLOG.md` first — they hold the live conventions.

- **`BSPlate`** is the instrument primitive: clipped top-right notch, 3px accent
  **spine** (left), pulsing live **tick**, corner **bracket**. Use for
  live/actionable surfaces (directives, KPIs, agenda cards).
- **Two-tier rule**: **plates** = live/actionable; **quiet rounded cards** =
  forms, inputs, sheets, list rows; **chat bubbles** stay round. Don't plate a
  form; don't make a directive a flat row.
- **Theme tokens only.** `const t = useBS()`. Use `t.INK/PAPER/PAPER2/RULE/HAIR/
  ACCENT/INK50/INK70/GREEN/RUST/AMBER/BLUE/DISPLAY/MONO`. **Never** hardcode
  ink/paper on a themed surface (it breaks across the 14 papers). Teal accent
  literal when you must: `t.isLight ? '#0a8f87' : '#34d6c5'`.
- **Role colors**: client **teal**, trainer **rust `#c0533b`**, nutritionist
  **gold `#a07a2e`/#d8b25a**. Coach/role accents ride borders/spines/eyebrows;
  the title stays theme ink.
- **Typographic system**: mono **uppercase eyebrows** (letter-spacing ~0.16–
  0.2em), serif **display titles** with an accent-colored period
  (`Daily <i style=accent>habits.</i>`), squared radii (≈4–9), and the **2px
  ink→accent gradient ledger** rule under section heads.
- **Sheets/overlays** must `createPortal` into `#bs-phone-surface` (so they don't
  overhang the phone frame in desktop preview).
- **Monochrome emoji rule**: any emoji you *add* must be monochrome typographic
  symbols (⚙ ↗ ✓ → × ♡ ＋ #) — never recolor existing emoji.

### Where UI lives

- **Mobile app** — `mobile-app/src/broadsheet/*.jsx` (Capacitor/Vite SPA, the
  `/m/` broadsheet). Biggest file: `iosAppBroadsheetClient.jsx`. Shared chrome
  (`BSPlate`, `BSPage`, `BSFooter`) in `iosAppBroadsheet.jsx`; coach apps in
  `iosAppBroadsheetPros.jsx`.
- **Website** — `public/newdesign/*.html` + their `*.jsx` babel blocks.
  ⚠️ **Do NOT bump the `?v=N`** — that convention is **obsolete** (superseded
  2026-07-16). The deploy precompile (`scripts/build-newdesign.mjs`) rewrites
  every newdesign script tag to `nd/<name>?v=<content-hash>`, so editing a
  `.jsx` cache-busts itself. **Never sweep `?v` across a shared jsx's
  consumers** — `pageShell.jsx` has 69, and a 70-file PR makes **CodeRabbit skip
  review entirely (>50 files)**. Keep the PR to the jsx file. Confirm a file is
  actually referenced before relying on an edit.
- **Next app** — `src/` (API routes + gated `/dashboard`).

## Verify-before-ship loop (mandatory)

- Parse-check a changed JSX file:
  `node -e "require('@babel/parser').parse(require('fs').readFileSync('<file>','utf8'),{sourceType:'module',plugins:['jsx']})"`
- TS: `npx tsc --noEmit`.
- Mobile build: from `mobile-app/`, `VITE_BASE=/m/ npm run build`; then from repo
  root **republish** `rm -rf public/m && cp -r mobile-app/dist public/m` and
  confirm `diff -rq mobile-app/dist public/m` is clean (CI fails on stale
  `public/m`).
- Run `npm test`; open a PR only when asked; wait for CI green; review the diff
  for theme-token violations, demo-vs-live leaks, and shared-component blast
  radius before merging. (Don't hunt for "missed `?v=` bumps" — obsolete; flag a
  needless `?v` sweep instead, it trips CodeRabbit's 50-file skip.)

## Self-review before declaring done

Hierarchy clear? · one primary action? · all states designed? · AA contrast? ·
44px targets? · 0px overflow at narrow width? · theme tokens (no hardcoded
ink/paper)? · honest data (no fake numbers signed-in)? · no duplicated feed? ·
built + `public/m` synced + tests green? If any "no" — it's not done.
