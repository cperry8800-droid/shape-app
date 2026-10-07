// The signed-in coach's calendar feed link (see src/lib/calendar-feed.ts).
//
// GET                    -> { url, webcalUrl, createdAt, rotatedAt }, creating the link on
//                           the first call.
// POST { rotate: true }  -> the same, for a NEW link; the old one stops working at once
//                           (the feed answers 404 to it, like any unknown link).
//
// Coaches only — a trainer or nutritionist row owned by the caller — because the feed
// publishes bookings, which only a coach has. Auth is the cookie session or a Bearer token,
// like /api/calendar, and the membership gate applies as it does to the rest of the prefix.
// The link row is read and written with the CALLER's client, so RLS holds the account to its
// own row (2026-10-07-calendar-feed-token.sql); only the feed itself uses the service role.
//
// ⚠ BEFORE THE MIGRATION RUNS this answers 503 with code `feed_not_set_up`, once per Settings
// visit, and the card says "Calendar feed isn't set up yet" — not a 500 on every load.
// ⚠ EVERY ANSWER IS no-store: the URL in it is a credential.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { requireMembership } from '@/lib/require-membership';
import { feedUrls, isMissingTable, newFeedToken } from '@/lib/calendar-feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
type Supa = Awaited<ReturnType<typeof clientForRequest>>;
type LinkRow = { token: string; created_at: string | null; rotated_at: string | null };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}
function notSetUp() {
  return json({ error: "Calendar feed isn't set up yet.", code: 'feed_not_set_up' }, 503);
}
function failed(context: string, error: { message?: string } | null) {
  console.error(`[shape-api] ${context}:`, error?.message ?? error);
  return json({ error: "Couldn't load your calendar link just now." }, 503);
}

function origin(request: Request): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/+$/, '');
}
function answer(request: Request, row: LinkRow, extra: Record<string, unknown> = {}) {
  return json({ ...feedUrls(origin(request), row.token), createdAt: row.created_at, rotatedAt: row.rotated_at, ...extra });
}

// The caller, if they are a coach; otherwise the response to send.
async function coach(request: Request): Promise<{ userId: string; supabase: Supa } | { response: NextResponse }> {
  const denied = await requireMembership(request);
  if (denied) return { response: denied };
  const user = await currentUser(request);
  if (!user) return { response: json({ error: 'Authentication required.' }, 401) };
  const supabase = await clientForRequest(request);
  const [tr, nu] = await Promise.all([
    supabase.from('trainers').select('id').eq('owner_id', user.id).maybeSingle(),
    supabase.from('nutritionists').select('id').eq('owner_id', user.id).maybeSingle(),
  ]);
  if (tr.data || nu.data) return { userId: user.id, supabase };
  // A read that failed is not an answer: "you are not a coach" would be a claim nobody made.
  if (tr.error || nu.error) return { response: failed('calendar feed: coach read', tr.error ?? nu.error) };
  return { response: json({ error: 'Calendar feeds are for coaches.' }, 403) };
}

const COLS = 'token, created_at, rotated_at';

async function create(supabase: Supa, userId: string): Promise<{ row: LinkRow | null; error: { code?: string; message?: string } | null }> {
  const { data, error } = await supabase
    .from('calendar_feed_tokens').insert({ user_id: userId, token: newFeedToken() }).select(COLS).single();
  if (!error) return { row: data as LinkRow, error: null };
  // Two tabs opening Settings at once both find no row and both insert; the second loses on
  // the primary key. Its answer is the row the first one wrote.
  if (error.code === '23505') {
    const again = await supabase.from('calendar_feed_tokens').select(COLS).eq('user_id', userId).maybeSingle();
    return { row: (again.data as LinkRow | null) ?? null, error: again.error };
  }
  return { row: null, error };
}

export async function GET(request: Request) {
  const c = await coach(request);
  if ('response' in c) return c.response;
  const { data, error } = await c.supabase.from('calendar_feed_tokens').select(COLS).eq('user_id', c.userId).maybeSingle();
  if (error) return isMissingTable(error) ? notSetUp() : failed('calendar feed: link read', error);
  if (data) return answer(request, data as LinkRow);
  const made = await create(c.supabase, c.userId);
  if (made.error || !made.row) return isMissingTable(made.error) ? notSetUp() : failed('calendar feed: link create', made.error);
  return answer(request, made.row);
}

export async function POST(request: Request) {
  const c = await coach(request);
  if ('response' in c) return c.response;
  const parsed = await readJson<{ rotate?: unknown }>(request, { allowEmpty: true });
  if (!parsed.ok) return parsed.response;
  // ⚠ ONLY AN EXPLICIT `rotate: true` RESETS. A reset kills every calendar subscribed to the
  // old link, so an empty or mistyped body must not be able to do it.
  if (parsed.data?.rotate !== true) return json({ error: 'Send { "rotate": true } to reset your link.' }, 400);
  const { data, error } = await c.supabase
    .from('calendar_feed_tokens')
    .update({ token: newFeedToken(), rotated_at: new Date().toISOString() })
    .eq('user_id', c.userId)
    .select(COLS)
    .maybeSingle();
  if (error) return isMissingTable(error) ? notSetUp() : failed('calendar feed: link reset', error);
  if (data) return answer(request, data as LinkRow, { rotated: true });
  // Reset before the link was ever made: making it IS the reset.
  const made = await create(c.supabase, c.userId);
  if (made.error || !made.row) return isMissingTable(made.error) ? notSetUp() : failed('calendar feed: link create', made.error);
  return answer(request, made.row, { rotated: true });
}
