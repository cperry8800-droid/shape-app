# Build brief — the App page as One Day (Concept B)

**Status: NOT BUILT — this is the code-level brief the build works from.**
Written 2026-09-17 against `main` = `f52db62`. Every `path:line` below was re-read from that
commit; the build re-verifies each one before touching it (`git rev-parse origin/main` first — the
web container resets to stale bases, and this file's own review found eighteen drifted citations in
another brief by machine-checking them).

**The owner's pick (2026-09-17): *"lets go with one day"*** — Concept B of
[`REVIEW-2026-09-17-app-page.md`](REVIEW-2026-09-17-app-page.md) §3, as rendered on the concept
board (https://claude.ai/artifact/CoRssAAAWmSX8jSo1KfMZQ, row B) and the plain gallery
(https://claude.ai/artifact/GAUZQXSvviKwSCepwsRywj, tab B). The review recommended C; the pick
supersedes it and the review says so at its §5.

**What the page becomes:** `public/newdesign/GetApp.html` stops being a ten-click carousel with its
own two-link bar and becomes **one member's day, hour by hour** — a dark page on the site's type
system, the shared header and the canonical footer, eight beats from `06:45 WAKE` to `SUNDAY`, each
beat's copy and its phone sticky beside each other, a sky glow that warms and cools down the page,
every one of the ten screens in the DOM at once, the $5 price and the doors in one section, and the
two stale captures already replaced. Measured on the board's render: **7,087 px tall at 1440,
7,727 px at 390, zero horizontal overflow, zero page errors, zero controls under 24 px.**

---

## 0. What is decided, what is defaulted

| # | Review §6 ruling | Answer | Reversal |
|---|---|---|---|
| 1 | The pick | **B · One Day** (owner) | — |
| 2 | The browser door (`/m/`) | **Yes** — one line under the store chips: *Or open it in your browser →* to `/m/`. `vercel.json:2` builds the app into `public/m` on every deploy and the app's own paywall is built for prospects (*Preview the app first →*), so the door is real | delete one `<a class="try">` (§3.5) |
| 3 | Two copy clauses | **Dropped.** *"Pick friends to be notified when you miss"* has no code path; *"One live channel"* describes a station that is not broadcasting. The HABITS and RADIO copy below carries neither | re-add a clause to the SCREENS table (§3.2) |
| 4 | The re-shoot | **Done, 2026-09-17** — `getapp-home-v5.png` and `getapp-radio-v3.png` replaced in place (both 600×1387, shot through the signed-out preview with the clock pinned to Fri 2026-09-11 09:30 New York like the other eight), `?v=20260917` on `GetApp.html:300`, `:307` and `index.html:886` | — |
| 5 | The coach apps | **No** — the member app only, as the shipped page and all three concepts | — |

Also settled by the review's backbone (§2) and not re-opened here: the shared header and canonical
footer; the site's type system; one dark bezel; every capture labelled an example; one Doto figure
per screen read off that screen; the accent for the paper (B is the site's dark paper, so the accent
is the app's own `#34d6c5`, 10.9:1 on `#06090f`); the waitlist `platform` field; *Coaches join free*
(owner ruling, 2026-09-14).

---

## 1. What is deleted from the shipped page

`public/newdesign/GetApp.html` (`main` = `f52db62`, 456 lines) is rewritten. Gone with it:

- the page's own two-link bar (`<header class="nav">`, `:192–197`; CSS `:50–54`) — the one nav
  destination where the site's nav disappeared;
- the carousel: `var STEPS = [` `:299–309`, `render()` `:344–359`, the keyboard handler
  `:376–379`, the 9×9 px dots (`.dot`, `:85`), the hardcoded `/ 08` total (`:208` in the copy
  block), the progress rail (`:190`), the cream-bezel flip (`.phone.dark`, `:119`, driven by
  `dark: false` on four steps);
- the page's own footer (`<footer class="ga-footer">`, `:248–296`) — the shared `<Footer />` takes
  its place, and `tests/site-footer.test.mjs` changes accordingly (§5);
- the old type system: Fraunces / Space Grotesk / JetBrains Mono (`:11`, the three fallback
  `@font-face` rules and every `--serif/--sans/--mono` token);
- the cream palette (`--paper #efe5cd` `:23`, `--teal #0ac5a8` `:29`, `--screen #f4eedf` `:37`) —
  the teal eyebrows on cream computed to 1.75:1.

Kept, moved or rewritten in place: the `<meta name="viewport" … viewport-fit=cover>` (`:5`; the
viewport guard requires it), `<link rel="canonical">`, the meta description (reworded), React +
ReactDOM (`:14–15`, already on the page for the chat bubble), the waitlist script (`:384–452`,
with the fix in §3.5), and `globalChatButton.js` (`:454`).

---

## 2. The skeleton — chrome the page did not have

The page stays a **static document** (its words and images are in the HTML at first paint, which
is what the review's "every word in the DOM" asks for and what a page that phones are redirected to
deserves), and mounts the site's chrome with React the way every other page does. Order in
`<head>`/`<body>`:

```html
<link href="https://fonts.googleapis.com/css2?family=Anybody:ital,wdth,wght@0,50..150,100..900;1,50..150,100..900&family=Doto:ROND,wght@0..100,100..900&family=Schibsted+Grotesk:ital,wght@0,400..900;1,400..900&display=swap" rel="stylesheet" />
```
⚠ **byte-identical to `index.html:44` and `Radio.html`**, so the three pages share one cache
entry — and because Google Fonts pins every axis you do not name: ask for Doto without `ROND` and
every `'ROND' 100` rule on the page is silently inert (the homepage shipped exactly that on 09-11).
`tests/members-page-type.test.mjs` is the guard shape; §5 adds one for this page.

```html
<script src="https://unpkg.com/react@18.3.1/…" integrity="…"></script>          <!-- keep, :14 -->
<script src="https://unpkg.com/react-dom@18.3.1/…" integrity="…"></script>      <!-- keep, :15 -->
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" integrity="sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y" crossorigin="anonymous"></script>  <!-- add; the tag TrainerScore.html:14 carries -->
```
```html
<body>
<div id="shape-chrome-header"></div>     <!-- first in body -->
<main> … the page (§3) … </main>
<div id="shape-chrome-footer"></div>     <!-- last before the scripts -->
<script type="text/babel" src="pageShell.jsx?v=20260714d"></script>
<script type="text/babel">
  ReactDOM.createRoot(document.getElementById("shape-chrome-header")).render(<Header active="App" />);
  ReactDOM.createRoot(document.getElementById("shape-chrome-footer")).render(<Footer />);
</script>
<script src="globalChatButton.js?v=20260714c" defer></script>
```

- `Header` (`pageShell.jsx:994`) renders the fixed 72 px bar **and its own spacer**
  (`:1189`, `height: NAV_H`), so `<main>` starts below the bar with nothing else to do.
  `active="App"` matches the nav table's entry `{ kind: "link", label: "App", href: "GetApp.html" }`
  (`:245`) — the App tab is lit. `Header` and `Footer` are on `window` (`:1488`).
- `Footer` (`:1204`) is the canonical 22-link table on `INK_DEEP` with the white mark — right for
  B's dark paper. ⚠ **Never `id="site-footer"`** on the root: that id was the retired auto-mount
  opt-in that rendered twelve pages' footers twice, and `tests/site-footer.test.mjs:234–248` asserts
  its **absence** on every page.
- `mobile-redirect.js` is **not** loaded: this page is the redirect's target and the script
  early-returns on it anyway (`public/newdesign/mobile-redirect.js:14`).
- The precompile (`scripts/build-newdesign.mjs`, `BABEL_TAG` `:121`) rewrites both `text/babel`
  tags to content-hashed `nd/…` bundles at deploy; its manifest placement for a page that now
  carries compiled scripts is the default branch (`:283–284`). No change to the script.
- **Alternative, not the default:** an all-React page (`getApp.jsx` rendering `<Header/>`, the
  beats and `<Footer/>` in one tree, like the other 25 modules). Equivalent for every guard below;
  it costs first paint on a phone landing page and buys nothing the static body does not have.

---

## 3. The page

Appendix A carries the **exact CSS and markup the board's B was rendered from** (generated from the
same generator, with the image paths already pointed at the site's captures and the mimic
header/footer rules removed). Build from it; what follows is what has to be true about it.

### 3.1 The hero
Eyebrow *The app · one day, hour by hour* (Doto 700 / ROND 30, 12 px, tracked, teal) · `h1`
*One day on Shape.* (Anybody 500, `wdth` 92, 92 px at 1440 / 44 at ≤ 860) · the intro sentence ·
two doors — **Get started →** (`/newdesign/Landing.html`, the header's own target, `pageShell.jsx:1155`)
and **Notify me when it ships** (`#notify`) · the four-figure clock on the right — **10** screens ·
**$5** a month · **13** languages · **0** ads on Radio — each figure Doto 900 / ROND 100 · the
example label under it. ⚠ The `13` is the app's locale count and must be **asserted against the
catalogs that ship** (`mobile-app/src/i18n/locales/*`, the way `tests/about-note.test.mjs` pins the
About page's count), never typed alone; the `10` is the length of the SCREENS table (§5 asserts it).

### 3.2 The timeline — eight beats, ten screens
The `SCREENS` table (kind · time · beat · title · body · the one figure read off that capture ·
file). Beats 7 and 8 carry two screens each: the first screen's time and beat word head the beat,
the two titles, bodies and figures are joined, and two 182 px phones sit side by side.

| # | time · beat | kind | title | figure (read off the capture) | file (600×1387) |
|---|---|---|---|---|---|
| 1 | `06:45` WAKE | HOME | Today, at a glance. | 1568 / 2100 kcal · check-in due | `getapp-home-v5.png?v=20260917` |
| 2 | `07:20` BREAKFAST | EAT | Macros, tallied live. | 532 kcal left · protein 118 / 165 | `getapp-nutri-v3.png?v=20260910` |
| 3 | `09:00` TRAIN | TRAIN | Know what's coming. | 6 moves · 54 min · RPE 8 | `getapp-train-v3.png?v=20260910` |
| 4 | `10:15` LOGGED | THE WALL | Records, on the wall. | 245 lb · new PR | `getapp-wall-v1.png?v=20260911b` |
| 5 | `13:00` SHOP | GROCERY | A list that builds itself. | 89 items · ~$44 to go | `getapp-grocery-v2.png?v=20260910` |
| 6 | `18:00` RADIO | RADIO | Great music, included. | Ad-free · included | `getapp-radio-v3.png?v=20260917` |
| 7 | `20:30` THE ROOM | COMMUNITY + HABITS | The social side of strong. / Small things, tracked. | Feed · Team · Channels · Support · +3 banked today | `getapp-community-v2.png?v=20260911` + `getapp-habits-v1.png?v=20260910` |
| 8 | `SUNDAY` THE WEEK | SCORE + PROFILE | One number that matters. / A profile that's alive. | 1,284 pts · Tempo · 43% of the way to Form | `getapp-score-v3.png?v=20260910` + `getapp-profile-v2.png?v=20260911` |

The bodies are in Appendix A verbatim. Two things about them are load-bearing:

- ⚠ **Every figure is read off the capture beside it.** The build **looks at each PNG** before
  shipping the table (the two re-shot files changed on 09-17; the Home figure `1568 / 2100 kcal ·
  check-in due` and the Radio figure were re-read from the new files, the other eight are the
  board's). A figure that is not on the screen next to it is a fabrication under an example label.
- ⚠ **No banned phrase.** `tests/radio-marketing-pitch.test.mjs:27–42` sweeps 223 files, this one
  included, for the retired movement pitch — *mixed / built / made for movement*, *music built
  for*, *while you move?*, *tuned to your session*, *curated by BPM*, *the tempo of your session*,
  *workout mixes*, *synced to your program*, *matches the tempo of*. The RADIO body in Appendix A
  carries none; the shipped page's *"Each track's BPM syncs — matches the tempo of your session"*
  is on that guard's keep-list as the sentence it retired (`:131`).

Each beat: `.time` (Doto 900 / ROND 100, 26 px, teal; `SUNDAY` in the small 700 / ROND 30 form),
the eyebrow `BEAT · KIND`, `h2` (Anybody, 44 px / 28), the body, the figure line with a teal `■`,
the example label, and the phone(s) — **copy and phones both `position: sticky; top: 96px`** (72 px
of fixed header + 24), which is the one piece of scroll choreography on the page; at ≤ 860 both go
static and stack. Each beat sets `--sky`, a radial glow behind it that runs amber at WAKE and
BREAKFAST, teal through TRAIN, THE WALL and RADIO, cream at SHOP, violet at THE ROOM and gold at THE
WEEK (the `SKY` table in the appendix) — the day warming and cooling.

### 3.3 The phone
One bezel for every capture: `.ph` — `aspect-ratio: 600/1387`, radius 34, padding 7, `#14110d`,
`1px rgba(255,255,255,.14)`; the screen `#0b0b0b`, radius 28, `object-fit: cover; object-position:
center top`. 272 px wide alone, 182 px when two share a beat (max 200 at ≤ 860). Every `<img>`
carries `width="600" height="1387"`, an `alt` naming the screen, and `loading="lazy"` on every beat
but the first — which **works here** because the phones are laid out down the page, where the
shipped carousel stacked all ten at `inset: 0` inside one visible frame and loaded 1.82 MB at once.

### 3.4 The example label
Under the clock and under every beat's copy: *Example member · captured from the app's signed-out
preview* — the homepage's own convention (`index.html`'s `.exlabel`), Doto 700 / ROND 30, 10 px,
in `--ex` (`#e6c373`), with the dot before it. ⚠ **The label is what makes the demo persona's
figures allowed on this page** (the honest-data doctrine: *never claim it unlabelled*); it is not
decoration and a guard pins one per beat.

### 3.5 The doors (`#notify`)
Left: eyebrow *Members · one platform fee · cancel any time* · `$5` Doto 900 / ROND 100, 72 px, with
`/mo` beside it · *Browse every coach, message your pros, track the whole loop, log meals, listen to
Radio. Coaches join free.* · **Get started →** (`/newdesign/Landing.html`) and **See pricing**
(`/newdesign/Pricing.html`).
Right: *Coming to the App Store and Google Play* · *We will send the store link the day it ships.
Nothing else, ever.* · the two store chips (the shipped page's own Apple and Play glyphs) · the
notify widget (the shipped toggle + form + status line, `:237–244`) · **Or open it in your
browser →** (`/m/`).

⚠ **The chips set the platform, and the form sends it.** The shipped form posts
`{ email: email, source: 'GetApp.html' }` (`:431`) and the route
(`src/app/api/app-waitlist/route.ts:13`) reads `body.platform` and **defaults a missing one to
`ios`** — so every Google Play sign-up has been recorded as an App Store one. Each chip's click
handler (the shipped `openForm`, `:394–399`, and the chip listeners `:401–407`) also sets a hidden `<input name="platform">` to
`ios` or `android`; the body becomes `{ email, platform, source: 'GetApp.html' }`. The route needs
no change.

---

## 4. Files

| File | Change |
|---|---|
| `public/newdesign/GetApp.html` | rewritten (§1–3, Appendix A) |
| `public/newdesign/pageShell.jsx:1219` | ⚠ mark the footer comment's *"`GetApp.html` hand-writes a third"* — it no longer does; a comment describing the defect this change removes is an instruction to re-add it |
| `tests/site-footer.test.mjs:31, :84` | remove the `GETAPP` read and the `['GetApp.html', staticTable(…)]` entry from `COPIES` (the page renders the shared `<Footer />` now, so the shared table *is* its footer); keep the absence check; the test's header comment `:13` gets a one-line ⚠ |
| `tests/getapp-page.test.mjs` | new (§5) |
| `docs/REVIEW-2026-09-17-app-page.md` | already marked (§5 superseded, §6 answered) |

No migration. No route. No mobile change. No i18n (the website is English).

---

## 5. Guards — `tests/getapp-page.test.mjs`

Model the type guard on `tests/members-page-type.test.mjs` (it parses the Google Fonts request into
axis ranges — split on `..`, never a `[\d.]+` class — and compares them against every
`font-variation-settings` and `font-weight` the page uses; here the CSS is inline in the HTML, so
read the `<style>` block rather than a `.jsx`).

1. **Type.** Every axis the page sets (`wdth`, `ROND`) is requested for the family that carries it,
   every `font-weight` used on Doto and Anybody is inside the requested range, and the font link is
   byte-identical to `index.html`'s.
2. **The ten screens are all in the DOM.** Exactly ten `<img>` inside `.ph`, their `src` files
   (query stripped) exist under `public/newdesign/`, each PNG header reads **600×1387** (bytes
   16–24, big-endian), the set equals the ten files in §3.2, and no `dark:` / `.phone.dark` /
   `var STEPS` survives (the carousel is gone). Vacuity floor: exactly 10, never `>= 1`.
3. **Every beat carries the example label** — count `.beat` and count `.exlabel` inside them; equal
   and ≥ 8. Plus one under the clock.
4. **The chrome.** Exactly one `<Header active="App"` and one `<Footer` in the page's babel script;
   no `id="site-footer"`; `pageShell.jsx` is loaded before the mount script.
5. **The doors resolve.** `Landing.html`, `Pricing.html` exist; the `/m/` door is present and
   `vercel.json`'s `buildCommand` still carries `build-m.sh` (the app's build is the door's target —
   `public/m` is gitignored, so `existsSync` is the wrong question).
6. **The waitlist sends the platform.** The POST body literal contains `platform`, the hidden input
   exists, and both chips set it (`ios`, `android`); the route's default at `route.ts:13` is
   unchanged, so a body without it would still be filed as iOS — which is why the input is asserted.
7. **The figures.** `13` in the clock equals the count of locale directories that ship; `10` equals
   the number of `.ph` images.
8. **No banned phrase** — already covered by `tests/radio-marketing-pitch.test.mjs`, which reads
   this page; run it and say so.

**Mutations to run, each proven to land** (anchor occurrence-counted; the suite's `# pass`/`# fail`
parsed): drop `ROND` from the font link · drop one `<img>` · point one `src` at a file not in the
repo · drop one beat's `.exlabel` · rename the mount id to `site-footer` · drop `platform` from the
POST body · change the clock's `13` · add *"tuned to your session"* to the RADIO body · reorder the
scripts so the mount runs before `pageShell.jsx`.

---

## 6. Verification for the PR

- `npm test` · `node scripts/build-newdesign.mjs --check` (72 pages today; this page's two
  `text/babel` tags join the compiled set) · `tsc --noEmit` untouched (no `src/` change).
- **Driven in Chromium at 1440 · 1280 · 1024 · 860 · 390 · 320 in the real faces.** The container
  blocks `fonts.gstatic.com`, so serve the three families locally from `@fontsource-variable`
  (`npm pack` works through the proxy) and fulfil the Google Fonts CSS request with `@font-face`
  rules using **absolute** URLs (a root-relative `url()` resolves against the Google origin and
  silently falls back); prove the faces by the **width axis** (one string at `wdth` 50 against
  150 — a fallback measures the same both ways; `document.fonts.check()` answers true for a
  fallback and settles nothing). Fulfil `/api/me` with `200 {user:null}` so the header renders
  signed-out. Assert: zero horizontal overflow, zero page errors, zero controls under 24 px, the
  App tab lit, one footer grid, ten images at their natural 600×1387, the sticky copy and phone
  holding at `top: 96` mid-beat at 1440 and static at 390, both doors resolving, the form posting
  `platform: "android"` after the Play chip, and the page heights within a few percent of the
  board's 7,087 / 7,727.
- ⚠ **Look at the render, not only the numbers** — the board's B was looked at; a build that only
  measures it re-pays the lessons this repo records about instruments that report on themselves.
- Reduced motion: nothing animates, so nothing to gate. With JS off: the whole page but the chrome
  renders (the words and images are in the HTML) — state that in the PR rather than implying the
  chrome does too.

---

## 7. PR plan

One PR: `GetApp.html`, the `pageShell.jsx` comment, `tests/site-footer.test.mjs`, the new guard.
`@codex review` once, front-loaded (what changed, the two defaulted rulings to attack, the sticky
choreography and the lazy-load as the areas to check). Merge gate unchanged: CI green on the final
head and not a draft. Records after the PR: the WORKLOG entry, and the review's §6 marked with
whatever the round changed.

---

## Appendix A — the board's CSS and markup, generated from the same source as the render

⚠ Generated by the concept board's generator with the image paths pointed at the site's captures
and the mimic header/footer rules removed — **not retyped**. The `Get started` hrefs in it are the
generator's `#` placeholders; §3.1 and §3.5 give the real targets. The `.wrap`, type, phone, door
and footer-base rules are the board's; the `@media (max-width:860px)` block is the phone layout
that measured 7,727 px with zero overflow at 390.

```css
:root{--disp:'Anybody',system-ui,sans-serif;--num:'Doto',ui-monospace,monospace;--sans:'Schibsted Grotesk',system-ui,sans-serif;
  --paper:#06090f;--paper2:#0a0f17;--ink:#eef3f0;--ink2:rgba(238,243,240,.72);--ink3:rgba(238,243,240,.55);--line:rgba(238,243,240,.12);--line2:rgba(238,243,240,.07);--acc:#34d6c5;--accText:#34d6c5;--ex:#e6c373;--btnBg:#34d6c5;--btnFg:#04110f;--hdBg:rgba(11,14,12,.55)}
*{box-sizing:border-box}html,body{margin:0;padding:0}body{background:var(--paper);color:var(--ink);font-family:var(--sans);-webkit-font-smoothing:antialiased;overflow-x:hidden}
img{display:block;max-width:100%}a{color:inherit;text-decoration:none}
.wrap{max-width:1180px;margin:0 auto;padding:0 32px;width:100%}
/* type */
.eb{font-family:var(--num);font-weight:700;font-size:12px;letter-spacing:.09em;text-transform:uppercase;font-variation-settings:'ROND' 30;color:var(--accText)}
.eb2{font-family:var(--num);font-weight:700;font-size:11px;letter-spacing:.09em;text-transform:uppercase;font-variation-settings:'ROND' 30;color:var(--ink2)}
.num{font-family:var(--num);font-weight:700;font-variation-settings:'ROND' 30;letter-spacing:.04em}
.big{font-family:var(--num);font-weight:900;font-variation-settings:'ROND' 100;font-size:72px;line-height:1;letter-spacing:-.01em;color:var(--ink)}
.big i{font-style:normal;font-family:var(--sans);font-weight:500;font-size:20px;letter-spacing:0;color:var(--ink2);margin-left:6px}
h1,h2,h3{font-family:var(--disp);font-weight:500;letter-spacing:-.012em;margin:0;font-variation-settings:'wdth' 92}
h1{font-size:72px;line-height:.98}h2{font-size:34px;line-height:1.06}h3{font-size:24px;line-height:1.12}
p{font-size:16px;line-height:1.55;color:var(--ink2);margin:0}
.exlabel{display:inline-flex;align-items:center;gap:6px;font-family:var(--num);font-weight:700;font-size:10px;letter-spacing:.07em;text-transform:uppercase;font-variation-settings:'ROND' 30;color:var(--ex)}
.exlabel::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--ex);flex:0 0 auto}
/* phone: one bezel, dark, every screen (the captures are the app's Black paper) */
.ph{position:relative;aspect-ratio:600/1387;border-radius:34px;padding:7px;background:#14110d;border:1px solid rgba(255,255,255,.14);box-shadow:0 22px 44px rgba(0,0,0,.28);margin:0 auto}
.ph-scr{width:100%;height:100%;overflow:hidden;border-radius:28px;background:#0b0b0b}.ph-scr img{width:100%;height:100%;object-fit:cover;object-position:center top}
/* buttons + doors */
.btn{display:inline-flex;align-items:center;gap:8px;font-family:var(--sans);font-weight:700;font-size:14px;min-height:46px;padding:0 20px;border:1px solid transparent}
.btn.p{background:var(--btnBg);color:var(--btnFg);clip-path:polygon(0 0,calc(100% - 11px) 0,100% 11px,100% 100%,0 100%)}
.btn.g{border-color:var(--line);color:var(--ink)}
.doors{border-top:1px solid var(--line);background:var(--paper2)}
.doors-in{max-width:1180px;margin:0 auto;padding:64px 32px;display:grid;grid-template-columns:1.2fr 1fr;gap:56px;align-items:start}
.doors-copy p{max-width:46ch;margin-top:18px}.doors .big{margin-top:14px}
.cta-row{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}
.doors-store{padding-top:6px}.doors-store .small{font-size:14px;margin-top:10px;max-width:38ch}
.store-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
.chip{display:inline-flex;align-items:center;gap:10px;min-height:52px;padding:0 16px;border:1px solid var(--line);color:var(--ink);border-radius:4px}
.chip small{display:block;font-family:var(--num);font-weight:700;font-size:9px;letter-spacing:.1em;text-transform:uppercase;font-variation-settings:'ROND' 30;color:var(--ink2)}.chip b{display:block;font-size:14px;font-weight:600}
.gl{width:18px;height:18px;flex:0 0 auto;display:block}
.try{display:inline-block;margin-top:16px;font-family:var(--sans);font-size:14px;font-weight:600;color:var(--accText);border-bottom:1px solid var(--accText);padding:4px 0}
@media (max-width:860px){
  .wrap{padding:0 18px}h1{font-size:44px}h2{font-size:28px}.big{font-size:56px}
  .doors-in{grid-template-columns:1fr;gap:36px;padding:44px 18px}
}
.hero{padding:76px 0 40px;display:grid;grid-template-columns:1.15fr 1fr;gap:48px;align-items:end}
.hero h1{font-size:92px;margin-top:14px}.hero p{font-size:18px;max-width:46ch;margin-top:16px}
.hero .cta-row{margin-top:30px}.hero-side{padding-bottom:10px}
.hero-side .clock{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.clock div{border:1px solid var(--line);padding:12px 12px 10px}.clock .num{font-size:22px;color:var(--ink);display:block;font-weight:900;font-variation-settings:'ROND' 100}.clock .eb2{margin-top:6px;display:block}
.tl{position:relative;border-top:1px solid var(--line);margin-top:24px}
.beat{position:relative;display:grid;grid-template-columns:1fr 380px;gap:56px;padding:48px 0 56px;border-bottom:1px solid var(--line2);min-height:600px}
.beat::before{content:'';position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 60% 70% at 78% 40%,var(--sky),transparent 70%)}
.beat-copy{padding-left:120px;position:relative;align-self:start;position:sticky;top:96px}
.beat .time{position:absolute;left:0;top:2px;font-family:var(--num);font-weight:900;font-variation-settings:'ROND' 100;font-size:26px;color:var(--acc);letter-spacing:.02em;width:100px}
.beat .time.sun{font-size:16px;font-weight:700;font-variation-settings:'ROND' 30;letter-spacing:.09em;padding-top:5px}
.beat h2{margin-top:10px;font-size:44px}.beat p{margin-top:14px;max-width:44ch;font-size:16px}.beat .num{margin-top:16px;font-size:12px;color:var(--ink);display:inline-block}.beat .num b{color:var(--acc)}
.beat-ph{position:sticky;top:96px;align-self:start;display:flex;gap:16px;justify-content:center;min-width:0}.beat-ph .ph{flex:0 1 auto;min-width:0}
.beat .exlabel{margin-top:14px;display:inline-flex}
@media (max-width:860px){.hero{grid-template-columns:1fr;gap:20px;padding:30px 0 18px}.hero h1{font-size:44px}.hero-side .clock{grid-template-columns:repeat(2,1fr)}
 .beat{grid-template-columns:1fr;gap:18px;padding:24px 0 28px;min-height:0}.beat-copy{padding-left:0;position:static}.beat .time{position:static;width:auto;margin-bottom:8px;display:block}.beat h2{font-size:28px}.beat-ph{position:static;gap:12px}.beat-ph .ph{max-width:200px}.beat .time{font-size:22px}.beat p{font-size:14px;margin-top:10px}.beat::before{background:radial-gradient(ellipse 80% 40% at 50% 70%,var(--sky),transparent 70%)}}
```

```html
<div class="wrap">
  <section class="hero">
   <div>
    <div class="eb">The app &#183; one day, hour by hour</div>
    <h1>One day on Shape.</h1>
    <p>From the first check-in to the last set logged, this is what a member’s day looks like inside the app. Every screen below is the real app in its signed-out preview; nothing is a mock-up.</p>
    <div class="cta-row"><a class="btn p" href="#">Get started &#8594;</a><a class="btn g" href="#notify">Notify me when it ships</a></div>
   </div>
   <div class="hero-side"><div class="clock">
    <div><span class="num">10</span><span class="eb2">screens</span></div><div><span class="num">$5</span><span class="eb2">a month</span></div><div><span class="num">13</span><span class="eb2">languages</span></div><div><span class="num">0</span><span class="eb2">ads on Radio</span></div>
   </div><div style="margin-top:14px"><span class="exlabel ">Example member &#183; captured from the app’s signed-out preview</span></div></div>
  </section>
  <div class="tl">
  <section class="beat" style="--sky:rgba(255,180,84,.14)">
   <div class="beat-copy"><div class="time">06:45</div><div class="eb">WAKE &#183; HOME</div><h2>Today, at a glance.</h2><p>The Shape Daily: calendar, calorie ledger, what is left to log, who is on the air. Skim it in five seconds, dive in if you want.</p><div class="num"><b>&#9632;</b> 1568 / 2100 kcal · check-in due</div></div>
   <div class="beat-ph"><div class="ph" style="width:272px"><div class="ph-scr"><img src="/newdesign/getapp-home-v5.png?v=20260917" alt="The app’s home screen" width="600" height="1387"></div></div></div>
  </section><section class="beat" style="--sky:rgba(255,180,84,.08)">
   <div class="beat-copy"><div class="time">07:20</div><div class="eb">BREAKFAST &#183; EAT</div><h2>Macros, tallied live.</h2><p>Daily meal plans from your nutritionist. The day’s deficit or surplus ticks as you log; swaps are built in.</p><div class="num"><b>&#9632;</b> 532 kcal left · protein 118 / 165</div></div>
   <div class="beat-ph"><div class="ph" style="width:272px"><div class="ph-scr"><img src="/newdesign/getapp-nutri-v3.png?v=20260910" alt="The app’s eat screen" width="600" height="1387"></div></div></div>
  </section><section class="beat" style="--sky:rgba(52,214,197,.10)">
   <div class="beat-copy"><div class="time">09:00</div><div class="eb">TRAIN &#183; TRAIN</div><h2>Know what’s coming.</h2><p>Every move, set and cue from your trainer, before you walk into the gym. No coach yet? Build your own week from a starter template.</p><div class="num"><b>&#9632;</b> 6 moves · 54 min · RPE 8</div></div>
   <div class="beat-ph"><div class="ph" style="width:272px"><div class="ph-scr"><img src="/newdesign/getapp-train-v3.png?v=20260910" alt="The app’s train screen" width="600" height="1387"></div></div></div>
  </section><section class="beat" style="--sky:rgba(52,214,197,.08)">
   <div class="beat-copy"><div class="time">10:15</div><div class="eb">LOGGED &#183; THE WALL</div><h2>Records, on the wall.</h2><p>Every personal best lands on a board your people can see, with the whole session under it and your coach’s co-sign.</p><div class="num"><b>&#9632;</b> 245 lb · new PR</div></div>
   <div class="beat-ph"><div class="ph" style="width:272px"><div class="ph-scr"><img src="/newdesign/getapp-wall-v1.png?v=20260911b" alt="The app’s the wall screen" width="600" height="1387"></div></div></div>
  </section><section class="beat" style="--sky:rgba(238,243,240,.05)">
   <div class="beat-copy"><div class="time">13:00</div><div class="eb">SHOP &#183; GROCERY</div><h2>A list that builds itself.</h2><p>Organized by aisle with a live running cost. Coach swaps land inline; one tap sends the whole list to Instacart.</p><div class="num"><b>&#9632;</b> 89 items · ~$44 to go</div></div>
   <div class="beat-ph"><div class="ph" style="width:272px"><div class="ph-scr"><img src="/newdesign/getapp-grocery-v2.png?v=20260910" alt="The app’s grocery screen" width="600" height="1387"></div></div></div>
  </section><section class="beat" style="--sky:rgba(52,214,197,.12)">
   <div class="beat-copy"><div class="time">18:00</div><div class="eb">RADIO &#183; RADIO</div><h2>Great music, included.</h2><p>The Shape Radio station and the playlists your coaches put together, ad-free, inside the app. Membership covers it; nothing extra to buy.</p><div class="num"><b>&#9632;</b> Ad-free · included</div></div>
   <div class="beat-ph"><div class="ph" style="width:272px"><div class="ph-scr"><img src="/newdesign/getapp-radio-v3.png?v=20260917" alt="The app’s radio screen" width="600" height="1387"></div></div></div>
  </section><section class="beat" style="--sky:rgba(120,110,255,.10)">
   <div class="beat-copy"><div class="time">20:30</div><div class="eb">THE ROOM &#183; COMMUNITY + HABITS</div><h2>The social side of strong. Small things, tracked.</h2><p>See who is training right now, ask the room a question, answer someone else’s. A members’ feed, channels for your people, and a thread straight to your coach. Tap to log. Earn Shape Score for every check, and see the last seven days as a grid.</p><div class="num"><b>&#9632;</b> Feed · Team · Channels · Support &#183; +3 banked today</div></div>
   <div class="beat-ph"><div class="ph" style="width:182px"><div class="ph-scr"><img src="/newdesign/getapp-community-v2.png?v=20260911" alt="The app’s community screen" width="600" height="1387"></div></div><div class="ph" style="width:182px"><div class="ph-scr"><img src="/newdesign/getapp-habits-v1.png?v=20260910" alt="The app’s habits screen" width="600" height="1387"></div></div></div>
  </section><section class="beat" style="--sky:rgba(230,195,115,.10)">
   <div class="beat-copy"><div class="time sun">SUNDAY</div><div class="eb">THE WEEK &#183; SCORE + PROFILE</div><h2>One number that matters. A profile that’s alive.</h2><p>A five-tier ladder rewarding consistency across training, nutrition and recovery. It only moves when you show up. Your climb, your Shape Score, PRs and playlists on a living page that grows as you do. Public or private; it is yours.</p><div class="num"><b>&#9632;</b> 1,284 pts · Tempo &#183; 43% of the way to Form</div></div>
   <div class="beat-ph"><div class="ph" style="width:182px"><div class="ph-scr"><img src="/newdesign/getapp-score-v3.png?v=20260910" alt="The app’s score screen" width="600" height="1387"></div></div><div class="ph" style="width:182px"><div class="ph-scr"><img src="/newdesign/getapp-profile-v2.png?v=20260911" alt="The app’s profile screen" width="600" height="1387"></div></div></div>
  </section>
  </div>
 </div>
 
<section class="doors" id="notify"><div class="doors-in">
  <div class="doors-copy">
    <div class="eb">Members &#183; one platform fee &#183; cancel any time</div>
    <div class="big">$5<i>/mo</i></div>
    <p>Browse every coach, message your pros, track the whole loop, log meals, listen to Radio. Coaches join free.</p>
    <div class="cta-row"><a class="btn p" href="#">Get started &#8594;</a><a class="btn g" href="#">See pricing</a></div>
  </div>
  <div class="doors-store">
    <div class="eb2">Coming to the App Store and Google Play</div>
    <p class="small">We will send the store link the day it ships. Nothing else, ever.</p>
    <div class="store-row"><a class="chip" href="#notify"><svg class="gl" viewBox="0 0 24 24" aria-hidden="true"><path d="M16.365 1.43c0 1.14-.42 2.2-1.13 3.02-.82.97-2.16 1.72-3.27 1.63-.14-1.1.42-2.27 1.1-3.04.78-.89 2.16-1.55 3.3-1.61zM20.5 17.05c-.55 1.27-.82 1.84-1.53 2.96-.99 1.57-2.39 3.53-4.12 3.54-1.54.02-1.94-1.01-4.03-1-2.09.01-2.53 1.02-4.07 1-1.73-.02-3.05-1.78-4.04-3.35C.27 17.5-.18 13.5 1.36 11.04c1.04-1.66 2.69-2.64 4.24-2.64 1.58 0 2.57 1.06 3.87 1.06 1.26 0 2.03-1.06 3.86-1.06 1.38 0 2.85.75 3.9 2.05-3.43 1.88-2.87 6.77.27 8.6z" fill="currentColor"/></svg><span><small>Notify me on</small><b>App Store</b></span></a><a class="chip" href="#notify"><svg class="gl" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.6 2.1a1 1 0 0 0-.6.92v17.96a1 1 0 0 0 .6.92l10.13-9.9zm11.27 7.07 2.9-2.83-8.9-5.06a1 1 0 0 0-.5-.14zm0 5.66-6.5 6.3a1 1 0 0 0 .5-.14l8.9-5.06zm1.4-1.37 3.5-1.99a1 1 0 0 0 0-1.74l-3.5-1.99-3.18 3.1z" fill="currentColor"/></svg><span><small>Notify me on</small><b>Google Play</b></span></a></div>
    
  </div>
</div></section>
```
