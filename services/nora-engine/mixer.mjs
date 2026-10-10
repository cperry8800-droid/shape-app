// mixer.mjs — Nora's hands on the decks: renders her planned set (a programme from
// src/lib/radio/noraPlanner.mjs) to stereo PCM, exactly as planned.
//
//   const mix = createMixer(programme, { sampleRate })
//   mix.render(fromSec, frames, sources) → Float32Array, interleaved L R, `frames` long
//
// `sources[i]` is song i of the programme, decoded: { sampleRate, left, right } (Float32Array or
// Int16Array), or null while it is not loaded. Render blocks IN ORDER: each song's bass filter
// carries its state from one block to the next (a jump, such as joining mid-set, just starts it
// fresh).
//
// WHAT EACH TRANSITION SOUNDS LIKE (the programme's `mixIn` of the incoming song):
//   beatmatch  the incoming song, already playing at the rate that locks its beat to the outgoing
//              one, rises over the first half of the blend with its BASS CUT; half way through,
//              the basses swap over one beat (the outgoing loses its lows, the incoming gains
//              them); the outgoing song falls over the second half. Two kick drums never pound at
//              once, which is the whole point of a bass swap.
//   blend      an equal-power crossfade over the outgoing song's own fade.
//   fade       the same, short (keys that clash).
// A last song with `fadeOutSec` fades out at the set's end. Each song plays at its `rate` (a
// turntable's pitch: tempo and key move together) and its `gainDb`. The sum goes through a soft
// knee above −0.9 dBFS, so a blend of two loud songs never clips.
//
// ⚠ A SONG THAT IS NOT LOADED IS SILENCE HERE, and the engine never lets that reach the air: it
// stops the set (the station's AutoDJ takes over) rather than broadcast a hole (engine.mjs).
//
// PURE: no I/O, no clock. Deterministic.

const LOW_HZ = 150;              // the bass the swap moves: kick and sub-bass
const KNEE = 0.9;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const rise = (x) => Math.sin((Math.PI / 2) * clamp(x, 0, 1));     // equal-power in
const fall = (x) => Math.cos((Math.PI / 2) * clamp(x, 0, 1));     // equal-power out

/** A 2nd-order Butterworth low-pass, one per song and channel; high = input − low. */
function lowpass(sampleRate) {
  const w = Math.tan((Math.PI * LOW_HZ) / sampleRate);
  const k = 1 / (1 + Math.SQRT2 * w + w * w);
  const b0 = w * w * k, b1 = 2 * b0, b2 = b0;
  const a1 = 2 * (w * w - 1) * k, a2 = (1 - Math.SQRT2 * w + w * w) * k;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return {
    step(x) {
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      return y;
    },
    reset() { x1 = x2 = y1 = y2 = 0; },
  };
}

/** Soft knee: unity below KNEE, then a tanh shoulder that never passes 1. */
export function softClip(x) {
  const a = Math.abs(x);
  if (a <= KNEE) return x;
  return Math.sign(x) * (KNEE + (1 - KNEE) * Math.tanh((a - KNEE) / (1 - KNEE)));
}

/**
 * The envelope of song i at set time t: its volume and how much of its bass is let through.
 * Exported for the tests and the booth, which draw the same faders.
 */
export function envelopeAt(items, i, t) {
  const it = items[i];
  if (!it || t < it.startSec || t >= it.endSec) return { vol: 0, low: 0 };
  let vol = 1, low = 1;
  // In: this song's own mix-in.
  const inn = it.mixIn || { type: 'open' };
  if (inn.type !== 'open' && inn.lengthSec > 0) {
    const L = inn.lengthSec, x = (t - it.startSec) / L;
    if (inn.type === 'beatmatch') {
      vol *= rise(x / 0.5);
      const beat = L / ((inn.bars || 16) * 4);
      low *= clamp((t - (it.startSec + L / 2)) / beat, 0, 1);
    } else {
      vol *= rise(x);
    }
  }
  // Out: the next song's mix-in.
  const next = items[i + 1];
  if (next && next.mixIn && next.mixIn.lengthSec > 0 && t >= next.startSec) {
    const L = next.mixIn.lengthSec, y = (t - next.startSec) / L;
    if (next.mixIn.type === 'beatmatch') {
      vol *= y < 0.5 ? 1 : fall((y - 0.5) / 0.5);
      const beat = L / ((next.mixIn.bars || 16) * 4);
      low *= 1 - clamp((t - (next.startSec + L / 2)) / beat, 0, 1);
    } else {
      vol *= fall(y);
    }
  }
  // The set's end.
  if (it.fadeOutSec > 0) vol *= clamp((it.endSec - t) / it.fadeOutSec, 0, 1);
  return { vol, low };
}

/** The songs sounding at set time t (their indices), for the engine's loading and the booth. */
export function activeAt(items, t) {
  const out = [];
  for (let i = 0; i < items.length; i++) if (t >= items[i].startSec && t < items[i].endSec) out.push(i);
  return out;
}

const sampleAt = (arr, pos) => {
  const i = Math.floor(pos);
  if (i < 0 || i + 1 >= arr.length) return 0;
  const f = pos - i;
  const scale = arr instanceof Int16Array ? 1 / 32768 : 1;
  return (arr[i] + (arr[i + 1] - arr[i]) * f) * scale;
};

export function createMixer(programme, { sampleRate = 44100 } = {}) {
  const items = (programme && programme.items) || [];
  const filters = items.map(() => ({ l: lowpass(sampleRate), r: lowpass(sampleRate), at: null }));
  return {
    sampleRate,
    items,
    /**
     * Render `frames` frames starting at set time `fromSec`.
     * @param {number} fromSec
     * @param {number} frames
     * @param {Array<{sampleRate:number,left:Float32Array|Int16Array,right:Float32Array|Int16Array}|null>} sources
     */
    render(fromSec, frames, sources) {
      const out = new Float32Array(frames * 2);
      const dt = 1 / sampleRate;
      const blockEnd = fromSec + frames * dt;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (blockEnd <= it.startSec || fromSec >= it.endSec) continue;
        const src = sources && sources[i];
        const f = filters[i];
        // A block that does not follow the last one this song rendered starts its filter fresh.
        if (f.at == null || Math.abs(f.at - fromSec) > dt / 2) { f.l.reset(); f.r.reset(); }
        f.at = blockEnd;
        if (!src) continue;
        const gain = 10 ** ((Number(it.gainDb) || 0) / 20);
        for (let n = 0; n < frames; n++) {
          const t = fromSec + n * dt;
          const { vol, low } = envelopeAt(items, i, t);
          // Keep the filter running even while silent, so the bass comes back without a click.
          const pos = (it.cueInSec + (t - it.startSec) * (Number(it.rate) || 1)) * (src.sampleRate || sampleRate);
          const inRange = t >= it.startSec && t < it.endSec;
          const xl = inRange ? sampleAt(src.left, pos) : 0;
          const xr = inRange ? sampleAt(src.right || src.left, pos) : 0;
          const ll = f.l.step(xl), lr = f.r.step(xr);
          if (vol === 0) continue;
          const g = gain * vol;
          out[2 * n] += g * (ll * low + (xl - ll));
          out[2 * n + 1] += g * (lr * low + (xr - lr));
        }
      }
      for (let k = 0; k < out.length; k++) out[k] = softClip(out[k]);
      return out;
    },
  };
}
