// Live habits store for the signed-in client.
//
// GET: returns the user's habits with their completion history (last 90 days)
// POST: { action: 'create', name, type?, cadence?, visibility? } → creates a habit
//       { action: 'update', id, name?, type?, cadence?, visibility? } → updates fields
//       { action: 'toggle', id, date } → toggles completion on a given date
//       { action: 'delete', id } → soft-deletes (archives; completion history kept)

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson, dbError } from '@/lib/request-utils';
import { requireMembership } from '@/lib/require-membership';

export const dynamic = 'force-dynamic';

type CompletionRow = { habit_id: string; done_on: string };

export async function GET(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const supabase = await clientForRequest(request);
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  // select('*') keeps the read migration-safe — the optional `domain` column
  // (2026-07-13-habit-domain.sql) rides along once applied, and the route
  // works identically before it.
  const { data: habits, error: habitsErr } = await supabase
    .from('user_habits')
    .select('*')
    .eq('user_id', user.id)
    .is('archived_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (habitsErr) return dbError(habitsErr, 'habits read', 500);

  // Pull last 90 days of completions in one shot so streaks are stable.
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - 90);
  const sinceISO = since.toISOString().slice(0, 10);

  const { data: completions, error: compErr } = await supabase
    .from('user_habit_completions')
    .select('habit_id, done_on')
    .eq('user_id', user.id)
    .gte('done_on', sinceISO);

  if (compErr) return dbError(compErr, 'habit completions read', 500);

  const byHabit = new Map<string, string[]>();
  for (const c of (completions || []) as CompletionRow[]) {
    const list = byHabit.get(c.habit_id) || [];
    list.push(c.done_on);
    byHabit.set(c.habit_id, list);
  }

  const out = (habits || []).map((h) => ({
    ...h,
    history: (byHabit.get(h.id) || []).sort(),
  }));

  return NextResponse.json({ habits: out });
}

export async function POST(req: Request) {
  const denied = await requireMembership(req);
  if (denied) return denied;
  const supabase = await clientForRequest(req);
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const bodyResult = await readJson<Record<string, unknown>>(req, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const action = String((body as { action?: unknown }).action || '').toLowerCase();

  if (action === 'create') {
    const name = String((body as { name?: unknown }).name || '').trim();
    if (!name || name.length > 60) return NextResponse.json({ error: 'Name must be between 1 and 60 characters.' }, { status: 400 });
    const type = (body as { type?: string }).type === 'avoid' ? 'avoid' : 'do';
    const cadence = String((body as { cadence?: unknown }).cadence || 'daily');
    const visibility = ['private', 'friends', 'public'].includes(String((body as { visibility?: unknown }).visibility || ''))
      ? String((body as { visibility?: unknown }).visibility)
      : 'private';
    // Optional life-domain stamp (spec 2026-07-13) — 'work' is the only value;
    // anything else is dropped. Pre-migration (no `domain` column yet) the
    // insert retries without it, so habit creation never breaks on deploy order.
    const domain = (body as { domain?: unknown }).domain === 'work' ? 'work' : null;
    const baseRow: Record<string, unknown> = { user_id: user.id, name, type, cadence, visibility };
    let ins = await supabase
      .from('user_habits')
      .insert(domain ? { ...baseRow, domain } : baseRow)
      .select('*')
      .single();
    // Undefined-column signatures: Postgres 42703, or PostgREST's PGRST204
    // (column missing from the schema cache) — stable codes, not message text.
    if (ins.error && domain && (ins.error.code === '42703' || ins.error.code === 'PGRST204')) {
      ins = await supabase.from('user_habits').insert(baseRow).select('*').single();
    }
    if (ins.error) return dbError(ins.error, 'habits write', 500);
    return NextResponse.json({ habit: { ...ins.data, history: [] } });
  }

  if (action === 'update') {
    const id = String((body as { id?: unknown }).id || '');
    if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 });
    const patch: Record<string, unknown> = {};
    const b = body as Record<string, unknown>;
    if (typeof b.name === 'string') {
      if (!b.name.trim() || b.name.trim().length > 60) return NextResponse.json({ error: 'Name must be between 1 and 60 characters.' }, { status: 400 });
      patch.name = b.name.trim();
    }
    if (b.type === 'do' || b.type === 'avoid') patch.type = b.type;
    if (typeof b.cadence === 'string') patch.cadence = b.cadence;
    if (b.visibility === 'private' || b.visibility === 'friends' || b.visibility === 'public') patch.visibility = b.visibility;
    if (typeof b.sort_order === 'number') patch.sort_order = b.sort_order;
    const { data, error } = await supabase
      .from('user_habits')
      .update(patch)
      .eq('id', id)
      .eq('user_id', user.id)
      .is('archived_at', null)
      .select('id, name, type, cadence, visibility, sort_order, created_at, updated_at')
      .maybeSingle();
    if (error) return dbError(error, 'habits write', 500);
    if (!data) return NextResponse.json({ error: 'Habit not found.' }, { status: 404 });
    return NextResponse.json({ habit: data });
  }

  if (action === 'toggle' || action === 'set') {
    const id = String((body as { id?: unknown }).id || '');
    const date = String((body as { date?: unknown }).date || '');
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || (action === 'set' && typeof body.done !== 'boolean')) {
      return NextResponse.json({ error: 'id and YYYY-MM-DD date required.' }, { status: 400 });
    }
    // Confirm the habit belongs to the user (RLS would block anyway, but
    // returning a clean 404 is friendlier than relying on the RLS error).
    const { data: owned, error: ownErr } = await supabase
      .from('user_habits')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .is('archived_at', null)
      .maybeSingle();
    if (ownErr) return dbError(ownErr, 'habit ownership check', 500);
    // archived_at IS NULL also rejects toggles on a soft-deleted habit, so a
    // stale tab / direct request can't keep logging completions or awarding
    // points for a habit that was removed from the UI.
    if (!owned) return NextResponse.json({ error: 'Habit not found.' }, { status: 404 });

    const { data: existing, error: readErr } = await supabase
      .from('user_habit_completions')
      .select('id')
      .eq('user_id', user.id)
      .eq('habit_id', id)
      .eq('done_on', date)
      .maybeSingle();

    if (readErr) return dbError(readErr, 'habit completion read', 500);
    const done = action === 'set' ? body.done === true : !existing;
    if (!done && !existing) return NextResponse.json({ done: false });
    if (!done && existing) {
      // Keep the completion identity until its score credit is revoked, so a
      // failed RPC can be retried instead of leaving an orphaned award.
      const { error: ledgerErr } = await supabase.rpc('revoke_habit', { p_completion_id: existing.id });
      if (ledgerErr) return dbError(ledgerErr, 'habit score revoke', 500);
      const { error } = await supabase
        .from('user_habit_completions')
        .delete()
        .eq('id', existing.id);
      if (error) return dbError(error, 'habits write', 500);
      return NextResponse.json({ done: false });
    }
    // Replaying an explicit desired state must never undo a check-off.
    const { error: insertErr } = await supabase.from('user_habit_completions')
      .upsert({ habit_id: id, user_id: user.id, done_on: date }, { onConflict: 'habit_id,done_on', ignoreDuplicates: true });
    if (insertErr) return dbError(insertErr, 'habits write', 500);
    const { data: ins, error } = await supabase.from('user_habit_completions')
      .select('id').eq('user_id', user.id).eq('habit_id', id).eq('done_on', date).single();
    if (error) return dbError(error, 'habits write', 500);
    // Award 3 points to Shape Score under category 'habits' via the DEFINER RPC
    // (hard-codes +3, verifies the completion is caller-owned; the dedupe index
    // prevents double-credit on retry). A failed award remains retryable.
    if (ins) {
      const { error: ledgerErr } = await supabase.rpc('award_habit', { p_completion_id: ins.id });
      if (ledgerErr) return dbError(ledgerErr, 'habit score award', 500);
    }
    return NextResponse.json({ done: true });
  }

  if (action === 'delete') {
    const id = String((body as { id?: unknown }).id || '');
    if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 });
    // Soft-delete: archive the habit (and keep its completion history) instead of
    // a hard cascade delete, so an accidental removal stays recoverable. The GET
    // filters on archived_at IS NULL, so an archived habit disappears from the
    // list exactly like a deleted one.
    const { error: reminderError } = await supabase.from('habit_reminders').delete().eq('habit_id', id).eq('user_id', user.id);
    if (reminderError) return dbError(reminderError, 'habit reminders remove', 500);
    const { data, error } = await supabase
      .from('user_habits')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .is('archived_at', null)
      .select('id')
      .maybeSingle();
    if (error) return dbError(error, 'habits write', 500);
    if (!data) return NextResponse.json({ error: 'Habit not found.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
