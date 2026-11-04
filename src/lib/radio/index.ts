// src/lib/radio/index.ts
import { mockProvider } from './mock';
import { shapeProvider } from './shape';
import type { RadioProvider } from './provider';

export type { NowPlaying, RadioProvider } from './provider';

// Shape's own station (provider 'shape') is the only station: radio.co was taken out (owner,
// 2026-11-04: "yes remove radio.co"). Anything else, the placeholder 'mock' included, is no station.
export function getProvider(config: { provider?: string | null }): RadioProvider {
  if (config.provider === 'shape') return shapeProvider;
  return mockProvider;
}

// ⚠ DERIVED FROM THE SELECTOR BY IDENTITY, NOT RESTATED. A caller has to be able to
// tell a measured track from the mock's fixed 'Tempo Lift / Shape Radio', and the
// obvious version of this — re-checking the provider at the call site — is a second
// copy of the rule above, free to drift from it. Asking WHICH provider was chosen cannot drift.
export function isSimulated(config: { provider?: string | null }): boolean {
  return getProvider(config) === mockProvider;
}
