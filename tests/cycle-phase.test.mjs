// tests/cycle-phase.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IntlMessageFormat } from 'intl-messageformat';
import { bsDeriveCycle, bsCycleRead } from '../public/newdesign/cyclePhase.mjs';
import { ACTIVE_LOCALES } from '../mobile-app/src/i18n/locales.mjs';
import { loadBroadsheet } from './helpers/broadsheet-mount.mjs';

const D = (s) => s; // ISO helper for readability
// 4 starts, perfect 28s: intervals [28,28,28]
const REG = ['2026-07-01', '2026-06-03', '2026-05-06', '2026-04-08'];

test('L: rounded half-up mean of kept intervals, clamped [15,60]; outliers discarded', () => {
  assert.equal(bsDeriveCycle(REG, '2026-07-10').L, 28);
  // intervals [27, 28] → mean 27.5 → round half-up 28
  assert.equal(bsDeriveCycle(['2026-07-01', '2026-06-04', '2026-05-07'], '2026-07-02').L, 28);
  // a 90-day gap is data-entry noise — excluded from L, not averaged in
  const gap = bsDeriveCycle(['2026-07-01', '2026-04-02', '2026-03-05'], '2026-07-02');
  assert.equal(gap.L, 28);
});

test('windows: textbook L=28 → M 1–5 · F 6–11 · O 12–16 · Lu 17–28', () => {
  const c = bsDeriveCycle(REG, '2026-07-10');
  assert.deepEqual(c.windows, { menstrual: [1, 5], follicular: [6, 11], ovulatory: [12, 16], luteal: [17, 28] });
  assert.equal(c.day, 10);
  assert.equal(c.phase, 'follicular');
});

test('short cycles: L=17/16/15 → M 1–5 · Lu 6–L · O and F EMPTY (never fabricated)', () => {
  for (const L of [17, 16, 15]) {
    const starts = []; let d = new Date('2026-07-01');
    for (let i = 0; i < 4; i++) { starts.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() - L * 86400000); }
    const c = bsDeriveCycle(starts, '2026-07-03');
    assert.deepEqual(c.windows.menstrual, [1, 5]);
    assert.deepEqual(c.windows.luteal, [6, L]);
    assert.equal(c.windows.ovulatory, null);
    assert.equal(c.windows.follicular, null);
  }
});

test('confidence ladder: ordered, population stdev, stdev>5 outranks n=2 medium', () => {
  assert.equal(bsDeriveCycle(['2026-07-01'], '2026-07-02').confidence, 'low');            // n=0
  assert.equal(bsDeriveCycle(['2026-07-01', '2026-06-03'], '2026-07-02').confidence, 'low'); // n=1
  // n=2, intervals [18, 38]: stdev 10 > 5 → LOW (not medium) + widened ovulatory
  const wild = bsDeriveCycle(['2026-07-01', '2026-06-13', '2026-05-06'], '2026-07-02');
  assert.equal(wild.confidence, 'low');
  assert.equal(bsDeriveCycle(REG, '2026-07-02').confidence, 'high');                      // n=3, stdev 0
  // n=2, stdev ≤5 → medium: intervals [27, 29]
  assert.equal(bsDeriveCycle(['2026-07-01', '2026-06-04', '2026-05-06'], '2026-07-02').confidence, 'medium');
});

test('late then paused; no starts → phase null', () => {
  // Day arithmetic against REG (last start 2026-07-01, L=28, L+7=35):
  // Jul 30 = day 30 · Aug 4 = day 35 (the last 'late' day) · Aug 5 = day 36.
  assert.equal(bsDeriveCycle(REG, '2026-07-30').phase, 'late');   // L < 30 ≤ L+7
  assert.equal(bsDeriveCycle(REG, '2026-08-04').phase, 'late');   // day 35 == L+7 boundary, still late
  assert.equal(bsDeriveCycle(REG, '2026-08-05').phase, 'paused'); // day 36 > L+7
  const none = bsDeriveCycle([], '2026-07-10');
  assert.equal(none.phase, null);
  const paused = bsDeriveCycle(REG, '2026-09-01');
  assert.equal(paused.predictedStart, null);                      // every prediction field null
});

test('Date inputs normalize to the LOCAL calendar date (no midnight drift)', () => {
  // Logged starts are date-only; `today` as a Date must resolve to the same
  // day number a plain ISO string does, at any wall-clock time — 23:59 local
  // must NOT read as tomorrow (or yesterday) via UTC epoch math.
  const evening = new Date(2026, 6, 10, 23, 59);   // LOCAL Jul 10, 23:59
  const morning = new Date(2026, 6, 10, 0, 1);     // LOCAL Jul 10, 00:01
  assert.equal(bsDeriveCycle(REG, evening).day, bsDeriveCycle(REG, '2026-07-10').day);
  assert.equal(bsDeriveCycle(REG, morning).day, bsDeriveCycle(REG, '2026-07-10').day);
});

test('predictedStart window scales with confidence', () => {
  const c = bsDeriveCycle(REG, '2026-07-10');                           // high → ±1
  assert.deepEqual(c.predictedStart, { from: '2026-07-28', to: '2026-07-30' });
});

test('bsCycleRead: floors → null; powered + material + significant → fires', () => {
  // days: [{date, phase-resolvable via cycle, sleepH, energy, adherence}] —
  // build 2 complete cycles of synthetic days: luteal sleep 6.5h vs follicular 7.6h
  const mk = (n, phase, sleepH) => Array.from({ length: n }, (_, i) => ({ sleepH, phase }));
  const days = [...mk(12, 'follicular', 7.6), ...mk(12, 'luteal', 6.5)];
  const read = bsCycleRead(days, { completeCycles: 2 });
  assert.ok(read);
  assert.equal(read.metric, 'sleep');
  assert.ok(Math.abs(read.gap) >= 0.5);
  assert.equal(bsCycleRead(days, { completeCycles: 1 }), null);          // <2 cycles → null
  assert.equal(bsCycleRead(days.slice(0, 14), { completeCycles: 2 }), null); // <8 days a bucket → null
  const noise = [...mk(12, 'follicular', 7.2), ...mk(12, 'luteal', 7.0)];
  assert.equal(bsCycleRead(noise, { completeCycles: 2 }), null);         // 12 min < 30-min materiality floor
});

// Never-throws on hostile inputs (the nora-sets class, pinned proactively this
// time): Number() and Date.parse() both RAISE on a Symbol — a hostile field in
// caller-shaped data must drop the value, never take the engine down.
test('never throws: Symbols and garbage through every entry point', () => {
  assert.equal(bsDeriveCycle(['2026-07-01'], Symbol('x')).phase, null);
  assert.equal(bsDeriveCycle([Symbol('x'), '2026-07-01'], '2026-07-10').day, 10);
  assert.equal(bsCycleRead([{ phase: 'luteal', sleepH: Symbol('x') }], { completeCycles: 2 }), null);
  assert.equal(bsCycleRead([], { completeCycles: Symbol('x') }), null);
  assert.equal(bsCycleRead(null, { completeCycles: 2 }), null);
  assert.equal(bsCycleRead([{ phase: 42, sleepH: 7 }], { completeCycles: 2 }), null);
});

// A missing observation is ABSENCE, never a zero-value day (Codex P1 — the
// food-search lesson: Number(null) and Number('') are both finite 0). Eight
// null-sleep rows against real values must yield honest null, not a fabricated
// significant gap. Numeric STRINGS (the PostgREST shape) still count as real.
test('null/blank observations never fabricate a read; numeric strings still count', () => {
  const mk = (n, phase, sleepH) => Array.from({ length: n }, () => ({ sleepH, phase }));
  assert.equal(bsCycleRead([...mk(12, 'follicular', 7.6), ...mk(8, 'luteal', null)], { completeCycles: 2 }), null);
  assert.equal(bsCycleRead([...mk(12, 'follicular', 7.6), ...mk(8, 'luteal', '')], { completeCycles: 2 }), null);
  assert.equal(bsCycleRead([...mk(12, 'follicular', 7.6), ...mk(8, 'luteal', undefined)], { completeCycles: 2 }), null);
  const strDays = [...mk(12, 'follicular', '7.6'), ...mk(12, 'luteal', '6.5')];
  const r = bsCycleRead(strDays, { completeCycles: 2 });
  assert.ok(r && r.metric === 'sleep');
});

// 'late' and 'paused' are internal engine states, not physiological phases
// (Codex P2 — doctrine): they must never form a compared bucket or reach copy.
test('late/paused days are excluded from read buckets', () => {
  const mk = (n, phase, sleepH) => Array.from({ length: n }, () => ({ sleepH, phase }));
  assert.equal(bsCycleRead([...mk(12, 'follicular', 7.6), ...mk(12, 'paused', 6.5)], { completeCycles: 2 }), null);
  assert.equal(bsCycleRead([...mk(12, 'follicular', 7.6), ...mk(12, 'late', 6.5)], { completeCycles: 2 }), null);
  const real = [...mk(12, 'follicular', 7.6), ...mk(12, 'luteal', 6.5), ...mk(12, 'paused', 1)];
  const r = bsCycleRead(real, { completeCycles: 2 });
  assert.ok(r && !r.copy.includes('paused') && !/\blate\b/.test(r.copy));
});

// ── The read in words (ruling 11, docs/REVIEW-2026-10-19-morning-checkin.md §6) ──
// The read used to say "1.2 points" (the 1-10 check-in scale), "12pp" and "0.6h",
// in English in every locale. A member is never quoted the scale, a "/10" or
// "points": energy, rested and habits now say only which phase runs lower, and
// sleep says its gap as a duration. The read carries what a translator needs (hi,
// lo and, for sleep, minutes), and the app composes cycle:read.* from those.
const PHASES = ['menstrual', 'follicular', 'ovulatory', 'luteal'];
const METRIC_KEY = { sleep: 'sleepH', energy: 'energy', rested: 'rested', adherence: 'adherence' };
// hiVal in the `hi` phase, loVal in the `lo` one, 12 days each — past every floor.
const fire = (metric, hi, lo, hiVal, loVal) => {
  const k = METRIC_KEY[metric];
  const mk = (n, phase, v) => Array.from({ length: n }, () => ({ phase, [k]: v }));
  return bsCycleRead([...mk(12, hi, hiVal), ...mk(12, lo, loVal)], { completeCycles: 2 });
};
const VALUES = { sleep: [7.6, 6.9], energy: [7, 4], rested: [8, 5], adherence: [0.9, 0.6] };

test('the read says no figure on the check-in scale: no points, /10 or pp; sleep is a duration', () => {
  for (const metric of Object.keys(VALUES)) {
    const r = fire(metric, 'follicular', 'luteal', ...VALUES[metric]);
    assert.equal(r && r.metric, metric);
    assert.doesNotMatch(r.copy, /points|\/10|\bpp\b|\d\.\d/, `${metric}: ${r.copy}`);
    if (metric !== 'sleep') assert.doesNotMatch(r.copy, /\d/, `${metric} carries a figure: ${r.copy}`);
  }
  const sleep = (loH) => fire('sleep', 'follicular', 'luteal', 7.6, loH).copy;
  assert.match(sleep(6.9), /^Your sleep runs about 40 min shorter in your luteal phase than your follicular — /);
  assert.match(sleep(7.6 - 7 / 6), /about 1h 10 shorter/);                // 70 min
  assert.match(sleep(6.6), /about 1h shorter/);                           // a whole hour, no "00"
  assert.match(sleep(7.6 - 13 / 12), /about 1h 05 shorter/);              // padded like bsCiHM
});

test('the read carries hi, lo and (sleep only) minutes, agreeing with the sign of gap', () => {
  for (const metric of Object.keys(VALUES)) {
    for (const [hi, lo] of [['follicular', 'luteal'], ['luteal', 'follicular'], ['ovulatory', 'menstrual']]) {
      const r = fire(metric, hi, lo, ...VALUES[metric]);
      assert.equal(r.hi, hi, `${metric} ${hi}/${lo}`);
      assert.equal(r.lo, lo, `${metric} ${hi}/${lo}`);
      // gap is phaseA − phaseB, so hi is phaseA exactly when gap is positive.
      assert.equal(r.hi, r.gap > 0 ? r.phaseA : r.phaseB);
      assert.equal(r.lo, r.gap > 0 ? r.phaseB : r.phaseA);
      if (metric === 'sleep') {
        assert.equal(r.minutes, Math.round(Math.abs(r.gap) * 12) * 5);
        assert.equal(r.minutes % 5, 0);
        assert.ok(r.minutes >= 30, 'the 30-min floor');
      } else {
        assert.equal('minutes' in r, false, `${metric} carries minutes`);
      }
    }
  }
  assert.equal(fire('sleep', 'follicular', 'luteal', 7.6, 6.9).minutes, 40);   // 42 min → 40
});

// ── The app's sentences, in all 13 locales ──
const CAT_DIR = new URL('../mobile-app/src/i18n/catalogs/', import.meta.url);
const CATS = new Map();
const catalog = (loc, ns) => {
  const id = `${loc}/${ns}`;
  if (!CATS.has(id)) CATS.set(id, JSON.parse(readFileSync(new URL(`${id}.json`, CAT_DIR), 'utf8')));
  return CATS.get(id);
};
// The runtime's resolution order: the member's locale, then en, then defaultValue.
const trFor = (loc) => (key, opts = {}) => {
  const [ns, k] = key.split(':');
  const raw = catalog(loc, ns)[k] ?? catalog('en', ns)[k];
  if (raw == null) return opts.defaultValue ?? key;
  return String(new IntlMessageFormat(raw, loc).format(opts));
};
const READ_KEYS = ['read.energy', 'read.rested', 'read.adherence', 'read.sleep'];
const PAIRS = PHASES.flatMap((hi) => PHASES.filter((lo) => lo !== hi).map((lo) => [hi, lo]));

test('the en catalog says the engine\'s English exactly, for every metric and phase pair', () => {
  const en = catalog('en', 'cycle');
  for (const metric of Object.keys(VALUES)) {
    for (const [hi, lo] of PAIRS) {
      const r = fire(metric, hi, lo, ...VALUES[metric]);
      const dur = metric === 'sleep' ? '40 min' : undefined;
      assert.equal(new IntlMessageFormat(en[`read.${metric}`], 'en').format({ hi, lo, dur }), r.copy, `${metric} ${hi}/${lo}`);
    }
  }
});

test('every locale: each read sentence names both phases by its own select, with no figure', () => {
  for (const loc of ACTIVE_LOCALES) {
    const cat = catalog(loc, 'cycle');
    for (const key of READ_KEYS) {
      assert.ok(typeof cat[key] === 'string' && cat[key], `${loc}/cycle:${key} missing`);
      const say = (hi, lo) => new IntlMessageFormat(cat[key], loc).format({ hi, lo, dur: '§DUR§' });
      for (const [hi, lo] of PAIRS) {
        const s = say(hi, lo);
        assert.doesNotMatch(s, /[{}]|\d|points|\/10|\bpp\b/, `${loc}/${key} ${hi}/${lo}: ${s}`);
        assert.equal(s.split('§DUR§').length - 1, key === 'read.sleep' ? 1 : 0, `${loc}/${key}: the duration`);
      }
      // The select is real: each phase reads differently on each side, and none
      // of the four ever falls through to `other`.
      for (const fixed of PHASES) {
        const others = PHASES.filter((p) => p !== fixed);
        const byLo = others.map((lo) => say(fixed, lo));
        const byHi = others.map((hi) => say(hi, fixed));
        assert.equal(new Set(byLo).size, 3, `${loc}/${key}: lo phases read alike`);
        assert.equal(new Set(byHi).size, 3, `${loc}/${key}: hi phases read alike`);
        assert.ok(!byLo.includes(say(fixed, 'zzz')) && !byHi.includes(say('zzz', fixed)), `${loc}/${key}: a phase reads as other`);
      }
    }
  }
});

// ⚠ UKRAINIAN SAYS "IN" BY THE LETTER BEFORE IT (Правопис §23). After a vowel and before a
// consonant it is "в" ("енергія в лютеїновій"), between consonants "у" ("ніж у менструальній"),
// and "у" stays before в, ф and the льв/св/тв/хв clusters ("у фолікулярній"). The `lo` phase
// follows its word with no pause, so the select alone can't know; the whole sentence is checked
// for every pair and for `other` (review on this PR: the menstrual and luteal `lo` branches read
// "у" after "енергія", "бадьоро", "менше" and "рідше").
test('uk: each read sentence says "in" as the spelling rules have it, for every phase on each side', () => {
  const cat = catalog('uk', 'cycle');
  const afterVowelU = /[аеєиіїоуюя]\s+у\s+(?!льв|св|тв|хв)[бгґджзйклмнпрстхцчшщ]/iu;
  const betweenConsonantsV = /[бвгґджзклмнпрстфхцчшщь]\s+в\s+[бвгґджзйклмнпрстфхцчшщ]/iu;
  const sides = [...PAIRS, ...PHASES.flatMap((p) => [[p, 'zzz'], ['zzz', p]])];
  for (const key of READ_KEYS) {
    for (const [hi, lo] of sides) {
      const s = new IntlMessageFormat(cat[key], 'uk').format({ hi, lo, dur: '40 хв' });
      assert.doesNotMatch(s, afterVowelU, `uk/${key} ${hi}/${lo} says "у" after a vowel: ${s}`);
      assert.doesNotMatch(s, betweenConsonantsV, `uk/${key} ${hi}/${lo} says "в" between consonants: ${s}`);
    }
  }
});

// The card is not mounted by any suite (its read arrives from an effect), so the
// composition is a helper the card calls, driven here against the real catalogs.
const { bsCycleReadText } = await loadBroadsheet(['bsCycleReadText']);

test('the app card composes the read with tr in the member\'s language, never read.copy', () => {
  const lut = (metric, loVal) => fire(metric, 'follicular', 'luteal', VALUES[metric][0], loVal ?? VALUES[metric][1]);
  // English is the engine's English, word for word.
  for (const metric of Object.keys(VALUES)) assert.equal(bsCycleReadText(trFor('en'), lut(metric)), lut(metric).copy);
  // German inflects the phase into its compound; Russian into its case.
  assert.equal(bsCycleReadText(trFor('de'), lut('energy')),
    'Deine Energie-Check-ins liegen in deiner Lutealphase niedriger als in deiner Follikelphase — leg die schwerere Arbeit dorthin, wo die Energie ohnehin ist.');
  assert.match(bsCycleReadText(trFor('ru'), lut('rested')), /^Ты просыпаешься менее бодро в лютеиновой фазе, чем в фолликулярной, — /);
  // Sleep's duration through Home's keys: minutes under an hour, else hours.
  assert.match(bsCycleReadText(trFor('ru'), lut('sleep')), /примерно на 40 мин меньше в лютеиновой фазе/);
  assert.match(bsCycleReadText(trFor('ru'), lut('sleep', 7.6 - 7 / 6)), /примерно на 1 ч 10 меньше/);
  assert.match(bsCycleReadText(trFor('de'), lut('sleep', 6.6)), /etwa 1 Std\. kürzer als/);
  assert.match(bsCycleReadText(trFor('en'), lut('sleep', 7.6 - 13 / 12)), /about 1h 05 shorter/);
  for (const loc of ACTIVE_LOCALES) {
    for (const metric of Object.keys(VALUES)) {
      const s = bsCycleReadText(trFor(loc), lut(metric));
      const dur = metric === 'sleep' ? trFor(loc)('home:checkin.mOnly', { m: 40 }) : undefined;
      assert.equal(s, trFor(loc)(`cycle:read.${metric}`, { hi: 'follicular', lo: 'luteal', dur }), `${loc} ${metric}`);
      assert.doesNotMatch(s, /points|\/10|\bpp\b/, `${loc} ${metric}: ${s}`);
      if (loc !== 'en') assert.notEqual(s, lut(metric).copy, `${loc} ${metric} is the engine's English`);
    }
  }
  // read.copy only for what the composition doesn't know.
  const base = lut('energy');
  assert.equal(bsCycleReadText(trFor('de'), { ...base, metric: 'volume' }), base.copy);
  assert.equal(bsCycleReadText(trFor('de'), { ...base, hi: 'paused' }), base.copy);
  assert.equal(bsCycleReadText(trFor('de'), { ...lut('sleep'), minutes: null }), lut('sleep').copy);
  assert.equal(bsCycleReadText(trFor('de'), null), null);
});

test('the card renders the composed read, not read.copy', () => {
  const src = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');
  const card = src.slice(src.indexOf('function BSCycleCard('), src.indexOf('function BSCycleTodayChip('));
  assert.ok(card.length > 1000, 'the card was not found');
  assert.equal(card.split('const readText = bsCycleReadText(tr, read);').length - 1, 1);
  assert.match(card, /\{readText\}<\/div>/);
  assert.doesNotMatch(card, /read\.copy/);
});
