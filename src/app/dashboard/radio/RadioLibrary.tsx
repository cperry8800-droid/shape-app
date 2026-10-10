'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { readTags } from '@/lib/radio/audioTags.mjs';
import { profileTrack } from '@/lib/radio/trackProfile.mjs';
import { keyName, libraryTotals } from '@/lib/radio/library.mjs';
import { failureText, uploadSong } from '@/lib/radio/libraryUpload.mjs';

// The upload desk and the list for Nora's library (./page.tsx). One song at a time goes through
// src/lib/radio/libraryUpload.mjs, so a playlist of fifty does not decode fifty files at once.

export type Track = {
  id: string;
  file_name: string;
  title: string;
  artist: string;
  album: string | null;
  label: string | null;
  isrc: string | null;
  duration_sec: number;
  bpm: number | null;
  camelot: string | null;
  intensity: number | null;
  loudness_db: number | null;
  status: 'pending' | 'ready';
  enabled: boolean;
  created_at: string;
};

type JobStage = 'queued' | 'reading' | 'analysing' | 'needs-info' | 'uploading' | 'saving' | 'done' | 'failed';
type Job = { key: string; name: string; stage: JobStage; progress: number; error?: string; ask?: { title: string; artist: string } };

const STAGE_TEXT: Record<JobStage, string> = {
  queued: 'Waiting',
  reading: 'Reading',
  analysing: 'Measuring tempo, key and energy',
  'needs-info': 'Needs a title and artist',
  uploading: 'Uploading',
  saving: 'Saving',
  done: 'Added',
  failed: 'Not added',
};

const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

const mmss = (sec: number) => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function decode(buf: ArrayBuffer) {
  const ctx = new OfflineAudioContext(2, 1, 44100);
  const audio = await ctx.decodeAudioData(buf);
  const channels: Float32Array[] = [];
  for (let c = 0; c < Math.min(2, audio.numberOfChannels); c++) channels.push(audio.getChannelData(c));
  return { channels, sampleRate: audio.sampleRate, duration: audio.duration };
}

/** PUT the raw file to the signed upload URL, reporting progress (fetch cannot). */
function putWithProgress(url: string, file: File, headers: Record<string, string>, onProgress: (f: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    if (ANON_KEY) xhr.setRequestHeader('apikey', ANON_KEY);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.onabort = () => resolve(false);
    xhr.send(file);
  });
}

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  try {
    const res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json: any = null;
    try { json = await res.json(); } catch { json = null; }
    return { status: res.status, body: json };
  } catch {
    return { status: 0, body: { error: 'network' } };
  }
}

export default function RadioLibrary({ initialTracks }: { initialTracks: Track[] }) {
  const [tracks, setTracks] = useState<Track[]>(initialTracks);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const queue = useRef<{ key: string; file: File }[]>([]);
  const running = useRef(false);
  const answers = useRef(new Map<string, (v: { title: string; artist: string } | null) => void>());
  const totals = useMemo(() => libraryTotals(tracks), [tracks]);

  const patchJob = useCallback((key: string, patch: Partial<Job>) => {
    setJobs((list) => list.map((j) => (j.key === key ? { ...j, ...patch } : j)));
  }, []);

  const upsertTrack = useCallback((t: Track) => {
    setTracks((list) => [t, ...list.filter((x) => x.id !== t.id)]);
  }, []);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    while (queue.current.length) {
      const { key, file } = queue.current.shift()!;
      const result = await uploadSong(file, {
        sha256: sha256Hex,
        decode,
        profile: profileTrack,
        readTags,
        yieldToPaint: () => new Promise((r) => setTimeout(r, 30)),
        askInfo: (missing: { title: string | null; artist: string | null }) => new Promise((resolve) => {
          answers.current.set(key, resolve);
          patchJob(key, { stage: 'needs-info', ask: { title: missing.title ?? '', artist: missing.artist ?? '' } });
        }),
        create: (body: object) => api('POST', '/api/admin/radio/tracks', body),
        put: putWithProgress,
        confirm: (id: string, body: object) => api('PATCH', `/api/admin/radio/tracks/${id}`, body),
        onStage: (stage: string, info?: { progress?: number }) => patchJob(key, { stage: stage as JobStage, progress: info?.progress ?? 0 }),
      });
      if (result.ok) {
        upsertTrack(result.track as Track);
        patchJob(key, { stage: 'done', progress: 1 });
      } else {
        patchJob(key, { stage: 'failed', error: failureText(result.error) });
        // A pending row was created before the upload died: show it so it can be retried or removed.
        if (result.id && result.error !== 'duplicate') {
          const list = await api('GET', '/api/admin/radio/tracks');
          if (list.status === 200 && Array.isArray(list.body?.tracks)) setTracks(list.body.tracks);
        }
      }
    }
    running.current = false;
  }, [patchJob, upsertTrack]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    const stamp = Date.now();
    const added = list.map((file, i) => ({ key: `${stamp}-${i}-${file.name}`, file }));
    queue.current.push(...added);
    setJobs((j) => [...added.map(({ key, file }) => ({ key, name: file.name, stage: 'queued' as JobStage, progress: 0 })), ...j].slice(0, 200));
    void run();
  }, [run]);

  const answer = (key: string, value: { title: string; artist: string } | null) => {
    const resolve = answers.current.get(key);
    answers.current.delete(key);
    patchJob(key, { ask: undefined });
    if (resolve) resolve(value);
  };

  const save = async (id: string, patch: Partial<Track>) => {
    const r = await api('PATCH', `/api/admin/radio/tracks/${id}`, patch);
    if (r.status === 200 && r.body?.track) {
      setTracks((list) => list.map((t) => (t.id === id ? (r.body.track as Track) : t)));
      setRowError((e) => ({ ...e, [id]: '' }));
      return true;
    }
    setRowError((e) => ({ ...e, [id]: r.body?.error === 'isrc' ? 'That is not an ISRC (e.g. USRC17607839).' : `Could not save (${r.body?.error ?? r.status}).` }));
    return false;
  };

  const remove = async (t: Track) => {
    if (!window.confirm(`Remove “${t.title}” by ${t.artist} from Nora’s library? The file is deleted.`)) return;
    const r = await api('DELETE', `/api/admin/radio/tracks/${t.id}`);
    if (r.status === 200) setTracks((list) => list.filter((x) => x.id !== t.id));
    else setRowError((e) => ({ ...e, [t.id]: `Could not remove (${r.body?.error ?? r.status}).` }));
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Ready for Nora" value={String(totals.playable)} />
        <Stat label="Hours of music" value={totals.playableHours.toFixed(1)} />
        <Stat label="Artists" value={String(totals.distinctArtists)} />
        <Stat label="Unfinished uploads" value={String(totals.pending)} />
      </section>
      <p className="text-xs text-neutral-500 -mt-5 max-w-2xl">
        Nora never repeats a song within a set and keeps any one artist to four songs in three hours, so an hour-long set
        needs about 15 songs from at least four artists. More songs give her more to choose from.
      </p>

      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        className={`rounded-xl border border-dashed p-8 text-center cursor-pointer transition-colors ${dragging ? 'border-teal-400 bg-teal-400/10' : 'border-neutral-700 hover:border-neutral-500'}`}
      >
        <input
          type="file"
          multiple
          accept="audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg"
          className="sr-only"
          onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
        />
        <div className="text-base text-neutral-200">Drop songs here, or choose files</div>
        <div className="text-xs text-neutral-500 mt-1">MP3, M4A, AAC, WAV, FLAC or OGG · up to 60 MB each · a whole playlist at once is fine</div>
      </label>

      {jobs.length > 0 && (
        <section className="flex flex-col gap-2" aria-live="polite">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase tracking-[0.14em] text-neutral-500">This session’s uploads</h3>
            <button type="button" onClick={() => setJobs((j) => j.filter((x) => x.stage !== 'done' && x.stage !== 'failed'))} className="text-xs text-neutral-400 hover:text-neutral-200">
              Clear finished
            </button>
          </div>
          {jobs.map((j) => (
            <div key={j.key} className="rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-neutral-200 truncate">{j.name}</div>
                <div className={`text-xs shrink-0 ${j.stage === 'failed' ? 'text-red-300' : j.stage === 'done' ? 'text-teal-300' : 'text-neutral-400'}`}>
                  {STAGE_TEXT[j.stage]}{j.stage === 'uploading' ? ` · ${Math.round(j.progress * 100)}%` : ''}
                </div>
              </div>
              {j.stage === 'failed' && j.error && <div className="text-xs text-red-300 mt-1">{j.error}</div>}
              {j.stage === 'uploading' && (
                <div className="h-1 mt-2 rounded bg-neutral-800 overflow-hidden"><div className="h-1 bg-teal-400" style={{ width: `${Math.round(j.progress * 100)}%` }} /></div>
              )}
              {j.stage === 'needs-info' && j.ask && <AskInfo initial={j.ask} onDone={(v) => answer(j.key, v)} />}
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="text-xs uppercase tracking-[0.14em] text-neutral-500">The library ({tracks.length})</h3>
        <p className="text-xs text-neutral-500 -mt-1 max-w-2xl">
          A BPM of “—” means no steady kick on every beat was found (most hip-hop and half-time songs): Nora fades that
          song in and out instead of beat-matching it. Keys are Camelot codes; neighbouring codes mix in key.
        </p>
        {tracks.length === 0 ? (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-8 text-sm text-neutral-400">No songs yet.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-[0.12em] text-neutral-500 bg-neutral-900/60">
                <tr>
                  <th className="text-left font-normal px-3 py-2">Song</th>
                  <th className="text-right font-normal px-3 py-2">Length</th>
                  <th className="text-right font-normal px-3 py-2">BPM</th>
                  <th className="text-left font-normal px-3 py-2">Key</th>
                  <th className="text-left font-normal px-3 py-2">Energy</th>
                  <th className="text-left font-normal px-3 py-2">In rotation</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {tracks.map((t) =>
                  editing === t.id ? (
                    <EditRow key={t.id} track={t} error={rowError[t.id]} onCancel={() => setEditing(null)} onSave={async (p) => { if (await save(t.id, p)) setEditing(null); }} />
                  ) : (
                    <tr key={t.id} className="border-t border-neutral-800 align-top">
                      <td className="px-3 py-2">
                        <div className="text-neutral-100">{t.title}</div>
                        <div className="text-neutral-400">{t.artist}{t.album ? <span className="text-neutral-500"> · {t.album}</span> : null}</div>
                        {t.status === 'pending' && <div className="text-xs text-amber-300 mt-1">Upload unfinished: drop the file again, or remove it.</div>}
                        {!t.isrc && t.status === 'ready' && <div className="text-xs text-neutral-500 mt-1">No ISRC yet</div>}
                        {rowError[t.id] && <div className="text-xs text-red-300 mt-1">{rowError[t.id]}</div>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-neutral-300">{mmss(t.duration_sec)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-neutral-300">{t.bpm != null ? Math.round(Number(t.bpm) * 10) / 10 : '—'}</td>
                      <td className="px-3 py-2 text-neutral-300">{t.camelot ? <span title={keyName(t.camelot) ?? ''}>{t.camelot} <span className="text-neutral-500">{keyName(t.camelot)}</span></span> : '—'}</td>
                      <td className="px-3 py-2">
                        {t.intensity != null ? (
                          <div className="w-20 h-1.5 rounded bg-neutral-800 overflow-hidden mt-2" title={`${Math.round(Number(t.intensity) * 100)} / 100`}>
                            <div className="h-1.5 bg-teal-400" style={{ width: `${Math.round(Number(t.intensity) * 100)}%` }} />
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={`${t.title} in rotation`}
                          checked={t.enabled}
                          disabled={t.status !== 'ready'}
                          onChange={(e) => void save(t.id, { enabled: e.target.checked })}
                          className="accent-teal-400"
                        />
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button type="button" onClick={() => setEditing(t.id)} className="text-xs text-neutral-300 hover:text-white mr-3">Edit</button>
                        <button type="button" onClick={() => void remove(t)} className="text-xs text-red-300 hover:text-red-200">Remove</button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">{label}</div>
      <div className="text-2xl font-light tabular-nums mt-1">{value}</div>
    </div>
  );
}

const inputClass = 'rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-sm outline-none focus:border-teal-400 w-full';

function AskInfo({ initial, onDone }: { initial: { title: string; artist: string }; onDone: (v: { title: string; artist: string } | null) => void }) {
  const [title, setTitle] = useState(initial.title);
  const [artist, setArtist] = useState(initial.artist);
  return (
    <form
      className="mt-3 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-2"
      onSubmit={(e) => { e.preventDefault(); if (title.trim() && artist.trim()) onDone({ title: title.trim(), artist: artist.trim() }); }}
    >
      <input className={inputClass} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
      <input className={inputClass} placeholder="Artist" value={artist} onChange={(e) => setArtist(e.target.value)} maxLength={200} required />
      <button type="submit" className="rounded-full border border-teal-400 bg-teal-400 text-neutral-950 px-4 py-1.5 text-sm">Add</button>
      <button type="button" onClick={() => onDone(null)} className="rounded-full border border-neutral-700 text-neutral-300 px-4 py-1.5 text-sm">Skip</button>
    </form>
  );
}

function EditRow({ track, error, onSave, onCancel }: { track: Track; error?: string; onSave: (p: Partial<Track>) => void; onCancel: () => void }) {
  const [f, setF] = useState({ title: track.title, artist: track.artist, album: track.album ?? '', label: track.label ?? '', isrc: track.isrc ?? '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <tr className="border-t border-neutral-800 bg-neutral-900/40">
      <td colSpan={7} className="px-3 py-3">
        <form
          className="grid grid-cols-1 md:grid-cols-5 gap-2"
          onSubmit={(e) => { e.preventDefault(); onSave({ title: f.title, artist: f.artist, album: f.album || null, label: f.label || null, isrc: f.isrc || null }); }}
        >
          <input className={inputClass} aria-label="Title" placeholder="Title" value={f.title} onChange={set('title')} maxLength={200} required />
          <input className={inputClass} aria-label="Artist" placeholder="Artist" value={f.artist} onChange={set('artist')} maxLength={200} required />
          <input className={inputClass} aria-label="Album" placeholder="Album" value={f.album} onChange={set('album')} maxLength={200} />
          <input className={inputClass} aria-label="Label" placeholder="Label" value={f.label} onChange={set('label')} maxLength={200} />
          <input className={inputClass} aria-label="ISRC" placeholder="ISRC" value={f.isrc} onChange={set('isrc')} maxLength={20} />
          <div className="md:col-span-5 flex gap-2 items-center">
            <button type="submit" className="rounded-full border border-teal-400 bg-teal-400 text-neutral-950 px-4 py-1.5 text-sm">Save</button>
            <button type="button" onClick={onCancel} className="rounded-full border border-neutral-700 text-neutral-300 px-4 py-1.5 text-sm">Cancel</button>
            {error && <span className="text-xs text-red-300">{error}</span>}
          </div>
        </form>
      </td>
    </tr>
  );
}
