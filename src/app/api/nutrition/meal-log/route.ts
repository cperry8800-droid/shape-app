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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Accept only a real, finite, non-negative JSON number. Number() would coerce null /
// false / '' to 0 (a fabricated zero-value snapshot), so reject non-numbers outright.
function asNum(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  return v;
}

// 'PGRST202' (function not in schema cache) / '42883' (undefined_function) => the
// atomic-accumulate migration isn't applied yet; fall back to read-then-write.
function isMissingFunction(err: { code?: string } | null | undefined): boolean {
  return err?.code === 'PGRST202' || err?.code === '42883';
}

export async function POST(request: Request) {
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
  if (!rpcErr) return NextResponse.json({ ok: true, day: today });
  if (!isMissingFunction(rpcErr)) return dbError(rpcErr, 'meal log write', 500);

  // ── Fallback (pre-migration): legacy read-then-write. ──
  const { data: existing, error: readErr } = await supabase
    .from('daily_health_snapshot')
    .select('calories, protein_g, carbs_g, fat_g, hydration_l')
    .eq('user_id', user.id)
    .eq('snapshot_date', today)
    .maybeSingle();
  // A failed read must not be treated as "no row" and turned into an insert that masks
  // the error / writes a wrong baseline.
  if (readErr) return dbError(readErr, 'meal log read', 500);

  const add = (cur: unknown, inc: number | null) =>
    inc == null ? (cur == null ? null : Number(cur)) : Number(cur || 0) + inc;
  const patch = {
    calories: add(existing?.calories, kcal),
    protein_g: add(existing?.protein_g, protein),
    carbs_g: add(existing?.carbs_g, carbs),
    fat_g: add(existing?.fat_g, fat),
    hydration_l: add(existing?.hydration_l, hydrationL),
  };

  const result = existing
    ? await supabase.from('daily_health_snapshot').update(patch).eq('user_id', user.id).eq('snapshot_date', today)
    : await supabase.from('daily_health_snapshot').insert({ user_id: user.id, snapshot_date: today, ...patch });
  if (result.error) {
    return dbError(result.error, 'meal log write', 500);
  }
  return NextResponse.json({ ok: true, day: today });
}
