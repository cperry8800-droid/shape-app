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
  let q = supabase
    .from('messages')
    .select('id, sender_id, body, metadata, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })
    .limit(500);
  if (sinceParam) {
    const since = new Date(sinceParam);
    if (!Number.isNaN(since.getTime())) q = q.gt('created_at', since.toISOString());
  }
  const { data, error } = await q;
  if (error) return dbError(error, 'conversation messages', 400);
  return NextResponse.json({ messages: data ?? [], me: user.id });
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
