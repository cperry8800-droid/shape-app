// Meal-log macro write — makes the Nutrition stats real.
// When a client logs a meal ("Ate as planned" / the full logger), the meal's
// macros ACCUMULATE onto today's daily_health_snapshot row (unique on
// user_id + snapshot_date) — the same row/columns the client nutrition +
// analytics rollups and the coach consoles already read. Merges with any
// device-synced metrics for the day rather than overwriting them.
//
// POST { kcal?, protein?, carbs?, fat?, hydrationL? } -> { ok, day }
// Auth: cookie session OR Bearer token (mobile bridges either). Sits under
// /api/nutrition so the membership proxy gate applies.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson, dbError } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function asNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
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
  const today = new Date().toISOString().slice(0, 10);

  const { data: existing } = await supabase
    .from('daily_health_snapshot')
    .select('calories, protein_g, carbs_g, fat_g, hydration_l')
    .eq('user_id', user.id)
    .eq('snapshot_date', today)
    .maybeSingle();

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
