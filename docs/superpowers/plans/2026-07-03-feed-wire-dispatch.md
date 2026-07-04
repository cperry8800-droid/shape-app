# Activity-Feed "Wire Dispatch + grafts" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the shared activity post card (`BSActivityCard`) from a dark bordered rounded-rect into a zero-box "dispatch" on a per-author heat rail, serializing the shipped Session Details Open Ledger language at feed density.

**Architecture:** A component-scoped rewrite of `BSActivityCard` (plus its immediate render helpers) in `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`. Spec: `docs/superpowers/specs/2026-07-03-feed-wire-dispatch-design.md` (on main — BINDING, grafts marked ✦ override the base concept). All interactions, data mapping (`bsActivityFromPost`), reaction-verb logic, co-sign gating, and shared components (`BSFacetAvatar`, `BSFeedComment`, `BSActivityRoutePreview`) survive untouched — this is presentation-layer surgery with zero behavior change.

**Tech Stack:** React in the window-global JSX bundle; existing Open Ledger primitives reused (`bsSdSplitUnit`, `BSSdCountUp`, `useBSSdInView`, `bsSdReduced`, `bsSdDrawX`/`bsSdGrowY`/`bsSdStamp` keyframes via `bsInjectSessionDetailCss`).

## Global Constraints

Every task's requirements implicitly include this section.

- **Zero-box rule:** the card container (background fill, border, radius, overflow clip, 1px top color strip) is DELETED. Boundaries come only from the ink→heat separator rule, the per-post rail, and whitespace.
- **Heat = line-only** (post-graft placements ONLY): the rail · the title period · the hero rule · the type-tag underline · the co-sign ✓ (spine = role color) · the details-link underline + chevron · the comments-eyebrow tick · the boost cell tint/fill · the separator rule terminus. Heat NEVER colors running text, names, bylines, stat values, or any background beyond the boost fill. Text = `t.INK` alphas (1.0/.75/.7/.55/.45/.08).
- **✦ Grafts are binding overrides:** zero infinite loops on feed cards (NO breathing tick); co-sign = press credit (3px role spine + heat ✓, name AND label ink-alphas); links/type-tag = ink text + heat underline only; route posts = `BSActivityRoutePreview` full-bleed with 1px top/bottom hairlines (component NOT modified); comments = `COMMENTS · N ›` eyebrow with 6×1.5px heat tick (the eyebrow IS the view-all; no separate line); action strip = five flex:1 cells each ≥44×44px, invisible boundaries, boost = 36px visible chip centered in its ≥44px cell, squared radius 6, transform-only scale(0.97) press.
- **Motion contract:** ONE `useBSSdInView` observer per card. On first view: rail grows (`bsSdGrowY` 900ms) → hero counts (`BSSdCountUp` 750ms) → hero + separator rules draw (`bsSdDrawX`) → co-sign stamps (`bsSdStamp`). Every animated style uses `...(reduced ? null : {animation})` with `bsSdReduced()`; reduced motion = finished state. No new keyframes unless a required one doesn't exist (then it goes inside the reduced-motion media block of the injected CSS).
- **Honest data:** real counts only; posts with no hero stat skip the figure block (never fabricate); route redaction line only for the routeless flag; captions never invent fields.
- **Behavior-identical interactions:** react/boost (tap toggle + long-press expressive palette), comments open, share, send, repost, co-sign tap, details tap-through, profile taps — handlers carried VERBATIM. `hideAuthor` profile-feed variant keeps working (same rail/rule treatment, no author block).
- **Shared components untouched:** `BSFacetAvatar`, `BSFeedComment`, `BSActivityRoutePreview`, `bsFeedIcon` (may gain size props ONLY if a task explicitly says so — default no).
- **A11y:** every action ≥44px target (invisible padding, not chrome); all actions keyboard-reachable; aria-labels carry the verb/count; decorative rails/rules aria-hidden.
- **14 papers:** theme tokens only (`t.*`, `bsTHexA`); role heat = client teal (`t.isLight ? '#0a8f87' : '#34d6c5'`), trainer rust `#c0533b`, nutritionist gold `#a07a2e`/`#d8b25a` — resolve heat the way the card already resolves its role color.
- **Locate by code text, never line numbers** — the file is ~22.9k lines and shifts. `BSActivityCard` is found by its function signature `function BSActivityCard({ a, ctx, hideAuthor = false })`.
- **Verification, every task:** parse-check from `mobile-app/`; PowerShell-only build (`$env:VITE_BASE='/m/'`, expect EXIT=0); full `npm test` (382/382); `sed -i 's/\r$//'` on touched files; conventional commit ending `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; NO push.

---

### Task 1: Dispatch shell: kill the card box, add the rail + separator + author-row conversion

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — `BSActivityCard`'s
  outer shell + author-row JSX only (~lines 11244–11379 of the current file; locate
  by code text, not line numbers — the file shifts). Three call sites gain one new
  prop each (`isLast`): the community-feed map (~line 12658) and both profile-feed
  maps (~lines 9312–9319, ~9969–9975).

**Interfaces:**
- Consumes (verbatim, unchanged): `ctx.{t, cardInk, muted, hair, card, actLikes,
  actComments, actCmtOpen, actDetailsOpen, actCoSign, actExpr, exprOpenKey,
  setExprOpenKey, lpTimerRef, lpFiredRef, tierByUser, avatarByUser, feedAvatars,
  myRole, coachClientIds, myFollowingSet, setOpenProfile, setActivityDetail,
  setLikerSheetFor, setSendPostFor, feedApplyReaction, onEdit}`; `useBSSdInView`,
  `bsSdReduced`, `bsSdGrowY`/`bsSdDrawX` keyframes, `bsInjectSessionDetailCss`,
  `BSFacetAvatar`, `bsInitials`, `bsTHexA`.
- Produces: **`const [railRef, railSeen] = useBSSdInView();`** — the ONE
  `useBSSdInView` instance for the whole card, hoisted at the top of
  `BSActivityCard`'s body (before any early return). `railRef` goes on the rail's
  wrapping element; `railSeen` gates every later task's first-view animation
  (hero count-up, co-sign stamp, etc.) — later tasks read this pair, they do not
  create their own. `BSActivityCard` gains one new prop, **`isLast = false`**
  (default false — every existing call site keeps working with no separator
  suppressed until updated in this task's Step 4).

---

- [ ] **Step 1: Read the exact card-shell + author-row JSX to be replaced**

Grep to confirm the anchor is still unique, then read the full function once more
to have the literal text in hand (locate by code text — the file is ~22.9k lines
and shifts):

```
grep -n "function BSActivityCard({ a, ctx, hideAuthor" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
```

Confirms the two blocks this step touches:

1. **The card shell** — the outer container + 1px top color strip:
   ```jsx
   return (
     <div style={{ background: card, overflow: 'hidden' }}>
       <div style={{ height: 1, background: tc }} />
       <div style={{ padding: '10px 13px 11px' }}>
   ```
   (closing tags at the bottom of the function: `</div></div></div>);`)

2. **The author row** — both the `hideAuthor` branch and the normal branch,
   verbatim from the current file:
   ```jsx
           {hideAuthor ? (
             <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
               <span style={{ fontFamily: t.MONO, fontSize: 8, color: muted, letterSpacing: '0.04em' }}>{a.ago}</span>
               {/* owner edit — only when the host supplies onEdit (profile) AND the
                   card is a real published post; the community feed passes no onEdit,
                   and demo/PR cards have no postId, so this stays profile-own-posts. */}
               {onEdit && a.postId && <button aria-label="Edit activity" onClick={() => onEdit(a)} style={{ marginLeft: 'auto', flexShrink: 0, background: 'transparent', border: `1px solid ${hair}`, borderRadius: 999, width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: muted, fontFamily: t.MONO, fontSize: 11, lineHeight: 1, padding: 0 }}>✎</button>}
               <span style={{ marginLeft: (onEdit && a.postId) ? 0 : 'auto', flexShrink: 0, fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#fff', background: tc, padding: '3px 6px', borderRadius: 4 }}>{typeLabel}</span>
             </div>
           ) : (
           <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
             <BSFacetAvatar size={36} c={tc} initial={bsInitials(a.who)} name={a.who} photo={avatarPhoto} showRank={false} onClick={openCardProfile} />
             <div style={{ flex: 1, minWidth: 0 }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                 <button onClick={openCardProfile} style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontFamily: t.DISPLAY, fontWeight: 800, fontSize: 13.5, color: cardInk, whiteSpace: 'nowrap' }}>{a.who}</button>
                 <span style={{ fontFamily: t.MONO, fontSize: 7, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: tc, border: `1px solid ${tc}80`, padding: '1px 4px', borderRadius: 3, lineHeight: 1 }}>{tierDisplay}</span>
                 <span style={{ fontFamily: t.MONO, fontSize: 7, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: muted, border: `1px solid ${hair}`, padding: '1px 4px', borderRadius: 3, lineHeight: 1 }}>{a.role || 'Client'}</span>
               </div>
               <div style={{ fontFamily: t.MONO, fontSize: 8, color: muted, marginTop: 2, letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.ago} ago · {a.city}</div>
             </div>
             <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#fff', background: tc, padding: '3px 6px', borderRadius: 4 }}>{typeLabel}</span>
           </div>
           )}
   ```

Both blocks live between the hero (`onClick={() => openDetail('stats')}`) block
and everything below — this task touches ONLY the shell + these two author-row
variants; the hero, media, coach-attribution, route, session-details link,
co-sign, palette, facepile, action row, and comments blocks that follow are
**not edited** in this task (they keep rendering exactly as they do today,
inside the new shell — they may look visually odd sitting in a boxless
container until later tasks convert them; that's expected and documented in
Step 6 below).

---

- [ ] **Step 2: Resolve `heat` (role color) + hoist the one `useBSSdInView` call**

Locate this exact snippet — the destructure + tier/role derivation at the top of
`BSActivityCard`, right after the `const key = …` line:

```jsx
    const key = a.key || `${a.who}|${a.ago}`;
```

Replace with (adds `heat` resolution — the same role-color pattern the file
already uses elsewhere, e.g. `const roleColor = (r) => r === 'trainer' ? '#c0533b' : r === 'nutritionist' ? '#a07a2e' : teal;` —
and hoists the single `useBSSdInView` pair the whole card + all later tasks
share):

```jsx
    const key = a.key || `${a.who}|${a.ago}`;
    // Dispatch rail heat — role color, NOT tier (tier stays on the avatar ring +
    // tier chip only). Same three literals as every other role-color site in this
    // file (co-sign badge, roleColor() helper): client teal · trainer rust ·
    // nutritionist gold. Resolved from a.role, honest for both real + demo cards.
    const heat = a.role === 'Trainer' ? '#c0533b' : a.role === 'Nutritionist' ? '#a07a2e' : (t.isLight ? '#0a8f87' : '#34d6c5');
    // ONE useBSSdInView instance for the whole card (Global Constraint: one
    // observer per card). railRef goes on the rail; railSeen gates the rail's
    // own first-view growth below AND every later task's first-view animation
    // (hero count-up, hero/separator rule draws, co-sign stamp) — later tasks
    // consume this same [railRef, railSeen] pair, they do not call the hook again.
    const [railRef, railSeen] = useBSSdInView();
    const sdReduced = bsSdReduced();
    React.useInsertionEffect(() => { bsInjectSessionDetailCss(); }, []);
```

`useBSSdInView`, `bsSdReduced`, and `bsInjectSessionDetailCss` are the existing
Open Ledger primitives (defined earlier in this same file, above
`BSActivityCard`) — reused verbatim, not redefined. `bsInjectSessionDetailCss`
is idempotent (guarded by its own `_bsSdCssInjected` module flag), so calling it
again from the feed card is safe even though the Session Details page also
calls it — the `bsSdGrowY`/`bsSdDrawX`/`bsSdStamp` keyframes it injects are
exactly what this task and later tasks need, with no new keyframe required.

---

- [ ] **Step 3: Replace the shell + author row**

Locate this exact snippet (the shell open + both author-row branches, ending
right before the hero block's opening comment):

```jsx
    return (
      <div style={{ background: card, overflow: 'hidden' }}>
        <div style={{ height: 1, background: tc }} />
        <div style={{ padding: '10px 13px 11px' }}>
          {/* author + activity type — or, when hideAuthor (profile feed), a slim
              header: the type chip on the right + the relative time on the left
              (the profile's own card chrome already owns the author identity). */}
          {hideAuthor ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
              <span style={{ fontFamily: t.MONO, fontSize: 8, color: muted, letterSpacing: '0.04em' }}>{a.ago}</span>
              {/* owner edit — only when the host supplies onEdit (profile) AND the
                  card is a real published post; the community feed passes no onEdit,
                  and demo/PR cards have no postId, so this stays profile-own-posts. */}
              {onEdit && a.postId && <button aria-label="Edit activity" onClick={() => onEdit(a)} style={{ marginLeft: 'auto', flexShrink: 0, background: 'transparent', border: `1px solid ${hair}`, borderRadius: 999, width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: muted, fontFamily: t.MONO, fontSize: 11, lineHeight: 1, padding: 0 }}>✎</button>}
              <span style={{ marginLeft: (onEdit && a.postId) ? 0 : 'auto', flexShrink: 0, fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#fff', background: tc, padding: '3px 6px', borderRadius: 4 }}>{typeLabel}</span>
            </div>
          ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
            <BSFacetAvatar size={36} c={tc} initial={bsInitials(a.who)} name={a.who} photo={avatarPhoto} showRank={false} onClick={openCardProfile} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={openCardProfile} style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontFamily: t.DISPLAY, fontWeight: 800, fontSize: 13.5, color: cardInk, whiteSpace: 'nowrap' }}>{a.who}</button>
                <span style={{ fontFamily: t.MONO, fontSize: 7, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: tc, border: `1px solid ${tc}80`, padding: '1px 4px', borderRadius: 3, lineHeight: 1 }}>{tierDisplay}</span>
                <span style={{ fontFamily: t.MONO, fontSize: 7, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: muted, border: `1px solid ${hair}`, padding: '1px 4px', borderRadius: 3, lineHeight: 1 }}>{a.role || 'Client'}</span>
              </div>
              <div style={{ fontFamily: t.MONO, fontSize: 8, color: muted, marginTop: 2, letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.ago} ago · {a.city}</div>
            </div>
            <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#fff', background: tc, padding: '3px 6px', borderRadius: 4 }}>{typeLabel}</span>
          </div>
          )}
```

Replace with the zero-box dispatch shell — rail (absolute, gradient fading down,
grows on first view via the hoisted `[railRef, railSeen]`), the ink→heat
separator rule (rendered as each card's own TOP rule — see the comment for why,
suppressed on `isLast` per this task's chosen mechanism for "no rule after the
last post"), a `paddingLeft:15` rail gutter for all content, and the
chips-to-mono / ink-text / heat-underline author-row conversion (graft, spec
§2):

```jsx
    return (
      <div ref={railRef} style={{ position: 'relative' }}>
        {/* ink→heat separator rule — rendered as THIS card's own TOP edge, not a
            trailing rule after the previous card. Mechanism chosen because "last
            card" isn't knowable from inside BSActivityCard (all three call sites
            map over an array with `i`/length available, but that isn't threaded
            in as a prop until this task's Step 4) — a leading rule per card,
            suppressed on the FIRST card via CSS `:not(:first-child)` would need a
            sibling selector this inline-style architecture doesn't have, so the
            suppression instead happens on `isLast` (passed the array's own
            i === length-1) which is the cleaner one-prop wire: every card except
            the LAST draws a bottom separator (still visually "between posts", it
            just lives on the card above the gap rather than the one below it).
            Reduced motion: bsSdDrawX is fully gated behind Step 2's sdReduced. */}
        <div style={{ paddingLeft: 15 }}>
          {/* per-post 2px heat rail — absolute, gradient fades down the card's
              height, grows in on first view (bsSdGrowY, one useBSSdInView per
              card from Step 2). aria-hidden: decorative, carries no content. */}
          <div aria-hidden style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 2, borderRadius: 1, background: `linear-gradient(180deg, ${heat}, ${bsTHexA(heat, 0.35)} 45%, ${bsTHexA(t.INK, 0.1)} 78%, transparent)`, ...(sdReduced || railSeen ? null : { transformOrigin: 'top', transform: 'scaleY(0)' }), ...(sdReduced ? null : railSeen ? { transformOrigin: 'top', animation: 'bsSdGrowY 900ms cubic-bezier(.4,0,.2,1) both' } : null) }} />
          <div style={{ padding: '10px 13px 11px 0' }}>
            {/* author + activity type — or, when hideAuthor (profile feed), a slim
                header: the type chip on the right + the relative time on the left
                (the profile's own card chrome already owns the author identity).
                Chips are gone: type reads as plain mono ink text with a heat
                underline (graft); name is always t.INK (no tier tint on running
                text — heat/tier are line-only per the Global Constraints). */}
            {hideAuthor ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
                <span style={{ fontFamily: t.MONO, fontSize: 8, color: muted, letterSpacing: '0.04em' }}>{a.ago}</span>
                {/* owner edit — only when the host supplies onEdit (profile) AND the
                    card is a real published post; the community feed passes no onEdit,
                    and demo/PR cards have no postId, so this stays profile-own-posts. */}
                {onEdit && a.postId && <button aria-label="Edit activity" onClick={() => onEdit(a)} style={{ marginLeft: 'auto', flexShrink: 0, background: 'transparent', border: `1px solid ${hair}`, borderRadius: 999, width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: muted, fontFamily: t.MONO, fontSize: 11, lineHeight: 1, padding: 0 }}>✎</button>}
                <span style={{ marginLeft: (onEdit && a.postId) ? 0 : 'auto', flexShrink: 0, fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK, borderBottom: `1px solid ${heat}`, paddingBottom: 2, lineHeight: 1 }}>{typeLabel}</span>
              </div>
            ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
              <BSFacetAvatar size={36} c={tc} initial={bsInitials(a.who)} name={a.who} photo={avatarPhoto} showRank={false} onClick={openCardProfile} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={openCardProfile} style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontFamily: t.DISPLAY, fontWeight: 800, fontSize: 13.5, color: t.INK, whiteSpace: 'nowrap' }}>{a.who}</button>
                  <span style={{ fontFamily: t.MONO, fontSize: 7, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: muted, border: `1px solid ${hair}`, padding: '1px 4px', borderRadius: 3, lineHeight: 1 }}>{a.role || 'Client'}</span>
                </div>
                <div style={{ fontFamily: t.MONO, fontSize: 8, color: muted, marginTop: 2, letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.ago} ago · {a.city}</div>
              </div>
              <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK, borderBottom: `1px solid ${heat}`, paddingBottom: 2, lineHeight: 1 }}>{typeLabel}</span>
            </div>
            )}
```

Notes on this replacement:
- **Tier chip is deleted** (`tierDisplay` badge with the `tc`-colored border) —
  per spec §2 "chips die → plain mono PEAK-CLIENT text; name always `t.INK`; type
  tag = ink text + 1px heat underline." The role chip (`a.role || 'Client'`) is
  KEPT as-is (still a bordered mono chip, `muted`/`hair`) — the spec's chip
  deletion targets the **tier** chip + the type-tag treatment, not the role
  label; `tierDisplay`/`tc` remain used elsewhere in the function (the avatar
  ring `c={tc}`, the co-sign spine, the hero PR delta) so they stay defined —
  this step only stops rendering the tier chip inline in the author row.
  `tierDisplay` becomes temporarily unused-in-this-block but is still consumed
  later in the same function (co-sign / hero), so no dead-variable warning.
- **Type-tag treatment**: was a solid `tc`-filled pill with white text; now ink
  text with a heat-colored 1px bottom border (the "1px heat underline" graft) —
  same pattern as the Session Details page's PR-delta underline
  (`borderBottom: '1px solid ${heat}'`).
- **`hideAuthor` variant kept working**: both branches still render (time +
  optional edit + type-tag on `hideAuthor`; avatar + name + role chip + type-tag
  on the normal path) — only the tier chip removal and type-tag restyle apply to
  both, so the rail/rule treatment is identical whether or not the author block
  shows.
- **`BSFacetAvatar` + all profile taps kept verbatim** — `size={36}`, `c={tc}`
  (tier still colors the avatar ring — only running/chip text lost tier tint),
  `onClick={openCardProfile}` untouched.
- Do **not** touch anything from the hero block onward (`{/* HERO — activity
  name + the promoted primary metric. ... */}` through the end of the function)
  — those blocks still sit inside the new `<div style={{ padding: '10px 13px 11px 0' }}>`
  wrapper opened above; their own closing tags are unchanged, so the function's
  final `</div></div></div>);` becomes `</div></div></div>);` (one fewer level
  removed at the top — the old shell had two wrapping divs
  `background/overflow` + `padding`, the new shell has `railRef` wrapper +
  `paddingLeft:15` gutter + `padding` inner — same nesting depth, so the
  existing closing-tag count at the bottom of the function does not change).

---

- [ ] **Step 4: Add `isLast` prop + the bottom separator rule, wire it at all three call sites**

Locate the function signature:

```jsx
function BSActivityCard({ a, ctx, hideAuthor = false }) {
```

Replace with:

```jsx
function BSActivityCard({ a, ctx, hideAuthor = false, isLast = false }) {
```

Locate the very end of the function — the closing tags after the comments
block (the last three closing `</div>` before the function's final `);`):

```jsx
        </div>
      </div>
    );
}
```

Replace with (adds the bottom ink→heat separator, drawn via `bsSdDrawX` on
first view, suppressed on the last card in the list):

```jsx
        </div>
        {/* ink→heat separator — the boundary between this post and the next.
            Suppressed on the LAST card in the list (isLast) so the feed doesn't
            end on a trailing rule; every other card draws it. Terminus is heat
            per the Global Constraints ("the separator rule terminus" is a
            heat-line placement); the rest of the rule fades to a bare hairline. */}
        {!isLast && (
          <div aria-hidden style={{ height: 1, marginTop: 11, background: `linear-gradient(90deg, ${bsTHexA(t.INK, 0.1)}, ${bsTHexA(t.INK, 0.1)} 70%, ${heat})`, transformOrigin: 'left', ...(sdReduced ? null : { animation: 'bsSdDrawX 700ms cubic-bezier(.4,0,.2,1) both' }) }} />
        )}
      </div>
    );
}
```

Now wire `isLast` at all three call sites (the only places that know the
array/index — this is the mechanism this task chose for "no rule after the
last post," since `BSActivityCard` cannot know its own position otherwise).

**Site 1 — community feed** (locate this exact snippet):

```jsx
                return cards.map((a, i) => <React.Fragment key={a.key || `act-${i}`}><BSActivityCard a={a} ctx={feedCtx} /></React.Fragment>);
```

Replace with:

```jsx
                return cards.map((a, i) => <React.Fragment key={a.key || `act-${i}`}><BSActivityCard a={a} ctx={feedCtx} isLast={i === cards.length - 1} /></React.Fragment>);
```

**Site 2 — member (Terrain) profile feed** (locate this exact snippet):

```jsx
                {feedEff.map((a, i) => (
                  /* Full-BLEED card — breaks out of the tab body's 20px side
                     padding to span the whole screen (side borders + radius
                     dropped at the edges). The card's own age chip carries the
                     timing; author header hidden (the profile owns the identity). */
                  <div key={a.key || i} style={{ ...card, overflow: 'hidden', margin: '0 -20px 12px', borderRadius: 0, borderLeft: 0, borderRight: 0 }}>
                    <BSActivityCard a={a} ctx={profileCtx} hideAuthor />
                  </div>
                ))}
```

Replace with (the wrapping `div`'s own `card`/border/radius/margin styling is
untouched here — it belongs to the profile page's full-bleed row treatment, not
to `BSActivityCard`'s own shell, and this task's Global Constraints only cover
the card's OWN chrome, not the profile page's row wrapper. That wrapper's
`overflow:hidden`/background is a pre-existing, separate concern outside this
task's scope):

```jsx
                {feedEff.map((a, i) => (
                  /* Full-BLEED card — breaks out of the tab body's 20px side
                     padding to span the whole screen (side borders + radius
                     dropped at the edges). The card's own age chip carries the
                     timing; author header hidden (the profile owns the identity). */
                  <div key={a.key || i} style={{ ...card, overflow: 'hidden', margin: '0 -20px 12px', borderRadius: 0, borderLeft: 0, borderRight: 0 }}>
                    <BSActivityCard a={a} ctx={profileCtx} hideAuthor isLast={i === feedEff.length - 1} />
                  </div>
                ))}
```

**Site 3 — coach (Signal) profile feed** (locate this exact snippet):

```jsx
              {coachFeedEff.map((a, i) => (
                /* Full-BLEED card — breaks out of the coach body's 22px side
                   padding to span the whole screen (side borders + radius
                   dropped at the edges). The card's own age chip carries the timing. */
                <div key={a.key || i} style={{ ...card, overflow: 'hidden', margin: '0 -22px 12px', borderRadius: 0, borderLeft: 0, borderRight: 0 }}>
                  <BSActivityCard a={a} ctx={profileCtx} hideAuthor />
                </div>
              ))}
```

Replace with:

```jsx
              {coachFeedEff.map((a, i) => (
                /* Full-BLEED card — breaks out of the coach body's 22px side
                   padding to span the whole screen (side borders + radius
                   dropped at the edges). The card's own age chip carries the timing. */
                <div key={a.key || i} style={{ ...card, overflow: 'hidden', margin: '0 -22px 12px', borderRadius: 0, borderLeft: 0, borderRight: 0 }}>
                  <BSActivityCard a={a} ctx={profileCtx} hideAuthor isLast={i === coachFeedEff.length - 1} />
                </div>
              ))}
```

> **Note on the two profile-feed wrapper `div`s** (`...card, overflow:'hidden',
> margin:'0 -20px 12px'/'0 -22px 12px', borderRadius:0, borderLeft:0,
> borderRight:0`): these are the PROFILE PAGE's own full-bleed row chrome
> (predates this task, unrelated to the card-box-chrome this task deletes —
> `card` here is the light/dark panel fill from the profile's own `ctx`, e.g.
> `{ background: bsTHexA(INK, 0.04), border: '1px solid ...', borderRadius: 14 }`
> overridden to `borderRadius:0` for full-bleed). They are OUT OF SCOPE for this
> task (Task 1 touches `BSActivityCard`'s own shell, not its callers' wrapper
> divs) and are left exactly as they render today — including their own
> `overflow:hidden` background, which will visually double up with the new
> zero-box card underneath until a later task (if any) revisits the profile
> row wrapper. This is a known, acceptable seam for this task; not silently
> dropped — called out here per the brief's "may temporarily look odd" allowance.

---

- [ ] **Step 5: Parse-check**

From `mobile-app/`:

```
node -e "require('@babel/parser').parse(require('fs').readFileSync('src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"
```

Expected: no output (clean parse).

---

- [ ] **Step 6: PowerShell mobile build**

```powershell
cd C:\Users\cperr\shape-app\mobile-app; $env:VITE_BASE='/m/'; npm run build
```

Expected: exit 0 (`✓ built in …s`). Never Git Bash for this build (path-mangles
`VITE_BASE=/m/` → `/`). Do not commit `public/m` — it's built at deploy (#1470).

**Expected visual note (acceptable for this task only):** every activity card
in the feed and on both profiles now renders boxless with a heat rail down the
left and no tier chip — but the hero, media, route, "Session details ›" link,
co-sign badge, expressive-palette row, facepile, action-pill row, and inline
comments below the author row are UNCHANGED JSX from before this task, so they
will look inconsistent sitting in the new shell (e.g. the hero's own internal
spacing assumed a padded box; the action-pill row's `borderTop` hairline is now
floating in open whitespace rather than against a card edge). This is expected
and intentional — later tasks in this plan convert those blocks to match the
new dispatch language. Do not "fix" them in this task.

---

- [ ] **Step 7: Full test suite**

From repo root:

```
npm test
```

Expected: 382/382 passing (no test in the suite exercises `BSActivityCard`
directly — this is a JSX-only presentational change with no pure-module
surface, so the count should be unchanged from before this task).

---

- [ ] **Step 8: LF-normalize the touched file**

Edit/Write save CRLF on Windows; this repo's tracked JSX is LF:

```
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
```

---

- [ ] **Step 9: Commit**

```
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "$(cat <<'EOF'
feat(feed): dispatch shell — kill the card box, add heat rail + separator (#task1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

No push.

### Task 2: Hero ledger + links + co-sign press credit

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (`BSActivityCard` — the
  hero block, the "Session details · full activity" link, and the co-sign badge)

**Interfaces:**
- Consumes (unchanged, carried verbatim from the current card — do not touch): `title`,
  `heroStat`, `prDelta`, `a.body`, `openDetail`, `coSign`/`coSignColor`/`coSignIsMine`,
  `iAmAuthorsCoach`, `setOpenProfile`, `bsMyName()`, `bsInitials()`, `tc` (the card's
  resolved role/tier heat color — this task's `heat` local is just `tc`, matching the
  card's existing naming; no new heat-resolution logic). Consumes the primitives named in
  the Global Constraints (`bsSdSplitUnit`, `BSSdCountUp`, `bsSdSplitUnit`'s output shape
  `{num, unit}`) and — from Task 1 — the card's single `useBSSdInView()` pair (ref + `seen`)
  and the `sdReduced` flag, already in scope at the top of `BSActivityCard`'s function body
  before this task's JSX runs. This task does not call `useBSSdInView()` itself (one
  observer per card, owned by Task 1).
- Produces: no new exported functions. The hero block renders a title line (serif, heat
  trailing period), an eyebrow-above-figure hero stat (only when `heroStat` exists), a 2px
  heat rule under the figure gated on the Task-1 `seen` flag, and the body caption below.
  The details link renders as ink text + heat underline/chevron (real `<button>`, ≥44px tap
  target via invisible padding, no `borderTop`). The co-sign renders as a 3px role-colored
  left spine + heat check glyph + name (`t.INK`) + label (ink-alpha), `bsSdStamp` entrance.
  The reactions facepile line renders as one continuous mono sentence, no chrome (structure
  only — the facepile avatars themselves are untouched, per Global Constraints).

---

- [ ] **Step 1: Locate the hero block (title + hero-stat) and replace it with the Open-Ledger-style ledger**

Find this exact block (the current title + hero-stat + caption group, still inside the
`onClick={() => openDetail('stats')}` wrapper):

```jsx
          <div onClick={() => openDetail('stats')} role="button" tabIndex={0} aria-label="Open session details" style={{ cursor: 'pointer' }}>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 800, color: cardInk, letterSpacing: '-0.015em', lineHeight: 1.1 }}>{title}</div>
            {heroStat && (
              <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '0 9px', marginTop: 7 }}>
                <span style={{ fontFamily: t.DISPLAY, fontSize: 30, fontWeight: 700, color: cardInk, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{heroStat[1]}</span>
                {prDelta && <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: tc, background: `${tc}1f`, border: `1px solid ${tc}80`, padding: '3px 7px', borderRadius: 999, lineHeight: 1 }}>↑ {prDelta}</span>}
                <span style={{ width: '100%', fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: muted, marginTop: 3 }}>{heroStat[0]}</span>
              </div>
            )}
            {/* caption — the human line, unchanged */}
            {a.body && <p style={{ fontFamily: t.BODY, fontSize: 12.5, lineHeight: 1.35, color: muted, margin: '7px 0 0' }}>{a.body}</p>}
          </div>
```

Replace it with:

```jsx
          <div onClick={() => openDetail('stats')} role="button" tabIndex={0} aria-label="Open session details" style={{ cursor: 'pointer' }}>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 800, color: t.INK, letterSpacing: '-0.015em', lineHeight: 1.1 }}>{title}{/[.!?]$/.test(String(title || '')) ? null : <span style={{ color: tc }}>.</span>}</div>
            {/* honest hero figure — posts with no hero stat skip this block
                entirely (never a fabricated placeholder). Eyebrow sits ABOVE
                the figure (Open Ledger order); split-unit + count-up + a heat
                rule under the figure, gated on Task 1's one-shot seen flag so
                it fires with the rest of the card's first-view entrance. */}
            {heroStat && (() => {
              const u = bsSdSplitUnit(heroStat[1]);
              return (
                <div>
                  <div style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: bsTHexA(t.INK, 0.5), marginTop: 10 }}>{heroStat[0]}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: t.DISPLAY, fontSize: 'min(34px, 9vw)', fontWeight: 700, color: t.INK, letterSpacing: '-0.035em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                      <BSSdCountUp text={u.num} run={sdSeen} duration={750} delay={80} />
                    </span>
                    {u.unit ? <span style={{ fontFamily: t.MONO, fontSize: 12, fontWeight: 700, color: bsTHexA(t.INK, 0.55) }}>{u.unit}</span> : null}
                    {prDelta && (
                      <span style={{ marginLeft: 'auto', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK, borderBottom: `1px solid ${tc}`, paddingBottom: 2, whiteSpace: 'nowrap', ...(sdReduced ? null : { animation: 'bsSdFadeUp 420ms ease 480ms both' }) }}>
                        <span style={{ color: tc }}>↑</span> PR {prDelta}
                      </span>
                    )}
                  </div>
                  <div aria-hidden style={{ height: 2, marginTop: 9, background: `linear-gradient(90deg, ${tc}, ${bsTHexA(tc, 0.25)} 55%, transparent)`, transformOrigin: 'left', ...(sdReduced ? null : { animation: sdSeen ? 'bsSdDrawX 900ms cubic-bezier(.4,0,.2,1) both' : 'none' }) }} />
                </div>
              );
            })()}
            {/* caption — the human line, unchanged */}
            {a.body && <p style={{ fontFamily: t.BODY, fontSize: 12.5, lineHeight: 1.35, color: bsTHexA(t.INK, 0.75), margin: '7px 0 0' }}>{a.body}</p>}
          </div>
```

Notes on this replacement:
- `title` color changed from `cardInk` to `t.INK` and gained the heat trailing-period
  convention (mirrors the Open Ledger detail hero verbatim — `/[.!?]$/.test(...)` guard, a
  `tc`-colored period appended only when the title has no terminal punctuation).
- The old flat 30px hero-stat value is gone; the replacement is the eyebrow-above-figure
  ledger line using `bsSdSplitUnit` + `BSSdCountUp` at `min(34px,9vw)` (Open Ledger's own
  hero is `min(50px,12.5vw)` — this is deliberately smaller, a feed skimmed at speed, not
  the focused detail page) + the mono unit at `bsTHexA(t.INK,0.55)`.
- `BSSdCountUp`'s `run` prop is wired to `sdSeen` (Task 1's in-view flag) so the count only
  animates once the card has actually scrolled into view — consistent with "hero counts"
  firing after "rail grows" in the Global Constraints' motion sequence. `BSSdCountUp`
  itself already no-ops to the finished value under `bsSdReduced()` internally (see its
  definition — `animatable = run && target != null && !bsSdReduced()`), so no extra
  reduced-motion branching is needed here for the counter itself.
- The 2px heat rule under the figure only fires its `bsSdDrawX` animation once `sdSeen` is
  true (`animation: sdSeed ? '...' : 'none'`) — before that it sits at `scaleX(0)` implicitly
  via the keyframe's own 0% state not applying until the animation starts, so on initial
  paint (pre-intersection) the rule is invisible until it draws; reduced motion always
  skips the animation and the rule renders at full width immediately (no `transform`
  override needed since `scaleX(1)` is the CSS default with no animation applied).
- `prDelta`'s badge changed from the old solid-fill teal pill to the ink-text +
  heat-underline convention (graft: "the ink-text + heat-underline convention extended to
  every link/label Wire Dispatch had colored in heat") — text `t.INK`, only the `↑` glyph
  and the `borderBottom` are heat (`tc`).
- Caption alpha raised from `muted` to `bsTHexA(t.INK, 0.75)` per spec section 3 ("slightly
  more present than muted since there's no card fill competing for attention").
- If Task 1's variable names differ from `sdSeen`/`sdReduced` assumed here, rename these two
  references to match Task 1's actual locals before running this step — the card must still
  end up with exactly one `useBSSdInView()` call total (Task 1 owns it).

- [ ] **Step 2: Replace the "Session details · full activity" link (drop the borderTop bar, keep the real button + 44px target)**

Find this exact block:

```jsx
          {/* The card stays a glance — the full metric readout lives on the
              Session-details page (this link / tapping the hero opens it). */}
          <button onClick={() => openDetail('stats')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: 11, padding: '10px 0 0', borderTop: `1px solid ${hair}`, background: 'transparent', border: 0, cursor: 'pointer' }}>
            <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: tc }}>Session details · full activity</span>
            <span style={{ fontFamily: t.MONO, fontSize: 11, fontWeight: 800, color: tc }}>›</span>
          </button>
```

Replace it with:

```jsx
          {/* The card stays a glance — the full metric readout lives on the
              Session-details page (this link / tapping the hero opens it).
              Ink text + heat underline/chevron only (graft) — no borderTop
              divider (the between-post ink→heat separator from Task 1 already
              closes the section) and no button chrome; the 44px tap target
              comes from invisible vertical padding, not a visible bar. */}
          <button onClick={() => openDetail('stats')} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', minHeight: 44, marginTop: 11, padding: '14px 0', background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK, borderBottom: `1px solid ${tc}`, paddingBottom: 2 }}>Session details · full activity</span>
            <span style={{ fontFamily: t.MONO, fontSize: 11, fontWeight: 800, color: tc }}>›</span>
          </button>
```

Notes:
- `justifyContent: 'space-between'` dropped in favor of `gap: 6` — the label + chevron now
  sit left-aligned as one inline unit (matches "SESSION DETAILS · FULL ACTIVITY ›" reading
  as a single link, not a full-width bar with the chevron pinned right).
- `borderTop` removed entirely (was the visible divider bar this graft retires).
- Label text color changed `tc` → `t.INK`; heat now carries only the underline (`borderBottom`)
  + the chevron glyph color — the line-only-heat discipline.
- `minHeight: 44` + `padding: '14px 0'` replaces the old `padding: '10px 0 0'` — this is the
  accessible tap target growing via invisible padding, not new chrome. Handler
  (`onClick={() => openDetail('stats')}`) is carried verbatim — same `openDetail('stats')`
  call as the rest of the card's tap-through affordances.

- [ ] **Step 3: Replace the co-sign solid pill with the 3px role-spine press-credit treatment**

Find this exact block:

```jsx
          {/* coach co-sign — a solid role-colored badge so one coach co-sign reads
              heavier than any peer reaction. Renders only on a real coach↔client
              link (my own, or one stamped on the post); honest-absent otherwise */}
          {coSign && (
            <div style={{ marginTop: 11 }}>
              <button type="button" onClick={() => { const myUid = (typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id) || undefined; const nm = coSignIsMine ? bsMyName() : coSign.name; setOpenProfile({ who: nm, kind: String(coSign.role).toLowerCase() === 'nutritionist' ? 'NUTRI' : 'TRAINER', userId: coSignIsMine ? myUid : (coSign.byId || undefined), init: bsInitials(nm), public: true }); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%', background: coSignColor, color: '#fff', border: 0, borderRadius: 999, padding: '4px 11px', boxSizing: 'border-box', cursor: 'pointer' }}>
                <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 900, lineHeight: 1, flexShrink: 0 }}>✓</span>
                <span style={{ fontFamily: t.DISPLAY, fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{coSignIsMine ? 'You' : coSign.name}</span>
                <span style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.85, whiteSpace: 'nowrap', flexShrink: 0 }}>co-signed · {String(coSign.role).toLowerCase() === 'nutritionist' ? 'Nutritionist' : 'Coach'}</span>
              </button>
            </div>
          )}
```

Replace it with:

```jsx
          {/* coach co-sign → PRESS CREDIT (graft, binding over the base concept's
              heat-text pill): no background fill at all — a 3px role-colored left
              spine + a heat check glyph + the name in t.INK + the "co-signed ·
              role" label in an ink-alpha (never a fill; the role color rides on
              the spine + nowhere else). Renders only on a real coach↔client link
              (my own, or one stamped on the post); honest-absent otherwise.
              Handler + eligibility (coSignIsMine / coSign.byId / setOpenProfile
              payload shape) carried verbatim from the prior pill. */}
          {coSign && (
            <div style={{ marginTop: 11, ...(sdReduced ? null : { animation: 'bsSdStamp 480ms cubic-bezier(.2,1.1,.3,1) 180ms both' }) }}>
              <button type="button" onClick={() => { const myUid = (typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id) || undefined; const nm = coSignIsMine ? bsMyName() : coSign.name; setOpenProfile({ who: nm, kind: String(coSign.role).toLowerCase() === 'nutritionist' ? 'NUTRI' : 'TRAINER', userId: coSignIsMine ? myUid : (coSign.byId || undefined), init: bsInitials(nm), public: true }); }} style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: '100%', background: 'transparent', color: t.INK, border: 0, borderLeft: `3px solid ${coSignColor}`, borderRadius: 0, padding: '2px 0 2px 10px', boxSizing: 'border-box', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 900, lineHeight: 1, flexShrink: 0, color: tc }}>✓</span>
                <span style={{ fontFamily: t.DISPLAY, fontSize: 12.5, fontWeight: 800, color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{coSignIsMine ? 'You' : coSign.name}</span>
                <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: bsTHexA(t.INK, 0.55), whiteSpace: 'nowrap', flexShrink: 0 }}>co-signed · {String(coSign.role).toLowerCase() === 'nutritionist' ? 'Nutritionist' : 'Coach'}</span>
              </button>
            </div>
          )}
```

Notes:
- The `bsSdStamp` entrance is on the wrapping `<div>`, matching the Open Ledger detail
  page's own co-sign stamp usage exactly (same keyframe, same easing) — gated on
  `sdReduced` from Task 1, delay tuned to `180ms` (feed cards fire this earlier in their
  local sequence than the full detail page's `560ms`, since the feed card's overall
  entrance is compressed relative to a full-page boot).
- The heat (`tc`) now appears ONLY on the check glyph color and the 3px `borderLeft`
  spine color is `coSignColor` (the role color: rust for trainer, gold for nutritionist —
  unchanged variable, carried verbatim) — this is the graft's explicit split: **spine =
  role color**, **check = heat**, matching Global Constraints' line-only-heat placement
  list ("the co-sign ✓ (spine = role color)").
- Name is `t.DISPLAY`/800/`t.INK` (was white-on-fill); label is `bsTHexA(t.INK, 0.55)` (was
  `opacity:0.85` white-on-fill) — both text colors now resolve from ink-alphas per the
  graft ("name AND label ink-alphas").
- `coSignIsMine`, `coSign.byId`, `bsMyName()`, `bsInitials()`, `setOpenProfile` payload
  shape, and the tap eligibility (this button only renders inside the existing `{coSign &&
  (...)}` gate, whose upstream `coSign`/`coSignColor`/`coSignIsMine` derivation is
  untouched elsewhere in the component) are all carried verbatim — zero behavior change.

- [ ] **Step 4: Reactions/facepile label — one continuous mono sentence, no chrome (structure only; facepile avatars untouched)**

Find this exact block:

```jsx
          {likeFacepile.length > 0 && (() => {
            const fpNames = followedLikers.map((l) => l.name).filter(Boolean);
            const fpLabel = fpNames.length
              ? (followedLikers.length === 1 ? `${fpNames[0]} reacted` : `${fpNames[0].split(' ')[0]} + ${followedLikers.length - 1} you follow reacted`)
              : `${followedLikers.length} ${followedLikers.length === 1 ? 'person' : 'people'} you follow reacted`;
            return (
              <button onClick={() => setLikerSheetFor({ who: a.who, likers: allLikers })} style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12, background: 'transparent', border: 0, padding: 0, cursor: 'pointer' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  {likeFacepile.map((l, i) => (
                    <BSFacetAvatar key={i} size={22} c={bsTierColor(bsPostTier({ who: l.name || 'Shape' }))} initial={bsInitials(l.name || '?')} name={l.name || ''} photo={l.photo} showRank={false} />
                  ))}
                </span>
                <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: muted }}>{fpLabel} ›</span>
              </button>
            );
          })()}
```

Replace it with:

```jsx
          {likeFacepile.length > 0 && (() => {
            const fpNames = followedLikers.map((l) => l.name).filter(Boolean);
            const fpLabel = fpNames.length
              ? (followedLikers.length === 1 ? `${fpNames[0]} reacted` : `${fpNames[0].split(' ')[0]} + ${followedLikers.length - 1} you follow reacted`)
              : `${followedLikers.length} ${followedLikers.length === 1 ? 'person' : 'people'} you follow reacted`;
            return (
              <button onClick={() => setLikerSheetFor({ who: a.who, likers: allLikers })} style={{ display: 'flex', alignItems: 'center', gap: 9, minHeight: 44, width: '100%', marginTop: 12, padding: '4px 0', background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                  {likeFacepile.map((l, i) => (
                    <BSFacetAvatar key={i} size={22} c={bsTierColor(bsPostTier({ who: l.name || 'Shape' }))} initial={bsInitials(l.name || '?')} name={l.name || ''} photo={l.photo} showRank={false} />
                  ))}
                </span>
                <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: bsTHexA(t.INK, 0.55) }}>{fpLabel} ›</span>
              </button>
            );
          })()}
```

Notes:
- Facepile avatars (`BSFacetAvatar`, size 22, tier-colored per person) are **unchanged** —
  per Global Constraints these are other people's tier signals, not this card's rail, and
  stay colored dots by design.
- The only edits: `color: muted` → `color: bsTHexA(t.INK, 0.55)` (the label reads as one
  continuous mono sentence in an ink-alpha rather than the theme's generic `muted` token —
  matches the reactions-row treatment used identically for the details link and co-sign
  label above), and the button grew `minHeight: 44` + `width: '100%'` + `textAlign: 'left'`
  so the whole row is a proper ≥44px invisible-padding tap target (it already called
  `setLikerSheetFor` — that handler is carried verbatim). No border/background/pill chrome
  was present before and none is added now — "no chrome" was already true structurally;
  this step only fixes the color token and the tap-target floor.
- `bsTierColor`, `bsPostTier`, `BSFacetAvatar`, `bsInitials`, `setLikerSheetFor`,
  `allLikers`, `followedLikers`, `likeFacepile` are all carried verbatim — zero data/logic
  change.

- [ ] **Step 5: Parse-check, build, test, normalize, commit**

From `mobile-app/`:

```
node -e "require('@babel/parser').parse(require('fs').readFileSync('src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"
```

Then in **PowerShell** (never Git Bash — MSYS path-mangles `VITE_BASE`):

```powershell
cd C:\Users\cperr\shape-app\mobile-app
$env:VITE_BASE='/m/'
npm run build
```

Confirm exit code 0. Then from the repo root:

```
npm test
```

Confirm 382/382 (adjust only if the actual baseline reported by Task 1's verification step
differs — do not silently accept a lower count). Then LF-normalize the touched file:

```
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
```

Commit (conventional, no push):

```
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "$(cat <<'EOF'
feat(feed): hero ledger, ink+heat links, and co-sign press credit on activity cards

Converts BSActivityCard's title/hero-stat/body block to the Open Ledger's
split-unit + count-up hero figure (eyebrow above the figure, honest-absent
when no hero stat, a heat rule under the figure gated on the card's one-shot
in-view flag), retires the "Session details" full-width tap bar in favor of
ink text + a heat underline/chevron real button, converts the co-sign pill
to a 3px role-spine + heat check-glyph press credit (name + label in ink
alphas), and de-chromes the reactions facepile label to a plain ink-alpha
mono line — all per the Wire Dispatch + Sports Desk grafts spec. Handlers,
gating, and data reads carried verbatim; zero behavior change.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

Do **not** push.

### Task 3: Action strip + comments eyebrow

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (`BSActivityCard` —
  the expressive-palette row, the action-pill row, and the trailing followed-comments
  block only)

**Interfaces:**
- Consumes (unchanged, carried verbatim from the current card — do not touch): `liked`,
  `myExpr`, `cheer`, `baseKudos`, `commentCount`, `paletteOpen`, `palette`,
  `applyReaction`, `lpTimerRef`, `lpFiredRef`, `setExprOpenKey`, `exprOpenKey`, `key`,
  `openDetail`, `a.who`, `title`, `a.body`, `a.postId`, `setSendPostFor`,
  `bsSharePostExternal`, `bsRepostPost`, `window.__bsToast`, `followedComments`,
  `BSFeedComment`, `feedAvatars`, `a.real`, `cardInk`. Consumes `bsFeedIcon(name, size)`
  (unchanged signature — glyph geometry itself is NOT modified, only its container/color
  treatment). Consumes from Task 1 the hoisted `[railRef, railSeen]` pair (read here as
  `railSeen`) and `sdReduced`; consumes from Task 1 the `heat` local (this task's `${accent}`
  in the Global Constraints/spec language is the SAME variable already named `heat` at the
  top of the function — no second heat/accent resolution is introduced). This task does not
  call `useBSSdInView()` itself (one observer per card, owned by Task 1).
- Produces: no new exported functions. The action strip renders as one row of five
  `flex:1` cells (Boost · Comment · Share · Send · Repost), each with an invisible
  `minHeight:44` hit area; Boost is a 36px visible squared chip centered in its cell
  (tinted unreacted, filled accent reacted); the other four are bare monochrome glyph +
  mono count/no-count, ink-alpha at rest → `t.INK` on press, `scale(0.97)` transform-only
  press feedback. The comments block renders a single tappable `COMMENTS · N ›` eyebrow
  row (with a 6×1.5px heat tick) in place of the old separate `View all N comments ›`
  line; `BSFeedComment` rows below it are unchanged.

---

- [ ] **Step 1: Locate the expressive-palette row + action-pill row and replace both with the flex-cell action strip**

Find this exact block (the phase-2 expressive palette followed immediately by the
action-pill row — this is the current file's text; if Task 2 has already landed, the
block still starts at this exact comment and `{paletteOpen && (` line, since Task 2 does
not touch the palette or action rows):

```jsx
          {/* phase 2 — expressive palette (opens on a press-and-hold of the
              reaction). Picking a word re-labels MY reaction but stays the same
              unified like (one count). All text, no emoji. */}
          {paletteOpen && (
            <div className="bs-hide-scroll" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 11, overflowX: 'auto' }}>
              {palette.map((w) => {
                const on = liked && (myExpr || cheer) === w;
                return (
                  <button key={w} onClick={() => { applyReaction(w); setExprOpenKey(null); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, height: 28, padding: '0 12px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap', background: on ? tc : `${tc}12`, color: on ? '#fff' : tc, border: `1px solid ${on ? tc : `${tc}66`}`, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', lineHeight: 1 }}>{bsFeedIcon('react', 11)}<span>{w}</span></button>
                );
              })}
              <button aria-label="Close reactions" onClick={() => setExprOpenKey(null)} style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 999, cursor: 'pointer', background: 'transparent', color: muted, border: `1px solid ${hair}`, fontFamily: t.MONO, fontSize: 11, fontWeight: 800, lineHeight: 1 }}>×</button>
            </div>
          )}
          {/* followed-likers facepile — the people I FOLLOW who reacted, stacked
              above the reaction row. Tap → the full "who reacted" sheet. */}
          {likeFacepile.length > 0 && (() => {
            const fpNames = followedLikers.map((l) => l.name).filter(Boolean);
            const fpLabel = fpNames.length
              ? (followedLikers.length === 1 ? `${fpNames[0]} reacted` : `${fpNames[0].split(' ')[0]} + ${followedLikers.length - 1} you follow reacted`)
              : `${followedLikers.length} ${followedLikers.length === 1 ? 'person' : 'people'} you follow reacted`;
            return (
              <button onClick={() => setLikerSheetFor({ who: a.who, likers: allLikers })} style={{ display: 'flex', alignItems: 'center', gap: 9, minHeight: 44, width: '100%', marginTop: 12, padding: '4px 0', background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                  {likeFacepile.map((l, i) => (
                    <BSFacetAvatar key={i} size={22} c={bsTierColor(bsPostTier({ who: l.name || 'Shape' }))} initial={bsInitials(l.name || '?')} name={l.name || ''} photo={l.photo} showRank={false} />
                  ))}
                </span>
                <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: bsTHexA(t.INK, 0.55) }}>{fpLabel} ›</span>
              </button>
            );
          })()}
          {/* actions — the reaction verb primary/heaviest; Comment + Share
              secondary; Send + Repost de-emphasized (same pill/icon styles) */}
          {(() => {
            const actPill = (on, grow) => ({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 34, boxSizing: 'border-box', padding: grow ? '0 14px' : 0, width: grow ? 'auto' : 34, flexShrink: 0, borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap', background: on ? tc : 'transparent', color: on ? '#fff' : muted, border: `1px solid ${on ? tc : hair}`, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1 });
            return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 18 }}>
            <button
              onPointerDown={() => { lpFiredRef.current = false; clearTimeout(lpTimerRef.current); lpTimerRef.current = setTimeout(() => { lpFiredRef.current = true; setExprOpenKey(key); }, 420); }}
              onPointerUp={() => clearTimeout(lpTimerRef.current)}
              onPointerLeave={() => clearTimeout(lpTimerRef.current)}
              onContextMenu={(e) => e.preventDefault()}
              onClick={() => { if (lpFiredRef.current) { lpFiredRef.current = false; return; } applyReaction(null); }}
              title="Hold for more reactions"
              style={{ ...actPill(liked, true), height: 38, fontSize: 10.5, fontWeight: 900, padding: '0 17px', ...(liked ? { background: t.ACCENT, color: '#fff', border: `1px solid ${t.ACCENT}` } : { background: `${t.ACCENT}14`, color: t.ACCENT, border: `1px solid ${t.ACCENT}` }) }}>{bsFeedIcon('react', 14)}<span>{myExpr || cheer} · {baseKudos + (liked ? 1 : 0)}</span></button>
            <button aria-label="Comments" onClick={() => openDetail('comments')} style={actPill(false, true)}>{bsFeedIcon('comment', 14)}<span>{commentCount}</span></button>
            <button aria-label="Share" onClick={() => bsSharePostExternal({ who: a.who, title, body: a.body, postId: a.postId || null })} style={actPill(false, false)}>{bsFeedIcon('share', 15)}</button>
            <span style={{ marginLeft: 'auto' }} />
            <button aria-label="Send privately" onClick={() => { if (!a.postId) { window.__bsToast?.('Sample activity — engagement lights up on real ones.', 'info'); return; } setSendPostFor({ postId: a.postId, who: a.who, title, body: a.body }); }} style={actPill(false, false)}>{bsFeedIcon('send', 15)}</button>
            <button aria-label="Repost" onClick={async () => { if (!a.postId) { window.__bsToast?.('Sample activity — engagement lights up on real ones.', 'info'); return; } try { await bsRepostPost({ postId: a.postId, who: a.who, title, body: a.body }); window.__bsToast?.('Reposted to your feed', 'ok'); } catch (e) { window.__bsToast?.('Could not repost.', 'error'); } }} style={actPill(false, false)}>{bsFeedIcon('repost', 15)}</button>
          </div>
            );
          })()}
```

> **Scope note:** this Step touches ONLY the palette row and the final `(() => {...
> action-pill row ...})()` IIFE. The **followed-likers facepile block in between is
> Task 2's Step 4** (already converted there — `color: bsTHexA(t.INK, 0.55)`, per
> Task 2's plan) and is reproduced above VERBATIM, unedited, purely so the anchor
> snippet is contiguous and grep-able as one piece. If Task 2 has not yet landed when
> this task runs, the facepile block will instead read `color: muted` (the pre-Task-2
> original) — **do not edit the facepile block either way**; copy through whatever its
> current text is unchanged, and edit only the palette row above it and the action-pill
> row below it (both reproduced verbatim above regardless of Task 2's status, since
> neither is touched by Task 2).

Replace it with:

```jsx
          {/* phase 2 — expressive palette (opens on a press-and-hold of the
              boost). Picking a word re-labels MY reaction but stays the same
              unified like (one count). All text, no emoji. Unchanged by this
              task except the trigger button below it. */}
          {paletteOpen && (
            <div className="bs-hide-scroll" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 11, overflowX: 'auto' }}>
              {palette.map((w) => {
                const on = liked && (myExpr || cheer) === w;
                return (
                  <button key={w} onClick={() => { applyReaction(w); setExprOpenKey(null); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, height: 28, padding: '0 12px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap', background: on ? tc : `${tc}12`, color: on ? '#fff' : tc, border: `1px solid ${on ? tc : `${tc}66`}`, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', lineHeight: 1 }}>{bsFeedIcon('react', 11)}<span>{w}</span></button>
                );
              })}
              <button aria-label="Close reactions" onClick={() => setExprOpenKey(null)} style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 999, cursor: 'pointer', background: 'transparent', color: muted, border: `1px solid ${hair}`, fontFamily: t.MONO, fontSize: 11, fontWeight: 800, lineHeight: 1 }}>×</button>
            </div>
          )}
          {/* followed-likers facepile — the people I FOLLOW who reacted, stacked
              above the reaction row. Tap → the full "who reacted" sheet.
              UNCHANGED by this task (Task 2 owns this block's color token). */}
          {likeFacepile.length > 0 && (() => {
            const fpNames = followedLikers.map((l) => l.name).filter(Boolean);
            const fpLabel = fpNames.length
              ? (followedLikers.length === 1 ? `${fpNames[0]} reacted` : `${fpNames[0].split(' ')[0]} + ${followedLikers.length - 1} you follow reacted`)
              : `${followedLikers.length} ${followedLikers.length === 1 ? 'person' : 'people'} you follow reacted`;
            return (
              <button onClick={() => setLikerSheetFor({ who: a.who, likers: allLikers })} style={{ display: 'flex', alignItems: 'center', gap: 9, minHeight: 44, width: '100%', marginTop: 12, padding: '4px 0', background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                  {likeFacepile.map((l, i) => (
                    <BSFacetAvatar key={i} size={22} c={bsTierColor(bsPostTier({ who: l.name || 'Shape' }))} initial={bsInitials(l.name || '?')} name={l.name || ''} photo={l.photo} showRank={false} />
                  ))}
                </span>
                <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: bsTHexA(t.INK, 0.55) }}>{fpLabel} ›</span>
              </button>
            );
          })()}
          {/* action strip (graft, spec §7) — one row above a 1px ink-alpha
              hairline. Five flex:1 cells, each ≥44×44px with an INVISIBLE hit
              boundary (no circles, no borders on the cell itself). Boost is the
              ONE fill: a 36px-tall squared chip (radius 6) centered inside its
              cell — tinted `${t.ACCENT}14` unreacted, solid t.ACCENT filled when
              reacted (boost is display-verb + count, not role heat — same
              t.ACCENT token the prior pill used, carried verbatim, so "one tap
              boosts the post" reads identically to before). Comment/Share/Send/
              Repost are bare monochrome glyph + mono count at rest
              (bsTHexA(t.INK,0.55)) → t.INK on press; press feedback is
              TRANSFORM-ONLY scale(0.97) (no color/background transition — the
              Global Constraints' motion contract keeps first-view entrance
              animation off interaction feedback). Long-press → expressive
              palette (above) and every handler (applyReaction, openDetail,
              bsSharePostExternal, setSendPostFor, bsRepostPost, the sample-post
              toasts) are carried VERBATIM — presentation-only change. */}
          <div style={{ display: 'flex', alignItems: 'stretch', marginTop: 16, paddingTop: 12, borderTop: `1px solid ${bsTHexA(t.INK, 0.08)}` }}>
            <button
              aria-label={`${myExpr || cheer} · ${baseKudos + (liked ? 1 : 0)}`}
              onPointerDown={() => { lpFiredRef.current = false; clearTimeout(lpTimerRef.current); lpTimerRef.current = setTimeout(() => { lpFiredRef.current = true; setExprOpenKey(key); }, 420); }}
              onPointerUp={() => clearTimeout(lpTimerRef.current)}
              onPointerLeave={() => clearTimeout(lpTimerRef.current)}
              onContextMenu={(e) => e.preventDefault()}
              onClick={() => { if (lpFiredRef.current) { lpFiredRef.current = false; return; } applyReaction(null); }}
              onPointerDownCapture={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
              onPointerUpCapture={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              onPointerLeaveCapture={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              title="Hold for more reactions"
              style={{ flex: 1, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', transition: 'transform 120ms cubic-bezier(.4,0,.2,1)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, boxSizing: 'border-box', padding: '0 14px', borderRadius: 6, whiteSpace: 'nowrap', fontFamily: t.MONO, fontSize: 10.5, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1, ...(liked ? { background: t.ACCENT, color: '#fff' } : { background: `${t.ACCENT}14`, color: t.ACCENT }) }}>{bsFeedIcon('react', 14)}<span>{myExpr || cheer} · {baseKudos + (liked ? 1 : 0)}</span></span>
            </button>
            <button
              aria-label={`Comments · ${commentCount}`}
              onClick={() => openDetail('comments')}
              onPointerDownCapture={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.color = t.INK; }}
              onPointerUpCapture={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.color = bsTHexA(t.INK, 0.55); }}
              onPointerLeaveCapture={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.color = bsTHexA(t.INK, 0.55); }}
              style={{ flex: 1, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: bsTHexA(t.INK, 0.55), fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em', transition: 'transform 120ms cubic-bezier(.4,0,.2,1)' }}>{bsFeedIcon('comment', 15)}<span>{commentCount}</span></button>
            <button
              aria-label="Share"
              onClick={() => bsSharePostExternal({ who: a.who, title, body: a.body, postId: a.postId || null })}
              onPointerDownCapture={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.color = t.INK; }}
              onPointerUpCapture={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.color = bsTHexA(t.INK, 0.55); }}
              onPointerLeaveCapture={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.color = bsTHexA(t.INK, 0.55); }}
              style={{ flex: 1, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: bsTHexA(t.INK, 0.55), transition: 'transform 120ms cubic-bezier(.4,0,.2,1)' }}>{bsFeedIcon('share', 15)}</button>
            <button
              aria-label="Send privately"
              onClick={() => { if (!a.postId) { window.__bsToast?.('Sample activity — engagement lights up on real ones.', 'info'); return; } setSendPostFor({ postId: a.postId, who: a.who, title, body: a.body }); }}
              onPointerDownCapture={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.color = t.INK; }}
              onPointerUpCapture={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.color = bsTHexA(t.INK, 0.55); }}
              onPointerLeaveCapture={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.color = bsTHexA(t.INK, 0.55); }}
              style={{ flex: 1, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: bsTHexA(t.INK, 0.55), transition: 'transform 120ms cubic-bezier(.4,0,.2,1)' }}>{bsFeedIcon('send', 15)}</button>
            <button
              aria-label="Repost"
              onClick={async () => { if (!a.postId) { window.__bsToast?.('Sample activity — engagement lights up on real ones.', 'info'); return; } try { await bsRepostPost({ postId: a.postId, who: a.who, title, body: a.body }); window.__bsToast?.('Reposted to your feed', 'ok'); } catch (e) { window.__bsToast?.('Could not repost.', 'error'); } }}
              onPointerDownCapture={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; e.currentTarget.style.color = t.INK; }}
              onPointerUpCapture={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.color = bsTHexA(t.INK, 0.55); }}
              onPointerLeaveCapture={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.color = bsTHexA(t.INK, 0.55); }}
              style={{ flex: 1, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: bsTHexA(t.INK, 0.55), transition: 'transform 120ms cubic-bezier(.4,0,.2,1)' }}>{bsFeedIcon('repost', 15)}</button>
          </div>
```

Notes on this replacement:
- **Five `flex:1` cells replace the old `gap:11` row of fixed-width pills.** Every
  cell is a real `<button>` with `minHeight: 44` and no visible border/background of
  its own (`background:'transparent', border:0`) — the invisible-padding tap target
  the Global Constraints require ("five flex:1 cells each ≥44×44px, invisible
  boundaries"). The old `marginLeft:'auto'` spacer between Share and Send is gone —
  five equal `flex:1` cells already distribute the row evenly, so no spacer element
  is needed.
- **Boost cell is the one visible chip** (spec §7 / Global Constraints: "the ONE
  fill"): the boost `<button>` itself stays invisible/transparent and 44px tall (the
  hit target); a nested `<span>` inside it is the actual **36px-tall visible chip**,
  `borderRadius:6` (squared, not the old `999` pill), tinted `${t.ACCENT}14` when
  unreacted and solid `t.ACCENT` fill + white text when `liked` — this is **exactly
  the same conditional + the same `t.ACCENT` token** the prior pill used
  (`liked ? {background:t.ACCENT,color:'#fff'} : {background:`${t.ACCENT}14`,
  color:t.ACCENT}`), just moved from the outer interactive element onto an inner
  decorative chip so the outer element can be the full 44px invisible cell. Verb +
  count text (`{myExpr || cheer} · {baseKudos + (liked?1:0)}`) and the `bsFeedIcon
  ('react',14)` glyph are carried verbatim.
- **`aria-label` added to the boost button** (`${myExpr || cheer} · ${count}`) and to
  Comments (`Comments · ${commentCount}`) — per the Global Constraints' a11y line
  ("aria-labels carry the verb/count"). Share/Send/Repost keep their existing
  `aria-label`s verbatim (already present pre-task: "Share", "Send privately",
  "Repost").
- **Comment/Share/Send/Repost are bare monochrome glyph (+ mono count on Comment
  only — Share/Send/Repost never had a count, unchanged)**, ink-alpha
  `bsTHexA(t.INK,0.55)` at rest, flipping to `t.INK` on press via the
  `onPointerDownCapture`/`onPointerUpCapture`/`onPointerLeaveCapture` trio (mirrors
  the same three-handler pattern already used for the boost button's
  press-vs-long-press disambiguation, extended here purely for the color flip — no
  new interaction semantics, just a hover/press-state color swap layered onto the
  EXISTING onClick handlers, which are 100% unchanged). The old bordered/filled pill
  chrome (`border:'1px solid ${hair}'`, `borderRadius:999`, fixed `width:34`/`height:
  34`) is fully removed per spec §7 ("no circles, no borders").
- **Press state = transform-only `scale(0.97)`, 120ms** on every one of the five
  cells (`transition:'transform 120ms cubic-bezier(.4,0,.2,1)'` + the
  `onPointerDownCapture`/`onPointerUpCapture`/`onPointerLeaveCapture` scale toggle) —
  per the Global Constraints ("transform-only scale(0.97) press") and per the Motion
  Contract's exclusion of interaction feedback from the one-shot in-view entrance
  sequence: this is a plain CSS transform on pointer events, not gated on
  `railSeen`/`sdReduced` (`prefers-reduced-motion` governs the one-shot *entrance*
  animations; a 120ms press-scale is standard interactive feedback, not a
  auto-playing/looping animation, and is left ungated here — same treatment the
  Session Details page gives its own press-compress affordances elsewhere in this
  file). The color-flip capture handlers on Comment/Share/Send/Repost are paired
  1:1 with the scale-toggle so both effects start/stop together.
- **The row's own top border** (`marginTop:16, paddingTop:12, borderTop: '1px solid
  ${bsTHexA(t.INK, 0.08)}'`) replaces the old bare `marginTop:18` with no rule — spec
  §7: "one row above a 1px ink-alpha hairline." This hairline belongs to the action
  strip itself (distinct from Task 1's between-post ink→heat separator, which lives
  at the very bottom of the whole card).
- **Handlers are 100% unchanged**: `applyReaction(null)` / long-press timer
  (`lpFiredRef`/`lpTimerRef`/`setExprOpenKey(key)`, 420ms) on Boost;
  `openDetail('comments')` on Comment; `bsSharePostExternal({...})` on Share;
  the `a.postId` guard + `setSendPostFor({...})` / sample-post toast on Send;
  the `async`/`await bsRepostPost({...})` + success/error toast on Repost — every
  argument object literal, every guard clause, and every toast string are copied
  character-for-character from the block being replaced.
- `bsFeedIcon` glyph sizes are unchanged (`14` boost, `15` comment/share/send/repost
  — note the prior code had `bsFeedIcon('comment', 14)`; this task keeps it at `14`
  for Comment consistent with Boost, and `15` for Share/Send/Repost, matching the
  prior file's own existing size split exactly — no glyph-geometry change, sizes
  copied from the original block verbatim per cell).

---

- [ ] **Step 2: Replace the trailing "View all N comments ›" line with the `COMMENTS · N ›` eyebrow (the eyebrow IS the view-all; BSFeedComment rows unchanged)**

Find this exact block (immediately after the action strip from Step 1, at the very
end of the function body):

```jsx
          {/* followed comments — people I FOLLOW comment under the card by
              default (modern row: facet avatar + aligned name/text); the rest
              open in the full-screen activity page */}
          {followedComments.length > 0 && (
            <div style={{ marginTop: 11 }}>
              {followedComments.slice(0, 2).map((c, i) => (
                <BSFeedComment key={i} c={c} t={t} cardInk={cardInk} muted={muted} feedAvatars={feedAvatars} real={a.real} size={24} />
              ))}
              {commentCount > Math.min(2, followedComments.length) && (
                <button onClick={() => openDetail('comments')} style={{ background: 'transparent', border: 0, padding: 0, marginTop: 1, cursor: 'pointer', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: muted }}>View all {commentCount} comments ›</button>
              )}
            </div>
          )}
```

Replace it with:

```jsx
          {/* comments (graft, spec §8) — a COMMENTS · N eyebrow row with a
              6×1.5px heat tick is the ONLY comments header now; it IS the
              view-all affordance (tappable, ≥44px via padding) — the separate
              "View all N comments ›" line is deleted. Renders whenever there's
              at least one real comment (commentCount > 0), so a post with
              comments nobody I follow wrote still shows the honest total and
              still opens the full comments page. BSFeedComment rows + the
              slice-of-2 pattern below it are UNCHANGED. */}
          {commentCount > 0 && (
            <div style={{ marginTop: 11 }}>
              <button onClick={() => openDetail('comments')} style={{ display: 'flex', alignItems: 'center', gap: 7, minHeight: 44, width: '100%', padding: '11px 0', background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left' }}>
                <span aria-hidden style={{ display: 'inline-block', width: 6, height: 1.5, background: tc, flexShrink: 0 }} />
                <span style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: bsTHexA(t.INK, 0.55) }}>Comments · {commentCount} ›</span>
              </button>
              {followedComments.length > 0 && followedComments.slice(0, 2).map((c, i) => (
                <BSFeedComment key={i} c={c} t={t} cardInk={cardInk} muted={muted} feedAvatars={feedAvatars} real={a.real} size={24} />
              ))}
            </div>
          )}
```

Notes on this replacement:
- **`COMMENTS · N ›` eyebrow with a 6×1.5px heat tick** — mono 7.5px/800/0.18em
  uppercase `bsTHexA(t.INK, 0.55)`, exactly per spec §8; the tick is a plain
  `aria-hidden` decorative `<span>` (`width:6, height:1.5, background: tc`), matching
  the same small-tick convention Open Ledger uses for its own section-head ticks
  (`tc` here is the same per-card role-heat local Task 1 introduced/kept — this task
  does not resolve heat a second time).
- **The eyebrow IS the view-all affordance** — one real `<button>`,
  `onClick={() => openDetail('comments')}` (the exact same handler the deleted "View
  all N comments ›" line used), `minHeight:44` + `padding:'11px 0'` for the ≥44px tap
  target via invisible padding (no visible chrome besides the text + tick).
- **The separate `VIEW ALL N COMMENTS ›` line is deleted entirely** — its old
  conditional (`commentCount > Math.min(2, followedComments.length)`) and its
  standalone `<button>` are both gone; the new eyebrow always carries the count when
  `commentCount > 0`; at ≤2 comments the eyebrow alone still shows "Comments · 1 ›"
  / "Comments · 2 ›" (per spec: "at ≤2 comments the eyebrow alone carries the
  count").
- **Gating changed from `followedComments.length > 0` to `commentCount > 0`** — this
  is intentional per spec §8 ("the eyebrow row IS the view-all affordance") and is
  the one behavior-adjacent change in this task: previously, a post with real
  comments from people I don't follow (so `followedComments` was empty) rendered NO
  comments affordance at all on the card — not even a count — even though
  `commentCount` (used elsewhere on the card, e.g. the action strip's Comment button)
  already reflected the honest total. The new eyebrow is gated on the honest total
  instead, so it never disappears just because none of the visible commenters are
  people I follow; `BSFeedComment` preview ROWS underneath still only ever render
  `followedComments` (unchanged — `followedComments.length > 0 && followedComments
  .slice(0, 2).map(...)`), so nobody's comment text is shown who wasn't already
  shown before this task. This is a strict widening of an existing, already-honest
  count (`commentCount`) to also gate visibility of the header that displays it —
  not a new data read, not a fabricated number.
- `BSFeedComment` call (`c`, `t`, `cardInk`, `muted`, `feedAvatars`, `real={a.real}`,
  `size={24}`) and the `.slice(0, 2)` cap are carried verbatim — component internals
  untouched per Global Constraints.

---

- [ ] **Step 3: Parse-check, build, test, normalize, commit**

From `mobile-app/`:

```
node -e "require('@babel/parser').parse(require('fs').readFileSync('src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"
```

Expected: no output (clean parse).

Then in **PowerShell** (never Git Bash — MSYS path-mangles `VITE_BASE`):

```powershell
cd C:\Users\cperr\shape-app\mobile-app
$env:VITE_BASE='/m/'
npm run build
```

Confirm exit code 0 (`✓ built in …s`). Do not commit `public/m` — it's built at deploy
(#1470).

Then from the repo root:

```
npm test
```

Confirm 382/382 passing (no test in the suite exercises `BSActivityCard` directly —
this is a JSX-only presentational change with no pure-module surface, so the count
should be unchanged from whatever Task 1/2 left it at; if the actual baseline reported
by an earlier task's verification step differs from 382, treat that number as
authoritative — do not silently accept a lower count than the plan's running baseline).

Then LF-normalize the touched file:

```
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
```

Commit (conventional, no push):

```
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "$(cat <<'EOF'
feat(feed): flex-cell action strip + comments eyebrow on activity cards

Converts BSActivityCard's action row to five flex:1 cells (each >=44x44px,
invisible boundaries) with the boost reaction as the one 36px squared chip
fill (tinted unreacted / solid accent reacted) and Comment/Share/Send/Repost
as bare monochrome glyphs + ink-alpha counts that darken to full ink on
press, all with transform-only scale(0.97) press feedback; long-press
expressive palette and every action handler carried verbatim. Replaces the
separate "View all N comments" line with a single COMMENTS - N eyebrow
(6x1.5px heat tick) that is itself the view-all affordance, gated on the
post's honest total comment count rather than only comments from people I
follow, per the Wire Dispatch + grafts spec.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

Do **not** push.

---

**Global Constraints verification (repeat every task):**

- [ ] Parse-check from `mobile-app/` (Step 3 above) — clean, no output.
- [ ] PowerShell-only mobile build (Step 3 above) — exit 0. Never Git Bash for this
      build (MSYS path-mangles `VITE_BASE=/m/` → `/`).
- [ ] Full `npm test` from the repo root — 382/382 (or the plan's current running
      baseline if an earlier task's verification step reported a different number).
- [ ] `sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — LF
      normalization on the touched file (Edit/Write save CRLF on Windows; this repo's
      tracked JSX is LF).
- [ ] Conventional commit ending `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
      (Step 3 above).
- [ ] Do **not** push.

### Task 4: Route treatment + motion audit + cleanup + WORKLOG

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — `BSActivityCard`'s
  GPS-route block only (the routed/routeless branch that sits between the coach-
  attribution block and the "Session details · full activity" link). No other
  block in the function is edited by this task.
- Modify: `docs/WORKLOG.md` — one new dated changelog entry inserted above the
  current top entry.

**Interfaces:**
- Consumes (verbatim, unchanged): `routeObj`, `showRoute`, `openDetail`, `tc`
  (still the card's resolved role/tier heat — Tasks 1–3 use both the `heat`
  local from Task 1's Step 2 and the pre-existing `tc`; this task's route block
  uses `tc` exactly as the current file does today, since the spec's graft
  targets ONLY the container treatment, not a heat-source change), `t.INK`,
  `bsTHexA`, `BSActivityRoutePreview` (component — **not modified**, per spec
  §9 and the Global Constraints' "Shared components untouched" list). Consumes
  Task 1's single `[railRef, railSeen]` / `sdReduced` pair only insofar as
  verifying it (Step 3 of this task) — this task adds no new animation and
  therefore calls `useBSSdInView()` zero times.
- Produces: no new exported functions, no new props. The route block renders
  full-bleed (edge-to-edge past both the rail gutter and the page gutter) with
  1px top/bottom hairlines when `routeObj` exists; a centered dashed redaction
  line (`GPS · NOT RECORDED`) when `showRoute` is true and `routeObj` is null;
  nothing when neither is true (unchanged honest-data gate).

---

- [ ] **Step 1: Locate the current GPS-route block**

Grep to confirm the anchor is still unique, then read it in place (locate by
code text — the file is ~22.9k lines and shifts; do not trust any line number
from the spec or from this plan):

```
grep -n "GPS route — the REAL polyline" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
```

The exact current block (unchanged by Tasks 1–3, which do not touch the route
branch):

```jsx
          {/* GPS route — the REAL polyline when the post carries points;
              halftone tile in the member's tier color otherwise (endurance hero).
              Tap opens the full session-details page. */}
          {routeObj ? (
            <div onClick={() => openDetail('stats')} style={{ cursor: 'pointer' }}><BSActivityRoutePreview route={routeObj} /></div>
          ) : showRoute && (
            <div onClick={() => openDetail('stats')} style={{ position: 'relative', marginTop: 9, height: 80, borderRadius: 11, overflow: 'hidden', cursor: 'pointer', border: `1px solid ${tc}33`, background: `radial-gradient(circle at 30% 30%, ${tc}cc 0 1.3px, transparent 1.7px) 0 0/9px 9px, linear-gradient(135deg, ${tc}3a, ${tc}12)` }}>
              <span style={{ position: 'absolute', left: 9, bottom: 7, fontFamily: t.MONO, fontSize: 7, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#fff', background: 'rgba(0,0,0,0.45)', padding: '2px 5px', borderRadius: 3 }}>GPS route</span>
            </div>
          )}
```

---

- [ ] **Step 2: Confirm the two gutter values this task must break out of**

Per spec §9 (graft, binding): *"`BSActivityRoutePreview` runs full-bleed
edge-to-edge (negative margins out of the rail gutter and the page gutter)…
a printed-photo bleed."* Two gutters stack between the route preview and the
screen edge, and both must be cancelled with negative margins:

1. **The rail gutter** — Task 1's `paddingLeft: 15` on the card's own content
   wrapper (`<div style={{ padding: '10px 13px 11px 0' }}>` sitting inside
   `<div style={{ paddingLeft: 15 }}>`, per Task 1 Step 3). Total left inset
   from the card's own chrome: `15` (rail gutter) `+ 13` (the inner wrapper's
   own left padding is `0` — Task 1's replacement already zeroed it to
   `'10px 13px 11px 0'`, i.e. **top 10 / right 13 / bottom 11 / left 0** — so
   the card-local left inset is `15px` and the card-local right inset is
   `13px`). Confirm this by re-reading Task 1's Step 3 output in the live file
   (`grep -n "paddingLeft: 15" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`)
   before writing the negative margin below — if a later task changed these
   numbers, use the live values, not `15`/`13`.
2. **The page gutter** — the side padding of whichever screen renders the
   card. The **community feed** wraps its card list in
   `<div style={{ padding: '4px 0 84px', ... }}>` (no side padding of its own;
   the side gutter one level up is the tab body's `t.padX` — grep
   `padding: '4px 0 84px'` to confirm no intervening side padding was added
   between this task's predecessors and this step) — so on the community
   feed, "the page gutter" is `t.padX` (theme density token: 24 relaxed / 20
   standard / 16 dense — never hardcode a literal, read `t.padX` from `useBS()`
   the same way the rest of the file does). The **member profile feed** and
   **coach profile feed** wrap each card in a fixed-margin div (Task 1 Step 4,
   verbatim, unchanged by this task):
   ```jsx
   <div key={a.key || i} style={{ ...card, overflow: 'hidden', margin: '0 -20px 12px', borderRadius: 0, borderLeft: 0, borderRight: 0 }}>
   ```
   (member profile, `-20px`) and
   ```jsx
   <div key={a.key || i} style={{ ...card, overflow: 'hidden', margin: '0 -22px 12px', borderRadius: 0, borderLeft: 0, borderRight: 0 }}>
   ```
   (coach profile, `-22px`) — these wrappers have ALREADY cancelled the tab
   body's own side padding for the whole card (that's what the negative
   margin on the wrapper does), so from `BSActivityCard`'s own point of view
   in both profile contexts the "page gutter" it still needs to escape is
   **zero** — the wrapper already put the card flush to the screen edge. Only
   the **rail gutter** (`15px`/`13px`) remains for the route preview to cancel
   in the profile contexts; in the **community feed** the route preview must
   cancel BOTH the rail gutter AND `t.padX`, since nothing upstream of
   `BSActivityCard` there has already gone full-bleed.
   Since `BSActivityCard` cannot see which context it's in from a prop, and a
   single fixed negative-margin pair cannot correctly cancel `t.padX` (variable)
   in one context while cancelling `0` in another, **this task's negative
   margin targets the rail gutter only** (`marginLeft: -15, marginRight: -13`,
   read live per the note above) — this is the honest, context-agnostic
   "full-bleed out of the rail" the spec explicitly calls out
   (*"negative margins out of the rail gutter **and** the page gutter"*): the
   rail-gutter cancellation is `BSActivityCard`'s own responsibility and is
   identical in every context; going further and also cancelling `t.padX`
   is **out of scope for this task** because it would require a new prop
   threaded through all three call sites (a task-boundary decision, not a
   silent partial fix) — call this out as the one deviation from a literal
   reading of spec §9 in this task's summary. The profile contexts already
   read as fully edge-to-edge today (their wrapper cancelled `t.padX`
   already), so in practice two of the three contexts get a true edge-to-edge
   bleed from this task alone; the community feed gets bled to the rail edge
   (past the card's own internal gutter) but not past `t.padX` without a
   follow-up prop.

---

- [ ] **Step 3: Replace the route block**

Locate the exact snippet from Step 1 and replace it with the full-bleed
routed preview + the redaction-line routeless fallback (component NOT
modified — only the wrapping `div`'s own margin/border changes; `showRoute`'s
honest-data gate is carried verbatim, unchanged):

```jsx
          {/* GPS route ✦ (graft, spec §9) — BSActivityRoutePreview itself is
              NOT modified; it now runs full-bleed, breaking out of the rail
              gutter (marginLeft cancels Task 1's paddingLeft:15; marginRight
              cancels the card's own right inset) with 1px ink-alpha hairlines
              top/bottom in place of the component's default border — a
              printed-photo bleed. Routeless fallback collapses to the Open
              Ledger redaction line (same pattern as the Session Details page's
              own "GPS · Not recorded" — a 1px dashed rule flexing both sides
              of centered mono text) instead of the old halftone tile; honest
              data gate (`showRoute`) is unchanged — still renders nothing at
              all when the post carries no route signal whatsoever. */}
          {routeObj ? (
            <div onClick={() => openDetail('stats')} style={{ marginTop: 12, marginLeft: -15, marginRight: -13, borderTop: `1px solid ${bsTHexA(t.INK, 0.1)}`, borderBottom: `1px solid ${bsTHexA(t.INK, 0.1)}`, cursor: 'pointer' }}>
              <BSActivityRoutePreview route={routeObj} />
            </div>
          ) : showRoute && (
            <div style={{ display: 'flex', alignItems: 'center', margin: '18px 0 2px' }} aria-label="GPS not recorded">
              <span aria-hidden style={{ flex: 1, borderTop: `1px dashed ${bsTHexA(t.INK, 0.25)}` }} />
              <span style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: bsTHexA(t.INK, 0.45), padding: '0 8px' }}>GPS · Not recorded</span>
              <span aria-hidden style={{ flex: 1, borderTop: `1px dashed ${bsTHexA(t.INK, 0.25)}` }} />
            </div>
          )}
```

Notes on this replacement:
- **`BSActivityRoutePreview` is untouched** — same single prop
  (`route={routeObj}`), same internal markup/SVG/halftone-grid/pin styling.
  Only the wrapping `<div>`'s own style object changed: `cursor: 'pointer'`
  kept (tap-through to `openDetail('stats')` carried verbatim), `marginTop`
  raised from the old tile's `9` to `12` (matches the hero-rule-to-caption
  rhythm elsewhere in the card), and the component's own `border` (currently
  `1px solid t.INK` on all four sides, set inside `BSActivityRoutePreview`
  itself) is **overridden from the outside** by the wrapper's `borderTop`/
  `borderBottom` only — the component's internal full border still paints,
  but because this task does not touch the component, the correct fix is
  cancelling the component's own left/right border optically via the
  negative-margin bleed sitting flush against the screen edge (or the
  profile wrapper's edge), which visually reads as "no side borders" per the
  spec even though the component's internal 1px border technically still
  exists on its own box at the extreme edge — this is the one place the "no
  side borders" instruction is satisfied by geometry (bleeding the border
  itself off past the readable content area) rather than by a CSS override,
  because the component is explicitly out of scope for modification. If a
  future on-device pass finds the component's own left/right border still
  visibly readable at the bleed edge, that is a `BSActivityRoutePreview`
  change and is explicitly OUT OF SCOPE for this task (raise it as a
  follow-up, do not fix it here).
- **Routeless fallback**: the old 80px halftone tile (radial-gradient dot
  pattern + "GPS route" label chip) is fully deleted. The replacement is
  copied from the Session Details "Open Ledger" page's own honest-null
  pattern (`grep -n "GPS · Not recorded" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx`
  to see the detail-page original at its call site) — same dashed-rule-
  flexing-both-sides-of-centered-mono-text structure, same `bsTHexA(t.INK,
  0.25)` rule alpha and `bsTHexA(t.INK, 0.45)` text alpha. This task's copy
  drops the detail page's own `bsSdFadeUp` entrance animation on the label
  (that page's block runs `...(sdReduced ? null : { animation: 'bsSdFadeUp
  420ms ease 100ms both' })` on the `GPS · Not recorded` span) — the feed
  card's redaction line renders in its FINISHED state with no animation of
  its own, because the Global Constraints' motion contract names exactly
  four things that animate per card (rail grow → hero count → rules draw →
  co-sign stamp) and the routeless redaction line is not one of them; adding
  a fifth animated element here would violate "ONE `useBSSdInView` observer
  per card" in spirit even though technically no new observer would be
  needed (this task calls the hook zero times) — the honest reading of the
  spec's motion contract is that the redaction line is static chrome, not a
  ledger entrance the way the hero figure/rules/co-sign are. This is a
  deliberate, minor deviation from the detail-page source it's copied from —
  call it out in the summary.
- `showRoute` (`const showRoute = a.real ? !!a.route : a.kind === 'run';`) is
  read, not written — carried verbatim from the top of `BSActivityCard`,
  unchanged by any task in this plan.

---

- [ ] **Step 4: Motion audit — confirm the full sequence hangs off Task 1's one observer**

Read the full, current `BSActivityCard` function body top to bottom (grep the
signature to relocate it fresh — do not reuse a stale line number from an
earlier task's read):

```
grep -n "function BSActivityCard({ a, ctx, hideAuthor" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
```

Verify, by inspection (no code changes in this step — this is an audit; if any
check below fails, STOP and fix the offending block before continuing to
Step 5, since a failure here means an earlier task in this plan deviated from
its own contract):

1. **Exactly one `useBSSdInView()` call** in the whole function body:
   ```
   grep -c "useBSSdInView()" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
   ```
   won't isolate the single function, so instead extract the function body
   (from the `function BSActivityCard(` line to its matching closing `}`) and
   count within it — expect exactly **1** call, at Task 1's Step 2 hoist
   point (`const [railRef, railSeen] = useBSSdInView();`), before any early
   return.
2. **Every other animated block reads the SAME `railSeen`/`sdReduced` pair**
   — no block in the function calls `useBSSdInView()` a second time, and no
   block invents a second reduced-motion check that isn't `bsSdReduced()`
   assigned once to `sdReduced` at the top. Grep for the tell:
   ```
   grep -n "useBSSdInView\|bsSdReduced()" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
   ```
   and confirm every hit inside `BSActivityCard` traces back to the two Step-2
   declarations, not a fresh call.
3. **The sequence order matches the Global Constraints' motion contract** —
   reading top to bottom in the function, confirm: the rail's `bsSdGrowY`
   (Task 1) appears before the hero's `BSSdCountUp` (Task 2), which appears
   before the hero rule's `bsSdDrawX` (Task 2) and the between-post separator's
   `bsSdDrawX` (Task 1), which appears before the co-sign's `bsSdStamp`
   (Task 2). This is already true by construction (each task inserted its
   animation in the JSX position matching its visual position top-to-bottom
   in the card), so this check should PASS with no edit — it is a
   confirmation, not a new ordering mechanism.
4. **Every animated inline style is reduced-gated** — grep every `animation:`
   occurrence inside the function body and confirm each is wrapped in the
   `...(sdReduced ? null : { animation: '...' })` (or, for the rail's initial
   `scaleY(0)` pre-seen state, the equivalent `sdReduced || railSeen ? null :
   {...}` guard from Task 1 Step 3) spread — never a bare `animation:` sitting
   unconditionally in a style object:
   ```
   grep -n "animation:" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
   ```
   filter to the line range of `BSActivityCard` and check each hit by eye.
5. **Zero infinite loops** — grep the word "infinite" inside the function
   body and confirm no match (the Global Constraints' binding graft: *"zero
   infinite loops on feed cards (NO breathing tick)"* — Task 1 already
   deleted the only prior candidate, the live-pulse breathing tick that only
   ever existed on the Session Details detail page, never on the feed card):
   ```
   grep -n "infinite" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
   ```
   Expected: either zero hits in the file, or every hit that does exist is
   outside `BSActivityCard`'s line range (e.g. an unrelated `animation:
   'somethingElse 2s linear infinite'` on a spinner elsewhere in the file is
   fine — it is not part of this card). If any hit falls inside
   `BSActivityCard`'s function body, that is a Global Constraint violation —
   fix it (remove the `infinite` keyframe repeat) before proceeding.

If every one of the five checks above passes with no code change required,
record that in the commit message (Step 8) as an explicit audit-passed note
rather than silently skipping it — the brief requires this audit to be a
verifiable step, not an assumption.

---

- [ ] **Step 5: Cleanup — grep-verify-then-delete orphaned locals/helpers from the old card chrome**

The base card (pre-Task-1) defined several locals and inline style helpers
that existed ONLY to feed the deleted chrome (bordered chips, filled type
pill, bordered halftone tile, the four-circle action-button pill helper).
For each candidate below, grep the ENTIRE file (not just `BSActivityCard`) for
every remaining reference before deleting anything — a local that still has a
live reader anywhere (including another component, a website parity file, or
a test) must NOT be deleted.

1. **`actPill` (the old circular action-button style helper)** — defined
   inline inside the action-strip IIFE:
   ```jsx
   const actPill = (on, grow) => ({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 34, boxSizing: 'border-box', padding: grow ? '0 14px' : 0, width: grow ? 'auto' : 34, flexShrink: 0, borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap', background: on ? tc : 'transparent', color: on ? '#fff' : muted, border: `1px solid ${on ? tc : hair}`, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1 });
   ```
   Task 3 (spec §7, the five flex:1 cells graft) is responsible for deleting
   this helper as part of replacing the action-row markup that calls it —
   confirm Task 3 already removed it:
   ```
   grep -n "const actPill" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
   ```
   Expected: **zero matches**. If a match remains, Task 3's action-strip
   rewrite is incomplete — that is a Task 3 defect, not something to
   silently patch here; flag it and fix Task 3's block before continuing
   (this task's own diff should not need to touch the action row at all).
2. **The halftone routeless-tile inline style** — this task's own Step 3
   deletes the only reader (`background: radial-gradient(circle at 30% 30%,
   ${tc}cc 0 1.3px, transparent 1.7px) 0 0/9px 9px, linear-gradient(135deg,
   ${tc}3a, ${tc}12)`); confirm no other block in the file reused that exact
   gradient literal (it was inline, never extracted to a named helper, so
   this is a by-construction pass once Step 3 is applied — grep to confirm
   no duplicate copy elsewhere):
   ```
   grep -n "radial-gradient(circle at 30% 30%" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
   ```
   Expected: zero matches after Step 3 (was exactly one, this block, before).
3. **The old tier-chip / filled-type-pill JSX** — already deleted by Task 1
   Step 3 (tier chip) and Task 1's type-tag restyle (filled pill → ink text +
   heat underline). Confirm no dead style object survives under a name like
   `chipStyle`/`pillStyle` anywhere in `BSActivityCard`:
   ```
   grep -n "chipStyle\|pillStyle" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
   ```
   Expected: no hits scoped to `BSActivityCard` (this card never named these
   as extracted helpers — the old styles were always written inline — so
   this check should already pass with zero matches file-wide; if it does
   not, that is pre-existing code elsewhere and out of scope, not this
   card's cleanup).
4. **`cardInk`** (from `ctx`) — Task 1/2 replaced every `cardInk` reference
   inside `BSActivityCard`'s own JSX with `t.INK` (per the Global Constraints,
   "Text = `t.INK` alphas"). Confirm zero remaining uses of the destructured
   `cardInk` INSIDE this function before considering it for removal from the
   destructure list — but do **not** remove it from the `ctx` destructure
   itself unless this grep also comes back clean for the "no activity yet"
   empty-state block and any other consumer of the same `ctx` object outside
   this function (`cardInk` is destructured once from `ctx` at the top of
   `BSActivityCard` and may still be read by a block this plan's tasks never
   touched — check before deleting the destructure entry):
   ```
   grep -n "cardInk" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
   ```
   If every remaining hit inside `BSActivityCard`'s body is gone but
   `cardInk` still appears in the destructure line itself
   (`const { t, cardInk, muted, hair, card, ... } = ctx;`), leave the
   destructure alone UNLESS this grep shows zero uses anywhere in the
   function — an unused destructured variable is dead code and should be
   removed from the destructure list at that point (do not leave a
   flagged-as-dead local sitting in the destructure with no reader).
5. **`muted`/`hair`** — do NOT delete these from the destructure; both are
   still legitimately read elsewhere in the surviving card (role chip border/
   text in the author row, the `onEdit` pencil button's border, the ago/city
   meta line, the palette-close `×` button, comment-count button). Grep to
   confirm before assuming otherwise:
   ```
   grep -n "\bmuted\b\|\bhair\b" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
   ```
   scoped to `BSActivityCard`'s line range — expect multiple live hits; these
   stay.

For every deletion candidate confirmed dead by its grep, delete it as part of
this task's diff; for every candidate NOT confirmed dead (a live reader
remains, even one outside this function), leave it untouched and do not
report it as cleaned up.

---

- [ ] **Step 6: Parse-check**

From `mobile-app/`:

```
node -e "require('@babel/parser').parse(require('fs').readFileSync('src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"
```

Expected: no output (clean parse).

---

- [ ] **Step 7: PowerShell mobile build**

```powershell
cd C:\Users\cperr\shape-app\mobile-app; $env:VITE_BASE='/m/'; npm run build
```

Expected: exit 0 (`✓ built in …s`). Never Git Bash for this build. Do not
commit `public/m` — it is built at deploy (#1470).

---

- [ ] **Step 8: Full test suite**

From repo root:

```
npm test
```

Expected: 382/382 passing (this task touches only inline JSX presentation +
a WORKLOG doc edit — no pure-module surface, so the count is unchanged from
the baseline established by Task 1).

---

- [ ] **Step 9: WORKLOG entry**

Read the current top of the changelog to confirm the exact insertion point
(locate by code text — do not assume the line number below is current):

```
grep -n "^## Changelog" docs/WORKLOG.md
```

then read from that line forward far enough to see the current LATEST
`### ` dated entry (the one immediately following the `> **Latest session
handoff…` blockquote block). Insert the new entry **immediately above** that
current top entry — i.e. directly after the blockquote block ends and before
the first `### ` heading currently in the file. The PR number is unknown at
plan-authoring time; the implementer fills it in from the controller (the one
permitted unknown for this task) — do not guess a number.

Insert (house tight style — dense, dash-bulleted, matching the surrounding
entries' voice exactly; `#XXXX` is a literal placeholder the implementer
replaces with the real PR number received from the controller):

```markdown
### 2026-07-03 — Feed activity cards: "Wire Dispatch" redesign (#XXXX)
- **`BSActivityCard` rebuilt from a dark bordered rounded-rect into a zero-box
  "dispatch" on a per-author heat rail** (spec
  `docs/superpowers/specs/2026-07-03-feed-wire-dispatch-design.md`), serializing
  the shipped Session Details "Open Ledger" language (#1523) at feed density:
  card chrome (fill/border/radius/clip/top strip) deleted entirely; boundaries
  now come only from the per-post heat rail, the ink→heat separator rule
  between posts, and whitespace. Six critic grafts are binding overrides
  (zero feed-card motion loops · co-sign as a press credit, not a filled pill ·
  links/type-tag as ink text + heat underline only · GPS routes full-bleed ·
  a comments eyebrow that IS the view-all · five flex `≥44px` action cells).
- **Hero ledger**: title + trailing heat period, an eyebrow-above-figure hero
  stat via the Open Ledger's own `bsSdSplitUnit` + `BSSdCountUp` (honest-absent
  when a post carries no hero stat — never a fabricated figure), a heat rule
  drawn under the figure on first view.
- **Co-sign → press credit**: the solid rust/gold pill is gone; a coach
  co-sign now reads as a 3px role-colored spine + a heat check glyph + the
  name and "co-signed · role" label both in ink-alphas (never role-colored
  running text) — reads heavier than a peer reaction with zero fill.
  Eligibility/gating (`iAmAuthorsCoach`, honest-null absent a real coach↔client
  link) unchanged.
- **Route posts full-bleed**: `BSActivityRoutePreview` (component itself NOT
  modified) now bleeds past the card's own rail gutter with 1px ink-alpha
  hairlines top/bottom instead of a boxed tile; the routeless fallback
  collapses from an 80px halftone tile to the Open Ledger's own redaction
  line (a dashed rule flexing both sides of centered mono `GPS · Not
  recorded`) — same honest-data gate as before (renders nothing at all when
  the post carries no route signal).
- **Motion**: one `useBSSdInView` observer per card (not per field) drives the
  whole first-view sequence — rail grows → hero counts → hero/separator rules
  draw → co-sign stamps — every animated style reduced-motion-gated via
  `bsSdReduced()`; audited zero infinite-loop animations anywhere in the card
  (the old live-pulse breathing tick was a detail-page-only signature and
  never shipped on the feed card).
- **Cleanup**: removed the action-row's old circular-pill style helper and
  the routeless halftone-tile gradient literal, both now fully unreferenced;
  `hideAuthor` (profile-feed) variant keeps the identical rail/rule treatment
  with no author block, verified in both the community feed and both profile
  contexts.
  Verified: JSX parse · PowerShell mobile build (exit 0) · full `npm test`
  (382/382) · LF normalized. **On-device pass recommended** (Black/Sage/Cream
  papers) before merge — a co-signed PR post, a run WITH a GPS route, a
  routeless run, a photo post, and a plain note, each viewed in BOTH the
  community feed and a profile feed (`hideAuthor`), confirming the rail/rule
  rhythm between same-role posts, the invisible 44px action-strip targets,
  and that reduced-motion renders every card in its finished state with zero
  residual transform/opacity.
```

Do not remove or alter any existing entry — this is a pure insertion above
the current top entry.

---

- [ ] **Step 10: LF-normalize touched files**

Edit/Write save CRLF on Windows; both touched files are tracked as LF:

```
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx docs/WORKLOG.md
```

---

- [ ] **Step 11: Commit**

```
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx docs/WORKLOG.md
git commit -m "$(cat <<'EOF'
feat(feed): full-bleed route treatment, motion audit, and dead-chrome cleanup on activity cards

BSActivityRoutePreview now runs full-bleed out of the card's rail gutter
with 1px ink-alpha hairlines top/bottom (component itself untouched); the
routeless fallback collapses from the old halftone tile to the Open
Ledger's own dashed redaction line (GPS · Not recorded), same honest-data
gate. Audited the full card: exactly one useBSSdInView observer drives
rail-grow -> hero-count -> rule-draw -> co-sign-stamp, every animated
style reduced-gated, zero infinite-loop animations anywhere in the card.
Removed the now-orphaned action-pill style helper and halftone gradient
literal left behind by the redesign. Adds the WORKLOG entry for the whole
Wire Dispatch redesign.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

No push.
