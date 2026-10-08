// A cooking step's time is read in every language the app ships, not English alone.
//
// ⚠ THE DEFECT, RAISED BY CODEX ON #2272 AND SHIPPED SINCE PR E. The timer parser's units were
// `hours?|hrs?|minutes?|mins?|seconds?|secs?`, so a coach who wrote a method in German, Spanish or
// Russian had no timer on the client's cook screen, no hands-off window and no length on the plan.
// The editor's own hint told them to write it that way: the German one reads „15 Minuten rösten“.
// The catalog is English, which is why nothing showed it. Owner, 2026-10-08: "should we create
// timers on the other languages?" … "ok do it".
//
// These tests read each catalog's own examples through the parser, hold each language's rules
// (per side, ranges, an hour and minutes, storage times), and hold the English catalog to exactly
// the timers it had before, since the wider vocabulary must not find new ones in English steps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { bsStepTimers, bsAuthorStep, bsStepPerSideMin } from '../mobile-app/src/services/cookable.mjs';
import { SHAPE_KITCHEN_RECIPES } from '../mobile-app/src/broadsheet/shapeKitchenData.js';
import { DEMO_MEALS } from './helpers/demo-meal-plan.mjs';

const CATALOGS = 'mobile-app/src/i18n/catalogs';
const LOCALES = readdirSync(CATALOGS).sort();

test('every catalog\'s own example step reads as the 15 minutes it states', () => {
  assert.equal(LOCALES.length, 13, LOCALES.join(', '));
  const quoted = (s) => (String(s).match(/[„“«"]\s*([^„“”«»"]+?)\s*[”“»"]/u) || [])[1];
  for (const l of LOCALES) {
    const coach = JSON.parse(readFileSync(`${CATALOGS}/${l}/coach.json`, 'utf8'));
    // The hint that tells a coach how to make a step hands-off, and the step box's placeholder.
    for (const key of ['editor.windowHint', 'editor.stepPh']) {
      const example = quoted(coach[key]);
      assert.ok(example, `${l} ${key}: no quoted example in "${coach[key]}"`);
      assert.deepEqual(bsStepTimers(example).map((x) => x.seconds), [900], `${l} ${key}: "${example}"`);
      assert.deepEqual(bsAuthorStep(example, 'oven'), { t: example, min: 15, passive: true, station: 'oven' }, `${l} ${key}`);
      assert.deepEqual(bsAuthorStep(example, null), { t: example, min: 15, passive: false }, `${l} ${key}, hands-on`);
    }
  }
});

// Each language's own phrasing of the rules a step's time answers to. [text, station, expected
// minutes, a window?] — `null` minutes means the step keeps the planner's assumed 3.
const CASES = {
  de: [
    ['15 Minuten zugedeckt köcheln lassen.', 'stove', 15, true],
    ['Köcheln 1 Std. 20 Min.', 'stove', 80, true],
    ['1 Stunde und 10 Minuten backen.', null, 70, false],
    ['4 Minuten pro Seite anbraten.', 'stove', 8, false],
    ['8 bis 10 Minuten köcheln.', 'stove', 8, true],
    ['Im Kühlschrank bis zu 4 Stunden ziehen lassen.', null, null, false],
  ],
  es: [
    ['Hornea 1 hora y 15 minutos.', null, 75, false],
    ['Dora 4 minutos por lado.', 'stove', 8, false],
    ['Cocina 10 minutos hasta que se dore.', null, 10, false],
    ['Marina 30 minutos.', null, null, false],
    ['Cuece la salsa marinara 10 minutos.', null, 10, false],
  ],
  fr: [
    ['Faites cuire 3 minutes de chaque côté.', null, 6, false],
    ['Cuire 10 minutes jusqu\'à ce que doré.', null, 10, false],
    ['Laissez reposer jusqu\'à 2 heures au frigo.', null, null, false],
    ['Rôtir 1 h 15 min.', 'oven', 75, true],
  ],
  it: [
    ['Cuoci 8 a 10 minuti.', 'stove', 8, true],
    ['Inforna 1 ora e 15 minuti.', 'oven', 75, true],
    ['Cuoci 10 minuti fino a doratura.', null, 10, false],
    ['Griglia 3 minuti per lato.', null, 6, false],
  ],
  'pt-BR': [
    ['Grelhe 3 minutos de cada lado.', null, 6, false],
    ['Asse 20 minutos até dourar.', null, 20, false],
    ['Deixe de molho 4 horas.', null, null, false],
  ],
  ru: [
    ['Обжарьте по 4 минуты с каждой стороны.', null, 8, false],
    ['С каждой стороны по 4 минуты.', null, 8, false],
    ['Варите от 8 до 10 минут.', 'stove', 8, true],
    ['Варите от 8 до 10 минут, помешивая.', null, 8, false],
    ['Запекайте 1 час 15 минут.', 'oven', 75, true],
    ['Варите 1 минуту.', null, null, false],
    ['Храните в холодильнике до 3 дней.', null, null, false],
  ],
  uk: [
    ['Смажте 4 хвилини з кожного боку.', null, 8, false],
    ['Тушкуйте 20 хвилин.', 'stove', 20, true],
    ['Запікайте 1 годину 10 хвилин.', 'oven', 70, true],
  ],
  tr: [
    ['Her tarafını 4 dakika pişirin.', null, 8, false],
    ['15 dakika fırınla.', 'oven', 15, true],
    ['Kızarana kadar 10 dakika pişirin.', null, 10, false],
    ['Buzdolabında 2 saat bekletin.', null, null, false],
  ],
  vi: [
    ['Chiên mỗi mặt 4 phút.', null, 8, false],
    ['Nướng 1 giờ 15 phút.', 'oven', 75, true],
    ['Ướp 30 phút.', null, null, false],
  ],
  id: [
    ['Goreng setiap sisi 4 menit.', null, 8, false],
    ['Masak 8 hingga 10 menit.', 'stove', 8, true],
    ['Masak 8 hingga 10 menit sambil diaduk.', null, 8, false],
    ['Simpan di kulkas hingga 3 hari.', null, null, false],
    ['Panggang 1 jam 15 menit.', 'oven', 75, true],
  ],
  ha: [
    ['A gasa minti 15.', 'oven', 15, true],
    ['A soya a kowane gefe minti 4.', null, 8, false],
    ['A dafa awa 1.', 'stove', 60, true],
  ],
  pcm: [
    ['Fry am 4 minutes for each side.', null, 8, false],
    ['Make e simmer 15 minutes, cover am.', 'stove', 15, true],
  ],
};

test('each language\'s per side, ranges, hours and minutes, and storage times', () => {
  assert.deepEqual(Object.keys(CASES).sort(), LOCALES.filter((l) => l !== 'en'), 'a case list for every other language');
  for (const [l, cases] of Object.entries(CASES)) {
    for (const [text, station, min, win] of cases) {
      const got = bsAuthorStep(text, station);
      assert.equal(got.min ?? null, min, `${l}: "${text}"`);
      assert.equal(got.passive === true, win, `${l}: "${text}" ${win ? 'is' : 'is not'} a window`);
      if (min != null && station && !win) assert.equal(got.station, station, `${l}: "${text}" keeps its station`);
    }
  }
  // Per side is read in each language for the editor's hint too.
  assert.equal(bsStepPerSideMin('4 Minuten pro Seite anbraten.'), 8);
  assert.equal(bsStepPerSideMin('Her tarafını 1 dakika pişirin.'), 2);
  assert.equal(bsStepPerSideMin('Fry am 4 minutes for each side.'), 8, '"for each side", in Pidgin and in English');
});

test('an abbreviation\'s full stop joins an hour and its minutes; a sentence\'s does not', () => {
  assert.equal(bsAuthorStep('Köcheln 1 Std. 20 Min.', null).min, 80);
  assert.equal(bsAuthorStep('Bake 1 hr. 15 min.', null).min, 75);
  assert.equal(bsAuthorStep('Bake 1 hour. 15 minutes later, check it.', null).min, 60);
});

test('a unit ends at any letter, in any script', () => {
  assert.deepEqual(bsStepTimers('Варите 15 минутами позже'), [], '"минутами" is not "минут"');
  assert.deepEqual(bsStepTimers('Add 2 more minced shallots'), []);
  assert.deepEqual(bsStepTimers('Spread 2 jammy eggs'), [], 'Indonesian "jam" is a whole word');
  assert.deepEqual(bsStepTimers('Serve 4 hearty bowls'), [], '"h" is a whole word');
  // The unit-first Hausa form sits in the step's own order with the rest.
  assert.deepEqual(bsStepTimers('A soya minti 5, sannan 10 minutes.').map((x) => x.seconds), [300, 600]);
});

// The parser as it was before this change, kept here only to prove the English catalog reads the
// same through the wider one: the vocabulary grew, and an English step must not have gained a timer.
const ENGLISH_ONLY = /(\d+(?:\s*[–-]\s*\d+)?)(?:\s+(?:more|additional|extra|further)\s+|\s*)(hours?|hrs?|minutes?|mins?|seconds?|secs?)(?![a-z])(\s*\/\s*side|\s+per\s+side)?/gi;
const englishTimers = (text) => {
  const out = [];
  for (const m of String(text).matchAll(ENGLISH_ONLY)) {
    const n = Number(m[1].split(/[–-]/)[0]);
    const seconds = n * (/^h/i.test(m[2]) ? 3600 : /^m/i.test(m[2]) ? 60 : 1);
    if (!(n > 0) || seconds < 5 || seconds > 21600) continue;
    out.push({ seconds, label: `${m[1].replace(/\s+/g, '')} ${/^h/i.test(m[2]) ? 'hr' : /^m/i.test(m[2]) ? 'min' : 'sec'}${m[3] ? ' per side' : ''}` });
    if (out.length === 4) break;
  }
  return out;
};

test('the English catalog and the demo plan read exactly the timers they had', () => {
  const steps = [
    ...SHAPE_KITCHEN_RECIPES.flatMap((r) => r.steps.map(String)),
    ...DEMO_MEALS.flatMap((m) => m.steps),
  ];
  assert.ok(steps.length > 300, `${steps.length} steps`);
  const changed = steps.filter((s) => JSON.stringify(bsStepTimers(s)) !== JSON.stringify(englishTimers(s)));
  assert.deepEqual(changed.map((s) => s.slice(0, 70)), []);
  assert.ok(steps.some((s) => englishTimers(s).length), 'the reference reads timers at all');
});
