// The member's synced and hand-logged activities on their calendar (owner, 2026-10-25: "yes" to
// Strava, Garmin and Apple Health runs, with distance, on the calendar). /api/calendar reads the
// rows; this places them. Pure, so the tests drive it.
//
// ⚠ ONE WORKOUT, TWO PROVIDERS, SHOWN ONCE. A watch and Strava on the same run each keep their
// row, so activities from different sources that start within 20 minutes of each other are one
// workout at the larger reading: Train's Burned this week rule (services/weekBurn.mjs,
// BS_BURN_TWIN_MS; tests/calendar-activities pins the two together). Two from one source are two.
//
// ⚠ A WORKOUT LOGGED IN SHAPE IS NOT SHOWN AGAIN. A synced activity that starts within the same
// 20 minutes as a session logged against an assigned workout is that workout: its distance goes
// onto the workout's card and no second card is drawn.
//
// ⚠ A SYNCED RUN FINISHES THE PLANNED RUN ON ITS DAY (owner, 2026-10-25: "match synced runs to
// the planned workout by day and type"). An activity on the same date as an unfinished assigned
// workout of the same kind ticks it, with the activity's distance and time, and isn't drawn again.
// An undated workout has no day of its own (the calendar slots it onto this week), so it takes an
// activity from any day of this week; a dated one is matched first.
// The kind is read from the provider's type and the workout's title, and only when each names
// exactly one (workoutKind): "Hill Repeats" names none and "Strength for runners" names two, so
// neither is guessed at. Two planned runs on one day take the day's runs in order.
//
// Each lands on the date and clock of the zone the route answers in, as the bookings do.
import { wallClockInZone } from '@/lib/time';

export const ACTIVITY_TWIN_MS = 20 * 60 * 1000;

// The provider names, as Train's Burned this week names them (BS_BURN_SOURCES). Brand names stay
// as they are in every language; a workout logged by hand has none.
export const ACTIVITY_SOURCE_NAMES: Record<string, string> = {
  apple_health: 'Apple Health', apple: 'Apple Health', garmin: 'Garmin', oura: 'Oura', strava: 'Strava', whoop: 'WHOOP',
};

export type ActivityRow = {
  id: string;
  source: string | null;
  activity_type: string | null;
  title: string | null;
  started_at: string | null;
  duration_min: number | null;
  distance_km: number | string | null;
  calories: number | null;
};

// A finished assigned workout: its id on the calendar and when its logged session started.
export type DoneWorkout = { id: string; at: number };

// An assigned workout not yet finished: its id, the days it can be done on (its date, or this
// week's for an undated one) and its kind (workoutKind of its title).
export type PlannedWorkout = { id: string; days: string[]; kind: WorkoutKind | null };

// What an activity gave an assigned workout: the distance of a logged one's synced copy, or, for
// one it finished (matched), the time too and the providers it came from ('' by hand).
export type WorkoutFill = { distanceKm: number | null; durationMin: number | null; by: string; matched: boolean };

// The kinds an activity and a planned workout are matched on, each by the words that name it in a
// provider's type (Strava "trailrun", Apple Health "traditionalstrengthtraining", Garmin
// "ROAD_BIKING") or a workout's title ("3.25mi Easy Run", "Upper Body Strength").
export type WorkoutKind = 'run' | 'ride' | 'swim' | 'walk' | 'row' | 'yoga' | 'strength';
const KIND_WORDS: Array<[WorkoutKind, RegExp]> = [
  // "run" at a word's start, or after trail / virtual / treadmill: never "crunch" or "brunch".
  ['run', /(^|[^a-z]|trail|virtual|treadmill)run|jog/],
  // "ride" ending a word: never "strides".
  ['ride', /cycl|bik(e|ing)|(^|[^a-z]|virtual|gravel)ride($|[^a-z])|(^|[^a-z])spin($|[^a-z])|peloton/],
  ['swim', /swim/],
  ['walk', /walk|hik(e|ing)/],
  // "row" as its own word: never "rows", the strength move.
  ['row', /rowing|(^|[^a-z])row(er)?($|[^a-z])|(^|[^a-z])erg($|[^a-z])/],
  ['yoga', /yoga|pilates|mobility|stretch/],
  ['strength', /strength|weight|lifting|crossfit|hypertroph|squat|deadlift|bench|upper body|lower body|full body/],
];

/** The one kind `text` names, or null for none or more than one. */
export function workoutKind(text: string | null | undefined): WorkoutKind | null {
  const s = String(text ?? '').toLowerCase().replace(/[_-]+/g, ' ');
  const hits = KIND_WORDS.filter(([, re]) => re.test(s)).map(([k]) => k);
  return hits.length === 1 ? hits[0] : null;
}

export type ActivityEvent = {
  id: string; source: 'activity'; kind: 'WORKOUT'; title: string; sub: string;
  date: string; time: string; durationMin: number | null; distanceKm: number | null; calories: number | null;
  activityType: string; sources: string[];
  with: ''; location: ''; accent: ''; status: 'completed'; createdByRole: 'client'; editable: false;
};

const positive = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const max = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : Math.max(a, b));
const squash = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// "trail_run" → "Trail run", "RUNNING" → "Running".
export function activityTypeLabel(type: string | null | undefined): string {
  const s = String(type || 'workout').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase() || 'workout';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// A title the member or the provider gave it ("Morning Run"); a title that only repeats the type
// (Garmin and Apple Health write the type there) is no title.
function namedTitle(row: ActivityRow): string | null {
  const t = String(row.title ?? '').trim();
  return t && squash(t) !== squash(row.activity_type) ? t : null;
}

export function calendarActivities({ rows, zone, from, to, done = [], planned = [] }: {
  rows: ActivityRow[]; zone: string; from: string; to: string; done?: DoneWorkout[]; planned?: PlannedWorkout[];
}): { events: ActivityEvent[]; workouts: Map<string, WorkoutFill> } {
  type Group = { t: number; row: ActivityRow; title: string | null; km: number | null; min: number | null; kcal: number | null; sources: Set<string> };
  const groups: Group[] = [];
  const timed = (Array.isArray(rows) ? rows : [])
    .map((row) => ({ row, t: Date.parse(String(row?.started_at ?? '')) }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t);
  for (const { row, t } of timed) {
    const src = String(row.source || 'manual');
    const twin = groups.find((g) => !g.sources.has(src) && Math.abs(g.t - t) <= ACTIVITY_TWIN_MS);
    if (twin) {
      twin.km = max(twin.km, positive(row.distance_km));
      twin.min = max(twin.min, positive(row.duration_min));
      twin.kcal = max(twin.kcal, positive(row.calories));
      twin.title = twin.title || namedTitle(row);
      twin.sources.add(src);
      continue;
    }
    groups.push({ t, row, title: namedTitle(row), km: positive(row.distance_km), min: positive(row.duration_min), kcal: positive(row.calories), sources: new Set([src]) });
  }

  const events: ActivityEvent[] = [];
  const workouts = new Map<string, WorkoutFill>();
  const folded = new Set<string>();
  for (const g of groups) {
    const local = wallClockInZone(g.t, zone);
    if (!local || local.date < from || local.date > to) continue;
    const keys = [...g.sources].sort();
    const by = [...new Set(keys.map((k) => ACTIVITY_SOURCE_NAMES[k]).filter(Boolean))].join(' · ');
    const km = g.km == null ? null : Math.round(g.km * 100) / 100;
    const logged = done.find((w) => !folded.has(w.id) && Math.abs(w.at - g.t) <= ACTIVITY_TWIN_MS);
    if (logged) {
      folded.add(logged.id);
      if (km != null) workouts.set(logged.id, { distanceKm: km, durationMin: null, by, matched: false });
      continue;
    }
    const kind = workoutKind(g.row.activity_type) ?? workoutKind(g.title);
    const plan = kind && planned.find((w) => !folded.has(w.id) && w.kind === kind && w.days.includes(local.date));
    if (plan) {
      folded.add(plan.id);
      workouts.set(plan.id, { distanceKm: km, durationMin: g.min == null ? null : Math.round(g.min), by, matched: true });
      continue;
    }
    events.push({
      id: `act:${g.row.id}`,
      source: 'activity',
      kind: 'WORKOUT',
      title: g.title || activityTypeLabel(g.row.activity_type),
      sub: by,
      date: local.date,
      time: local.time,
      durationMin: g.min == null ? null : Math.round(g.min),
      distanceKm: km,
      calories: g.kcal == null ? null : Math.round(g.kcal),
      activityType: String(g.row.activity_type || 'workout').toLowerCase(),
      sources: keys,
      with: '', location: '', accent: '', status: 'completed', createdByRole: 'client', editable: false,
    });
  }
  return { events, workouts };
}
