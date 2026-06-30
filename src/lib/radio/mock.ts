// src/lib/radio/mock.ts
import type { RadioProvider, NowPlaying } from './provider';
export const mockProvider: RadioProvider = {
  async getNowPlaying(): Promise<NowPlaying> {
    return { title: 'Tempo Lift', artist: 'Shape Radio', isNora: false };
  },
};
