// Nora's ACTION tools — each wraps an EXISTING /api/* endpoint, called with the
// ACTOR'S session (ctx.call forwards the cookie/Bearer; the endpoint's own auth +
// RLS stay the authoritative gate — never service-role, never a bypass). Every
// write rides the AI1 preview/confirm + ai_audit_log scaffold: a PURE buildPreview
// (no side effects), an execute that calls the endpoint, and an undo that reverses
// it. Dependency-injected via ctx, so they're node-testable.
//
// Wrapped in the rollout order — TIER 1 (client self-service) then TIER 2 (coach,
// is_coach_on_client-gated). The deferred / never-wrap endpoints are intentionally
// absent. The scaffold's role gate (proposeChange → roleAllowed) handles the role
// check; coach actions additionally front-check is_coach_on_client here, with the
// endpoint's own 403 as the backstop.

function num(v) { var n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null; }
function addCol(cur, inc) { return inc == null ? (cur == null ? null : Number(cur)) : Number(cur || 0) + inc; }
function macroLine(m) {
  var parts = [];
  if (m.kcal != null) parts.push(m.kcal + ' kcal');
  if (m.protein != null) parts.push(m.protein + 'g protein');
  if (m.carbs != null) parts.push(m.carbs + 'g carbs');
  if (m.fat != null) parts.push(m.fat + 'g fat');
  if (m.hydrationL != null) parts.push(m.hydrationL + ' L water');
  return parts.join(' · ') || 'nothing';
}
function snapDiff(before, after) {
  var map = [['calories', 'Calories', ' kcal'], ['protein_g', 'Protein', 'g'], ['carbs_g', 'Carbs', 'g'], ['fat_g', 'Fat', 'g'], ['hydration_l', 'Hydration', ' L']];
  var rows = [];
  map.forEach(function (m) {
    var b = before[m[0]], a = after[m[0]];
    if (a !== b) rows.push({ label: m[1], field: m[0], before: b == null ? '—' : b + m[2], after: a == null ? '—' : a + m[2] });
  });
  return rows;
}

// ── TIER 1 · client self-service (RLS owner-scoped) ─────────────────────────
// log_meal → POST /api/nutrition/meal-log (accumulates onto today's snapshot).
export const logMealAction = {
  name: 'log_meal',
  roles: ['client', 'trainer', 'nutritionist', 'admin'], // you log your OWN meal
  source: 'nora',
  async buildPreview(ctx, input) {
    input = input || {};
    var macros = {};
    [['kcal', 'kcal'], ['protein', 'protein'], ['carbs', 'carbs'], ['fat', 'fat'], ['hydrationL', 'hydrationL']].forEach(function (k) {
      var n = num(input[k[0]]); if (n != null) macros[k[1]] = n;
    });
    if (!Object.keys(macros).length) throw new Error('Tell me what to log — e.g. calories and protein.');
    var today = new Date().toISOString().slice(0, 10);
    var sel = await ctx.supabase
      .from('daily_health_snapshot')
      .select('calories, protein_g, carbs_g, fat_g, hydration_l')
      .eq('user_id', ctx.actor.id)
      .eq('snapshot_date', today)
      .maybeSingle();
    var cur = (sel && sel.data) || {};
    var n2 = function (v) { return v != null ? Number(v) : null; };
    var before = { snapshot_date: today, calories: n2(cur.calories), protein_g: n2(cur.protein_g), carbs_g: n2(cur.carbs_g), fat_g: n2(cur.fat_g), hydration_l: n2(cur.hydration_l) };
    var after = {
      snapshot_date: today,
      calories: addCol(before.calories, macros.kcal), protein_g: addCol(before.protein_g, macros.protein),
      carbs_g: addCol(before.carbs_g, macros.carbs), fat_g: addCol(before.fat_g, macros.fat),
      hydration_l: addCol(before.hydration_l, macros.hydrationL),
    };
    var label = input.mealName ? String(input.mealName).slice(0, 60) : 'this meal';
    return {
      summary: 'Log ' + label + ' to today — ' + macroLine(macros),
      diff: snapDiff(before, after),
      target: { userId: ctx.actor.id, kind: 'meal_log', id: today },
      beforeState: before, afterState: after, confirmedPayload: macros,
    };
  },
  async execute(ctx, plan) {
    var r = await ctx.call('POST', '/api/nutrition/meal-log', plan.confirmedPayload);
    if (!r.ok) throw new Error((r.data && r.data.error) || 'Could not log the meal.');
    return r.data;
  },
  async undo(ctx, plan) {
    // The endpoint accumulates (no negative path), so restore the prior snapshot
    // macros directly on the actor's OWN RLS-scoped row.
    var b = plan.beforeState || {};
    await ctx.supabase
      .from('daily_health_snapshot')
      .update({ calories: b.calories, protein_g: b.protein_g, carbs_g: b.carbs_g, fat_g: b.fat_g, hydration_l: b.hydration_l })
      .eq('user_id', ctx.actor.id)
      .eq('snapshot_date', b.snapshot_date);
  },
};

// ── TIER 2 · coach (is_coach_on_client-gated) ───────────────────────────────
// set_client_goal → POST /api/clients/[id]/goals (replaces detail.goals).
function existingTarget(goals, label) {
  var g = (goals || []).find(function (x) { return String(x.label || '').toLowerCase() === label.toLowerCase(); });
  return g ? String(g.target) + (g.unit || '') : '—';
}
export const setClientGoalAction = {
  name: 'set_client_goal',
  roles: ['trainer', 'nutritionist', 'admin'],
  source: 'nora',
  async buildPreview(ctx, input) {
    input = input || {};
    // NEVER act on an unmatched client — ask, don't guess.
    if (!input.clientId || typeof input.clientId !== 'string') {
      throw new Error("Which client? I couldn't match one — tell me their name and I'll confirm before doing anything.");
    }
    // Front permission check (the endpoint re-checks server-side as the backstop).
    var ok = await ctx.supabase.rpc('is_coach_on_client', { p_client_id: input.clientId });
    if (!(ok && ok.data === true)) throw new Error("You're not an active coach on this client, so I can't set their goal.");

    var goalIn = input.goal || {};
    var target = Number(goalIn.target);
    if (!Number.isFinite(target)) throw new Error("What's the target value for this goal?");
    var goal = {
      label: String(goalIn.label || 'Goal').slice(0, 60),
      target: target,
      setBy: 'coach',
    };
    if (goalIn.metric) goal.metric = String(goalIn.metric).slice(0, 40);
    if (goalIn.unit) goal.unit = String(goalIn.unit).slice(0, 12);
    if (Number.isFinite(Number(goalIn.start))) goal.start = Number(goalIn.start);

    // Current goals — read via the endpoint with the actor's session.
    var cur = await ctx.call('GET', '/api/clients/' + encodeURIComponent(input.clientId) + '/goals');
    var beforeGoals = (cur.ok && Array.isArray(cur.data && cur.data.goals)) ? cur.data.goals : [];
    // Upsert by label (≤3): replace a same-label goal, else append.
    var afterGoals = beforeGoals
      .filter(function (g) { return String(g.label || '').toLowerCase() !== goal.label.toLowerCase(); })
      .concat([goal])
      .slice(0, 3);
    var who = input.clientName ? String(input.clientName) : 'this client';
    return {
      summary: 'Set ' + who + "'s goal — " + goal.label + ' → ' + goal.target + (goal.unit || ''),
      diff: [{ label: goal.label, field: 'target', before: existingTarget(beforeGoals, goal.label), after: goal.target + (goal.unit || '') }],
      target: { userId: input.clientId, kind: 'goal', id: goal.label },
      beforeState: { goals: beforeGoals }, afterState: { goals: afterGoals }, confirmedPayload: { goals: afterGoals },
    };
  },
  async execute(ctx, plan) {
    var r = await ctx.call('POST', '/api/clients/' + encodeURIComponent(plan.target.userId) + '/goals', { goals: plan.confirmedPayload.goals });
    if (!r.ok) throw new Error((r.data && r.data.error) || 'Could not set the goal.');
    return r.data;
  },
  async undo(ctx, plan) {
    var r = await ctx.call('POST', '/api/clients/' + encodeURIComponent(plan.target.userId) + '/goals', { goals: (plan.beforeState && plan.beforeState.goals) || [] });
    if (!r.ok) throw new Error('Could not undo the goal change.');
  },
};

// Registered in rollout order. (The OpenAI tool schemas Nora exposes live with the
// chat route; these are the executors the scaffold runs.)
export const NORA_ACTIONS = [logMealAction, setClientGoalAction];
