// Mutation spec for the app's Progress page, profile trajectory and Home widgets
// following Settings → Units. Each mutation breaks one clause; every one must be
// killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/app-units-everywhere-2026-10-06.mutations.mjs --fail-on-skipped
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const WIDGETS = 'mobile-app/src/broadsheet/iosAppBroadsheetWidgets.jsx';
const NORA = 'src/lib/ai/actions.mjs';

export default {
  test: 'node --test tests/units-everywhere.test.mjs tests/units-weight-canonical.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── the Progress page ──
    { name: 'a Progress weight is shown as stored', file: CLIENT,
      find: '  const m = t.uMeasure(v, unit);\n  const n = Number(m.value);',
      replace: '  const m = { value: v, unit };\n  const n = Number(m.value);' },
    { name: 'a pound figure keeps its decimals', file: CLIENT,
      find: "return { n: m.unit === 'lb' ? Math.round(n) : n, unit: m.unit || unit };",
      replace: "return { n, unit: m.unit || unit };" },
    { name: 'volume is printed in pounds whatever the setting', file: CLIENT,
      find: "const kVol = (lb) => { const m = wt(Number(lb) || 0); return `${(m.n / 1000).toFixed(1)}k ${m.unit}`; };",
      replace: "const kVol = (lb) => `${((Number(lb) || 0) / 1000).toFixed(1)}k lb`;" },
    { name: 'the bodyweight change is printed in pounds', file: CLIENT,
      find: "const m = wt(v); return (m.n > 0 ? '+' : m.n < 0 ? '−' : '') + Math.abs(m.n) + ' ' + m.unit; };",
      replace: "return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v)) + ' lb'; };" },
    { name: 'the latest bodyweight is printed in pounds', file: CLIENT,
      find: '`Now ${wt(kpis.weightLatest).n} ${wt(kpis.weightLatest).unit}`',
      replace: '`Now ${Math.round(kpis.weightLatest)} lb`' },
    { name: 'a PR\'s previous best is shown as stored', file: CLIENT,
      find: 'was {wt(p.prev, p.unit || null).n}{wt(p.prev, p.unit || null).unit}',
      replace: 'was {p.prev}{p.unit}' },
    // ── the profile trajectory ──
    { name: 'the trajectory change stays in pounds', file: CLIENT,
      find: "const trajDeltaIn = tTheme.uMeasure((trajEff[trajEff.length - 1] - trajEff[0]) || 0, 'lb');",
      replace: "const trajDeltaIn = { value: (trajEff[trajEff.length - 1] - trajEff[0]) || 0, unit: 'lb' };" },
    { name: 'the trajectory is labelled pounds', file: CLIENT,
      find: "bsTHexA(INK, 0.55) }}>{trajDeltaIn.unit || 'lb'}</span>",
      replace: "bsTHexA(INK, 0.55) }}>lb</span>" },
    // ── the Home widgets ──
    { name: 'a widget ignores the theme\'s converter', file: WIDGETS,
      find: "const m = (t && typeof t.uMeasure === 'function') ? t.uMeasure(value, unit) : { value, unit };",
      replace: "const m = { value, unit };" },
    { name: 'the weight widget\'s figure is shown as written', file: WIDGETS,
      find: "const curIn = wUnit(t, cur, 'lb'), deltaIn",
      replace: "const curIn = { value: cur, unit: 'lb' }, deltaIn" },
    { name: 'the weight widget\'s change is shown as written', file: WIDGETS,
      find: "deltaIn = wUnit(t, delta, 'lb');",
      replace: "deltaIn = { value: delta, unit: 'lb' };" },
    { name: 'a PR widget figure is shown as written', file: WIDGETS,
      find: "{wUnit(t, Number(p.val), 'lb').value}</div>",
      replace: "{p.val}</div>" },
    { name: 'the body-comp cells are left in pounds', file: WIDGETS,
      find: "    if (c.unit !== 'lb') return c;\n",
      replace: "    return c;\n" },
    { name: 'a body-comp change is shown as written', file: WIDGETS,
      find: "return { ...c, v: String(v.value), unit: v.unit, d: wSigned(d.value) };",
      replace: "return { ...c, v: String(v.value), unit: v.unit };" },
    { name: 'the measurements are left in inches', file: WIDGETS,
      find: "const v = wUnit(t, Number(c.v), 'in'), d = wUnit(t, Number(c.d.replace('−', '-')), 'in');",
      replace: "const v = { value: Number(c.v), unit: 'in' }, d = { value: Number(c.d.replace('−', '-')), unit: 'in' };" },
    { name: 'the measurements are labelled inches', file: WIDGETS,
      find: "fontWeight: 700, marginLeft: 2 }}>{c.unit}</span>",
      replace: "fontWeight: 700, marginLeft: 2 }}>in</span>" },
    // ── Nora's weigh-in (a third writer of the kilogram column) ──
    { name: 'Nora stores the member\'s own unit', file: NORA,
      find: "confirmedPayload: { weight: kg, unit: 'kg' },",
      replace: "confirmedPayload: { weight: weight, unit: unit }," },
    { name: 'Nora\'s undo looks for a row she did not write', file: NORA,
      find: "    var after = { logged_on: today, weight: kg, unit: 'kg' };",
      replace: "    var after = { logged_on: today, weight: weight, unit: unit };" },
    { name: 'Nora stores pounds as kilograms unconverted', file: NORA,
      find: "    var kg = unit === 'lb' ? Math.round(weight * 0.45359237 * 100) / 100 : weight;",
      replace: "    var kg = weight;" },
  ],
};
