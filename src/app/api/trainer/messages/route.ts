// Live message threads for the newdesign Trainer "Messages" page.
// Read + reply over the existing conversations/messages tables — no new
// schema. RLS (can_access_conversation) enforces that the trainer only
// sees and posts to their own client threads.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type ThreadMessage = { id: string; body: string; mine: boolean; createdAt: string };

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { data: trainerRow } = await supabase
    .from('trainers')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();

  const providerId: number | null = trainerRow?.id ?? null;
  if (providerId == null) {
    return NextResponse.json({ isTrainer: false, threads: [] });
  }

  const { data: convRows } = await supabase
    .from('conversations')
    .select('id, client_id, last_message, last_message_at')
    .eq('kind', 'direct')
    .eq('provider_role', 'trainer')
    .eq('provider_id', providerId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(50);

  const conversations = convRows ?? [];
  if (!conversations.length) {
    return NextResponse.json({ isTrainer: true, threads: [] });
  }

  const convIds = conversations.map((c) => c.id);

  const { data: msgRows } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, body, created_at')
    .in('conversation_id', convIds)
    .order('created_at', { ascending: true });

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

  const msgsByConv = new Map<string, ThreadMessage[]>();
  for (const m of msgRows ?? []) {
    const arr = msgsByConv.get(m.conversation_id) ?? [];
    arr.push({ id: m.id, body: m.body, mine: m.sender_id === user.id, createdAt: m.created_at });
    msgsByConv.set(m.conversation_id, arr);
  }

  const threads = conversations.map((c) => ({
    id: c.id,
    clientName: (c.client_id && nameByClient.get(c.client_id)) || 'Client',
    lastMessage: c.last_message ?? '',
    lastMessageAt: c.last_message_at ?? null,
    messages: msgsByConv.get(c.id) ?? [],
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

  const body = (await req.json().catch(() => null)) as
    | { conversationId?: unknown; message?: unknown }
    | null;
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
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    message: { id: sent.id, body: sent.body, mine: true, createdAt: sent.created_at },
  });
}
