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

/**
 * ⚠ Never throws. This runs BEFORE the app mounts (see main.jsx) — a throw here
 * is a white screen on every device, with no Sentry initialized to report it.
 * `@sentry/capacitor` does native-bridge work at init time; a bridge call in a
 * context where the native plugin isn't linked (this repo's build is also the
 * pure-browser `/m/` web app, with no Capacitor native runtime at all) is a
 * plausible throw, not a hypothetical one. Sentry SDKs are documented not to
 * throw on `init({dsn:''})`, which is why this isn't the primary defense — but
 * resting a white-screen risk on that guarantee holding, with no code-level
 * net, is exactly the fragility this catch exists to close. A caught failure
 * here means "no error reporting for this session," never "the app doesn't
 * mount" — deliberately swallowed, not re-raised.
 */
export function bsInitSentry() {
  try {
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
  } catch {
    // Swallowed on purpose — see the doc comment above. No error reporting
    // this session, but the app still mounts.
  }
}

/**
 * Apply the user context from a profile object, through the shared, PII-free
 * derivation (id, roles, is_coach only — see src/lib/sentry-context.mjs).
 * Pass null/undefined on sign-out — a stale user mislabels every later event.
 */
export function bsSetSentryUser(profile) {
  Sentry.setUser(bsSentryUser(profile || null));
}
