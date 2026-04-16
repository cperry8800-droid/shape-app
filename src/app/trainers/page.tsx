import CinematicPageShell from '@/components/CinematicPageShell';
import ProviderFilter from '@/components/ProviderFilter';
import { getTrainers } from '@/lib/queries';

export const metadata = { title: 'Coaches — Shape' };

export default async function TrainersPage() {
  const trainers = await getTrainers();
  const categories = Array.from(new Set(trainers.map((t) => t.category).filter(Boolean)))
    .map((v) => ({ value: v!, label: v! }));

  return (
    <CinematicPageShell title="Find a coach" subtitle="Every coach on Shape is verified — credentials, experience, reviews.">
      <div className="mx-auto max-w-4xl">
        <ProviderFilter items={trainers} categories={categories} kind="trainer" hrefPrefix="/trainers" />
      </div>
    </CinematicPageShell>
  );
}
