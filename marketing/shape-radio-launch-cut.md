# Shape Radio — the launch cut (recipe, sources, and what the two versions are)

Status: DRAFT for the owner · 2026-09-01. The production record for the ~30 s
vertical brand video cut this session. The strategy lives in
`social-brand-awareness-plan.md`; the shot-by-shot scripts in
`shape-radio-video-scripts.md` and `social-video-ideas-wave-2.md`. This file
exists so the cut can be re-rendered, re-timed or re-scored without re-deriving
anything below.

The review links handed over in-session are 72-hour litterbox uploads and are
deliberately NOT recorded here (they die). The SOURCES are permanent. Nothing is
posted anywhere.

---

## What it is

Three Higgsfield generations, crossfaded, **1440×2560 · 24 fps · 29.575 s**,
scored by an **owned** Higgsfield deep-house track:

- **0.0–9.7 s — Scene A**: an athlete wrapped in light ribbons.
- **9.7–19.5 s — Scene B**: a phone on a dark set; its screen carries the composite.
- **19.5–29.6 s — Scene C**: the dark club wall; the Shape Radio wordmark fades in
  from 21.7 s, mid-wall, with a glow.

Two versions of what the phone shows:

- **v1** — a four-screenshot reel of the real app (radio → train → community →
  score), 2.2 s each with 0.3 s crossfades.
- **v2** — the owner's call mid-session (*"this video should have the shape logo on
  screen pulsing"*): the SHAPE logo (teal + cream) pulsing on the beat — a 6 %
  scale throb and a glow on every beat, a teal ring rippling out of the mark on
  every beat, a soft teal halo behind it. **Review this one first.**

Everything else in the two versions is identical.

## Honesty + licensing — the constraints the cut obeys

- **Owned music only.** The track is a Higgsfield generation (URL below), per the
  licensing guardrail in the strategy doc. No commercial music, ever.
- **No "tune in now", no "live".** The station is not broadcasting
  (`public.radio_station` does not exist in production; both radio routes fall
  through to the mock provider). The wordmark on the wall is the only Radio claim.
- **The v1 screenshots are the real July app captures** from
  `public/newdesign/getapp-*.png`, not mockups.
- ⚠ **The track was PROMPTED at 124 BPM and MEASURED at 128.** The pulse locks to
  the measured grid (method below). A pulse on the prompted tempo drifts half a
  beat inside fifteen seconds and reads as random.

## Sources (permanent — cloudfront, the owner's Higgsfield account)

Prefix: `https://d8j0ntlcm91z4.cloudfront.net/user_3E30hta4RMpS2cDML3JnB5dGPnY/`

| Piece | File |
| --- | --- |
| Scene A — athlete + light ribbons | `hf_20260901_165433_72d68899-3266-4302-bb45-0417c72f0ecb.mp4` |
| Scene B — static blank-screen phone | `hf_20260901_165434_a27526b7-057b-4165-865c-0e9c5c9b46e9.mp4` |
| Scene C — dark club wall | `hf_20260901_165434_a1d1066e-7837-48c6-81ce-ef849c38d8a2.mp4` |
| Track — 30 s deep house, prompted 124 BPM | `hf_20260901_165439_f7f2681e-8955-48d9-8c6a-5b62eb5d9dd3.m4a` |

All three clips: h264 1440×2560, 24 fps, 243 frames = 10.125 s. Track: aac
44.1 kHz stereo, 30.023 s.

Repo assets (all on `main`):

- `public/SHAPE-logo-teal-white.png` — 3696×1782 RGBA, the two-triangle mark over
  the SHAPE wordmark (same bytes as `mobile-app/public/shape-logo.png`). The v2
  phone screen.
- `public/Shape radio logo updated.png` — 2172×361 RGBA on opaque black, thin teal
  strokes. The wall wordmark.
- `public/newdesign/getapp-radio-v3.png`, `getapp-train-v3.png`,
  `getapp-community-v2.png`, `getapp-score-v3.png` — 600×1387 each. The v1 reel.

## Geometry that had to be measured, not assumed

- **The phone screen in Scene B is x 416–1026 (610 wide), y 592–1926 (1334 tall),
  aspect 0.457, corner radius ≈ 96–100 px.** Derived from the temporal MINIMUM over
  sampled frames: the min erases the moving beam reflections that had defeated a
  per-frame variance test, which found only the top portion of the screen
  (`440, 620, 560, 900` — aspect 0.62 against a 0.46 phone).
- **The screen interior is near-black throughout** (median 3.3) with transient
  glints up to 255. That is why everything on the screen is **SCREEN-blended,
  never overlaid**: screen(black) is the identity, so the glass reflections ride
  OVER the logo or reel and it reads as a lit screen rather than a sticker.
- **Scene C's centre is black for the whole clip** (the lit pillars are at the
  sides), so the wordmark sits at y 1110, 1240 px wide, with nothing competing.

## The beat grid (measured)

Decode to 8 kHz mono; onset envelope = rectified derivative of a band's smoothed
energy; comb-filter search over BPM × phase. The kick band (35–150 Hz) is
ambiguous on this track (a weak intro, off-beat bass); the percussion band
(150–4000 Hz) autocorrelates cleanly at 0.4668 s (128.5 BPM) with the two-beat lag
agreeing (0.935 s), and the comb sweep peaks at **128.0** in both halves of the
track, 1.6× the sweep mean. The kick's on-beat contrast against the half-beat was
0.87 (< 1.3), so the phase comes from the combined envelope, not the kick alone.

**Chosen: 128.0 BPM, period 0.46875 s, phase 0.0552 s → beats at 0.055 + n·0.46875.**

## The phone-screen layer (v2)

Rendered off-line with PIL/numpy (`mk_screen.py`, below) into `screen.mp4`
(610×1334, 24 fps, 227 frames covering composite 10.0–19.45 s), then overlaid at
(416, 592) and screen-blended.

- **Logo**: the PNG cropped to its alpha bbox, 456 px wide at rest, centred at
  (305, 614) on the screen canvas, premultiplied onto black so it is additive light.
- **Pulse**: `k(t) = exp(−u/0.20)`, u = fraction of the beat elapsed — a snap on
  the beat, decayed by the next. Scale `1 + 0.06·k`; glow (Gaussian σ≈30 of the
  premultiplied logo) at gain `0.25 + 0.9·k`.
- **Rings**: on every beat a 3 px teal (52,214,197) ring expands from r 150 to 560
  over 1.15 s with an ease-out, alpha `0.55·(1−p)^1.7`, blurred 1.2 px.
- **Halo**: a static elliptical teal wash at 10 %.
- **Envelope**: 0.6 s fade-in from 10.0, 0.5 s fade-out into 19.45; the whole layer
  is masked by the screen's rounded rect (r 100, 2 px inset) so the rings never
  touch the bezel.

Verified in the layer itself, frame-accurately: at a beat the logo bbox grows
456 → 476 px and the lit-pixel count 8.8 k → 22 k; mid-beat the 606 px-wide bbox
is the ring.

## The filtergraph (v2)

Inputs: `0` = A · `1` = B · `2` = C · `3` = `screen.mp4` · `4` = `logo_canvas.png`
(`-loop 1 -framerate 24 -t 30`) · `5` = the track. Passed as ONE
`-filter_complex_script` file.

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

Output: `-map "[vout]" -map "[aout]" -c:v libx264 -preset medium -crf 18
-pix_fmt yuv420p -c:a aac -b:a 192k -ar 44100 -movflags +faststart -t 29.575`.

v1 differs only in the `[reel]` branch: the four screenshots (contain-fit to
577×1334 with a rounded-rect alpha mask, r 96) ride as `-loop 1` RGBA inputs at
(432, 592), each with `fade … alpha=1` in/out over 0.3 s and an `enable` window —
10.3 / 12.5 / 14.7 / 16.9 s, 2.5 s each — composed on the same black canvas.

Notes that each cost a round:

- `xfade` needs `fps=24,format=yuv420p,settb=AVTB` on every input or the offsets
  drift.
- Both branches of a `blend` must be `gbrp` for a screen blend, or it converts
  silently and darkens.
- `tpad=start_duration=10.0` delays the screen layer instead of `setpts`, so the
  overlay's before-start behaviour never matters; `eof_action=pass` lets the canvas
  run on after the layer ends.
- ffmpeg ACCUMULATES multiple `-filter_complex_script` flags — pass exactly one
  (a video-only test graph and the full graph passed together produce
  "Filter afade has an unconnected output").
- The wall wordmark is pre-rendered (`logo_canvas.png`: strokes dilated with
  `MaxFilter(5)` at source resolution, scaled to 1240 wide, a `GaussianBlur(22)`
  glow screen-combined, on a black 1440×2560 canvas) because a per-frame `gblur` is
  ten times the cost for the same pixels.
- Audio: the track trimmed to 29.575 s, 0.5 s fade-in, 1.275 s fade-out from 28.3 s.
  Tail RMS −37 dB against −11 dB mid-track — ⚠ measured with an INPUT-side `-ss`.
  An output-side `-ss` runs the whole file through `astats` and reads as if the
  fade were missing, which cost one false alarm.

## Where it renders

In the Higgsfield sandbox (ffmpeg, PIL and numpy preinstalled; it reaches
cloudfront and litterbox). The local dev proxy reaches neither, so the inputs, the
render and the upload all happen in the sandbox, and verification is numeric
(frame statistics, ASCII luminance maps) rather than by eye. The render is ~35 s
wall on 8 cores; the screen layer ~20 s. Hand-over is a 72-hour litterbox link —
never a file attachment, never a committed binary.

## Open

- **OWNER — review v2 against v1 and pick.** Nothing is posted; the wave-2 scripts
  are unreviewed too.
- Optional v3 ideas, none built: captions or a closing line on the wall (any text
  must obey the capture rules in `shape-radio-video-scripts.md` — no broadcast
  claim); a hybrid phone screen (logo pulse, then the app reel) is a two-line
  change to the overlay windows; a longer cut needs a fourth generation, not a
  re-time.

## mk_screen.py — the v2 phone-screen layer

Run in the sandbox with the sources in `in/`; writes `in/screen.mp4`.

```python
import math, subprocess
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

bpm, phi = 128.0, 0.0552          # MEASURED (see "The beat grid"); prompted 124
P = 60.0 / bpm
W, H = 610, 1334                  # the phone screen, measured
FPS = 24; T0 = 10.0; T1 = 19.45   # composite seconds the layer covers
N = int(round((T1 - T0) * FPS))

logo = Image.open("in/SHAPE-logo-teal-white.png").convert("RGBA")
al = np.asarray(logo)[..., 3]; ys, xs = np.where(al > 8)
logo = logo.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
LW = 456; SMAX = 1.07
bw = int(LW * SMAX) + 6; bh = int(round(bw * logo.height / logo.width))
big = logo.resize((bw, bh), Image.LANCZOS)
arr = np.asarray(big).astype(np.float32) / 255.0
prem = arr[..., :3] * arr[..., 3:4]                       # premultiplied = additive light
prem_img = Image.fromarray((prem * 255).astype("uint8"), "RGB")
glow_img = prem_img.filter(ImageFilter.GaussianBlur(30))
cx, cy = W // 2, int(H * 0.46)
teal = np.array([52, 214, 197], np.float32) / 255.0

mask = Image.new("L", (W, H), 0)
ImageDraw.Draw(mask).rounded_rectangle((2, 2, W - 3, H - 3), radius=100, fill=255)
maskf = np.asarray(mask).astype(np.float32)[..., None] / 255.0
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
rr = np.sqrt(((xx - cx) / 380.0) ** 2 + ((yy - cy) / 300.0) ** 2)
ambient = (np.clip(1 - rr, 0, 1) ** 2.2)[..., None] * teal * 0.10
beats = [phi + n * P for n in range(0, 80) if T0 - 1.3 <= phi + n * P <= T1 + 0.1]

def kof(t):
    u = ((t - phi) % P) / P
    return math.exp(-u / 0.20)

def paste(dst, src, gain):
    sh, sw = src.shape[:2]; x0 = cx - sw // 2; y0 = cy - sh // 2
    xs0, ys0 = max(0, x0), max(0, y0); xs1, ys1 = min(W, x0 + sw), min(H, y0 + sh)
    dst[ys0:ys1, xs0:xs1] += src[ys0 - y0:ys1 - y0, xs0 - x0:xs1 - x0] * gain

proc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
    "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "fast",
    "-crf", "10", "-pix_fmt", "yuv420p", "in/screen.mp4"], stdin=subprocess.PIPE)
for i in range(N):
    t = T0 + i / FPS; k = kof(t)
    s = 1 + 0.06 * k; w = int(round(LW * s)); h = int(round(w * bh / bw))
    lg = np.asarray(prem_img.resize((w, h), Image.LANCZOS)).astype(np.float32) / 255.0
    gl = np.asarray(glow_img.resize((w, h), Image.LANCZOS)).astype(np.float32) / 255.0
    frame = np.zeros((H, W, 3), np.float32) + ambient
    ring = Image.new("L", (W, H), 0); d = ImageDraw.Draw(ring); drew = False
    for b in beats:
        age = t - b
        if 0 <= age <= 1.15:
            p = age / 1.15
            r = int(150 + (560 - 150) * (1 - (1 - p) ** 2.3)); a = int(255 * 0.55 * (1 - p) ** 1.7)
            d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=a, width=3); drew = True
    if drew:
        frame += np.asarray(ring.filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32)[..., None] / 255.0 * teal
    paste(frame, gl, 0.25 + 0.9 * k)
    paste(frame, lg, 1.0)
    env = min(1.0, (t - T0) / 0.6) * min(1.0, (T1 - t) / 0.5)
    proc.stdin.write((np.clip(frame * env * maskf, 0, 1) * 255 + 0.5).astype("uint8").tobytes())
proc.stdin.close(); proc.wait()
```
