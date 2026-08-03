'use client';
// Root error boundary for every route segment: a client render crash lands
// here instead of Next's unbranded default page — and gets REPORTED. Without
// this file, boundary-caught crashes on /dashboard and /console reach Sentry
// never (Next's built-in boundary swallows them before window.onerror).
// Namespace import is safe here: this file only ever runs through Next's
// bundler (the node --test landmine does not apply — tests stub this module).
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import ErrorCard from '@/components/ErrorCard';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
    // handled boundary crash — tagged so it stays filterable/alertable
    // despite not counting against the crash-free session rate (spec
    // 2026-08-02, explicit owner call).
    Sentry.captureException(error, { tags: { crash_type: 'boundary' } });
  }, [error]);
  return <ErrorCard onRetry={reset} />;
}
