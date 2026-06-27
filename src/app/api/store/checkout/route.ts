// Shape Store cart checkout — redeem MULTIPLE merch items in one order.
//
// POST { items: [{ itemId, qty? }], shipping } -> { orderId, items[], total, balance }
//
// A cart bundles physical merch into ONE order: one shipping address, one
// shipment, one ops email — redeemed atomically against the member's point
// balance (all-or-nothing via redeem_store_order). The cart is merch-only;
// credit/service rewards stay single-item redemptions (/api/store/redeem),
// since they don't ship and don't bundle. Cost is ALWAYS looked up server-side
// from the catalogue — the client's numbers are never trusted.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { computeMembership, adminEmails } from '@/lib/membership-core';
import { findStoreItem, storeItemCost } from '@/lib/store-catalogue';
import { sendEmail } from '@/lib/email';
import { readJson, dbError } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_QTY = 9;       // per line
const MAX_LINES = 30;    // per order (sanity bound)

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

// Escape user-derived values before interpolating into HTML email bodies (the
// shipping address comes from the request). Matches the per-route helper used
// in /api/store/redeem + consultation/contact/apply.
function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type OrderLine = { item_id: string; item_name: string; cost: number; code?: string };

function addrLines(ship: ShipTo): string[] {
  return [ship.name, ship.line1, ship.line2, `${ship.city}, ${ship.region} ${ship.postal}`, ship.country].filter(Boolean) as string[];
}

// One member confirmation + one ops shipment email for the WHOLE order.
async function orderEmails(items: OrderLine[], total: number, email: string | null, ship: ShipTo) {
  const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://theshapecommunity.com';
  const addr = addrLines(ship).join('\n');
  const list = items.map((it) => `• ${it.item_name} — ${it.code ?? ''}`).join('\n');

  if (email) {
    const text = `You redeemed ${items.length} item${items.length !== 1 ? 's' : ''} (${total.toLocaleString()} pts):\n${list}\n\nWe'll ship to:\n${addr}\nYou'll get a tracking note when it leaves.\n\nSpend more points anytime in the Shape Store: ${SITE}\n\n— Shape`;
    await sendEmail({
      to: email,
      subject: `Your Shape Store order — ${items.length} item${items.length !== 1 ? 's' : ''}`,
      text,
      html: `<div style="font-family:system-ui,sans-serif;max-width:480px"><h2 style="margin:0 0 8px">Your Shape Store order</h2><p style="font-size:13px;color:#555">${items.length} item${items.length !== 1 ? 's' : ''} · ${total.toLocaleString()} pts</p><ul style="font-size:14px;line-height:1.6;padding-left:18px">${items.map((it) => `<li>${escapeHtml(it.item_name)} — <span style="font-family:monospace;font-weight:700">${escapeHtml(it.code ?? '')}</span></li>`).join('')}</ul><p style="font-size:13px;color:#555;margin-top:16px">Shipping to</p><pre style="font-size:13px;white-space:pre-line">${escapeHtml(addr)}</pre><p style="font-size:12px;color:#888;margin-top:24px">Spend more points anytime in the <a href="${SITE}">Shape Store</a>.</p></div>`,
    }).catch(() => {});
  }

  const ops = process.env.STORE_OPS_EMAIL || adminEmails()[0];
  if (ops) {
    const lines = items.map((it) => `${it.item_name} (${it.code ?? ''})`).join('\n');
    await sendEmail({
      to: ops,
      subject: `[Shape Store] Ship order — ${items.length} item${items.length !== 1 ? 's' : ''} · ${email || 'unknown'}`,
      text: `A member redeemed a merch order (one shipment).\n\nItems:\n${lines}\n\nMember: ${email || 'unknown'}\n\nShip to:\n${addr}`,
      html: `<div style="font-family:system-ui,sans-serif"><h3>Ship order · ${items.length} item${items.length !== 1 ? 's' : ''}</h3><p>member ${escapeHtml(email || 'unknown')}</p><ul style="font-size:13px">${items.map((it) => `<li>${escapeHtml(it.item_name)} — <b>${escapeHtml(it.code ?? '')}</b></li>`).join('')}</ul><pre style="font-size:13px">${escapeHtml(addr)}</pre></div>`,
    }).catch(() => {});
  }
}

export async function POST(request: Request) {
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: false });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const rawItems = Array.isArray((body as { items?: unknown }).items) ? ((body as { items: unknown[] }).items) : [];
  if (!rawItems.length) return NextResponse.json({ error: 'empty_cart' }, { status: 400 });

  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  // Validate every line against the server catalogue + expand quantities. The
  // cart is MERCH-ONLY (one shipment); reject anything else.
  const lines: OrderLine[] = [];
  for (const raw of rawItems) {
    const r = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    const id = String(r.itemId ?? '').trim();
    const qty = Math.max(1, Math.min(MAX_QTY, Math.floor(Number(r.qty ?? 1)) || 1));
    const item = findStoreItem(id);
    if (!item) return NextResponse.json({ error: 'Unknown item.' }, { status: 404 });
    if (item.locked) return NextResponse.json({ error: 'This reward is tier-locked.' }, { status: 403 });
    if (item.kind !== 'merch') return NextResponse.json({ error: 'cart_merch_only' }, { status: 400 });
    const cost = storeItemCost(item);
    for (let i = 0; i < qty; i++) lines.push({ item_id: item.id, item_name: item.name, cost });
    if (lines.length > MAX_LINES) return NextResponse.json({ error: 'too_many_items' }, { status: 400 });
  }

  // Merch needs somewhere to ship.
  const ship = parseShipping((body as { shipping?: unknown }).shipping);
  if (!ship) return NextResponse.json({ error: 'needs_shipping' }, { status: 422 });

  const supabase = await clientForRequest(request);
  const membership = await computeMembership(supabase, user.id, user.email ?? null);
  if (!membership.isMember) return NextResponse.json({ error: 'membership_required' }, { status: 402 });

  const { data, error } = await supabase.rpc('redeem_store_order', {
    p_items: lines.map((l) => ({ item_id: l.item_id, item_name: l.item_name, cost: l.cost, kind: 'merch' })),
    p_ship_to: ship,
  });

  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('insufficient_points')) {
      return NextResponse.json({ error: 'insufficient_points' }, { status: 409 });
    }
    return dbError(error, 'store checkout', 500, 'Checkout failed.');
  }

  const result = (data || {}) as { order_id?: string; items?: OrderLine[]; total?: number; balance?: number };
  const items = Array.isArray(result.items) ? result.items : [];
  const total = typeof result.total === 'number' ? result.total : lines.reduce((s, l) => s + l.cost, 0);

  // Best-effort emails (one member confirmation + one ops shipment); never block.
  await orderEmails(items, total, user.email ?? null, ship);

  return NextResponse.json({
    orderId: result.order_id ?? null,
    items,
    total,
    balance: typeof result.balance === 'number' ? result.balance : null,
  });
}
