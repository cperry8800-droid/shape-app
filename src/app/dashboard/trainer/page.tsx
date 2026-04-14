// Trainer dashboard shell — pending requests, confirmed sessions, subs count.
// Real numbers once the subscribe/booking flow ships; for now, reads sessions.

import { getMySessions } from '@/lib/queries';

export const metadata = { title: 'Trainer — Shape' };

export default async function TrainerDashboardPage() {
  const sessions = await getMySessions();
  const requests = sessions.filter((s) => s.status === 'requested');
  const confirmed = sessions.filter(
    (s) => s.status === 'confirmed' && new Date(s.scheduled_at).getTime() >= Date.now()
  );

  return (
    <div className="flex flex-col gap-8">
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

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <h2 className="text-lg font-medium mb-2">Your listing</h2>
        <p className="text-sm text-neutral-400">
          Listing management (bio, pricing, availability, programs) will land with the trainer
          onboarding flow. For now, listings are seeded from the marketplace data.
        </p>
      </section>
    </div>
  );
}
