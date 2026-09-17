# Build brief — the app's Radio spectrum takes the website's two tones, both driven by the accent picker

**Status: NOT BUILT — this is the code-level brief the build works from.**
Written 2026-09-17 against `main` = `f52db62`. Every `path:line` below was re-read from that
commit; the build re-verifies each one before touching it (`git rev-parse origin/main` first).

**The ask (owner, 2026-09-17, on two screenshots — the website's Radio wall and the app's Radio
page):** *"can you make the look of shape radio on app match the colors on website, regarding this
part. i like the 2 different color schemes"* — and, minutes later — *"make sure when you adjust
colors on the settings app in still applies to the app on shape radio, both color sections"*.

**The reading this brief builds:** the website's Radio wall draws one instrument in **two tones** —
teal for the body of every lit column and a hot amber for the **top fifth** of it, for the kick
flood and for the word when the bass saturates. The app's Signal Field draws its spectrum in **one**
tone (the theme accent, which is why the owner's screenshot is violet) with a cream tip. The app
takes the website's two-tone rule; the base tone stays the Settings accent it already is, and the
hot tone is **derived from that accent** by the same offset that turns the website's teal into its
amber — so one picker moves both tones, and on the default teal accent the app reproduces the
website's pair exactly (`#34d6c5 → #e0a24a`). No second picker, no new preference, no migration,
no i18n key.

---

## 0. What is decided, what is defaulted

| # | Question | Answer | Reversal |
|---|---|---|---|
| 1 | Where the second tone comes from | **Derived** from the accent (`hotFor`, §2) — not a second Settings picker | A second picker is a Settings UI + a stored preference + 13 locales; out of scope unless the owner asks |
| 2 | The field's dots (the ground behind the bars) | Take the **base tone** at their existing rest alpha, and the hot tone where a bin is loud — the website's own ground and cloud rule | One line at §3.7: keep `cfg.ink` |
| 3 | The peak cap | **Hot** (it is the hottest reading the bar reached) | One line at §3.3: keep `cfg.ink` |
| 4 | The beat counter's lit dot | **Hot**, unlit dots in the base tone | One line at §3.6 |
| 5 | The station's baseline on a kick | **Hot** while the kick is above the website's flood threshold, teal otherwise | One line at §3.4 |
| 6 | The matching state's two rows | **Untouched** — station teal, heart rust (`BS_HEART`, fixed by design, `iosAppBroadsheetRadio.jsx:87–93`) | n/a |
| 7 | The website | **Untouched** except the module cache key (§5) — the website is the reference, not the subject | n/a |

---

## 1. The website's rule, read from the source

`public/newdesign/radioInstrument.jsx` (`main` = `f52db62`):

- `:32` `const RD_TEAL = "#34d6c5";` · `:34` `const RD_HOT = "#e0a24a";` · `:35` `const RD_BG = "#06090f";`
- The wall tile loop `:633–654`. For a lit tile (`on`), `:643–644`:
  ```js
  a = (0.35 + 0.55 * (1 - fromBottom / Math.max(level, 0.01))) * wmix.meter;
  col = fromBottom > level * 0.8 ? RD_HOT : RD_TEAL;
  ```
  i.e. **the top 20 % of each column's lit height is hot, the lower 80 % teal.**
- The kick flood, `:646`: `if (flood) { … col = RD_HOT; }` — the bottom rows go hot when
  `kick > WALL_FLOOD_KICK` (`public/newdesign/radioField.mjs:401`, `= 0.3`).
- The word, `:649`: `if (fromBottom < wordLevel) col = RD_HOT;` — the wordmark fills hot from its
  baseline on the bass (there is no wordmark on the app page; nothing to port).
- The cloud's dots, `:709`: `rdRgba(v > 0.7 ? RD_HOT : RD_TEAL, …)` — a dot is hot when its band is
  above 0.7, teal otherwise; the wall's ground tiles are teal at `WALL_GROUND_ALPHA = 0.06`
  (`radioField.mjs:337`).

That is the whole of "the 2 different color schemes": **base tone below, hot tone on the peaks**.

---

## 2. The derivation — one accent in, two tones out

Teal → amber, in HSL: hue `173.7° → 35.2°` (**−138.5°**), saturation `0.664 → 0.707`, lightness
`0.522 → 0.584` (**+0.063**). The rule applies that same offset, amber's own saturation and the same
lightness step to whatever the accent is:

```js
// public/newdesign/radioSignalField.mjs — new "Colour" section, after the FIELD block (:203–216).
// The two-tone rule. Teal -> amber is the website's own pair (radioInstrument.jsx:32,34); every
// other accent takes the SAME hue offset, amber's own saturation and the same lightness step, so
// one Settings accent yields both tones and the default teal reproduces the website exactly.
export const WEB_TEAL = '#34d6c5';   // radioInstrument.jsx:32 RD_TEAL — the parity guard reads that file
export const WEB_HOT = '#e0a24a';    // radioInstrument.jsx:34 RD_HOT
export function hexToRgb(h) { const m = /^#?([0-9a-f]{6})$/i.exec(String(h).trim()); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function rgbToHsl([r, g, b]) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (mx + mn) / 2; const d = mx - mn; if (d === 0) return [0, 0, l]; const s = d / (1 - Math.abs(2 * l - 1)); let h; if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; return [h, s, l]; }
export function hslToHex([h, s, l]) { h = ((h % 360) + 360) % 360; const c = (1 - Math.abs(2 * l - 1)) * s; const x = c * (1 - Math.abs(((h / 60) % 2) - 1)); const m = l - c / 2; let r, g, b; if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x]; const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0'); return `#${to(r)}${to(g)}${to(b)}`; }
const _T = rgbToHsl(hexToRgb(WEB_TEAL)), _A = rgbToHsl(hexToRgb(WEB_HOT));
export const HOT_DH = _A[0] - _T[0];      // −138.5°: the hue offset teal -> amber
export const HOT_S = _A[1];               // 0.7075: amber's own saturation
export const HOT_DL = _A[2] - _T[2];      // +0.0627: amber sits this much lighter than teal
export const HOT_ACHROMATIC_S = 0.08;     // below this the accent is a mono flip (#000 / #fff): no second tone
export function hotFor(accent) {
  const rgb = hexToRgb(accent); if (!rgb) return accent;
  const [h, s, l] = rgbToHsl(rgb);
  if (s < HOT_ACHROMATIC_S) return accent;
  return hslToHex([h + HOT_DH, HOT_S, Math.min(0.92, Math.max(0.08, l + HOT_DL))]);
}
// Where the hot tone goes — the website's own literals, and the parity guard reads them there.
export const BAR_HOT_FRAC = 0.2;   // radioInstrument.jsx:644 `fromBottom > level * 0.8` → the top fifth
export const FIELD_HOT_V = 0.7;    // radioInstrument.jsx:709 `v > 0.7`
export const FLOOD_KICK = 0.3;     // radioField.mjs:401 WALL_FLOOD_KICK
```

⚠ `hotFor(WEB_TEAL) === WEB_HOT` **exactly** (`#e0a24a`) — verified by running the function above,
not by reasoning: the offset, saturation and step are *derived from* the pair, so feeding teal back
round-trips through HSL to the same three bytes. The guard in §5 pins that equality with both hexes
**read out of `radioInstrument.jsx`**, never typed.

**What it produces, for every accent in `makePalette`'s table (`iosAppBroadsheet.jsx:114–124`),**
computed with the function above and looked at rendered as mini-spectra on the Black paper and on
Cream before this rule was chosen (the fixed-lightness alternative was rendered beside it and read
harsher on blue and violet; this one keeps each pair's lightness relationship the website's has):

| accent | dark `t.ACCENT` → hot | light `t.ACCENT` → hot |
|---|---|---|
| teal | `#34d6c5` → **`#e0a24a`** (the website's pair) | `#0a8f87` → `#9e6e1b` |
| blue | `#5b8df9` → `#c6eb89` | `#1c4ed8` → `#96dd37` |
| amber | `#e3a544` → `#8a63e4` | `#c8881a` → `#6228da` |
| rust | `#e06547` → `#6371e4` | `#a8331b` → `#2137c2` |
| green | `#5fb16e` → `#e14f61` | `#2f6b3a` → `#9f1b2c` |
| violet | `#a78bfa` → `#b7f2b3` | `#6d3fc4` → `#44df4a` |
| rose | `#f2749f` → `#99d0ed` | `#b8285f` → `#26a2da` |
| white / black, and the contrast flips at `iosAppBroadsheet.jsx:130` | the accent itself (achromatic: the two-tone collapses to one, which is what a mono theme asks for) | same |

`t.ACCENT` already picks the light or dark value for the paper (`:125`) and already applies the
contrast flip (`:130`), so `hotFor(t.ACCENT)` inherits both. The accent is a **live** setting
(the Appearance picker recolours a still-mounted tab tree — the 2026-09-15 Nora entry), and the field
reads its colours off `liveRef.current` every frame, so a new `hot` prop lands on the next frame with
no rebuild.

---

## 3. The draw-site changes — `mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx`

All inside `BSRadioSignalField` (`:1480`) and its parent `BSRadioScreen` (`:2149`). `cfg` is
`liveRef.current` (`:1620`).

**3.0 Plumbing.**
- `:5–14` — add `hotFor` to the import from `radioSignalField.mjs` (and `BAR_HOT_FRAC`, `FIELD_HOT_V`, `FLOOD_KICK`).
- `:1480` — add `hot` to the destructured props; `:1497–1498` — add `hot` to the `liveRef` init and
  the per-render reassignment (the object literal appears twice; both).
- `:2317` `const TEAL = t.ACCENT;` — directly under it: `const HOT = React.useMemo(() => hotFor(TEAL), [TEAL]);`
  (memoised because the parent renders on every tempo read; the derivation parses a hex).
- `:2409–2414` the call site — add `hot={HOT}` beside `teal={TEAL}`.

**3.1 The bars (`:1897–1920`).** Delete the three-stop gradient (`:1898–1901`, ink at the top →
teal) — the cream tip was the old look. Each bar becomes **two rects**, drawn at the same alpha
the bar has today (`:1918`):
```js
const hHot = h * BAR_HOT_FRAC;
ctx.fillStyle = cfg.teal;
ctx.fillRect(x, baseY - (h - hHot), wBar, h - hHot);   // the body: the lower 80 %
ctx.fillStyle = cfg.hot;
ctx.fillRect(x, baseY - h, wBar, hHot);                // the top fifth
```
⚠ Keep the spelling `ctx.fillRect(x, baseY - h,` on the top rect: `tests/radio-rest-state.test.mjs:143`
uses that literal as the marker for "bars are drawn" when it asserts the **else** arm draws none.
Rename it and that guard passes vacuously.

**3.2 The reflection (`:1922–1923`).** It reused the gradient. `ctx.fillStyle = cfg.teal;` before
it (still `0.13` alpha — an echo, never a reading).

**3.3 The peak cap (`:1926`).** `ctx.fillStyle = cfg.hot;` (was `cfg.ink`).

**3.4 The station's baseline (`:1930–1933`).** `ctx.fillStyle = kick > FLOOD_KICK ? cfg.hot : cfg.teal;`
— the website's flood, on the one line the app has for it. The rect (`ctx.fillRect(band.x, baseY, band.w, 1)`)
is pinned by `tests/radio-signal-field-layout.test.mjs:204`; do not change it.

**3.5 The dashed no-signal line (`:1940`).** Unchanged — teal; a source that is not there gets
no hot.

**3.6 The four-beat counter (`:1957`).** `ctx.fillStyle = on ? cfg.hot : cfg.teal;` (was
`on ? cfg.teal : cfg.ink`). The alphas (`0.95` / `0.2`) stay.

**3.7 The field's dots (`:1794–1804`).** The loop sets `ctx.fillStyle = cfg.ink` once at `:1794`;
move the assignment inside the inner loop, after `v` is computed:
`ctx.fillStyle = v > FIELD_HOT_V ? cfg.hot : cfg.teal;`. Alpha and radius (`fieldAlpha`,
`fieldRadius`) unchanged — the rest field is `FIELD_REST_ALPHA` teal, the website's own ground. (A
fillStyle assignment per dot is ~1,300 string sets a frame; canvas caches parsed colours and it is
not measurable beside the arc fills. If a profile says otherwise, draw two passes.)

**3.8 Untouched, deliberately:** the scrims (`:1853`, `cfg.paper`); the matching rows
(`:2013 · :2021 · :2064 · :2066 · :2079 · :2098` — station teal, heart `cfg.heart`, ties teal at lock);
`BSStageLight color={TEAL}` (`:2415`); the rail's five bars; every i18n string.

---

## 4. Files

| File | Change |
|---|---|
| `public/newdesign/radioSignalField.mjs` | the Colour section (§2) — pure, dependency-free, `require()`-able like the rest of the file |
| `public/newdesign/Radio.html:74` | **re-hash** the module's cache key: `radioSignalField.mjs?v=f82d5f003a` → the first 10 hex of the new file's sha256. `tests/radio-module-cache-keys.test.mjs` fails with the paste-ready `FIX:` line until it is done (`:89–92`); do not guess it. |
| `mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx` | §3 |
| `tests/radio-two-tone.test.mjs` | new (§5) |
| `docs/BUILD-2026-09-14-radio-signal-field.md` | ⚠ mark §4/§7 where they describe the bars as one tone with an ink tip — a brief that still describes the old look is an instruction to rebuild it |

No migration. No route. No `public/m` republish is committable (`public/m` is gitignored, zero
tracked files — the mobile build runs in the pre-commit hook and in CI).

---

## 5. Guards — `tests/radio-two-tone.test.mjs`

Follow the lift pattern of `tests/radio-rest-state.test.mjs:42–71` (`slice(code, 'function BSRadioSignalField(', 'function BSRadioScreen(', 4000)`)
and `tests/radio-signal-field.test.mjs` (imports the module directly).

1. **Parity with the website, read not typed.** `WEB_TEAL === RD_TEAL` and `WEB_HOT === RD_HOT` with
   both constants parsed out of `radioInstrument.jsx` (`const RD_TEAL = "…"`, `const RD_HOT = "…"`);
   `hotFor(WEB_TEAL) === WEB_HOT` exactly. `BAR_HOT_FRAC === 1 − 0.8` with the `0.8` parsed from
   `fromBottom > level * 0.8`; `FIELD_HOT_V` parsed from `v > 0.7 ? RD_HOT`; `FLOOD_KICK === WALL_FLOOD_KICK`
   imported from `radioField.mjs`. Each parse asserts it matched (a website literal that moves fails
   here rather than drifting).
2. **Every accent gets a partner.** Parse `makePalette`'s `accents` table out of
   `iosAppBroadsheet.jsx` (vacuity floor: ≥ 9 keys, each with `light` and `dark`); for every
   chromatic value assert `hotFor` returns a 6-hex, its hue differs from the base by `HOT_DH`
   (mod 360, ±0.5°) and its lightness by `HOT_DL` (±0.005) unless the clamp bit; for `white`,
   `black`, `#ffffff`, `#000000` assert identity. A tenth accent added later is covered with
   nobody remembering this file.
3. **The draw sites.** Over the lifted field body: the live arm sets `cfg.hot` immediately before
   `fillRect(x, baseY - h,` and `cfg.teal` before the body rect; the cap reads `cfg.hot`; the
   counter reads `on ? cfg.hot : cfg.teal`; the dot loop reads both `cfg.hot` and `cfg.teal` and
   **no longer** reads `cfg.ink`; `addColorStop` does not appear in the field body (the ink tip is
   gone); **control:** the rows still read `cfg.heart` and the scrim still reads `cfg.paper` — the
   change must not have reached them.
4. **The parent.** `BSRadioScreen` derives `HOT` from `TEAL` through `hotFor(` and the call site
   carries `hot={HOT}`; `BS_HEART` is still the literal `'#e06547'` and is still what `HEART` is.
5. **The cache key** — already enforced by `tests/radio-module-cache-keys.test.mjs`.

**Mutations to run, each proven to land before its run** (anchor occurrence-counted, the suite's
`# pass`/`# fail` parsed): `HOT_DH` → `180` (a complement; the parity test dies) · the achromatic
bail removed (the flips get a coloured hot) · the top rect's fill set to `cfg.teal` · the cap back
to `cfg.ink` · the counter back to `on ? cfg.teal : cfg.ink` · the dot loop back to `cfg.ink` ·
the parent passing `hot={TEAL}` · the parent's `useMemo` deps emptied (a live accent change stops
reaching the hot tone — the render drive in §6 is what catches this one, the source guard cannot)
· the module edited with the old key left in `Radio.html`.

---

## 6. Verification

- `npm test` · `tsc --noEmit` · JSX parse on the module · the mobile build clean, with the new
  spelling confirmed **in the emitted bundle** behind a positive control and a negative one (the
  retired `addColorStop(0,` on the field reads 0; the minifier writes backticks, so grep the
  backtick form — the trap this repo's changelog records twice).
- **Driven in Chromium through the real signed-out preview** (the 2026-09-15 flow: language →
  Continue → *Preview the app first* → *Step inside* → dismiss the banner by `aria-label="Dismiss"`;
  open Radio by the Home now-playing card's **eyebrow**, not its ▶ TUNE IN button, which
  `stopPropagation`s). The preview draws the simulated 128-BPM station, so the bars are live
  without patching anything. Sample the canvas over the bar band: count pixels within ΔE of
  `t.ACCENT` and within ΔE of `hotFor(t.ACCENT)` — both counts must be non-zero, and the hot
  pixels must sit **above** the teal pixels in every sampled column (the top fifth). Then change
  the accent through Settings → Appearance (the accent row the 2026-09-15 Nora A/B drove, picking
  RUST) with the Radio page still mounted, and assert both counts move to the **new** pair with no
  reload. Repeat on a light paper (Cream) for the light values. Zero page errors, zero overflow, at
  320 · 390 · 430.
- ⚠ The **website** page is looked at once after the re-hash to confirm the wall is unchanged —
  the module gained exports and nothing the website imports moved.

---

## 7. Records, after the PR

WORKLOG entry (the changelog comes after the PR, per the head of that file), the ⚠ marker on the
2026-09-14 brief's §4/§7, and the pair table above copied into the WORKLOG entry so the next reader
does not re-derive it.

⚠ **CORRECTED 2026-09-17, BY THE REVIEW ROUND ON #2118 — THE LIGHTNESS STEP IS SIGNED BY THE
PAPER, NOT FIXED.** This brief derived the partner with a fixed `+HOT_DL` (+0.0627), on the
reading that amber "sits lighter than teal". That is a fact about **the wall's ground**, not
about amber: on the wall the ground is near-black, so *lighter* and *further from the ground*
are the same sentence — and they come apart the moment the paper is light, which this screen's
paper frequently is (`BSRadioScreen` paints `t.PAPER`). Measured across all **18 papers × 9
accents**, the fixed step put **14 pairs between 1.00:1 and 1.55:1**, every one of them a light
paper on **Blue or Violet**, with **manila + violet at 1.00:1** — the loudest fifth of the
instrument, the peak caps and the loud field dots drawn in the paper's own colour. `hotFor` takes
the paper now and steps **away** from it, then walks on until it clears a floor; the worst pair in
the matrix goes **1.00:1 → 3.03:1**. The hue rotation and the saturation are **untouched**, so the
pair keeps the character the wall gave it and `hotFor('#34d6c5')` still returns `#e0a24a` byte for
byte — only which way it steps is the paper's call. ⚠ **And the floor is capped by the base's own
contrast**, because on the wall's ground the approved pair reads teal **10.8:1** and amber
**8.8:1** — the hot tone is *already* the lower-contrast half, so demanding it beat a marginal base
would invert the relationship the owner picked. That cap is a **measured no-op on today's tables**
(11 pairs have a sub-3:1 base and every one of their partners already clears 5.9:1) and is
labelled as one at the site rather than left to read as live.
