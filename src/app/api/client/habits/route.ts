// Live habits store for the signed-in client.
//
// GET: returns the user's habits with their completion history (last 90 days)
// POST: { action: 'create', name, type?, cadence?, visibility? } → creates a habit
//       { action: 'update', id, name?, type?, cadence?, visibility? } → updates fields
//       { action: 'toggle', id, date } → toggles completion on a given date
//       { action: 'delete', id } → soft-deletes (archives; completion history kept)

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readJson, dbError } from '@/lib/request-utils';

export const dynamic = 'force-dynamic';

type CompletionRow = { habit_id: string; done_on: string };

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const bodyResult = await readJson<Record<string, unknown>>(req, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const action = String((body as { action?: unknown }).action || '').toLowerCase();

  if (action === 'create') {
    const name = String((body as { name?: unknown }).name || '').trim();
    if (!name) return NextResponse.json({ error: 'Name required.' }, { status: 400 });
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
    if (ins.error && domain && /domain/i.test(ins.error.message || '')) {
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
    if (typeof b.name === 'string') patch.name = b.name.trim();
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

  if (action === 'toggle') {
    const id = String((body as { id?: unknown }).id || '');
    const date = String((body as { date?: unknown }).date || '');
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
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

    const { data: existing } = await supabase
      .from('user_habit_completions')
      .select('id')
      .eq('user_id', user.id)
      .eq('habit_id', id)
      .eq('done_on', date)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('user_habit_completions')
        .delete()
        .eq('id', existing.id);
      if (error) return dbError(error, 'habits write', 500);
      // Roll back the score credit tied to this completion row, via the DEFINER
      // RPC (clients can no longer write score_ledger directly). It deletes only
      // the caller's own habit-completion award row. Log a failure for visibility.
      const { error: ledgerErr } = await supabase.rpc('revoke_habit', { p_completion_id: existing.id });
      if (ledgerErr) console.error('[habits] score_ledger rollback failed:', ledgerErr.message);
      return NextResponse.json({ done: false });
    }
    const { data: ins, error } = await supabase
      .from('user_habit_completions')
      .insert({ habit_id: id, user_id: user.id, done_on: date })
      .select('id')
      .single();
    if (error) return dbError(error, 'habits write', 500);
    // Award 3 points to Shape Score under category 'habits' via the DEFINER RPC
    // (hard-codes +3, verifies the completion is caller-owned; the dedupe index
    // prevents double-credit on retry). Surface a failed award in logs rather
    // than returning done:true while points silently never post.
    if (ins) {
      const { error: ledgerErr } = await supabase.rpc('award_habit', { p_completion_id: ins.id });
      if (ledgerErr) console.error('[habits] score_ledger award failed:', ledgerErr.message);
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
