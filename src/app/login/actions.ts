'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { safeReturnPath } from '@/lib/safe-redirect.mjs';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { requestPasswordResetEmail, requestIp } from '@/lib/password-reset';
import { RESET_MIN_LENGTH, RESET_OTHER_FACTOR, cleanCode, resetCodeError, resetNeedsCode, resetPasswordError } from '@/lib/password-reset-step.mjs';

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

/** What the set-password form hears back: the line to show, whether to ask for the authenticator
 *  code, whether the link has ended, and whether a code was verified (the field then goes). */
export type UpdatePasswordResult = { error: string; needsCode?: boolean; expired?: boolean; codeDone?: boolean };

// ⚠ AN ACCOUNT WITH TWO-FACTOR SIGN-IN SAVES ONLY AFTER ITS CODE (owner, 2026-11-13: the page answered
// "AAL2 session is required to update email or password when MFA is enabled."). The reset link's
// session is 'aal1', and Supabase refuses a new password until it is 'aal2'. So the code is verified
// first, on this same client: it keeps the upgraded session in memory, so updateUser sends the 'aal2'
// token, and @supabase/ssr writes it to the cookies (MFA_CHALLENGE_VERIFIED). Rules and wording:
// src/lib/password-reset-step.mjs.
export async function updatePassword(formData: FormData): Promise<UpdatePasswordResult | void> {
  const password = String(formData.get('password') ?? '');
  if (password.length < RESET_MIN_LENGTH) {
    return { error: `Choose a longer password: ${RESET_MIN_LENGTH} characters at least.` };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'This reset link has ended. Ask for a new one from Forgot password.', expired: true };

  // Authenticator-app factors only, as /staff-verify counts them: a code field for a phone factor
  // would have nothing to verify against.
  const factor = (user.factors ?? []).find((f) => f.status === 'verified' && f.factor_type === 'totp');
  let codeDone = false;
  if (resetNeedsCode({ currentLevel: await sessionLevel(supabase), verifiedFactors: factor ? 1 : 0 }) && factor) {
    const code = cleanCode(formData.get('code'));
    if (!code) return { error: 'Enter the 6-digit code from your authenticator app.', needsCode: true };
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (error) return { error: resetCodeError(error), needsCode: true };
    codeDone = true;
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    const said = resetPasswordError(error);
    // A second factor this page has no field for (Shape enrolls authenticator apps only): asking for
    // a code here would go round in a circle.
    if (said.needsCode && !factor) return { error: RESET_OTHER_FACTOR };
    return { ...said, ...(codeDone ? { codeDone: true } : {}) };
  }
  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

/** The session's assurance level from its verified token ('aal1', 'aal2'), or null when unreadable. */
async function sessionLevel(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    return error ? null : ((data?.claims as { aal?: string } | undefined)?.aal ?? null);
  } catch {
    return null;
  }
}

export async function logout(_formData?: FormData): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}
