# Website homepage review — `public/newdesign/index.html` (2026-09-10)

**Brief (owner, 2026-09-10):** *"full review of new design index page … any improvements or
alternative designs to make look better"* · *"less analog, make it look more alive"* ·
*"If you have recommendations and new design ideas, i want to see previews of them."*

**The previews:** a live concept board —
**https://claude.ai/code/artifact/adc4c3d3-2922-4735-b379-f3640e12c016**. Tab **00** is the
shipped page (real captures); **Type** is the type system; **A–E** are five directions, each
rendered as a **whole page** (the fold, then everything under it, animated); **W** is the Wall
as an app screen (the next task, §7); **Pick** is the side-by-side and the recommendation.
The board is the design deliverable; this file is the written review with file and line
references. Second revision, 2026-09-10 (owner: *"what does the rest of the page look like"*,
*"make the font very unique … particular to shape"*, *"one more design idea"*, *"the wall
concept … how could that be incorporated on the app? … I want to see a preview"*).

**Records only.** No code on the page changed. No migration, no route.

---

## 0. Read this first

- The page is **desktop-only by design**: `index.html:6` redirects every viewport under
  760 px to `GetApp.html`, a **cream paper walkthrough** — so on a phone the homepage is the
  most analog surface the site has. Whatever direction wins has to ship to phones too.
- The page spends **24.4 screens of scroll** (21,950 px at 1440×900) on about eight screens
  of content. **15 of them are one pinned section** (`.jtrack{height:1500vh}`, line 249).
  "See how it works" (line 708) anchors to `#loop`, which sits *after* the journey, so with
  `scroll-behavior:smooth` (line 34) the button smooth-scrolls through all 15,600 px.
- **One number on the page is live** — the coach count from `/api/marketplace-stats`
  (line 1231). The **LIVE** radio card (line 809), the nav's permanent **ON AIR** chip
  (line 687), the eight marketplace coaches (AI portraits, fictional stats — see §4.6) and
  the journey's Shape Score **847** (line 1109) are illustrative. Under the brand plan's own
  rule (*"no demo data presented as live members"*) two of those need a label or a real source
  before anything else on this list.
- **What "analog" is, measured:** Fraunces at weight **300** at 106 px (line 219), cream
  `#f5efe1` on paper-brown `#1a1612` (`:root`, lines 22–25), **six** mono uppercase eyebrows
  above the fold, hairlines and corner brackets on every card, static PNG screenshots in a
  cream-bezel phone, and a night sky where **16 of 346 stars** twinkle and nothing reacts to
  the visitor. **What is already alive:** the journey's point cloud, the splash's
  self-drawing mark, the teal-on-dark palette. Keep those.
- **The type is the brand's own now.** Fraunces, Space Grotesk and JetBrains Mono are the
  three most common faces in generated sites this year. They are replaced across every
  concept by **Anybody** (display; a variable **width axis** from 50 to 150, so one family goes
  from a condensed athletic stack to an ultra-wide wordmark: type that changes shape),
  **Doto** (numerals and the wire; a dot-matrix face with a roundness axis, so every measured
  figure reads like a scoreboard), and **Schibsted Grotesk** (body; a grotesk born inside a
  newspaper group for its editorial screens, the broadsheet DNA without the magazine serif).
  Chosen from a rendered specimen of nine candidates, not from memory; see §5.
- **A fifth direction, E · The Climb,** builds the fold from the product's own metaphor: the
  ridge, the summit flag and the Shape Score that every member profile already draws. Four
  layers of contour-lined terrain that breathe and follow the cursor, a route that climbs to
  the summit while the score counts with it. It is the only direction that could not be
  another company's homepage.
- **Recommendation: build direction E, with the type system, this sprint; D is the
  fallback; A is where both grow.** E and D share the same structure below the fold (now rendered on the board for all five:
  the wire, three auto-playing moments, coaches, a one-screen journey with the point cloud,
  radio, price, footer, about seven screens), so the pick is about the fold: E's terrain is
  one canvas more work than D's sky and it is Shape's own drawing. Take B's beat for the radio
  band the day Shape Radio is really broadcasting. Park C (Daylight) until the app has a light
  default.
- **Next task, registered: the Wall in the app** (§7). The app already has a PR Wall channel,
  a public-only, beats-your-best posting RPC, auto-announce from the set logger, coach
  co-signs and a +12 score award per PR; what it lacks is a surface. One migration (a public
  read, a `post_id` on the ledger row, reactions) and one screen.

---

## 1. The verdict

The page is a handsome, quiet, editorial object that describes a live product in the past
tense. Its motion is ambient (twinkle, a glow, a slow point cloud) rather than informational;
its product appears only as screenshots; its one "LIVE" surface has nothing behind it; and
it is built as a 24-screen scroll where the visitor's own scroll wheel is the animation
engine. "More alive" is not more decoration. It is (1) the product running in the fold,
(2) real signals where an endpoint exists and honest labels where one does not, (3) motion
that carries information — a number that ticks, a set that logs, a PR that lands — and
(4) a page short enough that the energy is not diluted across 15 screens of one section.

---

## 2. What exists today (measured at 1440×900, real fonts)

| Section | Lines | Height | Screens | What moves |
|---|---|---|---|---|
| Splash "The Census" | `#shape-intro`, script 546–654 | overlay, 2.9 s lock (line 647) | — | mark draws itself, glides into the hero |
| Hero | 656–711 | 781 px | 0.9 | mark glow (line 200), 16 twinkling stars (51–52), 22 px cursor parallax (907) |
| The member journey | 713–773, canvas 939–1118 | **13,500 px** | **15.0** | point cloud morphs sphere → rings → ECG → dial → mark; text swaps 5 times |
| The expert marketplace | 775–779, script 868–897 | 1,267 px | 1.4 | cards fade up on scroll; 9° tilt on hover (934) |
| The loop | 781–806 | **4,725 px** (525vh, line 232) | 5.2 | five static PNGs crossfade in a fixed phone |
| Shape Radio | 806–823 | 537 px | 0.6 | 44 fake equaliser bars (`@keyframes eq`) |
| Price | 825–831 | 485 px | 0.5 | — |
| Footer | 833–866 | 524 px | 0.6 | — |
| **Total** | | **21,950 px** | **24.4** | |

- **Live data:** `/api/marketplace-stats` (public, cached 60 s) → the marketplace eyebrow.
  Nothing else on the page reads an endpoint. `/api/radio/now-playing` exists and is public,
  but returns the **mock provider** (`src/lib/radio/mock.ts`: *"Tempo Lift / Shape Radio"*)
  unless `radio_station.provider = 'http'`; `/api/community/feed` GET is public for
  `public`/`community` posts; there is **no presence route for the website** (the census
  counter was removed on 2026-07-31 because the website had no source). ⚠ The **app** keeps a
  live presence set through Supabase Realtime (`ShapePresence`,
  `iosAppBroadsheetClient.jsx:200–247`), which drives its "online now" rail; a homepage census
  could subscribe to the same channel rather than wait for a route.
- **Assets on the critical path:** the radio band's background (line 335) is a **1.7 MB
  JPEG with a `.png` extension** (2752×1536) loaded eagerly as a CSS background; the nav
  logo (line 658) is **3696×1782 / 226 KB** rendered at **124×60**; five 600×1387 PNG
  screenshots (~1.0 MB); React + ReactDOM + Babel standalone from unpkg (lines 15–17) to
  mount a search icon and the chat launcher (the deploy precompile removes Babel).
- **Contrast:** `--cream-3` is cream at 0.40 alpha = **3.46:1** on the sky. It is the colour
  of the SCROLL cue (line 227), the idle journey rail (267), the card stat labels (330,
  9.5 px) and the footer base (368). AA for text that size is 4.5:1. Everything else clears:
  cream-2 7.5:1, nav links 6.4:1, teal eyebrow 8.6:1, rust eyebrow 5.3:1.
- **Dead layers still in the DOM:** `.site-bg`, `.site-contours`, `.site-mesh` (a 48-line
  SVG constellation, lines 493–544), `.site-moon`, `.jvignette` — all `display:none`
  (lines 45, 93, 121–123, 250). ~90 lines of CSS and an SVG that never paint.
- **Sibling pages** (rendered for the hand-off): About, Landing and Pricing are dark
  (`#1a1612` paper-brown) with the same Fraunces; Marketplace is **cream** `#f4f1ea`; Radio is
  a neon-city photo. The night sky, the splash and the point cloud exist on the index page
  only, so a fold redesign does not cascade — but a *palette* change (concept C) would.

---

## 3. Analog vs alive — the diagnosis

**What reads analog, in order of weight**

1. **Type.** Fraunces at 300 is a magazine face at its most delicate; at 106 px in cream
   it is beautiful and inert. The eyebrow grammar (mono, uppercase, 0.34em tracking) appears
   six times above the fold. Together they read as a printed front page.
2. **Palette temperature.** Cream on a brown-black is paper and ink. The sky's navy is the
   only cool note, and it sits behind everything.
3. **Furniture.** Hairline rules, corner brackets on every card, a 1 px "SCROLL" rule, a
   cream phone bezel. Print furniture, applied consistently.
4. **The product as a photograph.** Five screenshots in a phone, one per 945 px of scroll.
   The headline beside the second one says *"The ledger ticks live"*; the PNG does not.
5. **Time.** Nothing on the page knows what time it is, who is here, or what just happened.
   The only reactive motion is a 22 px parallax and a 9° card tilt.

**What already reads alive (keep it)**

- The journey's point cloud (939–1118): the sphere spinning with a live connection web,
  the ECG sweep with a beat flash, the score ring filling. It is the best thing on the page
  and it is buried 4–14 screens down.
- The splash mark drawing itself as a constellation and gliding into the hero position —
  a genuinely good shared-element hand-off (`end()`, lines 622–646).
- The mark's glow, the teal, the copy lines.

**The gap, in one sentence:** the page's energy is in a section most visitors will scroll
past in frustration, while the fold — the only screen everyone sees — is static text.

---

## 4. Findings

Severity: **P0** fix regardless of direction · **P1** part of the redesign · **P2** polish.

### 4.1 Mobile — P0

- **H1.** `index.html:6` redirects `max-width:760px` to `GetApp.html`. Phones never see the
  homepage; they see a cream, paper-toned walkthrough (`GetApp.html`, rendered at 390 px: cream
  ground, serif, a phone frame). For a brief that says "less analog", this is the first
  fix: the homepage renders on phones, stacked (copy, then the running product), with the
  canvas work degrading to CSS on low-power devices.

### 4.2 Structure and scroll — P0

- **H2.** `.jtrack{height:1500vh}` (249) and `.loopbeats{height:525vh}` (232): 20 screens of
  pinned scroll for ten short paragraphs. Trackpad users feel stuck; wheel users flick past
  stages. Compress the journey to ~300vh (the point cloud still morphs, faster) and turn the
  loop into an **auto-playing in-viewport strip** — three moments on a 12-second cycle, no
  scroll required. The board's *Pick* tab shows the before/after page map (24.4 → ~8 screens).
- **H3.** "See how it works" (708) targets `#loop`, which is after the journey. Point it at
  the moments strip, directly under the fold.
- **H4.** The splash locks input for 2.9 s on every fresh external arrival (647). It is
  lovely; it is also 2.9 s between a first-time visitor and the page. Make the same mark-draw
  the hero's own load-in (no overlay, no lock, the words rise as the mark completes).

### 4.3 The fold — P1

- **H5.** Nothing in the first screen moves except the mark. The paragraph (705) lists nine
  features in 62 characters per line. Two same-weight CTAs. The fold has no product in it.
  Every concept on the board fixes this differently: A runs the app in a phone; B breathes
  the radio; C floats three cards; D puts three live plates under the headline.
- **H6.** Fraunces 300 (219). If the serif stays (D), take it to **500** at `opsz 144` and cut
  the eyebrows from six to one — that alone removes most of the "wispy" reading. If it goes
  (A, C), Space Grotesk 700 or Bricolage Grotesque 800 carry the fold and Fraunces survives
  only inside the product (the app's own masthead face).
- **H7.** The eyebrow and the h1 both state the platform thesis (703–704); the journey's
  stage one, the price section and the pricing page all say "$5". Say each thing once.

### 4.4 The journey — P1

- **H8.** The heading "Follow a member through Shape." is pinned for 15 screens. The stage
  counter (top-left) duplicates the rail (right). The chips (`.jchip`, 720 ff.) look like
  buttons and do nothing. In a 3-screen version: one heading, one rail, no chips.
- **H9.** The score counter (1109) counts to **847** with the label SHAPE SCORE. As a picture
  of the idea it is fine; as the third fabricated figure on the page it wants an "example"
  label, the same way the board labels its own numbers.

### 4.5 The loop — P1

- **H10.** Five static PNGs (781–806; `.vis .scr img`, 241) under headlines that promise
  motion. The three-moment strip (ledger ticks · a set logs · a PR lands) is the same content
  as beats 02, 01 and 04, built as real UI states instead of screenshots — and the same three
  states drive A's phone and D's plates, so it is built once.

### 4.6 Honesty — P0

- **H11. The LIVE card has no live source.** `.np-live` (809) says LIVE, the equaliser is
  `@keyframes eq`, and "One live channel · tuned to your session" is static copy. The nav's
  ON AIR chip (687) is permanent. `/api/radio/now-playing` exists, but production answers from
  the mock provider unless the station row is on `http`. Rule: LIVE and ON AIR render only when
  the provider is not the mock; otherwise the card reads *"The station opens with the app"*.
- **H12. The Expert Marketplace is a demo cast.** The eight cards (868–897) come from
  `coachDirectory.js`, whose own header (line 5) says *"Self-hosted AI-generated marketing
  portraits … so the signed-out coach cards read as real people"*, with fictional names,
  `sessions: 1284`, `years: 9`. Under a heading that says *Expert Marketplace* and an eyebrow
  that becomes a real count from `/api/marketplace-stats`, that is demo data presented as the
  marketplace. The 2026-09-02 entry registered the preview-cast question as **OWNER RULING
  NEEDED** for video; this is the same question on the homepage. Two honest shapes: label the
  section ("Coaches like these · example profiles") or render real marketplace profiles
  (`trainers`/`nutritionists` with `owner_id`, the same filter the count uses).
- **H13.** The board's "wire" ticker is designed so it can only carry real endpoints: today
  that is the coach count; now-playing once the station is real; the public community feed
  for co-signed PRs (`/api/community/feed` GET is public for `public`/`community` posts).
  No presence, no "training now", until the website subscribes to the app's Realtime
  presence channel or gets a route of its own.

### 4.7 Navigation — P1

- **H14.** 17 targets in the bar (9 links, 4 dropdowns, log in, get started, the Radio
  wordmark, search) at 12 px lowercase and 0.6 alpha. The Radio wordmark hides under 1180 px
  (382), the login under 920 (388). Trim to six primary items (Coaches · App · Radio ·
  Community · Pricing · About) with the dashboards behind the signed-in state.
- **H15.** The index carries a **static copy** of the React header — its own dropdown
  script (1120–1151) and its own signed-in swap (1153–1227) — while 70 other pages get the
  shared `Header` from `pageShell.jsx`. Two implementations of the same bar will drift; the
  index already differs (lowercase links, the ON AIR chip). Mount the shared header, or
  extract the index bar into the shared one.

### 4.8 Performance — P1

- **H16.** The radio background (335): 1.7 MB, a JPEG named `.png`, 2752×1536, eager.
  Serve a 1600 px WebP and lazy-load the band. The nav logo (658): 226 KB for a 124 px image;
  the 265×128 `shape-logo-nav-white.png` already exists at 3.6 KB. Five 600×1387 screenshots
  become unnecessary once the moments are real UI.
- **H17.** `.c{opacity:0;transform:translateY(40px)}` (304) until an IntersectionObserver
  adds `.in` (933): with JS blocked or slow, the marketplace section is blank, and any
  crawler/thumbnail sees eight empty cards. Render visible; animate from visible.

### 4.9 Polish — P2

- **H18.** `--cream-3` labels at 3.46:1 (227, 267, 330, 368) — lift to 0.55 alpha (5.6:1).
- **H19.** Footer: "About" links to `index.html` (847); "Payouts" links to
  `TrainerDashboard.html`, a gated page (842); "Press" is a relative `Team.html#press` (848)
  among absolute links.
- **H20.** Two teals: the site uses `#0ac5a8`/`#2ee0c4`, the app `#0a8f87`/`#34d6c5`, and
  `pageShell.jsx` carries both. Pick the app's pair site-wide.
- **H21.** The dead background layers (§2) and the never-rendered `.site-mesh` SVG: delete.
- **H22.** The hero parallax (907) and card tilt (934) are the only input-reactive motion
  and both are subtle. Concept D's cursor-reactive sky replaces both with one system.

---

## 5. The type system, then the five directions (the board has the live previews)

### 5a. Type: unique, and Shape's

Owner: *"make the font very unique, something that doesn't look AI generated and particular
to shape."* Nine candidates were installed and rendered as a specimen sheet (Anybody,
Handjet, Doto, Schibsted Grotesk, Familjen Grotesk, Newsreader, Geologica, Young Serif,
Gloock) beside the current three, and judged from the glyphs. The pick:

| Role | Face | Why it is Shape's | Settings |
|---|---|---|---|
| Display | **Anybody** (variable: wdth 50–150, wght 100–900, italic) | One family that changes shape: condensed (62) it is B's athletic stack, regular (100) it is A's and D's headline, wide (118–125) it is C's and E's, ultra-wide (150) it is the wordmark. The headline's words widen in on load: the page finds its shape on arrival. It is not in the generated-site canon. | **500** for headlines and 600 for smaller headings (owner, same day: *"thinner font for the headers"*, and *"thinner font for the wall"*; the width axis carries the character, so the weight can stay light); never under 40 px when condensed below 65 |
| Numerals · the wire · labels | **Doto** (variable: ROND 0–100, wght 100–900) | A dot-matrix scoreboard face with a roundness axis. Every measured figure (score, BPM, price, the ticker) reads like a reading, which is the honest-data doctrine made typographic. Handjet was tried for its triangle elements; they do not resolve at any size. | 700 for labels and the wire, 500 for the large figures (the Wall's numerals included); ROND 30 at rest, 60 on hero figures; never under 13 px; never running text |
| Body · UI | **Schibsted Grotesk** (variable: wght 400–900, italic) | Born inside a newspaper group for its editorial products: crisp, slightly narrow, unfussy. Keeps the broadsheet in the DNA without the magazine serif. | 400/500 body, 700 labels and buttons; replaces every mono eyebrow |

Shipping it is one Google Fonts link and three variable files, replacing the current three
in `index.html`'s font link and CSS variables. The mobile app's DISPLAY and MONO tokens can
take the same pair so the phone and the website read as one product. ⚠ **One rule learned
while building the board:** never put a blurred `text-shadow` on the dot-matrix face; the
shadow stacks on every dot and the glyph turns into a pale block. A `drop-shadow` filter fails the same way once its blur is wider
than the dot spacing. Give a large dot-matrix figure a dark backing plate instead of a glow.

### 5b. The five directions

| | Thesis | Display setting | What moves | Live today | Effort | Risk |
|---|---|---|---|---|---|---|
| **A · The Floor** | The product is the hero, running in front of you | Anybody 500 · wdth 100 | aurora ground; a phone cycling three real app states every 12 s; the wire; words widen in | coach count (pill + wire) | high | furthest from the site's current look |
| **B · Pulse** | The station is the front door; the fold breathes at the track's BPM | Anybody 500 · wdth 62, the stack | mark, dot, ring and floor flash on one 60/124 s clock; light steps down TRAIN · EAT · SCORE · BELONG; waveform | now-playing, **only once the station is off the mock** | medium | a gimmick until Radio is real |
| **C · Daylight** | Energy from light, not neon: a white page that moves | Anybody 500 · wdth 125 | breathing teal sun, rust stripe, floating cards, a dial that fills | coach count | high (site-wide) | biggest brand swing; the app is dark-first |
| **D · Electrified broadsheet** | Keep the sky; change the tempo | Anybody 500 · wdth 100 | cursor-reactive constellation; the second line cycles four words; three live plates in BSPlate grammar | coach count | low | still a night sky |
| **E · The Climb** | The product's own metaphor becomes the homepage | Anybody 500 · wdth 118, widening from 62 as the route starts | four contour-lined ridges that breathe and parallax to the cursor; a route that draws to the summit in 3.6 s while the Shape Score counts with it; a warm summit glow; the flag is the mark | coach count (camps + wire); the score is labelled an example | medium | the terrain must match the profile page's ridge closely enough to read as one product |

All five keep the brand line *"Different goals. One community."* so the comparison is
about design, not copy; the copy is the owner's call. **All five now render the whole page**
below the fold, themed per concept from one structure: the wire → three moments
(auto-playing: the ledger ticks, a set logs, a PR lands) → the marketplace (four profiles,
labelled examples until real ones render) → the member journey on one screen, with the
point cloud gathering into the mark behind the rail → radio, with the ON AIR card playing →
price, in the scoreboard face → footer. About seven screens against today's 24.

## 6. Recommendation and roadmap

**Pick:** **E now, with the type system; D is the fallback; A is where both grow.** E is the
only direction that could not be another company's homepage: the terrain, the summit and
the score are already Shape's own drawing on every member profile. It ships the same
structure, honesty and mobile fixes as D at one canvas more effort, and everything below its
fold is shared with A if the running phone is wanted later. B's beat belongs in the radio
band the day the station is on the http provider. C stays on the board as the answer to
"what if bright".

**P0 — with any direction**
1. H1 phones get the homepage (drop the redirect; stack the fold).
2. H11 LIVE / ON AIR only when the station is real.
3. H12 the coach cast: **owner ruling** — label as examples, or render real profiles.
4. H2–H4 journey → ~300vh, loop → auto strip, "See how it works" → the strip, splash → load-in.
5. H19 the three footer links.

**P1 — the redesign (E; D differs only in the sky and the plates)**
6. The type system: one font link, three variable files, the CSS variables (§5a).
7. The fold: the terrain canvas (~120 lines), the route and summit score, the camps, the wire.
8. The moments strip built as UI states (shared with the plates).
9. Nav trimmed to six; the index bar reconciled with the shared header (H14–H15).
10. Images sized (H16); cards visible at rest (H17).

**P2**
11. Contrast (H18), dead layers (H21), one teal (H20), chips and duplicate counters (H8),
    "example" labels on illustrative figures (H9), copy said once (H7).

**Then (A)**
12. Promote the plates into a running phone in the fold; retire the serif from the fold;
    bring About / Pricing / Landing along; take B's pulse into the radio band.

---

## 7. Next task: the Wall in the app

Owner, 2026-09-10: *"the wall concept that you have on the floor page that is showing on the
app, we don't currently have that on the app but i like it. How could that be incorporated on
the app? Add that to next task. I want to see a preview of that as well."* The preview is the
board's **W** tab: a phone-sized, live Wall screen in the app's plate grammar (records land,
the co-sign is the stamp, reactions tick, your own best pinned at the bottom).

**What the app already has** (read, not assumed): a system **PR Wall channel** that
auto-collects every public member's new best (`supabase-migrations/2026-06-14-pr-wall.sql`);
`post_my_pr_to_wall`, a definer that posts only when the caller is public and the value beats
their own prior best in the `pr_wall_posts` ledger; **auto-announce** from the set logger
(`announcePRsFromSetLogs`, `mobile-app/src/services/shapeBackend.js:3218–3292`, capped);
**coach co-signs** on community posts (`post_coach_cosign` stamps `metrics.cosign`,
`2026-06-14-coach-cosign.sql`); a **+12 Shape Score** award per wall PR (`source_kind
'pr_wall'`); and the channel pinned in The Channels directory
(`iosAppBroadsheetClient.jsx:18906–18929`). So the wall exists as **chat**. What it lacks is a
**surface**.

**How it is incorporated**

1. **Data (one migration).** A public read `shape_pr_wall(limit, lift, scope)` (SECURITY
   DEFINER, public members only, honouring the leaderboard opt-out, the same shape as
   `shape_leaderboard`) over `pr_wall_posts`, which is already structured (`lift_key`,
   `lift_label`, `best_value`, `unit`, `posted_at`) but owner-read only today. A `post_id` on
   the ledger row so the plate carries the post's co-sign. A small reactions table (or the
   existing `community_likes` via that `post_id`).
2. **Community → Wall.** A fourth segment beside Feed · Team · Channels in the client app
   (`iosAppBroadsheetClient.jsx`), one `BSPlate` per record: gem, name, tier, the lift, the
   number in the scoreboard face, the delta over their last best, the co-sign as the foot
   line (unsigned plates read *"not yet stamped"* so a stamp is worth something), ▲ cheer.
   Filters: everyone · following · my coach's clients · by lift. **Your best** pinned at the
   bottom from the member's own ledger with the gap to their next wall post; **Post a PR** for
   lifts logged outside the app (the existing `ShapePRWall.post`). **Who's online** (owner,
   same day: *"make sure the wall concept includes the hide/show option for who is online"*):
   the feed's online-now rail sits at the top of the Wall, unchanged — the live count and
   avatars from Realtime presence, the pulsing ring for online, the corner dot for activity
   (teal in a workout, amber cooking), and the same **Hide ×** / **Show** control backed by the
   same per-account preference (`useBSOnlineRailPref` → `client_settings.onlineRail`,
   mirrored per uid in localStorage), so hiding it on the feed hides it on the Wall too. The
   preview's rail toggles.
3. **Entry points.** A Home masthead card *"On the wall"* with the latest co-signed PR; in the
   coach apps, a client's PR lands in the Today rail with a one-tap **Stamp** (the existing
   co-sign RPC), so co-signing takes two seconds.
4. **The website.** The same public read feeds the homepage's *"A PR lands"* moment and the
   wire honestly, which retires that item from the illustrative list.

**Honesty.** Public members only; a signed-in wall never shows the demo cast; the signed-out
preview shows sample plates labelled demo, as the app already does elsewhere. **Effort** about
two PRs; no new data is collected. **Order:** the migration and public read first (it also
serves the homepage), then the segment and the Home card, then the coach Stamp.

**Feed, Wall, Team: what each one is** (owner: *"what is the difference between wall and feed
on the app?"* · *"and what about the chat feature for clients, trainers, and nutritionists"*).
Read from the built app in its signed-out preview, not from memory:

| Surface | Where | What it is | Who talks |
|---|---|---|---|
| **Feed** | Chat → Feed | Everything members post, newest first: PRs, long runs, swims, rest days, meals, check-ins, with typed reactions (Beast, Respect, Gliding, Spot), comments and coach co-signs. Filters: Universal / Following, and Shape / Client / Community. The online-now rail sits above it. | everyone public, plus who you follow |
| **Wall** (proposed) | Chat → Wall | Only records: every public member's new best, from the structured PR ledger, as plates with the number, the delta over their last best, the coach's stamp, reactions; filter by lift; your own best pinned. A board, not a conversation. Today those records exist only as feed posts and as messages in the PR Wall channel. | nobody; you cheer and coaches stamp |
| **Team** | Chat → Team | The 1:1 threads: **Coaches** (your trainer, your nutritionist, an endurance coach in the demo) and **Friends**, with unread badges. This is the client ↔ trainer / nutritionist chat. Coaches get the mirror of it in their own apps (the same `BSChatThread` code), and a nutritionist also receives a client's meal-log note, photo and voice memo as a message. | you and your coaches, you and friends |
| **Channels** | Chat → Channels | Group rooms: #Shape HQ, #PR Wall, #strength-block-3, #Sunday Run Club, #Macro Mondays. #PR Wall is the system channel the PR RPC posts into; a Wall surface would read the ledger instead and could retire the channel or leave it as the chat about PRs. | members of the room |
| **Support** | Chat → Support | The support thread. | you and Shape |

So the Wall does not replace the Feed or the Team threads. The Feed is the conversation, the
Team tab is the coach chat, the Wall is the record board. The one duplication to decide is
the PR Wall channel: keep it as the room where people talk about PRs, or fold it into the
Wall once the Wall ships.

## 8. The app screens on the website, refreshed

Owner: *"make sure the app screens that are showing on website are matching what is actually
live on the app currently."* Two sets were checked: the nine PNGs the live site shows (five
in `index.html`'s loop, nine in `GetApp.html`, all captured 2026-07-10/15), and the phones on
the concept board, which were stylised mock-ups I drew.

**Method.** The current app built from `main` (`VITE_BASE=/m/ npm run build`), served locally
and driven with Playwright at 375×867 at 1.6× (the site's 600×1387), in the signed-out
preview (language → paywall → *Preview the app first* → *Step inside*, the demo banner
dismissed), with the `is-native-app` class so the desktop bezel does not render, the clock
pinned to **Friday 2026-09-11 09:30 New York** so the example member is on a strength day
like the existing images, and `/api/radio/now-playing` answering what production answers.
Fourteen screens captured; each compared side by side with the file the site shows.

**What was stale on the site, now replaced (same filenames, `?v=20260910`):**

| Screen | File | What had changed in the app |
|---|---|---|
| Home | `getapp-home-v5.png` | the masthead dateline (*Clients edition · Thu · Sep 10 · Cut W37 · clock*, shipped 2026-09-01) and the ticker's macro line; the radio card's muted state |
| Community | `getapp-community-v2.png` | *Universal / Following* moved into the title row; the online rail's **Hide ×**; an *All* filter; the typed-reaction bar (Beast · 41, comments, share, send) |
| Profile | `getapp-profile-v2.png` | the *Training for · first half-marathon · 74 days out* line, the member's quote, and the **cover photo** behind the ascent (2026-08-31) |
| Grocery | `getapp-grocery-v2.png` | aisles collapsed by default with counts, *Prep the week*, and the *Send to Instacart · Save to library · Share* bar |
| Radio | `getapp-radio-v3.png` | the signed-out state is paused with no track (playback is sign-in gated); the old image showed a playing state |
| Train, Eat, Score, Habits | `getapp-train-v3` · `getapp-nutri-v3` · `getapp-score-v3` · `getapp-habits-v1` | layout unchanged; the day's content differs (week 23 of the block, the Friday session, *The menu.*), so they are refreshed for consistency |

**On the board:** A's phone now cycles three real screens (Eat, the live session player, the
feed's PR post) and the three moment cards on every concept are windows onto the real
captures with the live element ringed, labelled *the app today*; the Wall preview's chrome is
the app's actual Chat chrome (title row, online rail, the Feed · Team · Channels pills).
Everything else on the board that looks like the app is a proposed widget, not a screen.

**Not changed:** the nine other `getapp-*` files no page references (`chat-v2/v3`, `eat-v2`,
`home-v2/v4`, `home-mobile-light-v5`, `personalize-v2`, `recipes-v2`, `workout-v2`) are dead
assets; deleting them is a separate tidy.

## 9. Method notes, limits, renders

- **Second revision.** Nine typefaces installed from `@fontsource` and rendered as a specimen
  sheet with the real glyphs (a zoomed pass on the dot-matrix candidates settled Doto over
  Handjet); every concept rebuilt as a whole page and captured full-length at 1440 px; the
  Wall tab captured after six seconds of records landing; a 400 px pass with zero horizontal
  overflow. Still one look and one fix pass per revision, not a test loop.
- **Renders.** The shipped page at 1440×900 (splash at 1.1 s and 2.3 s, the hero, all five
  journey stages, the marketplace and a hover, all five loop beats, the radio band, price,
  footer, an open dropdown), the hero at 1920, 1280, 1024 and 390 (`?desktop`), `GetApp.html`
  at 390, and the About / Marketplace / Landing / Radio / Pricing folds for the hand-off.
  Captures live in the session scratchpad and are **not committed** (31 PNG/JPG).
- ⚠ **The first render pass had the wrong fonts and was thrown away.** This container's
  proxy 404s `fonts.gstatic.com`, so the page rendered in Times New Roman via the
  metrics-matched fallbacks. The three families (and, for the board, two more) were installed
  from `@fontsource-variable` and served locally with the Google Fonts CSS request rewritten
  to them; `document.fonts` confirmed all loaded before any capture used here. React, ReactDOM
  and Babel standalone were served the same way (unpkg is also blocked) so the sibling pages
  and the search mount rendered as in production.
- **Numbers.** Section heights and the scroll total are read from the DOM; contrast ratios
  are computed (WCAG relative luminance, alpha composited on the mid-sky `#0a1020`); image
  sizes from `stat`/`file`; every line reference re-read from the source before it was
  written down.
- **Limits.** No on-account state (the signed-in nav swap was read, not exercised); no
  real-device mobile pass (the 390 px render is Chromium with `?desktop`); the live endpoints
  were read, not called against production. The board's numbers, names and track are
  illustrative and say so on each tab.
