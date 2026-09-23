// Every host of a plain-<script> module this change extends asks for the new copy.
//
// ⚠ THE PRECOMPILE CONTENT-HASHES text/babel TAGS ONLY (`BABEL_TAG` in
// scripts/build-newdesign.mjs). A plain <script src="x.js?v=…"> keeps whatever key a
// human last typed, so a page whose babel source is always fresh can be handed a copy
// of the module it calls that predates the functions it calls — and `public/newdesign`
// has no error boundary, so a missing function is a blank page, not a missing card.
//
// ⚠ AND IT HAD ALREADY HAPPENED ONE PR AGO. #2144 added 150 lines to dashMealCore.js —
// `customFoodsFromTemplates`, `searchCustomFoods`, `canCreateFood`, the rules the meal
// builder calls on every render — and left both hosts asking for `?v=20260613`, three
// months older than the functions. Nothing checked, because every guard of this kind
// was written per-feature. This one is written per-MODULE, and it is DERIVED: it asks
// the tree which pages load or render a consumer, never a list someone must remember.
//
// A stale workoutDocument.js is the quiet one: it does not throw. It normalizes without
// `splitLegacyRpe` and delivers without `rpe`, so a coach's target RPE simply vanishes
// from every assignment — the data loss this change's RPE axis exists to prevent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

const dir = new URL('../public/newdesign/', import.meta.url);
const read = (f) => readFileSync(new URL(f, dir), 'utf8');
const html = readdirSync(dir).filter((f) => f.endsWith('.html'));
const jsx = readdirSync(dir).filter((f) => f.endsWith('.jsx'));

// The key a host asks for. Keys in this tree are an 8-digit date plus an optional
// letter suffix (`20260613b`), so they order correctly as strings.
const keyOf = (page, mod) => {
  const m = new RegExp('src="' + mod.replace(/\./g, '\\.') + '\\?v=(\\d{8}[a-z]*)"').exec(read(page));
  return m ? m[1] : null;
};
const loads = (page, file) => read(page).includes('src="' + file);

// The change this guard pins, PER MODULE. Moving a module past its entry here means it
// changed again and every host needs the newer key — which is the point. Per module,
// because one shared floor would make an untouched module's hosts bump for nothing.
// ⚠ 20260922c: the library filters — `programFacts`, `programTagFacet` and the tag rules
// in the builder core, `mealPlanFacts` and `ALLERGENS` in the meal core. A page handed the
// older copy calls functions that are not there, which here is a blank page.
// ⚠ 20260923: per-set targets — `ladder`, `setTarget`, `perSetEntries` and the
// ladder-aware `loadLabel` in the document module, which the builder's new per-set
// table calls on every render, and the ladder-aware labels in the builder core.
const MIN = {
  'workoutDocument.js': '20260923',
  'dashBuilderCore.js': '20260923',
  'dashMealCore.js': '20260922c',
  'dashSignals.js': '20260922b',
};

// ⚠ A MODULE WITH NO ENTRY IN MIN MUST FAIL, NOT PASS. `k < undefined` is false for
// every key, so a module added to a checked list without a floor would report no stale
// host at all and the guard would switch itself off. (CodeRabbit, #2150.)
const stale = (pages, mod) => {
  assert.ok(/^\d{8}[a-z]*$/.test(MIN[mod] || ''), 'no MIN key for ' + mod + ' — give it the key this change wrote');
  return pages
    .map((p) => [p, keyOf(p, mod)])
    .filter(([, k]) => !k || k < MIN[mod])
    .map(([p, k]) => p + ' (' + (k || 'no dated key') + ')');
};

for (const mod of ['workoutDocument.js', 'dashBuilderCore.js', 'dashMealCore.js']) {
  test(`every host of ${mod} asks for the copy this change wrote`, () => {
    const hosts = html.filter((p) => loads(p, mod));
    assert.ok(hosts.length >= 2, `found ${hosts.length} host(s) for ${mod} — the sweep has stopped matching`);
    assert.deepEqual(stale(hosts, mod), [], `hosts asking for a ${mod} older than the functions their pages call`);
  });
}

// dashSignals.js is loaded by most of the tree, and bumping every host would be the
// needless sweep this repo's own conventions warn against. So its key matters only
// where a page actually CALLS what this change added: a .jsx that renders a workout
// card through `workoutCardExercises`, or a module that numbers rows through
// `groupLabels` / keys them through `groupKey`.
const SIGNALS_FNS = ['workoutCardExercises', 'groupLabels', 'groupKey'];

test('every host that calls the superset rules asks for a new enough signals module', () => {
  const callers = jsx.filter((f) => SIGNALS_FNS.some((fn) => stripComments(read(f)).includes('DashSignals.' + fn + '(')));
  assert.ok(callers.length >= 2, 'found no .jsx calling the superset rules — the sweep has stopped matching');
  // The page components those modules declare — what a host writes as a JSX tag. A
  // host counts when it LOADS the module and RENDERS one of its components: rendering
  // a name it never loads is ClientDashboard-print.html, already registered as broken
  // one level up (#2140), and a key bump cannot help a page with no module to key.
  const rendering = html.filter((p) => callers.some((f) => loads(p, f)
    && [...stripComments(read(f)).matchAll(/^function ([A-Z][A-Za-z0-9]*)\s*\(/gm)].some((m) => read(p).includes('<' + m[1]))));
  // A plain module that calls the rules through its own `Signals` handle.
  const modules = readdirSync(dir).filter((f) => f.endsWith('.js'))
    .filter((f) => /\bSignals\.(groupLabels|groupKey)\(/.test(stripComments(read(f))));
  assert.ok(modules.includes('dashBuilderCore.js'), 'the builder core no longer calls the shared label rule — this guard is reading nothing');
  const loading = html.filter((p) => modules.some((m) => loads(p, m)));
  const hosts = [...new Set([...rendering, ...loading])].sort();
  assert.ok(hosts.length >= 4, 'found too few hosts (' + hosts.join(', ') + ')');
  assert.deepEqual(stale(hosts, 'dashSignals.js'), [], 'hosts asking for a signals module older than the superset rules they call');
});

test('a module with no floor fails the check instead of passing every host', () => {
  assert.throws(() => stale(['TrainerApp.html'], 'noSuchModule.js'), /no MIN key for noSuchModule\.js/);
});

// ⚠ THE COMPARISON ITSELF IS CHECKED, because a guard that compares keys as numbers
// silently drops the letter suffix and passes `20260922` against `20260922b`.
test('a key with a letter suffix orders after the bare date', () => {
  assert.ok('20260922b' > '20260922');
  assert.ok('20260923' > '20260922b');
  assert.ok('20260613' < MIN['dashMealCore.js']);
  assert.ok('20260922b' < MIN['dashBuilderCore.js'], 'the builder core moved past the key its hosts asked for before');
});

// ⚠ AND THE ORDER, NOT ONLY THE KEY. dashBuilderCore.js captures `DashSignals` and
// `ShapeWorkoutDocument` ONCE, when it evaluates — so a host that loads either one
// after it gives the builder `undefined` for good, and the first call to number a
// day's rows throws during render, which in `public/newdesign` is a blank page.
test('every host of the builder core loads the two modules it captures, first', () => {
  const hosts = html.filter((p) => loads(p, 'dashBuilderCore.js'));
  assert.ok(hosts.length >= 2, 'found no builder hosts — the sweep has stopped matching');
  const late = [];
  for (const p of hosts) {
    const src = read(p), core = src.indexOf('src="dashBuilderCore.js');
    for (const dep of ['dashSignals.js', 'workoutDocument.js']) {
      const at = src.indexOf('src="' + dep);
      if (at < 0 || at > core) late.push(p + ' loads ' + dep + (at < 0 ? ' not at all' : ' after the core'));
    }
  }
  assert.deepEqual(late, [], 'hosts where the builder core evaluates before a module it captures');
});

