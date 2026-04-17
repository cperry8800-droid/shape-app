// Provider application endpoint (trainer / nutritionist).
// Accepts a JSON body with core identifying fields + a free-form `details`
// object for the rest of the intake. Inserts into public.provider_applications.
//
// Called by public/signup-trainer.html and public/signup-nutritionist.html.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const MAX_TEXT = 500;
const MAX_LONG = 10000;

function clean(v: unknown, max = MAX_TEXT): string {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function sanitizeDetails(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [rawKey, rawVal] of Object.entries(input as Record<string, unknown>)) {
    if (typeof rawKey !== 'string' || !rawKey) continue;
    const key = rawKey.slice(0, 100);
    if (rawVal == null) continue;
    if (typeof rawVal === 'string') {
      out[key] = rawVal.trim().slice(0, MAX_LONG);
    } else if (typeof rawVal === 'number' || typeof rawVal === 'boolean') {
      out[key] = String(rawVal);
    }
    if (Object.keys(out).length >= 100) break;
  }
  return out;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const providerTypeRaw = clean(body.providerType, 20).toLowerCase();
  if (providerTypeRaw !== 'trainer' && providerTypeRaw !== 'nutritionist') {
    return NextResponse.json(
      { error: 'providerType must be "trainer" or "nutritionist".' },
      { status: 400 }
    );
  }

  const firstName = clean(body.firstName, 100);
  const lastName = clean(body.lastName, 100);
  const email = clean(body.email, 200).toLowerCase();
  const phone = clean(body.phone, 40);
  const location = clean(body.location, 200);
  const specialty = clean(body.specialty, 200);
  const yearsExperience = clean(body.yearsExperience, 40);
  const monthlyPrice = clean(body.monthlyPrice, 40);
  const details = sanitizeDetails(body.details);

  if (!firstName || !lastName || !email) {
    return NextResponse.json(
      { error: 'First name, last name, and email are required.' },
      { status: 400 }
    );
  }
  if (!isEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('provider_applications')
    .insert({
      provider_type: providerTypeRaw,
      first_name: firstName,
      last_name: lastName,
      email,
      phone: phone || null,
      location: location || null,
      specialty: specialty || null,
      years_experience: yearsExperience || null,
      monthly_price: monthlyPrice || null,
      details,
      user_agent: req.headers.get('user-agent') || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('provider_applications insert failed:', error);
    return NextResponse.json(
      { error: 'Could not submit your application. Please email hello@shape.app directly.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, id: data?.id });
}
