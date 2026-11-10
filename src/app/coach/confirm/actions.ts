'use server';

// The applicant's Confirm on /coach/confirm (2026-11-10): an approval of an application sent
// signed out, to an address whose Shape account is in use, waits for that account. Pressing
// Confirm, signed in AS that account, sets the coach up (src/lib/coach-approval.ts).
//
// ⚠ A POST, NEVER THE LINK ITSELF. Mail scanners open every link in an email, so a GET that set a
// coach up would be pressed by the scanner. The emailed link only opens the page.
// ⚠ THE SIGNED-IN ACCOUNT MUST BE THE ONE THE APPROVAL WAITS FOR. A server action is a public POST
// endpoint: everything is checked here, from the session and the stored record, never from the
// form beyond the application's id.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  CONFIRM_PATH,
  approvalBlocker,
  claimForApproval,
  pendingConfirmation,
  provisionApproval,
  type ProviderApplication,
} from '@/lib/coach-approval';

const OPEN = new Set(['pending', 'in_review']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Back to the confirm page with the outcome. Throws (Next's redirect), so never inside a try. */
function backToConfirm(applicationId: string, state: string): never {
  redirect(`${CONFIRM_PATH}?${new URLSearchParams({ application: applicationId, state }).toString()}`);
}

export async function confirmCoachApproval(formData: FormData): Promise<void> {
  const raw = String(formData.get('application_id') ?? '').trim();
  const applicationId = UUID.test(raw) ? raw : '';
  if (!applicationId) redirect(CONFIRM_PATH);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) redirect(`/login?next=${encodeURIComponent(`${CONFIRM_PATH}?application=${applicationId}`)}`);

  const admin = createAdminClient();
  const { data: application, error } = await admin
    .from('provider_applications')
    .select('*')
    .eq('id', applicationId)
    .maybeSingle();
  if (error) throw error;
  const typed = application as ProviderApplication | null;
  if (!typed) backToConfirm(applicationId, 'none');

  const pending = pendingConfirmation(typed);
  // Already done (a second press, another tab): the page says so.
  if (typed.status === 'approved') {
    const owner = (typed.admin_review as Record<string, unknown> | null)?.approved_provider as Record<string, unknown> | undefined;
    backToConfirm(applicationId, owner?.owner_id === user.id ? 'done' : 'none');
  }
  // Nothing waits for an account: never approved, rejected, withdrawn, or reopened since.
  if (!pending || !OPEN.has(typed.status)) backToConfirm(applicationId, 'none');
  if (pending.userId !== user.id) backToConfirm(applicationId, 'wrong_account');
  // The review can change after the admin's Approve: the same checks hold at Confirm.
  if (approvalBlocker(typed)) backToConfirm(applicationId, 'unavailable');

  // The claim the admin's Approve takes, so a Confirm and an Approve (or two Confirms) cannot both
  // set the coach up. `by` is the account: the record says who held it.
  const claim = await claimForApproval(admin, typed, user.id);
  if (claim !== 'claimed') backToConfirm(applicationId, 'busy');

  const outcome = await provisionApproval(
    admin,
    typed,
    { kind: 'provision', user, setPasswordUrl: null, existingAccount: true, mailTo: user.email || typed.email, source: 'stamped' },
    {
      decidedBy: pending.by,
      decidedAt: pending.at || undefined,
      notes: pending.notes,
      applicantNote: pending.applicantNote,
      experienceException: pending.experienceException,
      confirmedBy: user.id,
    }
  );
  if (!outcome.done) backToConfirm(applicationId, 'done');

  revalidatePath('/dashboard/applications');
  revalidatePath('/trainers');
  revalidatePath('/nutritionists');
  backToConfirm(applicationId, 'done');
}
