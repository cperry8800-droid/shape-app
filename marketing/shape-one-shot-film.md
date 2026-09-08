# SHAPE — "Silhouettes" · the one-shot film

Owner's ask (2026-09-08, verbatim): *"i also want a video of shape like what apple did for the release of the
ipad. I want the same style, but show image of people using the app on their phone etc. But like a whole walk
through that blends together, almost in one shot with cool visual effects. Be very creative."* Then, on the first
style frames: *"have the images be more animated"* — and, with a picture of the iPod silhouette campaign: *"similar
to this … again like the apple ad."*

So the reference is the **silhouette campaign**: jet-black figures caught mid-motion on flat, saturated single-colour
fields, thin white earbud cords, a white player in the hand. This file is v2 of the treatment; v1 ("Through the
Glass", photoreal rooms) is superseded and summarised at the end. The owner's rulings stand: **9:16 only · 45–60 s
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

**v2 — the silhouette frames (CURRENT), 2026-09-08 20:54 UTC**

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
