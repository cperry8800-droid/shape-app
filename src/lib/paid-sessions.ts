// A session a client has paid for and the coach has not booked yet (client-onboarding review,
// fix 3c: M10).
//
// ⚠ A PAID SESSION NEVER BECAME A SESSION. The webhook recorded the purchase and told the coach
// "$X from a client for a booking"; nothing booked it, and /api/sessions/manage let a coach book
// only an active subscriber, so a client who paid for one session could not be booked at all.
//
// A paid session (one_time_purchases, kind 'booking', status 'paid') is open until a session is
// booked against it: the coach's booking links the oldest open one (session_id,
// 2026-10-15-paid-sessions.sql). One whose session was cancelled or declined, or deleted, is open
// again, so the client is not left paid for nothing.
//
// Read with the service role, by the routes that have already checked the caller owns the listing:
//   src/app/api/sessions/manage/route.ts   (who a coach may book, and the link)
//   src/app/api/coach/to-schedule/route.ts (the coach's To schedule list)

import type { SupabaseClient } from '@supabase/supabase-js';

export type OpenPaidSession = {
  purchaseId: string;
  clientId: string;
  paidAt: string;
  priceCents: number;
  /** The session it was booked as, when that one was cancelled or declined; null when never booked. */
  sessionId: string | null;
};

/** A session that no longer holds a paid one: it did not happen and will not. */
const RELEASED = new Set(['cancelled', 'canceled', 'declined']);

/**
 * The open paid sessions on one listing, oldest first, for one client or all of them.
 * `{ ok: false }` when they could not be read: the caller refuses rather than guessing.
 */
export async function openPaidSessions(
  admin: SupabaseClient,
  a: { role: 'trainer' | 'nutritionist'; providerId: number; clientId?: string | null },
): Promise<{ ok: true; rows: OpenPaidSession[] } | { ok: false }> {
  let q = admin
    .from('one_time_purchases')
    .select('id, client_id, created_at, price_cents, session_id')
    .eq('provider_role', a.role)
    .eq('provider_id', a.providerId)
    .eq('kind', 'booking')
    .eq('status', 'paid');
  if (a.clientId) q = q.eq('client_id', a.clientId);
  const { data, error } = await q.order('created_at', { ascending: true }).limit(500);
  if (error) {
    console.error('[paid-sessions] purchases read failed:', error.message, (error as { code?: string }).code);
    return { ok: false };
  }
  const rows = (data ?? []) as { id: string; client_id: string; created_at: string; price_cents: number; session_id: string | null }[];
  const linked = [...new Set(rows.map((r) => r.session_id).filter((v): v is string => !!v))];
  const statusOf = new Map<string, string>();
  if (linked.length) {
    const { data: sess, error: sessErr } = await admin.from('sessions').select('id, status').in('id', linked);
    if (sessErr) {
      console.error('[paid-sessions] sessions read failed:', sessErr.message);
      return { ok: false };
    }
    for (const s of (sess ?? []) as { id: string; status: string | null }[]) statusOf.set(s.id, String(s.status || ''));
  }
  const open = rows.filter((r) => !r.session_id || !statusOf.has(r.session_id) || RELEASED.has(statusOf.get(r.session_id) as string));
  return {
    ok: true,
    rows: open.map((r) => ({
      purchaseId: r.id,
      clientId: r.client_id,
      paidAt: r.created_at,
      priceCents: Number(r.price_cents) || 0,
      sessionId: r.session_id && statusOf.has(r.session_id) ? r.session_id : null,
    })),
  };
}

/**
 * Book `sessionId` against the open paid session `p`. Conditional on the link `p` was read with,
 * so two bookings racing for one payment link it once. Returns whether this call linked it.
 */
export async function linkPaidSession(admin: SupabaseClient, p: OpenPaidSession, sessionId: string): Promise<boolean> {
  let q = admin.from('one_time_purchases').update({ session_id: sessionId }).eq('id', p.purchaseId);
  q = p.sessionId ? q.eq('session_id', p.sessionId) : q.is('session_id', null);
  const { data, error } = await q.select('id');
  if (error) {
    console.error('[paid-sessions] link failed:', error.message);
    return false;
  }
  return Array.isArray(data) && data.length === 1;
}
