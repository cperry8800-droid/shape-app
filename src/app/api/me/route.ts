// Lightweight "who am I?" endpoint used by static newdesign pages to
// render auth-aware nav. Reads the Supabase session from the same cookie
// the Next.js pages use. 200 with { user } when signed in, 200 with
// { user: null } when signed out.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function firstName(full: string | null | undefined, email: string | null | undefined): string {
  const f = (full ?? '').trim();
  if (f) return f.split(/\s+/)[0];
  const local = (email ?? '').split('@')[0];
  // Strip trailing digits and capitalize if it looks like a name.
  const cleaned = local.replace(/[._-]+/g, ' ').replace(/\d+$/, '').trim();
  if (!cleaned) return email ?? '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ user: null });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, role, roles')
    .eq('id', user.id)
    .maybeSingle();

  const roles = Array.isArray(profile?.roles) && profile.roles.length
    ? profile.roles
    : (profile?.role ? [profile.role] : ['client']);

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: profile?.full_name ?? null,
      firstName: firstName(profile?.full_name, user.email),
      avatarUrl: profile?.avatar_url ?? null,
      role: profile?.role ?? 'client',
      roles,
    },
  });
}
