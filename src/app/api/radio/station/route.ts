// src/app/api/radio/station/route.ts
// Station config for the in-app player.
//
// ⚠ SIGNED-IN ONLY. Shape Radio is a non-interactive webcast we transmit under
// the statutory licence, and the licence set is scoped to that posture — so a
// signed-out listener is not a listener we are licensed for. The UI gates were
// closed first (radio.html starts gated, the mobile provider fails closed), but
// a UI gate is not an access control: this route handed `streamUrl` to any
// anonymous GET, so the stream stayed one curl away.
//
// ⚠ HONEST RESIDUAL — this narrows the exposure, it does not eliminate it. The
// URL points at our provider's public endpoint, so anyone who has already
// resolved it can keep hitting the provider directly; what changes is that
// SHAPE no longer distributes it to unauthenticated callers. Closing it fully
// needs a subscriber-scoped stream token or a proxy in front of the provider,
// which is a provider capability question — tracked, not solved here.
import { NextResponse, type NextRequest } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { refuseKnownMinor } from '@/lib/age-gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await currentUser(request);
  if (!user) {
    // Deliberately no streamUrl, and no hint about whether a station is
    // configured — an anonymous caller learns nothing about the stream.
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const supabase = await clientForRequest(request);

  // Shape is 18+, no exceptions — and "authenticated" is not "eligible". This
  // route sits outside the paid-prefix gate that carries the age check, so
  // without this a confirmed minor gets the stream URL.
  const minor = await refuseKnownMinor(supabase, user.id);
  if (minor) return minor;

  const { data } = await supabase
    .from('radio_station')
    .select('provider, station_name, stream_url')
    .eq('id', 1)
    .maybeSingle();
  return NextResponse.json({
    name: data?.station_name || 'Shape Radio',
    streamUrl: data?.stream_url || null,
    provider: data?.provider || 'mock',
    configured: !!data?.stream_url,
  });
}
