// Members' account requests from Settings: Pause, Export and Delete. Support level and up.
// The route that files them (/api/me/account-action) also emails the team; this is the queue
// they are worked from. Closing one (./../accounts/actions.ts, handleRequest) is logged.
//
// Today the app files only Pause (Settings → Pause membership); Export and Delete are self-serve
// in the app and on the website (/api/account/export, /api/account/delete). The route still takes
// all three, so an older app build can file the other two, and the queue shows whatever arrives.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/admin-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { REASON_MAX } from '@/lib/admin-account-actions.mjs';
import { handleRequest } from '../accounts/actions';
import { ACCOUNT_MIGRATION_FILE, formatWhen, Notice } from '../ui';

export const metadata = { title: 'Account requests — Shape Admin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const MISSING_FUNCTION = new Set(['PGRST202', '42883']);
const LIMIT = 200;

type Row = {
  id: string;
  user_id: string | null;
  action: string;
  status: 'open' | 'done' | 'declined';
  note: string | null;
  handled_by_email: string | null;
  handled_at: string | null;
  created_at: string;
  email: string | null;
  name: string | null;
};

const WHAT: Record<string, { label: string; how: string }> = {
  Pause: { label: 'Pause membership', how: 'Pause their billing in Stripe, then mark it done.' },
  Export: { label: 'Export data', how: 'Settings → Export all my data downloads it in the app; reply with that, or send it.' },
  Delete: { label: 'Delete account', how: 'Settings → Delete account does it in the app, or remove it from their account page.' },
};

const UPDATED: Record<string, string> = {
  done: 'Marked done.',
  declined: 'Declined.',
  already_handled: 'That request was already closed.',
};

const ERRORS: Record<string, string> = {
  no_request: 'That request could not be found.',
  lookup_failed: 'The lookup failed. Try again.',
  not_logged: 'The change could not be logged, so nothing was changed. Try again.',
  save_failed: 'The change could not be saved. Try again.',
  missing_migration: `Not set up yet: run ${ACCOUNT_MIGRATION_FILE}.`,
};

export default async function RequestsPage({
  searchParams,
}: {
  searchParams?: Promise<{ show?: string; updated?: string; error?: string }>;
}) {
  try {
    await requireStaff('support');
  } catch {
    redirect('/admin');
  }

  const params = await searchParams;
  const show = params?.show === 'handled' ? 'handled' : 'open';
  const { data, error } = await createAdminClient().rpc('admin_account_requests', { p_status: show, p_limit: LIMIT });
  const missing = Boolean(error && MISSING_FUNCTION.has(String(error.code)));
  if (error && !missing) throw error;
  const rows = (Array.isArray(data) ? data : []) as Row[];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-light tracking-tight">Account requests</h2>
        <p className="text-sm text-neutral-400 max-w-3xl">
          What members asked for from Settings that the team has to do by hand: today, pausing their membership (exporting and
          deleting are self-serve, but an older app can still ask). Oldest first. Closing one does not email the member.
        </p>
      </section>

      <nav className="flex gap-2 text-sm" aria-label="Which requests">
        <Link
          href="/admin/requests"
          className={`rounded-full border px-4 py-1.5 ${show === 'open' ? 'border-teal-400 text-teal-200' : 'border-neutral-800 text-neutral-400 hover:text-neutral-200'}`}
        >
          Open
        </Link>
        <Link
          href="/admin/requests?show=handled"
          className={`rounded-full border px-4 py-1.5 ${show === 'handled' ? 'border-teal-400 text-teal-200' : 'border-neutral-800 text-neutral-400 hover:text-neutral-200'}`}
        >
          Closed
        </Link>
      </nav>

      {missing && <Notice tone="amber">{ERRORS.missing_migration}</Notice>}
      {params?.updated && <Notice tone="teal">{UPDATED[params.updated] ?? 'Updated.'}</Notice>}
      {params?.error && <Notice tone="red">{ERRORS[params.error] ?? 'That could not be done.'}</Notice>}

      {!missing && rows.length === 0 && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-8 text-sm text-neutral-400">
          {show === 'open' ? 'Nothing waiting.' : 'Nothing closed yet.'}
        </div>
      )}

      {rows.length > 0 && (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-3 flex-wrap">
                <span className="min-w-0">
                  <span className="text-neutral-100">{WHAT[r.action]?.label ?? r.action}</span>
                  <span className="text-neutral-500 break-all">
                    {' · '}
                    {r.user_id ? (
                      <Link href={`/admin/accounts/${r.user_id}`} prefetch={false} className="text-teal-300 hover:text-teal-200">
                        {r.name || r.email || 'their account'}
                      </Link>
                    ) : (
                      'a removed account'
                    )}
                    {r.name && r.email ? ` · ${r.email}` : ''}
                  </span>
                </span>
                <span className="text-neutral-400">
                  asked {formatWhen(r.created_at, true)}
                  {r.status !== 'open'
                    ? ` · ${r.status === 'done' ? 'done' : 'declined'} ${formatWhen(r.handled_at)} by ${r.handled_by_email ?? 'staff'}`
                    : ''}
                </span>
              </div>
              {r.status === 'open' && WHAT[r.action] && <p className="text-neutral-500">{WHAT[r.action].how}</p>}
              {r.note && <p className="text-neutral-500">&ldquo;{r.note}&rdquo;</p>}
              {r.status === 'open' && (
                <form action={handleRequest} className="flex flex-col sm:flex-row gap-2 sm:items-end">
                  <input type="hidden" name="request_id" value={r.id} />
                  <label className="flex flex-col gap-1 flex-1 min-w-0">
                    <span className="text-xs text-neutral-500">Note (optional)</span>
                    <input
                      name="note"
                      maxLength={REASON_MAX}
                      className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-teal-400"
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      name="outcome"
                      value="done"
                      className="rounded-full border border-teal-400 text-teal-200 px-4 py-2 text-sm hover:bg-teal-400/10"
                    >
                      Done
                    </button>
                    <button
                      type="submit"
                      name="outcome"
                      value="declined"
                      className="rounded-full border border-neutral-700 text-neutral-300 px-4 py-2 text-sm hover:bg-neutral-900"
                    >
                      Decline
                    </button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
