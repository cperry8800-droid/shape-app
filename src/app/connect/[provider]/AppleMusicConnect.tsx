'use client';

// Apple Music from the installed app (src/lib/integration-handoff.ts). MusicKit's authorize opens a
// sign-in window, which the app's WebView cannot keep, so it runs here in the in-app browser. The
// developer token and the Music-User-Token go through the existing Apple Music routes, which take
// this page's link token (X-Shape-Handoff) in place of a session.

import { useEffect, useState } from 'react';

type MusicKitInstance = { authorize: () => Promise<string>; storefrontId?: string | null };
type MusicKitGlobal = {
  configure: (opts: { developerToken: string; app: { name: string; build: string } }) => Promise<unknown>;
  getInstance: () => MusicKitInstance;
};
declare global {
  interface Window {
    MusicKit?: MusicKitGlobal;
  }
}

let musicKitPromise: Promise<MusicKitGlobal> | null = null;
function loadMusicKit(): Promise<MusicKitGlobal> {
  if (window.MusicKit) return Promise.resolve(window.MusicKit);
  if (musicKitPromise) return musicKitPromise;
  musicKitPromise = new Promise((resolve, reject) => {
    const done = () => (window.MusicKit ? resolve(window.MusicKit) : reject(new Error('Apple Music could not load.')));
    document.addEventListener('musickitloaded', done, { once: true });
    const s = document.createElement('script');
    s.src = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
    s.async = true;
    s.onerror = () => reject(new Error('Apple Music could not load.'));
    document.head.appendChild(s);
  });
  musicKitPromise.catch(() => {
    musicKitPromise = null;
  });
  return musicKitPromise;
}

type Phase = 'loading' | 'ready' | 'working' | 'done' | 'error';

export default function AppleMusicConnect({ handoff }: { handoff: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState('');
  // MusicKit loaded and configured: a failed or cancelled sign-in can be tried again from here.
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const res = await fetch('/api/integrations/apple-music/developer-token', {
          headers: { 'X-Shape-Handoff': handoff },
          cache: 'no-store',
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.developerToken) throw new Error(json.error || 'Apple Music is not set up yet.');
        const MusicKit = await loadMusicKit();
        await MusicKit.configure({ developerToken: json.developerToken, app: { name: 'Shape', build: '1.0.0' } });
        if (on) {
          setConfigured(true);
          setPhase('ready');
        }
      } catch (err) {
        if (!on) return;
        setMessage(err instanceof Error ? err.message : 'Apple Music could not load.');
        setPhase('error');
      }
    })();
    return () => {
      on = false;
    };
  }, [handoff]);

  async function connect() {
    setPhase('working');
    try {
      const music = window.MusicKit!.getInstance();
      // Called from the tap itself, so the browser lets Apple's sign-in window open.
      const musicUserToken = await music.authorize();
      if (!musicUserToken) throw new Error('Apple Music sign-in was cancelled.');
      const res = await fetch('/api/integrations/apple-music/connect', {
        method: 'POST',
        headers: { 'X-Shape-Handoff': handoff, 'Content-Type': 'application/json' },
        body: JSON.stringify({ musicUserToken, storefront: music.storefrontId || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not connect Apple Music.');
      setPhase('done');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not connect Apple Music.');
      setPhase('error');
    }
  }

  if (phase === 'done') {
    return (
      <p role="status" className="text-sm text-teal-300">
        ✓ Apple Music is connected. Close this page to go back to the Shape app.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={connect}
        disabled={!configured || phase === 'working'}
        className="rounded-full border border-teal-400 bg-teal-400 text-neutral-950 px-5 py-2.5 text-sm disabled:opacity-50"
      >
        {phase === 'loading' ? 'Loading Apple Music…' : phase === 'working' ? 'Connecting…' : 'Continue to Apple Music'}
      </button>
      {phase === 'error' && (
        <p role="alert" className="text-sm text-amber-300">
          {message} {configured ? 'Try again, or go back to the Shape app.' : 'Go back to the Shape app and tap Connect again.'}
        </p>
      )}
    </div>
  );
}
