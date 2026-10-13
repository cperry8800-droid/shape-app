import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { atLeast, resolveStaffLevel, type StaffLevel } from '@/lib/staff-levels.mjs';

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

/**
 * The signed-in account's staff level, or null for a visitor, an account that is not staff, or
 * one whose address Supabase has not confirmed (L14: an allow-listed address someone registered
 * without owning it is not staff here).
 *
 * The staff_members row is read with the service role only when the code's lists did not already
 * make the account an owner. A failed read (no table before the migration runs, no service key)
 * counts as no row: owners and ADMIN_EMAILS still get in, and nobody else does.
 */
export async function getStaffMember(): Promise<StaffMember | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase() ?? '';
  if (!user || !email || !user.email_confirmed_at) return null;

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

  const level = resolveStaffLevel({ ...base, tableLevel });
  return level ? { id: user.id, email, level } : null;
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
