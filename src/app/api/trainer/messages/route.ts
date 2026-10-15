// Live message threads for the newdesign Trainer "Messages" page.
// Read + reply over the existing conversations/messages tables — no new
// schema. RLS (can_access_conversation) enforces that the trainer only
// sees and posts to their own client threads.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readJson, dbError } from '@/lib/request-utils';
import { coachThreadMessage, clientNames, openClientThread } from '@/lib/coach-messages';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { data: trainerRow, error: providerError } = await supabase
    .from('trainers')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (providerError) return dbError(providerError, 'load coach identity');
  const providerId: number | null = trainerRow?.id ?? null;
  if (providerId == null) {
    return NextResponse.json({ isTrainer: false, threads: [] });
  }

  const { data: convRows, error: convError } = await supabase
    .from('conversations')
    .select('id, client_id, last_message, last_message_at')
    .eq('kind', 'direct')
    .eq('provider_role', 'trainer')
    .eq('provider_id', providerId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(50);

  if (convError) return dbError(convError, 'load coach conversations');
  const conversations = convRows ?? [];
  if (!conversations.length) {
    return NextResponse.json({ isTrainer: true, threads: [] });
  }

  const convIds = conversations.map((c) => c.id);

  const { data: msgRows, error: msgError } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, body, metadata, created_at')
    .in('conversation_id', convIds)
    .order('created_at', { ascending: false })
    .limit(1000);

  if (msgError) return dbError(msgError, 'load coach messages');

  // Sessions are the RLS-safe source of client display names.
  const { data: sessRows } = await supabase
    .from('sessions')
    .select('client_id, client_name')
    .eq('provider_role', 'trainer')
    .eq('provider_id', providerId)
    .not('client_name', 'is', null);

  const nameByClient = new Map<string, string>();
  for (const s of sessRows ?? []) {
    if (s.client_id && s.client_name && !nameByClient.has(s.client_id)) {
      nameByClient.set(s.client_id, s.client_name);
    }
  }

  // Names: the client's own (get_display_names), then a booking's, then "Client" (fix 3a).
  const names = await clientNames(supabase, conversations.map((c) => c.client_id as string), nameByClient);

  const msgsByConv = new Map<string, ReturnType<typeof coachThreadMessage>[]>();
  for (const m of [...(msgRows ?? [])].reverse()) {
    const arr = msgsByConv.get(m.conversation_id) ?? [];
    arr.push(coachThreadMessage(m, user.id));
    msgsByConv.set(m.conversation_id, arr);
  }

  const threads = conversations.map((c) => ({
    id: c.id,
    clientId: c.client_id ?? null,
    clientName: (c.client_id && names.get(c.client_id)) || 'Client',
    lastMessage: c.last_message ?? '',
    lastMessageAt: c.last_message_at ?? null,
    messages: msgsByConv.get(c.id) ?? [],
    latestKnown: !!c.last_message_at && (msgsByConv.get(c.id) ?? []).some((m) => Date.parse(m.createdAt) >= Date.parse(c.last_message_at)),
  }));

  return NextResponse.json({ isTrainer: true, threads });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const bodyResult = await readJson<
    | { conversationId?: unknown; message?: unknown; openClientId?: unknown }
    | null
  >(req, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  // "Message" on a client (fix 3a, H7): open the thread the client sees with this listing, for
  // the coach's own client only, instead of a thread nobody else can see.
  if (body && body.openClientId !== undefined) {
    const opened = await openClientThread(supabase, body.openClientId, 'trainer');
    return NextResponse.json(opened.body, { status: opened.status });
  }
  const conversationId = String(body?.conversationId ?? '').trim();
  const message = String(body?.message ?? '').trim();

  if (!conversationId) {
    return NextResponse.json({ error: 'Missing conversation.' }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: 'Message cannot be empty.' }, { status: 400 });
  }

  const { data: sent, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: user.id, body: message })
    .select('id, body, created_at')
    .single();

  if (error) {
    return dbError(error, 'trainer message send', 400);
  }

  return NextResponse.json({
    ok: true,
    message: { id: sent.id, body: sent.body, mine: true, createdAt: sent.created_at },
  });
}
