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

// ── TIER 2 · coach assignments (discipline-scoped, on-client) ───────────────
// Both wrap a hardened endpoint that enforces is-coach-on-client + discipline
// (2026-06-17). The tool front-checks is_coach_on_client for an honest preview;
// the endpoint (+ INSERT RLS) is the authoritative gate, so a 403 there surfaces
// as a clean message and NOTHING is audited.

async function requireOnClient(ctx, clientId) {
  if (!clientId || typeof clientId !== 'string') {
    throw new Error("Which client? I couldn't match one — tell me their name and I'll confirm before doing anything.");
  }
  var ok = await ctx.supabase.rpc('is_coach_on_client', { p_client_id: clientId });
  if (!(ok && ok.data === true)) throw new Error("You're not an active coach on this client, so I can't do that for them.");
}
async function ownProviderId(ctx, table) {
  var row = await ctx.supabase.from(table).select('id').eq('owner_id', ctx.actor.id).maybeSingle();
  return row && row.data ? row.data.id : null;
}

// assign_workout → POST /api/trainer/workout (trainer only). Undo archives the
// assignment(s) it created (a clean withdraw).
export const assignWorkoutAction = {
  name: 'assign_workout',
  roles: ['trainer'],
  source: 'nora',
  async buildPreview(ctx, input) {
    input = input || {};
    await requireOnClient(ctx, input.clientId);
    var title = String(input.title || '').trim().slice(0, 200);
    if (!title) throw new Error('What workout should I assign? Give me the title.');
    var trainerId = await ownProviderId(ctx, 'trainers');
    if (trainerId == null) throw new Error("You don't have a trainer profile, so I can't assign workouts.");
    var scheduledDate = input.scheduledDate ? String(input.scheduledDate).slice(0, 10) : null;
    var payload = (input.payload && typeof input.payload === 'object') ? input.payload : {};
    var description = input.description ? String(input.description).slice(0, 2000) : null;
    var body = { clientIds: [input.clientId], title: title, description: description, kind: 'template', scheduledDate: scheduledDate, payload: payload };
    var who = input.clientName ? String(input.clientName) : 'this client';
    var when = scheduledDate ? ' on ' + scheduledDate : '';
    return {
      summary: "Assign '" + title + "' to " + who + when,
      diff: [{ label: 'Workout', field: 'assignment', before: '—', after: title + when }],
      target: { userId: input.clientId, kind: 'workout', id: title },
      beforeState: { trainerId: trainerId, clientId: input.clientId, title: title, scheduledDate: scheduledDate },
      afterState: { title: title }, confirmedPayload: body,
    };
  },
  async execute(ctx, plan) {
    var r = await ctx.call('POST', '/api/trainer/workout', plan.confirmedPayload);
    if (!r.ok) throw new Error((r.data && r.data.error) || 'Could not assign the workout.');
    return r.data;
  },
  async undo(ctx, plan) {
    var b = plan.beforeState || {};
    var q = ctx.supabase.from('client_workouts').update({ status: 'archived' })
      .eq('trainer_id', b.trainerId).eq('client_id', b.clientId).eq('title', b.title).eq('status', 'published');
    if (b.scheduledDate) q = q.eq('scheduled_date', b.scheduledDate);
    await q;
  },
};

// assign_meal_plan → POST /api/nutritionist/meal-plan (nutritionist only). The
// endpoint archives the prior published plan + publishes the new one; undo
// archives the new one and republishes the prior (captured at preview).
export const assignMealPlanAction = {
  name: 'assign_meal_plan',
  roles: ['nutritionist'],
  source: 'nora',
  async buildPreview(ctx, input) {
    input = input || {};
    await requireOnClient(ctx, input.clientId);
    var title = String(input.title || '').trim().slice(0, 200);
    if (!title) throw new Error('What should I call the meal plan?');
    var days = Array.isArray(input.days) ? input.days : null;
    if (!days || !days.length) throw new Error("What's in the plan? I won't invent the meals — give me the days.");
    var nutriId = await ownProviderId(ctx, 'nutritionists');
    if (nutriId == null) throw new Error("You don't have a nutritionist profile, so I can't assign plans.");
    // Capture the plan currently published for this client (for undo).
    var prev = await ctx.supabase.from('client_meal_plans').select('id, title')
      .eq('nutritionist_id', nutriId).eq('client_id', input.clientId).eq('status', 'published').maybeSingle();
    var prevPlan = (prev && prev.data) || null;
    var weekStart = input.weekStart ? String(input.weekStart).slice(0, 10) : null;
    var body = { clientId: input.clientId, title: title, weekStart: weekStart, days: days };
    var who = input.clientName ? String(input.clientName) : 'this client';
    return {
      summary: "Assign meal plan '" + title + "' (" + days.length + ' days) to ' + who,
      diff: [{ label: 'Meal plan', field: 'published', before: prevPlan ? prevPlan.title : '—', after: title }],
      target: { userId: input.clientId, kind: 'meal_plan', id: title },
      beforeState: { nutritionistId: nutriId, clientId: input.clientId, title: title, prevPlanId: prevPlan ? prevPlan.id : null },
      afterState: { title: title }, confirmedPayload: body,
    };
  },
  async execute(ctx, plan) {
    var r = await ctx.call('POST', '/api/nutritionist/meal-plan', plan.confirmedPayload);
    if (!r.ok) throw new Error((r.data && r.data.error) || 'Could not assign the meal plan.');
    return r.data;
  },
  async undo(ctx, plan) {
    var b = plan.beforeState || {};
    // Archive the plan we just published…
    await ctx.supabase.from('client_meal_plans').update({ status: 'archived' })
      .eq('nutritionist_id', b.nutritionistId).eq('client_id', b.clientId).eq('title', b.title).eq('status', 'published');
    // …and restore the one that was published before, if any.
    if (b.prevPlanId) {
      await ctx.supabase.from('client_meal_plans').update({ status: 'published' }).eq('id', b.prevPlanId);
    }
  },
};

// set_program_detail → set_program_detail RPC (the discipline-split writer). The
// coach's OWN discipline is derived from their role (a trainer can only touch
// training, a nutritionist only nutrition); the RPC + the client_programs trigger
// enforce it server-side. Sets the program phase and/or a coach note for the
// section. Undo restores the prior phase + section (direct update; the trigger
// still gates it to the coach's discipline).
export const setProgramDetailAction = {
  name: 'set_program_detail',
  roles: ['trainer', 'nutritionist'],
  source: 'nora',
  async buildPreview(ctx, input) {
    input = input || {};
    await requireOnClient(ctx, input.clientId); // also asks if no client
    var discipline = ctx.actor.role === 'trainer' ? 'training' : 'nutrition';
    var role = ctx.actor.role === 'trainer' ? 'trainer' : 'nutritionist';
    // Authoritative front check: the discipline-scoped coach link (RPC backstops).
    var ok = await ctx.supabase.rpc('is_discipline_coach_on_client', { p_client_id: input.clientId, p_discipline: role });
    if (!(ok && ok.data === true)) {
      throw new Error("You're not the active " + role + " on this client, so I can't change their " + discipline + ' program.');
    }
    var phase = input.phase ? String(input.phase).slice(0, 60) : null;
    var note = input.note ? String(input.note).slice(0, 1000) : null;
    if (!phase && !note) throw new Error('What should I change — the program phase, or a note to the client?');

    var cur = await ctx.supabase.from('client_programs')
      .select('training_phase, nutrition_phase, detail').eq('user_id', input.clientId).maybeSingle();
    var row = (cur && cur.data) || {};
    var prevPhase = discipline === 'training' ? (row.training_phase || null) : (row.nutrition_phase || null);
    var prevSection = (row.detail && typeof row.detail === 'object' && row.detail[discipline]) ? row.detail[discipline] : null;

    var section = note ? { note: note, updatedAt: new Date().toISOString() } : null;
    var who = input.clientName ? String(input.clientName) : 'this client';
    var label = discipline === 'training' ? 'Training block' : 'Nutrition phase';
    var summary = phase
      ? (discipline === 'training' ? 'Move ' + who + ' to the ' + phase + ' training block' : "Set " + who + "'s nutrition phase to " + phase)
      : 'Update ' + who + "'s " + discipline + ' note';
    var diff = [];
    if (phase) diff.push({ label: label, field: 'phase', before: prevPhase || '—', after: phase });
    if (note) diff.push({ label: 'Note', field: 'note', before: (prevSection && prevSection.note) || '—', after: note });

    return {
      summary: summary, diff: diff,
      target: { userId: input.clientId, kind: 'program', id: discipline },
      beforeState: { clientId: input.clientId, discipline: discipline, prevPhase: prevPhase, prevSection: prevSection },
      afterState: { phase: phase },
      confirmedPayload: { p_client_id: input.clientId, p_discipline: discipline, p_phase: phase, p_detail: section },
    };
  },
  async execute(ctx, plan) {
    var r = await ctx.supabase.rpc('set_program_detail', plan.confirmedPayload);
    if (r && r.error) throw new Error(r.error.message || 'Could not update the program.');
    return r ? r.data : null;
  },
  async undo(ctx, plan) {
    var b = plan.beforeState || {};
    var col = b.discipline === 'training' ? 'training_phase' : 'nutrition_phase';
    // Splice the discipline's section back to what it was, leaving the other
    // discipline's CURRENT value untouched. The trigger still requires the
    // coach's own discipline for this change (they have it).
    var cur = await ctx.supabase.from('client_programs').select('detail').eq('user_id', b.clientId).maybeSingle();
    var detail = (cur && cur.data && cur.data.detail && typeof cur.data.detail === 'object') ? { ...cur.data.detail } : {};
    if (b.prevSection == null) delete detail[b.discipline]; else detail[b.discipline] = b.prevSection;
    var patch = { detail: detail };
    patch[col] = b.prevPhase;
    await ctx.supabase.from('client_programs').update(patch).eq('user_id', b.clientId);
  },
};

// Registered in rollout order. (The OpenAI tool schemas Nora exposes live with the
// chat route; these are the executors the scaffold runs.)
export const NORA_ACTIONS = [logMealAction, setClientGoalAction, assignWorkoutAction, assignMealPlanAction, setProgramDetailAction];
