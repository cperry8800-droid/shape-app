// Server-side glue for the nutrition compliance controls (NC1). Loads the
// provider's credential/licenses + the client's state, runs the pure gate, audits
// the decision to compliance_events, and tells the caller whether to HARD-block
// (only when NUTRITION_COMPLIANCE_ENFORCE — counsel sign-off). NOT legal advice.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { gateAction, disclaimerFor, complianceEnforced } from '@/lib/compliance/nutrition.mjs';

export type ComplianceProvider = {
  credentialType: string;
  licenses: Array<{ state: string; expires?: string | null }>;
  insuranceExpires?: string | null;
  verifiedRd?: boolean;
};

export async function loadProvider(client: SupabaseClient, ownerId: string): Promise<ComplianceProvider> {
  const [cred, lic] = await Promise.all([
    client.from('provider_credentials').select('credential_type, insurance_expires, verified_rd').eq('owner_id', ownerId).maybeSingle(),
    client.from('provider_licenses').select('state, expires_on').eq('owner_id', ownerId),
  ]);
  const c = (cred.data || {}) as { credential_type?: string; insurance_expires?: string | null; verified_rd?: boolean };
  return {
    credentialType: c.credential_type || 'nutritionist',
    insuranceExpires: c.insurance_expires ?? null,
    verifiedRd: !!c.verified_rd,
    licenses: ((lic.data || []) as Array<{ state: string; expires_on?: string | null }>).map((l) => ({ state: l.state, expires: l.expires_on })),
  };
}

export async function loadClientState(client: SupabaseClient, clientId: string): Promise<string | null> {
  const { data } = await client.from('client_compliance').select('us_state').eq('user_id', clientId).maybeSingle();
  return (data as { us_state?: string } | null)?.us_state || null;
}

export type GateResult = { allowed: boolean; enforced: boolean; scope: string; reason: string; disclaimer: string; clientState: string | null };

// Gate an INDIVIDUALIZED provider action against the client's state + the
// provider's licensure. `allowed` is the compliance verdict; the caller blocks
// only when `enforced` is true. Always audits to compliance_events.
export async function gateProviderAction(opts: {
  client: SupabaseClient;
  ownerId: string;
  clientId: string;
  actionType: string;
}): Promise<GateResult> {
  const provider = await loadProvider(opts.client, opts.ownerId);
  const clientState = await loadClientState(opts.client, opts.clientId);
  const verdict = gateAction(provider, clientState, opts.actionType);
  const enforced = complianceEnforced(process.env);
  const disclaimer = disclaimerFor(verdict.scope, verdict.allowed);
  try {
    await createAdminClient().from('compliance_events').insert({
      actor_id: opts.ownerId,
      subject_user_id: opts.clientId,
      event: verdict.allowed ? 'individualized_write' : 'match_blocked',
      detail: { actionType: opts.actionType, reason: verdict.reason, scope: verdict.scope, clientState, enforced },
    });
  } catch {
    /* best-effort audit; never blocks the action path */
  }
  return { allowed: verdict.allowed, enforced, scope: verdict.scope, reason: verdict.reason, disclaimer, clientState };
}

// A human-readable reason for a blocked individualized match.
export function blockMessage(reason: string): string {
  switch (reason) {
    case 'not_licensed_in_client_state': return "You aren't licensed in this client's state, so you can't provide an individualized nutrition plan to them. They can still get general wellness guidance.";
    case 'client_state_unknown': return "This client hasn't set their state yet — an individualized nutrition plan can't be provided until licensure is confirmed.";
    case 'unlicensed_general_only': return 'Individualized (clinical) nutrition plans require a licensed dietitian. As a nutritionist you can share general wellness guidance only.';
    case 'insurance_expired': return 'Your professional liability insurance on file has expired — renew it to provide individualized nutrition plans.';
    default: return 'This individualized nutrition action is not permitted under the current compliance check.';
  }
}
