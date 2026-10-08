// "Talk to a person" (the Ask Nora plan, step 5): a signed-in account sends its question,
// with its Nora conversation, to the Shape team.
//
// POST { question, surface?: 'web' | 'app', page? } -> { ok, id, emailed }
//   - 401 signed out: a visitor is given the team's email address instead;
//   - 400 an empty or too-long question;
//   - 429 `daily_limit` past DAILY_MAX in 24 hours (counted here, and enforced by the database);
//   - 503 `support_not_set_up` until supabase-migrations/2026-10-08-support-requests.sql runs.
//
// Written with the CALLER's client, so RLS holds the row to their own, open, unanswered one.
// The transcript is read from their stored conversation (nora_threads), never taken from the
// request. A person replies in the console (/dashboard/support): the reply reaches them in
// the same conversation and by email.
//
// ⚠ THE ROW IS THE INBOX; THE EMAIL IS THE BELL. When the email cannot be sent the request is
// still saved and listed in the console, and the answer says `emailed: false`.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { sendEmail } from '@/lib/email';
import { cleanQuestion, transcriptFrom, verifiedThread, supportEmail, DAILY_MAX, SUPPORT_INBOX_DEFAULT } from '@/lib/supportRequests.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}
type DbError = { code?: string; message?: string } | null;
function isMissingTable(error: DbError): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message ?? '');
}
const DAILY_LIMIT = { error: `You've sent ${DAILY_MAX} questions to the Shape team today. They reply to those here; for anything urgent, email info@theshapecommunity.com.`, code: 'daily_limit' };
const NOT_SET_UP = { error: "Talking to a person isn't set up yet. Email the Shape team at info@theshapecommunity.com.", code: 'support_not_set_up' };

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return json({ error: 'Sign in to send your question to the Shape team, or email info@theshapecommunity.com.' }, 401);
  const parsed = await readJson<{ question?: unknown; surface?: unknown; page?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const question = cleanQuestion(parsed.data.question);
  if (!question) return json({ error: 'Write your question (up to 2,000 characters).' }, 400);
  const surface = parsed.data.surface === 'app' ? 'app' : 'web';
  const page = typeof parsed.data.page === 'string' && parsed.data.page.trim() ? parsed.data.page.trim().slice(0, 80) : null;

  const supabase = await clientForRequest(request);
  // Three a day: counted from their own rows, which RLS lets them read.
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const counted = await supabase.from('support_requests').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', since);
  if (counted.error) {
    if (isMissingTable(counted.error)) return json(NOT_SET_UP, 503);
    return json({ error: 'Your question could not be sent right now. Try again in a moment.' }, 503);
  }
  if ((counted.count ?? 0) >= DAILY_MAX) return json(DAILY_LIMIT, 429);

  // Their conversation with Nora as stored: what the team reads beside the question. A thread
  // that cannot be read is sent without, never invented.
  const thread = await supabase.from('nora_threads').select('messages').eq('user_id', user.id).maybeSingle();
  const transcript = !thread.error && thread.data
    ? transcriptFrom(await verifiedThread(supabase, user.id, (thread.data as { messages?: unknown }).messages))
    : [];

  const created = await supabase.from('support_requests')
    .insert({ user_id: user.id, question, transcript, surface, page })
    .select('id').single();
  if (created.error || !created.data) {
    if (isMissingTable(created.error)) return json(NOT_SET_UP, 503);
    // The database's own count (the trigger in the migration): two sends at once, or a fourth.
    if (/support_request:daily_limit/.test(created.error?.message ?? '')) return json(DAILY_LIMIT, 429);
    return json({ error: 'Your question could not be sent right now. Try again in a moment.' }, 503);
  }
  const id = (created.data as { id: string }).id;

  const profile = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
  const name = !profile.error && profile.data ? ((profile.data as { full_name?: string | null }).full_name || null) : null;
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.theshapecommunity.com';
  const mail = supportEmail({ id, name, email: user.email || 'unknown', question, transcript, surface, page, consoleUrl: `${site.replace(/\/$/, '')}/dashboard/support` });
  const sent = await sendEmail({ to: process.env.SUPPORT_EMAIL || SUPPORT_INBOX_DEFAULT, subject: mail.subject, html: mail.html, text: mail.text }).catch(() => ({ ok: false }));
  return json({ ok: true, id, emailed: !!sent.ok });
}
