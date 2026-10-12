// The experience rule is shared with the website, Nora's form list and the apply route: five years
// is the standard, and below it the application is reviewed individually, never refused.
export {
  EXPERIENCE_STANDARD_YEARS,
  PROVIDER_EXPERIENCE_OPTIONS,
  belowExperienceStandard,
  experienceProblem,
  experienceYears,
} from '../../../src/lib/provider-experience.mjs';
export const DEFAULT_BACKGROUND_CHECK_PROVIDER = 'checkr';
export const PROVIDER_APPLICATION_FILE_ACCEPT = '.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp';
export const PROVIDER_APPLICATION_MAX_FILE_BYTES = 10 * 1024 * 1024;
// ⚠ THE REAL LIMIT IS THE REQUEST, NOT THE FILE. The files ride the application request through
// /api/apply, and the platform refuses a request body over 4.5 MB before the route runs, with a
// plain-text 413. So the files are held to 4 MB in total, and the route holds the same line.
export const PROVIDER_APPLICATION_MAX_TOTAL_BYTES = 4 * 1024 * 1024;
// What the application says when it cannot reach Shape, or Shape could not take it: nothing is
// lost, because the form keeps every value it holds.
export const PROVIDER_APPLICATION_SEND_FAILED = "We couldn't send your application. Check your connection and try again.";

/** The sentence for files too big to send in one application (the route says the same). */
export function applicationFilesTooLargeMessage(bytes) {
  const mb = (Math.ceil(Number(bytes || 0) / (1024 * 1024 / 10)) / 10).toFixed(1);
  return `Your files add up to ${mb} MB; the limit for one application is 4 MB in total. Attach a smaller scan or fewer files.`;
}
