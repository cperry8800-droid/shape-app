// Goal-milestone Shape points, awarded by the server where the weigh-in is written (P7; owner,
// 2026-11-05: "the website and app need to fully communicate").
//
// award_my_goal_milestones() (2026-06-18-score-ledger-lockdown.sql) credits each 25/50/75/100% of the
// Overall weight goal once, computed from the stored goal and the latest weigh-in, on the caller's own
// session. Only the app ever called it (after its own weigh-in, and on opening Goals), so a member who
// weighed in on the website never earned a milestone. Now the weigh-in route calls it after writing
// the row, and the Goals pages ask the server's catch-up (after a target edit) through the same
// function, so both surfaces earn the same.
//
// ⚠ THE GOAL MUST BE IN KILOGRAMS BEFORE THE RPC RUNS, AND THE SERVER CHECKS IT. The RPC reads the
// goal's start and target and the latest weight VERBATIM and normalises neither. Weigh-ins are stored
// in kilograms by both surfaces, so a goal document still stamped in pounds (written before the
// canonicalisation, or by a write that failed) makes an 83.9 kg weigh-in look far past a 180 lb target
// and awards every milestone at once. Both clients guarded this by awarding only after their own
// document write was confirmed; the server now refuses on the stored document itself, which no client
// can get wrong. A goal with no unit reads as kilograms, the stores' default.

import { readGoalsDoc, type GoalsClient } from '@/lib/user-goals-cas';

export type Milestone = { milestone: string; points: number };
export type MilestoneAward = { ok: true; milestones: Milestone[]; skipped?: 'unit' } | { ok: false; milestones: []; reason: 'unreadable' | 'rpc' };

type RpcClient = GoalsClient & { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }> };

const LB_TO_KG = 0.45359237;
// A body weight a person can have, in kilograms; anything else is a typo, refused.
export const WEIGH_IN_MIN_KG = 20;
export const WEIGH_IN_MAX_KG = 400;

/** A weigh-in in kilograms (`unit` 'kg' or 'lb'), to the hundredth, or null when it is not one. */
export function weighInKg(weight: unknown, unit: unknown): number | null {
  if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) return null;
  const kg = goalUnitIsPounds(unit) ? weight * LB_TO_KG : weight;
  const r = Math.round(kg * 100) / 100;
  return r >= WEIGH_IN_MIN_KG && r <= WEIGH_IN_MAX_KG ? r : null;
}

/** Whether a stored goal's unit is pounds (the forms both surfaces have written). */
export function goalUnitIsPounds(unit: unknown): boolean {
  return /^(lb|lbs|pound)/i.test(String(unit == null ? '' : unit).trim());
}

/** Award the caller's newly reached goal milestones; the ones credited by THIS call. */
export async function awardGoalMilestones(supabase: RpcClient, userId: string): Promise<MilestoneAward> {
  const doc = await readGoalsDoc(supabase, userId, 'client_goals');
  if (!doc) return { ok: false, milestones: [], reason: 'unreadable' };
  const overall = doc.overall && typeof doc.overall === 'object' ? (doc.overall as Record<string, unknown>) : null;
  if (overall && goalUnitIsPounds(overall.unit)) return { ok: true, milestones: [], skipped: 'unit' };
  try {
    const { data, error } = await supabase.rpc('award_my_goal_milestones');
    if (error) return { ok: false, milestones: [], reason: 'rpc' };
    const rows = Array.isArray(data) ? data : [];
    const milestones = rows
      .filter((r): r is { milestone: unknown; points: unknown } => !!r && typeof r === 'object')
      .map((r) => ({ milestone: String(r.milestone ?? ''), points: Number(r.points) }))
      .filter((m) => m.milestone && Number.isFinite(m.points) && m.points > 0);
    return { ok: true, milestones };
  } catch {
    return { ok: false, milestones: [], reason: 'rpc' };
  }
}
