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

import { randomUUID } from 'node:crypto';
import { gateAction, disclaimerFor } from '../compliance/nutrition.mjs';
import { applyRemember, applyForget, MEMORY_KIND } from './noraMemory.mjs';
import { matchHabit, waterLiters, REMINDER_KINDS, validReminderTime } from './memberTools.mjs';
import {
  cleanBrief, generateDraft, expandDraft, summarizeDraft, moveLine, dayLabel, readCoachLoadUnit, readClientContext,
  draftSessions, sessionWeeks, isoDateOrEmpty, clipText, TEMPLATE_NOTICE,
} from './workoutDraft.mjs';
// The chat route's no-model path reads a trainer's request with this (it imports Nora's
// actions, never the draft core directly).
export { briefFromText as draftBriefFromText } from './workoutDraft.mjs';
import { cleanMealBrief, pickMeals, buildMealDoc, mealDraftDiff, draftName as mealDraftName } from './mealDraft.mjs';

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
    // ⚠ THEIR DAY, NOT UTC'S. An evening log in the Americas landed on tomorrow, while
    // the app logs to the member's own day; the route takes the date it is given.
    var today = await memberToday(ctx);
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
      beforeState: before, afterState: after, confirmedPayload: Object.assign({}, macros, { date: today }),
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

// The UTC calendar day: what /api/trainer/workout's boundary calls today
// (`new Date().toISOString().slice(0, 10)`), so a preview never promises a day the
// route then refuses as past.
function utcToday() { return new Date().toISOString().slice(0, 10); }
// ⚠ A CLIENT'S SESSION NEEDS A DAY, AND NORA NEVER PICKS ONE. /api/trainer/workout has
// refused an undated workout since the week boundary (a session has to land in a week
// to be judged and published), but assign_workout previewed one happily — so the coach
// confirmed a card that could only fail. The preview asks instead, and refuses a day
// that has passed, which the boundary refuses too and answered "Please retry".
function assignDate(raw, ask) {
  if (raw == null || String(raw).trim() === '') throw new Error(ask);
  var d = isoDateOrEmpty(raw);
  if (!d) throw new Error('I need the day as a date (YYYY-MM-DD). Which day?');
  if (d < utcToday()) throw new Error(d + ' has already passed. Which day should it go on?');
  return d;
}

// assign_workout → POST /api/trainer/workout (trainer only). Undo archives the
// assignment(s) it created (a clean withdraw).
// ⚠ THIS ASSIGNS BY TITLE: no exercises ride with it unless a payload does, so the
// client gets an empty session with that name. Building a session is draft_workout's
// job; this stays for a coach who wants exactly that, and its card says so.
export const assignWorkoutAction = {
  name: 'assign_workout',
  roles: ['trainer'],
  source: 'nora',
  async buildPreview(ctx, input) {
    input = input || {};
    await requireOnClient(ctx, input.clientId);
    var title = String(input.title || '').trim().slice(0, 200);
    if (!title) throw new Error('What workout should I assign? Give me the title.');
    var who = input.clientName ? String(input.clientName) : 'this client';
    var scheduledDate = assignDate(input.scheduledDate, "Which day should I put '" + title + "' on " + who + "'s calendar? Tell me the date and I'll draft it.");
    var trainerId = await ownProviderId(ctx, 'trainers');
    if (trainerId == null) throw new Error("You don't have a trainer profile, so I can't assign workouts.");
    var payload = (input.payload && typeof input.payload === 'object') ? input.payload : {};
    var description = input.description ? String(input.description).slice(0, 2000) : null;
    var body = { clientIds: [input.clientId], title: title, description: description, kind: 'template', scheduledDate: scheduledDate, payload: payload };
    var when = ' on ' + scheduledDate;
    var empty = !(Array.isArray(payload.exercises) && payload.exercises.length);
    var diff = [{ label: 'Workout', field: 'assignment', before: '—', after: title + when }];
    if (empty) diff.push({ label: 'Exercises', field: 'exercises', before: '—', after: 'None — title only' });
    return {
      summary: "Assign '" + title + "' to " + who + when + (empty ? ' (title only, no exercises)' : ''),
      diff: diff,
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

// ── draft_workout · a trainer asks Nora to BUILD a session or a program ─────────
// The draft is generated INSIDE buildPreview (src/lib/ai/workoutDraft.mjs, the core
// the website builder's "Draft with AI" route shares), so the signed token carries the
// exact rows the coach reviewed: confirm executes the token's payload and never asks
// the model again. Two outcomes, both confirm-required, both undoable:
//
//   save   → POST /api/coach/plans as an UNPUBLISHED program, with an id minted here so
//            the card can link straight to it ("Open in builder"). Undo deletes it only
//            while it is still the revision this saved (an edit in the builder wins).
//   assign → POST /api/trainer/workout, ONE call, when the whole draft lands in ONE
//            client-week. Every session is stamped with a template id minted here, so
//            undo archives exactly the sessions this put on the calendar and nothing
//            the coach had there already.
//
// ⚠ A MULTI-WEEK PROGRAM FOR A CLIENT IS SAVED, NOT ASSIGNED. The boundary publishes one
// client-week per call; a program spanning several would publish week by week, and a
// guardrail hold on week 3 would leave weeks 1-2 live with no audit row and no undo,
// because confirmChange audits only a whole success. The builder's own Assign already
// handles that honestly (start date, preview, "First 2 of 4 weeks published"), so the
// draft is saved with the client named and the coach assigns it there.
var WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// The phone card shows week 1 move by move, then cuts off: a 7-day week of 16-move
// days is 112 lines, which no one reviews on a phone. The builder holds the rest.
var CARD_MOVES = 36;
function draftDiff(built, spec, source, sessions) {
  var rows = [];
  if (source === 'template') rows.push({ label: 'Source', after: TEMPLATE_NOTICE });
  var summary = summarizeDraft(built.builder, spec);
  var left = CARD_MOVES;
  var days = built.builder.weeks[0].days;
  days.forEach(function (day, i) {
    var moves = (day.blocks || []).flatMap(function (b) { return b.rows || []; });
    // An assigned day is labelled by the date it lands on, which is what the coach chose.
    var s = sessions && sessions[i];
    var label = s ? WEEKDAY[new Date(s.scheduledDate + 'T00:00:00Z').getUTCDay()] + ' ' + s.scheduledDate + ' · ' + day.name : dayLabel(day);
    rows.push({ label: label, after: moves.length + ' move' + (moves.length === 1 ? '' : 's') });
    var shown = moves.slice(0, Math.max(0, left));
    shown.forEach(function (r) { rows.push({ label: '', after: moveLine(r) }); });
    left -= shown.length;
    if (shown.length < moves.length) rows.push({ label: '', after: '+' + (moves.length - shown.length) + ' more in the builder' });
  });
  if (summary.repeat) rows.push({ label: 'Weeks', after: summary.repeat });
  var allRows = built.builder.weeks[0].days.flatMap(function (d) { return d.blocks.flatMap(function (b) { return b.rows; }); });
  if (allRows.some(function (r) { return !(Number(r.load) > 0); })) {
    rows.push({ label: 'Loads', after: 'Left blank unless you gave them — RPE sets the effort' });
  }
  if (spec.notes) rows.push({ label: 'Note', after: spec.notes });
  return rows;
}
function programsUrl(planId, clientId) {
  return '/newdesign/TrainerApp.html#programs?plan=' + encodeURIComponent(planId) + (clientId ? '&client=' + encodeURIComponent(clientId) : '');
}
export const draftWorkoutAction = {
  name: 'draft_workout',
  roles: ['trainer'],
  // A dual-role account that also trains may draft (owner, 2026-10-07): this action
  // saves to the account's own trainers listing and branches on no role afterwards.
  heldRoles: true,
  source: 'nora',
  async buildPreview(ctx, input) {
    input = input || {};
    var brief = cleanBrief(input);
    if (!brief.request) throw new Error("Tell me what to build — e.g. 'lower body, 50 minutes, barbell, intermediate'.");
    // NEVER a guessed client: a named one must resolve to an id this trainer coaches.
    var named = !!(input.clientId || input.clientName);
    var clientId = null;
    var who = null;
    if (named) {
      await requireOnClient(ctx, input.clientId);
      clientId = input.clientId;
      who = input.clientName ? clipText(input.clientName, 60) : 'this client';
    }
    var wantsAssign = named && input.saveOnly !== true;
    var rawDate = input.scheduledDate || input.startDate;
    var date = '';
    var trainerId = null;
    if (wantsAssign && brief.kind === 'day') {
      // ⚠ NEVER A GUESSED DATE. Asked before the model runs, so a question costs nothing.
      date = assignDate(rawDate, 'Which day should ' + who + " do it? Tell me the date and I'll draft it.");
    } else if (wantsAssign && brief.weeks === 1 && rawDate) {
      date = assignDate(rawDate, '');
    }
    if (date) {
      trainerId = await ownProviderId(ctx, 'trainers');
      if (trainerId == null) throw new Error("You don't have a trainer profile, so I can't assign workouts.");
    }
    var unit = brief.unit || await readCoachLoadUnit(ctx.supabase, ctx.actor.id);
    var context = clientId ? await readClientContext(ctx.supabase, clientId) : null;
    var gen = await generateDraft({ ...brief, unit: unit, client: context }, { callModel: typeof ctx.draftModel === 'function' ? ctx.draftModel : null });
    if (!gen.ok) throw new Error(gen.message);
    var spec = gen.spec;
    var built = expandDraft(spec);
    var templateTag = gen.source === 'template' ? TEMPLATE_NOTICE + ' ' : '';

    var mode = date ? 'assign' : 'save';
    var why = '';
    var sessions = null;
    var draftId = null;
    if (mode === 'assign') {
      // The template id every session carries, minted for this draft alone: undo
      // archives by it, so it never touches a session the coach had there already.
      draftId = randomUUID();
      sessions = draftSessions(built, date, draftId);
      var weeks = sessionWeeks(sessions);
      if (weeks.length !== 1) {
        // A one-week program started mid-week runs into the next week: two publishes,
        // the case above. Saved for the builder's Assign instead, and the card says why.
        mode = 'save';
        why = 'It runs across two calendar weeks from ' + date + ', so it is saved for you to assign from the builder.';
        sessions = null;
      }
      // No session can land before `date`: builderToAssignmentRows only offsets forward
      // from the start, and `date` itself was refused above if it had passed.
    }

    if (mode === 'assign') {
      var dates = sessions.map(function (s) { return s.scheduledDate; });
      var when = brief.kind === 'day' ? ' on ' + date : ' for the week of ' + sessionWeeks(sessions)[0];
      return {
        summary: templateTag + 'Draft "' + built.name + '" and assign it to ' + who + when,
        diff: draftDiff(built, spec, gen.source, sessions),
        target: { userId: clientId, kind: 'workout', id: draftId },
        beforeState: { trainerId: trainerId, clientId: clientId, draftId: draftId, dates: dates },
        afterState: { draftId: draftId, name: built.name, dates: dates },
        confirmedPayload: { mode: 'assign', clientId: clientId, startDate: date, draftId: draftId, spec: spec },
        note: (gen.source === 'template' ? 'This is a TEMPLATE, not an AI draft: AI drafting is unavailable right now — say so. ' : '') + 'Nothing is assigned until the trainer confirms the card.',
      };
    }

    var planId = randomUUID();
    var forWho = clientId ? ' for ' + who : '';
    var tail = clientId
      ? ' — open it in the builder to assign it' + (brief.kind === 'program' && brief.weeks > 1 ? ' (a multi-week program is assigned from the builder)' : '')
      : ' as a draft';
    return {
      summary: templateTag + 'Draft "' + built.name + '"' + forWho + ' and save it to your programs' + tail,
      diff: (why ? [{ label: 'Why saved', after: why }] : []).concat(draftDiff(built, spec, gen.source, null)),
      target: { userId: ctx.actor.id, kind: 'coach_plan', id: planId },
      beforeState: { planId: planId },
      afterState: { planId: planId, name: built.name },
      confirmedPayload: { mode: 'save', planId: planId, clientId: clientId, spec: spec },
      open: { kind: 'coach_plan', planId: planId, ...(clientId ? { clientId: clientId } : {}), url: programsUrl(planId, clientId) },
      note: (gen.source === 'template' ? 'This is a TEMPLATE, not an AI draft: AI drafting is unavailable right now — say so. ' : '')
        + 'Nothing is saved until the trainer confirms; it is saved unpublished and opens in the builder for editing'
        + (clientId ? ', where they assign it to the client.' : '.'),
    };
  },
  async execute(ctx, plan) {
    var p = plan.confirmedPayload || {};
    // ⚠ THE SPEC IS THE TOKEN'S: expanded the same way the preview expanded it, so what
    // lands is what the coach reviewed. The model is never asked again here.
    var built = expandDraft(p.spec);
    if (p.mode === 'assign') {
      var sessions = draftSessions(built, p.startDate, p.draftId);
      var r = await ctx.call('POST', '/api/trainer/workout', { clientIds: [p.clientId], sessions: sessions });
      // A guardrail hold (409) carries the sentence the coach needs in `error`.
      if (!r.ok) throw new Error((r.data && r.data.error) || 'Could not assign the workout.');
      return r.data;
    }
    var weeks = built.builder.weeks.length;
    var res = await ctx.call('POST', '/api/coach/plans', {
      id: p.planId, kind: 'program', name: built.name, meta: weeks + (weeks === 1 ? ' week' : ' weeks'),
      published: false, expectedOwnerId: ctx.actor.id, detail: { buildType: built.buildType, builder: built.builder },
    });
    // Relayed as the route says it ("This draft was already saved…", a 409, a 500).
    if (!res.ok) throw new Error((res.data && res.data.error) || 'Could not save the draft to your programs.');
    return { plan: { id: p.planId, name: built.name }, open: { kind: 'coach_plan', planId: p.planId, url: programsUrl(p.planId, p.clientId) } };
  },
  async undo(ctx, plan) {
    var b = plan.beforeState || {};
    var res;
    if (plan.confirmedPayload && plan.confirmedPayload.mode === 'assign') {
      // Exactly the sessions this put there (the template id was minted for them), and
      // only while they are still published — a session the client has moved on from
      // is not ours to pull back.
      res = await ctx.supabase.from('client_workouts').update({ status: 'archived' })
        .eq('trainer_id', b.trainerId).eq('client_id', b.clientId).eq('status', 'published')
        .eq('payload->template->>id', b.draftId)
        .select('id');
      if (res.error || !Array.isArray(res.data) || !res.data.length) throw new Error('Changed since — nothing undone.');
      return;
    }
    // ⚠ IN-STATEMENT GUARD: revision 1 is the save itself. Once the coach has saved an
    // edit in the builder the revision moves, zero rows match, and their work stays.
    res = await ctx.supabase.from('coach_plans').delete()
      .eq('id', b.planId).eq('owner_id', ctx.actor.id).eq('detail->>revision', '1')
      .select('id');
    if (res.error || !Array.isArray(res.data) || !res.data.length) throw new Error('Changed since — nothing undone. It has been edited or removed in the builder.');
  },
};

// draft_meal_plan → POST /api/coach/plans (the Ask Nora plan, step 5): a nutritionist's
// meal plan drafted from their brief and saved UNPUBLISHED to their meal plans, as the
// website builder's own document, for them to edit and assign there. Every meal and macro
// is Shape's meal library's (mealDraft.mjs). It never assigns to a client: assigning runs
// from the builder, where the nutrition compliance check runs.
function mealPlansUrl(planId, clientId) {
  return '/newdesign/NutritionistApp.html#plans?plan=' + encodeURIComponent(planId) + (clientId ? '&client=' + encodeURIComponent(clientId) : '');
}
function mealDraftDetail(confirmed) {
  var doc = buildMealDoc(confirmed.brief, confirmed.picked, confirmed.planId);
  return { doc: doc, detail: { mealBuilder: doc } };
}
export const draftMealPlanAction = {
  name: 'draft_meal_plan',
  roles: ['nutritionist', 'dietitian'],
  // Any account that also holds a nutrition role may draft: it saves to the account's own
  // meal plans and branches on no role afterwards.
  heldRoles: true,
  source: 'nora',
  async buildPreview(ctx, input) {
    input = input || {};
    var brief = cleanMealBrief(input);
    // A client is only ever one they coach; the draft is still saved to their library.
    var clientId = null;
    var who = '';
    if (input.clientId || input.clientName) {
      await requireOnClient(ctx, input.clientId);
      clientId = input.clientId;
      who = input.clientName ? clipText(input.clientName, 60) : 'this client';
    }
    var picked = pickMeals(brief);
    if (!picked.days.length || !picked.days[0].meals.length) {
      throw new Error("No meal in Shape's library fits what you've left out. Start it in the builder with your own foods, or leave out less.");
    }
    var planId = randomUUID();
    var confirmed = { planId: planId, clientId: clientId, brief: brief, picked: picked };
    var doc = mealDraftDetail(confirmed).doc;
    var name = mealDraftName(brief);
    return {
      summary: 'Draft "' + name + '"' + (clientId ? ' for ' + who : '') + ' and save it to your meal plans, unpublished, to edit and assign in the builder',
      diff: mealDraftDiff(brief, doc, picked),
      target: { userId: ctx.actor.id, kind: 'coach_plan', id: planId },
      beforeState: { planId: planId },
      afterState: { planId: planId, name: name },
      confirmedPayload: confirmed,
      open: { kind: 'coach_plan', planId: planId, ...(clientId ? { clientId: clientId } : {}), url: mealPlansUrl(planId, clientId) },
      note: "Every meal and number on the card is from Shape's meal library; say so, and never add a meal or a figure of your own. Nothing is saved until they confirm; it is saved unpublished to their meal plans and opens in the website builder, where they edit it and assign it (the compliance check runs there)."
        + (picked.missing.length ? ' No library food fit the ' + picked.missing.join(' and ') + ' after what they left out: say so, and that they can add their own in the builder.' : ''),
    };
  },
  async execute(ctx, plan) {
    var p = plan.confirmedPayload || {};
    // ⚠ THE PICKS ARE THE TOKEN'S: the document is rebuilt from them exactly as the card was,
    // so what lands is what the nutritionist reviewed.
    var built = mealDraftDetail(p);
    var name = mealDraftName(p.brief);
    var days = built.doc.days.length;
    var res = await ctx.call('POST', '/api/coach/plans', {
      id: p.planId, kind: 'meal_plan', name: name,
      meta: days + '-day rotation · ' + p.brief.targets.kcal + ' kcal', published: false,
      expectedOwnerId: ctx.actor.id, detail: built.detail,
    });
    if (!res.ok) throw new Error((res.data && res.data.error) || 'Could not save the draft to your meal plans.');
    return { plan: { id: p.planId, name: name }, open: { kind: 'coach_plan', planId: p.planId, url: mealPlansUrl(p.planId, p.clientId) } };
  },
  async undo(ctx, plan) {
    // ⚠ IN-STATEMENT GUARD: only while the row still holds exactly the document this saved,
    // unpublished. Meal plans carry no revision, so the document itself is the check: once
    // the builder has saved an edit, or it was published, nothing matches and their work stays.
    var detail = mealDraftDetail(plan.confirmedPayload || {}).detail;
    var res = await ctx.supabase.from('coach_plans').delete()
      .eq('id', plan.beforeState.planId).eq('owner_id', ctx.actor.id).eq('kind', 'meal_plan').eq('published', false)
      .contains('detail', detail).containedBy('detail', detail)
      .select('id');
    if (res.error || !Array.isArray(res.data) || !res.data.length) throw new Error('Changed since — nothing undone. It has been edited, published or removed in the builder.');
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

// The zone a coach's wall clock means: the one their open hours are stored in
// (`trainers.timezone` / `nutritionists.timezone`), the zone /api/calendar shows their
// bookings in. UTC when none is stored, which is exactly how this action read every
// time before the coach Schedule moved onto the coach's own clock (2026-10-07).
async function noraCoachZone(ctx) {
  var table = ctx.actor.role === 'trainer' ? 'trainers' : 'nutritionists';
  try {
    var r = await ctx.supabase.from(table).select('*').eq('owner_id', ctx.actor.id).maybeSingle();
    var z = r && r.data && typeof r.data.timezone === 'string' ? r.data.timezone.trim() : '';
    if (z) { new Intl.DateTimeFormat('en-US', { timeZone: z }); return z; }
  } catch (e) { /* an unknown zone or an unreadable row reads as UTC, the old behaviour */ }
  return 'UTC';
}
// ⚠ ONE ZONE FOR A SESSION: the one its own Schedule shows it in, the listing that holds the
// booking (sessions.provider_role + provider_id), else the caller's listing, else UTC. The
// chat route names an open session in the same zone, so "move this session to Friday at 3"
// is previewed and saved on one clock (Codex, #2253: a nutritionist, or an account that
// coaches both, saw the prompt on one clock and the move on another).
export async function noraSessionZone(ctx, sess) {
  var role = sess && (sess.provider_role === 'trainer' || sess.provider_role === 'nutritionist') ? sess.provider_role : null;
  if (role && sess.provider_id != null) {
    try {
      var r = await ctx.supabase.from(role === 'trainer' ? 'trainers' : 'nutritionists').select('timezone').eq('id', sess.provider_id).maybeSingle();
      var z = r && r.data && typeof r.data.timezone === 'string' ? r.data.timezone.trim() : '';
      if (z) { new Intl.DateTimeFormat('en-US', { timeZone: z }); return z; }
    } catch (e) { /* an unknown zone or an unreadable row falls through */ }
  }
  return noraCoachZone(ctx);
}
// The date ('YYYY-MM-DD') and wall clock ('HH:MM') `zone` shows at an ISO instant.
function noraWallClock(iso, zone) {
  var t = Date.parse(iso);
  if (!Number.isFinite(t)) return { date: String(iso || '').slice(0, 10), time: null };
  var parts = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(t)).forEach(function (p) { parts[p.type] = p.value; });
  return { date: parts.year + '-' + parts.month + '-' + parts.day, time: parts.hour + ':' + parts.minute };
}

// reschedule_session → POST /api/sessions/manage (action 'reschedule'). The
// endpoint enforces coach-on-session + only-active-is-reschedulable. Undo moves
// it back to the original slot (captured at preview).
// ⚠ "MOVE IT TO 3PM" MEANS 3PM ON THE COACH'S CLOCK. This sent the coach's words as a bare
// wall clock, which the route read as UTC, and previewed the old slot by slicing the UTC
// instant: a New York coach saying "3pm" booked 11:00 AM and was shown 19:00 as the time
// it was moving from. The coach's stored zone now goes with the time (`tz`, which the
// route reads the wall clock in) and the preview reads the old slot on the same clock.
// With no stored zone it is UTC and the payload carries no `tz`, as before.
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
    var sess = await ctx.supabase.from('sessions').select('id, client_id, scheduled_at, status, provider_id, provider_role').eq('id', input.sessionId).maybeSingle();
    if (!(sess && sess.data)) throw new Error("I can't find that session — it may not be one of yours.");
    var zone = await noraSessionZone(ctx, sess.data);
    var was = noraWallClock(String(sess.data.scheduled_at || ''), zone);
    var prevDate = was.date;
    var prevTime = was.time;
    var inZone = zone === 'UTC' ? '' : ' (' + zone + ')';
    var fmt = function (d, t) { return d + (t && t !== '00:00' ? ' ' + t : ''); };
    var payload = { sessionId: input.sessionId, action: 'reschedule', date: date, time: time };
    if (zone !== 'UTC') payload.tz = zone;
    return {
      summary: 'Move this session to ' + fmt(date, time) + inZone,
      diff: [{ label: 'Session time', field: 'scheduled_at', before: (fmt(prevDate, prevTime) || '—') + inZone, after: fmt(date, time) + inZone }],
      target: { userId: sess.data.client_id, kind: 'session', id: input.sessionId },
      beforeState: { sessionId: input.sessionId, prevDate: prevDate, prevTime: prevTime, zone: zone },
      afterState: { date: date, time: time },
      confirmedPayload: payload,
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
    var back = { sessionId: b.sessionId, action: 'reschedule', date: b.prevDate, time: b.prevTime };
    if (b.zone && b.zone !== 'UTC') back.tz = b.zone;
    var r = await ctx.call('POST', '/api/sessions/manage', back);
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
  // The zone the chat route resolved for this turn (the device's, else the profile's)
  // wins; a caller without one reads the profile's zone itself.
  var tz = (ctx && typeof ctx.zone === 'string' && ctx.zone) || await memberTz(ctx);
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
    // ⚠ THE TABLE IS KILOGRAMS. client_weigh_ins.weight is canonical kg: the app's
    // logWeighIn converts before it stores, and the readers (the coach RPC
    // get_client_goals among them) read the column as kilograms. This writer
    // stored the member's own unit, so "log 180 lb" read as 180 kg on a coach's
    // roster, and as 396.8 lb once the coach pages followed the coach's units.
    // The preview speaks the member's words; the row is kilograms.
    var kg = unit === 'lb' ? Math.round(weight * 0.45359237 * 100) / 100 : weight;
    var after = { logged_on: today, weight: kg, unit: 'kg' };
    return {
      summary: 'Log today’s weigh-in: ' + weight + ' ' + unit + (cur ? ' (replaces ' + before.weight + ' ' + before.unit + ')' : ''),
      diff: [{ label: 'Weight', before: cur ? before.weight + ' ' + before.unit : '—', after: weight + ' ' + unit }],
      target: { userId: ctx.actor.id, kind: 'weigh_in', id: today },
      beforeState: before, afterState: after, confirmedPayload: { weight: kg, unit: 'kg' },
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
export const NORA_ACTIONS = [logMealAction, setClientGoalAction, assignWorkoutAction, draftWorkoutAction, draftMealPlanAction, assignMealPlanAction, setProgramDetailAction, addReviewNoteAction, rescheduleSessionAction, logWeighInAction, logWaterAction, checkHabitAction, setReminderAction];
