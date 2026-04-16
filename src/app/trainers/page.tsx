import CinematicPageShell from '@/components/CinematicPageShell';
import ProviderFilter from '@/components/ProviderFilter';
import { getTrainers } from '@/lib/queries';

export const metadata = { title: 'Coaches — Shape' };

export default async function TrainersPage() {
  const trainers = await getTrainers();
  const existing = new Set(trainers.map((t) => t.category).filter(Boolean) as string[]);
  // Always surface Yoga — it's a first-class discipline on the marketplace
  // even before we have seeded trainers in that category.
  existing.add('Yoga');
  const categories = Array.from(existing).sort().map((v) => ({ value: v, label: v }));

  return (
    <CinematicPageShell title="Find a coach" subtitle="Every coach on Shape is verified — credentials, experience, reviews." backgroundImage="/intro/Trainer%20Background.png">
      <div className="mx-auto max-w-4xl">
        <ProviderFilter items={trainers} categories={categories} kind="trainer" hrefPrefix="/trainers" />
      </div>
    </CinematicPageShell>
  );
}
