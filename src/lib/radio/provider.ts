// src/lib/radio/provider.ts
export type NowPlaying = { title: string | null; artist: string | null; isNora: boolean };
export interface RadioProvider {
  getNowPlaying(): Promise<NowPlaying>;
}
