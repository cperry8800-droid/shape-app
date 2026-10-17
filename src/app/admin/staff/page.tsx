// The Staff page: who on the Shape team can open the admin console, and at which level. Owner
// only. Owners and ADMIN_EMAILS admins are listed read-only (they are set in code and in Vercel);
// everyone else is added, changed and removed here (./actions.ts), and each change is logged.

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEnvAdminEmails, getOwnerEmails, requireStaff } from '@/lib/admin-access';
import { ASSIGNABLE_LEVELS, LEVEL_LABELS, LEVEL_SUMMARIES, STAFF_LEVELS, type StaffLevel } from '@/lib/staff-levels.mjs';
import { removeStaffMember, resetStaffTwoFactor, saveStaffMember } from './actions';
import { MIGRATION_FILE, Notice, PAGE_TITLE, Period, SECTION_TITLE } from '../ui';

export const metadata = { title: 'Staff — Shape Admin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type Row = { user_id: string; email: string; level: StaffLevel; added_by_email: string; created_at: string; updated_at: string };

const UPDATED: Record<string, string> = {
  added: 'Added. They can open the console the next time they load a page.',
  changed: 'Level changed.',
  unchanged: 'They already have that level; nothing changed.',
  removed: 'Removed. They lose access on their next page load.',
  two_factor_reset: 'Two-factor reset and signed out. They set up a new authenticator at their next sign-in.',
  no_two_factor: 'They have no two-factor set up yet; nothing to reset.',
  already_removed: 'They were already removed.',
};

const ERRORS: Record<string, string> = {
  bad_email: 'That is not an email address.',
  bad_level: 'Pick a level.',
  already_owner: 'That address is an owner already.',
  lookup_failed: 'The account lookup failed. Try again.',
  no_account: 'No Shape account uses that email. Ask them to sign up first, then add them.',
  unconfirmed: 'That account has not confirmed its email yet. Ask them to confirm it, then add them.',
  missing_migration: `Not set up yet: run ${MIGRATION_FILE}.`,
  not_logged: 'The change could not be logged, so nothing was changed. Try again.',
  save_failed: 'The change could not be saved. Try again.',
  missing_member: 'That staff member could not be found.',
  reset_failed: 'Their two-factor could not be fully reset. Try again.',
};

export default async function StaffPage({
  searchParams,
}: {
  searchParams?: Promise<{ updated?: string; error?: string }>;
}) {
  try {
    await requireStaff('owner');
  } catch {
    redirect('/admin');
  }

  const params = await searchParams;
  const { data, error } = await createAdminClient()
    .from('staff_members')
    .select('user_id, email, level, added_by_email, created_at, updated_at')
    .order('created_at', { ascending: true });
  const missing = Boolean(error && (error.code === '42P01' || error.code === 'PGRST205'));
  if (error && !missing) throw error;
  const rows = (data ?? []) as Row[];
  const owners = getOwnerEmails();
  const envAdmins = getEnvAdminEmails().filter((e) => !owners.includes(e));
  // Whether each staff member has an authenticator set up: the rows, and the ADMIN_EMAILS admins
  // by their sign-in identity (Codex, #2329: they need the same reset). Best effort: an unread
  // one shows nothing rather than a wrong answer.
  const admin = createAdminClient();
  const twoFactor = new Map<string, boolean>();
  const envAdminIds = new Map<string, string>();
  const readFactors = async (userId: string) => {
    try {
      const { data: listed, error: listError } = await admin.auth.admin.mfa.listFactors({ userId });
      if (!listError) twoFactor.set(userId, (listed?.factors ?? []).some((f) => f.status === 'verified'));
    } catch {
      /* unknown */
    }
  };
  await Promise.all([
    ...rows.map((r) => readFactors(r.user_id)),
    ...envAdmins.map(async (email) => {
      try {
        const { data: found, error: lookupError } = await admin.rpc('admin_account_by_email', { p_email: email });
        const id = (Array.isArray(found) ? found[0] : found)?.id as string | undefined;
        if (lookupError || !id) return;
        envAdminIds.set(email, id);
        await readFactors(id);
      } catch {
        /* unknown */
      }
    }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h2 className={PAGE_TITLE}>Staff<Period /></h2>
        <p className="text-sm text-neutral-400 max-w-2xl">
          People who work with Shape and can open this console. They sign in with their own Shape account; add them by the
          email that account uses.
        </p>
      </section>

      {missing && <Notice tone="amber">{ERRORS.missing_migration}</Notice>}
      {params?.updated && <Notice tone="teal">{UPDATED[params.updated] ?? 'Updated.'}</Notice>}
      {params?.error && <Notice tone="red">{ERRORS[params.error] ?? 'That could not be done.'}</Notice>}

      <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-5 flex flex-col gap-4">
        <h3 className={SECTION_TITLE}>Add someone, or change their level</h3>
        <form action={saveStaffMember} className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <label className="flex flex-col gap-1.5 flex-1 min-w-0">
            <span className="text-xs uppercase tracking-[0.14em] text-neutral-500">Their Shape account email</span>
            <input
              type="email"
              name="email"
              required
              maxLength={254}
              autoComplete="off"
              className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-teal-400"
              placeholder="name@example.com"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-[0.14em] text-neutral-500">Level</span>
            <select
              name="level"
              required
              defaultValue=""
              className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-teal-400"
            >
              <option value="" disabled>
                Pick a level
              </option>
              {ASSIGNABLE_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABELS[l]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-full border border-teal-400 bg-teal-400 text-neutral-950 px-5 py-2 text-sm hover:bg-teal-300 transition-colors">
            Save
          </button>
        </form>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {[...STAFF_LEVELS].reverse().map((l) => (
            <div key={l} className="flex gap-2">
              <dt className="text-neutral-200 w-20 shrink-0">{LEVEL_LABELS[l]}</dt>
              <dd className="text-neutral-500">{LEVEL_SUMMARIES[l]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className={SECTION_TITLE}>The team</h3>
        <p className="text-sm text-neutral-500 max-w-2xl">
          Everyone signs in to the console with two-factor: the first time, they set up an authenticator app. If someone loses
          theirs, Reset two-factor signs them out and they set up a new one; that includes admins set in Vercel. An owner&apos;s
          is reset in the Supabase dashboard (Authentication → Users).
        </p>
        <div className="rounded-xl border border-neutral-800 divide-y divide-neutral-900 bg-neutral-950">
          {owners.map((e) => (
            <Member key={`o-${e}`} email={e} level="owner" note="Set in code. Cannot be changed here." />
          ))}
          {envAdmins.map((e) => (
            <Member
              key={`e-${e}`}
              email={e}
              level="admin"
              note="Set in Vercel (ADMIN_EMAILS). Change it there."
              resetId={envAdminIds.get(e)}
              twoFactor={envAdminIds.has(e) ? twoFactor.get(envAdminIds.get(e) as string) : undefined}
            />
          ))}
          {rows.map((r) => (
            <Member
              key={r.user_id}
              email={r.email}
              level={r.level}
              note={`Added by ${r.added_by_email} on ${new Date(r.created_at).toLocaleDateString('en-US')}`}
              removeId={r.user_id}
              resetId={r.user_id}
              twoFactor={twoFactor.get(r.user_id)}
            />
          ))}
          {rows.length === 0 && !missing && (
            <div className="px-4 py-4 text-sm text-neutral-500">Nobody added yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function Member({
  email,
  level,
  note,
  removeId,
  resetId,
  twoFactor,
}: {
  email: string;
  level: StaffLevel;
  note: string;
  removeId?: string;
  resetId?: string;
  twoFactor?: boolean;
}) {
  return (
    <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <div className="text-sm text-neutral-100 break-all">{email}</div>
        <div className="text-xs text-neutral-500 mt-0.5">
          {LEVEL_LABELS[level]} · {note}
        </div>
        {twoFactor !== undefined && (
          <div className={`text-xs mt-0.5 ${twoFactor ? 'text-teal-300' : 'text-amber-300'}`}>
            {twoFactor ? 'Two-factor on' : 'Two-factor not set up yet (they set it up at their next sign-in)'}
          </div>
        )}
      </div>
      {(removeId || (resetId && twoFactor)) && (
        <div className="flex gap-2 flex-wrap">
          {twoFactor && resetId && (
            <form action={resetStaffTwoFactor}>
              <input type="hidden" name="user_id" value={resetId} />
              <button type="submit" className="rounded-full border border-neutral-700 text-neutral-300 px-4 py-1.5 text-sm hover:border-amber-400 hover:text-amber-200 transition-colors">
                Reset two-factor
              </button>
            </form>
          )}
          {removeId && (
            <form action={removeStaffMember}>
              <input type="hidden" name="user_id" value={removeId} />
              <button type="submit" className="rounded-full border border-neutral-700 text-neutral-300 px-4 py-1.5 text-sm hover:border-red-400 hover:text-red-200 transition-colors">
                Remove
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
