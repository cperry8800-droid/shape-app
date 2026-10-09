// Cloudflare Turnstile (CAPTCHA) verification — bot protection for PUBLIC,
// unauthenticated forms (e.g. the consultation booking form). Turnstile is a
// privacy-friendly, usually-invisible "are you human?" challenge.
//
// Activation (two values, both from a Turnstile widget at
// https://dash.cloudflare.com → Turnstile):
//   • the SITE key  — public; rendered in the form (set window.SHAPE_TURNSTILE_SITEKEY
//                     in public/supabase.js).
//   • TURNSTILE_SECRET_KEY — server env; NEVER shipped to the client.
//
// Until TURNSTILE_SECRET_KEY is set, verification is a graceful NO-OP so forms
// keep working (same pattern as our other optional integrations).

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Whether Turnstile is configured server-side (the secret is present). */
export function turnstileEnabled(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY;
}

/**
 * Verify a Turnstile token with Cloudflare.
 *  - Not configured (no secret) → true (no-op; pre-activation).
 *  - Configured + missing token → false (block — the bot case).
 *  - Configured + token present → Cloudflare's verdict.
 *  - Network error reaching Cloudflare → false (fail CLOSED).
 *
 * ⚠ FAIL CLOSED, NOT OPEN (M11 of the 2026-10-08 review). This returned true on any error
 * reaching Cloudflare, so with the check switched on, a token of any shape passed whenever the
 * verify call failed or timed out; a caller who can make that call slow (or simply retry while
 * it is) has no check at all. A Cloudflare blip now reads as a failed check, which the forms
 * already say in one line ("please retry"); the booking is a retry away, the bot is not.
 */
export async function verifyTurnstile(token: unknown, remoteIp?: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  const t = typeof token === 'string' ? token.trim() : '';
  if (!t) return false;
  try {
    const form = new URLSearchParams();
    form.set('secret', secret);
    form.set('response', t);
    if (remoteIp) form.set('remoteip', remoteIp);
    const res = await fetch(VERIFY_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
