// Registers Sentry for the Node.js and edge server runtimes. Lives in src/ because
// this project uses a src/ folder — Next resolves instrumentation.ts from there.
// The imported configs live at the repo root; see sentry.server.config.ts for why
// an absent DSN is the supported, inert default.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('../sentry.server.config');
  if (process.env.NEXT_RUNTIME === 'edge') await import('../sentry.edge.config');
}

export { captureRequestError as onRequestError } from '@sentry/nextjs';
