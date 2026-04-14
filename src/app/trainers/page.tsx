// Trainers marketplace — server-rendered from Supabase.

import { getTrainers } from '@/lib/queries';
import ProviderCard from '@/components/ProviderCard';
import ProviderFilter from '@/components/ProviderFilter';
import PageHero from '@/components/PageHero';
import Section from '@/components/Section';

const TRAINER_CATEGORIES = [
  { value: 'strength', label: 'Strength' },
  { value: 'hiit', label: 'HIIT' },
  { value: 'fullbody', label: 'Full Body' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'mobility', label: 'Mobility' },
  { value: 'weightloss', label: 'Weight Loss' },
  { value: 'bodybuilding', label: 'Bodybuilding' },
  { value: 'athome', label: 'At Home' },
];

export const metadata = {
  title: 'Trainers — Shape',
  description: 'Certified trainers on Shape. Subscribe for personalized programs and ongoing coaching.',
};

export default async function TrainersPage() {
  const trainers = await getTrainers();

  const top = [...trainers]
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.subscribers ?? 0) - (a.subscribers ?? 0))
    .slice(0, 3);

  return (
    <main className="max-w-6xl mx-auto px-6 py-16">
      <PageHero tag="Trainers" gradientWord="plan" title="Train with a" subtitle="Subscribe to a certified trainer for personalized programs, progress tracking, and ongoing coaching." />

      <Section title="Top Trainers" subtitle="Highest rated trainers on Shape">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {top.map((t) => (
            <ProviderCard
              key={t.id}
              name={t.name}
              subtitle={t.specialty}
              bio={t.bio}
              color={t.color}
              credential={t.credential}
              primary={{ label: 'Rating', value: `★ ${t.rating ?? '—'}` }}
              secondary={{ label: 'Subs', value: `${t.subscribers?.toLocaleString() ?? 0} subs` }}
              priceLabel={`$${t.price ?? 0}`}
              priceSuffix="/ month"
              href={`/trainers/${t.id}`}
            />
          ))}
        </div>
      </Section>

      <Section title={`All Trainers (${trainers.length})`}>
        <ProviderFilter
          items={trainers}
          categories={TRAINER_CATEGORIES}
          kind="trainer"
          hrefPrefix="/trainers"
        />
      </Section>
    </main>
  );
}
