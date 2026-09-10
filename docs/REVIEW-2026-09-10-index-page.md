# Website homepage review — `public/newdesign/index.html` (2026-09-10)

**Brief (owner, 2026-09-10):** *"full review of new design index page … any improvements or
alternative designs to make look better"* · *"less analog, make it look more alive"* ·
*"If you have recommendations and new design ideas, i want to see previews of them."*

**The previews:** a live concept board, one tab per direction, each a proportional hero
fold that animates the way the real page would —
**https://claude.ai/code/artifact/adc4c3d3-2922-4735-b379-f3640e12c016**. Tab **00** is the shipped page (real captures); **A–D** are the four
directions; **Pick** is the side-by-side and the recommendation. The board is the design
deliverable; this file is the written review with file and line references.

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
- **Recommendation: build direction D (Electrified broadsheet) this sprint, on the way
  to A (The Floor).** D ships every structural, honesty and mobile fix with a cursor-reactive
  sky, a kinetic headline and three live plates, and every piece carries into A when the
  serif leaves the fold. Take B's beat for the radio band the day Shape Radio is really
  broadcasting. Park C (Daylight) until the app has a light default.

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
  `public`/`community` posts; there is **no presence endpoint** (the census counter was
  removed on 2026-07-31 for exactly that reason).
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
  No presence, no "training now", until an endpoint exists.

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

## 5. The four directions (the board has the live previews)

| | Thesis | Type | What moves | Live today | Effort | Risk |
|---|---|---|---|---|---|---|
| **A · The Floor** | The product is the hero, running in front of you | Space Grotesk 700 display; Fraunces only inside the phone | aurora ground; a phone cycling three real app states every 12 s; the wire; words rise on load | coach count (pill + wire) | high | furthest from the site's serif |
| **B · Pulse** | The station is the front door; the fold breathes at the track's BPM | Big Shoulders Display 900 stack; Fraunces for the track title | mark, dot, ring and floor flash on one 60/124 s clock; light steps down TRAIN · EAT · SCORE · BELONG; waveform | now-playing, **only once the station is off the mock** | medium | a gimmick until Radio is real |
| **C · Daylight** | Energy from light, not neon: a white page that moves | Bricolage Grotesque 800 | breathing teal sun, rust stripe, floating cards, a dial that fills | coach count | high (site-wide) | biggest brand swing; the app is dark-first |
| **D · Electrified broadsheet** | Keep the sky and the serif; change the tempo | Fraunces **500** opsz 144 (was 300); one eyebrow | cursor-reactive constellation; the second headline line cycles four words; three live plates (ledger · rest timer · PR) in BSPlate grammar; the wire | coach count | low | still a serif on a night sky |

All four keep the brand line *"Different goals. One community."* so the comparison is
about design, not copy; the copy is the owner's call. All four share the same structure
below the fold: the wire → three moments (auto-playing) → coaches → a 3-screen journey with
the existing point cloud → radio → price → footer (~8 screens).

---

## 6. Recommendation and roadmap

**Pick:** **D now, A next.** D is the lowest-risk way to ship the P0 set with a fold that
is visibly alive, and nothing in it is thrown away: the wire, the plates, the compressed
journey and the cursor sky carry straight into A when the serif retires from the fold and
the sibling pages are ready to follow. B's beat belongs in the radio band the day the
station is on the http provider. C stays on the board as the answer to "what if bright".

**P0 — with any direction**
1. H1 phones get the homepage (drop the redirect; stack the fold).
2. H11 LIVE / ON AIR only when the station is real.
3. H12 the coach cast: **owner ruling** — label as examples, or render real profiles.
4. H2–H4 journey → ~300vh, loop → auto strip, "See how it works" → the strip, splash → load-in.
5. H19 the three footer links.

**P1 — the redesign (D)**
6. The fold: Fraunces 500, one eyebrow, one-sentence sub, three live plates, the wire.
7. The cursor-reactive sky (canvas, ~120 lines) replacing the twinkle + parallax.
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

## 7. Method notes, limits, renders

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
