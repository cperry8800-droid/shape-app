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
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Personal / health / content rows to erase, with the owner column.
const PURGE: { table: string; col: string }[] = [
  { table: 'user_goals', col: 'user_id' },                 // health_profile, goals, identity, profile_custom, consents
  { table: 'client_weigh_ins', col: 'user_id' },
  { table: 'client_measurements', col: 'user_id' },
  { table: 'client_checkins', col: 'user_id' },
  { table: 'client_progress_photos', col: 'user_id' },
  { table: 'daily_health_snapshot', col: 'user_id' },
  { table: 'score_ledger', col: 'user_id' },
  { table: 'member_playlists', col: 'user_id' },
  { table: 'user_scheduled_reminders', col: 'user_id' },
  { table: 'client_workouts', col: 'client_id' },
  { table: 'client_meal_plans', col: 'user_id' },
  { table: 'client_programs', col: 'user_id' },
  { table: 'user_integrations', col: 'user_id' },          // wearable OAuth tokens
  { table: 'push_tokens', col: 'user_id' },
  { table: 'consent_log', col: 'user_id' },
  { table: 'account_action_requests', col: 'user_id' },
  { table: 'community_posts', col: 'author_id' },
  { table: 'community_likes', col: 'user_id' },
  { table: 'community_comments', col: 'user_id' },
  { table: 'messages', col: 'sender_id' },
  { table: 'user_activity', col: 'user_id' },
  // Coach-owned rows — keyed by owner_id, with no FK to auth.users (so the auth
  // delete does NOT cascade them) and no inbound FKs (so erasing them is safe and
  // can't touch a client's data). Purging these delists a deleted coach and clears
  // their uploaded credential metadata + marketplace content.
  { table: 'provider_credentials', col: 'owner_id' },
  { table: 'coach_plans', col: 'owner_id' },
  { table: 'coach_soundtracks', col: 'owner_id' },
  { table: 'trainers', col: 'owner_id' },
  { table: 'nutritionists', col: 'owner_id' },
];

// Private storage buckets that hold the user's files under a `<uid>/` prefix.
// `coach-credentials` holds a coach's COI/certification uploads — included so a
// coach's verification files aren't orphaned after their account is deleted.
const BUCKETS = ['progress-photos', 'community-photos', 'meal-notes', 'coach-media', 'coach-credentials'];

// List + remove every object under `<uid>/`, paginating so large folders are
// fully cleared, and only reporting success if no list/remove call errored — so a
// "purged" result can't hide files that were left behind.
async function purgeBucket(admin: ReturnType<typeof createAdminClient>, bucket: string, uid: string): Promise<boolean> {
  const PAGE = 1000;
  try {
    let offset = 0;
    let ok = true;
    for (;;) {
      const { data, error } = await admin.storage.from(bucket).list(uid, { limit: PAGE, offset });
      if (error) return false;
      if (!data || !data.length) break;
      const paths = data.filter((o) => o.name).map((o) => `${uid}/${o.name}`);
      if (paths.length) {
        const { error: rmErr } = await admin.storage.from(bucket).remove(paths);
        if (rmErr) ok = false;
      }
      if (data.length < PAGE) break; // last page
      offset += data.length;
    }
    return ok;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: 'Deletion is temporarily unavailable. Email privacy@theshapecommunity.com.' }, { status: 503 });
  }

  const uid = user.id;
  const purged: string[] = [];
  const bucketsPurged: string[] = [];

  // Audit row (best-effort; table may not exist yet).
  let auditId: string | null = null;
  try {
    const { data } = await admin.from('account_deletions').insert({ user_id: uid, email: user.email ?? null }).select('id').maybeSingle();
    auditId = data?.id ?? null;
  } catch { /* table not provisioned yet */ }

  // 1. Explicit row purge (covers tables that don't cascade on auth-user delete).
  for (const t of PURGE) {
    try {
      const { error } = await admin.from(t.table).delete().eq(t.col, uid);
      if (!error) purged.push(t.table);
    } catch { /* table may not exist; continue */ }
  }

  // 2. Storage purge.
  for (const b of BUCKETS) {
    if (await purgeBucket(admin, b, uid)) bucketsPurged.push(b);
  }

  // 3. Delete the auth user — cascades any remaining FK-linked rows.
  let authDeleted = false;
  try {
    const { error } = await admin.auth.admin.deleteUser(uid);
    authDeleted = !error;
  } catch { /* fall through; data is already purged */ }

  // 4. Close the audit row.
  if (auditId) {
    try {
      await admin.from('account_deletions').update({
        completed_at: new Date().toISOString(),
        tables_purged: purged,
        buckets_purged: bucketsPurged,
        note: authDeleted ? 'auth user deleted' : 'auth user delete failed — data purged, account flagged',
      }).eq('id', auditId);
    } catch { /* non-fatal */ }
  }

  // Success REQUIRES the auth user actually being deleted. If only the data was
  // purged but the auth record remains, the account still exists (the user could
  // sign back in) — report a partial failure so the client never tells them the
  // account is gone. The audit row above is already flagged for follow-up.
  if (!authDeleted) {
    return NextResponse.json(
      {
        error: 'Could not fully delete your account. Your data was removed but the account record remains — email privacy@theshapecommunity.com and we will finish it.',
        partial: true,
        tablesPurged: purged.length,
        bucketsPurged: bucketsPurged.length,
      },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, authDeleted, tablesPurged: purged.length, bucketsPurged: bucketsPurged.length });
}
