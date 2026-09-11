# Scope — iPad "Option A": the centered canvas

**Status:** scoped, not built. **Base:** `origin/main` @ `2b967c4`. **Branch:** `claude/shape-ipad-iphone-duo-05ykip`.

Presentation-only change to the mobile app's native shell. No migration, no route, no data change,
no new dependency. iPhone rendering must be a **byte-identical no-op**.

---

## 1. Why this exists

**iPad is already switched on and already shipping.** Nothing needs enabling:

| Fact | Evidence |
|---|---|
| The binary is Universal | `mobile-app/ios/App/App.xcodeproj/project.pbxproj` — `TARGETED_DEVICE_FAMILY = "1,2"` |
| iPad orientations declared | `mobile-app/ios/App/App/Info.plist:49` — `UISupportedInterfaceOrientations~ipad`, all four |
| iPad multitasking permitted | no `UIRequiresFullScreen` key anywhere in the plist |
| It reaches devices on every merge | `codemagic.yaml` — TestFlight upload on every push to `main` |

So an iPad user installs Shape today and gets the phone layout stretched across up to 1366pt.
This is not hypothetical.

### Measured before-state

Rendered headless on the native branch (`html.is-native-app` stamped at document-start, Chromium,
`mobile-app/dist`):

| Viewport | `#bs-phone-surface` | Widest single line of body copy |
|---|---|---|
| iPhone 14 Pro — 393pt | `x=0 w=393` | 353px |
| iPad A16 portrait — 820pt | `x=0 w=820` | 780px |
| iPad Pro 13" landscape — 1366pt | `x=0 w=1366` | **1326px** |

And the tab bar, driven all the way into the signed-out app preview:

| Viewport | tab bar | per-tab cell |
|---|---|---|
| 393pt | `x=0 w=393` | 63px |
| 1024pt | `x=0 w=1024` | 189px |
| 1366pt | `x=0 w=1366` | **257px** |

A 20px icon adrift in a 257px cell, and one line of body copy running 1326px. That is the whole
problem in two numbers.

---

## 2. What Option A is — and is not

**Is:** cap the app to a phone-width column, center it, paint a deliberate paper field around it.

**Is not:** a breakpoint system, a sidebar, split view, a multi-column broadsheet, or any change to
type scale. That is Option B, a later wave. See §8.

---

## 3. The structure

Three elements, replacing today's two. Every constraint below is load-bearing — each one is a
measured defect avoided, not a preference.

```
<div wrapper>                    position:fixed; inset:0; width:100vw; height:100dvh
                                 display:flex; justifyContent:center      ← centering
                                 background: <the field, from theme tokens>
  <div column>                   width:100%; maxWidth:BS_PHONE_COLUMN_MAX; height:100%
                                 boxShadow: <seam>                        ← UNZOOMED
    <div id="bs-phone-surface">  width:100%; height:100%; zoom:t.TEXT_SCALE
```

### The cap goes on the column — never on `#bs-phone-surface`

`iosAppBroadsheet.jsx:1632` applies `zoom: t.TEXT_SCALE || 1`. `zoom` multiplies every **fixed**
length on the element, and Option A introduces this element's first fixed-length size. The existing
comment ("zoom scales the CONTENT only (not the box)") is true only for percentage sizes.

A 460px cap placed on the zoomed surface renders **414 / 460 / 515px** as the member moves text size
across `BS_TEXT_SCALES` (`0.9 / 1 / 1.12`). The column width would silently follow a typography
preference.

### The cap goes on the column — never on the wrapper

Capping the existing fixed wrapper uncovers the screen behind it, and what paints there is
`index.html:29` — `html.is-native-app body { background: #050504 }`, a hardcoded near-black. On the
nine light papers that is a black frame around a cream column. The wrapper stays full-bleed and
*becomes* the field.

### Center with flex — never with `transform`

A `transform` (or `filter`, `backdrop-filter`, `perspective`, `will-change`, `contain`) on an ancestor
makes it the containing block for `position: fixed` **descendants**. That silently re-roots all six
fixed elements in the app. Flex centering creates no containing block.

### Cap width only — never height

`env(safe-area-inset-*)` always resolves against the viewport, never against an ancestor box. There
are **76 safe-area call sites** across `src/broadsheet/*.jsx`. Letterboxing vertically would leave
every one of them reserving room for a status bar and home indicator that are no longer adjacent —
phantom padding on both edges. Eight sheet height caps are `vh`-based for the same reason
(`maxHeight: '92vh'`, `'94vh'`, `'72%'`…). Column keeps `height:'100%'` inside a `100dvh` wrapper.

### No `borderRadius`

Two traps. A px radius inside the zoom breathes with text size (37.8 / 42 / 47.0). And a rounded
corner sitting against a real status bar reads as a rendering fault, not a design. Separate column
from field with a shadow seam on the **unzoomed** column — `box-shadow` is outside the layout box, so
it costs no width and cannot push the column off-centre.

### The field's background must be `linear-gradient(C, C)`, never a bare `rgba()`

This is the **2026-09-01 defect**, exactly. A colour is legal only in the *final* layer of the
`background` shorthand; a bare `rgba()` in a non-final layer voids the **entire declaration** and the
surface computes to transparent. Option A creates a brand-new multi-layer themed surface, which is
precisely the shape that triggered it. Compose as:

```js
background: `linear-gradient(rgba(${t.inkRGB},0.10), rgba(${t.inkRGB},0.10)), ${t.PAPER_BG}`
```

### No breakpoint, no detection, no resize listener

`maxWidth` is inert whenever the viewport is narrower than the cap. One native branch covers iPhone
and iPad with no media query, no UA sniff, no `Capacitor.getPlatform()` check and no resize handler —
consistent with the app having zero width breakpoints today. It is also automatically correct in iPad
Split View: at a phone-width window the cap self-disables and the render is identical to today.

### The desktop-preview branch cannot be reused

`iosAppBroadsheet.jsx:1647+` sets `--bs-notch-floor: 46px` and draws a fake notch. Its own comment
states the native surface must never set that variable — mastheads take
`max(natural, env(), var(--bs-notch-floor, 0px))`, so carrying it onto real hardware double-pads every
masthead. Keep two branches; edit only the native one.

---

## 4. Commit plan

| # | Commit | Files | What changes |
|---|---|---|---|
| 1 | The centered canvas | `src/broadsheet/iosAppBroadsheet.jsx` | Native branch (`:1613-1640`) → 3 elements per §3. Add `BS_PHONE_COLUMN_MAX` beside `BS_TEXT_SCALES` (`:412`). Preview branch untouched. |
| 2 | Scope the touch handlers to the surface | `src/broadsheet/iosAppBroadsheet.jsx:1600-1609` | The global scroll-drag listeners bind to `document`. Today every native touch lands on the surface so it never matters; after the cap the paper field is a large new touch region, and a drag there would scroll the app column. Bind to `#bs-phone-surface` instead, as `BSNavGestures` already does. |
| 3 | Settings dropdown → surface-relative | `src/broadsheet/iosAppBroadsheetClient.jsx:31838`, `:33115-33116` | The one overlay measured against the viewport (`window.innerWidth - r.right`) and rendered `position:fixed`. Convert to the house pattern already at `:1233` — measure against the surface rect, portal in, `position:absolute`, divide offsets by `t.TEXT_SCALE`. |
| 4 | Delete dead CSS | `mobile-app/index.html:14-26` | `.bs-pinned-composer` has **zero consumers** in `src/` — verified repo-wide. It is also the only `translateX(-50%)` centring precedent in the app, i.e. the exact pattern §3 forbids. |
| 5 | Record the deliberate escapes | `iosAppBroadsheetClient.jsx:22428`, `iosAppBroadsheetMain.jsx:2174` | `BSVideoCall` and the crash screen are `position:fixed; inset:0` and will now cover the whole iPad rather than the column. Both are **correct** — a video call wants the display, and the crash screen must render even if the surface node is gone. Comment them so a later sweep does not "fix" them. |
| 6 | Guards | `tests/` | §6. |

---

## 5. Open questions — owner's call

1. **The cap value — now near-determined, recommendation 430.** Measured: **12 of the 13
   `maxWidth: 430` overlays are bottom sheets** (they carry `borderTopLeftRadius`), i.e. they are
   meant to sit flush to the column's edges. At a 460 or 500 cap every one of them renders with a
   15-35px gutter down each side — an inset that appears nowhere else in the app. At **430** they
   are all flush with no sheet changes, and 430 is exactly iPhone 16 Pro Max, so the largest phone
   stays a provable no-op. Choosing larger is legitimate but is not free: it means re-capping 12
   sheets in the same PR.
2. **What the field looks like.** Flat paper · ink-tinted paper (§3's default) · paper + grain
   texture. Grain is available (`bs-paper-grain`) but tiles against the field, not the column.
3. **Video call full-bleed?** Recommendation: yes, leave it. Flag if you disagree.

---

## 6. Verification

Gates: `npm test` (228 test files) · `npx tsc --noEmit` · JSX parse on both changed modules · the
mobile build.

⚠ **CORRECTION — `public/m` does NOT need republishing, and the WORKLOG convention saying it does is
stale.** `.github/workflows/ci.yml` states it verbatim: *"public/m itself is generated at deploy time
(scripts/build-m.sh), not committed, so there's no byte-diff against a committed copy anymore."*
`/public/m` is in `.gitignore`. The Mobile job builds the `/m/` bundle and then runs
`scripts/mobile-asset-refs.mjs` against the **artifact** — that step exists because the build exits 0
even when an asset the bundle requests is missing. Option A adds no assets, so it is unaffected, but
the step is the one that would catch it if a later commit did.

Required checks on `main`: **Web (typecheck + build)** · **Tests (unit + mount)** · **Mobile (build +
asset refs)** · **Secret scan (gitleaks)**.

Headless renders at **393 · 440 · 820 · 1024 · 1366 · 375** (Split View), asserting: the iPhone widths
render byte-identically to today; the column is centred and capped at iPad widths; no horizontal
overflow; zero page errors. Note `playwright` is **not a declared dependency** — the render harness
needs `npm i playwright --no-save` with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`.

### Guards — invariants, not spellings

Per house doctrine each guard names the invariant and the mutation that must be **proven to land**
before the guard is trusted.

| Guard | Invariant | Mutation that must kill it |
|---|---|---|
| No containing-block property on wrapper or column | neither carries `transform`/`filter`/`backdrop-filter`/`perspective`/`will-change`/`contain` | add `transform:'translateX(-50%)'` to the column |
| Cap sits outside the zoom | the element carrying `maxWidth` does not carry `zoom` | move `maxWidth` onto `#bs-phone-surface` |
| Width-only cap | no `maxHeight`/height cap on wrapper or column | add `maxHeight: 900` to the column |
| Field background is layer-legal | every non-final `background` layer carries an `<image>` | swap the field's `linear-gradient(C,C)` for a bare `rgba()` |
| iPhone no-op | at sub-cap widths the computed column rect equals the viewport | change the cap to a fixed `width` |
| Preview branch unpolluted | native branch never sets `--bs-notch-floor` | set it in the native branch |

---

## 7. Risk

Low. Presentation-only, one shell component plus one overlay. The failure mode that matters is
**regressing iPhone**, which the no-op guard and the 393/440 renders exist to catch.

---

## 8. Deliberately NOT in this PR

- Any real iPad layout: multi-column, sidebar nav, split view, coach roster/detail panes (**Option B**).
- Any breakpoint system or resize handling beyond the self-disabling cap.
- Any change to the ~3,291 fixed-px font sizes or the introduction of a fluid type scale.
- iPad launch-screen and app-icon audit — **not yet surveyed**, see §9.
- The 11 website pages still missing a viewport meta (separate, already on the open-work list).
- Anything for an unreleased foldable.

**iPad is not "done" after this PR.** It is *deliberate* rather than broken.

## 9. The four remaining dimensions — surveyed

These were the open gaps in the first draft. All four are now closed.

### 9.1 iOS native — **no work required**

| Item | Finding |
|---|---|
| App icon | `AppIcon.appiconset/Contents.json` holds a **single 1024×1024 `"idiom": "universal"`** entry — the Xcode 14+ single-size format. Apple derives every iPad size. Nothing to add. |
| Launch screen | `LaunchScreen.storyboard` uses `contentMode="scaleAspectFill"` with `useSafeAreas="YES"` on a **square 2732×2732** splash. Aspect-fill of a square covers both iPad aspect ratios (cropping top/bottom in landscape, sides in portrait); centred artwork survives both. |
| `<device id="retina4_7">` | Interface Builder *canvas* metadata in both storyboards. Not a runtime constraint. Ignore. |
| `UIRequiredDeviceCapabilities: armv7` | Legacy Capacitor template key. arm64 devices satisfy it and it does not gate iPad. Optional cleanup, not a blocker — and not worth bundling into this PR. |
| `UIRequiresFullScreen` | **Do not add it.** Adding it would opt the app *out* of iPad multitasking. §3's self-disabling cap already makes Split View correct, so opting out buys nothing and removes a capability. |

Verified but **not** verifiable from this container: how the splash actually looks on an iPad
simulator. Worth one look on a Mac before shipping.

### 9.2 Portals & overlays — **no escapes today; one real change (already commit 3)**

- **59** `createPortal` call sites across the broadsheet modules; **30** use the
  `|| document.body` fallback.
- **Zero** portals target anything before trying `#bs-phone-surface` — there is no
  `createPortal(x, document.body)` anywhere.
- **Measured, not reasoned about:** driven into the live app at 393 / 1024 / 1366pt,
  `document.body`'s children are exactly `["root"]` at every size. No portal is escaping to `<body>`
  today, so Option A inherits no hidden escapees.
- Only **one** element is `position: fixed` in the running app (the `BSPhone` wrapper). The other
  five fixed sites are conditional: `BSVideoCall`, the Settings dropdown's backdrop and panel, the
  crash screen, and a panel in `iosAppBroadsheetMain.jsx:1847`. Commits 3 and 5 cover them.
- Sheet sizing under the cap is the §5.1 question, not a defect.

### 9.3 Backdrop — **settled, and it is the 2026-09-01 rule again**

- **18 papers, 8 light / 10 dark** (`light, white, manila, steel, bone, sage, rose, mist` are the
  light ones).
- `PAPER_BG` equals `PAPER` for flat papers, and for the one `metallic` paper (Steel) it is a
  gradient stack that **ends in `${PAPER}`** — so it always supplies a colour in the final layer and
  is safe to append after a tint.
- The field composes as `linear-gradient(rgba(${t.inkRGB},α), rgba(${t.inkRGB},α)), ${t.PAPER_BG}`.
- This is not a new rule: `BSPage` at `iosAppBroadsheet.jsx:608` already paints
  `${t.TEXTURE}, ${t.PAPER_BG}`, and the comment at `:245` spells out the trap. The field is simply
  the next surface to obey it.
- The preview branch's bezel and drawn notch are **not** reusable — see §3.

### 9.4 Tests & CI — **the guard model is already in the repo**

`tests/theme-texture-css.test.mjs` is the precedent to copy, and its own header states the rule this
PR leans on. Its instrument: **brace-match the real function out of the shipped source and evaluate
it**, because the module is browser JSX that cannot be imported, and because — in its words — *"a
spelling pin would survive any equivalent rewrite, and what matters is what the function ANSWERS."*
The §6 guards follow that shape.

Also worth recording: **`playwright` is not a declared dependency** of either package, so the render
harness (`scripts/qa-sweep.mjs` and anything new) needs an ad-hoc
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright --no-save`, with the browser already at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.

---

## 10. Confidence

The container and viewport-escapee findings were produced by independent agents and then verified
line-by-line against `origin/main` by hand. The four dimensions in §9 were surveyed directly, and the
portal result is empirical rather than argued. What remains unverified: the splash on a real iPad
simulator (§9.1), and every visual judgement in §5, which is the owner's call and not a measurement.
