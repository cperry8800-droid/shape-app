# Terrain profile — "Route Card" redesign (design spec)

**Date:** 2026-07-04 · **Surface:** mobile member profile (`BSTerrainProfile` + satellites, `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`) · **Status:** owner-approved direction (picked from a 2-concept adversarial round; animated preview approved) · **Wave:** 4 of the July redesign (after Session Details #1523, Home #1527, Feed #1528)

## Direction

The profile becomes one continuous **route card** — the record a climber files before an ascent: who they are, the line they're climbing, where they stand on it, and the signals that prove it. Every box dies. One 2px **tier-heat rail** threads the whole record from the name down through the tab stations, and identity, phase, score, signals, and lifts become typographic registers set directly on the paper — eyebrow-above-figure heroes, baseline rows, dot-leader secondaries, `BSSdBars` instruments. The ascent survives as the page's one piece of inked linework: a self-drawing heat stroke up a dashed ink ridge with the round facet avatar riding it, and a single breathing halo at the you-are-here point — the member alive on the mountain, the page's only loop. At the ACTIVITY station the tier rail visibly hands the thread to the member's own Wire Dispatch cards, whose role-heat rails take over: rank passes to voice.

Presentation-only: every interaction, eligibility gate, and data flow stays behavior-identical. Out of scope: `BSSignalCoachProfile` (coach profile — a later parity pass), `BSScoreCardDark`'s off-profile mounts (follow-up), all sheets/overlays (quiet-form tier, unchanged).

## Heat policy (closed list)

**TIER IS THIS SURFACE'S HEAT** — `heat = bsTierColor(member's tier)`, degrading to `t.ACCENT` when tier is unresolved. Declared per-surface exactly like Session Details' intensity and the feed's author-role: an identity page's temperature is the member's rank. All tier-colored TEXT demotes to ink-alphas (identity is weight, not color). The parallel hardcoded teal accents on this surface are collapsed into tier heat or ink; rust survives only as a coach ROLE spine. Embedded feed dispatches keep their own role heat untouched — per-surface systems coexisting.

Heat appears ONLY as:

1. the 2px rail (identity head → tab stations, transparent terminus at the ACTIVITY feed handoff)
2. the serif name's trailing period
3. the identity-eyebrow tier tick (6×1.5px) + each section-station tick
4. the ascent hero: progress stroke, summit flag stroke, the "43%" underline, and the you-are-here halo (`bsSdPrBreath` — the page's single loop)
5. the score hero rule + the "716 TO FORM" underline
6. instrument linework: `BSSdBars` best-row fill + `bsSdBurst` (breath suppressed — see Motion), the momentum TODAY bar, the trajectory spark stroke + end dot, the climb route's start→now stroke + now dot + hollow target circle
7. the tab index's moving 2px active underline
8. link affordances: 1px underlines + chevrons/arrows on MESSAGE, OPEN ↗, ＋ LOG ACTIVITY, ＋ ADD PLAYLIST, SET A GOAL, N REQUESTS ›, and the dock's →
9. the coach-credit ✓ glyph (its 3px spine is the coach's ROLE color — their signal, not this list)
10. ink→heat separator rules between major registers and above the feed handoff
11. THE SINGLE PERMITTED FILL: the un-followed FOLLOW chip (squared radius-3, filled heat; reverts to line-only once following)

Heat NEVER colors the name, handle, tier word, streak, stat values, running text, or any background beyond the Follow fill. All text resolves from `t.INK` alphas so AA holds on all 14 papers.

## Section treatments

### Masthead
Shared chrome (logo + Vol·No + `BSSearchCorner` + facet avatar) untouched, except the edit-pencil and settings-gear lose their 999-circle chrome (border + ink-.06 fill) → bare ink-.7 glyphs in invisible ≥44px cells.

### Identity head (rail origin)
- Eyebrow: mono 7.5px/800/0.2em `TEMPO TIER · 14 WEEK STREAK`, all in `bsTHexA(INK,.55)`, one 6×1.5px heat tick before TIER. The tier-colored text and the rust `#c0533b` streak literal die.
- Serif 27px name + trailing HEAT PERIOD.
- One mono 10px ink-.55 line `@quinn · she/her · Austin` (the hero's inner identity strip dies — the handle lives here).
- **BSFollowBlock (new `ledger` variant, prop-gated so Signal is untouched):** stats collapse to one tappable mono line `128 FOLLOWERS · 96 FOLLOWING · 42 POSTS` — tabular `t.DISPLAY` 13px/800 figures, ink-.5 labels, each segment a ≥44px invisible-padded button. FOLLOW = the page's single permitted heat fill (squared radius-3 chip in a ≥44px cell; once following → no fill, ink `FOLLOWING` + heat ✓; REQUESTED = ink-.55 plain). MESSAGE = ink text + 1px heat underline. `{N} REQUESTS ›` pill → ink text + heat underline + chevron. The `bsFaBreath` infinite glow + clipped-notch chip chrome die (standing zero-loop violation resolved).
- 2px heat hero rule draws under the block (`bsSdDrawX` 900ms); 1px ink-.08 hairline closes it.

### Ascent hero
The entire instrument plate dies: both notch clipPaths, the tier-.45 simulated border, 3px spine, 9×9 bracket, gradient wash, dark scrim. If `profile_custom.cover` exists it renders as a full-bleed printed-photo band (~120px, object-fit cover, 1px ink-.1 hairlines top/bottom, NO scrim, no overlaid text); otherwise nothing. The ridge is unboxed inline SVG straight on paper, full-bleed (`preserveAspectRatio='none'` kept so %-positioned overlays stay aligned — the #1505 geometry contract survives verbatim):

- area gradient fill DELETED; base ridge = 1.5px dashed `bsTHexA(INK,.3)`; the 4 gridlines stay as 1px ink-.06 hairlines
- progress = 2.5px HEAT stroke self-drawing via `pathLength`/dasharray (~1100ms, `vectorEffect:non-scaling-stroke`), replacing the hardcoded `#34d6c5`
- hollow 4px ink start square at base; summit flag redrawn in heat stroke (the `#e0644b` literal dies)
- the 64px round `BSFacetAvatar` keeps riding the progress point; the "43%" bordered pill dies → mono 9px/800 ink figure under the avatar with a 1px heat underline, popping in via `bsSdPop`; a `bsSdPrBreath` halo on the avatar ring is the page's ONLY loop
- TEMPO/FORM level pills die → bare mono 8px/800 ink-.55 labels at base and summit (next-tier-colored text dies)

### Phase + coach row → press credit
The teal `BSPlate` dies. The exact co-sign grammar the feed shipped: 3px COACH-ROLE-colored left spine (trainer rust / nutritionist gold — the coach's signal, not this page's heat) + mono 7.5px/800 ink-.5 eyebrow `CURRENT PHASE · BUILD · CUT` + `Hypertrophy Block II` sans 13.5px ink-.85 + `COACHED BY` ink-.45 + coach name `t.DISPLAY` 12.5/800 in INK + heat ✓ + a 24px round borderless coach avatar. One real button → coach profile, ≥44px invisible padding, enters via `bsSdStamp`. Gates unchanged: real coach via `listDirectCoachThreads`; signed-in no-coach renders phase-only when a real program phase exists, else NOTHING; demo Maya is signed-out preview only.

### Shape Score register (meMode only)
The score `BSPlate` dies. Open Ledger stat pattern verbatim: eyebrow `SHAPE SCORE` mono 7.5px/800/0.2em ink-.5 ABOVE the figure; **1,284** in `t.DISPLAY` 44px w700 tabular negative-tracked through `BSSdCountUp`, mono 12px/700 ink-.55 `pts` baseline-gapped 6px via `bsSdSplitUnit`; right-aligned on the same baseline: `716 TO FORM ›` mono 9px/800 INK with a 1px heat underline (no tier-colored text). A 2px heat hero rule draws under it (`bsSdDrawX` 900ms). The four composite bars → horizontal `BSSdBars` (#1529 instrument): 76px label column, tracks draw rightward staggered 110ms, figures share one right edge; the best pillar takes the heat fill + `bsSdBurst` with **breath suppressed** (see Motion). Null pillars render `—` with untouched ink-.08 tracks (no draw). The whole register stays one real button → `onOpenScore` (transform-only `scale(0.97)` press).

### Tab rail → typographic stations
`BSLivingTabs`' bordered segmented control is replaced ON THIS SURFACE by a new typographic index (new component or variant prop — `BSSignalCoachProfile` keeps the existing `BSLivingTabs` untouched): sticky full-bleed line on solid `t.PAPER` + 1px ink-.08 bottom hairline, four mono 8.5px/800/0.14em uppercase labels — ACTIVITY · SIGNALS · CLIMB · MUSIC — inactive ink-.45, active `t.INK`, a single 2px heat underline moving between stations via transform translateX/scaleX 200ms (transform-only, one-shot per tap). Real buttons ≥44px. The master rail runs from the identity head through the tab line and down each pane's stations, EXCEPT it terminates (gradient → transparent) at the ACTIVITY station where the Wire Dispatch cards' role-heat rails take over at the same x.

### ACTIVITY tab
`BSProfileExtras` goes zero-box (prop-gated if needed — it is shared with Signal):
- heroStat tiles → primary register baseline rows: mono 7.5px/800 ink-.5 label left, `t.DISPLAY` 30px tabular figure right via `BSSdCountUp` + `bsSdSplitUnit`, units in a fixed-width mono column sharing one right edge (#1529)
- pinned-highlight card → a pull-quote: 3px heat left spine + serif italic 18px ink + a mono ink-.55 metric line, no fill/radius
- Spotify song iframe keeps its iframe; the radius-14 border dies → full-bleed printed-media band with 1px ink-.1 hairlines top/bottom
- prompt cards → marginalia: mono prompt eyebrow ink-.5 over serif italic 15px ink-.85 answers, hairline-separated
- social link pills → one row of mono 8.5/800 uppercase ink-.7 links, each with a 1px heat underline + heat ↗
- `＋ LOG ACTIVITY` pill → ink text + heat underline, real button ≥44px
- empty state → redaction line: `NOTHING LOGGED YET` (self, + `＋ LOG YOUR FIRST →` heat-underlined link) / `NO ACTIVITY ON RECORD` (visitor)

The feed itself is UNTOUCHED (shipped Wire Dispatch: role-heat rails, `hideAuthor`, `pagePad={0}`, full-bleed margins, per-card observers); the profile's ink→heat separator hands off above the first card.

### SIGNALS tab
Three rail stations (heat tick + mono eyebrow), one observer each:
1. **LIVING SIGNALS** — streak tile + momentum card die → two-column register: left, `DAY STREAK` eyebrow above a 30px count-up figure; right, `WEEKLY MOMENTUM` eyebrow above seven bare 3px micro-bars rising via 60ms-staggered one-shot scaleY (ink-.18; TODAY's bar = heat), mono day initials beneath. The trajectory card dies → a primary baseline row: `TRAJECTORY · 16-WK RECOMP` eyebrow above `−5 lb` (`t.DISPLAY` 30px INK, unit via `bsSdSplitUnit`); the sparkline becomes a 1.6px HEAT stroke self-drawing (pathLength, 900ms) with hollow ink start square + heat end dot (`bsSdPop`).
2. **DISCIPLINES · STRATA** — the 999-radius gradient tracks die → `BSSdBars` verbatim (best row heat fill + burst, breath suppressed).
3. **KEY LIFTS** — the three tiles die → dot-leader secondaries: `SQUAT ⋯⋯ 245 lb` — mono 7px/800 ink-.45 label · dotted ink-.22 leader flexing · 15px tabular value via `BSSdCountUp` + fixed mono unit column.

### CLIMB tab
One station `THE CLIMB` (heat tick + eyebrow + `Member since` mono ink-.5 right), one observer. Aspect 999-pills → mono text toggles (active = `t.INK` + heat tick before the word; inactive ink-.45); pencil circle → bare ✎ glyph ≥44px. The bordered "Show on your climb" box → an unboxed hairline-bounded row of toggle words (`✓ WEIGHT` ink + heat ✓ shown / `+ STRENGTH` ink-.4 not). **The radius-16 `climbBg` wash STOPS RENDERING and its customizer picker row is removed** (pure decoration incompatible with zero-box; stored prefs remain harmless) — ⚠ owner sign-off: this retires a shipped customization. The ridgeline chart sits directly on paper: dashed ink-.25 ridge static; a HEAT progress stroke draws itself start→NOW (pathLength, 1100ms); start = hollow ink square; NOW = heat dot (`bsSdPop`) with a STATIC thin heat halo ring (no breath — the loop budget is the hero's); target = hollow heat circle. Arc labels → three eyebrow-above-figure micro-registers (ink-alphas only — the teal "now" label dies). The `⛰ Why` tinted band dies → a drawn 2px ink→heat rule + `THE WHY` station eyebrow + the serif italic 21px pull-quote on bare paper (the ⛰ emoji goes with the rebuilt block).

### MUSIC tab
One station `MUSIC` (heat tick + eyebrow; `＋ ADD PLAYLIST` = ink text + heat underline). Playlist row cards die → hairline-separated baseline rows: 40px square cover (1px ink-.1 hairline, radius 0 — printed photo; the `#1db954`/`#fa243c` provider brand colors die), title `t.DISPLAY` 14px/800 ink, meta line mono 8.5px ink-.5 `SPOTIFY · 24 TRACKS · PUBLIC` (Public/Private pills → plain mono words), `▶ Open` pill → `OPEN ↗` mono ink-.7 + heat underline, the 27px circular ✉ ↗ × ＋ buttons → bare 15px monochrome glyphs in flex-distributed ≥44px invisible cells (Wire Dispatch action-strip pattern), transform-only press. Empty states → redaction lines: `MUSIC · NO PLAYLISTS YET` + `＋ ADD YOUR FIRST →` (self) / `NO PUBLIC PLAYLISTS` (visitor). `BSAddPlaylistSheet` untouched.

### Private state · message dock · overlays
- PRIVATE: the bordered card dies → the existing 🔒 (existing emoji kept per house rule) + the friends/private sentence in sans 14px ink-.7 on paper under a centered dashed redaction rule `PRIVATE RECORD`; name/tier/follow counts stay visible; `can_view` gate untouched.
- MESSAGE DOCK (others' profiles): the solid-teal 999 bar dies → sticky terminus over the existing paper fade: 1px ink-.08 hairline top, `MESSAGE QUINN` mono 11px/800 uppercase INK + 1px heat underline + heat →, full-width real button ≥48px, transform-only press.
- All overlays (`BSProfileCustomizer` minus the climb-background picker row, `BSLogActivitySheet`, card sheets, `BSFollowListSheet`) keep their rounded-sheet chrome; portals into `#bs-phone-surface` unchanged.

## Motion contract

- **Boot (hero zone, fires on mount — above the fold, no observer):** rail grows (`bsSdGrowY` 1000ms, origin top, ~150ms) → score figure counts (`BSSdCountUp` 750ms, ~250ms; meMode only — visitors skip to the ascent) → score hero rule draws (`bsSdDrawX` 900ms, ~350ms) → the ascent progress stroke draws (~1100ms, ~400ms) → you-are-here avatar + "43%" + summit flag pop (`bsSdPop`, ~1300ms) → coach credit stamps (`bsSdStamp`, ~1500ms) → the halo begins breathing (~1700ms).
- **Observers:** exactly ONE `useBSSdInView` per section, never per field — SIGNALS = 3 (its stations), CLIMB = 2 (chart · Why), ACTIVITY = 1 (extras; each dispatch keeps its own shipped observer), MUSIC = 1. A parent per-tab `seen` map persists across tab switches so a revisited tab renders its FINISHED state — entrances never replay.
- **The one loop:** the ascent's you-are-here breathing halo (`bsSdPrBreath`, 3.2s). Justified under the Session-Details detail-density allowance (one instrument at rest per page); the feed's zero-loop rule governs everything below the ACTIVITY handoff. `bsFaBreath` on the Follow chip is deleted. **`BSSdBars` breath suppression:** the shipped component bakes burst+breath into its best row — add a `still` (no-breath) option so composite/disciplines get heat fill + `bsSdBurst` with NO `bsSdPrBreath`; without it, omit `bestIdx` rather than ship a second loop.
- No parallax, no hover-lift, no shimmer. All keyframes stay in `bsInjectSessionDetailCss`'s reduced-motion-gated block — no per-instance style tags; likely zero new keyframes.
- **Reduced motion:** every animated style spreads `...(bsSdReduced() ? null : seen ? {animation} : hiddenInitial)` — finished record, zero residual transform/opacity, halo absent (`useBSSdInView` seeds `seen=true`).

## Honest data

- Signed-in, NO COACH: credit renders NOTHING; phase line only when a real `client_programs` phase exists.
- NO LIFTS: one redaction line `LIFTS · NOT ON RECORD` — never fabricated 245/285/135, never a `—` trio pretending to be rows.
- NO WEIGH-INS: the TRAJECTORY row is absent entirely (strokes never render from absent series); CLIMB weight aspect shows `SET A GOAL →` (self) / `GOAL · NOT SET` redaction (visitor).
- Zeroed-but-real data stays honest zeros: an empty real week renders floor-height ink-.12 momentum ticks and a 0-day streak — zeros are data, not absence.
- Composite pillars: null → `—` + untouched track, no draw, no burst; `BSSdCountUp` never fabricates mid-count values; `716 to Form` renders only from real thresholds.
- NO PLAYLISTS: redaction lines per Music section above; visitors see public rows only (RLS unchanged).
- Signed-out demo persona (Quinn) keeps the full demo record — the labeled preview only; no demo value ever renders signed-in.
- Someone else's profile: no score register (meMode-only); heat = THEIR tier; their real posts only.
- PRIVATE: name + tier + follow counts + the lock block only — nothing inferred below.
- Cover: renders only when `profile_custom.cover.image` exists — no default art.

## Deletions

Hero plate frame (both clipPaths, simulated border, spine, bracket, wash, scrim, inner identity strip) · both hero `BSPlate` bands (coached-by, score) · "43%"/TEMPO/FORM pills + ridge area fill · this surface's rust literals (`#e0644b`, `#c0533b` streak) and every hardcoded teal accent (ridge stroke, % badge, climb dots, momentum highlight, trajectory figure, composite fills, both CTA fills) · all tier-colored TEXT · `BSLivingTabs` chrome on this surface (component retained for Signal) · `BSFollowBlock` chip chrome + `bsFaBreath` + the solid requests pill · private-profile bordered card · empty-activity bordered strip · CLIMB pills/customizer box/`climbBg` wash + picker row/Why tint band · SIGNALS tiles/cards/tracks · ACTIVITY extras tiles/cards/pills · MUSIC cards/brand colors/pills/circle buttons · the dock's solid-teal bar · dead-code sweep of every style helper left unreferenced (`card` object, notch-chip styles, pill helpers).

## Risks / verification

- **Shared-component blast radius:** `BSFollowBlock`, `BSLivingTabs`, `BSProfileExtras`, `BSProfilePlaylists` are also mounted by `BSSignalCoachProfile` — every change variant-gated (ledger prop / new index component) + an explicit Signal render check before merge.
- **Tier-heat legibility per paper:** Tempo gold / Base sage strokes at 1.6–2.5px verified on Cream, Sage, Black papers (AA safe by construction — heat never carries text); exercise the `t.ACCENT` degrade path.
- **Rail handoff rhythm:** the tier rail's transparent terminus must visibly END before the first dispatch's role rail begins (verify the separator margin on device).
- **Ridge geometry:** %-positioned overlays over `preserveAspectRatio='none'` + `pathLength` draw need `non-scaling-stroke`; the #1505 alignment fix survives verbatim. Deleting the area fill may flatten the mountain read — fallback graft: restore the fill as a 0.08-alpha ghost.
- **Per-tab seen map:** without it every tab switch replays entrances; with an over-eager seed, first visits render finished. Test both paths + reduced motion.
- **Score tap discoverability:** the register replaces a plated tap target — watch the press-scale + chevron affordance in the on-device pass.
- **`climbBg` retirement** needs explicit owner sign-off (shipped customization).
- Verification per house gates: JSX parse · PowerShell mobile build · full `npm test` · LF normalize · whole-branch review · CodeRabbit on the PR · on-device pass (Black/Sage/Cream; self / visitor / private / signed-out demo; reduced motion = finished state).
