'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { safeReturnPath } from '@/lib/safe-redirect.mjs';
// The SAME derivation the read-time gates use — imported, not restated. Next can
// import the canonical module directly; only the classic-script surfaces need the
// public/age-derive.js mirror.
import { isMinorFromDob } from '@/lib/age-derive.mjs';

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

export async function signup(
  formData: FormData
): Promise<{ error: string } | { ok: true; needsConfirm: boolean }> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const rawRole = String(formData.get('role') ?? 'client');
  const role = ['client', 'trainer', 'nutritionist'].includes(rawRole) ? rawRole : 'client';
  const captchaToken = String(formData.get('captchaToken') ?? '');
  const dob = String(formData.get('dob') ?? '');

  // ⚠ 18+ IS ENFORCED HERE, NOT IN THE FORM. This route is linked from Nav's
  // "Get started", the Footer and CinematicNav, and it previously called
  // auth.signUp() with role metadata only — so an account created through it
  // carried no date of birth, and every gate reads a missing date as "says
  // nothing", which ADMITS. That made /signup a complete bypass of the age gate
  // the rest of this wave builds. Same rule as every other surface.
  const minor = isMinorFromDob(dob);
  if (minor === null) {
    return { error: 'Enter a valid date of birth — Shape is for adults 18 and over.' };
  }
  if (minor === true) {
    return { error: 'You must be 18 or older to use Shape.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/callback`,
      ...(captchaToken ? { captchaToken } : {}),
      // date_of_birth rides in metadata so the confirm-by-email half can claim it
      // at first sign-in — this route returns no session when confirmation is on.
      data: { role, date_of_birth: dob },
    },
  });

  if (error) return { error: error.message };

  // If Supabase requires email confirmation, there's no session yet.
  const needsConfirm = !data.session;

  if (!needsConfirm) {
    // Auto-confirm: a session exists NOW, so persist the profile row here — the
    // metadata copy above only helps the confirm-by-email half. Without this the
    // account reaches the dashboard with no profiles row and no date of birth,
    // i.e. ungated. over_18 is deliberately not written: set_over_18() derives it
    // from this date and discards any supplied flag.
    if (data.user?.id) {
      const { error: provisionError } = await supabase.from('profiles').upsert(
        { id: data.user.id, role, roles: [role], date_of_birth: dob },
        { onConflict: 'id' }
      );
      // Surfaced rather than swallowed: an account that reaches the dashboard
      // without a DOB is exactly the ungated state this wave exists to close, so
      // it must not look like a clean signup.
      if (provisionError) {
        return { error: 'Your account was created — please sign in to finish setting up your profile.' };
      }
    }
    revalidatePath('/', 'layout');
    redirect('/newdesign/ClientDashboard.html');
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
