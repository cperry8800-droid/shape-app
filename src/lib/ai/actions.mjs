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

import { gateAction, disclaimerFor } from '../compliance/nutrition.mjs';
import { applyRemember, applyForget, MEMORY_KIND } from './noraMemory.mjs';
import { matchHabit, waterLiters, REMINDER_KINDS, validReminderTime } from './memberTools.mjs';

// NC1 — compute the scope disclaimer for an individualized nutrition action so
// Nora's confirm card states it up front (the endpoint is the authoritative gate).
async function nutritionScopeDisclaimer(ctx, clientId, actionType) {
  try {
    const [cred, lic, comp] = await Promise.all([
      ctx.supabase.from('provider_credentials').select('credential_type, insurance_expires').eq('owner_id', ctx.actor.id).maybeSingle(),
      ctx.supabase.from('provider_licenses').select('state, expires_on').eq('owner_id', ctx.actor.id),
      ctx.supabase.from('client_compliance').select('us_state').eq('user_id', clientId).maybeSingle(),
    ]);
    const provider = {
      credentialType: (cred && cred.data && cred.data.credential_type) || 'nutritionist',
      insuranceExpires: (cred && cred.data && cred.data.insurance_expires) || null,
      licenses: ((lic && lic.data) || []).map((l) => ({ state: l.state, expires: l.expires_on })),
    };
    const clientState = (comp && comp.data && comp.data.us_state) || null;
    const g = gateAction(provider, clientState, actionType);
    return disclaimerFor(g.scope, g.allowed);
  } catch {
    return '';
  }
}

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
    // macros directly on the actor's OWN RLS-scoped row. The stale-write guard
    // rides IN the statement (spec #1652): every column must still hold what
    // execute wrote — a newer edit → zero rows → the honest conflict.
    var b = plan.beforeState || {};
    var a = plan.afterState || {};
    var q = ctx.supabase
      .from('daily_health_snapshot')
      .update({ calories: b.calories, protein_g: b.protein_g, carbs_g: b.carbs_g, fat_g: b.fat_g, hydration_l: b.hydration_l })
      .eq('user_id', ctx.actor.id)
      .eq('snapshot_date', b.snapshot_date);
    [['calories', a.calories], ['protein_g', a.protein_g], ['carbs_g', a.carbs_g], ['fat_g', a.fat_g], ['hydration_l', a.hydration_l]]
      .forEach(function (kv) { q = kv[1] == null ? q.is(kv[0], null) : q.eq(kv[0], kv[1]); });
    var res = await q.select('user_id');
    if (res.error || !Array.isArray(res.data) || !res.data.length) throw new Error('Changed since — nothing undone.');
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
  roles: ['trainer', 'nutritionist', 'dietitian', 'admin'],
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
  roles: ['nutritionist', 'dietitian'],
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
    // NC1 — a meal plan is INDIVIDUALIZED nutrition care; surface the scope
    // disclaimer (and licensure framing) on the confirm card.
    var disclaimer = await nutritionScopeDisclaimer(ctx, input.clientId, 'meal_plan');
    var diff = [{ label: 'Meal plan', field: 'published', before: prevPlan ? prevPlan.title : '—', after: title }];
    if (disclaimer) diff.push({ label: 'Scope', field: 'compliance', before: '—', after: disclaimer });
    return {
      summary: "Assign meal plan '" + title + "' (" + days.length + ' days) to ' + who,
      diff: diff,
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
  roles: ['trainer', 'nutritionist', 'dietitian'],
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

// add_review_note → POST /api/coach/review-note. The coach must own the provider
// row on the workout session (endpoint + RLS enforce). Undo deletes the created
// note (the author-delete policy authorizes it). The execute enriches afterState
// with the new note id so undo can target it.
export const addReviewNoteAction = {
  name: 'add_review_note',
  roles: ['trainer', 'nutritionist', 'dietitian'],
  source: 'nora',
  async buildPreview(ctx, input) {
    input = input || {};
    if (!input.sessionId || typeof input.sessionId !== 'string') {
      throw new Error('Which session should I add the note to? I need the session id.');
    }
    var text = String(input.body || '').trim().slice(0, 4000);
    if (!text) throw new Error("What should the note say? I won't write one for you.");
    var vis = ['client', 'coach_private', 'team'].includes(input.visibility) ? input.visibility : 'client';
    // Read the session — if the coach can't read it (RLS), it isn't theirs.
    var sess = await ctx.supabase.from('workout_sessions').select('id, client_id, provider_role').eq('id', input.sessionId).maybeSingle();
    if (!(sess && sess.data)) throw new Error("I can't find that session — it may not be one of yours.");
    var preview = text.length > 80 ? text.slice(0, 77) + '…' : text;
    return {
      summary: 'Add a review note to this session' + (vis === 'coach_private' ? ' (private to you)' : vis === 'team' ? ' (visible to the care team)' : ''),
      diff: [{ label: 'Review note', field: 'body', before: '—', after: preview }],
      target: { userId: sess.data.client_id, kind: 'review_note', id: input.sessionId },
      beforeState: { sessionId: input.sessionId },
      afterState: {},
      confirmedPayload: { sessionId: input.sessionId, body: text, visibility: vis },
    };
  },
  async execute(ctx, plan) {
    var r = await ctx.call('POST', '/api/coach/review-note', plan.confirmedPayload);
    if (!r.ok) throw new Error((r.data && r.data.error) || 'Could not add the note.');
    plan.afterState = { ...(plan.afterState || {}), noteId: r.data && r.data.id }; // captured for undo
    return r.data;
  },
  async undo(ctx, plan) {
    var id = plan.afterState && plan.afterState.noteId;
    if (!id) return;
    await ctx.supabase.from('coach_workout_review_notes').delete().eq('id', id);
  },
};

// reschedule_session → POST /api/sessions/manage (action 'reschedule'). The
// endpoint enforces coach-on-session + only-active-is-reschedulable. Undo moves
// it back to the original slot (captured at preview).
export const rescheduleSessionAction = {
  name: 'reschedule_session',
  roles: ['trainer', 'nutritionist', 'dietitian'],
  source: 'nora',
  async buildPreview(ctx, input) {
    input = input || {};
    if (!input.sessionId || typeof input.sessionId !== 'string') {
      throw new Error('Which session should I move? I need the session id.');
    }
    var date = String(input.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('What day should I move it to? Give me a date (YYYY-MM-DD).');
    var time = /^\d{1,2}:\d{2}$/.test(String(input.time || '')) ? String(input.time) : null;
    var sess = await ctx.supabase.from('sessions').select('id, client_id, scheduled_at, status').eq('id', input.sessionId).maybeSingle();
    if (!(sess && sess.data)) throw new Error("I can't find that session — it may not be one of yours.");
    var prev = String(sess.data.scheduled_at || '');
    var prevDate = prev.slice(0, 10);
    var prevTime = prev.length >= 16 ? prev.slice(11, 16) : null;
    var fmt = function (d, t) { return d + (t && t !== '00:00' ? ' ' + t : ''); };
    return {
      summary: 'Move this session to ' + fmt(date, time),
      diff: [{ label: 'Session time', field: 'scheduled_at', before: fmt(prevDate, prevTime) || '—', after: fmt(date, time) }],
      target: { userId: sess.data.client_id, kind: 'session', id: input.sessionId },
      beforeState: { sessionId: input.sessionId, prevDate: prevDate, prevTime: prevTime },
      afterState: { date: date, time: time },
      confirmedPayload: { sessionId: input.sessionId, action: 'reschedule', date: date, time: time },
    };
  },
  async execute(ctx, plan) {
    var r = await ctx.call('POST', '/api/sessions/manage', plan.confirmedPayload);
    if (!r.ok) throw new Error((r.data && r.data.error) || 'Could not reschedule the session.');
    return r.data;
  },
  async undo(ctx, plan) {
    var b = plan.beforeState || {};
    if (!b.prevDate) return;
    var r = await ctx.call('POST', '/api/sessions/manage', { sessionId: b.sessionId, action: 'reschedule', date: b.prevDate, time: b.prevTime });
    if (!r.ok) throw new Error((r.data && r.data.error) || 'Could not undo the reschedule.');
  },
};

// ── TIER 1 · member self-service tools (PR C, spec #1652) ────────────────────
// Self-scoped (ctx.actor.id), preview → confirm → audit → undo like log_meal.
// Exposed ONLY to verified members (the route's MEMBER_TOOLS list is built
// after the membership check); each preview re-checks ctx.isMember as
// defense-in-depth. Every undo enforces its predicate IN the atomic statement
// — zero affected rows = the honest "changed since" conflict.
var MEMBER_GATE_MSG = 'Becoming a member unlocks this.';
function memberGate(ctx) { if (ctx.isMember !== true) throw new Error(MEMBER_GATE_MSG); }

// The member's stored IANA timezone (client_profiles.timezone — captured on
// app open, the same source the award day-clamp trusts). null when unset.
async function memberTz(ctx) {
  try {
    var sel = await ctx.supabase.from('client_profiles').select('timezone').eq('user_id', ctx.actor.id).maybeSingle();
    var tz = sel && sel.data && sel.data.timezone;
    return typeof tz === 'string' && tz ? tz : null;
  } catch (e) { return null; }
}
// The member's LOCAL calendar day — day-bucketed writes (weigh-in, habit,
// hydration) must land on THEIR today (the src/lib/local-day.ts contract), not
// UTC's: a US member logging at 9 pm is still on today, not tomorrow. The
// server has no device clock, so the stored zone decides; missing/invalid → UTC.
async function memberToday(ctx) {
  var tz = await memberTz(ctx);
  if (tz) {
    try {
      var day = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
    } catch (e) { /* bad stored zone → UTC */ }
  }
  return new Date().toISOString().slice(0, 10);
}

// log_weigh_in → upsert today's client_weigh_ins row (the ShapeWeighIns path;
// fires the goal-milestone check best-effort).
export const logWeighInAction = {
  name: 'log_weigh_in',
  roles: ['client', 'trainer', 'nutritionist', 'admin'], // your OWN weigh-in
  source: 'nora',
  async buildPreview(ctx, input) {
    memberGate(ctx);
    input = input || {};
    var weight = Number(input.weight);
    if (!Number.isFinite(weight) || weight <= 0 || weight >= 1500) throw new Error('Tell me the weight to log (a number).');
    weight = Math.round(weight * 10) / 10;
    // A supplied-but-unknown unit is REJECTED (never coerced to lb).
    if (input.unit != null && input.unit !== 'kg' && input.unit !== 'lb') throw new Error('Which unit — lb or kg?');
    var today = await memberToday(ctx);
    var sel = await ctx.supabase
      .from('client_weigh_ins')
      .select('weight, unit')
      .eq('user_id', ctx.actor.id)
      .eq('logged_on', today)
      .maybeSingle();
    if (sel.error) throw new Error('Could not read today’s weigh-in right now.');
    var cur = sel.data || null;
    // The unit is always EXPLICIT and never assumed: the member's own word,
    // else today's existing row's unit. Neither → ask (a first weigh-in stored
    // in the wrong unit is a real wrong weight).
    var unit = input.unit || (cur && cur.unit) || null;
    if (!unit) throw new Error('Which unit — lb or kg?');
    var before = { logged_on: today, weight: cur ? Number(cur.weight) : null, unit: cur ? String(cur.unit) : null };
    var after = { logged_on: today, weight: weight, unit: unit };
    return {
      summary: 'Log today’s weigh-in: ' + weight + ' ' + unit + (cur ? ' (replaces ' + before.weight + ' ' + before.unit + ')' : ''),
      diff: [{ label: 'Weight', before: cur ? before.weight + ' ' + before.unit : '—', after: weight + ' ' + unit }],
      target: { userId: ctx.actor.id, kind: 'weigh_in', id: today },
      beforeState: before, afterState: after, confirmedPayload: { weight: weight, unit: unit },
    };
  },
  async execute(ctx, plan) {
    var p = plan.confirmedPayload || {};
    var res = await ctx.supabase
      .from('client_weigh_ins')
      .upsert({ user_id: ctx.actor.id, logged_on: plan.afterState.logged_on, weight: p.weight, unit: p.unit }, { onConflict: 'user_id,logged_on' });
    if (res.error) throw new Error('Could not log the weigh-in.');
    // The same milestone check the weigh-in sheet fires — best-effort.
    try { await ctx.supabase.rpc('award_my_goal_milestones'); } catch (e) { /* non-blocking */ }
    return { ok: true };
  },
  async undo(ctx, plan) {
    var b = plan.beforeState || {};
    var a = plan.afterState || {};
    // Value-snapshot predicate (the table has no updated_at): the row must
    // still hold what execute wrote, IN the statement.
    var res;
    if (b.weight != null) {
      res = await ctx.supabase
        .from('client_weigh_ins')
        .update({ weight: b.weight, unit: b.unit })
        .eq('user_id', ctx.actor.id).eq('logged_on', a.logged_on)
        .eq('weight', a.weight).eq('unit', a.unit)
        .select('user_id');
    } else {
      res = await ctx.supabase
        .from('client_weigh_ins')
        .delete()
        .eq('user_id', ctx.actor.id).eq('logged_on', a.logged_on)
        .eq('weight', a.weight).eq('unit', a.unit)
        .select('user_id');
    }
    if (res.error || !Array.isArray(res.data) || !res.data.length) throw new Error('Changed since — nothing undone.');
  },
};

// log_water → the /api/client/hydration signed delta (0-clamped, ±2 L cap
// there). Undo = the ACCUMULATOR INVERSE (a negative delta), deliberately not
// a snapshot restore: it subtracts exactly what was added and preserves any
// concurrent additions — strictly stronger than a restore under the spec's
// no-blind-overwrite rule (the documented deviation).
export const logWaterAction = {
  name: 'log_water',
  roles: ['client', 'trainer', 'nutritionist', 'admin'],
  source: 'nora',
  async buildPreview(ctx, input) {
    memberGate(ctx);
    input = input || {};
    var deltaL = waterLiters(input.amount, input.unit);
    if (deltaL == null) throw new Error('Tell me the amount in ml or oz — e.g. 500 ml or 16 oz.');
    if (deltaL > 2) throw new Error('That’s more than one log can add (2 L max) — log it in parts.');
    var today = await memberToday(ctx);
    var sel = await ctx.supabase
      .from('daily_health_snapshot')
      .select('hydration_l')
      .eq('user_id', ctx.actor.id)
      .eq('snapshot_date', today)
      .maybeSingle();
    // A failed read must never render as a fabricated 0 L on the card.
    if (sel.error) throw new Error('Could not read today’s hydration right now.');
    var cur = Number((sel.data && sel.data.hydration_l) || 0) || 0;
    return {
      summary: 'Add ' + input.amount + ' ' + input.unit + ' of water (' + deltaL + ' L) to today',
      diff: [{ label: 'Hydration', before: cur + ' L', after: Math.round((cur + deltaL) * 1000) / 1000 + ' L' }],
      target: { userId: ctx.actor.id, kind: 'hydration', id: today },
      beforeState: { hydration_l: cur }, afterState: { deltaL: deltaL, date: today }, confirmedPayload: { deltaL: deltaL, date: today },
    };
  },
  async execute(ctx, plan) {
    // date = the member's LOCAL day from preview time, so the delta lands on
    // the same calendar day the card promised.
    var r = await ctx.call('POST', '/api/client/hydration', { deltaL: plan.confirmedPayload.deltaL, date: plan.confirmedPayload.date });
    if (!r.ok) throw new Error((r.data && r.data.error) || 'Could not log the water.');
    return r.data;
  },
  async undo(ctx, plan) {
    var r = await ctx.call('POST', '/api/client/hydration', { deltaL: -plan.afterState.deltaL, date: plan.afterState.date });
    if (!r.ok) throw new Error((r.data && r.data.error) || 'Could not undo the water log.');
  },
};

// check_habit → fuzzy-match ONE of the member's own active habits (fail-closed
// on misses/ambiguity — never guess-toggles), then the existing toggle path.
export const checkHabitAction = {
  name: 'check_habit',
  roles: ['client', 'trainer', 'nutritionist', 'admin'],
  source: 'nora',
  async buildPreview(ctx, input) {
    memberGate(ctx);
    input = input || {};
    var sel = await ctx.supabase
      .from('user_habits')
      .select('id, name')
      .eq('user_id', ctx.actor.id)
      .is('archived_at', null);
    if (sel.error) throw new Error('Could not read your habits right now.');
    var m = matchHabit(sel.data || [], input.habit);
    if (m.error === 'ambiguous') throw new Error('Which one? ' + m.candidates.map(function (c) { return '“' + c.name + '”'; }).join(', ') + '.');
    if (m.error) throw new Error((m.names && m.names.length) ? 'No habit matches that. Yours are: ' + m.names.join(' · ') + '.' : 'You have no active habits yet — add one on the Habits page.');
    var today = await memberToday(ctx);
    var done = await ctx.supabase
      .from('user_habit_completions')
      .select('id')
      .eq('user_id', ctx.actor.id)
      .eq('habit_id', m.habit.id)
      .eq('done_on', today)
      .maybeSingle();
    if (done.error) throw new Error('Could not check that habit right now.');
    if (done.data) throw new Error('“' + m.habit.name + '” is already checked off for today.');
    return {
      summary: 'Check off “' + m.habit.name + '” for today',
      diff: [{ label: m.habit.name, before: 'Not done', after: 'Done ✓' }],
      target: { userId: ctx.actor.id, kind: 'habit', id: m.habit.id },
      beforeState: { habitId: m.habit.id, doneOn: today, wasDone: false },
      afterState: { habitId: m.habit.id, doneOn: today },
      confirmedPayload: { id: m.habit.id, date: today },
    };
  },
  async execute(ctx, plan) {
    // ADD-ONLY, never the raw toggle: if the member checked this habit
    // elsewhere while the confirm card sat open, a blind toggle would UNCHECK
    // it (and revoke its points) — the exact opposite of the previewed
    // "Not done → Done". Re-check right before the toggle and fail stale.
    var p = plan.confirmedPayload;
    var done = await ctx.supabase
      .from('user_habit_completions')
      .select('id')
      .eq('user_id', ctx.actor.id)
      .eq('habit_id', p.id)
      .eq('done_on', p.date)
      .maybeSingle();
    if (done.error) throw new Error('Could not check the habit right now.');
    if (done.data) throw new Error('Already checked off — nothing to change.');
    var r = await ctx.call('POST', '/api/client/habits', { action: 'toggle', id: p.id, date: p.date });
    if (!r.ok) throw new Error((r.data && r.data.error) || 'Could not check the habit.');
    return r.data;
  },
  async undo(ctx, plan) {
    // In-statement guard: delete today's completion for THIS habit — zero rows
    // means it was already unchecked (or re-toggled) since.
    var a = plan.afterState || {};
    var res = await ctx.supabase
      .from('user_habit_completions')
      .delete()
      .eq('user_id', ctx.actor.id)
      .eq('habit_id', a.habitId)
      .eq('done_on', a.doneOn)
      .select('id');
    if (res.error || !Array.isArray(res.data) || !res.data.length) throw new Error('Changed since — nothing undone.');
    // Mirror the habits route's untoggle path: revoke the +3 award for the
    // deleted completion so the Shape Score can't stay inflated after undo.
    try {
      var rev = await ctx.supabase.rpc('revoke_habit', { p_completion_id: res.data[0].id });
      if (rev && rev.error) console.warn('[nora-habit] revoke_habit failed after undo', { completionId: res.data[0].id });
    } catch (e) { console.warn('[nora-habit] revoke_habit failed after undo', { completionId: res.data[0].id }); }
  },
};

// set_reminder → the reminders route's own validation, then its insert path.
export const setReminderAction = {
  name: 'set_reminder',
  roles: ['client', 'trainer', 'nutritionist', 'admin'],
  source: 'nora',
  async buildPreview(ctx, input) {
    memberGate(ctx);
    input = input || {};
    var kind = REMINDER_KINDS.indexOf(String(input.kind)) >= 0 ? String(input.kind) : null;
    if (!kind) throw new Error('What kind of reminder? weigh_in, checkin, water, photo, or custom.');
    if (!validReminderTime(input.time)) throw new Error('Give me the time as HH:MM (24h), e.g. 07:30.');
    var days = Array.isArray(input.days)
      ? Array.from(new Set(input.days.map(Number).filter(function (d) { return Number.isInteger(d) && d >= 0 && d <= 6; }))).sort()
      : [1, 2, 3, 4, 5]; // stated default: weekdays
    if (!days.length) throw new Error('Pick at least one day (0=Sun … 6=Sat).');
    var label = kind === 'custom' ? String(input.label || '').slice(0, 80) : '';
    if (kind === 'custom' && !label) throw new Error('What should the custom reminder say?');
    // The reminder fires in the MEMBER's zone (the cron interprets at_time in
    // the row tz; the route defaults to UTC) — send their stored zone like the
    // Settings flows send the device zone. Unset zone → UTC, said on the card.
    var tz = await memberTz(ctx);
    var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var daysLabel = days.length === 7 ? 'every day' : days.map(function (d) { return DAYS[d]; }).join(' ');
    return {
      summary: 'Set a ' + (label || kind.replace('_', '-')) + ' reminder at ' + input.time + (tz ? '' : ' (UTC — open the app once to set your timezone)') + ' · ' + daysLabel,
      diff: [{ label: 'Reminder', before: '—', after: (label || kind) + ' · ' + input.time + ' · ' + daysLabel + (tz ? '' : ' · UTC' ) }],
      target: { userId: ctx.actor.id, kind: 'reminder', id: null },
      beforeState: {}, afterState: { kind: kind, atTime: String(input.time), days: days, label: label },
      confirmedPayload: { kind: kind, label: label, atTime: String(input.time), days: days, tz: tz || 'UTC' },
    };
  },
  async execute(ctx, plan) {
    var r = await ctx.call('POST', '/api/client/reminders', plan.confirmedPayload);
    if (!r.ok) throw new Error((r.data && r.data.error) || 'Could not set the reminder.');
    // Keep the created row's id for the undo predicate.
    var rem = r.data && r.data.reminder;
    if (rem && rem.id) plan.afterState.id = rem.id;
    return r.data;
  },
  async undo(ctx, plan) {
    var a = plan.afterState || {};
    if (!a.id) throw new Error('Changed since — nothing undone.');
    // In-statement guard: only an UNEDITED reminder (same kind + time) deletes.
    var res = await ctx.supabase
      .from('user_scheduled_reminders')
      .delete()
      .eq('id', a.id)
      .eq('user_id', ctx.actor.id)
      .eq('kind', a.kind)
      .eq('at_time', a.atTime)
      .select('id');
    if (res.error || !Array.isArray(res.data) || !res.data.length) throw new Error('Changed since — nothing undone.');
  },
};

// ── Memory · remember / forget (DIRECT-with-audit — no confirm card by spec
// decision, #1652). These are NOT proposal actions: the support-chat route runs
// them inline for VERIFIED MEMBERS ONLY (the tool list is assembled after the
// fail-closed membership check; ctx.isMember re-checks here as defense-in-depth).
// Writes go through ctx.casWrite (server.ts casWriteUserGoals — CAS on the
// {rev, notes} doc); every write audits via ctx.audit keyed on the note's own
// id, so a dedupe-hit retry REPAIRS a missing audit row instead of skipping it.
// Audits are PER EVENT: a fresh write always inserts its own audit row. The
// existence check runs ONLY on a dedupe hit (repairOnly) — that's the
// retry-after-audit-failure repair path — so a remember → forget → remember of
// the SAME text (same deterministic id) still logs the second remember as its
// own event instead of being suppressed by the historical row.
async function ensureMemoryAudit(ctx, action, noteId, payload, repairOnly) {
  try {
    if (repairOnly) {
      var existing = await ctx.supabase
        .from('ai_audit_log').select('id')
        .eq('actor_user_id', ctx.actor.id).eq('action', action)
        .eq('target_id', noteId).limit(1);
      if (existing && Array.isArray(existing.data) && existing.data.length) return true;
    }
    await ctx.audit.log({
      actorUserId: ctx.actor.id, actorRole: ctx.actor.role, source: 'nora', action,
      target: { userId: ctx.actor.id, kind: MEMORY_KIND, id: noteId },
      confirmedPayload: payload,
    });
    return true;
  } catch (e) {
    // Safe metadata ONLY — never note text, never raw tool arguments.
    console.warn('[nora-memory] audit failed', { action, noteId, status: 'unaudited' });
    return false;
  }
}

export const rememberMemoryTool = {
  name: 'remember',
  async run(ctx, input) {
    if (ctx.isMember !== true) return { error: 'members_only' };
    var text = String((input && input.note) || '').trim();
    if (!text) return { error: 'empty_note' };
    var now = new Date().toISOString();
    var out = null;
    var w = await ctx.casWrite(MEMORY_KIND, function (doc) { out = applyRemember(doc, text, now); return out; });
    if (!w.ok) return { error: w.error || 'conflict' };
    // remember's audit may carry the stored text (it persists in the doc anyway).
    // A dedupe hit is the retry path → repair-only; a fresh write always logs
    // its own event.
    var audited = await ensureMemoryAudit(ctx, 'remember', out.note.id, { noteId: out.note.id, text: out.note.text }, out.deduped === true);
    return { done: true, noteId: out.note.id, deduped: out.deduped === true, audited };
  },
};

export const forgetMemoryTool = {
  name: 'forget',
  async run(ctx, input) {
    if (ctx.isMember !== true) return { error: 'members_only' };
    var sel = { noteId: input && input.note_id, note: input && input.note };
    var out = null;
    var w = await ctx.casWrite(MEMORY_KIND, function (doc) { out = applyForget(doc, sel); return out; });
    if (!w.ok) return { error: w.error || 'conflict', candidates: w.candidates || undefined };
    // A forget must actually forget: the audit row records the id + stamps ONLY.
    // Every forget is its own event — never repair-only.
    var audited = await ensureMemoryAudit(ctx, 'forget', out.removed.id, { noteId: out.removed.id }, false);
    return { done: true, noteId: out.removed.id, audited };
  },
};

// Registered in rollout order. (The OpenAI tool schemas Nora exposes live with the
// chat route; these are the executors the scaffold runs.) The memory tools above
// are deliberately NOT in this list — they're direct, not proposal-drafted.
export const NORA_ACTIONS = [logMealAction, setClientGoalAction, assignWorkoutAction, assignMealPlanAction, setProgramDetailAction, addReviewNoteAction, rescheduleSessionAction, logWeighInAction, logWaterAction, checkHabitAction, setReminderAction];
