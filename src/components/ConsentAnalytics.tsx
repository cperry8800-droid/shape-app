'use client';

// The Next app's page views (Vercel Web Analytics), only as the visitor's consent allows: the rule
// the website's /consent-insights.js and the remembered first link use (signup-source.mjs). GPC and
// a Reject stop it, an Accept allows it, and with no choice yet the EEA and the UK wait while
// everywhere else counts. Checked on every event, so a choice made on another page holds here.
// ⚠ AND THE BANNER THAT MAKES THE CHOICE (Codex on #2530). Waiting for a choice no Next page could
// make, an EEA or UK visitor who landed on /login or a coach's page was never asked, and neither
// their page views nor the remembered first link (/signup-source.js, in the layout) could start.
// The website's own banner (/consent-banner.js) is loaded here too. The /connect pages are the
// installed app's in-app browser, sent there to sign in to a music service and come back
// (src/lib/integration-handoff.ts): no banner over that sign-in, as no chat button either.
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next';
import { allowedOn } from '@/lib/signup-source.mjs';

export function consentBeforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  if (typeof window === 'undefined') return null;
  return allowedOn(window) ? event : null;
}

export function consentBannerHidden(pathname: string | null | undefined): boolean {
  const p = String(pathname || '');
  return p === '/connect' || p.startsWith('/connect/');
}

export default function ConsentAnalytics() {
  const pathname = usePathname();
  return (
    <>
      <Analytics beforeSend={consentBeforeSend} />
      {consentBannerHidden(pathname) ? null : <Script src="/consent-banner.js" strategy="afterInteractive" />}
    </>
  );
}
