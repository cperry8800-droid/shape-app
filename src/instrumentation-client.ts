// Client-side Sentry, initialised before hydration. Lives in src/ because this
// project uses a src/ folder.
// ⚠ An absent DSN DISABLES the SDK — same contract as the server config. The
// NEXT_PUBLIC_ vars here are baked into the client bundle at build time, so they
// must be readable with no env vars set (empty string, not a crash).
import * as Sentry from '@sentry/nextjs';
import { bsSentryRelease } from '@/lib/sentry-context.mjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || '',
  release: bsSentryRelease({ SHAPE_RELEASE: process.env.NEXT_PUBLIC_SHAPE_RELEASE }),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || 'development',
  tracesSampleRate: 0,
  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
