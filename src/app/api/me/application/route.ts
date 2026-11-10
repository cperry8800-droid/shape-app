// The signed-in person's own coach application: where it stands (owner, 2026-11-09: the app's Settings
// row "Coach on Shape" shows the status of an application, and the screen after sending says where to
// find it).
//
// GET -> { application: null }
//      | { application: { role, stage, status, submittedAt, decidedAt } }
//        stage: submitted | in_review | background_check | approved | not_approved | withdrawn
//        (src/lib/application-status.mjs). Nothing the reviewer wrote leaves the server.
//
// Auth: cookie session or Bearer token (the installed app sends no cookie). provider_applications has
// no applicant read policy (rows are written and reviewed with the service role), so the read is the
// admin client's, scoped here to the caller: rows /api/apply stamped with their account
// (details.account_id), set from the signed-in sender and never from the form. ⚠ NOT BY THE ADDRESS, NOR
// details.user_id (Codex on #2667): both are the form's, so anyone could file an application under
// someone else's address or id and put it in that person's Settings. An application sent signed out
// shows nowhere here; its applicant hears by email.

import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/request-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { pickApplication } from '@/lib/application-status.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };
const privateJson = (body: unknown, init?: { status?: number }) =>
  NextResponse.json(body, { ...(init || {}), headers: PRIVATE_HEADERS });

const COLUMNS = 'provider_type, status, email, details, admin_review, created_at, reviewed_at';
const OPEN_STATUSES = ['pending', 'in_review'];

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return privateJson({ error: 'Authentication required.' }, { status: 401 });
  const admin = createAdminClient();
  // Exact reads by the stamped account only. ⚠ THE OPEN ONES ARE READ ON THEIR OWN (Codex on #2667): a
  // window of the newest rows alone would drop an open application older than ten later decisions, and
  // pickApplication shows an open one first.
  const scoped = () => admin.from('provider_applications').select(COLUMNS).eq('details->>account_id', user.id);
  const newest = (q: ReturnType<typeof scoped>) => q.order('created_at', { ascending: false }).limit(10);
  const reads = [
    newest(scoped()),
    newest(scoped().in('status', OPEN_STATUSES)),
  ];
  const results = await Promise.all(reads);
  // ⚠ A FAILED READ IS NOT "NO APPLICATION": the row would offer to apply again over one in review.
  if (results.some((r) => r.error)) return privateJson({ error: 'Could not read your application.', code: 'unavailable' }, { status: 503 });
  const rows = results.flatMap((r) => (Array.isArray(r.data) ? r.data : []));
  return privateJson({ application: pickApplication(rows, { accountId: user.id }) });
}
