// Nutritionist detail page — /nutritionists/[id]

import { getNutritionistById } from '@/lib/queries';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = await getNutritionistById(Number(id));
  if (!n) return { title: 'Nutritionist not found — Shape' };
  return { title: `${n.name} — Shape`, description: n.bio ?? undefined };
}

export default async function NutritionistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const n = await getNutritionistById(Number(id));
  if (!n) notFound();

  const accent = n.color ?? '#2DD4BF';

  return (
    <main className="max-w-4xl mx-auto px-6 py-16">
      <Link href="/nutritionists" className="text-sm text-neutral-500 hover:text-neutral-200 mb-8 inline-block">
        ← All nutritionists
      </Link>

      <div className="flex items-start gap-6 mb-10">
        <div
          className="w-24 h-24 rounded-full flex items-center justify-center text-2xl font-semibold flex-shrink-0"
          style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}44` }}
        >
          {n.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-4xl font-light tracking-tight mb-1">{n.name}</h1>
          <div className="text-neutral-400 mb-3">{n.specialty}</div>
          <div className="flex items-center gap-4 text-sm text-neutral-500 flex-wrap">
            <span>★ {n.rating}</span>
            <span>·</span>
            <span>{n.subscribers?.toLocaleString()} subscribers</span>
            {n.experience && (<><span>·</span><span>{n.experience}</span></>)}
            {n.credential && (<><span>·</span><span className="uppercase tracking-wider text-xs">{n.credential}</span></>)}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-3xl font-semibold">${n.price}</div>
          <div className="text-[0.65rem] text-neutral-500 uppercase tracking-wider">/ month</div>
        </div>
      </div>

      {n.bio && (
        <div className="mb-12">
          <p className="text-neutral-300 leading-relaxed">{n.bio}</p>
        </div>
      )}

      {n.services && n.services.length > 0 && (
        <div className="mb-12">
          <h2 className="text-sm uppercase tracking-[0.12em] text-neutral-500 mb-3">Services</h2>
          <div className="flex flex-wrap gap-2">
            {n.services.map((s, i) => (
              <span key={i} className="text-xs bg-neutral-900 border border-neutral-800 rounded-full px-3 py-1">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {n.plans && n.plans.length > 0 && (
        <div>
          <h2 className="text-2xl font-light tracking-tight mb-6">Meal Plans</h2>
          <div className="flex flex-col gap-4">
            {n.plans.map((p) => (
              <div key={p.id} className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h3 className="font-semibold text-lg">{p.name}</h3>
                    <div className="text-sm text-neutral-500 mt-1">
                      {[p.type, p.duration, p.difficulty].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  {p.price != null && (
                    <div className="text-right flex-shrink-0">
                      <div className="text-lg font-semibold">${p.price}</div>
                    </div>
                  )}
                </div>
                {p.description && (<p className="text-sm text-neutral-400 mb-4">{p.description}</p>)}
                {p.sample_days && p.sample_days.length > 0 && (
                  <div className="pt-4 border-t border-neutral-800">
                    <div className="text-[0.65rem] uppercase tracking-[0.12em] text-neutral-500 mb-3">
                      Sample days
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      {p.sample_days.map((d) => (
                        <div key={d.id} className="text-xs">
                          <div className="font-semibold text-neutral-300 mb-1">{d.day_label}</div>
                          <div className="text-neutral-500 mb-2">
                            {d.calories} · {d.protein}
                          </div>
                          <ul className="text-neutral-500 space-y-1 list-none">
                            {d.breakfast && <li>— Breakfast: {d.breakfast}</li>}
                            {d.lunch && <li>— Lunch: {d.lunch}</li>}
                            {d.dinner && <li>— Dinner: {d.dinner}</li>}
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
