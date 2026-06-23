// src/app/api/analytics/track/route.ts
// Thin, fire-and-forget event sink. Whitelists the event name (the only client
// write path into analytics_events, via the track_event RPC which re-checks the
// whitelist + binds auth.uid()). Always returns 204 so the client never blocks
// or sees an error. Membership is NOT required (funnel must capture pre-paywall).
// Native (Bearer) callers record as anon/null-user events in v1 — acceptable for
// aggregate funnel counts; key conversion steps are user-linked via other tables.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAnalyticsEvent } from '@/lib/funnel.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { event?: unknown; props?: unknown };
    const event = typeof body.event === 'string' ? body.event : '';
    if (!isAnalyticsEvent(event)) return new NextResponse(null, { status: 204 });
    const props = body.props && typeof body.props === 'object' && !Array.isArray(body.props) ? body.props : {};
    const supabase = await createClient();
    await supabase.rpc('track_event', { p_event: event, p_props: props });
  } catch (e) {
    // Never surface an error to the caller, but log server-side so a dead
    // pipeline (e.g. track_event RPC missing pre-migration) isn't invisible.
    console.warn('[analytics] track failed:', e instanceof Error ? e.message : e);
  }
  return new NextResponse(null, { status: 204 });
}
