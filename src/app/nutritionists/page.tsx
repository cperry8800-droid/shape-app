import CinematicPageShell from '@/components/CinematicPageShell';
import ProviderFilter from '@/components/ProviderFilter';
import { getNutritionists } from '@/lib/queries';

export const metadata = { title: 'Nutritionists — Shape' };

export default async function NutritionistsPage() {
  const nutritionists = await getNutritionists();
  const categories = Array.from(new Set(nutritionists.map((n) => n.category).filter(Boolean)))
    .map((v) => ({ value: v!, label: v! }));

  return (
    <CinematicPageShell title="Find a nutritionist" subtitle="Your nutritionist sends the grocery list. You just shop.">
      <div className="mx-auto max-w-4xl">
        <ProviderFilter items={nutritionists} categories={categories} kind="nutritionist" hrefPrefix="/nutritionists" />
      </div>
    </CinematicPageShell>
  );
}
