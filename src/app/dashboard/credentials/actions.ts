'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminUser } from '@/lib/admin-access';
import { createNotification } from '@/lib/notify';

function clean(value: FormDataEntryValue | null, max = 4000): string {
  return String(value ?? '').trim().slice(0, max);
}

const UUID = /^[0-9a-f-]{36}$/i;

// ⚠ A VERDICT IS ON THE VERSION THE ADMIN REVIEWED (2026-10-13-credential-review-revision-and-
// owner-cascade.sql). The review page carries the credential's `revision`, which the database bumps
// on every write; each verdict applies only while the row is still at it. Before it, a coach's edit
// landing while the admin was reading was approved, or rejected, unseen.
function reviewedRevision(formData: FormData): number {
  const revision = Number(clean(formData.get('revision'), 20));
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Reload the page: this review form has no credential version.');
  return revision;
}

// A verdict that matched no row: the coach changed the credentials since the page was opened, or
// removed them. Nothing was recorded; the page says which.
async function notRecorded(admin: ReturnType<typeof createAdminClient>, ownerId: string): Promise<never> {
  const { data, error } = await admin.from('provider_credentials').select('owner_id').eq('owner_id', ownerId).maybeSingle();
  // A failed read is not "no credentials" (Copilot, #2323).
  if (error) throw error;
  redirect(`/dashboard/credentials?updated=${data ? 'changed' : 'missing'}`);
}

// The marketplace Verified badge follows the credential in the database
// (2026-10-13-listing-badge-follows-credential.sql). Approval puts it on whichever listing(s) the
// owner holds (a coach can be both a trainer and a nutritionist) in the same transaction as the
// approval, through approve_provider_credential. Any write that leaves the credential not
// 'approved' takes it off in that write (provider_credentials_zz_unverify_listings), so rejecting
// or asking for changes needs no listing write here.
//
// ⚠ ONE TRANSACTION, NOT TWO CALLS (Codex, #2321). Approved in one call and badged in the next, a
// coach edit landing between them was sent back to 'pending' and then badged anyway.

export async function approveCredential(formData: FormData): Promise<void> {
  const adminUser = await requireAdminUser();
  const ownerId = clean(formData.get('owner_id'), 80);
  const notes = clean(formData.get('review_notes'));
  if (!UUID.test(ownerId)) throw new Error('Invalid coach id.');
  const revision = reviewedRevision(formData);
  const admin = createAdminClient();

  const { data: badged, error } = await admin.rpc('approve_provider_credential', {
    p_owner: ownerId,
    p_revision: revision,
    p_reviewer: adminUser.id,
    p_notes: notes || 'Credentials verified.',
  });
  if (error) throw error;
  // -1: changed since the admin looked; null: no credentials. Either way nothing was approved and
  // the coach is not told they are verified.
  if (badged === -1) redirect('/dashboard/credentials?updated=changed');
  if (badged === null) redirect('/dashboard/credentials?updated=missing');

  // Let the coach know (in-app bell + push spine).
  await createNotification(admin, {
    userId: ownerId,
    type: 'credential_verified',
    title: 'You’re verified ✓',
    body: 'Your credentials checked out — a Verified badge now shows on your marketplace profile.',
    route: 'credentials', // the coach's certifications ('profile' is a person's profile)
    data: { channels: { inapp: true, push: true, email: false } },
  });

  revalidatePath('/dashboard/credentials');
  revalidatePath('/trainers');
  revalidatePath('/nutritionists');
  redirect('/dashboard/credentials?updated=approved');
}

export async function rejectCredential(formData: FormData): Promise<void> {
  const adminUser = await requireAdminUser();
  const ownerId = clean(formData.get('owner_id'), 80);
  const notes = clean(formData.get('review_notes'));
  if (!UUID.test(ownerId)) throw new Error('Invalid coach id.');
  const revision = reviewedRevision(formData);
  const admin = createAdminClient();

  const { data: rejected, error } = await admin
    .from('provider_credentials')
    .update({
      review_status: 'rejected',
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes || 'Credentials could not be verified.',
      verified_at: null,
    })
    .eq('owner_id', ownerId)
    .eq('revision', revision)
    .select('owner_id');
  // Any previously granted badge came off with that write.
  if (error) throw error;
  if (!rejected?.length) await notRecorded(admin, ownerId);

  revalidatePath('/dashboard/credentials');
  revalidatePath('/trainers');
  revalidatePath('/nutritionists');
  redirect('/dashboard/credentials?updated=rejected');
}

export async function requestCredentialChanges(formData: FormData): Promise<void> {
  const adminUser = await requireAdminUser();
  const ownerId = clean(formData.get('owner_id'), 80);
  const notes = clean(formData.get('review_notes'));
  if (!UUID.test(ownerId)) throw new Error('Invalid coach id.');
  const revision = reviewedRevision(formData);
  const admin = createAdminClient();

  const { data: requested, error } = await admin
    .from('provider_credentials')
    .update({
      review_status: 'changes_requested',
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes || 'More information is needed.',
      // Requesting changes revokes the verified state until re-approved
      // (matches reject; provider_credentials has no separate `verified` column).
      verified_at: null,
    })
    .eq('owner_id', ownerId)
    .eq('revision', revision)
    .select('owner_id');
  // The marketplace badge came off with that write, so the coach isn't shown as verified.
  if (error) throw error;
  if (!requested?.length) await notRecorded(admin, ownerId);

  await createNotification(admin, {
    userId: ownerId,
    type: 'credential_changes',
    title: 'Credential review — a quick fix needed',
    body: notes ? notes.slice(0, 160) : 'We need a bit more to verify your credentials. Open your profile to update them.',
    route: 'credentials', // the coach's certifications ('profile' is a person's profile)
    data: { channels: { inapp: true, push: true, email: false } },
  });

  revalidatePath('/dashboard/credentials');
  revalidatePath('/trainers');
  revalidatePath('/nutritionists');
  redirect('/dashboard/credentials?updated=changes_requested');
}
