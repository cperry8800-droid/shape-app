import { supersetKey } from '../../../public/newdesign/workoutDocument.mjs';

// Session rules shared by the live player and regression tests. Drafts contain
// only this account's work; the existing shapeClient sign-out scrub owns them.
export const bsWorkoutDraftKey = (userId) => userId ? `shapeClientWorkoutDrafts:${userId}` : null;
export function bsWorkoutDrafts(storage, userId) {
  try {
    const rows = JSON.parse(storage?.getItem(bsWorkoutDraftKey(userId)) || '[]');
    return userId && Array.isArray(rows) ? rows.filter(d => d?.schemaVersion === 1 && d.userId === userId && d.sessionId && Array.isArray(d.moves) && d.moves.length > 0 && d.moves.every(m => m && typeof m.m === 'string')) : [];
  } catch { return []; }
}
export function bsStoreWorkoutDraft(storage, userId, draft) {
  if (!userId || draft?.userId !== userId || !draft?.sessionId) return false;
  try {
    const rows = bsWorkoutDrafts(storage, userId).filter(d => d.sessionId !== draft.sessionId);
    storage.setItem(bsWorkoutDraftKey(userId), JSON.stringify([{ ...draft, schemaVersion: 1, updatedAt: Date.now() }, ...rows]));
    return true;
  } catch { return false; }
}
export function bsRemoveWorkoutDraft(storage, userId, sessionId) {
  if (!userId) return;
  try { storage.setItem(bsWorkoutDraftKey(userId), JSON.stringify(bsWorkoutDrafts(storage, userId).filter(d => d.sessionId !== sessionId))); } catch {}
}
export function bsRestSeconds(move = {}) {
  if (move.restSeconds != null && Number.isFinite(Number(move.restSeconds))) return Math.max(0, Number(move.restSeconds));
  const raw = String(move.rest || move.s || '').toLowerCase();
  if (move.rest != null && /^\d+(?:\.\d+)?$/.test(String(move.rest).trim())) return Number(move.rest);
  const clock = raw.match(/(?:^|[·,]\s*)(\d+):(\d{2})(?:\s*rest)?(?:$|\s)/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const duration = raw.match(/(\d+(?:\.\d+)?)\s*(min(?:ute)?s?|m|sec(?:ond)?s?|s)(?:\s*rest)?/);
  // A segment such as "30 min zone 2" is activity, not a rest prescription.
  if (duration && (move.rest || /rest/.test(raw))) return Math.round(Number(duration[1]) * (/^m/.test(duration[2]) ? 60 : 1));
  return null;
}
export function bsSessionMoves(moves = []) {
  return moves.map(m => {
    const scheme = String(m.s || '').match(/(\d+)\s*[×x]\s*([\d–-]+)/);
    return { ...m, sets: Math.max(1, Number(m.sets) || (scheme ? Number(scheme[1]) : 1)), reps: m.reps ?? (scheme ? scheme[2] : ''), restSeconds: bsRestSeconds(m) };
  });
}
// The preview owns the selected workout. Carry that exact assignment into the
// player rather than navigating to a separate screen that defaults to today.
export function bsPreviewSession(workout = {}, formatLoad = value => value) {
  const rawMoves = workout.exercises || workout.detail?.moves || workout.moves || [];
  return {
    clientWorkoutId: workout.workoutId || workout.id || null,
    title: workout.title || '',
    prescriptionMeta: { template: workout.template || workout.payload?.template || null, program: workout.program || null, adjustGen: workout.adjustGen || workout.payload?.adjustGen || null },
    moves: bsSessionMoves(rawMoves.map(m => ({ ...m, m: m.name ?? m.m ?? '', s: m.scheme ?? m.seg ?? m.s ?? '', l: formatLoad(m.load ?? m.l ?? '') || '' }))),
  };
}
// Two moves are one superset when their keys match under the document's own
// rule. ⚠ NAVIGATION AND REST MUST ASK THE SAME QUESTION: this compared a
// TRIMMED key while the player's rest decision compared the RAW one, so 'A' and
// 'A ' jumped the member to the partner and then made them sit a full rest.
export function bsSameGroup(a, b) {
  const x = supersetKey(a && a.group);
  return !!x && x === supersetKey(b && b.group);
}
export function bsNextSessionMove(moves, completed, from) {
  const pending = i => Array.from({ length: moves[i].sets }).some((_, n) => !completed[`${i}-${n}`]);
  if (supersetKey(moves[from]?.group)) {
    for (let step = 1; step <= moves.length; step++) {
      const i = (from + step) % moves.length;
      if (bsSameGroup(moves[from], moves[i]) && pending(i)) return i;
    }
  }
  if (pending(from)) return from;
  for (let step = 1; step <= moves.length; step++) { const i = (from + step) % moves.length; if (pending(i)) return i; }
  return null;
}
export function bsApplyRemainingLoad(inputs, completed, moves, moveIdx, setIdx, value) {
  const next = { ...inputs };
  const name = String(moves[moveIdx]?.m || '').trim().toLowerCase();
  moves.forEach((m, mi) => {
    if (String(m.m || '').trim().toLowerCase() !== name || mi < moveIdx) return;
    for (let si = 0; si < m.sets; si++) {
      if ((mi === moveIdx && si < setIdx) || completed[`${mi}-${si}`]) continue;
      const key = `${mi}-${si}`;
      next[key] = { ...inputs[key], load: value };
    }
  });
  return next;
}
// The prescribed WEIGHT the member's load box is pre-filled with. `move.l` is
// the DISPLAY label, and since RPE became its own axis it can read
// "100 kg · RPE 8" — prefilled verbatim, that string fails `bsLoggedSet`'s
// number match and a quick-logged set records NO actual load, so the lift
// silently drops out of the member's history. RPE is the target effort, never a
// weight, and never pre-entered as the member's own (it stays in the target
// line). A label with no weight in it ("RPE 8") prefills nothing.
export function bsLoadPrefill(move) {
  return String(move?.l ?? '').split(/\s*·\s*/).filter(p => p && !/^RPE\s*\d+(?:\.\d+)?$/i.test(p)).join(' · ');
}
export function bsLoggedSet({ move, moveIndex, setIndex, input, startedAt = null, lastEndedAt = null, now, unit }) {
  const timed = Number.isFinite(startedAt) && startedAt > 0;
  // A duration, range, %1RM or AMRAP target is not an actual rep count/load.
  // Keep the entered text in payload while recording only unambiguous numbers.
  const repText = String(input.reps ?? '').trim();
  const reps = /^(\d+)(?:\s*reps?)?$/i.exec(repText);
  const load = /^\+?(\d[\d,]*(?:\.\d+)?)\s*(kg|lbs?)?$/i.exec(String(input.load ?? '').trim());
  return {
    key: `${moveIndex}-${setIndex}`, moveIndex, moveName: move.m, setNumber: setIndex + 1,
    targetReps: move.reps, targetLoad: move.l, actualReps: reps ? Number(reps[1]) : null,
    actualLoad: load ? Number(load[1].replace(/,/g, '')) : null,
    enteredReps: input.reps, enteredLoad: input.load,
    rpe: input.rpe === '' || input.rpe == null ? null : input.rpe,
    unit: load?.[2] ? (load[2].toLowerCase() === 'kg' ? 'kg' : 'lb') : unit,
    startedAt: timed ? new Date(startedAt).toISOString() : null,
    finishedAt: new Date(now).toISOString(), capturedAt: new Date(now).toISOString(),
    setDurationSeconds: timed ? Math.max(0, Math.round((now - startedAt) / 1000)) : null,
    restBeforeSeconds: timed && lastEndedAt != null ? Math.max(0, Math.round((startedAt - lastEndedAt) / 1000)) : null,
    captureMethod: timed ? 'timed_set' : 'quick_log', completed: true,
  };
}
