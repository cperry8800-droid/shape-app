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
import { createHash } from 'node:crypto';
import { bsStepTimers, _bsTimerSpans, bsStepGists, bsAuthorStep, bsStepPerSideMin } from '../mobile-app/src/services/cookable.mjs';
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

// A timer's name is read with English rules, so a timer stated in another language has none and
// the cook screen falls back to the step number. Before, it named „Die Zwiebeln 8 Minuten
// anbraten“ "die" and a Turkish step "ate".
test('a timer in another language is not named with English rules', () => {
  for (const text of ['Die Zwiebeln 8 Minuten in der Pfanne anbraten.', '15 dakika kısık ateşte, kapağı kapalı pişirin.', 'Томите 15 минут под крышкой.', 'A dafa a ƙaramin wuta minti 15, a rufe.']) {
    assert.equal(bsStepTimers(text).length, 1, text);
    assert.deepEqual(bsStepGists(text), [''], text);
  }
  assert.deepEqual(bsStepGists('Simmer 15 minutes, lid on.'), ['simmer'], 'English keeps its names');
  assert.deepEqual(bsStepGists('Make e simmer 15 minutes, cover am.').map(Boolean), [true], 'and so does Pidgin, in English units');
});

test('a unit ends at any letter, in any script', () => {
  assert.deepEqual(bsStepTimers('Варите 15 минутами позже'), [], '"минутами" is not "минут"');
  assert.deepEqual(bsStepTimers('Add 2 more minced shallots'), []);
  assert.deepEqual(bsStepTimers('Spread 2 jammy eggs'), [], 'Indonesian "jam" is a whole word');
  assert.deepEqual(bsStepTimers('Serve 4 hearty bowls'), [], '"h" is a whole word');
  // The unit-first Hausa form sits in the step's own order with the rest.
  assert.deepEqual(bsStepTimers('A soya minti 5, sannan 10 minutes.').map((x) => x.seconds), [300, 600]);
});

// THE ENGLISH CATALOG READS EXACTLY AS IT DID BEFORE #2277. The golden record holds, for every catalog
// and demo-plan step, what cookable.mjs returned at 6adf127: the timers and their places in the step,
// the timer names, the step's authored time with no station and on the stove, and the per-side
// minutes. ⚠ Fable, on #2277: the first version of this test compared the timers alone, so two
// changes to English coach steps passed it unnoticed ("marinade" became a storage word, and "1 hr.
// 15 minutes before the end" joined into 75). The record makes any such change fail here.
const GOLDEN = JSON.parse(readFileSync('tests/fixtures/catalog-step-times-before-2277.json', 'utf8')).steps;
const keyOf = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);
const dropT = (s) => { if (!s) return s; const { t, ...rest } = s; return rest; };
// The only changes from the record, each named with its reason and asserted to its new value. (The
// catalog's own plans read its step metadata, not bsAuthorStep, so none of these moves a catalog
// plan; they are how the same words read when a coach writes them.)
const CHANGED_ON_PURPOSE = {
  // "bring it UP TO a bare simmer and hold it there for 60 minutes, skimming": "up to" counted as
  // storage anywhere, so a 60-minute attended simmer read as the assumed 3. It now counts only before
  // a time (Fable's temperature finding, applied to English as to every other language).
  'Put the lamb bones in a 6-quart saucepan with 8 cups of water and the salt, bring it up to a bare simmer and hold it there for 60 minutes, skimming the grey foam off the top.':
    { field: 3, value: { min: 60, passive: false } },
};

test('the English catalog and the demo plan read exactly as they did before #2277', () => {
  const steps = [...new Set([
    ...SHAPE_KITCHEN_RECIPES.flatMap((r) => r.steps.map(String)),
    ...DEMO_MEALS.flatMap((m) => m.steps),
  ])];
  assert.ok(steps.length > 600, `${steps.length} steps`);
  const missing = steps.filter((s) => !GOLDEN[keyOf(s)]);
  assert.deepEqual(missing.map((s) => s.slice(0, 70)), [], 'a step with no record: regenerate the record from 6adf127, never from the code under test');
  const changed = [];
  for (const s of steps) {
    const now = [
      bsStepTimers(s).map((x) => [x.seconds, x.label]),
      _bsTimerSpans(s).map((x) => [x.at, x.end]),
      bsStepGists(s),
      dropT(bsAuthorStep(s, null)),
      dropT(bsAuthorStep(s, 'stove')),
      bsStepPerSideMin(s),
    ];
    const expected = [...GOLDEN[keyOf(s)]];
    if (CHANGED_ON_PURPOSE[s]) expected[CHANGED_ON_PURPOSE[s].field] = CHANGED_ON_PURPOSE[s].value;
    if (JSON.stringify(now) !== JSON.stringify(expected)) changed.push(`${s.slice(0, 60)}… ${JSON.stringify(now)} ≠ ${JSON.stringify(expected)}`);
  }
  assert.deepEqual(changed, []);
  assert.ok(steps.some((s) => GOLDEN[keyOf(s)][0].length), 'the record holds timers at all');
  for (const s of Object.keys(CHANGED_ON_PURPOSE)) {
    assert.ok(steps.includes(s), `a named change for a step the catalog no longer has: ${s.slice(0, 60)}`);
    assert.notDeepEqual(GOLDEN[keyOf(s)][CHANGED_ON_PURPOSE[s].field], CHANGED_ON_PURPOSE[s].value, 'a named change that changes nothing');
  }
});

// ── Fable's review of #2277, each probe reproduced with node first ─────────────────────────────
const minOf = (text, station = null) => bsAuthorStep(text, station).min ?? null;

test('a Russian or Ukrainian teaspoon ("ч. л.") is not an hour', () => {
  assert.deepEqual(bsStepTimers('Добавьте 1 ч. л. соли и 2 ст. л. масла, обжарьте 5 минут.').map((x) => x.seconds), [300]);
  assert.deepEqual(bsStepTimers('Додайте 1 ч. л. солі та смажте 5 хвилин.').map((x) => x.seconds), [300]);
  assert.deepEqual(bsAuthorStep('Добавьте 2 ч.л. сахара.', 'stove'), { t: 'Добавьте 2 ч.л. сахара.' });
  assert.deepEqual(bsStepTimers('Посолите (1 ч. ложку) и запекайте 25 минут.').map((x) => x.seconds), [1500]);
  // An hour still reads as one.
  assert.equal(minOf('Тушите 1 ч.'), 60);
  assert.equal(minOf('Тушите 2 ч. Лук добавьте позже.'), 120);
});

test('"a preheated oven" and a temperature are not storage; a time limit and days still are', () => {
  for (const [text, min] of [
    ['Запекайте в заранее разогретой духовке 20 минут.', 20],
    ['Запікайте в заздалегідь розігрітій духовці 20 хвилин.', 20],
    ['Önceden ısıtılmış fırında 20 dakika pişirin.', 20],
    ['Разогрейте духовку до 180 градусов. Запекайте 20 минут.', 20],
    ['Розігрійте духовку до 180 градусів і запікайте 20 хвилин.', 20],
    ['Panaskan oven hingga 180 derajat, panggang 20 menit.', 20],
    ['Panggang sampai 180 derajat selama 20 menit.', 20],
    ['Calienta el aceite hasta 180 °C y fríe 5 minutos.', 5],
    ['Scalda l\'olio fino a 180 gradi e friggi 5 minuti.', 5],
    ['Chauffez l\'huile jusqu\'à 180 °C et faites frire 5 minutes.', 5],
    ['Aqueça o óleo até 180 °C e frite 5 minutos.', 5],
    ['Bis zu 180 Grad erhitzen und 20 Minuten backen.', 20],
    ['Heat the oil up to 350°F and fry 5 minutes.', 5],
    ['10 dakika kadar pişirin.', 10],
  ]) assert.equal(minOf(text), min, text);
  for (const text of [
    'Храните в холодильнике до 3 дней.',
    'Im Kühlschrank bis zu 4 Stunden ziehen lassen.',
    'Deja reposar hasta 2 horas.',
    'Simpan di kulkas hingga 3 hari.',
    'Cover and chill up to 4 hours.',
  ]) assert.equal(minOf(text), null, text);
});

test('a word like "about" between per side and its time keeps the step per side, never a window', () => {
  for (const [text, min] of [
    ['Her tarafını yaklaşık 4 dakika pişirin.', 8],
    ['Chiên mỗi mặt khoảng 4 phút.', 8],
    ['Goreng setiap sisi sekitar 4 menit.', 8],
    ['A soya a kowane gefe kamar minti 4.', 8],
    ['Обжарьте с каждой стороны примерно 4 минуты.', 8],
    ['4 Minuten lang pro Seite anbraten.', 8],
    ['Dora 4 minutos aproximadamente por lado.', 8],
    ['Faites cuire 3 minutes environ de chaque côté.', 6],
    ['Cuoci 3 minuti circa per lato.', 6],
  ]) {
    assert.deepEqual(bsAuthorStep(text, 'stove'), { t: text, min, passive: false, station: 'stove' }, text);
    assert.equal(bsStepPerSideMin(text), min, text);
  }
});

test('the per-side, range and distributive forms the first version missed', () => {
  for (const [text, min] of [
    ['4 Minuten von jeder Seite anbraten.', 8],
    ['Faites cuire 3 minutes sur chaque face.', 6],
    ['Faites cuire 3 minutes chaque côté.', 6],
    ['Cuoci 3 minuti per parte.', 6],
    ['Cuoci 3 minuti da ciascun lato.', 6],
    ['Dora 4 minutos cada lado.', 8],
    ['Her iki tarafını 3 dakika kızartın.', 6],
    ['Her iki tarafını 3\'er dakika kızartın.', 6],
  ]) assert.equal(bsStepPerSideMin(text), min, text);
  assert.deepEqual(bsStepTimers('Her iki tarafını 3\'er dakika kızartın.'), [{ seconds: 180, label: '3 min' }], 'the suffix is not part of the label');
  for (const text of ['Kısık ateşte 8 ila 10 dakika pişirin.', 'Cocina entre 8 y 10 minutos.', 'Cozinhe entre 8 e 10 minutos.', 'Nấu 8 tới 10 phút.']) {
    assert.deepEqual(bsAuthorStep(text, 'stove'), { t: text, min: 8, passive: true, station: 'stove' }, text);
  }
  assert.equal(minOf('Hornea 1 hora y 15 minutos.'), 75, '"y" alone is still an hour and its minutes');
  assert.equal(minOf('Noch 5 weitere Minuten köcheln.'), 5);
});

test('a word that also names an ingredient is not a storage word', () => {
  for (const [text, min] of [
    ['Añade los guisantes congelados y cocina 10 minutos.', 10],
    ['Adicione as ervilhas congeladas e cozinhe 10 minutos.', 10],
    ['Aggiungi i piselli congelati e cuoci 10 minuti.', 10],
    ['Dondurulmuş bezelyeyi ekleyin ve 10 dakika pişirin.', 10],
    ['Ajoutez une boîte de tomates en conserve et laissez mijoter 20 minutes.', 20],
    ['Aggiungi un cucchiaio di conserva di pomodoro e cuoci 15 minuti.', 15],
    ['Añade atún en conserva y cocina 5 minutos.', 5],
    ['Añade una pizca de sal marina y cocina 10 minutos.', 10],
    ['Vierte la marinada y cocina 10 minutos.', 10],
    ['Versez la marinade et faites cuire 10 minutes.', 10],
    ['Add the reserved marinade and simmer 5 minutes.', 5],
  ]) assert.equal(minOf(text), min, text);
  // The storage verbs themselves still are.
  for (const text of ['Marina 30 minutos.', 'Laissez mariner 30 minutes.', 'Lascia marinare 30 minuti.', 'Congela 2 horas.']) {
    assert.equal(minOf(text), null, text);
  }
});

test('English: an abbreviation joins an hour and its minutes only when both are abbreviated', () => {
  assert.equal(minOf('Bake 1 hr. 15 minutes before the end, add the potatoes.'), 60);
  assert.equal(minOf('Cook 10 min. 30 seconds before serving, add the herbs.'), 10);
  assert.equal(minOf('Bake 1 hr. 15 min.'), 75);
});

// ── Fable's review of #2279 (the fixes above), each probe reproduced with node first ─────────────
test('"up to" a range or an "about" time is still a storage limit', () => {
  for (const text of [
    'Cover and chill up to 2–3 hours.', 'Let rest up to 1–2 hours before baking.', 'Cover and chill up to 2 to 3 hours.',
    'Chill up to about 2 hours.', 'Deja reposar hasta 2-3 horas.', 'Reposer jusqu\'à 2 à 3 heures.', 'Bis zu 2–3 Stunden ruhen lassen.',
    'Оставьте до 2–3 часов.', 'Biarkan hingga 2-3 jam.', 'Lasciare fino a 2-3 ore.', 'Deixe até 2-3 horas.',
  ]) assert.equal(minOf(text), null, text);
  assert.equal(minOf('Heat the oil up to 350°F and fry 5 minutes.'), 5, 'a temperature still is not');
});

test('the teaspoon guard reads case: a sentence that opens "Ложкой" after an hour keeps the hour', () => {
  assert.equal(minOf('Тушите 2 ч. Ложкой снимите жир.'), 120);
  assert.equal(minOf('1 ч. 20 мин.'), 80);
  assert.deepEqual(bsStepTimers('Добавьте 1 ч.л. соли.'), []);
  // Lower-case "ложк…" right after "ч." is how the teaspoon is written ("2 ч. ложки"), so it stays
  // refused even where it means "with a spoon": refusing a timer is the safe side.
  assert.deepEqual(bsStepTimers('Варите 2 ч. ложкой снимайте пену.'), []);
});

test('Italian "da parte" is "aside", French "conserver" is still storage, and a schedule never joins', () => {
  assert.equal(minOf('Lascia riposare 10 minuti da parte.'), 10);
  assert.equal(bsStepPerSideMin('Lascia riposare 10 minuti da parte.'), 0);
  assert.equal(bsStepPerSideMin('Cuoci 3 minuti per parte.'), 6);
  assert.equal(minOf('Bien conserver 2 heures au frais.'), null);
  assert.equal(minOf('Devem conservar 2 horas.'), null);
  assert.equal(minOf('Adicione o atum em conserva e cozinhe 5 minutos.'), 5);
  assert.equal(minOf('Aggiungi la conserva e cuoci 15 minuti.'), 15);
  // An abbreviated hour joins its minutes, whatever spells them, unless they are a schedule.
  assert.equal(minOf('Запекайте 1 ч. 20 минут.'), 80);
  assert.equal(minOf('Hornea 1 h. 15 minutos.'), 75);
  assert.equal(minOf('Bake 1 hr. 15 min. before the end, add the potatoes.'), 60);
  assert.equal(minOf('Hornea 1 h. 15 minutos antes del final, añade las papas.'), 60);
});

test('the words the review found on the way, and the forms the first fixes did not pin', () => {
  for (const [text, min] of [
    ['Faites cuire entre 8 et 10 minutes.', 8], ['Cuoci tra 8 e 10 minuti.', 8],
    ['Nach 5 weiteren Minuten Käse zugeben.', 5], ['Noch 5 zusätzliche Minuten backen.', 5],
    ['Añade alga marina y cocina 10 minutos.', 10], ['10 dakika pişirin, dondurma ile servis edin.', 10],
    ['Ajoutez les petits pois congelés et faites cuire 10 minutes.', 10],
    ['Замаринуйте курицу на 2 часа.', null],
  ]) assert.equal(minOf(text), min, text);
  for (const [text, min] of [
    ['С каждой стороны, по 4 минуты.', 8], ['Fry 4 minutes or so a side.', 8], ['Cook 3 minutes approximately per side.', 6],
    ['Обжарьте с каждой стороны около 4 минут.', 8], ['Смажте з кожного боку приблизно 4 хвилини.', 8],
    ['Her iki tarafını 5\'şer dakika kızartın.', 10],
  ]) assert.equal(bsStepPerSideMin(text), min, text);
});

test('every language\'s seconds and every Russian and Ukrainian case form is a unit of its kind', () => {
  for (const [text, seconds] of [
    ['30 Sekunden', 30], ['30 Sek.', 30], ['30 segundos', 30], ['30 seg', 30], ['30 secondes', 30], ['30 secondi', 30],
    ['30 секунд', 30], ['1 секунду', 1 * 1], ['30 сек', 30], ['30 секунди', 30], ['30 saniye', 30], ['30 sn', 30],
    ['30 giây', 30], ['30 detik', 30], ['30 dtk', 30], ['daƙiƙa 30', 30],
    ['1 час', 3600], ['2 часа', 7200], ['5 часов', 18000], ['1 ч', 3600],
    ['1 годину', 3600], ['2 години', 7200], ['5 годин', 18000], ['1 год', 3600],
    ['10 мин', 600], ['10 хв', 600], ['1 минуту', 60], ['2 минуты', 120], ['5 минут', 300],
  ]) {
    const got = bsStepTimers(`Готовьте ${text}.`);
    if (seconds < 5) { assert.deepEqual(got, [], `${text}: under 5 s is not a timer`); continue; }
    assert.deepEqual(got.map((x) => x.seconds), [seconds], text);
  }
  assert.deepEqual(bsStepTimers('Köcheln 1 Std. 20 Min.').map((x) => x.label), ['1 hr', '20 min'], 'labels keep the shipped form');
});
