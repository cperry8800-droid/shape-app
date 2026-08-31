import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  BS_PREF_OPTIONS,
  bsPrefOptionLabel,
  bsPrefOptionDisplay,
  bsPrefOptionToken,
  bsGoalKind,
} from '../mobile-app/src/services/prefOptions.mjs';

// The eight Settings pref rows stored English copy and then REGEX-MATCHED it at
// three sites, one of them a server route. This pins the split in BOTH
// directions — the member reads a label, the store keeps a token — plus the
// classifier that has to survive it, because `fat_loss` does not match
// /fat ?loss/ and a reader that kept only the regex would reclassify silently.

const CLIENT = path.join('mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx');
const ROUTE = path.join('src', 'app', 'api', 'client', 'analytics', 'route.ts');

// ⚠ Strip comments first. The rationale written at each site quotes the very
// expressions these assertions ban; this repo has burned that trap more than once.
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}
const clientSrc = stripComments(fs.readFileSync(CLIENT, 'utf8'));
const routeSrc = stripComments(fs.readFileSync(ROUTE, 'utf8'));

const ROWS = Object.keys(BS_PREF_OPTIONS);
const ALL = ROWS.flatMap((r) => BS_PREF_OPTIONS[r].map((o) => ({ row: r, ...o })));

// The three readers' ORIGINAL classifiers, kept verbatim so parity is measured
// against what shipped rather than against a paraphrase of it.
const oldHomeAndServer = (np, tp) => {
  const raw = `${np || ''} ${tp || ''}`.toLowerCase();
  return /fat ?loss|cut|lean|weight ?loss|shred/.test(raw) ? 'cut'
    : /hypertroph|build|bulk|mass|muscle|strength|gain/.test(raw) ? 'build'
    : 'maintain';
};

test('guard-the-guard: the table is the eight rows, every option shaped', () => {
  assert.equal(ROWS.length, 8, 'eight pref rows');
  assert.equal(ALL.length, 47, '47 shipped options');
  for (const o of ALL) {
    assert.ok(o.id && typeof o.id === 'string', `${o.row} id`);
    assert.ok(o.en && typeof o.en === 'string', `${o.row}.${o.id} en`);
    assert.equal(o.id, o.id.trim(), `${o.row}.${o.id} id is not padded`);
    assert.ok(!/\s/.test(o.id), `${o.row}.${o.id} id carries no whitespace`);
  }
  for (const r of ROWS) {
    const ids = BS_PREF_OPTIONS[r].map((o) => o.id);
    assert.equal(new Set(ids).size, ids.length, `${r} ids are unique`);
  }
});

test('label: token renders copy, free text passes through, empty is empty', () => {
  assert.equal(bsPrefOptionLabel('primary_goal', 'fat_loss'), 'Fat loss');
  assert.equal(bsPrefOptionLabel('calorie_range', 'r1600_1800'), '1600–1800');
  assert.equal(bsPrefOptionLabel('primary_goal', 'powerlifting meet'), 'powerlifting meet');
  assert.equal(bsPrefOptionLabel('allergies', 'Shellfish'), 'Shellfish', 'a row with no options');
  for (const v of ['', null, undefined, '   ']) assert.equal(bsPrefOptionLabel('primary_goal', v), '');
});

test('token: ids stay, legacy English maps, free text passes through', () => {
  for (const o of ALL) {
    assert.equal(bsPrefOptionToken(o.row, o.id), o.id, `${o.row}.${o.id} id is idempotent`);
    assert.equal(bsPrefOptionToken(o.row, o.en), o.id, `${o.row} "${o.en}" is legacy English`);
    assert.equal(bsPrefOptionToken(o.row, `  ${o.en.toUpperCase()}  `), o.id, `${o.row} case + padding`);
  }
  assert.equal(bsPrefOptionToken('primary_goal', 'powerlifting meet'), 'powerlifting meet');
  assert.equal(bsPrefOptionToken('allergies', 'Shellfish'), 'Shellfish');
  for (const v of ['', null, undefined, '   ']) assert.equal(bsPrefOptionToken('primary_goal', v), '');
});

test('round-trip: every shipped option survives label → token', () => {
  for (const o of ALL) assert.equal(bsPrefOptionToken(o.row, bsPrefOptionLabel(o.row, o.id)), o.id);
});

test('display never trims — a member is still typing', () => {
  assert.equal(bsPrefOptionDisplay('primary_goal', 'fat_loss'), 'Fat loss');
  assert.equal(bsPrefOptionDisplay('primary_goal', 'Fat loss and '), 'Fat loss and ');
  assert.equal(bsPrefOptionDisplay('allergies', ' Shellfish '), ' Shellfish ');
  assert.equal(bsPrefOptionDisplay('primary_goal', ''), '');
  assert.equal(bsPrefOptionDisplay('password', undefined), '');
});

test('the classifier is behaviour-preserving on every legacy English goal', () => {
  for (const o of BS_PREF_OPTIONS.primary_goal) {
    const was = oldHomeAndServer('', o.en);
    assert.equal(bsGoalKind('', o.en), was, `legacy "${o.en}"`);
    assert.equal(bsGoalKind('', o.id), was, `token "${o.id}" must classify the same`);
  }
});

test('a TOKEN cannot be classified by the English regex alone — the fallback is load-bearing', () => {
  // The reason the split needs a token map at all: the underscore is not a space.
  assert.ok(!/fat ?loss/.test('fat_loss'), 'fat_loss does not match the shipped cut regex');
  assert.equal(bsGoalKind('', 'fat_loss'), 'cut', 'so the token map has to decide it');
});

test('free text still classifies, and cut is tested before build', () => {
  assert.equal(bsGoalKind('', 'deficit'), 'cut');
  assert.equal(bsGoalKind('', 'surplus'), 'build');
  assert.equal(bsGoalKind('', 'get jacked'), 'maintain');
  assert.equal(bsGoalKind('fat_loss', 'strength'), 'cut', 'cut wins the pair');
  assert.equal(bsGoalKind('fat', 'loss'), 'cut', 'a phrase split across the two fields');
  for (const v of ['', null, undefined]) assert.equal(bsGoalKind(v, v), 'maintain');
});

test('the Eat header is no longer a constant: the training pick decides it', () => {
  // It read `client_nutrition_prefs.primary_goal`, which nothing writes — the
  // picker is a TRAINING row — so every member read "Maintaining" whatever they
  // chose. Reading both blobs is what makes the header truthful.
  const kinds = BS_PREF_OPTIONS.primary_goal.map((o) => bsGoalKind('', o.id));
  assert.ok(new Set(kinds).size > 1, 'the six shipped picks must not collapse to one kind');
  assert.equal(bsGoalKind('', 'fat_loss'), 'cut');
  assert.equal(bsGoalKind('', 'hypertrophy'), 'build');
  assert.equal(bsGoalKind('', 'general_health'), 'maintain');
});

test('all three readers call the shared classifier and none keeps a local regex', () => {
  const home = clientSrc.match(/setEnergyGoal\([^\n]*\)/);
  const eat = clientSrc.match(/setPlanGoal\([^\n]*\)/);
  assert.ok(home && /bsGoalKind\(/.test(home[0]), 'home energy goal reads bsGoalKind');
  assert.ok(eat && /bsGoalKind\(/.test(eat[0]), 'the Eat header reads bsGoalKind');
  assert.ok(/bsGoalKind\(/.test(routeSrc), 'the analytics route reads bsGoalKind');
  for (const [name, src] of [['client', clientSrc], ['route', routeSrc]]) {
    assert.ok(!/fat \?loss\|cut\|lean/.test(src), `${name} keeps no local cut regex`);
    assert.ok(!/hypertroph\|build\|bulk/.test(src), `${name} keeps no local build regex`);
  }
});

test('every option row sources its options from the module, never a literal', () => {
  for (const r of ROWS) {
    const row = new RegExp(`\\{ k: '${r}',[^\\n]*\\}`).exec(clientSrc);
    assert.ok(row, `${r} row is declared`);
    assert.ok(row[0].includes(`options: BS_PREF_OPTIONS.${r}`), `${r} sources its options from the module`);
    assert.ok(!/options: \[/.test(row[0]), `${r} declares no inline option array`);
  }
});

test('the editor stores a token, compares a token, and renders a label', () => {
  const save = /if \(editField\.store\) \{[\s\S]{0,400}?persistPref\([^\n]*\)/.exec(clientSrc);
  assert.ok(save, 'the pref branch of saveEditField');
  assert.ok(/bsPrefOptionToken\(editField\.key/.test(save[0]), 'the saved value is normalised to a token');

  const chip = /editField\.options\.map\(\(opt\)[\s\S]{0,600}?<\/button>/.exec(clientSrc);
  assert.ok(chip, 'the option chip row');
  assert.ok(/bsPrefOptionToken\(editField\.key, editField\.value, tr\) === String\(id\)/.test(chip[0]),
    'selection compares tokens, never the rendered string');
  assert.ok(!/String\(editField\.value\) === String\(opt\)/.test(chip[0]),
    'the old copy-equality comparison is gone');
  assert.ok(/bsPrefOptionLabel\(editField\.key, id, tr\)/.test(chip[0]), 'the chip renders a translated label');
});

test('every surface that shows a stored pref renders the label, not the token', () => {
  for (const m of clientSrc.matchAll(/r: ([^,]*?nutritionPrefs|[^,]*?trainingPrefs)\[row\.k\]/g)) {
    assert.ok(m[0].includes('bsPrefOptionLabel(row.k,'), `row summary renders a label: ${m[0]}`);
  }
  const rowSummaries = [...clientSrc.matchAll(/r: bsPrefOptionLabel\(row\.k, (nutrition|training)Prefs\[row\.k\], tr\)/g)];
  assert.equal(rowSummaries.length, 2, 'both row lists render labels');

  for (const key of ['nutritionPrefs.dietary_style', 'trainingPrefs.experience']) {
    const card = new RegExp(`summary: ${key.replace('.', '\\.')} \\? tr\\([^\\n]*?\\)`).exec(clientSrc);
    assert.ok(card, `${key} hub card`);
    assert.ok(/bsPrefOptionLabel\(/.test(card[0]), `${key} hub summary renders a label`);
  }
});
