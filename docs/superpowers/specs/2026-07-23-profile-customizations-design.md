# Profile customizations — the profile wave (coach P1–P5 + member M1–M5)

**Date:** 2026-07-23 · **Status:** OWNER-RULED — "create customizations for clients profile as well" → "yes write the spec" → **"add them all" / "all"**: every item below is IN scope. Written on Fable, built on Opus, **after** the coach-listing-media box wave (spec `2026-07-23-coach-listing-media-design.md`, PR #1815 — THE STUDIO gallery reaches the coach profile there, not here).
**Board:** section 05 (P's) + 06 (M's) of the 2026-07-23 concept board.

---

## Why

The living profiles (member **Terrain**, coach **Signal**) carry Shape-authored data richly but member/coach-authored *character* thinly — one pinned highlight, prompts, a song. The wave adds the missing self-authored layer: mottos, galleries, goals-in-public, trophies, films, and (for coaches) their business front — pictures-first, matching the owner's thrust across this wave.

## What already exists — DON'T rebuild (verified 2026-07-23)

Via ✎ Customize (`BSProfileCustomizer`, `iosAppBroadsheetClient.jsx:11108`, with a `coach` flag — mounted from both Terrain `:12475` and Signal `:13148`; web = the living-profile Customize modal, `livingDesktop.jsx:907` upsert): **bio · cover photo · accent · climb background · headline stats ≤3 · pinned highlight (one) · profile song · prompts ≤4 · social links.** All stored in `user_goals('profile_custom')`.

## The load-bearing mechanic (verified 2026-07-23)

`get_public_profile` returns the **whole** `profile_custom` doc to visitors (`2026-06-09-usernames.sql:123-128` — the `cust` CTE selects `g.data` unfiltered; the mobile visitor path consumes it at `iosAppBroadsheetClient.jsx:11714` `live.custom`; the in-code comment at `:10182` documents the contract). Therefore:

- **Every new feature = new keys on the existing doc.** Visitors read them through the RPC that already ships them; owners write through the existing owner-RLS `saveUserGoals('profile_custom', doc)` path. **No new RPC, no new route, and no migration** — except M5's bucket mime widening (below).
- **Privacy comes free:** new keys inherit exactly the gating the doc has today (the RPC's visibility CTE / `can_view` behavior). Opus verifies the precise withheld-vs-returned behavior for friends/private during build and matches it — new keys must never be MORE visible than the existing custom fields.
- The customizer save **spreads over the loaded doc** (existing behavior) — new keys can't clobber fields other surfaces own.

## The doc — new keys

```
profile_custom: {
  …existing keys untouched…,
  line:      text ≤80,                                  // P2 + M4 — one shared key, role decides placement
  film:      { url, caption ≤80 },                       // P1 + M5 — one shared key
  wall:      [{ url, caption ≤80 }] ≤6,                  // M1
  startLine: { title ≤60, date "YYYY-MM-DD" },           // M2
  shelf:     [{ title ≤60, when ≤20 }] ≤4,               // M3
  bizCard:   { name ≤60, where ≤80, hours ≤40, handle ≤40 },  // P4
  pinnedReviews: [coach_reviews ids] ≤3,                 // P5
}
```

**Sanitization (binding):** all URLs pass the box wave's canonical guard (`listingMedia.mjs` — PR A exports its scheme check as **`bsSafeMediaUrl`**; this wave reuses it at write AND render on both surfaces — one implementation of the http(s)-only rule). Text fields: plain strings, control chars stripped, clamped at write with the editor showing the limit; rendered as React text (escaped), never HTML. Junk shapes at any key → that feature renders nothing (never throws, never a placeholder).

## The features

### Member — Terrain (app + web)

- **M1 · The Wall** — a curated pinned gallery station (`THE WALL` head, tier-heat tick + ink→heat rule; horizontal captioned strip, member-ordered). Distinct from the chronological activity feed: chosen keeper shots. Uploads: the existing **community-photos** bucket (owner-folder RLS, image mimes — the photo-post upload path reused verbatim).
- **M2 · The Start line** — hero line: `TRAINING FOR · {title} · {MMM D} · {N} DAYS OUT`. Days-out computed in the **viewer's** local tz from the stored date; **a past date renders nothing** (stale goals never linger; the owner's customizer shows it struck with a "passed — clear or update" note). No fabricated countdown on a missing/invalid date.
- **M3 · The Shelf** — a `THE SHELF · PROUDEST` station of ≤4 dot-leader rows (`01 · DEADLIFT 140KG ···· MAY '26`), member-written and member-ordered. Coexists with the single pinned highlight (untouched).
- **M4 · The Line** — one motto, serif italic on the Terrain hero under the identity head, `— {THEIR} LINE` mono attribution. Shares the `line` key with P2.
- **M5 · The Film** — a short pinned video card (inline `<video>`, tap-to-play, caption). **The wave's ONLY migration:** widen the community-photos bucket's allowed mimes to add `video/mp4 · video/quicktime · video/webm` and raise the size cap for those (60 MB) — `2026-07-XX-community-photos-video.sql`, additive + idempotent. Editor copy guides "30–60 seconds"; length is guidance, size is the enforced bound.

### Coach — Signal (app + web)

- **P1 · The intro film** — same card grammar as M5, placed on the Signal hero area. Uploads via the existing **coach-media** bucket (video mimes already allowed — no migration). Shares the `film` key.
- **P2 · The Line** — the motto on the Signal hero; role-heat attribution. Shared `line` key.
- **P3 · Philosophy prompts** — the existing prompts machinery, coach-flavored: a coach-specific suggestion list in the picker ("My coaching philosophy" · "First session with me" · "Who I coach best" · "What I won't program"). Opus verifies whether prompts already render on Signal via the shared extras component — if yes, P3 reduces to the suggestion list + editor copy; if no, add the render (same grammar as Terrain).
- **P4 · The Business card** — a grounded contact station: business name over dot-leader `WHERE / HOURS / FIND` ledger rows. Plain text (the handle is text, not a link, in v1 — no scheme surface).
- **P5 · The Wins wall** — the coach pins ≤3 of their **real, existing `coach_reviews`** (verified: table exists, unique `(user_id, coach_slug)`, publicly rendered on coach profiles today). The doc stores review **ids only**; render fetches the coach's reviews through the existing public read path and shows only pinned ids that still resolve — quotes verbatim, `— REAL REVIEW · PINNED` attribution. **A deleted review disappears from the wall automatically; the wall can never show text that isn't a live review row.** Never fabricated stats, never edited quotes.

## Editors

- **Mobile:** `BSProfileCustomizer` gains role-aware sections (the existing `coach` flag): member → THE WALL / START LINE / THE SHELF / THE LINE / THE FILM; coach → THE LINE / INTRO FILM / PROMPTS (coach suggestions) / BUSINESS CARD / WINS WALL (a pick-list of their own reviews). Same section grammar the customizer already uses; every limit visible; remove (×) on every item.
- **Web:** the living-profile Customize modal (`livingDesktop.jsx`) gains the same sections, role-aware. Uploads direct from the browser under the buckets' owner-folder storage RLS.

## i18n

New `profile:` (station heads, editor labels, the days-out line with ICU plural — `one` forms for ha, one/few/many/other for ru/uk) and `coach:` (editor sections, prompt suggestions) keys ×13, existing namespaces, parity-gated + tr-shadow greps both forms. Web stays English-only (content parity). LLM translations flagged for the standing human review.

## Honesty rules (binding)

- Absence at every key → that feature does not exist on the profile — never an empty station, never a placeholder.
- Demo personas may carry sample values (signed-out preview only); a real profile shows only what its owner set.
- The wins wall renders only live review rows; the start line never counts down from a past date; captions/quotes render as written.
- New keys are never more visible than the existing custom fields under friends/private visibility.

## Build plan (Opus, after the box wave's PR A + PR B, in order)

**PR C — member wave (M1–M4), both surfaces.** Doc keys + guards · Terrain renders (app `BSTerrainProfile` + web DesktopProfile, ledger grammar, tier heat line-only) · customizer sections (app + web) · i18n ×13. No migration.

**PR D — coach wave (P1–P5), both surfaces.** Signal renders (app + web) · the shared inline video card (built here, used by P1; coach-media already allows video) · customizer coach sections · the wins-wall pick-list + resolve-only render · i18n ×13. No migration.

**PR E — M5 the Film.** The community-photos mime-widening migration (owner-applied; raw link per convention) + the member film card reusing PR D's player. Everything degrades silently pre-migration (upload rejected by the bucket → honest editor error; no render change).

**Gates, each PR:** JSX parse · `tsc --noEmit` · full `npm test` · PowerShell `/m/` build · `build-newdesign --check` · LF · tr-shadow both forms · catalog parity ×13 · adversarial pre-push self-review (bug classes 1–12) · **render-mount proof** on every touched profile component (hook/TDZ class — both profiles, self AND visitor, demo AND live) · the 4-step merge gate · review-quota economy (whole-class audits before the first push, batch fixes, re-trigger Codex rarely).

## Acceptance criteria

1. A profile with none of the new keys renders **byte-identical** to today — both profile types, both surfaces, self + visitor + demo.
2. Each feature set alone renders its piece and nothing else's (per-key independence).
3. Visitor read: a SECOND account sees a member's wall/shelf/line/start-line and a coach's line/film/card/wins via `get_public_profile` — and sees them withheld under friends/private exactly as bio/prompts are today.
4. `javascript:`/`data:` URLs hand-written into the doc render nothing (both surfaces); a 7th wall photo / 5th shelf row / 4th pinned review / over-length captions can't be saved and render clamped if hand-written.
5. M2: date = tomorrow → `1 DAY OUT` (ICU singular); date = today → `TODAY`; past → the line is absent; garbage date → absent.
6. P5: deleting the underlying review removes it from the wall on next load; the wall never renders an id that doesn't resolve.
7. Films: a video URL from the wrong bucket/host still passes only the scheme guard (http(s)) — playback failure shows the browser's native state, never a fabricated poster; pre-migration member upload fails with an honest editor message.
8. The customizer save round-trips: set → save → reload → visitor sees it; clearing a field removes the key (not an empty-string tombstone).
9. Existing custom fields (cover, stats, highlight, song, prompts, socials) are byte-identical throughout — the doc spread preserves them on every save.

## Out of scope / follow-ons

- **D · marketplace want-ad row thumbs** — still unpicked from the box board; one line from the owner settles it either way.
- Member video in the activity composer (exists for coaches' media only today) — separate concern from the pinned film.
- Section reordering / layout control — deliberately not offered (the ledger grammar owns hierarchy).
- A "views" counter or wall reactions — social mechanics, separate wave if wanted.
