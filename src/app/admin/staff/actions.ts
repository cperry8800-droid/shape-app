'use server';

// The Staff page's changes: adding someone to the Shape team, changing their level, removing
// them. Owner only (requireStaff('owner')); written with the service role.
//
// Every change is logged BEFORE it runs (src/lib/admin-activity.mjs): a change whose log row
// cannot be written does not run, and the row is then marked done or failed.
//
// Owners are not rows (src/lib/admin-access.ts names them in code), so none of these can add,
// demote or remove an owner, and no staff member can lock the owner out.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOwnerEmails, requireStaff } from '@/lib/admin-access';
import { cleanStaffEmail, parseAssignableLevel } from '@/lib/staff-levels.mjs';
import { finishActivity, startActivity } from '@/lib/admin-activity.mjs';

const PAGE = '/admin/staff';
const MISSING_TABLE = new Set(['42P01', 'PGRST205']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Account = { id: string; email_confirmed_at: string | null };

export async function saveStaffMember(formData: FormData): Promise<void> {
  const owner = await requireStaff('owner');
  const email = cleanStaffEmail(formData.get('email'));
  const level = parseAssignableLevel(formData.get('level'));
  if (!email) redirect(`${PAGE}?error=bad_email`);
  if (!level) redirect(`${PAGE}?error=bad_level`);
  if (getOwnerEmails().includes(email)) redirect(`${PAGE}?error=already_owner`);

  const db = createAdminClient();
  // By the sign-in identity (auth.users), the lookup the help desk uses: a profile row can be
  // missing or carry an old address.
  const { data: found, error: lookupError } = await db.rpc('admin_account_by_email', { p_email: email });
  if (lookupError) redirect(`${PAGE}?error=lookup_failed`);
  const account = (Array.isArray(found) ? found[0] : found) as Account | null | undefined;
  if (!account?.id) redirect(`${PAGE}?error=no_account`);
  if (!account.email_confirmed_at) redirect(`${PAGE}?error=unconfirmed`);

  const { data: existing, error: readError } = await db
    .from('staff_members')
    .select('level')
    .eq('user_id', account.id)
    .maybeSingle<{ level: string }>();
  if (readError) redirect(`${PAGE}?error=${MISSING_TABLE.has(String(readError.code)) ? 'missing_migration' : 'save_failed'}`);
  if (existing?.level === level) redirect(`${PAGE}?updated=unchanged`);

  const log = await startActivity(db, owner, {
    action: existing ? 'staff.change_level' : 'staff.add',
    targetUserId: account.id,
    targetEmail: email,
    details: existing ? { from: existing.level, level } : { level },
  });
  if (log.error) redirect(`${PAGE}?error=${log.error}`);

  const now = new Date().toISOString();
  const { error } = existing
    ? await db.from('staff_members').update({ level, email, updated_at: now }).eq('user_id', account.id)
    : await db.from('staff_members').insert({
        user_id: account.id,
        email,
        level,
        added_by: owner.id,
        added_by_email: owner.email,
        created_at: now,
        updated_at: now,
      });
  await finishActivity(db, log.id, error ? 'failed' : 'done');
  if (error) redirect(`${PAGE}?error=save_failed`);

  revalidatePath(PAGE);
  redirect(`${PAGE}?updated=${existing ? 'changed' : 'added'}`);
}

export async function removeStaffMember(formData: FormData): Promise<void> {
  const owner = await requireStaff('owner');
  const userId = String(formData.get('user_id') ?? '').trim();
  if (!UUID_RE.test(userId)) redirect(`${PAGE}?error=missing_member`);

  const db = createAdminClient();
  const { data: row, error: readError } = await db
    .from('staff_members')
    .select('email, level')
    .eq('user_id', userId)
    .maybeSingle<{ email: string; level: string }>();
  if (readError) redirect(`${PAGE}?error=${MISSING_TABLE.has(String(readError.code)) ? 'missing_migration' : 'save_failed'}`);
  if (!row) redirect(`${PAGE}?updated=already_removed`);

  const log = await startActivity(db, owner, {
    action: 'staff.remove',
    targetUserId: userId,
    targetEmail: row.email,
    details: { level: row.level },
  });
  if (log.error) redirect(`${PAGE}?error=${log.error}`);

  const { error } = await db.from('staff_members').delete().eq('user_id', userId);
  await finishActivity(db, log.id, error ? 'failed' : 'done');
  if (error) redirect(`${PAGE}?error=save_failed`);

  revalidatePath(PAGE);
  redirect(`${PAGE}?updated=removed`);
}
