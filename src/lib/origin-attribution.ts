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

export type OriginFeedRow = {
  name: string;
  kind: 'subscription' | 'purchase';
  origin: string;
  feeBps: number;
  // Null = genuinely unknown (render "—", never $0) — a missing price must not
  // read as a free sale. origin/fee_bps DO default (marketplace/1500) because a
  // pre-feature row genuinely paid 15%; a missing PRICE has no such truth.
  priceCents: number | null;
};

// ⚠ THE BROUGHT-IN SHARE IS PER CLIENT, NOT PER ROW (Codex, #2394). The feed above has a row per
// subscription, and one client may hold several (a plan change, two plans), so one brought client
// with two plans beside one from Shape read as "2 of your 3" (67%), and the calculators seeded
// from it overstated take-home. A client counts as brought when any of their active rows carries
// the 0% fee; a row with no client_id stands alone, as in every other per-client count.
export function byoMixOf(subs: OriginSourceRow[]): { clients: number; brought: number } {
  const byClient = new Map<string, boolean>();
  subs.forEach((r, i) => {
    const key = r.client_id != null ? 'c:' + String(r.client_id) : 'row:' + i;
    byClient.set(key, byClient.get(key) === true || Number(r.fee_bps ?? 1500) === 0);
  });
  return { clients: byClient.size, brought: [...byClient.values()].filter(Boolean).length };
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
//   active  the active and trialing rows, or null when that read failed
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
 * attribution feed. Reads under the CALLER's RLS client (the routes pass their
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
  // comes from a `profiles` read, and the coach's policy there (providers_read_subscriber_profiles_base,
  // 2026-05-29-provider-rls-hardening.sql) shows active and trialing clients only. Today's rows also
  // hold past_due ones, and when the active read failed the map is empty: unnamed here, they read "—".
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
  // fields ONLY, and these ids are deliberately outside the coach policy's
  // active/trialing scope, so the table would return nothing here.
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

  const row = (r: OriginSourceRow, kind: OriginFeedRow['kind']): OriginFeedRow => ({
    name: activeNames.get(String(r.client_id ?? '')) || '—', // — = unknown name, never a fabricated placeholder
    kind,
    origin: r.origin ?? 'marketplace',
    feeBps: r.fee_bps ?? 1500,
    priceCents: r.price_cents ?? null,
  });

  return [
    ...subs.map((r) => row(r, 'subscription')),
    ...otps.map((r) => row(r, 'purchase')),
  ];
}
