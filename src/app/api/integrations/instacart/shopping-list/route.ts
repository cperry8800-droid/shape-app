// Build an Instacart "shopping list page" from the signed-in user's grocery
// list and return a products_link_url the app can open. The grocery list is
// derived from coach_pushed_items (the same source as /api/client/grocery):
// meals a nutritionist pushed, flattened to their ingredient lines. Callers
// may also pass an explicit `items` array to override.
//
// Uses the Instacart Developer Platform (IDP) Products Link API:
//   POST {INSTACART_CONNECT_URL}/idp/v1/products/products_link
// Requires INSTACART_API_KEY. INSTACART_CONNECT_URL defaults to production;
// set it to https://connect.dev.instacart.tools for the development catalog.

import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/request-utils';
import { requireMembership } from '@/lib/require-membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function resolveUser(request: Request): Promise<{ id: string } | null> {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (!url || !anonKey) return null;
    const client = createSupabaseClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearerMatch[1]}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await client.auth.getUser(bearerMatch[1]);
    return data.user ? { id: data.user.id } : null;
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? { id: data.user.id } : null;
}

type LineItem = { name: string; quantity?: number; unit?: string; display_text?: string };

// Flatten one pushed-meal payload into ingredient line-item shapes.
function ingredientsFromPayload(payload: unknown): LineItem[] {
  const p = payload as { ingredients?: unknown } | null;
  const list = Array.isArray(p?.ingredients) ? p!.ingredients : [];
  const out: LineItem[] = [];
  for (const raw of list) {
    if (typeof raw === 'string') {
      const name = raw.trim();
      if (name) out.push({ name });
    } else if (raw && typeof raw === 'object') {
      const obj = raw as { item?: unknown; qty?: unknown };
      const name = String(obj.item ?? '').trim();
      if (name) out.push({ name, display_text: obj.qty ? String(obj.qty) : undefined });
    }
  }
  return out;
}

// Collapse duplicate ingredient names (case-insensitive), keeping the first
// display_text we saw — Instacart matches each line to a product.
function dedupe(items: LineItem[]): LineItem[] {
  const seen = new Map<string, LineItem>();
  for (const it of items) {
    const key = it.name.toLowerCase();
    if (!seen.has(key)) seen.set(key, it);
  }
  return Array.from(seen.values());
}

export async function POST(request: Request) {
  const apiKey = process.env.INSTACART_API_KEY;

  const user = await resolveUser(request);
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  // ⚠ PAID CONTENT OUTSIDE THE PAID PREFIXES. This route flattens
  // `coach_pushed_items` — the SAME nutritionist-authored content
  // `/api/client/grocery` serves behind both the proxy gate and its own
  // requireMembership() — but `/api/integrations` is not a gated prefix, so
  // without this a lapsed member could keep pulling their coach's grocery data
  // through the Instacart path. Fails OPEN like every other paid route: this is
  // a paywall, not the licence boundary that makes /api/radio/station fail closed.
  const denied = await requireMembership(request);
  if (denied) return denied;

  const bodyResult = await readJson<{
    items?: Array<string | LineItem>;
    title?: string;
  }>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  let lineItems: LineItem[] = [];
  if (Array.isArray(body.items) && body.items.length) {
    lineItems = body.items
      .map((it) => (typeof it === 'string' ? { name: it.trim() } : { ...it, name: String(it.name ?? '').trim() }))
      .filter((it) => it.name);
  } else {
    // Pull the user's coach-pushed meals and flatten their ingredients.
    const supabase = await createClient();
    const { data: rows } = await supabase
      .from('coach_pushed_items')
      .select('payload')
      .eq('client_id', user.id);
    for (const row of rows ?? []) lineItems.push(...ingredientsFromPayload((row as { payload: unknown }).payload));
  }

  lineItems = dedupe(lineItems);
  if (!lineItems.length) {
    return NextResponse.json({ error: 'Your grocery list is empty.' }, { status: 422 });
  }

  // Instacart access is gated (they aren't issuing new Developer Platform keys
  // right now). Without a key, hand the resolved list back so the client can
  // fall back to copying it — no dead-end for the user.
  if (!apiKey) {
    return NextResponse.json({ configured: false, title: body.title || 'Shape grocery list', items: lineItems });
  }

  const base = (process.env.INSTACART_CONNECT_URL || 'https://connect.instacart.com').replace(/\/$/, '');
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');

  const res = await fetch(`${base}/idp/v1/products/products_link`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: body.title || 'Shape grocery list',
      link_type: 'shopping_list',
      expires_in: 7,
      line_items: lineItems.map((it) => ({
        name: it.name,
        quantity: typeof it.quantity === 'number' ? it.quantity : 1,
        unit: it.unit || 'each',
        ...(it.display_text ? { display_text: it.display_text } : {}),
      })),
      landing_page_configuration: {
        partner_linkback_url: siteUrl || undefined,
        enable_pantry_items: true,
      },
    }),
  });

  const json = (await res.json().catch(() => ({}))) as { products_link_url?: string; error?: string; message?: string };
  if (!res.ok || !json.products_link_url) {
    return NextResponse.json(
      { error: json.error || json.message || 'Unable to create Instacart shopping list.' },
      { status: 502 }
    );
  }

  return NextResponse.json({ url: json.products_link_url, count: lineItems.length });
}
