// Server-side helper for creating in-app notifications.
//
// Notifications are usually created for someone OTHER than the actor (a client
// books → the coach is notified), so callers pass the service-role admin client
// to bypass RLS. Best-effort: a failed insert is logged, never thrown, so it
// can't break the action that triggered it.
//
// `route` is an in-app destination the bell can deep-link to (e.g. 'sessions').

import type { SupabaseClient } from '@supabase/supabase-js';

export type NewNotification = {
  userId: string;
  type?: string;
  title: string;
  body?: string;
  route?: string;
  data?: Record<string, unknown>;
};

export async function createNotification(client: SupabaseClient, n: NewNotification): Promise<void> {
  if (!n.userId || !n.title) return;
  try {
    const { error } = await client.from('notifications').insert({
      user_id: n.userId,
      type: n.type ?? 'general',
      title: n.title,
      body: n.body ?? '',
      route: n.route ?? null,
      data: n.data ?? {},
    });
    if (error) console.error('[notify] insert failed:', error.message);
  } catch (err) {
    console.error('[notify] insert threw:', err);
  }
}
