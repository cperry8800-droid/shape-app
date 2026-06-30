// src/app/api/radio/station/route.ts
// Public station config for the in-app player. No auth (radio is not gated).
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
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
