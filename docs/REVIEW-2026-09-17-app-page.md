# The App page, three ways — 2026-09-17

**Owner ask:** *"review the app page on shape website, give me 3 new designs for that page"* → *"i want to
see previews before"*.

**The page:** `public/newdesign/GetApp.html` — the target of the site nav's **App** tab
(`pageShell.jsx:245`) and of the footer's *The app* link on every page. 456 lines, self-contained: its own
two-link header, a ten-step click-through walkthrough, a store waitlist, its own copy of the canonical
footer.

**Previews:** the live concept board — https://claude.ai/artifact/CoRssAAAWmSX8jSo1KfMZQ — a canvas of
thirteen artboards in four rows. **Today · as shipped** (the page rendered in its real typefaces at 1440
and 390, plus two evidence crops: the step-2 bezel and the step-8 Radio capture), then **A · The Front
Page**, **B · One Day** and **C · The Panel**, each as a whole desktop page, a whole phone page, and a
frame you open to scroll. Every phone on every concept is a real capture of the app; the two the shipped
page shows stale were re-shot from today's build for the board. The same previews as a plain page, for a device where the canvas will not load: https://claude.ai/artifact/GAUZQXSvviKwSCepwsRywj — four tabs, a desktop/phone switch, the full-page renders as images.

**Records only.** No code changed, no migration, no PR. The recommendation is §5; §6 lists what the build
still needs decided.

---

## 1. What the page is today (read from the code, measured in Chromium)

**Structure** (`GetApp.html`): a sticky two-link header — the logo and *Notify me →* (`:192–197`) — then
an eyebrow and `See how Shape works.` (`:200–203`), then one **stage**: a copy column (step number, title,
body, Back/Next, ten dots) beside a 320px phone frame showing one capture at a time (`:206–224`). Ten
steps live in a `STEPS` array (`:299–310`) and are written into the DOM by `render()` (`:344–359`) one at
a time; ←/→ keys step too (`:376–379`). Below: a *Coming soon* waitlist with two store "buttons" that open
an email form (`:228–246`), and the footer (`:248–295`).

**Measured on the shipped page at 1440×900**, the site's own fonts served locally (the width probe reads
Fraunces at 860px against 770px for its fallback, so the real face was measured, not the fallback):

| | |
|---|---|
| Page height | **1,957px** — walkthrough 1,003 (51%), waitlist 417 (21%), footer 537 (27%) |
| First viewport | header 83 · eyebrow+h1 124 · the stage starts at y=207 and ends at **1,003**: the phone (y 231, 716 tall) is cut at the fold by 47px and the waitlist starts exactly one fold down |
| Copy block | 616×279px of a 1440×900 fold |
| Step control | ten dots at **9×9px** (the active one 26×9), 8px apart (`:85–87`) |
| Nav *Notify me →* | 78×17px, no padding (`:53`) |
| Buttons | Back/Next 42/40px tall; store buttons 58; the *Notify me* toggle 29 |
| Images at load | **all ten PNGs, 1,816,999 bytes**; the page totals 2.21 MB. `loading="lazy"` is set (`:330`) and does nothing: the ten images are stacked at `inset:0` inside the visible phone, so every one is in the viewport |
| Copy in the DOM | **one step of ten** (the current one). With JavaScript off: an empty title, an empty body, `01 / 08` — the hardcoded total (`:208`) is two steps stale — and no image at all |
| Fonts | Fraunces · Space Grotesk · JetBrains Mono (`:11`, `:34–36`) — the **pre-2026-09-10** type system |
| Overflow / errors | none at 1440 · 1280 · 1024 · 860 · 390 · 320 |

### 1a. What is wrong, in order of cost to the visitor

1. **The site's nav disappears on the App tab.** Every other nav destination loads `pageShell.jsx` and
   renders the shared header (Coaches ▾ · Members · App · Kitchen · Community · Rewards · Pricing · About,
   the Radio pill, Log in, Get started). `GetApp.html` loads none of it — measured across the ten nav
   targets, it is the **only one with zero `pageShell.jsx` references** — and draws its own bar with the
   logo and *Notify me →*. A visitor who clicks App loses the eight tabs, the Radio pill and *Get started*;
   the only ways out are the logo and the footer. It is also the only nav target still on the old
   typefaces: index, Members, About, Radio and Coaches moved to Anybody · Doto · Schibsted Grotesk
   (`Client.html:7`, `Coaches.html:13`); Marketplace, Community, Rewards and Pricing kept the old type but
   at least carry the shared header.
2. **It is a ten-click carousel, and nine tenths of it is invisible.** One screen at a time, no scroll path,
   no overview. Only the current step's title and body exist in the DOM (measured 1 of 10 titles present),
   so a crawler, a screen reader on first pass, a reader-mode view or a link someone shares all get *Today,
   at a glance.* and nothing else; there is no hash per step, so no step can be linked. With JS off the
   stage is empty (§1 table).
3. **Two of the ten captures show screens the app retired three days ago.** `getapp-radio-v3.png` is the
   pre-Signal-Field Radio page — `ON AIR · 3,472`, a `132 Station BPM` ring, a `0:00 / -0:00` scrubber and
   the keyframe EQ — every one of which the 2026-09-14 review called a fabrication and #2072 / #2076 / #2088
   removed (`iosAppBroadsheetRadio.jsx:199` records *"NO bpm AND NO listeners"*). `getapp-home-v5.png`
   still prints `3,472 LISTENING` in the Home radio card, retired in #2076. Both carry `?v=20260910`; the
   retirements landed 09-14/15. The same Home file is also the homepage's price-section phone
   (`index.html:883`). Re-shot from today's build for the board (§7); the site itself still serves the old
   pair.
4. **The teal eyebrows read at 1.75:1 on cream.** `--teal #0ac5a8` (`:29`) is the app's accent for black
   paper, where it measures 8.9:1. On `--paper #efe5cd` the page's eyebrow *THE WALKTHROUGH* (`:58`) and
   the four footer heads (`:161`) compute to **1.75:1** — under the 3:1 bar for large text, let alone 4.5:1
   at 10–11px. The step counter and the footer's `© 2026 SHAPE` sit at `--ink-3` (ink at 0.40, `:28`) =
   **2.59:1**; the waitlist's orange eyebrow **3.20:1**. Body copy at ink 0.62 is fine (5.12:1).
5. **Four steps put a cream bezel around a black screen.** Every capture is the app's Black paper, but the
   `dark` flag is `false` on TRAIN, EAT, GROCERY and COMMUNITY (`:301–303`, `:308`), so the phone frame
   flips to `--screen #f4eedf` (`:92`; measured `rgb(244,238,223)` on steps 2, 3, 4 and 9) around a black
   screen, and the bezel changes colour five times across a ten-step walk. The board's *step 2* crop is the
   evidence.
6. **The step control is a 9px target.** The dots are the page's only direct navigation and sit under this
   repo's documented 24px floor (WCAG 2.5.8); the nav's *Notify me →* is 17px tall with no padding. The
   Back/Next buttons at 40–42px are above the floor.
7. **The fold is mostly paper and the phone is cut off.** At the most common desktop height the copy
   occupies a 616×279 block of the 1440×900 fold, the phone's tab bar sits 47px below it, and the only
   conversion on the page is a full fold down. The page's real doors — *Get started* (membership, $5/mo)
   and the store waitlist — are not in the first viewport; *Get started* is not on the page at all.
8. **A Google Play sign-up is recorded as an App Store one.** The form posts `{ email, source }` (`:431`)
   and never a `platform`; `/api/app-waitlist/route.ts:13` defaults a missing platform to `ios`, so every
   waitlist row's message reads *"Notify this person when the Shape App Store link is ready"*, whichever
   button was pressed. Data, not layout — registered as its own fix.
9. **Copy claims, checked against the app.** Real: *one tap to send the whole list to Instacart*
   (`shapeBackend.js:4268`), *tap a move for video* (`iosAppBroadsheetClient.jsx:31033`), *starter
   templates and custom programs, coach optional* (`:5711`, `:6058`), *swaps* (`BSSwapSheet`). **No code
   path found:** *"Pick friends to be notified when you miss"* (HABITS, `:304`) — the only habit
   notifications are the member's own OS reminders (`:8031–8066`). **Overclaims:** *"One live channel"*
   (RADIO, `:307`) on a station that has never broadcast (`radio_station.stream_url` is null; the app's
   own preview labels its signal *EXAMPLE SIGNAL*). The concepts keep the verified copy and drop those two
   clauses; §6 puts the wording to the owner.
10. **Two things the page never says.** The price — the homepage and Pricing both state $5/mo for members
    and coaches join free; this page's only figure is a step counter — and the fact that the app **runs in
    a browser today**: `vercel.json` builds it into `public/m` on every deploy, the app's own paywall
    carries *Preview the app first →* (`en/onboarding.json:122`), and **no page on the site links `/m/`**
    (grep across `public/*.html` and `public/newdesign/`: zero). Whether the marketing site should is an
    owner call (§6); the page currently tells a visitor to wait for an email.

### 1b. What is good, and stays

- The copy: the ten titles are the owner's own words and most of the bodies are verified against the app
  (§1a.9). The concepts carry them, trimmed.
- The captures: 600×1387 at 1.6×, the site's one geometry, the same set the homepage uses. Eight of ten are
  current.
- The honesty of the waitlist: *Notify me on App Store*, not a store badge that pretends to be live; the
  email form works (`/api/app-waitlist` exists and validates).
- Keyboard stepping and `prefers-reduced-motion` are handled; the footer is the canonical 22-link table
  (#2071) and the mark is the 80px dark logo that entry records as correct on cream.

---

## 2. The backbone every option carries

- **The shared header and the canonical footer**, so the App tab stops being the one place the nav
  vanishes; and the site's type system (Anybody · Doto · Schibsted Grotesk), so it stops being the one
  nav tab on the old faces.
- **Every screen visible in one scroll, every word in the DOM.** No carousel, no step to click, no copy
  injected by script; each screen is a section with its own anchor.
- **Real captures, current.** The two stale ones re-shot; one bezel (dark, because the captures are the
  app's Black paper); every capture region labelled *Example member · captured from the app's signed-out
  preview* — the homepage's own `.exlabel` convention.
- **One figure per screen, read off the screen** (`1568 / 2100 kcal`, `6 moves · 54 min`, `89 items`,
  `245 lb · new PR`), set in Doto so a reading looks like a reading; never a number nobody measured.
- **The price and the doors in the first viewport**: `$5/mo · cancel any time · coaches join free`,
  *Get started* as the primary, the store waitlist kept and honest (*Coming to the App Store and Google
  Play*).
- **Contrast fixed by choosing the accent for the paper**: on cream the text teal is `#0a6560` (5.5:1); on
  the dark grounds the app's `#34d6c5` (10.9:1). Every control is 44px or taller; measured zero controls
  under 24px on every concept at both widths.

---

## 3. The three options

### A · The Front Page — the app's own paper, as a page

The app already calls its Home screen *The Shape Daily* and carries a masthead (`VOL. 1 · NO. 1 · CLIENTS
EDITION`). A makes the App page the **app edition of that paper**: cream ground, a dateline row (*The app
edition · Vol. 1 · No. 1* / *iOS & Android · coming soon · members $5/mo · coaches join free*), the mark,
the house 2px ink→teal ledger rule, then the Home screen as the **lead story** — headline, standfirst,
three Doto facts, *Get started* and *Notify me* — beside the phone. Under it, *Every screen, on one page*:
the other nine screens as **column stories** in a three-wide newspaper grid with hairline column rules,
each a photo crop of the capture (the top of the screen, like a newspaper photo), an eyebrow, a headline,
two sentences and one figure. Then the price plate and the footer.

Distinct trait: editorial density and light paper — everything is visible without a click and the page
reads as the site's broadsheet register. **Measured: 3,821px at 1440 (4.2 folds), 5,224 at 390.**

### B · One Day — a member's day, hour by hour

Dark ground, a hero (*One day on Shape.* with four Doto tiles: 10 screens · $5 a month · 13 languages ·
0 ads on Radio), then a **timeline** down the page: `06:45 WAKE` Home · `07:20 BREAKFAST` Eat · `09:00
TRAIN` · `10:15 LOGGED` the Wall · `13:00 SHOP` Grocery · `18:00 RADIO` · `20:30 THE ROOM` Community +
Habits · `SUNDAY` Score + Profile. Each beat is a Doto time, an eyebrow, a headline, two sentences and a
figure, with the hour's phone beside it; on desktop each phone is `position: sticky` inside its own beat,
so it holds while its copy scrolls and hands over to the next. A soft radial glow behind each beat warms
at dawn and cools to night down the page.

Distinct trait: narrative — it answers *what does a day with this app feel like* rather than *what are the
screens*. It is also the tallest: **7,087px at 1440 (7.9 folds), 7,727 at 390.**

### C · The Panel — every screen at once, on the app's black paper

The app's Black paper on the website. One **directive plate** first — spine, notch, tick, bracket — with
the headline *The app. Every screen.*, the example label, and the **three doors** stacked on the right:
*Get started · $5/mo* (teal), *Open it in your browser* (§6), *Notify me when it ships · coming to the App
Store and Google Play*. Then *The board · ten screens*: all ten captures as instrument plates in a
five-wide grid, each with an index (`03 / 10 · EAT`), the screen, a headline, one line and one figure. The
price plate and the footer close it.

Distinct trait: glanceability — the whole app is on screen in the first two folds and the page looks like
the product. **Measured: 2,938px at 1440 (3.3 folds), 5,318 at 390.** Build note: the five-wide board wants
a three-wide step around 1,100px; the preview collapses straight to two columns at 860.

---

## 4. Carry-over

| Today | A · The Front Page | B · One Day | C · The Panel |
|---|---|---|---|
| Two-link header (logo, Notify me) | Shared header + footer | Shared header + footer | Shared header + footer |
| *See how Shape works.* + eyebrow | Masthead + dateline + lead headline *Today, at a glance.* | *One day on Shape.* + four tiles | *The app. Every screen.* directive plate |
| Ten steps, one at a time | Lead story + nine column stories, all visible | Eight beats (two carry two screens), all visible | Ten plates, all visible |
| Step copy (title + body) | Kept, trimmed; two clauses dropped (§1a.9) | Kept, trimmed; same | Kept, trimmed; same |
| Ten captures, 4 cream bezels | Ten captures, one dark bezel; two re-shot | Same | Same, no bezel on the board plates |
| Dots + Back/Next + ←/→ | Section anchors, no control | Section anchors | Section anchors |
| No price | `$5/mo` in the lead and the price plate | In the hero tiles and the price plate | In the primary door and the price plate |
| Waitlist (email form, store chips) | Kept, under the price plate | Kept | Kept + the browser door |
| No *Get started* | Primary in the lead and the plate | Primary in the hero and the plate | Primary door on the directive plate |
| Own footer (22 links) | Canonical footer | Canonical footer | Canonical footer |

---

## 5. The pick

**C · The Panel**, for the page's one job: someone who taps *App* wants to see the app and find the door.
C shows the whole app in the first two folds, puts the three doors in the first viewport, is the shortest
of the three, and is the only one that looks like the product it is selling — the same black paper, plates
and Doto figures the member sees the day they join. It is also the cheapest to build well: one plate
component, one grid, no scroll choreography.

**A** is the fallback if the owner wants this page in the site's cream editorial register rather than the
app's black: it carries the same backbone with the strongest typographic idea of the three (the app
edition of the app's own paper). **B** is the best story and the longest page; the homepage review's own
measurement (24 folds cut to 7.8) argues against adding another eight-fold page, and its sticky phones are
the one piece of scroll choreography on the board.

Whichever wins, three things ship first and are design-independent: the two stale captures re-shot, the
waitlist `platform` field, and the shared header on this page.

---

## 6. Owner rulings

1. **The pick** — C, A or B (§5).
2. **The browser door.** The app runs on the web today and its paywall is built for prospects (*Preview
   the app first →*), but no page on the site links `/m/`. C shows the door; A and B would take the same
   line under the store chips. Yes, no, or later.
3. **Two copy clauses.** *"Pick friends to be notified when you miss"* has no code path behind it, and
   *"One live channel"* describes a station that is not broadcasting. The concepts drop both; keep them
   dropped, or reword them to a feature that exists.
4. **The re-shoot.** Replace `getapp-home-v5.png` and `getapp-radio-v3.png` with today's captures (the
   board already carries them). The Home file is shared with the homepage's price phone, so one swap fixes
   both pages.
5. **Whether this page carries the coach apps at all.** Every screen here is the member app; the trainer
   and nutritionist apps exist and are shown nowhere on the site except as web dashboards on the Coaches
   page. Out of scope for this review, named so it is not assumed.

---

## 7. Method, limits

- **Read** the whole of `GetApp.html`, the waitlist route, the nav table and the header in `pageShell.jsx`,
  and the app source behind each copy claim; every `path:line` above was re-read from `main` = `c62f0ba`.
- **Rendered** the shipped page in Chromium with the three real typefaces served locally (Google Fonts is
  blocked from this container; the fallback would have measured the wrong page) at 1440 · 1280 · 1024 ·
  860 · 390 · 320, stepped through all ten steps recording the bezel colour and the active image, drove the
  waitlist form, and rendered once with JavaScript off. Contrast figures are computed (WCAG 2.x relative
  luminance, alphas composited over the paper), not eyeballed.
- **Re-shot** Home and Radio from a fresh `mobile-app` build through the real signed-out preview flow
  (English → Continue → Preview the app first → Step inside → Dismiss), clock pinned to Fri 2026-09-11
  09:30 New York like the existing set, 375×867 at 1.6× = 600×1387, `is-native-app` set so no desktop
  bezel renders, `/api/me` answered as a measured signed-out visitor. The first run booted nothing: a
  fake-timer clock stalls the splash. A system-time shim is what works.
- **Rendered the concepts** in Chromium at 1440 and 390 in the same faces: zero horizontal overflow, zero
  page errors, zero controls under 24px on all six renders; the width axis proved the display face live
  (340px at width 50 against 1,518px at 150).
- **Limits.** The board's header is a static replica of the shared header, not the React component; the
  concepts' links go nowhere; the shipped page was measured without React (unpkg is blocked here), so the
  chat bubble shown is the fallback pill, not the rich widget — its position is the same. No signed-in
  state was rendered anywhere; every capture is the signed-out preview, which is what the page shows a
  visitor.
