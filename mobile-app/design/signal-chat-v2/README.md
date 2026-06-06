# Shape · Chat — "Signal" design

The in-app **Chat** section of Shape, "Signal" direction (v2): presence-forward,
rounded cards tinted by each member's Shape-Score tier. **Four top-level tabs —
Feed · Channels · Friends · Team** (no sub-filter row). The **Feed** is now a
**Strava-style activity stream** — every workout shown as an activity card
(type chip, location, title, GPS route map for runs, 3-stat row, Verified +
cheer/reply); coach notes clip in as their own cards. **Channels** is its own
tab (Your channels / Discover). Plus thread view, auto-growing composer,
profile peek, Nora (AI), and the locked guest preview.

## Run it
Open `index.html` in any modern browser. No build step — it uses React +
Babel from CDN and transpiles the `.jsx` in the page. Internet needed for
the React/Babel CDN and Google Fonts (Newsreader / JetBrains Mono / Space
Grotesk). Toggle member ↔ locked and dark ↔ light from the Tweaks panel.

## Files (load in this order)
1. `shapeKit.jsx` — design tokens (`makeTheme`, type stacks, tier + role
   colors), shared primitives (`Phone`, `Avatar`, `Byline`, `Eyebrow`,
   `LiveDot`, `Kinetic`, `StatusBar`), and sample data (`M`, `FEED`,
   `THREADS`, `CHANNELS`, `TEAM`, `TRAINING_NOW`).
2. `shapeChat.jsx` — shared chat pieces reused by every screen: `Icon`,
   `AppNav` (Home/Train/Eat/Chat/Me), `Thread` + composer, `Bubble`,
   `Peek` (profile sheet), `Locked` (guest preview). *(Also contains the
   "Broadsheet" option `ChatPage`; delete it if you don't need it.)*
3. `signalChat.jsx` — the **Signal** screen itself (`ChatSignal`): header with
   the live presence rail + 4-tab segmented control, `SigActivity` (Strava-style
   activity card) + `SigCoachNote`, `SigChannel` (Channels tab), and `SigRow`.
4. The in-page Tweaks panel (member↔guest, dark↔light) is inlined directly in
   `index.html` (the original `tweaks-panel.jsx` was not part of the upload).

## Design system
- **Type** — Newsreader (serif display), JetBrains Mono (labels/numbers),
  Space Grotesk (UI). **Accent** — teal `#34d6c5` (dark) / `#0a8f87` (light).
- **Tiers** — Raw `#8a93a0` · Tempo `#d8a23a` · Form `#34d6c5` · Peak
  `#8a5cf6` · Legend `#e0518a`. **Roles** — Trainer `#c0533b` ·
  Nutritionist `#a07a2e`. All derived in `shapeKit.jsx` (`tierColor`,
  `roleColor`) and adapted for light mode.
- Dark-first; `makeTheme(false)` returns the light (cream paper) palette.
  Animations respect `prefers-reduced-motion`.

## Porting to a real app
The screens are presentational React function components that take a theme
object `t` (from `makeTheme`) and a `viewer` prop. To build for production:
swap the sample data in `shapeKit.jsx` for your API, replace the CDN script
tags with your bundler (Vite/Next), and convert the `t`-style inline styles
to your styling system (the token names map 1:1).
