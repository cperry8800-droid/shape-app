# The settings page, three ways — 2026-09-14

**Owner ask:** *"Can you review the settings page on the shape app and come up with 3 new designs for
layout and friendlier UI. settings page when you click on avatar that comes up on app"* → *"i want to
see previews of them"*.

**Previews:** the live concept board — https://claude.ai/artifact/B1JCRUUEsstSt5pDSxWh4B — seven
tabs: **Today · as shipped** (eleven real captures of the production build with the measured figures),
**A · The Index**, **B · The Passport**, **C · The Sections** (each rendered phone-sized on the app's own
tokens in two states, with a Black / Cream paper switch), **Backbone** (what every option corrects),
**Carry-over** (every element on today's page and where it lives in each option) and **Pick**.

**Records only.** No code changed, no migration, no PR. **Recommended: B · The Passport, with A's index
rows behind each tile.** The pick is the owner's; §6 lists the rulings the build would need.

---

## 1. What the page is today (read from the code, measured in Chromium)

**The route in.** The corner avatar on every masthead is `BSMeCorner`
(`mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx:313`), a `BSFacetAvatar` whose tap dispatches
`shape:openProfile`; the client shell answers with `goSettings()` (`:555`, handler `:617–622`), which
pushes a nav entry and opens `BSSettings` (`:31824`, ~2,080 lines) as an **overlay at zIndex 210 over
the still-mounted tab tree**. The two coach shells mount the same component
(`iosAppBroadsheetPros.jsx:1528`, `:6938`), so one page serves three roles.

**The root, top to bottom** (`:33189` onward), all on one scroller:

| # | Block | Source | What it is |
|---|---|---|---|
| 1 | Masthead row · `← BACK` · `EDIT` | `:33191–33199` | Back and Edit are 10 px mono buttons, **13 px tall** |
| 2 | `ACCOUNT` eyebrow · **Settings.** | `:33200–33203` | The eyebrow names a section the page is not |
| 3 | Capacity toggle · waiting room | `:33206`, `:33222` | Coach only, live-gated |
| 4 | Shape Score · Store · About chips | `:33261–33272` | Three 28 px chips; Score and About recur in the hub |
| 5 | Edit-profile form (in place) | `:33273–33362` | Replaces the chips; title stays *Settings.*, `EDIT` stays lit, labels switch to the system sans |
| 6 | **Your plan** card | `:33364–33397` | Honest about Stripe state; **no role gate** |
| 7 | Preview as (signed out) / Profile mode (multi-role) | `:33399–33459` | Demo role switch |
| 8 | **Appearance** (collapsible) | `:33461–33622` | 18 papers · 25 textures · 9 accents · 10 inks · weight — live tiles behind *Customize ▸* |
| 9 | Accessibility · Text size | `:33624–33643` | Three tiles |
| 10 | Language (native `<select>`) | `:33645`, `BSLanguageSetting :31790` | The **real** locale control, 13 locales |
| 11 | Shape Radio toggle | `:33648–33658` | Also a row inside *More* |
| 12 | **Light effects** (collapsible) | `:33660–33792` | 4 modes · 9 colors |
| 13 | **Home ticker** editor | `:33794–33815` | 7 rows × ↑ ↓ (19 × 20 px) + a 34 × 20 px toggle; the sub-label prints the **storage key** (`CAL · PRO · HAB · SLP · HRV · RHR · WGT`) |
| 14 | **"More · 12 sections"** | `:33817–33823`, cards `:33078–33101` | Account · Preferences · Cycle · Nutrition · Training · Health integrations · Notifications · Privacy & data · Membership & billing · **More** · About · Account actions |
| 15 | Sign out | `:33825–33831` | Rust, full width |
| 16 | Footer | `:33836` | `Shape v2.4.0 · Build 2026.04`, typed in |

**Measured on the production build** (Playwright · Chromium · 390 × 844 · DPR 2 · the signed-out
preview's demo persona, Black paper, Teal accent):

| Measure | Value |
|---|---|
| Root scroll height | **2,376 px = 2.8 screens**; 2,960 px (3.5) with Appearance open; 3,187 px (3.8) while editing |
| Distance to the section list ("More") | **1,420 px** — 1.7 screens, under the theme picker, radio, effects and the ticker editor |
| Interactive elements on the root | **57**, of which **35 are under 44 px tall** |
| Distinct type sizes on the root | **15** (7.5 · 8 · 8.5 · 9 · 9.5 · 10 · 11 · 13.5 · 14 · 14.28 · 15 · 16 · 18 · 20 · 30 px) |
| Uppercase mono labels on the root | **50** |
| Sub-label contrast (INK at 50 %, 8–8.5 px mono) | **4.8:1 on Black**, **3.5:1 on Cream**, **3.6:1 on White** — the two light papers fail AA |
| Panes | Account 3 rows · Preferences **11 rows, 1,171 px** · Privacy 4 · Notifications 5 · Nutrition 9 · About 10 |
| Page errors | 0 |

### 1a. What is wrong, in order of cost to the member

1. **The tree is inverted.** Cosmetics — theme, texture, light effects, the order of the Home ticker —
   sit above the member's identity, account, privacy and billing. Everything a person came to change
   about *themselves* is 1.7 screens down under a heading called *More*. ⚠ **"More" holds the whole
   settings tree, and one of its twelve cards is itself called More** (`:33098`, rows `:32879–32897`).
2. **Six control grammars for one kind of decision.** A choice is a switch (Radio, ticker), a
   segmented row (Units, three Privacy rows), a **tap-to-cycle row** whose only affordance is the value
   word (the four Notifications rows, *Share workout data* — `cyclePref :32247` advances through 3–4
   options per tap with no menu), a `▾` dropdown (Week starts, meal times), a tile grid (paper, text
   size) or a native `<select>` (Language). ⚠ The Privacy pane mixes segmented pills and a tap-to-cycle
   row **on one screen** (captured).
3. **Four things appear twice.** Language: the root `<select>` (wired to `ShapeLocale`) **and** a
   Preferences dropdown (`PREF_OPTIONS.language :31981`, five options against 13 shipped locales,
   read by nothing but the card summary `:33024`). Shape Radio: the root toggle and a *More* row. About:
   a shortcut chip and a card. Shape Score: a chip and a *More* row.
4. **Three settings nothing reads.** `timeZone` (six IANA ids rendered as `AMERICA/LOS_ANGELES`),
   `weekStarts` and the Preferences `language` are stored by `setPref` and consumed by no code path —
   measured by grep across the client module and `services/`. A setting nothing reads is a claim the
   app cannot keep. **Nora's voice** (`:32985`) is the reverse: a five-row section, hardcoded English,
   defined in `sections` and **opened by no card** — unreachable.
5. **Targets.** 35 of 57 controls sit under the 44 px floor this repo already records (WCAG 2.5.8 AA
   is 24 px; the house floor is 44): Back and Edit at **13 px**, the three shortcut chips and *Join
   now* at **28 px**, the ticker's ↑↓ at **19 × 20 px**, its toggles at **20 px**.
6. **Type.** Fifteen sizes on one screen; sub-labels and card summaries at 8–8.5 px mono in 50 % ink,
   which is under AA on the Cream and White papers (the code default is Cream:
   `tweaks.paperMode || 'light'`).
7. **Two version numbers on one page,** both typed in: the footer's `Shape v2.4.0 · Build 2026.04`
   (`:33836`) and the About card's `v6.38.2` (`:32997`); `mobile-app/package.json` says `0.1.0`.
8. **The plan card has no role gate** (`:33364–33397`): a trainer's Settings reads *Shape Membership ·
   Become a member to join the community · Join now →* (captured), against the owner's ruling that
   coaches join free and members pay $5/mo. Signed in, a coach would be offered *Activate membership →*.
9. **The entry control has no name.** `BSFacetAvatar` (`:12758`) renders a `div` with an `onClick` —
   no `role`, no `aria-label` — so the one control that opens Settings is invisible to assistive tech.
10. **Edit is a mode, not a page.** The form swaps into the chips' slot with the title still reading
    *Settings.*, the `EDIT` button still lit, and labels in a third typeface (`t.BODY`, the system sans)
    used nowhere else on the page.
11. **Copy leaks.** The ticker rows print the metric's storage key as the member-facing sub-label
    (`{m.key}` at `:33806`); the `ACCOUNT` eyebrow sits over a page called *Settings*.

### 1b. What is good, and stays

- **The appearance picker** (`:33480–33622`): live tiles you can read before you tap, one underline tab
  bar, one grammar. It is the best control on the page and every option keeps it whole.
- **The drill-in panes** (`DetailBack :32684`, `renderRows :32699`): one title, one back, rows. Calm.
- **The privacy copy** (`settings:privacy.*Desc`): each row says in plain words what turning it on does
  and to whom. That register spreads to every row in all three options.
- **The plan card is honest about state** (Member · renews / inactive / not a member); it only needs to
  know about coaches.

## 2. The backbone every option carries

Corrections to the page as it is, not preferences of any concept. Each is measured above.

| Today | Every option |
|---|---|
| Cosmetics above the account; the section list 1,420 px down | **Identity first, cosmetics last.** Name, tier, plan state open the page; Look & feel is one door among six |
| Six control grammars; tap-to-cycle rows | **One grammar.** On/off = switch · 2–3 choices = segmented row · 4+ = picker sheet. Never tap-to-cycle, never a native select |
| "More · 12 sections", a card called More, four duplicates | **One name, one place.** Six groups named by what a person calls the thing; *More* retired |
| Time zone · Week starts · Preferences Language unread; Nora unreachable | **Removed or wired.** Time zone from the device unless a reader appears; Nora gets a row |
| 35 controls under 44 px | **44 px floor**; rows 52 px, switches 44 × 26, ticker reordered by handle or picker |
| 8.5 px mono at 50 % ink, 3.5:1 on Cream | **Values at 10.5–12.5 px, 70 % ink**; 8.5 px mono only as a true eyebrow |
| Two typed-in versions | **One version, from the build**, once, under Help & about |
| $5 plan offered to coaches | **Role-aware plan block** — *Coach account · free* |
| Storage keys as copy | **No keys in copy** |
| Avatar is a `div` | **A real button**, named, 44 px |
| Edit swaps in place | **Edit profile is its own page**, house faces throughout |
| The appearance picker | **Kept whole** |

## 3. The three options

### A · The Index — who you are, then every setting as a row that shows its value
The member at the top (avatar · name · handle · tier · plan line · *Edit*), a find field, then ~24 rows
under six groups a person recognises — **You · Your training · How Shape talks to you · Look & feel ·
Privacy · Shape** — each row printing its current value on the right (`Units · Imperial`,
`Notifications · 3 of 4 on`, `Appearance · Black · Teal`). Nothing is hidden behind a summary. Inside
every pane, one grammar: a switch, then its qualifier as a chip row beneath it. **Root: ~1.6 screens
against 2.8.** *Cost:* the cheapest — a new list over the existing panes and takeovers; the
appearance block moves, not rewritten. *Risk:* it is the pattern every phone has, so the least Shape of
the three, and the longest root.

### B · The Passport — one screen: who you are, three switches, six doors
A passport's data page. An identity card with the two things people come here to do (*Edit profile* ·
*View public profile*); **three quick switches** for what gets flipped most (Radio · Online ·
Check-ins — all three already one-tap toggles today); **six warm tiles** — Account (sign-in + billing)
· Notifications · Privacy · Look & feel · Training & nutrition · Health & devices (integrations +
Cycle) — each carrying a one-line reading of what is inside; then *Also* (the Shape pages · Help &
about with the one version · Your data) and Sign out. Coaches get a seventh tile, **Your practice**,
and the capacity switch in the quick row. The tiles are **quiet rounded cards, never plates** — the
house's two-tier rule (settings are forms). Look & feel opens as a page with the first five papers and
accents inline and *All 18 ›* for the full grid. **Root: one screen.** *Cost:* a new root and one new
page; the six panes are the existing ones regrouped. *Risk:* a tile grid can read as a launcher; a
one-line state is a summary, so A's rows belong behind each tile; the quick row is the piece to guard
against creep — three, never six.

### C · The Sections — a tabbed root, controls inline, nothing more than two taps away
The appearance block already carries a *Paper · Texture · Accent · Ink* tab bar; C promotes that
grammar to the whole page. Six tabs — **You · Training · Alerts · Look · Privacy · Help** (coaches:
**Practice** in front of Training) — each a short list with its controls inline: switches, segmented
rows, and a picker sheet for long lists. No drill-in panes for ordinary settings and no Back inside
Settings; the only depth left is a picker. *Cost:* the most rebuilt — the section tables become six
inline lists and every tap-to-cycle row becomes a switch or segment. *Risk:* a six-item tab strip
scrolls at 390 px (the cut-off last label is the affordance, the same measurement the Coaches page
made on the web); and back-gesture semantics need one decision — back closes Settings, never steps
tabs.

## 4. Carry-over

The board's Carry-over tab holds the full table — every element on today's page (26 rows, the
coach-only blocks included) and where it lives in A, B and C. Nothing a member can do today is lost
in any option; the four duplicates each get one home; the three unread rows are the only things that
go, and each is an owner ruling in §6.

## 5. The pick

**Recommended: B · The Passport, with A's index rows behind each tile.** The ask was a friendlier
layout; B is the one where a member sees themselves first, flips the three things they actually flip,
and reaches everything else through six doors that fit on one screen. A's rows give each door a
readable inside, so a value is never more than one door away; C's tab bar stays where it already lives,
inside the theme picker. A is the fallback if the build budget is days rather than a week; C is the
answer if the owner wants no drill-ins at all.

**Build order, if B** — each step ships alone:
1. The backbone fixes that need no layout: the avatar becomes a named button; one version number
   from the build; a role-aware plan block; the three unread rows retired; storage keys out of the
   ticker copy; the tap-to-cycle rows become switches with chip qualifiers.
2. The new root: identity card · quick switches · six tiles · *Also* · Sign out. The six panes are the
   existing `renderRows` panes regrouped.
3. Look & feel as a page: the appearance block, text size, radio, effects and the ticker behind one door.
4. Edit profile as its own page.
5. i18n: the new group names and tile states across all 13 locales; every retired string removed from
   all 13; the ratchet must move by exactly what the retirements account for.

## 6. Owner rulings needed

- **The three quick switches.** Radio · Online · Check-ins is the proposal. Any three; never more.
- **Time zone and Week starts.** Nothing reads either. Retire them, or name the reader they are for.
- **The Preferences "Language" row.** Five options, unread. Retire it; the root select is the real control.
- **Coaches and the plan card.** Confirm a coach never sees *Join now → $5/mo*; the block reads *Coach
  account · free*.
- **The Shape pages inside Settings** (Score · Store · Leaderboard · Library · Sessions · Progress ·
  Radio). All are reachable from the tab bar already. Keep a short Shape list here, or drop them.
- **Search.** Only A carries a find field on the root; B and C can add one under the masthead.
- **Nora's voice.** It is defined and unreachable today; the options give it a row. Confirm it should
  surface, and where (How Shape talks to you / Notifications / Alerts).

## 7. Method, limits

- **Read, then measured.** The whole of `BSSettings` (`:31824–33902`) was read, plus the shell's
  routing, the row tables, the pref writers and the catalog; every `path:line` above was re-read from
  `main` = `6abf4c1`. The page was then **driven in Chromium** through the real entry flow (language
  picker → Continue → *Preview the app first* → *Step inside* → the demo banner dismissed → the corner
  avatar tapped), and the root, the edit form, six panes and the Trainer variant captured at 390 × 844.
- ⚠ **The first measurement was of the wrong page.** Settings is an overlay above the still-mounted
  Home tree, and a scroller finder that picks the *largest* scroller picked Home's — every count came
  back describing the Home feed while the screenshots showed Settings. The finder asks for the
  **topmost** scroller now (the one containing `elementFromPoint` at mid-screen). *An instrument that
  measures the layer under the one on screen reports on the wrong page with every number plausible.*
- **The signed-out preview, not an account.** Every capture is the demo persona; the plan card reads
  *Not a member* and the coach capacity block does not render because `capacity` is live-gated. The
  coach variant was reached through *Preview as → Trainer*. No real member's settings were opened.
- **Fonts.** The app bundles Saira and JetBrains Mono locally, so the captures render in the real
  faces; the board loads the same two families from Google Fonts. The container blocks that host, so
  the one local render of the board was in fallback faces and was used for layout and overflow only
  (0 px horizontal overflow at 1280 and 400).
- **The mock-ups are drawings on the app's tokens**, not builds: the six paper/ink/accent values are the
  app's own (`PAPERS.light`, `PAPERS.dark`, `BS_ACCENT_SWATCH`), the padding is the dense grid's 18 px,
  the row height 52 px. Values shown on rows (`$5/mo · Oct 3`, `WHOOP · Strava`) are the demo persona's
  and labelled as examples on the board.
- **Not in scope:** the takeover pages Settings opens (Integrations, Notification center, Health
  intake, the legal pages) and the Nora memory page. They are reached from Settings and are not it.
