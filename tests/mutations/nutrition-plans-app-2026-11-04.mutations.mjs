// Mutation spec for a nutritionist's plans in the app (owner, 2026-11-04: "A meal plan Nora drafts for
// a nutritionist can only be edited and assigned on the website, not in the app" and "Nora can't create
// a nutritionist's 'program' or 'diet' yet, only meal plans … can you fix these and make them
// possible?"): the builder document's edits and the week Assign sends, the app's editor for it, the
// Plans page's saved rows and Nora's open request, and draft_nutrition_program with the chat route's
// offer and meter. Every one must be killed.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/nutrition-plans-app-2026-11-04.mutations.mjs --fail-on-skipped
const EDIT = 'mobile-app/src/services/mealBuilderEdit.mjs';
const EDITOR = 'mobile-app/src/broadsheet/BSMealBuilderEditor.jsx';
const PROS = 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx';
const CORE = 'src/lib/ai/nutritionDraft.mjs';
const ACT = 'src/lib/ai/actions.mjs';
const CHAT = 'src/app/api/support/chat/route.ts';

export default {
  test: 'node --test tests/meal-builder-editor.test.mjs tests/nutri-plans-library.test.mjs tests/ai-nutrition-draft.test.mjs tests/ai-meal-draft.test.mjs tests/broadsheet-render.test.mjs',
  timeoutMs: 600_000,
  mutations: [
    // ── the builder document's edits ──
    { name: 'a document with a day of no meals list passes', file: EDIT,
      find: "  if (!doc.days.every((d) => d && typeof d === 'object' && Array.isArray(d.slots))) return null;\n", replace: '' },
    { name: 'a swap leaves the rest days on the old meal', file: EDIT,
      find: '{ ...M.newMeal(food, cur.slot), id: mealId }, true);', replace: '{ ...M.newMeal(food, cur.slot), id: mealId }, false);' },
    { name: 'a swap loses its slot', file: EDIT,
      find: '{ ...M.newMeal(food, cur.slot), id: mealId }', replace: '{ ...M.newMeal(food), id: mealId }' },
    { name: 'a removed meal leaves its override behind', file: EDIT,
      find: "  Object.keys(d.variants || {}).forEach((k) => { const v = d.variants[k]; if (v && v.overrides) delete v.overrides[mealId]; });\n", replace: '' },
    { name: 'an added meal goes to the end of the day', file: EDIT,
      find: '    if (rank(d.slots[i] && d.slots[i].slot) <= rank(slot)) { at = i + 1; break; }\n    at = i;', replace: '    at = d.slots.length; break;' },
    { name: 'a target out of range is taken', file: EDIT,
      find: '  if (v < range[0] || v > range[1] || (doc.targets && doc.targets[key] === v)) return doc;', replace: '  if (doc.targets && doc.targets[key] === v) return doc;' },
    { name: 'Assign drops the grocery edits', file: EDIT,
      find: '  return M.buildMealAssignment(doc, { scale: 1, groceryEdits: edits }).days;', replace: '  return M.buildMealAssignment(doc, { scale: 1, groceryEdits: null }).days;' },
    // ── the editor ──
    { name: 'the picker ignores what the plan leaves out', file: EDITOR,
      find: '    const foods = foodsFor(M, doc, query);', replace: '    const foods = M.searchFoods(query, null);' },
    { name: 'Save writes the whole stored detail back', file: EDITOR,
      find: '        meta: mealPlanMeta(M, doc), detail: { mealBuilder: doc },', replace: '        meta: mealPlanMeta(M, doc), detail: { ...(plan.detail || {}), mealBuilder: doc },' },
    { name: 'Save does not name the account', file: EDITOR,
      find: "        id: plan.id, name: name.trim() || plan.name, ...(ownerId ? { expectedOwnerId: ownerId } : {}),", replace: '        id: plan.id, name: name.trim() || plan.name,' },
    { name: 'Assign does not save changes first', file: EDITOR,
      find: '    const row = dirty ? await save() : { ...plan,', replace: '    const row = false ? await save() : { ...plan,' },
    { name: 'Assign goes on after a failed save', file: EDITOR,
      find: '    if (row) onAssign(row);', replace: '    onAssign(row || plan);' },
    { name: 'Back with changes leaves without asking', file: EDITOR,
      find: '    if (dirty && window.bsAskConfirm && !(await window.bsAskConfirm({', replace: '    if (false && window.bsAskConfirm && !(await window.bsAskConfirm({' },
    { name: 'a target out of range stays in its box', file: EDITOR,
      find: '    if (next === doc) setTargetText((s) => ({ ...s, [k]: doc.targets[k] }));', replace: '    if (next === doc) {}' },
    // ── the Plans page ──
    { name: 'Programs lists no saved program when signed in', file: PROS,
      find: '  const nutriPrograms = signedIn ? ownPrograms : [...ownPrograms,', replace: '  const nutriPrograms = signedIn ? [] : [...ownPrograms,' },
    { name: 'Diet lists no saved diet when signed in', file: PROS,
      find: '  const diets = signedIn ? ownDiets : [...ownDiets,', replace: '  const diets = signedIn ? [] : [...ownDiets,' },
    { name: 'a saved row opens a blank draft', file: PROS,
      find: "  const openCard = (card, type) => (card && card.row ? openRow(card.row) : openDraft(type));", replace: '  const openCard = (card, type) => openDraft(type);' },
    { name: 'a saved row opens on the page\'s goal', file: PROS,
      find: '    if (d.goal) setGoal(String(d.goal));\n', replace: '' },
    { name: 'publishing a saved row makes a copy', file: PROS,
      find: '    if (editDraft && editDraft.id) {\n      if (!window.ShapeCoachPlans?.update)', replace: '    if (false) {\n      if (!window.ShapeCoachPlans?.update)' },
    { name: 'a saved row keeps the old week when published to one menu', file: PROS,
      find: "detail: { ...payload.detail, days: days && days.length ? days : null } });", replace: 'detail: { ...payload.detail } });' },
    { name: 'a refused publish holds Publishing…', file: PROS,
      find: "          catch (e) { setStatus(''); setPubErr(", replace: "          catch (e) { setPubErr(" },
    { name: 'Nora\'s open gives up on a plan the first read missed', file: PROS,
      find: "    if (openRetried.current !== req.nonce) { openRetried.current = req.nonce; refreshLibrary(); return; }\n    openHandled.current = req.nonce;\n    flash(", replace: "    openHandled.current = req.nonce;\n    flash(" },
    { name: 'the nutritionist shell opens a trainer\'s program card', file: PROS,
      find: "      if (typeof d.planId !== 'string' || !d.planId || d.planKind !== 'meal_plan') return;", replace: "      if (typeof d.planId !== 'string' || !d.planId) return;" },
    { name: 'Assign reads a builder document as outline lines', file: PROS,
      find: '        const days = builderDoc ? bsMealBuilderWeek(window.DashMeals, builderDoc) : bsPlanWeek(plan.detail)', replace: '        const days = false ? bsMealBuilderWeek(window.DashMeals, builderDoc) : bsPlanWeek(plan.detail)' },
    // ── draft_nutrition_program ──
    { name: 'the goal is guessed from the request', file: CORE,
      find: "    goal: pick(i.goal, GOALS, GOAL_WORDS) || 'Maintain',", replace: "    goal: pick(i.goal, GOALS, GOAL_WORDS) || pick(request, GOALS, GOAL_WORDS) || 'Maintain'," },
    { name: 'a client\'s name goes to the model', file: CORE,
      find: "    client: '',", replace: '    client: brief.request,' },
    { name: 'an answer that will not parse is taken', file: CORE,
      find: "  const used = data.draft ? bsDraftFromResponse(MODE[brief.kind], data.draft, null) : null;", replace: "  const used = data.draft && Array.isArray(data.draft.blocks) ? { lines: data.draft.blocks.map((b) => (b && b.title ? `${b.title} — ${b.detail || ''}` : '')), name: data.draft.title || '', note: '' } : null;" },
    { name: 'the route\'s template is called an AI draft', file: CORE,
      find: "source: data.source === 'openai' ? 'ai' : 'template' };", replace: "source: 'ai' };" },
    { name: 'the draft is saved live', file: ACT,
      find: "      id: p.planId, kind: 'meal_plan', name: row.name, meta: row.meta, published: false,", replace: "      id: p.planId, kind: 'meal_plan', name: row.name, meta: row.meta, published: true," },
    { name: 'undo removes an edited program or diet', file: ACT,
      find: "    var detail = ((plan.confirmedPayload || {}).row || {}).detail || {};\n    var res = await ctx.supabase.from('coach_plans').delete()\n      .eq('id', plan.beforeState.planId).eq('owner_id', ctx.actor.id).eq('kind', 'meal_plan').eq('published', false)\n      .contains('detail', detail).containedBy('detail', detail)",
      replace: "    var detail = ((plan.confirmedPayload || {}).row || {}).detail || {};\n    var res = await ctx.supabase.from('coach_plans').delete()\n      .eq('id', plan.beforeState.planId).eq('owner_id', ctx.actor.id).eq('kind', 'meal_plan').eq('published', false)\n      .contains('detail', detail)" },
    { name: 'a trainer may draft programs and diets', file: ACT,
      find: "  name: 'draft_nutrition_program',\n  roles: ['nutritionist', 'dietitian'],", replace: "  name: 'draft_nutrition_program',\n  roles: ['nutritionist', 'dietitian', 'trainer']," },
    { name: 'a client not theirs is not checked', file: ACT,
      find: "    if (input.clientId || input.clientName) {\n      await requireOnClient(ctx, input.clientId);\n      clientId = input.clientId;\n      who = input.clientName ? clipText(input.clientName, 60) : 'this client';\n    }\n    // The generator's own answer",
      replace: "    if (input.clientId || input.clientName) {\n      clientId = input.clientId;\n      who = input.clientName ? clipText(input.clientName, 60) : 'this client';\n    }\n    // The generator's own answer" },
    { name: 'the drafter is not metered', file: CHAT,
      find: "    if (name === 'draft_nutrition_program') {\n      const budget = await countBudget(actor.supabase, actor.user.id, 'draft_program');", replace: "    if (name === 'never') {\n      const budget = await countBudget(actor.supabase, actor.user.id, 'draft_program');" },
    { name: 'the drafter is not a write tool', file: CHAT,
      find: "'draft_meal_plan', 'draft_nutrition_program', 'assign_meal_plan',", replace: "'draft_meal_plan', 'assign_meal_plan'," },
  ],
};
