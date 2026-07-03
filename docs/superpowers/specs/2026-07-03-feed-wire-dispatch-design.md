# Activity-feed post "Wire Dispatch" redesign — design spec

**Date:** 2026-07-03 · **Status:** approved by owner (3-concept round + adversarial critic + merged-mockup review)
**Surface:** the shared activity post card (`BSActivityCard`, ~lines 11220–11508 of
`mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`) as rendered in the community
feed (`BSClientFeed`) and both profile feeds (the `hideAuthor` variant). The comments
detail page, `BSActivityDetail`, and `BSActivityRoutePreview` internals are unchanged.

## Problem

Every feed post is one dark rounded-rect bordered card: bordered tier/role chips, a
solid-fill type pill, a solid rust co-sign pill, a full-width bordered details bar,
and four circular bordered action buttons — boxy and generic, and visually a
different language from the shipped Session Details "Open Ledger" page (#1523).

## Direction (owner-picked)

**Wire Dispatch + grafts:** the feed as one continuous telegraph tape. The card box
dies entirely — each post is a zero-box "dispatch" threaded on its own author-role
**heat rail**, separated by the house 2px ink→heat gradient rule. Every primitive is
a feed-density repeat of something Open Ledger already shipped (rail + `bsSdGrowY`,
split-unit hero via `bsSdSplitUnit` + `BSSdCountUp`, `bsSdDrawX` rules, redaction-line
GPS fallback, one-shot in-view motion). Six critic grafts are folded in and **override
the base concept wherever they conflict** (each marked ✦ below).

## Design

### 0 · Container → dispatch

Delete the card chrome entirely: background fill, border, radius, `overflow:hidden`
clip, and the 1px top color strip. A post is a plain block on `t.PAPER`. Between
dispatches: the house 2px ink→heat rule (`linear-gradient(90deg, t.INK, heat 70%,
transparent)`), full content width, `margin:'26px 0 24px'`, drawn in-view via
`bsSdDrawX` (700ms, one-shot). No rule after the last post.

### 1 · The per-post heat rail

Absolutely-positioned 2px rail, `left:0, top:4, bottom:0`, spanning title → action
strip, gradient `linear-gradient(180deg, heat, bsTHexA(heat,.35) 42%,
bsTHexA(t.INK,.1) 78%, transparent)`; content at `paddingLeft:15`. Heat = the
author's role color (client teal `t.isLight ? '#0a8f87' : '#34d6c5'`, trainer rust
`#c0533b`, nutritionist gold `#a07a2e`/`#d8b25a`). Rail grows in on first view
(`bsSdGrowY` 900ms, `transformOrigin:'top'`). ✦ **No breathing tick on feed cards —
zero infinite loops at feed scale; the live tick stays a detail-page signature.**

### 2 · Author row

36px `BSFacetAvatar` unchanged (avatars stay round — the one shape exception).
Bordered tier/role chips die: plain mono `PEAK · CLIENT` 7px/800/0.12em
`bsTHexA(t.INK,.55)`. Name `t.DISPLAY` 13.5/800 always `t.INK` (identity is weight,
not color). Meta line unchanged. ✦ Type tag (STRENGTH): the solid teal pill becomes
**ink text with a heat underline only** — mono 7.5px/800/0.14em uppercase
`bsTHexA(t.INK,.7)`, 1px heat underline; heat never fills or colors the label text.

### 3 · Title + hero stat (the ledger line)

Title `t.DISPLAY` 16px/800 `t.INK` + the Open Ledger trailing heat period (added
only when no terminal punctuation). Hero: eyebrow (`TOP SET`) mono 7.5px/0.2em
`bsTHexA(t.INK,.5)` ABOVE the figure; value via `bsSdSplitUnit` — number `t.DISPLAY`
`min(34px,9vw)`/700/-0.035em tabular through `BSSdCountUp`, unit mono 12px/700
`bsTHexA(t.INK,.55)` baseline-gapped 6px. A 2px heat rule draws under the figure
(`linear-gradient(90deg, heat, bsTHexA(heat,.25) 55%, transparent)`, `bsSdDrawX`
900ms). Body caption below the rule: 12.5px/1.35 `bsTHexA(t.INK,.75)`, same rail
gutter. Posts with no hero stat (notes/photos) skip the figure block — title, rule,
caption only; never a fabricated number.

### 4 · Links

`SESSION DETAILS · FULL ACTIVITY ›`: ✦ **ink text + heat underline/chevron only**
(mono 8.5px/800/0.12em uppercase `bsTHexA(t.INK,.7)`, 1px heat underline, heat ›).
No borderTop, no full-width bar — a real `<button>` with generous INVISIBLE padding
for a ≥44px target.

### 5 · Co-sign — the press credit ✦

The solid rust pill becomes a press-credit line: **3px role-colored left spine**
(rust/gold, 100% of the line height) + heat ✓ glyph (mono 10px/900) + name
`t.DISPLAY` 12.5/800 in `t.INK` + `co-signed · coach` mono 8px/800 uppercase in
`bsTHexA(t.INK,.55)` — **name AND label in ink-alphas, never role-colored text**.
Reads heavier than peer reactions with zero fill. Still tappable → coach profile;
`bsSdStamp` entrance kept. Eligibility/gating logic untouched (presentation-only).

### 6 · Reactions row

22px facepile avatars unchanged (other people's tier colors are their signal, not
this post's rail). Label = one continuous mono sentence 8.5px/800/0.06em uppercase
`bsTHexA(t.INK,.55)` + chevron; no chrome.

### 7 · Action strip ✦

One row above a 1px `bsTHexA(t.INK,.08)` hairline (`marginTop:16, paddingTop:12`).
✦ **Five flex-distributed cells (`flex:1`), each min 44×44px, centered glyphs,
invisible boundaries** — no circles, no borders. Boost cell: `bsFeedIcon('react')` +
verb + count (`BEAST · 41`), height 36, **squared `borderRadius:6`** — tinted
`${accent}14` unreacted, filled accent when reacted (heat's single permitted fill).
Comment/Share/Send/Repost: bare monochrome glyph 15px + mono 9.5px count,
`bsTHexA(t.INK,.55)` → `t.INK` on press. ✦ Press state = transform-only
`scale(0.97)` 120ms. Long-press expressive palette + all handlers unchanged.

### 8 · Comments ✦

✦ Section eyebrow **`COMMENTS · 6 ›`** — mono 7.5px/800/0.18em uppercase
`bsTHexA(t.INK,.55)` with a 6×1.5px heat tick at its left — the eyebrow row IS the
view-all affordance (tappable, ≥44px via padding). The separate `VIEW ALL N
COMMENTS ›` line is deleted; at ≤2 comments the eyebrow alone carries the count.
`BSFeedComment` rows unchanged below it (slice-of-2 pattern kept).

### 9 · Route posts ✦

✦ `BSActivityRoutePreview` runs **full-bleed edge-to-edge** (negative margins out of
the rail gutter and the page gutter) with 1px `bsTHexA(t.INK,.1)` hairlines top and
bottom, no side borders — a printed-photo bleed. The component itself is NOT
modified. The routeless halftone fallback box collapses to Open Ledger's redaction
line: 1px dashed rule flexing both sides of centered mono `GPS · NOT RECORDED`
7.5px `bsTHexA(t.INK,.45)`.

## Heat discipline (line-only, post-graft)

Heat appears ONLY as: the rail · the title period · the hero rule · the type-tag
underline · the co-sign ✓ (spine is role color) · the details-link underline +
chevron · the comments-eyebrow tick · the boost cell's tint/fill · the separator
rule's terminus. It NEVER colors running text, names, bylines, stat values, or any
background beyond the boost fill. All text resolves from `t.INK` alphas (1.0 / .75 /
.7 / .55 / .45 / .08) so AA holds on all 14 papers.

## Motion contract

One-shot, in-view, **one `useBSSdInView` observer per card** (not per field — feeds
run dozens of cards). Per dispatch on first view: rail grows (`bsSdGrowY` 900ms) →
hero counts (`BSSdCountUp` 750ms) → hero rule + separator rule draw (`bsSdDrawX`
700–900ms) → co-sign stamps (`bsSdStamp`). ✦ Zero infinite loops. No parallax, no
hover-lift, no shimmer (detail-page-only). Every animated style uses the
`...(reduced ? null : {animation})` spread; `bsSdReduced()` → finished state.

## Deletes / keeps

**Deleted:** the card container + top strip · tier/role chip pills · the filled
type pill · the rust co-sign pill · the bordered details bar · the four circular
action buttons · the 80px halftone GPS box · the 999px pill radius inside the card.
**Kept, behavior-identical:** every interaction (react/long-press palette, comments,
share, send, repost, co-sign tap, details tap-through, profile taps) · reaction-verb
mapping · co-sign gating (`iAmAuthorsCoach`, honest null) · real counts only ·
`hideAuthor` profile variant (same rail/rule treatment, no author block) ·
`BSFacetAvatar` + `BSFeedComment` + `BSActivityRoutePreview` as-is.

## Risks (carry into the plan's verification)

- Dispatch-to-dispatch rhythm: two same-role posts back-to-back must not read as one
  rail — verify the 26/24px separator margins on device.
- Invisible 44px targets on the bare-glyph strip — confirm forgiving in practice.
- Observer count at feed scale — one per card, perf sanity pass after build.
- Details link loses its big bar — generous invisible padding, watch tap-through.

## Out of scope

`BSActivityDetail` (shipped #1523), the comments focus page, `BSActivityRoutePreview`
internals, `BSFeedComment` internals, website feed (`dashboardCommunity.jsx`) — a
follow-up parity pass once mobile ships.

## Verification

JSX parse-check · PowerShell mobile build (`$env:VITE_BASE='/m/'`) · full `npm test`
· LF normalization · CI (`public/m` built at deploy, #1470) · on-device pass on
Black + Sage + Cream papers with fixtures: a PR post (co-signed), a run with a GPS
route, a routeless run, a photo post, and a plain note — in BOTH the community feed
and a profile feed (`hideAuthor`).

**Sequencing:** builds AFTER the Home "Front Page" hybrid ships (same 22k-line file).
Reference mockups: the owner-approved merged phone mockup (Wire Dispatch + grafts)
in the design-review artifact, 2026-07-03.
