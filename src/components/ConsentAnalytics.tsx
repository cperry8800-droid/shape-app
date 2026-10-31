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
import { useEffect } from 'react';
import Script from 'next/script';
import { useParams, usePathname } from 'next/navigation';
import { computeRoute, pageview } from '@vercel/analytics';
import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next';
import { allowedOn } from '@/lib/signup-source.mjs';

// The page views the check below dropped, by path: on an Accept, only a view that was actually
// dropped is sent again (see recountOnAccept).
const droppedViews = new Set<string>();
function pathOf(url: string): string {
  try {
    return new URL(url, window.location.href).pathname;
  } catch {
    return url;
  }
}

export function consentBeforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  if (typeof window === 'undefined') return null;
  if (allowedOn(window)) return event;
  if (event.type === 'pageview') droppedViews.add(pathOf(event.url));
  return null;
}

// Whether this page's view was dropped, forgetting it as it answers, so it is sent again once.
export function takeDroppedView(path: string): boolean {
  return droppedViews.delete(path);
}

export function consentBannerHidden(pathname: string | null | undefined): boolean {
  const p = String(pathname || '');
  return p === '/connect' || p.startsWith('/connect/');
}

// ⚠ THE PAGE WHERE THE BANNER WAS ACCEPTED WENT UNCOUNTED (Codex on #2530). <Analytics> sends a
// page's view as the page opens, and with no answer yet in the EEA or the UK the check above drops
// it. The website's gate loads Vercel's script on the Accept, so that page counts then. Here, a
// page listens for the answer (the banner's shape:consent event, or another tab's choice) and, if
// the rule allows it by then, sends its view again.
// ⚠ ONLY A VIEW THAT WAS ACTUALLY DROPPED (Codex on #2530). Until Vercel's script loads, the first
// view waits in its queue and is checked when the queue drains: an Accept before then lets that
// view through itself, and sending another counted the page twice. So the view is sent again only
// if the check recorded dropping it, and once (wasDropped forgets it).
export function recountOnAccept(win: Window, allowed: () => boolean, wasDropped: () => boolean, send: () => void): () => void {
  if (allowed()) return () => {};
  const recount = () => {
    if (allowed() && wasDropped()) send();
  };
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key === 'shape.consent.v1') recount();
  };
  win.addEventListener('shape:consent', recount);
  win.addEventListener('storage', onStorage);
  return () => {
    win.removeEventListener('shape:consent', recount);
    win.removeEventListener('storage', onStorage);
  };
}

export default function ConsentAnalytics() {
  const pathname = usePathname();
  const params = useParams();
  // The route by <Analytics>' own computeRoute, from the page's params, so the view lands on the page.
  // A catch-all segment that is absent is undefined in Next's params, and isn't in the path.
  const defined = Object.fromEntries(Object.entries(params ?? {}).filter((e): e is [string, string | string[]] => e[1] !== undefined));
  const route = pathname ? computeRoute(pathname, defined) : null;
  useEffect(() => {
    if (!pathname) return;
    return recountOnAccept(window, () => allowedOn(window), () => takeDroppedView(pathname), () => pageview({ route, path: pathname }));
  }, [pathname, route]);
  return (
    <>
      <Analytics beforeSend={consentBeforeSend} />
      {consentBannerHidden(pathname) ? null : <Script src="/consent-banner.js" strategy="afterInteractive" />}
    </>
  );
}
