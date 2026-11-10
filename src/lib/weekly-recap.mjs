// The weekly recap (owner, 2026-11-10: "Keep a shareable weekly recap free, and charge for the AI
// readout"): a member's own week in figures, for a card they can share. Pure, so `node --test`
// drives it (tests/weekly-recap.test.mjs); /api/client/weekly-recap reads the rows.
//
//   recapWeek({ now, zone, which })        the member's Monday-to-Sunday week, in their zone:
//                                          { weekStart, weekEnd, startMs, endMs }
//   buildRecap({ sessions, ledger, week, zone, now })
//                                          { workouts, activeMinutes, mealDays, daysActive, points,
//                                            streak }
//
// ⚠ HONEST FIGURES ONLY. A meal log adds to the day and scores once a day (add_meal_macros,
// 2026-07-06-meal-log-points.sql), so the recap counts the DAYS meals were logged, never a number of
// meals it does not have; active minutes are null when no session carried both its start and end.

const DAY = 86_400_000;

// Zone arithmetic with Intl alone, so this module imports nothing (the route and node --test both
// load it as it is). A zone Intl does not know falls back to UTC.
const fmt = new Map();
function partsAt(t, zone) {
  try {
    if (!fmt.has(zone)) fmt.set(zone, new Intl.DateTimeFormat('en-CA', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    const o = {};
    for (const p of fmt.get(zone).formatToParts(new Date(t))) o[p.type] = p.value;
    return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second };
  } catch {
    return null;
  }
}
function wallClockInZone(t, zone) {
  const p = partsAt(t, zone);
  return p ? { date: `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}` } : null;
}
const offsetAt = (t, zone) => { const p = partsAt(t, zone); return p ? Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - t : NaN; };
/** The instant `zone` reads as y-mo-d h:mi (two passes, so a DST change near it is priced right). */
function instantInZone(y, mo, d, h, mi, zone) {
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  const o1 = offsetAt(naive, zone);
  if (!Number.isFinite(o1)) return NaN;
  let t = naive - o1;
  const o2 = offsetAt(t, zone);
  if (Number.isFinite(o2) && o2 !== o1) t = naive - o2;
  return t;
}
const DONE = new Set(['completed', 'reviewed']);
/** A session longer than this is a timer left running: its minutes are not counted. */
const MAX_SESSION_MIN = 600;

const dayOf = (t, zone) => (zone ? wallClockInZone(t, zone)?.date : null) ?? new Date(t).toISOString().slice(0, 10);
const addDays = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mondayOf = (day) => { const d = new Date(`${day}T12:00:00Z`); return addDays(day, -((d.getUTCDay() + 6) % 7)); };
const startOfDay = (day, zone) => {
  const [y, mo, d] = day.split('-').map(Number);
  if (zone) { const t = instantInZone(y, mo, d, 0, 0, zone); if (Number.isFinite(t)) return t; }
  return Date.UTC(y, mo - 1, d);
};

/** The member's week: `which` is 'current' (this Monday on) or 'last' (the one before). */
export function recapWeek({ now, zone = null, which = 'last' }) {
  const thisMonday = mondayOf(dayOf(now, zone));
  const weekStart = which === 'current' ? thisMonday : addDays(thisMonday, -7);
  const weekEnd = addDays(weekStart, 6);
  return { weekStart, weekEnd, startMs: startOfDay(weekStart, zone), endMs: startOfDay(addDays(weekStart, 7), zone) };
}

const sessionAt = (s) => Date.parse(s.started_at || s.ended_at || s.created_at || '');

export function buildRecap({ sessions = [], ledger = [], week, zone = null, now }) {
  const done = (Array.isArray(sessions) ? sessions : []).filter((s) => s && DONE.has(String(s.status || 'completed')) && Number.isFinite(sessionAt(s)));
  const inWeek = done.filter((s) => { const t = sessionAt(s); return t >= week.startMs && t < week.endMs; });
  let minutes = 0, timed = 0;
  for (const s of inWeek) {
    const a = Date.parse(s.started_at || ''), b = Date.parse(s.ended_at || '');
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) continue;
    const m = Math.round((b - a) / 60000);
    if (m > MAX_SESSION_MIN) continue;
    minutes += m; timed += 1;
  }
  const rows = (Array.isArray(ledger) ? ledger : []).filter((r) => {
    const t = Date.parse(r?.earned_at || '');
    return Number.isFinite(t) && t >= week.startMs && t < week.endMs;
  });
  const points = rows
    .filter((r) => !['store_redeem', 'tier_bonus'].includes(String(r.source_kind || '')))
    .reduce((sum, r) => sum + (Number(r.delta) || 0), 0);
  const mealDays = new Set(rows.filter((r) => r.source_kind === 'meal_log' && Number(r.delta) > 0).map((r) => dayOf(Date.parse(r.earned_at), zone)));
  const activeDays = new Set([...inWeek.map((s) => dayOf(sessionAt(s), zone)), ...mealDays]);
  // The streak: days in a row with a completed workout, counted back from today, or from yesterday
  // when today has none yet (the dashboard's and the leaderboard's own rule).
  const workoutDays = new Set(done.map((s) => dayOf(sessionAt(s), zone)));
  const today = dayOf(now, zone);
  let cursor = workoutDays.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (workoutDays.has(cursor) && streak < 400) { streak += 1; cursor = addDays(cursor, -1); }
  return {
    workouts: inWeek.length,
    activeMinutes: timed ? minutes : null,
    mealDays: mealDays.size,
    daysActive: activeDays.size,
    points: Math.max(0, points),
    streak,
  };
}

/** How far back the sessions are read: enough for the streak a recap names. */
export const RECAP_HISTORY_DAYS = 120;
export const DAY_MS = DAY;
