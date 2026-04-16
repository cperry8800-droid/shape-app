import Link from 'next/link';
import { getMySessions, getMySubscriptions, getTrainers, getNutritionists } from '@/lib/queries';
import { cancelSubscription } from '@/app/subscribe/actions';
import DataTable from '@/components/dashboard/DataTable';

export const metadata = { title: 'My Coaches — Shape' };

export default async function ClientDashboardPage() {
  const [subs, sessions, trainers, nutritionists] = await Promise.all([
    getMySubscriptions(), getMySessions(), getTrainers(), getNutritionists(),
  ]);
  const trainerById = new Map(trainers.map(t => [t.id, t]));
  const nutriById = new Map(nutritionists.map(n => [n.id, n]));
  const upcoming = sessions.filter(s => new Date(s.scheduled_at).getTime() >= Date.now() && s.status === 'confirmed').slice(0, 5);

  const enrichedSubs = subs.map(s => {
    const provider = s.provider_role === 'trainer' ? trainerById.get(s.provider_id) : nutriById.get(s.provider_id);
    return { ...s, name: provider?.name ?? `${s.provider_role} #${s.provider_id}`, specialty: (provider as any)?.specialty ?? s.provider_role, href: s.provider_role === 'trainer' ? `/trainers/${s.provider_id}` : `/nutritionists/${s.provider_id}` };
  });

  return (
    <div>
      <h2 className="text-[0.6rem] uppercase tracking-[0.2em] text-white/25 mb-4">
        Your Coaches ({subs.length})
      </h2>
      {subs.length === 0 ? (
        <div className="py-8">
          <p className="text-sm text-white/30 mb-4">You haven't subscribed to any coaches yet.</p>
          <div className="flex gap-6 text-[0.7rem] uppercase tracking-widest">
            <Link href="/trainers" className="text-white/60 underline underline-offset-4 hover:text-white transition-colors">Find a coach</Link>
            <Link href="/nutritionists" className="text-white/60 underline underline-offset-4 hover:text-white transition-colors">Find a nutritionist</Link>
          </div>
        </div>
      ) : (
        <DataTable
          columns={[
            { label: 'Name', render: (s: any) => <Link href={s.href} className="text-white underline underline-offset-4 hover:opacity-60">{s.name}</Link> },
            { label: 'Type', render: (s: any) => <span className="capitalize text-white/40">{s.specialty}</span> },
            { label: 'Price', render: (s: any) => <span className="text-white/40">{s.price_cents != null ? `$${(s.price_cents/100).toFixed(0)}/mo` : ''}</span> },
            { label: 'Status', render: (s: any) => <span className="text-[0.6rem] uppercase tracking-widest text-white/30">{s.status}</span> },
            { label: '', render: (s: any) => (
              <form action={cancelSubscription} className="text-right">
                <input type="hidden" name="subscription_id" value={s.id} />
                <button type="submit" className="text-[0.6rem] text-red-400/60 hover:text-red-400 underline underline-offset-4 transition-colors">Cancel</button>
              </form>
            ), className: 'text-right' },
          ]}
          rows={enrichedSubs}
          keyFn={(s: any) => s.id}
        />
      )}

      <div className="mt-12">
        <h2 className="text-[0.6rem] uppercase tracking-[0.2em] text-white/25 mb-4">Upcoming Sessions</h2>
        <DataTable
          columns={[
            { label: 'Type', render: (s: any) => <span className="capitalize">{s.type}</span> },
            { label: 'Date', render: (s: any) => <span className="text-white/40">{new Date(s.scheduled_at).toLocaleString()}</span> },
            { label: '', render: (s: any) => s.meeting_url ? <a href={s.meeting_url} target="_blank" rel="noreferrer" className="text-white underline underline-offset-4 hover:opacity-60">Join</a> : null, className: 'text-right' },
          ]}
          rows={upcoming}
          keyFn={(s: any) => s.id}
          emptyText="No upcoming sessions scheduled."
        />
      </div>
    </div>
  );
}
