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

/** The `?conversation=` a Messages page asked for (a notification, a client's Message), or null. */
export function wantedConversation(request: Request | undefined): string | null {
  if (!request || typeof request.url !== 'string') return null;
  const id = new URL(request.url).searchParams.get('conversation') || '';
  return UUID_RE.test(id) ? id : null;
}

/**
 * The inbox lists the 50 most recent threads. A thread asked for by id that is older than those
 * (Codex on #2360: a returning subscriber) is read on its own, held to this listing, and put
 * first, so the page opens IT and never falls back to another client's thread.
 */
export async function withWantedConversation<Row extends { id: string }>(
  supabase: Client,
  rows: Row[],
  wanted: string | null,
  role: 'trainer' | 'nutritionist',
  providerId: number,
): Promise<Row[]> {
  if (!wanted || rows.some((c) => c.id === wanted)) return rows;
  const { data, error } = await supabase
    .from('conversations')
    .select('id, client_id, last_message, last_message_at')
    .eq('kind', 'direct')
    .eq('provider_role', role)
    .eq('provider_id', providerId)
    .eq('id', wanted)
    .maybeSingle();
  if (error) console.warn('[coach-messages] wanted conversation read failed:', error.message);
  return data ? [data as unknown as Row, ...rows] : rows;
}

/**
 * The inbox reads its messages newest-first across every listed thread, capped at 1,000 rows. A
 * thread asked for by id can sit below that cap in a busy inbox, so its newest 200 messages are
 * read on their own and merged in, once each (Codex on #2360). Answers the rows newest-first.
 */
export async function withWantedMessages<M extends { id: string; created_at: string }>(
  supabase: Client,
  rows: M[],
  wanted: string | null,
  listed: boolean,
): Promise<M[]> {
  if (!wanted || !listed) return rows;
  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, body, metadata, created_at')
    .eq('conversation_id', wanted)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    console.warn('[coach-messages] wanted conversation messages read failed:', error.message);
    return rows;
  }
  const seen = new Set(rows.map((m) => m.id));
  const extra = ((data ?? []) as unknown as M[]).filter((m) => !seen.has(m.id));
  if (!extra.length) return rows;
  return [...rows, ...extra].sort((x, y) => (x.created_at < y.created_at ? 1 : x.created_at > y.created_at ? -1 : 0));
}

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
