'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Server action invoked by the claim page. Calls the `claim_provider_row`
 * SQL function (defined in the 2026-04-14 migration) which safely assigns
 * an unclaimed provider row to the signed-in user.
 *
 * If the row was already claimed (race / stale page), the function is a
 * no-op and we just redirect to the provider dashboard anyway.
 */
export async function claimProviderRow(formData: FormData): Promise<void> {
  const role = String(formData.get('role') ?? '');
  const providerIdRaw = String(formData.get('provider_id') ?? '');
  const providerId = parseInt(providerIdRaw, 10);

  if (!['trainer', 'nutritionist', 'gym'].includes(role)) {
    throw new Error('Invalid role.');
  }
  if (!Number.isFinite(providerId) || providerId <= 0) {
    throw new Error('Invalid provider id.');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const { error } = await supabase.rpc('claim_provider_row', {
    p_role: role,
    p_provider_id: providerId,
  });
  if (error) {
    console.error('[shape-app] claimProviderRow error', error);
    throw new Error(error.message);
  }

  // Also add the corresponding role to the user's profile so the dashboard
  // tabs flip on immediately.
  const { data: profile } = await supabase
    .from('profiles')
    .select('roles')
    .eq('id', user.id)
    .maybeSingle();

  const currentRoles: string[] = Array.isArray((profile as { roles?: string[] } | null)?.roles)
    ? ((profile as { roles: string[] }).roles ?? [])
    : [];
  if (!currentRoles.includes(role)) {
    await supabase
      .from('profiles')
      .update({ roles: [...currentRoles, role] })
      .eq('id', user.id);
  }

  revalidatePath('/dashboard', 'layout');

  const dashTarget =
    role === 'trainer'
      ? '/trainer-dashboard.html'
      : role === 'nutritionist'
        ? '/nutrition-schedule.html'
        : '/dashboard';
  redirect(dashTarget);
}
