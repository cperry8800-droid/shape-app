import { Capacitor } from '@capacitor/core';

import './fonts.css';
import './services/shapeBackend.js';
import './services/shapeSignals.js'; // shared dashboard signal engine (window.DashSignals + window.ShapeSignals)
import './services/turnstile.js'; // Cloudflare Turnstile CAPTCHA helper (window.ShapeTurnstile)
import './services/analytics.js'; // fire-and-forget funnel analytics (window.ShapeAnalytics)
import './services/shapeLocale.js'; // window.ShapeLocale — UI locale preference (i18n)
try { window.ShapeAnalytics?.track?.('app_opened', { surface: 'mobile' }); } catch (e) {}

if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('is-native-app');
  document.documentElement.dataset.platform = Capacitor.getPlatform();
}

await import('./broadsheet/index.jsx');
