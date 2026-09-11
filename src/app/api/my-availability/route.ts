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
  // ⚠ THE ORDER IS DELETE → STAMP → INSERT, AND IT IS CHOSEN SO THAT NOTHING NEEDS UNDOING.
  // The zone and the hours are one fact split across two tables, so a failure between them
  // can leave stored hours whose meaning has silently moved. Every single-step failure in
  // THIS order is self-consistent:
  //
  //   delete fails  → nothing stamped; the old hours keep the old zone.
  //   stamp fails   → the hours are gone, the old zone stands; no hours to misread.
  //   insert fails  → the hours are gone, the new zone stands; no hours to misread.
  //
  // "No hours" is always safe — every reader renders it as "no open hours set" — whereas
  // hours read in the wrong zone is the exact defect this whole change exists to remove.
  //
  // ⚠ AN EARLIER CUT STAMPED FIRST AND ROLLED THE STAMP BACK ON FAILURE, AND THE ROLLBACK
  // WAS ITSELF A WRONG-TIME BUG — CodeRabbit's P1 on #2053. It restored the prior zone on
  // `id` alone, so: request A stamps Los Angeles and its insert fails; request B then saves
  // successfully under Los Angeles; A's rollback restores New York and B's just-saved hours
  // are read three hours out. The editor POSTs on EVERY cell toggle with no debounce, so
  // concurrent saves from one coach are ordinary rather than exotic. Reordering deletes the
  // rollback instead of trying to make it safe — there is nothing to undo.
  //
  // ⚠ AND A CONCURRENT SAVE CANNOT REOPEN IT, because both requests carry the SAME resolved
  // browser zone: if A is changing the zone then B is changing it to the same value, so
  // whichever lands, the stored zone matches both requests' intent. The one residual is a
  // coach saving from two machines in different zones at the same instant, which is
  // inherently ambiguous rather than a bug in this ordering. Full atomicity would need an
  // RPC, i.e. a second migration for the owner to run; it is registered as belt-and-braces
  // rather than required, because no single failure here can produce a wrong time.
  const { error: delError } = await supabase
    .from('provider_availability')
    .delete()
    .eq('provider_role', role)
    .eq('provider_id', owned.id);
  if (delError) {
    console.error('[shape-app] delete availability failed', delError);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }

  // Stamp only on a real change: the coach moved, or this is the first save. An
  // unconditional write would touch the row on every toggle for no reason.
  if (sentZone && sentZone !== owned.timezone) {
    const { error: tzError } = await supabase
      .from(table)
      .update({ timezone: sentZone })
      .eq('id', owned.id);
    // ⚠ FAIL THE SAVE, do not press on. Hours written under a zone we could not commit to
    // are hours nothing can place — and pre-migration this is the branch that reports the
    // column is missing instead of writing orphan hours.
    if (tzError) {
      console.error('[shape-app] stamp availability timezone failed', tzError);
      return NextResponse.json({ error: 'save_failed' }, { status: 500 });
    }
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
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, count: rows.length, timezone: zone });
}
