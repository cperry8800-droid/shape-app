import { Capacitor } from '@capacitor/core';

import { bsInitSentry } from './sentry.mjs';
import './fonts.css';
import './services/shapeBackend.js';
import './services/shapeSignals.js'; // shared dashboard signal engine (window.DashSignals + window.ShapeSignals)
import './services/turnstile.js'; // Cloudflare Turnstile CAPTCHA helper (window.ShapeTurnstile)
import './services/analytics.js'; // fire-and-forget funnel analytics (window.ShapeAnalytics)
import './services/shapeLocale.js'; // window.ShapeLocale — UI locale preference (i18n)

// First statement of this module's own executable code — runs before the
// dynamic import below (which mounts React), so a crash during mount is
// captured. Static imports above have already evaluated by this point (ES
// module semantics), so this can't gate THEIR side effects — only what
// follows. Inert with no VITE_SENTRY_DSN (see sentry.mjs).
bsInitSentry();

try { window.ShapeAnalytics?.track?.('app_opened', { surface: 'mobile' }); } catch (e) {}

if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('is-native-app');
  document.documentElement.dataset.platform = Capacitor.getPlatform();
}

await import('./broadsheet/index.jsx');
