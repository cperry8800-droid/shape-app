// Coach listing media — the mobile entry point for the canonical guard.
//
// The normalizer + URL gates are CANONICAL in
// public/newdesign/listingMedia.mjs (ONE implementation for every surface — the
// mealPrep / varianceBand split precedent); this module just re-exports them so
// mobile code imports `../services/listingMedia.mjs` and Node tests import
// through here. There is no mobile-only half — the whole contract is
// dependency-free and web-servable, so nothing is added here.

export {
  BS_SUPABASE_HOST, BS_LISTING_GALLERY_MAX, BS_LISTING_CAPTION_MAX,
  bsSafeMediaUrl, bsOwnMediaUrl, bsNormalizeListingMedia,
} from '../../../public/newdesign/listingMedia.mjs';
