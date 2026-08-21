// Server-side 18+ enforcement for authenticated routes OUTSIDE the paid-prefix
// gate.
//
// ⚠ WHY THIS EXISTS: the 18+ check added with the compliance pass lives in two
// places only — the proxy's gate over `GATED_API_PREFIXES` and
// `requireMembership()`, which covers those same handlers. Every OTHER
// authenticated route treats "has a session" as "is eligible", so an account the
// database has already identified as a minor passes. That made the enforcement
// incomplete for exactly the accounts it identifies.
//
// ⚠ READ `GATED_API_PREFIXES` IN `supabase/middleware.ts` — DO NOT TRUST A PROSE
// COPY OF IT. It holds SEVEN prefixes (`/api/client`, `/api/nutrition`,
// `/api/ai`, `/api/insights`, `/api/calendar`, `/api/conversations`,
// `/api/messages`). An earlier five-prefix copy of that list in this header and
// in the War Room record omitted the last two, so chat read as UNGATED when it is
// gated, and the coverage counts derived from it were wrong by two routes.
//
// ⚠ ABSENCE REFUSES — AND THIS PARAGRAPH SAID THE OPPOSITE FOR MONTHS. It read
// "absence is not treated as a claim either way", describing an `over_18`-only
// rule that stopped being the rule when mustRefuseForAge() landed. Line ~70 of
// THIS FILE already said ABSENCE NO LONGER ADMITS, so the two halves of one file
// disagreed — and the stale half is the one that got quoted into a launch
// document, and from there into a status board, before anyone read the code.
// Corrected rather than deleted, because the correction is the useful part.
//
// WHAT THE RULE ACTUALLY IS, in `mustRefuseForAge()` (src/lib/age-derive.mjs):
// a usable `date_of_birth` decides in BOTH directions, so a proven adult is never
// refused; `over_18` false/true decides next; and only when the row proves nothing
// either way does `created_at` decide — REFUSED from ADULT_PROOF_REQUIRED_FROM
// (2026-08-16) onward, grandfathered before it. A null or absent profile REFUSES
// outright, deliberately: "no row" is what a failed provisioning write leaves
// behind, and that is not a state to admit on.
//
// ⚠ READ mustRefuseForAge() ITSELF, NEVER A PROSE COPY OF IT — including this one.
// Every wrong claim about this gate so far has come from a summary that was true
// when written and went false when the rule moved.
//
// ⚠ AND `false` IS ONLY PROOF ONCE THE DOB FREEZE IS APPLIED.
// `over_18` cannot be written directly, but until
// 2026-08-15-profiles-dob-immutable.sql freezes `date_of_birth`, an identified
// minor can rewrite the INPUT through PostgREST and clear this flag themselves
// (proved against production 2026-08-15). This gate is only as good as that
// migration — do not treat a refusal as durable before it is applied.
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mustRefuseForAge } from '@/lib/membership-core';

/**
 * Returns a 403 response when `userId` is a confirmed minor, else null.
 *
 * ⚠ FAILS OPEN on a read fault, and unlike the proxy gate there is NO second
 * layer behind this one — the proxy's own fail-open is justified by
 * `requireMembership()` re-checking at the route, which does not apply here. So
 * the honest statement of the tradeoff: a `profiles` read fault lets a known
 * minor through until the read recovers. Chosen deliberately over failing closed
 * because this guards content surfaces, and a transient database blip taking
 * down a feature for every adult is the worse outcome for a policy control. It
 * is a policy control, not a security boundary — do not rely on it to protect
 * data.
 */
export async function refuseKnownMinor(
  client: SupabaseClient,
  userId: string
): Promise<NextResponse | null> {
  try {
    const { data, error } = await client
      .from('profiles')
      .select('over_18, date_of_birth, created_at')
      .eq('id', userId)
      .maybeSingle();
    // A resolved `error` does not throw on the Supabase client, so it is read
    // explicitly — otherwise a denied/failed read is indistinguishable from an
    // adult and the gate silently stops gating.
    if (error) {
      console.error('[age-gate] over_18 read failed, failing open:', error.message);
      return null;
    }
    // Derive from the DATE first — `over_18` is written by a trigger that only
    // fires on a profiles WRITE, so it is a signup-time snapshot that goes
    // stale the day the member turns 18 (and the DOB freeze removes the
    // self-service write that used to recompute it). One implementation, shared
    // with computeMembership, so the two gates can never disagree about an age.
    // ⚠ ABSENCE NO LONGER ADMITS — see membership-core.ts and the header of
    // mustRefuseForAge(). Proof of adulthood is required for accounts created
    // from ADULT_PROOF_REQUIRED_FROM onward; older rows are grandfathered.
    // `created_at` is selected above and is load-bearing.
    if (mustRefuseForAge(data as { date_of_birth?: unknown; over_18?: unknown; created_at?: unknown } | null)) {
      return NextResponse.json(
        { error: 'Shape is for adults 18 and over.', code: 'age_restricted' },
        { status: 403 }
      );
    }
  } catch (e) {
    console.error('[age-gate] over_18 check threw, failing open:', e);
  }
  return null;
}
