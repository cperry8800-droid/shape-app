import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminUser } from '@/lib/admin-access';
import { listTracks } from '@/lib/radio/libraryStore.mjs';
import RadioLibrary, { type Track } from './RadioLibrary';
import NoraSets from './NoraSets';

// Nora's library: the songs her DJ sets on Shape Radio are built from. The owner uploads them
// here; each is measured in the browser as it uploads (src/lib/radio/trackProfile.mjs) and stored
// in the private `radio-library` bucket. Listeners never get these files: they hear the station.

export const metadata = { title: 'Nora’s library - Shape' };
export const dynamic = 'force-dynamic';

export default async function RadioLibraryPage({
  searchParams,
}: {
  searchParams?: Promise<{ updated?: string; error?: string }>;
}) {
  try {
    await requireAdminUser();
  } catch {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const r = await listTracks(createAdminClient());
  const notSetUp = r.status === 503;
  if (r.status !== 200 && !notSetUp) throw new Error('Could not read Nora’s library.');
  const tracks = (r.status === 200 ? (r.body as { tracks: Track[] }).tracks : []) ?? [];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="text-xs uppercase tracking-[0.16em] text-teal-400">Admin · Shape Radio</div>
        <h2 className="text-2xl font-light tracking-tight">Nora’s library</h2>
        <p className="text-sm text-neutral-400 max-w-2xl">
          The songs Nora builds her DJ sets from. Drop in your playlist: each song is measured in your browser as it
          uploads (its tempo and beat, key, energy, and where it starts, fades and can be mixed), then stored privately.
          Listeners never receive these files; they hear the Shape Radio stream.
        </p>
        <p className="text-xs text-neutral-500 max-w-2xl">
          Every song here is played to the public under Shape Radio’s own licences (SoundExchange for the recordings, and
          ASCAP, BMI, SESAC and GMR for the songwriters). Upload songs you bought, not recordings of a streaming service.
          Title, artist, album, label and ISRC are what the monthly SoundExchange report names, so keep them accurate.
        </p>
      </section>

      {notSetUp ? (
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 text-amber-200 text-sm px-4 py-3">
          Not set up yet: run supabase-migrations/2026-10-11-radio-library.sql.
        </div>
      ) : (
        <RadioLibrary initialTracks={tracks} />
      )}

      <NoraSets updated={params?.updated} error={params?.error} />
    </div>
  );
}
