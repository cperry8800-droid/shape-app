// Small correctness fixes on the coach dashboard's website pages (2026-11-05), each driven on the
// shipping source: a function lifted out of its file and run, or the page compiled and rendered.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bsLogDaysLeg } from '../src/lib/coach-client-legs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (rel) => readFileSync(join(ROOT, rel), 'utf8');
// One top-level function out of a website file, by its name, up to the next top-level declaration.
function lift(rel, name) {
  const text = source(rel);
  const at = text.indexOf('function ' + name + '(');
  assert.ok(at >= 0, `${rel} has no function ${name}`);
  const rest = text.slice(at);
  const end = rest.search(/\n(?:function |const |let |var |\/\/ ──)/);
  return end > 0 ? rest.slice(0, end) : rest;
}

// ── 3. The builder's playlist picker reads `tracks` ─────────────────────────
test('the day\'s playlist picker counts a playlist\'s tracks from the column that holds them', () => {
  const choice = new Function(lift('public/newdesign/dashBuilder.jsx', 'dbuPlaylistChoice') + '\nreturn dbuPlaylistChoice;')();
  assert.deepEqual(choice({ name: 'Leg day', tracks: 28 }), { name: 'Leg day', meta: '28 tracks' });
  assert.deepEqual(choice({ name: 'One', tracks: 1 }), { name: 'One', meta: '1 track' });
  assert.deepEqual(choice({ name: 'Empty', tracks: 0 }), { name: 'Empty', meta: '' });
  assert.deepEqual(choice({ name: 'Old', track_count: 12 }), { name: 'Old', meta: '' }, 'no row has track_count');
  assert.doesNotMatch(source('public/newdesign/dashBuilder.jsx'), /\.track_count\b/);
});

// ── 5. "Adherence" is labelled as what it measures ──────────────────────────
test('the sessions-kept figure says what it is: 42 days, any of the client\'s coaches, unmarked as missed', () => {
  const roster = source('public/newdesign/dashRoster.jsx');
  assert.match(roster, /adherence: \{ label: "KEPT · 42D",/, 'the sort names the window');
  assert.match(roster, /\["KEPT · 42D", "adherence"\]/, 'the column head');
  assert.match(roster, /\["adherence", "Sessions kept · 42 days", DashSecAdherence\]/, 'the drawer section');
  const note = /const DASH_KEPT_NOTE = "([^"]+)";/.exec(roster)[1];
  assert.match(note, /any of their coaches/);
  assert.match(note, /counts as missed/);
  assert.doesNotMatch(roster, /\["ADHERENCE",|label: "ADHERENCE"|% adherence/);
  assert.doesNotMatch(source('public/newdesign/dashToday.jsx'), /trainingAdherence\.pct \+ "% adherence"/);
  assert.match(source('public/newdesign/dashToday.jsx'), /trainingAdherence\.pct \+ "% of sessions kept"/);
});

// ── 9. The meal builder gives a new meal the next sensible slot ─────────────
test('a day built in order is Breakfast, Lunch, Dinner, then Snacks, never Lunch after Lunch', async () => {
  const { createRequire } = await import('node:module');
  const DashMeals = createRequire(import.meta.url)('../public/newdesign/dashMealCore.js');
  const day = [];
  const food = DashMeals.FOODS[0];
  for (let i = 0; i < 5; i++) day.push(DashMeals.newMeal(food, DashMeals.nextSlot(day)));
  assert.deepEqual(day.map((m) => m.slot), ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Snack']);
  // The gap the day has, in the day's order: a coach who wrote Breakfast and Dinner gets Lunch.
  assert.equal(DashMeals.nextSlot([{ slot: 'Breakfast' }, { slot: 'Dinner' }]), 'Lunch');
  assert.equal(DashMeals.nextSlot([{ slot: 'Snack' }]), 'Breakfast');
  assert.equal(DashMeals.nextSlot(null), 'Breakfast');
  // The builder asks the core, and keeps the old rule with a cached core that lacks it.
  const pick = (core) => new Function('DashMeals', lift('public/newdesign/dashMealBuilder.jsx', 'dmbNextSlot') + '\nreturn dmbNextSlot;')(core);
  assert.equal(pick(DashMeals)([{ slot: 'Breakfast' }, { slot: 'Lunch' }]), 'Dinner');
  assert.equal(pick({})([{ slot: 'Breakfast' }]), 'Lunch');
  assert.equal(pick({})([]), 'Breakfast');
  assert.match(source('public/newdesign/dashMealBuilder.jsx'), /DashMeals\.newMeal\(f, dmbNextSlot\(day\.slots\)\)/);
});

// ── 10. The playlist builder shows the real tracks once, and the real count ──
test('the playlist builder lists each track it has once, and says how many the playlist holds', async () => {
  const { createRequire } = await import('node:module');
  const require_ = createRequire(import.meta.url);
  const React = require_('react');
  const { renderToStaticMarkup } = require_('react-dom/server');
  const babel = require_('next/dist/compiled/babel/core');
  const presetReact = require_('next/dist/compiled/babel/preset-react');
  const file = 'public/newdesign/trainerPlaylistsPage.jsx';
  const code = babel.transformSync(lift(file, 'plTrackListNote') + '\n' + lift(file, 'BuilderDetailPane'), { presets: [presetReact], babelrc: false, configFile: false }).code;
  const PlaylistCtx = React.createContext({ attachTargets: [], attachmentUnitPlural: 'workouts' });
  const Card = ({ children }) => React.createElement('div', null, children);
  const { BuilderDetailPane, plTrackListNote } = new Function('React', 'PlaylistCtx', 'Card', 'ProviderMark', 'serif', 'sans', 'INK', 'pillPrimary', 'pillGhost',
    code + '\nreturn { BuilderDetailPane, plTrackListNote };')(React, PlaylistCtx, Card, () => null, 'serif', 'sans', '#fff', {}, {});
  const sample = [['A', 'One', '3:00'], ['B', 'Two', '3:10'], ['C', 'Three', '3:20']];
  const playlist = (o) => ({ name: 'Leg day', provider: 'spotify', cover: '', accent: '#000', bpm: '120', duration: '1h', listens: 0, note: 'n', attachedTo: [], sampleTracks: sample, trackCount: 28, ...o });
  const html = renderToStaticMarkup(React.createElement(BuilderDetailPane, { p: playlist() }));
  const titles = [...html.matchAll(/>(One|Two|Three)</g)].map((m) => m[1]);
  assert.deepEqual(titles, ['One', 'Two', 'Three'], 'each sample track once, not looped to 28');
  assert.match(html, /3 of 28 tracks shown\. The full list is in Spotify\./);
  assert.match(html, />28<\/div>TRACKS/, 'the count is the playlist\'s own');
  // A live playlist: no track list read, its real count said.
  const live = renderToStaticMarkup(React.createElement(BuilderDetailPane, { p: playlist({ sampleTracks: [], trackCount: 12, provider: 'apple' }) }));
  assert.match(live, /12 tracks in this playlist\. The full list is in Apple Music\./);
  // Every track shown: nothing to add.
  assert.equal(plTrackListNote(3, 3, 'spotify'), null);
  assert.equal(plTrackListNote(0, 0, 'spotify'), null);
  assert.equal(plTrackListNote(0, 1, 'spotify'), '1 track in this playlist. The full list is in Spotify.');
  assert.doesNotMatch(source(file), /\.\.\.p\.sampleTracks, \.\.\.p\.sampleTracks/);
});

// ── 4. The Week page counts a past week's own food logs ─────────────────────
function weekHelpers() {
  const file = 'public/newdesign/dashWeek.jsx';
  const code = ['dwkIso', 'dwkAddDays', 'dwkLoggedInWeek', 'dwkDemoLogs', 'dwkFoodLogs', 'dwkWeighInsFor'].map((n) => lift(file, n)).join('\n');
  return new Function(code + '\nreturn { dwkLoggedInWeek, dwkFoodLogs, dwkWeighInsFor };')();
}
const snap = (day, kcal) => ({ snapshot_date: day, dietary_kcal: kcal });

test('the overview sends the logged days, and where a full window stops knowing', () => {
  const rows = [snap('2026-10-12', 1800), snap('2026-10-13', null), snap('2026-10-20', 2100), snap('2026-11-04', 1900)];
  assert.deepEqual(bsLogDaysLeg(rows, { full: false }), { days: ['2026-11-04', '2026-10-20', '2026-10-12'], from: null });
  assert.deepEqual(bsLogDaysLeg(rows, { full: true }).from, '2026-10-12', 'a full read knows nothing before its oldest row');
  assert.deepEqual(bsLogDaysLeg([], { full: false }), { days: [], from: null });
  assert.equal(bsLogDaysLeg(null), null);
  // A protein-only or device-burn day is not a logged day (calories EATEN, as the logs leg counts).
  assert.deepEqual(bsLogDaysLeg([{ snapshot_date: '2026-11-03', protein_g: 120, calories: 2500 }]).days, []);
});

test('a past week shows its own logging, not this week\'s; a week the window never read is said', () => {
  const W = weekHelpers();
  const logDays = { days: ['2026-11-04', '2026-11-03', '2026-10-21', '2026-10-20', '2026-10-19', '2026-10-13'], from: '2026-10-12' };
  const rec = { profile: { name: 'Ada' }, foodLogs: { daysLogged7d: 6 }, foodLogDays: logDays };
  // This week: the seven days to today, as before.
  assert.deepEqual(W.dwkFoodLogs(rec, '2026-11-02', true, true), { n: 6, label: 'Food logs · 7d', note: null });
  // Two weeks back: its own three days, not this week's six.
  assert.deepEqual(W.dwkFoodLogs(rec, '2026-10-19', false, true), { n: 3, label: 'Food logs · week', note: null });
  assert.equal(W.dwkFoodLogs(rec, '2026-10-12', false, true).n, 1);
  assert.equal(W.dwkFoodLogs(rec, '2026-10-26', false, true).n, 0, 'a week inside the window with no logs is 0');
  // Before the window: unknown, not 0.
  assert.deepEqual(W.dwkFoodLogs(rec, '2026-10-05', false, true), { n: null, label: 'Food logs · week', note: 'older than the logs read' });
  // A short window holds everything: an old week with nothing is a real 0.
  assert.equal(W.dwkFoodLogs({ ...rec, foodLogDays: { ...logDays, from: null } }, '2026-09-07', false, true).n, 0);
  // Not sent: not shared.
  assert.deepEqual(W.dwkFoodLogs({ ...rec, foodLogDays: null }, '2026-10-19', false, true), { n: null, label: 'Food logs · week', note: 'not shared' });
  // The preview's past weeks are its own sample, never this week's figure.
  const demo = W.dwkFoodLogs(rec, '2026-10-19', false, false);
  assert.ok(demo.n >= 2 && demo.n <= 7);
});

test('a past week\'s weigh-in is the one the client had by its Sunday', () => {
  const W = weekHelpers();
  const ins = [{ on: '2026-10-14', weight: 80 }, { on: '2026-10-25', weight: 79 }, { on: '2026-11-03T08:00:00Z', weight: 78 }];
  assert.deepEqual(W.dwkWeighInsFor(ins, '2026-10-19', false).map((x) => x.weight), [80, 79]);
  assert.deepEqual(W.dwkWeighInsFor(ins, '2026-11-02', true).map((x) => x.weight), [80, 79, 78]);
  assert.deepEqual(W.dwkWeighInsFor(ins, '2026-10-05', false), []);
});

test('the Week row reads the week\'s figures, and the record carries the days', () => {
  const week = source('public/newdesign/dashWeek.jsx');
  assert.match(week, /const food = dwkFoodLogs\(rec, weekOf, isCurrent, live\);/);
  assert.match(week, /const w = dwkWeighInsFor\(rec\.weighIns, weekOf, isCurrent\)/);
  assert.doesNotMatch(week, /label="Food logs · 7d"/);
  assert.match(source('public/newdesign/dashData.jsx'), /foodLogDays: ov && ov\.logDays && Array\.isArray\(ov\.logDays\.days\)/);
  assert.match(source('src/lib/shared-overview.ts'), /\.\.\.\(logDays === undefined \? \{\} : \{ logDays \}\)/);
});
