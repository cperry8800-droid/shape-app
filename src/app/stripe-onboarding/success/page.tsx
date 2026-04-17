// Landing page after a provider finishes (or bails out of) Stripe Connect
// onboarding. We fetch the account from Stripe to see whether charges are
// actually enabled yet and surface a status + next step.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { stripe } from '@/lib/stripe';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const metadata = { title: 'Stripe onboarding — Shape' };

type SearchParams = Promise<{ role?: string; id?: string }>;

export default async function StripeOnboardingSuccessPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { role, id } = await searchParams;
  const providerRole = role === 'trainer' || role === 'nutritionist' ? role : null;
  const providerId = Number(id);
  if (!providerRole || !providerId) redirect('/dashboard');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const table = providerRole === 'trainer' ? 'trainers' : 'nutritionists';
  const admin = createAdminClient();
  const { data: provider } = await admin
    .from(table)
    .select('id, owner_id, stripe_account_id')
    .eq('id', providerId)
    .maybeSingle();

  if (!provider || provider.owner_id !== user.id || !provider.stripe_account_id) {
    redirect('/dashboard');
  }

  const account = await stripe.accounts.retrieve(provider.stripe_account_id!);
  const chargesEnabled = account.charges_enabled;
  const payoutsEnabled = account.payouts_enabled;
  const status = chargesEnabled && payoutsEnabled ? 'active' : 'pending';

  await admin
    .from(table)
    .update({ stripe_account_status: status })
    .eq('id', providerId);

  const dashboardHref =
    providerRole === 'trainer' ? '/trainer-dashboard.html' : '/nutrition-schedule.html';

  return (
    <main className="max-w-md mx-auto px-6 py-20 text-white">
      <h1 className="text-3xl font-light tracking-tight mb-4">
        {status === 'active' ? 'You’re all set' : 'Almost there'}
      </h1>
      <p className="text-sm text-neutral-400 mb-6">
        {status === 'active'
          ? 'Stripe has verified your account. Clients can now pay you through Shape — 85% of every charge lands in your Stripe balance automatically (Shape keeps 15%).'
          : 'Stripe still needs a bit more info before you can accept payments. Head back to Stripe to finish — you can close this tab and come back later.'}
      </p>
      <div className="flex gap-3 flex-wrap">
        {status !== 'active' && (
          <Link
            href={`/api/stripe/connect/refresh?role=${providerRole}&id=${providerId}`}
            className="text-sm font-medium bg-white text-neutral-950 rounded-full px-5 py-2.5 hover:bg-white/90 transition-colors"
          >
            Finish Stripe setup
          </Link>
        )}
        <Link
          href={dashboardHref}
          className="text-sm font-medium border border-neutral-700 rounded-full px-5 py-2.5 hover:bg-neutral-900 transition-colors"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
