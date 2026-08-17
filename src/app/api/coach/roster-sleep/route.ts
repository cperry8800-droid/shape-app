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
import { buildRosterVitals } from '@/lib/roster-vitals.mjs';

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
  // The QUERY window is 14 days because the SLEEP leg wants that much history.
  // The vitals legs narrow it to 7 calendar days in code (see buildRosterVitals).
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

  // Per-user sleep values in snapshot_date order, over the full 14-day read.
  // A missing/junk value is ABSENCE — the row is skipped (never coerced:
  // Number(null) is a finite 0, the documented fabrication class); the `v > 0`
  // filter matches the engine's absence doctrine (under-firing is the safe
  // direction).
  //
  // ⚠ The VITALS legs do NOT share this window. `avg7(vals)` averages the last 7
  // LOGGED values over however many rows exist, so a client whose only energy /
  // hunger readings are 8-14 days old would still satisfy `n >= 3` and raise a
  // coach flag the member's own engine (vitalsFromProgress, which uses a 7-
  // CALENDAR-DAY cutoff) treats as stale. They are built by `buildRosterVitals`,
  // which enforces the same 7-calendar-day cutoff — see src/lib/roster-vitals.mjs
  // for the day-boundary basis (UTC here, member-local there) and its documented
  // one-boundary-day tolerance.
  type Vitals = {
    energy?: { avg7: number; n: number };
    hunger?: { avg7: number; n: number };
    hydration?: { avg7L: number; targetL: null; n: number };
  };
  const sleepByUser = new Map<string, number[]>();
  for (const r of data ?? []) {
    const row = r as { user_id?: unknown; sleep_hours?: unknown };
    const v = Number(row.sleep_hours);
    if (!Number.isFinite(v) || v <= 0) continue;
    const k = String(row.user_id);
    const vals = sleepByUser.get(k) ?? [];
    vals.push(v);
    sleepByUser.set(k, vals);
  }
  const vitalsByUser: Map<string, Vitals> = buildRosterVitals(data ?? [], { now: new Date() });

  // Sleep keeps its own established window: the last 7 LOGGED nights out of the
  // 14-day read. Untouched by this file's vitals fix.
  const avg7 = (vals: number[]) => {
    const last7 = vals.slice(-7); // rows are snapshot_date ASC → last 7 logged days
    return { avg: Math.round((last7.reduce((a, b) => a + b, 0) / last7.length) * 100) / 100, n: last7.length };
  };
  const recovery: Record<string, { sleepHours?: { avg7: number; lastNight: number; target: number }; vitals?: Vitals }> = {};
  // A client may have sleep with no in-window vitals, or vitals with no sleep —
  // walk the union so neither leg can drop the other's entry.
  for (const k of new Set([...sleepByUser.keys(), ...vitalsByUser.keys()])) {
    const entry: { sleepHours?: { avg7: number; lastNight: number; target: number }; vitals?: Vitals } = {};
    const sleep = sleepByUser.get(k);
    if (sleep && sleep.length) {
      entry.sleepHours = { avg7: avg7(sleep).avg, lastNight: sleep[sleep.length - 1], target: 7.5 };
    }
    const vitals = vitalsByUser.get(k);
    if (vitals) entry.vitals = vitals;
    if (entry.sleepHours || entry.vitals) recovery[k] = entry;
  }
  return NextResponse.json({ ok: true, recovery });
}
