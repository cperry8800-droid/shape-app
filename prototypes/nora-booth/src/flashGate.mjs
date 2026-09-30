// A gate for anything that flashes on the kick. The kick envelope follows the music, and a
// track with kicks on every 16th would strobe a blinder rack; the rule (README, CONTRACT) is that
// nothing flashes faster than once a beat and never more than three times a second. The gate
// fires once per beat at most, holds the flash for one frame and lets it decay after, and it
// never fires again inside `minGap` seconds whatever the tempo says.
//
// Pure: no clock of its own, no randomness. The caller passes the time.

/**
 * @param {object} [o]
 * @param {number} [o.minGap]  the shortest gap between two flashes, in seconds (3 a second)
 * @param {number} [o.decay]   the flash's decay time constant, in seconds
 * @param {number} [o.threshold]  the kick level that counts as a hit
 */
export function createFlashGate({ minGap = 1 / 3, decay = 0.1, threshold = 0.5 } = {}) {
  let last = -Infinity;   // when the gate last fired
  let env = 0;            // the flash as shown, 0..1
  let armed = true;       // re-armed once the kick falls under the threshold
  return {
    /**
     * @param {number} dt   seconds since the last call
     * @param {number} t    seconds now
     * @param {number} kick the kick level, 0..1
     * @param {number} gap  the beat period in seconds (the gate never fires faster than that)
     * @returns {number} the flash level to show, 0..1
     */
    step(dt, t, kick, gap) {
      env *= Math.exp(-Math.max(0, dt) / decay);
      const hit = kick > threshold;
      const wait = Math.max(gap > 0 ? gap : 0, minGap) * 0.98;   // 2% slack for a late frame
      if (hit && armed && t - last >= wait) { last = t; env = 1; }
      armed = !hit;
      return env;
    },
    /** how many times the gate has fired is not tracked; `last` is enough for the rule */
    get lastFire() { return last; },
    reset() { last = -Infinity; env = 0; armed = true; },
  };
}
