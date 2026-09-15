# Review · 2026-09-15 · The website's Radio page, five ways

**Status: not built.** Records only — a review with live previews; the spec comes after the pick.
Owner: *"new design for shape radio page on website … similar to the app page … speaking and in sync
with each other … 5 designs … edgy, new, modern, looking like an advanced radio station … moving
graphics that sync to each song that is playing"*, then *"also improve look and design of these boxes
and radio logo"* with a screenshot of the nav's Get started button and Radio chip.

**The board:** https://claude.ai/artifact/WWtGRXQPQtE6C3u7u4BgpP — ten tabs: **Today · as shipped**
(the marketing hero and Shape Sets card rendered from `radio.jsx`'s own source over the page's own
photo, and the `/radio.html` player from its own markup and CSS with its idle rings running the page's
own code), **A · The Desk**, **B · The Waterfall**, **C · The Cloud**, **D · The Wall**, **E · The Halo**
(each fold live, with a state row — on air · off air · no signal data · signed out — and a Next track
button), **Nav** (the two boxes and the Radio mark, shipped values beside three treatments each),
**In sync**, **Backbone**, **Pick**.

⚠ **THE STATION ON THE BOARD IS SIMULATED AND SAYS SO ON EVERY FOLD.** Nothing is broadcasting
(`public.radio_station` has no row — re-recorded on 2026-09-15). The board synthesises a deterministic
128-BPM signal (no `Math.random`), and every reading on it is then *measured* from that signal by the
app's own detector: the tempo reads "—" until `createTempoDetector` settles and then **128 BPM ·
measured**, the rail's five bars are `railBarsLit(railRms(bins))`, the counter steps on the detector's
own `step`. **The board imports `radioSignalField.mjs` and `radioTempo.mjs` as supporting files** and
its masthead reports which geometry it is running; the inline copies are the fallback and were not
needed (measured: *"the app's own modules, imported"*).

Measured on `main` = `9e4a175`.

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

## 2 · The five options

All five carry the app's instrument chrome verbatim — the wordmark, the mode label *Listening · the
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

**Per-song sync, the mechanism (Backbone 04):** the analyser at 60 fps (the picture is the audio); the
measured tempo (the kick envelope drives the breath); a deterministic seed from the track's title and
artist (each song's own program, the same every play, on both surfaces); the change of track as an
event (a sweep, a log line, a morph, a turn). Off air every field rests; a stream without CORS headers
reads *No signal data from the channel*; nothing is seeded from a typed BPM.

## 3 · In sync — the app's Radio and the website's, element by element

Same wordmark asset · same mode and rail words (`radio.json` defaults verbatim) · same five-bar meter
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

**A · The Desk, with B's log line on a change of track.** "Similar to the app" was the first ask, and
A is the app: the same module draws both surfaces, so the phone and the site cannot disagree about what
the station is doing. It still moves with the song (the lattice, the temperature, the counter, the
sweep), and it is the smallest build: the app's canvas component and its two modules, a desktop layout,
the inline gate, and the below-fold sections that already exist. **Fallbacks:** B if "an advanced radio
station" outranks "similar to the app"; C if the site's identity outranks both; D is a launch-week look;
E is the field to take if the page must work at phone width first.

## 6 · Owner rulings needed before a build

| Question | Default if unruled | Why |
|---|---|---|
| One page: does `/radio.html` retire into `Radio.html`? | Yes; a redirect stays | Two pages for one station is the largest gap between the web and the app |
| A signed-out visitor: the honest rest state, or a labelled simulated station? | The rest state, with the app's capture below the fold | The app's own 09-15 ruling was no simulated station; a moving fake is still a fake |
| Does now-playing answer nulls when no station is configured? | Yes | Both surfaces print the mock's track today |
| Does the app adopt the same per-song seed? | Yes, in a later PR | Otherwise a song has one look on the web and none in the app |
| Web Bluetooth for a strap on the desktop? | No; Listening only on the web | Chrome only, and a second build of the matching state |
| The rail's "On air" with no station? | Off air until a stream starts, on both surfaces | The app's unconditional chip is registered as an unlabelled claim |
| Which field, and which nav pair and mark? | A; N1 + L1 | The pick above |

## 7 · Not a ruling — lands with any pick

The photo retires; the dead sections and the random bars go; the font link moves to the new system; the
teal becomes the app's pair; the player's demo slider and typed BPM are deleted with the page they live
on; the nav's two radii become one cut.

## 8 · How it was verified, and what it was not

- The board rendered in Chromium with the six faces served locally (Google Fonts is blocked here) and
  the Anybody width axis proven to move (SHAPE at wdth 50 = 43px, at 150 = 203px). **Zero page errors;
  zero horizontal overflow at 1280 and 400 on every tab**; the modules **imported** (the masthead
  reports it); on every fold the tempo read **128 BPM · measured** within 9 s of tune-in, the clock
  ticked, the counter stepped; off air the key read *Tune in* and the field rested; signed out the key
  was disabled with *Sign in to listen* under it; the smallest control on a fold measured 36px.
- The Today tab is `renderToStaticMarkup` over `radio.jsx`'s own `RadioHero` and `RadioShapeSets`
  (the Sets card's reveal wrapper ships at opacity 0 until an observer fires; it is shown revealed) and
  the player's own markup and CSS scoped under one class, its idle rings running the page's own
  `drawViz` idle branch. The player's hidden Nora stage is omitted.
- **Not driven:** the shipped pages themselves (React and Babel from unpkg with SRI; three.js from
  esm.sh — both blocked here), and no real stream: the CORS contract on the real stream is unverifiable
  until the provider is real, which is why the no-signal state exists on every fold.
- **No on-account pass, and none possible here:** nothing on the board signs in or plays audio.
