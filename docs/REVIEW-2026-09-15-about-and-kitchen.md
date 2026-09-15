# The About page and the Shape Kitchen page, three ways each — 2026-09-15

**Owner asks, in order:** *"can we do an updated look and design for the about page on website and app"* →
*"also need to update design on the shape kitchen page on website"* → *"and give me 3 design options for
each, i want to see previews before"* → *"need a more proffessional esay to read, navigate design"* →
*"and feel free to be creative and unique/different with design concepts"* → *"but have it match current
shape design and brand imaging"* → *"no you can introduce new look"*.

So the brief is **professional · easy to read · easy to navigate**, three genuinely different directions
per page, with a new look allowed and the Shape mark, name and copy as the constant.

**Previews:** the live concept board — https://claude.ai/artifact/TGwV8RdJsUMYySWBtt1oqK — eight tabs:
**Today · as shipped** (real captures of all three surfaces with the measured figures), **A1 · The Brief**,
**A2 · The Dossier**, **A3 · The Chapters** (each rendered as a 1280px website page AND a 390px app page),
**K1 · The Pantry**, **K2 · The Index**, **K3 · The Menu** (each as a 1280px page and the same page at phone
width), and **Pick**. Every frame is a live render on the real copy and the real 100-recipe catalog; the
chapter tabs and the letter expander on A3 work. Recommendation: **A2 for About, K1 for Kitchen** (§6).

**Records only.** No code changed, no migration, no PR beyond this file. The build follows the pick.

---

## 1. What the three pages are today, measured

Captured 2026-09-15 in Chromium with the real faces served locally (the container blocks
`fonts.gstatic.com`, and a page measured in the metrics fallback measures the fallback; Fraunces, Space
Grotesk and JetBrains Mono were served from their fontsource files and confirmed loaded). Zero page
errors on all three.

| Surface | Length | Words | Body type | Navigation | Controls |
|---|---|---|---|---|---|
| About · web · 1440×900 | 5.2 screens (4,686px) | 798 | Fraunces **300 italic**, 16.5–22px; the bio is a 553-character paragraph in a 560px column | none: one scroll | 3 buttons, 34 links (all nav and footer) |
| About · web · 390×844 | 7.6 screens (6,426px) | 794 | same | none | same |
| About · app · 390×844 | 4.5 screens (3,822px) | 747 | Saira **300 italic**, 14–15.5px | none; Settings → Also → About → About Shape, three taps | Back, one CTA |
| Kitchen · web · 1440×900 | **14.7 screens** (13,233px) | 2,990 | Space Grotesk 16px | none: 100 cards, no search, no sort, no paging | 117 buttons, 133 links |
| Kitchen · web · 390×844 | **42.5 screens** (35,903px) | 2,986 | same | none | same |

**About, website** (`public/newdesign/about.jsx`, 330 lines, CRLF-stored). Hero → "The idea" →
letter → founder → CTA. The lead under the hero is a 90-word manifesto set in 22px light italic; the
letter is seven paragraphs in 20px Fraunces on a 720px column with two pull-quotes outdented 80px past
it; the founder card sits at the bottom (owner ruling 2026-08-28, kept). Around all of it: a film-grain
SVG, a scroll-faded spotlight, two fixed hairlines, faint column guides, printer's crop marks at four
corners and a tick-marked rule down each side. None of that chrome is navigation, and the page has no
navigation: no anchors, no contents, no facts at a glance. A visitor learns what Shape costs and who
built it only by reading to the end.

**About, app** (`BSAboutPage`, `iosAppBroadsheetClient.jsx:35574`). The same order on one 3,822px
scroll, every string keyed (44 `settings:aboutPage.*` keys × 13 locales; the signed name deliberately
unkeyed). Body copy is Saira 300 italic at 14px, which on a phone is the least legible setting the face
has.

**Shape Kitchen, website** (`public/newdesign/recipesPage.jsx`, 284 lines, over `recipes.jsx`'s
catalog). The hero explains sourcing (USDA MyPlate Kitchen, credits) before a single dish is on screen,
over the kitchen illustration at 30% wash, so the headline sits on cabinets and pendant lamps. Then
four rows of chips (LIBRARY · DIET · PROTEIN · FREE FROM · GOALS, 15 controls) push the first card to
y≈760 at 1440px. Then all 100 recipes as dark cards on a cream page, each with a 150px gradient
carrying nothing, a diet pill, a time·kcal pill, a save heart, a byline, the title, three macros and
up to three tags. No search, no sort, no grouping, no paging.

**The catalog itself, measured from `SHAPE_RECIPES`:** 100 recipes · 35 by nine named Shape
nutritionists and dietitians, 65 credited to USDA MyPlate Kitchen · diets Vegan 17 · Vegetarian 17 ·
Plant-based 14 · Seafood 18 · Poultry 18 · Meat 16 · by cooking time ≤15 min **14**, 16–30 **39**,
31–60 **28**, over an hour **19** · 30 under 20 minutes · 30 high-protein · 12 both · 20 carry an
allergen note · **no recipe has a photo** (every `hero` is a CSS gradient).

## 2. What fails the brief, and what every option corrects

The brief has three words and each maps to a measurable defect.

- **Professional.** The About page spends its atmosphere budget on print affectations (grain, crop
  marks, rulers) and sets running text in light italic serif; the Kitchen page mixes a cream paper, dark
  cards and a busy illustration. Every option below has one palette, one ink, one accent, upright body
  copy, and chrome that is either navigation or absent.
- **Easy to read.** 553-character paragraphs in light italic at 16.5px; a 22px italic lead; 14px italic
  on the phone. Every option sets body copy upright in Schibsted Grotesk at 17.5–18px on a 62–66
  character measure (15.5–16px on the phone), with the display face doing the display work only.
- **Easy to navigate.** Neither page has any. Every About option carries section navigation (an index,
  a file plate with a progress rail, or chapter tabs) and every Kitchen option carries search, sort, one
  filter surface instead of four rows, and either paging, rails or grouping so the page is never a
  hundred cards at once.

**The backbone all three About options share:** the statement on screen one · facts a visitor came for
(the fee, what coaches pay, verification, languages) · the idea and the two audiences · the letter,
whole and verbatim · the founder before the close · two doors, one per audience · the app page in the
same order with a section switcher.

**The backbone all three Kitchen options share:** search and sort on screen one · every existing filter
with its shipped rules (diet and protein single-select, free-from and goal multi) · the save heart and
the account nudge · a credit on every recipe, in structure rather than in a paragraph · the recipe
pages at `/recipes/<slug>` untouched.

## 3. The About page, three ways

### A1 · The Brief — a new look, light paper

Warm paper (`#f4f1ea`), near-black ink, one teal (the app's light-mode `#0a8f87`). Anybody 500 for
display, Schibsted Grotesk for everything else, Doto for the few figures.

**Website.** Hero: eyebrow, the brand line, a three-sentence lead composed from the letter's own
sentences, and a **contents index** on the right (01 The idea · 02 For coaches and members · 03 The
letter · 04 The founder · 05 Join, with "4 min read · 800 words") that is sticky in the build and
lights the section in view. A **four-fact strip** under it: $5/mo · $0 to join · Verified on intake ·
13 languages. Then numbered sections on a 260px label column: the idea, the two audiences as two
teal-ruled columns, the letter at 18px/1.7 on 66ch with pull-quotes as left-ruled callouts inside the
column, the founder as portrait + name + role + bio, and two doors (Get the app · Become a coach).

**App.** Cream paper (theme tokens, so Black works the same): the brand line, a two-line lead, a **chip
row** (The idea · Coaches · Members · The letter · Founder · Join) that scrolls to each section, the four
facts as a 2×2 grid, the sections, the founder, the two doors.

**What it fixes:** reading (upright 18px on 66ch), navigation (index + anchors + chips), hierarchy
(statement → facts → idea → audiences → letter → founder → doors; the fee and who it is for are on
screen one). **Risk:** a light page beside a dark homepage is a register change, though the Kitchen page
is already light. **Cost:** the lightest build; no new assets; the app adds a chip row and four fact
strings.

### A2 · The Dossier — the current system, evolved, dark

The homepage's ink (`#06090f`) and teal pair (`#34d6c5` / `#0a8f87`), the plate with its notch and
spine, Doto for figures, Anybody at width 90 for the headline, Schibsted for body. **Every decorative
element of today's page becomes a working one:** the side rule becomes a progress rail whose ticks
light with the section in view; the contents becomes a **file plate** that is sticky and opens the
sections; the numbered ledger heads (the 2px ink→teal rule) are anchors.

**Website.** Hero left, file plate right (01–05, "4 min read · 800 words" in Doto). 01 The idea with a
right-aligned kicker. 02 Two audiences as two plates, warm spine for coaches and teal for members. 03
The letter at 17.5px/1.72 on 66ch with a teal Anybody drop cap and the two pull-quotes as plates. 04
The founder with the portrait in a notched frame with a spine. 05 Join as a plate with two chamfered
buttons.

**App.** Black paper: the brand line, the lead, a **segmented switcher** (Idea · Letter · Founder ·
Join) sticky under the hero, the ledger-ruled section heads, the two audience plates, the letter, the
founder, the join plate.

**What it fixes:** the same three, without a brand decision. **Risk:** still a dark page of long copy;
readability rests on the measure and size the concept sets. **Cost:** an IntersectionObserver for the
rail and the sticky plate; everything else is CSS. Closest to today's brand.

### A3 · The Chapters — a new look, deep teal, in chapters

A ground the site has never used (`#0d2b2a`, the accent's own family), bone type (`#f2ede4`), one
bright teal (`#5fe6d6`), warm (`#ffb454`) for the founder's role line. **The 800-word letter becomes
five chapters you tab between**: 01 The coach · 02 The plan · 03 The score · 04 The people · 05 The
founder. Each chapter is 60–90 words quoted from the letter beside a **real capture of that part of the
app** (`getapp-train-v3`, `getapp-nutri-v3`, `getapp-score-v3`, `getapp-community-v2`, all of which the
site already ships, each labelled "example account" on the image); the fifth is the portrait and the
bio. The full letter is one tap below, behind "Read the founder's letter in full". Then the founder and
the two doors.

**App.** The page's own deep-teal ground (the precedent is Radio, which derives its own palette): a chip
row of chapters, one chapter per screen with its capture, next/previous, the letter accordion, the
founder, one door.

**What it fixes:** reading (90 words per screen; the whole letter opt-in), navigation (tabs + next/
previous), and it *shows* every claim beside the screen that makes it true. **Risk:** the biggest
register change, a page-owned palette, and five captures to keep current. **Cost:** the chapter texts
are excerpts, which is an edit of the letter's order; the five cuts want the owner's eye.

## 4. The Shape Kitchen page, three ways

### K1 · The Pantry — light catalog

Paper `#f6f2ea`, white cards, the light-mode teal. **Search on screen one** beside the name and a
one-line statement (the counts are measured: 35 by Shape pros, 65 from the public record). Fifteen
chips become **five menus in one sticky row** (Diet · Protein · Free from · Goal · Time), plus Saved and
Sort; active filters render as removable chips under the row. Three rails answer the questions people
arrive with, each computed from the catalog and each answering a *different* one: **Under 20 minutes**
(quickest first), **High protein** (most protein first, excluding the first rail), **From Shape's
nutritionists and dietitians** (excluding both). Then **All recipes**, A–Z, 24 at a time with "Show 24
more". A card is a thin diet-colour rule, the byline (pros in warm, USDA in grey), the title, time ·
kcal · serves, and the three macros as Doto readings; the 150px empty gradient is gone. Light cards on
light paper: one world.

**On a phone:** search, a horizontal chip row of the five menus (sticky), the rails as horizontal
scrollers, then a one-column grid of 24. About six screens before "show more" instead of 42.

**Risk:** none to the brand; the kitchen illustration goes (if wanted, it belongs behind the top band
at low opacity, never under body copy). **Cost:** search is new (a client-side match over title,
ingredients and byline; no route); rails and paging are presentation over the existing data.

### K2 · The Index — the current system, evolved, dark

The site's dark chrome and the app's instrument grammar. A **left rail** (sticky) holds every filter as
a checklist with counts, marked "pick one" (Diet, Protein, Time) or "any" (Free from · goal) so the
shipped single/multi rules are visible. The results open with a **directive plate**: "Tonight · under
20 minutes · high protein — 12 recipes fit tonight" with the three quickest named, computed from the
catalog. Then a segmented sort (Time · Kcal · Protein · A–Z) and a grid of **plates**: diet colour as
the spine, Doto readings for time · kcal · protein · serves, a protein/carbs/fat proportion bar, two
tags and the diet, a chamfered save control. 24 at a time.

**On a phone:** the rail becomes a **Filters** button that opens a sheet (the one piece of new UI in
this option), the directive plate stays, plates in one column.

**Risk:** a dark food page with no photography is carried entirely by the plates; if photos arrive, this
is the option that changes most. **Cost:** the filter sheet; radio-vs-checkbox semantics in the rail.

### K3 · The Menu — a new look, bone paper, green ink, terracotta

The most different: a **typographic list grouped by cooking time** (the only grouping every recipe
supports today), read the way a kitchen reads a menu. Bone paper (`#f4eee2`), deep-green ink
(`#1e2a26`), terracotta (`#b7442b`) for the course numerals and the pro bylines, teal on the controls.
A centred name and statement; a toolbar with search and the filters as toggles (the separators mark
the single-select groups); a **sticky jump row** (Under 15 minutes 14 · 15 to 30 39 · 30 to 60 28 · Over
an hour 19 · From Shape pros 35 · Saved); **Today's board** with three dishes in large type and their
own notes; then four courses, each row one line: title, diet tag, byline, then the readings (time,
kcal, P, C, F) in Doto and a save heart. Long courses page with "Show all N".

**On a phone:** rows wrap to two lines, the jump row stays sticky, two board dishes.

**Risk:** a new palette on one page is a brand decision; no room for photos without a redesign
(a thumbnail per row would be the first change). **Cost:** small; a list is cheaper than a grid.

## 5. Carry-over

Every element on today's pages and where it lives in each option.

| Today · About | A1 | A2 | A3 |
|---|---|---|---|
| Hero line "A place for helping shape a lifestyle" | kept | kept | kept |
| 90-word italic lead | replaced by a 3-sentence lead from the letter's own words | same | 2-sentence lead (p7) |
| "The idea" headline + the two audience paragraphs | 01 + 02 (two ruled columns) | 01 + 02 (two plates) | quoted inside chapters 01 and 04; verbatim in the expander |
| The letter, 7 paragraphs + 2 pull-quotes | 03, verbatim, pulls inside the column | 03, verbatim, pulls as plates | chapters quote it; whole letter in the expander |
| Founder card (portrait, name, role, bio) before the CTA | 04 | 04, notched frame | chapter 05 + the block before the doors |
| "Join the community" + one button | 05, two doors | 05 plate, two buttons | two doors |
| Grain · spotlight · hairlines · column guides · crop marks · side rulers | removed | removed; the rail becomes a progress indicator | removed |
| App: 44 keys, signed name unkeyed, `shape:goCommunity` CTA | all kept + chip row (6 keys) + 4 facts | all kept + segmented control (4 keys) | all kept + 5 chapter names and headlines |

| Today · Kitchen | K1 | K2 | K3 |
|---|---|---|---|
| Sourcing paragraph before the grid | a one-line statement with the counts; credit on every card | same; credit on every plate | same; credit on every line |
| LIBRARY (All · Saved) | Saved in the menu row | Library group in the rail | Saved in the jump row |
| DIET (single) · PROTEIN (single) · FREE FROM (multi) · GOALS (multi) | five menus, same rules | rail checklists marked "pick one" / "any" | toggles with separators marking the groups |
| Result count + Clear | count in the section head; active chips with × | "100 recipes · showing 12" + Reset | counts in the jump row |
| 100-card grid, 150px gradient hero, 8 elements per card | three rails + A–Z grid, 24 per page, 6-element card | directive plate + plate grid, 24 per page | courses by time, one-line rows |
| Save heart + account nudge | kept | kept | kept |
| Kitchen illustration | removed | removed | removed |
| Empty states (no matches · empty library) | kept, in the section | kept | kept |

## 6. Recommendation and build order

**About: A2 · The Dossier.** It fixes reading and navigation without a brand decision, reads as the
same product as the homepage and the app, and reuses the plate grammar the app already ships. A1 is the
right pick if the goal is "a professional company page" first and a light About page beside a dark
homepage is acceptable; A3 is the right pick if showing beats telling and a page-owned palette is
acceptable.

**Kitchen: K1 · The Pantry.** The largest gain per unit of change (42 phone screens become about six),
no new tokens, and it stays light like the page is today. K2 is the most Shape-looking and the best fit
if the site's chrome should win over the page's subject; K3 is the fastest to scan and the most
distinctive, at the price of a new palette.

**Build, per page, one PR each, the app's About page in the same PR as the website's:**
1. About: the page module (`about.jsx` is CRLF-stored; read and write it as bytes), the app page
   (`BSAboutPage`, keeping all 44 keys; the switcher's 4–6 new keys × 13 locales, each composed from the
   catalog's own words), the guards re-anchored (`tests/about-page-i18n.test.mjs` pins the drop cap, the
   NBSPs, the arrow and the ≥40 `tr()` calls; every option keeps all four).
2. Kitchen: `recipesPage.jsx` only (plus its tests; `tests/recipe-render.test.mjs` compiles and renders
   the page with `@babel/preset-react`, so the new page must keep rendering under a stubbed shell and
   never dereference `.by` on a sourced recipe).
3. No migration in either. No route in either (search is client-side over 100 recipes).

## 7. Owner rulings needed

1. **The pick, per page.** A1 / A2 / A3, and K1 / K2 / K3.
2. **New copy.** The four fact-strip lines, the two door labels ("Get the app", "Become a coach"), and
   A3's five chapter headlines are the only new sentences on the board; everything else is the shipped
   copy verbatim. The fee lines restate the Pricing page's own terms.
3. **A3 only:** whether the app page may own its palette (the Radio precedent) or must stay on theme
   tokens; and the five chapter cuts.
4. **K3 only:** whether bone, green ink and terracotta may exist as tokens on one page.
5. **The kitchen illustration** (`shape-kitchen-bg.png`): retired, or kept behind the top band at low
   opacity. No option puts it under body copy.
6. **"Apply in 10 minutes"-class claims:** none were introduced. "13 languages" is measured (13 locales
   × 18 namespaces); "Verified on intake" and the fee lines are the Coaches and Pricing pages' own words.

## 8. Method and verification

- The three surfaces were captured **as shipped** through the real entry paths: the website pages
  served from `public/` with the exact unpkg bytes for React, ReactDOM and Babel (their sha384 equals
  the pages' `integrity` attributes, checked), and the app built from `main` = `8652414` and driven
  through the signed-out preview to Settings → Also → About → About Shape, with the viewport grown to
  the scroller's own height so one capture holds the whole page.
- The board was rendered in Chromium at **1280 and 400px** on every tab: **zero page errors, zero console
  errors, zero missing images, zero horizontal overflow** on the board and inside every one of the
  twelve frames. Fonts proven by the width axis (Anybody at `wdth` 50 measures 99px against 448px at
  150 for the same string; a fallback measures the same both ways), not by `document.fonts.check()`,
  which answers true for a fallback.
- ⚠ **Two instrument defects, both in the board, both found by the render rather than by reading.** The
  desktop grid rules leaked into the 390px phone frames (a 320px hero column, three-column grids) because
  the phone overrides reset padding but never `display` or `grid-template-columns`; found as a 298px
  frame overflow and fixed at the source. And the facts strip's tile rule matched the nested value and
  label divs as well as the tiles, which put a border and 20px of padding inside every tile; found as a
  gap that made no sense and fixed by scoping to direct children.
- ⚠ **Three preview states were made honest before publishing.** A first cut showed an active "Under 30
  minutes" chip over a grid labelled "100 recipes", two checked filters over an unfiltered index, and a
  lit "High-protein" toggle over the whole menu. Each was an example state contradicting the count next
  to it; all three now show the unfiltered page the count describes.
- Nothing in `public/`, `mobile-app/` or `src/` was edited. The mobile build in this session produced
  `mobile-app/dist` for the capture only; `public/m` is gitignored and was not republished.
