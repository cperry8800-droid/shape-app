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
answers "Invalid uploader". **gofile (guest upload) took all three renders on
2026-09-02**, each md5-verified against the sandbox file; gofile's own policy removes a
guest file after ~10 days without a download, so a link is reviewable this week, not
permanent. The order that works: gofile → 0x0.st → litterbox → uguu.se (label it 3 h).
`upload2.sh` in the sandbox runs that chain per file and appends
`LINK <file> <host> <url>` to `links.txt` — per-host URL extraction (`jq` on the JSON,
one regex per host), because the first script's single regex matched only uguu's bare
host and logged a successful upload as a failure.

## Open

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
