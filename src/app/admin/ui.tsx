// Small pieces the admin console's pages share. Not a route: Next only routes page and route files.

export const ADMIN_TIMEZONE = process.env.ADMIN_TIMEZONE || 'America/New_York';

export const MIGRATION_FILE = 'supabase-migrations/2026-10-13-staff-access-and-admin-stats.sql';

/** A date in the owner's zone, or a dash for none. */
export function formatWhen(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return withTime
    ? d.toLocaleString('en-US', { timeZone: ADMIN_TIMEZONE, dateStyle: 'medium', timeStyle: 'short' })
    : d.toLocaleDateString('en-US', { timeZone: ADMIN_TIMEZONE, dateStyle: 'medium' });
}

/** A calendar date ('2026-10-13') as written, never shifted by a time zone; a dash for none. */
export function formatDay(ymd: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? ''));
  if (!m) return '—';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', dateStyle: 'medium' });
}

export function Notice({ tone, children }: { tone: 'teal' | 'amber' | 'red'; children: React.ReactNode }) {
  const cls = {
    teal: 'border-teal-400/30 bg-teal-400/10 text-teal-200',
    amber: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
    red: 'border-red-400/30 bg-red-400/10 text-red-200',
  }[tone];
  return <div className={`rounded-lg border text-sm px-4 py-3 ${cls}`}>{children}</div>;
}
