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

import { useEffect, useRef, useState } from 'react';

const SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '0x4AAAAAADmrGKVw7Ghzs1gQ';
const SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
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

/**
 * One token with no form around it: Nora's bot check on a visitor's first question.
 * The widget shows only if Cloudflare needs an interaction, in a small card above the
 * page, and is removed once it answers. '' when there is no key, no script, or no
 * answer in 60 s.
 */
export function solveTurnstile(): Promise<string> {
  if (!SITE_KEY || typeof document === 'undefined') return Promise.resolve('');
  return loadTurnstile()
    .then((ts) => new Promise<string>((resolve) => {
      if (!ts) { resolve(''); return; }
      const host = document.createElement('div');
      host.setAttribute('data-nora-check', '');
      host.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:2147483646;';
      document.body.appendChild(host);
      let id: string | null = null;
      let done = false;
      const finish = (tok: string) => {
        if (done) return;
        done = true;
        try { if (id != null) ts.remove(id); } catch {}
        host.remove();
        resolve(tok || '');
      };
      try {
        id = ts.render(host, {
          sitekey: SITE_KEY,
          appearance: 'interaction-only',
          callback: (tok: string) => finish(tok),
          'error-callback': () => finish(''),
          'expired-callback': () => finish(''),
        });
      } catch { finish(''); }
      setTimeout(() => finish(''), 60000);
    }))
    .catch(() => '');
}

/** Whether a site key is configured (the widget renders + a token is required). */
export function turnstileEnabled(): boolean {
  return !!SITE_KEY;
}

export default function Turnstile({
  onToken,
  onUnavailable,
}: {
  onToken: (token: string) => void;
  /** Called when the widget can't load at all, so the parent can stop gating
   *  the submit button (degrade open) instead of stranding the user. */
  onUnavailable?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const idRef = useRef<string | null>(null);
  const tokenInputRef = useRef<HTMLInputElement>(null);
  const [failed, setFailed] = useState(false);
  // Keep the latest callbacks without re-rendering the widget.
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;

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
      .catch(() => {
        // Script couldn't load (CSP block, offline, Cloudflare outage). Don't
        // leave the form stuck on a disabled "Confirming you're human…" button —
        // surface it and let the parent degrade open.
        if (cancelled) return;
        setFailed(true);
        onUnavailableRef.current?.();
      });
    return () => {
      cancelled = true;
      // Destroy the widget so a remount / route change doesn't leak it.
      if (idRef.current != null) {
        window.turnstile?.remove(idRef.current);
        idRef.current = null;
      }
    };
  }, []);

  if (!SITE_KEY) return null;
  if (failed) {
    return (
      <div className="text-xs text-neutral-400 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
        <span>Couldn’t load the human-check.</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="text-teal-400 hover:text-teal-300 underline underline-offset-2"
        >
          Reload
        </button>
      </div>
    );
  }
  return (
    <>
      <input type="hidden" name="captchaToken" defaultValue="" ref={tokenInputRef} />
      <div ref={ref} />
    </>
  );
}
