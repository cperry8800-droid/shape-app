// Sign-out endpoint for static newdesign pages (which can't call the
// server action directly). Clears the Supabase session cookie and returns
// 200 so the caller can redirect on its own.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
