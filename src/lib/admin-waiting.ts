// What is waiting on the team, counted for the admin console's sidebar (src/app/admin/layout.tsx):
// one count per queue page, and only for the pages this level opens. The same queues as the
// Overview's "Waiting on the team" (admin_overview_stats' queues), read here as head counts so
// every console page can show them without the Overview's whole call.
//
// Read with the service role, so only after the layout's staff check. A count that cannot be
// read is left out (no badge), never shown as zero; nor does a missing service key (the client
// throws) take the console down with it (Codex, #2390).

import { createAdminClient } from '@/lib/supabase/admin';
import { canOpen, type StaffLevel } from '@/lib/staff-levels.mjs';

export const WAITING: ReadonlyArray<{ href: string; table: string; column: string; values: string[] }> = [
  { href: '/dashboard/support', table: 'support_requests', column: 'status', values: ['open'] },
  { href: '/admin/requests', table: 'account_action_requests', column: 'status', values: ['open'] },
  { href: '/dashboard/applications', table: 'provider_applications', column: 'status', values: ['pending', 'in_review'] },
  { href: '/dashboard/credentials', table: 'provider_credentials', column: 'review_status', values: ['pending'] },
  { href: '/dashboard/refunds', table: 'refund_requests', column: 'status', values: ['pending'] },
];

/** One queue's count, or null when it cannot be read (the Overview reads account requests here). */
export async function waitingCount(href: string, db?: ReturnType<typeof createAdminClient>): Promise<number | null> {
  const w = WAITING.find((x) => x.href === href);
  if (!w) return null;
  try {
    const client = db ?? createAdminClient();
    const { count, error } = await client.from(w.table).select('*', { count: 'exact', head: true }).in(w.column, w.values);
    return error || typeof count !== 'number' ? null : count;
  } catch {
    return null;
  }
}

export async function waitingCounts(level: StaffLevel): Promise<Record<string, number>> {
  const queues = WAITING.filter((w) => canOpen(level, w.href));
  if (!queues.length) return {};
  let db: ReturnType<typeof createAdminClient>;
  try {
    db = createAdminClient();
  } catch {
    return {};
  }
  const counted = await Promise.all(queues.map(async (w) => [w.href, await waitingCount(w.href, db)] as const));
  return Object.fromEntries(counted.filter((c): c is readonly [string, number] => c[1] !== null));
}
