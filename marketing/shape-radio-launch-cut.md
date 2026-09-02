# Shape Radio — the launch cut (recipe, sources, and what the versions are)

Status: DRAFT for the owner · 2026-09-01, variants and v4 2026-09-02. The production record for the ~28 s vertical
brand video cut this session — **v4 is the current cut (2026-09-02)**; v3 is the record it
was cut from and v1/v2 are kept at the end as the superseded record. The strategy lives in `social-brand-awareness-plan.md`; the
shot-by-shot scripts in `shape-radio-video-scripts.md` and
`social-video-ideas-wave-2.md`. This file exists so the cut can be re-rendered,
re-timed or re-scored without re-deriving anything below.

**2026-09-02:** the owner liked both alternates too (*"i like both of them. We can use
both"*), so the same cut now exists on all three tracks — see "Variants (2026-09-02)".
v3 stays the primary; the alternates add a kick-presence gate and nothing else.

**2026-09-02, later:** *"shape radio should only appear in the last clip and make it so it
fits on the main wall"* → **v4**, on all three tracks — see "What v4 is". Everything below
that describes the phone morph or a 1240 px wordmark is v3 and carries a ⚠ pointer.

**2026-09-02, later still:** *"also the videos need to have a lot more going on. Create
videos that show the other features of the app"* → four **feature spots** (TRAIN · EAT ·
COMMUNITY · SCORE) + **launch cut v5** (v4 + a phone montage on beats 20→32) — see "The
feature spots + launch v5". **v4 stays the launch cut until the owner rules on the
montage.**

The review links handed over in-session are short-lived uploads and are deliberately
NOT recorded here (they die). The SOURCES are permanent. Nothing is posted anywhere.

---

## What v3 is

Three Higgsfield generations, crossfaded, **1440×2560 · 24 fps · 27.917 s (670
frames)**, scored by an **owned** Higgsfield deep dark tech-house track. Every cut lands
on a beat of the MEASURED grid (119.45 BPM — see "The beat grid"):

- **0.00–8.07 s — Scene A**: an athlete wrapped in light ribbons, over the track's
  kick-less intro (dark pads; the percussion enters at 6.0 s).
- **8.07 s — the kick drops and the phone lands.** The A→B fade (0.3 s) ENDS on beat
  16, the first kick; the SHAPE logo on the phone screen pulses from that beat.
- ⚠ *v3 only — v4 has no phone morph.* **12.09 s (beat 24) — Radio arrives on the phone.** The big triangles fade out and a
  teal "▸◂ RADIO" line fades in under the SHAPE text, at the text's own cap height, cut
  from the real Radio wordmark. The lockup keeps pulsing.
- **17.81–18.11 s — the B→C fade**, ending on beat 36 (a downbeat). The Radio wordmark
  on the club wall ramps in through the fade and lands fully lit ON the beat with a glow
  flash, then pulses to the end.
- **18.11–27.92 s — Scene C**: the wall, the wordmark throbbing on every beat; the audio
  fades over the last 1.275 s.

What the owner's three notes on v2 became: *"need deeper and darker house music"* → a
new track chosen by measurement, not by its prompt; *"shape radio … just appears at the
end"* → the phone reads SHAPE, then SHAPE RADIO, then the wall carries the wordmark — one
motif, three sizes, one grid; *"remove the pulsing rings … just have the logo itself
pulse"* → no rings anywhere, only the logo's own scale + glow. A subtle whole-frame beat
pulse was considered and dropped for the same reason: *just the logo*.

## What v4 is (2026-09-02) — Radio only on the wall, and a lockup that fits it

Owner, on the three 09-02 renders: *"shape radio should only appear in the last clip and
make it so it fits on the main wall."* Two changes, on the SAME grids, gate and timing as
the 09-02 variants — nothing else moved:

- **The phone carries only the SHAPE logo.** The beat-24 morph is deleted: for the whole
  of Scene B (the kick drop on beat 16 to the B→C fade) the logo — triangles + wordmark,
  6 % scale + glow, `k = exp(−u/0.20)`, gated exactly as before — pulses on every beat
  and nothing else appears on the screen. `tM` is no longer read.
  ⚠ *v5 (2026-09-02, later still) differs from v4 only inside the phone rect during beats
  20→32 of Scene B — a six-page app montage on the pick's grid — and v4 stays the launch
  cut until the owner rules; see "The feature spots + launch v5".*
- **Radio appears once, on the club wall, cut to fit the panel.** Scene C is a dark
  central panel in front of a lit club interior, and the panel is NARROW. Measured by
  column means over the lockup's rows in `C.mp4` (dark = mean < 14; the contiguous dark
  run containing x = 718): **x 321–1122 (802 px) at 0.35 s, 283–1154 at 3 s, 241–1198 at
  6 s, 169–1239 at 9.5 s** — it widens with the push-in. The v3 wordmark was 1240 px wide
  at x 100–1340, so it overran the panel on both sides at every frame with the lit
  pillars behind the letters. "Fits" had never been measured; the geometry note that
  "nothing competes" at the centre was true of the centre and false of the wordmark.
- **The lockup is two lines.** A single line that clears the narrowest panel would be
  ~45 px tall — a caption, not a wordmark. `assets.py` cuts the real wordmark into SHAPE
  (x 275–985) and ▸◂ RADIO (x 1095–1918), rows 90–222 as ONE box so both lines share a
  baseline, `MaxFilter(5)`, scales line 2 to `WALL_W = 680` (k = 0.826 → line 1 587×109,
  line 2 680×109, `GAP = 20`) and centres the stack in the 1440×520 band (lit bbox
  x 382–1057, y 153–367 in band coordinates). The band is overlaid at **`wallY = 1040`**
  (a `params.json` field `render3.sh` now reads; 850 was v3's), so the lockup sits at
  frame y 1193–1407 at rest and 1187–1409 at a beat — centred on the panel's own centre
  (≈ y 1300) — with **50 / 58 px of panel either side at the narrowest moment at a beat**
  (61 / 65 at rest) and 211 / 180 px by 9.5 s. The per-frame formula
  (`word + glow·(0.35 + k)`, 3 % scale, the 0.3 s ramp through the fade, the kick gate) is
  v3's, unchanged. `WALL_W` / `WALL_GAP` / `WALLY` re-size or re-place it in one env var.

**Verified per variant** (`verify.py`, extended): the 09-02 checks, plus a **fit** check
at four sample times (the lockup's lit bbox against the measured panel, ≥ 40 px both
sides required — all four pass on all three tracks), a **no-second-line** check (no lit
pixel below row 730 of the screen at any of four samples, while the triangle rows carry
~4 000 lit pixels where v3 read 0 after beat 24) and a SECOND wall window (below). The
numbers: v4 671 fr / 27.959 s, the alternates 669 / 27.875; transition frames match
their sources (0.32 / 1.83 / 1.49 outside the layers); the phone 476–479 px and 20–22 k
lit at a beat against 456 px / 8.8 k mid-beat; the wall blank at its first frame, then
v4 42.5 k / 49.7 k lit at a beat against 19.8 k mid in both windows, alternate 2 40.0 k
against 19.7 k in the first window and still in the second (its kick stops at beat 44),
alternate 1 still in the first (kick-less 16.5–24.1 s) and 39.3 k against 19.8 k in the
second; audio 119.4 / 119.95 / 119.7 BPM, halves agreeing, first kick 8.04 / 0.56 /
8.02 s; tail RMS −17.3 / −19.3 / −25.8 dB against −10.0 / −12.9 / −10.3 mid (INPUT-side
`-ss`). Two frame crops were also looked at (the checksummed transfer below): the logo
alone on the phone; the lockup inside the panel with dark on both sides.

⚠ **The first v4-alt1 render had a silent wall from 24.1 s** — the rebuilt `beat.py` had
truncated the gate array to 48 beats; see "The kick-presence gate". Fixed, re-measured,
re-rendered before upload.

⚠ **Getting a frame OUT of the sandbox to look at is its own instrument.** The local proxy
reaches no file host, so a crop travels as base64 in the tool output and is retyped; an
11 KB block retyped in one piece was corrupt by one character. What works: the sandbox
prints 400-char lines each prefixed with the first 4 hex of its own md5 plus a whole-file
md5; a local script checks every line before decoding and names the bad ones; a bad line
is re-printed in 50-char pieces with their own checksums and only those are retyped. A
"corrected" retype from memory was wrong too — the checksum decides, not the eye.

The three v4 renders are short-lived gofile links handed over in-session (md5-verified),
deliberately not recorded here. The script deltas are under "The v4 deltas".

## The feature spots + launch v5 (2026-09-02) — the real app on the phone, cut to the beat

Owner, on the v4 trio: *"also the videos need to have a lot more going on. Create videos
that show the other features of the app."* Five renders answer it: four ~14.5 s **feature
spots** — **TRAIN · EAT · COMMUNITY · SCORE**, one per owned track — and **launch cut v5**,
the v4 pick with a six-page montage on the phone during beats 20→32. Every frame on the
phone is a **real capture of the shipped app** — the production `/m/` build in its
signed-out preview — composited into the Scene B screen rect (x 416–1026 · y 592–1926,
r ≈ 100, the v1 measurement) on the SAME grids as v4, cut on the beat, captioned in the
website's own register. Nothing else moved: Scenes A/B/C, the logo layers, the v4 wall,
the three tracks and the kick gate are v4's. **v4 stays the launch cut until the owner
rules on the montage.**

### What the five renders are

All five are 1440×2560 · 24 fps · H.264 crf 18 · AAC 192k. A spot is Scene B's static
phone shot (looped forward-then-reverse into `in/B_long.mp4`, 20.25 s) with the phone
screen SCREEN-blended over it, a caption under the phone's top edge for each page, and the
track starting one beat before the first page (two on alternate 1, whose kick runs from bar
one). Beats are the track's own grid beats; a cut lands on every one.

| Render | Track | Runs | Opening logo | Pages (beats) · caption | Close (beats) |
|---|---|---|---|---|---|
| **TRAIN** | t3 (the pick), audio from 7.538 s | 14.573 s · 350 fr | 0–0.50 s, static (no kick yet) | Train deck 0.50–3.02 (5) *Written before you arrive.* → swap sheet 3.02–5.03 (4) *Swap a move.* → live session 5.03–8.04 (6) *The live session.* → a set logged 8.04–10.05 (4) *Every set, logged.* → month calendar 10.05–12.06 (4) *The whole month.* | 12.06–14.57 (5), pulsing |
| **EAT** | t1 (alternate 1), audio from 0.064 s | 14.506 s · 348 fr | 0–1.00 s, pulsing from the first beat | the Menu 1.00–3.50 (5) *The ledger ticks live.* → a meal 3.50–5.50 (4) *Every meal, planned.* → grocery list, Produce opening 5.50–8.00 (5) *The shop list, sorted.* → Recipes 8.00–9.00 (2) + a recipe 9.00–10.50 (3) *Shape Kitchen.* → Cook mode 10.50–12.51 (4) *Cook mode.* | 12.51–14.51 (4), pulsing |
| **COMMUNITY** | t2 (alternate 2), audio from 7.53 s | 14.53 s · 349 fr | 0–0.50 s, static | the feed 0.50–3.01 (5) *The social side of strong.* → Session details 3.01–5.01 (4) *Every session, on the wire.* → Channels 5.01–7.01 (4) *Channels for your people.* → the marketplace 7.01–9.52 (5) *Vetted trainers · Real humans* → a Listing 9.52–12.03 (5) *Browse free before you pay.* | 12.03–14.53 (5), pulsing |
| **SCORE** | t3 (the pick), audio from 7.538 s | 14.573 s · 350 fr | 0–0.50 s, static | Terrain profile → CLIMB tab 0.50–4.02 (7) *A profile that climbs with you.* → Shape Score, THIS TIER / THE LADDER 4.02–6.53 (5) *One number that tells the truth.* → the Habit Ledger 6.53–8.54 (4) *Small things, daily.* → The Contract 8.54–10.05 (3) *The Contract.* → the check-in 10.05–12.06 (4) *How are you today.* | 12.06–14.57 (5), pulsing |
| **launch v5** | t3, the v4 pick's grid (`params_v4.json`: P 0.5023022 · φ 0.03 · T0 7.7668 · T1 18.1129) | 27.9167 s · 671 fr (the `-t` +1-frame quirk, as v4) | v4's logo, beats 16→20 | the montage, film 10.08→16.10 s = beats 20→32: home · deck · session · menu · feed · profile, two beats each, all at ×1.75, **no captions** | the logo back on beat 32, four beats before the wall; the wall is v4's |

Every spot closes on the same card — `THESHAPECOMMUNITY.COM` · *Different goals. One
Community.* · `ONE PLATFORM FEE · $5 /MO · CANCEL ANY TIME` — over the logo pulsing, the
video fading over its last 0.6 s and the audio over its last 0.8 s.

The v5 phone layer runs in layer-local time from T0: logo 0–2.309 s (frames 0–55), then
home 55–80 · deck 80–104 · session 104–128 · menu 128–152 · feed 152–176 · profile
176–200, then the logo 200–248 into the B→C fade (T 10.346 s). Beat 20 on that grid is
film 10.08 s, beat 32 is 16.10 s. Outside those frames v5 is v4 (measured under
"Verification").

### Honesty — what is real on the screen and what is not

- **Every phone frame is a real capture of the production app**, not a mock, not a
  render, not the July screenshots. The captures are read-only walks of the shipped UI at
  the speed a person would use it (0.85–2× playback, see "The plans"); nothing on screen is
  composed or retouched beyond the crop into the phone rect.
- ⚠ **THE FOOTAGE IS THE SIGNED-OUT PREVIEW, AND THAT IS STATED RATHER THAN HIDDEN.** It is
  what every prospect sees when they tap PREVIEW THE APP FIRST — but it is DEMO data: the
  demo persona (*Quinn Harper*, an AI headshot — "TEMPO TIER · 14 WEEK STREAK", "419
  FOLLOWERS · 262 FOLLOWING · 63 POSTS", "TRAINING FOR · FIRST HALF-MARATHON · NOV 15",
  "SHAPE SCORE 1284 pts · 716 TO FORM", a demo coach credit), the demo cast on the feed, in
  the channels and on the marketplace (AI-generated portraits with fictional names — the
  self-hosted set the 2026-06-09 / 2026-07-14 changelog entries record), demo coach credits
  on the Train deck and the Menu, and a demo calendar (May 2026). The PREVIEW · DEMO DATA
  banner was dismissed for the capture, so **the spots carry the preview's numbers with no
  on-screen "demo" mark**. Nothing in the copy claims a real member's numbers — but the
  brand plan's own rule, *no faked community, the honest-data doctrine extends to camera*,
  needs an **OWNER RULING** on whether the preview cast may appear in a spot at all. The
  sharpest instance is COMMUNITY's *Vetted trainers · Real humans* over a marketplace of
  AI-portrait demo coaches. If the ruling is no: the COMMUNITY spot, and every coach
  credit, is a re-capture of the same recipe on a real account once real members and
  coaches exist; the TRAIN / EAT / SCORE mechanics are unaffected.
- **Owned music only, and no Radio claim at all.** The three tracks are the v3/variant
  Higgsfield generations; the spots never mention Shape Radio, never show the wall, and
  say nothing about a broadcast. The two captions that say *live* (*The live session.* ·
  *The ledger ticks live.*) name app features — the live session player and the Eat
  ledger — not the station. v5 keeps v4's wall lockup untouched.
- **What the preview allows, exactly.** Writes route to the paywall, so every segment is a
  read-only walk: the swap sheet is opened, never confirmed; "✓ Mark set 1 done" registers
  locally on the session page; the grocery Produce / Apple taps act on page state; Cook
  mode advances one step. Nothing was logged, posted, followed or bought.
- **Captions** are the website's own register: six of the twenty spot captions and both
  lines of the close are the website's own words verbatim, three are the product's own
  names, two are adapted from house copy and nine are new short lines — the table under
  "The captions" says which is which. **Those fourteen want the owner's eye.**

### The captures (`pw/lib.js` · `pw/tour4.js` · `seg2mp4.py`)

- **Environment.** Playwright 1.49.1 in the sandbox's `/home/user/pw`
  (`PLAYWRIGHT_BROWSERS_PATH=/home/user/.cache/ms-playwright`, chromium `--no-sandbox`),
  a 375×820 viewport at DPR 2 with an iPhone iOS 17 UA + `isMobile` + `hasTouch`, so a
  frame is 750×1640 — the phone's own aspect, scaled 610×1334 into the screen rect.
- **The full-bleed native render.** On a phone-sized web viewport the app draws its desktop
  preview bezel. `isNativeBSApp()` reads the `is-native-app` class on `<html>`, which
  `main.jsx` adds only under Capacitor — so an init script (`INIT` in `lib.js`) adds it
  through a MutationObserver the moment `documentElement` exists, and the capture has no
  bezel to crop.
- **The boot path** (`boot()` in `lib.js`): `https://theshapecommunity.com/m/` → 5.5 s →
  "English" (first boot only) → CONTINUE → "Preview the app" → "Step inside" → dismiss
  `[aria-label="Dismiss"]` (the PREVIEW · DEMO DATA banner). Tabs switch through
  `[data-tour="tab-<home|train|eat|chat|me>"]`; the marketplace opens through the app's own
  `shape:openMarket {role:'trainer'}` event; CHANNELS through a button `.click()`. `go()`
  finds a control by text, smooth-scrolls it into the scroller's upper third and clicks it;
  `scroll()` eases the biggest scroller. Five boots — A home · B train · C eat · D chat +
  marketplace · E me — so one page's state never leaks into another spot's segments.
- ⚠ **PLAYWRIGHT'S `recordVideo` PRODUCED A FLAT GREY FILM, AND THE TIMELINE CHECK CAUGHT
  IT.** The first tour's webm read a flat mid-grey (mean luma ~101) on every sampled frame,
  with real content only at the instants `page.screenshot()` had fired — a saturated result
  across the whole file, i.e. the instrument, not the app. `fpstest.js` measured the
  alternatives on the live preview: CDP `Page.captureScreenshot` jpeg **15.2 fps**, CDP png
  15.2, `page.screenshot` jpeg 15.2 — the format is not the bottleneck, the page is. So a
  segment is a **CDP screenshot loop** (jpeg q88, `optimizeForSpeed`) at 11–19 fps with a
  timestamp per frame and the act timestamps (`tab` · `tap` · `scroll` · `day` · `produce`
  · `apple` · `start` · `next` · `open` · `climb` · `signals` · `tier` · `ladder`) written
  beside them in `times.json`.
- ⚠ **WITHOUT `clip` THE CDP CALL RETURNS CSS PIXELS.** The first stitch failed *"width not
  divisible by 2 (375x820)"*. `capFrame()` now asks for
  `clip:{x:0,y:0,width:375,height:820,scale:2}`, reads the JPEG SOF dimensions (`jdim`)
  and falls back to `page.screenshot` if a frame is ever not 750×1640; `seg2mp4.py` scales
  to 750×1640 regardless.
- **The stitch** (`seg2mp4.py`): the concat demuxer with a per-frame `duration` from the
  recorded timestamps → `fps=24,scale=750:1640,format=yuv420p`, libx264 crf 12 — a 24 fps
  CFR mp4 per segment, so a source time in a spec is a real second of the walk.
- **The 23 segments** (frames · ms · capture fps → 24 fps frames; act times in ms):

| Segment | Captured | Acts | Frames at 24 fps |
|---|---|---|---|
| home | 72 · 6595 · 10.9 | scroll 1201 | 156 |
| checkin | 65 · 4063 · 16.0 | tap 401 | 96 |
| goal | 98 · 6212 · 15.8 | tap 401 · scroll 3455 | 147 |
| preview | 86 · 5764 · 14.9 | tap 401 · scroll 3213 | 135 (captured, unused) |
| calendar | 92 · 4898 · 18.8 | tap 401 · day 2636 | 115 |
| deck | 113 · 7125 · 15.9 | tab 301 · scroll 2143 | 168 |
| swap | 63 · 4063 · 15.5 | tap 400 | 97 |
| session | 122 · 7092 · 17.2 | tap 405 · scroll 3643 | 169 |
| setlog | 67 · 4332 · 15.5 | tap 501 | 103 |
| menu | 82 · 5060 · 16.2 | tab 300 · scroll 2144 | 119 |
| meal | 92 · 6077 · 15.1 | tap 401 · scroll 3418 | 145 |
| grocery | 126 · 7033 · 17.9 | tap 402 · produce 2426 · apple 4629 | 167 |
| recipes | 84 · 5035 · 16.7 | tap 400 · scroll 3263 | 120 |
| recipe | 89 · 6311 · 14.1 | tap 401 · scroll 3464 | 150 |
| cook | 130 · 7999 · 16.3 | tap 401 · start 3644 · next 6006 | 191 |
| feed | 61 · 5629 · 10.8 | tab 302 · scroll 2204 | 132 |
| details | 110 · 6655 · 16.5 | tap 402 · scroll 3623 | 158 |
| channels | 78 · 5263 · 14.8 | tab 401 · open 2806 | 125 |
| market | 83 · 5678 · 14.6 | open 400 · scroll 2804 | 135 |
| listing | 114 · 6664 · 17.1 | tap 400 · scroll 3635 | 159 |
| profile | 137 · 11108 · 12.3 | tab 300 · scroll 2135 · climb 6665 · signals 9283 | 264 |
| score | 149 · 9077 · 16.4 | tap 401 · tier 3617 · ladder 5229 · scroll 6247 | 217 |
| habits | 99 · 6375 · 15.5 | tab 300 · tap 1239 · scroll 4272 | 151 |

- ⚠ **A PRODUCTION DEFECT THE CAPTURE FOUND — REGISTERED, NOT FIXED.** On an earlier tour
  (boot D) the marketplace tap matched the row **TRAINER · DIEGO MORALES** and the app
  crashed to its error boundary — *"Something went wrong · The app hit an error and
  recovered. Details below — tap Copy and send them over. Cannot read properties of
  undefined (reading '0') TypeError"* — and the FULL PROFILE tap that followed read MISS.
  Leah Kim's Listing (Coach of the Week) opened normally in `tour4.js`, so the COMMUNITY
  spot uses hers. Observed on production, not root-caused here — a marketing branch is not
  the place. War Room item under Marketplace & coach profiles.

### The captions (`captions.py`)

A caption is a 1440×260 RGBA PNG (the close 1440×300) overlaid at y 300, under the phone's
top edge: a mono eyebrow (JetBrains Mono 34 px / 700, tracking 0.22 em, teal 52·214·197) over
a serif line (Newsreader 96 px, opsz 72, auto-shrunk in 4 px steps until it fits 1300 px,
cream 242·237·228) with the `*accent*` run in italic teal; the close adds a mono sub-line
(28 px / 600, tracking 0.18 em, cream at α 200). A blurred black copy of the alpha
(×0.85, σ 12) composited twice at (0, +5) carries the text over a lit screen. Fonts:
`JetBrainsMono[wght]`, `Newsreader[opsz,wght]`, `Newsreader-Italic[opsz,wght]` and
`Saira[wdth,wght]` from `github.com/google/fonts` (ofl), fetched into `/home/user/fonts/`.

| Spot · nº | Eyebrow | Line | Provenance |
|---|---|---|---|
| train 0 | TRAIN | Written before *you arrive.* | verbatim — index.html, journey 01 |
| train 1 | TRAIN | Swap a *move.* | new |
| train 2 | TRAIN | The *live* session. | new |
| train 3 | TRAIN | Every set, *logged.* | new |
| train 4 | TRAIN | The whole *month.* | new |
| eat 0 | EAT | The ledger ticks *live.* | new |
| eat 1 | EAT | Every meal, *planned.* | new |
| eat 2 | EAT | The shop list, *sorted.* | new |
| eat 3 | EAT | Shape *Kitchen.* | the product's own name |
| eat 4 | EAT | Cook *mode.* | the product's own name |
| community 0 | COMMUNITY | The social side of *strong.* | verbatim — GetApp.html, the COMMUNITY slide |
| community 1 | COMMUNITY | Every session, *on the wire.* | new |
| community 2 | COMMUNITY | Channels for *your people.* | new |
| community 3 | COACHES | Vetted trainers · *Real humans* | verbatim — index.html (⚠ over AI-portrait demo coaches) |
| community 4 | COACHES | Browse free *before you pay.* | verbatim — index.html, marketplace |
| score 0 | PROFILE | A profile that *climbs* with you. | verbatim — index.html, journey 05 |
| score 1 | SHAPE SCORE | One number that tells *the truth.* | verbatim — index.html, journey 03 |
| score 2 | HABITS | Small things, *daily.* | adapted — GetApp.html "Small things, tracked." |
| score 3 | GOALS | The *Contract.* | the product's own name (goal.json "The contract") |
| score 4 | CHECK-IN | How are you *today.* | adapted — the home card "How are you · today" |
| close | THESHAPECOMMUNITY.COM | Different goals. *One Community.* · sub `ONE PLATFORM FEE · $5 /MO · CANCEL ANY TIME` | verbatim — index.html hero + the pricing eyebrow / $5 per month |

Six of twenty verbatim, plus both close lines; three names, two adaptations, nine new.
(`launch_0.png`, *Everything in one place.*, was rendered and is unused — v5 carries no
captions.)

### The plans (`mkspecs.py`)

- **A source window per segment** is a RULE `(start_act, +s, end_act, +s[, max_speed])`
  over the recorded act times — `'rec'` means the recording start; `s1` is clamped to
  `total − 0.05` and `s0` to `[0, s1 − 0.5]`. A page gets whole beats; its **playback speed**
  is `(s1 − s0) / (beats · P)`, clamped to **0.85–1.75×** (2.0× on the profile, the one
  per-rule override). A clamped segment simply ends mid-scroll — those are the montage's
  cuts, accepted.
- **Timing.** `aoff = max(0, φ + b_first·P − lead·P)` (lead = 1 beat, 2 on alternate 1);
  `tb(b) = φ + b·P − aoff`; `T = tb(T_end_beat)`. The opening logo runs 0 → `tb(b_first)`;
  the closing logo runs from the last page's end to T with a 0.35 s crossfade; the first
  page crossfades 0.25 s out of the logo, pages cut hard into each other.
- **Captions** ride `(t0 + 0.02, t1 − 0.02)` of their page with 0.18 s alpha fades; the
  close caption runs `t0 + 0.05 → T + 0.5` with 0.25 s fades. The screen layer's envelope
  is `clamp(t/0.3) · clamp((T − t)/env_out)` — `env_out` 0.5 on a spot, 0.3 on v5 (inside
  the B→C fade). Video fade-out 0.6 s; audio fade in 0.2 / out 0.8 s, with an INPUT-side
  `-ss aoff` (the v1/v2 lesson).
- **The logo** follows the v3 rule: `kof = 0` before `grid.t_b0`, else `exp(−u/0.20) ·
  pres(n)` with `pres = clip((kick_by_beat[n] − 0.15)/0.30, 0, 1)` from that track's
  `meas_t<n>.json` — so the opening logo is static on t2/t3 (no kick before beat 16) and
  pulses from the first beat on t1, and every close pulses. v5 passes `[1.0]*80` so the
  pick stays ungated, exactly as v4 is.
- ⚠ **THE PROFILE SEGMENT WAS RE-PLANNED ONCE.** Its first RULE (`('tab',0.9,'signals',1.6)`,
  six beats) at the 1.75× cap never reached the CLIMB tab — the caption promised a profile
  that climbs and the page never got there. Now `('tab',0.5,'climb',1.3, 2.0)`: seven beats
  at 2.0×, the Shape Score page giving up one (6 → 5). SCORE was re-rendered before anything
  was uploaded.
- **Windows and speeds**, re-derived from the act times above (P = 0.502513 on t3, 0.500208
  on t1, 0.501044 on t2; v5 pages are two beats of the v4 grid, every one at the 1.75× cap):

| Segment | RULE | s0 → s1 | Used by · speed |
|---|---|---|---|
| home | ('rec',0.4,'scroll',2.9) | 0.40 → 4.101 | v5 ×1.75 |
| checkin | ('tap',0.4,'tap',2.8) | 0.801 → 3.201 | SCORE ×1.194 |
| goal | ('tap',0.4,'scroll',2.3) | 0.801 → 5.755 | SCORE ×1.75 |
| preview | ('tap',0.4,'scroll',2.1) | 0.801 → 5.313 | — |
| calendar | ('tap',0.4,'day',1.8) | 0.801 → 4.436 | TRAIN ×1.75 (1.808 clamped) |
| deck | ('tab',0.9,'scroll',2.7) | 1.201 → 4.843 | TRAIN ×1.45 · v5 ×1.75 |
| swap | ('tap',0.35,'tap',2.6) | 0.75 → 3.0 | TRAIN ×1.119 |
| session | ('tap',0.4,'scroll',1.9) | 0.805 → 5.543 | TRAIN ×1.571 · v5 ×1.75 |
| setlog | ('tap',−0.4,'tap',2.0) | 0.101 → 2.501 | TRAIN ×1.194 |
| menu | ('tab',0.9,'scroll',2.5) | 1.2 → 4.644 | EAT ×1.377 · v5 ×1.75 |
| meal | ('tap',0.4,'scroll',2.3) | 0.801 → 5.718 | EAT ×1.75 |
| grocery | ('tap',0.5,'apple',1.5) | 0.902 → 6.129 | EAT ×1.75 |
| recipes | ('tap',0.4,'scroll',1.5) | 0.8 → 4.763 | EAT ×1.75 |
| recipe | ('tap',0.4,'scroll',2.5) | 0.801 → 5.964 | EAT ×1.75 |
| cook | ('tap',0.4,'next',1.6) | 0.801 → 7.606 | EAT ×1.75 |
| feed | ('tab',0.9,'scroll',3.1) | 1.202 → 5.304 | COMMUNITY ×1.637 · v5 ×1.75 |
| details | ('tap',0.4,'scroll',2.7) | 0.802 → 6.323 | COMMUNITY ×1.75 |
| channels | ('tab',0.5,'open',2.2) | 0.901 → 5.006 | COMMUNITY ×1.75 |
| market | ('open',0.5,'scroll',2.5) | 0.9 → 5.304 | COMMUNITY ×1.75 |
| listing | ('tap',0.4,'scroll',2.7) | 0.8 → 6.335 | COMMUNITY ×1.75 |
| profile | ('tab',0.5,'climb',1.3, 2.0) | 0.8 → 7.965 | SCORE ×2.0 · v5 ×1.75 |
| score | ('tap',0.4,'scroll',2.5) | 0.801 → 8.747 | SCORE ×1.75 |
| habits | ('tap',0.4,'scroll',1.7) | 1.639 → 5.972 | SCORE ×1.75 |

- **The beat plans**, as `mkspecs.py` builds them (beat spans on each track's own grid):
  TRAIN — deck 16–21 · swap 21–25 · session 25–31 · setlog 31–35 · calendar 35–39 · close
  39–44. EAT — menu 2–7 · meal 7–11 · grocery 11–16 · recipes 16–18 + recipe 18–21 · cook
  21–25 · close 25–29. COMMUNITY — feed 16–21 · details 21–25 · channels 25–29 · market
  29–34 · listing 34–39 · close 39–44. SCORE — profile 16–23 · score 23–28 · habits 28–32 ·
  goal 32–35 · checkin 35–39 · close 39–44. v5 — logo to 20, six pages of two beats to 32,
  logo to the B→C fade.

### The screen layer + the composite (`mk_screen5.py` · `spot.py` · `launch5.sh`)

- **`mk_screen5.py` is the v4 phone-screen layer (mk_screen3 with the v4 deltas) plus
  capture segments.** Same 610×1334 canvas, same logo — `LW = 456` at `(305, 586)`
  (`cy = 0.44·H`), scale `1 + 0.06k`, glow gain `0.25 + 0.9k`, a 0.10 teal ambient with an
  elliptical 380×300 falloff, the r-100 rounded-rect mask. A `cap` segment is decoded with
  `-ss s0 -i src -t dur·speed+0.2 -vf setpts=PTS/speed,fps=24,scale=610:1334:flags=lanczos`
  to raw rgb24 (the last frame held if the window runs short), crossfaded from the previous
  segment's last frame where `xf > 0`, then multiplied by the envelope and the mask and
  piped to libx264 crf 10. The spec (`spec_<name>.json`) carries the grid, the segments and
  the captions; `mk_screen5.py` never reads a track.
- **`spot.py`** writes `graph_<name>.txt` and composes: `[0:v]trim=0:T,setpts,fps=24,
  format=gbrp[base]` from `in/B_long.mp4`; a black 1440×2560 canvas with the layer
  `overlay`'d at (416, 592), `eof_action=pass`; `blend=all_mode=screen` onto the base; one
  `-loop 1 -framerate 24 -t T` PNG input per caption with `fade=t=in/out … alpha=1` and an
  `overlay` at y 300; `fade=t=out:st=T−0.6:d=0.6`; the track as `-ss aoff -i` with `atrim`
  + the two `afade`s. `in/B_long.mp4` is `in/B.mp4` at 24 fps followed by its own reverse
  (`-vf fps=24,reverse` → `B_rev.mp4`, then `concat=n=2:v=1:a=0`) — 486 frames, 20.25 s;
  the seam is invisible because the shot is a static phone, and a 14.5 s spot never
  reaches it.
- **`launch5.sh`** is v4's own render with one substitution: `sed 's/screen_v4/screen_v5/'
  graph_v4.txt > graph_v5.txt`, inputs A · B · C · `screen_v5.mp4` · `wall_v4.mp4` ·
  `t3.m4a`, `-t total` from `params_v4.json`, output `out/shape-radio-launch-v5.mp4`. The
  wall, the fades and the audio are v4's, untouched.

### Verification (`verify5.py spot <name>` · `verify5.py v5 out/shape-radio-launch-v4.mp4`)

The method, per render: **probe** (size · fps · frame count · audio duration); **layer vs
source** — at two sample times per page (`t0 + 0.6` and `t1 − 0.3`, skipping the crossfade)
the phone-screen layer frame against the capture frame it should be, `s0 + (t − t0)·speed`,
rescaled to 610×1334, mean abs diff over the inner crop; **composite vs expected** — the
output inside the rect against `screen(B_long, layer)`; **captions** — lit pixels in rows
300–560 against the bare `B_long` at every caption's midpoint, and **0 at t = 0.2 s**;
**pulse** — the closing-logo layer's bbox and lit count at a beat against mid-beat;
**audio** — `beat.py` re-measures the output's grid, every cut's offset from the nearest
kick onset (±60 ms window), and RMS mid-track against the last 0.5 s. For v5: the montage
layer against its sources, and **v5 vs v4** inside and outside the rect at six times.

| Render | Probe | Layer vs source · composite vs expected | Captions (lit px, t = 0.2) | Close pulse (beat vs mid) | Audio (BPM · φ · cut offsets ms · RMS mid / tail dB) |
|---|---|---|---|---|---|
| TRAIN | 1440×2560 · 14.583 s · 350 fr · audio 14.573 | 1.7–2.3 · 1.2–2.0 (one outlier, deck t 1.10: 6.22) | 26927 · 20679 · 13181 · 13896 · 15099 · close 36697 (0) | 479 px / 23751 lit vs 456 / 8797 | 119.45 · 0.028 · 15 −20 −30 35 30 30 · −7.4 / −15.1 |
| EAT | 14.500 s · 348 fr · audio 14.506 | 1.7–2.3 · 1.2–2.0 | 21904 · 33136 · 16065 · 12779 · 9103 · close 37831 (0) | 480 / 20899 vs 456 / 8879 | 119.9 · 0.0 · 5 0 5 15 0 0 10 · −6.9 / −17.0 |
| COMMUNITY | 14.542 s · 349 fr · audio 14.53 | 1.7–2.3 · 1.2–2.0 (details t 3.61: 3.43; listing t 11.73: 27.22) | 26197 · 41166 · 23895 · 24159 · 21628 · close 36390 (0) | 481 / 18167 vs 456 / 8791 | 119.7 · 0.026 · 30 45 30 35 30 30 · −7.0 / −14.9 |
| SCORE | 14.583 s · 350 fr · audio 14.573 | 1.7–2.3 · 1.2–2.0 (habits t 8.24: 9.87) | 42077 · 40100 · 17496 · 11041 · 15840 · close 36727 (0) | 479 / 23760 vs 456 / 8804 | 119.45 · 0.028 · 15 35 −55 20 30 30 · −7.4 / −15.1 |
| launch v5 | 27.958 s · 671 fr · audio 27.916 | montage: home 1.84 · deck 1.93 · session 1.75 · menu 2.06 · feed 9.97 · profile 1.65 | — (no captions) | v4's | 119.35 · 0.02 · 45 0 40 10 60 5 0 · −7.4 / −21.7 |

- ⚠ **THE FIVE OUTLIERS ARE TIMING, NOT WRONG CLIPS.** A best-match scan over the source
  around each nominal time pins every one to the source frame 1–2 capture frames (≤ 83 ms)
  off the `s0 + (t − t0)·speed` map — the 24 fps resample of an 11–19 fps capture — after
  which they read 1.9–2.0 (listing +1 frame → 1.93, habits −1 → 2.01). On the deck sample
  the page is mid-scroll at t 1.10 and one capture frame is a whole rung. They are recorded
  as the instrument's resolution, not smoothed away.
- **Cuts.** Every cut is within 60 ms of a kick onset; SCORE's one −55 ms is one frame.
  On EAT's grid (φ 0.0) the cuts read 0–15 ms.
- **v5 vs v4**, mean abs diff outside / inside the phone rect: t 4.0 → 0.00 / 0.00 · 9.0 →
  0.26 / 0.18 · 12.5 → 0.40 / **25.45** · 15.0 → 0.42 / **21.75** · 21.0 → 0.26 / 0.27 ·
  26.0 → 0.00 / 0.00. The montage (10.08–16.10 s) is the only change; the sub-0.5 residue
  at 9–21 s is x264 re-encoding, present outside the rect too.

### Hosting, and the sandbox wipe

- **gofile (guest upload) took all five** on 2026-09-02, each md5 matching the sandbox
  file: `shape-train.mp4` f0626309bd57dda332f4aa4aa9ea2ddd · `shape-eat.mp4`
  b19bab62e935f48b524dbdaab6b0ea17 · `shape-community.mp4`
  332ca53646e0926be2269ecc9a36bcfa · `shape-score.mp4`
  9fc28091380a2799227505973913fd94 · `shape-radio-launch-v5.mp4`
  2a190415459edff64d109cde75205487. The links were handed over in-session and are
  deliberately not recorded here; gofile removes a guest file after ~10 days without a
  download, so they are reviewable this week, not permanent. The md5s are the record: a
  file that matches one of them is one of these five.
- ⚠ **THE SANDBOX WAS WIPED AFTER THE UPLOADS, AND THIS RECORD WAS REBUILT FROM THE VERIFIED
  LOGS, NOT RE-MEASURED.** The background lease lapsed during the owner's usage-limit pause;
  every render, every `verify5.py` run and every md5-checked upload had completed before
  it. Every figure in this section was read back from the tool logs in the session
  transcript, and the scripts under "The spot scripts" are the transcript's own copies with
  the five recorded patches applied (the `capFrame` clip + SOF check in `tour4.js`, the
  `scale=750:1640` in `seg2mp4.py`, `ENV_OUT` in `mk_screen5.py`, the profile RULE + per-rule
  cap + 7/5 split in `mkspecs.py`, the `__main__` guard in `verify5.py`). A re-render
  starts from the record, not from memory — and a fresh `verify5.py` run on a fresh render
  is the honest re-check, not this page.
- **What a re-render needs in the sandbox:** `in/A.mp4 B.mp4 C.mp4` and `in/t1.m4a t2.m4a
  t3.m4a` (the permanent sources under "Sources"), `meas_t1/2/3.json` from `beat.py`,
  `params_v4.json` + `graph_v4.txt` + `in/wall_v4.mp4` from the v4 render, the four
  `in/logo_*.png` layers from `assets.py`, the fonts, Playwright with chromium, and a
  production `/m/` that still boots the same preview — then `tour4.js` → `seg2mp4.py` →
  `captions.py` → `mkspecs.py` → `spot.py spec_<name>.json` ×4 → `launch5.sh` →
  `verify5.py`. A changed preview changes the captures, and the act times with them.

---

## Honesty + licensing — the constraints the cut obeys

- **Owned music only.** Every track here is a Higgsfield generation (URLs below), per the
  licensing guardrail in the strategy doc. No commercial music, ever.
- **No "tune in now", no "live".** The station is not broadcasting
  (`public.radio_station` does not exist in production; both radio routes fall through
  to the mock provider). The wordmark — on the phone and on the wall — is the only Radio
  claim. The real Radio app screen (`getapp-radio-v3.png`, which reads ON AIR / LIVE 24/7)
  is deliberately NOT on the phone for that reason.
- ⚠ **Every track was PROMPTED at one tempo and MEASURED at another** (122 / 124 / 126
  prompted, ~120 measured, all three). The pulse locks to the measured grid. A pulse on
  the prompted tempo drifts a full beat inside ten seconds and reads as random.

## Sources (permanent — cloudfront, the owner's Higgsfield account)

Prefix: `https://d8j0ntlcm91z4.cloudfront.net/user_3E30hta4RMpS2cDML3JnB5dGPnY/`

| Piece | File |
| --- | --- |
| Scene A — athlete + light ribbons | `hf_20260901_165433_72d68899-3266-4302-bb45-0417c72f0ecb.mp4` |
| Scene B — static blank-screen phone | `hf_20260901_165434_a27526b7-057b-4165-865c-0e9c5c9b46e9.mp4` |
| Scene C — dark club wall | `hf_20260901_165434_a1d1066e-7837-48c6-81ce-ef849c38d8a2.mp4` |
| **v3 track (the pick)** — "deep dark tech house 126 BPM, driving kick, Detroit minor stabs, relentless" | `hf_20260901_195948_814905f0-3558-40b7-a918-04d447a98d58.m4a` |
| alternate 1 — "deep dark minimal house 124 BPM, kick from bar one, sub-bass, detuned pads" | `hf_20260901_195948_20d50377-fdc1-45f5-b27c-b6928ba0ae40.m4a` |
| alternate 2 — "dark deep dubby house 122 BPM, reverb stabs, cavernous, no drop" | `hf_20260901_195949_e84649d8-0f3a-4aaa-a5fe-182837253bb8.m4a` |
| v1/v2 track (superseded) — "deep house, 124 BPM" | `hf_20260901_165439_f7f2681e-8955-48d9-8c6a-5b62eb5d9dd3.m4a` |

All three clips: h264 1440×2560, 24 fps, 243 frames = 10.125 s. The three new tracks:
aac 44.1 kHz stereo, 32.023 s each.

Repo assets (all on `main`):

- `public/SHAPE-logo-teal-white.png` — 3696×1782 RGBA, the two-triangle mark over the
  SHAPE wordmark (same bytes as `mobile-app/public/shape-logo.png`). The phone screen.
  Its alpha bbox is x 295–3376, y 200–1581; the triangles occupy rows 200–989 (x
  1551–2168) and the SHAPE text rows 1240–1581 — two ink bands with a 250-row gap, which
  is what lets the triangles fade out on their own.
- `public/Shape radio logo updated.png` — 2172×361 RGB on opaque black. The wall
  wordmark, and the source of the phone's "▸◂ RADIO" line. Ink rows 106–205 (100 px cap
  height); letters at x 283–350 · 438–509 · 594–676 · 762–828 · 917–977 (S H A P E,
  white), the ▸◂ mark at 1100–1174 (teal + white), R A D I O at 1299–1367 · 1439–1521 ·
  1597–1664 · 1749–1753 (the I is 5 px wide) · 1835–1913 (teal, ≈ 8,173,166). Because
  the ground is opaque black, its RGB IS premultiplied light — crop and add, no alpha.

## The track pick (measured, not assumed)

Three generations were made for the owner's *"deeper and darker"* note; each was decoded
to 8 kHz mono and measured the same way. The pick is the darkest on both darkness axes
(⚠ the kick column was wrong for both alternates on 2026-09-01 — corrected below):

| Track | Measured BPM | Spectral centroid | Energy 30–90 Hz | Energy > 2 kHz | Kick on-beat / half-beat | Intro |
| --- | --- | --- | --- | --- | --- | --- |
| alternate 1 | 119.95 | 137 Hz | 65.5 % | 0.4 % | 2.05 (⚠ read 1.58 on 09-01) | kick from 0.07 s |
| alternate 2 | 119.75 | 174 Hz | 74.3 % | 2.1 % | 3.26 (⚠ read 0.46 on 09-01 — a half-beat-off grid) | 8.1 s |
| **v3 (pick)** | **119.45** | **115 Hz** | **81.1 %** | 0.8 % | **3.20** | 8.1 s; percussion from 6.0 s |

⚠ **CORRECTED 2026-09-02 — the alternates' kick contrasts were measured on the wrong
phase.** Re-measured on a kick-centred grid (phase 0.044 — its hats lead the kick by
~30 ms, and the 09-01 pass had used 0.014), alternate 2 reads **3.26**, and **0.32** on a
grid shifted by half a beat — i.e. the 0.46 was the instrument's phase error, and *"a
dubby off-beat kick"* described the grid, not the track: its kick is ON the beat.
Alternate 1 re-measures **2.05** (was 1.58) on its own kick-centred grid (0.064). The
pick's 3.20 was already kick-centred and re-measures 3.22. So the pick rests on the two
DARKNESS axes — the ask was *"deeper and darker"* and it wins both by a margin — and NOT
on having the cleanest kick: alternate 2's is at least as clean. The owner has since
ruled that both alternates are wanted too (see "Variants"), so the pick is primary,
not exclusive.

The pick's shape: −20 dB pads for 7 s, percussion at 6.0 s, the kick at 8.07 s, then
−7 to −8 dB to the end, with a two-second breakdown at 22–24 s. The 8 s kick-less intro
was NOT trimmed (32 s minus 8 leaves too little for a 28 s film) — it became the
structure: Scene A rides the pads, the phone lands on the drop.

## The beat grid (measured)

Decode to 8 kHz mono; band-limit by FFT (kick 35–150 Hz, percussion 150–4000 Hz);
onset envelope = rectified derivative of each band's smoothed 5 ms energy; comb search
over BPM (110–140, then ±1 at 0.05) × phase (5 ms, then 2 ms); the two halves of the
track searched separately must agree (they do: 119.45 / 119.40). The percussion band is
the clean one (comb peak 18× its sweep mean); the kick band peaks 0.03 s, the combined
envelope 0.008 s. A per-beat residual check (argmax of the combined envelope within
±120 ms of each grid beat) reads a mean offset of 0 / +39 / +33 ms across the three
thirds of the track — the kick's attack peaks a few tens of ms after the hats — so the
phase is taken from the KICK: still under one frame at 24 fps.

**Chosen: 119.45 BPM, period 0.502302 s, phase 0.030 s → beats at 0.030 + n·0.502302.**
Beat 16 = 8.0668 s is the first kick (its energy rises at 8.06 s; the 0.5·max onset
detector reports 8.125 because it lags the true attack). The output's own audio
re-measures at 119.45 / kick at 8.07 s, i.e. the trim did not move the grid.

⚠ A grid that is 0.5 BPM wrong drifts 0.28 s — more than half a beat — over this film.
That is why the fine search runs at 0.05 BPM and why the halves have to agree.

## The timing (derived from the grid, `plan.py`)

Every transition ends exactly on a beat; scene lengths follow from that, not the other
way round.

| Symbol | Value | Meaning |
| --- | --- | --- |
| P | 0.502302 s | one beat |
| tK = beat 16 | 8.0668 s | the kick drop; the A→B fade ENDS here |
| offAB = tK − 0.3 | 7.7668 s | A→B `xfade` offset (duration 0.3) |
| tM = beat 24 | 12.0853 s | the phone morph lands (SHAPE → SHAPE RADIO) — ⚠ v3 only; v4 has no morph and does not read tM |
| tC = beat 36 | 18.1129 s | a downbeat; the B→C fade ENDS here; the wall lights |
| offBC = tC − 0.3 | 17.8129 s | B→C `xfade` offset |
| total | 27.9167 s | floor((offBC + 10.125) · 24) / 24 = 670 frames |
| screen layer | 7.7668 → 18.1129 s | 248 frames |
| wall layer | 17.8129 → 27.9167 s | 242 frames |
| audio fade-out | from 26.6417 s | 1.275 s |

⚠ **Scene B is 10.125 s and beat 36 sits 0.22 s past its end**, so B is clone-padded
by 0.3 s (`tpad=stop_mode=clone:stop_duration=0.3`) — the pad sits entirely inside the
B→C fade on a static phone shot, so it is invisible. Without it the wall would land on
beat 35, the "4" before a downbeat.

## Geometry that had to be measured, not assumed

- **The phone screen in Scene B is x 416–1026 (610 wide), y 592–1926 (1334 tall),
  aspect 0.457, corner radius ≈ 96–100 px.** Derived from the temporal MINIMUM over
  sampled frames: the min erases the moving beam reflections that had defeated a
  per-frame variance test, which found only the top portion of the screen
  (`440, 620, 560, 900` — aspect 0.62 against a 0.46 phone).
- **The screen interior is near-black throughout** (median 3.3) with transient glints
  up to 255. That is why everything on the screen is **SCREEN-blended, never overlaid**:
  screen(black) is the identity, so the glass reflections ride OVER the logo and it reads
  as a lit screen rather than a sticker.
- **Scene C's centre is black for the whole clip** (the lit pillars are at the sides),
  so the wordmark sits at y 1110, 1240 px wide, with nothing competing.
  ⚠ **CORRECTED 2026-09-02 — the CENTRE is black; the wordmark was WIDER than the black.**
  The dark panel is only 802 px wide when the scene opens (x 321–1122) and 1071 px at
  9.5 s; a 1240 px wordmark at x 100–1340 overran it on both sides at every frame — the
  "doesn't fit the main wall" the owner saw. v4 re-cuts it to fit (see "What v4 is").

## The phone-screen layer (v3, `mk_screen3.py`)

Rendered off-line with PIL/numpy into `screen3.mp4` (610×1334, 24 fps, 248 frames
covering composite 7.7668–18.1129 s), overlaid at (416, 592) and screen-blended.

- **Assets** (`assets.py`): the logo cropped to its alpha bbox and split into two
  full-size images — triangles only and text only — rendered once at the pulse maximum
  (493 px wide) and premultiplied onto black (additive light), each with a σ30 Gaussian
  glow. **Line 2** = the wordmark's ▸◂ (x 1095–1180) + a gap + R A D I O (x 1294–1918),
  scaled so the wordmark's 100 px cap height equals the logo text's cap height at the same
  scale (0.55×) → 403×61 px at the pulse maximum, ≈ 373×56 at rest.
- **Layout**: logo 456 px wide at rest, centred at (305, 587) — `cy = 0.44·H`, above
  centre so the two-line lockup (text + RADIO) ends up near the screen's middle. Line 2
  is centred 20 px below the logo's bottom edge; everything scales together about (cx, cy).
- **Pulse**: `k(t) = exp(−u/0.20)`, u = fraction of the beat elapsed — a snap on the
  beat, decayed by the next — **gated to t ≥ tK** so nothing pulses on the kick-less
  intro's grid. Scale `1 + 0.06·k`; glow gain `0.25 + 0.9·k`. **No rings.**
- **The morph** (⚠ v3 only — deleted in v4): triangles alpha 1→0 over tM−0.5 → tM; line 2 alpha 0→1 over
  tM−0.4 → tM; both complete ON the beat, which also carries a k≈1 glow flash. The SHAPE
  text never changes — it is the logo's own text, so the letters do not dissolve.
- **Halo**: a static elliptical teal wash at 10 % (this is a wash, not a ring — it is
  what makes the screen read as lit). **Envelope**: 0.3 s in from offAB (full at the
  kick), 0.3 s out into tC; masked by the screen's rounded rect (r 100, 2 px inset).

Verified in the layer, frame-accurately: at a beat (k 0.75) the logo bbox is 477 px
wide and 22.2 k pixels are lit; mid-beat (k 0.09) 459 px and 9.1 k — v2's mid-beat bbox
was 606 px, which was the ring, and it is gone. Across the morph the triangle rows go
3972 → 0 lit pixels and the RADIO rows 0 → 2489 while the text rows hold (4452 → 4583).

## The wall layer (v3, `mk_wall.py`)

Pre-rendered as a 1440×520 band (`wall.mp4`, 242 frames, composite 17.8129 → 27.9167 s)
overlaid at (0, 850) so the wordmark's centre lands at frame y 1110, then screen-blended.

⚠ **v4 (2026-09-02) replaces the asset and the overlay y** — a two-line lockup 680 px wide,
the band overlaid at y 1040 (`wallY` in `params.json`, read by `render3.sh`) so the lockup
centres at frame y ≈ 1300, inside the panel; the per-frame formula, the ramp and the gate
are unchanged. See "What v4 is" and "The v4 deltas".

- `wall_word.png`: the wordmark (crop 270..1926 × 90..222 of the PNG), strokes dilated
  with `MaxFilter(5)` at source resolution, scaled to 1240 wide (99 tall), centred on the
  band at y 260. `wall_glow.png`: a `GaussianBlur(22)` of it. Both are built once — a
  per-frame `gblur` is ten times the cost for the same pixels.
- Per frame: `word·1 + glow·(0.35 + 1.0·k)`, scaled `1 + 0.03·k` about the band centre,
  × `ramp = clip((t − offBC)/0.3)` — so it ramps in through the B→C fade and lands fully
  lit, with the flash, on beat 36; k is gated to t ≥ tC.

Verified: the band is black at offBC, 15 k lit pixels mid-ramp, and at a beat (k 0.99)
47 k lit pixels / mean G 10.7 / 1270 px wide against 17 k / 6.0 / 1225 mid-beat.

## The filtergraph (v3, written by `render3.sh`)

Inputs: `0` = A · `1` = B · `2` = C · `3` = `screen3.mp4` · `4` = `wall.mp4` · `5` = the
track. Passed as ONE `-filter_complex_script` file (`graph3.txt`).

```
[0:v]fps=24,format=yuv420p,settb=AVTB[va];
[1:v]fps=24,format=yuv420p,settb=AVTB,tpad=stop_mode=clone:stop_duration=0.3[vb];
[2:v]fps=24,format=yuv420p,settb=AVTB[vc];
[va][vb]xfade=transition=fade:duration=0.3:offset=7.7668[vab];
[vab][vc]xfade=transition=fade:duration=0.3:offset=17.8129,format=gbrp[base];
color=c=black:s=1440x2560:r=24:d=27.9167,format=rgb24[cv1];
color=c=black:s=1440x2560:r=24:d=27.9167,format=rgb24[cv2];
[3:v]fps=24,format=rgb24,tpad=start_duration=7.7668[scr];
[cv1][scr]overlay=x=416:y=592:eof_action=pass:format=rgb,format=gbrp[c1];
[4:v]fps=24,format=rgb24,tpad=start_duration=17.8129[wall];
[cv2][wall]overlay=x=0:y=850:eof_action=pass:format=rgb,format=gbrp[c2];
[c1][c2]blend=all_mode=screen[lay];
[base][lay]blend=all_mode=screen,format=yuv420p[vout];
[5:a]atrim=0:27.9167,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.3,afade=t=out:st=26.6417:d=1.275[aout]
```

Output: `-map "[vout]" -map "[aout]" -c:v libx264 -preset medium -crf 18 -pix_fmt
yuv420p -c:a aac -b:a 192k -ar 44100 -movflags +faststart -t 27.9167` (ffmpeg emits
671 frames — frame 670's timestamp sits exactly on the cut — and reports 27.959 s).

Notes that each cost a round (the v2 ones still hold):

- `xfade` needs `fps=24,format=yuv420p,settb=AVTB` on every input or the offsets drift;
  `tpad` after `settb` keeps the timebase.
- Both branches of a `blend` must be `gbrp` for a screen blend, or it converts silently
  and darkens.
- ⚠ **The two layers overlap in TIME (the phone fades out while the wall ramps in) and
  in SPACE (the band crosses the phone), so each rides its OWN black canvas and the two
  canvases are screen-blended before the base.** An rgb `overlay` has no alpha: chaining
  the wall overlay onto the phone canvas would have wiped the phone with the band's
  black for those 0.3 s.
- `tpad=start_duration=…` delays a layer instead of `setpts`, so the overlay's
  before-start behaviour never matters; `eof_action=pass` lets the canvas run on after
  the layer ends.
- ffmpeg ACCUMULATES multiple `-filter_complex_script` flags — pass exactly one.
- Audio: the track trimmed to `total`, 0.3 s fade-in (the intro is −20 dB anyway),
  1.275 s fade-out. Last-0.9 s RMS −17 dB against −10 dB mid-track — ⚠ measured with an
  INPUT-side `-ss`; an output-side `-ss` runs the whole file through `astats` and reads as
  if the fade were missing.

## Where it renders

In the Higgsfield sandbox (ffmpeg, PIL and numpy preinstalled; it reaches cloudfront and
the upload hosts). The local dev proxy reaches neither, so the inputs, the render and the
upload all happen in the sandbox, and verification is numeric (frame statistics, ASCII
luminance maps) rather than by eye. Each layer renders in ~15 s and the composite in
~40 s on 8 cores. Hand-over is a short-lived link — never a file attachment, never a
committed binary. ⚠ litterbox answered every upload with a 500 (a BunkerWeb error page)
on 2026-09-01 AND on 2026-09-02. ⚠ **uguu.se keeps a file for ~3 h — not the 48 h this
line first claimed**: the v3 link was dead the next morning. pixeldrain now refuses
anonymous uploads (`authentication_required`), 0x0.st resets the TLS handshake, catbox
answers "Invalid uploader". **gofile (guest upload) took all three v4 renders on
2026-09-02, and later the same day all five spot / v5 renders — eight files**, each
md5-verified against the sandbox file; gofile's own policy removes a
guest file after ~10 days without a download, so a link is reviewable this week, not
permanent. The order that works: gofile → 0x0.st → litterbox → uguu.se (label it 3 h).
`upload2.sh` in the sandbox runs that chain per file and appends
`LINK <file> <host> <url>` to `links.txt` — per-host URL extraction (`jq` on the JSON,
one regex per host), because the first script's single regex matched only uguu's bare
host and logged a successful upload as a failure.

## Open

- **OWNER — review the five 2026-09-02 renders** (four feature spots — TRAIN · EAT ·
  COMMUNITY · SCORE — plus launch cut v5; links handed over in-session, gofile guest
  uploads that are removed after ~10 days without a download). **v4 stays the launch cut
  until the montage question below is answered.**
- **OWNER RULING — the preview cast on camera.** Every phone frame in the spots is the
  production `/m/` signed-out PREVIEW: Quinn Harper (an AI headshot) as "you", an
  AI-portrait cast with fictional names on the feed, in the channels and on the
  marketplace, and demo coach credits on the Train deck and the Menu. The brand plan's
  own line is *no faked community — the honest-data doctrine extends to camera*. Options:
  ship as a labelled preview · re-capture the same recipe on a real account once real
  members and coaches exist · cut the community + coach pages until then (TRAIN · EAT ·
  SCORE are unaffected apart from the coach credits).
- **OWNER — does the montage belong in the launch cut?** Yes → v5 replaces v4 on the
  pick, and the two alternates need the montage re-planned on their own grids (not
  rendered). No → v4 stands and the montage stays a spot-only device.
- **OWNER — the caption copy.** Six of the twenty spot captions and both lines of the
  close are the website's own words; three are the product's own names, two are adapted
  from house copy and nine are new lines in the house register — those fourteen want an
  eye. The per-caption provenance is the table under "The captions".
- **Registered, not fixed — the Diego Morales listing crash** on the production `/m/`
  preview (War Room, Marketplace & coach profiles): tapping that marketplace row sent the
  app to the error boundary during the capture; Leah Kim's Listing opened normally.
- **OWNER — review the three v4 cuts** (the pick + the two alternates, Radio only on the
  wall; links handed over in-session on 2026-09-02). The v3 trio is superseded. Nothing is
  posted; the wave-2 scripts are unreviewed too.
- **OWNER — the wall lockup's form:** v4 stacks SHAPE over ▸◂ RADIO at 680 px so it clears
  the panel by ≥ 50 px at its narrowest; a single-line wordmark that fits would be ~45 px
  tall. Either is a `WALL_W` / `WALL_GAP` re-render.
- **Answered 2026-09-02 — the track pick:** *"i like both of them. We can use both"* →
  the same cut on all three tracks (see "Variants"); v3 stays primary.
- **Questions for the owner** (defaults taken, all reversible): whether *"use both"*
  meant ONE film that changes track mid-way (not built — the three-render reading was
  taken); whether alternate 1 should be re-timed so the wall lands on its kick return
  (analysed, not built — "Variants"); whether v3's wall should be stilled through its own
  three-beat kick gap at 22.6–24.1 s (`KICKGATE=meas_t3.json`, a one-flag re-render);
  whether the real Radio app screen may ever appear on the phone despite its ON AIR /
  LIVE 24/7 copy (kept off); whether a whole-frame beat pulse is wanted (dropped — *just
  the logo*).
- A longer cut needs a fourth generation, not a re-time; captions or a closing line on the
  wall must obey the capture rules in `shape-radio-video-scripts.md` (no broadcast claim).

## Variants (2026-09-02) — the same cut on all three tracks

The owner's ruling on the two alternates: *"i like both of them. We can use both."* Read
as *the same film on each track*, not one film that changes track mid-way (that reading
is offered as a question in "Open"). So the v3 cut is rendered three times — the pick
unchanged, and once per alternate — each re-planned by `plan.py` on that track's OWN
measured grid with the identical structure: the A→B fade ends on beat 16, the SHAPE →
SHAPE RADIO morph lands on beat 24 (⚠ v3 variants only — the v4 renders on the same three
grids have no morph), the B→C fade ends on beat 36. Scene B is clone-padded
by 0.3 s on every variant (`padNeeded` 0.221 / 0.179 / 0.196 s).

| Variant | Track | BPM · phase | Halves | tK (beat 16) | tM (beat 24) | tC (beat 36) | Total | Gate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **v3 (pick)** | t3 | 119.45 · 0.030 | 119.45 / 119.40 | 8.0668 | 12.0853 | 18.1129 | 27.9167 (670 fr) | none — `t ≥ tK` |
| alternate 1 | t1 | 119.95 · 0.064 | 120.0 / 120.2 | 8.0673 | 12.0690 | 18.0715 | 27.8750 (669 fr) | `KICKGATE=meas_t1.json` |
| alternate 2 | t2 | 119.75 · **0.044** | 119.6 / 119.6 | 8.0607 | 12.0691 | 18.0816 | 27.8750 (669 fr) | `KICKGATE=meas_t2.json` |

Phases are kick-centred. Alternate 2's hat grid reads 0.014 and its kick lands a
consistent ~30 ms later, so the pulse is planned on 0.044 (per-beat kick residual after
beat 16: median 0 ms; alternate 1 median +5 ms). The v3 control re-measure with today's
instrument read 119.4 / 0.000; the recorded 119.45 / 0.030 is the better-centred grid
(kick residual +10 ms against +30) and stands. ⚠ All three prompts (122 / 124 / 126 BPM)
still measure ~120.

**What each track does to the film.** Alternate 1's kick runs from bar one, so the phone
lands on a phrase boundary rather than a drop; the kick fades over beats 29–32
(`0.16 0.20 0.11 0.13`), is absent from beat 33 to 47 (16.5–24.1 s — the whole B→C fade
and the first six seconds of the wall) and returns at beat 48 (24.07 s): the wall lands
lit and still, and throbs for the last 3.8 s. Alternate 2 has an 8 s kick-less intro like
the pick, so the phone lands on its drop (8.06 s); its kick stops at beat 44 (22.1 s),
leaves two ghost hits on beats 45–46 and is gone from beat 47 (23.6 s): the wall pulses
for four seconds and then holds lit through the outro. **A re-time of alternate 1 that
lands the wall ON the kick return was analysed and not built** — Scene A is 10.125 s
long, so the phone would have to land on beat 28, the groove's last kick, and pulse once
before the breakdown; one logo pulses briefly either way, and this cut gives the long
pulse to the phone. Owner's call ("Open").

### The kick-presence gate

v3's `kof` is 0 before the first kick and pure `exp(−u/0.20)` after it — right for a
track whose kick, once in, never leaves. Both alternates have kick-less stretches AFTER
beat 16, and an ungated render throbs the wall to silence. The alternates therefore
multiply the pulse by the measured kick presence of the CURRENT beat:

```python
import os                                   # prepended to mk_screen3.py and mk_wall.py
_KG=None
if os.environ.get('KICKGATE'):
    _KG=json.load(open(os.environ['KICKGATE']))['kick_by_beat']
def pres(t):
    if _KG is None: return 1.0
    n=int(math.floor((t-phi)/P))
    if n<0 or n>=len(_KG): return 0.0
    return min(1.0,max(0.0,(_KG[n]-0.15)/0.30))
def kof(t):
    if t<tK-0.01: return 0.0                # tC-0.01 in mk_wall.py
    return math.exp(-(((t-phi)%P)/P)/0.20)*pres(t)
```

`kick_by_beat[n]` is the peak of the kick-band (35–150 Hz) energy within ±40 ms of grid
beat n, normalized to the track's loudest beat (`beat.py` writes it into
`meas_<track>.json`). ⚠ **It must be written for EVERY beat** — `pres()` returns 0 past the
array's end, so a record that stops early stills the pulse from that beat on with nothing to
say so. On 2026-09-02 the sandbox was rebuilt from the transcript and the recovered `beat.py`
wrote `kbn[:48]`: the first v4-alt1 render lost alternate 1's entire kick return (beat 48 on),
caught only by `verify.py`'s second wall window. Fixed — `kick_by_beat` is every beat, 63 per
track; the 09-02 gated renders used the full arrays listed below. A beat under 0.15 is silent, one over 0.45 pulses fully, and the
ramp between is linear, so a fading kick fades the pulse. On the pick it is 0 for beats
0–15 and ≥ 0.5 on every beat from 16 except its one gap — the gate generalizes v3's own
`t ≥ tK` rule rather than replacing it. **v3 is deliberately rendered WITHOUT the gate**
so it stays byte-identical to the approved cut; that gap is beats 45–47 (22.6–24.1 s,
`0.00 0.01 0.00`), where the wall throbs three times to no kick — `KICKGATE=meas_t3.json`
stills it, a one-flag refinement left for the owner.

The measured arrays the gated renders used, beats 0–62 (the gate reads 0 below 0.15):

- t1 (alternate 1): `0.76 0.68 0.66 0.89 0.66 0.75 0.65 0.97 0.62 0.77 0.63 0.83 0.63 0.74 0.73 0.86 0.60 0.75 0.73 1.00 0.89 0.77 0.77 0.89 0.75 0.75 0.52 0.64 0.50 0.16 0.20 0.11 0.13 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.47 0.58 0.46 0.59 0.60 0.73 0.64 0.62 0.58 0.75 0.59 0.55 0.68 0.68 0.67`
- t2 (alternate 2): `0.01 0.01 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.02 0.00 0.00 0.00 0.00 0.00 0.00 0.79 0.55 0.81 0.77 0.90 0.43 0.72 0.69 0.84 0.62 0.84 0.70 0.91 0.73 1.00 0.61 0.92 0.67 0.92 0.61 0.90 0.75 0.82 0.64 0.69 0.48 0.84 0.60 0.00 0.20 0.34 0.15 0.14 0.00 0.02 0.04 0.02 0.00 0.01 0.03 0.03 0.00 0.01 0.02 0.02 0.00 0.04`
- t3 (the pick, for reference): `0.00 0.04 0.03 0.07 0.07 0.08 0.05 0.03 0.02 0.11 0.08 0.03 0.00 0.00 0.00 0.00 0.84 0.61 0.72 0.50 0.68 0.56 0.87 0.62 0.61 0.55 0.87 0.72 0.93 0.59 0.90 0.70 0.50 0.30 0.90 0.76 0.85 0.84 0.93 0.59 0.79 0.67 0.93 0.69 0.38 0.00 0.01 0.00 1.00 0.59 0.87 0.67 0.92 0.87 0.94 0.73 0.73 0.81 0.99 0.70 0.69 0.61 0.94`

### Verification, per variant (`verify.py`)

One script runs the same checks on any variant: ffprobe (1440×2560 · 24 fps; alternate 1
669 frames / 27.875 s, alternate 2 669 / 27.875, v3 671 / 27.959 — the `-t` +1-frame
quirk, as on 09-01); transition frames against their source clips (mean diff ≤ 0.32
outside the layers); screen-layer beat vs mid-beat frames chosen by the COMPUTED `k`
(bbox 476–479 px lit at a beat vs 456 mid-beat); the morph (triangles 3987 / 3992 / 3999
→ 0, the RADIO line 0 → 2490 / 2557 / 2485 — ⚠ v3; the v4 check asserts the OPPOSITE, see
"What v4 is"); the wall blank at its first frame; the
output audio re-measured (119.95 / 119.7 / 119.4, halves agreeing, the first kick within
40 ms of tK); tail RMS −19.2 / −25.8 / −17.3 dB against −12.9 / −10.3 / −10.0 mid-track
(INPUT-side `-ss`). `pulsecheck.py <variant> <screen|wall> <t0> <t1>` proves the gate by
windows: alternate 1's screen pulses 9–11.6 s and is still 15.1–17.6 s; its wall is still
19–21.6 s (16.2 k lit at beat and mid-beat alike) and pulses 24.1–27.6 s (30.6 k against
16.3 k); alternate 2's wall pulses 19–21.6 s (31.2 k against 16.3 k) and is still
23–27.5 s. Each upload's md5 matched the local file.

⚠ Two instrument faults on the way, both fixed before anything was read off them: the
verify script's "bottom" slice for the RADIO line began at 62 % of the screen height and
missed the line entirely (0 → 0 would have read as "the morph never lands"); it reads
rows ≥ 700 now. And `upload.sh`'s uguu check matched only the bare host
(`https?://h\.uguu\.se|uguu\.se[^ ]+` — an alternation without a group), so a successful
upload was logged as a 301 failure.

## The v3 scripts

Run in the sandbox with the sources in `in/` (`A.mp4 B.mp4 C.mp4 t3.m4a
SHAPE-logo-teal-white.png radio-wordmark.png`). `render3.sh` runs `plan.py` →
`mk_screen3.py` → `mk_wall.py` → writes `graph3.txt` → ffmpeg. For a variant: `t1.m4a` or
`t2.m4a` in place of `t3.m4a`, `plan.py` on that track's grid, and
`KICKGATE=meas_<track>.json` in the environment of both layer scripts (the patch is in
"Variants" above).

### plan.py

```python
import json, math
bpm=119.45; phi=0.03; P=60/bpm
beat=lambda n: phi+n*P
tK=beat(16); offAB=tK-0.3
bEnd=offAB+10.125+0.3
nC=int(math.floor((bEnd-phi)/P)); tC=beat(nC); offBC=tC-0.3
total=math.floor((offBC+10.125)*24)/24
tM=beat(24)
d=dict(bpm=bpm,phi=phi,P=P,tK=tK,offAB=offAB,nC=nC,tC=tC,offBC=offBC,total=total,tM=tM,T0=offAB,T1=tC,afo=total-1.275)
json.dump(d,open('params.json','w'),indent=1); print(json.dumps(d,indent=1))
```

### assets.py

```python
import numpy as np
from PIL import Image, ImageFilter
L=Image.open("in/SHAPE-logo-teal-white.png").convert("RGBA").crop((295,200,3377,1582))
LW=456; SMAX=1.07; bw=int(LW*SMAX)+6; s=bw/L.width; bh=int(round(L.height*s))
big=L.resize((bw,bh),Image.LANCZOS); a=np.asarray(big).astype(np.float32)/255
prem=a[...,:3]*a[...,3:4]
tri_rows=(0,int(round(790*s))); txt_rows=(int(round(1040*s)),bh)
tri=prem.copy(); tri[tri_rows[1]:]=0
txt=prem.copy(); txt[:txt_rows[0]]=0
def save(nm,arr): Image.fromarray((np.clip(arr,0,1)*255+0.5).astype('uint8'),'RGB').save(nm)
save("in/logo_tri.png",tri); save("in/logo_txt.png",txt)
save("in/logo_tri_glow.png",np.asarray(Image.fromarray((tri*255).astype('uint8')).filter(ImageFilter.GaussianBlur(30))).astype(np.float32)/255)
save("in/logo_txt_glow.png",np.asarray(Image.fromarray((txt*255).astype('uint8')).filter(ImageFilter.GaussianBlur(30))).astype(np.float32)/255)
W=Image.open("in/radio-wordmark.png").convert("RGB")
capH=txt_rows[1]-txt_rows[0]; k=capH/100.0
mark=W.crop((1095,100,1180,211)); radio=W.crop((1294,100,1918,211))
mark=mark.resize((int(round(mark.width*k)),int(round(mark.height*k))),Image.LANCZOS)
radio=radio.resize((int(round(radio.width*k)),int(round(radio.height*k))),Image.LANCZOS)
gap=int(round(24*k)); lw=mark.width+gap+radio.width; lh=max(mark.height,radio.height)
line=Image.new("RGB",(lw,lh),(0,0,0)); line.paste(mark,(0,(lh-mark.height)//2)); line.paste(radio,(mark.width+gap,(lh-radio.height)//2))
line.save("in/line2.png"); line.filter(ImageFilter.GaussianBlur(30)).save("in/line2_glow.png")
wm=W.crop((270,90,1926,222)).filter(ImageFilter.MaxFilter(5))
ws=1240/wm.width; wm=wm.resize((1240,int(round(wm.height*ws))),Image.LANCZOS)
band=Image.new("RGB",(1440,520),(0,0,0)); band.paste(wm,((1440-1240)//2,260-wm.height//2)); band.save("in/wall_word.png")
band.filter(ImageFilter.GaussianBlur(22)).save("in/wall_glow.png")
```

### mk_screen3.py

```python
import math, subprocess, json
import numpy as np
from PIL import Image, ImageDraw
p=json.load(open('params.json')); bpm,phi,P=p['bpm'],p['phi'],p['P']
W,H=610,1334; FPS=24; T0,T1,tK,tM=p['T0'],p['T1'],p['tK'],p['tM']
N=int(round((T1-T0)*FPS))
def ld(nm): return Image.open(nm).convert('RGB')
tri,txt,trig,txtg,l2,l2g=[ld(f'in/{n}.png') for n in ('logo_tri','logo_txt','logo_tri_glow','logo_txt_glow','line2','line2_glow')]
bw,bh=tri.size; l2w,l2h=l2.size
LW=456; cx=W//2; cy=int(H*0.44); teal=np.array([52,214,197],np.float32)/255
mask=Image.new('L',(W,H),0); ImageDraw.Draw(mask).rounded_rectangle((2,2,W-3,H-3),radius=100,fill=255)
maskf=np.asarray(mask).astype(np.float32)[...,None]/255
yy,xx=np.mgrid[0:H,0:W].astype(np.float32); rr=np.sqrt(((xx-cx)/380.0)**2+((yy-cy)/300.0)**2)
ambient=(np.clip(1-rr,0,1)**2.2)[...,None]*teal*0.10
def kof(t):
    if t<tK-0.01: return 0.0
    return math.exp(-(((t-phi)%P)/P)/0.20)
def arr(img,w,h): return np.asarray(img.resize((w,h),Image.LANCZOS)).astype(np.float32)/255
def paste(dst,src,gain,x0,y0):
    if gain<=0: return
    sh,sw=src.shape[:2]; xs0,ys0=max(0,x0),max(0,y0); xs1,ys1=min(W,x0+sw),min(H,y0+sh)
    if xs1<=xs0 or ys1<=ys0: return
    dst[ys0:ys1,xs0:xs1]+=src[ys0-y0:ys1-y0,xs0-x0:xs1-x0]*gain
proc=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-c:v','libx264','-preset','fast','-crf','10','-pix_fmt','yuv420p','in/screen3.mp4'],stdin=subprocess.PIPE)
clamp=lambda v: max(0.0,min(1.0,v))
for i in range(N):
    t=T0+i/FPS; k=kof(t); s=1+0.06*k
    w=int(round(LW*s)); h=int(round(w*bh/bw)); sc=w/bw
    a1=1-clamp((t-(tM-0.5))/0.5); a2=clamp((t-(tM-0.4))/0.4)
    g=0.25+0.9*k
    x0=cx-w//2; y0=cy-h//2
    frame=np.zeros((H,W,3),np.float32)+ambient
    if a1>0: paste(frame,arr(trig,w,h),g*a1,x0,y0)
    paste(frame,arr(txtg,w,h),g,x0,y0)
    w2=int(round(l2w*sc)); h2=int(round(l2h*sc)); gap=int(round(20*sc)); x2=cx-w2//2; y2=y0+h+gap
    if a2>0: paste(frame,arr(l2g,w2,h2),g*a2,x2,y2)
    if a1>0: paste(frame,arr(tri,w,h),a1,x0,y0)
    paste(frame,arr(txt,w,h),1.0,x0,y0)
    if a2>0: paste(frame,arr(l2,w2,h2),a2,x2,y2)
    env=clamp((t-T0)/0.3)*clamp((T1-t)/0.3)
    proc.stdin.write((np.clip(frame*env*maskf,0,1)*255+0.5).astype('uint8').tobytes())
proc.stdin.close(); proc.wait()
```

### mk_wall.py

```python
import math, subprocess, json
import numpy as np
from PIL import Image
p=json.load(open('params.json')); bpm,phi,P=p['bpm'],p['phi'],p['P']
offBC,tC,total=p['offBC'],p['tC'],p['total']; FPS=24; BW,BH=1440,520
N=int(round((total-offBC)*FPS))
word=Image.open('in/wall_word.png').convert('RGB'); glow=Image.open('in/wall_glow.png').convert('RGB')
def kof(t):
    if t<tC-0.01: return 0.0
    return math.exp(-(((t-phi)%P)/P)/0.20)
def place(img,s):
    w=int(round(BW*s)); h=int(round(BH*s)); a=np.asarray(img.resize((w,h),Image.LANCZOS)).astype(np.float32)/255
    out=np.zeros((BH,BW,3),np.float32); x0=(BW-w)//2; y0=(BH-h)//2
    xs0,ys0=max(0,x0),max(0,y0); xs1,ys1=min(BW,x0+w),min(BH,y0+h)
    out[ys0:ys1,xs0:xs1]=a[ys0-y0:ys1-y0,xs0-x0:xs1-x0]; return out
proc=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{BW}x{BH}','-r',str(FPS),'-i','-','-c:v','libx264','-preset','fast','-crf','10','-pix_fmt','yuv420p','in/wall.mp4'],stdin=subprocess.PIPE)
for i in range(N):
    t=offBC+i/FPS; k=kof(t); s=1+0.03*k; ramp=max(0.0,min(1.0,(t-offBC)/0.3))
    frame=(place(word,s)*1.0+place(glow,s)*(0.35+1.0*k))*ramp
    proc.stdin.write((np.clip(frame,0,1)*255+0.5).astype('uint8').tobytes())
proc.stdin.close(); proc.wait()
```

---

### The v4 deltas (2026-09-02)

`assets.py` — the wall block replaces the single-line crop (the logo halves are unchanged):

```python
W=Image.open("in/radio-wordmark.png").convert("RGB")
WALL_W=int(os.environ.get('WALL_W','680')); GAP=int(os.environ.get('WALL_GAP','20'))
l1=W.crop((275,90,985,222)).filter(ImageFilter.MaxFilter(5))     # S H A P E
l2=W.crop((1095,90,1918,222)).filter(ImageFilter.MaxFilter(5))   # ▸◂ RADIO
k=WALL_W/l2.width
l1=l1.resize((int(round(l1.width*k)),int(round(l1.height*k))),Image.LANCZOS)
l2=l2.resize((WALL_W,int(round(l2.height*k))),Image.LANCZOS)
BW,BH=1440,520; tot=l1.height+GAP+l2.height; y=(BH-tot)//2
band=Image.new("RGB",(BW,BH),(0,0,0))
band.paste(l1,((BW-l1.width)//2,y)); band.paste(l2,((BW-l2.width)//2,y+l1.height+GAP))
band.save("in/wall_word.png"); band.filter(ImageFilter.GaussianBlur(22)).save("in/wall_glow.png")
```

`mk_screen3.py` — the morph is gone: no line 2, no `a1`/`a2`, no `tM`; per frame
`paste(trig,g); paste(txtg,g); paste(tri,1); paste(txt,1)` with `s = 1 + 0.06·k` and
`g = 0.25 + 0.9·k`. `plan.py` — writes `wallY` (1040; 850 reproduces v3) into
`params.json`. `render3.sh` — `wy=int(p.get('wallY',850))` → the wall
`overlay=x=0:y={wy}`. `beat.py` — `kick_by_beat=[round(float(v),2) for v in kbn]`, every
beat. `verify.py` — the **fit** check, in outline (the lockup's lit bbox in the wall
layer against the dark run of the SOURCE clip on the same rows):

```python
for tt in (0.35, 3.0, 6.0, 9.5):
    i = round(tt*24)
    lw = lit(frame(WALL, n=i))                         # x0 x1 y0 y1 of the lit lockup, layer coords
    rows = (wy + lw['y0'] - 10, wy + lw['y1'] + 10)
    col = frame('in/C.mp4', n=i)[rows[0]:rows[1]].mean(axis=0)
    dark = col < 14                                    # the contiguous dark run containing x = 718
    l = r = 718
    while l > 0 and dark[l-1]: l -= 1
    while r < len(dark)-1 and dark[r+1]: r += 1
    fits = (lw['x0'] - l) >= 40 and (r - lw['x1']) >= 40
```

plus a `late` presence sample at T1 − 0.6 s (the layer's last frame sits inside its own
fade-out) and a second wall window at tC + 12P … tC + 18P. Three variants render in
parallel only from separate work directories (`w_<variant>/` with symlinked `in/ out/`
and its own `params.json`) — `render3.sh` and both layer scripts read a cwd-relative
`params.json`, so three renders in one directory race on it.

## The spot scripts (2026-09-02)

The transcript's own copies with the recorded patches applied — the sandbox that ran them is
gone (see "Hosting, and the sandbox wipe"). They assume the v4 sandbox layout: `in/` with the
sources, the logo layers from `assets.py`, `meas_t<n>.json` from `beat.py`, `params_v4.json`,
`graph_v4.txt` and `in/wall_v4.mp4` from the v4 render, fonts in `/home/user/fonts/`, Playwright
1.49.1 + chromium in `/home/user/pw` with `PLAYWRIGHT_BROWSERS_PATH=/home/user/.cache/ms-playwright`.
Run order: `node pw/tour4.js` → `python3 seg2mp4.py` → `python3 captions.py` → `python3 mkspecs.py`
→ `python3 spot.py spec_<name>.json` ×4 → `./launch5.sh` → `python3 verify5.py spot <name>` /
`python3 verify5.py v5 out/shape-radio-launch-v4.mp4`. `verify5.py` imports the v3 `beat.py`.

**`pw/lib.js`** — the capture library — the native-class init script, `go()` (find a control by text, scroll it into the upper third, click), `scroll()`, `tab()`, `dismiss()`, `boot()` (the preview boot path), `ev()` (dispatch an app event), `dump()` (a state snapshot for the log).

```js
const fs=require('fs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const INIT=()=>{const add=()=>{const h=document.documentElement;if(h){h.classList.add('is-native-app');return true;}return false;};if(!add()){new MutationObserver((m,o)=>{if(add())o.disconnect();}).observe(document,{childList:true,subtree:true});}};
function mk(p){
 const log=(...a)=>console.log(...a);
 const go=async(re,which,ms)=>{const pt=await p.evaluate(([src,which,ms])=>new Promise(res=>{const re=new RegExp(src,'i');
  const txt=e=>((e.innerText||'')+' '+(e.getAttribute('aria-label')||'')).replace(/\s+/g,' ').trim();
  const sz=e=>{const r=e.getBoundingClientRect();return r.width>2&&r.height>2;};
  const all=[...document.querySelectorAll('button,[role=button],a,div,span,h1,h2,h3,p,label,li')].filter(sz).filter(e=>re.test(txt(e)));
  const deep=all.filter(e=>!all.some(o=>o!==e&&e.contains(o)));
  if(!deep.length){res(null);return;}
  const e=deep[which==='last'?deep.length-1:(typeof which==='number'?Math.min(which,deep.length-1):0)];
  let sc=e.parentElement; while(sc&&!(sc.scrollHeight>sc.clientHeight+20&&/(auto|scroll)/.test(getComputedStyle(sc).overflowY)))sc=sc.parentElement;
  const done=()=>{const r=e.getBoundingClientRect();res({x:r.left+r.width/2,y:r.top+r.height/2,t:txt(e).slice(0,34),n:deep.length});};
  if(!sc){e.scrollIntoView({block:'center'});setTimeout(done,150);return;}
  const cr=sc.getBoundingClientRect(),er=e.getBoundingClientRect(); const target=sc.scrollTop+(er.top-cr.top)-(cr.height*0.42-er.height/2);
  const to=Math.max(0,Math.min(sc.scrollHeight-sc.clientHeight,target)); const from=sc.scrollTop; if(Math.abs(to-from)<4){done();return;}
  const t1=performance.now(); const step=()=>{const k=Math.min(1,(performance.now()-t1)/ms);const ease=k<.5?2*k*k:-1+(4-2*k)*k;sc.scrollTop=from+(to-from)*ease;if(k<1)requestAnimationFrame(step);else setTimeout(done,120);}; step();}),[re,which||'first',ms||650]);
  if(!pt){log('MISS',re);return false;} await p.mouse.click(pt.x,pt.y); log('GO',re,'->',JSON.stringify(pt.t),'of',pt.n); return true;};
 // smooth scroll of the biggest scroller; resolves when done
 const scroll=async(dy,ms)=>p.evaluate(([dy,ms])=>new Promise(res=>{let els=[...document.querySelectorAll('.bs-scroll,[style*="overflow"]')].filter(e=>e.scrollHeight>e.clientHeight+20&&e.clientHeight>300);
  els.sort((a,b)=>b.clientWidth*b.clientHeight-a.clientWidth*a.clientHeight); const el=els[0]||document.scrollingElement; const from=el.scrollTop, t1=performance.now();
  const step=()=>{const k=Math.min(1,(performance.now()-t1)/ms); const e=k<.5?2*k*k:-1+(4-2*k)*k; el.scrollTop=from+dy*e; if(k<1)requestAnimationFrame(step); else res(Math.round(el.scrollTop));}; step();}),[dy,ms]).then(r=>{log('SCROLL',dy,'->',r);return r;});
 const tab=async(t)=>{await p.evaluate((t)=>document.querySelector('[data-tour="tab-'+t+'"]').click(),t);};
 const dismiss=()=>p.evaluate(()=>{const b=document.querySelector('button[aria-label="Dismiss"],[aria-label="Dismiss"]'); if(b)b.click(); return !!b;});
 const boot=async(tag)=>{await p.goto('https://theshapecommunity.com/m/',{waitUntil:'domcontentloaded',timeout:60000}); await sleep(5500);
  if(await go('^English')) {await sleep(500); await go('^CONTINUE$'); await sleep(1500);} await go('Preview the app'); await sleep(2500); await go('Step inside'); await sleep(3500);
  await dismiss().then(r=>log('DISMISS',r)); await sleep(900); log('BOOT_DONE',tag);};
 const ev=(name,detail)=>p.evaluate(([n,d])=>{window.dispatchEvent(new CustomEvent(n,{detail:d}));},[name,detail||{}]);
 const dump=async(tag,all)=>{const info=await p.evaluate((all)=>{const vis=el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&(all||(r.bottom>0&&r.top<window.innerHeight));};
  const btns=[...document.querySelectorAll('button,[role=button]')].filter(vis).map(e=>(e.innerText||e.getAttribute('aria-label')||'').trim().replace(/\s+/g,' ').slice(0,34)).filter(Boolean);
  return {tab:window.__shapeActiveTab||null,btns:btns.slice(0,all?60:30),text:(document.body.innerText||'').replace(/\s+/g,' ').slice(0,200)};},!!all);
  log('DUMP',tag,JSON.stringify(info)); await p.screenshot({path:'/home/user/cap/'+tag+'.png'});};
 return {go,scroll,tab,boot,ev,dump,dismiss,sleep,log};
}
module.exports={mk,sleep,UA,INIT};
```

**`pw/fpstest.js`** — the capture-rate measurement that retired `recordVideo` — CDP jpeg / CDP png / `page.screenshot` jpeg over a 2.5 s scroll, all 15.2 fps on the live preview.

```js
const {chromium}=require('playwright'); const fs=require('fs'); const {mk,sleep,UA,INIT}=require('./lib');
(async()=>{
 const b=await chromium.launch({args:['--no-sandbox']});
 const c=await b.newContext({viewport:{width:375,height:820},deviceScaleFactor:2,isMobile:true,hasTouch:true,userAgent:UA});
 await c.addInitScript(INIT); const p=await c.newPage(); const L=mk(p);
 await L.boot('F');
 const cdp=await c.newCDPSession(p);
 for(const [fmt,q] of [['jpeg',85],['png',0]]){
  L.scroll(600,2500); // don't await: animate while capturing
  let n=0; const t0=Date.now(); const ts=[]; const sizes=[];
  while(Date.now()-t0<2500){const o={format:fmt,optimizeForSpeed:true}; if(fmt==='jpeg')o.quality=q; const r=await cdp.send('Page.captureScreenshot',o); ts.push(Date.now()-t0); const buf=Buffer.from(r.data,'base64'); sizes.push(buf.length); if(n<2)fs.writeFileSync(`/home/user/cap/fps_${fmt}_${n}.${fmt}`,buf); n++;}
  const gaps=ts.map((t,i)=>i?t-ts[i-1]:t); console.log('CDP',fmt,'frames',n,'fps',(n/2.5).toFixed(1),'avg gap',(gaps.reduce((a,b)=>a+b,0)/gaps.length).toFixed(0),'max gap',Math.max(...gaps),'avg KB',(sizes.reduce((a,b)=>a+b,0)/sizes.length/1024).toFixed(0));
  await sleep(600); L.scroll(-600,1200); await sleep(1400);
 }
 // page.screenshot jpeg
 { L.scroll(600,2500); let n=0; const t0=Date.now(); while(Date.now()-t0<2500){await p.screenshot({type:'jpeg',quality:85}); n++;} console.log('PW jpeg fps',(n/2.5).toFixed(1)); }
 await b.close(); console.log('FPS DONE');
})().catch(e=>{console.log('ERR',String(e).slice(0,400));process.exit(1);});
```

**`pw/tour4.js`** — the tour — five boots, 23 recorded segments, an act timestamp per interaction, `times.json` per segment; shown with the `capFrame` patch applied (the `clip … scale:2` request, the JPEG SOF check, the `page.screenshot` fallback).

```js
const {chromium}=require('playwright'); const fs=require('fs'); const path=require('path'); const {mk,sleep,UA,INIT}=require('./lib');
const SEG='/home/user/cap/seg'; const acts={};
(async()=>{
 const b=await chromium.launch({args:['--no-sandbox']});
 const c=await b.newContext({viewport:{width:375,height:820},deviceScaleFactor:2,isMobile:true,hasTouch:true,userAgent:UA});
 await c.addInitScript(INIT); const p=await c.newPage(); const L=mk(p); const cdp=await c.newCDPSession(p);
 let cur=null;

 const jdim=(b)=>{let i=2;while(i<b.length-9){if(b[i]!==0xFF){i++;continue;}const m=b[i+1];if(m>=0xC0&&m<=0xCF&&m!==0xC4&&m!==0xC8&&m!==0xCC)return [b.readUInt16BE(i+7),b.readUInt16BE(i+5)];const len=b.readUInt16BE(i+2);i+=2+len;}return [0,0];};
 let capMode='cdp';
 const capFrame=async()=>{if(capMode==='cdp'){const r=await cdp.send('Page.captureScreenshot',{format:'jpeg',quality:88,optimizeForSpeed:true,clip:{x:0,y:0,width:375,height:820,scale:2}}); const buf=Buffer.from(r.data,'base64'); const [w,h]=jdim(buf); if(w===750&&h===1640)return buf; console.log('CAPMODE cdp gave',w,h,'-> switching to pw'); capMode='pw';} return await p.screenshot({type:'jpeg',quality:88});};
 const startRec=(name)=>{const dir=path.join(SEG,name); fs.mkdirSync(dir,{recursive:true}); const st={name,dir,n:0,ts:[],t0:Date.now(),on:true,acts:[]};
  st.done=(async()=>{while(st.on){const buf=await capFrame(); const t=Date.now()-st.t0; fs.writeFileSync(path.join(dir,`f${String(st.n).padStart(5,'0')}.jpg`),buf); st.ts.push(t); st.n++;}})(); cur=st; return st;};
 const stopRec=async(st)=>{st.on=false; await st.done; const total=Date.now()-st.t0; fs.writeFileSync(path.join(st.dir,'times.json'),JSON.stringify({ts:st.ts,total,acts:st.acts})); console.log('REC',st.name,'frames',st.n,'ms',total,'fps',(st.n/total*1000).toFixed(1),'acts',JSON.stringify(st.acts)); cur=null;};
 const rec=async(name,fn)=>{const st=startRec(name); try{await fn();}catch(e){console.log('SEGERR',name,String(e).slice(0,300));} await stopRec(st);};
 const act=async(label,fn)=>{const t=cur?Date.now()-cur.t0:-1; if(cur)cur.acts.push([label,t]); return fn();};
 const clickBtn=(re)=>p.evaluate((src)=>{const re=new RegExp(src,'i'); const b=[...document.querySelectorAll('button,[role=button]')].find(e=>re.test((e.innerText||e.getAttribute('aria-label')||'').replace(/\s+/g,' ').trim())); if(b){b.click();return (b.innerText||'').replace(/\s+/g,' ').slice(0,30);} return null;},re).then(r=>console.log('CLICK',re,'->',r));
 const back=async()=>{await L.go('^← ?BACK|^BACK$|^Close|^✕|^CANCEL',0); await sleep(900);};
 // ---- A: home ----
 await L.boot('A'); await p.screenshot({path:'/home/user/cap/n4_home.png'});
 await rec('home',async()=>{await sleep(1200); await act('scroll',()=>L.scroll(700,2800)); await sleep(600); await L.scroll(-700,1500); await sleep(400);});
 await rec('checkin',async()=>{await sleep(400); await act('tap',()=>L.go('^CHECK-IN DUE')); await sleep(2800);}); await L.dump('d4_checkin'); await back();
 await rec('goal',async()=>{await sleep(400); await act('tap',()=>L.go('^GOAL')); await sleep(2200); await act('scroll',()=>L.scroll(520,2200)); await sleep(500);}); await L.dump('d4_goal'); await back();
 await rec('preview',async()=>{await sleep(400); await act('tap',()=>L.go("I'LL TRAIN TODAY")); await sleep(2000); await act('scroll',()=>L.scroll(420,2000)); await sleep(500);}); await L.dump('d4_preview'); await back();
 await rec('calendar',async()=>{await sleep(400); await act('tap',()=>L.go('^MONTH VIEW')); await sleep(2200); await act('day',()=>L.go('^(10|11|12|17|18)$',0)); await sleep(2200);}); await L.dump('d4_calendar');
 // ---- B: train ----
 await L.boot('B');
 await rec('deck',async()=>{await sleep(300); await act('tab',()=>L.tab('train')); await sleep(1800); await act('scroll',()=>L.scroll(500,2600)); await sleep(500); await L.scroll(-500,1400); await sleep(400);}); await L.dump('d4_deck');
 await rec('swap',async()=>{await sleep(400); await act('tap',()=>L.go('^SWAP')); await sleep(2800);}); await L.dump('d4_swap',true); await back();
 await rec('session',async()=>{await sleep(400); await act('tap',()=>L.go('^▶',0)); await sleep(2400); await act('scroll',()=>L.scroll(360,1800)); await sleep(400); await L.scroll(-360,900); await sleep(300);}); await L.dump('d4_session',true);
 await rec('setlog',async()=>{await sleep(500); await act('tap',()=>L.go('Mark set 1|Log set 1|set 1 done|^✓$',0)); await sleep(3000);}); await L.dump('d4_setlog',true);
 // ---- C: eat ----
 await L.boot('C');
 await rec('menu',async()=>{await sleep(300); await act('tab',()=>L.tab('eat')); await sleep(1800); await act('scroll',()=>L.scroll(420,2400)); await sleep(500);}); await L.dump('d4_menu');
 await rec('meal',async()=>{await sleep(400); await act('tap',()=>L.go('Yogurt \\+ granola|Tuna, white bean',0)); await sleep(2200); await act('scroll',()=>L.scroll(450,2200)); await sleep(400);}); await L.dump('d4_meal',true); await back();
 await rec('grocery',async()=>{await sleep(400); await act('tap',()=>L.go('^GROCERY$')); await sleep(2000); await act('produce',()=>L.go('^▸ Produce|^Produce',0)); await sleep(1400); await act('apple',()=>L.go('^Apple$|^Avocado$',0)); await sleep(1600);}); await L.dump('d4_grocery',true);
 await rec('recipes',async()=>{await sleep(400); await act('tap',()=>L.go('^RECIPES$')); await sleep(2000); await act('scroll',()=>L.scroll(300,1400)); await sleep(300);}); await L.dump('d4_recipes');
 await rec('recipe',async()=>{await sleep(400); await act('tap',()=>L.go('Greek yogurt power bowl|kcal',0)); await sleep(2200); await act('scroll',()=>L.scroll(520,2400)); await sleep(400);}); await L.dump('d4_recipe',true);
 await rec('cook',async()=>{await sleep(400); await act('tap',()=>L.go('Cook this',0)); await sleep(2400); await act('start',()=>L.go('START COOKING',0)); await sleep(2200); await act('next',()=>L.go('DONE · NEXT|✓ DONE',0)); await sleep(1800);}); await L.dump('d4_cook',true);
 // ---- D: chat + marketplace ----
 await L.boot('D');
 await rec('feed',async()=>{await sleep(300); await act('tab',()=>L.tab('chat')); await sleep(1800); await act('scroll',()=>L.scroll(640,3000)); await sleep(400);}); await L.dump('d4_feed');
 await rec('details',async()=>{await sleep(400); await act('tap',()=>L.go('SESSION DETAILS',0)); await sleep(2400); await act('scroll',()=>L.scroll(560,2600)); await sleep(400);}); await L.dump('d4_details',true); await back();
 await rec('channels',async()=>{await sleep(400); await act('tab',()=>clickBtn('^CHANNELS')); await sleep(2200); await L.dump('d4_channels',true); await act('open',()=>L.go('Shape HQ|HQ|strength|#',0)); await sleep(2400);}); await L.dump('d4_channel',true); await back();
 await rec('market',async()=>{await sleep(400); await act('open',()=>L.ev('shape:openMarket',{role:'trainer'})); await sleep(2400); await act('scroll',()=>L.scroll(520,2400)); await sleep(400);}); await L.dump('d4_market');
 await rec('listing',async()=>{await sleep(400); await act('tap',()=>L.go('Leah Kim',0)); await sleep(2400); await act('scroll',()=>L.scroll(560,2600)); await sleep(400);}); await L.dump('d4_listing',true);
 // ---- E: me + score + habits ----
 await L.boot('E');
 await rec('profile',async()=>{await sleep(300); await act('tab',()=>L.tab('me')); await sleep(1800); await act('scroll',()=>L.scroll(560,2600)); await sleep(400); await L.scroll(-560,1200); await sleep(300); await act('climb',()=>L.go('^CLIMB$')); await sleep(1800); await act('signals',()=>L.go('^SIGNALS$')); await sleep(1800);}); await L.dump('d4_profile');
 await rec('score',async()=>{await sleep(400); await act('tap',()=>L.go('SHAPE SCORE|Shape Score',0)); await sleep(2400); await act('tier',()=>L.go('^THIS TIER')); await sleep(1600); await act('ladder',()=>L.go('^THE LADDER')); await sleep(1000); await act('scroll',()=>L.scroll(520,2400)); await sleep(400);}); await L.dump('d4_score',true); await back();
 await rec('habits',async()=>{await sleep(300); await act('tab',()=>L.tab('home')); await sleep(900); await act('tap',()=>L.go('^VIEW ALL')); await sleep(2200); await act('scroll',()=>L.scroll(320,1600)); await sleep(500);}); await L.dump('d4_habits');
 await b.close(); console.log('TOUR4 DONE');
})().catch(e=>{console.log('TOUR ERR',String(e).slice(0,600));process.exit(1);});
```

**`seg2mp4.py`** — the stitch — per-frame durations from `times.json` through the concat demuxer into a 24 fps CFR mp4 per segment; shown with the `scale=750:1640` patch.

```python
import json,os,subprocess,sys
SEG='/home/user/cap/seg'
names=sys.argv[1:] or sorted(d for d in os.listdir(SEG) if os.path.isdir(os.path.join(SEG,d)))
for n in names:
    d=os.path.join(SEG,n); tj=os.path.join(d,'times.json')
    if not os.path.exists(tj): print('SKIP',n); continue
    t=json.load(open(tj)); ts=t['ts']; total=t['total']
    lines=['ffconcat version 1.0']
    for i,x in enumerate(ts):
        nxt=ts[i+1] if i+1<len(ts) else total
        dur=max(1,nxt-x)/1000.0
        lines.append(f"file 'f{i:05d}.jpg'\nduration {dur:.4f}")
    lines.append(f"file 'f{len(ts)-1:05d}.jpg'")
    open(os.path.join(d,'list.txt'),'w').write('\n'.join(lines)+'\n')
    out=os.path.join(SEG,n+'.mp4')
    r=subprocess.run(['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',os.path.join(d,'list.txt'),'-vf','fps=24,scale=750:1640,format=yuv420p','-c:v','libx264','-preset','fast','-crf','12',out])
    pr=subprocess.run(['ffprobe','-v','error','-select_streams','v','-count_frames','-show_entries','stream=nb_read_frames,width,height','-of','csv=p=0',out],capture_output=True,text=True).stdout.strip()
    print('SEG',n,'frames_in',len(ts),'total_ms',total,'->',pr,'acts',t.get('acts'))
```

**`captions.py`** — the caption PNGs — eyebrow / serif line with `*accent*` italics / optional sub-line, auto-shrink, the blurred shadow; the `SPOTS` table IS the caption copy.

```python
import re,sys,json
from PIL import Image, ImageDraw, ImageFont, ImageFilter
F='/home/user/fonts/'
TEAL=(52,214,197); CREAM=(242,237,228)
W=1440
def mono(sz,w=700):
    f=ImageFont.truetype(F+'JetBrainsMono[wght].ttf',sz); f.set_variation_by_axes([w]); return f
def serif(sz,ital=False,w=400):
    f=ImageFont.truetype(F+('Newsreader-Italic[opsz,wght].ttf' if ital else 'Newsreader[opsz,wght].ttf'),sz); f.set_variation_by_axes([w,72]); return f
def tracked_w(font,text,tr):
    return sum(font.getlength(ch) for ch in text)+tr*max(0,len(text)-1)
def draw_tracked(d,x,y,text,font,tr,fill):
    for ch in text:
        d.text((x,y),ch,font=font,fill=fill); x+=font.getlength(ch)+tr
def runs(s):  # split *accent* runs
    out=[];i=0
    for m in re.finditer(r'\*(.+?)\*',s):
        if m.start()>i: out.append((s[i:m.start()],False))
        out.append((m.group(1),True)); i=m.end()
    if i<len(s): out.append((s[i:],False))
    return out
def line_w(rs,sz):
    return sum(serif(sz,it).getlength(t) for t,it in rs)
def render(eyebrow,line,sub=None,path=None,H=260):
    img=Image.new('RGBA',(W,H),(0,0,0,0)); txt=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(txt)
    # eyebrow
    ef=mono(34,700); tr=34*0.22; ew=tracked_w(ef,eyebrow,tr); draw_tracked(d,(W-ew)/2,18,eyebrow,ef,tr,TEAL+(255,))
    # serif line, auto-shrink to fit 1300
    sz=96; rs=runs(line)
    while line_w(rs,sz)>1300 and sz>64: sz-=4
    lw=line_w(rs,sz); x=(W-lw)/2; y=72
    for t,it in rs:
        f=serif(sz,it); d.text((x,y),t,font=f,fill=(TEAL if it else CREAM)+(255,)); x+=f.getlength(t)
    if sub:
        sf=mono(28,600); str_=28*0.18; sw=tracked_w(sf,sub,str_); draw_tracked(d,(W-sw)/2,y+sz+34,sub,sf,str_,(CREAM[0],CREAM[1],CREAM[2],200))
    # shadow: black copy of alpha, blurred
    a=txt.split()[3]; sh=Image.new('RGBA',(W,H),(0,0,0,0)); sh.putalpha(a.point(lambda v:int(v*0.85)))
    sh=sh.filter(ImageFilter.GaussianBlur(12))
    img.alpha_composite(sh,(0,5)); img.alpha_composite(sh,(0,5)); img.alpha_composite(txt)
    if path: img.save(path)
    return img,sz
SPOTS={
 'train':[('TRAIN','Written before *you arrive.*'),('TRAIN','Swap a *move.*'),('TRAIN','The *live* session.'),('TRAIN','Every set, *logged.*'),('TRAIN','The whole *month.*')],
 'eat':[('EAT','The ledger ticks *live.*'),('EAT','Every meal, *planned.*'),('EAT','The shop list, *sorted.*'),('EAT','Shape *Kitchen.*'),('EAT','Cook *mode.*')],
 'community':[('COMMUNITY','The social side of *strong.*'),('COMMUNITY','Every session, *on the wire.*'),('COMMUNITY','Channels for *your people.*'),('COACHES','Vetted trainers · *Real humans*'),('COACHES','Browse free *before you pay.*')],
 'score':[('PROFILE','A profile that *climbs* with you.'),('SHAPE SCORE','One number that tells *the truth.*'),('HABITS','Small things, *daily.*'),('GOALS','The *Contract.*'),('CHECK-IN','How are you *today.*')],
}
if __name__=='__main__':
    for spot,caps in SPOTS.items():
        for i,(e,l) in enumerate(caps):
            img,sz=render(e,l,path=f'cap/txt/{spot}_{i}.png'); print(spot,i,sz,l)
    img,sz=render('THESHAPECOMMUNITY.COM','Different goals. *One Community.*',sub='ONE PLATFORM FEE · $5 /MO · CANCEL ANY TIME',path='cap/txt/close.png',H=300); print('close',sz)
    img,sz=render('SHAPE','*Everything* in one place.',path='cap/txt/launch_0.png'); print('launch0',sz)
```

**`mk_screen5.py`** — the phone-screen layer — the v4 logo pulse (mk_screen3 with the v4 deltas) plus `cap` segments decoded at their planned speed, crossfades, envelope, mask; shown with the `ENV_OUT` patch.

```python
# Phone-screen layer for the feature spots / launch v5: logo pulse (mk_screen3 rules) + real app captures.
# usage: python3 mk_screen5.py spec.json out.mp4
import json,math,os,subprocess,sys
import numpy as np
from PIL import Image, ImageDraw
spec=json.load(open(sys.argv[1])); OUT=sys.argv[2]
ENV_OUT=float(spec.get('env_out',0.5))
W,H=610,1334; FPS=24
T=spec['T']; grid=spec['grid']; P=grid['P']; tb0=grid['t_b0']; b0=grid['bidx0']; KB=grid['kb']
N=int(round(T*FPS))
tri,txt,trig,txtg=[Image.open(f'in/{n}.png').convert('RGB') for n in ('logo_tri','logo_txt','logo_tri_glow','logo_txt_glow')]
bw,bh=tri.size; LW=456; cx=W//2; cy=int(H*0.44); teal=np.array([52,214,197],np.float32)/255
mask=Image.new('L',(W,H),0); ImageDraw.Draw(mask).rounded_rectangle((2,2,W-3,H-3),radius=100,fill=255); maskf=np.asarray(mask).astype(np.float32)[...,None]/255
yy,xx=np.mgrid[0:H,0:W].astype(np.float32); rr=np.sqrt(((xx-cx)/380.0)**2+((yy-cy)/300.0)**2); ambient=(np.clip(1-rr,0,1)**2.2)[...,None]*teal*0.10
def pres(n): return 0.0 if n<0 or n>=len(KB) else min(1.0,max(0.0,(KB[n]-0.15)/0.30))
def kof(t):
    if t<tb0-0.01: return 0.0
    n=b0+int(math.floor((t-tb0)/P)); return math.exp(-(((t-tb0)%P)/P)/0.20)*pres(n)
def arr(img,w,h): return np.asarray(img.resize((w,h),Image.LANCZOS)).astype(np.float32)/255
def paste(dst,src,gain,x0,y0):
    h,w=src.shape[:2]; xs0=max(0,x0); ys0=max(0,y0); xs1=min(W,x0+w); ys1=min(H,y0+h)
    if xs1<=xs0 or ys1<=ys0: return
    dst[ys0:ys1,xs0:xs1]+=src[ys0-y0:ys1-y0,xs0-x0:xs1-x0]*gain
def logo_frame(t):
    k=kof(t); s=1+0.06*k; w=int(round(LW*s)); h=int(round(w*bh/bw)); g=0.25+0.9*k; x0=cx-w//2; y0=cy-h//2
    f=np.zeros((H,W,3),np.float32)+ambient; paste(f,arr(trig,w,h),g,x0,y0); paste(f,arr(txtg,w,h),g,x0,y0); paste(f,arr(tri,w,h),1.0,x0,y0); paste(f,arr(txt,w,h),1.0,x0,y0); return f
def clamp(x): return max(0.0,min(1.0,x))
# decode a capture segment: source [s0, s0+dur*speed) -> dur seconds at 24fps
def decode(src,s0,dur,speed):
    n=int(round(dur*FPS))
    cmd=['ffmpeg','-v','error','-ss',f'{s0:.3f}','-i',src,'-t',f'{dur*speed+0.2:.3f}','-vf',f'setpts=PTS/{speed},fps={FPS},scale={W}:{H}:flags=lanczos','-frames:v',str(n),'-f','rawvideo','-pix_fmt','rgb24','-']
    raw=subprocess.run(cmd,capture_output=True).stdout; got=len(raw)//(W*H*3)
    frames=np.frombuffer(raw[:got*W*H*3],np.uint8).reshape(got,H,W,3)
    if got<n: # hold last frame
        pad=np.repeat(frames[-1:],n-got,axis=0) if got else np.zeros((n,H,W,3),np.uint8); frames=np.concatenate([frames,pad],0)
    return frames
segs=spec['segments']
proc=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-c:v','libx264','-preset','fast','-crf','10','-pix_fmt','yuv420p',OUT],stdin=subprocess.PIPE)
prev_last=None  # last frame (float) of the previous segment, for crossfades
gain=spec.get('cap_gain',1.0)
for si,sg in enumerate(segs):
    t0,t1=sg['t0'],sg['t1']; i0=int(round(t0*FPS)); i1=int(round(t1*FPS)) if si<len(segs)-1 else N
    xf=sg.get('xf',0.0)
    if sg['kind']=='cap':
        fr=decode(sg['src'],sg['s0'],(i1-i0)/FPS,sg.get('speed',1.0))
    last=None
    for i in range(i0,i1):
        t=i/FPS
        if sg['kind']=='logo': f=logo_frame(t)
        else: f=fr[i-i0].astype(np.float32)/255*gain
        if xf>0 and prev_last is not None and t-t0<xf:
            a=(t-t0)/xf; f=prev_last*(1-a)+f*a
        env=clamp((t-0)/0.3)*clamp((T-t)/ENV_OUT)
        out=np.clip(f*env*maskf,0,1); proc.stdin.write((out*255+0.5).astype('uint8').tobytes()); last=f
    prev_last=last
    print('SEG',si,sg['kind'],sg.get('src',''),'frames',i0,i1,flush=True)
proc.stdin.close(); proc.wait(); print('SCREEN5-OK',OUT,N)
```

**`spot.py`** — the composite — `B_long` + the layer (SCREEN blend) + the caption overlays + the track, writing `graph_<name>.txt` and `out/shape-<name>.mp4`.

```python
# Compose a feature spot: B_long background + screen layer (SCREEN blend) + caption overlays + audio.
# usage: python3 spot.py spec.json
import json,subprocess,sys,os
spec=json.load(open(sys.argv[1])); name=spec['name']; T=spec['T']
scr=f'in/screen_{name}.mp4'; out=f'out/shape-{name}.mp4'
if not os.path.exists(scr) or spec.get('rebuild',True):
    subprocess.run(['python3','mk_screen5.py',sys.argv[1],scr],check=True)
caps=spec['captions']  # [{png,t0,t1,y}]
g=[]
g.append(f"[0:v]trim=0:{T},setpts=PTS-STARTPTS,fps=24,format=gbrp[base]")
g.append(f"color=c=black:s=1440x2560:r=24:d={T},format=rgb24[cv]")
g.append("[1:v]fps=24,format=rgb24[scr]")
g.append("[cv][scr]overlay=x=416:y=592:eof_action=pass:format=rgb,format=gbrp[lay]")
g.append("[base][lay]blend=all_mode=screen,format=yuv420p[v0]")
inputs=['-i','in/B_long.mp4','-i',scr]
cur='v0'
for i,c in enumerate(caps):
    inputs+=['-loop','1','-framerate','24','-t',f'{T}','-i',c['png']]
    idx=2+i; fd=c.get('fade',0.18)
    g.append(f"[{idx}:v]format=rgba,fade=t=in:st={c['t0']:.3f}:d={fd}:alpha=1,fade=t=out:st={c['t1']-fd:.3f}:d={fd}:alpha=1[c{i}]")
    g.append(f"[{cur}][c{i}]overlay=x=0:y={c.get('y',300)}:eof_action=pass[v{i+1}]"); cur=f'v{i+1}'
fo=spec.get('vfade',0.6)
g.append(f"[{cur}]fade=t=out:st={T-fo:.3f}:d={fo}[vout]")
aidx=2+len(caps)
inputs+=['-ss',f"{spec['aoff']:.3f}",'-i',spec['track']]
g.append(f"[{aidx}:a]atrim=0:{T},asetpts=PTS-STARTPTS,afade=t=in:st=0:d={spec.get('afin',0.2)},afade=t=out:st={T-spec.get('afout',0.8):.3f}:d={spec.get('afout',0.8)}[aout]")
open(f'graph_{name}.txt','w').write(';\n'.join(g)+'\n')
cmd=['ffmpeg','-y','-v','error']+inputs+['-filter_complex_script',f'graph_{name}.txt','-map','[vout]','-map','[aout]','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','44100','-movflags','+faststart','-t',f'{T}',out]
print(' '.join(cmd)); subprocess.run(cmd,check=True)
pr=subprocess.run(['ffprobe','-v','error','-count_frames','-show_entries','stream=codec_type,width,height,nb_read_frames,duration','-of','csv=p=0',out],capture_output=True,text=True).stdout
print('SPOT-OK',out); print(pr)
```

**`mkspecs.py`** — the plans — RULES → source windows → beat plans → `spec_<name>.json` ×4 + `spec_v5.json`; shown with the profile RULE, the per-rule speed cap and the 7/5 SCORE split applied.

```python
# Build the spot specs (screen layer + compose) from the recorded segment act times + the measured track grids.
import json,os
SEG='/home/user/cap/seg'
def acts(name):
    t=json.load(open(f'{SEG}/{name}/times.json')); return {k:v/1000.0 for k,v in t['acts']}, t['total']/1000.0
# source window rules: (start_label,+s, end_label,+s); 'rec' = recording start
RULES={
 'home':('rec',0.4,'scroll',2.9),'checkin':('tap',0.4,'tap',2.8),'goal':('tap',0.4,'scroll',2.3),'preview':('tap',0.4,'scroll',2.1),'calendar':('tap',0.4,'day',1.8),
 'deck':('tab',0.9,'scroll',2.7),'swap':('tap',0.35,'tap',2.6),'session':('tap',0.4,'scroll',1.9),'setlog':('tap',-0.4,'tap',2.0),
 'menu':('tab',0.9,'scroll',2.5),'meal':('tap',0.4,'scroll',2.3),'grocery':('tap',0.5,'apple',1.5),'recipes':('tap',0.4,'scroll',1.5),'recipe':('tap',0.4,'scroll',2.5),'cook':('tap',0.4,'next',1.6),
 'feed':('tab',0.9,'scroll',3.1),'details':('tap',0.4,'scroll',2.7),'channels':('tab',0.5,'open',2.2),'market':('open',0.5,'scroll',2.5),'listing':('tap',0.4,'scroll',2.7),
 'profile':('tab',0.5,'climb',1.3,2.0),'score':('tap',0.4,'scroll',2.5),'habits':('tap',0.4,'scroll',1.7),
}
def srcwin(name):
    a,total=acts(name); r=RULES[name]
    s0=(0 if r[0]=='rec' else a[r[0]])+r[1]; s1=(0 if r[2]=='rec' else a[r[2]])+r[3]
    s1=min(s1,total-0.05); s0=max(0.0,min(s0,s1-0.5)); return s0,s1
def grid(tn):
    m=json.load(open(f'meas_t{tn}.json')); return m['P'],m['phase_used'],m['kick_by_beat'],m['first_kick_t']
def build(name,tn,plan,lead_beats=1,T_end_beat=None,close_at=None):
    P,phi,kb,fk=grid(tn)
    # audio offset: start one beat before the first plan beat (or 0 for a track whose kick starts at beat 0)
    b_first=plan[0][0]
    t_bfirst=phi+b_first*P
    aoff=max(0.0,t_bfirst-lead_beats*P)
    tb=lambda b: phi+b*P-aoff
    T=tb(T_end_beat)
    segs=[]; caps=[]
    segs.append({'kind':'logo','t0':0.0,'t1':tb(b_first)})
    ci=0
    for i,(b0,b1,srcs,cap) in enumerate(plan):
        t0,t1=tb(b0),tb(b1)
        if srcs=='close':
            segs.append({'kind':'logo','t0':t0,'t1':T,'xf':0.35})
            caps.append({'png':'cap/txt/close.png','t0':t0+0.05,'t1':T+0.5,'y':300,'fade':0.25}); continue
        # srcs: list of (segname, beats) sub-cuts sharing this caption
        tot=b1-b0; tt=t0
        for (sn,nb) in srcs:
            s0,s1=srcwin(sn); w=nb*P; mx=RULES[sn][4] if len(RULES[sn])>4 else 1.75; spd=max(0.85,min(mx,(s1-s0)/w))
            segs.append({'kind':'cap','t0':tt,'t1':tt+w,'src':f'{SEG}/{sn}.mp4','s0':round(s0,3),'speed':round(spd,3),'xf':0.25 if (segs[-1]['kind']=='logo') else 0.0}); tt+=w
        if cap is not None:
            caps.append({'png':f'cap/txt/{name}_{ci}.png','t0':t0+0.02,'t1':t1-0.02,'y':300}); ci+=1
    spec={'name':name,'T':round(T,4),'aoff':round(aoff,4),'track':f'in/t{tn}.m4a','grid':{'P':P,'t_b0':round(tb(0),4),'bidx0':0,'kb':kb},'segments':segs,'captions':caps,'vfade':0.6,'afin':0.2,'afout':0.8,'env_out':0.5}
    json.dump(spec,open(f'spec_{name}.json','w'),indent=1)
    print(name,'tn',tn,'aoff',round(aoff,3),'T',round(T,3),'first beat t',round(tb(b_first),3))
    for s in segs: print('   ',s['kind'],round(s['t0'],2),round(s['t1'],2),s.get('src','').split('/')[-1],s.get('s0'),s.get('speed'))
# beat plans: (b_start, b_end, [(seg,beats)...] | 'close', caption_index_auto)
build('train',3,[(16,21,[('deck',5)],1),(21,25,[('swap',4)],1),(25,31,[('session',6)],1),(31,35,[('setlog',4)],1),(35,39,[('calendar',4)],1),(39,44,'close',None)],T_end_beat=44)
build('eat',1,[(2,7,[('menu',5)],1),(7,11,[('meal',4)],1),(11,16,[('grocery',5)],1),(16,21,[('recipes',2),('recipe',3)],1),(21,25,[('cook',4)],1),(25,29,'close',None)],lead_beats=2,T_end_beat=29)
build('community',2,[(16,21,[('feed',5)],1),(21,25,[('details',4)],1),(25,29,[('channels',4)],1),(29,34,[('market',5)],1),(34,39,[('listing',5)],1),(39,44,'close',None)],T_end_beat=44)
build('score',3,[(16,23,[('profile',7)],1),(23,28,[('score',5)],1),(28,32,[('habits',4)],1),(32,35,[('goal',3)],1),(35,39,[('checkin',4)],1),(39,44,'close',None)],T_end_beat=44)
# launch v5: params_v4 grid, montage b20->b32 (6 caps x 2 beats), logo elsewhere; layer local time starts at T0
p=json.load(open('params_v4.json')); P=p['P']; phi=p['phi']; T0=p['T0']; T1=p['T1']
tb=lambda b: phi+b*P-T0
segs=[{'kind':'logo','t0':0.0,'t1':tb(20)}]
tt=tb(20)
for sn in ['home','deck','session','menu','feed','profile']:
    s0,s1=srcwin(sn); w=2*P; spd=max(0.85,min(1.75,(s1-s0)/w))
    segs.append({'kind':'cap','t0':tt,'t1':tt+w,'src':f'{SEG}/{sn}.mp4','s0':round(s0,3),'speed':round(spd,3),'xf':0.25 if len(segs)==1 else 0.0}); tt+=w
segs.append({'kind':'logo','t0':tt,'t1':T1-T0,'xf':0.35})
spec={'name':'v5','T':round(T1-T0,4),'grid':{'P':P,'t_b0':round(tb(16),4),'bidx0':16,'kb':[1.0]*80},'segments':segs,'env_out':0.3,'logo_from':round(tb(16),4)}
json.dump(spec,open('spec_v5.json','w'),indent=1); print('v5 T',round(T1-T0,3),'montage',round(tb(20),3),'->',round(tt,3))
```

**`launch5.sh`** — launch v5 — the v4 graph with the montage screen layer substituted.

```bash
#!/bin/bash
# Launch cut v5 = the v4 graph with the montage screen layer (screen_v5) + the v4 wall.
set -e; cd /home/user
python3 mk_screen5.py spec_v5.json in/screen_v5.mp4
sed 's/screen_v4/screen_v5/' graph_v4.txt > graph_v5.txt
TOT=$(python3 -c "import json;print('%.4f'%json.load(open('params_v4.json'))['total'])")
ffmpeg -y -v error -i in/A.mp4 -i in/B.mp4 -i in/C.mp4 -i in/screen_v5.mp4 -i in/wall_v4.mp4 -i in/t3.m4a -filter_complex_script graph_v5.txt -map "[vout]" -map "[aout]" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -ar 44100 -movflags +faststart -t $TOT out/shape-radio-launch-v5.mp4
echo LAUNCH5-OK; ffprobe -v error -count_frames -show_entries stream=codec_type,width,height,nb_read_frames,duration -of csv=p=0 out/shape-radio-launch-v5.mp4
```

**`verify5.py`** — the numeric verification (probe · layer vs source · composite vs expected · captions · pulse · audio · v5 vs v4); shown with the `__main__` guard so it imports cleanly for the best-match scan.

```python
# Numeric verification for the feature spots + launch v5. usage: python3 verify5.py spot <name> | v5
import sys,json,subprocess,os,math
import numpy as np
sys.path.insert(0,'/home/user'); import beat
RECT=(416,592,1026,1926)
_dims={}
def dims(f):
    if f not in _dims:
        o=subprocess.run(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=p=0',f],capture_output=True,text=True).stdout.strip().split(',')
        _dims[f]=(int(o[0]),int(o[1]))
    return _dims[f]
def probe(f):
    return subprocess.run(['ffprobe','-v','error','-count_frames','-show_entries','stream=codec_type,width,height,nb_read_frames,duration','-of','csv=p=0',f],capture_output=True,text=True).stdout.strip().replace('\n',' | ')
def frame(f,t,scale=None):
    w,h=dims(f); vf=[]
    if scale: vf=['-vf',f'scale={scale[0]}:{scale[1]}:flags=lanczos']; w,h=scale
    raw=subprocess.run(['ffmpeg','-v','error','-ss',f'{t:.4f}','-i',f,'-frames:v','1']+vf+['-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True,check=True).stdout
    return np.frombuffer(raw,np.uint8).reshape(h,w,3).astype(np.float32)
def screen(a,b): return 255-(255-a)*(255-b)/255
def mad(a,b): return float(np.abs(a-b).mean())
def litw(a,th=40):
    m=(a.max(axis=2)>th); cols=np.where(m.any(axis=0))[0]; rows=np.where(m.any(axis=1))[0]
    return (int(cols[0]),int(cols[-1]),int(rows[0]),int(rows[-1]),int(m.sum())) if len(cols) else None
def audio_checks(out,cuts,P):
    x=beat.decode(out); dur=len(x)/beat.SR
    kick=beat.bandpass(x,35,150); ek=beat.energy(kick); ok=beat.onset(ek)
    g=beat.grid(ok); res=[]
    for c in cuts:
        i=int(round(c/beat.HOP)); W=int(round(0.06/beat.HOP)); lo=max(0,i-W); hi=min(len(ok),i+W+1)
        j=lo+int(np.argmax(ok[lo:hi])); res.append(round((j-i)*beat.HOP*1000))
    sr=beat.SR
    def rms(a,b): s=x[int(a*sr):int(b*sr)]; return round(20*math.log10(max(1e-9,float(np.sqrt((s**2).mean())))),1)
    return dict(dur=round(dur,3),grid=g,cut_offsets_ms=res,rms_mid=rms(dur/2-1,dur/2+1),rms_tail=rms(dur-0.5,dur-0.02))
def spot(name):
    spec=json.load(open(f'spec_{name}.json')); T=spec['T']; out=f'out/shape-{name}.mp4'; lay=f'in/screen_{name}.mp4'
    print('PROBE',name,probe(out))
    base='in/B_long.mp4'; x0,y0,x1,y1=RECT
    for i,s in enumerate(spec['segments']):
        if s['kind']!='cap': continue
        for t in (s['t0']+0.6, s['t1']-0.3):
            if t<=s['t0']+s.get('xf',0)+0.05 or t>=T-0.7: continue
            st=s['s0']+(t-s['t0'])*s['speed']
            src=frame(s['src'],st,scale=(610,1334)); L=frame(lay,t)
            comp=frame(out,t)[y0:y1,x0:x1]; B=frame(base,t)[y0:y1,x0:x1]
            exp=screen(B,L)
            print(f'SEG{i} {os.path.basename(s["src"])} t={t:.2f} src_t={st:.2f} layer_vs_src={mad(L[60:-60,20:-20],src[60:-60,20:-20]):.2f} comp_vs_expected={mad(comp,exp):.2f} std_comp={comp.std():.1f} std_base={B.std():.1f}')
    # captions
    for i,c in enumerate(spec['captions']):
        tm=(c['t0']+c['t1'])/2
        if tm>=T-0.7: tm=c['t0']+0.5
        comp=frame(out,tm)[300:560]; B=frame(base,tm)[300:560]
        d=(np.abs(comp-B).max(axis=2)>40).sum()
        print(f'CAP{i} {os.path.basename(c["png"])} t={tm:.2f} lit_px={int(d)}')
    comp=frame(out,0.2)[300:560]; B=frame(base,0.2)[300:560]; print('CAP-NONE t=0.20 lit_px',int((np.abs(comp-B).max(axis=2)>40).sum()))
    # logo pulse in the closing logo segment: beat vs mid-beat
    P=spec['grid']['P']; tb0=spec['grid']['t_b0']; last=spec['segments'][-1]
    bstart=math.ceil((last['t0']+0.4-tb0)/P); tbeat=tb0+bstart*P+0.02; tmid=tbeat+P/2
    if tmid<T-0.7:
        a=litw(frame(lay,tbeat)); b=litw(frame(lay,tmid)); print('PULSE close beat',round(tbeat,2),a,'mid',round(tmid,2),b)
    cuts=[s['t0'] for s in spec['segments'] if s['t0']>0.1]
    print('AUDIO',json.dumps(audio_checks(out,cuts,P)))
def v5():
    p=json.load(open('params_v4.json')); spec=json.load(open('spec_v5.json')); T0=p['T0']
    out='out/shape-radio-launch-v5.mp4'; ref=sys.argv[2] if len(sys.argv)>2 else None
    print('PROBE v5',probe(out)); x0,y0,x1,y1=RECT
    lay='in/screen_v5.mp4'
    for s in spec['segments']:
        if s['kind']!='cap': continue
        t=s['t0']+0.55; st=s['s0']+(t-s['t0'])*s['speed']; src=frame(s['src'],st,scale=(610,1334)); L=frame(lay,t)
        print(f'MONTAGE {os.path.basename(s["src"])} layer_t={t:.2f} src_t={st:.2f} layer_vs_src={mad(L[60:-60,20:-20],src[60:-60,20:-20]):.2f}')
    if ref:
        for t in (4.0,9.0,12.5,15.0,21.0,26.0):
            a=frame(out,t); b=frame(ref,t); m=np.ones(a.shape[:2],bool); m[y0:y1,x0:x1]=False
            inside=mad(a[y0:y1,x0:x1],b[y0:y1,x0:x1]); outside=float(np.abs(a-b).mean(axis=2)[m].mean())
            print(f'V5vsV4 t={t:.1f} outside_rect={outside:.2f} inside_rect={inside:.2f}')
    cuts=[T0+s['t0'] for s in spec['segments'] if s['t0']>0.1]
    print('AUDIO',json.dumps(audio_checks(out,cuts,p['P'])))
if __name__=='__main__':
    if sys.argv[1]=='spot': spot(sys.argv[2])
    else: v5()
```

---

## Superseded: v1 and v2 (the record, kept)

**29.575 s**, scored by the first track (prompted 124 BPM, **measured 128.0**, period
0.46875 s, phase 0.0552 s — the kick band was ambiguous, so the phase came from the
combined envelope). Scenes A / B / C cut at 9.7 and 19.5 s (`xfade` offsets 9.725 /
19.45, duration 0.4 — not beat-aligned). The phone showed **v1** a four-screenshot reel
of the real July app (`getapp-radio-v3.png` · `getapp-train-v3.png` ·
`getapp-community-v2.png` · `getapp-score-v3.png`, contain-fit to 577×1334 with an r 96
rounded-rect alpha mask, 2.5 s each from 10.3 / 12.5 / 14.7 / 16.9 s with 0.3 s fades) or
**v2** the SHAPE logo pulsing (the same scale/glow pulse as v3, centred at (305, 614))
**plus a 3 px teal ring on every beat** expanding from r 150 to 560 over 1.15 s with
alpha `0.55·(1−p)^1.7` — the rings the owner asked to remove. The wall wordmark was a
static `logo_canvas.png` (the same dilate + blur, on a full 1440×2560 canvas) that faded
in over 1.0 s from 21.7 s and did not pulse — the "just appears at the end" the owner
asked to fix. The v2 graph:

```
[0:v]fps=24,format=yuv420p,settb=AVTB[va];
[1:v]fps=24,format=yuv420p,settb=AVTB[vb];
[2:v]fps=24,format=yuv420p,settb=AVTB[vc];
[va][vb]xfade=transition=fade:duration=0.4:offset=9.725[vab];
[vab][vc]xfade=transition=fade:duration=0.4:offset=19.45,format=gbrp[base];
color=c=black:s=1440x2560:r=24:d=29.575,format=rgb24[cv0];
[3:v]fps=24,format=rgb24,tpad=start_duration=10.0[scr];
[cv0][scr]overlay=x=416:y=592:eof_action=pass:format=rgb,format=gbrp[reel];
[base][reel]blend=all_mode=screen[bv];
[4:v]format=rgb24,fade=t=in:st=21.7:d=1.0,format=gbrp[logo];
[bv][logo]blend=all_mode=screen,format=yuv420p[vout];
[5:a]atrim=0:29.575,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.5,afade=t=out:st=28.3:d=1.275[aout]
```

The v2 layer script is `mk_screen3.py` with the rings back (a `PIL.ImageDraw` ellipse
per live beat, σ1.2 blur, teal), no morph, `cy = 0.46·H`, no kick gate, and a 0.6 s /
0.5 s envelope — the git history of this file carries it verbatim.
