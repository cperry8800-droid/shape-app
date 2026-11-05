// Which of this coach's programs a client has on their calendar — the workout library's
// "In use" filter. Read-only and owner-scoped: the sessions counted are the ones THIS
// coach's trainer rows published, read with the coach's own client under RLS.
//
// P6 (2026-11-05): "who's on this plan" and "Most used", for programs AND meal plans.
//   ?kind=program (the default) → { usage: { [templateId]: { clients, clientIds, weeks: { [clientId]: week } } } }
//     `weeks` is each client's OWN week of the program: the week stamp of their next session, so five
//     clients on one program read "Jonah wk 6 · Tess wk 1", never one shared week.
//   ?kind=meal_plan → { usage: { [templateId]: { clients, clientIds } } }, from the template a meal plan
//     assignment now carries (client_meal_plans.payload.template, /api/nutritionist/meal-plan): the
//     clients whose CURRENT plan from this nutritionist came from it. A plan assigned before the stamp
//     carries none and is not counted, which the page says ("assigned since 5 Nov").

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ⚠ A CAP, AND IT IS REPORTED. A row here is two ids, and a full practice has a few
// thousand upcoming sessions at most — but past the cap the answer can only UNDER-count,
// so `capped` goes back with it and the page may then say "in use", never "not in use".
const USAGE_CAP = 5000;

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const db = await clientForRequest(request);
  // The coach's own calendar day, sent by the page, so "today" is theirs and not UTC's.
  // ⚠ A REAL DAY OR NONE: `2026-02-30` has the right shape, and Postgres throws on it —
  // so the day must survive a round trip through a date before it reaches the query.
  const requestedToday = new URL(request.url).searchParams.get('today') || '';
  const parsed = new Date(requestedToday + 'T00:00:00Z');
  const today = /^\d{4}-\d{2}-\d{2}$/.test(requestedToday) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === requestedToday
    ? requestedToday : new Date().toISOString().slice(0, 10);
  if (new URL(request.url).searchParams.get('kind') === 'meal_plan') return mealPlanUsage(db, user.id);
  const { data: trainers, error: trainerError } = await db.from('trainers').select('id').eq('owner_id', user.id);
  if (trainerError) return NextResponse.json({ error: 'Could not verify the coach account.' }, { status: 500 });
  // No trainer row means nothing was ever assigned from here — a real answer, not a missing one.
  if (!trainers?.length) return NextResponse.json({ usage: {}, capped: false });
  const { data: rows, error, count } = await db.from('client_workouts')
    .select('client_id, template_id:payload->template->>id, template_week:payload->template->>week, scheduled_date', { count: 'exact' })
    .in('trainer_id', trainers.map((t: { id: string }) => t.id))
    .eq('status', 'published')
    .gte('scheduled_date', today)
    .not('payload->template->>id', 'is', null)
    .order('scheduled_date', { ascending: false })
    .limit(USAGE_CAP);
  if (error) return NextResponse.json({ error: 'Could not read who is on each program. Retry.' }, { status: 500 });
  const list: Array<{ client_id?: unknown; template_id?: unknown; template_week?: unknown; scheduled_date?: unknown }> = Array.isArray(rows) ? rows : [];
  // Clients, not sessions: one client with twelve weeks of a program is one client on it.
  const byTemplate = new Map<string, Map<string, { week: number | null; date: string }>>();
  for (const row of list) {
    const templateId = typeof row?.template_id === 'string' ? row.template_id : '';
    const clientId = typeof row?.client_id === 'string' ? row.client_id : '';
    if (!templateId || !clientId) continue;
    const clients = byTemplate.get(templateId) || new Map<string, { week: number | null; date: string }>();
    // Their week is the one their NEXT session is in (rows come newest-first, so the earliest wins last).
    const week = Number(row.template_week);
    const date = String(row.scheduled_date ?? '');
    const cur = clients.get(clientId);
    if (!cur || date < cur.date) clients.set(clientId, { week: Number.isInteger(week) && week > 0 ? week : null, date });
    byTemplate.set(templateId, clients);
  }
  // fromEntries defines OWN properties, so a template id can never reach a prototype.
  const usage = Object.fromEntries([...byTemplate].map(([id, clients]) => [id, {
    clients: clients.size,
    clientIds: [...clients.keys()],
    weeks: Object.fromEntries([...clients].filter(([, v]) => v.week != null).map(([c, v]) => [c, v.week])),
  }]));
  return NextResponse.json({ usage, capped: count == null || count > list.length });
}

type Db = Awaited<ReturnType<typeof clientForRequest>>;
async function mealPlanUsage(db: Db, ownerId: string) {
  const { data: rows0, error: nutriError } = await db.from('nutritionists').select('id').eq('owner_id', ownerId);
  if (nutriError) return NextResponse.json({ error: 'Could not verify the coach account.' }, { status: 500 });
  if (!rows0?.length) return NextResponse.json({ usage: {}, capped: false });
  const { data: rows, error, count } = await db.from('client_meal_plans')
    .select('client_id, template_id:payload->template->>id', { count: 'exact' })
    .in('nutritionist_id', rows0.map((n: { id: unknown }) => n.id))
    .eq('status', 'published')
    .not('payload->template->>id', 'is', null)
    .limit(USAGE_CAP);
  if (error) return NextResponse.json({ error: 'Could not read who is on each plan. Retry.' }, { status: 500 });
  const list: Array<{ client_id?: unknown; template_id?: unknown }> = Array.isArray(rows) ? rows : [];
  const byTemplate = new Map<string, Set<string>>();
  for (const row of list) {
    const templateId = typeof row?.template_id === 'string' ? row.template_id : '';
    const clientId = typeof row?.client_id === 'string' ? row.client_id : '';
    if (!templateId || !clientId) continue;
    const clients = byTemplate.get(templateId) || new Set<string>();
    clients.add(clientId);
    byTemplate.set(templateId, clients);
  }
  const usage = Object.fromEntries([...byTemplate].map(([id, clients]) => [id, { clients: clients.size, clientIds: [...clients] }]));
  return NextResponse.json({ usage, capped: count == null || count > list.length });
}
