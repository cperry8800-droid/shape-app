// The activity log: what the Shape team has done from the console, newest first. Admin and up.
//
// Two records, read together: admin_activity_log (staff changes, and from PR 2 on account
// actions) and admin_lookup_log (accounts looked up through Nora's help desk). Both are service
// role only; each row keeps the emails, so it outlives the accounts it names.

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStaff } from '@/lib/admin-access';
import { describeActivity } from '@/lib/staff-levels.mjs';
import { ADMIN_TIMEZONE } from '../ui';

export const metadata = { title: 'Activity log — Shape Admin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const LIMIT = 200;
const TIMEZONE = ADMIN_TIMEZONE;
const MISSING_TABLE = new Set(['42P01', 'PGRST205']);

type Entry = {
  key: string;
  at: string;
  actor: string;
  text: string;
  outcome: 'done' | 'failed' | 'pending';
};

type ActivityRow = {
  id: string;
  actor_email: string;
  action: string;
  target_user_id: string | null;
  target_email: string | null;
  details: Record<string, unknown> | null;
  outcome: 'done' | 'failed' | 'pending';
  created_at: string;
};

type LookupRow = {
  id: string;
  admin_email: string;
  query_email: string;
  found: boolean | null;
  created_at: string;
};

export default async function ActivityPage() {
  try {
    await requireStaff('admin');
  } catch {
    redirect('/admin');
  }

  const db = createAdminClient();
  const [activity, lookups] = await Promise.all([
    db
      .from('admin_activity_log')
      .select('id, actor_email, action, target_user_id, target_email, details, outcome, created_at')
      .order('created_at', { ascending: false })
      .limit(LIMIT),
    db.from('admin_lookup_log').select('id, admin_email, query_email, found, created_at').order('created_at', { ascending: false }).limit(LIMIT),
  ]);
  const missing = [activity.error, lookups.error].some((e) => e && MISSING_TABLE.has(String(e.code)));
  for (const e of [activity.error, lookups.error]) if (e && !MISSING_TABLE.has(String(e.code))) throw e;

  const entries: Entry[] = [
    ...((activity.data ?? []) as ActivityRow[]).map((r) => ({
      key: `a-${r.id}`,
      at: r.created_at,
      actor: r.actor_email,
      text: describeActivity(r),
      outcome: r.outcome,
    })),
    ...((lookups.data ?? []) as LookupRow[]).map((r) => ({
      key: `l-${r.id}`,
      at: r.created_at,
      actor: r.admin_email,
      text: describeActivity({ action: 'lookup', target_email: r.query_email, details: { found: r.found } }),
      // A lookup is logged before it runs; `found` is written once it has.
      outcome: (r.found === null ? 'pending' : 'done') as Entry['outcome'],
    })),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, LIMIT);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-light tracking-tight">Activity log</h2>
        <p className="text-sm text-neutral-400 max-w-2xl">
          Everything the Shape team has changed from this console, and every account looked up through Nora&apos;s help desk,
          newest first. The latest {LIMIT}.
        </p>
      </section>

      {missing && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 text-amber-200 text-sm px-4 py-3">
          Part of the log is not set up yet: run supabase-migrations/2026-10-13-staff-access-and-admin-stats.sql (and
          2026-10-08-admin-lookup-log.sql if it has not been run).
        </div>
      )}

      {entries.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-8 text-sm text-neutral-400">Nothing yet.</div>
      ) : (
        <ol className="rounded-xl border border-neutral-800 divide-y divide-neutral-900 bg-neutral-950">
          {entries.map((e) => (
            <li key={e.key} className="px-4 py-3 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
              <time dateTime={e.at} className="text-xs text-neutral-500 tabular-nums shrink-0 sm:w-44">
                {new Date(e.at).toLocaleString('en-US', { timeZone: TIMEZONE })}
              </time>
              <span className="text-sm text-neutral-200 min-w-0 break-words">
                <span className="text-neutral-400">{e.actor}</span> {e.text}
                {e.outcome === 'failed' && <span className="text-red-300"> · failed, nothing changed</span>}
                {e.outcome === 'pending' && <span className="text-amber-300"> · not confirmed</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
