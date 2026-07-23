# Coach listing media — the customized marketplace box ("E · The Combo")

**Date:** 2026-07-23 · **Status:** OWNER-PICKED — concept board round complete, build queued for Opus
**Owner rulings (2026-07-23):** coaches customize their marketplace box on web AND app with pictures of themselves + their personal business ("yes do E, this is for marketplace"). Concept **E — The Combo** (box + studio in one) is the picked look. **D (want-ad row thumbs) was offered and NOT picked** — the dense classifieds rows stay pure type unless the owner later says otherwise. Written on Fable, built on Opus (the standing split).

---

## Why

A coach's box is their storefront, and today it's almost entirely Shape-authored: real coaches get only their profile avatar into the marketplace cell, the cover band on the website card exists **only for the demo cast**, and photos of a coach's actual business — their gym floor, their kitchen, their studio — have no home anywhere. Coaches sell with their face and their space; the box should carry both.

## The three slots (coach-managed, all optional)

| Slot | What it is | Bounds |
| --- | --- | --- |
| `portrait` | A photo of the coach themselves | one http(s) URL |
| `cover` | The **background picture** — rendered behind the box on both surfaces and as the scrimmed backdrop behind THE LISTING's header | one http(s) URL |
| `gallery` | Photos of their business/space | ≤ **6** items `{url, caption?}`, caption ≤ **80** chars |

**Nothing set → nothing changes.** Every render site degrades to today's exact output. The portrait is *of the coach*; the gallery is *their space* — labels keep them distinct.

## Data model

One new jsonb column on both provider tables — the exact `monthly_offer` precedent (2026-07-09):

```sql
-- supabase-migrations/2026-07-23-provider-listing-media.sql
-- Coach-authored marketplace-box media (spec 2026-07-23 — "E · The Combo").
-- Shape: { "portrait": url|null, "cover": url|null,
--          "gallery": [{ "url": url, "caption": text (<=80) }] (<=6),
--          "updatedAt": ISO }
-- Limits + http(s)-only URLs enforced by the canonical normalizer at BOTH the
-- write path and every render path (public/newdesign/listingMedia.mjs); plain
-- text captions only (rendered as text, never HTML).
-- Both provider tables are already public-read for the marketplace, so every
-- surface reads this with zero new endpoints; writes go through the coach's
-- existing owner-scoped provider-row update path. Idempotent; safe to re-run.

alter table if exists public.trainers
  add column if not exists listing_media jsonb;

alter table if exists public.nutritionists
  add column if not exists listing_media jsonb;
```

**Why this clears every guard (verified against live migrations, 2026-07-23):**
- `guard_provider_admin_columns` (2026-06-25) pins an **enumerated blocklist** (`verified, verified_at, featured, rating, subscribers, sort_order, *_of_month`) — `listing_media` is not on it, so the coach's own-row UPDATE passes, exactly as `monthly_offer` does today (`shapeBackend.js:3905` documents this contract).
- Provider rows are public-read; the mobile marketplace (`client.from('trainers').select('*')`) and the web marketplace (`cl.from(table).select("*")`, `marketplace.jsx` `useLiveCoaches`) both already select `*`, so the column rides through with **zero query changes** and is migration-safe pre-apply (absent column → absent key → normalizer returns empty).
- `publishProviderRow` (approval re-publish) doesn't touch unrelated columns, so re-approval never clobbers a coach's media (the `verified` precedent).

## One implementation — the canonical normalizer

**New `public/newdesign/listingMedia.mjs`** (the canonical-module pattern: `varianceBand.mjs` / `noraSets.mjs` / `mealPrep.mjs`):

- `bsNormalizeListingMedia(raw)` → `{ portrait, cover, gallery }` — the ONE gate every consumer runs raw row data through:
  - URLs must match `^https?://` (≤ 500 chars) or the field drops — a hand-crafted row UPDATE can never inject a `javascript:`/`data:` scheme into someone else's screen (the `safeMusicUrl` class).
  - `gallery` rebuilt **field-by-field** (the coach-channel per-item rebuild discipline — extra keys can't ride through), clamped to 6; captions coerced to plain strings, control chars stripped, clamped to 80.
  - Junk shapes (non-object, arrays, Symbols, numbers) → `{ portrait:null, cover:null, gallery:[] }` — never throws (coerce via the safe-coercion discipline; **no `Number()` on anything**).
- Constants exported: `BS_LISTING_GALLERY_MAX = 6`, `BS_LISTING_CAPTION_MAX = 80`.
- Consumers: mobile imports it directly (the `mealPrep.mjs` import path); web pages load it as a native ES module → **`window.ShapeListingLib`** (the `ShapeSetsLib` naming precedent — NOT `ShapeListingMedia`, which is the mobile data-layer global); Node tests import it directly (`tests/listing-media.test.mjs`).
- **The setter runs it too** before writing, so stored data is already clean — the render-side guard is defense in depth, not the only line.

## Uploads

The existing public **`coach-media`** bucket (2026-06-09: owner-scoped `<uid>/…` folders, image mimes, 200 MB) — **no new bucket, no new route**.
- Mobile: the existing `window.ShapeCoachMedia.upload(file)` → `{url, type, name}` (`shapeBackend.js:4479`).
- Web: direct browser upload via `window.shapeDb.client.storage` under the same storage RLS (the `dashboardCommunity.jsx` photo-upload precedent), path `<uid>/listing/<ts>-<name>`.

## The renders

### Mobile (PR A) — `iosAppBroadsheetMarketplace.jsx`

1. **Provider mapping** (`mapSupabaseProvider`, ~line 190): add `listing_media: row.listing_media || null`.
2. **`coachPhoto(c)`** (line 530) preference becomes: normalized `listing_media.portrait` → `c.photo/avatar` → `avatarByUser[owner]` → initials. This alone upgrades the Coach-of-the-Week portrait, the featured cells, and THE LISTING's header portrait (all already consume `coachPhoto`/the `photo` prop).
3. **Featured "This week" → the Combo** (lines 762–765): the 2-up `MktCoachCard` grid becomes **stacked full-width `MktComboCard` boxes** (count stays 4):
   - cover band (~64px, the coach's cover, scrim-gradiented) → the portrait (`MktPortrait`) overlapping the band's bottom edge beside serif name + mono `ROLE · TIER · LOC · ✓ VETTED` line → dot-leader `MONTHLY ···· $X` → **THE STUDIO** station head (role tick + mono `THE STUDIO` + ink→role rule + `N PHOTOS`) over a horizontal, swipeable strip of captioned photos (`.bs-hide-scroll`).
   - **Degrade ladder (structural, per coach):** no gallery → no station (storefront form) · no cover either → today's portrait-cell geometry at full width · no portrait either → initials (today's fallback). Never an empty shelf.
   - Tap anywhere (incl. a studio photo) → `setOpen(c)` (THE LISTING). Keyboard: the box is one `role="button"` like the COTW block (inner strip scrolls without activating).
4. **THE LISTING** (`BSCoachDetailPublic`, header ~1600–1620): the coach's cover renders as the scrimmed **background** behind the whole header block — eyebrow, portrait, name, register all sit over it (absent → today's ground, byte-identical) — and a **THE STUDIO** station (same head + strip grammar, captions under each photo) lands **between the register block and the coupon**. Absent gallery → the station does not exist.
5. **Want-ad rows (`MktRow`) untouched** — D was not picked.
6. **Demo cast:** exactly 2 demo coaches (one per role) carry a sample cover + 3-photo gallery (Unsplash interiors — the web demo-cover `mkBg` precedent) so the signed-out preview demonstrates the combo; all other demo coaches render the degrade forms, proving the mixed grid. Signed-in real coaches never inherit demo media.

### Web (PR B)

1. **`mapLiveCoach`** (`marketplace.jsx`): run the row through `ShapeListingLib`; map `cover` and prefer the listing portrait over the `get_public_profile` avatar for `photo`. `CoachCard` **already renders `c.cover`** (line 341) and the facet gem already takes `photo` — the directory card lights up with zero card-markup changes. `Marketplace.html` gains the module loader tag.
2. **The living Signal profile** (web coach profile): a **THE STUDIO** station in the coach blocks — fetched from the provider row by owner uid (the `livingShared.jsx:589` monthly_offer fetch precedent), rendered as a captioned strip in the ledger grammar. Absent → nothing. (The profile keeps its own `profile_custom` cover/portrait — this adds only the gallery.)
3. **Editor** — a **"Marketplace listing · photos"** card in `dashProfileExtras.jsx` (beside `CoachCredentialsCard`, rendered on both coach dashboard Profile pages): portrait slot, cover slot, gallery grid (add ≤6, caption ≤80, remove), Save via the coach's own-row provider update on `window.shapeDb.client` — normalizer-sanitized before write.
4. The spotlight/lead cards are demo-structured — out of scope (noted, not silently dropped).

## Editors (mobile, PR A)

- **`BSProListingMediaSheet`** (`iosAppBroadsheetPros.jsx`, both roles, role accent) — the `BSProMonthlyOfferSheet` grammar (line 6673): PORTRAIT slot (upload/replace/remove) · COVER slot · STUDIO GALLERY grid (＋ ADD up to 6, per-photo caption field ≤80, ×) · Save/Cancel. Upload errors surface honestly (no silent drop).
- Practice-shortcuts row directly after **Monthly offer** (line 6938): `Listing photos · Your box on the marketplace — portrait, cover, studio`.
- **Data layer** (`shapeBackend.js`, beside `ShapeCoachOffer` ~3905): `window.ShapeListingMedia = { mine, set }` — `mine()` reads `id, listing_media` by `owner_id`; `set(media)` normalizes then updates the own row. Coach with no provider row yet (application pending) → the sheet says so honestly (the add-client-sheet precedent).

## i18n

New keys ×13, both registered namespaces (no new namespace): `marketplace:studio.head` ("The studio"), `marketplace:studio.photos` (`{count} photos`, ICU plural incl. `one` forms for ha + one/few/many/other for ru/uk), and ~10 `coach:listing.*` editor keys. Parity gate + tr-shadow greps (both forms) per the standing i18n rules; LLM translations flagged for the standing human review.

## Honesty rules (binding)

- Absence at every level renders today's output exactly — never an empty shelf, never a placeholder image.
- Captions are coach-authored text on member screens: plain text (React-escaped), control chars stripped, never truncated into ambiguity — clamped at write with the editor showing the limit.
- Demo media is signed-out/demo-cast only; a real coach's box shows only what that coach set.
- No fabricated counts — `N PHOTOS` is `gallery.length`, the strip shows every photo.

## Build plan (Opus, two PRs, in order)

**PR A — migration + canonical module + mobile.** Tasks: (1) `listingMedia.mjs` + `tests/listing-media.test.mjs` (scheme rejection · clamp ladders · junk shapes · control-char strip · field-by-field rebuild) — TDD; (2) migration file; (3) `ShapeListingMedia` data layer; (4) `BSProListingMediaSheet` + shortcut row; (5) provider mapping + `coachPhoto` preference; (6) `MktComboCard` + featured-section swap + demo samples; (7) LISTING cover band + THE STUDIO station; (8) i18n keys ×13. Migration posted as the raw GitHub link per convention; everything degrades silently until applied.

**PR B — web.** Tasks: (1) module loader on `Marketplace.html` + the coach profile + dashboard profile pages; (2) `mapLiveCoach` cover/portrait mapping; (3) living-profile THE STUDIO station; (4) `dashProfileExtras` editor card. No `?v=` sweeps (precompile content-hashes).

**Gates, each PR:** JSX parse · `tsc --noEmit` · full `npm test` · PowerShell `/m/` build (A) · `build-newdesign --check` (B) · LF (`tr -cd '\r'` = 0) · tr-shadow both forms · catalog parity ×13 (A) · adversarial pre-push self-review (bug classes 1–12) · render-mount check on the combo card + editor sheet (hook/TDZ class) · the full 4-step merge gate (CI green on final head · CodeRabbit verdict on final head · Codex present · owner's word never replaces the re-trigger). Review-quota economy: audit whole classes before the first push; batch fixes; re-trigger Codex rarely.

## Acceptance criteria

1. A coach with nothing set renders **byte-identical** to today on: mobile featured cells, COTW, want-ad rows, THE LISTING, web directory card, web profile.
2. Portrait only → their face in the featured box (full-width cell form), COTW, LISTING header, and the web facet gem.
3. \+ cover → the storefront form (mobile), the card's background band (web), AND the scrimmed background behind THE LISTING header — one upload, every background placement.
4. \+ gallery → the full combo box, THE STUDIO on the LISTING, and the web-profile strip — captions rendering as written.
5. A hand-crafted row with `"portrait": "javascript:alert(1)"` renders the initials fallback on BOTH surfaces (normalizer drops it); same for gallery URLs.
6. A 7th gallery photo / an 81-char caption cannot be saved from either editor, and a hand-written oversized doc renders clamped.
7. The editor write cannot move `verified`/`featured`/`rating` (column guard holds — probe in review).
8. Signed-out preview shows the combo on exactly the 2 sample demo coaches; the rest show degrade forms (the mixed grid proof).
9. Pre-migration, every surface + both editors degrade silently (editor reads "unavailable", never a crash).

## Out of scope / follow-ons (registered, not silently dropped)

- **D · want-ad row thumbs** — offered, not picked; one-line revisit if the owner wants faces on the dense rows.
- **The profile-customization wave** (owner, 2026-07-23: "can we add more customizations to actual profile as well?" — yes): board section 05 offers **P1 intro film · P2 the Line · P3 philosophy prompts · P4 business card · P5 wins wall**; picks feed a second spec after the box ships. THE STUDIO already reaches the profile via this spec's PR B.
- **Video in the gallery** — the bucket allows video today; v1 is pictures (the owner's ask). The intro-film candidate (P1) is the video door.
- Web spotlight/lead cards (demo-structured) — inherit nothing in v1.
