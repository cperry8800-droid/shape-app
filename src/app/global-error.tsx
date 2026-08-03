'use client';
// Last-resort boundary: mounts only when the ROOT LAYOUT itself crashes, so
// nothing above it survived — it must render its own <html><body> and can
// rely on no stylesheet (hence ErrorCard's inline styles).
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import ErrorCard from '@/components/ErrorCard';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { crash_type: 'boundary' } });
  }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#fff' }}>
        <ErrorCard onRetry={reset} />
      </body>
    </html>
  );
}
