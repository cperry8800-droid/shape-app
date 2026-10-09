import { createClient } from '@/lib/supabase/server';

const DEFAULT_ADMIN_EMAILS = [
  'christopher.perry@theshapecommunity.com',
  'cperry8800@gmail.com',
  'chris.perry@shapecommunity.onmicrosoft.com',
];

// L14 (2026-10-08 review): ADMIN_EMAILS only. APPLICATIONS_EMAIL is where applications are
// MAILED (a shared inbox, possibly), and an inbox address is not a grant of the console.
export function getAdminEmails(): string[] {
  const configured = [process.env.ADMIN_EMAILS]
    .filter(Boolean)
    .flatMap((value) => String(value).split(','))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return Array.from(new Set([...configured, ...DEFAULT_ADMIN_EMAILS]));
}

export async function requireAdminUser(): Promise<{ id: string; email: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email?.toLowerCase() ?? '';
  // L14: an allow-listed address someone registered without owning it is not an admin here:
  // Supabase must also have confirmed it, the rule the help desk (support/chat) already applies.
  if (!user || !email || !user.email_confirmed_at || !getAdminEmails().includes(email)) {
    throw new Error('Admin access required.');
  }

  return { id: user.id, email };
}
