// The experience rule is shared with the website, Nora's form list and the apply route: five years
// is the standard, and below it the application is reviewed individually, never refused.
export {
  EXPERIENCE_STANDARD_YEARS,
  PROVIDER_EXPERIENCE_OPTIONS,
  belowExperienceStandard,
  experienceProblem,
  experienceYears,
} from '../../../src/lib/provider-experience.mjs';
// The application's documents: categories, limits and the check, shared with the website (its
// mirror), the upload-links route, /api/apply and the review console. Since 2026-10-12 the files
// go straight to storage through /api/apply/uploads, so the old 4 MB request cap is gone.
export {
  APPLICATION_FILE_ACCEPT,
  APPLICATION_FILE_KINDS,
  APPLICATION_MAX_FILE_BYTES,
  APPLICATION_MAX_TOTAL_BYTES,
  applicationFilesProblem,
} from '../../../src/lib/application-files.mjs';
export const DEFAULT_BACKGROUND_CHECK_PROVIDER = 'checkr';
// What the application says when it cannot reach Shape, or Shape could not take it: nothing is
// lost, because the form keeps every value it holds.
export const PROVIDER_APPLICATION_SEND_FAILED = "We couldn't send your application. Check your connection and try again.";
