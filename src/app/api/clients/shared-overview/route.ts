// Batched per-client overviews for a coach's roster.
//
// POST { ids: string[] } → { me, results: { [id]: overview }, failed: string[] }
//
// The coach dashboard used to issue ONE GET /api/clients/[id]/shared-overview per
// roster member (through a 4-wide pool), so a 30-client roster was 30 requests,
// 30 auth round trips and 30 × ~20 reads, and the page's enrichment finished when
// the slowest lane did. This route runs the SAME body (src/lib/shared-overview.ts —
// the single route's, lifted verbatim) for every id under ONE authenticated
// request. Authz is unchanged: every read still runs under the CALLER's client, so
// a client the coach is not linked to reads empty here exactly as it did on the
// single route — the batch adds no reach a single request lacked.
//
// ⚠ FAILURES ARE PER CLIENT AND NAMED. One client's read throwing must not take
// the other 29 down with it, and it must not ship as an empty overview either
// (an empty overview is the positive claim "nothing shared"). A client whose
// build threw is listed in `failed` and absent from `results`; the dashboard
// renders that row as "unavailable", the same state a failed single GET produced.
//
// ⚠ THE CAP IS THE POOL'S REASON FOR EXISTING. Fifty ids is one roster page; an
// unbounded list would let one request fan a coach's whole history of reads out
// on the server instead of the client. The dashboard chunks at the same number.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/request-utils';
import { buildSharedOverview, parseBatchIds, resolveMe } from '@/lib/shared-overview';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Fifty builds at four lanes is ~12 sequential builds per lane, each a handful of
// parallel PostgREST round trips — comfortably under a minute, but past the
// platform's default function timeout on a slow day. A timeout here would fail
// the WHOLE batch (every row "unavailable") where the old fan-out only lost the
// slow client, so the ceiling is raised the way the other long routes raise it.
export const maxDuration = 60;

// How many clients build at once. Each build is ~20 PostgREST reads; four lanes
// is the client-side pool's width, so the load on the database is what it was —
// it just stops paying an HTTP round trip and an auth check per lane.
const BATCH_CONCURRENCY = 4;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const parsed = await readJson<unknown>(req);
  if (!parsed.ok) return parsed.response;
  const wanted = parseBatchIds(parsed.data);
  if (!wanted.ok) return NextResponse.json({ error: wanted.error }, { status: 400 });

  const me = await resolveMe(supabase, user.id);
  const results: Record<string, unknown> = {};
  const failed: string[] = [];
  let next = 0;
  const lane = async () => {
    while (next < wanted.ids.length) {
      const id = wanted.ids[next++];
      try {
        results[id] = await buildSharedOverview(supabase, { clientId: id, me });
      } catch (e) {
        failed.push(id);
        console.error('[shared-overview/batch] client build failed:', id, e instanceof Error ? e.message : e);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, wanted.ids.length) }, lane));
  return NextResponse.json({ me, results, failed });
}
