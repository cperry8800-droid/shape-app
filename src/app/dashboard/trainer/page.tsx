// Trainer dashboard — pending requests, confirmed sessions, real subscribers.
// Subscribers come from the subscriptions table joined via trainers.owner_id.

import Link from 'next/link';
import { getMySessions, getMyProviderRows, getMyProviderSubscribers } from '@/lib/queries';

export const metadata = { title: 'Trainer — Shape' };

export default async function TrainerDashboardPage() {
  const [sessions, providerRows, subscribers] = await Promise.all([
    getMySessions(),
    getMyProviderRows(),
    getMyProviderSubscribers('trainer'),
  ]);

  const trainer = providerRows.trainer;
  const requests = sessions.filter((s) => s.status === 'requested');
  const confirmed = sessions.filter(
    (s) => s.status === 'confirmed' && new Date(s.scheduled_at).getTime() >= Date.now()
  );
  const activeSubs = subscribers.filter((s) => s.status === 'active' || s.status === 'trialing');
  const mrrCents = activeSubs.reduce((sum, s) => sum + (s.price_cents ?? 0), 0);

  return (
    <div className="flex flex-col gap-8">
      {trainer ? (
        <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-medium">{trainer.name}</h2>
              <p className="text-xs text-neutral-500 mt-1">
                Your trainer profile · ID #{trainer.id}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/trainer-dashboard.html"
                className="text-xs font-medium uppercase tracking-[0.08em] border border-teal-400/60 text-teal-300 px-3 py-2 hover:bg-teal-400 hover:text-neutral-950 transition-colors"
              >
                Open full dashboard →
              </Link>
              <Link
                href={`/trainer-profile.html?id=${trainer.id}`}
                className="text-xs text-teal-400 hover:text-teal-300"
              >
                View public profile →
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <Stat label="Active subs" value={activeSubs.length.toString()} />
            <Stat label="MRR" value={`$${(mrrCents / 100).toFixed(2)}`} />
            <Stat label="Lifetime subs" value={(trainer.subscribers ?? 0).toString()} />
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-amber-900/40 bg-amber-900/10 p-6">
          <h2 className="text-lg font-medium mb-2">No trainer profile linked</h2>
          <p className="text-sm text-neutral-400 mb-4">
            Your account isn&rsquo;t linked to a trainer row yet. Claim an existing listing to
            start seeing real subscribers and MRR.
          </p>
          <Link
            href="/dashboard/claim"
            className="inline-flex text-xs font-medium uppercase tracking-[0.08em] border border-teal-400/60 text-teal-300 px-4 py-2 hover:bg-teal-400 hover:text-neutral-950 transition-colors"
          >
            Claim a trainer profile →
          </Link>
        </section>
      )}

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <h2 className="text-lg font-medium mb-4">
          Subscribers <span className="text-neutral-500 text-sm">({subscribers.length})</span>
        </h2>
        {subscribers.length === 0 ? (
          <p className="text-sm text-neutral-500">
            {trainer
              ? 'No subscribers yet. They show up here as soon as someone subscribes via Stripe.'
              : 'Subscribers will appear here once your profile is linked.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {subscribers.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between text-sm border border-neutral-800 rounded-lg px-4 py-3"
              >
                <span className="font-mono text-xs text-neutral-400">
                  {s.client_id.slice(0, 8)}…
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-neutral-500">
                    ${((s.price_cents ?? 0) / 100).toFixed(0)}/mo
                  </span>
                  <StatusPill status={s.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <h2 className="text-lg font-medium mb-4">
          Pending requests <span className="text-neutral-500 text-sm">({requests.length})</span>
        </h2>
        {requests.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No pending requests. When clients book a session with you, they&rsquo;ll appear here.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {requests.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between text-sm border border-neutral-800 rounded-lg px-4 py-3"
              >
                <span className="capitalize">
                  {s.type} · {new Date(s.scheduled_at).toLocaleString()}
                </span>
                <span className="text-xs text-neutral-500">{s.duration_min} min</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <h2 className="text-lg font-medium mb-4">
          Confirmed sessions <span className="text-neutral-500 text-sm">({confirmed.length})</span>
        </h2>
        {confirmed.length === 0 ? (
          <p className="text-sm text-neutral-500">No upcoming confirmed sessions.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {confirmed.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between text-sm border border-neutral-800 rounded-lg px-4 py-3"
              >
                <span className="capitalize">
                  {s.type} · {new Date(s.scheduled_at).toLocaleString()}
                </span>
                {s.meeting_url && (
                  <a
                    href={s.meeting_url}
                    className="text-xs text-teal-400 hover:text-teal-300"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Start →
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xl font-light tracking-tight">{value}</div>
      <div className="text-xs uppercase tracking-wider text-neutral-500 mt-1">{label}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === 'active'
      ? 'bg-teal-400/10 text-teal-300 border-teal-400/30'
      : status === 'trialing'
        ? 'bg-blue-400/10 text-blue-300 border-blue-400/30'
        : 'bg-amber-400/10 text-amber-300 border-amber-400/30';
  return (
    <span className={`text-[0.65rem] uppercase tracking-wider border rounded-full px-2 py-0.5 ${cls}`}>
      {status}
    </span>
  );
}
