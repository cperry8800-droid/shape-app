import { notFound } from 'next/navigation';
import Link from 'next/link';
import CinematicPageShell from '@/components/CinematicPageShell';
import { getNutritionistById, isSubscribedTo } from '@/lib/queries';

export default async function NutritionistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const nutritionist = await getNutritionistById(Number(id));
  if (!nutritionist) notFound();

  const subscribed = await isSubscribedTo('nutritionist', nutritionist.id);

  return (
    <CinematicPageShell title={nutritionist.name} subtitle={nutritionist.specialty ?? undefined}>
      <div className="mx-auto max-w-2xl">
        {/* Avatar */}
        <div className="flex items-center gap-4 mb-8">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-semibold flex-shrink-0"
            style={{ background: `${nutritionist.color ?? '#2DD4BF'}22`, color: nutritionist.color ?? '#2DD4BF', border: `1px solid ${nutritionist.color ?? '#2DD4BF'}44` }}
          >
            {nutritionist.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('')}
          </div>
          <div>
            {nutritionist.credential && (
              <span className="text-xs uppercase tracking-wider text-white/40">{nutritionist.credential}</span>
            )}
            <div className="flex gap-4 text-sm text-white/60 mt-1">
              <span>★ {nutritionist.rating ?? '—'}</span>
              <span>{nutritionist.subscribers ?? 0} subscribers</span>
              <span>${nutritionist.price ?? 0}/mo</span>
            </div>
          </div>
        </div>

        {/* Bio */}
        {nutritionist.bio && (
          <p className="text-sm text-white/70 leading-relaxed mb-8">{nutritionist.bio}</p>
        )}

        {/* Plans */}
        {nutritionist.plans && nutritionist.plans.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-medium mb-4">Meal Plans</h2>
            <div className="space-y-3">
              {nutritionist.plans.map((p: any) => (
                <div key={p.id} className="rounded-lg border border-neutral-800 bg-neutral-900/30 backdrop-blur-md p-4">
                  <h3 className="font-medium mb-1">{p.name}</h3>
                  {p.description && <p className="text-sm text-white/50">{p.description}</p>}
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
            href={`/subscribe?role=nutritionist&id=${nutritionist.id}`}
            className="block text-center text-sm font-medium bg-white text-neutral-950 rounded-full px-6 py-3 hover:bg-white/90 transition-colors"
          >
            Subscribe — ${nutritionist.price ?? 0}/mo
          </Link>
        )}
      </div>
    </CinematicPageShell>
  );
}
