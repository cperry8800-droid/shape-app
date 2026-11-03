// noraOnAir.mjs — what listeners are hearing while Nora is the DJ, read from the set she planned
// rather than from the station's metadata: the song, its artist and album (which the licence
// requires to be shown while it plays), and the tempo and mix state the booth follows.
//
//   heardNow(programme, setStartMs, nowMs, { lagSec }) → { index, item, mixing, playedBpm } | null
//   noraOnAir(db, { now })                              → the now-playing payload, or null
//   rotationOnAir(db, { now })                          → the same for Shape's own station's
//                                                         rotation between her sets (below)
//
// ⚠ ONLY WHAT HAS BEEN HEARD, NEVER WHAT IS NEXT. The licence forbids naming a recording before it
// airs, and listeners hear the stream a few seconds behind the engine. So the song shown is the
// one sounding HEARD_LAG_SEC behind the plan's clock; through a blend the outgoing song stays
// shown until the bass swap, when the incoming one has taken over the floor. Nothing about the
// next song, not even when it comes, leaves this module.
// ⚠ ONLY WHILE HER ENGINE SAYS IT IS ON THE AIR. A planned set whose engine never connected, or
// stopped (the station's AutoDJ took over), is not Nora's: the payload then comes from the
// station as usual.

export const HEARD_LAG_SEC = 6;   // engine → station → listener, a typical Icecast buffer (an estimate)

export function heardNow(programme, setStartMs, nowMs, { lagSec = HEARD_LAG_SEC } = {}) {
  const items = (programme && programme.items) || [];
  const t = (nowMs - setStartMs) / 1000 - lagSec;
  if (!items.length || !(t >= 0) || t >= Number(programme.endsSec)) return null;
  const sounding = [];
  for (let i = 0; i < items.length; i++) if (t >= items[i].startSec && t < items[i].endSec) sounding.push(i);
  if (!sounding.length) return null;
  let index = sounding[0];
  if (sounding.length > 1) {
    // The later song takes the name once the blend is half done (the bass swap).
    const inc = items[sounding[sounding.length - 1]];
    const half = inc.startSec + (Number(inc.mixIn && inc.mixIn.lengthSec) || 0) / 2;
    index = t >= half ? sounding[sounding.length - 1] : sounding[0];
  }
  const item = items[index];
  const bpm = Number(item.bpm);
  return {
    index,
    item,
    mixing: sounding.length > 1,
    playedBpm: Number.isFinite(bpm) && bpm > 0 ? Math.round(bpm * (Number(item.rate) || 1) * 100) / 100 : null,
  };
}

/** The now-playing payload while a Nora set is on the air, or null when none is. */
export async function noraOnAir(db, { now }) {
  const { data: sets, error } = await db.from('nora_sets').select('id,starts_at,duration_min')
    .eq('host_kind', 'nora').eq('published', true)
    .lte('starts_at', new Date(now).toISOString()).gt('starts_at', new Date(now - 7 * 3600000).toISOString())
    .order('starts_at', { ascending: false }).limit(3);
  if (error || !sets || !sets.length) return null;
  for (const set of sets) {
    const { data: last } = await db.from('nora_engine_log').select('event').eq('set_id', set.id).order('logged_at', { ascending: false }).limit(1).maybeSingle();
    if (!last || !['started', 'song'].includes(last.event)) continue;
    const { data: prog } = await db.from('nora_set_programmes').select('programme').eq('set_id', set.id).maybeSingle();
    if (!prog) continue;
    const heard = heardNow(prog.programme, Date.parse(set.starts_at), now);
    if (!heard) continue;
    return {
      title: heard.item.title || null,
      artist: heard.item.artist || null,
      album: heard.item.album || null,
      isNora: true,
      simulated: false,
      nora: { setId: set.id, bpm: heard.playedBpm, mixing: heard.mixing },
    };
  }
  return null;
}

// ── Shape's own station: the rotation between her sets (src/lib/radio/rotation.mjs) ──────────
// The same rules as her sets, and one more:
// ⚠ ONLY A SONG THE ENGINE SAYS IT PLAYED. A block is planned for an hour; an engine that died in
// it never reports the songs after, and the station's standby loop plays instead. So the song
// heard by the plan's clock is named only once the engine has reported that song as started (it
// reports each as it starts, ahead of the listener's lag), and only while listeners have not yet
// heard its last word on the block be that it ended or stopped.
const ROTATION_LOOKBACK_MS = 2 * 3600000 + 120000;   // a block lasts at most 2 h

/** The now-playing payload while a rotation block is on the air, or null when none is. */
export async function rotationOnAir(db, { now }) {
  const { data: blocks, error } = await db.from('radio_rotation_blocks').select('id,starts_at,programme')
    .lte('starts_at', new Date(now).toISOString()).gt('starts_at', new Date(now - ROTATION_LOOKBACK_MS).toISOString())
    .order('starts_at', { ascending: false }).limit(3);
  if (error || !blocks || !blocks.length) return null;
  for (const block of blocks) {
    const heard = heardNow(block.programme, Date.parse(block.starts_at), now);
    if (!heard) continue;
    const { data: log, error: lErr } = await db.from('nora_engine_log').select('event,track_id,title,artist,played_at')
      .eq('block_id', block.id).order('logged_at', { ascending: false }).limit(60);
    if (lErr || !log || !log.length) continue;
    // ⚠ A BLOCK'S END TAKES EFFECT WHEN LISTENERS HEAR IT (Codex, #2574). The engine reports it
    // ended (or stopped, or was cut for her set) at the moment it stopped sending, and listeners
    // hear its last seconds HEARD_LAG_SEC later: until then, the song still sounding is named.
    if (!['started', 'song'].includes(log[0].event)) {
      const stoppedAt = Date.parse(log[0].played_at);
      if (!(Number.isFinite(stoppedAt) && now - HEARD_LAG_SEC * 1000 < stoppedAt)) continue;
    }
    // ⚠ MATCHED BY ITS TRACK, OR, FOR A TRACK DELETED FROM THE LIBRARY SINCE (its id set null), BY
    // THE TITLE AND ARTIST THE REPORT COPIED (Codex, #2574): the engine has the song decoded and
    // plays it on, and so it is named on.
    const item = heard.item;
    const reported = log.some((r) => r.event === 'song' && (r.track_id === item.trackId
      || (r.track_id == null && r.title === item.title && r.artist === item.artist)));
    if (!reported) continue;
    return {
      title: heard.item.title || null,
      artist: heard.item.artist || null,
      album: heard.item.album || null,
      isNora: false,
      simulated: false,
    };
  }
  return null;
}
