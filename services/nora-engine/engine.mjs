// engine.mjs — Nora's engine: Shape's own station's music around the clock (services/station). It
// plays her sets at their times and, between them, the rotation Shape plans
// (src/lib/radio/rotation.mjs), on one open stream: for each, it fetches the programme, loads the
// songs just ahead of when they play, and mixes them (mixer.mjs) in real time into the station.
// (Its other mode, Nora's sets alone into radio.co's live input, was taken out with radio.co:
// owner, 2026-11-04, "yes remove radio.co".)
//
//   runSet(job, deps, opts)  one set or rotation block, start to finish (or to a safe stop)
//   runStation(deps)         the station's service loop
//
// Everything outside the process comes in through `deps` (the Shape API, the decoder, the output,
// the clock), so tests run a whole set against fakes in milliseconds (tests/nora-engine.test.mjs);
// main.mjs wires the real ones.
//
// ⚠ IT FAILS TO THE STANDBY LOOP, NEVER TO SILENCE. A song that cannot be loaded in time, an output
// that dies, a programme that does not check out: the engine stops the segment and hangs up, the
// station's server moves listeners to its standby loop, and the failure is reported. It never
// fills a hole with nothing.
// ⚠ IT KEEPS SHAPE'S CLOCK, NOT ITS OWN. The API returns the server's time; the engine starts the
// set at that clock's `startsAt`, and a restarted engine joins mid-set at the right point.

import { activeAt, createMixer } from './mixer.mjs';

export const SAMPLE_RATE = 44100;
export const BLOCK_SEC = 0.25;          // rendered per write
export const LEAD_SEC = 1.5;            // how far ahead of the wall clock the output is kept
export const LOAD_AHEAD_SEC = 90;       // a song is loaded this long before it plays
export const DEADLINE_SEC = 2;          // a song not loaded by this long before it plays stops the set
export const PREFETCH_SEC = 120;        // the next segment is asked for, and its first songs loaded, this long before the end
export const CHECK_EVERY_SEC = 60;      // while a segment plays, Shape is asked this often whether it goes on
export const PAD_MAX_SEC = 25;          // a gap up to this long between segments is bridged with silence; a longer one goes to standby
export const CUT_FADE_SEC = 4;          // a segment cut short fades out over this long...
export const MIN_CUT_FADE_SEC = 2;      // ...or at least this long, when the cut is learned late
export const RETRY_SEC = [5, 10, 20, 40, 60];   // waits after consecutive failures
export const POLL_SEC = 20;             // the wait when there is nothing to play

const sleep = (deps, ms) => (ms > 0 ? deps.sleep(ms) : Promise.resolve());

/**
 * Play one set (or, on Shape's own station, one block of the rotation: `job.block`).
 * @param {{set?: {id, startsAt}, block?: {id, startsAt}, programme: object, sources: Record<string, string>, serverNowMs: number, localAtFetchMs: number}} job
 * @param {object} deps
 * @param {() => number} deps.now                      local clock, ms
 * @param {(ms: number) => Promise<void>} deps.sleep
 * @param {(url: string) => Promise<{sampleRate, left, right}>} deps.decode
 * @param {() => {write: (pcm: Float32Array) => Promise<boolean>, close: () => Promise<void>}} deps.openOutput
 * @param {(event: object) => Promise<void>} deps.report
 * @param {(item: object) => Promise<void>} [deps.announce]  the station's song title (best effort)
 * @param {(msg: string) => void} [deps.log]
 * @param {object} [opts]  runStation's: without a line (tests), a set opens its own output and
 *                         closes it at the end
 * @param {{out: object | null, writtenTo: number | null}} [opts.line]  the station's stream, kept
 *        open from one segment to the next: `writtenTo` is Shape's time the audio sent reaches
 * @param {() => number} [opts.until]  where the segment ends early, in its own seconds (Infinity: it does not)
 * @param {(t: number, endSec: number) => void} [opts.onTick]  called as it plays; must not throw
 * @returns {Promise<{ok: boolean, reason?: string, played: string[], cut?: boolean}>}
 */
export async function runSet(job, deps, opts = {}) {
  const log = deps.log || (() => {});
  const { programme, sources } = job;
  const seg = job.set || job.block;
  const ref = job.block ? { blockId: seg.id } : { setId: seg.id };
  const line = opts.line || null;
  const until = opts.until || (() => Infinity);
  const items = (programme && programme.items) || [];
  const played = [];
  if (!items.length) return { ok: false, reason: 'empty_programme', played };
  for (const it of items) if (!sources || !sources[it.trackId]) return { ok: false, reason: 'missing_source', played };

  // Shape's clock: server time = local time + offset.
  const offset = job.serverNowMs - job.localAtFetchMs;
  const startMs = Date.parse(seg.startsAt);
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
  const frames = Math.round(BLOCK_SEC * SAMPLE_RATE);
  const write = async (out, pcm) => { try { return await out.write(pcm); } catch { return false; } };
  // On the station's stream the line belongs to the station: a dead one is put down here, so the
  // next segment opens a new one; a live one is left open.
  const dropLine = async () => {
    if (!line || !line.out) return;
    const o = line.out;
    line.out = null; line.writtenTo = null;
    try { await o.close(); } catch { /* gone either way */ }
  };

  // Where to start. A segment that follows another on the open stream starts where the audio sent
  // so far ends (never behind the wall clock); otherwise where the wall clock is (a late engine
  // joins the set where it is).
  const joined = !!(line && line.out && line.writtenTo != null);
  let from = setTime();
  if (joined) from = Math.max((line.writtenTo - startMs) / 1000, from);
  if (from < 0) {
    for (let i = 0; i < items.length && items[i].startSec < LOAD_AHEAD_SEC; i++) load(i);
    if (joined) {
      // A short gap between two segments (runStation hangs up on a long one): silence, paced like
      // the music, so the stream stays up.
      let x = from;
      while (x < 0) {
        const ahead = x - setTime();
        if (ahead > LEAD_SEC) { await sleep(deps, (ahead - LEAD_SEC) * 1000); continue; }
        const n = Math.min(frames, Math.ceil(-x * SAMPLE_RATE));
        if (!(await write(line.out, new Float32Array(n * 2)))) {
          await dropLine();
          await deps.report({ event: 'failed', ...ref, detail: 'output_failed' });
          return { ok: false, reason: 'output_failed', played };
        }
        x += n / SAMPLE_RATE;
        line.writtenTo = startMs + x * 1000;
      }
    } else {
      // A new stream starts writing a little ahead, as it then stays (without a line, at the start).
      await sleep(deps, (-from - (line ? LEAD_SEC : 0)) * 1000);
    }
  }
  let t = joined ? Math.max(0, from) : Math.max(0, Math.floor(setTime() / BLOCK_SEC) * BLOCK_SEC);
  if (t >= endSec) return { ok: false, reason: 'already_over', played };

  // The songs sounding at the join point must be in before a sample goes out.
  for (const i of activeAt(items, t)) await load(i);
  const missing = activeAt(items, t).filter((i) => !loaded[i]);
  if (missing.length) {
    await deps.report({ event: 'failed', ...ref, detail: `song ${missing[0] + 1} could not be loaded` });
    return { ok: false, reason: 'load_failed', played };
  }

  let out = line ? line.out : null;
  if (!out) {
    try {
      out = deps.openOutput();
    } catch (e) {
      await deps.report({ event: 'failed', ...ref, detail: `output: ${e && e.message}` });
      return { ok: false, reason: 'output_failed', played };
    }
    if (line) { line.out = out; line.writtenTo = startMs + t * 1000; }
  }
  await deps.report({ event: 'started', ...ref, atSec: t });
  const announced = new Set();
  // The station's own title (its player and directory listings) changes when the incoming song
  // takes the floor: at the bass swap, half way through its blend, the moment Shape's now-playing
  // changes too (src/lib/radio/noraOnAir.mjs). Best effort: a failed title update never stops the
  // music.
  const named = new Set();
  const nameAt = (it) => it.startSec + (Number(it.mixIn && it.mixIn.lengthSec) || 0) / 2;
  const name = async (i) => {
    named.add(i);
    if (!deps.announce) return;
    // A plain timer, not deps.sleep: the wait bounds a network call and is no part of the set's clock.
    let timer;
    const limit = new Promise((r) => { timer = setTimeout(r, 3000); });
    try { await Promise.race([deps.announce(items[i]), limit]); } catch (e) { log(`title update failed: ${e && e.message}`); } finally { clearTimeout(timer); }
  };
  let reason = null;
  // Cut short (runStation: one of Nora's sets now starts inside a block, or Shape said stop): the
  // segment fades out to its new end, over CUT_FADE_SEC, or what is left of it.
  let cut = null;
  const endAt = () => (cut ? cut.to : endSec);

  while (t < endAt()) {
    if (!cut) {
      const u = until();
      if (u < endSec) {
        const to = Math.min(endSec, Math.max(u, t + MIN_CUT_FADE_SEC));
        cut = { from: Math.max(t, to - CUT_FADE_SEC), to };
        if (t >= endAt()) break;
      }
    }
    if (opts.onTick) opts.onTick(t, endAt());
    // Load what is coming up; free what has finished.
    for (let i = 0; i < items.length; i++) {
      if (items[i].startSec - t <= LOAD_AHEAD_SEC && items[i].endSec > t && items[i].startSec < endAt()) load(i);
      if (items[i].endSec < t - 1) loaded[i] = null;
    }
    // ⚠ The deadline: a song due within DEADLINE_SEC that is not loaded stops the set.
    const due = items.findIndex((it, i) => it.startSec <= t + BLOCK_SEC + DEADLINE_SEC && it.startSec < endAt() && it.endSec > t && !loaded[i]);
    if (due >= 0) {
      // Failed, or due in the very next block, or the wall clock has reached it: stop.
      if (failed.has(due) || items[due].startSec <= t + BLOCK_SEC || setTime() >= items[due].startSec) { reason = `song ${due + 1} was not loaded in time`; break; }
      await Promise.race([loading[due], sleep(deps, 200)]);
      continue;
    }
    // Pace to the wall clock.
    const ahead = t - setTime();
    if (ahead > LEAD_SEC) { await sleep(deps, (ahead - LEAD_SEC) * 1000); continue; }

    const n = Math.min(frames, Math.ceil((endAt() - t) * SAMPLE_RATE));
    const pcm = mixer.render(t, n, loaded);
    if (cut) fadeOut(pcm, t, cut);
    if (!(await write(out, pcm))) { reason = 'output_failed'; break; }
    if (line) line.writtenTo = startMs + (t + n / SAMPLE_RATE) * 1000;
    // Each song is reported as it starts (the station's play log for the licence reports).
    for (const i of activeAt(items, t + n / SAMPLE_RATE)) {
      if (!announced.has(i) && items[i].startSec < t + n / SAMPLE_RATE) {
        announced.add(i);
        played.push(items[i].trackId);
        await deps.report({ event: 'song', ...ref, trackId: items[i].trackId, atSec: Math.max(items[i].startSec, t) });
      }
    }
    for (let i = items.length - 1; i >= 0; i--) {
      if (!named.has(i) && nameAt(items[i]) < t + n / SAMPLE_RATE && items[i].endSec > t) {
        for (let j = 0; j <= i; j++) named.add(j);   // a later song supersedes any not yet named
        await name(i);
        break;
      }
    }
    t += n / SAMPLE_RATE;
  }

  if (!line) {
    try { await out.close(); } catch { /* the connection is gone either way */ }
  } else if (reason === 'output_failed') {
    await dropLine();
  }
  if (reason) {
    log(`${job.block ? 'block' : 'set'} ${seg.id} stopped: ${reason}`);
    await deps.report({ event: 'failed', ...ref, detail: reason, atSec: t });
    return { ok: false, reason, played };
  }
  await deps.report({ event: 'ended', ...ref, atSec: t });
  return cut ? { ok: true, played, cut: true } : { ok: true, played };
}

/** Scale a rendered block (interleaved, starting at segment time `t`) by the cut's fade. */
function fadeOut(pcm, t, cut) {
  const len = cut.to - cut.from;
  for (let k = 0; k < pcm.length / 2; k++) {
    const x = t + k / SAMPLE_RATE;
    const g = x <= cut.from ? 1 : len > 0 ? Math.max(0, Math.min(1, (cut.to - x) / len)) : 0;
    pcm[2 * k] *= g;
    pcm[2 * k + 1] *= g;
  }
}

/**
 * Shape's own station: the engine IS the station's music, around the clock.
 * It keeps one stream open and plays whatever Shape hands it (src/lib/radio/rotation.mjs), back to
 * back: Nora's sets at their times, and the rotation between them. It asks for each next segment,
 * and loads its first songs, PREFETCH_SEC before the current one ends, so they meet without a gap;
 * every CHECK_EVERY_SEC it asks whether the one playing goes on (a withdrawn licence stops it, one
 * of Nora's sets scheduled inside a rotation block cuts the block at her start).
 *
 * ⚠ IT FAILS TO THE STANDBY LOOP, NEVER TO SILENCE. With nothing to play (no licence, an empty
 * library, Shape out of reach), a gap longer than PAD_MAX_SEC, or a segment that fails, it hangs up,
 * and the station's server moves listeners to its standby loop (services/station) until the
 * engine is back. After a failure it waits longer each time (RETRY_SEC), and a segment that fails
 * twice running is not asked for again, so a fault never turns into a storm of new plans.
 *
 * @param {object} deps  runSet's, plus:
 * @param {(ask: {after: string | null, skip: string[]}) => Promise<object>} deps.fetchStationJob
 *        Shape's answer, whatever its status (an error body included); throws only when Shape is
 *        out of reach
 * @param {(ask: {kind: 'set' | 'block', id: string, skip: string[]}) => Promise<object>} deps.checkSegment
 * @param {{running?: () => boolean}} [opts]  tests stop the loop with `running`
 */
export async function runStation(deps, { running = () => true } = {}) {
  const log = deps.log || (() => {});
  const line = { out: null, writtenTo: null };
  const iso = (ms) => new Date(ms).toISOString();
  const hangUp = async () => {
    const o = line.out;
    line.out = null; line.writtenTo = null;
    if (o) { try { await o.close(); } catch { /* gone either way */ } }
  };
  // Segments Shape is not to hand out again: finished, or failed twice running. The last few only.
  const skip = [];
  const remember = (id) => { if (!skip.includes(id)) { skip.push(id); if (skip.length > 10) skip.shift(); } };
  // Songs loaded ahead for the next segment, taken (once) by its decode.
  const ahead = new Map();
  const decode = (url) => { const p = ahead.get(url); if (p) { ahead.delete(url); return p; } return deps.decode(url); };
  const preload = (job) => {
    for (const it of job.programme.items.slice(0, 2)) {
      const url = job.sources && job.sources[it.trackId];
      if (url && !ahead.has(url)) { const p = deps.decode(url); p.catch(() => {}); ahead.set(url, p); }
    }
  };
  const ask = async (after) => {
    const localAtFetchMs = deps.now();
    try {
      const r = await deps.fetchStationJob({ after, skip: [...skip] });
      return r && typeof r === 'object' ? { ...r, serverNowMs: Number(r.nowMs), localAtFetchMs } : null;
    } catch (e) {
      log(`could not reach Shape: ${e && e.message}`);
      return null;
    }
  };
  const segOf = (job) => (job && (job.set || job.block)) || null;
  let after = null, next = null, lastNextAt = null;
  let failures = 0, lastFailed = null, overAgain = false;
  // ⚠ ONE CHECK CLOCK FOR THE WHOLE STATION, not one per segment (Codex, #2570): restarted at each
  // hand-over, a check made just before one and the next segment's first, a minute into it, left
  // nearly two minutes in which a withdrawn licence, or a set scheduled over a block, went unseen.
  let lastCheck = deps.now();
  const backOff = async () => { await deps.sleep(RETRY_SEC[Math.min(failures, RETRY_SEC.length) - 1] * 1000); };

  while (running()) {
    let job = next;
    next = null;
    if (!job) job = await ask(after);
    const seg = segOf(job);
    if (!seg) {
      const failedId = job && job.error && (job.setId || job.blockId);
      if (failedId) remember(failedId);   // a set or block Shape cannot hand out: not that one again
      // A gap too short for a block (Shape names when the next segment starts): bridged.
      const nextAt = job && job.nextAt ? Date.parse(job.nextAt) : NaN;
      if (line.out && line.writtenTo != null && Number.isFinite(nextAt) && nextAt !== lastNextAt
        && nextAt > line.writtenTo && nextAt - line.writtenTo <= PAD_MAX_SEC * 1000) {
        lastNextAt = nextAt;
        after = iso(nextAt);
        continue;
      }
      if (line.out) log(`nothing to play (${(job && (job.reason || job.error)) || 'Shape out of reach'}): the standby loop takes over`);
      await hangUp();
      after = null;
      await deps.sleep((failedId ? RETRY_SEC[0] : POLL_SEC) * 1000);
      continue;
    }
    const startMs = Date.parse(seg.startsAt);
    // A long gap before it: the standby loop plays until it starts.
    if (line.out && line.writtenTo != null && startMs - line.writtenTo > PAD_MAX_SEC * 1000) await hangUp();

    const kind = job.block ? 'block' : 'set';
    let cutAt = null, stopped = false, fetching = null, checking = false;
    const onTick = (t, endSec) => {
      if (!fetching && endSec - t <= PREFETCH_SEC) {
        const nextAfter = iso(startMs + endSec * 1000);
        fetching = ask(nextAfter).then((r) => {
          if (segOf(r) && cutAt == null && !stopped) preload(r);
          return r;
        });
      }
      if (!checking && deps.now() - lastCheck >= CHECK_EVERY_SEC * 1000) {
        checking = true;
        lastCheck = deps.now();
        Promise.resolve().then(() => deps.checkSegment({ kind, id: seg.id, skip: [...skip] })).then((r) => {
          if (r && r.stop) stopped = true;
          else if (r && r.cutAt && Number.isFinite(Date.parse(r.cutAt))) cutAt = Date.parse(r.cutAt);
        }, (e) => log(`check failed: ${e && e.message}`)).finally(() => { checking = false; });
      }
    };
    const until = () => (stopped ? -Infinity : cutAt != null ? (cutAt - startMs) / 1000 : Infinity);

    const r = await runSet(job, { ...deps, decode }, { line, until, onTick });
    const prefetched = fetching ? await fetching : null;
    if (r.ok) {
      failures = 0; lastFailed = null; overAgain = false;
      remember(seg.id);
      if (stopped) {
        after = null;                                       // the next ask says why
      } else if (r.cut) {
        after = iso(cutAt);                                 // Nora's set, from her start
        ahead.clear();                                      // the songs loaded for what was next: dropped
      } else {
        after = line.writtenTo != null ? iso(line.writtenTo) : null;
        next = prefetched && (segOf(prefetched) || prefetched.nextAt) ? prefetched : null;
      }
      continue;
    }
    if (r.reason === 'already_over') {
      // Handed a segment that has just ended (an ask on its last moment): not that one again. Twice
      // running is no longer a moment's overlap: a pause, so it can never spin.
      remember(seg.id);
      after = line.out && line.writtenTo != null ? iso(line.writtenTo) : null;
      if (overAgain) await deps.sleep(RETRY_SEC[0] * 1000);
      overAgain = true;
      continue;
    }
    overAgain = false;
    // It failed. Twice running and it is not asked for again; each failure waits longer.
    failures++;
    if (lastFailed === seg.id) remember(seg.id);
    lastFailed = seg.id;
    ahead.clear();
    log(`${kind} ${seg.id}: ${r.reason}; trying again in ${RETRY_SEC[Math.min(failures, RETRY_SEC.length) - 1]} s`);
    await hangUp();
    after = null;
    await backOff();
  }
  await hangUp();
}
