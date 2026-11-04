// The Studio tab's model and the words the coach keeps for it (owner, 2026-11-04: the trainer's
// Studio as their work in three kinds, each with an optional line of their own): coachWork.mjs's
// bsStudioModel, and profileCustom.mjs's focus, picks, descriptions and programFor cleaners. The
// page that draws the model is mounted in tests/trainer-profile.test.mjs, the editor that writes the
// words in tests/studio-editor.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bsCoachPrograms, bsWorkoutVideos, bsStudioModel } from '../mobile-app/src/services/coachWork.mjs';
import {
  BS_FOCUS_MAX, BS_FOCUS_PRESETS, BS_PICKS_MAX, BS_DESC_MAX, BS_FOR_PRESETS,
  bsProfileFocus, bsProfilePicks, bsProfileDescriptions, bsProfileProgramFor, bsNormalizeProfileCustom,
} from '../mobile-app/src/services/profileCustom.mjs';

const CLIP = 'https://abcd.supabase.co/storage/v1/object/public/coach-media/u1/clip.mp4';
const mv = (day, weekday, dayName, name, muscle) => ({ week: 0, day, weekday, dayName, name, equipment: 'Barbell', muscle, text: name });
const PLAN = { id: 'plan1', kind: 'program', name: 'Lift 3', price: 49, detail: {
  preview: true, weeks: 6, note: 'The program\'s own note.',
  blocks: [mv(0, 0, 'Legs', 'Back squat', 'Quads'), mv(1, 2, 'Push', 'Bench press', 'Chest')],
  firstWeek: [{ week: 0, day: 0, weekday: 0, dayName: 'Legs', moves: 1 }, { week: 0, day: 1, weekday: 2, dayName: 'Push', moves: 1 }],
} };
const model = (over = {}) => bsStudioModel({
  programs: bsCoachPrograms([PLAN]), videos: bsWorkoutVideos([{ key: 'v1', title: 'Walkthrough', video: CLIP, ago: '2d' }]),
  monthly: 180, offer: { includes: ['Custom programming'], blurb: 'The offer\'s own blurb.' }, ...over,
});

test('the model: each program with the coach\'s line, else its own note, and who it is for', () => {
  let m = model();
  assert.equal(m.programs.length, 1);
  assert.equal(m.programs[0].key, 'p:plan1');
  assert.equal(m.programs[0].desc, 'The program\'s own note.', 'no line written: the program\'s own note');
  assert.equal(m.programs[0].forWho, null);
  m = model({ descriptions: { 'p:plan1': 'Three days, filmed.' }, programFor: { plan1: { id: 'new' } } });
  assert.equal(m.programs[0].desc, 'Three days, filmed.');
  assert.deepEqual(m.programs[0].forWho, { id: 'new' });
});

test('the model: a program of one day is one workout, though its preview reads as a single session', () => {
  // Codex P2 on #2592: bsPlanPreview reads a one-day program as a session, and its day was missing from
  // Workouts (no pick, no line of its own).
  const ONE = { id: 'plan2', kind: 'program', name: 'Leg day', price: 19, detail: {
    preview: true, weeks: 4, blocks: [mv(0, 0, 'Legs', 'Back squat', 'Quads'), mv(0, 0, 'Legs', 'Romanian deadlift', 'Hamstrings')],
    firstWeek: [{ week: 0, day: 0, weekday: 0, dayName: 'Legs', moves: 3 }],
  } };
  const programs = bsCoachPrograms([PLAN, ONE]);
  assert.equal(programs.find((p) => p.id === 'plan2').preview.kind, 'session', 'the preview this guards');
  const m = bsStudioModel({ programs, videos: [], monthly: 0, picks: ['d:plan2:0'], descriptions: { 'd:plan2:0': 'Ten minutes, then heavy.' } });
  const w = m.workouts.find((x) => x.key === 'd:plan2:0');
  assert.ok(w, 'the one day is a workout');
  assert.equal(w.pick, true, 'and can be a pick');
  assert.equal(m.workouts[0].key, 'd:plan2:0');
  assert.equal(w.desc, 'Ten minutes, then heavy.', 'with the coach\'s line');
  assert.equal(w.label, 'MON');
  assert.equal(w.title, 'Legs');
  assert.deepEqual(w.moves.map((x) => x.name), ['Back squat', 'Romanian deadlift']);
  assert.equal(w.more, 1, 'the third move the preview did not name');
  assert.equal(w.focus, 'lower');
  assert.deepEqual(w.program, { id: 'plan2', name: 'Leg day' });
  // A session with no day of its own (no builder's first week) stays a program only.
  const BARE = { ...ONE, id: 'plan3', detail: { ...ONE.detail, firstWeek: undefined } };
  const m2 = bsStudioModel({ programs: bsCoachPrograms([BARE]), videos: [], monthly: 0 });
  assert.equal(m2.programs.length, 1);
  assert.equal(m2.workouts.length, 0);
});

test('the model: every program day and video is a workout, the picks first in the coach\'s order', () => {
  let m = model();
  assert.deepEqual(m.workouts.map((w) => w.key), ['d:plan1:0', 'd:plan1:1', 'v:v1']);
  assert.ok(m.workouts.every((w) => !w.pick));
  m = model({ picks: ['v:v1', 'v:gone', 'd:plan1:1'] });
  assert.deepEqual(m.workouts.map((w) => [w.key, w.pick]), [['v:v1', true], ['d:plan1:1', true], ['d:plan1:0', false]],
    'a pick no longer there is left out, and every workout shows once');
  m = model({ picks: ['v:v1', 'd:plan1:1', 'd:plan1:0'] });
  assert.equal(m.workouts.filter((w) => w.pick).length, BS_PICKS_MAX, 'two picks at most');
  // A focus is offered only when a workout has it.
  assert.deepEqual(model().foci, [['upper', 1], ['lower', 1]]);
});

test('the model: coaching only with a monthly price, with the coach\'s line, else the offer\'s', () => {
  assert.equal(model({ monthly: null }).coaching, null, 'no price, no coaching');
  assert.equal(model({ monthly: 0 }).coaching, null);
  assert.equal(model({ monthly: 'abc' }).coaching, null);
  let c = model().coaching;
  assert.equal(c.price, 180);
  assert.equal(c.desc, 'The offer\'s own blurb.');
  assert.deepEqual(c.includes, ['Custom programming']);
  c = model({ descriptions: { coaching: 'I write your week around you.' } }).coaching;
  assert.equal(c.desc, 'I write your week around you.');
});

test('focus: four at most, a preset kept only as one of the tokens, the coach\'s words as written', () => {
  assert.equal(BS_FOCUS_MAX, 4);
  const all = BS_FOCUS_PRESETS.map((id) => ({ id }));
  assert.deepEqual(bsProfileFocus(all), all.slice(0, 4));
  assert.deepEqual(bsProfileFocus([{ id: 'Strength' }, { id: 'yoga' }, { id: 'strength' }]), [{ id: 'strength' }], 'only the tokens, never a label or a made-up one');
  assert.deepEqual(bsProfileFocus([{ w: '  Kettlebells ' }, { w: 'kettlebells' }, { w: '' }, { id: 'cut' }]), [{ w: 'Kettlebells' }, { id: 'cut' }], 'words trimmed, once, never blank');
  assert.deepEqual(bsProfileFocus([{ w: 'x'.repeat(40) }])[0].w.length, 24);
  assert.deepEqual(bsProfileFocus('strength'), []);
});

test('picks, descriptions and who a program is for keep only their own shapes', () => {
  assert.deepEqual(bsProfilePicks(['d:plan1:0', 'v:v1', 'd:plan1:2']), ['d:plan1:0', 'v:v1'], 'two at most');
  assert.deepEqual(bsProfilePicks(['p:plan1', 'v:v1', 'v:v1', 'coaching', 42]), ['v:v1'], 'a workout\'s key, once');
  assert.deepEqual(bsProfileDescriptions({ 'p:plan1': 'One\nline ', 'x:1': 'no', coaching: '', 'v:v1': 'y'.repeat(200) }),
    { 'p:plan1': 'One line', 'v:v1': 'y'.repeat(BS_DESC_MAX) });
  assert.equal(bsProfileDescriptions({ coaching: '  ' }), null, 'nothing kept, no key');
  assert.deepEqual(BS_FOR_PRESETS, ['new', 'lifting']);
  assert.deepEqual(bsProfileProgramFor({ plan1: { id: 'new' }, plan2: { id: 'New to lifting' }, plan3: { w: ' Runners ' }, 'bad key!': { id: 'new' } }),
    { plan1: { id: 'new' }, plan3: { w: 'Runners' } });
  // The save keeps each only in its shape, and drops an emptied one.
  const doc = bsNormalizeProfileCustom({ focus: [], picks: ['nope'], descriptions: {}, programFor: { plan1: { id: 'lifting' } }, bio: 'Kept' }, 'u1');
  assert.deepEqual(doc, { programFor: { plan1: { id: 'lifting' } }, bio: 'Kept' });
});
