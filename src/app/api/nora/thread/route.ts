// One conversation with Nora per account (the Ask Nora plan, step 4): the website and the
// app both pick it up, so a question asked on a laptop continues on the phone.
//
// GET                         -> { messages, updatedAt }  (no row yet: an empty list)
// POST { append: [message] }  -> { ok, count }  the messages this device added since it
//                                 loaded; appended to what is stored (src/lib/ai/noraThread.mjs)
//                                 409 `thread_busy` when other devices kept winning the write
// DELETE                      -> { ok }  Clear, in the panel and in Settings
//
// Any signed-in account, by cookie or Bearer token; a visitor's thread stays in their
// browser. Read and written with the CALLER's client, so RLS holds every account to its
// own row (supabase-migrations/2026-10-08-nora-threads.sql).
//
// ⚠ BEFORE THE MIGRATION RUNS this answers 503 with code `thread_not_set_up`, and both
// surfaces keep the conversation locally, as they did before.
// ⚠ EVERY ANSWER IS no-store: it is the account's own conversation.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { appendThread, cleanThread } from '@/lib/ai/noraThread.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
type Supa = Awaited<ReturnType<typeof clientForRequest>>;
type DbError = { code?: string; message?: string } | null;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}
function isMissingTable(error: DbError): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message ?? '');
}
function failed(context: string, error: DbError) {
  if (isMissingTable(error)) return json({ error: "Saved conversations aren't set up yet.", code: 'thread_not_set_up' }, 503);
  console.error(`[shape-api] nora thread ${context}:`, error?.message ?? error);
  return json({ error: "Couldn't reach your conversation just now." }, 503);
}

async function caller(request: Request): Promise<{ userId: string; supabase: Supa } | { response: NextResponse }> {
  const user = await currentUser(request);
  if (!user) return { response: json({ error: 'Sign in to keep your conversation with Nora.' }, 401) };
  return { userId: user.id, supabase: await clientForRequest(request) };
}

async function readRow(supabase: Supa, userId: string) {
  return supabase.from('nora_threads').select('messages, updated_at').eq('user_id', userId).maybeSingle();
}

// The new row's stamp, always later than the one it replaces, so the next writer's check
// against the stamp it read can never match a row that changed since.
function nextStamp(previous: string | null | undefined, now: Date): string {
  const before = previous ? Date.parse(previous) : NaN;
  return new Date(Number.isFinite(before) ? Math.max(now.getTime(), before + 1) : now.getTime()).toISOString();
}
const APPEND_TRIES = 4;

export async function GET(request: Request) {
  const who = await caller(request);
  if ('response' in who) return who.response;
  const { data, error } = await readRow(who.supabase, who.userId);
  if (error) return failed('read', error);
  const row = data as { messages?: unknown; updated_at?: string | null } | null;
  return json({ messages: cleanThread(row?.messages), updatedAt: row?.updated_at ?? null });
}

export async function POST(request: Request) {
  const who = await caller(request);
  if ('response' in who) return who.response;
  const parsed = await readJson<{ append?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const now = new Date();
  const added = Array.isArray(parsed.data.append) ? parsed.data.append : [];
  // Nothing valid in the request is nothing to save: the stored row is left untouched.
  if (!cleanThread(added, now).length) return json({ error: 'Nothing to save.' }, 400);
  // ⚠ TWO DEVICES CAN APPEND AT ONCE (Codex, #2255). A read, append and upsert would let the
  // later write drop the other's exchange, so the write is conditional: an update only
  // applies while `updated_at` is still the value read, and a first insert loses to a
  // concurrent one on the primary key. A lost race reads again and re-appends.
  for (let attempt = 0; attempt < APPEND_TRIES; attempt += 1) {
    const { data, error } = await readRow(who.supabase, who.userId);
    if (error) return failed('read', error);
    const row = data as { messages?: unknown; updated_at?: string | null } | null;
    const messages = appendThread(row?.messages, added, now);
    const stamp = nextStamp(row?.updated_at, now);
    if (!row) {
      const created = await who.supabase.from('nora_threads').insert({ user_id: who.userId, messages, updated_at: stamp });
      if (!created.error) return json({ ok: true, count: messages.length });
      if (created.error.code === '23505') continue; // another device created it first
      return failed('write', created.error);
    }
    if (!row.updated_at) return failed('write', { message: 'thread row has no updated_at' });
    const write = await who.supabase.from('nora_threads')
      .update({ messages, updated_at: stamp })
      .eq('user_id', who.userId)
      .eq('updated_at', row.updated_at)
      .select('user_id');
    if (write.error) return failed('write', write.error);
    if (Array.isArray(write.data) && write.data.length) return json({ ok: true, count: messages.length });
    // Another device wrote between the read and this write: read again.
  }
  return json({ error: 'Your conversation is busy on another device. Try again.', code: 'thread_busy' }, 409);
}

export async function DELETE(request: Request) {
  const who = await caller(request);
  if ('response' in who) return who.response;
  const { error } = await who.supabase.from('nora_threads').delete().eq('user_id', who.userId);
  if (error) return failed('clear', error);
  return json({ ok: true });
}
