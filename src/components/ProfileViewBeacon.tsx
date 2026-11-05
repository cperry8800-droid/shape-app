'use client';

// One view of a coach's page (/trainers/<id>, /nutritionists/<id>), sent once as the page opens, for
// the Growth funnel's top bar (src/lib/profile-views.mjs). Only as the visitor's consent allows, by
// the rule the Next app's page views use (signup-source.mjs allowedOn: GPC and a Reject stop it, and
// with no choice yet the EEA and the UK wait), and never from a test browser. The body is the
// listing and nothing else; the server leaves out the coach's own visit and counts a day's total.
import { useEffect } from 'react';
import { allowedOn } from '@/lib/signup-source.mjs';

// Once per listing per page load, whatever React re-runs.
const sent = new Set<string>();

export default function ProfileViewBeacon({ role, providerId }: { role: 'trainer' | 'nutritionist'; providerId: number }) {
  useEffect(() => {
    const key = `${role}:${providerId}`;
    if (sent.has(key)) return;
    sent.add(key);
    try {
      if (window.navigator.webdriver === true || !allowedOn(window)) return;
      void fetch('/api/analytics/profile-view', {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, id: providerId }),
      }).catch(() => {});
    } catch {
      /* a view that can't be sent is not counted, and the page is unaffected */
    }
  }, [role, providerId]);
  return null;
}
