// Batch recovery (recent sleep) for a coach's roster — ONE query, so the coach's
// "who needs you" triage can flag a client's chronic sleep deficit without N
// per-client fetches. RLS (providers_read_subscriber_snapshots) gates each snapshot
// row to coaches with an active subscription on that client, so an
// `.in('user_id', clientIds)` only ever returns the caller's own clients' rows.
//
// POST { clientIds: string[] } -> { ok, recovery: { [clientId]: { sleepHours: { avg7, lastNight, target } } } }

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const body = await readJson<{ clientIds?: unknown }>(request, { allowEmpty: true });
  if (!body.ok) return body.response;
  const ids = Array.isArray(body.data?.clientIds)
    ? [...new Set((body.data!.clientIds as unknown[]).map(String).filter(Boolean))].slice(0, 200)
    : [];
  if (!ids.length) return NextResponse.json({ ok: true, recovery: {} });

  const supabase = await clientForRequest(request);
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  // select('*') for migration-safety (the route never names a column that might
  // not exist yet); we only read sleep_hours here.
  const { data } = await supabase
    .from('daily_health_snapshot')
    .select('user_id, snapshot_date, sleep_hours')
    .in('user_id', ids)
    .gte('snapshot_date', since)
    .order('snapshot_date', { ascending: true });

  const byUser = new Map<string, number[]>();
  for (const r of data ?? []) {
    const v = Number((r as { sleep_hours?: unknown }).sleep_hours);
    if (!Number.isFinite(v) || v <= 0) continue;
    const k = String((r as { user_id?: unknown }).user_id);
    const arr = byUser.get(k) ?? [];
    arr.push(v);
    byUser.set(k, arr);
  }

  const recovery: Record<string, { sleepHours: { avg7: number; lastNight: number; target: number } }> = {};
  for (const [k, vals] of byUser) {
    const last7 = vals.slice(-7);
    recovery[k] = {
      sleepHours: {
        avg7: Math.round((last7.reduce((a, b) => a + b, 0) / last7.length) * 100) / 100,
        lastNight: vals[vals.length - 1],
        target: 7.5,
      },
    };
  }
  return NextResponse.json({ ok: true, recovery });
}
