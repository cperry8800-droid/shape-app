// Reading the server's "please update" answer (GET /api/app/version; the rule is
// src/lib/app-version.mjs). Pure, so tests/app-version.test.mjs runs it as it ships.
import { PLAY_STORE_URL } from '../../../src/lib/app-version.mjs';

// How long a check stands before coming back to the app asks again.
export const BS_UPDATE_RECHECK_MS = 60 * 60 * 1000;
// The recommended version a member last dismissed; its nudge stays away until a newer one.
export const BS_UPDATE_DISMISSED_KEY = 'shape.updateDismissed';

export function bsAppVersionPath(platform, version) {
  return `/api/app/version?platform=${encodeURIComponent(platform)}&version=${encodeURIComponent(version)}`;
}

// ⚠ ONLY AN EXPLICIT 'required' LOCKS THE APP. A failed request, an answer that isn't JSON or a
// shape this build doesn't know all read as 'none': the screen stands between a member and
// everything, so it must never show on its own uncertainty (the date-of-birth gate's rule).
export function bsAppUpdateFrom(answer) {
  const none = { update: 'none', storeUrl: '', recommendedVersion: '' };
  if (!answer || typeof answer !== 'object') return none;
  const update = answer.update === 'required' || answer.update === 'recommended' ? answer.update : 'none';
  if (update === 'none') return none;
  const storeUrl = typeof answer.storeUrl === 'string' && answer.storeUrl.startsWith('https://') ? answer.storeUrl : '';
  const recommendedVersion = typeof answer.recommendedVersion === 'string' ? answer.recommendedVersion : '';
  // A nudge with no version can't be remembered as dismissed, so it would come back on every
  // launch; it isn't shown.
  if (update === 'recommended' && !recommendedVersion) return none;
  return { update, storeUrl, recommendedVersion };
}

// The store page to open: the server's, else Google Play's page, or on an iPhone the App Store
// page from the id Codemagic baked into the build. Empty when an iPhone knows neither (the app
// isn't live on the App Store yet), and the screen then names the store instead.
export function bsStoreUrl(platform, fromServer, appStoreId) {
  if (fromServer) return fromServer;
  if (platform === 'android') return PLAY_STORE_URL;
  if (platform === 'ios' && /^\d{6,12}$/.test(String(appStoreId || ''))) return `https://apps.apple.com/app/id${appStoreId}`;
  return '';
}
