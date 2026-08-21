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
  { table: 'cycle_events', col: 'user_id' },               // WA MHMD consumer health data (The Cycle)
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
  // ⚠ COACH-OWNED BUT CLIENT-KEYED — the axis the list above misses.
  // The three tables below carry BOTH an owner_id and a client_id, and only the
  // owner side was ever considered. Verified against the live catalog: the ONLY
  // foreign key across all three is coach_grocery_lists.owner_id -> auth.users
  // (cascade). There is no FK on any client_id — not to auth.users and not to
  // profiles — so on a MEMBER's deletion nothing cascades and nothing nulls, and
  // their uuid stays in the row indefinitely. Erasing by client_id is what the
  // retention schedule already promises; a row keyed to a deleted member has no
  // meaning to the coach either, so this orphans nothing.
  { table: 'coach_focus_banners', col: 'client_id' },
  { table: 'coach_grocery_lists', col: 'client_id' },
  { table: 'coach_pushed_items', col: 'client_id' },
];

// Storage buckets that hold the user's files under a `<uid>/` prefix (the purge
// walks that folder). `coach-credentials` holds a coach's COI/certification uploads;
// `member-films` holds a member's M5 intro film — both PUBLIC buckets with no other
// owner UI to remove the object, so they're purged here or the file is orphaned.
const BUCKETS = ['progress-photos', 'community-photos', 'meal-notes', 'coach-media', 'coach-credentials', 'member-films'];

// Remove every object under `<uid>/` (files AND anything nested in sub-folders), and
// only report success if nothing errored — so a "purged" result can't hide files left
// behind (CWE-459). Two hazards handled:
//   • Deletion SHIFTS the remaining objects down, so we must NOT paginate by advancing
//     an offset (that would skip the shifted objects and orphan them for a >PAGE
//     folder); we re-list from the start each pass and remove until no files remain.
//   • `list(prefix)` returns a sub-folder as a PREFIX entry (id === null, e.g.
//     coach-media's `<uid>/listing/…`) whose CONTENTS aren't in this page — so we
//     RECURSE into each prefix, or those public objects would survive account deletion
//     while the audit falsely marks the bucket purged.
async function purgeBucket(admin: ReturnType<typeof createAdminClient>, bucket: string, uid: string): Promise<boolean> {
  const PAGE = 1000;
  // Empty `prefix` completely; returns true only if nothing was left un-removed. Re-lists
  // from the start each pass (deletion-shift can't skip a >PAGE folder) and loops until the
  // listing is EXHAUSTED — NOT until a page happens to hold no files, since a page can be
  // all sub-folder prefixes with real files sorted after it. A page that makes no progress
  // (nothing removable) bails as false so an un-deletable entry can't spin the loop.
  const purgePrefix = async (prefix: string): Promise<boolean> => {
    for (;;) {
      const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: PAGE });
      if (error) {
        // An ABSENT bucket (404 / "not found") has nothing to orphan — treat it as
        // already purged so a not-yet-provisioned bucket (e.g. member-films before its
        // migration reaches this env) can't hard-block account deletion. This preserves
        // the route's "no-ops gracefully on missing buckets" guarantee. Any OTHER error
        // (a real list failure on an existing bucket) still fails, so we never delete the
        // auth user while removable objects might remain.
        const e = error as { message?: string; status?: number; statusCode?: number };
        if (e?.status === 404 || e?.statusCode === 404 || /not\s*found/i.test(e?.message || '')) return true;
        return false;
      }
      const entries = data || [];
      if (!entries.length) return true; // fully cleared
      const files = entries.filter((o) => o && o.name && o.id);       // real objects
      const folders = entries.filter((o) => o && o.name && !o.id);    // sub-folder prefixes
      let progressed = false;
      for (const f of folders) {
        if (!(await purgePrefix(`${prefix}/${f.name}`))) return false; // a nested object stuck → bail
        progressed = true;                                            // an emptied folder vanishes next list
      }
      if (files.length) {
        const { error: rmErr } = await admin.storage.from(bucket).remove(files.map((o) => `${prefix}/${o.name}`));
        if (rmErr) return false;
        progressed = true;
      }
      if (!progressed) return false; // page held only un-actionable entries — don't spin
    }
  };
  try {
    return await purgePrefix(uid);
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

  // 1. Storage purge FIRST. If any bucket can't be fully cleared we abort BEFORE deleting
  //    any DB row or the auth user — otherwise a storage failure would leave a PARTIAL
  //    erasure (health/personal rows gone, but the account + its public media remain).
  //    Aborting here keeps everything intact for a clean retry, and never orphans media in
  //    a public bucket with no owner left to remove it (CWE-459). The row purge below and
  //    the auth delete are idempotent, so a retry converges on full erasure.
  let allBucketsPurged = true;
  for (const b of BUCKETS) {
    if (await purgeBucket(admin, b, uid)) bucketsPurged.push(b);
    else allBucketsPurged = false;
  }
  if (!allBucketsPurged) {
    if (auditId) {
      try {
        await admin.from('account_deletions').update({
          buckets_purged: bucketsPurged,
          note: 'storage purge incomplete — nothing deleted; retry required',
        }).eq('id', auditId);
      } catch { /* non-fatal */ }
    }
    return NextResponse.json({ error: 'Could not fully remove your files. Please try again in a moment.' }, { status: 500 });
  }

  // 2. Explicit row purge (covers tables that don't cascade on auth-user delete).
  for (const t of PURGE) {
    try {
      const { error } = await admin.from(t.table).delete().eq(t.col, uid);
      if (!error) purged.push(t.table);
    } catch { /* table may not exist; continue */ }
  }

  // 3. Delete the auth user — cascades any remaining FK-linked rows.
  let authDeleted = false;
  try {
    const { error } = await admin.auth.admin.deleteUser(uid);
    authDeleted = !error;
  } catch { /* fall through; data is already purged */ }

  // 4. Best-effort sweep of anything a still-authenticated concurrent session wrote in the
  //    window between the storage pass (step 1) and this delete — those objects wouldn't
  //    have been listed by step 1, and the account is now gone, so re-purge to catch them.
  //    Best-effort (the account is already deleted; a straggler written with an access token
  //    still valid until its expiry is caught by the platform-wide orphan-GC follow-up).
  if (authDeleted) {
    for (const b of BUCKETS) { await purgeBucket(admin, b, uid); }
  }

  // 5. Close the audit row.
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
