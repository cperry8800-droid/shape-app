import { getCurrentUserAndProfile } from '@/lib/queries';
import SettingsForm from './SettingsForm';

export const metadata = { title: 'Settings — Shape' };

export default async function SettingsPage() {
  const ctx = await getCurrentUserAndProfile();
  const profile = ctx?.profile;

  return (
    <div className="flex flex-col gap-8 max-w-xl">
      <section>
        <h2 className="text-[0.6rem] uppercase tracking-[0.2em] text-white/25 mb-1">Profile</h2>
        <p className="text-sm text-white/30 mb-6">Your public display name and primary role.</p>
        <SettingsForm
          initialFullName={profile?.full_name ?? ''}
          initialRole={profile?.role ?? 'client'}
          roles={profile?.roles ?? []}
        />
      </section>

      <div className="border-t border-white/[0.07]" />

      <section>
        <h2 className="text-[0.6rem] uppercase tracking-[0.2em] text-white/25 mb-1">Account</h2>
        <p className="text-sm text-white/30">
          Email: <span className="text-white/60">{ctx?.email}</span>
        </p>
      </section>
    </div>
  );
}
