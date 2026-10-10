// Nora's library (the songs her DJ sets are built from): the admin's list, and step 1 of an
// upload, which records the song as pending and hands back a signed upload URL so the file goes
// straight to the private `radio-library` bucket. The work is in src/lib/radio/libraryStore.mjs.

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/admin-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { createTrack, listTracks } from '@/lib/radio/libraryStore.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store, max-age=0' };

export async function GET() {
  try {
    await requireAdminUser();
  } catch {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }
  const r = await listTracks(createAdminClient());
  return NextResponse.json(r.body, { status: r.status, headers: NO_STORE });
}

export async function POST(request: Request) {
  let admin: { id: string; email: string };
  try {
    admin = await requireAdminUser();
  } catch {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  const r = await createTrack(createAdminClient(), input, { userId: admin.id, newId: () => crypto.randomUUID() });
  return NextResponse.json(r.body, { status: r.status, headers: NO_STORE });
}
