// src/lib/radio/http.ts
// Generic adapter: fetch the provider's public now-playing JSON + normalize it.
// Works for any radio-as-a-service whose now-playing keys are covered by the
// normalizer (extend now-playing.mjs key lists if Task 0's doc shows others).
import type { RadioProvider, NowPlaying } from './provider';
import { normalizeNowPlaying } from './now-playing.mjs';

export function httpProvider(nowPlayingUrl: string): RadioProvider {
  return {
    async getNowPlaying(): Promise<NowPlaying> {
      const res = await fetch(nowPlayingUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error(`now-playing ${res.status}`);
      const raw = await res.json();
      return normalizeNowPlaying(raw);
    },
  };
}
