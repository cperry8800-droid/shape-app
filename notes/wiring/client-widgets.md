# Member dashboard: the widget model

Nov 5, 2026. Applies the coach dashboard's widget model to the member pages. The owner asked: "do the
same thing we did for coaches, make sure not too much data and have widgets for each page that can be
added, dropped, and clients can drag and move widgets to customize certain page layouts to how they
like."

Companion to `wiring/client-audit.md` (sources and statuses come from there). Nothing under
`/home/user/shape-app` was changed.

**Status key** (as in the audit): **WIRED** a live source feeds it today · **DERIVABLE** the data
exists in Shape but the website doesn't read or compute it yet · **NEW** needs a new field, table or
route · **MOCK-ONLY** demo data only.

---

## 1 · Which member pages are boards

| Page | Board or fixed | Why |
|---|---|---|
| Today | **Board** | Already on DashGrid (`dashClient.jsx:854`, tab `today`). |
| Workouts | **Board** | Already on DashGrid (`dashTrain.jsx:902`, tab `workouts`). |
| Nutrition | **Board** | Already on DashGrid (`dashNutri.jsx:456`, tab `nutrition`). |
| Progress | **Board** | Already on DashGrid (`dashProgress.jsx:1525`, tab `progress`). |
| Goal | **Board** | Already on DashGrid (`dashGoals.jsx:614`, tab `goal`). |
| Score | **Board** | Already on DashGrid (`clientScore.jsx:519`, tab `score`). |
| Habits | **Board** | Already on DashGrid (`clientHabits.jsx:249`, tab `habits`). |
| Library | Fixed tool | A browser of what your coaches shared: a list you search and filter, not figures to arrange. No DashGrid today (`clientLibrary.jsx`). |
| Team | Fixed tool | One column per coach with its own actions (message, book, reply). Its summary already lives on Today as the **Your team** widget. No DashGrid today (`clientTeam.jsx`). |
| Profile | Fixed tool | The public living profile; its section order is the profile's own Customize (`livingProfilePage.jsx`), not a board. |
| Settings | Fixed tool | A form: two panes, section nav, one save bar. Same rule as the coach Settings. |

The code already agrees with the suggested split: exactly these seven tabs mount `<DashGrid
role="client">`, and the four tool tabs don't. Nothing needs moving between the two kinds.

**The fixed tabs still feed boards:** Team → Today's *Your team* and Workouts' *From Maya* and Nutrition's
*From Rae*; Library → *From Rae* "sent this week"; Settings → nothing (it's where the layouts' **Reset
all pages** would sit).

---

## 2 · What DashGrid already does, and what's new

| Capability | DashGrid today | For the member boards |
|---|---|---|
| Move a widget (drag) | **WIRED.** GridStack, 12 columns; the whole card is the handle with a mouse, the ⠿ grip on touch (`dashGrid.jsx:1038`, `dgFinePointer` `:823`). | Keep. Customize mode makes it explicit (below). |
| Move with the keyboard | **WIRED.** On a focused ⠿: arrows step through reading order, Home/End to either end, Shift+←/→ step the width (`dashGrid.jsx:1111-1126`). | Keep; the Score shot shows it. |
| Resize (column span) | **WIRED engine, narrow widths.** Right-edge handle, snapping to the widget's `widths`; default `[6, 12]` (Standard, Wide), Compact 4 only for coach Notes (`dgWidths`, `dashGrid.jsx:817-820`). | **DERIVABLE:** declare `widths` per member widget so the spans the mock-ups use (3, 4, 5, 7, 8, 12) are reachable. No engine change. |
| Placeholder while dragging / resizing | **WIRED.** GridStack placeholder, dashed teal (`dashGrid.jsx:192`). | Keep; the Nutrition shot's ghost is that placeholder, plus a tip with the span in words (**NEW**, small). |
| Taller widgets beside shorter ones | **WIRED.** Heights fit content (cellHeight 2, `float: false`, `dashGrid.jsx:1025-1033`). | Today's timeline, Nutrition's meals, Goal's lead and Habits' list span two rows of neighbours with no change. |
| Hide (×) | **WIRED.** Stored in `hidden` per tab. | Keep; show the fold-to-bar with Undo (the Goal shot) — Undo is **WIRED** (`dashGrid.jsx:917`), the bar is **NEW** styling. |
| Add from a catalog | **WIRED engine, empty for members.** A widget declared `optional: true` (+ `blurb`) is off until added, stored in `added` (`dashGrid.jsx:39-108`). Only the coach Today declares optional widgets (`dashToday.jsx:1990-2051`); **no member tab declares any**, so a member's catalog can only re-add what they hid. | **DERIVABLE:** declare each catalog widget below as `optional: true` with its `blurb`. This is most of the work, and it's per page. |
| Catalog grouped by category, with search | **NEW.** Today's catalog is a popover list with Add/Remove and Reset (`DgCatalog`, `dashGrid.jsx:521-611`). | **NEW:** a `group` field per widget and a drawer that opens beside the board (pushing it aside, as the coach mock-up does), with search. |
| Drag a widget in from the catalog | **DERIVABLE.** The vendored GridStack 11.5.1 has `setupDragIn` / `acceptWidgets`; DashGrid doesn't use them. | Wire it (the Today shot shows a card carried onto a drop slot). Add stays a one-tap key too. |
| Reset to default | **WIRED, no confirmation.** "Reset layout" in the catalog popover (`dashGrid.jsx:611`). | Add the confirmation that says what changes and what doesn't (the Habits shot): **NEW**, small. |
| Per-widget settings (⚙) | **WIRED.** `settings: [{ key, label, options, value, onPick }]`; no ⚙ when a widget has none (`dashGrid.jsx:268-277`). | Use for widget options (Trend's window, Week's lanes, Water's unit). |
| Saved per tab, per account | **WIRED.** `user_goals` `dashboard_layout`, by role and tab, with `items`, `hidden`, `added` (`dashGrid.jsx:5`, `:678`). | Keep. |
| Named dashboards | **WIRED.** Save as…, Rename, switch; up to 20 per role, each a full set of tabs (`dashGrid.jsx:620-809`). | Keep, but move it into Customize as "Saved layouts ▾" instead of a toolbar row on every page. |
| Phone | **WIRED.** One column under 768px, reorder with ⠿, phone order saved separately, no resize (`dashGrid.jsx:232`, `:1438`). | Keep. |
| An explicit Customize mode with Done | **NEW (UI only).** Today the chrome is always there, faded, and the toolbar row ("Dashboard · My dashboard ▾ · Save as… · Rename · Undo · Widgets" + a help line) sits on top of all seven tabs. GridStack's `enableMove` / `enableResize` are already toggled at runtime (`dashGrid.jsx:1082-1083`). | **NEW:** one **Customize** key in the page header opens the mode (edit bar, every widget's chrome and ↔ shown, board steps back); **Done** closes it. Outside the mode, cards don't move by accident and the toolbar row is gone. |
| "Empty" widgets | **WIRED.** `empty: true` gives no grid item and a catalog row saying why (`dashGrid.jsx:7-27`, `:112-120`). | Use for conditional widgets: *Log it after*, *Your first 30 days*, *The read*, *Your goals* (two or more goals). |

---

## 3 · The pages

Each board ships a **lean default** (at most six widgets, one question each, all on the first 900px at
1440 × 900) and a **catalog** grouped by category. Spans are columns of 12.

### Today — "What do I do today, how am I doing, what's next with my coaches?"
Mock-up `clientmock/today-v1.html`; Customize `clientprop/today-v1-customize.png` (**the catalog open, and
Shape Score being dragged from it onto a drop slot**); catalog `clientprop/today-v1-catalog.png`.

**Default board** (6, fits: last widget ends at 895px)
| Widget | Span | Answers | Status |
|---|---|---|---|
| Your move | 8 | What's the one thing today, and who said so? | NEW route over the WIRED engine (`GET /api/client/directive`; coach override WIRED) |
| Up next | 4 | What's next, and how do I join? | WIRED (plan + sessions); call link DERIVABLE (`meeting_url` via `/api/calendar`) |
| Today | 5 (tall) | What's in my day, in order? | WIRED (plan, meal log); tonight's prep DERIVABLE (`prepAhead.mjs`) |
| Fuel left | 3 | What's left to eat and drink? | WIRED (`/api/client/nutrition`, plan targets, `/api/client/hydration`) |
| This week | 4 | How's my week going? | WIRED (sessions, food logs); "protein hit" per day DERIVABLE (snapshot `protein_g`) |
| Your team | 7 | What did my coaches send, or what are they waiting on? | Note DERIVABLE (`coach_focus_banners`); unread DERIVABLE (conversations); check-in WIRED |

**Catalog**
| Group | Widget | Answers | Status |
|---|---|---|---|
| Direction | Shape's 30-day read | Sessions, food and weight in one line | NEW (the directive route's `read.summary30d`) |
| | Nora's suggestions | Four things Nora can do for you now | WIRED (`noraGreeting.mjs` via `/api/support/chat`) |
| Your day | Tonight's prep | What to make ahead for tomorrow | DERIVABLE (`prepAhead.mjs:188`) |
| | Next session | The workout, every move | WIRED (`/api/client/plan`) |
| | Habits today | What's left to tick | WIRED (`/api/client/habits`) |
| Food | Today's meals | Each meal, with Log and Swap | WIRED |
| | Water | Litres today, against your target | WIRED |
| | Grocery list | This week's shopping | WIRED (`/api/client/grocery`) |
| Progress | Shape Score | Points, tier, distance to the next | WIRED (`/api/client/score`) |
| | Goal · the climb | How far to the goal, and when | WIRED (goals + weigh-ins; projection in `dashSignals.js`) |
| | Milestones | Earned, and next | DERIVABLE (needs the full record the directive route builds) |
| Team | Messages | Unread from your coaches | DERIVABLE (conversations) |
| | Weekly check-in | Sent, due, and who replied | WIRED (sent / due) · NEW (reviewed / replied) |
| Extras | Shape Radio | What's playing now | WIRED (`/api/radio/now-playing`) |
| | Your first 30 days | Setup steps, ticked from your records | WIRED (`/api/client/onboarding`); `empty` after day 30 |

### Workouts — "What's my next session, and where am I in the program?"
Customize `clientprop/workouts-v1-customize.png` (**a move: Recent sessions carried over its drop slot at
the start of row 3**); catalog `workouts-v1-catalog.png`.

**Default board** (6; the bottom row ends 8px under the fold, kept since all six start on the first
screen and *Log it after* is conditional)
| Widget | Span | Answers | Status |
|---|---|---|---|
| Next session | 8 | What's next, and how do I start it? | WIRED (plan); the QR session link NEW |
| From Maya | 4 | What did Maya say about this session? | DERIVABLE (coach note / cues on the plan row) |
| Program | 12 | Where am I in the 10 weeks? | WIRED (plan rows + completed sessions) |
| This week | 4 | Which days are done and which are left? | WIRED |
| Log it after | 4 | Did I do the one I missed? | NEW (a web log for a planned session; `empty` when nothing is unlogged) |
| Recent sessions | 4 | Did I do what was planned? | WIRED (`/api/client/train`) |

**Catalog**
| Group | Widget | Answers | Status |
|---|---|---|---|
| This session | Every move, in full | Sets, loads and cues | WIRED |
| | Book with Maya | Her open times this week | WIRED (`/api/availability`, `/api/sessions/request`) |
| The program | Build your own week | Plan days yourself, or ask Nora | WIRED (`/api/client/self-training`, `/api/ai/draft-program`) |
| | Maya's videos | Program intro and walkthroughs | DERIVABLE (plan rows `video`, `programVideo`) |
| Your record | Strength · e1RM per lift | Is each lift going up? | WIRED (`/api/client/strength`) |
| | Personal records | Your bests, newest first | WIRED (`/api/client/progress` `prs`) |
| | Weekly volume | Pounds lifted, week by week | WIRED (`/api/client/train` stats) |
| | Sessions kept | Planned vs done, by week | DERIVABLE (plan rows × sessions) |
| Music | Shape Radio | What's playing now | WIRED |
| | All Maya's playlists | One per session, opens in Spotify | WIRED (plan row `playlist`) |

### Nutrition — "What do I eat today, and how much is left?"
Customize `clientprop/nutrition-v1-customize.png` (**a resize: Today's meals 5 → 6 columns, the ghost of the
new span, "6 of 12 columns · was 5 · Rae's plan moves down a row"**); dark check
`nutrition-v1-customize-dark.png`; catalog `nutrition-v1-catalog.png`.

**Default board** (5; Today's meals ends at 903px, 3px under the fold)
| Widget | Span | Answers | Status |
|---|---|---|---|
| Your week | 8 | Am I hitting Rae's targets? | WIRED (`/api/client/nutrition` week); protein a day DERIVABLE (snapshot `protein_g`) |
| Fuel left | 4 | What's left to eat today? | WIRED |
| Today's meals | 5 (tall) | What's next, and can I swap it? | WIRED (plan + swaps); prep DERIVABLE |
| Rae's plan | 4 | What's the plan on training and rest days? | WIRED (`/api/client/plan` meals) |
| From Rae | 3 | What did Rae send? | DERIVABLE (`coach_focus_banners`, `coach_pushed_items`) |

**Catalog**
| Group | Widget | Answers | Status |
|---|---|---|---|
| Today | Water | Litres today, against your target | WIRED |
| | Prep tonight | What to make ahead for tomorrow | DERIVABLE |
| | Swaps | Rae's approved alternates for today | WIRED (plan `alts`) |
| | Quick log | A meal or snack in one tap | WIRED (`/api/nutrition/meal-log`) |
| Your week | Logging streak | Days in a row with food logged | WIRED (`currentStreak`) |
| | Protein by day | Grams a day against 150 | DERIVABLE |
| | Water by day | The last seven days of water | DERIVABLE (snapshot `hydration_l`) |
| From Rae | Grocery list | This week's shopping | WIRED |
| | Shape Kitchen picks | Recipes that fit today's numbers | DERIVABLE (catalogue in `recipes.jsx`) |
| | Your own day plan | Meals you planned yourself | DERIVABLE (`client_meal_days`, `mealDays.mjs`) |
| | Saved recipes | Recipes you hearted | NEW (no store; MOCK-ONLY on the live tab today) |

### Progress — "Is it working?"
Customize `clientprop/progress-v1-customize.png` (**the catalog open with a search, "photo": Photo
timeline to add, Then vs now already on the board**); catalog `progress-v1-catalog.png`.

**Default board, trimmed** (4; it was 6, with *Sessions kept* and *Milestones* entirely below the fold at
857–1154px; both moved to the catalog, first in its row). Board now ends at 841px.
| Widget | Span | Answers | Status |
|---|---|---|---|
| Is it working? | 8 | Yes or no, in a sentence, with the lever left | DERIVABLE (`goalBrief` / `projectGoal` + strength + adherence) |
| Then vs now | 4 | What changed since week 1? | WIRED (weigh-ins, measurements, photos) |
| Trend | 7 | Where is my weight heading, and when do I get there? | WIRED (`/api/client/progress`); projection DERIVABLE |
| Strength | 5 | Is each lift still going up? | WIRED (`/api/client/strength`) |

**Catalog**
| Group | Widget | Answers | Status |
|---|---|---|---|
| The verdict | The read · every insight | This week's patterns, from your data | WIRED (`/api/ai/weekly-readout`) |
| | Work × body | How work days change your numbers | WIRED (`crossoverRead`) |
| Body | All measurements | Waist, hips, chest over time | WIRED |
| | Photo timeline | Every progress photo, private | WIRED (`/api/client/progress-photos`) |
| | The cycle | Phase, and what it means for training | WIRED (`cyclePhase.mjs`) |
| | Your mornings | Sleep and energy, in words | DERIVABLE (`memberMornings.mjs` reader exists server-side) |
| Training | Sessions kept *(was default)* | Planned vs done, week by week | DERIVABLE |
| | PR history | Every best, newest first | WIRED |
| Earned | Milestones *(was default)* | What you've earned, what's next | DERIVABLE (full record) |

### Goal — "Am I on pace, and when do I get there?"
Customize `clientprop/goal-v1-customize.png` (**a hide: Your why folded to a bar, "off your board, it stays
in the catalog", with Undo**); catalog `goal-v1-catalog.png`.

**Default board, trimmed** (4; *Your goals* moved to the catalog and joins the board by itself when there's
a second goal, with "＋ Add a goal" now in the page header; *Your why* became one full-width row). Board now
ends at 839px; it ran to 981.
| Widget | Span | Answers | Status |
|---|---|---|---|
| Goal lead (climb) | 8 (tall) | When do I reach it at this pace? | WIRED (goals + weigh-ins + projection); fix B2 first (oldest-104 read) |
| Pace check | 4 | Is the date slipping week over week? | DERIVABLE (recompute last week's projection; `goalSlipDays`) |
| What holds the pace | 4 | Which one number is off its target? | WIRED (nutrition averages vs plan targets) |
| Your why | 12 | Why I'm doing this, and who sees it | WIRED (`user_goals` doc + share setting) |

**Catalog**
| Group | Widget | Answers | Status |
|---|---|---|---|
| Your goal | Your why | Your words, and who sees the goal | WIRED |
| | Your goals · all of them | Every goal, and add another | WIRED (coach goals + self goals, max 3); `empty` with one goal |
| | Goals you've reached | The ones you've banked | DERIVABLE |
| Records | Weigh-in log | Every weigh-in; edit or add one | WIRED (`client_weigh_ins`) |
| | Measurements | Waist, hips, chest | WIRED |
| | Milestones | Halfway, 75% and next | DERIVABLE |

### Score — "How far to my next reward, and the fastest way there?"
Customize `clientprop/score-v1-customize.png` (**a keyboard move: Your rewards' grip focused, stepped to
row 2, first place, with the real DashGrid keys**); catalog `score-v1-catalog.png`.

**Default board** (5, fits at 878px)
| Widget | Span | Answers | Status |
|---|---|---|---|
| Your next reward | 8 | How far, and roughly when? | WIRED (`/api/client/score`); the pace date DERIVABLE |
| Fastest way | 4 | What adds the most this week? | DERIVABLE (ledger categories + commitment + plan) |
| Last 7 days | 4 | What earned this week's points? | DERIVABLE (`score_ledger` by category, 7 days) |
| Where it comes from | 4 | What makes up my total? | WIRED (`breakdown_total`) |
| Your rewards | 4 | What can I claim? | WIRED (`/api/store/tier-rewards`) |

**Catalog**
| Group | Widget | Answers | Status |
|---|---|---|---|
| Your climb | All five tiers | Raw to Legend, and each reward | WIRED |
| | Twelve weeks | Points week by week | WIRED (`/api/client/score-record`) |
| This week | Momentum | 72 of 100, the weekly bonus | WIRED (`compute_momentum`) |
| | This week's commitment | Points staked, and progress | WIRED (`/api/client/commitment`) |
| Your points | Every point · the record | Each entry, newest first | WIRED |
| | Leaderboard spot | Where you rank among friends | WIRED (`/api/leaderboard`) |

### Habits — "Which habits are left today?"
Customize `clientprop/habits-v1-customize.png` (**Reset to default's confirmation: what returns, what leaves
the board, what isn't touched**); catalog `habits-v1-catalog.png`.

**Default board** (3, fits at 832px)
| Widget | Span | Answers | Status |
|---|---|---|---|
| Left today | 7 (tall) | What's left, and add one in place | WIRED (`/api/client/habits`; 3 points a tick) |
| Last 7 days | 5 | Which days slipped? | WIRED (90-day history in the same read) |
| Who sees them | 5 | Who hears if I miss one? | WIRED (visibility + `habit_watchers`, cron `habit-watch`) |

**Catalog**
| Group | Widget | Answers | Status |
|---|---|---|---|
| Today | Reminders | When each habit nudges you | WIRED (`habit_reminders`) |
| History | 90 days of ticks | Each habit over three months | WIRED |
| | Work habits | Just your workday ones | WIRED (`domain: 'work'`) |
| Sharing | (Who sees them is on the board) | | |
| From your watch | Steps | Today's steps against your goal | WIRED (snapshot via integrations) |
| | Sleep nights | 7 h or more, night by night | WIRED (snapshot) |

---

## 4 · Customize mode (one shared script for all seven)

`clientmock/clientcustomize.js` + `clientmock/customize.css`, linked from each board page. On the normal
page they only wire the page's single **Customize** key. With `#customize`:
- an **edit bar** replaces the page header: "Customizing your <Page>" · ⠿ drag to move · ↔ to resize ·
  ⚙︎ settings · × hide · **＋ Add a widget** · **Reset to default** · **Done**;
- the **board steps back** (zoom .92, or .84 with the catalog open) and every widget wears its chrome and
  ↔ handle;
- **＋ Add a widget** opens the page's **catalog beside the board**, pushing it aside: on-board widgets
  ticked in each group's head, the rest with Add (or drag in), search at the top;
- **Done** returns to the normal page.

`#customize-catalog` opens any page's catalog with no other interaction (the `-catalog.png` shots).

| Page | Interaction shown |
|---|---|
| Today | Catalog open; **Shape Score dragged from the catalog** onto a drop slot ("Adding…" in the drawer). |
| Workouts | **Drag to move:** Recent sessions carried over its drop slot. |
| Nutrition | **Resize:** handle lit at the new edge, a ghost of the new span, "6 of 12 columns · was 5". |
| Progress | **Catalog search:** "photo" → one to add, one already on the board. |
| Goal | **Hide:** the widget folds to a bar with Undo; it stays in the catalog. |
| Score | **Keyboard move:** the grip focused, the card stepped one place, the real keys. |
| Habits | **Reset to default:** the confirmation. |

Checked at 1440 × 900 (DSF 2), plus Today and Workouts at 1280 and Nutrition on the dark paper; no
horizontal scroll. AA: every Customize label passes in both papers (`clienttools/contrast-cz.js`); the kit's
drop-slot label was 4.43:1 on White and is lifted to 5.3:1 in `customize.css` (worth taking into the coach
kit, with the dark `--ink3` fix already in the member kit).

---

## 5 · Build notes (mapping onto DashGrid)

1. **Declare the catalogs.** Per tab, each catalog widget becomes `{ key, title, blurb, group, widths,
   optional: true, empty, render }`. `blurb` is the "Answers" line above; `group` is new (the drawer's
   grouping); `widths` lists the spans the mock-ups use.
2. **Trim the live defaults to the lean boards above.** The live tabs carry more defaults than these
   (Today 8, Progress 13, Score 8, Habits 7). Widgets that leave the default become `optional: true`, so a
   member who never customized gets the lean board, and one who did keeps their layout: `dgResolveGridLayout`
   already keeps a saved layout's items and `hidden` and treats unknown keys safely.
3. **Customize mode** wraps the existing grid: `enableMove` / `enableResize` on while it's open, off
   otherwise; the toolbar row and help line go; Saved layouts (named dashboards) move into the edit bar.
4. **The catalog drawer** replaces the popover (`DgCatalog`), with group heads, search, Add, and drag-in via
   GridStack's `setupDragIn` + `acceptWidgets`.
5. **Small new pieces:** the resize tip with the span in words, the hidden bar with Undo, and Reset's
   confirmation.
6. **Data first where a default widget isn't wired:** the directive route (Today's *Your move*; Progress's
   verdict reads better with it), the coach note and pushed items read (Today, Nutrition), the call link,
   and a planned-session web log (*Log it after*). The audit's build order already puts these first.

---

## 6 · Files

- `clientmock/clientcustomize.js` (new): the shared Customize state and every page's catalog.
- `clientmock/customize.css` (new): the Customize styles.
- Board pages, each now linking the two files above: `clientmock/today-v1.html`, `workouts-v1.html`,
  `nutrition-v1.html`, `progress-v1.html`, `goal-v1.html`, `score-v1.html`, `habits-v1.html`.
  - `progress-v1.html`: Sessions kept and Milestones moved to the catalog (CSS + two catalog chips).
  - `goal-v1.html`: Your goals moved to the catalog, "＋ Add a goal" in the header, Your why full-width.
  - Copies from before these two edits: `clienttools/progress-v1.before-widgets.html`,
    `clienttools/goal-v1.before-widgets.html`.
- Customize shots (1440 × 900, DSF 2): `clientprop/<tab>-v1-customize.png` for today, workouts,
  nutrition, progress, goal, score and habits. Catalog-open shots: `clientprop/<tab>-v1-catalog.png`
  for the same seven. Extra checks: `today-v1-customize-1280.png`, `workouts-v1-customize-1280.png`,
  `nutrition-v1-customize-dark.png`.
- Re-rendered after trimming: `clientprop/progress-v1.png`, `progress-v1-1280.png`, `goal-v1.png`,
  `goal-v1-1280.png`.
- Tools: `clienttools/czshot.js`, `clienttools/measure.js`, `clienttools/contrast-cz.js`.
