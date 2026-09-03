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

⚠ **SUPERSEDED 2026-09-02 BY v6 for the launch cut, and by the slowed re-cut for the
four feature spots** — see "What v6 is" and "The spots, slowed" below. v5 is left as it
shipped; it is not the launch cut any more.

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
| **v7.1 melodic 1** — melodic house 122 (analog chords) | `hf_20260903_164640_5a06417b-ce80-4651-a5c1-1dc026ddbe9b.m4a` |
| **v7.1 melodic 2** — melodic progressive 124 (plucked arp) | `hf_20260903_164640_1eb7850f-c97e-4e56-8cbc-c250be32e92b.m4a` |
| **v7.1 melodic 3** — melodic deep 120 (Rhodes) | `hf_20260903_164640_d3535005-a4f4-4b01-b3a3-6b575e193c59.m4a` |
| **v7.1 melodic 4** — melodic anthem 126 (big synth lead) | `hf_20260903_164640_26a60d67-53cd-4b17-a0d4-261be0f9488e.m4a` |
| **v7 Scene A** — the runner, clothed (replaces Scene A) | `hf_20260903_141033_6f01a52f-de85-48ae-a0cd-771fa26afc70.mp4` |
| **v7 Scene A2** — the watch close-up (NEW shot) | `hf_20260903_141033_e815ac55-08d2-497d-8244-5c58e7288dbd.mp4` |
| **v7 Scene D** — the pinned globe (replaces Scene D) | `hf_20260903_141033_34ebdcd6-c068-47e5-85ba-39d77708a058.mp4` |

The v3 clips: h264 1440×2560, 24 fps, 243 frames = 10.125 s. The three new tracks:
aac 44.1 kHz stereo, 32.023 s each.

⚠ **THE v7 CLIPS' PROMPTS ARE RECORDED VERBATIM BELOW, BECAUSE THE v6 ONES WERE NOT AND
CANNOT BE RECOVERED** (see "THE v6 VIDEO PROMPTS WERE NEVER RECORDED"). Job ids and the
exact submitted text, so a re-run starts from the record rather than from memory:

| index | job id | model | prompt (verbatim, as submitted) |
| --- | --- | --- | --- |
| 1 | `6f01a52f-de85-48ae-a0cd-771fa26afc70` | `minimax_h3` | *Vertical 9:16. A lone athlete running at night through a dark space, wearing a fitted technical training top and shorts in black and deep teal, proper running shoes. Ribbons of teal and white light wrap and trail around the body as they move. Cinematic, high contrast, deep black background, volumetric haze, no text, no logos, no on-screen graphics. Slow steady camera, shallow depth of field.* |
| 2 | `e815ac55-08d2-497d-8244-5c58e7288dbd` | `minimax_h3` | *Vertical 9:16. Extreme close-up of a smartwatch on a runner's wrist, mid-stride, night. The watch face is a clean blank glowing panel - soft teal light, no numbers, no icons, no text, no user interface. Sweat on skin, dark technical sleeve at the edge of frame, deep black background, teal rim light. Shallow depth of field, slow push in, no text, no logos.* |
| 3 | `34ebdcd6-c068-47e5-85ba-39d77708a058` | `minimax_h3` | *Vertical 9:16. A slowly rotating night Earth against deep black, seen from space. City lights glowing warm across the landmasses, a faint teal atmospheric rim. Thin vertical light beams rise from a scattering of points on the surface, each anchored to a small glowing dot where it meets the ground - location pins planted on the globe. No text, no labels, no country names, no numbers, no user interface. Cinematic, high contrast, slow steady spin.* |

Submitted params, identical on all three: `aspect_ratio 9:16 · duration 10 · resolution 2K
· use_unlim false · batch_size 1 · aigc_watermark false`. Reported output **1440×2560**.

⚠ **`minimax_h3` IS THE ONLY VIDEO MODEL THIS ACCOUNT EXPOSES, AND IT IS NOT UNLIM-COVERED.**
`use_unlim: true` is rejected outright — the submitted `false` **bills**. Every other id
probed (`higgsfield_dop`, `kling_2_5`, `veo_3_1`, `sora_2`, `seedance_1_pro`, `wan_2_5`,
`higgsfield_soul`, `minimax_hailuo_02`) came back unknown. Record this with the prompts:
a re-run on a different model is a different clip, and the geometry follows the clip.

⚠ **CORRECTED 2026-09-03 — THEY ARE 243 FRAMES, NOT 240, AND THIS PARAGRAPH ASSERTED THE
NUMBER WITHOUT PROBING THE FILES.** It read *"The v3 clips ran 243 frames; these run 10 s
(240 frames at 24 fps)"*. Measured with `ffprobe` on the delivered files: **A, A2, B, C and
D all report `1440,2560,24/1,243` and `duration 10.125000`** — the same 243 as the v3 clips.
The conclusion survives and gets **more** margin, not less: A1 takes **146**, A2 takes **60**,
and D runs `30.75 − 21.8313 = 8.9187 s` = **214** frames, so the longest demand is 214 of
**243**. But a file whose whole discipline is that recorded numbers are measured rather than
assumed cannot carry a reported duration as if it were a probe — the next person sizing a
scene against "240" would be working from a floor that was never checked. `norm6.sh` still
runs first — the fps and pixel format are unverified until the files are in hand, and
`concat` refuses a mismatch.

### The v7.1 melodic-house tracks — SUBMITTED and completed, prompts verbatim

Owner note 8: *"also create some more house beats, maybe a little more melodic"*. Four
generated, each varying the melodic character around the existing ~120 BPM house register
(chords · arpeggio · Rhodes · big lead) so the pick is a choice between kinds, not a
re-roll of one kind. **Nothing is cut to any of them yet** — the launch cut and all five
spots still ride t1/t2/t3.

| index | job id | model | prompt (verbatim, as submitted) |
| --- | --- | --- | --- |
| 1 | `5a06417b-ce80-4651-a5c1-1dc026ddbe9b` | `sonilo_music` | *Melodic house, 122 BPM. Warm minor-key chord progression on an analog synth, rolling sub bassline, four-on-the-floor kick, airy reverb pads, crisp closed hats. Emotive and hypnotic. Instrumental, no vocals.* |
| 2 | `1eb7850f-c97e-4e56-8cbc-c250be32e92b` | `sonilo_music` | *Melodic progressive house, 124 BPM. Bright plucked arpeggio riding a driving kick, evolving pad swell, filtered breakdown that lifts back into the groove. Uplifting, cinematic. Instrumental, no vocals.* |
| 3 | `d3535005-a4f4-4b01-b3a3-6b575e193c59` | `sonilo_music` | *Melodic deep house, 120 BPM. Rhodes electric-piano chords, deep round sub bass, soft filtered lead hook, brushed shakers, laid-back swing. Late-night and soulful. Instrumental, no vocals.* |
| 4 | `26a60d67-53cd-4b17-a0d4-261be0f9488e` | `sonilo_music` | *Melodic house anthem, 126 BPM. Big minor-key synth lead over a punchy kick and driving bass, long filtered build, wide stereo pads. Euphoric but restrained. Instrumental, no vocals.* |

Submitted params, identical on all four: `model sonilo_music · duration 60`. ⚠ **`duration`
is REQUIRED by `sonilo_music`** — a submission without it is rejected, which is worth
recording beside the prompt because a re-run reconstructed from the prompt text alone
would fail. 60 s was chosen so a track comfortably covers the 30.75 s launch cut AND any
of the five 23–27.5 s spots with room to seek a good 30 s window; the three shipped tracks
run 32.023 s, so these are the first sources long enough to re-cut a spot inside one track.

**Fetched and verified 2026-09-03** — each job id was pulled from its `rawUrl` and probed,
so the four are recoverable as bytes, not just as a record. All four probe **60.023220 s**
(matching the API's `durationSec 60.0236`) at ~300 kbps AAC. The md5 of each fetched file,
so a later re-fetch can be checked rather than assumed:

| index | md5 of the fetched `.m4a` | bytes |
| --- | --- | --- |
| 1 — house 122 (analog chords) | `0bc1d8059d93cd0682a91ecc194f32d1` | 2,261,990 |
| 2 — progressive 124 (plucked arp) | `540b76ad39d617d4b76a31fdc42696f6` | 2,249,112 |
| 3 — deep 120 (Rhodes) | `f8a94aef2622547d8d3b1cd8da3fa274` | 2,245,139 |
| 4 — anthem 126 (big lead) | `6caf632ccae0ede95c4ca72687d10391` | 2,248,185 |

⚠ **NO AUDIO IS COMMITTED, DELIBERATELY** — this file's hand-over rule is a short-lived
link, never a file attachment and never a committed binary, and the four sit behind the
same cloudfront prefix as every other source in the table. The durable record is the
**job id + verbatim prompt + `duration` param** above; the md5 is what turns a re-fetch
from a hope into a check. Download links are handed over in-session, as with every cut.

⚠ **A PROMPTED BPM IS A REQUEST, NOT A MEASUREMENT — THIS FILE HAS PAID FOR THAT THREE
TIMES.** The v1/v2 track was prompted 124 and measured **128**; the v3 set was prompted
122 / 124 / 126 and every one of the three measured **~120** (119.95 / 119.75 / 119.45).
So the 122 / 124 / 120 / 126 above are what was ASKED for, and nothing here may be used as
a grid. Before a single timing number is written against any of these four, re-measure it
the way `beat.py` measures: a comb search over the onset envelope, split-half agreement
between the track's two halves, and a per-beat residual check that the envelope peaks sit
within one frame of the grid — then write the measured BPM and phase beside the job id
above. A pulse locked to a prompted tempo drifts half a beat inside fifteen seconds and
reads as random.

⚠ **AND A MELODIC TRACK NEEDS THE KICK-PRESENCE GATE RE-MEASURED, NOT INHERITED.** The
whole gated-pulse machinery (`kick_by_beat` → `pres` → `k`) exists because the alternates
carry kick-less stretches the pick does not: alternate 1 goes silent from beat 33 to 47,
alternate 2's kick stops at beat 44, and t2's kick band is so short (beats 16–43, ~14 s)
that it cannot carry a 23 s spot at all. "Melodic" and "filtered breakdown" and "long
filtered build" are all requests for exactly that kind of gap. So a track picked from this
set needs its own `kick_by_beat` array from `beat.py` — all 63 entries, per the v4 lesson
that an array truncated to 48 returns silence past its end and the wall stops pulsing with
nothing raising an error.

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


## What v6 is (2026-09-02) — the watch on the run, the Radio screen on the wall, a globe to close

**Three owner notes on the v4/v5 trio.** *"for the launch video, show the shape radio
screen on the wall in the last screen and show the BPM & HRM beat match feature on the
watch. Or maybe show that feature on the first scene with the guy running. And make sure
the shape radio logo fits and it looks like it does on app and website. Not condensed.
Maybe start that scene with the wall more zoomed in so it fits"* · *"and then the last
scene, show video of the globle spinning and shape popping up around the globe
representing people that have downloaded, with the shape logo appearing above the globe"*
· *"popping up above the globe"*. v6 answers all three; **1440×2560 · 24 fps · 738 frames
· 30.750 s**, on the pick (t3). ⚠ **v6 SUPERSEDES v5** — the montage cut is left as it
is, unrendered against these changes, until the owner picks one.

⚠ **AND v6 IS ITSELF SUPERSEDED BY v7 (2026-09-03) — READ THIS SECTION AS THE RENDERED
RECORD, NOT AS THE CURRENT RECIPE.** Four of v6's numbers moved: Scene A is now **two
shots** (a hard cut at beat 12 into a watch close-up), the wall screen is **derived from a
measured slab** rather than the 560 px guess described below, the globe marks anchor to
**baked pins** rather than luma-sampled cities, and the card's three IN SYNC slots now say
three different things. **The grid, the beats and the 738-frame total are unchanged** — that
is deliberate, and §4 shows the arithmetic. What is still true here: the beat table, the
honesty rulings, and the measured panel *as a record of what v6 rendered*.

**Four scenes now, not three.** A (the runner) + a **wrist readout**; B (the phone) with
the SHAPE logo alone, exactly as v4 left it; C (the club wall) **zoomed in**, carrying the
**single-line Radio wordmark** and a **projected Radio screen**; and a new **D** — a night
Earth, Shape marks popping onto its lit cities, the logo rising above it, the close copy
under it.

| beat | t (s) | what lands |
| --- | --- | --- |
| 14 | 7.062 | the watch reads **IN SYNC** (the ring flashes once) |
| 16 | 8.067 | A→B fade ENDS on the kick drop (`offAB` 7.7668) |
| 18 · 21 · 24 | — | the phone logo pulses |
| 28 | 14.094 | B→C fade ENDS (`offBC` 13.7945); the wall lights |
| 30 · 36 | — | the wall wordmark pulses |
| 44 | 22.131 | C→D fade ENDS (`offCD` 21.8313); `lenC` 8.3368 |
| 48 → 60 | 24.140 → 30.168 | **27 marks** pop onto the globe (1 · 2 · 3 per beat) |
| 52 | 26.150 | the SHAPE logo pops **above** the globe, then pulses on the gate |
| 56 | 28.159 | the close copy fades in under the globe |
| total | 30.750 | t60 + 0.6 s video fade, rounded to frames (738) |

**The watch (Scene A, `mk_watch.py`).** A 480×480 RGBA layer overlaid at x 890 / y 1660 —
the app's own **HEART-RATE SYNC** card as a wrist face: the header, the YOU · BPM figure
with a heart that beats at the displayed rate, the station line, and the app's own pill
(`MATCH MY BPM` → `MATCHING BEAT` → `IN SYNC`). It fades in at 1.3 s, the rate eases
**104 → 120** and lands IN SYNC on **beat 14**, two beats before the kick drop — so the
sync reads as the reason the drop hits. Status colour follows the app: cream FREE → amber
MATCHING → teal IN SYNC.

⚠ **THE READOUT IS ILLUSTRATIVE, AND THE STATION NUMBER IS DELIBERATELY NOT THE APP'S.**
The station line reads **120 BPM** because that is the track's real tempo (t3 measures
119.45), while the shipped signed-out preview shows **132**. Nothing here is a live
reading — the app's own demo path fabricates 114 bpm with no strap attached (the
2026-08-31 capture rule), so a "real" number on camera would be a fabrication either way.
The honest statement is that this is the feature's own UI at the film's own tempo.

**The wall (Scene C, `mk_wall6.py`) — the wordmark is single-line again.** v4 stacked
SHAPE over ▸◂ RADIO because the v3 one-liner overran a narrow panel. Zooming the scene
fixes the premise instead of the lockup: `C_zoom.mp4` is `C.mp4` under
`zoompan=z='1.15+0.35*pow(1-min(1,on/N),3)'` — it **opens at 1.50× and eases out to
1.15×**, so the slab is widest exactly when the wordmark lands.

⚠ **RESOLVED 2026-09-03 — `norm6.sh` NOW BUILDS `in/C_zoom.mp4`, and the two missing parameters
are re-derived rather than recovered.** The original command is gone: both branches carry the
identical truncated fragment, `git log -S` shows it was introduced already incomplete in the v6
record (`e22dead`), and no other session transcript survives. `N = 200` (the ease completes over
Scene C: `lenC` 8.3368 s × 24 fps = 200.08 frames) and a centred anchor are **my choices**, stated
as such at the producer — corroborated because the rebuilt slab measures a median **1127 px**
against this file's own v6 checkpoint of **~1165 px** at 14.3 s, within 3%.
⚠ **AND THE REFUSAL THAT EXPOSED IT WAS NOT ABOUT THE ZOOM AT ALL.** `meas_wall.py` dropped frames
where the panel does not read but still intersected frames that read *badly* — a strobe-caught
frame returns a legitimate-looking narrow rect, and one of them defined the whole answer (a 132 px
intersection against a ~1165 px slab). Fixed there, with outlier rejection before the strict
intersect. *The blocker was a measurement defect wearing the costume of a missing asset.*

The original registration, kept because the class is real — **the same as `cap/r3_radio_top.png`
above and `params_v6.json` before it.** It is
read by **three** scripts (`meas_wall.py`, `render6.sh`, `verify6.py`) and written by
**none**, and the expression above is missing the two parameters a rebuild needs:
**`N`, the ease length, is defined nowhere in this file**, and the **pan anchor**
(`zoompan`'s `x`/`y`) is never stated, so whether the push-in is centred is unknown. A
third unknown sits beside them: `meas_wall.py` reads **`SLAB_TH` and `SLAB_SAMPLES` from
the environment**, so the shipped render may not have used the defaults (20 / 60).
Attempted 2026-09-03: `N=200` (= `lenC`×24 = 200.08) with a centred anchor and an explicit
`s=1440x2560` — ⚠ **`zoompan` silently emits 1280×720 without `s=`**, which the recorded
fragment also omits. It built clean at 1440×2560, and `meas_wall.py` **refused** it:
*degenerate slab left 731 right 863 top 616 bottom 1978* — a **132 px** intersection where
this section records the true wordmark run as **~1010 px**. The refusal is the guard doing
its job. ⚠ **Do NOT tune `N`, the anchor or `SLAB_TH` until the assert passes**: that is
fitting the input until the guard goes green, which is the one move this file post-mortems
in every other section. Recover the original ffmpeg command, or re-derive `C_zoom`
deliberately and **re-baseline** the checkpoints below rather than reverse-engineering
numbers to match them. The wordmark is the
product's own `public/shape-radio-logo.png` (1647×116, one line, not condensed) at
`WALL_W=1020`, and a **projected Radio screen** (a real capture of the app's Radio page,
560 px wide, rounded-masked, bloomed) sits below it on the same slab. Measured in the
render: wordmark x 214–1225 (w 1010–1012, h 62) with **74/81 · 62/70 · 47/48 · 73/72 px
of slab either side** at 14.3 / 15.0 / 17.0 / 21.0 s, and the screen inside the slab at
x 459–972.

⚠ **THE CLUB CLIP STROBES, SO "IS THE SLAB THERE?" IS THE WRONG QUESTION.** The wordmark
band reads dark on **64 of 200 Scene-C frames (32 %)** — the source is a lit club with a
flashing rig, not a steady panel. The fit check therefore samples frames where the slab
exists and reports the coverage as information rather than a failure; the wordmark and
screen are SCREEN-blended, so a lit frame washes them brighter rather than clipping them.

**The globe (Scene D, `mk_globe.py`).** A generated night Earth — city lights, a faint
teal rim, a slow spin, no text — measured by `meas_globe.py` to disc centre (727, 1295)
r 676. **27 Shape marks** (the real two-triangle geometry, cut from `logo_tri.png`) pop
onto **lit cities**: each pop time samples that frame of the source, picks a pixel above
luma 110 inside 0.90 R with a 150 px spacing rule, and lands with an ease-out-back
overshoot plus one expanding teal ring. From beat 52 the **SHAPE logo pops above the
globe** and pulses on the same kick gate; from beat 56 the close copy fades in beneath.

⚠ **THE MARKS ARE ILLUSTRATIVE AND CLAIM NO COUNT.** They stand for people, not for a
number of downloads — nothing on screen says how many, and nothing in the copy does
either. The owner's phrase was "representing people that have downloaded"; the film shows
that idea without asserting a figure it cannot support.

⚠ **THE PULSE PEAK IS THE FIRST FRAME AT OR AFTER THE BEAT — AND THE FIRST v6 VERIFY RUN
FAILED FIVE ASSERTIONS BECAUSE IT SAMPLED THE BEAT INSTANT ITSELF.** `k = exp(−u/0.20)`
is maximal at u = 0, but a 24 fps render has no frame there unless the beat happens to
land on one, so `frame(beat(n))` can return the frame BEFORE the pulse. Sampling
`beat(n) + 1/24` fixes it. The second half of the same lesson: the wall's pulse is **3 %
scale + glow** against the phone's **6 %**, so the wall needs a **lower lit threshold**
(30, not 60) or a real pulse reads as none. With both corrections every assertion passes
and the numbers are materially different — phone beats 18/21/24 read 12657 w477 / 13462
w478 / 14499 w480 against mid-beat 8536–8644 w458–459, and wall beats 30/36 read 8290
w1033 / 8863 w1037 against mid 7152 / 6986 w1013. *A pulse measured at a frame that does
not exist is not a pulse that failed.*

**Verified numerically** (`verify6.py`, all PASS): 738 frames · 1440×2560 · 24 fps · aac
44100 stereo; A matches its source outside the watch rect (1.09) with the watch absent at
0.5 s (0.20) and present at 3.0 / 6.5 (20.71 / 21.38), and MATCHING(amber) → IN SYNC(teal)
across beat 14 (teal 579→2031, amber 1121→0); B matches `B_long` outside the phone rect
(1.04–1.75); C matches `C_zoom` outside the layers (0.57–1.08); D matches the globe source
before the pops (mean 0.68, p50 0.3, p99 5.1, layer lit 0) with marks lit in the disc at
beats 50/54/58 (1832 / 4882 / 7231 against 0 pre-pop), the logo absent then present across
beat 52 (0 → 8833 w463), the globe logo pulsing at beat 56 (13087 w465 against mid 7990
w442), and the close copy absent then present across beat 56 (0 → 3035); the video fades
to black and the audio re-measures **119.45 BPM** with the tail 8 dB under mid-track.
**Render md5 `ebb1926f18c44e1b7f53a976e2034bf1`** (34,985,688 B).

**New sources for v6** (added to the permanent list): the globe clip
`hf_20260902_194057_a5fb13ea-1054-44d3-a5e2-9ef7d8188564.mp4` under the same cloudfront
prefix, the product's own `public/shape-radio-logo.png`, and a Playwright capture of the
app's Radio page (`cap/r3_radio_top.png`) for the projected screen. `in/phoneB.mp4` is
v4's phone layer, unchanged.

### v6 scripts

**`meas_globe.py`** — Measures the globe disc in `in/D.mp4` (centre + radius) so the marks can be scattered on the lit landmass rather than guessed.

```python
import subprocess,sys,numpy as np
W,H=1440,2560
def frame(t):
    raw=subprocess.run(['ffmpeg','-v','error','-ss',f'{t:.3f}','-i','in/D.mp4','-frames:v','1','-f','rawvideo','-pix_fmt','gray','-'],capture_output=True).stdout
    return np.frombuffer(raw[:W*H],np.uint8).reshape(H,W).astype(np.float32)
prev=None
for t in [0,1,2,3,4,5,6,7,8,9,9.9]:
    f=frame(t); m=f>28; ys,xs=np.where(m)
    print(f"t={t}: mean {f.mean():.1f} disc bbox x {xs.min()}-{xs.max()} y {ys.min()}-{ys.max()} (w {xs.max()-xs.min()} h {ys.max()-ys.min()}) bright>120 px {(f>120).sum()}")
    if prev is not None:
        # horizontal drift: band through the middle rows, best shift
        cy=(ys.min()+ys.max())//2; band=f[cy-200:cy+200]; pb=prev[cy-200:cy+200]
        best=None
        for s in range(-80,81,2):
            a=band[:,max(0,s):W+min(0,s)]; b=pb[:,max(0,-s):W+min(0,-s)]
            d=np.abs(a-b).mean()
            if best is None or d<best[1]: best=(s,d)
        print(f"   drift vs prev second: {best[0]} px (err {best[1]:.2f}), zero-shift err {np.abs(band-pb).mean():.2f}")
    prev=f
# top edge of the disc over time (for logo placement) and the black space above
for t in [0,5,9.9]:
    f=frame(t); rows=(f>28).sum(1); top=int(np.argmax(rows>20)); print(f"t={t}: disc top row {top}, rows above with any px>28: {(rows[:top]>0).sum()}")
print('GLOBE_DONE')
```

**`plan6.py`** — Writes `params_v6.json`, the file every v6/v7 script reads. ⚠ **This block is a RECONSTRUCTION, and the reason it exists is the same lesson the v6 video prompts taught:** the generator was never recorded, only its output was, so a rebuilt sandbox could load `params_v6.json` from nowhere. Every value here is **derived** from the recorded t3 grid and then **asserted** against the numbers the v6 render actually used — so if the derivation is wrong it fails loudly instead of shifting a scene by a frame.

```python
#!/usr/bin/env python3
# plan6.py -- params_v6.json from the measured t3 grid. Nothing here is typed in; the offsets are derived.
#
# The rule the whole cut is built on: every transition's fade ENDS on a beat, so the new scene lands ON it
# rather than arriving mid-fade. So off = beat(n) - 0.3 for a 0.3 s xfade, and the beat numbers are the
# structure: 16 = the kick drop (phone), 28 = the wall, 44 = the globe.
import json
m=json.load(open('meas_t3.json')); P=m['P']; phi=m['phase_used']
FPS=24; TOTAL_FR=738
FADE=0.3; BEAT_AB, BEAT_BC, BEAT_CD = 16, 28, 44
b=lambda n: phi+n*P
offAB=round(b(BEAT_AB)-FADE,4); offBC=round(b(BEAT_BC)-FADE,4); offCD=round(b(BEAT_CD)-FADE,4)
p=dict(P=P, phi=phi, offAB=offAB, offBC=offBC, offCD=offCD,
       total=TOTAL_FR/FPS, lenC=round(offCD+FADE-offBC,4), t16=round(b(16),4),
       # mk_wall6.py reads t28 (the wall's first pulse beat); mk_globe.py reads t52 (logo) and t56 (close
       # copy). They were absent from the first cut of this file and both scripts died on a KeyError at
       # module load, before a frame was written -- so they are derived here with everything else.
       t28=round(b(28),4), t52=round(b(52),4), t56=round(b(56),4))
# the v6 render's own numbers, from the measured panel -- a drift here means the grid or the beats moved
for k,v in dict(offAB=7.7668, offBC=13.7945, offCD=21.8313, lenC=8.3368, total=30.75,
                t28=14.0945, t52=26.1497, t56=28.1589).items():
    assert abs(p[k]-v)<5e-4, f'{k} derived {p[k]} but v6 shipped {v} -- the grid or the fade beats changed'
json.dump(p,open('params_v6.json','w'),indent=1); print(json.dumps(p,indent=1))
```

**`plan_a2.py`** — The beat-12 cut that inserts the watch close-up, derived **once**. `mk_watch.py` (twice), `render6.sh` and `verify6.py` all read `params_a2.json`.

```python
#!/usr/bin/env python3
# plan_a2.py -- the beat-12 cut that inserts the watch close-up, in ONE place.
# Three copies of this arithmetic is how a 738-frame total quietly becomes 739: mk_watch.py needs the
# two segment windows, render6.sh needs the two trim lengths, verify6.py needs the cut frame.
import json,math
p=json.load(open('params_v6.json')); P=p['P']; phi=p['phi']; FPS=24; W,H=1440,2560
t12=phi+12*P
f12=math.ceil(t12*FPS)                  # the FIRST frame at or after beat 12 -- A2's first frame IS the beat frame
lenA1=f12/FPS
endA=p['offAB']+0.3                     # the A stream must reach the END of the A->B fade, not its start
nA2=math.ceil((endA-lenA1)*FPS)+12      # +12 frames of pad; xfade discards the tail, the total stays 738
lenA2=nA2/FPS
tSync=phi+14*P; fSync=math.ceil(tSync*FPS)
d=dict(t12=round(t12,4), f12=f12, lenA1=lenA1, nA2=nA2, lenA2=lenA2, endA=round(endA,4),
       tSync=round(tSync,4), fSync=fSync, fFadeStart=int(round(p['offAB']*FPS)),
       # the wide card's placement is FRAME-relative -- 1440-480-70 and 2560-480-420 -- so a re-prompted
       # Scene A does not move it. Only the close-up rides a physical object (meas_watch.py).
       wide=dict(s=480, x=W-480-70, y=H-480-420))
# the payoff claim, asserted rather than hoped: IN SYNC must land INSIDE the close-up
assert f12<=fSync<f12+nA2, f'beat 14 (frame {fSync}) is outside the close-up window [{f12},{f12+nA2})'
json.dump(d,open('params_a2.json','w'),indent=1); print(json.dumps(d,indent=1))
```

**`meas_watch.py`** — Measures the physical watch **face rect per frame** in the close-up clip (`in/A2.mp4`) so the card rides the wrist instead of sliding off it. Writes `meas_watch.json`. The wide card needs no measurement — see the header.

```python
#!/usr/bin/env python3
# meas_watch.py -- the physical watch FACE in the close-up clip, per frame -> meas_watch.json
#
# The WIDE card needs no measurement, and that is worth stating because the v7 scoping note got it
# wrong: v6's x 890 / y 1660 is a FRAME-relative inset -- 1440-480-70 and 2560-480-420 -- not a trace
# of that runner's wrist. A re-prompted Scene A does not move it. What a new clip CAN do is put the
# new runner's body under the card; that is a composition read by eye, not a number.
#
# The CLOSE-UP is the opposite: the card is drawn ONTO a physical object that moves mid-stride, so its
# rect has to be measured per frame or the card slides off the watch. The v7 A2 prompt asks for
# "a clean blank glowing panel", so the face is the frame's dominant BRIGHT, COMPACT, SOLID blob --
# solid panel vs scattered specular highlights IS the detector.
#
# Every threshold below is an UNMEASURED GUESS until this runs against the real clip: it prints the
# per-frame area/aspect/solidity and REFUSES a series it cannot believe rather than handing
# mk_watch.py a rect that tracks a sleeve highlight.
import json,os,subprocess,numpy as np
W,H=1440,2560; FPS=24; DS=4; RW,RH=W//DS,H//DS      # detect at 360x640 -- the face is huge in a close-up
pa=json.load(open('params_a2.json')); F0=pa['f12']; NF=pa['nA2']
SRC=os.environ.get('WATCH_SRC','in/A2.mp4')
TH   =float(os.environ.get('FACE_TH','170'))        # a face pixel is at least this bright
AMIN =float(os.environ.get('FACE_AMIN','0.010'))    # ...the blob covers at least this share of the reduced frame
AMAX =float(os.environ.get('FACE_AMAX','0.320'))    # ...and at most this
SOLID=float(os.environ.get('FACE_SOLID','0.45'))    # area/bbox -- a panel is solid, a scatter of lights is not
ARLO =float(os.environ.get('FACE_AR_LO','0.55'))    # bbox aspect w/h
ARHI =float(os.environ.get('FACE_AR_HI','1.90'))
FLOOR=float(os.environ.get('FACE_FLOOR','0.70'))    # believe fewer than this share of frames -> refuse
FILL =float(os.environ.get('WATCH_FILL','0.86'))    # card side as a fraction of the face width (recorded for the consumers)
raw=subprocess.run(['ffmpeg','-v','error','-i',SRC,'-vf',f'fps={FPS},scale={RW}:{RH}','-frames:v',str(NF),
                    '-f','rawvideo','-pix_fmt','gray','-'],capture_output=True).stdout
n=len(raw)//(RW*RH)
if n<NF: raise SystemExit(f'{SRC} gave {n} frames at {FPS} fps, need {NF} -- the close-up clip is too short for the beat-12 window')
G=np.frombuffer(raw[:n*RW*RH],np.uint8).reshape(n,RH,RW)
def blobs(m):
    """4-connected components of a boolean mask -> [[area,x0,x1,y0,y1]] by row runs + union-find
    (no scipy in this container, and the face is one dominant blob so this is enough)"""
    par={}
    def find(a):
        while par[a]!=a: par[a]=par[par[a]]; a=par[a]
        return a
    def uni(a,b):
        a,b=find(a),find(b)
        if a!=b: par[b]=a
    runs=[]; prev=[]
    for y in range(m.shape[0]):
        row=m[y].view(np.int8); cur=[]
        idx=np.flatnonzero(np.diff(np.concatenate(([np.int8(0)],row,[np.int8(0)]))))
        for s0,e0 in zip(idx[0::2],idx[1::2]):
            s0=int(s0); e0=int(e0)-1
            rid=len(runs); runs.append((y,s0,e0)); par[rid]=rid
            for ps,pe,pid in prev:
                if ps<=e0 and s0<=pe: uni(pid,rid)
            cur.append((s0,e0,rid))
        prev=cur
    acc={}
    for rid,(y,s0,e0) in enumerate(runs):
        r=find(rid); a=acc.get(r)
        if a is None: acc[r]=[e0-s0+1,s0,e0,y,y]
        else:
            a[0]+=e0-s0+1; a[1]=min(a[1],s0); a[2]=max(a[2],e0); a[3]=min(a[3],y); a[4]=max(a[4],y)
    return sorted(acc.values(),key=lambda a:-a[0])
tot=float(RW*RH); pick=[None]*NF
for i in range(NF):
    for a,x0,x1,y0,y1 in blobs(G[i]>TH)[:6]:
        bw=x1-x0+1; bh=y1-y0+1; sol=a/float(bw*bh); ar=bw/float(bh); sh=a/tot
        if AMIN<=sh<=AMAX and sol>=SOLID and ARLO<=ar<=ARHI:
            pick[i]=(x0,x1,y0,y1,sol,ar,sh); break
believed=sum(1 for r in pick if r)
if NF: print('FACE per-frame (first 8):', [None if r is None else (r[0]*DS,r[2]*DS,round(r[4],2),round(r[5],2),round(r[6],3)) for r in pick[:8]])
if believed < FLOOR*NF:
    raise SystemExit(f'only {believed}/{NF} frames carry a believable watch face (floor {FLOOR:.0%}) -- the card '
                     f'would ride an interpolated guess for most of the shot. Re-tune FACE_TH/FACE_AMIN/FACE_SOLID '
                     f'against the clip, or re-prompt A2 for a cleaner, brighter, blanker face')
cx=[None]*NF; cy=[None]*NF; ww=[None]*NF; hh=[None]*NF
for i,r in enumerate(pick):
    if r:
        cx[i]=(r[0]+r[1]+1)/2.0*DS; cy[i]=(r[2]+r[3]+1)/2.0*DS
        ww[i]=(r[1]-r[0]+1)*DS;     hh[i]=(r[3]-r[2]+1)*DS
def med(seq,i,w=2):
    v=[seq[j] for j in range(max(0,i-w),min(len(seq),i+w+1)) if seq[j] is not None]
    return float(np.median(v)) if v else None     # a 5-frame median: the wrist moves, the detector jitters
sm=[dict(f=F0+i, cx=med(cx,i), cy=med(cy,i), w=med(ww,i), h=med(hh,i), est=pick[i] is None) for i in range(NF)]
good=[i for i,s0 in enumerate(sm) if s0['cx'] is not None]
if not good: raise SystemExit('no believable watch face in ANY frame -- re-tune FACE_TH/FACE_SOLID against the clip')
for i,s0 in enumerate(sm):
    if s0['cx'] is None:                          # a gap the median could not fill -> carry the nearest believed rect, FLAGGED
        j=min(good,key=lambda g:abs(g-i)); s0.update({k:sm[j][k] for k in ('cx','cy','w','h')}); s0['est']=True
    for k in ('cx','cy','w','h'): s0[k]=int(round(s0[k]))
out=dict(closeup=dict(src=SRC,f0=F0,n=NF,believed=believed,fill=FILL,frames=sm), wide=pa['wide'])
json.dump(out,open('meas_watch.json','w'),indent=1)
print('WATCH-MEAS believed',believed,'/',NF,'est',sum(1 for s0 in sm if s0['est']),
      'w',min(s0['w'] for s0 in sm),'-',max(s0['w'] for s0 in sm),
      'cx',min(s0['cx'] for s0 in sm),'-',max(s0['cx'] for s0 in sm),
      'wide',pa['wide']['x'],pa['wide']['y'])
```

**`mk_watch.py`** — Draws the watch HR sync in **both** placements. `WATCH_MODE=wide` writes the 480×480 lower-right **card** for Scene A1 (v6's layer, unchanged — a phone-shaped card on a phone-shaped surface). `WATCH_MODE=closeup` writes a full-frame layer whose **round watch FACE** rides the measured face rect through the beat-12 close-up.

⚠ **v7.1 — TWO renderers, not one** (owner: *"for the watch, their is nothing appearing on the screen, have the shape triangle logo in the top left of watch screen with the hrm/bpm beat match. It just say synced with a glowing orb in the middle"*). The close-up now draws **`watchface()`**: the SHAPE two-triangle mark top-left, a glowing orb at centre, the two BPM figures, and **exactly ONE state word** (`SYNCED`, and only after sync). ⚠ **"nothing appearing on the screen" is what the RAW A2 clip looks like** — its prompt deliberately asks for a *blank glowing panel* so a drawn layer can own the pixels — but the ask supersedes the design regardless: the wide card's six elements typeset on a **round** face at ~900 px is clutter, and the round crop clips a rounded-rect's corners. ⚠ **The beat match is DRAWN, not captioned** — the orb pulses on the wearer's heart, the ring around it on the **music** grid, and across `tSync` the orb's envelope crossfades onto the ring's so the two visibly lock. **Envelopes are blended, never phases**: a phase lerp jumps at every wrap. The wide card and the face **never share a frame** (hard cut at `f12`), so the v7 IN-SYNC-in-three-places defect cannot reappear across them.

```python
#!/usr/bin/env python3
# mk_watch.py -- the watch HR sync, in BOTH placements, from TWO renderers sharing ONE clock.
#
# v6 drew one 480x480 layer overlaid at a fixed x 890 / y 1660. v7 keeps that EXACTLY for the wide shot
# and adds a second layer for the beat-12 close-up, where the physical watch fills much of the frame and
# the card has to ride it. ffmpeg's overlay filter takes ONE x/y for the whole stream -- it cannot read a
# per-frame table -- so a moving card must be baked into a FULL-FRAME layer overlaid at 0:0. That is the
# same pattern mk_wall6.py and mk_globe.py already use; nothing new is invented here.
#
# Two properties are asserted rather than hoped, because both would read as a glitch on the cut:
#   * hr_of() takes ABSOLUTE t in both modes, so the number does not jump at frame f12;
#   * the heart PHASE is integrated from frame 0 even when only frames [N0,N1) are written, so the pulse
#     does not restart at the cut. (Integrating from N0 would land the close-up mid-beat at random.)
#
# v7.1: the close-up no longer draws card(). It draws watchface() -- a ROUND face carrying the SHAPE mark
# top-left, a glowing orb at centre, the two BPM figures, and exactly ONE state word (SYNCED). card() is
# untouched and still owns the wide shot. The two never share a frame (hard cut at f12), so the v7
# IN-SYNC-in-three-places defect cannot come back across them either.
#
# Illustrative demo path, unchanged from v6: YOU climbs 104 -> 120 (the track's real tempo) and lands in
# sync on beat 14, before the kick drop on 16. On the wide CARD the three slots carry three DIFFERENT
# facts -- chip = the state, station line = the delta (+0 BPM at sync), pill = the action. On the FACE the
# state is a colour (cream FREE -> amber MATCHING -> teal SYNCED, the app's own ladder) plus one word.
import math,json,os,subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops
p=json.load(open('params_v6.json')); P=p['P']; phi=p['phi']
pa=json.load(open('params_a2.json'))
FPS=24; W,H=1440,2560
MODE=os.environ.get('WATCH_MODE','wide')
F='/home/user/fonts/'
TEAL=(52,214,197); CREAM=(242,237,228); AMBER=(232,164,64)
tSync=phi+14*P; tIn=1.3; tHr0=2.2; tMatch=2.7
_fonts={}
def mono(sz,w=700):
    """cached -- card() is called once per frame and would otherwise re-open the variable font 5x60 times"""
    sz=max(6,int(round(sz))); key=(sz,w)
    if key not in _fonts:
        f=ImageFont.truetype(F+'JetBrainsMono[wght].ttf',sz); f.set_variation_by_axes([w]); _fonts[key]=f
    return _fonts[key]
def clamp(x): return max(0.0,min(1.0,x))
def ss(x): x=clamp(x); return x*x*(3-2*x)
def hr_of(t): return 104+16*ss((t-tHr0)/(tSync-tHr0))
def tracked(d,x,y,txt,f,tr,fill,anchor='l'):
    w=sum(f.getlength(c) for c in txt)+tr*(len(txt)-1)
    if anchor=='c': x=x-w/2
    if anchor=='r': x=x-w
    for c in txt: d.text((x,y),c,font=f,fill=fill); x+=f.getlength(c)+tr
    return w
def heart(d,cx,cy,r,fill):
    d.ellipse((cx-r,cy-r*0.9,cx,cy+r*0.1),fill=fill); d.ellipse((cx,cy-r*0.9,cx+r,cy+r*0.1),fill=fill)
    d.polygon([(cx-r,cy-0.15*r),(cx+r,cy-0.15*r),(cx,cy+r*1.05)],fill=fill)
def dotglyph(d,cx,cy,filled,col,k=1.0):
    d.ellipse((cx-9*k,cy-9*k,cx+9*k,cy+9*k),outline=col,width=max(1,int(round(2*k))))
    if filled: d.ellipse((cx-4*k,cy-4*k,cx+4*k,cy+4*k),fill=col)
_tri={}
def trimark(h):
    """The SHAPE two-triangle mark at height h, cut from logo_tri.png -- the REAL geometry the wall lockup
    and the globe marks already use, never a hand-drawn approximation. assets.py writes that file as RGB
    PREMULTIPLIED OVER BLACK (no alpha channel), so straight alpha is recovered as the per-pixel max of
    the three channels; the face fills (9,11,11) underneath, so the residual premultiply error is under
    one part in 25. Cached per height -- this is called once per close-up frame."""
    h=max(6,int(round(h)))
    if 'src' not in _tri:
        im=Image.open('in/logo_tri.png').convert('RGB').crop(Image.open('in/logo_tri.png').convert('RGB').getbbox())
        r,g,b=im.split(); _tri['src']=Image.merge('RGBA',(r,g,b,ImageChops.lighter(ImageChops.lighter(r,g),b)))
    if h not in _tri:
        src=_tri['src']; _tri[h]=src.resize((max(1,int(round(src.width*h/src.height))),h),Image.LANCZOS)
    return _tri[h]

def card(t,S,u):
    """The card at side S. k scales EVERY coordinate, tracking value and font size, so the close-up is
    TYPESET at its real size rather than upscaled from a 480 bitmap -- a 480 card blown up to ~900 px is
    visibly soft next to a real watch face, and softness is exactly what a close-up exposes."""
    k=S/480.0
    def q(x): return x*k
    def wd(x): return max(1,int(round(x*k)))
    fH=mono(19*k,700); fN=mono(128*k,800); fS=mono(23*k,600); fP=mono(24*k,700); fU=mono(20*k,600)
    img=Image.new('RGBA',(S,S),(0,0,0,0))
    sh=Image.new('RGBA',(S,S),(0,0,0,0))
    ImageDraw.Draw(sh).rounded_rectangle((q(32),q(42),S-q(28),S-q(18)),radius=q(104),fill=(0,0,0,150))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(max(1.0,q(16)))))
    face=Image.new('RGBA',(S,S),(0,0,0,0)); d=ImageDraw.Draw(face)
    synced=t>=tSync; flash=clamp((t-tSync)/0.5) if synced else 0.0
    ringA=int(120+120*(1-flash)) if synced and flash<1 else 110
    m=q(30)
    d.rounded_rectangle((m,m,S-m,S-m),radius=q(104),fill=(10,12,12,236),outline=TEAL+(ringA,),width=wd(3))
    tracked(d,q(58),q(58),'HEART-RATE SYNC',fH,q(2.5),CREAM+(215,))
    # the header chip is the ONLY state word on the card; the other two slots carry a figure and an action
    tag=('IN SYNC' if synced else ('MATCHING...' if t>=tMatch else 'FREE')); tcol=TEAL if synced else (AMBER if t>=tMatch else CREAM)
    tracked(d,S-q(58),q(58),tag,fH,q(2.5),tcol+(240,),'r')
    d.line((q(58),q(92),S-q(58),q(92)),fill=CREAM+(50,),width=wd(1))
    hs=1+0.16*math.exp(-u/0.14); heart(d,q(86),q(182),max(1.0,q(15)*hs),TEAL+(255,))
    d.text((q(116),q(104)),str(int(round(hr_of(t)))),font=fN,fill=CREAM+(255,))
    tracked(d,q(120),q(232),'YOU · BPM',fU,q(2.0),CREAM+(150,))
    # the delta is EVIDENCE, never a second status echo: hr_of clamps at 120, so this reads +0 BPM at sync
    delta=int(round(hr_of(t)))-120
    tracked(d,q(58),q(278),'STATION 120 BPM',fS,q(1.5),CREAM+(200,))
    tracked(d,S-q(58),q(278),f'{delta:+d} BPM',fS,q(1.5),(TEAL if synced else CREAM)+(220,),'r')
    # the pill is a BUTTON: it labels what pressing it DOES, so no state word lands here
    pilltxt=('STOP MATCHING' if t>=tMatch else 'MATCH MY BPM'); filled=t>=tMatch
    pc=TEAL if synced else (CREAM if not filled else AMBER)
    d.rounded_rectangle((q(58),q(322),S-q(58),q(378)),radius=q(28),outline=pc+(190,),width=wd(2),fill=(pc+(40,)) if synced else (0,0,0,0))
    w=sum(fP.getlength(c) for c in pilltxt)+q(1.5)*(len(pilltxt)-1); x0=(S-(w+q(34)))/2
    dotglyph(d,x0+q(9),q(350),filled,pc+(255,),k); tracked(d,x0+q(34),q(338),pilltxt,fP,q(1.5),pc+(255,))
    img.alpha_composite(face)
    if synced and flash<1:  # one expanding ring on the sync instant
        e=q(60)*flash; rg=Image.new('RGBA',(S,S),(0,0,0,0))
        ImageDraw.Draw(rg).rounded_rectangle((m-e,m-e,S-m+e,S-m+e),radius=q(104)+e,outline=TEAL+(int(200*(1-flash)),),width=wd(4))
        img.alpha_composite(rg.filter(ImageFilter.GaussianBlur(max(1.0,q(4)))))
    return img

def watchface(t,S,u,ub):
    """v7.1 -- the CLOSE-UP face. Deliberately NOT card(); see the header for why.

    Layout in 480-space (every coordinate, tracking value and font size scales by k=S/480, so the face is
    TYPESET at its real size rather than upscaled from a 480 bitmap -- the same rule card() follows):
      disc     centre (240,240) r 222 -- nearly fills S, and S is the MEASURED face width x fill
      mark     top-left at (84,92), height 46; its far corner is 211 px from centre, inside the 222 rim
      orb      centre (240,218), base r 46; station ring r 78 (bottom 296, clear of the labels at 330)
      figures  YOU column centred x 160, STATION column centred x 320; labels top y 330, numbers top y 352
      state    centred, top y 406 -- the ONLY word on the face, and only after tSync
    Every row was checked against the disc chord: the widest (numbers, bottom y 392) has 162 px either
    side of centre and spends 72. Nothing here can fall outside the round crop.

    The beat match is drawn: the orb's envelope is the WEARER's (u, integrated from hr_of), the ring's is
    the MUSIC's (ub, from the measured grid), and across tSync the orb crossfades onto the ring so the two
    lock in front of the viewer. Envelopes are blended, never phases -- a phase lerp jumps at every wrap.

    Colour is the state, following the app's own ladder: cream FREE -> amber MATCHING -> teal SYNCED. That
    is also what keeps verify6's amber->teal check honest with a wide margin: before sync NOTHING on the
    face is teal at full alpha, after it the orb, ring and word all are."""
    k=S/480.0
    def q(x): return x*k
    def wd(x): return max(1,int(round(x*k)))
    fU=mono(17*k,600); fN=mono(40*k,800); fW=mono(22*k,700)
    img=Image.new('RGBA',(S,S),(0,0,0,0)); d=ImageDraw.Draw(img)
    C=q(240); R=q(222)
    synced=t>=tSync; blend=clamp((t-tSync)/0.6)
    SC=TEAL if synced else (AMBER if t>=tMatch else CREAM)      # ONE state colour, two pulse sources
    eb=math.exp(-ub/0.13)                                        # the music
    e=math.exp(-u/0.13)*(1-blend)+eb*blend                       # the wearer, crossfading onto the music
    d.ellipse((C-R,C-R,C+R,C+R),fill=(9,11,11,236),outline=TEAL+(160 if synced else 110,),width=wd(3))
    m=trimark(q(46)); img.alpha_composite(m,(int(round(q(84))),int(round(q(92)))))
    ox,oy=C,q(218); orad=q(46)*(1+0.22*e)
    gl=Image.new('RGBA',(S,S),(0,0,0,0))
    ImageDraw.Draw(gl).ellipse((ox-orad*1.9,oy-orad*1.9,ox+orad*1.9,oy+orad*1.9),fill=SC+(int(60+90*e),))
    img.alpha_composite(gl.filter(ImageFilter.GaussianBlur(max(1.0,q(22)))))
    d.ellipse((ox-orad,oy-orad,ox+orad,oy+orad),fill=SC+(255,))
    rr=q(78); d.ellipse((ox-rr,oy-rr,ox+rr,oy+rr),outline=SC+(int(90+150*eb),),width=wd(2+3*eb))
    tracked(d,q(160),q(330),'YOU',fU,q(2.0),CREAM+(150,),'c')
    tracked(d,q(320),q(330),'STATION',fU,q(2.0),CREAM+(150,),'c')
    tracked(d,q(160),q(352),str(int(round(hr_of(t)))),fN,q(1.0),SC+(255,),'c')
    tracked(d,q(320),q(352),'120',fN,q(1.0),CREAM+(210,),'c')
    if synced:  # the one word, faded in over a quarter second
        tracked(d,C,q(406),'SYNCED',fW,q(4.0),TEAL+(int(255*clamp((t-tSync)/0.25)),),'c')
        if blend<1:  # one expanding rim ring on the sync instant -- capped so it cannot clip the canvas
            ex=q(14)*blend; rg=Image.new('RGBA',(S,S),(0,0,0,0))
            ImageDraw.Draw(rg).ellipse((C-R-ex,C-R-ex,C+R+ex,C+R+ex),outline=TEAL+(int(210*(1-blend)),),width=wd(4))
            img.alpha_composite(rg.filter(ImageFilter.GaussianBlur(max(1.0,q(4)))))
    return img

if MODE=='wide':
    # v6's layer, byte-for-byte in intent: 480x480, overlaid at pa['wide'] (a FRAME-relative inset, not a
    # wrist trace -- see meas_watch.py). Rendered to t16 rather than to the cut so the layer still covers
    # the whole of Scene A if the close-up is ever reverted; render6.sh trims what it does not use.
    SW=480; N0=0; N1=int(round(p['t16']*FPS)); OW,OH=SW,SW; OUT=os.environ.get('WATCH_OUT','in/watch.mov'); mw=None
else:
    mw=json.load(open('meas_watch.json'))['closeup']
    N0=mw['f0']; N1=N0+mw['n']; OW,OH=W,H; OUT=os.environ.get('WATCH_OUT','in/watch_cu.mov')
    assert N0==pa['f12'] and mw['n']==pa['nA2'], 'meas_watch.json was measured against a different cut -- re-run plan_a2.py then meas_watch.py'
proc=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgba','-s',f'{OW}x{OH}','-r',str(FPS),
                       '-i','-','-c:v','qtrle','-pix_fmt','argb',OUT],stdin=subprocess.PIPE)
phase=0.0; last_t=0.0; est=0
for i in range(N1):
    t=i/FPS
    hr=hr_of(t); phase+=hr/60.0*(t-last_t); last_t=t; u=phase%1.0
    ub=((t-phi)%P)/P             # the MUSIC's phase, straight off the measured grid -- the face's second pulse
    if i<N0: continue            # phase integrated from 0 regardless -- the pulse must not restart at the cut
    a=clamp((t-tIn)/0.6)
    img=Image.new('RGBA',(OW,OH),(0,0,0,0))
    if MODE=='wide':
        if a>0: img.alpha_composite(card(t,SW,u))
    else:
        r=mw['frames'][i-N0]
        if r.get('est'): est+=1
        S=max(120,int(round(r['w']*mw['fill'])))
        img.alpha_composite(watchface(t,S,u,ub),(int(round(r['cx']-S/2)),int(round(r['cy']-S/2))))
    if a<1:
        img.putalpha(img.split()[3].point(lambda v:int(v*a)))
    proc.stdin.write(img.tobytes())
proc.stdin.close(); proc.wait()
print(f'WATCH-OK mode={MODE} out={OUT} frames={N1-N0} sync_at={round(tSync,3)}' + (f' interpolated={est}' if mw else ''))
```

**`meas_wall.py`** — Measures the Scene C slab **rect** (both axes) in `in/C_zoom.mp4`, plus the capture's own header row, so the projected screen can be sized to FILL the slab instead of guessed at 560 px.

```python
#!/usr/bin/env python3
# meas_wall.py -- the Scene C slab RECT + the capture's header row -> meas_wall.json
# v6 chose SCR_W/SCR_Y against a HORIZONTAL bound alone: the fit check sampled the wordmark band's
# left/right margins at four times and never measured the slab's top or bottom, so a wider screen
# could reach y 2469 of 2560 with nothing saying whether that was still on the slab.
# The club clip STROBES -- verify6 records the wordmark band reading dark on only 64 of 200 sampled
# Scene-C frames -- so ONE frame is not a measurement. Sample many, drop the frames where the panel
# does not read, and INTERSECT the rest: the screen is drawn at ONE constant geometry, so it must fit
# the NARROWEST moment. (The push-in eases 1.50x -> 1.15x, so the slab only widens; the intersection
# is that earliest, tightest bound.)
import json,os,subprocess,numpy as np
from PIL import Image
W,H=1440,2560
p=json.load(open('params_v6.json')); lenC=p['lenC']
SRC='in/C_zoom.mp4'; CAP='/home/user/cap/r3_radio_top.png'
TH=float(os.environ.get('SLAB_TH','20'))          # the same dark threshold verify6's darkrun uses
NS=int(os.environ.get('SLAB_SAMPLES','60'))
def gframe(t):
    b=subprocess.run(['ffmpeg','-v','error','-ss',f'{max(0,t):.4f}','-i',SRC,'-frames:v','1','-f','rawvideo','-pix_fmt','gray','-'],capture_output=True).stdout
    a=np.frombuffer(b,np.uint8)
    if a.size!=W*H: raise SystemExit(f'bad frame t={t:.3f} size={a.size} expected {W*H}')
    return a.reshape(H,W).astype(np.float32)
def run(mask,c):
    if c<0 or c>=len(mask) or not mask[c]: return None
    l=c
    while l>0 and mask[l-1]: l-=1
    r=c
    while r<len(mask)-1 and mask[r+1]: r+=1
    return int(l),int(r)
def rect(g):
    h=run((g[760:832].mean(axis=0)<TH),720)                    # the band the v6 wordmark rode
    if h is None: return None
    cx=(h[0]+h[1])//2
    v=run((g[:,max(0,cx-40):cx+41].mean(axis=1)<TH),796)       # vertical, through the slab's own centre
    if v is None: return None
    cy=(v[0]+v[1])//2
    h2=run((g[max(0,cy-36):cy+37].mean(axis=0)<TH),cx) or h    # re-read horizontal at the vertical centre
    return dict(left=h2[0],right=h2[1],top=v[0],bottom=v[1])
ts=[lenC*(i+0.5)/NS for i in range(NS)]
rs=[]; bad=[]
for t in ts:
    r=rect(gframe(t))
    if r is None: bad.append(round(t,3))
    else: rs.append(dict(t=round(t,3),**r))
if len(rs)<NS//3: raise SystemExit(f'slab read on only {len(rs)}/{NS} frames -- not a measurement; check SLAB_TH or the clip')
# ⚠ DROPPING THE FRAMES THAT DO NOT READ IS ONLY HALF THE JOB -- THE FRAMES THAT READ *BADLY*
# WERE STILL BEING INTERSECTED, AND ONE OF THEM COLLAPSED THE WHOLE MEASUREMENT.
# The comment at the head of this file says to sample many, drop the frames where the panel does
# not read, and intersect the rest. `rect()` returning None catches only the total misses. A frame
# caught MID-STROBE still returns a rect -- the seed pixel is dark, the run just terminates early
# on a lit edge -- so it survives as a legitimate-looking narrow slab and, under a strict min/max
# intersection, a single one of them defines the answer.
# Measured on the real clip: per-frame widths run median 1127, max 1200, but a handful read
# 575-682, and one run produced a 132 px intersection -- against a slab the recipe's own checkpoint
# records at ~1165 px (wordmark 1010 + margins 74/81). That is not a narrow slab, it is a failed
# measurement wearing the same shape as one.
# So: reject reads that disagree with the consensus BEFORE intersecting, then stay strict among the
# survivors -- the file's "must fit the NARROWEST moment" rule is about the true narrowest, not an
# artefact. 0.75 is a judgement call and is stated as one: the true width varies smoothly with the
# 1.50x -> 1.15x ease (a ~22% span end to end), so a read more than 25% under the median cannot be
# the slab at any point in the move.
_w=[r['right']-r['left'] for r in rs]; _med=sorted(_w)[len(_w)//2]
_keep=[r for r,w in zip(rs,_w) if w>0.75*_med]
if len(_keep)<max(4,len(rs)//2):
    raise SystemExit(f'slab consensus is not believable: only {len(_keep)}/{len(rs)} reads within 25% of the median width {_med} -- the panel geometry is not stable enough to size a screen against')
print(f'slab: {len(rs)}/{NS} read, {len(_keep)} kept after outlier rejection (median width {_med})')
rs=_keep
slab=dict(left=max(r['left'] for r in rs), right=min(r['right'] for r in rs),
          top=max(r['top'] for r in rs),   bottom=min(r['bottom'] for r in rs))
assert slab['right']>slab['left']+200 and slab['bottom']>slab['top']+200, f'degenerate slab {slab}'
edge = slab['top']<=2 or slab['bottom']>=H-3
if edge: print('WARN slab run reached a frame edge -- the dark run escaped the panel into an unlit room; bound SCR_W/SCR_Y by hand')
# the capture's own header: the topmost row carrying real ink, so CROP_TOP restores the app wordmark
cap=Image.open(CAP).convert('L'); ca=np.asarray(cap).astype(np.float32)
ink=(ca<128).sum(axis=1); rows=np.where(ink[:400]>12)[0]
ink_top=int(rows[0]) if rows.size else 0
out=dict(slab=slab, samples=NS, valid=len(rs), rejected=len(bad), edge_touch=bool(edge),
         spread={k:[min(r[k] for r in rs),max(r[k] for r in rs)] for k in ('left','right','top','bottom')},
         capture=dict(w=cap.width,h=cap.height,ink_top=ink_top,crop_top=max(0,ink_top-24)))
json.dump(out,open('meas_wall.json','w'),indent=1)
print('WALL-MEAS',json.dumps(out['slab']),'valid',len(rs),'/',NS,'capture',cap.width,'x',cap.height,'ink_top',ink_top,'crop_top',out['capture']['crop_top'])
```

**`mk_wall6.py`** — Draws the Scene C wall layer: the app Radio page projected to **fill the measured slab**, its bloom pulsing on the gated kick. (v6 drew a separate wordmark band above a 560 px screen; v7 retires the band and lets the page's own header carry the wordmark.)

```python
# Scene C wall layer (v7): the app's Radio page projected to FILL the measured slab. 1440x2560, from offBC for lenC.
# v6 drew a separate shape-radio-logo.png band above a 560px screen that used barely half the slab. v7 un-crops
# the capture so the page's OWN header wordmark rides on the wall (the owner's "looks like it does on app and
# website" note) and sizes the screen from meas_wall.json -- so the drawn band is RETIRED, not repositioned.
import math,json,os,subprocess,numpy as np
from PIL import Image, ImageFilter, ImageDraw
p=json.load(open('params_v6.json')); m3=json.load(open('meas_t3.json')); mw=json.load(open('meas_wall.json'))
P=p['P']; phi=p['phi']; KB=m3['kick_by_beat']; offBC=p['offBC']; T=p['lenC']; tC=p['t28']; FPS=24; W,H=1440,2560
N=int(round(T*FPS))
SL,SR,ST,SB=(mw['slab'][k] for k in ('left','right','top','bottom'))
MG=int(os.environ.get('SCR_MARGIN','34'))                                  # slab inset: fills without touching the edge
CT=int(os.environ.get('CROP_TOP',str(mw['capture']['crop_top'])))          # measured: 24px of paper above the header ink
CB=int(os.environ.get('CROP_BOT','1420'))
scr=Image.open('/home/user/cap/r3_radio_top.png').convert('RGB').crop((0,CT,750,CB))
availW=(SR-SL)-2*MG; availH=(SB-ST)-2*MG
# 0 = derive (fill, height-bound). Derive HEIGHT first and take the width from it: going W->H and back
# rounds twice, and the capture is ~1.4-1.9x taller than wide, so half a pixel of upward rounding in SW
# becomes more than one in SH -- SH lands 1px over availH and the assert below blames the operator for
# an artefact of the arithmetic. Deriving from the bound side makes the height exact by construction.
SW=int(os.environ.get('SCR_W','0'))
if SW: SH=int(round(scr.height*SW/scr.width))
else:
    SH=availH; SW=int(round(scr.width*SH/scr.height))
    if SW>availW: SW=availW; SH=int(round(scr.height*SW/scr.width))
scr=scr.resize((SW,SH),Image.LANCZOS)
SX=int(os.environ.get('SCR_X','0')) or SL+((SR-SL)-SW)//2
SY=int(os.environ.get('SCR_Y','0')) or ST+((SB-ST)-SH)//2
assert SW<=availW and SH<=availH, f'screen {SW}x{SH} exceeds slab {availW}x{availH} -- lower SCR_MARGIN or re-measure'
mk=Image.new('L',(SW,SH),0); ImageDraw.Draw(mk).rounded_rectangle((6,6,SW-7,SH-7),radius=26,fill=255); mk=mk.filter(ImageFilter.GaussianBlur(9))
sa=np.asarray(scr).astype(np.float32)/255*(np.asarray(mk).astype(np.float32)/255)[...,None]
spad=90; scan=Image.new('RGB',(SW+2*spad,SH+2*spad),(0,0,0)); scan.paste(Image.fromarray((sa*255+0.5).astype('uint8')),(spad,spad))
sbloom=np.asarray(scan.filter(ImageFilter.GaussianBlur(40))).astype(np.float32)/255
def pres(n): return 0.0 if n<0 or n>=len(KB) else min(1.0,max(0.0,(KB[n]-0.15)/0.30))
def kof(t):
    if t<tC-0.01: return 0.0
    n=int(math.floor((t-phi)/P)); return math.exp(-(((t-phi)%P)/P)/0.20)*pres(n)
def clamp(x): return max(0.0,min(1.0,x))
def paste(dst,src,gain,x0,y0):
    h,w=src.shape[:2]; xs0=max(0,x0); ys0=max(0,y0); xs1=min(W,x0+w); ys1=min(H,y0+h)
    if xs1<=xs0 or ys1<=ys0: return
    dst[ys0:ys1,xs0:xs1]+=src[ys0-y0:ys1-y0,xs0-x0:xs1-x0]*gain
def scaled(arr,s):
    if abs(s-1)<1e-4: return arr
    h,w=arr.shape[:2]; im=Image.fromarray((np.clip(arr,0,1)*255+0.5).astype('uint8')); return np.asarray(im.resize((int(round(w*s)),int(round(h*s))),Image.LANCZOS)).astype(np.float32)/255
proc=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-c:v','libx264','-preset','fast','-crf','10','-pix_fmt','yuv420p','in/wall6.mp4'],stdin=subprocess.PIPE)
for i in range(N):
    t=offBC+i/FPS; k=kof(t); e=clamp((t-offBC)/0.3)*clamp((offBC+T-t)/0.3)
    f=np.zeros((H,W,3),np.float32)
    # the beat rides the BLOOM, never the geometry: a slab-filling screen must not grow past the slab it fills
    bl=scaled(sbloom,1+0.05*k); bh,bw=bl.shape[:2]
    paste(f,bl,0.26+0.55*k,SX+SW//2-bw//2,SY+SH//2-bh//2)
    paste(f,sa,0.88+0.10*k,SX,SY)
    proc.stdin.write((np.clip(f*e,0,1)*255+0.5).astype('uint8').tobytes())
proc.stdin.close(); proc.wait(); print('WALL6-OK',N,'screen',SW,'x',SH,'at',SX,SY,'slab',(SL,SR,ST,SB),'margin',MG,'crop_top',CT)
```

**`meas_pins.py`** — Measures the Scene D disc **and the baked pin heads** in the re-prompted globe (v7), plus the spin's horizontal drift, so the marks can be popped **onto the pins** instead of onto luma-sampled cities. Writes `meas_pins.json`; also retires `mk_globe.py`'s file-tied `CX,CY,R=727,1295,676`.

```python
#!/usr/bin/env python3
# meas_pins.py -- the Scene D disc + the BAKED PIN heads -> meas_pins.json
# The v7 D prompt asks for "thin vertical light beams rise from a scattering of points on the
# surface, each anchored to a small glowing dot where it meets the ground". So a pin beam is a
# NARROW, TALL bright run and a city light is a WIDE, SHORT blob -- that difference IS the detector.
# Every threshold below is an UNMEASURED GUESS until this runs against the real clip: it prints the
# per-sample head count and REFUSES to write a set it cannot believe, rather than handing mk_globe.py
# 27 city lights dressed as pins.
import json,os,subprocess,numpy as np
W,H=1440,2560
SRC=os.environ.get('D_SRC','in/D.mp4')
TH   =float(os.environ.get('PIN_TH','120'))      # a beam pixel is at least this bright
BMIN =int(os.environ.get('PIN_BEAM_MIN','16'))   # a beam is at least this TALL (px)
BMAXW=int(os.environ.get('PIN_MAX_W','8'))       # ...and at most this WIDE (px)
NS   =int(os.environ.get('PIN_SAMPLES','16'))
FLOOR=int(os.environ.get('PIN_FLOOR','10'))      # median heads below this -> refuse
def frame(t):
    raw=subprocess.run(['ffmpeg','-v','error','-ss',f'{max(0,t):.3f}','-i',SRC,'-frames:v','1','-f','rawvideo','-pix_fmt','gray','-'],capture_output=True).stdout
    if len(raw)<W*H: raise SystemExit(f'short read at t={t:.3f} -- is {SRC} really {W}x{H}?')
    return np.frombuffer(raw[:W*H],np.uint8).reshape(H,W).astype(np.float32)
def dur():
    o=subprocess.run(['ffprobe','-v','error','-select_streams','v:0','-show_entries','format=duration','-of','csv=p=0',SRC],capture_output=True,text=True).stdout.strip()
    return float(o)
def disc_of(f):
    ys,xs=np.where(f>28)
    if xs.size==0: return None
    l,r,t,b=int(xs.min()),int(xs.max()),int(ys.min()),int(ys.max())
    return dict(cx=(l+r)//2, cy=(t+b)//2, r=max(r-l,b-t)//2, left=l, right=r, top=t, bottom=b)
def heads(f,d):
    """tall+narrow column runs -> [(head_x, head_y, anchor_y)], anchor on the globe"""
    m=f>TH; cols={}
    for x in range(W):
        c=m[:,x]
        if not c.any(): continue
        idx=np.where(c)[0]; brk=np.where(np.diff(idx)>1)[0]
        st=np.concatenate(([0],brk+1)); en=np.concatenate((brk,[idx.size-1]))
        runs=[(int(idx[a]),int(idx[b])) for a,b in zip(st,en) if idx[b]-idx[a]+1>=BMIN]
        if runs: cols[x]=runs
    out=[]; used=set()
    for x in sorted(cols):
        for (t0,b0) in cols[x]:
            if (x,t0) in used: continue
            used.add((x,t0)); xs=[x]; tops=[t0]; bots=[b0]; xx=x+1
            # widen right while the run continues -- NO width cap on the loop. The first cut of this stopped
            # at BMAXW+1 columns, so the reject below could only ever fire on exactly that width: a 40px lit
            # region was SLICED into four rejected 9-wide groups plus an accepted 4-wide remainder that
            # passed every downstream gate as a pin. Consume the whole region, then reject it whole.
            while xx in cols:
                cand=[(a,b) for (a,b) in cols[xx] if abs(a-t0)<=6 and (xx,a) not in used]
                if not cand: break
                a,b=cand[0]; used.add((xx,a)); xs.append(xx); tops.append(a); bots.append(b); xx+=1
            if len(xs)>BMAXW: continue                              # too wide -> a lit region, not a beam
            hx=int(round(sum(xs)/len(xs))); hy=int(min(tops)); ay=int(max(bots))
            if (hx-d['cx'])**2+(ay-d['cy'])**2 > (1.02*d['r'])**2: continue   # the ANCHOR must sit on the globe
            out.append((hx,hy,ay))
    keep=[]                                                          # one beam read twice -> one head
    for h in sorted(out,key=lambda h:(h[1],h[0])):
        if all((h[0]-k[0])**2+(h[1]-k[1])**2>24**2 for k in keep): keep.append(h)
    return keep
def drift(earlier,later,d,dt):
    """s that best maps earlier[x] -> later[x+s]; +ve = content moves RIGHT. px/s."""
    cy=d['cy']; a0=later[max(0,cy-200):cy+200]; b0=earlier[max(0,cy-200):cy+200]
    best=None
    for s in range(-120,121):
        a=a0[:,max(0,s):W+min(0,s)]; b=b0[:,max(0,-s):W+min(0,-s)]
        e=float(np.abs(a-b).mean())
        if best is None or e<best[1]: best=(s,e)
    return best[0]/dt, best[1]
D=dur(); ts=[round(D*(i+0.5)/NS,3) for i in range(NS)]
samples=[]; discs=[]
for t in ts:
    f=frame(t); d=disc_of(f)
    if d is None or d['r']<200: print(f'WARN no disc at t={t} -- skipped'); continue
    hs=heads(f,d); discs.append(d)
    samples.append(dict(t=t, heads=[[h[0],h[1]] for h in hs], anchors=[[h[0],h[2]] for h in hs]))
    print(f't={t}: disc c({d["cx"]},{d["cy"]}) r{d["r"]} heads {len(hs)}')
if not samples: raise SystemExit('no usable D frames -- check D_SRC')
# The DISC and the DRIFT are measured from the frames themselves and do not depend on the pin count, so
# they are computed BEFORE the believability test -- v7.1 fix. The first cut raised SystemExit on a low
# head count, and under render6.sh's `set -e` that aborted the whole render; worse, when it was run by
# hand the file was never written, so mk_globe.py fell back to v6's FILE-TIED cx/cy/r 727/1295/676 --
# and the logo row and the close row are derived from that disc. A clip whose pins we cannot find is not
# a clip whose GEOMETRY we cannot measure, and conflating the two silently mis-placed two more layers.
med_disc=lambda k: int(np.median([d[k] for d in discs]))
disc=dict(cx=med_disc('cx'), cy=med_disc('cy'), r=med_disc('r'),
          left=med_disc('left'), right=med_disc('right'), top=med_disc('top'), bottom=med_disc('bottom'))
dt=ts[1]-ts[0]; vx,err=drift(frame(ts[0]),frame(ts[1]),disc,dt)
vx2,err2=drift(frame(ts[-2]),frame(ts[-1]),disc,dt)
print(f'drift {vx:.1f} px/s (err {err:.2f}) / {vx2:.1f} px/s late (err {err2:.2f})')
counts=sorted(len(s['heads']) for s in samples); med=counts[len(counts)//2]
believed = med>=FLOOR
out=dict(src=SRC, duration=round(D,3), disc=disc, believed=believed,
         samples=(samples if believed else []),
         heads=dict(min=counts[0], median=med, max=counts[-1]),
         drift_px_per_s=round((vx+vx2)/2,2), drift_err=[round(err,3),round(err2,3)],
         detector=dict(th=TH, beam_min=BMIN, max_w=BMAXW, samples=NS, floor=FLOOR))
json.dump(out,open('meas_pins.json','w'),indent=1)
if not believed:
    msg=(f'PINS-UNBELIEVED median {med} heads/frame (floor {FLOOR}) -- the disc and drift ARE written and '
         f'will be used; the pin SET is withheld and mk_globe.py draws its own beams. Re-tune PIN_TH/'
         f'PIN_BEAM_MIN/PIN_MAX_W against the clip if the prompt really did bake beams in.')
    if os.environ.get('PIN_STRICT'): raise SystemExit(msg)
    print(msg)                                                 # exit 0: a render is still correct without pins
else:
    print('PINS-OK', med, 'heads (median),', len(samples), 'samples, drift', out['drift_px_per_s'], 'px/s')
```

**`mk_globe.py`** — Draws the Scene D layer: 27 SHAPE marks popping on lit cities, the logo above the globe from beat 52, the close copy from beat 56.

```python
# Scene D layer (v7): Shape marks popping ONTO the globe's baked pin heads from beat 48 (v6 sampled lit cities), the SHAPE logo
# popping above the globe on beat 52 and pulsing on the kick gate, the close copy under the globe from beat 56.
# Illustrative — no count is claimed, and no number, label or city name is ever drawn. 1440x2560 from offCD to total.
import math,json,os,subprocess,random,numpy as np
from PIL import Image, ImageFilter, ImageDraw
p=json.load(open('params_v6.json')); m3=json.load(open('meas_t3.json'))
P=p['P']; phi=p['phi']; KB=m3['kick_by_beat']; offCD=p['offCD']; total=p['total']; FPS=24; W,H=1440,2560
N=int(round((total-offCD)*FPS)); random.seed(6)
try: MEAS=json.load(open('meas_pins.json'))
except Exception as e: MEAS=None; print(f'WARN meas_pins.json unreadable ({type(e).__name__}) -- falling back to the v6 hardcoded disc AND luma placement')
# v7.1: the DISC is used whenever the file reads at all; only the pin SET is gated on `believed`. meas_pins.py
# withholds `samples` when it cannot believe the detection but still writes the geometry it DID measure -- and
# the logo row and the close row are derived from that geometry, so conflating "no pins" with "no disc" would
# silently mis-place two more layers on a clip we HAD successfully measured.
PINS = MEAS if (MEAS and MEAS.get('believed') and MEAS.get('samples')) else None
# every one of these was measured against the v6 D.mp4 and is wrong for any re-prompted clip -> meas_pins.py owns them now
D=(MEAS or {}).get('disc') or dict(cx=727,cy=1295,r=676,top=618,bottom=1972,left=44,right=1410)
CX,CY,R=D['cx'],D['cy'],D['r']
VX=float((MEAS or {}).get('drift_px_per_s',0.0))   # the spin, in px/s -- measured even when the pins are unbelieved
BEAM=int(os.environ.get('BEAM_PX','118'))          # how far a mark stands ABOVE its anchor when WE draw the beam
LINE=os.environ.get('PIN_LINE','auto')             # auto|always|never -- see the draw loop
def clamp(x): return max(0.0,min(1.0,x))
def pres(n): return 0.0 if n<0 or n>=len(KB) else min(1.0,max(0.0,(KB[n]-0.15)/0.30))
def kof(t,t0):
    if t<t0-0.01: return 0.0
    n=int(math.floor((t-phi)/P)); return math.exp(-(((t-phi)%P)/P)/0.20)*pres(n)
def back(g):  # ease-out-back 0->1 with overshoot
    g=clamp(g); c1=1.70158; c3=c1+1; return 1+c3*(g-1)**3+c1*(g-1)**2
def dframe(td):  # gray frame of D at D-time td
    raw=subprocess.run(['ffmpeg','-v','error','-ss',f'{max(0,td):.3f}','-i','in/D.mp4','-frames:v','1','-f','rawvideo','-pix_fmt','gray','-'],capture_output=True).stdout
    return np.frombuffer(raw[:W*H],np.uint8).reshape(H,W).astype(np.float32)
# --- the mark: the SHAPE two-triangle mark cut from logo_tri.png (teal + white, real geometry)
tri=np.asarray(Image.open('in/logo_tri.png').convert('RGB')).astype(np.float32)/255
ys,xs=np.where(tri.max(2)>0.05); mark=tri[ys.min():ys.max()+1,xs.min():xs.max()+1]
MH=44; ms=MH/mark.shape[0]; mimg=Image.fromarray((mark*255+0.5).astype('uint8')).resize((int(round(mark.shape[1]*ms)),MH),Image.LANCZOS)
markA=np.asarray(mimg).astype(np.float32)/255; mpad=30
mcan=Image.new('RGB',(markA.shape[1]+2*mpad,MH+2*mpad),(0,0,0)); mcan.paste(mimg,(mpad,mpad)); markG=np.asarray(mcan.filter(ImageFilter.GaussianBlur(10))).astype(np.float32)/255; markP=np.asarray(mcan).astype(np.float32)/255
# --- the logo above the globe
tri_l,txt_l,trig_l,txtg_l=[np.asarray(Image.open(f'in/{n}.png').convert('RGB')).astype(np.float32)/255 for n in ('logo_tri','logo_txt','logo_tri_glow','logo_txt_glow')]
LW=440; LCX=W//2; LCY=int(os.environ.get('LOGO_CY','0')) or max(150,int(round(0.53*D['top'])))   # v6's 330 == 0.53 x its 618-row disc top
# --- close copy
close=np.asarray(Image.open('cap/txt/close.png').convert('RGBA')).astype(np.float32)/255; closeP=close[...,:3]*close[...,3:4]
CLY=int(os.environ.get('CLOSE_Y','0')) or min(H-closeP.shape[0]-40, D['bottom']+88)   # v6's 2060 == its 1972-row disc bottom + 88
# --- schedule the pops. v7.1: start at beat 44 and end at 4-a-beat -- 44 marks, up from v6's 27.
# 44 is the FIRST beat inside Scene D (phi+44P = 22.131 > offCD 21.831; beat 43 lands at 21.629, before the
# scene exists), so this is the widest window the cut has, not a number picked to look busy. More marks is the
# only honest half of "hit every major city" this mechanism can deliver -- see the note under the loop.
pops=[]
for n in range(44,61):
    c=1 if n<48 else (2 if n<52 else (3 if n<56 else 4))
    for j in range(c): pops.append(phi+n*P+j*0.09)
print('pops',len(pops))
# --- v7.1 placement: a mark stands at a pin HEAD and is tied to its ANCHOR on the ground.
# placed = (hx, hy, tp, vx, pin, ax, ay). pin -1 means luma-sourced (we draw the beam ourselves).
placed=[]
def dero(x,tp): return x-VX*(tp-offCD)             # de-rotate to scene-start x: a stable id for a physical point
def far(x,y,tp):  return all((x-q[0])**2+(y-q[1])**2>150**2 for q in placed if tp-q[2]<2.8)
def fresh(x,y,tp):                                 # v7.1: never mark the same place twice in the WHOLE scene
    dx=dero(x,tp); return all((dx-dero(q[0],q[2]))**2+(y-q[1])**2>110**2 for q in placed)
def ok(x,y,tp): return far(x,y,tp) and fresh(x,y,tp)
def pin_pick(tp):
    td=tp-offCD; sm=min(PINS['samples'],key=lambda s:abs(s['t']-td)); dx=VX*(td-sm['t'])
    cands=[]
    for i,(hx,hy) in enumerate(sm['heads']):
        ax,ay=sm['anchors'][i]                     # the GROUND point the beam rises from -- what the mark points AT
        hx=int(round(hx+dx)); ax=int(round(ax+dx)) # carry both forward to this pop
        if (ax-CX)**2+(ay-CY)**2>(1.02*R)**2: continue   # the anchor must still be on the globe after the carry
        cands.append((i,hx,hy,ax,ay))
    random.shuffle(cands); live=[q[4] for q in placed if tp-q[2]<2.8]
    for i,hx,hy,ax,ay in cands:                    # first pass: a pin nothing else is currently marking
        if i not in live and ok(hx,hy,tp): return hx,hy,ax,ay,i
    for i,hx,hy,ax,ay in cands:                    # thin pin set -> spacing beats uniqueness
        if ok(hx,hy,tp): return hx,hy,ax,ay,i
    return None
def luma_pick(tp):
    # v7.1: pick the BRIGHTEST free lit pixel, not a random one. Nothing in this pipeline knows what a city IS
    # -- brightness is the closest a luma sampler gets to "major", and it is stated as that, not as knowledge.
    f=dframe(tp-offCD); yy,xx=np.mgrid[0:H,0:W]; inside=((xx-CX)**2+(yy-CY)**2)<(0.90*R)**2
    cand=np.where(inside&(f>110)&(np.abs(yy-CY)<0.78*R))
    if len(cand[0]):
        vals=f[cand[0],cand[1]]
        for k in np.argsort(-vals)[:6000]:
            x,y=int(cand[1][k]),int(cand[0][k])
            if ok(x,y,tp): return x,y
    for _ in range(2000):                          # nothing bright and free left -> anywhere on the ground
        a=random.random()*2*math.pi; r=random.random()*0.85*R
        x,y=int(CX+r*math.cos(a)),int(CY+r*math.sin(a)*0.8)
        if ok(x,y,tp): return x,y
    return None                                    # v7.1: drop the mark rather than stack one at the centre
for tp in pops:
    pk=pin_pick(tp) if PINS else None
    if pk: placed.append((pk[0],pk[1],tp,VX,pk[4],pk[2],pk[3])); continue
    if PINS: print(f'WARN no free pin head at pop {tp:.3f} -- luma fallback for this one mark')
    lp=luma_pick(tp)
    if lp is None: print(f'WARN no free spot at pop {tp:.3f} -- mark dropped'); continue
    x,y=lp; placed.append((x,max(0,y-BEAM),tp,VX,-1,x,y))   # WE draw the beam: head sits BEAM px above the city
frompins=sum(1 for q in placed if q[4]>=0)
print('placed',len(placed),'of',len(pops),'pops | from pins',frompins,'| first',placed[:2])
# NOTE -- "every major city" is not reachable from this mechanism and the recipe says so rather than implying
# otherwise: marks land where the model's beams are (or where the clip is brightest), nothing here holds a
# city list, and the globe spins so some cities are never on the visible face at all. A literal answer needs
# an owner-authored lon/lat list plus a measured rotation axis and phase -- registered, not built.
def paste(dst,src,gain,x0,y0):
    h,w=src.shape[:2]; xs0=max(0,x0); ys0=max(0,y0); xs1=min(W,x0+w); ys1=min(H,y0+h)
    if xs1<=xs0 or ys1<=ys0: return
    dst[ys0:ys1,xs0:xs1]+=src[ys0-y0:ys1-y0,xs0-x0:xs1-x0]*gain
def scaled(arr,w):
    h0,w0=arr.shape[:2]; h=int(round(h0*w/w0)); im=Image.fromarray((np.clip(arr,0,1)*255+0.5).astype('uint8')); return np.asarray(im.resize((max(1,w),max(1,h)),Image.LANCZOS)).astype(np.float32)/255
t52=p['t52']; t56=p['t56']
proc=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-c:v','libx264','-preset','fast','-crf','10','-pix_fmt','yuv420p','in/globe6.mp4'],stdin=subprocess.PIPE)
for i in range(N):
    t=offCD+i/FPS; f=np.zeros((H,W,3),np.float32); e=clamp((t-offCD)/0.3)
    ring=Image.new('L',(W,H),0); rd=ImageDraw.Draw(ring); anyring=False
    for xm,y,tp,vx,_pin,axm,ay in placed:
        u=t-tp
        if u<0 or u>2.6: continue
        dx=vx*u                        # ride the spin: a mark that stands still slides off the pin it marked
        x=int(round(xm+dx)); ax=int(round(axm+dx))
        s=back(u/0.28); a=clamp(u/0.12)*clamp((2.6-u)/0.6)
        # v7.1 -- the ANCHOR: a dot on the ground the mark stands over, so the logo reads as pinning a PLACE
        # rather than floating. Always drawn; it is what makes the head "the tip of a line" instead of a sticker.
        if ay>y+6: rd.ellipse((ax-6,ay-6,ax+6,ay+6),fill=int(255*a*0.9)); anyring=True
        # the LEADER LINE. 'auto' draws it only where we invented the head (luma marks), because the layer is
        # SCREEN-blended: stroking over a beam the model already baked in doubles it into a blown-out streak.
        if ay>y+6 and (LINE=='always' or (LINE=='auto' and _pin<0)):
            rd.line((ax,ay,x,y+10),fill=int(255*a*0.55),width=3); anyring=True
        w=int(round(markP.shape[1]*s)); 
        if w<2: continue
        mp=scaled(markP,w); mg=scaled(markG,w); h2,w2=mp.shape[:2]
        paste(f,mg,0.55*a,x-w2//2,y-h2//2); paste(f,mp,a,x-w2//2,y-h2//2)
        if u<0.5: rr=22+70*(u/0.5); rd.ellipse((x-rr,y-rr,x+rr,y+rr),outline=int(255*(1-u/0.5)*0.7),width=3); anyring=True
    if anyring:
        rg=np.asarray(ring.filter(ImageFilter.GaussianBlur(2))).astype(np.float32)/255; f+=rg[...,None]*np.array([52,214,197],np.float32)/255
    if t>=t52:
        u=t-t52; s0=back(u/0.35); k=kof(t,t52) if u>0.35 else 0.0; s=s0*(1+0.06*k); a=clamp(u/0.15); g=0.25+0.9*k
        w=int(round(LW*s)); tg=scaled(trig_l,w); xg=scaled(txtg_l,w); tt=scaled(tri_l,w); tx=scaled(txt_l,w); h2,w2=tt.shape[:2]
        x0=LCX-w2//2; y0=LCY-h2//2
        paste(f,tg,g*a,x0,y0); paste(f,xg,g*a,x0,y0); paste(f,tt,a,x0,y0); paste(f,tx,a,x0,y0)
    if t>=t56:
        a=clamp((t-t56)/0.45); paste(f,closeP,a,0,CLY)
    proc.stdin.write((np.clip(f*e,0,1)*255+0.5).astype('uint8').tobytes())
proc.stdin.close(); proc.wait()
json.dump(dict(disc=D, from_pins=bool(PINS), pins_used=frompins, pops=len(pops), marks=len(placed),
               logo_cy=LCY, logo_w=LW, close_y=CLY, drift_px_per_s=VX, beam_px=BEAM, line_mode=LINE,
               placed=[dict(x=q[0],y=q[1],t=round(q[2],3),vx=q[3],pin=q[4],ax=q[5],ay=q[6]) for q in placed]),
          open('globe6_marks.json','w'),indent=1)
print('GLOBE6-OK',N,'marks',len(placed),'of',len(pops),'pops | from pins',frompins,'| logo at',t52,'cy',LCY,'close at',t56,'y',CLY)
```

**`norm6.sh`** — Normalizes every Scene source to exactly 1440×2560 @ 24 fps before anything measures or concatenates. v6 never needed this (one clip per scene, `xfade` between them); v7 does, because `concat` refuses mismatched dimensions and `meas_watch.py` / `meas_pins.py` index pixels by absolute coordinate. A re-prompted clip that comes back 1080×1920 would otherwise fail deep inside the render with a filtergraph error.

```bash
#!/bin/bash
# norm6.sh -- make in/A.mp4, in/A2.mp4, in/D.mp4 exactly 1440x2560 24fps, then optionally spin the globe faster.
# Idempotent: already-correct files are left alone and the spin writes a marker so a re-run cannot compound it.
set -e
cd /home/user/w
for f in A A2 D; do
  s=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "in/$f.mp4")
  if [ "$s" = "1440,2560" ]; then echo "NORM $f already 1440x2560"; continue; fi
  echo "NORM $f $s -> 1440x2560"
  ffmpeg -y -v error -i "in/$f.mp4" \
    -vf "fps=24,scale=1440:2560:force_original_aspect_ratio=increase,crop=1440:2560,setsar=1" \
    -c:v libx264 -preset medium -crf 16 -pix_fmt yuv420p -an "in/${f}_n.mp4"
  mv "in/${f}_n.mp4" "in/$f.mp4"
done

# ── in/C_zoom.mp4 — THE SCENE-C PUSH-IN. Read by meas_wall.py, render6.sh and verify6.py, and
# until 2026-09-03 WRITTEN BY NOTHING: the fourth artifact in this pipeline recorded as a source
# with no producer, after the v6 video prompts, beat.py and params_v6.json.
# ⚠ THE ORIGINAL COMMAND IS UNRECOVERABLE AND THIS IS A RE-DERIVATION, SAID PLAINLY.
# The recipe recorded the expression but neither N (the ease length) nor the pan anchor. Searched
# and exhausted: both branches carry the identical truncated fragment; `git log -S` shows it was
# introduced already incomplete in the v6 record (e22dead); no other session transcript survives.
# The two choices below are therefore MINE, and each has a reason:
#   N = 200  -- the ease completes over Scene C itself. lenC 8.3368 s x 24 fps = 200.08 frames, so
#              the push-in resolves exactly as the scene ends rather than at an arbitrary count.
#   centred  -- the slab sits mid-frame; a centred zoom keeps it centred, and any offset anchor
#              would translate it as z changes, which is the one thing the fixed-geometry screen
#              cannot tolerate.
# ⚠ CORROBORATED, NOT ASSUMED. Measured on the rebuilt clip the slab runs a median 1127 px wide;
# this file's own v6 checkpoint records ~1165 px at 14.3 s (wordmark 1010 + margins 74/81). Within
# 3% -- close enough to believe the reconstruction reproduces the original move. If a later render
# disagrees with the recorded margins, THIS is the line to revisit.
# ⚠ `zoompan` SILENTLY EMITS 1280x720 WITHOUT AN EXPLICIT s=. The recorded fragment omits it, so a
# naive paste of the recipe's own text produces a downscaled clip and every downstream pixel
# coordinate is wrong with nothing raising an error.
if [ -f in/C_zoom.mp4 ] && [ "$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 in/C_zoom.mp4)" = "1440,2560" ]; then
  echo "NORM C_zoom already built"
else
  echo "NORM building C_zoom (push-in 1.50x -> 1.15x over N=200, centred)"
  ffmpeg -y -v error -i in/C.mp4 -vf \
    "fps=24,zoompan=z='1.15+0.35*pow(1-min(1,on/200),3)':d=1:s=1440x2560:fps=24:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'" \
    -an -c:v libx264 -preset medium -crf 12 -pix_fmt yuv420p in/C_zoom.mp4
fi
[ "$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 in/C_zoom.mp4)" = "1440,2560" ] \
  || { echo "C_zoom is not 1440x2560 -- check the zoompan s= parameter"; exit 1; }

# --- v7.1 note 5, "have the globe spin faster". D_SPIN is a REQUEST; the cut's own length is the ceiling.
# D_MIN is hardcoded, not read from params_v6.json, because norm6.sh runs BEFORE plan6.py writes that file --
# so this is total(30.75) - offCD(21.8313) = 8.9187, the exact footage Scene D consumes.
# The CLAMP uses D_SAFE, two frames longer, and the ASSERT uses D_MIN. That gap is not slack for its own sake:
# ffmpeg quantises the output to whole 24 fps frames, so clamping straight to D_MIN and then asserting D_MIN
# makes the ceiling itself fail (10/1.1211 = 8.920 s -> 214 frames -> 8.9167 s, one frame short of the assert).
#
# The spin ALWAYS derives from in/D_src.mp4, an immutable snapshot of the normalized clip, and WRITES in/D.mp4.
# It must never read the file it overwrites. An earlier version spun in/D.mp4 onto itself and guarded re-runs with
# the marker alone -- which only matches when the value is UNCHANGED, i.e. exactly the run you would not make.
# Change 1.05 to 1.11 and the second setpts lands on the already-spun clip: the factors COMPOUND, MAXF is
# recomputed off the shortened file so the clamp still passes, the assert still passes, and the globe silently
# spins at the wrong speed with nothing to say so. Setting it back to 1.0 was worse -- the <=1.0001 branch
# printed "source pace" and did nothing, leaving the clip spun and the marker stale. An immutable source makes
# every run idempotent in the request rather than in the file.
D_MIN=${D_MIN:-8.9187}
D_SPIN=${D_SPIN:-1.0}
D_SAFE=$(awk -v m="$D_MIN" 'BEGIN{printf "%.4f", m+2/24}')
[ -f in/D_src.mp4 ] || cp in/D.mp4 in/D_src.mp4
SDUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 in/D_src.mp4)
MAXF=$(awk -v d="$SDUR" -v m="$D_SAFE" 'BEGIN{printf "%.4f", d/m}')
if [ -f in/.D_spun ] && [ "$(cat in/.D_spun)" = "$D_SPIN" ] && [ -f in/D.mp4 ]; then
  echo "NORM D already spun x$D_SPIN -- skipping"
elif awk -v s="$D_SPIN" 'BEGIN{exit !(s<=1.0001)}'; then
  # Restore from source rather than leave whatever a previous run left behind.
  cp in/D_src.mp4 in/D.mp4
  printf '%s' "$D_SPIN" > in/.D_spun
  echo "NORM D spin 1.00 (source pace, ${SDUR}s)"
else
  # A speed-up SHORTENS the clip. Past MAXF there is not enough footage for Scene D and render6.sh would have to
  # loop or freeze a tail -- a visible seam. So clamp, and say so, rather than produce a clip that cannot be used.
  EFF=$(awk -v s="$D_SPIN" -v m="$MAXF" 'BEGIN{printf "%.4f", (s<m?s:m)}')
  awk -v s="$D_SPIN" -v m="$MAXF" 'BEGIN{if(s>m) printf "WARN D_SPIN %.3f exceeds the no-loop ceiling %.3f (source %s s, Scene D needs %s s) -- clamped\n", s, m, "'"$SDUR"'", "'"$D_MIN"'"}'
  echo "NORM D spin x$EFF (${SDUR}s -> $(awk -v d="$SDUR" -v e="$EFF" 'BEGIN{printf "%.3f", d/e}')s)"
  ffmpeg -y -v error -i in/D_src.mp4 -vf "setpts=PTS/$EFF,fps=24" \
    -c:v libx264 -preset medium -crf 16 -pix_fmt yuv420p -an in/D_s.mp4
  mv in/D_s.mp4 in/D.mp4
  printf '%s' "$D_SPIN" > in/.D_spun
fi
# Hard assert, whatever path we took: Scene D must have the footage the cut asks for. Refuse, never loop.
DDUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 in/D.mp4)
awk -v d="$DDUR" -v m="$D_MIN" 'BEGIN{if(d+0 < m+0){printf "FATAL in/D.mp4 is %.3f s, Scene D needs %.3f s\n", d, m; exit 1}}'
echo "NORM D duration ${DDUR}s (needs >= ${D_MIN}s) OK"
echo NORM6-OK
```

**`render6.sh`** — The Scene-A hard cut (wide → watch close-up) plus the four-scene xfade chain, three screen-blended layer canvases and the audio tail fade. **Run order:** `norm6.sh` → **`plan6.py`** → `plan_a2.py` → `meas_watch.py` → `mk_watch.py` **twice** (`WATCH_MODE=wide`, then `WATCH_MODE=closeup`) → `meas_wall.py` → `mk_wall6.py` → `meas_pins.py` → `mk_globe.py` → here. ⚠ **`plan6.py` is not optional and was missing from the first cut of this list** — it is the ONLY writer of `params_v6.json`, and `plan_a2.py` is the very next step that reads it, so a run that skips it dies at the first python step with `FileNotFoundError: params_v6.json`.

⚠ **CORRECTED 2026-09-03 — TWO MORE PREREQUISITES WERE MISSING FROM THIS LIST, AND THE RUN DIES
AT BOTH.** Measured by executing the order above end to end on a clean sandbox:

- **`node pw/cap_radio.js`** must run before `meas_wall.py`. It writes `cap/r3_radio_top.png`,
  which `meas_wall.py` and `mk_wall6.py` both read and which nothing else produces.
- **`python3 captions.py`** must run before `mk_globe.py`, which opens `cap/txt/close.png`.
  Without it the globe layer dies with `FileNotFoundError: cap/txt/close.png` — nine steps in,
  after roughly two minutes of measurement work.

So the true order is: `cap_radio.js` · `captions.py` → `norm6.sh` → `plan6.py` → `plan_a2.py` →
`meas_watch.py` → `mk_watch.py` ×2 → `meas_wall.py` → `mk_wall6.py` → `meas_pins.py` →
`mk_globe.py` → here.

⚠ **AND `in/phoneB.mp4` HAS NO PRODUCER AT ALL — THIS IS WHERE THE RENDER NOW STOPS.**
`render6.sh` takes it as `-i`, `verify6.py` samples it for the phone-pulse checks, and
`scanpulse.py` scans it; the only other mention in this file is the prose line *"`in/phoneB.mp4`
is v4's phone layer, unchanged"*. **Nothing writes it.** The seventh artifact recorded as a
source with no way to rebuild it, after the v6 video prompts, `beat.py`, `params_v6.json`,
`cap/r3_radio_top.png`, `C_zoom.mp4` and `captions.py`'s ordering.
⚠ **`mk_screen3.py` is not the answer as written, and is itself unreachable.** It writes
`in/screen3.mp4` (610×1334) and reads a v3 `params.json` that `plan6.py` does not produce — and
it is documented under a `### mk_screen3.py` heading rather than the ``**`name`**`` form
`boot5.sh`'s extractor matches, so it is not in the MAP and never reaches a rebuilt sandbox at
all (the same defect `beat.py` had). Whether v6/v7 should be carrying the **v5** phone layer
(`mk_screen5.py`, which IS in the MAP) under the old v4 filename is an open question for the
owner, not something to guess at: picking wrong puts the wrong six pages on the phone through
beats 20→32 and every downstream check still passes.

```bash
#!/bin/bash
# launch cut v7: A1(wide+watch) |cut| A2(watch close-up) -> B(logo) -> C(zoomed wall, radio screen) -> D(globe, pins, logo, close)
# The Scene-A cut is a CONCAT, not an xfade: xfade consumes time (its duration overlaps the two streams) and
# would shorten the cut by 0.3 s, moving every downstream offset. A hard cut on the beat costs zero frames.
set -e
cd /home/user/w
P=$(python3 -c "import json;p=json.load(open('params_v6.json'));print(p['offAB'],p['offBC'],p['offCD'],p['total'])")
set -- $P; offAB=$1; offBC=$2; offCD=$3; TOTAL=$4
A=$(python3 -c "import json;p=json.load(open('params_a2.json'));print(p['f12'],p['nA2'],p['wide']['x'],p['wide']['y'])")
set -- $A; nA1=$1; nA2=$2; WX=$3; WY=$4
FADEST=$(python3 -c "print(round($TOTAL-0.6,3))")
ffmpeg -y -hide_banner -loglevel error -stats \
 -i in/A.mp4 -i in/watch.mov -i in/A2.mp4 -i in/watch_cu.mov \
 -i in/B_long.mp4 -i in/C_zoom.mp4 -i in/D.mp4 \
 -i in/phoneB.mp4 -i in/wall6.mp4 -i in/globe6.mp4 -i in/t3.m4a \
 -filter_complex "
 [0:v]fps=24,format=yuv420p,settb=AVTB,trim=end_frame=${nA1},setpts=PTS-STARTPTS[a1];
 [1:v]fps=24,format=rgba,settb=AVTB[wt];
 [a1][wt]overlay=x=${WX}:y=${WY}:eof_action=pass:format=auto,format=yuv420p,settb=AVTB[A1];
 [2:v]fps=24,format=yuv420p,settb=AVTB,trim=end_frame=${nA2},setpts=PTS-STARTPTS[a2];
 [3:v]fps=24,format=rgba,settb=AVTB[wc];
 [a2][wc]overlay=x=0:y=0:eof_action=pass:format=auto,format=yuv420p,settb=AVTB[A2];
 [A1][A2]concat=n=2:v=1:a=0,settb=AVTB[A];
 [4:v]fps=24,format=yuv420p,settb=AVTB[B];
 [5:v]fps=24,format=yuv420p,settb=AVTB[C];
 [6:v]fps=24,format=yuv420p,settb=AVTB[D];
 [A][B]xfade=transition=fade:duration=0.3:offset=${offAB}[AB];
 [AB][C]xfade=transition=fade:duration=0.3:offset=${offBC}[ABC];
 [ABC][D]xfade=transition=fade:duration=0.3:offset=${offCD}[base];
 [base]format=gbrp[baseg];
 color=c=black:s=1440x2560:r=24:d=${TOTAL},format=rgb24[cv1];
 [7:v]fps=24,tpad=start_duration=${offAB},format=rgb24[ph];
 [cv1][ph]overlay=x=416:y=592:eof_action=pass:format=rgb,format=gbrp[L1];
 [baseg][L1]blend=all_mode=screen,format=gbrp[s1];
 color=c=black:s=1440x2560:r=24:d=${TOTAL},format=rgb24[cv2];
 [8:v]fps=24,tpad=start_duration=${offBC},format=rgb24[wl];
 [cv2][wl]overlay=x=0:y=0:eof_action=pass:format=rgb,format=gbrp[L2];
 [s1][L2]blend=all_mode=screen,format=gbrp[s2];
 color=c=black:s=1440x2560:r=24:d=${TOTAL},format=rgb24[cv3];
 [9:v]fps=24,tpad=start_duration=${offCD},format=rgb24[gl];
 [cv3][gl]overlay=x=0:y=0:eof_action=pass:format=rgb,format=gbrp[L3];
 [s2][L3]blend=all_mode=screen,format=yuv420p[v];
 [10:a]atrim=0:${TOTAL},asetpts=PTS-STARTPTS,afade=t=out:st=${FADEST}:d=0.6[a]
 " -map "[v]" -map "[a]" \
 -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -ar 44100 \
 -movflags +faststart -t ${TOTAL} out/launch_v7.mp4
echo RENDER7-OK
ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames,width,height,r_frame_rate -of csv=p=0 out/launch_v7.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 out/launch_v7.mp4
md5sum out/launch_v7.mp4
```

**`verify6.py`** — Every v6 assertion plus the v7 ones: the Scene-A cut, the card rect that FOLLOWS the watch through the close-up, the screen filling the measured slab, and the pins-anchored marks. Still carries the corrected pulse-peak sampling and the informational club-strobe line.

```python
#!/usr/bin/env python3
# verify6.py — numeric checks on out/launch_v7.mp4 against its sources, its LAYERS, params_v6.json and params_a2.json
import json, subprocess, numpy as np
W,H=1440,2560
p=json.load(open('params_v6.json'))
P=p['P']; phi=p['phi']; offAB=p['offAB']; offBC=p['offBC']; offCD=p['offCD']; TOTAL=p['total']; lenC=p['lenC']
OUT='out/launch_v7.mp4'
_dims={}
def dims(path):
    if path not in _dims:
        s=subprocess.run(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=p=0',path],capture_output=True,text=True).stdout.strip().split(',')
        _dims[path]=(int(s[0]),int(s[1]))
    return _dims[path]
def frame(path,t):
    w,h=dims(path)
    b=subprocess.run(['ffmpeg','-v','error','-ss',f'{max(0,t):.4f}','-i',path,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True).stdout
    a=np.frombuffer(b,np.uint8)
    if a.size!=w*h*3: raise SystemExit(f'bad frame {path} t={t} size={a.size} dims={w}x{h}')
    return a.reshape(h,w,3)
def gray(a): return (0.299*a[...,0]+0.587*a[...,1]+0.114*a[...,2])
def beat(n): return phi+n*P
fails=[]
def check(name,ok,detail):
    print(('PASS ' if ok else 'FAIL ')+name+' :: '+detail)
    if not ok: fails.append(name)
s=subprocess.run(['ffprobe','-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=nb_read_frames,width,height,r_frame_rate','-of','csv=p=0',OUT],capture_output=True,text=True).stdout.strip()
d=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',OUT],capture_output=True,text=True).stdout.strip()
au=subprocess.run(['ffprobe','-v','error','-select_streams','a:0','-show_entries','stream=codec_name,sample_rate,channels','-of','csv=p=0',OUT],capture_output=True,text=True).stdout.strip()
print('probe',s,'dur',d,'audio',au)
check('738 frames 1440x2560 24fps', s.startswith('1440,2560,24/1,738'), s)
def mdiff(a,b,mask=None):
    dd=np.abs(gray(a)-gray(b)); return float(dd[mask].mean()) if mask is not None else float(dd.mean())
def lit(a,reg=None,th=60):
    # ymin/ymax are APPENDED so every existing [0]..[4] caller is unaffected; the v7 wall check needs both axes
    g=gray(a if reg is None else a[reg[0]:reg[1],reg[2]:reg[3]]); ys,xs=np.where(g>th)
    if xs.size==0: return (0,0,0,0,0,0,0)
    off=(reg[2] if reg else 0, reg[0] if reg else 0)
    return (int(xs.size), int(xs.max()-xs.min()+1), int(ys.max()-ys.min()+1), int(xs.min())+off[0], int(xs.max())+off[0], int(ys.min())+off[1], int(ys.max())+off[1])
# ---- A: watch (v7: A1 wide card, hard cut at beat 12, A2 close-up with a per-frame card) ----
pa=json.load(open('params_a2.json')); mwt=json.load(open('meas_watch.json'))['closeup']
f12=pa['f12']; nA2=pa['nA2']; WX=pa['wide']['x']; WY=pa['wide']['y']
def a_src(t):
    """Which Scene-A clip the output frame at t came from, its time in that clip, and where the card sits.
    The rect MOVES in the close-up, so v6's fixed (1660..2140, 890..1370) mask would read a CORRECT render
    as a mismatch. That is the reason this helper exists -- the check has to follow the card."""
    # floor, not round -- frame() seeks with -ss, so the frame it returns is the one CONTAINING t (the same
    # convention every beat check here relies on when it samples at beat(n)+1/24). Rounding disagrees with
    # that on the back half of every frame, and round() also breaks ties to even, so a half-frame probe at
    # the cut resolves BOTH sides to the same index.
    i=int(t*24+1e-6)
    if i<f12: return 'in/A.mp4', t, (WY,WY+480,WX,WX+480)
    r=mwt['frames'][min(nA2-1,max(0,i-f12))]
    S=max(120,int(round(r['w']*mwt['fill'])))
    x0=int(round(r['cx']-S/2)); y0=int(round(r['cy']-S/2))
    # frame CENTRE: -ss is formatted to 4dp, and n/24 rounds either side of the boundary, so a boundary
    # seek can land one frame early. Half a frame of slack is far more than 4dp of rounding can spend.
    return 'in/A2.mp4', (i-f12+0.5)/24.0, (max(0,y0),min(H,y0+S),max(0,x0),min(W,x0+S))
for t,expect in ((0.5,False),(3.0,True),(6.5,True),(7.5,True)):
    src,ts,rect=a_src(t); o=frame(OUT,t); sA=frame(src,ts)
    m=np.ones((H,W),bool); m[rect[0]:rect[1],rect[2]:rect[3]]=False
    outd=mdiff(o,sA,m); ind=mdiff(o,sA,~m)
    check(f'A matches its source outside the card at {t} ({src.split("/")[-1]})', outd<2.5, f'mean diff {outd:.2f}')
    check(f'card {"present" if expect else "absent"} at {t}', (ind>8) if expect else (ind<2.0), f'rect diff {ind:.2f}')
# the cut itself: frame f12-1 must still be A, frame f12 must be A2 -- a drifted trim shows up here first.
# Probe the two frame CENTRES. The first cut of this check probed the boundary at +-half a frame, which under
# round()-to-even resolved BOTH sides to 146: it FAILED on a correct render and never once read frame 145,
# the frame it exists to test.
tb=(f12-0.5)/24.0; ta=(f12+0.5)/24.0
sb,tsb,rb=a_src(tb); sa,tsa,ra=a_src(ta)
check('beat-12 cut lands on the right frame', sb.endswith('A.mp4') and sa.endswith('A2.mp4'), f'{sb} -> {sa} at frame {f12}')
mb=np.ones((H,W),bool); mb[rb[0]:rb[1],rb[2]:rb[3]]=False
ma=np.ones((H,W),bool); ma[ra[0]:ra[1],ra[2]:ra[3]]=False
db=mdiff(frame(OUT,tb),frame(sb,tsb),mb); da=mdiff(frame(OUT,ta),frame(sa,tsa),ma)
check('both cut frames match their own clip', db<2.5 and da<2.5, f'before {db:.2f} after {da:.2f}')
def cnt(a,reg,f):
    r=a[reg[0]:reg[1],reg[2]:reg[3]].astype(int); return int(f(r).sum())
teal=lambda r:(r[...,2]>150)&(r[...,1]>150)&(r[...,0]<120)
amber=lambda r:(r[...,0]>180)&(r[...,1]>120)&(r[...,1]<200)&(r[...,2]<90)
# both samples now sit INSIDE the close-up -- landing synced in close-up is the whole point of the fifth shot.
# v7.1: the FACE carries no status WORDS before sync -- the state is a colour, and the orb (the largest lit
# object on the face) carries it. So this reads amber-everywhere -> teal-everywhere rather than one small
# chip changing hue, which is what gives the check its margin. Both counts are read inside a_src()'s MEASURED
# face rect, never the fixed wide-card rect, so a re-measured A2 clip cannot silently move the sampling window.
_,_,r65=a_src(6.5); _,_,r75=a_src(7.5); f65=frame(OUT,6.5); f75=frame(OUT,7.5)
check('close-up face turns amber -> teal across beat 14', cnt(f75,r75,teal)>cnt(f65,r65,teal) and cnt(f65,r65,amber)>cnt(f75,r75,amber), f'teal {cnt(f65,r65,teal)}->{cnt(f75,r75,teal)} amber {cnt(f65,r65,amber)}->{cnt(f75,r75,amber)}')
print(f"INFO close-up watch face believed on {mwt['believed']}/{nA2} frames; the rest carry the nearest measured rect")
# ---- B: logo on the phone ----
ph=np.ones((H,W),bool); ph[592:1926,416:1026]=False
for t in (8.4,10.5,13.0):
    o=frame(OUT,t); sB=frame('in/B_long.mp4',t-offAB); dd=mdiff(o,sB,ph)
    check(f'B matches B_long outside phone at {t}', dd<2.5, f'mean diff {dd:.2f}')
for n in (18,21,24):
    lb=lit(frame('in/phoneB.mp4',beat(n)+1/24-offAB)); lm=lit(frame('in/phoneB.mp4',beat(n)+P/2-offAB))
    check(f'phone logo pulses at beat {n} (layer)', lb[1]>=lm[1]+8 and lb[0]>lm[0]*1.3, f'beat lit {lb[0]} w{lb[1]} vs mid {lm[0]} w{lm[1]}')
# ---- C: wall ----
def darkrun(g,row0,row1,cx=720,th=20):
    col=g[row0:row1].mean(axis=0); dark=col<th
    if not dark[cx]: return None
    l=cx
    while l>0 and dark[l-1]: l-=1
    r=cx
    while r<W-1 and dark[r+1]: r+=1
    return l,r
mw=json.load(open('meas_wall.json')); SLB=mw['slab']
SLW=SLB['right']-SLB['left']; SLH=SLB['bottom']-SLB['top']; BPAD=140  # bloom reach: spad 90 + the 40px blur's tail
print('INFO slab',json.dumps(SLB),f"{SLW}x{SLH}",'valid',mw['valid'],'/',mw['samples'],'edge_touch',mw['edge_touch'])
for t in (14.3,15.0,17.0,21.0):
    gs=gray(frame('in/C_zoom.mp4',t-offBC)); L=frame('in/wall6.mp4',t-offBC)
    # 1. the STORED measurement must still bound the LIVE clip -- an intersection that drifted is not a bound
    dr=darkrun(gs,760,832)
    if dr is None: print(f'INFO slab unreadable at {t} (the clip strobes) band mean {gs[760:832].mean():.1f} -- skipping the bound check')
    else: check(f'measured slab still inside the clip at {t}', SLB['left']>=dr[0] and SLB['right']<=dr[1], f"slab {SLB['left']}-{SLB['right']} live {dr[0]}-{dr[1]}")
    # 2. the screen must FILL the slab, not sit inset in it: body (th 140) inside on both axes, >=0.90 on one
    b=lit(L,None,140); fw=b[1]/SLW; fh=b[2]/SLH
    inside=b[3]>=SLB['left'] and b[4]<=SLB['right'] and b[5]>=SLB['top'] and b[6]<=SLB['bottom']
    check(f'screen fills the measured slab at {t}', inside and max(fw,fh)>=0.90, f'body x {b[3]}-{b[4]} y {b[5]}-{b[6]} fill {fw:.2f}w/{fh:.2f}h')
    o=frame(OUT,t); sC=frame('in/C_zoom.mp4',t-offBC); cm=np.ones((H,W),bool)
    cm[max(0,SLB['top']-BPAD):min(H,SLB['bottom']+BPAD),:]=False; dd=mdiff(o,sC,cm)
    check(f'C matches C_zoom outside layers at {t}', dd<2.5, f'mean diff {dd:.2f}')
# flash coverage of the club clip during Scene C (informational)
b=subprocess.run(['ffmpeg','-v','error','-i','in/C_zoom.mp4','-t',f'{lenC:.3f}','-vf','fps=24,crop=1440:72:0:760,scale=90:9','-f','rawvideo','-pix_fmt','gray','-'],capture_output=True).stdout
bm=np.frombuffer(b,np.uint8).reshape(-1,9,90).mean(axis=(1,2)); print(f'INFO club clip: wordmark band lit (>30) on {int((bm>30).sum())}/{bm.size} Scene-C frames ({100*(bm>30).mean():.0f}%) — the source strobes; the wordmark+screen ride SCREEN-blended over it')
for n in (30,36):
    # v7: the pulse subject is the SCREEN (the drawn wordmark band is retired), measured over the slab rows
    rows=(SLB['top'],SLB['bottom']+1,0,W)
    lb=lit(frame('in/wall6.mp4',beat(n)+1/24-offBC),rows,100); lm=lit(frame('in/wall6.mp4',beat(n)+P/2-offBC),rows,100)
    check(f'wall screen pulses at beat {n} (layer)', lb[0]>lm[0]*1.15 and lb[1]>=lm[1], f'beat lit {lb[0]} w{lb[1]} vs mid {lm[0]} w{lm[1]}')
# ---- D: globe ----
o=frame(OUT,22.5); sD=frame('in/D.mp4',22.5-offCD); dd=np.abs(gray(o)-gray(sD)); g6=lit(frame('in/globe6.mp4',22.5-offCD))
check('D matches globe source before pops', dd.mean()<3.5 and np.percentile(dd,99)<24 and g6[0]==0, f'mean {dd.mean():.2f} p50 {np.median(dd):.1f} p99 {np.percentile(dd,99):.1f} layer lit {g6[0]}')
# v7: the disc, the logo box and the close row are DERIVED from what mk_globe.py actually placed --
# 618/1972/44/1410, 330 and 2060 were all measured against the v6 D.mp4 and are wrong for a re-prompted clip
try: GM=json.load(open('globe6_marks.json'))
except Exception as e:
    GM=dict(disc=dict(top=618,bottom=1972,left=44,right=1410), logo_cy=330, logo_w=440, close_y=2060,
            from_pins=False, pins_used=0, marks=0, placed=[], drift_px_per_s=0.0)
    print(f'INFO globe6_marks.json unreadable ({type(e).__name__}) -- Scene D checked against the v6 constants')
GD=GM['disc']; disc=(GD['top'],GD['bottom']+1,GD['left'],GD['right']+1)
pre=lit(frame('in/globe6.mp4',23.5-offCD),disc)
for n in (50,54,58):
    c=lit(frame('in/globe6.mp4',beat(n)+0.2-offCD),disc)
    check(f'marks lit in disc at beat {n} (layer)', pre[0]==0 and c[0]>300, f'lit {c[0]} vs pre-pop {pre[0]}')
# the marks are drawn where mk_globe.py says it put them (drift included), and they came from PINS not luma
if GM['placed']:
    for n in (50,54,58):
        # +0.35, not the +0.2 the aggregate check above uses. From beat 56 a beat fires THREE marks, at
        # +0.00/+0.09/+0.18 s, and each ramps its alpha over clamp(u/0.12) -- so the third mark of beat 58
        # is still fading in until +0.30. A +0.2 probe reads it at zero alpha and reports a correctly-placed
        # mark as MISSING. This check is about placement; give the ramp a frame of clearance past 0.18+0.12.
        t=beat(n)+0.35; L=frame('in/globe6.mp4',t-offCD); miss=[]
        for m in GM['placed']:
            u=t-m['t']
            if u<0.12+1/24 or u>2.6: continue   # skip marks still inside their own fade-in
            cx=int(round(m['x']+m['vx']*u)); cy=m['y']
            if lit(L,(max(0,cy-45),cy+46,max(0,cx-45),cx+46))[0]<40: miss.append((cx,cy))
        check(f'every live mark is drawn at its placement at beat {n}', not miss, f'{len(miss)} missing: {miss[:4]}')
    # v7.1: not every pop has to LAND -- luma_pick now drops a mark rather than stacking one at the disc centre --
    # but a mass drop means the spacing rules are starving the placement, which is a defect, not a style.
    check('almost every pop placed a mark', GM['marks']>=0.9*GM['pops'], f"{GM['marks']} of {GM['pops']} pops")
    # v7.1: pin-sourced is no longer REQUIRED -- meas_pins.py withholds an unbelieved pin set on purpose and
    # mk_globe.py then draws its own beams, which is a correct render. So assert the mode is INTERNALLY
    # consistent instead: pins claimed -> nearly all marks carry one; no pins -> none does and we drew the lines.
    if GM['from_pins']:
        check('pin mode: marks are pin-sourced, not luma-sampled', GM['pins_used']>=0.8*GM['marks'],
              f"pins {GM['pins_used']}/{GM['marks']}")
    else:
        check('luma mode: no mark claims a pin it cannot have', GM['pins_used']==0 and GM['line_mode']!='never',
              f"pins {GM['pins_used']} line_mode {GM['line_mode']} -- pins were unbelieved, so WE draw the beams")
    if any(m['pin']>=0 for m in GM['placed']):
        try:
            PN=json.load(open('meas_pins.json')); TOL=40; off=[]
            for m in GM['placed']:
                if m['pin']<0: continue
                td=m['t']-offCD; sm=min(PN['samples'],key=lambda q:abs(q['t']-td))
                best=min(((m['x']-(h[0]+PN['drift_px_per_s']*(td-sm['t'])))**2+(m['y']-h[1])**2) for h in sm['heads'])
                if best>TOL*TOL: off.append(round(best**0.5,1))
            check('every pin-sourced mark sits on a measured pin head', not off, f'{len(off)} off by {off[:4]} px (tol {TOL})')
        except Exception as e:
            print(f'INFO meas_pins.json unreadable ({type(e).__name__}) -- pin-coincidence check skipped')
    else:
        print('INFO no pin-sourced marks -- pin-coincidence check does not apply (luma mode)')
    # v7.1 note 5: the mark stands at the TIP of a line that pins a place, so the ANCHOR has to be on screen.
    # Directional, not per-pixel: count the live marks whose ground dot lights a 30 px window and require the
    # majority. A per-mark assertion here would flake on any mark whose measured beam is only a few px tall.
    t=beat(54)+0.35; L=frame('in/globe6.mp4',t-offCD); live=0; anch=0
    for m in GM['placed']:
        u=t-m['t']
        if u<0.12+1/24 or u>2.6 or m['ay']<=m['y']+6: continue
        live+=1; ax=int(round(m['ax']+m['vx']*u)); ay=m['ay']
        if lit(L,(max(0,ay-15),ay+16,max(0,ax-15),ax+16))[0]>0: anch+=1
    check('marks are anchored to the ground, not floating', live>0 and anch>=0.8*live, f'{anch}/{live} anchors lit')
LCY=GM['logo_cy']; LCX=W//2; lg=(max(0,LCY-190),LCY+191,max(0,LCX-340),min(W,LCX+341))
l0=lit(frame(OUT,25.5),lg,90); l1=lit(frame(OUT,26.7),lg,90)
check('logo pops above globe after beat 52', l0[0]<50 and l1[0]>1500, f'pre {l0[0]} post {l1[0]} w{l1[1]}')
lb=lit(frame('in/globe6.mp4',beat(56)+1/24-offCD),lg,60); lm=lit(frame('in/globe6.mp4',beat(56)+P/2-offCD),lg,60)
check('globe logo pulses at beat 56 (layer)', lb[1]>=lm[1]+8 and lb[0]>lm[0]*1.1, f'beat {lb[0]} w{lb[1]} vs mid {lm[0]} w{lm[1]}')
CLY=GM['close_y']; crow=(CLY,min(H,CLY+300),0,W)
c0=lit(frame(OUT,27.5),crow,90); c1=lit(frame(OUT,29.5),crow,90)
check('close copy fades in after beat 56', c0[0]<50 and c1[0]>2000, f'pre {c0[0]} post {c1[0]}')
lastm=gray(frame(OUT,TOTAL-1/24)).mean()
check('video fades to black', lastm<3.0, f'last frame mean luma {lastm:.2f}')
# ---- audio ----
b=subprocess.run(['ffmpeg','-v','error','-i',OUT,'-vn','-ac','1','-ar','22050','-f','f32le','-'],capture_output=True).stdout
x=np.frombuffer(b,np.float32); sr=22050; hop=256; n=(x.size-1024)//hop
env=np.zeros(n); win=np.hanning(1024); prev=None
for i in range(n):
    sp=np.abs(np.fft.rfft(x[i*hop:i*hop+1024]*win))[:60]
    if prev is not None: env[i]=np.maximum(sp-prev,0).sum()
    prev=sp
env=env/(env.max()+1e-9); best=(0,0,0)
for bpm in np.arange(115,125,0.05):
    per=60/bpm*sr/hop
    for ph_ in np.arange(0,per,per/24):
        idx=np.arange(ph_,n-1,per).astype(int); s_=env[idx].sum()
        if s_>best[0]: best=(s_,bpm,ph_*hop/sr)
print('audio BPM',round(best[1],2),'phase',round(best[2],3))
check('audio BPM ~119.45', abs(best[1]-119.45)<0.6, f'{best[1]:.2f}')
def rms(ss,t):
    r=subprocess.run(['ffmpeg','-v','info','-ss',f'{ss}','-i',OUT,'-t',f'{t}','-vn','-af','astats=measure_overall=RMS_level:measure_perchannel=none','-f','null','-'],capture_output=True,text=True).stderr
    v=None
    for ln in r.splitlines():
        if 'RMS level dB' in ln: v=ln.split(':')[-1].strip()
    return float(v)
mid=rms(15.0,0.9); tail=rms(TOTAL-0.5,0.5)
check('audio tail fades', tail<mid-8, f'tail(last 0.5 s) {tail:.1f} dB vs mid {mid:.1f} dB')
print('FAILS',fails if fails else 'none')
```

**`scanpulse.py`** — The diagnostic that found the beatlit issue: prints lit counts at two thresholds for the frames either side of each pulse beat.

```python
import subprocess, numpy as np, sys, json
def dims(p):
    o=subprocess.run(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=p=0',p],capture_output=True,text=True).stdout.strip().split(',')
    return int(o[0]),int(o[1])
def frames(p,a,b):
    w,h=dims(p)
    raw=subprocess.run(['ffmpeg','-v','error','-i',p,'-vf',f"select='between(n,{a},{b})'",'-vsync','0','-f','rawvideo','-pix_fmt','gray','-'],capture_output=True).stdout
    n=len(raw)//(w*h); return np.frombuffer(raw,np.uint8).reshape(n,h,w)
def lit(g,th):
    m=g>th; c=int(m.sum())
    if not c: return c,0
    xs=np.where(m.any(0))[0]; return c,int(xs[-1]-xs[0]+1)
P=0.5023022185; phi=0.03
p=json.load(open('params_v6.json'))
def beat(n): return phi+n*P
print('phoneB around beats 18,21,24 (layer-local frames)')
for n in (18,21,24):
    tl=beat(n)-p['offAB']; f0=int(round(tl*24))
    fr=frames('in/phoneB.mp4',f0-3,f0+3)
    for i,g in enumerate(fr):
        print(f' beat{n} fr{f0-3+i} t={(f0-3+i)/24:.3f} (beat at {tl:.3f}) lit60={lit(g,60)} lit100={lit(g,100)}')
print('wall6 rows 700-900 around beats 30,36')
for n in (30,36):
    tl=beat(n)-p['offBC']; f0=int(round(tl*24))
    fr=frames('in/wall6.mp4',f0-3,f0+3)
    for i,g in enumerate(fr):
        gg=g[700:900]
        print(f' beat{n} fr{f0-3+i} t={(f0-3+i)/24:.3f} (beat at {tl:.3f}) lit60={lit(gg,60)} lit100={lit(gg,100)}')
```

**`upload6.sh`** — gofile first, then 0x0.st, then litterbox, printing the md5 either way.

```bash
#!/bin/bash
cd /home/user/w; F=${1:-out/launch_v7.mp4}
echo "md5 $(md5sum $F)"
R=$(curl -s -m 600 -F "file=@$F" https://upload.gofile.io/uploadfile)
echo "gofile: $R"
U=$(echo "$R" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('data',{}).get('downloadPage',''))" 2>/dev/null)
if [ -n "$U" ]; then echo "URL $U"; exit 0; fi
R=$(curl -s -m 600 -F "file=@$F" https://0x0.st); echo "0x0: $R"; echo "$R" | grep -q '^https://' && { echo "URL $R"; exit 0; }
R=$(curl -s -m 600 -F "reqtype=fileupload" -F "time=72h" -F "fileToUpload=@$F" https://litterbox.catbox.moe/resources/internals/api.php); echo "litterbox: $R"; echo "$R" | grep -q '^https://' && { echo "URL $R"; exit 0; }
echo "ALL-FAILED"
```

---


## What v7 is (2026-09-03) — the watch, the wall, the globe, the runner

Four owner notes on the rendered v6 cut, three of them off screenshots of the film. **All four
are BUILT in the recipe below and none of them is rendered** — this container has no `ffmpeg`,
no `PIL` and none of the source clips, so every change here is a recipe change the owner
re-renders. Each section records what shipped and what would prove it.

- *"this needs to be fixed on intro video"* — the HEART-RATE SYNC card reads **IN SYNC**
  in three places at once.
- *"just have this fill the entire wall screen on launch video"* — the projected Radio
  screen sits inset on the slab instead of filling it.
- *"and have this map point out distinct areas on globe. Like have a link pinpoint a spot
  on the globe"* — the marks float over the disc rather than anchoring to it.
- *"make the guy running in the launch video not naked, have him wearing workout clothes,
  and do a zoom in of the physical watch showing the heart-rate sync"*.

⚠ **THREE OF THE FOUR ARE OVERLAY BUGS, NOT HIGGSFIELD BUGS — AND THAT DECIDES WHO FIXES
WHAT.** Higgsfield generates four **backdrop clips**; every element the owner flagged
except the runner's wardrobe is drawn by a Python script and SCREEN-composited by the
ffmpeg graph. Re-prompting cannot reach `IN SYNC` (drawn by `mk_watch.py`), the projected
screen (`mk_wall6.py`) or the mark geometry (`mk_globe.py`) — those pixels never pass
through Higgsfield. So: two recipe edits, one re-prompt (the owner's call), and one that
is **both** — new wardrobe is a new clip, and the close-up is a new shot *plus* a second
watch placement.

⚠ **A RE-PROMPT INVALIDATES A SCENE'S MEASURED GEOMETRY — BUT ONLY WHERE THE GEOMETRY WAS
ACTUALLY MEASURED, AND THAT IS NARROWER THAN THIS PARAGRAPH FIRST CLAIMED.** ⚠ **CORRECTED
WHILE BUILDING v7:** it read *"the watch card sits at x 890 / y 1660 because that is where
this runner's wrist is"*, and that is **false**. Those two numbers are frame-relative
arithmetic — `1440 − 480 − 70` and `2560 − 480 − 420`, a deliberate lower-right inset —
so the **wide** card survives any new Scene A clip untouched and needs no measurement at
all. `plan_a2.py` now derives them rather than hardcoding them, and `render6.sh` reads them
back, so the claim can't drift again. The globe half stands: the disc **(727, 1295) r 676**
really was `meas_globe.py`'s reading of *that* render, so a new Scene D clip does move
every mark — ⚠ and v7 retires that measurement anyway, because `meas_pins.py` now finds the
**baked pin heads** per frame instead of assuming a disc. **The rule that survives: measure
what the clip decides, derive what the frame decides.** The one genuinely new measurement
v7 needs is the wrist in the CLOSE-UP shot, where the watch fills the frame and moves —
`meas_watch.py` does it, and **refuses** (non-zero exit) below a 70 % believed-frame floor
rather than letting the card drift off the wrist.

### 1 · IN SYNC ×3 — BUILT: three registers, three different facts (and the app still says it three times)

The card states one fact in three registers and they all resolve to the same two words at
the same instant. In `mk_watch.py`:

| site | expression | at sync |
| --- | --- | --- |
| header chip | `tag=('IN SYNC' if synced else ('MATCHING...' if t>=tMatch else 'FREE'))` | IN SYNC |
| station line, right | `dl=('IN SYNC' if synced else f'{delta:+d} BPM')` | IN SYNC |
| pill | `pilltxt=('IN SYNC' if synced else ('MATCHING BEAT' if t>=tMatch else 'MATCH MY BPM'))` | IN SYNC |

**BUILT.** Each slot now carries a **different fact**, so no two of them can say the same
thing at the same instant:

| site | v7 expression | at sync | what it is |
| --- | --- | --- | --- |
| header chip | unchanged | `IN SYNC` | the **state** — the one status word on the card |
| station line, right | `dl=f'{delta:+d} BPM'` | `+0 BPM` | the **evidence** — the number that proves the match |
| pill | `('STOP MATCHING' if t>=tMatch else 'MATCH MY BPM')` | `STOP MATCHING` | the **action** — a button labels what pressing it does |

⚠ **`+0 BPM` IS NOT A PLACEHOLDER, IT IS THE READING.** `hr_of` clamps at 120 and the
station is 120, so at sync the honest delta is exactly zero — which is why the slot can
stop branching on `synced` entirely. It keeps its teal (`TEAL if synced else CREAM`), so
the colour still confirms the state the chip names; only the *word* stopped repeating.

⚠ **AND THE PILL DROPS A SECOND ECHO NOBODY FLAGGED.** Its pre-sync label was
`MATCHING BEAT` — a status word on a button, one stage earlier. A toggle labels its
action in both directions (the app's own `hr.connectMonitor` / `hr.disconnectMonitor` pair
is the precedent), so `MATCH MY BPM` → `STOP MATCHING` reads correctly at every stage and
the amber/teal `pc` keeps carrying the state. Two redundancies removed, not one.

⚠ **THE SAME REDUNDANCY IS IN THE SHIPPING APP, SO A FIX HERE IS COSMETIC UNTIL IT LANDS
THERE.** `mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx` carries the identical
triple: `hrStatus` at `:1306`, the delta slot at `:1622`
(`isSynced ? radio:hr.inSync : radio:hr.deltaBpm`) and the pill at `:1651`. The film is a
faithful capture of a UI that repeats itself — **the film is the symptom, the card is the
defect.** Fixing only `mk_watch.py` makes the video disagree with the product. The app half
is a separate commit (it runs the pre-commit JSX/tsc/test gates); the delta slot needs **no
new i18n key** — `signedDelta = youHr - stationBpm`, so `hr.deltaBpm` already renders
`+0 BPM` at sync and the fix is deleting the `isSynced ?` branch. The pill needs one new
action key ×13 locales and orphans `hr.matchingBeat`.

⚠ **CORRECTED — `verify6.py` DOES NOT ASSERT ON THOSE PIXELS AS THRESHOLDS, AND THE FIRST
DRAFT OF THIS SECTION SAID IT DID.** It read *"the thresholds (teal 579 → 2031, amber
1121 → 0) must be re-derived"*. Those are not thresholds; they are the **v6 render's
measured output**, recorded in the verification panel above. The shipped assertion is
**purely directional**:

```python
check('watch MATCHING(amber)->IN SYNC(teal) at beat 14',
      cnt(f75,reg,teal)>cnt(f5,reg,teal) and cnt(f5,reg,amber)>cnt(f75,reg,amber), ...)
```

So it survives the fix untouched — and with **more** margin, not less. Counting glyph
characters in the card rect at the two sampled instants: teal at 7.5 s goes from
`IN SYNC` + `IN SYNC` + `IN SYNC` (21) to `IN SYNC` + `+0 BPM` + `STOP MATCHING` (26),
while amber at 5.0 s is unchanged at `MATCHING...` + a 13-character pill (`MATCHING BEAT`
and `STOP MATCHING` are the same length) and still falls to 0 after sync. **A directional
assertion outlives the numbers it was written against; only the recorded panel figures
move.** *Check what an assertion actually asserts before planning around it.*

### 2 · The screen must fill the slab — BUILT: `meas_wall.py` measures it, and the drawn wordmark band is retired

**BUILT.** `mk_wall6.py` no longer takes a guessed screen size: `meas_wall.py` measures the
slab **rect on both axes**, and the screen is derived to fill it (`SCR_W='0'` = derive;
height-bound, centred, inset by `SCR_MARGIN=34`), with an assertion that refuses to render a
screen larger than the slab it is supposed to sit on.

⚠ **THE MISSING NUMBER WAS VERTICAL, AND v6 NEVER HAD IT.** v6's fit check sampled the
wordmark band's left/right margins at 14.3 / 15.0 / 17.0 / 21.0 s — **horizontal only** — so
`SCR_W=560` was chosen against a bound that says nothing about the top or bottom. At
`SCR_W=1010` the capture renders **1589 px tall** and from `SY=880` reaches y 2469 of 2560,
and *nothing measured whether that is still on the slab*. `meas_wall.py` reads the dark run
through the slab's own centre in both axes, so the vertical bound now exists.

⚠ **ONE FRAME IS NOT A MEASUREMENT — THE CLUB CLIP STROBES.** `verify6.py` records the
wordmark band reading dark on only **64 of 200** sampled Scene-C frames, so a single-frame
read is a coin flip. `meas_wall.py` samples **60** frames, **rejects** the ones where the
panel doesn't read (refusing outright below a third), and **intersects** the survivors —
`max(left)`, `min(right)`, `max(top)`, `min(bottom)`. The screen is drawn at ONE constant
geometry, so it must fit the **narrowest moment**; the push-in eases 1.50× → 1.15×, so the
slab only widens and that intersection is the earliest, tightest bound. It also **warns**
when the dark run reaches a frame edge — that means the run escaped the panel into an unlit
room and the number is not a slab.

⚠ **AND FILLING THE SLAB RETIRED THE SEPARATE WORDMARK LAYER RATHER THAN REPOSITIONING IT.**
v6's crop started at y = 240, which **cut the captured Radio page's own header** — which is
exactly why a second `shape-radio-logo.png` band had to be drawn above the screen.
`meas_wall.py` finds the capture's topmost ink row and emits `crop_top = ink_top − 24`, so
v7 un-crops to include the header and **the app's real in-app wordmark rides on the wall**.
That answers the owner's earlier note (*"make sure the shape radio logo fits and it looks
like it does on app and website"*) with the same change, and the drawn band is deleted, not
moved. **One change, two notes.**

⚠ **THE BEAT NOW RIDES THE BLOOM, NOT THE GEOMETRY.** v6 pulsed the wordmark band by scaling
it 3 %. A screen that *fills* its slab cannot grow on the beat without growing past the slab,
so the kick drives the bloom gain (`0.26 + 0.55·k`) and a 5 % scale on the **blurred halo
only**; the screen rect itself is constant. The gate (`pres(n)`, kick-presence) is unchanged.

**`verify6.py` checks the fill, not the intent.** Three assertions at each Scene-C sample:
the measured slab is still inside the live dark run (skipped with an INFO line on a strobed
frame rather than failed), the drawn screen body sits **inside the slab on both axes** and
covers **≥ 0.90 of one axis** — so an inset 560 px screen fails the check that v6 would have
passed — and the pulse subject moved to the screen rows, since the band it used to measure no
longer exists.

### 3 · A pinned globe — BUILT: `meas_pins.py` + the marks re-aimed onto the pins

Asked whether to re-prompt for a pinned globe or draw anchor-dot + leader-line pins over
the existing clip, the owner said **reprompt**. So Higgsfield renders a night Earth whose
markers already read as *anchored to the surface* — a dot on the ground, a thin riser, a
head — and **route 1 is built**: the mark layer is re-aimed onto those heads rather than
retired. The beat lock survives, the anchoring is real, and it costs one new measurement.

**`meas_pins.py` — the detector, and why it can tell a pin from a city.** The v7 D prompt
asks for *"thin vertical light beams … each anchored to a small glowing dot where it meets
the ground"*. A beam is therefore a **narrow, tall** bright run; a city light is a **wide,
short** blob. That single difference is the whole detector: per column, find bright runs at
least `PIN_BEAM_MIN` (16 px) tall, widen right while the run continues, and **reject any
cluster wider than `PIN_MAX_W` (8 px)** as a lit region rather than a beam. The run's top
is the head, its bottom the anchor — and **the anchor must sit on the globe** (inside
1.02 R), which throws away rim glow and stray sparkle. It writes the disc, the per-sample
head list, and the spin's horizontal drift to `meas_pins.json`.

⚠ **EVERY THRESHOLD IN IT IS AN UNMEASURED GUESS UNTIL IT RUNS AGAINST THE REAL CLIP —
which is why it refuses rather than guesses.** The pins do not exist yet; the numbers above
were chosen from the prompt's own words, not from pixels. So the script prints the head
count **per sample** and raises when the median falls under `PIN_FLOOR` (10), naming the
three knobs to re-tune. **A detector that quietly returns 27 city lights dressed as pins is
worse than one that stops** — the marks would look placed and be placed on nothing.

**`mk_globe.py` — pins first, luma as the honest fallback.** `pin_pick(tp)` takes the
measured sample nearest that pop, carries each head forward by the measured drift, and
picks one that (a) no still-lit mark is already on and (b) clears the existing 150 px
spacing rule. A thin pin set drops requirement (a) before it drops spacing. If no head is
free — or `meas_pins.json` is missing entirely — it falls back to **the v6 luma rule
verbatim**, prints a WARN naming the pop, and the film still renders with its beat lock
intact. Nothing about this fix can leave Scene D silent.

⚠ **1.00 R, NOT THE CITIES' 0.90 R — a head stands ABOVE the ground it is planted in.**
The v6 rule kept marks inside 0.90 R *and* within 0.78 R of the centre vertically, because
a city light near the limb reads as a smear. A pin head is a different object: its anchor
is on the surface (that is what `meas_pins.py` gates on) while the head itself sits higher,
so clamping heads to the city window would silently discard every pin in the upper third.

⚠ **AND THE MARK NOW RIDES THE SPIN.** A mark is visible for 2.6 s while the globe turns,
so a mark drawn at a fixed x **slides off the pin it marked** — invisible in v6, where the
target was an anonymous city, and obvious the moment the target is a pin the eye can track.
`mk_globe.py` draws at `x + vx·u` from the measured `drift_px_per_s`. It is a **linear**
extrapolation over 2.6 s of a rotation, so it is approximate near the limb and exact
nowhere; the alternative — re-detecting each pin per frame — costs 738 ffmpeg reads to fix
a few pixels of slide.

**Three file-tied constants retired in the same pass.** `CX,CY,R = 727,1295,676` and the
logo's `LCY=330` and close copy's `CLY=2060` were all measured against the **v6** D.mp4 —
exactly the class of number the re-measure warning at the head of this section is about. The
disc now comes from `meas_pins.json`; `LCY` derives as `0.53 × disc top` (which reproduces
330 from v6's 618) and `CLY` as `disc bottom + 88` (which reproduces 2060 from 1972). A
re-prompted globe of a different size now places its own logo and copy.

**`verify6.py` checks the claim, not the intention.** `mk_globe.py` writes
`globe6_marks.json` — the disc, the derived logo/close rows, and every placement with its
pin id and drift — so the Scene D checks derive their regions from what was actually placed
and add three assertions v6 could not make: **every live mark is drawn at its placement**
(a 90 px window at the drifted centre, at three sample beats), **the marks are pin-sourced**
(`from_pins` true and ≥ 80 % of marks carrying a pin id — so a silent mass fallback to luma
fails the run), and **every pin-sourced mark sits within 40 px of a measured head**. The
last one needs no frames at all: it replays `meas_pins.json` against the recorded
placements. An absent `globe6_marks.json` degrades to the v6 constants with an INFO line.

**The honest-data line does not move.** The marks stand for people, not for a count;
nothing on screen or in the copy asserts a figure, and the prompt forbids text, labels,
country names and numbers. A globe that reads as a telemetry map must not acquire a
readout on the way — the pins make the picture more concrete, not more claimed.

### 4 · A clothed runner and a watch close-up — BUILT: a fifth shot on the grid, and one card renderer in two placements

The wardrobe is the one genuine re-prompt in the whole v7 set: Scene A is regenerated with
the athlete in real training kit. The close-up is not an edit either — **it is a fifth shot
in a cut whose 738 frames are already pinned to a measured grid**, every cut landing within
60 ms of a beat. Both halves are now built rather than scoped.

**The cut, derived once in `plan_a2.py` and read by all four consumers.** Scene A owns
0 → `offAB` 7.7668 s. Beat 12 = **6.0576 s** = frame **146**, and A2 runs frames **146–205**
(60 frames / 2.5 s) — through the A→B fade, which starts at frame 186 and ends on beat 16.
So the whole close-up sits inside Scene A's own budget: **no downstream offset moves and the
total stays 738 frames.** `plan_a2.py` asserts the payoff rather than hoping for it —
**IN SYNC lands on beat 14 = frame 170**, which is inside `[146, 206)` — two beats before the
drop, in close-up, instead of in a 480 px card in the corner of a wide shot.

⚠ **THE CUT IS A `concat`, NOT AN `xfade`, AND THAT IS ARITHMETIC RATHER THAN TASTE.** An
xfade *consumes* time — its duration overlaps the two streams — so a 0.3 s dissolve here
would shorten Scene A by 0.3 s and drag `offAB`, `offBC` and `offCD` with it. A hard cut on
the beat costs exactly zero frames, which is the only reason a fifth shot is free. The trims
use `trim=end_frame=` rather than a seconds value: `146/24` is 6.08333…, and a float compare
against a frame's own PTS is precisely how a 738-frame total quietly becomes 739.

⚠ **CORRECTION TO THE v7 SCOPING NOTE: v6's `x 890 / y 1660` IS NOT A TRACE OF THAT RUNNER'S
WRIST.** It is frame-relative arithmetic — `1440−480−70` and `2560−480−420`, a deliberate
lower-right inset. So the **wide card survives the re-prompt and needs no measurement at
all**; `plan_a2.py` derives it and `render6.sh` reads it back, so the two can never drift.
What a new Scene A *can* change is what sits *under* the card — a composition read by eye,
not a number. Only the **close-up** rides a physical object, and only it is measured.

**One renderer, two placements.** `mk_watch.py` now takes `WATCH_MODE`: `wide` writes v6's
480×480 layer unchanged, `closeup` writes a **full-frame** layer whose card is composited at
the measured face rect each frame. That shape is forced — ffmpeg's `overlay` takes ONE x/y
for a whole stream and cannot read a per-frame table, so a moving card must be baked into a
full-frame canvas overlaid at `0:0`, exactly as `mk_wall6.py` and `mk_globe.py` already do.
The card is **typeset** at its real size (`k = S/480` scales every coordinate, tracking value
and font) rather than upscaled from a 480 bitmap — softness is the one thing a close-up
exposes. Two continuity properties are enforced rather than assumed, because both would read
as a glitch on the cut: `hr_of()` takes **absolute** t in both modes, so the number does not
jump; and the heart **phase is integrated from frame 0** even though only frames `[146,206)`
are written, so the pulse does not restart mid-beat.

**`meas_watch.py` refuses rather than guesses.** The face is the frame's dominant bright,
compact, **solid** blob — solid panel vs a scatter of specular highlights *is* the detector.
Every threshold in it is an **unmeasured guess until it runs against the real clip**, so it
prints a per-frame table, median-smooths it (the wrist moves, the detector jitters), flags
any frame it had to interpolate, and **exits non-zero** if fewer than 70 % of frames carry a
believable face — naming the two remedies (re-tune, or re-prompt A2 for a blanker face)
instead of silently sliding a card off a wrist for half the shot.

**`verify6.py` follows the card.** v6's fixed `(1660..2140, 890..1370)` mask would read a
*correct* v7 render as a mismatch, so the Scene-A checks resolve `a_src(t)` → which clip, its
time in that clip, and where the card is; the cut itself is asserted (frame 145 must still be
A, frame 146 must be A2, and both must match their own clip outside the card); and the
MATCHING→IN SYNC colour check now samples 6.5 s and 7.5 s, **both inside the close-up**.

⚠ **AND THE PROMPT MUST ASK FOR A BLANK, GLOWING WATCH FACE.** If Higgsfield renders a
readable UI on the wrist, the composited card lands **on top of a second, different,
fabricated readout** — two heart rates on one wrist. The face has to be a clean lit surface
for the real card to sit on, which is also what makes the detector above tractable.

⚠ **A NEW CLIP MUST GO THROUGH `norm6.sh` FIRST.** `concat` refuses mismatched dimensions and
both measurement scripts index pixels by absolute coordinate, so a re-prompt that returns
1080×1920 would fail deep inside the filtergraph. v6 never needed this (one clip per scene,
`xfade` between them); v7 does.

### The v7 re-prompts — SUBMITTED and completed (job ids + URLs in Sources)

All three rendered on `minimax_h3` at **1440×2560, 9:16, 2K, 10 s**; the cloudfront URLs,
job ids and submitted params are in the **Sources** table above, recorded **verbatim** so
this set can be re-run from the record rather than from memory. The three prompts, as sent:

**A · the runner, clothed** — *Vertical 9:16. A lone athlete running at night through a
dark space, wearing a fitted technical training top and shorts in black and deep teal,
proper running shoes. Ribbons of teal and white light wrap and trail around the body as
they move. Cinematic, high contrast, deep black background, volumetric haze, no text, no
logos, no on-screen graphics. Slow steady camera, shallow depth of field.*

**A2 · the watch close-up (new shot)** — *Vertical 9:16. Extreme close-up of a smartwatch
on a runner's wrist, mid-stride, night. The watch face is a clean blank glowing panel —
soft teal light, no numbers, no icons, no text, no user interface. Sweat on skin, dark
technical sleeve at the edge of frame, deep black background, teal rim light. Shallow
depth of field, slow push in, no text, no logos.*

**D · the pinned globe** — *Vertical 9:16. A slowly rotating night Earth against deep
black, seen from space. City lights glowing warm across the landmasses, a faint teal
atmospheric rim. Thin vertical light beams rise from a scattering of points on the
surface, each anchored to a small glowing dot where it meets the ground — location pins
planted on the globe. No text, no labels, no country names, no numbers, no user interface.
Cinematic, high contrast, slow steady spin.*

### ⚠ THE v6 VIDEO PROMPTS WERE NEVER RECORDED, AND THE TRANSCRIPTS DO NOT HOLD THEM

The Sources table records **every track prompt verbatim** ("deep dark tech house 126 BPM,
driving kick, Detroit minor stabs, relentless") and **no video prompt at all** — the four
clips are listed by a piece label only. Checked rather than assumed: the session store
holds **one** transcript for this repo, it is **this session**, and it contains **zero**
Higgsfield tool calls. The v6 generations were run elsewhere; the job ids match only
because they were read out of this file. **They cannot be recovered.**

What survives is the *intent*, in the doc's own words. Reconstructed below from the piece
labels and the scene descriptions — **these are inferred, not the strings that produced
the files**, and re-running them yields a different clip with different geometry (see the
re-measure warning at the head of this section):

| scene | recorded label | reconstructed intent |
| --- | --- | --- |
| A | *"athlete + light ribbons"* | a lone athlete moving in a dark space, wrapped and trailed by ribbons of teal/white light; cinematic, high contrast, no text |
| B | *"static blank-screen phone"* | a phone held or standing still against a dark ground, screen **blank and unlit** — the SHAPE logo is composited onto it, so the source must not carry one |
| C | *"dark club wall"* | a dark club interior with a large flat lit slab/panel on the wall and a moving rig; the wordmark and Radio screen are composited onto the slab |
| D | *"a generated night Earth — city lights, a faint teal rim, a slow spin, no text"* | recorded almost as a prompt already; the only one whose wording survives near-verbatim |

*The lesson is the one this file keeps paying for: a generation is only reproducible if the
prompt is written down beside the file id. The tracks were recorded that way and can be
re-made; the clips were not, and cannot.*

---

## What v7.1 is (2026-09-03) — the watch face, the pinned globe, the casting, the EAT prep beat, and four melodic tracks

Five more owner notes on the v7 build. Each is recorded here with what it changes, what it
**cannot** change, and what a re-render must re-measure. ⚠ **Four of the five are recipe
changes the owner re-renders; note 8 is the only one that produced FILES** — four melodic
house tracks, generated and recorded in Sources. **Nothing has been re-rendered here** (this
container has no `ffmpeg`, no `PIL` and no footage), and no cut has been re-scored.

| # | Owner note | Where the fix lives |
|---|---|---|
| 7 | *"for the watch, their is nothing appearing on the screen, have the shape triangle logo in the top left of watch screen with the hrm/bpm beat match. It just say synced with a glowing orb in the middle"* | **`mk_watch.py`** — a second renderer |
| 5 | *"for the globe, have the shape logo appear at the tip of the lines that are coming out … make sure you hit every major city. have the globe spin faster as well"* | **`mk_globe.py`** (anchors + line) + **`meas_pins.py`** (non-fatal refusal) + **`norm6.sh`** (`D_SPIN`); the D re-prompt is drafted, not sent |
| 6 | *"also dont make the man running asian"* | the **Scene A prompt** — one adjective phrase; drafted, **not** submitted (a negation cannot be prompted, and the casting is the owner's) |
| 9 | *"for the eat video, show the screen that asks if you are cooking 1 meal at a time, looking to serve meals together, so the shape engine will plan out timing of each meal"* | a sixth EAT page — **`pw/body5b.js`** (a new part F) + **`mkspecs5.py`** (`RULES` · `PLANS['eat']` · `CAPS`) + one `captions.py` row; the spot runs 23.5 → 27.5 s |
| 8 | *"also create some more house beats, maybe a little more melodic"* | **generated** — four `sonilo_music` tracks, prompts recorded verbatim beside their job ids in **Sources**; no cut is scored to any of them yet |

### 7 · The watch close-up — BUILT: a second renderer, sharing one clock

⚠ **"NOTHING APPEARING ON THE SCREEN" IS THE A2 CLIP WORKING AS DESIGNED — WHICH IS EXACTLY
WHY THE FIX IS A DRAWN LAYER AND NOT A RE-PROMPT.** The v7 A2 prompt deliberately asks for a
**blank glowing panel**: a readable UI on the wrist would put a second, different, fabricated
heart rate under the composited card. So the clip is right and the frame was empty because
nothing had been written to own those pixels yet. The ask supersedes the design either way —
the owner wants the face to read — and the honest way to give it content is to draw it, not
to ask a diffusion model to invent a watch UI.

⚠ **AND IT IS ONLY BUILDABLE BECAUSE THE WATCH LAYERS COMPOSITE WITH `overlay`, NOT
`blend=all_mode=screen` — CHECKED IN `render6.sh`, NOT ASSUMED.** The phone, wall and globe
layers are screen-blended (`blend=all_mode=screen`), which is why they read as light *on* the
footage and can never darken it. The two watch layers are `[a1][wc]overlay=…` /
`[a2][wc]overlay=…`. Under screen a near-black disc is a no-op — every pixel of the face
would have been invisible and this whole section would have been wrong. Under overlay an
opaque fill genuinely **replaces** the clip's panel. *Check the compositing mode before
designing the layer; the same drawing is a picture under one and nothing under the other.*

**Two renderers, one clock.** `card()` still writes the 480×480 lower-right card for Scene A1
(v6's layer, unchanged — a phone-shaped card reads correctly on a phone-shaped surface).
`watchface()` writes the close-up: a **round** face on the measured face rect, typeset rather
than upscaled — every coordinate, tracking value and font size scales by `k=S/480`, so a face
measured at 900 px is drawn at 900 px rather than blown up from a 480 bitmap. They share
`hr_of()`, `tSync`, and one phase integrated from frame 0, so the number and the pulse cannot
jump on the cut at `f12`. **They never share a frame** — the cut is hard — so the
IN-SYNC-in-three-places defect v7 fixed on the card cannot reappear across the pair.

**The mark is the real mark.** `trimark()` cuts the SHAPE two triangles from `in/logo_tri.png`
— the same geometry the wall lockup and the globe marks already use — never a hand-drawn
approximation. ⚠ **That file carries NO ALPHA CHANNEL:** `assets.py` writes it as
`Image.fromarray(…, 'RGB')`, i.e. **premultiplied over black**. Straight alpha is recovered as
the per-pixel **max of R, G, B**; the face fills `(9,11,11)` underneath, so the residual
premultiply error is under one part in 25. A naive `convert('RGBA')` would have produced a
fully-opaque black rectangle with the mark inside it.

**The beat match is DRAWN, not captioned.** The orb's envelope is the **wearer's** (phase
integrated from `hr_of`), the ring's is the **music's** (`ub=((t-phi)%P)/P`, straight off the
measured grid), and across `tSync` the orb crossfades onto the ring so the two visibly lock.
⚠ **Envelopes are blended, never phases** — a phase lerp jumps at every wrap, which reads as a
stutter exactly on the sync instant.

⚠ **THE STATE IS A COLOUR, AND THAT IS ALSO WHAT KEEPS THE VERIFICATION HONEST.** The face
follows the app's own ladder — cream FREE → amber MATCHING → teal SYNCED — with **one** word
(`SYNCED`) and only after sync. The first design had a permanently-teal orb, which would have
made `verify6`'s amber→teal check flake: measured, the orb alone pulses 46 → 56 px of radius
(6,648 → 9,852 px² of area, a ~3,200 px teal swing) against roughly 3,250 px of teal added by
the ring and the word at sync — the same order of magnitude, so `teal(7.5) > teal(6.5)` could
have failed frame-to-frame on a correct render. With the state on the orb, teal is ≈ 0 before
sync and thousands after, and amber is thousands before and **exactly 0** after. *A check with
a margin the size of its own noise is not a check.*

**Layout checked against the disc chord, not eyeballed** (480-space, centre 240,240, R 222):
the mark's far corner sits **211** px from centre (inside the rim); the widest row — the two
figures, bottom y 392 — has **162** px of chord either side of centre and spends **72**; the
station ring's bottom (296) clears the labels (330); the one-shot sync rim is capped at
`q(14)`, so `R+ex = 236 < 240` and cannot clip the canvas.

⚠ **`tSync = φ+14P ≈ 7.062 s` IS AFTER THE BEAT-12 CUT (6.0576), WHICH IS THE WHOLE POINT OF
THE FIFTH SHOT** — sync lands **in close-up**, two beats before the drop. `verify6` samples
6.5 s and 7.5 s, both inside A2, and reads them through `a_src()`'s **measured** face rect, so
a re-measured A2 clip cannot silently move the sampling window onto the wrong pixels.

⚠ **THE RECORDED PANEL FIGURES ARE v6 OBSERVATIONS AND ARE NOW CERTAINLY STALE** — teal
579 → 2031, amber 1121 → 0 were counted on a **card**; they are now counted on a **face** with
a different glyph set and a large coloured orb. The **assertion** is directional and survives
untouched (the v7 correction two sections up makes the same point); only the panel numbers
move, and they move on the owner's re-render, not here. The check's *name* did change —
`watch MATCHING(amber)->IN SYNC(teal)` → `close-up face turns amber -> teal` — because the face
carries neither of those words.

⚠ **NOTHING IN THIS SECTION WAS RENDERED.** There is no `ffmpeg`, no PIL and no `in/` clip in
this container; every figure above is derived from the code and the recorded geometry. The
first honest confirmation is the owner's re-render plus a fresh `verify6.py` run.

### 5 · The globe — the logo at the beam tip, more of the world, and a spin with a ceiling

**Owner: *"for the globe, have the shape logo appear at the tip of the lines that are coming
out, that was better, make make sure you hit every major city. have the globe spin faster as
well."*** Three asks, and they land in three different places: one is a real defect in the
overlay, one is **partly unreachable** from this mechanism and is said so rather than faked,
and one has a hard ceiling set by the cut's own length.

⚠ **"AT THE TIP OF THE LINES" WAS ALREADY THE INTENT AND ONLY SOMETIMES THE BEHAVIOUR.**
`pin_pick` has always aimed at `hy = min(tops)` — the TIP of the detected beam. But the
detector is allowed to fail, and when it did, `luma_pick` dropped a mark onto a lit city with
**no line under it at all** — a sticker on the globe, which is exactly the thing the note is
asking not to see. Worse, `meas_pins.py` was already measuring `samples[].anchors`
(`ay = max(bots)`, the point where the beam meets the ground) and `pin_pick` **threw it
away**. So the recipe held the ground point the whole time and never drew it.

**The fix is to carry the anchor, and to draw the line only where we invented it.** Every
placement is now a `(head, anchor)` pair: `pin_pick` carries both forward by the measured
drift, and `luma_pick` treats the bright pixel as the **anchor** and lifts the head
`BEAM_PX` (118) above it. The draw loop always paints a small dot at the anchor — that dot is
what makes the mark read as pinning a **place** rather than floating over one — and paints
the leader line **only for luma marks** (`PIN_LINE=auto`, the default). ⚠ **The reason the
line is conditional is the compositing mode, not taste:** the globe layer is
`blend=all_mode=screen`, so stroking a line over a beam the model already baked in does not
draw a line, it **doubles the one that is there** into a blown-out streak. `PIN_LINE=always`
and `never` exist for a clip that turns out to have no beams at all, or one whose beams are
already bright enough to carry the mark on their own.

⚠ **"EVERY MAJOR CITY" IS NOT REACHABLE FROM THIS MECHANISM, AND THE RECIPE SAYS SO.** Three
independent reasons, each of which alone is sufficient: the marks land where the **model's**
beams are, so their positions are the clip's decision, not ours; the fallback samples **lit
pixels**, and nothing anywhere in this pipeline holds a list of cities or knows what a city
**is**; and the globe **spins**, so a large part of the world is never on the visible face at
the moment a beat fires. What v7.1 does instead is three honest partial answers — more marks,
**brighter** marks, and no repeats:

| ask | what v7.1 actually does | what it does not do |
| --- | --- | --- |
| more places | pops start at **beat 44** (the first beat inside Scene D — beat 43 lands at 21.629 s, before `offCD` 21.831) and end at four a beat: **44 marks**, up from 27 | it does not make the globe show more of itself |
| *major* | `luma_pick` now takes the **brightest** free candidate instead of a random one — brightness is the closest a luma sampler gets to "major", and it is stated as that, not as knowledge | it does not identify a city |
| coverage | a whole-scene, **rotation-compensated** dedupe (`dero(x,t) = x − VX·(t − offCD)`) so the same physical point is never marked twice as it rotates past | it does not guarantee any particular place is hit |

A literal answer to the note needs an owner-authored **lon/lat list** plus a **measured
rotation axis and phase** for this specific clip, so a mark can be placed at a named city's
projected position on the frame it is actually visible in. That is a real piece of work and it
is **registered, not built** — inventing a plausible-looking city set here would be exactly
the fabrication the honest-data line forbids, one layer up from a count.

**The spin has a hard ceiling of 1.11×, and `norm6.sh` enforces it rather than discovering it
mid-render.** Scene D consumes `total − offCD = 8.9187 s` and the source is 10 s, so the
largest speed-up that does not run out of footage is `10 / 8.9187 = 1.121×` — and once frame
quantisation is accounted for, the clamp uses **1.111×** (see below). A new `D_SPIN` env var
takes a **request**; the script clamps it to what the footage allows, prints a WARN naming
both numbers when it clamps, and then **asserts** the resulting duration. A short clip
is refused outright — it is never quietly looped or freeze-framed, because that seam would
land in the middle of the closing shot.

⚠ **THE SPIN READS AN IMMUTABLE `in/D_src.mp4` AND WRITES `in/D.mp4` — IT MUST NEVER READ THE
FILE IT OVERWRITES.** This paragraph previously credited the `in/.D_spun` marker with stopping
a second run from compounding onto an already-spun clip, and **the marker cannot do that**: it
only matches when the value is **unchanged**, which is precisely the run nobody makes. The
first cut spun `in/D.mp4` onto itself, so changing `1.05` to `1.11` applied the new factor to
the 9.524 s output of the old one — **the factors compound**, and because `MAXF` was recomputed
off the shortened file the clamp passed, the assert passed, and the globe spun at a speed
nothing on screen or in the log disagreed with. Setting it back to `1.0` was worse: the
`<= 1.0001` branch printed *"source pace"*, did nothing, and left both the clip spun and the
marker stale. With a snapshot the 1.0 path **restores** from it, every path writes the marker,
and a re-run is idempotent in the **request** rather than in the file. The fetch in `boot5.sh`
deletes the snapshot, because a re-prompted Scene D would otherwise be spun from the old globe.
*A guard that only fires when the input is unchanged is not a guard.*

⚠ **THE CLAMP AND THE ASSERT DELIBERATELY USE DIFFERENT NUMBERS, AND THE GAP IS LOAD-BEARING.**
`ffmpeg` quantises the output to whole 24 fps frames, so clamping to the exact requirement and
then asserting the exact requirement makes the ceiling itself fail: `10 / 1.1211 = 8.920 s` →
214 frames → **8.9167 s**, one frame short. The clamp therefore targets `D_MIN + 2/24` while
the assert targets `D_MIN`. Verified across the whole range — 1.05 / 1.11 / 1.5 / 3.0 all
produce a quantised duration at or above 8.9187 s, and 1.5 and 3.0 both correctly report as
clamped. ⚠ And `D_MIN` is **hardcoded, not read from `params_v6.json`**, because `norm6.sh` is
the FIRST step in the run order and `plan6.py` — the only writer of that file — has not run
yet; reading it there would fail on a clean tree.

⚠ **1.11× IS BARELY PERCEPTIBLE, SO THE REAL FIX IS THE PROMPT.** A tenth faster is not what
the note is asking for. The re-prompt below is **drafted, NOT submitted** — it swaps *"slowly
rotating"* / *"slow steady spin"* for a brisker pace while holding every other clause,
including the anchored-pin geometry v7 introduced and every honest-data prohibition:

**D · the pinned globe, brisker (v7.1 draft, NOT SUBMITTED)** — *Vertical 9:16. A rotating
night Earth against deep black, seen from space, turning at a brisk steady pace. City lights
glowing warm across the landmasses, a faint teal atmospheric rim. Thin vertical light beams
rise from a scattering of points on the surface, each anchored to a small glowing dot where it
meets the ground — location pins planted on the globe. No text, no labels, no country names,
no numbers, no user interface. Cinematic, high contrast.*

⚠ **A RE-PROMPTED GLOBE COSTS NOTHING IN MEASURED GEOMETRY, WHICH IS THE POINT OF THE v7
WORK.** Every Scene D number — the disc, the drift, the pin set, the logo row, the close row —
already comes from `meas_pins.py` reading the actual file, so a new clip re-measures itself.
The one thing that does **not** survive is the recorded v6 disc `(727, 1295) r 676`, which is
now only a labelled fallback for a clip that cannot be measured at all.

⚠ **AND `meas_pins.py`'S REFUSAL WAS A LATENT RENDER-KILLER, FIXED HERE.** Its low-head-count
guard raised `SystemExit`, and under `render6.sh`'s `set -e` that **aborted the entire
render**. Run by hand it was worse in a quieter way: the file was never written, so
`mk_globe.py` fell through to the v6 hardcoded disc — **and both the logo row and the close row
are derived from that disc**, so a clip whose pins we could not find silently mis-placed two
further layers that had nothing to do with pins. A clip whose beams we cannot detect is not a
clip whose **geometry** we cannot measure, and conflating the two is what caused the damage.
Now the disc and the drift are computed and written **before** the believability test, the
`believed` flag gates only the pin **set**, and the hard exit lives behind `PIN_STRICT=1`. The
render continues, correctly, with drawn beams.

**`verify6.py` follows the mode instead of assuming one.** The old
`marks are pin-sourced, not luma-sampled` check would now **fail a correct render** — an
unbelieved pin set is a legitimate, deliberate state. It is replaced by a pair that asserts the
mode is internally **consistent**: with pins, ≥ 80 % of marks must carry a pin id; without,
**none** may claim one and the line mode must not be `never` (or nothing would draw the beams
we just took responsibility for). Two checks are added — **almost every pop placed a mark**
(≥ 90 %, since `luma_pick` now **drops** a mark rather than stacking one at the disc centre,
and a mass drop means the spacing rules are starving the placement), and **marks are anchored
to the ground, not floating**, which is note 5's own claim: at beat 54 it counts the live marks
whose ground dot lights a 30 px window and requires the majority. ⚠ That last one is
**directional on purpose** — a per-mark assertion would flake on any mark whose measured beam
happens to be only a few pixels tall, which is the same trap the beat-12 probe fell into in v7.
The pin-coincidence check now **skips with an INFO line** when no mark carries a pin, rather
than passing vacuously over an empty loop.

**Nothing in this subsection was rendered.** There is no `ffmpeg`, no `PIL` and no `in/`
footage in this container. What *was* run: the `norm6.sh` clamp and assert arithmetic, driven
over the range above and checked against 24 fps quantisation; `bash -n` on the extracted
script; and an AST parse of every python block in this file. The first honest confirmation is
the owner's re-render.

### 6 · The runner — DRAFTED, NOT SUBMITTED: the casting is one phrase, and it is the owner's

⚠ **THE NOTE CANNOT BE WRITTEN INTO THE PROMPT AS IT IS PHRASED, AND WRITING IT THERE IS THE
ONE EDIT MOST LIKELY TO PRODUCE THE CLIP THE OWNER ASKED AGAINST.** A diffusion text encoder
has no NOT. Every token in the conditioning **steers toward** what it names — the "don't think
of an elephant" failure, and it is why `minimax_h3` has no negative-prompt field in the param
set we submit (`aspect_ratio · duration · resolution · use_unlim · batch_size ·
aigc_watermark`). So *"dont make the man running asian"* pasted into the prompt would put that
exact descriptor in front of the model as a subject cue. **A negation is not a casting
instruction; only a positive descriptor is.**

**Which makes the actual fix one phrase, and that phrase is the owner's to pick.** The note
says what the runner should *not* be; it does not say what they *should* be, and choosing an
ethnicity for a person on screen is a casting call, not an implementation detail. So this
subsection **drafts** the prompt with the slot filled so it is immediately runnable, and the
swap is exactly one adjective phrase before `athlete`:

> `A lone {CASTING} athlete running at night through a dark space, …`

Fills that read as one clean phrase: **a Black male** · **a white male** · **a Latino male** ·
**a South Asian male**. (*male* is not an addition — the owner's own note says *"the man
running"*.) Everything downstream of that slot stays **verbatim**, including the pronoun
*"as they move"* — a pronoun steers nothing measurable in a diffusion prompt and rewriting it
is churn in a record whose whole value is that it can be diffed against what was sent.

**The draft, as it would be submitted** (`minimax_h3`, same params as the v7 set):

> *Vertical 9:16. A lone Black male athlete running at night through a dark space, wearing a
> fitted technical training top and shorts in black and deep teal, proper running shoes.
> Ribbons of teal and white light wrap and trail around the body as they move. Cinematic, high
> contrast, deep black background, volumetric haze, no text, no logos, no on-screen graphics.
> Slow steady camera, shallow depth of field.*

**Every other clause is held, and each one is load-bearing rather than decorative.** The
**fitted technical training top and shorts** clause *is* v7's note 4 — the naked-runner fix —
and dropping it re-opens a defect the owner already reported once. The **teal and white
ribbons** are what make Scene A read as the same film as B, C and D. The **deep black
background** is what the A→B fade crosses and what the watch card sits legibly on. And **no
text, no logos, no on-screen graphics** is the honest-data clause: every mark in this film —
the wordmark on the wall, the logo over the globe, the card on the wrist — is drawn by a
script from `public/` assets, so a model-invented brand mark in the plate would be a
fabrication nothing downstream could distinguish from ours.

⚠ **A SCENE A RE-PROMPT INVALIDATES NOTHING MEASURED — WHICH IS NOT TRUE OF SCENE D, AND THE
DIFFERENCE IS WORTH STATING.** Four reasons, each checked in the source rather than assumed:

| What could have depended on the clip | Why it does not |
|---|---|
| the wide watch card at `x 890 / y 1660` | **frame-relative arithmetic** — `1440−480−70` and `2560−480−420`, a deliberate lower-right inset. `plan_a2.py` derives it, `render6.sh` reads it back, so the two cannot drift, and neither reads a pixel of A. |
| the A/A2 cut at frame **146** | derived from the **beat grid** (`t12 = phi + 12P = 6.0576 s`), not from the footage. |
| `meas_watch.py`'s face rect | it measures **`in/A2.mp4`** (`WATCH_SRC`), a different clip with its own job id. A Scene A re-prompt does not touch the close-up. |
| `verify6.py`'s Scene-A checks | they resolve `a_src(t)` → clip, time and card rect, instead of hardcoding a mask — the fix v7 already made for exactly this reason. |

What a new Scene A *does* change is **composition read by eye**: what sits under the card in
the lower-right inset, and whether the runner is where the frame wants them at the cut. That
is a look, not a number, and the only instrument for it is the owner watching the render.

⚠ **AND DURATION IS NOT A CONSTRAINT HERE, WHICH IS PRECISELY WHY THERE IS NO CLAMP.** Scene A
supplies frames 0–145 = **6.0576 s** (A2 carries the rest, including the fade), against a 10 s
source. Scene D needs **8.9187 of 10** — a 1.121× ceiling — which is the whole reason `D_SPIN`
exists and A gets nothing of the kind.

⚠ **`norm6.sh` STILL RUNS FIRST.** Same rule as every new clip: `concat` refuses mismatched
dimensions and both measurement scripts index absolute pixels, so a re-prompt that comes back
1080×1920 fails deep inside the filtergraph rather than at the fetch.

**Nothing was submitted.** `minimax_h3` is not unlim-covered — `use_unlim: true` is rejected
outright and the submitted `false` **bills** — so a casting generation the owner has not chosen
would be spending their credit on my guess. The two existing prompt records are **not edited**
either: the Sources row for job `6f01a52f…` and the *"The v7 re-prompts — SUBMITTED"* block hold
the text **as sent**, which is the entire point of recording them verbatim. This draft moves
into those records the day it is actually submitted, with its own job id beside it.

⚠ **AND IF ONE DESCRIPTOR DOES NOT LAND, THE REMEDY IS A STRONGER DESCRIPTOR — NEVER A STACK OF
NEGATIONS.** The param set carries no start frame, so the prompt text is the only casting lever
this model gives us; adding *"not X, not Y"* re-creates the failure at the top of this
subsection with more tokens. Nothing on screen claims the runner is a real member — no name, no
count, no attribution — so the casting is a depiction choice, not a data claim.

### 9 · The EAT spot — the prep timing screen, and it is not where I first looked

**Owner: *"and for the eat video, show the screen that asks if you are cooking 1 meal at a
time, looking to serve meals together, so the shape engine will plan out timing of each
meal. cool feature that should be in video"*.** The screen exists and ships — it is the
Prep Session's timing ask — so this is a capture-and-plan change, not a product one. The
EAT spot gains a sixth page for it.

⚠ **THE ASK IS ON THE *MISE* STAGE, NOT THE PICKER — AND THAT CORRECTION IS THE WHOLE
CAPTURE.** `BSPrepSession` runs `picker → mise → transition → cook → wrap`
(`iosAppBroadsheetClient.jsx:7901`). The picker is dish SELECTION only; the block headed
**"How should these be timed?"** (`cook:prep.howAsk`) lives on the **mise** stage, below the
merged ingredient checklist, below the allergen notes, and below the **"Your kitchen"**
burners/ovens steppers. A capture that stops at the dish list — which is what "the screen
that asks" sounds like — never reaches it. The segment has to tick dishes, press **Merge the
mise**, and then **scroll** before the block is on screen.

⚠ **AND IT RENDERS ONLY WHEN TWO OR MORE DISHES ARE SELECTED.** The whole block is gated on
`multi`, and the code says why in as many words: *"A single dish skips this entirely: there
is nothing to decide."* So a one-dish capture produces a mise page with no timing question on
it at all. **Two ticks is a hard requirement of the shot, not a nicety.**

**What is on screen when it lands** — three rows, each carrying the engine's own figure for
the dishes actually selected:

| Row | Sub-line | Figure |
|---|---|---|
| **Cook at the same time** | *Everything at once — less time in the kitchen* | `spanOf(orchTogether)` min |
| **Cook to serve** | *On the table at a time you choose* | none — a clock picker opens instead |
| **Cook separately** | *Finish one, then start the next* | `spanOf(orchSeq)` min |

Those minutes come from `cookOrchestrator` running over the picked dishes, so the shot is a
**real plan, not a mock** — which is the strongest thing this spot can say and needs no
disclaimer at all.

⚠ **CAPTURE CAUTION — "COOK AT THE SAME TIME" CAN COME UP DISABLED, AND IT IS THE HERO ROW.**
`togetherOn` is false when the picked pair carries no passive window to weave into; the row
then greys to `opacity 0.45`, its minutes are **suppressed** (deliberately — they would equal
the "cook separately" figure and advertise a saving that does not exist), and the sub-line
swaps to `serialWhy(...)`. Measured on the catalog, **only 53 of 100 recipes can host an
interleave window** and a two-dish pair interleaves **50.8 %** of the time — so this is a coin
flip, not an edge case. **Confirm on the boot that the row is live before recording**; if it
is not, swap one dish and re-tick.

**Two segments under one caption, the `recipes` + `recipe` shape.** The picker and the timing
block are ~6 s apart in a single continuous recording, and the window rule takes ONE contiguous
slice anchored on one act — so a single segment can show the ticks or the timing block, never
both. Two `rec()` calls, two anchors:

```python
# mkspecs5.py — RULES, two new rows
 'prep':('pick2',0.9),'prep_time':('mode',1.9),
```

`prep` (2 beats ≈ 1.0 s) is anchored on the SECOND tick, so both checkboxes land inside the
window — the `recipes` flash, in the picker. `prep_time` (6 beats ≈ 3.0 s) is anchored on the
mode tap with a 1.9 s pre-roll, so the block is settled and readable for ~1.9 s before a row
lights up.

```js
 // ---- F: eat · prep session (the timing engine) ----
 await L.boot('F');
 await rec('prep',async()=>{await sleep(400); await act('tab',()=>L.tab('eat')); await sleep(1800); await act('open',()=>L.go('^PREP THE WEEK|^Prep the week',0)); await sleep(2600); await act('pick1',()=>L.go('kcal',0)); await sleep(1100); await act('pick2',()=>L.go('kcal',1)); await sleep(2200);});
 await rec('prep_time',async()=>{await sleep(500); await act('mise',()=>L.go('^Merge the mise',0)); await sleep(2800); await act('scroll',()=>L.scroll(1100,3400)); await sleep(2600); await act('mode',()=>L.go('^Cook at the same time',0)); await sleep(3000);});
```

⚠ **IT GOES IN `body5b.js` AS A NEW PART F, NOT INTO PART C.** Part C runs
`menu → meal → grocery → recipes → recipe → cook` in ONE boot, and **`cook` continues straight
off the recipe detail** (it opens with `Cook this`, which only exists there) — inserting prep
between them breaks that hand-off, and appending after `cook` would start from inside Cook
mode. A fresh boot in `body5b.js` costs nothing the four existing eat segments depend on. The
plan references segments by NAME, so capture order and spot order are independent.

⚠ **TWO SELECTORS TO CONFIRM ON A LIVE BOOT.** (1) `L.go('kcal', n)` picks the first two dish
rows by their `{kcal} kcal · {p}P` sub-line — correct on the picker, where nothing else carries
it, but worth an eye before the run; the fallback is the dish titles, which vary with the demo
week. (2) The door renders `cook:prep.door` under `textTransform: uppercase`, and a matcher
reads DOM text rather than computed style — the alternation covers it either way, which is why
it is written that way rather than guessed.

**The page map — and the spot gets LONGER rather than thinner.**

```python
 'eat':('t1',[(8,16,[('menu',8)],1),(16,23,[('meal',7)],1),(23,31,[('grocery',8)],1),
              (31,39,[('recipes',2),('recipe',6)],1),(39,47,[('prep',2),('prep_time',6)],1),
              (47,56,[('cook',9)],1),(56,61,'close',None)],2,61),
```

`CAPS['eat']` **5 → 6**. Every existing page keeps its exact beat count (8 · 7 · 8 · 2+6 · 9);
the new page is 8 beats on top, pages run 8→56 instead of 8→48, and the close moves 48→53 →
**56→61**. ⚠ **The alternative was to squeeze six pages into the old 40 beats, and it is the
wrong answer for a reason the owner already gave**: the previous round's note was *"the
scrolling is going too fast … hard to see what is going on"*, and taking beats back off menu /
grocery / recipe re-introduces exactly that. Six pages of substance do not fit in 40 beats at
the slowed rate; the honest move is a longer spot, stated rather than hidden.

**Kick gate, checked not assumed.** t1 carries beats **0–28 and 48–62**. The close now spans
**56→61**, inside the live band, so the closing logo still throbs to a real kick; the lead is
beats 6→8, also live. Beat 61 leaves a beat of margin under `kick_by_beat`'s last index (62) —
the v4 lesson that a gate array read past its end returns silence.

**The caption** — one new row in `captions.py`'s `SPOTS`, inserted at index 4 so *Cook mode.*
becomes index 5:

```python
 'eat':[('EAT','The ledger ticks *live.*'),('EAT','Every meal, *planned.*'),
        ('EAT','The shop list, *sorted.*'),('EAT','Shape *Kitchen.*'),
        ('EAT','Two dishes, one *timeline.*'),('EAT','Cook *mode.*')],
```

⚠ **THE COPY MAY NOT PROMISE A SINGLE-MOMENT FINISH, AND THAT IS MEASURED.** "Cook to serve"
lands every dish at one moment in **7.4 %** of catalog pairs (mean gap **13.5 min**), and an
unlimited-station kitchen only reaches **8.6 %** — the constraint is the one cook, not the
room. The app's own copy is careful for the same reason: TOGETHER carries no *"ready together"*
claim **and no *"soonest"* claim either** (it is greedy and order-sensitive — a measured trio
plans 50 min in the order the sheet sends and 47 in another). *"Two dishes, one timeline"* is
what `cookOrchestrator` literally emits — an ordered timeline over both dishes — and claims
nothing about where they land. **New line, owner's eye wanted**, like the other fourteen.

⚠ **THE EAT SPOT'S RENDERED FIGURES ABOVE ARE SUPERSEDED BY THIS CHANGE AND ARE NOT RE-STATED
HERE.** Runtime goes **47 → 55 beats** = `55 × 0.500209` = **27.5115 s**, so the render moves
**564 → 660 frames (23.500 → 27.500 s)**, the printed `== eat` plan block gains two rows and
re-times the four pages after `recipe`, and the EAT md5
(`5d14b27a601fd7300894ec7ba6d5aefb`) is dead. **The other four spots are untouched** — no
shared constant moved, only `PLANS['eat']`, `RULES`, `CAPS['eat']` and one caption row. A
re-render must re-run `verify5.py spot eat`; nothing about it is verifiable from here.


---

## The spots, slowed — and the MARKETPLACE spot

**Owner, on the four feature spots: *"also reduce the scrolling times of all the other
videos. The scrolling is going too fast through the sections. Its hard to see what is
going on."*** and, separately, *"and need a seperate video for the coaching
marketplace"*. So the four spots are re-cut at roughly half speed and a fifth joins
them. The v5 montage launch cut is left as it is; v6 supersedes it.

**The rule that fixes the scroll, and why the old one could not.** `mkspecs.py` allocated
a fixed number of beats per page and then set `speed` to fit whatever source window a
RULE produced — so a long window inside a short beat allocation played FAST (up to
1.75×, 2.0× on the profile), which is exactly the complaint. `mkspecs5.py` inverts it:
each page gets **about twice the beats**, and the source window is **anchored on that
page's focus act with a pre-roll**, taking exactly `beats × P` seconds of source. The
window is clamped to the segment's own length, so the only direction speed can ever move
is DOWN:

```python
w  = beats * P                       # the beats decide the duration
s0 = acts[focus] - pre               # anchored on the act, not on the segment start
s1 = min(total - 0.05, s0 + w)
sp = 1.0 if (s1 - s0) >= w else (s1 - s0) / w   # <= 1.0 only — never sped up
```

Measured on the 26 recaptured segments, **every one of the 26 fits at `spd 1.00`** — no
clamping anywhere, so nothing in the five spots is sped up at any point. The scrolls
themselves were also slowed at CAPTURE time (`tour5.js` / `tour5b.js`: the scroll
durations run 1800–3800 ms against the v5 tour's 900–2000 ms, and every settle is
2200–3800 ms), so the source is slower before the plan ever touches it.

**Beats per page, before → after.** TRAIN 5/4/6/4/4 → **9/6/9/7/9**; EAT 5/4/5/2+3/4 →
**8/7/8/2+6/9**; COMMUNITY 5/4/4/5/5 → **8/8/8/8/8**; SCORE 7/5/4/3/4 → **7+5/10/6/6/6**.
MARKETPLACE is new at **8/8/7/7/5/5**. Each spot runs ~23.1 s (t3 spots, 45 beats of
page plus a 5-beat close) or ~23.5 s (t1 spots, 45 beats plus 5), against 14.5 s before.

**The track assignment changed, and the gate is why.** A ~23 s spot needs a live kick
across its whole length or the closing logo throbs to silence. `kick_by_beat` says t1
carries beats 0–28 and 48–62, t3 carries 16–43 and 48–62, and **t2 carries 16–43 only —
about 14 s**, too short for a slowed spot with a live close. So **t2 sits this set out**:
TRAIN, SCORE and MARKETPLACE ride t3 (beats 15→61), EAT and COMMUNITY ride t1 (beats
6→53). COMMUNITY moved off t2 for exactly this reason. Nothing else about the gate
changed — `pres = clip((kb − 0.15)/0.30, 0, 1)`, `k = exp(−u/0.20)·pres(n)`.

**MARKETPLACE — the pages.** The directory ("THE CLASSIFIEDS · Find your coach.") →
Coach of the Week, Leah Kim's Listing → the rate card (01 Single workout $32 · 02 Program
$160 · 03 Monthly $240) → the WHAT'S INCLUDED sheet → SEE THE FULL CALENDAR → the BOOK
THE INTRO · $0 sheet. Two capture cautions, both learned the hard way: **never tap HOLD
NEXT OPEN SLOT** (it navigates to JOIN SHAPE and the boot is lost), and **every calendar
day is aria-disabled for a demo coach**, so the calendar is shown rather than driven.
Diego Morales still crashes the preview (the registered defect), so the spot uses Leah
Kim throughout.


**Verified numerically, per spot** (`verify5.py spot <name>`): 1440×2560 · 24 fps ·
**555 / 555 / 564 / 564 / 555 frames** = **23.125 / 23.125 / 23.500 / 23.500 / 23.125 s**
for MARKETPLACE / TRAIN / EAT / COMMUNITY / SCORE, against audio 23.106 / 23.106 / 23.510
/ 23.510 / 23.106. At two samples per page the phone-screen layer matches the capture
frame it was cut from on **58 of 60 samples (mean abs diff 1.65–2.03)** and the composite
matches `screen(B_long, layer)` inside the rect at **1.22–1.95**. Captions: lit pixels at
every caption midpoint (8,994–52,893) and **0 at t = 0.2 s on all five**. The closing logo
pulses — bbox 477–480 px / 21.3–22.3 k lit at a beat against 458 px / 8.8–8.9 k mid-beat.
The output audio re-measures **119.35 BPM** on the t3 spots and **119.9** on the t1 spots
with every cut within 60 ms of a grid beat; RMS mid −7.5 dB / tail −14.6 dB (t3), mid
−9.8 / tail −15.7 (t1). Old runtimes for comparison: 14.58 / 14.50 / 14.54 / 14.58 s — so
the new cuts run **58–62 % longer**.

⚠ **THE TWO SCORE OUTLIERS ARE TIMING, NOT A WRONG CLIP — and that is measured rather
than assumed.** Two of the 60 samples read `layer_vs_src` **20.14** (profile @ t = 3.72)
and **8.49** (score @ t = 11.25) while the other 58 read 1.65–2.03. A best-match scan
(±0.35 s at 0.02 s) pins both to a source frame **one to two capture frames off** the
nominal `s0 + (t − t0)·speed` map — +0.05 s and −0.05 s — after which they read **2.27**
and **2.20**. Same 24 fps resample of an 11–19 fps capture the v4/v5 renders already
recorded; the frames are the right frames.

**md5 of each render** (the review links are short-lived uploads and stay out of the
repo, as before): MARKETPLACE `94d02bb21ea330552448e1367de9233f` (19,766,603 B) · TRAIN
`5c78408180852bb43c719111583de46b` (18,212,279) · EAT
`5d14b27a601fd7300894ec7ba6d5aefb` (19,730,162) · COMMUNITY
`11dc2fab28b26662b02e24cc3f2d6bc2` (19,129,345) · SCORE
`a11486c103eaf1b4714a2541944ebd71` (19,175,222).

**The plan `mkspecs5.py` printed** — every segment at `spd 1.00`, which is the claim
"nothing is sped up" as a measurement rather than an intention:

```
== train  track=t3  T=23.1059  aoff=7.5645  beat0=15
   deck    0.50-> 5.02  src 1.84-> 6.36/ 7.06 | swap 5.02-> 8.04 src 0.15-> 3.16/ 4.92
   session 8.04->12.56  src 4.25-> 8.77/ 9.00 | setlog 12.56->16.07 src 0.20-> 3.72/ 5.23
   calendar 16.07->20.59 src 1.63-> 6.15/ 6.20 | close 20.59->23.11
== eat  track=t1  T=23.5098  aoff=3.0652  beat0=6
   menu 1.00->5.00 src 1.84->5.84/6.77 | meal 5.00->8.50 src 4.13->7.63/8.25
   grocery 8.50->12.51 src 4.02->8.02/9.81 | recipes 12.51->13.51 src 4.03->5.03/7.04
   recipe 13.51->16.51 src 4.12->7.12/8.89 | cook 16.51->21.01 src 4.98->9.48/10.57 | close 21.01->23.51
== community  track=t1  T=23.5098  aoff=3.0652  beat0=6
   feed 1.00->5.00 src 1.90->5.91/7.42 | details 5.00->9.00 src 4.14->8.14/9.07
   channels 9.00->13.01 src 2.17->6.17/6.22 | market 13.01->17.01 src 2.51->6.51/7.78
   listing 17.01->21.01 src 4.12->8.12/9.17 | close 21.01->23.51
== score  track=t3  T=23.1059  aoff=7.5645  beat0=15
   profile 0.50->4.02 src 1.82->5.34/6.86 | climb 4.02->6.53 src 1.61->4.12/6.41
   score 6.53->11.55 src 3.51->8.53/11.12 | habits 11.55->14.57 src 5.54->8.56/9.47
   goal 14.57->17.58 src 3.12->6.14/7.30 | checkin 17.58->20.59 src 0.10->3.12/4.96 | close 20.59->23.11
== marketplace  track=t3  T=23.1059  aoff=7.5645  beat0=15
   market 0.50->4.52 src 2.51->6.53/7.78 | listing 4.52->8.54 src 4.12->8.14/9.17
   listing2 8.54->12.06 src 0.00->3.52/4.93 | mkt_offer 12.06->15.57 src 0.00->3.52/4.93
   mkt_cal 15.57->18.08 src 0.00->2.51/4.75 | mkt_book 18.08->20.59 src 0.00->2.51/4.96 | close 20.59->23.11
```

⚠ **THE SANDBOX WAS WIPED A SIXTH TIME MID-RUN, AND THE ANSWER WAS NOT A BIGGER
CHECKPOINT — IT WAS A SHORTER UNIT OF LOSS.** The earlier plan (tar `cap/seg`, upload it,
re-download after the next wipe) **cannot work**: a gofile guest upload is a download
PAGE, not a file URL, so nothing in the sandbox can fetch it back. What does work is one
background script (`runA.sh`) that boots, captures, plans, then **renders → md5s →
uploads each spot immediately** in the order `marketplace train eat community score`,
polled every ~55 s so the lease keeps re-arming. A wipe then costs at most the one spot
in flight, and the whole run completed on the first attempt under that shape. *A
checkpoint you cannot read back is not a checkpoint.*

**`pw/tour5.js` and `pw/tour5b.js`** — the recapture, split in two so each stays under
the sandbox's foreground limit. They share `tour4.js`'s header (its first 18 lines,
with an `fs.rmSync(dir)` added to `mk()`'s segment setup so a re-run starts clean), and
each is assembled as header + body:

```bash
H=$(sed -n '1,18p' /home/user/pw/tour4.js | sed "s#const st={name,dir,n:0#fs.rmSync(dir,{recursive:true,force:true}); fs.mkdirSync(dir,{recursive:true}); const st={name,dir,n:0#")
printf '%s\n' "$H" > /home/user/pw/tour5.js;  cat /home/user/pw/body5a.js  >> /home/user/pw/tour5.js
printf '%s\n' "$H" > /home/user/pw/tour5b.js; cat /home/user/pw/body5b.js >> /home/user/pw/tour5b.js
# the pre-installed browser is chromium-1228; playwright's own revision pin does not match it
sed -i "s#chromium.launch({args:\['--no-sandbox'\]})#chromium.launch({args:['--no-sandbox'],executablePath:'/ms-playwright/chromium-1228/chrome-linux64/chrome'})#" /home/user/pw/tour5.js /home/user/pw/tour5b.js
```

**`pw/body5a.js`** — parts A (home · goal · calendar), B (train) and C (eat).

```js
 // ---- A: home / goal / calendar ----
 await L.boot('A');
 await rec('checkin',async()=>{await sleep(500); await act('tap',()=>L.go('^CHECK-IN DUE')); await sleep(3600);}); await back();
 await rec('goal',async()=>{await sleep(500); await act('tap',()=>L.go('^GOAL')); await sleep(2600); await act('scroll',()=>L.scroll(520,2800)); await sleep(500);}); await back();
 await rec('calendar',async()=>{await sleep(500); await act('tap',()=>L.go('^MONTH VIEW')); await sleep(2600); await act('day',()=>L.go('^(10|11|12|17|18)$',0)); await sleep(3000);});
 // ---- B: train ----
 await L.boot('B');
 await rec('deck',async()=>{await sleep(400); await act('tab',()=>L.tab('train')); await sleep(2200); await act('scroll',()=>L.scroll(500,3400)); await sleep(1000);});
 await rec('swap',async()=>{await sleep(500); await act('tap',()=>L.go('^SWAP')); await sleep(3600);}); await back();
 await rec('session',async()=>{await sleep(500); await act('tap',()=>L.go('^▶',0)); await sleep(3600); await act('scroll',()=>L.scroll(360,3000)); await sleep(900);});
 await rec('setlog',async()=>{await sleep(600); await act('tap',()=>L.go('Mark set 1|Log set 1|set 1 done|^✓$',0)); await sleep(3800);});
 // ---- C: eat ----
 await L.boot('C');
 await rec('menu',async()=>{await sleep(400); await act('tab',()=>L.tab('eat')); await sleep(2200); await act('scroll',()=>L.scroll(420,3200)); await sleep(900);});
 await rec('meal',async()=>{await sleep(500); await act('tap',()=>L.go('Yogurt \\+ granola|Tuna, white bean',0)); await sleep(3600); await act('scroll',()=>L.scroll(450,2600)); await sleep(700);}); await back();
 await rec('grocery',async()=>{await sleep(500); await act('tap',()=>L.go('^GROCERY')); await sleep(2600); await act('produce',()=>L.go('^▸ Produce|^Produce$',0)); await sleep(2500); await act('apple',()=>L.go('^Apple$|^Avocado$',0)); await sleep(2600);});
 await rec('recipes',async()=>{await sleep(500); await act('tap',()=>L.go('^RECIPES')); await sleep(3200); await act('scroll',()=>L.scroll(300,1800)); await sleep(700);});
 await rec('recipe',async()=>{await sleep(500); await act('tap',()=>L.go('Greek yogurt power bowl|kcal',0)); await sleep(3600); await act('scroll',()=>L.scroll(520,3000)); await sleep(900);});
 await rec('cook',async()=>{await sleep(500); await act('tap',()=>L.go('Cook this',0)); await sleep(3600); await act('start',()=>L.go('START COOKING',0)); await sleep(2700); await act('next',()=>L.go('DONE · NEXT|✓ DONE',0)); await sleep(2600);});
 await b.close(); console.log('TOUR5_DONE');
})();
```

**`pw/body5b.js`** — parts D (community + marketplace) and E (profile · score · habits).

```js
 // ---- D: community + marketplace ----
 await L.boot('D');
 await rec('feed',async()=>{await sleep(400); await act('tab',()=>L.tab('chat')); await sleep(2200); await act('scroll',()=>L.scroll(640,3800)); await sleep(900);});
 await rec('details',async()=>{await sleep(500); await act('tap',()=>L.go('SESSION DETAILS',0)); await sleep(3600); await act('scroll',()=>L.scroll(560,3200)); await sleep(900);}); await back();
 await rec('channels',async()=>{await sleep(500); await act('tab',()=>clickBtn('^CHANNELS')); await sleep(2600); await act('open',()=>L.go('Shape HQ|^HQ|strength|^#',0)); await sleep(3000);}); await back();
 await rec('market',async()=>{await sleep(500); await act('open',()=>L.ev('shape:openMarket',{role:'trainer'})); await sleep(2800); await act('scroll',()=>L.scroll(520,3200)); await sleep(1200);});
 await rec('listing',async()=>{await sleep(500); await act('tap',()=>L.go('Leah Kim',0)); await sleep(3600); await act('scroll',()=>L.scroll(560,3200)); await sleep(1000);});
 await rec('listing2',async()=>{await sleep(500); await act('scroll',()=>L.scroll(700,3200)); await sleep(1200);});
 await rec('mkt_offer',async()=>{await sleep(500); await act('tap',()=>L.go("WHAT'S INCLUDED",0)); await sleep(3600);});
 await L.go('^CLOSE$|^✕$|^×$',0); await sleep(900); await L.dump('n5_afteroffer');
 await rec('mkt_cal',async()=>{await sleep(500); await act('tap',()=>L.go('SEE THE FULL CALENDAR',0)); await sleep(3400);});
 await L.go('^← THE LISTING',0); await sleep(900);
 await rec('mkt_book',async()=>{await sleep(500); await act('tap',()=>L.go('BOOK THE INTRO',0)); await sleep(3600);}); await L.dump('n5_book');
 // ---- E: profile / score / habits ----
 await L.boot('E');
 await rec('profile',async()=>{await sleep(400); await act('tab',()=>L.tab('me')); await sleep(2200); await act('scroll',()=>L.scroll(560,3200)); await sleep(1000);});
 await rec('climb',async()=>{await sleep(500); await L.scroll(-560,1300); await sleep(600); await act('climb',()=>L.go('^CLIMB$')); await sleep(3200);});
 await rec('score',async()=>{await sleep(500); await act('tap',()=>L.go('SHAPE SCORE|Shape Score',0)); await sleep(3400); await act('tier',()=>L.go('^THIS TIER$')); await sleep(2200); await act('scroll',()=>L.scroll(520,3000)); await sleep(1100);}); await back();
 await rec('habits',async()=>{await sleep(500); await act('tab',()=>L.tab('home')); await sleep(1600); await act('tap',()=>L.go('^VIEW ALL')); await sleep(3400); await act('scroll',()=>L.scroll(320,2200)); await sleep(900);});
 await b.close(); console.log('TOUR5B_DONE');
})();
```

**`mkspecs5.py`** — the slowed plans. Replaces `mkspecs.py` for the five spots (the
launch cuts keep theirs). RULES is the focus act + pre-roll per segment; PLANS is the
beat allocation per spot; the spec schema is the one `mk_screen5.py` / `spot.py` /
`verify5.py` already read (`grid{P,t_b0,bidx0,kb}` · `segments[]` · `captions[]` ·
`track` · `aoff` · `env_out`).

```python
import json,os,sys
SEG='/home/user/cap/seg'
MEAS={'t1':'/home/user/w/meas_t1.json','t2':'/home/user/w/meas_t2.json','t3':'/home/user/w/meas_t3.json'}
# segment -> (focus act, pre-roll seconds). The window is anchored on the act so the
# settle + the whole scroll sit inside the beats at 1.00x playback.
RULES={
 'checkin':('tap',0.4),'goal':('scroll',0.8),'calendar':('day',0.8),
 'deck':('scroll',0.8),'swap':('tap',0.35),'session':('scroll',0.8),'setlog':('tap',0.4),
 'menu':('scroll',0.8),'meal':('scroll',0.8),'grocery':('apple',2.4),'recipes':('scroll',0.5),
 'recipe':('scroll',0.8),'cook':('next',2.8),
 'feed':('scroll',0.8),'details':('scroll',0.8),'channels':('open',0.8),'market':('scroll',0.8),
 'listing':('scroll',0.8),'listing2':('scroll',0.8),'mkt_offer':('tap',0.5),'mkt_cal':('tap',0.5),
 'mkt_book':('tap',0.5),
 'profile':('scroll',0.8),'climb':('climb',0.8),'score':('tier',1.2),'habits':('scroll',0.8)}
def acts(name):
    d=json.load(open(os.path.join(SEG,name,'times.json')))
    return {k:v/1000.0 for k,v in d['acts']}, d['total']/1000.0
def srcwin(name,w):
    a,total=acts(name); f,pre=RULES[name]
    s0=(0.0 if f=='rec' else a[f])-pre
    hi=max(0.0,total-0.05-w)
    s0=max(0.0,min(s0,hi)); s1=min(total-0.05,s0+w)
    return s0,s1,total
PLANS={
 'train':('t3',[(16,25,[('deck',9)],1),(25,31,[('swap',6)],1),(31,40,[('session',9)],1),
                (40,47,[('setlog',7)],1),(47,56,[('calendar',9)],1),(56,61,'close',None)],1,61),
 'eat':('t1',[(8,16,[('menu',8)],1),(16,23,[('meal',7)],1),(23,31,[('grocery',8)],1),
              (31,39,[('recipes',2),('recipe',6)],1),(39,48,[('cook',9)],1),(48,53,'close',None)],2,53),
 'community':('t1',[(8,16,[('feed',8)],1),(16,24,[('details',8)],1),(24,32,[('channels',8)],1),
                    (32,40,[('market',8)],1),(40,48,[('listing',8)],1),(48,53,'close',None)],2,53),
 'score':('t3',[(16,28,[('profile',7),('climb',5)],1),(28,38,[('score',10)],1),(38,44,[('habits',6)],1),
                (44,50,[('goal',6)],1),(50,56,[('checkin',6)],1),(56,61,'close',None)],1,61),
 'marketplace':('t3',[(16,24,[('market',8)],1),(24,32,[('listing',8)],1),(32,39,[('listing2',7)],1),
                      (39,46,[('mkt_offer',7)],1),(46,51,[('mkt_cal',5)],1),(51,56,[('mkt_book',5)],1),
                      (56,61,'close',None)],1,61)}
CAPS={'train':5,'eat':5,'community':5,'score':5,'marketplace':6}
def build(name):
    track,plan,lead,endb=PLANS[name]
    m=json.load(open(MEAS[track])); P=m['P']; phi=m['phase_used']
    bt=lambda n: phi+n*P
    b0=plan[0][0]; t0=bt(b0-lead)
    T=bt(endb)-t0
    segs=[]; caps=[]; ci=0
    first=bt(b0)-t0
    segs.append(dict(kind='logo',t0=0.0,t1=round(first,4)))
    rows=[]
    for item in plan:
        a,b,pl,_=item
        if pl=='close':
            segs.append(dict(kind='logo',t0=round(bt(a)-t0,4),t1=round(bt(b)-t0,4),xf=0.2))
            caps.append(dict(png='cap/txt/close.png',t0=round(bt(a)-t0,4),t1=round(T,4),y=300))
            rows.append(('close',bt(a)-t0,bt(b)-t0,None,None,None,None)); continue
        caps.append(dict(png=f'cap/txt/{name}_{ci}.png',t0=round(bt(a)-t0,4),t1=round(bt(b)-t0,4),y=300)); ci+=1
        for (sname,beats) in pl:
            w=beats*P
            s0,s1,total=srcwin(sname,w)
            got=s1-s0
            sp=1.0 if got>=w-1e-6 else got/w   # only ever <=1.0 (slow), never speed up
            segs.append(dict(kind='cap',src=os.path.join(SEG,sname+'.mp4'),s0=round(s0,3),
                             speed=round(sp,3),t0=round(bt(a)-t0,4),t1=round(bt(a+beats)-t0,4),xf=0.2))
            rows.append((sname,bt(a)-t0,bt(a+beats)-t0,s0,s1,total,sp)); a+=beats
    spec=dict(name=name,T=round(T,4),track=f'/home/user/w/in/{track}.m4a',aoff=round(t0,4),
              grid=dict(P=P,t_b0=0.0,bidx0=b0-lead,kb=m['kick_by_beat']),
              segments=segs,captions=caps,env_out=0.5)
    json.dump(spec,open(f'/home/user/w/spec_{name}.json','w'),indent=1)
    print(f'== {name}  track={track}  T={spec["T"]}  aoff={spec["aoff"]}  beat0={b0-lead}')
    for r in rows:
        if r[3] is None: print(f'   {r[0]:<12} {r[1]:6.2f}->{r[2]:6.2f}')
        else: print(f'   {r[0]:<12} {r[1]:6.2f}->{r[2]:6.2f}  src {r[3]:5.2f}->{r[4]:5.2f}/{r[5]:5.2f}  spd {r[6]:.2f}')
if __name__=='__main__':
    for n in (sys.argv[1:] or list(PLANS)): build(n)
```

**The captions** — one new row in `captions.py`'s `SPOTS`, the rest unchanged:

```python
'marketplace':[('COACHES','Find *your* coach.'),('COACHES','Coach of the *week.*'),('COACHES','The *rate card.*'),('COACHES',"See what's *included.*"),('COACHES','Open *to book.*'),('COACHES','Start with a *free intro.*')],
```

**`beat.py`** — the grid measurer `verify5.py` imports (`sys.path.insert(0,'/home/user')`;
it uses `beat.decode` · `beat.SR` · `beat.bandpass` · `beat.energy` · `beat.onset` ·
`beat.grid` · `beat.HOP`). ⚠ **`boot5.sh` did not extract it, and the recipe carried no
copy — so every verification of the slowed spots died on `ModuleNotFoundError: No module
named 'beat'` until it was rewritten from this file's own "The beat grid (measured)"
description.** It is here now and boot5.sh's MAP extracts it. Decode 8 kHz mono →
band-limit → rectified derivative of a 5 ms-smoothed energy envelope → comb search over
110–140 BPM with a 2 ms phase refine. Re-measuring an OUTPUT is what it is for; the
authoritative grids for the three tracks stay the recorded ones above.

```python
import subprocess, numpy as np
SR=8000; HOP=0.005
def decode(path):
    o=subprocess.run(['ffmpeg','-v','error','-i',path,'-ac','1','-ar',str(SR),'-f','f32le','-'],
                     capture_output=True).stdout
    return np.frombuffer(o,dtype=np.float32).astype(np.float64)
def bandpass(x,lo,hi):
    n=len(x); X=np.fft.rfft(x); f=np.fft.rfftfreq(n,1.0/SR)
    X[(f<lo)|(f>hi)]=0
    return np.fft.irfft(X,n)
def energy(x):
    h=int(round(HOP*SR)); n=len(x)//h
    e=np.array([float((x[i*h:(i+1)*h]**2).mean()) for i in range(n)])
    return np.convolve(e,np.ones(3)/3.0,mode='same')
def onset(e):
    d=np.diff(e,prepend=e[0]); d[d<0]=0
    m=d.max()
    return d/m if m>0 else d
def grid(o,bpm_lo=110.0,bpm_hi=140.0):
    n=len(o); dur=n*HOP; best=None
    for bpm in np.arange(bpm_lo,bpm_hi+1e-9,0.05):
        P=60.0/bpm; nb=int(dur/P)
        if nb<8: continue
        for ph in np.arange(0.0,P,0.005):
            idx=np.round((ph+np.arange(nb)*P)/HOP).astype(int)
            idx=idx[(idx>=0)&(idx<n)]
            s=float(o[idx].sum())/max(1,len(idx))
            if best is None or s>best[0]: best=(s,float(bpm),float(P),float(ph))
    if best is None: return dict(bpm=None,P=None,phase=None,score=None)
    s,bpm,P,ph=best
    nb=int(dur/P); bb=None
    for ph2 in np.arange(max(0.0,ph-0.01),min(P,ph+0.01)+1e-9,0.002):
        idx=np.round((ph2+np.arange(nb)*P)/HOP).astype(int); idx=idx[(idx>=0)&(idx<n)]
        v=float(o[idx].sum())/max(1,len(idx))
        if bb is None or v>bb[0]: bb=(v,float(ph2))
    return dict(bpm=round(bpm,2),P=round(P,6),phase=round(bb[1],4),score=round(bb[0],4))
```

**`pw/cap_radio.js`** — The Playwright capture that writes `cap/r3_radio_top.png`.

⚠ **THIS ARTIFACT WAS LISTED AS A SOURCE WITH NO WAY TO MAKE IT — the fourth instance of
the class this file keeps paying for.** `cap/r3_radio_top.png` is read by `meas_wall.py`
and `mk_wall6.py`, and was written by **nothing**: not by the MAP, not by `body5a.js`,
not by `body5b.js`. The v6 "New sources" list records it beside the globe clip and the
repo PNG, but unlike those two it is not fetchable — it is a capture, and the capture was
never recorded. Same shape as the v6 video prompts that cannot be recovered, as `beat.py`
missing from the MAP, and as the `params_v6.json` that `plan6.py` exists to reconstruct.
It is written down here so a rebuilt sandbox can produce it instead of stalling.

It reuses `lib.js`'s own `boot()` / `go()` / `dump()` rather than re-deriving the boot
path, so a change to the app's entry flow is fixed in one place. Reaching Radio is tried
direct first and via the chat tab second, and `dump('radio_probe',true)` records what was
on screen — a MISS then leaves evidence rather than a blank PNG. Measured on the live
site: `tab:"radio"`, `ON AIR · 3,472 · 132 Station BPM · HEART-RATE SYNC · NOT CONNECTED ·
STATION 132 · AWAITING SIGNAL · YOU — —`, written 750×1640.

```javascript
const {chromium}=require('playwright');
const {mk,sleep,UA,INIT}=require('/home/user/pw/lib.js');
(async()=>{
 const b=await chromium.launch({args:['--no-sandbox'],executablePath:'/ms-playwright/chromium-1228/chrome-linux64/chrome'});
 const c=await b.newContext({viewport:{width:375,height:820},deviceScaleFactor:2,userAgent:UA,isMobile:true,hasTouch:true});
 await c.addInitScript(INIT);
 const p=await c.newPage(); const L=mk(p);
 await L.boot('RADIO');
 // Radio lives off the chat/feed tab -> CHANNELS in the v5 tour; try the direct routes first.
 let ok=false;
 for(const re of ['SHAPE RADIO','^RADIO$','\u25b8\u25c2 *RADIO','Shape Radio']){ if(await L.go(re)){ok=true;break;} }
 if(!ok){ await L.tab('chat'); await sleep(2200);
   for(const re of ['CHANNELS','SHAPE RADIO','^RADIO$']){ if(await L.go(re)){ok=true;break;} } }
 await sleep(3000);
 await L.dump('radio_probe',true);
 await p.screenshot({path:'/home/user/cap/r3_radio_top.png'});
 console.log('REACHED',ok);
 await b.close();
})().catch(e=>{console.log('ERR',e.message);process.exit(1);});
```

⚠ **RUN IT BEFORE `meas_wall.py`.** `boot5.sh` writes the file but does not run it; the
capture needs the live site and takes ~25 s. `cd /home/user/pw && node cap_radio.js`.


**`boot5.sh`** — the whole rebuild in one script, because the sandbox is reclaimed on a
roughly 20-minute cycle even with the lease re-armed on every call (it has now been
wiped **six** times). Rebuild is ~2 minutes, npm ~20 s, capture ~4, seg2mp4 ~1,
specs+captions ~40 s, render+upload ~1 per spot — so the work has to be split into
sub-20-minute runs. ⚠ **A `tar czf cap/seg` checkpoint does not work**: a gofile guest
upload returns a download PAGE, not a file URL, so the tar cannot be curled back after
the next wipe. The strategy that does work is one background `runA.sh` that renders,
md5s and **uploads each spot immediately** in order, polled every ~55 s — a wipe then
costs only the spot in flight. `SKIP_DL=1` skips the source downloads when they survived.

```bash
#!/bin/bash
set -e
mkdir -p /home/user/w/in /home/user/w/cap/txt /home/user/w/out /home/user/w/scripts /home/user/pw /home/user/cap/seg
cd /home/user/w
R=/home/user/recipe.md
# ⚠ THE BRANCH IN THIS URL IS LOAD-BEARING, AND IT WAS STALE THROUGH ALL OF v7/v7.1.
# It pointed at claude/shape-marketing-video-4rin96 -- a 2,529-line v6-era copy -- while the MAP below
# names the v7 scripts. Measured: 6 of the 26 MAP keys (plan6.py, plan_a2.py, meas_watch.py, meas_wall.py,
# meas_pins.py, norm6.sh) have NO definition in that copy, so they were never written; and render6.sh,
# verify6.py and mk_watch.py DID resolve there -- as their v6 versions. So the run either died on a
# missing norm6.sh or, patched by hand, silently rendered a v6 cut from v6 scripts while looking correct.
# The MAP was fixed to name the v7 scripts and the URL it reads them from was not: a fix written in one
# place and undone by another, the same shape as the ls -t and --short defects in docs/WORKLOG.md.
# Track the branch this recipe LIVES on; a re-point is one edit, a silent v6 render costs a whole run.
RECIPE_BRANCH=${RECIPE_BRANCH:-claude/shape-radio-launch-cut-18jr67}
[ -f $R ] || curl -sL -o $R https://raw.githubusercontent.com/cperry8800-droid/shape-app/$RECIPE_BRANCH/marketing/shape-radio-launch-cut.md
python3 - <<'PY'
import re,os
L=open('/home/user/recipe.md').read().split('\n')
MAP={'pw/lib.js':'/home/user/pw/lib.js','pw/tour4.js':'/home/user/pw/tour4.js',
 'pw/body5a.js':'/home/user/pw/body5a.js','pw/body5b.js':'/home/user/pw/body5b.js',
 'pw/cap_radio.js':'/home/user/pw/cap_radio.js',
 'seg2mp4.py':'/home/user/w/scripts/seg2mp4.py','captions.py':'/home/user/w/scripts/captions.py',
 'mk_screen5.py':'/home/user/w/scripts/mk_screen5.py','spot.py':'/home/user/w/scripts/spot.py',
 'mkspecs.py':'/home/user/w/scripts/mkspecs.py','mkspecs5.py':'/home/user/w/scripts/mkspecs5.py',
 'verify5.py':'/home/user/w/scripts/verify5.py','beat.py':'/home/user/beat.py',
 # the v6/v7 launch-cut scripts. ⚠ These were MISSING from the MAP through the whole of v6 -- the same
 # class of gap as beat.py, and the reason a rebuilt sandbox could not re-render the launch cut at all.
 'plan6.py':'/home/user/w/scripts/plan6.py','plan_a2.py':'/home/user/w/scripts/plan_a2.py',
 'meas_globe.py':'/home/user/w/scripts/meas_globe.py','meas_watch.py':'/home/user/w/scripts/meas_watch.py',
 'meas_wall.py':'/home/user/w/scripts/meas_wall.py','meas_pins.py':'/home/user/w/scripts/meas_pins.py',
 'mk_watch.py':'/home/user/w/scripts/mk_watch.py','mk_wall6.py':'/home/user/w/scripts/mk_wall6.py',
 'mk_globe.py':'/home/user/w/scripts/mk_globe.py','scanpulse.py':'/home/user/w/scripts/scanpulse.py',
 'norm6.sh':'/home/user/w/scripts/norm6.sh','render6.sh':'/home/user/w/scripts/render6.sh',
 'verify6.py':'/home/user/w/scripts/verify6.py','upload6.sh':'/home/user/w/scripts/upload6.sh'}
def block(i):
    while not L[i].startswith('```'): i+=1
    j=i+1
    while not L[j].startswith('```'): j+=1
    return '\n'.join(L[i+1:j])+'\n'
wrote=set(); got_assets=False
for i,ln in enumerate(L):
    m=re.match(r'^\*\*`([^`]+)`\*\*',ln) or re.match(r'^### (assets\.py)$',ln)
    if not m: continue
    k=m.group(1)
    if k=='assets.py': open('/home/user/w/scripts/assets.py','w').write(block(i)); got_assets=True; continue
    if k in MAP: open(MAP[k],'w').write(block(i)); wrote.add(k)
# the recorded beat grids
GR={'t1':(119.95,0.500208,0.064),'t2':(119.75,0.501044,0.044),'t3':(119.45,0.5023022185,0.030)}
import json
for ln in L:
    m=re.match(r'^- (t\d) \(.*?\): `(.*)`$',ln)
    if not m: continue
    t=m.group(1); kb=[float(x) for x in m.group(2).split()]
    bpm,P,phi=GR[t]
    json.dump(dict(bpm=bpm,P=P,phase_used=phi,first_kick_t=phi,dur=32.023,kick_by_beat=kb),
              open(f'/home/user/w/meas_{t}.json','w'))
# ⚠ A COUNT IS NOT A CHECK, AND THIS LINE PROVED IT. It printed len(os.listdir(scripts)) -- a number that
# still rises when a stale recipe resolves 20 of 26 keys, and that counts leftovers from an earlier run in
# a surviving sandbox. It reported EXTRACT_OK on exactly the failure it existed to catch: through all of
# v7/v7.1 the URL above fetched a v6-era copy, six MAP keys were never written, and three more (render6.sh,
# verify6.py, mk_watch.py) were written as their V6 versions. Assert the SET and name what is missing --
# an unresolved key means the fetched recipe PREDATES that script, so refuse here rather than let norm6.sh
# die three steps later with nothing pointing at the cause. Same for the beat grids: they are parsed out of
# prose by the loop above, so a stale recipe loses them the same silent way.
missing=sorted(set(MAP)-wrote)
grids=sorted(t for t in ('t1','t2','t3') if os.path.exists(f'/home/user/w/meas_{t}.json'))
if missing or not got_assets or len(grids)<3:
    raise SystemExit(
      'EXTRACT_FAIL: %d/%d MAP keys resolved%s; grids=%s\n'
      '  missing: %s\n'
      '  The fetched recipe does not define these. Check RECIPE_BRANCH=%s is the branch this recipe\n'
      '  lives on, and delete a stale /home/user/recipe.md -- it is only fetched when absent.'
      %(len(wrote),len(MAP),'' if got_assets else ' (assets.py MISSING)',grids,
        missing or '(none)',os.environ.get('RECIPE_BRANCH','(unset)')))
print('EXTRACT_OK %d/%d MAP keys + assets.py + grids %s'%(len(wrote),len(MAP),grids))
PY
if [ -z "$SKIP_DL" ]; then
  P=https://d8j0ntlcm91z4.cloudfront.net/user_3E30hta4RMpS2cDML3JnB5dGPnY
  # v7 Scene A is the CLOTHED runner and v7 Scene D is the PINNED globe -- the v6 ids for both are superseded
  # and must not be fetched here. The first cut of this block still pulled the v6 Scene A and fetched neither
  # A2 nor D, so norm6.sh aborted on a missing in/A2.mp4 and -- worse -- a hand-fetched A2 let the run continue
  # with the naked-runner A already in place, silently shipping the exact frame owner note #4 exists to fix.
  curl -sL -o in/A.mp4  $P/hf_20260903_141033_6f01a52f-de85-48ae-a0cd-771fa26afc70.mp4
  curl -sL -o in/A2.mp4 $P/hf_20260903_141033_e815ac55-08d2-497d-8244-5c58e7288dbd.mp4
  curl -sL -o in/B.mp4  $P/hf_20260901_165434_a27526b7-057b-4165-865c-0e9c5c9b46e9.mp4
  curl -sL -o in/C.mp4  $P/hf_20260901_165434_a1d1066e-7837-48c6-81ce-ef849c38d8a2.mp4
  curl -sL -o in/D.mp4  $P/hf_20260903_141033_34ebdcd6-c068-47e5-85ba-39d77708a058.mp4
  # norm6.sh keeps an immutable in/D_src.mp4 so a changed D_SPIN never compounds onto an already-spun clip.
  # A FRESH D.mp4 makes that snapshot stale -- it would spin the OLD globe -- so the fetch invalidates it here.
  # This is the only place D.mp4 is replaced from outside, which is why the invalidation belongs at the fetch.
  rm -f in/D_src.mp4 in/.D_spun
  curl -sL -o in/t3.m4a $P/hf_20260901_195948_814905f0-3558-40b7-a918-04d447a98d58.m4a
  curl -sL -o in/t1.m4a $P/hf_20260901_195948_20d50377-fdc1-45f5-b27c-b6928ba0ae40.m4a
  curl -sL -o in/t2.m4a $P/hf_20260901_195949_e84649d8-0f3a-4aaa-a5fe-182837253bb8.m4a
  G=https://raw.githubusercontent.com/cperry8800-droid/shape-app/main/public
  curl -sL -o in/SHAPE-logo-teal-white.png "$G/SHAPE-logo-teal-white.png"
  curl -sL -o in/radio-wordmark.png "$G/Shape%20radio%20logo%20updated.png"
  F=https://raw.githubusercontent.com/google/fonts/main
  curl -sL -o in/Newsreader.ttf "$F/ofl/newsreader/Newsreader%5Bopsz%2Cwght%5D.ttf"
  curl -sL -o in/NewsreaderIt.ttf "$F/ofl/newsreader/Newsreader-Italic%5Bopsz%2Cwght%5D.ttf"
  curl -sL -o in/JetBrainsMono.ttf "$F/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf"
fi
# captions.py loads F='/home/user/fonts/' with the bracketed upstream filenames — copy, don't rename
mkdir -p /home/user/fonts
cp -f in/JetBrainsMono.ttf "/home/user/fonts/JetBrainsMono[wght].ttf"
cp -f in/Newsreader.ttf    "/home/user/fonts/Newsreader[opsz,wght].ttf"
cp -f in/NewsreaderIt.ttf  "/home/user/fonts/Newsreader-Italic[opsz,wght].ttf"
# B_long: B forward + reversed, then looped once -> 972 frames / 40.5 s
[ -f in/B_long.mp4 ] || { \
 ffmpeg -y -v error -i in/B.mp4 -vf "fps=24,split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1" \
   -an -c:v libx264 -preset veryfast -crf 14 -pix_fmt yuv420p in/B2.mp4 && \
 ffmpeg -y -v error -stream_loop 1 -i in/B2.mp4 -c copy in/B_long.mp4; }
python3 scripts/assets.py
H=$(sed -n '1,18p' /home/user/pw/tour4.js | sed "s#const st={name,dir,n:0#fs.rmSync(dir,{recursive:true,force:true}); fs.mkdirSync(dir,{recursive:true}); const st={name,dir,n:0#")
printf '%s\n' "$H" > /home/user/pw/tour5.js;  cat /home/user/pw/body5a.js >> /home/user/pw/tour5.js
printf '%s\n' "$H" > /home/user/pw/tour5b.js; cat /home/user/pw/body5b.js >> /home/user/pw/tour5b.js
sed -i "s#chromium.launch({args:\['--no-sandbox'\]})#chromium.launch({args:['--no-sandbox'],executablePath:'/ms-playwright/chromium-1228/chrome-linux64/chrome'})#" /home/user/pw/tour5.js /home/user/pw/tour5b.js
sed -i "s#'python3','mk_screen5.py'#'python3','scripts/mk_screen5.py'#" scripts/spot.py
echo BOOT5_OK
```

⚠ **THE PRE-INSTALLED BROWSER IS `chromium-1228`, AND PLAYWRIGHT'S PIN DOES NOT MATCH
IT.** `/ms-playwright` already holds `chromium-1228`, `chromium_headless_shell-1228` and
`ffmpeg-1011` (644 MB) with `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` set — but
playwright 1.49.1 asks for revision 1148 and 1.55.1 asks for 1193, so a bare
`chromium.launch()` dies with *"Executable doesn't exist at
/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell"*. `npx playwright
install` stalls for minutes and is unnecessary; pass
`executablePath:'/ms-playwright/chromium-1228/chrome-linux64/chrome'` instead. Note
`chrome-linux64`, not `chrome-linux` — the first attempt used the wrong directory name.

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
