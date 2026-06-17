// Provider credential capture (NC1) — a nutrition provider records their
// credential type (RD/RDN vs CNS/nutritionist), CDR id, per-state licenses (with
// expirations), professional liability insurance, and onboarding attestations.
// Owner-scoped (RLS). The licensure-to-client-state matching reads these.
//
// GET  -> { credential, licenses, status }
// POST { credentialType, cdrId?, insuranceCarrier?, insurancePolicy?,
//        insuranceExpires?, attestations?, licenses:[{state,number?,expires?}] }
// Auth: cookie session OR Bearer token.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { CREDENTIAL_TYPES, credentialStatus, REQUIRED_ATTESTATIONS } from '@/lib/compliance/nutrition.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE = /^[A-Za-z]{2}$/;

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);
  const [cred, lic] = await Promise.all([
    supabase.from('provider_credentials').select('*').eq('owner_id', user.id).maybeSingle(),
    supabase.from('provider_licenses').select('state, license_number, expires_on').eq('owner_id', user.id),
  ]);
  const c = (cred.data || null) as Record<string, unknown> | null;
  const licenses = ((lic.data || []) as Array<{ state: string; license_number?: string; expires_on?: string }>)
    .map((l) => ({ state: l.state, number: l.license_number || '', expires: l.expires_on || null }));
  const provider = {
    credentialType: (c?.credential_type as string) || 'nutritionist',
    insuranceExpires: (c?.insurance_expires as string) || null,
    verifiedRd: !!c?.verified_rd,
    licenses,
  };
  return NextResponse.json({ credential: c, licenses, status: credentialStatus(provider), requiredAttestations: REQUIRED_ATTESTATIONS });
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const parsed = await readJson<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const credentialType = String(body.credentialType ?? 'nutritionist').toLowerCase();
  if (!CREDENTIAL_TYPES.includes(credentialType)) {
    return NextResponse.json({ error: 'Invalid credential type.' }, { status: 400 });
  }
  const attestations = (body.attestations && typeof body.attestations === 'object') ? body.attestations as Record<string, boolean> : {};

  const row = {
    owner_id: user.id,
    credential_type: credentialType,
    cdr_id: body.cdrId ? String(body.cdrId).slice(0, 40) : null,
    insurance_carrier: body.insuranceCarrier ? String(body.insuranceCarrier).slice(0, 120) : null,
    insurance_policy: body.insurancePolicy ? String(body.insurancePolicy).slice(0, 80) : null,
    insurance_expires: /^\d{4}-\d{2}-\d{2}$/.test(String(body.insuranceExpires)) ? String(body.insuranceExpires) : null,
    attestations,
    updated_at: new Date().toISOString(),
  };
  const { error: credErr } = await supabase.from('provider_credentials').upsert(row, { onConflict: 'owner_id' });
  if (credErr) {
    console.error('[shape] provider_credentials upsert failed:', credErr.message);
    return NextResponse.json({ error: 'Could not save your credentials.' }, { status: 500 });
  }

  // Replace the license set (states the provider is licensed in).
  if (Array.isArray(body.licenses)) {
    const valid = (body.licenses as Array<Record<string, unknown>>)
      .filter((l) => l && STATE.test(String(l.state || '')))
      .slice(0, 60)
      .map((l) => ({
        owner_id: user.id,
        state: String(l.state).toUpperCase(),
        license_number: l.number ? String(l.number).slice(0, 60) : null,
        expires_on: /^\d{4}-\d{2}-\d{2}$/.test(String(l.expires)) ? String(l.expires) : null,
        updated_at: new Date().toISOString(),
      }));
    // Atomic delete+insert in a single SECURITY DEFINER transaction so a failed
    // insert can never leave the provider with zero licenses (see the
    // replace_provider_licenses migration). owner_id is re-derived from
    // auth.uid() server-side, so RLS stays authoritative.
    const { error: licErr } = await supabase.rpc('replace_provider_licenses', { p_licenses: valid });
    if (licErr) {
      console.error('[shape] provider_licenses replace failed:', licErr.message);
      return NextResponse.json({ error: 'Could not save your licenses.' }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
