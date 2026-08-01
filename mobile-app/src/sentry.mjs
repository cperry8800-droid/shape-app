// Sentry for the /m/ broadsheet. Capacitor wraps a WebView, so this is the browser
// SDK on a thin native layer — NOT React Native. Capacitor pairs the native layer
// with @sentry/react (via @sentry/capacitor's second init arg); that's the
// documented setup, not a workaround.
//
// ⚠ Inert without a DSN, deliberately: this ships before the Sentry org exists.
// Sentry.init({dsn:''}) disables the SDK outright — relied on here, not a
// conditional import, so the module is always safe to import and call.
import * as Sentry from '@sentry/capacitor';
import * as SentryReact from '@sentry/react';

import { bsSentryUser } from '../../src/lib/sentry-context.mjs';

export function bsInitSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN || '';
  Sentry.init(
    {
      dsn,
      release: import.meta.env.VITE_SHAPE_RELEASE || undefined,
      environment: import.meta.env.MODE || 'development',
      tracesSampleRate: 0,
      sendDefaultPii: false,
    },
    SentryReact.init,
  );
}

/**
 * Apply the user context from a profile object, through the shared, PII-free
 * derivation (id, roles, is_coach only — see src/lib/sentry-context.mjs).
 * Pass null/undefined on sign-out — a stale user mislabels every later event.
 */
export function bsSetSentryUser(profile) {
  Sentry.setUser(bsSentryUser(profile || null));
}
