// User-set reminders — hourly evaluator. Scans enabled user_scheduled_reminders,
// and for each whose LOCAL hour (in the reminder's tz) matches its at_time and
// whose local weekday is in `days`, fires ONE notification per local day (deduped
// via last_fired_on). The notification rides the existing push spine (a
// notifications INSERT → /api/push/dispatch webhook).
//
// Auth: header `x-cron-secret: <CRON_SECRET>` OR Vercel Cron's `Authorization:
// Bearer <CRON_SECRET>`. Runs as the service role. No-op until the
// 2026-06-19-user-reminders migration is applied.

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && timingSafeEqual(x, y);
}

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET || process.env.NOTIFY_CRON_SECRET || '';
  if (!secret) return false;
  const hdr = request.headers.get('x-cron-secret') || '';
  const auth = request.headers.get('authorization') || '';
  return safeEqual(hdr, secret) || safeEqual(auth, `Bearer ${secret}`);
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Local hour (0-23), weekday (0=Sun), and date (YYYY-MM-DD) in a tz. Falls back to
// UTC on a bad tz.
function localNow(tz: string): { hour: number; dow: number; date: string } {
  const now = new Date();
  const zone = tz || 'UTC';
  try {
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' }).format(now));
    const dow = DOW.indexOf(new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short' }).format(now));
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    return { hour: Number.isFinite(hour) ? hour % 24 : 0, dow: dow < 0 ? 0 : dow, date };
  } catch {
    return { hour: now.getUTCHours(), dow: now.getUTCDay(), date: now.toISOString().slice(0, 10) };
  }
}

function content(kind: string, label: string): { type: string; title: string; body: string; route: string | null } {
  const l = (label || '').trim();
  switch (kind) {
    case 'weigh_in':
      return { type: 'reminder_weigh_in', title: l || 'Time to weigh in', body: 'A quick weigh-in keeps your trend honest.', route: 'progress' };
    case 'checkin':
      return { type: 'reminder_checkin', title: l || 'Weekly check-in', body: 'Your check-in is ready when you are.', route: 'progress' };
    case 'water':
      return { type: 'reminder_water', title: l || 'Hydration check', body: 'Water break — keep it flowing.', route: null };
    case 'photo':
      return { type: 'reminder_photo', title: l || 'Progress photo', body: 'Snap today’s progress photo while you’re thinking about it.', route: 'progress' };
    default:
      return { type: 'reminder_custom', title: l || 'Reminder', body: l ? '' : 'You set a reminder for now.', route: null };
  }
}

type Reminder = {
  id: string; user_id: string; kind: string; label: string;
  at_time: string; days: number[]; tz: string; last_fired_on: string | null;
};

async function handle(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  let fired = 0;

  let rows: Reminder[] = [];
  try {
    const { data, error } = await admin
      .from('user_scheduled_reminders')
      .select('id, user_id, kind, label, at_time, days, tz, last_fired_on')
      .eq('enabled', true)
      .limit(2000);
    if (error) throw error;
    rows = (data ?? []) as Reminder[];
  } catch (err) {
    console.error('[shape] reminders scan failed (migration not applied?):', err);
    return NextResponse.json({ ok: true, fired: 0, skipped: true });
  }

  for (const r of rows) {
    try {
      const { hour, dow, date } = localNow(r.tz);
      const targetHour = Number(String(r.at_time || '09:00').slice(0, 2));
      if (hour !== targetHour) continue;
      if (!Array.isArray(r.days) || !r.days.includes(dow)) continue;
      if (r.last_fired_on === date) continue; // already fired today (local)

      const c = content(r.kind, r.label);
      await createNotification(admin, {
        userId: r.user_id,
        type: c.type,
        title: c.title,
        body: c.body,
        route: c.route || undefined,
        data: { channels: { inapp: true, push: true, email: false }, reminderId: r.id },
      });
      await admin.from('user_scheduled_reminders').update({ last_fired_on: date }).eq('id', r.id);
      fired += 1;
    } catch (err) {
      console.error('[shape] reminder fire failed:', r.id, err);
    }
  }

  return NextResponse.json({ ok: true, fired });
}

export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}
