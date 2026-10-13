// Whether the signed-in account is on the Shape team, and at which level, so the app's Settings
// can show staff a way into the admin console. Cookie session (website) or Bearer token (the
// installed app), like /api/coach/listing.
//
// ⚠ THIS GRANTS NOTHING. It answers with the level alone; the console itself needs a website
// sign-in and two-factor (src/lib/staff-two-factor.mjs), whoever holds this answer.
// GET -> { level: 'owner' | 'admin' | 'support' | 'analyst' | null }

import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/request-auth';
import { staffLevelOf } from '@/lib/admin-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' };

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ level: null }, { headers: NO_STORE });
  return NextResponse.json({ level: await staffLevelOf(user) }, { headers: NO_STORE });
}
