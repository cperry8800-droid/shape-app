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

- **Every new feature = new keys on the existing doc.** Visitors read them through the RPC that already ships them; owners write through the existing owner-RLS `saveUserGoals('profile_custom', doc)` path. **No new RPC, no new route.** The wave carries exactly **TWO migrations**, each riding its build PR: M5's dedicated **`member-films`** bucket (PR E — deliberately NOT a widening of community-photos) and P5's **`coach_reviews.owner_id`** column + backfill (PR D — the wins wall's immutable owner binding).
- **Privacy comes free:** new keys inherit exactly the gating the doc has today (the RPC's visibility CTE / `can_view` behavior). Opus verifies the precise withheld-vs-returned behavior for friends/private during build and matches it — new keys must never be MORE visible than the existing custom fields.
- The customizer save **spreads over the loaded doc** (existing behavior) — new keys can't clobber fields other surfaces own.

## The doc — new keys

```text
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

**Sanitization (binding):**

- **The guard dependency is explicit (review round):** `bsSafeMediaUrl` ships in the BOX wave's PR A (`public/newdesign/listingMedia.mjs`, spec `2026-07-23-coach-listing-media-design.md`), which merges **before any profile-wave PR** per the build order. If the box wave were ever cancelled, PR C creates the module itself — this wave never builds against a guard that doesn't exist in the tree. **Mobile enforces the IDENTICAL contract, by construction (review round — CWE-16):** mobile **imports the same canonical module directly** (the `mealPrep.mjs`/`varianceBand.mjs` import-path pattern — never a mobile re-implementation), so both surfaces' **upload AND render** paths call the one `bsOwnMediaUrl`; a **referential-equality test** (`import === window.ShapeListingLib` member, the `liveProgress.mjs` precedent) proves one implementation, and the guard's own test file carries the bucket/origin/owner-folder/media-type vectors both surfaces therefore share.
- **Per-key own-bucket, OWNER-FOLDER allowlist (review rounds — CWE-200 + type separation + IDOR/CWE-639):** the new media keys accept **only the app's own storage URLs, per key, inside the profile owner's folder** — `bsOwnMediaUrl(v, bucket, ownerUid)` (the box wave's canonical fn: `bsSafeMediaUrl` PLUS origin + `/storage/v1/object/public/<bucket>/<ownerUid>/` path check): `wall` → **community-photos** only · member `film` → **member-films** only · coach `film` → **coach-media** only, each bound to the profile owner's immutable uid (render side passes the profile's user id; the customizer passes the caller's own uid). This kills three classes at once: third-party tracking beacons (viewer IP/UA leakage), cross-type URL planting (the buckets are type-scoped), and **cross-account hotlinking inside the same public bucket** (a doc can't point at another member's objects). Zero functional cost — the editors only ever upload into the owner's own folder.
- Text fields: plain strings, control chars stripped, clamped with the editor showing the limit — and the SAME per-key normalizer (shape + length + control-chars) is enforced at **three points** (review round): the **editor** (UX rejection — a 7th wall photo / 5th shelf row / over-length caption can't be entered), the **trusted save path** (the profile-custom save wrapper normalizes **ONLY this wave's keys** BEFORE the `saveUserGoals('profile_custom', …)` upsert — **allowlisted normalization: every existing or unknown key passes through byte-identical** (AC 9 — saving one new field can never truncate or drop legacy cover/stats/highlight/song/prompts/socials data); `saveUserGoals` itself is a raw jsonb upsert with no DB-side shape constraint, so the wrapper is where the caps actually bind and an oversized collection never persists), and the **read/render path**, so a stale or direct-API-written doc can't bypass the binding limits either (the acceptance criteria's render-clamped vectors are enforced by code, not convention). Rendered as React text (escaped), never HTML. Junk shapes at any key → that feature renders nothing (never throws, never a placeholder).
- **Documented residual — public-bucket object URLs vs profile visibility (review round, ruled):** an object URL in a public bucket stays fetchable by anyone who already holds the URL even after the profile flips to friends/private. This is the platform's EXISTING, deliberate media architecture — community-photos photo posts, profile covers, and coach-media all have exactly this property today — and this wave adds no new class of exposure: the `can_view` gate governs **discovery** (whether the profile document, and therefore the URLs, are served to a viewer at all), not object fetch. Per-wave signed URLs would fork the app's media model for two keys while every neighboring surface stays public; if the platform moves to signed/authenticated media it must move wholesale. **Registered as a platform-wide follow-on** (all public-bucket media, one migration), explicitly out of this wave's scope.

## The features

### Member — Terrain (app + web)

- **M1 · The Wall** — a curated pinned gallery station (`THE WALL` head, tier-heat tick + ink→heat rule; horizontal captioned strip, member-ordered). Distinct from the chronological activity feed: chosen keeper shots. Uploads: the existing **community-photos** bucket (owner-folder RLS, image mimes — the photo-post upload path reused verbatim).
- **M2 · The Start line** — hero line: `TRAINING FOR · {title} · {MMM D} · {N} DAYS OUT`. **Date arithmetic (review round):** the stored date must match strict `^\d{4}-\d{2}-\d{2}$` AND be a **real calendar date** — construct the noon-anchored local date from the parsed Y/M/D and require **round-trip equality** (the constructed date's own y/m/d must equal the parsed values), which rejects `2026-02-31`, `2026-00-10`, and non-leap `-02-29` (JS Date silently NORMALIZES those into a shifted real date, which would fabricate a countdown to a day the member never wrote); anything failing either check → the line is absent. Days-out is a **local-calendar-date difference** — build the viewer-local Y/M/D for today and the target (noon-anchored, the index-dateline precedent) and diff whole calendar days — never `new Date("YYYY-MM-DD")` (UTC parse) and never elapsed-ms ÷ 86400000, so the count can't shift a day across UTC/DST boundaries. **A past date renders nothing** (stale goals never linger; the owner's customizer shows it struck with a "passed — clear or update" note). No fabricated countdown on a missing/invalid date.
- **M3 · The Shelf** — a `THE SHELF · PROUDEST` station of ≤4 dot-leader rows (`01 · DEADLIFT 140KG ···· MAY '26`), member-written and member-ordered. Coexists with the single pinned highlight (untouched).
- **M4 · The Line** — one motto, serif italic on the Terrain hero under the identity head, `— {THEIR} LINE` mono attribution. Shares the `line` key with P2.
- **M5 · The Film** — a short pinned video card (inline `<video>`, tap-to-play, caption). **A dedicated bucket, NOT a widening (Codex round; one of the wave's TWO migrations — the other is P5's `coach_reviews.owner_id`):** widening community-photos would let every EXISTING image path (`ShapeCommunity.uploadPhoto`, the web cover uploader — none of which check `file.type`) silently store video. Instead `2026-07-23-member-films-bucket.sql` creates a **`member-films`** bucket — **video mimes ONLY** (`video/mp4 · video/quicktime · video/webm`), 60 MB cap, owner-folder storage RLS (the community-photos policy shape) — so the photo bucket stays image-only and no existing upload path changes behavior. Additive + idempotent. Editor copy guides "30–60 seconds"; length is guidance, size is the enforced bound.

### Coach — Signal (app + web)

- **P1 · The intro film** — same card grammar as M5, placed on the Signal hero area. Uploads via the existing **coach-media** bucket (video mimes already allowed — no migration). Shares the `film` key.
- **P2 · The Line** — the motto on the Signal hero; role-heat attribution. Shared `line` key.
- **P3 · Philosophy prompts** — the existing prompts machinery, coach-flavored: a coach-specific suggestion list in the picker ("My coaching philosophy" · "First session with me" · "Who I coach best" · "What I won't program"). Opus verifies whether prompts already render on Signal via the shared extras component — if yes, P3 reduces to the suggestion list + editor copy; if no, add the render (same grammar as Terrain).
- **P4 · The Business card** — a grounded contact station: business name over dot-leader `WHERE / HOURS / FIND` ledger rows. Plain text (the handle is text, not a link, in v1 — no scheme surface).
- **P5 · The Wins wall** — the coach pins ≤3 of their **real, existing `coach_reviews`** (verified: table exists, unique `(user_id, coach_slug)`, publicly rendered on coach profiles today). The doc stores review **ids only**; render fetches **the PROFILE OWNER's own reviews** through the existing public read path (the query is filtered by the owner's `coach_slug` — never an unscoped by-id lookup) and shows only pinned ids that resolve **against the immutable profile owner** — so a hand-written id belonging to ANOTHER coach's review never resolves and never renders (review rounds — IDOR/CWE-639). **The owner binding is by `owner_id`, not slug (records-round ruling, superseding the earlier slug-residual framing):** `coach_reviews` today carries only a free-text `coach_slug` (mutable, collision-prone on rename/reuse), and the wall is a NEW curated surface whose whole promise is `— REAL REVIEW · PINNED` — a slug collision rendering another coach's words as this coach's testimonial would be a fabricated credential, which the honesty doctrine forbids. So **PR D ships the wave's second migration, `2026-07-23-coach-reviews-owner-id.sql`**: an additive, idempotent `owner_id uuid` column on `coach_reviews` + an index + a **CONSERVATIVE backfill** — a legacy row is stamped ONLY when its `coach_slug` maps to **exactly one** provider row across both tables **AND the review's `created_at` is not earlier than that provider row's own `created_at`** (the tenure check — no slug-history table exists, and a bare current-state join would silently reattach a PREVIOUS slug-holder's reviews to whoever holds the slug now after a rename/reuse; a review that predates the current holder's row cannot be proven theirs). Multi-match, unmatched, and pre-tenure rows all stay **NULL** — they can never be pinned, which is the honest cost: the wall only ever shows reviews whose ownership is provable. The review WRITE path stamps `owner_id` going forward, so the NULL set only shrinks. The wall resolves pins by **`id` AND `owner_id = the profile owner's uid`**; a NULL-`owner_id` row (unbackfillable) never resolves for the wall — honest absence over any risk of someone else's words. The profile's general Reviews section stays slug-keyed (out of this wave's scope; its re-keying onto the same column is the registered platform follow-on, now half-done by this migration). Quotes verbatim, `— REAL REVIEW · PINNED` attribution. **A deleted review disappears from the wall automatically; the wall can never show text that isn't a live review row.** Never fabricated stats, never edited quotes.

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

**PR D — coach wave (P1–P5), both surfaces.** Signal renders (app + web) · the shared inline video card (built here, used by P1; coach-media already allows video) · customizer coach sections · the wins-wall pick-list + the **`id` + `owner_id` resolve** · i18n ×13. **Carries the `2026-07-23-coach-reviews-owner-id.sql` migration** (owner-applied; raw link per convention; additive column + index + slug→provider backfill + write-path stamp). Pre-migration the wall resolves nothing (NULL owner_id never renders) — honest absence, no crash.

**PR E — M5 the Film.** The `2026-07-23-member-films-bucket.sql` migration (owner-applied; raw link per convention) + the member film card reusing PR D's player. Everything degrades silently pre-migration (no bucket → upload fails with an honest editor error; no render change).

**Gates, each PR:** JSX parse · `tsc --noEmit` · full `npm test` · PowerShell `/m/` build · `build-newdesign --check` · LF · tr-shadow both forms · catalog parity ×13 · adversarial pre-push self-review (bug classes 1–12) · **render-mount proof** on every touched profile component (hook/TDZ class — both profiles, self AND visitor, demo AND live) · the 4-step merge gate · review-quota economy (whole-class audits before the first push, batch fixes, re-trigger Codex rarely).

## Acceptance criteria

1. A profile with none of the new keys renders **byte-identical** to today — both profile types, both surfaces, self + visitor + demo.
2. Each feature set alone renders its piece and nothing else's (per-key independence).
3. Visitor read: a SECOND account sees a member's wall/shelf/line/start-line and a coach's line/film/card/wins via `get_public_profile` — and sees them withheld under friends/private exactly as bio/prompts are today.
4. `javascript:`/`data:` URLs hand-written into the doc render nothing (both surfaces); so does any URL outside the key's own bucket OR outside the owner's folder — a third-party image URL in the wall, a community-photos URL in the film slot, a member-films URL in the wall, and ANOTHER member's community-photos URL in this member's wall (the per-key owner-folder allowlist, tested per key). A 7th wall photo / 5th shelf row / 4th pinned review / over-length captions can't be saved **through the trusted path** — the editor rejects them AND the save wrapper normalizes the doc before the upsert (so the cap binds even if editor UX is bypassed; `saveUserGoals` alone is an unconstrained jsonb upsert) — and a doc oversized by a direct API write renders clamped.
5. M2: date = tomorrow → `1 DAY OUT` (ICU singular); date = today → `TODAY`; past → the line is absent; garbage/non-`YYYY-MM-DD` date → absent; a well-formed but **impossible** date (`2026-02-31`, `2026-00-10`, non-leap `-02-29`) → absent (the round-trip check — never silently normalized into a shifted real date); and a viewer at UTC−10 vs UTC+12 sees counts that differ only by their own local calendar day (the local-date diff vector — never a UTC/DST off-by-one).
6. P5: deleting the underlying review removes it from the wall on next load; the wall never renders an id that doesn't resolve; a hand-written id belonging to another coach's review renders nothing (**resolve by `id` + `owner_id = profile owner`** — the cross-coach id vector, tested); and a review row with NULL `owner_id` (pre-backfill / unbackfillable) never renders on the wall.
7. Films: only member-films (member) / coach-media (coach) URLs render at all (the per-key allowlist); playback failure shows the browser's native state, never a fabricated poster; pre-migration member upload fails with an honest editor message; existing photo paths still reject video (`community-photos` mimes untouched — the no-widening proof).
8. The customizer save round-trips: set → save → reload → visitor sees it; clearing a field removes the key (not an empty-string tombstone).
9. Existing custom fields (cover, stats, highlight, song, prompts, socials) are byte-identical throughout — the doc spread preserves them on every save.

## Out of scope / follow-ons

- **D · marketplace want-ad row thumbs** — RULED IN by the owner (2026-07-23 "yes add D") and specced in the BOX wave (`2026-07-23-coach-listing-media-design.md`); it ships with box PR A, not this wave.
- Member video in the activity composer (exists for coaches' media only today) — separate concern from the pinned film.
- Section reordering / layout control — deliberately not offered (the ledger grammar owns hierarchy).
- A "views" counter or wall reactions — social mechanics, separate wave if wanted.
