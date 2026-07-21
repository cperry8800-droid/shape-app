// src/lib/coach-origin.ts — the shared coach-checkout origin resolver.
//
// EVERY Stripe-session-creation site that carries a coach application fee calls
// resolveCoachCheckoutOrigin, because that is where Stripe's fee is fixed for the
// life of the subscription. It returns { origin, feeBps, referralId }; the caller
// feeds feeBps into the rate-aware fee helpers + application_fee_percent, and
// stamps origin/fee_bps/referral_id into the session metadata for the webhook to
// persist. Fail-closed: any read error resolves marketplace / 1500 (fail toward
// Shape's fee, never a free ride), and pre-migration (coach_referrals absent) the
// bound-row read errors → marketplace, i.e. byte-identical to today's flow.

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveOriginDecision, MARKETPLACE_FEE_BPS } from './coach-origin.mjs';

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
 * @param admin  service-role client — reads coach_waitlist + coach_referrals
 *   (clients can't SELECT coach_referrals under RLS; only coaches can).
 * @param caller caller-scoped (RLS) client — runs bind_coach_referral as the member.
 */
export async function resolveCoachCheckoutOrigin(args: {
  admin: SupabaseClient;
  caller: SupabaseClient;
  clientId: string;
  providerRole: ProviderRole;
  providerId: number;
  ref?: string | null;
}): Promise<OriginResolution> {
  const { admin, caller, clientId, providerRole, providerId, ref } = args;
  try {
    // 1a) Waitlist wins, before any referral lookup. A waiting/invited row means
    // the member found this coach on Shape — a later invite/link touch cannot
    // re-class Shape-originated demand as BYO.
    const { data: wl, error: wlErr } = await admin
      .from('coach_waitlist')
      .select('id')
      .eq('client_id', clientId)
      .eq('provider_role', providerRole)
      .eq('provider_id', providerId)
      .in('status', ['waiting', 'invited'])
      .limit(1)
      .maybeSingle();
    if (wlErr) return MARKETPLACE;
    if (wl) return MARKETPLACE;

    // 1b) A presented ref token is a touch — bind/refresh the client-bound row as
    // the signed-in member. Validate the token belongs to THIS provider FIRST: a
    // stale or cross-provider token is ignored silently (spec §1b), never
    // refreshing an unrelated coach's window as a side effect of this checkout.
    if (ref && UUID_RE.test(ref)) {
      const { data: tok } = await admin
        .from('coach_referrals')
        .select('provider_role, provider_id')
        .eq('token', ref)
        .is('client_id', null)
        .maybeSingle<{ provider_role: ProviderRole; provider_id: number }>();
      if (tok && tok.provider_role === providerRole && Number(tok.provider_id) === providerId) {
        try {
          await caller.rpc('bind_coach_referral', { p_token: ref });
        } catch {
          /* the touch is a courtesy; never block checkout on it */
        }
      }
    }

    // 1c) An UNEXPIRED client-bound row for (client, this provider) decides the
    // channel. The durable link-token row alone never resolves an origin — a token
    // must bind to a client to count (client_id is not null on a bound row).
    const { data: bound, error: boundErr } = await admin
      .from('coach_referrals')
      .select('id, channel, expires_at')
      .eq('client_id', clientId)
      .eq('provider_role', providerRole)
      .eq('provider_id', providerId)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; channel: 'dm' | 'link'; expires_at: string }>();
    if (boundErr || !bound) return MARKETPLACE;

    const decision = resolveOriginDecision({ onWaitlist: false, boundChannel: bound.channel });
    if (decision.origin === 'marketplace') return MARKETPLACE;
    return { origin: decision.origin as CoachOrigin, feeBps: decision.feeBps, referralId: bound.id };
  } catch {
    return MARKETPLACE;
  }
}
