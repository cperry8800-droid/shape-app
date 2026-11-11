// Mutation spec for a trainer's added exercises running inside the day's session (Codex P1 on #2686):
// each mutation undoes one guard, and the suites below must fail on every one.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/train-coach-additions-2026-11-11.mutations.mjs --fail-on-skipped
const EX = 'mobile-app/src/broadsheet/BSCoachExercises.jsx';
const PAGE = 'mobile-app/src/broadsheet/BSClientTrain.jsx';
const DAY = 'mobile-app/src/broadsheet/BSTrainDay.jsx';

export default {
  test: 'node --test tests/client-train-module.test.mjs tests/coach-exercises-member.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    { name: 'another day\'s additions run today', file: EX,
      find: '  const added = isToday ? bsCoachExerciseRows(bsCoachExercisesOn(read, date)) : [];',
      replace: '  const added = bsCoachExerciseRows(bsCoachExercisesOn(read, date));' },
    { name: 'the additions run before the program', file: EX,
      find: '  return { rows: added.length ? [...own, ...added] : own, added, restWithWork: !!isRest && added.length > 0 };',
      replace: '  return { rows: added.length ? [...added, ...own] : own, added, restWithWork: !!isRest && added.length > 0 };' },
    { name: 'a rest day with additions stays rest', file: EX,
      find: '  return { rows: added.length ? [...own, ...added] : own, added, restWithWork: !!isRest && added.length > 0 };',
      replace: '  return { rows: added.length ? [...own, ...added] : own, added, restWithWork: false };' },
    { name: 'a planned day reads as rest with work', file: EX,
      find: '  return { rows: added.length ? [...own, ...added] : own, added, restWithWork: !!isRest && added.length > 0 };',
      replace: '  return { rows: added.length ? [...own, ...added] : own, added, restWithWork: added.length > 0 };' },
    { name: 'the additions keep the coach\'s order per coach, not the order added', file: EX,
      find: "  return bsCoachExerciseGroups(read, date).flatMap((g) => g.items).sort((a, b) => String(a.sentAt || '').localeCompare(String(b.sentAt || '')));",
      replace: '  return bsCoachExerciseGroups(read, date).flatMap((g) => g.items);' },
    { name: 'an added move loses its cue', file: EX,
      find: '    ...(e.cue ? { cue: e.cue } : {}),\n    coachAdded: true,',
      replace: '    coachAdded: true,' },
    { name: 'an added move is not marked', file: EX,
      find: '    coachAdded: true,\n    coachExerciseId:',
      replace: '    coachExerciseId:' },
    { name: 'the list in the session still offers Start these', file: EX,
      find: '            {today && inSession ? (',
      replace: '            {false ? (' },
    { name: 'the session runs the program alone', file: PAGE,
      find: 'moves={openSession ? [] : bsSessionMoves(sessionRows)}',
      replace: 'moves={openSession ? [] : bsSessionMoves(effMoves)}' },
    { name: 'a rest day\'s additions write to its workout', file: PAGE,
      find: 'clientWorkoutId={openSession || coachOnlyDay ? null : cur.workoutId}',
      replace: 'clientWorkoutId={openSession ? null : cur.workoutId}' },
    { name: 'a rest day with additions shows Rest', file: PAGE,
      find: 'isRest={isRestDay && !coachOnlyDay}',
      replace: 'isRest={isRestDay}' },
    { name: 'the list reads apart from the session', file: DAY,
      find: '      {p.coachRead\n',
      replace: '      {false\n' },
  ],
};
