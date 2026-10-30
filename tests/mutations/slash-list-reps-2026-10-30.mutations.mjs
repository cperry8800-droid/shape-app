// Mutation spec for a slash list of bare counts as the reps (#2152's open item): the player's
// bsAssignExercise and the builder's rowFromBlock. Every mutation must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/slash-list-reps-2026-10-30.mutations.mjs --fail-on-skipped
const P = 'mobile-app/src/services/planOutline.mjs', W = 'public/newdesign/workoutDocument.js';
export default {
  test: 'node --test tests/per-set-ladder.test.mjs tests/unit-rule-readers.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    { name: 'the player ignores the list', file: P, find: "bsTextRepLadder(tail) || list || bsPlainScheme(tail)", replace: "bsTextRepLadder(tail) || bsPlainScheme(tail)" },
    { name: 'the player takes a list before a weight unit', file: P, find: "(?![\\w\\/.%–-]|\\s*(?:%|kg\\b|lbs?\\b))/);\n  const sx", replace: "(?![\\w\\/.%–-])/);\n  const sx" },
    { name: 'the player takes a list run into a unit', file: P, find: "(?![\\w\\/.%–-]|\\s*(?:%|kg\\b|lbs?\\b))/);\n  const sx", replace: "(?![\\/.%–-]|\\s*(?:%|kg\\b|lbs?\\b))/);\n  const sx" },
    { name: 'the builder ignores the list', file: W, find: "((?:${REP_LIST}|\\d+", replace: "((?:\\d+" },
    { name: 'the builder takes a list run into a unit', file: W, find: "(?:\\/\\d+(?:[–-]\\d+)?)+(?![\\w\\/.%–-]|\\s*(?:%|kg\\b|lbs?\\b))`;", replace: "(?:\\/\\d+(?:[–-]\\d+)?)+(?![\\/.%–-]|\\s*(?:%|kg\\b|lbs?\\b))`;" },
    { name: 'the builder takes a list before a weight unit', file: W, find: "(?:\\/\\d+(?:[–-]\\d+)?)+(?![\\w\\/.%–-]|\\s*(?:%|kg\\b|lbs?\\b))`;", replace: "(?:\\/\\d+(?:[–-]\\d+)?)+(?![\\w\\/.%–-])`;" },
    { name: 'the player takes a list before a spaced time or distance unit', file: P, find: "|(?:${BS_TIME_DISTANCE_UNITS})\\b))`, 'i');", replace: "))`, 'i');" },
    { name: 'the builder takes a list before a spaced time or distance unit', file: W, find: "|(?:${TIME_DISTANCE_UNITS})\\b))`;", replace: "))`;" },
  ],
};
