// src/app/api/analytics/radio-listen/route.ts
// How long Shape Radio plays: a beat from the website's or the app's player
// (public/newdesign/radioListening.mjs), for the admin Overview's Radio tab. Fire-and-forget: it
// always answers 204, so the player never waits on it or sees an error.
//
// The stream is members only, so a beat counts only from an account that may hear it: one read from
// the request's own session (a Bearer token from the installed app, else the cookie) that the station
// route's membership check passes (Codex P2 on #2527: a free account could otherwise post beats for
// a stream it cannot get). record_radio_listen
// (2026-10-30-radio-listening.sql) keeps that account only while it listens, to count it once and
// to credit no more seconds than have passed; the daily totals never hold it.
import { NextResponse } from 'next/server';
import { gpcOptOut } from '@/lib/gpc';
import { computeMembership } from '@/lib/membership-core';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The console's days (src/app/admin/ui.tsx): listening counts on the owner's date.
const TIMEZONE = process.env.ADMIN_TIMEZONE || 'America/New_York';
const BODY_LIMIT = 1024;
const MAX_PLAYED = 31 * 24 * 60 * 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A beat as the player sends it ({ surface, listen, played, end? }), or null. `listen` is the
// listen's own random id; `played` is the seconds it has played since it began, whole and at most 31
// days, so a listen left on for days still counts (Codex P2 on #2527); the database credits no more
// than the time that has passed.
function cleanBeat(raw: unknown): { surface: 'web' | 'app'; listen: string; played: number; end: boolean } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const b = raw as Record<string, unknown>;
  if (b.surface !== 'web' && b.surface !== 'app') return null;
  if (typeof b.listen !== 'string' || !UUID.test(b.listen)) return null;
  const played = typeof b.played === 'number' && Number.isFinite(b.played) ? Math.round(b.played) : NaN;
  if (!(played >= 0 && played <= MAX_PLAYED)) return null;
  return { surface: b.surface, listen: b.listen.toLowerCase(), played, end: b.end === true };
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
    // As src/app/api/radio/station/route.ts asks it, the age gate included (a known minor gets no
    // stream; Codex P2 on #2527); a check that fails counts nothing.
    const membership = await computeMembership(await clientForRequest(request), user.id, user.email ?? null, {
      emailConfirmed: !!user.email_confirmed_at,
    }).catch(() => null);
    if (!membership?.isMember || membership.isKnownMinor) return new NextResponse(null, { status: 204 });
    const { error } = await createAdminClient().rpc('record_radio_listen', {
      p_user: user.id,
      p_listen: beat.listen,
      p_surface: beat.surface,
      p_played: beat.played,
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
