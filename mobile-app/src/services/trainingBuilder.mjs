// The builder's brain — pure, timezone-free. Validates a draft, materializes a
// PROGRAM into dated client_workouts insert-payloads, and slots weekly-repeat
// sessions onto a week. Dates in, dates out; the caller supplies the start.
//
// The row cap is derived from the clamps and never truncates: weeks clamp to
// 1..26 and the builder validates weeks × days-per-week ≤ 182 (26 × 7). An
// over-cap request BLOCKS the save with an honest message instead of dropping
// rows silently.

export const BS_BUILDER_CAP = 182;

export function bsProgramRowCount(weeks, daysPerWeek) {
  return (Number(weeks) || 0) * (Number(daysPerWeek) || 0);
}

export function bsProgramFits(weeks, daysPerWeek) {
  const w = Number(weeks);
  const d = Number(daysPerWeek);
  if (!Number.isFinite(w) || !Number.isFinite(d)) return false;
  if (w < 1 || w > 26) return false;
  if (d < 1 || d > 7) return false;
  return bsProgramRowCount(w, d) <= BS_BUILDER_CAP;
}

// Normalize a builder move to the payload.exercises row shape. A lift keeps
// sets/reps/load (stringified); a segment keeps its free `seg` descriptor and
// blanks the lift fields.
export function bsMoveRow(m) {
  const src = m && typeof m === 'object' ? m : {};
  const seg = src.seg != null && String(src.seg).length ? String(src.seg) : '';
  if (seg) {
    return { name: String(src.name || '').trim(), sets: '', reps: '', load: '', seg };
  }
  return {
    name: String(src.name || '').trim(),
    sets: src.sets != null ? String(src.sets) : '',
    reps: src.reps != null ? String(src.reps) : '',
    load: src.load != null ? String(src.load) : '',
    seg: '',
  };
}

// Local Monday (00:00) of the week containing an ISO date. DST-safe: date math
// on a local-midnight Date via setDate.
function mondayOf(iso) {
  const [y, mo, d] = String(iso).split('-').map(Number);
  const dt = new Date(y, (mo || 1) - 1, d || 1); // local midnight
  const offset = (dt.getDay() + 6) % 7; // 0 = Monday
  dt.setDate(dt.getDate() - offset);
  return dt;
}

function isoOf(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// Materialize a PROGRAM draft into dated insert-payloads. Each day's date is
// Monday(startISO) + (week-1)*7 + dow. Days strictly before startISO are
// skipped (a mid-week start doesn't backfill). Every row carries
// payload.program:{id,name,week,day,weeks,runId} so readers can group/label it.
export function bsMaterializeProgram({ name, discipline, weeks, startISO, runId, programId }) {
  const monday = mondayOf(startISO);
  const totalWeeks = Array.isArray(weeks) ? weeks.length : 0;
  const id = programId || `self:${runId}`;
  const [sy, sm, sd] = String(startISO).split('-').map(Number);
  const startDt = new Date(sy, (sm || 1) - 1, sd || 1);
  const rows = [];
  (Array.isArray(weeks) ? weeks : []).forEach((wk) => {
    const wIdx = (Number(wk.week) || 1) - 1;
    (Array.isArray(wk.days) ? wk.days : []).forEach((day) => {
      const dow = Number(day.dow);
      if (!Number.isInteger(dow) || dow < 0 || dow > 6) return;
      const dt = new Date(monday);
      dt.setDate(dt.getDate() + wIdx * 7 + dow);
      if (dt < startDt) return; // don't backfill days before the chosen start
      const moves = Array.isArray(day.moves) ? day.moves.map(bsMoveRow) : [];
      rows.push({
        title: String(day.title || name || 'Workout'),
        description: String(name || ''),
        scheduledDate: isoOf(dt),
        payload: {
          exercises: moves,
          program: { id, name: String(name || ''), week: Number(wk.week) || 1, day: dow, weeks: totalWeeks, runId: runId || '' },
        },
      });
    });
  });
  return rows;
}

// The one-row weekly-repeat shape (no scheduledDate — it recurs each week until
// the member edits/deletes it).
export function bsRepeatSpec({ name, discipline, repeatDow, moves, time }) {
  const dows = Array.isArray(repeatDow) ? repeatDow.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) : [];
  const payload = { exercises: Array.isArray(moves) ? moves.map(bsMoveRow) : [], repeatDow: dows };
  if (time) payload.time = time;
  return { title: String(name || 'Workout'), description: '', payload };
}

// Given self rows carrying payload.repeatDow, return a 7-slot week (index 0 =
// Monday) with the first repeat claiming each of its weekdays. Slots the caller
// already filled with dated rows are passed in via `base` and never overwritten.
export function bsSlotRepeats(rows, weekMondayISO, base = [null, null, null, null, null, null, null]) {
  const week = base.slice(0, 7);
  while (week.length < 7) week.push(null);
  (Array.isArray(rows) ? rows : []).forEach((w) => {
    const dows = w && w.payload && Array.isArray(w.payload.repeatDow) ? w.payload.repeatDow : null;
    if (!dows) return;
    dows.forEach((dow) => {
      if (Number.isInteger(dow) && dow >= 0 && dow <= 6 && !week[dow]) week[dow] = w;
    });
  });
  return week;
}
