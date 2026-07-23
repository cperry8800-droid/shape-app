// Profile customizations — the mobile entry point for the canonical guard.
// The normalizer is CANONICAL in public/newdesign/profileCustom.mjs (ONE
// implementation for every surface — the listingMedia / mealPrep precedent);
// this module re-exports it so mobile imports `../services/profileCustom.mjs`
// and Node tests import through here. No mobile-only half.
export {
  BS_WALL_MAX, BS_SHELF_MAX, BS_LINE_MAX, BS_CAPTION_MAX,
  BS_SHELF_TITLE_MAX, BS_SHELF_WHEN_MAX, BS_START_TITLE_MAX,
  bsCleanText, bsProfileLine, bsProfileWall, bsProfileShelf,
  bsValidStartDate, bsStartLineState, bsProfileStartLine, bsNormalizeProfileCustom,
} from '../../../public/newdesign/profileCustom.mjs';
