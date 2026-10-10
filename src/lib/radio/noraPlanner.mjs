// noraPlanner.mjs — Nora builds a DJ set: which songs, in what order, and how each one mixes into
// the next. The result (a "programme") is what her engine plays into the station and what the
// booth replays, so it holds every time the mix needs, in seconds from the set's start.
//
//   planSet({ tracks, set, history, seed }) → programme
//   checkProgramme(programme, history)     → [] or the rules it breaks
//
// HOW SHE CHOOSES. One song at a time, the best-scoring candidate that breaks no rule:
//   - the set follows an energy arc (warm up, build, peak, ease off), read against the library's
//     own spread of intensity, so a mellow library still gets a shape;
//   - the next song mixes in key (Camelot neighbours) and near the tempo she is playing at;
//   - songs heard recently are passed over; a seeded jitter makes two sets from one library differ.
//
// THE RULES SHE NEVER BREAKS (the statutory webcasting licence's sound recording performance
// complement, read at its strictest; counsel to confirm), over ANY 3 hours, the station's
// recent plays (`history`) included:
//   - no more than 4 songs by one featured artist, and no more than 3 of them in a row;
//   - no more than 3 songs from one album, and no more than 2 of them in a row;
//   - no song twice within 3 hours (a stricter house rule: it also keeps a set from looping).
// When no song can follow without breaking one, the set ends early and says why (`short`).
//
// HOW SHE MIXES. Two songs with a beat grid within ±4 % of each other are beat-matched: the
// incoming song is played at the rate that locks its tempo to the outgoing one and enters on
// its first kick, on the outgoing song's mix-out phrase, over 16 bars, the lows swapped half way.
// Anything else is blended over the outgoing song's own fade (a short fade when the keys clash).
//
// PURE: no clock, no I/O, no Math.random. The same inputs give the same programme.

export const PLANNER_VERSION = 1;
export const COMPLEMENT = Object.freeze({ windowSec: 3 * 3600, artistMax: 4, artistRun: 3, albumMax: 3, albumRun: 2 });
export const BEATMATCH_MAX = 0.04;       // ±4 % rate (about ±0.7 semitone)
export const BLEND_BARS = 16;
export const REPEAT_SEC = 3 * 3600;      // no song twice within this
const RECENT_SEC = 24 * 3600;            // a song heard within this is passed over where possible
const END_SLACK_SEC = 90;                // stop adding once a song would start this close to the end
const OVERRUN_SEC = 60;                  // a last song running past the end by more fades at the end
const END_FADE_SEC = 8;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const round = (v, d = 3) => { const k = 10 ** d; return Math.round(v * k) / k; };

// ── Who and what counts ────────────────────────────────────────────────────────────────────
/** Every artist a credit names ("A feat. B & C" counts for A, B and C), lower-cased. */
export function artistsOf(credit) {
  return String(credit || '')
    .toLowerCase()
    .split(/\s*(?:,|&|\+|\/|;|\bfeat\.?|\bft\.?|\bfeaturing\b|\bwith\b|\bx\b|\band\b|\bvs\.?)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The album a song counts against, or null when unknown (then it can collide with nothing). */
export function albumOf(t) {
  const a = String((t && t.album) || '').trim().toLowerCase();
  return a || null;
}

/**
 * The rules a sequence of plays breaks. Each play is { trackId, artist, album, at } (seconds on
 * one clock). `history` plays come first; only violations that involve a NEW play are reported,
 * since the history is what it is.
 */
export function complementViolations(plays, { fromIndex = 0 } = {}) {
  const out = [];
  const W = COMPLEMENT.windowSec;
  for (let i = fromIndex; i < plays.length; i++) {
    const p = plays[i];
    const inWindow = plays.slice(0, i + 1).filter((q) => q.at > p.at - W);
    for (const name of artistsOf(p.artist)) {
      const n = inWindow.filter((q) => artistsOf(q.artist).includes(name)).length;
      if (n > COMPLEMENT.artistMax) out.push({ rule: 'artist-max', index: i, artist: name, count: n });
      let run = 0;
      for (let j = i; j >= 0 && artistsOf(plays[j].artist).includes(name); j--) run++;
      if (run > COMPLEMENT.artistRun) out.push({ rule: 'artist-run', index: i, artist: name, count: run });
    }
    const album = albumOf(p);
    if (album) {
      const n = inWindow.filter((q) => albumOf(q) === album).length;
      if (n > COMPLEMENT.albumMax) out.push({ rule: 'album-max', index: i, album, count: n });
      let run = 0;
      for (let j = i; j >= 0 && albumOf(plays[j]) === album; j--) run++;
      if (run > COMPLEMENT.albumRun) out.push({ rule: 'album-run', index: i, album, count: run });
    }
    if (p.trackId && plays.slice(0, i).some((q) => q.trackId === p.trackId && q.at > p.at - REPEAT_SEC)) {
      out.push({ rule: 'repeat', index: i, trackId: p.trackId });
    }
  }
  return out;
}

// ── Keys and tempo ─────────────────────────────────────────────────────────────────────────
function parseCamelot(c) {
  const m = /^(1[0-2]|[1-9])([AB])$/.exec(typeof c === 'string' ? c : '');
  return m ? { n: Number(m[1]), l: m[2] } : null;
}

/** How well two keys mix: 1 same, 0.9 relative major/minor, 0.85 a step round the wheel, 0.45 two steps, 0.5 unknown, else 0.1. */
export function keyScore(a, b) {
  const x = parseCamelot(a), y = parseCamelot(b);
  if (!x || !y) return 0.5;
  const step = Math.min((x.n - y.n + 12) % 12, (y.n - x.n + 12) % 12);
  if (step === 0) return x.l === y.l ? 1 : 0.9;
  if (x.l !== y.l) return 0.1;
  if (step === 1) return 0.85;
  if (step === 2) return 0.45;
  return 0.1;
}

/** The rate that locks `bpm` to `playedBpm`, or null when that is beyond ±4 % or either is unknown. */
export function matchRate(playedBpm, bpm) {
  if (!(playedBpm > 0) || !(bpm > 0)) return null;
  const r = playedBpm / bpm;
  return Math.abs(r - 1) <= BEATMATCH_MAX + 1e-9 ? r : null;
}

function tempoScore(playedBpm, bpm) {
  if (!(playedBpm > 0) || !(bpm > 0)) return 0.5;
  const d = Math.abs(playedBpm / bpm - 1);
  return d <= 0.02 ? 1 : d <= BEATMATCH_MAX ? 0.8 : d <= 0.08 ? 0.4 : 0.15;
}

// ── The energy arc ─────────────────────────────────────────────────────────────────────────
/** Where in the library's spread of intensity the set should be at fraction `x` of its length. */
export function arcQuantile(x) {
  const t = clamp(x, 0, 1);
  if (t < 0.15) return 0.25 + (t / 0.15) * 0.2;           // warm up: 0.25 → 0.45
  if (t < 0.7) return 0.45 + ((t - 0.15) / 0.55) * 0.45;   // build: 0.45 → 0.9
  if (t < 0.9) return 0.9;                                  // peak
  return 0.9 - ((t - 0.9) / 0.1) * 0.25;                    // ease off: 0.9 → 0.65
}

function quantile(sorted, q) {
  if (!sorted.length) return 0.5;
  const x = clamp(q, 0, 1) * (sorted.length - 1);
  const i = Math.floor(x), f = x - i;
  return i + 1 < sorted.length ? sorted[i] + (sorted[i + 1] - sorted[i]) * f : sorted[i];
}

// ── Seeded jitter ──────────────────────────────────────────────────────────────────────────
function hashSeed(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── One song's timing ──────────────────────────────────────────────────────────────────────
const grid = (t) => {
  const a = t.analysis || {};
  return a.bpm > 0 && Number.isFinite(a.downbeatSec) && Number.isInteger(a.mixOutBar) && Number.isInteger(a.mixInFromBar) ? a : null;
};
const barAt = (a, bar) => a.downbeatSec + bar * 4 * (60 / a.bpm);

/**
 * How `next` comes in under `prev`, which started at set time `prevStart` from file offset
 * `prevCueIn` at rate `prevRate`. Returns the incoming song's start (set time), its cue-in and
 * rate, the outgoing song's cue-out, and the kind of mix.
 */
export function planTransition(prev, next, { prevStart, prevCueIn, prevRate }) {
  const pa = prev.analysis, na = next.analysis;
  const toSet = (fileSec) => prevStart + (fileSec - prevCueIn) / prevRate;
  const pg = grid(prev), ng = grid(next);
  const rate = pg && ng ? matchRate(pg.bpm * prevRate, ng.bpm) : null;
  if (pg && ng && rate != null && pg.mixOutBar - (pg.firstKickBar || 0) >= 8) {
    const outFile = barAt(pg, pg.mixOutBar);
    if (outFile > prevCueIn) {
      const beatSecPlayed = 60 / pg.bpm / prevRate;
      const lengthSec = BLEND_BARS * 4 * beatSecPlayed;
      return {
        type: 'beatmatch', bars: BLEND_BARS,
        startSec: toSet(outFile), lengthSec,
        nextCueIn: Math.max(0, barAt(ng, ng.mixInFromBar)), nextRate: rate,
        prevCueOut: Math.min(pa.durationSec, outFile + BLEND_BARS * 4 * (60 / pg.bpm) + 0.25 * 4 * (60 / pg.bpm)),
        eq: 'swap-lows',
      };
    }
  }
  // A blend over the outgoing song's own fade; a short fade when the keys clash.
  const clash = keyScore(pa.camelot, na.camelot) <= 0.1;
  const tail = Math.max(0, pa.soundEndSec - pa.fadeOutSec);
  const overlap = clash ? 3 : clamp(tail, 4, 10);
  const outFile = Math.max(prevCueIn + 1, Math.min(pa.fadeOutSec, pa.soundEndSec - overlap));
  return {
    type: clash ? 'fade' : 'blend', bars: null,
    startSec: toSet(outFile), lengthSec: overlap / prevRate,
    nextCueIn: Math.max(0, na.soundStartSec), nextRate: 1,
    prevCueOut: Math.min(pa.soundEndSec, outFile + overlap),
    eq: null,
  };
}

// ── The set ────────────────────────────────────────────────────────────────────────────────
/**
 * @param {object} p
 * @param {Array<{id,title,artist,album,label,isrc,analysis}>} p.tracks  ready, enabled songs
 * @param {{id: string, startsAt: string, durationMin: number}} p.set
 * @param {Array<{trackId?, artist, album, playedAt: string}>} [p.history]  the station's plays before the set
 * @param {string} [p.seed]  defaults to the set's id
 */
export function planSet({ tracks, set, history = [], seed }) {
  const startMs = Date.parse(set.startsAt);
  const durationSec = Math.round(Number(set.durationMin) * 60);
  if (!Number.isFinite(startMs) || !(durationSec > 0)) throw new Error('planSet: the set needs startsAt and durationMin');
  const rand = mulberry32(hashSeed(seed ?? set.id ?? set.startsAt));
  const pool = (Array.isArray(tracks) ? tracks : []).filter((t) => t && t.id && t.analysis && t.analysis.durationSec > 0 && t.artist);
  const sortedIntensity = pool.map((t) => Number(t.analysis.intensity) || 0).sort((a, b) => a - b);

  // History on the set's clock: seconds relative to its start (negative = before it).
  const past = (Array.isArray(history) ? history : [])
    .map((h) => ({ trackId: h.trackId || null, artist: h.artist || '', album: h.album || null, at: (Date.parse(h.playedAt) - startMs) / 1000 }))
    .filter((h) => Number.isFinite(h.at) && h.at < 0 && h.at > -RECENT_SEC)
    .sort((a, b) => a.at - b.at);
  const plays = past.filter((h) => h.at > -COMPLEMENT.windowSec);
  const recentlyHeard = new Set(past.map((h) => h.trackId).filter(Boolean));

  const items = [];
  const used = new Set();
  let short = null;
  let cursor = 0;              // set time the next song would start
  let prev = null, prevStart = 0, prevCueIn = 0, prevRate = 1;

  while (true) {
    // Score every candidate that breaks no rule.
    let best = null;
    for (const t of pool) {
      if (used.has(t.id)) continue;
      const tr = prev ? planTransition(prev, t, { prevStart, prevCueIn, prevRate }) : null;
      const at = tr ? tr.startSec : 0;
      if (at >= durationSec - END_SLACK_SEC && items.length) continue;
      const play = { trackId: t.id, artist: t.artist, album: t.album || null, at };
      if (complementViolations([...plays, play], { fromIndex: plays.length }).length) continue;
      const target = quantile(sortedIntensity, arcQuantile(at / durationSec));
      const energy = 1 - Math.min(1, Math.abs((Number(t.analysis.intensity) || 0) - target) * 2.5);
      const playedBpm = prev && grid(prev) ? grid(prev).bpm * prevRate : null;
      const key = prev ? keyScore(prev.analysis.camelot, t.analysis.camelot) : 0.7;
      const tempo = prev ? tempoScore(playedBpm, t.analysis.bpm) : 0.7;
      const smooth = tr && tr.type === 'beatmatch' ? 0.15 : 0;
      const fresh = recentlyHeard.has(t.id) ? -0.35 : 0;
      const score = 0.35 * energy + 0.3 * key + 0.2 * tempo + smooth + fresh + 0.12 * rand();
      if (!best || score > best.score) best = { t, tr, score };
    }
    if (!best) {
      if (cursor < durationSec - END_SLACK_SEC) short = items.length ? 'rules-or-library' : 'empty-library';
      break;
    }
    const { t, tr } = best;
    const a = t.analysis;
    const startSec = tr ? tr.startSec : 0;
    const cueIn = tr ? tr.nextCueIn : Math.max(0, a.soundStartSec);
    const rate = tr ? tr.nextRate : 1;
    if (prev && tr) {
      const last = items[items.length - 1];
      last.cueOutSec = round(tr.prevCueOut);
      last.endSec = round(prevStart + (tr.prevCueOut - prevCueIn) / prevRate);
    }
    const naturalEnd = startSec + (a.soundEndSec - cueIn) / rate;
    items.push({
      trackId: t.id, title: t.title, artist: t.artist, album: t.album || null, label: t.label || null, isrc: t.isrc || null,
      startSec: round(startSec), cueInSec: round(cueIn), cueOutSec: round(a.soundEndSec), endSec: round(naturalEnd), rate: round(rate, 5),
      // The song's own measured tempo (null without a grid): × rate is the tempo heard, which the
      // booth and the now-playing route follow (src/lib/radio/noraOnAir.mjs).
      bpm: a.bpm > 0 ? a.bpm : null,
      gainDb: 0,
      mixIn: tr ? { type: tr.type, lengthSec: round(tr.lengthSec), bars: tr.bars, eq: tr.eq } : { type: 'open', lengthSec: 0, bars: null, eq: null },
    });
    used.add(t.id);
    plays.push({ trackId: t.id, artist: t.artist, album: t.album || null, at: startSec });
    prev = t; prevStart = startSec; prevCueIn = cueIn; prevRate = rate;
    cursor = naturalEnd;
    if (naturalEnd >= durationSec - END_SLACK_SEC) break;
  }

  // The last song: past the end by more than a minute, it fades out at the end.
  const last = items[items.length - 1];
  let endsSec = last ? last.endSec : 0;
  if (last && last.endSec > durationSec + OVERRUN_SEC) {
    const outAt = durationSec;
    last.cueOutSec = round(last.cueInSec + (outAt - last.startSec) * last.rate);
    last.endSec = round(outAt);
    last.fadeOutSec = END_FADE_SEC;
    endsSec = outAt;
  }

  // Level every song to the set's median loudness (±, within −9…+6 dB).
  const loud = items.map((it) => Number(pool.find((t) => t.id === it.trackId).analysis.loudnessDb)).filter(Number.isFinite).sort((a, b) => a - b);
  const ref = loud.length ? loud[Math.floor(loud.length / 2)] : null;
  if (ref != null) for (const it of items) {
    const l = Number(pool.find((t) => t.id === it.trackId).analysis.loudnessDb);
    it.gainDb = Number.isFinite(l) ? round(clamp(ref - l, -9, 6), 2) : 0;
  }

  return {
    version: 1, plannerVersion: PLANNER_VERSION,
    setId: set.id || null, startsAt: new Date(startMs).toISOString(), durationSec,
    endsSec: round(endsSec), short,
    items,
  };
}

/** Every rule a stored programme breaks, against the history it was planned with. [] when clean. */
export function checkProgramme(programme, history = []) {
  const problems = [];
  const items = programme && Array.isArray(programme.items) ? programme.items : [];
  const startMs = Date.parse(programme && programme.startsAt);
  const past = (history || []).map((h) => ({ trackId: h.trackId || null, artist: h.artist || '', album: h.album || null, at: (Date.parse(h.playedAt) - startMs) / 1000 }))
    .filter((h) => Number.isFinite(h.at) && h.at < 0 && h.at > -COMPLEMENT.windowSec).sort((a, b) => a.at - b.at);
  const plays = [...past, ...items.map((it) => ({ trackId: it.trackId, artist: it.artist, album: it.album, at: it.startSec }))];
  for (const v of complementViolations(plays, { fromIndex: past.length })) problems.push(v);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!(it.rate >= 1 - BEATMATCH_MAX - 1e-6 && it.rate <= 1 + BEATMATCH_MAX + 1e-6)) problems.push({ rule: 'rate', index: i });
    if (!(it.endSec > it.startSec)) problems.push({ rule: 'empty', index: i });
    if (i && !(it.startSec >= items[i - 1].startSec)) problems.push({ rule: 'order', index: i });
    if (i && !(it.startSec <= items[i - 1].endSec + 0.01)) problems.push({ rule: 'gap', index: i });
  }
  return problems;
}
