// How notices reach the signed-in person today, for the website bell's footer (owner, 2026-11-05: "in
// the footer the day's push count against the limit, plus quiet hours"): the daily push limit and how
// many pushes have gone out on their own date, their quiet hours on their own clock, and mute.
//
// GET -> { muted, cap, pushedToday, quiet: { start, end, tz } | null }
//   cap          notification_settings.daily_cap (4 until saved): the limit the alert engine, friends'
//                habits and client wins hold to.
//   pushedToday  rows stamped as pushed (data.channels.push) on the person's own date, the count the
//                engine reads (notify-core loadPushedToday); null when the read fails.
//   quiet        their quiet hours (22:00 to 07:00 until saved) in their zone (profile, then settings);
//                null when no zone is known, which is when none apply (quietWindow).
// Read on the person's own session (their own rows, RLS).
//
// Auth: cookie session OR Bearer token.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { quietWindow } from '../../../../lib/ai/notifications.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_CAP = 4;
const SCAN = 50;

function zoneOrNull(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  try { new Intl.DateTimeFormat('en-US', { timeZone: v.trim() }); return v.trim(); } catch { return null; }
}
function ymdIn(at: Date, tz: string): string {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at); }
  catch { return at.toISOString().slice(0, 10); }
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);
  const now = new Date();
  const [settingsRes, profileRes] = await Promise.all([
    supabase.from('notification_settings').select('muted, quiet_start, quiet_end, tz, daily_cap').eq('user_id', user.id).maybeSingle(),
    supabase.from('client_profiles').select('timezone').eq('user_id', user.id).maybeSingle(),
  ]);
  if (settingsRes.error) return NextResponse.json({ error: "Couldn't read your notification settings." }, { status: 502 });
  const s = (settingsRes.data ?? {}) as { muted?: boolean; quiet_start?: number; quiet_end?: number; tz?: string; daily_cap?: number };
  const zone = zoneOrNull((profileRes.data as { timezone?: string } | null)?.timezone) || zoneOrNull(s.tz);
  const q = (quietWindow as (settings: unknown, zone: string | null) => { quietStart: number; quietEnd: number; tz: string })(s, zone);
  const dayTz = zone || 'UTC';
  const today = ymdIn(now, dayTz);
  const since = new Date(now.getTime() - 30 * 60 * 60 * 1000).toISOString();
  const { data: pushed, error: pushErr } = await supabase.from('notifications').select('created_at')
    .eq('user_id', user.id).eq('data->channels->>push', 'true').gte('created_at', since)
    .order('created_at', { ascending: false }).limit(SCAN);
  const pushedToday = pushErr ? null : ((pushed ?? []) as { created_at?: string }[])
    .filter((r) => { const at = Date.parse(String(r.created_at || '')); return Number.isFinite(at) && ymdIn(new Date(at), dayTz) === today; }).length;
  return NextResponse.json({
    muted: s.muted === true,
    cap: Number.isFinite(s.daily_cap) ? (s.daily_cap as number) : DEFAULT_CAP,
    pushedToday,
    quiet: zone && q.quietStart !== q.quietEnd ? { start: q.quietStart, end: q.quietEnd, tz: q.tz } : null,
  });
}
