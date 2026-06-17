'use client';

// Cloudflare Turnstile (CAPTCHA) widget for the Next.js auth forms.
//
// Renders an explicit widget, mirrors the solved token into a hidden
// <input name="captchaToken"> (so it rides the form's FormData into the server
// action), and reports it via onToken so the parent can block submit until a
// challenge is solved. No-op (renders nothing) when no site key is set, so the
// forms keep working pre-activation.
//
// The SITE key is PUBLIC. Defaults to the same key the website uses
// (public/supabase.js); override with NEXT_PUBLIC_TURNSTILE_SITE_KEY.

import { useEffect, useRef } from 'react';

const SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '0x4AAAAAADmrGKVw7Ghzs1gQ';
const SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
    };
  }
}

let loadingPromise: Promise<Window['turnstile']> | null = null;
function loadTurnstile(): Promise<Window['turnstile']> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loadingPromise) return loadingPromise;
  loadingPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('no global'));
    s.onerror = () => {
      loadingPromise = null;
      reject(new Error('turnstile load failed'));
    };
    document.head.appendChild(s);
  });
  return loadingPromise;
}

/** Whether a site key is configured (the widget renders + a token is required). */
export function turnstileEnabled(): boolean {
  return !!SITE_KEY;
}

export default function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const idRef = useRef<string | null>(null);
  const tokenInputRef = useRef<HTMLInputElement>(null);
  // Keep the latest callback without re-rendering the widget.
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!SITE_KEY || !ref.current || idRef.current != null) return;
    let cancelled = false;
    const set = (tok: string) => {
      if (tokenInputRef.current) tokenInputRef.current.value = tok;
      onTokenRef.current(tok);
    };
    loadTurnstile()
      .then((ts) => {
        if (cancelled || !ref.current || !ts) return;
        idRef.current = ts.render(ref.current, {
          sitekey: SITE_KEY,
          callback: (tok: string) => set(tok || ''),
          'expired-callback': () => set(''),
          'error-callback': () => set(''),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!SITE_KEY) return null;
  return (
    <>
      <input type="hidden" name="captchaToken" defaultValue="" ref={tokenInputRef} />
      <div ref={ref} />
    </>
  );
}
