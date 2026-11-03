import { createAdminClient } from '@/lib/supabase/admin';
import { rotationOnAir } from '@/lib/radio/noraOnAir.mjs';
import { OWN_PROVIDER, engineQuiet, stationIdOf } from '@/lib/radio/station.mjs';
import { connectOwnStation, connectStation, disconnectStation } from './actions';

// The station card on Nora's page (./NoraSets.tsx): where Shape Radio streams from, Shape's own
// station (services/station) or radio.co, and, on Shape's own, what its rotation is playing and
// what the engine last said. Server-rendered; the forms are server actions (./actions.ts).

type Station = { provider: string | null; stream_url: string | null; now_playing_url: string | null } | null;
type LogRow = { event: string; played_at: string; title: string | null; artist: string | null; detail: string | null; logged_at: string };

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' UTC';
const ago = (iso: string, now: number) => {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : min < 48 * 60 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} days ago`;
};
const input = 'rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100';

export default async function StationPanel({ station }: { station: Station }) {
  const db = createAdminClient();
  const now = Date.now();
  const own = station?.provider === OWN_PROVIDER && !!station?.stream_url;
  const radioCo = station?.provider === 'http' && !!station?.stream_url;

  // The rotation's reports (block rows) and the engine's latest word on anything. Before
  // 2026-11-03-radio-rotation.sql there is no block column: the panel says nothing of a rotation.
  const [rotationLog, lastReport] = await Promise.all([
    db.from('nora_engine_log').select('event,played_at,title,artist,detail,logged_at').not('block_id', 'is', null)
      .order('logged_at', { ascending: false }).limit(6),
    db.from('nora_engine_log').select('logged_at').order('logged_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const rows = (rotationLog.error ? [] : rotationLog.data ?? []) as LogRow[];
  let onAir: { title: string | null; artist: string | null } | null = null;
  try { onAir = own ? await rotationOnAir(db, { now }) : null; } catch { onAir = null; }
  const lastAt = !lastReport.error && lastReport.data ? (lastReport.data as { logged_at: string }).logged_at : null;
  // The engine reports at every song; one quiet for longer than the longest song is not playing.
  const quiet = own && engineQuiet(lastAt, now);

  return (
    <div className="rounded-xl border border-neutral-800 p-4 flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="text-sm text-neutral-300">The station</div>
        {own ? (
          <div className="flex items-center justify-between gap-3 flex-wrap text-sm">
            <span className="text-neutral-200 break-all">Shape’s own station · streaming {station!.stream_url}</span>
            <form action={disconnectStation}><button type="submit" className="rounded-full border border-neutral-700 text-neutral-300 px-3 py-1 text-xs hover:border-neutral-500">Disconnect</button></form>
          </div>
        ) : radioCo ? (
          <div className="flex items-center justify-between gap-3 flex-wrap text-sm">
            <span className="text-neutral-200 break-all">radio.co · streaming {station!.stream_url}{stationIdOf(station!.now_playing_url) ? ` · station ${stationIdOf(station!.now_playing_url)}` : ''}</span>
            <form action={disconnectStation}><button type="submit" className="rounded-full border border-neutral-700 text-neutral-300 px-3 py-1 text-xs hover:border-neutral-500">Disconnect</button></form>
          </div>
        ) : (
          <div className="text-sm text-amber-200">Not connected: the website and app have no station to play.</div>
        )}
      </div>

      {own && (
        <div className="flex flex-col gap-2 border-t border-neutral-800 pt-3">
          <div className="text-sm text-neutral-300">The rotation, between Nora’s sets</div>
          <div className="text-sm text-neutral-200">
            {onAir ? <>On the air now: {onAir.title} · {onAir.artist}</> : 'Nothing from the rotation on the air right now (one of Nora’s sets, the standby loop, or nothing).'}
          </div>
          <div className={`text-xs ${quiet ? 'text-amber-200' : 'text-neutral-500'}`}>
            {lastAt ? `The station’s engine last reported ${ago(lastAt, now)}.` : 'The station’s engine has not reported yet.'}
            {quiet ? ' Listeners hear the standby loop until it plays again: check the server (docker compose logs engine), the licences below, and that the library has songs.' : ''}
          </div>
          {rows.length > 0 && (
            <ul className="text-sm flex flex-col gap-1">
              {rows.map((r, i) => (
                <li key={i} className={r.event === 'failed' ? 'text-red-300' : 'text-neutral-300'}>
                  <span className="text-neutral-500 tabular-nums">{when(r.played_at)}</span>
                  {' · '}
                  {r.event === 'song' ? `played ${r.title} · ${r.artist}` : r.event === 'failed' ? `stopped a block: ${r.detail ?? 'no reason given'} (the standby loop played)` : r.event === 'started' ? 'started a block' : 'finished a block'}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <form action={connectOwnStation} className="grid grid-cols-1 md:grid-cols-[3fr_auto] gap-2 items-end border-t border-neutral-800 pt-3">
        <label className="flex flex-col gap-1 text-xs text-neutral-500">Shape’s own station: its stream (services/station/README.md)
          <input name="stream_url" required placeholder="https://radio.theshapecommunity.com/live" defaultValue={own ? station!.stream_url ?? '' : ''} className={input} />
        </label>
        <button type="submit" className="rounded-full border border-teal-400 bg-teal-400 text-neutral-950 px-4 py-1.5 text-sm">Use Shape’s own</button>
      </form>
      <div className="text-xs text-neutral-500">
        Saved only once the stream answers with audio. Its engine plays Nora’s sets at her times and the rotation between them.
      </div>

      <form action={connectStation} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_auto] gap-2 items-end">
        <label className="flex flex-col gap-1 text-xs text-neutral-500">Or radio.co: its Stream URL (radio.co → your station → Share / Stream URL)
          <input name="stream_url" required placeholder="https://s5.radio.co/s0a1b2c3d4/listen" defaultValue={radioCo ? station!.stream_url ?? '' : ''} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">Station ID
          <input name="station_id" required placeholder="s0a1b2c3d4" defaultValue={stationIdOf(station?.now_playing_url) ?? ''} className={input} />
        </label>
        <button type="submit" className="rounded-full border border-neutral-600 text-neutral-200 px-4 py-1.5 text-sm">Use radio.co</button>
      </form>
    </div>
  );
}
