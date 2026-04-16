// Provider claim flow. Lists unclaimed trainers, nutritionists, and gyms
// (owner_id IS NULL) and lets the signed-in user claim one. Calls the
// claim_provider_row() SQL function via a server action.

import { createClient } from '@/lib/supabase/server';
import { claimProviderRow } from './actions';

export const metadata = { title: 'Claim your profile — Shape' };

type UnclaimedRow = {
  id: number;
  name: string;
  specialty?: string | null;
  category?: string | null;
  location?: string | null;
};

async function getUnclaimed() {
  const supabase = await createClient();
  const [trainers, nutritionists, gyms] = await Promise.all([
    supabase
      .from('trainers')
      .select('id, name, specialty, category')
      .is('owner_id', null)
      .order('id', { ascending: true }),
    supabase
      .from('nutritionists')
      .select('id, name, specialty, category')
      .is('owner_id', null)
      .order('id', { ascending: true }),
    supabase
      .from('gyms')
      .select('id, name, category, location')
      .is('owner_id', null)
      .order('id', { ascending: true }),
  ]);
  return {
    trainers: (trainers.data ?? []) as UnclaimedRow[],
    nutritionists: (nutritionists.data ?? []) as UnclaimedRow[],
    gyms: (gyms.data ?? []) as UnclaimedRow[],
  };
}

export default async function ClaimPage() {
  const { trainers, nutritionists, gyms } = await getUnclaimed();

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="text-[0.6rem] uppercase tracking-[0.2em] text-white/25 mb-2">Claim your profile</h2>
        <p className="text-sm text-white/30 max-w-2xl">
          Link your Shape account to an existing trainer, nutritionist, or gym listing. Once
          claimed, you&rsquo;ll own that profile — you can edit the details, see subscribers, and
          collect subscription revenue. Only unclaimed rows are shown below. If you don&rsquo;t
          see yours, contact support.
        </p>
      </section>

      <ClaimSection
        heading="Trainers"
        role="trainer"
        rows={trainers}
        emptyLabel="Every trainer listing has already been claimed."
      />
      <ClaimSection
        heading="Nutritionists"
        role="nutritionist"
        rows={nutritionists}
        emptyLabel="Every nutritionist listing has already been claimed."
      />
      <ClaimSection
        heading="Gyms"
        role="gym"
        rows={gyms}
        emptyLabel="Every gym listing has already been claimed."
      />
    </div>
  );
}

function ClaimSection({
  heading,
  role,
  rows,
  emptyLabel,
}: {
  heading: string;
  role: 'trainer' | 'nutritionist' | 'gym';
  rows: UnclaimedRow[];
  emptyLabel: string;
}) {
  return (
    <section>
      <h3 className="text-[0.6rem] uppercase tracking-[0.2em] text-white/25 mb-3">
        {heading} <span className="text-white/15">({rows.length})</span>
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-white/30">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((row) => (
            <li
              key={row.id}
              className="border-b border-white/[0.07] py-4 flex items-center justify-between gap-4"
            >
              <div>
                <div className="text-sm text-white/80">{row.name}</div>
                <div className="text-xs text-white/30 mt-0.5">
                  {(row.specialty ?? row.category ?? row.location ?? 'Listing')} · ID #{row.id}
                </div>
              </div>
              <form action={claimProviderRow}>
                <input type="hidden" name="role" value={role} />
                <input type="hidden" name="provider_id" value={row.id} />
                <button
                  type="submit"
                  className="text-white underline underline-offset-4 hover:opacity-60 text-[0.7rem] uppercase tracking-widest"
                >
                  Claim this {role}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
