// Mutation spec for "who's on it" on meal plans (owner, 2026-11-09: "only the coaches see who's on
// what plan or program"): the write's ownership check and the id it stores, the usage route's
// nutritionist branch (its status and template filters and `untracked`), DashMeals.planWho and
// mostUsedPlan, and the page's "On it" states with the untracked-is-not-empty wording. 6a's own
// spec (libraries-6a-2026-11-09) is not re-run here. A survivor is a missing test, or a proven
// no-op marked expectSurvive with its proof.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/meal-plan-usage-6a-2026-11-09.mutations.mjs --fail-on-skipped
const WRITE = 'src/app/api/nutritionist/meal-plan/route.ts';
const USAGE = 'src/app/api/coach/plans/usage/route.ts';
const MEAL = 'public/newdesign/dashMealCore.js';
const PLANS = 'public/newdesign/dashMealBuilder.jsx';

export default {
  test: 'node --test tests/meal-plan-usage-6a.test.mjs tests/coach-plan-usage-route.test.mjs tests/libraries-6a.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── The write: the ownership check and the stored id ──
    { name: 'any id is stored, owned or not', file: WRITE, find: 'else if (ownPlan?.id) templateId = String(ownPlan.id);', replace: 'else templateId = requestedTemplateId;' },
    { name: 'a failed ownership read stores the id anyway', file: WRITE, find: "if (ownPlanError) console.warn('[shape-api] meal plan: the library plan was not checked, so it is not recorded:', ownPlanError.message);", replace: 'if (ownPlanError) templateId = requestedTemplateId;' },
    { name: 'the ownership read is not owner-scoped', file: WRITE, find: "      .eq('id', requestedTemplateId)\n      .eq('owner_id', user.id)\n", replace: "      .eq('id', requestedTemplateId)\n" },
    { name: 'the stored id is the one sent, not the library\'s', file: WRITE, find: 'templateId = String(ownPlan.id);', replace: 'templateId = requestedTemplateId;' },
    { name: 'the id is never stored', file: WRITE, find: 'payload: templateId ? { days, template: { id: templateId } } : { days },', replace: 'payload: { days },' },
    { name: 'the id is stored beside days, not where client_workouts keeps one', file: WRITE, find: 'payload: templateId ? { days, template: { id: templateId } } : { days },', replace: 'payload: templateId ? { days, templateId } : { days },' },
    { name: 'the id is not trimmed', file: WRITE, find: "typeof body.templateId === 'string' ? body.templateId.trim() : ''", replace: "typeof body.templateId === 'string' ? body.templateId : ''" },
    { name: 'a value that is not a string reaches the read', file: WRITE, find: "typeof body.templateId === 'string' ? body.templateId.trim() : ''", replace: "String(body.templateId ?? '').trim()" },
    { name: 'any string reaches the read', file: WRITE, find: 'const requestedTemplateId = PLAN_ID.test(sentTemplateId) ? sentTemplateId : null;', replace: 'const requestedTemplateId = sentTemplateId || null;' },
    // ── The read: the nutritionist branch ──
    { name: 'the meal library gets the workout library\'s answer', file: USAGE, find: "  if (params.get('role') === 'nutritionist') return mealPlanUsage(db, user.id);\n", replace: '' },
    { name: 'the nutritionist rows are anyone\'s', file: USAGE, find: "db.from('nutritionists').select('id').eq('owner_id', ownerId);", replace: "db.from('nutritionists').select('id');" },
    { name: 'the tracked read counts archived plans', file: USAGE, find: ".in('nutritionist_id', ids)\n    .eq('status', 'published')\n    .not('payload->template->>id', 'is', null)", replace: ".in('nutritionist_id', ids)\n    .not('payload->template->>id', 'is', null)" },
    { name: 'the tracked read takes plans that name no library plan', file: USAGE, find: "    .not('payload->template->>id', 'is', null)\n    .order('created_at', { ascending: false })", replace: "    .order('created_at', { ascending: false })" },
    { name: 'the untracked count counts archived plans', file: USAGE, find: ".in('nutritionist_id', ids)\n    .eq('status', 'published')\n    .is('payload->template->>id', null);", replace: ".in('nutritionist_id', ids)\n    .is('payload->template->>id', null);" },
    { name: 'the untracked count counts every current plan', file: USAGE, find: "    .eq('status', 'published')\n    .is('payload->template->>id', null);", replace: "    .eq('status', 'published');" },
    { name: 'an untracked count that was not taken is sent as one', file: USAGE, find: "if (untrackedError || typeof untracked !== 'number') return", replace: 'if (untrackedError) return' },
    { name: 'a failed untracked count is ignored', file: USAGE, find: "if (untrackedError || typeof untracked !== 'number') return", replace: "if (typeof untracked !== 'number') return" },
    { name: 'untracked is not sent', file: USAGE, find: 'capped: count == null || count > list.length, untracked }', replace: 'capped: count == null || count > list.length }' },
    { name: 'the meal library\'s cap is not reported', file: USAGE, find: 'capped: count == null || count > list.length, untracked }', replace: 'capped: false, untracked }' },
    { name: 'the meal library\'s answer is cacheable', file: USAGE, find: 'capped: count == null || count > list.length, untracked }, { headers: PRIVATE_HEADERS });', replace: 'capped: count == null || count > list.length, untracked });' },
    // ── The core: planWho and mostUsedPlan ──
    { name: 'an id off the roster is dropped from the count', file: MEAL, find: 'return { count: Math.max(count, people.length + elsewhere), people: people, elsewhere: elsewhere };', replace: 'return { count: Math.max(count, people.length), people: people, elsewhere: elsewhere };' },
    { name: 'an id the read sent twice is two people', file: MEAL, find: '      if (seen[ids[i]]) continue;\n', replace: '' },
    { name: 'a capped read ranks the plans', file: MEAL, find: '|| capped || untracked !== 0) return null;', replace: '|| untracked !== 0) return null;' },
    { name: 'a read missing untracked plans ranks the plans', file: MEAL, find: '|| capped || untracked !== 0) return null;', replace: '|| capped) return null;' },
    { name: 'an unknown untracked count ranks the plans', file: MEAL, find: '|| capped || untracked !== 0) return null;', replace: '|| capped || untracked > 0) return null;' },
    { name: 'a tie names a most-used plan', file: MEAL, find: '      else if (n === top && n > 0) tie = true;\n', replace: '' },
    { name: 'one client is "most used"', file: MEAL, find: 'return best && top >= 2 && !tie ?', replace: 'return best && top >= 1 && !tie ?' },
    // ── The page: the "On it" states ──
    { name: 'a card with none recorded says "No clients yet"', file: PLANS, find: '{usage.capped ? "None found on the plans read" : usage.untracked > 0 ? "None recorded yet" : "No clients yet"}', replace: '{usage.capped ? "None found on the plans read" : "No clients yet"}' },
    { name: 'a capped read says "No clients yet"', file: PLANS, find: '{usage.capped ? "None found on the plans read" : usage.untracked > 0 ? "None recorded yet" : "No clients yet"}', replace: '{usage.untracked > 0 ? "None recorded yet" : "No clients yet"}' },
    { name: 'the page never says why a plan has none recorded', file: PLANS, find: 'const untrackedNote = !preview && usage.state === "ready" && usage.untracked > 0 ? dmbUntrackedNote(usage.untracked) : null;', replace: 'const untrackedNote = null;' },
    { name: 'one untracked plan is spoken of as many', file: PLANS, find: '  return n === 1\n    ? "1 current plan', replace: '  return false\n    ? "1 current plan' },
    { name: 'an answer with no untracked count is the meal library\'s', file: PLANS, find: ' || !Number.isInteger(data.untracked) || data.untracked < 0) throw new Error("usage");', replace: ') throw new Error("usage");' },
    { name: 'a negative untracked count is read', file: PLANS, find: ' || data.untracked < 0) throw new Error("usage");', replace: ') throw new Error("usage");' },
    { name: 'the page reads the workout library\'s usage', file: PLANS, find: 'fetch("/api/coach/plans/usage?role=nutritionist", { credentials: "same-origin" })', replace: 'fetch("/api/coach/plans/usage", { credentials: "same-origin" })' },
    { name: 'a failed usage read is "checking" forever', file: PLANS, find: '{usage.state === "error" ? "Couldn’t read who’s on it" : "Checking who’s on it…"}', replace: '{"Checking who’s on it…"}' },
    { name: 'the names show with the roster unread', file: PLANS, find: 'else if (roster !== "live" && roster !== "demo") body =', replace: 'else if (false) body =' },
    { name: 'the people not named are not counted', file: PLANS, find: '<DashLibPeople people={who.people} extra={who.count - who.people.length} />{partly}', replace: '<DashLibPeople people={who.people} extra={0} />{partly}' },
    { name: 'a capped read with names says nothing is missing', file: PLANS, find: '<DashLibPeople people={who.people} extra={who.count - who.people.length} />{partly}', replace: '<DashLibPeople people={who.people} extra={who.count - who.people.length} />' },
    { name: 'the preview reads as a coach\'s page', file: PLANS, find: 'if (preview) body = <span className="dash-lib-quiet">Preview · no client plans to read</span>;\n  else if', replace: 'if (false) body = null;\n  else if' },
    { name: 'a failed refresh blanks the reading', file: PLANS, find: 'setUsage((u) => (u.state === "ready" ? u : { state: "error" }))', replace: 'setUsage({ state: "error" })' },
    { name: 'another account\'s reading carries across', file: PLANS, find: 'setFilters(DFB_EMPTY); usageRead.current++; setUsage({ state: "idle" }); }', replace: 'setFilters(DFB_EMPTY); }' },
    { name: 'the library is not read again after a send', file: PLANS, find: '    if (libraryOwner.current) loadUsage();\n  };', replace: '  };' },
    { name: 'the most-used chip is gone', file: PLANS, find: 'badges: most && t.id && most.id === t.id ?', replace: 'badges: false ?' },
    // ── The send ──
    { name: 'the assign sheet sends no library plan', file: PLANS, find: ', ...(template.id ? { templateId: String(template.id) } : {}) }),', replace: ' }),' },
    { name: 'a plan with no id sends one anyway', file: PLANS, find: ', ...(template.id ? { templateId: String(template.id) } : {}) }),', replace: ', templateId: template.id }),' },
    { name: 'the builder sends the id of a plan it has not saved', file: PLANS, find: 'template={{ id: persisted.current ? idRef.current : null, name }}', replace: 'template={{ id: idRef.current, name }}' },
  ],
};
