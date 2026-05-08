import Link from 'next/link';
import { getMyProviderRows, getMyProviderSubscribers } from '@/lib/queries';
import ProgramToolsClient from './ProgramToolsClient';

export const metadata = { title: 'Program tools - Shape' };

export default async function ProgramToolsPage() {
  const [providerRows, trainerSubscribers, nutritionistSubscribers] = await Promise.all([
    getMyProviderRows(),
    getMyProviderSubscribers('trainer'),
    getMyProviderSubscribers('nutritionist'),
  ]);
  const hasProviderProfile = Boolean(providerRows.trainer || providerRows.nutritionist);
  const bulkClients = [...trainerSubscribers, ...nutritionistSubscribers]
    .filter((subscriber, index, list) => list.findIndex((item) => item.client_id === subscriber.client_id) === index)
    .map((subscriber, index) => ({
      id: subscriber.client_id,
      label: `Client ${index + 1} - ${subscriber.client_id.slice(0, 8)}`,
      status: subscriber.status,
    }));

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-[0.12em] text-teal-400 mb-2">
              Coach-built program tools
            </div>
            <h2 className="text-2xl font-light tracking-tight">Build, generate, adjust, review.</h2>
            <p className="text-sm text-neutral-400 mt-2 max-w-2xl">
              Generate a workout or program draft, attach exercise demos, set auto-adjust rules,
              and review sensor-ready set logs after the client trains.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link
              href="/dashboard/workout-reviews"
              className="text-xs font-medium uppercase tracking-[0.08em] border border-neutral-700 text-neutral-200 rounded-full px-4 py-2 hover:bg-neutral-900 transition-colors"
            >
              Review logs
            </Link>
            <Link
              href="/trainer-dashboard.html"
              className="text-xs font-medium uppercase tracking-[0.08em] bg-teal-400 text-neutral-950 rounded-full px-4 py-2 hover:bg-teal-300 transition-colors"
            >
              Open full coach dashboard
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-6">
          <FeatureCard title="AI generation" detail="Workout, program, and meal-plan drafts." />
          <FeatureCard title="Auto-adjust" detail="Rules for readiness, missed sets, and RPE." />
          <FeatureCard title="Exercise library" detail="Coach demos, cues, faults, and tags." />
          <FeatureCard title="Form feedback" detail="Pacing, rest, tempo, and ROM notes." />
          <FeatureCard title="Sensor-ready" detail="Rep count, tempo, ROM, HR samples." />
        </div>

        {!hasProviderProfile && (
          <div className="mt-5 rounded-lg border border-amber-400/30 bg-amber-400/10 text-amber-200 text-sm px-4 py-3">
            Link or claim a trainer/nutritionist profile before publishing templates to clients.
          </div>
        )}
      </section>

      <ProgramToolsClient
        trainerId={providerRows.trainer?.id ?? null}
        nutritionistId={providerRows.nutritionist?.id ?? null}
        bulkClients={bulkClients}
      />
    </div>
  );
}

function FeatureCard({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-neutral-500 mt-2 leading-relaxed">{detail}</div>
    </div>
  );
}
