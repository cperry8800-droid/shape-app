// Public live counts of trainers + nutritionists for the homepage.
// Matches the marketplace's owner_id-not-null filter so the number we
// brag about is the number you'd actually see when you browse.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const [trainers, nutritionists] = await Promise.all([
    supabase.from('trainers').select('id', { count: 'exact', head: true }).not('owner_id', 'is', null),
    supabase.from('nutritionists').select('id', { count: 'exact', head: true }).not('owner_id', 'is', null),
  ]);
  const trainerCount = trainers.count ?? 0;
  const nutritionistCount = nutritionists.count ?? 0;
  return NextResponse.json(
    {
      trainers: trainerCount,
      nutritionists: nutritionistCount,
      total: trainerCount + nutritionistCount,
    },
    { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } }
  );
}
