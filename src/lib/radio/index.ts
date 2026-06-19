// src/lib/radio/index.ts
import { mockProvider } from './mock';
import { httpProvider } from './http';
import type { RadioProvider } from './provider';

export type { NowPlaying, RadioProvider } from './provider';

export function getProvider(config: { provider?: string | null; nowPlayingUrl?: string | null }): RadioProvider {
  if (config.provider === 'http' && config.nowPlayingUrl) return httpProvider(config.nowPlayingUrl);
  return mockProvider;
}
