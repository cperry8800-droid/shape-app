# Review · 2026-09-15 · The website's Radio page, six ways

**Status: not built.** Records only — a review with live previews; the spec comes after the pick.
Owner: *"new design for shape radio page on website … similar to the app page … speaking and in sync
with each other … 5 designs … edgy, new, modern, looking like an advanced radio station … moving
graphics that sync to each song that is playing"*, then *"also improve look and design of these boxes
and radio logo"* with a screenshot of the nav's Get started button and Radio chip; then, on the board,
*"can you combine the wall and the cloud? maybe do both and have them alternate? what do you think?"* —
answered as a sixth fold, **F · The Wall and the Cloud**, composed rather than alternated (§2, §5).

**The board:** https://claude.ai/artifact/WWtGRXQPQtE6C3u7u4BgpP — eleven tabs: **Today · as shipped**
(the marketing hero and Shape Sets card rendered from `radio.jsx`'s own source over the page's own
photo, and the `/radio.html` player from its own markup and CSS with its idle rings running the page's
own code), **A · The Desk**, **B · The Waterfall**, **C · The Cloud**, **D · The Wall**, **E · The Halo**,
**F · The Wall and the Cloud** (each fold live, with a state row — on air · off air · no signal data ·
signed out — and a Next track button; F adds a Hand-over row — on the drop · per track · both, always),
**Nav** (the two boxes and the Radio mark, shipped values beside three treatments each), **In sync**,
**Backbone**, **Pick**.

⚠ **THE STATION ON THE BOARD IS SIMULATED AND SAYS SO ON EVERY FOLD.** Nothing is broadcasting
(`public.radio_station` has no row — re-recorded on 2026-09-15). The board synthesises a deterministic
128-BPM signal (no `Math.random`), and every reading on it is then *measured* from that signal by the
app's own detector: the tempo reads "—" until `createTempoDetector` settles and then **128 BPM ·
measured**, the rail's five bars are `railBarsLit(railRms(bins))`, the counter steps on the detector's
own `step`. **The board imports `radioSignalField.mjs` and `radioTempo.mjs` as supporting files** and
its masthead reports which geometry it is running; the inline copies are the fallback and were not
needed (measured: *"the app's own modules, imported"*).

⚠ **THE APP'S PREVIEW RULING MOVED WHILE THIS BOARD WAS OPEN, AND THE BOARD FOLLOWS IT.** #2095
(merged 2026-09-15, after the first publish) has the app draw a **labelled example station for a
previewing visitor**: `previewBins` over a frame that carried nothing, gated by `previewSimOn`, with the
rail reading **Preview · Example signal** in place of the On air claim rather than contradicting it one
line below. The board had that exact contradiction — a blinking ● On air over *Simulated station* — so on
the simulated state every fold's rail now reads **Preview** with no dot and the label line reads *Example
signal · simulated station · 128 BPM*. The module copies the board imports are `67df880`'s bytes (the
diff appends the preview station; nothing else in it touches the website's Radio pages).

Measured on `main` = `9e4a175`; the board's module copies and the #2095 reading above are from `67df880`.

## 1 · What is there today

Two pages for one station, and both perform without a signal.

- **`public/newdesign/Radio.html` + `radio.jsx`** (the marketing page, linked from the nav's Radio
  chip). `RadioPage` renders Header · `RadioHero` · `RadioShapeSets` · Footer. **Five of its eight
  sections are dead code**: `RadioStations`, `RadioShows`, `RadioPitch`, `RadioCoachPlaylists` and
  `RadioInClientApp` are defined and never mounted; the hero's "Browse stations" links to `#stations`,
  which is not on the page; the unrendered `STATIONS` array carries typed BPMs and listener counts
  (*1,284 listening*), one render call from the page; the unrendered pitch promises downloads ("up to
  20 hours") that do not exist.
- **The hero fabricates.** Forty-eight bar heights are `Math.random()` at render, under a scrubber
  reading *28:14 / 48:30* on a stream with no position, under "◉ Live" and "One live channel". The
  Shape Sets card pulses "● Live from Club Shape" unconditionally over COMING SOON.
- **`public/radio.html`** (the player the hero's Tune in leaves for, 827 lines, Inter, `#2DD4BF`).
  Fourteen canvas rings breathe on a synthetic sine when paused (*"so the canvas keeps moving"*);
  *Track BPM* is `currentBpm = 120`; a **Demo HR** slider fabricates a heart rate and the badge reads
  *"Locked — your pace is the song"* from it. The app deleted its own `demoHr` and `BSBeatRing` for
  exactly this on 09-14.
- **Now playing.** `/api/radio/now-playing` falls through to the mock provider whenever
  `radio_station` has no row and answers *"Tempo Lift · Shape Radio"*; the player writes that over its
  own *Coming soon* the moment `startNowPlayingPoll()` runs (it runs on every play path). A route
  ruling, not a design.
- **Three type systems and three teals.** The page: Fraunces · Space Grotesk · JetBrains Mono with
  `#0ac5a8` / `#2ee0c4`. The player: Inter with `#2DD4BF`. The homepage and the app: Anybody · Doto ·
  Schibsted with the app's pair `#34d6c5` / `#0a8f87`; the app's Radio readings are Doto since 09-14.
- **The photo.** `radio background upscale.jpg` is 3640×2047 and **3,146,843 bytes**, fixed behind the
  whole page with a brightness filter; the board's copy is 200,205 bytes at 1600. The app's ruling for
  its own Radio page is that the field is the atmosphere.
- **The nav pair.** `pageShell.jsx:996` draws Get started at 34px, radius 5, `#2ee0c4`, Schibsted 13/600;
  `RadioWordmark` draws the chip at 34px, radius 5, cream at 78%, Anybody wdth 150 12px, the mark at
  9×11. The homepage's own bar draws its buttons at radius 6 in `#34d6c5`.

## 2 · The six options

All six carry the app's instrument chrome verbatim — the wordmark, the mode label *Listening · the
station*, the rail (● On air · the session clock | Signal · five bars | Tempo), the Now block, the deck
(▶ Tune in / ❚❚ Pause · Stop; *Sign in to listen* with the key disabled when signed out), the strip
Live · Shape Sets · Nora — laid out for a desktop. Only the **field** differs.

- **A · The Desk.** The app's Signal Field, widescreen: the dot field as the ground at its rest alpha
  (the 09-15 fix), the 32-band mirrored spectrum with caps and a reflection, the four-beat counter.
  Per song: a seed from title + artist picks the field's lattice (square · hex · radial) and colour
  temperature; a change of track sweeps a line across the baseline. The smallest build.
- **B · The Waterfall.** Every spectrum frame becomes one row and scrolls down: ~10 s of the broadcast,
  64 bands across, intensity in the track's palette, the current frame as a bright trace at the head.
  A change of track is a hairline with the title at it: the station's log. The app's own review named
  a waterfall as the strongest challenger; taking it on the web lets the app follow.
- **C · The Cloud.** Nine hundred dots in three dimensions in one of the homepage's five formations
  (sphere, two rings, ECG, dial, the mark), each lit by its band, the cloud breathing on the kick
  through `fieldK`, slow turn, cursor parallax; the seed picks the formation and a change of track
  morphs one into the next over 1.5 s. Canvas 2D; no WebGL.
- **D · The Wall.** Club Shape's LED wall: a 16px tile grid, every column a meter for its band, the
  wordmark burnt through the tiles as a mask, the kick flooding the floor rows, a two-tone program per
  track. The loudest; reduced motion holds the tiles at their base tone.
- **E · The Halo.** Sixty-four spokes around a dial, mirrored, turning slowly; the measured kick pulses
  the outer ring; the four-beat counter is the inner ring; the tempo in Doto at the centre. The old
  player's rings done honestly.
- **F · The Wall and the Cloud.** D and C on one canvas rather than in turns: the tile wall is the ground
  of the page and the point cloud forms in front of it, and the song decides which leads. **On the drop**
  (the default): the wall leads while the kick is present in the four low bins the detector reads — a
  peak-held envelope with a ~1 s release and a hysteresis (on above 0.32, off below 0.12), so one quiet
  bar cannot flip it — and the cloud leads when it is not. The tiles carry the programme and the wordmark
  burns through them while the cloud sits back as embers; then the wall dims to the venue before doors
  and the cloud comes forward, lit by the bands. **Per track**: the seed's bit parity decides for the
  whole song, so the same song leads the same way on every device (the demo list happens to alternate
  wall · cloud · wall · cloud · wall). **Both, always**: the flat middle, on the board for comparison.
  The hand-over is an eased crossfade (τ 0.4 s, on the clock rather than per frame, so reduced motion
  answers on the same timescale); the page never changes identity, only which of its two lights is up.
  With no signal data the seed decides, so the song keeps an identity. The fold's own simulated station
  sits its kick out for four bars in every sixteen so the hand-over can be seen. The heaviest fold on
  the board; two renderers, one rule.

**Per-song sync, the mechanism (Backbone 04):** the analyser at 60 fps (the picture is the audio); the
measured tempo (the kick envelope drives the breath); a deterministic seed from the track's title and
artist (each song's own program, the same every play, on both surfaces); the change of track as an
event (a sweep, a log line, a morph, a turn). Off air every field rests; a stream without CORS headers
reads *No signal data from the channel*; nothing is seeded from a typed BPM.

**Why composed and not alternating — the owner's question.** Two whole fields taking turns per song is
two pages at one address: a visitor who arrives on a wall song and one who arrives on a cloud song each
learn a different page, and every change of track is a change of identity. Composed, the wall is the
room and the cloud is the light in it — both are always on screen and the music sets the balance, which
is what a venue's lighting does. The hand-over is read off the analyser, never off a section map (the
same rule as the tempo), and the one thing it cannot hide is that the detector reads "—" through a
breakdown, because the kick bins are its evidence, and re-settles a few seconds after the kick returns.
That is the app's own behaviour on a real breakdown, kept on the fold rather than smoothed over.

## 3 · In sync — the app's Radio and the website's, element by element

Same wordmark asset · same mode and rail words (`radio.json` defaults verbatim, the #2095 Preview · Example
signal pair included) · the same preview-station rule for a signed-out visitor (`previewSimOn` /
`previewBins`, one file) · same five-bar meter
(`railBarsLit(railRms(bins))`) · same geometry and detector (**import the app's `.mjs` files, the
`noraSets.mjs` precedent — never port**) · the brief's §7 honest-states table on both · the same
now-playing route and 15 s poll · the same deck key logic (`bsRadioTransportKey`'s four answers) · the
same strip · Nora through `noraHologram.mjs` on both · Shape Sets through `noraSets.mjs` · the same
per-song seed (new on both). **Not synced, by design: the session clock** — a clock is a fact about one
device's playback. **Not on the web: heart-rate matching** (Web Bluetooth is a separate ruling).

## 4 · The nav boxes and the mark

- **N1 · The chamfered pair** — 36px, the 8px cut, the app's teal, the chip in Doto with the mark at
  11×13. **N2 · The live chip** — the rail's five bars in the chip, lit only while the Radio page is
  playing (the honest "on air" the nav lost on 09-11), dim everywhere else. **N3 · The wordmark chip** —
  the lockup at 11px behind a 2px teal spine.
- **L1 · The Anybody lockup** — SHAPE ▸◂ RADIO in the site's display face at width 150, the mark
  untouched; one file to replace and the nav, the fold and the app carry one wordmark. **L2 · The
  signal mark** — two arcs leave the cream triangle: a transmitter. **L3 · The matrix mark** — the two
  triangles built from the Signal Field's own dots, RADIO in Doto.
- **Recommended: N1 with L1.** N2's meter is worth adding where it can be measured.

## 5 · Pick

**F · The Wall and the Cloud, hand-over on the drop; A if "like the app" outranks "a station".** The
owner's own lean — *"combine the wall and the cloud"* — moved the pick from A to F, and F answers the
brief harder than A does: edgy, new, an advanced station, moving graphics that sync to each song. The
wall is the launch cut's own wall, the cloud is the homepage's own drawing, and the song picks the
programme, the formation and which of the two leads. In sync where it counts: the same two modules, the
same measured tempo, the same seed, the same change-of-track event; the app keeps the Signal Field on
the phone and the website is the big screen. **Compose, do not alternate** (§2). **The cost is stated:**
the heaviest fold on the board and the loudest half the time; two renderers and one rule; reduced motion
holds both still; the tempo reads "—" through a breakdown.

**The previous pick, kept for its reasoning — A · The Desk, with B's log line.** "Similar to the app"
was the first ask, and A is the app: the same module draws both surfaces, so the phone and the site
cannot disagree about what the station is doing. It still moves with the song (the lattice, the
temperature, the counter, the sweep), and it is the smallest build: the app's canvas component and its
two modules, a desktop layout, the inline gate, and the below-fold sections that already exist. It is
the fallback if F's cost outranks the look. **Other fallbacks:** D alone is the venue without the
drawing (the launch-week look); C alone is the drawing without the venue (the homepage listening); B if
"an advanced radio station" outranks everything else, and it is the cheapest to draw; E if the page must
work at phone width first.

## 6 · Owner rulings needed before a build

| Question | Default if unruled | Why |
|---|---|---|
| F's hand-over: on the drop, per track, or both at once? | On the drop; per track when the channel sends no signal data | The drop is measured off the analyser; a section map would be typed in |
| One page: does `/radio.html` retire into `Radio.html`? | Yes; a redirect stays | Two pages for one station is the largest gap between the web and the app |
| A signed-out visitor: what do they see? | **Settled by #2095, in the app:** a labelled example station — the rail reads Preview · Example signal in place of the On air claim; the website takes the same rule (`previewSimOn` / `previewBins`) and the same two strings, and the seed gives the example a song | The owner's ruling on 09-15: show what the page looks like for someone previewing it. The label is what makes it allowed. ⚠ This row read the opposite until #2095 merged, later the same day |
| Does now-playing answer nulls when no station is configured? | Yes | Both surfaces print the mock's track today |
| Does the app adopt the same per-song seed? | Yes, in a later PR | Otherwise a song has one look on the web and none in the app |
| Web Bluetooth for a strap on the desktop? | No; Listening only on the web | Chrome only, and a second build of the matching state |
| The rail's "On air" with no station? | Off air until a stream starts, on both surfaces; the previewing visitor's half is settled (Preview, #2095) | The app's unconditional chip for a member with no station is still an unlabelled claim |
| Which field, and which nav pair and mark? | F on the drop; N1 + L1 | The pick above |

## 7 · Not a ruling — lands with any pick

The photo retires; the dead sections and the random bars go; the font link moves to the new system; the
teal becomes the app's pair; the player's demo slider and typed BPM are deleted with the page they live
on; the nav's two radii become one cut.

## 8 · How it was verified, and what it was not

- The board rendered in Chromium with the six faces served locally (Google Fonts is blocked here) and
  the Anybody width axis proven to move (SHAPE at wdth 50 = 43px, at 150 = 203px). **Zero page errors;
  zero horizontal overflow at 1280 and 400 on every tab** (re-rendered with F); the modules **imported**
  (the masthead reports it); on every fold the tempo read **128 BPM · measured** within 9 s of tune-in
  (F is polled rather than waited for, because its tab can open mid-breakdown: 8.4 s), the clock
  ticked, the counter stepped; off air the key read *Tune in* and the field rested; signed out the key
  was disabled with *Sign in to listen* under it; the smallest control on a fold measured 36px.
- **F, driven rather than eyeballed.** On the drop: the wall led at tune-in (`wl` 1.00, the
  label *Listening · the wall leads*), handed to the cloud 17.8 s later when the simulated
  station's kick sat out (`wl` 0.02, *Listening · the cloud leads*), and back to the wall
  5.5 s after that when it returned. The tempo read **128 BPM** as the
  breakdown began (inside the detector's four-second hold) and **—** as the kick
  came back — the hold had expired, and the reading re-settled within the next few seconds
  (128 BPM by the time the *both* state was read). Per track: *Listening · the wall leads* on one song and
  *Listening · the cloud leads* after Next track, the seed's parity flipping the lead. Both, always: `wl` 0.50,
  *Listening · wall and cloud*. The simulated rail read *Preview · 1:07* — Preview, not
  On air — with *Example signal · simulated station · 128 BPM · a breakdown every 16 bars* under it.
- **Found on the re-render and fixed on the board, not only on F.** At 400px the mode label, right-aligned
  beside the wordmark, overlapped it — by ~38px on every fold with *Listening · the station* and by 61px
  with F's longer labels (measured off the rects: the mark ended at 245px, the label began at 184px). On
  a phone the label now sits under the wordmark, and the geometry was re-measured at 400 · 360 · 320 on
  A and F: label below the mark, above the rail, and the example-signal line inside the gutter.
- **And a second one, from the first publish, that the direct probe could not see.** The Nav tab reported
  a 487px scroll width at 400 in the harness and 400 in a hand-written probe — because the probe served
  fallback fonts, under which the wordmark chip wrapped to a second row, while the real faces let it sit
  on the first at x 185. Its chamfer frame is an `<svg>` with no size, and a replaced element keeps its
  intrinsic 300×150 box under `inset:0`, so the frame ran 87px past the viewport. Sized explicitly;
  re-measured at 400 on every tab: no overflow. *An instrument in the wrong typeface measures the wrong
  layout* — the 2026-09-10 lesson, arriving through a probe this time rather than a review.
- The Today tab is `renderToStaticMarkup` over `radio.jsx`'s own `RadioHero` and `RadioShapeSets`
  (the Sets card's reveal wrapper ships at opacity 0 until an observer fires; it is shown revealed) and
  the player's own markup and CSS scoped under one class, its idle rings running the page's own
  `drawViz` idle branch. The player's hidden Nora stage is omitted.
- **Not driven:** the shipped pages themselves (React and Babel from unpkg with SRI; three.js from
  esm.sh — both blocked here), and no real stream: the CORS contract on the real stream is unverifiable
  until the provider is real, which is why the no-signal state exists on every fold.
- **No on-account pass, and none possible here:** nothing on the board signs in or plays audio. And
  F's breakdown is the simulation's own (four bars in sixteen, typed in so the hand-over can be seen);
  how often a real station hands over, and how a real breakdown's low bins decay, is a measurement that
  needs a real stream.
