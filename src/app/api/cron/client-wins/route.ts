// Client wins, told to their coaches once a day (owner, 2026-11-05: "Client win: a PR, a goal reached,
// a streak milestone … Default on, low priority"). The rules are pure (src/lib/client-wins.mjs); this
// reads the rows they need for every client a coach has now (an open subscription) and writes one
// `client_win` notice per win and coach.
//
// Who hears which: a PR goes to the client's trainers; a streak milestone and a goal reached go to
// every coach on the client. Each notice carries data.dedupe (the win and the client), so a run that
// sees the same win again stores nothing (notifications_dedupe_uidx).
//
// ⚠ LOW PRIORITY: A WIN NEVER PUSHES PAST THE COACH'S DAILY LIMIT. Its push claims a place under the
// cap (claim_push_slots, push-cap.ts); refused, the notice lands in the bell without a push. Quiet
// hours hold a push for the morning at delivery (/api/push/dispatch, /api/cron/push-held), and the
// coach's "Client wins" switch is read before anything is written (preferredNotificationOutcome).
//
// Auth: x-cron-secret: <CRON_SECRET> or Authorization: Bearer <CRON_SECRET>.

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { preferredNotificationOutcome } from '@/lib/notify';
import { claimPushSlots, releasePushClaim, type PushClaim } from '@/lib/push-cap';
import { prWins, streakWin, goalWins, winNotice } from '../../../../lib/client-wins.mjs';
import { OPEN_SUB_STATUSES } from '../../../../lib/coach-trajectory.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const DAY_MS = 86_400_000;
// A day and a bit, so a run a little late or early still sees the day's sets.
const WINDOW_MS = 26 * 60 * 60 * 1000;
const STREAK_DAYS = 400;
const CHUNK = 100;
const PAGE = 1000;
const PRIOR_SET_CAP = 5000;
const DAILY_CAP = 4;
const TIME_BUDGET_MS = 100_000;

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && timingSafeEqual(x, y);
}
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return false;
  return safeEqual(request.headers.get('x-cron-secret') || '', secret)
    || safeEqual(request.headers.get('authorization') || '', `Bearer ${secret}`);
}
function chunks<T>(xs: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

type Admin = ReturnType<typeof createAdminClient>;
type Coach = { userId: string; role: 'trainer' | 'nutritionist' };
type Win = { kind: string; dedupe: string } & Record<string, unknown>;

// Every client with an open coach subscription, and their coaches (one entry per person and role).
async function coachesByClient(admin: Admin): Promise<Map<string, Coach[]>> {
  const subs: { client_id: string; provider_role: string; provider_id: number }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin.from('subscriptions').select('client_id, provider_role, provider_id')
      .in('status', OPEN_SUB_STATUSES).not('client_id', 'is', null)
      .order('client_id').order('provider_role').order('provider_id').range(from, from + PAGE - 1);
    if (error) throw new Error('subscriptions: ' + error.message);
    subs.push(...((data ?? []) as typeof subs));
    if (!data || data.length < PAGE) break;
  }
  const owners = new Map<string, string>();
  for (const role of ['trainer', 'nutritionist'] as const) {
    const ids = [...new Set(subs.filter((s) => s.provider_role === role).map((s) => Number(s.provider_id)).filter(Number.isFinite))];
    for (const c of chunks(ids)) {
      const { data, error } = await admin.from(role === 'trainer' ? 'trainers' : 'nutritionists').select('id, owner_id').in('id', c);
      if (error) throw new Error(role + 's: ' + error.message);
      for (const p of (data ?? []) as { id: number; owner_id: string | null }[]) if (p.owner_id) owners.set(`${role}:${p.id}`, p.owner_id);
    }
  }
  const out = new Map<string, Coach[]>();
  for (const s of subs) {
    const role = s.provider_role === 'trainer' || s.provider_role === 'nutritionist' ? s.provider_role : null;
    const userId = role ? owners.get(`${role}:${s.provider_id}`) : null;
    if (!role || !userId || userId === s.client_id) continue;
    const list = out.get(s.client_id) ?? [];
    if (!list.some((c) => c.userId === userId && c.role === role)) list.push({ userId, role });
    out.set(s.client_id, list);
  }
  return out;
}

// The wins of one batch of clients.
async function winsFor(admin: Admin, clientIds: string[], now: Date): Promise<Map<string, Win[]>> {
  const since = new Date(now.getTime() - WINDOW_MS).toISOString();
  const today = now.toISOString().slice(0, 10);
  const sinceDay = new Date(now.getTime() - DAY_MS).toISOString().slice(0, 10);
  const wins = new Map<string, Win[]>();
  const add = (id: string, w: Win[]) => { if (w.length) wins.set(id, [...(wins.get(id) ?? []), ...w]); };

  // PRs: the window's sets, then every earlier set of those moves.
  const { data: recent, error: recentErr } = await admin.from('workout_set_logs')
    .select('client_id, move_name, actual_load, load_unit, payload, completed, created_at')
    .in('client_id', clientIds).gte('created_at', since).limit(PAGE * 5);
  if (recentErr) console.warn('[client-wins] recent sets unreadable:', recentErr.message);
  const recentBy = new Map<string, Record<string, unknown>[]>();
  for (const r of (recent ?? []) as Record<string, unknown>[]) {
    const id = String(r.client_id);
    recentBy.set(id, [...(recentBy.get(id) ?? []), r]);
  }
  for (const [id, rows] of recentBy) {
    const moves = [...new Set(rows.map((r) => String(r.move_name || '').trim()).filter(Boolean))].slice(0, 60);
    if (!moves.length) continue;
    const { data: prior, error } = await admin.from('workout_set_logs')
      .select('move_name, actual_load, load_unit, payload, completed, created_at')
      .eq('client_id', id).in('move_name', moves).lt('created_at', since)
      .order('created_at', { ascending: false }).limit(PRIOR_SET_CAP);
    if (error) { console.warn('[client-wins] earlier sets unreadable:', error.message); continue; }
    add(id, prWins(rows, prior ?? []) as Win[]);
  }

  // Streaks: the days with a completed workout, on the coach's definition (UTC days).
  const streakSince = new Date(now.getTime() - STREAK_DAYS * DAY_MS).toISOString();
  const { data: sessions, error: sessErr } = await admin.from('workout_sessions')
    .select('client_id, started_at, ended_at, created_at')
    .in('client_id', clientIds).eq('status', 'completed').gte('created_at', streakSince).limit(PAGE * 20);
  if (sessErr) console.warn('[client-wins] sessions unreadable:', sessErr.message);
  const days = new Map<string, Set<string>>();
  for (const s of (sessions ?? []) as Record<string, unknown>[]) {
    const at = Date.parse(String(s.started_at || s.ended_at || s.created_at || ''));
    if (!Number.isFinite(at)) continue;
    const id = String(s.client_id);
    if (!days.has(id)) days.set(id, new Set());
    days.get(id)!.add(new Date(at).toISOString().slice(0, 10));
  }
  for (const [id, set] of days) {
    const w = streakWin([...set], today);
    if (w) add(id, [w as Win]);
  }

  // Goals: the coach-set goals' newest readings.
  const { data: programs, error: progErr } = await admin.from('client_programs').select('user_id, detail').in('user_id', clientIds);
  if (progErr) console.warn('[client-wins] goals unreadable:', progErr.message);
  for (const p of (programs ?? []) as { user_id: string; detail?: { goals?: unknown } | null }[]) {
    add(String(p.user_id), goalWins(p.detail?.goals, sinceDay) as Win[]);
  }
  return wins;
}

async function run(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  const started = Date.now();
  const now = new Date();
  const admin = createAdminClient();
  let sent = 0;
  let failed = 0;
  let unsent = 0;
  try {
    const coaches = await coachesByClient(admin);
    const clientIds = [...coaches.keys()];
    const capOf = new Map<string, { cap: number; tz: string }>();
    for (const batch of chunks(clientIds)) {
      if (Date.now() - started > TIME_BUDGET_MS) { unsent += batch.length; continue; }
      const wins = await winsFor(admin, batch, now);
      if (!wins.size) continue;
      const ids = [...wins.keys()];
      const { data: names } = await admin.from('profiles').select('id, full_name').in('id', ids);
      const nameOf = new Map(((names ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, String(p.full_name || '').trim()]));
      const people = [...new Set(ids.flatMap((id) => (coaches.get(id) ?? []).map((c) => c.userId)))].filter((u) => !capOf.has(u));
      if (people.length) {
        const [settings, profiles] = await Promise.all([
          admin.from('notification_settings').select('user_id, tz, daily_cap').in('user_id', people),
          admin.from('client_profiles').select('user_id, timezone').in('user_id', people),
        ]);
        const zone = new Map(((profiles.data ?? []) as { user_id: string; timezone: string | null }[]).map((p) => [p.user_id, p.timezone || '']));
        for (const u of people) capOf.set(u, { cap: DAILY_CAP, tz: zone.get(u) || 'UTC' });
        for (const s of (settings.data ?? []) as { user_id: string; tz: string | null; daily_cap: number | null }[]) {
          const cur = capOf.get(s.user_id)!;
          capOf.set(s.user_id, { cap: typeof s.daily_cap === 'number' && Number.isFinite(s.daily_cap) ? s.daily_cap : DAILY_CAP, tz: zone.get(s.user_id) || s.tz || cur.tz });
        }
      }
      for (const [clientId, list] of wins) {
        for (const win of list) {
          const notice = winNotice(win, nameOf.get(clientId) || null);
          if (!notice) continue;
          for (const coach of coaches.get(clientId) ?? []) {
            if (win.kind === 'pr' && coach.role !== 'trainer') continue;
            let claim: PushClaim | null = null;
            const cap = capOf.get(coach.userId) ?? { cap: DAILY_CAP, tz: 'UTC' };
            try {
              const outcome = await preferredNotificationOutcome(admin, {
                userId: coach.userId,
                type: 'client_win',
                title: notice.title,
                body: notice.body,
                route: 'client',
                claimPush: async () => {
                  claim = await claimPushSlots(admin, coach.userId, { tz: cap.tz, cap: cap.cap, want: 1 });
                  return !claim || claim.granted >= 1;
                },
                data: { dedupe: `${win.dedupe}:${clientId}`, clientId, providerRole: coach.role, win: win.kind },
              }, notice.copy);
              if (outcome === 'stored') sent += 1;
              else if (outcome === 'failed') failed += 1;
            } catch (err) {
              failed += 1;
              console.error('[client-wins] notice failed:', err instanceof Error ? err.message : err);
            } finally {
              await releasePushClaim(admin, claim);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[client-wins] run failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, sent, failed, error: 'Could not read the clients.' }, { status: 500 });
  }
  if (unsent) console.warn('[client-wins] ran out of time; clients left for tomorrow:', unsent);
  return NextResponse.json({ ok: true, sent, failed, unsent });
}

export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }
