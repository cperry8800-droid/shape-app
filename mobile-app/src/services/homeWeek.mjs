// services/homeWeek.mjs
//
// HOME, PART 2 (owner, 2026-10-22, off the Home mockup: "looks good but keep the week calendar at
// the top, and the SHAPE logo"). Home stopped repeating Train and Eat and says what only Home can:
// the week so far, the member's goal and their coaches. These are the reads behind those sections,
// pure so the tests drive them directly; BSHomeSections.jsx draws them.
//
// Days are local calendar days, 'YYYY-MM-DD', the same keys the progress series carry.

import { bsSlotWeek } from './trainingBuilder.mjs';

export function bsHwIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function bsHwShift(iso, days) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return bsHwIso(new Date(y, m - 1, d + days));
}

function bsHwDayNum(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

// Whole days from one day to another (negative when `to` is earlier).
export function bsHwDaysBetween(fromIso, toIso) {
  return bsHwDayNum(toIso) - bsHwDayNum(fromIso);
}

// Monday through today: the week so far, as Home's week strip has it.
export function bsHwWeekDays(todayIso) {
  const [y, m, d] = String(todayIso).split('-').map(Number);
  const today = new Date(y, m - 1, d);
  if (Number.isNaN(today.getTime())) return [];
  const back = (today.getDay() + 6) % 7;
  const out = [];
  for (let i = back; i >= 0; i -= 1) out.push(bsHwShift(todayIso, -i));
  return out;
}

// A series as day → value, keeping only real readings (a day of 0 is a day with nothing logged).
function bsHwByDay(series) {
  const out = new Map();
  for (const s of Array.isArray(series) ? series : []) {
    const day = s && typeof s.date === 'string' ? s.date.slice(0, 10) : '';
    const v = Number(s && s.value);
    if (day && Number.isFinite(v) && v > 0) out.set(day, v);
  }
  return out;
}

// THE WEEK SO FAR. Each figure counts this week's days only, Monday through today:
//   · sessions: days trained (ShapeCommit's count) against the sessions the plan has this week;
//   · daysLogged: days with food logged, against the days so far;
//   · protein and steps: the daily average over the days that have a reading;
//   · mornings: mornings checked in, by the check-in card's own rule (`answered`), when given.
// A figure nothing could read is null, so the row says "—" rather than a zero it does not know.
export function bsHomeWeekSoFar({ todayIso, series = null, workoutsDone = null, workoutsPlanned = null, proteinTarget = null, stepGoal = null, answered = null } = {}) {
  const days = bsHwWeekDays(todayIso);
  const read = !!series;
  const cal = bsHwByDay(series && series.calories);
  const pro = bsHwByDay(series && series.protein);
  const st = bsHwByDay(series && series.steps);
  const avg = (m) => {
    const vals = days.map((d) => m.get(d)).filter((v) => v != null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  return {
    days: days.length,
    sessions: {
      done: typeof workoutsDone === 'number' && Number.isFinite(workoutsDone) ? workoutsDone : null,
      planned: typeof workoutsPlanned === 'number' && workoutsPlanned > 0 ? workoutsPlanned : null,
    },
    daysLogged: read ? days.filter((d) => cal.has(d)).length : null,
    protein: { avg: read ? avg(pro) : null, target: num(proteinTarget) },
    steps: { avg: read ? avg(st) : null, goal: num(stepGoal) },
    mornings: read && typeof answered === 'function' ? days.filter((d) => answered(d)).length : null,
  };
}

// The sessions this week's plan holds, laid on the week exactly as Train lays them (bsSlotWeek: a
// row dated in another week is left off, a weekly repeat counts each of its days). null = no
// training plan read (Codex P2 on #2424: Home's own seven-slot week moved next week's rows in).
export function bsHomeSessionsPlanned(plan, now = new Date()) {
  const training = plan && plan.training;
  if (!training || !training.hasPlan) return null;
  const monday = new Date(now); monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return bsSlotWeek(training.workouts || [], monday).filter(Boolean).length;
}

// Days trained this week off ShapeCommit.progress, or null when the read did not succeed: its
// fallback is { workouts: 0 }, and a failed read must say "—", not "0" (Codex P2 on #2424).
export function bsHwTrainedOf(p) {
  return p && p.ok === true && typeof p.workouts === 'number' && Number.isFinite(p.workouts) ? p.workouts : null;
}

// The member's local week as instants, for a timestamp column ([from, to): local Monday midnight to
// the next Monday's), and the local day a timestamp falls on. A logged activity is a timestamp, so
// bounding it by UTC days put a Tokyo Monday-morning activity in last week (Codex P2 on #2424).
export function bsHwWeekWindow(weekOf) {
  const [y, m, d] = String(weekOf || '').split('-').map(Number);
  const from = new Date(y, (m || 1) - 1, d || 1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(weekOf || '')) || Number.isNaN(from.getTime())) return null;
  return { from: from.toISOString(), to: new Date(y, m - 1, d + 7).toISOString() };
}
export function bsHwLocalDayOf(ts) {
  const dt = new Date(ts);
  return Number.isNaN(dt.getTime()) ? null : bsHwIso(dt);
}

// The goal's weigh-ins: the weigh-in table's when it has any, else the series an older goal
// document keeps in `overall.weighIns` (kilograms, as the Goals page reads it; Codex P2 on #2424).
export function bsHwGoalWeighIns(listed, overall) {
  if (Array.isArray(listed) && listed.length) return listed;
  return overall && Array.isArray(overall.weighIns) ? overall.weighIns : [];
}

// The goal section's data off its reads, or null to leave the section unresolved. getUserGoals
// answers null when a read failed and {} when nothing is stored, and the goal document is the only
// source of the title, start and target: a failed read must not say "Set a goal" to a member who
// has one (Codex P2 on #2424). The identity mirror is a fallback for the goal's words only.
export function bsHwGoalData(doc, ident, weigh) {
  if (doc == null || typeof doc !== 'object') return null;
  const overall = doc.overall && typeof doc.overall === 'object' ? doc.overall : {};
  return {
    primary: doc.primaryGoal || (ident && ident.goal) || '',
    overall,
    weighIns: bsHwGoalWeighIns(weigh, overall),
  };
}

// A progress read's series, or null when the read did not answer: ShapeProgress.progress resolves
// null on a failed request, and the route says snapshotsRead: false when its daily history read
// failed (its series are then empty, not nothing logged). Either must say "—", not "0" (Codex P2s
// on #2424).
export function bsHwSeriesOf(p) {
  if (!p || p.snapshotsRead === false) return null;
  return p.series && typeof p.series === 'object' ? p.series : null;
}

// The share a figure is of its target, 0-100, or undefined when there is no target.
export function bsHwPct(value, target) {
  return value != null && target ? Math.max(0, Math.min(100, Math.round((value / target) * 100))) : undefined;
}

// THE GOAL'S WEIGHT READ, all in kilograms. `weighIns` is the member's series ({ d, kg }, oldest
// first); `startKg` and `targetKg` are the goal's own figures, already in kilograms, or null.
//   · nowKg: the latest weigh-in; sinceIso: the first; changeKg: now less the start (the goal's
//     start when set, else the first weigh-in);
//   · pct: how far from the start to the target, 0-100; toGoKg: what is left; reached: true once
//     the latest weigh-in is at or past the target in the goal's direction;
//   · paceKgWk: the trend over the last 28 days (a least-squares line), only with two weigh-ins at
//     least 7 days apart in them;
//   · etaIso: when the target falls at that pace, only when the pace runs toward it, is at least
//     0.05 kg a week and lands within two years;
//   · trend: the weigh-ins of the last 56 days, or the last 8, for the line.
export function bsHomeGoalRead({ weighIns = [], startKg = null, targetKg = null, todayIso } = {}) {
  const pts = (Array.isArray(weighIns) ? weighIns : [])
    .map((w) => ({ d: String((w && w.d) || '').slice(0, 10), kg: Number(w && w.kg) }))
    .filter((w) => w.d && Number.isFinite(w.kg) && w.kg > 0)
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  const fin = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
  const target = fin(targetKg);
  if (!pts.length) return { nowKg: null, targetKg: target };
  const now = pts[pts.length - 1].kg;
  const start = fin(startKg) ?? pts[0].kg;
  const losing = target != null ? target < start : null;
  const reached = target != null && (losing ? now <= target : now >= target);
  const pct = target != null && start !== target ? Math.max(0, Math.min(100, Math.round(((start - now) / (start - target)) * 100))) : null;
  const todayN = bsHwDayNum(todayIso);
  const recent = pts.filter((p) => todayN - bsHwDayNum(p.d) <= 28 && bsHwDayNum(p.d) <= todayN);
  let paceKgWk = null;
  if (recent.length >= 2 && bsHwDayNum(recent[recent.length - 1].d) - bsHwDayNum(recent[0].d) >= 7) {
    const xs = recent.map((p) => bsHwDayNum(p.d));
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = recent.reduce((a, p) => a + p.kg, 0) / recent.length;
    let num = 0, den = 0;
    recent.forEach((p, i) => { num += (xs[i] - mx) * (p.kg - my); den += (xs[i] - mx) ** 2; });
    paceKgWk = den ? Math.round((num / den) * 7 * 100) / 100 : null;
  }
  let etaIso = null;
  if (target != null && !reached && paceKgWk != null && Math.abs(paceKgWk) >= 0.05 && Math.sign(target - now) === Math.sign(paceKgWk)) {
    const days = Math.round((Math.abs(target - now) / Math.abs(paceKgWk)) * 7);
    if (days <= 730) etaIso = bsHwShift(todayIso, days);
  }
  const lastN = bsHwDayNum(pts[pts.length - 1].d);
  let trend = pts.filter((p) => lastN - bsHwDayNum(p.d) <= 56);
  if (trend.length < 2) trend = pts.slice(-8);
  return {
    nowKg: now,
    startKg: start,
    targetKg: target,
    sinceIso: pts[0].d,
    changeKg: Math.round((now - start) * 100) / 100,
    toGoKg: target != null && !reached ? Math.round(Math.abs(target - now) * 100) / 100 : null,
    pct,
    reached,
    paceKgWk,
    etaIso,
    trend,
  };
}

// The sample's weigh-ins moved so the last lands today: the signed-out preview's goal is dated
// months back, and a read of it would have no recent pace.
export function bsHwRedate(weighIns, todayIso) {
  const pts = (Array.isArray(weighIns) ? weighIns : []).filter((w) => w && w.d);
  if (!pts.length) return [];
  const gap = bsHwDayNum(todayIso) - bsHwDayNum(pts[pts.length - 1].d);
  return pts.map((w) => ({ ...w, d: bsHwShift(String(w.d).slice(0, 10), gap) }));
}

// The coaches the member pays (bsHomeCoachesOf's) as 'role:id' keys, to match what a coach wrote or
// booked. A coach without an id matches nothing.
function bsHomePaidKeys(coaches) {
  return new Set((Array.isArray(coaches) ? coaches : [])
    .filter((c) => c && c.providerId != null).map((c) => `${c.role}:${c.providerId}`));
}

// The coaches' weekly notes (coach_focus_banners rows) from the coaches the member pays: a former
// coach's note stays readable after the subscription ends, and isn't this section's (Codex P2 on
// #2424). A row's role other than 'nutritionist' is a trainer's, as Home signs it.
export function bsHomePaidBanners(banners, coaches) {
  const paid = bsHomePaidKeys(coaches);
  return (Array.isArray(banners) ? banners : []).filter((b) => b
    && paid.has(`${b.provider_role === 'nutritionist' ? 'nutritionist' : 'trainer'}:${b.provider_id}`));
}

// The member's next session with a coach they pay (`coaches`, bsHomeCoachesOf's): the soonest
// confirmed one still ahead, as a client. A session still booked with a former coach, or with an
// intro coach they don't pay, is not this section's (Codex P2 on #2424).
export function bsHomeNextSession(sessions, coaches, nowMs = Date.now()) {
  const paid = bsHomePaidKeys(coaches);
  const rows = (Array.isArray(sessions) ? sessions : [])
    .filter((s) => s && s.role === 'client' && s.status === 'confirmed' && paid.has(`${s.providerRole}:${s.providerId}`))
    .map((s) => ({ ...s, at: new Date(s.scheduledAt).getTime() }))
    .filter((s) => Number.isFinite(s.at) && s.at > nowMs)
    .sort((a, b) => a.at - b.at);
  return rows[0] || null;
}

// A read Week so far holds ({ monday, v }), for the week it was read for only: Home left open across
// Sunday into Monday reads the new week, and until that read lands last week's figures are unknown
// here, never this week's zeros (Codex P2 on #2424).
export function bsHwOfWeek(held, monday) {
  return held && held.monday === monday && held.v !== undefined ? held.v : null;
}

// The member's coaches, off the plan read: each one they pay, trainers first, with the thread a
// message opens and the id their sessions are booked under. A read that failed (no `coaching`
// key) or no coach reads as none. A coach whose name couldn't be read is still paid, so stays with
// a null name (Home says the role instead, Codex P2 on #2424); an entry with neither is dropped.
export function bsHomeCoachesOf(plan) {
  const out = [];
  const add = (part, role) => {
    const c = plan && plan[part] && plan[part].coaching;
    const list = c && Array.isArray(c.coaches) ? c.coaches : [];
    for (const k of list) {
      if (k && (k.name || k.providerId != null)) out.push({ role, name: k.name ? String(k.name) : null, conversationId: k.conversationId || null, providerId: k.providerId ?? null });
    }
  };
  add('training', 'trainer');
  add('meals', 'nutritionist');
  return out;
}
