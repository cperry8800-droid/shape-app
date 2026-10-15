'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { safeReturnPath } from '@/lib/safe-redirect.mjs';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { requestPasswordResetEmail, requestIp } from '@/lib/password-reset';

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
  // `safeReturnPath` rather than the inline prefix check this line used to carry. That check
  // accepted `/\evil.example` — one leading slash, so it passed — and browsers normalise `\` to
  // `/`, resolving the emitted relative Location to `//evil.example`, i.e. off-site immediately
  // after authentication. It also accepted embedded control characters, which the URL parser
  // strips. The helper rejects both; it has existed since #1471 and simply was not used here.
  const next = safeReturnPath(rawNext, roleDefaultNext);
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

// The /signup form and its `signup` action are gone (client-onboarding review, M5): /signup asked
// for no name, username or Terms, made a client account when Trainer was picked, and its PKCE
// confirmation link worked only in the browser that asked (H10). /signup now redirects to the
// website's sign-up (/newdesign/SignupClient.html), and a coach's role to their application.

// ⚠ SHAPE SENDS THE RESET EMAIL NOW (client-onboarding review, H9). resetPasswordForEmail through
// this PKCE client made a link only the browser that asked could use, so a reset opened from a
// phone's mail app failed. src/lib/password-reset.ts mails a link /auth/confirm verifies on the
// server, the same one the app asks for through POST /api/auth/password-reset.
export async function requestPasswordReset(
  formData: FormData
): Promise<{ error: string } | { ok: true }> {
  const result = await requestPasswordResetEmail(createAdminClient(), {
    email: formData.get('email'),
    captchaToken: formData.get('captchaToken'),
    ip: requestIp(await headers()),
  });
  return result.ok ? { ok: true } : { error: result.error };
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
