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
  const [cred, lic, tr, nu] = await Promise.all([
    supabase.from('provider_credentials').select('*').eq('owner_id', user.id).maybeSingle(),
    supabase.from('provider_licenses').select('state, license_number, expires_on').eq('owner_id', user.id),
    supabase.from('trainers').select('verified, verified_at').eq('owner_id', user.id).maybeSingle(),
    supabase.from('nutritionists').select('verified, verified_at').eq('owner_id', user.id).maybeSingle(),
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
  // The PUBLIC "✓ Verified" badge state lives on the marketplace coach row(s) the
  // admin approval mirrors onto (a coach may hold both roles).
  const trRow = (tr.data || null) as { verified?: boolean; verified_at?: string } | null;
  const nuRow = (nu.data || null) as { verified?: boolean; verified_at?: string } | null;
  const verified = !!(trRow?.verified || nuRow?.verified);
  // Only expose coach-facing credential fields — never admin-only columns
  // (reviewed_by, review_notes, *_path, etc.); the review state is surfaced
  // through the derived `review` object below.
  const credential = c ? {
    credentialType: (c.credential_type as string) || null,
    cdrId: (c.cdr_id as string) || null,
    insuranceCarrier: (c.insurance_carrier as string) || null,
    insurancePolicy: (c.insurance_policy as string) || null,
    insuranceExpires: (c.insurance_expires as string) || null,
    attestations: (c.attestations as Record<string, boolean>) || {},
  } : null;
  return NextResponse.json({
    credential,
    licenses,
    status: credentialStatus(provider),
    requiredAttestations: REQUIRED_ATTESTATIONS,
    review: {
      status: (c?.review_status as string) || 'none',
      submittedAt: (c?.submitted_at as string) || null,
      reviewedAt: (c?.reviewed_at as string) || null,
      notes: (c?.review_notes as string) || null,
      hasCoi: !!c?.insurance_coi_path,
      certCount: Array.isArray(c?.cert_files) ? (c!.cert_files as unknown[]).length : 0,
    },
    verified,
    verifiedAt: trRow?.verified_at || nuRow?.verified_at || null,
  });
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const parsed = await readJson<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // Submit the (already-uploaded) documents for admin review. Role-agnostic — a
  // trainer or nutritionist flips their credential row to `pending`; the admin
  // queue (/dashboard/credentials) picks it up and mirrors the verified flag onto
  // the marketplace row on approval.
  if (body.action === 'submit') {
    const { error } = await supabase
      .from('provider_credentials')
      .upsert(
        { owner_id: user.id, review_status: 'pending', submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { onConflict: 'owner_id' }
      );
    if (error) {
      console.error('[shape] credential submit failed:', error.message);
      return NextResponse.json({ error: 'Could not submit for review.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, review: 'pending' });
  }

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
