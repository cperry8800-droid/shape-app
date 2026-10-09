// Mutation spec for the sale-plan preview reduction (the open half of C2, 2026-10-09): the SQL
// rule's JavaScript mirror, the preview's reading of the reduced shape, and the migration's
// text. tests/plan-preview.test.mjs must notice every one. The Postgres half (the function's
// output on the fixtures) is not mutated here: the runner does not run Postgres, and the
// replica comparison recorded in the PR is its test.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/sale-plan-preview-menus-2026-10-09.mutations.mjs --fail-on-skipped
const PREVIEW = 'mobile-app/src/services/planPreview.mjs';
const MIG = 'supabase-migrations/2026-10-09-sale-plan-preview-menus.sql';

export default {
  test: 'node --test tests/plan-preview.test.mjs tests/plan-week.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── the mirror: what the server hands out ──
    { name: 'the mirror keeps every meal of the sample day', file: PREVIEW,
      find: "first2: meals.slice(0, BS_PREVIEW_FREE_UNITS) });",
      replace: "first2: meals });" },
    { name: 'the mirror keeps the default menu whatever day is the sample', file: PREVIEW,
      find: "  out.blocks = sample && !sample.authored ? sample.first2 : [];",
      replace: "  out.blocks = sample ? resolved[0].first2 : [];" },
    { name: 'the mirror keeps every authored day\'s first two meals', file: PREVIEW,
      find: "blocks: sample && sample.dow === d.dow ? d.first2 : [] }));",
      replace: "blocks: d.first2 }));" },
    { name: 'the mirror counts by delivery\'s rule instead of the preview\'s', file: PREVIEW,
      find: "    const meals = list.filter((b) => blockText(b));",
      replace: "    const meals = list.filter((b) => deliveredText(b));" },
    { name: 'the mirror decides perDay by the preview\'s rule instead of delivery\'s', file: PREVIEW,
      find: "key: list.map(deliveredText).filter(Boolean).join('\\u001f')",
      replace: "key: list.map(blockText).filter(Boolean).join('\\u001f')" },
    { name: 'the mirror scans every entry of days, not the first seven', file: PREVIEW,
      find: "  for (const e of (Array.isArray(detail.days) ? detail.days : []).slice(0, DAYS_SCAN)) {",
      replace: "  for (const e of (Array.isArray(detail.days) ? detail.days : [])) {" },
    { name: 'the mirror lets a later duplicate dow win', file: PREVIEW,
      find: "    if (byDow.has(e.dow)) continue;\n    byDow.set(e.dow, e);",
      replace: "    byDow.set(e.dow, e);" },
    { name: 'the mirror leaves builder in', file: PREVIEW,
      find: "  const out = { ...detail };\n  delete out.builder;",
      replace: "  const out = { ...detail };" },
    { name: 'the mirror reduces a program too', file: PREVIEW,
      find: "  if (kind !== 'meal_plan') return out;\n",
      replace: "" },
    // ── the preview's reading of the reduced shape ──
    { name: 'a uniform week counts the whole week', file: PREVIEW,
      find: "  const total = perDay ? days.reduce((n, d) => n + d.count, 0) : days[0].count;",
      replace: "  const total = days.reduce((n, d) => n + d.count, 0);" },
    { name: 'an inherited day counts nothing', file: PREVIEW,
      find: "    : { label, count: defaultCount, kept: defaultKept }));",
      replace: "    : { label, count: 0, kept: defaultKept }));" },
    { name: 'a count is not capped', file: PREVIEW,
      find: "  const countOf = (v) => Math.min(BLOCK_SCAN, Math.max(0, Math.floor(Number(v) || 0)));",
      replace: "  const countOf = (v) => Math.max(0, Math.floor(Number(v) || 0));" },
    { name: 'the locked total is the constant, not what was shown', file: PREVIEW,
      find: "  return { ...model, weeks: base.weeks, sessionsPerWeek: null, units, free, locked: Math.max(0, total - free.length), note: base.note, media: base.media };",
      replace: "  return { ...model, weeks: base.weeks, sessionsPerWeek: null, units, free, locked: Math.max(0, total - BS_PREVIEW_FREE_UNITS), note: base.note, media: base.media };" },
    { name: 'the reduced path runs for a program preview too', file: PREVIEW,
      find: "  if (isNutri && detail.preview === true) return reducedMenuPreview(detail, { weeks, note, media });",
      replace: "  if (detail.preview === true) return reducedMenuPreview(detail, { weeks, note, media });" },
    // ── the migration's text ──
    { name: 'one public function keeps the old shape', file: MIG,
      find: "    public.sale_plan_preview_detail(cp.kind, cp.detail) as detail\n  from coach_plans cp\n  where cp.owner_id = p_user_id",
      replace: "    (cp.detail - 'builder') as detail\n  from coach_plans cp\n  where cp.owner_id = p_user_id" },
    { name: 'the helper is executable by anon', file: MIG,
      find: "revoke all on function public.sale_plan_preview_detail(text, jsonb) from anon;\n",
      replace: "" },
    { name: 'the default keeps its text whatever day is the sample', file: MIG,
      find: "  if v_sample is not null and v_authored[v_sample] is null then\n    v_blocks := v_first2[v_sample];",
      replace: "  if v_sample is not null then\n    v_blocks := v_first2[1];" },
  ],
};
