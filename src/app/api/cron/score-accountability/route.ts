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
import { ACTIVE_SUB } from '@/lib/membership-core';

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

  for (const uid of clientIds) {
    try {
      evaluated += 1;
      const dipped: string[] = [];
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
        }
      };

      // (1) Kept sessions → +12. There is NO session PENALTY: a session's only "kept"
      // signal is the coach marking it 'completed', so a lingering 'confirmed' is coach
      // bookkeeping, not a client miss — penalizing it would be a false debit.
      const { data: sess } = await admin
        .from('sessions')
        .select('id')
        .eq('client_id', uid)
        .eq('status', 'completed')
        .gte('scheduled_at', sessionFloor.toISOString());
      for (const s of (sess || []) as Array<{ id: string }>) {
        const { data } = await admin.rpc('award_session_kept', { p_uid: uid, p_session_id: s.id });
        if ((data as AwardResult)?.awarded) rewards += 1;
      }

      // (2) Skipped assigned workouts (published, day past) in the recent window.
      const { data: wos } = await admin
        .from('client_workouts')
        .select('id, scheduled_date')
        .eq('client_id', uid)
        .eq('status', 'published')
        .gte('scheduled_date', recentDate)
        .lt('scheduled_date', today);
      for (const w of (wos || []) as Array<{ id: string; scheduled_date: string }>) {
        await penalize('workout', w.id, w.scheduled_date, 'a skipped workout');
      }

      // (3) Missed weekly check-in for the just-completed ISO week.
      await penalize('checkin', null, lastMonday, "last week's check-in");

      // (4) Broken streaks on active daily DO-habits (penalty day = yesterday).
      const { data: habits } = await admin
        .from('user_habits')
        .select('id')
        .eq('user_id', uid)
        .eq('type', 'do')
        .eq('cadence', 'daily')
        .is('archived_at', null);
      for (const h of (habits || []) as Array<{ id: string }>) {
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
            data: { commitment: true, met: !!s.met, amount: s.amount },
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
          data: { accountability: true, total: dipTotal },
        });
      }
    } catch {
      // Fail-open per user — a single bad user can't abort the batch.
      continue;
    }
  }

  return NextResponse.json({ ok: true, evaluated, penalties, rewards, commitments });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
