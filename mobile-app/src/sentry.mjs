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
        // ⚠ NOT import.meta.env.MODE. Vite sets MODE='production' for EVERY
        // production build regardless of what the artifact is for, so the debug
        // APK, a PR build and a hosted /m/ Vercel preview would all report
        // environment:'production' and their errors would be indistinguishable
        // from live ones — defeating production-only alert filtering. The build
        // that knows what it is passes VITE_SHAPE_ENV: build-m.sh forwards
        // VERCEL_ENV (production|preview|development), android-build.yml sets
        // 'debug'/'production' per job. MODE stays as the last-resort fallback,
        // which is what a local build and (until its vars are wired) the
        // Codemagic iOS build get.
        environment:
          import.meta.env.VITE_SHAPE_ENV || import.meta.env.MODE || 'development',
        tracesSampleRate: 0,
        sendDefaultPii: false,
      },
      SentryReact.init,
    );
  } catch (e) {
    // Swallowed on purpose — see the doc comment above. No error reporting
    // this session, but the app still mounts.
    //
    // ⚠ The warn is NOT decoration. Mobile is the one surface where a broken
    // init and a correctly-inert build are byte-identical in observable
    // behaviour — there is no DSN to miss and no second sink to notice the
    // absence (the website loader warns at all three of its failure points for
    // exactly this reason; callRpc and reportAlerts each have a console sink
    // beside their Sentry call). Without this line, "the SDK threw" and "no DSN
    // configured, working as intended" look the same in devtools.
    console.warn('[shape] Sentry init threw — error tracking is inert for this session.', e);
  }
}

/**
 * Apply the user context from a profile object, through the shared, PII-free
 * derivation (id, roles, is_coach only — see src/lib/sentry-context.mjs).
 * Pass null/undefined on sign-out — a stale user mislabels every later event.
 *
 * `fallbackId` is the authenticated user's id, for the signed-in-but-no-profile
 * state (see `bsSentryUser`). Pass null alongside a null profile on sign-out:
 * an id on its own would keep tagging events with the account that just left.
 *
 * ⚠ Never throws, same house pattern as `bsSentryUser`/`bsSentryRelease`. This is
 * called from inside `getCurrentSession()` (shapeBackend.js), which every surface
 * awaits before it can render a signed-in state — a throw here would break session
 * resolution itself, i.e. the error-tracking layer taking the app down. `bsSentryUser`
 * is already total, so the residual risk is `Sentry.setUser` on a Capacitor bridge
 * that isn't linked; caught and swallowed the same way `bsInitSentry` swallows a
 * failed init. No warn: unlike init, a failure here costs tags on future events, not
 * the whole session's reporting, and this runs on every session resolve.
 */
export function bsSetSentryUser(profile, fallbackId) {
  try {
    Sentry.setUser(bsSentryUser(profile || null, fallbackId || null));
  } catch {
    // No user context on this session's events. Never a failed sign-in.
  }
}
