// Mutation spec for P6 (2026-11-05), the builders and Nora's drafting: what Nora reads for a client and
// the one other source of a load (the client's own last session, labelled), the daily budget, the
// draft kept beside the template and the change list, the session estimate, Shape Kitchen as the meal
// draft's dishes, training and rest days, the grocery list, the template on an assignment, who is on a
// plan, each client's own training days, the lifecycle as one list, and the app's composer on the same
// cores. Every mutation must be killed.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/p6-builders-nora-2026-11-05.mutations.mjs --fail-on-skipped
const WD = 'src/lib/ai/workoutDraft.mjs';
const DOC = 'public/newdesign/workoutDocument.js';
const DRAFT_ROUTE = 'src/app/api/ai/draft-workout/route.ts';
const GEN = 'src/app/api/ai/generate-plan/route.ts';
const LIMITS = 'src/lib/ai/noraLimits.ts';
const CHAT = 'src/app/api/support/chat/route.ts';
const ACT = 'src/lib/ai/actions.mjs';
const MD = 'src/lib/ai/mealDraft.mjs';
const KF = 'src/lib/kitchenFoods.mjs';
const DM = 'public/newdesign/dashMealCore.js';
const MEAL_ROUTE = 'src/app/api/ai/draft-meal-plan/route.ts';
const ASSIGN = 'src/app/api/nutritionist/meal-plan/route.ts';
const USAGE = 'src/app/api/coach/plans/usage/route.ts';
const TD = 'src/lib/training-days.mjs';
const DMB = 'public/newdesign/dashMealBuilder.jsx';
const DBU = 'public/newdesign/dashBuilder.jsx';
const PROS = 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx';
const SQL = 'supabase-migrations/2026-11-05-plan-template-usage.sql';

export default {
  test: 'node --test tests/p6-nora-drafting.test.mjs tests/p6-kitchen-meals.test.mjs tests/p6-builder-nora-ui.test.mjs tests/p6-app-composer.test.mjs tests/ai-workout-draft.test.mjs tests/ai-meal-draft.test.mjs tests/coach-plan-usage-route.test.mjs tests/library-filters.test.mjs',
  timeoutMs: 400_000,
  mutations: [
    // ── a load never comes from nowhere ──
    { name: 'a load logged in the other unit is used', file: WD,
      find: '  return h && h.unit === unit ? h : null;', replace: '  return h || null;' },
    { name: 'a logged load is used for more reps than they did at it', file: WD,
      find: '  return !!h && want != null && want <= h.reps;', replace: '  return !!h;' },
    { name: 'a load from their log is not labelled', file: WD,
      find: "    return historyFits(h, row) ? { loadType: h.unit, load: h.load, loadFrom: LAST_SESSION } : null;",
      replace: "    return historyFits(h, row) ? { loadType: h.unit, load: h.load } : null;" },
    { name: 'a number the model invented survives', file: WD,
      find: '  // logged load when it fits, else blank. So the model can never put any other number on the bar.\n  return fromLog() || fallback;',
      replace: '  // logged load when it fits, else blank. So the model can never put any other number on the bar.\n  return { loadType: type, load: n };' },
    { name: 'the label is lost when the week is expanded', file: WD,
      find: "              ...(r.loadFrom === LAST_SESSION && Number(r.load) > 0 ? { loadFrom: LAST_SESSION } : {}),\n", replace: '' },
    { name: 'the lines do not say where the load came from', file: WD,
      find: "  const logged = row.loadFrom === LAST_SESSION && Number(row.load) > 0 ? ` (${LAST_SESSION_LABEL})` : '';", replace: "  const logged = '';" },
    // ── what she reads, and what never reaches her ──
    { name: 'the screening is not named in the note', file: WD,
      find: '    notes: draftNotes(raw.notes, b.client),', replace: '    notes: clipText(raw.notes, DRAFT_LIMITS.notesChars),' },
    { name: 'a medication reaches the draft', file: WD,
      find: "    if (h.pregnancy === 'yes') out.push('pregnant or postpartum (screening)');",
      replace: "    if (h.pregnancy === 'yes') out.push('pregnant or postpartum (screening)');\n    if (h.medications) out.push(String(h.medications));" },
    { name: 'a free-text condition tag reaches the draft', file: WD,
      find: '    for (const tag of Array.isArray(h.conditionTags) ? h.conditionTags : []) if (CONDITION_TAGS.includes(tag)) out.push(`${tag.toLowerCase()} (screening)`);',
      replace: '    for (const tag of Array.isArray(h.conditionTags) ? h.conditionTags : []) if (tag) out.push(`${tag.toLowerCase()} (screening)`);' },
    { name: 'a set they did not complete is a working load', file: WD,
      find: '    if (!r || r.completed === false) continue;', replace: '    if (!r) continue;' },
    { name: 'an older session of the move is read too', file: WD,
      find: '    if (cur && cur.date !== day) continue;\n', replace: '' },
    { name: 'the client context is not allowlisted', file: WD,
      find: '    ...(recentLoads.length ? { recentLoads } : {}),\n  };\n}', replace: '    ...(recentLoads.length ? { recentLoads } : {}),\n    ...c,\n  };\n}' },
    { name: 'the injuries the member noted are not read', file: WD,
      find: "  if (noted && !out.some((x) => x.toLowerCase().includes(noted.toLowerCase()))) out.push(`injury: ${noted}`);\n", replace: '' },
    // ── the daily budget ──
    { name: 'draft-workout counts no budget', file: DRAFT_ROUTE,
      find: "  const budget = await countBudget(sb, user.id, 'coach_draft');\n  if (!budget.allowed) {", replace: "  const budget = { allowed: true, resetSeconds: 0 };\n  if (!budget.allowed) {" },
    { name: 'draft-workout spends another budget', file: DRAFT_ROUTE,
      find: "  const budget = await countBudget(sb, user.id, 'coach_draft');", replace: "  const budget = await countBudget(sb, user.id, 'draft_program');" },
    { name: 'draft-workout returns no draft snapshot', file: DRAFT_ROUTE,
      find: '    draft: { name: built.name, buildType: built.buildType, builder: built.builder, snapshot },', replace: '    draft: { name: built.name, buildType: built.buildType, builder: built.builder },' },
    { name: 'words in the brief no longer set weeks and days', file: DRAFT_ROUTE,
      find: "  const said = briefNumbers(typeof body.request === 'string' ? body.request : '');", replace: "  const said = {};" },
    { name: 'generate-plan counts no budget', file: GEN,
      find: "  const budget = await countBudget(sb, user.id, 'coach_draft');\n  if (!budget.allowed) {", replace: "  const budget = { allowed: true, resetSeconds: 0 };\n  if (!budget.allowed) {" },
    { name: 'the coach budget is ten times larger', file: LIMITS,
      find: '  coach_draft: 80,', replace: '  coach_draft: 800,' },
    { name: 'the budget message names no number', file: LIMITS,
      find: "    return `That's today's ${AI_DAILY_BUDGETS.coach_draft} drafts with Nora used up. It resets ${when}; until then, build from blank or copy one of yours.`;",
      replace: "    return `That's today's limit. It resets ${when}.`;" },
    { name: 'Nora\'s chat draft_workout spends nothing', file: CHAT,
      find: "    if (name === 'draft_workout') {\n      const budget = await countBudget(actor.supabase, actor.user.id, 'coach_draft');", replace: "    if (name === 'never') {\n      const budget = await countBudget(actor.supabase, actor.user.id, 'coach_draft');" },
    // ── Nora's draft beside the template, and the change list ──
    { name: 'a change is counted once a week, not once a move', file: DOC,
      find: '      const key = draftMoveKey(id);\n      if (!key) continue;', replace: '      const key = draftMoveKey(id) && id;\n      if (!key) continue;' },
    { name: 'a blank load in the other unit reads as changed', file: DOC,
      find: "      if (f === 'loadType' && was[DRAFT_FIELDS.indexOf('load')] === '' && draftCell(row, 'load') === '') return false;\n", replace: '' },
    { name: 'a row the coach added is not counted', file: DOC,
      find: "    const added = [...now.entries()].filter(([id]) => !Object.prototype.hasOwnProperty.call(snap, id)).map(([, r]) => text(r.name).trim()).filter(Boolean);",
      replace: '    const added = [];' },
    { name: 'a superset\'s first move rests a full rest', file: DOC,
      find: ': pairedNext ? 0 : warm ? 30 : 60;', replace: ': warm ? 30 : 60;' },
    { name: 'the warm-up counts as working sets', file: DOC,
      find: '        if (!warm) {\n          workingSets += sets;', replace: '        {\n          workingSets += sets;' },
    { name: 'Nora\'s chat save keeps no draft', file: ACT,
      find: "      published: false, expectedOwnerId: ctx.actor.id, detail: { buildType: built.buildType, builder: built.builder, draft: snapshot },",
      replace: "      published: false, expectedOwnerId: ctx.actor.id, detail: { buildType: built.buildType, builder: built.builder }," },
    // ── meal drafts from the Kitchen, with rest days ──
    { name: 'a draft defaults to the 24 basics', file: MD,
      find: "    source: i.source === 'library' ? 'library' : 'kitchen',", replace: "    source: i.source === 'kitchen' ? 'kitchen' : 'library'," },
    { name: 'a rest day keeps its carbs', file: MD,
      find: '  const c = Math.max(0, t.c - REST_CARB_DROP);', replace: '  const c = t.c;' },
    { name: 'a rest day is drafted to the training targets', file: MD,
      find: "    const t = type === 'rest' && brief.restTargets ? brief.restTargets : brief.targets;", replace: '    const t = brief.targets;' },
    { name: 'an amount nobody gave is scaled into a number', file: MD,
      find: "  m.ingredients = (m.ingredients || []).map((ing) => (ing.qty == null\n    ? { name: ing.name, qty: null, unit: '', ...(ing.qtyText ? { qtyText: ing.qtyText } : {}) }\n    : { name: ing.name, qty: Math.round((Number(ing.qty) || 0) * k * 10) / 10, unit: ing.unit || '' }));",
      replace: "  m.ingredients = (m.ingredients || []).map((ing) => ({ name: ing.name, qty: Math.round((Number(ing.qty) || 0) * k * 10) / 10, unit: ing.unit || '' }));" },
    { name: 'a Kitchen slot with no fit is left empty instead of the basics', file: MD,
      find: '    else { pools[slot] = libraryPool(slot, brief); if (pools[slot].length) fallback.push(slot); }', replace: '    else { pools[slot] = []; }' },
    { name: 'the text reader ignores what they left out', file: MD,
      find: '  if (exclude.length) out.exclude = [...new Set(exclude)];', replace: '' },
    { name: 'the catalog\'s dairy list is not read', file: KF,
      find: "  if (_RECIPE_HAS_DAIRY.has(recipe.title)) tags.add('dairy');\n", replace: '' },
    { name: 'a seafood recipe is not seafood unless an ingredient says so', file: KF,
      find: "  if (diet === 'Seafood' || tags.has('fish') || tags.has('shellfish')) tags.add('seafood');", replace: "  if (tags.has('fish') || tags.has('shellfish')) tags.add('seafood');" },
    { name: 'an amount is for the whole recipe, not one serving', file: KF,
      find: '  return { name: g, qty: Math.round((q.qty / per) * 100) / 100, unit: q.unit };', replace: '  return { name: g, qty: q.qty, unit: q.unit };' },
    { name: 'a side dish is a meal', file: KF,
      find: "  if (has('Side')) return [];\n", replace: '' },
    // ── the builder's core: Assign, grocery, search, lifecycle ──
    { name: 'a typed rotation runs by weekday', file: DM,
      find: '    var typed = planTyped(plan);', replace: '    var typed = false;' },
    { name: 'the rest targets are not assigned', file: DM,
      find: '      var t = targetsFor(plan, meta[dow].rest ? "rest" : "train");', replace: '      var t = plan.targets;' },
    { name: 'a plan from before gets REST on every non-training day', file: DM,
      find: '      var restDay = !training && (typed || variant === "rest" || !!plan.restTargets);', replace: '      var restDay = !training;' },
    { name: 'an amount nobody gave adds up as zero', file: DM,
      find: '          if (ing.qty != null && ing.qty !== "") { byKey[key].qty += (Number(ing.qty) || 0) * k; byKey[key].measured = true; }',
      replace: '          { byKey[key].qty += (Number(ing.qty) || 0) * k; byKey[key].measured = true; }' },
    { name: 'the client\'s list prints "null"', file: DM,
      find: '{ return { qty: ing.qty == null ? (ing.qtyText || "as needed") : ing.qty + (ing.unit ? " " + ing.unit : ""), name: ing.name }; }',
      replace: '{ return { qty: ing.qty + (ing.unit ? " " + ing.unit : ""), name: ing.name }; }' },
    { name: 'the Kitchen search ignores the ingredients', file: DM,
      find: '      for (var j = 0; j < ings.length; j++) if (ings[j].indexOf(tag) >= 0) return false;\n', replace: '' },
    { name: 'the Kitchen search ignores the prep limit', file: DM,
      find: '    if (maxPrep != null && f.prepMin != null && f.prepMin > maxPrep) return false;\n    return true;\n  }\n  // Quickest first',
      replace: '    return true;\n  }\n  // Quickest first' },
    { name: 'a client on both lifecycle lists is listed twice', file: DM,
      find: '      if (!seen[id]) { seen[id] = { client: c, reasons: [] }; list.push(seen[id]); }', replace: '      seen[id] = { client: c, reasons: [] }; list.push(seen[id]);' },
    { name: 'a swap the nutritionist added is no change', file: DM,
      find: '    return same && !(meal.swaps || []).length && !meal.note ? "nora" : "changed";', replace: '    return same ? "nora" : "changed";' },
    // ── the routes ──
    { name: 'a trainer drafts meal plans', file: MEAL_ROUTE,
      find: '    if (!roles.some((r) => NUTRITION_ROLES.includes(r))) {', replace: '    if (false) {' },
    { name: 'draft-meal-plan counts no budget', file: MEAL_ROUTE,
      find: "  const budget = await countBudget(sb, user.id, 'coach_draft');\n  if (!budget.allowed) {", replace: "  const budget = { allowed: true, resetSeconds: 0 };\n  if (!budget.allowed) {" },
    { name: 'draft-meal-plan drafts for a client the coach does not coach', file: MEAL_ROUTE,
      find: "    if (onClient !== true) return NextResponse.json({ error: 'You can only draft for clients you actively coach.' }, { status: 403 });", replace: '' },
    { name: 'any template id is stamped on an assignment', file: ASSIGN,
      find: "    const { data: own } = await supabase.from('coach_plans').select('id, name').eq('id', templateId).eq('owner_id', user.id).eq('kind', 'meal_plan').maybeSingle();",
      replace: "    const own = { id: templateId, name: '' };" },
    { name: 'no template is stamped', file: ASSIGN,
      find: '      payload: template ? { days, template } : { days },', replace: '      payload: { days },' },
    { name: 'an archived meal plan counts as someone\'s current one', file: USAGE,
      find: "    .in('nutritionist_id', rows0.map((n: { id: unknown }) => n.id))\n    .eq('status', 'published')", replace: "    .in('nutritionist_id', rows0.map((n: { id: unknown }) => n.id))" },
    { name: 'a client\'s week is their LAST session\'s, not their next', file: USAGE,
      find: '    if (!cur || date < cur.date) clients.set(clientId,', replace: '    if (!cur || date > cur.date) clients.set(clientId,' },
    { name: 'a program day named Rest is a training day', file: TD,
      find: '    if (label && !/^rest\\b/i.test(label)) out.push(i);', replace: '    if (label) out.push(i);' },
    { name: 'one session is read as a week', file: TD,
      find: '  if (n < 2) return null;', replace: '  if (n < 1) return null;' },
    // ── the builders ──
    { name: 'the meal Assign ignores each client\'s days', file: DMB,
      find: '        const out = DashMeals.buildMealAssignment(doc, { scale, trainingDows: dowsFor(id),', replace: '        const out = DashMeals.buildMealAssignment(doc, { scale, trainingDows: dows,' },
    { name: 'the meal Assign sends no template', file: DMB,
      find: ', days: out.days, ...(tplStamp ? { template: tplStamp } : {}) }),', replace: ', days: out.days }),' },
    { name: 'a Nora meal draft saves published', file: DMB,
      find: ':publishedRef.current===false?{published:false}:{}', replace: ':{}' },
    { name: 'Undo is offered after an edit', file: DBU,
      find: '            {onUndoDraft && untouched && <div className="acts2">', replace: '            {onUndoDraft && <div className="acts2">' },
    { name: 'a Nora draft waits for an edit before it saves', file: DBU,
      find: "  const saved = React.useRef(template.recovered || template.noraNew ? '' : JSON.stringify({name,doc}));", replace: "  const saved = React.useRef(template.recovered ? '' : JSON.stringify({name,doc}));" },
    { name: 'the New flow drafts a day when a program was asked for', file: DBU,
      find: '      const body = { request, kind: program ? "program" : "day", minutes: b.minutes,', replace: '      const body = { request, kind: "day", minutes: b.minutes,' },
    { name: 'a changed cell is not marked', file: DBU,
      find: '  const cellChanged = (key) => changed.some((f) => DBU_DRAFT_CELL[f] === key) ? " chg" : "";', replace: '  const cellChanged = (key) => "";' },
    // ── the app ──
    { name: 'the app drafts every kind as one day', file: PROS,
      find: "        const kind = buildType === 'workout' ? 'day' : 'program';", replace: "        const kind = 'day';" },
    { name: 'the app saves a Nora meal plan published', file: PROS,
      find: "kcal`, published: false, detail: { mealBuilder: d.doc, draft: d.snapshot } });", replace: "kcal`, published: true, detail: { mealBuilder: d.doc, draft: d.snapshot } });" },
    // ── the migration ──
    { name: 'the meal-plan usage index is not created', file: SQL,
      find: 'create index if not exists client_meal_plans_template_idx', replace: 'create index if not exists client_meal_plans_other_idx' },
  ],
};
