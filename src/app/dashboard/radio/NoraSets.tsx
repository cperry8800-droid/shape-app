import { createAdminClient } from '@/lib/supabase/admin';
import { describeSlot, WEEKDAYS } from '@/lib/radio/noraSlots.mjs';
import { draftProgramme } from '@/lib/radio/noraSetStore.mjs';
import { addSlot, confirmLicences, deleteSlot, setSlotEnabled, syncNow, withdrawLicences } from './actions';

// When Nora is the DJ (./page.tsx, under the library): the licence switch, the owner's slots,
// the sets they put on the schedule this week, and what Nora will play in the next one.
// Server-rendered; every change is a server action (./actions.ts).

type Slot = { id: string; days: number[]; start_minute: number; duration_min: number; zone: string; enabled: boolean };
type SetRow = { id: string; title: string; dj: string; starts_at: string; duration_min: number; host_kind: string; slot_id: string | null; published: boolean };
type Item = { startSec: number; title: string; artist: string; rate: number; mixIn: { type: string } };
type Programme = { items: Item[]; endsSec: number; short: string | null };

const ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'Europe/London', 'UTC'];
const MIX: Record<string, string> = { open: 'opens the set', beatmatch: 'beat-matched', blend: 'blended', fade: 'quick fade' };
const MESSAGES: Record<string, string> = {
  slot_added: 'Slot added, and its sets for the next week are on the schedule.',
  slot_on: 'Slot turned on.',
  slot_off: 'Slot turned off: its sets that were not planned yet are off the schedule.',
  slot_deleted: 'Slot deleted.',
  licences_confirmed: 'Licences confirmed: Nora’s sets now show in Coming up.',
  licences_withdrawn: 'Licences withdrawn: Nora’s sets are private again.',
  synced: 'Schedule updated.',
};

const clock = (iso: string, zone: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

export default async function NoraSets({ updated, error }: { updated?: string; error?: string }) {
  const db = createAdminClient();
  const now = Date.now();
  const [slots, settings, sets] = await Promise.all([
    db.from('nora_slots').select('id,days,start_minute,duration_min,zone,enabled').order('created_at'),
    db.from('nora_dj_settings').select('licences_confirmed_at,licences_confirmed_by').eq('id', 1).maybeSingle(),
    db.from('nora_sets').select('id,title,dj,starts_at,duration_min,host_kind,slot_id,published')
      .gte('starts_at', new Date(now - 6 * 3600000).toISOString()).lt('starts_at', new Date(now + 8 * 86400000).toISOString()).order('starts_at'),
  ]);
  const missing = [slots.error, settings.error, sets.error].some((e) => e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === '42703'));
  if (missing) {
    return (
      <section id="sets" className="rounded-lg border border-amber-400/30 bg-amber-400/10 text-amber-200 text-sm px-4 py-3">
        Nora’s sets are not set up yet: run supabase-migrations/2026-10-11-nora-dj-sets.sql.
      </section>
    );
  }
  if (slots.error || settings.error || sets.error) throw new Error('Could not read Nora’s sets.');

  const slotList = (slots.data ?? []) as Slot[];
  const zoneOf = new Map(slotList.map((s) => [s.id, s.zone]));
  const licensedAt = settings.data?.licences_confirmed_at ?? null;
  const upcoming = ((sets.data ?? []) as SetRow[]).filter((s) => Date.parse(s.starts_at) + s.duration_min * 60000 > now);
  const noraSets = upcoming.filter((s) => s.host_kind === 'nora');
  const ids = noraSets.map((s) => s.id);
  const progs = ids.length ? await db.from('nora_set_programmes').select('set_id,programme').in('set_id', ids) : { data: [], error: null };
  if (progs.error) throw new Error('Could not read Nora’s plans.');
  const planOf = new Map(((progs.data ?? []) as { set_id: string; programme: Programme }[]).map((p) => [p.set_id, p.programme]));

  // What her engine last reported (services/nora-engine), and the months that have plays.
  const engineLog = await db.from('nora_engine_log').select('event,played_at,title,artist,detail').order('logged_at', { ascending: false }).limit(6);
  const logRows = (engineLog.error ? [] : engineLog.data ?? []) as { event: string; played_at: string; title: string | null; artist: string | null; detail: string | null }[];
  const thisMonth = new Date(now).toISOString().slice(0, 7);
  const lastMonth = new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() - 1, 1)).toISOString().slice(0, 7);

  // What the next set will play: its stored plan, or a preview drawn now (not stored).
  const next = noraSets[0] ?? null;
  let nextPlan: Programme | null = next ? planOf.get(next.id) ?? null : null;
  let preview = false;
  if (next && !nextPlan) {
    const d = await draftProgramme(db, next);
    if (!d.error && d.programme) { nextPlan = d.programme as Programme; preview = true; }
  }

  return (
    <section id="sets" className="flex flex-col gap-6 border-t border-neutral-800 pt-8">
      <div className="flex flex-col gap-2">
        <div className="text-xs uppercase tracking-[0.16em] text-teal-400">Nora’s sets</div>
        <h2 className="text-2xl font-light tracking-tight">When Nora is the DJ</h2>
        <p className="text-sm text-neutral-400 max-w-2xl">
          At the times you set, Nora picks songs from the library, mixes them (in key and on the beat where the songs
          allow) and plays the set live on Shape Radio. Listeners see “Nora · DJ set” in Coming up, never the songs, which
          the licence forbids naming ahead of air. She plans each set about an hour before it starts.
        </p>
      </div>

      {updated && <div className="rounded-lg border border-teal-400/30 bg-teal-400/10 text-teal-200 text-sm px-4 py-3">{MESSAGES[updated] ?? 'Saved, but the schedule could not be updated just now. It updates on the hour.'}</div>}
      {error && <div className="rounded-lg border border-red-400/30 bg-red-400/10 text-red-200 text-sm px-4 py-3">Could not save: {error.replace(/_/g, ' ')}.</div>}

      {licensedAt ? (
        <div className="rounded-xl border border-teal-400/30 bg-teal-400/5 p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="text-sm text-neutral-200">
            Licences confirmed {new Date(licensedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            {settings.data?.licences_confirmed_by ? ` by ${settings.data.licences_confirmed_by}` : ''}. Nora’s sets are public.
          </div>
          <form action={withdrawLicences}>
            <button type="submit" className="rounded-full border border-neutral-700 text-neutral-300 px-4 py-1.5 text-sm hover:border-neutral-500">Make her sets private again</button>
          </form>
        </div>
      ) : (
        <form action={confirmLicences} className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 flex flex-col gap-3">
          <div className="text-sm text-amber-200">Nora’s sets stay private (planned, never on the air or in Coming up) until you confirm the licences.</div>
          <label className="flex gap-3 items-start text-sm text-neutral-300">
            <input type="checkbox" name="confirm" value="yes" required className="mt-1 accent-teal-400" />
            <span>
              Shape Radio holds US webcasting licences for these songs: SoundExchange for the recordings, and ASCAP, BMI,
              SESAC and GMR for the songwriters. Shape files the monthly SoundExchange play reports, and listeners outside the
              US are licensed or blocked.
            </span>
          </label>
          <div><button type="submit" className="rounded-full border border-teal-400 bg-teal-400 text-neutral-950 px-4 py-1.5 text-sm">Confirm the licences</button></div>
        </form>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="text-xs uppercase tracking-[0.14em] text-neutral-500">Her slots</h3>
        {slotList.length === 0 && <div className="text-sm text-neutral-400">No slots yet. Add one below.</div>}
        {slotList.map((s) => (
          <div key={s.id} className="rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className={`text-sm ${s.enabled ? 'text-neutral-100' : 'text-neutral-500 line-through'}`}>{describeSlot(s)}</div>
            <div className="flex gap-2">
              <form action={setSlotEnabled}>
                <input type="hidden" name="slot_id" value={s.id} />
                <input type="hidden" name="enabled" value={s.enabled ? 'false' : 'true'} />
                <button type="submit" className="rounded-full border border-neutral-700 text-neutral-300 px-3 py-1 text-xs hover:border-neutral-500">{s.enabled ? 'Turn off' : 'Turn on'}</button>
              </form>
              <form action={deleteSlot}>
                <input type="hidden" name="slot_id" value={s.id} />
                <button type="submit" className="rounded-full border border-red-400/40 text-red-300 px-3 py-1 text-xs hover:border-red-300">Delete</button>
              </form>
            </div>
          </div>
        ))}

        <form action={addSlot} className="rounded-xl border border-neutral-800 p-4 flex flex-col gap-3">
          <div className="text-sm text-neutral-300">Add a slot</div>
          <div className="flex gap-2 flex-wrap">
            {WEEKDAYS.map((d, i) => (
              <label key={d} className="flex items-center gap-1.5 rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300">
                <input type="checkbox" name="day" value={i} className="accent-teal-400" /> {d}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <label className="flex flex-col gap-1 text-xs text-neutral-500">Starts
              <input type="time" name="start_time" required defaultValue="18:00" className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-500">Length
              <select name="duration_min" defaultValue="60" className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100">
                {[30, 45, 60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} hour${m === 60 ? '' : 's'}`}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-500">Time zone
              <input name="zone" list="nora-zones" required defaultValue="America/New_York" className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100" />
              <datalist id="nora-zones">{ZONES.map((z) => <option key={z} value={z} />)}</datalist>
            </label>
          </div>
          <div><button type="submit" className="rounded-full border border-teal-400 bg-teal-400 text-neutral-950 px-4 py-1.5 text-sm">Add slot</button></div>
        </form>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-[0.14em] text-neutral-500">This week</h3>
          <form action={syncNow}><button type="submit" className="text-xs text-neutral-400 hover:text-neutral-200">Update now</button></form>
        </div>
        {noraSets.length === 0 ? (
          <div className="text-sm text-neutral-400">No Nora sets on the schedule this week.</div>
        ) : (
          noraSets.map((s) => (
            <div key={s.id} className="rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-3 flex items-center justify-between gap-3 flex-wrap text-sm">
              <div className="text-neutral-100">{clock(s.starts_at, (s.slot_id && zoneOf.get(s.slot_id)) || 'UTC')} · {s.duration_min} min</div>
              <div className="text-xs text-neutral-400">
                {planOf.has(s.id) ? 'Planned' : 'Plans about an hour before'} · {s.published ? 'public' : 'private'}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs uppercase tracking-[0.14em] text-neutral-500">Her engine</h3>
        {engineLog.error ? (
          <div className="text-sm text-neutral-400">The engine’s log is not set up yet: run supabase-migrations/2026-10-11-nora-engine-log.sql.</div>
        ) : logRows.length === 0 ? (
          <div className="text-sm text-neutral-400">Nothing yet. Her engine reports here once it plays a set (services/nora-engine/README.md sets it up).</div>
        ) : (
          <ul className="text-sm flex flex-col gap-1">
            {logRows.map((r, i) => (
              <li key={i} className={r.event === 'failed' ? 'text-red-300' : 'text-neutral-300'}>
                <span className="text-neutral-500 tabular-nums">{new Date(r.played_at).toLocaleString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} UTC</span>
                {' · '}
                {r.event === 'song' ? `played ${r.title} · ${r.artist}` : r.event === 'failed' ? `stopped a set: ${r.detail ?? 'no reason given'} (the station’s AutoDJ took over)` : r.event === 'started' ? 'went on the air' : 'finished a set'}
              </li>
            ))}
          </ul>
        )}
        <div className="text-xs text-neutral-500">
          Play reports for SoundExchange:{' '}
          <a className="text-teal-300 hover:text-teal-200" href={`/api/admin/radio/plays?month=${thisMonth}`}>{thisMonth}</a>
          {' · '}
          <a className="text-teal-300 hover:text-teal-200" href={`/api/admin/radio/plays?month=${lastMonth}`}>{lastMonth}</a>
          {' '}(every song Nora played; the listener counts come from radio.co’s statistics)
        </div>
      </div>

      {next && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs uppercase tracking-[0.14em] text-neutral-500">
            {preview ? 'A preview of the next set (Nora plans the real one about an hour before; it can differ)' : 'What Nora will play next'}
          </h3>
          {!nextPlan || nextPlan.items.length === 0 ? (
            <div className="text-sm text-neutral-400">No songs to plan with yet: upload some to the library above.</div>
          ) : (
            <div className="rounded-xl border border-neutral-800 overflow-hidden">
              {nextPlan.short && (
                <div className="px-4 py-2 text-xs text-amber-200 bg-amber-400/10">
                  The set ends early ({mmss(nextPlan.endsSec)}): the library has too few songs or artists to fill it within the licence’s limits.
                </div>
              )}
              <ol className="text-sm">
                {nextPlan.items.map((it, i) => (
                  <li key={i} className="border-t border-neutral-800 first:border-t-0 px-4 py-2 flex gap-3">
                    <span className="tabular-nums text-neutral-500 w-12 shrink-0">{mmss(it.startSec)}</span>
                    <span className="text-neutral-100 flex-1">{it.title} <span className="text-neutral-400">· {it.artist}</span></span>
                    <span className="text-xs text-neutral-500 shrink-0">
                      {MIX[it.mixIn.type] ?? it.mixIn.type}{Math.abs(it.rate - 1) > 0.0005 ? ` · ${it.rate > 1 ? '+' : ''}${((it.rate - 1) * 100).toFixed(1)}%` : ''}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
