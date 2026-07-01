'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminUser } from '@/lib/admin-access';

/**
 * Server action invoked by the claim page. Calls the `claim_provider_row`
 * SQL function (defined in the 2026-04-14 migration) which safely assigns
 * an unclaimed provider row to the signed-in user.
 *
 * If the row was already claimed (race / stale page), the function is a
 * no-op and we just redirect to the provider dashboard anyway.
 */
export async function claimProviderRow(formData: FormData): Promise<void> {
  // SECURITY: provider assignment is ADMIN-MANAGED, never self-service. Approved
  // coaches already get an owned provider row at application-approval time
  // (applications/actions.ts), so the only unclaimed rows are seeded/demo ones —
  // letting any signed-in user claim one was a privilege escalation (coach role +
  // that profile's subscribers + revenue). Gate to admins (the migration's intent).
  await requireAdminUser();

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

  // Provider assignment is admin-managed (requireAdminUser above) and runs under
  // the SERVICE ROLE so claim_provider_row can be revoked from authenticated —
  // closing the direct-PostgREST bypass (AUTHZ-P2-claim-jack). The target owner
  // is passed explicitly since auth.uid() is null under the service role.
  const admin = createAdminClient();
  const { error } = await admin.rpc('claim_provider_row', {
    p_role: role,
    p_provider_id: providerId,
    p_owner_id: user.id,
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
