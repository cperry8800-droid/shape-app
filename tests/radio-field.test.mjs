// tests/radio-field.test.mjs
//
// WHY THIS FILE EXISTS: `public/newdesign/radioField.mjs` is the website Radio
// page's field — the wall, the cloud, and the rule that decides which of the two
// the music is currently lighting. Every claim it makes is a claim about a
// MEASUREMENT: the figure advances on a phrase counted off the tempo detector's
// own beat, and the lead is read off the analyser's own low bins. Both of those
// can be made to look right on screen while being wrong, which is what these
// guards are for.
//
// Everything here DRIVES the shipped module. Where a rule has to agree with one
// of the app's own modules — which bins are the kick band — the check runs BOTH
// implementations against the same input rather than restating either.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  radioSeed, radioRng, radioProgram, wallLeadsFor,
  CLOUD_N, CLOUD_FORMS, CLOUD_FORM_NAMES, formJitter, placeForm,
  PHRASE_BEATS, countBeat, phraseOf, cloudForm, morphEase, MORPH_S,
  KICK_ON, KICK_OFF, KICK_RELEASE_S, kickLow, kickEnvNext, kickPresentNext,
  LEAD_MODES, leadTarget, LEAD_TAU, easeLead, wallMix, cloudMix, WALL_GROUND_ALPHA,
  TILE_PX, wallCols, wallRows, wallBand, meterNext, METER_FALL, WALL_METER_SPAN, wallMaskText, WALL_MASK_MIN_COLS,
  WALL_FLOOD_KICK, wallFloods,
  wallWordFit, WALL_WORD_MAX_COLS, WALL_WORD_COL_FRAC, WALL_WORD_ROW_FRAC,
} from '../public/newdesign/radioField.mjs';
import { tempoEnergyFromBins, TEMPO_BINS, tempoBarStep, createTempoDetector } from '../public/newdesign/radioTempo.mjs';
import { bandsFromBins, BANDS } from '../public/newdesign/radioSignalField.mjs';

// ---------------------------------------------------------------------------
// The song's own programme
// ---------------------------------------------------------------------------

test('the seed is a property of the song, not of the page', () => {
  assert.equal(radioSeed('Eyes on Me', 'Samyuel'), radioSeed('Eyes on Me', 'Samyuel'));
  assert.notEqual(radioSeed('Eyes on Me', 'Samyuel'), radioSeed('Floor Program II', 'Tariq Osei'));
  // the two fields are not concatenated ambiguously: a title carrying the
  // separator must not collide with a different title/artist split
  assert.notEqual(radioSeed('a·b', ''), radioSeed('a', 'b'));
  // absent fields are survivable rather than throwing
  for (const v of [undefined, null, '']) {
    assert.equal(Number.isFinite(radioSeed(v, v)), true);
  }
});

test('radioRng is deterministic and stays in [0,1)', () => {
  const a = radioRng(99);
  const b = radioRng(99);
  for (let i = 0; i < 64; i += 1) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1, `rng out of range: ${x}`);
  }
});

test('wallLeads is the seed bit parity, so a song leads the same way everywhere', () => {
  assert.equal(wallLeadsFor(0), false);
  assert.equal(wallLeadsFor(1), true);
  assert.equal(wallLeadsFor(3), false);   // two bits
  assert.equal(wallLeadsFor(7), true);    // three bits
  assert.equal(wallLeadsFor(0xffffffff), false); // thirty-two bits
  // and it is derived, not stored: the same seed always answers the same way
  const p = radioProgram('Ironwood', 'Halden Vos');
  assert.equal(p.wallLeads, wallLeadsFor(p.seed));
});

test('the programme fields are in range for a corpus of songs', () => {
  const songs = [
    ['Eyes on Me', 'Samyuel'], ['Floor Program II', 'Tariq Osei'], ['Ironwood', 'Halden Vos'],
    ['Peak Set', 'Nilo Ceza'], ['Cue the Lift', 'Merit & Sable'], ['', ''], ['x', 'y'],
  ];
  for (const [a, b] of songs) {
    const p = radioProgram(a, b);
    assert.ok(p.form >= 0 && p.form < CLOUD_FORMS.length, `form ${p.form}`);
    assert.ok([1, 3, 5, 7].includes(p.formStep), `formStep ${p.formStep}`);
    assert.ok(p.flood >= 1 && p.flood <= 3, `flood ${p.flood}`);
    assert.equal(typeof p.wallLeads, 'boolean');
  }
});

// ---------------------------------------------------------------------------
// The figures
// ---------------------------------------------------------------------------

test('there are eight formations and every one is named', () => {
  assert.equal(CLOUD_FORMS.length, 8);
  assert.equal(CLOUD_FORM_NAMES.length, CLOUD_FORMS.length);
  assert.equal(new Set(CLOUD_FORM_NAMES).size, CLOUD_FORMS.length);
});

test('every formation places finite points inside a bounded box', () => {
  const buf = new Float32Array(CLOUD_N * 3);
  for (let f = 0; f < CLOUD_FORMS.length; f += 1) {
    placeForm(f, buf);
    let maxAbs = 0;
    for (let i = 0; i < buf.length; i += 1) {
      assert.ok(Number.isFinite(buf[i]), `${CLOUD_FORM_NAMES[f]}: non-finite at ${i}`);
      maxAbs = Math.max(maxAbs, Math.abs(buf[i]));
    }
    // a figure that escaped the box would be drawn off the fold with nothing failing
    assert.ok(maxAbs <= 1.6, `${CLOUD_FORM_NAMES[f]}: reaches ${maxAbs.toFixed(2)}`);
    // and one that collapsed to a dot would render as "the cloud disappeared"
    assert.ok(maxAbs >= 0.5, `${CLOUD_FORM_NAMES[f]}: collapsed at ${maxAbs.toFixed(2)}`);
  }
});

test('placeForm is deterministic and seeded on the FORM, not on the song', () => {
  const a = placeForm(5, new Float32Array(CLOUD_N * 3));
  const b = placeForm(5, new Float32Array(CLOUD_N * 3));
  assert.deepEqual(Array.from(a), Array.from(b));
});

test('no two formations are the same drawing', () => {
  // A figure that duplicated another would morph into itself and read as the
  // cloud having stopped changing.
  const bufs = CLOUD_FORMS.map((_, f) => Array.from(placeForm(f, new Float32Array(CLOUD_N * 3))));
  for (let i = 0; i < bufs.length; i += 1) {
    for (let j = i + 1; j < bufs.length; j += 1) {
      let d = 0;
      for (let k = 0; k < bufs[i].length; k += 1) d += Math.abs(bufs[i][k] - bufs[j][k]);
      const mean = d / bufs[i].length;
      assert.ok(mean > 0.05, `${CLOUD_FORM_NAMES[i]} and ${CLOUD_FORM_NAMES[j]} differ by only ${mean.toFixed(3)}`);
    }
  }
});

test('the structured figures carry no jitter, the others do', () => {
  // rings, record and spectrum are made of concentric or mirrored structure, and
  // jitter smears them into a cloud of nothing.
  assert.equal(formJitter(CLOUD_FORM_NAMES.indexOf('rings')), 0);
  assert.equal(formJitter(CLOUD_FORM_NAMES.indexOf('record')), 0);
  assert.equal(formJitter(CLOUD_FORM_NAMES.indexOf('spectrum')), 0);
  assert.ok(formJitter(CLOUD_FORM_NAMES.indexOf('sphere')) > 0);
  assert.ok(formJitter(CLOUD_FORM_NAMES.indexOf('mark')) > 0);
});

test('the heart is the right way up and the record is flat', () => {
  const buf = new Float32Array(CLOUD_N * 3);
  // the heart: its lobes are the WIDEST part and must sit ABOVE its point, which on
  // a screen axis (+y down) means the widest row has the smaller y. It shipped
  // upside down once; this is the guard for that exact defect.
  placeForm(CLOUD_FORM_NAMES.indexOf('heart'), buf);
  let top = { y: Infinity }; let bottom = { y: -Infinity };
  let wideTop = 0; let wideBottom = 0;
  for (let i = 0; i < CLOUD_N; i += 1) {
    const x = Math.abs(buf[i * 3]); const y = buf[i * 3 + 1];
    if (y < top.y) top = { y };
    if (y > bottom.y) bottom = { y };
  }
  const mid = (top.y + bottom.y) / 2;
  for (let i = 0; i < CLOUD_N; i += 1) {
    const x = Math.abs(buf[i * 3]); const y = buf[i * 3 + 1];
    if (y < mid) wideTop = Math.max(wideTop, x); else wideBottom = Math.max(wideBottom, x);
  }
  assert.ok(wideTop > wideBottom * 1.3, `heart is upside down: top half ${wideTop.toFixed(2)} vs bottom ${wideBottom.toFixed(2)}`);

  // the record: flat in y, round in x/z — the view's tilt is what makes it a record
  placeForm(CLOUD_FORM_NAMES.indexOf('record'), buf);
  let spanY = 0; let spanZ = 0;
  for (let i = 0; i < CLOUD_N; i += 1) {
    spanY = Math.max(spanY, Math.abs(buf[i * 3 + 1]));
    spanZ = Math.max(spanZ, Math.abs(buf[i * 3 + 2]));
  }
  assert.equal(spanY, 0);
  assert.ok(spanZ > 0.5, `record has no depth: ${spanZ}`);
});

test('the stride is coprime with the figure count, so a long song visits every figure', () => {
  for (const step of [1, 3, 5, 7]) {
    const seen = new Set();
    const program = { form: 0, formStep: step };
    for (let phrase = 0; phrase < CLOUD_FORMS.length; phrase += 1) {
      seen.add(cloudForm(program, phrase, 0));
    }
    assert.equal(seen.size, CLOUD_FORMS.length, `stride ${step} visits only ${seen.size}`);
  }
});

test('the figure advances on a phrase, and on a hand-over to the cloud', () => {
  const program = radioProgram('Eyes on Me', 'Samyuel');
  const at0 = cloudForm(program, 0, 0);
  assert.equal(cloudForm(program, 0, 0), at0, 'the same phrase is the same figure');
  assert.notEqual(cloudForm(program, 1, 0), at0, 'a phrase must change the figure');
  assert.notEqual(cloudForm(program, 0, 1), at0, 'a hand-over must change the figure');
  // and the two advance the same sequence rather than two different ones
  assert.equal(cloudForm(program, 1, 0), cloudForm(program, 0, 1));
});

test('a phrase is eight bars and counts only on a CHANGE of the detector step', () => {
  assert.equal(PHRASE_BEATS, 32);
  let s = { beats: 0, lastStep: null };
  // four beats of a bar, each held for several frames
  for (const step of [0, 0, 0, 1, 1, 2, 3, 3, 3, 0]) s = countBeat(s, step);
  assert.equal(s.beats, 5, 'a repeated step is one beat, not many');
  assert.equal(phraseOf(0), 0);
  assert.equal(phraseOf(31), 0);
  assert.equal(phraseOf(32), 1);
  assert.equal(phraseOf(64), 2);
});

test('NO MEASURED TEMPO, NO PHRASE — the figure holds through a breakdown', () => {
  // This is the honesty rule, and it is the reason the counter reads the detector's
  // step rather than the clock. `tempoBarStep` answers null until the detector has
  // settled, so a silent stretch must not advance the figure at all.
  let s = { beats: 0, lastStep: null };
  for (const step of [0, 1, 2, 3]) s = countBeat(s, step);
  const before = s.beats;
  for (let i = 0; i < 600; i += 1) s = countBeat(s, null); // ten seconds of no reading
  assert.equal(s.beats, before, 'a breakdown advanced the beat counter');
  // and the reading really is null in that state — driven, not asserted about
  assert.equal(tempoBarStep(null, 0, 1), null);
  assert.equal(tempoBarStep(128, 0, Infinity), null);
});

test('the figure the page shows is a pure function of programme, phrase and turns', () => {
  const program = radioProgram('Peak Set', 'Nilo Ceza');
  for (const phrase of [0, 1, 7, 100]) {
    for (const turns of [0, 1, 5]) {
      const a = cloudForm(program, phrase, turns);
      const b = cloudForm(program, phrase, turns);
      assert.equal(a, b);
      assert.ok(a >= 0 && a < CLOUD_FORMS.length);
    }
  }
  // unusable input degrades to a figure rather than to NaN, which would index
  // CLOUD_FORMS with undefined and throw inside a draw call
  for (const bad of [undefined, null, NaN, -1]) {
    const f = cloudForm(program, bad, bad);
    assert.ok(Number.isInteger(f) && f >= 0 && f < CLOUD_FORMS.length, `bad phrase ${bad} -> ${f}`);
  }
  assert.equal(cloudForm(null, 0, 0), 0);
});

test('the morph eases from 0 to 1 and is clamped at both ends', () => {
  assert.equal(morphEase(0), 0);
  assert.equal(morphEase(1), 1);
  assert.equal(morphEase(-5), 0);
  assert.equal(morphEase(9), 1);
  assert.ok(morphEase(0.5) > 0.4 && morphEase(0.5) < 0.6);
  let prev = -1;
  for (let u = 0; u <= 1.0001; u += 0.05) {
    const v = morphEase(u);
    assert.ok(v >= prev, 'the morph went backwards');
    prev = v;
  }
  assert.ok(MORPH_S > 0.5 && MORPH_S < 4);
});

// ---------------------------------------------------------------------------
// The hand-over
// ---------------------------------------------------------------------------

test('the lead reads the SAME bins the tempo detector reads', () => {
  // Both implementations are driven against the same frames. If the detector ever
  // widens its kick band, this fails rather than the picture quietly coming to
  // disagree with the reading printed above it.
  const frames = [];
  for (let k = 0; k < 24; k += 1) {
    const bins = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) bins[i] = (i * 7 + k * 31) % 256;
    frames.push(bins);
  }
  for (const bins of frames) {
    const mine = kickLow(bins);
    const theirs = tempoEnergyFromBins(bins);
    // the detector works in raw 0..255; the field wants 0..1, and that scale is the
    // ONLY thing between them
    assert.ok(Math.abs(mine - theirs / 255) < 1e-12, `kickLow ${mine} vs tempoEnergyFromBins/255 ${theirs / 255}`);
  }
  // and the band is genuinely narrow: a frame loud only ABOVE the kick band must
  // not read as a kick
  const highOnly = new Uint8Array(256);
  for (let i = TEMPO_BINS; i < 256; i += 1) highOnly[i] = 255;
  assert.equal(kickLow(highOnly), 0);
});

test('kickLow survives an unreadable frame', () => {
  assert.equal(kickLow(null), 0);
  assert.equal(kickLow([]), 0);
  assert.equal(kickLow(new Uint8Array(256)), 0);
  assert.equal(kickLow([NaN, NaN, NaN, NaN]), 0);
  assert.equal(kickLow([255, 255, 255, 255]), 1);
});

test('the envelope attacks instantly and releases over about a second', () => {
  // instant attack: a kick must reach the lead on the frame it arrives, or the
  // room lights up a beat late
  assert.equal(kickEnvNext(0, 0.9, 1 / 60), 0.9);
  // release: after one release constant it is down to ~37%
  let e = 1;
  e = kickEnvNext(e, 0, KICK_RELEASE_S);
  assert.ok(Math.abs(e - Math.exp(-1)) < 0.01, `after one tau: ${e}`);
  // ⚠ A LONG FRAME MUST DECAY, NOT BE CAPPED. A tab backgrounded for a minute comes
  // back with the envelope at nothing; a capped dt would have it still lit, and the
  // room would light up for a kick that stopped a minute ago.
  assert.ok(kickEnvNext(1, 0, 60) < 1e-9, 'a minute of silence left the envelope lit');
  for (const dt of [0, -1, NaN, undefined, null]) {
    assert.equal(kickEnvNext(0.5, 0, dt), 0.5, `a non-duration dt (${dt}) moved the envelope`);
  }
});

test('the presence rule has hysteresis in both directions', () => {
  assert.equal(kickPresentNext(false, KICK_ON + 0.01), true, 'a loud frame turns it on');
  assert.equal(kickPresentNext(true, KICK_OFF - 0.01), false, 'a silent frame turns it off');
  // the band between the two thresholds holds whatever it was — this is what stops
  // one quiet bar flipping the room's lighting
  const mid = (KICK_ON + KICK_OFF) / 2;
  assert.equal(kickPresentNext(true, mid), true);
  assert.equal(kickPresentNext(false, mid), false);
  assert.ok(KICK_OFF < KICK_ON, 'the thresholds are not a hysteresis');
});

test('a breakdown hands over, and a single quiet frame does not', () => {
  // Driven end to end over the envelope rather than asserted about: four-to-the-
  // floor at 128 BPM, then four bars of nothing, then the kick back.
  const dt = 1 / 60;
  const spb = 60 / 128;
  let env = 0; let present = false;
  const run = (seconds, kicking) => {
    const steps = Math.round(seconds / dt);
    for (let i = 0; i < steps; i += 1) {
      const t = i * dt;
      const u = (t % spb) / spb;
      const low = kicking ? Math.exp(-u * 9) : 0;
      env = kickEnvNext(env, low, dt);
      present = kickPresentNext(present, env);
    }
  };
  run(4, true);
  assert.equal(present, true, 'a running kick did not read as present');
  run(0.4, false);            // one silent beat inside a groove
  assert.equal(present, true, 'one quiet beat flipped the lead');
  run(8, false);              // a real breakdown
  assert.equal(present, false, 'a breakdown never handed over');
  run(1.5, true);
  assert.equal(present, true, 'the kick came back and the wall did not');
});

test('leadTarget: the truth table, including the no-signal case', () => {
  // with signal, the drop decides
  assert.equal(leadTarget('drop', true, true, false), 1);
  assert.equal(leadTarget('drop', true, false, true), 0);
  // ⚠ with NO signal data the SEED decides, so the song keeps an identity rather
  // than the page going dark
  assert.equal(leadTarget('drop', false, false, true), 1);
  assert.equal(leadTarget('drop', false, true, false), 0);
  // per track the seed decides whatever the kick is doing
  assert.equal(leadTarget('track', true, false, true), 1);
  assert.equal(leadTarget('track', true, true, false), 0);
  // both is the flat middle in every state
  for (const hasSig of [true, false]) {
    for (const kick of [true, false]) {
      assert.equal(leadTarget('both', hasSig, kick, true), 0.5);
    }
  }
  // an unknown mode behaves as the default rather than as NaN
  assert.equal(leadTarget(undefined, true, true, false), 1);
  assert.ok(LEAD_MODES.includes('drop') && LEAD_MODES.includes('track') && LEAD_MODES.includes('both'));
});

test('the crossfade takes the same time at 60 fps and at reduced motion', () => {
  // ⚠ THE WHOLE REASON THE EASE TAKES dt. A per-frame lerp hands over fifteen times
  // slower at the 4 fps reduced-motion cadence, so the same crossfade would be a
  // different length depending on the viewer's motion setting.
  const walk = (fps, seconds) => {
    let wl = 1;
    const dt = 1 / fps;
    for (let i = 0; i < Math.round(seconds * fps); i += 1) wl = easeLead(wl, 0, dt);
    return wl;
  };
  const fast = walk(60, 1.2);
  const slow = walk(4, 1.2);
  assert.ok(Math.abs(fast - slow) < 0.02, `60 fps -> ${fast}, 4 fps -> ${slow}`);
  // it actually converges rather than creeping
  assert.ok(walk(60, 4) === 0, 'the ease never lands on its target');
  // and it moves in the right direction and stays in range
  let wl = 0;
  for (let i = 0; i < 300; i += 1) wl = easeLead(wl, 1, 1 / 60);
  assert.equal(wl, 1);
  for (const bad of [NaN, undefined, null]) {
    const v = easeLead(0.5, bad, 1 / 60);
    assert.ok(Number.isFinite(v), `target ${bad} -> ${v}`);
  }
  assert.ok(LEAD_TAU > 0.1 && LEAD_TAU < 2);
});

test('neither half ever leaves the screen', () => {
  // The wall at 0 is the venue before doors; the cloud at 1 is embers. A mix that
  // reached zero would make the composed field a hard alternation, which is the
  // thing it was built not to be.
  for (const wl of [0, 0.25, 0.5, 0.75, 1]) {
    const w = wallMix(wl);
    const c = cloudMix(wl);
    assert.ok(w.meter > 0 && c.light > 0, `wl ${wl} put a half at zero`);
    assert.ok(w.meter <= 1 && c.light <= 1 && c.size <= 1.01, `wl ${wl} out of range`);
  }
  assert.ok(WALL_GROUND_ALPHA > 0, 'the wall tiles vanish at rest');
  // and the two move in opposite directions
  assert.ok(wallMix(1).meter > wallMix(0).meter);
  assert.ok(cloudMix(1).light < cloudMix(0).light);
});

// ---------------------------------------------------------------------------
// The wall
// ---------------------------------------------------------------------------

test('the centre column of the wall shows the bass', () => {
  // ⚠ DRIVEN THROUGH THE REAL `bandsFromBins`, NOT ASSERTED ABOUT THE MAP. Its own
  // band array is ALREADY mirrored — bands 15 and 16 read bin 0 — so a column map
  // that mirrors again puts the bass a quarter in from each edge and a trough in the
  // middle. That renders, animates, and satisfies any assertion written about the
  // mapping rather than about the picture, which is why this asks the picture.
  const bins = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) bins[i] = Math.round(255 * Math.exp(-i / 6));  // a kick: all bass
  const bands = bandsFromBins(bins, BANDS);
  const cols = 80;
  const heights = [];
  for (let c = 0; c < cols; c += 1) heights.push(bands[wallBand(c, cols, BANDS)]);
  // ⚠ THE PEAK IS A PLATEAU, SO ITS CENTRE IS WHAT IS COMPARED. Bands 15 and 16 both
  // read bin 0, and with 80 columns over 32 bands several columns land on each — so
  // `the first index of the maximum` sits at the plateau's left edge and reads as an
  // off-centre bass. The first version of this assertion did exactly that and failed
  // on a correct map.
  const top = Math.max(...heights);
  const plateau = heights.map((v, c) => (v >= top - 1e-9 ? c : -1)).filter((c) => c >= 0);
  const peak = (plateau[0] + plateau[plateau.length - 1]) / 2;
  assert.ok(Math.abs(peak - (cols - 1) / 2) <= 2.5, `the loudest columns centre on ${peak} of ${cols}, not the middle`);
  // and exactly ONE hump: walking out from the centre the level only falls
  for (let c = Math.floor(cols / 2); c < cols - 1; c += 1) {
    assert.ok(heights[c + 1] <= heights[c] + 1e-9, `a second hump: column ${c + 1} is louder than ${c}`);
  }
  assert.ok(heights[Math.floor(cols / 2)] > heights[0] * 2, 'the centre is not meaningfully louder than the edge');
});

test('the wall spans its band array end to end, whatever the column count', () => {
  for (const n of [1, 2, 3, 17, 80, 161]) {
    const seen = new Set();
    for (let c = 0; c < n; c += 1) {
      const b = wallBand(c, n, BANDS);
      assert.ok(Number.isInteger(b) && b >= 0 && b < BANDS, `cols ${n} col ${c} -> ${b}`);
      seen.add(b);
    }
    if (n > 1) {
      assert.equal(wallBand(0, n, BANDS), 0, `cols ${n}: the first column is not the first band`);
      assert.equal(wallBand(n - 1, n, BANDS), BANDS - 1, `cols ${n}: the last column is not the last band`);
    }
    // a wide wall reaches every band rather than showing a few of them repeatedly
    if (n >= BANDS) assert.equal(seen.size, BANDS, `cols ${n} reached only ${seen.size} bands`);
  }
  // an out-of-range column is clamped rather than indexing past the array
  assert.equal(wallBand(-5, 40, BANDS), 0);
  assert.equal(wallBand(999, 40, BANDS), BANDS - 1);
});

test('the meters are given part of the wall, not all of it', () => {
  // Run full height they fill the fold and the wordmark is behind a bar chart.
  assert.ok(WALL_METER_SPAN > 0.2 && WALL_METER_SPAN < 0.8, `span ${WALL_METER_SPAN}`);
});

test('the wall says less when it has fewer tiles to say it with', () => {
  // Eleven characters over the 24 columns a 390px screen gives is two tiles a letter:
  // it renders as noise rather than as a word, which is worse than a shorter wordmark.
  assert.equal(wallMaskText(wallCols(1440)), 'SHAPE RADIO');
  assert.equal(wallMaskText(wallCols(390)), 'SHAPE');
  assert.equal(wallMaskText(wallCols(320)), 'SHAPE');
  // the threshold is crossed in the right direction, and a missing count degrades to
  // the short form rather than to undefined
  assert.equal(wallMaskText(WALL_MASK_MIN_COLS), 'SHAPE RADIO');
  assert.equal(wallMaskText(WALL_MASK_MIN_COLS - 1), 'SHAPE');
  for (const bad of [undefined, null, NaN, -1]) assert.equal(wallMaskText(bad), 'SHAPE');
  // and the short form is always a word the grid can actually hold
  assert.ok(wallCols(320) >= 'SHAPE'.length * 2, 'even the short wordmark has under two columns a letter at 320px');
});

test('the tile grid degrades rather than throwing on a zero-sized canvas', () => {
  // a hidden fold has a 0x0 canvas, and a draw that divides by it must not produce
  // a negative or NaN column count
  assert.equal(wallCols(0), 0);
  assert.equal(wallRows(0), 0);
  assert.equal(wallCols(-100), 0);
  assert.equal(wallCols(NaN), 0);
  assert.equal(wallCols(1280), Math.floor(1280 / TILE_PX));
  assert.equal(wallRows(640), Math.floor(640 / TILE_PX));
});

// ── the wordmark is the same size on every monitor ──────────────────────────────
// ⚠ THESE DRIVE THE SHIPPED RULE RATHER THAN RESTATING IT. The probe that first
// "verified" this change reimplemented buildMask's old literals and therefore
// measured the OLD rule against a page running the new one — it reported the fix as
// not landed. A guard that reimplements the thing it measures is measuring itself.

// ⚠ THE MEASURED METRIC, RECORDED WHERE AN ASSERTION READS IT. Advance widths of the
// wall's two words in MASK CELLS, Anybody 600, measured in Chromium with the real face
// served locally (the width axis was proven live first: the same string is 197px at
// 'wdth' 50 and 1002px at 'wdth' 150, where a fallback measures identically both ways).
// It lives here rather than in a comment because a measurement no assertion reads is a
// claim — and the whole change rests on WALL_WORD_MAX_COLS selecting font 11.
// ⚠ DERIVED FROM THE GRID, NOT TYPED. The narrowest fold this page is designed for is
// a 1280px window, and how many columns that is depends on TILE_PX — so it is asked
// rather than remembered. Every guard below that says "the narrowest desktop fold" means
// this number; a literal would go stale the day the tile size moves and would keep
// passing while the anchor stopped binding where the module says it binds.
const NARROWEST_DESKTOP_PX = 1280;
const NARROWEST_DESKTOP_COLS = wallCols(NARROWEST_DESKTOP_PX);

const WORD_CELLS = {
  'SHAPE RADIO': { 6: 38.12, 7: 44.47, 8: 50.82, 9: 57.18, 10: 63.53, 11: 69.88, 12: 76.24, 13: 82.59 },
  SHAPE: { 6: 19.02, 7: 22.19, 8: 25.36, 9: 28.53, 10: 31.70, 11: 34.87, 12: 38.04, 13: 41.21 },
};

test('the anchor is the value that actually selects the intended font step', () => {
  // ⚠ WITHOUT THIS THE ANCHOR IS ONLY PINNED TO ITSELF. The three structural guards
  // below say the budget is ONE number, that the fold binds under it, and that it
  // binds at 80 columns — and every one of them passes for ANY anchor in
  // (56.32, 69.88), which resolves to font 10 and shrinks the wordmark a step at
  // EVERY desktop width. Measured: WALL_WORD_MAX_COLS = 66 leaves all the other
  // guards green while the word goes 1120x128 -> 992x112 everywhere.
  const w = WORD_CELLS['SHAPE RADIO'];
  assert.ok(WALL_WORD_MAX_COLS >= w[11],
    `the anchor ${WALL_WORD_MAX_COLS} is below 'SHAPE RADIO' at font 11 (${w[11]} cells), ` +
    'so the fitting loop drops to font 10 and the wordmark is a step smaller on every monitor');
  assert.ok(WALL_WORD_MAX_COLS < w[12],
    `the anchor ${WALL_WORD_MAX_COLS} admits font 12 (${w[12]} cells), which no desktop fold's ` +
    'own share can hold — the word would be one size on a wide fold and another on a narrow one');

  // and the WIDTH condition in the comment is this arithmetic, not a remembered number.
  // ⚠ THE TWO SIDES ARE DERIVED SEPARATELY AND THE CLAIM IS THAT THEY MEET. The left is
  // a fact about the FONT (how many cells 'SHAPE RADIO' needs at font 11, divided by the
  // fold's own share); the right is a fact about the GRID (how many columns a 1280px fold
  // has at TILE_PX). Writing either as a literal 80 would hide that the module's whole
  // choice of anchor rests on their coinciding — change TILE_PX and the right side moves
  // while the left does not, which is exactly when someone needs to be told. Measured:
  // TILE_PX 16 -> 20 takes the narrowest fold to 64 columns and this guard fails naming
  // both sides; with NARROWEST_DESKTOP_COLS written as the literal 80 the same tree is
  // GREEN. The literal is a no-op today and blind the day the grid moves.
  const floorCols = Math.ceil(w[11] / WALL_WORD_COL_FRAC);
  assert.equal(floorCols, NARROWEST_DESKTOP_COLS,
    `the anchor's width floor is ${floorCols} columns and the narrowest desktop fold is ` +
    `${NARROWEST_DESKTOP_COLS} — they no longer meet, so wallWordFit's comment is stale`);
});

test('the wordmark budget is a tile count, so it stops growing with the monitor', () => {
  // The measured fold widths, as column counts (fold px / TILE_PX). The word used to
  // run 1120px wide at 1280 and 1712px at 3440 because both of its bounds were
  // fractions OF THE GRID; above the anchor the budget must now be one number.
  const desktop = [NARROWEST_DESKTOP_COLS, 85, 90, 105, 120, 160, 215, 240];
  const budgets = new Set(desktop.map((c) => wallWordFit(c, 41).maxCols));
  assert.equal(budgets.size, 1, `the budget still varies across the desktop range: ${[...budgets]}`);
  assert.equal([...budgets][0], WALL_WORD_MAX_COLS);

  // ⚠ AND THE ANCHOR MUST BIND AT THE NARROWEST DESKTOP WIDTH, or this passes for the
  // wrong reason: two different budgets can still paint the same word if the fitting
  // loop happens to land on the same step, which is a fact about the font metrics
  // rather than about the design.
  assert.ok(NARROWEST_DESKTOP_COLS * WALL_WORD_COL_FRAC >= WALL_WORD_MAX_COLS,
    `the anchor ${WALL_WORD_MAX_COLS} exceeds the narrowest desktop fold's own share ` +
    `${NARROWEST_DESKTOP_COLS * WALL_WORD_COL_FRAC}`);
});

test('below the anchor the fold\'s own width still binds, so a phone shrinks the word', () => {
  // A budget that stayed at the anchor on a 354px fold would run the word off the
  // screen. The fold's share has to win when it is the smaller of the two.
  for (const cols of [17, 22, 41, 47, 64]) {
    const fit = wallWordFit(cols, 35);
    assert.equal(fit.maxCols, cols * WALL_WORD_COL_FRAC, `cols ${cols} ignored the fold`);
    assert.ok(fit.maxCols < WALL_WORD_MAX_COLS, `cols ${cols} did not shrink`);
  }
  // and the two rules meet at the anchor rather than jumping
  const meet = Math.ceil(WALL_WORD_MAX_COLS / WALL_WORD_COL_FRAC);
  assert.ok(wallWordFit(meet, 41).maxCols === WALL_WORD_MAX_COLS);
  assert.ok(wallWordFit(meet - 1, 41).maxCols < WALL_WORD_MAX_COLS);
});

test('the width budget binds on a normal fold and the row fraction binds on a short one', () => {
  // ⚠ THE BOUNDARY IS RECORDED RATHER THAN DISCOVERED. The constant 1120x128 is a
  // claim about WIDTH and it carries a height condition: the loop only ever shrinks,
  // so it can reach the width-bound step only from a start at or above it. Measured,
  // 'SHAPE RADIO' is 69.88 mask cells at font 11 and 63.53 at 10, so a fold that
  // starts at 11 or higher lands on 11 and one that starts at 10 stays there.
  // floor(rows * 0.42) >= 11 from 27 rows up; a 420px fold is 26 and starts at 10.
  for (const rows of [27, 32, 33, 35, 41]) {
    assert.ok(wallWordFit(90, rows).startCell >= 11,
      `a ${rows}-row fold starts below the width-bound step, so the word shrinks with the fold`);
  }
  // and the floor case is a FACT about the design, not an accident: a 420px fold is
  // 26 rows and deliberately gets a smaller word, because a 128px word is 30% of it
  assert.equal(wallWordFit(90, 26).startCell, 10);
  assert.ok(wallWordFit(90, 26).startCell < 11);
});

test('the word is centred on a whole column, not a half one', () => {
  // ⚠ THE MASK IS SAMPLED ON INTEGER COLUMNS. A word centred at cols/2 rounds
  // differently depending on whether `cols` is odd or even, which measured as a
  // one-tile jitter — the painted word moved between 1104 and 1120px across the
  // desktop range while everything else about it was constant.
  // ⚠ AND "IS AN INTEGER" IS NOT "IS CENTRED". A first version asserted only
  // `centreCol === Math.round(centreCol)`, which is trivially true of every integer —
  // measured, `Math.round(c / 2) + 1` passed the whole suite while putting the word a
  // tile off centre at every width. The snap has to land within half a tile of the
  // grid's true middle, which is the most any integer column can promise.
  for (const cols of [79, 80, 85, 90, 119, 215, 240]) {
    const { centreCol } = wallWordFit(cols, 41);
    assert.equal(centreCol, Math.round(centreCol), `cols ${cols} centred on a half column`);
    assert.ok(Math.abs(centreCol - cols / 2) <= 0.5,
      `cols ${cols} centres the word at column ${centreCol}, ${Math.abs(centreCol - cols / 2)} columns off the middle`);
  }
  // ⚠ THE TRADE, RECORDED: on an ODD column count there is no exact middle column, so
  // the snap sits half a tile (8px) right of the grid's centre — 119 columns centres at
  // 60, i.e. 960px against a true middle of 952. That is the cost of killing a
  // one-tile jitter, and it is fixed and symmetric rather than varying with the monitor.
  assert.equal(wallWordFit(119, 41).centreCol, 60);
  assert.equal(wallWordFit(120, 41).centreCol, 60);
});

test('the word fit degrades rather than throwing on a zero-sized canvas', () => {
  // the same contract wallCols/wallRows carry: a hidden fold is 0x0
  for (const bad of [0, -100, NaN, undefined, null]) {
    const fit = wallWordFit(bad, bad);
    assert.ok(Number.isFinite(fit.maxCols) && fit.maxCols >= 0, `maxCols ${fit.maxCols}`);
    assert.ok(Number.isFinite(fit.startCell) && fit.startCell >= 1, `startCell ${fit.startCell}`);
    assert.ok(Number.isFinite(fit.centreCol) && fit.centreCol >= 0, `centreCol ${fit.centreCol}`);
  }
});

test('the grid itself is untouched, because four things depend on its derivation', () => {
  // ⚠ THIS IS THE GUARD AGAINST THE TEMPTING FIX. Making the column count fixed and
  // the tile size derived would make the word constant too — and would break
  // `wallCols`/`wallRows` as the renderer's zero-size guard, turn WALL_MASK_MIN_COLS
  // (a column count standing in for 704 PHYSICAL px) into a compile-time constant,
  // invalidate WALL_METER_SPAN's measurement against 41 rows, and break TILE_PX as
  // the drawing PITCH. The word is bounded instead; the grid still tracks the fold.
  assert.ok(wallCols(3440) > wallCols(1280), 'the grid stopped tracking the fold width');
  assert.ok(wallRows(660) > wallRows(420), 'the grid stopped tracking the fold height');
  assert.equal(wallCols(0), 0, 'the zero-size guard stopped being reachable');
});

test('a meter rises instantly and falls slowly', () => {
  assert.equal(meterNext(0, 1), 1, 'a meter did not rise on the frame the band arrived');
  const fallen = meterNext(1, 0);
  assert.ok(fallen < 1 && fallen > 0.5, `one frame of silence dropped it to ${fallen}`);
  let m = 1;
  for (let i = 0; i < 200; i += 1) m = meterNext(m, 0);
  assert.ok(m < 0.01, `the meter never fell: ${m}`);
  assert.ok(METER_FALL > 0 && METER_FALL < 1);
  for (const bad of [NaN, undefined, null]) {
    assert.ok(Number.isFinite(meterNext(bad, 0.5)), `prev ${bad}`);
    assert.ok(Number.isFinite(meterNext(0.5, bad)), `v ${bad}`);
  }
});

// ---------------------------------------------------------------------------
// The module's own contract
// ---------------------------------------------------------------------------

test('the field imports the app\'s modules rather than restating them', () => {
  // The whole "in sync" claim rests on this: the website adds a renderer, never a
  // rule. A copy of `ecg` or a retyped kick band would let the two surfaces drift
  // with nothing failing.
  const src = readFileSync(new URL('../public/newdesign/radioField.mjs', import.meta.url), 'utf8');
  assert.match(src, /import \{[^}]*\becg\b[^}]*\} from '\.\/radioSignalField\.mjs'/,
    'the ECG figure must come from the app\'s own module');
  assert.match(src, /import \{[^}]*\btempoEnergyFromBins\b[^}]*\} from '\.\/radioTempo\.mjs'/,
    'the kick band must come from the detector, not be re-derived');
  // ⚠ AND THE LEAD MUST CALL IT RATHER THAN RE-READING THE BINS. Two loops over the
  // same bins are two implementations that agree today; this is what makes them one.
  const body = src.replace(/\/\/[^\n]*/g, '');
  assert.match(body, /export function kickLow\(bins\) \{\s*const e = tempoEnergyFromBins\(bins\);/,
    'kickLow must delegate to the detector\'s own helper');
  assert.ok(!/TEMPO_BINS/.test(body), 'the band width is being read directly again rather than delegated');
});

test('the detector really does answer null before it settles, and a number after', () => {
  // A positive control for the honesty rule above: if this ever stopped being true,
  // "no measured tempo, no phrase" would be guarding a state that cannot happen and
  // the figure would in fact be advancing on something else.
  const det = createTempoDetector();
  assert.equal(det.read(0), null, 'the detector claimed a tempo before any audio');
  const spb = 60 / 128;
  const dt = 1 / 60;
  let settled = null;
  for (let i = 0; i < Math.round(20 / dt); i += 1) {
    const t = i * dt;
    const u = (t % spb) / spb;
    det.push(t, Math.exp(-u * 9));
    const r = det.read(t);
    if (r && r.bpm) settled = r;
  }
  assert.ok(settled, 'the detector never settled on a clean 128 BPM kick');
  assert.ok(Math.abs(settled.bpm - 128) < 2, `settled at ${settled && settled.bpm}`);
  assert.ok(settled.step === null || (settled.step >= 0 && settled.step < 4));
});

test('the flood lights the song\'s own band, and only on a kick that hits', () => {
  // The rule moved here out of the canvas (Codex, #2101), so this is the first
  // time it can be driven at all. `row` is counted from the TOP of the wall and
  // `floodRows` is the depth of the programmed band at the BOTTOM, which is the
  // one thing about it that is easy to get backwards.
  const rows = 12;
  const band = 4;                       // so rows 8..11 are the band
  assert.equal(wallFloods(11, rows, band, 0.9), true, 'the bottom row did not flood on a hard kick');
  assert.equal(wallFloods(8, rows, band, 0.9), true, 'the top of the band did not flood');
  assert.equal(wallFloods(7, rows, band, 0.9), false, 'the row ABOVE the band flooded — the band is upside down');
  assert.equal(wallFloods(0, rows, band, 0.9), false, 'the top of the wall flooded');

  // and the kick has to actually hit
  assert.equal(wallFloods(11, rows, band, WALL_FLOOD_KICK), false, 'the threshold is inclusive — a kick exactly at it floods');
  assert.equal(wallFloods(11, rows, band, WALL_FLOOD_KICK + 1e-6), true, 'a kick just over the threshold did not flood');
  assert.equal(wallFloods(11, rows, band, 0), false, 'silence floods the wall');

  // a song whose programme carries no band can never flood, whatever the kick
  assert.equal(wallFloods(11, rows, 0, 1), false, 'a zero-row band flooded');
});

test('the flood threshold is its own number, and is NOT the hand-over hysteresis', () => {
  // ⚠ THE TIDY-UP THIS GUARD EXISTS TO REFUSE. KICK_ON/KICK_OFF are a hysteresis
  // PAIR for a different question — is a kick present at all — and the gap
  // between them is what stops the lead flickering on a borderline one. The
  // flood asks how hard a kick must hit before the programmed band lights.
  // Collapsing them would make the wall's brightest moment a side effect of a
  // decision about which half of the field is leading.
  assert.ok(WALL_FLOOD_KICK > 0 && WALL_FLOOD_KICK < 1, 'the flood threshold left the 0..1 range the kick is measured in');
  assert.notEqual(WALL_FLOOD_KICK, KICK_ON, 'the flood threshold was collapsed onto the hand-over hysteresis');

  // and it sits INSIDE the hysteresis band, which is the property that matters:
  // a kick strong enough to flood is not yet necessarily strong enough to hand
  // the lead over, so the wall lights before the field commits.
  assert.ok(WALL_FLOOD_KICK > KICK_OFF && WALL_FLOOD_KICK < KICK_ON,
    `the flood threshold (${WALL_FLOOD_KICK}) left the hysteresis band ${KICK_OFF}..${KICK_ON}`);
});
