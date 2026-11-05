// The account's time zone: read it, and set it (P9).
//
// GET -> { timezone: string | null, ready: boolean }
//        `ready: false` until 2026-11-05-account-timezone.sql runs; the pickers then stay hidden.
// PUT { timezone, onlyIfUnset? } -> { timezone, changed }
//        `onlyIfUnset` is an app's or page's first open: it sets the device's zone only when the
//        person has none, and answers the one that stands. A zone the person chose is never
//        replaced by a device; a device in another zone asks first (shapeZone.mjs travelAsk).
//
// Any signed-in account, member or coach, paid or not: every time on Shape prints in this zone.
// The caller's own RLS-scoped client (profiles: "users update own profile"). Auth: cookie session
// or Bearer token (the installed app sends no cookie).

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { readAccountZone, writeAccountZone } from '@/lib/account-timezone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };
const privateJson = (body: unknown, init?: { status?: number }) =>
  NextResponse.json(body, { ...(init || {}), headers: PRIVATE_HEADERS });

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return privateJson({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);
  const read = await readAccountZone(supabase, user.id);
  // ⚠ A FAILED READ IS NOT "NO ZONE": the page would offer to set one over the zone it couldn't read.
  if (read.error) return privateJson({ error: 'Could not read your time zone.', code: 'unavailable' }, { status: 503 });
  return privateJson({ timezone: read.zone, ready: read.ready });
}

export async function PUT(request: Request) {
  const user = await currentUser(request);
  if (!user) return privateJson({ error: 'Authentication required.' }, { status: 401 });
  const body = await readJson<{ timezone?: unknown; onlyIfUnset?: unknown }>(request, { allowEmpty: false });
  if (!body.ok) return body.response;
  const supabase = await clientForRequest(request);
  const res = await writeAccountZone(supabase, user.id, body.data?.timezone, { onlyIfUnset: body.data?.onlyIfUnset === true });
  if (res.ok) return privateJson({ timezone: res.zone, changed: res.changed });
  if (res.reason === 'invalid') return privateJson({ error: 'That is not a time zone.', code: 'invalid_timezone' }, { status: 400 });
  if (res.reason === 'not_ready') return privateJson({ error: 'Time zones can’t be set yet.', code: 'not_ready' }, { status: 503 });
  return privateJson({ error: 'Could not save your time zone.', code: 'write_failed' }, { status: 500 });
}
