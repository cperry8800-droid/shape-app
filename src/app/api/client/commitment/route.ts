// Weekly commitment + stake — read the signed-in member's current-week commitment +
// live progress, and set/accept via the DEFINER RPCs. The mobile app talks to the RPCs
// directly (RLS-scoped); this route is the web dashboard's equivalent (cookie session).
// Member-gated by the proxy (the /api/client prefix). No-op shapes until the migration.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireMembership } from '@/lib/require-membership';

export const dynamic = 'force-dynamic';

function weekMonday(d: Date): string {
  const m = new Date(d);
  m.setUTCHours(0, 0, 0, 0);
  m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7));
  return m.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const wk = weekMonday(new Date());
  const end = new Date(`${wk}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  const wkEnd = end.toISOString().slice(0, 10);

  const [commitRes, snaps, acts, chk, habs] = await Promise.all([
    supabase.from('score_commitments').select('id, targets, stake, status, week_of, created_by').eq('user_id', user.id).eq('week_of', wk).maybeSingle(),
    supabase.from('daily_health_snapshot').select('snapshot_date, workout_minutes').eq('user_id', user.id).gte('snapshot_date', wk).lte('snapshot_date', wkEnd),
    supabase.from('activities').select('started_at').eq('user_id', user.id).gte('started_at', wk).lte('started_at', `${wkEnd}T23:59:59Z`),
    supabase.from('client_checkins').select('week_of').eq('user_id', user.id).eq('week_of', wk).maybeSingle(),
    supabase.from('user_habit_completions').select('done_on').eq('user_id', user.id).gte('done_on', wk).lte('done_on', wkEnd),
  ]);

  const days = new Set<string>();
  for (const s of (snaps.data || []) as Array<{ snapshot_date: string; workout_minutes: number | null }>) {
    if ((s.workout_minutes || 0) > 0) days.add(s.snapshot_date);
  }
  for (const a of (acts.data || []) as Array<{ started_at: string }>) {
    days.add(String(a.started_at).slice(0, 10));
  }
  const progress = { workouts: days.size, checkin: !!chk.data, habits: (habs.data || []).length };
  return NextResponse.json({ commitment: commitRes.data || null, progress });
}

export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { action?: string; targets?: unknown; stake?: number; id?: string };
  if (body.action === 'accept' && body.id) {
    const { data } = await supabase.rpc('accept_commitment', { p_id: body.id });
    return NextResponse.json(data || { accepted: false });
  }
  if (body.action === 'set') {
    const { data } = await supabase.rpc('set_commitment', {
      p_user: user.id,
      p_targets: body.targets || {},
      p_stake: Number(body.stake) || 0,
    });
    return NextResponse.json(data || { ok: false });
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
