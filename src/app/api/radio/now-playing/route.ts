// src/app/api/radio/now-playing/route.ts
// Public live now-playing for the player. Degrades to nulls on any provider error
// so the stream UI never breaks. No auth (radio is not gated).
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProvider, isSimulated } from '@/lib/radio';
import { noraOnAir } from '@/lib/radio/noraOnAir.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  // While Nora is the DJ, the song comes from her own planned set (src/lib/radio/noraOnAir.mjs):
  // the one listeners are hearing, with its album, and the tempo the booth follows. Her records
  // are service-role only, so this read is the server's; it never says what plays next. Any
  // fault here falls through to the station as usual.
  try {
    const nora = await noraOnAir(createAdminClient(), { now: Date.now() });
    if (nora) return NextResponse.json({ ...nora, simulated: false }, { headers: { 'cache-control': 'no-store, max-age=0' } });
  } catch {
    /* the station's own now-playing below */
  }

  const supabase = await createClient();
  // ⚠ THE PAYLOAD SAYS WHETHER IT IS A MEASUREMENT, BECAUSE THE MOCK IS INDISTINGUISHABLE
  // FROM A REAL TRACK ON THE WIRE (Codex, #2101 round 5). With no station configured —
  // which is production TODAY, provider='mock' — getProvider hands back the mock and this
  // route answered 'Tempo Lift' / 'Shape Radio' with a 200. A caller has no way to tell
  // that from a station actually playing a song of that name, so the web player printed an
  // invented title under "Now playing" and fed it to the field's programme. On the page
  // whose entire argument is that every figure is measured or absent, that is the one
  // thing it may not do.
  //
  // ⚠ AND A LOOKUP THAT FAILED IS NOT A MEASUREMENT EITHER. The error was dropped, so a
  // query fault fell through to the mock exactly as an unconfigured station does — the
  // same class as the station route's own false 200, one route over.
  const { data, error } = await supabase
    .from('radio_station')
    .select('provider, now_playing_url')
    .eq('id', 1)
    .maybeSingle();
  const cfg = error ? {} : { provider: data?.provider, nowPlayingUrl: data?.now_playing_url };
  const simulated = !!error || isSimulated(cfg);
  try {
    const np = await getProvider(cfg).getNowPlaying();
    return NextResponse.json({ ...np, simulated });
  } catch {
    return NextResponse.json({ title: null, artist: null, isNora: false, simulated: true });
  }
}
