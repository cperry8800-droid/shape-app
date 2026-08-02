// Client-side Sentry, initialised before hydration. Lives in src/ because this
// project uses a src/ folder.
// ⚠ An absent DSN DISABLES the SDK — same contract as the server config. The
// NEXT_PUBLIC_ vars here are baked into the client bundle at build time, so they
// must be readable with no env vars set (empty string, not a crash).
import * as Sentry from '@sentry/nextjs';

// ⚠ DO NOT ADD A `release` KEY HERE. `withSentryConfig` resolves the release at
// build time (`getSentryRelease()` → Vercel's VERCEL_GIT_COMMIT_SHA, else
// `git rev-parse HEAD`) and injects it as `process.env._sentryRelease`, which
// `@sentry/nextjs`'s own `init()` reads as its default. That default is spread
// FIRST and the user options spread LAST — so an own `release` key whose value
// is `undefined` (e.g. from an env var nobody set) does not "fall through", it
// CLOBBERS the injected SHA and the browser surface loses its release entirely.
// Omitting the key is strictly better: the git SHA applies for free and the
// browser correlates with server and mobile on the same deploy.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || '',
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || 'development',
  tracesSampleRate: 0,
  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
