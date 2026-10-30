// Daily: delete analytics_events, the daily tap counts (ui_click_counts) and the daily radio
// listening (radio_listen_days, radio_listen_peaks), older than 12 months (bounded retention); and
// any "listening now" row (radio_listen_live) quiet for 30 minutes, which a listen that never said it
// stopped leaves behind when nobody listens after it. A failure on one is reported and never stops
// the others.
// Auth: x-cron-secret: <CRON_SECRET> OR Authorization: Bearer <CRON_SECRET>.
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MISSING_TABLE = new Set(['42P01', 'PGRST205']);

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
    const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const admin = createAdminClient();
    const { error } = await admin.from('analytics_events').delete().lt('ts', cutoff);
    const clicks = await admin.from('ui_click_counts').delete().lt('day', cutoff.slice(0, 10));
    const listening = await admin.from('radio_listen_days').delete().lt('day', cutoff.slice(0, 10));
    const peaks = await admin.from('radio_listen_peaks').delete().lt('day', cutoff.slice(0, 10));
    const live = await admin.from('radio_listen_live').delete().lt('last_beat', new Date(Date.now() - 30 * 60 * 1000).toISOString());
    // Before a table's migration runs (2026-10-28-click-counts.sql, 2026-10-30-radio-listening.sql)
    // there is nothing to purge, which is no failure.
    const dailyErrors = [clicks, listening, peaks, live].map((r) => (r.error && !MISSING_TABLE.has(String(r.error.code)) ? r.error.message : ''));
    const failed = [error?.message, ...dailyErrors].filter(Boolean);
    if (failed.length) return NextResponse.json({ ok: false, error: failed.join('; '), cutoff }, { status: 200 });
    return NextResponse.json({ ok: true, cutoff });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 200 });
  }
}
