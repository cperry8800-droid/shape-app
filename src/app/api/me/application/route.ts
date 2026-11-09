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
// admin client's, scoped here to the caller: rows whose details carry their account id, or whose
// address is their sign-in address (approval matches an application to an account by address).

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

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return privateJson({ error: 'Authentication required.' }, { status: 401 });
  const email = String(user.email || '').trim().toLowerCase();
  const admin = createAdminClient();
  // Two exact reads, never a pattern built from the address: by account id, and by address.
  const reads = [
    admin.from('provider_applications').select(COLUMNS).eq('details->>user_id', user.id).order('created_at', { ascending: false }).limit(10),
  ];
  if (email) reads.push(admin.from('provider_applications').select(COLUMNS).eq('email', email).order('created_at', { ascending: false }).limit(10));
  const results = await Promise.all(reads);
  // ⚠ A FAILED READ IS NOT "NO APPLICATION": the row would offer to apply again over one in review.
  if (results.some((r) => r.error)) return privateJson({ error: 'Could not read your application.', code: 'unavailable' }, { status: 503 });
  const rows = results.flatMap((r) => (Array.isArray(r.data) ? r.data : []));
  return privateJson({ application: pickApplication(rows, { userId: user.id, email }) });
}
