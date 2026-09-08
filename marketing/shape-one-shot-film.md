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
every figure stylised and in motion, the idea kept and the look Shape's own.** The world is therefore an open choice
among four looks (§2a), all shown to the owner as style frames on 2026-09-08; the beat map, the seams and the
honesty ledger below hold for any of them. This file is v2 of the treatment; v1 ("Through the Glass", photoreal
rooms) is superseded and summarised at the end. The owner's rulings stand: **9:16 only · 45–60 s
with a 30 s cutdown · a new owned track, no voiceover, minimal type cards · style frames first, clips after the
look is approved.**

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

Nominal 128 BPM, bar = 1.875 s, 30 bars = 56.3 s (60.0 s if the track measures 120). Times of day are never
captioned; the app's own dateline clock carries them (browser clock set at capture).

| Bars | Field | What we see | Silhouette | The REAL screen (light paper on the white phone) | Out → |
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
positively; decline any preset recommendation with `declined_preset_id`). Seven figures, two takes each. A take is a
reject if the silhouette breaks (interior detail, a face, grey edges), if the field carries a gradient, or if a
second white object appears.

**Master block** (the head of every clip prompt):

> Vertical 9:16. A flat graphic advertising film in the style of a classic silhouette campaign: a solid, perfectly
> flat, saturated {COLOUR} background with no gradient, texture, floor or shadow. One jet-black silhouette of a
> {FIGURE}, pure black with no interior detail and hard clean edges, {ACTION} in time to a fast beat, big explosive
> movements. Thin white earbud wires run from the ears to a white smartphone in one hand, its screen a plain flat
> white rectangle; the wires and the phone are the only white elements. Locked-off camera. No text, no logos, no
> other objects.

| Figure | {COLOUR} | {FIGURE} · {ACTION} |
|---|---|---|
| The riser | teal, hex 34D6C5 | a woman with her hair flying · walking in from the left edge and breaking into a dance, the phone held up in front of her |
| The lifter | electric blue | a broad-shouldered man · pressing a kettlebell overhead in a wide split stance on every beat, the phone in his other hand |
| The cook | lime green | a cook in an apron · tossing a frying pan so chopped vegetables hang in the air as black shapes, then catching them, the phone propped upright at the bottom corner of the frame |
| The coach | hot magenta pink | a woman seated on a stool · one foot tapping hard, head nodding, holding the phone up in both hands |
| The runner | teal, hex 34D6C5 | a runner · sprinting side-on across the frame, knees driving high, ponytail streaming, the phone strapped to one arm |
| The kicker | bright orange | a woman with braids · throwing high roundhouse kicks, braids whipping, the phone in one hand |
| The skipper | deep navy | a man · jumping rope, the rope a thin black arc, one jump per beat, the phone held up in one hand |

The seven descriptions are placeholders in the register the approved runner prompt used; casting remains the
owner's call, and a silhouette makes it a matter of build and hair rather than face.

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

One new `sonilo_music` generation (`duration: 60`), prompted plainly: *house, 124 BPM, a hard kick from bar one,
continuous, no intro, no breakdown, bright and driving, one short synth hook every four bars.* A prompted tempo is a
request — six of seven tracks measured ~128 whatever was asked — so the track is **measured** with `beat.py` and
`kick_by_beat` stored for every beat; the film is planned in bars from that grid. The opening is low-passed from
frame 0 and opens to full band on the lock; bar 17 is high-passed so nothing pulses under the two orbs and the
bar-18 downbeat is the kick coming back; the music cuts dead on the wordmark. A take with a breakdown or a late
first kick is regenerated.

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

| Stage | What | Bills |
|---|---|---|
| Style frames | 6 silhouettes, one colour and one action each (**generated 2026-09-08**, Sources below) | 6 images |
| Clips | 7 figures × 2 takes | ~14 `minimax_h3` submissions |
| Music | 1–2 tracks, measured | 1–2 `sonilo_music` |
| Captures | one sandbox lease | — |
| Renders | the two-stage runner, verify re-derived on the render | — |

## 10 · Open questions for the owner (with the default I will use)

1. **The colours.** The campaign's rotation (blue · magenta · lime · orange · yellow) with Shape teal as the home
   field (default), or teal-only fields with the silhouettes on tints of one colour? The rotation is the reference;
   teal-only is more the brand's own register.
2. **The coach thread.** A real two-account capture on your accounts (default) or the signed-out preview.
3. **The one new line.** *A person. Not an algorithm.* — keep (default) or silence over the coach.
4. **Casting.** Seven silhouettes in §4, one phrase each; the runner is no longer the photoreal `878ea5a1` clip — in
   this world it is a silhouette too, so the casting note that took four rounds becomes a hair-and-build phrase.
5. **The world.** v1 closed on the night Earth with 44 marks; this world closes on the montage and the mark (default).
   A flat-graphic globe — black continents on teal, marks popping — is one extra generation if you want the world back.
6. **Whose numbers.** The Score, ledger and Terrain captures come from a real account (default: yours).

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

**Motion test — one `minimax_h3` clip, 2026-09-08 21:05 UTC.** Params `aspect_ratio 9:16 · duration 10 · resolution 2K · use_unlim false · declined_preset_id 24bae836-2c4a-48e0-89b6-49fcc0b21612` (the "IN THE DARK" preset that intercepts silhouette-on-dark submissions). File name recorded when the job completed: see the row.

| # | What | Job | File | Prompt (verbatim, as submitted) |
| --- | --- | --- | --- | --- |
| 7 | Motion test · Shape-edition silhouette dancer on teal, 10 s | `893378b3-64f0-4bb6-ba8d-0d5c5b6d5ed2` | `pending at this commit — the job was still rendering; the name follows the hf_20260908_<time>_<job>.mp4 pattern and is filled in once it completes` | *Vertical 9:16. Flat 2D animation in the style of a classic silhouette campaign, unique to a brand called Shape: a solid, perfectly flat teal background, hex 34D6C5, with no gradient, texture, floor or shadow. One jet-black silhouette of a woman dancing with big explosive movements to a fast beat, jumping, spinning, hair flying, pure black with no interior detail and hard clean edges. She holds a cream-white smartphone in one hand, its screen a plain flat cream rectangle, and a single long ribbon of white-and-teal light streams out of the phone and whips around her body as she moves, trailing behind every movement, the only glowing element. Locked-off camera, no camera movement. No earbuds, no text, no logos, no other objects.* |

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
