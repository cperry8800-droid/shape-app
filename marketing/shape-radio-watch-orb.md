# Shape Radio — the two-orb HR sync card (approved), and the assets it rides on

Status: **APPROVED by the owner 2026-09-03.** This file exists because the renderer below
was written inside an ephemeral Higgsfield sandbox that is reclaimed roughly every 20
minutes — it lived nowhere else. `shape-radio-launch-cut.md` post-mortems that exact loss
four times over (the v6 video prompts, `beat.py` missing from the MAP, a `params_v6.json`
loaded from nowhere, and `C_zoom.mp4` — read by three scripts and written by none). *A
thing that exists only in a sandbox does not exist.*

---

## The card

Owner, verbatim: *"show a line with 2 orbs that slowly move together to form one which then
says in sync"*, then *"one orb is bpm the other is hrm"*.

- A horizontal line. Two orbs ride it: **BPM** (left, the station tempo) and **HRM**
  (right, the heart rate), each carrying its own number.
- HRM climbs 104 → 140. The orbs slide together, merge into one, and the merged orb reads
  **IN SYNC**.
- ⚠ **THE GAP IS THE DELTA, NOT A TIMER.** Separation is `|HRM − BPM| / (BPM − HR0)`, so
  the orbs touch on the exact frame the reading reaches 140. The card physically cannot
  say IN SYNC while the numbers disagree, because one quantity drives both. A decorative
  tween would have been the easy version and would have been capable of lying.
- ⚠ **THE MERGE LANDS ON A BEAT** — beat 16, `t = 0.055 + 16 × 0.428571 = 6.912 s`,
  computed from the measured grid rather than eyeballed. Both orbs also breathe once per
  beat (`exp(−ph/0.22)`), so they pulse *with* the track, not near it.
- **Colour carries the state**, using the app's own ladder rather than an invented one:
  cream **FREE** → amber **MATCHING** → teal **SYNCED** (`#34d6c5`). This is why the words
  IN SYNC appear only at the merge instead of sitting on screen being untrue for six
  seconds — the same reasoning as v7.1's `watchface()`.
- Drawn at **480×480**, overlaid at **x 890 / y 1660** — the wide card's existing
  frame-relative inset (`1440−480−70`, `2560−480−420`), which `plan_a2.py` derives and
  `render6.sh` reads back. Nothing here invents a position.

⚠ **THIS IS DRAWN, NOT GENERATED, AND THAT IS THE POINT.** A generated clip cannot land an
animation on a named beat, and cannot be trusted to render legible type. The one time a
generator did produce a clean readout (the 132 watch, job `1a02aeaa`) it was luck, not a
method. This is the `mk_watch.py` wide-card pattern at its real position, so it is the
mechanism the cut would actually use.

---

## The assets it rides on (all measured, none assumed)

| Piece | Job | Notes |
| --- | --- | --- |
| **Scene A runner — APPROVED** | `878ea5a1-c831-445b-8150-6ec7d3795b24` | wide, locked-off, side profile, clothed, explosive. 1440×2560, 24 fps, **243 frames**, 10.125 s |
| **Audio bed — APPROVED** | `5a06417b-ce80-4651-a5c1-1dc026ddbe9b` (m1) **time-stretched** | see below |

### The 140 BPM bed, and why it is a stretch rather than a prompt

⚠ **`sonilo_music` DOES NOT HONOUR TEMPO REQUESTS — SEVEN TRACKS MEASURED, SIX LANDED AT
~128.** Prompted 120 → 128.00 · 122 → 128.00 · 124 → 128.00 · 126 → **119.95** · 145 →
128.00 · 150 → 128.00 · 155 → **128.70**. The comb search was deliberately widened to
110–190 so it *could* report above 140; both halves of every track still agreed on ~128.
So a tempo cannot be asked for. It has to be imposed:

```
ffmpeg -i m1.m4a -filter:a "atempo=1.09375" -c:a aac -b:a 300k m1_140.m4a
```

`128 × 1.09375 = 140` exactly; `atempo` preserves pitch and 9% is inaudible. **Then it was
re-measured rather than assumed:** **140.00 BPM**, split halves 139.95 / 140.10, period
**0.428571**, phase **0.0550**, duration 54.89 s. First strong kick at **beat 1**; 10 of 72
silent beats across the cut and the only gap (66–71) falls past the end — better kick
coverage than any source track, including t3's 19 of 63.

⚠ **The watch may read 140 only because the track genuinely measures 140.** The owner asked
for "at least 140" *and* for it to match the music; those were irreconcilable until the
stretch, and putting 140 over a 128 track would have been a fabricated readout of exactly
the kind the capture rules forbid.

⚠ **A prompt asking for a "filtered breakdown" or a "long filtered build" buys a dead
intro.** m2 and m3 have 21-beat kick-less openings (~7.9 s) traceable to those exact
phrases; m1 asked for neither and has no gap. Ask for "kick from bar one, continuous, no
breakdown".

---

## `orb_card.py` — the renderer

Writes 243 RGBA frames. Overlay them and mux:

```
ffmpeg -y -i runner.mp4 -framerate 24 -i fr/f%04d.png -i m1_140.m4a \
 -filter_complex "[0:v][1:v]overlay=890:1660:format=auto[v];\
   [2:a]atrim=0.055:10.180,asetpts=PTS-STARTPTS,afade=t=out:st=8.925:d=1.2[a]" \
 -map "[v]" -map "[a]" -c:v libx264 -preset veryfast -crf 16 -pix_fmt yuv420p \
 -c:a aac -b:a 256k -shortest out.mp4
```

⚠ The audio `atrim` starts at **0.055**, the track's measured first beat, so the clip opens
on a downbeat instead of mid-bar. ⚠ And the video mux **must** `-map 0:v` explicitly:
`minimax_h3` clips carry their own generated audio stream, which will otherwise win.

```python
from PIL import Image,ImageDraw,ImageFont,ImageFilter
import math
S=480; FPS=24; N=243
P_BEAT=0.428571; PHI=0.055; MERGE_BEAT=16      # the MEASURED 140.00 grid
tM=PHI+MERGE_BEAT*P_BEAT; t0=1.0               # 6.912 s
BPM=140; HR0=104
CREAM=(232,226,214); AMBER=(214,158,74); TEAL=(52,214,197)   # the app's FREE/MATCHING/SYNCED ladder
def lerp(a,b,u): return tuple(int(round(a[i]+(b[i]-a[i])*u)) for i in range(3))
def ease(u): return u*u*(3-2*u)
F=ImageFont.truetype('mono.ttf',40); Fs=ImageFont.truetype('mono.ttf',18)
cy=S//2; SPAN=150; R=30
for n in range(N):
    t=n/FPS
    u=0.0 if t<t0 else min(1.0,(t-t0)/(tM-t0)); e=ease(u)
    hr=int(round(HR0+(BPM-HR0)*e))
    gap=(BPM-hr)/float(BPM-HR0)            # THE GAP IS THE DELTA -- they touch when it reads 140
    synced = t>=tM
    col = TEAL if synced else lerp(CREAM,AMBER,min(1.0,e*1.4))
    im=Image.new('RGBA',(S,S),(0,0,0,0)); d=ImageDraw.Draw(im)
    g=Image.new('RGBA',(S,S),(0,0,0,0)); dg=ImageDraw.Draw(g)
    d.line([(cy-SPAN-R,cy),(cy+SPAN+R,cy)],fill=col+(70,),width=2)
    ph=((t-PHI)%P_BEAT)/P_BEAT; pulse=1.0+0.16*math.exp(-ph/0.22)   # one breath per beat
    off=int(round(SPAN*gap))
    if synced:
        rr=int(R*1.45*pulse)
        dg.ellipse([cy-rr*2,cy-rr*2,cy+rr*2,cy+rr*2],fill=col+(95,))
        d.ellipse([cy-rr,cy-rr,cy+rr,cy+rr],fill=col+(255,))
        v=str(BPM); w=d.textlength(v,font=F); d.text((cy-w/2,cy-rr-58),v,font=F,fill=col+(255,))
        lab="IN SYNC"; w=d.textlength(lab,font=F); d.text((cy-w/2,cy+rr+34),lab,font=F,fill=col+(255,))
    else:
        for sgn,lab,val in((-1,'BPM',BPM),(1,'HRM',hr)):
            x=cy+sgn*off; rr=int(R*pulse)
            dg.ellipse([x-rr*2,cy-rr*2,x+rr*2,cy+rr*2],fill=col+(85,))
            d.ellipse([x-rr,cy-rr,x+rr,cy+rr],fill=col+(255,))
            s=str(val); w=d.textlength(s,font=F); d.text((x-w/2,cy-rr-58),s,font=F,fill=col+(240,))
            w=d.textlength(lab,font=Fs); d.text((x-w/2,cy+rr+26),lab,font=Fs,fill=col+(200,))
    im=Image.alpha_composite(g.filter(ImageFilter.GaussianBlur(14)),im)
    im.save(f'fr/f{n:04d}.png')
```

Font: JetBrains Mono, the house mono —
`https://raw.githubusercontent.com/google/fonts/main/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf`.

Parameters that are cheap to change: `MERGE_BEAT`, `HR0`, `SPAN`, `R`, the type sizes.

---

## Superseded — recorded so they are not re-fetched

| Job | Why not |
| --- | --- |
| `6f01a52f…` | the v7 runner, replaced by the approved casting |
| `9c163580…` | recast but not side-on |
| `74bae598…` | side-on but too static and too tight |
| `6e31cc58…` | animated but tight |
| `eb324028…` | animated but ends on a push-in |
| `1a02aeaa…` · `d905800a…` · `a92b4ad3…` | generated watch faces, superseded by this drawn card |
| `e815ac55…` | the v7 A2 close-up |
| `db1829b9…` · `e0a911de…` · `edd9270d…` | the fast-track attempts; all measured ~128 |

⚠ **`minimax_h3` is the only video model this account exposes and it is not unlim-covered
— every submission bills.** ⚠ And a preset recommendation ("IN THE DARK",
`24bae836-2c4a-48e0-89b6-49fcc0b21612`) will **intercept a submission and return no job**;
it must be declined explicitly via `declined_preset_id`.
