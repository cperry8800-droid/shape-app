// Mutation spec for coach dashboard step 6a (the owner's coach review, step 6: "The calmer library"):
// the Programs and Meal plans libraries. Covers the top lines' counts and their unread states, who
// is on a program, the to-do line's dedupe, the allergen rule, sample data only under the band, and
// the reads that feed them (the usage route's ids, the program leg's template). A survivor is a
// missing test, or a proven no-op marked expectSurvive with its proof.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/libraries-6a-2026-11-09.mutations.mjs --fail-on-skipped
const CORE = 'public/newdesign/dashBuilderCore.js';
const MEAL = 'public/newdesign/dashMealCore.js';
const PROG = 'public/newdesign/dashBuilder.jsx';
const PLANS = 'public/newdesign/dashMealBuilder.jsx';
const KIT = 'public/newdesign/dashFilterBar.jsx';
const USAGE = 'src/app/api/coach/plans/usage/route.ts';
const LEGS = 'src/lib/coach-client-legs.mjs';

export default {
  test: 'node --test tests/libraries-6a.test.mjs tests/library-filters-ui.test.mjs tests/coach-plan-usage-route.test.mjs tests/coach-program-leg.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── Programs: the week's job ──
    { name: 'a final week reads as ready', file: CORE, find: 'if (weeks - week >= 1 && !p.overdue) return', replace: 'if (weeks - week >= 0 && !p.overdue) return' },
    { name: 'a program assigned after the current one is ignored', file: CORE, find: '    if (next) return { state: "ready", why: "next-program", next: next };\n', replace: '' },
    { name: 'an ended program reads as its final week', file: CORE, find: 'why: p.overdue ? "ended" : "final"', replace: 'why: "final"' },
    { name: 'a client whose overview failed counts as on no program', file: CORE, find: 'if (read === "unread") { out.unread += 1; continue; }', replace: 'if (read === "unread") { out.off += 1; continue; }' },
    { name: 'a client still loading reads as read', file: CORE, find: 'r.state === "loading" ? "loading" : "unread";\n  }\n  // The trainer', replace: 'r.state === "loading" ? "ready" : "unread";\n  }\n  // The trainer' },
    { name: 'the need-you rows no longer lead', file: CORE, find: 'var NEXT_WEEK_RANK = { need: 0, unknown: 1, ready: 2, paused: 3 };', replace: 'var NEXT_WEEK_RANK = { need: 2, unknown: 1, ready: 0, paused: 3 };' },
    { name: 'the line counts while every client is still loading', file: PROG, find: 'figure={settling ? "—" : on}', replace: 'figure={on}' },
    { name: 'an unread roster is counted from nothing', file: PROG, find: '  if (roster === "loading" || roster === "unread") return { roster, ahead: null };\n  return { roster, ahead: DashBuilder.programWeekAhead(clients) };', replace: '  if (roster === "loading") return { roster, ahead: null };\n  return { roster, ahead: DashBuilder.programWeekAhead(clients) };' },
    { name: 'an unread roster says it is loading', file: PROG, find: 'note={model.roster === "unread" ? DASH_LIB_ROSTER_UNREAD : "Reading your roster…"}', replace: 'note="Reading your roster…"' },
    { name: 'a read roster with nobody on a program says nothing', file: PROG, find: 'notes.push(a.total ? "None of your clients is on one of your programs." : "No clients on your roster yet.");', replace: '{}' },
    { name: 'Choose a program does not set the client', file: PROG, find: 'onPick={id=>{setPickFor(id);setReviewing(false);}}', replace: 'onPick={id=>{setReviewing(false);}}' },
    // ── Programs: who is on it ──
    { name: 'an id off the roster is dropped from the count', file: CORE, find: '    return { count: Math.max(count, people.length + elsewhere), people: people, elsewhere: elsewhere };', replace: '    return { count: Math.max(count, people.length), people: people, elsewhere: elsewhere };' },
    { name: 'an id the read sent twice is two people', file: CORE, find: '      if (seen[ids[i]]) continue;\n', replace: '' },
    { name: 'a capped read says "No clients yet"', file: PROG, find: '{usage.capped ? "None found on the calendars read" : "No clients yet"}', replace: '{"No clients yet"}' },
    { name: 'a failed usage read is "checking" forever', file: PROG, find: '{usage.state === "error" ? "Couldn’t read who’s on it" : "Checking who’s on it…"}', replace: '{"Checking who’s on it…"}' },
    { name: 'the names show with the roster unread', file: PROG, find: 'else if (roster !== "live" && roster !== "demo") body =', replace: 'else if (false) body =' },
    { name: 'the people not named are not counted', file: PROG, find: '<DashLibPeople people={who.people} extra={who.count - who.people.length} />', replace: '<DashLibPeople people={who.people} extra={0} />' },
    { name: 'a tie names a most-used program', file: CORE, find: '      else if (n === top && n > 0) tie = true;\n', replace: '' },
    { name: 'a capped read ranks the programs', file: CORE, find: 'if (!usageMap || typeof usageMap !== "object" || capped) return null;\n    var best', replace: 'if (!usageMap || typeof usageMap !== "object") return null;\n    var best' },
    { name: 'one client is "most used"', file: CORE, find: 'return best && top >= 2 && !tie ?', replace: 'return best && top >= 1 && !tie ?' },
    { name: 'a client\'s week is shown on a program that is not their current one', file: CORE, find: 'var current = !!(r && r.templateId && r.templateId === t.id);', replace: 'var current = !!r;' },
    { name: 'the one-client list keeps its library order', file: CORE, find: '    rows.sort(function (a, b) { return rank(a) - rank(b) || tagText(a.template.name).localeCompare(tagText(b.template.name)); });\n', replace: '' },
    { name: 'the usage read sends no ids', file: USAGE, find: '{ clients: clients.size, clientIds: [...clients].sort() }', replace: '{ clients: clients.size }' },
    { name: 'the program leg forgets its template', file: LEGS, find: 'name: pick.name, templateId: pick.id, week,', replace: 'name: pick.name, week,' },
    // ── Programs: the cards ──
    { name: 'a No in ShapeConfirm deletes anyway', file: PROG, find: "message:'It leaves your library for good.'+(n?' The '+dbuCount(n,'client','clients')+' on it keep every session already on their calendar.':' Sessions already on a client’s calendar stay there.')});\n    if(!ok)return;", replace: "message:'It leaves your library for good.'+(n?' The '+dbuCount(n,'client','clients')+' on it keep every session already on their calendar.':' Sessions already on a client’s calendar stay there.')});" },
    { name: 'the preview offers Delete on an example', file: PROG, find: "const canDelete=isLive&&typeof window!=='undefined'", replace: "const canDelete=typeof window!=='undefined'" },
    { name: 'a card\'s own button also opens the builder', file: KIT, find: 'if (t && typeof t.closest === "function" && t.closest("button, a, input, select, textarea, label, [role=\'menu\']")) return;', replace: '' },
    { name: 'Escape leaves the menu open', file: KIT, find: 'if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); if (btn.current) btn.current.focus(); }', replace: 'if (e.key === "Escape") { e.preventDefault(); }' },
    // ── Meal plans: the to-do line ──
    { name: 'a client with two reasons is counted twice', file: MEAL, find: '      if (at[id] == null) {', replace: '      if (true) {' },
    { name: 'an unread client is read as needing nothing', file: MEAL, find: 'var read = all.filter(function (c) { return todoReadState(c) === "ready"; });', replace: 'var read = all;' },
    { name: 'any plan is named, whatever its phase', file: MEAL, find: 'return t && t.detail && t.detail.mealBuilder && t.detail.mealBuilder.goalPhase === phase;', replace: 'return t && t.detail && t.detail.mealBuilder;' },
    { name: 'a client with no phase is given a plan', file: MEAL, find: 'var tpl = phase ? (templates || []).find(', replace: 'var tpl = (templates || []).find(' },
    { name: 'an unread roster is a measured empty to-do', file: PLANS, find: '  if (roster === "loading" || roster === "unread") return { roster, todo: null };', replace: '  if (roster === "loading") return { roster, todo: null };' },
    { name: 'Assign all stops after the first sheet', file: PLANS, find: '(w.at + 1 < w.rows.length ? { ...w, at: w.at + 1 } : null)', replace: '(false ? { ...w, at: w.at + 1 } : null)' },
    { name: 'Assign all counts the clients with no plan named', file: MEAL, find: 'assignable: rows.filter(function (r) { return !!r.suggestion; }).length', replace: 'assignable: rows.length' },
    { name: 'the intake row messages nobody in particular', file: PLANS, find: 'Two minutes and I can build your first week.", r.id)', replace: 'Two minutes and I can build your first week.")' },
    // ── Meal plans: the allergen rule and the search ──
    { name: 'the allergen line counts a swap', file: MEAL, find: 'return dietOf(planServed(plan).filter(function (x) { return !x.swap; }));', replace: 'return dietOf(planServed(plan));' },
    { name: 'the card reads the filter\'s diet', file: PLANS, find: 'const d = info.ownDiet, p = info.prep;', replace: 'const d = info.diet, p = info.prep;' },
    { name: 'the Diet filter stops counting swaps', file: MEAL, find: '  function planDiet(plan) {\n    return dietOf(planServed(plan));', replace: '  function planDiet(plan) {\n    return dietOf(planServed(plan).filter(function (x) { return !x.swap; }));' },
    { name: 'the search finds no recipe inside a plan', file: MEAL, find: 'search: [mealText(t.name)].concat(dishes).join(" · "),', replace: 'search: mealText(t.name),' },
    { name: 'the search finds no alternate', file: MEAL, find: 'planServed(plan).forEach(function (x) { var n = mealText(x.meal && x.meal.name);', replace: 'planServed(plan).filter(function (x) { return !x.swap; }).forEach(function (x) { var n = mealText(x.meal && x.meal.name);' },
    // ── Sample data only under the band ──
    { name: 'a signed-in library takes the demo roster as the preview', file: KIT, find: 'if (source === "unread" || (source === "demo" && signedIn)) return "unread";', replace: 'if (source === "unread") return "unread";' },
    { name: 'Programs shows the band on any demo roster', file: PROG, find: '{preview&&<DashDemoBand/>}', replace: "{source==='demo'&&<DashDemoBand/>}" },
    { name: 'Programs names the sample cast on an unread roster', file: PROG, find: "const people=roster==='live'||roster==='demo'?clients:[];", replace: 'const people=clients;' },
    { name: 'Programs takes a demo roster as the preview before the library answers', file: PROG, find: "const roster=source==='demo'&&!resolved.current?'loading':dashLibRosterState(source,isLive);", replace: 'const roster=dashLibRosterState(source,isLive);' },
    { name: 'Meal plans shows the band on any demo roster', file: PLANS, find: '{preview && <DashDemoBand />}', replace: '{source === "demo" && <DashDemoBand />}' },
    { name: 'Meal plans names the sample cast on an unread roster', file: PLANS, find: 'const people = roster === "live" || roster === "demo" ? clients : DMB_NOBODY;', replace: 'const people = clients;' },
    { name: 'Meal plans takes a demo roster as the preview before the library answers', file: PLANS, find: 'const roster = source === "demo" && !resolved.current ? "loading" : dashLibRosterState(source, signedIn);', replace: 'const roster = dashLibRosterState(source, signedIn);' },
  ],
};
