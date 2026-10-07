// The exercise library as data (2026-10-07, owner-approved coach-tools plan, "Build faster":
// "The library is 75 moves hard-coded in a file, and search shows 12 at most. Move it into
// the database with muscles, equipment and demo videos.").
//
// Three things are held here:
//   1. ONE RANKING. DashBuilder.searchLibrary is what GET /api/exercises calls and what the
//      builder's type-ahead will call, so these drive it directly AND through the shipped
//      route (loadRealModule compiles the real file) and require the same order from both.
//   2. THE SEED IS THE CODE'S. The migration's VALUES are read out of the SQL file and held to
//      DashBuilder.EXERCISES / LIBRARY_ALIASES / exerciseCategory, so the table cannot answer
//      "rdl" differently from the fallback the route serves before the migration runs.
//   3. THE ROUTE DEGRADES, IT DOES NOT FAIL: no table, an empty table or a failed read all
//      serve the 75 built-in moves and say so.
// Run: node --test tests/exercise-library.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeSupabase } from './helpers/fake-supabase.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const DB = require(join(ROOT, 'public/newdesign/dashBuilderCore.js'));
const SQL = readFileSync(join(ROOT, 'supabase-migrations/2026-10-07-exercise-library.sql'), 'utf8');
const names = (list) => list.map((e) => e.name);
const FALLBACK = DB.libraryFallback();
const search = (q, opts) => names(DB.searchLibrary(FALLBACK, q, opts));

// ── the seed, read out of the migration ──────────────────────────────────────
// Each VALUES row is ('id', 'name', 'muscle', 'equipment', 'category', <aliases>::text[]).
function seedRows() {
  const body = SQL.slice(SQL.indexOf('aliases) values'), SQL.indexOf('on conflict (id)'));
  const lit = "'((?:[^']|'')*)'";
  const re = new RegExp('^\\s*\\(' + [lit, lit, lit, lit, lit].join(',\\s*') + ",\\s*(array\\[(.*?)\\]|'\\{\\}')::text\\[\\]\\)", 'gm');
  const un = (s) => s.replace(/''/g, "'");
  const out = [];
  for (const m of body.matchAll(re)) {
    const aliases = m[7] == null ? [] : [...m[7].matchAll(new RegExp(lit, 'g'))].map((a) => un(a[1]));
    out.push({ id: un(m[1]), name: un(m[2]), muscle: un(m[3]), equipment: un(m[4]), category: un(m[5]), aliases });
  }
  return out;
}
const SEED = seedRows();

test('the seed parses, and every VALUES line was read', () => {
  const valueLines = SQL.split('\n').filter((l) => /^\s*\('/.test(l)).length;
  assert.ok(SEED.length >= 200, 'expected a broad library, read ' + SEED.length);
  assert.equal(SEED.length, valueLines, 'a VALUES line the reader skipped would be checked by nothing');
});

test('the 75 built-in moves are seeded first, identical, with the aliases and category the fallback carries', () => {
  assert.equal(DB.EXERCISES.length, 75);
  DB.EXERCISES.forEach((e, i) => {
    const s = SEED[i];
    assert.deepEqual([s.name, s.muscle, s.equipment], [e.name, e.muscle, e.equipment], 'built-in move ' + i + ' changed in the seed');
    assert.equal(s.category, DB.exerciseCategory(e), e.name + ': the seed and the fallback disagree on its category');
    assert.deepEqual(s.aliases, DB.LIBRARY_ALIASES[e.name] || [], e.name + ': the seed and the fallback disagree on its aliases');
  });
  // the fallback is exactly those 75, so the route answers the same before and after the migration
  assert.deepEqual(FALLBACK.map((f) => [f.id, f.name, f.category, f.aliases.join('|')]),
    SEED.slice(0, 75).map((s) => [s.id, s.name, s.category, s.aliases.join('|')]));
});

test('every seeded move: its id is its slug, its category is allowed, and no name or alias is claimed twice', () => {
  const ids = new Set();
  const keys = new Map();
  for (const s of SEED) {
    assert.equal(s.id, DB.librarySlug(s.name), s.name + ': id is not the slug of its name');
    assert.ok(!ids.has(s.id), 'duplicate id ' + s.id);
    ids.add(s.id);
    assert.ok(DB.LIBRARY_CATEGORIES.includes(s.category), s.name + ': category ' + s.category);
    assert.ok(s.muscle && s.equipment, s.name + ': no muscle or equipment');
    for (const k of [s.name, ...s.aliases].map(DB.libraryKey)) {
      // ⚠ a key claimed by two moves would let a pasted line resolve to whichever came first
      assert.ok(!keys.has(k), '"' + k + '" names both ' + keys.get(k) + ' and ' + s.name);
      keys.set(k, s.name);
    }
  }
  // the migration's own check constraint lists the same categories
  const check = /category in \(([^)]*)\)/.exec(SQL);
  assert.deepEqual(check[1].split(',').map((c) => c.trim().replace(/'/g, '')), DB.LIBRARY_CATEGORIES);
});

test('the migration is re-runnable and keeps the owner\'s demo clips', () => {
  assert.match(SQL, /create table if not exists public\.exercise_library/);
  assert.match(SQL, /create unique index if not exists exercise_library_name_lower_uidx\s+on public\.exercise_library \(lower\(name\)\)/);
  const upd = SQL.slice(SQL.indexOf('on conflict (id) do update set'));
  assert.ok(upd.length > 0, 'a re-run would fail on the primary key');
  assert.ok(!/demo_url/.test(upd), 'a re-run would wipe the demo clips the owner added');
  // reads are public, and there is no write policy at all
  assert.match(SQL, /for select\s+to anon, authenticated\s+using \(true\)/);
  assert.ok(!/for (insert|update|delete|all)/i.test(SQL), 'a write policy opens the library to every account');
  assert.ok(!/security definer/i.test(SQL));
});

// ── the ranking ──────────────────────────────────────────────────────────────
test('the tiers: exact name, exact alias, name prefix, alias prefix, word start, substring, then muscle/equipment', () => {
  const lib = [
    { name: 'Squat' }, { name: 'Squat jump' }, { name: 'Back squat', aliases: ['SQ'] },
    { name: 'Zercher', aliases: ['Squat zercher'] }, { name: 'Quads finisher', muscle: 'Legs' },
    // ⚠ SHORTER THAN "Back squat" ON PURPOSE: inside one tier the shorter name wins, so only a
    // substring that would out-sort the word start proves the word-start tier is there.
    { name: 'Hip thrust', muscle: 'Glutes', equipment: 'Barbell' }, { name: 'Ysquat' },
  ];
  assert.deepEqual(names(DB.searchLibrary(lib, 'squat')), ['Squat', 'Squat jump', 'Zercher', 'Back squat', 'Ysquat']);
  assert.deepEqual(names(DB.searchLibrary(lib, 'sq')), ['Back squat', 'Squat', 'Squat jump', 'Zercher', 'Ysquat']);
  assert.deepEqual(names(DB.searchLibrary(lib, 'bar')), ['Hip thrust'], 'equipment no longer matches');
  assert.deepEqual(names(DB.searchLibrary(lib, 'zzz')), []);
});

test('real queries on the built-in library read the way a coach expects', () => {
  assert.deepEqual(search('rdl'), ['Romanian deadlift']);
  assert.equal(search('ohp')[0], 'Overhead press');
  assert.equal(search('bench')[0], 'Bench press');
  assert.deepEqual(search('dead').slice(0, 2), ['Dead bug', 'Deadlift']);
  assert.ok(search('pull up').includes('Pull-up'), 'punctuation should not matter');
  assert.ok(search("worlds greatest").includes("World's greatest stretch"));
  // several words, each starting a word somewhere on the move
  assert.deepEqual(search('db bench'), ['Dumbbell bench press', 'Incline dumbbell press']);
  assert.deepEqual(search('barbell back'), ['Back squat', 'Barbell row']);
  // a muscle still finds its moves, as today's picker does
  assert.ok(search('quads', { limit: 100 }).length >= 9);
});

test('filters are exact on the normalized value, and an empty query lists them alphabetically', () => {
  assert.deepEqual(search('', { equipment: 'kettlebell' }), ['Kettlebell swing']);
  assert.deepEqual(search('', { equipment: 'TRAP-BAR' }), ['Trap-bar deadlift']);
  assert.deepEqual(search('row', { muscle: 'back' }), ['Cable row', 'Barbell row', 'Dumbbell row', 'Inverted row', 'Chest-supported row']);
  assert.deepEqual(search('', { category: 'power' }), ['Box jump', 'Kettlebell swing']);
  const all = search('', { limit: 100 });
  assert.deepEqual(all, [...all].sort((a, b) => (DB.libraryKey(a) < DB.libraryKey(b) ? -1 : 1)));
});

test('the limit: 30 by default, never more than 100, never less than 1', () => {
  assert.equal(search('').length, 30);
  assert.equal(search('', { limit: 5 }).length, 5);
  assert.equal(search('', { limit: 1000 }).length, 75);
  const big = Array.from({ length: 150 }, (_, i) => ({ name: 'Move ' + i }));
  assert.equal(DB.searchLibrary(big, 'move', { limit: 1000 }).length, 100);
  assert.equal(DB.searchLibrary(big, 'move', { limit: 0 }).length, 30);
  assert.equal(DB.searchLibrary(big, 'move', { limit: 'x' }).length, 30);
});

test('the order is a plain code-point order, so a browser and Node agree', () => {
  // localeCompare puts "Pull-up" and "Pullover" in different orders under different ICU data;
  // the ranking must not depend on it.
  const lib = [{ name: 'Pullover' }, { name: 'Pull-up' }, { name: 'Pull apart' }];
  assert.deepEqual(names(DB.searchLibrary(lib, '')), ['Pull apart', 'Pull-up', 'Pullover']);
  const src = readFileSync(join(ROOT, 'public/newdesign/dashBuilderCore.js'), 'utf8');
  const fn = src.slice(src.indexOf('function searchLibrary('), src.indexOf('// ── The coach\'s own moves'));
  assert.ok(fn.length > 0 && !/localeCompare/.test(fn), 'the ranking reaches for localeCompare');
});

test('searching never changes the list it was given, and skips rows with no name', () => {
  const lib = [{ name: 'B' }, { name: 'A' }, null, { name: '  ' }];
  const copy = JSON.stringify(lib);
  assert.deepEqual(names(DB.searchLibrary(lib, '')), ['A', 'B']);
  assert.equal(JSON.stringify(lib), copy);
  assert.deepEqual(DB.searchLibrary(null, 'a'), []);
});

// ── the route ────────────────────────────────────────────────────────────────
let route = null;
let client = null;
async function exercisesRoute() {
  if (route) return route;
  const { loadRealModule } = await import('./helpers/load-real-module.mjs');
  route = await loadRealModule(join(ROOT, 'src/app/api/exercises/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', require('next/server')],
      ['@/lib/request-auth', { clientForRequest: async () => client, currentUser: async () => null }],
      // the route imports the builder core by path; Node's import() of a UMD file would hide
      // its exports behind a namespace, so hand the route what `require` gives the bundler
      ['../../../../public/newdesign/dashBuilderCore.js', DB],
    ]),
  });
  return route;
}
async function get(qs, c) {
  const r = await exercisesRoute();
  client = c;
  const warned = [];
  const orig = console.warn;
  console.warn = (...a) => warned.push(a.join(' '));
  try {
    const res = await r.GET(new Request('https://shape.test/api/exercises' + (qs ? '?' + qs : '')));
    return { status: res.status, cache: res.headers.get('cache-control'), body: await res.json(), warned };
  } finally { console.warn = orig; }
}
const TABLE = SEED.map((s, i) => ({ ...s, demo_url: i === 0 ? 'https://cdn.example/back-squat.mp4' : (i === 1 ? 'http://insecure.example/x.mp4' : null) }));

test('the route ranks the table with the builder\'s own function — one order on both sides', async () => {
  const c = fakeSupabase({ tables: { exercise_library: TABLE } });
  for (const [qs, q, opts] of [
    ['q=row', 'row', {}],
    ['q=db%20bench&limit=5', 'db bench', { limit: 5 }],
    ['q=squat&equipment=Barbell', 'squat', { equipment: 'Barbell' }],
    ['muscle=Glutes&limit=100', '', { muscle: 'Glutes', limit: 100 }],
    ['category=mobility&limit=3', '', { category: 'mobility', limit: 3 }],
  ]) {
    const { status, body } = await get(qs, c);
    assert.equal(status, 200);
    assert.equal(body.source, 'library');
    const expected = DB.searchLibrary(TABLE, q, opts).map((e) => e.id);
    assert.ok(expected.length > 0, qs + ': the fixture matches nothing, so agreement proves nothing');
    assert.deepEqual(body.exercises.map((e) => e.id), expected, qs + ': the route and the picker disagree');
  }
  const { body } = await get('q=rfess', c);
  assert.deepEqual(body.exercises.map((e) => e.name), ['Bulgarian split squat'], 'an alias only the table has');
});

test('the route\'s rows: the seed\'s fields, an https demo clip or none, and a private cache', async () => {
  const c = fakeSupabase({ tables: { exercise_library: TABLE } });
  const { body, cache } = await get('q=back%20squat&limit=1', c);
  assert.deepEqual(body.exercises[0], {
    id: 'back-squat', name: 'Back squat', muscle: 'Quads', equipment: 'Barbell', category: 'strength',
    demoUrl: 'https://cdn.example/back-squat.mp4', aliases: ['Squat', 'Barbell squat', 'High-bar squat', 'Low-bar squat'],
  });
  assert.equal((await get('q=front%20squat&limit=1', c)).body.exercises[0].demoUrl, null, 'an http clip reached the page');
  // ⚠ private: the proxy may refresh a session cookie on this very response
  assert.equal(cache, 'private, max-age=300');
  // the default limit is 30 and the cap is 100, through the route too
  assert.equal((await get('', c)).body.exercises.length, 30);
  assert.equal((await get('limit=500', c)).body.exercises.length, 100);
});

test('before the migration, with an empty table, or on a failed read, the route serves the built-in moves', async () => {
  const missing = { from: () => ({ select: () => ({ limit: async () => ({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.exercise_library' in the schema cache" } }) }) }) };
  const a = await get('q=rdl', missing);
  assert.deepEqual([a.status, a.body.source, a.body.exercises.map((e) => e.name)], [200, 'builtin', ['Romanian deadlift']]);
  assert.equal(a.warned.length, 0, 'the expected pre-migration state was logged as a fault');

  const empty = await get('q=rdl', fakeSupabase({ tables: { exercise_library: [] } }));
  assert.equal(empty.body.source, 'builtin');
  assert.deepEqual(empty.body.exercises.map((e) => e.name), ['Romanian deadlift']);

  const broken = await get('q=rdl', fakeSupabase({ tables: {}, fail: ['exercise_library'] }));
  assert.equal(broken.body.source, 'builtin');
  assert.equal(broken.warned.length, 1, 'a real failure was not logged');

  const thrown = await get('', { from: () => { throw new Error('no client'); } });
  assert.equal(thrown.status, 200);
  assert.equal(thrown.body.source, 'builtin');
});

test('the route is registered in the War Room', () => {
  const src = readFileSync(join(ROOT, 'src/lib/warroom.ts'), 'utf8');
  assert.match(src, /\['\/api\/exercises', 'GET'\]/);
});
