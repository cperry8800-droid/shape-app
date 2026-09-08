# SHAPE — "Through the Glass" · the one-shot film

Owner's ask (2026-09-08, verbatim): *"i also want a video of shape like what apple did for the release of the
ipad. I want the same style, but show image of people using the app on their phone etc. But like a whole walk
through that blends together, almost in one shot with cool visual effects. Be very creative."*

Owner's rulings on the same day, all binding here: **9:16 vertical only** · **45–60 s with a 30 s cutdown** ·
**a new owned track, no voiceover, minimal type cards** · **style frames first, clips only after the look is
approved**. This document is the treatment; nothing in it has been generated yet.

How it was made: five directions were written independently under different lenses (the portal, one continuous
dolly, a match-cut chain, a light ribbon, Apple-literal) and scored 1–10 by three judges — Apple craft, buildability
on the actual toolchain, brand and honesty. Totals: the match-cut chain 23, the portal 22.5, Apple-literal 20,
the dolly 19, the ribbon 13 (16:9, and the only one that forfeits every approved asset). The film below fuses the
two leaders — the match-cut chain's spine (one hairline that is the broadsheet's own rule, every cut a rhyme on a
downbeat) with the portal's seams (every world-to-world cut hidden at full-frame real UI on a locked-off phone,
the one composite path this pipeline has proven) — and takes three grafts the judges named from the others: the
dolly's kick drop built in post under the lock, Apple-literal's lights-out arc through the app's own *Pick your
light*, and its three-phone close as an option (§11). The two runners-up are summarised at the end.

---

## 1 · The concept

**The camera never cuts. It only ever goes IN through the glass of one person's phone and comes OUT through the
glass of the next.** Seven strangers, one day — a bedroom before dawn, a garage gym, a kitchen, a coach on a
tram, the runner, a bench at noon, a rooftop at 22:40 — and the one thing that stays continuous while the whole
world changes behind it is the real Shape UI. Apple's iPad films make the device the hero and let a screen
become the next scene; this film takes that literally: the app is the only place the film is allowed to cut,
and it is real every time.

**One line runs through it.** The hairline rule under the SHAPE masthead is drawn at the first kick and never
leaves: it is the edge of a nightstand, the edge of a gym mat, a counter's front, a coach's thread rule, the
runner's floor, and at the lock it closes into a circle. After the lock the circle does the work — the merged
orb becomes the Score ring, the ring becomes the rim of the world, the world contracts into the ▸◂ mark. Every
cut lands on a downbeat of a measured grid and on a rhyme, so eleven pieces read as one shot.

**The day turns over inside the app.** At noon a reader flips *Pick your light* from light paper to midnight, and
the world goes dark with it — the real Settings picker, not a grade. The music is the product's own rule made
audible: a kick under every room, one bar of nothing before the two orbs lock, and the kick coming back *is* the
lock. The music cuts dead on the wordmark. Nobody looks at the camera. Nobody sells anything.

## 2 · Why it reads as one shot — the five mechanisms

Every generated clip is a **locked-off tableau with a STILL phone** (propped, lying flat, or held still) whose
screen is prompted as blank dark glass. The real app is composited at the phone's measured rect (the temporal-
minimum method the Radio cut proved), every camera move is built in post, and the cut between worlds is hidden
at **full-frame real UI**, on a real UI event, on a downbeat. Per-frame screen tracking does not exist in this
pipeline; a take in which the phone drifts, a hand turns it, or the camera moves is a reject, measured by the
rect's per-frame variance, never by eye.

| # | Mechanism | What the two adjoining clips must contain | How it is executed |
|---|---|---|---|
| A | **Zoom-through-screen** (the portal) | Outgoing clip: the phone still, glass blank. Incoming clip: a different still phone, glass blank. The UI segment is ONE continuous capture spanning the push, the full-frame moment and the pull. | Per-frame crop/scale of the *world* composite toward the measured rect (ffmpeg `crop=w(t):h(t):x(t):y(t)` + `scale`, ease-in over 6–12 frames), the UI layer placed AFTER the scale at native resolution so type stays sharp; hand-off to the full-frame capture (recorded at CDP scale 3, 1125×2460, so the 1.9× upscale stays clean); the world-to-world cut sits inside the capture on the downbeat; reverse for the pull-out. |
| B | **Luma-matte from the UI's own geometry** | Outgoing: the calendar grid or a hairline rule full-frame. Incoming: a room whose structure rhymes (a tiled wall, a floor line). | Pillow thresholds the capture's hairlines into a matte, dilates and feathers it, lights its cells per beat in reading order (or expands a band from a rule's y) until the matte IS the next world; ffmpeg `alphamerge` + `overlay`. |
| C | **Whip-pan stitch** | Outgoing: a horizontal element streaking right (the memo's waveform). Incoming: opens on a horizontal element. | numpy per-frame horizontal offset ramp on both clips + `boxblur=lr` ramp 0→48→0 over 16 frames; the hairline redrawn sharp over the blur; no added swish — the whip lands on a kick. |
| D | **Lights-out** (the day turning over) | Outgoing: a daylight room with the phone in the frame. Incoming: a night room, the only light the screen. | The captured Settings *Pick your light* flip light → midnight lands on the downbeat; the world's exposure ramps to black underneath (`curves`/`eq` over 6 frames) with the UI composited AFTER the ramp at full brightness; four frames of black; pull out of the night phone. |
| E | **The circle chain** | The merged orb (drawn) · the Score ring (capture) · the globe's measured limb · the ▸◂ mark. | Iris-through-orb: a Pillow circular alpha centred on the orb, radius easing past the frame diagonal (one teal frame), a second mask contracting onto the ring's measured centre/radius. Ridge-to-limb: a 10-frame xfade masked by an annulus around the globe's rim-fitted disc. Contract-to-mark: every mark tweened to the centroid (12 frames) while a `zoompan` shrinks the globe into a 480 px disc cut by the ▸◂ mask. |

Compositing mode is decided by the measured rect, not by taste: a dark room's glass (median luma < 20) takes the
proven **screen-blend**; daylight glass takes an **opaque overlay (~0.92) plus a 15 % screen pass** for glints —
an untested variant, checked on one frame per clip before a render. The hairline needs a measured y in every
clip and never crosses a face.

## 3 · The beat map (30 bars; every time re-derived from the measured grid of the new track)

Nominal 128 BPM, bar = 1.875 s, 30 bars = 56.3 s. If the track measures 120, thirty bars is 60.0 s and the
kitchen loses one bar. Times of day are never captioned: 05:58 and 07:41 are the app's own dateline clocks
(browser clock set at capture); the rest is told by the light.

| Bars | Time | What we see | Who | The REAL screen on the phone | Out → mechanism |
|---|---|---|---|---|---|
| 1–3 | 0:00–0:05.6 | Black. First kick: a teal hairline writes itself across the frame. Under it the SHAPE masthead sets itself in ink — wordmark, double rule, Vol. · No., the dateline with the clock ticking 05:58, the ticker starting to crawl. The frame recedes: a bezel appears. We were inside a phone on a nightstand at dawn all along. | The riser: a Black woman in her thirties, sleep shirt, reaching, reading. | Home — `BSClientHome` cold load (`BSMasthead` · `BSDateline` live clock · `BSTicker`), light paper, ink-reveal luma matte over the real capture. | Her thumb lands on TRAIN in the slate row → **A** (push into the glass). |
| 4–5 | 0:05.6–0:09.4 | Inside the page, full frame: the slate row TRAIN · 06:15, the Train deck. *Written before you arrive.* The world changes behind the page: we pull out of a phone propped against a kettlebell. | Nobody — the page, and the coach who wrote it, by implication. | Home slate → Train session deck (`BSClientTrain`), one continuous capture across the cut. | Pull-out → **A**. |
| 6–8 | 0:09.4–0:15.0 | A garage gym, one tungsten bulb, a roller door cracked to blue dawn. The phone leans on a kettlebell on rubber flooring; behind it, defocused, a man chalks his hands and racks a set, waist-down. His hand logs a set; a scroll pulls the whole month up. | A white man of 46, faded sweatshirt. | Train — live session player → a set logged → the month calendar (`BSCalendarMonth`). | The calendar's grid fills the frame; its cells light in reading order until the grid is a tiled kitchen wall → **B**. |
| 9–12 | 0:15.0–0:22.5 | Hands, two pans, steam; the phone against a jar. Two dishes ticked, *Merge the mise*, the timing block: *Cook at the same time*, live. *Two dishes, one timeline.* Then a photo of the plate and a voice memo leave for the coach. | A Latino father of 35, a burp cloth on one shoulder; a four-year-old's hand and bowl at the frame edge. | Eat — `BSPrepSession` MISE stage (≥2 dishes ticked, the hero row confirmed live) → `BSLogMealFlow` photo + voice → send. | The memo's waveform streaks right → **C** (whip). |
| 13–15 | 0:22.5–0:28.1 | A tram at rush hour, the phone low in a lap. The coach app: the SAME dateline row in trainer rust, its clock 07:41; the thread — the memo and the plate arrive; she listens, types, sends. *A person. Not an algorithm.* | A Japanese trainer of 27, rain jacket, one earbud. | Coach app — `BSProToday` dateline → `BSChatThread` (coach side): incoming photo + memo, the reply sent. | She sends; the rule under her reply is the line; a band iris opens from it → **B**, onto the runner's floor. |
| 16–19 | 0:28.1–0:35.6 | **The lock.** The runner — side profile, ribbons of teal and white light, black behind, no phone. The drawn card lower-right: a line with two orbs riding it, BPM (the track's measured tempo, the only digit that is a measurement) and HRM climbing. Bar 17 loses its kick: for the first time nothing pulses. The downbeat of bar 18 is the kick returning, and the orbs touch on that frame: one teal orb, **IN SYNC**, once. | The approved runner, job `878ea5a1`. | No capture, by rule (the real Radio screen carries ON AIR / LIVE chrome). The card is `mk_orb6.py` on this film's measured grid. | The merged orb irises past the frame edge; a second mask contracts onto the Score ring → **E**. |
| 20–21 | 0:35.6–0:39.4 | A park bench at noon, hard shadow, a folded newspaper on the slats, the phone at reading distance in an older hand. The Score ring sweeps closed on the downbeat; THIS TIER / THE LADDER. *One number that tells the truth.* | A Black man of 63, cardigan, reading glasses, reading his Score the way he reads the paper. | Shape Score — the ring hero + the ladder, captured on a REAL account (the tier is whatever it is). | Push into the screen; *Pick your light* flips light → midnight on the downbeat; the world goes black → **D**. |
| 22–24 | 0:39.4–0:45.0 | A rooftop at night, the phone flat on a parapet, the only light on her face the screen on midnight paper. *How are you today* — one tap; the Habit Ledger, To do then To don't. *Small things, daily.* Same clip, same phone: the profile, CLIMB. | A South Asian woman of 47, a coat over pyjamas, a mug. The stillest person in the film. | Check-in (`BSMoodSheet`) → Habit Ledger (`BSHabitGrid`) → Terrain profile, CLIMB — one capture segment. | Continuous — no cut; the push resumes toward the phone until the ridge fills the frame → **A**. |
| 25–26 | 0:45.0–0:48.8 | Full frame: the Terrain ridge, its heat path, the avatar two-thirds up, the summit flag. *A profile that climbs with you.* | The rooftop phone, then nobody. | Terrain (`BSTerrainProfile`, CLIMB), full frame from the scale-3 capture. | The ridge's silhouette dissolves into the curve of the night Earth → **E** (ridge-to-limb). |
| 27–28 | 0:48.8–0:52.5 | The Americas at night; on each kick a beam rises and a ▸◂ mark pops at its tip. No numbers, no names, no count. | Everyone, and no one on camera. | No UI — the existing globe (`135d629d`, night-window remap) and `mk_globe.py`'s 44 marks. | The marks slide along the limb into one; the globe contracts into the mark → **E**. |
| 29–30 | 0:52.5–0:56.3 | Black. ▸◂ pulses once on the kick; the wordmark sets itself; the hairline draws one last time as the rule beneath it. *Different goals. One Community.* · ONE PLATFORM FEE · $5 /MO · CANCEL ANY TIME. The music cuts dead on the wordmark; twelve frames of silence. | No one. | Drawn end card (`build-endcard.sh`'s wordmark ink crop). | The last frame's rule matches the first frame's line, so an autoplay loops. |

## 4 · The shot prompts

`minimax_h3` is the only video model this account exposes (10 s, 2K, 1440×2560, every submission bills), it
carries **no negative-prompt field** — every exclusion below is phrased positively — and a preset recommendation
can intercept a submission and create no job (decline it with `declined_preset_id`). Six new clips; the runner
and the globe are reused.

**Master style block** (the head of every prompt):

> Vertical 9:16, photoreal, cinematic. Locked-off camera, no camera movement at all, shallow depth of field, fine
> film grain, near-black shadows, muted natural colour with one small teal object somewhere in the frame. A
> matte-black phone is perfectly still for the whole shot, its screen a blank dark glass panel with a soft even
> glow and nothing on it. The person never looks at the camera and never performs for it. No text, no logos, no
> on-screen graphics, no watch.

| Shot | Prompt (after the style block) |
|---|---|
| 1 · Dawn bedroom | A small bedroom before dawn, blue-grey window light, one warm bedside lamp. The phone lies face-up on a wooden nightstand, centred in the lower half of the frame, its glass a soft even glow. A Black woman in her thirties in a grey sleep shirt sits up in the bed behind it, soft focus, reaching toward the phone. The nightstand's front edge runs straight across the frame. |
| 2 · Garage gym | A home garage gym at first light: rubber flooring, one bare tungsten bulb, a roller door open a hand's width onto blue dawn, a teal towel over a bar. The phone leans against a black kettlebell on the floor, centred, its glass a soft even glow. Behind it, defocused, a white man in his forties in a faded sweatshirt chalks his hands and lifts, seen from the waist down and from behind. Low camera at floor level. |
| 3 · Kitchen | A narrow home kitchen at morning, warm under-cabinet light, steam rising from two pans. The phone stands propped against a glass jar on the counter, centred, its dark glass still. In the foreground a Latino man in his thirties with a cloth over one shoulder works over a board; at the edge of frame a small child's hand rests on a bowl. The counter's front edge runs straight across the lower third. |
| 4 · The coach | Inside a tram at rush hour, morning, rain on the windows, soft grey light. A Japanese woman in her twenties in a rain jacket with one earbud sits with the phone held still in her lap at reading distance, its dark glass filling the lower centre of the frame; her hands frame it, her face soft above. A horizontal rail crosses the frame behind her. |
| 5 · Noon bench | A park bench at noon, hard sunlight and hard shadow, a folded newspaper on the slats. A Black man in his sixties in a cardigan and reading glasses holds the phone still at reading distance, its dark glass centred; his hands and the phone are sharp, the trees behind are soft. The bench's back rail runs straight across the frame. |
| 6 · Rooftop night | A city rooftop at night, the skyline soft and far, one low parapet wall in the foreground. The phone lies flat on the parapet, centred, its glass a soft even glow — the only light on the face of a South Asian woman in her forties in a coat over pyjamas, holding a mug, leaning on the wall beside it. The parapet's top edge runs straight across the lower third. |

Casting is the owner's call (the runner's casting took four rounds); the six descriptions above are placeholders
in the register the approved runner prompt used, and each is one adjective phrase to change.

## 5 · Real UI to capture

All captures come from the production `/m/` build through the existing CDP screenshot loop (`pw/lib.js` boot ·
`go()` · `scroll()` · `tab()`), 750×1640 at scale 2 for propped-phone moments and **scale 3 (1125×2460)** for
the four full-frame moments (the cold open, the Train deck, the ridge, the paper flip). Every segment records
its act timestamps so the cut points are data.

| Shot | App screen | Capture | Honesty note |
|---|---|---|---|
| 1–2 | Home cold load → slate row TRAIN → Train deck | new segment: `boot`, browser clock set to 05:58, hold 4 s on the masthead, `go('TRAIN')` | The persona row stays below the fold: no demo-cast text in the opening frame. |
| 3 | Live session player → set logged → month calendar | the TRAIN spot's `session` · `logged` · `calendar` segments | Already proven, cut on a beat before. |
| 4 | Prep session (mise stage) → photo + voice memo → send | **new part F** in `body5b.js`: tick two dishes, *Merge the mise*, scroll to *How should these be timed?* — confirm *Cook at the same time* is LIVE (it is disabled on ~50 % of pairs); then `BSLogMealFlow` Photo + Voice tabs | The caption is the code's own line; never *ready together*, never *soonest*. The Voice tab needs Chromium's fake media device flags; if it will not record, send photo + note and lose the pill. |
| 5 | Coach app: Today dateline (07:41) → thread: incoming memo + photo → reply | **new**: a second Playwright context signed into a COACH account linked to the member account, clock 07:41 | This is the one place a person's name appears on screen. Default: a real two-account rig on the owner's accounts, so the demo cast never appears (the ruling on the preview cast is still open). |
| 7 | Shape Score ring + ladder → Settings *Pick your light* → midnight | the SCORE spot's `tier`/`ladder` segment + **new**: `go('Pick your light')`, pick MIDNIGHT | Captured on a real account; the tier is whatever it is. Real data on a generated character's phone is honest only while the film claims nothing about him: no name, no caption tying the number to the man. |
| 8–9 | Check-in → Habit Ledger → profile → CLIMB | the SCORE spot's `signals`/`climb` segments on midnight paper, one continuous segment | — |
| 6 | (no capture) the two-orb card | `mk_orb6.py` on this film's grid; `BPM` read from `meas_<track>.json` | The only digit that is a measurement is BPM; the HRM climb is the approved illustrative depiction. IN SYNC appears once. No Radio screen, no ON AIR, no LIVE, no *tune in now*. |
| 10 | (no capture) the globe | `135d629d` through the night-window remap, `mk_globe.py` | 44 marks, no count, no names, no city. |

## 6 · The cast

Seven people and no faces to camera: the riser, the lifter, the father and a child's hand, the trainer, the
runner (already cast, `878ea5a1`), the reader, the night one. Two of the seven are coaches, so every room after
the first implies a second person — the coach who wrote the session, the one who answers the memo — which is the
sibling brief's rule made structural: no one in this film is alone. Wardrobe is plain and dark with one teal
thing per room. Generated hands mid-use are the classic fake tell: the kitchen (hands, steam, a child) is the
likeliest shot to burn both takes; if it does, lose the child's hand rather than accept a bad one.

## 7 · Music

One new `sonilo_music` generation (`duration: 60`, the required param), prompted plainly: *deep house, 120 BPM, a
kick from bar one, continuous, no intro, no breakdown, warm round sub, soft closed hats, one four-note melodic
motif on a muted analog chord returning every eight bars, dry and unhurried.* ⚠ A prompted tempo is a request:
six of seven house tracks landed at ~128 whatever was asked. The track is **measured** with `beat.py` (comb search
110–190, split-half agreement, per-beat residuals), `kick_by_beat` is stored for EVERY beat, and the film is
planned in bars from that grid. The drop is built in post, not prompted: bar 17 is a high-passed copy of itself
(`highpass=f=200`, crossfaded 3 frames each side) so nothing pulses under the two orbs, and the bar-18 downbeat is
the kick coming back on the frame they touch. The opening is held back the same way: a low-pass sweep from ~350 Hz
at frame 0 (`asendcmd` on `lowpass`) — the kick heard through a wall, which is what lets a cold open start ON a kick
and still feel held — opening to full band on the measured lock beat, so the drop and the merge are one event. The
music cuts dead on the wordmark. If the prompt buys a breakdown
or a late first kick, the take is regenerated: the opening line draws on the first kick.

## 8 · On-screen copy (eight lines, no voice)

| Bar | Line | Source |
|---|---|---|
| 5 | Written before *you arrive.* | house |
| 11 | Two dishes, *one timeline.* | the planner's own words |
| 15 | A person. *Not an algorithm.* | the sibling brief — **wants the owner's eye** |
| 21 | One number that tells *the truth.* | house |
| 23 | Small things, *daily.* | house |
| 25 | A profile that *climbs* with you. | house |
| 29 | Different goals. *One Community.* | house close |
| 29 | ONE PLATFORM FEE · $5 /MO · CANCEL ANY TIME | house close |

Set by `captions.py` (Newsreader with the accent in italic teal, JetBrains Mono eyebrows), 0.18 s fades. The
only Radio words in the film are the card's two labels and **IN SYNC**, once.

## 9 · Format and the 30 s cutdown

**9:16, 1440×2560, 24 fps** — the pipeline's native frame, the phone's own shape, and the frame in which a
full-frame page reads largest. A 16:9 version is a different film: every backdrop a new generation, every rect a
new measurement, none of the existing assets reusable (recorded here so it is decided before a submission, not
after).

**The 30 s cutdown = 16 bars**, re-derived on the measured grid: the cold open (2 bars, the line draws, the phone,
05:58) → zoom-through straight to the garage (2: the ▶, the set logs) → line-match to the kitchen (2: the timing
block, the send) → whip to the coach (2: the same dateline on the other phone, the reply) → line-wipe to the lock
(4: the drop on the bar-11 downbeat) → iris to the Score ring (1) → ridge-to-limb into the globe (2) → the mark
(1). The lock and the mark are non-negotiable.

## 10 · Cost and schedule

| Stage | What | Bills |
|---|---|---|
| Style frames (next) | 6 stills, one per room, 9:16 2K, the master block as an image prompt — the owner approves the LOOK before a clip exists | 6 image generations |
| Clips | 6 rooms × 2 takes (a take with a moving phone or camera is a reject) | ~12 `minimax_h3` submissions |
| Music | 1–2 tracks, measured | 1–2 `sonilo_music` |
| Captures | one sandbox lease (~5 min) for the seven segments, uploaded immediately | — |
| Renders | one lease per third of the film (the Radio cut's two-stage runner pattern), verify re-derived on the render | — |

Every generation goes into a Sources table with its job id, filename, verbatim prompt and params before it is
fetched — the v6 video prompts were lost exactly that way.

## 11 · Open questions for the owner (each with the default I will use)

1. **The coach-thread rig.** A real two-account capture on your own member + coach accounts (default), or the
   signed-out preview with its demo cast? The default keeps the open demo-cast ruling out of this film entirely.
2. **The one new line.** *A person. Not an algorithm.* is from the sibling brief and is the only line not already
   house copy. Default: keep it. Its alternative is silence over the coach.
3. **The lights-out arc.** The film starts on light paper and ends on midnight, flipped by the real picker at
   noon (default yes). If the film should stay on one paper, mechanism D becomes a plain push and the rooftop is
   lit by the screen on light paper.
4. **Casting.** Six placeholder descriptions in §4, one phrase each to change. The runner is already yours.
5. **Whose numbers.** The Score, ledger and Terrain captures come from a real account (default: yours, the tier
   whatever it is on the day). A generated character carries them without a name or a caption tying them to him.
6. **The close.** The mark on black with the wordmark and the fee line (default), or the Apple-literal close the
   third judge singled out: three real pages alive on three phones in a row on white — Home, the Train deck, the
   ridge — with *Different goals. One Community.* rising and a synchronous card-flip to the mark on the last
   downbeat. It is the more Apple of the two and the only moment the film would leave midnight paper.

## 12 · The two alternates, in five lines each

**"The Pass" (one continuous dolly).** One camera glides left to right through seven adjoining rooms and never
stops; the only way from each room to the next is through somebody's glass. The truest one-shot spine on paper,
and the best drop idea (grafted above). It needs per-frame screen tracking that the pipeline does not have, so
every phone would have to be prompted still while the camera moves — the build judge scored it lowest of the
three finalists for that reason.

**"The Push — Pick Your Light" (Apple-literal).** A seamless white cyclorama, one forward vector, hands and
phones as hero objects, a body crossing the lens as the wipe, the studio's paper flipping light → midnight with the
app's own switch, and three phones in a row on white reading *Different goals. One Community.* It answers the
verbatim ask most literally and reuses the most existing assets; the build judge scored its white-cyc composites
(screen-blend over white is impossible; every phone needs an opaque overlay) as the least proven path. Its
lights-out is grafted above.
