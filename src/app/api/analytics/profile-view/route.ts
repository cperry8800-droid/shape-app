// src/app/api/analytics/profile-view/route.ts
// One view of a coach's public page, for the Growth funnel's top bar (owner, 2026-11-05). The page's
// beacon sends { role, id } once per visit (public/newdesign/profileView.mjs on the website's coach
// profile, src/components/ProfileViewBeacon.tsx on /trainers/<id> and /nutritionists/<id>), and only
// when the visitor's consent allows counting. Fire-and-forget: it always answers 204, so a page never
// waits on it or sees an error.
//
// Kept: one count per listing per day (record_coach_profile_view,
// supabase-migrations/2026-11-05-coach-profile-views.sql). Not kept: who looked. The caller's account
// is read from the request's own session (a Bearer token from the installed app, else the cookie)
// only so the database can leave out the listing's own coach; the address only as two keyed hashes
// for the rate limit (src/lib/profile-views.mjs). Not counted: a bot's user agent, and a browser
// sending Global Privacy Control.
import { NextResponse } from 'next/server';
import { gpcOptOut } from '@/lib/gpc';
import { callerAddress, cleanProfileView, isLikelyBot, viewBuckets, PROFILE_VIEW_BODY_MAX } from '@/lib/profile-views.mjs';
import { currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (gpcOptOut(request)) return new NextResponse(null, { status: 204 });
    if (isLikelyBot(request.headers.get('user-agent'))) return new NextResponse(null, { status: 204 });
    const parsed = await readJson<unknown>(request, { maxBytes: PROFILE_VIEW_BODY_MAX });
    const view = parsed.ok ? cleanProfileView(parsed.data) : null;
    if (!view) return new NextResponse(null, { status: 204 });
    const user = await currentUser(request).catch(() => null);
    const buckets = viewBuckets(
      process.env.RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      callerAddress(request.headers),
      view.role,
      view.id
    );
    const { error } = await createAdminClient().rpc('record_coach_profile_view', {
      p_role: view.role,
      p_provider_id: view.id,
      p_viewer: user?.id ?? null,
      p_bucket: buckets.view,
      p_addr: buckets.addr,
    });
    // Logged, never returned: a dead pipeline (the migration not run yet) shouldn't be invisible.
    if (error) console.warn('[profile-view] record failed:', error.message);
  } catch (e) {
    console.warn('[profile-view] record failed:', e instanceof Error ? e.message : e);
  }
  return new NextResponse(null, { status: 204 });
}
