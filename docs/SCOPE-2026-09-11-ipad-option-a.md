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

One line of body text running 1326px is the whole problem in one number.

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

1. **The cap value.** 430pt (iPhone Pro Max) / 460 / 500. Larger = less letterbox, more stretched
   type. A visual call, not a technical one.
2. **What the field looks like.** Flat paper · ink-tinted paper (§3's default) · paper + grain
   texture. Grain is available (`bs-paper-grain`) but tiles against the field, not the column.
3. **Video call full-bleed?** Recommendation: yes, leave it. Flag if you disagree.

---

## 6. Verification

Gates: `npm test` · `npx tsc --noEmit` · JSX parse on both changed modules · mobile build + **`public/m`
republish** (CI's "Mobile (build + public/m sync)" fails on a stale `public/m`).

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

## 9. Known gaps in this scope

Four of eight planned survey dimensions did not complete: **iOS native** (launch screen at iPad
aspect ratios, iPad icon sizes in `AppIcon.appiconset`, `UIRequiredDeviceCapabilities: armv7`),
**portals/overlays** (the 51 `createPortal` sites and whether any can reach its `|| document.body`
fallback at runtime), **backdrop**, and **tests/CI**. §3's container and escapee findings are verified
against `origin/main`; the four above are not yet surveyed and may add commits.
