// Meal-log macro write — makes the Nutrition stats real.
// When a client logs a meal ("Ate as planned" / the full logger), the meal's
// macros ACCUMULATE onto today's daily_health_snapshot row (unique on
// user_id + snapshot_date) — the same row/columns the client nutrition +
// analytics rollups and the coach consoles already read. Merges with any
// device-synced metrics for the day rather than overwriting them.
//
// POST { kcal?, protein?, carbs?, fat?, hydrationL?, date?, mealId?, mealTitle? }
//   -> { ok, day, logged, already?, award }
// `date` is the client's local YYYY-MM-DD (so an evening log buckets to the
// user's calendar day, not UTC's); falls back to the server's UTC date.
// Auth: cookie session OR Bearer token (mobile bridges either). Sits under
// /api/nutrition so the membership proxy gate applies.
//
// ⚠ A PLANNED MEAL IS LOGGED ONCE, IN THE ACCOUNT (P7; the client audit's B3). `mealId` names a meal of
// the member's plan (its key, public/newdesign/mealLogged.mjs). The meal is CLAIMED for the day in the
// member's `client_meal_logged` document first, compare-and-set, and only then are its macros added:
//   · a meal already logged that day (on the website, in the app, in another tab) adds nothing and
//     answers `already: true`, so it is never counted twice whichever surface logged it;
//   · a macro write that fails takes the claim back, so a failed log never shows ✓ anywhere;
//   · a claim that can't be made (the document unreadable) still logs the macros, as before, and
//     answers `logged: false`, so the ✓ is never claimed for a meal the account does not record.
// A log without `mealId` (the free logger) is unchanged: macros only.
//
// ⚠ THE +10 IS THE SERVER'S, AND SO IS ITS ANSWER (P7). The meal award is paid by the snapshot trigger
// (daily_health_snapshot_award, 2026-10-12-shape-score-fixes.sql) whoever writes the macros; this route
// asks award_meal_log afterwards, on the member's own session, whether THIS log earned it, and returns
// that as `award`. The app shows "+10" from it and no longer calls the RPC itself, so both surfaces earn
// and report the same way.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson, dbError } from '@/lib/request-utils';
import { clientLocalDay } from '@/lib/local-day';
import { requireMembership } from '@/lib/require-membership';
import { writeGoalsDoc, type GoalsClient } from '@/lib/user-goals-cas';
import { BS_MEAL_LOGGED_KIND, bsIsMealKey, bsMealIsLogged, bsMealLoggedMark, bsMealLoggedUnmark } from '../../../../../public/newdesign/mealLogged.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Accept only a real, finite, non-negative JSON number. Number() would coerce null /
// false / '' to 0 (a fabricated zero-value snapshot), so reject non-numbers outright.
function asNum(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  return v;
}

type Award = { awarded: boolean; points?: number } | null;

export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = (bodyResult.data || {}) as Record<string, unknown>;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const kcal = asNum(body.kcal);
  const protein = asNum(body.protein);
  const carbs = asNum(body.carbs);
  const fat = asNum(body.fat);
  const hydrationL = asNum(body.hydrationL);
  if (kcal == null && protein == null && carbs == null && fat == null && hydrationL == null) {
    return NextResponse.json({ error: 'Nothing to log.' }, { status: 400 });
  }
  // A planned meal's key, or nothing: an unusable key logs the macros like the free logger.
  const mealId = bsIsMealKey(body.mealId) ? (body.mealId as string) : null;
  const mealTitle = typeof body.mealTitle === 'string' ? body.mealTitle.trim().slice(0, 120) : '';

  const supabase = await clientForRequest(request);
  const today = clientLocalDay(body.date);
  const goals = supabase as unknown as GoalsClient;

  // Claim the planned meal for the day before anything is added (see the header).
  let claimed = false;
  if (mealId) {
    const entry = { at: new Date().toISOString(), title: mealTitle || undefined, kcal: kcal ?? 0, p: protein ?? 0, c: carbs ?? 0, f: fat ?? 0 };
    const claim = await writeGoalsDoc(goals, user.id, BS_MEAL_LOGGED_KIND, (cur) => (
      bsMealIsLogged(cur, today, mealId) ? null : bsMealLoggedMark(cur, today, mealId, entry, today)
    ));
    if (claim.ok && claim.unchanged) {
      return NextResponse.json({ ok: true, day: today, logged: true, already: true, award: null });
    }
    claimed = claim.ok;
    if (!claim.ok) console.warn('[meal-log] the planned meal could not be recorded; logging the macros only:', claim.reason);
  }

  // Atomic accumulate via RPC — each macro adds inside one upsert (ON CONFLICT DO
  // UPDATE under the row lock), so concurrent meal logs / a log racing a hydration
  // quick-add can't lose an increment. A NULL field is left unchanged (same as before).
  const { error: rpcErr } = await supabase.rpc('add_meal_macros', {
    p_kcal: kcal, p_protein: protein, p_carbs: carbs, p_fat: fat, p_hydration: hydrationL, p_date: today,
  });
  if (rpcErr) {
    // The meal was not logged, so it is not recorded as logged either.
    if (claimed && mealId) {
      const undo = await writeGoalsDoc(goals, user.id, BS_MEAL_LOGGED_KIND, (cur) => (
        bsMealIsLogged(cur, today, mealId) ? bsMealLoggedUnmark(cur, today, mealId, today) : null
      ));
      if (!undo.ok) console.error('[meal-log] a failed log left its meal recorded as logged:', undo.reason);
    }
    return dbError(rpcErr, 'meal log write', 500);
  }

  // Whether this log earned the day's +10 (the trigger paid it; the RPC says whether it was this log).
  let award: Award = null;
  try {
    const { data, error } = await supabase.rpc('award_meal_log', { p_day: today });
    if (!error && data && typeof data === 'object' && typeof (data as { awarded?: unknown }).awarded === 'boolean') {
      const a = data as { awarded: boolean; points?: unknown };
      award = { awarded: a.awarded, points: typeof a.points === 'number' ? a.points : 0 };
    }
  } catch { award = null; }

  return NextResponse.json({ ok: true, day: today, logged: claimed, award });
}
