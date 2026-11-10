// The exercises the member's trainers pushed from the Live console ("+ Add to today's session"), on
// the member's own days. The app's Train week shows each day's (BSCoachExercises.jsx).
//
// ⚠ BEFORE 2026-11-10 NOTHING READ THEM. The console saved each exercise as a coach_pushed_items row
// of kind 'exercise' and the member got a "New exercise from your coach" notice that opened Train, but
// the app fetched those rows into Home's coach feed and drew only the banners, so the exercise showed
// nowhere. This is the read, as /api/client/nutrition reads the nutritionist's meals.
//
// GET → { ok: true, today, days: { 'YYYY-MM-DD': Exercise[] } }: every one of the member's last
//       EXERCISE_DAYS days is present, oldest first, and an empty list is a day with none. Each
//       exercise is { id, providerId, coachName, name, sets, reps, tempo, cue, sentAt, day }, oldest
//       first; a coach whose listing could not be read has coachName null.
//       500 { ok: false } when the subscriptions or the exercises could not be read: unread, never
//       "your trainer added nothing".
//
// Only trainers the member pays now (an open subscription): an exercise a former trainer pushed is not
// theirs to follow, as Home's notes are (bsHomePaidBanners). RLS scopes every row to the member
// (coach_pushed_items_client_read: client_id = auth.uid()::text).

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { requireAccount } from '@/lib/require-membership';
import { normalizeZone } from '@/lib/time';
import { EXERCISE_DAYS, exerciseReadSince, memberDays, pushedExerciseOf, type PushedExercise } from '@/lib/coach-exercises';
import { OPEN_SUB_STATUSES } from '../../../../lib/coach-trajectory.mjs';

export const dynamic = 'force-dynamic';

// A week of a trainer's pushes is a few dozen rows; the cap only bounds a runaway.
const ROW_CAP = 500;

// Free with the account (owner, 2026-11-10: hiring and following a coach is free; the membership adds
// Nora, Radio, the AI helpers and the Store), as /api/client/train and /api/client/plan are.
export async function GET(request: Request) {
  const denied = await requireAccount(request);
  if (denied) return denied;
  const supabase = await clientForRequest(request);
  const user = await currentUser(request);

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const now = Date.now();
  const [tzRes, subRes, itemRes] = await Promise.all([
    supabase.from('client_profiles').select('timezone').eq('user_id', user.id).maybeSingle(),
    supabase
      .from('subscriptions')
      .select('provider_id')
      .eq('client_id', user.id)
      .eq('provider_role', 'trainer')
      .in('status', OPEN_SUB_STATUSES),
    supabase
      .from('coach_pushed_items')
      .select('id, kind, provider_id, payload, sent_at')
      .eq('client_id', user.id)
      .eq('provider_role', 'trainer')
      .eq('kind', 'exercise')
      .is('removed_at', null)
      .gte('sent_at', exerciseReadSince(now, EXERCISE_DAYS))
      // Newest first, so a cap keeps the days the member is looking at.
      .order('sent_at', { ascending: false })
      .limit(ROW_CAP),
  ]);

  if (subRes.error || itemRes.error) {
    console.warn('[shape-app] client coach-exercises: a read failed — the exercises render as unread:', (subRes.error || itemRes.error)?.message);
    return NextResponse.json({ ok: false, error: 'Could not load your coach’s exercises.' }, { status: 500 });
  }

  // The member's days in their zone; a zone that could not be read counts in UTC, as a missing one does.
  if (tzRes.error) console.warn('[shape-app] client coach-exercises: the zone read failed — days count in UTC:', tzRes.error.message);
  const zone = normalizeZone(tzRes.data?.timezone);
  const dates = memberDays(now, zone, EXERCISE_DAYS);
  const days: Record<string, Array<PushedExercise & { coachName: string | null }>> = Object.fromEntries(dates.map((d) => [d, []]));

  const paid = new Set((subRes.data ?? []).map((r) => String(r.provider_id)));
  const exercises = (itemRes.data ?? [])
    .map((r) => pushedExerciseOf(r, zone))
    .filter((e): e is PushedExercise => !!e && paid.has(e.providerId) && e.day in days)
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt));

  // The coaches' names, from their public listings. A failed read leaves the byline to the role.
  const ids = [...new Set(exercises.map((e) => e.providerId))];
  const nameOf = new Map<string, string | null>();
  if (ids.length) {
    const { data: trainerRows, error } = await supabase.from('trainers').select('id, name').in('id', ids);
    if (error) console.warn('[shape-app] client coach-exercises: trainer names read failed — bylines read "Your trainer":', error.message);
    for (const r of trainerRows ?? []) nameOf.set(String(r.id), typeof r.name === 'string' && r.name.trim() ? r.name.trim() : null);
  }
  for (const e of exercises) days[e.day].push({ ...e, coachName: nameOf.get(e.providerId) ?? null });

  return NextResponse.json({ ok: true, today: dates[dates.length - 1], days });
}
