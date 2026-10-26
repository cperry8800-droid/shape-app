// The "please update" rule: the oldest app version each store may still run.
//
// The installed app carries its screens inside the binary, so an old build keeps calling
// today's server until its owner updates it. When a server change would break a build, raise
// that platform's minimum here, in the same PR. ⚠ Raise it only once that store already offers
// the new version: a minimum above what the App Store or Google Play has live leaves its members
// on a screen whose Update button finds nothing newer (iOS review can lag Android by days, which
// is why each platform has its own).
//
// The version is mobile-app/package.json's `version`, the one number for both stores: the app
// reads it as __SHAPE_VERSION__ (vite.config.ts), Android's versionName reads it
// (android/app/build.gradle) and Codemagic stamps it as the iOS MARKETING_VERSION. The hosted
// /m/ always runs the newest bundle and is never asked. Read by GET /api/app/version, and the app
// obeys only what that answers (BSUpdateGate.jsx).
export const APP_MIN_VERSION = Object.freeze({ ios: '1.0.0', android: '1.0.0' });

// A newer version worth a nudge the member can dismiss; null for none. Same ⚠ as above.
export const APP_RECOMMENDED_VERSION = Object.freeze({ ios: null, android: null });

export const APP_BUNDLE_ID = 'com.theshapecommunity.app';
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${APP_BUNDLE_ID}`;
const PLATFORMS = ['ios', 'android'];

// '1.2.3' or '1.2' → [1, 2, 3] / [1, 2, 0]; anything else is null.
export function parseAppVersion(v) {
  if (typeof v !== 'string') return null;
  const m = /^(\d{1,6})\.(\d{1,6})(?:\.(\d{1,6}))?$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] || 0)] : null;
}

// -1, 0 or 1; null when either side isn't a version.
export function compareAppVersions(a, b) {
  const x = parseAppVersion(a), y = parseAppVersion(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

// 'required' | 'recommended' | 'none'. A platform or version it can't read is 'none': the
// screen locks a member out of the app, so it shows only on a version known to be too old.
export function appUpdateFor(platform, version, { min = APP_MIN_VERSION, recommended = APP_RECOMMENDED_VERSION } = {}) {
  if (!PLATFORMS.includes(platform)) return 'none';
  if (compareAppVersions(version, min[platform]) === -1) return 'required';
  if (recommended[platform] && compareAppVersions(version, recommended[platform]) === -1) return 'recommended';
  return 'none';
}

// The App Store's page for the app, from Apple's public lookup by bundle id. Null until the app
// is live there (the lookup answers no results), or when the lookup fails.
export function appStoreUrlFrom(lookup) {
  const url = lookup && Array.isArray(lookup.results) && lookup.results[0] && lookup.results[0].trackViewUrl;
  return typeof url === 'string' && url.startsWith('https://apps.apple.com/') ? url : null;
}
