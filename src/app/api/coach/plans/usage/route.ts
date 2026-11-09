// Which of this coach's library plans a client is on — the workout library's "In use" filter and
// each card's "who's on it", and with ?role=nutritionist the meal library's. Read-only and
// owner-scoped: the rows counted are the ones THIS coach's own trainer or nutritionist rows
// published, read with the coach's own client under RLS. Only a coach sees who is on what (owner,
// 2026-11-09): each coach their own clients on their own plans.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ⚠ A CAP, AND IT IS REPORTED. A row here is two ids, and a full practice has a few
// thousand upcoming sessions at most — but past the cap the answer can only UNDER-count,
// so `capped` goes back with it and the page may then say "in use", never "not in use".
const USAGE_CAP = 5000;

// ⚠ PRIVATE, NEVER CACHED: the answer names the coach's clients (`clientIds`, step 6a), so it
// is answered as the roster routes are (src/lib/coach-roster.ts, #2630).
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

type UsageRow = { client_id?: unknown; template_id?: unknown };

// Clients, not rows: one client with twelve weeks of a program is one client on it.
// fromEntries defines OWN properties, so a template id can never reach a prototype.
// `clientIds` say WHO (the library's "who's on it", matched to the coach's own roster by id):
// the ids this read already holds, the coach's own clients under RLS.
function usageOf(list: UsageRow[]) {
  const byTemplate = new Map<string, Set<string>>();
  for (const row of list) {
    const templateId = typeof row?.template_id === 'string' ? row.template_id : '';
    const clientId = typeof row?.client_id === 'string' ? row.client_id : '';
    if (!templateId || !clientId) continue;
    const clients = byTemplate.get(templateId) || new Set<string>();
    clients.add(clientId);
    byTemplate.set(templateId, clients);
  }
  return Object.fromEntries([...byTemplate].map(([id, clients]) => [id, { clients: clients.size, clientIds: [...clients].sort() }]));
}

// ── The meal library (?role=nutritionist) ─────────────────────────────────────────────────────
// Each client's current plan from this nutritionist is their PUBLISHED client_meal_plans row (a
// send archives the one before it, /api/nutritionist/meal-plan), and the library plan it came
// from is `payload.template.id`, which that route records only for the caller's own plans.
// ⚠ A CURRENT PLAN THAT NAMES NO LIBRARY PLAN IS NOT "NOBODY" (one sent before that was recorded,
// from the app, which sends no id yet, or by Nora). `untracked` is how many of the caller's
// current plans carry no template id: a real count, read as one, or the read is an error. With it
// above 0, the page never says a plan has no clients.
async function mealPlanUsage(db: Awaited<ReturnType<typeof clientForRequest>>, ownerId: string) {
  const { data: nutritionists, error: nutritionistError } = await db.from('nutritionists').select('id').eq('owner_id', ownerId);
  if (nutritionistError) return NextResponse.json({ error: 'Could not verify the coach account.' }, { status: 500 });
  // No nutritionist row means no plan was ever sent from here — a real answer, not a missing one.
  if (!nutritionists?.length) return NextResponse.json({ usage: {}, capped: false, untracked: 0 }, { headers: PRIVATE_HEADERS });
  const ids = nutritionists.map((n: { id: string | number }) => n.id);
  const { data: rows, error, count } = await db.from('client_meal_plans')
    .select('client_id, template_id:payload->template->>id', { count: 'exact' })
    .in('nutritionist_id', ids)
    .eq('status', 'published')
    .not('payload->template->>id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(USAGE_CAP);
  if (error) return NextResponse.json({ error: 'Could not read who is on each plan. Retry.' }, { status: 500 });
  const { count: untracked, error: untrackedError } = await db.from('client_meal_plans')
    .select('id', { count: 'exact', head: true })
    .in('nutritionist_id', ids)
    .eq('status', 'published')
    .is('payload->template->>id', null);
  if (untrackedError || typeof untracked !== 'number') return NextResponse.json({ error: 'Could not read who is on each plan. Retry.' }, { status: 500 });
  const list: UsageRow[] = Array.isArray(rows) ? rows : [];
  return NextResponse.json({ usage: usageOf(list), capped: count == null || count > list.length, untracked }, { headers: PRIVATE_HEADERS });
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const db = await clientForRequest(request);
  const params = new URL(request.url).searchParams;
  // No role, `trainer`, or anything else: the workout library's answer, as it always was.
  if (params.get('role') === 'nutritionist') return mealPlanUsage(db, user.id);
  // The coach's own calendar day, sent by the page, so "today" is theirs and not UTC's.
  // ⚠ A REAL DAY OR NONE: `2026-02-30` has the right shape, and Postgres throws on it —
  // so the day must survive a round trip through a date before it reaches the query.
  const requestedToday = params.get('today') || '';
  const parsed = new Date(requestedToday + 'T00:00:00Z');
  const today = /^\d{4}-\d{2}-\d{2}$/.test(requestedToday) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === requestedToday
    ? requestedToday : new Date().toISOString().slice(0, 10);
  const { data: trainers, error: trainerError } = await db.from('trainers').select('id').eq('owner_id', user.id);
  if (trainerError) return NextResponse.json({ error: 'Could not verify the coach account.' }, { status: 500 });
  // No trainer row means nothing was ever assigned from here — a real answer, not a missing one.
  if (!trainers?.length) return NextResponse.json({ usage: {}, capped: false }, { headers: PRIVATE_HEADERS });
  const { data: rows, error, count } = await db.from('client_workouts')
    .select('client_id, template_id:payload->template->>id', { count: 'exact' })
    .in('trainer_id', trainers.map((t: { id: string }) => t.id))
    .eq('status', 'published')
    .gte('scheduled_date', today)
    .not('payload->template->>id', 'is', null)
    .order('scheduled_date', { ascending: false })
    .limit(USAGE_CAP);
  if (error) return NextResponse.json({ error: 'Could not read who is on each program. Retry.' }, { status: 500 });
  const list: UsageRow[] = Array.isArray(rows) ? rows : [];
  return NextResponse.json({ usage: usageOf(list), capped: count == null || count > list.length }, { headers: PRIVATE_HEADERS });
}
