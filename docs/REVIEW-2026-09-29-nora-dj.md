# Nora as a DJ: review, preview and plan (2026-09-29)

**Owner asks:**
- *"need to review nora as a dj capabilities. Are we able to improve the look of her. make her look less avatar and have her actually look like she is djing with panamarmic camera angle changing and views of the turntables with her mixing songs when the song is changing. The mixer and turntables should look like the pioneer CDJs 3000"*
- *"what can we built to make nora (dj) as fluid and interactive as possible with shape radio"*
- On direction, the same day: *"make sure the club is club shape"*; *"we already have some audio made. nora will be matching what is playing on shape radio"*; *"yes the higgsfield tracks"*; *"you can keep it on next track"*.

**Preview:** a working prototype, "Nora's Booth". The link is added here once it is published. It is
not in the repo yet: it was built in the session scratchpad so the design could be judged before any
of it is committed.

**Status:** records only. This commit contains no code change, no migration and no PR. §3 is the
plan. §6 lists the rulings the plan needs before a build.

**How the plan was made.** Five readers mapped Nora as she exists today, and a completeness critic
checked the map. Every `path:line` below comes from that map. Three architects then each wrote a
full plan from one angle: realism and performance, interactivity and social, and truth, sync and
engineering. The judging and synthesis stages were **stopped by the owner** (*"is this necessary?"*
→ no). The merge in §3 was done by hand from the three plans.

## 1. What Nora is today (read from the code)

- **She is a stock sample character.** `public/nora/placeholder.vrm` is pixiv's
  `VRM1_Constraint_Twist_Sample`. It is 10,776,032 bytes and has 36,470 triangles, 13 MToon
  materials, 54 humanoid bones (all 30 finger bones included), 18 expression presets and no
  animations.
  - ⚠ Its embedded licence is **VRM Public License 1.0**, not the "CC0 sample" the Phase-A plan and
    handoff record
    (`docs/superpowers/plans/2026-06-19-shape-radio-nora-avatar-phase-A.md:19`,
    `docs/HANDOFF-2026-06-19-shape-radio-nora-dj.md:19`).
  - That licence permits corporate use and modification, but she is still a third-party sample.
- **She touches nothing.**
  - `noraStage.mjs:114-134` drives exactly four bones (head pitch, spine roll, both upper arms) and
    two expressions.
  - Her arms sit near the T-pose rest.
  - `handBounce` is computed and never applied (`noraReactive.mjs:38`).
  - The motion follows **loudness, not the beat**: energy mapping plus wall-clock sines
    (`noraReactive.mjs:28-42`), with no onset, tempo or phase input.
- **There is no booth.**
  - The scene holds two lights and the VRM (`noraStage.mjs:32-37`). It has no decks, mixer, floor
    or room.
  - One fixed camera never moves (`:33-34`).
  - The canvas is transparent over a CSS backdrop.
  - The 09-15 dot-hologram look (`noraHologram.mjs`) changed her surface and nothing else, which is
    why the owner asked again.
- **She cannot know a song is changing.**
  - Now-playing carries only `{title, artist, isNora}`: no duration, start time or next track
    (`src/lib/radio/provider.ts:2`).
  - Both surfaces poll it every 15 s (`radioInstrument.jsx:230`, `shapeBackend.js:8788`).
  - The stage has no input for a track change, a beat grid or a camera (`noraStage.mjs:13,71-94`).
- **There is no station to follow yet.** A live query on 2026-09-29 found `radio_station` at
  `provider='mock'` with `stream_url` NULL, and `nora_sets` with 0 rows. Every member therefore gets
  an all-zero analyser, so today Nora idles for everyone.
- **The booth makes a claim it cannot back.**
  - The app renders `● LIVE · NORA (preview)` whenever Nora is shown, whether or not anything is
    broadcasting (`iosAppBroadsheetRadio.jsx:2783-2785`).
  - That label is hardcoded `#2ee0c4`, marked `aria-hidden`, and leaves "NORA" untranslated.
- **She reloads every visit.**
  - Leaving the Radio tab unmounts the screen, disposes the stage and resets `noraOn`
    (`iosAppBroadsheetClient.jsx:1020-1036`), so each open re-downloads the 10.8 MB model.
  - `three` and `three-vrm` ride the app's boot import graph (`index.jsx:6`, `main.jsx:43`).
  - A failed load leaks its WebGL renderer on the app (`iosAppBroadsheetRadio.jsx:2314-2320`). The
    website already fixed that leak.

## 2. What the preview shows

The prototype answers the first ask end to end in a browser, on Club Shape.

- **The venue is Club Shape.**
  - Outside: the Shape Sets background (`mobile-app/public/club-shape-bg.jpg`).
  - Inside: the interior render (`public/newdesign/assets/club-shape-radio-bg.png`), with tiered
    balconies, the oval skylight, the Shape-triangle portal and the LED wall behind the booth.
- **The gear is two flagship-class media players and a four-channel mixer.** Their real
  proportions come from the CDJ-3000 / DJM-A9 industrial design, and the gear carries **no maker or
  model words**. The screens show a three-band waveform, a beat grid, BPM, and elapsed/remaining
  time.
- **Nora's hands work the gear.**
  - Analytic two-bone IK places her palms on the jogs, faders, EQ knobs, hot-cue pads, play/cue and
    the browse knob.
  - A headphone lift to the ear on the cue.
  - A beat-locked groove underneath.
- **The mix is choreographed on the bar grid** (`noraMix`): load → cue (headphone pre-listen) →
  blend in on the incoming fader → swap the lows → fade the outgoing channel → the new deck is live.
  The faders and knobs move with her hands.
- **The camera cuts on bar lines.**
  - Shots: an establishing Club Shape wide, panorama, overhead, jog and mixer close-ups, deck
    screen, over-the-shoulder, profile, crane and face.
  - The mix's phases cue the transition sequence.
  - A member can lock a shot or drag to look around.
- **The audio is Shape's own.**
  - The preview plays **the owned Higgsfield tracks** (`marketing/shape-radio-launch-cut.md`,
    Sources). Each track is analysed in the browser for tempo, downbeat and mix points, and blended
    at those measured points.
  - If the tracks cannot load, it falls back to a synthesized example set.
  - Both states are labelled **"Preview"**, and the tempo reads "—" until it is measured.
- **"Next track ⇄" stays, deliberately.** In the preview it skips between Shape's own tracks. It
  must **never** appear on the licensed station (§5).

## 3. The plan: what to build

### Phase 1 · The booth (the owner's first ask; the prototype exists)

| Item | What | Cost | Files |
|---|---|---|---|
| Honest booth label | Replace the unconditional `● LIVE · NORA (preview)` with one pure state function. It returns one of: **Off air** · **Preview · example set** · **Visualised mix** · **Nora's mix** · **Guest set · {dj}** · **No beat to follow**. Keyed, 13 locales. | S | `iosAppBroadsheetRadio.jsx:2783`, `radio.jsx`, new `noraBoothState.mjs`, locales |
| Gear | Move `cdj3000.mjs` and `djmMixer.mjs` in from the prototype. One draw call per LED set; about 13 and 8 draw calls. | M | `public/newdesign/` |
| Club Shape venue | The prototype's venue and stage, with a `quality:'low'` tier that halves the beams and crowd. | L | `public/newdesign/club*.mjs` |
| Performer + choreography + director | IK performer, `noraMix` choreography, and a bar-cut director with a portrait-first framing solver. | L | `noraPerformer.mjs`, `noraMix.mjs`, `noraDirector.mjs` |
| A booth that stays loaded | A persistent host so the model is not re-downloaded on every tab switch; `three` lazy-loaded out of the boot chunk; a WebGL2 check (three r163+ throws on WebGL1); the app's failed-load leak fixed. | M | `noraStage.mjs`, `iosAppBroadsheetRadio.jsx:3,2303-2323` |
| Frame pacing | Replace the threshold cap, which lands at 20–25 fps with judder (`noraStage.mjs:10`), with a display-Hz divider. Phones default to 30 fps and the low tier. Pause when hidden. Honour reduced motion. | M | `noraStage.mjs`, new `noraFrame.mjs` |
| Photosafety | A flash governor fed by measured frame luminance (WCAG 2.3.1). **No strobes in v1.** | M | new `noraFlash.mjs` |
| Example-set preview | The prototype, labelled, playing Shape's own tracks. | M | `deckAudio.mjs`, `trackAnalysis.mjs` |

**Exit:** on a mid-range phone, the booth holds 30 fps; it survives a tab round trip without a
reload; and every label and number it shows is either measured or labelled.

### Phase 2 · Nora follows what is actually playing

Details are in §4. These are the modules:

| Item | Cost | Files |
|---|---|---|
| **One confirmed track-change rule.** A null, failed or simulated poll never fires a mix. Mobile has no song-change event today (it only reloads reactions). | S | new `radioTrackChange.mjs` (shared) |
| **One heard-time clock.** The existing tempo detector, unchanged, mapped to the moment the sound leaves the speaker. A phase-locked loop follows it, and it releases (goes null) when the detector does. **The grid never free-runs**: the prototype club's own free-running beat is removed. | M | new `radioClock.mjs`, `noraBeat.mjs` |
| **Audio boundary locator.** A 40 s ring of analyser frames finds where the change was actually heard (a kick drop-out and return, novelty, tempo re-settle) and classifies it as a cut, crossfade or blend. | M | new `radioBoundary.mjs` |
| **Tiered sync planner** over `noraMix`. The evidence tier decides both what Nora may do and what the label says. | L | new `noraSync.mjs` |
| **Honest deck screens.** The waveform is the measured history, drawn only to the left of the playhead: a real player draws the future, and we do not have it. The title is revealed only when the listener hears the change. | M | gear screen model |

**Needs a real station.** Everything in Phase 2 is built and tested against owned audio. It only
goes live once a provider is signed, and that provider **must send CORS headers**, or the analyser
reads zeros.

### Phase 3 · Precision as the provider allows

Each item needs the provider to offer something, so the provider selection checklist is §6.

| Item | Cost | Files |
|---|---|---|
| Pass through the provider's start time and duration. Nora can then prepare the blend before the outro instead of after it. | M | `now-playing.mjs` normalizer, `/api/radio/now-playing` |
| Stream-lag calibration, learned from each located change. | M | new `radioHeardClock.mjs` |
| HLS timed metadata (ID3 and program date time) where the stream is HLS. | L | player |
| **Cue-sheet replay.** The station's mixing engine publishes each transition (start, length, EQ and fader curves), and Nora replays the real mix, verified against the audio. **Only this tier may be labelled "Nora's mix".** | XL | station engine + `noraSync.mjs` |

### Phase 4 · She reads as a person, not an avatar

| Item | Cost |
|---|---|
| **A beat-locked mocap repertoire.** About 18 loopable 2–4-bar clips (grooves, breakdown float, build, drop), retimed to the measured beat and layered under the IK. Recommended source: an owned capture of a real house DJ. | XL |
| **Hand poses authored against the gear.** A flat palm on the jog, fingertips on a fader, a pinch on a knob. These replace the single finger-curl value. | M |
| **Eyes, face and breath.** Saccades to the screen or control her hand is heading for, a glance at the crowd on drops, and a head that follows the eyes. | S |
| **A commissioned Nora.** A stylized-realistic VRM of the concierge likeness (`nora-avatar.png`) in DJ wardrobe with her hair tied back. Budget ≤ 50k triangles, ≤ 8 materials, and visemes for lip-sync. | XL |
| **A texture-only asset pipeline.** KTX2 textures and meshopt, keeping the VRM intact: 10.8 MB → ≤ 3 MB. | M |
| **Theatre mode.** A full-screen, landscape-capable booth, offered but not auto-opened. | M |

### Phase 5 · Interactive

| Item | What | Cost |
|---|---|---|
| **Direct the camera** | Auto, lock a shot, or look around. This is already in the preview. | S |
| **Nora answers what you do** | Your vote, your save or your comment gets a gesture on the next downbeat, **on your device only**. | M |
| **Your heart rate** | Reuses the Signal Field's matching state. It **never leaves the device**. | S |
| **Ask Nora while she plays** | Voice chat in the booth, e.g. "what is this track?". The stream is ducked on your device only. A read-only `get_radio_now` tool answers from the current recording. | L |
| **The Wall on the LED wall** | New records scroll across the club's dot wall. It reads the public `shape_pr_wall` projection, which respects the leaderboard opt-out. | M |
| **Room reactions** | Anonymous ♡ ↑ ✦ glyphs over a private broadcast topic. **Never a number.** | L |
| **Shape Sets hosts** | Add `nora_sets.host_kind` (`nora` or `guest`, defaulting to `guest`). Nora is never drawn mixing a human DJ's set, and there is **never a 3D stand-in for a real guest**. | M |
| **Pre-rendered idents** | Ops-authored Nora lines, synthesized once. | M |
| **Nora-cam on Home** | Opt-in and off by default: a small low-tier booth on the now-playing card. | L |
| **Share** | Stills through the existing share-card pipeline, with no track title by default. | M |

## 4. How Nora follows a song change

The listener hears a change at *T<sub>server</sub> + L*, where L is the stream lag (encoder, CDN,
buffer and speaker). The metadata arrives at *T<sub>server</sub> +* the poll delay, which is 0–15 s
plus the round trip. So the title can arrive **before** the listener hears the change (usual for
HLS, whose lag runs to tens of seconds) or **after** it (usual for a low-lag Icecast stream).
**Nora's blend has to land on the heard change, not on the poll.**

1. **Off air, mock or simulated.** No mix ever fires. The booth reads **Off air** and Nora idles. The
   only mix anyone sees is the labelled example set.
2. **Today's payload plus the audio (Phase 2).** A confirmed title change opens a window. Then:
   - **If the change has already been heard** (the audio shows the boundary), she plays a short
     2–4-bar handover shaped by the kind of transition.
   - **If the title arrived early**, she does only the silent prep: load, cue and the headphone
     pre-listen. These are inaudible in any real booth, so they claim nothing. The cued deck reads
     **CUED** with no title, and she blends when the boundary is heard, at most one detection
     latency late.
   - Each located boundary narrows the lag estimate, so early metadata gradually becomes real lead
     time.
   - The label reads **Visualised mix**.
3. **With provider timing (Phase 3).** Once the lag is known to within a second, she plans ahead
   and starts the blend on the incoming track's first downbeat.
4. **With a cue sheet (Phase 3, end state).** She replays the station's actual transition. This is
   the only tier labelled **Nora's mix**.

At every tier the beat comes from the measured detector. During a breakdown, a tempo change or an
unaligned crossfade (two kick grids, so the detector reads null exactly while the mix happens), the
beat lock releases. She then sways on energy only, and gestures run in seconds rather than bars.

## 5. What must not be built

- **Nothing that chooses, cues, skips, replays or requests on the licensed stream.** Doing so voids
  the §114 non-interactive licence (`iosAppBroadsheetRadio.jsx:27-46`).
  - "Next track ⇄" lives only in the preview on Shape's own tracks.
  - Voice chat never gets a "play X" path.
  - There is no request field and no "this one's for you".
- **No title before the listener hears it.** With a lagging stream, showing the title when it
  arrives would announce a recording ahead of air to that listener.
- **No listener count, and no Radio presence strip.** The crowd is fixed set dressing. It does not
  scale with anything and carries no tally.
- **No tempo, number or waveform that was not measured.** Show "—" instead.
- **No strobes in v1.** On the station, the listener "Hype" control becomes a non-musical reaction
  with no strobe and no mixer FX. In the preview, on Shape's own tracks, it lifts the room for two
  bars, and nothing in the room flashes faster than the beat.
- **No maker or model words** ("Pioneer", "CDJ", "DJM", "rekordbox") on the gear or in the product.
- **Heart rate stays on the device.**

## 6. Owner rulings needed

1. **Who is "at the decks" during automated rotation?**
   - Recommended: Nora performs the station's automated crossfades, labelled **"Visualised mix"**,
     and makes no first-person claims ("I picked this").
   - **"Nora's mix"** is reserved for a verified cue sheet on a published Nora set.
   - During a human Shape Set she steps off the decks.
2. **Commission a real Nora**, a stylized-realistic concierge likeness in DJ wardrobe (an outside
   quote is needed; likely thousands of USD, not verified). The alternative is to keep the sample
   and shoot around her face.
3. **Gear likeness.** Should it read as flagship club gear with deliberate Shape departures, or be a
   close replica? A faithful industrial design without logos may still be protected, so counsel
   should look. Also confirm **media players, not the vinyl turntables** picked for the SVG booth on
   07-14.
4. **Who hears the example set?** Recommended:
   - Signed-out prospects: always.
   - Members: only while the station is not configured.
   - Nobody: while station audio is playing.
5. **Crowd.** Fixed silhouettes as set dressing (recommended), or a darker room with no crowd.
6. **Default look.** The realistic "Performer" (the preview), with the 09-15 dot hologram kept as a
   selectable look, or the reverse. The screen-space dots crawl under a moving camera
   (`noraHologram.mjs:93,130`), so they would need rework if they stay the default.
7. **Phone defaults.** 30 fps and the low tier on phones (battery first), or looks first.
8. **Provider selection checklist**, in addition to CORS:
   - HLS with program date time and timed ID3;
   - a now-playing API with start time and duration;
   - a song-change webhook;
   - an engine that can emit per-transition cues (e.g. Liquidsoap / AzuraCast);
   - no contractual need to expose the next track to clients.
9. **Counsel.**
   - Does a visual performance synchronized to §114-licensed recordings, including waveforms
     measured from them, fall within the non-interactive licence?
   - Are timing-only cues ahead of air (with no title) acceptable?
   - How do pre-rendered Nora sets interact with the archived, looped and pre-announced programme
     conditions?
10. **Records correction.** The placeholder is VRM Public License 1.0 from pixiv, not CC0. Correct
    the Phase-A plan and handoff.

## 7. Next up (registered, not started)

**Nora as the account-setup assistant.** Owner: *"I also want to make Nora pop up when you are
going through creating an account, that can fill evreything out for you, regading application etc.
and also setup your account for you. Maybe save this for the next task"*. Recorded in
`docs/WORKLOG.md` under Next up.
