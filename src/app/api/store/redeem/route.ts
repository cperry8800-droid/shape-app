// Shape Store redemption — spend real Shape points for a catalogue item.
//
// POST { itemId } -> { code, itemName, cost, balance }
//
// Flow: authenticate (Bearer or cookie) -> confirm the redeemer is a member
// (active sub / coach / admin; points are earnable by all, spendable by members)
// -> look up the authoritative cost server-side (never trust the client) ->
// call redeem_store_item() which atomically checks the balance, deducts a
// negative ledger row, and issues a one-time code.
//
// GET -> { balance, redemptions } for the signed-in member's store locker.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { computeMembership } from '@/lib/membership-core';
import { findStoreItem, storeItemCost } from '@/lib/store-catalogue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const [{ data: balance }, { data: redemptions }] = await Promise.all([
    supabase.rpc('get_my_points_balance'),
    supabase.rpc('get_my_redemptions'),
  ]);

  return NextResponse.json({
    balance: typeof balance === 'number' ? balance : 0,
    redemptions: Array.isArray(redemptions) ? redemptions : [],
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const itemId = String((body as { itemId?: unknown }).itemId ?? '').trim();
  if (!itemId) return NextResponse.json({ error: 'Missing itemId.' }, { status: 400 });

  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const item = findStoreItem(itemId);
  if (!item) return NextResponse.json({ error: 'Unknown item.' }, { status: 404 });
  if (item.locked) {
    return NextResponse.json({ error: 'This reward is tier-locked.' }, { status: 403 });
  }
  if (item.kind === 'lead_boost') {
    // Lead boosts activate marketplace placement via their own endpoint, not
    // a point redemption — guard against redeeming them here.
    return NextResponse.json({ error: 'Lead boosts activate from the Coach Tools flow.' }, { status: 400 });
  }

  const supabase = await clientForRequest(request);

  // Points are earnable by everyone, but spendable only by members (active
  // subscription / coach / admin) — mirrors the store UI's redeem gate.
  const membership = await computeMembership(supabase, user.id, user.email ?? null);
  if (!membership.isMember) {
    return NextResponse.json({ error: 'membership_required' }, { status: 402 });
  }

  const cost = storeItemCost(item);
  const { data, error } = await supabase.rpc('redeem_store_item', {
    p_item_id: item.id,
    p_item_name: item.name,
    p_cost: cost,
  });

  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('insufficient_points')) {
      return NextResponse.json({ error: 'insufficient_points' }, { status: 409 });
    }
    return NextResponse.json({ error: msg || 'Redemption failed.' }, { status: 500 });
  }

  const result = (data || {}) as { code?: string; balance?: number };
  return NextResponse.json({
    code: result.code || '',
    itemId: item.id,
    itemName: item.name,
    cost,
    balance: typeof result.balance === 'number' ? result.balance : null,
  });
}
