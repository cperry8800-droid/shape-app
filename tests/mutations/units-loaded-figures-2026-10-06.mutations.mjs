// Mutation spec for the profile's strength ridge, its feed's PR and workout lines
// and the goal page's 7d volume following Settings → Units. Each mutation breaks one clause;
// every one must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/units-loaded-figures-2026-10-06.mutations.mjs --fail-on-skipped
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';

export default {
  test: 'node --test tests/units-loaded-figures.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── the profile's strength ridge ──
    { name: 'the ridge prints the PR as stored', file: CLIENT,
      find: "        const bestIn = tTheme.uMeasure(Number(pr.best), pr.unit || 'lb');",
      replace: '        const bestIn = { value: pr.best, unit: pr.unit };' },
    { name: 'the ridge keeps the stored unit beside a converted figure', file: CLIENT,
      find: "        const unit = bestIn.unit || pr.unit || 'lb';",
      replace: "        const unit = pr.unit || 'lb';" },
    { name: 'the ridge target is taken from the stored figure', file: CLIENT,
      find: '        const tg = Math.round(bestN * 1.1);',
      replace: '        const tg = Math.round(pr.best * 1.1);' },
    // ── the member's own profile feed: PR lines and logged workouts ──
    { name: 'every feed line is shown as built', file: CLIENT,
      find: "      body: tTheme.uText(it.b || ''),",
      replace: "      body: it.b || ''," },
    { name: 'only a PR line converts, not a workout\'s', file: CLIENT,
      find: "      body: tTheme.uText(it.b || ''),",
      replace: "      body: it.hot ? tTheme.uText(it.b || '') : (it.b || '')," },
    { name: 'a workout\'s distance label is kept as built', file: CLIENT,
      find: '[[bsProfileDistLabel(tTheme, it.distKm) || it.metric[0], it.metric[1]]]',
      replace: '[[it.metric[0], it.metric[1]]]' },
    { name: 'the raw kilometres never leave the effect', file: CLIENT,
      find: "metric, distKm, time: ago(a.started_at)",
      replace: "metric, time: ago(a.started_at)" },
    { name: 'the distance label ignores the setting', file: CLIENT,
      find: "  const m = t.uMeasure(Math.round(n * 10) / 10, 'km');",
      replace: "  const m = { value: Math.round(n * 10) / 10, unit: 'km' };" },
    { name: 'miles keep the kilometre label', file: CLIENT,
      find: "  return m.unit === 'mi' ? `${m.value} mi` : `${m.value}K`;",
      replace: '  return `${m.value}K`;' },
    // ── the goal page's 7d volume ──
    { name: 'the volume is converted in the effect, freezing its unit', file: CLIENT,
      find: "v: '—', volLb: vol7, sub: tr('goal:week.volumeSub'",
      replace: "v: bsGoalVolume(t, vol7), sub: tr('goal:week.volumeSub'" },
    { name: 'the contract is handed the unconverted rows', file: CLIENT,
      find: 'plans={livePlans} weekTargets={liveWeekIn} train={liveTrain} />',
      replace: 'plans={livePlans} weekTargets={liveWeek} train={liveTrain} />' },
    { name: 'the volume ignores the setting', file: CLIENT,
      find: "  const m = t.uMeasure(n, 'lb');\n  return `${(Number(m.value) / 1000).toFixed(1)}k ${m.unit || 'lb'}`;",
      replace: "  const m = { value: n, unit: 'lb' };\n  return `${(Number(m.value) / 1000).toFixed(1)}k ${m.unit || 'lb'}`;" },
    { name: 'the volume drops its unit', file: CLIENT,
      find: "  return `${(Number(m.value) / 1000).toFixed(1)}k ${m.unit || 'lb'}`;",
      replace: '  return `${(Number(m.value) / 1000).toFixed(1)}k`;' },
    { name: 'no volume reads "0.0k"', file: CLIENT,
      find: "  if (!n) return '—';\n  const m = t.uMeasure(n, 'lb');",
      replace: "  const m = t.uMeasure(n, 'lb');" },
  ],
};
