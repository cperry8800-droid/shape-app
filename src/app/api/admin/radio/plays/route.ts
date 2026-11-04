// Every song played in a month, each with its performances, as CSV, for the SoundExchange report of
// use (src/lib/radio/noraEngineApi.mjs playsCsv); with `&summary=1`, the month's totals in one row
// (playsSummaryCsv: its performances and listening hours). Admin only.

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/admin-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { playsCsv, playsSummaryCsv } from '@/lib/radio/noraEngineApi.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminUser();
  } catch {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }
  const params = new URL(request.url).searchParams;
  const month = params.get('month') ?? '';
  const summary = params.get('summary') === '1';
  const r = await (summary ? playsSummaryCsv : playsCsv)(createAdminClient(), month);
  if (r.status !== 200) return new NextResponse(String(r.body), { status: r.status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  return new NextResponse(String(r.body), {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="shape-radio-${summary ? 'totals' : 'plays'}-${month}.csv"`,
      'cache-control': 'no-store, max-age=0',
    },
  });
}
