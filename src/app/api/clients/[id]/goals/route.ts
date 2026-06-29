// Per-client goals — pros SET them, clients VIEW them (Goals page).
//
// Stored at client_programs.detail.goals so they ride the existing
// coach-writable RLS (2026-06-04/05 migrations: the client owns their row;
// a coach with an active sub can read AND set it via is_coach_on_client) —
// no new schema. The write merges over the row's other detail sections
// (training/nutrition adjust payloads), never clobbering them.
//
// GET  -> { ok, goals }                       (coach or the client themself)
// POST { goals: [≤3] } -> { ok, goals }       (COACH ONLY — verified server-side
//   via is_coach_on_client; goals are coach-set, client-viewed)
//
// Goal shape: { id, label, metric, unit, target, start, startedOn, setBy,
//               now?, history: [{ on: 'YYYY-MM-DD', value: n }] }.
//
// Auth: cookie session OR Bearer token.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { canWriteClientGoals } from '@/lib/access-guards.mjs';
import { readJson, dbError } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_GOALS = 3;
const MAX_HISTORY = 104; // ~2 years of weekly points

// 'PGRST202' (function not in schema cache) / '42883' (undefined_function) => the
// atomic merge_program_detail migration isn't applied yet; fall back to read-then-write.
function isMissingFunction(err: { code?: string } | null | undefined): boolean {
  return err?.code === 'PGRST202' || err?.code === '42883';
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function str(v: unknown, max = 80): string {
  return String(v ?? '').trim().slice(0, max);
}

type GoalIn = Record<string, unknown>;

// Whitelist + coerce — never store arbitrary client-supplied keys.
function sanitizeGoal(g: GoalIn, i: number): Record<string, unknown> | null {
  const label = str(g.label);
  const target = num(g.target);
  if (!label || target == null) return null;
  const history = (Array.isArray(g.history) ? g.history : [])
    .map((p) => {
      const row = (p ?? {}) as Record<string, unknown>;
      const on = str(row.on ?? row.date ?? row.d, 10);
      const value = num(row.value ?? row.v ?? row.weight ?? row.kg);
      return /^\d{4}-\d{2}-\d{2}$/.test(on) && value != null ? { on, value } : null;
    })
    .filter((p): p is { on: string; value: number } => p !== null)
    .slice(-MAX_HISTORY);
  return {
    id: str(g.id, 40) || `goal-${Date.now().toString(36)}-${i}`,
    label,
    metric: str(g.metric, 20) || 'custom',
    unit: str(g.unit, 12),
    target,
    start: num(g.start),
    startedOn: /^\d{4}-\d{2}-\d{2}$/.test(str(g.startedOn, 10)) ? str(g.startedOn, 10) : null,
    setBy: str(g.setBy, 20) || 'coach',
    now: num(g.now),
    history,
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);
  // RLS: returns the row only to the client themself or an active coach.
  const { data } = await supabase
    .from('client_programs')
    .select('detail')
    .eq('user_id', clientId)
    .maybeSingle();
  const detail = (data?.detail ?? {}) as Record<string, unknown>;
  return NextResponse.json({ ok: true, goals: Array.isArray(detail.goals) ? detail.goals : null });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  // Coach-set, client-viewed: ONLY an active coach on this client may write
  // goals. Enforce server-side via is_coach_on_client — NOT the client-self RLS
  // policy, which would let a client plant setBy:'coach' goals on their own
  // record that feed the coach triage feed. A client POSTing to their own id is
  // not a coach on themselves → rejected.
  const { data: coachOnClient } = await supabase.rpc('is_coach_on_client', { p_client_id: clientId });
  if (!canWriteClientGoals(coachOnClient === true)) {
    return NextResponse.json({ error: 'Only a coach on this client can set goals.' }, { status: 403 });
  }

  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const incoming = Array.isArray(body.goals) ? (body.goals as GoalIn[]) : null;
  if (!incoming) return NextResponse.json({ error: 'goals[] is required.' }, { status: 400 });
  const goals = incoming.map(sanitizeGoal).filter((g): g is NonNullable<typeof g> => g !== null);
  if (goals.length > MAX_GOALS) {
    return NextResponse.json({ error: `At most ${MAX_GOALS} goals per client.` }, { status: 422 });
  }

  // Atomic merge — write ONLY detail.goals in one statement (ON CONFLICT DO UPDATE
  // reads the row under its lock), so a concurrent write to a sibling section
  // (training/nutrition/directive) can't be clobbered by a stale read-modify-write.
  // RLS + the discipline trigger still authorize the write. Falls back to the legacy
  // read-then-write only until the merge_program_detail migration is applied.
  const { error } = await supabase.rpc('merge_program_detail', { p_client_id: clientId, p_patch: { goals } });
  if (error && !isMissingFunction(error)) {
    const denied = /row-level security|not a coach|not authorized/i.test(error.message);
    if (denied) return NextResponse.json({ error: 'Not a coach on this client.' }, { status: 403 });
    return dbError(error, 'client goals write', 500);
  }
  if (error) {
    // ── Fallback (pre-migration): legacy read-then-write. ──
    const { data: row } = await supabase
      .from('client_programs')
      .select('detail')
      .eq('user_id', clientId)
      .maybeSingle();
    const detail = { ...((row?.detail ?? {}) as Record<string, unknown>), goals };
    const { error: upErr } = await supabase
      .from('client_programs')
      .upsert({ user_id: clientId, detail, updated_by: user.id }, { onConflict: 'user_id' });
    if (upErr) {
      if (/row-level security/i.test(upErr.message)) return NextResponse.json({ error: 'Not a coach on this client.' }, { status: 403 });
      return dbError(upErr, 'client goals write', 500);
    }
  }
  return NextResponse.json({ ok: true, goals });
}
