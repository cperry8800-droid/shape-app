import { notFound } from 'next/navigation';
import Link from 'next/link';
import CinematicPageShell from '@/components/CinematicPageShell';
import { getTrainerById, isSubscribedTo } from '@/lib/queries';

export default async function TrainerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trainer = await getTrainerById(Number(id));
  if (!trainer) notFound();

  const subscribed = await isSubscribedTo('trainer', trainer.id);

  return (
    <CinematicPageShell title={trainer.name} subtitle={trainer.specialty ?? undefined}>
      <div className="mx-auto max-w-2xl">
        {/* Avatar */}
        <div className="flex items-center gap-4 mb-8">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-semibold flex-shrink-0"
            style={{ background: `${trainer.color ?? '#2DD4BF'}22`, color: trainer.color ?? '#2DD4BF', border: `1px solid ${trainer.color ?? '#2DD4BF'}44` }}
          >
            {trainer.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('')}
          </div>
          <div>
            {trainer.credential && (
              <span className="text-xs uppercase tracking-wider text-white/40">{trainer.credential}</span>
            )}
            <div className="flex gap-4 text-sm text-white/60 mt-1">
              <span>★ {trainer.rating ?? '—'}</span>
              <span>{trainer.subscribers ?? 0} subscribers</span>
              <span>${trainer.price ?? 0}/mo</span>
            </div>
          </div>
        </div>

        {/* Bio */}
        {trainer.bio && (
          <p className="text-sm text-white/70 leading-relaxed mb-8">{trainer.bio}</p>
        )}

        {/* Workouts */}
        {trainer.workouts && trainer.workouts.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-medium mb-4">Programs</h2>
            <div className="space-y-3">
              {trainer.workouts.map((w: any) => (
                <div key={w.id} className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-4">
                  <h3 className="font-medium mb-1">{w.name}</h3>
                  {w.description && <p className="text-sm text-white/50">{w.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        {subscribed ? (
          <div className="text-center py-4 rounded-full border border-teal-400/30 bg-teal-400/10 text-teal-400 text-sm font-medium">
            Subscribed
          </div>
        ) : (
          <Link
            href={`/subscribe?role=trainer&id=${trainer.id}`}
            className="block text-center text-sm font-medium bg-white text-neutral-950 rounded-full px-6 py-3 hover:bg-white/90 transition-colors"
          >
            Subscribe — ${trainer.price ?? 0}/mo
          </Link>
        )}
      </div>
    </CinematicPageShell>
  );
}
