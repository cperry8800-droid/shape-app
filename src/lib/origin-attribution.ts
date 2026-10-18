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
import { openSubsAt } from './coach-trajectory.mjs';

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

type OriginRowBase = {
  name: string;
  origin: string;
  feeBps: number;
  // Null = genuinely unknown (render "—", never $0) — a missing price must not
  // read as a free sale. origin/fee_bps DO default (marketplace/1500) because a
  // pre-feature row genuinely paid 15%; a missing PRICE has no such truth.
  priceCents: number | null;
};
// One of today's CLIENTS (clientsOf below): every open plan they hold, as one row.
//   clientId   null for a row with no client id, which stands alone
//   origin, feeBps  the plan that decides who brought them: a 0% plan when they hold one, else
//              their first
//   priceCents every plan's price added, null when any of them is unknown
//   plans      how many open plans they hold
//   mixedFees  their plans' fees differ, so no one rate is theirs (feeBps is the deciding plan's)
export type OriginClientRow = OriginRowBase & {
  kind: 'subscription';
  clientId: string | null;
  plans: number;
  mixedFees: boolean;
};
// A paid one-time purchase: listed on its own row, and never counted as a client.
export type OriginPurchaseRow = OriginRowBase & { kind: 'purchase' };
export type OriginFeedRow = OriginClientRow | OriginPurchaseRow;

// The stored fee, at the pre-feature default when the row has none (the type's note above).
const feeOf = (r: OriginSourceRow): number => Number(r.fee_bps ?? 1500);

type ClientPlans = { clientId: string | null; rows: OriginSourceRow[]; brought: boolean };

// ⚠ ONE CLIENT IS ONE CLIENT, IN THE BROUGHT-IN SHARE AND IN THE LIST. Both take today's rows
// through this one fold, so the two cannot disagree.
//   The share (Codex, #2394): one client may hold several plans (a plan change, two plans), so one
//   brought client with two plans beside one from Shape read as "2 of your 3" (67%), and the
//   calculators seeded from it overstated take-home.
//   The list (the follow-up to #2395): the Growth tab's "who found whom" still counted the feed's
//   rows, one a plan and one more a one-time purchase. That same practice read "2 you brought ·
//   1 found you on Shape" beside the Plan's "1 of your 2", and a purchase added one more.
// A client counts as brought when ANY of their open plans carries the 0% fee, the share's rule
// since #2394. A rule where the marketplace wins would move the Plan's and the Goal tab's share.
// A row with no client_id stands alone, as in every other per-client count.
function clientsOf(subs: OriginSourceRow[]): ClientPlans[] {
  const byClient = new Map<string, ClientPlans>();
  subs.forEach((r, i) => {
    const key = r.client_id != null ? 'c:' + String(r.client_id) : 'row:' + i;
    const c = byClient.get(key) ?? { clientId: r.client_id != null ? String(r.client_id) : null, rows: [], brought: false };
    c.rows.push(r);
    c.brought = c.brought || feeOf(r) === 0;
    byClient.set(key, c);
  });
  return [...byClient.values()];
}

export function byoMixOf(subs: OriginSourceRow[]): { clients: number; brought: number } {
  const clients = clientsOf(subs);
  return { clients: clients.length, brought: clients.filter((c) => c.brought).length };
}

// ⚠ TODAY'S CLIENTS ARE ONE SET OF ROWS, FOR EVERY COUNT OF THEM ON THE BUSINESS PAGE (the sweep
// after #2394 round 10). The Plan's clients are the trajectory's latest week, which counts a client
// whose payment is retrying (past_due) as membership does. The brought-in share was taken over the
// active and trialing rows ("you have 13 today" beside "0% fee · 3 of your 12"), and once it moved,
// the Growth tab's "who found whom" plate (byOrigin) still was: a brought client whose payment is
// retrying was "1 of your 3" on the Plan and missing from the plate on the same page ("0 you
// brought · 2 found you on Shape"). Both routes take today's rows here, for the share and the plate
// alike: the trajectory's rows (every status) by the series' own rule (openSubsAt), and only when
// that read failed the active read, as coachForecast.js todayFrom falls back to `metrics`. null
// when neither could be read: unread, never "no clients".
//   all     the trajectory read's rows (any status), or null when that read failed
//   active  the open rows (OPEN_SUB_STATUSES), or null when that read failed
export function openSubsToday(all: Array<Record<string, unknown>> | null, active: OriginSourceRow[] | null, now = Date.now()): OriginSourceRow[] | null {
  if (all) return openSubsAt(all, now) as OriginSourceRow[];
  return active;
}

// The brought-in share of today's clients (above): null when they could not be read, never 0%.
export function byoMixToday(all: Array<Record<string, unknown>> | null, active: OriginSourceRow[] | null, now = Date.now()): { clients: number; brought: number } | null {
  const today = openSubsToday(all, active, now);
  return today ? byoMixOf(today) : null;
}

// get_display_names takes at most 200 ids a call (2026-08-03-profiles-display-names.sql).
const NAME_BATCH = 200;

/**
 * Fold the provider's subscriptions + recent paid one-time purchases into one
 * attribution feed: a row per client (clientsOf: all their open plans in one),
 * then a row per purchase. Reads under the CALLER's RLS client (the routes pass their
 * cookie-scoped `supabase`) — until the provider-read policy migration is
 * applied the purchases read returns zero rows and the feed degrades honestly
 * to subscriptions-only.
 *
 * `subs` is today's subscription rows (openSubsToday). `activeNames` is the
 * routes' already-populated client-id → name map (the roster block's single
 * profiles lookup); this backfills every name it lacks, a purchase-only
 * client's or a subscriber's the profiles read could not see.
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
  }
  const otps = (otpError ? [] : otpRows ?? []) as OriginSourceRow[];

  // ⚠ A CLIENT WHOSE PAYMENT IS RETRYING IS NAMED TOO (the sweep after #2394 round 10). `activeNames`
  // comes from a `profiles` read, and the coach's policy there (providers_read_subscriber_profiles_base)
  // showed active and trialing clients only until 2026-10-18-coach-access-past-due.sql, so before that
  // runs a past_due client is missing from it; and when the active read failed the map is empty.
  // Unnamed here, they would read "—".
  const missing = [
    ...new Set(
      [...subs, ...otps]
        .map((r) => String(r.client_id ?? ''))
        .filter((id) => id && !activeNames.has(id))
    ),
  ];
  // ⚠ NOT a profiles table read. `profiles` no longer exposes other members'
  // rows (it carried email/phone/DOB/stripe_customer_id behind a USING (true)
  // SELECT policy). get_display_names is the definer that returns display
  // fields ONLY, and these ids are the ones the coach policy's open-status
  // scope did not show (a one-time buyer, or a retrying client before the
  // 2026-10-18 migration), so the table would return nothing here.
  const batches: string[][] = [];
  for (let i = 0; i < missing.length; i += NAME_BATCH) batches.push(missing.slice(i, i + NAME_BATCH));
  const named = await Promise.all(batches.map((ids) => supabase.rpc('get_display_names', { p_ids: ids })));
  for (const { data, error } of named) {
    if (error) {
      // A silent fall-through here renders plausible copy — the exact failure
      // this PR exists to stop. The likeliest cause is a deploy-order mismatch:
      // 2026-08-04 applied before this code shipped, or 2026-08-03 not applied.
      console.warn('[shape-app] origin feed: get_display_names failed — names fall back to “—”:', error.message);
    }
    for (const r of (data ?? []) as { user_id: string; full_name: string | null }[]) {
      activeNames.set(String(r.user_id), String(r.full_name ?? '').trim());
    }
  }

  const nameOf = (clientId: string | null | undefined) => activeNames.get(String(clientId ?? '')) || '—'; // — = unknown name, never a fabricated placeholder

  // One row a client (clientsOf above, the brought-in share's own fold), then the purchases, each a
  // row of its own: a one-time purchase is a sale, not a client, and is never counted as one.
  const client = (c: ClientPlans): OriginClientRow => {
    const lead = (c.brought ? c.rows.find((r) => feeOf(r) === 0) : undefined) ?? c.rows[0];
    return {
      name: nameOf(c.clientId),
      clientId: c.clientId,
      kind: 'subscription',
      origin: lead.origin ?? 'marketplace',
      feeBps: feeOf(lead),
      // A plan of unknown price is not a $0 plan, so the sum of the others is not their total.
      priceCents: c.rows.some((r) => r.price_cents == null) ? null : c.rows.reduce((s, r) => s + Number(r.price_cents), 0),
      plans: c.rows.length,
      mixedFees: new Set(c.rows.map(feeOf)).size > 1,
    };
  };
  const purchase = (r: OriginSourceRow): OriginPurchaseRow => ({
    name: nameOf(r.client_id),
    kind: 'purchase',
    origin: r.origin ?? 'marketplace',
    feeBps: feeOf(r),
    priceCents: r.price_cents ?? null,
  });

  return [...clientsOf(subs).map(client), ...otps.map(purchase)];
}
