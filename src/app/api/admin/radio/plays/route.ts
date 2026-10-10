// Every song Nora played in a month, as CSV, for the SoundExchange report of use
// (src/lib/radio/noraEngineApi.mjs playsCsv). Admin only.

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/admin-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { playsCsv } from '@/lib/radio/noraEngineApi.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminUser();
  } catch {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }
  const month = new URL(request.url).searchParams.get('month') ?? '';
  const r = await playsCsv(createAdminClient(), month);
  if (r.status !== 200) return new NextResponse(String(r.body), { status: r.status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  return new NextResponse(String(r.body), {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="nora-plays-${month}.csv"`,
      'cache-control': 'no-store, max-age=0',
    },
  });
}
