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
    // The Morning check-in (owner, 2026-10-18: a Daily check-in reminder opens the card; renamed
    // 2026-10-19): a tap lands on Home with the walkthrough open at the first question not yet
    // answered. It is not sent on a day whose morning is already answered (morningsAnswered).
    case 'daily_checkin':
      return { type: 'reminder_daily_checkin', title: l || 'Morning check-in', body: 'Two quick checks: last night and this morning.', route: 'today' };
    case 'water':
      return { type: 'reminder_water', title: l || 'Hydration check', body: 'Water break — keep it flowing.', route: null };
    case 'photo':
      return { type: 'reminder_photo', title: l || 'Progress photo', body: 'Snap today’s progress photo while you’re thinking about it.', route: 'progress' };
    default:
      return { type: 'reminder_custom', title: l || 'Reminder', body: l ? '' : 'You set a reminder for now.', route: null };
  }
}

// The mornings answered among the due Morning check-in reminders, as `user|date` keys. A morning is
// answered once its energy is in: the one morning answer every finished check-in has (the night can
// be skipped, and a watch can fill it). snapshot_date is the member's local day, as is `date` here
// (both the device's zone, saved with the reminder). One read per local date and 200 members, not
// one per reminder, so a busy hour stays inside the route's time (Codex P2 on #2407). A read that
// fails leaves its members unanswered: a reminder too many is cheaper than a check-in missed.
async function morningsAnswered(admin: ReturnType<typeof createAdminClient>, due: Array<{ userId: string; date: string }>): Promise<Set<string>> {
  const answered = new Set<string>();
  const byDate = new Map<string, string[]>();
  for (const d of due) {
    const ids = byDate.get(d.date) || [];
    if (!ids.includes(d.userId)) ids.push(d.userId);
    byDate.set(d.date, ids);
  }
  for (const [date, ids] of byDate) {
    for (let i = 0; i < ids.length; i += 200) {
      try {
        const { data, error } = await admin
          .from('daily_health_snapshot')
          .select('user_id')
          .in('user_id', ids.slice(i, i + 200))
          .eq('snapshot_date', date)
          .not('energy', 'is', null);
        if (error) continue;
        for (const row of (data ?? []) as Array<{ user_id: string }>) answered.add(`${row.user_id}|${date}`);
      } catch {
        // Sent anyway.
      }
    }
  }
  return answered;
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

  // Due this hour: its local hour and weekday, and not yet fired today (local).
  const due: Array<{ r: Reminder; date: string }> = [];
  for (const r of rows) {
    const { hour, dow, date } = localNow(r.tz);
    const targetHour = Number(String(r.at_time || '09:00').slice(0, 2));
    if (hour !== targetHour) continue;
    if (!Array.isArray(r.days) || !r.days.includes(dow)) continue;
    if (r.last_fired_on === date) continue;
    due.push({ r, date });
  }
  const answered = await morningsAnswered(admin, due.filter((d) => d.r.kind === 'daily_checkin').map((d) => ({ userId: d.r.user_id, date: d.date })));

  for (const { r, date } of due) {
    try {
      if (r.kind === 'daily_checkin' && answered.has(`${r.user_id}|${date}`)) {
        // Answered already: today is done for this reminder.
        await admin.from('user_scheduled_reminders').update({ last_fired_on: date }).eq('id', r.id);
        continue;
      }

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
