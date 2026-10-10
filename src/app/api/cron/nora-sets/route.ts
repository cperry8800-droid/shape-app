// Nora's sets, hourly: put the owner's slots on the schedule for the next week (publishing them
// only once the station's licences are confirmed), then plan every Nora set that starts within
// the next 70 minutes, so her engine has the programme before the set begins. The work is in
// src/lib/radio/noraSetStore.mjs.
//
// Auth: `x-cron-secret: <CRON_SECRET>` or Vercel Cron's `Authorization: Bearer <CRON_SECRET>`,
// as /api/cron/reminders. Runs as the service role.

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { planDueSets, syncNoraSets } from '@/lib/radio/noraSetStore.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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

async function handle(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = createAdminClient();
  const now = Date.now();
  const schedule = await syncNoraSets(db, { now });
  // Planning reads the schedule just written, so it runs second and even after a failed sync
  // (a set already on the schedule still needs its programme).
  const planning = await planDueSets(db, { now });
  const ok = schedule.ok && planning.ok;
  return NextResponse.json({ ok, schedule, planning }, { status: ok ? 200 : 500 });
}

export const GET = handle;
export const POST = handle;
