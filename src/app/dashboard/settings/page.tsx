import { getCurrentUserAndProfile } from '@/lib/queries';
import SettingsForm from './SettingsForm';

export const metadata = { title: 'Settings — Shape' };

export default async function SettingsPage() {
  const ctx = await getCurrentUserAndProfile();
  const profile = ctx?.profile;

  return (
    <div className="flex flex-col gap-8 max-w-xl">
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <h2 className="text-lg font-medium mb-1">Profile</h2>
        <p className="text-sm text-neutral-400 mb-6">Your public display name and primary role.</p>
        <SettingsForm
          initialFullName={profile?.full_name ?? ''}
          initialRole={profile?.role ?? 'client'}
          roles={profile?.roles ?? []}
        />
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <h2 className="text-lg font-medium mb-1">Account</h2>
        <p className="text-sm text-neutral-400">
          Email: <span className="text-neutral-200">{ctx?.email}</span>
        </p>
      </section>
    </div>
  );
}
