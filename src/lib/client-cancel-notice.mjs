// A member cancelled their own booking: the coach hears it (owner, 2026-11-05: "Member cancelled a
// session: sessions/manage tells nobody"). Before this the route told only the member, and only when
// the coach acted; a coach found out a slot had opened by looking at the Schedule.
//
// `client_cancelled` answers to the coach's Sessions switch (notificationSurfaces.mjs PREFERENCE_OF,
// whose help says "cancellations"); quiet hours hold it at delivery (/api/push/dispatch). The time is
// on the coach's own clock, the zone their hours are stored in (sessions/request does the same), and
// UTC, said so, when their listing has none. One notice per booking (or per run, from its first
// booking): data.dedupe. Best-effort: the cancellation is saved before this runs, and nothing here
// throws.
//
// A plain module (the route passes its own createNotification), so the route's tests load it as it ships.

import { atTime, np, phrase } from '../../mobile-app/src/services/noticeCopy.mjs';

// A zone Intl can use, else null (time.ts normalizeZone's rule).
function zoneOf(v) {
  if (typeof v !== 'string' || !v.trim()) return null;
  try { new Intl.DateTimeFormat('en-US', { timeZone: v.trim() }); return v.trim(); } catch { return null; }
}

/** The English and the copy, pure, so the test reads exactly what is stored. */
export function clientCancelText({ client, count, whenText, whenAt }) {
  const shown = client || 'A client';
  const who = client || phrase('word.aClient');
  const many = count > 1;
  return {
    title: `Session cancelled: ${shown}`,
    body: many ? `${shown} cancelled ${count} sessions, from ${whenText} on.` : `${shown} cancelled their session on ${whenText}.`,
    copy: {
      title: np('session.clientCancelled.title', { client: who }),
      body: many
        ? np('session.clientCancelledMany.body', { client: who, count, when: whenAt })
        : np('session.clientCancelled.body', { client: who, when: whenAt }),
    },
  };
}

/**
 * @param {any} admin the service-role client (the coach's listing and the member's name)
 * @param {{ id: string, client_id: string | null, client_name?: string | null, provider_role: string, provider_id: number | string, scheduled_at: string, series_id?: string | null }} booking
 * @param {{ count?: number, notify: (admin: any, n: any, copy: any) => Promise<boolean> }} opts
 * @returns {Promise<boolean>}
 */
export async function tellCoachClientCancelled(admin, booking, opts) {
  try {
    const role = booking.provider_role === 'nutritionist' ? 'nutritionist' : booking.provider_role === 'trainer' ? 'trainer' : null;
    if (!role || !opts || typeof opts.notify !== 'function') return false;
    // `*` so a database without the timezone column still reads the row (sessions/request).
    const { data: provider, error } = await admin
      .from(role === 'nutritionist' ? 'nutritionists' : 'trainers')
      .select('*')
      .eq('id', booking.provider_id)
      .maybeSingle();
    if (error || !provider) return false;
    const ownerId = provider.owner_id;
    if (!ownerId || ownerId === booking.client_id) return false;
    const zone = zoneOf(provider.timezone);
    let client = String(booking.client_name || '').trim() || null;
    if (!client && booking.client_id) {
      const { data: prof } = await admin.from('profiles').select('full_name').eq('id', booking.client_id).maybeSingle();
      client = String((prof && prof.full_name) || '').trim() || null;
    }
    const at = new Date(booking.scheduled_at);
    if (!Number.isFinite(at.getTime())) return false;
    const whenText = at.toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      timeZone: zone || 'UTC', ...(zone ? {} : { timeZoneName: 'short' }),
    });
    const count = Math.max(1, Math.floor(Number(opts.count) || 1));
    const text = clientCancelText({ client, count, whenText, whenAt: atTime(at.toISOString(), zone || undefined, true) });
    return await opts.notify(admin, {
      userId: ownerId,
      type: 'client_cancelled',
      title: text.title,
      body: text.body,
      route: 'schedule',
      data: {
        dedupe: `client-cancel:${booking.id}`,
        sessionId: booking.id,
        ...(booking.series_id ? { seriesId: booking.series_id } : {}),
        clientId: booking.client_id,
        providerRole: role,
      },
    }, text.copy);
  } catch (err) {
    console.error('[sessions] client-cancel notice failed:', err instanceof Error ? err.message : err);
    return false;
  }
}
