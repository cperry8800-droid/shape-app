// Mutation spec for Nora's meal-plan drafts (the Ask Nora plan, step 5): the planner over
// Shape's meal library, draft_meal_plan's save and guarded undo, its role gate, the chat
// route's gate, and the two surfaces that open the saved draft. Every one must be killed.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/ai-meal-draft-2026-10-08.mutations.mjs --fail-on-skipped
const CORE = 'src/lib/ai/mealDraft.mjs';
const ACT = 'src/lib/ai/actions.mjs';
const CHAT = 'src/app/api/support/chat/route.ts';
const WEB = 'public/newdesign/dashMealBuilder.jsx';
const PROS = 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx';

export default {
  test: 'node --test tests/ai-meal-draft.test.mjs tests/support-chat-route.test.mjs tests/ai-draft-surfaces.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── what is left out stays out ──
    { name: 'a packaged food is served after an exclusion', file: CORE,
      find: '  if (food.packaged) return false;\n', replace: '' },
    { name: 'an exclusion ignores the ingredients', file: CORE,
      find: '  return !brief.exclusions.some((ex) => food.tags.includes(ex) || name.includes(ex) || ingredients.some((n) => n.includes(ex)));',
      replace: '  return !brief.exclusions.some((ex) => food.tags.includes(ex) || name.includes(ex));' },
    { name: 'the prep limit is ignored', file: CORE,
      find: '  if (brief.maxPrep != null && food.prepMin != null && food.prepMin > brief.maxPrep) return false;\n', replace: '' },
    // ── the numbers are the library's, scaled within bounds ──
    { name: 'the portion factor is unbounded', file: CORE,
      find: '  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, k));', replace: '  return k;' },
    { name: 'a misheard calorie target is clamped, not dropped', file: CORE,
      find: '  return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : null;',
      replace: '  return Number.isFinite(n) ? Math.round(Math.min(hi, Math.max(lo, n))) : null;' },
    { name: 'the days repeat', file: CORE,
      find: "(yesterday[j] === f.id ? 15 : 0)", replace: '0' },
    // ── the action ──
    { name: 'a draft is saved published', file: ACT,
      find: "      meta: days + '-day rotation · ' + p.brief.targets.kcal + ' kcal', published: false,",
      replace: "      meta: days + '-day rotation · ' + p.brief.targets.kcal + ' kcal', published: true," },
    { name: 'a named client is not checked', file: ACT,
      find: "    if (input.clientId || input.clientName) {\n      await requireOnClient(ctx, input.clientId);\n      clientId = input.clientId;",
      replace: "    if (input.clientId || input.clientName) {\n      clientId = input.clientId;" },
    { name: 'undo deletes a published plan', file: ACT,
      find: ".eq('kind', 'meal_plan').eq('published', false)\n      .contains('detail', detail)",
      replace: ".eq('kind', 'meal_plan')\n      .contains('detail', detail)" },
    { name: 'undo deletes an edited plan that still contains the draft', file: ACT,
      find: "      .contains('detail', detail).containedBy('detail', detail)", replace: "      .contains('detail', detail)" },
    { name: 'a trainer may draft meal plans', file: ACT,
      find: "  name: 'draft_meal_plan',\n  roles: ['nutritionist', 'dietitian'],",
      replace: "  name: 'draft_meal_plan',\n  roles: ['nutritionist', 'dietitian', 'trainer']," },
    // ── the chat route ──
    { name: 'a plain panel is offered the drafter', file: CHAT,
      find: "if (nutritionRoles.some((r) => r === 'nutritionist' || r === 'dietitian') && !noCards) nutritionTools = NUTRITION_TOOLS;",
      replace: "if (nutritionRoles.some((r) => r === 'nutritionist' || r === 'dietitian')) nutritionTools = NUTRITION_TOOLS;" },
    { name: 'held roles are not read', file: CHAT,
      find: '      const nutritionRoles = [actor.role, ...(actor.roles || [])];', replace: '      const nutritionRoles = [actor.role];' },
    // ── the surfaces ──
    { name: 'the builder gives up on a plan the first read missed', file: WEB,
      find: '    if (openRetried.current !== openPlan) { openRetried.current = openPlan; setRefresh((n) => n + 1); return; }\n', replace: '' },
    { name: 'the app leaves Nora\'s sheet over Plans', file: PROS,
      find: "      setShowSearch(false); setShowSettings(false); setShowNoraSheet(false);\n      setTab('plans');",
      replace: "      setShowSearch(false); setShowSettings(false);\n      setTab('plans');" },
  ],
};
