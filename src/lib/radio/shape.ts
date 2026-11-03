// src/lib/radio/shape.ts
// Shape's own station (provider 'shape', services/station). What it plays is Shape's own plan, so
// the now-playing route reads Shape's records first: Nora's set while her engine is on the air,
// then the rotation's block (src/lib/radio/noraOnAir.mjs). This is what is left when neither is on
// the air: the station's standby loop, or nothing, and either way no song to name.
import type { RadioProvider, NowPlaying } from './provider';

export const shapeProvider: RadioProvider = {
  async getNowPlaying(): Promise<NowPlaying> {
    return { title: null, artist: null, isNora: false };
  },
};
