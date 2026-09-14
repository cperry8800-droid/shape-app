# Shape Radio in the app, three ways — 2026-09-14

**Owner ask:** *"can you do a review of the shape radio page on shape app. Can you give me 3 more
design ideas. Have it be less analog, and more radio futuristic style look"* → *"i want to see
previews of designs"*.

**Previews:** the live concept board — https://claude.ai/code/artifact/59dcada3-eadf-4ddb-8e68-8a5a92845a32 — eight tabs:
**Today · as shipped** (real captures of the production build, signed-out preview), **A · The
Transmitter**, **B · The Lock**, **C · The Booth**, **D · The Signal Field**, **E · The Waterfall**
(each rendered phone-sized and animated on a simulated signal, with a strap toggle so the no-strap
state can be seen), **Carry-over** (every element on today's page and where it lives in each option)
and **Pick**. D and E were added the same day on the owner's *"can you give me 2 more design
options"* (§4b).

**Recommended: B · The Lock** — with A's tuner as its channel strip and C's light rig as its
light-effects setting. §5.

**Records only.** No code changed, no migration, no PR beyond the records. Four rulings are needed
before a build (§6).

## 1. What the page is today (read from the code, measured in the browser)

`BSRadioScreen` (`mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx:1278`), reached from Home's
Now Playing bar (`iosAppBroadsheetClient.jsx:4546` → `goRadio`, `:559`) and from Train, Eat and Me.
Rendered from the production `/m/` build at 375×812, top to bottom:

- **Masthead** — the SHAPE mark + `VOL. 1 · NO. 1` (`:1410`), the search and avatar corners (house
  ruling 2026-08-01), `← BACK`, the centred `SECTION · MUSIC` eyebrow (`:1425`), the 292-px
  wordmark PNG (`:690`, a 1647×116 image). **197 px before the station appears** — a quarter of the
  first screen — and none of it is about the station.
- **Hero** — `● ON AIR · 3,472`, an 88-px three-ring dial reading `132 / Station BPM`,
  `▍ NOW PLAYING`, the title and artist, a 17-bar EQ, a scrubber, `❚❚ PAUSE` + `■`, the
  `+ 0 · − 0 · ❝ 0` social row (real track only, signed-in to write).
- **Heart-rate sync** — `STATION 132` · a needle track · `YOU — —`, `CONNECT MONITOR`.
- **Nora · DJ preview** — a `○ WATCH NORA (PREVIEW)` key (WebGL VRM stage).
- **Channel** — one row: `LIVE · 24/7 / Shape Radio Station / LIVE STATION - 132 BPM - 3,472
  LISTENING NOW` with a 5-bar EQ.
- **Shape Sets** — `LIVE FROM CLUB SHAPE / Shape Sets. / WHAT SHAPE RADIO IS · CONCERT SERIES ·
  COACH PLAYLISTS / ABOUT →`, opening the Sets page (the Club Shape venue shot, `COMING SOON`,
  *Schedule lands with the first broadcast*).

**Measured:** 1,195 px tall tuned in, 1,126 muted; 25 animated nodes; the scrubber reads
`0:00 / -0:00` in both states; the page is theme-adaptive (`:1380` derives its palette from
`t.isLight`) although the comment at `:1414` calls it "fixed-dark on the venue portrait". The
captures rendered in the real display face — Saira is bundled locally (`mobile-app/src/fonts.css:516`),
so the container's blocked font hosts did not touch them.

**The data behind it:** `/api/radio/now-playing` returns `{ title, artist, isNora }` and nothing
else (`src/lib/radio/provider.ts:2`); production has no `radio_station` row, so it answers the mock
provider's `Tempo Lift / Shape Radio` (`mock.ts`). `ShapeRadioLive.analyser()` is a real
`AnalyserNode` at fftSize 512 over the `<audio>` element, wired `crossOrigin='anonymous'`
(`shapeBackend.js:8474`, `:8565-8571`) — and its only consumer is the Nora stage. The heart-rate
monitor client is real Bluetooth LE (`services/hrm.js`, the standard 0x180D profile).

## 2. Findings

1. **Every number on the first screen was typed in.** `BS_LIVE_STATION.bpm = 132` and
   `.listeners = 3472` (`:123-124`) are literals. The count is shown twice on the page and once on
   Home; the BPM three times. Neither is in the payload, and no route reports either.
2. **The scrubber is a dead instrument, twice over.** It computes `elapsed = total × 0.46`
   (`:1496`) over a length the payload never carries, so it renders `0:00 / -0:00` with the dot at
   0 % whether the station is playing or not — captured. And a scrubber on a non-interactive
   stream promises a seek the licence forbids (prohibition 4 in the module's own header).
3. **Everything that moves, moves on a timer.** All 25 animated nodes are CSS keyframes: 22 EQ
   bars on four sine loops (`bs-eq-*`, `:626`), the stage sweep, the blink, the beat ring at
   60/132 s. `iosAppReactive.jsx:3-4` says it outright — *"With real audio we'd use Web Audio API +
   AnalyserNode; here we fake it with a 132 BPM clock"* — while the analyser exists and is idle.
4. **"Connect monitor" with no strap fabricates a reading and then locks it.** No device in range
   falls to `demoHr = 114` (`:1295`, `:1341`); the card reads `FREE · −18 BPM · YOU 114`; `Match my
   BPM` eases the invented figure to 132 until it reads `IN SYNC · 0 BPM · 132 / 132`. Captured with
   nothing attached. The marketing recipe flagged this on 2026-09-02; it is still live.
5. **A channel list of one, already selected.** The CHANNEL section is a single row carrying the
   active spine (`:1707-1714`) — a list with no alternative is a label wearing a control — and its
   meta line uses hyphens where the page uses middle dots (`:1715`).
6. **"Live from Club Shape" over a series whose own page says "Coming soon".** The Sets section's
   eyebrow (`:1744`) is unconditional; the schedule line beside it (`BSSetsLine`) correctly gates
   `LIVE` on `sets.real`, and the Sets page reads *Schedule lands with the first broadcast*.
7. **A quarter of the first screen is newspaper chrome** (§1). The corners and the back row are
   house rulings and stay; `Vol. 1 · No. 1` and `Section · Music` are the analog part.
8. **The Home widget is a print texture** — an 8-px halftone dot field (`:921`) under the aurora,
   on the one surface that is supposed to say "live".
9. **Dead code in the render:** three `{false && …}` blocks (`:1708`, `:1719`, `:1752`), the
   `onLive = true` / `playlist = null` constants, and `r.PLAYLISTS`, which the context never
   provides.
10. **The module disagrees with itself about what the page is** — "fixed-dark on the venue
    portrait" at `:1414`, theme-adaptive at `:1380`, and `:1250` explaining exactly that. Minor,
    but it is the comment the next reader edits.

**What is right and stays in every concept:** the licensing boundary at the top of the module (no
selection, no replay, no advance list, no seek); the honest `—` when nothing real is playing
(`radioNowPlayingDisplay`); the schedule line's `LIVE` gate; the social row's server counts; the
wordmark; the analyser the Nora stage already built; the corners and the back row.

## 3. What "analog" is on this page, and what "radio-futuristic" has to mean for Shape

**Analog, measured:** a newspaper masthead (volume line, section eyebrow), the editorial
italic-with-accent-period title (*Shape Sets.*), 22 monochrome bars imitating a cassette deck's
level meters on a sine loop, a halftone dot field, cream hairlines on black, and readings that are
constants — a dial that says 132 the way a printed page says it.

**Radio-futuristic, for this product, is not knobs and neon.** It is three things the app can
actually do: **a signal you can see** (the spectrum or waveform off the real audio), **readings that
are readings** (the dot-matrix scoreboard face the homepage already adopted — *"every measured
figure reads like a reading"*, `docs/REVIEW-2026-09-10-index-page.md:278`), and **the lock** — the
member's heart and the station's beat, which is the feature no other radio has and which the launch
cut already draws as an orb inside a ring (`marketing/shape-radio-launch-cut.md:2053`,
`watchface()`). A rotary dial, a VU needle over a typed number, a neon grid: all analog again, only
in costume.

**The backbone every concept shares:**

- The visualiser reads `ShapeRadioLive.analyser()` — one shared hook, the Nora stage a second
  consumer. Nothing on a timer.
- Tempo is **measured, not typed** — an onset detector over the low band (the launch cut's
  `beat.py` method: onset envelope, comb search, split-half agreement) gives a live figure labelled
  *measured*; until it settles, "—". The sync compares against it.
- **No listener count** until a provider reports one. **No scrubber.** The only clock is the
  session's own.
- **No strap, no number** — the demo 114 and the easing go; the key says *Connect monitor*.
- **Doto** for every reading, **Saira** (the app's display face, `DISPLAY_BS`) for every word; the
  wordmark stays at 12 px as a nameplate; `Vol. 1 · No. 1` and `Section · Music` go; the corners
  and the back row stay.
- The social row and the comments sheet are unchanged; the Sets page is unchanged.

## 4. The three options

| | A · The Transmitter | B · The Lock | C · The Booth |
|---|---|---|---|
| **Thesis** | A broadcast console: every figure is a reading off an instrument, and the instruments are real. | The one thing only Shape can do becomes the page: your heart and the station's beat, locking in front of you — a heads-up display, one colour, thin lines. | The page is the venue: Club Shape, the light rig, the hologram at the booth, the record floating over the floor on a pane of glass. |
| **First screen** | Nameplate · the tuner band (Live · Sets · Nora on one ruler, channels only) · a full-width spectrum with peak-hold, the lamp and the session clock · the track · three readouts (Tempo measured · Signal from the audio element's buffer · Reactions from the server) · a round Pause key · Pulse lock (You · a 12-segment meter · Station). | The orb inside the ring, four telemetry corners (Station · You · On air · Signal) · the horizon (the live waveform) · the track · a pill deck · one wide Match key · the channel strip. | The Sets marquee · the glass panel (On air + session clock, the Rig chip, the track, a lit spectrum edge, a Tempo · You · Δ ticker) · two beams from the booth · Nora's hologram · glass keys. |
| **What moves** | The spectrum and its peaks; the lamp on the detected beat; the meter as Δ closes. | The ring on the beat, the orb on `shape:hrm`; at |Δ| ≤ 4 the envelopes crossfade and the rim flashes once (the film's face); a radar sweep. | Beam intensity on the bass band; the hologram's bob and arm on the kick (the app's own `RadioHologramDJ`, driven by the analyser instead of its clock); the station's beam teal, yours amber, converging as Δ closes and merging when locked. |
| **What reads "—"** | Tempo until the detector settles; You with no strap (meter dark, key says Connect); the schedule strip when nothing is booked. | No strap → no orb, a dashed outline reading Connect; the one state word (Locked) only after the lock — before it the colour is the state. | No strap → one beam, no You on the ticker; an empty schedule → the marquee says so; no crowd count, ever. |
| **Borrows** | Doto (the homepage ruling), the app's cream → amber → teal ladder, the venue's graphite. | The watch face in the launch cut (orb r 46, ring r 78, exactly one word, envelopes blended never phases); BSPlate's corner bracket, enlarged to the frame. | `club-shape-bg.jpg`, `RadioHologramDJ` + the `NoraStage` analyser wiring, the Sets page's glass grammar (blur 14, the teal → rust top line). |
| **Cost** | Medium — a ruler, a spectrum canvas, a segment meter, an LED strip; every data path exists. | Medium — one canvas (the orb), the HUD frame, the deck; `hrStage` already exists and loses its demo branch. | Medium-large — the rig canvas, re-driving the hologram, a compressed backdrop (the 402 KB JPEG is too heavy for a page that stays open). |
| **Risk** | Reads as a dashboard if readouts multiply; three is the cap. | A member who never pairs a strap sees a ring and an outline where the feature would be; the outline has to sell the pairing. | GPU cost on older phones (blur + additive beams + SVG ghosts); Nora is a placeholder model; a venue that reads as a stage sets an expectation the mock provider cannot meet yet. |

### 4b. Two more, added the same day

| | D · The Signal Field | E · The Waterfall |
|---|---|---|
| **Thesis** | One beam, two sources: the station's beat on one axis, your heart on the other — an oscilloscope figure that drifts while they differ and stands still the moment they agree. | The most radio image there is: the station's spectrum flowing down the screen in time, the way a software-defined receiver shows a band. |
| **First screen** | A full-bleed dot field whose brightness is the live spectrum (bass at the centre) · the Lissajous figure (the measured beat drives the horizontal sweep, the strap the vertical) · a telemetry rail down the left (Tempo · You · On air · Signal) and the lock state at the right · Now · the track · the deck · one Match key · the channel strip as underlined tabs. | A status rail (On air · session clock · Tempo · Signal) · the waterfall as the ground (64 log-spaced bands across, one row per frame down, black → teal → cream, a hertz axis) · the channel strip · the Now band over a dark strip · the lock as a readout line (You · a bar that fills as the rates close · Station) · the deck · one Match key. |
| **What moves** | Every dot on its spectrum bin; the beam's brightness on the level; the figure precesses while the two rates differ and closes into a standing ellipse when they match — how two frequencies have always been compared on a scope, so the lock is physics rather than an emblem. | Every row is one frame of the analyser, so the screen is a ten-second memory of the stream and nothing on it is generated; the rail's lamp on the detected beat; the lock bar on the strap. On a quiet passage the fall goes dark, which is true. |
| **What reads "—"** | No strap → the vertical axis has no source, the figure collapses to a flat sweep and a line under it says the figure needs your pulse; Tempo until settled; no count, no scrubber. | You without a strap ("—", an empty bar, the key says Connect monitor); Tempo until settled; no count, no seek; the axis is labelled in hertz from the sample rate. |
| **Borrows** | The analyser's time-domain and frequency data; the launch cut's *envelopes blended, never phases*; Doto; the app's state ladder; the Lissajous itself, a century of test equipment. | The analyser (the node the Nora stage reads); Doto; the state ladder; the waterfall convention every software-defined radio uses. |
| **Cost** | Medium — one canvas (field + figure), a rail, a deck. | Small-medium — one image buffer scrolled a row per frame, a rail, a band, a deck. The cheapest of the five. |
| **Risk** | A standing ellipse is a subtle moment; the state word and the colour carry it, and the field must stay quiet behind the track. | Dense: the header and the deck need scrims; the lock is a readout rather than the page, so it sells the feature less than B or D. |

**On the pick, with five on the board:** B stays recommended. **D** is the alternative if the lock
should be shown as physics rather than as an emblem — the most rigorous of the five and the most
abstract. **E** is the strongest challenger on the brief's own words: the one image that says
*radio* and *digital* at once, and the cheapest build — at the cost of making the stream the hero
and the lock a readout.

**The board's phones are previews, not builds.** The signal is simulated (a deterministic
128-BPM generator), the strap is simulated (free → matching → locked on a loop, or off via the
toggle), the session clock starts at 14:22, and the track is the mock provider's. Every one of
those becomes a real reading in the build or reads "—".

## 5. The pick

**B · The Lock.** Four reasons, in order: it makes the one feature no other radio app has the
page rather than a 147-px card under a scrubber that cannot move; it is the film's own language,
so the app would finally show what the launch cut shows; it is honest by construction (no strap →
no orb, no detector → no tempo, nothing invents a figure to fill the space); and it is the
smallest build — one canvas, a frame, a deck, over a state machine that already exists.

**A instead** if the page should read as equipment rather than as an experience — it is the most
literal "instrument" answer and the best home for a fourth reading later. **C instead** if the
venue outranks the member's own body — the most theatrical, the most GPU, and a stage the mock
provider cannot fill yet. A's tuner and C's rig both fold into B (the channel strip; the
light-effects setting), which is why the recommendation is B *with* them rather than B alone.

## 6. Rulings the build needs

1. **Doto in the app** — on Radio only (a venue screen with its own palette already), or app-wide
   as the homepage adopted it?
2. **The listener count** — drop it until the stream provider reports one, or keep a labelled
   example the way the homepage labels its examples?
3. **Tempo** — measure it in the browser (an onset detector; "—" below a confidence floor), or add
   a declared BPM to the station config and label it *declared*?
4. **The light-effects modes** — stay in Settings, or move onto the page (C's Rig chip) whichever
   concept wins?

## 7. Build order for B

1. **The analyser hook** — one subscription shared with the Nora stage (`ShapeRadioLive.analyser()`),
   a tempo detector beside it with a confidence gate. ⚠ The analyser carries data only when the
   provider stream sends `Access-Control-Allow-Origin`; the audio element is already
   `crossOrigin='anonymous'` and the backend comment calls that "part of the stream contract" —
   confirm it on the real provider before the visualiser is promised.
2. **The orb** — a canvas component fed by `shape:hrm` and the beat clock; the crossfade and the
   rim flash; the outline state. Envelopes blended, never phases.
3. **The front** — the HUD frame, the four telemetry corners, the horizon, the deck; retire the
   volume line, the section eyebrow, the scrubber and the listener literal; the demo 114 goes.
4. **The channel strip** — Live · Sets · Nora; the Sets panel keeps the schedule line's gate; Nora
   fills the orb.
5. **i18n** — new keys across all 13 locales, and the guards: no listener literal reaches the
   page; "—" with no strap; no scrubber in the tree; the CSS-timer EQ gone from the radio screen.

No migration. No route change — the backbone reads what the app already has.

## 8. Method

The production build (`VITE_BASE=/m/ npm run build` on `main` = `2d49f60`) served locally and
driven in Chromium at 375×812 @2× through the real entry flow — language → Continue → Preview the
app first → Step inside → dismiss the demo banner — with `/api/radio/now-playing` fulfilled with
the mock provider's payload and `/api/radio/station` answering 401 as it does signed out. Captured:
Home with the muted bar, the Radio page muted and tuned in at full height, the heart-rate card
through Connect monitor → Match my BPM with no device, and the Sets page. Geometry, animated-node
counts and the scrubber readouts were read from the DOM, not the pictures.

Two harness defects, both ones this repo already records: the init script's observer re-added the
native class on every mutation (and `classList.add` queues an attribute record even when nothing
changes), so the page spun in its own observer until the add was guarded on `contains`; and the
language picker needs its CONTINUE tap after the language, which the first run skipped.

The board was rendered once locally with the four families served from local font files (the
container cannot reach Google Fonts, and a render in fallback faces reviews the wrong typeface — the
2026-09-10 lesson), then published; the live page is the review surface.
