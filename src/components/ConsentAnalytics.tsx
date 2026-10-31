'use client';

// The Next app's page views (Vercel Web Analytics), only as the visitor's consent allows: the rule
// the website's /consent-insights.js and the remembered first link use (signup-source.mjs). GPC and
// a Reject stop it, an Accept allows it, and with no choice yet the EEA and the UK wait while
// everywhere else counts. Checked on every event, so a choice made on another page holds here.
import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next';
import { allowedOn } from '@/lib/signup-source.mjs';

export function consentBeforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  if (typeof window === 'undefined') return null;
  return allowedOn(window) ? event : null;
}

export default function ConsentAnalytics() {
  return <Analytics beforeSend={consentBeforeSend} />;
}
