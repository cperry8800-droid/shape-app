// A coach's paid sessions not yet booked: their To schedule list (client-onboarding review, fix 3c:
// M10). A client who pays for a single session waits here until the coach books a time with them;
// the booking (/api/sessions/manage `create`) links the payment and takes it off the list.
//
// GET ?role=trainer|nutritionist -> { items: [{ purchaseId, clientId, clientName, paidAt, priceCents }] }
//   oldest first. A coach with no listing in that role gets an empty list.
//
// The listing is the caller's own (read as them, through RLS); the purchases are then read with the
// service role, for that listing only (paid-sessions.ts). Names come from get_display_names, display
// fields only, as the Schedule reads them. Auth: cookie session OR Bearer token.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { openPaidSessions } from '@/lib/paid-sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const role = new URL(request.url).searchParams.get('role');
  if (role !== 'trainer' && role !== 'nutritionist') {
    return NextResponse.json({ error: 'Say which listing: trainer or nutritionist.' }, { status: 400 });
  }
  const supabase = await clientForRequest(request);
  const { data: listing, error: listingErr } = await supabase
    .from(role === 'trainer' ? 'trainers' : 'nutritionists')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (listingErr) return NextResponse.json({ error: 'Could not read your listing.' }, { status: 503 });
  if (!listing) return NextResponse.json({ items: [] });

  const paid = await openPaidSessions(createAdminClient(), { role, providerId: (listing as { id: number }).id });
  if (!paid.ok) return NextResponse.json({ error: 'Could not read your paid sessions.' }, { status: 503 });

  const ids = [...new Set(paid.rows.map((r) => r.clientId))];
  const names = new Map<string, string>();
  if (ids.length) {
    // get_display_names refuses more than 200 ids at once.
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabase.rpc('get_display_names', { p_ids: ids.slice(i, i + 200) });
      for (const n of (data ?? []) as { user_id: string; full_name: string | null }[]) {
        if (String(n.full_name ?? '').trim()) names.set(n.user_id, String(n.full_name).trim());
      }
    }
  }
  return NextResponse.json({
    items: paid.rows.map((r) => ({
      purchaseId: r.purchaseId,
      clientId: r.clientId,
      clientName: names.get(r.clientId) || 'Client',
      paidAt: r.paidAt,
      priceCents: r.priceCents,
    })),
  });
}
