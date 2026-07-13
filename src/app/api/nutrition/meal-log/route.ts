// Meal-log macro write — makes the Nutrition stats real.
// When a client logs a meal ("Ate as planned" / the full logger), the meal's
// macros ACCUMULATE onto today's daily_health_snapshot row (unique on
// user_id + snapshot_date) — the same row/columns the client nutrition +
// analytics rollups and the coach consoles already read. Merges with any
// device-synced metrics for the day rather than overwriting them.
//
// POST { kcal?, protein?, carbs?, fat?, hydrationL?, date? } -> { ok, day }
// `date` is the client's local YYYY-MM-DD (so an evening log buckets to the
// user's calendar day, not UTC's); falls back to the server's UTC date.
// Auth: cookie session OR Bearer token (mobile bridges either). Sits under
// /api/nutrition so the membership proxy gate applies.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson, dbError } from '@/lib/request-utils';
import { clientLocalDay } from '@/lib/local-day';
import { requireMembership } from '@/lib/require-membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Accept only a real, finite, non-negative JSON number. Number() would coerce null /
// false / '' to 0 (a fabricated zero-value snapshot), so reject non-numbers outright.
function asNum(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  return v;
}

export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const kcal = asNum((body as Record<string, unknown>).kcal);
  const protein = asNum((body as Record<string, unknown>).protein);
  const carbs = asNum((body as Record<string, unknown>).carbs);
  const fat = asNum((body as Record<string, unknown>).fat);
  const hydrationL = asNum((body as Record<string, unknown>).hydrationL);
  if (kcal == null && protein == null && carbs == null && fat == null && hydrationL == null) {
    return NextResponse.json({ error: 'Nothing to log.' }, { status: 400 });
  }

  const supabase = await clientForRequest(request);
  const today = clientLocalDay((body as Record<string, unknown>).date);

  // Atomic accumulate via RPC — each macro adds inside one upsert (ON CONFLICT DO
  // UPDATE under the row lock), so concurrent meal logs / a log racing a hydration
  // quick-add can't lose an increment. A NULL field is left unchanged (same as before).
  const { error: rpcErr } = await supabase.rpc('add_meal_macros', {
    p_kcal: kcal, p_protein: protein, p_carbs: carbs, p_fat: fat, p_hydration: hydrationL, p_date: today,
  });
  if (rpcErr) return dbError(rpcErr, 'meal log write', 500);
  return NextResponse.json({ ok: true, day: today });
}
