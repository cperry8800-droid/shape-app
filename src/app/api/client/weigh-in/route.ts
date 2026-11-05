// A member's weigh-in, written by the server, which then awards any goal milestone it reached (P7).
//
// POST { weight, unit?: 'kg' | 'lb', bodyFat?, date? } -> { ok, weighIn: { logged_on, weight }, milestones }
// POST { check: true }                                  -> { ok, milestones }   (the catch-up, below)
//
// ⚠ ONE WRITER FOR BOTH SURFACES, AND THE AWARD IS ITS. The app upserted client_weigh_ins itself and
// then called award_my_goal_milestones; the website upserted the same row (swallowing any error) and
// never awarded, so a member who weighed in on the website earned no milestone. Both call this now:
// the row is written in kilograms on the member's own day (`date`, their local YYYY-MM-DD), and the
// award runs here, after it, through src/lib/goal-milestones.ts, which refuses while the stored goal is
// still in pounds. A failed write is an error the page shows, never a silent success.
//
// `check: true` is the catch-up the Goals pages ask on opening (a target edited since the last
// weigh-in may have reached a milestone): the same award, no row. Idempotent server-side, so a repeat
// never credits twice.
//
// Auth: the caller's own session (cookie or Bearer, request-auth), RLS on their own rows.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson, dbError } from '@/lib/request-utils';
import { clientLocalDay } from '@/lib/local-day';
import { requireMembership } from '@/lib/require-membership';
import { awardGoalMilestones, weighInKg, WEIGH_IN_MIN_KG, WEIGH_IN_MAX_KG } from '@/lib/goal-milestones';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const parsed = await readJson<Record<string, unknown>>(request, { allowEmpty: false });
  if (!parsed.ok) return parsed.response;
  const body = (parsed.data || {}) as Record<string, unknown>;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);
  const award = (): ReturnType<typeof awardGoalMilestones> => awardGoalMilestones(supabase as unknown as Parameters<typeof awardGoalMilestones>[0], user.id);

  if (body.check === true) {
    const a = await award();
    return NextResponse.json({ ok: true, milestones: a.milestones });
  }

  const kg = weighInKg(body.weight, body.unit);
  if (kg == null) return NextResponse.json({ error: `Enter a weight between ${WEIGH_IN_MIN_KG} and ${WEIGH_IN_MAX_KG} kg.` }, { status: 400 });
  const day = clientLocalDay(body.date);
  const bf = typeof body.bodyFat === 'number' && Number.isFinite(body.bodyFat) && body.bodyFat > 0 && body.bodyFat < 75 ? body.bodyFat : null;
  const row: Record<string, unknown> = { user_id: user.id, logged_on: day, weight: kg, unit: 'kg' };
  if (bf != null) row.body_fat_pct = bf;

  const write = (r: Record<string, unknown>) => supabase
    .from('client_weigh_ins')
    .upsert(r, { onConflict: 'user_id,logged_on' })
    .select('logged_on, weight')
    .maybeSingle();
  let { data, error } = await write(row);
  // Before the body-fat column existed: the weight still lands.
  if (error && row.body_fat_pct != null && /body_fat_pct/.test(String(error.message || ''))) {
    delete row.body_fat_pct;
    ({ data, error } = await write(row));
  }
  if (error) return dbError(error, 'weigh-in write', 500);

  // The weigh-in landed; the award is best-effort (a failure costs a toast, never the measurement).
  const a = await award();
  return NextResponse.json({ ok: true, weighIn: data ?? { logged_on: day, weight: kg }, milestones: a.milestones });
}
