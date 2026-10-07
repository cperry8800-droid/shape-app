// tests/builder-fixes-client.test.mjs
//
// WHAT A MEMBER GETS FROM THE COACH'S BUILDER, on 2026-10-07's approved fixes (owner:
// "Apply all the fixes first"). The builder wrote three things no member surface read:
//
//   · the BLOCK each move sits in. `builderToAssignmentRows` stamped `block` on every
//     exercise, the plan route's whitelist dropped it, and the app's workout preview
//     invented "Warm-up / Main set / Cool-down" around every day instead, every move
//     under Main;
//   · the day's Shape Radio PLAYLIST. The route delivered it; the app's Train mapping
//     dropped it, so the hero never chipped it the way the website card does;
//   · the day's walkthrough and the program's introduction VIDEOS, which the website
//     Train page's card mapping (`dtrToCard`) never passed.
//
// Driven through the shipping code end to end where it can be: a builder day →
// `builderToAssignmentRows` → the route's real `mapExercises` → the app's real
// `bsBuildTrainProgram` → the real preview and Train page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadBroadsheet, drive, flatten, textOf, THEME, SHIM, ROOT } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { bsMoveBlocks, bsSessionMoves } from '../mobile-app/src/services/workoutSession.mjs';

const require_ = createRequire(import.meta.url);
const React = require_('react');
const RDS = require_('react-dom/server');
const W = require_('../public/newdesign/workoutDocument.js');
const DashBuilder = require_('../public/newdesign/dashBuilderCore.js');

// The member reads English off the real `en` catalog, so a key this change added or
// renamed is checked on the screen that shows it (the broadsheet-session-render rule).
const CAT = new Map();
const catalog = (ns) => {
  if (!CAT.has(ns)) {
    const p = join(ROOT, 'mobile-app', 'src', 'i18n', 'catalogs', 'en', `${ns}.json`);
    CAT.set(ns, existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
  }
  return CAT.get(ns);
};
globalThis.ShapeI18n = {
  t(key, opts) {
    const i = String(key).indexOf(':');
    const raw = i < 0 ? null : (catalog(key.slice(0, i)) || {})[key.slice(i + 1)];
    if (raw == null) return undefined;
    return String(raw).replace(/\{\s*([A-Za-z_][\w-]*)\s*(?:,[^{}]*)?\}/g, (m, n) => (opts && n in opts ? String(opts[n]) : m));
  },
};

// The Train page's other effects listen for resizes and schedule frames; give them the
// no-op browser surface they need rather than swallowing their errors.
globalThis.window.addEventListener = () => {};
globalThis.window.removeEventListener = () => {};
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

const RUN_EFFECTS = { ...SHIM, useEffect(fn) { fn(); } };
const { BSWorkoutPreview, BSClientTrain, bsBuildTrainProgram } = await loadBroadsheet(['BSWorkoutPreview', 'BSClientTrain', 'bsBuildTrainProgram'], RUN_EFFECTS);
const tr = (k, o) => (o && o.defaultValue) || k;

// A coach's day as the builder holds it: four blocks, a superset, a demo on one move,
// a walkthrough, a playlist — and a program introduction on the document.
const row = (name, extra = {}) => ({ ...DashBuilder.newRow({ name }), ...extra });
const coachDay = () => ({
  id: 'd1', name: 'Lower', weekday: 0, video: 'https://shape.test/walkthrough.mp4',
  playlist: { name: 'Lower Push — Peak', meta: '14 tracks' },
  blocks: [
    { kind: 'warmup', rows: [row('Hip 90/90 flow', { sets: 2, reps: '5' })] },
    { kind: 'main', rows: [row('Back squat', { load: 100, video: 'https://shape.test/squat.mp4' }), row('Romanian deadlift', { load: 80 })] },
    { kind: 'accessory', rows: [row('Split squat', { group: 'A' }), row('Leg curl', { group: 'A' })] },
    { kind: 'finisher', rows: [row('Sled push', { sets: 4, reps: '20 m' })] },
  ],
});
const assigned = () => W.builderToAssignmentRows({ version: 1, weeks: [{ days: [coachDay()] }], video: 'https://shape.test/program.mp4' }, { id: 't', name: 'T' }, '2026-10-05')[0];

const nextServer = { NextResponse: { json: (body, init) => ({ body, init }) } };
const route = await loadRealModule(join(ROOT, 'src/app/api/client/plan/route.ts'), {
  typescript: true,
  appendExports: 'export { mapExercises };',
  registry: new Map([
    ['next/server', nextServer],
    ['@/lib/request-auth', { clientForRequest: async () => null, currentUser: async () => null }],
    ['@/lib/require-membership', { requireMembership: async () => null }],
  ]),
});

// The plan route's workout, as the app receives it (the fields this suite reads).
function delivered({ blocks = true } = {}) {
  const a = assigned();
  const exercises = route.mapExercises({ exercises: blocks ? a.payload.exercises : a.payload.exercises.map(({ block, ...e }) => e) });
  return { id: 'w1', title: a.title, scheduledDate: null, playlist: a.payload.playlist, video: a.payload.video, programVideo: a.payload.programVideo, exercises };
}

// ── One rule for what a block is ────────────────────────────────────────────
test('the document\'s block kinds are the builder\'s, and anything else is no block', () => {
  assert.deepEqual(W.BLOCK_KINDS, DashBuilder.BLOCK_KINDS.map((k) => k.key), 'the two lists drifted: a kind the builder offers would read as no block to a member');
  for (const [v, want] of [['warmup', 'warmup'], [' Main ', 'main'], ['FINISHER', 'finisher'], ['accessory', 'accessory'],
    ['cooldown', ''], ['', ''], [null, ''], [undefined, ''], [3, ''], [{}, '']]) {
    assert.equal(W.blockKind(v), want, `${JSON.stringify(v)} → ${JSON.stringify(want)}`);
  }
});

test('the plan route delivers each move\'s block, under the document\'s rule', () => {
  const a = assigned();
  assert.deepEqual(a.payload.exercises.map((e) => e.block), ['warmup', 'main', 'main', 'accessory', 'accessory', 'finisher'], 'setup: the assign flow stamps the block');
  const out = route.mapExercises(a.payload);
  assert.deepEqual(out.map((e) => e.block), ['warmup', 'main', 'main', 'accessory', 'accessory', 'finisher'], 'the whitelist dropped the coach\'s blocks');
  assert.deepEqual(route.mapExercises({ exercises: [{ name: 'X', block: 'cooldown' }, { name: 'Y' }, { name: 'Z', block: ' Main' }] }).map((e) => e.block), ['', '', 'main'],
    'a block the builder does not offer is no block, never a heading nobody wrote');
});

// ── Grouping, and the player it must not touch ──────────────────────────────
test('moves group by the coach\'s blocks, in the coach\'s order', () => {
  const moves = [{ m: 'a', block: 'warmup' }, { m: 'b', block: 'main' }, { m: 'c', block: 'main' }, { m: 'd', block: 'accessory' }, { m: 'e', block: 'main' }];
  assert.deepEqual(bsMoveBlocks(moves).map((g) => [g.kind, g.moves.map((m) => m.m)]),
    [['warmup', ['a']], ['main', ['b', 'c']], ['accessory', ['d']], ['main', ['e']]],
    'two blocks of one kind stay two groups, where the coach put them');
  // A stray with no block stays with the group before it rather than opening a heading.
  assert.deepEqual(bsMoveBlocks([{ m: 'a', block: 'main' }, { m: 'b' }, { m: 'c', block: 'finisher' }]).map((g) => [g.kind, g.moves.map((m) => m.m)]),
    [['main', ['a', 'b']], ['finisher', ['c']]]);
  assert.deepEqual(bsMoveBlocks([]), []);
});

test('an assignment without blocks is one plain list, not invented headings', () => {
  const moves = [{ m: 'a' }, { m: 'b', block: 'cooldown' }, { m: 'c', block: '' }];
  const groups = bsMoveBlocks(moves);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, '');
  assert.equal(groups[0].moves, moves, 'the same list, untouched');
});

test('grouping leaves the moves the session player runs exactly as they were', () => {
  const day = bsBuildTrainProgram([delivered()], THEME, tr).find((d) => d.moves.length);
  const before = bsSessionMoves(day.moves);
  const grouped = bsMoveBlocks(day.moves).flatMap((g) => g.moves);
  assert.equal(grouped.length, day.moves.length);
  grouped.forEach((m, i) => assert.equal(m, day.moves[i], 'the same move objects, in the same order'));
  assert.deepEqual(bsSessionMoves(grouped), before, 'the player is handed what it was handed before');
  // And the block is only a passenger on the move: without it, the player's moves are the same.
  const strip = (list) => list.map(({ block, ...m }) => m);
  assert.deepEqual(strip(bsSessionMoves(day.moves)), bsSessionMoves(strip(day.moves)));
});

// ── The app's workout preview ───────────────────────────────────────────────
// The headings and moves in reading order: a heading is a BSOLHead's label, a move is
// the name span of its row (the 15px display line).
function ledger(d) {
  const out = [];
  for (const n of d.nodes()) {
    if (n.type && n.type.name === 'BSOLHead') out.push('# ' + n.props.label);
    else if (n.type === 'span' && n.props.style && n.props.style.fontSize === 15 && n.props.style.fontWeight === 600) out.push(textOf(n));
  }
  return out;
}
const previewOf = (workout) => {
  const day = bsBuildTrainProgram([workout], THEME, tr).find((x) => x.moves.length);
  return drive(BSWorkoutPreview, { program: day, coach: 'Coach', onBack() {}, onStart() {} });
};

test('the preview shows the coach\'s blocks, by their names, in the coach\'s order', () => {
  const d = previewOf(delivered());
  assert.deepEqual(ledger(d), [
    '# Warm-up', 'Hip 90/90 flow',
    '# Main', 'Back squat', 'Romanian deadlift',
    '# Accessory', 'Split squat', 'Leg curl',
    '# Finisher', 'Sled push',
  ]);
  assert.doesNotMatch(d.text, /Main set|Cool-down|prime CNS|stretch the worked muscles/, 'an invented heading or note survived');
});

test('a day without blocks is one list under the deck\'s own heading', () => {
  const d = previewOf(delivered({ blocks: false }));
  assert.deepEqual(ledger(d), ['# The program', 'Hip 90/90 flow', 'Back squat', 'Romanian deadlift', 'Split squat', 'Leg curl', 'Sled push']);
  assert.doesNotMatch(d.text, /Warm-up|Main set|Cool-down/);
});

test('a rest day keeps its recovery block', () => {
  const rest = bsBuildTrainProgram([], THEME, tr)[0];
  const d = drive(BSWorkoutPreview, { program: rest, onBack() {}, onStart() {} });
  assert.deepEqual(ledger(d), ['# Recovery']);
});

// ── The day's playlist, in the app ──────────────────────────────────────────
test('the Train mapping carries the coach\'s playlist for the day', () => {
  const day = bsBuildTrainProgram([delivered()], THEME, tr).find((d) => d.moves.length);
  assert.deepEqual(day.playlist, { name: 'Lower Push — Peak', meta: '14 tracks' });
  const none = bsBuildTrainProgram([{ ...delivered(), playlist: null }], THEME, tr).find((d) => d.moves.length);
  assert.equal(none.playlist, null);
  const blank = bsBuildTrainProgram([{ ...delivered(), playlist: { name: '  ', meta: 'x' } }], THEME, tr).find((d) => d.moves.length);
  assert.equal(blank.playlist, null, 'a playlist with no name is no playlist');
});

const settle = () => new Promise((r) => setTimeout(r, 0));
async function trainPage(workout) {
  globalThis.window.ShapeAuth = { getCachedState: () => ({ user: { id: 'member-a' } }) };
  globalThis.window.ShapePlan = { get: async () => ({ training: { hasPlan: true, coach: 'Coach Kim', workouts: [workout] } }) };
  let opened = 0;
  const d = drive(BSClientTrain, { onProfile() {}, goRadio: () => { opened += 1; } });
  await settle();
  d.render();
  return { d, opened: () => opened };
}
const today = () => { const x = new Date(); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };

test('the Train hero chips the day\'s playlist the way the website card does, and opens Radio', async () => {
  const { d, opened } = await trainPage({ ...delivered(), scheduledDate: today() });
  assert.match(d.text, /Back squat/, 'setup: the live day is on the page');
  const chip = d.buttons().find((b) => b.label.startsWith('♪'));
  assert.ok(chip, 'no playlist chip on the hero');
  assert.equal(chip.label, '♪ Lower Push — Peak · 14 tracks');
  d.click('♪');
  assert.equal(opened(), 1, 'the chip opens Shape Radio');
  delete globalThis.window.ShapePlan;
});

test('a day without a playlist, and a rest day, chip nothing', async () => {
  const { d } = await trainPage({ ...delivered(), playlist: null, scheduledDate: today() });
  assert.match(d.text, /Back squat/);
  assert.ok(!d.buttons().some((b) => b.label.startsWith('♪')));
  // Today is rest when the only workout sits on another day of the week.
  const other = new Date(); other.setDate(other.getDate() + (other.getDay() === 0 ? -1 : 1));
  const iso = other.getFullYear() + '-' + String(other.getMonth() + 1).padStart(2, '0') + '-' + String(other.getDate()).padStart(2, '0');
  const rest = await trainPage({ ...delivered(), scheduledDate: iso });
  assert.ok(!rest.d.buttons().some((b) => b.label.startsWith('♪')), 'a rest day is no session, so it has no soundtrack');
  delete globalThis.window.ShapePlan;
});

// ── The website's Train page card ───────────────────────────────────────────
test('the website Train card shows the walkthrough, the introduction and each demo', async () => {
  // The page-shell globals these classic scripts read at render, as every host loads them.
  globalThis.DashSignals = require_('../public/newdesign/dashSignals.js');
  Object.assign(globalThis, { React, serif: 'serif' });
  const nd = (f) => fileURLToPath(new URL('../public/newdesign/' + f, import.meta.url));
  const registry = new Map([['react', React]]);
  const { dtrToCard } = await loadRealModule(nd('dashTrain.jsx'), { registry, appendExports: 'export { dtrToCard };' });
  const { DashWorkoutCard } = await loadRealModule(nd('dashClient.jsx'), { registry, appendExports: 'export { DashWorkoutCard };' });
  const card = dtrToCard(delivered(), 'Coach Kim');
  assert.equal(card.video, 'https://shape.test/walkthrough.mp4');
  assert.equal(card.programVideo, 'https://shape.test/program.mp4');
  assert.equal(card.exercises.find((e) => e.name === 'Back squat').video, 'https://shape.test/squat.mp4');
  const html = RDS.renderToStaticMarkup(React.createElement(DashWorkoutCard, { workout: card, interactive: false, maxRows: 99 }));
  for (const label of ['Program introduction', 'Workout walkthrough', 'Back squat demonstration']) {
    assert.ok(html.includes('▷ Watch · ' + label), `the card offers no ${label}`);
  }
  assert.ok(html.includes('♪ Lower Push — Peak · 14 tracks'), 'and the playlist chip it already had');
  const bare = dtrToCard({ title: 'X', exercises: [] }, 'c');
  assert.equal(bare.video, null);
  assert.equal(bare.programVideo, null);
});
