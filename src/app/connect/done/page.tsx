// Where the installed app's in-app browser lands once a connection finishes
// (src/lib/integration-handoff.ts): the OAuth callback's redirect, or a link that ran out.

import { HANDOFF_LABELS, isHandoffProvider } from '@/lib/integration-handoff';

export const metadata = { title: 'Connect an app — Shape', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function ConnectDonePage({
  searchParams,
}: {
  searchParams?: Promise<{ integration?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const label = isHandoffProvider(sp?.integration) ? HANDOFF_LABELS[sp.integration] : 'The app';
  const status = sp?.status;
  const ok = status === 'ok';
  const line = ok
    ? `${label} is connected.`
    : status === 'expired'
      ? 'This link has run out.'
      : `${label} didn't connect.`;
  return (
    <main className="max-w-md mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <div className="text-xs uppercase tracking-[0.12em] text-teal-400 mb-1">Shape · Connect</div>
      <h1 role="status" className={`text-2xl sm:text-3xl font-light tracking-tight ${ok ? 'text-teal-300' : 'text-amber-300'}`}>
        {ok ? '✓ ' : ''}
        {line}
      </h1>
      <p className="mt-4 text-sm text-neutral-300">
        {ok
          ? 'Close this page to go back to the Shape app.'
          : 'Close this page to go back to the Shape app, then tap Connect to try again.'}
      </p>
    </main>
  );
}
