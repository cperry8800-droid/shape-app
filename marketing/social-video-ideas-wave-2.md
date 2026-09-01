# Wave 2 — feature videos scored by Radio, + Radio-only spots

Status: DRAFT for the owner · 2026-09-01. Extends
`shape-radio-video-scripts.md` (4 recurring templates + the first 12 videos) and
`social-brand-awareness-plan.md` (the Radio-as-channel strategy). **Nothing here
repeats those 12** — this is the next batch, plus the Radio-only set.

Two halves:

- **A · Feature videos, scored by Radio** (12). Each markets a *feature*, but the
  wrapper is a radio segment — ident in, Nora's voice, station grammar on screen.
  That is how music gets into a feature video without a licensing problem.
- **B · Radio-only spots** (7). Radio is the subject, not the wrapper.

---

## The device that makes half A work

Don't bolt music onto a feature demo. **Make the feature a segment.** Radio has a
format for almost everything the app does:

| Radio format | The feature it carries |
| --- | --- |
| Traffic report | The grocery list / the week's plan |
| Dedications | A coach's playlist attached to your session |
| The prize board / caller-wins | Shape Score tiers → Store rewards |
| Request line | Nora taking a spoken instruction |
| Now playing | The share card ("now playing: your Tuesday") |
| Shortwave / international | 13 languages |
| The resident's card | The Terrain profile |
| The programming schedule | Daily habits — To do / To don't |
| The chart countdown | The Shape Score itself |

Ident in, ident out, Nora reads the link. The feature is the content; the station
is the channel. Every one of these is postable without a licensed track.

## ⚠ The constraints still bind — restated because they bind wave 2 too

1. **No commercial music in any of these.** Idents + Nora's shipped `sage` TTS +
   link-outs. Brand accounts get the restricted library; a muted video is a
   self-inflicted wound.
2. **Film HR on a real strap.** `connectMonitor()` fabricates a **114 bpm** demo
   reading with no strap and the card still says connected. The status chip reads
   *Matching… / In sync* for demo and live alike — it is blind at the money shot.
   **The tell is the readout LABEL: "You · live"**, gated on `liveHr != null`.
   Keep that label in frame or the shot is unusable.
3. **Never a "tune in now" CTA.** `public.radio_station` does not exist in
   production yet — both radio routes fall through to `provider: mock`,
   `configured: false`, and the app hides its own LIVE banner. Shape Sets is
   always *"first broadcast lands when we do."*
4. **No demo data as a live member**, and — new for wave 2 — **no song
   reaction/comment COUNTS on camera** until the stream is real. The reactions
   are a real backend, but on the mock provider they accrue on the demo track, so
   a count on screen implies an audience that isn't there. Film your own vote
   landing; don't film the tally.
5. ⚠ **Re-check the Store before filming A1.** The catalogue changed 2026-08-31 —
   five merch items were removed and Shape Merch is now the two caps; the Tempo
   drinkware reward is gone. Read `tier_reward_defs()` and shoot what's actually
   there.

---

# A · Feature videos, scored by Radio

### A1 · "You don't buy the free month. You earn it." · 25s · THE PRIZE BOARD
**Hook (1.5s):** a hand hovers over a card that reads *FREE MONTH WITH A COACH*.
```
[Lamp on. Prize-board framing — the classic radio giveaway read.]
NORA (VO):   You're on Shape Radio. Tonight's board.
[App: the Score number ticking up. Then the tier ladder.]
NORA (VO):   A cap. A coach's workout. A month with a coach. A year of Shape.
             You don't buy them. You climb to them.
[Store screen — the reward, claim state.]
ON SCREEN:   EARNED · NOT BOUGHT
```
**The line that does the work, said out loud:** *"and spending your points never
drops your tier."* Every points system on earth demotes you for redeeming; ours
doesn't. That is the argument, not the merch.

### A2 · "The shopping report." · 20s · TRAFFIC-REPORT PARODY
**Hook:** *"Heavy congestion in the pasta aisle."*
```
[Lamp. Traffic-report cadence — brisk, deadpan.]
NORA (VO):   And now the shopping report.
[App: the week's menu → the grocery list, aisle by aisle → Instacart hand-off.]
NORA (VO):   Produce: clear. Protein: four items. Dairy and cold: two.
             Your week, already written. Tap once, it's ordered.
ON SCREEN:   THE LIST WRITES ITSELF
```
Real: the list auto-builds from the week's meals, aisle-grouped, deduped, with
the Instacart send. Nothing to fake.

### A3 · "The station follows you into the kitchen." · 15s
**Hook:** the now-playing bar, still there, while a pan hits the heat.
```
[No VO for the first 8s. One continuous phone scroll:]
Home → Train → Eat → the Cook Mode board.
[The muted now-playing bar rides the bottom of every screen, never interrupted.]
NORA (VO):   Wherever you are in the app, you're still on air.
ON SCREEN:   ONE STATION · EVERY SCREEN
```
Cheap, satisfying, and the single most under-marketed shipped detail: the bar is
mounted at the app shell, so it genuinely persists.

### A4 · "Your coach picked these songs for this exact session." · 25s · DEDICATIONS
**Hook:** *"This one goes out to whoever's squatting at 6."*
```
[Lamp. Dedication cadence.]
YOU (VO):    Dedications. {Coach name} left a playlist on today's session.
[App: the workout → the coach's soundtrack attached → tap → it opens in Spotify.]
YOU (VO):    Three tracks. One cue each. Coach's pick, coach's reason.
ON SCREEN:   ATTACHED BY YOUR COACH
```
**Different from video #5** — that one is the residency promo (a coach on
camera). This is the *product*: soundtracks attached to a plan, opening out to
Spotify/Apple. The link-out IS the licensing-safe architecture; show it.

### A5 · "Now playing: your Tuesday." · 20s · THE SHARE CARD
**Hook:** a finished run → the poster assembling itself.
```
[App: a logged run. Tap share.]
[The 1080×1920 card draws: the real GPS polyline, the split, the tier colour.]
NORA (VO):   Your run. As a poster. Straight to Stories.
ON SCREEN:   YOUR RUN, AS A POSTER
```
Then teach the flex in the caption. Every member who uses it is an ad — the
Strava pattern, and it already ships (the card fires the OS share sheet as a
FILE, which is why Instagram offers Stories rather than a DM).

### A6 · "Nora, log it." · 25s · THE REQUEST LINE, FOR YOUR BODY
**Hook:** you speak; the app does it.
```
YOU:         Nora — log 500 millilitres.
[Nora's sage voice answers. A confirm card appears — preview, not a done deal.]
NORA:        500 ml of water. Want me to log it?
[Tap confirm. It lands. An Undo sits right there.]
YOU (VO):    She proposes. You confirm. You can always undo.
ON SCREEN:   SHE ASKS FIRST
```
**The differentiator to say out loud:** she never writes without a confirm, and
every action is reversible. That restraint is the selling point, same as with
The Cycle.

### A7 · "One station. Thirteen languages." · 20s · SHORTWAVE
**Hook:** the whole app flipping language mid-scroll.
```
[Shortwave tuning sound → the ident.]
NORA (VO):   Shape Radio, broadcasting in thirteen.
[App: the language picker. Pick Spanish. The entire app re-renders.]
[Fast cuts: the same screen in Portuguese, Turkish, Ukrainian, Hausa.]
ON SCREEN:   13 LANGUAGES · ONE APP
```
Genuinely rare in fitness apps, free to shoot, and it plays well outside
English-speaking feeds — which is the point.

### A8 · "This is a profile. Not a grid." · 20s · THE RESIDENT'S CARD
**Hook:** the ascent ridge drawing itself under a name.
```
[No VO. Slow scroll of the Terrain profile:]
the ridge drawing to the you-are-here point, the tier colour bleeding through
the whole page, the signals, the key lifts as dot-leaders.
[Ident out.]
ON SCREEN:   YOUR PROFILE IS A MAP
```
Design-adjacent audiences share beautiful software unprompted. Same bet as the
telegram cold-open (#12 in wave 1), different surface.

### A9 · "Rate the song while it's playing." · 15s
**Hook:** thumb hits the up-vote mid-track.
```
[App: the now-playing bar. Tap up. It lands. Open the comments on the track.]
YOU (VO):    You can rate what's playing. And say something about it.
ON SCREEN:   ON THE TRACK · NOT THE APP
```
⚠ **Film the mechanic, not the tally.** Your own vote landing is real; a count on
screen would imply listeners who don't exist yet. Reshoot with counts the week
the stream goes live — it becomes a much better video then.

### A10 · "The coach sees the week you actually had." · 25s · CROSSOVER
**Hook:** *"Weekdays: 94%. Weekends: 51%."*
```
[Lamp. Report cadence.]
YOU (VO):    Most apps show your coach an average. Averages hide weekends.
[Coach view: the variance band. Steady vs variable, named.]
YOU (VO):    Shape shows the split. That's a coaching conversation, not a number.
ON SCREEN:   THE SPLIT · NOT THE AVERAGE
```
Consumer-facing *and* the best single asset for the coach funnel — post it on
both. (Register which account it goes on once the account-strategy ruling lands.)

---

### A11 · "Today's programming." · 20s · DAILY HABITS
**Hook:** *"Not airing tonight: the doom-scroll."*
```
[Lamp. Schedule-read cadence — the station announcing its lineup.]
NORA (VO):   Today's programming on Shape Radio.
[Home: the habit rows. Check one — the "✓ +3 pts → Shape Score" chip
flashes and the finished row leaves the card.]
NORA (VO):   Morning sunlight — aired. Water — airing now.
             And not airing tonight: the doom-scroll.
[The habits page: To do / To don't, the "Earned today" card counting up.]
ON SCREEN:   CHECKED OFF · +3 BANKED
```
The **To don't** section is the joke that carries it — avoid-habits read as
*banned from the airwaves*. Every check banks +3 to the Score, and "All done —
+N pts banked" is the natural closing shot. Distinct from wave 1's #4 ("Streaks
are a scam" — the momentum philosophy); this is the daily mechanic.
⚠ Film on your own account with your real habits added (60 seconds of setup) —
the demo habit set renders signed-out only, and a fresh signed-in account shows
the honest empty state.

### A12 · "The chart show." · 25s · THE SHAPE SCORE
**Hook:** *"This week's climber: you. Up forty."*
```
[Lamp. Chart-countdown cadence — the top-40 read.]
NORA (VO):   The Shape chart. One number for everything you did this week.
[App: the Score page — the standing, then the ledger rows scrolling:
Workout +10 · Meal logged +10 · Habit +3 · Check-in +15.]
NORA (VO):   Train, it climbs. Log, it climbs. Show up all week, it compounds.
[The tier ladder — the you-dot on the line, the tier named in its colour.]
NORA (VO):   And the rank you reach? You keep it.
ON SCREEN:   ONE NUMBER · NEVER DEMOTED
```
The two honest differentiators, said out loud: **the tier never demotes** (a bad
week dents the number, not the rank), and **spending points never lowers it**
(that line already leads A1). Distinct from A1 (the prize board — what points
*buy*) and from wave 1's #4 (the streak argument) — this one is the score
itself. The ledger rows are real; scroll your own.

---

# B · Radio-only spots

### B1 · "The Booth." · 20s · THE FLAGSHIP VISUAL
**Hook:** the hologram rising behind the console. No words for 6 seconds.
```
[Phone screen, full frame. The Booth:]
the volumetric DJ, both platters spinning, the hand working the left deck,
the EQ towers behind, a glitch-slice burst, scanline banding.
NORA (VO):   You're on Shape Radio.
ON SCREEN:   THE BOOTH
```
This is the most beautiful thing in the app and it is fully shipped. Zero claims,
zero constraints, maximum share. **If you only film one Radio-only spot, film
this one.**

### B2 · "Your heart rate is the DJ." · 30s · THE ZONE CLIMB
**Hook:** the number starts moving before you do.
```
[Strap on — the label "You · live" clearly in frame, held.]
[Work. The bpm climbs. Cut on the zone changes: Z1 → Z3 → Z5.]
[The light effects escalate with the zones.]
NORA (VO):   The station reads your pulse and moves with it.
ON SCREEN:   YOU · LIVE
```
⚠ Wave 1's #2 is the *hook* demo (strap on, it locks). This is the **arc** — one
session, the whole climb. Real strap, and keep **"You · live"** in frame; the
status chip is blind here.
⚠ Say *"moves with it"*, never *"matches the song's tempo"* — the app compares
your pulse to the **station's** nominal BPM, not a per-track tempo.

### B3 · "Pick your light." · 15s · SETTINGS PORN
**Hook:** the room changing colour four times in four seconds.
```
[No VO. The fx picker:]
Off → Subtle → Immersive → Hologram. Then the colour picker:
Cycle (drifting) → Accent → and through the fixed tints.
[Ident out.]
ON SCREEN:   FOUR MODES · EIGHT COLOURS
```
Fifteen seconds, no script, extremely rewatchable, and nobody knows it exists.

### B4 · "Meet the host." · 25s · NORA
**Hook:** *"She's not a chatbot. She's the host."*
```
[Nora's render. Her sage voice, in her own register.]
NORA:        I read the dispatch. I call the sets. I'll log your water if you ask.
             I won't tell you you've failed.
YOU (VO):    Nora. She's been on air since the app shipped.
ON SCREEN:   NORA · THE VOICE OF SHAPE RADIO
```
The station has had a host for months and has never introduced her. Do it once,
properly, and every future Nora VO has a face attached.

### B5 · "Shape Sets — the countdown." · 20s · RECURRING, WEEKLY
**Hook:** the venue, empty, lights up.
```
[Club Shape: the venue, The Booth, the schedule page.]
NORA (VO):   Shape Sets. Residents who train. Sets that land.
YOU (VO):    First broadcast lands when we do.
ON SCREEN:   COMING · NOT LIVE YET
```
⚠ **The honest frame is mandatory** — the station is not broadcasting. Run it
weekly as a countdown format; the anticipation is the content, and it converts
into a real launch moment instead of a broken promise.

### B6 · "The ident." · 5s · THE DISTRIBUTION PLAY
```
[Black. The mark. Three to five seconds of the station ident.]
NORA:        You're on Shape Radio.
```
Post it as **original audio** so other creators can use it. Every borrow is free
distribution, and it costs one afternoon. This is a mechanic, not a video.

### B7 · "What a fitness app sounds like when nobody licensed anything." · 30s
**Hook:** *"We're a music brand that can't play music. Here's why that's good."*
```
[You, on camera. Straight to it.]
YOU:         Peloton got sued for three hundred million over music.
             So Shape doesn't stream anyone else's. We built our own sound —
             and every playlist opens in yours.
[App: a coach playlist → tap → Spotify.]
YOU:         Your library. Your subscription. Our station.
ON SCREEN:   YOUR MUSIC · OUR STATION
```
The constraint, told as the story. Build-in-public audiences reward exactly this,
and it pre-empts the *"why can't I play music in the app?"* comment permanently.

---

## Shooting order — one afternoon, twelve videos

The kit is already spec'd in `shape-radio-video-scripts.md` (~$60). In one
session, with the lamp set once:

1. **B1 The Booth** and **B3 Pick your light** — phone screen only, no talking.
2. **B6 The ident** — 5 seconds, done.
3. **A3 station-follows-you**, **A5 share card**, **A2 shopping report**,
   **A8 profile**, **A11 today's programming**, **A12 the chart show** — all
   screen-capture with Nora VO added after (add your real habits first; the
   demo set is signed-out only).
4. **A7 languages** — one screen capture, four language flips.
5. **B4 Meet the host** and **B7 the licensing story** — the two on-camera ones;
   film them back to back while the lamp is lit.

That leaves **B2** (needs a real training session with a strap) and **A6**
(needs a quiet room for the voice interaction) as their own shoot.

## What to post first

If wave 1's opener is already out, the strongest three from this batch:
**B1 The Booth** (visual, zero risk), **A1 the prize board** (the "earned, not
bought" line is the sharpest argument in the app), and **B7 the licensing story**
(the most stitchable). Run **B5** weekly as the countdown and **B6** once as
original audio.
