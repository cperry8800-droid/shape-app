// Self-serve account deletion (GDPR Art. 17 erasure, CCPA/state right to delete,
// WA MHMDA cascading deletion). The authenticated caller's account and personal
// data are erased: we explicitly purge their rows across the personal/health/
// content tables and their objects in the private storage buckets, then delete
// the auth user. A service-role audit row records the deletion. Authoritative
// financial/tax records live in Stripe and are retained there per our retention
// schedule — the Supabase rows are app-side references and are removed with the account.
//
// Why a service-role (admin) client rather than the user's RLS-scoped client:
//   (1) `auth.admin.deleteUser` is service-role-only;
//   (2) several owned tables have NO user-facing DELETE RLS policy (user_goals —
//       which holds the health profile —, user_integrations/OAuth tokens, score_ledger,
//       messages, and the coach trainers/nutritionists rows), so a user-scoped client
//       would SILENTLY fail to erase exactly the most sensitive data while reporting
//       success. An RLS client therefore cannot guarantee the erasure this endpoint
//       legally promises;
//   (3) the account_deletions audit table is service-role-only by design.
// Safety is preserved by construction: every delete is scoped to the *verified*
// caller's own id (`.eq(<owner col>, uid)` with uid = currentUser(request).id) — the
// admin client is never used to reach another user's rows.
//
// No-ops gracefully on missing tables/buckets, so it is safe to deploy before the
// account_deletions migration is applied (the audit write just fails quietly).

import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { issueDeleteConfirm, verifyDeleteConfirm, DELETE_CONFIRM_TTL_S } from '@/lib/delete-confirm';
import { createAdminClient } from '@/lib/supabase/admin';
import { eraseAccount } from '@/lib/account-erasure';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  // L1 (2026-10-08 review): a deletion takes two requests. The first earns a ten-minute token
  // bound to this account (428, `confirmToken`); only a request carrying it deletes. The clients
  // already ask the person to type DELETE; this is what makes the server know it was asked.
  const parsed = await readJson<{ confirmToken?: unknown }>(request, { allowEmpty: true });
  if (!parsed.ok) return parsed.response;
  const confirmToken = typeof parsed.data?.confirmToken === 'string' ? parsed.data.confirmToken : '';
  if (!confirmToken) {
    const issued = issueDeleteConfirm(user.id);
    if (!issued) {
      return NextResponse.json({ error: 'Deletion is temporarily unavailable. Email privacy@theshapecommunity.com.' }, { status: 503 });
    }
    return NextResponse.json(
      { confirmRequired: true, confirmToken: issued.token, expiresInSeconds: DELETE_CONFIRM_TTL_S },
      { status: 428, headers: { 'cache-control': 'no-store' } }
    );
  }
  if (!verifyDeleteConfirm(confirmToken, user.id)) {
    return NextResponse.json({ error: 'That confirmation has expired. Please start again.', code: 'confirm_invalid' }, { status: 403 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: 'Deletion is temporarily unavailable. Email privacy@theshapecommunity.com.' }, { status: 503 });
  }

  // The erasure itself is shared with the admin console's Remove (src/lib/account-erasure.ts).
  const result = await eraseAccount(admin, user);
  if (result.ok) {
    return NextResponse.json({ ok: true, authDeleted: true, tablesPurged: result.tablesPurged, bucketsPurged: result.bucketsPurged });
  }
  if (result.stage === 'storage') {
    return NextResponse.json({ error: 'Could not fully remove your files. Please try again in a moment.' }, { status: 500 });
  }
  if (result.stage === 'applications') {
    return NextResponse.json({ error: 'Could not fully remove your application data. Please try again in a moment.' }, { status: 500 });
  }
  // Success REQUIRES the auth user actually being deleted. If only the data was purged but the
  // auth record remains, the account still exists (the user could sign back in) — report a
  // partial failure so the client never tells them the account is gone.
  return NextResponse.json(
    {
      error: 'Could not fully delete your account. Your data was removed but the account record remains — email privacy@theshapecommunity.com and we will finish it.',
      partial: true,
      tablesPurged: result.tablesPurged,
      bucketsPurged: result.bucketsPurged,
    },
    { status: 500 },
  );
}
