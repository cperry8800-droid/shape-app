// Shape Score · daily accountability evaluator (Momentum/Accountability — Phase C).
//
// The AUTHORITATIVE server-side evaluator: it fires even when a user ghosts (stops
// opening the app). For each active member it applies past-grace penalties for missed
// committed obligations (via apply_obligation_penalty), credits kept coach sessions
// (award_session_kept), and sends ONE gentle, never-shaming heads-up summarizing any
// dip. All point math + every fairness guard (recency / pause / −30 weekly cap / 0
// balance floor / idempotency) lives in the SECURITY DEFINER RPCs — this route only
// enumerates candidate obligations and calls them. No-op until the migration is applied.
//
// Auth: header `x-cron-secret: <CRON_SECRET>` OR Vercel Cron's `Authorization: Bearer
// <CRON_SECRET>`. Runs as the service role (acts for many users); every read/write is
// explicitly user-scoped. Fail-open per user so one bad user never aborts the batch.

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notify';
import { listOf, np, phrase } from '../../../../../mobile-app/src/services/noticeCopy.mjs';
import { ACTIVE_SUB } from '@/lib/membership-core';
import { dailyCheckinOn } from '@/lib/ai/notifications.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // daily batch of per-user RPC round-trips

// One page of members per run. Small userbase today; when it grows, paginate across
// runs with a stored cursor (the RPCs are idempotent, so overlap is harmless).
const BATCH = 500;

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

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

type PenaltyResult = { applied?: boolean; amount?: number } | null;
type AwardResult = { awarded?: boolean } | null;

async function run(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const admin = createAdminClient();

  // Store-credit reservations (H5, #2285) are released by checkout.session.expired, or by this
  // sweep after 48 hours when that event never arrived. Before this ran on a clock, the only
  // other caller was the same member's next checkout, so an abandoned reservation stayed
  // deducted from the wallet for good (Codex, #2285). Best-effort: a failed sweep is logged
  // and the run goes on.
  let swept = 0;
  const { data: sweptCount, error: sweepErr } = await admin.rpc('sweep_store_credit_reservations', { p_user_id: null, p_older_than: '48 hours' });
  if (sweepErr) console.error('[cron] store credit reservation sweep failed', sweepErr.message);
  else swept = Number(sweptCount ?? 0) || 0;

  // Active members to evaluate (clients carry the obligations; coaches/admins don't).
  const { data: subs, error } = await admin
    .from('platform_subscriptions')
    .select('client_id, status')
    .in('status', Array.from(ACTIVE_SUB))
    .limit(BATCH);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = new Date();
  const today = isoDate(now);
  const yest = new Date(now);
  yest.setUTCDate(yest.getUTCDate() - 1);
  const yesterday = isoDate(yest);
  // Last fully-completed ISO week's Monday (this Monday − 7).
  const dow = (now.getUTCDay() + 6) % 7; // 0 = Monday
  const thisMon = new Date(now);
  thisMon.setUTCHours(0, 0, 0, 0);
  thisMon.setUTCDate(thisMon.getUTCDate() - dow);
  const lastMon = new Date(thisMon);
  lastMon.setUTCDate(lastMon.getUTCDate() - 7);
  const lastMonday = isoDate(lastMon);
  // Narrow scan window for per-day obligations (the RPC's recency bound is 14d; this
  // just limits how many candidate rows we hand it). 3 days covers a daily cron + slack.
  const recent = new Date(now);
  recent.setUTCDate(recent.getUTCDate() - 3);
  const recentDate = isoDate(recent);
  // Kept-session reward scans a wider window (matches award_session_kept's 21-day bound)
  // so a session marked complete a few days late still earns its +12.
  const sessionFloor = new Date(now);
  sessionFloor.setUTCDate(sessionFloor.getUTCDate() - 21);

  const clientIds = Array.from(
    new Set((subs || []).map((s) => (s as { client_id?: string }).client_id).filter(Boolean) as string[]),
  );

  let evaluated = 0;
  let penalties = 0;
  let rewards = 0;
  let commitments = 0;

  // The candidate reads are BATCHED per chunk of clients (audit PERF-2: the old
  // shape ran 3 SELECTs PER CLIENT — ~3N round-trips). One chunked `.in()` query
  // per table, grouped in memory, then the per-user RPC loop drives off the
  // groups. A full-page result (ROWS_MAX) is treated as possible PostgREST
  // truncation → the chunk is SKIPPED, never partially scored; every RPC is
  // idempotent, so the next daily run simply retries the chunk.
  const CHUNK = 50;
  const ROWS_MAX = 1000; // PostgREST db-max-rows default — the truncation tripwire
  const groupBy = <T,>(rows: T[], key: (r: T) => string): Map<string, T[]> => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const k = key(r);
      const arr = m.get(k);
      if (arr) arr.push(r);
      else m.set(k, [r]);
    }
    return m;
  };

  for (let at = 0; at < clientIds.length; at += CHUNK) {
    const ids = clientIds.slice(at, at + CHUNK);

    type SessRow = { id: string; client_id: string };
    type WoRow = { id: string; client_id: string; scheduled_date: string };
    type HabitRow = { id: string; user_id: string };
    type SettingsRow = { user_id: string; updated_at?: string | null; data: { dailyCheckin?: unknown; dailyCheckinSince?: unknown } | null };
    let sessBy: Map<string, SessRow[]>;
    let wosBy: Map<string, WoRow[]>;
    let habitsBy: Map<string, HabitRow[]>;
    let checkinOff: Set<string>;
    try {
      const [sessRes, wosRes, habitsRes, settingsRes] = await Promise.all([
        // (1) Kept sessions → +12. There is NO session PENALTY: a session's only
        // "kept" signal is the coach marking it 'completed', so a lingering
        // 'confirmed' is coach bookkeeping, not a client miss — penalizing it
        // would be a false debit.
        admin
          .from('sessions')
          .select('id, client_id')
          .in('client_id', ids)
          .eq('status', 'completed')
          .gte('scheduled_at', sessionFloor.toISOString())
          .limit(ROWS_MAX),
        // (2) Assigned workouts (published, day past) in the recent window.
        admin
          .from('client_workouts')
          .select('id, client_id, scheduled_date')
          .in('client_id', ids)
          .eq('status', 'published')
          .gte('scheduled_date', recentDate)
          .lt('scheduled_date', today)
          .limit(ROWS_MAX),
        // (4) Active daily DO-habits.
        admin
          .from('user_habits')
          .select('id, user_id')
          .in('user_id', ids)
          .eq('type', 'do')
          .eq('cadence', 'daily')
          .is('archived_at', null)
          .limit(ROWS_MAX),
        // (3) Who turned Check-ins off. ⚠ NO −7 FOR A WEEKLY CHECK-IN THE MEMBER
        // TURNED OFF (owner ruling, 2026-10-18): the switch hides every prompt that
        // would have reminded them, so charging for the miss is a penalty for using a
        // setting. Read the way the notification routes read it — dailyCheckinOn, so
        // a missing settings doc or key is ON — and a failed read skips the chunk
        // like the three above, rather than charging a member who may be off.
        admin
          .from('user_goals')
          .select('user_id, data, updated_at')
          .in('user_id', ids)
          .eq('kind', 'client_settings')
          .limit(ROWS_MAX),
      ]);
      // Supabase queries RESOLVE with `.error` set rather than throwing — an
      // unchecked failure would group `data || []` and silently part-score the
      // chunk (rewards/penalties missing while check-ins still apply). A read
      // error OR a full page (possible silent truncation at the row cap) skips
      // the whole chunk instead; the idempotent RPCs retry it next run.
      if (sessRes.error || wosRes.error || habitsRes.error || settingsRes.error) {
        console.error('[score-accountability] chunk read failed — skipping chunk:',
          sessRes.error || wosRes.error || habitsRes.error || settingsRes.error);
        continue;
      }
      if ([sessRes, wosRes, habitsRes, settingsRes].some((r) => (r.data || []).length >= ROWS_MAX)) {
        console.error(`[score-accountability] chunk hit the ${ROWS_MAX}-row page bound (possible truncation) — skipping chunk`);
        continue;
      }
      sessBy = groupBy((sessRes.data || []) as SessRow[], (r) => r.client_id);
      wosBy = groupBy((wosRes.data || []) as WoRow[], (r) => r.client_id);
      habitsBy = groupBy((habitsRes.data || []) as HabitRow[], (r) => r.user_id);
      // ⚠ LAST WEEK IS JUDGED BY THE SWITCH AS IT STOOD WHEN THE WEEK ENDED (Codex P2 on #2398).
      // This job retries last week's penalty every day, so the switch as it is now would charge
      // a week the member had off as soon as they turned it back on. The Settings writer stamps
      // `dailyCheckinSince` on every change, and a change since the week ended means the week is
      // not charged, so turning it back on charges from the next completed week. A missing stamp
      // (a change from before this) reads the value as long-standing. The one leniency: a member
      // who turns it off between the week's end and this job's first run skips that one week.
      // ⚠ THE WEEK ENDS AT THE MEMBER'S LOCAL MONDAY, which can be up to 14 hours before Monday
      // 00:00 UTC (week_of is the local Monday). A member at UTC+9 who turns it on at 08:00 on
      // their Monday did so after their week ended, though before Monday in UTC. So the earliest
      // a week can end is the line, leaning, like the rest of this, toward not charging.
      const weekEnd = thisMon.getTime() - 14 * 3600_000;
      checkinOff = new Set(((settingsRes.data || []) as SettingsRow[])
        .filter((r) => {
          const d = r.data && typeof r.data === 'object' ? r.data : {};
          const stamped = typeof d.dailyCheckinSince === 'string' ? Date.parse(d.dailyCheckinSince) : NaN;
          // The stamp is the member's device clock; the row's updated_at is the database's (a
          // trigger sets it on every write), and the switch cannot have changed after the write
          // that carried it. So a clock set ahead never exempts the weeks after it was switched
          // back on (Codex P2 on #2398). A clock set behind still dates the change early.
          const wrote = typeof r.updated_at === 'string' ? Date.parse(r.updated_at) : NaN;
          const since = Number.isFinite(stamped) && Number.isFinite(wrote) ? Math.min(stamped, wrote) : stamped;
          return !dailyCheckinOn(d.dailyCheckin) || (Number.isFinite(since) && since >= weekEnd);
        })
        .map((r) => r.user_id));
    } catch (e) {
      // Fail-open per chunk — a bad batch read can't abort the whole run.
      console.error('[score-accountability] chunk read threw — skipping chunk:', e);
      continue;
    }

    for (const uid of ids) {
      try {
        evaluated += 1;
        const dipped: string[] = [];
        // The same reasons by their kind, for the copy the bell and the push say (noticeCopy.mjs).
        const dippedKinds: string[] = [];
        let dipTotal = 0;

        const penalize = async (kind: string, refId: string | null, day: string, label: string) => {
          const { data } = await admin.rpc('apply_obligation_penalty', {
            p_uid: uid,
            p_kind: kind,
            p_ref_id: refId,
            p_day: day,
          });
          const r = data as PenaltyResult;
          if (r?.applied) {
            penalties += 1;
            dipTotal += Number(r.amount || 0);
            dipped.push(label);
            dippedKinds.push(kind);
          }
        };

        // (1) Kept sessions → +12 (batched read above; per-row RPC guards unchanged).
        for (const s of sessBy.get(uid) || []) {
          const { data } = await admin.rpc('award_session_kept', { p_uid: uid, p_session_id: s.id });
          if ((data as AwardResult)?.awarded) rewards += 1;
        }

        // (2) Skipped assigned workouts (published, day past) in the recent window.
        for (const w of wosBy.get(uid) || []) {
          await penalize('workout', w.id, w.scheduled_date, 'a skipped workout');
        }

        // (3) Missed weekly check-in for the just-completed ISO week — unless the
        // member has Check-ins switched off (see the settings read above).
        if (!checkinOff.has(uid)) await penalize('checkin', null, lastMonday, "last week's check-in");

        // (4) Broken streaks on active daily DO-habits (penalty day = yesterday).
        for (const h of habitsBy.get(uid) || []) {
          await penalize('habit', h.id, yesterday, 'a broken habit streak');
        }

        // (5) Settle last week's commitment (voluntary stake — separate from penalties).
        {
          const { data } = await admin.rpc('settle_commitment', { p_user: uid, p_week: lastMonday });
          const s = data as { settled?: boolean; met?: boolean; amount?: number } | null;
          if (s?.settled) {
            commitments += 1;
            await createNotification(admin, {
              userId: uid,
              type: 'score_commitment',
              title: s.met ? 'Commitment kept 💪' : 'Commitment came up short',
              body: s.met
                ? `You hit your weekly commitment — +${Math.abs(s.amount || 0)} pts. Set the next one.`
                : "Last week's commitment didn't land. No worries — set a fresh one and earn it back.",
              route: 'score',
              data: {
                commitment: true, met: !!s.met, amount: s.amount,
                copy: s.met
                  ? { title: np('score.kept.title'), body: np('score.kept.body', { points: Math.abs(s.amount || 0) }) }
                  : { title: np('score.short.title'), body: np('score.short.body') },
              },
            });
          }
        }

        // One gentle, never-shaming heads-up when something actually dipped.
        if (dipped.length) {
          const reasons =
            dipped.length === 1
              ? dipped[0]
              : `${dipped.slice(0, -1).join(', ')} and ${dipped[dipped.length - 1]}`;
          await createNotification(admin, {
            userId: uid,
            type: 'score_accountability',
            title: 'Your Shape Score dipped a little',
            body: `${Math.abs(dipTotal)} pts came off for ${reasons}. No worries — jump back in and you'll earn it right back.`,
            route: 'score',
            data: {
              accountability: true, total: dipTotal,
              copy: { title: np('score.dip.title'), body: np('score.dip.body', { points: Math.abs(dipTotal), reasons: listOf(dippedKinds.map((k) => phrase('score.reason.' + k))) }) },
            },
          });
        }
      } catch {
        // Fail-open per user — a single bad user can't abort the batch.
        continue;
    }
    }
  }

  return NextResponse.json({ ok: true, evaluated, penalties, rewards, commitments, swept });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
