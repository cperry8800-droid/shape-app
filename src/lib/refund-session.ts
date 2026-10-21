// A refunded paid session comes off both calendars (client-onboarding review, fix 3c; Fable on #2373).
//
// ⚠ A REFUND LEFT THE BOOKED SESSION STANDING. Once a coach books a paid session against its
// purchase (one_time_purchases.session_id, src/lib/paid-sessions.ts), a refund (the admin's
// /dashboard/refunds, or charge.refunded from Stripe) marked the purchase refunded and touched nothing
// else, so the session stayed on both calendars and the coach delivered a session that had been paid
// back. A session that has not happened yet (requested or confirmed, starting later) is cancelled,
// and the member and the coach are told. One that already happened stays as it was.
//
// Best-effort, service role: the refund has already happened and is never undone here; a failure is
// logged and reported.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notify';
import { np, phrase, usdOf } from '../../mobile-app/src/services/noticeCopy.mjs';

export async function cancelRefundedSession(
  admin: SupabaseClient,
  purchaseId: string,
): Promise<'cancelled' | 'none' | 'failed'> {
  const { data: p, error } = await admin
    .from('one_time_purchases')
    .select('session_id, client_id, provider_role, provider_id, kind')
    .eq('id', purchaseId)
    .maybeSingle();
  if (error) {
    console.error('[refund-session] purchase read failed:', error.message);
    return 'failed';
  }
  const row = p as { session_id: string | null; client_id: string; provider_role: string; provider_id: number; kind: string } | null;
  if (!row || row.kind !== 'booking' || !row.session_id) return 'none';
  // Conditional on the session still being ahead, so a session that already happened, or that someone
  // cancelled in the meantime, is left alone.
  const { data: hit, error: cErr } = await admin
    .from('sessions')
    .update({ status: 'cancelled' })
    .eq('id', row.session_id)
    .in('status', ['requested', 'confirmed'])
    .gt('scheduled_at', new Date().toISOString())
    .select('id');
  if (cErr) {
    console.error('[refund-session] cancel failed:', cErr.message);
    return 'failed';
  }
  if (!Array.isArray(hit) || !hit.length) return 'none';
  const role = row.provider_role === 'nutritionist' ? 'nutritionist' : 'trainer';
  const [{ data: listing }, { data: who }] = await Promise.all([
    admin.from(role === 'trainer' ? 'trainers' : 'nutritionists').select('owner_id, name').eq('id', row.provider_id).maybeSingle(),
    admin.from('profiles').select('full_name').eq('id', row.client_id).maybeSingle(),
  ]);
  const coachName = String((listing as { name?: string | null } | null)?.name || '').trim();
  const clientName = String((who as { full_name?: string | null } | null)?.full_name || '').trim();
  const coach = coachName || 'your coach';
  const client = clientName || 'Your client';
  await createNotification(admin, {
    userId: row.client_id,
    type: 'session_cancelled',
    title: 'Session cancelled: refunded',
    body: `Your paid session with ${coach} was refunded, so it is off your calendar.`,
    route: 'sessions',
    data: {
      sessionId: row.session_id, dedupe: `refund-cancel:${row.session_id}`,
      // How the bell and the push say it in the member's language (noticeCopy.mjs).
      copy: { title: np('session.refunded.title'), body: coachName ? np('session.refunded.body', { coach: coachName }) : np('session.refunded.bodyAnon') },
    },
  });
  const ownerId = (listing as { owner_id?: string | null } | null)?.owner_id;
  if (ownerId) {
    await createNotification(admin, {
      userId: ownerId,
      type: 'session_cancelled',
      title: 'Refunded session cancelled',
      body: `${client}'s paid session was refunded, so it is off your calendar.`,
      route: 'schedule',
      data: {
        sessionId: row.session_id, providerRole: role, dedupe: `refund-cancel:${row.session_id}`,
        copy: { title: np('session.refundedCoach.title'), body: clientName ? np('session.refundedCoach.body', { client: clientName }) : np('session.refundedCoach.bodyAnon') },
      },
    });
  }
  return 'cancelled';
}
