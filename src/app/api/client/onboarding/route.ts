// The member's own first 30 days (client-onboarding review, fix 4: the board's member mode).
//
// GET  → { ok, board } — the board (src/lib/member-onboarding.mjs), or null outside the membership's
//        first 30 days (and for an account with no membership row: a coach or an admin).
// POST { count, startsOn } → { ok, weekOne } — the member's own week-one target, in user_goals kind
//        `member_setup`. Refused while they pay a trainer: the trainer sets it, on their own board.
//
// Every read runs as the member (cookie session or the app's Bearer), so RLS scopes each row to them.
// ⚠ A FAILED READ IS PASSED ON AS `undefined`, which the board shows as "couldn't read", never as a
// step still to do.

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { requireMembership } from '@/lib/require-membership';
import { ACTIVE_SUB } from '@/lib/membership-core';
import { PROVIDERS } from '@/lib/integrations/providers';
import {
  memberOnboardingBoard,
  memberSetupWindow,
  MEMBER_SETUP_DAYS,
  MEMBER_SETUP_KIND,
  MEMBER_WEEK_ONE_MAX,
} from '@/lib/member-onboarding.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAY_MS = 86_400_000;
const ANSWER_KINDS = {
  client_goals: 'goals',
  client_identity: 'identity',
  client_training_prefs: 'training',
  client_nutrition_prefs: 'nutrition',
  client_onboarding: 'onboarding',
  health_profile: 'health',
} as const;
// Music services are not devices: a connected Spotify says nothing about sleep or steps.
const NOT_DEVICES = new Set(['spotify', 'apple_music']);

type Res<T> = { data: T | null; error: unknown };
// A read's rows, or undefined when it failed.
const dataOf = <T,>(r: Res<T>): T | undefined => (r.error ? undefined : (r.data as T));

// When this membership began: the first of its LIVE rows (the statuses computeMembership counts).
// ⚠ NOT THE FIRST ROW EVER (Fable on #2380): rows are one per Stripe subscription, and a cancelled one
// stays, so a member who left in April and came back yesterday read as joined in February and got no
// board, while the coach board ran from the new subscription. undefined when the read failed.
// capped-read-ok: the OLDEST live row is the one asked for: the day this membership began.
async function joinedAtOf(supabase: SupabaseClient, userId: string): Promise<string | null | undefined> {
  const { data, error } = await supabase
    .from('platform_subscriptions')
    .select('created_at')
    .eq('client_id', userId)
    .in('status', [...ACTIVE_SUB])
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) return undefined;
  return ((data ?? []) as Array<{ created_at: string | null }>)[0]?.created_at ?? null;
}

// Every coach of a role they pay, the earliest first, one row per listing (its earliest live
// subscription). ⚠ NOT JUST THE FIRST: a member may pay two trainers (owner, 2026-10-16), and both
// share the week-one target.
type SubRow = { provider_role: string; provider_id: number; created_at: string | null };
function everyOf(rows: SubRow[], role: string): SubRow[] {
  const byListing = new Map<string, SubRow>();
  for (const r of rows) {
    if (r.provider_role !== role) continue;
    const prev = byListing.get(String(r.provider_id));
    if (!prev || String(r.created_at || '') < String(prev.created_at || '')) byListing.set(String(r.provider_id), r);
  }
  return [...byListing.values()].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
}
async function liveSubs(supabase: SupabaseClient, userId: string): Promise<SubRow[] | undefined> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('provider_role, provider_id, created_at')
    .eq('client_id', userId)
    .in('status', ['active', 'trialing']);
  return error ? undefined : ((data ?? []) as SubRow[]);
}

export async function GET(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const joinedAt = await joinedAtOf(supabase, user.id);
  if (joinedAt === undefined) {
    console.error('[client/onboarding] membership read failed');
    return NextResponse.json({ ok: false, error: "Couldn't read your membership." }, { status: 500 });
  }
  const joined = joinedAt ? Date.parse(joinedAt) : NaN;
  const now = Date.now();
  // No row (a coach or an admin), or past the 30 days: there is no board, and nothing else is read.
  if (!Number.isFinite(joined) || joined > now || Math.floor((now - joined) / DAY_MS) + 1 > MEMBER_SETUP_DAYS) {
    return NextResponse.json({ ok: true, board: null });
  }
  const joinedDay = new Date(joined).toISOString().slice(0, 10);

  // capped-read-ok: every ascending read below is bounded below by the join day and asks for the FIRST
  // records since then (the first weigh-in, plan, workout and check-in, and week one's sessions), so
  // the oldest rows inside the 30 days are the ones that decide; a later row past a cap decides nothing.
  const [goalsRes, devRes, weighRes, measRes, planRes, sessRes, checkRes, subs] = await Promise.all([
    supabase.from('user_goals').select('kind, data').eq('user_id', user.id).in('kind', [...Object.keys(ANSWER_KINDS), MEMBER_SETUP_KIND]),
    supabase.from('user_integrations').select('provider').eq('user_id', user.id),
    supabase.from('client_weigh_ins').select('logged_on, weight, unit').eq('user_id', user.id).gte('logged_on', joinedDay).order('logged_on', { ascending: true }).limit(1),
    supabase.from('client_measurements').select('measured_on').eq('user_id', user.id).gte('measured_on', joinedDay).order('measured_on', { ascending: true }).limit(500),
    supabase.from('client_workouts').select('created_at, title, trainer_id').eq('client_id', user.id).eq('status', 'published').gte('created_at', joinedAt).order('created_at', { ascending: true }).limit(1),
    supabase.from('workout_sessions').select('started_at, ended_at, created_at').eq('client_id', user.id).eq('status', 'completed').gte('created_at', joinedAt).order('created_at', { ascending: true }).limit(200),
    supabase.from('client_checkins').select('week_of, created_at').eq('user_id', user.id).gte('created_at', joinedAt).order('created_at', { ascending: true }).limit(10),
    liveSubs(supabase, user.id),
  ]);

  const goalRows = dataOf(goalsRes as Res<Array<{ kind: string; data: unknown }>>);
  let answers: Record<string, unknown> | undefined;
  let setup: unknown;
  if (goalRows) {
    answers = {};
    setup = null;
    for (const r of goalRows) {
      if (r.kind === MEMBER_SETUP_KIND) setup = r.data;
      else if (r.kind in ANSWER_KINDS) answers[ANSWER_KINDS[r.kind as keyof typeof ANSWER_KINDS]] = r.data;
    }
  }
  const devRows = dataOf(devRes as Res<Array<{ provider: string }>>);
  const devices = devRows?.filter((r) => !NOT_DEVICES.has(r.provider))
    .map((r) => (PROVIDERS as Record<string, { label?: string }>)[r.provider]?.label || r.provider);
  const weighRows = dataOf(weighRes as Res<Array<{ logged_on: string; weight: number; unit: string | null }>>);
  const planRows = dataOf(planRes as Res<Array<{ created_at: string; title: string | null; trainer_id: number | null }>>);

  // The coach fork: every trainer and nutritionist they pay, by name; and, for trainers, the target
  // one of them set (client_programs.detail.training.weekOne, shared by every trainer they pay).
  type Coach = { name: string | null; providerId: number; since: string | null };
  let coaching: { training: Coach | null; nutrition: Coach | null; trainers: Coach[]; nutritionists: Coach[] } | undefined;
  let programDetail: unknown;
  if (subs) {
    const trs = everyOf(subs, 'trainer');
    const nus = everyOf(subs, 'nutritionist');
    const [trNames, nuNames, prog] = await Promise.all([
      trs.length ? supabase.from('trainers').select('id, name').in('id', trs.map((r) => r.provider_id)) : null,
      nus.length ? supabase.from('nutritionists').select('id, name').in('id', nus.map((r) => r.provider_id)) : null,
      trs.length ? supabase.from('client_programs').select('detail').eq('user_id', user.id).maybeSingle() : null,
    ]);
    const named = (rows: SubRow[], res: { data: unknown } | null): Coach[] => {
      const names = new Map(((res?.data ?? []) as Array<{ id: number; name: string | null }>).map((r) => [String(r.id), r.name]));
      return rows.map((r) => ({ name: names.get(String(r.provider_id)) ?? null, providerId: r.provider_id, since: r.created_at }));
    };
    const trainers = named(trs, trNames);
    const nutritionists = named(nus, nuNames);
    coaching = { training: trainers[0] ?? null, nutrition: nutritionists[0] ?? null, trainers, nutritionists };
    if (prog) programDetail = prog.error ? undefined : ((prog.data as { detail?: unknown } | null)?.detail ?? null);
  }

  const failed = [
    ['user_goals', goalsRes.error], ['user_integrations', devRes.error], ['client_weigh_ins', weighRes.error],
    ['client_measurements', measRes.error], ['client_workouts', planRes.error], ['workout_sessions', sessRes.error],
    ['client_checkins', checkRes.error], ['subscriptions', subs === undefined],
  ].filter(([, e]) => e).map(([t]) => t);
  if (failed.length) console.error('[client/onboarding] reads failed:', failed.join(', '));

  const board = memberOnboardingBoard({
    joinedAt,
    now,
    answers,
    setup,
    devices,
    weighIn: weighRows === undefined ? undefined : weighRows[0] ? { on: weighRows[0].logged_on, weight: weighRows[0].weight, unit: weighRows[0].unit } : null,
    measurements: dataOf(measRes as Res<Array<{ measured_on: string }>>),
    firstPlan: planRows === undefined ? undefined : planRows[0] ? { at: planRows[0].created_at, title: planRows[0].title, coach: planRows[0].trainer_id != null } : null,
    sessions: dataOf(sessRes as Res<Array<{ started_at: string | null; ended_at: string | null; created_at: string }>>),
    checkins: dataOf(checkRes as Res<Array<{ week_of: string; created_at: string }>>),
    coaching,
    programDetail,
  });
  return NextResponse.json({ ok: true, board });
}

export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { count?: unknown; startsOn?: unknown } | null;
  const count = typeof body?.count === 'number' ? body.count : Number(body?.count);
  if (!Number.isInteger(count) || count < 1 || count > MEMBER_WEEK_ONE_MAX) {
    return NextResponse.json({ ok: false, error: `Enter a whole number from 1 to ${MEMBER_WEEK_ONE_MAX}.` }, { status: 400 });
  }
  const rawStart = body?.startsOn == null || body.startsOn === '' ? null : body.startsOn;
  // A real calendar day: Date.parse rolls 2026-02-30 over to 2 March, so the day must read back the same.
  const startsMs = typeof rawStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawStart) ? Date.parse(rawStart + 'T00:00:00Z') : NaN;
  if (rawStart !== null && (!Number.isFinite(startsMs) || new Date(startsMs).toISOString().slice(0, 10) !== rawStart)) {
    return NextResponse.json({ ok: false, error: 'Week 1 needs a start date.' }, { status: 400 });
  }
  const startsOn = rawStart as string | null;
  const supabase = await clientForRequest(request);

  const joinedAt = await joinedAtOf(supabase, user.id);
  if (joinedAt === undefined) return NextResponse.json({ ok: false, error: "Couldn't read your membership. Try again." }, { status: 500 });
  const win = joinedAt ? memberSetupWindow(joinedAt) : null;
  const joined = joinedAt ? Date.parse(joinedAt) : NaN;
  if (!win || !Number.isFinite(joined) || Math.floor((Date.now() - joined) / DAY_MS) + 1 > MEMBER_SETUP_DAYS) {
    return NextResponse.json({ ok: false, error: 'Your first 30 days are over.' }, { status: 409 });
  }
  // Week one starts inside the board's 30 days, as the coach's target does.
  if (startsOn && (startsOn < win.firstDay || startsOn > win.lastDay)) {
    return NextResponse.json({ ok: false, error: `Week 1 must start in your first 30 days (${win.firstDay} to ${win.lastDay}).` }, { status: 400 });
  }
  // ⚠ A MEMBER WHO PAYS A TRAINER DOES NOT SET IT: their trainer does, and a failed read cannot tell.
  const subs = await liveSubs(supabase, user.id);
  if (subs === undefined) return NextResponse.json({ ok: false, error: "Couldn't check your coaching. Try again." }, { status: 500 });
  if (everyOf(subs, 'trainer').length) {
    return NextResponse.json({ ok: false, error: 'Your coach sets your week-one target.', code: 'coach_sets' }, { status: 409 });
  }

  const weekOne = { count, startsOn, setAt: new Date().toISOString() };
  const { error } = await supabase
    .from('user_goals')
    .upsert({ user_id: user.id, kind: MEMBER_SETUP_KIND, data: { weekOne } }, { onConflict: 'user_id,kind' });
  if (error) {
    console.error('[client/onboarding] save failed', error);
    return NextResponse.json({ ok: false, error: "Couldn't save it. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, weekOne: { count, startsOn } });
}
