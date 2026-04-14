// Nutritionists marketplace — server-rendered from Supabase.

import { getNutritionists } from '@/lib/queries';
import ProviderCard from '@/components/ProviderCard';
import ProviderFilter from '@/components/ProviderFilter';
import PageHero from '@/components/PageHero';
import Section from '@/components/Section';

const NUTRITIONIST_CATEGORIES = [
  { value: 'sports', label: 'Sports' },
  { value: 'weightloss', label: 'Weight Loss' },
  { value: 'plantbased', label: 'Plant-Based' },
  { value: 'guthealth', label: 'Gut Health' },
  { value: 'prenatal', label: 'Prenatal' },
  { value: 'mealprep', label: 'Meal Prep' },
  { value: 'clinical', label: 'Clinical' },
  { value: 'general', label: 'General' },
];

export const metadata = {
  title: 'Nutritionists — Shape',
  description: 'Certified nutritionists on Shape. Custom meal plans, macro tracking, and ongoing support.',
};

export default async function NutritionistsPage() {
  const nutritionists = await getNutritionists();

  const top = [...nutritionists]
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.subscribers ?? 0) - (a.subscribers ?? 0))
    .slice(0, 3);

  return (
    <main className="max-w-6xl mx-auto px-6 py-16">
      <PageHero tag="Nutritionists" gradientWord="plan" title="Eat with a" subtitle="Subscribe to a certified nutritionist for custom meal plans, macro tracking, and ongoing support." />

      <Section title="Top Nutritionists" subtitle="Highest rated nutritionists on Shape">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {top.map((n) => (
            <ProviderCard
              key={n.id}
              name={n.name}
              subtitle={n.specialty}
              bio={n.bio}
              color={n.color}
              credential={n.credential}
              primary={{ label: 'Rating', value: `★ ${n.rating ?? '—'}` }}
              secondary={{ label: 'Subs', value: `${n.subscribers?.toLocaleString() ?? 0} subs` }}
              priceLabel={`$${n.price ?? 0}`}
              priceSuffix="/ month"
              href={`/nutritionists/${n.id}`}
            />
          ))}
        </div>
      </Section>

      <Section title={`All Nutritionists (${nutritionists.length})`}>
        <ProviderFilter
          items={nutritionists}
          categories={NUTRITIONIST_CATEGORIES}
          kind="nutritionist"
          hrefPrefix="/nutritionists"
        />
      </Section>
    </main>
  );
}
