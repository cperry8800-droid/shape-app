// One conversation with Nora per account (the Ask Nora plan, step 4): the website and the
// app both pick it up, so a question asked on a laptop continues on the phone.
//
// GET                         -> { messages, updatedAt }  (no row yet: an empty list)
// POST { append: [message] }  -> { ok, count }  the messages this device added since it
//                                 loaded; appended to what is stored (src/lib/ai/noraThread.mjs)
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
  const { data, error } = await readRow(who.supabase, who.userId);
  if (error) return failed('read', error);
  const messages = appendThread((data as { messages?: unknown } | null)?.messages, added, now);
  const write = await who.supabase.from('nora_threads')
    .upsert({ user_id: who.userId, messages, updated_at: now.toISOString() }, { onConflict: 'user_id' });
  if (write.error) return failed('write', write.error);
  return json({ ok: true, count: messages.length });
}

export async function DELETE(request: Request) {
  const who = await caller(request);
  if ('response' in who) return who.response;
  const { error } = await who.supabase.from('nora_threads').delete().eq('user_id', who.userId);
  if (error) return failed('clear', error);
  return json({ ok: true });
}
