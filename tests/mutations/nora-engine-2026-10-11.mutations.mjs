// Mutation spec for Nora's engine: the mixer (beat-matched blends with the bass swap, crossfades,
// levels, the end fade, the knee), the engine's clock and its rule of failing to the AutoDJ, the
// real ffmpeg output, and Shape's side (the licence gate, the play log, the report, the token).
// Every one must be killed.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/nora-engine-2026-10-11.mutations.mjs --fail-on-skipped
const MIX = 'services/nora-engine/mixer.mjs';
const ENG = 'services/nora-engine/engine.mjs';
const MAIN = 'services/nora-engine/main.mjs';
const API = 'src/lib/radio/noraEngineApi.mjs';
const ROUTE = 'src/app/api/radio/nora/engine/route.ts';

export default {
  test: 'node --test tests/nora-engine.test.mjs',
  timeoutMs: 600_000,
  mutations: [
    // ── the mixer ──
    { name: 'the incoming song plays at its own speed', file: MIX,
      find: "          const pos = (it.cueInSec + (t - it.startSec) * (Number(it.rate) || 1)) * (src.sampleRate || sampleRate);", replace: '          const pos = (it.cueInSec + (t - it.startSec)) * (src.sampleRate || sampleRate);' },
    { name: 'the incoming song starts from its first sample, not its cue', file: MIX,
      find: '          const pos = (it.cueInSec + (t - it.startSec)', replace: '          const pos = (0 + (t - it.startSec)' },
    { name: 'no bass swap: the incoming bass comes in at once', file: MIX,
      find: '      low *= clamp((t - (it.startSec + L / 2)) / beat, 0, 1);', replace: '      low *= 1;' },
    { name: 'no bass swap: the outgoing bass stays to the end', file: MIX,
      find: '      low *= 1 - clamp((t - (next.startSec + L / 2)) / beat, 0, 1);', replace: '      low *= 1;' },
    { name: 'the outgoing song never fades', file: MIX,
      find: '      vol *= y < 0.5 ? 1 : fall((y - 0.5) / 0.5);', replace: '      vol *= 1;' },
    { name: 'no end fade', file: MIX,
      find: '  if (it.fadeOutSec > 0) vol *= clamp((it.endSec - t) / it.fadeOutSec, 0, 1);', replace: '' },
    { name: 'the gain is ignored', file: MIX,
      find: '        const gain = 10 ** ((Number(it.gainDb) || 0) / 20);', replace: '        const gain = 1;' },
    { name: 'no knee: the sum clips', file: MIX,
      find: '  if (a <= KNEE) return x;', replace: '  return x;' },
    { name: 'the bass filter restarts every block', file: MIX,
      find: '        if (f.at == null || Math.abs(f.at - fromSec) > dt / 2) { f.l.reset(); f.r.reset(); }', replace: '        f.l.reset(); f.r.reset();' },
    // ── the engine ──
    { name: "the engine keeps its own clock, not Shape's", file: ENG,
      find: '  const offset = job.serverNowMs - job.localAtFetchMs;', replace: '  const offset = 0;' },
    { name: 'a late engine starts the set from the top', file: ENG,
      find: '  let t = Math.max(0, Math.floor(setTime() / BLOCK_SEC) * BLOCK_SEC);', replace: '  let t = 0;' },
    { name: '⚠ a song not loaded in time plays as silence', file: ENG,
      find: "      if (failed.has(due) || items[due].startSec <= t + BLOCK_SEC) { reason = `song ${due + 1} was not loaded in time`; break; }", replace: '      if (false) { break; }' },
    { name: '⚠ a dropped connection is not noticed', file: ENG,
      find: "    if (!ok) { reason = 'output_failed'; break; }", replace: '' },
    { name: 'the line is left open after the set', file: ENG,
      find: '  try { await out.close(); } catch { /* the connection is gone either way */ }', replace: '' },
    { name: 'songs are not reported', file: ENG,
      find: "        await deps.report({ event: 'song', setId: set.id, trackId: items[i].trackId, atSec: Math.max(items[i].startSec, t) });", replace: '' },
    { name: 'the output runs ahead of the clock', file: ENG,
      find: '    if (ahead > LEAD_SEC) { await sleep(deps, (ahead - LEAD_SEC) * 1000); continue; }', replace: '' },
    { name: 'a finished set is played again', file: ENG,
      find: "  if (state.done && state.done.has(res.set.id)) return { action: 'done', setId: res.set.id };", replace: '' },
    { name: 'a dropped set is never picked up again', file: ENG,
      find: "    if (r.ok || r.reason !== 'output_failed') (state.done ||= new Set()).add(res.set.id);", replace: '    (state.done ||= new Set()).add(res.set.id);' },
    // ── the real output ──
    { name: '⚠ a write waits on drain alone (the hang)', file: MAIN,
      find: '        p.once(\'close\', onClose);\n        p.stdin.once(\'drain\', onDrain);', replace: "        p.stdin.once('drain', onDrain);" },
    { name: 'the stream is not tagged as MP3', file: MAIN,
      find: "  if (live) args.push('-content_type', 'audio/mpeg',", replace: "  if (live) args.push('-content_type', 'application/octet-stream'," },
    // ── Shape's side ──
    { name: '⚠ an unlicensed set is handed out', file: API,
      find: "  if (!lic.licensed) return { status: 200, body: { nowMs: now, set: null, reason: 'unlicensed' } };\n", replace: '' },
    { name: 'an unpublished set is handed out', file: API,
      find: ".eq('host_kind', 'nora').eq('published', true)", replace: ".eq('host_kind', 'nora')" },
    { name: 'a finished set is handed out again', file: API,
      find: '  const set = (sets || []).find((s) => Date.parse(s.starts_at) + s.duration_min * 60000 + OVERRUN_MS > now);', replace: '  const set = (sets || [])[0];' },
    { name: 'a set with a deleted song is handed out', file: API,
      find: "    if (!path) return { status: 409, body: { error: 'song_missing', trackId: id, setId: set.id } };", replace: '    if (!path) continue;' },
    { name: 'the links expire before the set ends', file: API,
      find: '  const ttl = Math.max(LINK_TTL_MIN_SEC, Math.ceil((endMs - now) / 1000) + LINK_TTL_MIN_SEC);', replace: '  const ttl = 600;' },
    { name: 'any song can be logged as played', file: API,
      find: "    if (!prog || !((prog.programme && prog.programme.items) || []).some((it) => it.trackId === b.trackId)) return { status: 409, body: { error: 'not_in_programme' } };", replace: '' },
    { name: 'a CSV formula is not defused', file: API,
      find: "  const safe = /^[=+\\-@\\t\\r]/.test(s) ? `'${s}` : s;", replace: '  const safe = s;' },
    { name: 'the report includes other events', file: API,
      find: "    .eq('event', 'song').gte('played_at', range[0])", replace: "    .gte('played_at', range[0])" },
    { name: 'the engine route is open without a token', file: ROUTE,
      find: "  if (secret.length < 32) return NextResponse.json({ error: 'engine_not_configured' }, { status: 503, headers: NO_STORE });", replace: '' },
  ],
};
