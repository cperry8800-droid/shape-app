import { createClient } from '@/lib/supabase/server';

const DEFAULT_ADMIN_EMAILS = [
  'christopher.perry@theshapecommunity.com',
  'cperry8800@gmail.com',
  'chris.perry@shapecommunity.onmicrosoft.com',
];

export function getAdminEmails(): string[] {
  const configured = [
    process.env.ADMIN_EMAILS,
    process.env.APPLICATIONS_EMAIL,
  ]
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
  if (!user || !email || !getAdminEmails().includes(email)) {
    throw new Error('Admin access required.');
  }

  return { id: user.id, email };
}
