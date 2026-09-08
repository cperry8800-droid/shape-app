# SHAPE — "Silhouettes" · the one-shot film

Owner's ask (2026-09-08, verbatim): *"i also want a video of shape like what apple did for the release of the
ipad. I want the same style, but show image of people using the app on their phone etc. But like a whole walk
through that blends together, almost in one shot with cool visual effects. Be very creative."* Then, on the first
style frames: *"have the images be more animated"* — and, with a picture of the iPod silhouette campaign: *"similar
to this … again like the apple ad."*

So the reference is the **silhouette campaign**: jet-black figures caught mid-motion on flat, saturated single-colour
fields, thin white earbud cords, a white player in the hand. Then, on the first silhouette set: *"the actual people i
want animated with the same idea as the apple ipod shots but more unique to shape. Half the people you are showing look
like real life"* and *"dont just replicate exactly the same images that apples made."* So: **no photoreal anywhere,
every figure stylised and in motion, the idea kept and the look Shape's own.** Four looks were shown as style frames
(§2a); **the owner chose THE BROADSHEET, PRINTED** (frame 8, the halftone runner on newsprint: *"this is good"*) with one
more ruling: *"she doesn't have to have her phone in her hand."* So the phone is no longer the portal — **the page is**:
the film's page is the app's page, the real UI lives in a column or takes the whole frame on a seam, and the figures
are free to move. §2b carries the world as built; the beat map below is re-cut for it. This file is v2 of the treatment; v1 ("Through the Glass", photoreal
rooms) is superseded and summarised at the end. The owner's rulings stand: **9:16 only · 45–60 s
with a 30 s cutdown · a new owned track, no voiceover, minimal type cards · style frames first, clips after the
look is approved.**

Then, on the hollow spread and the three tracks (same hour): *"those are better, but maybe create a hollowed out
person for the other animated people so it doesn't look like we are copying apple"* · *"and make sure the music is
deep house music"* · *"more unique music then typical fitness ad"* · *"music is good"* · *"have the people being
outlined by a highlighter look looking border with a black background"*. So: **the runner stays printed; every other
figure is hollow; the hollow figures are drawn as a highlighter stroke on a black page** — which is the printed
broadsheet's own lights-out page (§2b) — and the bed is deep house, measured and picked (§6).

---

## 1 · The concept

**Shape's silhouette film.** Black figures dancing, sprinting, pressing, cooking, kicking, skipping — each on one flat
colour, each with white earbuds in, each holding a white phone. The white phone is the real Shape broadsheet: its
light paper is the white player in the black hand. The camera never cuts: it pushes into the white phone, the real
app fills the frame, the colour flips on the downbeat, and we pull back out of the next silhouette's phone. Every
seam is a colour flip on a kick or a pass through the glass.

**One white cord runs through it.** The earbud wire is the line: it leaves one figure's ears, runs off the edge of
the frame, and is the thread of the coach's reply, the line the two orbs ride at the lock, the hairline rule of
the ledger, the arc of the ridge, and the rule under the wordmark at the end. Shape Radio is the reason the cord is
there, and the beat match is what the cord does at the lock: two orbs slide along it and become one.

**Colour is the day.** The film opens on Shape teal, runs through the campaign's saturated fields — blue, magenta,
lime, orange, yellow — and after the noon paper flip the fields go deep (navy, plum, ink teal) for the night
half, then the last flip lands back on teal for the mark. The music is a kick under every field; one bar of nothing
before the orbs lock; the kick coming back *is* the lock; the music cuts dead on the wordmark.

## 2a · The look — four candidates, Shape's own

| Look | What it is | What makes it Shape's, not Apple's | Style frames |
|---|---|---|---|
| **Silhouette, Shape edition** | jet-black or cream flat silhouettes mid-motion | the white earbud cord becomes a **ribbon of teal light** out of the phone; fields are **teal, cream newsprint with halftone, ink** and a two-tone diagonal (the ▸◂ geometry) rather than the candy rotation; a **coach and client leaning into the ▸◂ shape** | v3 rows 1–6 |
| **The broadsheet, printed** | figures as **coarse halftone press illustrations** in ink on cream newsprint, framed by a masthead double rule, empty column blocks and the ticker strip with its teal border; the phone the one crisp unscreened object | it is literally the app's own page — the masthead, the rules, the ticker, the halftone wash of the Home masthead | v4 rows 8–9 |
| **Figures of light** | the person drawn entirely from **streaking ribbons of teal and white light** on ink, a bundle of trails showing the last second of motion; the phone the one solid object | the brand's own Higgsfield motif (the runner's ribbons) taken to its end — the ribbon IS the person | v4 rows 10–11 |
| **Cut paper** | three-colour cut-card collage (cream, ink, teal) with the soft shadows of layered card; a torn teal wedge behind the figure | a print maker's world, not a screen's; three colours and no more | v4 rows 12–13 |

All four keep the mechanics of §2: the phone is a flat, trackable rectangle; the cut is a field change on a downbeat;
the real UI overlays opaque. A **motion test** (one 10 s `minimax_h3` clip, the Shape-edition silhouette dancer on teal
with the ribbon) was generated so the owner can judge movement rather than pose; it is in the Sources.
**Chosen: the broadsheet, printed** — and amended the same hour with hollow figures and the highlighter page; §2b.

## 2b · The world as built — the broadsheet, printed (CHOSEN 2026-09-08, amended the same hour: hollow figures, the highlighter page)

**Generated: the figure. Drawn: everything else.** The generator is asked only for what it does reliably — one
black figure in motion on a flat cream field, locked-off camera — and every Shape-specific element is built
deterministically in the sandbox on top of it, at exact geometry, on the measured grid:

| Layer | Built by | What |
|---|---|---|
| The figure | `minimax_h3`, 10 s, one take per figure (a second only on a reject) | a black silhouette in big motion on flat cream; no phone required |
| The print | Pillow, per frame | the figure re-screened into **coarse halftone dots** (dot size from local luma, the streaks from the figure's own motion blur), so it reads as a press photograph, not a sticker |
| The page | Pillow, once | the **masthead double rule**, thin column rules with empty grey blocks, the **ticker strip** along the bottom with its teal left border — the app's own typographic system (`BSMasthead` · `BSDateline` · `BSTicker`), drawn at the film's size |
| The ribbon | Pillow, per frame | one ribbon of teal light following the figure's motion path (the thresholded figure's centroid over time → spline), the only colour on the page apart from the ticker's border |
| The real UI | the CDP captures, opaque | in a **column** (a grey block resolves into a live page), or **full frame** on a seam — the app's masthead rule aligning with the film's masthead rule, so the page *becomes* the app page |

Why this is the right split: a prompted halftone can boil from frame to frame (dots re-sampling every frame), a
drawn screen is rock steady; the page geometry has to match the app's own masthead and the capture rects to the
pixel; and "no phone in hand" costs nothing when the UI is part of the page. If the direct-prompted printed look
(the first clip test) holds still enough, the re-screen pass is skipped for that shot and only the page, ribbon and
UI are drawn.

**The seams, in this world.** (A) **The page turn** — on a downbeat the page turns like a broadsheet (a vertical
wipe with a folded-edge shadow, 6 frames) and the next figure is already running on the next page; (B) **Column fill**
— a grey column block resolves into the real UI, the push goes into it, and the app's masthead rule meets the film's
rule so the page becomes the app; (C) **Re-screen** — the dots coarsen until the figure dissolves into a field of dots
and re-form as the next figure (the print's own transition); (D) **The ticker** carries the line across every seam
(the cord's job, now the app's own ticker strip); (E) **Lights-out** — the real *Pick your light* flips the page to
midnight paper: ink page, cream figures, the ribbon unchanged.

**The figures — one printed, the rest hollow.** The owner's note on the hollow spread: *"create a hollowed out
person for the other animated people so it doesn't look like we are copying apple."* So the **runner** keeps the
approved halftone print (frame 8), and **every other figure is hollow** — an outline with the page showing through,
which is the one thing a silhouette campaign can never be. Six hollow treatments were framed (v5, Sources) so the
choice is between kinds, and then the note that decided it: *"have the people being outlined by a highlighter look
looking border with a black background."* Six more frames (v6, Sources) on the two axes that note leaves open — the
stroke (a marker with overlapping passes and squared ends · a clean neon tube · a marker with a white ghost line) and
the colour (teal `34D6C5` · highlighter yellow-green `CCFF00` · hot pink `FF4FD8` · two colours for a coach and a
client leaning into the ▸◂ shape).

| Treatment | Frame | How it is BUILT (every one is an operation on the figure's mask) |
|---|---|---|
| Contour | v5-1 the lifter | the mask's boundary band, stroked in ink; the page and the column rules show through the interior |
| Halftone edge | v5-2 the cook | dot size from distance-to-edge, so the dots thin to nothing toward the centre |
| Misregistered plates | v5-3 the kicker | two boundary strokes, the second offset a few px, ink and teal |
| Vessel of light | v5-4 the skipper | the ribbon clipped to the mask — the light stays inside the outline |
| Print beside hollow | v5-5 runner + coach | the halftone re-screen on one figure, the contour on the other, one page |
| Woodcut | v5-6 the dancer | a hatch texture clipped to the boundary band |
| **Highlighter on black** | **v6-1…6** | **the boundary band in a fluorescent colour with a Gaussian glow, on the ink page; the interior is the page** |

⚠ **That table is the finding, not a menu.** Each treatment is a per-frame operation on the thresholded figure — the
same mask the ribbon and the print already come from — so the generator only ever has to deliver **one solid black
figure in motion on flat cream**, and never has to keep an interior empty across 240 frames. The hollow look, the
highlighter look and the print are all applied in Pillow after the fact, at exact stroke widths, in colours that
cannot drift, on a page that cannot boil. The three motion tests (Sources) settle the one remaining question: whether
the model can ALSO draw the look directly and steadily enough to skip the pass — the halftone runner on cream, a
hollow contour lifter on cream, and a highlighter runner on black. The hollow-lifter clip was run through the pass
the same hour (`hl.py`, below): its page measured for boil, its figure measured for hollowness, and the result
handed over as a link — the first frame of this film that was **built** rather than generated.

**The lights-out page — highlighter on black.** The black page is not a new world: it is the printed broadsheet's
own **midnight paper**, the state the real *Pick your light* flips the app into. So the film has two pages and one
seam between them: the **cream page** (the print — the runner in halftone, the masthead double rule, the column
blocks, the ticker with its teal border) and the **black page** (the same rules in dim cream, the same ticker, and
every figure a highlighter outline). The lights-out flip in §2 (E) is where one becomes the other, on a downbeat, in
the real Settings screen. Which page carries the opening is the owner's (§10 q1); the default is cream → black at
the flip, so the day half is print and the night half is light, and the close lands on the black page with the mark
in teal.

**The mark, top-left, every frame** (owner, on the first two style videos: *"have the shape triangles logo somewhere
visible in video. maybe in top left of screen"*). The ▸◂ two-triangle mark is cut from `public/SHAPE-logo-teal-white.png`
by its own geometry — the canvas is 3696×1782, the mark occupies rows 200–990 and columns 1551–2169 (618×790), and
the empty row run 990–1239 separates it from the wordmark; measured, and it agrees with the launch cut's `logo_tri`
split (`tri_rows` to canvas row 990, `txt_rows` from 1240). On the **black page** it is the mark as drawn, teal and
white, 150 px tall at (90, 30), above the dim masthead rule. On the **cream page** the white triangle is set in ink
(`min(r,g,b) > 190 → 16,16,16`, alpha kept) — on cream a white triangle is invisible and the mark would read as one
teal triangle, which the first overlay measured (teal only in the top-left crop, 41×56 px) — and it sits just below the
page's own masthead rules, whose rows are measured off the clip's first frame (`dark fraction > 0.8` across the
rule's span: rows 99–103, 111–126 and 135–139 — two hairlines and the band between them) rather than assumed. A
first placement ABOVE the rules had to fit in 99 px and came out 75 px tall — present, measured, and too small to
call visible — so the mark went below them at 130 px, over the top of the left column block. Then, on the approved pair (owner: *"i like it those are good, just make sure shape logo stays present in top left of
screen, maybe have it glow a little or have an effect that matches the video"*): the mark is present in **every** frame,
and it carries the launch cut's own effect — a **6 % throb on the measured grid** (`k = exp(−u/0.20)` per beat of the
pick, gated on `kick_by_beat` where the array is present) with a **teal glow** behind it that sits at a low floor and
flashes on the kick (cream page: floor 0.20, flash +0.55, blur 16; black page: floor 0.35, flash +0.65, blur 20 — the
highlighter's own glow). Drawn per frame in `final.py` (below), never generated.

**The phone, when it is in the shot** (owner: *"if you are going to keep phone in video, have the shape triangle logo on
the phone screen, so you can see it as she runs"*). The image-to-video of frame 8 keeps the runner's phone, and on the
cream page its screen is the **one pure-white object** — cream reads luma ~236, the screen 255 — so it is found per
frame by a threshold at 246 (masthead and ticker rows excluded, specks removed by a 2-px blur at 0.6), its centre is
the mask's centroid, its **tilt is the mask's own principal axis** (the eigenvector of the coordinate covariance,
clamped to ±45°), and its sides are `sqrt(12·λ)` of the two eigenvalues, which is exact for a uniform rectangle. The
mark rides that screen at 70 % of its short side, rotated with it, with the same throb and a small glow; the estimate
is smoothed 0.45/0.55 frame to frame, and a frame whose white count falls outside 4,000–60,000 px keeps the last good
one rather than jumping. On the **black page** the same mask draws the phone as a **highlighter outline** (the 5-px
boundary band in teal with a glow) with the mark lit inside it, so the runner carries the phone in both looks. This
is the treatment's original claim — *a white phone on a flat field can be TRACKED per frame by a threshold* — paid
for the first time.

**The sync bar** (owner, on the finished pair: *"make sure to add the hrm and bpm sync bar. Have one side of bar say
HRM and the other BPM, and when they both come together, the in sync appears"*). The lock is now a **bar**, not the
two-orb card: an instrument strip under the masthead rules (x 560–1120 at y 262, right of the mark), **HRM** and its
climbing figure at the left end, **BPM** and the track's tempo at the right, an ink dot and a teal dot sliding in from
the ends toward the centre as the heart rate closes on the tempo; on the first grid beat at or after 6.4 s the two dots
meet, the merged dot swells and pulses on the kick, and **IN SYNC** fades in above the bar over a quarter second, once.
The heart figure runs 84 → 120 on a smoothstep from 1.3 s to the meet; the tempo figure is **120 because the pick
measures 119.95** — the only digit on the page that is a measurement, as the honesty ledger requires; the heart rate
is illustrative, exactly as the launch cut's card is. Drawn per frame in `final3.py` (Montserrat ExtraBold, the one
weight the sandbox carries, letter-spaced by hand because Pillow has no tracking); the film's placement of the bar is
the beat map's call, this is the ten-second test's.

**`hl.py` — the highlighter pass, as run on the hollow-lifter clip (2026-09-08).** Reads the 1440×2560 frames off
ffmpeg, thresholds the figure (`luma < 90`, the ticker rows and the masthead rows excluded, the column rules removed
by column — a column whose dark fraction exceeds 0.55 is a rule, and rules are struck ±3 px), takes the stroke as the
ink itself (`MODE=outline`, for a clip that is already an outline) or as the boundary band of the blurred mask
(`MODE=solid`, for a halftone or silhouette clip: blur 4 → 0.35 merges the dots, blur 6 → the 0.12–0.88 band is the
edge), draws it in teal with a 16-px Gaussian glow at 60 % on a black page carrying the dim cream rules and the
ticker, trails the mask centroid over the last 18 frames as the ribbon, and muxes the first ten seconds of the picked
track under it. Two measurements ride along: **page boil** (mean |Δluma| between frames six apart in the blank band
above the masthead and the band below the ticker) and **hollowness** (every 24th frame, at quarter scale: the
background flood-filled from the frame border, and the enclosed pixels that are neither ink nor reachable counted
against the ink — a solid figure reads ≈ 0, a hollow one reads large). The script is in the run record below and in
the Sources.


## 2 · Why it reads as one shot — and why this world builds better than v1

- **Silhouettes have no continuity problem.** No face, no wardrobe, no skin to keep consistent across generated
  clips — a black shape on a flat field is the same person in every take. The v1 risk list was mostly faces and hands.
- **The phone can move.** On a flat colour field a white phone is the only large white blob, so its rect (or quad)
  is found per frame by a threshold — no OpenCV, twenty lines of numpy — and the real UI rides a dancing hand. v1 had
  to prop every phone still because the pipeline had only a temporal-minimum rect.
- **The cut is the colour.** A hard cut where only the field colour changes and the silhouette's pose is matched
  (arm up → arm up, on the downbeat) reads as one continuous shot; that is the campaign's own grammar. No xfade, no
  blur, no luma trick needed for the world-to-world seams — the glass passes are kept for the moments the app should
  fill the frame.
- **Compositing is a plain overlay.** Light-paper UI into a white rectangle on flat colour: opaque overlay, no
  screen-blend, no glint pass. Captions set black or white on the field in the house type.
- **The generator is on home ground.** "Black silhouette dancing on a flat blue background, white earbud wires" is a
  style video models reproduce reliably; the v7.3 globe took three submissions to land one frame, a silhouette on a
  field should land first time more often than not (two takes budgeted regardless).

| # | Mechanism | Execution |
|---|---|---|
| A | **Colour flip** (the campaign cut) | Hard cut on a downbeat between two clips whose silhouettes match pose and screen position; the field colour changes, nothing else. The flip is the pulse: the field also blinks 6 % brighter on every kick (`kick_by_beat`-gated, like every layer since v6). |
| B | **Through the glass** | Per-frame white-blob detection gives the phone's quad; the composite pushes into it (crop/scale on the world, the UI placed after at native res), hands off to the full-frame light-paper capture on a real UI event, and pulls out of the next clip's phone. |
| C | **The cord** | The earbud wire is drawn by Pillow as a continuous 4-px white spline that is fitted to each clip's own wire (threshold white, thin components, centroid per row → spline) and bridged across every seam; at the lock it straightens into the orb line. |
| D | **Lights-out** | The real Settings *Pick your light* flip light → midnight lands on a downbeat inside a full-frame moment; every field after it is a deep colour. The silhouettes stay black — they read on navy and plum as they do on lime. |
| E | **The close** | Every silhouette returns for one beat each, a colour per beat, the campaign's own montage rhythm, ending on teal; the last figure's phone fills the frame white, and the ▸◂ mark and the wordmark set themselves in black on it. |

## 3 · The beat map (30 bars; every time re-derived from the measured grid of the new track)

**Measured 119.95 BPM** (the pick, §6): bar = 2.0008 s, 30 bars = 60.02 s — the whole track; the kick is absent for bars 16–20 (30.6–39.6 s) and returns on the bar-21 downbeat (40.0 s), which is where the lock lands. Times of day are never
captioned; the app's own dateline clock carries them (browser clock set at capture). ⚠ Written for the silhouette
world before the owner chose the printed page; read "field" as the page's paper (cream, then midnight after the flip),
"the phone" as the UI's place in the page, and the colour flips as page turns — the order, bars, captures and the lock
are unchanged. The re-cut in the page's own terms follows now that the printed clips and the grid are in: the lights-out flip moves to the bar-13 downbeat (the kick thinning), the lock section to bars 16–20 (the breakdown), the kicker and the skipper one bar later each, the close over bars 29–30.

| Bars | Page | What we see | Figure | The REAL UI (in the page: a column, or full frame) | Out → |
|---|---|---|---|---|---|
| 1–2 | teal | A white cord draws itself across the frame on the first kick. A figure walks in from the left, earbuds in, phone up; the cord runs into her ears. | The riser, walking | Home cold load — masthead, dateline clock 05:58, ticker — small in her hand, then the push. | **B** push into the phone. |
| 3–4 | white (the page) | Full frame: the Home page, the slate row TRAIN tapped, the Train deck. *Written before you arrive.* | — | `BSClientHome` → `BSClientTrain`, one capture across the cut. | **A** flip to blue as we pull out. |
| 5–7 | electric blue | The lifter drives a kettlebell overhead on every downbeat, the phone in the other hand; the live session on it, a set logged, the month calendar. | The lifter, pressing | Train — live session → set logged → `BSCalendarMonth`. | **B** push into the calendar → **A** flip to lime on the grid. |
| 8–11 | lime | The cook tosses the pan, food hanging in black shapes; the phone propped in the corner of the frame. *Two dishes, one timeline.* Then the plate photo and a voice memo leave. | The cook, tossing | Eat — `BSPrepSession` mise stage (two dishes, *Merge the mise*, the timing block live) → `BSLogMealFlow` photo + voice → send. | **C** the cord whips out of frame right; **A** flip to magenta. |
| 12–14 | magenta | The coach, seated, one foot tapping; the same dateline row in trainer rust reads 07:41; the memo and the plate arrive; she replies. *A person. Not an algorithm.* | The coach, tapping | Coach app — `BSProToday` → `BSChatThread`, the reply sent. | **B** push into the thread; the rule under her reply is the cord → **A** flip to teal. |
| 15–19 | teal → black | **The lock.** The runner in full sprint, side-on, the cord straight across the frame with two orbs on it: white BPM (the track's measured tempo, the one digit that is a measurement) and black HRM, climbing. Bar 17 loses its kick; on the bar-18 downbeat the kick returns and the orbs touch: one white orb, **IN SYNC**, once. The field goes black for the beat of the lock and back to teal. | The runner, sprinting | No capture (the Radio screen's ON AIR / LIVE chrome may not appear). `mk_orb6.py` recoloured for the field. | **B** iris through the white orb → **A** flip to orange. |
| 20–21 | orange | The kicker lands a roundhouse on the downbeat; the Score ring on her phone sweeps closed with it; THIS TIER / THE LADDER. *One number that tells the truth.* | The kicker | Shape Score — the ring hero + the ladder, on a real account. | **B** push in; *Pick your light* flips to midnight → **D** every field after is deep. |
| 22–24 | navy | The skipper, rope a black arc, one jump per beat; the phone up in one hand: *How are you today* — one tap; the Habit Ledger, To do then To don't. *Small things, daily.* Then the profile, CLIMB. | The skipper | Check-in → Habit Ledger → Terrain, one capture on midnight paper. | **B** push into the ridge. |
| 25–26 | plum (the page, dark) | Full frame: the Terrain ridge on midnight paper, the cord as its skyline. *A profile that climbs with you.* | — | `BSTerrainProfile`, CLIMB, full frame. | **A** flip to ink teal on the ridge's peak. |
| 27–28 | one field per beat | The montage: every silhouette for one beat each, a colour per beat — riser, lifter, cook, coach, runner, kicker, skipper, riser — the cord jumping ear to ear. | All seven | Their phones small, each still on its page. | **E** the last phone fills the frame white. |
| 29–30 | white → teal | ▸◂ sets itself in black on the white page; the wordmark under it; the cord draws one last time as the rule beneath. *Different goals. One Community.* · ONE PLATFORM FEE · $5 /MO · CANCEL ANY TIME. The field flips to teal on the last downbeat and the music cuts dead. Twelve frames of silence. | No one | The drawn end card. | Loops: the last frame's cord is the first frame's. |

## 4 · The prompts

`minimax_h3` (10 s, 2K, 1440×2560, every submission bills, no negative-prompt field — exclusions are phrased
positively; decline the "IN THE DARK" preset with `declined_preset_id 24bae836-2c4a-48e0-89b6-49fcc0b21612`, which
intercepts any figure-on-dark submission). Seven figures, one take each to start (a second only on a reject). A take
is a reject if the figure gains a face or interior detail, if the page carries a gradient or moves, or if the model
adds a phone, text or a logo.

**Master block A — the cream page, the figure solid** (the default: the print and every hollow treatment are drawn
from this figure's mask in post; the model is asked only for what it does reliably):

> Vertical 9:16. A flat 2D animation in an editorial newspaper style unique to a brand called Shape. The whole
> frame is a static page of cream newsprint that never moves: a bold double hairline rule across the top like a
> masthead, thin vertical column rules with empty grey blocks and no letters, and a black ticker strip along the
> bottom with a teal left border, hex 34D6C5. One jet-black figure, {FIGURE}, {ACTION} in the middle of the page,
> pure black with hard clean edges and no interior detail, no face. Locked-off camera, no camera movement. No
> readable text, no logos, no phone.

**Master block B — the black page, the figure a highlighter outline** (direct-prompted; used only if motion test 3
holds the interior empty and the stroke steady — otherwise block A and the pass):

> Vertical 9:16. A flat 2D animation in an editorial style unique to a brand called Shape. The whole frame is a
> solid black page, hex 0A0A0A, that never moves, with faint typographic architecture in dim cream ink at low
> opacity: a double hairline rule across the top like a masthead, thin vertical column rules with empty darker grey
> blocks and no letters, and a ticker strip along the bottom with a bright teal left border. {FIGURE}, {ACTION} in
> the middle of the page, drawn only as a hollow outline: a thick fluorescent teal highlighter-marker stroke, hex
> 34D6C5, slightly translucent and uneven like a real highlighter pen, glowing softly against the black. The inside
> of the body stays empty black, the same as the background, in every frame: no fill, no face, no interior detail.
> A single thin ribbon of the same teal light trails behind. Locked-off camera, no camera movement. No readable
> text, no logos, no phone.

| Figure | Page | {FIGURE} · {ACTION} |
|---|---|---|
| The riser | cream, print → the first hollow | a woman with her hair flying · walking in from the left edge and breaking into a dance |
| The lifter | black | a broad-shouldered man · swinging a kettlebell from between his legs to eye level and back, one swing per beat |
| The cook | black | a cook in an apron · tossing a frying pan so chopped vegetables hang in the air as shapes, then catching them |
| The coach | black | a woman seated on a stool · one foot tapping hard, head nodding |
| The runner | **cream, the halftone print** (the approved frame 8) | a runner · sprinting in place side-on, knees driving high, ponytail streaming |
| The kicker | black | a woman with braids · throwing high roundhouse kicks, braids whipping |
| The skipper | black | a man · jumping rope, the rope a thin arc, one jump per beat |

The seven descriptions are placeholders in the register the approved frames used; casting remains the owner's
call, and a hollow outline makes it a matter of build and hair rather than face. The three motion tests already
generated (Sources: the halftone runner on cream, the hollow lifter on cream, the highlighter runner on black) are
the runner's and the lifter's first takes if they hold.

## 5 · Real UI to capture

Unchanged from v1 in substance — every screen is a real capture from the production `/m/` build through the CDP
loop (scale 3 for the full-frame moments), every segment with its act timestamps — with one simplification: the
UI is composited **opaque** into the white phone, light paper in the day half and midnight paper after the flip.

| Bars | App screen | Capture | Honesty note |
|---|---|---|---|
| 1–4 | Home cold load → TRAIN → Train deck | boot, clock 05:58, hold on the masthead, `go('TRAIN')` | no demo-cast text above the fold |
| 5–7 | live session → set logged → calendar | the TRAIN spot's segments | proven |
| 8–11 | prep mise (two dishes, *Merge the mise*, the timing block LIVE) → photo + voice → send | new part F in `body5b.js`; the Voice tab needs Chromium's fake media flags | *Two dishes, one timeline.* is the code's own line |
| 12–14 | coach Today (07:41) → thread → reply | a second Playwright context on a COACH account linked to the member | the one screen with a person's name: a real two-account rig by default, the demo cast kept out |
| 15–19 | (none) the two-orb card | `mk_orb6.py`, BPM from `meas_<track>.json`, recoloured white/black for the field | BPM is the only measured digit; IN SYNC once; no Radio screen |
| 20–21 | Score ring + ladder → *Pick your light* → midnight | the SCORE spot's segment + `go('Pick your light')` | a real account, the tier whatever it is |
| 22–26 | check-in → ledger → profile → CLIMB | the SCORE spot's segments on midnight paper | — |

## 6 · Music

Owner: *"make sure the music is deep house music"* · *"more unique music then typical fitness ad"* · then, on the
three candidates: *"music is good."* A typical fitness-ad bed is a big-room build — risers, a filtered lift, a drop,
a bright lead — so "unique" was read as its opposite: dry, dubby, textural, no build and no drop, with one
instrument a fitness ad would never carry. Three `sonilo_music` candidates (`duration: 60`, prompts verbatim in
Sources): **dub-dark** (detuned stabs with long dub tails, tape hiss, a kick from the first bar) · **muted trumpet**
(a jazz-club phrase over a dusty Rhodes) · **bowed cello** (one line that never resolves, rain as texture).

⚠ **A prompted BPM is a request and so is a prompted structure — measured, not trusted** (`beat.py`, the recipe's
own grid measurer: 8 kHz decode → 40–120 Hz kick band → onset → comb search 110–140 BPM with a 2 ms phase refine;
split halves must agree; `kick_by_beat` = the peak kick energy within ±40 ms of every grid beat, normalised):

| Track | Prompted | **Measured** | Halves | Kick from | Kick-less stretches (beats · seconds) | Centroid | < 90 Hz | On/half-beat contrast |
|---|---|---|---|---|---|---|---|---|
| **dub-dark** (pick) | 122, no breakdown | **119.95** · P 0.500208 · φ 0.055 | 120.0 / 120.0 | **0.06 s** — the first beat | 61–79 · **30.6–39.6 s**; tail from 56.1 s (the kick thins from 24 s) | **133.7 Hz** | **68.6 %** | 4.31 |
| muted trumpet | 120, no breakdown | **128.0** · P 0.46875 · φ 0.088 | 127.95 / 127.95 | 15.1 s | 0–31 · 0.1–14.6 s; 63–95 · 29.6–44.6 s | 288.5 Hz | 43.6 % | 5.92 |
| bowed cello | 124, no breakdown | **120.0** · P 0.5 · φ 0.068 | 120.0 / 120.0 | 10.1 s | 0–19 · 0.1–9.6 s; 77–118 · **38.6 s to the end** | 202.2 Hz | 47.5 % | 4.02 |

**The pick is the dub-dark track, on the measurement.** It is the darkest on both axes (centroid 134 Hz against 202
and 289; 69 % of its energy under 90 Hz against 48 and 44), its kick starts on the first beat and runs 24 s
unbroken, and its halves agree to the hundredth. The trumpet is the most unusual texture and the least usable bed:
`sonilo_music` gave it 128 BPM whatever was asked (the seventh track of eight to land there) and two 15-second
kick-less stretches, half the runtime. The cello loses its kick at 38.6 s and never gets it back, so a 45–60 s film
would close in silence.

⚠ **"No breakdown" was asked for and not delivered, and the film takes the breakdown rather than fighting it.** The
pick drops its kick for **9.0 s at 30.6–39.6 s** (beats 61–79) and brings it back on **beat 80 = 40.0 s**. At the
measured 119.95 BPM a bar is 2.0008 s and the 60 s track is exactly **30 bars**: the kick runs bars 1–12 full,
thins through bars 13–15, is absent for bars 16–20, returns on the **bar-21 downbeat** and runs to bar 28, then
tails. So the lock section (the two orbs, §3) sits **inside the breakdown the track already has** — nothing pulses
under the orbs because nothing is playing — and the lock lands on the kick's return at 40.0 s, which is the payoff
v1 planned to fake with a one-bar high-pass. The lights-out flip goes on the bar-13 downbeat where the kick starts
to thin; the close rides bars 29–30 over the tail, and the music cuts dead on the wordmark. **The 30 s cutdown is
bars 1–15 = 0–30.0 s and ends exactly where the kick drops out** (30.57 s): its wordmark lands on the last full
kick. The §3 beat map is re-cut on this grid next; every time in it is derived from `meas_d1.json`, never typed.
The opening is still low-passed from frame 0 and opens to full band on the first page turn.

## 7 · On-screen copy (eight lines, no voice)

Same eight lines as v1 — *Written before you arrive.* · *Two dishes, one timeline.* · *A person. Not an algorithm.*
(wants the owner's eye) · *One number that tells the truth.* · *Small things, daily.* · *A profile that climbs with
you.* · *Different goals. One Community.* · ONE PLATFORM FEE · $5 /MO · CANCEL ANY TIME — set by `captions.py` in
black on the light fields and white on the deep ones, 0.18 s fades. The only Radio words are the card's labels and
IN SYNC, once.

## 8 · Format and the 30 s cutdown

**9:16, 1440×2560, 24 fps.** The 30 s cutdown = 16 bars on the measured grid: teal cold open (2) → blue lifter (2)
→ lime cook (2) → magenta coach (2) → the lock (4) → orange kicker + the ring (1) → the montage (2) → the mark (1).

## 9 · Cost and schedule

| Stage | What | Billed |
|---|---|---|
| Style frames | v1 6 · v1b 6 · v2 6 · v3 6 · v4 6 · **v5 6 (hollow) · v6 6 (highlighter on black)** — all 2026-09-08, Sources | 42 images |
| Motion tests | the Shape-edition dancer on teal · **the halftone runner on cream · the hollow lifter on cream · the highlighter runner on black** | 4 `minimax_h3` |
| Music | **3 deep-house candidates, measured; the dub-dark track picked** | 3 `sonilo_music` |
| Clips | 7 figures × 1 take (a second only on a reject); the two cream tests may already be two of them | ~7 `minimax_h3` |
| The pass | `hl.py` on every clip (print or highlighter from the mask), the page, the ribbon, the UI | — (sandbox) |
| Captures | one sandbox lease | — |
| Renders | the two-stage runner, verify re-derived on the render | — |

## 10 · Open questions for the owner (with the default I will use)

1. **The pages.** Cream for the day half and black after the lights-out flip (default), or the black page
   throughout with the runner the one printed figure on it. The film has both pages either way; the question is
   whether the opening is print or light.
2. **The highlighter colour.** Teal only (default — the brand's one colour, and the ribbon and the ticker border
   already carry it), or a colour per figure from the v6 spread (yellow-green for the cook, pink for the skipper,
   teal + yellow-green for the coach and client). v6-6 shows the two-colour pairing.
3. **The coach thread.** A real two-account capture on your accounts (default) or the signed-out preview.
4. **The one new line.** *A person. Not an algorithm.* — keep (default) or silence over the coach.
5. **Casting.** Seven figures in §4, one phrase each; the runner is the printed frame-8 runner, everyone else a
   highlighter outline, so casting is build and hair rather than face.
6. **The world.** v1 closed on the night Earth with 44 marks; this world closes on the montage and the mark
   (default). A flat-graphic globe — continents as a highlighter outline on the black page, marks popping — is one
   extra generation if you want the world back.
7. **Whose numbers.** The Score, ledger and Terrain captures come from a real account (default: yours).

## 11 · What changed from v1, and why

v1 ("Through the Glass") was photoreal: seven strangers in seven rooms, the camera passing through their phones,
a teal hairline running the film. The first six style frames read as too still; the "more animated" pass added
motion blur and light ribbons and was already billed when the picture arrived. The picture named a different
reference — the silhouette campaign, not an iPad film — and it happens to dissolve v1's three hardest problems
(faces across clips, hands holding phones, a phone that must not move). The spine survives whole: through the
glass, one line, the lock, the lights-out, the close on the mark. The globe and the photoreal runner are the two
things this world does not carry; both stay available (§10).

---

## Sources — generated media, prompts verbatim (never re-generate what is listed here)

Prefix: `https://d8j0ntlcm91z4.cloudfront.net/user_3E30hta4RMpS2cDML3JnB5dGPnY/`. Every row submitted as
`nano_banana_pro`, reported by the service as `nano_banana_2`; params `aspect_ratio 9:16 · resolution 2k · count 1 ·
use_unlim false`; each prompt ends with the literal line `resolution: 2k` (written `\n\nresolution: 2k` below).
⚠ Not visually inspected by the agent — this container cannot reach the cloudfront host; the owner's look is the QA.

**v6 — highlighter on black (CURRENT), 2026-09-08 21:35 UTC — owner: *"have the people being outlined by a highlighter look looking border with a black background"*.** Same model and params as every row above.

| # | Look · figure | Job | File | Prompt (verbatim, as submitted) |
| --- | --- | --- | --- | --- |
| 1 | Highlighter · teal marker · the runner | `e1155701-c8fd-418d-aefb-fb87c3db40a2` | `hf_20260908_213504_e1155701-c8fd-418d-aefb-fb87c3db40a2.png` | *Vertical 9:16 animation frame in an editorial style unique to a brand called Shape. The whole frame is a solid black page, hex 0A0A0A. A runner in full sprint, side-on, knees driving high, ponytail streaming, is drawn only as a hollow outline: a thick fluorescent teal highlighter-marker stroke, hex 34D6C5, slightly translucent and uneven like a real highlighter pen with overlapping passes and squared stroke ends, glowing softly against the black. The inside of her body is empty black, the same as the background: no fill, no face, no interior detail. Faint typographic architecture frames her in dim cream ink at low opacity: a double hairline rule across the top like a masthead, thin vertical column rules with empty darker grey blocks and no letters, and a ticker strip along the bottom with a bright teal left border. A single thin ribbon of the same teal light trails behind her. Teal is the only colour on the page. No readable text, no logos, no phone.\n\nresolution: 2k* |
| 2 | Highlighter · teal neon tube · the lifter | `e0ee184a-a9d1-4b0c-be48-639269872c3b` | `hf_20260908_213504_e0ee184a-a9d1-4b0c-be48-639269872c3b.png` | *Vertical 9:16 animation frame in an editorial style unique to a brand called Shape. The whole frame is a solid black page, hex 0A0A0A. A broad-shouldered man at the top of a kettlebell swing, the bell at eye level, body driving upward in a wide stance, is drawn only as a hollow outline: one clean continuous glowing line in fluorescent teal, hex 34D6C5, like a neon tube bent around the edge of his body and the bell, with a soft teal glow bleeding a little into the black. The inside of his body is empty black, the same as the background: no fill, no face, no interior detail. Faint typographic architecture frames him in dim cream ink at low opacity: a double hairline rule across the top like a masthead, thin vertical column rules with empty darker grey blocks and no letters, and a ticker strip along the bottom with a bright teal left border. Teal is the only colour on the page. No readable text, no logos, no phone.\n\nresolution: 2k* |
| 3 | Highlighter · yellow-green marker · the cook | `5fda69fb-3e39-41e3-aeb7-7030f21c82ac` | `hf_20260908_213504_5fda69fb-3e39-41e3-aeb7-7030f21c82ac.png` | *Vertical 9:16 animation frame in an editorial style unique to a brand called Shape. The whole frame is a solid black page, hex 0A0A0A. A cook tossing a frying pan so a burst of chopped vegetables hangs in the air above it, body twisted with the throw, apron strings flying, is drawn only as a hollow outline: a thick fluorescent yellow-green highlighter-marker stroke, hex CCFF00, slightly translucent and uneven like a real highlighter pen with overlapping passes and squared stroke ends, glowing softly against the black; the pan and each vegetable are outlined the same way. The inside of every shape is empty black, the same as the background: no fill, no face, no interior detail. Faint typographic architecture frames her in dim cream ink at low opacity: a double hairline rule across the top like a masthead, thin vertical column rules with empty darker grey blocks and no letters, and a ticker strip along the bottom with a bright teal left border, hex 34D6C5. No readable text, no logos, no phone.\n\nresolution: 2k* |
| 4 | Highlighter · teal marker + white ghost line, pure black · the kicker | `079b14a5-4859-4e3f-a199-a7dd33e825b6` | `hf_20260908_213504_079b14a5-4859-4e3f-a199-a7dd33e825b6.png` | *Vertical 9:16 animation frame in an editorial style unique to a brand called Shape. The whole frame is pure black, hex 0A0A0A, with nothing else on it. A woman throwing a high roundhouse kick, braids whipping out, body coiled and dynamic, is drawn only as a hollow outline: a thick fluorescent teal highlighter-marker stroke, hex 34D6C5, slightly translucent and uneven like a real highlighter pen with overlapping passes and squared stroke ends, and a second thin white ghost line running just inside it, slightly offset, like a misregistered print. The inside of her body is empty black, the same as the background: no fill, no face, no interior detail. A single ribbon of the same teal light whips off her kicking foot across the frame. No rules, no boxes, no readable text, no logos, no phone.\n\nresolution: 2k* |
| 5 | Highlighter · hot-pink marker · the skipper | `d7359056-962d-469e-bf2e-f89d1a77169d` | `hf_20260908_213504_d7359056-962d-469e-bf2e-f89d1a77169d.png` | *Vertical 9:16 animation frame in an editorial style unique to a brand called Shape. The whole frame is a solid black page, hex 0A0A0A. A man jumping rope at the top of a jump, knees tucked, the rope a thin arc over his head, is drawn only as a hollow outline: a thick fluorescent hot-pink highlighter-marker stroke, hex FF4FD8, slightly translucent and uneven like a real highlighter pen with overlapping passes and squared stroke ends, glowing softly against the black; the rope is a thin stroke of the same pink. The inside of his body is empty black, the same as the background: no fill, no face, no interior detail. Faint typographic architecture frames him in dim cream ink at low opacity: a double hairline rule across the top like a masthead, thin vertical column rules with empty darker grey blocks and no letters, and a ticker strip along the bottom with a bright teal left border, hex 34D6C5. No readable text, no logos, no phone.\n\nresolution: 2k* |
| 6 | Highlighter · teal + yellow-green · coach and client as ▸◂ | `003a470e-f771-4bb4-94d7-bac6d2758e63` | `hf_20260908_213504_003a470e-f771-4bb4-94d7-bac6d2758e63.png` | *Vertical 9:16 animation frame in an editorial style unique to a brand called Shape. The whole frame is a solid black page, hex 0A0A0A. Two figures lean in hard toward each other from the left and right edges, a coach and a client, their bodies angled so that together they form two triangles pointing at each other with a narrow gap between, like a play and a rewind symbol facing each other. Both are drawn only as hollow outlines in thick fluorescent highlighter-marker strokes, slightly translucent and uneven like a real highlighter pen with overlapping passes and squared ends: the coach in teal, hex 34D6C5, the client in yellow-green, hex CCFF00. The inside of each body is empty black, the same as the background: no fill, no faces, no interior detail. Along the bottom runs a ticker strip in dim cream ink at low opacity with a bright teal left border, and nothing else on the page. No readable text, no logos, no phone.\n\nresolution: 2k* |

**v5 — the hollow figures on the cream page (CURRENT as the treatment catalogue; the highlighter page is the owner's ruling), 2026-09-08 21:29 UTC — owner: *"maybe create a hollowed out person for the other animated people so it doesn't look like we are copying apple"*.** Same model and params.

| # | Look · figure | Job | File | Prompt (verbatim, as submitted) |
| --- | --- | --- | --- | --- |
| 1 | Hollow · contour · the lifter | `d3e13965-9f9a-42f0-9dc0-5c789b9340cd` | `hf_20260908_212936_d3e13965-9f9a-42f0-9dc0-5c789b9340cd.png` | *Vertical 9:16 animation frame in an editorial newspaper style unique to a brand called Shape. The whole frame is a page of cream newsprint. A broad-shouldered man at the top of a kettlebell swing, the bell at eye level, body driving upward in a wide stance, is drawn as a hollow figure: a single bold continuous black ink contour traces the outside edge of his body and the bell, and the inside is completely empty, so the cream newsprint and the thin column rules run straight through him as if he were a stencil cut out of the page. No fill, no interior detail, no shading, no face. Typographic architecture frames him: a bold double hairline rule across the top like a masthead, thin vertical column rules, and a black ticker strip along the bottom with a teal left border, hex 34D6C5; the columns are empty grey blocks with no letters. A single ribbon of teal light, hex 34D6C5, rises out of the ticker strip's teal border and threads up through the empty inside of his body and around the bell, the only colour on the page apart from that border. No readable text, no logos, no phone.\n\nresolution: 2k* |
| 2 | Hollow · halftone edge · the cook | `7426359d-b080-4961-bcaa-1191be44dc09` | `hf_20260908_212936_7426359d-b080-4961-bcaa-1191be44dc09.png` | *Vertical 9:16 animation frame in an editorial newspaper style unique to a brand called Shape. The whole frame is a page of cream newsprint. A cook tossing a frying pan so a burst of chopped vegetables hangs in the air above it, body twisted with the throw, apron strings flying, is drawn as a hollow figure: only the outer edge of her body is printed, as a band of coarse black halftone dots that thins to nothing toward the centre, so the middle of her is empty cream newsprint with the page showing through, like a press photograph with its centre faded out. The pan and the vegetables are solid black shapes. No face, no interior detail. Typographic architecture frames her: a bold double hairline rule across the top like a masthead, thin vertical column rules, and a black ticker strip along the bottom with a teal left border, hex 34D6C5; the columns are empty grey blocks with no letters. A single ribbon of teal light, hex 34D6C5, curls up from the ticker strip's teal border through the hollow figure like steam, the only colour on the page apart from that border. No readable text, no logos, no phone.\n\nresolution: 2k* |
| 3 | Hollow · misregistered plates · the kicker | `cf24e97f-da09-4f31-bfca-65acf278a378` | `hf_20260908_212936_cf24e97f-da09-4f31-bfca-65acf278a378.png` | *Vertical 9:16 animation frame in an editorial newspaper style unique to a brand called Shape. The whole frame is a page of cream newsprint. A woman throwing a high roundhouse kick, braids whipping out, body coiled and dynamic, is drawn as a hollow figure in two thin contours: one black ink line and a second line in teal, hex 34D6C5, printed slightly offset from it like a misregistered press plate, with the inside of her body left completely empty cream newsprint so the thin column rules show straight through her. No fill, no interior detail, no face. Typographic architecture frames her: a bold double hairline rule across the top like a masthead, thin vertical column rules, and a black ticker strip along the bottom with a teal left border, hex 34D6C5; the columns are empty grey blocks with no letters. A single ribbon of teal light whips off her kicking foot across the page. Teal is the only colour on the page. No readable text, no logos, no phone.\n\nresolution: 2k* |
| 4 | Hollow · vessel of light · the skipper | `06ac95b4-983d-4cba-953a-c3d04f1a9ae7` | `hf_20260908_212936_06ac95b4-983d-4cba-953a-c3d04f1a9ae7.png` | *Vertical 9:16 animation frame in an editorial newspaper style unique to a brand called Shape. The whole frame is a page of cream newsprint. A man jumping rope at the top of a jump, knees tucked, the rope a thin black arc over his head, is drawn as a hollow figure: a bold continuous black ink contour with the inside of his body completely empty, and a single ribbon of teal light, hex 34D6C5, coils inside the hollow outline from his feet up to his chest as if the figure were a glass vessel filling with light; the light stays inside the contour and the cream page and the thin column rules show through everywhere it has not reached. No fill, no interior detail, no face. Typographic architecture frames him: a bold double hairline rule across the top like a masthead, thin vertical column rules, and a black ticker strip along the bottom with a teal left border, hex 34D6C5; the columns are empty grey blocks with no letters. Teal is the only colour on the page. No readable text, no logos, no phone.\n\nresolution: 2k* |
| 5 | Print beside hollow · runner + coach | `21c82347-8f40-4bf5-b865-4edac0ce5b34` | `hf_20260908_212936_21c82347-8f40-4bf5-b865-4edac0ce5b34.png` | *Vertical 9:16 animation frame in an editorial newspaper style unique to a brand called Shape. The whole frame is a page of cream newsprint carrying two figures in two different print treatments side by side. On the left, a runner in full sprint, side-on, knees driving high, drawn as a coarse halftone-dot illustration in black ink like a press photograph screened into big dots, high contrast, her hair and limbs streaking with motion. On the right, a woman seated on a stool with one foot lifted mid-tap and her head nodding, drawn as a hollow figure: a single bold black ink contour with the inside completely empty cream newsprint, the thin column rules running straight through her. Solid print beside hollow line, on one page. No faces, no interior detail. Typographic architecture frames them: a bold double hairline rule across the top like a masthead, thin vertical column rules, and a black ticker strip along the bottom with a teal left border, hex 34D6C5; the columns are empty grey blocks with no letters. A single ribbon of teal light, hex 34D6C5, streams off the runner across the page and passes through the hollow figure's outline, the only colour on the page apart from that border. No readable text, no logos, no phone.\n\nresolution: 2k* |
| 6 | Hollow · woodcut · the dancer | `fa9618a2-bd91-420a-9a54-2ea49e528b85` | `hf_20260908_212936_fa9618a2-bd91-420a-9a54-2ea49e528b85.png` | *Vertical 9:16 animation frame in an editorial newspaper style unique to a brand called Shape. The whole frame is a page of cream newsprint. A woman mid-air in an explosive dance jump, hair flying, arms thrown wide, is drawn as a hollow figure in the manner of a woodcut: her edge is made of short black engraved hatch lines that fade toward the inside, and the centre of her body is empty cream newsprint with the page and the thin column rules showing through. No fill, no face, no interior detail. Typographic architecture frames her: a bold double hairline rule across the top like a masthead, thin vertical column rules, and a black ticker strip along the bottom with a teal left border, hex 34D6C5; the columns are empty grey blocks with no letters. A single ribbon of teal light, hex 34D6C5, arcs up from the ticker strip's teal border through her hollow body, the only colour on the page apart from that border. No readable text, no logos, no phone.\n\nresolution: 2k* |

**Motion tests in the printed world — four `minimax_h3` clips, 2026-09-08 21:30–21:4x UTC.** Params on all four:
`aspect_ratio 9:16 · duration 10 · resolution 2K · use_unlim false · declined_preset_id
24bae836-2c4a-48e0-89b6-49fcc0b21612`; the service reports `width 1440 · height 2560 · aigc_watermark false`. Row 4
additionally carries `medias [{ value: bcfea348-9f2e-4bf5-bb30-c10b86d446be (the v4 frame-8 job), role: image }]`,
which the server coerced to `image_references` (*"MiniMax H3 backend expects schema-key media roles"*) — recorded
because a re-submission with `role: image` is accepted and adjusted, and one with a role the server cannot coerce is
not. ⚠ Every clip is 243 frames / 10.125 s at 24 fps, measured on rows 1–2 (`ffprobe -count_frames`).

| # | What | Job | File | Prompt (verbatim, as submitted) |
| --- | --- | --- | --- | --- |
| 1 | Motion test · the printed runner (halftone) on cream | `58956ff3-ac65-483d-aa7c-fee713e94aa6` | `hf_20260908_213008_58956ff3-ac65-483d-aa7c-fee713e94aa6.mp4` | *Vertical 9:16. A flat 2D animation in an editorial newspaper style unique to a brand called Shape. The whole frame is a static page of cream newsprint that never moves: a bold double hairline rule across the top like a masthead, thin vertical column rules with empty grey blocks and no letters, and a black ticker strip along the bottom with a teal left border, hex 34D6C5. A runner sprints in place side-on in the middle of the page, knees driving high, ponytail streaming, drawn as a coarse halftone-dot illustration in black ink like a press photograph screened into big dots, high contrast; the dots stay locked to the page and do not shimmer or re-sample while she moves. A single ribbon of teal light trails behind her and around her body, the only colour on the page apart from the ticker's border. Locked-off camera, no camera movement. No readable text, no logos, no phone.* |
| 2 | Motion test · the hollow lifter (contour) on cream | `cec35263-6f44-47f3-b852-6713b5acade7` | `hf_20260908_213007_cec35263-6f44-47f3-b852-6713b5acade7.mp4` | *Vertical 9:16. A flat 2D animation in an editorial newspaper style unique to a brand called Shape. The whole frame is a static page of cream newsprint that never moves: a bold double hairline rule across the top like a masthead, thin vertical column rules with empty grey blocks and no letters, and a black ticker strip along the bottom with a teal left border, hex 34D6C5. A broad-shouldered man swings a kettlebell from between his legs up to eye level and back, one big swing on every beat of a fast rhythm, drawn as a hollow figure: a single bold continuous black ink contour around his body and the bell with the inside completely empty, so the cream page and the column rules show straight through him like a stencil; no fill, no interior detail, no face. A single ribbon of teal light, hex 34D6C5, rises from the ticker strip's teal border and threads up through the empty inside of his body, following the bell. Locked-off camera, no camera movement. No readable text, no logos, no phone.* |
| 3 | Motion test · the highlighter runner on black | `c9e5397a-90b8-4e77-8d8a-82a69b96bcb4` | `hf_20260908_213508_c9e5397a-90b8-4e77-8d8a-82a69b96bcb4.mp4` | *Vertical 9:16. A flat 2D animation in an editorial style unique to a brand called Shape. The whole frame is a solid black page, hex 0A0A0A, that never moves, with faint typographic architecture in dim cream ink at low opacity: a double hairline rule across the top like a masthead, thin vertical column rules with empty darker grey blocks and no letters, and a ticker strip along the bottom with a bright teal left border. A runner sprints in place side-on in the middle of the page, knees driving high, ponytail streaming, drawn only as a hollow outline: a thick fluorescent teal highlighter-marker stroke, hex 34D6C5, slightly translucent and uneven like a real highlighter pen, glowing softly against the black. The inside of her body stays empty black, the same as the background, in every frame: no fill, no face, no interior detail. A single thin ribbon of the same teal light trails behind her. Locked-off camera, no camera movement. No readable text, no logos, no phone.* |
| 4 | Image-to-video · the approved frame 8 animated (owner: *"make video with look also"*, with the frame) | `7c0a575a-eb94-40be-86c2-68466b98aa8f` | `hf_20260908_214117_7c0a575a-eb94-40be-86c2-68466b98aa8f.mp4` | *Animate this exact frame without changing its style: a flat 2D editorial newspaper animation. The page of cream newsprint, the masthead rule, the grey column blocks and the ticker strip stay perfectly still; the halftone dots stay locked to the page and do not shimmer. The runner sprints in place in full stride, knees driving high, arms pumping, ponytail streaming, her limbs streaking with motion, and the ribbon of teal light flows out of the phone and around her body in a continuous wave. Locked-off camera, no camera movement, no zoom. No new text, no logos.* |

**The highlighter pass, run on motion test 2 (2026-09-08 21:38–21:40 UTC).** `MODE=outline python3 hl.py lifter.mp4
lifter_hl.mp4` on a fresh sandbox (`lifter.mp4` = row 2 fetched from its `rawUrl`; the pick's `.m4a` muxed under it,
first ten seconds). Output **1440×2560 · 243 frames · 10.148 s · md5 `290c84b0a4366e10953b3220e676c394` ·
1,872,533 B**; handed over as a link (gofile guest, litterbox 72 h), never committed. **Measured on the source clip:**
page boil above the masthead **0.022 mean / 0.086 max** luma levels between frames six apart, below the ticker
**0.091 / 0.211** — the generated page does not boil. **Hollowness** (enclosed ÷ ink, every 24th frame): 0.87 · 0.03
· 0.85 · **0.00** · 0.76 · 0.06 · 0.34 · 0.52 · **0.00** · 0.83 · 0.87 — the ink area is constant (11.3–13.3 k at
quarter scale) while the enclosed area swings between ~10 k and 0, so the model's contour **opens and closes** from
frame to frame; on frames 72 and 192 the background floods the whole interior through a gap. ⚠ That is the
generator's hollow figure failing exactly where the build rule said it would, and it is why the pass draws the
outline from a **solid** figure's mask (`MODE=solid`) in the film rather than trusting a generated outline: a mask
boundary is closed by construction. `rule columns []` — the model drew the columns as grey blocks (luma ≈ 180,
above the 90 threshold), so nothing had to be struck.

```python
# hl.py — the highlighter pass. python3 hl.py <src.mp4> <out.mp4>; MODE=outline (a clip that is already an outline) or MODE=solid (a halftone or silhouette clip). Expects d1.m4a (the pick) beside it.
import sys, os, subprocess, json, numpy as np
from PIL import Image, ImageFilter, ImageDraw
from collections import deque
SRC=sys.argv[1]; OUT=sys.argv[2]; MODE=os.environ.get('MODE','outline'); W,H=1440,2560
TEAL=np.array([0x34,0xd6,0xc5],np.float32); CREAM=np.array([0xf2,0xea,0xd8],np.float32)
o=subprocess.run(['ffprobe','-v','error','-select_streams','v:0','-count_frames','-show_entries','stream=width,height,r_frame_rate,nb_read_frames','-of','json',SRC],capture_output=True,text=True).stdout
st=json.loads(o)['streams'][0]; print('probe',st,flush=True); fps=st['r_frame_rate']
rd=subprocess.Popen(['ffmpeg','-v','error','-i',SRC,'-vf',f'scale={W}:{H}','-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE,bufsize=10**8)
wr=subprocess.Popen(['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',fps,'-i','-','-i','d1.m4a','-map','0:v','-map','1:a','-shortest','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k',OUT],stdin=subprocess.PIPE)
page=Image.new('RGB',(W,H),(10,10,10)); d=ImageDraw.Draw(page); c=tuple(int(v*0.30+10*0.70) for v in CREAM)
d.rectangle([90,200,W-90,203],fill=c); d.rectangle([90,214,W-90,215],fill=c)
for x in (90,W//3,2*W//3,W-90): d.rectangle([x,260,x+1,H-330],fill=c)
d.rectangle([90,H-300,W-90,H-200],fill=(28,28,28)); d.rectangle([90,H-300,102,H-200],fill=(0x34,0xd6,0xc5))
page=np.asarray(page).astype(np.float32)
def bl(m,r): return np.asarray(Image.fromarray((m*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float32)/255.0
def dil1(m):
    o=m.copy()
    for dy in (-1,0,1):
        for dx in (-1,0,1): o|=np.roll(np.roll(m,dy,0),dx,1)
    return o
FR=W*H*3; n=0; trail=deque(maxlen=18); stab_top=[]; stab_bot=[]; hollow=[]; prev=None; rulecols=None
while True:
    b=rd.stdout.read(FR)
    if len(b)<FR: break
    f=np.frombuffer(b,np.uint8).reshape(H,W,3); g=(0.299*f[...,0]+0.587*f[...,1]+0.114*f[...,2])
    if prev is not None and n%6==0: stab_top.append(float(np.abs(g[20:120]-prev[20:120]).mean())); stab_bot.append(float(np.abs(g[H-120:H-20]-prev[H-120:H-20]).mean()))
    prev=g
    m=g<90; m[H-340:]=False; m[:250]=False
    if rulecols is None:
        frac=m.mean(axis=0); rulecols=np.nonzero(frac>0.55)[0]; print('rule columns',rulecols.tolist()[:40],flush=True)
    for x in rulecols: m[:,max(0,x-3):x+4]=False
    if MODE=='solid': m=bl(m,4)>0.35
    if n%24==0:
        s=m[::4,::4]; bg=~s; reach=np.zeros_like(bg); reach[0,:]=bg[0,:]; reach[-1,:]=bg[-1,:]; reach[:,0]=bg[:,0]; reach[:,-1]=bg[:,-1]
        for _ in range(500):
            nr=dil1(reach)&bg
            if (nr==reach).all(): break
            reach=nr
        enc=(~reach)&~s; hollow.append((n,int(s.sum()),int(enc.sum())))
    ys,xs=np.nonzero(m)
    if len(xs)>200: trail.append((float(xs.mean()),float(ys.mean())))
    if MODE=='solid':
        bm=bl(m,6); stroke=((bm>0.12)&(bm<0.88)).astype(np.float32)
    else: stroke=bl(m,1.2)
    S=Image.fromarray((np.clip(stroke,0,1)*255).astype(np.uint8))
    glow=np.asarray(S.filter(ImageFilter.GaussianBlur(16))).astype(np.float32)/255.0
    a=np.clip(glow*0.6+stroke*0.95,0,1)[...,None]; out=page*(1-a)+TEAL*a
    if len(trail)>2:
        R=Image.new('L',(W,H),0); dr=ImageDraw.Draw(R); pts=list(trail)
        for i in range(1,len(pts)): dr.line([pts[i-1],pts[i]],fill=int(255*i/len(pts)),width=6)
        ra=np.asarray(R.filter(ImageFilter.GaussianBlur(2))).astype(np.float32)[...,None]/255.0*0.8; out=out*(1-ra)+TEAL*ra
    wr.stdin.write(np.clip(out,0,255).astype(np.uint8).tobytes()); n+=1
wr.stdin.close(); wr.wait(); rd.wait()
print('frames',n,'page_stab_top mean/max',round(float(np.mean(stab_top)),3),round(float(np.max(stab_top)),3),'page_stab_bot mean/max',round(float(np.mean(stab_bot)),3),round(float(np.max(stab_bot)),3))
print('hollow (frame, ink/16, enclosed/16, ratio):',[(a,b,c_,round(c_/max(1,b),2)) for a,b,c_ in hollow])
print('HL-DONE',flush=True)
```

**The two style videos — the same runner in both looks, the pick under each (2026-09-08 21:41–21:5x UTC).**
Owner: *"make video with look also"* (with frame 8) · *"2 videos with different styles"* · *"make sure to use the
deep house music you made in those vids"* · *"have the shape triangles logo somewhere visible in video. maybe in top
left of screen"*. Source: motion test 4, the image-to-video of frame 8 (`hf_20260908_214117_7c0a575a-….mp4`, md5
`2f9ba3869d17016d6a7a04e81c4e25f9`, 243 frames / 10.125 s), so the two videos share every frame of motion and differ
only in the look:

| Video | How it was made | Frames · s | md5 | bytes |
|---|---|---|---|---|
| **A — the print** (cream page, halftone runner, the phone as the frame has it) | the source clip as generated; the pick's first 10.125 s muxed under it with a 0.4 s fade-out; the ink-and-teal mark at 130 px, top-left at (100, 150), just below the page's own masthead rules (measured off the clip's first frame at rows 99–139: two hairlines and the 16-px band between them) | 243 · 10.126 | `fcaf0dce379659bddf41142828f31f7b` | 18,239,082 |
| **B — the highlighter** (black page, the same runner as a teal highlighter outline, glow, ribbon) | the source clip through `hl.py` `MODE=solid` (the halftone dots merged into the figure by a 4-px blur at 0.35, the boundary band of a 6-px blur between 0.12 and 0.88 as the stroke, the two column rules of the frame-8 page struck at columns 391–393 and 1063–1064), the pick muxed with the same fade; the teal-and-white mark at 150 px, top-left | 243 · 10.148 | `97c5b0945463bca4f7a972bb8df7aeb9` | 8,262,680 |

Both handed over as links (gofile guest · litterbox 72 h), never committed. ⚠ **The ten seconds are not cut to the
grid** — the clip's stride is the model's own rhythm and the kick simply runs under it from beat 0; the film proper is
planned in bars from `meas_d1.json` (§6) and every figure lands on a downbeat. Measured on the source (the pass's own
instruments): page boil above the masthead 0.088 mean / 0.767 max, below the ticker 0.114 / 0.403 — the image-to-video
page holds still, the max a single ribbon pass through the band; hollowness 0.00–0.03 on every sampled frame, i.e. a
**solid** figure, which is exactly what `MODE=solid` wants. The first pair uploaded without the mark (A md5
`b5be286440cffd101ed6faa68c7725a0`, B `69205cfeaab6a4547cff00b9dfecb0df`) and the second pair with the teal-and-white
mark on both (`9966e8dca6fc4d251b4d2d5cbbe39ddb` / `7263b7cbd9c950ccc71a00f4112101f0`) are superseded by the row
above: on cream the white triangle did not read. A third A (`fcb6ba395d285ed42f8c9872141deac0`, the ink-and-teal mark at
75 px above the rules) is superseded for size. Measured on the final A at 3.0 s, top-left 400×320 crop: teal 2,310 px
and ink 2,331 px below row 140, the two triangles side by side; on the final B: teal 2,956 px and white 2,986 px.

**The approved pair, finished — the mark glowing on the kick, the phone screen carrying it (2026-09-08 22:0x UTC).**
Owner: *"i like it those are good, just make sure shape logo stays present in top left of screen, maybe have it glow
a little or have an effect that matches the video"* · *"if you are going to keep phone in video, have the shape
triangle logo on the phone screen, so you can see it as she runs"*. Both videos re-drawn from the same source
(`final.py`, below) over the muxed print video and the highlighter pass:

| Video | md5 | bytes | measured |
|---|---|---|---|
| **A — the print**, the mark top-left with a teal glow flashing on the kick, the mark on the phone screen tracked and tilted with it | `6359a267ea73a5aa90bb63a03114fe7a` | 18,347,092 | top-left teal 2,549 px on a beat against 2,393 mid-beat; 2,479 at 0.2 s, 2,339 at 9.9 s |
| **B — the highlighter**, the same mark and glow top-left, the phone as a teal outline with the mark lit inside it | `ae681a79f9816b79df8459a6acef0725` | 8,498,456 | top-left teal 6,585 on a beat against 6,423 mid-beat; 11,162 at 0.2 s, 9,325 at 9.9 s |

⚠ **SUPERSEDED THE SAME HOUR — THE PHONE CANNOT BE TRACKED ON THIS CLIP, AND THE NUMBERS SAY WHY.** The top-left
mark and its glow worked as designed (the measurements above). The phone did not: **123 of 243 frames had no white
screen to find** — on the missed frames the box around the last known position holds 741–964 pixels above luma 236
in a 440×520 window (the screen is ~17,000 when it reads) and a dark blob where the phone was, i.e. the image-to-video
model renders the runner's phone as a **dark object in half its frames** and a white screen in the other half. A held
estimate would have painted the mark on a dark blob or on empty page for five seconds, so the pair was not handed
over. *A white phone on a flat field is trackable in a STILL; whether it is trackable in a clip is a property of the
clip, and this one says no.*

**The route that works: put the mark on the phone in the SOURCE, and let the model carry it.** No upload tool exists
in this session (`medias` accepts only a prior generation's job id), so the still with the mark on its screen had to
be a generation itself — two `nano_banana_pro` edits of frame 8 (job `bcfea348…` as `image_references`; the server
coerces `role: image` to that key), then `minimax_h3` image-to-video from the better one, then the finishing pass
(`final2.py`, below: the top-left mark with its glow on both pages, the highlighter pass for the black page with every
teal pixel of the source carried across as teal light — the ribbon and the screen's teal triangle — and the pick under
both). Measured on the two edits against frame 8: the screen region (frame 8's white screen at (1232, 748)–(1388, 956),
17,344 px) now holds **3,494 / 3,635 teal px** (edit 1 / edit 2) where it held none, so the mark landed on both; and the
rest of the frame differs from frame 8 by a mean of 25.2 / 24.5 luma levels — **the page is untouched** (top-band
median 240 → 241, column block 201 → 201) and the difference lives where the figure is (a 6×4 grid reads 7–16 on the
page cells and 31–54 on the runner's cells), i.e. the model **re-drew the runner** rather than editing pixels. Edit 2
was taken (marginally closer, the mark marginally larger); the two edits differ from each other by under one level in
every cell, so the choice is not load-bearing.

| # | What | Job | File | Prompt (verbatim, as submitted) |
| --- | --- | --- | --- | --- |
| E1 | Edit of frame 8 · the mark on the phone screen, geometric description | `f45a8cde-6053-4993-8e01-4a0b1e917186` | `hf_20260908_221043_f45a8cde-6053-4993-8e01-4a0b1e917186.png` · md5 `c43779e5e90065b35512f5727803dd8c` | *Edit this image and change nothing except the phone screen. The runner's white smartphone screen now displays the Shape brand mark, drawn flat and crisp on the white screen, filling about two thirds of the screen's width and centred: two identical right-angled triangles arranged diagonally like a tall bracket. The upper triangle sits against the screen's top-right, its right angle at the top-right corner and its hypotenuse facing down-left, filled solid teal, hex 34D6C5. The lower triangle sits against the screen's bottom-left, its right angle at the bottom-left corner and its hypotenuse facing up-right, filled solid black. A thin diagonal strip of white screen separates the two hypotenuses. No other text or icons on the screen. Everything else in the image, the halftone runner, the cream newsprint page, the masthead rule, the column blocks, the ticker strip and the teal ribbon, stays exactly as it is.\n\nresolution: 2k* |
| E2 | Edit of frame 8 · the mark on the phone screen, plain description (TAKEN) | `cf48d7dc-bb00-4342-9885-dba00a05366f` | `hf_20260908_221043_cf48d7dc-bb00-4342-9885-dba00a05366f.png` · md5 `f8ef0c7a90b3081001f65027d924b001` | *Same image, identical in every way, except that the phone's white screen now shows a logo: two solid triangles pointing at each other diagonally, one teal, hex 34D6C5, in the top right of the screen and one black in the bottom left, with a narrow white gap between them, centred on the screen and filling most of it. Nothing else in the picture changes.\n\nresolution: 2k* |
| 5 | Image-to-video of E2 (`medias` role `image` → `image_references`; `declined_preset_id 24bae836-2c4a-48e0-89b6-49fcc0b21612`; 9:16 · 10 s · 2K · `use_unlim false`) | `821c6aa5-da6d-4fb6-9a15-a611557dd696` | `hf_20260908_221227_821c6aa5-da6d-4fb6-9a15-a611557dd696.mp4` | *Animate this exact frame without changing its style: a flat 2D editorial newspaper animation. The page of cream newsprint, the masthead rule, the grey column blocks and the ticker strip stay perfectly still; the halftone dots stay locked to the page and do not shimmer. The runner sprints in place in full stride, knees driving high, arms pumping, ponytail streaming, her limbs streaking with motion, and the ribbon of teal light flows out of the phone and around her body in a continuous wave. The phone stays in her hand with its screen facing the camera, and the screen keeps showing the two-triangle mark, teal and black, crisp and unchanged, in every frame. Locked-off camera, no camera movement, no zoom. No new text, no other logos.* |

The owner then sent the ▸ alone, teal on white, as the reference (*"its still wrong, and the music is gone"* — said of
the gallery clip, which is the raw generation: no track, the model's mark). Measured off that picture, the triangle is
0.73 wide to tall (apex at 655 of a 98–1370 base); the ▸ half of `tri.png` is 0.73 as well, so the file is the target
and the finished pass, which draws the file, is the answer — the gallery never shows a finished video. The mark's own
geometry, read off `tri.png` rather than assumed, because the edit prompts had to describe it: two
identical right triangles set diagonally in a 618×790 box — the upper one against the top-right (right angle at that
corner, hypotenuse facing down-left), the lower one against the bottom-left — one teal and one white (86,510 and
86,911 px), a narrow diagonal gap between the hypotenuses.

**The finished pair from the marked still (`final2.py`):**

| Video | md5 | bytes | measured |
|---|---|---|---|
| **A — the print**, the marked phone carried by the model, the mark top-left glowing on the kick | `4469c98c6f03716e39adf1e9a5f222ca` | 18,227,424 | top-left teal 2,545 on a beat against 2,390 mid-beat; 2,477 at 0.2 s, 2,350 at 9.9 s; the screen shows teal touching white in **10 of 10** sampled seconds (53–527 px) where the tracked route had it in half |
| **B — the highlighter**, the same source through the pass, every teal pixel carried across, the mark top-left | `679c7337fd0979e095c7e8529100525f` | 6,731,956 | top-left teal 11,478 on a beat against 11,302 mid-beat; 11,374 at 0.2 s, 11,303 at 9.9 s |

⚠ **SUPERSEDED BY THE OWNER'S NEXT TWO NOTES, from the gallery clip:** *"the phone is off, make the logo smaller so its
proportionate on the screen. also the phone doesnt come down with her arms"* and *"make sure to add the hrm and bpm sync
bar…"*. Both the size and the floating phone live in the source: edit 2 asked for a mark *"filling most of"* the screen,
and the motion prompt said the phone *"stays in her hand with its screen facing the camera"*, which the model read as
*stays still*. So: a third edit with a **small** mark (E3 — measured against E2 on the same screen region: teal
**2,045 px against 3,635**, white **15,284 against 12,560**, i.e. the mark at ~56 % of E2's area with the screen mostly
empty around it), and a motion prompt that says the phone is **gripped and moves with the hand through every arm swing,
rising and falling and tilting, never floating**.

| # | What | Job | File | Prompt (verbatim, as submitted) |
| --- | --- | --- | --- | --- |
| E3 | Edit of frame 8 · the mark small on the phone screen (TAKEN) | `02168b19-b951-43ff-aa92-4b3f484e6e6a` | `hf_20260908_222352_02168b19-b951-43ff-aa92-4b3f484e6e6a.png` · md5 `85c75d4fdbfd64e5729770c3aedd9b12` | *Same image, identical in every way, except that the phone's white screen now shows a small logo, centred on the screen and no wider than a third of the screen's width, with plenty of empty white screen around it: two solid triangles pointing at each other diagonally, one teal, hex 34D6C5, at the upper right of the logo and one black at the lower left, with a narrow white gap between them. The phone itself stays exactly the same size, in the same place, in her hand. Nothing else in the picture changes.\n\nresolution: 2k* |
| 6 | Image-to-video of E3, the phone gripped (same params as 5) | `2ca2dd4c-a9b9-4d78-b52e-0c638ff12062` | `hf_20260908_222614_2ca2dd4c-a9b9-4d78-b52e-0c638ff12062.mp4` | *Animate this exact frame without changing its style: a flat 2D editorial newspaper animation. The page of cream newsprint, the masthead rule, the grey column blocks and the ticker strip stay perfectly still; the halftone dots stay locked to the page and do not shimmer. The runner sprints in place in full stride, knees driving high, arms pumping hard, ponytail streaming, her limbs streaking with motion. The phone is gripped tightly in her hand and moves with that hand through every arm swing, rising and falling and tilting with the arm as it pumps, never floating, never staying still on its own; its screen keeps showing the small two-triangle logo, teal and black, unchanged. The ribbon of teal light flows out of the phone and around her body in a continuous wave. Locked-off camera, no camera movement, no zoom. No new text, no other logos.* |

**The pair from E3's clip, with the sync bar and the exact mark on the screen (`final5.py` = `final4.py` with the
screen pass gated, below):** the gripped-phone clip is `hf_20260908_222614_2ca2dd4c-….mp4`, md5
`e3d014dbfd923e9b0cdc49d7bd3a44a7`, 243 frames. ⚠ **This clip darkens the phone on the down-swing too: the screen
reads in 140 of 243 frames** (`final4.py`'s first run: 103 misses), so a held fit would float the mark for the rest —
and on the missed frames a stray white patch passed the 1,500-px floor and produced a fit of ~35 × 75 px at
(1112, 1103), a shape the screen (62–73 × 156–164 in every hit) never has. `final5.py` therefore (a) accepts a fit only
inside 55–95 × 130–200 px, (b) draws the exact mark only while the screen is lit, with a confidence that halves on
every missed frame and a fade below 0.2 rather than a hold, and (c) paints the model's mark out only on hit frames.
The mark is exact whenever the phone is legible and absent when the model has darkened it; the full film's phone
shots will be prompted with a screen that stays lit, and this pass applies unchanged. The `final4.py` outputs (A
`75492a7a2ef9f650b021f00fa7fe824c` 17,110,586 B · B `9468bbba0a1fb5924b3d25a2e7608a13` 5,770,967 B) are superseded and
were not handed over; their bar and top-left measurements are identical to the rows below.

| Video | md5 | bytes | measured |
|---|---|---|---|
| **A — the print**: the small mark on the gripped phone, the mark top-left glowing on the kick, the HRM / BPM bar closing to IN SYNC | `e412e2fb6cf7ff82428a9786859d4696` | 17,183,130 | the screen fit accepted on 120 of 243 frames, every accepted fit 62–73 × 156–164 px at confidence 1.0 (the gate rejected every stray patch); the bar: teal dot 1068 → 826 and IN SYNC 6,070 teal px above the bar from the meet on beat 13 (6.558 s), none before; top-left teal 2,542 on a beat against 2,389 mid-beat, 2,483 at 0.2 s and 2,340 at 9.9 s |
| **B — the highlighter**: the same, on the black page | `dd5c4510ca54e5ffde6594d6aff64cf4` | 5,753,295 | same source and fits; the bar identical (6,150 teal px of IN SYNC); top-left teal 3,945 on a beat against 3,767 mid-beat, 3,847 at 0.2 s and 3,771 at 9.9 s |

Handed over as links (gofile guest · litterbox 72 h), never committed. Every earlier pair is superseded by this one.
⚠ **AND THE MARK ON THE SCREEN IS THE FILE, NOT THE MODEL'S DRAWING** (owner, on E3's clip: *"the logo is wrong, the
triangles need to be the same as the logo, spacing on sizing is off"*). The model's mark is a description made
picture; the logo is a file. So the finishing pass finds the screen per frame from its **white pixels alone** (the
ribbon is teal and must not pull the fit: a 16-px closing bridges the mark's hole, the hull's principal axis gives
the tilt, its eigenvalues the sides less the 32 px the closing added), **paints the model's mark out** (every
non-white pixel inside the hull eroded 9 px goes white on the cream page, page-black on the black one) and draws
`tri.png` — the mark cut from the logo canvas — at 42 % of the screen's long side, rotated with it, throbbing on the
grid. On the marked-still clips this is feasible where it was not on the first: the model keeps a marked screen
**lit**, measured on E2's clip as teal touching white in **10 of 10** sampled seconds. `final4.py` (below, md5
`a3c0a2fd63636d8e71bf007b0c6e4c6b`) is `final2.py` + the sync bar + this screen pass; `final3.py` (the bar without
the screen pass) was only a smoke test and is not kept. The bar's smoke test on E2's clip, measured: the teal dot's
left edge 1082 → 1068 → 948 → 826 and the ink dot's right edge 599 → 611 → 732 → 830 over 0.5 → 6.46 s (closing on
the centre at 840), then **6,070 teal px of IN SYNC above the bar** at 6.86 s and none before.

⚠ **TWO MORE NOTES ON THAT PAIR, AND BOTH ARE THE PASS'S FAULT, NOT THE MODEL'S.** *"better. the shape logo is coming
out of the phone on highlighter video"* → *"atuallly both of them"*: the mark was sized to the screen **before** it was
rotated, so a tilted mark's corners reached past a 70-px-wide screen, and its glow was never clipped — on black a
glow reads as the mark itself. `final7.py` fits the **rotated extent** inside 62 % of the short side and 50 % of the
long side (a rotated w×h box spans w·cos θ + h·sin θ by w·sin θ + h·cos θ) and clips the mark layer, glow included, to
the screen interior (3 px outside the interior on the cream page, 4 px inside it on the black page so nothing crosses
the outline band), logging the alpha it removes as a spill fraction — measured on the shipped run as **18.7 % of the mark layer on the cream page and 25.7 % on the black page, averaged over the 120 hit frames** (the fit factor the rotated extent forced was 0.59–0.80, i.e. the mark had been 20–40 % too large for a tilted screen); a few hit frames clip to nothing (max 1.0) where the smoothed centre lags the newly found interior, and read as the mark absent for a frame rather than outside the phone. And *"the white and teal triangle
need to be in both"*: the ink-for-white substitution on the cream page is withdrawn. A white triangle needs a dark
ground, so the print video carries the true teal-and-white mark on an **ink plate** top-left (14 px of padding, the
app-icon ground) and its phone screen is painted as a **lit dark screen** with the teal-and-white mark on it, rather
than a white screen with an ink triangle. `tri_ink.png` is no longer used anywhere.

| Video | md5 | bytes | measured |
|---|---|---|---|
| **A — the print**, `final7.py` | `22ab29a2c51f4b736fc9513915d393ee` | 17,169,952 | top-left crop on a beat: teal 2,420 px, **white 2,428 px**, ink 28,866 (the plate) — both triangles present on the cream page; teal 2,281 mid-beat; screen fits as the previous pair (120 of 243 frames accepted, every fit 62–73 × 156–164 px) |
| **B — the highlighter**, `final7.py` | `9f75fdffbb334721e0d17e2a9c02b958` | 5,749,574 | top-left crop on a beat: teal 3,945 px, white 3,215 px; teal 3,767 mid-beat; the bar and the screen fits identical to A |

Handed over as links; the `final5.py` pair above is superseded by this one. `final7.py` is `final6.py` (the fit and the
clip) plus the plate and the dark screen; both are kept by md5 (`final6.py` `d30451717f6c66690bd8c47e3943d201` · `final7.py` `3c959b47d2997c53b33b5b25415b416b`) with
`final7.py`'s three changes to `final5.py` stated here in full: `glow_mark(…, plate=14)` draws a rounded ink square
under the mark before the glow is computed; the A screen interior is painted `(16,16,16)` instead of white and its
mark is `tri` rather than `trik`; and `screen_mark` fits and clips as described.

**`final5.py` — the finishing pass as shipped for the previous pair, verbatim** (md5 `94e226cd9e038eb49f1b8c8522d78117`; `final4.py`, md5
`a3c0a2fd63636d8e71bf007b0c6e4c6b`, differs only in the screen section — an ungated fit and a held estimate — and is
not kept, because a script that floats the mark is not a recipe):

```python
import json, math, subprocess, sys, numpy as np
from PIL import Image, ImageFilter, ImageDraw
SRC=sys.argv[1]; OUTA=sys.argv[2]; OUTB=sys.argv[3]; W,H=1440,2560; TEAL=(0x34,0xd6,0xc5); TEALf=np.array(TEAL,np.float32); CREAM=np.array([0xf2,0xea,0xd8],np.float32)
m=json.load(open('meas_d1.json')); BPM=m['bpm']; PH=m['phase']; KB=m.get('kick_by_beat'); P=60.0/BPM
def kof(t):
    u=(t-PH)%P; n=int((t-PH)//P); pres=1.0 if not KB or n<0 or n>=len(KB) else min(1.0,max(0.0,(KB[n]-0.15)/0.30)); return math.exp(-u/0.20)*pres
tri=Image.open('tri.png').convert('RGBA'); trik=Image.open('tri_ink.png').convert('RGBA'); ASP=tri.width/tri.height
def glow_mark(canvas, mark, cx, cy, h, k, base, flash, blur, amp=0.06, rot=0.0):
    s=1.0+amp*k; hh=max(8,int(round(h*s))); ww=max(6,int(round(hh*ASP))); mk=mark.resize((ww,hh),Image.LANCZOS)
    if abs(rot)>0.5: mk=mk.rotate(rot,expand=True,resample=Image.BICUBIC)
    R=blur*3+mk.width//2+mk.height//2; x0,y0=int(cx-R),int(cy-R); S=2*R
    layer=Image.new('RGBA',(S,S),(0,0,0,0)); px,py=int(round(R-mk.width/2)),int(round(R-mk.height/2))
    a=Image.new('L',(S,S),0); a.paste(mk.split()[3],(px,py)); g=a.filter(ImageFilter.GaussianBlur(blur))
    ga=Image.fromarray((np.asarray(g).astype(np.float32)*(base+flash*k)).clip(0,255).astype(np.uint8))
    glow=Image.merge('RGBA',[Image.new('L',(S,S),TEAL[0]),Image.new('L',(S,S),TEAL[1]),Image.new('L',(S,S),TEAL[2]),ga])
    layer=Image.alpha_composite(layer,glow); layer.alpha_composite(mk,(px,py)); canvas.alpha_composite(layer,(x0,y0))
def blur_mask(m,r): return np.asarray(Image.fromarray((m*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float32)/255.0
page=Image.new('RGB',(W,H),(10,10,10)); d=ImageDraw.Draw(page); c=tuple(int(v*0.30+10*0.70) for v in CREAM)
d.rectangle([90,200,W-90,203],fill=c); d.rectangle([90,214,W-90,215],fill=c)
for x in (90,W//3,2*W//3,W-90): d.rectangle([x,260,x+1,H-330],fill=c)
d.rectangle([90,H-300,W-90,H-200],fill=(28,28,28)); d.rectangle([90,H-300,102,H-200],fill=TEAL); page=np.asarray(page).astype(np.float32)
rd=subprocess.Popen(['ffmpeg','-v','error','-i',SRC,'-vf',f'scale={W}:{H}','-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE,bufsize=10**8)
def wr(out): return subprocess.Popen(['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r','24','-i','-','-i','d1.m4a','-map','0:v','-map','1:a','-af','atrim=0:10.125,afade=t=out:st=9.725:d=0.4','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-shortest',out],stdin=subprocess.PIPE)
from PIL import ImageFont
FONT='/usr/share/fonts/truetype/higgsfield/Montserrat-ExtraBold.ttf'
f_lab=ImageFont.truetype(FONT,30); f_num=ImageFont.truetype(FONT,46); f_sync=ImageFont.truetype(FONT,64)
BPMi=int(round(BPM)); HR0=BPMi-36; T0=1.3; nS=math.ceil((6.4-PH)/P); TS=PH+nS*P
def sstep(x): x=min(1.0,max(0.0,x)); return x*x*(3-2*x)
def hr_of(t): return HR0+(BPMi-HR0)*sstep((t-T0)/(TS-T0))
BX0,BX1,BY=560,1120,262; CX=(BX0+BX1)//2; HALF=(BX1-BX0)//2-24; LY0,LY1=150,340
def spaced(d,x,y,s,font,col,anchor,sp=5):
    ws=[font.getlength(ch) for ch in s]; tot=sum(ws)+sp*(len(s)-1)
    x0={'l':x,'r':x-tot,'m':x-tot/2}[anchor]
    for ch,w in zip(s,ws): d.text((x0,y),ch,font=font,fill=col,anchor='ls'); x0+=w+sp
def sync_bar(canvas,t,k,ink,bar,teal):
    L=Image.new('RGBA',(W,LY1-LY0),(0,0,0,0)); d=ImageDraw.Draw(L); y=BY-LY0
    d.rectangle([BX0,y-2,BX1,y+2],fill=bar)
    hr=hr_of(t); gap=(BPMi-hr)/float(BPMi-HR0); synced=t>=TS
    spaced(d,BX0-40,y-14,'HRM',f_lab,ink,'r'); d.text((BX0-40,y+42),str(int(round(hr))),font=f_num,fill=ink,anchor='rs')
    spaced(d,BX1+40,y-14,'BPM',f_lab,ink,'l'); d.text((BX1+40,y+42),str(BPMi),font=f_num,fill=teal,anchor='ls')
    if not synced:
        xL=CX-gap*HALF; xR=CX+gap*HALF; r=15
        d.ellipse([xL-r,y-r,xL+r,y+r],fill=ink); d.ellipse([xR-r,y-r,xR+r,y+r],fill=teal)
        canvas.alpha_composite(L,(0,LY0)); return
    u=min(1.0,(t-TS)/0.25); r=15+9*u+4*k
    G=Image.new('L',L.size,0); ImageDraw.Draw(G).ellipse([CX-r-10,y-r-10,CX+r+10,y+r+10],fill=255); G=G.filter(ImageFilter.GaussianBlur(18))
    ga=Image.fromarray((np.asarray(G).astype(np.float32)*(0.35+0.5*k)*u).clip(0,255).astype(np.uint8))
    L.alpha_composite(Image.merge('RGBA',[Image.new('L',L.size,teal[0]),Image.new('L',L.size,teal[1]),Image.new('L',L.size,teal[2]),ga]))
    d=ImageDraw.Draw(L); d.ellipse([CX-r,y-r,CX+r,y+r],fill=teal)
    T=Image.new('RGBA',L.size,(0,0,0,0)); spaced(ImageDraw.Draw(T),CX,y-40,'IN SYNC',f_sync,teal,'m',7)
    if u<1: T.putalpha(T.split()[3].point(lambda v:int(v*u)))
    L.alpha_composite(T); canvas.alpha_composite(L,(0,LY0))

SCR=None; SMISS=0; SLOG=[]; CONF=0.0; BAD=0
def find_screen(g):
    wm=(g>=246); wm[:250]=False; wm[H-340:]=False; wm=blur_mask(wm,2)>0.6
    if wm.sum()<1500: return None, wm, None
    hull=blur_mask(wm,16)>0.2
    ys,xs=np.nonzero(hull); C=np.cov(np.vstack([xs,ys]).astype(np.float64)); ev,vec=np.linalg.eigh(C); v=vec[:,1]
    if v[1]>0: v=-v
    th=max(-45.0,min(45.0,math.degrees(math.atan2(-v[0],-v[1]))))
    short=max(20.0,math.sqrt(12*max(ev[0],1.0))-32); long_=max(40.0,math.sqrt(12*max(ev[1],1.0))-32)
    if not (55<=short<=95 and 130<=long_<=200): return None, wm, None      # not the screen (measured hits: 62-73 x 156-164)
    interior=blur_mask(hull,9)>0.92
    return dict(cx=float(xs.mean()),cy=float(ys.mean()),th=th,short=short,long=long_), wm, interior
def screen_mark(A_img,B_arr,g,k,n):
    global SCR,SMISS,CONF,BAD
    cur,wm,interior=find_screen(g)
    if cur is None: SMISS+=1; CONF*=0.5
    else: SCR=cur if SCR is None else {q:SCR[q]*0.45+cur[q]*0.55 for q in cur}; CONF=1.0
    if SCR is None or CONF<0.2: return A_img,B_arr
    if interior is not None:
        rep=interior&~wm
        a=np.asarray(A_img).copy(); a[rep]=(255,255,255,255); A_img=Image.fromarray(a,'RGBA')
        B_arr=B_arr.copy(); B_arr[interior]=page[interior]
        bm=blur_mask(interior,5); band=((bm>0.15)&(bm<0.85)).astype(np.float32); bg=blur_mask(band>0.5,9)
        al=np.clip(bg*(0.45+0.25*k)+band*0.95,0,1)[...,None]; B_arr=B_arr*(1-al)+TEALf*al
    mh=0.42*SCR['long']; mw=mh*ASP
    if mw>0.66*SCR['short']: mw=0.66*SCR['short']; mh=mw/ASP
    LA=Image.new('RGBA',A_img.size,(0,0,0,0)); glow_mark(LA,trik,SCR['cx'],SCR['cy'],mh,k,0.15,0.35,8,rot=SCR['th'])
    if CONF<1: LA.putalpha(LA.split()[3].point(lambda v:int(v*CONF)))
    A_img.alpha_composite(LA)
    Bi=Image.fromarray(B_arr.clip(0,255).astype(np.uint8)).convert('RGBA'); LB=Image.new('RGBA',Bi.size,(0,0,0,0)); glow_mark(LB,tri,SCR['cx'],SCR['cy'],mh,k,0.30,0.5,8,rot=SCR['th'])
    if CONF<1: LB.putalpha(LB.split()[3].point(lambda v:int(v*CONF)))
    Bi.alpha_composite(LB)
    if n%24==0: SLOG.append((n,int(wm.sum()),round(CONF,2),{q:round(SCR[q],1) for q in SCR}))
    return A_img,np.asarray(Bi).astype(np.float32)
wA=wr(OUTA); wB=wr(OUTB); FR=W*H*3; n=0; rulecols=None; log=[]
while True:
    b=rd.stdout.read(FR)
    if len(b)<FR: break
    f=np.frombuffer(b,np.uint8).reshape(H,W,3).astype(np.float32); g=0.299*f[...,0]+0.587*f[...,1]+0.114*f[...,2]; t=n/24.0; k=kof(t)
    A=Image.fromarray(f.astype(np.uint8)).convert('RGBA'); glow_mark(A,trik,100+130*ASP/2,150+65,130,k,0.20,0.55,16); sync_bar(A,t,k,(20,20,20),(95,95,95),TEAL)
    m0=g<90; m0[:250]=False; m0[H-340:]=False
    if rulecols is None:
        frac=m0[250:H-340].mean(0); rulecols=[x for x in range(W) if frac[x]>0.55]; print('rule columns',rulecols,flush=True)
    for x in rulecols: m0[:,max(0,x-3):x+4]=False
    mm=blur_mask(m0,4)>0.35; bm=blur_mask(mm,6); edge=(bm>0.12)&(bm<0.88)
    E=Image.fromarray((edge*255).astype(np.uint8)); glow=np.asarray(E.filter(ImageFilter.GaussianBlur(14))).astype(np.float32)/255.0; st_=np.asarray(E.filter(ImageFilter.GaussianBlur(1))).astype(np.float32)/255.0
    out=page.copy(); a=np.clip(glow*0.55+st_*0.95,0,1)[...,None]; out=out*(1-a)+TEALf*a
    tm=((np.abs(f[...,0]-0x34)<60)&(np.abs(f[...,1]-0xd6)<60)&(np.abs(f[...,2]-0xc5)<60)); tg=blur_mask(tm,6); ta=np.clip(tg*0.5+tm.astype(np.float32)*0.95,0,1)[...,None]; out=out*(1-ta)+TEALf*ta
    A,out=screen_mark(A,out,g,k,n)
    B=Image.fromarray(out.clip(0,255).astype(np.uint8)).convert('RGBA'); glow_mark(B,tri,90+150*ASP/2,30+75,150,k,0.35,0.65,20); sync_bar(B,t,k,(190,184,170),(80,78,72),TEAL)
    if n%24==0: log.append((n,int(m0.sum()),int(tm.sum()),round(k,2)))
    wA.stdin.write(A.convert('RGB').tobytes()); wB.stdin.write(B.convert('RGB').tobytes()); n+=1
for w in (wA,wB): w.stdin.close()
for w in (wA,wB): w.wait()
print('frames',n); print('(frame, ink px, teal px carried, k):',log); print('sync at beat',nS,'t',round(TS,4),'HR0',HR0,'BPM',BPMi); print('screen: miss frames',SMISS,'of',n); print('screen log (frame, white px, fit):'); [print(' ',l) for l in SLOG]; print('FINAL5-DONE')
```

**`final2.py` — the finishing pass for the marked-still route, verbatim** (md5 `63d104ec9a6ffe8c910ee15363383d16`;
reads `meas_d1.json`, `tri.png`, `tri_ink.png`, `d1.m4a` and the source clip; writes both videos, the pick muxed
under each with the 0.4 s fade). `final.py` above (md5 `46054cfb31cec743d6f87b07a6a29477`) is kept because its
tracking branch is the measurement that retired it:

```python
import json, math, subprocess, sys, numpy as np
from PIL import Image, ImageFilter, ImageDraw
SRC=sys.argv[1]; OUTA=sys.argv[2]; OUTB=sys.argv[3]; W,H=1440,2560; TEAL=(0x34,0xd6,0xc5); TEALf=np.array(TEAL,np.float32); CREAM=np.array([0xf2,0xea,0xd8],np.float32)
m=json.load(open('meas_d1.json')); BPM=m['bpm']; PH=m['phase']; KB=m.get('kick_by_beat'); P=60.0/BPM
def kof(t):
    u=(t-PH)%P; n=int((t-PH)//P); pres=1.0 if not KB or n<0 or n>=len(KB) else min(1.0,max(0.0,(KB[n]-0.15)/0.30)); return math.exp(-u/0.20)*pres
tri=Image.open('tri.png').convert('RGBA'); trik=Image.open('tri_ink.png').convert('RGBA'); ASP=tri.width/tri.height
def glow_mark(canvas, mark, cx, cy, h, k, base, flash, blur, amp=0.06):
    s=1.0+amp*k; hh=int(round(h*s)); ww=int(round(hh*ASP)); mk=mark.resize((ww,hh),Image.LANCZOS)
    R=blur*3+ww//2+hh//2; x0,y0=int(cx-R),int(cy-R); S=2*R
    layer=Image.new('RGBA',(S,S),(0,0,0,0)); px,py=int(round(R-ww/2)),int(round(R-hh/2))
    a=Image.new('L',(S,S),0); a.paste(mk.split()[3],(px,py)); g=a.filter(ImageFilter.GaussianBlur(blur))
    ga=Image.fromarray((np.asarray(g).astype(np.float32)*(base+flash*k)).clip(0,255).astype(np.uint8))
    glow=Image.merge('RGBA',[Image.new('L',(S,S),TEAL[0]),Image.new('L',(S,S),TEAL[1]),Image.new('L',(S,S),TEAL[2]),ga])
    layer=Image.alpha_composite(layer,glow); layer.alpha_composite(mk,(px,py)); canvas.alpha_composite(layer,(x0,y0))
def blur_mask(m,r): return np.asarray(Image.fromarray((m*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float32)/255.0
page=Image.new('RGB',(W,H),(10,10,10)); d=ImageDraw.Draw(page); c=tuple(int(v*0.30+10*0.70) for v in CREAM)
d.rectangle([90,200,W-90,203],fill=c); d.rectangle([90,214,W-90,215],fill=c)
for x in (90,W//3,2*W//3,W-90): d.rectangle([x,260,x+1,H-330],fill=c)
d.rectangle([90,H-300,W-90,H-200],fill=(28,28,28)); d.rectangle([90,H-300,102,H-200],fill=TEAL); page=np.asarray(page).astype(np.float32)
rd=subprocess.Popen(['ffmpeg','-v','error','-i',SRC,'-vf',f'scale={W}:{H}','-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE,bufsize=10**8)
def wr(out): return subprocess.Popen(['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r','24','-i','-','-i','d1.m4a','-map','0:v','-map','1:a','-af','atrim=0:10.125,afade=t=out:st=9.725:d=0.4','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-shortest',out],stdin=subprocess.PIPE)
wA=wr(OUTA); wB=wr(OUTB); FR=W*H*3; n=0; rulecols=None; log=[]
while True:
    b=rd.stdout.read(FR)
    if len(b)<FR: break
    f=np.frombuffer(b,np.uint8).reshape(H,W,3).astype(np.float32); g=0.299*f[...,0]+0.587*f[...,1]+0.114*f[...,2]; t=n/24.0; k=kof(t)
    A=Image.fromarray(f.astype(np.uint8)).convert('RGBA'); glow_mark(A,trik,100+130*ASP/2,150+65,130,k,0.20,0.55,16)
    m0=g<90; m0[:250]=False; m0[H-340:]=False
    if rulecols is None:
        frac=m0[250:H-340].mean(0); rulecols=[x for x in range(W) if frac[x]>0.55]; print('rule columns',rulecols,flush=True)
    for x in rulecols: m0[:,max(0,x-3):x+4]=False
    mm=blur_mask(m0,4)>0.35; bm=blur_mask(mm,6); edge=(bm>0.12)&(bm<0.88)
    E=Image.fromarray((edge*255).astype(np.uint8)); glow=np.asarray(E.filter(ImageFilter.GaussianBlur(14))).astype(np.float32)/255.0; st_=np.asarray(E.filter(ImageFilter.GaussianBlur(1))).astype(np.float32)/255.0
    out=page.copy(); a=np.clip(glow*0.55+st_*0.95,0,1)[...,None]; out=out*(1-a)+TEALf*a
    tm=((np.abs(f[...,0]-0x34)<60)&(np.abs(f[...,1]-0xd6)<60)&(np.abs(f[...,2]-0xc5)<60)); tg=blur_mask(tm,6); ta=np.clip(tg*0.5+tm.astype(np.float32)*0.95,0,1)[...,None]; out=out*(1-ta)+TEALf*ta
    B=Image.fromarray(out.clip(0,255).astype(np.uint8)).convert('RGBA'); glow_mark(B,tri,90+150*ASP/2,30+75,150,k,0.35,0.65,20)
    if n%24==0: log.append((n,int(m0.sum()),int(tm.sum()),round(k,2)))
    wA.stdin.write(A.convert('RGB').tobytes()); wB.stdin.write(B.convert('RGB').tobytes()); n+=1
for w in (wA,wB): w.stdin.close()
for w in (wA,wB): w.wait()
print('frames',n); print('(frame, ink px, teal px carried, k):',log); print('FINAL2-DONE')
```

**`final.py` — the finishing pass, verbatim** (reads `meas_d1.json`, `tri.png`, `tri_ink.png`, `A_print.mp4` and
`B_highlighter.mp4`; writes `A_final.mp4` and `B_final.mp4`, audio copied from the print video):

```python
import json, math, subprocess, numpy as np
from PIL import Image, ImageFilter
W,H=1440,2560; TEAL=(0x34,0xd6,0xc5)
m=json.load(open('meas_d1.json')); BPM=m['bpm']; PH=m['phase']; KB=m.get('kick_by_beat'); P=60.0/BPM
def kof(t):
    u=(t-PH)%P; n=int((t-PH)//P)
    pres=1.0 if not KB or n<0 or n>=len(KB) else min(1.0,max(0.0,(KB[n]-0.15)/0.30))
    return math.exp(-u/0.20)*pres
tri=Image.open('tri.png').convert('RGBA'); trik=Image.open('tri_ink.png').convert('RGBA'); ASP=tri.width/tri.height
def rd(p): return subprocess.Popen(['ffmpeg','-v','error','-i',p,'-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE,bufsize=10**8)
def wr(out,audio_src): return subprocess.Popen(['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r','24','-i','-','-i',audio_src,'-map','0:v','-map','1:a','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-c:a','copy','-shortest',out],stdin=subprocess.PIPE)
def glow_mark(canvas, mark, cx, cy, h, k, base, flash, blur, amp=0.06, rot=0.0):
    s=1.0+amp*k; hh=max(8,int(round(h*s))); ww=max(6,int(round(hh*ASP)))
    mk=mark.resize((ww,hh),Image.LANCZOS)
    if abs(rot)>0.5: mk=mk.rotate(rot,expand=True,resample=Image.BICUBIC)
    R=blur*3+ww//2+hh//2; x0,y0=int(cx-R),int(cy-R); S=2*R
    layer=Image.new('RGBA',(S,S),(0,0,0,0)); px,py=int(round(R-mk.width/2)),int(round(R-mk.height/2))
    a=Image.new('L',(S,S),0); a.paste(mk.split()[3],(px,py)); g=a.filter(ImageFilter.GaussianBlur(blur))
    ga=Image.fromarray((np.asarray(g).astype(np.float32)*(base+flash*k)).clip(0,255).astype(np.uint8))
    glow=Image.merge('RGBA',[Image.new('L',(S,S),TEAL[0]),Image.new('L',(S,S),TEAL[1]),Image.new('L',(S,S),TEAL[2]),ga])
    layer=Image.alpha_composite(layer,glow); layer.alpha_composite(mk,(px,py))
    canvas.alpha_composite(layer,(x0,y0))
def blur_mask(m,r): return np.asarray(Image.fromarray((m*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float32)/255.0
rA=rd('A_print.mp4'); rB=rd('B_highlighter.mp4'); wA=wr('A_final.mp4','A_print.mp4'); wB=wr('B_final.mp4','A_print.mp4')
FR=W*H*3; n=0; st=None; log=[]; miss=0
while True:
    a=rA.stdout.read(FR); b=rB.stdout.read(FR)
    if len(a)<FR or len(b)<FR: break
    fa=np.frombuffer(a,np.uint8).reshape(H,W,3); fb=np.frombuffer(b,np.uint8).reshape(H,W,3)
    t=n/24.0; k=kof(t)
    # the phone screen: the one pure-white object on the cream page (cream luma ~236, screen 255)
    g=(0.299*fa[...,0]+0.587*fa[...,1]+0.114*fa[...,2]); wm=g>=246; wm[:250]=False; wm[H-340:]=False
    wm=blur_mask(wm,2)>0.6; ys,xs=np.nonzero(wm); cnt=len(xs)
    if 4000<=cnt<=60000:
        cx,cy=float(xs.mean()),float(ys.mean()); C=np.cov(np.vstack([xs,ys]).astype(np.float64)); ev,vec=np.linalg.eigh(C)
        l2,l1=float(ev[0]),float(ev[1]); v=vec[:,1]
        if v[1]>0: v=-v
        th=math.degrees(math.atan2(-v[0],-v[1])); th=max(-45.0,min(45.0,th))
        short,long_=math.sqrt(12*max(l2,1.0)),math.sqrt(12*max(l1,1.0))
        cur=dict(cx=cx,cy=cy,th=th,short=short,long=long_)
        st=cur if st is None else {q:st[q]*0.45+cur[q]*0.55 for q in cur}
    else: miss+=1
    A=Image.fromarray(fa).convert('RGBA'); B=Image.fromarray(fb).convert('RGBA')
    # the mark top-left, both pages: a soft teal glow that flashes on the kick, the launch cut's 6 % throb
    glow_mark(A,trik,100+130*ASP/2,150+65,130,k,0.20,0.55,16)
    glow_mark(B,tri,90+150*ASP/2,30+75,150,k,0.35,0.65,20)
    if st is not None:
        mw=0.70*st['short']; mh=mw/ASP
        if mh>0.55*st['long']: mh=0.55*st['long']
        glow_mark(A,trik,st['cx'],st['cy'],mh,k,0.25,0.45,10,rot=st['th'])
        # on the black page the phone itself is a highlighter outline with the mark lit inside it
        bm=blur_mask(wm,5); band=((bm>0.15)&(bm<0.85)).astype(np.float32); bandg=blur_mask(band>0.5,9)
        al=np.clip(bandg*(0.45+0.25*k)+band*0.95,0,1)[...,None]
        fb2=np.asarray(B).astype(np.float32); fb2[...,:3]=fb2[...,:3]*(1-al)+np.array(TEAL,np.float32)*al
        B=Image.fromarray(fb2.clip(0,255).astype(np.uint8),'RGBA')
        glow_mark(B,tri,st['cx'],st['cy'],mh,k,0.35,0.55,10,rot=st['th'])
    if n%24==0: log.append((n,cnt,None if st is None else {q:round(st[q],1) for q in st},round(k,2)))
    wA.stdin.write(A.convert('RGB').tobytes()); wB.stdin.write(B.convert('RGB').tobytes()); n+=1
for w in (wA,wB): w.stdin.close()
for w in (wA,wB): w.wait()
print('frames',n,'phone-miss frames',miss); print('track (frame, white px, state, k):'); [print(' ',l) for l in log]; print('FINAL-DONE')
```

**Deep-house tracks — three `sonilo_music` generations, 2026-09-08 21:29 UTC — owner: *"make sure the music is deep house music"* · *"more unique music then typical fitness ad"* · then *"music is good"*.** Params on all three: `model sonilo_music · duration 60 · use_unlim false` (⚠ `duration` is REQUIRED). Each probes **60.023220 s**, AAC 44.1 kHz stereo at 256–258 kbps; the service reports `durationSec 60.0236`. Measured with `beat.py` + `meas_dh.py` (below); the table of measurements is in §6. ⚠ No audio is committed; the durable record is the job id + prompt + `duration`, and the md5 is what turns a re-fetch into a check.

| # | Track | Job | File | md5 | bytes | Prompt (verbatim, as submitted) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **dub-dark (PICK)** | `35ca8b30-6459-46e7-8fa0-7b0196f6ac69` | `hf_20260908_212940_35ca8b30-6459-46e7-8fa0-7b0196f6ac69.m4a` | `b0ba63689fc23e9f89eeb1b869e7a4c4` | 2,261,348 | *Deep house, 122 BPM. A dry heavy kick from the very first bar with no intro, a deep rubbery sub bass, dark detuned minor chords stabbing on the off-beats with long dub delay tails, tape hiss and vinyl crackle underneath, hypnotic and unhurried, a continuous groove with no breakdown, no drop and no risers. Instrumental, no vocals.* |
| 2 | muted trumpet | `ffd58fa3-b481-4a5f-af73-3ad547d5ab3a` | `hf_20260908_212940_ffd58fa3-b481-4a5f-af73-3ad547d5ab3a.m4a` | `503984b9c4c34a4dc4fc271ad24dcee9` | 2,255,519 | *Deep house, 120 BPM. A muted trumpet phrase drenched in reverb over a warm dusty Rhodes chord, a round sub bass and a shuffling swung kick from bar one, brushed hi-hats, late-night jazz-club atmosphere, understated and soulful, a continuous groove with no breakdown and no drop. Instrumental, no vocals.* |
| 3 | bowed cello | `3274b8f4-9f94-4680-8ed5-a8fe771bd2ba` | `hf_20260908_212940_3274b8f4-9f94-4680-8ed5-a8fe771bd2ba.m4a` | `9cffe10342b01c77b4f7ba4dfd7aca77` | 2,265,602 | *Deep house, 124 BPM. A hypnotic minimal groove: a kick from bar one, a deep pulsing bass, one melancholy bowed cello line that repeats and never resolves, distant rain and room tone as texture, tension held throughout, no build, no breakdown, no drop, no risers. Instrumental, no vocals.* |

**`meas_d1.json`, the pick's grid — recorded here because the sandbox that measured it is gone:** `bpm 119.95 · P
0.500208 · phase 0.055 · score 0.3865 · halves 120.0 / 120.0 · contrast 4.31 · first_kick 0.055 · beats 119`.
`kick_by_beat` (119 values, beat 0 first, the peak 40–120 Hz energy within ±40 ms of each grid beat normalised to
the track's own maximum): `0.84 0.77 0.78 0.76 0.76 0.71 0.74 0.74 0.72 0.72 0.77 0.73 0.77 0.76 0.86 0.72 0.75 0.86 0.79 0.88 0.80 0.72 0.72 0.80 0.69 0.77 0.82 0.79 0.78 0.79 0.83 0.82 0.86 0.80 0.87 0.78 0.82 0.76 0.88 0.83 0.79 0.78 0.90 0.77 0.81 0.80 0.93 0.83 0.36 0.33 0.41 0.29 0.39 0.23 0.42 0.31 0.49 0.22 0.35 0.28 0.41 0.07 0.10 0.02 0.10 0.04 0.01 0.00 0.00 0.00 0.00 0.01 0.01 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.51 0.46 0.45 0.47 0.59 0.73 0.79 0.75 0.81 0.95 0.69 0.83 0.79 0.86 0.74 0.47 0.82 0.69 1.00 0.72 0.95 0.81 0.86 0.84 0.89 0.77 0.89 0.77 0.90 0.85 0.94 0.75 0.01 0.00 0.00 0.00 0.00 0.00 0.00`.

```python
# meas_dh.py — python3 meas_dh.py d1 d2 d3 ; expects <name>.wav beside it and beat.py (the recipe's block) on the path. Writes meas_<name>.json.
import sys, json, numpy as np
sys.path.insert(0,'/home/user/dh'); import beat
h=beat.HOP
def win(a,t,r):
    i=int((t-r)/h); j=int((t+r)/h)+1
    return float(a[max(0,i):j].max()) if j>max(0,i) and max(0,i)<len(a) else 0.0
def analyse(name):
    x=beat.decode(f'/home/user/dh/{name}.wav'); dur=len(x)/beat.SR
    kick=beat.bandpass(x,40,120); e=beat.energy(kick); o=beat.onset(e)
    g=beat.grid(o); n=len(o)//2; g1=beat.grid(o[:n]); g2=beat.grid(o[n:])
    P=g['P']; ph=g['phase']; nb=int((dur-ph)/P); ek=e/e.max()
    kb=np.array([win(ek,ph+i*P,0.04) for i in range(nb)])
    onb=np.array([win(ek,ph+i*P,0.01) for i in range(nb)]); half=np.array([win(ek,ph+(i+0.5)*P,0.01) for i in range(nb)])
    contrast=float(onb.mean())/max(1e-9,float(half.mean()))
    idx=np.where(kb>0.3)[0]; first=round(float(ph+idx[0]*P),3) if len(idx) else None
    pres=np.clip((kb-0.15)/0.30,0,1); gaps=[]; run=None
    for i,v in enumerate(pres):
        if v<0.5: run=[i,i] if run is None else [run[0],i]
        else:
            if run: gaps.append(run); run=None
    if run: gaps.append(run)
    gaps=[q for q in gaps if q[1]-q[0]>=2]
    X=np.abs(np.fft.rfft(x))**2; f=np.fft.rfftfreq(len(x),1/beat.SR)
    cent=float((f*X).sum()/X.sum()); low=float(X[f<90].sum()/X.sum())
    w=beat.SR; rms=[20*np.log10(np.sqrt((x[i*w:(i+1)*w]**2).mean())+1e-9) for i in range(int(dur))]
    out=dict(name=name,dur=round(dur,3),bpm=g['bpm'],P=g['P'],phase=g['phase'],score=g['score'],halves=[g1['bpm'],g2['bpm']],
        contrast=round(contrast,2),first_kick=first,beats=nb,kick_gaps_beats=[[int(a),int(b)] for a,b in gaps],
        kick_gaps_s=[[round(ph+a*P,2),round(ph+b*P,2)] for a,b in gaps],centroid_hz=round(cent,1),low90=round(low,3),
        rms_db_min=round(min(rms),1),rms_db_max=round(max(rms),1),rms_db_first4=round(float(np.mean(rms[:4])),1),
        rms_db_mid=round(float(np.mean(rms[25:35])),1),rms_db_last4=round(float(np.mean(rms[-4:])),1),
        kick_by_beat=[round(float(v),3) for v in kb])
    json.dump(out,open(f'/home/user/dh/meas_{name}.json','w'))
    o2=dict(out); o2.pop('kick_by_beat'); print(json.dumps(o2)); print('kb', ' '.join('%.2f'%v for v in kb))
for nm in sys.argv[1:]: analyse(nm)
print('MEAS-DONE')
```

**v4 — the Shape-original looks (CURRENT, with v3), 2026-09-08 21:06 UTC — owner: *"dont just replicate exactly the same images that apples made"*.** Same model and params as every row above.

| # | Look · figure | Job | File | Prompt (verbatim, as submitted) |
| --- | --- | --- | --- | --- |
| 8 | The broadsheet, printed · runner | `bcfea348-9f2e-4bf5-bb30-c10b86d446be` | `hf_20260908_210628_bcfea348-9f2e-4bf5-bb30-c10b86d446be.png` | *Vertical 9:16 animation frame in an editorial newspaper style unique to a brand called Shape. The whole frame is a page of cream newsprint. A runner in full sprint, side-on, knees driving high, is drawn as a coarse halftone-dot illustration in black ink, like a press photograph screened into big dots, energetic and high contrast, her hair and limbs streaking with motion. She holds a crisp white smartphone, the only sharp unscreened object on the page, its screen a plain flat white rectangle. Typographic architecture frames her: a bold double hairline rule across the top like a masthead, thin vertical column rules, and a black ticker strip along the bottom with a teal left border, hex 34D6C5; the columns are empty grey blocks with no letters. A single ribbon of teal light trails from the phone around her body, the only colour on the page apart from the ticker's border. No readable text, no logos.\n\nresolution: 2k* |
| 9 | The broadsheet, printed · kettlebell | `d09a7826-bc98-419a-b640-c4eba238ea0a` | `hf_20260908_210628_d09a7826-bc98-419a-b640-c4eba238ea0a.png` | *Vertical 9:16 animation frame in an editorial newspaper style unique to a brand called Shape. The whole frame is a page of cream newsprint. A broad-shouldered man at the top of a kettlebell swing, the bell at eye level, body driving upward, is drawn as a coarse halftone-dot illustration in black ink, like a press photograph screened into big dots, high contrast, chalk dust rendered as scattered dots. A crisp white smartphone stands upright in the lower corner, the only sharp unscreened object, its screen a plain flat white rectangle. A bold double hairline rule crosses the frame above him like a masthead and thin column rules of empty grey blocks with no letters run behind him. A single ribbon of teal light, hex 34D6C5, rises from the phone and coils around the bell and his arms, the only colour on the page. No readable text, no logos.\n\nresolution: 2k* |
| 10 | Figures of light · dancer | `58ddb1a3-3e43-4877-ba0b-e3c03ca484af` | `hf_20260908_210628_58ddb1a3-3e43-4877-ba0b-e3c03ca484af.png` | *Vertical 9:16 animation frame unique to a brand called Shape. On a flat near-black background, hex 0A0A0A, a woman mid-air in an explosive dance jump is drawn entirely out of streaking ribbons of teal and white light, hex 34D6C5 and white, her body a bundle of luminous trails that show the motion of the last second, no skin, no face, no clothing, only flowing light with soft glow. In her hand a crisp cream-white smartphone, solid and sharp, its screen a plain flat cream rectangle, the one solid object in the frame. Fine film grain, high contrast. No text, no logos, no other objects.\n\nresolution: 2k* |
| 11 | Figures of light · cook | `d1eb77d9-cf3d-4c01-9112-a2e47f9f30e5` | `hf_20260908_210628_d1eb77d9-cf3d-4c01-9112-a2e47f9f30e5.png` | *Vertical 9:16 animation frame unique to a brand called Shape. On a flat near-black background, hex 0A0A0A, a cook tossing a frying pan is drawn entirely out of streaking ribbons of teal and white light, hex 34D6C5 and white, his body and the pan a bundle of luminous trails showing the motion of the throw, the chopped vegetables in the air as small sparks of white light, no skin, no face, no clothing, only flowing light with soft glow. A crisp cream-white smartphone is propped upright at the edge of the frame, solid and sharp, its screen a plain flat cream rectangle, the one solid object in the frame. Fine film grain, high contrast. No text, no logos, no other objects.\n\nresolution: 2k* |
| 12 | Cut paper · coach + client as ▸◂ | `c6e2d449-237d-43f2-a9d9-0fffbcfc1f83` | `hf_20260908_210628_c6e2d449-237d-43f2-a9d9-0fffbcfc1f83.png` | *Vertical 9:16 animation frame in a cut-paper collage style unique to a brand called Shape, three colours only: cream paper, ink-black paper and teal paper, hex 34D6C5. A coach and a client, two figures cut from black paper, lean in hard toward each other in profile mid high-five, arms up and hands meeting at the top, their two bodies forming two triangles pointing at each other with a wedge of teal paper showing between them; every layer has the crisp edges and slight soft shadow of cut card on a cream paper background. One of them holds a cream paper smartphone, a flat cream rectangle. A curling teal paper ribbon runs from the phone up through their clasped hands and off the frame. Bold, graphic, energetic. No text, no logos.\n\nresolution: 2k* |
| 13 | Cut paper · kicker | `f3883750-3cd4-4cda-aaf4-eab58eee06ac` | `hf_20260908_210628_f3883750-3cd4-4cda-aaf4-eab58eee06ac.png` | *Vertical 9:16 animation frame in a cut-paper collage style unique to a brand called Shape, three colours only: cream paper, ink-black paper and teal paper, hex 34D6C5. A woman throwing a high roundhouse kick, braids whipping out, body coiled and dynamic, is cut from black paper and layered over a cream paper background with a large torn-edged wedge of teal paper behind her; every layer has the crisp edges and slight soft shadow of cut card. She holds a cream paper smartphone in one hand, a flat cream rectangle, and a curling teal paper ribbon runs from the phone along her kicking leg and off the frame. Bold, graphic, energetic. No text, no logos.\n\nresolution: 2k* |

**v3 — the silhouette, Shape edition (CURRENT, with v4), 2026-09-08 21:05 UTC — owner: *"more unique to shape … half the people you are showing look like real life"*.** Same model and params.

| # | Look · figure | Job | File | Prompt (verbatim, as submitted) |
| --- | --- | --- | --- | --- |
| 1 | Silhouette, Shape edition · runner on teal, halftone band | `b9815054-2ace-4515-b08b-eadb2e36afec` | `hf_20260908_210522_b9815054-2ace-4515-b08b-eadb2e36afec.png` | *Vertical 9:16 flat 2D animation frame in the style of a classic silhouette campaign, but unique to a brand called Shape. A solid flat teal background, hex 34D6C5, with a band of fine halftone dots fading in across the top like newsprint. One jet-black silhouette of a runner in full sprint, side-on, knees driving high, arms pumping, ponytail streaming back, pure black with no interior detail and hard clean edges. She holds a cream-white smartphone in one hand, its screen a plain flat cream rectangle, and a single long ribbon of white-and-teal light streams out of the phone and whips around her body and trails far behind her across the frame, the only glowing element. A thin black hairline rule runs straight across the frame near the bottom like a newspaper rule. No earbuds, no text, no logos, no other objects, no ground line.\n\nresolution: 2k* |
| 2 | Silhouette, Shape edition · kettlebell on cream newsprint | `a4b9a9d6-3973-448c-9bca-e88b72d563c1` | `hf_20260908_210522_a4b9a9d6-3973-448c-9bca-e88b72d563c1.png` | *Vertical 9:16 flat 2D animation frame in the style of a classic silhouette campaign, but unique to a brand called Shape. A solid flat cream newsprint-paper background, off-white, with faint fine halftone dots and one thin black hairline rule across the upper third like a newspaper rule. One jet-black silhouette of a broad-shouldered man at the top of a kettlebell swing, the bell at eye level, his whole body driving upward in a wide stance, pure black with no interior detail and hard clean edges. A cream-white smartphone stands upright in the lower corner of the frame, its screen a flat cream rectangle, and a single ribbon of teal light, hex 34D6C5, rises out of the phone and coils around the swinging bell and his arms, the only colour in the image. No earbuds, no text, no logos, no other objects, no ground line.\n\nresolution: 2k* |
| 3 | Silhouette, Shape edition · cream dancer on ink | `4a174180-f4dc-40e7-800f-8063404a7e2e` | `hf_20260908_210522_4a174180-f4dc-40e7-800f-8063404a7e2e.png` | *Vertical 9:16 flat 2D animation frame in the style of a classic silhouette campaign, but unique to a brand called Shape. A solid flat near-black ink background, hex 0A0A0A, with no gradient. One cream-white silhouette of a woman mid-air in an explosive dance jump, hair flying, knees up, arms flung wide, pure flat cream with no interior detail and hard clean edges. She holds a teal smartphone, hex 34D6C5, up in one hand, its screen a plain flat teal rectangle glowing softly, and a single long ribbon of teal light streams out of it and spirals around her body and across the frame, the only colour in the image. No earbuds, no text, no logos, no other objects, no ground line.\n\nresolution: 2k* |
| 4 | Silhouette, Shape edition · coach + client as ▸◂ on teal | `439e28ed-4a8f-4473-9657-31ddfa381f5f` | `hf_20260908_210522_439e28ed-4a8f-4473-9657-31ddfa381f5f.png` | *Vertical 9:16 flat 2D animation frame in the style of a classic silhouette campaign, but unique to a brand called Shape. A solid flat teal background, hex 34D6C5, with no gradient. Two jet-black silhouettes, a coach and a client, face each other in profile and lean in hard toward each other mid high-five, arms up and touching at the top, their two bodies forming two triangles pointing at each other with a bright gap of teal between them, pure black with no interior detail and hard clean edges. One of them holds a cream-white smartphone in the free hand, its screen a plain flat cream rectangle, and a single ribbon of white light runs from the phone up through the clasped hands and out across the frame. No earbuds, no text, no logos, no other objects, no ground line.\n\nresolution: 2k* |
| 5 | Silhouette, Shape edition · cook on cream newsprint | `1d35baf6-b38f-4fb8-af81-59cef56682d0` | `hf_20260908_210522_1d35baf6-b38f-4fb8-af81-59cef56682d0.png` | *Vertical 9:16 flat 2D animation frame in the style of a classic silhouette campaign, but unique to a brand called Shape. A solid flat cream newsprint-paper background, off-white, with faint fine halftone dots gathering in the lower corner like a printed photograph. One jet-black silhouette of a cook tossing a frying pan so a burst of chopped vegetables hangs in the air above it as black shapes, body twisted with the throw, apron strings flying, pure black with no interior detail and hard clean edges. A cream-white smartphone is propped upright at the edge of the frame, its screen a flat cream rectangle, and a single ribbon of teal light, hex 34D6C5, rises from the phone and curls up through the air like steam, the only colour in the image. No earbuds, no text, no logos, no other objects, no ground line.\n\nresolution: 2k* |
| 6 | Silhouette, Shape edition · two-tone kicker on the ▸ diagonal | `c6bd789e-c345-4cd8-a06e-e051520aaeb9` | `hf_20260908_210522_c6bd789e-c345-4cd8-a06e-e051520aaeb9.png` | *Vertical 9:16 flat 2D animation frame in the style of a classic silhouette campaign, but unique to a brand called Shape. The background is split into two flat colours by one straight diagonal edge: a large solid teal triangle, hex 34D6C5, filling the lower left and a solid near-black ink triangle, hex 0A0A0A, filling the upper right, no gradient. One silhouette of a woman throwing a high roundhouse kick, braids whipping out, body coiled and dynamic, drawn so that the part of her over the teal is jet black and the part of her over the ink is cream white, a clean two-tone silhouette with hard edges and no interior detail. She holds a cream-white smartphone in one hand, its screen a plain flat cream rectangle, and a single ribbon of white light streams from it along her kicking leg and off the frame. No earbuds, no text, no logos, no other objects, no ground line.\n\nresolution: 2k* |

**Motion test — one `minimax_h3` clip, 2026-09-08 21:05 UTC.** Params `aspect_ratio 9:16 · duration 10 · resolution 2K · use_unlim false · declined_preset_id 24bae836-2c4a-48e0-89b6-49fcc0b21612` (the "IN THE DARK" preset that intercepts silhouette-on-dark submissions). Delivered `1440×2560`, 10 s; the file name is in the row.

| # | What | Job | File | Prompt (verbatim, as submitted) |
| --- | --- | --- | --- | --- |
| 7 | Motion test · Shape-edition silhouette dancer on teal, 10 s | `893378b3-64f0-4bb6-ba8d-0d5c5b6d5ed2` | `hf_20260908_210526_893378b3-64f0-4bb6-ba8d-0d5c5b6d5ed2.mp4` | *Vertical 9:16. Flat 2D animation in the style of a classic silhouette campaign, unique to a brand called Shape: a solid, perfectly flat teal background, hex 34D6C5, with no gradient, texture, floor or shadow. One jet-black silhouette of a woman dancing with big explosive movements to a fast beat, jumping, spinning, hair flying, pure black with no interior detail and hard clean edges. She holds a cream-white smartphone in one hand, its screen a plain flat cream rectangle, and a single long ribbon of white-and-teal light streams out of the phone and whips around her body as she moves, trailing behind every movement, the only glowing element. Locked-off camera, no camera movement. No earbuds, no text, no logos, no other objects.* |

**v2 — the first silhouette frames (SUPERSEDED by v3/v4 — the campaign's own palette and earbud cord, i.e. Apple's images), 2026-09-08 20:54 UTC**

| # | Figure · field | Job | File | Prompt (verbatim, as submitted) |
| --- | --- | --- | --- | --- |
| 1 | The riser · electric blue | `4bfd299d-b3a7-4340-b6cb-54d5f0c4ef8c` | `hf_20260908_205455_4bfd299d-b3a7-4340-b6cb-54d5f0c4ef8c.png` | *Vertical 9:16 flat graphic advertising poster in the style of a classic silhouette campaign: a solid saturated electric blue background with absolutely no gradient, texture or shadow. One jet-black silhouette of a woman with her hair flying, caught mid-air in an explosive dance jump, knees up, arms flung wide, pure black with no interior detail and hard clean edges. Thin white earbud wires run from her ears down to a white smartphone held up in one hand, its screen a plain flat white rectangle; the wires and the phone are the only white elements in the image. No text, no logos, no other objects, no ground line.\n\nresolution: 2k* |
| 2 | The runner · teal | `f5c927f1-fc67-410d-a8a4-3f4c5d060617` | `hf_20260908_205455_f5c927f1-fc67-410d-a8a4-3f4c5d060617.png` | *Vertical 9:16 flat graphic advertising poster in the style of a classic silhouette campaign: a solid saturated teal background, hex 34D6C5, with absolutely no gradient, texture or shadow. One jet-black silhouette of a runner in full sprint, side-on, knees driving high, arms pumping, ponytail streaming back, pure black with no interior detail and hard clean edges. Thin white earbud wires run from the ears down to a white smartphone held in one hand, its screen a plain flat white rectangle; the wires and the phone are the only white elements in the image. No text, no logos, no other objects, no ground line.\n\nresolution: 2k* |
| 3 | The lifter · magenta | `adb06c92-d236-4a0f-beef-5c3733c53c2c` | `hf_20260908_205455_adb06c92-d236-4a0f-beef-5c3733c53c2c.png` | *Vertical 9:16 flat graphic advertising poster in the style of a classic silhouette campaign: a solid saturated hot magenta pink background with absolutely no gradient, texture or shadow. One jet-black silhouette of a broad-shouldered man pressing a kettlebell overhead in a wide split stance, his whole body driving upward, pure black with no interior detail and hard clean edges. Thin white earbud wires run from his ears down to a white smartphone held in his other hand, its screen a plain flat white rectangle; the wires and the phone are the only white elements in the image. No text, no logos, no other objects, no ground line.\n\nresolution: 2k* |
| 4 | The cook · lime | `a3f03228-0390-4d65-8d19-85edba506a6f` | `hf_20260908_205455_a3f03228-0390-4d65-8d19-85edba506a6f.png` | *Vertical 9:16 flat graphic advertising poster in the style of a classic silhouette campaign: a solid saturated lime green background with absolutely no gradient, texture or shadow. One jet-black silhouette of a cook tossing a frying pan so a burst of chopped vegetables hangs in the air above it as black shapes, body twisted with the throw, apron strings flying, pure black with no interior detail and hard clean edges. Thin white earbud wires run from the ears down to a white smartphone held in the other hand, its screen a plain flat white rectangle; the wires and the phone are the only white elements in the image. No text, no logos, no other objects, no ground line.\n\nresolution: 2k* |
| 5 | The kicker · orange | `7a77017d-626b-44f4-a65d-d1513970276d` | `hf_20260908_205455_7a77017d-626b-44f4-a65d-d1513970276d.png` | *Vertical 9:16 flat graphic advertising poster in the style of a classic silhouette campaign: a solid saturated bright orange background with absolutely no gradient, texture or shadow. One jet-black silhouette of a woman throwing a high roundhouse kick, her body coiled and dynamic, braids whipping out, pure black with no interior detail and hard clean edges. Thin white earbud wires run from her ears down to a white smartphone held in one hand, its screen a plain flat white rectangle; the wires and the phone are the only white elements in the image. No text, no logos, no other objects, no ground line.\n\nresolution: 2k* |
| 6 | The skipper · yellow | `97deaaac-ddfe-4564-8e12-018e4ed0c1fa` | `hf_20260908_205454_97deaaac-ddfe-4564-8e12-018e4ed0c1fa.png` | *Vertical 9:16 flat graphic advertising poster in the style of a classic silhouette campaign: a solid saturated sunflower yellow background with absolutely no gradient, texture or shadow. One jet-black silhouette of a man mid-jump over a skipping rope, the rope a thin black arc under his feet, elbows out, feet tucked, pure black with no interior detail and hard clean edges. Thin white earbud wires run from his ears down to a white smartphone held up in one hand, its screen a plain flat white rectangle; the wires and the phone are the only white elements in the image. No text, no logos, no other objects, no ground line.\n\nresolution: 2k* |

**v1b — the "more animated" photoreal pass (SUPERSEDED by the picture that named the silhouette campaign; already billed when it arrived), 2026-09-08 20:53 UTC**

| # | Room | Job | File | Prompt (verbatim, as submitted) |
| --- | --- | --- | --- | --- |
| 1 | Dawn bedroom | `cf859c8e-e1a3-4921-a324-5b89f19755d1` | `hf_20260908_205339_cf859c8e-e1a3-4921-a324-5b89f19755d1.png` | *Vertical 9:16, photoreal, cinematic film still with real energy: the person is caught mid-motion with visible motion blur on the moving body, while a matte-black phone stays perfectly still and sharp, its screen a blank dark glass panel with a soft even glow and nothing on it. Long ribbons of teal and white light trail around the moving body and streak across the frame, the light itself in motion. Locked-off camera, shallow depth of field, fine film grain, near-black shadows, high contrast, muted natural colour with the teal light as the only saturated colour. The person never looks at the camera. No text, no logos, no on-screen graphics, no watch. A small bedroom before dawn, blue-grey window light, one warm bedside lamp. A Black woman in her thirties in a grey sleep shirt throws the covers back and swings out of bed in one fast movement, hair and sheets in motion, her arm reaching for the phone lying face-up on the wooden nightstand in the lower half of the frame; a ribbon of teal light follows her arm.\n\nresolution: 2k* |
| 2 | Garage gym | `6338e97a-039b-48a8-8cdd-7e3e30f27135` | `hf_20260908_205339_6338e97a-039b-48a8-8cdd-7e3e30f27135.png` | *Vertical 9:16, photoreal, cinematic film still with real energy: the person is caught mid-motion with visible motion blur on the moving body, while a matte-black phone stays perfectly still and sharp, its screen a blank dark glass panel with a soft even glow and nothing on it. Long ribbons of teal and white light trail around the moving body and streak across the frame, the light itself in motion. Locked-off camera, shallow depth of field, fine film grain, near-black shadows, high contrast, muted natural colour with the teal light as the only saturated colour. The person never looks at the camera. No text, no logos, no on-screen graphics, no watch. A home garage gym at first light: rubber flooring, one bare tungsten bulb, a roller door open a hand's width onto blue dawn. A white man in his forties in a faded sweatshirt drives a kettlebell swing to its top, chalk dust bursting off his hands into the light, his body blurred with the movement, seen from the waist down and from behind; the phone leans against a second kettlebell on the floor in the lower centre of the frame, sharp and still; a ribbon of teal light whips around the swinging weight. Low camera at floor level.\n\nresolution: 2k* |
| 3 | Kitchen | `ce34bc73-3066-410b-a0af-5d633b39628c` | `hf_20260908_205339_ce34bc73-3066-410b-a0af-5d633b39628c.png` | *Vertical 9:16, photoreal, cinematic film still with real energy: the person is caught mid-motion with visible motion blur on the moving body, while a matte-black phone stays perfectly still and sharp, its screen a blank dark glass panel, nothing on it. Long ribbons of teal and white light trail around the moving body and streak across the frame, the light itself in motion. Locked-off camera, shallow depth of field, fine film grain, near-black shadows, high contrast, muted natural colour with the teal light as the only saturated colour. The person never looks at the camera. No text, no logos, no on-screen graphics, no watch. A narrow home kitchen at morning, warm under-cabinet light. A Latino man in his thirties with a cloth over one shoulder tosses a pan so the vegetables hang in the air mid-flip in a burst of steam and flame, his arms blurred; at the edge of frame a small child's hand grabs at a bowl; the phone stands propped against a glass jar on the counter in the lower centre of the frame, sharp and still; a ribbon of teal light curls up through the steam. The counter's front edge runs straight across the lower third.\n\nresolution: 2k* |
| 4 | The coach (tram) | `dfe5e7b0-de3a-46f4-a73d-bbd4dcbf0d35` | `hf_20260908_205339_dfe5e7b0-de3a-46f4-a73d-bbd4dcbf0d35.png` | *Vertical 9:16, photoreal, cinematic film still with real energy: the person is caught mid-motion with visible motion blur on the moving body, while a matte-black phone stays perfectly still and sharp, its screen a blank dark glass panel, nothing on it. Long ribbons of teal and white light trail around the moving body and streak across the frame, the light itself in motion. Locked-off camera, shallow depth of field, fine film grain, near-black shadows, high contrast, muted natural colour with the teal light as the only saturated colour. The person never looks at the camera. No text, no logos, no on-screen graphics, no watch. Inside a moving tram at rush hour, morning: the rain-streaked window smears the city into long horizontal streaks of light behind a Japanese woman in her twenties in a rain jacket with one earbud, who grips the overhead rail with one hand as the tram lurches, her body leaning with the motion, while her other hand holds the phone still at reading distance in the lower centre of the frame; a ribbon of teal light runs along the rail and out through the window streaks.\n\nresolution: 2k* |
| 5 | Noon bench | `ac2aa5e0-f743-441a-a085-6890b0815853` | `hf_20260908_205339_ac2aa5e0-f743-441a-a085-6890b0815853.png` | *Vertical 9:16, photoreal, cinematic film still with real energy: the person is caught mid-motion with visible motion blur on the moving body, while a matte-black phone stays perfectly still and sharp, its screen a blank dark glass panel, nothing on it. Long ribbons of teal and white light trail around the moving body and streak across the frame, the light itself in motion. Locked-off camera, shallow depth of field, fine film grain, near-black shadows, high contrast, muted natural colour with the teal light as the only saturated colour. The person never looks at the camera. No text, no logos, no on-screen graphics, no watch. A park bench at noon, hard sunlight and hard shadow. A gust of wind lifts the pages of a newspaper into the air around a Black man in his sixties in a cardigan and reading glasses, the pages mid-flutter and leaves blowing through the frame, his coat moving; he holds the phone still and sharp at reading distance in the lower centre of the frame; a ribbon of teal light threads through the flying pages. The bench's back rail runs straight across the frame.\n\nresolution: 2k* |
| 6 | Rooftop night | `ffdd818d-89a2-4e65-aeb3-3c8105940edb` | `hf_20260908_205340_ffdd818d-89a2-4e65-aeb3-3c8105940edb.png` | *Vertical 9:16, photoreal, cinematic film still with real energy: the person is caught mid-motion with visible motion blur on the moving body, while a matte-black phone stays perfectly still and sharp, its screen a blank dark glass panel with a soft even glow and nothing on it. Long ribbons of teal and white light trail around the moving body and streak across the frame, the light itself in motion. Locked-off camera, shallow depth of field, fine film grain, near-black shadows, high contrast, muted natural colour with the teal light as the only saturated colour. The person never looks at the camera. No text, no logos, no on-screen graphics, no watch. A city rooftop at night, the skyline behind a field of soft bokeh lights, wind in the air. A South Asian woman in her forties in a coat over pyjamas, holding a mug, is caught mid-step turning toward a low parapet wall, her coat and hair whipping in the wind, her body blurred with the turn; the phone lies flat on the parapet in the lower third of the frame, sharp and still, its glass glowing; a ribbon of teal light sweeps in from the skyline and coils down onto the parapet beside it.\n\nresolution: 2k* |

**v1 — the first photoreal style frames (SUPERSEDED — "have the images be more animated"), 2026-09-08 20:50 UTC**

| # | Room | Job | File | Prompt (verbatim, as submitted) |
| --- | --- | --- | --- | --- |
| 1 | Dawn bedroom | `b9693c7d-fb00-449f-a387-7d19085f6302` | `hf_20260908_205027_b9693c7d-fb00-449f-a387-7d19085f6302.png` | *Vertical 9:16, photoreal, cinematic film still. Locked-off camera, shallow depth of field, fine film grain, near-black shadows, muted natural colour with one small teal object somewhere in the frame. A matte-black phone, its screen a blank dark glass panel with a soft even glow and nothing on it. The person never looks at the camera and never performs for it. No text, no logos, no on-screen graphics, no watch. A small bedroom before dawn, blue-grey window light, one warm bedside lamp. The phone lies face-up on a wooden nightstand, centred in the lower half of the frame, its glass a soft even glow. A Black woman in her thirties in a grey sleep shirt sits up in the bed behind it, soft focus, reaching toward the phone. The nightstand's front edge runs straight across the frame.\n\nresolution: 2k* |
| 2 | Garage gym | `31b0e6af-90b7-4ab1-b6ae-5c676265ad94` | `hf_20260908_205027_31b0e6af-90b7-4ab1-b6ae-5c676265ad94.png` | *Vertical 9:16, photoreal, cinematic film still. Locked-off camera, shallow depth of field, fine film grain, near-black shadows, muted natural colour with one small teal object somewhere in the frame. A matte-black phone, its screen a blank dark glass panel with a soft even glow and nothing on it. The person never looks at the camera and never performs for it. No text, no logos, no on-screen graphics, no watch. A home garage gym at first light: rubber flooring, one bare tungsten bulb, a roller door open a hand's width onto blue dawn, a teal towel over a bar. The phone leans against a black kettlebell on the floor, centred, its glass a soft even glow. Behind it, defocused, a white man in his forties in a faded sweatshirt chalks his hands and lifts, seen from the waist down and from behind. Low camera at floor level.\n\nresolution: 2k* |
| 3 | Kitchen | `68d1f72b-3b7a-49cf-bfe3-d6b96886e8a6` | `hf_20260908_205027_68d1f72b-3b7a-49cf-bfe3-d6b96886e8a6.png` | *Vertical 9:16, photoreal, cinematic film still. Locked-off camera, shallow depth of field, fine film grain, near-black shadows, muted natural colour with one small teal object somewhere in the frame. A matte-black phone, its screen a blank dark glass panel, nothing on it. The person never looks at the camera and never performs for it. No text, no logos, no on-screen graphics, no watch. A narrow home kitchen at morning, warm under-cabinet light, steam rising from two pans. The phone stands propped against a glass jar on the counter, centred, its dark glass still. In the foreground a Latino man in his thirties with a cloth over one shoulder works over a board; at the edge of frame a small child's hand rests on a bowl. The counter's front edge runs straight across the lower third.\n\nresolution: 2k* |
| 4 | The coach (tram) | `521c9bfa-5ca5-404d-bb41-227775f4ead4` | `hf_20260908_205027_521c9bfa-5ca5-404d-bb41-227775f4ead4.png` | *Vertical 9:16, photoreal, cinematic film still. Locked-off camera, shallow depth of field, fine film grain, near-black shadows, muted natural colour with one small teal object somewhere in the frame. A matte-black phone, its screen a blank dark glass panel, nothing on it. The person never looks at the camera and never performs for it. No text, no logos, no on-screen graphics, no watch. Inside a tram at rush hour, morning, rain on the windows, soft grey light. A Japanese woman in her twenties in a rain jacket with one earbud sits with the phone held still in her lap at reading distance, its dark glass filling the lower centre of the frame; her hands frame it, her face soft above. A horizontal rail crosses the frame behind her.\n\nresolution: 2k* |
| 5 | Noon bench | `1e388900-adf5-4b12-80f6-efa0ea8e1575` | `hf_20260908_205027_1e388900-adf5-4b12-80f6-efa0ea8e1575.png` | *Vertical 9:16, photoreal, cinematic film still. Locked-off camera, shallow depth of field, fine film grain, near-black shadows, muted natural colour with one small teal object somewhere in the frame. A matte-black phone, its screen a blank dark glass panel, nothing on it. The person never looks at the camera and never performs for it. No text, no logos, no on-screen graphics, no watch. A park bench at noon, hard sunlight and hard shadow, a folded newspaper on the slats. A Black man in his sixties in a cardigan and reading glasses holds the phone still at reading distance, its dark glass centred; his hands and the phone are sharp, the trees behind are soft. The bench's back rail runs straight across the frame.\n\nresolution: 2k* |
| 6 | Rooftop night | `432f6c5a-194e-4396-a5f1-314875f3bdc8` | `hf_20260908_205027_432f6c5a-194e-4396-a5f1-314875f3bdc8.png` | *Vertical 9:16, photoreal, cinematic film still. Locked-off camera, shallow depth of field, fine film grain, near-black shadows, muted natural colour with one small teal object somewhere in the frame. A matte-black phone, its screen a blank dark glass panel with a soft even glow and nothing on it. The person never looks at the camera and never performs for it. No text, no logos, no on-screen graphics, no watch. A city rooftop at night, the skyline soft and far, one low parapet wall in the foreground. The phone lies flat on the parapet, centred, its glass a soft even glow, the only light on the face of a South Asian woman in her forties in a coat over pyjamas, holding a mug, leaning on the wall beside it. The parapet's top edge runs straight across the lower third.\n\nresolution: 2k* |
