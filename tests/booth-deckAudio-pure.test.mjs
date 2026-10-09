// REVIEW (lens 1) — independent checks of the pure buffer-deck arithmetic in deckAudio.mjs.
// Derived from first principles: an AudioBufferSourceNode started at `startT` with `offset` and
// playbackRate r plays buffer second b at startT + (b − offset)/r. Every beat must then land on
// the MASTER grid t0 + n·60/engineBpm, with n counted from atBar·4 for track beat fromBar·4.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBufferMeta, planBufferStart } from '../public/newdesign/booth/deckAudio.mjs';

const ENGINE = 124;
function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

test('review: grid sweep incl. negative cue, fractional atBar/fromBar, big leads, late joins', () => {
  const R = lcg(99);
  let worst = 0, n = 0, late = 0, neg = 0, frac = 0;
  for (let i = 0; i < 3000; i += 1) {
    const bpm = 90 + R() * 70;                         // wider than the analyser's range on purpose
    const db = -0.6 + R() * 2.0;                       // includes an extrapolated (negative) grid start
    const dur = 5 + R() * 70;
    const meta = normalizeBufferMeta({ bpm, downbeatSec: db }, dur);
    const t0 = R() * 0.3;
    const bar = 240 / ENGINE;
    const atBar = R() < 0.3 ? Math.floor(R() * 12) + R() : Math.floor(R() * 12);
    const fromBar = R() < 0.3 ? R() * 6 : Math.floor(R() * 6);
    const lead = [0.004, 0.03, 0.08][Math.floor(R() * 3)];
    const now = R() < 0.5 ? 0 : t0 + (atBar + (R() * 4 - 0.2)) * bar;
    const p = planBufferStart({ engineBpm: ENGINE, t0, meta, duration: dur, now, atBar, fromBar, lead });
    if (!p.ok) { assert.ok(p.offset >= dur, `refused plan must be past the end (offset ${p.offset}, dur ${dur})`); continue; }
    if (p.late) late += 1;
    if (p.cue < 0) neg += 1;
    if (atBar % 1 || fromBar % 1) frac += 1;
    assert.ok(p.startT >= now + lead - 1e-12, 'never starts inside the lead');
    assert.ok(p.offset >= 0 && p.offset < dur, 'offset inside the buffer');
    const r = Math.fround(ENGINE / bpm);
    assert.equal(p.rate, r);
    // every track beat at or after the offset lands on the master grid
    for (let k = Math.ceil((p.offset - db) / meta.beatSec - 1e-9); ; k += 1) {
      const b = db + k * meta.beatSec;
      if (b >= dur) break;
      const soundsAt = p.startT + (b - p.offset) / r;
      const masterBeats = atBar * 4 + (k - fromBar * 4);
      const want = t0 + masterBeats * (60 / ENGINE);
      worst = Math.max(worst, Math.abs(soundsAt - want));
      n += 1;
    }
    // endT = when the buffer runs out
    assert.ok(Math.abs(p.endT - (p.startT + (dur - p.offset) / r)) < 1e-9);
  }
  assert.ok(n > 50000 && late > 300 && neg > 100 && frac > 300, `vacuous: n=${n} late=${late} neg=${neg} frac=${frac}`);
  assert.ok(worst < 30e-6, `worst grid error ${(worst * 1e6).toFixed(2)} µs`);
});

test('review: normalizeBufferMeta edge inputs', () => {
  assert.equal(normalizeBufferMeta({ bpm: 124, downbeatSec: NaN }, 10).downbeatSec, 0);
  assert.equal(normalizeBufferMeta({ bpm: 124, downbeatSec: Infinity }, 10).downbeatSec, 0);
  assert.equal(normalizeBufferMeta({ bpm: 124, lengthBars: NaN }, 10).lengthBars, Math.floor(10 / (240 / 124)));
  assert.equal(normalizeBufferMeta({ bpm: 124, downbeatSec: 12 }, 10).lengthBars, 0);   // grid starts after the audio
  assert.equal(normalizeBufferMeta({ bpm: 124 }, 0.4).lengthBars, 0);                   // shorter than a bar
  assert.equal(normalizeBufferMeta({ bpm: Infinity }, 10), null);
  assert.equal(normalizeBufferMeta({ bpm: 124 }, NaN), null);
});

// Observations (not assertions of a contract): how loose the accepted bpm range is.
test('review: accepted bpm range → playback rates it produces (observation)', () => {
  const rows = [];
  for (const bpm of [62, 100, 140, 248, 999, 5, 1e-3, 1e-40]) {
    const m = normalizeBufferMeta({ bpm, downbeatSec: 0 }, 60);
    const p = m && planBufferStart({ engineBpm: ENGINE, t0: 0, meta: m, duration: 60, now: 0, atBar: 0 });
    rows.push({ bpm, accepted: !!m, rate: p ? p.rate : null, rateFinite: p ? Number.isFinite(p.rate) : null });
  }
  console.log(JSON.stringify(rows));
});
