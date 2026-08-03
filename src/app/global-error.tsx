'use client';
// Last-resort boundary: mounts only when the ROOT LAYOUT itself crashes, so
// nothing above it survived — it must render its own <html><body> and can
// rely on no stylesheet (hence ErrorCard's inline styles).
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import ErrorCard from '@/components/ErrorCard';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Server-originated errors already reached Sentry through
    // `onRequestError` (src/instrumentation.ts) WITH their real stack. Next
    // redacts what it hands the browser to a generic message + `digest`, so
    // capturing again here would file one indistinguishable duplicate per
    // server error — and they would all group into a single issue carrying
    // `crash_type: 'boundary'`, swamping the very filter that tag exists to
    // provide. `digest` is present only on server-originated errors, so this
    // is the seam between "already reported upstream" and "browser-only
    // crash nothing else can see."
    if (error.digest) return;
    Sentry.captureException(error, { tags: { crash_type: 'boundary' } });
  }, [error]);
  return (
    <html lang="en">
      {/* This page replaces the document outright — the root layout crashed, so
          nothing rendered its <head>. Without a viewport meta a phone lays the
          page out at ~980px CSS width and zooms out, making the true
          last-resort card the one page that is unreadable on the device where
          it matters most. */}
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Something went wrong</title>
      </head>
      <body style={{ margin: 0, background: '#fff' }}>
        <ErrorCard onRetry={reset} />
      </body>
    </html>
  );
}
