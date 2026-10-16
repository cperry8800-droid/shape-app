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
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { buildSharedOverview, resolveMe, type OverviewClient } from '@/lib/shared-overview';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ⚠ THE APP SIGNS ITS CALLS WITH A BEARER TOKEN (Fable on fix 4). This route read only the cookie
// session, so an installed build (VITE_API_BASE_URL, #2332) got 401 and the coach's client page lost
// the board and last contact. Either session now, as the week-one route reads it.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = (await clientForRequest(req)) as unknown as OverviewClient;

  const me = await resolveMe(supabase, user.id);
  return NextResponse.json(await buildSharedOverview(supabase, { clientId, me }));
}
