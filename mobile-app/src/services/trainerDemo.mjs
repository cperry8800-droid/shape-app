// ─── THE SIGNED-OUT TRAINER'S PAGE ───────────────────────────────────────────────────────────
// Owner, 2026-10-28 ("Still seeing old profile"): signed out, the trainer app's Me tab is the new
// trainer profile with sample content: a wall photo, a full gym drawn as the studio, a week of
// open and busy times, replays and reviews. BSTrainerProfile feeds this through the same code a
// real coach's page runs (the availability goes through bsProjectAvailability, the replays are
// replay cards), and reads nothing from Shape and writes nothing to it.
//
// The sample words (the bio, the station notes, the replays, the reviews) are content, as a
// coach's own words are, so they stay in English like the rest of the demo's; the studio's
// station names are the template's, in the reader's language (`word`). Loads come in the
// reader's units (`lb`), as plate-friendly numbers in each.
//
// No pronouns: the demo coach's words go by their first name.

import { bsStudioFromTemplate, STUDIO_WORDS } from './studioKit.mjs';

// The demo photos (mobile-app/public/demo), and the only wall photos the demo page shows or
// Make it yours offers there.
export const BS_TRAINER_DEMO_PHOTOS = ['box-cover.webp', 'studio-01.webp', 'plan-01.webp', 'wall-02.webp', 'studio-03.webp', 'studio-02.webp'];

const NOTES = {
  squatRacks: 'Most sessions start here: a squat or a press, worked up to one heavy set.',
  platform: 'Deadlifts and cleans. We film the top set and go through it together after.',
  freeWeights: 'Dumbbells and kettlebells for the accessory work, paired up so the hour keeps moving.',
  machines: "For what a barbell can't load well: hamstrings, upper back, a pump to finish.",
  cardio: 'Ten easy minutes to warm up. Conditioning days finish on the air bike.',
  turf: 'Sled pushes and carries. The last ten minutes, most days.',
  cable: 'Rows, presses and the small work that keeps shoulders healthy.',
  frontDesk: "Check in here. We read last week's notes before we start.",
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

/**
 * The demo coach's page, built for now in this device's time zone.
 *   media  the demo photos' folder (`${import.meta.env.BASE_URL}demo/`)
 *   word   the studio's words in the reader's language (studioKit's `word`)
 *   lb     true when the reader reads weight in pounds
 */
export function bsTrainerDemo({ media = '/demo/', now = Date.now(), zone = null, word = (k) => STUDIO_WORDS[k] || k, lb = true } = {}) {
  const photo = (f) => media + f;
  const tz = zone || (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return null; } })() || 'UTC';

  // The template once with its keys for words, to put each station's note on it by key.
  const keyed = bsStudioFromTemplate('gym', (k) => k);
  const studio = {
    kind: 'gym',
    where: 'Portland, OR',
    items: bsStudioFromTemplate('gym', word).map((p, i) => (p.st ? { ...p, st: { ...p.st, note: NOTES[keyed[i].st.title] || '' } } : p)),
  };

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
      goal: 'Get strong, move well, recover enough to do it again. That is the whole game.',
      can_view: true,
      is_public: true,
    },
    custom: {
      look: { paper: 'dark', accent: 'teal', focus: 'center' },
      cover: { image: photo('box-cover.webp') },
      studio,
      bizCard: { name: 'Iron & Ordinary', where: 'Portland, OR' },
    },
    provider: {
      id: 'demo',
      owner_id: null,
      price: 180,
      session_price: 90,
      specialty: 'Strength and conditioning',
      verified: true,
      credential: 'NSCA-CSCS',
      at_capacity: false,
      listing_media: { cover: photo('box-cover.webp'), gallery: [{ url: photo('studio-01.webp') }, { url: photo('plan-01.webp') }, { url: photo('wall-02.webp') }] },
      monthly_offer: { includes: ['A program written for your week', 'Notes on every logged session', 'Messages answered within a day'] },
    },
    availability: { slots: SLOTS, busy, booked: busy.filter((b) => b.kind === 'session').map((b) => b.start), rules: { consultMin: 15 }, timezone: tz, atCapacity: false },
    reviews: {
      avg: 9.9,
      count: 284,
      list: [
        { id: 'demo-r1', author: 'Priya S.', rating: 10, text: '+60 lb on my deadlift in 14 weeks without a single bad-back day.' },
        { id: 'demo-r2', author: 'Marcus L.', rating: 10, text: "World-class programming. Books up fast, so plan ahead. It's worth it." },
        { id: 'demo-r3', author: 'Dana K.', rating: 10, text: 'Every session has a note waiting after. I finally know why the program is the program.' },
        { id: 'demo-r4', author: 'Jonah W.', rating: 9, text: 'Never touched a barbell before. Eight months later I pulled twice my bodyweight.' },
      ],
    },
    replays: [
      {
        key: 'demo-squat', typeLabel: 'Strength', title: 'Back squat, heavy triples', ago: '2d', photo: photo('studio-03.webp'),
        body: 'Paused the first rep of every set. Bar speed held to the last triple, so it goes up next week.',
        statsRow: [['Top set', set(lb, 130, 285, 3)], ['Time', '48:20']],
        breakdown: { label: 'Working sets', rows: [
          ['Set 1', set(lb, 100, 225, 3), 'RPE 6'], ['Set 2', set(lb, 110, 245, 3), 'RPE 7'], ['Set 3', set(lb, 120, 265, 3), 'RPE 8'],
          ['Set 4', set(lb, 125, 275, 3), 'RPE 8'], ['Set 5', set(lb, 130, 285, 3), 'RPE 9 · top set'],
        ] },
      },
      {
        key: 'demo-pull', typeLabel: 'Strength', title: 'Deadlift and rows', ago: '4d', photo: photo('studio-02.webp'),
        body: 'Pulled from a dead stop every rep, no bounce. Rows strict, chest on the bench.',
        statsRow: [['Top set', set(lb, 180, 405, 2)], ['Time', '55:05']],
        breakdown: { label: 'Working sets', rows: [
          ['Deadlift · Set 1', set(lb, 150, 335, 3), 'RPE 6'], ['Deadlift · Set 2', set(lb, 165, 365, 3), 'RPE 7'], ['Deadlift · Set 3', set(lb, 180, 405, 2), 'RPE 9 · top set'],
          ['Row · Set 1', set(lb, 30, 65, 10), 'RPE 7'], ['Row · Set 2', set(lb, 30, 65, 10), 'RPE 8'],
        ] },
      },
      {
        key: 'demo-press', typeLabel: 'Strength', title: 'Bench press, fives', ago: '6d', photo: null,
        body: 'Feet set, shoulder blades pinned, a one-second pause on the chest. Five clean sets.',
        statsRow: [['Top set', set(lb, 92.5, 205, 5)], ['Time', '41:30']],
        breakdown: { label: 'Working sets', rows: [
          ['Set 1', set(lb, 80, 175, 5), 'RPE 6'], ['Set 2', set(lb, 85, 185, 5), 'RPE 7'], ['Set 3', set(lb, 87.5, 195, 5), 'RPE 8'],
          ['Set 4', set(lb, 90, 200, 5), 'RPE 8'], ['Set 5', set(lb, 92.5, 205, 5), 'RPE 9 · top set'],
        ] },
      },
    ],
  };
}
