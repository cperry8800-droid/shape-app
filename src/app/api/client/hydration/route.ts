// Direct hydration logging for the home Hydration card. GET returns today's
// hydration_l + the user's daily target; POST applies a SIGNED delta (in liters)
// to today's daily_health_snapshot row, clamped at 0 (so undo can't go negative —
// the meal-log accumulator rejects negatives). Merges with device-synced /
// meal-logged hydration for the day. Auth: cookie or Bearer; sits under
// /api/client so the membership proxy gate applies.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson, dbError } from '@/lib/request-utils';
import { clientLocalDay } from '@/lib/local-day';
import { requireMembership } from '@/lib/require-membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_TARGET_L = 3.0;

// Best-effort read of the user's hydration target from user_goals; 3.0 L
// default. The mobile Settings → Nutrition stores hydration_target_l in
// user_goals(kind='client_nutrition_prefs').data, keyed by 'hydration_target_l'
// (verified: iosAppBroadsheetClient.jsx ~L19063 + the getUserGoals write path in
// shapeBackend.js). The brief's original form queried client_settings.settings
// (jsonb) — that table exists but hydration_target_l is NOT stored there; it
// lives in user_goals as confirmed by tracing the write path.
async function readTargetL(supabase: Awaited<ReturnType<typeof clientForRequest>>, userId: string): Promise<number> {
  try {
    const { data } = await supabase
      .from('user_goals')
      .select('data')
      .eq('user_id', userId)
      .eq('kind', 'client_nutrition_prefs')
      .maybeSingle();
    const raw = (data as { data?: Record<string, unknown> } | null)?.data?.hydration_target_l;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_TARGET_L;
  } catch {
    return DEFAULT_TARGET_L;
  }
}

export async function GET(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const supabase = await clientForRequest(request);
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const today = clientLocalDay(new URL(request.url).searchParams.get('date'));
  const { data, error } = await supabase
    .from('daily_health_snapshot')
    .select('hydration_l')
    .eq('user_id', user.id)
    .eq('snapshot_date', today)
    .maybeSingle();
  if (error) return dbError(error, 'hydration read', 500);
  const targetL = await readTargetL(supabase, user.id);
  const hydrationL = Number((data as { hydration_l?: number } | null)?.hydration_l ?? 0) || 0;
  return NextResponse.json({ ok: true, hydrationL, targetL, date: today });
}

export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: false });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  // Validate the delta: must be a JSON number (not a boolean/string), nonzero,
  // and within a sane single-tap magnitude. Quick-adds are <=0.5 L and undo
  // negates them, so ±2 L is a generous ceiling that still rejects impossible
  // totals from a malformed client.
  const rawDelta = (body as Record<string, unknown>).deltaL;
  const deltaL = typeof rawDelta === 'number' ? rawDelta : NaN;
  if (!Number.isFinite(deltaL) || deltaL === 0 || Math.abs(deltaL) > 2) {
    return NextResponse.json({ error: 'deltaL must be a nonzero number within ±2 L.' }, { status: 400 });
  }

  const supabase = await clientForRequest(request);
  const today = clientLocalDay((body as Record<string, unknown>).date);

  // Atomic increment via RPC — the ON CONFLICT DO UPDATE adds under the row lock, so
  // two concurrent writers (phone + /m/ web, or a tap racing a retry) can't lose an
  // increment (no read-then-write window).
  const { data: rpcVal, error: rpcErr } = await supabase.rpc('add_hydration', { p_delta: deltaL, p_date: today });
  if (rpcErr) return dbError(rpcErr, 'hydration write', 500);

  const targetL = await readTargetL(supabase, user.id);
  return NextResponse.json({ ok: true, hydrationL: Number(rpcVal) || 0, targetL, date: today });
}
