// Mutation spec for the train and progress APIs adding loads in pounds whatever
// unit each set was logged in. Each mutation breaks one clause; every one must be
// killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/set-load-units-2026-10-06.mutations.mjs --fail-on-skipped
const LIB = 'src/lib/set-load.ts';
const TRAIN = 'src/app/api/client/train/route.ts';
const PROG = 'src/app/api/client/progress/route.ts';

export default {
  test: 'node --test tests/set-load-units.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    { name: 'a kilogram set is added as pounds', file: LIB,
      find: "  return setLoadUnit(unit) === 'kg' ? load / KG_PER_LB : load;",
      replace: '  return load;' },
    { name: 'kilograms are converted the wrong way', file: LIB,
      find: "  return setLoadUnit(unit) === 'kg' ? load / KG_PER_LB : load;",
      replace: "  return setLoadUnit(unit) === 'kg' ? load * KG_PER_LB : load;" },
    { name: 'a "KG" unit is read as pounds', file: LIB,
      find: "String(unit ?? 'lb').toLowerCase().includes('kg')",
      replace: "String(unit ?? 'lb').includes('kg')" },
    { name: 'the train volume sums the typed loads', file: TRAIN,
      find: '      const vol = setLoadLb(load, r.load_unit) * reps;',
      replace: '      const vol = load * reps;' },
    { name: 'the train route never reads the unit', file: TRAIN,
      find: "    .select('actual_load, actual_reps, rpe, completed, created_at, payload, load_unit')",
      replace: "    .select('actual_load, actual_reps, rpe, completed, created_at, payload')" },
    { name: 'a session\'s best is compared on typed loads', file: TRAIN,
      find: '      const loadLb = setLoadLb(load, r.load_unit);',
      replace: '      const loadLb = load;' },
    { name: 'a session\'s best names no unit', file: TRAIN,
      find: '`${r.actual_load} ${setLoadUnit(r.load_unit)}`',
      replace: 'String(r.actual_load)' },
    { name: 'a windowed PR is compared on typed loads', file: PROG,
      find: '    const lb = setLoadLb(load, r.load_unit);',
      replace: '    const lb = load;' },
    { name: 'a windowed PR is reported in pounds whatever its set\'s unit', file: PROG,
      find: '        unit: setLoadUnit(r.load_unit),\n        bestAt: r.created_at,',
      replace: "        unit: 'lb',\n        bestAt: r.created_at," },
    { name: 'a heavier set keeps the first set\'s unit', file: PROG,
      find: '      pr.unit = setLoadUnit(r.load_unit);\n',
      replace: '' },
    { name: 'the PRs are ordered by the typed number', file: PROG,
      find: '    .sort((a, b) => b.lb - a.lb)',
      replace: '    .sort((a, b) => b.best - a.best)' },
    { name: 'the RPC\'s rows are relabelled pounds', file: PROG,
      find: "          unit: String(r.unit ?? 'lb'),",
      replace: "          unit: 'lb'," },
    { name: 'the strength series takes the typed top', file: PROG,
      find: '    const load = setLoadLb(typed, r.load_unit);\n    const week = new Date(r.created_at);',
      replace: '    const load = typed;\n    const week = new Date(r.created_at);' },
  ],
};
