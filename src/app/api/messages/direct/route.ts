import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function normalizeProviderRole(value: unknown): 'trainer' | 'nutritionist' | null {
  const role = String(value ?? '').toLowerCase();
  if (role === 'trainer') return 'trainer';
  if (role === 'nutritionist') return 'nutritionist';
  return null;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { data: conversations, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('kind', 'direct')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const ids = (conversations ?? []).map((conversation) => conversation.id);
  if (!ids.length) {
    return NextResponse.json({ conversations: [] });
  }

  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select('*')
    .in('conversation_id', ids)
    .order('created_at', { ascending: true });

  if (messagesError) {
    return NextResponse.json({ error: messagesError.message }, { status: 400 });
  }

  return NextResponse.json({ conversations, messages: messages ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in before messaging a coach.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null as unknown);
  const payload = body as { providerRole?: unknown; providerId?: unknown; message?: unknown } | null;
  const providerRole = normalizeProviderRole(payload?.providerRole);
  const providerId = Number(payload?.providerId);
  const message = String(payload?.message ?? '').trim();

  if (!providerRole || !Number.isInteger(providerId) || providerId <= 0) {
    return NextResponse.json({ error: 'Missing provider details.' }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: 'Message cannot be empty.' }, { status: 400 });
  }

  const { data: conversationId, error: conversationError } = await supabase.rpc(
    'get_or_create_direct_conversation',
    {
      p_provider_role: providerRole,
      p_provider_id: providerId,
    }
  );

  if (conversationError) {
    return NextResponse.json({ error: conversationError.message }, { status: 400 });
  }

  const { data: sent, error: messageError } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      body: message,
      metadata: {
        source: 'website',
        provider_role: providerRole,
        provider_id: providerId,
      },
    })
    .select()
    .single();

  if (messageError) {
    return NextResponse.json({ error: messageError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, conversationId, message: sent });
}
