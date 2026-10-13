import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { atLeast, resolveStaffLevel, type StaffLevel } from '@/lib/staff-levels.mjs';
import { twoFactorState, type TwoFactorState } from '@/lib/staff-two-factor.mjs';

// The owner's own addresses. Each is an OWNER of the admin console (src/lib/staff-levels.mjs):
// everything, including the Staff page. Owners live here, in code, and never in staff_members,
// so no staff member can add, demote or remove one.
const DEFAULT_ADMIN_EMAILS = [
  'christopher.perry@theshapecommunity.com',
  'cperry8800@gmail.com',
  'chris.perry@shapecommunity.onmicrosoft.com',
];

export function getOwnerEmails(): string[] {
  return [...DEFAULT_ADMIN_EMAILS];
}

// The ADMIN_EMAILS setting: how admins were added before the console's Staff page. Each address
// there is an ADMIN (everything but the Staff page).
export function getEnvAdminEmails(): string[] {
  return Array.from(
    new Set(
      String(process.env.ADMIN_EMAILS ?? '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

// L14 (2026-10-08 review): ADMIN_EMAILS only. APPLICATIONS_EMAIL is where applications are
// MAILED (a shared inbox, possibly), and an inbox address is not a grant of the console.
// ⚠ Owners and ADMIN_EMAILS only, never the Staff page's rows: its callers are synchronous
// (the dashboard's member gate, the edge mirror in membership-core.ts) and read no database.
// A staff level is getStaffMember()'s answer.
export function getAdminEmails(): string[] {
  return Array.from(new Set([...getEnvAdminEmails(), ...DEFAULT_ADMIN_EMAILS]));
}

export type StaffMember = { id: string; email: string; level: StaffLevel };
export type StaffSignIn = { staff: StaffMember; twoFactor: TwoFactorState };

/**
 * The staff level of a verified account (from getUser), or null: not staff, no confirmed email, or
 * a staff_members read that failed (which counts as no row). The second factor is not part of
 * this; access is getStaffMember().
 */
export async function staffLevelOf(user: {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
}): Promise<StaffLevel | null> {
  const email = user.email?.toLowerCase() ?? '';
  if (!email || !user.email_confirmed_at) return null;

  const base = { email, confirmed: true, ownerEmails: getOwnerEmails(), adminEmails: getEnvAdminEmails() };
  let tableLevel: string | null = null;
  if (resolveStaffLevel(base) !== 'owner') {
    try {
      const { data, error } = await createAdminClient()
        .from('staff_members')
        .select('level')
        .eq('user_id', user.id)
        .maybeSingle<{ level: string }>();
      if (!error) tableLevel = data?.level ?? null;
    } catch {
      tableLevel = null;
    }
  }
  return resolveStaffLevel({ ...base, tableLevel });
}

/**
 * The signed-in account's staff level and where it stands on two-factor sign-in, or null for a
 * visitor, an account that is not staff, or one whose address Supabase has not confirmed (L14: an
 * allow-listed address someone registered without owning it is not staff here).
 *
 * The staff_members row is read with the service role only when the code's lists did not already
 * make the account an owner. A failed read (no table before the migration runs, no service key)
 * counts as no row: owners and ADMIN_EMAILS still get in, and nobody else does.
 *
 * ⚠ THIS IS NOT ACCESS. It is what /staff-verify and the dashboard's tabs read; access is
 * getStaffMember(), which also needs the second factor.
 */
export async function getStaffSignIn(): Promise<StaffSignIn | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const level = user ? await staffLevelOf(user) : null;
  if (!user || !level) return null;
  const email = String(user.email).toLowerCase();
  // The session's assurance level, from its verified token (getClaims checks the signature);
  // a token that cannot be read is a session without a second factor.
  let currentLevel: string | null = null;
  try {
    const { data, error } = await supabase.auth.getClaims();
    currentLevel = error ? null : ((data?.claims as { aal?: string } | undefined)?.aal ?? null);
  } catch {
    currentLevel = null;
  }
  // ⚠ Authenticator-app factors only (Codex, #2329): /staff-verify asks for a TOTP code, so a
  // verified phone factor counted here would send someone to a code screen with nothing to verify.
  const verifiedFactors = (user.factors ?? []).filter((f) => f.status === 'verified' && f.factor_type === 'totp').length;
  return { staff: { id: user.id, email, level }, twoFactor: twoFactorState({ currentLevel, verifiedFactors }) };
}

/**
 * The signed-in staff member, or null. Staff only once this session has passed a second factor
 * (src/lib/staff-two-factor.mjs): a password alone opens nothing in the console.
 */
export async function getStaffMember(): Promise<StaffMember | null> {
  const signIn = await getStaffSignIn();
  return signIn?.twoFactor === 'verified' ? signIn.staff : null;
}

/** The signed-in staff member when their level opens `min`; throws otherwise. */
export async function requireStaff(min: StaffLevel): Promise<StaffMember> {
  const staff = await getStaffMember();
  if (!staff || !atLeast(staff.level, min)) {
    throw new Error('Admin access required.');
  }
  return staff;
}

/** An admin or the owner: every admin tool that predates the console's levels. */
export async function requireAdminUser(): Promise<{ id: string; email: string }> {
  const staff = await requireStaff('admin');
  return { id: staff.id, email: staff.email };
}
