// Nutritionist dashboard shell — near-identical shape to the trainer one.
// Split as a separate route so they can diverge (meal plans vs workouts).

import { getMySessions } from '@/lib/queries';

export const metadata = { title: 'Nutritionist — Shape' };

export default async function NutritionistDashboardPage() {
  const sessions = await getMySessions();
  const requests = sessions.filter((s) => s.status === 'requested');
  const confirmed = sessions.filter(
    (s) => s.status === 'confirmed' && new Date(s.scheduled_at).getTime() >= Date.now()
  );

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <h2 className="text-lg font-medium mb-4">
          Consultation requests{' '}
          <span className="text-neutral-500 text-sm">({requests.length})</span>
        </h2>
        {requests.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No pending requests. Clients can book consultations once the marketplace purchase flow
            ships.
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
          Confirmed sessions{' '}
          <span className="text-neutral-500 text-sm">({confirmed.length})</span>
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
        <h2 className="text-lg font-medium mb-2">Meal plans</h2>
        <p className="text-sm text-neutral-400">
          Meal plan authoring (macros, sample days, client assignment) will land with the
          nutritionist onboarding flow.
        </p>
      </section>
    </div>
  );
}
