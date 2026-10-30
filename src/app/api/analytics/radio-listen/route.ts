// src/app/api/analytics/radio-listen/route.ts
// How long Shape Radio plays: a beat from the website's or the app's player
// (public/newdesign/radioListening.mjs), for the admin Overview's Radio tab. Fire-and-forget: it
// always answers 204, so the player never waits on it or sees an error.
//
// The stream is members only, so a beat counts only with an account, read from the request's own
// session (a Bearer token from the installed app, else the cookie). record_radio_listen
// (2026-10-30-radio-listening.sql) keeps that account only while it listens, to count it once and
// to credit no more seconds than have passed; the daily totals never hold it.
import { NextResponse } from 'next/server';
import { gpcOptOut } from '@/lib/gpc';
import { currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The console's days (src/app/admin/ui.tsx): listening counts on the owner's date.
const TIMEZONE = process.env.ADMIN_TIMEZONE || 'America/New_York';
const BODY_LIMIT = 1024;

// A beat as the player sends it ({ surface, seconds, end? }), or null. Seconds are whole and at most
// a day; the database caps what it credits much lower.
function cleanBeat(raw: unknown): { surface: 'web' | 'app'; seconds: number; end: boolean } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const b = raw as Record<string, unknown>;
  if (b.surface !== 'web' && b.surface !== 'app') return null;
  const seconds = typeof b.seconds === 'number' && Number.isFinite(b.seconds) ? Math.round(b.seconds) : NaN;
  if (!(seconds >= 0 && seconds <= 86400)) return null;
  return { surface: b.surface, seconds, end: b.end === true };
}

export async function POST(request: Request) {
  try {
    // A browser sending Global Privacy Control never counts listening (the player checks it too); a
    // request that carries it anyway is not recorded, as the privacy policy's §7 says.
    if (gpcOptOut(request)) return new NextResponse(null, { status: 204 });
    const parsed = await readJson<unknown>(request, { maxBytes: BODY_LIMIT });
    const beat = parsed.ok ? cleanBeat(parsed.data) : null;
    if (!beat) return new NextResponse(null, { status: 204 });
    const user = await currentUser(request).catch(() => null);
    if (!user) return new NextResponse(null, { status: 204 });
    const { error } = await createAdminClient().rpc('record_radio_listen', {
      p_user: user.id,
      p_surface: beat.surface,
      p_seconds: beat.seconds,
      p_end: beat.end,
      p_tz: TIMEZONE,
    });
    // Logged, never returned: a dead pipeline (the migration not run yet) shouldn't be invisible.
    if (error) console.warn('[radio-listen] record failed:', error.message);
  } catch (e) {
    console.warn('[radio-listen] record failed:', e instanceof Error ? e.message : e);
  }
  return new NextResponse(null, { status: 204 });
}
