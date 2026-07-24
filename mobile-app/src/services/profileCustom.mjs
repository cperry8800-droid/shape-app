// Profile customizations — the mobile entry point for the canonical guard.
// The normalizer is CANONICAL in public/newdesign/profileCustom.mjs (ONE
// implementation for every surface — the listingMedia / mealPrep precedent);
// this module re-exports it so mobile imports `../services/profileCustom.mjs`
// and Node tests import through here. No mobile-only half.
export {
  BS_WALL_MAX, BS_SHELF_MAX, BS_LINE_MAX, BS_CAPTION_MAX,
  BS_SHELF_TITLE_MAX, BS_SHELF_WHEN_MAX, BS_START_TITLE_MAX,
  BS_FILM_CAPTION_MAX, BS_BIZ_NAME_MAX, BS_BIZ_WHERE_MAX, BS_BIZ_HOURS_MAX,
  BS_BIZ_HANDLE_MAX, BS_PINNED_REVIEWS_MAX,
  bsCleanText, bsProfileLine, bsProfileWall, bsProfileShelf,
  bsValidStartDate, bsStartLineState, bsProfileStartLine,
  bsProfileFilm, bsProfileBizCard, bsProfilePinnedReviews, bsNormalizeProfileCustom,
} from '../../../public/newdesign/profileCustom.mjs';
