// Mutation spec for Prep the week's hands-off steps and a coach plan's attended step lengths.
// Each mutation breaks one rule; every one must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/prep-week-holds-coach-step-lengths-2026-10-08.mutations.mjs --fail-on-skipped
//
// The demo holds answer to the catalog's own window rules (tests/shape-kitchen-data.test.mjs,
// which reads them through tests/helpers/demo-meal-plan.mjs), so most of the client mutations
// here are a demo step written the way a catalog window was once wrong, and the kill is the
// catalog's rule.
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const PROS = 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx';
const COOKABLE = 'mobile-app/src/services/cookable.mjs';
const READER = 'tests/helpers/demo-meal-plan.mjs';

const HOLD = 'const bsHoldStep = (t, min, station) => ({ t, min, passive: true, station });';
const BEEF_ROAST = "bsHoldStep('Roast 15 minutes on a single uncrowded layer, until the undersides colour.', 15, 'oven'),";
const BEEF_TURN = "bsHoldStep('Turn the cubes and roast 10 minutes more, until the edges caramelise and a fork slides in with no resistance.', 10, 'oven'),";
const BEEF_PAN = "'Get a heavy pan properly hot, add the beef in one layer and leave it alone so it browns rather than stews in its own liquid.',";
const RICE = "bsHoldStep('Cook the rice 1 part to 1 and a half parts salted water, covered, 12 minutes on the lowest heat.', 12, 'stove'),";
const LID_RICE = "bsHoldStep('Bring to a boil, cover, drop to the lowest heat and leave it 12 minutes — do not lift the lid, the trapped steam is doing the cooking.', 12, 'stove'),";
const THIGHS = "bsHoldStep('Roast skin-side up 35 minutes, undisturbed, until the skin is deep gold";
const STEAK_REST = "bsTimedStep('Rest it 5 minutes on a board. Cut it straight off the heat and the juice runs out onto the board instead of staying in the meat.', 5, 'off')";
const SALMON_SEAR = "bsTimedStep('Sear undisturbed 4 minutes, until the skin releases from the pan on its own and the flesh has turned opaque about a third of the way up the fillet.', 4, 'stove')";
const TRAY_END = `            bsHoldStep('Turn them and roast 10 minutes more, until the edges brown and the thickest pieces give under a fork.', 10, 'oven'),
            'Tip them onto the plate while hot and crumble the feta over so it softens against the heat. Scatter the olives.',
            'Toast the bread and serve alongside, for scooping up whatever is left on the plate.',`;

const ATTENDED = "  return { t, min: Math.round(worked / 60), passive: false, ...(st ? { station: st } : {}) };";
const PER_SIDE = '  const worked = time.perSide ? time.seconds * 2 : time.seconds;';
const RANGE = '  const seconds = low && high > 0 ? Math.min(span.seconds, (span.seconds / high) * Number(low[1])) : span.seconds;';
const NOT_WORK = '  if (BS_AUTHOR_NOT_WORK_RE.test(t)) return { t };';
const FLOOR = '  if (worked < BS_AUTHOR_MIN_PASSIVE * 60) return { t };';
const ON_SIDE = 'const BS_AUTHOR_PER_SIDE_RE = /^\\s+(?:on\\s+)?(?:a|each|per)\\s+side\\b/i;';
const TERMINAL = '    c.stepMeta[c.steps.length - 1] = { ...lastMeta, passive: false };';
const EDITOR = "ds[li] = { ...ds[li], passive: false };";
const WINDOW = '  if (st && !time.perSide && time.seconds >= BS_AUTHOR_MIN_PASSIVE * 60) return { t, min: Math.round(time.seconds / 60), passive: true, station: st };';
const HINT = 'const perSide = wantsWin && bsStepPerSide(s.t) && derived && derived.min;';
const PER_SIDE_EXPORT = '  return !!(time && time.perSide);';
const DE = 'mobile-app/src/i18n/catalogs/de/coach.json';

export default {
  test: 'node --test tests/prep-week-step-lengths.test.mjs tests/shape-kitchen-data.test.mjs tests/coach-step-lengths.test.mjs tests/cookable.test.mjs tests/broadsheet-render.test.mjs tests/i18n-catalog-complete.test.mjs',
  timeoutMs: 180_000,
  mutations: [
    // ── The demo plan's holds ───────────────────────────────────────────────────────────────
    { name: 'a hold is attended after all', file: CLIENT, find: HOLD, replace: HOLD.replace('passive: true', 'passive: false') },
    { name: 'a hold loses its station', file: CLIENT, find: HOLD, replace: HOLD.replace(', station });', ' });') },
    { name: 'the beef bowl\'s roast goes back to one attended step', file: CLIENT, find: `${BEEF_ROAST}\n            ${BEEF_TURN}`,
      replace: "bsTimedStep('Roast 25 minutes on a single uncrowded layer, turning once, until the edges caramelise and a fork slides in with no resistance.', 25, 'oven')," },
    { name: 'a hold asks the cook to turn the tray during it (the attended-gerund rule)', file: CLIENT, find: BEEF_ROAST,
      replace: BEEF_ROAST.replace('layer, until', 'layer, turning once, until') },
    { name: 'the step after a hold opens "Meanwhile" (the concurrent-step rule)', file: CLIENT, find: BEEF_PAN,
      replace: BEEF_PAN.replace("'Get a heavy", "'Meanwhile get a heavy") },
    { name: 'a hold hides an instruction behind its timer', file: CLIENT, find: STEAK_REST, replace: STEAK_REST.replace('bsTimedStep(', 'bsHoldStep(') },
    { name: 'a hold is an attended sear (the method rule)', file: CLIENT, find: SALMON_SEAR, replace: SALMON_SEAR.replace('bsTimedStep(', 'bsHoldStep(') },
    { name: 'a hold sits on time the recipe gave the cook (the cook-busy rule)', file: CLIENT, find: THIGHS,
      replace: THIGHS.replace('35 minutes, undisturbed,', '35 minutes while you dress the greens,') },
    { name: 'a ranged hold is its top, not its low end', file: CLIENT, find: LID_RICE, replace: LID_RICE.replace('leave it 12 minutes', 'leave it 10 to 12 minutes') },
    { name: 'a stove hold sits on uncovered aromatics', file: CLIENT, find: RICE,
      replace: "bsHoldStep('Cook the rice with a sliced scallion in 1 part to 1 and a half parts salted water, 12 minutes on the lowest heat.', 12, 'stove')," },
    { name: 'a dish ends on an oven hold (the terminal rule)', file: CLIENT, find: TRAY_END, replace: TRAY_END.split('\n')[0] },
    { name: 'the rice hold carries minutes its text does not state', file: CLIENT, find: RICE, replace: RICE.replace(", 12, 'stove')", ", 15, 'stove')") },
    { name: 'the reader hands the window rules no demo meals', file: READER,
      find: 'export const DEMO_MEAL_RECIPES = DEMO_MEALS.map(', replace: 'export const DEMO_MEAL_RECIPES = [].map(' },
    { name: 'the reader reads every hold as attended', file: READER,
      find: "meta: { min: Number(call[4]), passive: call[1] === 'bsHoldStep', station: call[5] },",
      replace: "meta: { min: Number(call[4]), passive: false, station: call[5] }," },
    // ── A coach plan's attended step lengths ─────────────────────────────────────────────────
    { name: 'a coach\'s hands-on step goes back to bare text', file: COOKABLE, find: FLOOR, replace: '  if (worked >= 0) return { t };' },
    { name: 'a coach\'s hands-on step becomes a window', file: COOKABLE, find: ATTENDED, replace: ATTENDED.replace('passive: false', 'passive: true') },
    { name: 'a coach\'s attended step drops the station they picked', file: COOKABLE, find: ATTENDED, replace: "  return { t, min: Math.round(worked / 60), passive: false };" },
    { name: 'per side counts one side', file: COOKABLE, find: PER_SIDE, replace: '  const worked = time.seconds;' },
    { name: '"on each side" is not read as per side', file: COOKABLE, find: ON_SIDE, replace: ON_SIDE.replace('(?:on\\s+)?', '') },
    { name: 'a range is its top', file: COOKABLE, find: RANGE, replace: '  const seconds = span.seconds;' },
    { name: 'a storage time counts as work', file: COOKABLE, find: NOT_WORK, replace: '' },
    { name: 'the attended floor rounds 3.5 minutes up to 4', file: COOKABLE, find: FLOOR, replace: '  if (Math.round(worked / 60) < BS_AUTHOR_MIN_PASSIVE) return { t };' },
    { name: 'a coach\'s last oven window drops its minutes at ingestion', file: COOKABLE, find: TERMINAL, replace: '    c.stepMeta[c.steps.length - 1] = plainStepMeta();' },
    { name: 'a coach\'s last oven window drops its minutes at publish', file: PROS, find: EDITOR, replace: 'ds[li] = { t: ds[li].t };' },
    // ── A coach's hands-off pick on a per-side or ranged step ─────────────────────────────────
    { name: 'a hands-off pick on a per-side step is a window again', file: COOKABLE, find: WINDOW, replace: WINDOW.replace('!time.perSide && ', '') },
    { name: 'a hands-off window takes the top of its range', file: COOKABLE, find: WINDOW,
      replace: WINDOW.replace('time.seconds >= BS_AUTHOR_MIN_PASSIVE * 60) return { t, min: Math.round(time.seconds / 60)', 'bsStepTimers(t)[0].seconds >= BS_AUTHOR_MIN_PASSIVE * 60) return { t, min: Math.round(bsStepTimers(t)[0].seconds / 60)') },
    { name: 'the editor\'s per-side hint never shows', file: PROS, find: HINT, replace: 'const perSide = false;' },
    { name: 'the editor shows the per-side hint on every hint', file: PROS, find: HINT, replace: 'const perSide = wantsWin;' },
    { name: 'bsStepPerSide never says per side', file: COOKABLE, find: PER_SIDE_EXPORT, replace: '  return false;' },
    { name: 'the German catalog lacks the per-side hint', file: DE, find: '  "editor.windowPerSide": ', replace: '  "editor.windowPerSideX": ' },
  ],
};
