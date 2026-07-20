// Live workout-progress payload builders + the consumer-side wire validator
// (spec 2026-07-18 · web parity 2026-07-19). CANONICAL COPY — the website
// loads this as a native ES module (→ window.ShapeLiveValidate), the mobile
// app re-exports it from mobile-app/src/services/liveProgress.mjs (which
// also holds bsLiveAudience — writer-side, it needs workoutShare.mjs, a
// path the website is never served), and the Node tests import it directly.
// Pure — no imports, timestamps injected.
//
// PRIVACY INVARIANTS (owner decisions — do not widen without a new spec):
//  · The payload carries exercise NAMES + SET COUNTS only. Never loads, reps
//    figures, RPE, or HR — the audience can include followers or the public.
//  · Audience is the member's own share rule (bsWorkoutSharePrivacy).
//    'private' → null → the caller writes NOTHING (absence, not filtering:
//    absence can't leak a setting choice).
//  · A FAILED settings read is null too (fail closed — the #1613 lesson).

const PUSH_FLOOR_MS = 4000;
const MAX_SETS = 50;      // per-move bound — also blocks Infinity/fractional state (review: CodeRabbit)
const MAX_EXERCISES = 60;

// Cooking titles are member-authored text going onto someone else's screen:
// no control characters (they can hide or reorder rendered text) and no markup
// delimiters. REJECT, never sanitise-and-send — see bsCookingPayload.
const COOK_TITLE_BAD = /[\u0000-\u001f\u007f<>]/;

const intSets = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(MAX_SETS, Math.max(1, Math.floor(n))) : 1;
};

export function bsLiveProgressPayload(moves, completed, moveIdx, resting) {
  if (!Array.isArray(moves) || moves.length === 0) return null;
  const done = completed && typeof completed === 'object' ? completed : {};
  const exercises = moves.slice(0, MAX_EXERCISES).map((m, i) => {
    const total = intSets(m && m.sets);
    let d = 0;
    for (let s = 0; s < total; s++) if (done[`${i}-${s}`]) d++;
    return { n: String((m && m.m) || '').trim().slice(0, 80) || 'Exercise', done: d, total };
  });
  const setsTotal = exercises.reduce((s, e) => s + e.total, 0);
  const setsDone = exercises.reduce((s, e) => s + e.done, 0);
  const curIdx = Number.isInteger(moveIdx) && moveIdx >= 0 && moveIdx < exercises.length ? moveIdx : -1;
  return { v: 1, exercises, curIdx, resting: !!resting, setsDone, setsTotal };
}

// Cooking payload (spec 2026-07-19): the planned meal's TITLE only — never
// macros, portions, or adjustments. Eligible ONLY for a plan/recipe-sourced
// meal; a freehand meal is intake, and intake stays silent (the presence dot
// already says "cooking"). Rejects rather than truncates, so the builder and
// the wire validator enforce one identical contract.
export function bsCookingPayload(meal) {
  if (!meal || typeof meal !== 'object') return null;
  // Planned-meal predicate, STRICT: Number(null)/Number('')/Number(false) are
  // all finite 0 — a freehand meal carrying one of those must NOT read as
  // planned. Only a real number, or a non-empty numeric string, counts.
  const kcalPlanned =
    (typeof meal.kcal === 'number' && Number.isFinite(meal.kcal)) ||
    (typeof meal.kcal === 'string' && meal.kcal.trim() !== '' && Number.isFinite(Number(meal.kcal)));
  const eligible = kcalPlanned || (typeof meal.recipeId === 'string' && !!meal.recipeId.trim());
  if (!eligible) return null;                              // freehand = intake = silence
  const title = String(meal.title || '').trim();
  if (!title || title.length > 80 || COOK_TITLE_BAD.test(title)) return null;
  return { v: 1, kind: 'cooking', title };
}

// ── Coach channel (spec 2026-07-19, owner-ratified) ─────────────────────────
// The COACH-only payload: the public contract plus per-set load/reps/rpe. It
// changes WHEN the client's own coach reads what the session log will already
// tell them, not WHAT — so it is gated on the coach link alone, and it rides a
// SEPARATE table (RLS is row-level, not column-level).
// NEVER HR, notes, video or location. Strings as the member typed them.
const MAX_SET_STR = 12;     // per-field character bound
const MAX_SETS_SERIALIZED = 10;   // per-exercise bound on the serialized tail

const setStr = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim().slice(0, MAX_SET_STR);

export function bsLiveCoachPayload(moves, completed, moveIdx, resting, setInputs) {
  const base = bsLiveProgressPayload(moves, completed, moveIdx, resting);
  if (!base) return null;
  const done = completed && typeof completed === 'object' ? completed : {};
  const inputs = setInputs && typeof setInputs === 'object' ? setInputs : {};
  const exercises = base.exercises.map((e, i) => {
    const n = Math.min(e.total, MAX_SETS_SERIALIZED);   // truncate the tail at BUILD
    const sets = [];
    for (let s = 0; s < n; s++) {
      const src = inputs[`${i}-${s}`] || {};
      const isDone = !!done[`${i}-${s}`];
      // ⚠ BSSession PRE-FILLS setInputs for EVERY set from the PRESCRIPTION
      // (buildSetInputs seeds m.l / m.reps / m.rpe||'8'), so an untouched set
      // already carries planned figures that are indistinguishable here from
      // typed ones. Serializing those would show the coach a PLAN as if it
      // were a FACT — fabrication, the one thing this channel must never do.
      // Actuals therefore ride only once the set is marked done; until then
      // the cell is honest-absent ('' → the consumer renders '—').
      sets.push(isDone
        ? { load: setStr(src.load), reps: setStr(src.reps), rpe: setStr(src.rpe), done: true }
        : { load: '', reps: '', rpe: '', done: false });
    }
    return { ...e, sets };
  });
  return { ...base, exercises };
}

// Full-contract discipline: everything the public validator checks on the base
// shape, PLUS the per-set bounds. The wire gets no truncation courtesy — any
// violation returns null and the consumer falls back to the public row.
export function bsValidLiveCoachPayload(raw) {
  const base = bsValidLivePayload(raw);
  if (!base || base.kind === 'cooking') return null;   // coach channel is workout-only
  if (!raw || !Array.isArray(raw.exercises)) return null;
  const exercises = [];
  for (let i = 0; i < base.exercises.length; i++) {
    const src = raw.exercises[i];
    const sets = src && src.sets;
    if (!Array.isArray(sets) || sets.length > MAX_SETS_SERIALIZED) return null;
    const clean = [];
    for (const s of sets) {
      if (!s || typeof s !== 'object') return null;
      if (typeof s.load !== 'string' || typeof s.reps !== 'string' || typeof s.rpe !== 'string') return null;
      if (s.load.length > MAX_SET_STR || s.reps.length > MAX_SET_STR || s.rpe.length > MAX_SET_STR) return null;
      if (typeof s.done !== 'boolean') return null;
      // Rebuilt field-by-field: extra keys (an HR reading, a note) can never
      // ride through to the render even if the wire carries them.
      clean.push({ load: s.load, reps: s.reps, rpe: s.rpe, done: s.done });
    }
    exercises.push({ ...base.exercises[i], sets: clean });
  }
  return { ...base, exercises };
}

export function bsShouldPushProgress(prevPayload, nextPayload, lastPushAt, now) {
  if (!nextPayload) return false;
  if (JSON.stringify(prevPayload) === JSON.stringify(nextPayload)) return false;
  // The FIRST push of a session bypasses the floor — a viewer opening the boost
  // sheet shouldn't wait 4s to see a session that just started. Explicit rather
  // than emergent: with a real clock `Date.now() - 0` clears the floor anyway,
  // but relying on that accident breaks under an injected/fake clock.
  if (prevPayload == null) return true;
  return (Number(now) || 0) - (Number(lastPushAt) || 0) >= PUSH_FLOOR_MS;
}

// Consumer-side structural validator (review: CodeRabbit) — jsonb off the wire
// is attacker-shaped until proven otherwise. Anything malformed → null → the
// honest-absent render; a v1 consumer never guesses at a partial shape.
export function bsValidLivePayload(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== 1) return null;
  // Kind dispatch FIRST — before any workout-shaped check. A cooking row has
  // no exercises, so the workout contract below would reject it outright.
  if (raw.kind === 'cooking') {
    // Cooking contract: exactly {v,kind,title}. The wire gets no truncation
    // courtesy — an out-of-contract title is REJECTED (the builder never
    // emits one, so a violation is by definition not ours).
    if (typeof raw.title !== 'string') return null;
    const title = raw.title.trim();
    if (!title || raw.title.length > 80 || COOK_TITLE_BAD.test(raw.title)) return null;
    return { v: 1, kind: 'cooking', title };
  }
  if (raw.kind !== undefined && raw.kind !== 'workout') return null;
  if (!Array.isArray(raw.exercises) || raw.exercises.length === 0 || raw.exercises.length > MAX_EXERCISES) return null;
  const okInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
  let sumDone = 0; let sumTotal = 0;
  for (const e of raw.exercises) {
    if (!e || typeof e !== 'object') return null;
    // A whitespace-only name would render as a blank row — the builder never
    // emits one (it falls back to 'Exercise'), so the wire must not either.
    if (typeof e.n !== 'string' || !e.n.trim() || e.n.length > 80) return null;
    if (!okInt(e.total, 1, MAX_SETS) || !okInt(e.done, 0, e.total)) return null;
    sumDone += e.done; sumTotal += e.total;
  }
  if (!Number.isInteger(raw.curIdx) || raw.curIdx < -1 || raw.curIdx >= raw.exercises.length) return null;
  if (!okInt(raw.setsDone, 0, MAX_SETS * MAX_EXERCISES) || !okInt(raw.setsTotal, 1, MAX_SETS * MAX_EXERCISES)) return null;
  // Aggregates MUST equal the sums the builder computes — contradictory totals
  // would render a fabricated progress bar (review: CodeRabbit).
  if (raw.setsDone !== sumDone || raw.setsTotal !== sumTotal) return null;
  if (typeof raw.resting !== 'boolean') return null;
  return {
    v: 1,
    title: typeof raw.title === 'string' ? raw.title.slice(0, 80) : '',
    exercises: raw.exercises.map((e) => ({ n: e.n, done: e.done, total: e.total })),
    curIdx: raw.curIdx,          // -1 is a REAL state: "no current exercise"
    resting: raw.resting,
    setsDone: raw.setsDone,
    setsTotal: raw.setsTotal,
  };
}
