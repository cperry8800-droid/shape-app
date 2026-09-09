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


⚠ **THE PHONE IS OUT OF THE STYLE VIDEO AND THE RUNNER WEARS A FITNESS WATCH — owner, 2026-09-09:** *"lets remove the
phone from the video all together. Can you have the person wear a fitness watch?"* Frame 8 was re-edited (E4: the
phone gone, a rounded-square teal-faced watch on that wrist, the ribbon flowing from the watch) and re-animated (row 7);
the finishing pass is unchanged and runs on the native 119.95 grid by the same ruling (*"go back to 120"*). The
measurements are in the run record. The film's spine still goes in through each person's phone glass — §10 q9 asks
whether that changes too.

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

⚠ **THE TWO STYLE VIDEOS RIDE THE PICK AT 140, BY RULING — STRETCHED, NOT RE-LABELLED** (owner, 2026-09-09: *"have
the bpm and hrm be 140 in the 2 videos"*). The bar's BPM is the measured tempo of the bed, so the bed was made 140:
`atempo=1.167153` on the dub-dark track (140 / 119.95; pitch unchanged) and re-measured by the same method with the
comb range widened to 110–150 — the default cap of 140 sits ON the answer, and a search cannot tell its edge from a
peak (`meas_d140.py`, in the run record under §2b):

| Track | Asked of the stretch | **Measured** | Halves | Kick from | Kick-less stretches (beats · seconds) | Length |
|---|---|---|---|---|---|---|
| **dub-dark × 1.167153** (`d140.m4a`) | 140 | **140.0** · P 0.428571 · φ 0.060 | 139.95 / 140.15 | **0.06 s** — the first beat | 61–79 · **26.2–33.9 s**; 112–118 · 48.1–50.6 s | 51.45 s = **30 bars** at 140 |
| **dub-dark × 1.083785** (`d130.m4a`, superseded) | 130 | **130.0** · P 0.461538 · φ 0.063 | 130.05 / 130.15 | **0.063 s** — the first beat | 57–59 · 26.4–27.3 s; 61–79 · **28.2–36.5 s**; 112–118 · 51.8–54.5 s | 55.39 s = **30 bars** at 130 |

Every structural fact survives the stretch, scaled by the one ratio: the kick still opens on beat 0, the breakdown is
still bars 16–20 and the return still the bar-21 downbeat, the track is still exactly 30 bars — a time-stretch moves
every event by the same factor. What changes is the feel: **this is the track the owner approved, 17 % faster.** The
10 s clip covers beats 0–23, whose `kick_by_beat` all read 0.54–0.85, so the mark pulses on every beat of both videos.
Whether the full film rides the 140 stretch too, or the §3 beat map is cut on the native 119.95 grid, is §10 q8.
⚠ **SUPERSEDED THE SAME AFTERNOON — *"how about 130 bpms"*.** The same route at 130 / 119.95 = 1.083785; the row
above is measured, not scaled from the 140 one, and it shows the one thing a scaled row would have hidden: at 130 the
thinning bars before the breakdown (beats 57–59) fall **under the presence gate** for three beats where at 140 and at
119.95 they stayed above it — the gate is a threshold on measured energy, and a stretch moves the energy a little as well
as the time. Outside the 10 s clip either way (its beats 0–21 read 0.64–0.85). **The 130 pair is the current one**; the
bed is the approved track 8 % faster rather than 17 %.
⚠ **AND THEN BACK — owner, the same afternoon: *"ok go back to 120"*.** The style pair rides the pick unstretched at
its measured **119.95** (`meas_d1.json`, re-measured in the 2026-09-09 run at exactly the recorded values); the bar
reads 120 because that is the rounded measurement, and both stretched rows above are history. The 140 row's
`d140.m4a` and the 130 row's `d130.m4a` stay recorded so the request can be re-made in one line if it comes back.

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
| **The film, v1 (2026-09-09)** | six block-A figures, one take each, all six kept; the runner's watch clip and the pick reused; eight captures; one render lease (248 s) | **6 `minimax_h3`** |
| **The film, v2 (2026-09-09)** | three new figures (yoga · cyclist · radio), one take each; the runner, the six kept v1 figures, the globe and the pick reused; no captures; two render leases (the first OOM-killed three of six chunks; the recovery lease re-rendered them three at a time) and one re-verify lease. A second radio take was refused: **the plan is out of credits** | **3 `minimax_h3`** (a fourth submitted and refused, unbilled) |

## 10 · Open questions for the owner (with the default I will use)

1. **The pages — CLOSED by measurement (2026-09-09).** The production preview boots on its dark paper (luma 18–31 across the
   Home page's rows), so the app pages are black pages already: the film is the black page throughout with the runner the
   one lit, printed figure, and every seam a page turn. The lights-out flip is not needed. Re-open only if the app's default
   paper changes.
2. **The highlighter colour.** Teal only (default — the brand's one colour, and the ribbon and the ticker border
   already carry it), or a colour per figure from the v6 spread (yellow-green for the cook, pink for the skipper,
   teal + yellow-green for the coach and client). v6-6 shows the two-colour pairing.
3. **The coach thread.** A real two-account capture on your accounts (default) or the signed-out preview.
4. **The one new line.** *A person. Not an algorithm.* — keep (default) or silence over the coach.
5. **Casting.** Seven figures in §4, one phrase each; the runner is the printed frame-8 runner, everyone else a
   highlighter outline, so casting is build and hair rather than face.
6. **The world — CLOSED (2026-09-09).** *"need to end with the globe clip that we generated"*: v2 closes on the Americas globe
   (the launch cut's Scene D, row 4 of the launch-cut Sources) with the lockup and the two end lines over it. No new
   generation: the clip's first 4.5 s, stretched, cover the six-bar page.
7. **Whose numbers.** The Score, ledger and Terrain captures come from a real account (default: yours).
8. **The tempo of the film — CLOSED.** Settled by the same day's rulings: 140, then *"how about 130 bpms"*, then
   *"ok go back to 120"*. The film rides the pick at its native 119.95 (§6); the bar says 120 because that is what the
   music measures.
9. **Phones in the film — CLOSED (2026-09-09).** v2 has no phone anywhere and no seam passes through one: every seam is a
   crossfade, the runner wears the watch, and the app is not on screen (*"dont include full pictures of the app, that is going
   to be in a separate ad video"*). The through-the-glass spine of §1–§2 is v1's; v2's spine is the ribbon and the grid.
10. **The Shape Radio page is a bust, because the account ran out of credits.** The one take (row 15) is head and shoulders;
    a full-length second take was drafted and refused for credits (the un-billed Sources row). Default: the bust stays, taken
    at luma < 40 and dissolved above the ticker. When credits return, one `minimax_h3` re-shoot with the drafted prompt
    replaces it; nothing else in the film needs a generation.

## 11 · What changed from v1, and why

v1 ("Through the Glass") was photoreal: seven strangers in seven rooms, the camera passing through their phones,
a teal hairline running the film. The first six style frames read as too still; the "more animated" pass added
motion blur and light ribbons and was already billed when the picture arrived. The picture named a different
reference — the silhouette campaign, not an iPad film — and it happens to dissolve v1's three hardest problems
(faces across clips, hands holding phones, a phone that must not move). The spine survives whole: through the
glass, one line, the lock, the lights-out, the close on the mark. The globe and the photoreal runner are the two
things this world does not carry; both stay available (§10).

---


## The film, v1 — "Silhouettes" built: thirty bars on the pick's grid (2026-09-09)

Owner, on the runner pair with the watch: *"ok looks good. make the rest of video now."* So the film is built as §2b describes it —
**generated: the figures; drawn: everything else** — on the pick's measured 119.95 grid (`meas_d1.json`, re-measured in the run:
119.95 · P 0.500208 · φ 0.055 · halves 120.0 / 120.0), 1440×2560 · 24 fps · **30 bars = 1,442 frames / 60.08 s**. Every page
starts on a downbeat with a page turn; the mark is top-left in every frame with the launch cut's throb and glow, gated on the
kick; the bar, the captions and the end card are drawn per frame; no phone appears anywhere (the runner wears the watch).

**The pages** (`plan.json`, verbatim below; `bar(b)` = the bar-b downbeat on the grid):

| Bars | Page | What is on it | Source · offset | Caption |
|---|---|---|---|---|
| 1–2 | black · the riser | walks in from the left and breaks into a dance, a highlighter outline | `fig_riser.mp4` · 0.0 s | — |
| 3–4 | the app · Home → TRAIN → the Train deck | a real capture of the production preview on its dark paper | `ui_home_train.mp4` · 0.8 s | *Written before you arrive.* |
| 5–6 | black · the lifter | kettlebell swings | `fig_lifter.mp4` · 0.5 s | — |
| 7–8 | the app · the live session | the ▶ tap, the session, a scroll | `ui_session.mp4` · 1.2 s | *The live session.* |
| 9–10 | black · the cook | tossing the pan, vegetables in the air | `fig_cook.mp4` · 0.5 s | — |
| 11–12 | the app · Eat | the Menu, a scroll | `ui_menu.mp4` · 0.3 s | *Every meal, planned.* |
| 13–15 | black · the coach | seated on her stool, one foot tapping, on the thinning kick | `fig_coach.mp4` · 0.5 s | *A person. Not an algorithm.* |
| 16–20 | **cream · the runner** | the approved watch clip as it is, the HRM / BPM bar, the lock on the bar-19 downbeat inside the breakdown | `runner.mp4` · 0.0 s | (the bar) |
| 21–22 | black · the kicker | roundhouse kicks, landing on the kick's return | `fig_kicker.mp4` · 0.5 s | — |
| 23–24 | the app · Shape Score | the ring, THIS TIER, THE LADDER | `ui_score.mp4` · 3.2 s | *One number that tells the truth.* |
| 25–26 | black · the skipper | one jump per beat under the rope | `fig_skipper.mp4` · 0.5 s | — |
| 27–28 | the montage | one figure per beat: riser · lifter · cook · coach · **runner (cream)** · kicker · skipper · riser | each at 6.0 s in (the last at 7.0) | — |
| 29–30 | the end card | the mark centred with its glow flashing on the downbeat, the wordmark, the teal rule drawing under it, *Different goals. One Community.*, ONE PLATFORM FEE · $5 /MO · CANCEL ANY TIME; the track fades over the last 0.6 s | drawn | — |

**What the clip gate settled, measured before a frame was rendered.** The six block-A clips (one take each, `minimax_h3`,
Sources rows 8–13) were gated on sampled frames (`gate.py`, `gate2.py`): every figure solid (hollow ratio 0.00–0.03), the page
still (top-band boil 0.1–1.3 luma), no white object anywhere (a lit phone screen is ~17,000 px above luma 250; these hold 0–921),
mask areas 3–14 % of the page, and the grey column blocks safely above the figure threshold (luma 90–150 against the figures'
< 40). A 1-bit **mask sheet** of the six at 1, 4 and 8 s was brought across as checksummed base64 (18 lines; one corrupted in
transit and repaired from 50-char pieces) and looked at: the riser walks in from the left edge and opens into a dance; the
lifter swings; the cook stands behind a counter with the vegetables in the air; the coach sits on a stool; the kicker's braids
whip; the skipper jumps under the rope. ⚠ **Two of the clips draw the page's masthead rule LOW — inside the band the pass
strokes.** The pass strikes thin full-width dark rows the way it strikes the column rules — up to 60 px in the top zone (rows
250–700), 12 px below it — so a masthead band drawn low goes and the cook's counter and the skipper's floor stay. *A generated
page has its architecture where the model put it, not where the prompt did.*

**The captures.** Eight segments of the production `/m/` signed-out preview (`pw/tourF.js`, below), CDP `Page.captureScreenshot`
at a 360×640 viewport, **scale 3** (1080×1920 → 1440×2560 in the stitch), ~10 fps — a first pass at scale 4 gave the film's exact
frame but only ~5 fps, and a 3.6-s scroll in 16 steps is a stepped scroll. ⚠ **The preview boots on its dark paper** (measured:
the Home page's luma is 18–31 across its rows), so the app pages sit on the film's black page world natively and no lights-out
seam is needed. The four used: `home_train` (tab at 1.80 s, scroll at 4.24), `session` (tap 0.50, scroll 4.54), `menu` (tab 0.50,
scroll 2.94), `score` (tap 0.50, tier 4.55, ladder 7.14, scroll 8.75); `setlog`, `meal`, `profile` (CLIMB) and `habits` were
captured and are checkpointed for the next cut. ⚠ **The preview's demo cast is on these pages** — the same honesty caveat as the
feature spots, and the same owner ruling still open.

| Segment | Captured frames · ms · fps | Acts (s) | Stitched (1440×2560 · 24 fps) | md5 | bytes |
|---|---|---|---|---|---|
| `home_train` (used, bars 3–4) | 90 · 8,870 · 10.1 | tab TRAIN 1.80 · scroll 4.24 | 209 frames | `3cb18da045576648baad736fd3108d50` | 2,279,674 |
| `session` (used, bars 7–8) | 88 · 8,664 · 10.2 | tap ▶ 0.50 · scroll 4.54 | 206 | `2ee07376ad8db2b380062780953e7436` | 1,893,599 |
| `setlog` | 40 · 4,580 · 8.7 | tap 0.50 | 108 | `3a1072d7b7abc0299783337144c01bcb` | 445,578 |
| `menu` (used, bars 11–12) | 73 · 7,551 · 9.7 | tab EAT 0.50 · scroll 2.94 | 179 | `1b5fc19cb79c78172b98ff1721c965c7` | 2,180,996 |
| `meal` | 82 · 8,628 · 9.5 | tap 0.50 · scroll 4.51 | 205 | `edb825381e252f89bf9549988bb559a5` | 3,358,426 |
| `profile` (CLIMB) | 120 · 12,069 · 9.9 | tab ME 0.50 · scroll 2.74 · CLIMB 8.02 | 287 | `9fb38a06a78ee1492d38f9a9af831444` | 7,358,891 |
| `score` (used, bars 23–24) | 124 · 12,848 · 9.7 | tap 0.50 · THIS TIER 4.55 · THE LADDER 7.14 · scroll 8.75 | 307 | `9ba53b79c7a0ee49434dc6d63185b75c` | 2,879,770 |
| `habits` | 70 · 8,973 · 7.8 | tab HOME 0.40 · VIEW ALL 1.83 · scroll 5.46 | 213 | `5ee3ed76939a87f5450782d931f729c1` | 1,901,470 |

Checkpointed on uguu (a 3-hour host; the film lease consumed them inside the hour) and kept in the sandbox's `cap/seg/`; the run
took the four it used from the sandbox copies with md5s matching. The first pass at scale 4 (5 fps; md5s `7a04213d…` `b9f4ba08…`
`d03e1994…` `0bf5ad9e…` `ebc8a9f5…` `38df237c…` `7b15c615…` `5c9fadd2…`) is superseded and was not used; its uploader had matched
a host's error page as a URL, and the uploader now checks the host in what comes back.

**The render.** `runFilm.sh` (below) in one background lease: inputs fetched or reused with md5 checks, the grid re-measured,
**three chunks rendered in parallel** on the same script (`WINDOWS` at the bar-11 and bar-21 downbeats, video only), concatenated
with `-c copy` and the pick muxed once with the fade — the whole pass fits one lease that way where a single process would not.

| Output | md5 | bytes | frames · s | measured |
|---|---|---|---|---|
| **`film_v1.mp4`** | `2561acfa4e44feb5111f382eabd4ecd6` | 28,485,970 | 1,442 · 60.084 | chunks A/B/C 482 / 480 / 480 frames, rendered in 198 (A 180 · B 117 · C 193) s on three cores, the whole lease 248 s; the pick under it at 119.95 (re-measured on the rendered audio: 119.95 · P 0.500208 · φ 0.055 over 60.024 s) |

The first render of the same plan (`film.py` md5 `a4a8a1281945c9b31f2f02ce5c33ecf4`, output md5 `12677a5d5fd6b92ae04c09428ce7fc7f`,
28,520,674 B) is superseded: its verifier read 18 / 22, and the one real failure among the four was the cook's page — the
masthead band that clip draws low is thicker than a hairline, survived the 12-px strike and was outlined as a glowing bar (the
top-left crop held 12,265 teal px against the lifter's 3,208). The other three were the instrument: a "within-page" window that
straddled a caption's fade-in, the same window straddling a montage cut, and a threshold tuned for cream pages applied to two
black ones. Handed over as links (gofile, and a 72-hour direct link); review copies are never committed.

**Verified on the render** (`verifyF.py`, below, md5 `071351874e647e1801057b2c575303bf`): **21 PASS / 1 FAIL — the one failure is the instrument: the turn INTO the montage is a black outline page turning into another black outline page, which differ by 8.4 luma levels where the check wanted 8.6; the pages log and the montage-cut check show the turn and the cut happened**.

```
probe 1440×2560 · 24/1 · nb_read_frames 1442 · duration 60.084
PASS turn ui_train across 23.7 within 0.6
PASS turn lifter across 11.5 within 0.7
PASS turn ui_session across 10.1 within 0.2
PASS turn cook across 14.3 within 3.5
PASS turn ui_menu across 14.0 within 0.4
PASS turn coach across 14.8 within 2.7
PASS turn runner across 158.3 within 28.7
PASS turn kicker across 159.6 within 5.4
PASS turn ui_score across 13.6 within 0.4
PASS turn skipper across 15.8 within 3.6
FAIL turn montage across 8.4 within 3.3
PASS turn end across 5.4 within 0.0
PASS mark on kick lifter beat 16 on 3208 mid 3026 kb 0.749
PASS mark on kick cook beat 32 on 3252 mid 3028 kb 0.864
PASS mark still in the breakdown on 2306 mid 2313 kb 0.001
PASS IN SYNC lands on bar 19 post 6628 pre 339 TS 36.070
PASS caption ui_train start 0 mid 12642
PASS caption coach start 2229 mid 10963
PASS caption ui_score start 0 mid 13299
PASS end card wordmark white px 15685 fee-line teal 8747
PASS montage cut diff 6.8
PASS audio grid {'bpm': 119.95, 'P': 0.500208, 'phase': 0.055, 'score': 0.3855} dur 60.024
RESULT 21 PASS 1 FAIL
```

⚠ **Not watched by the agent.** Eight frames — one per kind of page — were brought across as a checksummed 6-level contact sheet
and looked at: the riser's outline with the mark and ribbon on the black page; the Train deck with *Written before you arrive.*;
the coach with her line; the runner on cream with the bar reading IN SYNC; the kicker; Shape Score with its line; the runner's
cream flash in the montage; the end card. Two things for the next cut, seen there: the captions on the app pages sit over
content near the bottom of the page (a band, or a higher line, next time), and the coach's clip carries a tall dark block beside
her stool that the pass outlines as furniture.

**The scripts, verbatim.** `film.py` (md5 `a6fb1d284af62fa40db8ff761f897326`) — the assembly; `plan.json` (md5 `73bab387490a77abb6da41a0cc86bc22`) — the pages;
`runFilm.sh` (md5 `fbc3d4f2db34198147524c13873000b7`) — the lease; `pw/tourF.js` (md5 `281706420cbd08d0f42d4bbf6ea8d545`) — the capture tour at scale 3, and
`segF.py` (md5 `ed8ea16086c0fa036849706cb3e86449`) — the stitch; `runCap2.sh` (md5 `6aa10cf47768241fe39652112bf1c2c1`) — the capture lease; `verifyF.py`
(md5 `071351874e647e1801057b2c575303bf`, the copy that ran; the local copy `16214cc140af6cc09e244c2a9cb3bafe` carries comment lines) — the verifier;
`gate.py` / `gate2.py` — the clip gate (by description above; their outputs are in the WORKLOG entry). `beat.py` and
`meas_d1.py` are the ones recorded with the style pair.

```python
# film.py -- the one-shot film assembly. python3 film.py <out.mp4>; FILM_DIR holds the inputs (see PLAN); WINDOWS="a-b,c-d" renders only those seconds (a test).
import json, math, os, sys, subprocess, numpy as np
from collections import deque
from PIL import Image, ImageFilter, ImageDraw, ImageFont
W,H=1440,2560; FPS=24; D=os.environ.get('FILM_DIR','/home/user/film'); OUT=sys.argv[1]
TEAL=(0x34,0xd6,0xc5); TEALf=np.array(TEAL,np.float32); CREAM=(0xf2,0xea,0xd8); CREAMf=np.array(CREAM,np.float32); INK=(20,20,20)
m=json.load(open(f'{D}/meas_d1.json')); BPM=m['bpm']; PH=m['phase']; KB=m.get('kick_by_beat') or []; P=60.0/BPM
def beat(n): return PH+n*P
def bar(b): return beat(4*(b-1))
def kof(t):
    u=(t-PH)%P; n=int((t-PH)//P); pres=1.0 if not KB or n<0 or n>=len(KB) else min(1.0,max(0.0,(KB[n]-0.15)/0.30)); return math.exp(-u/0.20)*pres
def sstep(x): x=min(1.0,max(0.0,x)); return x*x*(3-2*x)
# ---------- fonts ----------
def font(path,size,var=None):
    try:
        f=ImageFont.truetype(path,size)
        if var:
            try: f.set_variation_by_axes(var)
            except Exception: pass
        return f
    except Exception: return ImageFont.load_default(size)
F_MONT=os.environ.get('F_MONT','/usr/share/fonts/truetype/higgsfield/Montserrat-ExtraBold.ttf'); F_NEWS=os.environ.get('F_NEWS',f'{D}/Newsreader.ttf')
f_lab=font(F_MONT,30); f_num=font(F_MONT,46); f_sync=font(F_MONT,64); f_cap=font(F_NEWS,70,[500,60]); f_end=font(F_NEWS,78,[500,60]); f_fee=font(F_MONT,34)
# ---------- the mark ----------
tri=Image.open(f'{D}/tri.png').convert('RGBA'); ASP=tri.width/tri.height
def glow_mark(canvas, mark, cx, cy, h, k, base, flash, blur, amp=0.06):
    s=1.0+amp*k; hh=max(8,int(round(h*s))); ww=max(6,int(round(hh*ASP))); mk=mark.resize((ww,hh),Image.LANCZOS)
    R=blur*3+mk.width//2+mk.height//2; x0,y0=int(cx-R),int(cy-R); S=2*R
    layer=Image.new('RGBA',(S,S),(0,0,0,0)); px,py=int(round(R-mk.width/2)),int(round(R-mk.height/2))
    a=Image.new('L',(S,S),0); a.paste(mk.split()[3],(px,py)); g=a.filter(ImageFilter.GaussianBlur(blur))
    ga=Image.fromarray((np.asarray(g).astype(np.float32)*(base+flash*k)).clip(0,255).astype(np.uint8))
    glow=Image.merge('RGBA',[Image.new('L',(S,S),TEAL[0]),Image.new('L',(S,S),TEAL[1]),Image.new('L',(S,S),TEAL[2]),ga])
    layer=Image.alpha_composite(layer,glow); layer.alpha_composite(mk,(px,py)); canvas.alpha_composite(layer,(x0,y0))
def mark_on(canvas,k,cream):
    if cream: glow_mark(canvas,tri,100+130*ASP/2,150+65,130,k,0.28,0.55,16)
    else: glow_mark(canvas,tri,90+150*ASP/2,30+75,150,k,0.35,0.65,20)
# ---------- the black page ----------
def blur_mask(m,r): return np.asarray(Image.fromarray((m*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float32)/255.0
def black_page():
    page=Image.new('RGB',(W,H),(10,10,10)); d=ImageDraw.Draw(page); c=tuple(int(v*0.30+10*0.70) for v in CREAM)
    d.rectangle([90,200,W-90,203],fill=c); d.rectangle([90,214,W-90,215],fill=c)
    for x in (90,W//3,2*W//3,W-90): d.rectangle([x,260,x+1,H-330],fill=c)
    d.rectangle([90,H-300,W-90,H-200],fill=(28,28,28)); d.rectangle([90,H-300,102,H-200],fill=TEAL); return page
PAGE=np.asarray(black_page()).astype(np.float32)
class Highlighter:
    """hl.py MODE=solid: the figure's mask -> a teal stroke with glow on the black page, the centroid trail as the ribbon."""
    def __init__(self): self.rulecols=None; self.trail=deque(maxlen=18)
    def frame(self,f):
        g=0.299*f[...,0]+0.587*f[...,1]+0.114*f[...,2]; m=g<90; m[:250]=False; m[H-340:]=False
        if self.rulecols is None:
            frac=m[250:H-340].mean(0); self.rulecols=[x for x in range(W) if frac[x]>0.55]
        for x in self.rulecols: m[:,max(0,x-3):x+4]=False
        # thin full-width dark rows are the page's own hairlines drawn low: struck like the column rules; thick bands stay (a counter, a floor)
        rf=m[:,90:W-90].mean(1); dark=rf>0.5; y=250
        while y<H-340:
            if dark[y]:
                y0=y
                while y<H-340 and dark[y]: y+=1
                if y-y0<=(60 if y0<700 else 12): m[max(0,y0-2):y+2]=False   # a masthead band drawn low (the top zone) or a hairline anywhere; a counter or a floor stays
            else: y+=1
        m=blur_mask(m,4)>0.35; bm=blur_mask(m,6); stroke=((bm>0.12)&(bm<0.88)).astype(np.float32)
        S=Image.fromarray((stroke*255).astype(np.uint8)); glow=np.asarray(S.filter(ImageFilter.GaussianBlur(16))).astype(np.float32)/255.0
        a=np.clip(glow*0.6+stroke*0.95,0,1)[...,None]; out=PAGE*(1-a)+TEALf*a
        ys,xs=np.nonzero(m)
        if len(xs)>200: self.trail.append((float(xs.mean()),float(ys.mean())))
        if len(self.trail)>2:
            R=Image.new('L',(W,H),0); dr=ImageDraw.Draw(R); pts=list(self.trail)
            for i in range(1,len(pts)): dr.line([pts[i-1],pts[i]],fill=int(255*i/len(pts)),width=6)
            ra=np.asarray(R.filter(ImageFilter.GaussianBlur(2))).astype(np.float32)[...,None]/255.0*0.8; out=out*(1-ra)+TEALf*ra
        return out.clip(0,255).astype(np.uint8)
# ---------- the sync bar (the runner page) ----------
BX0,BX1,BY=560,1120,262; CX=(BX0+BX1)//2; HALF=(BX1-BX0)//2-24; LY0,LY1=150,340; BPMi=int(round(BPM)); HR0=BPMi-36
def spaced(d,x,y,s,fnt,col,anchor,sp=5):
    ws=[fnt.getlength(ch) for ch in s]; tot=sum(ws)+sp*(len(s)-1); x0={'l':x,'r':x-tot,'m':x-tot/2}[anchor]
    for ch,w in zip(s,ws): d.text((x0,y),ch,font=fnt,fill=col,anchor='ls'); x0+=w+sp
def sync_bar(canvas,t,k,T0,TS,ink,barc,teal):
    L=Image.new('RGBA',(W,LY1-LY0),(0,0,0,0)); d=ImageDraw.Draw(L); y=BY-LY0
    d.rectangle([BX0,y-2,BX1,y+2],fill=barc)
    hr=HR0+(BPMi-HR0)*sstep((t-T0)/(TS-T0)); gap=(BPMi-hr)/float(BPMi-HR0); synced=t>=TS
    spaced(d,BX0-40,y-14,'HRM',f_lab,ink,'r'); d.text((BX0-40,y+42),str(int(round(hr))),font=f_num,fill=ink,anchor='rs')
    spaced(d,BX1+40,y-14,'BPM',f_lab,ink,'l'); d.text((BX1+40,y+42),str(BPMi),font=f_num,fill=teal,anchor='ls')
    if not synced:
        xL=CX-gap*HALF; xR=CX+gap*HALF; r=15
        d.ellipse([xL-r,y-r,xL+r,y+r],fill=ink); d.ellipse([xR-r,y-r,xR+r,y+r],fill=teal); canvas.alpha_composite(L,(0,LY0)); return
    u=min(1.0,(t-TS)/0.25); r=15+9*u+4*k
    G=Image.new('L',L.size,0); ImageDraw.Draw(G).ellipse([CX-r-10,y-r-10,CX+r+10,y+r+10],fill=255); G=G.filter(ImageFilter.GaussianBlur(18))
    ga=Image.fromarray((np.asarray(G).astype(np.float32)*(0.35+0.5*k)*u).clip(0,255).astype(np.uint8))
    L.alpha_composite(Image.merge('RGBA',[Image.new('L',L.size,teal[0]),Image.new('L',L.size,teal[1]),Image.new('L',L.size,teal[2]),ga]))
    d=ImageDraw.Draw(L); d.ellipse([CX-r,y-r,CX+r,y+r],fill=teal)
    T=Image.new('RGBA',L.size,(0,0,0,0)); spaced(ImageDraw.Draw(T),CX,y-40,'IN SYNC',f_sync,teal,'m',7)
    if u<1: T.putalpha(T.split()[3].point(lambda v:int(v*u)))
    L.alpha_composite(T); canvas.alpha_composite(L,(0,LY0))
# ---------- captions ----------
CAP_Y=2150
def caption_layer(text,col):
    L=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(L)
    sh=Image.new('L',(W,H),0); ImageDraw.Draw(sh).text((W//2,CAP_Y),text,font=f_cap,fill=255,anchor='ms'); sh=sh.filter(ImageFilter.GaussianBlur(10))
    sha=Image.fromarray((np.asarray(sh).astype(np.float32)*0.75).astype(np.uint8)); L.alpha_composite(Image.merge('RGBA',[Image.new('L',(W,H),0),Image.new('L',(W,H),0),Image.new('L',(W,H),0),sha]))
    d=ImageDraw.Draw(L); d.text((W//2,CAP_Y),text,font=f_cap,fill=col,anchor='ms'); return L
def with_alpha(L,a):
    if a>=1: return L
    return Image.merge('RGBA',[*L.split()[:3],L.split()[3].point(lambda v:int(v*a))])
def cap_alpha(t,t0,t1): return min(1.0,max(0.0,(t-(t0+0.35))/0.18))*min(1.0,max(0.0,((t1-0.15)-t)/0.18))
# ---------- the end card ----------
def endcard_layers():
    logo=Image.open(f'{D}/logo.png').convert('RGBA'); a=np.asarray(logo.split()[3]); rows=np.nonzero(a[1240:].sum(1)>0)[0]; cols=np.nonzero(a[1240:].sum(0)>0)[0]
    wm=logo.crop((int(cols[0]),1240+int(rows[0]),int(cols[-1])+1,1240+int(rows[-1])+1)); ww=960; wm=wm.resize((ww,int(wm.height*ww/wm.width)),Image.LANCZOS)
    mk=tri.resize((int(380*ASP),380),Image.LANCZOS)
    a=Image.new('L',(W,H),0); a.paste(mk.split()[3],(W//2-mk.width//2,880-mk.height//2)); g=np.asarray(a.filter(ImageFilter.GaussianBlur(28))).astype(np.float32)
    return wm,mk,g
# ---------- readers ----------
class Reader:
    def __init__(self,src,s0):
        self.p=subprocess.Popen(['ffmpeg','-v','error','-ss',f'{max(0.0,s0):.4f}','-i',src,'-vf',f'scale={W}:{H}','-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,bufsize=10**8); self.last=None
    def read(self):
        b=self.p.stdout.read(W*H*3)
        if len(b)<W*H*3: return self.last
        self.last=np.frombuffer(b,np.uint8).reshape(H,W,3); return self.last
    def close(self):
        try: self.p.kill(); self.p.stdout.close(); self.p.wait()
        except Exception: pass
# ---------- the plan ----------
PLAN=json.load(open(f'{D}/plan.json'))   # [{name,kind,src,t0,t1,s0,caption?}, ...]; montage: {kind:'montage',slots:[[src,s0],...]}
for pg in PLAN: pg['t0']=eval(str(pg['t0'])); pg['t1']=eval(str(pg['t1']))
T_END=PLAN[-1]['t1']; TURN=6/FPS
wm_img,mk_big,mk_glow=endcard_layers(); caps={}
class Page:
    def __init__(self,pg):
        self.pg=pg; self.kind=pg['kind']; self.hl=Highlighter() if self.kind in ('fig',) else None; self.reader=None; self.slot=-1; self.slot_reader=None; self.slot_hl=None
        if self.kind not in ('montage','end'): self.reader=Reader(f"{D}/{pg['src']}",pg['s0'])
        self.cap=caption_layer(pg['caption'],CREAM if self.kind!='runner' else INK) if pg.get('caption') else None
    def render(self,t):
        k=kof(t); pg=self.pg
        if self.kind=='end': return self.render_end(t,k)
        if self.kind=='montage':
            s=min(len(pg['slots'])-1,int((t-pg['t0'])//P))
            if s!=self.slot:
                if self.slot_reader: self.slot_reader.close()
                src,s0=pg['slots'][s]; self.slot=s; self.slot_reader=Reader(f'{D}/{src}',s0); self.slot_hl=Highlighter() if not src.startswith('runner') else None
            f=self.slot_reader.read(); cream=self.slot_hl is None
            img=Image.fromarray(f if cream else self.slot_hl.frame(f)).convert('RGBA'); mark_on(img,k,cream); return img
        f=self.reader.read()
        if self.kind=='fig': img=Image.fromarray(self.hl.frame(f)).convert('RGBA'); mark_on(img,k,False)
        elif self.kind=='ui': img=Image.fromarray(f).convert('RGBA'); mark_on(img,k,False)
        elif self.kind=='runner':
            img=Image.fromarray(f).convert('RGBA'); mark_on(img,k,True); sync_bar(img,t,k,pg['t0']+0.5,eval(str(pg['ts'])),INK,(95,95,95),TEAL)
        if self.cap is not None:
            a=cap_alpha(t,pg['t0'],pg['t1'])
            if a>0: img.alpha_composite(with_alpha(self.cap,a))
        return img
    def render_end(self,t,k):
        pg=self.pg; u=t-pg['t0']; img=black_page().convert('RGBA')
        kk=max(k,math.exp(-u/0.25))   # the card's own flash on its downbeat
        mk=mk_big; cx,cy=W//2,880; layer=Image.new('RGBA',(W,H),(0,0,0,0))
        ga=Image.fromarray((mk_glow*(0.30+0.6*kk)).clip(0,255).astype(np.uint8))
        layer.alpha_composite(Image.merge('RGBA',[Image.new('L',(W,H),TEAL[0]),Image.new('L',(W,H),TEAL[1]),Image.new('L',(W,H),TEAL[2]),ga])); layer.alpha_composite(mk,(cx-mk.width//2,cy-mk.height//2))
        img.alpha_composite(layer)
        aw=sstep((u-0.4)/0.35)
        if aw>0: img.alpha_composite(with_alpha(wm_img,aw),(cx-wm_img.width//2,1180))
        ar=sstep((u-0.9)/0.5)
        if ar>0: ImageDraw.Draw(img).rectangle([cx-480,1180+wm_img.height+40,int(cx-480+960*ar),1180+wm_img.height+44],fill=TEAL)
        a1=sstep((u-1.3)/0.3)
        if a1>0:
            L=Image.new('RGBA',(W,H),(0,0,0,0)); ImageDraw.Draw(L).text((cx,1180+wm_img.height+180),'Different goals. One Community.',font=f_end,fill=CREAM,anchor='ms'); img.alpha_composite(with_alpha(L,a1))
        a2=sstep((u-1.8)/0.3)
        if a2>0:
            L=Image.new('RGBA',(W,H),(0,0,0,0)); spaced(ImageDraw.Draw(L),cx,1180+wm_img.height+290,'ONE PLATFORM FEE  ·  $5 /MO  ·  CANCEL ANY TIME',f_fee,TEAL,'m',4); img.alpha_composite(with_alpha(L,a2))
        return img
    def close(self):
        if self.reader: self.reader.close()
        if self.slot_reader: self.slot_reader.close()
def page_turn(new,old,f):
    """the broadsheet turn: the new page comes down from the top over the old one, a folded-edge shadow under the edge."""
    e=f*f*(3-2*f); y=int(round(e*H)); out=old.copy()
    if y>0: out.paste(new.crop((0,0,W,y)),(0,0))
    if 0<y<H:
        sh=Image.new('RGBA',(W,min(56,H-y)),(0,0,0,0)); d=ImageDraw.Draw(sh)
        for i in range(sh.height): d.line([(0,i),(W,i)],fill=(0,0,0,int(150*(1-i/sh.height))))
        out.alpha_composite(sh,(0,y))
    return out
# ---------- render ----------
WIN=[tuple(float(v) for v in w.split('-')) for w in os.environ.get('WINDOWS','').split(',') if w]
def want(t): return (not WIN) or any(a<=t<b for a,b in WIN)
VID=['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-']
AUD=[] if os.environ.get('NOAUDIO') else ['-i',f'{D}/d1.m4a','-map','0:v','-map','1:a','-af',f'atrim=0:{T_END:.3f},afade=t=out:st={T_END-0.6:.3f}:d=0.6','-c:a','aac','-b:a','192k','-shortest']
wr=subprocess.Popen(VID+AUD+['-c:v','libx264','-preset',os.environ.get('PRESET','medium'),'-crf','18','-pix_fmt','yuv420p',OUT],stdin=subprocess.PIPE)
pages=[]; cur=None; prev=None; n=0; nw=0; log=[]
NF=int(math.ceil(T_END*FPS))
import time; t_start=time.time()
for n in range(NF):
    t=n/FPS
    if cur is None or t>=cur.pg['t1']:
        i=0
        while i<len(PLAN)-1 and t>=PLAN[i]['t1']: i+=1
        if cur is not None and cur.pg is not PLAN[i]:
            if prev: prev.close()
            prev=cur; prev_end=cur.pg['t1']
        if cur is None or cur.pg is not PLAN[i]:
            cur=Page(PLAN[i]); log.append((n,round(t,3),PLAN[i]['name']))
    if not want(t):
        # keep the readers in step even when a frame is skipped
        if cur.kind not in ('montage','end'): cur.reader.read()
        if prev is not None and t<prev_end+TURN and prev.kind not in ('montage','end'): prev.reader.read()
        continue
    img=cur.render(t)
    if prev is not None and t<prev_end+TURN and prev.kind!='montage':
        old=prev.render(t); img=page_turn(img,old,(t-prev_end)/TURN)
    elif prev is not None and t<prev_end+TURN and prev.kind=='montage':
        old=prev.render(t); img=page_turn(img,old,(t-prev_end)/TURN)
    wr.stdin.write(img.convert('RGB').tobytes()); nw+=1
    if n%120==0: print('frame',n,'t',round(t,2),cur.pg['name'],'elapsed',int(time.time()-t_start),flush=True)
wr.stdin.close(); wr.wait()
print('frames planned',NF,'written',nw,'pages',log); print('FILM-DONE',flush=True)
```

```json
[
 {"name":"riser","kind":"fig","src":"fig_riser.mp4","t0":"bar(1)","t1":"bar(3)","s0":0.0},
 {"name":"ui_train","kind":"ui","src":"ui_home_train.mp4","t0":"bar(3)","t1":"bar(5)","s0":0.8,"caption":"Written before you arrive."},
 {"name":"lifter","kind":"fig","src":"fig_lifter.mp4","t0":"bar(5)","t1":"bar(7)","s0":0.5},
 {"name":"ui_session","kind":"ui","src":"ui_session.mp4","t0":"bar(7)","t1":"bar(9)","s0":1.2,"caption":"The live session."},
 {"name":"cook","kind":"fig","src":"fig_cook.mp4","t0":"bar(9)","t1":"bar(11)","s0":0.5},
 {"name":"ui_menu","kind":"ui","src":"ui_menu.mp4","t0":"bar(11)","t1":"bar(13)","s0":0.3,"caption":"Every meal, planned."},
 {"name":"coach","kind":"fig","src":"fig_coach.mp4","t0":"bar(13)","t1":"bar(16)","s0":0.5,"caption":"A person. Not an algorithm."},
 {"name":"runner","kind":"runner","src":"runner.mp4","t0":"bar(16)","t1":"bar(21)","s0":0.0,"ts":"bar(19)"},
 {"name":"kicker","kind":"fig","src":"fig_kicker.mp4","t0":"bar(21)","t1":"bar(23)","s0":0.5},
 {"name":"ui_score","kind":"ui","src":"ui_score.mp4","t0":"bar(23)","t1":"bar(25)","s0":3.2,"caption":"One number that tells the truth."},
 {"name":"skipper","kind":"fig","src":"fig_skipper.mp4","t0":"bar(25)","t1":"bar(27)","s0":0.5},
 {"name":"montage","kind":"montage","t0":"bar(27)","t1":"bar(29)","slots":[["fig_riser.mp4",6.0],["fig_lifter.mp4",6.0],["fig_cook.mp4",6.0],["fig_coach.mp4",6.0],["runner.mp4",6.0],["fig_kicker.mp4",6.0],["fig_skipper.mp4",6.0],["fig_riser.mp4",7.0]]},
 {"name":"end","kind":"end","t0":"bar(29)","t1":"bar(31)"}
]
```

```bash
cd /home/user/film; t0=$(date +%s); say(){ echo "[$(( $(date +%s) - t0 ))s] $*"; }
PFX=https://d8j0ntlcm91z4.cloudfront.net/user_3E30hta4RMpS2cDML3JnB5dGPnY
for f in film.py plan.json beat.py meas_d1.py verifyF.py; do [ -s $f ] || { echo "FATAL missing $f"; exit 1; }; done
for pair in "riser ab46e09f-673e-4472-a786-9295c5252c57" "lifter 18f57dfd-3376-419b-b839-257387e17bed" "cook e5ae899a-8f7b-4334-8330-9ff42025a91c" "coach c739d3a7-3538-4748-a8f1-5bed0265097c" "kicker c420854d-efa3-441a-abc9-3abbb53181d5" "skipper a15ce573-8f24-4561-a059-eb80cf6726f3"; do set -- $pair; [ -s fig_$1.mp4 ] || curl -sfL -o fig_$1.mp4 $PFX/hf_20260909_181112_$2.mp4 & done
[ -s runner.mp4 ] || curl -sfL -o runner.mp4 $PFX/hf_20260909_175056_e7f33f15-d306-4e50-99e8-9a7612d7daca.mp4 &
[ -s d1.m4a ] || curl -sfL -o d1.m4a $PFX/hf_20260908_212940_35ca8b30-6459-46e7-8fa0-7b0196f6ac69.m4a &
[ -s logo.png ] || curl -sfL -o logo.png https://raw.githubusercontent.com/cperry8800-droid/shape-app/main/public/SHAPE-logo-teal-white.png &
[ -s Newsreader.ttf ] || curl -sfL -o Newsreader.ttf "https://raw.githubusercontent.com/google/fonts/main/ofl/newsreader/Newsreader%5Bopsz%2Cwght%5D.ttf" &
wait
[ -s tri.png ] || python3 -c "from PIL import Image;Image.open('logo.png').convert('RGBA').crop((1551,200,2169,990)).save('tri.png')"
ck(){ n=$1; m=$2; u=$3; f=ui_$n.mp4
  if [ -s /home/user/cap/seg/$n.mp4 ] && [ "$(md5sum /home/user/cap/seg/$n.mp4|cut -d' ' -f1)" = "$m" ]; then cp /home/user/cap/seg/$n.mp4 $f; echo "UI $n from the sandbox capture (md5 ok)"; return 0; fi
  curl -sfL -m 300 -o $f "$u" && [ "$(md5sum $f|cut -d' ' -f1)" = "$m" ] && { echo "UI $n fetched (md5 ok)"; return 0; }
  echo "FATAL UI $n unavailable"; exit 1; }
ck home_train 3cb18da045576648baad736fd3108d50 https://h.uguu.se/bbThttWb.mp4
ck session 2ee07376ad8db2b380062780953e7436 https://n.uguu.se/nNcSgNDc.mp4
ck menu 1b5fc19cb79c78172b98ff1721c965c7 https://n.uguu.se/iZNwTQZB.mp4
ck score 9ba53b79c7a0ee49434dc6d63185b75c https://n.uguu.se/ofgHyPAJ.mp4
md5sum fig_*.mp4 runner.mp4 d1.m4a logo.png tri.png Newsreader.ttf ui_*.mp4 film.py plan.json verifyF.py; say INPUTS-OK
python3 meas_d1.py; md5sum meas_d1.json; say GRID-OK
NOAUDIO=1 WINDOWS="0-20.0633" python3 film.py chunkA.mp4 > logA.txt 2>&1 &
NOAUDIO=1 WINDOWS="20.0633-40.0716" python3 film.py chunkB.mp4 > logB.txt 2>&1 &
NOAUDIO=1 WINDOWS="40.0716-61" python3 film.py chunkC.mp4 > logC.txt 2>&1 &
wait; tail -n 2 logA.txt logB.txt logC.txt; say CHUNKS-DONE
for c in A B C; do ffprobe -v error -select_streams v -count_frames -show_entries stream=nb_read_frames -of csv=p=0 chunk$c.mp4; done
printf "file 'chunkA.mp4'\nfile 'chunkB.mp4'\nfile 'chunkC.mp4'\n" > list.txt
ffmpeg -y -v error -f concat -safe 0 -i list.txt -i d1.m4a -map 0:v -map 1:a -af "atrim=0:60.083,afade=t=out:st=59.483:d=0.6" -c:v copy -c:a aac -b:a 192k -shortest film_v1.mp4
md5sum film_v1.mp4; ls -l film_v1.mp4; say RENDER-DONE
g=$(s=$(curl -s https://api.gofile.io/servers | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['servers'][0]['name'])"); curl -s -F "file=@film_v1.mp4" "https://$s.gofile.io/contents/uploadfile" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['downloadPage'])")
r=$(curl -s -m 300 -F reqtype=fileupload -F time=72h -F "fileToUpload=@film_v1.mp4" https://litterbox.catbox.moe/resources/internals/api.php); case "$r" in https://litter.catbox.moe/*) l=$r;; *) l=$(curl -s -m 300 -F "files[]=@film_v1.mp4" https://uguu.se/upload | python3 -c "import sys,json;print(json.load(sys.stdin)['files'][0]['url'])" 2>/dev/null);; esac
echo "UPLOAD film_v1.mp4 gofile=$g direct=$l"; say UPLOAD-DONE
python3 verifyF.py film_v1.mp4; say VERIFY-DONE
echo RUNFILM-DONE
```

```js
const {chromium}=require('playwright'); const fs=require('fs'); const path=require('path');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const INIT=()=>{const add=()=>{const h=document.documentElement;if(h){h.classList.add('is-native-app');return true;}return false;};if(!add()){new MutationObserver((m,o)=>{if(add())o.disconnect();}).observe(document,{childList:true,subtree:true});}};
const SEG="/home/user/cap/seg"; const VW=360,VH=640,DPR=3;
(async()=>{
 const b=await chromium.launch({args:['--no-sandbox'],executablePath:'/ms-playwright/chromium-1228/chrome-linux64/chrome'});
 const c=await b.newContext({viewport:{width:VW,height:VH},deviceScaleFactor:DPR,isMobile:true,hasTouch:true,userAgent:UA});
 await c.addInitScript(INIT); const p=await c.newPage(); const cdp=await c.newCDPSession(p); const log=(...a)=>console.log(...a);
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
 const scroll=async(dy,ms)=>p.evaluate(([dy,ms])=>new Promise(res=>{let els=[...document.querySelectorAll('.bs-scroll,[style*="overflow"]')].filter(e=>e.scrollHeight>e.clientHeight+20&&e.clientHeight>300);
  els.sort((a,b)=>b.clientWidth*b.clientHeight-a.clientWidth*a.clientHeight); const el=els[0]||document.scrollingElement; const from=el.scrollTop, t1=performance.now();
  const step=()=>{const k=Math.min(1,(performance.now()-t1)/ms); const e=k<.5?2*k*k:-1+(4-2*k)*k; el.scrollTop=from+dy*e; if(k<1)requestAnimationFrame(step); else res(Math.round(el.scrollTop));}; step();}),[dy,ms]).then(r=>{log('SCROLL',dy,'->',r);return r;});
 const tab=async(t)=>{await p.evaluate((t)=>document.querySelector('[data-tour="tab-'+t+'"]').click(),t);};
 const dismiss=()=>p.evaluate(()=>{const b=document.querySelector('button[aria-label="Dismiss"],[aria-label="Dismiss"]'); if(b)b.click(); return !!b;});
 const boot=async(tag)=>{await p.goto('https://theshapecommunity.com/m/',{waitUntil:'domcontentloaded',timeout:60000}); await sleep(5500);
  if(await go('^English')){await sleep(500); await go('^CONTINUE$'); await sleep(1500);} await go('Preview the app'); await sleep(2500); await go('Step inside'); await sleep(3500);
  await dismiss().then(r=>log('DISMISS',r)); await sleep(900); log('BOOT_DONE',tag);};
 const back=async()=>{await go('^← ?BACK|^BACK$|^Close|^✕|^CANCEL',0); await sleep(900);};
 const jdim=(b)=>{let i=2;while(i<b.length-9){if(b[i]!==0xFF){i++;continue;}const m=b[i+1];if(m>=0xC0&&m<=0xCF&&m!==0xC4&&m!==0xC8&&m!==0xCC)return [b.readUInt16BE(i+7),b.readUInt16BE(i+5)];const len=b.readUInt16BE(i+2);i+=2+len;}return [0,0];};
 let capMode='cdp'; let cur=null;
 const capFrame=async()=>{if(capMode==='cdp'){const r=await cdp.send('Page.captureScreenshot',{format:'jpeg',quality:88,optimizeForSpeed:true,clip:{x:0,y:0,width:VW,height:VH,scale:DPR}}); const buf=Buffer.from(r.data,'base64'); const [w,h]=jdim(buf); if(w===VW*DPR&&h===VH*DPR)return buf; log('CAPMODE cdp gave',w,h,'-> switching to pw'); capMode='pw';} return await p.screenshot({type:'jpeg',quality:88});};
 const startRec=(name)=>{const dir=path.join(SEG,name); fs.rmSync(dir,{recursive:true,force:true}); fs.mkdirSync(dir,{recursive:true}); const st={name,dir,n:0,ts:[],t0:Date.now(),on:true,acts:[]};
  st.done=(async()=>{while(st.on){const buf=await capFrame(); const t=Date.now()-st.t0; fs.writeFileSync(path.join(dir,`f${String(st.n).padStart(5,'0')}.jpg`),buf); st.ts.push(t); st.n++;}})(); cur=st; return st;};
 const stopRec=async(st)=>{st.on=false; await st.done; const total=Date.now()-st.t0; fs.writeFileSync(path.join(st.dir,'times.json'),JSON.stringify({ts:st.ts,total,acts:st.acts})); log('REC',st.name,'frames',st.n,'ms',total,'fps',(st.n/total*1000).toFixed(1),'acts',JSON.stringify(st.acts)); cur=null;};
 const rec=async(name,fn)=>{const st=startRec(name); try{await fn();}catch(e){log('SEGERR',name,String(e).slice(0,300));} await stopRec(st);};
 const act=async(label,fn)=>{const t=cur?Date.now()-cur.t0:-1; if(cur)cur.acts.push([label,t]); return fn();};
 // ---- A: home -> train ----
 await boot('A');
 await rec('home_train',async()=>{await sleep(1800); await act('tab',()=>tab('train')); await sleep(2400); await act('scroll',()=>scroll(500,3600)); await sleep(1000);});
 await rec('session',async()=>{await sleep(500); await act('tap',()=>go('^▶',0)); await sleep(3200); await act('scroll',()=>scroll(360,3200)); await sleep(800);});
 await rec('setlog',async()=>{await sleep(500); await act('tap',()=>go('Mark set 1|Log set 1|set 1 done|^✓$',0)); await sleep(3200);});
 // ---- C: eat ----
 await boot('C');
 await rec('menu',async()=>{await sleep(500); await act('tab',()=>tab('eat')); await sleep(2400); await act('scroll',()=>scroll(420,3600)); await sleep(1000);});
 await rec('meal',async()=>{await sleep(500); await act('tap',()=>go('Yogurt \\+ granola|Tuna, white bean',0)); await sleep(3200); await act('scroll',()=>scroll(450,3200)); await sleep(800);});
 // ---- E: me / score / habits ----
 await boot('E');
 await rec('profile',async()=>{await sleep(500); await act('tab',()=>tab('me')); await sleep(2200); await act('scroll',()=>scroll(560,3000)); await sleep(500); await scroll(-560,1200); await sleep(500); await act('climb',()=>go('^CLIMB$')); await sleep(3200);});
 await rec('score',async()=>{await sleep(500); await act('tap',()=>go('SHAPE SCORE|Shape Score',0)); await sleep(3200); await act('tier',()=>go('^THIS TIER')); await sleep(1800); await act('ladder',()=>go('^THE LADDER')); await sleep(1600); await act('scroll',()=>scroll(520,3200)); await sleep(800);}); await back();
 await rec('habits',async()=>{await sleep(400); await act('tab',()=>tab('home')); await sleep(1400); await act('tap',()=>go('^VIEW ALL')); await sleep(2800); await act('scroll',()=>scroll(320,2600)); await sleep(800);});
 await b.close(); log('TOURF DONE');
})().catch(e=>{console.log('TOUR ERR',String(e).slice(0,600));process.exit(1);});
```

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
    subprocess.run(['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',os.path.join(d,'list.txt'),'-vf','fps=24,scale=1440:2560,format=yuv420p','-c:v','libx264','-preset','fast','-crf','14',out])
    pr=subprocess.run(['ffprobe','-v','error','-select_streams','v','-count_frames','-show_entries','stream=nb_read_frames,width,height','-of','csv=p=0',out],capture_output=True,text=True).stdout.strip()
    print('SEG',n,'frames_in',len(ts),'total_ms',total,'->',pr,'acts',t.get('acts'))
print('SEGF-DONE')
```

```bash
cd /home/user; export NODE_PATH=/usr/local/lib/node_modules; t0=$(date +%s); say(){ echo "[$(( $(date +%s) - t0 ))s] $*"; }
rm -rf cap/seg; mkdir -p cap/seg; md5sum pw/tourF.js segF.py > cap2.log; node pw/tourF.js >> cap2.log 2>&1; say TOUR-DONE >> cap2.log
python3 segF.py >> cap2.log 2>&1
up(){ f=$1; m=$(md5sum "$f"|cut -d' ' -f1); u=""
  for h in litter uguu x0; do
    case $h in
      litter) r=$(curl -s -m 200 -F reqtype=fileupload -F time=72h -F "fileToUpload=@$f" https://litterbox.catbox.moe/resources/internals/api.php); case "$r" in https://litter.catbox.moe/*) u=$r;; esac;;
      uguu) r=$(curl -s -m 200 -F "files[]=@$f" https://uguu.se/upload | python3 -c "import sys,json;print(json.load(sys.stdin)['files'][0]['url'])" 2>/dev/null); case "$r" in https://*uguu.se/*) u=$r;; esac;;
      x0) r=$(curl -s -m 200 -F "file=@$f" https://0x0.st); case "$r" in https://0x0.st/*) u=$r;; esac;;
    esac
    [ -n "$u" ] && break
  done
  echo "CKPT $(basename $f .mp4) $m ${u:-NONE} $(stat -c%s "$f")"; }
for f in cap/seg/*.mp4; do up "$f" >> cap2.log; done
say CAP2-ALL-DONE >> cap2.log
```

```python
import json,math,subprocess,numpy as np,beat,sys
m=json.load(open('meas_d1.json')); BPM=m['bpm'];PH=m['phase'];P=60.0/BPM; KB=m['kick_by_beat']
def beatt(n): return PH+n*P
def bar(b): return beatt(4*(b-1))
F=sys.argv[1] if len(sys.argv)>1 else 'film_v1.mp4'; W,H=1440,2560
def frame(t):
    o=subprocess.run(['ffmpeg','-v','error','-ss',f'{t:.4f}','-i',F,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True).stdout
    return np.frombuffer(o,np.uint8).reshape(H,W,3).astype(int)
def teal(f): return int(((abs(f[...,0]-0x34)<40)&(abs(f[...,1]-0xd6)<40)&(abs(f[...,2]-0xc5)<40)).sum())
def cream(f): return int(((f[...,0]>200)&(f[...,1]>190)&(f[...,2]>170)).sum())
pr=subprocess.run(['ffprobe','-v','error','-select_streams','v','-count_frames','-show_entries','stream=nb_read_frames,r_frame_rate,width,height:format=duration','-of','json',F],capture_output=True,text=True).stdout
print('probe',' '.join(pr.split()))
ok=0; bad=0
def chk(name,cond,detail):
    global ok,bad; ok+=cond; bad+=(not cond); print(('PASS' if cond else 'FAIL'),name,detail)
# 1 page turns at every page start: the frame 0.35 s after the start differs from the one 0.15 s before it far more than two frames inside the page do
starts={'ui_train':bar(3),'lifter':bar(5),'ui_session':bar(7),'cook':bar(9),'ui_menu':bar(11),'coach':bar(13),'runner':bar(16),'kicker':bar(21),'ui_score':bar(23),'skipper':bar(25),'montage':bar(27),'end':bar(29)}
for nm,T in starts.items():
    a=frame(T-0.15); b=frame(T+0.30); c=frame(T+0.40)
    d1=float(np.abs(a-b).mean()); d2=float(np.abs(b-c).mean()); chk(f'turn {nm}',d1>2*d2+2,f'across {d1:.1f} within {d2:.1f}')
# 2 the mark glows on the kick on a black page (bar 5, the lifter) and the cream page (bar 17, the runner: the kick is thinning; use bar 16 beat 60)
for nm,nb,crop in (('lifter beat 16',16+0,(slice(20,200),slice(80,240))),('cook beat 32',32,(slice(20,200),slice(80,240)))):
    fb=frame(beatt(nb)+1/24)[crop]; fm=frame(beatt(nb)+P/2)[crop]; chk(f'mark on kick {nm}',teal(fb)>teal(fm)*1.02,f'on {teal(fb)} mid {teal(fm)} kb {KB[nb]}')
# 3 the mark is still where nothing is playing (beat 70, inside the breakdown, the runner page: cream placement crop)
fb=frame(beatt(70)+1/24)[140:300,90:220]; fm=frame(beatt(70)+P/2)[140:300,90:220]; chk('mark still in the breakdown',abs(teal(fb)-teal(fm))<=max(60,0.03*teal(fb)),f'on {teal(fb)} mid {teal(fm)} kb {KB[70]}')
# 4 IN SYNC at the lock (bar 19)
TS=bar(19); band=lambda f:f[150:262,540:1140]; chk('IN SYNC lands on bar 19',teal(band(frame(TS+0.4)))>3000 and teal(band(frame(TS-0.3)))<800,f'post {teal(band(frame(TS+0.4)))} pre {teal(band(frame(TS-0.3)))} TS {TS:.3f}')
# 5 captions lit mid-page, absent at the page start
for nm,T0,T1 in (('ui_train',bar(3),bar(5)),('coach',bar(13),bar(16)),('ui_score',bar(23),bar(25))):
    c0=cream(frame(T0+0.05)[2060:2180]); c1=cream(frame((T0+T1)/2)[2060:2180]); chk(f'caption {nm}',c1>c0+1500,f'start {c0} mid {c1}')
# 6 the end card: wordmark and fee line in the last second
f=frame(bar(31)-0.3); wm=int((f[1180:1400].min(-1)>200).sum()); fee=teal(f[1550:1700]); chk('end card',wm>8000 and fee>600,f'wordmark white px {wm} fee-line teal {fee}')
# 7 the montage cuts on beats: consecutive slots differ
a=frame(bar(27)+0.25); b=frame(bar(27)+P+0.25); chk('montage cut',float(np.abs(a-b).mean())>3,f'diff {float(np.abs(a-b).mean()):.1f}')
# 8 audio: the rendered track re-measures on the grid
subprocess.run(['ffmpeg','-y','-v','error','-i',F,'-vn','-c:a','copy','film_audio.m4a']); x=beat.decode('film_audio.m4a'); o=beat.onset(beat.energy(beat.bandpass(x,40,120))); g=beat.grid(o,110.0,150.0)
chk('audio grid',abs(g['bpm']-BPM)<0.3,f"{g} dur {len(x)/beat.SR:.3f}")
print('RESULT',ok,'PASS',bad,'FAIL'); print('VERIFYF-DONE')
```

## The film, v2 — two looks, activities only, the globe close (2026-09-09)

Owner, on v1: *"the wording at bottom of video gets lost in background, hard to see. also the person is getting cut off in the
middle of video. there is a weird line thats cuts the down middle of screen. remove the fighting/karate scene. There is none
of those activities on shape. dont include full pictures of the app, that is going to be in a separate ad video. This is all
acting out of various activities how shape helps and improves somones health and fitness. also dont forget a clip on shape
radio. need someone choosing to listen during a workout, also need to end with the globe clip that we generated. I want a
version in the highliter and print look."* Eight notes; v2 answers each, and is rendered **twice from one plan** — the
highlighter look on the black page and the halftone print on cream — on the same 119.95 grid, 1440×2560 · 24 fps · 30 bars.

| The note | What v2 does |
|---|---|
| the wording gets lost | every caption sits in a **band** across the page (rows 2000–2180, a translucent cream band with ink type on the print look, an ink band with cream type on the black look; 82-px Newsreader); the two end lines ride the same band over the globe |
| the person is cut off | v1 turned the page with a **wipe** on every downbeat, and a wipe slices whatever figure is mid-page; v2's seams are **8-frame crossfades** — no figure is ever cut |
| the line down the middle | the **column rules**: v1's pages drew the broadsheet's rules and the clips carried their own; v2's pages carry only the masthead rule and the ticker, the pass strikes any hairline rule a clip draws (a group of ≤ 8 dark columns — see the defect below), and the runner's own rules are painted out on the print look (`strike_clip_rules`) |
| no fighting | the kicker is gone (Sources row 12 superseded; not on a page, not in the montage) |
| no pictures of the app | no capture appears; the eight v1 segments stay checkpointed for the separate ad. Every page is a person doing something |
| a Shape Radio clip | bars 14–15: a woman putting her earbuds in and tapping her watch, under **▸ Shape Radio.** (row 15 — the one take; see the bust note) |
| end with the globe | bars 25–30 (12 s): the Americas globe (the launch cut's Scene D, job `135d629d`), its first 4.5 s — the night side before the baked-in sunrise — stretched ×2.6667 to cover the page, the mark with its glow flash, the wordmark, the teal rule and the two end lines from 4.0 s in |
| the two looks | `LOOK=hl` and `LOOK=print`: the same masks, the same ribbon, the same bar; teal strokes with glow on black, or ink halftone (16-px cells) on cream; the runner's approved clip is the print itself on cream and is hollowed on black (its teal carried as light); the globe page is the same on both |

**The pages** (`plan2.json`; `bar(b)` = the bar-b downbeat; every page starts on a downbeat and crossfades in over 8 frames):

| Bars | Page | Source · offset | Caption |
|---|---|---|---|
| 1–2 | the riser — walks in and breaks into a dance | `fig_riser.mp4` · 1.5 s | — |
| 3–4 | the lifter — kettlebell swings | `fig_lifter.mp4` · 0.5 s | *Written before you arrive.* |
| 5–6 | the cook — the pan tossed, vegetables in the air | `fig_cook.mp4` · 0.5 s | *Every meal, planned.* |
| 7–8 | the yoga flow — lunge to warrior and back | `fig_yoga.mp4` · 0.5 s | *Small things, daily.* |
| 9–10 | the cyclist — out of the saddle and back | `fig_cyclist.mp4` · 0.5 s | *One number that tells the truth.* |
| 11–13 | the coach — on her stool, one foot tapping, on the thinning kick | `fig_coach.mp4` · 0.5 s | *A person. Not an algorithm.* |
| 14–15 | Shape Radio — the earbuds in, the watch tapped, the nod | `fig_radio.mp4` · 0.5 s | **▸** *Shape Radio.* |
| 16–20 | **the runner** — the approved watch clip, the HRM / BPM bar, IN SYNC on the bar-19 downbeat inside the breakdown | `runner.mp4` · 0.0 s | (the bar) |
| 21–22 | the skipper — one jump per beat, landing on the kick's return | `fig_skipper.mp4` · 0.5 s | — |
| 23–24 | the montage — riser · lifter · cook · yoga · cyclist · coach · radio · runner, one per beat | each at 6.0 s in | — |
| 25–30 | **the globe** — the Americas at night, the lockup from 4.0 s, *Different goals. One Community.* · ONE PLATFORM FEE · $5 /MO · CANCEL ANY TIME from 6.0 s; the track fades under it | `globe_slow.mp4` · 0.0 s | (the end lines) |

Three new figures (rows 14–16): the yoga flow, the cyclist and the radio chooser, one take each. The cyclist's first submission
created **no job** — the tool answered with a preset recommendation instead ("DROWN IN MUSIC"), the trap the orb record warns
about — and was resubmitted with that preset declined. Gated the same way as v1's six (mask area, boil, white objects) and
looked at on a 1-bit mask sheet: the yoga figure clean at 8.5–9.2 % of the page, the cyclist and his bike one shape at 12.6–13 %,
and **the radio take a bust** — head and shoulders filling 43–46 % of the page, the model's grey pseudo-text behind her.

⚠ **The radio take is a bust, and it stays, because the account has no credits.** A second take was drafted — full-length, small in
the middle of a plain cream page — and submitted twice: the first submission was intercepted by the "IN THE DARK" preset and
created no job; the second, with the preset declined, was refused: *"Out of credits on plus (monthly) plan in Private
workspace."* **Nothing was billed; there is no second take.** So the pass carries the bust instead: the figure is taken at
luma < 40 (the pseudo-text is grey at ~150, the figure black), and dissolved over the 260 px above the ticker so it does not
end on a straight cut (`OPTS` in `film2.py`, keyed by the clip's file name — the montage's slot inherits it). Whether the page
is re-shot when credits return is the owner's (§10 q10).

⚠ **A defect the synthetic test caught before a lease was spent: the column-rule detector struck any column that was more than
35 % dark, which hollows a wide figure into stripes.** v1's figures were thin (3–14 % of the page) and never tripped it; a bust
does — every column through the torso is 80 % dark. Rendering the radio page on a synthetic bust (a black head-and-shoulders on
cream with grey text-rows behind it) produced **an empty page**: no figure at all. The detector now groups the dark columns and
strikes only groups at most 8 px wide — the same rule `RuleFinder` has always used — so a hairline goes and a torso stays.
*A property that held on every input so far is a property of those inputs.*

⚠ **And the first render's contact sheet showed a rule the grouped strike had spared — on the cook's page, the note's own
"line down the middle".** The cook's clip (row 10, a block-A prompt that still asked for column rules) draws a 4-px rule at
x 389 beside his counter; over the page's height the counter's columns are as dark as the rule, so the two merge into one
344-column group and the width test keeps it. Measured on every clip at 0.5 s: the rules are 2–4 px groups dark through more
than 80 % of the **top zone** (rows 250–700), where no figure reaches; the strike now takes those as well (≤ 12 px through the
top zone, alongside ≤ 8 px over the full height), and the four chunks the cook touches — the A chunks and the montage's C
chunks, both looks — were re-rendered from the checkpointed B chunks (`rerender.sh`). The first render of the plan (`film2.py`
`ca56d1ba702c46b9d4f2ec1d5ea996e6`; hl md5 `6e3e92257aff387acd78c4e70024cedd` · 29,955,784 B, print `ba704b018b118f2e9303d910a1d18b6f`
· 43,438,109 B; verifier 22 / 24 and 24 / 24 on the corrected instrument, the two hl failures the cook's and the runner's
seams read against pages whose own motion exceeds the seam) is superseded by it. *A sheet is looked at for what the numbers
did not ask.*

⚠ **The sandbox replaces its instance between calls now, so the scripts live in the repo.** Files staged in one call were gone
at the next (a fresh instance, `/proc/uptime` under 20 s), and `film2.py` is bigger than the 16 KB a single command may carry.
The six producers are therefore committed as files under [`marketing/film-v2/`](film-v2/) and the launch is one line that fetches
them from `raw.githubusercontent.com` on this branch — a fetch survives an instance the way a heredoc cannot. The launch-cut recipe's
`boot5.sh` fetches its recipe the same way; this is the same route with the scripts as files rather than fenced blocks.

⚠ **The first render lease ran six chunks at once and the kernel killed three of its encoders.** The sandbox has 8 cores and
8 GB; each x264 encoder at 1440×2560 holds ~1.1 GB and each assembly process ~0.9 GB, so six pairs do not fit — `dmesg`
recorded `Out of memory: Killed process (ffmpeg)` for the two A chunks and one C chunk, and each assembly died on the broken pipe
behind it. The three survivors finished; `runFix.sh` (below) waited for them, checkpointed each finished chunk to a 72-hour host,
re-rendered the three that died — **three at a time, the ceiling v1 measured on three cores** — checkpointed those, then
concatenated, muxed, uploaded and verified. The run script's own chunk loop now runs one look at a time (`LOOKS`).

**The render.**

| Output | md5 | bytes | frames · s | measured |
|---|---|---|---|---|
| **`film_v2_hl.mp4`** (the highlighter look) | `028d179f96bbbde886e1809d92e6dde1` | 29,913,947 | 1,442 · 60.084 | chunks A/B/C 482 / 480 / 480 frames; the rendered audio re-measures 119.95 · P 0.500208 · φ 0.055 over 60.024 s; verifier **23 / 24** (the one failure the instrument, below) |
| **`film_v2_print.mp4`** (the print look) | `95d1284144328a17a92ac7a3154e476e` | 43,471,315 | 1,442 · 60.084 | chunks 482 / 480 / 480; the rendered audio the same 119.95 grid; verifier **24 / 24** |

The first lease (`runFilm2.sh`) launched six chunks at once and lost three to the OOM killer; `runFix.sh` finished that plan in
551 s (the survivors 156 s in, the three re-rendered by 446 s, mux and uploads by 487 s, verify by 551 s). The re-render after the
top-zone rule fix (`rerender.sh`: the four touched chunks three at a time from the checkpointed B chunks, on 8 cores / 8 GB) ran
chunks 287 s, mux and uploads by 341 s, the sheets by 348 s, verify by 409 s. The 72-hour host answered 500 to the four re-rendered
chunks' checkpoints and to the films at first; a retry an hour later took both films, and 0x0.st has switched uploads off ("AI
botnet spam"). Handed over as links (gofile, and the 72-hour direct links); review copies are never committed.

**Verified on the renders** (`verifyF2.py`): **hl 23 PASS / 1 FAIL · print 24 PASS / 0 FAIL — the one failure is the instrument: the seam into the runner's page is read against
the runner's own motion (the sprint moves 10.4 luma levels per frame on the black look) and the check demands the seam exceed twice
that; the seam itself reads 14.4, in line with the other pages' 6–23.** On both renders every other seam reads as a page change,
the mark is brighter on the kick than mid-beat on three pages and still in the breakdown, IN SYNC lands on the bar-19 downbeat,
the caption bands are lit mid-page and absent after the crossfade, the play glyph is drawn, no column rule stands on the lifter's
or the coach's page, the globe close carries the wordmark and the two lines, the montage cuts on the beat, and the rendered audio
re-measures at 119.95.

```
probe 1440×2560 · 24/1 · nb_read_frames 1442 · duration 60.084
PASS seam lifter across 6.4 within 1.8
PASS seam cook across 11.1 within 4.4
PASS seam yoga across 10.5 within 0.7
PASS seam cyclist across 12.8 within 2.1
PASS seam coach across 11.6 within 1.9
PASS seam radio across 11.8 within 2.0
FAIL seam runner across 14.4 within 10.4
PASS seam skipper across 14.6 within 3.7
PASS seam montage across 8.1 within 2.4
PASS seam globe across 23.4 within 0.4
PASS mark on kick lifter beat 12 on 3209 mid 3011 kb 0.773
PASS mark on kick cook beat 20 on 3215 mid 3014 kb 0.802
PASS mark on kick skipper beat 84 on 3251 mid 3032 kb 0.594
PASS mark still in the breakdown on 2943 mid 2943 kb 0.001
PASS IN SYNC lands on bar 19 post 6678 pre 339 TS 36.070
PASS caption band lifter start 0 mid 14254
PASS caption band coach start 0 mid 15540
PASS caption band radio start 0 mid 8290
PASS radio play glyph teal in the glyph box 1163
PASS no column rule lifter line px 0
PASS no column rule coach line px 0
PASS globe close wordmark white px 11909 band text px 19537 mean luma 27.6
PASS montage cut diff 6.2
PASS audio grid {'bpm': 119.95, 'P': 0.500208, 'phase': 0.055, 'score': 0.3855} dur 60.024
RESULT hl 23 PASS 1 FAIL
```

```
probe 1440×2560 · 24/1 · nb_read_frames 1442 · duration 60.084
PASS seam lifter across 17.4 within 1.8
PASS seam cook across 36.6 within 7.4
PASS seam yoga across 29.5 within 0.5
PASS seam cyclist across 24.5 within 1.6
PASS seam coach across 29.6 within 1.4
PASS seam radio across 49.0 within 2.2
PASS seam runner across 73.2 within 21.0
PASS seam skipper across 62.7 within 2.2
PASS seam montage across 18.3 within 2.2
PASS seam globe across 157.3 within 0.4
PASS mark on kick lifter beat 12 on 2516 mid 2362 kb 0.773
PASS mark on kick cook beat 20 on 2514 mid 2358 kb 0.802
PASS mark on kick skipper beat 84 on 2512 mid 2364 kb 0.594
PASS mark still in the breakdown on 2304 mid 2315 kb 0.001
PASS IN SYNC lands on bar 19 post 6624 pre 338 TS 36.070
PASS caption band lifter start 3049 mid 14348
PASS caption band coach start 0 mid 15633
PASS caption band radio start 0 mid 8358
PASS radio play glyph teal in the glyph box 1163
PASS no column rule lifter line px 0
PASS no column rule coach line px 0
PASS globe close wordmark white px 11862 band text px 293096 mean luma 27.6
PASS montage cut diff 17.9
PASS audio grid {'bpm': 119.95, 'P': 0.500208, 'phase': 0.055, 'score': 0.3855} dur 60.024
RESULT print 24 PASS 0 FAIL
```

**Looked at, one frame per page, both looks** (a checksummed 8-level contact sheet each, 30–31 lines): the riser; the lifter with
his line; the cook with the pan and the vegetables in the air — and no rule beside him now, where the first render's sheet showed
one; the yoga flow in warrior; the cyclist out of the saddle; the coach on her stool; the radio chooser's head and shoulders with
both hands at her ears, dissolving into the band under ▸ *Shape Radio.*; the runner with the bar reading IN SYNC (the print itself on
cream, a teal outline on black); the skipper; the cook again in the montage; and the Americas at night under the mark, SHAPE and
the two lines. ⚠ Not watched by the agent beyond those eleven frames per look; the owner's look is the QA.

**The scripts** — files in [`marketing/film-v2/`](film-v2/), fetched by each lease from this branch; md5s as they ran: `film2.py`
`8880aa8f23af39dd0067ded3f9b13a5b` (the assembly: `LOOK`, the figure masks with the grouped rule strike over the full height and
through the top zone, the per-clip `OPTS`, the halftone and the highlighter stroke, the ribbon, the bar, the bands, the globe
lockup, the crossfade seams, `WINDOWS` chunking; the first render's copy `ca56d1ba…` lacked the top-zone rule) · `plan2.json`
`0c7f0933a12119dca1c6a3604cad117e` · `runFilm2.sh` `54559d5ace266000953723a1548f9e01` (inputs, the globe stretch, the grid, the chunks three at a time, the mux, the
uploads, the verify; `STAGE=prep` stops after the grid, `LOOKS` picks the looks — the copy that ran the first lease,
`081649f3fd071641a70cc85b90b3b82d`, launched all six chunks at once) · `runFix.sh` `d66f67a78643ae4aedbffab93a91c130` (the recovery
lease) · `rerender.sh` `c599078b40c163d08ae99e41c9cc54f3` (the re-render lease: the touched chunks from the checkpointed ones, three
at a time, then mux, upload, sheets, verify) · `verifyF2.py` `fc72f3585b4545d8893cf74b9ab7a55d` (the instrument as corrected: a
crossfade seam read as the page before it against the page after it over one frame of its own motion, both samples inside the
montage's first slot; the caption's "start" sampled after the crossfade in the glyph rows; the play glyph looked for where it is
drawn — the copy that ran on the first render, `45796f26…`, sampled the montage's seam across its first cut and the caption
inside the crossfade) · `meas_d1.py` `e7560987139aeb03854df3c8a9311aca` · `beat.py` `63b18de45fe6eb1e446043583cc7c19e` (the
launch-cut recipe's copy; the style pair's sandbox copy was `ccd2568c…` and is in no record, so the recipe's is the one that runs).
`meas_d1.json`
as measured in the lease: `66671eee4dae6b0283715147fecb144b` — 119.95 · P 0.500208 · φ 0.055 · halves 120.0 / 120.0, kick gaps at
beats 61–79 and 112–118, the same values as every run before it.

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
| E4 | Edit of frame 8 · the phone removed, a fitness watch on the wrist, rounded-square teal face (TAKEN) — 2026-09-09 | `cbff7e80-12b6-47e6-9d63-b3cbef3a77ee` | `hf_20260909_174907_cbff7e80-12b6-47e6-9d63-b3cbef3a77ee.png` · md5 `00387339f7096cd15aa58f9916c8c5f4` · 3,806,506 B | *Same image, identical in every way, except two things. First, the white smartphone is gone: she is empty-handed, that hand drawn as a running hand in the same coarse halftone dots as the rest of her body, with the cream newsprint page showing where the phone was. Second, she wears a slim fitness watch on that wrist: a small rounded-square watch face with a thin black band, drawn crisp and unscreened, its face a plain flat teal, hex 34D6C5, the only sharp object on the page. The single ribbon of teal light now trails from the watch around her body instead of from a phone. Nothing else in the picture changes.\n\nresolution: 2k* |
| E5 | Edit of frame 8 · the phone removed, a round-faced sports watch — 2026-09-09 | `d08f90f1-e7b7-4822-a6b5-c52f6f30885b` | `hf_20260909_174907_d08f90f1-e7b7-4822-a6b5-c52f6f30885b.png` · md5 `de54eec3cf5e235d769338b8aad6fe57` · 3,784,461 B | *Edit this image and change nothing except the runner's hand and wrist. Remove the white smartphone completely; where it was, draw her hand open and empty in the same coarse halftone dots as the rest of her body, with the cream page behind it. Put a fitness watch on that wrist: a small sports watch with a round face, plain and flat and glowing teal, hex 34D6C5, on a thin black strap, drawn crisp and sharp, the only unscreened object on the page. The single ribbon of teal light now streams out of the watch face and around her body. The cream newsprint page, the masthead rule, the column blocks, the ticker strip and the halftone runner stay exactly as they are.\n\nresolution: 2k* |
| 7 | Image-to-video of E4 — 2026-09-09 (same params as 5: `minimax_h3` · 9:16 · 10 s · 2K · `use_unlim false` · `declined_preset_id 24bae836-…` · `medias` role `image` → `image_references cbff7e80…`). E4 and E5 were submitted as `nano_banana_pro` (9:16 · `resolution 2k` · `use_unlim false` · `image_references bcfea348…`) and the gallery records them served as `nano_banana_2` | `e7f33f15-d306-4e50-99e8-9a7612d7daca` | `hf_20260909_175056_e7f33f15-d306-4e50-99e8-9a7612d7daca.mp4` · md5 `32bee6015d5438b05941931dfc388870` · 12,888,949 B · 243 frames / 10.125 s | *Animate this exact frame without changing its style: a flat 2D editorial newspaper animation. The page of cream newsprint, the masthead rule, the grey column blocks and the ticker strip stay perfectly still; the halftone dots stay locked to the page and do not shimmer. The runner sprints in place in full stride, knees driving high, arms pumping, ponytail streaming, her limbs streaking with motion, her hands open and empty, and the ribbon of teal light flows out of the fitness watch on her wrist and around her body in a continuous wave. The watch stays on her wrist in every frame, its teal face visible as her arm swings. Locked-off camera, no camera movement, no zoom. No new text, no logos.* |
| 8 | The riser · block A, one take (`minimax_h3` · 9:16 · 10 s · 2K · `use_unlim false` · `declined_preset_id 24bae836-…`) — 2026-09-09 18:11 UTC | `ab46e09f-673e-4472-a786-9295c5252c57` | `hf_20260909_181112_ab46e09f-673e-4472-a786-9295c5252c57.mp4` · md5 `7dfd16ee6de3ce54ef4fc1f091f06d45` · 2,450,261 B · 243 frames | *Vertical 9:16. A flat 2D animation in an editorial newspaper style unique to a brand called Shape. The whole frame is a static page of cream newsprint that never moves: a bold double hairline rule across the top like a masthead, thin vertical column rules with empty grey blocks and no letters, and a black ticker strip along the bottom with a teal left border, hex 34D6C5. One jet-black figure, a woman with her hair flying, walking in from the left edge and breaking into a dance in the middle of the page, pure black with hard clean edges and no interior detail, no face. Locked-off camera, no camera movement. No readable text, no logos, no phone.* |
| 9 | The lifter · block A, one take (`minimax_h3` · 9:16 · 10 s · 2K · `use_unlim false` · `declined_preset_id 24bae836-…`) — 2026-09-09 18:11 UTC | `18f57dfd-3376-419b-b839-257387e17bed` | `hf_20260909_181112_18f57dfd-3376-419b-b839-257387e17bed.mp4` · md5 `08ee71d5d451f6147d9be8de9a8b9b7b` · 1,966,409 B · 243 frames | *Vertical 9:16. A flat 2D animation in an editorial newspaper style unique to a brand called Shape. The whole frame is a static page of cream newsprint that never moves: a bold double hairline rule across the top like a masthead, thin vertical column rules with empty grey blocks and no letters, and a black ticker strip along the bottom with a teal left border, hex 34D6C5. One jet-black figure, a broad-shouldered man, swinging a kettlebell from between his legs up to eye level and back in steady rhythmic swings in the middle of the page, pure black with hard clean edges and no interior detail, no face. Locked-off camera, no camera movement. No readable text, no logos, no phone.* |
| 10 | The cook · block A, one take (`minimax_h3` · 9:16 · 10 s · 2K · `use_unlim false` · `declined_preset_id 24bae836-…`) — 2026-09-09 18:11 UTC | `e5ae899a-8f7b-4334-8330-9ff42025a91c` | `hf_20260909_181112_e5ae899a-8f7b-4334-8330-9ff42025a91c.mp4` · md5 `a0f4cd45e3d9bd943284ce3d13c740f7` · 2,136,292 B · 243 frames | *Vertical 9:16. A flat 2D animation in an editorial newspaper style unique to a brand called Shape. The whole frame is a static page of cream newsprint that never moves: a bold double hairline rule across the top like a masthead, thin vertical column rules with empty grey blocks and no letters, and a black ticker strip along the bottom with a teal left border, hex 34D6C5. One jet-black figure, a cook in an apron, tossing a frying pan so chopped vegetables hang in the air as black shapes, then catching them, again and again in the middle of the page, pure black with hard clean edges and no interior detail, no face. Locked-off camera, no camera movement. No readable text, no logos, no phone.* |
| 11 | The coach · block A, one take (`minimax_h3` · 9:16 · 10 s · 2K · `use_unlim false` · `declined_preset_id 24bae836-…`) — 2026-09-09 18:11 UTC | `c739d3a7-3538-4748-a8f1-5bed0265097c` | `hf_20260909_181112_c739d3a7-3538-4748-a8f1-5bed0265097c.mp4` · md5 `76fc4cc0b70c260b561c3a18bb8f844f` · 2,629,840 B · 243 frames | *Vertical 9:16. A flat 2D animation in an editorial newspaper style unique to a brand called Shape. The whole frame is a static page of cream newsprint that never moves: a bold double hairline rule across the top like a masthead, thin vertical column rules with empty grey blocks and no letters, and a black ticker strip along the bottom with a teal left border, hex 34D6C5. One jet-black figure, a woman seated on a stool, one foot tapping hard and her head nodding to a beat in the middle of the page, pure black with hard clean edges and no interior detail, no face. Locked-off camera, no camera movement. No readable text, no logos, no phone.* |
| 12 | The kicker · block A, one take — ⚠ **not in v2** (owner: *"remove the fighting/karate scene. There is none of those activities on shape"*); generated, kept, unused (`minimax_h3` · 9:16 · 10 s · 2K · `use_unlim false` · `declined_preset_id 24bae836-…`) — 2026-09-09 18:11 UTC | `c420854d-efa3-441a-abc9-3abbb53181d5` | `hf_20260909_181112_c420854d-efa3-441a-abc9-3abbb53181d5.mp4` · md5 `4af5670e12cb9612652dfd5ed4c39281` · 3,901,873 B · 243 frames | *Vertical 9:16. A flat 2D animation in an editorial newspaper style unique to a brand called Shape. The whole frame is a static page of cream newsprint that never moves: a bold double hairline rule across the top like a masthead, thin vertical column rules with empty grey blocks and no letters, and a black ticker strip along the bottom with a teal left border, hex 34D6C5. One jet-black figure, a woman with long braids, throwing high roundhouse kicks one after another, her braids whipping in the middle of the page, pure black with hard clean edges and no interior detail, no face. Locked-off camera, no camera movement. No readable text, no logos, no phone.* |
| 13 | The skipper · block A, one take (`minimax_h3` · 9:16 · 10 s · 2K · `use_unlim false` · `declined_preset_id 24bae836-…`) — 2026-09-09 18:11 UTC | `a15ce573-8f24-4561-a059-eb80cf6726f3` | `hf_20260909_181112_a15ce573-8f24-4561-a059-eb80cf6726f3.mp4` · md5 `6a4a9d3dc7dfe99f5ae38d4d19f2a2f9` · 1,814,902 B · 243 frames | *Vertical 9:16. A flat 2D animation in an editorial newspaper style unique to a brand called Shape. The whole frame is a static page of cream newsprint that never moves: a bold double hairline rule across the top like a masthead, thin vertical column rules with empty grey blocks and no letters, and a black ticker strip along the bottom with a teal left border, hex 34D6C5. One jet-black figure, a man jumping rope in steady rhythmic jumps, the rope a thin black arc over his head in the middle of the page, pure black with hard clean edges and no interior detail, no face. Locked-off camera, no camera movement. No readable text, no logos, no phone.* |
| 14 | The yoga flow · block A, one take (`minimax_h3` · 9:16 · 10 s · 2K · `use_unlim false` · `declined_preset_id 24bae836-…`) — 2026-09-09 19:20 UTC | `e2269340-1db6-40b9-a10c-3c2ae91d25a3` | `hf_20260909_192019_e2269340-1db6-40b9-a10c-3c2ae91d25a3.mp4` · md5 `8e2f09052d5cac5a577bc68689a242c3` · 1,795,607 B | *Vertical 9:16. A flat 2D animation in an editorial newspaper style unique to a brand called Shape. The whole frame is a static page of cream newsprint that never moves: a bold double hairline rule across the top like a masthead, and a black ticker strip along the bottom with a teal left border, hex 34D6C5. One jet-black figure, a woman in a yoga flow, moving from a deep lunge into a warrior pose and back, her arms sweeping up overhead and down, slow and continuous, in the middle of the page, pure black with hard clean edges and no interior detail, no face. Locked-off camera, no camera movement. No readable text, no logos, no phone.* |
| 15 | The radio chooser · block A, one take (same params) — 2026-09-09 19:20 UTC. ⚠ A bust: head and shoulders fill 43–46 % of the page with the model's grey pseudo-text behind her; used as it is, at luma < 40 with the bottom dissolved (see "The film, v2") | `0a0efbdd-f348-4cec-98f0-e207f2d9a938` | `hf_20260909_192018_0a0efbdd-f348-4cec-98f0-e207f2d9a938.mp4` · md5 `0fba566e850893a61117ff3b5d8fb6eb` · 2,823,200 B | *Vertical 9:16. A flat 2D animation in an editorial newspaper style unique to a brand called Shape. The whole frame is a static page of cream newsprint that never moves: a bold double hairline rule across the top like a masthead, and a black ticker strip along the bottom with a teal left border, hex 34D6C5. One jet-black figure, a woman standing at the start of a workout, putting a small wireless earbud into one ear and then the other, then tapping the fitness watch on her wrist and starting to nod and bounce to a beat, in the middle of the page, pure black with hard clean edges and no interior detail, no face. Locked-off camera, no camera movement. No readable text, no logos, no phone.* |
| 16 | The cyclist · block A, one take (same params, but `declined_preset_id f1821f84-945b-4cd1-9085-1f479db0028e` — the first submission created no job: the tool recommended the "DROWN IN MUSIC" preset instead) — 2026-09-09 19:21 UTC | `de795141-1050-440a-9f60-25aee30c685c` | `hf_20260909_192131_de795141-1050-440a-9f60-25aee30c685c.mp4` · md5 `822950fd0acb716742b9e5baacbf9d64` · 2,048,105 B | *Vertical 9:16. A flat 2D animation in an editorial newspaper style unique to a brand called Shape. The whole frame is a static page of cream newsprint that never moves: a bold double hairline rule across the top like a masthead, and a black ticker strip along the bottom with a teal left border, hex 34D6C5. One jet-black figure, a man on a stationary exercise bike seen side-on, pedalling hard, rising out of the saddle and sitting back down, in the middle of the page, the bike and the man one pure black shape with hard clean edges and no interior detail, no face. Locked-off camera, no camera movement. No readable text, no logos, no phone.* |
| — | A second radio take, full-length on a plain page — **NOT GENERATED, nothing billed.** Submitted 2026-09-09 19:43 UTC: the first submission was intercepted by the "IN THE DARK" preset (no job); the resubmission with `declined_preset_id 24bae836-…` was refused — *"Out of credits on plus (monthly) plan in Private workspace."* | — | — | *Vertical 9:16. A flat 2D animation in an editorial newspaper style unique to a brand called Shape. The whole frame is a static page of cream newsprint that never moves: a bold double hairline rule across the top like a masthead, and a black ticker strip along the bottom with a teal left border, hex 34D6C5. One jet-black figure, a woman standing at the start of a workout, seen full-length from head to toe and from a distance so the whole figure is small in the middle of the page with plain cream space all around her, putting a small wireless earbud into one ear and then the other, then tapping the fitness watch on her wrist and starting to nod and bounce to a beat, pure black with hard clean edges and no interior detail, no face. The cream page is plain and flat with no texture, no dots, no halftone, no pattern. Locked-off camera, no camera movement. No readable text, no logos, no phone.* |

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

⚠ **AND THE DARK SCREEN WAS THE WRONG GROUND — THE OWNER READ IT AS THE PHONE BEING OFF.** *"the phone is still off on
the print look. logo is coming out of phone"*: the lit-dark-screen answer to the white-triangle problem reads as a
switched-off phone on a cream page, and the plate-less mark still reached the bezel. A `final8.py` (the screen back to
white with the mark on a small ink plate fitted by the plate's rotated extent) was running when the ruling arrived
that ends the question: *"just remove the shape logo from the phone on both."* So **the phone carries no mark on
either page**, and the source goes back to the clip the owner approved before the phone edits began — the plain
image-to-video of frame 8 (`hf_20260908_214117_7c0a575a-….mp4`, md5 `2f9ba3869d17016d6a7a04e81c4e25f9`), whose screen
never had a mark. `final9.py` is `final8.py` with the screen step not run (md5s: `final8.py` not captured — the sandbox holding it was reclaimed before its md5 was read, and its only change from `final7.py` is stated in the paragraph above · `final9.py`
`077ec1cc7c68fb3ebc73d8a5f7b1f7df`, verified against a local copy of the same text); the top-left mark on its ink plate with the glow, the HRM / BPM bar, and the pick under both are unchanged.
The three edits of the still and the two clips animated from them stay in the Sources as what they are: the route by
which a marked phone was tried and measured, and retired by a ruling.

| Video | md5 | bytes | measured |
|---|---|---|---|
| **A — the print**, `final9.py` on the approved clip: no mark on the phone | `ea54d73432d09abdfef5ae02f616cc80` | 18,364,448 | top-left crop on a beat: teal 2,416 px, white 2,427 px (both triangles, on the plate), teal 2,281 mid-beat; IN SYNC 6,071 teal px above the bar at 6.86 s and 0 at 6.0 s; the phone carries nothing |
| **B — the highlighter**, `final9.py`: no mark on the phone | `85bb041f078a175046cdbe0f64be5313` | 6,346,212 | top-left crop on a beat: teal 6,601 px, white 3,213 px, teal 6,431 mid-beat; IN SYNC 6,139 teal px above the bar at 6.86 s and 0 at 6.0 s |

Handed over as links; every earlier pair is superseded by this one.

⚠ **ONE MORE, ON THE PRINT LOOK'S CORNER:** *"remove the black box behind logo in porint look"* → the ink plate is
withdrawn too. The top-left mark on the cream page is the teal-and-white triangles straight on the paper, and the
teal glow behind them (floor raised 0.20 → 0.28, the kick flash unchanged) is what separates the white triangle from
the cream; measured on the render below. `final10.py` (md5 `1e5e1cd17fa43694399004f814429562`) is `final9.py` with that one line changed
— `plate=14` → no plate, the mark back at (100, 150), base 0.28 — and is the pass now shipped; its output:

| Video | md5 | bytes | measured |
|---|---|---|---|
| **A — the print**, `final10.py`, no plate | `c8c29c6060c3ec6ed76e36359f747ae5` | 18,424,384 | top-left crop on a beat: teal 2,550 px, **white 2,501 px above channel-min 240** (the cream page sits at ~216, so that is the white triangle, not paper), no plate ink; teal 2,392 mid-beat; IN SYNC 6,068 teal px above the bar at 6.86 s and 0 at 6.0 s. The same run re-rendered B and produced the **byte-identical** file (`85bb041f078a175046cdbe0f64be5313`), which is the pass proving itself deterministic |
| **B — the highlighter** | unchanged from the `final9.py` row above (its corner never had a plate) | | |

⚠ **AND THE NUMBER ON THE BAR (2026-09-09):** *"have the bpm and hrm be 140 in the 2 videos"* → the bar reads
**HRM 104 → 140** against **BPM 140** and locks IN SYNC on beat 15 (6.49 s), on both pages. The figure beside BPM is
the measured tempo of the music that is playing — the launch cut's v7.2 post-mortem (a card that said 140 over a bed
measured at 119.45) is the rule — so 140 on the bar meant **140 in the music**. `sonilo_music` cannot be asked for it
(seven of eight tracks landed at ~128 whatever was prompted), so the pick was **time-stretched**, not replaced:
`ffmpeg -i d1.m4a -af atempo=1.167153 -c:a aac -b:a 256k d140.m4a` (140 / 119.95; `atempo` keeps the pitch; md5
`7bf02d66c0351fd0c2e037e3f772f3c4`, 1,768,136 bytes, 51.445 s) and re-measured (§6, `meas_d140.py` below). `final11.py`
(md5 `633aa633a485633c33074bc2e103ac5e`) is `final10.py` with three substitutions — `meas_d1.json` → `meas_d140.json`,
`d1.m4a` → `d140.m4a`, the done marker — so `BPMi = 140`, `HR0 = BPMi − 36 = 104` and
`TS = 0.06 + 15 × 0.428571 = 6.4886 s` follow from the measurement file; no number was typed. Its summary line on the
run: `sync at beat 15 t 6.4886 HR0 104 BPM 140`. `run11.sh` (below) produced every file, `verify11.py` (below)
measured them:

| Video | md5 | bytes | measured |
|---|---|---|---|
| **A — the print**, `final11.py`, 140 | `f66651cd1642a1f4b79c51220e73ec40` | 18,370,664 | 243 frames / 10.126 s; top-left crop on a beat vs mid-beat: teal 2,518 / 2,326 (beat 4) · 2,512 / 2,332 (8) · 2,501 / 2,369 (16); white above channel-min 225 at every sample (2,950–4,442 px; the cream sits at 216); IN SYNC 6,706 teal px above the bar at 6.79 s and 340 (the teal dot) at 6.24 s; the rendered audio re-measures **139.85 BPM** over the clip's 23 beats — 0.15 BPM is a quarter of a frame across the whole clip |
| **B — the highlighter**, `final11.py`, 140 | `3ac30669a7ec23dac59488448cb6eb41` | 6,343,107 | 243 / 10.126 s; teal 4,677 / 4,432 · 4,044 / 3,861 · 4,780 / 4,615; white 3,282 / 3,115 · 3,285 / 3,118 · 3,235 / 3,120 (the white triangle throbbing with the teal one); IN SYNC 6,724 at 6.79 s and 338 at 6.24 s; audio 139.85 |

Handed over as links; the `final10.py` pair above is superseded. ⚠ **This is the track the owner approved, 17 %
faster** — *"music is good"* was said of it at 119.95 — and whether the whole film rides the stretch is §10 q8.
⚠ Not visually inspected by the agent (no image or media host is reachable from this container); the owner's look is the QA.

**`run11.sh`** (md5 `189f355c5cedae420649181e60f72683`) — the producer of `d140.m4a`, both renders, the uploads and
the verification, in one background lease; the guards re-fetch the sources so a reclaimed sandbox re-runs it unchanged:

```bash
cd /home/user/dh; PFX=https://d8j0ntlcm91z4.cloudfront.net/user_3E30hta4RMpS2cDML3JnB5dGPnY
[ -s A_src.mp4 ] || curl -sfL -o A_src.mp4 $PFX/hf_20260908_214117_7c0a575a-eb94-40be-86c2-68466b98aa8f.mp4
[ -s d1.m4a ] || curl -sfL -o d1.m4a $PFX/hf_20260908_212940_35ca8b30-6459-46e7-8fa0-7b0196f6ac69.m4a
[ -s d140.m4a ] || ffmpeg -v error -y -i d1.m4a -af atempo=1.167153 -c:a aac -b:a 256k d140.m4a
[ -s tri.png ] || python3 -c "from PIL import Image;Image.open('logo.png').convert('RGBA').crop((1551,200,2169,990)).save('tri.png')"
md5sum A_src.mp4 d1.m4a d140.m4a tri.png final11.py > f11.log
python3 final11.py A_src.mp4 A_v11.mp4 B_v11.mp4 >> f11.log 2>&1
md5sum A_v11.mp4 B_v11.mp4 >> f11.log; ls -l A_v11.mp4 B_v11.mp4 >> f11.log
up(){ s=$(curl -s https://api.gofile.io/servers | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['servers'][0]['name'])"); g=$(curl -s -F "file=@$1" "https://$s.gofile.io/contents/uploadfile" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['downloadPage'])"); l=$(curl -s -F reqtype=fileupload -F time=72h -F "fileToUpload=@$1" https://litterbox.catbox.moe/resources/internals/api.php); echo "UPLOAD $1 gofile=$g litterbox=$l"; }
up A_v11.mp4 >> f11.log 2>&1; up B_v11.mp4 >> f11.log 2>&1
python3 verify11.py >> f11.log 2>&1
echo RUN11-DONE >> f11.log
```

**`verify11.py`** (md5 `2dd7e620516011bf2ad3c92e4f773d3c`) — the numbers in the table, read off the renders:

```python
import json,math,subprocess,numpy as np,beat
m=json.load(open('meas_d140.json')); BPM=m['bpm'];PH=m['phase'];P=60.0/BPM
def frame(p,t):
    o=subprocess.run(['ffmpeg','-v','error','-ss',f'{t:.4f}','-i',p,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True).stdout
    return np.frombuffer(o,np.uint8).reshape(2560,1440,3).astype(int)
def teal(f): return int(((abs(f[...,0]-0x34)<40)&(abs(f[...,1]-0xd6)<40)&(abs(f[...,2]-0xc5)<40)).sum())
def white(f): return int((f.min(-1)>225).sum())
nS=math.ceil((6.4-PH)/P); TS=PH+nS*P; print('grid',BPM,'P',round(P,4),'PH',PH,'sync beat',nS,'TS',round(TS,4))
for name in ('A_v11.mp4','B_v11.mp4'):
    d=subprocess.run(['ffprobe','-v','error','-select_streams','v','-count_frames','-show_entries','stream=nb_read_frames,r_frame_rate,width,height:format=duration','-of','json',name],capture_output=True,text=True).stdout
    print(name,' '.join(d.split()))
    for nb in (4,8,16):
        fb=frame(name,PH+nb*P+1/24)[:330,:420]; fm=frame(name,PH+(nb+0.5)*P)[:330,:420]
        print(name,'beat',nb,'top-left teal on/mid',teal(fb),teal(fm),'white on/mid',white(fb),white(fm))
    band=lambda f:f[150:262,540:1140]
    print(name,'IN SYNC band teal pre/post',teal(band(frame(name,TS-0.25))),teal(band(frame(name,TS+0.3))))
    subprocess.run(['ffmpeg','-y','-v','error','-i',name,'-vn','-c:a','copy',name+'.m4a'])
    x=beat.decode(name+'.m4a'); o=beat.onset(beat.energy(beat.bandpass(x,40,120))); print(name,'rendered audio',round(len(x)/beat.SR,3),'s grid',beat.grid(o,110.0,150.0))
print('VERIFY11-DONE')
```

**`meas_d140.py`** — `meas_dh.py`'s method with the comb range widened to **110–150** (the default cap of 140 sits
ON the answer, and a search cannot tell its edge from a peak); its output, `meas_d140.json`
(md5 `b3593d39eff15a953a57db83336f12b3`, byte-identical to the local copy), is the grid both videos are cut on:

```python
import json, numpy as np, beat
x=beat.decode('d140.m4a'); dur=len(x)/beat.SR
kick=beat.bandpass(x,40,120); e=beat.energy(kick); o=beat.onset(e)
g=beat.grid(o,110.0,150.0); n=len(o)//2; g1=beat.grid(o[:n],110.0,150.0); g2=beat.grid(o[n:],110.0,150.0)
P=g['P']; ph=g['phase']; nb=int((dur-ph)/P); ek=e/e.max(); h=beat.HOP; kb=[]
for i in range(nb):
    t=ph+i*P; a=int((t-0.04)/h); b=int((t+0.04)/h)+1; kb.append(float(ek[max(0,a):b].max()) if b>a else 0.0)
kb=np.array(kb); pres=np.clip((kb-0.15)/0.30,0,1); first=[i for i,v in enumerate(kb) if v>0.3][0]
gaps=[]; run=None
for i,v in enumerate(pres):
    if v<0.5: run=[i,i] if run is None else [run[0],i]
    else:
        if run: gaps.append(run); run=None
if run: gaps.append(run)
gaps=[gg for gg in gaps if gg[1]-gg[0]>=2]
out=dict(bpm=g['bpm'],P=g['P'],phase=g['phase'],score=g['score'],halves=[g1['bpm'],g2['bpm']],first_kick_s=round(ph+first*P,3),dur=round(dur,3),kick_gaps_beats=[[int(a),int(b)] for a,b in gaps],kick_by_beat=[round(float(v),3) for v in kb])
json.dump(out,open('meas_d140.json','w')); o2=dict(out); o2.pop('kick_by_beat'); print(json.dumps(o2)); print('MEAS140-DONE')
```

```json
{"bpm": 140.0, "P": 0.428571, "phase": 0.06, "score": 0.245, "halves": [139.95, 140.15], "first_kick_s": 0.06, "dur": 51.456, "kick_gaps_beats": [[61, 79], [112, 118]], "kick_by_beat": [0.732, 0.66, 0.657, 0.669, 0.68, 0.619, 0.657, 0.633, 0.633, 0.622, 0.676, 0.689, 0.644, 0.746, 0.538, 0.61, 0.684, 0.775, 0.683, 0.678, 0.812, 0.593, 0.645, 0.749, 0.63, 0.774, 0.719, 0.768, 0.684, 0.706, 0.842, 0.757, 0.719, 0.652, 0.764, 0.644, 0.8, 0.588, 0.854, 0.638, 0.663, 0.743, 0.828, 0.744, 0.763, 0.746, 0.797, 0.626, 0.343, 0.3, 0.401, 0.282, 0.362, 0.193, 0.353, 0.252, 0.455, 0.158, 0.315, 0.183, 0.372, 0.062, 0.092, 0.02, 0.087, 0.046, 0.018, 0.003, 0.001, 0.001, 0.0, 0.01, 0.005, 0.0, 0.0, 0.0, 0.0, 0.0, 0.003, 0.0, 0.437, 0.356, 0.401, 0.483, 0.509, 0.687, 0.687, 0.698, 0.757, 0.689, 0.609, 0.629, 0.653, 0.607, 0.649, 0.369, 0.735, 0.569, 0.885, 0.664, 0.697, 0.75, 1.0, 0.705, 0.693, 0.711, 0.859, 0.668, 0.841, 0.618, 0.862, 0.656, 0.01, 0.001, 0.0, 0.0, 0.0, 0.0, 0.0]}
```

⚠ **THEN, THE SAME AFTERNOON: *"how about 130 bpms"*** → the same route with one number changed, and nothing else:
`atempo=1.083785` (130 / 119.95) on the pick → `d130.m4a` (md5 `c33b10a9765938834c6e1fb5637cfb7f`, 1,903,927 bytes,
55.39 s), re-measured by `meas_d130.py` — `meas_d140.py` with `d140` → `d130` in both filenames and the done marker,
md5 `fe5f368ef9f63d29b2ec1c83bdf2746b` — at **130.0 BPM**, P 0.461538, φ 0.063, halves 130.05 / 130.15, kick from the
first beat, kick-less at beats 57–59 (26.4–27.3 s, the thinning bars now reading under the gate for three beats),
61–79 (28.2–36.5 s) and 112–118 (51.8–54.5 s), 55.4 s = 30.0 bars. `final12.py` (md5 `0539f054dd21e6e1f366abc836d3d1d1`)
is `final10.py` with `meas_d130.json` / `d130.m4a` / the done marker, so `BPMi = 130`, `HR0 = 94` and
`TS = 0.063 + 14 × 0.461538 = 6.5245 s` (the lock on beat 14); `verify12.py` (md5 `033deedb5d4715311eb0ad0f705c4e74`) is
`verify11.py` with `meas_d130.json` and the `_v12` names. The sandbox had been reclaimed between the two runs, so
`run12.sh` (below, md5 `2ae8563778d244981341c6df4b375d0b`) rebuilds everything from the cloudfront sources and the repo's
logo — the ▸◂ crop `tri.png` came back at the same md5 (`4a572b6ef9f4c710eb83a0ba0ca99e54`), which is the crop proving
itself reproducible. `beat.py` as written into the sandbox: md5 `ccd2568c4c6a866b917dbd177c7eb92e`. Its summary line:
`sync at beat 14 t 6.5245 HR0 94 BPM 130`.

| Video | md5 | bytes | measured |
|---|---|---|---|
| **A — the print**, `final12.py`, 130 | `cc0faca47f67c26aae1682efac76bfba` | 18,426,633 | 243 frames / 10.126 s; top-left crop on a beat vs mid-beat: teal 2,512 / 2,358 (beat 4) · 2,509 / 2,371 (8) · 2,521 / 2,349 (16); white above channel-min 225 at every sample (2,654–5,099 px — the count moves with the source page under the crop, the cream sits at 216); IN SYNC 6,690 teal px above the bar at 6.82 s and 337 (the teal dot) at 6.27 s; the rendered audio re-measures **130.05 BPM** over the clip's 22 beats |
| **B — the highlighter**, `final12.py`, 130 | `3b3641095f96bd80bd23c9c7309cd30c` | 6,352,655 | 243 / 10.126 s; teal 4,623 / 4,546 · 3,970 / 3,842 · 4,806 / 4,433; white 3,283 / 3,073 · 3,239 / 3,119 · 3,281 / 3,072; IN SYNC 6,750 at 6.82 s and 339 at 6.27 s; audio 130.05 |

Handed over as links; **the 140 pair above is superseded by this one**, and the bed is now the approved track **8 %
faster** rather than 17 %. ⚠ Not visually inspected by the agent.

**`run12.sh`**, verbatim:

```bash
mkdir -p /home/user/dh; cd /home/user/dh; PFX=https://d8j0ntlcm91z4.cloudfront.net/user_3E30hta4RMpS2cDML3JnB5dGPnY
[ -s A_src.mp4 ] || curl -sfL -o A_src.mp4 $PFX/hf_20260908_214117_7c0a575a-eb94-40be-86c2-68466b98aa8f.mp4
[ -s d1.m4a ] || curl -sfL -o d1.m4a $PFX/hf_20260908_212940_35ca8b30-6459-46e7-8fa0-7b0196f6ac69.m4a
[ -s logo.png ] || curl -sfL -o logo.png https://raw.githubusercontent.com/cperry8800-droid/shape-app/main/public/SHAPE-logo-teal-white.png
[ -s tri.png ] || python3 -c "from PIL import Image;Image.open('logo.png').convert('RGBA').crop((1551,200,2169,990)).save('tri.png')"
[ -s d130.m4a ] || ffmpeg -v error -y -i d1.m4a -af atempo=1.083785 -c:a aac -b:a 256k d130.m4a
md5sum A_src.mp4 d1.m4a logo.png tri.png d130.m4a beat.py meas_d130.py final12.py verify12.py > f12.log
ffprobe -v error -show_entries format=duration -of csv=p=0 d130.m4a >> f12.log
python3 meas_d130.py >> f12.log 2>&1; md5sum meas_d130.json >> f12.log
python3 final12.py A_src.mp4 A_v12.mp4 B_v12.mp4 >> f12.log 2>&1
md5sum A_v12.mp4 B_v12.mp4 >> f12.log; ls -l A_v12.mp4 B_v12.mp4 >> f12.log
up(){ s=$(curl -s https://api.gofile.io/servers | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['servers'][0]['name'])"); g=$(curl -s -F "file=@$1" "https://$s.gofile.io/contents/uploadfile" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['downloadPage'])"); l=$(curl -s -F reqtype=fileupload -F time=72h -F "fileToUpload=@$1" https://litterbox.catbox.moe/resources/internals/api.php); echo "UPLOAD $1 gofile=$g litterbox=$l"; }
up A_v12.mp4 >> f12.log 2>&1; up B_v12.mp4 >> f12.log 2>&1
python3 verify12.py >> f12.log 2>&1
echo RUN12-DONE >> f12.log
```

`meas_d130.json` (md5 `010170ec192e7fad2dad0e10c8897edb`, byte-identical to the local copy):

```json
{"bpm": 130.0, "P": 0.461538, "phase": 0.063, "score": 0.2903, "halves": [130.05, 130.15], "first_kick_s": 0.063, "dur": 55.403, "kick_gaps_beats": [[57, 59], [61, 79], [112, 118]], "kick_by_beat": [0.841, 0.789, 0.797, 0.754, 0.769, 0.639, 0.755, 0.771, 0.741, 0.711, 0.738, 0.745, 0.768, 0.662, 0.845, 0.675, 0.747, 0.746, 0.739, 0.81, 0.789, 0.773, 0.777, 0.787, 0.655, 0.884, 0.858, 0.797, 0.814, 0.784, 0.833, 0.8, 0.87, 0.77, 0.859, 0.759, 0.969, 0.803, 0.89, 0.749, 0.854, 0.781, 0.866, 0.759, 0.78, 0.867, 0.873, 0.718, 0.363, 0.334, 0.411, 0.299, 0.41, 0.208, 0.445, 0.322, 0.546, 0.173, 0.281, 0.262, 0.458, 0.069, 0.109, 0.023, 0.114, 0.041, 0.018, 0.003, 0.001, 0.001, 0.0, 0.011, 0.004, 0.0, 0.0, 0.0, 0.0, 0.0, 0.003, 0.0, 0.559, 0.39, 0.472, 0.43, 0.592, 0.747, 0.761, 0.774, 0.947, 0.917, 0.837, 0.822, 0.79, 0.977, 0.823, 0.453, 0.76, 0.818, 0.897, 0.78, 1.0, 0.794, 0.981, 0.964, 0.747, 0.772, 0.958, 0.85, 0.894, 0.878, 0.976, 0.777, 0.006, 0.002, 0.0, 0.001, 0.0, 0.0, 0.0]}
```

⚠ **THEN THE RULING THAT CHANGES THE SOURCE, NOT THE PASS (2026-09-09): *"ok go back to 120 and lets remove the phone
from the video all together. Can you have the person wear a fitness watch?"*** Three changes. The tempo is the one the
pass was built on — `final10.py` unchanged (md5 `1e5e1cd17fa43694399004f814429562`) on `meas_d1.json` and `d1.m4a`,
the native grid **re-measured this run at exactly the recorded values** (119.95 · P 0.500208 · φ 0.055 · halves
120.0 / 120.0 · kick from 0.055 s · gaps 61–79 and 112–118; `meas_d1.json` md5 `66671eee4dae6b0283715147fecb144b`),
so the bar reads **HRM 84 → 120 · BPM 120** and locks on beat 13 (6.5577 s). The other two are in the SOURCE: the
approved frame 8 was edited twice (E4, E5 above — the phone removed, a fitness watch on the wrist, the ribbon flowing
from the watch) and measured against frame 8 with `meas_edit.py` (below): frame 8's phone box, (1232, 748)–(1388, 956)
at 1536×2752, held **19,000 px above luma 236 and holds 1,664 (E4) / 883 (E5)** — the phone is gone in both; E4 also
carries a **compact 54×50 teal blob at (963, 1315)**, the wrist that held the phone, i.e. the watch face, where E5's
compact blob sits at (1083, 330) on the far side of the figure. E4 taken. Its image-to-video (row 7) measured with
`meas_clip13.py` (below): in every sampled frame the figure band holds **18–498 px above luma 250** where a lit phone
screen held ~17,000 — no phone in any frame — and a compact teal blob sits at the wrist (cy 888–1116, cx 1056–1212) in
**13 of 21** sampled frames; in the other 8 the teal at the wrist merges into the ribbon that flows from it, so the
test cannot separate the two there. The pass finds this clip's column rules at 388–390 / 1067–1069 (the earlier
clip's were 391–393 / 1063–1065; three pixels of page drift between two animations of one frame, found rather than
assumed). The sandbox was reclaimed between staging the scripts and the clip's arrival, so `run13.sh` and every file it
runs were written and launched in ONE background lease; their md5s as written: `beat.py`
`ccd2568c4c6a866b917dbd177c7eb92e` · `final10.py` `1e5e1cd1…` · `meas_d1.py` `e7560987139aeb03854df3c8a9311aca`
(`meas_d140.py` with `d140` → `d1`) · `meas_clip13.py` `c45200310c1fb6583f5b9ebbc126d57a` · `verify13.py`
`5e328a6574c36d836364fac157634fe0` (`verify11.py` with `meas_d1.json` and the `_v13` names) · `run13.sh`
`296cba7edba68a508b8cacfffa917eee`.

| Video | md5 | bytes | measured |
|---|---|---|---|
| **A — the print**, `final10.py` on the watch clip, native grid | `8b1b842844ab1fac9ad8f875fe16e11f` | 17,898,392 | 243 frames / 10.126 s; top-left crop on a beat vs mid-beat: teal 2,518 / 2,364 (beat 4) · 2,516 / 2,365 (8) · 2,510 / 2,358 (16); white above channel-min 225 at every sample (2,450–3,241 px; the cream sits at 216); IN SYNC 6,689 teal px above the bar at 6.86 s and 340 (the teal dot) at 6.31 s; the rendered audio re-measures **120.0 BPM** (P 0.5, φ 0.058) over the clip's 20 beats |
| **B — the highlighter**, the same | `572665ac17014395afca201030020eef` | 6,923,430 | 243 / 10.126 s; teal 4,485 / 4,314 · 4,484 / 4,317 · 4,336 / 4,163; white 3,236 / 3,078 · 3,234 / 3,078 · 3,229 / 3,077; IN SYNC 6,741 at 6.86 s and 334 at 6.31 s; audio 120.0 |

Handed over as links; **this pair supersedes the 140 and 130 pairs and the phone clip's pairs.** ⚠ Not visually
inspected by the agent. ⚠ The film's spine (§1, §2) goes IN through each person's phone glass; this ruling is about
the style video, and whether phones leave the FILM too is §10 q9.

**`run13.sh`**, verbatim (the clip URL is its one argument):

```bash
cd /home/user/dh; PFX=https://d8j0ntlcm91z4.cloudfront.net/user_3E30hta4RMpS2cDML3JnB5dGPnY
[ -s d1.m4a ] || curl -sfL -o d1.m4a $PFX/hf_20260908_212940_35ca8b30-6459-46e7-8fa0-7b0196f6ac69.m4a
[ -s logo.png ] || curl -sfL -o logo.png https://raw.githubusercontent.com/cperry8800-droid/shape-app/main/public/SHAPE-logo-teal-white.png
[ -s tri.png ] || python3 -c "from PIL import Image;Image.open('logo.png').convert('RGBA').crop((1551,200,2169,990)).save('tri.png')"
[ -s A_src13.mp4 ] || curl -sfL -o A_src13.mp4 "$1"
md5sum A_src13.mp4 d1.m4a tri.png final10.py meas_d1.py verify13.py meas_clip13.py > f13.log
ffprobe -v error -select_streams v -count_frames -show_entries stream=nb_read_frames,width,height:format=duration -of csv=p=0 A_src13.mp4 >> f13.log
python3 meas_clip13.py A_src13.mp4 >> f13.log 2>&1
python3 meas_d1.py >> f13.log 2>&1; md5sum meas_d1.json >> f13.log
python3 final10.py A_src13.mp4 A_v13.mp4 B_v13.mp4 >> f13.log 2>&1
md5sum A_v13.mp4 B_v13.mp4 >> f13.log; ls -l A_v13.mp4 B_v13.mp4 >> f13.log
up(){ s=$(curl -s https://api.gofile.io/servers | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['servers'][0]['name'])"); g=$(curl -s -F "file=@$1" "https://$s.gofile.io/contents/uploadfile" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['downloadPage'])"); l=$(curl -s -F reqtype=fileupload -F time=72h -F "fileToUpload=@$1" https://litterbox.catbox.moe/resources/internals/api.php); echo "UPLOAD $1 gofile=$g litterbox=$l"; }
up A_v13.mp4 >> f13.log 2>&1; up B_v13.mp4 >> f13.log 2>&1
python3 verify13.py >> f13.log 2>&1
echo RUN13-DONE >> f13.log
```

**`meas_clip13.py`** — the clip's phone-absence and watch-presence measurement:

```python
import sys,subprocess,collections,numpy as np
from PIL import Image,ImageFilter
SRC=sys.argv[1]; W,H=1440,2560
rd=subprocess.Popen(['ffmpeg','-v','error','-i',SRC,'-vf',f'scale={W}:{H}','-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE,bufsize=10**8)
FR=W*H*3; n=0; rows=[]
def blobs(mask):
    ys,xs=np.nonzero(mask); pts=set(zip(ys.tolist(),xs.tolist())); out=[]
    while pts:
        s=pts.pop(); q=collections.deque([s]); b=[s]
        while q:
            y,x=q.popleft()
            for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
                nb=(y+dy,x+dx)
                if nb in pts: pts.remove(nb); q.append(nb); b.append(nb)
        out.append(b)
    return out
while True:
    b=rd.stdout.read(FR)
    if len(b)<FR: break
    if n%12==0:
        f=np.frombuffer(b,np.uint8).reshape(H,W,3).astype(int); g=0.299*f[...,0]+0.587*f[...,1]+0.114*f[...,2]
        white=int((g[250:H-340]>250).sum())
        tm=((abs(f[...,0]-0x34)<60)&(abs(f[...,1]-0xd6)<60)&(abs(f[...,2]-0xc5)<60)); tm[H-340:]=False
        small=Image.fromarray((tm*255).astype(np.uint8)).resize((W//4,H//4),Image.BOX); sm=np.asarray(small.filter(ImageFilter.MaxFilter(3)))>0
        compact=[(len(bb)*16,int(np.mean([y for y,_ in bb]))*4,int(np.mean([x for _,x in bb]))*4) for bb in blobs(sm) if 5<=max(y for y,_ in bb)-min(y for y,_ in bb)<=35 and 5<=max(x for _,x in bb)-min(x for _,x in bb)<=35 and len(bb)>=20]
        rows.append((n,white,int(tm.sum()),compact[:3]))
    n+=1
print('frames',n); print('(frame, white>250 px in the figure band, teal px, compact teal blobs [size,cy,cx]):')
for r in rows: print(r)
print('MEAS-CLIP13-DONE')
```

**`meas_edit.py`** (md5 `2a8ddd9db81caf3d85f7fba780eb2e3d`) — the two edits against frame 8 (`f8.png` = job `bcfea348…`, md5 `bfc10e6b8068dda31fb657bb0744b7b4`):

```python
import sys,subprocess,numpy as np
from PIL import Image
def lum(p):
    a=np.asarray(Image.open(p).convert('RGB')).astype(int); return a,(0.299*a[...,0]+0.587*a[...,1]+0.114*a[...,2])
def teal(a): return ((abs(a[...,0]-0x34)<60)&(abs(a[...,1]-0xd6)<60)&(abs(a[...,2]-0xc5)<60))
f8,g8=lum('f8.png'); print('frame8',f8.shape)
box=(slice(748,956),slice(1232,1388))
for p in sys.argv[1:]:
    a,g=lum(p); assert a.shape==f8.shape,(p,a.shape)
    w_all=int((g>236).sum()); w8=int((g8>236).sum()); w_box=int((g[box]>236).sum()); w8_box=int((g8[box]>236).sum())
    d=np.abs(g-g8); H,W=g.shape; cells=[[int(d[i*H//6:(i+1)*H//6,j*W//4:(j+1)*W//4].mean()) for j in range(4)] for i in range(6)]
    print(p,'white>236 whole',w8,'->',w_all,'| phone box',w8_box,'->',w_box,'| teal px',int(teal(f8).sum()),'->',int(teal(a).sum()),'| top-band median',int(np.median(g8[:200])),'->',int(np.median(g[:200])),'| mean|diff| by 6x4 cell',cells)
    # teal clusters: connected teal blobs, largest few with centroid (a watch face should be a compact blob)
    from PIL import ImageFilter
    t=Image.fromarray((teal(a)*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)); ta=np.asarray(t)>0
    lab=np.zeros(ta.shape,int); n=0; import collections
    ys,xs=np.nonzero(ta); pts=set(zip(ys.tolist(),xs.tolist())); blobs=[]
    while pts:
        s=pts.pop(); q=collections.deque([s]); b=[s]
        while q:
            y,x=q.popleft()
            for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
                nb=(y+dy,x+dx)
                if nb in pts: pts.remove(nb); q.append(nb); b.append(nb)
        blobs.append(b)
    blobs.sort(key=len,reverse=True)
    print(p,'teal blobs (size, cy, cx, h, w):',[(len(b),int(np.mean([y for y,_ in b])),int(np.mean([x for _,x in b])),max(y for y,_ in b)-min(y for y,_ in b),max(x for _,x in b)-min(x for _,x in b)) for b in blobs[:5]])
print('MEAS-EDIT-DONE')
```

**`final9.py` — the finishing pass as shipped for the previous pair, verbatim** (md5 `077ec1cc7c68fb3ebc73d8a5f7b1f7df`; `final10.py` differs by the one line stated above). It is the top-left mark on
its ink plate with the kick glow, the HRM / BPM bar, the highlighter page with every teal pixel carried across, and the
pick under both; it has no screen step, by ruling. The earlier passes are kept by md5 only — `final5.py`
`94e226cd9e038eb49f1b8c8522d78117` (the gated screen pass, the ink-for-white mark), `final4.py`
`a3c0a2fd63636d8e71bf007b0c6e4c6b` (its ungated form), `final7.py` `3c959b47d2997c53b33b5b25415b416b` (the fit, the
clip, the plate, the dark screen) — each described where it was retired:

```python
import json, math, subprocess, sys, numpy as np
from PIL import Image, ImageFilter, ImageDraw, ImageFont
SRC=sys.argv[1]; OUTA=sys.argv[2]; OUTB=sys.argv[3]; W,H=1440,2560; TEAL=(0x34,0xd6,0xc5); TEALf=np.array(TEAL,np.float32); CREAM=np.array([0xf2,0xea,0xd8],np.float32)
m=json.load(open('meas_d1.json')); BPM=m['bpm']; PH=m['phase']; KB=m.get('kick_by_beat'); P=60.0/BPM
def kof(t):
    u=(t-PH)%P; n=int((t-PH)//P); pres=1.0 if not KB or n<0 or n>=len(KB) else min(1.0,max(0.0,(KB[n]-0.15)/0.30)); return math.exp(-u/0.20)*pres
tri=Image.open('tri.png').convert('RGBA'); ASP=tri.width/tri.height
def glow_mark(canvas, mark, cx, cy, h, k, base, flash, blur, amp=0.06, rot=0.0, plate=0):
    s=1.0+amp*k; hh=max(8,int(round(h*s))); ww=max(6,int(round(hh*ASP))); mk=mark.resize((ww,hh),Image.LANCZOS)
    if plate:
        pw,ph=mk.width+2*plate,mk.height+2*plate; pl=Image.new('RGBA',(pw,ph),(0,0,0,0)); ImageDraw.Draw(pl).rounded_rectangle([0,0,pw-1,ph-1],radius=max(6,plate),fill=(16,16,16,255)); pl.alpha_composite(mk,(plate,plate)); mk=pl
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
wA=wr(OUTA); wB=wr(OUTB); FR=W*H*3; n=0; rulecols=None; log=[]
while True:
    b=rd.stdout.read(FR)
    if len(b)<FR: break
    f=np.frombuffer(b,np.uint8).reshape(H,W,3).astype(np.float32); g=0.299*f[...,0]+0.587*f[...,1]+0.114*f[...,2]; t=n/24.0; k=kof(t)
    A=Image.fromarray(f.astype(np.uint8)).convert('RGBA'); glow_mark(A,tri,100+130*ASP/2+14,150+65+14,130,k,0.20,0.55,16,plate=14); sync_bar(A,t,k,(20,20,20),(95,95,95),TEAL)
    m0=g<90; m0[:250]=False; m0[H-340:]=False
    if rulecols is None:
        frac=m0[250:H-340].mean(0); rulecols=[x for x in range(W) if frac[x]>0.55]; print('rule columns',rulecols,flush=True)
    for x in rulecols: m0[:,max(0,x-3):x+4]=False
    mm=blur_mask(m0,4)>0.35; bm=blur_mask(mm,6); edge=(bm>0.12)&(bm<0.88)
    E=Image.fromarray((edge*255).astype(np.uint8)); glow=np.asarray(E.filter(ImageFilter.GaussianBlur(14))).astype(np.float32)/255.0; st_=np.asarray(E.filter(ImageFilter.GaussianBlur(1))).astype(np.float32)/255.0
    out=page.copy(); a=np.clip(glow*0.55+st_*0.95,0,1)[...,None]; out=out*(1-a)+TEALf*a
    tm=((np.abs(f[...,0]-0x34)<60)&(np.abs(f[...,1]-0xd6)<60)&(np.abs(f[...,2]-0xc5)<60)); tg=blur_mask(tm,6); ta=np.clip(tg*0.5+tm.astype(np.float32)*0.95,0,1)[...,None]; out=out*(1-ta)+TEALf*ta
    # owner: no logo on the phone, on either page -- no screen step
    B=Image.fromarray(out.clip(0,255).astype(np.uint8)).convert('RGBA'); glow_mark(B,tri,90+150*ASP/2,30+75,150,k,0.35,0.65,20); sync_bar(B,t,k,(190,184,170),(80,78,72),TEAL)
    if n%24==0: log.append((n,int(m0.sum()),int(tm.sum()),round(k,2)))
    wA.stdin.write(A.convert('RGB').tobytes()); wB.stdin.write(B.convert('RGB').tobytes()); n+=1
for w in (wA,wB): w.stdin.close()
for w in (wA,wB): w.wait()
print('frames',n); print('sync at beat',nS,'t',round(TS,4),'HR0',HR0,'BPM',BPMi); print('(frame, ink px, teal px carried, k):',log); print('FINAL9-DONE')
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
