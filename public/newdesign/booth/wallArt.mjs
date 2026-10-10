// wallArt.mjs — which artwork the booth's LED wall shows, read off the beat position. Pure (no
// three), so club.mjs draws it and the tests can check it in Node.
//
// The headliner screen (owner, 2026-10-10: "it goes back and forth between club shape, shape
// radio, and NORA as the headliner basically. like how they do at live concert").
// The wall holds each artwork for a phrase (8 bars) and changes on the downbeat: the venue, the
// headliner, the station, the headliner, so the act's name is up half the time, as a festival
// screen keeps it. The change is an LED wipe across the dots over 2 beats (a crossfade under
// reduced motion). With no headliner (a guest's Shape Set: Nora is off the decks, and the wall
// never names an act who is not playing) it alternates the venue and the station. Pure: the
// state is read off the beat position, so a booth that reopens mid-phrase shows the same frame.
export const WALL_PHRASE_BEATS = 32;
export const WALL_WIPE_BEATS = 2;
export const WALL_ART_SEQ = Object.freeze({
  nora: Object.freeze(['clubShape', 'nora', 'shapeRadio', 'nora']),
  none: Object.freeze(['clubShape', 'shapeRadio']),
});
/** { from, to, mix }: the artwork shown at beat position `bp` (mix 1 = `to` alone). */
export function wallArtAt(bp, { headliner = 'nora' } = {}) {
  const seq = headliner === 'nora' ? WALL_ART_SEQ.nora : WALL_ART_SEQ.none;
  const b = Number.isFinite(bp) ? Math.max(0, bp) : 0;
  const p = Math.floor(b / WALL_PHRASE_BEATS);
  const to = seq[p % seq.length];
  if (p === 0) return { from: to, to, mix: 1 };
  const mix = Math.min(1, (b - p * WALL_PHRASE_BEATS) / WALL_WIPE_BEATS);
  return mix >= 1 ? { from: to, to, mix: 1 } : { from: seq[(p - 1) % seq.length], to, mix };
}
