// Client dashboard shell — placeholder until subscriptions ship.
// Eventually this shows the client's subscribed trainers/nutritionists,
// upcoming sessions, message threads, and meal/workout plan pdfs.

import Link from 'next/link';
import { getMySessions } from '@/lib/queries';

export const metadata = { title: 'My Coaches — Shape' };

export default async function ClientDashboardPage() {
  const sessions = await getMySessions();
  const upcoming = sessions
    .filter((s) => new Date(s.scheduled_at).getTime() >= Date.now() && s.status === 'confirmed')
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <h2 className="text-lg font-medium mb-2">Your coaches</h2>
        <p className="text-sm text-neutral-400 mb-4">
          You haven&rsquo;t subscribed to any coaches yet. Browse the marketplace to find someone.
        </p>
        <div className="flex gap-3 flex-wrap">
          <Link
            href="/trainers"
            className="text-sm font-medium bg-teal-400 text-neutral-950 rounded-full px-5 py-2.5 hover:bg-teal-300 transition-colors"
          >
            Find a trainer
          </Link>
          <Link
            href="/nutritionists"
            className="text-sm font-medium border border-neutral-700 rounded-full px-5 py-2.5 hover:bg-neutral-900 transition-colors"
          >
            Find a nutritionist
          </Link>
          <Link
            href="/gyms"
            className="text-sm font-medium border border-neutral-700 rounded-full px-5 py-2.5 hover:bg-neutral-900 transition-colors"
          >
            Find a gym
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <h2 className="text-lg font-medium mb-4">Upcoming sessions</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-neutral-500">No upcoming sessions scheduled.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.map((s) => (
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
                    Join →
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
