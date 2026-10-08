'use server';

// Replying to "Talk to a person" (the Ask Nora plan, step 5). A signed-in account sends its
// question from Nora's chat (POST /api/support/request); an admin answers it here.
//
// The reply is written three places, in this order:
//   1. the request row, answered (only while it is still open, so two admins never both reply);
//   2. the account's Nora conversation, as a message from the Shape team, so it is waiting on
//      the website and in the app (appendTeamToThread, the same conditional write the devices use);
//   3. an email to the account.
// The row is the record; a reply the thread or the email could not take is said on the page.
//
// Admin-guarded via requireAdminUser(); written with the service role.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminUser } from '@/lib/admin-access';
import { sendEmail } from '@/lib/email';
import { cleanReply, appendTeamToThread, replyEmail } from '@/lib/supportRequests.mjs';

function clean(value: FormDataEntryValue | null, max = 80): string {
  return String(value ?? '').trim().slice(0, max);
}

export async function replySupportRequest(formData: FormData): Promise<void> {
  const admin = await requireAdminUser();
  const id = clean(formData.get('request_id'));
  const reply = cleanReply(String(formData.get('reply') ?? ''));
  if (!id) redirect('/dashboard/support?error=missing_request');
  if (!reply) redirect('/dashboard/support?error=empty_reply');

  const db = createAdminClient();
  const now = new Date();
  const { data: row, error } = await db
    .from('support_requests')
    .update({ status: 'answered', reply, replied_by_email: admin.email, replied_at: now.toISOString() })
    .eq('id', id)
    .eq('status', 'open')
    .select('id, user_id, question')
    .maybeSingle<{ id: string; user_id: string; question: string }>();
  if (error) redirect(`/dashboard/support?error=${encodeURIComponent('db_' + (error.code ?? 'error'))}`);
  if (!row) redirect('/dashboard/support?updated=already_answered');

  const thread = await appendTeamToThread(db, row.user_id, reply, now).catch(() => ({ ok: false }));

  let emailed = false;
  try {
    const { data: who } = await db.auth.admin.getUserById(row.user_id);
    const to = who?.user?.email ?? null;
    if (to) {
      const { data: profile } = await db.from('profiles').select('full_name').eq('id', row.user_id).maybeSingle<{ full_name: string | null }>();
      const mail = replyEmail({ name: profile?.full_name ?? null, question: row.question, reply });
      emailed = (await sendEmail({ to, subject: mail.subject, html: mail.html, text: mail.text })).ok;
    }
  } catch {
    emailed = false;
  }

  revalidatePath('/dashboard/support');
  const outcome = thread.ok && emailed ? 'answered' : thread.ok ? 'answered_not_emailed' : emailed ? 'answered_by_email_only' : 'answered_not_delivered';
  redirect(`/dashboard/support?updated=${outcome}`);
}

export async function closeSupportRequest(formData: FormData): Promise<void> {
  await requireAdminUser();
  const id = clean(formData.get('request_id'));
  if (!id) redirect('/dashboard/support?error=missing_request');
  const db = createAdminClient();
  const { data: row, error } = await db
    .from('support_requests')
    .update({ status: 'closed' })
    .eq('id', id)
    .eq('status', 'open')
    .select('id')
    .maybeSingle<{ id: string }>();
  if (error) redirect(`/dashboard/support?error=${encodeURIComponent('db_' + (error.code ?? 'error'))}`);
  revalidatePath('/dashboard/support');
  redirect(`/dashboard/support?updated=${row ? 'closed' : 'already_answered'}`);
}
