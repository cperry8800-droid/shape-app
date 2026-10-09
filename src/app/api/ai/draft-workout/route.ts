// AI drafting for the coach's workout builder — "Draft with AI": the coach writes a
// brief ("lower body, 50 min, barbell, intermediate") and gets REAL builder rows back
// to edit, not the coarse blocks of /api/ai/generate-plan.
//
// POST /api/ai/draft-workout
//   { request, kind?: 'day'|'program', minutes?, equipment?, level?, weeks?, daysPerWeek?,
//     unit?: 'lb'|'kg', clientId?, name? }
//   → { source: 'openai'|'template', notice?, draft: { name, buildType, builder }, lines, notes }
//
// It writes NOTHING: the builder loads the draft and the coach saves it, as with any
// program they wrote by hand. The drafting itself is src/lib/ai/workoutDraft.mjs, the
// same core Nora's draft_workout runs, so the two doors cannot draft differently.
//
// ⚠ THE GATE IS GENERATE-PLAN'S, word for word in spirit: requireMembership, then a
// resolved user (Bearer or cookie — the app sends Bearer), then computeMembership's coach
// or admin verdict, because a paid MEMBER could otherwise burn the server's key here.
// ⚠ AND THEN TRAINERS ONLY (or an admin). A nutritionist is a coach, but prescribing
// training is outside their scope of practice — the same line the action registry draws
// (assign_workout and draft_workout are trainer-only) and the reason the nutrition
// compliance gate exists. Their AI drafting is the meal-plan generator.

import { NextResponse } from 'next/server';
import { currentUser, clientForRequest } from '@/lib/request-auth';
import { computeMembership } from '@/lib/membership-core';
import { readJson } from '@/lib/request-utils';
import { callAI, hasOpenAIKey } from '@/lib/ai';
import { requireMembership } from '@/lib/require-membership';
import {
  cleanBrief, generateDraft, expandDraft, summarizeDraft, readCoachLoadUnit, readClientContext, TEMPLATE_NOTICE,
} from '@/lib/ai/workoutDraft.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// One medium-effort draft, bounded at 45 s inside the core (then a labelled template).
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    // `roles[]` as well as `role`, as computeMembership reads them: a dual-role account
    // whose primary role is nutritionist but who also trains still drafts workouts.
    const { data: profile } = await sb.from('profiles').select('role, roles').eq('id', user.id).maybeSingle();
    const p = (profile ?? {}) as { role?: unknown; roles?: unknown };
    const roles = [p.role, ...(Array.isArray(p.roles) ? p.roles : [])].map(String);
    if (!roles.includes('trainer')) {
      return NextResponse.json({ error: 'Workout drafting is for trainers.' }, { status: 403 });
    }
  }

  // A brief is a few hundred characters; anything near the 1 MB default is not one.
  const parsed = await readJson<Record<string, unknown>>(request, { allowEmpty: true, maxBytes: 16_000 });
  if (!parsed.ok) return parsed.response;
  const body = parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data) ? parsed.data : {};

  // ⚠ A CLIENT IS CONTEXT, AND ONLY FOR SOMEONE THIS COACH COACHES. The id is checked
  // with is_coach_on_client on the coach's own session — the check Nora's coach actions
  // and the coach routes use — before anything about the client is read, and what is
  // read is the training phase alone. `client` from the body is never forwarded: the
  // brief takes the server-built one, which overrides it.
  let client: Record<string, string> | null = null;
  if (body.clientId != null && body.clientId !== '') {
    const clientId = String(body.clientId);
    if (!UUID.test(clientId)) return NextResponse.json({ error: 'That client id is not valid.' }, { status: 400 });
    const { data: onClient, error } = await sb.rpc('is_coach_on_client', { p_client_id: clientId });
    if (error) return NextResponse.json({ error: 'Could not check that client. Please retry.' }, { status: 500 });
    if (onClient !== true) return NextResponse.json({ error: 'You can only draft for clients you actively coach.' }, { status: 403 });
    client = await readClientContext(sb, clientId);
  }

  const brief0 = cleanBrief({ ...body, client });
  if (!brief0.request) {
    return NextResponse.json({ error: "Describe the workout — e.g. 'lower body, 50 min, barbell, intermediate'." }, { status: 400 });
  }
  const unit = brief0.unit || await readCoachLoadUnit(sb, user.id);
  const brief = { ...brief0, unit };

  // Never a 500 for the model's sake: the core falls to the labelled template on no
  // key, a failed call or junk, and only a request that is not about training at all
  // comes back as a question.
  const gen = await generateDraft(brief, { callModel: hasOpenAIKey() ? callAI : null, signal: request.signal });
  if (!gen.ok) return NextResponse.json({ error: gen.message, code: gen.error }, { status: 422 });

  const built = expandDraft(gen.spec);
  const summary = summarizeDraft(built.builder, gen.spec);
  const template = gen.source === 'template';
  return NextResponse.json({
    source: template ? 'template' : 'openai',
    ...(template ? { notice: TEMPLATE_NOTICE } : {}),
    draft: { name: built.name, buildType: built.buildType, builder: built.builder },
    lines: summary.lines,
    notes: gen.spec.notes || '',
  });
}
