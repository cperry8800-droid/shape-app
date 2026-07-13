// Opportunistic per-user IANA timezone capture. The client posts its resolved
// Intl zone on app open; we store it on client_profiles for tz-aware reads
// (weekend split, future reminders). Owner-scoped via the request's auth client.
import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { requireMembership } from '@/lib/require-membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A loose IANA sanity check ("Area/Location", optionally multi-segment, plus UTC).
const IANA = /^(UTC|[A-Za-z]+\/[A-Za-z0-9_+\-]+(?:\/[A-Za-z0-9_+\-]+)?)$/;

export async function POST(request: Request) {
  const denied = await requireMembership(request);
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
  // client_profiles is keyed by user_id (PK); `data` defaults to '{}' and a
  // trigger maintains updated_at, so a tz-only upsert is safe on insert + update
  // (RLS: client_profiles_insert_own + client_profiles_update_own).
  const { error } = await supabase
    .from('client_profiles')
    .upsert({ user_id: user.id, timezone: tz }, { onConflict: 'user_id' });
  if (error) return NextResponse.json({ error: 'write_failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
