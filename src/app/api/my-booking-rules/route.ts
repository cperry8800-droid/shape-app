// Coach-facing booking rules: the buffer between sessions, the daily limit and the minimum
// notice (coach Schedule upgrade, step 3, "Protect your time"; owner-approved 2026-10-07).
//
// GET  ?role=trainer|nutritionist → { rules, providerId, timezone, saved, ready }
// POST { role, bufferMin?, maxPerDay?, minNoticeHours? } → { ok, rules }
//
// Auth exactly as /api/my-availability: the cookie session, the caller's OWN provider row for
// that role, and RLS on provider_booking_rules (owner write) as the second wall.
//
// The rules themselves — what each one means and how a booking is checked against them — live
// in public/newdesign/bookingRules.mjs, the one module every booking surface asks. This route
// only stores the three numbers, validated by that module's `validateRules`, so the form, the
// route and the database's CHECK constraints refuse the same values.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/request-utils';
import { isMissingRelation, providerRole, resolveOwnedProvider } from '@/lib/owned-provider';
import { DEFAULT_RULES, normalizeRules, validateRules } from '../../../../public/newdesign/bookingRules.mjs';

export const dynamic = 'force-dynamic';

// ⚠ BEFORE 2026-10-07-booking-rules-time-off.sql RUNS, A READ ANSWERS WITH THE DEFAULTS AND A
// WRITE IS REFUSED WITH THIS — never a 500, and never a "Saved" over a table that is not there.
const NOT_SET_UP = {
  error: 'not_set_up',
  detail: "Booking rules aren't set up yet. They'll be ready after the next update.",
};

const FIELDS = [
  ['bufferMin', 'buffer_min'],
  ['maxPerDay', 'max_per_day'],
  ['minNoticeHours', 'min_notice_hours'],
] as const;

export async function GET(req: NextRequest) {
  const role = providerRole(new URL(req.url).searchParams.get('role'));
  if (!role) return NextResponse.json({ error: 'invalid role' }, { status: 400 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const owned = await resolveOwnedProvider(supabase, role, user.id);
  if (owned === 'unavailable') return NextResponse.json({ error: 'Booking rules could not be read.' }, { status: 503 });
  if (!owned) return NextResponse.json({ rules: { ...DEFAULT_RULES }, providerId: null, timezone: null, saved: false, ready: true });

  const { data, error } = await supabase
    .from('provider_booking_rules')
    .select('*')
    .eq('provider_role', role)
    .eq('provider_id', owned.id)
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) {
      return NextResponse.json({ rules: { ...DEFAULT_RULES }, providerId: owned.id, timezone: owned.timezone, saved: false, ready: false });
    }
    return NextResponse.json({ error: 'Booking rules could not be read.' }, { status: 503 });
  }
  return NextResponse.json({
    // No row is no rules — today's behaviour — not an error.
    rules: data ? normalizeRules(data) : { ...DEFAULT_RULES },
    providerId: owned.id,
    timezone: owned.timezone,
    saved: !!data,
    ready: true,
  });
}

export async function POST(req: NextRequest) {
  const bodyResult = await readJson<Record<string, unknown>>(req, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data && typeof bodyResult.data === 'object' ? bodyResult.data : {};
  const role = providerRole(body.role ?? new URL(req.url).searchParams.get('role'));
  if (!role) return NextResponse.json({ error: 'invalid role' }, { status: 400 });

  // Validated before anything is read, so a bad value never costs a round trip.
  const sent = FIELDS.filter(([key]) => body[key] !== undefined);
  if (!sent.length) {
    return NextResponse.json({ error: 'invalid_rules', detail: 'Send at least one of bufferMin, maxPerDay or minNoticeHours.' }, { status: 400 });
  }
  const checked = validateRules(body);
  if (!checked.ok) {
    return NextResponse.json({ error: 'invalid_rules', field: checked.field, detail: checked.error }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const owned = await resolveOwnedProvider(supabase, role, user.id);
  if (owned === 'unavailable') return NextResponse.json({ error: 'save_failed' }, { status: 503 });
  if (!owned) return NextResponse.json({ error: 'no provider row' }, { status: 404 });

  // ⚠ ONLY THE FIELDS THAT WERE SENT ARE WRITTEN, AND THAT IS WHAT MAKES THIS SAFE WITHOUT A
  // READ FIRST. An upsert updates exactly the columns in its payload on a conflict, so a form
  // that saves the buffer cannot put back a stale notice another tab changed a second ago — a
  // read-merge-write here would do exactly that. A first save takes the table's defaults for
  // the rest, which are DEFAULT_RULES.
  const row: Record<string, unknown> = {
    provider_role: role,
    provider_id: owned.id,
    updated_at: new Date().toISOString(),
  };
  for (const [key, col] of sent) row[col] = checked.rules[key];

  const { data, error } = await supabase
    .from('provider_booking_rules')
    .upsert(row, { onConflict: 'provider_role,provider_id' })
    .select('*')
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return NextResponse.json(NOT_SET_UP, { status: 503 });
    console.error('[shape-app] save booking rules failed', error);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, rules: normalizeRules(data ?? row) });
}
