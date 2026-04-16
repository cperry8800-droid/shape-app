// Overview page — shows stat cards and routes to the role-specific view.

import Link from 'next/link';
import { getCurrentUserAndProfile, getMySessions } from '@/lib/queries';

export const metadata = { title: 'Dashboard — Shape' };

export default async function DashboardOverview() {
  const ctx = await getCurrentUserAndProfile();
  const sessions = await getMySessions();

  const now = Date.now();
  const upcoming = sessions.filter(
    (s) => new Date(s.scheduled_at).getTime() >= now && s.status !== 'cancelled' && s.status !== 'declined'
  );
  const pending = sessions.filter((s) => s.status === 'requested');
  const completed = sessions.filter((s) => s.status === 'completed');

  const role = ctx?.profile?.role ?? 'client';
  const primaryHref =
    role === 'trainer'
      ? '/dashboard/trainer'
      : role === 'nutritionist'
        ? '/dashboard/nutritionist'
        : '/dashboard/client';

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat n={upcoming.length} label="Upcoming sessions" />
        <Stat n={pending.length} label="Pending requests" />
        <Stat n={completed.length} label="Completed" />
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <h2 className="text-lg font-medium mb-2">Quick actions</h2>
        <p className="text-sm text-neutral-400 mb-4">Jump back into where you left off.</p>
        <div className="flex gap-3 flex-wrap">
          <Link
            href={primaryHref}
            className="text-sm font-medium bg-teal-400 text-neutral-950 rounded-full px-5 py-2.5 hover:bg-teal-300 transition-colors"
          >
            Open {role} view
          </Link>
          {role === 'client' && (
            <Link
              href="/trainers"
              className="text-sm font-medium border border-neutral-700 text-neutral-100 rounded-full px-5 py-2.5 hover:bg-neutral-900 transition-colors"
            >
              Browse trainers
            </Link>
          )}
          <Link
            href="/dashboard/settings"
            className="text-sm font-medium border border-neutral-700 text-neutral-100 rounded-full px-5 py-2.5 hover:bg-neutral-900 transition-colors"
          >
            Settings
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <h2 className="text-lg font-medium mb-4">Recent activity</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No sessions yet. When you book or receive a request, it&rsquo;ll show up here.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sessions.slice(0, 6).map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between text-sm border border-neutral-800 rounded-lg px-4 py-3"
              >
                <span className="text-neutral-200 capitalize">
                  {s.type} · {new Date(s.scheduled_at).toLocaleString()}
                </span>
                <span className="text-xs uppercase tracking-wider text-neutral-500">{s.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
      <div className="text-4xl font-semibold tracking-tight">{n}</div>
      <div className="text-sm text-neutral-400 mt-1">{label}</div>
    </div>
  );
}
