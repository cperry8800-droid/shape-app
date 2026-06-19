// src/app/api/radio/now-playing/route.ts
// Public live now-playing for the player. Degrades to nulls on any provider error
// so the stream UI never breaks. No auth (radio is not gated).
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProvider } from '@/lib/radio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('radio_station')
    .select('provider, now_playing_url')
    .eq('id', 1)
    .maybeSingle();
  try {
    const np = await getProvider({ provider: data?.provider, nowPlayingUrl: data?.now_playing_url }).getNowPlaying();
    return NextResponse.json(np);
  } catch {
    return NextResponse.json({ title: null, artist: null, isNora: false });
  }
}
