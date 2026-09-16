// THE INSTRUMENT MAY NOT DRAW WHAT IT HAS NOT MEASURED.
//
// WHY THIS FILE EXISTS: `radioSignalField.mjs` is the geometry behind the Radio
// page's spectrum and its two pulse rows. Most of it is drawing, and drawing is
// where a claim sneaks in — a glyph that starts before its beat arrives, a tie
// joining two beats that never aligned, a bar floor that survives an all-zero
// analyser frame and reads as a quiet passage. Each of those looks right on a
// screenshot. The rules below are the ones that keep the picture honest, and
// each is driven rather than eyeballed.
//
// Spec: docs/BUILD-2026-09-14-radio-signal-field.md §4 and §10.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BANDS, GAP_PX, RAMP_PX, ROW_WINDOW_S, SYNC_TOL_BPM, TIE_TOL_S,
  bandBin, smoothBand, peakBand, bandsFromBins, hasSignal, barHeight, capVisible,
  fieldBin, fieldK, fieldAlpha, fieldRadius,
  penSpeed, penX, behindOf, instantAt, alphaAt,
  kickShape, ecg, penRadius,
  bpmGap, inSync, gapText, lockStep, ties,
  beatsFromRR, advanceHeart, trimBeats,
  RAIL_BARS, railRms, railBarsLit,
} from '../public/newdesign/radioSignalField.mjs';

// ---------------------------------------------------------------------------
// The glyph. The single most load-bearing rule in the file.
// ---------------------------------------------------------------------------

test('the heart glyph is zero before its beat — nothing is drawn about a beat we have not received', () => {
  // A Bluetooth strap sends a RATE and RR INTERVALS, never a waveform. A real
  // ECG's P wave precedes the R by ~170ms, so any ink at u < 0 would be a claim
  // about a beat that has not arrived. The timing is measured; the shape is a
  // glyph; and it starts AT the beat.
  for (let u = -0.5; u < 0; u += 0.001) {
    assert.equal(ecg(u), 0, `ecg drew ink ${u.toFixed(3)}s BEFORE the beat`);
  }
  assert.equal(ecg(-1e-9), 0);
  // ...and it is not merely zero everywhere, or the assertion above is vacuous.
  assert.ok(ecg(0.014) > 0.9, 'the R spike is missing');
});

test('MUTATION: a glyph drawn from u >= -0.1 is caught', () => {
  // The mutation the brief names. Replayed here so the suite is proven to reject
  // it rather than merely to be green beside the correct version.
  const mutated = (u) => (u < -0.1 || u > 0.42 ? 0 : Math.max(0, 1 - Math.abs(u - 0.014) / 0.02));
  let caught = false;
  for (let u = -0.5; u < 0; u += 0.001) if (mutated(u) !== 0) { caught = true; break; }
  assert.ok(caught, 'the pre-beat sweep cannot see ink at u<0 — it would pass on the mutated glyph');
});

test('the glyph carries the spike, the dip and the T wave, in that order, and then stops', () => {
  assert.ok(ecg(0.014) > 0.9, 'no R spike');
  assert.ok(ecg(0.045) < 0, 'no S dip after the spike');
  assert.ok(ecg(0.21) > 0, 'no T wave');
  assert.ok(ecg(0.21) < ecg(0.014), 'the T wave is not smaller than the spike');
  assert.equal(ecg(0.43), 0, 'the glyph runs past its own window');
  assert.equal(ecg(5), 0);
});

test('the kick envelope attacks then decays, and is silent before the beat', () => {
  assert.equal(kickShape(-0.01), 0);
  assert.equal(kickShape(0), 0);
  assert.ok(kickShape(0.03) > 0.99, 'the attack does not reach full');
  assert.ok(kickShape(0.16) < kickShape(0.03), 'it does not decay');
  assert.ok(kickShape(1) < 0.01, 'it is still ringing a second later');
});

// ---------------------------------------------------------------------------
// The pen: one clock, three seconds, an erase gap ahead of it.
// ---------------------------------------------------------------------------

test('behindOf wraps at W and never leaves [0, W)', () => {
  const W = 240;
  const px = 100;
  assert.equal(behindOf(100, px, W), 0, 'the pen is not zero pixels behind itself');
  assert.equal(behindOf(99, px, W), 1);
  assert.equal(behindOf(101, px, W), W - 1, 'the column just ahead is the oldest, not the newest');
  for (let x = -500; x < 500; x += 1) {
    const b = behindOf(x, px, W);
    assert.ok(b >= 0 && b < W, `behindOf(${x}) = ${b}, outside [0, ${W})`);
  }
});

test('the gap is exactly the last 24px and nothing is drawn in it', () => {
  const W = 240;
  const px = 100;
  let blank = 0;
  for (let b = 0; b <= W - 1; b += 1) {
    // Choose the column that sits `b` behind the pen.
    const x = ((px - b) % W + W) % W;
    const a = alphaAt(x, px, W, 1);
    if (a === 0) blank += 1;
    if (b > W - GAP_PX) assert.equal(a, 0, `column ${b} behind the pen is inside the gap but drew ${a}`);
  }
  // 24px of gap, plus the single column where the ramp reaches exactly zero.
  assert.ok(blank >= GAP_PX, `only ${blank} blank columns, expected at least ${GAP_PX}`);
  assert.ok(blank <= GAP_PX + 2, `${blank} blank columns — the gap has grown past ${GAP_PX}px`);
});

test('alphaAt stays inside [0,1] at every column, width and state', () => {
  for (const W of [60, 120, 241, 375, 430]) {
    for (const kx of [0, 0.37, 1]) {
      for (let x = 0; x < W; x += 0.5) {
        const a = alphaAt(x, 17, W, kx);
        assert.ok(a >= 0 && a <= 1, `alphaAt(${x},${W},${kx}) = ${a}`);
        assert.ok(a <= kx + 1e-9, `alphaAt exceeded the state's own ceiling kx=${kx}`);
      }
    }
  }
  assert.equal(alphaAt(10, 17, 0, 1), 0, 'a zero-width row must draw nothing');
});

test('the trace ramps to zero rather than being cut off at the gap', () => {
  const W = 240;
  const px = 120;
  const at = (behind) => alphaAt(((px - behind) % W + W) % W, px, W, 1);
  const gap = W - GAP_PX;
  assert.ok(at(gap - RAMP_PX) > 0.5, 'the ramp starts too early');
  assert.ok(at(gap - RAMP_PX / 2) < at(gap - RAMP_PX), 'the ramp does not descend');
  assert.ok(at(gap - 1) < 0.2, 'the trace is still bright at the gap edge — it is being cut off');
});

test('the pen crosses the row once per window and the column it writes is now', () => {
  const W = 300;
  assert.equal(penSpeed(W), W / ROW_WINDOW_S);
  const x0 = 40;
  assert.equal(penX(0, x0, W), x0);
  // One full window later it is back where it started.
  assert.ok(Math.abs(penX(ROW_WINDOW_S, x0, W) - x0) < 1e-9);
  // The column at the pen shows the present; the column behind shows the past.
  const t = 7.3;
  const px = penX(t, x0, W);
  assert.ok(Math.abs(instantAt(px, px, W, t) - t) < 1e-9);
  const older = instantAt(px - 30, px, W, t);
  assert.ok(older < t, 'the column behind the pen is not older');
  assert.ok(Math.abs(older - (t - 30 / penSpeed(W))) < 1e-9, 'the time axis is not linear in x');
});

test('the pen dot grows with its own envelope', () => {
  assert.ok(penRadius(1) > penRadius(0), 'the dot does not respond to the beat');
  assert.equal(penRadius(0), 2.5);
  assert.equal(penRadius(1), 6);
  assert.equal(penRadius(null), 2.5, 'an absent envelope must not collapse the dot');
});

// ---------------------------------------------------------------------------
// The lock: a rate agreement and a phase alignment are different claims.
// ---------------------------------------------------------------------------

test('the gap is null when either side is unknown, and never 0', () => {
  assert.equal(bpmGap(null, 128), null, 'no strap produced a gap');
  assert.equal(bpmGap(128, null), null, 'no settled tempo produced a gap');
  assert.equal(bpmGap(undefined, undefined), null);
  assert.equal(bpmGap(0, 128), null, 'a zero heart rate is not a reading');
  assert.equal(bpmGap(112, 128), -16);
  assert.equal(bpmGap(131, 128), 3);
  assert.equal(bpmGap(128, 128), 0);
});

test('the gap prints with a typographic minus, a plus, or a bare zero', () => {
  assert.equal(gapText(-16), '−16');
  assert.equal(gapText(3), '+3');
  assert.equal(gapText(0), '0');
  assert.equal(gapText(null), '—', 'an unknown gap must read as the page\'s em-dash, not as 0');
  // A hyphen-minus here would sit at a different weight and width from the
  // figures beside it, which is the whole reason the page sets readings in Doto.
  assert.ok(!gapText(-16).includes('-'), 'the gap used a hyphen rather than U+2212');
});

test('in sync is the tolerance the shipped page already used', () => {
  assert.equal(SYNC_TOL_BPM, 4);
  assert.ok(inSync(0) && inSync(4) && inSync(-4));
  assert.ok(!inSync(5) && !inSync(-5));
  assert.ok(!inSync(null), 'an unknown gap must never read as in sync');
});

test('a tie is offered only to beats that genuinely land together', () => {
  const station = [1.0, 2.0, 3.0];
  // Two rates can agree while the beats sit half a period apart — a lock is
  // about phase, not only rate. A tie drawn there asserts an alignment that is
  // not in the measurement.
  assert.deepEqual(ties(station, [1.5, 2.5, 3.5]), [], 'tied beats half a period apart');
  const close = ties(station, [1.05, 2.0, 3.4]);
  assert.equal(close.length, 2, 'the beat 0.4s away was tied');
  assert.equal(close[0].station, 1.0);
  assert.ok(Math.abs(close[0].delta - 0.05) < 1e-9);
  // Exactly at the tolerance, and just past it.
  assert.equal(ties([0], [TIE_TOL_S]).length, 1);
  assert.equal(ties([0], [TIE_TOL_S + 0.001]).length, 0);
  assert.deepEqual(ties([1, 2], []), [], 'ties were drawn with no heart beats at all');
});

test('the lock eases in slower than it eases out', () => {
  // In over 1.1s, out over 0.5s: a momentary brush past the tolerance must not
  // flash the cues on, and losing the lock should read promptly.
  let k = 0;
  for (let i = 0; i < 60; i += 1) k = lockStep(k, true, 1 / 60);
  assert.ok(k > 0.85 && k < 1, `after 1s of sync lockK is ${k}`);
  let out = 1;
  for (let i = 0; i < 30; i += 1) out = lockStep(out, false, 1 / 60);
  // A tolerance, not equality: thirty accumulated 1/60s steps land within a
  // float epsilon of zero rather than on it, and asserting equality here would
  // be a test about IEEE 754 rather than about the lock.
  assert.ok(out < 1e-9, `the lock did not release inside 0.5s (${out})`);
  assert.equal(lockStep(1, true, 10), 1, 'lockK ran past 1');
  assert.equal(lockStep(0, false, 10), 0, 'lockK ran below 0');
});

// ---------------------------------------------------------------------------
// The heart's beat instants.
// ---------------------------------------------------------------------------

test('RR intervals place beats at measured instants, newest last', () => {
  // 1024 units = 1s. Three intervals: the last beat closes at the reading, the
  // one before it a second earlier, and so on.
  const beats = beatsFromRR(10, [1024, 512, 1024]);
  assert.equal(beats.length, 3);
  assert.deepEqual(beats, [10 - 1.5, 10 - 1, 10]);
  assert.deepEqual(beatsFromRR(10, []), [], 'an empty RR list produced beats');
  assert.deepEqual(beatsFromRR(10, null), []);
  assert.deepEqual(beatsFromRR(10, [0, -5]), [], 'a nonsense interval produced a beat');
});

test('with no RR, the phase accumulator still runs at the MEASURED rate', () => {
  // The rate is measured either way; only the placement is at worst one reading
  // late. That is the honest fallback, and it must not stall.
  let p = 0;
  for (let i = 0; i < 60; i += 1) p = advanceHeart(p, 120, (i + 1) / 60, 1 / 60).phase;
  assert.ok(Math.abs(p - 0) < 1e-9 || Math.abs(p - 1) < 1e-9, `120bpm for 1s should complete 2 cycles, phase ${p}`);
  assert.equal(advanceHeart(0.3, null, 1, 1 / 60).phase, 0.3, 'an unknown rate advanced the phase');
  assert.equal(advanceHeart(0.3, 0, 1, 1 / 60).phase, 0.3);

  // 120bpm crosses the phase every half second. ⚠ SAMPLED PAST THE BOUNDARY, NOT
  // ON IT: 1/60 does not sum to exactly 1, so the crossing due at t = 1.000 lands
  // at 1.0167 and a `=== 2 after exactly 1s` assertion fails on correct code —
  // which it did, and reading the failure is what found the real boundary defect
  // the source now records (a beat that was LOST rather than late). 66 frames is
  // 2.2 cycles, so the count is two whichever side of the boundary the float
  // falls on, and the SPACING is what pins the rate.
  const seen = [];
  let q = 0;
  for (let i = 0; i < 66; i += 1) {
    const a = advanceHeart(q, 120, (i + 1) / 60, 1 / 60);
    q = a.phase;
    seen.push(...a.beats);
  }
  assert.equal(seen.length, 2, `120bpm for 1.1s is two beats, got ${seen.length}`);
  assert.ok(Math.abs((seen[1] - seen[0]) - 0.5) < 1e-6, 'beats are not on the stated rate');
  // MUTATION — a step that drops a boundary crossing while the phase wraps
  // anyway loses the beat outright, because the next frame's phase has already
  // passed it. Driven over 600 frames at a rate whose period is not a frame
  // multiple, the count must not fall short of what the elapsed time implies.
  let r = 0;
  let n = 0;
  for (let i = 0; i < 600; i += 1) { const a = advanceHeart(r, 137, (i + 1) / 60, 1 / 60); r = a.phase; n += a.beats.length; }
  assert.equal(n, Math.floor(10 * 137 / 60), `137bpm for 10s dropped beats: ${n}`);

  // MUTATION — relax the guard to `bpm > 0` alone and a NEGATIVE rate walks the
  // loop backwards until the cap, putting sixty-odd fabricated beats on the
  // member's own row every frame. Infinity is the same guard from the other
  // side. The phase is PERSISTENT state, so one NaN would poison it for the
  // life of the page rather than washing out on the next frame.
  for (const bad of [-60, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
    const a = advanceHeart(0.25, bad, 10, 0.1);
    assert.deepEqual(a.beats, [], `beats were drawn for bpm ${bad}`);
    assert.equal(a.phase, 0.25, `the phase advanced on bpm ${bad}`);
  }
  // The clock has to be readable too — every instant is measured FROM it, so
  // without it each recorded beat is a NaN that the row then tries to place.
  // ⚠ THE STEP MUST BE LONG ENOUGH TO CROSS, or the fixture proves nothing: at
  // 60bpm a 0.1s step from phase 0.25 completes no cycle, so the guard is never
  // reached and removing it survives. Measured by mutation, not assumed.
  for (const dt of [1, 2.5]) {
    const a = advanceHeart(0.25, 60, Number.NaN, dt);
    assert.deepEqual(a.beats, [], `beats were drawn with no clock at dt ${dt}`);
    assert.equal(a.phase, 0.25, `the phase advanced with no clock at dt ${dt}`);
  }
  // A control: the same step WITH a readable clock does record beats, so the
  // assertion above is not passing because nothing crosses.
  assert.equal(advanceHeart(0.25, 60, 10, 1).beats.length, 1, 'the control produced no beat to compare against');
  assert.deepEqual(advanceHeart(0.25, 60, 10, Number.NaN).beats, [], 'beats were drawn with no step');
});

test('a rate change does not move beats that already happened', () => {
  // ⚠ THE FINDING THIS FUNCTION EXISTS FOR (Codex P2 on #2072). The row holds
  // three seconds and a strap re-reports inside that window constantly, so
  // rebuilding the window's beats from the LATEST rate — which is what
  // `heartBeatsBetween(bpm, now, phase, t0, t1)` did — redraws beats that
  // genuinely landed 500ms apart as though they had landed 600ms apart the
  // instant a 120 → 100 reading arrives. Recording each crossing is what makes
  // an instant a fact rather than a derivation.
  const beats = [];
  let phase = 0;
  const step = 1 / 60;
  // Two seconds at 120bpm, then two at 100.
  for (let i = 0; i < 240; i += 1) {
    const t = (i + 1) * step;
    const a = advanceHeart(phase, i < 120 ? 120 : 100, t, step);
    phase = a.phase;
    beats.push(...a.beats);
  }
  const early = beats.filter((b) => b <= 2);
  assert.ok(early.length >= 3, `no early beats recorded, got ${early.length}`);
  for (let i = 1; i < early.length; i += 1) {
    assert.ok(Math.abs((early[i] - early[i - 1]) - 0.5) < 1e-6,
      `a beat from the 120bpm stretch was re-spaced to ${(early[i] - early[i - 1]).toFixed(4)}s`);
  }
  // CONTROL — the rate really did change, so the test is not passing because
  // nothing happened. The last two beats are on the 100bpm period.
  const late = beats.slice(-2);
  assert.ok(Math.abs((late[1] - late[0]) - 0.6) < 1e-6,
    `the later beats are not on the new rate: ${(late[1] - late[0]).toFixed(4)}s`);
  // MUTATION — extrapolate instead: rebuild the window from the final rate and
  // the final phase, which is exactly what the retired function did. The early
  // beats then come back at 0.6s spacing and the assertion above fails.
  const p = 60 / 100;
  const last = 4 - phase * p;
  const rebuilt = [];
  for (let k = Math.ceil((0 - last) / p); last + k * p < 2; k += 1) rebuilt.push(last + k * p);
  assert.ok(rebuilt.length >= 3, 'the mutation produced nothing to compare against');
  assert.ok(Math.abs((rebuilt[1] - rebuilt[0]) - 0.5) > 1e-3,
    'the extrapolation happens to agree here, so this fixture cannot see the defect');
});

test('the recorded beats are trimmed to the window and stay sorted', () => {
  const beats = [1, 2, 3, 4, 5];
  trimBeats(beats, 3);
  assert.deepEqual(beats, [3, 4, 5], 'the window was not trimmed in place');
  trimBeats(beats, 0);
  assert.deepEqual(beats, [3, 4, 5], 'a cutoff behind the list dropped live beats');
  trimBeats(beats, 99);
  assert.deepEqual(beats, [], 'a cutoff past the list left beats behind');
  // A list that has been appended to and trimmed is still ordered, which is what
  // `ties` reads it as.
  const grow = [];
  let phase = 0;
  for (let i = 0; i < 600; i += 1) {
    const t = (i + 1) / 60;
    const a = advanceHeart(phase, 130, t, 1 / 60);
    phase = a.phase;
    grow.push(...a.beats);
    trimBeats(grow, t - 3.5);
  }
  assert.ok(grow.length > 0, 'nothing survived the trim');
  assert.ok(grow.length < 12, `the window is not being trimmed: ${grow.length} beats held`);
  for (let i = 1; i < grow.length; i += 1) {
    assert.ok(grow[i] > grow[i - 1], 'the recorded beats went out of order');
  }
});

// ---------------------------------------------------------------------------
// The spectrum and the field.
// ---------------------------------------------------------------------------

test('the bands mirror with the bass at the centre', () => {
  const mid = BANDS / 2;
  // The two centre bands read the SAME bin — that is what makes the figure
  // mirror rather than merely slope. ⚠ It is bin 1 and not bin 0: bin 0 of an
  // FFT is the DC offset, which carries no music, so the mapping steps over it.
  assert.equal(bandBin(mid - 1), bandBin(mid), 'the two centre bands do not read the same bin');
  assert.equal(bandBin(mid), 1, 'the centre no longer reads the lowest musical bin');
  assert.equal(bandBin(0), bandBin(BANDS - 1), 'the two ends do not mirror');
  assert.ok(bandBin(0) > bandBin(mid), 'the edges do not read higher than the centre');
  // Monotone out from the centre.
  for (let i = mid; i < BANDS - 1; i += 1) {
    assert.ok(bandBin(i + 1) >= bandBin(i), `band ${i + 1} reads below band ${i}`);
  }
});

test('an all-zero analyser frame is the ABSENCE of data, not a quiet passage', () => {
  // A stream without `Access-Control-Allow-Origin` hands back zeros forever. The
  // page must say so rather than draw a flat line that reads as silence.
  const zeros = new Uint8Array(256);
  assert.equal(hasSignal(zeros), false);
  assert.equal(hasSignal(new Uint8Array(0)), false);
  assert.equal(hasSignal(null), false);
  const one = new Uint8Array(256);
  one[3] = 1;
  assert.equal(hasSignal(one), true, 'a single lit bin is signal');
  assert.deepEqual(Array.from(bandsFromBins(zeros)), new Array(BANDS).fill(0));
});

test('the bars rise instantly and fall slowly', () => {
  assert.equal(smoothBand(0.1, 0.9), 0.9, 'the attack is not instant');
  const fell = smoothBand(0.9, 0);
  assert.ok(fell > 0.7 && fell < 0.9, `one release step took 0.9 to ${fell}`);
  // It converges rather than sticking.
  let v = 0.9;
  for (let i = 0; i < 200; i += 1) v = smoothBand(v, 0);
  assert.ok(v < 0.01, 'the bars never fall back');
});

test('the peak cap holds above the bar and falls at its own rate', () => {
  assert.equal(peakBand(0.2, 0.9), 0.9, 'the cap does not follow a new peak up');
  const held = peakBand(0.9, 0.1);
  assert.ok(held > 0.88 && held < 0.9, `the cap fell to ${held} in one frame`);
  assert.ok(capVisible(0.9, 0.1, 100), 'a clearly higher cap was hidden');
  assert.ok(!capVisible(0.5, 0.5, 100), 'a cap sitting on its own bar was drawn');
});

test('the bar floor is a drawing floor and never a reading', () => {
  assert.equal(barHeight(0, 100), 3, 'the baseline is not legible at zero');
  assert.equal(barHeight(1, 100), 100);
  assert.equal(barHeight(2, 100), 100, 'a value above 1 ran past the box');
  assert.equal(barHeight(-1, 100), 3);
  // The floor exists so a row of bars reads as a row; whether to draw AT ALL is
  // `hasSignal`'s decision, one layer up.
});

test('fieldK is monotone in the kick and in the state', () => {
  // Explicit steps rather than an accumulated float loop: `k += 0.1` drifts past
  // 1 on the last iteration, where the clamp flattens two neighbours together
  // and a strict `>` fails on correct code.
  const steps = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
  for (const kx of [0, 0.25, 0.5, 0.75, 1]) {
    for (let i = 1; i < steps.length; i += 1) {
      assert.ok(fieldK(kx, steps[i]) > fieldK(kx, steps[i - 1]), `fieldK not rising in kick at kx=${kx}`);
    }
    assert.ok(fieldK(1, kx) > fieldK(0, kx), 'the field is not fuller behind the rows than under the spectrum');
  }
  // With no settled tempo the kick is 0 — the field still lights per bin and
  // simply does not breathe. It must not go dark.
  assert.ok(fieldK(0, 0) > 0, 'no tempo blanked the field entirely');
});

test('a field dot reads bass at the centre and air at the edge', () => {
  assert.equal(fieldBin(0), 0);
  assert.ok(fieldBin(430) > fieldBin(100), 'the field does not open out in frequency');
  assert.equal(fieldBin(99999), fieldBin(430), 'beyond the reach every dot reads the same air');
  assert.ok(fieldAlpha(1, 1) > fieldAlpha(0, 1), 'a lit bin does not brighten its dot');
  assert.ok(fieldRadius(1, 1) > fieldRadius(0, 1), 'a lit bin does not grow its dot');
  assert.ok(fieldAlpha(0, 1) > 0, 'an unlit dot vanished — the field is the page\'s ground');
});

// ---------------------------------------------------------------------------
// The rail's signal meter. The whole point of it is the distinction between "we
// read the stream and it is quiet" and "we cannot read the stream at all".
// ---------------------------------------------------------------------------

test('an unreadable frame reads null, and a quiet one reads a real zero', () => {
  // No CORS on the stream: every bin is 0 forever. That is the absence of data,
  // not a silent passage, and the rail must not draw a meter over it.
  assert.equal(railRms(new Uint8Array(256)), null, 'an all-zero frame produced a level');
  assert.equal(railRms([]), null, 'an empty frame produced a level');
  assert.equal(railRms(null), null, 'a missing frame produced a level');
  // A frame that carries something reads a real number.
  const live = new Uint8Array(256);
  for (let i = 0; i < 64; i += 1) live[i] = 200;
  const r = railRms(live);
  assert.ok(r > 0, 'a live frame read no level');
  assert.ok(Math.abs(r - 200 / 255) < 1e-9, `a flat frame should read its own value, got ${r}`);
});

test('the meter reads the window the spectrum draws, not the whole frame', () => {
  // ⚠ THIS IS THE ASSERTION THE HELPER EXISTS FOR. `fftSize` 512 gives 256 bins,
  // and a real frame is mostly empty high bins. Averaging over all of them
  // divides the reading by the fraction that carries anything — the meter would
  // sit near the floor through music the spectrum is plainly showing.
  const bins = new Uint8Array(256);
  for (let i = 0; i < 64; i += 1) bins[i] = 255;   // the drawn window, full
  // everything above BAND_BINS stays 0
  const r = railRms(bins);
  assert.ok(r > 0.99, `the meter averaged over the empty high bins: ${r}`);
  // The control: a whole-frame average would read about half of this.
  let whole = 0;
  for (let i = 0; i < bins.length; i += 1) whole += (bins[i] / 255) ** 2;
  whole = Math.sqrt(whole / bins.length);
  assert.ok(whole < 0.55, 'the control is not measuring what it claims');
  assert.ok(r > whole * 1.5, 'the windowed reading is indistinguishable from the whole-frame one');
});

test('any level above zero lights a bar, and an unknown level lights none', () => {
  // A level that rounded to no bars would be indistinguishable from the
  // unreadable case, which the rail states in words instead.
  assert.equal(railBarsLit(null), 0, 'an unknown level lit a bar');
  assert.equal(railBarsLit(0), 0, 'a measured zero lit a bar');
  assert.equal(railBarsLit(NaN), 0, 'a NaN level lit a bar');
  assert.equal(railBarsLit(0.0001), 1, 'a faint but real level lit nothing');
  assert.equal(railBarsLit(1), RAIL_BARS, 'a full level did not fill the meter');
  assert.equal(railBarsLit(99), RAIL_BARS, 'an out-of-range level overflowed the meter');
  assert.equal(railBarsLit(-1), 0, 'a negative level lit a bar');
  // Monotonic across the range — a meter that is not is not a meter.
  let prev = -1;
  for (let x = 0; x <= 1.0001; x += 0.05) {
    const n = railBarsLit(x);
    assert.ok(n >= prev, `the meter went backwards at ${x.toFixed(2)}`);
    prev = n;
  }
});

test('the module carries no clock and no randomness', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../public/newdesign/radioSignalField.mjs', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /Math\.random/, 'the geometry must be replayable');
  assert.doesNotMatch(code, /Date\.now|new Date\(/, 'the caller passes t');
  // And no seeded reading hiding in a default.
  assert.doesNotMatch(code, /\b132\b/, 'the retired station constant reappeared in the geometry');
});
