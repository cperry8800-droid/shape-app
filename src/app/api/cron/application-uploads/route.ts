// Daily: remove coach application uploads that never became an application
// (src/lib/application-upload-cleanup.ts).
// Auth: x-cron-secret: <CRON_SECRET> OR Authorization: Bearer <CRON_SECRET>.
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { removeAbandonedApplicationUploads } from '@/lib/application-upload-cleanup';

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
    // The admin client's types are wider than the cleanup needs; it uses list, remove and one select.
    const result = await removeAbandonedApplicationUploads(createAdminClient() as never);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 200 });
  }
}
