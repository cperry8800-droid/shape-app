// The password-reset email, sent by Shape rather than by Supabase (client-onboarding review, H9).
//
// ⚠ WHY NOT supabase.auth.resetPasswordForEmail. The website's form called it through the server
// client, which uses PKCE: the link's code can be exchanged only by the browser holding the
// verifier cookie, so a reset requested on a laptop and opened from a phone's mail app, or from
// Gmail's in-app browser, failed (/auth/callback → /login?error=…). And the app had no reset at all:
// it said "a reset link is on its way" and called nothing. Here the server makes the link itself
// (generateLink sends nothing and returns the hashed token) and mails a link to /auth/confirm,
// which verifies the hash on the server, sets the session cookies and opens /reset-password: the
// same path the coach approval email uses. It works in whichever browser opens it, and the app and
// the website both ask for it the same way (POST /api/auth/password-reset, or the form's action).
//
// What the caller learns is the same whether or not an account has the address, so this is not
// a way to find out who has an account. A send that fails says so: a member told "it's on its
// way" about an email that never leaves is the defect this replaces.

import type { SupabaseClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rate-limit';
import { verifyTurnstile } from '@/lib/turnstile';
import { sendEmail } from '@/lib/email';
import { escapeHtml, siteUrl, button, WRAP_OPEN, SIGN_OFF_HTML, SIGN_OFF_TEXT, type BuiltEmail } from '@/lib/coach-application-emails';
import { isEmail } from '@/lib/request-utils';

/** A Shape handle, as the sign-in field takes it (the username rule, with or without its @). */
const HANDLE_RE = /^@?[a-z0-9][a-z0-9._]{2,19}$/i;

/** Requests per address an hour, and per network address a quarter-hour. */
export const RESET_PER_EMAIL = 3;
export const RESET_PER_EMAIL_WINDOW_S = 60 * 60;
export const RESET_PER_IP = 5;
export const RESET_PER_IP_WINDOW_S = 15 * 60;

export type ResetResult =
  | { ok: true }
  | { ok: false; status: 400 | 429 | 503; code: 'invalid_email' | 'captcha_failed' | 'rate_limited' | 'send_failed'; error: string };

/** The link the email carries: /auth/confirm verifies it and opens the set-password page. */
export function resetLink(tokenHash: string, site = siteUrl()): string {
  const query = new URLSearchParams({ token_hash: tokenHash, type: 'recovery', next: '/reset-password' });
  return `${site}/auth/confirm?${query.toString()}`;
}

export function passwordResetEmail(args: { link: string; site?: string }): BuiltEmail {
  const site = args.site ?? siteUrl();
  const again = `${site}/forgot-password`;
  return {
    subject: 'Reset your Shape password',
    html:
      `${WRAP_OPEN}` +
      `<p style="margin:0 0 12px;line-height:1.55;">Someone asked to reset the password for this Shape account. If it was you, choose a new one:</p>` +
      button(args.link, 'Choose a new password') +
      `<p style="margin:0 0 12px;color:#666;font-size:13px;line-height:1.5;">The link works once, for a limited time, in any browser. If it has expired, <a href="${escapeHtml(again)}" style="color:#0ac5a8;">ask for a new one</a>.</p>` +
      `<p style="margin:0 0 16px;color:#666;font-size:13px;line-height:1.5;">If you didn't ask for this, you can ignore this email: your password stays as it is.</p>` +
      `${SIGN_OFF_HTML}</div>`,
    text: [
      'Someone asked to reset the password for this Shape account. If it was you, choose a new one:',
      args.link,
      '',
      `The link works once, for a limited time, in any browser. If it has expired, ask for a new one: ${again}`,
      '',
      "If you didn't ask for this, you can ignore this email: your password stays as it is.",
      '',
      ...SIGN_OFF_TEXT,
    ].join('\n'),
  };
}

/** Supabase's answer for an address no account has. Anything else is a failure to say so. */
function isNoAccount(error: { status?: number; code?: string; message?: string }): boolean {
  return error.status === 404 || error.code === 'user_not_found' || /user.*not.*found/i.test(error.message ?? '');
}

/**
 * Ask for a reset: check the address, the human check and both limits, then (when an account has
 * the address) make the link and mail it. `admin` is the service-role client.
 */
export async function requestPasswordResetEmail(
  admin: SupabaseClient,
  args: { email: unknown; captchaToken?: unknown; ip?: string | null; site?: string }
): Promise<ResetResult> {
  // The app's sign-in field takes an email or an @handle, so a reset does too. A handle is
  // resolved here, on the server, and its address is never sent back.
  const typed = typeof args.email === 'string' ? args.email.trim() : '';
  const handle = HANDLE_RE.test(typed) ? typed.replace(/^@/, '').toLowerCase() : '';
  const email = handle ? '' : typed.toLowerCase();
  if (!handle && (!email || email.length > 254 || !isEmail(email))) {
    return { ok: false, status: 400, code: 'invalid_email', error: 'Enter the email address or @handle you signed up with.' };
  }
  if (!(await verifyTurnstile(args.captchaToken, args.ip ?? null))) {
    return { ok: false, status: 400, code: 'captcha_failed', error: "We couldn't confirm you're human. Please try again." };
  }
  const limited = { ok: false as const, status: 429 as const, code: 'rate_limited' as const, error: 'Too many reset requests. Wait a few minutes and try again.' };
  if (args.ip) {
    const byIp = await checkRateLimit(admin, `pwreset:ip:${args.ip}`, RESET_PER_IP, RESET_PER_IP_WINDOW_S);
    if (!byIp.allowed) return limited;
  }
  const failed = { ok: false as const, status: 503 as const, code: 'send_failed' as const, error: "We couldn't send the reset email just now. Please try again in a minute." };
  let to = email;
  if (handle) {
    const { data, error } = await admin.rpc('get_email_for_username', { p_username: handle });
    if (error) {
      console.error('[shape-app] password reset: handle lookup failed', error.message);
      return failed;
    }
    if (typeof data !== 'string' || !data) return { ok: true }; // no such handle: the same answer
    to = data.trim().toLowerCase();
  }
  const byEmail = await checkRateLimit(admin, `pwreset:email:${to}`, RESET_PER_EMAIL, RESET_PER_EMAIL_WINDOW_S);
  if (!byEmail.allowed) return limited;

  let tokenHash: string | null = null;
  try {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email: to });
    if (error) {
      if (isNoAccount(error)) return { ok: true };
      console.error('[shape-app] password reset: generateLink failed', error.message);
      return failed;
    }
    tokenHash = data?.properties?.hashed_token ?? null;
  } catch (e) {
    console.error('[shape-app] password reset: generateLink threw', e instanceof Error ? e.message : e);
    return failed;
  }
  if (!tokenHash) return failed;

  const built = passwordResetEmail({ link: resetLink(tokenHash, args.site), site: args.site });
  const sent = await sendEmail({ to, subject: built.subject, html: built.html, text: built.text });
  if (!sent.ok) return failed;
  return { ok: true };
}

/** The caller's network address, as the proxy's limiter reads it. */
export function requestIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  const first = forwarded ? forwarded.split(',')[0].trim() : '';
  return first || headers.get('x-real-ip') || null;
}
