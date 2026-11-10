'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminUser } from '@/lib/admin-access';
import { sendEmail } from '@/lib/email';
import { rejectionEmail } from '@/lib/coach-application-emails';
import { belowExperienceStandard } from '@/lib/provider-experience.mjs';
import {
  BackgroundCheckStatus,
  asRecord,
  withAdminBackgroundCheck,
} from '@/lib/provider-applications';
import {
  MIGRATION,
  approvalBlocker,
  claimForApproval,
  experienceExceptionRecord,
  provisionApproval,
  recordDecisionEmail,
  releaseApprovalClaim,
  requestConfirmation,
  resolveApprovalBinding,
  reviewWriteError,
  pendingConfirmation,
  stampedAccountId,
  type ApprovalBinding,
  type ProviderApplication,
  type ProviderRole,
} from '@/lib/coach-approval';

const PAGE = '/dashboard/applications';

function clean(value: FormDataEntryValue | null, max = 2000): string {
  return String(value ?? '').trim().slice(0, max);
}

/** The stamped sender's own address, or null (sent signed out, the account is gone, or it has none). */
async function stampedAccountEmail(admin: ReturnType<typeof createAdminClient>, details: unknown): Promise<string | null> {
  const id = stampedAccountId(details);
  if (!id) return null;
  try {
    const { data } = await admin.auth.admin.getUserById(id);
    return data?.user?.email || null;
  } catch {
    return null;
  }
}

/** Back to the review page with a message for the admin. Throws (Next's redirect), so never inside a try. */
function backToReview(query: Record<string, string>): never {
  redirect(`${PAGE}?${new URLSearchParams(query).toString()}`);
}

async function updateBackgroundCheckStatus(
  formData: FormData,
  status: Exclude<BackgroundCheckStatus, 'consent_received'>
): Promise<void> {
  const adminUser = await requireAdminUser();
  const applicationId = clean(formData.get('application_id'), 80);
  const notes = clean(formData.get('review_notes'), 4000);
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: application, error: appError } = await admin
    .from('provider_applications')
    .select('status, admin_review')
    .eq('id', applicationId)
    .single();
  if (appError) throw reviewWriteError(appError);

  // ⚠ A BACKGROUND-CHECK CLICK DOES NOT REOPEN AN APPROVED APPLICATION. It used to set
  // status 'in_review' unconditionally, so a click on an approved card made a live coach's
  // application read as undecided (and approvable again).
  if (application?.status === 'approved') backToReview({ notice: 'locked_approved' });

  // The check is recorded in admin_review, never in the applicant's `details`.
  const nextReview = withAdminBackgroundCheck(application?.admin_review, status, adminUser.id, now);
  const { error } = await admin
    .from('provider_applications')
    .update({
      status: 'in_review',
      reviewed_by: adminUser.id,
      reviewed_at: now,
      review_notes: notes || null,
      admin_review: nextReview,
    })
    .eq('id', applicationId)
    .neq('status', 'approved');
  if (error) throw reviewWriteError(error);

  revalidatePath(PAGE);
  backToReview({ updated: `background_${status}` });
}

export async function markBackgroundCheckRequested(formData: FormData): Promise<void> {
  await updateBackgroundCheckStatus(formData, 'requested');
}

export async function markBackgroundCheckNeedsReview(formData: FormData): Promise<void> {
  await updateBackgroundCheckStatus(formData, 'needs_review');
}

export async function markBackgroundCheckClear(formData: FormData): Promise<void> {
  await updateBackgroundCheckStatus(formData, 'clear');
}

export async function markApplicationInReview(formData: FormData): Promise<void> {
  const adminUser = await requireAdminUser();
  const applicationId = clean(formData.get('application_id'), 80);
  const notes = clean(formData.get('review_notes'), 4000);
  const admin = createAdminClient();

  const { data: application, error: appError } = await admin
    .from('provider_applications')
    .select('status, admin_review')
    .eq('id', applicationId)
    .single();
  if (appError) throw reviewWriteError(appError);
  // An approved application has a live coach behind it; "in review" would make it approvable again.
  if (application?.status === 'approved') backToReview({ notice: 'locked_approved' });

  // ⚠ REOPENING WITHDRAWS AN APPROVAL WAITING FOR ITS ACCOUNT'S CONFIRM. Left in place, the account
  // could still confirm an application the reviewer had taken back; Approve again sends a new one.
  const review = asRecord(application?.admin_review);
  const { error } = await admin
    .from('provider_applications')
    .update({
      status: 'in_review',
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes || null,
      ...(pendingConfirmation({ admin_review: review }) ? { admin_review: { ...review, pending_confirmation: null } } : {}),
    })
    .eq('id', applicationId)
    .neq('status', 'approved');
  if (error) throw error;

  revalidatePath(PAGE);
  backToReview({ updated: 'in_review' });
}

export async function rejectApplication(formData: FormData): Promise<void> {
  const adminUser = await requireAdminUser();
  const applicationId = clean(formData.get('application_id'), 80);
  const notes = clean(formData.get('review_notes'), 4000);
  // The ONLY words of the reviewer's that reach the applicant: a separate field, empty by default.
  // The internal review notes are never sent.
  const applicantNote = clean(formData.get('applicant_note'), 2000);
  const admin = createAdminClient();

  const { data: application, error: appError } = await admin
    .from('provider_applications')
    .select('id, status, provider_type, first_name, email, details, admin_review')
    .eq('id', applicationId)
    .single();
  if (appError) throw reviewWriteError(appError);
  const typed = application as Pick<ProviderApplication, 'id' | 'status' | 'provider_type' | 'first_name' | 'email' | 'details' | 'admin_review'>;

  // ⚠ REJECTING AN APPROVED APPLICATION WOULD NOT TAKE THE COACH DOWN. The listing approval
  // published stays live whatever the application's status says, so a reject here only made the
  // record lie. The coach tables have no suspended/hidden column yet, and deleting a listing
  // breaks its subscriptions, so the action is refused and the page says what is missing.
  if (typed.status === 'approved') backToReview({ notice: 'reject_approved' });
  if (typed.status === 'rejected') backToReview({ notice: 'already_rejected' });

  const now = new Date().toISOString();
  const nextReview: Record<string, unknown> = {
    ...asRecord(typed.admin_review),
    applicant_note: applicantNote || null,
    // ⚠ A REJECTION ENDS AN APPROVAL WAITING FOR ITS ACCOUNT'S CONFIRM, so reopening it later
    // cannot let the account confirm what was rejected.
    pending_confirmation: null,
    decision: { decision: 'rejected', at: now, by: adminUser.id },
  };
  const { data: changed, error } = await admin
    .from('provider_applications')
    .update({
      status: 'rejected',
      reviewed_by: adminUser.id,
      reviewed_at: now,
      review_notes: notes || 'Rejected from admin review.',
      admin_review: nextReview,
    })
    .eq('id', applicationId)
    .in('status', ['pending', 'in_review', 'withdrawn'])
    .select('id');
  if (error) throw reviewWriteError(error);
  // Decided by someone else between the read and the write: they sent the email.
  if (!changed?.length) backToReview({ notice: 'already_decided' });

  revalidatePath(PAGE);
  const role: ProviderRole = typed.provider_type === 'nutritionist' ? 'nutritionist' : 'trainer';
  const mail = rejectionEmail({ firstName: typed.first_name, role, applicantNote });
  // Sent signed in: the decision goes to the account that applied, like an approval.
  const sent = await sendEmail({ to: (await stampedAccountEmail(admin, typed.details)) || typed.email, ...mail });
  await recordDecisionEmail(admin, applicationId, nextReview, 'rejection', sent);
  backToReview({ updated: 'rejected', email: sent.ok ? 'sent' : sent.error || 'failed' });
}

export async function approveApplication(formData: FormData): Promise<void> {
  const adminUser = await requireAdminUser();
  const applicationId = clean(formData.get('application_id'), 80);
  const notes = clean(formData.get('review_notes'), 4000);
  const applicantNote = clean(formData.get('applicant_note'), 2000);
  const admin = createAdminClient();

  const { data: application, error: appError } = await admin
    .from('provider_applications')
    .select('*')
    .eq('id', applicationId)
    .single();
  if (appError) throw appError;

  const typed = application as ProviderApplication;
  // ⚠ CHECKED BEFORE ANYTHING IS PROVISIONED. Without the 2026-10-12 column the final status
  // write fails AFTER the account and the listing exist, leaving a live coach on a pending
  // application with no email; `select('*')` names every column, so its absence is the signal.
  if (!application || !('admin_review' in (application as Record<string, unknown>))) {
    throw new Error(`The admin_review column is missing. Run ${MIGRATION} before approving applications.`);
  }
  // ⚠ APPROVAL IS ONE-SHOT. A second Approve re-published the listing over the coach's own edits
  // and reset their rating, subscribers and flags. An approved application is refused before
  // anything is provisioned.
  if (typed.status === 'approved') backToReview({ notice: 'already_approved' });
  // The type, the background check (from the admin's own record) and the 18+ date of birth.
  const blocker = approvalBlocker(typed);
  if (blocker) throw new Error(blocker);
  // ⚠ BELOW THE EXPERIENCE STANDARD IS APPROVED ONE BY ONE, ON PURPOSE. The application is never
  // refused for it (owner, 2026-10-12: "dont make it a hard no"), so the review is where the
  // decision is made, and the reviewer says so with a tick that is recorded with the approval.
  const belowStandard = belowExperienceStandard(typed.years_experience);
  if (belowStandard && formData.get('experience_exception') !== 'yes') {
    backToReview({ notice: 'experience_tick_required' });
  }

  const claim = await claimForApproval(admin, typed, adminUser.id);
  if (claim === 'in_progress') backToReview({ notice: 'approval_in_progress' });
  if (claim === 'conflict') backToReview({ notice: 'approval_conflict' });
  // The claim moved updated_at; the row as read is still the record to build on.

  let binding: ApprovalBinding;
  try {
    binding = await resolveApprovalBinding(admin, typed);
  } catch (bindError) {
    await releaseApprovalClaim(admin, typed);
    throw bindError;
  }
  if (binding.kind === 'account_gone') {
    await releaseApprovalClaim(admin, typed);
    backToReview({ notice: 'account_gone' });
  }

  const now = new Date().toISOString();
  const decision = {
    decidedBy: adminUser.id,
    decidedAt: now,
    notes,
    applicantNote,
    experienceException: experienceExceptionRecord(typed, belowStandard, now, adminUser.id),
  };

  if (binding.kind === 'confirm') {
    // An account in use holds the address of an application sent signed out: nothing is set up
    // until it confirms, signed in, on /coach/confirm.
    const sent = await requestConfirmation(admin, typed, binding, decision);
    if (!sent) backToReview({ notice: 'already_approved' });
    revalidatePath(PAGE);
    backToReview({ updated: 'awaiting_confirmation', email: sent.ok ? 'sent' : sent.error || 'failed', account: 'confirm' });
  }

  const outcome = await provisionApproval(admin, typed, binding, decision);
  // A concurrent Approve marked it first; that one sends the email.
  if (!outcome.done) backToReview({ notice: 'already_approved' });

  revalidatePath(PAGE);
  revalidatePath('/trainers');
  revalidatePath('/nutritionists');
  backToReview({
    updated: 'approved',
    email: outcome.email.ok ? 'sent' : outcome.email.error || 'failed',
    account: binding.setPasswordUrl ? 'new' : binding.source === 'stamped' ? 'stamped' : 'existing',
  });
}
