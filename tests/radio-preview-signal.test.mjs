// THE PREVIEW MAY DRAW A SIMULATED STATION — AND ONLY THE PREVIEW, AND ONLY
// OVER SILENCE, AND ONLY SAYING SO.
//
// WHY THIS FILE EXISTS: the Radio page draws its instrument from the analyser,
// so with no configured station (`radio_station.stream_url` is null in
// production) every visitor sees the honest resting state — a dashed baseline,
// an unlit counter, "— BPM". For a MEMBER that is right and stays right. For
// someone previewing the app it showed a product that looks broken, so the
// owner ruled (2026-09-15): "i want to show what it would look like for someone
// previewing the app, demo mode/view".
//
// A fabricated signal is the one thing this page was built to refuse, so the
// permission is fenced by three properties and this file guards all three:
//   1. it is drawn ONLY for a previewing visitor, and never over a real frame;
//   2. the page SAYS it is an example, in place of the broadcast claim;
//   3. a member is never shown it — including while the gate is still settling.
//
// Spec: docs/WORKLOG.md 2026-09-15 (the Radio entry's registered owner call).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';
import {
  previewBins, previewSimOn, hasSignal, railRms, railBarsLit, RAIL_BARS,
  PREVIEW_BPM, PREVIEW_BINS,
} from '../public/newdesign/radioSignalField.mjs';
import {
  createTempoDetector, tempoEnergyFromBins, tempoBarStep,
} from '../public/newdesign/radioTempo.mjs';

const SRC = new URL('../mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx', import.meta.url);
const CATALOGS = new URL('../mobile-app/src/i18n/catalogs/', import.meta.url);
const raw = readFileSync(SRC, 'utf8');
// Comments legitimately name the retired claim while explaining why it is gone.
const code = stripComments(raw);

// Brace-matched slice, with a floor.
//
// ⚠ THE PARAMETER LIST HAS TO BE SKIPPED, AND THE FIRST VERSION OF THIS DID
// NOT. Every component here takes a DESTRUCTURED parameter — `function
// BSRadioSignalField({ paused, ... })` — so counting braces from the first `{`
// opens and closes on the parameter list and hands back the SIGNATURE, after
// which every assertion made against it is vacuously true. The same defect this
// repo fixed in #2032 and paid for again here; the length floor below is the
// only reason it surfaced rather than reporting a clean pass.
function slice(src, needle) {
  const i = src.indexOf(needle);
  assert.ok(i >= 0, `could not find ${needle}`);
  let k = src.indexOf('(', i);
  assert.ok(k > i, `no parameter list after ${needle}`);
  let paren = 0;
  for (; k < src.length; k += 1) {
    if (src[k] === '(') paren += 1;
    else if (src[k] === ')') { paren -= 1; if (paren === 0) break; }
  }
  const start = src.indexOf('{', k);
  assert.ok(start > k, `no body after the parameter list of ${needle}`);
  let d = 0;
  for (let j = start; j < src.length; j += 1) {
    const c = src[j];
    if (c === '{') d += 1;
    else if (c === '}') { d -= 1; if (d === 0) return src.slice(i, j + 1); }
  }
  throw new Error(`unbalanced braces from ${needle}`);
}

// ── 1. the rule: only a preview, only over silence ──────────────────────────

test('previewSimOn requires BOTH a preview and an empty frame', () => {
  assert.equal(previewSimOn(true, false), true, 'a previewing visitor over silence simulates');
  assert.equal(previewSimOn(true, true), false, 'a real frame always wins');
  assert.equal(previewSimOn(false, false), false, 'a member over silence sees the honest empty');
  assert.equal(previewSimOn(false, true), false, 'a member with a signal sees the signal');
  // Anything that is not an explicit preview is not a preview.
  for (const v of [undefined, null, 0, '', NaN]) {
    assert.equal(previewSimOn(v, false), false, `${String(v)} is not a preview`);
  }
});

test('the field asks the rule, and asks it AFTER reading the analyser', () => {
  const body = slice(code, 'function BSRadioSignalField(');
  assert.ok(body.length > 4000, 'brace matcher returned a stub, not the component');
  assert.match(body, /previewSimOn\(\s*cfg\.preview\s*,\s*realSignal\s*\)/,
    'the component must take the decision from the shared rule, not re-spell it inline');
  const iRead = body.indexOf('getByteFrequencyData');
  const iSim = body.indexOf('previewSimOn(');
  assert.ok(iRead >= 0 && iSim > iRead,
    'the analyser is read BEFORE the simulation is considered — reversing them would let a simulated frame displace a real one');
  // The simulated frame never shares the analyser's buffer.
  assert.match(body, /simBinsRef\.current\s*=\s*new Uint8Array\(PREVIEW_BINS\)/);
  assert.match(body, /previewBins\(\s*simBinsRef\.current\s*,\s*t\s*\)/);
  assert.ok(!/previewBins\(\s*binsRef\.current/.test(body),
    'the simulation must not write into the analyser frame');
});

test('a preview has no playback to pause, and the heart half is untouched', () => {
  const body = slice(code, 'function BSRadioSignalField(');
  assert.match(body, /const pausedEff = sim \? false : !!cfg\.paused/);
  // Every station-half gate reads the effective pause. `paused` seeds TRUE for
  // a first-time visitor (no stored radio preference), so a station half still
  // reading cfg.paused would reset the detector on frame one and hold the
  // reading at null forever — bars over a rail that never names a tempo.
  const stray = body.split('\n').filter((l) => /cfg\.paused/.test(l) && !/const pausedEff/.test(l));
  assert.deepEqual(stray, [], `station-half sites must read pausedEff, found: ${stray.join(' | ')}`);
});

// ── 2. the simulated frame is a real enough station ─────────────────────────

test('previewBins is deterministic in t, and moves with it', () => {
  const a = previewBins(new Uint8Array(PREVIEW_BINS), 1.25);
  const b = previewBins(new Uint8Array(PREVIEW_BINS), 1.25);
  assert.deepEqual(Array.from(a), Array.from(b), 'same t must give the same frame');
  const c = previewBins(new Uint8Array(PREVIEW_BINS), 1.25 + 60 / PREVIEW_BPM / 4);
  assert.ok(Array.from(a).some((v, i) => v !== c[i]), 'a static frame would draw static bars');
});

test('previewBins yields a frame every downstream reader accepts', () => {
  const f = previewBins(new Uint8Array(PREVIEW_BINS), 3.0);
  assert.equal(hasSignal(f), true, 'the whole instrument is gated on hasSignal');
  for (let i = 0; i < f.length; i += 1) {
    assert.ok(Number.isInteger(f[i]) && f[i] >= 0 && f[i] <= 255, `bin ${i} out of range`);
  }
  const lit = railBarsLit(railRms(f), RAIL_BARS);
  assert.ok(lit > 0 && lit <= RAIL_BARS, `the rail meter should light off it, got ${lit}`);
});

test('previewBins survives a non-finite or negative clock', () => {
  // The concept board's waterfall pre-fill ran its generator at negative time
  // and the kick envelope inverted into a blow-up. A phase is only a phase for
  // t >= 0 unless it is written not to be.
  for (const t of [-5, -0.001, NaN, undefined, Infinity]) {
    const f = previewBins(new Uint8Array(PREVIEW_BINS), t);
    for (let i = 0; i < f.length; i += 1) {
      assert.ok(f[i] >= 0 && f[i] <= 255, `t=${String(t)} bin ${i} = ${f[i]}`);
    }
  }
});

test('the SHIPPED detector settles on the tempo the preview claims', () => {
  // The strongest guard here: not "some numbers came out" but "the real tempo
  // detector, fed this frame at the real frame rate, publishes PREVIEW_BPM".
  // A generator that drew plausible bars but carried no beat would pass every
  // assertion above and leave the rail reading "—" forever.
  const det = createTempoDetector({});
  const buf = new Uint8Array(PREVIEW_BINS);
  let firstAt = null;
  for (let i = 0; i <= 60 * 16; i += 1) {
    const t = i / 60;
    previewBins(buf, t);
    const e = tempoEnergyFromBins(buf);
    assert.notEqual(e, null, `frame at ${t.toFixed(2)}s carried no tempo energy`);
    det.push(t, e);
    if (firstAt == null && det.read(t)) firstAt = t;
  }
  const read = det.read(16);
  assert.ok(read, 'the detector never settled on the preview station');
  assert.equal(Math.round(read.bpm), PREVIEW_BPM);
  assert.ok(firstAt != null && firstAt < 10, `first reading took ${firstAt}s`);
  // And the four-beat counter steps off it, which is what makes the tempo
  // visible as a rhythm rather than as a number.
  const step = tempoBarStep(read.bpm, read.phase, 12, 4);
  assert.ok(Number.isInteger(step) && step >= 0 && step < 4, `bar step ${step}`);
});

// ── 3. the page says so, in place of the broadcast claim ────────────────────

test('the rail replaces the ON AIR claim rather than sitting beside it', () => {
  const body = slice(code, 'function BSRadioScreen(');
  assert.ok(body.length > 4000, 'brace matcher returned a stub, not the screen');
  assert.match(body, /const previewSim = useBSRadioPreview\(\)/);
  assert.match(body, /preview=\{previewSim\}/, 'the field must be told');
  // The blinking red dot is the broadcast claim; it may not render on a
  // simulated station.
  const dot = body.split('\n').find((l) => l.includes("background: '#ff5b4a'"));
  assert.ok(dot, 'the on-air dot moved — re-anchor this guard');
  assert.ok(/!previewSim &&/.test(dot), 'the on-air dot must be gated on NOT previewing');
  assert.match(body, /previewSim\s*\n?\s*\?\s*tr\('radio:rail\.preview'/);
  assert.match(body, /tr\('radio:rail\.exampleSignal'/);
});

test('the example label does not wear the reading face', () => {
  // Doto is this page's numeral face because "every measured figure reads like
  // a reading" (the 2026-09-10 type ruling). The session clock is a reading and
  // keeps it; a label that said "example" in it would be claiming to be one.
  const body = slice(code, 'function BSRadioScreen(');
  const i = body.indexOf("tr('radio:rail.exampleSignal'");
  assert.ok(i > 0);
  const block = body.slice(Math.max(0, i - 400), i);
  assert.ok(!block.includes('BS_DOTO'), 'the example label must not be set in the reading face');
  assert.match(block, /fontFamily: t\.MONO/);
});

test('only an explicit ShapeCanChat === false is a preview', () => {
  // The direction is the safety property: `undefined` (the shell has not
  // published the flag yet) must read as MEMBER, so a real member is never
  // shown a fabricated signal on the first frames of a cold launch.
  const hook = slice(code, 'function useBSRadioPreview(');
  assert.ok(hook.length > 200, 'brace matcher returned a stub, not the hook');
  assert.match(hook, /window\.ShapeCanChat === false/);
  assert.ok(!/ShapeCanChat\s*!==\s*true/.test(hook), 'a !== true test would treat undefined as a preview');
  assert.ok(!/!\s*window\.ShapeCanChat/.test(hook), 'a truthiness test would treat undefined as a preview');
  assert.match(hook, /addEventListener\('shape:canchat'/, 'the flag arrives on an event; a one-shot read misses it');
});

// ── 4. the copy exists everywhere it renders ───────────────────────────────

test('both new keys are in all 13 catalogs, none left as English', () => {
  const locales = readdirSync(CATALOGS).filter((d) => !d.startsWith('.'));
  assert.equal(locales.length, 13, `expected 13 locales, found ${locales.length}`);
  const en = JSON.parse(readFileSync(new URL('en/radio.json', CATALOGS), 'utf8'));
  for (const key of ['rail.preview', 'rail.exampleSignal']) {
    assert.ok(en[key], `en is missing ${key}`);
    for (const L of locales) {
      const d = JSON.parse(readFileSync(new URL(`${L}/radio.json`, CATALOGS), 'utf8'));
      assert.ok(d[key], `${L} is missing ${key}`);
      assert.equal(typeof d[key], 'string');
      assert.ok(d[key].trim().length > 0, `${L}.${key} is blank`);
      // pcm is an English-lexifier creole and legitimately matches en.
      if (L !== 'en' && L !== 'pcm') {
        assert.notEqual(d[key], en[key], `${L}.${key} is still the English string`);
      }
    }
  }
});

test('the rendered default matches the catalog, so the screen and en agree', () => {
  const en = JSON.parse(readFileSync(new URL('en/radio.json', CATALOGS), 'utf8'));
  for (const [key, value] of Object.entries({
    'rail.preview': en['rail.preview'],
    'rail.exampleSignal': en['rail.exampleSignal'],
  })) {
    const re = new RegExp(`tr\\('radio:${key.replace('.', '\\.')}',\\s*\\{ defaultValue: '([^']+)' \\}\\)`);
    const m = raw.match(re);
    assert.ok(m, `no call site found for ${key}`);
    assert.equal(m[1], value, `the JSX defaultValue for ${key} disagrees with the catalog, which is what renders`);
  }
});
