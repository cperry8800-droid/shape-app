// Who gets past the app's paywall, and what a membership lookup leaves an account as.
// Pure, so tests/app-membership-gate.test.mjs drives the shell's own rules.
//
// ⚠ SIGNED IN IS NOT A MEMBER (client-onboarding review H1, 2026-10-14). The shell let every
// signed-in account in, on the claim that account creation always routes through the $5
// checkout. It does not: phone sign-up, an email sign-up awaiting confirmation, a checkout
// closed unpaid and every website sign-up arrive unpaid. They got a full-looking app whose
// reads the server refused (402) and whose saves failed, with the paywall's own "Join"
// unreachable. The membership itself decides now.

/** The gate: an approved coach is in; everyone else waits for the session and the membership answer. */
export function bsMemberGate({ isApprovedCoach, authReady, membership }) {
  if (isApprovedCoach) return { allowed: true, loading: false };
  const loading = !authReady || !!(membership && membership.loading);
  return { allowed: !!(membership && membership.active === true), loading };
}

/**
 * A lookup's answer (true / false / null when it could not be found out) applied to what this
 * account was last known to be. A real answer replaces it. A failed lookup keeps it: it never
 * locks out a confirmed member, and never admits an account with no answer on record.
 */
export function bsMembershipAfter(known, answer) {
  if (answer === true || answer === false) return answer;
  return known === true;
}

/**
 * The boot seed, before the session restores. Only an answer recorded FOR the last signed-in
 * account counts: another account on the same device is not this one. Returns null when there
 * is nothing to go on, and the shell holds until the lookup answers.
 */
export function bsMembershipSeed({ stored, storedUid, lastUid }) {
  if (!storedUid || storedUid !== lastUid) return null;
  if (stored === '1') return true;
  if (stored === '0') return false;
  return null;
}
