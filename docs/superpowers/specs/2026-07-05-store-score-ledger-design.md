# Shape Score "The Standing" + Shape Store "The Shop" — Open Ledger redesign (mobile)

**Date:** 2026-07-05 · **Status:** owner-approved concepts, spec for review
**Surfaces:** `BSShapeScorePage` + `BSShapeStorePage` (`mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`, consumed by the pros bundle via `window` for coach roles)
**Concept board:** claude.ai/code/artifact/818d8bef-6603-4b99-ac99-a0c0f9a78e03 — Score = ★ "P1 revised" (owner: "the stand + the standing chart", "shape score looks good"); Store = ★ "S8" (owner: "yes S8 - do that", "i like it"; direction brief: "a legit e-commerce / professional merchandise page, like Nike or apparel store, that includes Shape discounts on coaches, memberships, etc").

These are the last two client surfaces still on the June instrument-plate look. This is a
**presentation rebuild** — the July Open Ledger serialization applied to both pages.

## Non-goals

- **No data, backend, or commerce-flow change.** Same catalogue, RPCs, cart, checkout,
  gates (invariants listed at the bottom).
- Website Score/Store pages (`score.jsx`, `store.jsx`, `clientScore.jsx`) — out of scope.
- `BSStoreCheckout`, the shipping sheet, and the redeem-confirm sheet stay quiet rounded
  forms (two-tier rule); only their entry chrome changes where noted.
- No new infinite animations anywhere; both pages follow the wave's motion rules.

## Shared rules (both pages)

- **Heat = the viewer's tier** (`bsMyTierColor()`; coach roles resolve on the coach
  ladder exactly as today) — **line-only**, closed placement list per page (below).
  All tier-colored *running text* demotes to ink-alphas; the constant-teal accents and
  hardcoded rust literals in the current pages die.
- **Teal** (`t.isLight ? '#0a8f87' : '#34d6c5'`) = live/action only. On the Store that
  means the commerce CTAs (ADD / REDEEM / the checkout bar). On the Score page its only
  appearance is the signed-out momentum sign-in action line (the you-dot, the page's
  live element, is heat — not teal).
- **Rust** stays semantic for penalties/at-risk, always NAMED in mono text, never
  color-only. Tier names in ladders/tables keep their own tier colors (house rule for
  tier displays).
- Motion: one-shot entrances via `useBSSdInView` + per-station seen state, existing
  `bsInjectSessionDetailCss` keyframes only (`bsSdDrawX`, `bsSdRise`, count-ups via
  `BSSdCountUp`); every animated style gated on `bsSdReduced()` — reduced motion renders
  finished states. **One breathing loop max per page**: Score spends it on the standing
  chart's you-dot; the Store has none.
- Honest data: every absent case renders a `BSTRedact`-style redaction line or an honest
  `—`; nothing fabricated. Existing demo-vs-live gating (`_bsUseLiveScore`, signed-out
  preview, `bsRequireAccount`) carries over verbatim.
- Every tappable control keeps a ≥44px hit target (invisible padding where the visual is
  smaller).

---

## 1 · Shape Score — "The Standing"

### Score composition (top → bottom)

1. **`BSDetailHeader`** stays (eyebrow "Your standing", trailing STORE button kept for
   nav parity). Title serif "Shape Score." with the italic "Score." keeping the tier
   color (as today).
2. **Verdict lead** — serif, replaces the plate hero: "{Tier}, and climbing." with a
   trailing heat period, plus one italic serif sub-line built from live facts
   ("{into} into the tier — {toNext} from {next}."). Copy degrades honestly: top tier →
   "{Tier}. The top of the ladder."; at-risk → the sub-line is replaced by the rust
   at-risk line (below).
   **At-risk state:** a rust mono line under the verdict — "⚠ {gap} below {tier} — earn
   it back to hold" (same computation as today's hero). The chart is not tinted rust;
   the tier never demotes, so the ladder keeps showing the high-water tier.
3. **Register row** — three `eyebrow-above-figure` registers on hairline separators:
   SCORE (count-up) · THIS WK (`+N`, heat figure) · STREAK (`Nd`). Same values as
   today's hero stats.
4. **THE STANDING** (new station — the owner's chart): station head (heat tick + mono
   eyebrow + ink→heat rule) with a **two-item scale toggle** right-aligned in the head:
   `THE LADDER` (default) / `THIS TIER` — mono 9/800, active = ink + 2px heat underline
   (the typographic-index grammar). Toggle is stateful per mount only (no persistence).
   - **THE LADDER view** — the whole hierarchy as a rising line chart (SVG):
     - **Equal lane per tier**: the x-axis is ordinal — each of the 5 tiers gets an
       equal-width lane regardless of points span (a true points scale would compress
       Raw→Form into ~13% of the width). A one-line ink30 caption under the chart states
       the rule: "Equal lane per tier — the dot's place in its lane is your progress
       through it."
     - Base line: a single polyline rising left→right across the 5 lanes, ink-alpha
       (≈0.18), 2px. Threshold **nodes** at each lane boundary, r≈2.5, filled with each
       tier's own color (the one sanctioned multi-color element, matching every shipped
       tier display).
     - **Progress overlay**: a heat (viewer-tier color) 2.5px path from the origin to
       the you-point, drawn one-shot on first view (`bsSdDrawLine`-style dashoffset);
       the **you-dot** (r≈4, heat) breathes — the page's ONE loop — with the live score
       figure in mono above it and a dotted drop line to the baseline.
     - Names row under the chart: 5 columns, tier names in their tier colors (current
       tier bolded + "· you"), thresholds in ink30 beneath (0 · 750 · 2,000 · 5,000 ·
       15,000; coach ladder renders its own names, same thresholds).
     - You-point math: `x = (tierIndex + frac) / 5`, where `frac` is the existing hero
       computation (`(total − curThr) / (nextThr − curThr)`, clamped 0..1). Top tier →
       dot at the line's end. At-risk (rank < curThr) → frac clamps to 0 (dot sits at
       the lane start).
   - **THIS TIER view** — the zoomed scale: left label "{TIER} · {curThr}" (heat), right
     label "{NEXT} · {nextThr}" (that tier's color); a 3px hairline track with a heat
     fill to `frac`, the same breathing you-dot at the fill end with the score figure
     above it; caption "{toNext} to {next} · {pct}% through the tier", plus the ink30
     line "Tiers never demote — this bar only moves right." Top tier → full bar +
     "Top tier — nothing above."; at-risk → empty bar + the rust gap named in the
     caption.
   - Only one view is mounted at a time; switching does not replay entrances (seen
     state is per-station, not per-view).
5. **MOMENTUM** station — the plate dies; a station head ("MOMENTUM · {val}") over a
   2px hairline track with a heat fill to `val`% and a fixed tick mark at 80; one mono
   status line below (exact current copy set: banked/streak line when `bonusThisWeek`,
   "At the line…" at ≥80, else "Reach 80 for a weekly bonus — grows to +100"), then the
   ink30 explainer line. All current behavior kept: hidden when `momentum` is null
   (signed-in pre-migration/no-data); signed-out preview keeps the demo value + the
   whole station is the `bsRequireAccount('build your momentum')` tap target with the
   teal "Sign in to start building your momentum →" line (teal = action, sanctioned).
6. **`BSCommitmentCard`** stays mounted here with its logic, handlers, and states
   verbatim; chrome restyled to a station (head + zero-box body, dot-leader rows where
   it lists targets/stakes). Its stepper/tap targets come up to ≥44px in the restyle
   (closes the pre-existing 28px note from the coach wave).
7. **Tabbed index** — the four solid-fill buttons become a **typographic index**
   (`TIERS · REWARDS · POINTS · LEDGER`, mono 9/800, active = ink + 2px heat underline).
   Default stays `tiers`. The 320px scroll box dies — the active tab renders inline at
   natural height. Content per tab (all current data, re-set in ledger grammar):
   - **TIERS** — the vertical rung list (this is where P1's "climb" station content
     lives): one row per tier — tier name in its tier color (current tier bold +
     "· you") · dotted leader · mono threshold; perk as an ink50 mono meta line under
     the name. No dots/pills.
   - **REWARDS** — the featured store rows become dot-leader rows (name · leader ·
     `{cost} pts` + "✓ Redeemable" in heat / "{n} to go" in ink50 — never color-only),
     closing with the "Redeem in the Shape Store →" leader (heat underline). Tap
     behavior unchanged (opens the Store).
   - **POINTS** — earn rows as dot-leader rows (`+N` figures in heat); the
     **PROTECT YOUR POINTS** sub-head keeps its rust head + ink→rust rule and rust
     `−N` figures; the "Good to know" box becomes a plain ink70 paragraph under a
     hairline (no tinted box).
   - **LEDGER** — day eyebrow · label · dotted leader · `±N` (earned = heat, penalties
     = rust with "· waivable" named). Same data source.
8. **`BSFooter`** unchanged.

### Kills (Score)

The composite hero `BSPlate` (ring + climb SVG + stats grid) · the momentum `BSPlate`
chrome · the 4 solid-fill tab buttons · the 320px `maxHeight` scroll box · the teal
literal in the hero (`#0a8f87/#34d6c5` constant accent) · the hero's "composite of…"
blurb (the verdict carries the voice now).

### New pure module

`mobile-app/src/services/scoreStanding.mjs` (+ `tests/score-standing.test.mjs`):
`bsScoreStanding(tiers, tierName, total)` → `{ laneIndex, frac, pct, toNext, topTier,
atRisk }` — the one derivation both chart views and the verdict sub-line read, mirroring
the existing hero math (threshold parse from the tiers list, clamped frac, top-tier and
at-risk edge cases). Unit tests cover: mid-tier, exact threshold, top tier, at-risk
(rank below current tier floor), coach ladder names, malformed range strings.

---

## 2 · Shape Store — "The Shop, opened by The Drop" (S8)

### Store composition (top → bottom)

1. **`BSDetailHeader`** stays (eyebrow "Store", kicker "Shape Store", trailing SCORE
   button). Title becomes "Gear & perks." (serif, heat period).
2. **Balance chip row** — right-aligned mono chip on a hairline: `{balance} pts ·
   ≈${usd}` (balance count-up on first view; ≈$ figure in heat). The dark plate hero
   dies; lifetime/redeemed stats move to the LOCKER view (below). The "20 points = $1 ·
   no expiry" fact moves to a single ink30 mono line above the cart bar (S8's
   "Everything ships on points · 20 pts = $1 · no expiry").
3. **Category index** — the boxed pill grid becomes a typographic index:
   `ALL · MERCH · TRAINING · NUTRITION · PERKS · LOCKER` for clients;
   `ALL · MERCH · COACH TOOLS · LOCKER` for coaches (same `roleCats` data filter,
   display labels only — "Merch" = `Shape Merch`, etc). "WITHIN BALANCE" joins the index
   as a toggle item (replaces the boxed button; active = heat underline; same filter).
4. **THE DROP hero** (ALL + MERCH views) — a full-bleed framed media tile (media tiles
   are sanctioned frames): duotone-gradient ground, the product image large, eyebrow
   `DROP {n} · {season}` top-left (heat) and the stock fact top-right (`1 of 30`,
   ink50); footer bar inside the frame: serif product name with heat period · mono
   `{cost} pts · ${retail}` + affordability ("✓ within balance" heat / "{n} to go"
   ink50) · **teal solid REDEEM/ADD** button.
   - **Hero selection rule (deterministic, display-copy driven):** first in-catalogue
     merch item tagged `Limited drop`, else first tagged `New`, else the first merch
     item. No new backend; curation happens by editing the catalogue's display copy.
   - Non-member (`purchasesLocked`): the CTA reads `MEMBERS →` (amber, current
     behavior) and routes to `bsStartPlatformCheckout` as today.
5. **Product grid** (ALL + MERCH views, under the hero) — 2-column tiles: framed image area (hairline border,
   `PAPER2` ground) with tag chips (`LIMITED · 30`, `NEW DROP`, `PEAK TIER`) · name
   (display 600) · mono price line with affordability (`{cost} pts ✓` heat /
   `{cost} · +{gap}` ink50, tile dimmed at 0.6) · the existing cart mechanics: first
   tap = ADD (+ cart), in-cart tiles show the − qty + stepper inline in the tile footer
   (squared, not pill). Tier-locked tiles dim with the tier named (`Unlocks at Peak`),
   non-tappable as today.
   - **Product imagery:** the catalogue gains an optional display-copy `img` field
     (`/m/store/<id>.png`, bundled under `mobile-app/public/store/`). **v1 falls back
     to crafted line-art product glyphs** (one shared `BSStoreGlyph` component keyed by
     product id/category — cap, tee, bottle, crewneck, towel, duffel, generic) so no
     fabricated stock photography ships for real products. When the owner drops real
     product shots into `public/store/`, they take over per item with zero code change.
     *(Owner follow-up: product photography — tracked in War Room.)*
6. **SHAPE DISCOUNTS** department (ALL + the service categories) — every non-merch item
   renders as a big-dollar row: display-700 `${retail}` figure · name + one-line
   descriptor (display 600 / ink50 mono) · mono `{cost} pts` + affordability ·
   right-aligned squared **ADD** button (teal outline when affordable, hairline/ink30
   when not). Rows on hairlines, no cards. For coaches this department is
   **COACH TOOLS** (the Lead Boost 7/14/30 rows, same `redeemLeadBoost` flow). Non-merch
   redemption keeps the confirm-sheet flow exactly (tap → `handleRedeem` → confirm →
   `doRedeem`).
7. **ON DEPOSIT** — when the credit wallet is non-zero, one dot-leader row line under
   the discounts head: `ON DEPOSIT · ${session} session / ${nutrition} nutrition ·
   applies at booking` (replaces the tinted wallet card). Hidden at zero (as today).
8. **LOCKER** (index view) — leads with two registers (LIFETIME EARNED ·
   ITEMS REDEEMED — the figures from the old hero), then redemption codes as dot-leader
   rows (`code` mono · item name · date · `−{cost}`). Empty → redaction line
   ("Nothing redeemed yet"). Demo codes stay signed-out-only (current gating).
9. **Notices** — the tinted notice box becomes an amber-spined zero-box line (3px amber
   spine + text), same message set and triggers.
10. **Cart bar** — stays sticky bottom; restyled from the rounded teal pill to a
    **squared solid-teal bar**: mono `CART · {n}` · dotted leader · `{total} pts ·
    CHECKOUT →`. Same open-checkout behavior; `BSStoreCheckout` itself unchanged.

### Kills (Store)

The dark clipped plate hero (+ its `storeHero*` alpha locals) · the boxed category pill
grid + "Within balance" button · the tinted credit-wallet card · the tinted notice box ·
the rounded-pill ADD/qty controls · the rounded cart bar · `BSSection`("Catalog") chrome
(the departments carry their own station heads).

### Invariants (explicitly unchanged, both pages)

`_bsUseLiveScore` · `BS_STORE_PRODUCTS` + the module-scope retail→cost derivation ·
`window.ShapeStore.get/redeem/checkout/redeemLeadBoost` · cart persistence
(`shape.storeCart`, 9-qty cap, merch-only) · `useBSMembership` gate + browse-free /
redeem-locked behavior · `bsStartPlatformCheckout` · the confirm + shipping flows ·
`BSStoreCheckout` · error/notice message strings · `bsIsCoachRole` role catalogues +
coach tier ladder · the Score↔Store cross-nav props (`onBack`, `onOpenStore`,
`onOpenScore`, `profile`) — the pros bundle consumes both pages via `window` unchanged.

### Accessibility

The scale toggle is two buttons with `aria-pressed` + ≥44px targets; chart views carry
an `aria-label` stating the facts ("1,284 points — Tempo, 43% to Form, 716 to go"); all
count-up figures render final values to screen readers; affordability is never
color-only (✓ / "+N to go" text always present); reduced motion renders finished states
everywhere.

### Verification

Per commit: JSX parse-check · PowerShell mobile build (`$env:VITE_BASE='/m/'`) exit 0 ·
full `npm test` (existing suite + new `score-standing` tests) · LF normalize. On-device
pass (owner, recommended): Black/Sage/Cream papers × client (Raw + Tempo + Legend/at-risk
states) + coach role (coach ladder + Coach Tools) · both chart views + the toggle ·
signed-out demo + preview taps · non-member CTAs · reduced motion.
