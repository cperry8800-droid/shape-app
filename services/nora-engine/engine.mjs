// engine.mjs — Nora's engine: at each of her sets it fetches the programme she planned, loads the
// songs just ahead of when they play, mixes them (mixer.mjs) in real time and broadcasts the mix
// live into the station (radio.co's live input), then hangs up so the station's AutoDJ resumes.
//
//   runSet(job, deps)      one set, start to finish (or to a safe stop)
//   pollOnce(state, deps)  the service loop's step: is a set due, and is it already running?
//
// Everything outside the process comes in through `deps` (the Shape API, the decoder, the output,
// the clock), so tests run a whole set against fakes in milliseconds (tests/nora-engine.test.mjs);
// main.mjs wires the real ones.
//
// ⚠ IT FAILS TO THE AUTODJ, NEVER TO SILENCE. A song that cannot be loaded in time, an output that
// dies, a programme that does not check out: the engine stops the set and hangs up, the station
// falls back to its own rotation, and the failure is reported. It never fills a hole with nothing.
// ⚠ IT KEEPS SHAPE'S CLOCK, NOT ITS OWN. The API returns the server's time; the engine starts the
// set at that clock's `startsAt`, and a restarted engine joins mid-set at the right point.

import { activeAt, createMixer } from './mixer.mjs';

export const SAMPLE_RATE = 44100;
export const BLOCK_SEC = 0.25;          // rendered per write
export const LEAD_SEC = 1.5;            // how far ahead of the wall clock the output is kept
export const LOAD_AHEAD_SEC = 90;       // a song is loaded this long before it plays
export const DEADLINE_SEC = 2;          // a song not loaded by this long before it plays stops the set
export const CONNECT_EARLY_SEC = 120;   // the engine picks a set up this long before it starts

const sleep = (deps, ms) => (ms > 0 ? deps.sleep(ms) : Promise.resolve());

/**
 * Play one set.
 * @param {{set: {id, startsAt}, programme: object, sources: Record<string, string>, serverNowMs: number, localAtFetchMs: number}} job
 * @param {object} deps
 * @param {() => number} deps.now                      local clock, ms
 * @param {(ms: number) => Promise<void>} deps.sleep
 * @param {(url: string) => Promise<{sampleRate, left, right}>} deps.decode
 * @param {() => {write: (pcm: Float32Array) => Promise<boolean>, close: () => Promise<void>}} deps.openOutput
 * @param {(event: object) => Promise<void>} deps.report
 * @param {(msg: string) => void} [deps.log]
 * @returns {Promise<{ok: boolean, reason?: string, played: string[]}>}
 */
export async function runSet(job, deps) {
  const log = deps.log || (() => {});
  const { set, programme, sources } = job;
  const items = (programme && programme.items) || [];
  const played = [];
  if (!items.length) return { ok: false, reason: 'empty_programme', played };
  for (const it of items) if (!sources || !sources[it.trackId]) return { ok: false, reason: 'missing_source', played };

  // Shape's clock: server time = local time + offset.
  const offset = job.serverNowMs - job.localAtFetchMs;
  const startMs = Date.parse(set.startsAt);
  const setTime = () => (deps.now() + offset - startMs) / 1000;
  const endSec = Number(programme.endsSec) || items[items.length - 1].endSec;

  const mixer = createMixer(programme, { sampleRate: SAMPLE_RATE });
  const loaded = new Array(items.length).fill(null);
  const loading = new Array(items.length).fill(null);
  const failed = new Set();
  const load = (i) => {
    if (loading[i]) return loading[i];
    loading[i] = deps.decode(sources[items[i].trackId]).then(
      (pcm) => { loaded[i] = pcm; return pcm; },
      (e) => { failed.add(i); log(`could not load song ${i + 1}: ${e && e.message}`); return null; },
    );
    return loading[i];
  };

  // Wait for the start (a late engine joins where the set is now).
  const lead = setTime();
  if (lead < 0) {
    for (let i = 0; i < items.length && items[i].startSec < LOAD_AHEAD_SEC; i++) load(i);
    await sleep(deps, -lead * 1000);
  }
  let t = Math.max(0, Math.floor(setTime() / BLOCK_SEC) * BLOCK_SEC);
  if (t >= endSec) return { ok: false, reason: 'already_over', played };

  // The songs sounding at the join point must be in before a sample goes out.
  for (const i of activeAt(items, t)) await load(i);
  const missing = activeAt(items, t).filter((i) => !loaded[i]);
  if (missing.length) {
    await deps.report({ event: 'failed', setId: set.id, detail: `song ${missing[0] + 1} could not be loaded` });
    return { ok: false, reason: 'load_failed', played };
  }

  let out;
  try {
    out = deps.openOutput();
  } catch (e) {
    await deps.report({ event: 'failed', setId: set.id, detail: `output: ${e && e.message}` });
    return { ok: false, reason: 'output_failed', played };
  }
  await deps.report({ event: 'started', setId: set.id, atSec: t });
  const announced = new Set();
  const frames = Math.round(BLOCK_SEC * SAMPLE_RATE);
  let reason = null;

  while (t < endSec) {
    // Load what is coming up; free what has finished.
    for (let i = 0; i < items.length; i++) {
      if (items[i].startSec - t <= LOAD_AHEAD_SEC && items[i].endSec > t) load(i);
      if (items[i].endSec < t - 1) loaded[i] = null;
    }
    // ⚠ The deadline: a song due within DEADLINE_SEC that is not loaded stops the set.
    const due = items.findIndex((it, i) => it.startSec <= t + BLOCK_SEC + DEADLINE_SEC && it.endSec > t && !loaded[i]);
    if (due >= 0) {
      if (failed.has(due) || items[due].startSec <= t + BLOCK_SEC) { reason = `song ${due + 1} was not loaded in time`; break; }
      await Promise.race([loading[due], sleep(deps, 200)]);
      continue;
    }
    // Pace to the wall clock.
    const ahead = t - setTime();
    if (ahead > LEAD_SEC) { await sleep(deps, (ahead - LEAD_SEC) * 1000); continue; }

    const n = Math.min(frames, Math.ceil((endSec - t) * SAMPLE_RATE));
    const pcm = mixer.render(t, n, loaded);
    let ok;
    try { ok = await out.write(pcm); } catch { ok = false; }
    if (!ok) { reason = 'output_failed'; break; }
    // Each song is reported as it starts (the station's play log for the licence reports).
    for (const i of activeAt(items, t + n / SAMPLE_RATE)) {
      if (!announced.has(i) && items[i].startSec < t + n / SAMPLE_RATE) {
        announced.add(i);
        played.push(items[i].trackId);
        await deps.report({ event: 'song', setId: set.id, trackId: items[i].trackId, atSec: Math.max(items[i].startSec, t) });
      }
    }
    t += n / SAMPLE_RATE;
  }

  try { await out.close(); } catch { /* the connection is gone either way */ }
  if (reason) {
    log(`set ${set.id} stopped: ${reason}`);
    await deps.report({ event: 'failed', setId: set.id, detail: reason, atSec: t });
    return { ok: false, reason, played };
  }
  await deps.report({ event: 'ended', setId: set.id, atSec: t });
  return { ok: true, played };
}

/**
 * The service loop's step: ask Shape for the set due now or next; run it if it is within
 * CONNECT_EARLY_SEC and not already running. `state.running` holds the set id being played.
 */
export async function pollOnce(state, deps) {
  if (state.running) return { action: 'busy', setId: state.running };
  const localAtFetchMs = deps.now();
  let res;
  try { res = await deps.fetchJob(); } catch (e) { return { action: 'error', error: String(e && e.message) }; }
  if (!res || !res.set) return { action: 'idle' };
  const serverNowMs = Number(res.nowMs);
  const untilStart = (Date.parse(res.set.startsAt) - serverNowMs) / 1000;
  if (untilStart > CONNECT_EARLY_SEC) return { action: 'waiting', setId: res.set.id, inSec: untilStart };
  if (state.done && state.done.has(res.set.id)) return { action: 'done', setId: res.set.id };
  state.running = res.set.id;
  const job = { set: res.set, programme: res.programme, sources: res.sources, serverNowMs, localAtFetchMs };
  // A set that lost its connection is picked up again on the next poll (it rejoins where the set
  // is by then); one that finished, or failed for any other reason, is not retried.
  const result = runSet(job, deps).then((r) => {
    state.running = null;
    if (r.ok || r.reason !== 'output_failed') (state.done ||= new Set()).add(res.set.id);
    return r;
  }, (e) => {
    state.running = null;
    (state.done ||= new Set()).add(res.set.id);
    return { ok: false, reason: `crashed: ${e && e.message}`, played: [] };
  });
  return { action: 'started', setId: res.set.id, result };
}
