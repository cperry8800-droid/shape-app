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
