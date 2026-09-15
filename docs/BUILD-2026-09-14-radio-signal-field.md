# Build brief — the Radio page as D · The Signal Field

**Owner's pick, 2026-09-14:** *"Ok i like it, lets go with that. make sure the correct masthead is on
page as well."* The concept is tab D of the board
(https://claude.ai/code/artifact/59dcada3-eadf-4ddb-8e68-8a5a92845a32); the review it came out of is
[`REVIEW-2026-09-14-radio-page.md`](REVIEW-2026-09-14-radio-page.md). This is the code-level brief:
what ships, what is deleted, where every hook is, the honest states, the guards, and the PR order.
Every `path:line` below was read from `main` = `2d49f60` (the branch carrying this file has changed
no code since). **Re-verify a line before editing it** — the file every reference points into is
1,987 lines long and moves.

> ⚠ **The board is not in the repo.** Its phones run on a simulated 128-BPM signal and a simulated
> strap; the formulas the build needs are written out in §4–§6 so nothing has to be recovered from
> the artifact. Where the board and this brief disagree, the brief wins, because it was written
> against the app's actual data sources and the board was not.

## 0. What the page becomes, in one paragraph

Two states of one instrument, under the app's own masthead. **Listening** — the station's live
spectrum off the real analyser (32 mirrored bands, bass at the centre, peak caps, a reflection, a
four-beat counter that steps on the *measured* tempo) over a quiet field of dots; the track is the
hero; one wide key reads *Match my BPM*. **Matching** (on that key) — the bands fold away and two
pulse rows take their place, drawn the way a heart-rate monitor draws: a pen sweeping left to right
with the erase gap ahead of it, the station's beat above in teal (the kick's own envelope), the
member's heart below in rust (the monitor's glyph per beat), each row's reading at its left end, the
lock state and the gap in BPM at the top right. While the rates differ the lower row's beats slide
against the upper row's; in sync, the lower row takes the station's teal and ties join the beats.
No strap → a dashed flat row that says so. No settled tempo → the upper row waits and the reading is
"—". No listener count anywhere. No scrubber. Everything below the fold (the social row, the comments
sheet, Nora, Channel, Shape Sets) stays.

## 1. The masthead — the owner's one addition to the pick

**Keep the shipped header block byte-for-byte**, `iosAppBroadsheetRadio.jsx:1404–1433`:

| Row | Source | i18n key |
|---|---|---|
| `BSLogo` (16 px, CREAM) + *Vol. 1 · No. 1* | `:1407–1411` | `radio:masthead.volNo` |
| the trailing corners (search · avatar) | `bsRadioCorner(CREAM)` `:1417`, defined `:1253` | — |
| *← Back* (own row, flush left, 12 px under the mast) | `:1420–1423` | `radio:screen.back` |
| *Section · Music* (centred teal eyebrow) | `:1424–1426` | `radio:screen.sectionMusic` |
| the wordmark, centred at `min(86%, 330px)` | `BSRadioWordmark` `:1432`, defined `:687` | — |
| the hairline under it | `borderBottom: 1px solid RULE_DK` `:1405` | — |

The review's backbone (§3) proposed shrinking the wordmark to a nameplate and dropping the volume
line and the eyebrow. **That is superseded by the owner's ruling** — the page carries the masthead
the other pages carry, unchanged, and the concept starts under it. The board's D phone was re-cut to
show exactly this so the preview and the build agree. The top inset stays `BS_MAST_TOP_CSS`
(`iosAppBroadsheet.jsx:820`) and the corners stay the module-scope cluster (owner ruling 2026-08-01).

## 2. What is deleted from `BSRadioScreen`, and why each one

| Deleted | Where | Why |
|---|---|---|
| The scrubber (`elapsed = total * 0.46`, `0:00 / -0:00`) | `:1494–1512` | Renders `0:00 / -0:00` (the payload carries no length) and promises a seek the licence forbids — prohibition 4 in the module header. |
| `BS_LIVE_STATION.bpm` (132) as the station tempo | `:1293`, the ring `:1466–1471`, the sync card `:1591`, the channel meta `:1715` | A constant shown as a reading. Replaced by the measured tempo or "—". |
| `BS_LIVE_STATION.listeners` (3,472) | `:1459` on-air line, `:1715` channel meta; also `:1092` (muted bar) and `:938` (Home card) | Nobody has counted anybody. Nothing shows a count until a provider reports one (ruling 2, §12). |
| `demoHr` and the demo easing | `:1295`, `:1312–1323`, `:1341`, `:1346` | *Connect monitor* with no strap fabricates 114 and then "locks" it. No strap → no number. |
| `BSEQ` on the page, the beat ring, the stage light | `:1490`, `:1466–1471`, `:1450` | CSS keyframes on sine loops while a real analyser sits idle. The spectrum and the rows replace them. |
| The BPM ring block | `:1464–1472` | Its figure was the constant; the tempo reading moves into the rail (listening) and the station row (matching). |
| The heart-rate sync card | `:1586–1671` | Its three states and its readings move into the matching state; the *Match my BPM* key becomes the page's one wide key. |
| The three `{false && …}` blocks and the `r.PLAYLISTS` read | `:1708`, `:1719`, `:1752` | Dead in the render; `r.PLAYLISTS` is never provided by the context. |
| *Live from Club Shape* unconditional | `:1744` | Gate it on `sets.real`, the way `BSSetsLine` (`:1019`) already does. |
| The "fixed-dark" comment on a theme-adaptive page | `:1414` | `:1380–1387` derives the whole palette from `t.isLight`. The Sets screen's identical comment (`:1917`) is *correct* — that screen is literal-palette. Fix the one, leave the other. |

**Not deleted:** the social row and comments sheet (`:1531–1580`, `BSSongCommentsSheet` `:1143`),
Nora (`:1350–1372`, `:1679–1704`), Channel + `BSSetsLine` (`:1706–1717`), Shape Sets (`:1722–1748`),
`BSShapeSetsScreen` (`:1872`), the theme ladder (`:1380–1387`), `useShapeTr` (`:103`).

## 3. Where the data comes from — every source verified

| Source | Where | Shape | Notes |
|---|---|---|---|
| The analyser | `ShapeRadioLive.analyser()` — `shapeBackend.js:8565–8571` | `AnalyserNode`, `fftSize 512` → 256 bins, ~86 Hz per bin at 44.1 kHz | Built once from the radio `<audio>` (a second `createMediaElementSource` throws — do not create another). The element is `crossOrigin='anonymous'` (`:8474`). ⚠ **It carries data only when the stream sends `Access-Control-Allow-Origin`** — with the mock provider every bin reads 0. The page must treat all-zero bins as *no signal data* (§7), never as silence to animate over. ⚠ The `AudioContext` is created lazily; on iOS it can start suspended — call `resume()` on the tap that opens the page or on Pause/Resume, or the spectrum stays flat with no error. |
| Now playing | `r.nowPlaying` → `radioNowPlayingDisplay` `:875`; `r.currentSongKey`, `r.songSocial`, `r.voteSong`, `r.commentSong` | `{ title, artist, isNora }` — nothing else (`src/lib/radio/provider.ts:2`) | Unchanged. No length, no BPM, no count. |
| Playback | `r.paused`, `r.setPaused`, `r.setRadioPreference`, the provider's playback effect `:451–452` | signed-in gate `bsRadioSignedIn` `:83` | The session clock (§5) starts when the effect starts playback. |
| The strap | `window.ShapeHRM` — `mobile-app/src/services/hrm.js` | `{ available, connected, current, connect, disconnect }`; `shape:hrm` events `{ bpm, connected }` | `parseHeartRate` (`hrm.js:53`) reads the bpm and **drops the RR-interval field** the characteristic can carry. PR 3 adds it (§6). |
| The Sets schedule | `useBSSetsSchedule` `:1840` via `r.sets`; `sets.real` | | Unchanged; gates *Live from*. |
| The light effects | `iosAppReactive.jsx` — `useBeat` on a **fake 132-BPM clock** (`:17–18`), `RadioEffects` `:284`; consumers `iosAppBroadsheetClient.jsx:345`, `:33790` | | PR 4 (§11). |
| Theme | `useBS()` → `t.DISPLAY` (Saira), `t.MONO`, `t.ACCENT`, `t.isLight`, `t.padX`, `t.PAPER` | the CREAM ladder `:1380–1387` | The page is theme-adaptive. `TEAL = t.ACCENT` (`:1373`). The heart's rust: `t.isLight ? '#c0533b' : '#e06547'`. |
| i18n | `useShapeTr` `:103`; catalogs `mobile-app/src/i18n/catalogs/<locale>/radio.json` × 13 | | `Radio::BSRadioScreen` is in the ratchet's **fully-keyed** set (`tests/i18n-surface-inventory.test.mjs:448`): every new string is keyed in all 13, or the ratchet fails. |
| Fonts | `mobile-app/src/fonts.css` bundles Saira (`:512–522`) and JetBrains Mono (`:83–91`) as local woff2 under `./assets/fonts/` | | Doto is not bundled anywhere in the app. §12 ruling 1. |

## 4. The signal engine — a pure module, `mobile-app/src/broadsheet/radioSignalField.mjs`

Pure functions, no DOM, `require()`-able in Node like `sessionLedger.mjs`, so every rule below is
driven rather than eyeballed. The canvas component (§8) only calls them.

**Bands.** From the analyser's 256 bins take the first 64 (0–5.5 kHz), map to 32 *mirrored* bands
with the bass at the centre: band `i` reads bin `floor(|i − 15.5| / 16 · 63)`. Smooth with a fast
attack and a slow release — `sm[i] = raw > sm[i] ? raw : sm[i]·0.88 + raw·0.12` — so the bars move
with the music and never jitter. A peak cap per band: `pk[i] = max(pk[i] − 0.011, sm[i])` per frame.
Bar height `max(3, v·maxH)`; the cap is drawn only when it sits more than 4 px above its bar.

**The field.** A grid of dots (in the board: 16 × 34 on a 23.4 × 24 px pitch, from 12 px). Each dot
reads the bin at `floor(min(1, dist(dot, centre) / 430) · 63)` — bass at the centre, air at the edges.
Alpha `(0.07 + 0.6·v) · fieldK`, radius `0.8 + 1.9·v·fieldK`, where
`fieldK = (0.45 + 0.55·kx) · (0.72 + 0.28·kick)` — quiet under the spectrum, full behind the rows, and
the whole field breathes on the kick.
⚠ **CORRECTED 2026-09-15 — the REST is a constant, not a fraction of `fieldK`.** As written, a dot with
nothing on the air (`v = 0`, `fieldK` at its 0.324 floor) renders at **2.3% alpha and 0.8 px** — the void
#2066's entry measured (brightest pixel alpha 6 of 255) and #2072 left in place in the one state everyone
can reach: signed out, paused, or a station not broadcasting, which in production today is every member.
The owner opened the page the day after #2072 merged and read it as "not the design". Shipped as
alpha `FIELD_REST_ALPHA + 0.62·v·fieldK` and radius `FIELD_REST_RADIUS + 1.7·v·fieldK` — the grid keeps
a rest whatever the field's strength, and only the LIGHT on it reads the bins and breathes on the kick. `kx` is the state (0 listening → 1 matching, eased over 0.7 s);
`kick` is the beat envelope from §5 (0 when no tempo has settled — the field then only lights per bin).

**The rows (matching).** One clock, three seconds of history across the row (`W` px), one pen sweeping
left → right at `W / 3` px/s with an erase gap of 24 px ahead of it, the newest sample at the pen:

- `px = x0 + ((t · pps) mod W)` — the pen.
- `behindOf(x) = ((px − x) mod W + W) mod W` — pixels behind the pen: 0 = just drawn, W = about to be
  erased. The sample at `x` is the value at instant `t − behindOf(x) / pps`.
- `alphaAt(x)`: 0 inside the gap (`behind > W − 24`); otherwise `(1 − 0.4 · behind / W) · kx`, ramped to
  0 over the 10 px before the gap. Sample every 0.5 px so the heart's spike cannot fall between samples.
- **Station row** — the kick's own envelope at each predicted beat: `kickShape(u) = u < 0 ? 0 :
  u < 0.03 ? u/0.03 : exp(−(u − 0.03)/0.13)`, `u` = seconds since the beat (§5 supplies the beat instants).
- **Heart row** — one monitor glyph per beat, drawn *from* the beat's instant and never before it:
  `ecg(u) = u < 0 || u > 0.42 ? 0 : max(0, 1 − |u − 0.014| / 0.02) − 0.26·g(u, 0.045, 0.011) + 0.24·g(u, 0.21, 0.045)`
  with `g(u, c, w) = exp(−(u − c)² / (2w²))` — the spike, the dip, the T wave. ⚠ **No P wave.** A strap
  sends beats, never a waveform; a P wave precedes the R by ~170 ms and would be a claim about a beat
  the app has not received. The timing is measured, the shape is a glyph, and the page's copy says so.
- **Pen dots** on each row's baseline at `px`, radius `2.5 + 3.5·env`, each on its own envelope.
- **Sync cues.** `lockK` eases 0 → 1 over 1.1 s while in sync and back over 0.5 s. The heart row's
  colour interpolates rust → teal by `lockK`; ties (1 px teal, alpha `0.32 · lockK`) join a station beat
  to a heart beat **only when one lies within ±120 ms of it** — a genuine alignment, never a drawn one.
- **No strap** — the heart row is a dashed flat line at 0.38 alpha, its reading "——", and a line
  beside it: *No pulse · connect a monitor*.

**The gap.** `gap = round(heartBpm − tempo)`, rendered `−16 BPM` / `+3 BPM` / `0 BPM` under the state
word; hidden when either side is unknown. **In sync** is `|gap| ≤ 4` — the tolerance the shipped page
already uses (`:1303`, recorded 2026-09-03).

**Colour and identity, fixed:** the station is teal and the upper row; the heart is rust and the
lower row; the ♡ beside the heart reading (a monochrome glyph, never an emoji) beats with the row.

## 5. The tempo detector — a pure module, `mobile-app/src/broadsheet/radioTempo.mjs`

The station's tempo is **measured or "—"**. The now-playing payload carries no BPM and the constant
is gone, so the only honest source is the audio itself. This is the launch cut's `beat.py` method
(`marketing/shape-radio-launch-cut.md`: onset envelope · comb search · split-half agreement ·
per-beat residuals) moved into the browser, fed by the same analyser frames the spectrum reads.

- **Input**: per frame, the bass energy (bins 1–4, ~86–345 Hz) with a timestamp. Keep ~8 s in a ring.
- **Onset envelope**: half-wave-rectified first difference of the log energy.
- **Search**: every ~1 s, a comb over 100–160 BPM at 0.25-BPM steps against the envelope; the score is
  the comb's mean energy at the beat instants against the envelope's mean.
- **Confidence**: the best score against the mean over the candidate range, **and** split-half
  agreement — the first and second halves of the ring must agree within ±1 BPM. Below the floor, or
  disagreeing, the tempo is `null` and every reading is "—".
- **Phase**: the grid's offset is the envelope's best-fitting onset; the predicted beat instants are
  `phase + k · 60/bpm`. The kick envelope for the field, the counter and the station row is
  `exp(−(t − lastBeat) / 0.13)`.
- **Holds** a settled tempo through a dropout of up to 4 s (a breakdown, a quiet bar), then decays to
  `null`. A re-settle after a change must replace it within ~8 s.
  ⚠ **CORRECTED 2026-09-14 WHILE BUILDING PR 1 — THIS SAID ~6 s, AND THE 6 s WAS BOUGHT WITH A
  FABRICATION.** The detector met 6 s (5.40 s first reading) and published a confident BPM for
  **237 of 500** speech seeds, because split-half agreement compares two argmaxes chosen
  independently over 241 candidates and two nearby peaks are common by coincidence in dense
  aperiodic audio — one lucky window, then the hold. Found by Codex on the PR and reproduced
  before it was acted on. `CONFIRM_S = 2` makes a candidate persist before it is spoken, which
  takes the speech fabrications to **0 of 500** and costs 2 s. *A latency target is not worth a
  number nobody measured*, which is the rule this whole page is built on.
- **Deterministic**: no `Math.random`, no wall clock inside the module — the caller passes `t`.

Tests it must pass (§10): a synthetic 128-BPM click train settles within 8 s at ±0.5 BPM (see the
correction above); silence
and all-zero bins read `null`; ±15 ms jitter on the clicks still settles; a jump 128 → 140 re-settles;
a mutation that lowers the confidence floor to 0 must make the silence case read a tempo (killed).

The detector is exposed on the radio context as `r.tempo` (`number | null`), `r.beat` (`{ at, kick }`)
so the Home card and the effects (PR 4) read one measurement rather than three.

## 6. The strap path

- `hrm.js:53` — parse the RR-interval field when flags bit 4 is set (one or more `uint16` at 1/1024 s
  after the bpm and the optional energy field, flags bit 3) and emit it: `shape:hrm` detail becomes
  `{ bpm, rr?: number[], connected }`. Every existing consumer keeps working — `bpm` is unchanged.
- The heart row's beat instants come from `rr` when the strap sends it (each interval closes a beat at
  `receivedAt − sum(later intervals)`), and from a phase accumulator on `bpm` when it does not — the
  board's method, and the honest fallback: the *rate* is measured either way, and the glyph's placement
  is at worst one reading late.
- The app's stage ladder stays: `off → free → matching → synced` (`:1305`). `matching` is the page's
  matching state with the key lit amber; `synced` lights the sync cues and the state word; `free` is
  matching with the cues off; `off` is the dashed row. **The key never lights on a number nobody
  measured** — with no strap it reads *Connect monitor* and does exactly that.
- `connectMonitor` (`:1330–1340`) loses its fallback arm: a refused or absent device leaves `off`.
  `disconnectHrm` (`:1342–1345`) stays. The `ShapeHRM.available()` false case (iOS WebView without the
  native plugin, Safari) reads *Connect monitor* → a one-line explanation, not a fabricated reading.

## 7. Honest states — the table the render tests drive

| Condition | Listening shows | Matching shows |
|---|---|---|
| Analyser carries data, tempo settled | the spectrum pumping, the counter stepping, the tempo reading | the rows, the gap, the cues |
| Analyser carries data, tempo not settled yet | the spectrum, the counter still, tempo "—" | the station row **waits** (flat, its reading "—"); the heart row runs; no gap |
| Analyser all-zero while playing (no CORS on the stream) | a flat baseline, no counter, tempo "—", one line: *No signal data from the stream* | the same, the station row flat |
| Radio paused / muted | the field at its rest, a **dashed** flat baseline, the counter unlit, the key reading *Resume* | the pen stops; rows hold |
| Requested and not playing (`play()` refused — no station configured, autoplay wants a gesture) | the same resting instrument; the rail's clock reads *Paused*; the key reads *Tune in* and asks again | — |
| Signed out | playback is gated (`bsRadioSignedIn`); the resting instrument and the track, the key **disabled** reading *Tune in*, and *Sign in to listen* under it (the social row's own nudge) | the key reads *Match my BPM* and opens the sign-in nudge, not a fabricated row |

⚠ **CORRECTED 2026-09-15 — the paused row read "the field only", and "the field only" was a void.** With
the rest scaled by `fieldK` (§4) the field at rest was invisible, so this row described an empty box and
the build shipped one. The instrument's fixed parts — the baseline and the counter — are drawn in the
listening half whatever the air carries; only the BARS are gated on a frame carrying data. And the key
reads the MEASURED state (`playingSince`), never the requested one: the shipped key read `paused` alone and
so read "❚❚ Pause" beside a rail reading "Paused" for a stream that had never started.
| No strap (`off`) | the key reads *Connect monitor* | a dashed flat heart row, "——", *No pulse · connect a monitor* |
| Strap connected, not matching (`free`) | the key reads *Match my BPM* | the heart row live in rust, the gap shown, no cues |
| `synced` | — | the lower row teal, the ties, the state word teal, `0 BPM` |
| Reduced motion | the spectrum at ~4 fps, no field breath, no count-up | the rows still draw (they are readings); the pen still sweeps |

A number that cannot be measured renders "—". Nothing eases toward a target. Nothing is seeded.

## 8. The component and the layout

`BSRadioSignalField` — one `<canvas>` behind the page's absolute-positioned chrome, sized to the
phone at `devicePixelRatio ≤ 2`, one `requestAnimationFrame` loop that reads
`getByteFrequencyData` once per frame, feeds the detector, draws the field, then the spectrum or the
rows by `kx`. It unmounts with the page and pauses on `document.hidden`. Portal nothing — this is the
page's own ground, not a sheet.

Order under the masthead (the board's geometry at 375 px; use the app's `t.padX` and the rail's own
metrics rather than these literals): the mode label (*Listening · the station* / *Matching · station ×
heart*), the rail (*On air* · the session clock; *Signal* · five bars off the analyser's RMS), the
state block at the right (*Lock* · the stage word · the gap), the spectrum or the rows, then the Now
block (the track at 32 px while listening, 24 px while matching — the hero shrinks to make room for
the rows), the deck (Pause/Resume, Stop, the social row), the one wide key, *× Listen only* under it
while matching, and the strip: **Live · Shape Sets · Nora** — Live is the station, Shape Sets opens
`BSShapeSetsScreen` (`showSets`), Nora toggles the existing preview (`toggleNora`). Channels may be
chosen; tracks never — the strip is a channel row, not a track list.

The session clock is the *only* clock: elapsed since the provider's playback effect started this
session (a `playingSince` timestamp added to the provider at `:451`), reading `paused` while paused.
It is not a track position and must not be drawn as one.

## 9. i18n — new keys, all in `radio.json` × 13

`screen.listening` (*Listening · the station*), `screen.matching` (*Matching · station × heart*),
`rail.onAir` (*On air*), `rail.signal` (*Signal*), `rail.lock` (*Lock*), `rail.station` (*Station ·
beat*), `rail.you` (*You · heart*), `hr.noPulse` (*No pulse · connect a monitor*),
`hr.listenOnly` (*× Listen only*), `screen.noSignalData` (*No signal data from the stream*),
`screen.paused` (*Paused*), `strip.live` (*Live*), `strip.sets` (*Shape Sets*), `strip.nora` (*Nora*).
Reuse what exists: `hr.matchMyBpm`, `hr.matchingBeat`, `hr.connectMonitor`, `hr.disconnectMonitor`,
`hr.notConnected`, `hr.free`, `hr.matching`, `hr.inSync`, `hr.deltaBpm`, `screen.pause`,
`screen.resume`, `screen.stop`, `screen.nowPlaying`, the masthead's three keys, and every social key.
Each locale's value is authored from **that catalog's own** existing wording (its `hr.*` and
`screen.*` phrasing), never translated fresh — the house rule. `BPM` and `lb`-style unit tokens are
constants, not keys. The ratchet must move by **nothing** on `Radio::BSRadioScreen`.

## 10. Guards — each with the mutation it must kill

- **`tests/radio-tempo.test.mjs`** — the five cases in §5. Vacuity: the click train must produce a
  non-null tempo, or the silence assertion is not testing a detector.
- **`tests/radio-signal-field.test.mjs`** — `ecg(u) === 0` for every `u < 0` (nothing before a beat);
  `behindOf` wraps at `W` and the gap is exactly the last 24 px; `alphaAt ≤ 1` everywhere; a tie is
  offered only within ±120 ms; the gap formatter signs `−16`, `+3`, `0`; `fieldK` is monotone in
  `kick`; a mutation drawing the glyph from `u ≥ −0.1` is killed.
- **`tests/radio-honest-readings.test.mjs`** — source-level over the module: no `demoHr`, no literal
  `114`, no scrubber (`elapsed`/`remain` absent from `BSRadioScreen`), `BS_LIVE_STATION.bpm` and
  `.listeners` have **zero readers** anywhere in `mobile-app/src` (or the fields are gone), no
  `{false && …}` in the render, `bs-eq-*` keyframes not mounted by the page. Positive control: the
  module still defines `BSRadioScreen`.
- **`tests/radio-masthead.test.mjs`** — the header block of `BSRadioScreen` still renders, in order:
  `BSLogo`, `radio:masthead.volNo`, `bsRadioCorner(`, `radio:screen.back`, `radio:screen.sectionMusic`,
  `BSRadioWordmark`. Anchored on the keys and the calls, not on spelling — the owner's ruling is about
  the elements, not their formatting.
- **Mount** (`loadBroadsheet`, the house harness): the page renders with `ShapeRadioLive` absent, with
  an analyser that answers all zeros, with no `ShapeHRM`, and signed out — no throw in any of the four;
  the no-strap render carries "——" and the no-pulse line; the all-zero render carries the no-signal
  line and **no** counter.
- **`tests/radio-hr-sync-labels.test.mjs`** (exists) pins that the status chip, the delta slot and the
  pill never resolve to one word — it will break on the rebuild and must be **re-anchored on the same
  invariant** (the state word, the gap and the key are three different claims), not deleted.
- **Fonts** — if Doto ships (§12), a guard that the bundled file's `fvar` carries **both** `ROND` and
  `wght` (the homepage lesson: Google delivered `wght` alone and every `ROND` rule was inert).
- Mutation round on every new guard, each mutation proven to land, sanity green at both ends, the tree
  restored in a `finally` and on a signal.

## 11. Build order — four PRs, each green on its own

1. **The two pure modules + their tests** (`radioTempo.mjs`, `radioSignalField.mjs`), Doto bundled
   with its `fvar` guard. No UI. Nothing a member can see changes.
2. **The listening state.** `BSRadioScreen` rebuilt under the shipped masthead: the canvas (field +
   spectrum off the analyser), the rail, the Now block, the deck + social row, the key, the strip; the
   deletions in §2 except the sync card; the tempo on the context; the i18n keys × 13; the honest
   states of §7's first five rows. Home and the muted bar untouched.
3. **The matching state.** The rows, the RR parse in `hrm.js`, the gap, the cues, *Listen only*, the
   sync card deleted, `demoHr` gone; §7's last five rows; the re-anchored HR-labels guard.
4. **The constants' other consumers.** The Home card's `BSBeatRing bpm={r.LIVE.bpm}` (`:945`) reads
   `r.tempo` or draws nothing; the muted bar's listener line (`:1092`) goes; the effects label
   (`iosAppBroadsheetClient.jsx:345`, `:33790`) reads the measured tempo or drops the figure;
   `useBeat` (`iosAppReactive.jsx:17–43`) takes `r.beat` when the radio is on and its fake clock only
   when it is not. Then `BS_LIVE_STATION.bpm` / `.listeners` are deleted, and the honest-readings guard
   pins zero readers. Optional in the same PR: the Home card's 8-px halftone (`:921–929`, review
   finding 8).

No migration. No route change. No `public/m` republish (it is gitignored). Every PR: `npm test`,
`tsc --noEmit`, the JSX parse-check, the mobile build with the new strings confirmed in the emitted
bundle behind a positive control, and the page driven in Chromium at 375 and 430 px through the real
entry flow (language → Continue → Preview the app first → Step inside → dismiss the banner), zero
page errors, zero horizontal overflow.

## 12. Rulings — decided by the pick, or defaulted so the build is not blocked

1. **Doto in the app** — *default: Radio only.* Bundle the variable file under `assets/fonts/` with an
   `@font-face` in `fonts.css` (the Saira pattern, `:512–522`), request both axes, use it on the Radio
   page's readings only. App-wide adoption is a separate decision and a separate PR.
2. **The listener count** — *decided by the pick:* none, anywhere, until a provider reports one.
3. **Tempo** — *decided by the pick:* measured (§5), "—" until settled. No declared BPM in the config.
4. **The light-effects modes** — *decided by the pick:* they stay in Settings; D has no rig chip.

## 13. Registered, not in scope

- The CORS contract on the real stream is unverifiable until the provider is real — the no-signal
  state exists so the page is honest either way, and the board's spectrum was simulated.
- No on-strap pass is possible in CI; the strap path is driven with synthetic `shape:hrm` events.
- A live *Cancel* during a strap connect, the Home widget redesign beyond its readings, and the
  website's Radio pages are out of scope.
