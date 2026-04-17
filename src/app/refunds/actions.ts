'use server';

// User-initiated refund requests. A client clicks "Request refund" on a
// subscription or one-time purchase card; we insert a refund_requests row
// with status 'pending'. An admin reviews in the Stripe dashboard and
// issues the refund there; the charge.refunded webhook flips the row to
// 'refunded'.

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function requestRefund(formData: FormData): Promise<void> {
  const subscriptionId = String(formData.get('subscription_id') ?? '');
  const oneTimePurchaseId = String(formData.get('one_time_purchase_id') ?? '');
  const reason = String(formData.get('reason') ?? '').slice(0, 1000);

  const hasSub = subscriptionId.length > 0;
  const hasOneTime = oneTimePurchaseId.length > 0;
  if (hasSub === hasOneTime) {
    redirect('/dashboard/client?error=invalid_refund');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Confirm the target row actually belongs to this user before inserting
  // a refund request. RLS already limits reads to the owner, so if the
  // select comes back empty the id is bogus / not theirs.
  if (hasSub) {
    const { data: row } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('id', subscriptionId)
      .maybeSingle();
    if (!row) redirect('/dashboard/client?error=not_found');
  } else {
    const { data: row } = await supabase
      .from('one_time_purchases')
      .select('id')
      .eq('id', oneTimePurchaseId)
      .maybeSingle();
    if (!row) redirect('/dashboard/client?error=not_found');
  }

  await supabase.from('refund_requests').insert({
    client_id: user.id,
    subscription_id: hasSub ? subscriptionId : null,
    one_time_purchase_id: hasOneTime ? oneTimePurchaseId : null,
    reason: reason || null,
    status: 'pending',
  });

  revalidatePath('/dashboard/client');
  redirect('/dashboard/client?notice=refund_requested');
}
