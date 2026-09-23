import { supersetKey } from '../../../public/newdesign/workoutDocument.mjs';
import { BS_TIME_DISTANCE_SUFFIX, bsPlainScheme } from './planOutline.mjs';

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
// ⚠ THE REP VALUE IS NOT THE REST. A move with no rest field of its own took the first
// number-and-unit anywhere in its scheme, and on a hold or a distance that is the rep
// value: the demo Farmer carry, "3 × 40m · 60s rest", started a 40:00 rest timer (40
// metres read as 40 minutes), and "3 × 45s · 30s rest" rested 45 s. That first reading is
// replaced only when it starts inside the rep value as the outline parser's own reader
// finds it (`bsPlainScheme`: sets × reps, and a unit that ends the value). The rest is then
// read from what follows that reading, past the text run on to it up to the parser's own
// end of a value (a space, a "·", a comma or a semicolon), so a hold list such as
// "30s/45s" is not read as the rest either. Nothing before the rep value is kept: it holds
// no reading (one there would have come first), and joined to what follows, the 2 of
// "rest 2 3 × 30s min" would run into the "min". "m" is metres in a rep value and minutes
// in a rest ("2 m rest"), and the rep value is never read as one. A remaining duration
// may still describe a second hold or a distance: prefer the one labelled "rest" below.
// tests/session-rest-seconds.test.mjs pins the readings before each change.
const BS_REST_DURATION = /(\d+(?:\.\d+)?)\s*(min(?:ute)?s?|m|sec(?:ond)?s?|s)(?:\s*rest)?/;
const BS_REST_AMOUNT = String.raw`(?:\d+:\d{2}|\d+(?:\.\d+)?\s*(?:min(?:ute)?s?|m|sec(?:ond)?s?|s))`;
const BS_NAMED_REST = new RegExp(String.raw`\brest\s*:?\s*(${BS_REST_AMOUNT})(?![\w.:])|(?:^|[^\w.:])(${BS_REST_AMOUNT})\s*rest\b`);
const BS_VALUE_RUN = /^[^\s·,;]*/;
function bsRestText(scheme) {
  const at = bsPlainScheme(scheme);
  const read = BS_REST_DURATION.exec(scheme);
  if (!at || !read || read.index < at.index || read.index >= at.index + at[0].length) return scheme;
  const after = scheme.slice(read.index + read[0].length);
  return after.slice(BS_VALUE_RUN.exec(after)[0].length);
}
export function bsRestSeconds(move = {}) {
  if (move.restSeconds != null && Number.isFinite(Number(move.restSeconds))) return Math.max(0, Number(move.restSeconds));
  const raw = String(move.rest || move.s || '').toLowerCase();
  if (move.rest != null && /^\d+(?:\.\d+)?$/.test(String(move.rest).trim())) return Number(move.rest);
  const clock = raw.match(/(?:^|[·,]\s*)(\d+):(\d{2})(?:\s*rest)?(?:$|\s)/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const restText = move.rest ? raw : bsRestText(raw);
  const duration = BS_REST_DURATION.exec(restText);
  const scheme = bsPlainScheme(restText);
  const repEnd = scheme && scheme.index + scheme[0].length;
  const inRepRun = duration && scheme && duration.index >= scheme.index &&
    duration.index < repEnd + BS_VALUE_RUN.exec(restText.slice(repEnd))[0].length;
  // Preserve explicit rest fields and the clock rule above. When the existing
  // scheme reader found a duration, bind it to "rest" if possible, instead of
  // mistaking "30s hold" or "40 m sled" for the timer. No adjacent label means
  // the old reading wins; an unsupported standalone clock stays unsupported.
  // A slash-attached rep list ("3 × 30/45s") keeps its pinned legacy reading too.
  if (!move.rest && duration && !inRepRun) {
    const named = BS_NAMED_REST.exec(restText);
    if (named) return bsRestSeconds({ rest: named[1] || named[2] });
  }
  // A segment such as "30 min zone 2" is activity, not a rest prescription.
  if (duration && (move.rest || /rest/.test(raw))) return Math.round(Number(duration[1]) * (/^m/.test(duration[2]) ? 60 : 1));
  return null;
}
// A move with no reps of its own reads them from its scheme, with the outline parser's
// own reader (`bsPlainScheme`, planOutline.mjs), so a hold or a distance keeps its unit:
// "3 × 30 s" pre-fills "30 s", where the digits alone pre-filled "30" and a quick-logged
// plank recorded 30 reps. Any other scheme reads exactly as it did: the reader's number
// pattern is the one this line carried, and it adds a unit only where one ends the value.
export function bsSessionMoves(moves = []) {
  return moves.map(m => {
    const scheme = bsPlainScheme(String(m.s || ''));
    return { ...m, sets: Math.max(1, Number(m.sets) || (scheme ? Number(scheme[1]) : 1)), reps: m.reps ?? (scheme ? scheme[2] : ''), restSeconds: bsRestSeconds(m) };
  });
}
// ⚠ A SWAP THAT BRINGS ITS OWN SCHEME BRINGS ITS OWN PRESCRIPTION. The Train deck
// applies a picked alternative as `{ ...move, m, s }`, so the move swapped in kept the
// original's `sets`, `reps`, rest and ladder, and the player reads every one of those
// ahead of the scheme (`bsSessionMoves`, `bsRestSeconds`, `bsSetPrefill`): the deck
// showed "Goblet squat · 4 × 10 · 2:00" while the player ran the back squat's 5 × 5 on
// its 3:00 rest. When the swap's scheme is not the move's own, those fields go, so the
// player runs the scheme the deck shows. A generic variant ("Dumbbell variant") carries
// the move's own scheme and keeps everything, because nothing it prescribes changed.
// A ladder's `l` and `load` are the ladder written out ("60/70/80 kg"), which cannot
// outlive the ladder: every set's load box would be pre-filled with the whole list and
// log no load, so they read '—', the deck's own mark for no load. The load, RPE,
// tempo, cue and video of a move with no ladder are left as they were.
const BS_SWAP_CLEARS = ['sets', 'reps', 'rest', 'restSeconds', 'perSet'];
export function bsApplyMoveSwap(move, swap) {
  const next = { ...move, ...(swap || {}) };
  if (!swap || typeof swap !== 'object' || swap.s == null || String(swap.s) === String(move?.s ?? '')) return next;
  for (const key of BS_SWAP_CLEARS) delete next[key];
  if (bsHasLadder(move)) { next.l = '—'; delete next.load; }
  return next;
}
// The preview owns the selected workout. Carry that exact assignment into the
// player rather than navigating to a separate screen that defaults to today.
export function bsPreviewSession(workout = {}, formatLoad = value => value) {
  const rawMoves = workout.exercises || workout.detail?.moves || workout.moves || [];
  return {
    clientWorkoutId: workout.workoutId || workout.id || null,
    title: workout.title || '',
    prescriptionMeta: { template: workout.template || workout.payload?.template || null, program: workout.program || null, adjustGen: workout.adjustGen || workout.payload?.adjustGen || null },
    moves: bsSessionMoves(rawMoves.map(m => {
      const perSet = bsPerSetLabels(m.perSet, formatLoad);
      return { ...m, m: m.name ?? m.m ?? '', s: m.scheme ?? m.seg ?? m.s ?? '', l: formatLoad(m.load ?? m.l ?? '') || '', ...(perSet ? { perSet } : {}) };
    })),
  };
}
// ⚠ PER-SET TARGETS: THE COACH'S LADDER. A move may carry `perSet`, each set's own
// resolved `{reps, load}` (ShapeWorkoutDocument.exerciseFromRow writes it: every
// weight carries its unit and none carries the RPE). When it is there a set's
// target is its OWN entry, and when it is not every set's target is the move's.
// The move's own `reps` and `l` then hold the whole ladder written out ("8/6/4",
// "60/70/80 kg · RPE 8") for reading, and must never be pre-filled into one set:
// "8/6/4" in a reps box logs no reps at all.
// The weights go through the same formatter as the move's label, so a member on
// the other unit reads every set in their own unit, not only the summary.
export function bsPerSetLabels(perSet, formatLoad = value => value) {
  if (!Array.isArray(perSet) || !perSet.length) return undefined;
  return perSet.slice(0, 50).map((p) => {
    const e = p && typeof p === 'object' ? p : {};
    const load = e.load == null ? '' : String(e.load);
    return { reps: e.reps == null ? '' : String(e.reps), load: load ? (formatLoad(load) || '') : '' };
  });
}
export function bsHasLadder(move) {
  return Array.isArray(move?.perSet) && move.perSet.length > 0;
}
// A set past the end of the ladder repeats its LAST set: that is what "one more"
// means after a 60/70/80 pyramid, and the member's own added set is the only way to
// get there (the coach's ladder always covers every prescribed set).
// ⚠ SO ADDING A SET NEEDS NO CHANGE TO THE LADDER — this clamp IS the rule. Growing
// the list on add appended exactly the entry the clamp already reads, and a mutation
// deleting it changed nothing, so it went: a second copy of a rule is where they drift.
function bsLadderEntry(move, setIdx) {
  if (!bsHasLadder(move)) return null;
  const e = move.perSet[Math.min(Math.max(0, setIdx), move.perSet.length - 1)];
  return e && typeof e === 'object' ? e : {};
}
// What a set's boxes start with: its own reps and weight on a ladder, the move's
// otherwise. The weight never carries the RPE (see bsLoadPrefill).
export function bsSetPrefill(move, setIdx) {
  const e = bsLadderEntry(move, setIdx);
  if (!e) return { reps: String(move?.reps || ''), load: bsLoadPrefill(move) };
  return { reps: String(e.reps ?? ''), load: bsLoadPrefill({ l: e.load }) };
}
// What a logged set records as its plan: the set's own reps and weight on a ladder,
// with the move's target RPE beside the weight exactly as the move's label carries
// it ("70 kg · RPE 8"), so the plan a coach reads back is the one they wrote.
export function bsSetPlan(move, setIdx) {
  const e = bsLadderEntry(move, setIdx);
  if (!e) return { reps: move?.reps, load: move?.l };
  const rpe = (String(move.l ?? '').match(/RPE\s*\d+(?:\.\d+)?/i) || [])[0] || '';
  return { reps: String(e.reps ?? ''), load: [String(e.load ?? ''), rpe].filter(Boolean).join(' · ') };
}
// The ladder after the member removes set `setIdx`. ⚠ THE ENTRY GOES WITH THE SET.
// The player shifts every later set's inputs and logs down one index; a ladder left
// as it was would then hand set 3's weight to the set that used to be set 4, and a
// logged set would record another set's plan.
export function bsLadderRemoveSet(move, setIdx) {
  if (!bsHasLadder(move)) return move?.perSet;
  const n = Math.max(1, Number(move.sets) || 1);
  if (n <= 1) return move.perSet;
  const list = Array.from({ length: n }, (_, i) => ({ ...bsLadderEntry(move, i) }));
  list.splice(setIdx, 1);
  return list;
}
// Total prescribed reps for a move: each set's own on a ladder, sets × reps from the
// scheme otherwise. ⚠ ONE RULE FOR WHAT A REP COUNT IS, in both branches: a number,
// or the low end of a range ("8-10" is 8, as the scheme line always read it). A hold
// or a distance is not a count, so "3 × 30s" adds no reps — the scheme parse had
// counted it as 90, the same defect the ladder branch was written not to have.
const bsRepCount = (text) => {
  const m = /^(\d+)(?:\s*[–-]\s*\d+)?(?:\s*reps?)?$/i.exec(String(text ?? '').trim());
  return m ? Number(m[1]) : 0;
};
// The scheme line's count, refused when a hold or a distance follows the number. The
// suffix is the outline parser's own rule (BS_TIME_DISTANCE_SUFFIX), and a range before
// it runs over the parser's own reps characters ([\d–-]), so a value the parser keeps
// whole ("30s", "1.5 km", "30-45s") is one this total declines to count. ⚠ Two changes
// from the list this line carried before, both for that reason. The decimal part:
// "3 × 1.5 km" counted as 3 reps, which only matched a parser that had read "1" and a
// load of ".5 km". And a range whose far end carries the unit: "3 × 30-45s" counted as
// 90 reps, while the ladder path below already reads a set of "30-45s" as no count
// (bsRepCount, above). A range with no unit still counts its low end, as it always has.
// The class takes digits as well, so a shorter match of the number ("3" of "30s") is
// refused by the same unit and cannot be counted in its place.
const BS_SCHEME_REPS = new RegExp(String.raw`(\d+)\s*×\s*(\d+)(?![\d–-]*${BS_TIME_DISTANCE_SUFFIX}\b)`, 'i');
export function bsMoveTotalReps(move) {
  if (bsHasLadder(move)) {
    const n = Math.max(1, Number(move.sets) || move.perSet.length);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += bsRepCount(bsLadderEntry(move, i).reps);
    return sum;
  }
  const repMatch = String(move?.s).match(BS_SCHEME_REPS);
  return repMatch ? Number(repMatch[1]) * Number(repMatch[2]) : 0;
}
// A rep value that is a hold or a distance by the same rule: a number, or the parser's
// own range characters, with a unit from its list after it that ends the value ("30 s",
// "1.5 km", "30-45s"). The player's "Log set · N reps" button names a COUNT, so it
// leaves one of these out rather than print "30 s reps" (and, in Russian, a plural of
// a value that is not a number).
const BS_TIMED_REPS = new RegExp(String.raw`^\d[\d–-]*${BS_TIME_DISTANCE_SUFFIX}$`, 'i');
export function bsIsTimedReps(value) {
  return BS_TIMED_REPS.test(String(value ?? '').trim());
}
// Two moves are one superset when their keys match under the document's own
// rule. ⚠ NAVIGATION AND REST MUST ASK THE SAME QUESTION: this compared a
// TRIMMED key while the player's rest decision compared the RAW one, so 'A' and
// 'A ' jumped the member to the partner and then made them sit a full rest.
// A move's superset key under that same rule — '' when it has none. The player's
// "Superset · A" badge reads this too, so the badge can never name a pair the
// player does not run: a whitespace key printed "Superset ·" over a move with no
// partner, and a legacy "a " printed verbatim.
export function bsGroupKey(move) {
  return supersetKey(move && move.group);
}
export function bsSameGroup(a, b) {
  const x = bsGroupKey(a);
  return !!x && x === bsGroupKey(b);
}
export function bsNextSessionMove(moves, completed, from) {
  const pending = i => Array.from({ length: moves[i].sets }).some((_, n) => !completed[`${i}-${n}`]);
  if (bsGroupKey(moves[from])) {
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
  const plan = bsSetPlan(move, setIndex);
  return {
    key: `${moveIndex}-${setIndex}`, moveIndex, moveName: move.m, setNumber: setIndex + 1,
    targetReps: plan.reps, targetLoad: plan.load, actualReps: reps ? Number(reps[1]) : null,
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
