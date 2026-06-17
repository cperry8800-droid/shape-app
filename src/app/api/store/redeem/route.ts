// Shape Store redemption — spend real Shape points, then fulfill the reward.
//
// POST { itemId, shipping? } -> { code, itemName, cost, balance, kind, credit }
// GET                        -> { balance, redemptions, credit }
//
// Fulfillment by item kind:
//   • merch   → requires a shipping address (422 needs_shipping otherwise); ops
//               is emailed to ship it; the address rides on the redemption row.
//   • credit  → funds the coach-credit wallet (session / nutrition) that
//               auto-applies at checkout.
//   • service → recorded; member + coach follow up.
// The member is emailed a confirmation in every case (best-effort).

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { computeMembership, adminEmails } from '@/lib/membership-core';
import {
  findStoreItem,
  storeItemCost,
  storeCreditKind,
  storeCreditCents,
  type StoreItem,
} from '@/lib/store-catalogue';
import { sendEmail } from '@/lib/email';
import { readJson, dbError } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ShipTo = {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postal: string;
  country: string;
};

function parseShipping(input: unknown): ShipTo | null {
  if (!input || typeof input !== 'object') return null;
  const s = input as Record<string, unknown>;
  const str = (k: string) => String(s[k] ?? '').trim();
  const ship: ShipTo = {
    name: str('name'),
    line1: str('line1'),
    line2: str('line2'),
    city: str('city'),
    region: str('region'),
    postal: str('postal'),
    country: str('country') || 'US',
  };
  if (!ship.name || !ship.line1 || !ship.city || !ship.postal) return null;
  return ship;
}

// Escape user-derived values before they're interpolated into HTML email
// bodies (the shipping address comes straight from the request). Plain-text
// `text:` parts don't need it. Matches the per-route helper in
// consultation/contact/apply.
function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const [{ data: balance }, { data: redemptions }, { data: credit }] = await Promise.all([
    supabase.rpc('get_my_points_balance'),
    supabase.rpc('get_my_redemptions'),
    supabase.rpc('get_my_store_credit'),
  ]);

  return NextResponse.json({
    balance: typeof balance === 'number' ? balance : 0,
    redemptions: Array.isArray(redemptions) ? redemptions : [],
    credit: (credit && typeof credit === 'object') ? credit : { session: 0, nutrition: 0 },
  });
}

async function fulfillEmails(item: StoreItem, code: string, email: string | null, ship: ShipTo | null) {
  const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://theshapecommunity.com';
  const creditKind = storeCreditKind(item);
  const next =
    item.kind === 'merch'
      ? `We'll ship it to:\n${ship ? [ship.name, ship.line1, ship.line2, `${ship.city}, ${ship.region} ${ship.postal}`, ship.country].filter(Boolean).join('\n') : 'your address on file'}.\nYou'll get a tracking note when it leaves.`
      : creditKind === 'session'
        ? `Your $${item.retail} session credit is now in your wallet — it applies automatically the next time you book a Shape trainer.`
        : creditKind === 'nutrition'
          ? `Your $${item.retail} nutrition credit is now in your wallet — it applies automatically the next time you buy a meal plan from a Shape nutritionist.`
          : `Your reward is recorded. Show this code to your coach or the Shape team to use it.`;

  // Member confirmation.
  if (email) {
    const text = `You redeemed: ${item.name}\nConfirmation code: ${code}\n\n${next}\n\nSpend more points anytime in the Shape Store: ${SITE}\n\n— Shape`;
    await sendEmail({
      to: email,
      subject: `Your Shape Store reward — ${item.name}`,
      text,
      html: `<div style="font-family:system-ui,sans-serif;max-width:480px"><h2 style="margin:0 0 8px">You redeemed ${escapeHtml(item.name)}</h2><p style="font-size:13px;color:#555">Confirmation code</p><p style="font-family:monospace;font-size:18px;font-weight:700;letter-spacing:1px;margin:0 0 16px">${escapeHtml(code)}</p><p style="white-space:pre-line;font-size:14px;line-height:1.5">${escapeHtml(next)}</p><p style="font-size:12px;color:#888;margin-top:24px">Spend more points anytime in the <a href="${SITE}">Shape Store</a>.</p></div>`,
    }).catch(() => {});
  }

  // Ops notification for physical merch.
  if (item.kind === 'merch') {
    const ops = process.env.STORE_OPS_EMAIL || adminEmails()[0];
    if (ops) {
      const addr = ship ? [ship.name, ship.line1, ship.line2, `${ship.city}, ${ship.region} ${ship.postal}`, ship.country].filter(Boolean).join('\n') : '(no address)';
      await sendEmail({
        to: ops,
        subject: `[Shape Store] Ship: ${item.name} — ${code}`,
        text: `A member redeemed merch.\n\nItem: ${item.name}\nCode: ${code}\nMember: ${email || 'unknown'}\n\nShip to:\n${addr}`,
        html: `<div style="font-family:system-ui,sans-serif"><h3>Ship: ${escapeHtml(item.name)}</h3><p>Code <b>${escapeHtml(code)}</b> · member ${escapeHtml(email || 'unknown')}</p><pre style="font-size:13px">${escapeHtml(addr)}</pre></div>`,
      }).catch(() => {});
    }
  }
}

export async function POST(request: Request) {
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
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
    return NextResponse.json({ error: 'Lead boosts activate from the Coach Tools flow.' }, { status: 400 });
  }

  // Physical merch needs somewhere to ship.
  let ship: ShipTo | null = null;
  if (item.kind === 'merch') {
    ship = parseShipping((body as { shipping?: unknown }).shipping);
    if (!ship) {
      return NextResponse.json({ error: 'needs_shipping' }, { status: 422 });
    }
  }

  const supabase = await clientForRequest(request);

  const membership = await computeMembership(supabase, user.id, user.email ?? null);
  if (!membership.isMember) {
    return NextResponse.json({ error: 'membership_required' }, { status: 402 });
  }

  const cost = storeItemCost(item);
  const creditKind = storeCreditKind(item);
  const creditCents = storeCreditCents(item);

  const { data, error } = await supabase.rpc('redeem_store_item', {
    p_item_id: item.id,
    p_item_name: item.name,
    p_cost: cost,
    p_kind: item.kind ?? null,
    p_credit_cents: creditCents,
    p_credit_kind: creditKind,
    p_ship_to: ship,
  });

  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('insufficient_points')) {
      return NextResponse.json({ error: 'insufficient_points' }, { status: 409 });
    }
    return dbError(error, 'store redeem', 500, 'Redemption failed.');
  }

  const result = (data || {}) as { code?: string; balance?: number };
  const code = result.code || '';

  // Best-effort fulfillment emails (never block the redemption response).
  await fulfillEmails(item, code, user.email ?? null, ship);

  return NextResponse.json({
    code,
    itemId: item.id,
    itemName: item.name,
    cost,
    kind: item.kind ?? null,
    credit: creditKind ? { kind: creditKind, cents: creditCents } : null,
    balance: typeof result.balance === 'number' ? result.balance : null,
  });
}
