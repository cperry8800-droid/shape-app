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
import { readRosterRecovery } from '@/lib/roster-vitals.mjs';

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
  // The read and its windows live in src/lib/roster-vitals.mjs, shared with Nora's "What
  // needs me today?", so the app's Today and Nora triage the same inputs. A failed read
  // stays an empty map here, as it always has: the Today feed treats this leg as optional.
  const { recovery } = await readRosterRecovery(supabase, ids, { now: new Date() });
  return NextResponse.json({ ok: true, recovery });
}
