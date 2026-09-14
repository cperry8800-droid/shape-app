// THE STATION'S TEMPO IS MEASURED OR IT IS NULL, AND NULL IS THE COMMON CASE.
//
// WHY THIS FILE EXISTS: the Radio page rendered `BS_LIVE_STATION.bpm` — a 132
// typed into a constant — as a live reading in three places. `radioTempo.mjs`
// replaces it with a measurement, which means the thing that has to be guarded
// is not "does it find 128 in a 128 BPM track" (it does) but "does it ever
// report a number it has not earned". Every case below that expects `null` is
// the real subject.
//
// ⚠ AND THE FIRST RUN CORRECTED THE BUILD BRIEF ABOUT ITS OWN MUTATION.
// docs/BUILD-2026-09-14-radio-signal-field.md §10 asks for "a mutation that
// lowers the confidence floor to 0 must make the silence case read a tempo
// (killed)". Measured across every combination of the three gates, that mutation
// is a NO-OP: silence and a constant level produce no onsets at all — the
// half-wave-rectified difference of a flat signal is zero everywhere — so they
// read null with CONF_ABS, CONF_REL and SPLIT_TOL all disabled. A guard built on
// it would have passed forever while proving nothing.
//
// What the gates actually hold, measured:
//
//   input     all gates   confAbs=0   confRel=0   splitTol=off   ALL OFF
//   silence   null        null        null        null           null
//   constant  null        null        null        null           null
//   noise     null        null        null        null           120.25
//   speech    null        null        null        109.25         109.25
//
// So: the three gates are mutually redundant against broadband NOISE (any one of
// them rejects it), and SPLIT-HALF AGREEMENT alone is what stands between a
// speech-like signal and a confident 109.25 BPM on the page. That is the mutation
// this file carries, because it is the one that can actually fabricate a reading.
//
// Every generator below is deterministic — a seeded LCG, never Math.random — so
// a failure here is always the detector's and never the fixture's.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTempoDetector,
  tempoOnsets,
  tempoBeatAt,
  tempoKick,
  tempoBeatsBetween,
  tempoBarStep,
  tempoEnergyFromBins,
  TEMPO_BINS,
  RING_S,
} from '../mobile-app/src/services/radioTempo.mjs';

const FPS = 60;

// The kick's envelope, as the station row draws it — a fast attack then a decay.
function kickEnv(u) {
  if (u < 0) return 0;
  if (u < 0.03) return u / 0.03;
  return Math.exp(-(u - 0.03) / 0.13);
}

// A bass-band click train at `bpm`. This is what the caller feeds the detector:
// the analyser's bins 1–4 (~86–345 Hz), where a kick lives and a hi-hat does not.
function train(bpm, opts) {
  const o = opts || {};
  const p = 60 / bpm;
  const jitter = o.jitter || (() => 0);
  const shift = o.shift || 0;
  return (t) => {
    const k = Math.floor((t - shift) / p);
    let e = 0;
    for (const kk of [k - 1, k]) e = Math.max(e, 255 * kickEnv(t - (shift + kk * p + jitter(kk))));
    return 6 + e; // 6 is the quiet floor a real mix always has
  };
}

// A deterministic pseudo-random source. Seeded per call site so two cases in this
// file cannot influence each other through shared state.
function lcg(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

// Deterministic jitter in ±ms, keyed on the beat index.
function jitterOf(ms, seed) {
  const r = lcg(seed);
  const table = [];
  for (let i = 0; i < 512; i += 1) table.push((r() * 2 - 1) * (ms / 1000));
  return (k) => table[((k % 512) + 512) % 512];
}

// Speech: irregular bursts, no grid. The signal a talk segment or a DJ drop hands
// the detector — plenty of onsets, no tempo.
function speech(seed) {
  const r = lcg(seed);
  const on = [];
  let t = 0;
  while (t < 60) {
    t += 0.15 + r() * 0.5;
    on.push(t);
  }
  return (tt) => {
    let e = 0;
    for (const b of on) if (tt - b >= 0 && tt - b < 0.5) e = Math.max(e, 255 * kickEnv(tt - b));
    return 6 + e;
  };
}

// Drive the detector over `secs` of a signal and report when it first settled.
function drive(energy, secs, opts) {
  const d = createTempoDetector(opts || {});
  let first = null;
  let last = null;
  const beats = []; // every reported beat instant, for the phase assertions
  for (let i = 0; i < Math.round(secs * FPS); i += 1) {
    const t = i / FPS;
    d.push(t, energy(t));
    const r = d.read(t);
    if (r && !first) first = { t, bpm: r.bpm, score: r.score };
    if (r) { last = r; beats.push({ t, beat: r.beat }); }
  }
  return { first, last, beats };
}

// ---------------------------------------------------------------------------
// It finds a tempo that is there.
// ---------------------------------------------------------------------------

test('a 128 BPM click train settles inside 8s, to within half a BPM', () => {
  const { first, last } = drive(train(128), 12);
  // The vacuity line: every `null` assertion below is worthless unless the
  // detector demonstrably CAN settle.
  assert.ok(first, 'a clean 128 BPM train never settled — the detector is inert');
  // ⚠ THIS BOUND WAS 6s AND MOVED TO 8s DELIBERATELY. The build brief's §5 asked
  // for a first reading within 6s, and the detector met it at 5.40s — while
  // publishing a fabricated tempo for 237 of 500 speech seeds, because one lucky
  // window was enough. CONFIRM_S makes a candidate persist before it is spoken,
  // which costs 2s (5.40 -> 7.40) and takes the speech fabrications to zero.
  // A latency target I set myself does not outrank the honest-data rule the whole
  // module exists for: the page reads "—" two seconds longer, instead of reading
  // a confident number off a talk segment.
  assert.ok(first.t <= 8, `settled at ${first.t.toFixed(2)}s, past the 8s the page is willing to read "—" for`);
  assert.ok(Math.abs(first.bpm - 128) <= 0.5, `settled at ${first.bpm}, not 128`);
  assert.ok(last.score > 0.9, `score ${last.score} is low for a clean train`);
});

test('it holds across the whole declared range and refuses outside it', () => {
  for (const bpm of [100, 112, 128, 140, 160]) {
    const { last } = drive(train(bpm), 12);
    assert.ok(last, `${bpm} BPM never settled`);
    assert.ok(Math.abs(last.bpm - bpm) <= 0.5, `${bpm} BPM read as ${last.bpm}`);
  }
  // Out of range, it says nothing rather than folding the answer into the range.
  // A 90 BPM track reported as a confident 135 would be the constant's defect
  // with extra steps.
  for (const bpm of [90, 170]) {
    const { last } = drive(train(bpm), 12);
    assert.equal(last, null, `${bpm} BPM is outside 100..160 and was reported as ${last && last.bpm}`);
  }
});

test('±15ms of jitter still settles', () => {
  const { first } = drive(train(128, { jitter: jitterOf(15, 11) }), 12);
  assert.ok(first, 'a jittered train never settled — real music is never exact');
  assert.ok(Math.abs(first.bpm - 128) <= 0.5, `jittered train read ${first.bpm}`);
});

test('a change from 128 to 140 replaces the reading inside 8s', () => {
  const d = createTempoDetector({});
  const a = train(128);
  const b = train(140, { shift: 14 });
  let replaced = null;
  let sawOld = false;
  for (let i = 0; i < Math.round(40 * FPS); i += 1) {
    const t = i / FPS;
    d.push(t, t < 14 ? a(t) : b(t));
    const r = d.read(t);
    if (r && t < 14 && Math.abs(r.bpm - 128) <= 1) sawOld = true;
    if (r && t > 14 && Math.abs(r.bpm - 140) <= 1 && replaced === null) replaced = t - 14;
  }
  assert.ok(sawOld, 'never settled on the first tempo, so the change proves nothing');
  assert.ok(replaced !== null, 'the new tempo never replaced the old one');
  assert.ok(replaced <= 8, `took ${replaced.toFixed(2)}s to replace the reading`);
});

// ---------------------------------------------------------------------------
// It refuses a tempo that is not there. This is the half that matters.
// ---------------------------------------------------------------------------

test('silence reads null', () => {
  assert.equal(drive(() => 0, 15).last, null);
});

test('an all-zero analyser frame reads null — no CORS is not silence to animate over', () => {
  // A stream without `Access-Control-Allow-Origin` gives every bin 0 forever.
  // The page must not draw a plausible tempo over it.
  assert.equal(drive(() => 0, 15).last, null);
  // A constant non-zero level is the same claim: a level is not a beat.
  assert.equal(drive(() => 128, 15).last, null);
});

test('broadband noise reads null', () => {
  const r = lcg(1);
  assert.equal(drive(() => r() * 255, 20).last, null);
});

test('speech reads null', () => {
  assert.equal(drive(speech(7), 20).last, null);
});

// WHAT THE GATE REFUSES, AND THE ONE THING IT ACCEPTS THAT IS NOT A DRUM.
//
// Measured by driving the shipped detector over five adversarial shapes plus a
// control. Four are refused: applause (dense, aperiodic), a speech cadence, a
// long crescendo of noise, and a riser with a wobble.
//
// ⚠ THE FIFTH READS, AND THAT IS CORRECT RATHER THAN A HOLE. A sustained tone
// under a 2 Hz tremolo reads 120.00 BPM at score 0.790 — and a 2 Hz amplitude
// modulation IS a 120-per-minute pulse in the bass: a listener asked to tap
// along would tap 120. This detector measures periodic amplitude modulation,
// which is what a beat is for this purpose; it does not claim to know whether a
// drum made it. Contrast the two-thumps case above, which was a real
// fabrication: four onsets over a six-second window is not evidence of anything,
// which is why the coverage gate refuses it and does not refuse this.
//
// The control is what stops this test from passing on a gate that refuses
// everything — a refusal-only detector would make the page read "—" forever and
// satisfy every assertion above it.
test('the gate refuses what is not periodic and accepts what is', () => {
  const rApp = lcg(7);
  assert.equal(drive(() => 0.3 + 0.7 * rApp(), 10).last, null, 'applause read a tempo');

  const rRamp = lcg(17);
  assert.equal(drive((t) => (t / 10) * (0.4 + 0.6 * rRamp()), 10).last, null, 'a crescendo read a tempo');

  assert.equal(
    drive((t) => Math.min(1, t / 8) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 0.7 * t)), 10).last,
    null,
    'a riser with a wobble read a tempo',
  );

  // Genuinely periodic at 2 Hz — accepted, and named as such.
  const trem = drive((t) => 0.5 + 0.45 * Math.sin(2 * Math.PI * 2 * t), 10).last;
  assert.ok(trem, 'a 2Hz tremolo was refused — the detector should read real periodicity');
  assert.ok(Math.abs(trem.bpm - 120) < 0.5, `tremolo read ${trem.bpm}, expected 120`);

  // CONTROL — a real kick train must still read, or the refusals prove nothing.
  const P = 60 / 128;
  const rk = lcg(19);
  const kicks = drive((t) => 0.06 + 0.94 * Math.exp(-(t % P) / 0.05) + 0.02 * rk(), 10).last;
  assert.ok(kicks, 'the control kick train was refused — the gate refuses everything');
  assert.ok(Math.abs(kicks.bpm - 128) < 0.5, `control read ${kicks.bpm}, expected 128`);
  assert.ok(kicks.score > trem.score, 'a kick train should be more confident than a tremolo');
});

test('a kick against an EQUALLY loud offbeat refuses rather than guessing the octave', () => {
  // Genuinely ambiguous between 128 and its double. 256 is outside the range, so
  // the honest answer is "—" and not either end.
  const p = 60 / 128;
  const energy = (t) => {
    const k = Math.floor(t / p);
    let e = 0;
    for (const kk of [k - 1, k]) {
      e = Math.max(e, 255 * kickEnv(t - kk * p));
      e = Math.max(e, 255 * kickEnv(t - (kk * p + p / 2)));
    }
    return 6 + e;
  };
  assert.equal(drive(energy, 20).last, null);
});

test('an ordinary offbeat bassline under the kick still reads the kick', () => {
  // The control for the case above: a real rolling bassline is quieter than the
  // kick, and refusing THAT would make the detector useless on house.
  const p = 60 / 128;
  const energy = (t) => {
    const k = Math.floor(t / p);
    let e = 0;
    for (const kk of [k - 1, k]) {
      e = Math.max(e, 255 * kickEnv(t - kk * p));
      e = Math.max(e, 150 * kickEnv(t - (kk * p + p / 2)));
    }
    return 6 + e;
  };
  const { last } = drive(energy, 20);
  assert.ok(last, 'a kick with a quieter offbeat bass should still read');
  assert.ok(Math.abs(last.bpm - 128) <= 1, `read ${last.bpm}`);
});

test('two transients are not a tempo', () => {
  // THE WORST FABRICATION THIS MODULE CAN PRODUCE, and it was found by mutation
  // rather than by reading. A door slam and a cough 2.5s apart are four onsets,
  // and four onsets clustered in one corner of the ring fit ANY period: measured
  // before the coverage gate existed, they scored 0.997 at 120 BPM and cleared
  // every other floor — including the relative one, because with so few vectors
  // the mean across the range rises too. The page would have read a confident
  // "120" off two thumps.
  const energy = (t) => {
    let e = 0;
    for (const b of [11.0, 13.5]) e = Math.max(e, 255 * kickEnv(t - b));
    return 6 + e;
  };
  assert.equal(drive(energy, 20).last, null, 'two transients produced a tempo');
});

test('a slow riser is not a tempo', () => {
  // One transient every four seconds: plenty of onsets, all bunched at the reset.
  assert.equal(drive((t) => 6 + 240 * ((t % 4) / 4), 25).last, null);
});

test('MUTATION: without the SPAN rule, a slow riser reads as 104 BPM', () => {
  // The coverage gate has two halves and they were measured separately rather
  // than assumed to work together. The span rule is the one that holds a riser:
  // its onsets are numerous (they clear the count) and all bunched at the reset.
  const riser = (t) => 6 + 240 * ((t % 4) / 4);
  assert.equal(drive(riser, 25).last, null);
  // ⚠ THE MUTATION HAS TO RELAX THE CONFIRM WINDOW TOO, AND THAT IS THE HONEST
  // STATEMENT RATHER THAN A WEAKENING. Since CONFIRM_S landed, a riser is held by
  // two independent layers: its onsets do not SPAN the window, and its
  // coincidental peak does not PERSIST. Relaxing the span rule alone therefore no
  // longer makes it read — which would leave this mutation surviving and look
  // like the span rule had stopped mattering. It has not: with both relaxed the
  // riser reads, and the sibling test below proves the confirm window's own half.
  assert.ok(
    drive(riser, 25, { coverFrac: 0, confirmS: 0 }).last,
    'the span rule is no longer what holds a riser back at the search level',
  );
});

// THE REGRESSION GUARD FOR THE DEFECT CODEX FOUND, REPLAYED AS ITS OWN MUTATION.
//
// Split-half agreement compares two argmaxes chosen independently over 241
// candidates, so in dense aperiodic audio two nearby peaks are common by
// coincidence — and the hold then turns one lucky window into four seconds of
// confident output. Measured on the shipped detector before the fix: 237 of 500
// speech seeds published a BPM, at scores of 0.35–0.48, comfortably over the
// floor. The suite missed it because it drove `speech(7)`, which happens to
// refuse; ONE seed is not a sample.
test('no speech seed publishes a tempo, and removing the confirm window brings them back', () => {
  // ⚠ 500 SEEDS, NOT A ROUND NUMBER PICKED FOR COMFORT. At 120 this test passed
  // while TWO mutations on the confirm window survived — measured, dropping the
  // restart-on-disagreement rule fabricates on 1 seed in 500 and letting a
  // candidate-less window keep the clock running fabricates on 16. Neither is
  // reliably reachable in 120. A corpus that cannot separate the fix from its own
  // weakenings is not measuring the fix.
  const SEEDS = 500;
  let spoke = 0;
  for (let sd = 1; sd <= SEEDS; sd += 1) if (drive(speech(sd), 20).last) spoke += 1;
  assert.equal(spoke, 0, `${spoke} of ${SEEDS} speech seeds published a fabricated tempo`);

  // MUTATION — the same corpus with the confirm window removed. This is the
  // control that stops the assertion above passing on a detector that simply
  // refuses everything: the defect must be reachable for the fix to mean anything.
  let without = 0;
  for (let sd = 1; sd <= SEEDS; sd += 1) if (drive(speech(sd), 20, { confirmS: 0 }).last) without += 1;
  // ⚠ A FRACTION, NOT A COUNT, AND THE COUNT COST A ROUND. This read
  // `without > 100`, which silently ties the control to one corpus size: at
  // SEEDS=120 the un-mutated tree FAILS here (~60 hits), so anyone testing
  // whether the corpus could be smaller sees a red suite that reads as the fix
  // breaking rather than as the control being mis-scaled. Measured with it
  // fixed: at 120 both confirm-window mutations SURVIVE, so 500 is load-bearing
  // and this test's 16.7s — 8% of the whole suite — is bought, not habitual.
  assert.ok(without > SEEDS * 0.3, `only ${without} of ${SEEDS} seeds fabricated without the confirm window — the corpus no longer reaches the defect`);
});

test('MUTATION: without the coverage gate at all, two transients read as 120 BPM', () => {
  // Two thumps clear NEITHER half on their own, so this mutation has to remove
  // both — which is the honest statement of what the gate does: the count and
  // the span are jointly, not individually, what rejects them.
  const energy = (t) => {
    let e = 0;
    for (const b of [11.0, 13.5]) e = Math.max(e, 255 * kickEnv(t - b));
    return 6 + e;
  };
  assert.equal(drive(energy, 20).last, null);
  assert.equal(drive(energy, 20, { coverFrac: 0 }).last, null, 'the span rule alone now rejects them — re-measure which half holds');
  assert.equal(drive(energy, 20, { minOnsets: 0 }).last, null, 'the count rule alone now rejects them — re-measure which half holds');
  const mutated = drive(energy, 20, { coverFrac: 0, minOnsets: 0 }).last;
  assert.ok(mutated, 'removing the whole coverage gate no longer lets two thumps through');
});

// ---------------------------------------------------------------------------
// The hold: a settled tempo survives a dropout, and then it GOES.
// ---------------------------------------------------------------------------

test('a settled tempo survives a short dropout and is dropped after a long one', () => {
  const d = createTempoDetector({});
  const a = train(128);
  let settledBy = null;
  // 10s of music, then silence forever.
  for (let i = 0; i < Math.round(10 * FPS); i += 1) {
    const t = i / FPS;
    d.push(t, a(t));
    if (d.read(t) && settledBy === null) settledBy = t;
  }
  assert.ok(settledBy !== null, 'never settled, so the hold proves nothing');

  // A breakdown: two seconds of quiet. The reading must survive it.
  let t = 10;
  for (; t < 12; t += 1 / FPS) d.push(t, 6), d.read(t);
  assert.ok(d.read(12), 'a 2s breakdown blanked the reading — the hold is not holding');

  // A track that has ended: past HOLD_S, the reading goes rather than freezing.
  for (; t < 20; t += 1 / FPS) d.push(t, 6), d.read(t);
  assert.equal(d.read(20), null, 'the tempo was held forever after the music stopped');
});

// ---------------------------------------------------------------------------
// The gates, proven to be load-bearing rather than decorative.
// ---------------------------------------------------------------------------

test('MUTATION: relaxing split-half agreement fabricates a tempo out of speech', () => {
  const sig = speech(7);
  // Shipped: null.
  assert.equal(drive(sig, 20).last, null, 'speech settles even with the gates on — the guard below proves nothing');
  // Mutated: the one gate removed, and a confident reading appears from nothing.
  const mutated = drive(sig, 20, { splitTol: 999 }).last;
  assert.ok(
    mutated,
    'relaxing SPLIT_TOL did NOT produce a reading — split-half agreement is no longer '
      + 'the gate holding speech back, so this guard has stopped testing what it names',
  );
});

// ⚠ THIS SAID "ALL THREE GATES" AND IT TAKES FOUR — MEASURED, NOT ASSUMED.
// The confirm window is load-bearing against broadband noise as well as speech:
// noise's per-window argmax wanders (14 distinct BPMs published across one 20s
// run with `confirmS: 0`), so restart-on-disagreement refuses it even with the
// three scoring gates off. The old version passed only because `splitTol: 999`
// ALSO relaxed the confirm window's own tolerance, which reads the same constant
// — an undocumented coupling, so the test's failure message would have sent the
// next reader to the wrong three gates. Proven by decoupling the two tolerances
// in a scratch copy: this case fails, while the split-half mutation above still
// passes. `confirmS: 0` is passed explicitly now, so the mutation says what it
// relaxes and survives anyone later giving the confirm window its own knob.
test('MUTATION: with all four gates off, broadband noise reports a tempo', () => {
  const mk = () => {
    const r = lcg(1);
    return () => r() * 255;
  };
  assert.equal(drive(mk(), 20).last, null);
  const mutated = drive(mk(), 20, { confAbs: 0, confRel: 0, splitTol: 999, confirmS: 0 }).last;
  assert.ok(mutated, 'the four gates together are not what rejects noise');
});

// ---------------------------------------------------------------------------
// The grid arithmetic the field, the counter and the rows all read.
// ---------------------------------------------------------------------------

test('the onset envelope is the rise only', () => {
  // A decay is not a second beat.
  const rising = tempoOnsets([{ t: 0, e: 1 }, { t: 1, e: 10 }, { t: 2, e: 100 }]);
  assert.equal(rising.length, 2);
  const falling = tempoOnsets([{ t: 0, e: 100 }, { t: 1, e: 10 }, { t: 2, e: 1 }]);
  assert.equal(falling.length, 0, 'a decay produced onsets');
  assert.equal(tempoOnsets([{ t: 0, e: 5 }, { t: 1, e: 5 }, { t: 2, e: 5 }]).length, 0, 'a flat level produced onsets');
});

test('beat arithmetic lands on the grid', () => {
  const bpm = 120; // 0.5s period
  assert.equal(tempoBeatAt(bpm, 0, 1.2), 1);
  assert.equal(tempoBeatAt(bpm, 0, 1.0), 1);
  assert.equal(tempoBeatAt(bpm, 0.25, 1.0), 0.75);
  assert.equal(tempoBeatAt(null, 0, 1), null);

  const beats = tempoBeatsBetween(bpm, 0, 1, 3);
  assert.deepEqual(beats, [1, 1.5, 2, 2.5]);
  assert.deepEqual(tempoBeatsBetween(null, 0, 1, 3), [], 'no grid must yield no beats');
});

// MUTATION — relax the grid guard from `bpm > 0` to a null check and a NEGATIVE
// bpm emits beats. This is not the same case as `null`, which the assertion
// above already covers and which returns [] by arithmetic accident whatever the
// guard says (`60 / null` is Infinity, so the first candidate is already past
// t1). A negative period walks BACKWARDS forever and only the 4096 cap stops
// it, so a single bad reading becomes four thousand fabricated beats on the
// station row rather than none. Zero is the same shape from the other side:
// `60 / 0` is Infinity, so it must refuse rather than divide.
test('a non-positive tempo emits nothing, on every beat helper', () => {
  for (const bad of [-120, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(tempoBeatsBetween(bad, 0, 1, 3), [], `beats were emitted for bpm ${bad}`);
    assert.equal(tempoBeatAt(bad, 0, 1), null, `a beat was placed for bpm ${bad}`);
    assert.equal(tempoKick(bad, 0, 1), 0, `a kick was drawn for bpm ${bad}`);
    assert.equal(tempoBarStep(bad, 0, 1), null, `a bar step was counted for bpm ${bad}`);
  }
  // A phase we could not read is the same refusal — the grid is the PAIR.
  assert.deepEqual(tempoBeatsBetween(120, Number.NaN, 1, 3), [], 'beats were emitted with no phase');
  assert.equal(tempoBarStep(120, Number.NaN, 1), null, 'a bar step was counted with no phase');
});

test('the kick envelope peaks on the beat and decays, and is 0 with no grid', () => {
  assert.equal(tempoKick(120, 0, 1.0), 1);
  assert.ok(tempoKick(120, 0, 1.13) < 0.4, 'did not decay');
  assert.ok(tempoKick(120, 0, 1.13) > 0.3, 'decayed too fast');
  assert.equal(tempoKick(null, 0, 1), 0, 'a kick was drawn with no settled tempo');
});

test('the bar counter steps 0..3 and wraps', () => {
  const bpm = 120;
  assert.deepEqual([0, 0.5, 1.0, 1.5, 2.0].map((t) => tempoBarStep(bpm, 0, t)), [0, 1, 2, 3, 0]);
  assert.equal(tempoBarStep(null, 0, 1), null, 'a counter stepped with no settled tempo');
});

// THREE PROPERTIES OF THE CONFIRM WINDOW, each added because its mutation
// SURVIVED the round that introduced it — the corpus above could not reach them.
test('a tempo that will not hold still is never published', () => {
  // Alternating 112/152 every 1.5s — each flip is shorter than CONFIRM_S, so no
  // candidate ever survives long enough to be spoken. This is the discriminator
  // the speech corpus could not be: it makes searches SUCCEED repeatedly while
  // disagreeing, which is what "restart the clock on disagreement" is about. A
  // confirm window that latches the first candidate and never restarts would
  // publish here two seconds in.
  const r = lcg(5);
  const flip = (t) => {
    const bpm = Math.floor(t / 1.5) % 2 === 0 ? 112 : 152;
    const P = 60 / bpm;
    return 0.06 + 0.94 * Math.exp(-((t % P)) / 0.05) + 0.02 * r();
  };
  assert.equal(drive(flip, 24).last, null, 'a tempo flipping faster than the confirm window was published');

  // CONTROL — the same construction with the window removed does publish, so the
  // refusal above is the window working rather than the signal being unreadable.
  const r2 = lcg(5);
  const flip2 = (t) => {
    const bpm = Math.floor(t / 1.5) % 2 === 0 ? 112 : 152;
    const P = 60 / bpm;
    return 0.06 + 0.94 * Math.exp(-((t % P)) / 0.05) + 0.02 * r2();
  };
  assert.ok(drive(flip2, 24, { confirmS: 0 }).last, 'the corpus no longer reaches the defect');
});

// ⚠ THIS PROVES THE END-TO-END PROPERTY AND NOT THE ASSIGNMENT — measured, and
// named so the next reader does not mistake it for a mutation guard. Freezing
// `settled` in place (`settled = settled || {…}`) SURVIVES this test, because the
// hold expires during the disruption and sets `settled` to null, after which the
// `||` always sees null when it matters. What the test does prove is the thing a
// member sees: after a cut in the music the beat re-anchors rather than staying
// half a period late — which is what PR 3's lock is drawn from.
test('the beat re-anchors after a cut in the music', () => {
  // A cut in the music: 128 BPM throughout, phase jumps half a beat at t=12.
  // The confirm window decides WHETHER to speak; it must not freeze WHAT is
  // spoken, or every beat after a cut is drawn half a period late — which on the
  // matching state is the difference between a lock and a lie.
  const r = lcg(9);
  const P = 60 / 128;
  const cut = (t) => {
    const off = t < 12 ? 0 : P / 2;
    const ph = (((t - off) % P) + P) % P;
    return 0.06 + 0.94 * Math.exp(-ph / 0.05) + 0.02 * r();
  };
  const { beats } = drive(cut, 24);
  const late = beats.filter((b) => b.t > 20 && b.beat != null);
  assert.ok(late.length > 10, 'no beats were reported after the cut — the fixture proves nothing');
  const off = P / 2;
  const worst = Math.max(...late.map((b) => Math.abs(b.beat - (off + Math.round((b.beat - off) / P) * P))));
  // Measured at 8.7ms against a half-beat of 234ms. A frozen phase sits at ~234.
  assert.ok(worst < 0.05, `beats land ${(worst * 1000).toFixed(0)}ms off the true onset — the phase was not re-anchored`);
});

// ---------------------------------------------------------------------------
// What the browser actually feeds `push`.
// ---------------------------------------------------------------------------

test('a frame with nothing anywhere in it is the absence of data, not a zero', () => {
  // A stream with no Access-Control-Allow-Origin hands the analyser all-zero
  // bins forever. Pushing those would fill the ring with silence and flush a
  // real reading out of the window, so the hold could never do its job.
  assert.equal(tempoEnergyFromBins(new Uint8Array(256)), null, 'a CORS-blocked frame produced an energy');
  assert.equal(tempoEnergyFromBins([]), null);
  assert.equal(tempoEnergyFromBins(null), null);
});

test('REGRESSION: a quiet kick band is a real zero and must reach the ring', () => {
  // ⚠ THE DEFECT THIS REPLAYS. A first cut tested whether the KICK BAND carried
  // anything — which is true of a CORS-blocked frame and equally true of the
  // quiet moment BETWEEN two kicks. Skipping those frames drops exactly the low
  // samples the onset envelope is built from: every remaining sample is a peak,
  // no rises are left to find, and the detector goes quiet on a track with a
  // perfectly good beat. Found by driving the helper, not by reading it.
  const between = new Uint8Array(256);
  for (let i = 8; i < 64; i += 1) between[i] = 255;   // music above the band, band silent
  assert.equal(tempoEnergyFromBins(between), 0, 'the quiet moment between kicks was dropped from the ring');
  // And the frame IS readable, which is the half that separates it from CORS.
  assert.notEqual(tempoEnergyFromBins(between), null);
});

test('the band is the kick band, and energy outside it does not move the reading', () => {
  const kick = new Uint8Array(256);
  kick[0] = 200; kick[1] = 180; kick[2] = 40; kick[3] = 20;
  assert.equal(tempoEnergyFromBins(kick), 110, 'the band mean is not the mean of bins 0..3');

  // Piling energy into every bin ABOVE the band must not change the answer —
  // that is the whole reason the band is narrow. Feeding the whole frame instead
  // buries the kick under vocals and hats, which is the dense-aperiodic case the
  // confirm window had to be added for.
  const loud = Uint8Array.from(kick);
  for (let i = TEMPO_BINS; i < loud.length; i += 1) loud[i] = 255;
  assert.equal(tempoEnergyFromBins(loud), 110, 'energy outside the kick band moved the reading');

  // Non-finite entries are skipped rather than poisoning the mean, because
  // `push` refuses a non-finite sample and a NaN here would silence the ring.
  const ragged = [200, NaN, 200, undefined];
  assert.equal(tempoEnergyFromBins(ragged), 200);
  assert.ok(Number.isFinite(tempoEnergyFromBins(ragged)), 'a ragged frame produced a sample push would refuse');
});

test('the detector carries no wall clock and no randomness', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../mobile-app/src/services/radioTempo.mjs', import.meta.url), 'utf8');
  // Stripped of comments first — this file's own header discusses both.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /Math\.random/, 'the detector must be replayable');
  assert.doesNotMatch(code, /Date\.now|new Date\(/, 'the caller passes t; the module must not read a clock');
  assert.ok(RING_S > 0);
});
