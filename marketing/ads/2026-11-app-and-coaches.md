# Two 30-second ads for Instagram and TikTok: the app, and for coaches

**Status (2026-11-16): cuts shown to the owner, none approved, nothing posted.** The owner has
not yet picked the music, and nobody has heard the cuts or seen them on a phone.

The tooling is `scripts/ads/`. The videos, the app recordings, the drawings and the music are not
in the repository: they are rebuilt from what this file lists.

## What the owner asked for

- 2026-11-16: "also lets make 30second ads on shape for instagram and tik tok" (this lifts the
  2026-10-26 hold, "Just dont do anything else with the ads now").
- Asked what the first ad is for: "do the app and for coaches".
- Of the coaches ad's second cut: "remove the 15% part and dont make it so commercial. Create cool
  images of coaches coaching, sitting at their desk and checking the app or desktop dashboard, but
  have the people be highlighted outlines. Dont use real images of people. Like a hollowed out
  image, like the background of the shape radio box on the website home page." Then: "it doesn't
  have to look exactly like that but same idea".

Still open, for the owner: whether the coaches ad's third cut is right; whether the app ad gets
the same treatment (outline drawings, the price off the end card); which music for each (A, B or
C); whether these are to post or to pay for (`marketing/social-brand-awareness-plan.md` holds that
paid ads do not pay back at $5 a month).

## The format

1080 x 1920, 30 frames a second, 900 frames, 30.000 s, H.264 with AAC sound. Cuts sit on the bars
of a 124 BPM track (one bar is 1.9355 s). No video was generated: each frame is a web page
(`scripts/ads/ad.html`) drawn for that frame and photographed.

## The app ad (`member`), third cut

| Seconds | On screen | Words | Small print |
|---|---|---|---|
| 0.00 to 1.94 | Words only | Train. Eat. Get coached. / One app for all of it. | |
| 1.94 to 5.81 | The app, Home (recording `m-home`) | Know where you stand. | App shown with sample data |
| 5.81 to 9.68 | The app, Train (`m-train`) | Today's session, ready to go. | App shown with sample data |
| 9.68 to 13.55 | The app, Eat (`m-eat`) | Every meal, planned. | App shown with sample data |
| 13.55 to 17.42 | The app, Coaches (`m-coaches`) | Add a coach. They set the price. | App shown with sample data |
| 17.42 to 21.29 | The app, Nora, a request being typed (`m-nora`) | Just ask. She makes the change. | Nora comes with the membership · App shown with sample data |
| 21.29 to 25.16 | Club Shape's main floor (`public/club/floor-p.webp`) | And a club to walk into. | Club Shape is the virtual club inside the app · Pictures made with AI |
| 25.16 to 30.00 | The logo | Free to start. / Membership is $5 a month. Cancel any time. / theshapecommunity.com | App shown with sample data. Coaches set their own prices. |

## The coaches ad (`coach`), third cut

| Seconds | On screen | Words | Small print |
|---|---|---|---|
| 0.00 to 3.87 | Drawing: a trainer coaching a squat (`squat-1`) | Coaching happens here. | |
| 3.87 to 5.81 | Drawing: a trainer timing a plank (`plank-1`) | And here. | |
| 5.81 to 7.74 | Drawing: a nutritionist and a client (`nutri-2`) | And here. | |
| 7.74 to 11.61 | Drawing: a coach at her desk, her phone lit (`deskphone-2`) | The rest happens here. | |
| 11.61 to 15.48 | The app, the coach's Today (`c-today`) | Your day, already sorted. | App shown with sample data |
| 15.48 to 18.39 | The app, the coach's Clients (`c-clients`) | See who needs you first. | App shown with sample data |
| 18.39 to 22.74 | Drawing: a coach at a desktop (`desktop-1`), the real dashboard on its monitor: Today, Clients, Programs, Week | On your phone. And your desk. | Coach dashboard shown with sample data |
| 22.74 to 25.64 | Drawing: a fist bump after the session (`fistbump-1`) | More time for this. | |
| 25.64 to 30.00 | The logo | Coach on Shape. / For trainers and nutritionists. / theshapecommunity.com | App and dashboard shown with sample data. |

## Where each claim comes from

- "Free to start", "Membership is $5 a month. Cancel any time.", "They set the price", "Coaches set
  their own prices", "Nora comes with the membership": the site's Pricing page
  (`public/newdesign/pricing.jsx`: a free account; the membership at $5 a month, which adds Nora;
  cancel any time; coaches price themselves).
- The coaches ad names no price and no fee. Its first two cuts did ("$0 to join. No monthly dues.
  No setup fees." and "15% only when you're paid", with the 60-day existing-client rule in small
  print, all from `public/newdesign/coaches.jsx`); the owner had them removed.
- Not said in either ad: Shape Radio (the station is not broadcasting; see
  `marketing/shape-radio-video-scripts.md`), anything live, any earnings figure.
- The app's own screens carry sample money figures (a sample coach's monthly price, the example
  dashboard's revenue) and the app's own "Shape Radio · Preview" strip. That is why every scene with
  a real screen says it is shown with sample data.
- The people are drawings. No photograph of a person is in either ad.

## What is real in them

**The app screens** are recordings of the running app in its signed-out Preview, which shows
sample data. `scripts/ads/seqcap.cjs` walks to a screen, then saves one picture a frame while it
scrolls (118 frames each, 390 x 844 at 2x). Every recording starts with the same four taps,
`Continue|Preview the app first|GOT IT|Dismiss`, written BASE below.

| Recording | Steps after BASE | Scroll |
|---|---|---|
| `m-home` | none | about 430 px |
| `m-train` | `css:[aria-label="Train"]` | about 420 px |
| `m-eat` | `css:[aria-label="Eat"]` | about 400 px |
| `m-coaches` | `css:[aria-label="Coaches"]` | about 520 px |
| `m-nora` | `css:[aria-label="Ask Nora"]`, with `TYPE="Move leg day to Friday"` and `TYPE_INTO='[placeholder^="Ask Nora"]'` | none: it types |
| `c-today` | `css:[aria-label="Settings"]`, `TRAINER`, `Dismiss` | about 380 px |
| `c-clients` | as `c-today`, then `css:[aria-label="Clients"]` | none |
| `c-plans` (recorded, not in the third cut) | as `c-today`, then `css:[aria-label="Plans"]` | none |

Three of them (`m-train`, `c-clients`, `m-nora`) were re-run from these steps after the cuts were
made and gave the recorded frames again. The scroll distances are measured from the recordings, not
from the commands that made them, which were not kept.

**The desktop dashboard** on the drawn monitor is the site's own coach dashboard in its example
mode (`/newdesign/TrainerApp.html?example=1`: sample clients, with its own band saying so),
photographed at 1360 x 1000 by `scripts/ads/deskcap.cjs`, four pages.

**Club Shape** is the club's own tall picture of the main floor.

## The drawings

Eight outline drawings of coaches at work, in the style of the home page's Shape Radio box
(`public/newdesign/radio-figures-v1.jpg`): dashed teal outlines on near-black, every figure hollow.

- Style reference: that picture, with the small four-point sparkle in its bottom-right corner
  painted out so it is not copied. Uploaded to Runway as asset
  `8db18a71-5ad5-436b-a883-aaeaa898dcea`, tag `style`.
- Settings, all eight: Runway `generate_image`, 2K (1536 x 2752), 9:16, thinking level high, one
  reference. 6 credits each.
- Each prompt is the style paragraph, then its scene, then the composition line.

Style paragraph, verbatim (first five):

> A new line illustration drawn in exactly the style of @style: a near-black background with a faint deep-green tint, and everything drawn only as thin glowing pale-teal dashed lines. Long dashes trace each outer contour; fine short dashes hatch the hair; faces are a few line features (brows, empty eye outlines, nose, lips). Every person and object is hollow: inside its outline is the same empty black as the background, with no fill, no shading, no skin and no colour other than the teal line and its soft glow. Do not copy the two portraits from @style; only their drawing style. No text, letters, numbers, logos, watermark or sparkle mark anywhere.

The last three use the same paragraph with "a faint deep-green tint, one even tone from edge to
edge, and everything drawn" (the first nutritionist picture came back with a lighter band across
its top).

| Drawing | Runway task | Scene and composition, verbatim |
|---|---|---|
| `squat-1` | `00241c7d-30fd-4d6b-9db0-b34ba259c126` | Scene: a personal trainer coaching a client through a barbell back squat in a gym. The client is at the bottom of the squat with the barbell across the shoulders, seen in three-quarter front view; the trainer stands close beside them, slightly bent at the waist, one open hand hovering near the client's back, eyes on their form. Both are full figures with their feet on the floor. A squat rack behind them is only a few sparse dashed lines. Vertical composition: the two figures fill the lower two thirds of the frame, and the top quarter of the frame is left as empty black. |
| `deskphone-1` (spare) | `69bc3115-9e98-49f0-886f-78d3bab08662` | Scene: a fitness coach sitting at a desk in the evening, leaning back a little in the chair and looking down at a phone held in one hand, the thumb about to tap it. On the desk are an open laptop, a notebook and a mug. A kettlebell and a rolled exercise mat sit on the floor beside the desk. The phone's screen is the one solid thing in the picture: a small flat rectangle filled with soft teal light, with nothing drawn on it. Seen in three-quarter view from the front. Vertical composition: the coach and the desk fill the lower two thirds of the frame, and the top quarter of the frame is left as empty black. |
| `desktop-1` | `58c1e173-864c-4d27-8117-a193970c5972` | Scene: a fitness coach sitting at a desk, working at a large desktop computer monitor. The view is from the side and a little behind the coach, so that the whole monitor screen is visible and nothing overlaps it: the coach sits at the left of the frame facing right, one hand on a mouse, the other resting by a keyboard; the monitor stands at the right of the frame on the desk, turned toward the viewer. The monitor's screen is a completely empty flat rectangle, outlined with one thin solid unbroken line, with nothing at all drawn inside it. A phone, a water bottle and a stopwatch lie on the desk. Vertical composition: the coach, desk and monitor fill the lower two thirds of the frame, and the top quarter of the frame is left as empty black. |
| `nutri-1` (spare) | `54482d8b-2c6f-4e9b-8aa9-ad0f192bc7ef` | Scene: a nutritionist and a client sitting across a small table from each other, talking through a meal plan. The nutritionist holds a tablet turned toward the client and points at it with one finger; the client leans in to look. On the table are a bowl of food, an apple and a glass of water. The tablet's screen is empty. Both people are seen in three-quarter view from the waist up, facing each other. Vertical composition: the two people and the table fill the lower two thirds of the frame, and the top quarter of the frame is left as empty black. |
| `fistbump-1` | `2729f859-3d16-4fa5-952e-b290bda691f1` | Scene: a personal trainer and a client at the end of a training session, bumping fists and smiling at each other. The client has a towel over one shoulder; the trainer holds a water bottle in the other hand. A dumbbell rack behind them is only a few sparse dashed lines. Both are seen in three-quarter view from the knees up, facing each other. Vertical composition: the two figures fill the lower two thirds of the frame, and the top quarter of the frame is left as empty black. |
| `deskphone-2` | `be6159b5-2a6b-4d05-814f-17ba196a8762` | Scene: a woman who is a fitness coach, her curly hair tied up in a bun, wearing a zip-up training jacket, sitting at a desk in the evening. She leans back a little in the chair with a small smile, looking down at a phone held in one hand, the thumb about to tap it. On the desk are an open laptop, a notebook and a mug. A kettlebell and a rolled exercise mat sit on the floor beside the desk. The phone's screen is the one solid thing in the picture: a small flat rectangle filled with soft teal light, with nothing drawn on it. Seen in three-quarter view from the front. Vertical composition: the coach and the desk fill the lower two thirds of the frame, and the top quarter of the frame is left as empty black. |
| `nutri-2` | `89a5f01d-758b-4f1c-8f57-bf6e61b46565` | Scene: a woman who is a nutritionist, with shoulder-length curly hair and an open cardigan, sitting across a small table from her client, a man with a short beard wearing a hooded sweatshirt. They are talking through a meal plan: she holds a tablet turned toward him and points at it with one finger, smiling; he leans in to look. On the table are a bowl of food, an apple and a glass of water. The tablet's screen is empty. Both are seen in three-quarter view from the waist up, facing each other. Vertical composition: the two people and the table fill the lower two thirds of the frame, and the top quarter of the frame is left as empty black. |
| `plank-1` | `0e98dfff-1a7c-4fe0-81b9-d6ed9909bcaf` | Scene: a woman who is a personal trainer, her hair in long braids tied back, crouching on one knee beside her client, a man with short curly hair who is holding a forearm plank on an exercise mat. She holds a stopwatch in one hand and points along his back with the other, encouraging him; he looks ahead, working hard. Both are full figures on the gym floor, seen from the side in three-quarter view. A kettlebell and a water bottle stand on the floor nearby. Vertical composition: the two figures fill the lower two thirds of the frame, and the top quarter of the frame is left as empty black. |

What is done to a drawing after it is generated, and nothing else:

- `scripts/ads/prep.py` lifts its lines off the generated background onto a transparent one (alpha
  from the line's brightness), so the ad lays them over its own backdrop and the uneven tone of the
  generated background is gone. Nothing is redrawn.
- The monitor in `desktop-1` was drawn empty. The dashboard is laid onto its four corners, which
  are (845, 1040), (1430, 1080), (1388, 1552) and (816, 1441) in the 1536 x 2752 picture.
- `scripts/ads/stills.py` makes the eight standalone 1080 x 1920 pictures and their contact sheet.

## The music

Three samples, Runway `generate_music` (Eleven Music v2.5), 10 credits each. All three were asked
for at 30 seconds and came back longer. Tempo and where the kick plays are measured
(`scripts/ads/grid.py`).

| Sample | Runway task | Length | Measured | Prompt, verbatim |
|---|---|---|---|---|
| A, deep dark house | `c27a7937-1cb8-49b9-b4c6-e14f89ed4043` | 48.0 s | 124.00 BPM, kick from 0.46 s | Deep, dark tech house instrumental for a 30-second advert, 124 BPM, no vocals. Club-grade production: a tight punchy four-on-the-floor kick, a rolling sub bassline with groove, crisp offbeat hi-hats and shakers, a dark hypnotic synth stab, subtle atmospheric pads. Structure for exactly 30 seconds: a two-second filtered intro with a riser, the full beat and bass drop in at second two, a short break with a snare build and riser around second eighteen, a bigger second drop at second twenty with an added lead stab, and a clean hard ending on the last beat with a short reverb tail. Confident, sleek, late-night, expensive nightclub sound. No vocals, no vocal chops, no spoken words. |
| B, melodic uplifting house | `75e74e2f-fb34-4814-9786-641eff2a28a2` | 48.0 s | 124.00 BPM, no kick until 15.45 s | Melodic, uplifting house instrumental for a 30-second advert, 124 BPM, no vocals. Warm and modern: a bright plucked synth melody over an emotional four-chord progression, a deep round bassline, a punchy four-on-the-floor kick, claps on two and four, shimmering hi-hats, wide airy pads. Structure for exactly 30 seconds: the pluck melody alone for two seconds, the kick and bass enter at second two, a short breakdown with a rising build around second eighteen, a euphoric full drop at second twenty with the melody an octave higher, and a clean ending on the final chord with a short reverb tail. Feels like progress, momentum and a good day; polished, premium, feel-good. No vocals, no vocal chops, no spoken words. |
| C, training anthem | `3f72d745-a7c5-402d-8a14-20293ee2248e` | 39.0 s | 140.00 BPM | Hard-hitting, high-energy training anthem instrumental for a 30-second advert, 140 BPM, no vocals. A hybrid of bass house and modern trap drums: a heavy distorted bass riff, a huge punchy kick, cracking snares and claps, fast rolling hi-hats, short aggressive brass-like synth stabs, cinematic impacts. Structure for exactly 30 seconds: a one-second impact and riser, the full riff and drums hit at second two, a half-time section with a snare roll building around second sixteen, an even bigger final drop at second twenty, and a hard stop on a final impact with a short tail. Relentless, motivating, the sound of the last set in the gym. No vocals, no vocal chops, no shouts, no spoken words. |

In the cuts shown: the app ad plays B from 13.52 s into the track, so its drop lands on the ad's
second bar; the coaches ad plays A from the start. Sample C is at another tempo: using it means
moving the cuts to its bars (1.7143 s).

⚠ Whoever placed these cuts could not hear them. They sit on each track's measured bars; whether
they land well with the music is for someone listening to say.

## Rebuilding a cut

From `scripts/ads/`, with Playwright and ffmpeg available. The working files go in
`scripts/ads/work/`, which is not committed.

```bash
# the music and the drawings: download each Runway task's file (the tasks above) into
#   work/music/<name>.mp3   and   work/art/<drawing>.png
(cd work/art && python3 ../../prep.py squat-1 plank-1 nutri-2 deskphone-2 desktop-1 fistbump-1)
```

```bash
# the app recordings (the app's dev server on 5199: cd mobile-app && npx vite --port 5199 --strictPort --host 127.0.0.1)
node seqcap.cjs m-train 'Continue|Preview the app first|GOT IT|Dismiss|css:[aria-label="Train"]' 118 420
```

```bash
# the dashboard's pages (node serve.cjs serves public/ on 8850)
node deskcap.cjs
```

```bash
# every headline fits the frame, a few frames to look at, then the video
node fit.cjs
node frames.cjs coach work/out/check 2,9.5,13,20.6,27
node render.cjs coach work/music/shape-ad-music-A-deep-dark-house.mp3 0 work/out/shape-ad-coaches.mp4
node render.cjs member work/music/shape-ad-music-B-melodic-uplifting-house.mp3 13.52 work/out/shape-ad-app.mp4
```

A render takes six to eight minutes for each ad in software.

## Found and fixed between cuts

- The second cut of both ads had a defect that was sent before it was seen: every scene with the
  phone sat on a flat black slab with rounded corners in place of the ad's backdrop. The scene and
  the handset shared a class name, so the scene took the handset's black, rounded style. Fixed in
  the third cut of both (the handset's style now names the handset only).
- While the coaches ad still had its fee scenes, their wording was corrected to the site's own:
  "your existing clients", listed within 60 days of joining, not "clients you bring".

## Checked, and not

- Checked: each third cut is 1080 x 1920, 30 fps, 900 frames, 30.000 s with sound; sixteen frames
  of the coaches ad and eight of the app ad were read from the finished files; every headline line
  fits the frame; the tooling in `scripts/ads/` redraws the delivered frames (the only difference
  is the video's compression).
- Not checked: the sound, by anyone; playback on a phone; either platform's upload.

## Cost

Runway: 30 credits for the music, 48 for the drawings. 1,662 credits were left after them.
