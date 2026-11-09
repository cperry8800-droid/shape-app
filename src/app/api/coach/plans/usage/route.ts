// Which of this coach's library plans a client is on — the workout library's "In use" filter and
// each card's "who's on it", and with ?role=nutritionist the meal library's. Read-only and
// owner-scoped: the rows counted are the ones THIS coach's own trainer or nutritionist rows
// published, read with the coach's own client under RLS. Only a coach sees who is on what (owner,
// 2026-11-09): each coach their own clients on their own plans.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readAllById, ROW_PAGE } from '@/lib/read-all-by-id';
import { OPEN_SUB_STATUSES, openSubsAt } from '../../../../../lib/coach-trajectory.mjs';

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
type Db = Awaited<ReturnType<typeof clientForRequest>>;

// ⚠ ONLY CLIENTS WITH AN OPEN SUBSCRIPTION ARE ON A PLAN (owner, 2026-11-09). A former client's last
// meal plan stays published, and their future program weeks stay on their calendar, when the
// subscription ends: counted, they were "+N more" on a card and Most used ranked on people who left.
// The roster's own rule decides who is a client now (src/lib/coach-roster.ts: the open statuses,
// then openSubsAt's span), read every page. null when the read failed: the answer is then an error.
async function openClients(db: Db, role: 'trainer' | 'nutritionist', providerIds: Array<string | number>): Promise<Set<string> | null> {
  const { data, error } = await readAllById<{ id: unknown; client_id?: unknown }>((after) => {
    let q = db.from('subscriptions')
      .select('*')
      .eq('provider_role', role)
      .in('provider_id', providerIds)
      .in('status', OPEN_SUB_STATUSES);
    if (after) q = q.gt('id', after);
    // capped-read-ok: one page of a cursor walk over every row (readAllById), not a cap.
    return q.order('id', { ascending: true }).limit(ROW_PAGE);
  });
  if (error || !data) return null;
  return new Set(openSubsAt(data).map((r: { client_id?: unknown }) => (typeof r.client_id === 'string' ? r.client_id : '')).filter(Boolean));
}

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
async function mealPlanUsage(db: Db, ownerId: string) {
  const { data: nutritionists, error: nutritionistError } = await db.from('nutritionists').select('id').eq('owner_id', ownerId);
  if (nutritionistError) return NextResponse.json({ error: 'Could not verify the coach account.' }, { status: 500 });
  // No nutritionist row means no plan was ever sent from here — a real answer, not a missing one.
  if (!nutritionists?.length) return NextResponse.json({ usage: {}, capped: false, untracked: 0 }, { headers: PRIVATE_HEADERS });
  const ids = nutritionists.map((n: { id: string | number }) => n.id);
  const open = await openClients(db, 'nutritionist', ids);
  if (!open) return NextResponse.json({ error: 'Could not read who is on each plan. Retry.' }, { status: 500 });
  // Every current plan, tracked or not, in one read: both counts are then over the same rows and the
  // same open clients, so `untracked` is a count of plans the read held, never a guess.
  const { data: rows, error, count } = await db.from('client_meal_plans')
    .select('client_id, template_id:payload->template->>id, created_at', { count: 'exact' })
    .in('nutritionist_id', ids)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(USAGE_CAP);
  if (error) return NextResponse.json({ error: 'Could not read who is on each plan. Retry.' }, { status: 500 });
  const current = (Array.isArray(rows) ? rows : [] as UsageRow[]).filter((r: UsageRow) => typeof r?.client_id === 'string' && open.has(r.client_id));
  const untracked = current.filter((r: UsageRow) => !(typeof r?.template_id === 'string' && r.template_id)).length;
  const fetched = Array.isArray(rows) ? rows.length : 0;
  // `sentAt`: when each open client's current plan from this nutritionist was sent (the newest, the
  // rows being newest first), so the library's "plans due" leaves out a client sent one this week
  // (Codex on #2645). Their own clients, under RLS, as the ids above.
  const sentAt: Record<string, string> = {};
  for (const r of current as Array<UsageRow & { created_at?: unknown }>) {
    if (typeof r.client_id === 'string' && !Object.prototype.hasOwnProperty.call(sentAt, r.client_id) && typeof r.created_at === 'string') sentAt[r.client_id] = r.created_at;
  }
  return NextResponse.json({ usage: usageOf(current), capped: count == null || count > fetched, untracked, sentAt }, { headers: PRIVATE_HEADERS });
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
  const open = await openClients(db, 'trainer', trainers.map((t: { id: string }) => t.id));
  if (!open) return NextResponse.json({ error: 'Could not read who is on each program. Retry.' }, { status: 500 });
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
  // A former client's future weeks are still on their calendar: only an open subscription counts.
  const current = list.filter((r) => typeof r?.client_id === 'string' && open.has(r.client_id));
  return NextResponse.json({ usage: usageOf(current), capped: count == null || count > list.length }, { headers: PRIVATE_HEADERS });
}
