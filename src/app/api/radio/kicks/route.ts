// The station's door asks here which listeners to drop (services/station/door/door.mjs, every few
// seconds), and drops them with Icecast's killclient (owner, 2026-11-10: Shape Radio only for the
// account listening, on its own paid membership).
//
// GET ?boot=<the station's start>   signed in as the station (Basic station:<NORA_ENGINE_TOKEN>,
//   the same sign-in Icecast's door uses on /api/radio/pass)
//   → 200 { clients: number[] }     Icecast's numbers for the connections to drop on that start:
//                                   an account's older device once a newer one connected, and an
//                                   account whose membership ended or went past due (each live
//                                   connection's membership is confirmed again about once a minute)
//   → 401 { error }                 not the station
//   → 503 { error }                 the record could not be read: drop nothing this time
//
// ⚠ IT NAMES CONNECTIONS, NEVER ACCOUNTS. The station learns only Icecast's own numbers.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseBoot, stationCaller } from '@/lib/radio/listens.mjs';
import { kicksFor } from '@/lib/radio/streams.mjs';
import { mayListen } from '@/lib/radio/may-listen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' };

export async function GET(request: Request) {
  const boot = parseBoot(new URL(request.url).searchParams.get('boot'));
  if (!stationCaller(request.headers.get('authorization')) || !boot) {
    return NextResponse.json({ error: 'Not the station.' }, { status: 401, headers: NO_STORE });
  }
  try {
    const admin = createAdminClient();
    const r = await kicksFor(admin, { boot: boot.boot, now: Date.now(), mayListen: (userId: string) => mayListen(admin, userId) });
    if (!r.ok) return NextResponse.json({ error: 'Could not read the listeners.' }, { status: 503, headers: NO_STORE });
    return NextResponse.json({ clients: r.clients }, { headers: NO_STORE });
  } catch (e) {
    console.error('[radio/kicks] failed:', (e as Error).message);
    return NextResponse.json({ error: 'Could not read the listeners.' }, { status: 503, headers: NO_STORE });
  }
}
