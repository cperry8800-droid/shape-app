// Client dashboard — lists the user's active subscriptions and upcoming
// sessions. Subscriptions are enriched with the provider's name/avatar so
// cards look decent; we fetch trainers & nutritionists in one shot and join
// in-memory (cheap: the lists are small).

import Link from 'next/link';
import { getMySessions, getMySubscriptions, getTrainers, getNutritionists } from '@/lib/queries';
import { cancelSubscription } from '@/app/subscribe/actions';
import { requestRefund } from '@/app/refunds/actions';

export const metadata = { title: 'My Coaches — Shape' };

export default async function ClientDashboardPage() {
  const [subs, sessions, trainers, nutritionists] = await Promise.all([
    getMySubscriptions(),
    getMySessions(),
    getTrainers(),
    getNutritionists(),
  ]);

  const trainerById = new Map(trainers.map((t) => [t.id, t]));
  const nutriById = new Map(nutritionists.map((n) => [n.id, n]));

  const upcoming = sessions
    .filter((s) => new Date(s.scheduled_at).getTime() >= Date.now() && s.status === 'confirmed')
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <h2 className="text-lg font-medium mb-4">
          Your coaches <span className="text-neutral-500 text-sm">({subs.length})</span>
        </h2>

        {subs.length === 0 ? (
          <>
            <p className="text-sm text-neutral-400 mb-4">
              You haven&rsquo;t subscribed to any coaches yet. Browse the marketplace to find
              someone.
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
            </div>
          </>
        ) : (
          <ul className="flex flex-col gap-3">
            {subs.map((s) => {
              const provider =
                s.provider_role === 'trainer'
                  ? trainerById.get(s.provider_id)
                  : nutriById.get(s.provider_id);
              const name = provider?.name ?? `${s.provider_role} #${s.provider_id}`;
              const subtitle =
                s.provider_role === 'trainer'
                  ? (provider as { specialty?: string | null } | undefined)?.specialty ?? 'Trainer'
                  : (provider as { specialty?: string | null } | undefined)?.specialty ?? 'Nutritionist';
              const href =
                s.provider_role === 'trainer'
                  ? `/trainers/${s.provider_id}`
                  : `/nutritionists/${s.provider_id}`;
              const price = s.price_cents != null ? `$${(s.price_cents / 100).toFixed(2)}/mo` : '';

              return (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-4 border border-neutral-800 rounded-lg px-4 py-3 flex-wrap"
                >
                  <div className="min-w-0">
                    <Link href={href} className="text-sm font-medium hover:text-teal-400 transition-colors">
                      {name}
                    </Link>
                    <div className="text-xs text-neutral-500 mt-0.5">
                      {subtitle} · {price} ·{' '}
                      <span className="uppercase tracking-wider">{s.status}</span>
                    </div>
                    {s.current_period_end && (
                      <div className="text-[0.65rem] text-neutral-600 mt-0.5">
                        Renews {new Date(s.current_period_end).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <form action={requestRefund}>
                      <input type="hidden" name="subscription_id" value={s.id} />
                      <button
                        type="submit"
                        className="text-xs text-neutral-400 hover:text-amber-300 border border-neutral-800 hover:border-amber-300/40 rounded-full px-3 py-1.5 transition-colors"
                      >
                        Request refund
                      </button>
                    </form>
                    <form action={cancelSubscription}>
                      <input type="hidden" name="subscription_id" value={s.id} />
                      <button
                        type="submit"
                        className="text-xs text-neutral-400 hover:text-red-400 border border-neutral-800 hover:border-red-400/40 rounded-full px-3 py-1.5 transition-colors"
                      >
                        Cancel
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
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
