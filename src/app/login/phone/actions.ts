'use server';

// Phone-auth server actions. These are thin wrappers around Supabase's
// built-in SMS OTP flow, which routes through Twilio when the Supabase
// project is configured with Twilio credentials.
//
// hCaptcha is passed through to Supabase via options.captchaToken when
// configured — Supabase validates it server-side if the project's CAPTCHA
// integration is enabled in the dashboard.

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

// E.164 check — conservative: starts with +, then 8–15 digits.
function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim().replace(/[\s()-]/g, '');
  if (!/^\+\d{8,15}$/.test(trimmed)) return null;
  return trimmed;
}

export async function sendPhoneOtp(
  formData: FormData
): Promise<{ error: string } | { ok: true; phone: string }> {
  const phoneRaw = String(formData.get('phone') ?? '');
  const captchaToken = String(formData.get('captcha_token') ?? '') || undefined;

  const phone = normalizePhone(phoneRaw);
  if (!phone) {
    return { error: 'Enter a valid phone number in international format (e.g. +15551234567).' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: { captchaToken },
  });

  if (error) return { error: error.message };
  return { ok: true, phone };
}

export async function verifyPhoneOtp(
  formData: FormData
): Promise<{ error: string } | void> {
  const phoneRaw = String(formData.get('phone') ?? '');
  const token = String(formData.get('token') ?? '').trim();
  const rawNext = String(formData.get('next') ?? '');
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  const phone = normalizePhone(phoneRaw);
  if (!phone) return { error: 'Invalid phone number.' };
  if (!/^\d{4,8}$/.test(token)) return { error: 'Enter the 6-digit code from the text message.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: 'sms',
  });

  if (error) return { error: error.message };

  revalidatePath('/', 'layout');
  redirect(next);
}
