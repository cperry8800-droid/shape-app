// Client compliance profile (NC1) — the client records their US state (used for
// the provider licensure-to-client-state match) and their consent to share their
// record across disciplines (trainer ⇄ nutrition provider). Owner-scoped (RLS).
//
// GET  -> { state, crossDisciplineConsent, consentAt }
// POST { state?, crossDisciplineConsent? } -> { ok, state, crossDisciplineConsent }
// Auth: cookie session OR Bearer token.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMembership } from '@/lib/require-membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE = /^[A-Za-z]{2}$/;

export async function GET(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);
  const { data } = await supabase
    .from('client_compliance')
    .select('us_state, cross_discipline_consent, consent_at')
    .eq('user_id', user.id)
    .maybeSingle();
  const row = (data || null) as { us_state?: string; cross_discipline_consent?: boolean; consent_at?: string } | null;
  return NextResponse.json({
    state: row?.us_state || null,
    crossDisciplineConsent: !!row?.cross_discipline_consent,
    consentAt: row?.consent_at || null,
  });
}

export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const parsed = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const patch: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() };
  let state: string | null = null;
  if (body.state !== undefined) {
    const raw = String(body.state || '').trim();
    if (raw && !STATE.test(raw)) {
      return NextResponse.json({ error: 'State must be a 2-letter US state code.' }, { status: 400 });
    }
    state = raw ? raw.toUpperCase() : null;
    patch.us_state = state;
  }
  let consent: boolean | undefined;
  if (body.crossDisciplineConsent !== undefined) {
    consent = !!body.crossDisciplineConsent;
    patch.cross_discipline_consent = consent;
    patch.consent_at = consent ? new Date().toISOString() : null;
  }

  const { data, error } = await supabase
    .from('client_compliance')
    .upsert(patch, { onConflict: 'user_id' })
    .select('us_state, cross_discipline_consent')
    .single();
  if (error) {
    console.error('[shape] client_compliance upsert failed:', error.message);
    return NextResponse.json({ error: 'Could not save your compliance profile.' }, { status: 500 });
  }

  // Audit the consent / state change (best-effort; service role so the subject
  // is the actor here, which the RLS read policy allows them to see).
  try {
    await createAdminClient().from('compliance_events').insert({
      actor_id: user.id,
      subject_user_id: user.id,
      event: 'client_compliance_set',
      detail: { state: state ?? undefined, crossDisciplineConsent: consent },
    });
  } catch {
    /* best-effort */
  }

  const out = (data || {}) as { us_state?: string; cross_discipline_consent?: boolean };
  return NextResponse.json({ ok: true, state: out.us_state || null, crossDisciplineConsent: !!out.cross_discipline_consent });
}
