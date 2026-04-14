// Gym detail page — /gyms/[id]

import { getGymById } from '@/lib/queries';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await getGymById(Number(id));
  if (!g) return { title: 'Gym not found — Shape' };
  return { title: `${g.name} — Shape`, description: g.bio ?? undefined };
}

export default async function GymDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const g = await getGymById(Number(id));
  if (!g) notFound();

  const accent = g.color ?? '#2DD4BF';

  return (
    <main className="max-w-4xl mx-auto px-6 py-16">
      <Link href="/gyms" className="text-sm text-neutral-500 hover:text-neutral-200 mb-8 inline-block">
        ← All gyms
      </Link>

      <div className="flex items-start gap-6 mb-10">
        <div
          className="w-24 h-24 rounded-full flex items-center justify-center text-2xl font-semibold flex-shrink-0"
          style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}44` }}
        >
          {g.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-4xl font-light tracking-tight mb-1">{g.name}</h1>
          <div className="text-neutral-400 mb-3">{g.type}</div>
          <div className="flex items-center gap-4 text-sm text-neutral-500 flex-wrap">
            <span>★ {g.rating}</span>
            <span>·</span>
            <span>{g.location}</span>
            {g.members != null && (<><span>·</span><span>{g.members.toLocaleString()} members</span></>)}
            {g.trainers != null && (<><span>·</span><span>{g.trainers} trainers</span></>)}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-3xl font-semibold">${g.price}</div>
          <div className="text-[0.65rem] text-neutral-500 uppercase tracking-wider">/ month</div>
        </div>
      </div>

      {g.bio && (
        <div className="mb-12">
          <p className="text-neutral-300 leading-relaxed">{g.bio}</p>
        </div>
      )}

      {g.amenities && g.amenities.length > 0 && (
        <div className="mb-10">
          <h2 className="text-sm uppercase tracking-[0.12em] text-neutral-500 mb-3">Amenities</h2>
          <div className="flex flex-wrap gap-2">
            {g.amenities.map((a, i) => (
              <span key={i} className="text-xs bg-neutral-900 border border-neutral-800 rounded-full px-3 py-1">
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {g.classes && g.classes.length > 0 && (
        <div>
          <h2 className="text-sm uppercase tracking-[0.12em] text-neutral-500 mb-3">Classes</h2>
          <div className="flex flex-wrap gap-2">
            {g.classes.map((c, i) => (
              <span key={i} className="text-xs bg-neutral-900 border border-neutral-800 rounded-full px-3 py-1">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
