# Coach listing media — the customized marketplace box ("E · The Combo")

**Date:** 2026-07-23 · **Status:** OWNER-PICKED — concept board round complete, build queued for Opus
**Owner rulings (2026-07-23):** coaches customize their marketplace box on web AND app with pictures of themselves + their personal business ("yes do E, this is for marketplace"). Concept **E — The Combo** (box + studio in one) is the picked look, and **D (want-ad row thumbs) is IN** (owner, later same day: "yes add D") — every dense classifieds row gains a small portrait thumb. Written on Fable, built on Opus (the standing split). **Build phase is owner-PAUSED** ("pause before you start build") — no build PR starts without an explicit go.

---

## Why

A coach's box is their storefront, and today it's almost entirely Shape-authored: real coaches get only their profile avatar into the marketplace cell, the cover band on the website card exists **only for the demo cast**, and photos of a coach's actual business — their gym floor, their kitchen, their studio — have no home anywhere. Coaches sell with their face and their space; the box should carry both.

## The three slots (coach-managed, all optional)

| Slot | What it is | Bounds |
| --- | --- | --- |
| `portrait` | A photo of the coach themselves | one http(s) URL |
| `cover` | The **background picture** — rendered behind the box on both surfaces and as the scrimmed backdrop behind THE LISTING's header | one http(s) URL |
| `gallery` | Photos of their business/space | ≤ **6** items `{url, caption?}`, caption ≤ **80** chars |

**Nothing set → the coach's box carries no coach media** — every slot degrades to today's content (avatar-or-initials portrait, no cover, no strip). One deliberate exception, ruled by the E pick itself: the featured section's *geometry* changes for everyone (§Mobile renders #3) — the owner chose a redesign of that section, so its layout is intentionally new; a media-less coach's cell within it carries today's cell **content** at the new width. Every other surface is byte-identical when nothing is set.

## Data model

One new jsonb column on both provider tables — the exact `monthly_offer` precedent (2026-07-09):

```sql
-- supabase-migrations/2026-07-23-provider-listing-media.sql
-- Coach-authored marketplace-box media (spec 2026-07-23 — "E · The Combo").
-- Shape: { "portrait": url|null, "cover": url|null,
--          "gallery": [{ "url": url, "caption": text (<=80) }] (<=6),
--          "updatedAt": ISO — stamped BY THE SETTER on every successful write }
-- Limits + parsed-URL validation enforced by the canonical normalizer at BOTH
-- the write path and every render path (public/newdesign/listingMedia.mjs);
-- plain text captions only (rendered as text, never HTML).
-- Both provider tables are already public-read for the marketplace, so every
-- surface reads this with zero new endpoints; writes go through the coach's
-- existing owner-scoped provider-row update path. Idempotent; safe to re-run.

alter table if exists public.trainers
  add column if not exists listing_media jsonb;

alter table if exists public.nutritionists
  add column if not exists listing_media jsonb;
```

**`updatedAt` contract (resolved):** the **setter** stamps `updatedAt` (ISO) on every successful write; the normalizer **passes it through** when it is a valid ISO string and drops it otherwise; renderers ignore it. No caller ever authors it by hand.

**Why this clears every guard (verified against live migrations, 2026-07-23):**

- `guard_provider_admin_columns` (2026-06-25) pins an **enumerated blocklist** (`verified, verified_at, featured, rating, subscribers, sort_order, *_of_month`) — `listing_media` is not on it, so the coach's own-row UPDATE passes, exactly as `monthly_offer` does today (`shapeBackend.js:3905` documents this contract).
- Provider rows are public-read; the mobile marketplace (`client.from('trainers').select('*')`) and the web marketplace (`cl.from(table).select("*")`, `marketplace.jsx` `useLiveCoaches`) both already select `*`, so the column rides through with **zero query changes** and is migration-safe pre-apply (absent column → absent key → normalizer returns empty).
- `publishProviderRow` (approval re-publish) doesn't touch unrelated columns, so re-approval never clobbers a coach's media (the `verified` precedent).

**Executable authorization proof (PR A, review round — CWE-862 coverage):** because the guard claim above is otherwise prose, PR A **probes it live via the Supabase MCP before merge** (the award-RPC/cycle-probe precedent) and cites the probe results in the PR body; AC 7 references this probe. The matrix, run against BOTH tables: (a) an owner's own-row `listing_media` update succeeds; (b) the SAME write attempting to also set `verified`/`featured` leaves those columns pinned (guard holds); (c) a non-owner/anon update writes zero rows (RLS holds).

## One implementation — the canonical normalizer

**New `public/newdesign/listingMedia.mjs`** (the canonical-module pattern: `varianceBand.mjs` / `noraSets.mjs` / `mealPrep.mjs`):

- `bsSafeMediaUrl(v)` — the ONE URL gate, exported for reuse (the profile wave imports it): **parses with `new URL(v)`** and requires protocol `http:`/`https:` AND a non-empty hostname, length ≤ 500; malformed values (`https://`, `javascript:…`, `data:…`, junk) return null **without throwing**. A prefix regex is explicitly NOT the mechanism (review round: `^https?://` accepts host-less values).
- `bsNormalizeListingMedia(raw)` → `{ portrait, cover, gallery, updatedAt }` — the gate every consumer runs raw row data through:
  - `portrait`/`cover` pass `bsSafeMediaUrl` or drop; `updatedAt` passes through only as a valid ISO string.
  - `gallery` rebuilt **field-by-field** (the coach-channel per-item rebuild discipline — extra keys can't ride through), clamped to 6; captions coerced to plain strings, control chars stripped, clamped to 80; items with no valid url drop.
  - Junk shapes (non-object, arrays, Symbols, numbers) → `{ portrait:null, cover:null, gallery:[], updatedAt:null }` — never throws (**no `Number()` on anything**).
- Constants exported: `BS_LISTING_GALLERY_MAX = 6`, `BS_LISTING_CAPTION_MAX = 80`.
- Consumers: mobile imports it directly (the `mealPrep.mjs` import path); web pages load it as a native ES module → **`window.ShapeListingLib`** (the `ShapeSetsLib` naming precedent — NOT `ShapeListingMedia`, which is the mobile data-layer global); Node tests import it directly (`tests/listing-media.test.mjs`).
- **Web install order (resolved):** the module loader tag assigns `window.ShapeListingLib` **before DOMContentLoaded — i.e. before babel executes the page scripts** (the `ClientApp.html` `shareCard.mjs` precedent, `<script type="module">import * as L from "/newdesign/listingMedia.mjs"; window.ShapeListingLib = L;</script>` placed with the other module loaders). Belt-and-braces: every web consumer null-guards (`window.ShapeListingLib?.normalize…`) and treats an absent lib as absent media — a stale-cached page degrades to today's card, never a crash.
- **The setter runs it too** before writing, so stored data is already clean — the render-side guard is defense in depth, not the only line.

## Uploads (images only, bounded, opaque keys)

The existing public **`coach-media`** bucket (2026-06-09: owner-scoped `<uid>/…` folders, 200 MB, image+video mimes) — **no new bucket, no new route**. The bucket allows video (plan clips need it), so **the listing editors enforce the listing contract client-side on BOTH surfaces**:

- **Images only** — file-picker `accept="image/*"` AND a pre-upload mime check (`image/jpeg|png|webp|heic|gif`); a video or unknown type is rejected with an honest editor message before any bytes move.
- **≤ 10 MB per image** (editor-enforced; the bucket's 200 MB stays the plan-clip allowance).
- **Opaque storage keys** — `<uid>/listing/<epoch>-<random>.<ext>` on both surfaces; raw filenames never become URLs (review round).
- Dimension checks are deliberately NOT enforced (mime + bytes bound the cost; `object-fit: cover` bounds the render).
- Mobile: `window.ShapeCoachMedia.upload(file)` (`shapeBackend.js:4479`) with the listing checks applied by the sheet before calling it. Web: direct browser upload via `window.shapeDb.client.storage` under the same storage RLS (the `dashboardCommunity.jsx` precedent), same checks, same key scheme.

## The renders

### Mobile (PR A) — `iosAppBroadsheetMarketplace.jsx`

1. **Provider mapping** (`mapSupabaseProvider`, ~line 190): add `listing_media: row.listing_media || null`.
2. **`coachPhoto(c)`** (line 530) — the portrait resolution ladder becomes: normalized `listing_media.portrait` → `c.photo/avatar` → `avatarByUser[owner]` → initials. **An invalid/malicious listing portrait is dropped by the normalizer and resolution FALLS THROUGH the ladder** — it never short-circuits to initials past an existing avatar, and the invalid URL is never rendered (AC 5 asserts each rung). This alone upgrades the Coach-of-the-Week portrait, the featured cells, and THE LISTING's header portrait (all already consume `coachPhoto`/the `photo` prop).
3. **Featured "This week" → the Combo** (lines 762–765): the 2-up `MktCoachCard` grid becomes **stacked full-width `MktComboCard` boxes** (count stays 4):
   - cover band (~64px, the coach's cover, scrim-gradiented) → the portrait (`MktPortrait`) overlapping the band's bottom edge beside serif name + mono `ROLE · TIER · LOC · ✓ VETTED` line → dot-leader `MONTHLY ···· $X` → **THE STUDIO** station head (role tick + mono `THE STUDIO` + ink→role rule + `N PHOTOS`) over a horizontal, swipeable strip of captioned photos (`.bs-hide-scroll`).
   - **The re-layout is deliberate and universal** (the E pick — Codex round): every featured cell renders full-width in the new section, media or not. The **degrade ladder governs a cell's content**: no gallery → no station (storefront form) · no cover either → today's portrait-cell anatomy at full width · no portrait either → initials (today's fallback). Never an empty shelf. AC 1 exempts this section's geometry accordingly.
   - Tap anywhere (incl. a studio photo) → `setOpen(c)` (THE LISTING). Keyboard: the box is one `role="button"` like the COTW block (inner strip scrolls without activating).
4. **THE LISTING** (`BSCoachDetailPublic`, header ~1600–1620): the coach's cover renders as the scrimmed **background** behind the whole header block — eyebrow, portrait, name, register all sit over it (absent → today's ground, byte-identical) — and a **THE STUDIO** station (same head + strip grammar, captions under each photo) lands **between the register block and the coupon**. Absent gallery → the station does not exist.
5. **Want-ad rows (`MktRow`) — D, owner-ruled in:** every row gains a small portrait **thumb** (~30×36, 2px role-color spine on its left edge) between the row number and the name — the D mock's geometry. The thumb resolves through the SAME `coachPhoto` ladder (#2); **no valid photo at any rung → a bordered initials block of identical size**, so the column stays perfectly uniform and a photo-less coach never leaves a gap. The row's dense want-ad anatomy (number · serif name · mono meta · dot leader · rate) is otherwise untouched; like the featured section, the thumb column is a deliberate universal geometry change — content per row still degrades honestly.
6. **Demo cast:** exactly 2 demo coaches (one per role) carry a sample cover + 3-photo gallery (Unsplash interiors — the web demo-cover `mkBg` precedent) so the signed-out preview demonstrates the combo; all other demo coaches render the degrade forms, proving the mixed grid. Signed-in real coaches never inherit demo media.

### Web (PR B)

1. **`mapLiveCoach`** (`marketplace.jsx`): run the row through `ShapeListingLib` (null-guarded per the install-order contract above); map `cover` and prefer the listing portrait over the `get_public_profile` avatar for `photo`. `CoachCard` **already renders `c.cover`** (line 341) and the facet gem already takes `photo` — the directory card lights up with zero card-markup changes. `Marketplace.html` gains the module loader tag (before the babel page scripts).
2. **The living Signal profile** (web coach profile): a **THE STUDIO** station in the coach blocks — fetched from the provider row by owner uid (the `livingShared.jsx:589` monthly_offer fetch precedent), rendered as a captioned strip in the ledger grammar. Absent → nothing. (The profile keeps its own `profile_custom` cover/portrait — this adds only the gallery.)
3. **Editor** — a **"Marketplace listing · photos"** card in `dashProfileExtras.jsx` (beside `CoachCredentialsCard`, rendered on both coach dashboard Profile pages): portrait slot, cover slot, gallery grid (add ≤6, caption ≤80, remove), Save via the coach's own-row provider update on `window.shapeDb.client` — normalizer-sanitized before write, image/size checks before upload.
4. The spotlight/lead cards are demo-structured — out of scope (noted, not silently dropped).

## Editors (mobile, PR A)

- **`BSProListingMediaSheet`** (`iosAppBroadsheetPros.jsx`, both roles, role accent) — the `BSProMonthlyOfferSheet` grammar (line 6673): PORTRAIT slot (upload/replace/remove) · COVER slot · STUDIO GALLERY grid (＋ ADD up to 6, per-photo caption field ≤80, ×) · Save/Cancel. Upload and validation errors surface honestly (no silent drop).
- Practice-shortcuts row directly after **Monthly offer** (line 6938): `Listing photos · Your box on the marketplace — portrait, cover, studio`.
- **Data layer** (`shapeBackend.js`, beside `ShapeCoachOffer` ~3905) — **role-explicit** (review round: an account can hold BOTH provider rows, so `owner_id` alone is ambiguous): `window.ShapeListingMedia = { mine(role), set(role, media) }` — `role` (`'trainer'|'nutritionist'`) names the table; the sheet passes the app shell's own role, so a dual-role coach customizes each listing separately from each app. `mine(role)` reads the own row with **`select('*')`** (the documented migration-safe pattern — an explicit `listing_media` select would 400 pre-migration); `set(role, media)` normalizes then updates the own row, and **branches on the stable unknown-column error codes (`42703`/`PGRST204`)** to surface "not available yet — try again after the update" in the editor (the pre-migration retry-branch precedent). Coach with no provider row yet (application pending) → the sheet says so honestly (the add-client-sheet precedent).

## i18n

**Exactly 13 new keys ×13 locales** (existing namespaces — no new namespace; parity-gated + tr-shadow greps both forms per the standing rules; LLM translations flagged for the standing human review):

| # | Key | English default |
| --- | --- | --- |
| 1 | `marketplace:studio.head` | The studio |
| 2 | `marketplace:studio.photos` | `{count} photos` (ICU plural — `one` forms for ha; one/few/many/other for ru/uk) |
| 3 | `coach:listing.row` | Listing photos |
| 4 | `coach:listing.rowSub` | Your box on the marketplace — portrait, cover, studio |
| 5 | `coach:listing.title` | Listing photos |
| 6 | `coach:listing.portrait` | Portrait · you |
| 7 | `coach:listing.cover` | Cover · your background |
| 8 | `coach:listing.gallery` | Studio gallery · up to {max} |
| 9 | `coach:listing.caption` | Caption |
| 10 | `coach:listing.addPhoto` | ＋ Add photo |
| 11 | `coach:listing.save` | Save listing |
| 12 | `coach:listing.saved` | Listing saved |
| 13 | `coach:listing.unavailable` | Listing photos aren't available yet — try again after the next update. |

## Honesty rules (binding)

- Absence at every level renders today's content — never an empty shelf, never a placeholder image. (The two deliberate, owner-picked geometry exceptions — the featured section's combo layout (E) and the want-ad thumb column (D) — still degrade content honestly per cell/row.)
- Captions are coach-authored text on member screens: plain text (React-escaped), control chars stripped, never truncated into ambiguity — clamped at write with the editor showing the limit.
- Demo media is signed-out/demo-cast only; a real coach's box shows only what that coach set.
- No fabricated counts — `N PHOTOS` is `gallery.length`, the strip shows every photo.

## Build plan (Opus, two PRs, in order)

**PR A — migration + canonical module + mobile.** Tasks: (1) `listingMedia.mjs` (`bsSafeMediaUrl` + `bsNormalizeListingMedia`) + `tests/listing-media.test.mjs` (parsed-URL rejection incl. host-less `https://` · clamp ladders · junk shapes · control-char strip · field-by-field rebuild · updatedAt passthrough) — TDD; (2) migration file + the **live authorization probe** (§Data model); (3) role-explicit `ShapeListingMedia` data layer; (4) `BSProListingMediaSheet` + shortcut row; (5) provider mapping + the `coachPhoto` ladder; (6) `MktComboCard` + featured-section swap + demo samples; (7) the D want-ad row thumbs (ladder-resolved, uniform initials fallback); (8) LISTING cover background + THE STUDIO station; (9) the 13 i18n keys ×13. Migration posted as the raw GitHub link per convention; everything degrades silently until applied.

**PR B — web.** Tasks: (1) module loader on `Marketplace.html` + the coach profile + dashboard profile pages (before page scripts; consumers null-guard); (2) `mapLiveCoach` cover/portrait mapping; (3) living-profile THE STUDIO station; (4) `dashProfileExtras` editor card. No `?v=` sweeps (precompile content-hashes).

**Gates, each PR:** JSX parse · `tsc --noEmit` · full `npm test` · PowerShell `/m/` build (A) · `build-newdesign --check` (B) · LF (`tr -cd '\r'` = 0) · tr-shadow both forms · catalog parity ×13 (A) · adversarial pre-push self-review (bug classes 1–12) · render-mount check on the combo card + editor sheet (hook/TDZ class) · the full 4-step merge gate (CI green on final head · CodeRabbit verdict on final head · Codex present · owner's word never replaces the re-trigger). Review-quota economy: audit whole classes before the first push; batch fixes; re-trigger Codex rarely.

## Acceptance criteria

1. A coach with nothing set renders **byte-identical** to today on: COTW, THE LISTING, the web directory card, and the web profile. Two deliberate, owner-picked geometry changes apply to everyone: the featured section's full-width combo layout (E) and the want-ad rows' thumb column (D) — within both, a media-less coach's cell/row carries today's content (initials thumb, today's cell anatomy) in the new geometry.
2. Portrait only → their face in the featured box (full-width cell form), COTW, LISTING header, the web facet gem, AND their want-ad row thumb; a photo-less coach's row shows the same-size initials block (the thumb column never gaps).
3. \+ cover → the storefront form (mobile), the card's background band (web), AND the scrimmed background behind THE LISTING header — one upload, every background placement.
4. \+ gallery → the full combo box, THE STUDIO on the LISTING, and the web-profile strip — captions rendering as written.
5. **The portrait ladder, per rung:** a hand-crafted `"portrait": "javascript:alert(1)"` is dropped by the normalizer and **never rendered on either surface**; resolution then falls to `c.photo/avatar` if present, else `avatarByUser`, and **initials only when no valid avatar exists at any rung** — tests cover each level. Same scheme rule for cover + gallery URLs.
6. A 7th gallery photo / an 81-char caption / a video file / an 11 MB image cannot be saved from either editor; a hand-written oversized doc renders clamped.
7. The editor write cannot move `verified`/`featured`/`rating` — **proven by the PR A live probe matrix** (§Data model: own-write succeeds · pinned columns hold in the same write · non-owner writes zero rows), cited in the PR body.
8. Signed-out preview shows the combo on exactly the 2 sample demo coaches; the rest show degrade forms (the mixed grid proof).
9. Pre-migration: every surface degrades silently; `mine(role)` (via `select('*')`) returns no-media; `set(role, …)` surfaces the honest "not available yet" line on the stable unknown-column codes — no crash, no raw error. A dual-role coach edits trainer and nutritionist listings independently (each app writes only its own table).

## Out of scope / follow-ons (registered, not silently dropped)

- **The profile-customization wave** — owner-ruled "all" (2026-07-23): P1–P5 + M1–M5, spec'd separately (`2026-07-23-profile-customizations-design.md`, PR #1816); builds follow this wave. THE STUDIO already reaches the web profile via this spec's PR B.
- **Video in the gallery** — the bucket allows video today; v1 is pictures (the owner's ask). The intro-film candidate (P1) is the video door.
- Web spotlight/lead cards (demo-structured) — inherit nothing in v1.
