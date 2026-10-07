// Coach-facing time off: block a vacation or an afternoon, and booking is closed for it
// (coach Schedule upgrade, step 3, "Protect your time"; owner-approved 2026-10-07).
//
// GET    ?role=trainer|nutritionist → { timeOff: [{ id, startsAt, endsAt, note }], providerId,
//        timezone, capped, ready } — everything still to come, plus the last 30 days
// POST   { role, startsAt, endsAt, note? }        two ISO instants, each WITH an offset
//        { role, date, allDay: true, note? }     one whole day in the coach's zone
//        { role, fromDate, toDate, note? }       whole days, both inclusive
//        → { ok, timeOff, overlapping }
// DELETE { role, id }  (or ?role=&id=) → { ok, id }
//
// Auth exactly as /api/my-availability: the cookie session, the caller's OWN provider row for
// that role, and RLS on provider_time_off (owner-only, every command) as the second wall. The
// note is private and never leaves this route; members learn only THAT the coach is away, from
// provider_busy_blocks.
//
// ⚠ WHOLE DAYS ARE RESOLVED HERE, ONCE, IN THE COACH'S STORED ZONE, and stored as instants.
// The parsing is bookingRules.mjs's `parseTimeOff`, the same module that later reads the block
// back, so "Oct 12 off" is one span of real time to every reader instead of a date each reader
// has to place. A coach with no stored zone is refused whole days (timezone_required, as
// /api/my-availability refuses hours) — and is never read as UTC.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/request-utils';
import { isMissingRelation, providerRole, resolveOwnedProvider } from '@/lib/owned-provider';
import { parseTimeOff } from '../../../../public/newdesign/bookingRules.mjs';

export const dynamic = 'force-dynamic';

const NOT_SET_UP = {
  error: 'not_set_up',
  detail: "Time off isn't set up yet. It'll be ready after the next update.",
};

// How far back the list reaches, and how many blocks it returns.
const PAST_DAYS = 30;
const READ_CAP = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TimeOffRow = { id: string; starts_at: string; ends_at: string; note: string | null };
const shape = (r: TimeOffRow) => ({ id: r.id, startsAt: r.starts_at, endsAt: r.ends_at, note: r.note ?? null });

export async function GET(req: NextRequest) {
  const role = providerRole(new URL(req.url).searchParams.get('role'));
  if (!role) return NextResponse.json({ error: 'invalid role' }, { status: 400 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const owned = await resolveOwnedProvider(supabase, role, user.id);
  if (owned === 'unavailable') return NextResponse.json({ error: 'Time off could not be read.' }, { status: 503 });
  if (!owned) return NextResponse.json({ timeOff: [], providerId: null, timezone: null, capped: false, ready: true });

  const since = new Date(Date.now() - PAST_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('provider_time_off')
    .select('id, starts_at, ends_at, note')
    .eq('provider_role', role)
    .eq('provider_id', owned.id)
    .gte('ends_at', since)
    // ⚠ NEWEST FIRST, RE-SORTED ASCENDING BELOW: past the cap this keeps the blocks furthest
    // ahead rather than last month's, and says so with `capped` instead of passing a cut list
    // off as the whole one (tests/capped-reads.test.mjs).
    .order('starts_at', { ascending: false })
    .limit(READ_CAP);
  if (error) {
    if (isMissingRelation(error)) {
      return NextResponse.json({ timeOff: [], providerId: owned.id, timezone: owned.timezone, capped: false, ready: false });
    }
    return NextResponse.json({ error: 'Time off could not be read.' }, { status: 503 });
  }
  const rows = ((data ?? []) as TimeOffRow[])
    .slice()
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  return NextResponse.json({
    timeOff: rows.map(shape),
    providerId: owned.id,
    timezone: owned.timezone,
    capped: rows.length >= READ_CAP,
    ready: true,
  });
}

export async function POST(req: NextRequest) {
  const bodyResult = await readJson<Record<string, unknown>>(req);
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data && typeof bodyResult.data === 'object' ? bodyResult.data : {};
  const role = providerRole(body.role ?? new URL(req.url).searchParams.get('role'));
  if (!role) return NextResponse.json({ error: 'invalid role' }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const owned = await resolveOwnedProvider(supabase, role, user.id);
  if (owned === 'unavailable') return NextResponse.json({ error: 'save_failed' }, { status: 503 });
  if (!owned) return NextResponse.json({ error: 'no provider row' }, { status: 404 });

  const parsed = parseTimeOff(body, { zone: owned.timezone, now: Date.now() });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error, detail: parsed.detail }, { status: 400 });
  const startsAt = new Date(parsed.startsAt).toISOString();
  const endsAt = new Date(parsed.endsAt).toISOString();

  const { data, error } = await supabase
    .from('provider_time_off')
    .insert({ provider_role: role, provider_id: owned.id, starts_at: startsAt, ends_at: endsAt, note: parsed.note })
    .select('id, starts_at, ends_at, note')
    .single();
  if (error) {
    if (isMissingRelation(error)) return NextResponse.json(NOT_SET_UP, { status: 503 });
    console.error('[shape-app] insert time off failed', error);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }

  // ── Sessions already inside the new block ──────────────────────────────────────────────
  // ⚠ TIME OFF CLOSES BOOKING; IT DOES NOT CANCEL ANYTHING. A member who already holds a slot
  // in the coach's vacation still holds it, and silently cancelling it would be the worse
  // surprise. So the count comes back for the Schedule to say "you still have 2 sessions in
  // this time", and moving or cancelling them stays the coach's call. Best-effort: a failed
  // read answers null ("unknown"), never 0, which would read as "nothing to worry about".
  let overlapping: number | null = null;
  const { data: inside, error: insideError } = await supabase
    .from('sessions')
    .select('id, scheduled_at, duration_min')
    .eq('provider_role', role)
    .eq('provider_id', owned.id)
    .in('status', ['requested', 'confirmed'])
    .gte('scheduled_at', new Date(parsed.startsAt - 86_400_000).toISOString())
    .lt('scheduled_at', endsAt);
  if (!insideError) {
    overlapping = ((inside ?? []) as { scheduled_at: string; duration_min: number | null }[]).filter((s) => {
      const at = new Date(s.scheduled_at).getTime();
      const len = (Number(s.duration_min) > 0 ? Number(s.duration_min) : 60) * 60_000;
      return at < parsed.endsAt && at + len > parsed.startsAt;
    }).length;
  }

  return NextResponse.json({ ok: true, timeOff: shape(data as TimeOffRow), overlapping });
}

export async function DELETE(req: NextRequest) {
  const bodyResult = await readJson<Record<string, unknown>>(req, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data && typeof bodyResult.data === 'object' ? bodyResult.data : {};
  const params = new URL(req.url).searchParams;
  const role = providerRole(body.role ?? params.get('role'));
  if (!role) return NextResponse.json({ error: 'invalid role' }, { status: 400 });
  const id = String(body.id ?? params.get('id') ?? '').trim();
  if (!UUID.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const owned = await resolveOwnedProvider(supabase, role, user.id);
  if (owned === 'unavailable') return NextResponse.json({ error: 'delete_failed' }, { status: 503 });
  if (!owned) return NextResponse.json({ error: 'no provider row' }, { status: 404 });

  // ⚠ SCOPED TO THE CALLER'S PROVIDER IN THE QUERY, NOT ONLY BY RLS. RLS is the wall; the
  // filter is what makes "not yours" answer 404 rather than a success that deleted nothing.
  const { data, error } = await supabase
    .from('provider_time_off')
    .delete()
    .eq('id', id)
    .eq('provider_role', role)
    .eq('provider_id', owned.id)
    .select('id');
  if (error) {
    if (isMissingRelation(error)) return NextResponse.json(NOT_SET_UP, { status: 503 });
    console.error('[shape-app] delete time off failed', error);
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
  }
  if (!data || (data as unknown[]).length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true, id });
}
