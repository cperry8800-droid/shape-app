// User-set reminders — every 5 minutes (vercel.json). Scans enabled user_scheduled_reminders,
// and fires each whose LOCAL time (in the reminder's tz) has reached its at_time, on a weekday in
// `days`, ONE notification per local day (deduped via last_fired_on). The notification rides the
// existing push spine (a notifications INSERT → /api/push/dispatch webhook).
// ⚠ TO THE MINUTE, AND A MISSED RUN CATCHES UP (owner, 2026-10-26: "fix 1-7"). The cron ran hourly and
// fired on a matching hour, so a 7:45 reminder went at 7:00 and one whose run was missed never went.
//
// Auth: header `x-cron-secret: <CRON_SECRET>` OR Vercel Cron's `Authorization:
// Bearer <CRON_SECRET>`. Runs as the service role. No-op until the
// 2026-06-19-user-reminders migration is applied.

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notify';
import { np } from '../../../../../mobile-app/src/services/noticeCopy.mjs';

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

// Local minute of the day (0-1439), weekday (0=Sun), and date (YYYY-MM-DD) in a tz. Falls back to
// UTC on a bad tz.
export function localNow(tz: string, now: Date = new Date()): { minute: number; dow: number; date: string } {
  const zone = tz || 'UTC';
  try {
    const hm = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const part = (k: string) => Number(hm.find((p) => p.type === k)?.value);
    const hour = part('hour'), min = part('minute');
    const dow = DOW.indexOf(new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short' }).format(now));
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const minute = Number.isFinite(hour) && Number.isFinite(min) ? (hour % 24) * 60 + min : 0;
    return { minute, dow: dow < 0 ? 0 : dow, date };
  } catch {
    return { minute: now.getUTCHours() * 60 + now.getUTCMinutes(), dow: now.getUTCDay(), date: now.toISOString().slice(0, 10) };
  }
}

// How long after its time a reminder may still go: a run that was late or missed catches it up.
// ⚠ SHORT ON PURPOSE. A reminder saved for a time already past today would go the moment it is saved;
// half an hour covers a late or missed 5-minute run and fires nothing set for this morning at noon.
export const CATCH_UP_MINUTES = 30;

// The local day before `date` (YYYY-MM-DD).
function dayBefore(date: string): string {
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d - 1)).toISOString().slice(0, 10);
}

// The local day a reminder is due for at this local time, or null: a weekday it is set for, its time
// reached (to the minute) at most CATCH_UP_MINUTES ago, and not yet fired that day. The day is what
// last_fired_on records.
// ⚠ JUST AFTER MIDNIGHT THAT CAN BE YESTERDAY (Codex on #2476). A 23:55 reminder whose run was missed
// goes at 00:00 as yesterday's; read as today's, it was dropped, and stamped today it would have
// stopped today's own.
export function reminderDueOn(r: Pick<Reminder, 'at_time' | 'days' | 'last_fired_on'>, local: { minute: number; dow: number; date: string }): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(r.at_time || '09:00'));
  const at = m ? Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2])) : 9 * 60;
  if (!Array.isArray(r.days)) return null;
  const today = local.minute - at;
  const [late, dow, date] = today >= 0 ? [today, local.dow, local.date] : [today + 1440, (local.dow + 6) % 7, dayBefore(local.date)];
  if (late > CATCH_UP_MINUTES || !r.days.includes(dow) || r.last_fired_on === date) return null;
  return date;
}

// `copy` is how the bell and the push say it in another language (noticeCopy.mjs). A label the member
// wrote is their own words, said as they wrote it, so the title has no copy then.
type Copy = { title?: [string]; body?: [string] };
function content(kind: string, label: string): { type: string; title: string; body: string; route: string | null; copy: Copy } {
  const l = (label || '').trim();
  const said = (k: string, withBody = true): Copy => ({ ...(l ? {} : { title: np(`reminder.${k}.title`) as [string] }), ...(withBody ? { body: np(`reminder.${k}.body`) as [string] } : {}) });
  switch (kind) {
    case 'weigh_in':
      return { type: 'reminder_weigh_in', title: l || 'Time to weigh in', body: 'A quick weigh-in keeps your trend honest.', route: 'progress', copy: said('weighIn') };
    case 'checkin':
      return { type: 'reminder_checkin', title: l || 'Weekly check-in', body: 'Your check-in is ready when you are.', route: 'progress', copy: said('checkin') };
    // The Morning check-in (owner, 2026-10-18: a Daily check-in reminder opens the card; renamed
    // 2026-10-19): a tap lands on Home with the walkthrough open at the first question not yet
    // answered. It is not sent on a day whose morning is already answered: energy, and the night's
    // hours or a skip, as the card asks (morningsAnswered).
    case 'daily_checkin':
      return { type: 'reminder_daily_checkin', title: l || 'Morning check-in', body: 'Two quick checks: last night and this morning.', route: 'today', copy: said('morning') };
    case 'water':
      return { type: 'reminder_water', title: l || 'Hydration check', body: 'Water break — keep it flowing.', route: null, copy: said('water') };
    case 'photo':
      return { type: 'reminder_photo', title: l || 'Progress photo', body: 'Snap today’s progress photo while you’re thinking about it.', route: 'progress', copy: said('photo') };
    default:
      return { type: 'reminder_custom', title: l || 'Reminder', body: l ? '' : 'You set a reminder for now.', route: null, copy: said('custom', !l) };
  }
}

// The mornings answered among the due Morning check-in reminders, as `user|date` keys. A morning is
// answered once its energy is in and its night is too, by the card's own rule (bsCiStep): hours,
// typed or a watch's (a watch's 0h night included), or a skip (sleep_skipped, saved by the card's
// Skip). Energy saved alone, or with only a Rested answer, as Same as yesterday after a watch night
// can, leaves the night open, and the card still asks for it, so the reminder still goes (owner,
// 2026-10-19: "yes fix"; review on #2408). snapshot_date is the member's local day, as is `date`
// here (both the device's zone, saved with the reminder).
// One read per local date and 200 members, not one per reminder, so a busy hour stays inside the
// route's time (Codex P2 on #2407). A read that fails leaves its members unanswered: a reminder too
// many is cheaper than a check-in missed.
// ⚠ UNTIL 2026-10-19-sleep-skipped.sql RUNS, the column is missing (42703 from Postgres, or
// PostgREST's PGRST204): the read is made again without it, and energy alone answers the morning,
// the rule before it.
const noSkipColumn = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42703' || e.code === 'PGRST204' || /sleep_skipped/.test(String(e.message || '')));
type MorningRow = { user_id: string; sleep_hours?: number | null; sleep_skipped?: boolean | null };
const nightDone = (r: MorningRow) => r.sleep_hours != null || r.sleep_skipped === true;

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
        const read = (cols: string) => admin
          .from('daily_health_snapshot')
          .select(cols)
          .in('user_id', ids.slice(i, i + 200))
          .eq('snapshot_date', date)
          .not('energy', 'is', null);
        let { data, error } = await read('user_id, sleep_hours, sleep_skipped');
        let energyOnly = false;
        if (noSkipColumn(error)) {
          ({ data, error } = await read('user_id'));
          energyOnly = true;
        }
        if (error) continue;
        for (const row of (data ?? []) as unknown as MorningRow[]) {
          if (energyOnly || nightDone(row)) answered.add(`${row.user_id}|${date}`);
        }
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

  // Every enabled reminder, a page at a time: a fixed 2,000 left the rest unread once there were more.
  const PAGE = 1000;
  let rows: Reminder[] = [];
  try {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin
        .from('user_scheduled_reminders')
        .select('id, user_id, kind, label, at_time, days, tz, last_fired_on')
        .eq('enabled', true)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const page = (data ?? []) as Reminder[];
      rows = rows.concat(page);
      if (page.length < PAGE) break;
    }
  } catch (err) {
    console.error('[shape] reminders scan failed (migration not applied?):', err);
    return NextResponse.json({ ok: true, fired: 0, skipped: true });
  }

  // Due now, each for its local day: its weekday, its time reached, and not yet fired that day.
  const now = new Date();
  const due: Array<{ r: Reminder; date: string }> = [];
  for (const r of rows) {
    const date = reminderDueOn(r, localNow(r.tz, now));
    if (date) due.push({ r, date });
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
        data: { channels: { inapp: true, push: true, email: false }, reminderId: r.id, copy: c.copy },
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
