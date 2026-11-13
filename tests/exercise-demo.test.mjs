// Which how-to clip an exercise module shows (owner, 2026-11-13: "coaches can use stock or custom
// videos", "show the videos on the workout exercise modules in all 3 views").
//
// What it pins (mobile-app/src/services/exerciseDemo.mjs):
//   · ONE ORDER: the coach's own clip on the move, else the catalog's stock clip, else none.
//   · A STOCK CLIP IS FOUND BY THE EXACT NAME OR AN ALIAS, folded for case, accents and punctuation,
//     never a near match: a wrong demo teaches the wrong movement.
//   · ONLY https REACHES THE STOCK INDEX, and a name outranks another move's alias.
//   · THE READ: the app asks the catalog for the rows that carry a clip, once per app session, and
//     keeps no failed read.
// Run: node --test tests/exercise-demo.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { demoKey, stockDemoIndex, customDemoUrl, exerciseDemo } from '../mobile-app/src/services/exerciseDemo.mjs';

const ROWS = [
  { name: 'Romanian deadlift', aliases: ['RDL', 'Barbell RDL'], demo_url: 'https://cdn.example.com/rdl.mp4' },
  { name: 'Push-up', aliases: ['Pushup', 'Press-up'], demo_url: 'https://cdn.example.com/push-up.mp4' },
  { name: 'Back squat', aliases: ['Squat'], demo_url: ' https://cdn.example.com/back-squat.mp4 ' },
  { name: 'Plank', aliases: [], demo_url: 'http://cdn.example.com/plank.mp4' },
  { name: 'Dip', aliases: ['Dips'], demo_url: 'javascript:alert(1)' },
  { name: 'Lat pulldown', aliases: ['Pulldown'], demo_url: null },
];

test('a name folds case, accents and punctuation, nothing more', () => {
  assert.equal(demoKey('Push-up'), 'push up');
  assert.equal(demoKey('  PUSH UP '), 'push up');
  assert.equal(demoKey('Farmer\'s carry'), 'farmer s carry');
  assert.equal(demoKey('Développé couché'), 'developpe couche');
  assert.equal(demoKey(null), '');
  assert.notEqual(demoKey('Split squat'), demoKey('Squat'));
});

test('the stock index: names and aliases, https only, trimmed', () => {
  const ix = stockDemoIndex(ROWS);
  assert.equal(ix.get('romanian deadlift'), 'https://cdn.example.com/rdl.mp4');
  assert.equal(ix.get('rdl'), 'https://cdn.example.com/rdl.mp4');
  assert.equal(ix.get('press up'), 'https://cdn.example.com/push-up.mp4');
  assert.equal(ix.get('back squat'), 'https://cdn.example.com/back-squat.mp4');
  assert.ok(!ix.has('plank'), 'http is refused, as the table refuses it');
  assert.ok(!ix.has('dip') && !ix.has('dips'), 'a script URL never reaches a frame');
  assert.ok(!ix.has('lat pulldown'), 'no clip, no entry');
  assert.equal(stockDemoIndex(null).size, 0);
  assert.equal(stockDemoIndex([null, {}, { name: 'X' }]).size, 0);
});

test('a move\'s own name outranks another move\'s alias', () => {
  const ix = stockDemoIndex([
    { name: 'Row erg', aliases: ['Rower'], demo_url: 'https://cdn.example.com/erg.mp4' },
    { name: 'Rower', aliases: [], demo_url: 'https://cdn.example.com/rower.mp4' },
  ]);
  assert.equal(ix.get('rower'), 'https://cdn.example.com/rower.mp4');
});

test('the coach\'s clip: a URL or a saved clip, http(s) only', () => {
  assert.equal(customDemoUrl({ video: ' https://example.com/a.mp4 ' }), 'https://example.com/a.mp4');
  assert.equal(customDemoUrl({ video: { url: 'https://youtu.be/dQw4w9WgXcQ', name: 'Squat cue' } }), 'https://youtu.be/dQw4w9WgXcQ');
  assert.equal(customDemoUrl({ video: 'http://example.com/a.mp4' }), 'http://example.com/a.mp4');
  for (const video of ['javascript:alert(1)', 'data:video/mp4;base64,AAAA', '', null, undefined, 42, { url: 7 }])
    assert.equal(customDemoUrl({ video }), '', JSON.stringify(video));
  assert.equal(customDemoUrl(null), '');
});

test('one order: the coach\'s clip, else the stock clip, else none', () => {
  const ix = stockDemoIndex(ROWS);
  assert.deepEqual(exerciseDemo({ m: 'Back squat', video: 'https://example.com/mine.mp4' }, ix), { url: 'https://example.com/mine.mp4', source: 'custom' });
  assert.deepEqual(exerciseDemo({ m: 'Back squat' }, ix), { url: 'https://cdn.example.com/back-squat.mp4', source: 'stock' });
  assert.deepEqual(exerciseDemo({ m: 'rdl' }, ix), { url: 'https://cdn.example.com/rdl.mp4', source: 'stock' }, 'an alias, as an open session types it');
  assert.deepEqual(exerciseDemo({ m: 'Back squat', video: 'javascript:alert(1)' }, ix), { url: 'https://cdn.example.com/back-squat.mp4', source: 'stock' }, 'an unsafe clip falls to stock');
  assert.equal(exerciseDemo({ m: 'Split squat' }, ix), null, 'no near match');
  assert.equal(exerciseDemo({ m: 'Pause back squat' }, ix), null, 'no near match');
  assert.equal(exerciseDemo({ m: '' }, ix), null);
  assert.equal(exerciseDemo({ m: 'Back squat' }, null), null, 'before the stock read, coaches\' clips only');
});

test('the app reads only the catalog rows with a clip, once, and keeps no failed read', () => {
  const src = fs.readFileSync('mobile-app/src/services/shapeBackend.js', 'utf8');
  const at = src.indexOf('function loadExerciseDemos()');
  assert.ok(at > 0, 'the loader');
  const body = src.slice(at, src.indexOf('window.ShapeExerciseDemos', at));
  assert.match(body, /from\('exercise_catalog'\)\s*\.select\('name, aliases, demo_url'\)\s*\.not\('demo_url', 'is', null\)/);
  assert.match(body, /if \(_stockDemoRows\) return Promise\.resolve\(_stockDemoRows\);/, 'read once per app session');
  assert.match(body, /\.finally\(\(\) => \{ _stockDemoRead = null; \}\)/, 'a failed read is asked again next time');
  assert.match(src, /window\.ShapeExerciseDemos = \{ load: loadExerciseDemos, cached: \(\) => _stockDemoRows \};/);
});
