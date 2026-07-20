// Mobile entry for live workout progress. The pure payload/validator half is
// CANONICAL in public/newdesign/liveProgress.mjs (the shareCard.mjs pattern —
// one implementation for mobile + website). bsLiveAudience stays HERE because
// it imports workoutShare.mjs, which is not on the web path — and the web
// never resolves an audience (that is the writer's job).
export {
  bsLiveProgressPayload,
  bsCookingPayload,
  bsLiveCoachPayload,
  bsValidLiveCoachPayload,
  bsShouldPushProgress,
  bsValidLivePayload,
} from '../../../public/newdesign/liveProgress.mjs';
import { bsWorkoutSharePrivacy } from './workoutShare.mjs';

// Audience = the member's own share rule. 'private' → null → the caller
// writes NOTHING (absence, not filtering). A FAILED settings read is null
// too (fail closed — the #1613 lesson).
export function bsLiveAudience(settingsDoc, readFailed) {
  if (readFailed) return null;
  const tier = bsWorkoutSharePrivacy(settingsDoc);
  return tier === 'private' ? null : tier;
}
