// A client's week-one target, set by their coach (client-onboarding review, fix 4; owner, 2026-10-14,
// decision 3: "Week-one targets are set per member. No fixed 48-hour or 3-day rule. A coach sets the
// target for each client").
//
// POST { role: 'trainer' | 'nutritionist', count: 1-14 | null, startsOn?: 'YYYY-MM-DD' | null }
//   -> { ok, weekOne }
// count is workouts in week 1 for a trainer and days logged for a nutritionist; null clears it.
// startsOn is the day week 1 starts, which is when the onboarding board expects the plan to be live.
//
// ⚠ THE TARGET NAMES THE LISTING THAT SET IT (Codex on #2378). The discipline section outlives a change
// of coach, so `providerId` is stored with it, and the board and the member's plan read a target only
// from a coach they have now; a predecessor's is ignored. A member may pay two coaches of one role
// (owner, 2026-10-16); they share the section, so either may set it, the last one set is the target,
// and every board and the plan name who set it (sharedWeekOneOf).
//
// Stored at client_programs.detail[discipline].weekOne through set_program_detail, the sanctioned
// discipline writer: a trainer can only write the training section and a nutritionist the nutrition
// one (is_discipline_coach_on_client), and the rest of the row is never touched. The onboarding board
// reads it back from the shared overview (bsOnboardingLeg).
//
// Auth: cookie session OR Bearer token.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson, dbError } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  if (!UUID.test(clientId)) return NextResponse.json({ error: 'Unknown client.' }, { status: 404 });
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  // The coach sets it. A member's own target is their own setup, not this route.
  if (user.id === clientId) return NextResponse.json({ error: 'Only your coach sets this.' }, { status: 403 });

  const bodyResult = await readJson<Record<string, unknown>>(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const role = body.role === 'trainer' || body.role === 'nutritionist' ? body.role : null;
  if (!role) return NextResponse.json({ error: 'role must be trainer or nutritionist.' }, { status: 400 });

  let target: { count: number; startsOn: string | null } | null = null;
  if (body.count !== null) {
    const count = Number(body.count);
    // Days logged for a nutritionist, so at most seven (weekOneMax in coach-client-legs.mjs).
    const max = role === 'nutritionist' ? 7 : 14;
    if (!Number.isInteger(count) || count < 1 || count > max) {
      return NextResponse.json({ error: `count must be a whole number from 1 to ${max}.` }, { status: 400 });
    }
    let startsOn: string | null = null;
    if (body.startsOn != null && body.startsOn !== '') {
      const d = String(body.startsOn);
      const t = DAY.test(d) ? Date.parse(d + 'T00:00:00Z') : NaN;
      // A real calendar day, within a year either side.
      if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== d || Math.abs(t - Date.now()) > 366 * 86_400_000) {
        return NextResponse.json({ error: 'startsOn must be a date (YYYY-MM-DD).' }, { status: 400 });
      }
      startsOn = d;
    }
    target = { count, startsOn };
  }

  const supabase = await clientForRequest(request);
  // The caller's own listing for this role (one per role per account: #2331's unique index), named
  // in the target so the boards and the plan can tell whose it is.
  const { data: mine, error: mineErr } = await supabase
    .from(role === 'trainer' ? 'trainers' : 'nutritionists')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (mineErr) return dbError(mineErr, 'week-one listing read', 500);
  const providerId = (mine as { id?: number } | null)?.id;
  if (providerId == null) return NextResponse.json({ error: `You don't coach this client as their ${role}.` }, { status: 403 });
  // ⚠ WEEK ONE STARTS INSIDE THE BOARD'S 30 DAYS (Codex on #2378): a start before the client subscribed
  // put the plan and check-in deadlines before the relationship, and "Week 1 not live" fired at once;
  // one past day 30 fell due after the board had closed. The window is this listing's earliest live
  // subscription, in the board's UTC days (bsOnboardingLeg).
  if (target && target.startsOn) {
    const { data: subRows, error: subErr } = await supabase
      .from('subscriptions')
      .select('created_at')
      .eq('client_id', clientId)
      .eq('provider_role', role)
      .eq('provider_id', providerId)
      .in('status', ['active', 'trialing']);
    if (subErr) return dbError(subErr, 'week-one subscription read', 500);
    const joined = Math.min(...((subRows ?? []) as Array<{ created_at: string | null }>).map((r) => Date.parse(String(r.created_at))).filter(Number.isFinite));
    if (!Number.isFinite(joined)) return NextResponse.json({ error: `This client isn't subscribed to you as their ${role}.` }, { status: 403 });
    const first = new Date(joined).toISOString().slice(0, 10);
    const last = new Date(joined + 29 * 86_400_000).toISOString().slice(0, 10);
    if (target.startsOn < first || target.startsOn > last) {
      return NextResponse.json({ error: `Week 1 must start in their first 30 days (${first} to ${last}).` }, { status: 400 });
    }
  }
  const weekOne = target ? { ...target, setAt: new Date().toISOString(), setBy: 'coach' as const, providerId } : null;

  const { error } = await supabase.rpc('set_program_detail', {
    p_client_id: clientId,
    p_discipline: role === 'trainer' ? 'training' : 'nutrition',
    p_phase: null,
    p_detail: { weekOne },
  });
  if (error) {
    // set_program_detail raises 42501 unless the caller coaches this client in that discipline.
    if (error.code === '42501' || /not authorized/i.test(error.message)) {
      return NextResponse.json({ error: `You don't coach this client as their ${role}.` }, { status: 403 });
    }
    return dbError(error, 'week-one target write', 500);
  }
  return NextResponse.json({ ok: true, weekOne });
}
