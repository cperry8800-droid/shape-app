// Generic message I/O for a single conversation.
//
// GET  → all messages in chronological order.
// POST → append a message ({ body: string }). The conversation's
//        last_message / last_message_at are updated via the existing
//        messages_touch_conversation trigger.
//
// RLS (can_access_conversation) makes both ops safe — callers can only see
// and write to threads they participate in.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readJson, dbError, cleanText } from '@/lib/request-utils';
import { requireMembership } from '@/lib/require-membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// How many messages one GET returns. A thread longer than this is read from its TAIL —
// see the note on the query below.
const MESSAGE_CAP = 500;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireMembership(req);
  if (denied) return denied;
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const url = new URL(req.url);
  const sinceParam = url.searchParams.get('since');
  const since = sinceParam ? new Date(sinceParam) : null;
  const incremental = !!(since && !Number.isNaN(since.getTime()));
  // capped-read-ok: an INCREMENTAL poll is the one case where oldest-first is right.
  //
  // ⚠ A COLD LOAD READS NEWEST FIRST AND IS RE-REVERSED BELOW. Ordering ascending made
  // this cap keep the OLDEST 500 messages, so opening a long-running coach thread showed
  // a conversation from a year ago and never the messages that had just arrived.
  //
  // ⚠ BUT AN INCREMENTAL POLL KEEPS ASCENDING, and that is not an oversight. The caller
  // already holds everything up to `since`, so the rows that close the gap are the OLDEST
  // ones after it; taking the newest 500 instead would leave a hole in the middle of the
  // thread that no later poll ever fills. Either way the response is ascending, which is
  // the contract every client reads.
  let q = supabase
    .from('messages')
    .select('id, sender_id, body, metadata, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: incremental })
    .limit(MESSAGE_CAP);
  if (incremental && since) q = q.gt('created_at', since.toISOString());
  const { data, error } = await q;
  if (error) return dbError(error, 'conversation messages', 400);
  const messages = incremental ? (data ?? []) : (data ?? []).slice().reverse();
  return NextResponse.json({ messages, me: user.id });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireMembership(req);
  if (denied) return denied;
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const bodyResult = await readJson<Record<string, unknown>>(req, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const text = cleanText(body?.body, 4000);
  if (!text) return NextResponse.json({ error: 'Message cannot be empty.' }, { status: 400 });

  const { data: sent, error } = await supabase
    .from('messages')
    .insert({ conversation_id: id, sender_id: user.id, body: text })
    .select('id, sender_id, body, metadata, created_at')
    .single();
  if (error) return dbError(error, 'conversation messages', 400);
  return NextResponse.json({ message: sent });
}
