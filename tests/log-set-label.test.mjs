// The player's Log set button says "· N reps" only for a count (workoutSession.mjs bsLogSetLabel).
//
// It said "Log set 1 · 8 each reps", "AMRAP reps" and "30s/side reps" (#2159's open item), and
// Russian, which put the reps through a plural, said "не число" ("not a number") for anything but a
// bare number, a range included; its string now says "повт.", as Ukrainian's does. The strings are
// rendered here through the app's own ICU translator in every locale.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { bsLogSetLabel, bsSetPrefill, bsSessionMoves } from '../mobile-app/src/services/workoutSession.mjs';

const appRequire = createRequire(new URL('../mobile-app/package.json', import.meta.url));
const i18next = appRequire('i18next');
const ICU = appRequire('i18next-icu');
const DIR = new URL('../mobile-app/src/i18n/catalogs/', import.meta.url);
const LOCALES = readdirSync(DIR).filter((l) => !l.startsWith('.'));
const catalog = (l) => JSON.parse(readFileSync(new URL(`${l}/session.json`, DIR), 'utf8'));
async function translator(l) {
  const i = i18next.createInstance();
  await i.use(ICU.default || ICU).init({ lng: l, fallbackLng: false, ns: ['session'], defaultNS: 'session', keySeparator: false,
    interpolation: { escapeValue: false }, resources: { [l]: { session: catalog(l) } } });
  return (key, opts) => i.t(key, opts);
}
// The button's own choice, as the player makes it (iosAppBroadsheetClient.jsx).
function button(tr, reps, n = 1) {
  const lbl = bsLogSetLabel(reps);
  return lbl.kind === 'count' ? tr('player.logSetCtaReps', { n, reps: lbl.reps })
    : lbl.kind === 'value' ? tr('player.logSetCtaValue', { n, value: lbl.value })
      : tr('player.logSetCta', { n });
}

test('a count is a whole number or a range, with or without "reps"', () => {
  assert.deepEqual(bsLogSetLabel('8'), { kind: 'count', reps: '8' });
  assert.deepEqual(bsLogSetLabel(' 8-10 '), { kind: 'count', reps: '8-10' });
  assert.deepEqual(bsLogSetLabel('8–10'), { kind: 'count', reps: '8–10' });
  assert.deepEqual(bsLogSetLabel('8 - 10'), { kind: 'count', reps: '8 - 10' });
  assert.deepEqual(bsLogSetLabel('8 reps'), { kind: 'count', reps: '8' });
  assert.deepEqual(bsLogSetLabel('1 rep'), { kind: 'count', reps: '1' });
  assert.deepEqual(bsLogSetLabel(12), { kind: 'count', reps: '12' });
});

test('any other value is named as written, and none is just "Log set"', () => {
  for (const v of ['8 each', '12 ea', 'AMRAP', 'max', 'to failure', '30s/side', '30 s', '1.5 km', '40 m each', '1:30', '8/side', '10 sets']) {
    assert.deepEqual(bsLogSetLabel(v), { kind: 'value', value: v }, JSON.stringify(v));
  }
  for (const v of ['', ' ', null, undefined]) assert.deepEqual(bsLogSetLabel(v), { kind: 'none' }, JSON.stringify(v));
});

test('in English the button says reps only for a count', async () => {
  const tr = await translator('en');
  assert.equal(button(tr, '8'), 'Log set 1 · 8 reps');
  assert.equal(button(tr, '8-10'), 'Log set 1 · 8-10 reps');
  assert.equal(button(tr, '8 reps'), 'Log set 1 · 8 reps', 'reps said twice');
  assert.equal(button(tr, '8 each'), 'Log set 1 · 8 each');
  assert.equal(button(tr, 'AMRAP'), 'Log set 1 · AMRAP');
  assert.equal(button(tr, '30s/side'), 'Log set 1 · 30s/side');
  assert.equal(button(tr, '30 s'), 'Log set 1 · 30 s');
  assert.equal(button(tr, ''), 'Log set 1');
  // From moves as the player builds them: the builder's per-side and effort reps reach the button
  // as written. (A scheme line drops the marker: "3 × 8 each" is reps "8".)
  const [side, effort] = bsSessionMoves([{ m: 'Split squat', sets: '3', reps: '8 each' }, { m: 'Push-up', sets: '3', reps: 'AMRAP' }]);
  assert.equal(button(tr, bsSetPrefill(side, 0).reps), 'Log set 1 · 8 each');
  assert.equal(button(tr, bsSetPrefill(effort, 0).reps), 'Log set 1 · AMRAP');
});

test('Russian says a count and a range, and never "не число"', async () => {
  const tr = await translator('ru');
  assert.equal(button(tr, '5'), 'Записать подход 1 · 5 повт.');
  assert.equal(button(tr, '8-10'), 'Записать подход 1 · 8-10 повт.', 'a range went through a plural');
  // No locale puts the reps through a plural: only a number can take one.
  for (const l of LOCALES) assert.doesNotMatch(catalog(l)['player.logSetCtaReps'], /\{\s*reps\s*,\s*plural/, l);
  assert.equal(button(tr, 'AMRAP'), 'Записать подход 1 · AMRAP');
  assert.equal(button(tr, '8 each'), 'Записать подход 1 · 8 each');
});

test('every locale says each kind whole: its own numbers, the value, no placeholder left', async () => {
  assert.ok(LOCALES.length >= 13, `found ${LOCALES.length} locales`);
  for (const l of LOCALES) {
    const tr = await translator(l);
    for (const [reps, must] of [['8-10', '8-10'], ['12', '12'], ['AMRAP', 'AMRAP'], ['8 each', '8 each'], ['30s/side', '30s/side'], ['', null]]) {
      const out = button(tr, reps, 2);
      assert.ok(out && !/[{}]|не число|NaN|undefined|player\./.test(out), `${l}, ${JSON.stringify(reps)}: ${out}`);
      assert.match(out, /2/, `${l}, ${JSON.stringify(reps)}: the set number is gone: ${out}`);
      if (must) assert.ok(out.includes(must), `${l}, ${JSON.stringify(reps)}: ${out}`);
    }
    // A value that is not a count never takes the locale's reps word.
    const word = catalog(l)['player.logSetCtaReps'].replace(/\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, '').replace(catalog(l)['player.logSetCta'].replace(/\{n\}/g, ''), '').replace(/[·\s]+/g, ' ').trim();
    if (word) assert.ok(!button(tr, 'AMRAP').includes(word), `${l}: "AMRAP" took the reps word "${word}"`);
  }
});

test('the player asks the rule', () => {
  const src = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');
  assert.match(src, /const lbl = bsLogSetLabel\(bsSetPrefill\(move, activeIdx\)\.reps\);/);
  assert.match(src, /tr\('session:player\.logSetCtaReps', \{ n: activeIdx \+ 1, reps: lbl\.reps \}\)/);
  assert.match(src, /tr\('session:player\.logSetCtaValue', \{ n: activeIdx \+ 1, value: lbl\.value \}\)/);
});
