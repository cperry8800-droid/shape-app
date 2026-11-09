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
  ink/paper on a themed surface: it breaks on every other paper (`PAPERS` in
  `iosAppBroadsheet.jsx`). Teal accent literal when you must:
  `t.isLight ? '#0a8f87' : '#34d6c5'`.
- **Role colors**: client **teal**, trainer **rust `#c0533b`**, nutritionist
  **gold `#a07a2e`/#d8b25a**. Coach/role accents ride borders/spines/eyebrows;
  the title stays theme ink.
- **Typographic system**: **Saira** display (`t.DISPLAY`) for mastheads, titles
  and section labels; JetBrains Mono (`t.MONO`) **uppercase eyebrows**
  (letter-spacing ~0.16–0.2em); the native system stack for body. The screens
  WORKLOG's Theme line names take Geist/Inter Tight through `useBSClean` (imported
  as `useBSProClean` in the coach apps).
  Squared radii (≈4–9), and the **2px ink→accent gradient** rule under section
  heads (`linear-gradient(90deg, ${t.INK}, <accent> 58%, transparent)`). A title
  ends in an accent-colored period:
  `{title}<span aria-hidden="true" style={{ color: c }}>.</span>`.
- **Sheets/overlays** must `createPortal` into `#bs-phone-surface` (so they don't
  overhang the phone frame in desktop preview).
- **Back** is the ← in the masthead's `BSMastBackSlot`, filled by `BSBackRow`
  (`BSDetailHeader`, or `onBack` on `BSMasthead`/`BSPageHeader`). Never draw one
  by hand: `tests/back-placement.test.mjs` fails on it. A sticky row takes
  `top: useBSPinnedMastTop()`.
- **App copy** (`mobile-app/`) goes through `useShapeTr()` in all 13 locales; a
  new English-only string shows up in `tests/i18n-surface-inventory.test.mjs`. The
  hook is the app's own: the website and `src/` don't have it.
- **No colored emoji in new work**: typographic symbols (⚙ ↗ ✓ → × ♡ ＋ #) or a
  theme-tinted SVG. Leave existing emoji alone.

### Where UI lives

- **Mobile app** — `mobile-app/src/broadsheet/*.jsx` (Capacitor/Vite SPA, the
  `/m/` broadsheet). Biggest file: `iosAppBroadsheetClient.jsx`. Shared chrome
  (`BSPlate`, `BSPage`, `BSFooter`) in `iosAppBroadsheet.jsx`; coach apps in
  `iosAppBroadsheetPros.jsx`.
- **Website** — `public/newdesign/*.html` + their `*.jsx` babel blocks.
  **Never bump a script's `?v=`**: the deploy precompile
  (`scripts/build-newdesign.mjs`) stamps each script tag with a content hash, so
  editing a `.jsx` cache-busts itself, and sweeping `?v` across a shared jsx's
  consumers (dozens of pages load `pageShell.jsx`) only bloats the PR. An image
  replaced under its own name is the exception: it takes a new `?v=` by hand.
  Confirm a legacy `.jsx` is still loaded before editing it.
- **Next app** — `src/` (API routes + gated `/dashboard`).

## Verify-before-ship loop (mandatory)

- Parse-check a changed JSX file:
  `node -e "require('@babel/parser').parse(require('fs').readFileSync('<file>','utf8'),{sourceType:'module',plugins:['jsx']})"`
- TS: `npx tsc --noEmit`.
- Mobile build: from `mobile-app/`, `VITE_BASE=/m/ npm run build`, to prove it
  builds. `public/m` is gitignored and `scripts/build-m.sh` builds it at deploy:
  never copy `dist` into it or commit it.
- Run `npm test`, read your own diff for theme-token violations, demo-vs-live
  leaks and shared-component blast radius, then follow WORKLOG's **Branch and
  merge** (PR, review, CI green on the final head). Flag a needless `?v` sweep in
  review; a "missed `?v=` bump" isn't a finding.

## Self-review before declaring done

Hierarchy clear? · one primary action? · all states designed? · AA contrast? ·
44px targets? · 0px overflow at narrow width? · theme tokens (no hardcoded
ink/paper)? · honest data (no fake numbers signed-in)? · no duplicated feed? ·
Back through `BSBackRow`? · app copy through `useShapeTr()`? · parse-checked, built
and tests green? If any "no" — it's not done.
