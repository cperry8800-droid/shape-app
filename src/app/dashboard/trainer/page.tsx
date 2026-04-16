import Link from 'next/link';
import { getMySessions, getMyProviderRows, getMyProviderSubscribers } from '@/lib/queries';
import StatBar from '@/components/dashboard/StatBar';
import DataTable from '@/components/dashboard/DataTable';

export const metadata = { title: 'Trainer — Shape' };

export default async function TrainerDashboardPage() {
  const [sessions, providerRows, subscribers] = await Promise.all([
    getMySessions(), getMyProviderRows(), getMyProviderSubscribers('trainer'),
  ]);
  const trainer = providerRows.trainer;
  const requests = sessions.filter(s => s.status === 'requested');
  const confirmed = sessions.filter(s => s.status === 'confirmed' && new Date(s.scheduled_at).getTime() >= Date.now());
  const activeSubs = subscribers.filter(s => s.status === 'active' || s.status === 'trialing');
  const mrrCents = activeSubs.reduce((sum, s) => sum + (s.price_cents ?? 0), 0);

  if (!trainer) {
    return (
      <div className="py-12">
        <p className="text-sm text-white/30 mb-4">Your account isn't linked to a trainer profile yet.</p>
        <Link href="/dashboard/claim" className="text-white/60 underline underline-offset-4 hover:text-white text-[0.7rem] uppercase tracking-widest">
          Claim a trainer profile
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-sm text-white/40">{trainer.name} <span className="text-white/20">#{trainer.id}</span></div>
        <Link href={`/trainers/${trainer.id}`} className="text-[0.6rem] text-white/30 underline underline-offset-4 hover:text-white/60">View profile</Link>
      </div>

      <StatBar stats={[
        { value: String(activeSubs.length), label: 'Active subs' },
        { value: `$${(mrrCents / 100).toFixed(0)}`, label: 'MRR' },
        { value: String(trainer.subscribers ?? 0), label: 'Lifetime' },
      ]} />

      <div className="mt-10">
        <h2 className="text-[0.6rem] uppercase tracking-[0.2em] text-white/25 mb-4">Roster ({subscribers.length})</h2>
        <DataTable
          columns={[
            { label: 'Client', render: (s: any) => <span className="font-mono text-xs text-white/40">{s.client_id.slice(0, 8)}...</span> },
            { label: 'Price', render: (s: any) => <span className="text-white/40">${((s.price_cents ?? 0) / 100).toFixed(0)}/mo</span> },
            { label: 'Status', render: (s: any) => <span className={`text-[0.6rem] uppercase tracking-widest ${s.status === 'active' ? 'text-white/60' : s.status === 'trialing' ? 'text-blue-300/60' : 'text-amber-300/60'}`}>{s.status}</span>, className: 'text-right' },
          ]}
          rows={subscribers}
          keyFn={(s: any) => s.id}
          emptyText="No subscribers yet."
        />
      </div>

      <div className="mt-10">
        <h2 className="text-[0.6rem] uppercase tracking-[0.2em] text-white/25 mb-4">Pending Requests ({requests.length})</h2>
        <DataTable
          columns={[
            { label: 'Type', render: (s: any) => <span className="capitalize">{s.type}</span> },
            { label: 'Date', render: (s: any) => <span className="text-white/40">{new Date(s.scheduled_at).toLocaleString()}</span> },
            { label: 'Duration', render: (s: any) => <span className="text-white/30">{s.duration_min}m</span>, className: 'text-right' },
          ]}
          rows={requests}
          keyFn={(s: any) => s.id}
          emptyText="No pending requests."
        />
      </div>

      <div className="mt-10">
        <h2 className="text-[0.6rem] uppercase tracking-[0.2em] text-white/25 mb-4">Sessions ({confirmed.length})</h2>
        <DataTable
          columns={[
            { label: 'Type', render: (s: any) => <span className="capitalize">{s.type}</span> },
            { label: 'Date', render: (s: any) => <span className="text-white/40">{new Date(s.scheduled_at).toLocaleString()}</span> },
            { label: '', render: (s: any) => s.meeting_url ? <a href={s.meeting_url} target="_blank" rel="noreferrer" className="text-white underline underline-offset-4 hover:opacity-60">Start</a> : null, className: 'text-right' },
          ]}
          rows={confirmed}
          keyFn={(s: any) => s.id}
          emptyText="No upcoming sessions."
        />
      </div>
    </div>
  );
}
