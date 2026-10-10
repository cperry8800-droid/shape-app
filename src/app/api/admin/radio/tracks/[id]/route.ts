// One song in Nora's library. PATCH with { confirm: true, analysis } is step 3 of an upload (the
// file is checked in storage and the song becomes ready); PATCH with fields edits it; DELETE
// removes the file and the row. The work is in src/lib/radio/libraryStore.mjs.

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/admin-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { confirmTrack, deleteTrack, editTrack } from '@/lib/radio/libraryStore.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store, max-age=0' };

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminUser();
  } catch {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }
  const { id } = await params;
  let input: Record<string, unknown>;
  try {
    const body = await request.json();
    input = body && typeof body === 'object' ? body : {};
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  const db = createAdminClient();
  const r = input.confirm === true ? await confirmTrack(db, id, input) : await editTrack(db, id, input);
  return NextResponse.json(r.body, { status: r.status, headers: NO_STORE });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminUser();
  } catch {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }
  const { id } = await params;
  const r = await deleteTrack(createAdminClient(), id);
  return NextResponse.json(r.body, { status: r.status, headers: NO_STORE });
}
