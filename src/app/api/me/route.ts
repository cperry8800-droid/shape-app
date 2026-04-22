// Lightweight "who am I?" endpoint used by static newdesign pages to
// render auth-aware nav. Reads the Supabase session from the same cookie
// the Next.js pages use. 200 with { user } when signed in, 200 with
// { user: null } when signed out.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
    },
  });
}
