// Trainer detail page — /trainers/[id]
// Server-rendered, deep-linkable, SEO-friendly. Shows full bio, all workouts,
// and each workout's sample days with exercises.

import { getTrainerById, isSubscribedTo } from '@/lib/queries';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import SubscribeButton from '@/components/SubscribeButton';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trainer = await getTrainerById(Number(id));
  if (!trainer) return { title: 'Trainer not found — Shape' };
  return {
    title: `${trainer.name} — Shape`,
    description: trainer.bio ?? undefined,
  };
}

export default async function TrainerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trainer = await getTrainerById(Number(id));
  if (!trainer) notFound();

  const subscribed = await isSubscribedTo('trainer', trainer.id);
  const accent = trainer.color ?? '#2DD4BF';

  return (
    <main className="max-w-4xl mx-auto px-6 py-16">
      <Link href="/trainers" className="text-sm text-neutral-500 hover:text-neutral-200 mb-8 inline-block">
        ← All trainers
      </Link>

      <div className="flex items-start gap-6 mb-10">
        <div
          className="w-24 h-24 rounded-full flex items-center justify-center text-2xl font-semibold flex-shrink-0"
          style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}44` }}
        >
          {trainer.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-4xl font-light tracking-tight mb-1">{trainer.name}</h1>
          <div className="text-neutral-400 mb-3">{trainer.specialty}</div>
          <div className="flex items-center gap-4 text-sm text-neutral-500 flex-wrap">
            <span>★ {trainer.rating}</span>
            <span>·</span>
            <span>{trainer.subscribers?.toLocaleString()} subscribers</span>
            {trainer.experience && (
              <>
                <span>·</span>
                <span>{trainer.experience}</span>
              </>
            )}
            {trainer.credential && (
              <>
                <span>·</span>
                <span className="uppercase tracking-wider text-xs">{trainer.credential}</span>
              </>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0 flex flex-col items-end gap-3">
          <div>
            <div className="text-3xl font-semibold">${trainer.price}</div>
            <div className="text-[0.65rem] text-neutral-500 uppercase tracking-wider">/ month</div>
          </div>
          <SubscribeButton
            providerId={trainer.id}
            providerRole="trainer"
            priceLabel={`$${trainer.price}/mo`}
            alreadySubscribed={subscribed}
          />
        </div>
      </div>

      {trainer.bio && (
        <div className="mb-12">
          <p className="text-neutral-300 leading-relaxed">{trainer.bio}</p>
        </div>
      )}

      {trainer.workouts && trainer.workouts.length > 0 && (
        <div>
          <h2 className="text-2xl font-light tracking-tight mb-6">Workouts</h2>
          <div className="flex flex-col gap-4">
            {trainer.workouts.map((w) => (
              <div key={w.id} className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h3 className="font-semibold text-lg">{w.name}</h3>
                    <div className="text-sm text-neutral-500 mt-1">
                      {[w.type, w.duration, w.difficulty, w.location].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  {w.price != null && (
                    <div className="text-right flex-shrink-0">
                      <div className="text-lg font-semibold">${w.price}</div>
                    </div>
                  )}
                </div>
                {w.description && (
                  <p className="text-sm text-neutral-400 mb-4">{w.description}</p>
                )}
                {w.sample_days && w.sample_days.length > 0 && (
                  <div className="pt-4 border-t border-neutral-800">
                    <div className="text-[0.65rem] uppercase tracking-[0.12em] text-neutral-500 mb-3">
                      Sample week
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      {w.sample_days.map((d) => (
                        <div key={d.id}>
                          <div className="text-xs font-semibold text-neutral-300 mb-2">
                            {d.day_label}
                          </div>
                          <ul className="text-xs text-neutral-500 space-y-1 list-none">
                            {d.exercises.map((ex, i) => (
                              <li key={i}>— {ex}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
