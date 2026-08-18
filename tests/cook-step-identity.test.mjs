import test from 'node:test';
import assert from 'node:assert/strict';
import { bsStepGist, bsStepIngredients, BS_GIST_WORDS } from '../mobile-app/src/services/cookable.mjs';

// The screenshot case: a real step from "Tempo turkey lettuce cups".
const TURKEY_STEP =
  'Heat a dry skillet over medium-high. Add the turkey and press it flat; let it sit undisturbed 2 minutes to build a browned crust before breaking it apart.';

const INGS = [
  { n: '6 oz', m: 'lean ground turkey' },
  { n: '1 tbsp', m: 'soy sauce' },
  { n: '1 tsp', m: 'sesame oil' },
  { n: '2 cloves', m: 'garlic, minced' },
  { n: '1 tsp', m: 'fresh ginger, minced' },
  { n: '8 leaves', m: 'butter lettuce' },
  { n: '1', m: 'carrot, julienned' },
  { n: '1/2', m: 'cucumber, julienned' },
  { n: 'to taste', m: 'sriracha' },
];
const names = (rows) => rows.map((r) => r.m);

// ── bsStepGist ── one- or two-word timer labels ───────────────────────

const gist = (s) => bsStepGist(s, INGS);

test('THE BUG: two same-duration steps get DIFFERENT labels', () => {
  // Both parse to a 2-minute timer, so the band used to render two identical
  // "2 MIN" rows with nothing to tell them apart.
  assert.notEqual(gist('Sear the turkey 2 minutes a side.'), gist('Toast the lettuce 2 minutes.'));
});

test('names the ingredient the TIMED clause reaches for', () => {
  assert.equal(gist('Push the meat aside, add the garlic to the pan for 30 seconds.'), 'garlic');
  assert.equal(gist('Pour in the soy sauce and toss for 1 minute.'), 'soy sauce');
});

test('labels the TIMED clause, not the opening words', () => {
  // The 2-minute timer is on the resting, not on heating the skillet.
  assert.notEqual(gist(TURKEY_STEP), 'heat');
  assert.equal(gist(TURKEY_STEP), 'sit');
});

test('REGRESSION: the duration regex really matches', () => {
  // A template literal ate the backslashes in `\d+\s*` once, which silently
  // made every label fall back to the step's FIRST clause. This is the tell.
  assert.equal(gist('Heat the pan. Simmer the soy sauce 9 minutes.'), 'soy sauce');
});

test('falls back to the clause verb when no ingredient is named', () => {
  assert.equal(gist('Roast another 12 minutes until it flakes.'), 'roast');
  assert.equal(gist('Rest off the heat for 5 minutes.'), 'rest');
});

test('is never longer than two words', () => {
  const steps = [
    TURKEY_STEP,
    'Warm the peanut butter for 10 seconds.',
    'Whisk hard with a fork for 30 seconds until smooth.',
    'Cover and cook on low for 18 minutes without lifting the lid.',
    'Sear the chicken thigh 3 minutes per side.',
  ];
  for (const s of steps) {
    const g = gist(s);
    assert.ok(g.split(' ').length <= BS_GIST_WORDS, `"${g}" is more than ${BS_GIST_WORDS} words`);
  }
});

test('never opens on a conjunction or a weak auxiliary', () => {
  assert.doesNotMatch(gist('Add the stock, and cook on low for 18 minutes.'), /^(and|or|but|let|the|it)$/i);
  assert.equal(gist('Stir it through, and roast 15 minutes.'), 'roast');
});

test('carries no punctuation or digits', () => {
  for (const s of [TURKEY_STEP, 'Simmer, covered, 20 minutes.', 'Rest 5 minutes.']) {
    assert.doesNotMatch(gist(s), /[.,;:!?\d]/, `"${gist(s)}"`);
  }
});

test('junk input is absence, never a throw', () => {
  for (const v of [null, undefined, '', '   ', 42, {}, [], Symbol('x')]) {
    assert.equal(bsStepGist(v, INGS), '');
  }
  assert.doesNotThrow(() => bsStepGist('Roast 10 minutes.', null));
});

// ── bsStepIngredients ───────────────────────────────────────────────────────

test('a step lists only the ingredients it actually names', () => {
  assert.deepEqual(names(bsStepIngredients(TURKEY_STEP, INGS)), ['lean ground turkey']);
});

test('THE POINT: a prep step pulls only its own aromatics', () => {
  const step = 'Whisk the soy sauce, sesame oil, garlic and ginger in a small bowl.';
  assert.deepEqual(names(bsStepIngredients(step, INGS)), [
    'soy sauce', 'sesame oil', 'garlic, minced', 'fresh ginger, minced',
  ]);
});

test('a step that names no food returns NOTHING (renders no list)', () => {
  assert.deepEqual(bsStepIngredients('Heat a dry skillet over medium-high.', INGS), []);
});

test('matches through a prep qualifier after the comma', () => {
  // "carrot, julienned" must match a step that just says "carrot".
  assert.deepEqual(names(bsStepIngredients('Top with carrot and cucumber.', INGS)), [
    'carrot, julienned', 'cucumber, julienned',
  ]);
});

test('matches a simple plural', () => {
  assert.deepEqual(names(bsStepIngredients('Spoon into the lettuce leaves.', INGS)), ['butter lettuce']);
});

test('NO FALSE POSITIVE: a different oil does not pull sesame oil in', () => {
  // The head-noun fallback is withheld from multi-word names precisely so
  // "olive oil" cannot match "sesame oil" on the bare word "oil".
  assert.deepEqual(bsStepIngredients('Warm a little olive oil in the pan.', INGS), []);
});

test('NO FALSE POSITIVE: a different sauce does not pull soy sauce in', () => {
  assert.deepEqual(bsStepIngredients('Spoon the pan sauce over the top.', INGS), []);
});

test('NO FALSE POSITIVE: a head noun two ingredients SHARE claims neither', () => {
  // Two lettuces in one recipe — "the lettuce" cannot name either, so the step
  // must refuse rather than confidently list the wrong one.
  const two = [{ n: '8', m: 'butter lettuce' }, { n: '1 head', m: 'romaine lettuce' }];
  assert.deepEqual(bsStepIngredients('Shred the lettuce.', two), []);
  // …but the full phrase still resolves it.
  assert.deepEqual(names(bsStepIngredients('Shred the romaine lettuce.', two)), ['romaine lettuce']);
});

test('NO FALSE POSITIVE: a plural sibling cannot lend its singular to another ingredient', () => {
  // "olives" and "olive oil" were counted as DIFFERENT words, so "olive" scored
  // unique, became a lone alias for the OIL, and the plural-tolerant matcher
  // handed a pure assembly step that says "olives" the bottle of olive oil.
  const nic = [{ n: '1/2 cup', m: 'olives' }, { n: '2 tbsp', m: 'olive oil' }];
  assert.deepEqual(names(bsStepIngredients('Arrange the tomatoes, olives and tuna in a bowl.', nic)), ['olives']);
  // …and the oil still resolves from its own full phrase.
  assert.deepEqual(names(bsStepIngredients('Whisk the vinaigrette: olive oil, dijon, lemon.', nic)), ['olive oil']);
});

test('NO FALSE POSITIVE: "the tomatoes" does not pull in the tomato paste', () => {
  // Same class as the olives above — the paste has its OWN step, and listing it
  // again under the tinned tomatoes tells the cook to use it twice.
  const rag = [{ n: '1 can', m: 'chopped tomatoes' }, { n: '2 tbsp', m: 'tomato paste' }];
  assert.deepEqual(names(bsStepIngredients('Return the beef, add the tomatoes, and simmer 20 minutes.', rag)), ['chopped tomatoes']);
  assert.deepEqual(names(bsStepIngredients('Stir in the tomato paste and cook 1 minute.', rag)), ['tomato paste']);
});

test('a name the singularizer mangles still matches itself', () => {
  // "asparagus" folds to "asparagu" for the uniqueness COUNT only — the emitted
  // alias is still the recipe's own word, so the match is unaffected.
  const veg = [{ n: '1 bunch', m: 'asparagus' }, { n: '1 tbsp', m: 'olive oil' }];
  assert.deepEqual(names(bsStepIngredients('Roast the asparagus 12 minutes.', veg)), ['asparagus']);
});

test('a single-content-word name still matches on its head noun', () => {
  // "lean ground turkey" → "turkey": lean/ground are qualifiers, so the head
  // noun is the ONLY content word and is safe to match alone.
  assert.deepEqual(names(bsStepIngredients('Break the turkey apart.', INGS)), ['lean ground turkey']);
});

test('order follows the recipe, not the sentence', () => {
  const step = 'Add the ginger, then the garlic.';
  assert.deepEqual(names(bsStepIngredients(step, INGS)), ['garlic, minced', 'fresh ginger, minced']);
});

test('plain-string ingredients are supported', () => {
  assert.deepEqual(bsStepIngredients('Add the turkey.', ['lean ground turkey', 'soy sauce']), [
    'lean ground turkey',
  ]);
});

test('junk input is absence, never a throw', () => {
  assert.deepEqual(bsStepIngredients(null, INGS), []);
  assert.deepEqual(bsStepIngredients('Add the turkey.', null), []);
  assert.deepEqual(bsStepIngredients('Add the turkey.', [null, {}, { m: '' }, Symbol('x')]), []);
});

test('a regex-shaped ingredient name cannot break the matcher', () => {
  const odd = [{ n: '1', m: 'chili (hot) *special*' }];
  assert.doesNotThrow(() => bsStepIngredients('Add the chili.', odd));
});

test('a step that abbreviates the ingredient still matches it', () => {
  // "Sear the chicken" never repeats "chicken thigh, skin-on" — the distinctive
  // modifier has to be able to stand for the whole name.
  const pan = [{ n: '6 oz', m: 'chicken thigh, skin-on' }, { n: '1 cup', m: 'jasmine rice' }];
  assert.deepEqual(bsStepIngredients('Sear the chicken 3 minutes per side.', pan).map((r) => r.m), [
    'chicken thigh, skin-on',
  ]);
  assert.deepEqual(bsStepIngredients('Stir the rice into the pan.', pan).map((r) => r.m), ['jasmine rice']);
});

test('a distinctive modifier does not leak across two like ingredients', () => {
  // Two chickens → "chicken" alone is ambiguous and must claim neither.
  const two = [{ n: '6 oz', m: 'chicken thigh' }, { n: '1 cup', m: 'chicken stock' }];
  assert.deepEqual(bsStepIngredients('Sear the chicken.', two), []);
  // …the full phrase still resolves it.
  assert.deepEqual(bsStepIngredients('Sear the chicken thigh.', two).map((r) => r.m), ['chicken thigh']);
  // And "the stock" stays unmatched BY DESIGN: a category noun can name a thing
  // the cooking produced ("the pan sauce", "the juices"), so it never stands
  // alone even when it is unique on the list.
  assert.deepEqual(bsStepIngredients('Pour in the stock.', two), []);
});

