// Adjust → full program regeneration — the pure planner (spec #1707,
// docs/superpowers/specs/2026-07-13-adjust-regeneration-design.md).
//
// bsAdjustRegen takes the coach's OWN authored rows for one client plus the
// Adjust page's controls and emits { inserts, deleteIds, repeatPatches } for
// the transactional regenerate_client_workouts RPC. Pure + deterministic
// (todayISO and gen are inputs — no Date.now), and it NEVER fabricates: a
// workout the coach didn't author cannot appear; every transform is a move,
// scale, trim, or replicate of authored content.
//
// Invariants (each carries a test vector):
//   · Intensity always scales from each move's stored BASE load
//     (`baseL`, preserved on first regeneration) — deload → progress
//     re-derives correctly and repeated Applies are idempotent.
//   · Weekday remapping is deterministic: training weekdays sort ascending
//     (Mon=0…Sun=6, the builder's base); old training days map 1:1 onto the
//     new split's first `sessions` training days by rank; trimmed ranks
//     delete; increases can only re-day existing sessions.
//   · Scope is the STRICT future (scheduled_date > todayISO) + undated
//     weekly repeats. Today's row, past rows, and rows without a parsable
//     shape pass through untouched.
//   · A coach-set Rest weekday also drops that day from repeat rows'
//     repeatDow (an emptied repeat is deleted) so re-materialization can
//     never resurrect it.
//
// The scaling constants + load parser live HERE as the one source of truth —
// the display path (bsClientWeekDemo bsApplyTrainAdjust) imports them.

export const BS_ADJUST_SCALE = { deload: 0.85, maintain: 1, progress: 1.025 };

// Scale the first number in a free-text load ("135 lb" → "115 lb"); loads
// ≥20 round to the nearest 5 (plate math), smaller round to 1.
export function bsScaleLoad(load, scale) {
  const s = String(load == null ? '' : load);
  if (scale === 1 || !/\d/.test(s)) return s;
  return s.replace(/\d+(?:\.\d+)?/, (n) => {
    const v = Number(n) * scale;
    return String(v >= 20 ? Math.round(v / 5) * 5 : Math.round(v));
  });
}

const isoShift = (iso, days) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, (d || 1) + days);
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
};
// Monday-based weekday (Mon=0…Sun=6) from an ISO date — local parts, no TZ.
const isoDow = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return (new Date(y, (m || 1) - 1, d || 1).getDay() + 6) % 7;
};

// Scale a row's exercises from their BASE loads, preserving/stamping baseL.
// Segments (cardio lines) carry no load and pass through.
function scaleExercises(exercises, scale) {
  if (!Array.isArray(exercises)) return exercises;
  return exercises.map((m) => {
    if (!m || typeof m !== 'object' || m.seg) return m;
    const base = m.baseL != null && String(m.baseL).length ? String(m.baseL) : String(m.load == null ? '' : m.load);
    if (!/\d/.test(base)) return m;
    return { ...m, baseL: base, load: bsScaleLoad(base, scale) };
  });
}

const MAX_ROWS = 182; // the Assign flow's materialization bound

/**
 * @param rows        the coach's authored rows for this client:
 *                    [{ id, title, description, kind, payload, scheduled_date }]
 * @param adjustment  { intensity, sessions, weeks, days } — days = 7 labels
 *                    (Mon-first), 'Rest' marks a rest weekday
 * @param todayISO    'YYYY-MM-DD' — strict-future boundary
 * @param gen         the new generation stamped on every regenerated row
 * @returns { changed, inserts, deleteIds, repeatPatches, capped }
 */
export function bsAdjustRegen({ rows, adjustment, todayISO, gen }) {
  const out = { changed: false, inserts: [], deleteIds: [], repeatPatches: [], capped: false };
  if (!Array.isArray(rows) || !adjustment || !todayISO) return out;
  const scale = BS_ADJUST_SCALE[adjustment.intensity] ?? 1;
  const labels = Array.isArray(adjustment.days) && adjustment.days.length === 7 ? adjustment.days : null;

  const dated = rows.filter((r) => r && r.scheduled_date && String(r.scheduled_date) > todayISO);
  const repeats = rows.filter((r) => r && !r.scheduled_date && Array.isArray(r.payload?.repeatDow));
  if (!dated.length && !repeats.length) return out;

  // ── The deterministic, STABLE weekday mapping ─────────────────────────────
  // New training weekdays: the split's non-Rest days ascending, capped at
  // sessions/week. Old training weekdays: the distinct weekdays the future
  // rows actually occupy, ascending. Stability first: an old weekday still in
  // the new set STAYS PUT; the displaced ones (rest days / not in the split)
  // map onto the UNUSED new weekdays in ascending order; displaced days with
  // no slot left delete. Same inputs → same schedule, always.
  const splitDows = labels ? labels.map((l, i) => (l === 'Rest' ? null : i)).filter((v) => v != null) : null;
  const sessions = Number(adjustment.sessions);
  const newDows = splitDows
    ? splitDows.slice(0, Number.isFinite(sessions) && sessions >= 1 ? Math.min(splitDows.length, Math.round(sessions)) : splitDows.length)
    : null;
  const oldDows = [...new Set(dated.map((r) => isoDow(r.scheduled_date)))].sort((a, b) => a - b);
  const dowMap = new Map();
  if (newDows) {
    const newSet = new Set(newDows);
    const kept = oldDows.filter((d) => newSet.has(d));
    const keptSet = new Set(kept);
    const available = newDows.filter((d) => !keptSet.has(d));
    const movers = oldDows.filter((d) => !newSet.has(d));
    // But the sessions cap binds on the TOTAL: if more old days survive than
    // the cap allows, trim the LAST kept weekdays too.
    const cap = newDows.length;
    kept.slice(0, cap).forEach((d) => dowMap.set(d, d));
    const room = Math.max(0, cap - Math.min(kept.length, cap));
    movers.slice(0, Math.min(room, available.length)).forEach((d, i) => dowMap.set(d, available[i]));
  } else {
    oldDows.forEach((d) => dowMap.set(d, d));
  }

  // ── The weeks horizon ──────────────────────────────────────────────────────
  const weeks = Number(adjustment.weeks);
  const horizonISO = Number.isFinite(weeks) && weeks >= 1 ? isoShift(todayISO, Math.round(weeks) * 7) : null;

  // Materiality is judged per row (a date that moves, a load the base-scaling
  // actually changes, a trim) — NOT from the intensity setting alone, so
  // applying the identical adjustment twice is a no-op by construction: the
  // second pass re-derives the same loads from baseL and nothing differs.
  let material = false;
  const survivors = [];
  for (const r of dated) {
    const w = isoDow(r.scheduled_date);
    if (!dowMap.has(w)) { out.deleteIds.push(r.id); material = true; continue; }
    const delta = dowMap.get(w) - w;
    const newDate = delta === 0 ? String(r.scheduled_date) : isoShift(r.scheduled_date, delta);
    // A remap that lands on/before today has already passed this week — the
    // occurrence is honestly dropped (deterministic; next week's lands fine).
    if (newDate <= todayISO) { out.deleteIds.push(r.id); material = true; continue; }
    if (horizonISO && newDate > horizonISO) { out.deleteIds.push(r.id); material = true; continue; }
    const exercises = scaleExercises(r.payload?.exercises, scale);
    const rowMaterial = delta !== 0
      || JSON.stringify(exercises ?? null) !== JSON.stringify(r.payload?.exercises ?? null);
    if (rowMaterial) material = true;
    survivors.push({ row: r, newDate, exercises, rowMaterial });
  }

  // ── Extension: replicate the last full adjusted week forward ─────────────
  const extension = [];
  if (horizonISO && survivors.length) {
    const maxDate = survivors.reduce((m, s) => (s.newDate > m ? s.newDate : m), survivors[0].newDate);
    // The pattern week = Monday..Sunday containing the last survivor.
    const patternMonday = isoShift(maxDate, -isoDow(maxDate));
    const pattern = survivors.filter((s) => s.newDate >= patternMonday);
    if (pattern.length) {
      for (let k = 1; ; k += 1) {
        const anyInside = pattern.some((s) => isoShift(s.newDate, k * 7) <= horizonISO);
        if (!anyInside) break;
        for (const s of pattern) {
          const dt = isoShift(s.newDate, k * 7);
          if (dt > horizonISO) continue;
          extension.push({ row: s.row, newDate: dt, weekBump: k, exercises: s.exercises });
        }
        if (survivors.length + extension.length > MAX_ROWS) { out.capped = true; break; }
      }
      if (extension.length) material = true;
    }
  }

  // ── Repeat sources: drop rest/trimmed weekdays so nothing resurrects ─────
  const newDowSet = new Set(newDows || oldDows);
  for (const r of repeats) {
    const cur = r.payload.repeatDow.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    const kept = [...new Set(cur.filter((d) => newDowSet.has(d)))].sort((a, b) => a - b);
    if (kept.length === cur.length && cur.every((d, i) => kept[i] === d)) continue;
    material = true;
    if (!kept.length) out.deleteIds.push(r.id);
    else out.repeatPatches.push({ id: r.id, repeatDow: kept });
  }

  if (!material) return { ...out, deleteIds: [], inserts: [], repeatPatches: [] };

  // Every surviving/extended row is re-issued (delete old + insert adjusted)
  // with scaled-from-base loads and the row-scoped generation stamp.
  const emit = (row, newDate, exercises, weekBump = 0) => {
    const payload = { ...(row.payload || {}) };
    if (exercises !== undefined) payload.exercises = exercises;
    payload.adjustGen = gen;
    if (weekBump && payload.program && typeof payload.program === 'object') {
      payload.program = { ...payload.program, week: (Number(payload.program.week) || 0) + weekBump };
    }
    out.inserts.push({
      title: row.title || 'Workout',
      description: row.description || '',
      kind: row.kind === 'template' ? 'template' : 'custom',
      scheduled_date: newDate,
      playlist_id: row.playlist_id || null,
      payload,
    });
  };
  for (const s of survivors) { emit(s.row, s.newDate, s.exercises); out.deleteIds.push(s.row.id); }
  const seen = new Set();
  for (const e of extension) {
    if (out.inserts.length >= MAX_ROWS) { out.capped = true; break; }
    const key = `${e.newDate}:${e.row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    emit(e.row, e.newDate, e.exercises, e.weekBump);
  }

  out.changed = true;
  return out;
}
