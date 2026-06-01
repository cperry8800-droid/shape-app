// War Room snapshot API — admin-gated. The /warroom page polls this to refresh
// the live service pings + config status without a full reload.
//
// Returns booleans / counts / statuses only — no secret values.

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/admin-access';
import { buildWarRoomSnapshot } from '@/lib/warroom';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdminUser();
  } catch {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  const snapshot = await buildWarRoomSnapshot();
  return NextResponse.json(snapshot, { headers: { 'cache-control': 'no-store, max-age=0' } });
}
