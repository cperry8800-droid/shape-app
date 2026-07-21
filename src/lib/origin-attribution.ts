// BYO origin attribution feed (rails #1794, surfaces #1799) — the Business
// page's "who found whom" per-client labels, built ONCE for both the trainer
// and nutritionist analytics routes so the mapping can't drift between them.
//
// Every label reads the STORED (origin, fee_bps) pair — never re-derived from
// origin + the current fee constant, so a future rate change alters no existing
// row's display. Both money tables carry the same stamped pair; a BYO client
// who only books a session or buys a meal plan never appears in subscriptions,
// so recent paid one_time_purchases rows join the feed too.

import type { createClient } from '@/lib/supabase/server';

type ServerClient = Awaited<ReturnType<typeof createClient>>;
type ProviderRole = 'trainer' | 'nutritionist';

// The shared shape both money tables expose to the mapping. select('*') is
// migration-safe: an explicit origin/fee_bps select errors the whole query on a
// pre-migration DB, so the columns arrive as absent and default to
// marketplace/1500 — correct for every pre-feature row.
type OriginSourceRow = {
  client_id: string | null;
  price_cents: number | null;
  origin?: string | null;
  fee_bps?: number | null;
};

export type OriginFeedRow = {
  name: string;
  kind: 'subscription' | 'purchase';
  origin: string;
  feeBps: number;
  priceCents: number;
};

/**
 * Fold the provider's subscriptions + recent paid one-time purchases into one
 * attribution feed. Reads under the CALLER's RLS client (the routes pass their
 * cookie-scoped `supabase`) — until the provider-read policy migration is
 * applied the purchases read returns zero rows and the feed degrades honestly
 * to subscriptions-only.
 *
 * `activeNames` is the routes' already-populated client-id → name map (the
 * roster block's single profiles lookup); this only backfills the extra names a
 * purchase-only client introduces.
 */
export async function buildOriginFeed(
  supabase: ServerClient,
  providerRole: ProviderRole,
  providerId: number,
  subs: OriginSourceRow[],
  activeNames: Map<string, string>
): Promise<OriginFeedRow[]> {
  // A denied RLS read (pre-migration, before the provider-read policy is
  // applied) returns zero rows with NO error — that's the honest empty state.
  // A real DB/query FAULT is different: it must not masquerade as "no
  // purchases", so it's logged loudly and the feed degrades to
  // subscriptions-only (never crash the whole analytics response over a
  // supplementary read).
  const { data: otpRows, error: otpError } = await supabase
    .from('one_time_purchases')
    .select('*')
    .eq('provider_role', providerRole)
    .eq('provider_id', providerId)
    .eq('status', 'paid')
    .order('created_at', { ascending: false })
    .limit(20);
  if (otpError) {
    console.warn(
      `[shape-app] origin feed: one_time_purchases read failed for ${providerRole} ${providerId} — subscriptions-only:`,
      otpError.message
    );
    return subs.map((r) => ({
      name: activeNames.get(String(r.client_id ?? '')) || 'Client',
      kind: 'subscription' as const,
      origin: r.origin ?? 'marketplace',
      feeBps: r.fee_bps ?? 1500,
      priceCents: r.price_cents ?? 0,
    }));
  }
  const otps = (otpRows ?? []) as OriginSourceRow[];

  const otpMissing = [
    ...new Set(
      otps
        .map((r) => String(r.client_id ?? ''))
        .filter((id) => id && !activeNames.has(id))
    ),
  ];
  if (otpMissing.length) {
    const { data } = await supabase.from('profiles').select('id, full_name').in('id', otpMissing);
    for (const r of data ?? []) activeNames.set(String(r.id), String(r.full_name ?? '').trim());
  }

  const row = (r: OriginSourceRow, kind: OriginFeedRow['kind']): OriginFeedRow => ({
    name: activeNames.get(String(r.client_id ?? '')) || 'Client',
    kind,
    origin: r.origin ?? 'marketplace',
    feeBps: r.fee_bps ?? 1500,
    priceCents: r.price_cents ?? 0,
  });

  return [
    ...subs.map((r) => row(r, 'subscription')),
    ...otps.map((r) => row(r, 'purchase')),
  ];
}
