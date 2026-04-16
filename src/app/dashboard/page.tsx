import Link from 'next/link';
import { getCurrentUserAndProfile, getMySessions } from '@/lib/queries';
import StatBar from '@/components/dashboard/StatBar';
import DataTable from '@/components/dashboard/DataTable';

export const metadata = { title: 'Dashboard — Shape' };

export default async function DashboardOverview() {
  const ctx = await getCurrentUserAndProfile();
  const sessions = await getMySessions();
  const now = Date.now();
  const upcoming = sessions.filter(s => new Date(s.scheduled_at).getTime() >= now && s.status !== 'cancelled' && s.status !== 'declined');
  const pending = sessions.filter(s => s.status === 'requested');
  const completed = sessions.filter(s => s.status === 'completed');
  const role = ctx?.profile?.role ?? 'client';
  const primaryHref = role === 'trainer' ? '/dashboard/trainer' : role === 'nutritionist' ? '/dashboard/nutritionist' : '/dashboard/client';

  return (
    <div>
      <StatBar stats={[
        { value: String(upcoming.length), label: 'Upcoming' },
        { value: String(pending.length), label: 'Pending' },
        { value: String(completed.length), label: 'Completed' },
      ]} />

      <div className="flex gap-6 py-6 text-[0.7rem] uppercase tracking-widest">
        <Link href={primaryHref} className="text-white/60 underline underline-offset-4 hover:text-white transition-colors">
          Open {role} view
        </Link>
        {role === 'client' && (
          <Link href="/trainers" className="text-white/60 underline underline-offset-4 hover:text-white transition-colors">
            Browse coaches
          </Link>
        )}
        <Link href="/dashboard/settings" className="text-white/60 underline underline-offset-4 hover:text-white transition-colors">
          Settings
        </Link>
      </div>

      <div className="mt-6">
        <h2 className="text-[0.6rem] uppercase tracking-[0.2em] text-white/25 mb-4">Recent Activity</h2>
        <DataTable
          columns={[
            { label: 'Session', render: (s: any) => <span className="capitalize">{s.type}</span> },
            { label: 'Date', render: (s: any) => <span className="text-white/40">{new Date(s.scheduled_at).toLocaleDateString()}</span> },
            { label: 'Status', render: (s: any) => <span className="text-[0.6rem] uppercase tracking-widest text-white/30">{s.status}</span>, className: 'text-right' },
          ]}
          rows={sessions.slice(0, 8)}
          keyFn={(s: any) => s.id}
          emptyText="No sessions yet. When you book or receive a request, it'll show up here."
        />
      </div>
    </div>
  );
}
