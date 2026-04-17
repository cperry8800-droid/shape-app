// Client intake endpoint.
// Called from signup-client.html immediately after shapeDb.signUp() returns
// a session. Stores onboarding questionnaire into public.client_intakes
// keyed to the authenticated user.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const MAX_TEXT = 2000;
const MAX_LONG = 10000;

function clean(v: unknown, max = MAX_TEXT): string {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function cleanDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  if (Number.isNaN(Date.parse(s))) return null;
  return s;
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

  // Accept either cookie-based auth (Next.js flow) or an Authorization
  // Bearer access_token (legacy /public/*.html flow where supabase-js keeps
  // the session in localStorage, not cookies).
  let userId: string;
  let authedSupabase: SupabaseClient;

  const authHeader = req.headers.get('authorization') || '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    const token = bearerMatch[1];
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 });
    }
    const tokenClient = createSupabaseClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await tokenClient.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }
    userId = userData.user.id;
    authedSupabase = tokenClient;
  } else {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }
    userId = userData.user.id;
    authedSupabase = supabase;
  }

  const row = {
    user_id: userId,
    first_name: clean(body.firstName, 100) || null,
    last_name: clean(body.lastName, 100) || null,
    dob: cleanDate(body.dob),
    sex: clean(body.sex, 40) || null,
    primary_goal: clean(body.goal, 100) || null,
    experience_level: clean(body.level, 100) || null,
    workout_frequency: clean(body.frequency, 100) || null,
    injuries: clean(body.injuries, 5000) || null,
    medical: clean(body.medical, 5000) || null,
    dietary: clean(body.dietary, 5000) || null,
    emergency_contact: clean(body.emergencyContact, 500) || null,
    accountability_style: clean(body.accountability, 200) || null,
    interests: clean(body.interests, 1000) || null,
    budget: clean(body.budget, 100) || null,
    details: sanitizeDetails(body.details),
  };

  const { error } = await authedSupabase
    .from('client_intakes')
    .upsert(row, { onConflict: 'user_id' });

  if (error) {
    console.error('client_intakes upsert failed:', error);
    return NextResponse.json(
      { error: 'Could not save your intake.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
