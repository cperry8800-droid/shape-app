# Shape Radio — shoot-ready scripts, capture kit, and the first 30 days

Status: DRAFT for the owner · 2026-08-31. The companion to
`marketing/social-brand-awareness-plan.md`, which holds the strategy — this file
holds the words you say, the shots you take, and the order you post them.

Read the strategy doc's **licensing guardrail** first. It governs every frame
here: no commercial music baked into brand video, ever. Idents + Nora's voice +
link-outs.

---

## ⚠ Capture rules — the honesty constraints, verified against the app

These are not style notes. Each one is a fact about what the app does today, and
breaking one puts a false claim on camera. The whole brand rests on the
honest-data doctrine; a marketing video that overstates the product is the same
lie in a different medium.

**1 · The HR card compares your pulse to the STATION's tempo — it does not
re-cut the music to your heart rate.** `iosAppBroadsheetRadio.jsx` labels the
target **Station BPM** in as many words, precisely because the now-playing
payload carries no per-track BPM. So the honest line is *"your heart rate,
against the station's tempo"* — never *"the music matches your heart rate."*

**2 · Film the HR demo on the INSTALLED app with a real strap paired — and prove
it on camera.** `connectMonitor()` falls back to a **demo 114 bpm** when
Bluetooth is unavailable or you cancel the picker, and the card still says
connected. That fallback would read as a real reading and be fabricated. Two
tells are visible in-frame, and **use the second one** — the status chip reads
**"Live"** instead of **"Free"** on a genuine reading, but only while the card
sits at that stage; the moment you start matching it reads "Matching…" / "In
sync" for demo and live alike. The label **above the HR number** is the one that
persists: it reads **"You · live"** on a real device reading and bare **"You"**
on the demo, at every stage. **If the readout does not say "You · live", the
take is unusable** — and that is exactly the frame the money shot lives in. (`hrm.js` needs the native plugin on an
installed build, or Web Bluetooth in desktop Chrome — the `/m/` web build on an
iPhone cannot do it.)

**3 · The beat-matching ease is demo-only, and that makes the real demo
better.** A live reading always wins; the app never eases a real number toward
the target. So on camera the number climbs because **you** climb — jog on the
spot, watch it rise, land on "In sync". That is a real physiological moment, not
an animation.

**4 · The station is not broadcasting yet, and the app refuses to claim it is.**
`station().configured` is false on the mock provider, so the LIVE banner and the
tune CTA do not render — a Shape Sets card reads *"On the schedule now —
broadcast coming soon."* **Never film a "tune in now" CTA.** Frame every Shape
Sets beat as *"first broadcast lands when we do."* The app under-claims here;
the marketing must too.

**5 · No demo data presented as a live member.** Signed-out preview is where the
demo cast lives, and it is labelled in-app. If a shot shows the roster, the
feed, or another member's numbers, it must be a real account or it must not
ship.

**6 · Nora's voice is the app's own TTS.** Record her lines through the shipped
voice (`sage`, fitness-instructor style) rather than a soundalike, so the
character on camera is the character in the product.

---

## The kit (one afternoon, ~$60)

| Item | Why | Note |
| --- | --- | --- |
| Phone + tripod | Every shot | Lock exposure; 4K/30 or 1080/60 |
| Lav or USB mic | Voice carries the station | Phone mic is the one thing viewers won't forgive |
| Red practice lamp / small red bulb | The ON AIR lamp — the recurring visual anchor | ~$15; it appears in every station segment |
| A mic that LOOKS like a radio mic | Set dressing, not audio | Thrift/second-hand is fine |
| Heart-rate strap | Rule 2 above | Must pair to the installed app |
| CapCut (free) | Captions, hard cuts, ident sting | Burn captions — most watch muted |

**App footage recipe** (from the WORKLOG's own screenshot pipeline): run the
installed app, or the production `/m/` build in a desktop browser at a phone
viewport — 375×867 @2 for stills. Walk the paywall Preview → radio prompt gates
per boot, and **dismiss the PREVIEW · DEMO DATA banner before rolling** unless
the banner is the point of the shot. For screen recording, prefer the installed
app so the chrome reads native.

---

## Recurring segment templates

Write these once, run them forever. A template is what makes daily posting
survivable.

### The Morning Dispatch · daily · 15–25s
```
[Red lamp flicks on. Mic in frame. 1s beat.]
NORA (VO):   You're on Shape Radio. Today's dispatch.
[Cut to app — the day's directive on screen. Telegram type over.]
NORA (VO):   One move: {the directive, read verbatim}.
             Everything else is noise until that's done.
[Cut to lamp. Ident sting.]
NORA (VO):   That's the dispatch.
ON SCREEN:   ONE MOVE · TODAY
CAPTION:     Today's dispatch. One move. #ShapeRadio
```
Rule: **read the app's real directive** for that day. Inventing one to fit a
punchier line is the fabrication rule broken for a caption.

### The Request Line · 2×/week · 20–30s
```
[Lamp on.]
YOU:         Request line's open. What's the song that gets you under the bar?
[Beat. Answer your own — name it, say why, one sentence.]
YOU:         Best answers go on air Friday.
ON SCREEN:   REQUEST LINE · DROP IT BELOW
CAPTION:     Request line. What gets you under the bar? #ShapeRadio
```
Friday's payoff video reads the handles out loud. Credit is the whole mechanic —
people come back for their name.

### The Sign-off · nightly · 8–12s
```
[Dim room. Lamp on. Very short.]
NORA (VO):   That's the broadcast. Log it.
ON SCREEN:   — SHAPE RADIO
CAPTION:     Log it. #ShapeRadio
```
The point is **repetition**, not content. Same frame, same words, every night.
This is the memory mechanism; it costs 90 seconds to make.

### Guest DJ · Coach Residency · weekly · 30–45s
```
[Coach on camera, lamp behind them.]
YOU (VO):    This week's resident: {name}, {discipline}.
COACH:       {Track one} — that's the warm-up. {One coaching cue.}
COACH:       {Track two} — working sets. {One cue.}
COACH:       {Track three} — the one that finishes it. {One cue.}
YOU (VO):    Playlist's in the bio. Coach is on Shape.
CAPTION:     Resident: {name}. Three tracks, three cues. #ShapeRadio
```
Send the coach the cut. Their repost is the distribution; their audience is the
recruit pool (0% BYO).

---

## The first 12 videos, scripted

Numbering matches the strategy doc's list. Every one is one idea, hook inside
1.5 seconds, captions burned.

### 1 · "Your gym has a radio station now." · 20s · THE OPENER
```
HOOK (0.0s):  [Tight on a loaded barbell. Hand chalks up.]
YOU (VO):     Your gym has a radio station now.
(2s)          [Whip to the red lamp flicking ON.]
(3s)          [App: the radio bar. Then the Booth. Then a set in progress.]
NORA (VO):    You're on Shape Radio.
(15s)         [Back to the lamp. Hold. Ident sting.]
ON SCREEN:    SHAPE RADIO · ON AIR
CAPTION:      We built a radio station into a fitness app. Sound on.
TAGS:         #ShapeRadio #gymplaylist #fitnessapp
```
⚠ Rule 4: no "tune in now" CTA anywhere in this cut.

### 2 · "This app reads your heart rate live." · 25s · THE FLAGSHIP DEMO
```
HOOK (0.0s):  [Strap going on. Close, fast.]
YOU (VO):     This reads my actual heart rate. Watch.
(3s)          [App: Connect monitor → picker → chip flips to LIVE.]
              ⚠ HOLD ~1s. Then keep the "You · live" label above the number in
              frame for the REST of the take — that label is the proof, and
              unlike the chip it survives into Matching and In sync.
(8s)          [Jog on the spot. Number climbs: 78 … 96 … 118 …]
YOU (VO):     Station's running at {stationBpm}. I'm chasing it.
(18s)         [Card flips to IN SYNC. "You · live" still visible.]
YOU (VO):     There. In sync.
ON SCREEN:    YOUR PULSE · THE STATION'S TEMPO
CAPTION:      Live heart rate against the station tempo. No fake numbers — the
              readout says "live" or it doesn't ship.
TAGS:         #ShapeRadio #heartratetraining #fitnesstech
```
⚠ Rules 1–3. Do **not** say the music changes to match you. If the readout says
bare "You" — or the chip read "Free" before you started matching — you captured
the demo fallback. Reshoot.

### 3 · "I left a decade in finance to build a $5 fitness app." · 40s
```
HOOK (0.0s):  YOU, straight to camera: I left a decade in finance to build a
              five-dollar fitness app.
(4s)          Everyone told me the money's in charging more. It isn't. The money
              in this industry is in charging people who never show up.
(12s)         I ran marathons. I did an Ironman. And the whole time the good
              coaching sat behind a paywall most people can't clear.
(24s)         So: five dollars a month. Coaches set their own prices. And if a
              coach brings their own client, we take nothing.
(36s)         That's the whole company.
CAPTION:      Week 1. Why the price is $5. #buildinpublic
TAGS:         #buildinpublic #fitnessapp #founder
```
No app footage needed. Face + one true story.

### 4 · "Streaks are a scam." · 30s · THE DEBATE BAIT
```
HOOK (0.0s):  Streaks are a scam and I'll die on this hill.
(3s)          You train for 200 days. You miss one. The app wipes it to zero.
(9s)          That's not motivation. That's a slot machine punishing you for
              having a life.
(16s)         [App: Shape Score dipping — and NOT resetting.]
YOU (VO):     Ours dips. It doesn't reset. Because you didn't undo the 200 days.
(26s)         Fight me in the comments.
CAPTION:      Streaks punish you for having a life. Ours dips, it doesn't reset.
TAGS:         #fitnessapp #habits
```
Reply to the best objections **with video**. That's the compounding half.

### 5 · "POV: your coach DJ'd your workout." · 30s
Use the **Guest DJ template** above. First resident should be the most
camera-comfortable founding coach, not the biggest following.

### 6 · "We put a nightclub inside a fitness app." · 25s
```
HOOK (0.0s):  [The Booth, hologram up. No talking for 1.5s. Let it read.]
YOU (VO):     We put a nightclub inside a fitness app.
(4s)          [Pan the venue. The schedule.]
NORA (VO):    Residents who train. Sets that land.
(16s)         [Schedule card.]
YOU (VO):     First broadcast lands when we do.
ON SCREEN:    SHAPE SETS · COMING
CAPTION:      Shape Sets. Residents who train. #ShapeRadio
```
⚠ Rule 4 — "when we do", never "tonight".

### 7 · Request Line #1 · 25s
Use the **Request Line template**. Answer first yourself; a request line with no
first request dies.

### 8 · "Your friend is mid-set right now." · 25s
```
HOOK (0.0s):  Your friend is mid-set. Right now.
(2s)          [App: presence rail, the live dot.]
YOU (VO):     Most apps tell you after. A kudos on a workout that ended an hour
              ago does nothing.
(11s)         [Boost sheet: tap a phrase. Send.]
YOU (VO):     This lands between set two and set three.
(19s)         [Cut to a phone buzzing on a bench, mid-rack.]
CAPTION:      Cheer them while it still helps.
TAGS:         #gymmotivation #fitnessapp
```
⚠ Rule 5 — real accounts, or shoot it as two phones you own.

### 9 · "The app runs your kitchen like a head chef." · 30s
```
HOOK (0.0s):  [Two pans going. Chaos framing.]
YOU (VO):     Two recipes, one pair of hands. Most people burn something.
(4s)          [App: the NOW / HOLDING board.]
YOU (VO):     While the chicken roasts — start tomorrow's rice.
(14s)         [Timer chip counting. Hands move to the second pan.]
YOU (VO):     It's not a recipe list. It's a line cook.
CAPTION:      Cook Mode runs two dishes at once. #mealprep
TAGS:         #mealprep #cookingtips #fitnessapp
```

### 10 · "A marathon plan in 30 seconds." · 30s
```
HOOK (0.0s):  Marathon plan. Thirty seconds. No coach.
(2s)          [Builder: pick discipline → race date in → weeks resolve.]
YOU (VO):     Race date. Sixteen weeks. Done.
(18s)         [Scroll the built weeks.]
YOU (VO):     Coach optional. If you want one, they're five dollars a month
              away — and they price themselves.
CAPTION:      Built my marathon block in 30 seconds. Coach optional.
TAGS:         #marathontraining #running #fitnessapp
```

### 11 · "The feature we built to never talk about." · 35s
```
HOOK (0.0s):  We built a feature we deliberately never mention inside the app.
(4s)          If you train and you have a cycle, your capacity moves across the
              month. Most apps ignore that. The ones that don't shout about it.
(15s)         [App: the surface. Brief. Respectful. No lingering.]
YOU (VO):     Ours only ever appears where you asked for it. It never shows up
              on your home screen. It never tells your coach unless you do.
(29s)         That restraint is the feature.
CAPTION:      Cycle-aware training, with discretion as the point. Not medical
              advice.
TAGS:         #womenshealth #fitnessapp
```
⚠ Zero medical claims. Zero prescriptions. If a line feels like advice, cut it.

### 12 · The Sign-off pilot · 10s
Use the **Sign-off template**. Post it late. Watch retention — if it holds, it
becomes the nightly anchor.

---

## The 30-day calendar

Batch-film in two sessions (videos 1–6, then 7–12 plus a week of dispatches and
sign-offs). Posting order is tuned so the two strongest hooks (1, 2) land first
and the debate bait (4) lands once there's an audience to argue with.

| Day | Post | Notes |
| --- | --- | --- |
| 1 | #1 The opener | Pin it |
| 2 | Morning Dispatch | Template |
| 3 | #2 HR demo | The flagship — post at peak hours |
| 4 | Sign-off | Template |
| 5 | #3 Founder ep.1 | |
| 6 | Morning Dispatch | |
| 7 | #7 Request Line #1 | Weekend — engagement lands better |
| 8 | Sign-off | |
| 9 | #4 Streaks are a scam | Reply to objections with video all week |
| 10 | Morning Dispatch | |
| 11 | #8 Live boosts | |
| 12 | Request Line payoff | Read handles on air |
| 13 | Sign-off | |
| 14 | #6 Nightclub / Shape Sets | ⚠ "when we do" |
| 15 | **Read the data** | 3s hold >65%, completion >45%, saves + shares |
| 16 | #10 Marathon in 30s | |
| 17 | Morning Dispatch | |
| 18 | #5 Guest DJ #1 | Coach reposts |
| 19 | Sign-off | |
| 20 | #9 Cook Mode | |
| 21 | Request Line #2 | |
| 22 | #12 Sign-off pilot as a standalone | Test the format cold |
| 23 | Morning Dispatch | |
| 24 | #11 The Cycle | Careful. Read it twice before posting |
| 25 | Guest DJ #2 | |
| 26 | Founder ep.2 | What shipped, what broke |
| 27 | Sign-off | |
| 28 | Double down: reshoot the top performer in a new frame | |
| 29 | Request Line payoff | |
| 30 | **Review** | Kill the weakest format. Book 3 residencies |

**North star for 60 days: saves + shares + profile-tap → GetApp clicks.** Not
followers. The strategy doc's rule, restated here because it is the one that
gets abandoned first.

---

## Before you post any of these

- Captions burned in (most watch muted).
- 1–3 hashtags, not 30.
- Series name in-frame so formats are followable.
- **Re-read the capture rules.** Every one of them is a claim the product either
  makes honestly or doesn't make at all.
