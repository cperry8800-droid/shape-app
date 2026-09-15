// src/lib/radio/index.ts
import { mockProvider } from './mock';
import { httpProvider } from './http';
import type { RadioProvider } from './provider';

export type { NowPlaying, RadioProvider } from './provider';

export function getProvider(config: { provider?: string | null; nowPlayingUrl?: string | null }): RadioProvider {
  if (config.provider === 'http' && config.nowPlayingUrl) return httpProvider(config.nowPlayingUrl);
  return mockProvider;
}

// ⚠ DERIVED FROM THE SELECTOR BY IDENTITY, NOT RESTATED. A caller has to be able to
// tell a measured track from the mock's fixed 'Tempo Lift / Shape Radio', and the
// obvious version of this — re-checking `provider === 'http' && nowPlayingUrl` at the
// call site — is a second copy of the rule above, free to drift from it the day the
// selector learns a third provider. Asking WHICH provider was chosen cannot drift.
export function isSimulated(config: { provider?: string | null; nowPlayingUrl?: string | null }): boolean {
  return getProvider(config) === mockProvider;
}
