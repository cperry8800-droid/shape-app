// Self-serve training for the WEBSITE builder (mobile-first parity — the app
// writes the same rows client-side under RLS via ShapeSelfTraining). One
// implementation: the pure builder brain + starter catalog are imported from
// the unit-tested mobile modules (the food-search-server pattern), so the two
// surfaces can never drift on row shape.
//
// GET  /api/client/self-training
//   → { templates: { sessions, programs(meta) }, mine: [...] }
// POST /api/client/self-training { action, ... }
//   'session'         { name, repeatDow, moves, time?, editId? } — ONE weekly-repeat row
//   'program'         { name, weeks:[{week,days:[{dow,title,moves}]}], startISO } — dated batch
//   'starter_program' { id, weeks, startISO } — resolve the catalog program, then the same batch
//   'remove'          { id } — one self row
//   'removeProgram'   { programId } — every row of a program
//
// Lives under /api/client (membership proxy gate) but does its OWN auth like
// every sibling; all writes run on the CALLER's RLS client — the self-CRUD
// policies (2026-07-08-self-authored-workouts.sql) pin client_id = auth.uid()
// AND trainer_id IS NULL on every row, so this route can't author coach rows.

import { NextResponse } from 'next/server';
import { currentUser, clientForRequest } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { randomUUID } from 'node:crypto';
import { requireMembership } from '@/lib/require-membership';
import {
  BS_STARTER_SESSIONS,
  BS_STARTER_PROGRAMS,
  bsStarterProgram,
  bsValidMove,
  bsValidProgramShape,
} from '../../../../../mobile-app/src/services/starterTemplates.mjs';
import {
  BS_BUILDER_CAP,
  bsMaterializeProgram,
  bsRepeatSpec,
} from '../../../../../mobile-app/src/services/trainingBuilder.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MoveIn = { name?: unknown; sets?: unknown; reps?: unknown; load?: unknown; seg?: unknown };
type SelfRow = {
  id: string;
  title: string | null;
  scheduled_date: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function selfInsertRecord(userId: string, spec: { title: string; description?: string; scheduledDate?: string | null; payload?: Record<string, unknown> }) {
  return {
    trainer_id: null,
    client_id: userId,
    title: spec.title || 'Workout',
    description: spec.description || '',
    kind: 'custom',
    payload: spec.payload || {},
    scheduled_date: spec.scheduledDate || null,
    status: 'published',
  };
}

function mineFromRow(r: SelfRow) {
  const p = r.payload && typeof r.payload === 'object' ? r.payload : {};
  const program = p.program && typeof p.program === 'object' ? p.program : null;
  const repeatDow = Array.isArray(p.repeatDow) ? p.repeatDow : null;
  const exercises = Array.isArray(p.exercises) ? p.exercises : [];
  return {
    id: r.id,
    title: r.title || 'Workout',
    scheduledDate: r.scheduled_date || null,
    repeatDow,
    program,
    moveCount: exercises.length,
    // Repeat rows carry their full move list so Edit · Yours can hydrate the
    // form — a weekday/name edit must replace the row with the SAVED moves,
    // never whatever the form last held. Program rows stay count-only (not
    // editable on the web).
    moves: repeatDow && repeatDow.length ? exercises : undefined,
    time: typeof p.time === 'string' ? p.time : null,
    createdAt: r.created_at,
  };
}

export async function GET(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);
  const { data, error } = await supabase
    .from('client_workouts')
    .select('id, title, scheduled_date, payload, created_at')
    .eq('client_id', user.id)
    .is('trainer_id', null)
    .eq('status', 'published');
  if (error) return NextResponse.json({ error: 'Could not read your training.' }, { status: 500 });
  return NextResponse.json({
    ok: true,
    templates: {
      sessions: BS_STARTER_SESSIONS,
      // The program catalog ships METADATA only — `build` is a function and the
      // concrete weeks are resolved server-side by 'starter_program'.
      programs: BS_STARTER_PROGRAMS.map((p) => ({
        id: p.id, name: p.name, discipline: p.discipline, defaultWeeks: p.defaultWeeks, daysPerWeek: p.daysPerWeek,
      })),
    },
    mine: ((data || []) as SelfRow[]).map(mineFromRow),
  });
}

export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const parsed = await readJson<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data || {};
  const action = String(body.action || '');
  const supabase = await clientForRequest(request);

  if (action === 'session') {
    const name = String(body.name || '').trim().slice(0, 120);
    const repeatDow = Array.isArray(body.repeatDow)
      ? body.repeatDow.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
      : [];
    const moves = Array.isArray(body.moves) ? (body.moves as MoveIn[]).slice(0, 20) : [];
    if (!name) return NextResponse.json({ error: 'Name the session.' }, { status: 422 });
    if (!repeatDow.length) return NextResponse.json({ error: 'Pick at least one weekday.' }, { status: 422 });
    if (!moves.length || !moves.every(bsValidMove)) {
      return NextResponse.json({ error: 'Every move needs a name plus sets × reps (or a segment).' }, { status: 422 });
    }
    const time = typeof body.time === 'string' && /^\d{2}:\d{2}$/.test(body.time) ? body.time : undefined;
    const spec = bsRepeatSpec({ name, discipline: undefined, repeatDow, moves, time });
    const { data, error } = await supabase
      .from('client_workouts')
      .insert(selfInsertRecord(user.id, spec))
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: 'Could not save the session.' }, { status: 500 });
    // Edit · Yours: the prior repeat row retires only AFTER the new one lands
    // (removed weekdays can't linger; a failure leaves the old row intact).
    const editId = typeof body.editId === 'string' ? body.editId : '';
    if (editId && data && editId !== data.id) {
      await supabase.from('client_workouts').delete().eq('id', editId).is('trainer_id', null).eq('client_id', user.id);
    }
    return NextResponse.json({ ok: true, id: data?.id || null });
  }

  if (action === 'program' || action === 'starter_program') {
    const startISO = String(body.startISO || '');
    if (!ISO_DAY.test(startISO)) return NextResponse.json({ error: 'Pick a start date.' }, { status: 422 });
    let name: string;
    let weeks: Array<{ week: number; days: Array<{ dow: number; title: string; moves: MoveIn[] }> }>;
    if (action === 'starter_program') {
      const resolved = bsStarterProgram(String(body.id || ''), Number(body.weeks));
      if (!resolved) return NextResponse.json({ error: 'Unknown program.' }, { status: 422 });
      name = resolved.name;
      weeks = resolved.weeks;
    } else {
      name = String(body.name || '').trim().slice(0, 120);
      weeks = Array.isArray(body.weeks) ? (body.weeks as typeof weeks) : [];
      if (!bsValidProgramShape({ name, weeks })) {
        return NextResponse.json({ error: 'The program needs a name and at least one valid day per week.' }, { status: 422 });
      }
    }
    const totalRows = weeks.reduce((a, w) => a + ((w && Array.isArray(w.days) && w.days.length) || 0), 0);
    if (weeks.length > 26 || totalRows > BS_BUILDER_CAP) {
      return NextResponse.json({ error: `That's more than the ${BS_BUILDER_CAP}-session cap — shorten the block.` }, { status: 422 });
    }
    if (!totalRows) return NextResponse.json({ error: 'The program has no training days.' }, { status: 422 });
    const runId = `p${randomUUID().slice(0, 8)}`;
    const rows = bsMaterializeProgram({ name, discipline: undefined, weeks, startISO, runId, programId: undefined });
    if (!rows.length) return NextResponse.json({ error: 'Every day landed before the start date — pick an earlier start.' }, { status: 422 });
    const { error } = await supabase
      .from('client_workouts')
      .insert(rows.map((r: { title: string; description: string; scheduledDate: string; payload: Record<string, unknown> }) => selfInsertRecord(user.id, r)));
    if (error) return NextResponse.json({ error: 'Could not save the program.' }, { status: 500 });
    return NextResponse.json({ ok: true, runId, count: rows.length });
  }

  if (action === 'remove') {
    const id = String(body.id || '');
    if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
    const { error } = await supabase.from('client_workouts').delete().eq('id', id).is('trainer_id', null).eq('client_id', user.id);
    if (error) return NextResponse.json({ error: 'Could not remove it.' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'removeProgram') {
    const programId = String(body.programId || '');
    if (!programId) return NextResponse.json({ error: 'programId is required.' }, { status: 400 });
    const { data, error } = await supabase
      .from('client_workouts')
      .select('id, payload')
      .eq('client_id', user.id)
      .is('trainer_id', null);
    if (error) return NextResponse.json({ error: 'Could not read your training.' }, { status: 500 });
    const ids = ((data || []) as Array<{ id: string; payload: { program?: { id?: string } } | null }>)
      .filter((w) => w.payload && w.payload.program && w.payload.program.id === programId)
      .map((w) => w.id);
    if (ids.length) {
      const { error: delErr } = await supabase.from('client_workouts').delete().in('id', ids);
      if (delErr) return NextResponse.json({ error: 'Could not remove the program.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, count: ids.length });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
