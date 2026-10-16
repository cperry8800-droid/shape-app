import { NextResponse } from 'next/server';
import { resolveRequestClient } from '@/lib/waitlist';
import { ACTIVE_SUB } from '@/lib/membership-core';

export const runtime = 'nodejs';

type MyEntry = {
  id: string;
  provider_role: string;
  provider_id: number;
  status: string;
  note: string | null;
  invited_at: string | null;
  invite_expires_at: string | null;
  created_at: string;
  queue_position: number | null;
};

export async function GET(request: Request) {
  const auth = await resolveRequestClient(request);
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { supabase, user } = auth;

  // auth.uid()-scoped RPC: the caller's active entries with FIFO position
  // (a client can't read peer rows under RLS, so position is computed there).
  const { data, error } = await supabase.rpc('get_my_waitlists');
  if (error) return NextResponse.json({ error: 'Could not load your waitlists.' }, { status: 500 });

  const entries = ((data as MyEntry[] | null) ?? []).map((r) => ({
    id: r.id,
    providerRole: r.provider_role,
    providerId: r.provider_id,
    status: r.status,
    note: r.note,
    invited_at: r.invited_at,
    invite_expires_at: r.invite_expires_at,
    position: r.queue_position,
  }));

  // ⚠ AND THE COACHES THE CALLER ALREADY SUBSCRIBES TO (task #10, Codex on #2375). At capacity a
  // coach takes no NEW clients; a current one keeps buying (the checkout and /purchase let them).
  // Every storefront that reads this list used to show a current client "Join the waiting list",
  // which the coach cannot invite them off. With this they show the client their way to buy
  // instead. The same read as isActiveClientOf, under the caller's own RLS ("clients read own
  // subscriptions"). `null` when it failed: a page then falls back to the waiting list, and the
  // checkout still decides.
  const { data: subs, error: subsError } = await supabase
    .from('subscriptions')
    .select('provider_role, provider_id')
    .eq('client_id', user.id)
    .in('status', Array.from(ACTIVE_SUB))   // past due included: /subscribe counts them as subscribed
    .limit(200);
  if (subsError) console.error('[waitlist/mine] subscriptions read failed', subsError.message);
  const clientOf = subsError
    ? null
    : ((subs as { provider_role: string; provider_id: number }[] | null) ?? []).map((r) => ({ providerRole: r.provider_role, providerId: r.provider_id }));
  return NextResponse.json({ entries, clientOf });
}
