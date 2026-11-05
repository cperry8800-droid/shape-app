// A meal plan drafted by Nora from Shape Kitchen's recipes, for the builders (P6, 2026-11-05): the
// website meal builder's New flow ("Start with Nora") and the app's ＋ New composer, the same core
// Nora's draft_meal_plan uses in chat (src/lib/ai/mealDraft.mjs), so one brief drafts one plan on
// every surface.
//
// POST /api/ai/draft-meal-plan
//   { request?, goalPhase?, kcal?, protein?, carbs?, fat?, restKcal?, days?, restDays?, slots?,
//     exclude?, maxPrepMinutes?, name?, clientId? }
//   → { draft: { name, doc, snapshot }, lines, missing, fallback, notice }
//
// It writes NOTHING. The caller opens the draft in the builder, where it saves unpublished (the
// website's autosave, the app's save), and the nutritionist edits and assigns it there; the
// licence check runs at assign, never from here.
//
// No model is asked: the fields the brief sent are read as they are, and anything the coach only
// wrote in words ("a cut at 1,900 kcal, 7 days, no shellfish") is read by mealBriefFromText.
// Every dish and every number is a Shape Kitchen recipe's own.
//
// ⚠ THE GATE IS draft-workout's, for the nutrition side: membership, a resolved user (Bearer or
// cookie; the app sends Bearer), a coach or admin, then a nutritionist or dietitian (or an admin).
// A client named is only ever one this coach coaches (is_coach_on_client), and the name only labels
// the plan: no client data is read.
// ⚠ A DAILY BUDGET (`coach_draft`, shared with the other coach drafting routes), counted before the
// draft, so a script cannot draft all day.

import { NextResponse } from 'next/server';
import { currentUser, clientForRequest } from '@/lib/request-auth';
import { computeMembership } from '@/lib/membership-core';
import { readJson } from '@/lib/request-utils';
import { requireMembership } from '@/lib/require-membership';
import { countBudget, budgetReply } from '@/lib/ai/noraLimits';
import {
  cleanMealBrief, mealBriefFromText, pickMeals, buildMealDoc, mealDraftDiff, mealDraftSnapshot, draftName, KITCHEN_NOTICE, DRAFT_NOTICE,
} from '@/lib/ai/mealDraft.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUTRITION_ROLES = ['nutritionist', 'dietitian'];

export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const sb = await clientForRequest(request);
  const gate = await computeMembership(sb, user.id, user.email ?? null, { emailConfirmed: !!user.email_confirmed_at });
  if (!gate.isCoach && !gate.isAdmin) {
    return NextResponse.json({ error: 'Coach access required.' }, { status: 403 });
  }
  if (!gate.isAdmin) {
    const { data: profile } = await sb.from('profiles').select('role, roles').eq('id', user.id).maybeSingle();
    const p = (profile ?? {}) as { role?: unknown; roles?: unknown };
    const roles = [p.role, ...(Array.isArray(p.roles) ? p.roles : [])].map(String);
    if (!roles.some((r) => NUTRITION_ROLES.includes(r))) {
      return NextResponse.json({ error: 'Meal-plan drafting is for nutritionists.' }, { status: 403 });
    }
  }

  const parsed = await readJson<Record<string, unknown>>(request, { allowEmpty: true, maxBytes: 16_000 });
  if (!parsed.ok) return parsed.response;
  const body = parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data) ? parsed.data : {};

  if (body.clientId != null && body.clientId !== '') {
    const clientId = String(body.clientId);
    if (!UUID.test(clientId)) return NextResponse.json({ error: 'That client id is not valid.' }, { status: 400 });
    const { data: onClient, error } = await sb.rpc('is_coach_on_client', { p_client_id: clientId });
    if (error) return NextResponse.json({ error: 'Could not check that client. Please retry.' }, { status: 500 });
    if (onClient !== true) return NextResponse.json({ error: 'You can only draft for clients you actively coach.' }, { status: 403 });
  }

  // Fields the brief sent win; what the coach only wrote in words fills the rest.
  const request0 = typeof body.request === 'string' ? body.request : '';
  const said = mealBriefFromText(request0) as Record<string, unknown>;
  const fields: Record<string, unknown> = {};
  for (const key of ['name', 'goalPhase', 'kcal', 'protein', 'carbs', 'fat', 'restKcal', 'days', 'restDays', 'slots', 'exclude', 'maxPrepMinutes']) {
    const v = body[key];
    const given = v != null && v !== '' && !(Array.isArray(v) && !v.length);
    if (given) fields[key] = v;
    else if (said[key] != null) fields[key] = said[key];
  }
  const brief = cleanMealBrief(fields);

  const budget = await countBudget(sb, user.id, 'coach_draft');
  if (!budget.allowed) {
    return NextResponse.json({ error: budgetReply('coach_draft', budget.resetSeconds), code: 'daily_budget' }, { status: 429, headers: { 'Retry-After': String(Math.max(60, budget.resetSeconds)) } });
  }

  const picked = pickMeals(brief);
  if (!picked.days.length || !picked.days[0].meals.length) {
    return NextResponse.json({ error: "No Shape dish fits what you've left out. Start it in the builder with your own foods, or leave out less.", code: 'nothing_fits' }, { status: 422 });
  }
  // A placeholder id: the builder gives the saved plan its own. The meal ids it seeds stay as drafted,
  // which is what the snapshot reads her meals by.
  const tag = crypto.randomUUID();
  const doc = buildMealDoc(brief, picked, tag);
  const snapshot = mealDraftSnapshot(doc, { at: new Date().toISOString(), source: brief.source, brief: request0 });
  return NextResponse.json({
    draft: { name: draftName(brief), doc, snapshot },
    lines: mealDraftDiff(brief, doc, picked),
    missing: picked.missing,
    fallback: picked.fallback,
    notice: brief.source === 'library' ? DRAFT_NOTICE : KITCHEN_NOTICE,
  });
}
