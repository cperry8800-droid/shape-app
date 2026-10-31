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
  BS_LOOK_PAPERS, BS_LOOK_ACCENTS, BS_LOOK_FOCUS, bsProfileLook, bsProfileCover,
  BS_STUDIO_TYPES, BS_STUDIO_KINDS, BS_STUDIO_W, BS_STUDIO_H, BS_STUDIO_ITEMS_MAX, BS_STUDIO_STATIONS_MAX,
  BS_STUDIO_WHERE_MAX, BS_STUDIO_LABEL_MAX, BS_STATION_TITLE_MAX, BS_STATION_NOTE_MAX, BS_STATION_PINS_MAX, bsStudioItem, bsProfileStudio,
  BS_KITCHEN_RULES_MAX, BS_KITCHEN_RULE_MAX, BS_KITCHEN_STAPLES_MAX, BS_STAPLE_MAX, BS_STAPLE_GROUPS,
  BS_KITCHEN_RECIPES_MAX, BS_RECIPE_TITLE_MAX, BS_RECIPE_NOTE_MAX, BS_RECIPE_INGS_MAX, BS_RECIPE_ING_MAX, BS_RECIPE_QTY_MAX,
  BS_RECIPE_STEPS_MAX, BS_RECIPE_STEP_MAX, BS_RECIPE_NUMS, bsKitchenPlate, bsKitchenRecipeItem, bsProfileKitchen,
  BS_PIN_KINDS, BS_PROFILE_PROMPTS, BS_COACH_PROMPTS,
  bsPinKindLabel, bsPinKindToken, bsPromptLabel, bsPromptToken,
  BS_ABOUT_STORY_MAX, BS_ABOUT_FACT_MAX, BS_ABOUT_YEARS_MAX, BS_ABOUT_HOW, BS_PROFILE_LINK_KEYS, BS_LINK_MAX,
  BS_PROMPTS_MAX, BS_PROMPT_Q_MAX, BS_PROMPT_A_MAX, bsCleanStory, bsProfileAbout, bsProfileLinks, bsProfilePrompts, bsProfileLinkHref, bsProfileLinkText,
} from '../../../public/newdesign/profileCustom.mjs';
