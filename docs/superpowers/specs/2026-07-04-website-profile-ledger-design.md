# Website living-profile → ledger design (web↔app parity)

**Date:** 2026-07-04 · **Status:** owner-approved (both directions ledgered; skip
preview, spec+build) · **Scope:** the WEBSITE desktop living profiles only
(`public/newdesign/livingDesktop.jsx` + a light pass on `livingShared.jsx`'s
coach blocks). Dashboard surfaces (Home/Progress/Marketplace/Feed) are a separate
grid paradigm and are explicitly OUT of scope.

## Why

The mobile app member profile shipped the zero-box "Route Card / Field Ledger"
language (waves 4-6). The website profiles are a separate desktop codebase still
on the pre-redesign **boxed-card** aesthetic. Owner asked to bring the website
profiles to the new design — **both** member (Terrain) and coach (Signal),
accepting that the website coach will lead the (currently-unchanged) mobile coach.

## Heat policy (both directions)

Heat = the profile's **tier color** (`tierOf(d).color` — member ladder for
Terrain, coach ladder for Signal), **line-only**, on a closed placement list:

the content **rail** · station-head **ticks** + **ledger rules** · tab **underline**
· self-drawing **ridge/sigil** strokes (already present) · **bar fills**
(disciplines/momentum) · dot-leader **figures' delta glyphs** · the identity **tier
chip** (kept — it's the identity marker, like mobile's).

Everything else demotes to ink-alphas. **Killed:** the tinted card fills
(`dHexA(c,0.08)` goal card, RecordsBlock tinted lift tiles, tab-active
`dHexA(c,0.16)` pill), and the constant-`LV_TEAL` decorative accents where they're
not a live/action signal. `LV_TEAL` stays only for genuinely live/actionable
affordances (Message CTA, "In training" live pulse, follow-CTA active).

## New desktop ledger primitives (top of `livingDesktop.jsx`)

Desktop analogs of the mobile `BST*` kit:

- `dStation(extra)` — replaces `dCard()` for content: **zero-box** (no border/fill),
  just spacing; sections separate on a hairline + their station head.
- `DStationHead({ c, label, meta })` — a 6px heat tick + mono uppercase eyebrow +
  optional right-aligned meta, over a 2px **ink→heat ledger rule** (the mobile
  `BSTStationHead` + the shipped "ledger rule" under section heads).
- `DLedgerStat({ c, label, value, sub, delta })` — **eyebrow-above-figure**: mono
  eyebrow on top (ink-50), serif figure below; optional heat delta glyph + sub.
  Matches the mobile `BSTLedgerStat` orientation (eyebrow ABOVE figure — the
  website hero currently has it inverted).
- `DRedact({ label })` — a dashed rule flexing both sides of a centered mono label
  (honest-absent), the `BSTRedact` analog.
- `dLeader` — a shared dotted-leader `<span>` for dot-leader rows.

## The rail

The tab-content region (below the tabs) gets a **2px tier rail** at the left of its
centered container, threading the stations — the desktop-scoped version of the
mobile continuous rail (kept inside the max-width column, not the browser edge, so
it stays attached to the centered content). Sections indent to clear it.

## Section-by-section

- **Hero** (`DesktopHero`): keep the split (identity left, signature visual right),
  the tier chip, name, metadata, CTAs, follow stats. The **goal card** loses its
  tinted box → a heat-tick eyebrow + serif italic goal + a short heat rule. The
  **score strip** → three `DLedgerStat` registers (eyebrow-above-figure). Score/
  streak/trajectory keep their values + honest fields.
- **SignalsBand**: the 3 boxed cards → one "Living signals" station with three
  zero-box registers (streak figure · weekly-momentum `LvWeekBars` recolored to
  heat, line-only · trajectory `LvSparkline` in heat) separated by hairlines.
- **DisciplinesBlock**: zero-box station. Terrain strata bars kept but **heat
  fills** (drop the per-bar teal-on-last); coach ring-grid → zero-box label·bar·
  figure ledger rows (kill the tinted tiles). Empty → `DRedact`.
- **RecordsBlock**: tinted lift tiles → **dot-leader rows** (mono label · dotted
  leader · serif figure) under a station head. Empty → `DRedact`.
- **RelationBlock**: zero-box (the gradient avatar chip is content, kept).
- **ClimbBlock**: keep the `TerrainRidge` (already ledger). Zero-box the container;
  station head; the aspect **pills → a mono typographic index** with a heat
  underline; keep the customizer (restyled to match). Arc labels kept.
- **FeedBlock**: already trail-based (on-language). Drop the inner `dCard` borders
  on each entry (zero-box on the dashed trail); heat waypoint ticks; keep the
  hidden-private redaction line (reword to the `DRedact` treatment where clean).
- **Tabs** (`DesktopTabs`): the rounded pill segment → a **typographic index** with
  a drawn heat underline on the active tab (the mobile `BSTerrainTabs` anatomy).
- **DesktopLocked**: light pass — zero-box, heat crest ring kept, tier chip line-only.
- **Coach blocks** (`livingShared.jsx` `LvCoachBlocks` — coaching/reviews/certs/
  offerings/waitlist): a **lighter** zero-box pass — drop card borders/tinted fills
  in favor of station heads + hairline rows + dot-leader prices, keeping every
  handler (Subscribe/Book/waitlist/buy) + the live cert/review data verbatim.

## Data / behavior (all verbatim)

Every RPC + live-vs-demo path is untouched (`get_public_profile`, `get_coach_certs`,
`get_follow_stats`, `list_follow_requests`, `get_member_playlists`, the own-profile
`/api/client/*` enrichment, `LV_PEOPLE` demo fallback). Motion stays
reduced-motion-gated. Only presentation changes.

## Cache-bust + verify

Bump `?v=` on the edited `.jsx` (`livingDesktop.jsx`, `livingShared.jsx`, and — if
touched — `livingTerrain.jsx`/`livingSignal.jsx`) across the **3 profile HTML
pages** (`MemberProfile.html`, `TrainerProfile.html`, `NutritionistProfile.html`)
AND anywhere else that loads them (grep `livingDesktop.jsx?v=` etc. across
`public/`). **These babel files are NOT compiled by CI's `tsc`/`next build`** — so
gates are: JSX parse-check (`@babel/parser` + jsx plugin) on each edited file · a
real **render check on the branch's Vercel preview deploy** (load MemberProfile.html
+ the coach profile, screenshot member/coach/locked/signed-out-demo) · whole-diff
self-review · CodeRabbit. tsc still runs for `warroom.ts`-style TS if touched (none
here).

## Risks

- Shared file drives both directions — every block change must be checked in BOTH
  terrain + signal render paths (and owner vs public vs locked variants).
- No CI build gate for these files → the preview render check is mandatory, not
  optional.
- Tier-heat line legibility on the dark `LV_BG` is fine (unlike the mobile
  tinted-paper concern) — but verify the heat rail/ticks read against the atmosphere
  radial-gradient behind the hero.
- Don't regress the XSS-safe `safeMusicUrl` or the follow/cert/review live wiring.
