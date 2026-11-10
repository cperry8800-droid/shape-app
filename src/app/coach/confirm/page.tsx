import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CONFIRM_PATH, pendingConfirmation, type ProviderApplication } from '@/lib/coach-approval';
import { coachPages } from '@/lib/coach-application-emails';
import { confirmCoachApproval } from './actions';

// Where an approval of an application sent signed out, to an address whose account is in use,
// is confirmed by that account (src/lib/coach-approval.ts). Opening the page changes nothing:
// the Confirm button posts confirmCoachApproval.

export const metadata = { title: 'Confirm your coach account — Shape' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ application?: string | string[]; state?: string | string[] }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** "d•••@example.com": enough for the owner to recognise the address, not enough to learn it. */
function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!name || !domain) return '';
  return `${name[0]}•••@${domain}`;
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="max-w-md mx-auto px-6 py-20">
      <h1 className="text-3xl font-light tracking-tight mb-4">{title}</h1>
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6 text-sm leading-relaxed text-neutral-300 flex flex-col gap-4">
        {children}
      </div>
    </main>
  );
}

const linkClass = 'text-teal-300 underline underline-offset-4';
const buttonClass =
  'inline-flex min-h-11 items-center justify-center rounded-full bg-teal-400 px-5 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-teal-300 transition-colors';

export default async function ConfirmCoachPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const rawId = first(params.application).trim();
  const applicationId = UUID.test(rawId) ? rawId : '';
  const state = first(params.state);
  const here = applicationId ? `${CONFIRM_PATH}?application=${applicationId}` : CONFIRM_PATH;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) redirect(`/login?next=${encodeURIComponent(here)}`);

  const nothing = (
    <Shell title="Nothing to confirm">
      <p>There’s no coach approval waiting for this account. If you think that’s wrong, reply to the email Shape sent you, or write to support from the Help page.</p>
    </Shell>
  );
  if (!applicationId) return nothing;

  const admin = createAdminClient();
  const { data } = await admin
    .from('provider_applications')
    .select('id, status, provider_type, first_name, admin_review')
    .eq('id', applicationId)
    .maybeSingle();
  const application = data as Pick<ProviderApplication, 'id' | 'status' | 'provider_type' | 'first_name' | 'admin_review'> | null;
  if (!application) return nothing;

  const role = application.provider_type === 'nutritionist' ? 'nutritionist' : 'trainer';
  const review = (application.admin_review ?? {}) as Record<string, unknown>;
  const approved = (review.approved_provider ?? {}) as Record<string, unknown>;
  const pending = pendingConfirmation(application);

  // Done: shown only to the account it was done for.
  if (application.status === 'approved') {
    if (approved.owner_id !== user.id) return nothing;
    const pages = coachPages(role, '');
    return (
      <Shell title="You’re a coach on Shape">
        <p>Coaching is on for this account. Your listing appears in the marketplace once you’ve added a photo, set your prices and connected payouts. The approval email lists each step.</p>
        <p>
          <a className={buttonClass} href={pages.dashboard}>Open your coach dashboard</a>
        </p>
        <p className="text-neutral-400">In the Shape app, switch to your coach view from Profile.</p>
      </Shell>
    );
  }

  if (!pending || (application.status !== 'pending' && application.status !== 'in_review')) return nothing;

  // ⚠ ANOTHER ACCOUNT SEES NOTHING OF THE APPLICATION, only that it's the wrong account and a
  // masked form of the address the approval was sent to.
  if (pending.userId !== user.id) {
    return (
      <Shell title="Wrong account">
        <p>This approval is for a different Shape account{pending.email ? ` (${maskEmail(pending.email)})` : ''}. Sign out, then sign in with that account and open the link in the email again.</p>
        {state === 'wrong_account' ? <p className="text-amber-300">Nothing was changed.</p> : null}
      </Shell>
    );
  }

  const name = application.first_name?.trim() || 'there';
  return (
    <Shell title={`You’re approved, ${name}`}>
      <p>Your application to coach on Shape as a {role} was approved. Confirm to turn coaching on for the account you’re signed in to{user.email ? ` (${user.email})` : ''}.</p>
      <p className="text-neutral-400">This adds a coach profile and a listing to the account. Your account, its data and its membership stay as they are.</p>
      {state === 'busy' ? <p className="text-amber-300">Shape is still setting this up from a moment ago. Reload in a minute.</p> : null}
      {state === 'unavailable' ? (
        <p className="text-amber-300">This approval can’t be completed right now: the review changed after it was approved. Shape will be in touch, or reply to the approval email.</p>
      ) : null}
      <form action={confirmCoachApproval}>
        <input type="hidden" name="application_id" value={application.id} />
        <button type="submit" className={buttonClass}>Confirm and turn on coaching</button>
      </form>
      <p className="text-neutral-500">Didn’t apply? <a className={linkClass} href="/help.html">Tell Shape</a> and leave this page: nothing changes.</p>
    </Shell>
  );
}
