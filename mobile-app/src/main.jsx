import { Capacitor } from '@capacitor/core';

import { bsInitSentry } from './sentry.mjs';
import './fonts.css';
import './services/shapeBackend.js';
import './services/shapeSignals.js'; // shared dashboard signal engine (window.DashSignals + window.ShapeSignals)
import './services/turnstile.js'; // Cloudflare Turnstile CAPTCHA helper (window.ShapeTurnstile)
import './services/analytics.js'; // fire-and-forget funnel analytics (window.ShapeAnalytics)
import './services/shapeLocale.js'; // window.ShapeLocale — UI locale preference (i18n)

// First statement of this module's own executable code, so init BEGINS before the
// dynamic import below (which mounts React). Static imports above have already
// evaluated by this point (ES module semantics), so this can't gate THEIR side
// effects — only what follows.
//
// ⚠ It does NOT guarantee the earliest mount-time errors are captured, and the
// comment here used to claim it did. `@sentry/capacitor`'s sdkInit() calls
// NATIVE.initNativeSdk(...).then(() => originalInit(browserOptions)) — the browser
// SDK is initialised inside a PROMISE CALLBACK, so bsInitSentry() returns before any
// client exists, and on native the bridge round-trip can lose the race against the
// dynamic import. The try/catch inside bsInitSentry can't catch a native-bridge
// failure either: it lives in the SDK's own floating promise chain, not in this
// call's stack. What is true: init starts first, the native SDK completes
// asynchronously, and errors thrown in that window may go unreported. Deliberately
// NOT restructured to force synchronous init — that risks the mount path for a
// marginal gain.
//
// Inert with no VITE_SENTRY_DSN, and bsInitSentry() is total (wrapped in try/catch —
// see sentry.mjs) so a synchronous init failure can never stop this line from
// returning and the app from mounting.
bsInitSentry();

try { window.ShapeAnalytics?.track?.('app_opened', { surface: 'mobile' }); } catch (e) {}

if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('is-native-app');
  document.documentElement.dataset.platform = Capacitor.getPlatform();
}

await import('./broadsheet/index.jsx');
