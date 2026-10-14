// Which first-run step a signed-in member sees, if any (client-onboarding review, fix 2).
// Pure, so tests/first-run-steps.test.mjs drives the client app's own rule.
//
// The steps, in order:
//   - 'intent': "What brings you here?" (the goal), once, keyed on client_onboarding.intentSeen;
//   - 'coaching': "Are you looking for personal coaching?", once, keyed on
//     client_onboarding.wantsCoaching being answered (true or false);
//   - 'health': the health screening, ONLY for a member who said yes and has not completed it.
//
// ⚠ ONLY A YES IS SCREENED. The screening was required of every account, so a member who only
// wanted the app answered heart, medication and pregnancy questions that no coach would ever read.
// A member who said no is screened when they hire a coach (fix 2b) instead.
//
// ⚠ A COMPLETED SCREENING ENDS THE STEPS. A member who already completed it (every account before
// this, as the screening was required) is not asked the coaching question either: the answer
// would decide nothing for them.
//
// `onboarding` is the client_onboarding document ({} when none is stored); `health` is the
// health_profile document, or null when none is stored. A caller whose read FAILED does not call
// this: it shows no step (an answer on file could be overwritten), and asks again next time.

/** 'intent' | 'coaching' | 'health' | 'ok' */
export function bsFirstRunStage(onboarding, health) {
  const onb = onboarding && typeof onboarding === 'object' ? onboarding : {};
  if (!onb.intentSeen) return 'intent';
  if (health && health.consentAt) return 'ok';
  if (typeof onb.wantsCoaching !== 'boolean') return 'coaching';
  return onb.wantsCoaching ? 'health' : 'ok';
}

/** Whether the website sign-up's answers may still be waiting to be written (POST /api/me/onboarding). */
export function bsFirstRunNeedsSeed(onboarding) {
  const onb = onboarding && typeof onboarding === 'object' ? onboarding : {};
  return !onb.seededAt && (!onb.intentSeen || typeof onb.wantsCoaching !== 'boolean');
}
