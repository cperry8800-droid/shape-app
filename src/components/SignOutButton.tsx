'use client';

// The Next.js dashboard's sign-out is a SERVER action (login/actions.ts
// logout) — it clears the cookie session and redirects, but no browser code
// runs, so on a shared device it left the origin-wide CacheStorage (which can
// hold cross-origin SIGNED media cached by an older service-worker
// generation) and the localStorage/sessionStorage user-content families
// behind. This client wrapper runs the canonical scrub + PWA cache purge
// (public/newdesign/localScrub.mjs — the same union inventory every other
// sign-out path uses, /m/ and website alike, since all surfaces share this
// origin) BEFORE invoking the server action. The purge is awaited under a
// short bound so a stalled CacheStorage can never hang the sign-out
// (the P1b round-9 rule: sign-out always completes).
import { useState, useEffect } from 'react';
import { logout } from '@/app/login/actions';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- plain .mjs module (allowJs), no declaration file
import { shapeScrubLocalUserContent, shapePurgeShapeCaches, shapeInstallSignOutListener } from '../../public/newdesign/localScrub.mjs';

export default function SignOutButton({ className, children }: { className?: string; children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  // CROSS-TAB SIGN-OUT. This button renders wherever a Next route knows it has
  // a signed-in member, which makes it the natural place to LISTEN as well as
  // to broadcast: without it, signing out on the website or /m/ left an open
  // dashboard tab holding its in-memory state and per-tab sessionStorage for
  // the next person on the device. The classic-script surfaces install the
  // same listener in pageShell.jsx / supabase.js.
  // ⚠ broadcast:false — re-stamping here would echo back to the tab that
  // signed out and the two would scrub each other in a loop.
  useEffect(() => shapeInstallSignOutListener(() => {
    try { shapeScrubLocalUserContent({ broadcast: false }); } catch { /* never block */ }
    // The reload is the authoritative wipe of this document's in-memory state;
    // the tab that signed out already awaited the shared cache purge.
    try { window.location.reload(); } catch { /* nothing else to do */ }
  }), []);
  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      shapeScrubLocalUserContent();
      await Promise.race([shapePurgeShapeCaches(), new Promise((r) => setTimeout(r, 2000))]);
    } catch {
      /* the scrub must never block the sign-out */
    }
    await logout();
  };
  return (
    <button type="button" onClick={onClick} disabled={busy} className={className}>
      {children}
    </button>
  );
}
