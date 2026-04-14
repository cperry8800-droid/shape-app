'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function updateProfile(
  formData: FormData
): Promise<{ error: string } | { ok: true }> {
  const fullName = String(formData.get('full_name') ?? '').trim();
  const primaryRole = String(formData.get('role') ?? '');

  if (!['client', 'trainer', 'nutritionist'].includes(primaryRole)) {
    return { error: 'Invalid role.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  // Read current roles so we can union the new primary role into the set
  // rather than replace it — matches Option B multi-role behavior.
  const { data: current } = await supabase
    .from('profiles')
    .select('roles')
    .eq('id', user.id)
    .maybeSingle();

  const existing = (current?.roles ?? []) as string[];
  const mergedRoles = Array.from(new Set([...existing, primaryRole]));

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: fullName || null,
      role: primaryRole,
      roles: mergedRoles,
    })
    .eq('id', user.id);

  if (error) return { error: error.message };

  revalidatePath('/dashboard', 'layout');
  return { ok: true };
}
