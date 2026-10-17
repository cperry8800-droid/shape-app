// Small pieces the admin console's pages share. Not a route: Next only routes page and route files.

export const ADMIN_TIMEZONE = process.env.ADMIN_TIMEZONE || 'America/New_York';

export const MIGRATION_FILE = 'supabase-migrations/2026-10-13-staff-access-and-admin-stats.sql';
export const ACCOUNT_MIGRATION_FILE = 'supabase-migrations/2026-10-13-admin-account-actions.sql';

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

// The console's type is the website's pair (public/newdesign): Fraunces for titles, JetBrains Mono
// for labels. admin/layout.tsx loads both and sets these variables on the frame; outside it the
// text falls back to the site's Inter.
export const DISPLAY = 'font-[family-name:var(--font-admin-display)]';
export const MONO = 'font-[family-name:var(--font-admin-mono)]';
export const EYEBROW = `${MONO} text-[10.5px] uppercase tracking-[0.16em] text-neutral-400`;
export const PAGE_TITLE = `${DISPLAY} text-3xl sm:text-4xl font-light tracking-tight text-neutral-50`;
export const SECTION_TITLE = `${DISPLAY} text-xl sm:text-2xl font-light tracking-tight text-neutral-100`;
/** A quiet surface for a tile, a chart or a list: the site's card and hairline. */
export const PANEL = 'border border-border-hairline bg-card';

/** The house's accent period after a page title. */
export function Period() {
  return <span className="text-accent">.</span>;
}

/** A section's title over the ledger rule (ink into the accent), and what the section counts. */
export function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className={SECTION_TITLE}>{title}</h3>
      <div aria-hidden="true" className="h-[2px] bg-linear-to-r from-neutral-200 via-accent/70 to-transparent" />
      {note && <p className="text-sm text-neutral-500 max-w-3xl">{note}</p>}
    </div>
  );
}

export function Notice({ tone, children }: { tone: 'teal' | 'amber' | 'red'; children: React.ReactNode }) {
  const cls = {
    teal: 'border-teal-400/30 bg-teal-400/10 text-teal-200',
    amber: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
    red: 'border-red-400/30 bg-red-400/10 text-red-200',
  }[tone];
  return <div className={`rounded-lg border text-sm px-4 py-3 ${cls}`}>{children}</div>;
}
