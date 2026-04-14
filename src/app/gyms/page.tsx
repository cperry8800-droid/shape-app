// Gyms marketplace — server-rendered from Supabase.

import { getGyms } from '@/lib/queries';
import ProviderCard from '@/components/ProviderCard';
import ProviderFilter from '@/components/ProviderFilter';
import PageHero from '@/components/PageHero';
import Section from '@/components/Section';

const GYM_CATEGORIES = [
  { value: 'gym', label: 'Full Gym' },
  { value: 'studio', label: 'Studio' },
  { value: 'crossfit', label: 'CrossFit' },
  { value: 'specialty', label: 'Specialty' },
];

export const metadata = {
  title: 'Gyms — Shape',
  description: 'Full-service gyms, boutique studios, and CrossFit boxes on Shape.',
};

export default async function GymsPage() {
  const gyms = await getGyms();

  const top = [...gyms]
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.members ?? 0) - (a.members ?? 0))
    .slice(0, 3);

  return (
    <main className="max-w-6xl mx-auto px-6 py-16">
      <PageHero tag="Gyms" gradientWord="home" title="Find your" subtitle="Full-service gyms, boutique studios, and CrossFit boxes. Find one near you." />

      <Section title="Top Gyms" subtitle="Highest rated gyms on Shape">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {top.map((g) => (
            <ProviderCard
              key={g.id}
              name={g.name}
              subtitle={g.type}
              bio={g.bio}
              color={g.color}
              primary={{ label: 'Rating', value: `★ ${g.rating ?? '—'}` }}
              secondary={{ label: 'Location', value: g.location ?? '' }}
              priceLabel={`$${g.price ?? 0}`}
              priceSuffix="/ month"
              href={`/gyms/${g.id}`}
            />
          ))}
        </div>
      </Section>

      <Section title={`All Gyms (${gyms.length})`}>
        <ProviderFilter
          items={gyms}
          categories={GYM_CATEGORIES}
          kind="gym"
          hrefPrefix="/gyms"
        />
      </Section>
    </main>
  );
}
