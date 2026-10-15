// Shared by the trainer and nutritionist Messages routes (/api/trainer/messages,
// /api/nutritionist/messages): the parts of a coach's inbox that fix 3a of the client-onboarding
// review added. Everything runs on the caller's own session; RLS and the definer functions decide
// what they may read.

import type { createClient } from '@/lib/supabase/server';

type Client = Awaited<ReturnType<typeof createClient>>;
type Row = { id: string; sender_id: string | null; body: string; metadata?: Record<string, unknown> | null; created_at: string };

export type CoachThreadMessage = { id: string; body: string; mine: boolean; createdAt: string; shape?: true };

/** One message as the coach's page shows it. Shape's welcome (no sender) is from neither side. */
export function coachThreadMessage(m: Row, userId: string): CoachThreadMessage {
  const meta = m.metadata && typeof m.metadata === 'object' ? m.metadata : null;
  if (!m.sender_id && meta && meta.shape === 'welcome') {
    return { id: m.id, body: m.body, mine: false, createdAt: m.created_at, shape: true };
  }
  return { id: m.id, body: m.body, mine: m.sender_id === userId, createdAt: m.created_at };
}

/**
 * The clients' names, by id. get_display_names first (it answers any signed-in caller, up to 200
 * ids), then the name a client gave on a booking. A subscriber with no booking read "Client"
 * before, because bookings were the only source.
 */
export async function clientNames(
  supabase: Client,
  ids: string[],
  fallback: Map<string, string>,
): Promise<Map<string, string>> {
  const out = new Map(fallback);
  const wanted = [...new Set(ids.filter(Boolean))].slice(0, 200);
  if (!wanted.length) return out;
  const { data, error } = await supabase.rpc('get_display_names', { p_ids: wanted });
  if (error) {
    console.warn('[coach-messages] get_display_names failed:', error.message);
    return out;
  }
  for (const r of (data ?? []) as { user_id?: string; full_name?: string | null }[]) {
    if (r.user_id && r.full_name && r.full_name.trim()) out.set(r.user_id, r.full_name.trim());
  }
  return out;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Open (or find) the thread the client sees with the caller's listing: the coach's way into it
 * (get_or_create_client_conversation, 2026-10-15-coach-thread.sql). Answers an HTTP status the
 * route returns as is.
 */
export async function openClientThread(
  supabase: Client,
  clientId: unknown,
  role: 'trainer' | 'nutritionist',
): Promise<{ status: number; body: Record<string, unknown> }> {
  const id = String(clientId ?? '').trim();
  if (!UUID_RE.test(id)) return { status: 400, body: { error: 'Missing client.' } };
  const { data, error } = await supabase.rpc('get_or_create_client_conversation', { p_client_id: id, p_provider_role: role });
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '42501') return { status: 403, body: { error: 'not_your_client', message: 'This member is not your client.' } };
    if (code === 'PGRST202') return { status: 503, body: { error: 'not_available', message: 'Opening a client thread is not available yet.' } };
    console.error('[coach-messages] open client thread failed:', error.message, code);
    return { status: 500, body: { error: 'Could not open the conversation.' } };
  }
  return { status: 200, body: { ok: true, conversationId: data } };
}
