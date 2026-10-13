// src/lib/staff-two-factor.mjs
//
// Two-factor sign-in for the Shape team. Every staff page and action needs a session verified with
// a second factor (Supabase Auth MFA, an authenticator app): the session's assurance level must be
// 'aal2'. A staff member signed in with only a password is sent to /staff-verify, which sets the
// authenticator up the first time and asks for a code after that.
//
// TWO GATES, ONE RULE:
//   - the proxy (src/lib/supabase/middleware.ts) sends a signed-in session without 'aal2' on any
//     staff page (isStaffPage) to /staff-verify before the page renders;
//   - getStaffMember() (src/lib/admin-access.ts) counts nobody as staff without 'aal2', so every
//     page, server action and admin API route that asks requireStaff() refuses such a session too.
// The proxy is the way in; getStaffMember is the lock.
//
// Pure: no I/O. tests/staff-two-factor.test.mjs drives the rules directly.

import { safeReturnPath } from './safe-redirect.mjs';
import { ADMIN_TOOLS, CONSOLE_PAGES } from './staff-levels.mjs';

export const STAFF_VERIFY_PATH = '/staff-verify';

/** Every page that only staff open: the console's own pages and the admin tools. */
export const STAFF_PAGE_PREFIXES = [...new Set([...CONSOLE_PAGES, ...ADMIN_TOOLS].map((p) => p.href))];

/** Whether `pathname` is a staff page or under one ('/admin' covers '/admin/accounts/…'). */
export function isStaffPage(pathname) {
  const p = String(pathname ?? '');
  return STAFF_PAGE_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

/**
 * Where a staff member stands: 'verified' (this session passed a second factor), 'verify' (they
 * have an authenticator but this session has not used it) or 'enroll' (none set up yet).
 */
export function twoFactorState({ currentLevel, verifiedFactors } = {}) {
  if (currentLevel === 'aal2') return 'verified';
  return Number(verifiedFactors) > 0 ? 'verify' : 'enroll';
}

/** The staff page to return to after verifying: a staff page on this site, else the console. */
export function staffNext(raw) {
  const next = safeReturnPath(typeof raw === 'string' ? raw : '', '/admin');
  return isStaffPage(next.split(/[?#]/)[0]) ? next : '/admin';
}

/** /staff-verify, carrying the page that was asked for. */
export function verifyUrl(pathname, search = '') {
  return `${STAFF_VERIFY_PATH}?next=${encodeURIComponent(staffNext(`${pathname ?? ''}${search ?? ''}`))}`;
}

/** A six-digit code as typed (spaces and dashes dropped), or '' when it is not one. */
export function cleanCode(value) {
  const c = String(value ?? '').replace(/[\s-]/g, '');
  return /^\d{6}$/.test(c) ? c : '';
}
