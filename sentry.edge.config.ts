// Edge-runtime Sentry (middleware/edge routes). The edge runtime initializes
// separately from the Node.js server runtime — see instrumentation.ts.
// ⚠ An absent DSN DISABLES the SDK — that is the supported way to ship this before
// the account exists. Never guard with a conditional import; the module graph must
// stay identical with and without the env var.
import * as Sentry from '@sentry/nextjs';
import { bsSentryRelease } from '@/lib/sentry-context.mjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN || '',
  release: bsSentryRelease(process.env),
  environment: process.env.VERCEL_ENV || 'development',
  tracesSampleRate: 0,
  sendDefaultPii: false,
});
