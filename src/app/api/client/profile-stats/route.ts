// Self-readable living-profile stats: real key lifts + discipline bars for the
// signed-in client's OWN profile (web living profile / app Terrain). Backed by
// the self-scoped get_my_lifts() RPC. Degrades cleanly (honest empty) when the
// migration isn't applied yet or there's no logged data, so the profile falls
// back to its example sub-data per field.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireMembership } from '@/lib/require-membership';

export const dynamic = 'force-dynamic';

const DISC_ORDER: Array<[key: string, label: string]> = [
  ['strength', 'Strength'],
  ['endurance', 'Endurance'],
  ['consistency', 'Consistency'],
  ['recovery', 'Recovery'],
];

export async function GET(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { data, error } = await supabase.rpc('get_my_lifts');
  if (error || !data || typeof data !== 'object') {
    // RPC missing (pre-migration) or no rows — let the client keep its example.
    return NextResponse.json({ ok: true, hasLifts: false, lifts: [], disciplines: [], prCount: 0, avgRpe: null });
  }

  const d = data as Record<string, unknown>;

  // Key lifts → [[name, "245"], …] (the shape the profile renders).
  const keyLifts = Array.isArray(d.keyLifts) ? (d.keyLifts as Array<Record<string, unknown>>) : [];
  const lifts = keyLifts
    .filter((l) => l && typeof l.name === 'string' && l.best != null)
    .map((l) => {
      const best = Number(l.best);
      const val = Number.isFinite(best) ? String(Math.round(best * 10) / 10) : String(l.best);
      return [String(l.name), val] as [string, string];
    });

  // Disciplines → [["Strength", 0.7], …]; only the ones with a real signal.
  const discIn = (d.disciplines && typeof d.disciplines === 'object') ? (d.disciplines as Record<string, unknown>) : {};
  const disciplines = DISC_ORDER
    .map(([key, label]) => {
      const v = discIn[key];
      return typeof v === 'number' && Number.isFinite(v) ? ([label, Math.max(0, Math.min(1, v))] as [string, number]) : null;
    })
    .filter((x): x is [string, number] => x !== null);

  return NextResponse.json({
    ok: true,
    hasLifts: lifts.length > 0,
    lifts,
    disciplines,
    prCount: typeof d.prs === 'number' ? d.prs : 0,
    avgRpe: typeof d.avgRpe === 'number' ? d.avgRpe : null,
    workoutsLogged42d: typeof d.workoutsLogged42d === 'number' ? d.workoutsLogged42d : 0,
  });
}
