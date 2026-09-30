// Per-client overview for a coach.
//
// Returns the data needed for TrainerClient.html / NutritionistClient.html:
// - basic client identity
// - the *other* provider(s) on the client (so we can render "Care team")
// - combined sessions (confirmed / requested / completed) for the next 30
//   days back + 60 days forward, tagged by provider role
//
// Authz is enforced by RLS: the caller must already be the client OR an
// active coach on this client. If neither, the queries simply return empty.
//
// The body lives in src/lib/shared-overview.ts since 2026-09-30, shared with the
// batched POST /api/clients/shared-overview so a roster read and a drawer read
// can never disagree about one client.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildSharedOverview, resolveMe } from '@/lib/shared-overview';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const me = await resolveMe(supabase, user.id);
  return NextResponse.json(await buildSharedOverview(supabase, { clientId, me }));
}
