import { redirect } from 'next/navigation';
import { getCurrentUserAndProfile } from '@/lib/queries';
import Sidebar from '@/components/dashboard/Sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCurrentUserAndProfile();
  if (!ctx) redirect('/login');

  const { profile, email } = ctx;
  const role = profile?.role ?? 'client';
  const roles = profile?.roles ?? [];

  return (
    <>
      <style>{`
        .navbar, .footer, header, footer { display: none !important; }
        html, body { background: #000 !important; }
      `}</style>
      <div className="flex min-h-screen bg-black text-white">
        <Sidebar role={role} roles={roles} />
        <main className="flex-1 px-8 py-10 md:px-12 md:pl-[232px]">
          {/* Header */}
          <div className="mb-10">
            <div className="text-[0.6rem] uppercase tracking-[0.2em] text-white/25 mb-2">Dashboard</div>
            <h1 className="text-2xl font-extralight tracking-tight">
              {profile?.full_name || email || 'Welcome'}
            </h1>
            {profile && (
              <p className="text-[0.7rem] uppercase tracking-widest text-white/30 mt-1">
                {role}{roles.length > 1 ? ` + ${roles.length - 1} more` : ''}
              </p>
            )}
          </div>
          {!profile && (
            <div className="border border-amber-400/20 bg-amber-400/5 text-amber-200/80 text-sm px-4 py-3 mb-8">
              Finishing up your account setup. If this persists, try signing out and back in.
            </div>
          )}
          {children}
        </main>
      </div>
    </>
  );
}
