// src/lib/password-reset-step.mjs
//
// The set-password page (/reset-password) for an account with two-factor sign-in (owner, 2026-11-13,
// a screenshot of the page refusing with Supabase's "AAL2 session is required to update email or
// password when MFA is enabled.").
//
// ⚠ A RESET LINK'S SESSION HAS NOT PASSED THE SECOND FACTOR. /auth/confirm verifies the emailed link
// and opens a session at 'aal1'; Supabase Auth refuses updateUser({ password }) for any account with
// a verified factor until the session is 'aal2'. So the page asks for the authenticator code with the
// new password, and the action verifies the code (mfa.challengeAndVerify) before it saves. Only staff
// can set an authenticator up today (/api/staff/two-factor), but the rule is the account's, not the
// staff level's: any account with a verified authenticator-app factor gets the code field.
//
// Pure: no I/O. tests/password-reset-two-factor.test.mjs drives the rules directly.

import { twoFactorState } from './staff-two-factor.mjs';

export { cleanCode } from './staff-two-factor.mjs';

/** The shortest password Supabase Auth accepts here (its minimum, as the form's minLength says). */
export const RESET_MIN_LENGTH = 6;

/**
 * Whether the page asks for the authenticator code: this session has not passed a second factor and
 * the account has a verified authenticator app. A session already at 'aal2' (a code verified a moment
 * ago, then a password Supabase refused) saves with the password alone.
 */
export function resetNeedsCode({ currentLevel, verifiedFactors } = {}) {
  return twoFactorState({ currentLevel, verifiedFactors }) === 'verify';
}

/** An account whose second factor is not an authenticator app: this page cannot take that step. */
export const RESET_OTHER_FACTOR =
  'This account has a second sign-in step this page can’t take. Write to us from Help and we’ll sort it out.';

/** Supabase Auth's refusal of the new password, said in Shape's words. */
export function resetPasswordError(error) {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? '');
  if (code === 'insufficient_aal' || /aal2/i.test(message)) {
    return { error: 'This account has two-factor sign-in on. Enter the 6-digit code from your authenticator app.', needsCode: true };
  }
  if (code === 'same_password') return { error: 'That is the password you have now. Choose a different one.' };
  if (code === 'weak_password') return { error: message || `Choose a longer password: ${RESET_MIN_LENGTH} characters at least.` };
  if (code === 'session_not_found' || error?.name === 'AuthSessionMissingError') {
    return { error: 'This reset link has ended. Ask for a new one from Forgot password.', expired: true };
  }
  return { error: message || 'Your new password could not be saved just now. Try again.' };
}

/** A code Supabase refused: wrong, or the challenge expired while the page was open. */
export function resetCodeError(error) {
  const code = String(error?.code ?? '');
  if (code === 'mfa_challenge_expired') return 'That code expired before it reached us. Enter the one showing now.';
  return 'That code did not match. Codes change every 30 seconds; enter the one showing now.';
}
