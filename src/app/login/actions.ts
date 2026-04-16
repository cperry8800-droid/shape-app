'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function login(formData: FormData): Promise<{ error: string } | void> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const rawNext = String(formData.get('next') ?? '');
  // Only allow internal paths to avoid open-redirect.
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: error.message };

  revalidatePath('/', 'layout');
  redirect(next);
}

export async function signup(
  formData: FormData
): Promise<{ error: string } | { ok: true; needsConfirm: boolean }> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const rawRole = String(formData.get('role') ?? 'client');
  const role = ['client', 'trainer', 'nutritionist'].includes(rawRole) ? rawRole : 'client';

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/callback`,
      data: { role },
    },
  });

  if (error) return { error: error.message };

  // If Supabase requires email confirmation, there's no session yet.
  const needsConfirm = !data.session;

  if (!needsConfirm) {
    revalidatePath('/', 'layout');
    redirect('/dashboard');
  }

  return { ok: true, needsConfirm: true };
}

export async function requestPasswordReset(
  formData: FormData
): Promise<{ error: string } | { ok: true }> {
  const email = String(formData.get('email') ?? '');
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/callback?next=/reset-password`,
  });
  if (error) return { error: error.message };
  return { ok: true };
}

export async function updatePassword(
  formData: FormData
): Promise<{ error: string } | void> {
  const password = String(formData.get('password') ?? '');
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function logout(_formData?: FormData): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}
