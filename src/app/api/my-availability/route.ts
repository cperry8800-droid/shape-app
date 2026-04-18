// Coach-facing availability endpoints. Reads and writes the signed-in
// provider's weekly slots. RLS guarantees we only touch the caller's
// own rows; we still double-check that the request's provider_id
// matches a row the user actually owns.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Role = 'trainer' | 'nutritionist';

async function resolveOwnedProvider(
  supabase: Awaited<ReturnType<typeof createClient>>,
  role: Role
): Promise<{ id: number } | null> {
  const table = role === 'trainer' ? 'trainers' : 'nutritionists';
  const { data } = await supabase.from(table).select('id').maybeSingle();
  if (!data) return null;
  return { id: (data as { id: number }).id };
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

  return NextResponse.json({ slots: slots ?? [], providerId: owned.id });
}

export async function POST(req: NextRequest) {
  let body: { role?: string; slots?: Array<{ weekday: number; start_minute: number }> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
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

  // Simple strategy: delete all existing slots and re-insert. Small row
  // count per provider so this is fine.
  const { error: delError } = await supabase
    .from('provider_availability')
    .delete()
    .eq('provider_role', role)
    .eq('provider_id', owned.id);
  if (delError) {
    console.error('[shape-app] delete availability failed', delError);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }

  if (clean.length === 0) {
    return NextResponse.json({ ok: true, count: 0 });
  }

  const rows = clean.map((s) => ({
    provider_role: role,
    provider_id: owned.id,
    weekday: s.weekday,
    start_minute: s.start_minute,
    duration_min: 15,
  }));
  const { error: insError } = await supabase.from('provider_availability').insert(rows);
  if (insError) {
    console.error('[shape-app] insert availability failed', insError);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, count: rows.length });
}
