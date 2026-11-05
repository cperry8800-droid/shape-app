// A client's own training days, Monday = 0 (P6, 2026-11-05): "Assign follows each client's own
// training days (from their program or sessions) instead of a Mon/Wed/Fri default, with a coach
// override." Pure; the route (/api/coach/clients/training-days) does the reads.
//
// Two sources, in this order:
//   1. Their scheduled workouts: the weekdays they actually train on, from the sessions their trainer
//      put on the calendar (the last two weeks and the next two). A weekday counts when it holds a
//      session twice in that window, or once in the coming week.
//   2. Their program's week (client_programs.detail.training.days, the trainer's Adjust: seven
//      labels, Monday first, "Rest" for a rest day).
// Neither: null, and the caller keeps the coach's own ticks. Nothing is guessed.

const isoDay = (v) => {
  const s = String(v == null ? '' : v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(s + 'T00:00:00Z');
  return Number.isFinite(t) ? t : null;
};
const DAY = 86400000;
/** Monday = 0 … Sunday = 6, for a YYYY-MM-DD day. */
export function mondayDow(iso) {
  const t = isoDay(iso);
  return t == null ? null : (new Date(t).getUTCDay() + 6) % 7;
}

/** The training weekdays a program's week names, or null when it names none (or names no rest at all, which is no week). */
export function programTrainingDows(detail) {
  const days = detail && detail.training && Array.isArray(detail.training.days) ? detail.training.days : null;
  if (!days || days.length !== 7) return null;
  const out = [];
  days.forEach((d, i) => {
    const label = String(d == null ? '' : d).trim();
    if (label && !/^rest\b/i.test(label)) out.push(i);
  });
  return out.length && out.length < 7 ? out : null;
}

/** The weekdays their scheduled sessions fall on around `today`, or null with too few to read. */
export function sessionTrainingDows(dates, today) {
  const now = isoDay(today);
  if (now == null) return null;
  const count = [0, 0, 0, 0, 0, 0, 0];
  const soon = [false, false, false, false, false, false, false];
  let n = 0;
  for (const d of Array.isArray(dates) ? dates : []) {
    const t = isoDay(d);
    if (t == null || t < now - 14 * DAY || t > now + 14 * DAY) continue;
    const dow = mondayDow(d);
    count[dow] += 1;
    if (t >= now && t < now + 7 * DAY) soon[dow] = true;
    n += 1;
  }
  if (n < 2) return null;
  const out = count.map((c, i) => (c >= 2 || soon[i] ? i : null)).filter((i) => i != null);
  return out.length && out.length < 7 ? out : null;
}

/**
 * { dows, source: 'sessions' | 'program' } or null.
 * @param {{ programDetail?: any, sessionDates?: string[], today?: string }} [input]
 */
export function trainingDowsFor({ programDetail = null, sessionDates = [], today = '' } = {}) {
  const fromSessions = sessionTrainingDows(sessionDates, today);
  if (fromSessions) return { dows: fromSessions, source: 'sessions' };
  const fromProgram = programTrainingDows(programDetail);
  if (fromProgram) return { dows: fromProgram, source: 'program' };
  return null;
}
