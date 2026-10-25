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

export function calendarActivities({ rows, zone, from, to, done = [] }: {
  rows: ActivityRow[]; zone: string; from: string; to: string; done?: DoneWorkout[];
}): { events: ActivityEvent[]; workoutDistance: Map<string, number> } {
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
  const workoutDistance = new Map<string, number>();
  const folded = new Set<string>();
  for (const g of groups) {
    const local = wallClockInZone(g.t, zone);
    if (!local || local.date < from || local.date > to) continue;
    const logged = done.find((w) => !folded.has(w.id) && Math.abs(w.at - g.t) <= ACTIVITY_TWIN_MS);
    if (logged) {
      folded.add(logged.id);
      if (g.km != null) workoutDistance.set(logged.id, Math.round(g.km * 100) / 100);
      continue;
    }
    const keys = [...g.sources].sort();
    events.push({
      id: `act:${g.row.id}`,
      source: 'activity',
      kind: 'WORKOUT',
      title: g.title || activityTypeLabel(g.row.activity_type),
      sub: [...new Set(keys.map((k) => ACTIVITY_SOURCE_NAMES[k]).filter(Boolean))].join(' · '),
      date: local.date,
      time: local.time,
      durationMin: g.min == null ? null : Math.round(g.min),
      distanceKm: g.km == null ? null : Math.round(g.km * 100) / 100,
      calories: g.kcal == null ? null : Math.round(g.kcal),
      activityType: String(g.row.activity_type || 'workout').toLowerCase(),
      sources: keys,
      with: '', location: '', accent: '', status: 'completed', createdByRole: 'client', editable: false,
    });
  }
  return { events, workoutDistance };
}
