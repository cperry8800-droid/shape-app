// Hourly: reopen every coach whose resume date has passed, and tell their waiting list
// (src/lib/capacity-reopen.ts; client-onboarding task #10, Codex on #2375).
// Auth: x-cron-secret: <CRON_SECRET> OR Authorization: Bearer <CRON_SECRET>.
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createPreferredNotification } from '@/lib/notify';
import { reopenDueListings } from '@/lib/capacity-reopen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || ''));
  return x.length === y.length && timingSafeEqual(x, y);
}
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return false;
  return safeEqual(req.headers.get('x-cron-secret') || '', secret)
    || safeEqual(req.headers.get('authorization') || '', `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const result = await reopenDueListings(createAdminClient(), createPreferredNotification);
    return NextResponse.json({ ok: result.failed === 0, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 200 });
  }
}
