// A trainer's work on their profile (owner, 2026-10-29: "There needs to be videos in replays of
// specific workouts or programs. The layout of the gym floor needs to include coaches workouts
// based on those machines"): mobile-app/src/services/coachWork.mjs, the station pins in the
// profile doc, and the sample trainer's programs. The page that draws them is mounted in
// tests/trainer-profile.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bsCoachPrograms, bsProgramMoves, bsWorkoutVideos, bsPieceMoves, bsMovePieces, bsStudioWork, bsWorkPrice, bsWorkPaid,
  BS_WORK_PROGRAMS_MAX, BS_WORK_VIDEOS_MAX, BS_WORK_MOVES_MAX,
} from '../mobile-app/src/services/coachWork.mjs';
import { bsStudioItem, bsProfileStudio, BS_STATION_PINS_MAX } from '../mobile-app/src/services/profileCustom.mjs';
import { bsTrainerDemo, bsSampleEnglish, BS_SAMPLE_CLIPS, BS_SAMPLE_PROGRAM_IDS } from '../mobile-app/src/services/trainerDemo.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VIDEO = 'https://abcd.supabase.co/storage/v1/object/public/coach-media/u1/intro.mp4';
const row = (name, equipment, extra = {}) => ({ week: 0, day: 0, weekday: 0, dayName: 'A', name, ...(equipment ? { equipment } : {}), muscle: 'x', text: name, ...extra });
const plan = (over = {}) => ({ id: 'p1', kind: 'program', name: 'Strong', price: 49, detail: { preview: true, blocks: [row('Back squat', 'Barbell')], weeks: 6, media: [] }, ...over });

// The exercise library the app's builder and the AI draft use (dashBuilderCore.js EXERCISES).
const LIBRARY = (() => {
  const src = readFileSync(join(ROOT, 'public/newdesign/dashBuilderCore.js'), 'utf8');
  const block = src.slice(src.indexOf('var EXERCISES = ['), src.indexOf('];', src.indexOf('var EXERCISES = [')));
  return [...block.matchAll(/\["([^"]+)", "([^"]*)", "([^"]*)"\]/g)].map((m) => ({ name: m[1], muscle: m[2], equipment: m[3] }));
})();

test('the library\'s moves land on the pieces they are done on', () => {
  assert.equal(LIBRARY.length, 75);
  const on = Object.fromEntries(LIBRARY.map((m) => [m.name, bsMovePieces(m)]));
  const expect = {
    'Back squat': ['rack'], 'Front squat': ['rack'], 'Goblet squat': ['dumbbells'], 'Hack squat': ['hack'], 'Leg press': ['legpress'],
    'Leg extension': ['legext'], 'Leg curl': ['legcurl'], Deadlift: ['platform'], 'Romanian deadlift': ['platform'], 'Trap-bar deadlift': ['platform'],
    'Good morning': ['rack'], 'Nordic curl': ['ghd'], 'Hip thrust': ['hipthrust'], 'Back extension': ['ghd'],
    'Bench press': ['rack', 'bench', 'adjbench'], 'Dumbbell bench press': ['bench', 'adjbench', 'dumbbells'], 'Machine chest press': ['chest'],
    Dip: ['dip'], 'Cable fly': ['cable'], 'Overhead press': ['rack'], 'Lat pulldown': ['cable', 'latpull'], 'Barbell row': ['rack'],
    'Pull-up': ['rig'], 'Chin-up': ['rig'], 'Inverted row': ['rig'], 'Barbell curl': ['barbells'], 'Skull crusher': ['bench'],
    Plank: ['mats'], 'Cable crunch': ['cable'], 'Ab wheel rollout': ['mats'], 'Kettlebell swing': ['bells'], 'Box jump': ['boxes'],
    'Sled push': ['turf', 'sled'], 'Assault bike': ['airbike'], Rower: ['rower'], 'Easy run': ['treadmill'], 'Hill sprints': ['turf'],
    'Farmer carry': ['dumbbells', 'turf'], 'Standing calf raise': [], 'Band pull-apart': [], 'Jump rope': [],
  };
  for (const [name, pieces] of Object.entries(expect)) assert.deepEqual(on[name], pieces, name);
  // A piece no move is done on (the speaker, the kitchen's) never matches.
  for (const m of LIBRARY) for (const t of ['speaker', 'desk', 'mirror', 'fridge', 'sofa', 'zone']) assert.equal(bsPieceMoves(t, m), false, `${m.name} on ${t}`);
});

test('a move\'s equipment places it; its name places it unless its equipment says otherwise', () => {
  assert.equal(bsPieceMoves('bells', { name: 'Turkish get-up', equipment: '' }), true, 'a name with no equipment written');
  assert.equal(bsPieceMoves('bells', { name: 'Anything at all', equipment: 'Kettlebell' }), true, 'the equipment alone');
  assert.equal(bsPieceMoves('rack', { name: 'Back squat', equipment: 'Dumbbell' }), false, 'a squat with dumbbells is not on the rack');
  assert.equal(bsPieceMoves('rack', { name: 'Back squat' }), true, 'a text outline\'s squat is');
  assert.equal(bsPieceMoves('rack', { name: 'Bulgarian split squat', equipment: 'Barbell' }), false, 'a name the piece never means');
  assert.equal(bsPieceMoves('bike', { name: 'Assault bike', equipment: 'Bike' }), false, 'the air bike is not the bike');
  assert.equal(bsPieceMoves('mats', { name: 'Cable crunch', equipment: 'Cable' }), false);
  assert.equal(bsPieceMoves('rack', { name: '', equipment: 'Safety bar' }), false, 'no name, no move');
  assert.equal(bsPieceMoves('nonsense', { name: 'Back squat' }), false);
  assert.equal(bsPieceMoves('rack', null), false);
  assert.deepEqual(bsMovePieces({ name: 'Landmine press', equipment: 'Landmine' }), ['landmine']);
});

test('a program\'s moves: a builder\'s rows with their equipment, a text outline cut to names, once each', () => {
  assert.deepEqual(bsProgramMoves({ blocks: [row('Back squat', 'Barbell'), row('back squat', 'Barbell'), row('Plank', 'Bodyweight'), row('  ', 'Barbell')] }),
    [{ name: 'Back squat', equipment: 'Barbell', muscle: 'x' }, { name: 'Plank', equipment: 'Bodyweight', muscle: 'x' }]);
  assert.deepEqual(bsProgramMoves({ blocks: ['Week 1 — Base', 'Mon — Push', 'Bench press — 3 × 8 · 60 kg', { text: 'Monster walk — 3 × 10' }, 'Tuesday', 'Row: 5 × 500 m'] }).map((m) => m.name),
    ['Bench press', 'Monster walk', 'Row'], 'structure lines are not moves; a weekday-looking exercise is');
  const many = Array.from({ length: 200 }, (_, i) => row(`Move ${i}`, 'Barbell'));
  assert.equal(bsProgramMoves({ blocks: many }).length, BS_WORK_MOVES_MAX);
  assert.deepEqual(bsProgramMoves(null), []);
  assert.deepEqual(bsProgramMoves({ blocks: 'x' }), []);
});

test('the coach\'s programs: never a meal plan, the one free video, its poster, weeks, price and moves', () => {
  const out = bsCoachPrograms([
    plan({ id: 7, detail: { preview: true, weeks: 12, blocks: [row('Back squat', 'Barbell')], media: [
      { url: 'http://x.test/a.mp4', type: 'video' }, { url: VIDEO, type: 'video', name: 'Intro' }, { url: 'https://x.test/a.jpg', type: 'image' }] } }),
    { id: 'm', kind: 'meal_plan', name: 'Cut', price: 20, detail: {} },
    plan({ id: null }), plan({ id: 'n', name: '   ' }), null, 'x',
    plan({ id: 'q', name: 'Engine', price: 'Free', detail: { preview: true, blocks: [] } }),
  ]);
  assert.deepEqual(out.map((p) => p.id), ['7', 'q']);
  const [a, b] = out;
  assert.deepEqual(a.video, { url: VIDEO, type: 'video', name: 'Intro' }, 'https only');
  assert.equal(a.poster, 'https://x.test/a.jpg');
  assert.equal(a.weeks, 12, 'the builder\'s weeks when the plan states none');
  assert.equal(a.price, '$49');
  assert.deepEqual(a.moves, [{ name: 'Back squat', equipment: 'Barbell', muscle: 'x' }]);
  assert.equal(a.plan.id, 7, 'the row the storefront buys');
  assert.equal(b.price, 'Free');
  assert.deepEqual([a.paid, b.paid], [true, false], 'a free program is not sold');
  assert.equal(b.video, null);
  assert.equal(bsCoachPrograms(Array.from({ length: 40 }, (_, i) => plan({ id: i }))).length, BS_WORK_PROGRAMS_MAX);
  assert.deepEqual(bsCoachPrograms(null), []);
  assert.deepEqual([bsWorkPrice(null), bsWorkPrice(0), bsWorkPrice(''), bsWorkPrice(29), bsWorkPrice('$29')], [null, null, null, '$29', '$29']);
  assert.deepEqual(['Free', 0, '0', '', null, 29, '$29', '12.50'].map(bsWorkPaid), [false, false, false, false, false, true, true, true]);
});

test('the workouts on video: https only, a session\'s sets kept, a dozen at most', () => {
  const out = bsWorkoutVideos([
    { key: 'a', title: 'Squat', body: 'Brace', video: VIDEO, ago: '2d', typeLabel: 'Strength' },
    { key: 'b', title: 'Pulls', video: VIDEO, breakdown: { label: 'Sets', rows: [['Set 1', 'x']] } },
    { key: 'c', title: 'Plain', video: 'http://x.test/v.mp4' }, { key: 'd', title: 'None' }, null,
    { key: 'e', title: 'Empty sets', video: VIDEO, breakdown: { label: 'Sets', rows: [] } },
  ]);
  assert.deepEqual(out.map((w) => w.key), ['a', 'b', 'e']);
  assert.deepEqual(out[0].video, { url: VIDEO, type: 'video', name: 'Squat' });
  assert.equal(out[0].breakdown, null);
  assert.deepEqual(out[1].breakdown.rows, [['Set 1', 'x']]);
  assert.equal(out[2].breakdown, null, 'no sets, no stepper');
  assert.equal(bsWorkoutVideos(Array.from({ length: 30 }, (_, i) => ({ key: i, video: VIDEO }))).length, BS_WORK_VIDEOS_MAX);
});

test('each piece of the studio holds its share of the programs; a zone what is inside it; a station its pins', () => {
  const programs = bsCoachPrograms([
    plan({ id: 'p1', name: 'Strong', detail: { preview: true, blocks: [row('Back squat', 'Barbell'), row('Bench press', 'Barbell'), row('Dumbbell row', 'Dumbbell')] } }),
    plan({ id: 'p2', name: 'Engine', detail: { preview: true, blocks: [row('Rower', 'Rower'), row('Goblet squat', 'Dumbbell')] } }),
  ]);
  const studio = { items: [
    { t: 'rack', x: 0, y: 0, w: 40, h: 40, st: { title: 'Rack', pins: ['p2', 'gone'] } },
    { t: 'dumbbells', x: 100, y: 100, w: 40, h: 10 },
    { t: 'zone', x: 90, y: 90, w: 100, h: 100, tag: 'Free weights' },
    { t: 'speaker', x: 300, y: 300, w: 10, h: 10, st: { title: 'Music' } },
    { t: 'rower', x: 200, y: 0, w: 10, h: 40 },
  ] };
  const w = bsStudioWork(studio, programs);
  assert.deepEqual(w[0], { programs: [{ id: 'p1', name: 'Strong', moves: ['Back squat', 'Bench press'] }], count: 2, pinned: ['p2'] }, 'a pin to a program not published is left out');
  assert.deepEqual(w[1].programs.map((x) => [x.id, x.moves]), [['p1', ['Dumbbell row']], ['p2', ['Goblet squat']]]);
  assert.deepEqual(w[2].programs.map((x) => [x.id, x.moves]), [['p1', ['Dumbbell row']], ['p2', ['Goblet squat']]], 'the zone holds the dumbbells inside it');
  assert.equal(w[3], null, 'nothing on the speaker');
  assert.equal(w[4].count, 1);
  assert.deepEqual(bsStudioWork(null, programs), []);
});

test('a station keeps up to three program ids as pins, lower-cased, once each', () => {
  const id = (n) => `aaaaaaa${n}-bbbb-4ccc-8ddd-eeeeeeeeeeee`;
  const piece = (pins) => bsStudioItem({ t: 'rack', x: 0, y: 0, w: 40, h: 40, st: { title: 'Rack', note: '', pins } });
  assert.deepEqual(piece([id(1).toUpperCase(), id(1), 'not-an-id', 7, id(2), id(3), id(4)]).st.pins, [id(1), id(2), id(3)]);
  assert.deepEqual(piece([id(9).toUpperCase()]).st.pins, [id(9)], 'an id given in capitals is kept, lower-cased');
  assert.equal(BS_STATION_PINS_MAX, 3);
  assert.equal('pins' in piece([]).st, false, 'no pins, no key');
  assert.equal('pins' in piece(['nope']).st, false);
  assert.equal('pins' in piece('x').st, false);
  // The scan stops: an id past the first dozen entries is never read.
  assert.equal('pins' in piece([...Array(12).fill('x'), id(5)]).st, false);
  assert.equal(bsStudioItem({ t: 'rack', x: 0, y: 0, w: 40, h: 40, pins: [id(1)] }).pins, undefined, 'pins only on a station');
});

test('the sample trainer: two programs per kind of coach, the main station pins one, and no clip until there is one', () => {
  for (const [kind, family, names, pinned] of [
    ['gym', 'strength', ['Strong in 12', 'Barbell basics'], BS_SAMPLE_PROGRAM_IDS.strong],
    ['garage', 'conditioning', ['Engine 8', 'Bike and bells'], BS_SAMPLE_PROGRAM_IDS.engine],
  ]) {
    const d = bsTrainerDemo({ kind, family });
    assert.deepEqual(d.programs.map((p) => p.name), names);
    assert.ok(d.programs.every((p) => p.sample === true && p.weeks > 0 && p.perWeek > 1 && p.moves.length), `${kind}: whole programs`);
    const studio = bsProfileStudio(d.custom.studio);
    const pins = studio.items.filter((p) => p.st && p.st.pins).flatMap((p) => p.st.pins);
    assert.ok(pins.includes(pinned), `${kind}: a station pins ${pinned}`);
    const w = bsStudioWork(studio, d.programs);
    assert.ok(w.filter(Boolean).length >= 3, `${kind}: the programs light the floor`);
    // Each sample program plays its clip, and each clip is a workout posted on video.
    assert.ok(d.programs.every((p) => p.video && Object.values(BS_SAMPLE_CLIPS).includes(p.video.url) && p.video.type === 'video'), `${kind}: every program has its clip`);
    assert.equal(d.workouts.length, 2, `${kind}: a workout per clip`);
    assert.ok(d.workouts.every((w) => w.video && Object.values(BS_SAMPLE_CLIPS).includes(w.video.url)), `${kind}: the workouts play the clips`);
    assert.deepEqual(new Set(d.workouts.map((w) => w.video.url)), new Set(d.programs.map((p) => p.video.url)), `${kind}: its two clips, each once`);
  }
  assert.deepEqual(Object.keys(BS_SAMPLE_CLIPS), ['squat', 'deadlift', 'row', 'swings']);
  // The clips are the owner's generated ones on Higgsfield's CDN (marketing/shape-radio-launch-cut.md's
  // Sources), each an mp4 the player plays in the page, and no two the same.
  const urls = Object.values(BS_SAMPLE_CLIPS);
  assert.ok(urls.every((u) => /^https:\/\/d8j0ntlcm91z4\.cloudfront\.net\/user_3E30hta4RMpS2cDML3JnB5dGPnY\/hf_\d{8}_\d{6}_[0-9a-f-]{36}\.mp4$/.test(u)), 'the CDN mp4s');
  assert.equal(new Set(urls).size, 4);
  const sources = readFileSync(join(ROOT, 'marketing/shape-radio-launch-cut.md'), 'utf8');
  for (const u of urls) assert.ok(sources.includes(u.split('/').pop()), `recorded in Sources: ${u.split('/').pop()}`);
  // Every sample move is the library's, with its equipment.
  const lib = new Map(LIBRARY.map((m) => [m.name, m.equipment]));
  for (const family of ['strength', 'conditioning']) {
    for (const p of bsTrainerDemo({ family }).programs) for (const m of p.moves) assert.equal(lib.get(m.name), m.equipment, `${p.name}: ${m.name}`);
  }
});

// Owner, 2026-10-30: "Translate all sample text". Every word on a sample trainer's page that the
// sample writes goes through `say` under profile:sample.*, with the English catalog's text as its
// default; exercise names stay the library's.
test('the sample trainer\'s words all go through say, each with the English catalog\'s text', () => {
  const en = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/profile.json'), 'utf8'));
  const asked = new Map();
  const say = (key, english, values) => {
    assert.match(key, /^profile:sample\./, key);
    assert.equal(en[key.slice('profile:'.length)], english, `${key}: the English catalog's text`);
    asked.set(key, english);
    return '«' + bsSampleEnglish(key, english, values) + '»';
  };
  const said = (v) => typeof v === 'string' && v.startsWith('«') && v.endsWith('»');
  for (const kind of ['gym', 'private', 'garage', 'pilates', 'boxing', 'outdoor']) {
    for (const family of ['strength', 'conditioning']) {
      const d = bsTrainerDemo({ kind, family, say });
      const where = `${kind}/${family}`;
      for (const p of d.custom.studio.items) if (p.st && p.st.note) assert.ok(said(p.st.note), `${where}: a station note`);
      for (const r of d.replays) {
        for (const v of [r.typeLabel, r.title, r.body, r.breakdown.label, ...r.statsRow.map((x) => x[0]), ...r.breakdown.rows.map((x) => x[0])]) assert.ok(said(v), `${where}: replay ${r.key}: ${v}`);
        for (const x of r.breakdown.rows) assert.match(x[2], /^RPE \d( · «[^»]+»)?$/, `${where}: ${x[2]}`);
      }
      for (const pr of d.programs) {
        assert.ok(said(pr.name) && said(pr.plan.detail.note), `${where}: program ${pr.name}`);
        for (const day of pr.plan.detail.firstWeek) assert.ok(said(day.dayName), `${where}: ${pr.name}: a day`);
        assert.ok(pr.moves.every((m) => !said(m.name)), 'exercise names stay the library\'s');
      }
      for (const w of d.workouts) for (const v of [w.title, w.body, w.typeLabel]) assert.ok(said(v), `${where}: workout ${w.key}`);
      assert.ok(said(d.live.goal) && said(d.provider.specialty), `${where}: the bio and specialty`);
      assert.ok(d.provider.monthly_offer.includes.every(said), `${where}: the offer`);
      assert.ok(d.reviews.list.every((r) => said(r.text) && !said(r.author)), `${where}: the reviews' words, not their names`);
    }
  }
  // Every trainer sample key the English catalog has is one the sample asks for, so none is left
  // over (the nutritionist sample's are sample.nutri.*, tests/nutritionist-profile.test.mjs).
  const keys = Object.keys(en).filter((k) => k.startsWith('sample.') && !k.startsWith('sample.nutri.')).map((k) => 'profile:' + k);
  assert.deepEqual([...asked.keys()].sort(), keys.sort());
  // With no translator, the English as before.
  const plain = bsTrainerDemo({ kind: 'garage', family: 'conditioning' });
  assert.deepEqual(plain.workouts.map((w) => w.title), ['Rower pacing', 'Kettlebell swings']);
  assert.equal(plain.replays[0].breakdown.rows[4][2], 'RPE 9 · best round');
});
