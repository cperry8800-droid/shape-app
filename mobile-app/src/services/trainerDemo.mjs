// ─── SAMPLE TRAINER PAGES ────────────────────────────────────────────────────────────────────
// Owner, 2026-10-28 ("Still seeing old profile", then "demo environment should show new profile
// designs"): a trainer page with no Shape account behind it is the new trainer profile with
// sample content. That is the trainer app's own page signed out (the demo coach), and any coach
// a member opens who has no account: the marketplace's seeded listings and the app's demo
// people. BSTrainerProfile feeds this through the same code a real coach's page runs (the
// availability goes through bsProjectAvailability, the replays are replay cards), and the sample
// itself reads nothing from Shape and writes nothing to it.
//
// What a sample coach has is what an account would give it: a wall photo, a studio drawn with a
// note at each station, a week of open and busy times, replays and reviews. Each coach gets its
// own from a seed (its listing id or name): the photo, and a studio and replays that fit its
// specialty. What its listing says (name, bio, credential, price, rating) stays its listing's.
//
// The sample words (the bio, the station notes, the replays, the programs, the workouts, the
// reviews) are in the reader's language (owner, 2026-10-30: "Translate all sample text"), through
// `say`, the profile's tr under profile:sample.* with the English as its default. The studio's
// station names are the template's, also in the reader's language (`word`). Exercise names stay
// the exercise library's, as a real coach's programs show them. Loads come in the reader's units
// (`lb`), as plate-friendly numbers in each.
//
// No pronouns: the sample coach's words go by their first name.

import { bsStudioFromTemplate, STUDIO_WORDS } from './studioKit.mjs';
import { bsCoachPrograms } from './coachWork.mjs';

// The English, with any {name} filled in: what `say` is when no translator is given.
export const bsSampleEnglish = (key, text, values) => (values ? String(text).replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m)) : text);

// The demo photos (mobile-app/public/demo), and the only wall photos a sample page shows or
// Make it yours offers there.
export const BS_TRAINER_DEMO_PHOTOS = ['box-cover.webp', 'studio-01.webp', 'plan-01.webp', 'wall-02.webp', 'studio-03.webp', 'studio-02.webp'];

// A note at every station any starting layout has (studioKit's templates), by its key.
const NOTES = {
  squatRacks: 'Most sessions start here: a squat or a press, worked up to one heavy set.',
  squatRack: 'Squats, presses and pull-ups, worked up to one heavy set.',
  rack: 'Squats and presses, worked up to one heavy set.',
  platform: 'Deadlifts and cleans. We film the top set and go through it together after.',
  freeWeights: 'Dumbbells and kettlebells for the accessory work, paired up so the hour keeps moving.',
  machines: "For what a barbell can't load well: hamstrings, upper back, a pump to finish.",
  cardio: 'Ten easy minutes to warm up. Conditioning days finish on the air bike.',
  turf: 'Sled pushes and carries. The last ten minutes, most days.',
  cable: 'Rows, presses and the small work that keeps shoulders healthy.',
  frontDesk: "Check in here. We read last week's notes before we start.",
  desk: "Where we start: last week's notes and how you slept.",
  kettlebells: 'Swings, carries and goblet squats, paired so the hour keeps moving.',
  speaker: 'Music on, phones away. Bring your playlist if you like.',
  clientWall: "Every client's best lift this year, written up on the wall.",
  mats: 'Mobility to start, core work to finish.',
  reformers: 'Reformer work for control and strength through the whole range.',
  barre: 'Balance and the small muscles, slow and exact.',
  ring: 'Pad work and footwork drills, in three-minute rounds.',
  bags: 'Bag rounds for conditioning: three minutes hard, one minute off.',
  rig: 'Pull-ups, rows and hangs. Everyone leaves with stronger hands.',
  meetHere: 'We meet here whatever the weather. Bring water and a layer.',
};

// The station each starting layout pins a sample program to, by its key.
const PINS = {
  squatRacks: () => BS_SAMPLE_PROGRAM_IDS.strong,
  squatRack: () => BS_SAMPLE_PROGRAM_IDS.strong,
  rack: (family) => (family === 'conditioning' ? BS_SAMPLE_PROGRAM_IDS.engine : BS_SAMPLE_PROGRAM_IDS.strong),
  kettlebells: (family) => (family === 'conditioning' ? BS_SAMPLE_PROGRAM_IDS.bells : BS_SAMPLE_PROGRAM_IDS.basics),
  turf: () => BS_SAMPLE_PROGRAM_IDS.engine,
};

// Weekly open hours as the hours editor stores them: Monday to Friday 6:00 to 20:00, Saturday
// 8:00 to 12:00, Sunday off.
const SLOTS = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start_minute: 360, duration_min: 840 }))
  .concat([{ weekday: 6, start_minute: 480, duration_min: 240 }]);
// Each weekday's sessions ([hour, minutes long]) and time away, so every day reads differently.
const DAYS = {
  1: { sessions: [[6, 60], [7, 60], [9, 60], [10, 60], [12, 60], [17, 60], [18, 60]], away: [13, 15] },
  2: { sessions: [[6, 60], [8, 60], [11, 60], [12, 60], [14, 60], [16, 60], [17, 60]] },
  3: { sessions: [[6, 60], [7, 60], [9, 90], [12, 60], [16, 60], [17, 60], [18, 60]], away: [13, 15] },
  4: { sessions: [[6, 60], [8, 60], [10, 60], [11, 60], [14, 60], [17, 60]] },
  5: { sessions: [[6, 60], [7, 60], [9, 60], [12, 60], [16, 60], [17, 60]], away: [14, 16] },
  6: { sessions: [[8, 60], [9, 60]] },
};

const set = (lb, kg, pounds, reps) => `${lb ? pounds : kg} ${lb ? 'lb' : 'kg'} × ${reps}`;

// Two kinds of replays: lifting, and conditioning (rounds against the clock).
function replaysFor(family, lb, photo, S) {
  const COND = S('type.conditioning', 'Conditioning'), STR = S('type.strength', 'Strength'), TIME = S('stat.time', 'Time');
  const round = (n) => S('row.round', 'Round {n}', { n }), block = (n) => S('row.block', 'Block {n}', { n }), setN = (n) => S('row.set', 'Set {n}', { n });
  const rpe = (n, tag) => `RPE ${n}${tag ? ' · ' + tag : ''}`;
  if (family === 'conditioning') {
    return [
      {
        key: 'demo-bike', typeLabel: COND, title: S('replay.bike.title', 'Air bike intervals'), ago: '2d', photo: null,
        body: S('replay.bike.body', 'Forty seconds on, eighty off. Held the pace to the last round, so next week the rest gets shorter.'),
        statsRow: [[S('stat.bestRound', 'Best round'), '17 cal'], [TIME, '24:10']],
        breakdown: { label: S('breakdown.rounds', 'Rounds'), rows: [
          [round(1), '0:40 · 14 cal', rpe(7)], [round(2), '0:40 · 15 cal', rpe(8)], [round(3), '0:40 · 15 cal', rpe(8)],
          [round(4), '0:40 · 16 cal', rpe(9)], [round(5), '0:40 · 17 cal', rpe(9, S('tag.bestRound', 'best round'))],
        ] },
      },
      {
        key: 'demo-circuit', typeLabel: COND, title: S('replay.circuit.title', 'Sled, carries and burpees'), ago: '4d', photo: photo('studio-01.webp'),
        body: S('replay.circuit.body', 'Four rounds of a sled push, a farmer carry and ten burpees. Every round faster than the one before.'),
        statsRow: [[S('stat.fastestRound', 'Fastest round'), '4:36'], [TIME, '38:00']],
        breakdown: { label: S('breakdown.rounds', 'Rounds'), rows: [
          [round(1), '4:55', rpe(7)], [round(2), '4:48', rpe(8)], [round(3), '4:41', rpe(8)], [round(4), '4:36', rpe(9, S('tag.fastest', 'fastest'))],
        ] },
      },
      {
        key: 'demo-swings', typeLabel: COND, title: S('replay.swings.title', 'Kettlebell swings, every two minutes'), ago: '6d', photo: photo('plan-01.webp'),
        body: S('replay.swings.body', 'Thirty swings at the top of every two minutes. Hips snap, arms just hold on.'),
        statsRow: [[S('stat.swings', 'Swings'), '150'], [TIME, '10:00']],
        breakdown: { label: S('breakdown.blocks', 'Blocks'), rows: [
          [block(1), set(lb, 24, 53, 30), rpe(6)], [block(2), set(lb, 24, 53, 30), rpe(7)], [block(3), set(lb, 24, 53, 30), rpe(8)],
          [block(4), set(lb, 24, 53, 30), rpe(8)], [block(5), set(lb, 24, 53, 30), rpe(9, S('tag.lastBlock', 'last block'))],
        ] },
      },
    ];
  }
  return [
    {
      key: 'demo-squat', typeLabel: STR, title: S('replay.squat.title', 'Back squat, heavy triples'), ago: '2d', photo: photo('studio-03.webp'),
      body: S('replay.squat.body', 'Paused the first rep of every set. Bar speed held to the last triple, so it goes up next week.'),
      statsRow: [[S('stat.topSet', 'Top set'), set(lb, 130, 285, 3)], [TIME, '48:20']],
      breakdown: { label: S('breakdown.workingSets', 'Working sets'), rows: [
        [setN(1), set(lb, 100, 225, 3), rpe(6)], [setN(2), set(lb, 110, 245, 3), rpe(7)], [setN(3), set(lb, 120, 265, 3), rpe(8)],
        [setN(4), set(lb, 125, 275, 3), rpe(8)], [setN(5), set(lb, 130, 285, 3), rpe(9, S('tag.topSet', 'top set'))],
      ] },
    },
    {
      key: 'demo-pull', typeLabel: STR, title: S('replay.pull.title', 'Deadlift and rows'), ago: '4d', photo: photo('studio-02.webp'),
      body: S('replay.pull.body', 'Pulled from a dead stop every rep, no bounce. Rows strict, chest on the bench.'),
      statsRow: [[S('stat.topSet', 'Top set'), set(lb, 180, 405, 2)], [TIME, '55:05']],
      breakdown: { label: S('breakdown.workingSets', 'Working sets'), rows: [
        [S('row.deadliftSet', 'Deadlift · Set {n}', { n: 1 }), set(lb, 150, 335, 3), rpe(6)], [S('row.deadliftSet', 'Deadlift · Set {n}', { n: 2 }), set(lb, 165, 365, 3), rpe(7)],
        [S('row.deadliftSet', 'Deadlift · Set {n}', { n: 3 }), set(lb, 180, 405, 2), rpe(9, S('tag.topSet', 'top set'))],
        [S('row.rowSet', 'Row · Set {n}', { n: 1 }), set(lb, 30, 65, 10), rpe(7)], [S('row.rowSet', 'Row · Set {n}', { n: 2 }), set(lb, 30, 65, 10), rpe(8)],
      ] },
    },
    {
      key: 'demo-press', typeLabel: STR, title: S('replay.press.title', 'Bench press, fives'), ago: '6d', photo: null,
      body: S('replay.press.body', 'Feet set, shoulder blades pinned, a one-second pause on the chest. Five clean sets.'),
      statsRow: [[S('stat.topSet', 'Top set'), set(lb, 92.5, 205, 5)], [TIME, '41:30']],
      breakdown: { label: S('breakdown.workingSets', 'Working sets'), rows: [
        [setN(1), set(lb, 80, 175, 5), rpe(6)], [setN(2), set(lb, 85, 185, 5), rpe(7)], [setN(3), set(lb, 87.5, 195, 5), rpe(8)],
        [setN(4), set(lb, 90, 200, 5), rpe(8)], [setN(5), set(lb, 92.5, 205, 5), rpe(9, S('tag.topSet', 'top set'))],
      ] },
    },
  ];
}

// Sample programs, in the shape the public preview gives a real coach's (names, weeks, days and
// each move's equipment; 2026-10-29-program-preview-names.sql), so the page reads them through the
// same bsCoachPrograms. Their ids are fixed, so a sample station can pin one. The moves are the
// exercise library's (dashBuilderCore.js EXERCISES), with its equipment.
//
// The clips: sample videos generated for the samples (the owner chose generated clips,
// 2026-10-29, and asked for women in them, 2026-10-30), recorded in
// marketing/shape-radio-launch-cut.md's Sources table. They are on the owner's Higgsfield CDN, as
// the booth's wall loops are. A null slot shows the program's weeks in place of a video and lists
// no workout.
const CLIP_CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3E30hta4RMpS2cDML3JnB5dGPnY/';
export const BS_SAMPLE_CLIPS = Object.freeze({
  squat: CLIP_CDN + 'hf_20261030_113851_55d786bb-08b2-4e98-8f9d-6fded4403464.mp4',
  deadlift: CLIP_CDN + 'hf_20261030_115819_13866220-30f3-494e-a35b-bd8e71ff6102.mp4',
  row: CLIP_CDN + 'hf_20261030_113835_ef9cb577-f0d4-4e01-ad20-1d1ad9a72aad.mp4',
  swings: CLIP_CDN + 'hf_20261030_115818_55363eed-6d1d-499e-9726-6735b83e5bd7.mp4',
});
const DOW = { MON: 0, TUE: 1, WED: 2, THU: 3, FRI: 4, SAT: 5, SUN: 6 };
function samplePlan(id, name, price, weeks, days, clip, note) {
  const blocks = [], firstWeek = [];
  days.forEach(([wd, dayName, moves], day) => {
    firstWeek.push({ week: 0, day, weekday: DOW[wd], dayName, moves: moves.length });
    for (const [n, equipment, muscle] of moves) blocks.push({ week: 0, day, weekday: DOW[wd], dayName, name: n, equipment, muscle, text: n });
  });
  return { id, kind: 'program', name, price, meta: `${weeks} weeks`, detail: { preview: true, blocks, weeks, firstWeek, media: clip ? [{ url: clip, type: 'video', name }] : [], note } };
}
export const BS_SAMPLE_PROGRAM_IDS = Object.freeze({
  strong: '5a3e0000-0000-4000-8000-000000000001', basics: '5a3e0000-0000-4000-8000-000000000002',
  engine: '5a3e0000-0000-4000-8000-000000000003', bells: '5a3e0000-0000-4000-8000-000000000004',
});
function programsFor(family, S) {
  const I = BS_SAMPLE_PROGRAM_IDS;
  const plans = family === 'conditioning' ? [
    samplePlan(I.engine, S('program.engine.name', 'Engine 8'), 59, 8, [
      ['MON', S('day.intervals', 'Intervals'), [['Rower', 'Rower', 'Full body'], ['Kettlebell swing', 'Kettlebell', 'Posterior chain'], ['Box jump', 'Box', 'Quads'], ['Plank', 'Bodyweight', 'Core']]],
      ['WED', S('day.engineStrength', 'Strength for engines'), [['Goblet squat', 'Dumbbell', 'Quads'], ['Push-up', 'Bodyweight', 'Chest'], ['Dumbbell row', 'Dumbbell', 'Back'], ['Sled push', 'Sled', 'Full body']]],
      ['SAT', S('day.longOne', 'The long one'), [['Assault bike', 'Bike', 'Full body'], ['Farmer carry', 'Dumbbell', 'Grip'], ['Walking lunge', 'Dumbbell', 'Quads'], ['Bird dog', 'Bodyweight', 'Core']]],
    ], BS_SAMPLE_CLIPS.row, S('program.engine.note', 'Three days a week. The intervals get longer every two weeks, and the rest gets shorter.')),
    samplePlan(I.bells, S('program.bells.name', 'Bike and bells'), 29, 4, [
      ['TUE', S('day.bike', 'Bike'), [['Assault bike', 'Bike', 'Full body'], ['Kettlebell swing', 'Kettlebell', 'Posterior chain'], ['Hanging leg raise', 'Bodyweight', 'Core']]],
      ['THU', S('day.bells', 'Bells'), [['Rower', 'Rower', 'Full body'], ['Sled push', 'Sled', 'Full body'], ['Dead bug', 'Bodyweight', 'Core']]],
    ], BS_SAMPLE_CLIPS.swings, S('program.bells.note', 'Twenty-five minutes, twice a week, for the weeks with no time.')),
  ] : [
    samplePlan(I.strong, S('program.strong.name', 'Strong in 12'), 79, 12, [
      ['MON', S('day.squat', 'Squat'), [['Back squat', 'Barbell', 'Quads'], ['Romanian deadlift', 'Barbell', 'Hamstrings'], ['Walking lunge', 'Dumbbell', 'Quads'], ['Plank', 'Bodyweight', 'Core']]],
      ['WED', S('day.press', 'Press'), [['Bench press', 'Barbell', 'Chest'], ['Barbell row', 'Barbell', 'Back'], ['Dumbbell shoulder press', 'Dumbbell', 'Shoulders'], ['Face pull', 'Cable', 'Rear delts']]],
      ['FRI', S('day.pull', 'Pull'), [['Deadlift', 'Barbell', 'Posterior chain'], ['Pull-up', 'Bodyweight', 'Back'], ['Hip thrust', 'Barbell', 'Glutes'], ['Farmer carry', 'Dumbbell', 'Grip']]],
    ], BS_SAMPLE_CLIPS.squat, S('program.strong.note', 'Three lifting days a week. Every top set is filmed and gets a note back.')),
    samplePlan(I.basics, S('program.basics.name', 'Barbell basics'), 39, 6, [
      ['TUE', S('day.lower', 'Lower'), [['Goblet squat', 'Dumbbell', 'Quads'], ['Trap-bar deadlift', 'Trap bar', 'Posterior chain'], ['Leg press', 'Machine', 'Quads'], ['Dead bug', 'Bodyweight', 'Core']]],
      ['THU', S('day.upper', 'Upper'), [['Dumbbell bench press', 'Dumbbell', 'Chest'], ['Overhead press', 'Barbell', 'Shoulders'], ['Lat pulldown', 'Cable', 'Back'], ['Suitcase carry', 'Dumbbell', 'Core']]],
    ], BS_SAMPLE_CLIPS.deadlift, S('program.basics.note', 'For a first year under the bar: two days a week, every lift taught from the start.')),
  ];
  return bsCoachPrograms(plans).map((p) => ({ ...p, sample: true }));
}
// The workouts a sample coach posted on video: one per clip there is.
function workoutsFor(family, S) {
  const list = family === 'conditioning'
    ? [['demo-v-row', S('workout.row.title', 'Rower pacing'), S('workout.row.body', 'Long strokes, legs first. Hold the same split for every interval.'), '3d', BS_SAMPLE_CLIPS.row],
      ['demo-v-swing', S('workout.swings.title', 'Kettlebell swings'), S('workout.swings.body', 'Hips snap, arms just hold on. Stop the set when the bell drifts.'), '5d', BS_SAMPLE_CLIPS.swings]]
    : [['demo-v-squat', S('workout.squat.title', 'Back squat, what I look for'), S('workout.squat.body', 'Brace, sit between the hips, stand up the same way you went down.'), '3d', BS_SAMPLE_CLIPS.squat],
      ['demo-v-dead', S('workout.deadlift.title', 'Deadlift set-up'), S('workout.deadlift.body', 'Bar over mid-foot, slack out of the bar, then push the floor away.'), '5d', BS_SAMPLE_CLIPS.deadlift]];
  const typeLabel = family === 'conditioning' ? S('type.conditioning', 'Conditioning') : S('type.strength', 'Strength');
  return list.filter((w) => w[4]).map(([key, title, body, ago, url]) => ({ key, title, body, ago, typeLabel, video: { url, type: 'video', name: title }, breakdown: null }));
}

// A stable number from a coach's listing id or name, so the same coach always gets the same page.
const hash = (s) => { let h = 7; for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };

/**
 * What a sample coach's page is drawn from: its seed, the kind of space and the kind of replays
 * that fit its specialty (the listing's specialty, category and tags, as one string).
 */
export function bsTrainerSampleOf({ key = '', specialty = '' } = {}) {
  const seed = hash(key);
  const s = String(specialty || '');
  let kind = null;
  if (/pilates|barre|yoga|mobility|stretch|posture/i.test(s)) kind = 'pilates';
  else if (/box|kickbox|mma|martial|combat/i.test(s)) kind = 'boxing';
  else if (/outdoor|park|trail|boot ?camp|running|run club/i.test(s)) kind = 'outdoor';
  else if (/hiit|condition|interval|metcon|circuit|garage/i.test(s)) kind = 'garage';
  else if (/power|olympic|weightlift|strength|hypertroph|bodybuild|muscle/i.test(s)) kind = 'gym';
  else kind = ['private', 'gym', 'garage'][seed % 3];
  const family = (kind === 'gym' || kind === 'private') || (kind === 'garage' && !/hiit|condition|interval|metcon|circuit/i.test(s)) ? 'strength' : 'conditioning';
  return { seed, kind, family };
}

/**
 * A sample coach's page, built for now in this device's time zone.
 *   media     the demo photos' folder (`${import.meta.env.BASE_URL}demo/`)
 *   word      the studio's words in the reader's language (studioKit's `word`)
 *   lb        true when the reader reads weight in pounds
 *   seed, kind, family   from bsTrainerSampleOf; the defaults are the trainer app's demo coach
 *   where     the place the studio is in
 *   business  the business name on the page (the demo coach's own; none for a listing's coach)
 *   say       the sample's words in the reader's language: (key, english, values) => text, the
 *             profile's tr; by default the English (bsSampleEnglish)
 */
export function bsTrainerDemo({ media = '/demo/', now = Date.now(), zone = null, word = (k) => STUDIO_WORDS[k] || k, lb = true,
  seed = 0, kind = 'gym', family = 'strength', where = 'Portland, OR', business = 'Iron & Ordinary', say = bsSampleEnglish } = {}) {
  const S = (k, english, values) => say('profile:sample.' + k, english, values);
  const photo = (f) => media + f;
  const tz = zone || (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return null; } })() || 'UTC';

  // The template once with its keys for words, to put each station's note on it by key.
  const keyed = bsStudioFromTemplate(kind, (k) => k);
  const studio = {
    kind,
    where: where || '',
    items: bsStudioFromTemplate(kind, word).map((p, i) => (p.st ? { ...p, st: { ...p.st, note: NOTES[keyed[i].st.title] ? S('note.' + keyed[i].st.title, NOTES[keyed[i].st.title]) : '', ...(PINS[keyed[i].st.title] ? { pins: [PINS[keyed[i].st.title](family)] } : {}) } } : p)),
  };
  // The wall photo is the seed's, and the listing photos the next three after it.
  const n = BS_TRAINER_DEMO_PHOTOS.length;
  const pick = (i) => photo(BS_TRAINER_DEMO_PHOTOS[(seed + i) % n]);

  // This week's busy time, at local wall-clock hours (the device's zone is the hours' zone).
  const busy = [];
  const today = new Date(now);
  for (let i = 0; i < 8; i += 1) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const plan = DAYS[d.getDay()];
    if (!plan) continue;
    const at = (h, m = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).toISOString();
    for (const [h, min] of plan.sessions) busy.push({ start: at(h), end: at(h, min), kind: 'session' });
    if (plan.away) busy.push({ start: at(plan.away[0]), end: at(plan.away[1]), kind: 'time_off' });
  }

  return {
    photos: BS_TRAINER_DEMO_PHOTOS.map(photo),
    live: {
      pronouns: '',
      points: 3060,
      goal: S('goal', 'Get strong, move well, recover enough to do it again. That is the whole game.'),
      can_view: true,
      is_public: true,
    },
    custom: {
      look: { paper: 'dark', accent: 'teal', focus: 'center' },
      cover: { image: pick(0) },
      studio,
      ...(business ? { bizCard: { name: business, where: where || '' } } : {}),
    },
    provider: {
      id: 'demo',
      owner_id: null,
      price: 180,
      session_price: 90,
      specialty: S('specialty', 'Strength and conditioning'),
      verified: true,
      credential: 'NSCA-CSCS',
      at_capacity: false,
      listing_media: { cover: pick(0), gallery: [{ url: pick(1) }, { url: pick(2) }, { url: pick(3) }] },
      monthly_offer: { includes: [S('offer.program', 'A program written for your week'), S('offer.notes', 'Notes on every logged session'), S('offer.messages', 'Messages answered within a day')] },
    },
    availability: { slots: SLOTS, busy, booked: busy.filter((b) => b.kind === 'session').map((b) => b.start), rules: { consultMin: 15 }, timezone: tz, atCapacity: false },
    reviews: {
      avg: 9.9,
      count: 284,
      list: [
        { id: 'demo-r1', author: 'Priya S.', rating: 10, text: S('review.r1', '+60 lb on my deadlift in 14 weeks without a single bad-back day.') },
        { id: 'demo-r2', author: 'Marcus L.', rating: 10, text: S('review.r2', "World-class programming. Books up fast, so plan ahead. It's worth it.") },
        { id: 'demo-r3', author: 'Dana K.', rating: 10, text: S('review.r3', 'Every session has a note waiting after. I finally know why the program is the program.') },
        { id: 'demo-r4', author: 'Jonah W.', rating: 9, text: S('review.r4', 'Never touched a barbell before. Eight months later I pulled twice my bodyweight.') },
      ],
    },
    replays: replaysFor(family, lb, photo, S),
    programs: programsFor(family, S),
    workouts: workoutsFor(family, S),
  };
}
