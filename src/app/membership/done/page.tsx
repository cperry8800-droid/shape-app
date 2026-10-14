// Where the installed app's in-app browser lands after the $5 membership checkout. Stripe
// returns through /api/stripe/platform-return, which adds `member=joined` (the membership is
// live), or `member=pending` (Stripe has not cleared the payment yet); a cancelled checkout
// comes here with neither. The app re-checks the membership when this browser closes.

export const metadata = { title: 'Membership — Shape', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function MembershipDonePage({
  searchParams,
}: {
  searchParams?: Promise<{ member?: string }>;
}) {
  const sp = await searchParams;
  const state = sp?.member;
  const joined = state === 'joined';
  const line = joined
    ? 'Your Shape membership is active.'
    : state === 'pending'
      ? 'Your payment is still clearing.'
      : 'No payment was taken.';
  const next = joined
    ? 'Close this page to go back to the Shape app.'
    : state === 'pending'
      ? 'Close this page to go back to the Shape app. It opens as soon as the payment clears.'
      : 'Close this page to go back to the Shape app, then tap Join to try again.';
  return (
    <main className="max-w-md mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <div className="text-xs uppercase tracking-[0.12em] text-teal-400 mb-1">Shape · Membership</div>
      <h1 role="status" className={`text-2xl sm:text-3xl font-light tracking-tight ${joined ? 'text-teal-300' : 'text-amber-300'}`}>
        {joined ? '✓ ' : ''}
        {line}
      </h1>
      <p className="mt-4 text-sm text-neutral-300">{next}</p>
    </main>
  );
}
