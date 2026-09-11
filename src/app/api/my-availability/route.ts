// Coach-facing availability endpoints. Reads and writes the signed-in
// provider's weekly slots. RLS guarantees we only touch the caller's
// own rows; we still double-check that the request's provider_id
// matches a row the user actually owns.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/request-utils';
import { normalizeZone } from '@/lib/time';

export const dynamic = 'force-dynamic';

type Role = 'trainer' | 'nutritionist';

// ⚠ `select('*')` IS MIGRATION-SAFE AND THAT IS WHY IT IS NOT `select('id, timezone')`.
// Naming a column PostgREST does not know errors the WHOLE query on a pre-migration
// database, so a deploy that lands before 2026-09-11-provider-timezone.sql is applied
// would stop a coach editing their hours at all rather than merely not knowing their
// zone. The house pattern (trainer/dashboard, trainer/analytics) for the same reason.
async function resolveOwnedProvider(
  supabase: Awaited<ReturnType<typeof createClient>>,
  role: Role
): Promise<{ id: number; timezone: string | null } | null> {
  const table = role === 'trainer' ? 'trainers' : 'nutritionists';
  const { data } = await supabase.from(table).select('*').maybeSingle();
  if (!data) return null;
  const row = data as { id: number; timezone?: unknown };
  return { id: row.id, timezone: normalizeZone(row.timezone) };
}

export async function GET(req: NextRequest) {
  const role = (new URL(req.url).searchParams.get('role') ?? '').toLowerCase() as Role;
  if (role !== 'trainer' && role !== 'nutritionist') {
    return NextResponse.json({ error: 'invalid role' }, { status: 400 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const owned = await resolveOwnedProvider(supabase, role);
  if (!owned) return NextResponse.json({ slots: [], providerId: null });

  const { data: slots } = await supabase
    .from('provider_availability')
    .select('weekday, start_minute, duration_min')
    .eq('provider_role', role)
    .eq('provider_id', owned.id)
    .order('weekday', { ascending: true })
    .order('start_minute', { ascending: true });

  return NextResponse.json({ slots: slots ?? [], providerId: owned.id, timezone: owned.timezone });
}

export async function POST(req: NextRequest) {
  const bodyResult = await readJson<{ role?: string; timezone?: unknown; slots?: Array<{ weekday: number; start_minute: number; duration_min?: number }> }>(req, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const role = (body.role ?? '').toLowerCase() as Role;
  if (role !== 'trainer' && role !== 'nutritionist') {
    return NextResponse.json({ error: 'invalid role' }, { status: 400 });
  }
  const slots = Array.isArray(body.slots) ? body.slots : [];
  const clean = slots
    .filter(
      (s) =>
        typeof s.weekday === 'number' &&
        s.weekday >= 0 &&
        s.weekday <= 6 &&
        typeof s.start_minute === 'number' &&
        s.start_minute >= 0 &&
        s.start_minute <= 1439
    )
    .slice(0, 500);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const owned = await resolveOwnedProvider(supabase, role);
  if (!owned) return NextResponse.json({ error: 'no provider row' }, { status: 404 });

  // ── The zone these hours are expressed in ──────────────────────────────────
  //
  // ⚠ A SAVE THAT CANNOT RESOLVE A ZONE IS REFUSED, NOT ACCEPTED. start_minute is a
  // bare wall-clock minute, so without a zone it is an hour nothing can place: the
  // readers are now honest about that and offer the coach NO bookable slots. Writing
  // the hours anyway would tell a coach their availability is live ("Saved · live on
  // your profile") while every member sees none, with nothing on either screen saying
  // why. Refusing is recoverable in one reload; the silent version is not.
  //
  // The editor sends its own resolved Intl zone. A client too old to send one is only
  // refused if the coach has no stored zone either — so a coach who has saved once is
  // never locked out by a stale page.
  const sentZone = normalizeZone(body.timezone);
  const zone = sentZone ?? owned.timezone;
  if (!zone) {
    return NextResponse.json(
      { error: 'timezone_required', detail: 'Availability hours are stored in your local time, so we need your timezone before saving them. Reload the page and try again.' },
      { status: 400 }
    );
  }
  const table = role === 'trainer' ? 'trainers' : 'nutritionists';

  // ── Two tables, one meaning, and no transaction between them ────────────────
  //
  // ⚠ THE ZONE AND THE HOURS ARE ONE FACT SPLIT ACROSS TWO WRITES, so a failure between
  // them leaves stored hours whose meaning has silently moved. Flagged by CodeRabbit on
  // #2053, and the sharp case is the DELETE failing after the stamp landed: a coach who
  // moved New York → Los Angeles then has their EXISTING 9am-Eastern hours read as
  // 9am-Pacific — a three-hour shift, published to members, while the save reports failure
  // and the coach believes nothing changed.
  //
  // PostgREST gives no cross-table transaction, and an RPC would mean a second migration
  // for the owner to run. So the stamp is COMPENSATED instead: it goes first (hours are
  // never written under a zone we have not committed to), and any later failure restores
  // the zone the row had before. That makes both failure modes safe —
  //   delete fails  → zone restored, old hours keep their old meaning;
  //   insert fails  → zone restored and the slots are gone, so the coach has no hours
  //                   rather than misread ones, and the editor already says the save failed.
  const priorZone: string | null = owned.timezone;
  const stamped = !!sentZone && sentZone !== priorZone;
  if (stamped) {
    const { error: tzError } = await supabase
      .from(table)
      .update({ timezone: sentZone })
      .eq('id', owned.id);
    // ⚠ FAIL THE SAVE, do not press on. If the stamp did not land, the hours about to
    // be written are unreadable for exactly the reason above — and pre-migration this
    // is the branch that reports the column is missing instead of writing orphan hours.
    if (tzError) {
      console.error('[shape-app] stamp availability timezone failed', tzError);
      return NextResponse.json({ error: 'save_failed' }, { status: 500 });
    }
  }

  // Undo the stamp when a later write fails, so a half-applied save cannot change what
  // the coach's stored hours MEAN. Best-effort by necessity — if the compensating write
  // also fails there is nothing left to try — so it is logged loudly rather than silently
  // swallowed, because that is the one path that can leave the two tables disagreeing.
  const unstamp = async () => {
    if (!stamped) return;
    const { error } = await supabase
      .from(table)
      .update({ timezone: priorZone })
      .eq('id', owned.id);
    if (error) {
      console.error(
        '[shape-app] CRITICAL: could not roll back availability timezone — stored hours may now be read in the wrong zone',
        { providerRole: role, providerId: owned.id, priorZone, sentZone, error }
      );
    }
  };

  // Simple strategy: delete all existing slots and re-insert. Small row
  // count per provider so this is fine.
  const { error: delError } = await supabase
    .from('provider_availability')
    .delete()
    .eq('provider_role', role)
    .eq('provider_id', owned.id);
  if (delError) {
    console.error('[shape-app] delete availability failed', delError);
    await unstamp();
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }

  if (clean.length === 0) {
    // Clearing every hour is a real intent, and the zone stays stamped: it describes the
    // coach, not the rows, and it is what their next save will be read against.
    return NextResponse.json({ ok: true, count: 0, timezone: zone });
  }

  const rows = clean.map((s) => {
    // Honor the block duration the editor sends (contiguous hours collapse into
    // {start_minute, duration_min}). Clamp to the rest of the day; default to a
    // single hour when absent or invalid. Storing the real duration is what
    // makes multi-hour blocks render correctly on the marketplace profile and
    // round-trip back into the editor (it expands duration_min into hour cells).
    const dur =
      typeof s.duration_min === 'number' && s.duration_min >= 15
        ? Math.min(Math.round(s.duration_min), 1440 - s.start_minute)
        : 60;
    return {
      provider_role: role,
      provider_id: owned.id,
      weekday: s.weekday,
      start_minute: s.start_minute,
      duration_min: dur,
    };
  });
  const { error: insError } = await supabase.from('provider_availability').insert(rows);
  if (insError) {
    console.error('[shape-app] insert availability failed', insError);
    await unstamp();
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, count: rows.length, timezone: zone });
}
