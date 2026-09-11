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
  // ⚠ AN UNREADABLE COUNT IS null, NEVER 0 — AND THE TWO QUERIES FAIL
  // INDEPENDENTLY, WHICH IS THE WHOLE POINT. `count ?? 0` collapsed a failed read
  // into a measured zero per query, so one failure beside one success published
  // "0 trainers · 1 nutritionist" on the homepage: a read that never happened,
  // presented as a count. The consumer cannot tell *none* from *not read* unless
  // this says so, and only this layer knows. (Codex, #2045.)
  const trainerCount = trainers.error ? null : trainers.count ?? null;
  const nutritionistCount = nutritionists.error ? null : nutritionists.count ?? null;
  const bothKnown = trainerCount !== null && nutritionistCount !== null;
  return NextResponse.json(
    {
      trainers: trainerCount,
      nutritionists: nutritionistCount,
      // a total is only a number when both halves are; a partial sum is a
      // smaller claim wearing the same name.
      total: bothKnown ? trainerCount + nutritionistCount : null,
    },
    { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } }
  );
}
