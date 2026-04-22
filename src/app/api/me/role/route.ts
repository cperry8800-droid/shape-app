// Switch the user's active role. Only accepts a role that's already in
// their `profiles.roles` array — adding a new role requires onboarding
// (apply as trainer, etc.) and shouldn't happen via a flip here.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const VALID_ROLES = ['client', 'trainer', 'nutritionist'] as const;
type Role = (typeof VALID_ROLES)[number];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null as unknown);
  const next = (body as { role?: string } | null)?.role;
  if (!next || !VALID_ROLES.includes(next as Role)) {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('roles')
    .eq('id', user.id)
    .maybeSingle();

  const owned = Array.isArray(profile?.roles) ? profile.roles : [];
  if (!owned.includes(next)) {
    return NextResponse.json(
      { error: "You don't have that role yet. Apply first." },
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from('profiles')
    .update({ role: next })
    .eq('id', user.id);

  if (error) {
    console.error('[me/role] update failed', error);
    return NextResponse.json({ error: 'Could not switch role.' }, { status: 500 });
  }

  const dashboard =
    next === 'trainer'
      ? '/newdesign/TrainerDashboard.html'
      : next === 'nutritionist'
        ? '/newdesign/NutritionistDashboard.html'
        : '/newdesign/ClientDashboard.html';

  return NextResponse.json({ ok: true, role: next, dashboard });
}
