// Which clients this coach has actually published a week for (review
// 2026-09-09, R6).
//
// The Today page's programming queue marked "Write plan" in ONE BROWSER'S
// localStorage. Two things were wrong with that, and they are different: a queue
// that lives in one browser is not a queue (a coach who programs on their laptop
// and checks on their phone sees two different lists), and a tick is not a
// publish — the mark said "✓ Plan written" whether or not a single session had
// been assigned, while a week genuinely published from the mobile Assign flow
// left the queue looking untouched.
//
// `coach_week_publishes` is the server-side idempotency ledger the week-shaped
// publish boundary writes (SPEC-guardrails.md §9.4). It is the only record that
// a week was actually delivered, so it is what the queue should read.
//
// GET ?since=YYYY-MM-DD -> { published: { [clientId]: { weekStart, at } } }
//
// ⚠ THE WINDOW IS WHEN THE PLAN WAS WRITTEN, NOT WHICH WEEK IT COVERS — and
// the first cut had this backwards. Filtering `week_start >= thisMonday` matches
// a week published LAST Monday for THIS week, which is last week's work: the
// queue would drop that client from "ready to program" on Friday while the plan
// for the coming week did not exist. The queue asks who the coach has programmed
// during THIS office week, so the filter is `created_at`, and `week_start` rides
// along in the payload only so the row can say which week was delivered.
//
// ⚠ `since` IS A LOCAL DATE COMPARED AT UTC MIDNIGHT. The caller's Monday comes
// from its own calendar; a coach west of UTC therefore sees the window open up
// to a day early. Acceptable for a nudge list — it can only ever include a
// publish, never hide one — and stated rather than silently assumed.
//
// ⚠ ADMIN CLIENT, SCOPED TO THE CALLER — and the scope is the whole security
// argument. RLS on that table is deliberately deny-all with NO policies (the
// ledger is never read or written directly by a browser), so a normal client
// reads nothing at all. Reaching it therefore means the service role, and the
// `coach_user_id` filter below is what keeps this from being a door onto every
// coach's ledger. It is applied unconditionally, from the AUTHENTICATED user id
// and never from a parameter — there is no request shape that can widen it.

import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/request-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const since = new URL(request.url).searchParams.get('since') ?? '';
  if (!ISO_DATE.test(since) || Number.isNaN(new Date(since + 'T00:00:00Z').getTime())) {
    return NextResponse.json({ error: 'since must be a YYYY-MM-DD date.' }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    // No service-role key configured. The queue must say it could not read the
    // ledger rather than render every client as unprogrammed.
    return NextResponse.json({ error: 'The publish ledger is unavailable.' }, { status: 503 });
  }

  const { data, error } = await admin
    .from('coach_week_publishes')
    .select('client_id, week_start, created_at')
    .eq('coach_user_id', user.id)
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  if (error) {
    // ⚠ NEVER AN EMPTY MAP ON FAILURE. An empty `published` is the positive
    // claim "you have not programmed anyone", which is exactly the sentence a
    // coach must not be shown when the truth is that the read failed.
    console.error('[shape-api] coach week-publishes read:', (error as { message?: string }).message);
    return NextResponse.json({ error: 'Could not read the publish ledger.' }, { status: 502 });
  }

  // ⚠ THE MOST RECENT PUBLISH WINS BY COMPARISON, NOT BY ARRIVAL ORDER. The
  // query asks for created_at descending, but a route that only keeps the first
  // row it sees is silently depending on that clause: drop or flip it and the
  // answer becomes the OLDEST publish, with nothing failing. The ORDER BY is a
  // courtesy to the planner; this is the rule.
  const published: Record<string, { weekStart: string; at: string }> = {};
  for (const row of (data ?? []) as Array<{ client_id: string; week_start: string; created_at: string | null }>) {
    // A row with no created_at cannot be placed in the window this route is
    // answering about, so it is not evidence of work done in it.
    if (!row.client_id || !row.week_start || !row.created_at) continue;
    const held = published[row.client_id];
    if (held && held.at >= row.created_at) continue; // ISO timestamps compare lexically
    published[row.client_id] = { weekStart: row.week_start, at: row.created_at };
  }
  return NextResponse.json({ published });
}
