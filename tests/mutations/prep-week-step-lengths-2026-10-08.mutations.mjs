// Mutation spec for the demo meal plan's authored step lengths (Prep the week).
// Each mutation breaks one rule; every one must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/prep-week-step-lengths-2026-10-08.mutations.mjs --fail-on-skipped
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const HELPER = 'const bsTimedStep = (t, min, station) => ({ t, min, passive: false, station });';
const ROAST = "bsTimedStep('Roast 25 minutes on a single uncrowded layer, turning once, until the edges caramelise and a fork slides in with no resistance.', 25, 'oven')";
const OATS = "bsTimedStep('Simmer 5 minutes, stirring now and then, until the oats hold a spoon-trail and the liquid has thickened around them rather than pooling.', 5, 'stove')";

export default {
  test: 'node --test tests/prep-week-step-lengths.test.mjs',
  timeoutMs: 120_000,
  mutations: [
    { name: 'a timed step becomes a hands-off window', file: CLIENT, find: HELPER, replace: HELPER.replace('passive: false', 'passive: true') },
    { name: 'a timed step loses its minutes', file: CLIENT, find: HELPER, replace: HELPER.replace('({ t, min, passive', '({ t, passive') },
    { name: 'a timed step loses its station', file: CLIENT, find: HELPER, replace: HELPER.replace(', station });', ' });') },
    { name: 'the roast carries minutes its text does not state', file: CLIENT, find: ROAST, replace: ROAST.replace(", 25, 'oven')", ", 20, 'oven')") },
    { name: 'the roast names a station that does not exist', file: CLIENT, find: ROAST, replace: ROAST.replace("'oven')", "'grill')") },
    { name: 'the oats simmer goes back to the planner\'s 3 minutes', file: CLIENT, find: OATS,
      replace: "'Simmer 5 minutes, stirring now and then, until the oats hold a spoon-trail and the liquid has thickened around them rather than pooling.'" },
    // Per side (Codex, on the first head): a step timed per side takes both sides.
    { name: 'today\'s lunch sear counts one side', file: CLIENT,
      find: "sear 4 min/side over medium-high, to 74°C / 165°F at the thickest point.', 8, 'stove')", replace: "sear 4 min/side over medium-high, to 74°C / 165°F at the thickest point.', 4, 'stove')" },
    { name: 'the steak\'s 3-minutes-a-side sear goes back to the planner\'s 3', file: CLIENT,
      find: "bsTimedStep('Get the pan almost smoking, then sear the steak 3 minutes a side without moving it, until a dark crust forms and it releases on its own.', 6, 'stove')",
      replace: "'Get the pan almost smoking, then sear the steak 3 minutes a side without moving it, until a dark crust forms and it releases on its own.'" },
  ],
};
