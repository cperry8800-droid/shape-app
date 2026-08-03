'use client';
// Deliberate crash trigger for the post-DSN e2e Sentry gate (spec 2026-08-02).
// Lives INSIDE the gated /dashboard segment: the layout redirects anonymous
// visitors to /login, so crawlers can't hit this and burn Sentry quota.
//
// The throw is armed AFTER hydration (state flip in an effect) on purpose: a
// direct render throw would fire during SSR and be captured as a SERVER
// error — the point of this page is the BROWSER boundary path (error.tsx).
import { useEffect, useState } from 'react';

export default function CrashTest() {
  const [armed, setArmed] = useState(false);
  useEffect(() => { setArmed(true); }, []);
  if (armed) throw new Error('Deliberate crash test (web boundary)');
  return <p style={{ padding: 24 }}>Arming crash test…</p>;
}
