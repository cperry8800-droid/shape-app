import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { normalizeWorkoutPlan, builderToAssignmentRows } from '../../../../../../public/newdesign/workoutDocument.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Preview only. Applying these rows still goes through /api/trainer/workout's
// ownership, concurrency and progression gates, one client-week at a time.
export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const db = await clientForRequest(request);
  const id = new URL(request.url).searchParams.get('id');
  const requestedToday = new URL(request.url).searchParams.get('today');
  const today = requestedToday && /^\d{4}-\d{2}-\d{2}$/.test(requestedToday) ? requestedToday : new Date().toISOString().slice(0,10);
  if (!id) return NextResponse.json({ error: 'Choose a saved plan.' }, { status: 400 });
  const { data: raw, error: planError } = await db.from('coach_plans').select('id,name,kind,detail').eq('id', id).eq('owner_id', user.id).single();
  if (planError || !raw || raw.kind !== 'program') return NextResponse.json({ error: 'Workout not found.' }, { status: 404 });
  const { data: trainers, error: trainerError } = await db.from('trainers').select('id').eq('owner_id', user.id);
  if (trainerError) return NextResponse.json({ error: 'Could not verify the coach account.' }, { status: 500 });
  if (!trainers?.length) return NextResponse.json({ assignments: [] });
  const plan = normalizeWorkoutPlan(raw);
  const { data: rows, error, count } = await db.from('client_workouts')
    .select('id,client_id,title,description,kind,scheduled_date,payload', { count: 'exact' })
    .in('trainer_id', trainers.map(t => t.id)).eq('status', 'published')
    .eq('payload->template->>id', id).gt('scheduled_date', today)
    .order('scheduled_date').limit(1000);
  if (error) return NextResponse.json({ error: 'Could not load future assignments. Retry.' }, { status: 500 });
  if (count == null || count > (rows?.length || 0)) return NextResponse.json({ error: 'Too many future assignments for one update. Update a shorter program.' }, { status: 400 });
  const { data: logs, error: logError, count: logCount } = rows?.length ? await db.from('workout_sessions').select('client_workout_id', { count: 'exact' }).in('client_workout_id', rows.map(r => r.id)).limit(1000) : { data: [], error: null, count: 0 };
  if (logError || logCount == null || logCount > (logs?.length || 0)) return NextResponse.json({ error: 'Could not verify completed workouts. Retry before updating.' }, { status: 500 });
  const loggedIds = new Set((logs || []).map(l => l.client_workout_id));
  // The date is intentionally retained: template edits do not silently move a
  // client's calendar. Removed days and explicit client overrides need a coach.
  const assignments = (rows || []).flatMap(row => {
    const stamp = row.payload?.template;
    if (!stamp || row.payload?.overrides || loggedIds.has(row.id)) return [];
    const week = plan.detail.builder.weeks[Number(stamp.week)-1];
    const day = stamp.dayId ? week?.days.find((d: {id?: string}) => d.id === stamp.dayId) : week?.days[Number(stamp.day)-1];
    if (!day) return [];
    const mapped = builderToAssignmentRows({ ...plan.detail.builder, weeks: [{days:[{...day,weekday:undefined}]}] }, {id:plan.id,name:plan.name,revision:plan.detail.revision}, String(row.scheduled_date).slice(0,10))[0];
    return [{id:row.id,clientId:row.client_id,before:{id:row.id,title:row.title,description:row.description ?? null,kind:row.kind,scheduled_date:String(row.scheduled_date).slice(0,10),payload:row.payload,exercises:row.payload?.exercises || []},
      title:mapped.title,scheduledDate:String(row.scheduled_date).slice(0,10),
      payload:{...row.payload,...mapped.payload,template:{...mapped.payload.template,week:stamp.week,day:stamp.day}}}];
  });
  return NextResponse.json({assignments,skipped:(rows?.length || 0)-assignments.length});
}
