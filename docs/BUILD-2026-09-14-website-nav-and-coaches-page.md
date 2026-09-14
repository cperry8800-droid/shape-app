# Build brief — one website nav bar, and a Coaches page that previews the dashboard

**Status: approved, not built.** Owner approved both previews 2026-09-14 (*"go on both, redirect to
login is fine"*). This file is the spec; the code is the next two PRs.

**Every line reference below was verified against `main` = `2d49f60`.** Re-derive before trusting —
`grep -n` the anchor, do not assume the number.

Previews the owner approved (live HTML, not pictures):

- **The nav bar** — https://claude.ai/code/artifact/babb2fbe-df3b-476a-98e2-1a5b39e21f7d
- **The Coaches page** — https://claude.ai/code/artifact/89bcb877-a62c-418b-8e19-929b14e2178d

Build in two PRs, in this order. PR 2 depends on PR 1 (the Coaches page renders the new bar), and
its dashboard captures must be taken **before** the gate in PR 2 turns the signed-out preview off.

---

## 0 · What the owner asked for, verbatim

> for nav bar on shape website, make the shape logo larger in top left corner. reduce the size of
> get started box. make log in fit on one line. and make sure this nav bar applies to every page.

> so we need to have a new nav bar once you are logged into a shape account … a similar nav bar but
> just what should be on it

> do the bar on every page for signed out, the first signed out option. for signed in dont say
> workouts and nutritionists for client. its repetitive…just have coaches. for coaches you need to
> have dashboard as a nav option. the dashboard is totally built out. all of those tabs on nav are
> on the dashboard nav bar. Just have the essentials on coaches nav when signed in. Like
> marketplace, about,

> also make sure the font is the same on nav across website

> disregard mobile, not important now

> We should add previews of the coaches dashboard on the coaches page … I think we should not make
> the dashboard accessible on website until an account is created.

> also on the current coaches page when signed out, i want a preview of that new page giving
> previews of the coaches dashboard they will have access to and use once an account is created

> remove the from application to first client in under 2 weeks. dont want to guarantee anything like
> that yet

Owner decisions taken through the question card:

| Question | Answer |
| --- | --- |
| Signed-in link row | `Dashboard · Coaches · About`, same for every role |
| Where Dashboard sits | **Teal button on the right** (so the row is `Coaches ▾ · About`) |
| "The coaches page" | **A new single Coaches page**, and the nav's Coaches points at it |
| "Subtab to the marketplace" | **A Coaches menu in the nav** — Trainers / Nutritionists open the marketplace on that tab |
| Signed-out dashboard link | **Redirect to Log in with a return-to** |

⚠ **The approved artifact is the tie-breaker, not the table.** The first answer listed Dashboard in
the row and the second made it the button; the board published after both — and approved — shows the
row as `Coaches ▾ · About` with Dashboard as the teal button. Build that.

---

## 1 · The problem, measured

**There are two nav bars on this website and they disagree about everything.**

| | Homepage (`index.html`) | The other 69 pages (`pageShell.jsx`) |
| --- | --- | --- |
| Markup | static HTML, `index.html:536` | React `Header`, `pageShell.jsx:818` |
| Bar height | 66px (`index.html:115`) | ~80px (10px padding + 60px logo) |
| Logo height | **36px** (`index.html:132`) | **60px** (`pageShell.jsx:898`) |
| Links | 7, sentence case | 9, **lowercase**, three dropdowns (`pageShell.jsx:104`) |
| Get started | filled teal, 38px min (`index.html:139`) | **outlined**, 8/15 padding |
| Radio | boxed, 38px (`index.html:147`) | unboxed wordmark (`pageShell.jsx:57`) |
| Signed-in | swaps auth cluster only, keeps marketing links (`index.html:1407`) | swaps the whole row for role tabs (`pageShell.jsx:118`) |

Measured in Chromium at the owner's window width (1180 CSS px, signed out):

| | Today | Why |
| --- | --- | --- |
| `Log in` | **35×32** — two lines | `.nauth` is `flex:1 1 0` with no `white-space:nowrap`; below ~1220px the cluster is narrower than its own text |
| `Get started` | **106×50** — two lines | same cause |
| Logo | 75×36 | `height:36px` in a 66px bar |

At 1440 both fit on one line (41×16 and 119×38), which is why this only shows on a narrower window.

**Two more defects this fixes as a side effect.** The shared header's `Clients ▾ · Trainers ▾ ·
Nutritionists ▾` menus each carry a **Dashboard** item that opens the demo dashboard for an anonymous
visitor (`pageShell.jsx:106-108`) — the access PR 2 closes. And signed in, the shared header renders
**Dashboard twice**: as the first role tab and again as a link in the auth cluster.

---

## 2 · PR 1 — one bar, on every page

### 2.1 The bar

One design, rendered twice (static on the homepage, React everywhere else). The published preview's
`.sn` block is the spec; port it verbatim rather than re-deriving numbers.

```
bar height           72px          (was 66 homepage / ~80 shared)
logo height          52px          (was 36 homepage / 60 shared)
row padding          0 32px        max-width 1440, centred
gap                  26px
links                13.5px / 500 / var(--sans) / nowrap / gap 22
active link          teal underline, 1.5px, offset 9px
Get started (cta)    13px / 600 / teal fill / height 34 / radius 5
Log in (quiet)       13.5px / 500 / fg-2 / nowrap
search               32×32 circle, 1px border
bell                 32×32 circle + teal badge (signed in only)
Radio box            height 34, 1px border, Anybody wdth 150, 12px
role pill            height 26, teal 1px, Anybody wdth 125, 10.5px (two-profile accounts only)
```

⚠ **`min-width: max-content` on `.brand` and `.auth` is the fix for the wrap**, not a font-size
change. Both are `flex:1 1 0` equal-basis columns so the links sit on the bar's true midline; the
default `min-width:auto` lets a flex item shrink below its content, which is what broke the cluster
into two lines. Flooring each column at its own content means the row gives up centring before
anything wraps.

⚠ **The logo goes DOWN on the 69 shared-header pages** (60 → 52). The owner asked for a larger logo
against the *homepage* bar (36px) and approved 52 in the preview, and one bar cannot be two heights.
Registered as an owner call: if they want 60 everywhere, the bar grows to ~80px and every offset in
§2.5 moves with it.

### 2.2 The links, by state

**Signed out** — the homepage's own seven, unchanged targets:

| Item | Target |
| --- | --- |
| Coaches ▾ | `Coaches.html` (PR 2; `Marketplace.html` until it exists) |
| ↳ Trainers | `Marketplace.html#trainers` |
| ↳ Nutritionists | `Marketplace.html#nutritionists` |
| App | `GetApp.html` |
| Radio | `Radio.html` |
| Community | `Community.html` |
| Rewards | `Score.html` |
| Pricing | `Pricing.html` |
| About | `About.html` |

Right cluster: `⌕ search · Log in · [Get started] · ▸◂ Radio`.

**Signed in — the same row for every role:**

| Item | Target |
| --- | --- |
| Coaches ▾ | `Coaches.html` (same menu as signed out) |
| About | `About.html` |

Right cluster: `⌕ search · 🔔 bell · Hi, {firstName} · [role pill] · Sign out · [Dashboard] · ▸◂ Radio`.

- **Dashboard** is the teal button, resolved by role: `TrainerDashboard.html` ·
  `NutritionistDashboard.html` · `ClientDashboard.html`. Inside a shell it must go through
  `dashShellHref` (`pageShell.jsx:203`) so it is a hash route, not a page load.
- **The role pill renders only when `authUser.roles.length > 1`** — unchanged behaviour, keep the
  existing `switchRole` (`pageShell.jsx:858`).
- **`PORTAL_NAV` (`pageShell.jsx:118`) is deleted.** Every tab in it — Workouts, Nutrition, Progress,
  Schedule, Clients, Programs, Plans, Messages, Business — is a tab of the dashboard the button now
  opens. That is the owner's *"its repetitive"*.

⚠ **`SHAPE_NAV_GROUPS` (`pageShell.jsx:104`) loses its three dropdowns**, which is what retires the
anonymous `Dashboard` items in them. `Client.html`, `Coach.html`, `Nutritionist.html` and
`Recipes.html` lose their nav entry; keep the files and the footer links (`Recipes.html` is also
reachable from the Nutritionist page and search). Coach/Nutritionist are superseded by
`Coaches.html` in PR 2 — do not delete them in PR 1.

### 2.3 The Coaches menu and the marketplace deep link

`Coaches` is **a link and a menu**: clicking goes to the Coaches page, hovering opens Trainers /
Nutritionists. Reuse `NavDropdown` (`pageShell.jsx:74`) with its hover bridge and 150ms close timer,
restyled to the new tokens; add a caret to the trigger and keep the trigger navigable.

`marketplace.jsx:553` seeds `useS("Trainer")` and nothing reads the URL, so `#trainers` lands on the
page with the wrong tab lit. Teach it to:

1. read `location.hash` on mount — `#nutritionists` → `"Nutritionist"`, `#trainers` → `"Trainer"`,
   **anything else → the existing default**, never a crash;
2. respond to `hashchange`, so the menu works from the marketplace itself;
3. write the hash back when the big hero switch is used (`marketplace.jsx:237`), so the tab is
   linkable. Use `replaceState`, not a hash assignment — a `hashchange` loop is the failure here.

### 2.4 The font

Owner: *"make sure the font is the same on nav across website"*. The homepage bar is **Schibsted
Grotesk** (links, buttons) + **Anybody** (Radio box); the shared header is Space Grotesk + JetBrains
Mono. The bar is the homepage's faces on every page.

⚠ **The 69 shared-header pages do not currently request those families.** Adding the bar without the
font request silently renders the metrics fallback — the exact class
`tests/homepage-font-axes.test.mjs` was written for. `ShapeMobileStyles` (`pageShell.jsx:1013`) must
carry the Google Fonts request **with both axes named** (`Anybody:wdth,wght@50..150,100..900`,
`Schibsted+Grotesk:wght@400..700`); Google serves only the axes you ask for and pins the rest at
their default, so a missing `wdth` makes every `font-variation-settings:'wdth' N` in the bar inert
with no error anywhere.

Only the **bar** changes face. The pages below it keep Fraunces / Space Grotesk / JetBrains Mono.

### 2.5 Everything that reads the bar's height

The bar goes 66 → 72 (homepage) and ~80 → 72 (shared). Each of these is a separate edit; missing one
leaves a gap or an overlap:

| File:line | Today | Note |
| --- | --- | --- |
| `pageShell.jsx:968` | spacer `height: 82` | the fixed header's in-flow stand-in |
| `pageShell.jsx:1055` | spacer `86px` at ≤900 | mobile; leave consistent |
| `pageShell.jsx:1068` | `.shape-dash-aside { top: 96px }` | sticky sidebar under the header |
| `trainerDashboard.jsx:122` | `position:sticky, top: 82` | same sidebar, desktop |
| `index.html:171` | `.hero{min-height:calc(100vh - 66px)}` | the fold |
| `index.html:298` | `.jpin{top:66px;height:calc(100vh - 66px)}` | the pinned journey rail |
| `index.html:432` | `.ndrawer{inset:66px 0 0}` | mobile drawer |
| `mobile-redirect.js:34` | `header.shape-header{top:48px}` | app banner offset — unchanged, but re-check it still lands |

⚠ **Derive these from one constant per file** rather than typing 72 eight times.

### 2.6 What must not change

- **The sign-out ordering** (`pageShell.jsx:767`) and the homepage's copy of it (`index.html:1407`).
  Cookie first, then the SDK session and scrub, broadcast **only** on a confirmed cookie clear. It
  took a whole review wave to settle; move the markup around it, never the sequence.
- **`DashInbox` and `useDashInboxFeed`** (`pageShell.jsx:415`, `:346`) — one feed, two render sites,
  the four panel states, the optimistic mark and its rollback. The bell keeps all of it.
- **`SiteSearch`** (`pageShell.jsx:596`), including the homepage's `#shape-nav-search` mount
  (`index.html:550`).
- **`dashShellHref` / `DASH_SHELL_STUBS`** (`pageShell.jsx:203`, `:158`) and the rule that
  `navGroupsFor` (`pageShell.jsx:540`) is the **one** place hrefs are mapped, so the drawer gets them
  too. `tests/dash-shell-routes.test.mjs:147` pins this.
- **The Radio wordmark claims nothing.** No ON AIR, no LIVE — the station is not broadcasting and
  `tests/homepage-climb.test.mjs` fails the whole suite if either reappears anywhere in `pageShell`.

### 2.7 Mobile

Owner: *"disregard mobile, not important now"*. So: **do not regress it, do not redesign it.** The
burger, the drawer and the mobile bell keep working, take the new tokens, and the existing guard —
every breakpoint that hides `.shape-nav-auth` must show `.shape-nav-bell`
(`tests/dash-inbox.test.mjs:232`) — still passes. The drawer reads `navGroupsFor`, so it inherits the
new link tables for free.

### 2.8 Tests

New `tests/site-nav.test.mjs`:

1. **The two bars carry the same link table.** Parse the homepage's `<nav>` and `pageShell`'s
   signed-out groups; assert the same labels in the same order with the same targets. This is the
   *"applies to every page"* ask, and it is the assertion that stops the two drifting again.
2. **The signed-in row is the essentials.** For each of client / trainer / nutritionist,
   `navGroupsFor` returns exactly `Coaches` + `About`; assert **no** dashboard tab name (Workouts,
   Nutrition, Progress, Schedule, Clients, Programs, Plans, Messages, Business) appears in the row.
3. **Dashboard is reachable exactly once when signed in** — the button, not a second link.
4. **Nothing in the bar can wrap:** every auth-cluster item carries `nowrap`, and both flex columns
   carry `min-width: max-content`.
5. **Font parity:** every family the bar's rules name is requested by the stylesheet link, with
   every axis it uses — extend `tests/homepage-font-axes.test.mjs`'s deriver to `pageShell.jsx`
   rather than writing a second one.
6. **No anonymous dashboard link:** no signed-out nav entry targets a `*Dashboard.html` or a shell.
7. **Derived, not enumerated:** take the page list from the files that load `pageShell.jsx`, and
   assert the list is non-empty, so a sweep that stops matching fails instead of passing vacuously.

Then the house round: `npm test`, `tsc --noEmit`, the newdesign precompile check, a mutation round on
the new guards, and Chromium at **1180 · 1280 · 1440** in both states — the widths that reproduce the
reported defect.

---

## 3 · PR 2 — the Coaches page, and the dashboard gate

### 3.1 The page

New `public/newdesign/Coaches.html` + `public/newdesign/coaches.jsx`, rendering the approved preview:

1. **Hero** — headline, lede, `Apply as a trainer` / `Apply as a nutritionist`, and a framed capture
   of the Today dashboard that follows the role switch below.
2. **Facts strip** — `$0` to join · `15%` only when paid · `Weekly` payouts · `Verified` credentials.
3. **The dashboard tour** — a Trainer / Nutritionist switch over five tabs: Today, Schedule, Clients,
   **Programs (Plans for nutritionists)**, Business. Each frame is a real capture, captioned with
   what that page does and a short list of what is on it.
4. **How it works** — four steps, **no timings** (§3.3).
5. **What it costs** — `$0` · `15%` · `1%` instant · no exclusivity.
6. **FAQ** — six questions, merged from the two existing coach pages.
7. **Apply CTA** → `SignupTrainer.html` / `SignupNutritionist.html`.

The nav's `Coaches` points here. `Coach.html` and `Nutritionist.html` stay live (footer and existing
links) but leave the nav.

### 3.2 The captures

Ten frames, `1440×900`, JPEG q84, from the production `/m`-style build served locally. Recipe:

- Playwright Chromium, viewport `1440×900`, `/api/me` stubbed `{"user":null}` so the shells render
  the demo practice.
- Navigate `TrainerApp.html#<tab>` / `NutritionistApp.html#<tab>`, settle **4.5s** — GridStack fits
  after the first paint and a shorter wait captures an empty grid.
- Before the shot, hide `header.shape-header`, `.shape-header-spacer`, the fixed
  `PREVIEW · DEMO DATA` band and the fixed `Chat` bubble. Hiding the old header is what makes these
  reusable after PR 1 changes it.
- Name them `coaches-dash-{trainer,nutri}-{today,schedule,clients,programs|plans,business}.jpg`.

⚠ **Every frame is labelled `Example account`** in the frame's own chrome, and the tour says so in
words. These are the demo practice's numbers — an unlabelled capture of invented figures on a
marketing page is the honest-data defect this repo post-mortems repeatedly.

⚠ **Capture before the gate lands.** Once §3.4 ships, `?demo=1` (or whatever escape hatch is chosen)
is the only way back to these screens.

### 3.3 Copy — no timing guarantees

Owner: *"remove the from application to first client in under 2 weeks. dont want to guarantee
anything like that yet."* The new page ships with none, **and the same promise is removed from the
two existing pages**, or the site contradicts itself:

| File:line | Today | Change |
| --- | --- | --- |
| `coach.jsx:175` | "From application to first client in **under two weeks.**" | drop the timing; e.g. "From application to **your first client.**" |
| `nutritionist.jsx:186` | "From application to first consult in **under two weeks.**" | same |
| `coach.jsx:165` | "Review in **2–3 days**" (+ `time: "2–3 days"`) | "We review every application" |
| `nutritionist.jsx:176` | "Review in **2–3 days**" (+ `time`) | same |
| `coach.jsx:167` | "…land in your inbox **within the first week**" | drop the window |
| `nutritionist.jsx:178` | "First consults usually book **within the first two weeks**" | drop the window |
| `coach.jsx:164` | "Apply in **10 minutes**" (+ `time: "10 min"`) | owner call — this is a claim about *their* effort, not our promise; keep unless they say otherwise |

⚠ **The step cards carry a separate `time:` field** rendered as a chip. Removing the heading and
leaving the chip leaves the guarantee on screen.

A guard belongs on this: assert no coach-facing page matches
`/under two weeks|within the first week|first two weeks|2–3 days/i`. Derive the page list; a flat
grep over the repo would fail on this brief.

### 3.4 The gate

**Signed-out visitors stop reaching the dashboards.** Today all three shells render a full demo
preview for anyone.

Implement in each shell's existing guard block — `TrainerApp.html:23`, `NutritionistApp.html:23`,
`ClientApp.html:23` — which already fetches `/api/me`:

```
no user  → location.replace('/newdesign/Login.html?next=' + encodeURIComponent(<this path + hash>))
wrong role → unchanged (it already redirects to their own dashboard)
right role → render
```

⚠ **`login.jsx:157` already reads and validates `?next=`** — it requires a leading `/`, refuses `//`
and `/\`, and rejects control characters, mirroring `src/lib/safe-redirect.mjs:14`. **Use it; do not
add a second redirect path.** Pass a path, never an absolute URL.

⚠ **The guard runs after a network round trip**, so a signed-out visitor sees the demo dashboard
flash before the redirect. Either hide the root until `/api/me` resolves, or accept the flash and say
so — but decide deliberately, because a visible flash of a working dashboard is exactly what the gate
is meant to stop.

⚠ **A failed `/api/me` must not lock a signed-in member out.** The current guard `.catch`es and
renders. Failing closed on a transient error would redirect a paying member to a login page they do
not need; failing open shows the demo. **Fail open, and say so at the site** — the demo is public
today, so this is not a new exposure.

**What stays public:** the marketplace, coach profiles, Community, Pricing, Radio, Score, Store,
Recipes, the new Coaches page. Only the three dashboard shells and their 37 redirect stubs gate.

⚠ **The 37 stubs (`location.replace` into a shell) need no change** — they land on a shell that now
gates. Verify rather than assume: a stub carrying a query string forwards `location.search`, so the
`next=` must survive it.

### 3.5 Tests

- Each shell's guard: no user → `Login.html?next=` carrying **this** page and hash; wrong role →
  its own dashboard; right role → renders. Drive the shipped block, do not restate it.
- `next=` is a path, is encoded, and survives `login.jsx`'s validator — drive the real function.
- The nav's Coaches targets the new page, and the new page renders the new bar.
- The role switch and the five tabs each swap the frame, and `Programs` reads `Plans` for a
  nutritionist.
- No timing-guarantee string on any coach-facing page (§3.3).
- Every frame the tour references exists on disk.

---

## 4 · Open owner calls

1. **Logo height on the 69 shared-header pages** — 52px as approved (a small reduction there), or
   60px everywhere with a taller bar (§2.1).
2. **"Apply in 10 minutes"** — a claim about the applicant's effort, not our delivery. Keep or cut
   (§3.3).
3. **`Coach.html` / `Nutritionist.html`** — kept and out of the nav for now. Retire them into
   `Coaches.html` later, or leave as deep-link landing pages.
4. **The demo-dashboard flash** before the gate redirects (§3.4).
