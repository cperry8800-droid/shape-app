// Nightly: one reading of every coach's score, for the coach leaderboard's "Climbers · 30 days"
// and its "places moved since last week" (supabase-migrations/2026-10-15-leaderboards.sql).
//
// Scores are computed fresh on every board read; nothing records yesterday's. This is the
// history, one row per listing per UTC day, written by record_coach_score_snapshots (service
// role only), which also drops readings of listings that no longer exist and readings over 400
// days old. A second run the same day replaces that day's reading. No-op until the migration
// is applied.
//
// Auth: x-cron-secret: <CRON_SECRET> OR Authorization: Bearer <CRON_SECRET>.

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelation } from '@/lib/owned-provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && timingSafeEqual(x, y);
}

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET || process.env.NOTIFY_CRON_SECRET || '';
  if (!secret) return false;
  const hdr = request.headers.get('x-cron-secret') || '';
  const auth = request.headers.get('authorization') || '';
  return safeEqual(hdr, secret) || safeEqual(auth, `Bearer ${secret}`);
}

async function run(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('record_coach_score_snapshots');
  if (error) {
    if (isMissingRelation(error)) return NextResponse.json({ ok: true, skipped: 'not_set_up' });
    console.error('[cron/coach-score-snapshots] failed', error);
    return NextResponse.json({ ok: false, error: 'Could not record coach scores.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, written: Number(data) || 0 });
}

export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }
