// Batch recovery (recent sleep) + check-in vitals for a coach's roster — ONE
// query, so the coach's "who needs you" triage can flag a client's chronic sleep
// deficit and the §3A energy/hunger reads without N per-client fetches. RLS
// (providers_read_subscriber_snapshots) gates each snapshot row to coaches with
// an active subscription on that client, so an `.in('user_id', clientIds)` only
// ever returns the caller's own clients' rows.
//
// POST { clientIds: string[] } -> { ok, recovery: { [clientId]: {
//   sleepHours?: { avg7, lastNight, target },
//   vitals?: { energy?: { avg7, n }, hunger?: { avg7, n },
//              hydration?: { avg7L, targetL: null, n } },
// } } }
// Each leg is present only when that client has REAL data for it — a client with
// check-in gauges but no synced sleep gets a vitals-only entry, never a
// fabricated sleepHours. `vitals.hydration.targetL` is deliberately null on the
// coach side: hydration_low is a CLIENT-ONLY directive (owner ruling), and with
// no target the engine's rule cannot fire even if a caller routed this record
// through a client-role evaluation.

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
  // Explicit column list is safe here: user_id / snapshot_date / sleep_hours /
  // hydration_l all predate the sleep-detail migration, and energy / hunger landed
  // with 2026-06-25-daily-energy-hunger.sql (applied live), so PostgREST won't 400.
  const { data } = await supabase
    .from('daily_health_snapshot')
    .select('user_id, snapshot_date, sleep_hours, energy, hunger, hydration_l')
    .in('user_id', ids)
    .gte('snapshot_date', since)
    .order('snapshot_date', { ascending: true });

  // Per-user, per-metric value lists in snapshot_date order. A missing/junk value
  // is ABSENCE — the row is skipped for THAT metric only (never coerced: Number(null)
  // is a finite 0, the documented fabrication class). The `v > 0` filter matches the
  // engine's absence doctrine: energy/hunger carry a DB CHECK of 1-10, and a 0-liter
  // hydration row is indistinguishable from a row another metric's write created —
  // under-firing is the safe direction (same rationale as sleep_hours above it).
  type Buckets = { sleep: number[]; energy: number[]; hunger: number[]; hydration: number[] };
  const byUser = new Map<string, Buckets>();
  const push = (k: string, metric: keyof Buckets, raw: unknown) => {
    const v = Number(raw);
    if (!Number.isFinite(v) || v <= 0) return;
    const b = byUser.get(k) ?? { sleep: [], energy: [], hunger: [], hydration: [] };
    b[metric].push(v);
    byUser.set(k, b);
  };
  for (const r of data ?? []) {
    const row = r as { user_id?: unknown; sleep_hours?: unknown; energy?: unknown; hunger?: unknown; hydration_l?: unknown };
    const k = String(row.user_id);
    push(k, 'sleep', row.sleep_hours);
    push(k, 'energy', row.energy);
    push(k, 'hunger', row.hunger);
    push(k, 'hydration', row.hydration_l);
  }

  const avg7 = (vals: number[]) => {
    const last7 = vals.slice(-7); // rows are snapshot_date ASC → last 7 logged days
    return { avg: Math.round((last7.reduce((a, b) => a + b, 0) / last7.length) * 100) / 100, n: last7.length };
  };
  type Vitals = {
    energy?: { avg7: number; n: number };
    hunger?: { avg7: number; n: number };
    hydration?: { avg7L: number; targetL: null; n: number };
  };
  const recovery: Record<string, { sleepHours?: { avg7: number; lastNight: number; target: number }; vitals?: Vitals }> = {};
  for (const [k, b] of byUser) {
    const entry: { sleepHours?: { avg7: number; lastNight: number; target: number }; vitals?: Vitals } = {};
    if (b.sleep.length) {
      entry.sleepHours = { avg7: avg7(b.sleep).avg, lastNight: b.sleep[b.sleep.length - 1], target: 7.5 };
    }
    const vitals: Vitals = {};
    if (b.energy.length) { const a = avg7(b.energy); vitals.energy = { avg7: a.avg, n: a.n }; }
    if (b.hunger.length) { const a = avg7(b.hunger); vitals.hunger = { avg7: a.avg, n: a.n }; }
    // targetL stays null on the coach side — hydration_low is CLIENT-ONLY (see header).
    if (b.hydration.length) { const a = avg7(b.hydration); vitals.hydration = { avg7L: a.avg, targetL: null, n: a.n }; }
    if (Object.keys(vitals).length) entry.vitals = vitals;
    if (entry.sleepHours || entry.vitals) recovery[k] = entry;
  }
  return NextResponse.json({ ok: true, recovery });
}
