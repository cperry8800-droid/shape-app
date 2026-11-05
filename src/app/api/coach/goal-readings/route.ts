// What the coach's Goal page needs to project each goal's pace (public/newdesign/coachGoals.js) that
// the analytics route doesn't already send (GET /api/coach/goal-readings?role=trainer|nutritionist
// [&provider_id=]):
//
//   adherence  the weekly readings of the figure the "adherence" goal binds to (trainers: session
//              adherence; nutritionists: protein adherence). Nothing else keeps a history of it, so
//              the analytics routes record one a week as they compute it (coach_goal_readings,
//              supabase-migrations/2026-11-05-coach-goal-readings.sql): [{ on, value }], oldest
//              first, or null when they can't be read (the migration not run yet, a failed read).
//   programs   the days the coach's programs (a nutritionist's meal plans) were first published,
//              for "Publish 2 new programs" (coach_plans.published_at,
//              supabase-migrations/2026-11-05-coach-plans-published-at.sql). Before that migration
//              runs, the days they were created stand in, and `source` says so ('created_at'). null
//              when they can't be read.
//
// Active clients and net a month need nothing here: their weekly series is the trajectory the
// analytics route already sends. Read with the caller's own session (the website's cookie or the
// app's Bearer token); both tables' policies let a coach read only their own rows.
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientForRequest, userLookupForRequest } from '@/lib/request-auth';
import { isMeasuredSignedOut } from '@/lib/auth-lookup';
import { readAllById, ROW_PAGE } from '@/lib/read-all-by-id';

export const dynamic = 'force-dynamic';

const DAY_MS = 86400000;
// Two years of weeks, as the readings are kept.
const READINGS_DAYS = 731;

type Reading = { on: string; value: number };
type Programs = { kind: 'program' | 'meal_plan'; published: string[]; source: 'published_at' | 'created_at' };

async function adherenceReadings(supabase: SupabaseClient, role: string, providerId: number): Promise<Reading[] | null> {
  const since = new Date(Date.now() - READINGS_DAYS * DAY_MS).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('coach_goal_readings')
    .select('week_of, on_day, value')
    .eq('provider_role', role)
    .eq('provider_id', providerId)
    .eq('metric', 'adherencePct')
    .gte('week_of', since)
    .order('week_of', { ascending: true });
  if (error) {
    console.warn('[coach/goal-readings] adherence readings unread:', error.message);
    return null;
  }
  return ((data ?? []) as Array<{ on_day?: string; week_of?: string; value?: unknown }>)
    .map((r) => ({ on: String(r.on_day || r.week_of || ''), value: Number(r.value) }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.on) && Number.isFinite(r.value));
}

// A column the database doesn't have yet: PostgreSQL's undefined_column, or PostgREST naming it.
function missingPublishedAt(error: { message?: string; code?: string } | null): boolean {
  return !!error && (error.code === '42703' || error.code === 'PGRST204' || /published_at/.test(String(error.message || '')));
}

async function publishedDays(supabase: SupabaseClient, ownerId: string, kind: Programs['kind']): Promise<Programs | null> {
  const read = (cols: string) => readAllById<{ id: string; published_at?: string | null; created_at?: string | null }>((after) => {
    let q = supabase.from('coach_plans').select(cols).eq('owner_id', ownerId).eq('kind', kind).eq('published', true);
    if (after) q = q.gt('id', after);
    // capped-read-ok: one page of a cursor walk over every row (readAllById), not a cap.
    return q.order('id', { ascending: true }).limit(ROW_PAGE);
  });
  let source: Programs['source'] = 'published_at';
  let res = await read('id, published_at, created_at');
  if (res.error && missingPublishedAt(res.error as { message?: string; code?: string })) {
    source = 'created_at';
    res = await read('id, created_at');
  }
  if (res.error) {
    console.warn('[coach/goal-readings] published programs unread:', res.error.message);
    return null;
  }
  const published = (res.data ?? [])
    .map((r) => String((source === 'published_at' ? r.published_at || r.created_at : r.created_at) || '').slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  return { kind, published, source };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const role = (url.searchParams.get('role') || '').toLowerCase();
  if (role !== 'trainer' && role !== 'nutritionist') {
    return NextResponse.json({ error: 'role=trainer|nutritionist required.' }, { status: 400 });
  }
  const supabase = await clientForRequest(req);
  const { user, error: authErr } = await userLookupForRequest(req);
  if (!user) {
    // An auth outage is not a signed-out viewer (src/lib/auth-lookup.ts): 503, the unread state.
    if (!isMeasuredSignedOut(authErr)) {
      console.warn('[coach/goal-readings] the sign-in check failed — answering 503, not 401:', authErr?.message);
      return NextResponse.json({ error: 'Could not check your sign-in just now.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  // The caller's listing of this role, as /api/coach/score picks it.
  const providerTable = role === 'trainer' ? 'trainers' : 'nutritionists';
  const { data: listings, error: listErr } = await supabase
    .from(providerTable)
    .select('id')
    .eq('owner_id', user.id)
    .order('id', { ascending: true });
  if (listErr) {
    console.warn(`[coach/goal-readings] the ${providerTable} read failed — answering 503, not 404:`, listErr.message);
    return NextResponse.json({ error: 'Could not read your listing just now.' }, { status: 503 });
  }
  const owned = (listings ?? []) as Array<{ id: number }>;
  if (!owned.length) return NextResponse.json({ error: 'No provider profile found.' }, { status: 404 });
  const wanted = Number(url.searchParams.get('provider_id'));
  const providerId = (owned.find((p) => p.id === wanted) ?? owned[0]).id;

  const [adherence, programs] = await Promise.all([
    adherenceReadings(supabase, role, providerId).catch(() => null),
    publishedDays(supabase, user.id, role === 'trainer' ? 'program' : 'meal_plan').catch(() => null),
  ]);
  return NextResponse.json({ role, providerId, adherence, programs });
}
