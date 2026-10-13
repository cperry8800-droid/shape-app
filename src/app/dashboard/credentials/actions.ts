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

// Put the Verified badge on whichever marketplace coach row(s) the owner holds (a coach can be
// both a trainer and a nutritionist). Returns how many rows changed.
//
// Taking it off is the database's job: a credential row written as anything but 'approved'
// clears the owner's badge in the same statement (provider_credentials_zz_unverify_listings,
// 2026-10-13-listing-badge-follows-credential.sql), so rejecting or asking for changes needs no
// listing write here.
async function markListingsVerified(admin: ReturnType<typeof createAdminClient>, ownerId: string): Promise<number> {
  const at = new Date().toISOString();
  let changed = 0;
  for (const table of ['trainers', 'nutritionists'] as const) {
    const { data, error } = await admin
      .from(table)
      .update({ verified: true, verified_at: at })
      .eq('owner_id', ownerId)
      .select('id');
    if (error) throw error;
    changed += (data?.length ?? 0);
  }
  return changed;
}

export async function approveCredential(formData: FormData): Promise<void> {
  const adminUser = await requireAdminUser();
  const ownerId = clean(formData.get('owner_id'), 80);
  const notes = clean(formData.get('review_notes'));
  if (!UUID.test(ownerId)) throw new Error('Invalid coach id.');
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { error } = await admin
    .from('provider_credentials')
    .update({
      review_status: 'approved',
      reviewed_by: adminUser.id,
      reviewed_at: now,
      review_notes: notes || 'Credentials verified.',
      verified_at: now,
    })
    .eq('owner_id', ownerId);
  if (error) throw error;

  await markListingsVerified(admin, ownerId);

  // Let the coach know (in-app bell + push spine).
  await createNotification(admin, {
    userId: ownerId,
    type: 'credential_verified',
    title: 'You’re verified ✓',
    body: 'Your credentials checked out — a Verified badge now shows on your marketplace profile.',
    route: 'profile',
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
  const admin = createAdminClient();

  const { error } = await admin
    .from('provider_credentials')
    .update({
      review_status: 'rejected',
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes || 'Credentials could not be verified.',
      verified_at: null,
    })
    .eq('owner_id', ownerId);
  // Any previously granted badge came off with that write.
  if (error) throw error;

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
  const admin = createAdminClient();

  const { error } = await admin
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
    .eq('owner_id', ownerId);
  // The marketplace badge came off with that write, so the coach isn't shown as verified.
  if (error) throw error;

  await createNotification(admin, {
    userId: ownerId,
    type: 'credential_changes',
    title: 'Credential review — a quick fix needed',
    body: notes ? notes.slice(0, 160) : 'We need a bit more to verify your credentials. Open your profile to update them.',
    route: 'profile',
    data: { channels: { inapp: true, push: true, email: false } },
  });

  revalidatePath('/dashboard/credentials');
  revalidatePath('/trainers');
  revalidatePath('/nutritionists');
  redirect('/dashboard/credentials?updated=changes_requested');
}
