// Coach experience, read the same way by every application surface: the website's form
// (public/newdesign/signup.jsx, which keeps its own copy because it is not a module; a test holds
// it equal), the app's (mobile-app/src/broadsheet/iosAppBroadsheetProviderApply.jsx), Nora's form
// list (src/lib/ai/noraForms.mjs), the apply route and the review console.
//
// ⚠ FIVE YEARS IS SHAPE'S STANDARD, NOT A REFUSAL. Owner, 2026-10-12: "Allow experience 1-4 years
// to be on application and will reviewed and approved 1 by 1", "depends on where they worked,
// what type of experience, etc if under 5 years total", "so dont make it a hard no". An applicant
// below the standard answers two more questions (where they have worked, and what kind of
// experience it is), the application is marked for individual review, and approving it takes a
// reviewer's explicit tick.
//
// Pure: no I/O.

export const EXPERIENCE_STANDARD_YEARS = 5;

export const PROVIDER_EXPERIENCE_OPTIONS = [
  'Less than 1 year',
  '1-2 years',
  '3-4 years',
  '5-7 years',
  '7-10 years',
  '10-15 years',
  '15+ years',
];

/**
 * The fewest years an answer states: "Less than 1 year" is 0, "5-7 years" is 5, "15+ years" is 15.
 * NULL when there is no answer, or none that names a number, so an empty select is never read as
 * a length of experience.
 */
export function experienceYears(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (/less than/i.test(text)) return 0;
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : null;
}

/** TRUE when the answer is below the standard (an application reviewed individually). */
export function belowExperienceStandard(value) {
  const years = experienceYears(value);
  return years !== null && years < EXPERIENCE_STANDARD_YEARS;
}

/**
 * What an application still needs on experience, or '' when it has it all. `answers` are the
 * applicant's `details` (experience_history, experience_type).
 */
export function experienceProblem(value, answers = {}) {
  const years = experienceYears(value);
  if (years === null) return 'Choose your years of professional experience.';
  if (years >= EXPERIENCE_STANDARD_YEARS) return '';
  const filled = (key) => String(answers?.[key] ?? '').trim() !== '';
  if (!filled('experience_history') || !filled('experience_type')) {
    return `With under ${EXPERIENCE_STANDARD_YEARS} years, tell us where you've worked and what type of experience you have, so we can review your application.`;
  }
  return '';
}
