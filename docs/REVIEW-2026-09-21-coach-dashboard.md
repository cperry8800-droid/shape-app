# The coach dashboard on the website — review, and the widget catalogue that shipped

**2026-09-21 · trainer + nutritionist dashboards at `public/newdesign/` · branch `claude/zen-thompson-p7y5vh`**

Owner's ask, in order: *"can you do a review of the trainer and nutritionist dashboard and how we can
improve the UI. Also lets add different widgets that can be added or deleted. Keep the ability to drag
and drop different widgets in each tab on dashboard."* → *"i am referring to website"* → *"like check
the edit and create workout/plans pages"* → *"how to improve those features"* → *"also edit profile,
what you can cuustomize"* → *"also can you check my activity feed when im logged in"* → *"make sure
widgets are relevant and would actually be used by coaches"* → *"show me previews"* → *"include all the
ones you made along with optional and drop the ones you said drop."*

Previews the ruling was made against: https://claude.ai/artifact/3Bsca3PoxHB1N2KhExKqeC

⚠ **Every figure in this file was measured in this session** — in headless Chromium against the working
tree, or re-derived from the source at the line cited, or queried from the live database. Nothing is
carried from memory. Where a claim could not be re-derived it says so.

---

## 1. What shipped

An always-visible **＋ Add widget** control above the grid on **every** `DashGrid` tab, and **seven**
optional Today widgets, all off by default. The arrangement is remembered per account, per role, per
tab. Drag-to-move and corner-resize are untouched.

The seven, in the order the owner's board presented them:

| Widget | What a coach opens it for | Derived from |
| --- | --- | --- |
| Programs ending soon | Write the next block **before** the last session. Links into the builder. | the assignment the roster already carries (`week N of M`) |
| Week ahead | How heavy each of the next seven days is, and when it starts | the calendar already on the page |
| Top movers | Who to praise, who to check on | each client's shared Shape Score, **two complete weeks only** |
| Client anniversaries | A retention message on the day someone hits a tenure mark | each client's subscription start date |
| Revenue by client | Who the practice rests on — per client, which exists nowhere else | the subscription rows the roster already sums |
| Roster by status | The proportion needing attention, at a glance | the same signal engine the pulse uses |
| Notes to self | The sticky note on the monitor, kept with the account | `user_goals('dashboard_prefs')` |

**Dropped by ruling:** Quick actions. Five of its six links were the sidebar; only *Message a client*
was not already one click away. Its panel, its entry and its export are deleted, and
`tests/dash-widget-catalog.test.mjs` asserts it cannot come back as a widget.

⚠ **NO ROUTE AND NO MIGRATION.** Every derivation reads state the page already holds. A widget that
needed a request would be a figure nobody on that screen had measured — the same constraint that
decides what may be in the KPI pool.

### How the catalogue stores a choice

The engine works on **one effective hidden list**; `dgSplitHidden` writes the two lists the document
holds. A default widget's OFF state goes to `hidden`; an optional widget's ON state goes to `added`.

⚠ **A DOCUMENT WRITTEN BEFORE THE CATALOGUE EXISTED HAS NO `added` AT ALL, AND THAT MUST READ AS
"NOTHING ADDED".** The other reading — absent means show everything — would put seven widgets on every
coach's board unasked, which is the one thing an opt-in catalogue must never do. Pinned by
`tests/dashboard-layout.test.mjs`, in both directions: `resolve(split(h)) === h` for every effective
list, so a reload cannot silently rearrange the board a coach just arranged.

---

## 2. What the review found, and what was fixed with it

Each measured against a control — a worktree of `origin/main` served on its own port and driven by the
same script.

### 2.1 The card controls were invisible, and under the floor

`.dash-wchrome` was `opacity: 0` until `:hover` — so on a dashboard nobody had been told was
configurable, **nothing on a card said it could be moved, resized, configured or hidden.** Measured on
`main` at 1440: the drag glyph **13×12**, the gear **18×18**, the hide button **18×18**, the resize
corner **12×12**.

Fixed: the chrome rests at **0.4** and goes to 1 on hover or focus-within (and is always 1 on a touch
screen, which has no hover). Every control is a **24px** box with the glyph unchanged inside it.
Measured after: cluster **53×24**, both parts **24×24**.

⚠ **AND THE FLOOR IS THIS REPO'S OWN — WCAG 2.5.8 AA AT 24px, never Apple's 44pt HIG suggestion**, which
this log has twice recorded being quoted from memory and being wrong.

Two more controls on the same page failed it and were **pre-existing**: the pulse's pin flag at
**20×27** and the business summary's link at **233×12**. Both are closed. A guard covering only the new
widgets would have been a claim about seven elements on a page with two that fail, so the guard covers
the page. **Measured after the fix: zero controls under 24px anywhere on Today.**

### 2.2 A phone could not keep a widget it added, and a hide from a phone overwrote the desktop

`persistFromGrid` correctly refuses to write while GridStack is collapsed to one column — a phone's
layout is a *view* of the arrangement, not the arrangement. But:

- `restore()` wrote **through** that function, so the refusal took the `added` write down with it: a
  widget added from a phone rendered, and was **gone on the next load**, with nothing saying so.
- `hide()` wrote `grid.save()` **unguarded**, so hiding a card from a phone upserted the one-column
  projection over the coach's desktop arrangement — the exact write the guard exists to refuse.

Both now go through one `persistVisibility`, which carries the **saved** items forward while the grid is
collapsed and moves only the hidden/added split. *A visibility change is a fact about which cards, and
is written whatever the column count.* Measured at 390px: adding writes `added:["week"]` with the seeded
`items` byte-unchanged; hiding writes `hidden:["wins"]` the same way.

### 2.3 The dashboard was writing the whole layout document dozens of times per visit

Measured on `main` with a stubbed store: **24 whole-document upserts on a page load before anyone
touched anything** (the height-fit effect fires `change` per item, per pass), and **22 more on a single
hide**. Every one replaced the account's entire `dashboard_layout` document.

Fixed with a trailing debounce plus a skip when the document is byte-identical to the last one written;
a pending write is flushed on teardown and on `pagehide`, so the debounce can never cost a coach the
drag they made before leaving. Measured after, same script, same stub: **1 and 1**.

### 2.4 The catalogue panel was unreachable from a keyboard

The panel is portaled to the end of `<body>`, so Tab from the button landed on the first card's chrome.
Measured: `inDialog: false` on both the open and the first Tab. Focus now enters the panel on open and
returns to the button on close — measured `Remove Client attention` → `Remove Today's schedule` →
back to `Add or remove widgets`.

### 2.5 Tenure was counted with a millisecond quotient

A span that crosses a spring-forward and **not** its matching fall-back — a one-month or three-month
mark straddling March — comes up an hour short and floors a day low, so the anniversary lands a day
late. Counted on the local calendar now (`Date.UTC` ordinals, where every day is 24 hours by
construction). ⚠ **A FULL YEAR IS THE WRONG FIXTURE TO PROVE THIS WITH** — it contains both transitions
and is exact by accident; the first version of that test asserted on a year and proved nothing. The
guard drives New York in a child process, because CI runs in UTC where no day is 23 hours long.

---

## 3. The dashboard, as reviewed

### 3.1 Only three of eleven coach tabs are configurable at all

Derived from `TrainerApp.html`'s own route table and a `DashGrid` reference count per module: of
**today · week · schedule · clients · programs · business · playlists · goal · score · profile ·
settings**, exactly **today, goal and score** render through the grid. The other eight are fixed
layouts. The catalogue is now on all three, and the two the owner is most likely to want next are
**clients** (the roster) and **business**.

### 3.2 Registered, not fixed

- **Today's schedule card leaves dead space.** At 1440 it renders ~213px tall beside a pulse card at
  ~412px, and the grid's float leaves the gap.
- **The chat bubble overlaps the right rail at 1440×900.** Pre-existing, site-wide fixed overlay.
- **At 1024 the sidebar keeps its full 240px** plus the page's own padding, so the content column is
  squeezed on a landscape tablet. At 390 the layout collapses correctly (measured, one column, no
  horizontal overflow, page height 6,717px).

---

## 4. The builders (`dashBuilder.jsx`, `dashMealBuilder.jsx`)

- **The exercise library is a hardcoded table of 75 moves** (`dashBuilderCore.js`, `["name", "muscle",
  "equipment"]` triples), and the picker shows **12** with no query. A coach cannot add a move that is
  not on that list, and cannot see their own. ⚠ *I recorded 76 earlier in this session from a rougher
  count; 75 is the re-derived figure.*
- **The meal builder never calls `/api/nutrition/food-search`.** That route is live — USDA FDC plus Open
  Food Facts — and the builder's only fetch is `/api/nutritionist/meal-plan`. So a nutritionist building
  a plan on the website cannot search real foods, while the app can.
- **`DbuPerformance` is exported and rendered by nothing** (`dashBuilder.jsx:543`, exported at `:621`).
  Dead code that reads as a feature.
- **"1 weeks · 1 days".** The template card interpolates counts into fixed plural nouns
  (`dashBuilder.jsx:613`).

## 5. The coach profile customizer (`dashProfileExtras.jsx`)

What a coach can already customize, from the component: bio, motto, intro film, business card, wins
wall, cover image, accent colour, climb background (seven presets), up to three headline stats, a pinned
highlight, a song, prompts, and five social links. That is a rich surface and the review's finding is
not that it is thin — it is that **two of its controls do nothing**:

- **`Pause coach profile`** (`dashProfileExtras.jsx:341`) is a styled `<button>` with **no `onClick`**.
- **`＋ Post`** on the profile's own feed head is a **`<span>`**, not a control
  (`livingSignal.jsx:133`, `livingDesktop.jsx:644`).

R18's rule applies to both: a control that leads nowhere costs more trust than an absent one.

## 6. The owner's activity feed

Queried live against the owner's own account, at their request. ⚠ **The causes are recorded here and
the account is not** — no address, no post text, no workout dates. A review doc is committed, pushed
and read by people the account holder never chose, and not one of those details is needed to state a
cause or to fix it. All three of the things the screenshot showed have one in the code:

1. **Hand-posted workouts whose title repeats the body.** The composer writes the note into both
   fields when no title is given, so a one-word note becomes a one-word headline over itself.
2. **WHOOP imports titled with the bare sport, and dated years in the past.** The cause is
   `src/app/api/integrations/whoop/sync/route.ts:132` — `created_at: workout.start ?? …`, so an
   imported post is dated by the **workout**, not the import. A backfill therefore lands posts that
   sort to the bottom of a `created_at`-ordered feed forever and read as years old. The title is
   `sport` verbatim (`:107`), whatever the provider happens to return for it.
3. **No stat plate on any of them.** The imported rows carry `labels` and `values` and **no
   `workoutStats`** — checked key by key — so they predate the field the card reads. The route builds
   it today (`:91`, `:120`) and upserts on `source_activity_id`, so **a re-sync would rewrite them**.

⚠ **All three are registered, not fixed.** Changing how an imported post is dated is a decision about
every member's feed ordering, not a side effect of a dashboard PR.

---

## 7. Three widgets I would build next

None can be derived from what the page loads today, which is why they are not in the build. Each is one
field away, and each was sketched on the preview board and labelled a mock.

| Widget | The one thing it needs |
| --- | --- |
| **Waiting on a reply** — who wrote last and has had no answer | the sender on the conversation leg |
| **Nobody booked** — active clients with no session in the next 14 days | the client id on calendar rows |
| **Renewals this week** — who renews, and whose trial ends | the period end on the roster payload |

---

## 8. Verification

- `npm test` **green on the full suite** through the pre-commit gate (4,246 at the first commit).
- `npx tsc --noEmit` **0** · newdesign precompile check **73 pages, 80 shared jsx, 0 errors**.
- **32 mutations, 32 killed, 0 survived**, sanity green at both ends, every file read and written as
  bytes and restored in a `finally` and on a signal; each anchor occurrence-counted before the edit, and
  the suite's own `# pass`/`# fail` parsed rather than read off an exit status. One was skipped for a
  duplicate anchor and re-run uniquely rather than left.
- **Driven in Chromium** at 1440 and 390, signed out and against a simulated signed-in coach: the panel
  inside both gutters at both widths, seven widgets rendering, the two writes measured above, zero
  controls under 24px, **zero horizontal overflow and zero page errors** on every run.

⚠ **NO ON-ACCOUNT PASS.** Every signed-in reading here is a stubbed `window.shapeDb` over a scripted
roster. No real coach has opened the catalogue, and the honest check is a coach adding a widget on their
own dashboard and finding it there on their phone.
