// Batched weekday-vs-weekend split for a coach's roster. One RPC (set-based,
// owner-gated, SECURITY DEFINER) returns weekly buckets per client; we run the
// pure twin per client so the statistics live in exactly one place.
import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { computeWeekendSplit, type WeeklyBucket } from '@/lib/weekendSplit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Row = {
  client_id: string; dimension: 'nutrition' | 'habits' | 'training'; week_start: string;
  weekday_num: number; weekday_den: number; weekend_num: number; weekend_den: number;
};

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const body = await readJson<{ clientIds?: unknown }>(request, { allowEmpty: true });
  if (!body.ok) return body.response;
  // Keep only UUID-shaped ids — the RPC's uuid[] arg rejects anything else, and a
  // single bad element ("[object Object]") would error the whole batch into the
  // quiet empty-split fallback, losing weekend data for every client in it.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = Array.isArray(body.data?.clientIds)
    ? [...new Set((body.data!.clientIds as unknown[]).map(String).filter((s) => UUID.test(s)))].slice(0, 200)
    : [];
  if (!ids.length) return NextResponse.json({ ok: true, split: {} });

  const supabase = await clientForRequest(request);
  const { data, error } = await supabase.rpc('get_roster_weekend_split', { p_client_ids: ids });
  if (error) return NextResponse.json({ ok: true, split: {} }); // degrade quietly; never block the roster

  const byClient = new Map<string, { nutrition: WeeklyBucket[]; habits: WeeklyBucket[]; training: WeeklyBucket[] }>();
  for (const r of (data || []) as Row[]) {
    const e = byClient.get(r.client_id) || { nutrition: [], habits: [], training: [] };
    // Skip any dimension the route doesn't model rather than throwing — keeps the
    // route forward-compatible if the RPC ever returns a new dimension before this
    // code ships (the loop isn't otherwise guarded, so an unknown key would 500).
    const bucket = (e as Record<string, WeeklyBucket[]>)[r.dimension];
    if (!bucket) continue;
    bucket.push({
      weekStart: r.week_start,
      weekdayNum: Number(r.weekday_num) || 0, weekdayDen: Number(r.weekday_den) || 0,
      weekendNum: Number(r.weekend_num) || 0, weekendDen: Number(r.weekend_den) || 0,
    });
    byClient.set(r.client_id, e);
  }

  const split: Record<string, ReturnType<typeof computeWeekendSplit>> = {};
  for (const id of ids) {
    const buckets = byClient.get(id) || { nutrition: [], habits: [], training: [] };
    split[id] = computeWeekendSplit(buckets);
  }
  return NextResponse.json({ ok: true, split });
}
