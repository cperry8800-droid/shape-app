'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function login(formData: FormData): Promise<{ error: string } | void> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const role = String(formData.get('role') ?? 'client');
  const rawNext = String(formData.get('next') ?? '');
  // Only allow internal paths to avoid open-redirect.
  // Land the user inside the newdesign portal (matches the in-app role
  // switcher, which also points at /newdesign/...Dashboard.html).
  const roleDefaultNext =
    role === 'shape_radio'
      ? '/newdesign/Radio.html'
      : role === 'trainer'
      ? '/newdesign/TrainerDashboard.html'
      : role === 'nutritionist'
      ? '/newdesign/NutritionistDashboard.html'
      : '/newdesign/ClientDashboard.html';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : roleDefaultNext;
  const captchaToken = String(formData.get('captchaToken') ?? '');

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: captchaToken ? { captchaToken } : undefined,
  });

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
  const captchaToken = String(formData.get('captchaToken') ?? '');

  // Same contract as `login` above: an internal path only, or nothing. Signup had no `next` at
  // all, so a visitor sent here mid-task (the consultation page, which carries the coach and the
  // slot they picked) was returned to a dashboard with that context gone — on BOTH exits below.
  const rawNext = String(formData.get('next') ?? '');
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : null;

  const supabase = await createClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // The confirm-email exit. `/auth/callback` reads `next` and applies the identical
      // same-origin guard, so the destination is validated on both sides of the round trip.
      emailRedirectTo: `${origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`,
      ...(captchaToken ? { captchaToken } : {}),
      data: { role },
    },
  });

  if (error) return { error: error.message };

  // If Supabase requires email confirmation, there's no session yet.
  const needsConfirm = !data.session;

  if (!needsConfirm) {
    // The auto-confirm exit (no email step): a session already exists, so honor `next` directly.
    revalidatePath('/', 'layout');
    redirect(next ?? '/newdesign/ClientDashboard.html');
  }

  return { ok: true, needsConfirm: true };
}

export async function requestPasswordReset(
  formData: FormData
): Promise<{ error: string } | { ok: true }> {
  const email = String(formData.get('email') ?? '');
  const captchaToken = String(formData.get('captchaToken') ?? '');
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/callback?next=/reset-password`,
    ...(captchaToken ? { captchaToken } : {}),
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
