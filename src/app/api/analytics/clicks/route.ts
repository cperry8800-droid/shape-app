// src/app/api/analytics/clicks/route.ts
// Where people tap: a batch of tap counts from the website (public/click-capture.js) or the app
// (mobile-app/src/services/analytics.js), for the admin Overview's Clicks tab. Fire-and-forget:
// it always answers 204, so a page never waits on it or sees an error.
//
// The batch is cleaned again here (cleanBatch, src/lib/click-capture.mjs: at most 60 taps) and once
// more in SQL (record_ui_clicks), which refuses a bigger one and caps each caller at 20 batches a
// minute (2026-10-29-click-counts-caps.sql). The caller is read from the request's own session (a
// Bearer token from the installed app, else the cookie), only to count the taps as a visitor's, a
// member's or a coach's: the table keeps daily totals and never the account or the address.
import { NextResponse } from 'next/server';
import { cleanBatch } from '@/lib/click-capture.mjs';
import { gpcOptOut } from '@/lib/gpc';
import { currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The console's days (src/app/admin/ui.tsx): a tap counts on the owner's date.
const TIMEZONE = process.env.ADMIN_TIMEZONE || 'America/New_York';
const BODY_LIMIT = 16 * 1024;

export async function POST(request: Request) {
  try {
    // A browser sending Global Privacy Control never counts taps (public/click-capture.js); a request
    // that carries it anyway is not recorded, as the privacy policy's §7 says.
    if (gpcOptOut(request)) return new NextResponse(null, { status: 204 });
    const parsed = await readJson<unknown>(request, { maxBytes: BODY_LIMIT });
    const batch = parsed.ok ? cleanBatch(parsed.data) : null;
    if (!batch) return new NextResponse(null, { status: 204 });
    const user = await currentUser(request).catch(() => null);
    const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const { error } = await createAdminClient().rpc('record_ui_clicks', {
      p_user: user?.id ?? null,
      p_ip: ip,
      p_surface: batch.surface,
      p_rows: batch.rows,
      p_tz: TIMEZONE,
    });
    // Logged, never returned: a dead pipeline (the migration not run yet) shouldn't be invisible.
    if (error) console.warn('[clicks] record failed:', error.message);
  } catch (e) {
    console.warn('[clicks] record failed:', e instanceof Error ? e.message : e);
  }
  return new NextResponse(null, { status: 204 });
}
