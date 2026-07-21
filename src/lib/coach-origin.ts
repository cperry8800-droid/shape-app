// src/lib/coach-origin.ts — the shared coach-checkout origin resolver.
//
// EVERY Stripe-session-creation site that carries a coach application fee calls
// resolveCoachCheckoutOrigin, because that is where Stripe's fee is fixed for the
// life of the subscription. Resolution runs entirely through the auth.uid()-scoped
// SECURITY DEFINER RPC `resolve_coach_checkout_origin` on the CALLER's client —
// a user-initiated route never reads the referral ledger via the service role
// (RLS-authoritative, the house rule; review round). The RPC owns the precedence
// (waitlist wins → provider-matched token touch → unexpired bound-row channel →
// marketplace — mirrored by the pure ./coach-origin.mjs decision, which the tests
// pin); the fee RATE stays code-owned here so a future rate change never needs SQL.
// Fail-closed: any error — including pre-migration, when the RPC doesn't exist —
// resolves marketplace / 1500, i.e. byte-identical to today's flow.

import type { SupabaseClient } from '@supabase/supabase-js';
import { MARKETPLACE_FEE_BPS, BYO_FEE_BPS } from './coach-origin.mjs';

export type ProviderRole = 'trainer' | 'nutritionist';
export type CoachOrigin = 'marketplace' | 'coach_invite' | 'coach_link';
export type OriginResolution = { origin: CoachOrigin; feeBps: number; referralId: string | null };

// Canonical UUID — a ref token must be well-formed before we hand it to the RPC.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MARKETPLACE: OriginResolution = {
  origin: 'marketplace',
  feeBps: MARKETPLACE_FEE_BPS,
  referralId: null,
};

/**
 * Resolve the checkout origin + resolved fee for a coach sale.
 *
 * @param caller caller-scoped (RLS) client — the RPC is auth.uid()-scoped, so the
 *   resolution can only ever read/bind the signed-in member's own state.
 */
export async function resolveCoachCheckoutOrigin(args: {
  caller: SupabaseClient;
  providerRole: ProviderRole;
  providerId: number;
  ref?: string | null;
}): Promise<OriginResolution> {
  const { caller, providerRole, providerId, ref } = args;
  try {
    const { data, error } = await caller.rpc('resolve_coach_checkout_origin', {
      p_provider_role: providerRole,
      p_provider_id: providerId,
      p_ref: ref && UUID_RE.test(ref) ? ref : null,
    });
    if (error || !data) {
      // Fail-closed is correct, but a PERSISTENT failure (RPC missing, outage,
      // or an empty response) would silently put every coach-sale checkout at
      // the marketplace rate — log BOTH branches so the degrade is visible.
      console.warn(
        '[shape-app] resolve_coach_checkout_origin failed:',
        error?.message ?? 'RPC returned no data'
      );
      return MARKETPLACE;
    }
    const row = (Array.isArray(data) ? data[0] : data) as
      | { origin?: string; referral_id?: string | null }
      | undefined;
    if (row?.origin === 'coach_invite' || row?.origin === 'coach_link') {
      return { origin: row.origin, feeBps: BYO_FEE_BPS, referralId: row.referral_id ?? null };
    }
    return MARKETPLACE;
  } catch (err) {
    console.warn(
      '[shape-app] resolve_coach_checkout_origin threw:',
      err instanceof Error ? err.message : err
    );
    return MARKETPLACE;
  }
}
