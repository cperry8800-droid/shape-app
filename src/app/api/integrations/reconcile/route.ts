// Source reconciliation (INT2) — the on-demand "which source do you trust?" view.
// GET returns the metrics where connected providers DISAGREE (side-by-side per
// source + the current authoritative one). POST sets the authoritative source for
// a metric (writes the override + re-points the snapshot). Role-scoped by the
// underlying SECURITY DEFINER RPCs: a user sees their own data; a coach sees a
// client they're on (is_coach_on_client). Off the client's default path — reached
// from the integrations hub.
//
// GET  /api/integrations/reconcile?clientId&days&all   → { items }
// POST /api/integrations/reconcile  { clientId?, metric, source } → { ok }

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { buildReconciliation } from '@/lib/integrations/reconcile.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);
  const url = new URL(request.url);
  const clientId = url.searchParams.get('clientId') || user.id;
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '7', 10) || 7, 1), 60);
  const conflictsOnly = url.searchParams.get('all') !== '1';

  const { data, error } = await supabase.rpc('get_health_sources', { p_user_id: clientId, p_days: days });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data == null) return NextResponse.json({ error: 'Not authorized for this user.' }, { status: 403 });

  const blob = data as { observations?: unknown[]; overrides?: Record<string, string> };
  const items = buildReconciliation(
    Array.isArray(blob.observations) ? blob.observations : [],
    (blob.overrides && typeof blob.overrides === 'object') ? blob.overrides : {},
    { conflictsOnly },
  );
  return NextResponse.json({ items, clientId, days });
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const parsed = await readJson<{ clientId?: string; metric?: string; source?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const metric = String(parsed.data.metric ?? '');
  const source = String(parsed.data.source ?? '');
  if (!metric || !source) return NextResponse.json({ error: 'metric and source are required.' }, { status: 400 });
  const clientId = parsed.data.clientId || user.id;

  const { data, error } = await supabase.rpc('set_metric_source', { p_user_id: clientId, p_metric: metric, p_source: source });
  if (error) {
    const denied = /not authorized/i.test(error.message) || error.code === '42501';
    return NextResponse.json({ error: denied ? 'Not authorized for this user.' : error.message }, { status: denied ? 403 : 500 });
  }
  return NextResponse.json({ ok: true, result: data });
}
