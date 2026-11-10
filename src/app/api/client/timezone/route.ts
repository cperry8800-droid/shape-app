// The app's device zone on open. Until 2026-11-05 this overwrote the member's zone on EVERY open,
// so a member on a trip moved silently, and their streaks, reminders and coach's view with them.
//
// ⚠ NOW A FIRST DEFAULT ONLY (P9, owner 2026-11-05: "all time zones should be set by user"). Once
// 2026-11-05-account-timezone.sql has run, the device's zone becomes the account's only when the
// person has none (profiles.timezone, which the database copies onto client_profiles and the
// listings). A zone they chose stands; an app in another zone asks before switching
// (shapeZone.mjs travelAsk), and the switch goes through /api/me/timezone. Installed builds that
// still post here on every open are held to the same rule, because the rule is here.
//
// Before the migration runs, the old write stands: client_profiles.timezone, as before.
import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { requireAccount } from '@/lib/require-membership';
import { writeAccountZone } from '@/lib/account-timezone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A loose IANA sanity check ("Area/Location", optionally multi-segment, plus UTC).
const IANA = /^(UTC|[A-Za-z]+\/[A-Za-z0-9_+\-]+(?:\/[A-Za-z0-9_+\-]+)?)$/;

export async function POST(request: Request) {
  const denied = await requireAccount(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const body = await readJson<{ tz?: unknown }>(request, { allowEmpty: false });
  if (!body.ok) return body.response;
  const tz = String(body.data?.tz ?? '').trim().slice(0, 64);
  if (!IANA.test(tz)) return NextResponse.json({ error: 'invalid_tz' }, { status: 400 });
  // Shape check isn't enough — reject a well-formed but nonexistent zone
  // ("Area/Nowhere") so we never persist a value that breaks tz bucketing later.
  // The runtime throws on an unknown IANA zone, validating against the real db.
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { return NextResponse.json({ error: 'invalid_tz' }, { status: 400 }); }

  const supabase = await clientForRequest(request);
  const set = await writeAccountZone(supabase, user.id, tz, { onlyIfUnset: true });
  if (set.ok) return NextResponse.json({ ok: true, timezone: set.zone, changed: set.changed });
  if (set.reason !== 'not_ready') return NextResponse.json({ error: 'write_failed' }, { status: 500 });

  // Pre-migration only.
  // client_profiles is keyed by user_id (PK); `data` defaults to '{}' and a
  // trigger maintains updated_at, so a tz-only upsert is safe on insert + update
  // (RLS: client_profiles_insert_own + client_profiles_update_own).
  const { error } = await supabase
    .from('client_profiles')
    .upsert({ user_id: user.id, timezone: tz }, { onConflict: 'user_id' });
  if (error) return NextResponse.json({ error: 'write_failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
