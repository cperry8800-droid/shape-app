// noraOnAir.mjs — what listeners are hearing while Nora is the DJ, read from the set she planned
// rather than from the station's metadata: the song, its artist and album (which the licence
// requires to be shown while it plays), and the tempo and mix state the booth follows.
//
//   heardNow(programme, setStartMs, nowMs, { lagSec }) → { index, item, mixing, playedBpm } | null
//   noraOnAir(db, { now })                              → the now-playing payload, or null
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
